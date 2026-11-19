// FARSHORE cinematic scene configuration: the one place each environment's
// look, copy and sound is defined. The 3D worlds, the DOM chrome and the
// ambience all read from here, so a trial's accent colour, its fog and its
// soundscape cannot drift apart.

import type { SceneName } from "../audio/ambience.ts";
import type { TrialId } from "../arcade/arcade.ts";

export type ParticleKind = "petals" | "embers" | "wind" | "motes" | "bubbles" | "spray" | "rain" | "dust";
export type Vec3 = [number, number, number];

export type ParticleSpec = { kind: ParticleKind; count: number; color: string; size: number; area: Vec3; center: Vec3; velocity: Vec3; sway: number };

export type SceneLook = {
  /** Interface accent for this environment (buttons, rules, focus). */
  accent: string;
  /** Sky gradient: zenith, middle, horizon. */
  sky: [string, string, string];
  fog: string;
  fogDensity: number;
  hemi: { sky: string; ground: string; intensity: number };
  key: { color: string; intensity: number; position: Vec3 };
  /** A body in the sky: the moon at night, a low sun at dusk. */
  orb?: { kind: "moon" | "sun"; direction: Vec3; size: number; color: string; glow: string };
  stars: number;
  clouds: { cover: number; color: string; speed: number; storm?: boolean };
  water?: { deep: string; shallow: string; glint: string; chop: number; size: number; level: number };
  particles: ParticleSpec[];
  exposure: number;
  /** Camera framings: the wide chapter view and the closer briefing view. */
  camera: { wide: { position: Vec3; target: Vec3; fov: number }; close: { position: Vec3; target: Vec3; fov: number } };
};

export type TrialCopy = {
  numeral: string;
  short: string;
  /** The chapter title, split where a line break reads best. */
  lines: [string, string];
  /** One short objective. Everything longer lives in the optional drawers. */
  objective: string;
  ambience: SceneName;
};

const p = (kind: ParticleKind, count: number, color: string, size: number, area: Vec3, center: Vec3, velocity: Vec3, sway = 0.4): ParticleSpec => ({ kind, count, color, size, area, center, velocity, sway });

export const TRIAL_COPY: Record<TrialId, TrialCopy> = {
  lotus: { numeral: "I", short: "Lotus-Eaters", lines: ["Land of the", "Lotus-Eaters"], objective: "Bring three sailors home.", ambience: "garden" },
  cyclops: { numeral: "II", short: "Cyclops’ Cave", lines: ["The Cyclops’", "Cave"], objective: "Outrun the blinded giant.", ambience: "cave" },
  aeolus: { numeral: "III", short: "Aeolus", lines: ["Island of", "Aeolus"], objective: "Ride the unbound winds.", ambience: "gale" },
  circe: { numeral: "IV", short: "Circe’s Palace", lines: ["Circe’s", "Palace"], objective: "Out-brew the enchantress.", ambience: "calm" },
  sirens: { numeral: "V", short: "Sirens’ Passage", lines: ["The Sirens’", "Passage"], objective: "Keep the oars to the song.", ambience: "calm" },
  scylla: { numeral: "VI", short: "Scylla & Charybdis", lines: ["Scylla &", "Charybdis"], objective: "Survive the strait.", ambience: "strait" },
  calypso: { numeral: "VII", short: "Calypso’s Raft", lines: ["Calypso’s", "Raft"], objective: "Cross the storm on drifting timber.", ambience: "storm" },
  bow: { numeral: "VIII", short: "Ithaca", lines: ["The Palace", "of Ithaca"], objective: "Send an arrow through twelve axes.", ambience: "hall" },
};

