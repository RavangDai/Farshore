// Turns FARSHORE's painted art into pixel art for the menus, cinematics and
// overlays, with one shared palette, so every screen reads as one world.
// Gameplay canvases keep the painted originals.
//
//   node scripts/pixelate-art.mjs
//
// Each sheet is cropped tile by tile, downscaled, given a little punch, then
// mapped to the shared palette with ordered (Bayer) dithering. Sprites get a
// hard alpha edge and a one-pixel ink outline. The palette is k-means in OKLab
// over samples from every sheet, seeded with the UI's own colours, and is also
// written to src/lib/render/palette.generated.ts for the CSS and canvases.
// Deterministic: the same sources always give the same files.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(".");
const SRC = path.join(ROOT, "public/art/farshore");
const LEGACY = path.join(ROOT, "public/art/portraits.png");
const OUT = path.join(SRC, "px");

/** Colours the UI uses, always in the palette, so art and chrome share inks. */
const LOCKED = [
  "#04080f", "#071523", "#0b2033", "#123049", "#1d4a66", "#2f6f8f", // ink and navy ramp
  "#f6f0e3", "#d8cdb4", "#93afc0", "#5d7a8c",                       // cream, parchment, muted, steel
  "#5a3a1c", "#8a5a2b", "#c08a3e", "#e9b85c", "#ffe3a1",             // bronze to gold
  "#32d4f5", "#f4604f", "#9fe6b4",                                   // AI cyan, threat red, success green
];
const PALETTE_SIZE = 64;
const OUTLINE = [8, 12, 20];

const SHEETS = {
  trials: { file: "trials-and-cast.png", cols: 4, rows: 3, tile: [120, 160], dither: 0.55 },
  sea: { file: "homeward-sea.png", cols: 1, rows: 1, tile: [480, 270], dither: 0.6 },
  sprites: { file: "odysseus-and-ship.png", cols: 2, rows: 2, tile: [128, 128], dither: 0.25, sprite: true },
};
/** Portraits: the legacy 5x4 layout, with painted atlas tiles where the arcade has them. */
const CAST = { cols: 5, rows: 4, tile: 48, dither: 0.3, fromAtlas: { 0: 8, 5: 11, 6: 0, 7: 9, 9: 2, 11: 10, 12: 5, 13: 6 } };

