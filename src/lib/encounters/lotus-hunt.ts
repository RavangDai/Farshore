import type { Difficulty, OpponentPlan } from "../arcade/arcade.ts";
import { newAdventure, lotusTickInPlace, lotusCheckInPlace, walkable, type LotusLayout, type LotusState, type Point } from "./odyssey-games.ts";
import { applyAgentAction, cell, MOVE_TICKS, TICK_MS, safeDistances } from "../ai/lotus-agent.ts";
import { openTiles, pathDistances, seededRandom } from "./lotus-layouts.ts";

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
 * He has two powers. Hermes' sandals are always his: when a hunter comes
 * within two steps he sprints for a moment, then must wait for them to
 * recharge. The leap is the price of your third hunter: while it is in the
 * garden, Odysseus may leap one hedge when cornered.
 *
 * He must bring the whole crew home, six sailors, three waiting in the garden
 * at a time: each one he brings aboard is replaced by another wandering out of
 * the lotus fields far from the ship. You must catch him three times. At the
 * clock, the larger share of its goal wins, so a villain who camps cannot win.
 * The board the policy sees never shows more than three waiting sailors, and
 * its count aboard only rises for the last three, as in training.
 *
 * Everything here is plain data and plain functions, shared by the screen and
 * the tests.
 */

export type HuntSide = "hunters" | "odysseus";
export type ThirdPhase = "away" | "arriving" | "out" | "leaving";
export type HuntEventKind = "catch" | "rescue" | "sailor" | "leap" | "sprint" | "summon" | "risen" | "dismiss" | "gone";
export type HuntEvent = { tick: number; kind: HuntEventKind; from?: Point; to?: Point };
export type HuntResult = {
  winner: HuntSide | "draw";
  reason: "caught" | "rescued" | "timeout";
  ms: number;
  /** Sailors aboard, out of HUNT.crew. */
  rescued: number;
  catches: number;
  leaps: number;
  sprints: number;
  /** How long the third hunter was in the garden (the leap live), in milliseconds. */
  thirdMs: number;
};
export type LotusHunt = {
  tick: number;
  layout: LotusLayout;
  difficulty: Difficulty;
  /** Odysseus, the sailors and every hunter: `board.guardians` are the hunters. */
  board: LotusState;
  /** Sailors aboard, out of HUNT.crew (the board's own count only tracks the last three). */
  aboard: number;
  /** Sailors that have entered the garden so far, out of HUNT.crew. */
  spawned: number;
  random: () => number;
  /** The hunter the human is driving, an index into `board.guardians`. */
  possessed: number;
  /** Milliseconds until the possessed hunter may step again. */
  stepClock: number;
  third: { phase: ThirdPhase; ms: number; at: Point | null };
  leapCooldown: number;
  leaps: number;
  lastLeap: { from: Point; to: Point; tick: number } | null;
  /** Hermes' sandals: milliseconds of sprint left, and until they recharge. */
  sprint: number;
  sprintCooldown: number;
  sprints: number;
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
  /** Odysseus wins with this many sailors aboard; three wait in the garden at a time. */
  crew: 6,
  catches: 3,
  /** A replacement sailor appears at least this many steps from the ship. */
  sailorMinSteps: 6,
  summonMs: 3000,
  leaveMs: 3000,
  /** Cornered: a hunter within this many tiles (Manhattan) and no safe route. */
  cornerRange: 2,
  /** The third hunter rises farther than this many tiles from Odysseus. */
  summonKeepAway: 3,
  /** Actions at least this share of the best action's probability share a tie-break. */
  tieShare: 0.35,
  stepMs: { easy: 140, normal: 150, hard: 160 } as Record<Difficulty, number>,
  /** Odysseus's walking pace in ticks per step: the race's MOVE_TICKS (170 ms), a little slower on Easy. */
  moveTicks: { easy: 19, normal: MOVE_TICKS, hard: MOVE_TICKS } as Record<Difficulty, number>,
  /** The board's difficulty drives the scripted hunters: Hard interception helps you most. */
  boardDifficulty: { easy: "hard", normal: "normal", hard: "easy" } as Record<Difficulty, Difficulty>,
  leapCooldownMs: { easy: 12000, normal: 10000, hard: 7000 } as Record<Difficulty, number>,
  /** Hermes' sandals: a hunter this many steps away (by path) sets him sprinting. */
  sprintRange: 2,
  sprintMs: 1200,
  /** While sprinting he decides and steps every this many ticks (90 ms) instead of every MOVE_TICKS. */
  sprintTicks: 9,
  /** Counted from the start of a sprint. */
  sprintCooldownMs: { easy: 14000, normal: 11000, hard: 8000 } as Record<Difficulty, number>,
};