export const TRIAL_LOOKS: Record<TrialId, SceneLook> = {
  lotus: {
    accent: "#e79ab9",
    sky: ["#0b1230", "#2a2950", "#c98a73"],
    fog: "#3b3350", fogDensity: 0.022,
    hemi: { sky: "#8d94c9", ground: "#2c3a1f", intensity: 0.75 },
    key: { color: "#ffd2a1", intensity: 1.6, position: [-8, 6, -14] },
    orb: { kind: "moon", direction: [0.12, 0.42, -1], size: 0.05, color: "#fff4dc", glow: "#ffd9b0" },
    stars: 0.5,
    clouds: { cover: 0.32, color: "#9b88a6", speed: 0.012 },
    water: { deep: "#0d2028", shallow: "#2d4b4a", glint: "#ffd7a8", chop: 0.08, size: 60, level: 0 },
    particles: [p("petals", 160, "#f39cc0", 0.32, [26, 9, 22], [0, 4, -4], [0.25, -0.35, 0.1], 0.9), p("motes", 70, "#ffd88c", 0.16, [22, 6, 16], [0, 2, -5], [0, 0.08, 0], 0.5)],
    exposure: 1.05,
    camera: { wide: { position: [-1.5, 2.6, 10.5], target: [1.2, 2.2, -6], fov: 42 }, close: { position: [-0.6, 3.4, 8.6], target: [3.6, 2.4, -8], fov: 38 } },
  },
  cyclops: {
    accent: "#e8743a",
    sky: ["#050403", "#120a07", "#2a140b"],
    fog: "#2a150b", fogDensity: 0.028,
    hemi: { sky: "#8a4a26", ground: "#140a06", intensity: 0.75 },
    key: { color: "#ff9a52", intensity: 1.1, position: [3, 8, 6] },
    stars: 0,
    clouds: { cover: 0, color: "#000000", speed: 0 },
    particles: [p("embers", 220, "#ff8a3d", 0.14, [16, 10, 18], [0, 3, -5], [0.05, 0.9, 0], 0.6), p("dust", 80, "#ffb27a", 0.08, [12, 6, 12], [0, 2, -3], [0.02, 0.03, 0], 0.3)],
    exposure: 1.15,
    camera: { wide: { position: [0, 2.2, 9.5], target: [0, 2.6, -8], fov: 46 }, close: { position: [1.6, 1.8, 5.8], target: [0.6, 2.8, -9], fov: 40 } },
  },
  aeolus: {
    accent: "#8fc6ea",
    sky: ["#0a1626", "#29405a", "#7b8fa0"],
    fog: "#3a4d60", fogDensity: 0.018,
    hemi: { sky: "#a9c2db", ground: "#1b2633", intensity: 0.85 },
    key: { color: "#dfe9ff", intensity: 1.4, position: [10, 12, -6] },
    orb: { kind: "moon", direction: [-0.35, 0.5, -1], size: 0.035, color: "#eef3ff", glow: "#b9d4f2" },
    stars: 0.12,
    clouds: { cover: 0.62, color: "#8796ab", speed: 0.05, storm: true },
    water: { deep: "#0a1c2b", shallow: "#26506b", glint: "#d5e6ff", chop: 0.55, size: 90, level: 0 },
    particles: [p("wind", 140, "#d9ecff", 0.5, [40, 12, 24], [0, 6, -8], [6, 0.2, 0.6], 0.6), p("spray", 60, "#e6f2ff", 0.12, [24, 3, 14], [0, 0.8, -4], [2.2, 0.6, 0], 0.3)],
    exposure: 1.0,
    camera: { wide: { position: [-2, 3.2, 12], target: [1, 4.6, -8], fov: 44 }, close: { position: [0.4, 3.4, 8.5], target: [1.4, 5.2, -8], fov: 40 } },
  },
  circe: {
    accent: "#b48cf0",
    sky: ["#08061a", "#22164a", "#5b3a7e"],
    fog: "#2a1946", fogDensity: 0.03,
    hemi: { sky: "#7e61c9", ground: "#170f24", intensity: 0.6 },
    key: { color: "#c9a4ff", intensity: 0.9, position: [-6, 8, -10] },
    orb: { kind: "moon", direction: [-0.4, 0.55, -1], size: 0.03, color: "#f1e6ff", glow: "#b78cff" },
    stars: 0.65,
    clouds: { cover: 0.25, color: "#6e5698", speed: 0.01 },
    water: { deep: "#120a24", shallow: "#3a2366", glint: "#d8b8ff", chop: 0.05, size: 50, level: 0 },
    particles: [p("bubbles", 120, "#c79bff", 0.22, [16, 9, 14], [0, 3, -5], [0, 0.45, 0], 0.5), p("motes", 70, "#7df5c8", 0.14, [16, 7, 12], [0, 2.5, -4], [0, 0.2, 0], 0.7)],
    exposure: 1.1,
    camera: { wide: { position: [0, 2.4, 11], target: [0, 3, -8], fov: 42 }, close: { position: [1.2, 2.2, 7], target: [0.6, 3.2, -8], fov: 38 } },
  },
  sirens: {
    accent: "#8fb2ee",
    sky: ["#030714", "#0e1d3d", "#2f4b78"],
    fog: "#142542", fogDensity: 0.02,
    hemi: { sky: "#6b88c7", ground: "#05080f", intensity: 0.55 },
    key: { color: "#cfe0ff", intensity: 1.5, position: [6, 10, -18] },
    orb: { kind: "moon", direction: [0.1, 0.24, -1], size: 0.075, color: "#f6f3ea", glow: "#c3d4ff" },
    stars: 0.9,
    clouds: { cover: 0.22, color: "#4a5f88", speed: 0.012 },
    water: { deep: "#030a18", shallow: "#123058", glint: "#e9efff", chop: 0.28, size: 120, level: 0 },
    particles: [p("motes", 140, "#bcd0ff", 0.14, [30, 6, 20], [0, 2, -8], [0.1, 0.05, 0], 0.8), p("spray", 50, "#dfe8ff", 0.1, [20, 2, 10], [0, 0.6, -6], [0.3, 0.4, 0], 0.3)],
    exposure: 1.0,
    camera: { wide: { position: [0, 2.2, 12], target: [0, 2.8, -14], fov: 44 }, close: { position: [-1.4, 1.9, 8.4], target: [0.8, 2.6, -14], fov: 40 } },
  },
  scylla: {
    accent: "#5fc2bd",
    sky: ["#02060a", "#0b1d24", "#243d43"],
    fog: "#0f2328", fogDensity: 0.03,
    hemi: { sky: "#517a83", ground: "#03070a", intensity: 0.55 },
    key: { color: "#b6e3ff", intensity: 0.9, position: [-4, 12, -10] },
    stars: 0,
    clouds: { cover: 0.9, color: "#2c4249", speed: 0.08, storm: true },
    water: { deep: "#02101a", shallow: "#164650", glint: "#cbeaff", chop: 1, size: 110, level: 0 },
    particles: [p("rain", 520, "#bcd7e6", 0.7, [30, 16, 22], [0, 7, -4], [-1.6, -16, 0], 0.05), p("spray", 120, "#e3f5ff", 0.16, [22, 4, 16], [0, 1, -8], [0.8, 1.2, 0], 0.4)],
    exposure: 1.05,
    camera: { wide: { position: [0, 3, 12], target: [0, 3.2, -10], fov: 46 }, close: { position: [1.4, 2.6, 8], target: [0.4, 3.6, -10], fov: 40 } },
  },
  calypso: {
    accent: "#56c7bd",
    sky: ["#13213e", "#6f6a86", "#f0a36a"],
    fog: "#a77a72", fogDensity: 0.016,
    hemi: { sky: "#ffcfa0", ground: "#284a4a", intensity: 0.9 },
    key: { color: "#ffb36b", intensity: 2.2, position: [-14, 3, -20] },
    orb: { kind: "sun", direction: [-0.5, 0.05, -1], size: 0.05, color: "#fff0c8", glow: "#ff9c55" },
    stars: 0,
    clouds: { cover: 0.42, color: "#d48d7c", speed: 0.03 },
    water: { deep: "#0b3240", shallow: "#2b8d8e", glint: "#ffd29a", chop: 0.5, size: 110, level: 0 },
    particles: [p("spray", 160, "#fff5e6", 0.14, [24, 3, 14], [0, 0.7, -2], [1.2, 0.9, 0.2], 0.5), p("motes", 50, "#ffd9a0", 0.1, [20, 6, 14], [0, 2.5, -6], [0.3, 0.05, 0], 0.4)],
    exposure: 1.0,
    camera: { wide: { position: [0, 2.2, 10], target: [-1, 2, -12], fov: 44 }, close: { position: [1.8, 1.6, 6.5], target: [0, 1.4, -6], fov: 40 } },
  },
  bow: {
    accent: "#ecc778",
    sky: ["#0d0804", "#1d130a", "#2c1d10"],
    fog: "#2a1a0d", fogDensity: 0.03,
    hemi: { sky: "#c9915a", ground: "#2a1b10", intensity: 0.55 },
    key: { color: "#ffcf8a", intensity: 1.2, position: [0, 9, 4] },
    stars: 0,
    clouds: { cover: 0, color: "#000000", speed: 0 },
    particles: [p("dust", 260, "#ffd99a", 0.1, [12, 8, 30], [0, 3.5, -10], [0.02, 0.06, 0], 0.35), p("embers", 60, "#ffb35c", 0.1, [10, 4, 24], [0, 2, -10], [0, 0.5, 0], 0.4)],
    exposure: 1.1,
    camera: { wide: { position: [0, 2.6, 10], target: [0, 2.4, -14], fov: 46 }, close: { position: [-1.2, 2.1, 6], target: [0.4, 2.2, -14], fov: 40 } },
  },
};

