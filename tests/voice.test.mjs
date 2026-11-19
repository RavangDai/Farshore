import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { KOKORO_GRADES, accentOf, isFemale, voices } from "../src/lib/arcade/rivals.ts";
import { encodeWav, prepareSpeech } from "../server/lib/wav.ts";
import { ByteLru, kokoroStatus, setKokoroLoader, speakWithKokoro, VoiceAbortedError } from "../server/lib/kokoro.ts";
import { pronounce } from "../src/lib/speech/lexicon.ts";
import { fixedPieces } from "../src/lib/story/spoken-lines.ts";
import { GET as voiceGET, POST as voicePOST, voiceConfig } from "../server/voice.ts";
import { pickBrowserVoice } from "../src/lib/speech/browser-voices.ts";
import { playWithFx } from "../src/lib/speech/voice-fx.ts";
import { VoiceBox, sentences } from "../src/lib/speech/voice.ts";

// Kokoro-82M's English speakers, as listed by kokoro-js.
const KOKORO = new Set(["af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa", "bf_emma", "bf_isabella", "bf_alice", "bf_lily", "bm_george", "bm_lewis", "bm_daniel", "bm_fable"]);
const post = body => new Request("http://localhost:5173/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function withVoice(env, callback, fetchMock = async () => assert.fail("contacted a voice server")) {
  const keys = ["FARSHORE_TTS", "FARSHORE_TTS_URL", "FARSHORE_TTS_KEY", "FARSHORE_TTS_MODEL", "FARSHORE_API_KEY", "FARSHORE_VOICE_CACHE", "FARSHORE_TTS_DTYPE"];
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

test("voice profiles use real Kokoro voices graded C or better, at their natural pitch", () => {
  assert.equal(Object.keys(voices).length, 12);
  for (const [id, v] of Object.entries(voices)) {
    assert.ok(KOKORO.has(v.kokoro), `${id} uses ${v.kokoro}`);
    assert.match(KOKORO_GRADES[v.kokoro] ?? "", /^(A|B|C)[+-]?$/, `${id} uses ${v.kokoro}, graded ${KOKORO_GRADES[v.kokoro]}`);
    assert.ok(!("pitch" in v.fx) && !("double" in v.fx), `${id} plays at its natural rate`);
    assert.ok(v.fx.wet <= 0.3, `${id} reverb stays clear`);
    assert.ok(v.speed >= 0.8 && v.speed <= 1.2, `${id} speed`);
    assert.ok(v.browser.pitch >= 0.85 && v.browser.pitch <= 1.15, `${id} browser pitch`);
    assert.ok(v.browser.rate >= 0.85 && v.browser.rate <= 1.15, `${id} browser rate`);
    assert.ok(v.fx.wet >= 0 && v.fx.wet <= 0.5, `${id} reverb`);
  }
  assert.equal(accentOf(voices.bard), "gb");
  assert.equal(accentOf(voices.sirens), "us");
  assert.equal(isFemale(voices.circe), true);
  // The Oracle keeps one voice for every announcement: hushed, in a wide airy space.
  assert.equal(voices.oracle.kokoro, "af_nicole");
  assert.equal(voices.oracle.fx.space, "ethereal");
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

test("prepareSpeech trims silence, levels the speech and fades the ends", () => {
  const rate = 24000, samples = new Float32Array(rate * 2);
  // A quiet "word", a gap, then a louder one.
  for (let i = 12000; i < 24000; i++) samples[i] = 0.05 * Math.sin(i / 6);
  for (let i = 30000; i < 40000; i++) samples[i] = 0.08 * Math.sin(i / 5);
  const out = prepareSpeech(samples, rate);
  const margin = 0.04 * rate;
  assert.ok(out.length >= 28000 && out.length <= 28000 + 2 * margin + 2, `kept ${out.length} samples`);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 0.89 + 1e-6, `peak ${peak}`);
  let sum = 0;
  for (let i = margin; i < margin + 12000; i++) sum += out[i] * out[i];
  const db = 20 * Math.log10(Math.sqrt(sum / 12000));
  assert.ok(db > -22 && db < -15, `speech sits near -18 dBFS (${db.toFixed(1)})`);
  assert.equal(out[0], 0, "fades in from silence");
  assert.equal(out.at(-1), 0, "fades out to silence");
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
    const loading = await (await voiceGET()).json();
    assert.equal(loading.neural, true);
    assert.equal(loading.ready, false);
    assert.equal(typeof loading.progress, "number", "a loading voice reports its download progress");
    await tick();
    assert.equal(kokoroStatus(), "ready");
    assert.deepEqual(await (await voiceGET()).json(), { neural: true, engine: "builtin", ready: true });
    const r = await voicePOST(post({ text: "You cannot hide, Nobody.", voice: "cyclops" }));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "audio/wav");
    const body = new Uint8Array(await r.arrayBuffer());
    assert.equal(String.fromCharCode(...body.slice(0, 4)), "RIFF");
    assert.ok(body.byteLength < 24000, "edge silence was trimmed");
    assert.deepEqual(calls, [{ text: "You cannot hide, Nobody.", voice: "am_fenrir", speed: voices.cyclops.speed }]);
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

test("the loaded voice survives the module being evaluated again, as a dev server does on every recompile", async () => {
  await withVoice({}, async () => {
    let loads = 0;
    setKokoroLoader(async () => { loads++; return fakeEngine()(); });
    await voiceGET();
    await tick();
    assert.equal(kokoroStatus(), "ready");
    const again = await import("../server/lib/kokoro.ts?evaluated-again");
    assert.equal(again.kokoroStatus(), "ready", "a second copy of the module sees the loaded voice");
    const wav = await again.speakWithKokoro("Sing, Muse.", "bm_george", 0.95);
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.equal(loads, 1, "the model was loaded once");
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
    assert.equal(body.speed, voices.cyclops.speed);
    assert.equal(body.input, "Sing, Muse.");
    return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "audio/mpeg" } });
  });
});

