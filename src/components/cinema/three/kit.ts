// The procedural prop kit for the cinematic worlds. Every builder returns a
// plain three.js object with its own geometry and materials (disposed with
// the world); textures are painted once and shared. No external assets.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fbm3, marbleTexture, rng, rockify, sailTexture } from "./util";

type V3 = [number, number, number];

export const mat = {
  marble: (tint = "#e6dccb") => new THREE.MeshStandardMaterial({ color: tint, map: marbleTexture(), roughness: 0.55, metalness: 0.02 }),
  stone: (color = "#6b6a66", rough = 0.95) => new THREE.MeshStandardMaterial({ color, roughness: rough, vertexColors: true }),
  bronze: (color = "#b98847") => new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.32 }),
  wood: (color = "#4a2f1b") => new THREE.MeshStandardMaterial({ color, roughness: 0.8, vertexColors: true }),
  leaf: (color = "#1f4a2c") => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  glow: (color: string, intensity = 1.6) => new THREE.MeshStandardMaterial({ color: "#000000", emissive: color, emissiveIntensity: intensity, roughness: 1 }),
  basic: (color: string) => new THREE.MeshBasicMaterial({ color }),
};

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, transforms: { p: V3; r?: V3; s?: V3 | number }[], color?: (i: number) => THREE.Color | null) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, transforms.length));
  const o = new THREE.Object3D();
  transforms.forEach((t, i) => {
    o.position.set(...t.p);
    o.rotation.set(...(t.r ?? [0, 0, 0]));
    const s = t.s ?? 1;
    if (typeof s === "number") o.scale.setScalar(s); else o.scale.set(...s);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    const c = color?.(i);
    if (c) mesh.setColorAt(i, c);
  });
  mesh.count = transforms.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** Fluted Doric-Ionic column parts (shaft + base, capital), unit radius scale applied per instance. */
function columnGeometries(radius: number, height: number) {
  const shaft = new THREE.CylinderGeometry(radius * 0.86, radius, height, 20, 6);
  const pos = shaft.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x), f = 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * 10)), 0.6);
    pos.setX(i, x * f); pos.setZ(i, z * f);
  }
  shaft.computeVertexNormals();
  shaft.translate(0, height / 2 + 0.24, 0);
  const plinth = new THREE.BoxGeometry(radius * 2.9, 0.14, radius * 2.9); plinth.translate(0, 0.07, 0);
  const torus = new THREE.CylinderGeometry(radius * 1.2, radius * 1.32, 0.12, 20); torus.translate(0, 0.19, 0);
  const body = mergeGeometries([shaft.toNonIndexed(), plinth.toNonIndexed(), torus.toNonIndexed()])!;
  const echinus = new THREE.CylinderGeometry(radius * 1.38, radius * 0.88, 0.2, 20); echinus.translate(0, height + 0.34, 0);
  const abacus = new THREE.BoxGeometry(radius * 3, 0.16, radius * 3); abacus.translate(0, height + 0.52, 0);
  const capital = mergeGeometries([echinus.toNonIndexed(), abacus.toNonIndexed()])!;
  [shaft, plinth, torus, echinus, abacus].forEach(g => g.dispose());
  return { body, capital, total: height + 0.6 };
}

export type ColumnSpot = { p: V3; h?: number; tilt?: number; broken?: boolean };
/** A set of columns as two instanced meshes. Broken columns are shorter and lose their capital. */
export function columns(spots: ColumnSpot[], radius = 0.3, height = 3.2, material = mat.marble()) {
  const g = new THREE.Group();
  const { body, capital } = columnGeometries(radius, height);
  g.add(instanced(body, material, spots.map(s => ({ p: s.p, r: [s.tilt ?? 0, 0, (s.tilt ?? 0) * 0.5], s: [1, s.h ?? 1, 1] }))));
  const whole = spots.filter(s => !s.broken && (s.h ?? 1) >= 0.99);
  if (whole.length) g.add(instanced(capital, material, whole.map(s => ({ p: s.p, r: [s.tilt ?? 0, 0, (s.tilt ?? 0) * 0.5] }))));
  return g;
}

