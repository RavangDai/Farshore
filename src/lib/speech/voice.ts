import { voices, type VoiceId } from "./rivals.ts";

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

type Line = { text: string; voice: VoiceId; at: number };

/**
 * Speaks commentary one line at a time. A neural voice server is used when the
 * game server reports one; otherwise the browser's own speech synthesis reads
 * the line with a per-character pitch and rate. Lines that wait too long in the
 * queue are dropped, so the voice never narrates something that already passed.
 */
export class VoiceBox {
  private queue: Line[] = [];
  private speaking = false;
  private neural: boolean | null = null;
  private audio: HTMLAudioElement | null = null;
  private volume = defaultVoicePrefs.volume;
  private browserVoices: SpeechSynthesisVoice[] = [];
  private listener: ((speaking: boolean) => void) | null = null;
  private disposed = false;

  constructor() {
    if (typeof window === "undefined") return;
    const load = () => { this.browserVoices = window.speechSynthesis?.getVoices() ?? []; };
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    void fetch("/api/voice", { signal: AbortSignal.timeout(5000) })
      .then(r => r.json())
      .then(v => { this.neural = !!v?.neural; })
      .catch(() => { this.neural = false; });
  }

  onSpeaking(listener: ((speaking: boolean) => void) | null) { this.listener = listener; }
  setVolume(volume: number) { this.volume = Math.max(0, Math.min(1, volume)); if (this.audio) this.audio.volume = this.volume; }
  get usesNeural() { return this.neural === true; }

  say(text: string, voice: VoiceId) {
    if (this.disposed || !text.trim()) return;
    // Keep at most one line waiting: commentary is about now, not a backlog.
    this.queue = [...this.queue.slice(-1), { text, voice, at: performance.now() }];
    if (!this.speaking) void this.next();
  }

  stop() {
    this.queue = [];
    this.audio?.pause();
    this.audio = null;
    try { window.speechSynthesis?.cancel(); } catch { /* Not supported. */ }
    this.setSpeaking(false);
  }

  dispose() { this.disposed = true; this.stop(); this.listener = null; }

  private setSpeaking(value: boolean) {
    if (this.speaking === value) return;
    this.speaking = value;
    this.listener?.(value);
  }

  private async next() {
    const line = this.queue.shift();
    if (!line || this.disposed) { this.setSpeaking(false); return; }
    if (performance.now() - line.at > 7000) { void this.next(); return; }
    this.setSpeaking(true);
    const spoke = (this.neural && (await this.neuralSay(line))) || (await this.browserSay(line));
    if (!spoke) this.setSpeaking(false);
    if (!this.disposed) void this.next();
  }

  private async neuralSay(line: Line): Promise<boolean> {
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line.text, voice: line.voice }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return false;
      const url = URL.createObjectURL(await response.blob());
      try {
        const audio = new Audio(url);
        audio.volume = this.volume;
        this.audio = audio;
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("playback"));
          audio.onpause = () => resolve();
          audio.play().catch(reject);
        });
        return true;
      } finally {
        URL.revokeObjectURL(url);
        this.audio = null;
      }
    } catch {
      return false;
    }
  }

  private pickBrowserVoice(female?: boolean) {
    const english = this.browserVoices.filter(v => /^en(-|_|$)/i.test(v.lang));
    const pool = english.length ? english : this.browserVoices;
    const female_ = /female|zira|aria|jenny|sonia|libby|samantha|karen|moira|tessa|google uk english female|susan|hazel/i;
    const male = /male|david|guy|ryan|george|daniel|alex|fred|google uk english male|mark|james/i;
    return pool.find(v => (female ? female_ : male).test(v.name) && !(female ? male : female_).test(v.name) && /en-gb/i.test(v.lang))
      ?? pool.find(v => (female ? female_ : male).test(v.name))
      ?? pool[0];
  }

  private browserSay(line: Line): Promise<boolean> {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve(false);
    const profile = voices[line.voice];
    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(line.text);
      const voice = this.pickBrowserVoice(profile.female);
      if (voice) utterance.voice = voice;
      utterance.pitch = profile.pitch;
      utterance.rate = profile.rate;
      utterance.volume = this.volume;
      // Some engines never fire `end`; a length-based guard keeps the queue moving.
      const guard = setTimeout(() => resolve(true), 1500 + line.text.length * 110);
      utterance.onend = () => { clearTimeout(guard); resolve(true); };
      utterance.onerror = () => { clearTimeout(guard); resolve(false); };
      try { synth.speak(utterance); } catch { clearTimeout(guard); resolve(false); }
    });
  }
}
