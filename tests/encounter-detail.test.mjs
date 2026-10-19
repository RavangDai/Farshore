import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, tickGame, gameAction, gameSummary } from '../src/lib/arcade-runtime.ts';
import { standardPlan } from '../src/lib/arcade.ts';
import { mazePath, LOTUS_SHIP } from '../src/lib/odyssey-games.ts';

const create = id => createGame(id, 'normal', standardPlan(id), false, 17);
const advance = (s, ms = 250) => { for (let i = 0; i < ms; i += 50) s = tickGame(s, 50); return s; };
const walkTo = (s, target) => {
  for (const tile of mazePath(s.player, target)) s = advance(gameAction(s, { type: 'move', dx: tile.x - s.player.x, dy: tile.y - s.player.y }));
  return s;
};

test('optional lotus relics are reachable, score once, and do not substitute for a rescue', () => {
  let s = { ...create('lotus'), guardians: [], sailors: [] };
  for (const p of s.relics) assert.ok(mazePath(LOTUS_SHIP, p).length);
  const first = s.relics[0]; s = walkTo(s, first);
  assert.equal(s.relicsFound, 1); assert.ok(s.score >= 125); assert.equal(s.rescued, 0); assert.equal(s.won, false);
  const score = s.score; s = walkTo(walkTo(s, LOTUS_SHIP), first);
  assert.equal(s.score, score); assert.equal(s.relicsFound, 1);
});

test('runner skill rewards require the correct action; coins never cause damage or repeat', () => {
  const initial = create('cyclops');
  const incoming = kind => ({ ...initial, obstacles: [{ lane: 1, kind, remaining: 1, warning: 3100 }] });
  const precise = tickGame(gameAction(incoming('crate'), { type: 'jump' }), 50);
  assert.equal(precise.precision, 1); assert.equal(precise.score, 200); assert.equal(precise.hits, 0);
  const dodge = tickGame(gameAction(incoming('crate'), { type: 'move', dx: 1, dy: 0 }), 50);
  assert.equal(dodge.precision, 0); assert.equal(dodge.score, 100);
  const missed = tickGame(incoming('crate'), 50); assert.equal(missed.hits, 1); assert.equal(missed.precision, 0);
  const coin = tickGame(incoming('coin'), 50); assert.equal(coin.coins, 1); assert.equal(coin.score, 50); assert.equal(coin.hits, 0);
  assert.equal(advance(coin).score, 50);
  const bypass = tickGame({ ...incoming('coin'), lane: 0 }, 50); assert.equal(bypass.coins, 0); assert.equal(bypass.hits, 0);
});

test('perfect wind passages require a collected blessing and an untouched gate', () => {
  const initial = create('aeolus');
  const passage = (collected, hit = false) => tickGame({ ...initial, gates: [{ x: 111, center: 200, gap: 200, passed: false, pickup: 'wind', collected, hit }] }, 50);
  const perfect = passage(true); assert.equal(perfect.perfectPasses, 1); assert.equal(perfect.score, 125);
  assert.equal(advance(perfect).perfectPasses, 1); assert.equal(advance(perfect).score, 125);
  assert.equal(passage(false).perfectPasses, 0); assert.equal(passage(true, true).perfectPasses, 0);
});

test('driftwood follows timber centers and cannot be farmed by hopping on the same row', () => {
  let s = { ...create('calypso'), x: 2.05, rows: Array.from({ length: 7 }, () => ({ offset: 0, speed: 0, width: 4.1 })) };
  s = gameAction(s, { type: 'move', dx: 0, dy: -1 }); assert.equal(s.wood, 1); assert.equal(s.score, 75);
  s = gameAction(advance(s), { type: 'move', dx: -1, dy: 0 });
  s = gameAction(advance(s), { type: 'move', dx: 1, dy: 0 });
  assert.equal(s.wood, 1); assert.equal(s.score, 75); assert.deepEqual(s.gatheredRows, [1]);
});

test('shore repairs consume three materials without erasing lifetime damage or awarding victory', () => {
  const initial = create('calypso');
  const repaired = gameAction({ ...initial, row: 7, x: 2.05, wood: 3, hits: 1, damageTaken: 1 }, { type: 'move', dx: 0, dy: -1 });
  assert.equal(repaired.hits, 0); assert.equal(repaired.wood, 0); assert.equal(gameSummary(repaired).hits, 1);
  assert.equal(repaired.progress, 1); assert.equal(repaired.won, false); assert.deepEqual(repaired.gatheredRows, []);
  const insufficient = gameAction({ ...initial, row: 7, wood: 2, hits: 1 }, { type: 'move', dx: 0, dy: -1 });
  assert.equal(insufficient.hits, 1); assert.equal(insufficient.wood, 2);
});

test('centered shield parries reward precision; edge reflections retain their original protection', () => {
  const initial = create('scylla');
  const parry = offset => tickGame({ ...initial, paddle: 200, strikes: [{ x: 301, y: 200 + offset, vx: -100, vy: 0, reflected: false, head: 0 }] }, 50);
  const center = parry(0), edge = parry(25);
  assert.equal(center.score, 200); assert.equal(edge.score, 100); assert.equal(center.successes, 1); assert.equal(edge.successes, 1);
  assert.ok(center.boat > edge.boat); assert.equal(center.hits, 0); assert.equal(edge.hits, 0);
  assert.equal(center.strikes[0].reflected, true);
});
