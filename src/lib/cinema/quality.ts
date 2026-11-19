// Graphics quality for the cinematic backdrops. Kept in its own local key
// (not the synced preferences schema) because it describes this device, not
// the player: the same account on a phone and a desktop wants different tiers.

export type Quality = "cinematic" | "balanced" | "lite";
export type QualityChoice = Quality | "auto";
export const QUALITY_KEY = "farshore-graphics-v1";

export const QUALITY_LABELS: Record<QualityChoice, string> = { auto: "Automatic", cinematic: "Cinematic", balanced: "Balanced", lite: "Lite (painted)" };

export function readQualityChoice(): QualityChoice {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === "cinematic" || v === "balanced" || v === "lite" ? v : "auto";
  } catch { return "auto"; }
}
export function writeQualityChoice(choice: QualityChoice) {
  try { if (choice === "auto") localStorage.removeItem(QUALITY_KEY); else localStorage.setItem(QUALITY_KEY, choice); } catch { /* Storage is optional. */ }
}

let webgl: boolean | null = null;
/** Whether this browser can create a WebGL2 context at all. Checked once. */
export function hasWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    webgl = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { webgl = false; }
  return webgl;
}

/** The tier this device gets when the player has not chosen one. */
export function detectQuality(): Quality {
  if (!hasWebGL()) return "lite";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4, memory = nav.deviceMemory ?? 8;
  const phone = window.matchMedia?.("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) < 600;
  if (phone || cores <= 2 || memory <= 2) return "balanced";
  return cores >= 6 && memory >= 4 ? "cinematic" : "balanced";
}

export function resolveQuality(choice: QualityChoice): Quality {
  if (choice === "auto") return detectQuality();
  if (choice !== "lite" && !hasWebGL()) return "lite";
  return choice;
}

/** Device pixel ratio cap and particle share for each tier. */
export const QUALITY_BUDGET: Record<Exclude<Quality, "lite">, { dpr: [number, number]; particles: number; segments: number; antialias: boolean }> = {
  cinematic: { dpr: [1, 1.75], particles: 1, segments: 1, antialias: true },
  balanced: { dpr: [0.85, 1.15], particles: 0.55, segments: 0.6, antialias: false },
};
