import { z } from "zod/v3";
import { checkWriteRequest, json, readJson } from "./http.ts";
const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), email, password: z.string().min(1).max(128) }).strict(),
  z.object({ action: z.literal("signup"), email, password, displayName: z.string().trim().min(2).max(40).regex(/^[^\x00-\x1f\x7f]+$/) }).strict(),
  z.object({ action: z.literal("recover"), email }).strict(),
  z.object({ action: z.literal("password"), password, token: z.string().min(1).max(512) }).strict(),
  z.object({ action: z.literal("logout") }).strict(),
]);
export function createAuthApi(auth: { handler: (request: Request) => Promise<Response> }, origin: string) {
  return async function POST(request: Request) {
    const invalid = checkWriteRequest(request); if (invalid) return invalid;
    let input;
    try { input = schema.parse(await readJson(request, 5000)); }
    catch (error) { return json({ error: "Check your details. New passwords must be 12 to 128 characters." }, error instanceof Error && error.message === "large_body" ? 413 : 400); }
    try {
      const action = input.action;
      const path = action === "login" ? "sign-in/email" : action === "signup" ? "sign-up/email" : action === "recover" ? "request-password-reset" : action === "password" ? "reset-password" : "sign-out";
      const body = action === "login" ? { email: input.email, password: input.password, rememberMe: true }
        : action === "signup" ? { name: input.displayName, email: input.email, password: input.password, callbackURL: origin + "/?auth=confirmed" }
        : action === "recover" ? { email: input.email, redirectTo: origin + "/account/reset-password" }
        : action === "password" ? { newPassword: input.password, token: input.token } : {};
      const result = await auth.handler(new Request(new URL("/api/auth/" + path, origin), {
        method: "POST", headers: request.headers, body: JSON.stringify(body),
      }));
      if (!result.ok) {
        const status = result.status === 429 ? 429 : action === "login" ? 401 : 400;
        return json({ error: status === 429 ? "Too many attempts. Wait a minute and retry." : action === "login" ? "The email or password is incorrect, or the email has not been confirmed." : action === "password" ? "This reset link is invalid or expired. Request another reset email." : "The request could not be completed. Try again." }, status, status === 429 ? { "Retry-After": "60" } : {});
      }
      const data = await result.json();
      const response = json(action === "login" ? { player: { id: data.user.id, displayName: data.user.name, email: data.user.email } }
        : action === "signup" ? { player: null, message: "Check your email to confirm your account." }
        : action === "recover" ? { message: "If an account uses that email, a password reset link will arrive shortly." }
        : action === "password" ? { message: "Your password has been updated. Sign in with the new password." } : { player: null });
      for (const cookie of result.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
      return response;
    } catch { return json({ error: "Sign-in is temporarily unavailable. Try again." }, 503); }
  }
}
