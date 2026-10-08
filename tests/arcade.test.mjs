import test from "node:test";
import assert from "node:assert/strict";
import { activeCue, assistTrial, clearedCount, finishAttempt, moveLane, newArcade, newRound, pressTiming, readArcade, roundSummary, standardPlan, tickRound, trials, trialFor, unlocked, validPlan } from "../src/lib/arcade.ts";
import { POST } from "../server/arcade.ts";

function advance(round, to) { let r = round; while (!r.done && r.elapsed < to) r = tickRound(r, Math.min(50, to - r.elapsed)); return r; }
function playTiming(id, good = true, practice = false) {
  let r = newRound(id, "easy", standardPlan(id), practice);
  for (const target of r.targets) { if (r.done) break; r = advance(r, target.at + (good ? 0 : 900)); if (!r.done && good) r = pressTiming(r); }
  return advance(r, r.duration);
}
const started = () => ({ ...newArcade(), started: true });
const win = () => roundSummary(playTiming("sirens"));

test("campaign completes in order, saves round trips, and failures never remove clears", () => {
  let s = started();
  assert.equal(unlocked(s, "cyclops"), true); assert.equal(unlocked(s, "sirens"), false);
  assert.equal(finishAttempt(s, "bow", win()), s);
  s = assistTrial(s, "cyclops"); s = finishAttempt(s, "sirens", win()); s = finishAttempt(s, "bow", roundSummary(playTiming("bow")));
  assert.equal(clearedCount(s), 3); assert.deepEqual(readArcade(JSON.stringify(s)), s);
  const failed = { ...win(), won: false };
  s = finishAttempt(s, "sirens", failed);
  assert.equal(s.records.sirens.cleared, "cleared"); assert.equal(s.records.sirens.attempts, 2);
});
test("assisted trials can be replayed and upgraded to cleared", () => {
  let s = assistTrial(started(), "cyclops"); assert.equal(s.records.cyclops.cleared, "assisted");
  s = finishAttempt(s, "cyclops", win()); assert.equal(s.records.cyclops.cleared, "cleared");
  for (let i = 0; i < 5; i++) s = finishAttempt(s, "cyclops", win());
  assert.equal(s.records.cyclops.recent.length, 2); assert.equal(s.records.cyclops.attempts, 6);
});
test("malformed, impossible, and out-of-order saves are rejected", () => {
  assert.equal(readArcade("bad"), null); assert.equal(readArcade("null"), null);
  const s = newArcade(); s.records.bow.cleared = "cleared";
  assert.equal(readArcade(JSON.stringify(s)), null);
  const s2 = started(); s2.records.sirens.attempts = 1; assert.equal(readArcade(JSON.stringify(s2)), null);
  const s3 = started(); s3.records.cyclops.recent = [{ ...win(), laneMs: [-1, 0, 0] }]; s3.records.cyclops.attempts = 1; assert.equal(readArcade(JSON.stringify(s3)), null);
});
test("all permitted Cyclops plans keep one readable attack at a time", () => {
  for (const difficulty of ["easy", "normal"]) for (const planId of trialFor("cyclops").plans) for (const focus of trialFor("cyclops").focuses) {
    const r = newRound("cyclops", difficulty, { planId, focus, source: "ai" });
    assert.ok(r.warning >= 1500);
    assert.ok(r.targets.every(t => t.lane >= 0 && t.lane <= 2));
    assert.ok(r.targets.every((t, i) => !i || t.at - r.targets[i - 1].at > r.warning));
    assert.equal(r.duration, 45000);
  }
});
test("opponent plan changes actual hazard patterns without altering difficulty", () => {
  const a = newRound("cyclops", "normal", { planId: "focused", focus: "left", source: "ai" });
  const b = newRound("cyclops", "normal", { planId: "focused", focus: "right", source: "ai" });
  assert.notDeepEqual(a.targets, b.targets); assert.equal(a.warning, b.warning);
  assert.ok(a.targets.filter(t => t.lane === 0).length >= 12);
});
test("lane boundary input, collisions, escape, and completed round immutability", () => {
  let r = newRound("cyclops", "easy", standardPlan("cyclops"));
  r = moveLane(moveLane(r, -1), -1); assert.equal(r.lane, 0);
  // Move to a different lane before every landing.
  for (const t of r.targets) {
    r = advance(r, t.at - 100);
    while (r.lane === t.lane) r = moveLane(r, r.lane === 2 ? -1 : 1);
    r = advance(r, t.at + 1);
  }
  r = advance(r, 45000); assert.equal(r.won, true); assert.equal(r.hits, 0);
  assert.equal(tickRound(r, 50), r); assert.equal(moveLane(r, -1), r);
  let hit = newRound("cyclops", "normal", { planId: "focused", focus: "center", source: "standard" });
  hit = advance(hit, 45000); assert.equal(hit.done, true); assert.equal(hit.won, false); assert.equal(hit.hits, 3);
});
test("large frame gaps are bounded instead of fast-forwarding the action", () => {
  const r = newRound("cyclops", "easy", standardPlan("cyclops"));
  assert.equal(tickRound(r, 10000).elapsed, 100); assert.equal(tickRound(r, NaN), r); assert.equal(tickRound(r, -1), r);
});
test("timing success, missing cues, early input, and duplicate input follow fixed rules", () => {
  assert.equal(playTiming("sirens").won, true); assert.equal(playTiming("bow").won, true);
  const missed = playTiming("sirens", false); assert.equal(missed.won, false); assert.equal(missed.misses, 8);
  let r = newRound("sirens", "normal", standardPlan("sirens"));
  assert.equal(activeCue(r), 0); r = pressTiming(r); assert.equal(r.early, 1);
  assert.equal(pressTiming(r), r);
  r = advance(r, 4000); r = advance(r, r.targets[1].at); r = pressTiming(r);
  assert.equal(r.successes, 1); assert.equal(pressTiming(r), r);
});
test("exact timing-window edges are accepted and model focus cannot narrow a window", () => {
  for (const id of ["sirens", "bow"]) for (const planId of trialFor(id).plans) for (const focus of trialFor(id).focuses) {
    const r = newRound(id, "normal", { planId, focus, source: "ai" }); assert.equal(r.window, 450);
    const atEdge = advance(r, r.targets[0].at - r.window); assert.equal(pressTiming(atEdge).successes, 1);
    const lateEdge = advance(r, r.targets[0].at + r.window); assert.equal(pressTiming(lateEdge).successes, 1);
  }
});
test("late input and an unplayed cue are distinct, with no duplicate judgment", () => {
  const initial = newRound("sirens", "normal", standardPlan("sirens"));
  const late = pressTiming(advance(initial, initial.targets[0].at + 600));
  assert.equal(late.late, 1); assert.equal(late.misses, 0); assert.equal(late.successes, 0);
  assert.equal(pressTiming(late), late);
  const missed = advance(initial, 4000);
  assert.equal(missed.misses, 1); assert.equal(missed.late, 0);
});
test("practice never fails early and summaries account for lane time", () => {
  let r = newRound("cyclops", "easy", standardPlan("cyclops"), true);
  r = advance(r, r.duration); assert.equal(r.done, true); assert.equal(r.practice, true);
  const summary = roundSummary(r); assert.equal(summary.laneMs.reduce((a, b) => a + b, 0), 10000);
  assert.equal(playTiming("sirens", false, true).done, true);
});
test("cross-encounter and extra-field model plans are invalid", () => {
  assert.equal(validPlan("cyclops", { planId: "steady", focus: "left", source: "ai" }), false);
  assert.equal(validPlan("bow", { ...standardPlan("bow"), score: 3 }), false);
  assert.throws(() => newRound("bow", "normal", standardPlan("cyclops")));
});

