import { mkdir, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { POST } from '../server/arcade.ts';
import { validPlan } from '../src/lib/arcade.ts';
// Standalone experiment: imports the production adapter, never runs a game UI.
const env = loadEnv('development', process.cwd(), 'FARSHORE_');
for (const [key, value] of Object.entries(env)) if (!process.env[key]) process.env[key] = value;
const modelUrl = process.env.FARSHORE_MODEL_URL;
if (!modelUrl || !process.env.FARSHORE_MODEL_NAME) throw new Error('Configure the existing local model first.');
const output = process.argv[2] || '.tmp/phase2-arcade-spike-2026-10-08.json';
const attempt = (values = {}) => ({ won: false, source: 'ai', hits: 2, successes: 2, early: 0, late: 0, misses: 0, laneMs: [0, 0, 0], ...values });
const inputs = [
  { id: 'S1', label: 'First-time Cyclops', input: { trialId: 'cyclops', difficulty: 'easy', recent: [] } },
  { id: 'S2', label: 'Circe after two losses', input: { trialId: 'circe', difficulty: 'normal', recent: [attempt(), attempt({ hits: 3 })] } },
  { id: 'S3', label: 'Sirens with red-lane misses', input: { trialId: 'sirens', difficulty: 'normal', recent: [attempt({ misses: 6, laneMisses: [5, 0, 1, 0] })] } },
  { id: 'S4', label: 'Strait after one hull loss', input: { trialId: 'scylla', difficulty: 'normal', recent: [attempt({ hits: 5 })] } },
  { id: 'S5', label: 'Archery after low ring score', input: { trialId: 'bow', difficulty: 'normal', recent: [attempt({ hits: 0, successes: 1 })] } },
  { id: 'S6', label: 'Cyclops with left-side habit', input: { trialId: 'cyclops', difficulty: 'hard', recent: [attempt({ laneMs: [21000, 3000, 1000] })] } },
];
const actualFetch = globalThis.fetch;
let exchanges = [];
globalThis.fetch = async (url, options) => {
  const response = await actualFetch(url, options);
  if (String(url) === modelUrl) exchanges.push({ status: response.status, request: JSON.parse(options.body), rawBody: await response.clone().text() });
  return response;
};
const samples = [];
for (const sample of inputs) {
  exchanges = [];
  const start = performance.now();
  const response = await POST(new Request('http://localhost:5173/api/arcade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample.input) }));
  const answer = await response.json();
  const result = { ...sample, seconds: Number(((performance.now() - start) / 1000).toFixed(3)), status: response.status, answer, legal: response.ok && validPlan(sample.input.trialId, answer.plan), providerExchanges: exchanges };
  samples.push(result);
  console.log(JSON.stringify({ id: result.id, status: result.status, seconds: result.seconds, answer: result.answer, legal: result.legal }));
}
globalThis.fetch = actualFetch;
const headers = { 'Content-Type': 'application/json', ...(process.env.FARSHORE_API_KEY ? { Authorization: 'Bearer ' + process.env.FARSHORE_API_KEY } : {}) };
const failures = [];
for (const probe of [
  { id: 'E1', label: 'Nonexistent provider model', body: JSON.stringify({ model: 'farshore-phase2-deliberately-missing', messages: [{ role: 'user', content: 'Prepare Circe' }], stream: false }) },
  { id: 'E2', label: 'Malformed provider JSON', body: '{' },
]) {
  const start = performance.now();
  const response = await actualFetch(modelUrl, { method: 'POST', headers, body: probe.body, signal: AbortSignal.timeout(10000) });
  failures.push({ ...probe, boundary: 'real provider', status: response.status, seconds: Number(((performance.now() - start) / 1000).toFixed(3)), rawBody: await response.text() });
}
const invalidInput = { trialId: 'scylla', difficulty: 'impossible', recent: [] };
const bad = await POST(new Request('http://localhost:5173/api/arcade', { method: 'POST', body: JSON.stringify(invalidInput) }));
failures.push({ id: 'E3', label: 'Unsupported difficulty', boundary: 'application before provider contact', input: invalidInput, status: bad.status, rawBody: await bad.text() });
const times = samples.filter(s => s.legal).map(s => s.seconds);
const evidence = { checkedAt: new Date().toISOString(), model: process.env.FARSHORE_MODEL_NAME, endpoint: 'loopback Ollama OpenAI-compatible endpoint', method: 'Six sequential realistic samples using production POST adapter from a standalone script. No UI or game save. Raw provider outputs captured. Temperature 0, strict schema, 100 output-token cap, no streaming.', scope: 'Feasibility and latency sample, not user research, enjoyment evidence, or a model accuracy benchmark.', samples, failures, latency: { min: Math.min(...times), average: Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(3)), max: Math.max(...times) } };
await mkdir('.tmp', { recursive: true });
await writeFile(output, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, legal: samples.filter(s => s.legal).length, latency: evidence.latency, failures }));
if (samples.some(s => !s.legal) || failures.some(f => f.status < 400)) process.exitCode = 1;
