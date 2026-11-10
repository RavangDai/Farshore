// Athena's counsel in the hall: a player-facing helper built on the same rule
// as the rival. The game gathers the facts about the shot in hand, already cut
// to the precision the difficulty allows; a pretrained model may only answer
// from them, and must name which ones it used. Those names become the chips
// under her answer, so the player can see what the advice rests on.

import type { BowState } from "../encounters/mythic.ts";
import { ATHENA_COUNSEL, BOW, draughtAllowance, shotAdvice } from "../encounters/mythic.ts";
import { cleanText } from "../arcade/decisions.ts";
import type { Facts } from "../arcade/decisions.ts";
import { tierOf } from "./types.ts";

/** Questions per contest (counted by the engine). Counsel is a help, not a crutch, and it costs no medal. */
export { ATHENA_COUNSEL };
export const QUESTION_MAX = 240;

/** What Athena may draw on for this shot. Keys are what the chips display. */
export function athenaFacts(s: BowState): Facts {
  const tier = tierOf(s.difficulty);
  const allowance = draughtAllowance(s.wind, s.difficulty);
  const side = s.wind > 0 ? "right" : "left", into = s.wind > 0 ? "left" : "right";
  const facts: Facts = {};
  facts.draught = !s.wind ? "still" : `blowing ${side}, ${Math.abs(s.wind) >= [16, 32, 44][tier] ? "strong" : "light"}`;
  // Easy hears how far to allow; Medium a size in words; Hard only the side.
  facts.allowance = !s.wind
    ? "no sideways allowance; aim a touch high for the drop"
    : tier === 0
      ? `aim ${allowance.words} ${into} of the line, and a touch high`
      : tier === 1
        ? `aim ${allowance.size === "more" ? "well" : allowance.size === "touch" ? "a little" : "some way"} ${into}, into the draught`
        : `aim into the draught, to the ${into}`;
  const last = s.lastShot;
  facts["last arrow"] = last ? `${last.rings} of ${BOW.axes} axes` : "none yet";
  if (last && last.rings < BOW.axes) facts["last correction"] = shotAdvice(last).replace(/^Through \d+ of 12\. /, "");
  facts["narrowed axe"] = s.blocked ? `axe ${s.blocked}, by Antinous' arrow` : "none";
  facts.draw = `below ${Math.round(BOW.minDraw * 100)}% the string lets down; a full draw flies flattest`;
  facts.hold = `a full draw is steady for ${BOW.steadyMs / 1000} s, then the sight trembles`;
  facts.score = `Odysseus ${s.score}, Antinous ${s.rivalScore}`;
  facts.arrow = `${s.turn} of ${s.practice ? 1 : BOW.turns}`;
  return facts;
}

export type AthenaRequest = { trialId: "bow"; difficulty: BowState["difficulty"]; question: string; facts: Facts };
export type AthenaAnswer = { answer: string; usedFacts: string[]; model?: string };

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** Ask Athena. Resolves to her answer, or rejects with a message the panel can show. */
export async function askAthena(body: AthenaRequest, signal?: AbortSignal, fetcher: Fetcher = (input, init) => fetch(input, init)): Promise<AthenaAnswer> {
  const response = await fetcher("/api/athena", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<AthenaAnswer> & { error?: string };
  if (!response.ok || typeof data.answer !== "string") throw new Error(typeof data.error === "string" ? data.error : "Athena could not answer. Try again.");
  const keys = Object.keys(body.facts);
  return {
    answer: cleanText(data.answer, 280),
    usedFacts: Array.isArray(data.usedFacts) ? data.usedFacts.filter((k): k is string => typeof k === "string" && keys.includes(k)) : [],
    ...(typeof data.model === "string" ? { model: data.model } : {}),
  };
}