/** A peripteral temple: stepped base, colonnade, entablature, pediments and a lit cella. */
export function temple({ w = 6, d = 9, front = 6, side = 8, h = 3.2, lit = "#ffb35c", radius = 0.26, ruined = 0, seed = 1 }: { w?: number; d?: number; front?: number; side?: number; h?: number; lit?: string | null; radius?: number; ruined?: number; seed?: number } = {}) {
  const g = new THREE.Group(), marble = mat.marble(), roofMat = mat.marble("#c9bda8"), r = rng(seed);
  [[w + 1.3, d + 1.3, 0.1], [w + 0.85, d + 0.85, 0.3], [w + 0.4, d + 0.4, 0.5]].forEach(([sw, sd, y]) => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.2, sd), marble); step.position.y = y; g.add(step);
  });
  const spots: ColumnSpot[] = [];
  for (let i = 0; i < front; i++) {
    const x = -w / 2 + (w * i) / (front - 1);
    spots.push({ p: [x, 0.6, d / 2] }, { p: [x, 0.6, -d / 2] });
  }
  for (let i = 1; i < side - 1; i++) {
    const z = -d / 2 + (d * i) / (side - 1);
    spots.push({ p: [-w / 2, 0.6, z] }, { p: [w / 2, 0.6, z] });
  }
  const kept = ruined ? spots.filter(() => r() > ruined * 0.35).map(s => (r() < ruined * 0.5 ? { ...s, h: 0.25 + r() * 0.5, broken: true } : s)) : spots;
  g.add(columns(kept, radius, h, marble));
  const top = 0.6 + h + 0.6;
  if (ruined < 0.5) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.75, 0.62, d + 0.75), marble); beam.position.y = top + 0.31; g.add(beam);
    const frieze = new THREE.Mesh(new THREE.BoxGeometry(w + 0.85, 0.12, d + 0.85), roofMat); frieze.position.y = top + 0.64; g.add(frieze);
    const tri = new THREE.Shape(); tri.moveTo(-(w + 0.9) / 2, 0); tri.lineTo((w + 0.9) / 2, 0); tri.lineTo(0, 1.05); tri.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: d + 0.9, bevelEnabled: false }), roofMat);
    roof.position.set(0, top + 0.7, -(d + 0.9) / 2); g.add(roof);
  }
  if (lit) {
    const cella = new THREE.Mesh(new THREE.BoxGeometry(w - 1.7, h, d - 2.4), new THREE.MeshStandardMaterial({ color: "#2a1a0c", emissive: lit, emissiveIntensity: 0.55, roughness: 1 }));
    cella.position.y = 0.6 + h / 2; g.add(cella);
    const lamp = new THREE.PointLight(lit, 6, w * 3, 1.6); lamp.position.set(0, 0.6 + h * 0.5, d / 2 + 0.6); g.add(lamp);
  }
  return g;
}

/** A round temple (tholos) with a shallow dome. */
export function tholos({ radius = 1.8, count = 10, h = 2.6, lit = "#cfe4ff" }: { radius?: number; count?: number; h?: number; lit?: string | null } = {}) {
  const g = new THREE.Group(), marble = mat.marble();
  for (const [rr, y] of [[radius + 0.75, 0.12], [radius + 0.5, 0.36]] as const) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.24, 40), marble); disc.position.y = y; g.add(disc);
  }
  const spots: ColumnSpot[] = Array.from({ length: count }, (_, i) => { const a = (i / count) * Math.PI * 2; return { p: [Math.cos(a) * radius, 0.48, Math.sin(a) * radius] }; });
  g.add(columns(spots, 0.17, h, marble));
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.32, radius + 0.32, 0.45, 40), marble); ring.position.y = 0.48 + h + 0.82; g.add(ring);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius + 0.3, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat.marble("#cfc5b2")); dome.scale.y = 0.55; dome.position.y = 0.48 + h + 1.04; g.add(dome);
  if (lit) { const lamp = new THREE.PointLight(lit, 4, 8, 1.6); lamp.position.y = 1.6; g.add(lamp); }
  return g;
}

