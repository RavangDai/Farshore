import test from "node:test";
import assert from "node:assert/strict";
import { newAdventure, lotusTickInPlace, lotusCheckInPlace, LOTUS_CLASSIC } from "../src/lib/encounters/odyssey-games.ts";
import { safeDistances, cell, WAIT } from "../src/lib/ai/lotus-agent.ts";
import { standardPlan } from "../src/lib/arcade/arcade.ts";
import { newHunt, huntTick, huntAwaitingDecision, possess, cycleHunter, canStepTo, inLantern, HUNT, toggleThird, summonSpot, leapLive, tryLeap, cornered, bestLanding, pickAction, describeHunt, trySprint, nearestHunterSteps, sailorSpot } from "../src/lib/encounters/lotus-hunt.ts";
import { pathDistances } from "../src/lib/encounters/lotus-layouts.ts";

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
  assert.deepEqual([h.aboard, h.spawned, h.sprint, h.sprintCooldown], [0, 3, 0, 0]);
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
  assert.deepEqual(h.board.guardians[0], { x: a.x + open[0], y: a.y + open[1] }, "no second step inside its step time");
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
  // Shares of each goal: 3 of 6 sailors beats 1 of 3 catches; 2 of 6 against 1 of 3 is level.
  assert.equal(quiet(h => { h.aboard = 3; h.board.hits = 1; }).winner, "odysseus");
  assert.equal(quiet(h => { h.aboard = 2; h.board.hits = 1; }).winner, "draw");
});

// ---------------------------------------------------------------- Task 3 --
// The third hunter: summoned with Space, the price of Odysseus's leap.

test("the third hunter rises 3 s after Space at the farthest patrol point, unpossessed, and the leap goes live", () => {
  const h = hunt();
  const spot = summonSpot(h);
  assert.ok(spot && LOTUS_CLASSIC.waypoints.some(w => w.x === spot.x && w.y === spot.y));
  toggleThird(h);
  assert.equal(h.third.phase, "arriving"); assert.equal(leapLive(h), false);
  run(h, 299);
  assert.equal(h.board.guardians.length, 2);
  run(h, 1);
  assert.equal(h.third.phase, "out"); assert.equal(h.board.guardians.length, 3);
  assert.deepEqual(h.board.guardians[2], spot);
  assert.equal(h.possessed, 0); assert.equal(leapLive(h), true);
  assert.equal(h.events.filter(e => e.kind === "risen").length, 1);
});

test("Space during arriving or leaving does nothing; dismissing fades it over 3 s with the leap still live", () => {
  const h = hunt(); toggleThird(h); toggleThird(h);
  assert.equal(h.third.phase, "arriving");
  run(h, 300); assert.equal(possess(h, 2), true);
  toggleThird(h); assert.equal(h.third.phase, "leaving"); assert.equal(leapLive(h), true);
  toggleThird(h); assert.equal(h.third.phase, "leaving");
  run(h, 300);
  assert.equal(h.third.phase, "away"); assert.equal(h.board.guardians.length, 2); assert.equal(h.possessed, 0);
  assert.equal(leapLive(h), false); assert.equal(h.thirdTicks, 300);
  toggleThird(h); assert.equal(h.third.phase, "arriving", "it can be summoned again at once");
});

test("the third hunter waits while Odysseus stands on or beside its rise tile", () => {
  const h = hunt(); toggleThird(h);
  h.board.player = { ...h.third.at }; h.board.protection = 10000;
  run(h, 320);
  assert.equal(h.third.phase, "arriving"); assert.equal(h.board.hits, 0); assert.equal(h.board.guardians.length, 2);
  h.board.player = { ...LOTUS_CLASSIC.ship };
  run(h, 1);
  assert.equal(h.third.phase, "out");
});

