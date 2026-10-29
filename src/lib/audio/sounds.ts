import {
  Biquad, brown, env, filtered, grains, length, mix, modal, mul, pink, seamless, softClip, tone, white,
  type FilterType, type Rand, type Stereo,
} from "./dsp.ts";

// Farshore's sound library. Every sound is rendered in code from a seed: a
// recipe models the physical event (a string plucked, bronze struck, gravel
// scattered, a giant's throat) instead of playing back a recording. The bank
// renders a few variants of each so repeats never sound identical, normalizes
// them, and mixes them at the `gain` given here. Low, heavy sounds render at
// a lower `rate` to save time; the audio hardware resamples them.
//
// The recipes were checked against an AudioSet classifier, which hears the
// boulder as an explosion, the shield as a clang, the coin as a ding, the roar
// as a bellow, the rain as rain and the strummed lyre as a plucked string.

type Render = (sampleRate: number, rand: Rand) => Float32Array | Stereo;
export type Recipe = { seconds: number; variants: number; gain: number; rate?: number; loop?: boolean; render: Render };

export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const sweep = (from: number, to: number, seconds: number) => (t: number) => from * Math.pow(to / from, Math.min(1, t / seconds));
const glide = (from: number, to: number, time: number) => (t: number) => to + (from - to) * Math.exp(-t / time);
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
const noise = { white, pink, brown };

function layer(sr: number, seconds: number, ...parts: [Float32Array, number, number?][]) {
  const out = new Float32Array(length(seconds, sr));
  for (const [signal, gain, offset = 0] of parts) mix(out, signal, gain, Math.round(offset * sr));
  return out;
}

/** Shaped, filtered noise: the body of scrapes, splashes, cracks and wind. */
function burst(sr: number, rand: Rand, seconds: number, o: { type: FilterType; freq: number | ((t: number) => number); q: number; attack: number; decay: number; hold?: number; color?: keyof typeof noise }) {
  const n = length(seconds, sr);
  return mul(filtered(noise[o.color ?? "white"](n, rand), o.type, o.freq, o.q, sr), env(n, sr, o.attack, o.decay, o.hold ?? 0));
}

/** A whoosh: band-passed pink noise whose band travels from `from` to `to`. */
const swish = (sr: number, rand: Rand, seconds: number, from: number, to: number, q: number, attack: number, decay: number) =>
  burst(sr, rand, seconds, { type: "bandpass", freq: sweep(from, to, seconds), q, attack, decay, color: "pink" });

/** A body landing on something: low-passed noise with a short sub-bass kick under it. */
function thud(sr: number, rand: Rand, seconds: number, cutoff: number, decay: number, sub = 0.5) {
  const n = length(seconds, sr);
  const body = mul(filtered(white(n, rand), "lowpass", cutoff, 0.7, sr), env(n, sr, 0.0008, decay));
  return mix(body, mul(tone(n, sr, glide(cutoff * 0.22, cutoff * 0.15, 0.03)), env(n, sr, 0.001, Math.min(0.06, decay * 0.7))), sub);
}

/** Gravel, grit and splinters: many tiny grains settling away. */
const crunch = (sr: number, rand: Rand, seconds: number, rate: number, settle: number, band: [number, number], gain = 0.6, size: [number, number] = [0.0008, 0.003]) =>
  grains(length(seconds, sr), sr, rand, { rate: t => rate * Math.exp(-t / settle), size, band, gain });

/** Larger debris: stones and chips scattering after an impact. */
const debris = (sr: number, rand: Rand, seconds: number, rate: number, settle: number, band: [number, number] = [500, 4000], gain = 0.6) =>
  crunch(sr, rand, seconds, rate, settle, band, gain, [0.002, 0.012]);

/**
 * A plucked string built from its partials: plucking position shapes them,
 * stiffness spreads them slightly, and high partials die first, so the note
 * mellows the way gut strings do.
 */
function string(n: number, sr: number, f0: number, { decay = 1.2, brightness = 0.5, position = 0.2, stiffness = 0.00012, damping = 0.06, rand }: { decay?: number; brightness?: number; position?: number; stiffness?: number; damping?: number; rand: Rand }) {
  const out = new Float32Array(n), attack = Math.round(sr * 0.0015);
  for (let k = 1; k <= 40; k++) {
    const f = k * f0 * Math.sqrt(1 + stiffness * k * k);
    if (f > sr * 0.45) break;
    const a = Math.abs(Math.sin(k * Math.PI * position)) / Math.pow(k, 2 - brightness);
    if (a < 1e-4) continue;
    const rate = 6.9 / ((decay / (1 + damping * (k - 1) * (k - 1))) * sr), w = (2 * Math.PI * f) / sr, phase = rand() * 0.3;
    for (let i = 0; i < n; i++) out[i] += a * Math.exp(-i * rate) * Math.sin(w * i + phase);
  }
  for (let i = 0; i < attack && i < n; i++) out[i] *= i / attack;
  return out;
}

/** Lyre and harp: plucked strings with a pick, through a small wooden soundbox. */
function lyre(sr: number, rand: Rand, seconds: number, notes: number[], { spacing = 0.06, decay = 1.3, brightness = 0.5, level = 0.5 } = {}) {
  const n = length(seconds, sr), strings = new Float32Array(n);
  notes.forEach((midi, i) => {
    const at = Math.round(i * spacing * sr);
    if (at >= n) return;
    mix(strings, string(n - at, sr, hz(midi), { decay: decay * Math.pow(220 / hz(midi), 0.3), brightness, rand }), level, at);
    mix(strings, burst(sr, rand, 0.01, { type: "bandpass", freq: 3000, q: 0.8, attack: 0.0002, decay: 0.004 }), level * 0.12, at);
  });
  const out = strings.slice();
  mix(out, filtered(strings, "bandpass", 380, 1.4, sr), 0.4);
  return mix(out, filtered(strings, "bandpass", 1000, 1.8, sr), 0.15);
}

/** A struck metal or glass body with the given partial ratios. */
function bell(sr: number, rand: Rand, seconds: number, f: number, decay: number, ratios = [1, 2.76, 5.4, 8.93], gains = [1, 0.45, 0.25, 0.12]) {
  return modal(length(seconds, sr), sr, ratios.map((r, i) => ({ freq: f * r, decay: decay / (1 + i * 0.7), gain: gains[i] ?? 0.1 })), rand);
}