/** A stone arch: two piers and a round head, extruded from one profile. */
export function arch({ span = 2.4, height = 4.4, pier = 0.7, depth = 0.9, tint = "#d7cbb3" }: { span?: number; height?: number; pier?: number; depth?: number; tint?: string } = {}) {
  const w = span + pier * 2, s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, height); s.lineTo(-w / 2, height); s.closePath();
  const hole = new THREE.Path(); const spring = height - pier - span / 2;
  hole.moveTo(-span / 2, 0); hole.lineTo(span / 2, 0); hole.lineTo(span / 2, spring); hole.absarc(0, spring, span / 2, 0, Math.PI, false); hole.lineTo(-span / 2, 0);
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 20 });
  geo.translate(0, 0, -depth / 2);
  rockify(geo, 0.05, 1.2, 4, 0, false);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tint, map: marbleTexture(), roughness: 0.75, vertexColors: true }));
  return m;
}

/** Italian cypresses: tall dark flames, instanced. */
export function cypresses(spots: { p: V3; s: number }[], color = "#17331f") {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.55 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.9) * (1 - t * 0.15), t * 5)); }
  const geo = new THREE.LatheGeometry(pts, 10);
  rockify(geo, 0.25, 1.4, 9, 0, true);
  return instanced(geo, mat.stone(color, 1), spots.map(s => ({ p: s.p, s: s.s })));
}

/** Rounded shrubs and flowering bushes. */
export function shrubs(spots: { p: V3; s: number }[], palette: string[], emissive = 0, seed = 5, glowColor = "#000000") {
  const geo = rockify(new THREE.IcosahedronGeometry(1, 2), 0.35, 1.6, seed, 0, true);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true, emissive: emissive ? glowColor : "#000000", emissiveIntensity: emissive });
  const r = rng(seed);
  return instanced(geo, m, spots.map(s => ({ p: s.p, s: [s.s, s.s * 0.8, s.s], r: [0, r() * 6, 0] })), () => new THREE.Color(palette[Math.floor(r() * palette.length)]));
}

/** One weathered boulder or sea stack. */
export function rock({ size = [1, 1, 1] as V3, seed = 1, color = "#5c5a57", detail = 3, rough = 0.5 }: { size?: V3; seed?: number; color?: string; detail?: number; rough?: number } = {}) {
  const geo = rockify(new THREE.IcosahedronGeometry(1, detail), rough, 1.3, seed, 0, true);
  const m = new THREE.Mesh(geo, mat.stone(color));
  m.scale.set(...size);
  return m;
}

/** A tall coastal cliff: a fractured column of rock, flattened on top. */
export function cliff({ radius = 6, height = 12, seed = 2, color = "#3e434a" }: { radius?: number; height?: number; seed?: number; color?: string } = {}) {
  const geo = new THREE.CylinderGeometry(radius * 0.75, radius, height, 48, 24);
  geo.translate(0, height / 2, 0);
  rockify(geo, radius * 0.55, 0.32, seed, 0.92, true);
  return new THREE.Mesh(geo, mat.stone(color));
}

