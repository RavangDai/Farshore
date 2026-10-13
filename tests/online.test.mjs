import test from 'node:test';
import assert from 'node:assert/strict';
import { newArcade } from '../src/lib/arcade.ts';
import { defaultPreferences, applyProgressCommand, commandSchema } from '../src/lib/online.ts';
import { createProgressApi, RevisionConflict, RequestConflict } from '../server/progress-api.ts';
import { decryptSecret, encryptSecret } from '../server/secrets.ts';
import { modelSettingsSchema } from '../src/lib/ai-account.ts';
import { POST as prepare } from '../server/arcade.ts';
import { canonicalRequest, checkWriteRequest } from '../server/http.ts';

function store() {
  const records = new Map(), requests = new Map();
  function repository(owner) {
    return {
      async load() { if (!records.has(owner)) records.set(owner, { save: newArcade(), preferences: defaultPreferences(), revision: 0, updatedAt: new Date().toISOString() }); return structuredClone(records.get(owner)); },
      async previous(id) { return requests.get(owner + ':' + id) || null; },
      async limit() { return true; },
      async commit(input) {
        const row = records.get(owner), prior = requests.get(owner + ':' + input.requestId);
        if (prior) { if (prior.payloadHash !== input.payloadHash) throw new RequestConflict(); return structuredClone(row); }
        if (row.revision !== input.expectedRevision) throw new RevisionConflict();
        const next = { save: input.save, preferences: input.preferences, revision: row.revision + 1, updatedAt: new Date().toISOString() };
        records.set(owner, structuredClone(next)); requests.set(owner + ':' + input.requestId, { payloadHash: input.payloadHash }); return structuredClone(next);
      },
    };
  }
  return { repository, records };
}
const summary = { won: true, source: 'standard', hits: 0, successes: 1, early: 0, late: 0, misses: 0, laneMs: [0,0,0] };
function mutation(command, revision=0, id=crypto.randomUUID(), extra={}) { return new Request('https://game.test/api/account', { method: 'POST', headers: { origin: 'https://game.test', 'content-type': 'application/json' }, body: JSON.stringify({ requestId:id, expectedRevision:revision, command, ...extra }) }); }
const actor = id => async () => ({ id, displayName:id, email:id+'@example.test' });

