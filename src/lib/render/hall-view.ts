// The great hall of Ithaca: where things stand and where the camera looks.
//
// Shared by the 3D hall and its flat fallback, so both draw the same contest
// from the same point of view. Nothing here reads back into the simulation.
//
// World space is in metres. The bow's arrow rest sits on the line of axe
// openings at `LINE_Y` above the floor, the line runs toward `-z`, and `+x`
// is to the archer's right. Path offsets from the rules (see `BOW`) become
// metres through `BOW.unitM`.

import { BOW, arrowTime, axeZ, bowSway, strikeZ, trajectoryAt, type BowState, type Shot } from "../encounters/mythic.ts";
import { VIEW_H, VIEW_W, clamp01, easeInOut, easeOut, lerp } from "./stage.ts";

export type Vec3 = { x: number; y: number; z: number };
export type HallCamera = { eye: Vec3; look: Vec3; fov: number };
export type ScreenPoint = { x: number; y: number; depth: number; scale: number; on: boolean };

/** Height of the axe openings, and of the arrow's line, above the floor. */
export const LINE_Y = 1.42;
/** Metres from the bow to the twelfth axe. */
export const LINE_M = BOW.firstAxeM + (BOW.axes - 1) * BOW.axeGapM;
/** The archer's eye at full draw: just above the arrow, behind the bow. */
export const EYE: Vec3 = { x: 0, y: LINE_Y + 0.08, z: 0.62 };
/** Looking across the line from the right-hand colonnade, the way a guest at the feast sees it. */
const GALLERY: HallCamera = { eye: { x: 3.05, y: 2.5, z: -0.4 }, look: { x: -0.35, y: 1.1, z: -9.2 }, fov: 50 };
/** The turn opens on the gallery view, then settles behind the bow over this long. */
const SETTLE_MS = 900;
/** After Antinous' result, the camera swings back out to the gallery over this long. */
const SWING_MS = 700;

/** A point `z` of the way to the twelfth axe, offset by path units from the line. */
export const onLine = (z: number, x = 0, y = 0): Vec3 => ({ x: x * BOW.unitM, y: LINE_Y + y * BOW.unitM, z: -z * LINE_M });
export const axeAt = (i: number) => onLine(axeZ(i));
/** Where a sight points: the straight line from the bow, met at the twelfth axe. */
export const sightPoint = (aim: { aim: number; elevation: number }) => onLine(1, aim.aim * BOW.perSight, aim.elevation * BOW.perSight);
/** Where `shot`'s arrow is, `z` of the way down the line. */
export function arrowPoint(shot: Pick<Shot, "aim" | "wind">, z: number): Vec3 {
  const p = trajectoryAt(shot.aim, shot.wind, z);
  return onLine(z, p.x, p.y);
}

export type Flight = {
  shot: Shot;
  /** ms since the arrow was loosed. */
  t: number;
  /** How far down the line it has come. */
  z: number;
  /** Where it comes to rest. */
  end: number;
  landed: boolean;
  /** ms since it came to rest, 0 while flying. */
  since: number;
};

/** The arrow in the hall right now: yours while Antinous waits, his while he shoots. */
export function flightOf(s: BowState): Flight | null {
  const shot = s.shot;
  if (!shot || !(s.phase === "rival" && shot.owner === "player" || s.phase === "review" && shot.owner === "rival")) return null;
  const end = strikeZ(shot), reach = arrowTime(end);
  return { shot, t: s.timer, z: Math.min(end, s.timer / BOW.reachMs), end, landed: s.timer >= reach, since: Math.max(0, s.timer - reach) };
}

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Vec3): Vec3 => { const n = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / n, y: a.y / n, z: a.z / n }; };
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
const mixCamera = (a: HallCamera, b: HallCamera, t: number): HallCamera => ({ eye: mix3(a.eye, b.eye, t), look: mix3(a.look, b.look, t), fov: lerp(a.fov, b.fov, t) });

/**
 * A pinhole projection into the logical 16:9 stage, matching a three.js
 * PerspectiveCamera placed at `eye`, looking at `look`, with vertical `fov`.
 */
export function projector(cam: HallCamera, width = VIEW_W, height = VIEW_H) {
  const forward = unit(sub(cam.look, cam.eye));
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const focal = height / 2 / Math.tan((cam.fov * Math.PI) / 360);
  return (p: Vec3): ScreenPoint => {
    const d = sub(p, cam.eye), depth = dot(d, forward);
    if (depth < 0.05) return { x: 0, y: 0, depth, scale: 0, on: false };
    const scale = focal / depth;
    return { x: width / 2 + dot(d, right) * scale, y: height / 2 - dot(d, up) * scale, depth, scale, on: true };
  };
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Behind the bow: the view leans a quarter of the way toward the sight and narrows as the string comes back. */
function aimCamera(s: BowState): HallCamera {
  const sway = bowSway(s);
  const sight = sightPoint({ aim: s.aim.aim + sway.aim, elevation: s.aim.elevation + sway.elevation });
  return { eye: EYE, look: mix3(onLine(1), sight, 0.25), fov: lerp(40, 28, easeOut(s.draw)) };
}

/** Riding behind an arrow, then easing back once it has struck so the axe it hit is framed. */
function chaseCamera(f: Flight): HallCamera {
  const arrow = arrowPoint(f.shot, f.z);
  const back = 0.95 + 0.85 * easeOut(f.since / 650);
  const lift = 0.16 + 0.12 * easeOut(f.since / 650);
  return { eye: add(arrow, { x: -0.14, y: lift, z: back }), look: add(arrow, { x: 0, y: -0.02, z: -3 }), fov: lerp(56, 48, clamp01(f.since / 650)) };
}

/** The gallery view, panning to keep Antinous' arrow in frame as it flies. */
function galleryCamera(f: Flight | null): HallCamera {
  if (!f) return GALLERY;
  const arrow = arrowPoint(f.shot, f.z), follow = clamp01(f.z / BOW.doorway);
  return { eye: add(GALLERY.eye, { x: 0, y: 0, z: arrow.z * 0.45 }), look: mix3(GALLERY.look, add(arrow, { x: 0, y: -0.1, z: -1.5 }), 0.65), fov: lerp(GALLERY.fov, 44, follow) };
}

/**
 * Where the camera is for this moment of the contest. Each turn opens on the
 * gallery view of the line, then settles behind the bow; your arrow is chased
 * down the hall; Antinous' is watched from the gallery.
 */
export function hallCamera(s: BowState): HallCamera {
  if (s.phase === "player") return mixCamera(GALLERY, aimCamera(s), easeInOut(clamp01(s.timer / SETTLE_MS)));
  const f = flightOf(s);
  if (s.phase === "rival" && f) {
    const watch = BOW.flightMs + BOW.resultMs;
    return s.timer < watch ? chaseCamera(f) : mixCamera(chaseCamera(f), GALLERY, easeInOut(clamp01((s.timer - watch) / SWING_MS)));
  }
  return galleryCamera(f);
}
