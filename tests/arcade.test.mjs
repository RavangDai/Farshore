import test from "node:test";
import assert from "node:assert/strict";
import { assistTrial, clearedCount, finishAttempt, newArcade, readArcade, standardPlan, trials, trialFor, unlocked, validPlan } from "../src/lib/arcade/arcade.ts";
import { POST } from "../server/arcade.ts";

const started = () => ({ ...newArcade(), started: true });
const win = () => ({ won: true, source: "standard", hits: 0, successes: 8, early: 0, late: 0, misses: 0, laneMs: [0, 0, 0], score: 800, timeMs: 30000, difficulty: "easy" });

test("every trial is open in any order once a voyage has started, saves round trip, and failures never remove clears", () => {
  let s = started();
  // No completion chain gates any trial: every one is playable from the start.
  assert.equal(unlocked(s, "lotus"), true); assert.equal(unlocked(s, "cyclops"), true); assert.equal(unlocked(s, "sirens"), true);
  // Finishing a later trial first is a legitimate move, not a no-op.
  s = finishAttempt(s, "bow", win());
  assert.equal(s.records.bow.cleared, "cleared");
  assert.deepEqual(readArcade(JSON.stringify(s)), s, "a save with only a later trial cleared must still round-trip");
  s = assistTrial(s, "lotus"); s = assistTrial(s, "cyclops"); s = assistTrial(s, "aeolus"); s = assistTrial(s, "circe"); s = finishAttempt(s, "sirens", win()); s = assistTrial(s, "scylla"); s = assistTrial(s, "calypso"); s = finishAttempt(s, "bow", win());
  assert.equal(clearedCount(s), 8); assert.deepEqual(readArcade(JSON.stringify(s)), s);
  const failed = { ...win(), won: false };
  s = finishAttempt(s, "sirens", failed);
  assert.equal(s.records.sirens.cleared, "cleared"); assert.equal(s.records.sirens.attempts, 2);
});
test("assisted trials can be replayed and upgraded to cleared", () => {
  let s = assistTrial(assistTrial(started(), "lotus"), "cyclops"); assert.equal(s.records.cyclops.cleared, "assisted");
  s = finishAttempt(s, "cyclops", win()); assert.equal(s.records.cyclops.cleared, "cleared");
  for (let i = 0; i < 5; i++) s = finishAttempt(s, "cyclops", win());
  assert.equal(s.records.cyclops.recent.length, 2); assert.equal(s.records.cyclops.attempts, 6);
});
test("malformed and impossible saves are rejected; out-of-order progress is legitimate", () => {
  assert.equal(readArcade("bad"), null); assert.equal(readArcade("null"), null);
  const s = newArcade(); s.records.bow.cleared = "cleared";
  assert.equal(readArcade(JSON.stringify(s)), null, "progress on an un-started voyage is still invalid");
  // A later trial attempted (or cleared) while an earlier one is still pending
  // is now an intended, legitimate save shape — every trial is open from the
  // start, so there is no "locked encounter" left to skip.
  const s2 = started(); s2.records.sirens.attempts = 1;
  assert.deepEqual(readArcade(JSON.stringify(s2)), s2);
  const s3 = started(); s3.records.cyclops.recent = [{ ...win(), laneMs: [-1, 0, 0] }]; s3.records.cyclops.attempts = 1; assert.equal(readArcade(JSON.stringify(s3)), null, "a genuinely malformed summary is still rejected");
});
test("cross-encounter and extra-field model plans are invalid", () => {
  assert.equal(validPlan("cyclops", { planId: "steady", focus: "left", source: "ai" }), false);
  assert.equal(validPlan("bow", { ...standardPlan("bow"), score: 3 }), false);
});

