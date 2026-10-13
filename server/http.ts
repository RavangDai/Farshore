export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", ...headers } });
export function checkWriteRequest(request: Request): Response | null {
  if (request.headers.get("origin") !== new URL(request.url).origin || ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "")) return json({ error: "Open Farshore directly to change your account." }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "A JSON request is required." }, 415);
  if (Number(request.headers.get("content-length") || 0) > 24000) return json({ error: "This request is too large." }, 413);
  return null;
}
export async function readJson(request: Request, maxBytes = 24000): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty_body");
  const decoder = new TextDecoder(); let text = "", bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > maxBytes) { await reader.cancel(); throw new Error("large_body"); } text += decoder.decode(part.value, { stream: true }); }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
export async function payloadHash(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map(n => n.toString(16).padStart(2, "0")).join("");
}
