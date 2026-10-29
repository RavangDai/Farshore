// Pure signal processing for Farshore's sound design. Everything renders into
// plain Float32Arrays, so every sound is repeatable from its seed and can be
// tested without a browser. Times are in seconds, frequencies in hertz.

export type Rand = () => number;
export type Stereo = [Float32Array, Float32Array];
/** Acoustic space a sound or voice is heard in; each has its own reverb. */
export type Space = "hall" | "cave" | "sea" | "ethereal" | "storm";
export type FilterType = "lowpass" | "highpass" | "bandpass" | "peaking" | "lowshelf" | "highshelf";
export type Shape = "sine" | "triangle" | "saw" | "square";
type Curve = number | ((t: number) => number);

/** mulberry32: small and fast, with no visible pattern at audio rates. */
export function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const length = (seconds: number, sampleRate: number) => Math.max(1, Math.round(seconds * sampleRate));
const at = (curve: Curve, t: number) => (typeof curve === "function" ? curve(t) : curve);

export function white(n: number, rand: Rand) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rand() * 2 - 1;
  return out;
}

/** Pink noise (Paul Kellet's refined filter): equal energy per octave, like surf and wind. */
export function pink(n: number, rand: Rand) {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown noise: leaky integrated white noise, for rumble and distant surf. */
export function brown(n: number, rand: Rand) {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

/** RBJ cookbook biquad. `set` may be called while running to sweep the filter. */
export class Biquad {
  private type: FilterType;
  private sampleRate: number;
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(type: FilterType, sampleRate: number) {
    this.type = type;
    this.sampleRate = sampleRate;
  }

  set(freq: number, q = Math.SQRT1_2, gainDb = 0) {
    const f = Math.min(Math.max(freq, 10), this.sampleRate * 0.45);
    const w = (2 * Math.PI * f) / this.sampleRate, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q), A = 10 ** (gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    if (this.type === "lowpass") [b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
    else if (this.type === "highpass") [b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
    else if (this.type === "bandpass") [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha];
    else if (this.type === "peaking") [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
    else {
      const s = 2 * Math.sqrt(A) * alpha, sign = this.type === "lowshelf" ? 1 : -1;
      b0 = A * (A + 1 - sign * (A - 1) * cos + s);
      b1 = sign * 2 * A * (A - 1 - sign * (A + 1) * cos);
      b2 = A * (A + 1 - sign * (A - 1) * cos - s);
      a0 = A + 1 + sign * (A - 1) * cos + s;
      a1 = -sign * 2 * (A - 1 + sign * (A + 1) * cos);
      a2 = A + 1 + sign * (A - 1) * cos - s;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }

  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Filters a signal; a function frequency sweeps it (re-tuned every 32 samples). */
export function filtered(signal: Float32Array, type: FilterType, freq: Curve, q: number, sampleRate: number, gainDb = 0) {
  const filter = new Biquad(type, sampleRate), out = new Float32Array(signal.length), sweep = typeof freq === "function";
  if (!sweep) filter.set(freq, q, gainDb);
  for (let i = 0; i < signal.length; i++) {
    if (sweep && (i & 31) === 0) filter.set(at(freq, i / sampleRate), q, gainDb);
    out[i] = filter.run(signal[i]);
  }
  return out;
}

/** Linear attack, optional hold, then an exponential decay that reaches -60 dB after `decay`. */
export function env(n: number, sampleRate: number, attack: number, decay: number, hold = 0) {
  const out = new Float32Array(n), a = Math.max(1, attack * sampleRate), h = hold * sampleRate, k = 6.9 / Math.max(1, decay * sampleRate);
  for (let i = 0; i < n; i++) out[i] = i < a ? i / a : i < a + h ? 1 : Math.exp(-(i - a - h) * k);
  return out;
}

/** An oscillator whose frequency may glide over time. */
export function tone(n: number, sampleRate: number, freq: Curve, shape: Shape = "sine", phase = 0) {
  const out = new Float32Array(n);
  let p = phase;
  for (let i = 0; i < n; i++) {
    p += at(freq, i / sampleRate) / sampleRate;
    p -= Math.floor(p);
    out[i] = shape === "sine" ? Math.sin(2 * Math.PI * p) : shape === "triangle" ? 1 - 4 * Math.abs(p - 0.5) : shape === "saw" ? 2 * p - 1 : p < 0.5 ? 1 : -1;
  }
  return out;
}

/**
 * Karplus-Strong plucked string: one period of filtered noise circulating
 * through a damped delay line, tuned with an allpass for the fractional sample.
 * `position` is where along the string it is plucked (0 to 0.5); plucking
 * near the end removes the harmonics that have a node there, as on a lyre.
 */
export function pluck(n: number, sampleRate: number, freq: number, { decay = 2, brightness = 0.7, position = 0, rand }: { decay?: number; brightness?: number; position?: number; rand: Rand }) {
  const out = new Float32Array(n);
  const loop = sampleRate / freq - 0.5;
  const N = Math.max(2, Math.floor(loop)), d = loop - N, c = (1 - d) / (1 + d);
  const g = Math.pow(0.001, 1 / (decay * freq));
  const excitation = new Float32Array(N), comb = Math.round(position * N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += brightness * (rand() * 2 - 1 - lp);
    excitation[i] = lp;
  }
  let mean = 0;
  for (let i = 0; i < N; i++) mean += (excitation[i] - (comb && i >= comb ? excitation[i - comb] : 0)) / N;
  for (let i = 0; i < N && i < n; i++) out[i] = excitation[i] - (comb && i >= comb ? excitation[i - comb] : 0) - mean;
  let apIn = 0, apOut = 0;
  for (let i = N; i < n; i++) {
    const averaged = g * 0.5 * (out[i - N] + (i - N - 1 >= 0 ? out[i - N - 1] : 0));
    const y = c * averaged + apIn - c * apOut;
    apIn = averaged;
    apOut = y;
    out[i] = y;
  }
  return out;
}

/** A struck resonant body (bronze, stone, wood, glass): decaying partials with random phase. */
export function modal(n: number, sampleRate: number, modes: { freq: number; decay: number; gain: number }[], rand: Rand) {
  const out = new Float32Array(n), onset = Math.max(1, Math.round(sampleRate * 0.0006));
  for (const m of modes) {
    if (m.freq <= 0 || m.freq >= sampleRate / 2) continue;
    const k = 6.9 / (m.decay * sampleRate), w = (2 * Math.PI * m.freq) / sampleRate, phase = rand() * 2 * Math.PI;
    for (let i = 0; i < n; i++) out[i] += m.gain * Math.exp(-i * k) * Math.sin(w * i + phase) * Math.min(1, i / onset);
  }
  return out;
}

/** Scattered noise grains: gravel, debris, crackle, rain. `rate` is grains per second. */
export function grains(
  n: number,
  sampleRate: number,
  rand: Rand,
  { rate, size = [0.002, 0.01], band = [800, 4000], gain = 1 }: { rate: Curve; size?: [number, number]; band?: [number, number]; gain?: number },
) {
  const out = new Float32Array(n), step = Math.max(1, Math.round(sampleRate * 0.005));
  for (let start = 0; start < n; start += step) {
    const expected = (at(rate, start / sampleRate) * step) / sampleRate;
    let count = Math.floor(expected) + (rand() < expected % 1 ? 1 : 0);
    while (count-- > 0) {
      const offset = start + Math.floor(rand() * step);
      const span = Math.max(4, Math.round((size[0] + rand() * (size[1] - size[0])) * sampleRate));
      const filter = new Biquad("bandpass", sampleRate).set(band[0] * Math.pow(band[1] / band[0], rand()), 1.2 + rand() * 2);
      const amp = gain * (0.3 + 0.7 * rand());
      for (let i = 0; i < span && offset + i < n; i++) out[offset + i] += filter.run((rand() * 2 - 1) * amp * Math.exp((-5 * i) / span));
    }
  }
  return out;
}

export function mix(into: Float32Array, from: Float32Array, gain = 1, offset = 0) {
  for (let i = 0; i < from.length && i + offset < into.length; i++) if (i + offset >= 0) into[i + offset] += from[i] * gain;
  return into;
}

export function mul(signal: Float32Array, by: Float32Array) {
  for (let i = 0; i < signal.length; i++) signal[i] *= i < by.length ? by[i] : 0;
  return signal;
}

/** tanh saturation, normalized so a full-scale input stays at full scale. */
export function softClip(signal: Float32Array, drive = 1) {
  const k = Math.tanh(drive);
  for (let i = 0; i < signal.length; i++) signal[i] = Math.tanh(signal[i] * drive) / k;
  return signal;
}

export function peak(...channels: Float32Array[]) {
  let max = 0;
  for (const channel of channels) for (let i = 0; i < channel.length; i++) max = Math.max(max, Math.abs(channel[i]));
  return max;
}

/** Scales every channel by one factor so the loudest sample reaches `target`. */
export function normalize<T extends Float32Array | Float32Array[]>(signal: T, target = 0.9): T {
  const channels: Float32Array[] = Array.isArray(signal) ? (signal as Float32Array[]) : [signal as Float32Array];
  const max = peak(...channels);
  if (max > 0) for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] *= target / max;
  return signal;
}

/** Short fades at both ends, so no sound starts or stops with a click. */
export function fade(signal: Float32Array, sampleRate: number, fadeIn = 0.002, fadeOut = 0.012) {
  const a = Math.min(signal.length, Math.round(fadeIn * sampleRate)), b = Math.min(signal.length, Math.round(fadeOut * sampleRate));
  for (let i = 0; i < a; i++) signal[i] *= i / a;
  for (let i = 0; i < b; i++) signal[signal.length - 1 - i] *= i / b;
  return signal;
}

/**
 * Makes a loop seamless: the input runs `crossfade` seconds past the loop
 * length, and that overhang is blended equal-power into the start.
 */
export function seamless(channels: Float32Array[], sampleRate: number, crossfade: number): Float32Array[] {
  const x = Math.round(crossfade * sampleRate);
  return channels.map(input => {
    const n = input.length - x, out = input.slice(0, n);
    for (let i = 0; i < x; i++) {
      const t = i / x;
      out[i] = input[i] * Math.sin((t * Math.PI) / 2) + input[n + i] * Math.cos((t * Math.PI) / 2);
    }
    return out;
  });
}

const SPACES: Record<Space, { seconds: number; rt60: number; predelay: number; bright: number; dark: number; reflections: number }> = {
  hall: { seconds: 2.2, rt60: 1.7, predelay: 0.012, bright: 9000, dark: 2500, reflections: 6 },
  cave: { seconds: 3.6, rt60: 3.0, predelay: 0.022, bright: 6000, dark: 1100, reflections: 12 },
  sea: { seconds: 1, rt60: 0.6, predelay: 0.004, bright: 7000, dark: 2000, reflections: 2 },
  ethereal: { seconds: 5, rt60: 4.2, predelay: 0.03, bright: 12000, dark: 5000, reflections: 3 },
  storm: { seconds: 2.6, rt60: 2, predelay: 0.015, bright: 4500, dark: 1000, reflections: 4 },
};

/** A stereo reverb impulse: decorrelated noise whose tail decays and darkens like a real room. */
export function impulseResponse(space: Space, sampleRate: number, seed = 1): Stereo {
  const spec = SPACES[space];
  const channel = (c: number) => {
    const rand = rng(seed * 7919 + c * 104729 + 1);
    const n = length(spec.seconds, sampleRate), pre = Math.round(spec.predelay * sampleRate), out = new Float32Array(n);
    const k = 6.9 / (spec.rt60 * sampleRate);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre), cutoff = spec.bright * Math.pow(spec.dark / spec.bright, t);
      lp += (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) * (rand() * 2 - 1 - lp);
      out[i] = lp * Math.exp(-(i - pre) * k);
    }
    for (let r = 0; r < spec.reflections; r++) {
      const where = pre + Math.round((0.003 + rand() * 0.075) * sampleRate);
      if (where < n) out[where] += (rand() < 0.5 ? -1 : 1) * (0.55 - r * 0.03);
    }
    return fade(out, sampleRate, 0, 0.05);
  };
  return normalize([channel(0), channel(1)], 0.9) as Stereo;
}
