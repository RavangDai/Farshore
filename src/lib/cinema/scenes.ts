// FARSHORE cinematic scene configuration: each environment's copy, accent
// and soundscape in one place. The painted environments themselves (and the
// effects over them) are in ./art.ts; the chrome, the backdrops and the
// ambience all read from here, so a trial's accent and its sound cannot drift
// apart.

import type { SceneName } from "../audio/ambience.ts";
import type { TrialId } from "../arcade/arcade.ts";

/** Interface accent for an environment (buttons, rules, focus). */
export type SceneLook = { accent: string };

export type TrialCopy = {
  numeral: string;
  short: string;
  /** The chapter title, split where a line break reads best. */
  lines: [string, string];
  /** One short objective. Everything longer lives in the optional drawers. */
  objective: string;
  ambience: SceneName;
};

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
  lotus: { accent: "#e79ab9" },
  cyclops: { accent: "#e8743a" },
  aeolus: { accent: "#8fc6ea" },
  circe: { accent: "#b48cf0" },
  sirens: { accent: "#8fb2ee" },
  scylla: { accent: "#5fc2bd" },
  calypso: { accent: "#56c7bd" },
  bow: { accent: "#ecc778" },
};

/** The main menu's moonlit coast and the voyage chart. */
export const AEGEAN_LOOK: SceneLook = { accent: "#e4bf79" };

export type WorldSpec =
  | { kind: "aegean"; dim?: boolean }
  | { kind: "map" }
  | { kind: "trial"; id: TrialId; framing: "wide" | "close" | "result"; mood?: "victory" | "defeat" };

/** The roman chapter numeral, e.g. "Trial IV". */
export const chapterOf = (id: TrialId) => `Trial ${TRIAL_COPY[id].numeral}`;
