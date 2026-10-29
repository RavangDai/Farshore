// Painted textures for the great hall of Ithaca.
//
// Like the cave, the hall ships no image files: every surface is painted onto
// a canvas when the encounter loads. The palette follows the Ithaca trial
// card: cream and gold marble, navy hangings with gold borders, warm lamp
// light, and the bright courtyard beyond the far doorway.

import * as THREE from "three";

type Random = () => number;

function seeded(seed: number): Random {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function surface(w: number, h: number) {
  const node = document.createElement("canvas");
  node.width = w;
  node.height = h;
  const c = node.getContext("2d");
  if (!c) throw new Error("Canvas 2D is unavailable");
  return { node, c };
}

function toTexture(node: HTMLCanvasElement, colour = true, repeat = true) {
  const t = new THREE.CanvasTexture(node);
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soft marble veins: a few wandering, semi-transparent strokes. */
function veins(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: Random, colour: string, count: number) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  for (let i = 0; i < count; i++) {
    c.strokeStyle = colour.replace("A", (0.08 + rand() * 0.16).toFixed(2));
    c.lineWidth = 0.6 + rand() * 1.8;
    c.beginPath();
    let px = x + rand() * w, py = y + rand() * h;
    c.moveTo(px, py);
    for (let k = 0; k < 5; k++) {
      const nx = px + (rand() - 0.3) * w * 0.5, ny = py + (rand() - 0.5) * h * 0.5;
      c.quadraticCurveTo((px + nx) / 2 + (rand() - 0.5) * 30, (py + ny) / 2 + (rand() - 0.5) * 30, nx, ny);
      px = nx;
      py = ny;
    }
    c.stroke();
  }
  c.restore();
}

/** Two metres of polished floor: cream and warm grey marble squares with a thin gold joint. */
function paintFloor(rand: Random) {
  const S = 1024, tile = S / 2;
  const { node, c } = surface(S, S);
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const light = (tx + ty) % 2 === 0, x = tx * tile, y = ty * tile;
      const g = c.createLinearGradient(x, y, x + tile, y + tile);
      g.addColorStop(0, light ? "#efe4cc" : "#b9a88a");
      g.addColorStop(1, light ? "#e1d2b2" : "#a8957a");
      c.fillStyle = g;
      c.fillRect(x, y, tile, tile);
      veins(c, x, y, tile, tile, rand, light ? "rgba(150,128,96,A)" : "rgba(84,68,50,A)", 9);
    }
  }
  c.strokeStyle = "#c79a4a";
  c.lineWidth = 6;
  for (let i = 0; i <= 2; i++) {
    c.beginPath(); c.moveTo(i * tile, 0); c.lineTo(i * tile, S); c.stroke();
    c.beginPath(); c.moveTo(0, i * tile); c.lineTo(S, i * tile); c.stroke();
  }
  return toTexture(node);
}

/** A fluted column shaft: cream marble with shadowed flutes. */
function paintColumn(rand: Random) {
  const W = 256, H = 512;
  const { node, c } = surface(W, H);
  const flutes = 10;
  for (let x = 0; x < W; x++) {
    const f = 0.72 + 0.28 * Math.pow(0.5 + 0.5 * Math.cos((x / W) * flutes * Math.PI * 2), 0.7);
    c.fillStyle = `rgb(${Math.round(240 * f)},${Math.round(226 * f)},${Math.round(196 * f)})`;
    c.fillRect(x, 0, 1, H);
  }
  veins(c, 0, 0, W, H, rand, "rgba(160,132,96,A)", 8);
  return toTexture(node);
}

