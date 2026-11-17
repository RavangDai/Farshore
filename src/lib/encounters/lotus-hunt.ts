import type { Difficulty, OpponentPlan } from "../arcade/arcade.ts";
import { newAdventure, lotusTickInPlace, lotusCheckInPlace, walkable, type LotusLayout, type LotusState, type Point } from "./odyssey-games.ts";
import { applyAgentAction, MOVE_TICKS, TICK_MS } from "../ai/lotus-agent.ts";

/**
 * The Lotus Hunt: the trained Odysseus plays the garden and you play the
 * guardians.
 *
 * One ordinary Lotus board holds everything. Odysseus is moved by the PPO
 * policy once per movement opportunity (every MOVE_TICKS), exactly as in the
 * Rescue Race. You possess one hunter at a time and step it with the arrow
 * keys; the hunters you are not possessing keep the game's own patrol and
 * pursuit, which `lotusTickInPlace` runs with the possessed index held still.
 *
 * The third hunter is the price of his magic: while it is in the garden,
 * Odysseus may leap one hedge when cornered. Both sides race to three: three
 * sailors aboard for him, three catches for you; at the clock, more progress
 * wins. A villain who camps scores nothing, so camping cannot win.
 *
 * Everything here is plain data and plain functions, shared by the screen and
 * the tests.
 */

export type HuntSide = "hunters" | "odysseus";
export type ThirdPhase = "away" | "arriving" | "out" | "leaving";
export type HuntEventKind = "catch" | "rescue" | "leap" | "summon" | "risen" | "dismiss" | "gone";
export type HuntEvent = { tick: number; kind: HuntEventKind; from?: Point; to?: Point };
export type HuntResult = {
  winner: HuntSide | "draw";
  reason: "caught" | "rescued" | "timeout";
  ms: number;
  rescued: number;
  catches: number;
  leaps: number;
  /** How long the third hunter was in the garden (the leap live), in milliseconds. */
  thirdMs: number;
};
export type LotusHunt = {
  tick: number;
  layout: LotusLayout;
  difficulty: Difficulty;
  /** Odysseus, the sailors and every hunter: `board.guardians` are the hunters. */
  board: LotusState;
  /** The hunter the human is driving, an index into `board.guardians`. */
  possessed: number;
  /** Milliseconds until the possessed hunter may step again. */
  stepClock: number;
  third: { phase: ThirdPhase; ms: number; at: Point | null };
  leapCooldown: number;
  leaps: number;
  lastLeap: { from: Point; to: Point; tick: number } | null;
  thirdTicks: number;
  aiNextDecision: number;
  aiLastAction: number | null;
  aiDecisions: number;
  events: HuntEvent[];
  result: HuntResult | null;
};

/** The rules in one place. Difficulty is the villain's: Easy is easiest for the human. */
export const HUNT = {
  clockMs: 120000,
  summonMs: 3000,
  leaveMs: 3000,
  /** Cornered: a hunter within this many tiles (Manhattan) and no safe route. */
  cornerRange: 2,
  /** The third hunter rises farther than this many tiles from Odysseus. */
  summonKeepAway: 3,
  /** Actions at least this share of the best action's probability share a tie-break. */
  tieShare: 0.35,
  stepMs: { easy: 190, normal: 220, hard: 250 } as Record<Difficulty, number>,
  /** The board's difficulty drives the scripted hunters: Hard interception helps you most. */
  boardDifficulty: { easy: "hard", normal: "normal", hard: "easy" } as Record<Difficulty, Difficulty>,
  leapCooldownMs: { easy: 12000, normal: 10000, hard: 7000 } as Record<Difficulty, number>,
};