test("with no legal rise tile, Space is ignored", () => {
  const maze = Array.from({ length: 11 }, (_, y) => (y === 5 ? "#.....#########" : "###############"));
  const tiny = { id: "tiny", name: "Tiny", maze, ship: { x: 1, y: 5 }, sailors: [{ x: 3, y: 5 }], guardians: [{ x: 5, y: 5 }, { x: 4, y: 5 }], pickups: [], relics: [], waypoints: [{ x: 5, y: 5 }] };
  const h = hunt("normal", tiny);
  assert.equal(summonSpot(h), null);
  toggleThird(h);
  assert.equal(h.third.phase, "away");
  assert.equal(h.events.length, 0);
});

// ---------------------------------------------------------------- Task 4 --
// The leap: live only with the third hunter out, fired by the game when cornered.

/**
 * Odysseus at (3,5) in the classic garden: its two exits, (2,5) and (3,4), are
 * each beside a hunter, so no safe route remains; the hedges at (4,5) and
 * (3,6) can be leapt to (5,5) and (3,7). Hunter 1 (possessed) at (3,3), hunter
 * 2 at (1,5).
 */
function cornerHunt(difficulty = "normal") {
  const h = hunt(difficulty);
  place(h);
  return h;
}
function place(h) {
  h.board.player = { x: 3, y: 5 }; h.board.previous = { x: 2, y: 5 };
  h.board.guardians[0] = { x: 3, y: 3 }; h.board.guardians[1] = { x: 1, y: 5 };
}
/** Summons the third hunter under moly (so nothing is decided while it rises), then puts everyone back in the corner. */
const withThird = h => { toggleThird(h); h.board.protection = HUNT.summonMs; run(h, 300); assert.equal(h.third.phase, "out"); assert.equal(h.board.protection, 0); place(h); return h; };

test("the leap is sealed with two hunters, even when Odysseus is cornered", () => {
  const h = cornerHunt();
  assert.equal(cornered(h), true);
  assert.equal(tryLeap(h), false);
  run(h, 1);
  assert.deepEqual(h.board.player, { x: 3, y: 5 }); assert.equal(h.leaps, 0);
});

test("with the third hunter out, a cornered Odysseus leaps one hedge to a free tile and the cooldown starts", () => {
  const h = withThird(cornerHunt("normal"));
  run(h, 17);
  assert.equal(h.leaps, 1);
  const landed = h.board.player.x + "," + h.board.player.y;
  assert.ok(["5,5", "3,7"].includes(landed), "landed at " + landed);
  assert.deepEqual(h.lastLeap.from, { x: 3, y: 5 });
  assert.ok(h.leapCooldown > HUNT.leapCooldownMs.normal - 200 && h.leapCooldown <= HUNT.leapCooldownMs.normal, "cooldown " + h.leapCooldown);
  assert.equal(h.events.filter(e => e.kind === "leap").length, 1);
  // Cornered again inside the cooldown: no second leap.
  place(h);
  run(h, 17);
  assert.equal(h.leaps, 1);
});

test("moly protection means he is not cornered, so no leap", () => {
  const h = withThird(cornerHunt()); h.board.protection = 5000;
  assert.equal(cornered(h), false); assert.equal(tryLeap(h), false);
});

test("cornered with no hedge to clear: no landing, no leap", () => {
  // The (7,3)-(7,5) corridor: from (7,4) the only hedge-leap lands on (5,4), and a hunter stands there.
  const h = withThird(cornerHunt());
  h.board.player = { x: 7, y: 4 }; h.board.previous = { x: 7, y: 3 };
  h.board.guardians = [{ x: 6, y: 3 }, { x: 8, y: 5 }, { x: 5, y: 4 }];
  assert.equal(cornered(h), true); assert.equal(bestLanding(h), null); assert.equal(tryLeap(h), false);
});

test("the landing avoids a tile beside a hunter when another is free", () => {
  const h = withThird(cornerHunt());
  h.board.guardians[2] = { x: 5, y: 6 }; // (5,5) is beside it; (3,7) is not
  assert.deepEqual(bestLanding(h), { x: 3, y: 7 });
});

test("the leap cooldown follows the difficulty", () => {
  assert.deepEqual([HUNT.leapCooldownMs.easy, HUNT.leapCooldownMs.normal, HUNT.leapCooldownMs.hard], [12000, 10000, 7000]);
});

