import { z } from "zod/v3";
import { voices } from "../src/lib/arcade/rivals.ts";
import { VoiceBusyError, kokoroStatus, speakWithKokoro, warmKokoro } from "./lib/kokoro.ts";

// Spoken lines. By default Kokoro-82M runs inside this server (lib/kokoro.ts).
// FARSHORE_TTS_URL points at any OpenAI-compatible /v1/audio/speech server
// instead, such as the one the Colab notebook starts. FARSHORE_TTS=browser
// leaves speech to the browser's own voices.
const input = z.object({
  text: z.string().trim().min(1).max(220),
  voice: z.enum(Object.keys(voices) as [keyof typeof voices, ...(keyof typeof voices)[]]),
}).strict();

export type VoiceEngine = "builtin" | "remote" | "browser";

export function voiceConfig(env: Record<string, string | undefined> = process.env) {
  const engine: VoiceEngine = /^(browser|off|none)$/i.test(env.FARSHORE_TTS || "") ? "browser" : env.FARSHORE_TTS_URL ? "remote" : "builtin";
  return { engine, url: env.FARSHORE_TTS_URL, model: env.FARSHORE_TTS_MODEL || "kokoro", key: env.FARSHORE_TTS_KEY || env.FARSHORE_API_KEY };
}

/** Which voice the game will hear. Asking also starts loading the built-in model. */
export async function GET() {
  const { engine } = voiceConfig();
  if (engine === "builtin") warmKokoro();
  const status = engine === "builtin" ? kokoroStatus() : null;
  return Response.json(
    { neural: engine === "remote" || (engine === "builtin" && status !== "failed"), engine, ready: engine === "remote" || status === "ready" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Voice requests must come from Farshore." }, { status: 403 });
  const c = voiceConfig();
  if (c.engine === "browser") return Response.json({ error: "The neural voice is turned off." }, { status: 503 });
  let data: z.infer<typeof input>;
  try {
    const raw = await request.text();
    if (raw.length > 1000) return Response.json({ error: "Voice request is too large." }, { status: 413 });
    data = input.parse(JSON.parse(raw));
  } catch { return Response.json({ error: "Unsupported voice request." }, { status: 400 }); }
  const profile = voices[data.voice];
  if (c.engine === "builtin") {
    try {
      const wav = await speakWithKokoro(data.text, profile.kokoro, profile.speed);
      return new Response(wav, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
    } catch (error) {
      // The browser speaks this line itself; the next one may be neural.
      const busy = error instanceof VoiceBusyError;
      return Response.json({ error: busy ? "The voice is busy." : "The voice is still loading." }, { status: 503, headers: busy ? { "Retry-After": "2" } : {} });
    }
  }
  try {
    const response = await fetch(c.url!, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(c.key ? { Authorization: "Bearer " + c.key } : {}) },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
      body: JSON.stringify({ model: c.model, input: data.text, voice: profile.kokoro, response_format: "mp3", speed: profile.speed }),
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
