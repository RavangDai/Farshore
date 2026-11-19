// The FARSHORE audio asset pack (docs/ai-eval/Farshore-Audio-Assets), as the
// game uses it: one music loop and one ambience loop per place, the voice lines
// with their speakers and subtitles, and the sampled effects. The files are
// mastered into public/audio/farshore by scripts/audio/master_audio.py;
// tests/audio-library.test.mjs keeps this registry in step with the pack's
// audio-manifest.json.

import type { TrialId } from "../arcade/arcade.ts";
import type { VoiceId } from "../arcade/rivals.ts";

export const AUDIO_ROOT = "/audio/farshore";

/** The places with their own music and ambience. */
export type AudioPlace = "home" | "voyage-map" | "lotus-eaters" | "cyclops-cave" | "aeolus" | "circes-palace" | "sirens-passage" | "scylla-charybdis" | "calypsos-raft" | "ithaca";

export const TRIAL_PLACE: Record<TrialId, AudioPlace> = {
  lotus: "lotus-eaters", cyclops: "cyclops-cave", aeolus: "aeolus", circe: "circes-palace",
  sirens: "sirens-passage", scylla: "scylla-charybdis", calypso: "calypsos-raft", bow: "ithaca",
};

export const PLACES: Record<AudioPlace, { name: string; narration: LineId | null }> = {
  home: { name: "The Long Way Home", narration: "intro" },
  "voyage-map": { name: "Aegean Atlas", narration: null },
  "lotus-eaters": { name: "Lotus-Eaters", narration: "lotus-eaters" },
  "cyclops-cave": { name: "Cyclops' Cave", narration: "cyclops-cave" },
  aeolus: { name: "Aeolus", narration: "aeolus" },
  "circes-palace": { name: "Circe's Palace", narration: "circes-palace" },
  "sirens-passage": { name: "Sirens' Passage", narration: "sirens-passage" },
  "scylla-charybdis": { name: "Scylla & Charybdis", narration: "scylla-charybdis" },
  "calypsos-raft": { name: "Calypso's Raft", narration: "calypsos-raft" },
  ithaca: { name: "Ithaca", narration: "ithaca" },
};

/**
 * narration: the bard's chapter lines (once per voyage, never on a revisit).
 * character: a rival or Odysseus, tied to a real moment in play.
 * oracle: the Oracle's announcements, each tied to a real model or game state.
 */
export type LineKind = "narration" | "character" | "oracle";
export type LineId =
  | "intro" | "lotus-eaters" | "cyclops-cave" | "aeolus" | "circes-palace" | "sirens-passage" | "scylla-charybdis" | "calypsos-raft" | "ithaca"
  | "oracle-ready" | "oracle-path" | "oracle-rival-lead" | "oracle-player-lead" | "oracle-unavailable"
  | "sailor-rescued" | "cyclops-approach" | "circe-challenge" | "sirens-warning"
  | "victory" | "defeat" | "homecoming";

export type VoiceLine = { role: string; voice: VoiceId; kind: LineKind; subtitle: string };

const narrator = (subtitle: string): VoiceLine => ({ role: "Narrator", voice: "bard", kind: "narration", subtitle });
const oracle = (subtitle: string): VoiceLine => ({ role: "Oracle", voice: "oracle", kind: "oracle", subtitle });

export const LINES: Record<LineId, VoiceLine> = {
  intro: narrator("The war is over. But the gods are not finished with you. Eight trials stand between you and Ithaca. The sea remembers. The gods are watching. Your journey home begins now."),
  "lotus-eaters": narrator("Beware the sweetness of forgetting. The lotus has stolen your sailors' memories. Bring your crew home before the island claims them."),
  "cyclops-cave": narrator("Within the darkness, a single eye awaits. The cave is not your home. Run, and find the light beyond the mountain."),
  aeolus: narrator("The lord of winds has granted you a chance. Read the changing currents, master the storm, and guide your ship onward."),
  "circes-palace": narrator("Not every enchantment can be broken by strength. In Circe's palace, wisdom may be your only way through."),
  "sirens-passage": narrator("Listen carefully, but do not surrender. The most beautiful song upon these waters may be your last."),
  "scylla-charybdis": narrator("Between two terrors lies a narrow passage. Steady your vessel. Every choice you make will carry you closer to the far shore."),
  "calypsos-raft": narrator("Calypso's island can offer peace, but your journey is not yet ended. Freedom lies beyond the breaking waves."),
  ithaca: narrator("After all these years, the shores of Ithaca rise before you. One final trial remains. Claim the home you have longed for."),
  "oracle-ready": oracle("The Oracle is ready. The rival awaits your challenge."),
  "oracle-path": oracle("The rival has chosen a path. Your next move may change everything."),
  "oracle-rival-lead": oracle("Your rival is gaining ground. Stay focused."),
  "oracle-player-lead": oracle("You are ahead. Maintain your course."),
  "oracle-unavailable": oracle("The Oracle is silent. You may continue without its guidance."),
  "sailor-rescued": { role: "Odysseus", voice: "odysseus", kind: "character", subtitle: "One more sailor safely home. Keep moving." },
  "cyclops-approach": { role: "Cyclops", voice: "cyclops", kind: "character", subtitle: "You tread upon the stones of my cave." },
  "circe-challenge": { role: "Circe", voice: "circe", kind: "character", subtitle: "Come, wanderer. Let us see how well you understand enchantment." },
  "sirens-warning": { role: "Siren", voice: "sirens", kind: "character", subtitle: "Come closer, traveler. The sea has such sweet secrets." },
  victory: narrator("Another trial is behind you. The gods have witnessed your resolve. Continue your voyage."),
  defeat: narrator("The sea has turned against you. Yet your story is not over. Rise, and try again."),
  homecoming: narrator("The long voyage has ended. The seas, the gods, the monsters, and the trials could not keep you from Ithaca. Welcome home, Odysseus."),
};

