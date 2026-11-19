import test from "node:test";
import assert from "node:assert/strict";
import { VoyageAudio } from "../src/lib/audio/voyage-audio.ts";

// A small stand-in for the Web Audio API: enough to see what the engine
// schedules, connects and stops, and which files it fetches.
class Param {
  value = 0;
  setValueAtTime(v) { this.value = v; }
  setTargetAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
  linearRampToValueAtTime(v) { this.value = v; }
  cancelScheduledValues() {}
}
class Node {
  constructor(kind) { this.kind = kind; }
  gain = new Param(); frequency = new Param(); delayTime = new Param(); playbackRate = new Param(); pan = new Param();
  threshold = new Param(); ratio = new Param(); attack = new Param(); release = new Param(); knee = new Param(); Q = new Param();
  buffer = null; loop = false; onended = null; started = false; stopped = false; outputs = [];
  connect(to) { this.outputs.push(to); return to; }
  disconnect() {}
  start() { this.started = true; }
  stop() { if (this.stopped) return; this.stopped = true; this.onended?.(); }
}
class Context {
  static last = null;
  currentTime = 0; sampleRate = 8000; state = "suspended"; destination = new Node("destination");
  sources = []; gains = [];
  constructor() { Context.last = this; }
  createGain() { const n = new Node("gain"); this.gains.push(n); return n; }
  createOscillator() { return new Node("osc"); }
  createDelay() { return new Node("delay"); }
  createBiquadFilter() { return new Node("filter"); }
  createStereoPanner() { return new Node("pan"); }
  createDynamicsCompressor() { return new Node("compressor"); }
  createConvolver() { return new Node("convolver"); }
  createBufferSource() { const n = new Node("source"); this.sources.push(n); return n; }
  createBuffer(channels, length, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, numberOfChannels: channels, sampleRate: rate, duration: length / rate, getChannelData: i => data[i] };
  }
  async decodeAudioData() { return this.createBuffer(1, 8000 * 3, 8000); }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
  async close() { this.state = "closed"; }
}

const settings = { enabled: true, music: 0.5, effects: 0.6, ducked: false, quiet: false, mood: "title", master: 0.8, ambience: 0.4, voice: 0.9, ui: 0.5 };
const tick = () => new Promise(r => setTimeout(r, 0));

async function engine(t) {
  t.mock.method(globalThis, "setInterval", () => 1);
  t.mock.method(globalThis, "clearInterval", () => {});
  const fetched = [];
  const original = { AudioContext: globalThis.AudioContext, fetch: globalThis.fetch };
  globalThis.AudioContext = Context;
  globalThis.fetch = async url => { fetched.push(String(url)); return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) }; };
  t.after(() => { globalThis.AudioContext = original.AudioContext; globalThis.fetch = original.fetch; });
  const audio = new VoyageAudio();
  t.after(() => audio.dispose());
  audio.update(settings);
  await audio.unlock();
  await tick();
  return { audio, ctx: Context.last, fetched };
}

test("six channels: master, music, ambience, voice, effects and interface follow the mixer", async t => {
  const { audio, ctx, fetched } = await engine(t);
  const [music, effects] = ctx.gains;
  assert.equal(music.gain.value, 0.5);
  assert.equal(effects.gain.value, 0.6);
  assert.ok(ctx.gains.some(g => g.gain.value === 0.8), "master");
  assert.ok(ctx.gains.some(g => g.gain.value === 0.4), "ambience");
  assert.ok(ctx.gains.some(g => g.gain.value === 0.9), "voice");
  assert.ok(fetched.some(u => u.endsWith("/sfx/ui-select.mp3")), "interface sounds load as soon as audio is unlocked");
  audio.update({ ...settings, ducked: true });
  assert.ok(music.gain.value < 0.15, "a voice lowers the music");
  assert.ok(ctx.gains.some(g => g.gain.value === 0.4 * 0.45), "and the ambience");
});

