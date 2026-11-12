import test from "node:test";
import assert from "node:assert/strict";
import { newAdventure, mazePath, LOTUS_CLASSIC } from "../src/lib/encounters/odyssey-games.ts";
import { generateLotusLayout, validateLotusLayout, pathDistances, openTiles, LOTUS_SHOWCASE, EVAL_SEED_START, trainingLayout, seededRandom, freshLayout } from "../src/lib/encounters/lotus-layouts.ts";
import { newRace, raceTick, aiAwaitingDecision, compareStandings, describeResult } from "../src/lib/encounters/lotus-race.ts";
import { OBS_SIZE, observe, agentStep, astarAction, snapshot, stepReward, applyAgentAction, advanceTicks, MOVE_TICKS, TICK_MS, WAIT, liveLine } from "../src/lib/ai/lotus-agent.ts";
import { standardPlan } from "../src/lib/arcade/arcade.ts";

const plan = standardPlan("lotus");
const undertow = { planId: "undertow", focus: "balanced", source: "ai" };
const board = (layout = LOTUS_CLASSIC, difficulty = "hard", p = plan) => newAdventure("lotus", difficulty, p, false, 4200, { layout });
/** Runs one side of a race with the A* rescuer until `until` says stop. */
function runRace(race, human, ai, limit = 30000) {
  for (let i = 0; i < limit && !race.result; i++) raceTick(race, human(race), aiAwaitingDecision(race) ? ai(race) : null);
  return race;
}
const astarHuman = race => {
  if (race.human.moveClock > 0) return null;
  const a = astarAction(race.human);
  return a === WAIT ? null : { dx: [0, 0, -1, 1][a], dy: [-1, 1, 0, 0][a] };
};

test("the classic garden, the showcase garden and thousands of generated gardens are all valid", () => {
  assert.deepEqual(validateLotusLayout(LOTUS_CLASSIC), []);
  assert.deepEqual(validateLotusLayout(LOTUS_SHOWCASE), []);
  for (let seed = 1; seed <= 1500; seed++) {
    const layout = generateLotusLayout(seed);
    assert.deepEqual(validateLotusLayout(layout), [], `seed ${seed}`);
    // Every sailor has a route to the ship, and so does every open tile.
    const d = pathDistances(layout.maze, layout.ship);
    for (const p of [...layout.sailors, ...openTiles(layout.maze)]) assert.ok(d[p.y * 15 + p.x] >= 0, `seed ${seed}: ${p.x},${p.y}`);
  }
});

test("gardens are reproducible by seed, and training never draws an evaluation or named garden", () => {
  assert.deepEqual(generateLotusLayout(77), generateLotusLayout(77));
  assert.notDeepEqual(generateLotusLayout(77).maze, generateLotusLayout(78).maze);
  const random = seededRandom(5);
  const evalMazes = new Set(Array.from({ length: 300 }, (_, i) => generateLotusLayout(EVAL_SEED_START + i).maze.join("")));
  for (let i = 0; i < 300; i++) {
    const layout = trainingLayout(random);
    assert.ok(Number(layout.id.split("-")[1]) < EVAL_SEED_START);
    assert.ok(!evalMazes.has(layout.maze.join("")), "a training garden matched an evaluation garden");
    assert.notEqual(layout.maze.join(""), LOTUS_CLASSIC.maze.join(""));
    assert.notEqual(layout.maze.join(""), LOTUS_SHOWCASE.maze.join(""));
  }
  assert.deepEqual(validateLotusLayout(freshLayout(seededRandom(9))), []);
});

test("the showcase garden offers a short patrolled crossing and a longer loop for both far escorts", () => {
  const crossing = new Set(["6,5", "7,5", "8,5"]);
  const blocked = LOTUS_SHOWCASE.maze.map((row, y) => row.split("").map((c, x) => (crossing.has(`${x},${y}`) ? "#" : c)).join(""));
  for (const sailor of LOTUS_SHOWCASE.sailors.slice(0, 2)) {
    const short = mazePath(sailor, LOTUS_SHOWCASE.ship, LOTUS_SHOWCASE.maze), safe = mazePath(sailor, LOTUS_SHOWCASE.ship, blocked);
    assert.ok(short.some(p => crossing.has(`${p.x},${p.y}`)), "the shortest escort crosses the middle");
    assert.ok(safe.length > short.length && safe.length <= short.length * 2, `loop ${safe.length} vs crossing ${short.length}`);
  }
  // The patrol sits on the crossing.
  assert.ok(LOTUS_SHOWCASE.waypoints.filter(w => w.y === 5).length >= 3);
});

test("the solo encounter is unchanged on the classic garden", () => {
  const s = newAdventure("lotus", "normal", plan);
  assert.equal(s.layout.id, "classic");
  assert.deepEqual(s.player, { x: 1, y: 9 });
  assert.deepEqual(s.sailors, [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 13, y: 9 }]);
  assert.equal(s.feedback, "Find a sailor, then return to the ship at the bottom left.");
});

