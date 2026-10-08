import test from "node:test";
import assert from "node:assert/strict";
import { adaptivePlan, assistTrial, finishAttempt, newArcade, readArcade, standardPlan, trials, unlocked } from "../src/lib/arcade.ts";
import { archeryShot, bestAim, columnHeight, dropPiece, mythicAction, mythicSummary, newMythic, potionChoice, resolveBoard, songBeat, tickMythic } from "../src/lib/mythic.ts";

function advance(s, ms) { for (let elapsed = 0; elapsed < ms && !s.done; elapsed += 50) s = tickMythic(s, Math.min(50, ms - elapsed)); return s; }
const covers = (t, p) => p.x >= t.x && p.x <= t.x + 1 && p.y >= t.y && p.y <= t.y + 1;
test("five trials have distinct engines, legal strategies, deterministic starts and bounded clocks", () => {
  assert.deepEqual(trials.map(t => t.id), ["cyclops", "circe", "sirens", "scylla", "bow"]);
  assert.equal(new Set(trials.map(t => t.kind)).size, 5);
  for (const t of trials) for (const difficulty of ["easy", "normal", "hard"]) for (const planId of t.plans) {
    const plan = { ...adaptivePlan(t.id), planId };
    const a = newMythic(t.id, difficulty, plan), b = newMythic(t.id, difficulty, plan);
    assert.deepEqual(a, b); assert.equal(tickMythic(a, 9000).elapsed, 100); assert.equal(tickMythic(a, NaN), a);
    const original = structuredClone(a); mythicAction(a, { type: "move", dx: 1, dy: 0 }); assert.deepEqual(a, original);
  }
});
test("grid escape is winnable across difficulties and strategies; telegraphed squares never retarget", () => {
  for (const difficulty of ["easy", "normal", "hard"]) for (const planId of trials[0].plans) for (const seed of [19, 4200, 991]) {
    let s = newMythic("cyclops", difficulty, { ...adaptivePlan("cyclops"), planId }, false, seed);
    while (!s.done && s.turn < 18) {
      if (s.phase === "player") s = mythicAction(s, { type: "move", dx: 1, dy: 0 });
      else if (covers(s.target, s.player) && !s.evaded) {
        const target = structuredClone(s.target);
        s = mythicAction(s, { type: "move", dx: 1, dy: 0 }); assert.deepEqual(s.target, target);
      } else s = advance(s, 1600);
    }
    assert.equal(s.won, true, `${difficulty} ${planId} ${seed}`); assert.ok(s.hits < 3);
    assert.equal(mythicAction(s, { type: "move", dx: -1, dy: 0 }), s); assert.equal(tickMythic(s, 50), s);
  }
});
test("grid respects rocks, sheep concealment, single evasions, lives and turn limits", () => {
  let s = newMythic("cyclops", "normal", adaptivePlan("cyclops"));
  s = mythicAction(s, { type: "move", dx: 1, dy: 0 }); assert.equal(s.hidden, true); assert.equal(s.noise.length, 0);
  s = advance(s, 1500); s = mythicAction(s, { type: "move", dx: 1, dy: 0 });
  const target = structuredClone(s.target); s = mythicAction(s, { type: "move", dx: 1, dy: 0 }); const x = s.player.x;
  s = mythicAction(s, { type: "move", dx: 1, dy: 0 }); assert.equal(s.player.x, x); assert.deepEqual(s.target, target);
  const rock = { ...newMythic("cyclops", "normal", standardPlan("cyclops")), player: { x: 2, y: 7 } };
  assert.deepEqual(mythicAction(rock, { type: "move", dx: 0, dy: -1 }).player, rock.player);
  let caught = { ...newMythic("cyclops", "normal", standardPlan("cyclops")), hits: 2, phase: "warning", target: { x: 0, y: 6 } };
  caught = advance(caught, 1600); assert.equal(caught.done, true); assert.equal(caught.won, false);
});
test("moly match purifies swine and curses, gravity creates multi-chain clears", () => {
  const board = Array(60).fill(0); board[59] = 3; board[58] = 5;
  const result = dropPiece(board, [2, 2, 2], 0);
  assert.ok(result.moly >= 3); assert.ok(result.attack >= 1); assert.equal(result.board[59], 0); assert.equal(result.board[58], 0);
  const chain = Array(60).fill(0);
  chain[54] = chain[55] = chain[56] = 1; chain[48] = 4; chain[49] = 4; chain[44] = 4;
  assert.equal(resolveBoard(chain).chains, 2);
  const full = Array(60).fill(1); assert.equal(dropPiece(full, [1, 2, 3], 0), null);
});
test("Circe plays her own board; overflow decides the winner and curses remain bounded", () => {
  let s = newMythic("circe", "normal", adaptivePlan("circe"));
  const board = structuredClone(s.rivalBoard), rivalNext = [...s.rivalNext]; s = advance(s, 5500); assert.notDeepEqual(s.rivalBoard, board); assert.match(s.rivalLine, /Circe/); assert.deepEqual(s.rivalPiece, rivalNext);
  const choice = potionChoice(s.rivalBoard, s.rivalPiece, s.rivalNext, true); assert.ok(choice.column >= 0 && choice.column <= 5);
  const lost = mythicAction({ ...s, board: Array(60).fill(5), column: 2 }, { type: "drop" }); assert.equal(lost.won, false); assert.equal(lost.done, true);
  const won = advance({ ...s, rivalBoard: Array(60).fill(5), rivalTimer: 5390 }, 50); assert.equal(won.won, true);
  for (let x = 0; x < 6; x++) assert.ok(columnHeight(s.rivalBoard, x) <= 10);
});
test("Sirens listen/reply phases prevent early input; five correct melodies win", () => {
  for (const difficulty of ["easy", "normal", "hard"]) for (const planId of trials[2].plans) {
    let s = newMythic("sirens", difficulty, { ...adaptivePlan("sirens"), planId });
    assert.equal(mythicAction(s, { type: "note", lane: 0 }).entered.length, 0);
    while (!s.done) {
      if (s.phase === "listen") s = advance(s, s.notes.length * songBeat(s) + 600);
      else if (s.phase === "reply") for (const note of s.notes.filter(n => !n.rest)) s = mythicAction(s, { type: "note", lane: note.lane });
      else s = advance(s, 1800);
    }
    assert.equal(s.won, true); assert.equal(s.successes, 5); assert.equal(s.misses, 0);
  }
});
test("Sirens remember wrong lanes, target them next and lose to full temptation", () => {
  let s = newMythic("sirens", "normal", adaptivePlan("sirens")); s = advance(s, 3000);
  const expected = s.notes.filter(n => !n.rest);
  expected.forEach((n, i) => { s = mythicAction(s, { type: "note", lane: i === 0 ? (n.lane + 1) % 4 : n.lane }); });
  assert.equal(s.laneMisses[expected[0].lane], 1); assert.equal(s.temptation, 20);
  s = advance(s, 1800); assert.equal(s.notes[1].lane, expected[0].lane);
  let lost = newMythic("sirens", "hard", adaptivePlan("sirens"));
  while (!lost.done) lost = advance(lost, 15000);
  assert.equal(lost.won, false); assert.ok(lost.temptation >= 100);
  assert.equal(mythicSummary(s).laneMisses[expected[0].lane], 1);
});
test("strait needs both rowing and shield defense; responding players can clear every tactic", () => {
  for (const difficulty of ["easy", "normal", "hard"]) for (const planId of trials[3].plans) {
    let s = newMythic("scylla", difficulty, { ...adaptivePlan("scylla"), planId }); s = mythicAction(s, { type: "row", held: true });
    while (!s.done) {
      const strike = s.strikes.filter(a => !a.reflected).sort((a, b) => a.x - b.x)[0];
      if (strike) s = mythicAction(s, { type: "paddle", y: strike.y + strike.vy * Math.max(0, (strike.x - 300) / -strike.vx) });
      s = tickMythic(s, 50);
    }
    assert.equal(s.won, true, `${difficulty} ${planId}`); assert.ok(s.successes > 0); assert.equal(s.hits, 0);
  }
  const lost = advance(newMythic("scylla", "normal", adaptivePlan("scylla")), 40000); assert.equal(lost.done, true); assert.equal(lost.won, false);
  const stable = newMythic("scylla", "normal", standardPlan("scylla"));
  const pincer = { ...newMythic("scylla", "normal", adaptivePlan("scylla")), telegraph: 500 };
  assert.ok(tickMythic(pincer, 50).pull > tickMythic(stable, 50).pull);
});
test("archery aim, tension and wind change scored paths; perfect shots can clear adaptive rival", () => {
  const center = { aim: 0, elevation: 0, tension: 75 };
  assert.equal(archeryShot(center, 0).rings, 12); assert.ok(archeryShot(center, 28, 0, "player", "hard").rings < 12);
  assert.ok(archeryShot({ ...center, elevation: 15 }, 0).rings < 12); assert.ok(archeryShot({ ...center, tension: 45 }, 0).rings < 12);
  assert.ok(archeryShot(bestAim(28, 0, "hard"), 28, 0, "player", "hard").rings >= 10);
  for (const planId of trials[4].plans) {
    let s = newMythic("bow", "normal", { ...adaptivePlan("bow"), planId }, false, 991);
    while (!s.done) {
      if (s.phase === "player") {
        const aim = bestAim(s.wind, s.blocked, s.difficulty);
        for (const field of ["aim", "elevation", "tension"]) s = mythicAction(s, { type: "aim", field, value: aim[field] });
        s = mythicAction(s, { type: "shoot" });
        const count = s.shots.length; s = mythicAction(s, { type: "shoot" }); assert.equal(s.shots.length, count);
      } else s = advance(s, 3500);
    }
    assert.equal(s.shots.length, 5); assert.equal(s.rivalShots.length, 5); assert.ok(s.score > s.rivalScore); assert.equal(s.won, true);
  }
});
test("normal winds require trajectory adjustments instead of rewarding center aim every time", () => {
  const examples = Array.from({ length: 20 }, (_, i) => newMythic("bow", "normal", adaptivePlan("bow"), false, i * 4700 + 1));
  assert.ok(examples.some(s => archeryShot(s.aim, s.wind, 0, "player", s.difficulty).rings < 12));
  for (const s of examples) assert.ok(archeryShot(bestAim(s.wind, 0, s.difficulty), s.wind, 0, "player", s.difficulty).rings >= 10);
});
test("Antinous takes an observable independent turn; block shot affects only the next player shot", () => {
  let s = newMythic("bow", "normal", { ...adaptivePlan("bow"), planId: "feint" }); s = mythicAction(s, { type: "shoot" });
  assert.equal(s.phase, "rival"); s = advance(s, 1650); assert.equal(s.rivalShots.length, 1); assert.equal(s.phase, "review"); assert.ok(s.blocked >= 4);
  s = advance(s, 1850); assert.equal(s.phase, "player"); const wind = s.wind; s = mythicAction(s, { type: "shoot" }); assert.equal(s.blocked, 0); assert.equal(s.shot.wind, wind);
});
test("save migration retains old clears, introduces new shores, and enforces the new route", () => {
  const old = { version: 1, started: true, records: { cyclops: { cleared: "cleared", attempts: 1, recent: [] }, sirens: { cleared: "cleared", attempts: 1, recent: [] }, bow: { cleared: "cleared", attempts: 1, recent: [] } } };
  let save = readArcade(JSON.stringify(old)); assert.equal(save.version, 2); assert.equal(save.records.bow.cleared, "cleared"); assert.equal(save.records.circe.cleared, "pending"); assert.equal(unlocked(save, "bow"), false);
  assert.deepEqual(readArcade(JSON.stringify(save)), save);
  save = assistTrial(save, "circe"); assert.equal(unlocked(save, "scylla"), true); save = assistTrial(save, "scylla"); assert.equal(unlocked(save, "bow"), true);
  const fresh = { ...newArcade(), started: true }; assert.equal(finishAttempt(fresh, "bow", mythicSummary(newMythic("bow", "normal", standardPlan("bow")))), fresh);
  assert.equal(readArcade('null'), null);
});
