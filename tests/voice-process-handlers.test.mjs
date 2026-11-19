import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// phonemizer (loaded by kokoro-js) installs process-wide handlers that re-throw
// every uncaught exception and unhandled rejection. Next only logs those, so
// with phonemizer loaded any stray error (such as a request aborted by a page
// reload) killed the game server with exit code 7.

test("a stray error after the voice loads is logged, not fatal", { timeout: 180_000 }, () => {
  const fixture = fileURLToPath(new URL("./fixtures/stray-error-after-voice.mjs", import.meta.url));
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", fixture], { encoding: "utf8", timeout: 170_000, maxBuffer: 64 * 1024 * 1024 }); // a crash prints phonemizer's whole one-line source
  const output = `exit ${run.status}\n${run.stdout}\n${(run.stderr ?? "").slice(-1200)}`;
  assert.match(run.stdout, /voice loaded/, output);
  assert.equal(run.status, 0, output);
  assert.match(run.stdout, /logged: aborted/, output);
  assert.match(run.stdout, /logged rejection: stray rejection/, output);
  assert.match(run.stdout, /SURVIVED/, output);
});

test("only the re-throwing handlers are dropped while a library loads", async () => {
  const { loadWithoutFatalHandlers } = await import("../server/lib/process-guard.ts");
  const keep = () => {};
  const rethrow = function (error) { throw error; };
  const rethrowUnlessExit = function (error) { if (!(error instanceof RangeError)) throw error; };
  const before = { exception: process.listenerCount("uncaughtException"), rejection: process.listenerCount("unhandledRejection") };
  const value = await loadWithoutFatalHandlers(async () => {
    process.on("uncaughtException", rethrowUnlessExit);
    process.on("unhandledRejection", rethrow);
    process.on("uncaughtException", keep);
    return 42;
  });
  try {
    assert.equal(value, 42);
    assert.equal(process.listeners("uncaughtException").includes(rethrowUnlessExit), false);
    assert.equal(process.listeners("unhandledRejection").includes(rethrow), false);
    assert.equal(process.listeners("uncaughtException").includes(keep), true, "a handler that does not re-throw is left alone");
    assert.equal(process.listenerCount("uncaughtException"), before.exception + 1);
    assert.equal(process.listenerCount("unhandledRejection"), before.rejection);
  } finally {
    process.removeListener("uncaughtException", keep);
  }
});