/** The main menu's moonlit Aegean coast. */
export const AEGEAN_LOOK: SceneLook = {
  accent: "#e4bf79",
  sky: ["#02050c", "#0a1730", "#25385a"],
  fog: "#14223a", fogDensity: 0.012,
  hemi: { sky: "#5f79a8", ground: "#05080d", intensity: 0.6 },
  key: { color: "#d7e2ff", intensity: 1.6, position: [10, 14, -30] },
  orb: { kind: "moon", direction: [0.4, 0.3, -1], size: 0.036, color: "#fff7e4", glow: "#d8e2ff" },
  stars: 1,
  clouds: { cover: 0.36, color: "#3d5378", speed: 0.01 },
  water: { deep: "#020914", shallow: "#14304f", glint: "#fff1cf", chop: 0.42, size: 220, level: 0 },
  particles: [p("motes", 90, "#ffd48a", 0.13, [26, 8, 16], [-4, 3, 2], [0.15, 0.05, 0], 0.6), p("spray", 60, "#dbe6ff", 0.1, [14, 2, 10], [7, 0.7, -2], [0.5, 0.5, 0], 0.4)],
  exposure: 1.0,
  camera: { wide: { position: [0, 2.4, 14], target: [3, 3.2, -10], fov: 45 }, close: { position: [0, 2.4, 14], target: [3, 3.2, -10], fov: 45 } },
};

