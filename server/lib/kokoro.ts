import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadWithoutFatalHandlers } from "./process-guard.ts";
import { DSP_VERSION, encodeWav, prepareSpeech } from "./wav.ts";

// Kokoro-82M, run inside the game server, so every player hears a natural
// voice without an API key or another service. The model downloads on first
// use into .cache/models; after that the voice works offline. Lines are
// synthesized one at a time so the voice cannot starve the game server of CPU.
//
// Measured on a Core Ultra 5 125H: the 8-bit "q8" export runs at a fifth of
// real time because its integer convolutions are slow on CPU, while "uint8" on
// eight threads speaks a 4 s line in under 3 s. More threads land on
// efficiency cores and get slower again. `scripts/voice-bench.mjs` measures
// the other exports; FARSHORE_TTS_DTYPE and FARSHORE_TTS_THREADS override.
//
// Speed comes from four things here: the model is warmed when the server
// boots (instrumentation.ts), lines the game will certainly say are kept on
// disk, a line someone is waiting to hear always goes ahead of one fetched
// early, and a line nobody is waiting for any more is dropped from the queue.

export type SpeechEngine = { sampleRate: number; synthesize(text: string, voice: string, speed: number): Promise<Float32Array> };
export type EngineStatus = "idle" | "loading" | "ready" | "failed";
export type Priority = "live" | "prime";
export type CacheSource = "memory" | "disk" | "miss";
export class VoiceBusyError extends Error {}
export class VoiceNotReadyError extends Error {}
export class VoiceAbortedError extends Error {}

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export type KokoroDtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16" | "uint8" | "uint8f16";
const DTYPES = new Set<KokoroDtype>(["fp32", "fp16", "q8", "q4", "q4f16", "uint8", "uint8f16"]);
/** Approximate download size of each export, for the loading message. */
export const DTYPE_MB: Record<KokoroDtype, number> = { fp32: 326, fp16: 163, q8: 92, q4: 305, q4f16: 155, uint8: 177, uint8f16: 114 };
const DEFAULT_DTYPE: KokoroDtype = "uint8";

/** One line synthesizing and three waiting; beyond that a line is refused rather than said late. */
const MAX_LIVE = 4;
/** Lines fetched ahead of time; the oldest is dropped when more arrive. */
const MAX_PRIME = 12;
const RETRY_MS = 60_000;
/** Recently spoken lines kept in memory, by size: about four minutes of speech. */
const CACHE_BYTES = 24 * 1024 * 1024;

export function kokoroOptions(env: Record<string, string | undefined> = process.env) {
  const asked = (env.FARSHORE_TTS_DTYPE || "").trim() as KokoroDtype;
  const dtype = DTYPES.has(asked) ? asked : DEFAULT_DTYPE;
  const wanted = Number.parseInt(env.FARSHORE_TTS_THREADS || "", 10);
  const threads = Number.isFinite(wanted) && wanted > 0 ? Math.min(wanted, 32) : Math.max(2, Math.min(8, Math.floor(os.availableParallelism() / 2)));
  return { dtype, threads };
}

type EngineOptions = { dtype?: KokoroDtype; threads?: number; onProgress?: (fraction: number) => void; warmup?: boolean };

/** Loads Kokoro and runs it once, so the first real line does not pay for graph optimization. */
export async function createKokoroEngine(options: EngineOptions = {}): Promise<SpeechEngine> {
  const { dtype, threads } = { ...kokoroOptions(), ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) } as { dtype: KokoroDtype; threads: number };
  const { env, AutoTokenizer, StyleTextToSpeech2Model } = await import("@huggingface/transformers");
  env.cacheDir = process.env.FARSHORE_MODEL_CACHE || path.join(process.cwd(), ".cache", "models");
  env.allowLocalModels = false;
  // kokoro-js loads phonemizer, which would make every stray server error fatal (see process-guard.ts).
  const { KokoroTTS } = await loadWithoutFatalHandlers(() => import("kokoro-js"));
  // Download progress, by bytes across every file the model needs.
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (event: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (event.status !== "progress" || !event.file || !event.total) return;
    files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
    let loaded = 0, total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    options.onProgress?.(total ? loaded / total : 0);
  };
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(KOKORO_MODEL, {
      dtype,
      device: "cpu",
      progress_callback,
      session_options: { intraOpNumThreads: threads, interOpNumThreads: 1, graphOptimizationLevel: "all", executionMode: "sequential", enableCpuMemArena: true },
    } as never),
    AutoTokenizer.from_pretrained(KOKORO_MODEL, { progress_callback } as never),
  ]);
  const tts = new KokoroTTS(model, tokenizer);
  if (options.warmup !== false) {
    // The first runs optimize the graph for short and longer inputs; pay for
    // that before a player is listening.
    await tts.generate("Ready.", { voice: "bm_george" });
    await tts.generate("The sea is wide, and the way home is long, but the ship is sound and the crew is ready.", { voice: "bm_george" });
  }
  return {
    sampleRate: 24000,
    async synthesize(text, voice, speed) {
      const audio = await tts.generate(text, { voice: voice as never, speed });
      return audio.audio;
    },
  };
}

