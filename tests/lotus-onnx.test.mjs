import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as ort from "onnxruntime-web";
import { ACTIONS, OBS_SIZES } from "../src/lib/ai/lotus-agent.ts";

const root = new URL("../", import.meta.url);
const model = readFileSync(new URL("public/models/lotus/lotus-policy.onnx", root));
const meta = JSON.parse(readFileSync(new URL("public/models/lotus/lotus-policy.json", root), "utf8"));
const fixture = JSON.parse(readFileSync(new URL("tests/fixtures/lotus-parity.json", root), "utf8"));

test("the shipped model is the one its description and the parity fixture name", () => {
  const digest = createHash("sha256").update(model).digest("hex");
  assert.equal(meta.sha256, digest);
  assert.equal(fixture.sha256, digest);
  assert.equal(meta.obsSize, OBS_SIZES[meta.obsVersion], "the game builds this model's observation");
  assert.equal(fixture.obsSize, meta.obsSize);
  assert.deepEqual(meta.actions, [...ACTIONS]);
  assert.ok(meta.label && meta.checkpoint && Number.isInteger(meta.steps));
});

test("ONNX Runtime Web chooses the same action as PyTorch for every saved game observation", async () => {
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ["wasm"] });
  const n = fixture.observations.length, OBS_SIZE = meta.obsSize;
  assert.ok(n >= 100, `${n} observations`);
  const input = new Float32Array(n * OBS_SIZE);
  fixture.observations.forEach((row, i) => { assert.equal(row.length, OBS_SIZE); input.set(row, i * OBS_SIZE); });
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [n, OBS_SIZE]) });
  const logits = out[session.outputNames[0]].data;
  let mismatches = 0, maxDiff = 0;
  for (let i = 0; i < n; i++) {
    const row = Array.from(logits.slice(i * ACTIONS.length, (i + 1) * ACTIONS.length));
    const action = row.indexOf(Math.max(...row));
    if (action !== fixture.actions[i]) mismatches++;
    row.forEach((v, k) => { maxDiff = Math.max(maxDiff, Math.abs(v - fixture.logits[i][k])); });
  }
  assert.equal(mismatches, 0, `${mismatches} of ${n} actions differ`);
  assert.ok(maxDiff < 1e-3, `largest logit difference ${maxDiff}`);
});
