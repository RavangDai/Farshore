import test from "node:test";
import assert from "node:assert/strict";
import {
  encounters,
  firstGame,
  storyDecision,
  applyDecision,
  advance,
  newGame,
  validSave,
} from "../src/lib/game.ts";
const wind = encounters.find((e) => e.id === "winds");
test("PPT contrast: commands provoke refusal, supportive warning earns trust", () => {
  assert.equal(storyDecision(wind, "Do not open the bag.", 50).followed, false);
  const d = storyDecision(wind, "You are almost home. Do not risk it.", 50);
  assert.equal(d.followed, true);
  assert.equal(d.safeChoice, true);
});
test("A polite dangerous plan remains dangerous", () => {
  const d = storyDecision(wind, "Please open the bag so we can go home.", 50);
  assert.equal(d.followed, true);
  assert.equal(d.safeChoice, false);
});
test("A negated dangerous action is safe", () =>
  assert.equal(
    storyDecision(wind, "Please don't open the bag.", 50).safeChoice,
    true,
  ));
test("All safe turns reach home and decisions cannot count twice", () => {
  let g = newGame();
  for (let i = 0; i < g.route.length; i++) {
    const e = encounters.find((e) => e.id === g.route[i]);
    const d = storyDecision(e, "Friend, " + e.safe, 100);
    assert.equal(d.safeChoice, true, `${e.id}: ${d.reason}`);
    g = applyDecision(g, e, e.safe, d);
    assert.throws(() => applyDecision(g, e, e.safe, d));
    g = advance(g);
    assert.equal(validSave(g), true);
  }
  assert.equal(g.finished, true);
  assert.equal(g.log.length, 11);
  assert.ok(g.months < 240);
});
test("Risky turns lose to the twenty-year benchmark and cannot continue", () => {
  let g = newGame();
  while (!g.finished) {
    const e = encounters.find((e) => e.id === g.route[g.index]);
    g = advance(
      applyDecision(
        g,
        e,
        "Obey me, fool.",
        storyDecision(e, "Obey me, fool.", g.trust),
      ),
    );
  }
  assert.ok(g.months >= 240);
  assert.throws(() =>
    applyDecision(g, wind, "anything", storyDecision(wind, "anything", 50)),
  );
});
test("Save validation rejects old versions and broken routes", () => {
  assert.equal(validSave(firstGame), true);
  assert.equal(validSave({ ...firstGame, version: 1 }), false);
  assert.equal(validSave({ ...firstGame, route: ["unknown"] }), false);
  assert.equal(validSave({ ...firstGame, index: 3 }), false);
  assert.equal(new Set(newGame().route).size, 11);
});
