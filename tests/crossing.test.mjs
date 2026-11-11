import test from "node:test";
import assert from "node:assert/strict";
import { crossingBeats, crossingLines, ease, sailingSeconds, span } from "../src/lib/story/crossing.ts";
import { trials } from "../src/lib/arcade/arcade.ts";

const order = ["overview", "dive", "appear", "walkOut", "board", "sail", "land", "walkIn", "arrive", "card", "end"];

test("every crossing's beats run in order, and the whole crossing stays short enough to sit through", () => {
  for (let legs = 1; legs < trials.length; legs++) {
    const beats = crossingBeats(legs);
    for (let i = 1; i < order.length; i++) assert.ok(beats[order[i]] > beats[order[i - 1]], `${order[i]} after ${order[i - 1]} with ${legs} legs`);
    assert.ok(beats.end <= 15, `a ${legs}-leg crossing lasts ${beats.end}s`);
  }
});

test("sailing takes longer across more islands, the same in either direction, and is capped", () => {
  assert.ok(sailingSeconds(3) > sailingSeconds(1));
  assert.equal(sailingSeconds(-3), sailingSeconds(3));
  assert.equal(sailingSeconds(7), 5.6);
  assert.ok(Math.abs(crossingBeats(2).land - crossingBeats(2).sail - sailingSeconds(2)) < 1e-9);
});

test("the bard has a line for every island, short enough to finish during the crossing", () => {
  for (const t of trials) {
    const line = crossingLines[t.id];
    assert.ok(line, `no line for ${t.id}`);
    assert.ok(line.length <= 110, `${t.id}: ${line.length} characters`);
    assert.match(line, /\.$/);
  }
});

test("the timing helpers stay between 0 and 1 and meet their ends", () => {
  assert.equal(span(5, 2, 4), 1);
  assert.equal(span(1, 2, 4), 0);
  assert.equal(span(3, 2, 4), 0.5);
  assert.equal(span(4, 4, 4), 1);
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.equal(ease(0.5), 0.5);
});