/** Air bubbles and water droplets: sine chirps rising as each bubble shrinks. */
function bubbles(sr: number, rand: Rand, seconds: number, count: number, [lo, hi]: [number, number], spread: number, level = 0.4) {
  const n = length(seconds, sr), out = new Float32Array(n);
  for (let b = 0; b < count; b++) {
    const at = Math.round(rand() * spread * sr), f = lo * Math.pow(hi / lo, rand()), life = 0.012 + rand() * 0.03, m = length(life * 2, sr);
    mix(out, mul(tone(m, sr, t => f * (1 + 1.4 * Math.min(1, t / life))), env(m, sr, 0.001, life)), level * (0.4 + 0.6 * rand()), at);
  }
  return out;
}

/** A slow random wander between 0 and 1, for gusts, swells and flicker. */
function wander(n: number, sr: number, rand: Rand, rate: number) {
  const out = new Float32Array(n), step = Math.max(1, Math.round(sr / (rate * 8)));
  let value = rand(), from = value, target = rand();
  for (let i = 0; i < n; i++) {
    if (i % step === 0) { from = value; target = rand(); }
    const t = (i % step) / step;
    value = from + (target - from) * (t * t * (3 - 2 * t));
    out[i] = value;
  }
  return out;
}

/** Stereo loop: each channel renders with its own noise, then wraps without a seam. */
function loop(sr: number, rand: Rand, seconds: number, channel: (n: number, rand: Rand) => Float32Array): Stereo {
  const n = length(seconds + 0.5, sr);
  return seamless([channel(n, rand), channel(n, rand)], sr, 0.5) as Stereo;
}

/**
 * A throat: glottal pulses with cycle-to-cycle jitter, uneven strength and
 * alternate weak pulses (period doubling), plus breath. Rough settings give a
 * giant's grunt or roar; this is what makes it an animal and not an engine.
 */
function glottal(sr: number, rand: Rand, seconds: number, pitch: (t: number) => number, { jitter = 0.1, shimmer = 0.4, doubling = 0.5, breath = 1 } = {}) {
  const n = length(seconds, sr), pulses = new Float32Array(n), open = new Float32Array(n);
  let t = 0, odd = false;
  while (t < seconds) {
    const period = (1 / pitch(t)) * (1 + jitter * (rand() * 2 - 1)), amp = (1 + shimmer * (rand() * 2 - 1)) * (odd ? 1 - doubling : 1);
    const start = Math.round(t * sr), span = Math.max(2, Math.round(period * sr));
    for (let k = 0; k < span && start + k < n; k++) {
      const x = k / span, g = x < 0.6 ? 0.5 * (1 - Math.cos((Math.PI * x) / 0.6)) : x < 0.85 ? Math.cos((Math.PI * (x - 0.6)) / 0.5) : 0;
      pulses[start + k] += amp * g;
      open[start + k] = g;
    }
    odd = !odd;
    t += period;
  }
  for (let i = n - 1; i > 0; i--) pulses[i] = (pulses[i] - pulses[i - 1]) * 8;
  const air = white(n, rand);
  for (let i = 0; i < n; i++) pulses[i] += air[i] * breath * (0.3 + open[i]);
  return pulses;
}

/** The mouth: two moving formants and a fixed third shape the throat into a vowel. */
function mouth(sr: number, source: Float32Array, f1: (t: number) => number, f2: (t: number) => number, f3 = 2500) {
  const out = new Float32Array(source.length);
  mix(out, filtered(source, "bandpass", f1, 4, sr), 1);
  mix(out, filtered(source, "bandpass", f2, 5, sr), 0.6);
  return mix(out, filtered(source, "bandpass", f3, 6, sr), 0.25);
}

/** One sung "ah" or "oh": harmonics under vowel formants, with a soft scoop and vibrato. */
function sung(sr: number, rand: Rand, seconds: number, f0: number, vowel: number[][], { detune = 1, vibrato = 0.004, breath = 0.15 } = {}) {
  const n = length(seconds, sr), out = new Float32Array(n);
  const shape = (f: number) => vowel.reduce((a, [F, B, g]) => a + g / (1 + ((f - F) / B) ** 2), 0.01);
  const count = Math.min(24, Math.floor(6000 / f0)), phases = Array.from({ length: count }, () => rand() * 2 * Math.PI), weights = new Float32Array(count);
  let phase = 0, drift = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (i % 128 === 0) drift += (rand() * 2 - 1) * 0.0015 - drift * 0.05;
    const f = f0 * detune * (1 + vibrato * Math.min(1, Math.max(0, (t - 0.15) / 0.3)) * Math.sin(2 * Math.PI * 5.3 * t) + (t < 0.08 ? -0.03 * (1 - t / 0.08) : 0) + drift);
    phase += f / sr;
    if (i % 64 === 0) for (let k = 1; k <= count; k++) weights[k - 1] = shape(k * f) / Math.pow(k, 1.6);
    let s = 0;
    for (let k = 1; k <= count; k++) s += weights[k - 1] * Math.sin(2 * Math.PI * k * phase + phases[k - 1]);
    out[i] = s;
  }
  mix(out, filtered(pink(n, rand), "bandpass", 2800, 0.8, sr), breath * 0.05);
  return mul(out, env(n, sr, 0.12, seconds * 0.4, seconds * 0.42));
}
const AH = [[750, 90, 1], [1150, 110, 0.55], [2800, 160, 0.3], [3300, 200, 0.12]];
const OH = [[500, 80, 1], [880, 100, 0.5], [2700, 160, 0.2]];

/** Stick-slip friction (a hull, a mast, a bow): fast, jittered slips ringing a wooden body. */
function creaking(sr: number, rand: Rand, seconds: number, rate: (t: number) => number, body: number) {
  const n = length(seconds, sr), pulses = new Float32Array(n);
  for (let t = 0; t < seconds; t += (1 / rate(t)) * (1 + 0.5 * (rand() * 2 - 1))) {
    const i = Math.round(t * sr);
    if (i < n) pulses[i] = 0.5 + 0.5 * rand();
  }
  return mix(filtered(pulses, "bandpass", body, 5, sr), filtered(pulses, "bandpass", body * 2.3, 4, sr), 0.6);
}