// ---- colour ------------------------------------------------------------------
const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklab(r, g, b) {
  const R = toLinear(r / 255), G = toLinear(g / 255), B = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = ([r, g, b]) => "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);

// ---- tiles -----------------------------------------------------------------
/** Crops a rectangle, resizes it, adds a little punch; returns raw RGBA. */
async function tile(file, crop, [w, h], { sprite = false, position = "centre" } = {}) {
  // Opaque art is flattened onto night navy first: transparent pixels in a
  // source can hide any colour, which would show once alpha is dropped.
  let img = sprite ? sharp(file).extract(crop).ensureAlpha() : sharp(file).extract(crop).flatten({ background: "#071523" }).ensureAlpha();
  img = img.resize(w, h, { kernel: "mitchell", fit: "cover", position });
  img = img.modulate({ saturation: 1.12 }).sharpen({ sigma: 0.55 });
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  if (sprite) for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 128 ? 255 : 0;
  else for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { w, h, data };
}

async function sheetTiles(name, spec) {
  const file = path.join(SRC, spec.file), meta = await sharp(file).metadata();
  const tw = meta.width / spec.cols, th = meta.height / spec.rows, tiles = [];
  for (let r = 0; r < spec.rows; r++) for (let c = 0; c < spec.cols; c++) {
    const crop = { left: Math.round(c * tw), top: Math.round(r * th), width: Math.round((c + 1) * tw) - Math.round(c * tw), height: Math.round((r + 1) * th) - Math.round(r * th) };
    tiles.push(await tile(file, crop, spec.tile, { sprite: spec.sprite }));
  }
  return tiles;
}

/** Square faces: atlas tiles crop to their upper middle, legacy tiles are already square-ish. */
async function castTiles() {
  const atlas = path.join(SRC, SHEETS.trials.file), am = await sharp(atlas).metadata(), lm = await sharp(LEGACY).metadata();
  const atw = am.width / 4, ath = am.height / 3, ltw = lm.width / CAST.cols, lth = lm.height / CAST.rows, tiles = [];
  for (let i = 0; i < CAST.cols * CAST.rows; i++) {
    const from = CAST.fromAtlas[i];
    if (from !== undefined) {
      const c = from % 4, r = Math.floor(from / 4), side = Math.round(atw * 0.92);
      // Portraits (8-11) frame the face high; scenes crop around the middle.
      const top = Math.round(r * ath + (from >= 8 ? ath * 0.06 : (ath - side) / 2));
      tiles.push(await tile(atlas, { left: Math.round(c * atw + (atw - side) / 2), top, width: side, height: side }, [CAST.tile, CAST.tile]));
    } else {
      const c = i % CAST.cols, r = Math.floor(i / CAST.cols);
      const left = Math.round(c * ltw), top = Math.round(r * lth);
      tiles.push(await tile(LEGACY, { left, top, width: Math.round((c + 1) * ltw) - left, height: Math.round((r + 1) * lth) - top }, [CAST.tile, CAST.tile]));
    }
  }
  return tiles;
}

// ---- palette -----------------------------------------------------------------
function buildPalette(samples, seed = 7) {
  const rand = rng(seed), locked = LOCKED.map(hex), free = PALETTE_SIZE - locked.length;
  const pts = samples.map(([r, g, b]) => ({ rgb: [r, g, b], lab: oklab(r, g, b) }));
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // k-means++ seeding for the free centres, away from the locked ones.
  const centres = locked.map(rgb => ({ rgb, lab: oklab(...rgb), locked: true }));
  const nearest = p => centres.reduce((best, c) => Math.min(best, dist(p.lab, c.lab)), Infinity);
  for (let k = 0; k < free; k++) {
    const d = pts.map(nearest), total = d.reduce((a, b) => a + b, 0);
    let pick = rand() * total, i = 0;
    while (pick > d[i] && i < d.length - 1) pick -= d[i++];
    centres.push({ rgb: [...pts[i].rgb], lab: [...pts[i].lab], locked: false });
  }
  for (let iter = 0; iter < 14; iter++) {
    const sums = centres.map(() => ({ n: 0, lab: [0, 0, 0], rgb: [0, 0, 0] }));
    for (const p of pts) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centres.length; c++) { const d = dist(p.lab, centres[c].lab); if (d < bd) { bd = d; best = c; } }
      const s = sums[best]; s.n++;
      for (let k = 0; k < 3; k++) { s.lab[k] += p.lab[k]; s.rgb[k] += p.rgb[k]; }
    }
    centres.forEach((c, i) => { if (c.locked || !sums[i].n) return; c.lab = sums[i].lab.map(v => v / sums[i].n); c.rgb = sums[i].rgb.map(v => v / sums[i].n); });
  }
  return centres.map(c => ({ rgb: c.rgb.map(v => Math.round(v)), lab: oklab(...c.rgb.map(v => Math.round(v))) }));
}

function sample(tiles, every, out) {
  for (const t of tiles) for (let i = 0; i < t.data.length; i += 4 * every) if (t.data[i + 3] === 255) out.push([t.data[i], t.data[i + 1], t.data[i + 2]]);
}

// ---- quantize ------------------------------------------------------------------
function quantize(t, palette, strength) {
  const cache = new Map(), spread = 40 * strength;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const i = (y * t.w + x) * 4;
    if (t.data[i + 3] === 0) continue;
    const o = BAYER[(y & 3) * 4 + (x & 3)] * spread;
    const r = Math.max(0, Math.min(255, t.data[i] + o)), g = Math.max(0, Math.min(255, t.data[i + 1] + o)), b = Math.max(0, Math.min(255, t.data[i + 2] + o));
    const key = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2);
    let best = cache.get(key);
    if (best === undefined) {
      const lab = oklab(r, g, b);
      let bd = Infinity;
      palette.forEach((p, n) => { const d = (lab[0] - p.lab[0]) ** 2 + (lab[1] - p.lab[1]) ** 2 + (lab[2] - p.lab[2]) ** 2; if (d < bd) { bd = d; best = n; } });
      cache.set(key, best);
    }
    const p = palette[best].rgb;
    t.data[i] = p[0]; t.data[i + 1] = p[1]; t.data[i + 2] = p[2];
  }
}

