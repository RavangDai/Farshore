import type { TrialId } from "../arcade/arcade.ts";
import type { SoundName } from "../audio/sounds.ts";

/**
 * The mythic cinematics, as plain data and pure functions of time.
 *
 * Two films, rendered in 3D by lib/render/cinema-world.ts:
 * - "unlock": after the Oracle's key is won, Odysseus walks up the causeway
 *   to the trial's great bronze gate. The key descends in a shaft of light,
 *   turns in the lock, runes catch fire along the seams, the doors swing open
 *   and the camera rides through the light into the trial.
 * - "journey": after a trial is won, Odysseus walks out through the gate he
 *   has just opened, along the sea causeway, toward the next trial's gate.
 *
 * World units are metres. The gate stands across the causeway at z = 0 (the
 * unlock) or z = JOURNEY_GATE_Z (the journey's next gate); Odysseus walks
 * toward -z. Everything here is deterministic in `t` (seconds), so a skipped
 * or slow frame never changes the film, and the tests can check every beat.
 */

export type CinemaKind = "unlock" | "journey";
export type Vec = readonly [number, number, number];

export const DURATION: Record<CinemaKind, number> = { unlock: 7.4, journey: 8.8 };
export const JOURNEY_GATE_Z = -40;
export const JOURNEY_PAST_GATE_Z = 6;
/** Where the lock sits on the doors' seam. */
export const LOCK: Vec = [0, 3.6, 0.3];

/** Each trial's light: the sky, the sea, the sun and the colour its runes burn. */
export type CinemaTheme = { sky: number; horizon: number; fog: number; sun: number; sunI: number; hemi: number; water: number; rune: number; near: number; far: number };
export const CINEMA_THEMES: Record<TrialId, CinemaTheme> = {
  cyclops: { sky: 0x2a1c2e, horizon: 0xd8743a, fog: 0x6a3a2c, sun: 0xffa060, sunI: 2.2, hemi: 1.1, water: 0x1c2c38, rune: 0xff6a28, near: 18, far: 120 },
  sirens: { sky: 0x101c3a, horizon: 0x7a6aa8, fog: 0x3a3e66, sun: 0xd8c8ff, sunI: 1.5, hemi: 1.2, water: 0x142a4a, rune: 0x9ad8ff, near: 16, far: 110 },
  lotus: { sky: 0x1e2c3a, horizon: 0xe89a7a, fog: 0x5a5a62, sun: 0xffc8a0, sunI: 2.0, hemi: 1.3, water: 0x1a4a4e, rune: 0x7dffb0, near: 20, far: 125 },
  aeolus: { sky: 0x3a6a9a, horizon: 0xd8eef8, fog: 0x8ab4cc, sun: 0xfff4dc, sunI: 2.8, hemi: 1.6, water: 0x2a6a8a, rune: 0xc8f4ff, near: 30, far: 160 },
  circe: { sky: 0x1a0e2a, horizon: 0xb04a9a, fog: 0x4a2a5a, sun: 0xf0a0ff, sunI: 1.8, hemi: 1.1, water: 0x22183a, rune: 0xe07aff, near: 16, far: 110 },
  scylla: { sky: 0x141c22, horizon: 0x5a6a72, fog: 0x2e3a40, sun: 0xb8d0d8, sunI: 1.4, hemi: 1.0, water: 0x10262c, rune: 0x5fe6e0, near: 14, far: 100 },
  calypso: { sky: 0x2a5a7a, horizon: 0xf2d8a0, fog: 0x7aa8b0, sun: 0xfff0c8, sunI: 2.6, hemi: 1.5, water: 0x1a7a8a, rune: 0xffe08a, near: 28, far: 150 },
  bow: { sky: 0x1a1410, horizon: 0xe8a84a, fog: 0x5a4028, sun: 0xffd08a, sunI: 2.2, hemi: 1.2, water: 0x2a3a3a, rune: 0xffcf6a, near: 20, far: 120 },
};

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** How far `t` has moved through the span from `a` to `b`, from 0 to 1. */
export const span = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));
export const smooth = (u: number) => { const x = clamp01(u); return x * x * (3 - 2 * x); };
export const easeOut = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);
export const easeIn = (u: number) => Math.pow(clamp01(u), 2);
const mix = (a: number, b: number, u: number) => a + (b - a) * u;

// ------------------------------------------------------------------ Odysseus --

export type Hero = { x: number; z: number; walking: boolean; speed: number };

/** Unlock: down the causeway to the gate, a pause while the key works, then through the open doors. */
const UNLOCK_WALK = { from: 15, stop: 2.4, start: 0, arrive: 2.7, leave: 5.5, gone: -7, x: -0.75 };
/** Journey: out of the old gate and on to stop before the next one. */
const JOURNEY_WALK = { from: 4.5, to: -31, start: 0.2, end: 8.4 };

