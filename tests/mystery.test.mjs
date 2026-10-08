import test from "node:test";
import assert from "node:assert/strict";
import { act, newCase, parseCase, readCase, stars, repliesFor, hintsFor } from "../src/lib/mystery.ts";
import { POST } from "../server/mystery.ts";

function play(actions = []) {
  let state = act(newCase(), { type: "start" }).state;
  for (const action of actions) {
    const result = act(state, action);
    assert.equal(result.success, true, result.message);
    state = result.state;
  }
  return state;
}
const unlock = [
  { type: "inspect", id: "pedestal" }, { type: "take", item: "cord" },
  { type: "inspect", id: "inscription" }, { type: "inspect", id: "ledger" },
  { type: "timeline", order: ["whole", "broken", "locked"] },
];
const restore = [
  ...unlock, { type: "room", room: "workshop" },
  { type: "inspect", id: "carving" }, { type: "inspect", id: "bench" }, { type: "take", item: "fragments" },
  { type: "restore", order: ["sun", "wave", "moon"] },
];
const escape = [...restore, { type: "room", room: "harbor" }, { type: "inspect", id: "instructions" },
  { type: "gate", item: "seal", facing: "wave", motion: "raise" }];

test("a complete case can escape, solve the mystery and discover motive without AI", () => {
  const state = play([...escape,
    { type: "inspect", id: "watch" },
    { type: "deduce", suspect: "eurylochus", cause: "moved", evidence: ["cord", "watch"] },
    { type: "room", room: "workshop" }, { type: "inspect", id: "drawer" }, { type: "drawer", item: "cord" },
    { type: "statement", actor: "eurylochus", replyId: "eurylochus-truth" },
  ]);
  assert.equal(stars(state), 3);
  assert.ok(state.clues.includes("confession"));
  assert.deepEqual(readCase(JSON.stringify(state)), state);
  assert.ok(state.items.includes("cord"));
  assert.ok(state.items.includes("seal"));
  assert.ok(!state.items.includes("fragments"));
});
test("escape does not award the evidence or motive stars automatically", () => {
  const state = play(escape);
  assert.equal(stars(state), 1);
  assert.equal(state.deductionSolved, false);
  assert.equal(state.motiveFound, false);
});
test("locked rooms, remote objects, and inventory cannot bypass prerequisites", () => {
  const state = play();
  for (const action of [
    { type: "room", room: "workshop" }, { type: "inspect", id: "watch" },
    { type: "take", item: "cord" }, { type: "take", item: "fragments" },
    { type: "timeline", order: ["whole", "broken", "locked"] },
    { type: "gate", item: "seal", facing: "wave", motion: "raise" },
  ]) {
    const result = act(state, action);
    assert.equal(result.success, false);
    assert.deepEqual(result.state, state);
  }
});
test("wrong puzzle answers keep inventory, clues, and stars intact", () => {
  let state = play(unlock);
  const before = structuredClone(state);
  assert.equal(act(state, { type: "timeline", order: ["broken", "whole", "locked"] }).success, false);
  assert.deepEqual(state, before);
  state = play(restore.slice(0, -1));
  const result = act(state, { type: "restore", order: ["moon", "wave", "sun"] });
  assert.equal(result.success, false);
  assert.ok(result.state.items.includes("fragments"));
  assert.equal(stars(result.state), 0);
});
test("restoration requires both authored inscriptions and collected fragments", () => {
  const state = play([...unlock, { type: "room", room: "workshop" }, { type: "inspect", id: "bench" }, { type: "take", item: "fragments" }]);
  assert.equal(act(state, { type: "restore", order: ["sun", "wave", "moon"] }).success, false);
});
test("repeated inspection and collection do not duplicate clues or items", () => {
  const state = play(unlock);
  let result = act(state, { type: "inspect", id: "inscription" });
  assert.deepEqual(result.added, []);
  result = act(result.state, { type: "take", item: "cord" });
  assert.equal(result.state.items.filter(i => i === "cord").length, 1);
  assert.equal(result.state.clues.filter(i => i === "cord").length, 1);
});
test("unsupported or duplicate evidence never confirms a theory", () => {
  const state = play([...restore, { type: "room", room: "harbor" }, { type: "inspect", id: "watch" }]);
  for (const evidence of [["cord", "cord"], ["cord", "circe"], ["watch"], ["cord", "watch", "inscription"]]) {
    assert.equal(act(state, { type: "deduce", suspect: "eurylochus", cause: "moved", evidence }).success, false);
  }
  assert.equal(act(state, { type: "deduce", suspect: "circe", cause: "curse", evidence: ["cord", "watch"] }).success, false);
});
test("optional motive works before escape, and the cord remains usable", () => {
  const state = play([...restore, { type: "inspect", id: "drawer" }, { type: "drawer", item: "cord" }]);
  assert.equal(stars(state), 1);
  assert.equal(state.escaped, false);
  assert.ok(state.items.includes("cord"));
  assert.equal(act(state, { type: "drawer", item: "seal" }).success, false);
});
test("hints never remove stars and can be used throughout the case", () => {
  let state = play(escape);
  for (let i = 0; i < 8; i++) state = act(state, { type: "hint" }).state;
  assert.equal(stars(state), 1);
  assert.equal(state.hints, 8);
});
test("a completed case offers replay guidance instead of an unfinished objective", () => {
  const state = play([...escape, { type: "inspect", id: "watch" },
    { type: "deduce", suspect: "eurylochus", cause: "moved", evidence: ["cord", "watch"] },
    { type: "room", room: "workshop" }, { type: "inspect", id: "drawer" }, { type: "drawer", item: "cord" },
  ]);
  assert.equal(stars(state), 3);
  assert.match(hintsFor(state)[0], /all three stars/);
  assert.ok(hintsFor(state).every(hint => !hint.includes("stuck drawer")));
});
test("character knowledge and confession are gated by authored progress", () => {
  const state = play([...unlock, { type: "room", room: "workshop" }]);
  assert.ok(!repliesFor("eurylochus", state).some(r => r.id === "eurylochus-truth"));
  assert.equal(act(state, { type: "statement", actor: "eurylochus", replyId: "eurylochus-truth" }).success, false);
  assert.equal(act(state, { type: "statement", actor: "circe", replyId: "circe-night" }).success, false);
  const result = act(state, { type: "statement", actor: "eurylochus", replyId: "eurylochus-night" });
  assert.ok(result.state.clues.includes("eurylochus"));
  assert.equal(result.state.deductionSolved, false);
});
test("save validation rejects malformed and impossible progress", () => {
  const base = play();
  for (const bad of [null, {}, { ...base, version: 2 }, { ...base, room: "troy" }, { ...base, clues: ["invented"] },
    { ...base, clues: ["cord", "cord"] }, { ...base, timelineSolved: true }, { ...base, escaped: true },
    { ...base, items: ["seal"] }, { ...base, motiveFound: true }, { ...base, hints: -1 }]) assert.equal(parseCase(bad), null);
  assert.equal(readCase("{broken"), null);
  assert.equal(readCase("x".repeat(20001)), null);
  assert.deepEqual(parseCase(newCase()), newCase());
});
test("every reachable step round-trips through the versioned case save", () => {
  let state = act(newCase(), { type: "start" }).state;
  for (const action of [...escape, { type: "room", room: "workshop" }, { type: "inspect", id: "drawer" }, { type: "drawer", item: "cord" }]) {
    state = act(state, action).state;
    assert.deepEqual(readCase(JSON.stringify(state)), state, JSON.stringify(action));
  }
});
function configure(t) {
  for (const [key, value] of Object.entries({ FARSHORE_MODEL_URL: "http://127.0.0.1:11434/v1/chat/completions", FARSHORE_MODEL_NAME: "llama3.2:3b", FARSHORE_API_KEY: "test-key" })) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}
