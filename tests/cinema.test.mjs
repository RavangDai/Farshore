import test from "node:test";
import assert from "node:assert/strict";
import {
  DURATION, JOURNEY_BEATS,
  captionAt, cinemaCaptions, cinemaCues, cuesBetween, flashAt, gateShot, journeyShot, lightAt, runesAt, voyagePoint, walkingAt,
} from "../src/lib/story/cinema.ts";
import { CHECKPOINTS } from "../src/lib/cinema/map-layout.ts";
import { sounds } from "../src/lib/audio/sounds.ts";
import { trials } from "../src/lib/arcade/arcade.ts";

const KINDS = ["unlock", "journey"];
/** Every 20 ms of a film. */
const frames = kind => Array.from({ length: Math.round(DURATION[kind] / 0.02) + 1 }, (_, i) => Math.min(DURATION[kind], i * 0.02));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("journey: the cleared trial, then the chart, then the next trial, always one painting in full", () => {
  let prev = journeyShot(0);
  assert.ok(close(prev.from, 1) && prev.map === 0 && prev.to === 0);
  for (const t of frames("journey")) {
    const s = journeyShot(t);
    assert.ok([s.from, s.map, s.to, s.fromZoom, s.mapZoom, s.toZoom, s.voyage].every(Number.isFinite), `finite at ${t}`);
    // Stacked fades: whichever painting is fading in, a solid one lies beneath it, so the frame never dims.
    const solidBeneath = s.to > 0 ? s.map === 1 || s.to === 1 : s.map > 0 ? s.from === 1 || s.map === 1 : s.from === 1;
    assert.ok(solidBeneath, `a dim frame at ${t}: ${JSON.stringify(s)}`);
    assert.ok(s.fromZoom >= 1 && s.toZoom >= 1 && s.mapZoom >= 1.5, `zoomed out past the art at ${t}`);
    // No jumps: the camera moves smoothly between frames 20 ms apart.
    assert.ok(Math.abs(s.mapZoom - prev.mapZoom) < 0.05 && Math.abs(s.voyage - prev.voyage) < 0.03, `jump at ${t}`);
    assert.ok(s.voyage >= prev.voyage - 1e-12, "the ship never sails back");
    prev = s;
  }
  const end = journeyShot(DURATION.journey);
  assert.ok(end.to === 1 && end.from === 0 && end.map === 0 && end.voyage === 1);
  assert.equal(journeyShot(JOURNEY_BEATS.sail[0]).voyage, 0);
  assert.equal(journeyShot(JOURNEY_BEATS.sail[1]).voyage, 1);
  // The chart is in full for the whole voyage.
  for (let t = JOURNEY_BEATS.sail[0]; t <= JOURNEY_BEATS.toIn[0]; t += 0.1) assert.ok(close(journeyShot(t).map, 1), `chart at ${t}`);
});

test("journey: the ship's light sails from one checkpoint to the next, and stays on the chart", () => {
  for (let i = 0; i < trials.length - 1; i++) {
    const a = CHECKPOINTS[trials[i].id], b = CHECKPOINTS[trials[i + 1].id];
    const from = { x: a.x / 100, y: a.y / 100 }, to = { x: b.x / 100, y: b.y / 100 };
    const start = voyagePoint(from, to, 0), end = voyagePoint(from, to, 1);
    assert.ok(close(start.x, from.x) && close(start.y, from.y) && close(end.x, to.x) && close(end.y, to.y), trials[i].id);
    for (let u = 0; u <= 1; u += 0.05) {
      const p = voyagePoint(from, to, u);
      assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1, `${trials[i].id} off the chart at ${u}`);
    }
  }
});

test("unlock: the key comes down, the seal burns after it lands, light pours, and the film ends in the flash", () => {
  assert.equal(gateShot(2.4).key.visible, false);
  const falling = gateShot(3);
  assert.ok(falling.key.visible && falling.key.y > 0 && falling.key.y < 1);
  assert.ok(close(gateShot(3.75).key.y, 1));
  assert.equal(gateShot(5.1).key.visible, false);
  let zoom = 0;
  for (const t of frames("unlock")) {
    const s = gateShot(t);
    assert.ok(s.zoom >= zoom - 1e-12 && s.zoom >= 1, `the camera backs away at ${t}`);
    zoom = s.zoom;
    if (s.seal > 0) assert.ok(t > 3.75, `the seal burns before the key lands at ${t}`);
  }
  assert.ok(runesAt("unlock", 4.3) === 0 && runesAt("unlock", 5.0) === 1);
  assert.ok(lightAt("unlock", 4.7) === 0 && lightAt("unlock", 6.7) === 1);
  assert.ok(flashAt("unlock", 6.6) === 0 && flashAt("unlock", DURATION.unlock) === 1);
  assert.ok(runesAt("journey", 8.2) > runesAt("journey", 2) + 0.4);
  assert.equal(lightAt("journey", 8), 0);
  assert.ok(flashAt("journey", 8.0) === 0 && flashAt("journey", DURATION.journey) === 1);
});

test("the cues are real sounds, sorted, inside the film, with footsteps only while he is on foot", () => {
  for (const kind of KINDS) {
    const cues = cinemaCues(kind);
    assert.ok(cues.length > 8, kind);
    cues.forEach((c, i) => {
      assert.ok(c.sound in sounds, `${kind}: no sound ${c.sound}`);
      assert.ok(c.t > 0 && c.t <= DURATION[kind]);
      if (i) assert.ok(c.t >= cues[i - 1].t);
      if (c.sound === "step-stone") assert.ok(walkingAt(kind, c.t), `${kind}: a step at ${c.t} while standing`);
    });
  }
  assert.ok(!cinemaCues("unlock").some(c => c.sound === "step-stone" && c.t > 2.8 && c.t < 5.5), "no steps while he waits at the gate");
  // Once at sea, the voyage sounds like a ship, not a road.
  const atSea = cinemaCues("journey").filter(c => c.t > JOURNEY_BEATS.mapIn[1] && c.t < JOURNEY_BEATS.toIn[0]);
  assert.ok(!atSea.some(c => c.sound === "step-stone") && atSea.some(c => c.sound === "oar"));
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

test("captions name the trial behind (before the chart) and the trial ahead", () => {
  const unlock = cinemaCaptions("unlock", null, { number: 3, title: "The Lotus-Eaters", kind: "Maze rescue" });
  assert.equal(captionAt(unlock, 5), null);
  assert.equal(captionAt(unlock, 6).title, "The Lotus-Eaters");
  assert.equal(captionAt(unlock, 6).line, "Trial 3 of 8 · Maze rescue");
  const journey = cinemaCaptions("journey", { number: 2, title: "Sirens' Passage" }, { number: 3, title: "The Lotus-Eaters", kind: "Maze rescue" });
  assert.equal(captionAt(journey, 1).title, "Sirens' Passage");
  assert.match(captionAt(journey, 1).eyebrow, /cleared/);
  assert.equal(captionAt(journey, 4), null, "the chart has the frame to itself");
  assert.equal(captionAt(journey, 7).title, "The Lotus-Eaters");
});
