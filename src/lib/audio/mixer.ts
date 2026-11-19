// The parts of the audio mix this device remembers. Music and effects volumes
// and the mute switch stay in the synced preferences (they follow the player's
// account); the voice volume stays in the voice preferences. These describe
// the room the player is in, so they are kept locally.

export const MIXER_KEY = "farshore-mixer-v1";

export type MixerPrefs = {
  master: number;
  ambience: number;
  /** Interface sounds: hover, selection, glass panels. */
  ui: number;
  /** The bard's chapter narration (once per voyage). */
  narration: boolean;
  /** Subtitles for narration, character lines and the Oracle. */
  subtitles: boolean;
};

export const defaultMixer: MixerPrefs = { master: 0.85, ambience: 0.7, ui: 0.6, narration: true, subtitles: true };

const level = (v: unknown, fallback: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : fallback);

export function readMixer(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): MixerPrefs {
  try {
    const v = JSON.parse(storage?.getItem(MIXER_KEY) || "null");
    if (v && typeof v === "object") return {
      master: level(v.master, defaultMixer.master),
      ambience: level(v.ambience, defaultMixer.ambience),
      ui: level(v.ui, defaultMixer.ui),
      narration: typeof v.narration === "boolean" ? v.narration : defaultMixer.narration,
      subtitles: typeof v.subtitles === "boolean" ? v.subtitles : defaultMixer.subtitles,
    };
  } catch { /* Storage is optional. */ }
  return { ...defaultMixer };
}

export function writeMixer(prefs: MixerPrefs, storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
  try { storage?.setItem(MIXER_KEY, JSON.stringify(prefs)); } catch { /* Storage is optional. */ }
}
