import os from "node:os";
import path from "node:path";
import { encodeWav, prepareSpeech } from "./wav.ts";

// Kokoro-82M, run inside the game server, so every player hears a natural
// voice without an API key or another service. The model (about 180 MB)
// downloads on first use into .cache/models; after that the voice works
// offline. Lines are synthesized one at a time so the voice cannot starve the
// game server of CPU.
//
// Measured on a Core Ultra 5 125H: the 8-bit "q8" export runs at a fifth of
// real time because its integer convolutions are slow on CPU, while "uint8" on
// eight threads speaks a 4 s line in under 3 s. More threads land on
// efficiency cores and get slower again.

export type SpeechEngine = { sampleRate: number; synthesize(text: string, voice: string, speed: number): Promise<Float32Array> };
export type EngineStatus = "idle" | "loading" | "ready" | "failed";
export class VoiceBusyError extends Error {}
export class VoiceNotReadyError extends Error {}

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** One line synthesizing and three waiting; beyond that a line is refused rather than said late. */
const MAX_PENDING = 4;
const RETRY_MS = 60_000;
const CACHED_LINES = 24;

async function loadKokoro(): Promise<SpeechEngine> {
  const { env, AutoTokenizer, StyleTextToSpeech2Model } = await import("@huggingface/transformers");
  env.cacheDir = process.env.FARSHORE_MODEL_CACHE || path.join(process.cwd(), ".cache", "models");
  env.allowLocalModels = false;
  const { KokoroTTS } = await import("kokoro-js");
  const threads = Math.max(2, Math.min(8, Math.floor(os.availableParallelism() / 2)));
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(MODEL, { dtype: "uint8", device: "cpu", session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 } }),
    AutoTokenizer.from_pretrained(MODEL),
  ]);
  const tts = new KokoroTTS(model, tokenizer);
  // The first run optimizes the graph; pay for it before a player is listening.
  await tts.generate("Ready.", { voice: "bm_george" });
  return {
    sampleRate: 24000,
    async synthesize(text, voice, speed) {
      const audio = await tts.generate(text, { voice: voice as never, speed });
      return audio.audio;
    },
  };
}

type VoiceState = {
  loader: () => Promise<SpeechEngine>;
  engine: Promise<SpeechEngine> | null;
  status: EngineStatus;
  failedAt: number;
  pending: number;
  queue: Promise<unknown>;
  recent: Map<string, Uint8Array<ArrayBuffer>>;
};

// One voice per server process. A development server evaluates this module
// again every time it compiles a route, so state kept in the module would be
// forgotten: the model would load again (stalling the server for seconds each
// time) and the copies already loaded would never be freed. The state lives on
// globalThis, where every copy of this module finds the same loaded voice.
const STATE = Symbol.for("farshore.voice");
const store = globalThis as unknown as Record<symbol, VoiceState | undefined>;
const state: VoiceState = (store[STATE] ??= { loader: loadKokoro, engine: null, status: "idle", failedAt: 0, pending: 0, queue: Promise.resolve(), recent: new Map() });

export const kokoroStatus = () => state.status;

/** Starts loading the model if it is not loaded, loading, or recently failed. */
export function warmKokoro() {
  if (state.status === "loading" || state.status === "ready" || (state.status === "failed" && Date.now() - state.failedAt < RETRY_MS)) return;
  state.status = "loading";
  const load = state.loader();
  state.engine = load;
  load.then(
    () => { if (state.engine === load) state.status = "ready"; },
    error => {
      if (state.engine !== load) return;
      state.status = "failed";
      state.failedAt = Date.now();
      state.engine = null;
      console.warn(`The built-in voice could not load, so the browser's voices will be used: ${error instanceof Error ? error.message : error}`);
    },
  );
}

/** A WAV of the line. Throws VoiceNotReadyError while the model loads and VoiceBusyError when the queue is full. */
export async function speakWithKokoro(text: string, voice: string, speed: number) {
  const key = `${voice}|${speed}|${text}`, hit = state.recent.get(key);
  if (hit) return hit;
  if (state.status !== "ready" || !state.engine) {
    warmKokoro();
    throw new VoiceNotReadyError(state.status);
  }
  if (state.pending >= MAX_PENDING) throw new VoiceBusyError();
  const ready = state.engine;
  state.pending++;
  const job = state.queue.then(async () => {
    const e = await ready;
    return encodeWav(prepareSpeech(await e.synthesize(text, voice, speed), e.sampleRate), e.sampleRate);
  });
  state.queue = job.catch(() => {});
  try {
    const wav = await job;
    state.recent.set(key, wav);
    if (state.recent.size > CACHED_LINES) state.recent.delete(state.recent.keys().next().value!);
    return wav;
  } finally {
    state.pending--;
  }
}

/** Tests swap in a fake engine; null restores Kokoro. Resets all state. */
export function setKokoroLoader(next: (() => Promise<SpeechEngine>) | null) {
  state.loader = next ?? loadKokoro;
  state.engine = null;
  state.status = "idle";
  state.failedAt = 0;
  state.pending = 0;
  state.queue = Promise.resolve();
  state.recent.clear();
}
