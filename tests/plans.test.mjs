import test from "node:test";
import assert from "node:assert/strict";
import { trials } from "../src/lib/arcade/arcade.ts";
import { adventureAction, newAdventure, tickAdventure } from "../src/lib/encounters/odyssey-games.ts";
import { mythicAction, newMythic, tickMythic } from "../src/lib/encounters/mythic.ts";
import { newCave } from "../src/lib/encounters/cave-runner.ts";

// The model chooses one of two plans before every round. Each must change how
// that encounter actually plays, never only its label.

const ai = (planId, focus = "balanced") => ({ planId, focus, source: "ai" });
const aiPlans = id => trials.find(t => t.id === id).plans.slice(1);
function runAdventure(id, difficulty, planId, ms, input = () => null) {
  let s = newAdventure(id, difficulty, ai(planId), false, 4242);
  const trace = [];
  for (let t = 0; t < ms && !s.done; t += 50) {
    const action = input(s, t);
    if (action) s = adventureAction(s, action);
    s = tickAdventure(s, 50);
    s.invulnerable = 1e9;
    if (t % 500 === 0) trace.push(JSON.stringify(id === "lotus" ? s.guardians : id === "aeolus" ? [Math.round(s.gust), s.gates.map(g => Math.round(g.center))] : [s.stormClock, s.lightning && Math.round(s.lightning.x * 10)]));
  }
  return trace;
}

test("every encounter offers the model exactly two plans to choose from", () => {
  for (const t of trials) assert.equal(aiPlans(t.id).length, 2, t.id);
});

test("Lotus: the pincer and the undertow move the second guardian differently once it has found you", () => {
  // Walk toward the guardians and back, so they detect and pursue.
  const walk = (s, t) => (t % 400 === 0 ? { type: "move", dx: t % 4800 < 2400 ? 1 : -1, dy: 0 } : null);
  const [pincer, undertow] = aiPlans("lotus").map(plan => runAdventure("lotus", "normal", plan, 20000, walk));
  assert.notDeepEqual(pincer, undertow);
});

test("Aeolus: the pincer swings the gates, the undertow brings the counter-gusts", () => {
  const lift = (s, t) => (t % 450 === 0 ? { type: "lift" } : null);
  const [pincer, undertow] = aiPlans("aeolus").map(plan => runAdventure("aeolus", "normal", plan, 20000, lift));
  assert.notDeepEqual(pincer, undertow);
  const swing = trace => Math.max(...trace.flatMap(entry => JSON.parse(entry)[1]).map(c => Math.abs(c - 200)));
  assert.ok(swing(pincer) > swing(undertow), "wider gate swings under the pincer");
});

test("Calypso: the storm watch strikes more often; landing prediction aims where the current carries you", () => {
  const hop = (s, t) => (t === 600 ? { type: "move", dx: 0, dy: -1 } : null);
  const [watch, predict] = aiPlans("calypso").map(plan => runAdventure("calypso", "normal", plan, 30000, hop));
  assert.notDeepEqual(watch, predict);
});

test("Cyclops: the briefing plan picks the first section's doctrine in a live round", () => {
  const [focused, sweep] = aiPlans("cyclops").map(plan => newCave("normal", ai(plan, "center"), false, 4242, { modelDecisions: true }));
  assert.deepEqual([focused.doctrine, sweep.doctrine], ["hunt", "cutoff"]);
  assert.notEqual(focused.ai.algorithm, sweep.ai.algorithm);
});

test("Circe, Scylla, Sirens and Ithaca: each plan leans the rival's choices a different way", () => {
  // Circe banks or spends curses.
  const [chain, hoard] = aiPlans("circe");
  assert.deepEqual([chain, hoard], ["chain", "hoard"]);
  // Scylla's whirlpool pulls harder under the undertow during an attack.
  const scylla = plan => tickMythic({ ...newMythic("scylla", "normal", ai(plan)), telegraph: 500 }, 50).pull;
  const [pincerPull, undertowPull] = aiPlans("scylla").map(scylla);
  assert.ok(undertowPull > pincerPull);
  // The Sirens' plans lean different melodies up the menu.
  const lean = plan => {
    let s = newMythic("sirens", "hard", ai(plan));
    for (let i = 0; i < 3 && !s.done; i++) {
      for (let t = 0; t < s.notes.length * 600 + 700; t += 50) s = tickMythic(s, 50);
      for (const n of s.notes.filter(n => !n.rest)) s = mythicAction(s, { type: "note", lane: n.lane === 1 ? 2 : n.lane });
      for (let t = 0; t < 1800; t += 50) s = tickMythic(s, 50);
    }
    return s.ai.decisions.filter(d => d.candidates.length).map(d => JSON.stringify(d.candidates.map(c => [c.action, c.score])));
  };
  assert.notDeepEqual(...aiPlans("sirens").map(lean));
  // Antinous' block shots are worth more under the block-shot gambit.
  const blockScore = plan => {
    let s = newMythic("bow", "hard", ai(plan), false, 77);
    s = mythicAction(s, { type: "sight", aim: 3, elevation: 3.5 });
    s = mythicAction(s, { type: "draw", held: true });
    for (let t = 0; t < 1000; t += 50) s = tickMythic(s, 50);
    s = mythicAction(s, { type: "draw", held: false });
    return s.decision.menu.options.filter(o => o.id.startsWith("block-")).map(o => o.score);
  };
  const [surge, feint] = aiPlans("bow").map(blockScore);
  assert.ok(surge.length > 0 && feint.length === surge.length);
  for (let i = 0; i < surge.length; i++) assert.ok(feint[i] > surge[i]);
});