// ------------------------------------------------------ Hermes' sandals --
// His own power: a sprint when a hunter comes within two steps.

/** Odysseus on the open top row of the classic garden, hunter 1 two steps behind him, hunter 2 far away. */
function chased(difficulty = "normal") {
  const h = hunt(difficulty);
  h.board.player = { x: 7, y: 1 }; h.board.previous = { x: 6, y: 1 };
  h.board.guardians[0] = { x: 5, y: 1 }; h.board.guardians[1] = { x: 13, y: 9 };
  return h;
}
/** Advances `n` ticks with Odysseus choosing `action` whenever asked. */
const runAct = (h, n, action) => { for (let i = 0; i < n && !h.result; i++) huntTick(h, null, huntAwaitingDecision(h) ? action : null); };
const RIGHT = 3;

test("a hunter two steps away sets him sprinting: he steps every 9 ticks for 1.2 s, then the sandals recharge", () => {
  const h = chased();
  assert.equal(nearestHunterSteps(h), 2);
  runAct(h, 19, RIGHT); // decisions at ticks 0, 9 and 18
  assert.equal(h.sprints, 1);
  assert.deepEqual(h.board.player, { x: 10, y: 1 });
  assert.equal(h.aiDecisions, 3);
  assert.equal(h.events.filter(e => e.kind === "sprint").length, 1);
  runAct(h, 120, RIGHT);
  assert.equal(h.sprint, 0);
  assert.equal(h.sprintCooldown, HUNT.sprintCooldownMs.normal - 1390);
  // Back to the usual rhythm once the sprint is over.
  const at = h.aiDecisions; runAct(h, 17, WAIT);
  assert.equal(h.aiDecisions - at, 1);
});

test("without his sandals' trigger he walks: no hunter near, moly, a fresh catch, or recharging", () => {
  const far = chased(); far.board.guardians[0] = { x: 1, y: 9 };
  assert.ok(nearestHunterSteps(far) > HUNT.sprintRange); assert.equal(trySprint(far), false);
  runAct(far, 18, RIGHT);
  assert.deepEqual(far.board.player, { x: 9, y: 1 }, "two steps in 18 ticks at the usual 170 ms");
  const moly = chased(); moly.board.protection = 5000; assert.equal(trySprint(moly), false);
  const caught = chased(); caught.board.invulnerable = 900; assert.equal(trySprint(caught), false);
  const tired = chased(); tired.sprintCooldown = 10; assert.equal(trySprint(tired), false);
});

test("he walks every 17 ticks (170 ms), every 19 on Easy", () => {
  for (const [difficulty, ticks] of [["easy", 19], ["normal", 17], ["hard", 17]]) {
    const h = chased(difficulty); h.board.guardians[0] = { x: 1, y: 9 };
    runAct(h, 1, RIGHT);
    assert.equal(h.aiNextDecision, ticks, difficulty);
    runAct(h, ticks, RIGHT);
    assert.deepEqual(h.board.player, { x: 9, y: 1 }, difficulty);
  }
});

test("steps are counted by path, so a hunter behind a hedge does not set him sprinting", () => {
  const h = hunt();
  h.board.player = { x: 2, y: 1 }; h.board.guardians[0] = { x: 2, y: 3 }; h.board.guardians[1] = { x: 13, y: 9 };
  assert.equal(nearestHunterSteps(h), 4, "(2,2) is a hedge; the way round is four steps");
  assert.equal(trySprint(h), false);
});

test("a catch ends the sprint", () => {
  const h = chased();
  runAct(h, 1, WAIT);
  assert.ok(h.sprint > 0);
  h.board.guardians[0] = { x: 6, y: 1 }; h.stepClock = 0;
  huntTick(h, { dx: 1, dy: 0 }, null);
  assert.equal(h.board.hits, 1); assert.equal(h.sprint, 0);
});

// --------------------------------------------------------- the whole crew --
// Six sailors, three waiting at a time; the board's own count tracks the last three.

