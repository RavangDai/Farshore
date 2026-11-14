import test from "node:test";
import assert from "node:assert/strict";
import { BAYER8, PRESETS, moteAlpha, seeded, spawnMote, stepMote, typeSchedule, uncoverAt } from "../src/lib/render/pixel-fx.ts";
import { PALETTE } from "../src/lib/render/palette.generated.ts";

test("the Bayer matrix holds 64 distinct thresholds, evenly spread", () => {
  assert.equal(BAYER8.length, 64);
  assert.equal(new Set(BAYER8).size, 64);
  const sorted = [...BAYER8].sort((a, b) => a - b);
  sorted.forEach((v, i) => assert.ok(Math.abs(v - (i + 0.5) / 64) < 1e-9));
  // Neighbours differ widely, which is what makes the dissolve look dithered.
  assert.ok(Math.abs(BAYER8[0] - BAYER8[1]) > 0.4);
});

test("every cell uncovers within the transition, and the block sweep runs left to right", () => {
  for (const kind of ["dither", "blocks"]) for (let y = 0; y < 16; y++) for (let x = 0; x < 40; x++) {
    const t = uncoverAt(x, y, 40, kind);
    assert.ok(t >= 0 && t < 1, `${kind} ${x},${y}`);
  }
  const column = x => Array.from({ length: 8 }, (_, y) => uncoverAt(x, y, 40, "blocks")).reduce((a, b) => a + b) / 8;
  assert.ok(column(2) < column(20) && column(20) < column(38));
});

test("ambient motes come from the palette, stay in the scene and settle into stepped brightness", () => {
  const rand = seeded(4);
  for (const preset of Object.keys(PRESETS)) {
    const m = spawnMote(preset, rand, 320, 180, true);
    assert.ok(PRESETS[preset].colors.includes(m.color));
    let alive = true, steps = 0;
    while (alive && steps++ < 2000) {
      alive = stepMote(m, preset, 1 / 30, 320, 180);
      assert.ok([0, 0.25, 0.5, 0.75, 1].includes(moteAlpha(m, preset)));
    }
    if (preset !== "stars") assert.equal(alive, false, `${preset} motes leave or expire`);
  }
});

test("the shared palette is 64 hex colours, darkest first", () => {
  assert.equal(PALETTE.length, 64);
  assert.ok(PALETTE.every(c => /^#[0-9a-f]{6}$/.test(c)));
  const lum = c => { const n = parseInt(c.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  assert.ok(lum(PALETTE[0]) < lum(PALETTE.at(-1)));
});

test("the typewriter breathes after punctuation", () => {
  const { at, total } = typeSchedule("Ha. Run", 40);
  assert.equal(at.length, 7);
  assert.equal(at[0], 0);
  assert.ok(at[3] - at[2] > at[2] - at[1] + 200, "a full stop holds the next letter back");
  assert.ok(total > at.at(-1));
});
