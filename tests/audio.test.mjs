import test from "node:test";
import assert from "node:assert/strict";
import { VoyageAudio, musicMood } from "../src/lib/audio/voyage-audio.ts";

class Param {
  value = 0;
  events = [];
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; this.events.push(value); }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param();
  frequency = new Param();
  delayTime = new Param();
  playbackRate = new Param();
  pan = new Param();
  threshold = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  buffer = null;
  loop = false;
  onended = null;
  disconnected = false;
  stopped = false;
  connect() {}
  disconnect() { this.disconnected = true; }
  start() {}
  stop() { this.stopped = true; this.onended?.(); }
}
class Context {
  static instances = [];
  currentTime = 0;
  sampleRate = 8000;
  destination = new Node();
  state = "suspended";
  oscillators = [];
  gains = [];
  sources = [];
  convolvers = [];
  constructor() { Context.instances.push(this); }
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  createDelay() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createConvolver() { const node = new Node(); this.convolvers.push(node); return node; }
  createBufferSource() { const node = new Node(); this.sources.push(node); return node; }
  createBuffer(channels, length, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, numberOfChannels: channels, sampleRate: rate, duration: length / rate, getChannelData: i => data[i] };
  }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
  async close() { this.state = "closed"; }
}

const defaults = { enabled: true, music: .35, effects: .55, ducked: false, quiet: false, mood: "title" };

test("music follows the current screen, encounter and ending", () => {
  assert.equal(musicMood("title", "scylla", true, false), "title");
  assert.equal(musicMood("intro", "lotus", false, false), "title");
  assert.equal(musicMood("play", "circe", false, false), "voyage");
  assert.equal(musicMood("play", "scylla", false, false), "danger");
  assert.equal(musicMood("play", "ithaca", false, false), "home");
  assert.equal(musicMood("play", "lotus", true, false), "danger");
  assert.equal(musicMood("play", "ithaca", true, true), "home");
});

test("audio waits for player interaction, respects separate volumes, ducks, and stays silent while recording", async (t) => {
  t.mock.method(globalThis, "setInterval", () => 1);
  t.mock.method(globalThis, "clearInterval", () => {});
  const original = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => { globalThis.AudioContext = original; });
  Context.instances = [];
  const audio = new VoyageAudio();
  t.after(() => audio.dispose());

  audio.update(defaults);
  audio.cue("send");
  assert.equal(Context.instances.length, 0, "preferences alone must not start audio");
  await audio.unlock();
  const ctx = Context.instances[0];
  assert.equal(ctx.state, "running");
  const [music, effects] = ctx.gains;
  assert.equal(music.gain.value, .35);
  assert.equal(effects.gain.value, .55);

  audio.update({ ...defaults, ducked: true });
  assert.ok(music.gain.value < .1, "spoken replies lower music");
  assert.equal(effects.gain.value, .55);
  audio.update({ ...defaults, music: 0 });
  const beforeCue = ctx.sources.length;
  audio.cue("send");
  assert.ok(ctx.sources.length > beforeCue, "effects work with music at zero");

  audio.update({ ...defaults, quiet: true });
  assert.equal(ctx.state, "suspended");
  assert.equal(music.gain.value, 0);
  assert.equal(effects.gain.value, 0);
  const beforeSilence = ctx.sources.length;
  audio.cue("reply");
  assert.equal(ctx.sources.length, beforeSilence, "no cues during dictation or hidden tabs");
  audio.update(defaults);
  assert.equal(ctx.state, "running");
  audio.update({ ...defaults, enabled: false });
  assert.equal(ctx.state, "suspended");
});

test("mood changes crossfade, volume input is bounded, and cleanup cannot restart sound", async (t) => {
  t.mock.method(globalThis, "setInterval", () => 1);
  t.mock.method(globalThis, "clearInterval", () => {});
  const original = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => { globalThis.AudioContext = original; });
  Context.instances = [];
  const audio = new VoyageAudio();
  t.after(() => audio.dispose());
  audio.update(defaults);
  await audio.unlock();
  const ctx = Context.instances[0];
  const oldLayer = ctx.gains.find((node) => node.gain.events.includes(1));
  assert.ok(oldLayer);
  audio.update({ ...defaults, mood: "danger", music: 4, effects: NaN });
  assert.ok(oldLayer.gain.events.includes(0), "old theme fades out");
  assert.ok(ctx.gains.filter((node) => node.gain.events.includes(1)).length >= 2, "new theme fades in");
  assert.equal(ctx.gains[0].gain.value, 1);
  assert.equal(ctx.gains[1].gain.value, 0);
  audio.dispose();
  assert.equal(ctx.state, "closed");
  assert.ok(ctx.oscillators.every((node) => node.disconnected));
  await audio.unlock();
  assert.equal(Context.instances.length, 1);
});