/** The pack's sampled effects. `bus` is the mixer channel each one plays on. */
export type SampleName =
  | "ui-hover" | "ui-select" | "ui-back" | "glass-open" | "glass-close" | "checkpoint-complete" | "checkpoint-locked"
  | "oracle-activate" | "oracle-thinking" | "countdown" | "trial-start" | "victory" | "defeat" | "pickup" | "sailor-rescue"
  | "damage" | "warning" | "footstep-stone" | "footstep-grass" | "gate-open" | "cave-impact" | "cyclops-growl" | "boulder-rumble"
  | "wind-gust" | "sail-flap" | "potion-mix" | "magic-pulse" | "siren-note" | "maelstrom-surge" | "sea-monster-roar"
  | "raft-creak" | "water-splash" | "bow-twang" | "target-hit";

export type Bus = "music" | "ambience" | "voice" | "sfx" | "ui";

export const SAMPLES: Record<SampleName, { bus: Bus; gain: number }> = {
  "ui-hover": { bus: "ui", gain: 0.32 }, "ui-select": { bus: "ui", gain: 0.6 }, "ui-back": { bus: "ui", gain: 0.55 },
  "glass-open": { bus: "ui", gain: 0.5 }, "glass-close": { bus: "ui", gain: 0.45 },
  "checkpoint-complete": { bus: "ui", gain: 0.8 }, "checkpoint-locked": { bus: "ui", gain: 0.6 },
  "oracle-activate": { bus: "ui", gain: 0.65 }, "oracle-thinking": { bus: "ui", gain: 0.4 },
  countdown: { bus: "sfx", gain: 0.7 }, "trial-start": { bus: "sfx", gain: 0.75 },
  // The two stingers are music: they sit on the music bus and the score makes room for them.
  victory: { bus: "music", gain: 1 }, defeat: { bus: "music", gain: 1 },
  pickup: { bus: "sfx", gain: 0.7 }, "sailor-rescue": { bus: "sfx", gain: 0.8 }, damage: { bus: "sfx", gain: 0.7 }, warning: { bus: "sfx", gain: 0.6 },
  "footstep-stone": { bus: "sfx", gain: 0.5 }, "footstep-grass": { bus: "sfx", gain: 0.5 }, "gate-open": { bus: "sfx", gain: 0.8 },
  "cave-impact": { bus: "sfx", gain: 0.7 }, "cyclops-growl": { bus: "sfx", gain: 0.7 }, "boulder-rumble": { bus: "sfx", gain: 0.7 },
  "wind-gust": { bus: "sfx", gain: 0.6 }, "sail-flap": { bus: "sfx", gain: 0.6 }, "potion-mix": { bus: "sfx", gain: 0.6 },
  "magic-pulse": { bus: "sfx", gain: 0.6 }, "siren-note": { bus: "sfx", gain: 0.6 }, "maelstrom-surge": { bus: "sfx", gain: 0.7 },
  "sea-monster-roar": { bus: "sfx", gain: 0.7 }, "raft-creak": { bus: "sfx", gain: 0.6 }, "water-splash": { bus: "sfx", gain: 0.6 },
  "bow-twang": { bus: "sfx", gain: 0.6 }, "target-hit": { bus: "sfx", gain: 0.7 },
};

/** Sampled effects every screen may need, fetched as soon as audio is unlocked; the rest load with their place. */
export const UI_SAMPLES: SampleName[] = ["ui-hover", "ui-select", "ui-back", "glass-open", "glass-close", "checkpoint-complete", "checkpoint-locked", "oracle-activate", "oracle-thinking", "trial-start", "victory", "defeat"];

/** OGG Vorbis where the browser decodes it (smaller), MP3 elsewhere (Safari). */
export type AudioFormat = "ogg" | "mp3";
export function pickFormat(canPlay: (type: string) => string): AudioFormat {
  return canPlay('audio/ogg; codecs="vorbis"') ? "ogg" : "mp3";
}

export const musicUrl = (place: AudioPlace, format: AudioFormat) => `${AUDIO_ROOT}/music/${place}.${format}`;
export const ambienceUrl = (place: AudioPlace, format: AudioFormat) => `${AUDIO_ROOT}/ambience/${place}.${format}`;
export const lineUrl = (line: LineId, format: AudioFormat) => `${AUDIO_ROOT}/voice/${line}.${format}`;
export const sampleUrl = (name: SampleName, format: AudioFormat) => `${AUDIO_ROOT}/sfx/${name}.${format}`;