function request(body, signal) { return new Request("http://localhost:5173/api/arcade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); }
const sample = { trialId: "cyclops", difficulty: "easy", recent: [{ won: false, source: "standard", hits: 3, successes: 2, early: 0, late: 0, misses: 0, laneMs: [20000, 4000, 1000] }] };
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
    const body = await response.json(); assert.equal(body.plan.source, "ai"); assert.equal(body.plan.planId, "focused"); assert.match(body.description, /Lane pursuit/);
    assert.equal("score" in body, false);
    // The taunt travels beside the plan, never inside it.
    assert.deepEqual(Object.keys(body.plan).sort(), ["focus", "planId", "source"]); assert.equal(body.taunt, "You cannot hide in the left lane, Nobody.");
  }, async (_url, options) => {
    const body = JSON.parse(options.body); assert.equal(body.response_format.type, "json_schema"); assert.equal(body.max_tokens, 160);
    assert.deepEqual(body.response_format.json_schema.schema.required, ["planId", "focus", "taunt"]);
    assert.deepEqual(body.response_format.json_schema.schema.properties.focus.enum, ["left"]);
    assert.deepEqual(body.response_format.json_schema.schema.properties.planId.enum, ["focused", "sweep"]);
    return providerReply({ planId: "focused", focus: "left", taunt: "“You cannot hide in the left lane, Nobody.”" });
  });
});
test("reasoning models' think blocks are ignored and a missing taunt falls back to the rival's quote", async () => {
  await mockedProvider(async () => {
    const r = await POST(request(sample)); assert.equal(r.status, 200);
    const body = await r.json(); assert.equal(body.plan.planId, "sweep"); assert.match(body.taunt, /Nobody/);
  }, async () => Response.json({ choices: [{ message: { content: "<think>left lane habit</think>" + JSON.stringify({ planId: "sweep", focus: "left" }) } }] }));
});
test("hard preparation accepts first-time and timing histories with a single game-derived focus", async () => {
  for (const [trialId, recent, expected, planId] of [
    ["cyclops", [], "center", "sweep"],
    ["sirens", [{ ...sample.recent[0], hits: 0, early: 4, late: 1 }], "early", "echo"],
    ["bow", [{ ...sample.recent[0], hits: 0, early: 1, late: 4 }], "late", "surge"],
  ]) await mockedProvider(async () => {
    const r = await POST(request({ trialId, difficulty: "hard", recent })); assert.equal(r.status, 200);
    assert.equal((await r.json()).plan.focus, expected);
  }, async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body).response_format.json_schema.schema.properties.focus.enum, [expected]);
    return providerReply({ planId, focus: expected });
  });
});
test("new potion and strait rivals use their own constrained strategy catalogs", async () => {
  for (const [trialId, planId, catalog] of [["circe", "hoard", ["chain", "hoard"]], ["scylla", "undertow", ["pincer", "undertow"]]]) {
    await mockedProvider(async () => {
      const response = await POST(request({ trialId, difficulty: "normal", recent: [] }));
      assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.plan.planId, planId); assert.equal(body.plan.source, "ai");
    }, async (_url, options) => {
      const body = JSON.parse(options.body); assert.deepEqual(body.response_format.json_schema.schema.properties.planId.enum, catalog);
      return providerReply({ planId, focus: "balanced" });
    });
  }
  await mockedProvider(async () => {
    const r = await POST(request({ trialId: "sirens", difficulty: "normal", recent: [{ ...sample.recent[0], laneMisses: [0, 1, 5, 0] }] })); assert.equal(r.status, 200);
  }, async (_url, options) => {
    const observations = JSON.parse(JSON.parse(options.body).messages[1].content).observations; assert.equal(observations.weakestSongLane, "green");
    return providerReply({ planId: "echo", focus: "balanced" });
  });
});
test("invalid opponent results are uncertain, never silently replaced", async () => {
  for (const reply of [{ planId: "focused", focus: "right" }, { planId: "alternating", focus: "left" }, { planId: "steady", focus: "left" }, { planId: "focused", focus: "left", score: 999 }, { planId: "focused", focus: "early" }]) {
    await mockedProvider(async () => { const r = await POST(request(sample)); assert.equal(r.status, 422); const body = await r.json(); assert.equal(body.code, "invalid_plan"); assert.equal("plan" in body, false); }, async () => providerReply(reply));
  }
});
test("provider failures and rate limits expose recovery without awarding progress", async () => {
  for (const status of [404, 429, 500]) await mockedProvider(async () => { const r = await POST(request(sample)); assert.equal(r.status, 502); const error = (await r.json()).error; assert.match(error, /retry/i); assert.doesNotMatch(error, /standard/); }, async () => Response.json({ error: "test" }, { status }));
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