export function newHunt(layout: LotusLayout, difficulty: Difficulty, plan: OpponentPlan): LotusHunt {
  const board = newAdventure("lotus", HUNT.boardDifficulty[difficulty], plan, false, 4200, { layout }) as LotusState;
  board.duration = HUNT.clockMs;
  return {
    tick: 0, layout, difficulty, board,
    possessed: 0, stepClock: 0,
    third: { phase: "away", ms: 0, at: null },
    leapCooldown: 0, leaps: 0, lastLeap: null, thirdTicks: 0,
    aiNextDecision: 0, aiLastAction: null, aiDecisions: 0,
    events: [], result: null,
  };
}

/** Whether Odysseus must choose before the clock can move on. */
export const huntAwaitingDecision = (h: LotusHunt) => !h.result && !h.board.done && h.tick >= h.aiNextDecision;

/** The ship's lantern light: the ship tile and its four neighbours, where no hunter may stand. */
export const inLantern = (layout: LotusLayout, p: Point) => Math.abs(p.x - layout.ship.x) + Math.abs(p.y - layout.ship.y) <= 1;

/** Whether the human's hunter may step onto `p`: an open tile outside the lantern light. */
export function canStepTo(h: LotusHunt, p: Point): boolean {
  return walkable(p, h.layout.maze) && !inLantern(h.layout, p);
}

/** Takes control of hunter `index`; false when no such hunter is in the garden. */
export function possess(h: LotusHunt, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= h.board.guardians.length) return false;
  h.possessed = index;
  return true;
}

export function cycleHunter(h: LotusHunt) {
  h.possessed = (h.possessed + 1) % h.board.guardians.length;
}

function stepHunter(h: LotusHunt, move: { dx: number; dy: number }): boolean {
  if (Math.abs(move.dx) + Math.abs(move.dy) !== 1) return false;
  const b = h.board, from = b.guardians[h.possessed];
  if (!from) return false;
  const to = { x: from.x + move.dx, y: from.y + move.dy };
  if (!canStepTo(h, to)) return false;
  b.lastGuardians ??= b.guardians.map(p => ({ ...p }));
  b.lastGuardians[h.possessed] = { ...from };
  b.guardians[h.possessed] = to;
  h.stepClock = HUNT.stepMs[h.difficulty];
  lotusCheckInPlace(b);
  return true;
}

function settle(h: LotusHunt) {
  const b = h.board;
  if (!b.done) return;
  const base = { ms: h.tick * TICK_MS, rescued: b.rescued, catches: b.hits, leaps: h.leaps, thirdMs: h.thirdTicks * TICK_MS };
  if (b.won) h.result = { winner: "odysseus", reason: "rescued", ...base };
  else if (b.hits >= 3) h.result = { winner: "hunters", reason: "caught", ...base };
  else h.result = { winner: b.rescued > b.hits ? "odysseus" : b.hits > b.rescued ? "hunters" : "draw", reason: "timeout", ...base };
}

/**
 * Advances the hunt by one tick, in place. `move` is the direction the human
 * holds this tick, if any; it steps the possessed hunter only when its step is
 * ready. `aiAction` must be given whenever `huntAwaitingDecision` is true; the
 * caller waits for the model rather than skipping his turn.
 */
export function huntTick(h: LotusHunt, move: { dx: number; dy: number } | null, aiAction: number | null) {
  if (h.result) return;
  if (huntAwaitingDecision(h) && aiAction === null) throw new Error("Odysseus has not chosen his move for this tick.");
  const b = h.board;
  const before = { hits: b.hits, rescued: b.rescued };
  if (huntAwaitingDecision(h)) {
    applyAgentAction(b, aiAction!);
    h.aiLastAction = aiAction;
    h.aiDecisions++;
    h.aiNextDecision = h.tick + MOVE_TICKS;
  }
  if (move && h.stepClock <= 0 && !b.done) stepHunter(h, move);
  h.stepClock = Math.max(0, h.stepClock - TICK_MS);
  lotusTickInPlace(b, TICK_MS, new Set([h.possessed]));
  if (b.hits > before.hits) h.events.push({ tick: h.tick, kind: "catch" });
  if (b.rescued > before.rescued) h.events.push({ tick: h.tick, kind: "rescue" });
  settle(h);
  h.tick++;
}