function question(actor = "circe", state = play(), text = "Why is the gate locked?", extras = {}) {
  return new Request("http://localhost:5173/api/mystery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor, state, question: text }), ...extras });
}
function completion(value) { return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] }); }
test("AI matches only permitted authored answers and cannot generate score or clues", async t => {
  configure(t);
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
    assert.ok(body.response_format.json_schema.schema.properties.replyId.enum.includes("circe-purpose"));
    assert.equal(body.messages.at(-1).content, "Why is the gate locked?");
    assert.ok(!body.messages[0].content.includes("harbor watch log"));
    return completion({ replyId: "circe-purpose" });
  });
  const response = await POST(question());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.text, repliesFor("circe", play()).find(r => r.id === "circe-purpose").text);
  assert.equal(result.source, "ai-match");
  assert.equal(result.stars, undefined);
  assert.ok(!JSON.stringify(result).includes("test-key"));
});
test("model-invented answers, unavailable character replies, and extra fields are rejected", async t => {
  configure(t);
  const mock = t.mock.method(globalThis, "fetch", async () => completion({ replyId: "invented" }));
  for (const value of [{ replyId: "invented" }, { replyId: "eurylochus-truth" }, { replyId: "circe-purpose", stars: 3 }, {}]) {
    mock.mock.mockImplementation(async () => completion(value));
    assert.equal((await POST(question())).status, 502);
  }
});
test("invalid question, save, character room, or foreign origin never reaches a model", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Should not call"); });
  assert.equal((await POST(question("circe", play(), "x"))).status, 400);
  assert.equal((await POST(question("circe", {}))).status, 400);
  assert.equal((await POST(question("eurylochus"))).status, 400);
  assert.equal((await POST(question("circe", play(), "hello", { headers: { origin: "https://elsewhere.example" } }))).status, 403);
});
test("model failure stays visible without silently substituting an answer", async t => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("offline"); });
  const response = await POST(question());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).source, undefined);
});
test("cancelling an AI question propagates to the model request", async t => {
  configure(t);
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    controller.abort();
    assert.equal(init.signal.aborted, true);
    init.signal.throwIfAborted();
  });
  assert.equal((await POST(question("circe", play(), "Why locked?", { signal: controller.signal }))).status, 499);
});