/** The hull's cross-section and sheer, sampled into a mesh. Length runs along z. */
function hullGeometry(length: number, beam: number, depth: number) {
  const U = 44, V = 14, verts: number[] = [], colors: number[] = [], idx: number[] = [];
  for (let i = 0; i <= U; i++) {
    const u = i / U, body = Math.pow(Math.sin(Math.PI * u), 0.55), sheer = 0.18 + 0.75 * Math.pow(Math.abs(2 * u - 1), 3.2) + 0.35 * Math.pow(u, 7);
    for (let j = 0; j <= V; j++) {
      const v = j / V, th = Math.PI * v;
      const x = -beam * body * Math.cos(th), y = sheer - depth * Math.pow(Math.sin(Math.PI * u), 0.35) * Math.sin(th), z = (u - 0.5) * length;
      verts.push(x, y, z);
      const rim = Math.abs(Math.cos(th));
      const c = rim > 0.93 ? [0.62, 0.42, 0.2] : rim > 0.82 ? [0.45, 0.13, 0.08] : [0.32, 0.2, 0.12];
      const tar = y < 0.05 ? 0.35 : 1;
      colors.push(c[0] * tar, c[1] * tar, c[2] * tar);
    }
  }
  for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
    const a = i * (V + 1) + j, b = a + V + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export type ShipParts = { root: THREE.Group; sail: THREE.Mesh; sailBase: Float32Array; oars: THREE.InstancedMesh; oarSpots: { x: number; z: number; side: number }[]; lantern: THREE.PointLight | null };

/** A Greek galley: painted hull, curled prow and stern, shields, oars, linen sail, lanterns. */
export function ship({ length = 7, lanterns = true, crew = true }: { length?: number; lanterns?: boolean; crew?: boolean } = {}): ShipParts {
  const root = new THREE.Group(), beam = length * 0.11, depth = length * 0.085;
  const hull = new THREE.Mesh(hullGeometry(length, beam, depth), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  root.add(hull);
  const woodM = new THREE.MeshStandardMaterial({ color: "#4b301b", roughness: 0.75 });
  const curl = (pts: V3[], r: number) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 30, r, 8), woodM);
  const L = length / 2;
  root.add(curl([[0, 0.9, L - 0.2], [0, 1.45, L + 0.25], [0, 2.05, L + 0.25], [0, 2.2, L - 0.15], [0, 1.95, L - 0.3]], 0.075));
  root.add(curl([[0, 0.9, -L + 0.2], [0, 1.6, -L - 0.25], [0, 2.4, -L - 0.05], [0, 2.45, -L + 0.4], [0, 2.15, -L + 0.45]], 0.07));
  const shieldGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 18); shieldGeo.rotateZ(Math.PI / 2);
  const shields: { p: V3 }[] = [];
  for (let i = 0; i < 9; i++) { const z = -L * 0.62 + (i / 8) * L * 1.24; for (const s of [-1, 1]) shields.push({ p: [s * (beam * 0.98 + 0.02), 0.32, z] }); }
  root.add(instanced(shieldGeo, mat.bronze("#a57a40"), shields));
  const oarGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.6, 5); oarGeo.translate(0, -1.3, 0);
  const oarSpots: ShipParts["oarSpots"] = [];
  for (let i = 0; i < 10; i++) { const z = -L * 0.55 + (i / 9) * L * 1.1; oarSpots.push({ x: -beam, z, side: -1 }, { x: beam, z, side: 1 }); }
  const oars = new THREE.InstancedMesh(oarGeo, woodM, oarSpots.length);
  root.add(oars);
  if (crew) {
    const headGeo = new THREE.SphereGeometry(0.11, 8, 6), bodyGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.38, 6);
    const people: { p: V3 }[] = [], heads: { p: V3 }[] = [];
    for (let i = 0; i < 8; i++) { const z = -L * 0.5 + (i / 7) * L; for (const s of [-1, 1]) { people.push({ p: [s * beam * 0.45, 0.42, z] }); heads.push({ p: [s * beam * 0.45, 0.7, z] }); } }
    const crewM = new THREE.MeshStandardMaterial({ color: "#2a211b", roughness: 0.9 });
    root.add(instanced(bodyGeo, crewM, people), instanced(headGeo, mat.bronze("#7d5a33"), heads));
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.6, 8), woodM); mast.position.set(0, 2.4, 0.2); root.add(mast);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, length * 0.56, 6), woodM); yard.rotation.z = Math.PI / 2; yard.position.set(0, 4.45, 0.35); root.add(yard);
  const sailGeo = new THREE.PlaneGeometry(length * 0.52, 2.7, 18, 12);
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ map: sailTexture(), side: THREE.DoubleSide, roughness: 0.85, emissive: "#3a2410", emissiveIntensity: 0.15 }));
  sail.position.set(0, 3.05, 0.38);
  root.add(sail);
  const rope = new THREE.LineBasicMaterial({ color: "#2a1d12", transparent: true, opacity: 0.8 });
  const lines = new THREE.BufferGeometry().setFromPoints([[0, 4.6, 0.2], [0, 1.6, L - 0.1], [0, 4.6, 0.2], [0, 1.5, -L + 0.2], [length * 0.27, 4.45, 0.35], [beam, 0.5, -0.8], [-length * 0.27, 4.45, 0.35], [-beam, 0.5, -0.8]].map(p => new THREE.Vector3(...(p as V3))));
  root.add(new THREE.LineSegments(lines, rope));
  let lantern: THREE.PointLight | null = null;
  if (lanterns) {
    const lampM = mat.glow("#ffc070", 3);
    for (const z of [L - 0.45, -L + 0.55]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lampM); l.position.set(0, z > 0 ? 1.55 : 1.75, z); root.add(l); }
    lantern = new THREE.PointLight("#ffb661", 5, 9, 1.7); lantern.position.set(0, 1.9, -L + 0.4); root.add(lantern);
  }
  return { root, sail, sailBase: Float32Array.from((sailGeo.attributes.position as THREE.BufferAttribute).array), oars, oarSpots, lantern };
}