test("chase intensity is bounded and silent at zero, and grows real footfall sound as it rises", async (t) => {
  t.mock.method(globalThis, "setInterval", () => 1);
  t.mock.method(globalThis, "clearInterval", () => {});
  const original = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => { globalThis.AudioContext = original; });

  // setIntensity must be safe to call before the audio context exists at
  // all — the cave's render loop starts ticking well before a player has
  // necessarily opted into sound.
  const early = new VoyageAudio();
  t.after(() => early.dispose());
  assert.doesNotThrow(() => early.setIntensity(0.5));

  Context.instances = [];
  const quiet = new VoyageAudio();
  t.after(() => quiet.dispose());
  quiet.setIntensity(-5); // clamps to 0 before any context exists
  await quiet.unlock();
  quiet.update(defaults);
  const quietSources = Context.instances[0].sources.length;

  Context.instances = [];
  const tense = new VoyageAudio();
  t.after(() => tense.dispose());
  tense.setIntensity(50); // clamps to 1
  await tense.unlock();
  tense.update(defaults);
  const tenseSources = Context.instances[0].sources.length;

  assert.ok(
    tenseSources > quietSources,
    `full chase tension should schedule audible footfalls (quiet=${quietSources}, tense=${tenseSources})`,
  );

  // A value just under the threshold stays silent — there is a real cutoff,
  // not a value that merely approaches zero.
  Context.instances = [];
  const barely = new VoyageAudio();
  t.after(() => barely.dispose());
  barely.setIntensity(0.02);
  await barely.unlock();
  barely.update(defaults);
  assert.equal(Context.instances[0].sources.length, quietSources, "below the threshold, no footfalls");
});

async function unlocked(t) {
  t.mock.method(globalThis, "setInterval", () => 1);
  t.mock.method(globalThis, "clearInterval", () => {});
  const original = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => { globalThis.AudioContext = original; });
  Context.instances = [];
  const audio = new VoyageAudio();
  t.after(() => audio.dispose());
  audio.update(defaults);
  await audio.unlock();
  return { audio, ctx: Context.instances[0] };
}

test("effects stay within the polyphony limits, cutting the oldest copy", async (t) => {
  const { audio, ctx } = await unlocked(t);
  const before = ctx.sources.length;
  audio.play(Array.from({ length: 10 }, () => ({ sound: "coin" })));
  const coins = ctx.sources.slice(before);
  assert.equal(coins.length, 10);
  assert.equal(coins.filter(s => s.stopped).length, 6, "at most four coins ring at once");
  assert.ok(coins.slice(-4).every(s => !s.stopped), "the newest copies survive");
  audio.play(Array.from({ length: 40 }, (_, i) => ({ sound: ["crash", "hit", "splash", "clang", "thunk", "roar", "land", "jump", "swish", "fizz"][i % 10] })));
  const playing = ctx.sources.filter(s => !s.stopped && !s.loop);
  assert.ok(playing.length <= 24, `${playing.length} voices at once`);
});

test("a held control cannot machine-gun a sound", async (t) => {
  const { audio, ctx } = await unlocked(t);
  const before = ctx.sources.length;
  for (let i = 0; i < 10; i++) audio.play([{ sound: "bow-draw" }]);
  assert.equal(ctx.sources.length - before, 1);
});

test("a scene change crossfades its ambience beds and swaps the reverb", async (t) => {
  const { audio, ctx } = await unlocked(t);
  const seaBeds = ctx.sources.filter(s => s.loop);
  assert.equal(seaBeds.length, 1, "the voyage opens on the sea");
  const seaImpulse = ctx.convolvers.find(c => c.buffer)?.buffer;
  audio.setScene("cave");
  const caveBeds = ctx.sources.filter(s => s.loop && !seaBeds.includes(s));
  assert.equal(caveBeds.length, 2, "cave air and torchlight");
  const caveImpulse = ctx.convolvers.find(c => c.buffer && c.buffer !== seaImpulse)?.buffer;
  assert.ok(caveImpulse.duration > seaImpulse.duration, "the cave rings longer than open sea");
  const loops = ctx.sources.length;
  audio.setScene("cave");
  assert.equal(ctx.sources.length, loops, "the same scene is not restarted");
});

test("quiet or disabled audio starts no effects, loops or ambience", async (t) => {
  const { audio, ctx } = await unlocked(t);
  audio.update({ ...defaults, quiet: true });
  const before = ctx.sources.length;
  audio.frame({ cues: [{ sound: "crash" }, { sound: "coin" }], loops: { giant: 1, run: 1 }, scene: "storm" });
  assert.equal(ctx.sources.length, before);
  audio.update({ ...defaults, enabled: false });
  audio.cue("sail");
  assert.equal(ctx.sources.length, before);
  audio.update(defaults);
  assert.ok(ctx.sources.filter(s => s.loop).length > 1, "the storm's beds start once sound is back");
});

test("frames carry cues, loops and scenes; the older screens' cues still play", async (t) => {
  const { audio, ctx } = await unlocked(t);
  const before = ctx.sources.length;
  audio.frame({ cues: [{ sound: "siren-note", rate: 2 ** (7 / 12), pan: 0.3 }], loops: {}, scene: "calm" });
  const note = ctx.sources.find((s, i) => i >= before && !s.loop);
  assert.ok(Math.abs(note.playbackRate.value - 2 ** (7 / 12)) < 1e-9, "the lane's pitch is kept exactly");
  for (const cue of ["send", "reply", "costly", "sail", "select"]) {
    const count = ctx.sources.length;
    audio.cue(cue);
    assert.equal(ctx.sources.length, count + 1, cue);
  }
});
