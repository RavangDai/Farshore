import test from "node:test";
import assert from "node:assert/strict";
import { newAdventure, lotusTickInPlace, lotusCheckInPlace, LOTUS_CLASSIC } from "../src/lib/encounters/odyssey-games.ts";
import { safeDistances, cell, WAIT } from "../src/lib/ai/lotus-agent.ts";
import { standardPlan } from "../src/lib/arcade/arcade.ts";
import { newHunt, huntTick, huntAwaitingDecision, possess, cycleHunter, canStepTo, inLantern, HUNT } from "../src/lib/encounters/lotus-hunt.ts";

const plan = standardPlan("lotus");
const board = (difficulty = "normal") => newAdventure("lotus", difficulty, plan, false, 4200, { layout: LOTUS_CLASSIC });
const hunt = (difficulty = "normal", layout = LOTUS_CLASSIC) => newHunt(layout, difficulty, plan);
/** Advances `n` ticks; Odysseus waits whenever asked; the human holds `move`. */
const run = (h, n, move = null) => { for (let i = 0; i < n && !h.result; i++) huntTick(h, move, huntAwaitingDecision(h) ? WAIT : null); };

// ---------------------------------------------------------------- Task 1 --
// The shared garden rules learn to leave a held guardian alone.

test("a held guardian stays put and keeps its last-step direction while the others patrol", () => {
  const s = board("hard");
  s.guardians[0] = { x: 5, y: 1 }; // off its patrol point, so it would walk if the game moved it
  const start = s.guardians.map(p => ({ ...p }));
  s.lastGuardians = [{ x: start[0].x - 1, y: start[0].y }, { ...start[1] }];
  for (let i = 0; i < 70; i++) lotusTickInPlace(s, 10, new Set([0])); // 700 ms > the 600 ms hard interval
  assert.deepEqual(s.guardians[0], start[0]);
  assert.notDeepEqual(s.guardians[1], start[1]);
  assert.deepEqual(s.lastGuardians[0], { x: start[0].x - 1, y: start[0].y });
});

test("without a held set the guard step is unchanged: both guardians move", () => {
  const s = board("hard");
  s.guardians[0] = { x: 5, y: 1 };
  const start = s.guardians.map(p => ({ ...p }));
  for (let i = 0; i < 70; i++) lotusTickInPlace(s, 10);
  assert.ok(s.guardians.every((g, i) => g.x !== start[i].x || g.y !== start[i].y));
});

test("lotusCheckInPlace registers a catch when a guardian stands on Odysseus", () => {
  const s = board();
  s.player = { x: 5, y: 1 }; s.guardians[0] = { x: 5, y: 1 };
  lotusCheckInPlace(s);
  assert.equal(s.hits, 1);
  assert.deepEqual(s.player, LOTUS_CLASSIC.ship);
  assert.equal(s.invulnerable, 1800);
});

test("safeDistances and cell are exported and agree with the garden", () => {
  const s = board();
  assert.equal(cell({ x: 3, y: 2 }), 2 * 15 + 3);
  assert.equal(safeDistances(s)[cell(s.player)] >= 0, true);
});

// ---------------------------------------------------------------- Task 2 --
// The hunt: one board, a possessed hunter, catches and standings.

test("a new hunt wraps one board at the mapped difficulty with a 120 s clock and hunter 1 possessed", () => {
  const h = hunt("easy");
  assert.equal(h.board.difficulty, "hard");
  assert.equal(h.board.duration, 120000);
  assert.equal(h.possessed, 0);
  assert.equal(h.board.guardians.length, 2);
  assert.throws(() => huntTick(h, null, null), /has not chosen/);
});

test("the possessed hunter steps on the human's key, then waits out its step time; the other hunter patrols", () => {
  const h = hunt("normal");
  const [a, b] = h.board.guardians.map(p => ({ ...p }));
  const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => canStepTo(h, { x: a.x + dx, y: a.y + dy }));
  run(h, 1, { dx: open[0], dy: open[1] });
  assert.deepEqual(h.board.guardians[0], { x: a.x + open[0], y: a.y + open[1] });
  assert.equal(h.stepClock, HUNT.stepMs.normal - 10);
  run(h, 10, { dx: open[0], dy: open[1] });
  assert.deepEqual(h.board.guardians[0], { x: a.x + open[0], y: a.y + open[1] }, "no second step inside 220 ms");
  run(h, 80);
  assert.notDeepEqual(h.board.guardians[1], b, "the scripted hunter moved on the 780 ms clock");
});

test("hedges and the ship's lantern light refuse the hunter without spending its step", () => {
  const h = hunt();
  h.board.guardians[0] = { x: 3, y: 9 };
  assert.ok(inLantern(LOTUS_CLASSIC, { x: 2, y: 9 }) && inLantern(LOTUS_CLASSIC, { x: 1, y: 8 }) && !inLantern(LOTUS_CLASSIC, { x: 3, y: 9 }));
  run(h, 1, { dx: -1, dy: 0 });
  assert.deepEqual(h.board.guardians[0], { x: 3, y: 9 });
  assert.equal(h.stepClock, 0);
  run(h, 1, { dx: 0, dy: -1 }); // (3,8) is a hedge
  assert.deepEqual(h.board.guardians[0], { x: 3, y: 9 });
});

test("stepping onto Odysseus catches him: he drops the sailor, returns to the ship, and three catches end the hunt", () => {
  const h = hunt();
  h.board.player = { x: 1, y: 3 }; h.board.guardians[0] = { x: 2, y: 3 }; h.board.carrying = true;
  run(h, 1, { dx: -1, dy: 0 });
  assert.equal(h.board.hits, 1);
  assert.equal(h.board.carrying, false);
  assert.deepEqual(h.board.sailors.at(-1), { x: 1, y: 3 });
  assert.deepEqual(h.board.player, LOTUS_CLASSIC.ship);
  assert.equal(h.events.at(-1).kind, "catch");
  h.board.hits = 2; h.board.invulnerable = 0; h.board.player = { x: 1, y: 3 }; h.board.guardians[0] = { x: 2, y: 3 }; h.stepClock = 0;
  run(h, 1, { dx: -1, dy: 0 });
  assert.deepEqual(h.result && [h.result.winner, h.result.reason, h.result.catches], ["hunters", "caught", 3]);
});

test("possession cycles through the hunters that exist and rejects a missing index", () => {
  const h = hunt();
  cycleHunter(h); assert.equal(h.possessed, 1);
  cycleHunter(h); assert.equal(h.possessed, 0);
  assert.equal(possess(h, 2), false);
  assert.equal(possess(h, 1), true); assert.equal(h.possessed, 1);
});

test("when the clock runs out, more progress wins and equal progress is a draw", () => {
  // Moly for the whole hunt keeps the patrols from deciding these on their own.
  const quiet = (setup = () => {}) => { const h = hunt(); h.board.protection = HUNT.clockMs + 1000; setup(h); run(h, 12001); return h.result; };
  assert.deepEqual([quiet().winner, quiet().reason], ["draw", "timeout"]);
  assert.equal(quiet(h => { h.board.hits = 1; }).winner, "hunters");
  assert.equal(quiet(h => { h.board.rescued = 2; h.board.hits = 1; }).winner, "odysseus");
});
