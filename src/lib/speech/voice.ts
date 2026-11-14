import { voices, type VoiceId } from "../arcade/rivals.ts";
import { SPLIT } from "../story/spoken-lines.ts";
import { pickBrowserVoice } from "./browser-voices.ts";
import { pauseAfter, sentences } from "./sentences.ts";
import { playWithFx, type Playback } from "./voice-fx.ts";

export { sentences } from "./sentences.ts";

export const VOICE_PREFS = "farshore-voice-v1";
export type VoicePrefs = { commentary: boolean; voice: boolean; volume: number };
export const defaultVoicePrefs: VoicePrefs = { commentary: true, voice: true, volume: 0.9 };

export function readVoicePrefs(): VoicePrefs {
  try {
    const v = JSON.parse(localStorage.getItem(VOICE_PREFS) || "null");
    if (v && typeof v === "object")
      return {
        commentary: typeof v.commentary === "boolean" ? v.commentary : defaultVoicePrefs.commentary,
        voice: typeof v.voice === "boolean" ? v.voice : defaultVoicePrefs.voice,
        volume: typeof v.volume === "number" && v.volume >= 0 && v.volume <= 1 ? v.volume : defaultVoicePrefs.volume,
      };
  } catch { /* Storage is optional. */ }
  return { ...defaultVoicePrefs };
}

/**
 * checking: asking the server. loading: the natural voice is being prepared
 * (the first run downloads it). neural: natural voices are ready. browser: the
 * server leaves speech to the browser. unavailable: the natural voice failed
 * to load, so the browser speaks for now.
 */
export type VoiceStatus = "checking" | "loading" | "neural" | "browser" | "unavailable";
/** How far the natural voice has downloaded, while it loads. */
export type VoiceLoad = { progress: number; sizeMb: number | null };

type Line = { text: string; voice: VoiceId; at: number };
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export type VoiceBoxOptions = {
  /** How soon the server is asked again while its answer may still change. */
  pollMs?: number;
  /** The same, while the natural voice is loading: it is usually seconds away. */
  loadingPollMs?: number;
  /** How long a line waits for a loading natural voice before the browser reads it. */
  readyWaitMs?: number;
};

/** Lines fetched ahead of time, by size: about a minute of speech. */
const PRIMED_BYTES = 6 * 1024 * 1024;

/**
 * Speaks lines one at a time. Natural Kokoro voices come from the game server
 * and play through each character's voice chain; when they are unavailable the
 * browser's best natural voice reads the line instead. Lines that wait too long
 * are dropped, so the voice never narrates something that already passed.
 * Lines the game knows in advance can be primed, so they play without a wait.
 */
export class VoiceBox {
  private queue: Line[] = [];
  private speaking = false;
  private status: VoiceStatus = "checking";
  private load: VoiceLoad = { progress: 0, sizeMb: null };
  private context: AudioContext | null = null;
  private playback: Playback | null = null;
  private element: HTMLAudioElement | null = null;
  private volume = defaultVoicePrefs.volume;
  private browserVoices: SpeechSynthesisVoice[] = [];
  private assigned = new Map<VoiceId, string>();
  private speakingListener: ((speaking: boolean) => void) | null = null;
  private statusListener: ((status: VoiceStatus) => void) | null = null;
  private loadListener: ((load: VoiceLoad) => void) | null = null;
  private readyWaiters = new Set<() => void>();
  private generation = 0;
  private poll: ReturnType<typeof setTimeout> | null = null;
  private pollUntil = 0;
  private asked = 0;
  private disposed = false;
  private fetcher: Fetcher;
  private pollMs: number;
  private loadingPollMs: number;
  private readyWaitMs: number;
  /** The fetches of the line being spoken; stop() cancels them. */
  private live = new AbortController();
  private primed = new Map<string, ArrayBuffer>();
  private primedBytes = 0;
  private inflight = new Map<string, Promise<ArrayBuffer | null>>();

  constructor(fetcher: Fetcher = (input, init) => fetch(input, init), options: number | VoiceBoxOptions = {}) {
    const o = typeof options === "number" ? { pollMs: options, loadingPollMs: options } : options;
    this.fetcher = fetcher;
    this.pollMs = o.pollMs ?? 3000;
    this.loadingPollMs = o.loadingPollMs ?? Math.min(1000, this.pollMs);
    this.readyWaitMs = o.readyWaitMs ?? 2500;
    if (typeof window === "undefined") return;
    const load = () => { this.browserVoices = window.speechSynthesis?.getVoices() ?? []; };
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    this.recheck();
  }

