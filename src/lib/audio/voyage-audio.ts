import { fade, impulseResponse, normalize, rng, type Space } from "./dsp.ts";
import { sounds, type Recipe, type SoundName } from "./sounds.ts";
import { scenes, type LoopName, type SceneName } from "./ambience.ts";
import type { AudioFrame, Cue } from "./cues.ts";
import { LINES, SAMPLES, UI_SAMPLES, ambienceUrl, lineUrl, musicUrl, pickFormat, sampleUrl, type AudioFormat, type AudioPlace, type LineId, type SampleName } from "./library.ts";
import { IDENTITY, type IdentityShot } from "./soundscape.ts";
import { voices } from "../arcade/rivals.ts";
import { playWithFx, type Playback } from "../speech/voice-fx.ts";

export type MusicMood = "title" | "voyage" | "danger" | "home";
export type AudioCue = "send" | "reply" | "costly" | "sail" | "select";
export type AudioSettings = {
  enabled: boolean;
  music: number;
  effects: number;
  ducked: boolean;
  quiet: boolean;
  mood: MusicMood;
  /** The mixer. Older screens leave these out and keep their original balance. */
  master?: number;
  ambience?: number;
  voice?: number;
  ui?: number;
};

type Layer = { gain: GainNode; mood: MusicMood; step: number; next: number; retire?: number };
const scores: Record<MusicMood, { bpm: number; roots: number[]; melody: (number | null)[] }> = {
  title: { bpm: 66, roots: [50, 46, 53, 48], melody: [74, null, 77, 81, null, 79, 77, null, 76, null, 74, null, 72, 74, null, null] },
  voyage: { bpm: 76, roots: [50, 48, 46, 53], melody: [74, null, 77, 79, 81, null, 79, null, 77, 76, null, 74, 72, null, 74, null] },
  danger: { bpm: 84, roots: [50, 46, 48, 45], melody: [74, null, null, 77, 76, null, 74, null, 69, null, 72, null, 70, 69, null, null] },
  home: { bpm: 64, roots: [53, 48, 46, 50], melody: [77, null, 81, null, 84, 81, null, 79, 77, null, 76, 74, null, 77, null, null] },
};

export function musicMood(screen: string, encounter: string, finished: boolean, won: boolean): MusicMood {
  if (screen !== "play") return "title";
  if (finished) return won ? "home" : "danger";
  if (["ithaca", "nausicaa", "phaeacians", "reunion"].includes(encounter)) return "home";
  return ["cicones", "laestrygonians", "cyclops", "underworld", "sirens", "scylla", "cattle"].includes(encounter) ? "danger" : "voyage";
}

const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const volume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const between = ([lo, hi]: [number, number]) => lo + Math.random() * (hi - lo);

/** The older screens name five cues; each is now a sound from the library. */
const legacyCues: Record<AudioCue, SoundName> = { send: "ui-confirm", reply: "reply", costly: "costly", sail: "sail", select: "ui-tick" };
/**
 * Game events that play a sample from the audio pack instead of a procedural
 * recipe. The stingers and the rescue chime come from the pack; the core
 * gameplay sounds (footfalls, hits, the Cyclops' roar, the bow) keep the
 * procedural recipes, which were tuned until an AudioSet classifier heard
 * them as what they are; the pack's versions of those classify as generic
 * bangs and bursts.
 */
const SAMPLE_FOR: Partial<Record<SoundName, SampleName>> = { victory: "victory", defeat: "defeat", rescue: "sailor-rescue" };
/** No more than this many copies of one sound at once (the oldest is cut), and this many overall. */
const PER_SOUND = 4, VOICES = 24;
const perSound: Partial<Record<SoundName, number>> = { ting: 12, "step-stone": 3, "giant-step": 3 };
/** Sounds a slider or held key could fire every frame start at most this often, in seconds. */
const minGap: Partial<Record<SoundName, number>> = { "bow-draw": 0.12, "glass-tick": 0.04, swish: 0.05 };
/** Interface samples that a pointer could fire in quick succession start at most this often, in seconds. */
const uiGap: Partial<Record<SampleName, number>> = { "ui-hover": 0.07, "ui-select": 0.05, "ui-back": 0.08, "glass-open": 0.15, "glass-close": 0.15 };
/** How much of each space's reverb the effects hear. */
const reverbSend: Record<Space, number> = { cave: 0.38, hall: 0.22, sea: 0.1, ethereal: 0.3, storm: 0.25 };
const hash = (text: string) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
/** What actually started, for browser checks: a page that sets `window.__farshoreAudioLog = []` gets a record. */
function trace(kind: string, name: string) {
  const log = (globalThis as { __farshoreAudioLog?: unknown }).__farshoreAudioLog;
  if (Array.isArray(log)) log.push({ t: Math.round(performance.now()), kind, name });
}
/** Crossfade between two music loops or two ambience loops, in seconds. */
const CROSSFADE = 2.4;
/** Decoded loops kept in memory (music and ambience together); the least recently used is dropped. */
const LOOP_CACHE = 6;

