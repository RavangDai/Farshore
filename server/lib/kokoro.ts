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

let loader: () => Promise<SpeechEngine> = loadKokoro;
let engine: Promise<SpeechEngine> | null = null;
let status: EngineStatus = "idle";
let failedAt = 0;
let pending = 0;
let queue: Promise<unknown> = Promise.resolve();
const recent = new Map<string, Uint8Array<ArrayBuffer>>();

export const kokoroStatus = () => status;

/** Starts loading the model if it is not loaded, loading, or recently failed. */
export function warmKokoro() {
  if (status === "loading" || status === "ready" || (status === "failed" && Date.now() - failedAt < RETRY_MS)) return;
  status = "loading";
  const load = loader();
  engine = load;
  load.then(
    () => { if (engine === load) status = "ready"; },
    error => {
      if (engine !== load) return;
      status = "failed";
      failedAt = Date.now();
      engine = null;
      console.warn(`The built-in voice could not load, so the browser's voices will be used: ${error instanceof Error ? error.message : error}`);
    },
  );
}

/** A WAV of the line. Throws VoiceNotReadyError while the model loads and VoiceBusyError when the queue is full. */
export async function speakWithKokoro(text: string, voice: string, speed: number) {
  const key = `${voice}|${speed}|${text}`, hit = recent.get(key);
  if (hit) return hit;
  if (status !== "ready" || !engine) {
    warmKokoro();
    throw new VoiceNotReadyError(status);
  }
  if (pending >= MAX_PENDING) throw new VoiceBusyError();
  const ready = engine;
  pending++;
  const job = queue.then(async () => {
    const e = await ready;
    return encodeWav(prepareSpeech(await e.synthesize(text, voice, speed), e.sampleRate), e.sampleRate);
  });
  queue = job.catch(() => {});
  try {
    const wav = await job;
    recent.set(key, wav);
    if (recent.size > CACHED_LINES) recent.delete(recent.keys().next().value!);
    return wav;
  } finally {
    pending--;
  }
}

/** Tests swap in a fake engine; null restores Kokoro. Resets all state. */
export function setKokoroLoader(next: (() => Promise<SpeechEngine>) | null) {
  loader = next ?? loadKokoro;
  engine = null;
  status = "idle";
  failedAt = 0;
  pending = 0;
  queue = Promise.resolve();
  recent.clear();
}