/** A transparent pixel touching an opaque one becomes ink. */
function outline(t) {
  const solid = i => t.data[i * 4 + 3] === 255, ring = [];
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const i = y * t.w + x;
    if (solid(i)) continue;
    if ((x > 0 && solid(i - 1)) || (x < t.w - 1 && solid(i + 1)) || (y > 0 && solid(i - t.w)) || (y < t.h - 1 && solid(i + t.w))) ring.push(i);
  }
  for (const i of ring) { t.data.set(OUTLINE, i * 4); t.data[i * 4 + 3] = 255; }
}

async function write(name, tiles, cols, rows, palette) {
  const [w, h] = [tiles[0].w, tiles[0].h], W = w * cols, H = h * rows, data = Buffer.alloc(W * H * 4);
  tiles.forEach((t, n) => {
    const ox = (n % cols) * w, oy = Math.floor(n / cols) * h;
    for (let y = 0; y < h; y++) t.data.copy(data, ((oy + y) * W + ox) * 4, y * w * 4, (y + 1) * w * 4);
  });
  const file = path.join(OUT, name + ".png");
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png({ palette: true, colours: 256, dither: 0, effort: 10, compressionLevel: 9 }).toFile(file);
  // Every colour in the file must be a palette colour (or transparent).
  const back = await sharp(file).ensureAlpha().raw().toBuffer();
  const allowed = new Set([...palette.map(p => toHex(p.rgb)), toHex(OUTLINE)]);
  for (let i = 0; i < back.length; i += 4) if (back[i + 3] && !allowed.has(toHex([back[i], back[i + 1], back[i + 2]]))) throw new Error(`${name}: ${toHex([back[i], back[i + 1], back[i + 2]])} is not in the palette`);
  const kb = Math.round((await sharp(file).toBuffer()).length / 1024);
  console.log(`${path.relative(ROOT, file)}  ${W}x${H}  ${kb} KB`);
}

mkdirSync(OUT, { recursive: true });
const tiles = {};
for (const [name, spec] of Object.entries(SHEETS)) tiles[name] = await sheetTiles(name, spec);
tiles.cast = await castTiles();
const samples = [];
sample(tiles.trials, 7, samples); sample(tiles.sea, 9, samples); sample(tiles.sprites, 5, samples); sample(tiles.cast, 3, samples);
const shuffle = rng(11);
for (let i = samples.length - 1; i > 0; i--) { const j = Math.floor(shuffle() * (i + 1)); [samples[i], samples[j]] = [samples[j], samples[i]]; }
const palette = buildPalette(samples.slice(0, 40000));
for (const [name, spec] of Object.entries(SHEETS)) {
  for (const t of tiles[name]) { quantize(t, palette, spec.dither); if (spec.sprite) outline(t); }
  await write(name, tiles[name], spec.cols, spec.rows, palette);
}
for (const t of tiles.cast) quantize(t, palette, CAST.dither);
await write("cast", tiles.cast, CAST.cols, CAST.rows, palette);

const sorted = [...palette].sort((a, b) => a.lab[0] - b.lab[0]).map(p => toHex(p.rgb));
writeFileSync(path.join(ROOT, "src/lib/render/palette.generated.ts"), `// Generated by scripts/pixelate-art.mjs: the shared palette of the pixel art, darkest first.\nexport const PALETTE = ${JSON.stringify(sorted)} as const;\n`);
console.log(`palette: ${palette.length} colours -> src/lib/render/palette.generated.ts`);
