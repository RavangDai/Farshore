import test from "node:test";
import assert from "node:assert/strict";
import { mockCommentary, mockMode, mockStatus, mockStrategy } from "../server/lib/mock-ai.ts";
import { validPlan } from "../src/lib/arcade/arcade.ts";

const ask = (mode, trialId = "cyclops", signal) => mockStrategy(new Request("http://localhost:3000/api/arcade", { method: "POST", body: JSON.stringify({ trialId, difficulty: "easy", recent: [] }), signal }), mode);
const withCookie = (value) => new Request("http://localhost:3000/api/arcade", { headers: { cookie: `theme=dark; farshore-ai-mock=${value}` } });

test("the mock mode comes from the environment first, then a local cookie, and ignores unknown values", () => {
  const saved = process.env.FARSHORE_AI_MOCK;
  try {
    delete process.env.FARSHORE_AI_MOCK;
    assert.equal(mockMode(new Request("http://localhost:3000/api/arcade")), null);
    assert.equal(mockMode(withCookie("error-once")), "error-once");
    assert.equal(mockMode(withCookie("everything")), null);
    process.env.FARSHORE_AI_MOCK = "slow";
    assert.equal(mockMode(withCookie("error")), "slow");
  } finally { if (saved === undefined) delete process.env.FARSHORE_AI_MOCK; else process.env.FARSHORE_AI_MOCK = saved; }
});

test("a mock success returns a plan the game accepts, for every trial", async () => {
  for (const trialId of ["lotus", "cyclops", "aeolus", "circe", "sirens", "scylla", "calypso", "bow"]) {
    const response = await ask("success", trialId), body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(validPlan(trialId, body.plan), true, trialId);
    assert.equal(body.plan.source, "ai");
    assert.ok(body.description.length > 0 && body.taunt.length > 0);
  }
});

test("asking again gives a different valid strategy, so regenerate and undo can be shown", async () => {
  const first = await (await ask("success", "aeolus")).json(), second = await (await ask("success", "aeolus")).json();
  assert.notEqual(first.plan.planId, second.plan.planId);
  assert.equal(validPlan("aeolus", second.plan), true);
});

test("error and uncertain answer like the live service, and the -once modes recover on the next request", async () => {
  const error = await ask("error-once");
  assert.equal(error.status, 502);
  assert.equal((await error.json()).code, "provider_error");
  assert.match(error.headers.get("set-cookie"), /farshore-ai-mock=success/);
  const uncertain = await ask("uncertain");
  assert.equal(uncertain.status, 422);
  assert.equal((await uncertain.json()).code, "invalid_plan");
  assert.equal(uncertain.headers.get("set-cookie"), null);
});

test("a slow strategy can be cancelled, and status and commentary follow the mode", async () => {
  const controller = new AbortController();
  const pending = ask("slow", "lotus", controller.signal);
  setTimeout(() => controller.abort(), 50);
  const cancelled = await pending;
  assert.equal(cancelled.status, 499);
  assert.equal((await mockStatus("offline").json()).aiAvailable, false);
  assert.equal((await mockStatus("success").json()).aiAvailable, true);
  const line = await mockCommentary(new Request("http://localhost:3000/api/commentary", { method: "POST", body: JSON.stringify({ speaker: "rival" }) }), "success");
  assert.equal((await line.json()).speaker, "rival");
  assert.equal((await mockCommentary(new Request("http://localhost:3000/api/commentary", { method: "POST", body: "{}" }), "error")).status, 503);
});
