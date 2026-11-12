import type { Difficulty, OpponentPlan } from "../arcade/arcade.ts";
import { newAdventure, lotusMoveInPlace, lotusTickInPlace, type LotusLayout, type LotusState } from "./odyssey-games.ts";
import { MOVE_TICKS, TICK_MS, applyAgentAction } from "../ai/lotus-agent.ts";

/**
 * The Lotus-Eaters Rescue Race: you and a trained rival rescue the crew from
 * two copies of the same garden, side by side.
 *
 * Each board is a full, independent Lotus state: its own guardians chase only
 * its own Odysseus, and a pickup, collision or rescue on one board never
 * touches the other. Both boards advance on one shared clock in fixed 10 ms
 * ticks, so they have the same movement cadence, guardian rhythm and time
 * limit. The rival chooses once per movement opportunity (every MOVE_TICKS);
 * the clock waits for its choice rather than letting either board run ahead.
 *
 * Standings: the first to bring all three sailors aboard wins; finishing on
 * the same tick is a draw. If the time runs out (or both are caught three
 * times), more sailors aboard wins; an equal positive count goes to whoever
 * reached it first, and an equal count reached on the same tick, or none at
 * all, is a draw. Relics score points on each board but play no part here.
 */

export type RaceSide = "human" | "ai";
export type SideSummary = {
  rescued: number;
  /** When the side brought its last sailor aboard (all three), in race milliseconds. */
  finishMs: number | null;
  /** When the side reached its final count, in race milliseconds. */
  reachedMs: number | null;
  damage: number;
  relics: number;
  /** Caught three times: the board stopped early. */
  out: boolean;
};
export type RaceResult = {
  winner: RaceSide | "draw";
  reason: "finished" | "timeout" | "decided";
  ms: number;
  human: SideSummary;
  ai: SideSummary;
};
export type LotusRace = {
  tick: number;
  layout: LotusLayout;
  human: LotusState;
  ai: LotusState;
  /** The tick at which the rival chooses its next action. */
  aiNextDecision: number;
  aiLastAction: number | null;
  aiDecisions: number;
  /** The tick on which each sailor came aboard, per side. */
  rescueTicks: Record<RaceSide, number[]>;
  result: RaceResult | null;
};

export function newRace(layout: LotusLayout, difficulty: Difficulty, plan: OpponentPlan): LotusRace {
  const board = () => newAdventure("lotus", difficulty, plan, false, 4200, { layout }) as LotusState;
  return { tick: 0, layout, human: board(), ai: board(), aiNextDecision: 0, aiLastAction: null, aiDecisions: 0, rescueTicks: { human: [], ai: [] }, result: null };
}

/** Whether the rival must choose before the clock can move on. */
export const aiAwaitingDecision = (r: LotusRace) => !r.result && !r.ai.done && r.tick >= r.aiNextDecision;

const outOf = (s: LotusState) => s.done && !s.won && s.hits >= 3;

function summary(r: LotusRace, side: RaceSide): SideSummary {
  const s = r[side], ticks = r.rescueTicks[side];
  const at = (tick: number | undefined) => (tick === undefined ? null : (tick + 1) * TICK_MS);
  return { rescued: s.rescued, finishMs: s.rescued >= 3 ? at(ticks[2]) : null, reachedMs: s.rescued > 0 ? at(ticks[s.rescued - 1]) : null, damage: s.damageTaken, relics: s.relicsFound, out: outOf(s) };
}

/** Compares the standings as they are now: more sailors, then whoever reached that count first. */
export function compareStandings(r: LotusRace): RaceSide | "draw" {
  const h = r.human.rescued, a = r.ai.rescued;
  if (h !== a) return h > a ? "human" : "ai";
  if (h === 0) return "draw";
  const th = r.rescueTicks.human[h - 1], ta = r.rescueTicks.ai[a - 1];
  return th === ta ? "draw" : th < ta ? "human" : "ai";
}

function finish(r: LotusRace, winner: RaceSide | "draw", reason: RaceResult["reason"]) {
  r.result = { winner, reason, ms: r.tick * TICK_MS, human: summary(r, "human"), ai: summary(r, "ai") };
}

/**
 * Advances the race by one tick, in place. `humanMove` is the direction held
 * this tick, if any; it only moves Odysseus when his move is ready, exactly as
 * in solo play. `aiAction` must be given whenever `aiAwaitingDecision` is
 * true; the caller waits for the model rather than skipping its turn.
 */
export function raceTick(r: LotusRace, humanMove: { dx: number; dy: number } | null, aiAction: number | null) {
  if (r.result) return;
  if (aiAwaitingDecision(r) && aiAction === null) throw new Error("The rival has not chosen its move for this tick.");
  // Counted before anyone moves: a sailor comes aboard on the step into the ship.
  const before = { human: r.human.rescued, ai: r.ai.rescued };
  if (aiAwaitingDecision(r)) {
    applyAgentAction(r.ai, aiAction!);
    r.aiLastAction = aiAction;
    r.aiDecisions++;
    r.aiNextDecision = r.tick + MOVE_TICKS;
  }
  if (humanMove && !r.human.done) lotusMoveInPlace(r.human, humanMove.dx, humanMove.dy);
  lotusTickInPlace(r.human, TICK_MS);
  lotusTickInPlace(r.ai, TICK_MS);
  for (const side of ["human", "ai"] as const) for (let k = before[side]; k < r[side].rescued; k++) r.rescueTicks[side].push(r.tick);
  const all = { human: r.human.rescued >= 3, ai: r.ai.rescued >= 3 };
  if (all.human || all.ai) finish(r, all.human && all.ai ? "draw" : all.human ? "human" : "ai", "finished");
  else if (r.human.done && r.ai.done) finish(r, compareStandings(r), "timeout");
  else if (r.human.done !== r.ai.done) {
    // One rescuer was caught three times. Their count is final, so the race
    // ends as soon as the other is ahead for good.
    const live: RaceSide = r.human.done ? "ai" : "human";
    if (compareStandings(r) === live) finish(r, live, "decided");
  }
  r.tick++;
}

/** Plain-language result lines for the results screen. */
export function describeResult(result: RaceResult) {
  const time = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);
  const headline = result.winner === "draw" ? "A dead heat" : result.winner === "human" ? "You win the race" : "The trained AI wins";
  const why = result.reason === "finished"
    ? result.winner === "draw" ? "Both crews came aboard on the same tick." : `${result.winner === "human" ? "You" : "The trained AI"} brought all three sailors aboard first.`
    : result.reason === "decided"
      ? `${result.human.out ? "You were" : "The trained AI was"} caught three times; the other side was already ahead.`
      : result.winner === "draw"
        ? result.human.rescued === 0 ? "Time ran out with no sailors aboard on either side." : "Time ran out level, with the same count reached on the same tick."
        : `Time ran out. ${result.human.rescued === result.ai.rescued ? "Level on sailors; the first to reach that count wins." : "More sailors aboard wins."}`;
  return { headline, why, time };
}
