import { accentOf, isFemale, type VoiceProfile } from "../arcade/rivals.ts";

// When the neural voice is unavailable, the browser's own voices read the
// lines. Most systems install a few old robotic voices beside much better
// natural ones (Edge's "Online (Natural)" voices, Google's network voices,
// Apple's Premium voices), so the choice matters more than any pitch setting.

/** The parts of a SpeechSynthesisVoice the ranking reads. */
export type VoiceInfo = { name: string; lang: string; localService: boolean };

const FEMALE = /\b(female|woman|aria|ava|emma|jenny|michelle|ana|sonia|libby|maisie|hazel|susan|zira|samantha|karen|moira|tessa|kate|serena|victoria|fiona|catherine|natasha|clara|sara|nancy|jane|amber|ashley|cora|elizabeth|monica|heather|linda|eva|olivia|emily|zoe)\b/i;
const MALE = /\b(male|man|guy|ryan|thomas|christopher|eric|roger|steffan|andrew|brian|george|david|mark|daniel|alex|fred|james|oliver|arthur|liam|william|davis|jason|tony|noah|ethan|aaron|reed|rishi|gordon|lee)\b/i;

/** Higher is better. Non-English voices score far below any English one. */
export function scoreVoice(voice: VoiceInfo, profile: VoiceProfile) {
  const lang = voice.lang.toLowerCase().replace("_", "-");
  if (!lang.startsWith("en")) return -100;
  let score = lang === (accentOf(profile) === "gb" ? "en-gb" : "en-us") ? 30 : 15;
  if (/natural|neural/i.test(voice.name)) score += 60;
  if (/premium|enhanced/i.test(voice.name)) score += 40;
  if (/google/i.test(voice.name)) score += 30;
  if (/online/i.test(voice.name)) score += 25;
  if (!voice.localService) score += 10;
  const female = FEMALE.test(voice.name), male = MALE.test(voice.name);
  if (female !== male) score += female === isFemale(profile) ? 20 : -40;
  return score;
}

/** The best voice for a character; voices already given to someone else rank a little lower. */
export function pickBrowserVoice<T extends VoiceInfo>(available: readonly T[], profile: VoiceProfile, taken: ReadonlySet<string> = new Set()) {
  let best: T | undefined, bestScore = -Infinity;
  for (const voice of available) {
    const score = scoreVoice(voice, profile) - (taken.has(voice.name) ? 15 : 0);
    if (score > bestScore) [best, bestScore] = [voice, score];
  }
  return best;
}