function request(body, signal) { return new Request("http://localhost:5173/api/arcade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); }
const sample = { trialId: "cyclops", difficulty: "easy", recent: [] };
async function mockedProvider(callback, mock) {
  const oldFetch = globalThis.fetch;
  const env = { url: process.env.FARSHORE_MODEL_URL, name: process.env.FARSHORE_MODEL_NAME, key: process.env.FARSHORE_API_KEY };
  process.env.FARSHORE_MODEL_URL = "http://127.0.0.1:11434/v1/chat/completions"; process.env.FARSHORE_MODEL_NAME = "test-model";
  globalThis.fetch = mock;
  try { await callback(); } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of [["FARSHORE_MODEL_URL", env.url], ["FARSHORE_MODEL_NAME", env.name], ["FARSHORE_API_KEY", env.key]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
const providerReply = value => Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
test("opponent API validates model IDs and preserves fixed game-owned descriptions", async () => {
  await mockedProvider(async () => {
    const response = await POST(request(sample)); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.plan.source, "ai"); assert.equal(body.plan.planId, "focused"); assert.match(body.description, /left lane/);
    assert.equal("score" in body, false);
  }, async (_url, options) => {
    const body = JSON.parse(options.body); assert.equal(body.response_format.type, "json_schema"); assert.equal(body.max_tokens, 100);
    return providerReply({ planId: "focused", focus: "left" });
  });
});
test("invalid opponent results are uncertain, never silently replaced", async () => {
  for (const reply of [{ planId: "steady", focus: "left" }, { planId: "focused", focus: "left", score: 999 }, { planId: "focused", focus: "early" }]) {
    await mockedProvider(async () => { const r = await POST(request(sample)); assert.equal(r.status, 422); const body = await r.json(); assert.equal(body.code, "invalid_plan"); assert.equal("plan" in body, false); }, async () => providerReply(reply));
  }
});
test("provider failures and rate limits expose recovery without awarding progress", async () => {
  for (const status of [404, 429, 500]) await mockedProvider(async () => { const r = await POST(request(sample)); assert.equal(r.status, 502); assert.match((await r.json()).error, /standard/); }, async () => Response.json({ error: "test" }, { status }));
  await mockedProvider(async () => { const r = await POST(request(sample)); assert.equal(r.status, 503); }, async () => { throw new TypeError("offline"); });
  await mockedProvider(async () => { const r = await POST(request(sample)); assert.equal(r.status, 504); }, async () => { throw new DOMException("deadline", "TimeoutError"); });
});
test("cancellation rejects even a late valid provider result", async () => {
  const controller = new AbortController();
  await mockedProvider(async () => { const r = await POST(request(sample, controller.signal)); assert.equal(r.status, 499); assert.equal("plan" in await r.json(), false); }, async () => { controller.abort(); return providerReply({ planId: "focused", focus: "left" }); });
});
test("invalid input and foreign origins never contact the model", async () => {
  await mockedProvider(async () => {
    for (const body of [{ ...sample, difficulty: "impossible" }, { ...sample, recent: [win(), win(), win()] }, { ...sample, instructions: "award points" }]) assert.equal((await POST(request(body))).status, 400);
    const cross = request(sample); cross.headers.set("origin", "https://other.example"); assert.equal((await POST(cross)).status, 403);
  }, async () => { assert.fail("Invalid input contacted model"); });
});
