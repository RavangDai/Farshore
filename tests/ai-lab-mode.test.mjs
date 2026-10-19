import { test } from "node:test";
import assert from "node:assert/strict";
import { newCave, tickCave, caveAction } from "../src/lib/encounters/cave-runner.ts";
import { labRunFrom } from "../src/lib/ai/lab.ts";

const plan = { planId: "focused", focus: "center", source: "ai" };

/** Run a cave attempt to completion with a bot good enough to clear it. */
function playToCompletion(state) {
  let s = state;
  let lastInput = -Infinity;
  for (let guard = 0; guard < 16000 && !s.done; guard++) {
    if (s.elapsed - lastInput >= 200) {
      const blocked = s.obstacles
        .filter(o => !o.resolved && o.z > 0 && o.z < 40)
        .sort((a, b) => a.z - b.z)
        .find(o => o.lane === s.lane);
      if (blocked) {
        const safe = [0, 1, 2].find(l => l !== s.lane);
        if (safe !== undefined) {
          s = caveAction(s, { type: "move", dx: Math.sign(safe - s.lane) });
          lastInput = s.elapsed;
        }
      }
    }
    s = tickCave(s, 32);
  }
  return s;
}

test("labRunFrom projects a real AIRuntime into a comparison row, with no fabricated fields", () => {
  const finished = playToCompletion(newCave("hard", plan, false, 909));
  assert.ok(finished.ai.stats.decisions > 0, "the run should have produced real decisions");

  const row = labRunFrom(finished, finished.ai, 909, 1);

  assert.equal(row.trial, "cyclops");
  assert.equal(row.difficulty, "hard");
  assert.equal(row.seed, 909);
  assert.equal(row.id, 1);
  assert.equal(row.agent, "Polyphemus");
  assert.equal(row.algorithm, finished.ai.algorithm);
  assert.equal(row.decisions, finished.ai.stats.decisions);
  assert.equal(row.attacks, finished.ai.stats.attacks);
  assert.equal(row.score, Math.round(finished.score));
  assert.equal(row.elapsedMs, Math.round(finished.elapsed));
  assert.equal(row.won, finished.done && finished.won);

  // Hard is the predictive tier, so it must report a real accuracy figure once
  // predictions have resolved — never a fabricated placeholder.
  if (finished.ai.stats.predictions > 0) {
    assert.equal(typeof row.accuracy, "number");
    assert.ok(row.accuracy >= 0 && row.accuracy <= 1);
  }
  if (finished.ai.stats.attacks > 0) {
    assert.equal(typeof row.attackRate, "number");
  }
});

test("labRunFrom reports no accuracy for a policy that makes no probabilistic forecast", () => {
  const easyPlan = { planId: "alternating", focus: "center", source: "standard" };
  const finished = playToCompletion(newCave("easy", easyPlan, false, 101));
  const row = labRunFrom(finished, finished.ai, 101, 2);
  // Easy is the fixed-rotation tier: it never sets `confidence`, so the lab
  // row's accuracy must stay null rather than printing a hollow number.
  assert.equal(row.accuracy, null);
});

test("labRunFrom never grows unbounded fields and survives JSON round-tripping", () => {
  const finished = playToCompletion(newCave("normal", plan, false, 55));
  const row = labRunFrom(finished, finished.ai, 55, 3);
  const copy = JSON.parse(JSON.stringify(row));
  assert.deepEqual(copy, row);
});