export function heroAt(kind: CinemaKind, t: number): Hero {
  if (kind === "unlock") {
    const w = UNLOCK_WALK;
    if (t < w.arrive) {
      const u = span(t, w.start, w.arrive);
      return { x: mix(0, w.x, smooth(u)), z: mix(w.from, w.stop, easeOut(u)), walking: true, speed: (w.from - w.stop) / (w.arrive - w.start) * 3 * (1 - u) ** 2 };
    }
    if (t < w.leave) return { x: w.x, z: w.stop, walking: false, speed: 0 };
    const u = span(t, w.leave, DURATION.unlock);
    return { x: mix(w.x, 0, smooth(u)), z: mix(w.stop, w.gone, easeIn(u)), walking: true, speed: Math.max(1.4, (w.stop - w.gone) / (DURATION.unlock - w.leave) * 2 * u) };
  }
  const w = JOURNEY_WALK, u = span(t, w.start, w.end);
  // A steady stride with an easy start and stop: smoothstep's slope is 1.5x the average at mid-walk.
  const z = mix(w.from, w.to, smooth(u));
  const speed = ((w.from - w.to) / (w.end - w.start)) * 6 * u * (1 - u);
  return { x: Math.sin(t * 0.7) * 0.25, z, walking: u > 0 && u < 1, speed };
}

// ------------------------------------------------------- the key and the gate --

/** `pitch` tips the upright falling key (0) to point into the door (pi/2); `spin` and `turn` are about its shaft. */
export type KeyPose = { visible: boolean; x: number; y: number; z: number; pitch: number; spin: number; turn: number; glow: number; scale: number };

/** The Oracle's key: down a shaft of light, into the lock, a quarter turn, then it burns away. */
export function keyAt(t: number): KeyPose {
  const appear = 2.5, inLock = 3.75, seated = 4.05, turned = 4.55, gone = 5.05;
  if (t < appear || t >= gone) return { visible: false, x: LOCK[0], y: LOCK[1], z: LOCK[2], pitch: Math.PI / 2, spin: 0, turn: 0, glow: 0, scale: 0 };
  const fall = easeOut(span(t, appear, inLock));
  const seat = smooth(span(t, inLock, seated));
  return {
    visible: true,
    x: LOCK[0],
    y: mix(11, LOCK[1], fall),
    z: mix(1.6, mix(1.05, LOCK[2] + 0.04, seat), fall),
    pitch: smooth(span(t, appear + 0.8, inLock)) * (Math.PI / 2),
    // It spins as it falls and settles square to the lock.
    spin: (1 - fall) * Math.PI * 6,
    turn: smooth(span(t, seated, turned)) * (Math.PI / 2),
    glow: 0.5 + 0.5 * span(t, turned, gone) + 0.3 * (1 - fall),
    scale: span(t, appear, appear + 0.3) * (1 - easeIn(span(t, turned + 0.2, gone))),
  };
}

/** How far open the doors are, 0 to 1 (the world turns 1 into about 80 degrees). */
export function doorsAt(kind: CinemaKind, t: number) {
  return kind === "unlock" ? smooth(span(t, 5.0, 6.5)) : 0;
}
/** The runes along the door seams, 0 (cold bronze) to 1 (burning). */
export function runesAt(kind: CinemaKind, t: number) {
  if (kind === "unlock") return smooth(span(t, 4.35, 5.0));
  // The next gate stirs as Odysseus comes into sight of it.
  return 0.25 + 0.55 * smooth(span(t, 5.6, 8.0)) + 0.08 * Math.sin(t * 3);
}
/** Light pouring from behind the doors, 0 to 1. */
export function lightAt(kind: CinemaKind, t: number) {
  return kind === "unlock" ? smooth(span(t, 4.8, 6.6)) : 0;
}
/** The white-gold flash the unlock ends on, and the dark the journey fades into. */
export function flashAt(kind: CinemaKind, t: number) {
  return kind === "unlock" ? easeIn(span(t, 6.7, DURATION.unlock)) : easeIn(span(t, 8.2, DURATION.journey));
}

// ----------------------------------------------------------------- the camera --

/** A camera key: where it stands and what it looks at. `rel` keys ride along with Odysseus (z only). */
export type Shot = { t: number; cam: Vec; look: Vec; rel?: boolean };

export const SHOTS: Record<CinemaKind, Shot[]> = {
  unlock: [
    { t: 0, cam: [11, 8.5, 32], look: [0, 3.5, 4] },
    { t: 1.5, cam: [6.5, 5.2, 19], look: [-0.4, 2.6, 5] },
    { t: 2.8, cam: [2.8, 3.1, 8.8], look: [0, 3.7, 0] },
    { t: 3.9, cam: [1.7, 3.9, 4.9], look: [0, 3.6, 0.2] },
    { t: 4.8, cam: [1.05, 3.75, 3.7], look: [0, 3.6, 0.2] },
    { t: 5.7, cam: [0.2, 3.4, 9.5], look: [0, 3.7, -4] },
    // Into the light: the flash takes the frame just before the doorway.
    { t: 7.4, cam: [0, 3.1, 1.3], look: [0, 3.0, -20] },
  ],
  journey: [
    { t: 0, cam: [0, 2.4, 14], look: [0, 2.2, -10] },
    // Through the old gate's open doorway, clear of its piers and leaves, then out to his side.
    { t: 1.8, cam: [1.2, 3.6, 6], look: [0, 1.8, -6], rel: true },
    { t: 3.2, cam: [3.2, 3.4, 4.5], look: [0, 1.7, -4], rel: true },
    { t: 4.8, cam: [6.5, 2.1, -1.5], look: [0, 1.7, -2.5], rel: true },
    { t: 6.6, cam: [-2.6, 2.2, -5.2], look: [0, 1.9, 2], rel: true },
    { t: 8.8, cam: [2.2, 3.2, -16], look: [0, 5.2, -40] },
  ],
};

