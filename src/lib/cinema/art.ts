// The FARSHORE cinematic asset pack, as the menus use it: one painted
// environment per screen (docs/Farshore-Cinematic-Assets, copied to
// public/art/cinematic by scripts/build-cinematic-assets.mjs), where to crop
// it, and the light atmospheric effects drawn over it. Every position here is
// a percentage of the un-cropped 1672 x 941 painting, so effects stay pinned
// to the torch, the lotus or the sea they belong to at any crop.

import type { TrialId } from "../arcade/arcade.ts";
import type { WorldSpec } from "./scenes.ts";

export const ART_WIDTH = 1672;
export const ART_HEIGHT = 941;
const ROOT = "/art/cinematic";

export type EnvId = "home" | "lotus-briefing" | TrialId;

/** A particle stream. Area is [x0, y0, x1, y1] in % of the painting; drift is % per second; size is in painting pixels. */
export type FxEmitter = { kind: "petals" | "embers" | "motes" | "wind" | "rain" | "spray" | "bubbles" | "mist"; count: number; color: string; size: number; area: [number, number, number, number]; drift?: [number, number] };
/** A light that breathes or flickers (torches, braziers, the lotus): centre and radius in % of the painting width. */
export type FxGlow = { x: number; y: number; r: number; color: string; flicker: number };
export type FxSpec = {
  emitters: FxEmitter[];
  glows: FxGlow[];
  /** Twinkling glints on water. */
  shimmer?: { area: [number, number, number, number]; count: number; color: string };
  /** A distant lightning flash now and then, centred here. */
  lightning?: { x: number; y: number };
};

export type Environment = {
  /** File stem in public/art/cinematic/environments. */
  file: string;
  /** Where the wide crop anchors (object-position, 0..1): the focal subject stays in frame. */
  focus: [number, number];
  /** Horizontal crop for portrait cards and thumbnails, in %. */
  card: number;
  fx: FxSpec;
};

const e = (kind: FxEmitter["kind"], count: number, color: string, size: number, area: FxEmitter["area"], drift?: FxEmitter["drift"]): FxEmitter => ({ kind, count, color, size, area, drift });
const g = (x: number, y: number, r: number, color: string, flicker = 0.4): FxGlow => ({ x, y, r, color, flicker });

