import { fade, impulseResponse, normalize, rng, type Space } from "./dsp.ts";
import { sounds, type Recipe, type SoundName } from "./sounds.ts";
import { scenes, type LoopName, type SceneName } from "./ambience.ts";
import type { AudioFrame, Cue } from "./cues.ts";

export type MusicMood = "title" | "voyage" | "danger" | "home";
export type AudioCue = "send" | "reply" | "costly" | "sail" | "select";
export type AudioSettings = {
  enabled: boolean;
  music: number;
  effects: number;
  ducked: boolean;
  quiet: boolean;
  mood: MusicMood;
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
/** No more than this many copies of one sound at once (the oldest is cut), and this many overall. */
const PER_SOUND = 4, VOICES = 24;
const perSound: Partial<Record<SoundName, number>> = { ting: 12, "step-stone": 3, "giant-step": 3 };
/** Sounds a slider or held key could fire every frame start at most this often, in seconds. */
const minGap: Partial<Record<SoundName, number>> = { "bow-draw": 0.12, "glass-tick": 0.04, swish: 0.05 };
/** How much of each space's reverb the effects hear. */
const reverbSend: Record<Space, number> = { cave: 0.38, hall: 0.22, sea: 0.1, ethereal: 0.3, storm: 0.25 };
const hash = (text: string) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

type Voice = { name: SoundName; source: AudioBufferSourceNode; ends: number };
type Bed = { source: AudioBufferSourceNode; gain: GainNode; level: number; drive?: LoopName };

/**
 * Farshore's sound: the original D-minor score, the sound effects, and each
 * scene's ambience, all scheduled on the audio clock. Effects and ambience are
 * rendered in code (see sounds.ts); nothing is downloaded.
 */
export class VoyageAudio {
  private context: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private ambience: GainNode | null = null;
  private send: GainNode | null = null;
  private reverbs: { convolver: ConvolverNode; gain: GainNode }[] = [];
  private activeReverb = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private layers: Layer[] = [];
  private sources = new Set<AudioScheduledSourceNode>();
  private buffers = new Map<string, AudioBuffer>();
  private voices: Voice[] = [];
  private lastStart = new Map<SoundName, number>();
  private disposed = false;
  private settings: AudioSettings = { enabled: false, music: .35, effects: .55, ducked: false, quiet: false, mood: "title" };
  private wantedScene: SceneName = "sea";
  private scene: SceneName | null = null;
  private beds: Bed[] = [];
  private shotsDue: number[] = [];
  private loops: Partial<Record<LoopName, number>> = {};
  private nextStep: Partial<Record<"giant" | "run" | "row", number>> = {};
  private stride = 1;

  async unlock() {
    if (this.disposed) return;
    if (!this.context) {
      const ctx = new AudioContext();
      this.context = ctx;
      // Created first and second: music, then effects (the settings' two volumes).
      this.music = ctx.createGain();
      this.effects = ctx.createGain();
      this.ambience = ctx.createGain();
      this.send = ctx.createGain();
      const master = ctx.createGain(), compressor = ctx.createDynamicsCompressor(), limiter = ctx.createDynamicsCompressor();
      for (const bus of [this.music, this.effects, this.ambience]) bus.gain.value = 0;
      compressor.threshold.value = -18;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.2;
      limiter.threshold.value = -3;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      master.connect(compressor);
      compressor.connect(limiter);
      limiter.connect(ctx.destination);
      // A little space around the instruments, with bounded feedback.
      const echo = ctx.createDelay(1), feedback = ctx.createGain(), filter = ctx.createBiquadFilter();
      echo.delayTime.value = .31;
      feedback.gain.value = .19;
      filter.type = "lowpass";
      filter.frequency.value = 1700;
      this.music.connect(master);
      this.music.connect(echo);
      echo.connect(filter);
      filter.connect(feedback);
      feedback.connect(echo);
      feedback.connect(master);
      this.effects.connect(master);
      this.ambience.connect(master);
      // Two reverbs, so a change of scene can crossfade between spaces.
      for (let i = 0; i < 2; i++) {
        const convolver = ctx.createConvolver(), gain = ctx.createGain();
        gain.gain.value = 0;
        this.send.connect(convolver);
        convolver.connect(gain);
        gain.connect(master);
        this.reverbs.push({ convolver, gain });
      }
    }
    await this.context.resume();
    this.apply();
  }

  update(settings: AudioSettings) {
    this.settings = { ...settings, music: volume(settings.music), effects: volume(settings.effects) };
    this.apply();
  }

  /** Sound for one simulation step: what was heard, the continuous loops, and where we are. */
  frame(frame: AudioFrame) {
    this.setScene(frame.scene);
    this.setLoops(frame.loops);
    this.play(frame.cues);
  }

  play(cues: Cue[]) {
    if (!this.running()) return;
    for (const cue of cues) this.start(cue.sound, this.effects!, cue);
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

  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const source of this.sources) { try { source.stop(); } catch { /* Already stopped. */ } }
    this.sources.clear();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.context = null;
  }

  private running() {
    return !!this.context && !this.disposed && this.settings.enabled && !this.settings.quiet && this.context.state === "running";
  }

  private track(source: AudioScheduledSourceNode, cleanup: () => void = () => {}) {
    this.sources.add(source);
    source.onended = () => { source.disconnect(); this.sources.delete(source); cleanup(); };
  }

  private apply() {
    const ctx = this.context;
    if (!ctx || this.disposed) return;
    const active = this.settings.enabled && !this.settings.quiet;
    const ducked = this.settings.ducked;
    this.music!.gain.setTargetAtTime(active ? this.settings.music * (ducked ? .22 : 1) : 0, ctx.currentTime, .16);
    this.effects!.gain.setTargetAtTime(active ? this.settings.effects : 0, ctx.currentTime, .03);
    this.ambience!.gain.setTargetAtTime(active ? this.settings.effects * 0.7 * (ducked ? 0.5 : 1) : 0, ctx.currentTime, .3);
    this.send!.gain.setTargetAtTime(active ? this.settings.effects : 0, ctx.currentTime, .03);
    if (!active) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      void ctx.suspend().catch(() => {});
      return;
    }
    // resume() only occurs here after a context was unlocked by a player gesture.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const current = this.layers.find((layer) => !layer.retire);
    if (!current || current.mood !== this.settings.mood) {
      const now = ctx.currentTime;
      for (const layer of this.layers) {
        if (layer.retire) continue;
        layer.gain.gain.cancelScheduledValues(now);
        layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
        layer.gain.gain.linearRampToValueAtTime(0, now + 1.8);
        layer.retire = now + 3.8;
      }
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(1, now + 1.8);
      gain.connect(this.music!);
      this.layers.push({ gain, mood: this.settings.mood, step: 0, next: now + .04 });
    }
    if (this.scene !== this.wantedScene) this.startScene();
    if (!this.timer) {
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 100);
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

  private drum(at: number, destination: AudioNode) {
    const ctx = this.context!, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.frequency.setValueAtTime(115, at);
    oscillator.frequency.exponentialRampToValueAtTime(48, at + .19);
    gain.gain.setValueAtTime(.065, at);
    gain.gain.exponentialRampToValueAtTime(.0001, at + .25);
    oscillator.connect(gain);
    gain.connect(destination);
    this.track(oscillator, () => gain.disconnect());
    oscillator.start(at);
    oscillator.stop(at + .28);
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
    const shots = scenes[this.scene ?? this.wantedScene].shots;
    shots.forEach((shot, i) => {
      if (this.scene && ctx.currentTime >= (this.shotsDue[i] ?? Infinity)) {
        this.start(shot.sound, this.ambience!, { gain: between(shot.gain), pan: between(shot.pan), rate: between(shot.rate) });
        this.shotsDue[i] = ctx.currentTime + between(shot.every);
      }
    });
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
