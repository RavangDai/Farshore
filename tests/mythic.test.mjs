import test from "node:test";
import assert from "node:assert/strict";
import { adaptivePlan, assistTrial, finishAttempt, newArcade, readArcade, standardPlan, trials as campaignTrials, unlocked } from "../src/lib/arcade/arcade.ts";
import { BOW, archeryShot, bestAim, bowScoreShown, bowSway, columnHeight, draughtAllowance, dropPiece, mythicAction, mythicSummary, newMythic, potionChoice, resolveBoard, songBeat, tickMythic } from "../src/lib/encounters/mythic.ts";

const trials = campaignTrials.filter(t => ["cyclops", "circe", "sirens", "scylla", "bow"].includes(t.id));
function advance(s, ms) { for (let elapsed = 0; elapsed < ms && !s.done; elapsed += 50) s = tickMythic(s, Math.min(50, ms - elapsed)); return s; }
const covers = (t, p) => p.x >= t.x && p.x <= t.x + 1 && p.y >= t.y && p.y <= t.y + 1;
test("five preserved engines have distinct rules, legal strategies, deterministic starts and bounded clocks", () => {
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
test("Sirens remember wrong lanes, weave them into later melodies and lose to full temptation", () => {
  let s = newMythic("sirens", "normal", adaptivePlan("sirens")); s = advance(s, 3000);
  const expected = s.notes.filter(n => !n.rest), weak = expected[0].lane;
  expected.forEach((n, i) => { s = mythicAction(s, { type: "note", lane: i === 0 ? (n.lane + 1) % 4 : n.lane }); });
  assert.equal(s.laneMisses[weak], 1); assert.equal(s.temptation, 20);
  // Keep missing that lane: once it is evidenced, the weave is scored and sung.
  for (let round = 0; round < 3 && !s.done; round++) {
    s = advance(s, 1800);
    s = advance(s, s.notes.length * songBeat(s) + 600);
    s.notes.filter(n => !n.rest).forEach(n => { s = mythicAction(s, { type: "note", lane: n.lane === weak ? (n.lane + 1) % 4 : n.lane }); });
  }
  assert.ok(s.laneMisses[weak] >= 2);
  s = advance(s, 1800);
  const sung = s.ai.decisions.at(-1);
  assert.match(sung.algorithm, /Weakness-weighted/);
  assert.ok(sung.candidates.some(c => c.action === "sing:weave"), "the weave is on the table once the lane is evidenced");
  const share = s.notes.filter(n => !n.rest && n.lane === weak).length / s.notes.filter(n => !n.rest).length;
  assert.ok(share <= 0.5, "never more than half a melody in one lane");
  let lost = newMythic("sirens", "hard", adaptivePlan("sirens"));
  while (!lost.done) lost = advance(lost, 15000);
  assert.equal(lost.won, false); assert.ok(lost.temptation >= 100);
  assert.equal(mythicSummary(s).laneMisses[weak], s.laneMisses[weak]);
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
/** Draw the bow to full and let go with the sight where it is. */
function loose(s, aim) {
  if (aim) for (const field of ["aim", "elevation"]) s = mythicAction(s, { type: "aim", field, value: aim[field] });
  s = mythicAction(s, { type: "draw", held: true });
  s = advance(s, 1000);
  return mythicAction(s, { type: "draw", held: false });
}
const full = { aim: 0, elevation: 0, tension: 100 };
test("a full draw flies flat through all twelve axes in still air; a half draw sags out after the sixth unless aimed higher", () => {
  assert.equal(archeryShot(full, 0).rings, 12);
  assert.ok(archeryShot(full, 0).path.at(-1).y < 0, "an arrow drops below the line rather than climbing over it");
  // Half draw: the drop quadruples (0.6 z² against a 0.19 opening, clear to z ≈ 0.563).
  // Axes stand 3.5 m out at 1 m spacing, so the fifth is at z ≈ 0.517 and the sixth, at z ≈ 0.586, is struck.
  assert.equal(archeryShot({ ...full, tension: 50 }, 0).rings, 5);
  // Aiming 14 units up lifts the same weak arrow back through the whole line.
  assert.equal(archeryShot({ aim: 0, elevation: 14, tension: 50 }, 0).rings, 12);
});
test("wind carries the arrow downwind, further on a weaker draw, and aiming into it threads the line again", () => {
  const right = archeryShot(full, 40), left = archeryShot(full, -40);
  assert.ok(right.path.at(-1).x > 0 && left.path.at(-1).x < 0);
  assert.ok(right.rings < 12, "aiming straight down the line in a strong wind loses the far axes");
  assert.ok(archeryShot({ ...full, tension: 70 }, 40).path.at(-1).x > right.path.at(-1).x * 1.5);
  assert.equal(archeryShot({ aim: -8.4, elevation: 3.5, tension: 100 }, 40).rings, 12);
});
test("the bow must be drawn before it shoots: letting go early, or pausing, lets the string down without spending an arrow", () => {
  let s = newMythic("bow", "normal", standardPlan("bow"));
  s = mythicAction(s, { type: "draw", held: true }); s = tickMythic(s, 100);
  assert.ok(s.draw > 0 && s.draw < 0.3, `drawn ${s.draw}`);
  s = mythicAction(s, { type: "draw", held: false });
  assert.equal(s.shots.length, 0); assert.equal(s.phase, "player"); assert.equal(s.draw, 0); assert.equal(s.drawing, false);
  s = mythicAction(s, { type: "draw", held: true }); s = advance(s, 1000);
  assert.equal(s.draw, 1);
  const paused = mythicAction(s, { type: "letdown" });
  assert.equal(paused.shots.length, 0); assert.equal(paused.draw, 0); assert.equal(paused.drawing, false);
  s = mythicAction(s, { type: "draw", held: false });
  assert.equal(s.shots.length, 1); assert.equal(s.phase, "rival"); assert.equal(s.shot.aim.tension, 100);
  const flying = mythicAction(mythicAction(s, { type: "draw", held: true }), { type: "aim", field: "aim", value: 9 });
  assert.equal(flying.drawing, false, "no second arrow is nocked while one is in the air");
  assert.equal(flying.aim.aim, s.aim.aim);
});
test("the sight moves on both axes at once, within its limits, and ignores nonsense", () => {
  const s = newMythic("bow", "normal", standardPlan("bow"));
  const moved = mythicAction(s, { type: "sight", aim: 95, elevation: -4.5 });
  assert.equal(moved.aim.aim, BOW.sightLimit); assert.equal(moved.aim.elevation, -4.5);
  const junk = mythicAction(moved, { type: "sight", aim: Number.NaN, elevation: 3 });
  assert.equal(junk.aim.aim, BOW.sightLimit); assert.equal(junk.aim.elevation, -4.5);
});
test("a bow held at full draw is steady at first, then trembles, and the arrow follows the trembling sight", () => {
  let s = newMythic("bow", "normal", standardPlan("bow"));
  s = mythicAction(s, { type: "draw", held: true }); s = advance(s, 900 + 1000);
  assert.equal(Math.hypot(bowSway(s).aim, bowSway(s).elevation), 0);
  s = advance(s, 4000);
  let widest = 0;
  for (let i = 0; i < 20; i++) { s = tickMythic(s, 50); widest = Math.max(widest, Math.hypot(bowSway(s).aim, bowSway(s).elevation)); }
  assert.ok(widest > 1, `sway only ${widest}`);
  const sway = bowSway(s), released = mythicAction(s, { type: "draw", held: false });
  assert.ok(Math.abs(released.shot.aim.aim - (s.aim.aim + sway.aim)) < 1e-9);
  assert.ok(Math.abs(released.shot.aim.elevation - (s.aim.elevation + sway.elevation)) < 1e-9);
});
test("each turn plays out in order: your arrow lands, Antinous shoots, then fresh wind for your next arrow", () => {
  let s = newMythic("bow", "normal", { ...adaptivePlan("bow"), planId: "feint" });
  const ideal = bestAim(s.wind, 0, s.difficulty);
  s = loose(s, { ...ideal, aim: ideal.aim + 1.2 });
  assert.equal(s.phase, "rival");
  // The model picks from the game's measured menu; here it chooses the block shot.
  const block = s.decision.menu.options.find(o => o.id.startsWith("block-"));
  assert.ok(block, "a line the lodged arrow would cut offers a block shot on medium");
  s = mythicAction(s, { type: "choose", choice: { menuId: s.decision.menu.id, optionId: block.id, reason: "test", line: "", latencyMs: 1 } });
  const axe = Number(block.id.slice(6));
  assert.match(s.rivalLine, new RegExp(`axe ${axe}`), "the narrowed axe is announced as soon as it is chosen");
  s = advance(s, BOW.flightMs + BOW.resultMs + BOW.rivalAimMs - 50);
  assert.equal(s.rivalShots.length, 0, "Antinous waits until your arrow has landed");
  // The tick that looses his arrow starts its flight, so 50 ms of it has already passed.
  s = advance(s, 100); assert.equal(s.rivalShots.length, 1); assert.equal(s.phase, "review"); assert.equal(s.blocked, axe);
  assert.ok(s.rivalShots[0] <= 6, "a block shot caps his own count");
  assert.equal(s.ai.decisions.at(-1).chooser.by, "model");
  s = advance(s, BOW.flightMs + BOW.resultMs - 100); assert.equal(s.phase, "review");
  s = advance(s, 100); assert.equal(s.phase, "player"); assert.equal(s.turn, 2);
  const wind = s.wind, blocked = s.blocked;
  s = loose(s); assert.equal(s.blocked, 0); assert.equal(s.shot.wind, wind); assert.equal(s.shot.block, blocked);
});
test("an arrow's score is shown only once it lands, for Odysseus and for Antinous", () => {
  let s = loose({ ...newMythic("bow", "normal", standardPlan("bow")), wind: 0 });
  assert.equal(s.score, 12, "the rules count the arrow at once");
  assert.deepEqual(bowScoreShown(s), { score: 0, rivalScore: 0, shots: [], rivalShots: [] }, "but it is not shown mid-flight");
  s = advance(s, BOW.flightMs);
  assert.deepEqual(bowScoreShown(s), { score: 12, rivalScore: 0, shots: [12], rivalShots: [] });
  s = advance(s, BOW.resultMs + BOW.rivalAimMs);
  assert.equal(s.rivalShots.length, 1);
  assert.equal(bowScoreShown(s).rivalShots.length, 0, "Antinous' arrow is still in the air");
  s = advance(s, BOW.flightMs);
  assert.deepEqual(bowScoreShown(s), { score: 12, rivalScore: s.rivalScore, shots: [12], rivalShots: s.rivalShots });
});
test("five steady, wind-compensated full draws beat every Antinous strategy on medium", () => {
  for (const planId of trials[4].plans) {
    let s = newMythic("bow", "normal", { ...adaptivePlan("bow"), planId }, false, 991);
    for (let guard = 0; !s.done && guard < 400; guard++) {
      if (s.phase === "player") {
        s = loose(s, bestAim(s.wind, s.blocked, s.difficulty));
        const count = s.shots.length; s = mythicAction(s, { type: "draw", held: false }); assert.equal(s.shots.length, count);
      } else s = advance(s, 500);
    }
    assert.equal(s.shots.length, 5); assert.equal(s.rivalShots.length, 5); assert.ok(s.score > s.rivalScore, `${planId}: ${s.score} v ${s.rivalScore}`); assert.equal(s.won, true);
  }
});
test("winds punish aiming straight down the line on every tier, but compensating keeps every axe in reach", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const examples = Array.from({ length: 20 }, (_, i) => newMythic("bow", difficulty, adaptivePlan("bow"), false, i * 4700 + 1));
    if (difficulty !== "easy") assert.ok(examples.some(s => archeryShot(full, s.wind, 0, "player", s.difficulty).rings < 12), difficulty);
    for (const s of examples) assert.equal(archeryShot(bestAim(s.wind, 0, s.difficulty), s.wind, 0, "player", s.difficulty).rings, 12, `${difficulty} wind ${s.wind}`);
  }
});
test("the draught gauge's allowance, in hole widths, is enough to thread all twelve on every tier", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const opening = BOW.opening[["easy", "normal", "hard"].indexOf(difficulty)];
    for (let wind = -55; wind <= 55; wind++) {
      const allowance = draughtAllowance(wind, difficulty);
      assert.ok(["touch", "half", "one", "more"].includes(allowance.size), `${difficulty} ${wind}`);
      // Aim upwind by that many hole widths at the far axe, and up by the drop, at full draw.
      const aim = { aim: -Math.sign(wind) * allowance.holes * 2 * opening / BOW.perSight, elevation: BOW.drop / BOW.perSight, tension: 100 };
      assert.equal(archeryShot(aim, wind, 0, "player", difficulty).rings, 12, `${difficulty} wind ${wind}: aim ${allowance.words}`);
    }
  }
  assert.equal(draughtAllowance(0, "normal").holes, 0);
});
test("after a miss the hall says which way to correct, and an imperfect arrow counts against the medal", () => {
  const drifted = loose({ ...newMythic("bow", "normal", standardPlan("bow")), wind: 40 });
  assert.ok(drifted.shots[0] < 12);
  assert.match(drifted.feedback, /right/i); assert.match(drifted.feedback, /aim further left/i);
  assert.equal(drifted.misses, 1);
  let weak = { ...newMythic("bow", "normal", standardPlan("bow")), wind: 0 };
  weak = mythicAction(weak, { type: "draw", held: true }); weak = advance(weak, 400); weak = mythicAction(weak, { type: "draw", held: false });
  assert.ok(weak.shots[0] < 12);
  assert.match(weak.feedback, /low/i); assert.match(weak.feedback, /draw/i);
  const clean = loose({ ...newMythic("bow", "normal", standardPlan("bow")), wind: 0 });
  assert.equal(clean.shots[0], 12); assert.equal(clean.misses, 0); assert.match(clean.feedback, /all twelve/i);
});
test("Antinous is a strong archer who still misses, and sharper on harder tiers", () => {
  const average = (difficulty, plan) => {
    let rings = 0, shots = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let s = newMythic("bow", difficulty, plan, false, seed * 7919);
      for (let guard = 0; !s.done && guard < 400; guard++) s = s.phase === "player" ? loose(s) : advance(s, 500);
      rings += s.rivalScore; shots += s.rivalShots.length;
    }
    return rings / shots;
  };
  for (const plan of [standardPlan("bow"), adaptivePlan("bow")]) {
    const easy = average("easy", plan), hard = average("hard", plan);
    for (const [tier, mean] of [["easy", easy], ["hard", hard]]) assert.ok(mean > 4 && mean < 11.5, `${plan.planId} ${tier} averages ${mean}`);
    assert.ok(hard > easy, `${plan.planId}: hard ${hard} should beat easy ${easy}`);
  }
});
test("save migration retains old clears, introduces new shores, and enforces the new route", () => {
  const old = { version: 1, started: true, records: { cyclops: { cleared: "cleared", attempts: 1, recent: [] }, sirens: { cleared: "cleared", attempts: 1, recent: [] }, bow: { cleared: "cleared", attempts: 1, recent: [] } } };
  let save = readArcade(JSON.stringify(old)); assert.equal(save.version, 3); assert.equal(save.records.bow.cleared, "cleared"); assert.equal(save.records.circe.cleared, "pending"); assert.equal(unlocked(save, "bow"), true);
  assert.deepEqual(readArcade(JSON.stringify(save)), save);
  save = assistTrial(save, "lotus"); save = assistTrial(save, "aeolus"); save = assistTrial(save, "circe"); assert.equal(unlocked(save, "scylla"), true); save = assistTrial(save, "scylla"); assert.equal(unlocked(save, "bow"), true);
  // Every trial is open from the start, so attempting "bow" on a brand-new
  // voyage is a real attempt, not a no-op — it just has not been won yet.
  const fresh = { ...newArcade(), started: true };
  const attempted = finishAttempt(fresh, "bow", mythicSummary(newMythic("bow", "normal", standardPlan("bow"))));
  assert.notEqual(attempted, fresh);
  assert.equal(attempted.records.bow.attempts, 1);
  assert.equal(attempted.records.bow.cleared, "pending");
  assert.equal(readArcade('null'), null);
});