/** Least recently used, capped by total bytes. */
export class ByteLru {
  private map = new Map<string, Uint8Array<ArrayBuffer>>();
  private bytes = 0;
  private readonly limit: number;
  constructor(limit: number) { this.limit = limit; }
  get size() { return this.map.size; }
  get(key: string) {
    const hit = this.map.get(key);
    if (hit) { this.map.delete(key); this.map.set(key, hit); }
    return hit;
  }
  set(key: string, value: Uint8Array<ArrayBuffer>) {
    const old = this.map.get(key);
    if (old) { this.bytes -= old.byteLength; this.map.delete(key); }
    this.map.set(key, value);
    this.bytes += value.byteLength;
    while (this.bytes > this.limit && this.map.size > 1) {
      const [oldest, data] = this.map.entries().next().value!;
      this.map.delete(oldest);
      this.bytes -= data.byteLength;
    }
  }
  clear() { this.map.clear(); this.bytes = 0; }
}

type Job = {
  key: string; text: string; voice: string; speed: number; priority: Priority; persist: boolean;
  waiters: number; started: boolean; promise: Promise<Uint8Array<ArrayBuffer>>;
  resolve(wav: Uint8Array<ArrayBuffer>): void; reject(error: unknown): void;
};

type VoiceState = {
  loader: () => Promise<SpeechEngine>;
  engine: SpeechEngine | null;
  loading: Promise<SpeechEngine> | null;
  status: EngineStatus;
  progress: number;
  failedAt: number;
  live: Job[];
  prime: Job[];
  running: Job | null;
  inflight: Map<string, Job>;
  recent: ByteLru;
  ready: Set<() => void>;
};

// One voice per server process. A development server evaluates this module
// again every time it compiles a route, so state kept in the module would be
// forgotten: the model would load again (stalling the server for seconds each
// time) and the copies already loaded would never be freed. The state lives on
// globalThis, where every copy of this module finds the same loaded voice.
// (v2: the queue changed shape; a running dev server must not reuse the old one.)
const STATE = Symbol.for("farshore.voice.v2");
const store = globalThis as unknown as Record<symbol, VoiceState | undefined>;
const defaultLoader = () => createKokoroEngine({ onProgress: p => { state.progress = p; } });
const state: VoiceState = (store[STATE] ??= {
  loader: defaultLoader, engine: null, loading: null, status: "idle", progress: 0, failedAt: 0,
  live: [], prime: [], running: null, inflight: new Map(), recent: new ByteLru(CACHE_BYTES), ready: new Set(),
});

export const kokoroStatus = () => state.status;
/** Download progress of the model while it loads, 0 to 1. */
export const kokoroProgress = () => (state.status === "ready" ? 1 : state.progress);

/** Calls back once the model is ready (at once if it already is). */
export function onKokoroReady(callback: () => void) {
  if (state.status === "ready") { callback(); return () => {}; }
  state.ready.add(callback);
  return () => { state.ready.delete(callback); };
}

/** Starts loading the model if it is not loaded, loading, or recently failed. */
export function warmKokoro() {
  if (state.status === "loading" || state.status === "ready" || (state.status === "failed" && Date.now() - state.failedAt < RETRY_MS)) return;
  state.status = "loading";
  state.progress = 0;
  const load = state.loader();
  state.loading = load;
  load.then(
    engine => {
      if (state.loading !== load) return;
      state.engine = engine;
      state.status = "ready";
      for (const callback of [...state.ready]) { state.ready.delete(callback); try { callback(); } catch { /* A listener's problem. */ } }
      pump();
    },
    error => {
      if (state.loading !== load) return;
      state.status = "failed";
      state.failedAt = Date.now();
      state.loading = null;
      console.warn(`The built-in voice could not load, so the browser's voices will be used: ${error instanceof Error ? error.message : error}`);
    },
  );
}

const cacheDir = () => process.env.FARSHORE_VOICE_CACHE || path.join(process.cwd(), ".cache", "voice");
function fingerprint(text: string, voice: string, speed: number) {
  const { dtype } = kokoroOptions();
  return createHash("sha1").update(`${KOKORO_MODEL}|${dtype}|${DSP_VERSION}|${voice}|${speed}|${text}`).digest("hex");
}
async function fromDisk(key: string) {
  try { return new Uint8Array(await readFile(path.join(cacheDir(), key + ".wav"))) as Uint8Array<ArrayBuffer>; } catch { return null; }
}
async function toDisk(key: string, wav: Uint8Array<ArrayBuffer>) {
  try {
    const dir = cacheDir(), file = path.join(dir, key + ".wav"), temp = `${file}.${process.pid}.tmp`;
    await mkdir(dir, { recursive: true });
    await writeFile(temp, wav);
    await rename(temp, file);
  } catch { /* A read-only disk only costs speed. */ }
}

