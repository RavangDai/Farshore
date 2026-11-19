import test from "node:test";
import assert from "node:assert/strict";
import {
  CINEMA_THEMES, DURATION, JOURNEY_GATE_Z, JOURNEY_PAST_GATE_Z, LOCK, SHOTS,
  cameraAt, captionAt, cinemaCaptions, cinemaCues, cuesBetween, doorsAt, flashAt, heroAt, keyAt, lightAt, runesAt,
} from "../src/lib/story/cinema.ts";
import { sounds } from "../src/lib/audio/sounds.ts";
import { trials } from "../src/lib/arcade/arcade.ts";

const KINDS = ["unlock", "journey"];
/** Every 20 ms of a film. */
const frames = kind => Array.from({ length: Math.round(DURATION[kind] / 0.02) + 1 }, (_, i) => Math.min(DURATION[kind], i * 0.02));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("every trial has a light for its gate", () => {
  assert.deepEqual(Object.keys(CINEMA_THEMES).sort(), trials.map(t => t.id).sort());
  for (const theme of Object.values(CINEMA_THEMES)) assert.ok(theme.near < theme.far && theme.sunI > 0);
});

test("the camera is finite, above the causeway and glides through its first and last shots", () => {
  for (const kind of KINDS) {
    for (const t of frames(kind)) {
      const { cam, look } = cameraAt(kind, t);
      assert.ok([...cam, ...look].every(Number.isFinite), `${kind} ${t}`);
      assert.ok(cam[1] > 0.8, `${kind} camera at y ${cam[1]} at ${t}`);
    }
    const shots = SHOTS[kind], first = cameraAt(kind, 0), last = cameraAt(kind, DURATION[kind]);
    assert.ok(shots[0].cam.every((v, i) => close(v, first.cam[i])) && !shots[0].rel, kind);
    assert.ok(shots.at(-1).cam.every((v, i) => close(v, last.cam[i])) && !shots.at(-1).rel, kind);
    // No jumps: between frames 20 ms apart the camera moves less than half a metre.
    let prev = cameraAt(kind, 0).cam;
    for (const t of frames(kind).slice(1)) {
      const { cam } = cameraAt(kind, t);
      assert.ok(Math.hypot(cam[0] - prev[0], cam[1] - prev[1], cam[2] - prev[2]) < 0.5, `${kind} jump at ${t}`);
      prev = cam;
    }
  }
});

test("unlock: he walks to the gate and waits; the doors open only after the key has turned", () => {
  for (const t of frames("unlock")) {
    const hero = heroAt("unlock", t), doors = doorsAt("unlock", t);
    if (doors < 0.6) assert.ok(hero.z > 1.5, `through a closed door at ${t}: z ${hero.z}`);
    if (t > 2.7 && t < 5.5) assert.equal(hero.walking, false);
    if (doors > 0) assert.ok(keyAt(t).turn > 0 || !keyAt(t).visible, `doors moved before the key turned at ${t}`);
    // The camera rides up to the doorway only once the doors stand open, and never through the leaves.
    const cam = cameraAt("unlock", t).cam;
    assert.ok(cam[2] > 0.9, `camera in the doors at ${t}`);
    if (cam[2] < 3) assert.ok(doors > 0.85 || Math.abs(cam[0]) < 1.5 && t < 5.2, `camera at the closed doors at ${t}`);
  }
  assert.equal(heroAt("unlock", 0).z, 15);
  assert.ok(heroAt("unlock", DURATION.unlock).z < -5, "he walks through at the end");
  assert.equal(doorsAt("unlock", 4.9), 0);
  assert.equal(doorsAt("unlock", 6.6), 1);
  assert.equal(doorsAt("journey", 5), 0);
});

test("unlock: the key falls upright, tips into the lock, makes a quarter turn and burns away", () => {
  assert.equal(keyAt(2.4).visible, false);
  const falling = keyAt(2.9);
  assert.ok(falling.visible && falling.y > LOCK[1] + 2 && falling.pitch < 0.3 && falling.spin > 1, JSON.stringify(falling));
  const seated = keyAt(4.05);
  assert.ok(close(seated.y, LOCK[1]) && close(seated.pitch, Math.PI / 2) && close(seated.spin, 0) && seated.turn < 0.01, JSON.stringify(seated));
  assert.ok(close(keyAt(4.6).turn, Math.PI / 2, 1e-9));
  assert.ok(keyAt(4.7).glow > keyAt(4.2).glow);
  assert.equal(keyAt(5.1).visible, false);
  assert.ok(runesAt("unlock", 4.3) === 0 && runesAt("unlock", 5.0) === 1);
  assert.ok(lightAt("unlock", 4.7) === 0 && lightAt("unlock", 6.7) === 1);
  assert.ok(flashAt("unlock", 6.6) === 0 && flashAt("unlock", DURATION.unlock) === 1);
});