export const ENVIRONMENTS: Record<EnvId, Environment> = {
  home: {
    file: "00-home", focus: [0.78, 0.3], card: 76,
    fx: {
      emitters: [e("motes", 26, "#ffd48a", 2.2, [52, 18, 100, 72], [0.25, -0.15]), e("spray", 28, "#e4ecff", 1.6, [68, 66, 92, 76]), e("mist", 6, "#9fb3d8", 150, [0, 52, 62, 82], [0.6, 0])],
      glows: [g(74.2, 59, 1.6, "#ffb347", 0.45), g(97.4, 59.5, 1.6, "#ffb347", 0.45), g(82.5, 22, 5, "#ffcf87", 0.12)],
      shimmer: { area: [34, 63, 100, 95], count: 40, color: "#fff1cf" },
    },
  },
  lotus: {
    file: "01-lotus-eaters", focus: [0.7, 0.55], card: 70,
    fx: {
      emitters: [e("petals", 34, "#f39cc0", 9, [0, -4, 100, 100], [1.1, 2.4]), e("motes", 24, "#ffd88c", 2, [38, 28, 100, 72], [0.1, -0.3])],
      glows: [g(71.5, 62.5, 7, "#ffb0d6", 0.18), g(55.6, 49.5, 1.2, "#ffc46b", 0.5), g(76, 47, 1.2, "#ffc46b", 0.5)],
      shimmer: { area: [34, 64, 100, 96], count: 30, color: "#ffd7a8" },
    },
  },
  "lotus-briefing": {
    file: "01-lotus-briefing", focus: [0.75, 0.55], card: 84,
    fx: {
      emitters: [e("petals", 28, "#f59ac4", 9, [0, -4, 100, 100], [1.4, 2.2]), e("motes", 34, "#ffe2a0", 1.8, [52, 0, 100, 62], [-0.4, 0.2])],
      glows: [g(96, 19, 10, "#ffd27a", 0.08)],
      shimmer: { area: [45, 67, 100, 100], count: 36, color: "#fff0c0" },
    },
  },
  cyclops: {
    file: "02-cyclops-cave", focus: [0.78, 0.32], card: 78,
    fx: {
      emitters: [e("embers", 34, "#ff8a3d", 2.4, [89, 18, 97, 34], [0.2, -5]), e("embers", 14, "#ff6a2a", 1.8, [40, 26, 52, 40], [0.3, -2]), e("motes", 28, "#ffb27a", 1.6, [40, 30, 100, 82], [0.15, -0.2]), e("mist", 6, "#d9b8a0", 140, [30, 56, 75, 78], [0.5, 0])],
      glows: [g(93.6, 29.5, 4, "#ff9a3d", 0.55), g(52.7, 50, 1.4, "#ff9a3d", 0.6), g(81, 49, 1.4, "#ff9a3d", 0.6), g(46, 34, 3, "#ff6a2a", 0.3), g(78.5, 18.8, 2.4, "#ffb347", 0.22)],
    },
  },
  aeolus: {
    file: "03-aeolus", focus: [0.72, 0.4], card: 80,
    fx: {
      emitters: [e("wind", 18, "#d9ecff", 2.4, [-10, 4, 100, 76], [30, 0.6]), e("spray", 44, "#e6f2ff", 1.8, [26, 70, 100, 100]), e("motes", 14, "#fff0c8", 1.6, [50, 5, 90, 40], [1.5, 0])],
      glows: [g(62.6, 36, 1.3, "#ffc46b", 0.5), g(51.4, 42, 1.1, "#ffc46b", 0.5), g(78.2, 21.8, 1.2, "#ffc46b", 0.5), g(68, 22, 9, "#fff0c8", 0.08)],
    },
  },
  circe: {
    file: "04-circes-palace", focus: [0.68, 0.5], card: 84,
    fx: {
      emitters: [e("bubbles", 22, "#d6a8ff", 2.6, [80, 42, 95, 66], [0, -2.4]), e("motes", 26, "#c79bff", 2, [38, 20, 100, 80], [0.3, -0.4]), e("petals", 16, "#c26ad8", 8, [0, -4, 100, 100], [0.8, 2])],
      glows: [g(34.6, 46.5, 3, "#ffa040", 0.55), g(94.2, 36.5, 3.4, "#ffa040", 0.55), g(87, 62, 5, "#c070ff", 0.25)],
    },
  },
  sirens: {
    file: "05-sirens-passage", focus: [0.7, 0.4], card: 72,
    fx: {
      emitters: [e("motes", 40, "#b48cf0", 2, [30, 10, 100, 80], [0.4, -0.2]), e("mist", 7, "#a9b8e6", 150, [0, 34, 56, 70], [0.6, 0]), e("spray", 22, "#dfe8ff", 1.4, [28, 62, 60, 80])],
      glows: [g(72, 28, 7, "#a46bff", 0.2), g(79.5, 6.5, 5, "#dfe8ff", 0.06)],
      shimmer: { area: [70, 44, 92, 62], count: 40, color: "#e9efff" },
    },
  },
  scylla: {
    file: "06-scylla-charybdis", focus: [0.7, 0.45], card: 76,
    fx: {
      emitters: [e("rain", 130, "#bcd7e6", 1, [-10, -5, 100, 100], [-6, 95]), e("spray", 56, "#e3f5ff", 2, [40, 56, 100, 100]), e("mist", 6, "#9fb8c4", 160, [30, 40, 100, 70], [0.8, 0])],
      glows: [g(66, 28, 1.6, "#ff7a2a", 0.4), g(67.5, 46.5, 1.4, "#ff7a2a", 0.4), g(95.5, 37, 1.6, "#ff7a2a", 0.4), g(77, 84, 6, "#7fe8ff", 0.15)],
      lightning: { x: 36.5, y: 22 },
    },
  },
  calypso: {
    file: "07-calypsos-raft", focus: [0.72, 0.5], card: 80,
    fx: {
      emitters: [e("spray", 52, "#fff5e6", 1.8, [40, 52, 90, 92]), e("motes", 22, "#ffd9a0", 1.8, [58, 8, 100, 50], [-0.5, 0.1])],
      glows: [g(98, 39, 8, "#ffc070", 0.08)],
      shimmer: { area: [55, 45, 100, 76], count: 36, color: "#ffd29a" },
    },
  },
  bow: {
    file: "08-ithaca", focus: [0.6, 0.5], card: 56,
    fx: {
      emitters: [e("motes", 70, "#ffd99a", 1.6, [34, 4, 82, 70], [0.25, 0.15]), e("embers", 10, "#ffb35c", 1.8, [27, 34, 31, 42], [0.1, -4]), e("embers", 10, "#ffb35c", 1.8, [96, 34, 100, 42], [0.1, -4])],
      glows: [g(28.9, 41.8, 2.6, "#ffa848", 0.5), g(75.2, 44.6, 1.8, "#ffa848", 0.5), g(91.5, 44.6, 1.8, "#ffa848", 0.5), g(98, 42, 2.6, "#ffa848", 0.5)],
    },
  },
};

/** The voyage chart's own atmosphere: petals off the lotus isle, glints on the sea, island lights. */
export const MAP_FX: FxSpec = {
  emitters: [e("petals", 16, "#f39cc0", 6, [0, 14, 24, 46], [0.8, 0.9]), e("mist", 5, "#b9c6dc", 170, [72, 8, 104, 70], [-0.4, 0])],
  glows: [g(12.4, 33, 4, "#ff9ad0", 0.18), g(27.4, 24.5, 2, "#ffa040", 0.45), g(61.5, 22.5, 4, "#ffd27a", 0.14), g(40.6, 69, 2.2, "#ffb050", 0.35)],
  shimmer: { area: [14, 26, 96, 96], count: 54, color: "#ffe2b0" },
};

export const envSrc = (id: EnvId) => `${ROOT}/environments/${ENVIRONMENTS[id].file}.webp`;
export const envCard = (id: EnvId) => `${ROOT}/environments/${ENVIRONMENTS[id].file}-card.webp`;
/** The untouched production PNG (kept for download and re-derivation). */
export const envOriginal = (id: EnvId) => `${ROOT}/environments/${ENVIRONMENTS[id].file}.png`;

/** Which painting a menu world shows. The voyage chart draws its own stage. */
export function envFor(world: WorldSpec): EnvId | null {
  if (world.kind === "map") return null;
  if (world.kind === "aegean") return "home";
  if (world.id === "lotus" && world.framing === "close") return "lotus-briefing";
  return world.id;
}