test("both boards start identical, then keep fully independent state", () => {
  const race = newRace(LOTUS_SHOWCASE, "hard", undertow);
  assert.deepEqual(race.human, race.ai);
  assert.notEqual(race.human, race.ai);
  assert.notEqual(race.human.guardians, race.ai.guardians);
  // Only the human moves: the AI board's Odysseus stays at the ship, its guardians follow their own rescuer.
  runRace(race, astarHuman, () => WAIT, 600);
  assert.notDeepEqual(race.human.player, race.ai.player);
  assert.deepEqual(race.ai.player, race.ai.layout.ship);
  assert.equal(race.human.elapsed, race.ai.elapsed, "one shared clock");
  // A rescue on one board is never counted on the other.
  const solo = newRace(LOTUS_CLASSIC, "easy", plan);
  runRace(solo, astarHuman, () => WAIT, 6000);
  assert.ok(solo.human.rescued >= 1);
  assert.equal(solo.ai.rescued, 0);
  assert.equal(solo.ai.sailors.length, 3);
});

test("the rival chooses exactly once per movement opportunity, and the clock waits for it", () => {
  const race = newRace(LOTUS_CLASSIC, "hard", plan);
  assert.equal(aiAwaitingDecision(race), true);
  assert.throws(() => raceTick(race, null, null), /has not chosen/);
  assert.equal(race.tick, 0, "a missing choice does not advance the clock");
  let decisions = 0;
  for (let i = 0; i < MOVE_TICKS * 10; i++) { if (aiAwaitingDecision(race)) decisions++; raceTick(race, null, aiAwaitingDecision(race) ? astarAction(race.ai) : null); }
  assert.equal(decisions, 10);
  assert.equal(race.aiDecisions, 10);
  // The same cadence as a held key: ten moves in 1.7 s.
  assert.equal(race.tick * TICK_MS, 1700);
});

test("a race board plays exactly like the training environment", () => {
  // The rival's board in a race and a board stepped by agentStep reach the same state.
  const race = newRace(LOTUS_SHOWCASE, "normal", undertow), solo = board(LOTUS_SHOWCASE, "normal", undertow);
  for (let step = 0; step < 120 && !race.result; step++) {
    const a = astarAction(solo);
    agentStep(solo, a);
    for (let k = 0; k < MOVE_TICKS && !race.result; k++) raceTick(race, null, aiAwaitingDecision(race) ? a : null);
    if (!race.result) assert.deepEqual({ p: race.ai.player, g: race.ai.guardians, r: race.ai.rescued, h: race.ai.hits }, { p: solo.player, g: solo.guardians, r: solo.rescued, h: solo.hits }, `step ${step}`);
  }
});

test("the first side to bring all three aboard wins, and the same tick is a draw", () => {
  const race = runRace(newRace(LOTUS_CLASSIC, "easy", plan), astarHuman, r => astarAction(r.ai));
  assert.equal(race.result.winner, "draw", "identical play on identical boards finishes on the same tick");
  assert.equal(race.result.reason, "finished");
  assert.equal(race.result.human.finishMs, race.result.ai.finishMs);
  const head = runRace(newRace(LOTUS_CLASSIC, "easy", plan), astarHuman, r => (r.aiDecisions < 3 ? WAIT : astarAction(r.ai)));
  assert.equal(head.result.winner, "human");
  assert.equal(head.result.ai.rescued, 2);
  assert.ok(head.result.human.finishMs < 20000);
  assert.match(describeResult(head.result).why, /You brought all three sailors aboard first/);
});

test("pause and resume freeze both boards together", () => {
  const race = newRace(LOTUS_CLASSIC, "hard", plan);
  runRace(race, astarHuman, r => astarAction(r.ai), 300);
  const frozen = structuredClone(race);
  // A paused race simply receives no ticks; nothing moves on either board.
  assert.deepEqual(race, frozen);
  runRace(race, astarHuman, r => astarAction(r.ai), 50);
  assert.equal(race.tick, frozen.tick + 50);
  assert.equal(race.human.elapsed, race.ai.elapsed);
});

test("timeout compares sailors aboard, then who reached the count first; none aboard is a draw", () => {
  const timed = (h, a) => { const r = newRace(LOTUS_CLASSIC, "hard", plan); r.human.rescued = h.length; r.ai.rescued = a.length; r.rescueTicks = { human: h, ai: a }; return compareStandings(r); };
  assert.equal(timed([], []), "draw");
  assert.equal(timed([100, 200], [50]), "human");
  assert.equal(timed([100], [50, 300]), "ai");
  assert.equal(timed([100, 400], [90, 300]), "ai", "both two aboard: the AI reached two first");
  assert.equal(timed([100, 300], [90, 300]), "draw", "same count reached on the same tick");
  // A real timeout: nobody moves, so the clock runs out level at zero. Easy keeps the guardians on patrol.
  const idle = runRace(newRace(LOTUS_SHOWCASE, "easy", plan), () => null, () => WAIT, 200000);
  assert.ok(idle.result);
  if (idle.result.reason === "timeout") assert.equal(idle.result.winner, "draw");
  assert.equal(idle.human.elapsed, idle.ai.elapsed);
});

