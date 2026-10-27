import type { TrialId } from "./arcade.ts";

// Who speaks during an encounter. The model writes the words; the game decides
// who is speaking, when, and from which facts. Voices are presentation only.
export type Speaker = "bard" | "rival";
export type VoiceId = "bard" | TrialId;
export type VoiceProfile = {
  /** Kokoro voice used when a neural voice server is configured. */
  kokoro: string;
  /** Browser speech fallback shaping. */
  pitch: number;
  rate: number;
  /** Prefer a female browser voice when one is installed. */
  female?: boolean;
  name: string;
};

export const voices: Record<VoiceId, VoiceProfile> = {
  bard: { kokoro: "bm_george", pitch: 0.92, rate: 0.96, name: "The Bard" },
  lotus: { kokoro: "af_sky", pitch: 1.18, rate: 0.86, female: true, name: "Lotus Guardians" },
  cyclops: { kokoro: "am_onyx", pitch: 0.45, rate: 0.84, name: "Polyphemus" },
  aeolus: { kokoro: "am_fenrir", pitch: 0.82, rate: 1.04, name: "The Unbound Winds" },
  circe: { kokoro: "bf_isabella", pitch: 1.04, rate: 0.94, female: true, name: "Circe" },
  sirens: { kokoro: "af_nicole", pitch: 1.24, rate: 0.82, female: true, name: "The Sirens" },
  scylla: { kokoro: "am_fenrir", pitch: 0.58, rate: 0.9, name: "Scylla & Charybdis" },
  calypso: { kokoro: "bm_lewis", pitch: 0.62, rate: 0.9, name: "Poseidon's Storm" },
  bow: { kokoro: "am_puck", pitch: 1.02, rate: 1.08, name: "Antinous" },
};

export const kokoroVoices = new Set(Object.values(voices).map(v => v.kokoro));

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