/** Odysseus beside the classic ship escorting a sailor; his next move (LEFT) brings the sailor aboard. */
function deliver(h) {
  h.board.sailors.pop();
  h.board.carrying = true; h.board.player = { x: 2, y: 9 }; h.board.previous = { x: 3, y: 9 };
  h.board.moveClock = 0; h.board.invulnerable = 0; h.aiNextDecision = h.tick;
  huntTick(h, null, 2);
}

test("each sailor brought aboard is replaced by one far from the ship until six have entered; the sixth aboard wins", () => {
  const h = hunt();
  h.board.guardians = [{ x: 13, y: 1 }, { x: 13, y: 3 }];
  const home = pathDistances(LOTUS_CLASSIC.maze, LOTUS_CLASSIC.ship);
  for (let n = 1; n <= 3; n++) {
    deliver(h);
    assert.equal(h.aboard, n);
    assert.equal(h.board.rescued, 0, "the board counts only the last three");
    assert.equal(h.board.sailors.length, 3, "a replacement wanders out");
    assert.equal(h.spawned, 3 + n);
    const fresh = h.events.filter(e => e.kind === "sailor").at(-1).to;
    assert.ok(home[cell(fresh)] >= HUNT.sailorMinSteps && !inLantern(LOTUS_CLASSIC, fresh), `spawned at ${fresh.x},${fresh.y}`);
  }
  for (let n = 4; n <= 5; n++) {
    deliver(h);
    assert.deepEqual([h.aboard, h.board.rescued, h.board.sailors.length, h.spawned], [n, n - 3, 6 - n, 6]);
    assert.equal(h.result, null);
  }
  deliver(h);
  assert.deepEqual(h.result && [h.result.winner, h.result.reason, h.result.rescued], ["odysseus", "rescued", 6]);
});

test("a replacement sailor keeps clear of the ship, the lantern light, Odysseus, the hunters and the other sailors", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const h = newHunt(LOTUS_CLASSIC, "normal", plan, seed);
    h.board.player = { x: 7, y: 5 };
    const at = sailorSpot(h), b = h.board, far = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) > 2;
    assert.ok(at, "seed " + seed);
    assert.ok(pathDistances(LOTUS_CLASSIC.maze, LOTUS_CLASSIC.ship)[cell(at)] >= HUNT.sailorMinSteps);
    assert.ok(far(at, b.player) && b.guardians.every(g => far(at, g)));
    assert.ok(![...b.sailors, ...b.pickups, ...b.relics].some(p => p.x === at.x && p.y === at.y));
  }
});

// ---------------------------------------------------------------- Task 5 --
// Soft tie-breaks for the policy, and the result copy.

test("pickAction keeps a clear favourite and shares a close call", () => {
  for (let r = 0; r < 1; r += 0.1) assert.equal(pickAction([5, 0, 0, 0, 0], () => r), 0);
  const seen = new Set(Array.from({ length: 50 }, (_, i) => pickAction([2, 2, -5, -5, -5], () => i / 50)));
  assert.deepEqual([...seen].sort(), [0, 1]);
  assert.equal(pickAction([2, 1.9, 0, 0, 0], () => 0.99), 1);
});

test("describeHunt names the outcome from the hunters' side", () => {
  const base = { ms: 50000, rescued: 1, catches: 3, leaps: 2, sprints: 3, thirdMs: 20000 };
  assert.equal(describeHunt({ ...base, winner: "hunters", reason: "caught" }).headline, "You caught Odysseus");
  assert.match(describeHunt({ ...base, winner: "odysseus", reason: "timeout", rescued: 4, catches: 1 }).why, /4 of 6 sailors aboard, 1 of 3 catches/);
  assert.match(describeHunt({ ...base, winner: "odysseus", reason: "rescued", rescued: 6, catches: 1 }).why, /All 6 sailors came aboard despite 1 catch\./);
  assert.equal(describeHunt({ ...base, winner: "draw", reason: "timeout", rescued: 1, catches: 1 }).headline, "The storm calls it a draw");
  assert.equal(describeHunt({ ...base, winner: "odysseus", reason: "rescued" }).headline, "Odysseus escaped with the crew");
});