/** The Greek key that borders the hangings and the frieze. */
function meander(c: CanvasRenderingContext2D, x: number, y: number, w: number, unit: number, colour: string) {
  c.strokeStyle = colour;
  c.lineWidth = unit * 0.32;
  c.lineCap = "square";
  for (let px = x; px + unit * 4 <= x + w; px += unit * 4) {
    c.beginPath();
    c.moveTo(px, y + unit * 3);
    c.lineTo(px, y);
    c.lineTo(px + unit * 3, y);
    c.lineTo(px + unit * 3, y + unit * 2);
    c.lineTo(px + unit, y + unit * 2);
    c.lineTo(px + unit, y + unit);
    c.lineTo(px + unit * 2, y + unit);
    c.moveTo(px + unit * 3, y + unit * 3);
    c.lineTo(px + unit * 4, y + unit * 3);
    c.stroke();
  }
}

/** A navy hanging with gold borders and a gold sunburst, after the hall on the trial card. */
function paintDrape(rand: Random) {
  const W = 256, H = 512;
  const { node, c } = surface(W, H);
  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "#0d1d3d");
  g.addColorStop(0.5, "#1a3266");
  g.addColorStop(1, "#0d1d3d");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // Folds.
  for (let x = 0; x < W; x += 32) {
    const fold = c.createLinearGradient(x, 0, x + 32, 0);
    fold.addColorStop(0, "rgba(0,0,0,0.28)");
    fold.addColorStop(0.5, "rgba(255,255,255,0.05)");
    fold.addColorStop(1, "rgba(0,0,0,0.28)");
    c.fillStyle = fold;
    c.fillRect(x, 0, 32, H);
  }
  c.fillStyle = "#c9a04e";
  c.fillRect(0, 0, W, 10);
  c.fillRect(0, H - 34, W, 6);
  meander(c, 14, H - 26, W - 28, 6, "#d9b25c");
  c.fillRect(10, 18, 4, H - 60);
  c.fillRect(W - 14, 18, 4, H - 60);
  // Sunburst.
  c.save();
  c.translate(W / 2, H * 0.36);
  c.fillStyle = "#e0bb62";
  for (let i = 0; i < 16; i++) {
    c.rotate(Math.PI / 8);
    c.beginPath();
    c.moveTo(-7, 0);
    c.lineTo(0, i % 2 ? 62 : 46);
    c.lineTo(7, 0);
    c.fill();
  }
  c.beginPath();
  c.arc(0, 0, 22, 0, Math.PI * 2);
  c.fill();
  c.restore();
  for (let i = 0; i < 900; i++) {
    c.fillStyle = `rgba(255,255,255,${rand() * 0.04})`;
    c.fillRect(rand() * W, rand() * H, 1, 1);
  }
  return toTexture(node, true, false);
}

/** Warm ashlar wall with a gold-and-navy meander frieze along the top. */
function paintWall(rand: Random) {
  const W = 512, H = 512;
  const { node, c } = surface(W, H);
  c.fillStyle = "#6e5232";
  c.fillRect(0, 0, W, H);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = (r * H) / rows, offset = r % 2 ? 64 : 0;
    for (let x = -offset; x < W; x += 128) {
      const shade = 0.85 + rand() * 0.22;
      c.fillStyle = `rgb(${Math.round(150 * shade)},${Math.round(116 * shade)},${Math.round(76 * shade)})`;
      c.fillRect(x + 2, y + 2, 124, H / rows - 4);
    }
  }
  c.fillStyle = "#14254a";
  c.fillRect(0, 0, W, 54);
  meander(c, 8, 12, W - 16, 8, "#d4ab58");
  return toTexture(node);
}

/** Coffered ceiling: dark wood panels with gilded rims. */
function paintCeiling(rand: Random) {
  const S = 256;
  const { node, c } = surface(S, S);
  c.fillStyle = "#2a1a10";
  c.fillRect(0, 0, S, S);
  c.fillStyle = "#b8893e";
  c.fillRect(0, 0, S, 14);
  c.fillRect(0, 0, 14, S);
  const inner = c.createLinearGradient(20, 20, S - 20, S - 20);
  inner.addColorStop(0, "#3d2614");
  inner.addColorStop(1, "#1d1209");
  c.fillStyle = inner;
  c.fillRect(26, 26, S - 40, S - 40);
  c.strokeStyle = "#8f6a30";
  c.lineWidth = 3;
  c.strokeRect(38, 38, S - 64, S - 64);
  c.fillStyle = "#c99a48";
  c.beginPath();
  c.arc(S / 2 + 6, S / 2 + 6, 12 + rand() * 2, 0, Math.PI * 2);
  c.fill();
  return toTexture(node);
}

