import { writeFile } from "node:fs/promises";
import { loadEnv } from "vite";
import { validPlan } from "../src/lib/arcade.ts";
const base = process.argv[2] || "http://localhost:5173";
const output = process.argv[3] || ".tmp/arcade-spike.json";
const attempt = (overrides = {}) => ({ won: false, source: "standard", hits: 3, successes: 2, early: 0, late: 0, misses: 0, laneMs: [0, 0, 0], ...overrides });
const samples = [
  { label: "First-time easy Cyclops", trialId: "cyclops", difficulty: "easy", recent: [] },
  { label: "Left-lane habit", trialId: "cyclops", difficulty: "normal", recent: [attempt({ laneMs: [20000, 4000, 1000] })] },
  { label: "Right-lane habit", trialId: "cyclops", difficulty: "normal", recent: [attempt({ laneMs: [1000, 4000, 20000] })] },
  { label: "Early rowing", trialId: "sirens", difficulty: "easy", recent: [attempt({ hits: 0, early: 5, misses: 1 })] },
  { label: "Late bow release", trialId: "bow", difficulty: "normal", recent: [attempt({ hits: 0, successes: 1, late: 4 })] },
  { label: "Repeated rowing losses", trialId: "sirens", difficulty: "easy", recent: [attempt({ hits: 0, successes: 1, misses: 7 }), attempt({ hits: 0, successes: 2, misses: 6 })] },
];
const results = [], failures = [];
for (const { label, ...input } of samples) {
  const start = performance.now();
  const response = await fetch(base + "/api/arcade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(100000) });
  const answer = await response.json();
  const result = { label, input, status: response.status, seconds: Number(((performance.now() - start) / 1000).toFixed(3)), answer, legal: response.ok && validPlan(input.trialId, answer.plan) && answer.plan.source === "ai" };
  results.push(result); console.log(JSON.stringify(result));
}
// Record an actual unsupported request rejected before provider contact.
const invalid = await fetch(base + "/api/arcade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trialId: "cyclops", difficulty: "impossible", recent: [] }) });
failures.push({ kind: "Invalid application input", status: invalid.status, answer: await invalid.json() });
// Record two actual provider failures using the configured endpoint, without
// modifying .env or exposing credentials in evidence.
const env = { ...loadEnv("development", process.cwd(), "FARSHORE_"), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("FARSHORE_"))) };
const headers = { "Content-Type": "application/json", ...(env.FARSHORE_API_KEY ? { Authorization: "Bearer " + env.FARSHORE_API_KEY } : {}) };
for (const failure of [{ kind: "Missing model", body: JSON.stringify({ model: "farshore-deliberately-missing-model", messages: [{ role: "user", content: "Prepare opponent" }], stream: false }) }, { kind: "Malformed provider JSON", body: "{" }]) {
  const r = await fetch(env.FARSHORE_MODEL_URL, { method: "POST", headers, body: failure.body, signal: AbortSignal.timeout(10000) });
  failures.push({ kind: failure.kind, status: r.status, answer: await r.text() });
}
const times = results.filter(r => r.legal).map(r => r.seconds);
const evidence = { checkedAt: new Date().toISOString(), model: env.FARSHORE_MODEL_NAME, scope: "Six real strategy-preparation calls and three triggered failures. Small feasibility experiment, not a general accuracy benchmark or participant study.", results, failures, latency: times.length ? { min: Math.min(...times), average: Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(3)), max: Math.max(...times) } : null };
await writeFile(output, JSON.stringify(evidence, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, legal: results.filter(r => r.legal).length, latency: evidence.latency, failures }));
if (results.some(r => !r.legal) || failures.some(r => r.status < 400)) process.exitCode = 1;