/** Fire: clusters of sharp crackles, a few at a time, at random moments. */
function crackles(sr: number, rand: Rand, n: number, perSecond: number) {
  const out = new Float32Array(n);
  for (let t = -Math.log(1 - rand()) / perSecond; t < n / sr; t += -Math.log(1 - rand()) / perSecond) {
    for (let c = 1 + Math.floor(rand() * 5); c > 0; c--) {
      const at = Math.round((t + rand() * 0.06) * sr), span = Math.max(2, Math.round((0.0003 + rand() * 0.0012) * sr));
      const filter = new Biquad("highpass", sr).set(1500 + rand() * 3000), amp = 0.4 + 0.6 * rand();
      for (let k = 0; k < span && at + k < n; k++) out[at + k] += filter.run((rand() * 2 - 1) * amp * (1 - k / span));
    }
  }
  return out;
}

/** Thunder after the crack: rolling, irregular low rumble with a few late booms. */
function rolling(sr: number, rand: Rand, seconds: number, attack: number) {
  const n = length(seconds, sr);
  const low = mul(mul(filtered(brown(n, rand), "lowpass", 220, 0.7, sr), wander(n, sr, rand, 0.9).map(v => 0.3 + 0.7 * v)), env(n, sr, attack, seconds * 0.85));
  const mid = mul(mul(filtered(pink(n, rand), "bandpass", 450, 0.7, sr), wander(n, sr, rand, 1.3)), env(n, sr, attack, seconds * 0.6));
  const out = mix(low, mid, 0.35);
  for (let b = 0; b < 2; b++) mix(out, thud(sr, rand, 0.8, 160, 0.5, 0.6), 0.4 + rand() * 0.2, Math.round((0.4 + rand() * 1.2) * sr));
  return out;
}

