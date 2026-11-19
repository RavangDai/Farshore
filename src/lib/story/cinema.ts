import type { SoundName } from "../audio/sounds.ts";

/**
 * The mythic cinematics, as plain data and pure functions of time. They film
 * the cinematic asset pack's own paintings (drawn by lib/render/painted-film.ts):
 *
 * - "unlock": after the Oracle's key is won. The camera pushes slowly into the
 *   trial's painting; the key comes down as a mote of light, a seal of fire
 *   flares where it turns, light pours out, and the film ends on a white-gold
 *   flash into the trial.
 * - "journey": after a trial is won. The cleared trial's painting pulls back,
 *   the voyage map takes the frame and the camera sails from the cleared
 *   checkpoint to the next along the route, then the next trial's painting
 *   comes up and the film fades to dark before its briefing.
 *
 * Everything is deterministic in `t` (seconds), so a skipped or slow frame
 * never changes the film, and the tests can check every beat.
 */

export type CinemaKind = "unlock" | "journey";

export const DURATION: Record<CinemaKind, number> = { unlock: 7.4, journey: 8.8 };

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** How far `t` has moved through the span from `a` to `b`, from 0 to 1. */
export const span = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));
export const smooth = (u: number) => { const x = clamp01(u); return x * x * (3 - 2 * x); };
export const easeOut = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);
export const easeIn = (u: number) => Math.pow(clamp01(u), 2);
const mix = (a: number, b: number, u: number) => a + (b - a) * u;

// ------------------------------------------------------------------ Odysseus --

/** When Odysseus is on foot (the footsteps follow this): up to the gate and, once it opens, through it; out of the cleared trial before he takes ship. */
export function walkingAt(kind: CinemaKind, t: number): boolean {
  return kind === "unlock" ? t < 2.7 || t > 5.5 : t > 0.2 && t < 2.4;
}

// ------------------------------------------------------------ the journey --

/** The journey's three paintings, back to front: the opacity of each layer, how far its camera has pushed in, and how far the voyage has sailed (0 at the cleared checkpoint, 1 at the next). */
export type JourneyShot = { from: number; map: number; to: number; fromZoom: number; mapZoom: number; toZoom: number; voyage: number };

export const JOURNEY_BEATS = { mapIn: [2.4, 3.0], sail: [3.0, 6.2], toIn: [6.0, 6.6] } as const;

export function journeyShot(t: number): JourneyShot {
  const { mapIn, sail, toIn } = JOURNEY_BEATS;
  const mapUp = smooth(span(t, mapIn[0], mapIn[1])), toUp = smooth(span(t, toIn[0], toIn[1]));
  const voyage = smooth(span(t, sail[0], sail[1]));
  return {
    // Stacked fades: the outgoing painting stays solid beneath the incoming one, so the frame never dims mid-fade.
    from: mapUp < 1 ? 1 : 0,
    map: toUp < 1 ? mapUp : 0,
    to: toUp,
    // The cleared trial pulls back; the chart rises a little mid-voyage to show the way; the next trial draws the eye in.
    fromZoom: mix(1.1, 1, easeOut(span(t, 0, mapIn[1]))),
    mapZoom: mix(2.3, 1.75, Math.sin(Math.PI * voyage)) - 0.15 * (1 - span(t, mapIn[0], sail[0])),
    toZoom: mix(1, 1.09, smooth(span(t, toIn[0], DURATION.journey))),
    voyage,
  };
}

/**
 * Where the ship's light is on the chart, as fractions of the map: a gentle
 * arc from one checkpoint to the next (bowed to one side so it reads as a
 * course, not a ruler line).
 */
export function voyagePoint(from: { x: number; y: number }, to: { x: number; y: number }, u: number) {
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2, dx = to.x - from.x, dy = to.y - from.y;
  const cx = mx - dy * 0.18, cy = my + dx * 0.18;
  const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
  return { x: a * from.x + b * cx + c * to.x, y: a * from.y + b * cy + c * to.y };
}

// --------------------------------------------------------------- the gate --

/** The unlock's camera push, the key's light coming down (y from above the frame, 0, to its centre, 1), the seal of fire and the pouring light. */
export type GateShot = { zoom: number; key: { visible: boolean; y: number; glow: number }; seal: number; light: number };

export function gateShot(t: number): GateShot {
  const appear = 2.5, lands = 3.75, gone = 5.05;
  const fall = easeOut(span(t, appear, lands));
  return {
    zoom: mix(1, 1.07, smooth(span(t, 0, 5))) + 0.1 * easeIn(span(t, 5, DURATION.unlock)),
    key: { visible: t >= appear && t < gone, y: fall, glow: 0.5 + 0.5 * span(t, lands, gone) },
    seal: runesAt("unlock", t),
    light: lightAt("unlock", t),
  };
}

/** The seal's fire, 0 (cold) to 1 (burning). In the journey, the next trial's call grows as it comes into view. */
export function runesAt(kind: CinemaKind, t: number) {
  if (kind === "unlock") return smooth(span(t, 4.35, 5.0));
  return 0.25 + 0.55 * smooth(span(t, 5.6, 8.0)) + 0.08 * Math.sin(t * 3);
}
/** Light pouring out once the key has turned, 0 to 1. */
export function lightAt(kind: CinemaKind, t: number) {
  return kind === "unlock" ? smooth(span(t, 4.8, 6.6)) : 0;
}
/** The white-gold flash the unlock ends on, and the dark the journey fades into. */
export function flashAt(kind: CinemaKind, t: number) {
  return kind === "unlock" ? easeIn(span(t, 6.7, DURATION.unlock)) : easeIn(span(t, 8.2, DURATION.journey));
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
    { t: 2.6, sound: "sail", gain: 0.5 },
    { t: 3.3, sound: "oar", gain: 0.35, pan: -0.15 },
    { t: 4.0, sound: "gust", gain: 0.45 },
    { t: 4.3, sound: "oar", gain: 0.35, pan: 0.15 },
    { t: 5.3, sound: "oar", gain: 0.3, pan: -0.1 },
    { t: 5.8, sound: "distant-thunder", gain: 0.4 },
    { t: 6.4, sound: "blessing", gain: 0.55 },
    { t: 7.6, sound: "rumble", gain: 0.5 },
  ],
};

/** Footsteps while he is on foot, alternating feet, then the score; sorted by time. */
export function cinemaCues(kind: CinemaKind): CinemaCue[] {
  const steps: CinemaCue[] = [];
  let foot = 0;
  for (let t = 0.12; t < DURATION[kind]; t += STEP[kind]) {
    if (walkingAt(kind, t)) steps.push({ t: Math.round(t * 100) / 100, sound: "step-stone", gain: 0.32, pan: foot++ % 2 ? 0.12 : -0.12 });
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
  if (past) out.push({ from: 0.5, to: 2.6, eyebrow: `Trial ${past.number} cleared`, title: past.title });
  out.push({ from: 5.9, to: DURATION.journey, eyebrow: `Trial ${next.number} of 8 · ahead`, title: next.title, line: next.kind });
  return out;
}

/** The caption showing at time `t`, if any. */
export const captionAt = (captions: readonly Caption[], t: number) => captions.find(c => t >= c.from && t < c.to) ?? null;
