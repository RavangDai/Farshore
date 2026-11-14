import type { TrialId } from "./arcade.ts";
import type { Space } from "../audio/dsp.ts";

// Who speaks during an encounter. The model writes the words; the game decides
// who is speaking, when, and from which facts. Voices are presentation only.
export type Speaker = "bard" | "rival";
export type VoiceId = "bard" | "odysseus" | "athena" | TrialId;

/** How a neural line is placed in the scene once it reaches the browser. */
export type VoiceFx = {
  /** Low shelf at 160 Hz, in dB: weight for giants and gods. */
  low?: number;
  /** Peak at 2.5 kHz, in dB: below 0 takes the edge off a huge voice. */
  presence?: number;
  /** High shelf at 3.8 kHz, in dB: air for spirits and winds. */
  high?: number;
  space: Space;
  /** Reverb send, 0 to 0.3. */
  wet: number;
  /** Two slowly drifting copies a few milliseconds behind: a chorus of Sirens, a second head. */
  chorus?: { delayMs: number; depthMs: number; gain: number };
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

/**
 * Kokoro's own quality grades for its English speakers (from the model card).
 * Every character uses a voice graded C or better.
 */
export const KOKORO_GRADES: Record<string, string> = {
  af_heart: "A", af_bella: "A-", af_nicole: "B-", bf_emma: "B-", af_aoede: "C+", af_kore: "C+", af_sarah: "C+",
  am_fenrir: "C+", am_michael: "C+", am_puck: "C+", bm_george: "C", bm_fable: "C", bf_isabella: "C", af_nova: "C", af_alloy: "C",
  bm_lewis: "D+", am_echo: "D", am_eric: "D", am_liam: "D", am_onyx: "D", bm_daniel: "D", bf_alice: "D", bf_lily: "D", af_jessica: "D", af_river: "D", af_sky: "C-", am_santa: "D-", am_adam: "F+",
};

// Each encounter only pairs the bard with its own rival, so a strong voice can
// serve two rivals. Every line plays at its natural rate: big voices get their
// weight from EQ and a slower Kokoro speed, never from a pitch shift.
export const voices: Record<VoiceId, VoiceProfile> = {
  bard: { name: "The Bard", kokoro: "bm_george", speed: 0.95, browser: { pitch: 0.95, rate: 0.95 }, fx: { space: "hall", wet: 0.1, low: 1.5 } },
  odysseus: { name: "Odysseus", kokoro: "am_michael", speed: 0.95, browser: { pitch: 0.95, rate: 0.95 }, fx: { space: "hall", wet: 0.08 } },
  // Athena counsels Odysseus in his own hall; Aoede is named for a Muse.
  athena: { name: "Athena", kokoro: "af_aoede", speed: 0.95, browser: { pitch: 1.02, rate: 0.95 }, fx: { space: "hall", wet: 0.16, high: 1.5 } },
  lotus: { name: "Lotus Guardians", kokoro: "af_heart", speed: 0.9, browser: { pitch: 1.05, rate: 0.9 }, fx: { space: "ethereal", wet: 0.24, high: 2 } },
  cyclops: { name: "Polyphemus", kokoro: "am_fenrir", speed: 0.88, browser: { pitch: 0.85, rate: 0.9 }, fx: { low: 4, presence: -2, space: "cave", wet: 0.24 } },
  aeolus: { name: "The Unbound Winds", kokoro: "am_puck", speed: 1.05, browser: { pitch: 1, rate: 1.05 }, fx: { space: "ethereal", wet: 0.2, high: 3 } },
  circe: { name: "Circe", kokoro: "bf_emma", speed: 0.95, browser: { pitch: 1, rate: 0.95 }, fx: { space: "hall", wet: 0.15 } },
  sirens: { name: "The Sirens", kokoro: "af_bella", speed: 0.88, browser: { pitch: 1.1, rate: 0.88 }, fx: { space: "ethereal", wet: 0.26, high: 1, chorus: { delayMs: 14, depthMs: 2, gain: 0.35 } } },
  scylla: { name: "Scylla & Charybdis", kokoro: "am_michael", speed: 0.92, browser: { pitch: 0.88, rate: 0.92 }, fx: { low: 3, presence: -1, space: "sea", wet: 0.2, chorus: { delayMs: 21, depthMs: 3, gain: 0.3 } } },
  calypso: { name: "Poseidon's Storm", kokoro: "am_fenrir", speed: 0.9, browser: { pitch: 0.88, rate: 0.9 }, fx: { low: 4, presence: -1.5, space: "storm", wet: 0.24 } },
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