type Voice = { name: SoundName; source: AudioBufferSourceNode; ends: number };
type Bed = { source: AudioBufferSourceNode; gain: GainNode; level: number; drive?: LoopName };
type Loop = { place: AudioPlace; source: AudioBufferSourceNode; gain: GainNode; level: number };
type Narration = { id: LineId; playback: Playback };
export type NarrationResult = "done" | "stopped" | "refused";

/**
 * Farshore's sound: the music, the sound effects, each place's ambience, the
 * recorded voice lines and the interface sounds, each on its own channel
 * (master, music, ambience, voice, effects, interface) and all scheduled on
 * the audio clock. The FARSHORE audio pack's music, ambience, voice lines and
 * effects load per place, on demand; the gameplay effects and the dynamic
 * beds are rendered in code (sounds.ts). Screens that never pick a place keep
 * the original procedural D-minor score.
 */
export class VoyageAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private ambience: GainNode | null = null;
  private voice: GainNode | null = null;
  private ui: GainNode | null = null;
  /** Under the music loop only: dips for the stingers, so the score makes room for them. */
  private musicDuck: GainNode | null = null;
  private tensionBus: GainNode | null = null;
  private send: GainNode | null = null;
  private reverbs: { convolver: ConvolverNode; gain: GainNode }[] = [];
  private activeReverb = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private layers: Layer[] = [];
  private sources = new Set<AudioScheduledSourceNode>();
  private buffers = new Map<string, AudioBuffer>();
  private voices: Voice[] = [];
  private lastStart = new Map<SoundName, number>();
  private lastUi = new Map<SampleName, number>();
  private disposed = false;
  private settings: AudioSettings = { enabled: false, music: .35, effects: .55, ducked: false, quiet: false, mood: "title" };
  private wantedScene: SceneName = "sea";
  private scene: SceneName | null = null;
  private beds: Bed[] = [];
  private shotsDue: number[] = [];
  private loops: Partial<Record<LoopName, number>> = {};
  private nextStep: Partial<Record<"giant" | "run" | "row" | "tension", number>> = {};
  private stride = 1;
  // ---- the audio pack
  private format: AudioFormat | null = null;
  private samples = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private loopUse: string[] = [];
  private wantedMusic: { place: AudioPlace; level: number } | null = null;
  private musicLoop: Loop | null = null;
  private wantedAmbience: { place: AudioPlace; level: number; identity: boolean } | null = null;
  private ambienceLoop: Loop | null = null;
  private identityDue: number[] = [];
  private tension = 0;
  private narration: Narration | null = null;
  /** Bumped by stopNarration(): a line still loading when its screen is left never starts. */
  private narrationGen = 0;
  private stateListener: ((live: boolean) => void) | null = null;
  private visibility = () => this.apply();

  async unlock() {
    if (this.disposed) return;
    if (!this.context) {
      const ctx = new AudioContext();
      this.context = ctx;
      // Created first and second: music, then effects (the settings' two volumes).
      this.music = ctx.createGain();
      this.effects = ctx.createGain();
      this.master = ctx.createGain();
      this.ambience = ctx.createGain();
      this.voice = ctx.createGain();
      this.ui = ctx.createGain();
      this.musicDuck = ctx.createGain();
      this.tensionBus = ctx.createGain();
      this.send = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor(), limiter = ctx.createDynamicsCompressor();
      for (const bus of [this.music, this.effects, this.ambience, this.voice, this.ui, this.master]) bus.gain.value = 0;
      compressor.threshold.value = -18;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.2;
      limiter.threshold.value = -3;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      this.master.connect(compressor);
      compressor.connect(limiter);
      limiter.connect(ctx.destination);
      // A little space around the instruments, with bounded feedback.
      const echo = ctx.createDelay(1), feedback = ctx.createGain(), filter = ctx.createBiquadFilter();
      echo.delayTime.value = .31;
      feedback.gain.value = .19;
      filter.type = "lowpass";
      filter.frequency.value = 1700;
      this.music.connect(this.master);
      this.music.connect(echo);
      echo.connect(filter);
      filter.connect(feedback);
      feedback.connect(echo);
      feedback.connect(this.master);
      this.musicDuck.connect(this.music);
      this.tensionBus.gain.value = 0;
      this.tensionBus.connect(this.music);
      this.effects.connect(this.master);
      this.ambience.connect(this.master);
      // The voice skips the bus compressor's pumping: it has its own limiter in the voice chain.
      this.voice.connect(limiter);
      this.ui.connect(this.master);
      // Two reverbs, so a change of scene can crossfade between spaces.
      for (let i = 0; i < 2; i++) {
        const convolver = ctx.createConvolver(), gain = ctx.createGain();
        gain.gain.value = 0;
        this.send.connect(convolver);
        convolver.connect(gain);
        gain.connect(this.master);
        this.reverbs.push({ convolver, gain });
      }
      ctx.addEventListener?.("statechange", () => this.stateListener?.(this.live));
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.visibility);
      this.format = pickFormat(type => (typeof Audio === "undefined" ? "" : new Audio().canPlayType(type)));
      for (const name of UI_SAMPLES) void this.load(sampleUrl(name, this.format));
    }
    await this.context.resume();
    this.apply();
  }

  /** True while sound is actually reaching the speakers (unlocked by a gesture, enabled, the tab visible). */
  get live() { return this.running(); }
  /** Told when `live` changes, e.g. once the first gesture has unlocked audio. */
  onState(listener: ((live: boolean) => void) | null) { this.stateListener = listener; }
  get narrating(): LineId | null { return this.narration?.id ?? null; }

  update(settings: AudioSettings) {
    const was = this.running();
    this.settings = { ...settings, music: volume(settings.music), effects: volume(settings.effects) };
    this.apply();
    if (was !== this.running()) this.stateListener?.(this.running());
  }

  /** Sound for one simulation step: what was heard, the continuous loops, and where we are. */
  frame(frame: AudioFrame) {
    this.setScene(frame.scene);
    this.setLoops(frame.loops);
    this.play(frame.cues);
  }

  play(cues: Cue[]) {
    if (!this.running()) return;
    for (const cue of cues) {
      const sample = SAMPLE_FOR[cue.sound];
      if (sample) this.sample(sample, { gain: cue.gain, pan: cue.pan, delay: cue.delay });
      else this.start(cue.sound, this.effects!, cue);
    }
  }

  cue(cue: AudioCue) {
    this.play([{ sound: legacyCues[cue], gain: cue === "select" ? 0.7 : 1 }]);
  }

  /**
   * Continuous chase tension, driven by real distance to a pursuing enemy —
   * never a scripted ramp. The caller passes a fresh 0..1 value every frame;
   * this just stores it, and the heavy footfalls are scheduled on the audio
   * clock, louder and more frequent as the gap closes.
   */
  setIntensity(level: number) {
    this.setLoops({ ...this.loops, giant: level });
  }

  setLoops(loops: Partial<Record<LoopName, number>>) {
    this.loops = Object.fromEntries(Object.entries(loops).map(([k, v]) => [k, volume(v ?? 0)]));
    const ctx = this.context;
    if (ctx) for (const bed of this.beds) if (bed.drive) bed.gain.gain.setTargetAtTime(bed.level * (0.35 + 0.65 * (this.loops[bed.drive] ?? 0)), ctx.currentTime, 0.3);
  }

  setScene(scene: SceneName) {
    this.wantedScene = scene;
    if (this.running() && this.scene !== scene) this.startScene();
  }

  /** Renders sounds ahead of time, a few at a time while the page is idle. */
  prepare(names: SoundName[]) {
    const queue = names.flatMap(name => Array.from({ length: sounds[name].variants }, (_, v) => [name, v] as const));
    const step = () => {
      if (this.disposed || !this.context) return;
      const started = performance.now();
      while (queue.length && performance.now() - started < 8) {
        const [name, variant] = queue.shift()!;
        this.buffer(name, variant);
      }
      if (queue.length) setTimeout(step, 16);
    };
    setTimeout(step, 0);
  }

  // ------------------------------------------------------------ the audio pack

  /**
   * The music loop for a place, at `level` (the trial introduction sits lower).
   * A new place is fetched, then crossfades in over the old one; the same
   * place only changes level, so the music never restarts on a re-render.
   * `null` returns to the procedural score.
   */
  setMusic(place: AudioPlace | null, level = 1) {
    this.wantedMusic = place ? { place, level: volume(level) } : null;
    if (this.running()) this.applyMusic();
  }

  /** The ambience loop for a place, and whether its identity one-shots play (menus) or not (gameplay). */
  setAmbience(place: AudioPlace | null, { level = 1, identity = true }: { level?: number; identity?: boolean } = {}) {
    const changed = place !== this.wantedAmbience?.place || identity !== this.wantedAmbience?.identity;
    this.wantedAmbience = place ? { place, level: volume(level), identity } : null;
    if (changed && place && this.context) this.identityDue = IDENTITY[place].map(s => this.context!.currentTime + between(s.every) * 0.6);
    if (this.running()) this.applyAmbience();
  }

  /** How tense the moment is, 0..1, from the simulation (a closing pursuer, the whirlpool's pull): drives the war drums. */
  setTension(level: number) {
    const was = this.tension > 0.06;
    this.tension = volume(level);
    if (was !== this.tension > 0.06) trace("tension", this.tension > 0.06 ? "on" : "off");
    const ctx = this.context;
    if (ctx && this.tensionBus) this.tensionBus.gain.setTargetAtTime(this.tension > 0.06 ? 0.4 + 0.6 * this.tension : 0, ctx.currentTime, 0.4);
  }

  /** Fetches the music, ambience and voice lines a place will need, so they are ready when the screen arrives. */
  preload(place: AudioPlace, lines: LineId[] = []) {
    if (!this.context || !this.format) return;
    void this.load(musicUrl(place, this.format), true);
    void this.load(ambienceUrl(place, this.format), true);
    for (const line of lines) void this.load(lineUrl(line, this.format));
    for (const shot of IDENTITY[place]) for (const s of [shot.sample, shot.then?.sample]) if (s) void this.load(sampleUrl(s, this.format));
  }

  /** Plays one of the pack's sampled effects on its own channel. */
  sample(name: SampleName, { gain = 1, pan = 0, rate = 1, delay = 0 }: { gain?: number; pan?: number; rate?: number; delay?: number } = {}) {
    if (!this.running() || !this.format) return;
    const url = sampleUrl(name, this.format), cached = this.samples.get(url);
    const go = (buffer: AudioBuffer) => {
      if (!this.running()) return;
      const ctx = this.context!, spec = SAMPLES[name];
      const source = ctx.createBufferSource(), level = ctx.createGain(), panner = ctx.createStereoPanner();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      level.gain.value = spec.gain * gain;
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(level);
      level.connect(panner);
      const bus = spec.bus === "music" ? this.music! : spec.bus === "ambience" ? this.ambience! : spec.bus === "ui" ? this.ui! : this.effects!;
      panner.connect(bus);
      if (spec.bus === "sfx") panner.connect(this.send!);
      // A stinger: the score dips beneath it and comes back as it ends.
      if (spec.bus === "music" && this.musicDuck) {
        const now = ctx.currentTime + delay, g = this.musicDuck.gain;
        g.cancelScheduledValues(now);
        g.setTargetAtTime(0.2, now, 0.08);
        g.setTargetAtTime(1, now + buffer.duration * 0.8, 0.6);
      }
      this.track(source, () => { level.disconnect(); panner.disconnect(); });
      source.start(ctx.currentTime + Math.max(0, delay));
      trace(spec.bus, name);
    };
    if (cached) go(cached);
    else {
      // A sample still loading plays if it arrives within a moment; a late one would mean nothing.
      const asked = performance.now();
      void this.load(url).then(buffer => { if (buffer && performance.now() - asked < 350) go(buffer); });
    }
  }

  /** An interface sound (hover, selection, glass panels), rate-limited so a quick pointer cannot chatter. */
  uiSound(name: SampleName, gain = 1) {
    if (!this.context) return;
    const now = this.context.currentTime, gap = uiGap[name] ?? 0.05;
    if (now - (this.lastUi.get(name) ?? -Infinity) < gap) return;
    this.lastUi.set(name, now);
    this.sample(name, { gain });
  }

  /**
   * Speaks one of the pack's recorded lines through its character's voice
   * chain (EQ, reverb, chorus) on the voice channel, lowering the music and
   * ambience while it plays. A chapter narration may cut short an Oracle or a
   * character line; anything else waits its turn and is refused. Resolves when
   * the line ends, is stopped, or is refused.
   */
  async narrate(id: LineId, { onStart }: { onStart?: () => void } = {}): Promise<NarrationResult> {
    if (!this.running() || !this.format) return "refused";
    if (this.narration) {
      if (LINES[id].kind !== "narration" || LINES[this.narration.id].kind === "narration") return "refused";
      this.stopNarration();
    }
    const gen = this.narrationGen;
    const buffer = await this.load(lineUrl(id, this.format));
    if (!buffer || !this.running() || this.narration || gen !== this.narrationGen) return "refused";
    const ctx = this.context!, line = LINES[id];
    const playback = playWithFx(ctx, buffer, voices[line.voice].fx, 1, this.voice!);
    const mine: Narration = { id, playback };
    this.narration = mine;
    this.apply();
    onStart?.();
    trace("voice", id);
    let stopped = false;
    const stop = playback.stop.bind(playback);
    playback.stop = () => { stopped = true; stop(); };
    await playback.done;
    if (this.narration === mine) { this.narration = null; this.apply(); }
    return stopped ? "stopped" : "done";
  }

  stopNarration() {
    this.narrationGen++;
    const current = this.narration;
    this.narration = null;
    current?.playback.stop();
    this.apply();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.narration?.playback.stop();
    this.narration = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibility);
    for (const source of this.sources) { try { source.stop(); } catch { /* Already stopped. */ } }
    this.sources.clear();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.context = null;
    this.samples.clear();
    this.loading.clear();
  }

  private hidden() {
    return typeof document !== "undefined" && document.visibilityState === "hidden";
  }

  private running() {
    return !!this.context && !this.disposed && this.settings.enabled && !this.settings.quiet && !this.hidden() && this.context.state === "running";
  }

  private track(source: AudioScheduledSourceNode, cleanup: () => void = () => {}) {
    this.sources.add(source);
    source.onended = () => { source.disconnect(); this.sources.delete(source); cleanup(); };
  }

  /** Fetches and decodes a file once; loops share a small least-recently-used cache. */
  private load(url: string, loop = false): Promise<AudioBuffer | null> {
    const ctx = this.context;
    if (!ctx) return Promise.resolve(null);
    if (loop) this.loopUse = [...this.loopUse.filter(u => u !== url), url];
    const cached = this.samples.get(url);
    if (cached) return Promise.resolve(cached);
    let pending = this.loading.get(url);
    if (!pending) {
      pending = fetch(url)
        .then(r => (r.ok ? r.arrayBuffer() : null))
        .then(bytes => (bytes && this.context ? this.context.decodeAudioData(bytes) : null))
        .then(buffer => {
          if (buffer && !this.disposed) {
            this.samples.set(url, buffer);
            if (loop) this.evictLoops();
          }
          return buffer;
        })
        .catch(() => null)
        .finally(() => this.loading.delete(url));
      this.loading.set(url, pending);
    }
    return pending;
  }

  private evictLoops() {
    const playing = new Set([this.musicLoop, this.ambienceLoop].filter(Boolean).map(l => l!.source.buffer));
    while (this.loopUse.length > LOOP_CACHE) {
      const url = this.loopUse.shift()!, buffer = this.samples.get(url);
      if (buffer && playing.has(buffer)) { this.loopUse.push(url); break; }
      this.samples.delete(url);
    }
  }

  /** Starts a looping place sound at a random point, fading it in, on `bus` through `via`. */
  private startLoop(place: AudioPlace, buffer: AudioBuffer, level: number, via: AudioNode): Loop {
    const ctx = this.context!, source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(level, ctx.currentTime, CROSSFADE / 3);
    source.connect(gain);
    gain.connect(via);
    this.track(source, () => gain.disconnect());
    source.start(ctx.currentTime, Math.random() * buffer.duration);
    return { place, source, gain, level };
  }

  private retireLoop(loop: Loop | null) {
    if (!loop) return;
    const ctx = this.context!;
    loop.gain.gain.setTargetAtTime(0, ctx.currentTime, CROSSFADE / 3);
    try { loop.source.stop(ctx.currentTime + CROSSFADE * 1.6); } catch { /* Already stopped. */ }
  }

  private applyMusic() {
    const want = this.wantedMusic, ctx = this.context!;
    if (!want) { this.retireLoop(this.musicLoop); this.musicLoop = null; return; }
    if (this.musicLoop?.place === want.place) {
      if (this.musicLoop.level !== want.level) { this.musicLoop.level = want.level; this.musicLoop.gain.gain.setTargetAtTime(want.level, ctx.currentTime, 0.8); }
      return;
    }
    void this.load(musicUrl(want.place, this.format!), true).then(buffer => {
      const now = this.wantedMusic;
      if (!buffer || !now || now.place !== want.place || !this.running() || this.musicLoop?.place === want.place) return;
      this.retireLoop(this.musicLoop);
      this.musicLoop = this.startLoop(want.place, buffer, now.level, this.musicDuck!);
      trace("music", want.place);
    });
  }

  private applyAmbience() {
    const want = this.wantedAmbience, ctx = this.context!;
    if (!want) { this.retireLoop(this.ambienceLoop); this.ambienceLoop = null; return; }
    if (this.ambienceLoop?.place === want.place) {
      if (this.ambienceLoop.level !== want.level) { this.ambienceLoop.level = want.level; this.ambienceLoop.gain.gain.setTargetAtTime(want.level, ctx.currentTime, 0.8); }
      return;
    }
    void this.load(ambienceUrl(want.place, this.format!), true).then(buffer => {
      const now = this.wantedAmbience;
      if (!buffer || !now || now.place !== want.place || !this.running() || this.ambienceLoop?.place === want.place) return;
      this.retireLoop(this.ambienceLoop);
      this.ambienceLoop = this.startLoop(want.place, buffer, now.level, this.ambience!);
      trace("ambience", want.place);
    });
  }

  private apply() {
    const ctx = this.context;
    if (!ctx || this.disposed) return;
    const active = this.settings.enabled && !this.settings.quiet;
    // A voice in the room (a live line or a recorded one) lowers the music and the ambience until it ends.
    const ducked = this.settings.ducked || !!this.narration;
    const s = this.settings, master = s.master ?? 1;
    this.master!.gain.setTargetAtTime(active ? master : 0, ctx.currentTime, .05);
    this.music!.gain.setTargetAtTime(active ? s.music * (ducked ? .22 : 1) : 0, ctx.currentTime, .16);
    this.effects!.gain.setTargetAtTime(active ? s.effects : 0, ctx.currentTime, .03);
    this.ambience!.gain.setTargetAtTime(active ? (s.ambience ?? s.effects * 0.7) * (ducked ? 0.45 : 1) : 0, ctx.currentTime, .3);
    this.voice!.gain.setTargetAtTime(active ? s.voice ?? 1 : 0, ctx.currentTime, .05);
    this.ui!.gain.setTargetAtTime(active ? s.ui ?? s.effects : 0, ctx.currentTime, .03);
    this.send!.gain.setTargetAtTime(active ? s.effects : 0, ctx.currentTime, .03);
    if (!active || this.hidden()) {
      // Muted, or the tab is in the background: nothing plays and the audio clock stops.
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      void ctx.suspend().catch(() => {});
      return;
    }
    // resume() only occurs here after a context was unlocked by a player gesture.
    if (ctx.state === "suspended") void ctx.resume().then(() => this.apply()).catch(() => {});
    if (ctx.state !== "running") return;
    const sampled = !!this.wantedMusic;
    const current = this.layers.find((layer) => !layer.retire);
    if (sampled) this.retireLayers();
    else if (!current || current.mood !== this.settings.mood) {
      const now = ctx.currentTime;
      this.retireLayers();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(1, now + 1.8);
      gain.connect(this.music!);
      this.layers.push({ gain, mood: this.settings.mood, step: 0, next: now + .04 });
    }
    this.applyMusic();
    this.applyAmbience();
    if (this.scene !== this.wantedScene) this.startScene();
    if (!this.timer) {
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 100);
    }
  }

  private retireLayers() {
    const now = this.context!.currentTime;
    for (const layer of this.layers) {
      if (layer.retire) continue;
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
      layer.gain.gain.linearRampToValueAtTime(0, now + 1.8);
      layer.retire = now + 3.8;
    }
  }

  /** A rendered variant of a sound, made the first time it is needed. */
  private buffer(name: SoundName, variant: number) {
    const key = `${name}:${variant}`, cached = this.buffers.get(key);
    if (cached) return cached;
    const ctx = this.context!, recipe: Recipe = sounds[name];
    const rate = Math.min(ctx.sampleRate, recipe.rate ?? ctx.sampleRate);
    const rendered = recipe.render(rate, rng(hash(name) * 13 + variant));
    const channels = Array.isArray(rendered) ? rendered : [rendered];
    normalize(channels, 0.9);
    if (!recipe.loop) for (const channel of channels) fade(channel, rate);
    const buffer = ctx.createBuffer(channels.length, channels[0].length, rate);
    channels.forEach((channel, i) => buffer.getChannelData(i).set(channel));
    this.buffers.set(key, buffer);
    return buffer;
  }

  /** Starts one sound: a random variant, a little pitch and level variation, panned, with reverb. */
  private start(name: SoundName, bus: AudioNode, { pan = 0, gain = 1, rate, delay = 0 }: Omit<Cue, "sound"> = {}) {
    const ctx = this.context!, at = ctx.currentTime + Math.max(0, delay), recipe = sounds[name];
    const gap = minGap[name];
    if (gap !== undefined && at - (this.lastStart.get(name) ?? -Infinity) < gap) return;
    this.lastStart.set(name, at);
    this.voices = this.voices.filter(v => v.ends > ctx.currentTime);
    const same = this.voices.filter(v => v.name === name);
    if (same.length >= (perSound[name] ?? PER_SOUND)) this.cut(same[0]);
    if (this.voices.length >= VOICES) this.cut(this.voices[0]);
    const source = ctx.createBufferSource(), level = ctx.createGain(), panner = ctx.createStereoPanner();
    const buffer = this.buffer(name, Math.floor(Math.random() * recipe.variants));
    source.buffer = buffer;
    source.playbackRate.value = rate ?? 1 + (Math.random() * 2 - 1) * 0.03;
    level.gain.value = recipe.gain * gain * (rate === undefined ? 10 ** (((Math.random() * 2 - 1) * 1.5) / 20) : 1);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(level);
    level.connect(panner);
    panner.connect(bus);
    panner.connect(this.send!);
    this.track(source, () => { level.disconnect(); panner.disconnect(); });
    source.start(at);
    trace("sound", name);
    this.voices.push({ name, source, ends: at + buffer.duration / source.playbackRate.value });
  }

  private cut(voice: Voice) {
    try { voice.source.stop(); } catch { /* Not started yet. */ }
    this.voices = this.voices.filter(v => v !== voice);
  }

  /** Crossfades to a scene's beds and reverb, and schedules its occasional sounds. */
  private startScene() {
    const ctx = this.context!, now = ctx.currentTime, scene = scenes[this.wantedScene];
    this.scene = this.wantedScene;
    for (const bed of this.beds) {
      bed.gain.gain.setTargetAtTime(0, now, 0.5);
      try { bed.source.stop(now + 3); } catch { /* Already stopped. */ }
    }
    this.beds = scene.beds.map(({ sound, gain, drive }) => {
      const source = ctx.createBufferSource(), level = ctx.createGain(), buffer = this.buffer(sound, 0);
      const target = sounds[sound].gain * gain * (drive ? 0.35 + 0.65 * (this.loops[drive] ?? 0) : 1);
      source.buffer = buffer;
      source.loop = true;
      level.gain.value = 0;
      level.gain.setTargetAtTime(target, now, 0.6);
      source.connect(level);
      level.connect(this.ambience!);
      this.track(source, () => level.disconnect());
      source.start(now, Math.random() * buffer.duration);
      return { source, gain: level, level: sounds[sound].gain * gain, drive };
    });
    const next = this.reverbs[1 - this.activeReverb], previous = this.reverbs[this.activeReverb];
    if (next && previous) {
      const [left, right] = impulseResponse(scene.space, ctx.sampleRate, 1);
      const impulse = ctx.createBuffer(2, left.length, ctx.sampleRate);
      impulse.getChannelData(0).set(left);
      impulse.getChannelData(1).set(right);
      next.convolver.buffer = impulse;
      next.gain.gain.setTargetAtTime(reverbSend[scene.space], now, 0.4);
      previous.gain.gain.setTargetAtTime(0, now, 0.4);
      this.activeReverb = 1 - this.activeReverb;
    }
    this.shotsDue = scene.shots.map(shot => now + between(shot.every) * 0.5);
  }

  private note(midi: number, at: number, duration: number, strength: number, destination: AudioNode, type: OscillatorType = "triangle") {
    const ctx = this.context!;
    const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency(midi);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(strength, at + .018);
    envelope.gain.exponentialRampToValueAtTime(strength * .42, at + Math.min(.16, duration / 2));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    this.track(oscillator, () => envelope.disconnect());
    oscillator.start(at);
    oscillator.stop(at + duration + .03);
  }

  private drum(at: number, destination: AudioNode, strength = .065) {
    const ctx = this.context!, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.frequency.setValueAtTime(115, at);
    oscillator.frequency.exponentialRampToValueAtTime(48, at + .19);
    gain.gain.setValueAtTime(strength, at);
    gain.gain.exponentialRampToValueAtTime(.0001, at + .25);
    oscillator.connect(gain);
    gain.connect(destination);
    this.track(oscillator, () => gain.disconnect());
    oscillator.start(at);
    oscillator.stop(at + .28);
  }

  /** An identity one-shot: a procedural recipe or a pack sample, on the ambience channel. */
  private identityShot(shot: IdentityShot | NonNullable<IdentityShot["then"]>, gain: number, pan: number, delay = 0) {
    trace("identity", shot.sample ?? shot.sound ?? "");
    const rate = "rate" in shot && shot.rate ? between(shot.rate) : 1;
    if (shot.sample) {
      if (!this.format) return;
      const url = sampleUrl(shot.sample, this.format), buffer = this.samples.get(url);
      if (!buffer) { void this.load(url); return; }
      const ctx = this.context!, source = ctx.createBufferSource(), level = ctx.createGain(), panner = ctx.createStereoPanner();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      level.gain.value = gain;
      panner.pan.value = pan;
      source.connect(level);
      level.connect(panner);
      panner.connect(this.ambience!);
      panner.connect(this.send!);
      this.track(source, () => { level.disconnect(); panner.disconnect(); });
      source.start(ctx.currentTime + delay);
    } else if (shot.sound) this.start(shot.sound, this.ambience!, { gain, pan, rate, delay });
  }

  private schedule() {
    const ctx = this.context!;
    this.layers = this.layers.filter((layer) => {
      if (layer.retire && ctx.currentTime > layer.retire) { layer.gain.disconnect(); return false; }
      if (layer.retire) return true;
      const score = scores[layer.mood], beat = 60 / score.bpm;
      if (layer.next < ctx.currentTime - .3) layer.next = ctx.currentTime + .04;
      while (layer.next < ctx.currentTime + .22) {
        const step = layer.step, at = layer.next, root = score.roots[Math.floor(step / 16) % 4];
        // Broken lyre chords, a slower flute phrase, and a soft frame drum.
        const third = [46, 48, 53].includes(root) ? 4 : 3;
        const arpeggio = [0, 7, 12, 7, third, 7, 12, 12 + third];
        if (step % 2 === 0) this.note(root + arpeggio[(step / 2) % 8], at, 1.35, .065, layer.gain);
        if (step % 16 === 0) {
          this.note(root - 12, at, beat * 7, .042, layer.gain, "sine");
          this.note(root + 7, at, beat * 6, .019, layer.gain, "sine");
        }
        if (step % 2 === 0) {
          const melody = score.melody[Math.floor(step / 2) % score.melody.length];
          // Leave a phrase of breathing room every second cycle.
          if (melody !== null && !(Math.floor(step / 32) % 2 && step % 32 > 23))
            this.note(melody, at + .025, beat * 1.6, .05, layer.gain, "sine");
        }
        if (layer.mood === "danger" ? step % 4 === 0 : layer.mood === "voyage" && step % 8 === 0) this.drum(at, layer.gain);
        layer.step++;
        layer.next += beat / 2;
      }
      return true;
    });
    if (!this.running()) return;
    // Continuous sounds run on their own clocks, independent of the music, so
    // the chase keeps tightening through a mood crossfade.
    const giant = this.loops.giant ?? 0, run = this.loops.run ?? 0, row = this.loops.row ?? 0;
    this.steps("giant", giant > .03, .55 - giant * .34, () => ({ sound: "giant-step", gain: .25 + .75 * giant, rate: 1 - .08 * giant }));
    this.steps("run", run > .05, .42 - .12 * run, () => ({ sound: "step-stone", gain: .35 + .4 * run, pan: (this.stride = -this.stride) * .15 }));
    this.steps("row", row > .5, 1.15, () => ({ sound: "oar", pan: -.3 }));
    // War drums under the music while the moment is tense: faster and heavier as it tightens.
    this.pulse(this.tension > 0.06 && !!this.wantedMusic, 0.62 - 0.3 * this.tension, 0.05 + 0.09 * this.tension);
    const shots = scenes[this.scene ?? this.wantedScene].shots;
    shots.forEach((shot, i) => {
      if (this.scene && ctx.currentTime >= (this.shotsDue[i] ?? Infinity)) {
        this.start(shot.sound, this.ambience!, { gain: between(shot.gain), pan: between(shot.pan), rate: between(shot.rate) });
        this.shotsDue[i] = ctx.currentTime + between(shot.every);
      }
    });
    const place = this.wantedAmbience;
    if (place?.identity && this.ambienceLoop?.place === place.place) {
      IDENTITY[place.place].forEach((shot, i) => {
        if (ctx.currentTime < (this.identityDue[i] ?? Infinity)) return;
        const pan = between(shot.pan ?? [-0.75, 0.75]);
        this.identityShot(shot, between(shot.gain), pan);
        if (shot.then) this.identityShot(shot.then, shot.then.gain, pan, shot.then.delay);
        this.identityDue[i] = ctx.currentTime + between(shot.every);
      });
    }
  }

  /** The tension drums: a low frame drum on the beat, doubled as the moment tightens. */
  private pulse(on: boolean, interval: number, strength: number) {
    const ctx = this.context!;
    if (!on) { delete this.nextStep.tension; return; }
    let due = this.nextStep.tension ?? ctx.currentTime + .05;
    if (due < ctx.currentTime - .3) due = ctx.currentTime + .05;
    while (due < ctx.currentTime + .22) {
      this.drum(due, this.tensionBus!, strength);
      if (this.tension > 0.55) this.drum(due + interval / 2, this.tensionBus!, strength * 0.6);
      due += interval;
    }
    this.nextStep.tension = due;
  }

  /** Schedules a repeating sound slightly ahead on the audio clock while `on`. */
  private steps(clock: "giant" | "run" | "row", on: boolean, interval: number, make: () => Cue) {
    const ctx = this.context!;
    if (!on) { delete this.nextStep[clock]; return; }
    let due = this.nextStep[clock] ?? ctx.currentTime + .05;
    if (due < ctx.currentTime - .3) due = ctx.currentTime + .05;
    while (due < ctx.currentTime + .22) {
      const { sound, ...cue } = make();
      this.start(sound, this.effects!, { ...cue, delay: due - ctx.currentTime });
      due += interval;
    }
    this.nextStep[clock] = due;
  }
}