/** The voyage chart: the Aegean seen from above at dusk. */
export const MAP_LOOK: SceneLook = {
  accent: "#e4bf79",
  sky: ["#050a14", "#14263c", "#3a4c62"],
  fog: "#1a2a3c", fogDensity: 0.011,
  hemi: { sky: "#a3b6d4", ground: "#0a1018", intensity: 0.9 },
  key: { color: "#ffd9a6", intensity: 1.8, position: [-14, 18, -10] },
  orb: { kind: "moon", direction: [0.3, 0.32, -1], size: 0.04, color: "#fff4dc", glow: "#c9d6ef" },
  stars: 0.4,
  clouds: { cover: 0.4, color: "#3f5068", speed: 0.012 },
  water: { deep: "#04121e", shallow: "#1b4660", glint: "#ffe2b0", chop: 0.16, size: 160, level: 0 },
  particles: [p("motes", 60, "#ffd48a", 0.12, [40, 6, 30], [0, 3, 0], [0.1, 0.05, 0], 0.6)],
  exposure: 1.05,
  camera: { wide: { position: [0, 21, 19], target: [0, 0, 0.5], fov: 40 }, close: { position: [0, 21, 19], target: [0, 0, 0.5], fov: 40 } },
};

export type WorldSpec =
  | { kind: "aegean"; dim?: boolean }
  | { kind: "map" }
  | { kind: "trial"; id: TrialId; framing: "wide" | "close" | "result"; mood?: "victory" | "defeat" };

/** A stable key: worlds that share a key morph in place (camera, mood) rather than cut. */
export const worldKey = (w: WorldSpec) => (w.kind === "trial" ? `trial:${w.id}` : w.kind);

export const lookOf = (w: WorldSpec): SceneLook => (w.kind === "trial" ? TRIAL_LOOKS[w.id] : w.kind === "map" ? MAP_LOOK : AEGEAN_LOOK);

/** The roman chapter numeral, e.g. "Trial IV". */
export const chapterOf = (id: TrialId) => `Trial ${TRIAL_COPY[id].numeral}`;
