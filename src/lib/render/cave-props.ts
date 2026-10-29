// Models for the 3D Cyclops' Cave.
//
// Built from primitives plus the painted textures, then shared: every crate in
// the run reuses one geometry and one material, so the cost of a busy stretch
// is a handful of extra draw calls, never new GPU uploads. Each builder
// returns a group anchored on the floor at the centre of its lane, so the
// world only ever has to set a position.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ObstacleKind } from "../encounters/cave-runner.ts";
import { hash01 } from "./stage.ts";
import { seeded, type CaveTextures } from "./cave-textures.ts";

/** Half the paved width, kerb to kerb. */
export const PATH_HALF = 2.8;
/** Half the causeway's full width, out to the face of the sea wall. */
export const SLAB_HALF = 3.42;
/** Height of the sea below the paving. */
export const WATER_Y = -3.6;
/** Where the great gate piers stand, either side of the causeway. */
export const PIER_X = 4.2;

/** How tall each hazard stands, for placing its prompt above it. */
export const OBSTACLE_HEIGHT: Record<ObstacleKind, number> = {
  pillar: 2.9,
  crate: 0.9,
  boulder: 1.7,
  lowrock: 0.7,
  beam: 1.6,
  debris: 0.7,
  fire: 1.4,
  crack: 0.2,
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Scale a box's UVs to its real size, so one texture repeat is `metres` on every face. */
function boxUV(geometry: THREE.BoxGeometry, w: number, h: number, d: number, metres: number) {
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  // BoxGeometry faces, four vertices each: +x, -x, +y, -y, +z, -z.
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  faces.forEach(([fu, fv], face) => {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, (uv.getX(i) * fu) / metres, (uv.getY(i) * fv) / metres);
    }
  });
  uv.needsUpdate = true;
  return geometry;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, metres = 0) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (metres) boxUV(geometry, w, h, d, metres);
  geometry.translate(x, y, z);
  return geometry;
}

/** Position-keyed hash, so vertices shared between faces move together. */
const vertexHash = (v: THREE.Vector3, seed: number) =>
  hash01(Math.round(v.x * 997) * 3 + Math.round(v.y * 991) * 7 + Math.round(v.z * 983) * 11 + seed * 13);