test("a line someone is listening for goes ahead of lines fetched early", async () => {
  await withVoice({}, async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const calls = [];
    let first = true;
    setKokoroLoader(async () => ({
      sampleRate: 24000,
      async synthesize(text) { calls.push(text); if (first) { first = false; await gate; } const s = new Float32Array(2400); s[1200] = 0.5; return s; },
    }));
    await voiceGET();
    await tick();
    const busy = voicePOST(post({ text: "Busy now.", voice: "bard" }));
    await tick();
    const early = voicePOST(post({ text: "Fetched early.", voice: "bard", priority: "prime" }));
    const live = voicePOST(post({ text: "Heard now.", voice: "bard" }));
    await tick();
    release();
    await Promise.all([busy, early, live]);
    assert.deepEqual(calls, ["Busy now.", "Heard now.", "Fetched early."]);
  });
});

test("a queued line nobody waits for any more is never synthesized", async () => {
  await withVoice({}, async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const calls = [];
    setKokoroLoader(fakeEngine(calls, gate));
    await voiceGET();
    await tick();
    const busy = speakWithKokoro("Busy now.", "bm_george", 1);
    const controller = new AbortController();
    const dropped = speakWithKokoro("Never mind.", "bm_george", 1, { signal: controller.signal });
    await tick();
    controller.abort();
    await assert.rejects(dropped, VoiceAbortedError);
    release();
    await busy;
    await tick(); await tick();
    assert.deepEqual(calls.map(c => c.text), ["Busy now."]);
  });
});

test("the same line asked for early and then for real is synthesized once", async () => {
  await withVoice({}, async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const calls = [];
    setKokoroLoader(fakeEngine(calls, gate));
    await voiceGET();
    await tick();
    const busy = speakWithKokoro("Busy now.", "bm_george", 1);
    const early = speakWithKokoro("Hello, Nobody.", "am_fenrir", 1, { priority: "prime" });
    const real = speakWithKokoro("Hello, Nobody.", "am_fenrir", 1);
    release();
    const [, a, b] = await Promise.all([busy, early, real]);
    assert.equal(a, b);
    assert.equal(calls.filter(c => c.text === "Hello, Nobody.").length, 1);
  });
});

test("recently heard lines are kept by recency and size", () => {
  const lru = new ByteLru(10);
  lru.set("a", new Uint8Array(4)); lru.set("b", new Uint8Array(4));
  lru.get("a");
  lru.set("c", new Uint8Array(4));
  assert.ok(lru.get("a"), "a was used recently, so it stays");
  assert.equal(lru.get("b"), undefined, "b was the least recently used");
});