export const sounds = {
  // --- Interface and story ------------------------------------------------
  "ui-tick": { seconds: 0.08, variants: 3, gain: 0.3, render: (sr, r) => layer(sr, 0.08, [modal(length(0.08, sr), sr, [{ freq: 1800, decay: 0.02, gain: 1 }, { freq: 3900, decay: 0.012, gain: 0.4 }], r), 1], [burst(sr, r, 0.01, { type: "highpass", freq: 4000, q: 0.7, attack: 0.0002, decay: 0.003 }), 0.3]) },
  "ui-confirm": { seconds: 0.9, variants: 2, gain: 0.42, render: (sr, r) => lyre(sr, r, 0.9, [74, 81], { spacing: 0.07, decay: 0.9 }) },
  "ui-back": { seconds: 0.8, variants: 2, gain: 0.38, render: (sr, r) => lyre(sr, r, 0.8, [69, 62], { spacing: 0.08, decay: 0.8 }) },
  reply: { seconds: 1.1, variants: 2, gain: 0.42, render: (sr, r) => lyre(sr, r, 1.1, [74, 77, 81], { spacing: 0.08, decay: 1 }) },
  costly: { seconds: 1, variants: 2, gain: 0.5, render: (sr, r) => layer(sr, 1, [lyre(sr, r, 1, [50, 51, 45], { spacing: 0.02, decay: 1, brightness: 0.35 }), 1], [thud(sr, r, 0.3, 220, 0.12), 0.4]) },
  sail: { seconds: 1.7, variants: 2, gain: 0.5, render: (sr, r) => layer(sr, 1.7, [lyre(sr, r, 1.7, [62, 66, 69, 74], { spacing: 0.025, decay: 1.5 }), 1], [swish(sr, r, 1.2, 300, 900, 0.8, 0.4, 0.6), 0.3]) },
  countdown: { seconds: 0.4, variants: 2, gain: 0.55, render: (sr, r) => layer(sr, 0.4, [modal(length(0.4, sr), sr, [{ freq: 110, decay: 0.22, gain: 1 }, { freq: 175, decay: 0.15, gain: 0.5 }, { freq: 235, decay: 0.1, gain: 0.3 }], r), 0.8], [burst(sr, r, 0.06, { type: "bandpass", freq: 900, q: 1, attack: 0.0005, decay: 0.03 }), 0.4], [thud(sr, r, 0.12, 250, 0.05), 0.5]) },
  go: { seconds: 1.5, variants: 1, gain: 0.6, render: (sr, r) => layer(sr, 1.5, [lyre(sr, r, 1.5, [62, 66, 69, 74, 78], { spacing: 0.015, decay: 1.3, brightness: 0.65 }), 1], [modal(length(0.5, sr), sr, [{ freq: 95, decay: 0.3, gain: 1 }, { freq: 152, decay: 0.2, gain: 0.5 }], r), 0.6], [burst(sr, r, 1, { type: "highpass", freq: 6000, q: 0.7, attack: 0.002, decay: 0.6 }), 0.12]) },
  victory: { seconds: 2.8, variants: 1, gain: 0.6, render: (sr, r) => layer(sr, 2.8, [lyre(sr, r, 2.8, [62, 66, 69, 74, 78, 81], { spacing: 0.07, decay: 2.2 }), 1], [lyre(sr, r, 2.3, [50, 57, 62], { spacing: 0.01, decay: 2.4, brightness: 0.4 }), 0.7, 0.42], [burst(sr, r, 1.8, { type: "highpass", freq: 7000, q: 0.7, attack: 0.3, decay: 1.2 }), 0.1, 0.4]) },
  defeat: { seconds: 2.3, variants: 1, gain: 0.55, render: (sr, r) => layer(sr, 2.3, [lyre(sr, r, 2.3, [62, 60, 57, 53, 50], { spacing: 0.13, decay: 1.4, brightness: 0.35 }), 1], [thud(sr, r, 0.6, 180, 0.35), 0.5, 0.55]) },

  // --- Moving through the world -------------------------------------------
  "step-stone": { seconds: 0.22, variants: 4, gain: 0.3, render: (sr, r) => layer(sr, 0.22, [thud(sr, r, 0.1, 380, 0.03, 0.3), 1], [thud(sr, r, 0.08, 520, 0.02, 0.2), 0.5, 0.05 + r() * 0.03], [crunch(sr, r, 0.22, 2000, 0.04, [1200, 7000]), 0.3], [burst(sr, r, 0.06, { type: "bandpass", freq: 2200, q: 0.8, attack: 0.001, decay: 0.025 }), 0.2, 0.05]) },
  "step-grass": { seconds: 0.22, variants: 4, gain: 0.26, render: (sr, r) => layer(sr, 0.22, [thud(sr, r, 0.1, 220, 0.035, 0.2), 0.6], [crunch(sr, r, 0.22, 3000, 0.07, [2500, 9000], 0.6, [0.001, 0.004]), 0.7], [burst(sr, r, 0.15, { type: "bandpass", freq: 4000, q: 0.7, attack: 0.004, decay: 0.09, color: "pink" }), 0.35]) },
  jump: { seconds: 0.34, variants: 3, gain: 0.32, render: (sr, r) => layer(sr, 0.34, [swish(sr, r, 0.34, 380, 1500, 2.2, 0.1, 0.16), 1], [crunch(sr, r, 0.1, 1500, 0.03, [1500, 6000], 0.4), 0.3]) },
  land: { seconds: 0.28, variants: 3, gain: 0.42, render: (sr, r) => layer(sr, 0.28, [thud(sr, r, 0.2, 260, 0.07, 0.5), 1], [crunch(sr, r, 0.28, 3500, 0.06, [1000, 6000]), 0.6], [burst(sr, r, 0.08, { type: "bandpass", freq: 1800, q: 0.8, attack: 0.001, decay: 0.03 }), 0.25, 0.01]) },
  slide: {
    seconds: 0.65, variants: 3, gain: 0.34,
    render: (sr, r) => {
      const n = length(0.65, sr), shape = env(n, sr, 0.04, 0.25, 0.3);
      return mul(layer(sr, 0.65, [filtered(pink(n, r), "bandpass", sweep(1600, 1100, 0.6), 0.8, sr), 1], [grains(n, sr, r, { rate: 6000, size: [0.0005, 0.0015], band: [1500, 7000], gain: 0.35 }), 0.9], [filtered(white(n, r), "lowpass", 250, 0.7, sr), 0.15]), shape);
    },
  },
  swish: { seconds: 0.32, variants: 3, gain: 0.28, render: (sr, r) => swish(sr, r, 0.32, 1400, 500, 1.6, 0.1, 0.18) },
  "pass-by": { seconds: 0.44, variants: 3, gain: 0.22, render: (sr, r) => swish(sr, r, 0.44, 900, 300, 1.8, 0.16, 0.22) },

  // --- Rewards -------------------------------------------------------------
  coin: { seconds: 0.6, variants: 2, gain: 0.32, render: (sr, r) => layer(sr, 0.6, [bell(sr, r, 0.6, 1976, 0.35), 0.7], [bell(sr, r, 0.55, 2637, 0.4), 0.9, 0.055]) },
  precise: { seconds: 0.55, variants: 2, gain: 0.34, render: (sr, r) => layer(sr, 0.55, [lyre(sr, r, 0.55, [86], { decay: 0.6, brightness: 0.7 }), 1], [swish(sr, r, 0.2, 3000, 1500, 1.4, 0.01, 0.1), 0.3]) },
  rescue: { seconds: 1.5, variants: 2, gain: 0.5, render: (sr, r) => layer(sr, 1.5, [lyre(sr, r, 1.5, [62, 66, 69, 74], { spacing: 0.07, decay: 1.5 }), 1], [lyre(sr, r, 1.5, [50], { decay: 1.6, brightness: 0.4 }), 0.6]) },
  blessing: {
    seconds: 1.9, variants: 3, gain: 0.34,
    render: (sr, r) => {
      const out = new Float32Array(length(1.9, sr)), notes = [86, 88, 90, 93, 95];
      for (let i = 0; i < 5; i++) mix(out, bell(sr, r, 1.4, hz(notes[Math.floor(r() * notes.length)]), 1.1, [1, 2.76, 5.4], [1, 0.3, 0.12]), 0.4 + r() * 0.3, Math.round(r() * 0.5 * sr));
      return out;
    },
  },
  relic: { seconds: 1.4, variants: 2, gain: 0.36, render: (sr, r) => layer(sr, 1.4, [bell(sr, r, 1.4, hz(81), 1.1, [1, 2.1, 3.9], [1, 0.4, 0.2]), 0.6], [bell(sr, r, 1.3, hz(88), 1, [1, 2.1, 3.9], [1, 0.4, 0.2]), 0.5, 0.09], [burst(sr, r, 1.2, { type: "highpass", freq: 6000, q: 0.7, attack: 0.2, decay: 0.8 }), 0.15]) },

  // --- Harm ----------------------------------------------------------------
  hit: { seconds: 0.5, variants: 3, gain: 0.7, render: (sr, r) => softClip(layer(sr, 0.5, [thud(sr, r, 0.3, 420, 0.1, 0.6), 1], [burst(sr, r, 0.12, { type: "bandpass", freq: 900, q: 0.9, attack: 0.0008, decay: 0.05 }), 0.5], [crunch(sr, r, 0.5, 1500, 0.08, [700, 4000], 0.5, [0.002, 0.008]), 0.5]), 1.6) },
  "hull-crack": { seconds: 0.6, variants: 3, gain: 0.6, render: (sr, r) => layer(sr, 0.6, [burst(sr, r, 0.04, { type: "highpass", freq: 1800, q: 0.7, attack: 0.0003, decay: 0.02 }), 1], [crunch(sr, r, 0.35, 4000, 0.06, [1500, 7000], 0.8, [0.0004, 0.002]), 0.8], [modal(length(0.2, sr), sr, [{ freq: 220, decay: 0.04, gain: 0.6 }, { freq: 480, decay: 0.03, gain: 0.4 }, { freq: 1100, decay: 0.02, gain: 0.3 }, { freq: 2300, decay: 0.012, gain: 0.2 }], r), 0.8], [mul(creaking(sr, r, 0.32, () => 260, 900), env(length(0.32, sr), sr, 0.02, 0.2)), 0.25, 0.08]) },
  splash: { seconds: 0.9, variants: 3, gain: 0.45, render: (sr, r) => layer(sr, 0.9, [burst(sr, r, 0.08, { type: "bandpass", freq: 1100, q: 0.9, attack: 0.001, decay: 0.03 }), 0.3], [burst(sr, r, 0.9, { type: "highpass", freq: 1800, q: 0.7, attack: 0.01, decay: 0.6 }), 0.6], [bubbles(sr, r, 0.9, 40, [800, 4000], 0.7), 0.6], [bubbles(sr, r, 0.9, 10, [200, 500], 0.4, 0.5), 0.5]) },
  "splash-big": { seconds: 1.6, variants: 2, gain: 0.6, render: (sr, r) => layer(sr, 1.6, [thud(sr, r, 0.5, 300, 0.14, 0.4), 0.5], [burst(sr, r, 1.6, { type: "highpass", freq: 1500, q: 0.7, attack: 0.02, decay: 1 }), 0.7], [bubbles(sr, r, 1.6, 80, [600, 4000], 1.2, 0.5), 0.6], [bubbles(sr, r, 1.6, 25, [200, 600], 0.9, 0.4), 0.5]) },

  // --- The Cyclops' cave ---------------------------------------------------
  "giant-step": { seconds: 1, variants: 3, gain: 0.7, rate: 24000, render: (sr, r) => softClip(layer(sr, 1, [mul(tone(length(1, sr), sr, glide(58, 30, 0.08)), env(length(1, sr), sr, 0.002, 0.45)), 1], [burst(sr, r, 1, { type: "lowpass", freq: 140, q: 0.8, attack: 0.01, decay: 0.6, color: "brown" }), 0.9], [debris(sr, r, 1, 120, 0.3, [400, 2500], 0.4), 0.4, 0.06]), 1.3) },
  windup: {
    seconds: 1.25, variants: 2, gain: 0.55, rate: 24000,
    render: (sr, r) => {
      const n = length(1.25, sr);
      const rumble = filtered(brown(n, r), "lowpass", sweep(80, 280, 1.1), 1.2, sr);
      const grind = grains(n, sr, r, { rate: t => 300 + 900 * t, size: [0.003, 0.01], band: [200, 1500], gain: 0.5 });
      const strain = softClip(mouth(sr, glottal(sr, r, 0.9, t => 75 + 20 * t, { jitter: 0.12, shimmer: 0.45, doubling: 0.55, breath: 1.3 }), () => 400, () => 900), 3);
      return mul(layer(sr, 1.25, [rumble, 1], [grind, 0.6], [mul(strain, env(strain.length, sr, 0.3, 0.3, 0.3)), 0.45, 0.25]), env(n, sr, 0.8, 0.4));
    },
  },
  throw: {
    seconds: 0.8, variants: 2, gain: 0.6, rate: 24000,
    render: (sr, r) => {
      const effort = softClip(mouth(sr, glottal(sr, r, 0.3, t => 110 - 80 * t, { jitter: 0.14, shimmer: 0.5, doubling: 0.6, breath: 1.4 }), () => 600, () => 1050), 3.5);
      return layer(sr, 0.8, [burst(sr, r, 0.8, { type: "bandpass", freq: t => (t < 0.3 ? 200 + 2000 * t : 800 - 900 * (t - 0.3)), q: 1.4, attack: 0.15, decay: 0.4, color: "pink" }), 1], [mul(effort, env(effort.length, sr, 0.02, 0.2)), 0.4]);
    },
  },
  crash: { seconds: 1.7, variants: 3, gain: 0.95, render: (sr, r) => softClip(layer(sr, 1.7, [mul(tone(length(1.7, sr), sr, glide(68, 28, 0.06)), env(length(1.7, sr), sr, 0.002, 0.55)), 1], [burst(sr, r, 0.06, { type: "highpass", freq: 1200, q: 0.7, attack: 0.0003, decay: 0.03 }), 0.9], [modal(length(0.8, sr), sr, [{ freq: 95, decay: 0.4, gain: 0.6 }, { freq: 160, decay: 0.3, gain: 0.4 }, { freq: 260, decay: 0.2, gain: 0.3 }], r), 0.7], [debris(sr, r, 1.7, 2500, 0.25, [300, 4000]), 0.7], [burst(sr, r, 1.7, { type: "lowpass", freq: 120, q: 0.8, attack: 0.02, decay: 1.2, color: "brown" }), 0.7]), 1.5) },
  roar: {
    seconds: 2.2, variants: 2, gain: 0.85, rate: 24000,
    render: (sr, r) => {
      const throat = glottal(sr, r, 2.2, t => (t < 0.3 ? 92 + 160 * t : 140 - 40 * (t - 0.3)), { jitter: 0.16, shimmer: 0.55, doubling: 0.65, breath: 1.6 });
      const voice = mouth(sr, throat, t => lerp(420, 740, t / 0.35) - lerp(0, 320, (t - 1.2) / 1), t => lerp(860, 1250, t / 0.35) - lerp(0, 430, (t - 1.2) / 1));
      return mul(softClip(mix(voice, filtered(throat, "lowpass", 220, 0.8, sr), 0.3), 4.5), env(length(2.2, sr), sr, 0.18, 0.75, 1.2));
    },
  },
  wool: { seconds: 0.7, variants: 2, gain: 0.28, render: (sr, r) => { const n = length(0.7, sr), shape = env(n, sr, 0.15, 0.4); return layer(sr, 0.7, [mul(filtered(pink(n, r), "bandpass", 2500, 0.6, sr), shape), 0.6], [mul(grains(n, sr, r, { rate: 900, size: [0.001, 0.003], band: [2000, 6000], gain: 0.3 }), shape), 0.5]); } },

  // --- Circe's potions -----------------------------------------------------
  "glass-tick": { seconds: 0.15, variants: 3, gain: 0.26, render: (sr, r) => modal(length(0.15, sr), sr, [{ freq: 2900 + r() * 300, decay: 0.07, gain: 1 }, { freq: 6100, decay: 0.05, gain: 0.5 }, { freq: 8800, decay: 0.03, gain: 0.3 }], r) },
  clink: { seconds: 0.3, variants: 3, gain: 0.3, render: (sr, r) => layer(sr, 0.3, [bell(sr, r, 0.2, 2400, 0.12, [1, 2.4, 4.6], [1, 0.4, 0.2]), 1], [bell(sr, r, 0.2, 3100, 0.1, [1, 2.4, 4.6], [1, 0.4, 0.2]), 0.8, 0.04]) },
  plop: { seconds: 0.3, variants: 3, gain: 0.4, render: (sr, r) => layer(sr, 0.3, [bubbles(sr, r, 0.12, 1, [300, 320], 0.001, 1), 1], [burst(sr, r, 0.05, { type: "bandpass", freq: 2000, q: 1, attack: 0.001, decay: 0.03 }), 0.3], [bubbles(sr, r, 0.12, 1, [600, 700], 0.001, 0.6), 1, 0.06]) },
  fizz: { seconds: 0.8, variants: 3, gain: 0.36, render: (sr, r) => { const n = length(0.8, sr); return layer(sr, 0.8, [bubbles(sr, r, 0.8, 60, [1500, 5000], 0.7, 0.4), 1], [mul(grains(n, sr, r, { rate: 3500, size: [0.0003, 0.001], band: [4000, 11000], gain: 0.4 }), env(n, sr, 0.01, 0.55)), 0.7]); } },
  curse: {
    seconds: 1.1, variants: 2, gain: 0.5,
    render: (sr, r) => {
      const n = length(1.1, sr), low = filtered(mix(tone(n, sr, 73.4, "saw"), tone(n, sr, 77.8, "saw")), "lowpass", 420, 1, sr);
      return softClip(mul(layer(sr, 1.1, [filtered(pink(n, r), "bandpass", sweep(200, 700, 1), 3, sr), 1], [low, 0.4]), env(n, sr, 0.4, 0.4)), 1.4);
    },
  },

  // --- The Sirens ----------------------------------------------------------
  "siren-note": {
    seconds: 1, variants: 2, gain: 0.42, rate: 24000,
    render: (sr, r) => {
      const out = new Float32Array(length(1, sr));
      for (let v = 0; v < 4; v++) mix(out, sung(sr, r, 1, hz(60), v % 2 ? OH : AH, { detune: 1 + (v - 1.5) * 0.004 }), 0.25);
      for (let v = 0; v < 2; v++) mix(out, sung(sr, r, 1, hz(72), OH, { detune: 1 + (v - 0.5) * 0.004 }), 0.2);
      return out;
    },
  },
  lyre: { seconds: 1, variants: 3, gain: 0.45, render: (sr, r) => lyre(sr, r, 1, [60], { decay: 1.1, level: 1 }) },
  "song-won": { seconds: 1.6, variants: 1, gain: 0.5, render: (sr, r) => layer(sr, 1.6, [lyre(sr, r, 1.6, [72, 74, 76, 79, 81, 84, 86, 88], { spacing: 0.045, decay: 1.2, brightness: 0.6 }), 1], [burst(sr, r, 1.2, { type: "highpass", freq: 7000, q: 0.7, attack: 0.2, decay: 0.8 }), 0.1]) },
  "song-lost": { seconds: 1.3, variants: 1, gain: 0.5, render: (sr, r) => layer(sr, 1.3, [lyre(sr, r, 1.3, [50, 51, 45], { spacing: 0.012, decay: 1.2, brightness: 0.35 }), 1], [burst(sr, r, 1.3, { type: "lowpass", freq: 300, q: 1, attack: 0.3, decay: 0.7, color: "brown" }), 0.5]) },

  // --- Scylla and Charybdis -------------------------------------------------
  hiss: { seconds: 0.9, variants: 2, gain: 0.3, render: (sr, r) => { const n = length(0.9, sr); return mul(filtered(filtered(white(n, r), "highpass", 3000, 0.7, sr), "bandpass", 6500, 0.6, sr), env(n, sr, 0.12, 0.3, 0.4)); } },
  strike: { seconds: 0.32, variants: 3, gain: 0.45, render: (sr, r) => layer(sr, 0.32, [swish(sr, r, 0.32, 2600, 700, 1.5, 0.015, 0.16), 1], [burst(sr, r, 0.02, { type: "highpass", freq: 3000, q: 0.7, attack: 0.0002, decay: 0.006 }), 0.5, 0.2]) },
  clang: { seconds: 1.3, variants: 3, gain: 0.55, render: (sr, r) => layer(sr, 1.3, [bell(sr, r, 1.3, 420, 1.2, [1, 1.59, 2.14, 2.3, 2.65, 3.16, 3.94, 5.4], [1, 0.8, 0.6, 0.5, 0.45, 0.35, 0.25, 0.15]), 0.8], [burst(sr, r, 0.03, { type: "highpass", freq: 2000, q: 0.7, attack: 0.0005, decay: 0.02 }), 0.6], [thud(sr, r, 0.12, 300, 0.05), 0.5]) },
  oar: { seconds: 0.9, variants: 3, gain: 0.32, render: (sr, r) => layer(sr, 0.9, [burst(sr, r, 0.9, { type: "bandpass", freq: t => (t < 0.25 ? 500 + 3200 * t : 1300 - 1100 * (t - 0.25)), q: 0.9, attack: 0.18, hold: 0.1, decay: 0.35, color: "pink" }), 0.8], [bubbles(sr, r, 0.6, 10, [700, 2500], 0.5), 0.4, 0.3], [burst(sr, r, 0.3, { type: "highpass", freq: 2500, q: 0.7, attack: 0.01, decay: 0.2 }), 0.25, 0.15], [mul(creaking(sr, r, 0.25, () => 300, 900), env(length(0.25, sr), sr, 0.05, 0.15)), 0.12]) },

  // --- Ithaca's bow --------------------------------------------------------
  "bow-draw": { seconds: 0.45, variants: 3, gain: 0.24, render: (sr, r) => layer(sr, 0.45, [mul(creaking(sr, r, 0.45, t => 320 + 260 * t, 1500), env(length(0.45, sr), sr, 0.2, 0.2)), 1], [burst(sr, r, 0.45, { type: "highpass", freq: 4000, q: 0.7, attack: 0.25, decay: 0.15 }), 0.1]) },
  "bow-release": { seconds: 0.6, variants: 2, gain: 0.5, render: (sr, r) => layer(sr, 0.6, [string(length(0.6, sr), sr, 98, { decay: 0.45, brightness: 0.9, position: 0.08, damping: 0.02, rand: r }), 1], [burst(sr, r, 0.02, { type: "highpass", freq: 2000, q: 0.7, attack: 0.0005, decay: 0.015 }), 0.6], [thud(sr, r, 0.1, 350, 0.03), 0.4]) },
  arrow: { seconds: 0.45, variants: 3, gain: 0.32, render: (sr, r) => { const n = length(0.45, sr), flutter = tone(n, sr, 60).map(v => 0.75 + 0.25 * v); return mul(swish(sr, r, 0.45, 3500, 1200, 2, 0.05, 0.3), flutter); } },
  thunk: { seconds: 0.3, variants: 3, gain: 0.5, render: (sr, r) => layer(sr, 0.3, [modal(length(0.3, sr), sr, [{ freq: 250, decay: 0.035, gain: 1 }, { freq: 560, decay: 0.025, gain: 0.6 }, { freq: 1250, decay: 0.018, gain: 0.4 }, { freq: 2600, decay: 0.01, gain: 0.25 }], r), 1], [burst(sr, r, 0.02, { type: "highpass", freq: 2500, q: 0.7, attack: 0.0003, decay: 0.008 }), 0.5], [thud(sr, r, 0.1, 300, 0.04), 0.6]) },
  ting: { seconds: 0.4, variants: 2, gain: 0.22, render: (sr, r) => bell(sr, r, 0.4, 2637, 0.25, [1, 2.32, 3.53], [1, 0.4, 0.2]) },

  // --- Sea and storm ---------------------------------------------------------
  flap: { seconds: 0.3, variants: 3, gain: 0.34, render: (sr, r) => { const n = length(0.3, sr), flutter = tone(n, sr, 24).map(v => 0.6 + 0.4 * v); return layer(sr, 0.3, [mul(burst(sr, r, 0.3, { type: "lowpass", freq: 1800, q: 0.7, attack: 0.01, decay: 0.15 }), flutter), 1], [thud(sr, r, 0.1, 300, 0.04), 0.4]); } },
  gust: { seconds: 1.3, variants: 3, gain: 0.32, render: (sr, r) => layer(sr, 1.3, [burst(sr, r, 1.3, { type: "bandpass", freq: t => 400 + 500 * Math.sin(Math.PI * Math.min(1, t / 1.1)), q: 1.5, attack: 0.4, hold: 0.2, decay: 0.5, color: "pink" }), 1], [burst(sr, r, 1.3, { type: "bandpass", freq: sweep(1400, 1700, 1.2), q: 12, attack: 0.5, decay: 0.5, color: "pink" }), 0.15]) },
  hop: { seconds: 0.3, variants: 3, gain: 0.36, render: (sr, r) => layer(sr, 0.3, [burst(sr, r, 0.2, { type: "bandpass", freq: 1800, q: 0.8, attack: 0.002, decay: 0.12 }), 0.6], [modal(length(0.2, sr), sr, [{ freq: 300, decay: 0.06, gain: 0.6 }, { freq: 700, decay: 0.04, gain: 0.4 }], r), 1]) },
  driftwood: { seconds: 0.6, variants: 2, gain: 0.4, render: (sr, r) => layer(sr, 0.6, [modal(length(0.3, sr), sr, [{ freq: 190, decay: 0.06, gain: 1 }, { freq: 430, decay: 0.04, gain: 0.6 }, { freq: 980, decay: 0.03, gain: 0.3 }], r), 1], [lyre(sr, r, 0.5, [74], { decay: 0.5 }), 0.6, 0.08]) },
  charge: {
    seconds: 1.6, variants: 2, gain: 0.4,
    render: (sr, r) => {
      const n = length(1.6, sr), buzz = filtered(tone(n, sr, 50, "square"), "bandpass", 1600, 1.5, sr);
      return mul(layer(sr, 1.6, [grains(n, sr, r, { rate: t => 100 + 1500 * t, size: [0.0003, 0.0015], band: [2500, 10000], gain: 0.8 }), 1], [mul(buzz, env(n, sr, 1.4, 0.2)), 0.12]), env(n, sr, 1.3, 0.3));
    },
  },
  thunder: { seconds: 3.2, variants: 3, gain: 0.95, render: (sr, r) => softClip(layer(sr, 3.2, [burst(sr, r, 0.1, { type: "highpass", freq: 800, q: 0.7, attack: 0.001, decay: 0.07 }), 1], [crunch(sr, r, 0.8, 3000, 0.15, [1000, 6000], 0.8, [0.001, 0.004]), 0.7], [thud(sr, r, 1, 180, 0.5, 0.6), 0.8], [rolling(sr, r, 3.2, 0.05), 1]), 1.5) },

  // --- Ambience one-shots ------------------------------------------------------
  drip: {
    seconds: 0.25, variants: 4, gain: 0.3,
    render: (sr, r) => {
      // A falling drop rings as a bubble whose pitch shoots up as it closes.
      const n = length(0.25, sr), base = 500 + r() * 400, plip = length(0.06, sr);
      return layer(sr, 0.25,
        [mul(tone(n, sr, t => base * (1 + 1.4 * Math.min(1, t / 0.005))), env(n, sr, 0.0005, 0.025)), 1],
        [burst(sr, r, 0.01, { type: "bandpass", freq: 3000, q: 1, attack: 0.0002, decay: 0.004 }), 0.3],
        [mul(tone(plip, sr, t => base * 1.3 * (1 + 1.2 * Math.min(1, t / 0.004))), env(plip, sr, 0.0005, 0.018)), 0.3, 0.07 + r() * 0.06]);
    },
  },
  rumble: { seconds: 3, variants: 2, gain: 0.5, rate: 24000, render: (sr, r) => layer(sr, 3, [burst(sr, r, 3, { type: "lowpass", freq: 110, q: 0.8, attack: 1, hold: 0.5, decay: 1.5, color: "brown" }), 1], [debris(sr, r, 3, 60, 1.5, [500, 2500], 0.3), 0.4, 0.6]) },
  bird: {
    seconds: 1.1, variants: 4, gain: 0.18,
    render: (sr, r) => {
      const out = new Float32Array(length(1.1, sr)), chirps = 3 + Math.floor(r() * 4), base = 2600 + r() * 1400;
      for (let c = 0, at = 0; c < chirps; c++, at += 0.08 + r() * 0.12) {
        const m = length(0.07, sr), up = 1.2 + r() * 0.6;
        mix(out, mul(tone(m, sr, t => base * (1 + (up - 1) * Math.sin((Math.PI * t) / 0.07))), env(m, sr, 0.008, 0.05)), 0.7, Math.round(at * sr));
      }
      return out;
    },
  },
  creak: { seconds: 0.9, variants: 3, gain: 0.22, render: (sr, r) => { const body = 950 + r() * 300; return mul(creaking(sr, r, 0.9, t => 260 + 160 * Math.sin((Math.PI * t) / 0.9), body), env(length(0.9, sr), sr, 0.2, 0.3, 0.3)); } },
  "distant-thunder": { seconds: 3.5, variants: 3, gain: 0.45, rate: 24000, render: (sr, r) => rolling(sr, r, 3.5, 0.4) },

  // --- Ambience loops (stereo, seamless) ----------------------------------------
  "cave-air": { seconds: 10, variants: 1, gain: 0.3, rate: 24000, loop: true, render: (sr, r) => loop(sr, r, 10, (n, rr) => mix(mul(filtered(pink(n, rr), "bandpass", 220, 1, sr), wander(n, sr, rr, 0.15).map(v => 0.6 + 0.4 * v)), filtered(brown(n, rr), "lowpass", 90, 0.7, sr), 0.3)) },
  torch: {
    seconds: 8, variants: 1, gain: 0.26, loop: true,
    render: (sr, r) => loop(sr, r, 8, (n, rr) => layer(sr, 8.5,
      [mul(filtered(pink(n, rr), "bandpass", 700, 0.6, sr), wander(n, sr, rr, 4).map(v => 0.4 + 0.6 * v)), 0.5],
      [crackles(sr, rr, n, 4), 1.4],
      [grains(n, sr, rr, { rate: 1, size: [0.003, 0.01], band: [600, 2500], gain: 1.4 }), 0.5])),
  },
  sea: {
    seconds: 10, variants: 1, gain: 0.42, loop: true,
    render: (sr, r) => loop(sr, r, 10, (n, rr) => {
      // Waves roll in, crash and wash back: brightness and level rise and fall together.
      const starts = [0, 4.4 + rr() * 0.8, 8.6 + rr() * 0.6, 12.8], sizes = starts.map(() => 0.6 + 0.4 * rr());
      const crest = (t: number) => {
        let c = 0;
        starts.forEach((s, i) => { const x = (t - s) / 5.5; if (x >= 0 && x < 1) c = Math.max(c, sizes[i] * (x < 0.18 ? (x / 0.18) ** 2 : Math.exp(-(x - 0.18) * 5))); });
        return c;
      };
      const level = new Float32Array(n);
      for (let i = 0; i < n; i++) level[i] = 0.12 + crest(i / sr);
      const wash = mul(filtered(pink(n, rr), "lowpass", t => 400 + 2000 * crest(t), 0.7, sr), level);
      const foam = mul(filtered(white(n, rr), "highpass", 2500, 0.7, sr), level.map(v => v * v));
      return mix(mix(wash, foam, 0.25), mul(filtered(brown(n, rr), "lowpass", 150, 0.7, sr), level), 0.3);
    }),
  },
  wind: {
    seconds: 10, variants: 1, gain: 0.36, loop: true,
    render: (sr, r) => loop(sr, r, 10, (n, rr) => {
      const gusts = wander(n, sr, rr, 0.4);
      return layer(sr, 10.5,
        [mul(filtered(pink(n, rr), "bandpass", 450, 0.7, sr), gusts.map(v => 0.3 + 0.7 * v)), 0.9],
        [mul(filtered(pink(n, rr), "bandpass", t => 1100 + 250 * Math.sin(2 * Math.PI * 0.13 * t), 12, sr), gusts.map(v => v * v)), 0.35],
        [mul(filtered(pink(n, rr), "highpass", 3000, 0.7, sr), gusts), 0.1]);
    }),
  },
  rain: { seconds: 8, variants: 1, gain: 0.34, loop: true, render: (sr, r) => loop(sr, r, 8, (n, rr) => layer(sr, 8.5, [grains(n, sr, rr, { rate: 1500, size: [0.001, 0.003], band: [2000, 8000], gain: 0.5 }), 1], [filtered(pink(n, rr), "highpass", 1500, 0.7, sr), 0.25], [filtered(brown(n, rr), "lowpass", 250, 0.7, sr), 0.3])) },
  whirlpool: {
    seconds: 8, variants: 1, gain: 0.4, rate: 24000, loop: true,
    render: (sr, r) => loop(sr, r, 8, (n, rr) => {
      const swirl = tone(n, sr, 0.25, "sine", rr()).map(v => 0.55 + 0.45 * v);
      return layer(sr, 8.5, [mul(filtered(brown(n, rr), "lowpass", 300, 0.8, sr), swirl), 1], [filtered(pink(n, rr), "bandpass", t => 700 + 250 * Math.sin(2 * Math.PI * 0.5 * t), 0.6, sr), 0.4], [bubbles(sr, rr, 8.5, 60, [200, 600], 8.4, 0.3), 0.5]);
    }),
  },
  "garden-air": {
    seconds: 10, variants: 1, gain: 0.24, loop: true,
    render: (sr, r) => loop(sr, r, 10, (n, rr) => {
      const out = mul(filtered(pink(n, rr), "bandpass", 900, 0.4, sr), wander(n, sr, rr, 0.25).map(v => 0.4 + 0.6 * v));
      // Leaves stir now and then rather than all the time.
      for (let k = 0; k < 3; k++) {
        const m = length(0.7, sr);
        mix(out, mul(grains(m, sr, rr, { rate: 900, size: [0.001, 0.003], band: [2500, 8000], gain: 0.35 }), env(m, sr, 0.25, 0.4)), 0.8, Math.round(rr() * (n - m)));
      }
      return out;
    }),
  },
  "hall-air": { seconds: 8, variants: 1, gain: 0.16, loop: true, render: (sr, r) => loop(sr, r, 8, (n, rr) => mix(filtered(pink(n, rr), "bandpass", 380, 0.4, sr), filtered(brown(n, rr), "lowpass", 120, 0.7, sr), 0.2)) },
} satisfies Record<string, Recipe>;

export type SoundName = keyof typeof sounds;
export const soundNames = Object.keys(sounds) as SoundName[];
