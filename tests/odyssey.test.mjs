import test from 'node:test';
import assert from 'node:assert/strict';
import { trials, newArcade, standardPlan, adaptivePlan, finishAttempt, readArcade, unlocked, medalFor, totalScore } from '../src/lib/arcade.ts';
import { createGame, tickGame, gameAction, gameSummary, isAdventure, demonstrate } from '../src/lib/arcade-runtime.ts';
import { mazePath, LOTUS_SHIP, walkable, onTimber, newAdventure, tickAdventure, adventureAction, adventureSummary } from '../src/lib/odyssey-games.ts';

const difficulties = ['easy', 'normal', 'hard'];
const advance = (state, ms) => { for (let time = 0; time < ms && !state.done; time += 50) state = tickGame(state, Math.min(50, ms - time)); return state; };
test('eight encounter engines initialize deterministically and own their clocks', () => {
  assert.deepEqual(trials.map(t => t.id), ['lotus', 'cyclops', 'aeolus', 'circe', 'sirens', 'scylla', 'calypso', 'bow']);
  for (const trial of trials) for (const difficulty of difficulties) {
    const game = createGame(trial.id, difficulty, standardPlan(trial.id), false, 17);
    assert.equal(game.id, trial.id);
    assert.deepEqual(game, createGame(trial.id, difficulty, standardPlan(trial.id), false, 17));
    assert.equal(tickGame(game, NaN), game);
    assert.equal(tickGame(game, -1), game);
    assert.equal(tickGame(game, 50000).elapsed, 100);
    assert.equal(game.elapsed, 0);
    assert.equal(gameSummary(game).won, false);
  }
});
test('campaign unlocks exactly the next shore and keeps medals through failed replays', () => {
  let save = { ...newArcade(), started: true };
  const summary = { won: true, source: 'standard', hits: 0, successes: 3, early: 0, late: 0, misses: 0, laneMs: [0, 0, 0], score: 1200, timeMs: 75000, difficulty: 'normal' };
  for (let i = 0; i < trials.length; i++) {
    const id = trials[i].id;
    assert.equal(unlocked(save, id), true);
    if (i + 1 < trials.length) assert.equal(unlocked(save, trials[i + 1].id), false);
    const failed = finishAttempt(save, id, { ...summary, won: false });
    if (i + 1 < trials.length) assert.equal(unlocked(failed, trials[i + 1].id), false);
    save = finishAttempt(failed, id, summary);
    assert.deepEqual(readArcade(JSON.stringify(save)), save);
    const replay = finishAttempt(save, id, { ...summary, won: false, score: 20 });
    assert.equal(replay.records[id].cleared, 'cleared');
    assert.equal(replay.records[id].bests.normal.score, 1200);
    assert.equal(replay.records[id].bests.normal.medal, 'gold');
  }
  assert.equal(totalScore(save), 9600);
  assert.equal(medalFor({ hits: 1, misses: 1 }), 'silver');
});
test('every lotus sailor and moly pickup has a route to the ship', () => {
  const game = createGame('lotus', 'easy', standardPlan('lotus'), false, 4200);
  for (const target of [...game.sailors, ...game.pickups, ...game.guardians]) {
    const path = mazePath(LOTUS_SHIP, target);
    assert.ok(path.length > 0, JSON.stringify(target));
    assert.ok(path.every(walkable));
    assert.deepEqual(path.at(-1), target);
  }
});
test('lotus rescue, time expiry, damage defeat and completed input are distinct', () => {
  let game = createGame('lotus', 'easy', standardPlan('lotus'), true, 4200);
  // Exercise the rescue route with the patrol outside the measured route.
  game = { ...game, guardians: [] };
  for (const target of [game.sailors[0], LOTUS_SHIP]) {
    for (const tile of mazePath(game.player, target)) {
      game = gameAction(game, { type: 'move', dx: tile.x - game.player.x, dy: tile.y - game.player.y });
      game = advance(game, 200);
    }
  }
  assert.equal(game.won, true); assert.equal(gameSummary(game).won, true);
  assert.equal(tickGame(game, 50), game);
  assert.equal(gameAction(game, { type: 'move', dx: 1, dy: 0 }), game);
  const initial = createGame('lotus', 'easy', standardPlan('lotus'), false, 4200);
  const expired = tickGame({ ...initial, elapsed: initial.duration - 1 }, 50);
  assert.equal(expired.done, true); assert.equal(expired.won, false);
  const caught = gameAction({ ...initial, hits: 2, guardians: [{ x: 2, y: 9 }] }, { type: 'move', dx: 1, dy: 0 });
  assert.equal(caught.done, true); assert.equal(caught.won, false);
});
// The preserved lane engine. The live Cyclops encounter is the perspective
// runner in encounters/cave-runner.ts, covered by tests/cave-runner.test.mjs.
test('the preserved lane engine is escapable at every difficulty and failed camping loses', () => {
  const laneAdvance = (state, ms) => { for (let time = 0; time < ms && !state.done; time += 50) state = tickAdventure(state, Math.min(50, ms - time)); return state; };
  for (const difficulty of difficulties) for (const seed of [19, 4200, 999]) {
    let game = newAdventure('cyclops', difficulty, adaptivePlan('cyclops'), false, seed);
    while (!game.done) {
      const incoming = game.obstacles.filter(o => o.kind !== 'sheep' && o.remaining < 1100);
      const safe = [0, 1, 2].find(lane => !incoming.some(o => o.lane === lane));
      if (safe !== undefined) while (game.lane !== safe) game = adventureAction(game, { type: 'move', dx: game.lane < safe ? 1 : -1, dy: 0 });
      game = tickAdventure(game, 50);
    }
    assert.equal(game.won, true, `${difficulty}, seed ${seed}`);
    assert.equal(game.hits, 0);
  }
  const idle = laneAdvance(newAdventure('cyclops', 'easy', standardPlan('cyclops'), false, 19), 75000);
  assert.equal(idle.won, false);
  assert.equal(adventureSummary(idle).won, false);
});
test('wind gates are traversable by a bounded feedback controller', () => {
  for (const difficulty of difficulties) {
    let game = createGame('aeolus', difficulty, adaptivePlan('aeolus'), false, 19);
    while (!game.done) {
      const next = game.gates.find(g => g.x > 105), target = next?.center ?? 200;
      if (game.y > target + 8 && game.vy > -80) game = gameAction(game, { type: 'lift' });
      game = tickGame(game, 50);
    }
    assert.equal(game.won, true, difficulty);
  }
});
test('raft rows have legal timbers and standing still eventually fails', () => {
  for (const difficulty of difficulties) {
    let game = createGame('calypso', difficulty, standardPlan('calypso'), false, 17);
    assert.ok(isAdventure(game));
    for (let row = 1; row <= 7; row++) {
      assert.ok(Array.from({ length: 65 }, (_, i) => .3 + i * .1).some(x => onTimber(game, x, row)));
    }
    game = advance(game, game.duration);
    assert.equal(game.done, true); assert.equal(game.won, false);
  }
});

