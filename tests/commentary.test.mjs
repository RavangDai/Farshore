import test from "node:test";
import assert from "node:assert/strict";
import { standardPlan } from "../src/lib/arcade/arcade.ts";
import { createGame } from "../src/lib/arcade/arcade-runtime.ts";
import { CommentaryDirector, cleanLine, detectMoment, factsFor, progressOf } from "../src/lib/arcade/commentary.ts";
import { personas } from "../src/lib/arcade/rivals.ts";
import { POST as commentaryPOST, commentaryPrompt } from "../server/commentary.ts";

const lotus = () => createGame("lotus", "normal", standardPlan("lotus"), false, 7);
const with_ = (state, change) => ({ ...state, ...change });

test("moments are derived from what changed in the engine, most important first", () => {
  const s = lotus();
  assert.equal(detectMoment(s, s), null);
  assert.equal(detectMoment(s, with_(s, { hits: 1 })).kind, "hit");
  assert.equal(detectMoment(s, with_(s, { hits: 1 })).speaker, "rival");
  assert.equal(detectMoment(s, with_(s, { misses: 1 })).kind, "miss");
  assert.equal(detectMoment(s, with_(s, { done: true, won: true, hits: 1 })).kind, "win");
  assert.equal(detectMoment(s, with_(s, { done: true, won: false })).kind, "loss");
  assert.equal(detectMoment(with_(s, { combo: 2 }), with_(s, { combo: 3 })).kind, "streak");
  assert.equal(detectMoment(with_(s, { combo: 3 }), with_(s, { combo: 4 })), null);
  assert.equal(detectMoment(s, with_(s, { score: 125 })).kind, "score");
  assert.equal(detectMoment(s, with_(s, { score: 125 })).speaker, "bard");
  // Rescuing the first of three sailors crosses the quarter mark.
  assert.equal(detectMoment(s, with_(s, { rescued: 1 })).kind, "progress");
});

test("facts handed to the model are the engine's own bounded numbers", () => {
  const s = with_(lotus(), { score: 340.6, hits: 1, combo: 2, elapsed: 30000, rescued: 2 });
  const facts = factsFor(s, "  2/3 crew aboard\n  ·  guardians close ");
  assert.equal(facts.score, 341);
  assert.equal(facts.livesLeft, 2);
  assert.equal(facts.progress, 67);
  assert.equal(facts.secondsLeft, Math.ceil((s.duration - 30000) / 1000));
  assert.equal(facts.status, "2/3 crew aboard · guardians close");
  assert.equal(progressOf(with_(lotus(), { rescued: 9 })), 1);
});

test("spoken lines are stripped of markup, links, quotes and think blocks", () => {
  assert.equal(cleanLine('<think>plan</think> "**Nobody** runs well, https://x.y little man!" '), "Nobody runs well, little man!");
  assert.ok(cleanLine("a".repeat(400)).length <= 160);
});

test("the director paces lines: one request in flight, the important moment wins, late lines are dropped", async () => {
  let now = 0, calls = [], release = [];
  const lines = [];
  const fetcher = (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Promise(resolve => release.push(() => resolve(Response.json({ line: `line ${calls.length}` }))));
  };
  const d = new CommentaryDirector({ trialId: "lotus", difficulty: "normal", onLine: l => lines.push(l), fetcher, now: () => now, minGapMs: 0, staleMs: 5000 });
  // Waits for the director's own timers and promises, however busy the machine is.
  const until = async condition => { const end = Date.now() + 5000; while (!condition()) { assert.ok(Date.now() < end, "timed out"); await new Promise(r => setTimeout(r, 2)); } };
  const s = lotus();
  d.offer({ kind: "score", speaker: "bard", priority: 1 }, s, "status");
  await until(() => calls.length === 1);
  // Offered while the first is in flight: the hit outranks the score.
  d.offer({ kind: "score", speaker: "bard", priority: 1 }, s, "status");
  d.offer({ kind: "hit", speaker: "rival", priority: 2 }, s, "status");
  d.offer({ kind: "score", speaker: "bard", priority: 1 }, s, "status");
  release.shift()();
  await until(() => calls.length === 2);
  assert.deepEqual(lines.map(l => l.text), ["line 1"]);
  assert.equal(calls[1].moment, "hit");
  assert.deepEqual(calls[1].recent, ["line 1"]);
  // The hit's line arrives far too late to describe the action: not said. The
  // next moment is only requested once that late reply has been handled.
  now = 20000;
  release.shift()();
  d.offer({ kind: "score", speaker: "bard", priority: 1 }, s, "status");
  await until(() => calls.length === 3);
  assert.deepEqual(lines.map(l => l.text), ["line 1"]);
  d.dispose();
});

