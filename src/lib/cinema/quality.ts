// How much atmosphere the menus draw over the painted environments. Kept in
// its own local key (not the synced preferences schema) because it describes
// this device, not the player: the same account on a phone and a desktop wants
// different tiers. The paintings themselves are identical on every tier.

export type Quality = "cinematic" | "balanced" | "lite";
export type QualityChoice = Quality | "auto";
export const QUALITY_KEY = "farshore-graphics-v1";

export const QUALITY_LABELS: Record<QualityChoice, string> = { auto: "Automatic", cinematic: "Cinematic", balanced: "Balanced", lite: "Lite (still art)" };

export function readQualityChoice(): QualityChoice {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === "cinematic" || v === "balanced" || v === "lite" ? v : "auto";
  } catch { return "auto"; }
}
export function writeQualityChoice(choice: QualityChoice) {
  try { if (choice === "auto") localStorage.removeItem(QUALITY_KEY); else localStorage.setItem(QUALITY_KEY, choice); } catch { /* Storage is optional. */ }
}

/** The tier this device gets when the player has not chosen one. */
export function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4, memory = nav.deviceMemory ?? 8;
  const phone = window.matchMedia?.("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) < 600;
  if (cores <= 2 || memory <= 1) return "lite";
  return phone || cores < 6 || memory < 4 ? "balanced" : "cinematic";
}

export function resolveQuality(choice: QualityChoice): Quality {
  return choice === "auto" ? detectQuality() : choice;
}

/**
 * What each tier draws: the share of particles, the effects canvas's pixel
 * ratio cap, and whether the camera drifts and follows the pointer. Lite is
 * the lightweight fallback: the still painting and nothing over it.
 */
export const QUALITY_BUDGET: Record<Quality, { particles: number; dpr: number; drift: boolean }> = {
  cinematic: { particles: 1, dpr: 1.5, drift: true },
  balanced: { particles: 0.5, dpr: 1, drift: true },
  lite: { particles: 0, dpr: 1, drift: false },
};
