import test from "node:test";
import assert from "node:assert/strict";
import { standardPlan } from "../src/lib/arcade/arcade.ts";
import { mythicAction, newMythic, tickMythic } from "../src/lib/encounters/mythic.ts";
import { hallCamera } from "../src/lib/render/hall-view.ts";
import { HallOverlay } from "../src/lib/render/hall-overlay.ts";
import { Particles, VIEW_H } from "../src/lib/render/stage.ts";

/** A 2D context that accepts every call and draws nothing. */
function stubContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "measureText") return () => ({ width: 10 });
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

function advance(s, ms) { for (let t = 0; t < ms && !s.done; t += 50) s = tickMythic(s, 50); return s; }

/** Plays one level arrow through the hall and draws every frame, as HallGame does. */
function shootAndDraw(still) {
  const overlay = new HallOverlay(), c = stubContext();
  const options = { still, coach: false, touch: false, stageHeight: VIEW_H };
  let s = advance(newMythic("bow", "normal", standardPlan("bow")), 1500);
  s = mythicAction(s, { type: "draw", held: true });
  s = advance(s, 1000);
  s = mythicAction(s, { type: "draw", held: false });
  let now = 0;
  for (let t = 0; t < 6000 && !s.done; t += 16) {
    s = tickMythic(s, 16); now += 16;
    overlay.draw(c, s, hallCamera(s), { now, dt: 0.016 }, options);
  }
  return overlay;
}

test("with reduced motion on, an arrow through the axes leaves no rings or sparks behind", () => {
  const overlay = shootAndDraw(true);
  assert.equal(overlay["sparks"].count, 0, "every effect is gone once the shot has played out");
});

test("with motion on, the axe rings play and then clear", () => {
  const overlay = shootAndDraw(false);
  assert.equal(overlay["sparks"].count, 0, "rings last about half a second, not for the rest of the round");
});

test("particles age on real time whatever the motion setting", () => {
  const p = new Particles(10);
  p.spawn({ x: 0, y: 0, vx: 0, vy: 0, size: 4, colour: "#fff", gravity: 0, max: 400, kind: "ring" });
  for (let i = 0; i < 30; i++) p.update(0.016);
  assert.equal(p.count, 0);
});
