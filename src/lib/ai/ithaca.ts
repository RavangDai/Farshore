// Antinous' reading of the scoreboard in the contest of the twelve axes.
//
// His shot menu (antinous.ts) and the archery engine (encounters/mythic.ts)
// share these rules, so the menu's measurements and the engine's scoring
// cannot disagree about what a block shot costs or when he can afford one.

/** A block shot spends the arrow on position: it scores at most this many axes. */
export const BLOCK_SHOT_CAP = 6;

export type BossStrategy = "press" | "balanced" | "guard";
export type BoardRead = { strategy: BossStrategy; lead: number; note: string };

/** Ring lead past which the board is read as comfortably won or lost. */
export const BOARD_LEAD_BAND = 3;

/**
 * Antinous' running read of the contest, from the real score difference
 * alone. This is what the block-shot gate is tested against, and what the
 * inspector shows as "the boss strategy for the turn" — never a mood, only a
 * number.
 */
export function boardStrategy(score: number, rivalScore: number): BoardRead {
  const lead = rivalScore - score;
  if (lead <= -BOARD_LEAD_BAND) {
    return { strategy: "press", lead, note: `trailing by ${-lead} ring${-lead === 1 ? "" : "s"} — no margin to spend on anything but scoring` };
  }
  if (lead >= BOARD_LEAD_BAND) {
    return { strategy: "guard", lead, note: `leading by ${lead} ring${lead === 1 ? "" : "s"} — can afford to trade rings for position` };
  }
  return { strategy: "balanced", lead, note: `within ${Math.abs(lead)} ring${Math.abs(lead) === 1 ? "" : "s"} — no margin either way` };
}
