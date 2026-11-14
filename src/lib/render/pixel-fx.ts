// The logic behind the pixel skin's cinematic effects, kept free of the DOM so
// it can be tested: the dither dissolve between screens, the ambient particle
// presets, and the typewriter's pacing. Colours come from the shared palette.

/** The 8x8 Bayer matrix, as thresholds in [0, 1). */
export const BAYER8: number[] = (() => {
  const m = [[0]];
  let size = 1;
  while (size < 8) {
    const next: number[][] = Array.from({ length: size * 2 }, () => Array(size * 2).fill(0));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = m[y][x] * 4;
      next[y][x] = v; next[y][x + size] = v + 2; next[y + size][x] = v + 3; next[y + size][x + size] = v + 1;
    }
    m.splice(0, m.length, ...next);
    size *= 2;
  }
  return m.flat().map(v => (v + 0.5) / 64);
})();

export type Dissolve = "dither" | "blocks";

/**
 * When the cell at (x, y) of a cols-wide grid uncovers, as a share of the
 * transition. "dither" opens in the Bayer order; "blocks" sweeps left to right
 * with a dithered edge.
 */
export function uncoverAt(x: number, y: number, cols: number, kind: Dissolve) {
  const b = BAYER8[(y & 7) * 8 + (x & 7)];
  return kind === "blocks" ? Math.min(0.999, (x / Math.max(1, cols - 1)) * 0.7 + b * 0.3) : b;
}

// ---- ambient particles -----------------------------------------------------

export type AmbiencePreset = "stars" | "petals" | "embers" | "wind" | "bubbles" | "notes" | "spray" | "storm" | "torch" | "fireflies";
export type Mote = { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; size: number; phase: number };

type Spec = { count: number; colors: string[]; spawn(rand: () => number, w: number, h: number): Omit<Mote, "color" | "age" | "phase"> };

const rise = (speed: number, drift: number) => (rand: () => number, w: number, h: number) => ({ x: rand() * w, y: h + rand() * h * 0.3, vx: (rand() - 0.5) * drift, vy: -speed * (0.6 + rand() * 0.8), life: 6 + rand() * 6, size: 1 });
const fall = (speed: number, drift: number) => (rand: () => number, w: number, h: number) => ({ x: rand() * w, y: -rand() * h * 0.3, vx: drift * (0.5 + rand()), vy: speed * (0.6 + rand() * 0.8), life: 8 + rand() * 6, size: 1 });

/** Speeds are in art pixels per second; the canvas draws one art pixel as a block. */
export const PRESETS: Record<AmbiencePreset, Spec> = {
  stars: { count: 70, colors: ["#ffe3a1", "#f6f0e3", "#93afc0", "#9cefff"], spawn: (rand, w, h) => ({ x: rand() * w, y: rand() * h * 0.55, vx: 0, vy: 0, life: 1e9, size: rand() < 0.15 ? 2 : 1 }) },
  petals: { count: 34, colors: ["#f7a8c8", "#e86aa0", "#ffe3a1"], spawn: fall(9, 6) },
  embers: { count: 46, colors: ["#ffb347", "#f4604f", "#ffe3a1"], spawn: rise(16, 10) },
  wind: { count: 26, colors: ["#d8f4ff", "#93afc0"], spawn: (rand, w, h) => ({ x: -rand() * w * 0.5, y: rand() * h, vx: 70 + rand() * 60, vy: (rand() - 0.5) * 6, life: 4 + rand() * 3, size: 1 }) },
  bubbles: { count: 30, colors: ["#c08cff", "#a879ff", "#f7a8c8"], spawn: rise(10, 6) },
  notes: { count: 14, colors: ["#9cefff", "#f6f0e3", "#c08cff"], spawn: rise(8, 12) },
  spray: { count: 40, colors: ["#d8f4ff", "#9cefff", "#f6f0e3"], spawn: (rand, w, h) => ({ x: rand() * w, y: h * (0.7 + rand() * 0.3), vx: (rand() - 0.5) * 30, vy: -30 - rand() * 30, life: 1.4 + rand(), size: 1 }) },
  storm: { count: 90, colors: ["#93afc0", "#d8f4ff"], spawn: fall(120, -40) },
  torch: { count: 28, colors: ["#ffb347", "#ffe3a1"], spawn: rise(12, 8) },
  fireflies: { count: 24, colors: ["#ffe3a1", "#9fe6b4"], spawn: (rand, w, h) => ({ x: rand() * w, y: h * (0.3 + rand() * 0.7), vx: (rand() - 0.5) * 6, vy: (rand() - 0.5) * 6, life: 5 + rand() * 5, size: 1 }) },
};

/** Seeded random numbers (mulberry32), so a scene looks the same each visit. */
export function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function spawnMote(preset: AmbiencePreset, rand: () => number, w: number, h: number, scatter = false): Mote {
  const spec = PRESETS[preset], base = spec.spawn(rand, w, h);
  const mote: Mote = { ...base, color: spec.colors[Math.floor(rand() * spec.colors.length)], age: 0, phase: rand() * Math.PI * 2 };
  // At the start the scene is already alive: motes are placed mid-flight.
  if (scatter && base.life < 1e8) { const t = rand() * base.life; mote.age = t; mote.x += base.vx * t; mote.y += base.vy * t; }
  return mote;
}

/** Advances a mote; false when it has left the scene or lived out its life. */
export function stepMote(m: Mote, preset: AmbiencePreset, dt: number, w: number, h: number) {
  m.age += dt;
  if (preset === "petals" || preset === "bubbles" || preset === "notes" || preset === "fireflies") m.vx += Math.sin(m.age * 1.7 + m.phase) * 8 * dt;
  if (preset === "spray") m.vy += 60 * dt;
  m.x += m.vx * dt;
  m.y += m.vy * dt;
  return m.age < m.life && m.x > -8 && m.x < w + 8 && m.y > -h * 0.4 && m.y < h + h * 0.4;
}

/** How bright a mote is now, 0 to 1, in four steps: pixel art does not fade smoothly. */
export function moteAlpha(m: Mote, preset: AmbiencePreset) {
  const raw = preset === "stars" || preset === "fireflies" || preset === "torch"
    ? 0.55 + 0.45 * Math.sin(m.age * (preset === "stars" ? 1.3 : 3) + m.phase)
    : Math.min(1, m.age / 0.6, (m.life - m.age) / 0.8);
  return Math.round(Math.max(0, Math.min(1, raw)) * 4) / 4;
}

// ---- typewriter ----------------------------------------------------------------

/** Milliseconds before each character appears: a steady pace with a breath after punctuation. */
export function typeSchedule(text: string, cps = 42) {
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < text.length; i++) {
    out.push(t);
    const c = text[i];
    t += 1000 / cps + (/[.!?…]/.test(c) ? 260 : /[,;:—]/.test(c) ? 120 : 0);
  }
  return { at: out, total: t };
}