/** A craggy, faceted rock: the low-poly look reads as arcade rather than as a cheap sphere. */
function rockGeometry(seed: number, detail: number) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const rand = seeded(seed);
  const lumps = Array.from({ length: 5 }, () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const n = v.clone().normalize();
    let r = 0.9;
    lumps.forEach((lump, k) => {
      r += Math.pow(Math.max(0, n.dot(lump)), 3) * (0.22 - k * 0.03);
    });
    r *= 0.88 + vertexHash(v, seed) * 0.2;
    position.setXYZ(i, n.x * r, n.y * r * 0.92, n.z * r);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A column shaft with its base at y = 0. A broken one has a jagged crown. */
function columnGeometry(radius: number, height: number, broken: boolean, seed: number) {
  const geometry = new THREE.CylinderGeometry(radius * 0.92, radius, height, 18, 3);
  geometry.translate(0, height / 2, 0);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    if (broken && v.y > height - 0.01) position.setY(i, height - vertexHash(v, seed) * radius * 1.3);
    uv.setY(i, uv.getY(i) * (height / 2.4));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function lathe(points: [number, number][], segments = 16) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

/** A plane lying flat on the floor, facing up. */
function floorPlane(w = 1, d = 1) {
  const geometry = new THREE.PlaneGeometry(w, d);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------

export type CaveKit = ReturnType<typeof buildKit>;

export function buildKit(t: CaveTextures) {
  const std = (params: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...params });
  const additive = (map: THREE.Texture, colour: number) =>
    new THREE.MeshBasicMaterial({ map, color: colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const glow = (colour: number) =>
    new THREE.SpriteMaterial({ map: t.glow, color: colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  // Cliffs are huge, so they take the rock texture several times over.
  const cliffMap = t.rock.clone();
  cliffMap.repeat.set(3, 2);
  cliffMap.needsUpdate = true;

  const m = {
    floor: std({ map: t.floor, bumpMap: t.floorBump, bumpScale: 2.4 }),
    block: std({ map: t.block, bumpMap: t.block, bumpScale: 1.6 }),
    mossTop: std({ map: t.mossTop, bumpMap: t.mossTop, bumpScale: 1.2 }),
    ashlar: std({ map: t.ashlar, bumpMap: t.ashlar, bumpScale: 1.4 }),
    rock: std({ map: t.rock, bumpMap: t.rock, bumpScale: 2, color: 0xd8c8ae }),
    rockDark: std({ map: t.rock, bumpMap: t.rock, bumpScale: 2, color: 0xa69a86 }),
    cliff: std({ map: cliffMap, bumpMap: cliffMap, bumpScale: 3, color: 0xc4b49a }),
    marble: std({ map: t.marble, bumpMap: t.marble, bumpScale: 1.6, roughness: 0.7 }),
    wood: std({ map: t.wood, roughness: 0.85 }),
    crate: std({ map: t.crate, bumpMap: t.crate, bumpScale: 1.2 }),
    bronze: std({ color: 0xb98034, metalness: 0.35, roughness: 0.42, emissive: 0x2e1806 }),
    meander: std({ map: t.meander, emissiveMap: t.meander, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.6 }),
    mask: std({ map: t.mask, bumpMap: t.mask, bumpScale: 2, emissiveMap: t.maskGlow, emissive: 0xff5a1e, emissiveIntensity: 0.5, roughness: 0.8 }),
    vine: new THREE.MeshLambertMaterial({ map: t.vine, alphaTest: 0.45, side: THREE.DoubleSide }),
    wool: std({ color: 0xf6f0e4, roughness: 1, emissive: 0x3a352c }),
    sheepSkin: std({ color: 0x3d322b, roughness: 0.9 }),
    horn: std({ color: 0xd8bf8e, roughness: 0.55 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    coinFace: std({ map: t.coin, emissiveMap: t.coin, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.25 }),
    coinEdge: std({ color: 0xe0a83c, emissive: 0x7a4c10, roughness: 0.35, metalness: 0.25 }),
    terracotta: std({ color: 0xb85a2c, roughness: 0.75 }),
    sack: std({ color: 0xa88a5c, roughness: 1 }),
    skin: std({ color: 0x9a7560, roughness: 0.85, emissive: 0x1a0c06 }),
    boulder: std({ map: t.rock, color: 0xa69684, emissiveMap: t.ember, emissive: 0xff6a20, emissiveIntensity: 1.3 }),
    coals: new THREE.MeshBasicMaterial({ map: t.ember, color: 0xffa050 }),
    hole: new THREE.MeshBasicMaterial({ map: t.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    grate: std({ map: t.grate, transparent: true, emissiveMap: t.grate, emissive: 0xff7a2a, emissiveIntensity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    flame: additive(t.flame, 0xffffff),
    blob: new THREE.MeshBasicMaterial({ map: t.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    lifeRing: additive(t.ring, 0x7dffb0),
    telegraph: additive(t.chevrons, 0xff4a36),
    target: additive(t.ring, 0xff5a3c),
  };
  // Every sprite glow, by colour.
  const g = {
    fire: glow(0xff8a36),
    gold: glow(0xffcf6a),
    life: glow(0xb8ffd0),
    teal: glow(0x5fe6e0),
    sun: glow(0xfff0c8),
    ember: glow(0xff6a28),
    flame: new THREE.SpriteMaterial({ map: t.flame, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  };

  const geometry = {
    unitBox: new THREE.BoxGeometry(1, 1, 1),
    floorPlane: floorPlane(),
    plane: new THREE.PlaneGeometry(1, 1),
    flame: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
    rocks: [rockGeometry(11, 2), rockGeometry(23, 2), rockGeometry(37, 2), rockGeometry(51, 2)],
    rocksLow: [rockGeometry(61, 1), rockGeometry(73, 1), rockGeometry(89, 1)],
    columnBroken: columnGeometry(0.5, 2.9, true, 5),
    columnWhole: columnGeometry(0.5, 2.6, false, 6),
    sphere: new THREE.SphereGeometry(1, 14, 10),
    leg: new THREE.CylinderGeometry(0.05, 0.04, 0.42, 6).translate(0, -0.21, 0),
    // A sheep's static parts are merged, so a whole sheep costs a few draws.
    sheepWool: mergeGeometries(
      [
        [0, 0.62, 0, 0.36],
        [-0.18, 0.66, 0.1, 0.27],
        [0.18, 0.66, 0.1, 0.27],
        [-0.16, 0.64, -0.18, 0.27],
        [0.16, 0.64, -0.18, 0.27],
        [0, 0.84, -0.02, 0.26],
        [0, 0.6, -0.32, 0.25],
      ].map(([x, y, z, r]) => new THREE.SphereGeometry(r, 12, 9).translate(x, y, z)),
    )!,
    sheepHorns: mergeGeometries(
      [-1, 1].map(side =>
        new THREE.TorusGeometry(0.085, 0.032, 6, 12, Math.PI * 1.5)
          .rotateZ(side > 0 ? 0 : Math.PI)
          .rotateY((side * Math.PI) / 2)
          .translate(side * 0.13, 0.8, 0.3),
      ),
    )!,
    sheepEyes: mergeGeometries([-1, 1].map(side => new THREE.SphereGeometry(0.025, 8, 6).translate(side * 0.07, 0.76, 0.5)))!,
    coin: new THREE.CylinderGeometry(0.3, 0.3, 0.07, 28).rotateX(Math.PI / 2),
    crate: new THREE.BoxGeometry(1.24, 0.94, 1.05),
    amphora: lathe([[0, 0], [0.09, 0.02], [0.17, 0.22], [0.2, 0.42], [0.15, 0.6], [0.07, 0.68], [0.07, 0.76], [0.1, 0.78], [0, 0.78]], 14),
    vines: [1.6, 2.4, 3.2].map(length => new THREE.PlaneGeometry(0.75, length).translate(0, -length / 2, 0)),
    stalactite: new THREE.ConeGeometry(1, 1, 7).rotateX(Math.PI).translate(0, -0.5, 0),
    brazier: mergeGeometries([
      lathe([[0.04, 0], [0.2, 0.06], [0.36, 0.22], [0.4, 0.32], [0.36, 0.33], [0.3, 0.24], [0, 0.2]], 16).translate(0, 0.58, 0),
      ...[0, 1, 2].map(i => {
        const leg = new THREE.CylinderGeometry(0.025, 0.035, 0.66, 5);
        leg.rotateZ(0.32);
        leg.translate(0.12, 0.31, 0);
        leg.rotateY((i / 3) * Math.PI * 2);
        return leg;
      }),
    ])!,
    coals: new THREE.CircleGeometry(0.33, 14).rotateX(-Math.PI / 2).translate(0, 0.86, 0),
  };

  return { m, g, geometry, t };
}

const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) => new THREE.Mesh(geometry, material);

function sprite(material: THREE.SpriteMaterial, scale: number, y: number) {
  const s = new THREE.Sprite(material);
  s.scale.setScalar(scale);
  s.position.y = y;
  return s;
}

/** Two crossed flame cards, which read as a volume from any angle. */
function flames(kit: CaveKit, width: number, height: number) {
  const group = new THREE.Group();
  for (const angle of [0, Math.PI / 2]) {
    const card = mesh(kit.geometry.flame, kit.m.flame);
    card.scale.set(width, height, 1);
    card.rotation.y = angle;
    group.add(card);
  }
  return group;
}

function shadow(kit: CaveKit, w: number, d: number) {
  const s = mesh(kit.geometry.floorPlane, kit.m.blob);
  s.scale.set(w, 1, d);
  s.position.y = 0.012;
  s.renderOrder = 1;
  return s;
}

// ---------------------------------------------------------------------------
// Hazards and pickups
// ---------------------------------------------------------------------------

/**
 * One hazard, sized to sit inside its own lane. Lanes are 1.55 m apart and
 * nothing here is wider than 1.5 m, so a blocked lane never looks as though it
 * spills into the lane beside it.
 */
export function buildObstacle(kit: CaveKit, kind: ObstacleKind, variant: number) {
  const { m, geometry: geo } = kit;
  const g = new THREE.Group();
  const v = variant % 4;
  switch (kind) {
    case "crate": {
      g.add(shadow(kit, 1.6, 1.4));
      const crate = mesh(geo.crate, m.crate);
      crate.position.y = 0.47;
      crate.rotation.y = (v - 1.5) * 0.07;
      g.add(crate);
      if (v % 2 === 1) {
        const jar = mesh(geo.amphora, m.terracotta);
        jar.position.set(0.66, 0, 0.3);
        jar.rotation.z = -0.12;
        g.add(jar);
      } else {
        const sack = mesh(geo.sphere, m.sack);
        sack.scale.set(0.3, 0.22, 0.26);
        sack.position.set(-0.5, 0.2, 0.42);
        g.add(sack);
      }
      break;
    }
    case "lowrock": {
      g.add(shadow(kit, 1.7, 1.5));
      const rock = mesh(geo.rocks[v], m.rock);
      rock.scale.set(0.72, 0.42, 0.62);
      rock.position.y = 0.2;
      rock.rotation.y = v * 1.3;
      g.add(rock);
      for (let i = 0; i < 2; i++) {
        const pebble = mesh(geo.rocksLow[(v + i) % 3], m.rock);
        pebble.scale.setScalar(0.16 + i * 0.05);
        pebble.position.set(i ? 0.55 : -0.58, 0.1, 0.3 - i * 0.5);
        g.add(pebble);
      }
      break;
    }
    case "boulder": {
      g.add(shadow(kit, 2.1, 1.8));
      const rock = mesh(geo.rocks[v], m.rock);
      rock.scale.setScalar(0.74);
      rock.position.y = 0.72;
      g.add(rock);
      g.userData.roll = rock;
      break;
    }
    case "pillar": {
      g.add(shadow(kit, 1.9, 1.7));
      const plinth = mesh(geo.unitBox, m.marble);
      plinth.scale.set(1.18, 0.26, 1.18);
      plinth.position.y = 0.13;
      g.add(plinth);
      const whole = v === 2;
      const shaft = mesh(whole ? geo.columnWhole : geo.columnBroken, m.marble);
      shaft.position.y = 0.26;
      shaft.rotation.y = v;
      if (!whole) shaft.rotation.z = (v - 1.5) * 0.04;
      g.add(shaft);
      if (whole) {
        const capital = mesh(geo.unitBox, m.marble);
        capital.scale.set(1.1, 0.26, 1.1);
        capital.position.y = 0.26 + 2.6 + 0.13;
        g.add(capital);
      }
      for (let i = 0; i < 2; i++) {
        const chip = mesh(geo.rocksLow[i], m.marble);
        chip.scale.setScalar(0.14 + i * 0.04);
        chip.position.set(i ? 0.55 : -0.5, 0.08, 0.5);
        g.add(chip);
      }
      break;
    }
    case "beam": {
      g.add(shadow(kit, 1.8, 0.9));
      for (const side of [-1, 1]) {
        const post = mesh(geo.unitBox, m.wood);
        post.scale.set(0.22, 1.95, 0.22);
        post.position.set(side * 0.66, 0.975, 0);
        g.add(post);
      }
      const beam = mesh(geo.unitBox, m.wood);
      beam.scale.set(1.66, 0.42, 0.46);
      beam.position.y = 1.36;
      g.add(beam);
      const band = mesh(geo.plane, m.meander);
      band.scale.set(1.62, 0.22, 1);
      band.position.set(0, 1.36, 0.235);
      g.add(band);
      for (const x of [-0.42, 0.42]) {
        const strap = mesh(geo.unitBox, m.bronze);
        strap.scale.set(0.07, 0.46, 0.5);
        strap.position.set(x, 1.36, 0);
        g.add(strap);
      }
      for (const x of [-0.25, 0.18]) {
        const vine = mesh(geo.vines[0], m.vine);
        vine.scale.set(0.6, 0.24, 1);
        vine.position.set(x, 1.16, 0.25);
        g.add(vine);
      }
      break;
    }
    case "debris": {
      g.add(shadow(kit, 1.6, 1.4));
      const pile = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const rock = mesh(geo.rocksLow[(v + i) % 3], m.rock);
        const s = 0.26 + hash01(i + v * 4) * 0.16;
        rock.scale.setScalar(s);
        rock.position.set((hash01(i * 3 + v) - 0.5) * 0.9, s * 0.7 + (i === 3 ? 0.25 : 0), (hash01(i * 7 + v) - 0.5) * 0.6);
        rock.rotation.set(i, i * 2, 0);
        pile.add(rock);
      }
      g.add(pile);
      g.userData.fall = pile;
      break;
    }
    case "fire": {
      const grate = mesh(geo.floorPlane, m.grate);
      grate.scale.set(1.42, 1, 1.42);
      grate.position.y = 0.014;
      grate.renderOrder = 1;
      g.add(grate);
      const tongues: THREE.Object3D[] = [];
      for (const x of [-0.38, 0, 0.38]) {
        const f = flames(kit, 0.62, 1.25);
        f.position.x = x;
        tongues.push(f);
        g.add(f);
      }
      g.add(sprite(kit.g.fire, 2.6, 0.7));
      g.userData.flames = tongues;
      break;
    }
    case "crack": {
      const hole = mesh(geo.floorPlane, m.hole);
      hole.scale.set(1.5, 1, 2.1);
      hole.position.y = 0.013;
      hole.renderOrder = 1;
      g.add(hole);
      // Broken slabs tipping into the gap make it read as a hole, not a stain.
      for (const [x, z, tip] of [[-0.42, 0.9, 0.45], [0.38, -0.92, -0.42]]) {
        const slab = mesh(geo.unitBox, m.block);
        slab.scale.set(0.62, 0.14, 0.46);
        slab.position.set(x, 0, z);
        slab.rotation.set(tip, v * 0.3, 0);
        g.add(slab);
      }
      for (let i = 0; i < 4; i++) {
        const rubble = mesh(geo.rocksLow[i % 3], m.block);
        rubble.scale.setScalar(0.1 + hash01(i + v) * 0.08);
        const a = (i / 4) * Math.PI * 2 + v + 0.6;
        rubble.position.set(Math.cos(a) * 0.78, 0.05, Math.sin(a) * 1.08);
        g.add(rubble);
      }
      g.add(sprite(kit.g.teal, 2.2, 0.12));
      break;
    }
  }
  return g;
}

/** A ram of Polyphemus' flock, facing the runner so its face reads at a glance. */
export function buildSheep(kit: CaveKit) {
  const { m, geometry: geo } = kit;
  const g = new THREE.Group();
  g.add(shadow(kit, 1.1, 1));
  const ring = mesh(geo.floorPlane, m.lifeRing);
  ring.scale.set(1.45, 1, 1.45);
  ring.position.y = 0.03;
  g.add(ring);
  const body = new THREE.Group();
  body.add(mesh(geo.sheepWool, m.wool), mesh(geo.sheepHorns, m.horn), mesh(geo.sheepEyes, m.eye));
  const head = mesh(geo.sphere, m.sheepSkin);
  head.scale.set(0.15, 0.15, 0.2);
  head.position.set(0, 0.72, 0.36);
  body.add(head);
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.15, 0.18], [0.15, 0.18], [-0.15, -0.2], [0.15, -0.2]]) {
    const leg = mesh(geo.leg, m.sheepSkin);
    leg.position.set(x, 0.44, z);
    legs.push(leg);
    body.add(leg);
  }
  g.add(body);
  g.add(sprite(kit.g.life, 1.7, 0.7));
  g.userData = { body, legs, ring };
  return g;
}

export function buildCoin(kit: CaveKit) {
  const g = new THREE.Group();
  const coin = mesh(kit.geometry.coin, [kit.m.coinEdge, kit.m.coinFace, kit.m.coinFace]);
  coin.position.y = 0.95;
  g.add(coin);
  g.add(sprite(kit.g.gold, 1.1, 0.95));
  g.userData.coin = coin;
  return g;
}

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

/** A bronze tripod brazier for the parapet, with its fire and glow. */
export function buildBrazier(kit: CaveKit) {
  const g = new THREE.Group();
  g.add(mesh(kit.geometry.brazier, kit.m.bronze));
  g.add(mesh(kit.geometry.coals, kit.m.coals));
  // A single camera-facing flame: a brazier is seen from one side only.
  const fire = new THREE.Sprite(kit.g.flame);
  fire.center.set(0.5, 0);
  fire.scale.set(0.62, 0.95, 1);
  fire.position.y = 0.84;
  const glow = sprite(kit.g.fire, 2.4, 1.15);
  g.add(fire, glow);
  g.userData = { fire, glow };
  return g;
}

/**
 * A monumental gate across the causeway: two piers rising out of the sea, a
 * lintel with the Greek key, a one-eyed guardian mask on each pier, and vines.
 * Variant 1 has lost half its lintel to the sea.
 */
export function buildGateway(kit: CaveKit, variant: number) {
  const { m, geometry: geo } = kit;
  const g = new THREE.Group();
  const top = 8.6;
  const pierH = top - WATER_Y;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * PIER_X;
    parts.push(box(1.35, pierH, 1.35, x, WATER_Y + pierH / 2, 0, 3));
    parts.push(box(1.8, 1.6, 1.8, x, WATER_Y + 0.8, 0, 3));
    parts.push(box(1.8, 0.6, 1.8, x, top + 0.3, 0, 3));
  }
  const broken = variant === 1;
  const span = PIER_X * 2 + 1.8;
  if (broken) {
    parts.push(box(span * 0.46, 1.1, 1.6, -span * 0.27, top + 1.15, 0, 3));
    // Fallen lintel stones in the water below the break.
    for (let i = 0; i < 3; i++) {
      const fallen = new THREE.BoxGeometry(1.6, 0.9, 1.2);
      boxUV(fallen, 1.6, 0.9, 1.2, 3);
      fallen.rotateX(0.3 * i).rotateY(0.5).rotateZ(0.2 + i * 0.3);
      fallen.translate(PIER_X + 1.6 + i * 1.3, WATER_Y + 0.2 + i * 0.1, (i - 1) * 1.4);
      parts.push(fallen);
    }
  } else parts.push(box(span, 1.1, 1.6, 0, top + 1.15, 0, 3));
  // Each gate is a handful of merged meshes, not a pile of small ones.
  g.add(mesh(mergeGeometries(parts)!, m.ashlar));
  parts.forEach(p => p.dispose());

  const band = mesh(geo.plane, m.meander);
  const bandW = broken ? span * 0.46 : span;
  band.scale.set(bandW, 0.5, 1);
  band.position.set(broken ? -span * 0.27 : 0, top + 1.15, 0.81);
  // Repeat the key along the band rather than stretching it.
  const bandUV = band.geometry.clone();
  const uv = bandUV.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (bandW / 1.6));
  band.geometry = bandUV;
  g.add(band);

  g.add(
    mesh(
      mergeGeometries([-1, 1].map(side => geo.plane.clone().scale(1.22, 1.52, 1).translate(side * PIER_X, 3.5, 0.68)))!,
      m.mask,
    ),
  );

  // The vines hang from one pivot along the lintel, so they sway together.
  const count = broken ? 3 : variant === 2 ? 8 : 5;
  const strands: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const x = broken ? -span * 0.5 + hash01(i * 5 + 1) * span * 0.45 : -span / 2 + 0.4 + hash01(i * 5 + variant) * (span - 0.8);
    strands.push(geo.vines[Math.floor(hash01(i + variant * 9) * 3)].clone().rotateY((hash01(i * 3) - 0.5) * 0.6).translate(x, 0, 0));
  }
  const vines = mesh(mergeGeometries(strands)!, m.vine);
  strands.forEach(strand => strand.dispose());
  vines.position.set(0, top + 0.6, 0.82);
  g.add(vines);
  g.userData = { vines };
  return g;
}

/** Ruins standing in the sea beside the causeway. Anchored at the waterline. */
export function buildRuin(kit: CaveKit, variant: number) {
  const { m, geometry: geo } = kit;
  const g = new THREE.Group();
  const type = variant % 5;
  if (type === 0) {
    const shaft = mesh(geo.columnBroken, m.marble);
    shaft.scale.set(1.4, 2.4, 1.4);
    g.add(shaft);
  } else if (type === 1) {
    for (const x of [-1.7, 1.7]) {
      const shaft = mesh(geo.columnWhole, m.marble);
      shaft.scale.set(1.25, 2.6, 1.25);
      shaft.position.x = x;
      g.add(shaft);
    }
    const architrave = mesh(geo.unitBox, m.ashlar);
    architrave.scale.set(4.9, 0.8, 1.3);
    architrave.position.y = 2.5 * 2.6 + 0.4;
    g.add(architrave);
  } else if (type === 2) {
    const shaft = mesh(geo.columnWhole, m.marble);
    shaft.scale.set(1.3, 2.2, 1.3);
    shaft.rotation.set(0.2, 0.5, Math.PI / 2 - 0.12);
    shaft.position.set(2.4, 0.2, 0);
    g.add(shaft);
  } else if (type === 3) {
    // A carved stele bearing the one-eyed guardian: the island's old warning.
    const block = mesh(geo.unitBox, m.ashlar);
    block.scale.set(2.6, 4.6, 1.6);
    block.position.y = 1.7;
    g.add(block);
    const face = mesh(geo.plane, m.mask);
    face.scale.set(2.1, 2.6, 1);
    face.position.set(0, 2.3, 0.81);
    g.add(face);
  } else {
    const spire = mesh(geo.rocks[variant % 4], m.rockDark);
    spire.scale.set(2.4, 5, 2.2);
    spire.position.y = 1.5;
    g.add(spire);
  }
  return g;
}

/** A great mass of rock rising from the sea: grotto walls inside, sea cliffs outside. */
export function buildCliff(kit: CaveKit, variant: number) {
  return mesh(kit.geometry.rocks[variant % 4], kit.m.cliff);
}

/**
 * Polyphemus' throwing arm, which rises into the top of the frame on the side
 * of the lane he has locked. Built in camera space: the world parents it to
 * the camera so it always enters from just above the view.
 */
export function buildArm(kit: CaveKit) {
  const { m, g: glows, geometry: geo } = kit;
  const g = new THREE.Group();
  // The glowing boulder is the focus, so it sits at the group's origin.
  const boulder = new THREE.Group();
  const rock = mesh(geo.rocks[1], m.boulder);
  rock.scale.setScalar(0.52);
  boulder.add(rock, sprite(glows.ember, 2.4, 0));
  g.add(boulder);
  // A hand gripping it from behind, fingers curled over its crown.
  const palm = mesh(geo.sphere, m.skin);
  palm.scale.set(0.54, 0.34, 0.5);
  palm.position.set(0, 0.5, -0.3);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const finger = mesh(geo.sphere, m.skin);
    finger.scale.set(0.1, 0.11, 0.32);
    finger.position.set(-0.3 + i * 0.2, 0.52 - Math.abs(i - 1.5) * 0.05, 0.04);
    finger.rotation.x = 0.7;
    g.add(finger);
  }
  const thumb = mesh(geo.sphere, m.skin);
  thumb.scale.set(0.12, 0.27, 0.12);
  thumb.position.set(-0.52, 0.2, -0.1);
  thumb.rotation.z = 0.5;
  g.add(thumb);
  // A bronze cuff at the wrist, and the forearm rising up and back, out of frame.
  const arm = new THREE.Group();
  arm.position.set(0, 0.6, -0.35);
  arm.rotation.x = 0.55;
  const cuff = mesh(new THREE.TorusGeometry(0.42, 0.09, 8, 18).rotateX(Math.PI / 2), m.bronze);
  cuff.position.y = 0.45;
  const forearm = mesh(new THREE.CylinderGeometry(0.38, 0.52, 3.6, 12).translate(0, 1.8, 0), m.skin);
  arm.add(forearm, cuff);
  g.add(arm);
  g.userData = { boulder };
  return g;
}

/** The thrown boulder in flight, with its own glow. */
export function buildThrown(kit: CaveKit) {
  const g = new THREE.Group();
  const rock = mesh(kit.geometry.rocks[2], kit.m.boulder);
  rock.scale.setScalar(0.9);
  g.add(rock);
  g.add(sprite(kit.g.ember, 3.4, 0));
  g.userData.rock = rock;
  return g;
}