export function newHunt(layout: LotusLayout, difficulty: Difficulty, plan: OpponentPlan, seed = 4200): LotusHunt {
  const board = newAdventure("lotus", HUNT.boardDifficulty[difficulty], plan, false, 4200, { layout }) as LotusState;
  board.duration = HUNT.clockMs;
  return {
    tick: 0, layout, difficulty, board,
    aboard: 0, spawned: board.sailors.length, random: seededRandom(seed),
    possessed: 0, stepClock: 0,
    third: { phase: "away", ms: 0, at: null },
    leapCooldown: 0, leaps: 0, lastLeap: null,
    sprint: 0, sprintCooldown: 0, sprints: 0, thirdTicks: 0,
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

/**
 * Where a replacement sailor wanders out: an open tile at least
 * `sailorMinSteps` from the ship, outside the lantern light, not within two
 * tiles of Odysseus or a hunter, and not on a sailor, moly or relic. Chosen
 * at random, leaning toward the far side of the garden. Null when nothing fits.
 */
export function sailorSpot(h: LotusHunt): Point | null {
  const b = h.board, maze = h.layout.maze, home = pathDistances(maze, h.layout.ship);
  const taken = [...b.sailors, ...b.pickups, ...b.relics];
  const fits = (p: Point) => home[cell(p)] >= HUNT.sailorMinSteps && !inLantern(h.layout, p)
    && manhattan(p, b.player) > 2 && b.guardians.every(g => manhattan(g, p) > 2) && !taken.some(q => q.x === p.x && q.y === p.y);
  const tiles = openTiles(maze).filter(fits);
  if (!tiles.length) return null;
  const weights = tiles.map(p => home[cell(p)]);
  let r = h.random() * weights.reduce((a, w) => a + w, 0);
  for (let i = 0; i < tiles.length; i++) { r -= weights[i]; if (r < 0) return { ...tiles[i] }; }
  return { ...tiles[tiles.length - 1] };
}

/**
 * Books the sailors who came aboard this tick: the true count rises, the
 * board's own count is set to how far into the last three he is (so the board
 * ends exactly when the whole crew is home), and a replacement wanders out
 * while the crew has sailors left to send.
 */
function welcomeAboard(h: LotusHunt, arrived: number) {
  const b = h.board;
  h.aboard += arrived;
  h.events.push({ tick: h.tick, kind: "rescue" });
  if (b.done) return;
  b.rescued = Math.max(0, 3 - (HUNT.crew - h.aboard));
  for (let k = 0; k < arrived && h.spawned < HUNT.crew; k++) {
    const at = sailorSpot(h);
    if (!at) break;
    b.sailors.push(at);
    h.spawned++;
    h.events.push({ tick: h.tick, kind: "sailor", to: { ...at } });
  }
}

/** Odysseus's leap is live from the moment the third hunter has risen until it has fully gone. */
export const leapLive = (h: LotusHunt) => h.third.phase === "out" || h.third.phase === "leaving";

const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Where the third hunter rises: the patrol point farthest by path from
 * Odysseus that is open, outside the lantern light, free of hunters and more
 * than `summonKeepAway` tiles from him; any open tile when no patrol point
 * qualifies; null when nothing does.
 */
export function summonSpot(h: LotusHunt): Point | null {
  const b = h.board, maze = h.layout.maze, far = pathDistances(maze, b.player);
  const fits = (p: Point) => walkable(p, maze) && !inLantern(h.layout, p) && !b.guardians.some(g => g.x === p.x && g.y === p.y) && manhattan(p, b.player) > HUNT.summonKeepAway;
  const pick = (tiles: Point[]) => tiles.filter(fits).reduce<Point | null>((best, p) => (!best || far[cell(p)] > far[cell(best)] ? p : best), null);
  return pick(h.layout.waypoints) ?? pick(openTiles(maze));
}

/** Space: summons the third hunter when it is away, dismisses it when it is out; nothing while it is on its way in or out. */
export function toggleThird(h: LotusHunt) {
  if (h.result) return;
  const t = h.third;
  if (t.phase === "away") {
    const at = summonSpot(h);
    if (!at) return;
    h.third = { phase: "arriving", ms: HUNT.summonMs, at: { ...at } };
    h.events.push({ tick: h.tick, kind: "summon", to: { ...at } });
  } else if (t.phase === "out") {
    h.third = { phase: "leaving", ms: HUNT.leaveMs, at: t.at };
    h.events.push({ tick: h.tick, kind: "dismiss" });
  }
}

/** Runs the third hunter's timers: it rises when its time is up and the tile is clear of Odysseus, and leaves when its fade is over. */
function advanceThird(h: LotusHunt) {
  const t = h.third, b = h.board;
  if (t.phase === "away") return;
  t.ms = Math.max(0, t.ms - TICK_MS);
  if (t.ms > 0 || t.phase === "out") return;
  if (t.phase === "arriving") {
    const at = t.at!;
    if (manhattan(b.player, at) <= 1) return; // it never catches by rising: it waits for him to leave
    b.lastGuardians ??= b.guardians.map(p => ({ ...p }));
    b.guardians.push({ ...at });
    b.lastGuardians.push({ ...at });
    t.phase = "out";
    h.events.push({ tick: h.tick, kind: "risen", to: { ...at } });
  } else {
    b.guardians.splice(2, 1);
    b.lastGuardians?.splice(2, 1);
    if (h.possessed >= b.guardians.length) h.possessed = 0;
    h.third = { phase: "away", ms: 0, at: null };
    h.events.push({ tick: h.tick, kind: "gone" });
  }
}

/**
 * Cornered: no safe route to his current goal (every way out passes beside a
 * hunter) and a hunter within `cornerRange` tiles. Moly means he is in no
 * danger, so he is never cornered while it lasts.
 */
export function cornered(h: LotusHunt): boolean {
  const b = h.board;
  if (b.protection > 0 || !b.guardians.length) return false;
  if (safeDistances(b)[cell(b.player)] >= 0) return false;
  return Math.min(...b.guardians.map(g => manhattan(g, b.player))) <= HUNT.cornerRange;
}

/** Path distance from a tile to his current goal: the ship while escorting or when no sailor waits, else the nearest waiting sailor. */
function goalDistance(b: LotusState): (p: Point) => number {
  const maps = (b.carrying || !b.sailors.length ? [b.layout.ship] : b.sailors).map(g => pathDistances(b.layout.maze, g));
  return p => Math.min(...maps.map(m => (m[cell(p)] < 0 ? 999 : m[cell(p)])));
}

/**
 * Where a leap lands: two tiles away in a straight line, over one hedge, onto
 * an open tile with no hunter on it. The best landing is not beside any
 * hunter, then farthest from the hunters, then nearest his goal.
 */
export function bestLanding(h: LotusHunt): Point | null {
  const b = h.board, maze = h.layout.maze, p = b.player;
  const hunterOn = (q: Point) => b.guardians.some(g => g.x === q.x && g.y === q.y);
  const nearest = (q: Point) => Math.min(...b.guardians.map(g => manhattan(g, q)));
  const beside = (q: Point) => (b.guardians.some(g => manhattan(g, q) === 1) ? 1 : 0);
  const goal = goalDistance(b);
  const landings = [[0, -1], [0, 1], [-1, 0], [1, 0]]
    .map(([dx, dy]) => ({ mid: { x: p.x + dx, y: p.y + dy }, far: { x: p.x + 2 * dx, y: p.y + 2 * dy } }))
    .filter(c => maze[c.mid.y]?.[c.mid.x] === "#" && walkable(c.far, maze) && !hunterOn(c.far))
    .map(c => c.far)
    .sort((a, c) => beside(a) - beside(c) || nearest(c) - nearest(a) || goal(a) - goal(c));
  return landings[0] ?? null;
}

/**
 * The magic: with the leap live and off cooldown, a cornered Odysseus hops
 * one hedge to the best landing. The sailor he escorts follows (he is drawn at
 * `previous`). Returns whether he leapt; the policy's move is then discarded.
 */
export function tryLeap(h: LotusHunt): boolean {
  const b = h.board;
  if (!leapLive(h) || h.leapCooldown > 0 || b.done || !cornered(h)) return false;
  const to = bestLanding(h);
  if (!to) return false;
  const from = { ...b.player };
  b.previous = from;
  b.player = { ...to };
  b.moveClock = 170;
  lotusCheckInPlace(b);
  h.leapCooldown = HUNT.leapCooldownMs[h.difficulty];
  h.leaps++;
  h.lastLeap = { from, to: { ...to }, tick: h.tick };
  h.events.push({ tick: h.tick, kind: "leap", from, to: { ...to } });
  return true;
}

/** How many steps (by path) the nearest hunter is from Odysseus; Infinity when none can reach him. */
export function nearestHunterSteps(h: LotusHunt): number {
  const b = h.board, far = pathDistances(h.layout.maze, b.player);
  return b.guardians.reduce((best, g) => { const d = far[cell(g)]; return d >= 0 && d < best ? d : best; }, Infinity);
}

/**
 * Hermes' sandals, his own power: when the sandals are charged and a hunter
 * comes within `sprintRange` steps, he sprints for `sprintMs`, deciding and
 * stepping every `sprintTicks` instead of every MOVE_TICKS. Not while moly or
 * a fresh catch already keeps him safe. Returns whether a sprint began.
 */
export function trySprint(h: LotusHunt): boolean {
  const b = h.board;
  if (b.done || h.sprint > 0 || h.sprintCooldown > 0 || b.protection > 0 || b.invulnerable > 0) return false;
  if (nearestHunterSteps(h) > HUNT.sprintRange) return false;
  h.sprint = HUNT.sprintMs;
  h.sprintCooldown = HUNT.sprintCooldownMs[h.difficulty];
  h.sprints++;
  h.events.push({ tick: h.tick, kind: "sprint", from: { ...b.player } });
  return true;
}

/**
 * Breaks the policy's close calls softly: every action whose probability is
 * at least `share` of the best one's shares the draw, in proportion to
 * probability, from a single `random()` call. A clear favourite is always
 * taken, so the hunt keeps the trained rival's strengths while a human cannot
 * learn one fixed trap. The race stays arg-max for parity with the evaluation.
 */
export function pickAction(logits: ArrayLike<number>, random: () => number = Math.random, share = HUNT.tieShare): number {
  const n = logits.length;
  let max = -Infinity;
  for (let i = 0; i < n; i++) max = Math.max(max, logits[i]);
  const weights = Array.from({ length: n }, (_, i) => Math.exp(logits[i] - max));
  const sum = weights.reduce((a, w) => a + w, 0);
  const best = Math.max(...weights) / sum;
  const kept = weights.map((w, i) => ({ i, p: w / sum })).filter(a => a.p >= share * best);
  let r = random() * kept.reduce((a, k) => a + k.p, 0);
  for (const k of kept) { r -= k.p; if (r < 0) return k.i; }
  return kept[kept.length - 1].i;
}

/** Plain-language result lines for the hunt's results panel, from the hunters' side. */
export function describeHunt(result: HuntResult): { headline: string; why: string } {
  const { winner, reason, rescued, catches } = result;
  const tally = `${rescued} of ${HUNT.crew} sailors aboard, ${catches} of ${HUNT.catches} catches`;
  if (winner === "hunters") {
    return reason === "caught"
      ? { headline: "You caught Odysseus", why: `Three catches, with ${rescued} of ${HUNT.crew} sailors aboard. The lotus garden keeps him.` }
      : { headline: "The storm beat him to it", why: `Time ran out with you ahead: ${tally}.` };
  }
  if (winner === "odysseus") {
    return reason === "rescued"
      ? { headline: "Odysseus escaped with the crew", why: `All ${HUNT.crew} sailors came aboard${catches ? ` despite ${catches} catch${catches === 1 ? "" : "es"}` : " and you never caught him"}.` }
      : { headline: "Odysseus slipped through", why: `Time ran out with him ahead: ${tally}.` };
  }
  return { headline: "The storm calls it a draw", why: `Time ran out level: ${tally}.` };
}

function settle(h: LotusHunt) {
  const b = h.board;
  if (!b.done) return;
  const base = { ms: h.tick * TICK_MS, rescued: h.aboard, catches: b.hits, leaps: h.leaps, sprints: h.sprints, thirdMs: h.thirdTicks * TICK_MS };
  if (b.won) h.result = { winner: "odysseus", reason: "rescued", ...base };
  else if (b.hits >= 3) h.result = { winner: "hunters", reason: "caught", ...base };
  else {
    // The larger share of its own goal wins: sailors out of the crew against catches out of three.
    const his = h.aboard * HUNT.catches, yours = b.hits * HUNT.crew;
    h.result = { winner: his > yours ? "odysseus" : yours > his ? "hunters" : "draw", reason: "timeout", ...base };
  }
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
    // The leap comes first: when it fires, the model's move for this opportunity is discarded.
    const leapt = tryLeap(h);
    if (!leapt) {
      trySprint(h);
      // A sprinting step recharges in sprintTicks rather than the usual 170 ms.
      if (applyAgentAction(b, aiAction!) && h.sprint > 0) b.moveClock = HUNT.sprintTicks * TICK_MS;
    }
    h.aiLastAction = aiAction;
    h.aiDecisions++;
    h.aiNextDecision = h.tick + (!leapt && h.sprint > 0 ? HUNT.sprintTicks : HUNT.moveTicks[h.difficulty]);
  }
  if (move && h.stepClock <= 0 && !b.done) stepHunter(h, move);
  h.stepClock = Math.max(0, h.stepClock - TICK_MS);
  h.leapCooldown = Math.max(0, h.leapCooldown - TICK_MS);
  h.sprint = Math.max(0, h.sprint - TICK_MS);
  h.sprintCooldown = Math.max(0, h.sprintCooldown - TICK_MS);
  lotusTickInPlace(b, TICK_MS, new Set([h.possessed]));
  if (leapLive(h)) h.thirdTicks++;
  advanceThird(h);
  if (b.hits > before.hits) { h.sprint = 0; h.events.push({ tick: h.tick, kind: "catch" }); }
  if (b.rescued > before.rescued) welcomeAboard(h, b.rescued - before.rescued);
  settle(h);
  h.tick++;
}
