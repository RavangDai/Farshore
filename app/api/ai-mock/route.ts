import { mockCookie, mockModes, MOCK_COOKIE, type MockMode } from "../../../server/lib/mock-ai";
import { runtimeConfig } from "../../../server/lib/runtime-config";
export const dynamic = "force-dynamic";

const notes: Record<MockMode | "off", string> = {
  off: "Live model (normal play)",
  success: "Strategy ready after about 1.5 s",
  slow: "Strategy ready after about 12 s (loading state)",
  uncertain: "Every strategy is rejected as unverifiable (low-confidence state)",
  "uncertain-once": "The next strategy is rejected, then the retry succeeds",
  error: "Every strategy request fails (error state)",
  "error-once": "The next strategy request fails, then the retry succeeds",
  offline: "The model service is reported unreachable",
};

/** Moderator switch for the test-only mock AI service. Local servers only. */
export function GET(request: Request) {
  if (!runtimeConfig().local) return new Response("Not found", { status: 404 });
  const url = new URL(request.url), requested = url.searchParams.get("mode");
  const valid = requested === "off" || mockModes.includes(requested as MockMode);
  const current = valid ? requested : request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${MOCK_COOKIE}=([a-z-]+)`))?.[1] || "off";
  const rows = (["off", ...mockModes] as const).map(mode => `<li><a href="?mode=${mode}"${mode === current ? ' aria-current="true"' : ""}>${mode}</a> ${notes[mode]}</li>`).join("");
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mock AI switch</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:24px;max-width:640px;color:#102e40;background:#f5f8f9}a{color:#126978;font-weight:700}a[aria-current]{background:#126978;color:#fff;padding:0 6px;border-radius:4px}li{margin:6px 0}</style></head>
<body><h1>Mock AI service</h1><p>Current mode: <strong>${current}</strong>${process.env.FARSHORE_AI_MOCK ? ` (overridden by FARSHORE_AI_MOCK=${process.env.FARSHORE_AI_MOCK})` : ""}</p>
<p>Applies to this browser window. The game picks it up on its next AI request, and the status re-check runs every 15 seconds.</p><ul>${rows}</ul></body></html>`;
  const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  if (valid) headers["Set-Cookie"] = mockCookie(requested as MockMode | "off");
  return new Response(page, { headers });
}
