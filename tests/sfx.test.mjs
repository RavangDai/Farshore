import test from "node:test";
import assert from "node:assert/strict";
import { env, filtered, impulseResponse, pink, rng, tone, white } from "../src/lib/audio/dsp.ts";
import { sounds, soundNames } from "../src/lib/audio/sounds.ts";

// Rendered at a low rate so the whole library stays fast to test.
const SR = 16000;
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const channels = out => (Array.isArray(out) ? out : [out]);
const peak = a => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const crossings = a => { let c = 0; for (let i = 1; i < a.length; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) c++; return c / a.length; };

test("noise and envelopes are deterministic per seed", () => {
  assert.deepEqual(white(64, rng(7)), white(64, rng(7)));
  assert.notDeepEqual(white(64, rng(7)), white(64, rng(8)));
  assert.deepEqual(pink(64, rng(3)), pink(64, rng(3)));
  const e = env(1000, 1000, 0.1, 0.5);
  assert.equal(e[0], 0);
  assert.equal(e[100], 1);
  assert.ok(Math.abs(e[600] - 0.001) < 0.0005, "decay reaches -60 dB after its time");
});

test("a lowpass keeps lows and removes highs", () => {
  const low = tone(SR, SR, 100), high = tone(SR, SR, 5000);
  assert.ok(rms(filtered(low, "lowpass", 1000, 0.707, SR)) > 0.6);
  assert.ok(rms(filtered(high, "lowpass", 1000, 0.707, SR)) < 0.05);
  assert.ok(rms(filtered(high, "highpass", 1000, 0.707, SR)) > 0.6);
});

test("impulse responses decay and differ between channels", () => {
  for (const space of ["hall", "cave", "sea", "ethereal", "storm"]) {
    const [left, right] = impulseResponse(space, SR, 1), tenth = Math.floor(left.length / 10);
    assert.ok(rms(left.subarray(-tenth)) < rms(left.subarray(0, tenth)) * 0.05, `${space} decays`);
    assert.notDeepEqual(left.subarray(1000, 1200), right.subarray(1000, 1200), `${space} is stereo`);
  }
  assert.ok(impulseResponse("cave", SR)[0].length > impulseResponse("sea", SR)[0].length, "a cave rings longer than open sea");
});

test("every sound renders finite, audible audio of its stated length", () => {
  assert.ok(soundNames.length >= 60);
  for (const name of soundNames) {
    const recipe = sounds[name], out = channels(recipe.render(SR, rng(1)));
    assert.ok(out.length === (recipe.loop ? 2 : 1), `${name} channel count`);
    for (const c of out) {
      assert.ok(Math.abs(c.length - recipe.seconds * SR) <= 2, `${name} length ${c.length}`);
      assert.ok(c.every(Number.isFinite), `${name} is finite`);
      assert.ok(peak(c) > 1e-3, `${name} is audible`);
    }
    assert.ok(recipe.gain > 0 && recipe.gain <= 1, `${name} gain`);
    assert.ok(recipe.variants >= 1);
  }
});

test("variants differ and renders repeat per seed", () => {
  for (const name of ["step-stone", "crash", "coin", "drip"]) {
    const a = channels(sounds[name].render(SR, rng(1)))[0], b = channels(sounds[name].render(SR, rng(1)))[0], c = channels(sounds[name].render(SR, rng(2)))[0];
    assert.deepEqual(a, b, `${name} repeats`);
    assert.notDeepEqual(a, c, `${name} varies`);
  }
});

test("impacts are darker than chimes, and a giant is deeper than a footstep", () => {
  const brightness = name => crossings(channels(sounds[name].render(SR, rng(1)))[0]);
  assert.ok(brightness("crash") < brightness("coin"));
  assert.ok(brightness("giant-step") < brightness("step-stone"));
  assert.ok(brightness("thunder") < brightness("ting"));
});

test("loop sounds join seamlessly", () => {
  for (const name of soundNames.filter(n => sounds[n].loop)) {
    for (const c of channels(sounds[name].render(SR, rng(1)))) {
      let largest = 0;
      for (let i = 1; i < c.length; i++) largest = Math.max(largest, Math.abs(c[i] - c[i - 1]));
      assert.ok(Math.abs(c[0] - c[c.length - 1]) <= largest, `${name} wraps without a click`);
    }
  }
});