test('HTTPS proxy requests use the configured public origin without trusting caller host headers', async () => {
  const previousMode=process.env.NODE_ENV,previousUrl=process.env.BETTER_AUTH_URL;
  try {
    process.env.NODE_ENV='production';process.env.BETTER_AUTH_URL='https://play.farshore.test';
    const request=new Request('http://internal-node:3000/api/arcade',{method:'POST',headers:{origin:'https://play.farshore.test','content-type':'application/json','x-forwarded-host':'attacker.test'},body:JSON.stringify({trialId:'cyclops'})});
    assert.equal(checkWriteRequest(request),null);
    const canonical=canonicalRequest(request);
    assert.equal(canonical.url,'https://play.farshore.test/api/arcade');
    assert.deepEqual(await canonical.json(),{trialId:'cyclops'});
    const foreign=new Request('http://internal-node:3000/api/account',{method:'POST',headers:{origin:'https://attacker.test','content-type':'application/json','x-forwarded-host':'attacker.test'},body:'{}'});
    assert.equal(checkWriteRequest(foreign).status,403);
  } finally {
    if(previousMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousMode;
    if(previousUrl===undefined)delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL=previousUrl;
  }
});

test('account progress requires verified identity before any database access', async () => {
  const api = createProgressApi({ async limit(){throw new Error('must not run');} }, async () => null);
  const response = await api(new Request('https://game.test/api/account', { headers:{'oai-authenticated-user-id':'forged-user'} }));
  assert.equal(response.status,401);
});
test('progress stays with the authenticated account and caller-supplied owners are rejected', async () => {
  const db=store(), alice=createProgressApi(db.repository('alice'),actor('alice')), bob=createProgressApi(db.repository('bob'),actor('bob'));
  assert.equal((await alice(mutation({type:'start'}))).status,200);
  assert.equal((await alice(mutation({type:'complete',trialId:'cyclops',summary},1))).status,200);
  const other=await (await bob(new Request('https://game.test/api/account'))).json();
  assert.equal(other.record.save.started,false); assert.equal(other.record.save.records.cyclops.cleared,'pending');
  assert.equal((await alice(mutation({type:'restart'},2,crypto.randomUUID(),{userId:'bob'}))).status,400);
  assert.equal(db.records.get('bob').revision,0);
});
test('cross-origin writes, unsupported content types and large bodies are rejected', async () => {
  const db=store(), api=createProgressApi(db.repository('alice'),actor('alice'));
  const cross=mutation({type:'start'});cross.headers.set('origin','https://attacker.test');assert.equal((await api(cross)).status,403);
  const sameSite=mutation({type:'start'});sameSite.headers.set('sec-fetch-site','same-site');assert.equal((await api(sameSite)).status,403);
  const form=mutation({type:'start'});form.headers.set('content-type','text/plain');assert.equal((await api(form)).status,415);
  const large=new Request('https://game.test/api/account',{method:'POST',headers:{origin:'https://game.test','content-type':'application/json'},body:' '.repeat(24001)});
  assert.equal((await api(large)).status,413);
});
test('locked encounters cannot grant account progress and malformed summaries cannot be saved', async () => {
  const db=store(), api=createProgressApi(db.repository('alice'),actor('alice'));
  await api(mutation({type:'start'}));
  assert.equal((await api(mutation({type:'complete',trialId:'bow',summary},1))).status,422);
  assert.equal((await api(mutation({type:'complete',trialId:'cyclops',summary:{...summary,hits:-1}},1))).status,400);
  assert.equal(db.records.get('alice').revision,1);
});
test('network retries are idempotent and reusing a request ID for different content fails', async () => {
  const db=store(),api=createProgressApi(db.repository('alice'),actor('alice'));await api(mutation({type:'start'}));
  const id=crypto.randomUUID(), command={type:'complete',trialId:'cyclops',summary};
  assert.equal((await api(mutation(command,1,id))).status,200);
  const replay=await (await api(mutation(command,1,id))).json();assert.equal(replay.replayed,true);
  assert.equal(db.records.get('alice').save.records.cyclops.attempts,1);
  assert.equal((await api(mutation({type:'restart'},1,id))).status,409);
});
test('concurrent device writes have one winner and a recoverable revision conflict', async () => {
  const db=store(),api=createProgressApi(db.repository('alice'),actor('alice'));
  const responses=await Promise.all([api(mutation({type:'start'})),api(mutation({type:'preferences',preferences:{...defaultPreferences(),sound:true}}))]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(db.records.get('alice').revision,1);
  const conflict=await responses.find(r=>r.status===409).json();assert.equal(conflict.code,'revision_conflict');assert.equal(conflict.record.revision,1);
});
test('rate limits and storage failures preserve a usable JSON error', async () => {
  const db=store(),repo=db.repository('alice');repo.limit=async()=>false;
  assert.equal((await createProgressApi(repo,actor('alice'))(mutation({type:'start'}))).status,429);
  repo.limit=async()=>true;repo.load=async()=>{throw new Error('internal SQL secret');};
  const result=await createProgressApi(repo,actor('alice'))(mutation({type:'start'}));assert.equal(result.status,503);assert.ok(!(await result.text()).includes('internal SQL secret'));
});
test('import only applies to an empty account and assistance can be upgraded normally', () => {
  const base={save:newArcade(),preferences:defaultPreferences(),revision:0,updatedAt:''},old={...newArcade(),started:true};
  const imported=applyProgressCommand(base,commandSchema.parse({type:'import',save:old,preferences:defaultPreferences()}));
  assert.throws(()=>applyProgressCommand({...base,...imported},{type:'import',save:old,preferences:defaultPreferences()}));
  const assisted=applyProgressCommand({...base,...imported},{type:'assist',trialId:'cyclops'});
  const cleared=applyProgressCommand({...base,...assisted},{type:'complete',trialId:'cyclops',summary});assert.equal(cleared.save.records.cyclops.cleared,'cleared');
});
test('API keys are encrypted with unique IVs and cannot be decrypted under another owner', async () => {
  const master=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))),secret='test-provider-key-123456';
  const first=await encryptSecret(secret,'alice',master),second=await encryptSecret(secret,'alice',master);
  assert.notEqual(first,second);assert.ok(!first.includes(secret));assert.equal(await decryptSecret(first,'alice',master),secret);
  await assert.rejects(()=>decryptSecret(first,'bob',master));
  const parts=first.split(':');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);await assert.rejects(()=>decryptSecret(parts.join(':'),'alice',master));
  await assert.rejects(()=>encryptSecret(secret,'alice',btoa('too short')));
});
test('AI settings accept supported providers and reject arbitrary request targets', () => {
  assert.ok(modelSettingsSchema.safeParse({provider:'openrouter',model:'provider/model',apiKey:'key',enabled:true}).success);
  assert.ok(!modelSettingsSchema.safeParse({provider:'custom',model:'model',apiKey:'key',enabled:true}).success);
  assert.ok(!modelSettingsSchema.safeParse({provider:'openai',model:'model',apiKey:'key',enabled:true,url:'http://169.254.169.254/latest/meta-data'}).success);
});
test('simultaneous model calls use each player connection without changing global credentials', async () => {
  const originalFetch=globalThis.fetch,previousUrl=process.env.FARSHORE_MODEL_URL,previousKey=process.env.FARSHORE_API_KEY;
  process.env.FARSHORE_MODEL_URL='https://shared.test/chat/completions';process.env.FARSHORE_API_KEY='shared-key';
  const calls=[];
  globalThis.fetch=async(url,init)=>{calls.push({url,key:init.headers.Authorization});await new Promise(resolve=>setTimeout(resolve,5));return Response.json({choices:[{message:{content:'{"planId":"focused","focus":"center"}'}}]});};
  try {
    const make=()=>new Request('https://game.test/api/arcade',{method:'POST',headers:{origin:'https://game.test','content-type':'application/json'},body:JSON.stringify({trialId:'cyclops',difficulty:'normal',recent:[]})});
    const responses=await Promise.all([prepare(make(),{url:'https://alice.test/chat/completions',model:'alice-model',key:'alice-key'}),prepare(make(),{url:'https://bob.test/chat/completions',model:'bob-model',key:'bob-key'})]);
    assert.ok(responses.every(r=>r.status===200));assert.deepEqual(calls.map(c=>c.key).sort(),['Bearer alice-key','Bearer bob-key']);assert.equal(process.env.FARSHORE_API_KEY,'shared-key');
    assert.equal((await prepare(make(),{})).status,503);assert.equal(calls.length,2);
  } finally { globalThis.fetch=originalFetch; if(previousUrl===undefined)delete process.env.FARSHORE_MODEL_URL;else process.env.FARSHORE_MODEL_URL=previousUrl;if(previousKey===undefined)delete process.env.FARSHORE_API_KEY;else process.env.FARSHORE_API_KEY=previousKey; }
});
