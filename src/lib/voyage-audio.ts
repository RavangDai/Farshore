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
  if (["ithaca", "nausicaa"].includes(encounter)) return "home";
  return ["cyclops", "underworld", "sirens", "scylla", "cattle"].includes(encounter) ? "danger" : "voyage";
}

const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const volume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Original D-minor score, scheduled on the audio clock. No network or audio assets. */
export class VoyageAudio {
  private context: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private layers: Layer[] = [];
  private noise: AudioBuffer | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private disposed = false;
  private settings: AudioSettings = { enabled: false, music: .35, effects: .55, ducked: false, quiet: false, mood: "title" };

  async unlock() {
    if (this.disposed) return;
    if (!this.context) {
      const ctx = new AudioContext();
      this.context = ctx;
      this.music = ctx.createGain();
      this.effects = ctx.createGain();
      this.music.gain.value = 0;
      this.effects.gain.value = 0;
      // A little space around the instruments, with bounded feedback.
      const echo = ctx.createDelay(1), feedback = ctx.createGain(), filter = ctx.createBiquadFilter();
      echo.delayTime.value = .31;
      feedback.gain.value = .19;
      filter.type = "lowpass";
      filter.frequency.value = 1700;
      this.music.connect(ctx.destination);
      this.music.connect(echo);
      echo.connect(filter);
      filter.connect(feedback);
      feedback.connect(echo);
      feedback.connect(ctx.destination);
      this.effects.connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      // Seeded noise makes the sea bed repeatable and avoids runtime randomness.
      let seed = 421;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        samples[i] = seed / 2147483648;
      }
      this.startSea();
    }
    await this.context.resume();
    this.apply();
  }

  update(settings: AudioSettings) {
    this.settings = { ...settings, music: volume(settings.music), effects: volume(settings.effects) };
    this.apply();
  }

  private track(source: AudioScheduledSourceNode, cleanup: () => void = () => {}) {
    this.sources.add(source);
    source.onended = () => { source.disconnect(); this.sources.delete(source); cleanup(); };
  }

  private startSea() {
    const ctx = this.context!;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 650;
    gain.gain.value = .055;
    const swell = ctx.createOscillator(), depth = ctx.createGain();
    swell.frequency.value = .075;
    depth.gain.value = .025;
    swell.connect(depth);
    depth.connect(gain.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.music!);
    this.track(source, () => { filter.disconnect(); gain.disconnect(); });
    this.track(swell, () => depth.disconnect());
    source.start();
    swell.start();
  }

  private apply() {
    const ctx = this.context;
    if (!ctx || this.disposed) return;
    const active = this.settings.enabled && !this.settings.quiet;
    this.music!.gain.setTargetAtTime(active ? this.settings.music * (this.settings.ducked ? .22 : 1) : 0, ctx.currentTime, .16);
    this.effects!.gain.setTargetAtTime(active ? this.settings.effects : 0, ctx.currentTime, .03);
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
    if (!this.timer) {
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 100);
    }
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
  }

  cue(cue: AudioCue) {
    if (!this.context || !this.settings.enabled || this.settings.quiet || this.context.state !== "running") return;
    const notes: Record<AudioCue, number[]> = { send: [74, 81], reply: [74, 77, 81], costly: [77, 76, 69], sail: [62, 69, 74, 81], select: [81] };
    notes[cue].forEach((note, index) => this.note(note, this.context!.currentTime + index * .095, .34, cue === "select" ? .04 : .09, this.effects!, "sine"));
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
}