/** Billows the sail and swings the oars; call each frame. */
export function animateShip(parts: ShipParts, t: number, wind = 1, rowing = 1) {
  const pos = parts.sail.geometry.attributes.position as THREE.BufferAttribute, base = parts.sailBase;
  const w = (parts.sail.geometry as THREE.PlaneGeometry).parameters.width, h = (parts.sail.geometry as THREE.PlaneGeometry).parameters.height;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1], u = x / w + 0.5, v = y / h + 0.5;
    const bulge = Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.15 + v * 0.85)) * (0.55 + 0.08 * Math.sin(t * 1.7 + u * 3)) * wind;
    pos.setZ(i, base[i * 3 + 2] + bulge + Math.sin(t * 3.1 + u * 7 + v * 4) * 0.025 * wind);
  }
  pos.needsUpdate = true;
  parts.sail.geometry.computeVertexNormals();
  const o = new THREE.Object3D();
  parts.oarSpots.forEach((s, i) => {
    const phase = t * 1.6 * rowing + s.z * 0.15;
    o.position.set(s.x, 0.55, s.z);
    o.rotation.set(Math.sin(phase) * 0.35 * rowing, 0, s.side * (0.95 + Math.cos(phase) * 0.12 * rowing));
    o.updateMatrix();
    parts.oars.setMatrixAt(i, o.matrix);
  });
  parts.oars.instanceMatrix.needsUpdate = true;
}

/** The lotus: three rings of glowing petals around a golden heart. */
export function lotus({ size = 1, color = "#e2709f", heart = "#ffd27a", intensity = 0.32 }: { size?: number; color?: string; heart?: string; intensity?: number } = {}) {
  const g = new THREE.Group();
  const petal = new THREE.SphereGeometry(1, 14, 10);
  petal.scale(0.3, 0.07, 0.62); petal.translate(0, 0, 0.6);
  const pos = petal.attributes.position as THREE.BufferAttribute, colors: number[] = [];
  const base = new THREE.Color("#ffe8f0"), tip = new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) { const t = Math.min(1, pos.getZ(i) / 1.2); const c = base.clone().lerp(tip, Math.pow(t, 0.8)); colors.push(c.r, c.g, c.b); pos.setY(i, pos.getY(i) + Math.pow(pos.getZ(i), 2) * 0.22); }
  petal.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  petal.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: color, emissiveIntensity: intensity, roughness: 0.6, side: THREE.DoubleSide });
  const spots: { p: V3; r: V3; s: number }[] = [];
  [[8, 1.0, -0.15, 0], [8, 0.82, -0.62, 0.39], [6, 0.6, -1.05, 0.2]].forEach(([n, s, tilt, off]) => {
    for (let i = 0; i < n; i++) spots.push({ p: [0, 0.05, 0], r: [tilt, (i / n) * Math.PI * 2 + off, 0], s });
  });
  const petals = instanced(petal, m, spots.map(s => ({ ...s, r: s.r })));
  // Rotation order: yaw first, then tilt the petal upward.
  petals.instanceMatrix.needsUpdate = true;
  const o = new THREE.Object3D();
  spots.forEach((s, i) => { o.position.set(...s.p); o.rotation.set(0, 0, 0); o.rotateY(s.r[1]); o.rotateX(s.r[0]); o.scale.setScalar(s.s); o.updateMatrix(); petals.setMatrixAt(i, o.matrix); });
  g.add(petals);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.18, 16), mat.glow(heart, 2.4)); pod.position.y = 0.2; g.add(pod);
  g.scale.setScalar(size);
  return g;
}

