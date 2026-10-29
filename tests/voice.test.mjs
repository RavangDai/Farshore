import test from "node:test";
import assert from "node:assert/strict";
import { accentOf, isFemale, voices } from "../src/lib/arcade/rivals.ts";
import { encodeWav, prepareSpeech } from "../server/lib/wav.ts";
import { kokoroStatus, setKokoroLoader } from "../server/lib/kokoro.ts";
import { GET as voiceGET, POST as voicePOST, voiceConfig } from "../server/voice.ts";
import { pickBrowserVoice } from "../src/lib/speech/browser-voices.ts";
import { playWithFx } from "../src/lib/speech/voice-fx.ts";
import { VoiceBox, sentences } from "../src/lib/speech/voice.ts";

// Kokoro-82M's English speakers, as listed by kokoro-js.
const KOKORO = new Set(["af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa", "bf_emma", "bf_isabella", "bf_alice", "bf_lily", "bm_george", "bm_lewis", "bm_daniel", "bm_fable"]);
const post = body => new Request("http://localhost:5173/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function withVoice(env, callback, fetchMock = async () => assert.fail("contacted a voice server")) {
  const keys = ["FARSHORE_TTS", "FARSHORE_TTS_URL", "FARSHORE_TTS_KEY", "FARSHORE_TTS_MODEL", "FARSHORE_API_KEY"];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]])), oldFetch = globalThis.fetch;
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  globalThis.fetch = fetchMock;
  try { await callback(); } finally {
    globalThis.fetch = oldFetch;
    setKokoroLoader(null);
    for (const k of keys) if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k];
  }
}

/** A fake Kokoro: a 100 ms tone with silence around it, recording what it was asked. */
function fakeEngine(calls = [], gate = null) {
  return async () => ({
    sampleRate: 24000,
    async synthesize(text, voice, speed) {
      calls.push({ text, voice, speed });
      if (gate) await gate;
      const samples = new Float32Array(24000 * 0.5);
      for (let i = 4800; i < 7200; i++) samples[i] = 0.25 * Math.sin(i / 8);
      return samples;
    },
  });
}

test("voice profiles use real Kokoro voices and gentle browser settings", () => {
  assert.equal(Object.keys(voices).length, 10);
  for (const [id, v] of Object.entries(voices)) {
    assert.ok(KOKORO.has(v.kokoro), `${id} uses ${v.kokoro}`);
    assert.ok(v.speed >= 0.8 && v.speed <= 1.2, `${id} speed`);
    assert.ok(v.browser.pitch >= 0.85 && v.browser.pitch <= 1.15, `${id} browser pitch`);
    assert.ok(v.browser.rate >= 0.85 && v.browser.rate <= 1.15, `${id} browser rate`);
    assert.ok(v.fx.wet >= 0 && v.fx.wet <= 0.5, `${id} reverb`);
  }
  assert.equal(accentOf(voices.bard), "gb");
  assert.equal(accentOf(voices.sirens), "us");
  assert.equal(isFemale(voices.circe), true);
  assert.equal(isFemale(voices.cyclops), false);
});

test("wav header describes 16-bit mono PCM at the given rate", () => {
  const wav = encodeWav(new Float32Array([0, 0.5, -1, 2]), 24000), view = new DataView(wav.buffer);
  const text = (offset, n) => String.fromCharCode(...wav.slice(offset, offset + n));
  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 4), "WAVE");
  assert.equal(view.getUint16(20, true), 1, "PCM");
  assert.equal(view.getUint16(22, true), 1, "mono");
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(wav.byteLength, 52);
  assert.equal(view.getInt16(46, true), 16384);
  assert.equal(view.getInt16(50, true), 32767, "out-of-range samples are clipped");
});

test("prepareSpeech trims silence and normalizes the peak", () => {
  const rate = 1000, samples = new Float32Array(3000);
  for (let i = 1000; i < 1500; i++) samples[i] = 0.2 * Math.sin(i);
  const out = prepareSpeech(samples, rate);
  assert.ok(out.length >= 500 && out.length <= 500 + 2 * 40 + 2, `kept ${out.length} samples`);
  assert.ok(Math.abs(Math.max(...out.map(Math.abs)) - 0.89) < 1e-6);
  assert.equal(prepareSpeech(new Float32Array(100), rate).length, 0);
});

