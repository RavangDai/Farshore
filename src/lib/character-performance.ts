export type CaptainEmotion = "thoughtful" | "defiant" | "confident" | "resolute" | "homesick" | "wary" | "curious" | "hopeful";

/** Authored character acting, based on the scene and his decision, not the player's voice. */
export function captainEmotion(scene: string, decision?: { followed: boolean; safeChoice: boolean }, busy = false): CaptainEmotion {
  if (busy) return "thoughtful";
  if (decision) {
    if (!decision.followed) return "defiant";
    if (!decision.safeChoice) return "confident";
    return scene === "scylla" || scene === "underworld" ? "wary" : "resolute";
  }
  if (["circe", "calypso"].includes(scene)) return "homesick";
  if (["cicones", "laestrygonians", "cyclops", "underworld", "scylla", "cattle"].includes(scene)) return "wary";
  if (["nausicaa", "phaeacians", "ithaca", "reunion"].includes(scene)) return "hopeful";
  return "curious";
}

export const emotionDirection: Record<CaptainEmotion, string> = {
  thoughtful: "Weighing your words",
  defiant: "His pride rises",
  confident: "Ready to take the risk",
  resolute: "Steady. Homeward.",
  homesick: "His thoughts turn to home",
  wary: "Unease beneath his courage",
  curious: "Drawn to the unknown",
  hopeful: "Home feels a little closer",
};