/** Floating lily pads: notched discs on the water. */
export function lilyPads(spots: { p: V3; s: number }[], color = "#1d4a2a") {
  const geo = new THREE.CircleGeometry(1, 22, 0.3, Math.PI * 2 - 0.55); geo.rotateX(-Math.PI / 2);
  const r = rng(11);
  return instanced(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide }), spots.map(s => ({ p: s.p, s: s.s, r: [0, r() * 6.28, 0] })));
}

/** A bronze brazier on three legs. The flame is added by the world. */
export function brazier(scale = 1) {
  const g = new THREE.Group(), bronze = mat.bronze("#9a6a35");
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([0, 0.15, 0.42, 0.55, 0.58].map((r, i) => new THREE.Vector2(r, i * 0.11)), 20), bronze); bowl.position.y = 1.15; g.add(bowl);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.25, 6), bronze);
    leg.position.set(Math.cos(a) * 0.28, 0.6, Math.sin(a) * 0.28); leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); g.add(leg);
  }
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.08, 16), mat.glow("#ff5a1c", 2.2)); coals.position.y = 1.55; g.add(coals);
  g.scale.setScalar(scale);
  return g;
}

/** A leaning palm with arching fronds. */
export function palm({ height = 5, lean = 0.5, seed = 1 }: { height?: number; lean?: number; seed?: number } = {}) {
  const g = new THREE.Group(), r = rng(seed);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.4, height * 0.45, 0), new THREE.Vector3(lean * 1.2, height * 0.85, 0), new THREE.Vector3(lean * 1.7, height, 0)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.13, 7), new THREE.MeshStandardMaterial({ color: "#6a5038", roughness: 0.9 })));
  const frond = new THREE.PlaneGeometry(2.6, 0.55, 12, 1); frond.translate(1.3, 0, 0);
  const fp = frond.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), t = x / 2.6; fp.setY(i, fp.getY(i) * (1 - t * 0.85)); fp.setZ(i, -Math.pow(t, 2) * 1.1); }
  frond.rotateX(-Math.PI / 2); frond.computeVertexNormals();
  const top = curve.getPoint(1), m = new THREE.MeshStandardMaterial({ color: "#2f5b2a", roughness: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(frond, m); f.position.copy(top);
    f.rotation.set(0, (i / 9) * Math.PI * 2 + r() * 0.4, 0); f.rotateZ(0.25 + r() * 0.35);
    g.add(f);
  }
  return g;
}

/** Calypso's raft: lashed logs, a short mast and a patched sail. */
export function raft() {
  const g = new THREE.Group(), wood = mat.wood("#5d3e22");
  const log = new THREE.CylinderGeometry(0.16, 0.16, 3.2, 8); log.rotateX(Math.PI / 2);
  const colors = new Float32Array(log.attributes.position.count * 3).fill(1); log.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(log, wood); m.position.set(-0.96 + i * 0.32, 0, (i % 2) * 0.12); g.add(m); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.14), mat.wood("#3b2614")); beam.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(beam.geometry.attributes.position.count * 3).fill(1), 3));
  for (const z of [-1, 1]) { const b = beam.clone(); b.position.set(0, 0.16, z); g.add(b); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), mat.wood("#4a2f1b")); mast.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(mast.geometry.attributes.position.count * 3).fill(1), 3)); mast.position.set(0, 1.3, -0.2); g.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.5, 6, 6), new THREE.MeshStandardMaterial({ map: sailTexture(), side: THREE.DoubleSide, roughness: 0.9 })); sail.position.set(0, 1.55, -0.12); g.add(sail);
  return g;
}