test("voice config picks remote, built-in or browser", () => {
  assert.equal(voiceConfig({}).engine, "builtin");
  assert.equal(voiceConfig({ FARSHORE_TTS_URL: "http://x/v1/audio/speech" }).engine, "remote");
  assert.equal(voiceConfig({ FARSHORE_TTS: "browser", FARSHORE_TTS_URL: "http://x" }).engine, "browser");
  assert.equal(voiceConfig({ FARSHORE_TTS: "off" }).engine, "browser");
});

test("built-in voice returns wav from the engine, in the character's voice and speed", async () => {
  await withVoice({}, async () => {
    const calls = [];
    setKokoroLoader(fakeEngine(calls));
    assert.deepEqual(await (await voiceGET()).json(), { neural: true, engine: "builtin", ready: false });
    await tick();
    assert.equal(kokoroStatus(), "ready");
    assert.deepEqual(await (await voiceGET()).json(), { neural: true, engine: "builtin", ready: true });
    const r = await voicePOST(post({ text: "You cannot hide, Nobody.", voice: "cyclops" }));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "audio/wav");
    const body = new Uint8Array(await r.arrayBuffer());
    assert.equal(String.fromCharCode(...body.slice(0, 4)), "RIFF");
    assert.ok(body.byteLength < 24000, "edge silence was trimmed");
    assert.deepEqual(calls, [{ text: "You cannot hide, Nobody.", voice: "am_fenrir", speed: 0.95 }]);
    await voicePOST(post({ text: "You cannot hide, Nobody.", voice: "cyclops" }));
    assert.equal(calls.length, 1, "a repeated line comes from the cache");
  });
});

test("a loading engine answers 503 at once and keeps warming", async () => {
  await withVoice({}, async () => {
    let finish;
    const loaded = new Promise(resolve => { finish = resolve; });
    setKokoroLoader(async () => { await loaded; return fakeEngine()(); });
    const r = await voicePOST(post({ text: "Sing, Muse.", voice: "bard" }));
    assert.equal(r.status, 503);
    assert.equal(kokoroStatus(), "loading");
    finish();
    await tick(); await tick();
    assert.equal(kokoroStatus(), "ready");
    assert.equal((await voicePOST(post({ text: "Sing, Muse.", voice: "bard" }))).status, 200);
  });
});

test("a failed engine reports failed, the game uses browser voices, and the route answers 503", async (t) => {
  t.mock.method(console, "warn", () => {});
  await withVoice({}, async () => {
    setKokoroLoader(async () => { throw new Error("offline"); });
    await voiceGET();
    await tick(); await tick();
    assert.equal(kokoroStatus(), "failed");
    assert.deepEqual(await (await voiceGET()).json(), { neural: false, engine: "builtin", ready: false });
    assert.equal((await voicePOST(post({ text: "Sing, Muse.", voice: "bard" }))).status, 503);
  });
});

test("the queue refuses a fifth line while four are pending", async () => {
  await withVoice({}, async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    setKokoroLoader(fakeEngine([], gate));
    await voiceGET();
    await tick();
    const accepted = [1, 2, 3, 4].map(n => voicePOST(post({ text: `Line ${n}`, voice: "bard" })));
    await tick();
    const refused = await voicePOST(post({ text: "Line 5", voice: "bard" }));
    assert.equal(refused.status, 503);
    assert.equal(refused.headers.get("retry-after"), "2");
    release();
    assert.deepEqual((await Promise.all(accepted)).map(r => r.status), [200, 200, 200, 200]);
  });
});

test("unknown voices, oversized text and foreign origins are rejected before synthesis", async () => {
  await withVoice({}, async () => {
    const calls = [];
    setKokoroLoader(fakeEngine(calls));
    await voiceGET();
    await tick();
    assert.equal((await voicePOST(post({ text: "Hello", voice: "zeus" }))).status, 400);
    assert.equal((await voicePOST(post({ text: "x".repeat(300), voice: "bard" }))).status, 400);
    const foreign = new Request("http://localhost:5173/api/voice", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ text: "Hello", voice: "bard" }) });
    assert.equal((await voicePOST(foreign)).status, 403);
    assert.equal(calls.length, 0);
  });
});

test("browser mode never synthesizes", async () => {
  await withVoice({ FARSHORE_TTS: "browser" }, async () => {
    setKokoroLoader(async () => assert.fail("loaded the model"));
    assert.deepEqual(await (await voiceGET()).json(), { neural: false, engine: "browser", ready: false });
    assert.equal((await voicePOST(post({ text: "Hello", voice: "bard" }))).status, 503);
  });
});

