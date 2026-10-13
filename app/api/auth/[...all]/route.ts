import { getAuth } from "../../../../lib/auth";
import { json } from "../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const path = new URL(request.url).pathname;
  if (request.method !== "GET" || !(path === "/api/auth/verify-email" || path.startsWith("/api/auth/reset-password/"))) return json({ error: "Not found." }, 404);
  try {
    const auth = await getAuth();
    if (!auth) return json({ error: "Accounts are being set up. You can play on this device.", code: "not_configured" }, 503);
    return auth.handler(request);
  } catch { return json({ error: "Sign-in is temporarily unavailable. Try again." }, 503); }
}
export const GET = handle;
export const POST = handle;