/** Penelope's twelve axes in a line, each head pierced with its ring. */
export function axes(count = 12, spacing = 1.6) {
  const g = new THREE.Group(), s = new THREE.Shape();
  s.moveTo(-0.55, -0.42); s.quadraticCurveTo(-0.2, 0, -0.55, 0.42); s.lineTo(-0.1, 0.16); s.lineTo(0.1, 0.16); s.lineTo(0.55, 0.42); s.quadraticCurveTo(0.2, 0, 0.55, -0.42); s.lineTo(0.1, -0.16); s.lineTo(-0.1, -0.16); s.closePath();
  const ring = new THREE.Path(); ring.absarc(0, 0, 0.1, 0, Math.PI * 2, true); s.holes.push(ring);
  const head = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
  head.translate(0, 0, -0.03);
  const post = new THREE.CylinderGeometry(0.035, 0.045, 1.3, 6); post.translate(0, -0.65 - 0.16, 0);
  // Each head faces down the hall, ring toward the archer: the arrow must pass through all twelve.
  const spots = Array.from({ length: count }, (_, i) => ({ p: [0, 1.25, -i * spacing] as V3 }));
  g.add(instanced(head, mat.bronze("#c9a062"), spots), instanced(post, mat.wood("#3a2414"), spots.map(sp => ({ p: sp.p }))));
  (g.children[1] as THREE.Mesh).geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(post.attributes.position.count * 3).fill(1), 3));
  return g;
}

/** One of Scylla's heads on its long neck, rising from the strait. */
export function serpent({ points, radius = 0.38, color = "#26353a" }: { points: V3[]; radius?: number; color?: string }) {
  const g = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 });
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const neck = new THREE.TubeGeometry(curve, 48, radius, 10);
  const np = neck.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < np.count; i++) {
    const t = Math.floor(i / 11) / 48, c = curve.getPoint(t), v = new THREE.Vector3(np.getX(i), np.getY(i), np.getZ(i)).sub(c);
    v.multiplyScalar(1.35 - t * 0.55 + Math.sin(t * 40) * 0.04); np.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  neck.computeVertexNormals();
  g.add(new THREE.Mesh(neck, skin));
  const end = curve.getPoint(1), dir = curve.getTangent(1);
  const head = new THREE.Group(); head.position.copy(end); head.lookAt(end.clone().add(dir));
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin); skull.scale.set(radius * 1.35, radius * 1.05, radius * 2.6); skull.position.z = radius * 1.2; head.add(skull);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.9, radius * 2.6, 10), skin); jaw.rotation.x = Math.PI / 2 + 0.45; jaw.position.set(0, -radius * 0.6, radius * 1.9); head.add(jaw);
  const eyeM = mat.glow("#ff5a2a", 4);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.17, 8, 6), eyeM); e.position.set(s * radius * 0.85, radius * 0.45, radius * 1.6); head.add(e); }
  for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.18, radius * 1.4, 6), skin); horn.position.set(s * radius * 0.6, radius * 0.9, radius * 0.2); horn.rotation.x = -0.9; head.add(horn); }
  g.add(head);
  return g;
}

/** Turf and blossoms on an island top: a squat displaced dome. */
export function islandBase({ radius = 2.4, height = 1.2, seed = 3, rockColor = "#57524b", grass = "#2f4a2a" }: { radius?: number; height?: number; seed?: number; rockColor?: string; grass?: string } = {}) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius * 0.82, radius * 1.08, height, 36, 6); geo.translate(0, height / 2 - 0.35, 0);
  rockify(geo, radius * 0.35, 0.7, seed, 0.85, true);
  g.add(new THREE.Mesh(geo, mat.stone(rockColor)));
  const cap = new THREE.CylinderGeometry(radius * 0.8, radius * 0.86, 0.22, 32, 1); cap.translate(0, height - 0.32, 0);
  rockify(cap, radius * 0.18, 0.9, seed + 2, 0, false);
  g.add(new THREE.Mesh(cap, mat.stone(grass, 1)));
  return g;
}

/** Scatter helper: n points in a ring band around the origin, deterministic. */
export function scatter(n: number, inner: number, outer: number, y: number | ((x: number, z: number) => number), seed: number) {
  const r = rng(seed), out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = inner + (outer - inner) * Math.sqrt(r()), x = Math.cos(a) * d, z = Math.sin(a) * d;
    out.push([x, typeof y === "number" ? y : y(x, z), z]);
  }
  return out;
}

export const noiseAt = (x: number, z: number, seed: number) => fbm3(x * 0.3 + seed, 0, z * 0.3 - seed, 3);