test('the preserved lane engine keeps its jump, slide, heal and damage rules', () => {
  const initial = newAdventure('cyclops', 'normal', standardPlan('cyclops'), false, 17);
  const obstacle = kind => ({ ...initial, obstacles: [{ lane: 1, kind, remaining: 1, warning: 3100 }] });
  assert.equal(tickAdventure(adventureAction(obstacle('crate'), { type: 'jump' }), 50).hits, 0);
  assert.equal(tickAdventure(adventureAction(obstacle('beam'), { type: 'slide' }), 50).hits, 0);
  assert.equal(tickAdventure(adventureAction(obstacle('gap'), { type: 'jump' }), 50).hits, 0);
  const hit = tickAdventure(obstacle('rock'), 50);
  assert.equal(hit.hits, 1); assert.equal(hit.damageTaken, 1);
  const healed = tickAdventure({ ...hit, obstacles: [{ lane: 1, kind: 'sheep', remaining: 1, warning: 3100 }] }, 50);
  assert.equal(healed.hits, 0); assert.equal(adventureSummary(healed).hits, 1);
  assert.equal(adventureSummary({ ...initial, won: true }).won, false);
});

test('raft crossings are winnable through visible timber landings at every difficulty', () => {
  for (const difficulty of difficulties) {
    let game = createGame('calypso', difficulty, standardPlan('calypso'), false, 17);
    game = gameAction(game, { type: 'move', dx: -1, dy: 0 });
    for (let frames = 0; !game.done && frames < 3000; frames++) {
      if (game.moveClock <= 0 && onTimber(game, game.x, game.row + 1, 250)) game = gameAction(game, { type: 'move', dx: 0, dy: -1 });
      else if (game.moveClock <= 0) {
        const direction = [-1, 1].find(dx => game.x + dx > .3 && game.x + dx < 6.7 && onTimber(game, game.x + dx, game.row, 250) && onTimber(game, game.x + dx, game.row + 1, 500));
        if (direction) game = gameAction(game, { type: 'move', dx: direction, dy: 0 });
      }
      game = tickGame(game, 50);
    }
    assert.equal(game.won, true, difficulty);
    assert.equal(game.progress, 5);
  }
});

test('the A* rescue demonstration reaches a valid practice victory without changing a campaign', () => {
  let game = createGame('lotus', 'easy', standardPlan('lotus'), true, 17);
  for (let frames = 0; !game.done && frames < 1600; frames++) game = tickGame(demonstrate(game), 50);
  assert.equal(game.done, true); assert.equal(game.won, true); assert.equal(game.practice, true);
});

test('five-stop saves migrate without losing clears or awarding medals to new islands', () => {
  const old = { version: 2, started: true, legacy: false, records: Object.fromEntries(['cyclops', 'circe', 'sirens', 'scylla', 'bow'].map(id => [id, { cleared: 'cleared', attempts: 1, recent: [] }])) };
  const save = readArcade(JSON.stringify(old));
  assert.equal(save.version, 3); assert.equal(save.legacy, true);
  for (const id of ['cyclops', 'circe', 'sirens', 'scylla', 'bow']) { assert.equal(save.records[id].cleared, 'cleared'); assert.equal(unlocked(save, id), true); }
  for (const id of ['lotus', 'aeolus', 'calypso']) { assert.equal(save.records[id].cleared, 'pending'); assert.deepEqual(save.records[id].bests, {}); }
  old.records.circe.cleared = 'pending'; assert.equal(readArcade(JSON.stringify(old)), null);
});
