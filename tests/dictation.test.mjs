import test from "node:test";
import assert from "node:assert/strict";
import { DictationSession, dictationIssue } from "../src/lib/dictation.ts";

class Recognition {
  starts = 0;
  stops = 0;
  aborts = 0;
  onstart = null;
  onresult = null;
  onerror = null;
  onend = null;
  start() { this.starts++; }
  stop() { this.stops++; }
  abort() { this.aborts++; }
}

function setup(t, rec = new Recognition()) {
  const states = [], errors = [];
  let draft = "My existing counsel.";
  const session = new DictationSession(rec, {
    onState: (state) => states.push(state),
    onTranscript: (text) => { draft += " " + text; },
    onError: (code) => errors.push(code),
  });
  t.after(() => session.cancel());
  return { rec, session, states, errors, draft: () => draft };
}

const result = (text, isFinal = true) => ({ isFinal, 0: { transcript: text } });

test("dictation waits for the browser to start and appends each final result once", (t) => {
  const { session, rec, states, errors, draft } = setup(t);
  session.start();
  session.start();
  assert.equal(rec.starts, 1);
  assert.deepEqual(states, ["starting"]);
  rec.onstart();
  assert.equal(states.at(-1), "listening");
  rec.onresult({ resultIndex: 0, results: [result("uncertain", false)] });
  assert.equal(draft(), "My existing counsel.");
  rec.onresult({ resultIndex: 0, results: [result("Think of home.")] });
  rec.onresult({ resultIndex: 0, results: [result("Think of home."), result("Protect the crew.")] });
  rec.onend();
  assert.equal(draft(), "My existing counsel. Think of home. Protect the crew.");
  assert.equal(states.at(-1), "idle");
  assert.deepEqual(errors, []);
});

test("network failures retain the draft and explain the service issue, not silence", (t) => {
  const { session, rec, states, errors, draft } = setup(t);
  session.start();
  rec.onerror({ error: "network" });
  assert.deepEqual(errors, ["network"]);
  assert.equal(draft(), "My existing counsel.");
  assert.equal(states.at(-1), "idle");
  assert.equal(rec.aborts, 1);
  assert.equal(dictationIssue(errors[0], true).title, "Speech service could not connect");
  assert.match(dictationIssue(errors[0], true).detail, /Brave.*Chrome/);
});

test("permission, device, service and silence failures have distinct recovery guidance", () => {
  const codes = ["not-allowed", "audio-capture", "service-not-allowed", "no-speech", "language-not-supported"];
  assert.equal(new Set(codes.map((code) => dictationIssue(code).title)).size, codes.length);
  assert.match(dictationIssue("not-allowed").detail, /site settings/);
  assert.match(dictationIssue("audio-capture").detail, /microphone is connected/);
  assert.match(dictationIssue("no-speech").detail, /wait for.*Listening/);
});

test("cancelling rejects late results and late aborted errors", (t) => {
  const { session, rec, states, errors, draft } = setup(t);
  session.start();
  const lateResult = rec.onresult, lateError = rec.onerror, lateStart = rec.onstart;
  session.cancel();
  lateStart();
  lateResult({ resultIndex: 0, results: [result("Unwanted late transcript.")] });
  lateError({ error: "aborted" });
  assert.equal(draft(), "My existing counsel.");
  assert.deepEqual(errors, []);
  assert.equal(states.at(-1), "idle");
  assert.equal(rec.onresult, null);
});

test("stopping waits for the final transcript before becoming idle", (t) => {
  const { session, rec, states, errors, draft } = setup(t);
  session.start();
  rec.onstart();
  session.stop();
  assert.equal(states.at(-1), "finishing");
  assert.equal(rec.stops, 1);
  rec.onresult({ resultIndex: 0, results: [result("Sail home.")] });
  rec.onend();
  assert.equal(draft(), "My existing counsel. Sail home.");
  assert.equal(states.at(-1), "idle");
  assert.deepEqual(errors, []);
});

test("a deliberate stop does not show a false no-speech error", (t) => {
  const { session, rec, errors } = setup(t);
  session.start();
  session.stop();
  rec.onerror({ error: "no-speech" });
  assert.deepEqual(errors, []);
});

test("an unexpected empty result reports silence and unlocks retry", (t) => {
  const { session, rec, states, errors } = setup(t);
  session.start();
  rec.onstart();
  rec.onend();
  assert.deepEqual(errors, ["no-speech"]);
  assert.equal(states.at(-1), "idle");
});

test("a rejected start never leaves dictation listening", (t) => {
  const rec = new Recognition();
  rec.start = () => { const error = new Error("Denied"); error.name = "NotAllowedError"; throw error; };
  const { session, states, errors } = setup(t, rec);
  session.start();
  assert.deepEqual(errors, ["not-allowed"]);
  assert.deepEqual(states, ["starting", "idle"]);
});

test("an unresponsive service times out and releases the microphone", (t) => {
  let timeout;
  t.mock.method(globalThis, "setTimeout", (callback) => { timeout = callback; return 1; });
  t.mock.method(globalThis, "clearTimeout", () => {});
  const { session, rec, states, errors } = setup(t);
  session.start();
  timeout();
  assert.deepEqual(errors, ["timeout"]);
  assert.equal(states.at(-1), "idle");
  assert.equal(rec.aborts, 1);
});
