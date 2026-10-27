import { z } from "zod/v3";
import { voices } from "../src/lib/rivals.ts";

// Optional neural voice. Any OpenAI-compatible /v1/audio/speech server works,
// for example Kokoro-FastAPI on your own machine or in the Colab notebook. When
// none is configured the browser's built-in speech voices the commentary.
const input = z.object({
  text: z.string().trim().min(1).max(220),
  voice: z.enum(Object.keys(voices) as [keyof typeof voices, ...(keyof typeof voices)[]]),
}).strict();

function config() {
  const e = process.env;
  return { url: e.FARSHORE_TTS_URL, model: e.FARSHORE_TTS_MODEL || "kokoro", key: e.FARSHORE_TTS_KEY || e.FARSHORE_API_KEY };
}

export async function GET() {
  return Response.json({ neural: !!config().url }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Voice requests must come from Farshore." }, { status: 403 });
  const c = config();
  if (!c.url) return Response.json({ error: "No voice server is configured." }, { status: 503 });
  let data: z.infer<typeof input>;
  try {
    const raw = await request.text();
    if (raw.length > 1000) return Response.json({ error: "Voice request is too large." }, { status: 413 });
    data = input.parse(JSON.parse(raw));
  } catch { return Response.json({ error: "Unsupported voice request." }, { status: 400 }); }
  try {
    const response = await fetch(c.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(c.key ? { Authorization: "Bearer " + c.key } : {}) },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
      body: JSON.stringify({ model: c.model, input: data.text, voice: voices[data.voice].kokoro, response_format: "mp3", speed: 1 }),
    });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !/^audio\//.test(type)) return Response.json({ error: "The voice server could not speak this line." }, { status: 502 });
    const audio = await response.arrayBuffer();
    if (audio.byteLength > 2_000_000) return Response.json({ error: "The voice line was too long." }, { status: 502 });
    return new Response(audio, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The voice server is not reachable." }, { status: 503 });
  }
}
