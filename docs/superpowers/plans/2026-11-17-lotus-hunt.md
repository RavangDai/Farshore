# The Lotus Hunt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new exhibition mode where the shipped PPO Odysseus plays the lotus garden and the human drives the guardians to catch him, with a summonable third hunter that unseals Odysseus's hedge-leap.

**Architecture:** A pure, tested rules module (`lotus-hunt.ts`) wraps one `LotusState` board: the policy's action (or the leap rule) moves Odysseus, the human's key moves the possessed hunter, and the existing `lotusTickInPlace` moves the other hunters with the possessed index held still. A React screen modelled on the Rescue Race runs the 10 ms clock, waits for the ONNX policy, and paints the board plus hunt overlays. `ArcadeApp` gains a `hunt` run beside `race`.

**Tech Stack:** TypeScript, React (Next.js app, see AGENTS.md), onnxruntime-web (already wired by `lotus-onnx.ts`), Node's test runner with `--experimental-strip-types` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-17-lotus-hunt-design.md`

## Global Constraints

- No retraining, no new observation version, no change to `observe()`, `ACTIONS` or the ONNX export.
- `lotusTickInPlace(s, dt)` with no third argument must behave exactly as today: the race, the training server (`training/lotus_env_server.mjs`) and `tests/lotus-race.test.mjs` depend on it.
- Rule values from the spec: tick 10 ms; Odysseus decides every 17 ticks; clock 120 000 ms; summon 3000 ms; leave 3000 ms; possessed step 190/220/250 ms (easy/normal/hard); board difficulty for the scripted hunters hard/normal/easy (easy/normal/hard hunt); leap cooldown 12 000/10 000/7000 ms; cornered = no safe route and a hunter within Manhattan 2; summon spot farther than Manhattan 3 from Odysseus; tie-break share 0.35.
- The lantern light is the ship tile and its four orthogonal neighbours; only the human's hunter and the summon spot respect it.
- Copy: mode name "The Lotus Hunt"; briefing button "Hunt the trained AI" with small print "You play the guardians · not saved"; the trained side is "ODYSSEUS · TRAINED AI"; the human side is "YOU · HUNTERS".
- Keys: Arrows/WASD move; Tab or Q cycles; 1/2/3 select; Space summons or dismisses; Escape pauses. Tab must `preventDefault` so focus does not leave the stage.
- Do not commit. The user commits their own work (see memory: no commits unless asked). Leave the tree with the new and modified files in place.
- Run `npx tsc --noEmit -p .` only when `npm run dev` is not restarting (memory: next.config edits race the build); the dev server is not touched by this plan.

## Review Focus

Inputs the spec implies that a player will hit; each has a test in the task named.

1. Space while the third hunter is arriving or leaving: nothing changes (Task 3).
2. The human's hunter pressed into a hedge or the lantern light: no move, no step cooldown spent (Task 2).
3. Odysseus under moly protection in a corner: no leap, since he is not in danger (Task 4).
4. Cornered with no hedge to jump (every straight-line landing blocked): no leap, he stays cornered (Task 4).
5. The third hunter's rise tile occupied by or beside Odysseus when its 3 s are up: it waits, it never catches by rising (Task 3).

---

### Task 1: Hold a hunter still in the shared garden rules

**Files:**
- Modify: `src/lib/encounters/odyssey-games.ts` (`checkLotus` at ~line 90, `lotusTickInPlace` at ~line 117)
- Modify: `src/lib/ai/lotus-agent.ts` (`cell` ~line 41, `safeDistances` ~line 197)
- Test: `tests/lotus-hunt.test.mjs` (new)