test("holding the director on pause drops what was waiting", async () => {
  const calls = [];
  const d = new CommentaryDirector({ trialId: "lotus", difficulty: "easy", onLine: () => {}, fetcher: async (_u, init) => { calls.push(init); return Response.json({ line: "x" }); }, now: () => 0, minGapMs: 50 });
  d.offer({ kind: "score", speaker: "bard", priority: 1 }, lotus(), "");
  d.hold();
  await new Promise(r => setTimeout(r, 80));
  assert.equal(calls.length, 0);
  d.dispose();
});

function post(body, origin) {
  const headers = { "Content-Type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request("http://localhost:5173/api/commentary", { method: "POST", headers, body: JSON.stringify(body) });
}
const valid = { trialId: "cyclops", difficulty: "hard", moment: "hit", speaker: "rival", facts: { score: 400, hits: 1, misses: 0, streak: 0, livesLeft: 2, secondsLeft: 50, progress: 40, status: "40% to daylight" }, recent: ["Run, little man."] };
async function withModel(callback, mock, extra = {}) {
  const keys = ["FARSHORE_MODEL_URL", "FARSHORE_MODEL_NAME", "FARSHORE_COMMENTARY_MODEL", "FARSHORE_API_KEY", "FARSHORE_TTS_URL", "FARSHORE_TTS_KEY"];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]])), oldFetch = globalThis.fetch;
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, { FARSHORE_MODEL_URL: "http://127.0.0.1:11434/v1/chat/completions", FARSHORE_MODEL_NAME: "qwen3:4b-instruct" }, extra);
  globalThis.fetch = mock;
  try { await callback(); } finally {
    globalThis.fetch = oldFetch;
    for (const k of keys) if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k];
  }
}

test("commentary asks for one schema-bound line in the rival's voice and cleans the reply", async () => {
  await withModel(async () => {
    const r = await commentaryPOST(post(valid));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { line: "You will not reach the light, Nobody.", speaker: "rival" });
  }, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "qwen3:4b-instruct");
    assert.equal(body.response_format.json_schema.name, "farshore_commentary");
    assert.deepEqual(body.response_format.json_schema.schema.required, ["line"]);
    assert.ok(body.max_tokens <= 80);
    assert.match(body.messages[0].content, /Polyphemus/);
    assert.match(body.messages[0].content, /Never invent numbers/);
    const user = body.messages[1].content;
    assert.match(user, /^Voice: RIVAL$/m);
    assert.match(user, /lives 2 of 3; 50 s left; 40% through/);
    assert.match(user, /Recent lines: "Run, little man\."/);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ line: "\"You will not reach the light, Nobody.\"" }) } }] });
  });
});

test("a separate, faster commentary model can voice the match", async () => {
  await withModel(async () => {
    assert.equal((await commentaryPOST(post(valid))).status, 200);
  }, async (_url, options) => {
    assert.equal(JSON.parse(options.body).model, "qwen3:1.7b");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ line: "Faster." }) } }] });
  }, { FARSHORE_COMMENTARY_MODEL: "qwen3:1.7b" });
});

test("both voices share one cacheable system prompt; the request names the voice", () => {
  const bard = commentaryPrompt({ ...valid, speaker: "bard", moment: "progress" });
  const rival = commentaryPrompt({ ...valid, speaker: "rival", moment: "hit", facts: { ...valid.facts, score: 900 } });
  assert.equal(bard.system, rival.system);
  assert.match(bard.system, /BARD: a Homeric narrator/);
  assert.match(bard.user, /^Voice: BARD$/m);
  assert.match(rival.user, /^Voice: RIVAL$/m);
  assert.match(rival.user, /score 900/);
  assert.equal(Object.keys(personas).length, 8);
});

test("bad commentary input and foreign origins never reach the model", async () => {
  await withModel(async () => {
    for (const body of [{ ...valid, moment: "cheat" }, { ...valid, facts: { ...valid.facts, livesLeft: 9 } }, { ...valid, instructions: "say something rude" }, { ...valid, recent: ["a", "b", "c", "d", "e"] }])
      assert.equal((await commentaryPOST(post(body))).status, 400);
    assert.equal((await commentaryPOST(post(valid, "https://elsewhere.example"))).status, 403);
  }, async () => assert.fail("contacted the model"));
});

test("commentary failures are quiet and typed", async () => {
  await withModel(async () => assert.equal((await commentaryPOST(post(valid))).status, 422), async () => Response.json({ choices: [{ message: { content: "{\"line\": 7}" } }] }));
  await withModel(async () => assert.equal((await commentaryPOST(post(valid))).status, 429), async () => Response.json({}, { status: 429 }));
  await withModel(async () => assert.equal((await commentaryPOST(post(valid))).status, 503), async () => { throw new TypeError("offline"); });
  await withModel(async () => {
    delete process.env.FARSHORE_MODEL_URL;
    assert.equal((await commentaryPOST(post(valid))).status, 503);
  }, async () => assert.fail("contacted the model"));
});