test("fixed lines are kept on disk and served from it while the model loads", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "farshore-voice-"));
  try {
    await withVoice({ FARSHORE_VOICE_CACHE: dir }, async () => {
      const calls = [];
      setKokoroLoader(fakeEngine(calls));
      await voiceGET();
      await tick();
      const piece = fixedPieces[0];
      const first = await voicePOST(post({ text: piece.text, voice: piece.voice }));
      assert.equal(first.status, 200);
      assert.equal(first.headers.get("x-voice-cache"), "miss");
      assert.equal(readdirSync(dir).filter(f => f.endsWith(".wav")).length, 1);
      const free = await voicePOST(post({ text: "Not a fixed line.", voice: "bard" }));
      assert.equal(free.status, 200);
      assert.equal(readdirSync(dir).filter(f => f.endsWith(".wav")).length, 1, "only fixed lines go to disk");
      // A restarted server: the model is loading again, but the fixed line is on disk.
      setKokoroLoader(() => new Promise(() => {}));
      const again = await voicePOST(post({ text: piece.text, voice: piece.voice }));
      assert.equal(again.status, 200);
      assert.equal(again.headers.get("x-voice-cache"), "disk");
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("names are respelled for the voice, and only for the voice", async () => {
  assert.equal(pronounce("Scylla watches; SCYLLA waits. Telemachus and Antinous."), "Silla watches; SILLA waits. Telemmuckus and Antinno-us.");
  assert.equal(pronounce("Circe and Odysseus"), "Circe and Odysseus", "names eSpeak says well are left alone");
  await withVoice({}, async () => {
    const calls = [];
    setKokoroLoader(fakeEngine(calls));
    await voiceGET();
    await tick();
    assert.equal((await voicePOST(post({ text: "Scylla is hungry.", voice: "scylla" }))).status, 200);
    assert.equal(calls[0].text, "Silla is hungry.");
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

test("a long first sentence breaks at a pause, so the voice starts sooner", () => {
  const text = "Ahead, the strait narrows between the cliffs, and the water darkens under the oars. Hold fast.";
  const parts = sentences(text, { firstMax: 70 });
  assert.equal(parts[0], "Ahead, the strait narrows between the cliffs,", "the first break after 20 characters, not the comma after 'Ahead'");
  assert.equal(parts.join(" "), text);
  assert.deepEqual(sentences("Run, little Nobody! My boulders will find you.", { firstMax: 70 }), ["Run, little Nobody!", "My boulders will find you."], "short openings stay whole");
});

class FakeNode {
  gain = { value: 1 }; frequency = { value: 0 }; Q = { value: 1 }; threshold = { value: 0 }; ratio = { value: 1 }; knee = { value: 30 }; attack = { value: 0 }; release = { value: 0 };
  playbackRate = { value: 1 }; delayTime = { value: 0 }; pan = { value: 0 }; type = "";
  connect() {} disconnect() {} start() {} stop() {}
}
class FakeContext {
  static instances = [];
  state = "running"; sampleRate = 8000; currentTime = 0; destination = new FakeNode(); sources = []; convolvers = []; delays = []; oscillators = []; compressors = [];
  constructor() { FakeContext.instances.push(this); }
  async resume() {} async close() {}
  async decodeAudioData() { return { duration: 0.05, length: 400, sampleRate: 8000 }; }
  createGain() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createDynamicsCompressor() { const node = new FakeNode(); this.compressors.push(node); return node; }
  createDelay() { const node = new FakeNode(); this.delays.push(node); return node; }
  createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
  createStereoPanner() { return new FakeNode(); }
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

test("voice fx gives the Sirens a drifting chorus and keeps every voice at its natural rate", async () => {
  const context = new FakeContext(), buffer = { duration: 0.05 };
  const sirens = playWithFx(context, buffer, voices.sirens.fx, 0.8);
  assert.equal(context.sources.length, 1, "one source: the chorus is delayed copies, not a second playback");
  assert.equal(context.delays.length, 2);
  assert.ok(context.delays.every(d => d.delayTime.value > 0.01 && d.delayTime.value < 0.03));
  assert.equal(context.oscillators.length, 2, "each copy drifts");
  assert.ok(context.convolvers[0].buffer.duration > 2 && context.convolvers[0].buffer.duration <= 2.7, "an ethereal space that still lets the words through");
  await sirens.done;
  for (const id of Object.keys(voices)) {
    const c = new FakeContext();
    await playWithFx(c, buffer, voices[id].fx, 0.8).done;
    assert.ok(c.sources.every(source => source.playbackRate.value === 1), `${id} plays at rate 1`);
  }
  const bard = new FakeContext();
  await playWithFx(bard, buffer, voices.bard.fx, 0.8).done;
  assert.equal(bard.delays.length, 0);
  assert.equal(bard.compressors[0].knee.value, 0, "a hard-knee limiter");
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
  assert.ok(context.sources.every(source => source.playbackRate.value === 1), "no pitch shifting");
});

test("a status check that gets no answer is asked again instead of giving up on the natural voice", async (t) => {
  withBrowser(t);
  let checks = 0;
  const seen = [];
  const box = new VoiceBox(async (url, init) => {
    assert.equal(init?.method, undefined, "only status checks are expected");
    // The server is busy loading the voice model and the first check times out.
    if (++checks === 1) throw new DOMException("The operation timed out.", "TimeoutError");
    return Response.json({ neural: true, engine: "builtin", ready: true });
  }, 5);
  t.after(() => box.dispose());
  box.onStatus(s => seen.push(s));
  await until(() => box.voiceStatus === "neural");
  assert.ok(checks >= 2, "the check was repeated");
  assert.ok(!seen.includes("unavailable"), `statuses were ${seen.join(", ")}`);
});

test("a voice that failed to load is asked about again, because the server retries it", async (t) => {
  withBrowser(t);
  let checks = 0;
  const box = new VoiceBox(async () => ++checks < 3 ? Response.json({ neural: false, engine: "builtin", ready: false }) : Response.json({ neural: true, engine: "builtin", ready: true }), 2);
  t.after(() => box.dispose());
  await until(() => box.voiceStatus === "unavailable");
  await until(() => box.voiceStatus === "neural");
});

test("a server that leaves speech to the browser is not asked again", async (t) => {
  withBrowser(t);
  let checks = 0;
  const box = new VoiceBox(async () => { checks++; return Response.json({ neural: false, engine: "browser", ready: false }); }, 2);
  t.after(() => box.dispose());
  await until(() => box.voiceStatus === "browser");
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(checks, 1);
});

test("while the natural voice downloads, a line waits a moment, then the browser reads it", async (t) => {
  const spoken = [];
  withBrowser(t, { speak: u => { spoken.push(u); setTimeout(() => u.onend?.(), 0); } });
  const box = new VoiceBox(async (url, init) => init?.method ? assert.fail("asked for a neural line while loading") : Response.json({ neural: true, engine: "builtin", ready: false, progress: 0.4, sizeMb: 177 }), { pollMs: 1000, loadingPollMs: 1000, readyWaitMs: 60 });
  t.after(() => box.dispose());
  const loads = [];
  box.onLoad(l => loads.push(l));
  await until(() => box.voiceStatus === "loading");
  assert.deepEqual(loads.at(-1), { progress: 0.4, sizeMb: 177 });
  const asked = Date.now();
  box.say("The winds are free.", "aeolus");
  await until(() => spoken.length === 1);
  assert.ok(Date.now() - asked >= 50, "the line waited for the natural voice first");
});

test("a line that waits while the voice loads is spoken naturally once it is ready", async (t) => {
  withBrowser(t, { speak: () => assert.fail("used browser speech") });
  let ready = false;
  const posts = [];
  const box = new VoiceBox(async (url, init) => {
    if (!init?.method) return Response.json({ neural: true, engine: "builtin", ready });
    posts.push(JSON.parse(init.body).text);
    return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "audio/wav" } });
  }, { pollMs: 10, loadingPollMs: 10, readyWaitMs: 1500 });
  t.after(() => box.dispose());
  await until(() => box.voiceStatus === "loading");
  box.say("Sing to me, Muse.", "bard");
  ready = true;
  await until(() => posts.length === 1);
  assert.deepEqual(posts, ["Sing to me, Muse."]);
});

test("a primed line is fetched once, early, and plays without asking again", async (t) => {
  withBrowser(t, { speak: () => assert.fail("used browser speech") });
  const posts = [];
  const box = new VoiceBox(async (url, init) => {
    if (!init?.method) return Response.json({ neural: true, engine: "builtin", ready: true });
    posts.push(JSON.parse(init.body));
    return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Type": "audio/wav" } });
  });
  t.after(() => box.dispose());
  await until(() => box.voiceStatus === "neural");
  box.prime("Nobody escapes my cave.", "cyclops");
  await until(() => posts.length === 1);
  assert.equal(posts[0].priority, "prime");
  await new Promise(r => setTimeout(r, 10));
  const states = [];
  box.onSpeaking(state => states.push(state));
  box.say("Nobody escapes my cave.", "cyclops");
  await until(() => states.length >= 2 && states.at(-1) === false);
  assert.equal(posts.length, 1, "the spoken line came from the primed copy");
});

test("stop() cancels the fetch of the line being spoken", async (t) => {
  withBrowser(t);
  let aborted = false;
  const box = new VoiceBox(async (url, init) => {
    if (!init?.method) return Response.json({ neural: true, engine: "builtin", ready: true });
    return new Promise((resolve, reject) => { init.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }); });
  });
  t.after(() => box.dispose());
  await until(() => box.voiceStatus === "neural");
  box.say("A long line that will never be heard.", "bard");
  await new Promise(r => setTimeout(r, 20));
  box.stop();
  await until(() => aborted);
});