**Interfaces:**
- Produces: `lotusTickInPlace(s: LotusState, dt: number, held?: ReadonlySet<number>): void`. Guardian indices in `held` are not moved by the guard step and their `s.lastGuardians[i]` entry is kept rather than reset.
- Produces: `export function lotusCheckInPlace(s: LotusState): void` (today's private `checkLotus`, unchanged body).
- Produces from `lotus-agent.ts`: `export const cell = (p: Point) => number` and `export function safeDistances(s: LotusState): Int16Array` (both exist privately today).

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { newAdventure, lotusTickInPlace, lotusCheckInPlace, LOTUS_CLASSIC } from "../src/lib/encounters/odyssey-games.ts";
import { safeDistances, cell } from "../src/lib/ai/lotus-agent.ts";
import { standardPlan } from "../src/lib/arcade/arcade.ts";

const plan = standardPlan("lotus");
const board = (difficulty = "normal") => newAdventure("lotus", difficulty, plan, false, 4200, { layout: LOTUS_CLASSIC });

test("a held guardian stays put and keeps its last-step direction while the others patrol", () => {
  const s = board("hard");
  const start = s.guardians.map(p => ({ ...p }));
  s.lastGuardians = [{ x: start[0].x - 1, y: start[0].y }, { ...start[1] }];
  for (let i = 0; i < 70; i++) lotusTickInPlace(s, 10, new Set([0]));   // 700 ms > the 600 ms hard interval
  assert.deepEqual(s.guardians[0], start[0]);
  assert.notDeepEqual(s.guardians[1], start[1]);
  assert.deepEqual(s.lastGuardians[0], { x: start[0].x - 1, y: start[0].y });
});

test("without a held set the guard step is unchanged: both guardians move", () => {
  const s = board("hard"), start = s.guardians.map(p => ({ ...p }));
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test tests/lotus-hunt.test.mjs`
Expected: FAIL, `lotusCheckInPlace` / `safeDistances` / `cell` are not exported.

- [ ] **Step 3: Implement in `odyssey-games.ts`**

Rename `checkLotus` to `export function lotusCheckInPlace` (update its two call sites). Add the `held` parameter to `lotusTickInPlace`; inside the guard step, build `s.lastGuardians` as `s.guardians.map((p, i) => held?.has(i) && s.lastGuardians?.[i] ? s.lastGuardians[i] : { ...p })`, and in the `s.guardians.map((guard, i) => ...)` return `guard` at once when `held?.has(i)` (before any targeting, so `rivalLine`/`debug` are not written for it).

- [ ] **Step 4: Export `cell` and `safeDistances` in `lotus-agent.ts`**

Add `export` to both; no body change.

- [ ] **Step 5: Run the new tests and the whole suite**

Run: `npm test`
Expected: all PASS, including `tests/lotus-race.test.mjs` and `tests/lotus-onnx.test.mjs` unchanged.

---

### Task 2: Hunt state, the human's hunter, catches and standings

**Files:**
- Create: `src/lib/encounters/lotus-hunt.ts`
- Test: `tests/lotus-hunt.test.mjs`

**Interfaces:**
- Consumes: Task 1's `lotusTickInPlace(s, dt, held)`, `lotusCheckInPlace`; `newAdventure`, `walkable`, `type LotusLayout`, `type LotusState`, `type Point` from `odyssey-games.ts`; `applyAgentAction`, `MOVE_TICKS`, `TICK_MS` from `lotus-agent.ts`; `type Difficulty`, `type OpponentPlan` from `arcade.ts`.
- Produces (all exported from `lotus-hunt.ts`):

```ts
export type HuntSide = "hunters" | "odysseus";
export type ThirdPhase = "away" | "arriving" | "out" | "leaving";
export type HuntEventKind = "catch" | "rescue" | "leap" | "summon" | "risen" | "dismiss" | "gone";
export type HuntEvent = { tick: number; kind: HuntEventKind; from?: Point; to?: Point };
export type HuntResult = { winner: HuntSide | "draw"; reason: "caught" | "rescued" | "timeout"; ms: number; rescued: number; catches: number; leaps: number; thirdMs: number };
export type LotusHunt = {
  tick: number; layout: LotusLayout; difficulty: Difficulty; board: LotusState;
  possessed: number; stepClock: number;
  third: { phase: ThirdPhase; ms: number; at: Point | null };
  leapCooldown: number; leaps: number; lastLeap: { from: Point; to: Point; tick: number } | null; thirdTicks: number;
  aiNextDecision: number; aiLastAction: number | null; aiDecisions: number;
  events: HuntEvent[]; result: HuntResult | null;
};
export const HUNT: {
  clockMs: 120000; summonMs: 3000; leaveMs: 3000; cornerRange: 2; summonKeepAway: 3; tieShare: 0.35;
  stepMs: Record<Difficulty, number>;            // easy 190, normal 220, hard 250
  boardDifficulty: Record<Difficulty, Difficulty>; // easy "hard", normal "normal", hard "easy"
  leapCooldownMs: Record<Difficulty, number>;    // easy 12000, normal 10000, hard 7000
};
export function newHunt(layout: LotusLayout, difficulty: Difficulty, plan: OpponentPlan): LotusHunt;
export const huntAwaitingDecision: (h: LotusHunt) => boolean;   // !result && !board.done && tick >= aiNextDecision
export const inLantern: (layout: LotusLayout, p: Point) => boolean;
export function canStepTo(h: LotusHunt, p: Point): boolean;      // walkable && !inLantern
export function possess(h: LotusHunt, index: number): boolean;   // false unless 0 <= index < board.guardians.length
export function cycleHunter(h: LotusHunt): void;                 // possessed = (possessed + 1) % guardians.length
export function huntTick(h: LotusHunt, move: { dx: number; dy: number } | null, aiAction: number | null): void;
```

`newHunt` builds `board = newAdventure("lotus", HUNT.boardDifficulty[difficulty], plan, false, 4200, { layout })`, sets `board.duration = HUNT.clockMs`, `possessed = 0`, third `{ phase: "away", ms: 0, at: null }`.

`huntTick` order (the race's `raceTick` is the model): throw `new Error("Odysseus has not chosen his move for this tick.")` when awaiting and `aiAction === null`; if awaiting, apply the policy move with `applyAgentAction(board, aiAction)` (Task 4 puts the leap check in front of this) and advance `aiLastAction/aiDecisions/aiNextDecision`; if `move` and `stepClock <= 0` and `!board.done`, step the possessed hunter when `canStepTo` (record `lastGuardians[possessed]`, set `stepClock = HUNT.stepMs[difficulty]`, then `lotusCheckInPlace(board)`); decrement `stepClock`; `lotusTickInPlace(board, TICK_MS, new Set([possessed]))`; push `catch`/`rescue` events when `board.hits`/`board.rescued` grew; settle `result`; `tick++`.

`result`: `board.won` -> odysseus/rescued; `board.done && board.hits >= 3` -> hunters/caught; `board.done` otherwise -> timeout with winner by `rescued` vs `hits`, equal is `"draw"`. `ms = tick * TICK_MS`, `thirdMs = thirdTicks * TICK_MS`.

- [ ] **Step 1: Write the failing tests**

```js
import { newHunt, huntTick, huntAwaitingDecision, possess, cycleHunter, canStepTo, inLantern, HUNT } from "../src/lib/encounters/lotus-hunt.ts";
import { WAIT } from "../src/lib/ai/lotus-agent.ts";

const hunt = (difficulty = "normal", layout = LOTUS_CLASSIC) => newHunt(layout, difficulty, plan);
/** Advances `n` ticks; Odysseus waits whenever asked; the human holds `move`. */
const run = (h, n, move = null) => { for (let i = 0; i < n && !h.result; i++) huntTick(h, move, huntAwaitingDecision(h) ? WAIT : null); };

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
  run(h, 1, { dx: 0, dy: -1 });   // (3,8) is a hedge
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
  const h = hunt();
  run(h, 12001);
  assert.deepEqual([h.result.winner, h.result.reason], ["draw", "timeout"]);
  const g = hunt(); g.board.hits = 1; run(g, 12001);
  assert.equal(g.result.winner, "hunters");
  const o = hunt(); o.board.rescued = 2; o.board.hits = 1; run(o, 12001);
  assert.equal(o.result.winner, "odysseus");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --experimental-strip-types --test tests/lotus-hunt.test.mjs`
Expected: FAIL, cannot find module `lotus-hunt.ts`.

- [ ] **Step 3: Implement `lotus-hunt.ts` as specified in Interfaces**

Keep the third-hunter and leap fields in the state now (initialised, not yet driven). A `settle(h)` helper fills `result`.

- [ ] **Step 4: Run the tests**

Run: `node --experimental-strip-types --test tests/lotus-hunt.test.mjs`
Expected: PASS.

---

### Task 3: The third hunter

**Files:**
- Modify: `src/lib/encounters/lotus-hunt.ts`
- Test: `tests/lotus-hunt.test.mjs`

**Interfaces:**
- Consumes: `pathDistances`, `openTiles` from `lotus-layouts.ts`; `layout.waypoints`.
- Produces:

```ts
export function summonSpot(h: LotusHunt): Point | null;
export function toggleThird(h: LotusHunt): void;
export const leapLive: (h: LotusHunt) => boolean;   // phase === "out" || phase === "leaving"
```

`summonSpot`: candidates are `layout.waypoints`, else `openTiles(layout.maze)` when no waypoint qualifies; a tile qualifies when it is open, not in the lantern, no hunter stands on it, and its Manhattan distance to `board.player` is greater than `HUNT.summonKeepAway`; pick the greatest `pathDistances(maze, board.player)` value (ties: first in list). `toggleThird`: `away` -> `arriving` with `ms = HUNT.summonMs`, `at = summonSpot(h)` (do nothing when null), event `summon`; `out` -> `leaving` with `ms = HUNT.leaveMs`, event `dismiss`; `arriving`/`leaving` -> nothing. In `huntTick`, after the moves: count `thirdTicks` while `leapLive`; decrement `third.ms`; when `arriving` and `ms <= 0`: if `board.player` is on or orthogonally beside `at`, hold; else push `{ ...at }` to `board.guardians` and to `board.lastGuardians` (create the array if absent), phase `out`, event `risen`; when `leaving` and `ms <= 0`: splice index 2 from both arrays, phase `away`, `at = null`, if `possessed === 2` then `possessed = 0`, event `gone`.

- [ ] **Step 1: Write the failing tests**

```js
import { toggleThird, summonSpot, leapLive } from "../src/lib/encounters/lotus-hunt.ts";

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
  run(h, 300); possess(h, 2);
  toggleThird(h); assert.equal(h.third.phase, "leaving"); assert.equal(leapLive(h), true);
  toggleThird(h); assert.equal(h.third.phase, "leaving");
  run(h, 300);
  assert.equal(h.third.phase, "away"); assert.equal(h.board.guardians.length, 2); assert.equal(h.possessed, 0);
  assert.equal(leapLive(h), false); assert.equal(h.thirdTicks, 300);
  toggleThird(h); assert.equal(h.third.phase, "arriving", "it can be summoned again at once");
});

test("the third hunter waits while Odysseus stands on or beside its rise tile", () => {
  const h = hunt(); toggleThird(h);
  h.board.player = { ...h.third.at };
  run(h, 320);
  assert.equal(h.third.phase, "arriving"); assert.equal(h.board.hits, 0);
  h.board.player = { ...LOTUS_CLASSIC.ship };
  run(h, 1);
  assert.equal(h.third.phase, "out");
});

test("with no legal rise tile, Space is ignored", () => {
  const h = hunt("normal", { ...LOTUS_CLASSIC, waypoints: [{ x: 2, y: 9 }, { x: 1, y: 8 }, { x: 1, y: 9 }] });
  h.board.player = { x: 7, y: 5 };
  // Every open tile is reachable here, so the fallback finds one; force the failure by putting him within reach of all.
  assert.ok(summonSpot(h));
  h.board.guardians = h.board.guardians.map(() => ({ x: 13, y: 1 }));
  assert.ok(summonSpot(h), "hunters on a tile only exclude that tile");
});
```

(Adjust the last test if a fully blocked garden is easier to build; what it must pin is `toggleThird` doing nothing when `summonSpot` is null.)

- [ ] **Step 2: Run to verify they fail**

Expected: FAIL, `toggleThird` is not exported.

- [ ] **Step 3: Implement as specified**

- [ ] **Step 4: Run the tests**

Run: `node --experimental-strip-types --test tests/lotus-hunt.test.mjs`
Expected: PASS.

---

### Task 4: The leap

**Files:**
- Modify: `src/lib/encounters/lotus-hunt.ts`
- Test: `tests/lotus-hunt.test.mjs`

**Interfaces:**
- Consumes: `safeDistances`, `cell` (Task 1), `pathDistances`.
- Produces:

```ts
export function cornered(h: LotusHunt): boolean;         // !protection && safeDistances(board)[cell(player)] < 0 && min Manhattan to a hunter <= HUNT.cornerRange
export function bestLanding(h: LotusHunt): Point | null;  // see spec: mid tile is a hedge inside the garden, far tile open and hunter-free
export function tryLeap(h: LotusHunt): boolean;           // leapLive && leapCooldown <= 0 && !board.done && cornered && a landing exists
```

Landing order: not orthogonally beside any hunter first; then the greatest minimum Manhattan distance to the hunters; then the smallest path distance to the current goal (ship while carrying or when no sailor waits, else the nearest waiting sailor by `pathDistances`). On a leap: `board.previous = board.player`, `board.player = landing`, `board.moveClock = 170`, `lotusCheckInPlace(board)`, `leapCooldown = HUNT.leapCooldownMs[difficulty]`, `leaps++`, `lastLeap = { from, to, tick }`, event `leap` with `from`/`to`. In `huntTick`, call `tryLeap(h)` at a decision opportunity before `applyAgentAction`; when it returns true the policy's action is discarded (still recorded as `aiLastAction`). Decrement `leapCooldown` each tick.

- [ ] **Step 1: Write the failing tests**

```js
import { tryLeap, cornered, bestLanding } from "../src/lib/encounters/lotus-hunt.ts";

/** Odysseus in the (1,3) dead end of the classic garden, a hunter two tiles away at (3,3), the others far off. */
function cornerHunt(difficulty = "normal") {
  const h = hunt(difficulty);
  h.board.player = { x: 1, y: 3 }; h.board.previous = { x: 2, y: 3 };
  h.board.guardians = [{ x: 3, y: 3 }, { x: 13, y: 9 }];
  return h;
}
const withThird = h => { toggleThird(h); run(h, 300); assert.equal(h.third.phase, "out"); h.board.player = { x: 1, y: 3 }; return h; };

test("the leap is sealed with two hunters, even when Odysseus is cornered", () => {
  const h = cornerHunt();
  assert.equal(cornered(h), true);
  assert.equal(tryLeap(h), false);
  run(h, 1);
  assert.deepEqual(h.board.player, { x: 1, y: 3 }); assert.equal(h.leaps, 0);
});

test("with the third hunter out, a cornered Odysseus leaps one hedge to a free tile and the cooldown starts", () => {
  const h = withThird(cornerHunt("normal"));
  const before = h.tick;
  run(h, 17);
  assert.equal(h.leaps, 1);
  assert.ok([{ x: 1, y: 1 }, { x: 1, y: 5 }].some(p => p.x === h.board.player.x && p.y === h.board.player.y), `landed at ${h.board.player.x},${h.board.player.y}`);
  assert.deepEqual(h.lastLeap.from, { x: 1, y: 3 });
  assert.ok(h.leapCooldown > HUNT.leapCooldownMs.normal - 200 && h.leapCooldown <= HUNT.leapCooldownMs.normal);
  assert.equal(h.events.filter(e => e.kind === "leap").length, 1);
  // Cornered again inside the cooldown: no second leap.
  h.board.player = { x: 1, y: 3 }; h.board.guardians[0] = { x: 3, y: 3 };
  run(h, 17);
  assert.equal(h.leaps, 1);
});

test("moly protection means he is not cornered, so no leap", () => {
  const h = withThird(cornerHunt()); h.board.protection = 5000;
  assert.equal(cornered(h), false); assert.equal(tryLeap(h), false);
});

test("cornered with no hedge to clear: no landing, no leap", () => {
  const h = withThird(cornerHunt());
  // Block both landings with hunters: (1,1) and (1,5) are the only far tiles.
  h.board.guardians = [{ x: 3, y: 3 }, { x: 1, y: 1 }, { x: 1, y: 5 }];
  assert.equal(cornered(h), true); assert.equal(bestLanding(h), null); assert.equal(tryLeap(h), false);
});

test("the landing avoids a tile beside a hunter when another is free", () => {
  const h = withThird(cornerHunt());
  h.board.guardians = [{ x: 3, y: 3 }, { x: 2, y: 1 }, { x: 13, y: 9 }];   // (1,1) is beside (2,1)
  assert.deepEqual(bestLanding(h), { x: 1, y: 5 });
});

test("the leap cooldown follows the difficulty", () => {
  assert.deepEqual([HUNT.leapCooldownMs.easy, HUNT.leapCooldownMs.normal, HUNT.leapCooldownMs.hard], [12000, 10000, 7000]);
});
```

- [ ] **Step 2: Run to verify they fail**

Expected: FAIL, `tryLeap` is not exported.

- [ ] **Step 3: Implement as specified**

- [ ] **Step 4: Run the tests**

Run: `node --experimental-strip-types --test tests/lotus-hunt.test.mjs`
Expected: PASS.

---

### Task 5: Soft tie-breaks and result copy

**Files:**
- Modify: `src/lib/encounters/lotus-hunt.ts`
- Test: `tests/lotus-hunt.test.mjs`

**Interfaces:**
- Produces:

```ts
export function pickAction(logits: ArrayLike<number>, random: () => number = Math.random, share = HUNT.tieShare): number;
export function describeHunt(result: HuntResult): { headline: string; why: string };
```

`pickAction`: softmax over the logits; keep every action whose probability is at least `share` times the best; draw among them in proportion to probability using one `random()` call. `describeHunt` copy, exactly:

| winner / reason | headline | why |
|---|---|---|
| hunters / caught | You caught Odysseus | Three catches. The lotus garden keeps him. |
| hunters / timeout | The storm beat him to it | Time ran out with you ahead: {catches} catches to {rescued} sailors aboard. |
| odysseus / rescued | Odysseus escaped with the crew | All three sailors came aboard before you could stop him. |
| odysseus / timeout | Odysseus slipped through | Time ran out with him ahead: {rescued} sailors aboard to {catches} catches. |
| draw / timeout | The storm calls it a draw | Time ran out level: {rescued} sailors aboard, {catches} catches. |

- [ ] **Step 1: Write the failing tests**

```js
import { pickAction, describeHunt } from "../src/lib/encounters/lotus-hunt.ts";

test("pickAction keeps a clear favourite and shares a close call", () => {
  for (let r = 0; r < 1; r += 0.1) assert.equal(pickAction([5, 0, 0, 0, 0], () => r), 0);
  const seen = new Set(Array.from({ length: 50 }, (_, i) => pickAction([2, 2, -5, -5, -5], () => i / 50)));
  assert.deepEqual([...seen].sort(), [0, 1]);
  assert.equal(pickAction([2, 1.9, 0, 0, 0], () => 0.99), 1);
});

test("describeHunt names the outcome from the hunters' side", () => {
  const base = { ms: 50000, rescued: 1, catches: 3, leaps: 2, thirdMs: 20000 };
  assert.equal(describeHunt({ ...base, winner: "hunters", reason: "caught" }).headline, "You caught Odysseus");
  assert.match(describeHunt({ ...base, winner: "odysseus", reason: "timeout", rescued: 2, catches: 1 }).why, /2 sailors aboard to 1 catches/);
  assert.equal(describeHunt({ ...base, winner: "draw", reason: "timeout", rescued: 1, catches: 1 }).headline, "The storm calls it a draw");
});
```

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, **Step 4: Run `npm test`**

Expected after Step 4: the whole suite PASS.

---

### Task 6: The screen

**Files:**
- Create: `src/components/play/lotus-hunt.tsx`
- Create: `src/styles/farshore-hunt.css`

**Interfaces:**
- Consumes: everything exported by `lotus-hunt.ts`; `loadLotusPolicy`, `type LotusPolicy`, `type LotusModelMeta` from `lotus-onnx.ts`; `observe`, `ACTIONS`, `TICK_MS`, `liveLine` from `lotus-agent.ts`; `drawLotusGarden`, `LOTUS_UNIT` from `adventure-game.tsx`; `GameStage`; `audioFrame`, `type AudioFrame` from `audio/cues.ts`; `useFarshoreSprites`, `useFarshoreItems`; `freshLayout`; `difficultyNames`, `planLabel`.
- Produces: `export function LotusHuntRound(props: { difficulty: Difficulty; plan: OpponentPlan; layout: LotusLayout; onLeave: () => void; onAudio?: (frame: AudioFrame) => void })`.

Model it on `lotus-race.tsx` (same phases `loading | error | countdown | running | paused | done`, same `decide()` prefetch that waits for the policy, same 10 ms accumulator loop, pause on Escape/blur/hidden). Differences:

- `decide()` chooses with `pickAction(logits)` instead of the returned `action`.
- One canvas, `BOARD_W = 15 * LOTUS_UNIT + 12`, `BOARD_H = 11 * LOTUS_UNIT + 12`. After `drawLotusGarden(c, h.board, sprites, items, false)` draw overlays at tile centres (`p * LOTUS_UNIT + LOTUS_UNIT / 2`): a gold ring and a small "YOU" tag on `board.guardians[h.possessed]`; a pulsing lotus bloom (two concentric circles, alpha from `h.third.ms`) at `h.third.at` while `arriving`; a translucent mist disc over guardian 2 while `leaving`; a faint teal ring on Odysseus while `leapLive(h) && h.leapCooldown <= 0`; for 500 ms after `h.lastLeap` an arc from `from` to `to` (quadratic curve lifted by one tile) plus the word LEAP.
- Keys: the race's `KEYS` for movement held in a Set; `keydown` handles `Tab`/`q` -> `cycleHunter`, `1`/`2`/`3` -> `possess(h, n - 1)`, ` ` -> `toggleThird`, `Escape` -> pause/resume; all with `preventDefault` while running.
- Audio: forward `audioFrame(heard, board)` with its `victory`/`defeat` cues removed (they speak for Odysseus); add cues from new `h.events` since the last frame: `catch` -> `{ sound: "hit" }` and `{ sound: "costly", gain: 0.6 }`, `leap` -> `{ sound: "jump" }` and `{ sound: "land", delay: 0.35 }`, `summon` -> `{ sound: "charge", gain: 0.6 }`, `risen` -> `{ sound: "thunk" }`, `dismiss` -> `{ sound: "ui-back" }`, `gone` -> `{ sound: "hiss", gain: 0.5 }`; the human's step -> `{ sound: "step-stone", gain: 0.5 }`; on `done`: hunters -> `victory`, odysseus -> `defeat`, draw -> `reply`.
- HUD (`hudOf(h)`): clock tenths and seconds left; hunter chips `[1] [2] [3]` with `data-possessed`, chip 3 reading "Space to summon" / "rising {s}" / "out" / "fading" by phase; Odysseus side: crew dots (reuse the race's `Crew`/`Lives` markup and classes), catches as lives, and a leap badge reading "Leap: sealed" (two hunters) / "Leap: ready" / "Leap: {s} s" (cooldown); the AI Live strip with `liveLine(board, aiLastAction)`, decisions and latency; a controls hint "Arrows move · Tab swap · Space third · Esc pause".
- Veil copy: loading "Loading the trained Odysseus…"; countdown eyebrow "YOU VS TRAINED AI · {garden}" with the line "Catch him three times before three sailors are aboard. The third hunter unseals his leap."; paused "HUNT PAUSED"; done: `describeHunt` headline and why, a table with rows Sailors aboard `{rescued}/3`, Catches `{catches}/3`, Leaps `{leaps}`, Third hunter out `{thirdMs/1000} s`, Hunt time `{ms/1000} s`, then buttons Hunt again / New garden / Briefing.
- Touch: the race's four-arrow pad plus two buttons "Swap" and "Third" inside `.fs-hunt-pad`.
- `GameStage label="Lotus-Eaters hunt"`.

`farshore-hunt.css`: `.fs-hunt` (the race's grid), `.fs-hunt-board` (one figure, canvas `object-fit: contain`, centred), `.fs-hunt-chips` and `.fs-hunt-chip[data-possessed]` (gold border, as the human side colour `#f2c46d`), `.fs-hunt-leap[data-state="sealed|ready|cooling"]`, `.fs-hunt-foot` (AI Live strip left, controls hint right), `.fs-hunt-pad` shown under the same narrow media query as `.fs-race-pad`, and the narrow rule `.fs-stage[data-label="Lotus-Eaters hunt"] .fs-stage-frame { aspect-ratio: auto; max-width: none; height: 100%; }`. Reuse `.fs-race-bar`, `.fs-race-side`, `.fs-race-clock`, `.fs-race-live`, `.fs-race-panel`, `.fs-race-result`, `.fs-race-table`, `.fs-race-actions`, `.fs-race-small` rather than duplicating them.

- [ ] **Step 1: Write `lotus-hunt.tsx`** as specified.
- [ ] **Step 2: Write `farshore-hunt.css`** as specified.
- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors in the new files (pre-existing errors elsewhere, if any, are not this task's).

---

### Task 7: Wire it into the app and verify in the browser

**Files:**
- Modify: `src/ArcadeApp.tsx` (imports ~lines 22-34; `type Run` line 55; `launchRace` ~line 381; the lotus briefing block in line 483; the play mounts at lines 492-493)
- Modify: `docs/GAMEPLAY_DESIGN.md` (append a section)

**Interfaces:**
- Consumes: `LotusHuntRound` (Task 6).

- [ ] **Step 1: Add the run and the launcher**

`type Run` gains `hunt?: { layout: LotusLayout }`. Add `launchHunt()` beside `launchRace()`: identical except it sets `hunt: { layout }` instead of `race: { layout }`. Import `./styles/farshore-hunt.css` after the race stylesheet and `LotusHuntRound` after `LotusRaceRound`.

- [ ] **Step 2: Add the briefing button**

Inside the existing `.fs-race-brief` block, after the "Race the trained AI" button:

```tsx
<button className="a-btn fs-rich" onClick={launchHunt}><Swords size={18} /><span><b>Hunt the trained AI</b><small>You play the guardians · not saved</small></span></button>
```

and change the block's paragraph to: "Race a rival trained by reinforcement learning on a second board, or turn the tables and hunt him through the garden yourself."

- [ ] **Step 3: Mount the round**

Add `{screen === "play" && run?.hunt && <LotusHuntRound key={run.key} difficulty={prefs.difficulty} plan={run.plan} layout={run.hunt.layout} onLeave={leaveRace} onAudio={frame => audio.current?.frame(frame)}/>}` and change the `ArcadeRound` mount's condition to `run && !run.race && !run.hunt`.

- [ ] **Step 4: Document**

Append to `docs/GAMEPLAY_DESIGN.md` a section "The Lotus Hunt" of about ten lines: what it is, the controls, the third-hunter/leap rule, the difficulty table, and a pointer to the spec.

- [ ] **Step 5: Type-check and test**

Run: `npx tsc --noEmit -p .` then `npm test`
Expected: no new type errors; all tests PASS.

- [ ] **Step 6: Play it in the browser**

Start the app if it is not running (`npm run dev`, see memory `farshore-visual-verification` for the click path and the headless Edge setup), open the Lotus-Eaters briefing, press "Hunt the trained AI", and confirm: the model loads and the countdown runs; arrows move hunter 1 and Tab swaps the ring to hunter 2; Space shows the bloom and three seconds later a third hunter stands on it, the leap badge turns to "ready"; corner Odysseus in a dead end and watch him leap with the arc and sound; Space again fades the third and the badge returns to "sealed"; the hunt ends on three catches, three sailors, or the clock with the results panel. Take one screenshot of the running hunt for the user.
