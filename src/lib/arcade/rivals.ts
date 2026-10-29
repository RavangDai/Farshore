import type { TrialId } from "./arcade.ts";
import type { Space } from "../audio/dsp.ts";

// Who speaks during an encounter. The model writes the words; the game decides
// who is speaking, when, and from which facts. Voices are presentation only.
export type Speaker = "bard" | "rival";
export type VoiceId = "bard" | "odysseus" | TrialId;

/** How a neural line is placed in the scene once it reaches the browser. */
export type VoiceFx = {
  /** Playback rate; below 1 lowers the voice, for giants and gods. */
  pitch?: number;
  /** Low- and high-shelf gain in dB. */
  low?: number;
  high?: number;
  space: Space;
  /** Reverb send, 0 to 0.5. */
  wet: number;
  /** A second, offset copy of the line: a chorus of Sirens, a second head. */
  double?: { rate: number; delayMs: number; gain: number };
};

export type VoiceProfile = {
  name: string;
  /**
   * Kokoro-82M voice. The prefix carries the accent and gender: "bm_" is a
   * British man, "af_" an American woman.
   */
  kokoro: string;
  /** Kokoro speaking speed. */
  speed: number;
  /** Browser speech fallback. Kept near 1: large pitch shifts are what make it sound robotic. */
  browser: { pitch: number; rate: number };
  fx: VoiceFx;
};

// Voices are chosen from Kokoro's best-graded speakers; each encounter only
// pairs the bard with its own rival, so a strong voice can serve two rivals.
export const voices: Record<VoiceId, VoiceProfile> = {
  bard: { name: "The Bard", kokoro: "bm_george", speed: 0.95, browser: { pitch: 0.95, rate: 0.95 }, fx: { space: "hall", wet: 0.12, low: 1.5 } },
  odysseus: { name: "Odysseus", kokoro: "am_michael", speed: 0.95, browser: { pitch: 0.95, rate: 0.95 }, fx: { space: "hall", wet: 0.08 } },
  lotus: { name: "Lotus Guardians", kokoro: "af_heart", speed: 0.9, browser: { pitch: 1.05, rate: 0.9 }, fx: { space: "ethereal", wet: 0.28, high: 2 } },
  cyclops: { name: "Polyphemus", kokoro: "am_fenrir", speed: 0.95, browser: { pitch: 0.85, rate: 0.9 }, fx: { pitch: 0.88, low: 5, space: "cave", wet: 0.3 } },
  aeolus: { name: "The Unbound Winds", kokoro: "am_puck", speed: 1.05, browser: { pitch: 1, rate: 1.05 }, fx: { space: "ethereal", wet: 0.22, high: 3 } },
  circe: { name: "Circe", kokoro: "bf_emma", speed: 0.95, browser: { pitch: 1, rate: 0.95 }, fx: { space: "hall", wet: 0.18 } },
  sirens: { name: "The Sirens", kokoro: "af_bella", speed: 0.88, browser: { pitch: 1.1, rate: 0.88 }, fx: { space: "ethereal", wet: 0.38, double: { rate: 1.012, delayMs: 23, gain: 0.55 } } },
  scylla: { name: "Scylla & Charybdis", kokoro: "am_michael", speed: 0.95, browser: { pitch: 0.88, rate: 0.92 }, fx: { pitch: 0.94, low: 3, space: "sea", wet: 0.22, double: { rate: 0.92, delayMs: 31, gain: 0.5 } } },
  calypso: { name: "Poseidon's Storm", kokoro: "bm_lewis", speed: 0.92, browser: { pitch: 0.88, rate: 0.9 }, fx: { pitch: 0.93, low: 4, space: "storm", wet: 0.3 } },
  bow: { name: "Antinous", kokoro: "bm_fable", speed: 1.03, browser: { pitch: 1, rate: 1.05 }, fx: { space: "hall", wet: 0.1 } },
};

export const accentOf = (profile: VoiceProfile): "gb" | "us" => (profile.kokoro.startsWith("b") ? "gb" : "us");
export const isFemale = (profile: VoiceProfile) => profile.kokoro[1] === "f";

/** Character notes the model writes from. Kept short so small models stay in voice. */
export const personas: Record<TrialId, string> = {
  lotus: "the Lotus Guardians, drowsy bark-skinned keepers of a flower garden who speak softly and invite sailors to forget home",
  cyclops: "Polyphemus, the blinded one-eyed giant, furious, booming, mocking 'Nobody', proud of his strength",
  aeolus: "the unbound winds of Aeolus, restless and playful, boasting about storms and the bag Odysseus' crew opened",
  circe: "Circe, the elegant, amused sorceress of Aeaea who turns men to swine and enjoys a duel of potions",
  sirens: "the Sirens, a chorus of sweet, dangerous voices promising forbidden knowledge to whoever stops rowing",
  scylla: "Scylla and Charybdis, a six-headed cliff monster and a hungry whirlpool speaking as one hissing voice",
  calypso: "Poseidon's storm, the sea god's wrath, thunderous and vengeful toward the raft",
  bow: "Antinous, the arrogant leader of the suitors in Odysseus' hall, sneering at the old beggar",
};
