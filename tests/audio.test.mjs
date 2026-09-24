import test from "node:test";
import assert from "node:assert/strict";
import { VoyageAudio, musicMood } from "../src/lib/voyage-audio.ts";

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
  onended = null;
  disconnected = false;
  connect() {}
  disconnect() { this.disconnected = true; }
  start() {}
  stop() { this.onended?.(); }
}
class Context {
  static instances = [];
  currentTime = 0;
  sampleRate = 8000;
  destination = new Node();
  state = "suspended";
  oscillators = [];
  gains = [];
  constructor() { Context.instances.push(this); }
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
  createDelay() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createBufferSource() { return new Node(); }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
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
  const beforeCue = ctx.oscillators.length;
  audio.cue("send");
  assert.ok(ctx.oscillators.length > beforeCue, "effects work with music at zero");

  audio.update({ ...defaults, quiet: true });
  assert.equal(ctx.state, "suspended");
  assert.equal(music.gain.value, 0);
  assert.equal(effects.gain.value, 0);
  const beforeSilence = ctx.oscillators.length;
  audio.cue("reply");
  assert.equal(ctx.oscillators.length, beforeSilence, "no cues during dictation or hidden tabs");
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