const resolve = (s: Shot, heroZ: number) => ({ cam: [s.cam[0], s.cam[1], s.cam[2] + (s.rel ? heroZ : 0)] as Vec, look: [s.look[0], s.look[1], s.look[2] + (s.rel ? heroZ : 0)] as Vec });
/** Uniform Catmull-Rom between p1 and p2. */
const cr = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);

/**
 * The camera at time `t`: a Catmull-Rom spline through the shots, so it
 * glides through each key rather than stopping at it. Keys that ride with
 * Odysseus are placed where he is now, so the tracking shots stay on him.
 */
export function cameraAt(kind: CinemaKind, t: number): { cam: Vec; look: Vec } {
  const shots = SHOTS[kind], heroZ = heroAt(kind, t).z;
  const time = Math.max(shots[0].t, Math.min(shots[shots.length - 1].t, t));
  let i = 0;
  while (i < shots.length - 2 && time > shots[i + 1].t) i++;
  const at = (k: number) => resolve(shots[Math.max(0, Math.min(shots.length - 1, k))], heroZ);
  const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
  const u = smooth(span(time, shots[i].t, shots[i + 1].t)) * 0.35 + span(time, shots[i].t, shots[i + 1].t) * 0.65;
  const pick = (key: "cam" | "look") => [0, 1, 2].map(k => cr(a[key][k], b[key][k], c[key][k], d[key][k], u)) as unknown as Vec;
  return { cam: pick("cam"), look: pick("look") };
}

// ------------------------------------------------------- sound and captions --

export type CinemaCue = { t: number; sound: SoundName; gain?: number; pan?: number };

const STEP: Record<CinemaKind, number> = { unlock: 0.42, journey: 0.36 };
const SCORE: Record<CinemaKind, CinemaCue[]> = {
  unlock: [
    { t: 0.05, sound: "torch", gain: 0.5 },
    { t: 2.5, sound: "blessing", gain: 0.8 },
    { t: 3.95, sound: "clink" },
    { t: 4.15, sound: "clang", gain: 0.45 },
    { t: 4.5, sound: "ting", gain: 0.8 },
    { t: 4.6, sound: "relic", gain: 0.7 },
    { t: 5.0, sound: "rumble", gain: 0.9 },
    { t: 5.15, sound: "creak", gain: 0.7 },
    { t: 6.7, sound: "blessing", gain: 0.6 },
  ],
  journey: [
    { t: 0.05, sound: "wind", gain: 0.35 },
    { t: 4.0, sound: "gust", gain: 0.45 },
    { t: 5.8, sound: "distant-thunder", gain: 0.4 },
    { t: 6.4, sound: "blessing", gain: 0.55 },
    { t: 7.6, sound: "rumble", gain: 0.5 },
  ],
};

/** Footsteps while he walks, alternating feet, then the score; sorted by time. */
export function cinemaCues(kind: CinemaKind): CinemaCue[] {
  const steps: CinemaCue[] = [];
  let foot = 0;
  for (let t = 0.12; t < DURATION[kind]; t += STEP[kind]) {
    const hero = heroAt(kind, t);
    if (hero.walking && hero.speed > 0.6) steps.push({ t: Math.round(t * 100) / 100, sound: "step-stone", gain: 0.32, pan: foot++ % 2 ? 0.12 : -0.12 });
  }
  return [...steps, ...SCORE[kind]].sort((a, b) => a.t - b.t);
}

/** The cues whose time falls in (from, to]: each plays once even when a frame is late or the clock jumps. */
export function cuesBetween(cues: readonly CinemaCue[], from: number, to: number) {
  return cues.filter(c => c.t > from && c.t <= to);
}

export type Caption = { from: number; to: number; eyebrow: string; title: string; line?: string };

export function cinemaCaptions(kind: CinemaKind, past: { number: number; title: string } | null, next: { number: number; title: string; kind: string }): Caption[] {
  if (kind === "unlock") return [{ from: 5.25, to: DURATION.unlock, eyebrow: "The Oracle's key turns", title: next.title, line: `Trial ${next.number} of 8 · ${next.kind}` }];
  const out: Caption[] = [];
  if (past) out.push({ from: 0.5, to: 3.2, eyebrow: `Trial ${past.number} cleared`, title: past.title });
  out.push({ from: 5.9, to: DURATION.journey, eyebrow: `Trial ${next.number} of 8 · ahead`, title: next.title, line: next.kind });
  return out;
}

/** The caption showing at time `t`, if any. */
export const captionAt = (captions: readonly Caption[], t: number) => captions.find(c => t >= c.from && t < c.to) ?? null;
