// Standalone Phase 2 experiment. Never writes browser saves or changes .env.
// Run: node --experimental-strip-types scripts/phase2-spike.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { POST } from '../server/turn.ts';

try { process.loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const endpoint = process.env.FARSHORE_MODEL_URL;
const model = process.env.FARSHORE_MODEL_NAME;
if (!endpoint || !model) throw new Error('Configure FARSHORE_MODEL_URL and FARSHORE_MODEL_NAME first.');
const outputDir = path.resolve('Farshore Context and Assisment/docs/assignment/phase2/evidence');
await fs.mkdir(outputDir, { recursive: true });
const started = new Date().toISOString();
const resultPath = path.join(outputDir, `spike-${started.slice(0,10)}.json`);
if (await fs.stat(resultPath).catch(() => false)) throw new Error(`Evidence already exists: ${resultPath}. Move it to an archive before a new run.`);
const nativeFetch = globalThis.fetch;
const safeEndpoint = new URL(endpoint); safeEndpoint.username = ''; safeEndpoint.password = ''; safeEndpoint.search = '';
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(safeEndpoint.hostname);
const base = `${safeEndpoint.protocol}//${safeEndpoint.host}`;
const report = {
  experiment: 'Farshore Phase 2 technical spike', startedAt: started,
  model, endpoint: safeEndpoint.toString(), localModel: local,
  method: 'Six sequential realistic inputs through the production POST adapter in a standalone script. Capture each actual provider response separately from the adapter response. Wall-clock latency includes provider request, JSON parsing and validation. Failure timings are excluded from success statistics.',
  environment: { node: process.version, platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryGiB: +(os.totalmem()/2**30).toFixed(2), freeMemoryGiBAtStart: +(os.freemem()/2**30).toFixed(2), temperature: 0.2, maxTokens: 450, stream: false, appDeadlineSeconds: 90 },
  samples: [], failures: [], qualityReview: { status: 'Pending manual review', note: 'Structural validation does not establish semantic accuracy. No confidence percentages.' },
};
async function catalog(route) {
  try { const r = await nativeFetch(base + route, { signal: AbortSignal.timeout(5000) }); return {status:r.status,body:await r.json()}; }
  catch(e) { return {transportError: e.message}; }
}
if (local) {
  report.environment.installedModels = await catalog('/api/tags');
  report.environment.loadedModelsBefore = await catalog('/api/ps');
  report.environment.ollamaVersion = await catalog('/api/version');
}
async function save() { await fs.writeFile(resultPath, JSON.stringify(report, null, 2) + '\n'); }
await save();
const samples = [
  {id:'S1',encounterId:'lotus',trust:50,advice:'Let us bring the scouts aboard and leave before anyone else eats the lotus. Our families are waiting.',purpose:'Supportive safe counsel',expectedAdvice:'SAFE'},
  {id:'S2',encounterId:'winds',trust:100,advice:'Please do not open the bag. Keep it sealed and reassure the crew so we can reach home safely.',purpose:'Negation with safe counsel',expectedAdvice:'SAFE'},
  {id:'S3',encounterId:'winds',trust:100,advice:'Please open the bag and let the crew see what is inside. They deserve to share the treasure.',purpose:'Polite dangerous counsel',expectedAdvice:'DANGEROUS'},
  {id:'S4',encounterId:'cyclops',trust:50,advice:'Stay silent. Do not tell the Cyclops your name. Row away now.',purpose:'Direct safe counsel',expectedAdvice:'SAFE'},
  {id:'S5',encounterId:'circe',trust:50,advice:'Penelope has waited long enough. Ask Circe for the way home and prepare the ship to leave.',purpose:'Motivated safe counsel in another scene',expectedAdvice:'SAFE'},
  {id:'S6',encounterId:'lotus',trust:50,advice:'I am unsure. It sounds peaceful, but home matters too. What do you think?',purpose:'Ambiguous advice with no chosen action',expectedAdvice:'NONE'},
];
try {
  for (const sample of samples) {
    const exchanges = [];
    globalThis.fetch = async (url, init) => {
      const tick = performance.now();
      const exchange = { endpoint: safeEndpoint.toString(), request: JSON.parse(init.body) };
      exchanges.push(exchange);
      try {
        const r = await nativeFetch(url, init);
        exchange.status = r.status; exchange.rawBody = await r.clone().text();
        exchange.latencySeconds = +((performance.now()-tick)/1000).toFixed(3);
        return r;
      } catch(e) { exchange.transportError={name:e.name,message:e.message}; throw e; }
    };
    const tick = performance.now();
    const r = await POST(new Request('http://localhost:5173/api/turn', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...sample,mode:'ai'})}));
    const body = await r.json();
    report.samples.push({...sample,status:r.status,latencySeconds:+((performance.now()-tick)/1000).toFixed(3),adapterResponse:body,providerExchanges:exchanges});
    await save();
    console.log(`${sample.id}: HTTP ${r.status}, ${report.samples.at(-1).latencySeconds}s`);
  }
} finally { globalThis.fetch = nativeFetch; }

const headers = {'Content-Type':'application/json',...(process.env.FARSHORE_API_KEY ? {Authorization:`Bearer ${process.env.FARSHORE_API_KEY}`} : {})};
async function rawFailure(id, name, body, timeout=10000) {
  const tick=performance.now();
  const entry={id,name,kind:'Actual provider call',requestBody:body};
  try { const r=await nativeFetch(endpoint,{method:'POST',headers,body,signal:AbortSignal.timeout(timeout)}); entry.status=r.status; entry.rawBody=await r.text(); }
  catch(e) { entry.kind='Actual client-side failure'; entry.transportError={name:e.name,message:e.message}; entry.rawBody=null; entry.note='No HTTP response reached this client. This is not a model-produced response.'; }
  entry.latencySeconds=+((performance.now()-tick)/1000).toFixed(3);
  report.failures.push(entry); await save(); console.log(`${id}: ${entry.status ?? entry.transportError.name}`);
}
await rawFailure('E1','Malformed JSON sent to the model service','{"model":');
await rawFailure('E2','A model name that is not installed',JSON.stringify({model:'farshore-phase2-does-not-exist',messages:[{role:'user',content:'Return a greeting.'}],stream:false}));
await rawFailure('E3','Deliberate 1ms client deadline',JSON.stringify({model,messages:[{role:'user',content:'Return a greeting.'}],stream:false}),1);
const invalid=await POST(new Request('http://localhost:5173/api/turn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({encounterId:'lotus',trust:50,advice:'x',mode:'ai'})}));
report.failures.push({id:'E4',name:'Invalid player input',kind:'Actual adapter rejection before the provider',status:invalid.status,adapterResponse:await invalid.json(),note:'The model is not contacted. This validates the app boundary only.'});
const successes=report.samples.filter(s=>s.status===200 && s.adapterResponse.source==='ai');
const times=successes.map(s=>s.latencySeconds);
report.statistics={attempts:report.samples.length,successfulCalls:successes.length,failedCalls:report.samples.length-successes.length,minSeconds:times.length?Math.min(...times):null,averageSeconds:times.length?+(times.reduce((a,b)=>a+b,0)/times.length).toFixed(3):null,maxSeconds:times.length?Math.max(...times):null,population:'Only completed, validated AI samples S1-S6. Includes the first measured call. Failure tests excluded.'};
if(local) report.environment.loadedModelsAfter=await catalog('/api/ps');
report.completedAt=new Date().toISOString(); await save();
console.log(`Evidence saved to ${resultPath}`);
