"use client";
import { ACTIONS, OBS_SIZES } from "./lotus-agent";

/**
 * Loads the trained Lotus-Eaters rival into the browser.
 *
 * The PPO policy is exported to ONNX by training/export_lotus_onnx.py and run
 * with ONNX Runtime Web on WebAssembly, on this machine, with no server round
 * trip. The runtime's .wasm is served by the game itself (app/ort/[file]), so
 * it works offline and under the game's content security policy.
 *
 * The model's metadata names the checkpoint it came from; a model exported for
 * a different observation layout is refused rather than raced.
 */

export const LOTUS_MODEL_URL = "/models/lotus/lotus-policy.onnx";
export const LOTUS_MODEL_META_URL = "/models/lotus/lotus-policy.json";

export type LotusModelMeta = {
  label: string;
  checkpoint: string;
  run: string;
  steps: number;
  seed: number;
  obsVersion: number;
  obsSize: number;
  actions: string[];
  exportedAt: string;
  sha256: string;
  validation?: { full_rescue_rate: number; avg_rescued: number; median_finish_s: number | null; runs: number };
};

export type LotusPolicy = {
  meta: LotusModelMeta;
  /** The action the policy chooses for one observation (built with `observe(state, meta.obsVersion)`): the highest logit. */
  act(observation: Float32Array): Promise<{ action: number; logits: Float32Array }>;
};

type Ort = typeof import("onnxruntime-web/wasm");
let runtime: Promise<Ort> | null = null;
let loading: Promise<LotusPolicy> | null = null;

function ort(): Promise<Ort> {
  runtime ??= import("onnxruntime-web/wasm").then(module => {
    // Single-threaded: the page is not cross-origin isolated, and a 175-input
    // network needs no more. The runtime's WebAssembly and its JavaScript glue
    // both come from the game's own origin (app/ort/[file]); the bundler cannot
    // locate the glue next to its own chunks.
    module.env.wasm.numThreads = 1;
    module.env.wasm.wasmPaths = { wasm: "/ort/ort-wasm-simd-threaded.wasm", mjs: "/ort/ort-wasm-simd-threaded.mjs" };
    return module;
  });
  return runtime;
}

async function load(): Promise<LotusPolicy> {
  const response = await fetch(LOTUS_MODEL_META_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`The trained rival's description could not be loaded (${response.status}).`);
  const meta = (await response.json()) as LotusModelMeta;
  if (OBS_SIZES[meta.obsVersion] !== meta.obsSize) {
    throw new Error(`The trained rival expects observation v${meta.obsVersion} with ${meta.obsSize} values, which this game cannot build. Export the model again.`);
  }
  if (meta.actions.join() !== ACTIONS.join()) throw new Error("The trained rival uses a different set of moves. Export the model again.");
  const o = await ort();
  const session = await o.InferenceSession.create(LOTUS_MODEL_URL, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  const input = session.inputNames[0], output = session.outputNames[0];
  // Runs are queued so one decision finishes before the next begins.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    meta,
    act(observation) {
      const run = queue.then(async () => {
        const result = await session.run({ [input]: new o.Tensor("float32", observation, [1, meta.obsSize]) });
        const logits = result[output].data as Float32Array;
        let action = 0;
        for (let i = 1; i < logits.length; i++) if (logits[i] > logits[action]) action = i;
        return { action, logits };
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

/** Loads the trained rival once per page; a failed load can be retried. */
export function loadLotusPolicy(): Promise<LotusPolicy> {
  loading ??= load().catch(error => {
    loading = null;
    throw error;
  });
  return loading;
}

// Development builds expose the loader so a browser check can confirm the page
// chooses the same moves as Python (see training/README.md, "Parity").
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { farshoreLotusPolicy?: typeof loadLotusPolicy }).farshoreLotusPolicy = loadLotusPolicy;
}
