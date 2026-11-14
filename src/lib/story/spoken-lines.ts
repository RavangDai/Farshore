import type { VoiceId } from "../arcade/rivals.ts";
import { sentences } from "../speech/sentences.ts";
import { crossingLines } from "./crossing.ts";
import { prologue, prologueSpeech } from "./prologue.ts";

/** The line Settings plays to test the voice. */
export const TEST_LINE = "Sing to me, Muse, of the man of many ways, who wandered far.";

/** How the voice box splits a line it speaks; the server caches exactly these pieces. */
export const SPLIT = { firstMax: 70 };

/** Lines the game will certainly say, in full. */
export const fixedLines: { text: string; voice: VoiceId }[] = [
  ...prologue.map(slide => ({ text: prologueSpeech(slide), voice: "bard" as const })),
  ...Object.values(crossingLines).map(text => ({ text, voice: "bard" as const })),
  { text: TEST_LINE, voice: "bard" },
];

/** Every piece of those lines, as the voice box will ask for them. */
export const fixedPieces = fixedLines.flatMap(line => sentences(line.text, SPLIT).map(text => ({ text, voice: line.voice })));

const known = new Set(fixedPieces.map(p => `${p.voice}|${p.text}`));
/** True for a piece of a fixed line, which the server may keep on disk. */
export const isFixedPiece = (text: string, voice: string) => known.has(`${voice}|${text}`);
