import test from "node:test";
import assert from "node:assert/strict";
import { SERVER_DOWN, failureMessage } from "../src/lib/ai/call-errors.ts";
import { CommentaryError, fetchLine, requestLine } from "../src/lib/arcade/commentary.ts";
import { OracleError, askOracle } from "../src/lib/ai/oracle.ts";
import { POST as commentaryPOST } from "../server/commentary.ts";
import { POST as oraclePOST } from "../server/oracle/oracle.ts";

// Phase 4: every AI call either shows a real result or says plainly why not,
// and a basic input check runs before any model is called.

const body = { trialId: "lotus", difficulty: "normal", moment: "start", speaker: "bard", facts: { score: 0, hits: 0, misses: 0, streak: 0, livesLeft: 3, secondsLeft: null, progress: 0, status: "" }, recent: [] };
const serverStopped = async () => { throw new TypeError("Failed to fetch"); };
const timedOut = async () => { throw new DOMException("The operation timed out.", "TimeoutError"); };

test("a call with no answer is named: timed out, or no server", () => {
  assert.equal(failureMessage(new DOMException("t", "TimeoutError"), "Too slow."), "Too slow.");
  assert.equal(failureMessage(new TypeError("Failed to fetch"), "Too slow."), SERVER_DOWN);
});

test("commentary: a stopped server, a timeout and a model error each give a clear message", async () => {
  await assert.rejects(fetchLine(body, undefined, serverStopped), e => e instanceof CommentaryError && e.message === SERVER_DOWN);
  await assert.rejects(fetchLine(body, undefined, timedOut), e => e instanceof CommentaryError && /too long/.test(e.message));
  const modelDown = async () => Response.json({ error: "The model is not reachable." }, { status: 503 });
  await assert.rejects(fetchLine(body, undefined, modelDown), e => e instanceof CommentaryError && e.message === "The model is not reachable.");
  const htmlPage = async () => new Response("<html>Bad gateway</html>", { status: 502 });
  await assert.rejects(fetchLine(body, undefined, htmlPage), e => e instanceof CommentaryError && e.message.length > 0);
  assert.equal(await fetchLine(body, undefined, async () => Response.json({ line: "The sailors wake." })), "The sailors wake.");
});

test("commentary: live lines stay quiet on failure, and a cancelled request is not reported as one", async () => {
  assert.equal(await requestLine(body, undefined, serverStopped), "");
  const controller = new AbortController(); controller.abort();
  const cancelled = async () => { throw new DOMException("Aborted", "AbortError"); };
  await assert.rejects(fetchLine(body, controller.signal, cancelled), e => !(e instanceof CommentaryError) && e.name === "AbortError");
});

test("oracle: a stopped server is a clear message the player can retry", async () => {
  await assert.rejects(askOracle("lotus", new AbortController().signal, serverStopped), e => e instanceof OracleError && e.message === SERVER_DOWN && e.code === "network");
  await assert.rejects(askOracle("lotus", new AbortController().signal, timedOut), e => e instanceof OracleError && /took too long/.test(e.message));
  const unchecked = async () => Response.json({ error: "The Oracle's question could not be checked against the text, so it was set aside. Ask again.", code: "invalid_question" }, { status: 422 });
  await assert.rejects(askOracle("lotus", new AbortController().signal, unchecked), e => e instanceof OracleError && e.code === "invalid_question" && /Ask again/.test(e.message));
});

test("the back end rejects empty or unknown input before calling a model", async () => {
  const post = (path, text) => new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
  const connection = { url: "http://127.0.0.1:9/never-called", model: "none" };
  assert.equal((await commentaryPOST(post("/api/commentary", ""), connection)).status, 400);
  assert.equal((await commentaryPOST(post("/api/commentary", "{}"), connection)).status, 400);
  assert.equal((await oraclePOST(post("/api/oracle", "{}"), connection)).status, 400);
  assert.equal((await oraclePOST(post("/api/oracle", JSON.stringify({ trialId: "troy" })), connection)).status, 400);
});