  onSpeaking(listener: ((speaking: boolean) => void) | null) { this.speakingListener = listener; }
  onStatus(listener: ((status: VoiceStatus) => void) | null) { this.statusListener = listener; listener?.(this.status); }
  onLoad(listener: ((load: VoiceLoad) => void) | null) { this.loadListener = listener; listener?.(this.load); }
  get voiceStatus() { return this.status; }
  get usesNeural() { return this.status === "neural"; }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.playback?.setVolume(this.volume);
    if (this.element) this.element.volume = this.volume;
  }

  say(text: string, voice: VoiceId) {
    if (this.disposed || !text.trim()) return;
    // Keep at most one line waiting: commentary is about now, not a backlog.
    this.queue = [...this.queue.slice(-1), { text, voice, at: performance.now() }];
    if (!this.speaking) void this.next();
  }

  /**
   * Fetches a line the game will probably say soon (a taunt on the briefing,
   * the bard's opening line), behind any line someone is listening to. Only
   * while the natural voice is ready; a later say() of the same line plays at once.
   */
  prime(text: string, voice: VoiceId) {
    if (this.disposed || this.status !== "neural" || !text.trim()) return;
    for (const piece of sentences(text, SPLIT)) void this.fetchPiece(piece, voice, "prime");
  }

  stop() {
    this.generation++;
    this.queue = [];
    this.live.abort();
    this.live = new AbortController();
    this.playback?.stop();
    this.playback = null;
    this.element?.pause();
    this.element = null;
    try { window.speechSynthesis?.cancel(); } catch { /* Not supported. */ }
    this.setSpeaking(false);
  }

  dispose() {
    this.stop();
    this.disposed = true;
    if (this.poll) clearTimeout(this.poll);
    for (const wake of this.readyWaiters) wake();
    this.readyWaiters.clear();
    this.speakingListener = null;
    this.statusListener = null;
    this.loadListener = null;
    void this.context?.close().catch(() => {});
    this.context = null;
  }

  private setSpeaking(value: boolean) {
    if (this.speaking === value) return;
    this.speaking = value;
    this.speakingListener?.(value);
  }

  private setStatus(value: VoiceStatus) {
    if (this.status === value) return;
    this.status = value;
    this.statusListener?.(value);
    if (value !== "checking" && value !== "loading") {
      for (const wake of this.readyWaiters) wake();
      this.readyWaiters.clear();
    }
  }

  /** The first run downloads the voice model, so keep asking for three minutes. */
  private recheck() {
    this.pollUntil = performance.now() + 180_000;
    void this.check();
  }

  /** Asks the server which voice it has, and asks again while the answer may still change. */
  private async check() {
    if (this.poll) clearTimeout(this.poll);
    this.poll = null;
    const asked = ++this.asked;
    // How long to wait before asking again; 0 once the answer is settled.
    let again = 0;
    try {
      const response = await this.fetcher("/api/voice", { signal: AbortSignal.timeout(5000) });
      const v = (await response.json()) as { neural?: boolean; engine?: string; ready?: boolean; progress?: number; sizeMb?: number };
      if (this.disposed || asked !== this.asked) return;
      if (v?.neural) {
        if (!v.ready && typeof v.progress === "number") {
          this.load = { progress: v.progress, sizeMb: typeof v.sizeMb === "number" ? v.sizeMb : null };
          this.loadListener?.(this.load);
        }
        this.setStatus(v.ready ? "neural" : "loading");
        again = v.ready ? 0 : this.loadingPollMs;
      } else if (v?.engine === "browser") this.setStatus("browser");
      else {
        // The server tries a model that failed to load again after a minute.
        this.setStatus("unavailable");
        again = this.pollMs * 5;
      }
    } catch {
      if (this.disposed || asked !== this.asked) return;
      // No answer is not a "no": the server stalls for a few seconds while it
      // loads the voice model. The browser reads the lines until it answers.
      again = this.pollMs;
    }
    if (!again) return;
    if (performance.now() < this.pollUntil) this.poll = setTimeout(() => void this.check(), again);
    else if (this.status === "checking") this.setStatus("unavailable");
  }

  /** While the natural voice is a moment away, a line waits for it rather than switch voices. */
  private waitForReady() {
    if (this.status !== "checking" && this.status !== "loading") return Promise.resolve();
    return new Promise<void>(resolve => {
      const wake = () => { clearTimeout(timer); this.readyWaiters.delete(wake); resolve(); };
      const timer = setTimeout(wake, this.readyWaitMs);
      this.readyWaiters.add(wake);
    });
  }

  private async next() {
    const line = this.queue.shift();
    if (!line || this.disposed) { this.setSpeaking(false); return; }
    if (performance.now() - line.at > 7000) { void this.next(); return; }
    this.setSpeaking(true);
    const generation = this.generation;
    await this.waitForReady();
    if (generation !== this.generation || this.disposed) return;
    const spoke = (this.status === "neural" && (await this.neuralSay(line, generation))) || (generation === this.generation && (await this.browserSay(line)));
    if (generation !== this.generation) return;
    if (!spoke) this.setSpeaking(false);
    if (!this.disposed) void this.next();
  }

  /** Plays the line piece by piece, fetching and decoding the next while one is heard. */
  private async neuralSay(line: Line, generation: number): Promise<boolean> {
    const parts = sentences(line.text, SPLIT);
    const signal = this.live.signal;
    const ahead = (i: number) => this.decode(this.fetchPiece(parts[i], line.voice, "live", signal));
    let pending = ahead(0);
    for (let i = 0; i < parts.length; i++) {
      const audio = await pending;
      if (generation !== this.generation || this.disposed) return true;
      if (!audio) {
        if (i === 0) return false;
        return this.browserSay({ ...line, text: parts.slice(i).join(" ") });
      }
      if (i + 1 < parts.length) pending = ahead(i + 1);
      await this.play(audio, line.voice);
      if (generation !== this.generation || this.disposed) return true;
      if (i + 1 < parts.length) await new Promise(resolve => setTimeout(resolve, pauseAfter(parts[i]) * 1000));
    }
    return true;
  }

  /** One piece of a line: from the primed cache, a fetch already on its way, or the server. */
  private fetchPiece(text: string, voice: VoiceId, priority: "live" | "prime", signal?: AbortSignal): Promise<ArrayBuffer | null> {
    const key = `${voice}|${text}`, primed = this.primed.get(key);
    if (primed) return Promise.resolve(primed);
    const going = this.inflight.get(key);
    if (going && priority === "prime") return going;
    // A live request is always sent, even when a prime of the same piece is on
    // its way: the server synthesizes the piece once and moves it to the front.
    const request = this.request(text, voice, priority, signal).then(data => {
      if (data && !this.primed.has(key)) {
        this.primed.set(key, data);
        this.primedBytes += data.byteLength;
        while (this.primedBytes > PRIMED_BYTES && this.primed.size > 1) {
          const [oldest, bytes] = this.primed.entries().next().value!;
          this.primed.delete(oldest);
          this.primedBytes -= bytes.byteLength;
        }
      }
      return data;
    }).finally(() => { if (this.inflight.get(key) === request) this.inflight.delete(key); });
    this.inflight.set(key, request);
    return request;
  }

  private async request(text: string, voice: VoiceId, priority: "live" | "prime", signal?: AbortSignal): Promise<ArrayBuffer | null> {
    try {
      const response = await this.fetcher("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(priority === "prime" ? { text, voice, priority } : { text, voice }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(30000),
      });
      if (response.ok) return await response.arrayBuffer();
      // A busy voice is momentary; anything else may mean the server changed.
      if (priority === "live" && (response.status !== 503 || !response.headers.get("retry-after"))) this.recheck();
    } catch { /* The browser reads this line. */ }
    return null;
  }

  private audioContext() {
    if (!this.context && typeof AudioContext !== "undefined") {
      try { this.context = new AudioContext(); } catch { return null; }
    }
    return this.context;
  }

  /** Decodes as soon as the data arrives, so the next piece is ready when this one ends. */
  private async decode(data: Promise<ArrayBuffer | null>): Promise<AudioBuffer | ArrayBuffer | null> {
    const bytes = await data;
    if (!bytes) return null;
    const context = this.audioContext();
    if (!context) return bytes;
    try { return await context.decodeAudioData(bytes.slice(0)); } catch { return bytes; }
  }

  private async play(audio: AudioBuffer | ArrayBuffer, voice: VoiceId) {
    const context = this.audioContext();
    if (context && !(audio instanceof ArrayBuffer)) {
      try {
        if (context.state !== "running") await context.resume();
        if (context.state === "running") {
          const playback = playWithFx(context, audio, voices[voice].fx, this.volume);
          this.playback = playback;
          await playback.done;
          if (this.playback === playback) this.playback = null;
          return;
        }
      } catch { /* The plain media element still works. */ }
    }
    if (audio instanceof ArrayBuffer) await this.playElement(audio);
  }

  private async playElement(data: ArrayBuffer) {
    if (typeof Audio === "undefined") return;
    const url = URL.createObjectURL(new Blob([data]));
    try {
      const element = new Audio(url);
      element.volume = this.volume;
      this.element = element;
      await new Promise<void>(resolve => {
        element.onended = () => resolve();
        element.onerror = () => resolve();
        element.onpause = () => resolve();
        element.play().catch(() => resolve());
      });
    } finally {
      URL.revokeObjectURL(url);
      this.element = null;
    }
  }

  private browserVoiceFor(id: VoiceId) {
    const known = this.assigned.get(id), found = known ? this.browserVoices.find(v => v.name === known) : undefined;
    if (found) return found;
    const taken = new Set([...this.assigned].filter(([other]) => other !== id).map(([, name]) => name));
    const choice = pickBrowserVoice(this.browserVoices, voices[id], taken);
    if (choice) this.assigned.set(id, choice.name);
    return choice;
  }

  private browserSay(line: Line): Promise<boolean> {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve(false);
    const profile = voices[line.voice];
    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(line.text);
      const voice = this.browserVoiceFor(line.voice);
      if (voice) utterance.voice = voice;
      utterance.pitch = profile.browser.pitch;
      utterance.rate = profile.browser.rate;
      utterance.volume = this.volume;
      // Some engines never fire `end`; a length-based guard keeps the queue moving.
      const guard = setTimeout(() => resolve(true), 1500 + line.text.length * 110);
      utterance.onend = () => { clearTimeout(guard); resolve(true); };
      utterance.onerror = () => { clearTimeout(guard); resolve(false); };
      try { synth.speak(utterance); } catch { clearTimeout(guard); resolve(false); }
    });
  }
}