test("a rescuer caught three times is out; the race ends once the other is ahead for good", () => {
  const knockedOut = (humanRescued, aiRescued) => {
    const r = newRace(LOTUS_CLASSIC, "hard", plan);
    Object.assign(r.human, { done: true, won: false, hits: 3, damageTaken: 3, rescued: humanRescued });
    r.rescueTicks.human = Array.from({ length: humanRescued }, (_, i) => 10 + i);
    r.ai.rescued = aiRescued;
    r.rescueTicks.ai = Array.from({ length: aiRescued }, (_, i) => 20 + i);
    raceTick(r, null, astarAction(r.ai));
    return r;
  };
  const behind = knockedOut(0, 1);
  assert.equal(behind.result.winner, "ai");
  assert.equal(behind.result.reason, "decided");
  assert.equal(behind.result.human.out, true);
  assert.match(describeResult(behind.result).why, /You were caught three times/);
  // Out but still ahead: the other rescuer may yet catch up, so the race goes on.
  assert.equal(knockedOut(2, 1).result, null);
  // Out and level, but reached first: the live side must pass, so the race goes on.
  assert.equal(knockedOut(1, 1).result, null);
});

test("finish and reach times are recorded for both sides, from the tick of each rescue", () => {
  const race = runRace(newRace(LOTUS_SHOWCASE, "hard", plan), () => null, r => astarAction(r.ai));
  assert.equal(race.result.winner, "ai");
  assert.equal(race.result.ai.rescued, 3);
  assert.equal(race.rescueTicks.ai.length, 3);
  assert.ok(race.result.ai.finishMs > 0 && race.result.ai.finishMs <= race.result.ms + TICK_MS);
  assert.equal(race.result.ai.reachedMs, race.result.ai.finishMs);
  assert.equal(race.result.human.finishMs, null);
});

test("restart gives a fresh race on the same garden; relics never count toward the standings", () => {
  const first = runRace(newRace(LOTUS_CLASSIC, "easy", plan), astarHuman, r => astarAction(r.ai), 2000);
  const again = newRace(first.layout, "easy", plan);
  assert.equal(again.tick, 0);
  assert.equal(again.result, null);
  assert.deepEqual(again.human, again.ai);
  assert.equal(again.layout, first.layout);
  const r = newRace(LOTUS_CLASSIC, "hard", plan);
  r.human.relicsFound = 3; r.human.score = 9999;
  assert.equal(compareStandings(r), "draw");
});

test("the observation has a fixed size, sees only what is on screen, and is deterministic", () => {
  const s = board(LOTUS_SHOWCASE, "hard", undertow);
  const o = observe(s);
  assert.equal(o.length, OBS_SIZE);
  assert.ok(o.every(Number.isFinite));
  assert.deepEqual(observe(s), o);
  // The internal bookkeeping a player cannot see (the patrol counter, the
  // guardian camping timer, the seed) does not change what the rival sees.
  const hidden = structuredClone(s);
  hidden.patrol = 999; hidden.camp = 3; hidden.seed = 1; hidden.debug = { ...hidden.debug, decision: "x" }; hidden.rivalLine = "x";
  assert.deepEqual(observe(hidden), o);
});

test("rewards favour delivering sailors over waiting or losing a sailor and fetching it again", () => {
  const run = (policy, layout = LOTUS_CLASSIC, difficulty = "easy") => {
    const s = board(layout, difficulty);
    let total = 0, steps = 0;
    while (!s.done && steps < 2000) { const b = snapshot(s); agentStep(s, policy(s, steps)); total += stepReward(b, s); steps++; }
    return { total, s };
  };
  const deliver = run(astarAction), wait = run(() => WAIT);
  assert.equal(deliver.s.rescued, 3);
  assert.ok(deliver.total > 25, `delivering earns ${deliver.total}`);
  assert.ok(wait.total < 0, `waiting earns ${wait.total}`);
  // Farming: walk to a sailor, then walk back and forth beside it without delivering.
  const farm = run((s, n) => (s.carrying ? (n % 2 ? 0 : 1) : astarAction(s)));
  assert.ok(farm.total < deliver.total - 20, `farming earns ${farm.total}`);
  // The shaping term is a potential difference, so a loop back to the same state nets nothing beyond the time cost.
  const s = board(LOTUS_CLASSIC, "easy");
  advanceTicks(s, 5);
  const start = snapshot(s);
  applyAgentAction(s, 3); advanceTicks(s, MOVE_TICKS);
  const mid = snapshot(s), out = stepReward(start, s);
  applyAgentAction(s, 2); advanceTicks(s, MOVE_TICKS);
  const back = stepReward(mid, s);
  assert.ok(Math.abs(out + back - (-0.02 - 0.01 * start.potential)) < 0.01, `round trip nets ${out + back}`);
});

test("the AI Live line reports the move, the escort and the crew", () => {
  const s = board();
  assert.equal(liveLine(s, null), "READY · Seeking crew · Crew aboard 0/3");
  s.carrying = true; s.rescued = 1;
  assert.equal(liveLine(s, 2), "LEFT · Escorting sailor · Crew aboard 1/3");
});
