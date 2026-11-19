import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { assistTrial, finishAttempt, newArcade } from "../src/lib/arcade/arcade.ts";
import { ENVIRONMENTS, MAP_FX, envFor } from "../src/lib/cinema/art.ts";
import { CHECKPOINTS, MAP_ART, MARKER_ART, ROUTE, markerStateLabel, markerStates } from "../src/lib/cinema/map-layout.ts";
import { TRIAL_COPY } from "../src/lib/cinema/scenes.ts";

const pack = JSON.parse(readFileSync(new URL("../public/art/cinematic/map/map-layout.json", import.meta.url), "utf8"));
const publicFile = path => new URL(`../public${path}`, import.meta.url);
const win = () => ({ won: true, source: "standard", hits: 0, successes: 8, early: 0, late: 0, misses: 0, laneMs: [0, 0, 0], score: 800, timeMs: 30000, difficulty: "easy" });

test("the chart's checkpoints match the asset pack's map-layout.json, in voyage order", () => {
  assert.equal(pack.width, MAP_ART.width); assert.equal(pack.height, MAP_ART.height);
  assert.equal(pack.checkpoints.length, ROUTE.length);
  pack.checkpoints.forEach((cp, i) => {
    const id = ROUTE[i], ours = CHECKPOINTS[id];
    assert.equal(ours.id, cp.id, `${id} id`);
    assert.equal(ours.number, cp.number, `${id} number`);
    assert.equal(ours.x, cp.xPct, `${id} x`); assert.equal(ours.y, cp.yPct, `${id} y`);
    assert.equal(TRIAL_COPY[id].short, cp.name, `${id} name`);
  });
});

test("every painting, card, marker and the map the menus load is in public/", () => {
  for (const path of [MAP_ART.src, MAP_ART.original, MAP_ART.route, ...Object.values(MARKER_ART)]) assert.ok(existsSync(publicFile(path)), path);
  for (const env of Object.values(ENVIRONMENTS)) {
    for (const suffix of [".png", ".webp", "-card.webp"]) assert.ok(existsSync(publicFile(`/art/cinematic/environments/${env.file}${suffix}`)), env.file + suffix);
  }
});

test("effects stay on the painting: anchors, areas and crops are percentages", () => {
  const inRange = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what} = ${v}`);
  for (const [name, spec] of [...Object.entries(ENVIRONMENTS).map(([k, e]) => [k, e.fx]), ["map", MAP_FX]]) {
    for (const g of spec.glows) { inRange(g.x, 0, 100, `${name} glow x`); inRange(g.y, 0, 100, `${name} glow y`); }
    for (const e of spec.emitters) { assert.ok(e.area[0] < e.area[2] && e.area[1] < e.area[3], `${name} ${e.kind} area`); assert.ok(e.count > 0); }
  }
  for (const [name, env] of Object.entries(ENVIRONMENTS)) { inRange(env.focus[0], 0, 1, `${name} fx`); inRange(env.focus[1], 0, 1, `${name} fy`); inRange(env.card, 0, 100, `${name} card`); }
});

test("each menu world shows its own painting; the chart draws its own stage", () => {
  assert.equal(envFor({ kind: "aegean" }), "home");
  assert.equal(envFor({ kind: "map" }), null);
  assert.equal(envFor({ kind: "trial", id: "lotus", framing: "wide" }), "lotus");
  assert.equal(envFor({ kind: "trial", id: "lotus", framing: "close" }), "lotus-briefing");
  for (const id of ROUTE) if (id !== "lotus") assert.equal(envFor({ kind: "trial", id, framing: "close" }), id);
});

test("marker states come from the save: cleared and assisted are completed, the first unfinished is current", () => {
  let s = { ...newArcade(), started: true };
  let states = markerStates(s);
  assert.equal(states.lotus, "current");
  assert.deepEqual(ROUTE.slice(1).map(id => states[id]), Array(7).fill("available"));
  s = finishAttempt(s, "lotus", win());
  s = assistTrial(s, "cyclops");
  s = finishAttempt(s, "circe", win());
  states = markerStates(s);
  assert.deepEqual([states.lotus, states.cyclops, states.aeolus, states.circe, states.sirens], ["completed", "completed", "current", "completed", "available"]);
  assert.equal(markerStateLabel(states.cyclops, s.records.cyclops), "assisted");
  assert.equal(markerStateLabel(states.lotus, s.records.lotus), "cleared");
  // Nothing is locked under the any-order rule; a stricter rule would lock what it refuses.
  assert.ok(!Object.values(states).includes("locked"));
  assert.equal(markerStates(s, id => id !== "bow").bow, "locked");
  // A finished voyage has no current marker.
  for (const id of ROUTE) s = assistTrial(s, id);
  assert.ok(Object.values(markerStates(s)).every(state => state === "completed"));
});
