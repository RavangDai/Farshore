import { betterAuth } from "better-auth/minimal";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import nodemailer from "nodemailer";
import type { Db, MongoClient } from "mongodb";
import { accountsConfigured, authMethods, runtimeConfig } from "./runtime-config.ts";
import { database } from "./mongodb.ts";
import { consumeLimit } from "./rate-limit.ts";
import type { OnlinePlayer } from "../../src/lib/online/online.ts";

type Mail = { to: string; subject: string; text: string };
type AuthConfig = { db: Db; client: MongoClient; secret: string; baseURL: string; sendMail?: (mail: Mail) => Promise<void>; google?: { clientId: string; clientSecret: string } };
// Google names are free text; hold them to the sign-up form's display name rules.
function displayName(name: unknown) {
  const clean = Array.from(typeof name === "string" ? name.replace(/[\x00-\x1f\x7f]/g, "").trim() : "").slice(0, 40).join("").trim();
  return clean.length >= 2 ? clean : "Sailor";
}
export function createAuth({ db, client, secret, baseURL, sendMail, google }: AuthConfig) {
  return betterAuth({
    database: mongodbAdapter(db, { client }),
    secret, baseURL, basePath: "/api/auth",
    trustedOrigins: [new URL(baseURL).origin],
    // Failed Google sign-ins return to the game's account dialog, not Better Auth's error page.
    onAPIError: { errorURL: new URL("/?auth=google", baseURL).toString() },
    socialProviders: google ? {
      google: { ...google, prompt: "select_account", mapProfileToUser: profile => ({ name: displayName(profile.name) }) },
    } : undefined,
    emailAndPassword: !sendMail ? { enabled: false } : {
      enabled: true, minPasswordLength: 12, maxPasswordLength: 128,
      requireEmailVerification: true, autoSignIn: false, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({ to: user.email, subject: "Reset your Farshore password", text: `Choose a new password: ${url}\n\nIf you didn't request this, ignore this email.` });
      },
    },
    emailVerification: !sendMail ? undefined : {
      sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({ to: user.email, subject: "Confirm your Farshore account", text: `Confirm your email to sign in to Farshore: ${url}\n\nThis link expires in one hour.` });
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: {
      cookiePrefix: "farshore",
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      useSecureCookies: new URL(baseURL).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    rateLimit: {
      enabled: true, window: 60, max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/sign-in/social": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
      customStorage: {
        consume: async (key, rule) => {
          const allowed = await consumeLimit(db, `auth:${key}`, rule.max, rule.window);
          return { allowed, retryAfter: allowed ? null : rule.window };
        },
      },
    },
  });
}
let cached: ReturnType<typeof createAuth> | undefined;
export async function getAuth() {
  if (!accountsConfigured()) return null;
  if (!cached) {
    const config = runtimeConfig(), methods = authMethods(), connection = await database();
    if (!connection) return null;
    const url = new URL(config.appUrl!);
    if (!config.local && url.protocol !== "https:") throw new Error("HTTPS is required for hosted accounts.");
    const transport = methods.email ? nodemailer.createTransport({
      host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
      requireTLS: !config.local,
      ...(config.smtpUser ? { auth: { user: config.smtpUser, pass: config.smtpPassword } } : {}),
    }) : null;
    cached = createAuth({ ...connection, secret: config.authSecret!, baseURL: config.appUrl!,
      sendMail: transport ? async mail => {
        // The Node process completes delivery without exposing SMTP timing to signup/reset callers.
        void transport.sendMail({ ...mail, from: config.mailFrom }).catch(() => console.error("Farshore account email delivery failed."));
      } : undefined,
      google: methods.google ? { clientId: config.googleClientId!, clientSecret: config.googleClientSecret! } : undefined });
  }
  return cached;
}
export async function verifiedPlayer(request: Request): Promise<OnlinePlayer | null> {
  const auth = await getAuth();
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user.emailVerified) return null;
  return { id: session.user.id, displayName: session.user.name, email: session.user.email };
}