function pump() {
  if (state.running || state.status !== "ready" || !state.engine) return;
  const job = state.live.shift() ?? state.prime.shift();
  if (!job) return;
  state.running = job;
  job.started = true;
  const engine = state.engine;
  void (async () => {
    try {
      const wav = encodeWav(prepareSpeech(await engine.synthesize(job.text, job.voice, job.speed), engine.sampleRate), engine.sampleRate);
      state.recent.set(job.key, wav);
      if (job.persist) await toDisk(job.key, wav);
      job.resolve(wav);
    } catch (error) {
      job.reject(error);
    } finally {
      state.inflight.delete(job.key);
      state.running = null;
      pump();
    }
  })();
}

function remove(job: Job) {
  for (const queue of [state.live, state.prime]) {
    const at = queue.indexOf(job);
    if (at >= 0) queue.splice(at, 1);
  }
  state.inflight.delete(job.key);
}

const liveCount = () => state.live.length + (state.running?.priority === "live" ? 1 : 0);

export type SpeakOptions = { priority?: Priority; signal?: AbortSignal; persist?: boolean; onSource?: (source: CacheSource) => void };

/**
 * A WAV of the line. Throws VoiceNotReadyError while the model loads,
 * VoiceBusyError when the queue is full, and VoiceAbortedError when the caller
 * stopped waiting. A line asked for twice is synthesized once.
 */
export async function speakWithKokoro(text: string, voice: string, speed: number, options: SpeakOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const { priority = "live", signal, persist = false, onSource } = options;
  const key = fingerprint(text, voice, speed), hit = state.recent.get(key);
  if (hit) { onSource?.("memory"); return hit; }
  if (persist) {
    const saved = await fromDisk(key);
    if (saved) { state.recent.set(key, saved); onSource?.("disk"); return saved; }
  }
  if (state.status !== "ready" || !state.engine) {
    warmKokoro();
    throw new VoiceNotReadyError(state.status);
  }
  if (signal?.aborted) throw new VoiceAbortedError();
  let job = state.inflight.get(key);
  if (job) {
    // Someone is now waiting for a line that was fetched early: move it up.
    if (priority === "live" && job.priority === "prime" && !job.started) {
      if (liveCount() >= MAX_LIVE) throw new VoiceBusyError();
      state.prime.splice(state.prime.indexOf(job), 1);
      job.priority = "live";
      state.live.push(job);
    }
    job.persist ||= persist;
  } else {
    if (priority === "live" && liveCount() >= MAX_LIVE) throw new VoiceBusyError();
    let resolve!: Job["resolve"], reject!: Job["reject"];
    const promise = new Promise<Uint8Array<ArrayBuffer>>((yes, no) => { resolve = yes; reject = no; });
    promise.catch(() => {});
    job = { key, text, voice, speed, priority, persist, waiters: 0, started: false, promise, resolve, reject };
    state.inflight.set(key, job);
    if (priority === "live") state.live.push(job);
    else {
      state.prime.push(job);
      while (state.prime.length > MAX_PRIME) {
        const dropped = state.prime.shift()!;
        state.inflight.delete(dropped.key);
        dropped.reject(new VoiceBusyError());
      }
    }
    pump();
  }
  const mine = job;
  mine.waiters++;
  onSource?.("miss");
  try {
    if (!signal) return await mine.promise;
    return await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const abort = () => {
        reject(new VoiceAbortedError());
        // Nobody is waiting for it now: a queued line is dropped. A line already
        // being synthesized finishes, and is cached for whoever asks next.
        if (mine.waiters <= 1 && !mine.started) { remove(mine); mine.reject(new VoiceAbortedError()); }
      };
      signal.addEventListener("abort", abort, { once: true });
      mine.promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  } finally {
    mine.waiters--;
  }
}

/** Tests swap in a fake engine; null restores Kokoro. Resets all state. */
export function setKokoroLoader(next: (() => Promise<SpeechEngine>) | null) {
  for (const job of [...state.live, ...state.prime]) job.reject(new VoiceAbortedError());
  state.loader = next ?? defaultLoader;
  state.engine = null;
  state.loading = null;
  state.status = "idle";
  state.progress = 0;
  state.failedAt = 0;
  state.live = [];
  state.prime = [];
  state.running = null;
  state.inflight.clear();
  state.recent.clear();
  state.ready.clear();
}
