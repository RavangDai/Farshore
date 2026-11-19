"use client";
import { Gauge, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { standardPlan } from "../../lib/arcade/arcade";
import { DOCTRINE_ALGORITHMS, DOCTRINE_LABELS } from "../../lib/ai/cyclops";
import { PLAN_EFFECTS } from "../../lib/ai/feeds";
import { agentStep, observe } from "../../lib/ai/lotus-agent";
import { LOTUS_MODEL_META_URL, loadLotusPolicy } from "../../lib/ai/lotus-onnx";
import { RACE_LAYOUTS } from "../../lib/encounters/lotus-layouts";
import { newRace } from "../../lib/encounters/lotus-race";

type Meta = {
  label: string; run: string; steps: number; seed: number; obsVersion: number; obsSize: number; exportedAt: string; sha256: string;
  validation?: { runs: number; full_rescue_rate: number; avg_rescued: number; median_finish_s: number | null; avg_hits: number };
  parity?: { observations: number; mismatches: number; maxLogitDifference: number };
};
type Bench = { runs: number; median: number; p95: number; min: number; loadMs: number | null; device: string };
type ModelInfo = { status: "checking" | "online" | "offline"; model: string | null; commentary: string | null; oracle?: string | null; embedder?: string | null };

/**
 * Held-out evaluation of the shipped policy and its baselines. Copied from
 * docs/ai-eval/lotus-race.md (training/evaluate_lotus.py --run ppo-v3,
 * 2026-11-12): 120 unseen gardens x three difficulties = 360 runs each.
 */
const HELD_OUT = [
  { policy: "PPO v3 (2M steps), the shipped rival", rate: 0.944, rescued: 2.92, hits: 0.23 },
  { policy: "Guardian-aware A* (hand-written search)", rate: 0.936, rescued: 2.91, hits: 0.13 },
  { policy: "Plain A* (shortest path)", rate: 0.667, rescued: 2.45, hits: 1.27 },
  { policy: "Same policy in the browser (ONNX)", rate: 0.944, rescued: 2.92, hits: 0.23 },
];

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Times the trained policy on real garden states, on this device. Nothing is estimated. */
async function benchmark(runs = 150): Promise<Bench> {
  const t0 = performance.now();
  const policy = await loadLotusPolicy();
  const loadMs = performance.now() - t0;
  const fresh = () => newRace(RACE_LAYOUTS[0], "normal", standardPlan("lotus")).ai;
  let s = fresh();
  await policy.act(observe(s, policy.meta.obsVersion));
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const obs = observe(s, policy.meta.obsVersion);
    const a = performance.now();
    const { action } = await policy.act(obs);
    times.push(performance.now() - a);
    agentStep(s, action);
    if (s.done) s = fresh();
  }
  times.sort((x, y) => x - y);
  return { runs, median: times[Math.floor(runs / 2)], p95: times[Math.floor(runs * 0.95)], min: times[0], loadMs, device: `${navigator.hardwareConcurrency ?? "?"} logical cores · WebAssembly, 1 thread` };
}