test("a remote voice server receives the character's Kokoro voice and speed", async () => {
  await withVoice({ FARSHORE_TTS_URL: "http://127.0.0.1:8880/v1/audio/speech", FARSHORE_TTS_KEY: "secret" }, async () => {
    assert.deepEqual(await (await voiceGET()).json(), { neural: true, engine: "remote", ready: true });
    const r = await voicePOST(post({ text: "Sing, Muse.", voice: "cyclops" }));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "audio/mpeg");
    assert.equal((await r.arrayBuffer()).byteLength, 4);
  }, async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8880/v1/audio/speech");
    assert.equal(options.headers.Authorization, "Bearer secret");
    const body = JSON.parse(options.body);
    assert.equal(body.voice, "am_fenrir");
    assert.equal(body.speed, 0.95);
    assert.equal(body.input, "Sing, Muse.");
    return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "audio/mpeg" } });
  });
});

// --- In the browser ----------------------------------------------------------

const SYSTEM_VOICES = [
  { name: "Microsoft David - English (United States)", lang: "en-US", localService: true },
  { name: "Microsoft Zira - English (United States)", lang: "en-US", localService: true },
  { name: "Microsoft George - English (United Kingdom)", lang: "en-GB", localService: true },
  { name: "Microsoft Ryan Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false },
  { name: "Microsoft Sonia Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false },
  { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US", localService: false },
  { name: "Microsoft Christopher Online (Natural) - English (United States)", lang: "en-US", localService: false },
  { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false },
  { name: "Google UK English Male", lang: "en-GB", localService: false },
  { name: "Google français", lang: "fr-FR", localService: false },
];

test("browser voices prefer natural ones in the character's accent and gender", () => {
  assert.equal(pickBrowserVoice(SYSTEM_VOICES, voices.bard).name, "Microsoft Ryan Online (Natural) - English (United Kingdom)");
  assert.equal(pickBrowserVoice(SYSTEM_VOICES, voices.circe).name, "Microsoft Sonia Online (Natural) - English (United Kingdom)");
  assert.equal(pickBrowserVoice(SYSTEM_VOICES, voices.sirens).name, "Microsoft Aria Online (Natural) - English (United States)");
  assert.match(pickBrowserVoice(SYSTEM_VOICES, voices.cyclops).name, /(Guy|Christopher) Online \(Natural\)/);
  const robotic = SYSTEM_VOICES.filter(v => !/Natural/.test(v.name));
  assert.equal(pickBrowserVoice(robotic, voices.bard).name, "Google UK English Male", "a network voice beats the old desktop voices");
  assert.equal(pickBrowserVoice([SYSTEM_VOICES.at(-1)], voices.bard).name, "Google français", "anything is better than silence");
});

test("a second character takes another natural voice when one is free", () => {
  const first = pickBrowserVoice(SYSTEM_VOICES, voices.cyclops);
  const second = pickBrowserVoice(SYSTEM_VOICES, voices.scylla, new Set([first.name]));
  assert.notEqual(second.name, first.name);
  assert.match(second.name, /Online \(Natural\)/);
});

test("lines split into sentences so the first can play while the next is made", () => {
  assert.deepEqual(sentences("Run, little Nobody! My boulders will find you in the dark."), ["Run, little Nobody!", "My boulders will find you in the dark."]);
  assert.deepEqual(sentences("Ha! You missed."), ["Ha! You missed."], "tiny fragments stay together");
  assert.deepEqual(sentences("He waits 3.5 metres behind. The boulder is coming for you."), ["He waits 3.5 metres behind.", "The boulder is coming for you."]);
  const long = Array.from({ length: 12 }, (_, i) => `the oar number ${i} pulls against the tide`).join(", ") + ".";
  const parts = sentences(long);
  assert.ok(parts.length > 1 && parts.every(p => p.length <= 200), "over-long sentences break at commas");
  assert.equal(parts.join(" "), long);
});

class FakeNode {
  gain = { value: 1 }; frequency = { value: 0 }; threshold = { value: 0 }; ratio = { value: 1 }; playbackRate = { value: 1 }; type = "";
  connect() {} disconnect() {}
}
class FakeContext {
  static instances = [];
  state = "running"; sampleRate = 8000; currentTime = 0; destination = new FakeNode(); sources = []; convolvers = [];
  constructor() { FakeContext.instances.push(this); }
  async resume() {} async close() {}
  async decodeAudioData() { return { duration: 0.05, length: 400, sampleRate: 8000 }; }
  createGain() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createDynamicsCompressor() { return new FakeNode(); }
  createConvolver() { const node = new FakeNode(); this.convolvers.push(node); return node; }
  createBuffer(channels, length, rate) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { duration: length / rate, getChannelData: i => data[i] }; }
  createBufferSource() { const node = new FakeNode(); node.start = () => setTimeout(() => node.onended?.(), 5); node.stop = () => node.onended?.(); this.sources.push(node); return node; }
}
async function until(condition, ms = 2000) {
  const end = Date.now() + ms;
  while (!condition()) { if (Date.now() > end) throw new Error("timed out"); await new Promise(r => setTimeout(r, 5)); }
}
function withBrowser(t, { speak = () => {} } = {}) {
  const saved = { window: globalThis.window, utterance: globalThis.SpeechSynthesisUtterance, context: globalThis.AudioContext };
  globalThis.window = { speechSynthesis: { getVoices: () => SYSTEM_VOICES, addEventListener() {}, cancel() {}, speak } };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.AudioContext = FakeContext;
  t.after(() => { globalThis.window = saved.window; globalThis.SpeechSynthesisUtterance = saved.utterance; globalThis.AudioContext = saved.context; });
}

test("voice fx doubles the Sirens into a chorus and keeps the Bard to one voice", async () => {
  const context = new FakeContext(), buffer = { duration: 0.05 };
  const sirens = playWithFx(context, buffer, voices.sirens.fx, 0.8);
  assert.equal(context.sources.length, 2);
  assert.equal(context.sources[1].playbackRate.value, voices.sirens.fx.double.rate);
  assert.ok(context.convolvers[0].buffer.duration > 3, "the Sirens sing into a long, ethereal space");
  await sirens.done;
  const bard = new FakeContext();
  await playWithFx(bard, buffer, voices.bard.fx, 0.8).done;
  assert.equal(bard.sources.length, 1);
});

test("the voice box falls back to the browser's best natural voice when the server cannot speak", async (t) => {
  const spoken = [];
  withBrowser(t, { speak: u => { spoken.push(u); setTimeout(() => u.onend?.(), 0); } });
  const box = new VoiceBox(async (url, init) => init?.method ? Response.json({ error: "The voice is still loading." }, { status: 503 }) : Response.json({ neural: true, engine: "builtin", ready: true }));
  t.after(() => box.dispose());
  await until(() => box.voiceStatus === "neural");
  box.say("Sing to me, Muse.", "bard");
  await until(() => spoken.length === 1);
  assert.equal(spoken[0].text, "Sing to me, Muse.");
  assert.equal(spoken[0].voice.name, "Microsoft Ryan Online (Natural) - English (United Kingdom)");
  assert.equal(spoken[0].pitch, voices.bard.browser.pitch);
});

test("a natural line is fetched a sentence at a time and played through the character's chain", async (t) => {
  withBrowser(t, { speak: () => assert.fail("used browser speech") });
  const posts = [], states = [];
  const box = new VoiceBox(async (url, init) => {
    if (!init?.method) return Response.json({ neural: true, engine: "builtin", ready: true });
    posts.push(JSON.parse(init.body));
    return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "audio/wav" } });
  });
  t.after(() => box.dispose());
  await until(() => box.voiceStatus === "neural");
  box.onSpeaking(s => states.push(s));
  box.say("Run, little Nobody! My boulders will find you in the dark.", "cyclops");
  await until(() => posts.length === 2 && states.at(-1) === false);
  assert.deepEqual(posts.map(p => p.text), ["Run, little Nobody!", "My boulders will find you in the dark."]);
  assert.ok(posts.every(p => p.voice === "cyclops"));
  const context = FakeContext.instances.at(-1);
  assert.equal(context.sources.length, 2, "one source per sentence");
  assert.equal(context.sources[0].playbackRate.value, voices.cyclops.fx.pitch);
});

test("while the natural voice downloads, lines are read by the browser at once", async (t) => {
  const spoken = [];
  withBrowser(t, { speak: u => { spoken.push(u); setTimeout(() => u.onend?.(), 0); } });
  const box = new VoiceBox(async (url, init) => init?.method ? assert.fail("asked for a neural line while loading") : Response.json({ neural: true, engine: "builtin", ready: false }));
  t.after(() => box.dispose());
  await until(() => box.voiceStatus === "loading");
  box.say("The winds are free.", "aeolus");
  await until(() => spoken.length === 1);
});
