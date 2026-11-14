import { z } from "zod/v3";
import { voices } from "../src/lib/arcade/rivals.ts";
import { pronounce } from "../src/lib/speech/lexicon.ts";
import { isFixedPiece } from "../src/lib/story/spoken-lines.ts";
import { ByteLru, DTYPE_MB, VoiceAbortedError, VoiceBusyError, kokoroOptions, kokoroProgress, kokoroStatus, speakWithKokoro, warmKokoro, type CacheSource } from "./lib/kokoro.ts";

// Spoken lines. By default Kokoro-82M runs inside this server (lib/kokoro.ts).
// FARSHORE_TTS_URL points at any OpenAI-compatible /v1/audio/speech server
// instead, such as the one the Colab notebook starts. FARSHORE_TTS=browser
// leaves speech to the browser's own voices.
const input = z.object({
  text: z.string().trim().min(1).max(220),
  voice: z.enum(Object.keys(voices) as [keyof typeof voices, ...(keyof typeof voices)[]]),
  /** "prime" asks for a line ahead of time; it waits behind every line someone is listening for. */
  priority: z.enum(["live", "prime"]).optional(),
}).strict();

export type VoiceEngine = "builtin" | "remote" | "browser";

export function voiceConfig(env: Record<string, string | undefined> = process.env) {
  const engine: VoiceEngine = /^(browser|off|none)$/i.test(env.FARSHORE_TTS || "") ? "browser" : env.FARSHORE_TTS_URL ? "remote" : "builtin";
  return { engine, url: env.FARSHORE_TTS_URL, model: env.FARSHORE_TTS_MODEL || "kokoro", key: env.FARSHORE_TTS_KEY || env.FARSHORE_API_KEY };
}

/** Lines a remote voice server already spoke, so a repeat costs no round trip. */
const REMOTE = Symbol.for("farshore.voice.remote");
const remoteCache: ByteLru = ((globalThis as Record<symbol, unknown>)[REMOTE] ??= new ByteLru(16 * 1024 * 1024)) as ByteLru;

/** Which voice the game will hear. Asking also starts loading the built-in model. */
export async function GET() {
  const { engine } = voiceConfig();
  if (engine === "builtin") warmKokoro();
  const status = engine === "builtin" ? kokoroStatus() : null;
  const body: Record<string, unknown> = { neural: engine === "remote" || (engine === "builtin" && status !== "failed"), engine, ready: engine === "remote" || status === "ready" };
  if (status === "loading") { body.progress = Math.round(kokoroProgress() * 100) / 100; body.sizeMb = DTYPE_MB[kokoroOptions().dtype]; }
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
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
  const profile = voices[data.voice], spoken = pronounce(data.text), priority = data.priority ?? "live";
  if (c.engine === "builtin") {
    let source: CacheSource = "miss";
    try {
      const wav = await speakWithKokoro(spoken, profile.kokoro, profile.speed, {
        priority,
        signal: request.signal,
        persist: isFixedPiece(data.text, data.voice),
        onSource: s => { source = s; },
      });
      return new Response(wav, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store", "X-Voice-Cache": source } });
    } catch (error) {
      if (error instanceof VoiceAbortedError) return new Response(null, { status: 499 });
      // The browser speaks this line itself; the next one may be neural.
      const busy = error instanceof VoiceBusyError;
      return Response.json({ error: busy ? "The voice is busy." : "The voice is still loading." }, { status: 503, headers: busy ? { "Retry-After": "2" } : {} });
    }
  }
  const key = `${profile.kokoro}|${profile.speed}|${spoken}`, hit = remoteCache.get(key);
  if (hit) return new Response(hit, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store", "X-Voice-Cache": "memory" } });
  try {
    const response = await fetch(c.url!, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(c.key ? { Authorization: "Bearer " + c.key } : {}) },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
      body: JSON.stringify({ model: c.model, input: spoken, voice: profile.kokoro, response_format: "wav", speed: profile.speed }),
    });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !/^audio\//.test(type)) return Response.json({ error: "The voice server could not speak this line." }, { status: 502 });
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.byteLength > 2_000_000) return Response.json({ error: "The voice line was too long." }, { status: 502 });
    if (type === "audio/wav" || type === "audio/x-wav") remoteCache.set(key, audio);
    return new Response(audio, { headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Voice-Cache": "miss" } });
  } catch {
    return Response.json({ error: "The voice server is not reachable." }, { status: 503 });
  }
}
