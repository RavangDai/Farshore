import { voices, type VoiceId } from "../arcade/rivals.ts";
import { pickBrowserVoice } from "./browser-voices.ts";
import { playWithFx, type Playback } from "./voice-fx.ts";

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

/**
 * Splits a line into sentences so the first one can be spoken while the next
 * is synthesized. Fragments shorter than 16 characters stay with a neighbour
 * so the voice keeps its phrasing, and an over-long sentence breaks at commas.
 */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const part of text.trim().split(/(?<=[.!?…]["')\]]*)\s+/)) {
    if (!part) continue;
    if (out.length && (part.length < 16 || out[out.length - 1].length < 16)) out[out.length - 1] += " " + part;
    else out.push(part);
  }
  return out.flatMap(sentence => {
    if (sentence.length <= 200) return [sentence];
    const pieces: string[] = [];
    for (const clause of sentence.split(/(?<=[,;:])\s+/)) {
      if (pieces.length && pieces[pieces.length - 1].length + clause.length < 200) pieces[pieces.length - 1] += " " + clause;
      else pieces.push(clause);
    }
    return pieces;
  });
}

type Line = { text: string; voice: VoiceId; at: number };
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Speaks lines one at a time. Natural Kokoro voices come from the game server
 * and play through each character's voice chain; when they are unavailable the
 * browser's best natural voice reads the line instead. Lines that wait too long
 * are dropped, so the voice never narrates something that already passed.
 */
export class VoiceBox {
  private queue: Line[] = [];
  private speaking = false;
  private status: VoiceStatus = "checking";
  private context: AudioContext | null = null;
  private playback: Playback | null = null;
  private element: HTMLAudioElement | null = null;
  private volume = defaultVoicePrefs.volume;
  private browserVoices: SpeechSynthesisVoice[] = [];
  private assigned = new Map<VoiceId, string>();
  private speakingListener: ((speaking: boolean) => void) | null = null;
  private statusListener: ((status: VoiceStatus) => void) | null = null;
  private generation = 0;
  private poll: ReturnType<typeof setTimeout> | null = null;
  private pollUntil = 0;
  private disposed = false;
  private fetcher: Fetcher;

  constructor(fetcher: Fetcher = (input, init) => fetch(input, init)) {
    this.fetcher = fetcher;
    if (typeof window === "undefined") return;
    const load = () => { this.browserVoices = window.speechSynthesis?.getVoices() ?? []; };
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    this.recheck();
  }

  onSpeaking(listener: ((speaking: boolean) => void) | null) { this.speakingListener = listener; }
  onStatus(listener: ((status: VoiceStatus) => void) | null) { this.statusListener = listener; listener?.(this.status); }
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

  stop() {
    this.generation++;
    this.queue = [];
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
    this.speakingListener = null;
    this.statusListener = null;
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
  }

  /** The first run downloads the voice model, so keep asking for three minutes. */
  private recheck() {
    this.pollUntil = performance.now() + 180_000;
    void this.check();
  }

  private async check() {
    if (this.poll) clearTimeout(this.poll);
    this.poll = null;
    try {
      const response = await this.fetcher("/api/voice", { signal: AbortSignal.timeout(5000) });
      const v = (await response.json()) as { neural?: boolean; engine?: string; ready?: boolean };
      if (this.disposed) return;
      this.setStatus(!v?.neural ? (v?.engine === "browser" ? "browser" : "unavailable") : v.ready ? "neural" : "loading");
    } catch {
      if (!this.disposed) this.setStatus("unavailable");
    }
    if (this.status === "loading" && !this.disposed && performance.now() < this.pollUntil) this.poll = setTimeout(() => void this.check(), 3000);
  }

  private async next() {
    const line = this.queue.shift();
    if (!line || this.disposed) { this.setSpeaking(false); return; }
    if (performance.now() - line.at > 7000) { void this.next(); return; }
    this.setSpeaking(true);
    const generation = this.generation;
    const spoke = (this.status === "neural" && (await this.neuralSay(line, generation))) || (generation === this.generation && (await this.browserSay(line)));
    if (generation !== this.generation) return;
    if (!spoke) this.setSpeaking(false);
    if (!this.disposed) void this.next();
  }

  /** Plays the line sentence by sentence, fetching the next while one is heard. */
  private async neuralSay(line: Line, generation: number): Promise<boolean> {
    const parts = sentences(line.text);
    let pending = this.synthesize(parts[0], line.voice);
    for (let i = 0; i < parts.length; i++) {
      const audio = await pending;
      if (generation !== this.generation || this.disposed) return true;
      if (!audio) {
        if (i === 0) return false;
        return this.browserSay({ ...line, text: parts.slice(i).join(" ") });
      }
      if (i + 1 < parts.length) pending = this.synthesize(parts[i + 1], line.voice);
      await this.play(audio, line.voice);
    }
    return true;
  }

  private async synthesize(text: string, voice: VoiceId): Promise<ArrayBuffer | null> {
    try {
      const response = await this.fetcher("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) return await response.arrayBuffer();
      // A busy voice is momentary; anything else may mean the server changed.
      if (response.status !== 503 || !response.headers.get("retry-after")) this.recheck();
    } catch { /* The browser reads this line. */ }
    return null;
  }

  private audioContext() {
    if (!this.context && typeof AudioContext !== "undefined") {
      try { this.context = new AudioContext(); } catch { return null; }
    }
    return this.context;
  }

  private async play(data: ArrayBuffer, voice: VoiceId) {
    const context = this.audioContext();
    if (context) {
      try {
        if (context.state !== "running") await context.resume();
        if (context.state === "running") {
          const buffer = await context.decodeAudioData(data.slice(0));
          const playback = playWithFx(context, buffer, voices[voice].fx, this.volume);
          this.playback = playback;
          await playback.done;
          if (this.playback === playback) this.playback = null;
          return;
        }
      } catch { /* The plain media element still works. */ }
    }
    await this.playElement(data);
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
