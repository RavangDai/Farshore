import * as THREE from "three";

/** A small seeded random generator (mulberry32), so every world is identical on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash3 = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const fade = (t: number) => t * t * (3 - 2 * t);
/** Value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}
export function fbm3(x: number, y: number, z: number, octaves = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += noise3(x * f, y * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

/**
 * Pushes every vertex out along its direction from the centre by fractal
 * noise, then darkens the lower vertices: rock that reads as rock without a
 * single texture. Returns the same geometry.
 */
export function rockify(geometry: THREE.BufferGeometry, amount: number, frequency: number, seed: number, flatten = 0, shade = true) {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * frequency + seed, v.y * frequency + seed * 0.37, v.z * frequency - seed, 5);
    const len = v.length() || 1;
    const push = (n - 0.45) * amount;
    v.addScaledVector(v.clone().divideScalar(len), push);
    if (flatten && v.y > box.max.y * flatten) v.y = box.max.y * flatten + (v.y - box.max.y * flatten) * 0.15;
    pos.setXYZ(i, v.x, v.y, v.z);
    const h = (v.y - box.min.y) / Math.max(0.001, box.max.y - box.min.y);
    const ao = shade ? 0.45 + 0.55 * Math.min(1, h * 1.4) : 1;
    const grain = 0.85 + n * 0.3;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = ao * grain;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const textures = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = textures.get(key);
  if (!t) { t = make(); textures.set(key, t); }
  return t;
}

/** A soft white radial falloff, the basis of every glow sprite. */
export function glowTexture() {
  return cached("glow", () => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.14)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** The ship's sail: undyed linen, a Greek-key border and a laurel emblem, painted once. */
export function sailTexture() {
  return cached("sail", () => {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const g = c.getContext("2d")!;
    const base = g.createLinearGradient(0, 0, 256, 256);
    base.addColorStop(0, "#efe2c4"); base.addColorStop(1, "#cdb791");
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(90,60,30,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1, 6); }
    g.fillStyle = "#8f2a1e"; g.fillRect(0, 0, 256, 22); g.fillRect(0, 234, 256, 22);
    g.strokeStyle = "#e9d6b0"; g.lineWidth = 3;
    for (let x = 0; x < 256; x += 22) {
      for (const y of [4, 238]) { g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x, y); g.lineTo(x + 14, y); g.lineTo(x + 14, y + 9); g.lineTo(x + 6, y + 9); g.stroke(); }
    }
    g.fillStyle = "rgba(143,42,30,0.88)"; g.fillRect(0, 22, 46, 212);
    g.strokeStyle = "rgba(143,42,30,0.9)"; g.lineWidth = 7;
    g.beginPath(); g.arc(150, 128, 40, Math.PI * 0.72, Math.PI * 2.28); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(118, 168); g.lineTo(134, 168); g.moveTo(166, 168); g.lineTo(182, 168); g.stroke();
    g.fillStyle = "rgba(143,42,30,0.85)";
    for (let i = 0; i < 9; i++) {
      for (const side of [-1, 1]) {
        const a = Math.PI / 2 + side * (0.45 + i * 0.27), r = 62;
        g.beginPath(); g.ellipse(150 + Math.cos(a) * r, 128 + Math.sin(a) * r, 8, 3.5, a + side * 0.9, 0, Math.PI * 2); g.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Polished marble: a pale base with soft veins. */
export function marbleTexture() {
  return cached("marble", () => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#d9cfbd"; g.fillRect(0, 0, 256, 256);
    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(${120 + r() * 40},${105 + r() * 30},${90 + r() * 20},${0.08 + r() * 0.16})`;
      g.lineWidth = 0.6 + r() * 1.8;
      g.beginPath();
      let x = r() * 256, y = r() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (r() - 0.3) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** A chequered marble floor for the hall at Ithaca. */
export function floorTexture() {
  return cached("floor", () => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? "#2b1d14" : "#cbb79a";
      g.fillRect(x * 64, y * 64, 64, 64);
    }
    g.globalAlpha = 0.25;
    g.drawImage(marbleTexture().image as HTMLCanvasElement, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** GLSL helpers shared by the sky, water and mist shaders. */
export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + vec2(17.1, 9.2); a *= .5; } return s; }
`;

/** Dispose every geometry and material under an object (for imperatively built meshes). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose?.();
  });
}