export function ModelLab({ model }: { model: ModelInfo }) {
  const [meta, setMeta] = useState<Meta | null>(null), [metaError, setMetaError] = useState("");
  const [bench, setBench] = useState<Bench | "running" | null>(null), [benchError, setBenchError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch(LOTUS_MODEL_META_URL, { signal: c.signal }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then(setMeta).catch(e => { if (!c.signal.aborted) setMetaError(e instanceof Error ? e.message : "unavailable"); });
    return () => c.abort();
  }, []);
  async function run() {
    setBench("running"); setBenchError("");
    try { setBench(await benchmark()); } catch (e) { setBench(null); setBenchError(e instanceof Error ? e.message : "The model could not be run."); }
  }
  return <div className="cn-models">
    <article className="cn-model-card" data-kind="trained">
      <header><span className="cn-badge">Trained</span><h3>Lotus-Eaters rival</h3><p>Reinforcement learning (PPO), exported to ONNX, run in this browser.</p></header>
      {meta ? <dl className="cn-facts">
        <div><dt>Checkpoint</dt><dd>{meta.label} · run <code>{meta.run}</code></dd></div>
        <div><dt>Training</dt><dd>{meta.steps.toLocaleString()} steps · seed {meta.seed}</dd></div>
        <div><dt>Observation</dt><dd>v{meta.obsVersion}, {meta.obsSize} values → 5 moves</dd></div>
        <div><dt>Exported</dt><dd>{new Date(meta.exportedAt).toLocaleString()} · sha256 <code>{meta.sha256.slice(0, 12)}…</code></dd></div>
        {meta.validation && <div><dt>Validation</dt><dd>{pct(meta.validation.full_rescue_rate)} full rescues over {meta.validation.runs} runs · {meta.validation.avg_hits.toFixed(2)} hits per run{meta.validation.median_finish_s ? ` · median ${meta.validation.median_finish_s.toFixed(1)} s` : ""}</dd></div>}
        {meta.parity && <div><dt>Browser parity</dt><dd>{meta.parity.mismatches} of {meta.parity.observations} moves differ from Python · max logit gap {meta.parity.maxLogitDifference.toExponential(1)}</dd></div>}
      </dl> : <p className="cn-note">{metaError ? `Model description unavailable (${metaError}).` : "Reading the model description…"}</p>}
      <div className="cn-bench">
        <button type="button" className="cn-ghost" onClick={run} disabled={bench === "running"}>{bench === "running" ? <Loader2 size={16} className="cn-spin" /> : <Gauge size={16} strokeWidth={1.4} />}<span>{bench === "running" ? "Measuring…" : "Measure inference on this device"}</span></button>
        {bench && bench !== "running" && <dl className="cn-facts cn-bench-out">
          <div><dt>Per decision</dt><dd>median {bench.median.toFixed(2)} ms · p95 {bench.p95.toFixed(2)} ms · fastest {bench.min.toFixed(2)} ms</dd></div>
          <div><dt>Sample</dt><dd>{bench.runs} decisions on the classic garden, played forward by the policy itself</dd></div>
          <div><dt>Load</dt><dd>{bench.loadMs !== null ? `${bench.loadMs.toFixed(0)} ms (cached after the first time)` : "—"} · {bench.device}</dd></div>
        </dl>}
        {benchError && <p className="cn-note" role="alert">{benchError}</p>}
      </div>
      <table className="cn-table">
        <caption>Held-out gardens (360 runs each, never seen in training)</caption>
        <thead><tr><th scope="col">Policy</th><th scope="col">Full rescue</th><th scope="col">Sailors</th><th scope="col">Hits</th></tr></thead>
        <tbody>{HELD_OUT.map(r => <tr key={r.policy}><th scope="row">{r.policy}</th><td>{pct(r.rate)}</td><td>{r.rescued.toFixed(2)}</td><td>{r.hits.toFixed(2)}</td></tr>)}</tbody>
      </table>
      <p className="cn-note">Source: <code>docs/ai-eval/lotus-race.md</code>, generated by <code>training/evaluate_lotus.py</code>.</p>
    </article>

    <article className="cn-model-card" data-kind="language">
      <header><span className="cn-badge">Language model</span><h3>The Oracle and the voices</h3><p>Writes the Oracle’s question from retrieved passages of Homer, and the bard’s and rivals’ lines. Never asked per frame; never moves a rival.</p></header>
      <dl className="cn-facts">
        <div><dt>Status</dt><dd>{model.status === "online" ? "Connected" : model.status === "checking" ? "Checking…" : "Not connected"}</dd></div>
        <div><dt>Commentary</dt><dd>{model.commentary ?? "—"}</dd></div>
        <div><dt>Oracle</dt><dd>{model.oracle ?? model.model ?? "—"}</dd></div>
        <div><dt>Retrieval</dt><dd>{model.embedder ? `${model.embedder} embeddings + BM25 keywords` : "BM25 keywords"}</dd></div>
      </dl>
    </article>

    <article className="cn-model-card" data-kind="rules">
      <header><span className="cn-badge">Rules &amp; search</span><h3>The other rivals</h3><p>Hand-written decision systems. They read the live game, weigh options and act within rules the game enforces. None of them is trained.</p></header>
      <dl className="cn-facts">
        <div><dt>Polyphemus</dt><dd>{(["rotation", "hunt", "cutoff", "press"] as const).map(d => `${DOCTRINE_LABELS[d]} (${DOCTRINE_ALGORITHMS[d]})`).join(" · ")}</dd></div>
        <div><dt>The Sirens</dt><dd>Score candidate melodies against your measured misses per lane, novelty and complexity; set the tempo from your measured reply time.</dd></div>
        <div><dt>Antinous</dt><dd>Weighs full, steady, boastful and blocking shots with the hall’s own physics, and presses or guards by the score.</dd></div>
        <div><dt>Circe</dt><dd>{PLAN_EFFECTS.circe?.chain}</dd></div>
        <div><dt>Scylla</dt><dd>{PLAN_EFFECTS.scylla?.pincer} {PLAN_EFFECTS.scylla?.undertow}</dd></div>
        <div><dt>Winds &amp; storm</dt><dd>{PLAN_EFFECTS.aeolus?.undertow} {PLAN_EFFECTS.calypso?.undertow}</dd></div>
        <div><dt>Lotus guardians</dt><dd>{PLAN_EFFECTS.lotus?.undertow}</dd></div>
        <div><dt>Adaptive tactic</dt><dd>Before each round the game reads your last two attempts and plays the gentler tactic after two losses, the sharper one otherwise. Bounded: two tactics per trial, the same history always gives the same choice.</dd></div>
      </dl>
    </article>
  </div>;
}
