import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));
  const development = process.env.NODE_ENV !== "production";
  const policy = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
    `connect-src 'self'${development ? " ws: wss:" : ""}`, "media-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("content-security-policy", policy); headers.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), geolocation=(), payment=()");
  if (!development) response.headers.set("Strict-Transport-Security", "max-age=31536000");
  if (request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname.startsWith("/auth/") || request.nextUrl.pathname.startsWith("/account/")) response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|art/|fonts/|favicon.ico).*)"] };
