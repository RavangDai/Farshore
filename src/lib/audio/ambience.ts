import type { Space } from "./dsp.ts";
import type { SoundName } from "./sounds.ts";

// Where each encounter takes place, as sound: looping beds, occasional
// one-shots (a drip, a bird, distant thunder), and the reverb everything in
// the scene is heard through.

export type SceneName = "sea" | "calm" | "cave" | "collapse" | "daylight" | "garden" | "gale" | "hall" | "strait" | "storm";
/** Continuous sounds whose level the game sets every frame. */
export type LoopName = "giant" | "run" | "row" | "whirlpool" | "gust";
type Range = [number, number];
export type Shot = { sound: SoundName; every: Range; gain: Range; pan: Range; rate: Range };
export type Scene = {
  space: Space;
  /** `drive` scales a bed by a loop level, so the whirlpool roars with Charybdis' pull. */
  beds: { sound: SoundName; gain: number; drive?: LoopName }[];
  shots: Shot[];
};

const creaks: Shot = { sound: "creak", every: [6, 13], gain: [0.3, 0.5], pan: [-0.7, 0.7], rate: [0.85, 1.1] };

export const scenes: Record<SceneName, Scene> = {
  sea: { space: "sea", beds: [{ sound: "sea", gain: 0.8 }], shots: [{ ...creaks, every: [10, 20] }] },
  calm: { space: "sea", beds: [{ sound: "sea", gain: 0.6 }], shots: [creaks] },
  cave: {
    space: "cave",
    beds: [{ sound: "cave-air", gain: 0.8 }, { sound: "torch", gain: 0.35 }],
    shots: [{ sound: "drip", every: [0.8, 3], gain: [0.2, 0.55], pan: [-0.9, 0.9], rate: [0.8, 1.25] }],
  },
  collapse: {
    space: "cave",
    beds: [{ sound: "cave-air", gain: 0.9 }],
    shots: [
      { sound: "rumble", every: [3, 6], gain: [0.4, 0.8], pan: [-0.5, 0.5], rate: [0.85, 1.1] },
      { sound: "drip", every: [1.5, 4], gain: [0.15, 0.4], pan: [-0.9, 0.9], rate: [0.8, 1.2] },
    ],
  },
  daylight: { space: "sea", beds: [{ sound: "wind", gain: 0.45 }, { sound: "sea", gain: 0.5 }], shots: [] },
  garden: { space: "sea", beds: [{ sound: "garden-air", gain: 0.9 }], shots: [{ sound: "bird", every: [2.5, 7], gain: [0.3, 0.7], pan: [-0.9, 0.9], rate: [0.9, 1.15] }] },
  gale: { space: "sea", beds: [{ sound: "wind", gain: 0.7, drive: "gust" }, { sound: "sea", gain: 0.6 }], shots: [{ ...creaks, every: [4, 9] }] },
  hall: { space: "hall", beds: [{ sound: "hall-air", gain: 0.7 }, { sound: "torch", gain: 0.5 }], shots: [] },
  strait: { space: "sea", beds: [{ sound: "sea", gain: 0.8 }, { sound: "whirlpool", gain: 0.7, drive: "whirlpool" }], shots: [{ ...creaks, every: [5, 10] }] },
  storm: {
    space: "storm",
    beds: [{ sound: "rain", gain: 0.8 }, { sound: "wind", gain: 0.55 }],
    shots: [{ sound: "distant-thunder", every: [7, 15], gain: [0.4, 0.8], pan: [-0.7, 0.7], rate: [0.85, 1.1] }],
  },
};
