// Painted textures for the 3D Cyclops' Cave.
//
// Every surface in the cave is painted onto a canvas when the encounter loads,
// so the scene ships no image files and every stone can vary by seed. The
// palette is pushed a little past natural, the way arcade runners do it:
// sunlit sandstone, bright moss, bronze, and sea teal.

import * as THREE from "three";
import { roundedRect } from "./stage.ts";

/** Metres across the paved causeway, kerb to kerb. */
export const PATH_WIDTH = 5.6;
/** Distance between lane centres, in metres. */
export const LANE_WIDTH = 1.55;
const FLOOR_W = 512;
const FLOOR_H = 1536;
const PX_PER_M = FLOOR_W / PATH_WIDTH;
/** Metres of causeway that one repeat of the floor texture covers. */
export const FLOOR_PERIOD = FLOOR_H / PX_PER_M;

/** Small, fast, seeded PRNG so a given seed always paints the same stones. */
export function seeded(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

function surface(w: number, h: number) {
  const node = document.createElement("canvas");
  node.width = w;
  node.height = h;
  const c = node.getContext("2d", { willReadFrequently: true });
  if (!c) throw new Error("Canvas 2D is unavailable");
  return { node, c };
}

function toTexture(node: HTMLCanvasElement, colour: boolean, repeat: boolean) {
  const t = new THREE.CanvasTexture(node);
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Per-pixel luminance grain. Skips transparent pixels so cut-outs stay clean. */
function grain(c: CanvasRenderingContext2D, w: number, h: number, amount: number, rand: Random) {
  const image = c.getImageData(0, 0, w, h);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  c.putImageData(image, 0, 0);
}

/** Tileable value noise in [0,1], summed over a few octaves. */
function fbm(w: number, h: number, rand: Random, octaves = [4, 8, 16, 32]) {
  const out = new Float32Array(w * h);
  let total = 0;
  octaves.forEach((cells, octave) => {
    const amp = 1 / (octave + 1);
    total += amp;
    const lattice = Array.from({ length: cells * cells }, () => rand());
    const at = (x: number, y: number) => lattice[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * cells;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * cells;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        out[y * w + x] += (top + (bottom - top) * sy) * amp;
      }
    }
  });
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// ---------------------------------------------------------------------------
// Stonework
// ---------------------------------------------------------------------------

type Tone = { hue: number; sat: number; light: number; lightJitter: number; cracks: number };

const SANDSTONE: Tone = { hue: 38, sat: 44, light: 60, lightJitter: 14, cracks: 0.38 };

function crackLine(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: Random) {
  const steps = 3 + Math.floor(rand() * 4);
  let px = x + rand() * w;
  let py = rand() < 0.5 ? y : y + h;
  const dir = py === y ? 1 : -1;
  c.beginPath();
  c.moveTo(px, py);
  for (let i = 0; i < steps; i++) {
    px += (rand() - 0.5) * w * 0.45;
    py += dir * (h / steps) * (0.6 + rand() * 0.5);
    c.lineTo(Math.max(x, Math.min(x + w, px)), Math.max(y, Math.min(y + h, py)));
  }
  c.stroke();
}

/**
 * One dressed stone: weathered fill, a bevel that catches the light along its
 * top-left edges, and the odd crack. The matching height map gets the same
 * shape so the light model can sink the grout and raise the faces.
 */
function stone(
  c: CanvasRenderingContext2D,
  bump: CanvasRenderingContext2D | null,
  x: number,
  y: number,
  w: number,
  h: number,
  rand: Random,
  tone: Tone,
  gap = 2.5,
) {
  const sx = x + gap;
  const sy = y + gap;
  const sw = w - gap * 2;
  const sh = h - gap * 2;
  if (sw < 4 || sh < 4) return;
  const r = Math.min(7, sw / 4, sh / 4);
  const light = tone.light + (rand() - 0.5) * tone.lightJitter;
  const hue = tone.hue + (rand() - 0.5) * 8;
  c.fillStyle = `hsl(${hue} ${tone.sat + (rand() - 0.5) * 12}% ${light}%)`;
  roundedRect(c, sx, sy, sw, sh, r);
  c.fill();

  c.save();
  roundedRect(c, sx, sy, sw, sh, r);
  c.clip();
  // Weathering: soft blotches of lighter and darker stone.
  const blotches = 4 + Math.floor(rand() * 6);
  for (let i = 0; i < blotches; i++) {
    const dark = rand() < 0.55;
    c.fillStyle = dark ? `hsla(${hue - 6} 40% ${light - 18}% / ${0.12 + rand() * 0.16})` : `hsla(${hue + 4} 55% ${light + 14}% / ${0.1 + rand() * 0.14})`;
    c.beginPath();
    c.ellipse(sx + rand() * sw, sy + rand() * sh, 6 + rand() * sw * 0.35, 4 + rand() * sh * 0.3, rand() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  // Bevel: lit top-left, shaded bottom-right.
  c.lineWidth = 3;
  c.strokeStyle = "rgba(255,244,214,0.34)";
  c.beginPath();
  c.moveTo(sx + 1, sy + sh - r);
  c.lineTo(sx + 1, sy + 1);
  c.lineTo(sx + sw - r, sy + 1);
  c.stroke();
  c.strokeStyle = "rgba(46,28,10,0.5)";
  c.beginPath();
  c.moveTo(sx + sw - 1, sy + r);
  c.lineTo(sx + sw - 1, sy + sh - 1);
  c.lineTo(sx + r, sy + sh - 1);
  c.stroke();
  c.restore();

  const cracked = rand() < tone.cracks;
  const crackSeed = rand();
  if (cracked) {
    c.lineWidth = 1.6;
    c.strokeStyle = "rgba(40,24,10,0.75)";
    crackLine(c, sx, sy, sw, sh, seeded(crackSeed * 1e9));
  }

  if (bump) {
    bump.fillStyle = `rgb(${150 + Math.floor(rand() * 70)},0,0)`;
    roundedRect(bump, sx, sy, sw, sh, r);
    bump.fill();
    bump.lineWidth = 3;
    bump.strokeStyle = "rgba(60,0,0,0.6)";
    roundedRect(bump, sx + 1.5, sy + 1.5, sw - 3, sh - 3, r);
    bump.stroke();
    if (cracked) {
      bump.lineWidth = 2;
      bump.strokeStyle = "rgb(20,0,0)";
      crackLine(bump, sx, sy, sw, sh, seeded(crackSeed * 1e9));
    }
  }
}

/** Grass and moss tufts along a band, used on kerbs and wall crowns. */
function mossBand(c: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, rand: Random, density = 1, vertical = true) {
  const greens = ["#3f5c18", "#55761f", "#6f9128", "#86a836", "#2f4512"];
  const area = (x1 - x0) * (y1 - y0);
  const count = Math.floor((area / 9) * density);
  for (let i = 0; i < count; i++) {
    const x = x0 + rand() * (x1 - x0);
    const y = y0 + rand() * (y1 - y0);
    c.strokeStyle = greens[Math.floor(rand() * greens.length)];
    c.lineWidth = 1 + rand() * 1.6;
    c.beginPath();
    c.moveTo(x, y);
    const len = 3 + rand() * 7;
    if (vertical) c.lineTo(x + (rand() - 0.5) * 4, y - len);
    else c.lineTo(x - len, y + (rand() - 0.5) * 4);
    c.stroke();
  }
}

function mossBlotches(c: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, count: number, rand: Random, alpha = 0.32) {
  for (let i = 0; i < count; i++) {
    c.fillStyle = `hsla(${78 + rand() * 18} ${40 + rand() * 20}% ${22 + rand() * 14}% / ${alpha * (0.5 + rand() * 0.5)})`;
    c.beginPath();
    c.ellipse(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), 4 + rand() * 16, 3 + rand() * 10, rand() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
}

/**
 * The paved causeway, kerb to kerb.
 *
 * Laid out in the texture's own metres so the bronze lane inlays sit exactly
 * on the lane boundaries, and each lane is paved as its own run of stones.
 * The pattern tiles vertically; the last course is stretched to meet the first.
 */
function paintFloor(rand: Random) {
  const { node, c } = surface(FLOOR_W, FLOOR_H);
  const height = surface(FLOOR_W, FLOOR_H);
  const h = height.c;
  // Grout: dark earth with moss in the joints.
  c.fillStyle = "#3b3a1e";
  c.fillRect(0, 0, FLOOR_W, FLOOR_H);
  mossBlotches(c, 0, FLOOR_W, 0, FLOOR_H, 900, rand, 0.5);
  h.fillStyle = "#000";
  h.fillRect(0, 0, FLOOR_W, FLOOR_H);

  const kerb = Math.round(0.34 * PX_PER_M);
  const laneHalf = (LANE_WIDTH / 2) * PX_PER_M;
  const mid = FLOOR_W / 2;
  const columns: [number, number][] = [
    [kerb, mid - laneHalf],
    [mid - laneHalf, mid + laneHalf],
    [mid + laneHalf, FLOOR_W - kerb],
  ];
  for (const [x0, x1] of columns) {
    let y = 0;
    while (y < FLOOR_H - 1) {
      let rh = (0.42 + rand() * 0.34) * PX_PER_M;
      if (FLOOR_H - y - rh < 0.34 * PX_PER_M) rh = FLOOR_H - y;
      let x = x0 - rand() * 0.6 * PX_PER_M;
      while (x < x1) {
        const sw = (0.5 + rand() * 0.75) * PX_PER_M;
        const left = Math.max(x, x0);
        const right = Math.min(x + sw, x1);
        if (right - left > 10) stone(c, h, left, y, right - left, rh, rand, SANDSTONE);
        x += sw;
      }
      y += rh;
    }
  }
  // Kerbstones: long and narrow, mossier than the paving.
  for (const [x0, x1] of [[0, kerb], [FLOOR_W - kerb, FLOOR_W]] as const) {
    let y = 0;
    while (y < FLOOR_H - 1) {
      let len = (1 + rand() * 0.8) * PX_PER_M;
      if (FLOOR_H - y - len < 0.5 * PX_PER_M) len = FLOOR_H - y;
      stone(c, h, x0, y, x1 - x0, len, rand, { ...SANDSTONE, light: 52, cracks: 0.5 });
      y += len;
    }
    mossBlotches(c, x0, x1, 0, FLOOR_H, 110, rand, 0.55);
  }
  // Moss creeps in from the kerbs over the outer paving.
  mossBlotches(c, kerb, kerb + 50, 0, FLOOR_H, 120, rand, 0.28);
  mossBlotches(c, FLOOR_W - kerb - 50, FLOOR_W - kerb, 0, FLOOR_H, 120, rand, 0.28);
  mossBand(c, 0, 12, 0, FLOOR_H, rand, 1.4);
  mossBand(c, FLOOR_W - 12, FLOOR_W, 0, FLOOR_H, rand, 1.4);

  // Worn bronze inlays on the lane boundaries: readable, never loud.
  for (const x of [mid - laneHalf, mid + laneHalf]) {
    c.fillStyle = "#7a5a26";
    c.fillRect(x - 3, 0, 6, FLOOR_H);
    c.fillStyle = "rgba(240,206,126,0.55)";
    c.fillRect(x - 2, 0, 1.5, FLOOR_H);
    h.fillStyle = "rgb(120,0,0)";
    h.fillRect(x - 3, 0, 6, FLOOR_H);
    for (let y = 0; y < FLOOR_H; y += 6 + rand() * 30) {
      c.fillStyle = `rgba(52,44,22,${0.25 + rand() * 0.45})`;
      c.fillRect(x - 3, y, 6, 2 + rand() * 9);
    }
  }
  grain(c, FLOOR_W, FLOOR_H, 16, rand);
  return { map: toTexture(node, true, true), bump: toTexture(height.node, false, true) };
}

/** A single chunky parapet stone, the face every block side shows. */
function paintBlock(rand: Random) {
  const S = 256;
  const { node, c } = surface(S, S);
  c.fillStyle = "#3a331c";
  c.fillRect(0, 0, S, S);
  stone(c, null, 0, 0, S, S, rand, { hue: 38, sat: 42, light: 62, lightJitter: 4, cracks: 0.9 }, 3);
  // Chisel marks.
  for (let i = 0; i < 90; i++) {
    const x = 12 + rand() * (S - 24);
    const y = 12 + rand() * (S - 24);
    c.strokeStyle = `rgba(90,62,30,${0.12 + rand() * 0.14})`;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 5 + rand() * 6, y + 3 + rand() * 4);
    c.stroke();
  }
  // Moss gathers at the foot of each block and drips from its crown.
  mossBlotches(c, 0, S, S * 0.78, S, 26, rand, 0.55);
  mossBand(c, 4, S - 4, S - 18, S - 2, rand, 1.6);
  for (let i = 0; i < 9; i++) {
    const x = rand() * S;
    c.fillStyle = `rgba(${70 + rand() * 30},${100 + rand() * 30},${32},${0.35 + rand() * 0.3})`;
    c.beginPath();
    c.ellipse(x, 6, 4 + rand() * 6, 8 + rand() * 22, 0, 0, Math.PI * 2);
    c.fill();
  }
  grain(c, S, S, 18, rand);
  return toTexture(node, true, true);
}

/** The top face of a parapet block: stone almost lost under moss. */
function paintMossTop(rand: Random) {
  const S = 256;
  const { node, c } = surface(S, S);
  c.fillStyle = "#8d7448";
  c.fillRect(0, 0, S, S);
  mossBlotches(c, 0, S, 0, S, 180, rand, 0.7);
  mossBand(c, 0, S, 0, S, rand, 0.9);
  grain(c, S, S, 20, rand);
  return toTexture(node, true, true);
}

/** Coursed ashlar for the great gate piers and the temple ruins. */
function paintAshlar(rand: Random) {
  const S = 512;
  const { node, c } = surface(S, S);
  c.fillStyle = "#342e1a";
  c.fillRect(0, 0, S, S);
  let y = 0;
  while (y < S - 1) {
    let rh = 90 + rand() * 50;
    if (S - y - rh < 60) rh = S - y;
    let x = -rand() * 120;
    while (x < S) {
      const bw = 130 + rand() * 120;
      const left = Math.max(0, x);
      const right = Math.min(S, x + bw);
      if (right - left > 10) stone(c, null, left, y, right - left, rh, rand, { ...SANDSTONE, light: 56 }, 3);
      x += bw;
    }
    y += rh;
  }
  mossBlotches(c, 0, S, 0, S, 70, rand, 0.38);
  grain(c, S, S, 16, rand);
  return toTexture(node, true, true);
}

// ---------------------------------------------------------------------------
// Rock, marble, wood
// ---------------------------------------------------------------------------

function paintRock(rand: Random) {
  const S = 256;
  const { node, c } = surface(S, S);
  const n = fbm(S, S, rand);
  const image = c.createImageData(S, S);
  const d = image.data;
  for (let i = 0; i < S * S; i++) {
    const y = Math.floor(i / S);
    // Faint strata across the rock face.
    const strata = Math.sin(y * 0.11 + n[i] * 9) * 0.06;
    const v = Math.max(0, Math.min(1, n[i] * 1.25 - 0.12 + strata));
    d[i * 4] = 52 + v * 120;
    d[i * 4 + 1] = 44 + v * 104;
    d[i * 4 + 2] = 34 + v * 84;
    d[i * 4 + 3] = 255;
  }
  c.putImageData(image, 0, 0);
  c.lineWidth = 1.4;
  c.strokeStyle = "rgba(20,14,8,0.5)";
  for (let i = 0; i < 18; i++) crackLine(c, rand() * S, rand() * S, 60, 60, rand);
  mossBlotches(c, 0, S, 0, S, 26, rand, 0.25);
  return toTexture(node, true, true);
}

/** Fluted marble: the flutes are painted, and the light model reads them as relief. */
function paintMarble(rand: Random) {
  const W = 256;
  const H = 512;
  const { node, c } = surface(W, H);
  const image = c.createImageData(W, H);
  const d = image.data;
  const flutes = 12;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const f = 0.66 + 0.34 * Math.pow(0.5 + 0.5 * Math.cos(((x / W) * flutes) * Math.PI * 2), 0.6);
      const i = (y * W + x) * 4;
      d[i] = 232 * f;
      d[i + 1] = 220 * f;
      d[i + 2] = 196 * f;
      d[i + 3] = 255;
    }
  }
  c.putImageData(image, 0, 0);
  for (let i = 0; i < 14; i++) {
    c.strokeStyle = `rgba(${120 + rand() * 40},${108 + rand() * 30},${90},${0.16 + rand() * 0.18})`;
    c.lineWidth = 0.8 + rand() * 1.6;
    c.beginPath();
    const x = rand() * W;
    c.moveTo(x, 0);
    c.bezierCurveTo(x + (rand() - 0.5) * 120, H * 0.3, x + (rand() - 0.5) * 120, H * 0.7, x + (rand() - 0.5) * 80, H);
    c.stroke();
  }
  const dirt = c.createLinearGradient(0, H * 0.6, 0, H);
  dirt.addColorStop(0, "rgba(70,60,30,0)");
  dirt.addColorStop(1, "rgba(52,60,26,0.55)");
  c.fillStyle = dirt;
  c.fillRect(0, 0, W, H);
  mossBlotches(c, 0, W, H * 0.82, H, 40, rand, 0.5);
  grain(c, W, H, 12, rand);
  return toTexture(node, true, true);
}

function paintWood(rand: Random, framed: boolean) {
  const S = 256;
  const { node, c } = surface(S, S);
  const planks = 4;
  const ph = S / planks;
  for (let p = 0; p < planks; p++) {
    const light = 34 + rand() * 12;
    c.fillStyle = `hsl(${26 + rand() * 6} ${46 + rand() * 10}% ${light}%)`;
    c.fillRect(0, p * ph, S, ph);
    for (let g = 0; g < 16; g++) {
      c.strokeStyle = `hsla(24 50% ${light - 12 - rand() * 8}% / ${0.25 + rand() * 0.3})`;
      c.lineWidth = 0.8 + rand();
      c.beginPath();
      const gy = p * ph + rand() * ph;
      const amp = 1 + rand() * 3;
      const freq = 0.02 + rand() * 0.04;
      for (let x = 0; x <= S; x += 8) {
        const yy = gy + Math.sin(x * freq + g) * amp;
        if (x === 0) c.moveTo(x, yy);
        else c.lineTo(x, yy);
      }
      c.stroke();
    }
    if (rand() < 0.6) {
      c.fillStyle = "rgba(50,26,10,0.6)";
      c.beginPath();
      c.ellipse(rand() * S, p * ph + ph / 2, 6 + rand() * 5, 3 + rand() * 3, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "rgba(24,12,4,0.85)";
    c.fillRect(0, p * ph, S, 3);
  }
  if (framed) {
    // Bronze corner frame with rivets, the arcade-readable "this is a box" cue.
    const band = 22;
    c.fillStyle = "#8a6428";
    c.fillRect(0, 0, S, band);
    c.fillRect(0, S - band, S, band);
    c.fillRect(0, 0, band, S);
    c.fillRect(S - band, 0, band, S);
    c.strokeStyle = "rgba(255,226,150,0.6)";
    c.lineWidth = 2;
    c.strokeRect(band - 1, band - 1, S - band * 2 + 2, S - band * 2 + 2);
    c.strokeStyle = "rgba(40,22,6,0.8)";
    c.strokeRect(1, 1, S - 2, S - 2);
    c.fillStyle = "#e4c27a";
    for (const x of [band / 2, S / 2, S - band / 2]) {
      for (const y of [band / 2, S / 2, S - band / 2]) {
        if (x === S / 2 && y === S / 2) continue;
        c.beginPath();
        c.arc(x, y, 4, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  grain(c, S, S, 14, rand);
  return toTexture(node, true, true);
}

// ---------------------------------------------------------------------------
// Ornament
// ---------------------------------------------------------------------------

/** A running Greek key in gold on oxblood, the band across every lintel. */
function paintMeander() {
  const W = 512;
  const H = 128;
  const { node, c } = surface(W, H);
  c.fillStyle = "#5c1d12";
  c.fillRect(0, 0, W, H);
  const gold = c.createLinearGradient(0, 0, 0, H);
  gold.addColorStop(0, "#ffe7a3");
  gold.addColorStop(0.5, "#e2a944");
  gold.addColorStop(1, "#a8701f");
  c.fillStyle = gold;
  c.fillRect(0, 6, W, 8);
  c.fillRect(0, H - 14, W, 8);
  const unit = 9.6;
  const cell = unit * 10;
  const top = 26;
  c.strokeStyle = gold;
  c.lineWidth = unit * 1.3;
  c.lineCap = "square";
  c.lineJoin = "miter";
  for (let ox = -cell; ox < W + cell; ox += cell) {
    const p = (x: number, y: number) => [ox + x * unit + unit, top + y * unit] as const;
    c.beginPath();
    c.moveTo(...p(-1, 8));
    c.lineTo(...p(9, 8));
    c.moveTo(...p(0, 8));
    c.lineTo(...p(0, 0));
    c.lineTo(...p(7.6, 0));
    c.lineTo(...p(7.6, 5.6));
    c.lineTo(...p(2.4, 5.6));
    c.lineTo(...p(2.4, 2.6));
    c.lineTo(...p(5, 2.6));
    c.stroke();
  }
  // A thin dark keyline makes the gold read at a distance.
  c.globalCompositeOperation = "source-atop";
  c.strokeStyle = "rgba(60,20,8,0.35)";
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, W - 1, H - 1);
  c.globalCompositeOperation = "source-over";
  return toTexture(node, true, true);
}

/**
 * A one-eyed guardian mask carved in basalt, set into each gate pier.
 * The emissive twin holds only the eye, so the eyes can blaze when
 * Polyphemus commits to a throw.
 */
function paintMask(rand: Random) {
  const W = 256;
  const H = 320;
  const { node, c } = surface(W, H);
  const glow = surface(W, H);
  const g = glow.c;
  c.fillStyle = "#4b4952";
  c.fillRect(0, 0, W, H);
  c.strokeStyle = "#8c8893";
  c.lineWidth = 10;
  c.strokeRect(9, 9, W - 18, H - 18);
  c.strokeStyle = "rgba(0,0,0,0.6)";
  c.lineWidth = 3;
  c.strokeRect(16, 16, W - 32, H - 32);

  const relief = (path: () => void, fill: string, lit = "rgba(200,200,214,0.55)", shade = "rgba(0,0,0,0.7)") => {
    c.save();
    c.translate(0, 3);
    c.fillStyle = shade;
    path();
    c.fill();
    c.restore();
    c.save();
    c.translate(0, -2);
    c.fillStyle = lit;
    path();
    c.fill();
    c.restore();
    c.fillStyle = fill;
    path();
    c.fill();
  };
  // Crown band with carved ridges.
  relief(() => {
    c.beginPath();
    c.moveTo(34, 64);
    c.quadraticCurveTo(128, 18, 222, 64);
    c.lineTo(222, 78);
    c.quadraticCurveTo(128, 40, 34, 78);
    c.closePath();
  }, "#6e6a75");
  // Heavy brow over the single eye.
  relief(() => {
    c.beginPath();
    c.moveTo(40, 112);
    c.quadraticCurveTo(128, 56, 216, 112);
    c.quadraticCurveTo(128, 88, 40, 112);
    c.closePath();
  }, "#78747f");
  // Socket, eyeball and iris.
  c.fillStyle = "#121216";
  c.beginPath();
  c.ellipse(128, 136, 58, 40, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#a29e96";
  c.beginPath();
  c.ellipse(128, 138, 44, 29, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#2a2a30";
  c.beginPath();
  c.arc(128, 138, 19, 0, Math.PI * 2);
  c.fill();
  // Nose.
  relief(() => {
    c.beginPath();
    c.moveTo(116, 168);
    c.lineTo(140, 168);
    c.lineTo(154, 210);
    c.lineTo(102, 210);
    c.closePath();
  }, "#6a6670");
  // Grimace with blocky teeth.
  c.fillStyle = "#0e0e12";
  roundedRect(c, 66, 228, 124, 54, 14);
  c.fill();
  for (let i = 0; i < 6; i++) {
    c.fillStyle = "#cfc9bc";
    c.fillRect(72 + i * 20, 232, 14, 18);
    c.fillRect(72 + i * 20, 262, 14, 16);
  }
  // Cheek lines.
  c.strokeStyle = "rgba(0,0,0,0.6)";
  c.lineWidth = 4;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(128 + side * 70, 150);
    c.quadraticCurveTo(128 + side * 92, 200, 128 + side * 72, 236);
    c.stroke();
  }
  grain(c, W, H, 18, rand);

  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  const iris = g.createRadialGradient(128, 138, 2, 128, 138, 34);
  iris.addColorStop(0, "#fff");
  iris.addColorStop(0.5, "#ffb070");
  iris.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = iris;
  g.beginPath();
  g.arc(128, 138, 34, 0, Math.PI * 2);
  g.fill();
  return { map: toTexture(node, true, false), glow: toTexture(glow.node, true, false) };
}

/** Hanging vines with leaves, cut out against transparency. */
function paintVine(rand: Random) {
  const W = 128;
  const H = 512;
  const { node, c } = surface(W, H);
  const strands = 3;
  for (let s = 0; s < strands; s++) {
    const x0 = 20 + s * 40 + (rand() - 0.5) * 16;
    const end = H * (0.55 + rand() * 0.45);
    const phase = rand() * 6;
    const point = (y: number) => x0 + Math.sin(y * 0.03 + phase) * 7;
    c.strokeStyle = "#2f4416";
    c.lineWidth = 3.5;
    c.beginPath();
    for (let y = 0; y <= end; y += 8) {
      if (y === 0) c.moveTo(point(y), y);
      else c.lineTo(point(y), y);
    }
    c.stroke();
    for (let y = 10; y < end; y += 9 + rand() * 8) {
      const side = rand() < 0.5 ? -1 : 1;
      c.save();
      c.translate(point(y), y);
      c.rotate(side * (0.6 + rand() * 0.6));
      c.fillStyle = `hsl(${88 + rand() * 24} ${46 + rand() * 20}% ${24 + rand() * 18}%)`;
      c.beginPath();
      c.ellipse(side * 9, 0, 10, 5, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(200,230,120,0.35)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(side * 16, 0);
      c.stroke();
      c.restore();
    }
  }
  const t = toTexture(node, true, false);
  return t;
}

// ---------------------------------------------------------------------------
// Light, water and effects
// ---------------------------------------------------------------------------

/** Tileable caustic network: the bright edges of a wrapped Voronoi diagram. */
function paintCaustics(rand: Random) {
  const S = 256;
  const { node, c } = surface(S, S);
  const points = Array.from({ length: 22 }, () => [rand() * S, rand() * S] as const);
  const image = c.createImageData(S, S);
  const d = image.data;
  const turn = (k: number, v: number) => Math.sin(((k * v) / S) * Math.PI * 2);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // A gentle, tileable warp bends the straight cell edges into ripples.
      const wx = x + turn(2, y) * 7 + turn(3, x + y) * 4;
      const wy = y + turn(2, x + 64) * 7 + turn(3, x - y) * 4;
      let f1 = Infinity;
      let f2 = Infinity;
      for (const [px, py] of points) {
        let dx = Math.abs(wx - px) % S;
        let dy = Math.abs(wy - py) % S;
        if (dx > S / 2) dx = S - dx;
        if (dy > S / 2) dy = S - dy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < f1) {
          f2 = f1;
          f1 = dist;
        } else if (dist < f2) f2 = dist;
      }
      const edge = Math.max(0, 1 - (f2 - f1) / 15);
      const v = Math.pow(edge, 1.8) * 255;
      const i = (y * S + x) * 4;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  c.putImageData(image, 0, 0);
  return toTexture(node, true, true);
}

function paintFoam(rand: Random) {
  const W = 256;
  const H = 64;
  const { node, c } = surface(W, H);
  for (let i = 0; i < 240; i++) {
    const y = Math.pow(rand(), 1.6) * H;
    c.fillStyle = `rgba(255,255,255,${(1 - y / H) * (0.25 + rand() * 0.5)})`;
    c.beginPath();
    c.ellipse(rand() * W, y, 4 + rand() * 14, 1.5 + rand() * 3, 0, 0, Math.PI * 2);
    c.fill();
  }
  const t = toTexture(node, true, true);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function paintFlame() {
  const W = 128;
  const H = 256;
  const { node, c } = surface(W, H);
  const tongue = (scale: number) => {
    c.beginPath();
    c.moveTo(64, 248);
    c.bezierCurveTo(64 - 52 * scale, 240, 64 - 46 * scale, 140, 64, 18 + (1 - scale) * 120);
    c.bezierCurveTo(64 + 46 * scale, 140, 64 + 52 * scale, 240, 64, 248);
    c.closePath();
  };
  const outer = c.createLinearGradient(0, 248, 0, 20);
  outer.addColorStop(0, "rgba(255,120,40,0.95)");
  outer.addColorStop(0.55, "rgba(255,80,24,0.7)");
  outer.addColorStop(1, "rgba(200,30,10,0)");
  c.fillStyle = outer;
  tongue(1);
  c.fill();
  const mid = c.createLinearGradient(0, 248, 0, 60);
  mid.addColorStop(0, "rgba(255,214,120,1)");
  mid.addColorStop(1, "rgba(255,160,60,0)");
  c.fillStyle = mid;
  tongue(0.66);
  c.fill();
  const core = c.createLinearGradient(0, 248, 0, 120);
  core.addColorStop(0, "rgba(255,255,236,1)");
  core.addColorStop(1, "rgba(255,240,180,0)");
  c.fillStyle = core;
  tongue(0.34);
  c.fill();
  return toTexture(node, true, false);
}

function paintRadial(stops: [number, string][]) {
  const S = 128;
  const { node, c } = surface(S, S);
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  return toTexture(node, true, false);
}

/**
 * Polyphemus' shadow, thrown forward along the causeway by the torches behind
 * him: legs at the near edge, the club raised over his head at the far edge.
 */
function paintGiantShadow() {
  const W = 256;
  const H = 512;
  const { node, c } = surface(W, H);
  c.filter = "blur(7px)";
  c.fillStyle = "#000";
  // Legs.
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(128 + side * 22, 512);
    c.lineTo(128 + side * 70, 512);
    c.lineTo(128 + side * 58, 330);
    c.lineTo(128 + side * 12, 330);
    c.closePath();
    c.fill();
  }
  // Torso and shoulders.
  c.beginPath();
  c.moveTo(70, 340);
  c.lineTo(40, 190);
  c.lineTo(84, 160);
  c.lineTo(172, 160);
  c.lineTo(216, 190);
  c.lineTo(186, 340);
  c.closePath();
  c.fill();
  // Head.
  c.beginPath();
  c.ellipse(128, 128, 36, 42, 0, 0, Math.PI * 2);
  c.fill();
  // Hanging arm and the arm raising the club.
  c.beginPath();
  c.moveTo(40, 190);
  c.lineTo(20, 300);
  c.lineTo(44, 306);
  c.lineTo(66, 200);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(200, 176);
  c.lineTo(232, 70);
  c.lineTo(214, 64);
  c.lineTo(178, 168);
  c.closePath();
  c.fill();
  c.lineCap = "round";
  c.lineWidth = 26;
  c.strokeStyle = "#000";
  c.beginPath();
  c.moveTo(222, 92);
  c.lineTo(176, 8);
  c.stroke();
  c.filter = "none";
  return toTexture(node, false, false);
}

/** A broken hole in the paving with the sea glinting far below. */
function paintCrackHole(rand: Random) {
  const S = 256;
  const { node, c } = surface(S, S);
  const points: [number, number][] = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 88 + rand() * 30;
    points.push([128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.92]);
  }
  const path = () => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  };
  // Radiating cracks in the surrounding stone.
  c.strokeStyle = "rgba(34,20,8,0.85)";
  c.lineWidth = 2.4;
  for (let i = 0; i < 12; i++) {
    const [x, y] = points[Math.floor(rand() * n)];
    c.beginPath();
    c.moveTo(x, y);
    const a = Math.atan2(y - 128, x - 128) + (rand() - 0.5) * 0.6;
    c.lineTo(x + Math.cos(a) * (8 + rand() * 18), y + Math.sin(a) * (8 + rand() * 18));
    c.stroke();
  }
  const depth = c.createRadialGradient(128, 140, 4, 128, 128, 120);
  depth.addColorStop(0, "#02090b");
  depth.addColorStop(0.65, "#06232a");
  depth.addColorStop(1, "#0d4652");
  c.fillStyle = depth;
  path();
  c.fill();
  c.save();
  path();
  c.clip();
  c.strokeStyle = "rgba(120,236,230,0.4)";
  c.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    c.beginPath();
    c.ellipse(80 + rand() * 96, 100 + rand() * 70, 10 + rand() * 18, 3, 0, 0, Math.PI);
    c.stroke();
  }
  c.restore();
  // Broken lip, lit along its upper edge.
  c.lineWidth = 7;
  c.strokeStyle = "#c9a36a";
  path();
  c.stroke();
  c.lineWidth = 3;
  c.strokeStyle = "#3a2410";
  c.save();
  c.translate(0, 4);
  path();
  c.stroke();
  c.restore();
  return toTexture(node, true, false);
}

/** A bronze fire vent with coals glowing between the bars. */
function paintGrate(rand: Random) {
  const S = 256;
  const { node, c } = surface(S, S);
  const soot = c.createRadialGradient(128, 128, 60, 128, 128, 128);
  soot.addColorStop(0, "rgba(10,6,4,0.9)");
  soot.addColorStop(1, "rgba(10,6,4,0)");
  c.fillStyle = soot;
  c.fillRect(0, 0, S, S);
  c.fillStyle = "#5e4320";
  roundedRect(c, 34, 34, 188, 188, 16);
  c.fill();
  c.strokeStyle = "#c79a4a";
  c.lineWidth = 4;
  roundedRect(c, 36, 36, 184, 184, 14);
  c.stroke();
  for (let i = 0; i < 6; i++) {
    const y = 56 + i * 28;
    const slot = c.createLinearGradient(0, y, 0, y + 14);
    slot.addColorStop(0, "#2a0c04");
    slot.addColorStop(0.5, "#ff8a2a");
    slot.addColorStop(1, "#2a0c04");
    c.fillStyle = slot;
    roundedRect(c, 54, y, 148, 14, 6);
    c.fill();
  }
  c.fillStyle = "#e9c27a";
  for (const [x, y] of [[48, 48], [208, 48], [48, 208], [208, 208]]) {
    c.beginPath();
    c.arc(x, y, 6, 0, Math.PI * 2);
    c.fill();
  }
  grain(c, S, S, 12, rand);
  return toTexture(node, true, false);
}

/** Glowing seams for the boulders Polyphemus throws: heat as a telegraph. */
function paintEmber(rand: Random) {
  const S = 256;
  const { node, c } = surface(S, S);
  c.fillStyle = "#000";
  c.fillRect(0, 0, S, S);
  c.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    c.strokeStyle = `rgba(255,${120 + rand() * 90},${40 + rand() * 30},${0.5 + rand() * 0.5})`;
    c.lineWidth = 1.5 + rand() * 3;
    crackLine(c, rand() * S, rand() * S, 70, 70, rand);
  }
  return toTexture(node, true, true);
}

/** Chevrons for the locked lane, scrolling toward the runner. */
function paintChevrons() {
  const W = 128;
  const H = 128;
  const { node, c } = surface(W, H);
  c.strokeStyle = "#fff";
  c.lineWidth = 16;
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(24, 40);
  c.lineTo(64, 84);
  c.lineTo(104, 40);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.9)";
  c.fillRect(0, 0, 7, H);
  c.fillRect(W - 7, 0, 7, H);
  const t = toTexture(node, true, true);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

function paintRing() {
  const S = 256;
  const { node, c } = surface(S, S);
  c.strokeStyle = "#fff";
  c.lineWidth = 12;
  c.beginPath();
  c.arc(128, 128, 108, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 6;
  c.beginPath();
  c.arc(128, 128, 66, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.beginPath();
    c.moveTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80);
    c.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124);
    c.stroke();
  }
  return toTexture(node, true, false);
}

/** A gold drachma stamped with the Cyclops' eye. */
function paintCoin() {
  const S = 128;
  const { node, c } = surface(S, S);
  const face = c.createRadialGradient(48, 44, 6, 64, 64, 64);
  face.addColorStop(0, "#fff3c2");
  face.addColorStop(0.55, "#efc055");
  face.addColorStop(1, "#a8701f");
  c.fillStyle = face;
  c.fillRect(0, 0, S, S);
  c.fillStyle = "#fff0b8";
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    c.beginPath();
    c.arc(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, 3, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = "#8a5714";
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(28, 64);
  c.quadraticCurveTo(64, 30, 100, 64);
  c.quadraticCurveTo(64, 98, 28, 64);
  c.stroke();
  c.fillStyle = "#8a5714";
  c.beginPath();
  c.arc(64, 64, 12, 0, Math.PI * 2);
  c.fill();
  return toTexture(node, true, false);
}

/** Soft vertical light for the shafts that fall through the cave roof. */
function paintShaft() {
  const W = 64;
  const H = 256;
  const { node, c } = surface(W, H);
  const across = c.createLinearGradient(0, 0, W, 0);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.5, "rgba(255,255,255,1)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = across;
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = "destination-in";
  const down = c.createLinearGradient(0, 0, 0, H);
  down.addColorStop(0, "rgba(0,0,0,0.9)");
  down.addColorStop(0.7, "rgba(0,0,0,0.35)");
  down.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = down;
  c.fillRect(0, 0, W, H);
  return toTexture(node, true, false);
}

export type CaveTextures = ReturnType<typeof paintCaveTextures>;

/** Paint every texture the cave uses. Runs once per encounter, in well under a second. */
export function paintCaveTextures(anisotropy: number) {
  const rand = seeded(1801);
  const floor = paintFloor(rand);
  const mask = paintMask(rand);
  const textures = {
    floor: floor.map,
    floorBump: floor.bump,
    block: paintBlock(rand),
    mossTop: paintMossTop(rand),
    ashlar: paintAshlar(rand),
    rock: paintRock(rand),
    marble: paintMarble(rand),
    wood: paintWood(rand, false),
    crate: paintWood(rand, true),
    meander: paintMeander(),
    mask: mask.map,
    maskGlow: mask.glow,
    vine: paintVine(rand),
    caustics: paintCaustics(rand),
    foam: paintFoam(rand),
    flame: paintFlame(),
    glow: paintRadial([[0, "rgba(255,255,255,1)"], [0.22, "rgba(255,255,255,0.6)"], [0.55, "rgba(255,255,255,0.14)"], [1, "rgba(255,255,255,0)"]]),
    blob: paintRadial([[0, "rgba(0,0,0,0.78)"], [0.55, "rgba(0,0,0,0.42)"], [1, "rgba(0,0,0,0)"]]),
    giant: paintGiantShadow(),
    hole: paintCrackHole(rand),
    grate: paintGrate(rand),
    ember: paintEmber(rand),
    chevrons: paintChevrons(),
    ring: paintRing(),
    coin: paintCoin(),
    shaft: paintShaft(),
  };
  for (const t of Object.values(textures)) t.anisotropy = anisotropy;
  return textures;
}
