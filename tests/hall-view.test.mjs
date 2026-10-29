import test from "node:test";
import assert from "node:assert/strict";
import { standardPlan } from "../src/lib/arcade/arcade.ts";
import { BOW, axeZ, mythicAction, newMythic, tickMythic } from "../src/lib/encounters/mythic.ts";
import { VIEW_H, VIEW_W } from "../src/lib/render/stage.ts";
import { arrowPoint, axeAt, flightOf, hallCamera, projector, sightPoint } from "../src/lib/render/hall-view.ts";

function advance(s, ms) { for (let t = 0; t < ms && !s.done; t += 50) s = tickMythic(s, 50); return s; }
function loosed(aim = { aim: 0, elevation: 0 }, wind = 0) {
  let s = { ...newMythic("bow", "normal", standardPlan("bow")), wind };
  for (const field of ["aim", "elevation"]) s = mythicAction(s, { type: "aim", field, value: aim[field] });
  s = mythicAction(s, { type: "draw", held: true }); s = advance(s, 1000);
  return mythicAction(s, { type: "draw", held: false });
}

test("the projection puts what the camera looks at in the middle, up as up and right as right", () => {
  const view = projector({ eye: { x: 0, y: 1.5, z: 0 }, look: { x: 0, y: 1.5, z: -10 }, fov: 40 });
  const centre = view({ x: 0, y: 1.5, z: -10 });
  assert.ok(Math.abs(centre.x - VIEW_W / 2) < 1e-6 && Math.abs(centre.y - VIEW_H / 2) < 1e-6);
  assert.ok(view({ x: 0, y: 2.5, z: -10 }).y < VIEW_H / 2, "higher in the hall is higher on screen");
  assert.ok(view({ x: 1, y: 1.5, z: -10 }).x > VIEW_W / 2, "right in the hall is right on screen");
  // At 40° the top edge of the frame is 20° above the view line.
  assert.ok(Math.abs(view({ x: 0, y: 1.5 + 10 * Math.tan(20 * Math.PI / 180), z: -10 }).y) < 1e-6);
  assert.equal(view({ x: 0, y: 1.5, z: 3 }).on, false, "nothing behind the eye is drawn");
});

test("the axes stand where the rules measure them, and a level sight points through the twelfth", () => {
  assert.ok(Math.abs(axeAt(1).z + BOW.firstAxeM) < 1e-9);
  assert.ok(Math.abs(axeAt(12).z - axeAt(11).z + BOW.axeGapM) < 1e-9);
  assert.deepEqual(sightPoint({ aim: 0, elevation: 0 }), axeAt(12));
  const right = sightPoint({ aim: 10, elevation: 0 });
  assert.ok(Math.abs(right.x - 10 * BOW.perSight * BOW.unitM) < 1e-9 && right.z === axeAt(12).z);
});

test("while aiming, the sight is drawn where it points: centred when level, right of centre when aimed right", () => {
  const s = newMythic("bow", "normal", standardPlan("bow"));
  const settled = advance(s, 2000);
  const level = projector(hallCamera(settled))(sightPoint(settled.aim));
  const aimed = mythicAction(settled, { type: "aim", field: "aim", value: 8 });
  const right = projector(hallCamera(aimed))(sightPoint(aimed.aim));
  assert.ok(Math.abs(level.x - VIEW_W / 2) < 2, `level sight at ${level.x}`);
  assert.ok(right.x > level.x + 10, "aiming right moves the sight right");
});

test("an arrow flies down the line until it strikes the axe it misses, and stays there", () => {
  assert.equal(flightOf(newMythic("bow", "normal", standardPlan("bow"))), null, "no arrow flies while aiming");
  // Wind 40, aimed straight: this arrow threads seven axes and strikes the eighth.
  let s = loosed({ aim: 0, elevation: 0 }, 40);
  assert.equal(s.shot.rings, 7);
  const early = flightOf(advance(s, 200)), late = flightOf(advance(s, 1400));
  assert.ok(early.z > 0 && early.z < late.z && !early.landed);
  assert.ok(Math.abs(late.z - axeZ(8)) < 1e-9 && late.landed);
  assert.ok(Math.abs(flightOf(advance(s, 2400)).z - axeZ(8)) < 1e-9, "a struck arrow does not move on");
});

test("the camera chases the player's arrow from behind and never flies through it", () => {
  const s = loosed();
  for (let t = 0; t < BOW.flightMs + BOW.resultMs; t += 100) {
    const at = advance(s, t), f = flightOf(at), cam = hallCamera(at);
    const arrow = arrowPoint(f.shot, f.z);
    assert.ok(cam.eye.z > arrow.z + 0.3, `at ${t} ms the eye (${cam.eye.z}) should trail the arrow (${arrow.z})`);
    assert.ok(projector(cam)(arrow).on, `the arrow stays in view at ${t} ms`);
  }
});
