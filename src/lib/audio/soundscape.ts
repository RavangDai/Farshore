// What FARSHORE sounds like on each screen: the music state, which place's
// music and ambience play, and each island's auditory identity (the one-shots
// that make the Cyclops' cave or Circe's palace recognisable with eyes shut).
// Pure data and functions, so the rules are tested (tests/audio-director.test.mjs).

import type { TrialId } from "../arcade/arcade.ts";
import type { SceneName } from "./ambience.ts";
import { TRIAL_PLACE, type AudioPlace, type SampleName } from "./library.ts";
import type { SoundName } from "./sounds.ts";

export type MusicState = "menu" | "exploration" | "introduction" | "gameplay" | "victory" | "defeat" | "homecoming";

export type Soundscape = {
  state: MusicState;
  /** The music loop and its level (the trial introduction sits lower, under the narration). */
  music: AudioPlace;
  musicLevel: number;
  /** The sampled ambience loop, and the procedural scene layered under it (beds, reverb, occasional sounds). */
  ambience: AudioPlace;
  scene: SceneName;
  /** The island's identity one-shots play on the menus, never over gameplay where every sound means something. */
  identity: boolean;
};

/** The procedural scene each place's menus sit in (gameplay sets its own from the simulation). */
export const PLACE_SCENE: Record<AudioPlace, SceneName> = {
  home: "sea", "voyage-map": "sea", "lotus-eaters": "garden", "cyclops-cave": "cave", aeolus: "gale",
  "circes-palace": "hall", "sirens-passage": "calm", "scylla-charybdis": "strait", "calypsos-raft": "storm", ithaca: "hall",
};

type Screen = "splash" | "title" | "intro" | "trials" | "map" | "brief" | "play" | "result" | "ending" | "howto" | "credits" | "lab" | "crossing";

export function soundscape(screen: Screen | string, selected: TrialId, outcome: "victory" | "defeat" | "practice" | null = null): Soundscape {
  const place = TRIAL_PLACE[selected];
  const at = (state: MusicState, music: AudioPlace, musicLevel: number, ambience: AudioPlace, identity = true): Soundscape => ({ state, music, musicLevel, ambience, scene: PLACE_SCENE[ambience], identity });
  switch (screen) {
    case "map": case "crossing": return at("exploration", "voyage-map", 0.9, "voyage-map");
    // The carousel keeps one exploration theme while the ambience follows the island in view.
    case "trials": return at("exploration", "voyage-map", 0.85, place);
    case "brief": return at("introduction", place, 0.72, place);
    case "play": return at("gameplay", place, 1, place, false);
    case "result":
      if (outcome === "victory") return at("victory", "voyage-map", 0.85, place);
      if (outcome === "defeat") return at("defeat", place, 0.5, place);
      return at("introduction", place, 0.7, place);
    case "ending": return at("homecoming", "ithaca", 0.95, "ithaca");
    default: return at("menu", "home", 0.9, "home");
  }
}

/** One occasional sound: a procedural recipe or a pack sample, every so many seconds, optionally answered by a second. */
export type IdentityShot = {
  sound?: SoundName; sample?: SampleName;
  every: [number, number]; gain: [number, number]; rate?: [number, number]; pan?: [number, number];
  then?: { sample?: SampleName; sound?: SoundName; delay: number; gain: number };
};

const shot = (s: IdentityShot) => s;

/**
 * Each island's identity, layered over its ambience loop and procedural beds
 * (the cave's air and torches, the garden's birds, the strait's whirlpool):
 * Lotus chimes; the Cyclops' distant roar and footfalls; Aeolus' sails and
 * thunder; Circe's potions and magic; the Sirens' far song; Scylla's roars and
 * the maelstrom; Calypso's raft and spray; Ithaca's bowstrings and targets.
 */
export const IDENTITY: Record<AudioPlace, IdentityShot[]> = {
  home: [shot({ sample: "sail-flap", every: [16, 28], gain: [0.15, 0.25] })],
  "voyage-map": [shot({ sample: "sail-flap", every: [12, 22], gain: [0.18, 0.3] }), shot({ sound: "bird", every: [9, 18], gain: [0.15, 0.3], rate: [0.9, 1.15] })],
  "lotus-eaters": [
    // Mystical chimes over the garden's water and birds.
    shot({ sound: "ting", every: [2.5, 6], gain: [0.08, 0.16], rate: [1.5, 2.2] }),
    shot({ sound: "ting", every: [5, 11], gain: [0.06, 0.12], rate: [1.12, 1.34] }),
  ],
  "cyclops-cave": [
    shot({ sound: "roar", every: [18, 32], gain: [0.12, 0.2], rate: [0.78, 0.9] }),
    shot({ sound: "giant-step", every: [11, 20], gain: [0.18, 0.28], then: { sound: "giant-step", delay: 0.62, gain: 0.22 } }),
    shot({ sample: "boulder-rumble", every: [22, 40], gain: [0.12, 0.2] }),
  ],
  aeolus: [
    shot({ sample: "sail-flap", every: [5, 10], gain: [0.25, 0.4] }),
    shot({ sound: "gust", every: [6, 12], gain: [0.2, 0.35] }),
    shot({ sound: "distant-thunder", every: [14, 26], gain: [0.25, 0.4] }),
  ],
  "circes-palace": [
    shot({ sample: "magic-pulse", every: [8, 15], gain: [0.18, 0.28] }),
    shot({ sample: "potion-mix", every: [10, 19], gain: [0.15, 0.25] }),
    shot({ sound: "plop", every: [2.5, 6], gain: [0.08, 0.15], rate: [0.9, 1.3] }),
    shot({ sound: "fizz", every: [7, 13], gain: [0.06, 0.12] }),
  ],
  "sirens-passage": [
    shot({ sample: "siren-note", every: [9, 17], gain: [0.16, 0.26], rate: [0.94, 1.06] }),
    shot({ sound: "siren-note", every: [6, 12], gain: [0.06, 0.1], rate: [1, 1.5] }),
    shot({ sound: "lyre", every: [13, 22], gain: [0.08, 0.14] }),
  ],
  "scylla-charybdis": [
    shot({ sample: "sea-monster-roar", every: [15, 28], gain: [0.18, 0.28] }),
    shot({ sample: "maelstrom-surge", every: [12, 22], gain: [0.2, 0.3] }),
    shot({ sound: "distant-thunder", every: [10, 20], gain: [0.3, 0.45] }),
    shot({ sound: "splash-big", every: [6, 12], gain: [0.12, 0.2] }),
  ],
  "calypsos-raft": [
    shot({ sample: "raft-creak", every: [4, 9], gain: [0.22, 0.35] }),
    shot({ sample: "water-splash", every: [5, 10], gain: [0.2, 0.3] }),
  ],
  ithaca: [
    // Practice in the hall: a bowstring, then the arrow finding its target.
    shot({ sample: "bow-twang", every: [12, 22], gain: [0.12, 0.2], then: { sample: "target-hit", delay: 0.55, gain: 0.16 } }),
  ],
};