test("journey: out through the old gate, on to stop short of the next; the next gate's runes stir", () => {
  const start = heroAt("journey", 0), end = heroAt("journey", DURATION.journey);
  assert.ok(start.z < JOURNEY_PAST_GATE_Z && start.z > JOURNEY_PAST_GATE_Z - 3);
  assert.ok(end.z > JOURNEY_GATE_Z + 5 && end.z < JOURNEY_GATE_Z + 12 && !end.walking);
  let z = start.z;
  for (const t of frames("journey")) {
    const hero = heroAt("journey", t);
    assert.ok(hero.z <= z + 1e-9, "he never walks back");
    z = hero.z;
    const cam = cameraAt("journey", t).cam;
    assert.ok(cam[2] > JOURNEY_GATE_Z + 2, `camera in the next gate at ${t}`);
    // Passing the old gate, the camera keeps inside its open doorway: the leaves stand at |x| > 2.9.
    if (cam[2] > JOURNEY_PAST_GATE_Z - 3.6 && cam[2] < JOURNEY_PAST_GATE_Z + 1) assert.ok(Math.abs(cam[0]) < 2.7, `camera in the old gate's leaves at ${t}: x ${cam[0]}`);
  }
  assert.ok(runesAt("journey", 8.2) > runesAt("journey", 2) + 0.4);
  assert.equal(lightAt("journey", 8), 0);
  assert.ok(flashAt("journey", 8.0) === 0 && flashAt("journey", DURATION.journey) === 1);
});

test("the cues are real sounds, sorted, inside the film, with footsteps only while he walks", () => {
  for (const kind of KINDS) {
    const cues = cinemaCues(kind);
    assert.ok(cues.length > 8, kind);
    cues.forEach((c, i) => {
      assert.ok(c.sound in sounds, `${kind}: no sound ${c.sound}`);
      assert.ok(c.t > 0 && c.t <= DURATION[kind]);
      if (i) assert.ok(c.t >= cues[i - 1].t);
      if (c.sound === "step-stone") assert.ok(heroAt(kind, c.t).walking, `${kind}: a step at ${c.t} while standing`);
    });
  }
  assert.ok(!cinemaCues("unlock").some(c => c.sound === "step-stone" && c.t > 2.8 && c.t < 5.5), "no steps while he waits at the gate");
});

test("cuesBetween plays every cue exactly once, whatever the frame rate", () => {
  for (const kind of KINDS) {
    const cues = cinemaCues(kind), heard = [];
    let t = 0;
    for (const dt of [0.016, 0.1, 0.033, 0.07, 0.016, 0.25]) for (let n = 0; n < 40 && t < DURATION[kind]; n++) {
      const next = Math.min(DURATION[kind], t + dt);
      heard.push(...cuesBetween(cues, t, next));
      t = next;
    }
    while (t < DURATION[kind]) { const next = Math.min(DURATION[kind], t + 0.05); heard.push(...cuesBetween(cues, t, next)); t = next; }
    assert.deepEqual(heard, cues, kind);
  }
});

test("captions name the trial behind and the trial ahead", () => {
  const unlock = cinemaCaptions("unlock", null, { number: 3, title: "The Lotus-Eaters", kind: "Maze rescue" });
  assert.equal(captionAt(unlock, 5), null);
  assert.equal(captionAt(unlock, 6).title, "The Lotus-Eaters");
  assert.equal(captionAt(unlock, 6).line, "Trial 3 of 8 · Maze rescue");
  const journey = cinemaCaptions("journey", { number: 2, title: "Sirens' Passage" }, { number: 3, title: "The Lotus-Eaters", kind: "Maze rescue" });
  assert.equal(captionAt(journey, 1).title, "Sirens' Passage");
  assert.match(captionAt(journey, 1).eyebrow, /cleared/);
  assert.equal(captionAt(journey, 4), null);
  assert.equal(captionAt(journey, 7).title, "The Lotus-Eaters");
});