/** A lamp flame: hot core, orange body, soft transparent edge. */
function paintFlame() {
  const W = 64, H = 128;
  const { node, c } = surface(W, H);
  const g = c.createRadialGradient(W / 2, H * 0.72, 2, W / 2, H * 0.62, H * 0.55);
  g.addColorStop(0, "rgba(255,250,220,1)");
  g.addColorStop(0.25, "rgba(255,206,110,0.95)");
  g.addColorStop(0.6, "rgba(255,120,40,0.55)");
  g.addColorStop(1, "rgba(255,80,20,0)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(W / 2, 2);
  c.bezierCurveTo(W * 0.95, H * 0.45, W * 0.9, H * 0.95, W / 2, H - 2);
  c.bezierCurveTo(W * 0.1, H * 0.95, W * 0.05, H * 0.45, W / 2, 2);
  c.fill();
  return toTexture(node, true, false);
}

function paintRadial(stops: [number, string][], size = 128) {
  const { node, c } = surface(size, size);
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return toTexture(node, true, false);
}

/** The courtyard seen through the far doorway: bright sky over sunlit stone. */
function paintCourtyard() {
  const W = 256, H = 512;
  const { node, c } = surface(W, H);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#fff6dc");
  g.addColorStop(0.55, "#ffe2a0");
  g.addColorStop(0.62, "#f2c77e");
  g.addColorStop(1, "#d9a55c");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  return toTexture(node, true, false);
}

/** Hammered bronze, for the axe heads. */
function paintBronze(rand: Random) {
  const S = 128;
  const { node, c } = surface(S, S);
  c.fillStyle = "#b9853f";
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const r = 2 + rand() * 6;
    c.fillStyle = rand() < 0.5 ? `rgba(255,226,160,${0.06 + rand() * 0.1})` : `rgba(70,40,10,${0.06 + rand() * 0.12})`;
    c.beginPath();
    c.arc(rand() * S, rand() * S, r, 0, Math.PI * 2);
    c.fill();
  }
  return toTexture(node);
}

/** Straight-grained ash for the axe hafts and the bow. */
function paintWood(rand: Random) {
  const W = 64, H = 256;
  const { node, c } = surface(W, H);
  c.fillStyle = "#6a4123";
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    c.strokeStyle = `rgba(${rand() < 0.5 ? "40,22,10" : "150,100,60"},${0.15 + rand() * 0.2})`;
    c.lineWidth = 1 + rand() * 2;
    const x = rand() * W;
    c.beginPath();
    c.moveTo(x, 0);
    c.bezierCurveTo(x + (rand() - 0.5) * 8, H * 0.3, x + (rand() - 0.5) * 8, H * 0.7, x + (rand() - 0.5) * 6, H);
    c.stroke();
  }
  return toTexture(node);
}

export function paintHallTextures(anisotropy: number) {
  const rand = seeded(2104);
  const textures = {
    floor: paintFloor(rand),
    column: paintColumn(rand),
    drape: paintDrape(rand),
    wall: paintWall(rand),
    ceiling: paintCeiling(rand),
    flame: paintFlame(),
    glow: paintRadial([[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,0.55)"], [0.6, "rgba(255,255,255,0.12)"], [1, "rgba(255,255,255,0)"]]),
    courtyard: paintCourtyard(),
    bronze: paintBronze(rand),
    wood: paintWood(rand),
  };
  for (const t of Object.values(textures)) t.anisotropy = anisotropy;
  return textures;
}
export type HallTextures = ReturnType<typeof paintHallTextures>;