test("a place's music is fetched once and crossfades; the same place only changes level", async t => {
  const { audio, ctx, fetched } = await engine(t);
  audio.setMusic("home", 0.9);
  await tick(); await tick();
  // The decoded pack loops are the 3-second fakes; the procedural beds are rendered in code.
  const isPack = s => s.loop && s.started && s.buffer?.duration === 3;
  const first = ctx.sources.find(isPack);
  assert.ok(first, "the home theme loops");
  assert.equal(fetched.filter(u => u.includes("/music/home.")).length, 1);
  audio.setMusic("home", 0.5);
  await tick();
  assert.equal(ctx.sources.filter(s => isPack(s) && !s.stopped).length, 1, "the same place never restarts");
  audio.setMusic("voyage-map", 0.9);
  await tick(); await tick();
  const second = ctx.sources.filter(isPack).at(-1);
  assert.notEqual(second, first, "a new place starts its own loop");
  assert.ok(first.stopped, "and the old one is faded and stopped");
});

test("a stinger plays from the pack instead of the procedural recipe", async t => {
  const { audio, ctx, fetched } = await engine(t);
  const before = ctx.sources.length;
  audio.play([{ sound: "victory" }]);
  await tick(); await tick();
  assert.ok(fetched.some(u => u.endsWith("/sfx/victory.mp3")));
  assert.equal(ctx.sources.length, before + 1, "one sample, no procedural fanfare on top");
});

test("narration: one at a time, chapters outrank announcements, and stop ends it", async t => {
  const { audio } = await engine(t);
  let started = 0;
  const oracle = audio.narrate("oracle-ready", { onStart: () => started++ });
  await tick(); await tick();
  assert.equal(audio.narrating, "oracle-ready");
  assert.equal(await audio.narrate("sailor-rescued"), "refused", "a character line waits its turn");
  const chapter = audio.narrate("aeolus");
  assert.equal(await oracle, "stopped", "a chapter narration cuts an announcement short");
  await tick(); await tick();
  assert.equal(audio.narrating, "aeolus");
  assert.equal(await audio.narrate("cyclops-cave"), "refused", "but never another chapter");
  audio.stopNarration();
  assert.equal(await chapter, "stopped");
  assert.equal(audio.narrating, null);
  assert.equal(started, 1);
});

test("a line still loading when its screen is left never starts", async t => {
  const { audio } = await engine(t);
  const pending = audio.narrate("intro");
  audio.stopNarration();
  assert.equal(await pending, "refused");
  assert.equal(audio.narrating, null);
});

test("interface sounds cannot chatter", async t => {
  const { audio, ctx } = await engine(t);
  await tick();
  const before = ctx.sources.length;
  audio.uiSound("ui-hover");
  audio.uiSound("ui-hover");
  audio.uiSound("ui-hover");
  await tick(); await tick();
  assert.equal(ctx.sources.length - before, 1);
  ctx.currentTime += 0.2;
  audio.uiSound("ui-hover");
  await tick(); await tick();
  assert.equal(ctx.sources.length - before, 2);
});

test("a background tab suspends the audio clock and refuses new sound", async t => {
  const doc = { visibilityState: "visible", listeners: [], addEventListener(_, fn) { this.listeners.push(fn); }, removeEventListener() {} };
  globalThis.document = doc;
  t.after(() => { delete globalThis.document; });
  const { audio, ctx } = await engine(t);
  assert.equal(ctx.state, "running");
  doc.visibilityState = "hidden";
  doc.listeners.forEach(fn => fn());
  assert.equal(ctx.state, "suspended");
  assert.equal(audio.live, false);
  assert.equal(await audio.narrate("intro"), "refused");
  doc.visibilityState = "visible";
  doc.listeners.forEach(fn => fn());
  await tick();
  assert.equal(ctx.state, "running");
  assert.equal(audio.live, true);
});
