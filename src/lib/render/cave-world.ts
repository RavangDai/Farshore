// Cyclops' Cave in 3D.
//
// A sunlit-stone causeway through Polyphemus' sea grotto, seen from behind
// Odysseus the way the classic temple runners frame it: paved lanes with
// bronze inlays, chunky parapet blocks, gate piers with one-eyed masks,
// glowing caustics on the sea below, and finally the cave mouth and daylight.
//
// The rule from the 2D renderer still holds: nothing here reads back into the
// simulation. The world is placed from a state snapshot every frame. World
// space is measured from Odysseus: he stands at the origin, `-z` is ahead,
// and an entity `z` metres ahead in the engine sits at `-z` here. Scenery is
// keyed to absolute distance travelled, so a given gate or brazier keeps its
// place as it streams toward the camera.
//
// A 2D canvas laid over the WebGL one carries the arcade layer: prompts,
// score pops, particles and the danger vignette.

import * as THREE from "three";
import {
  AVOIDANCE,
  JUMP_MS,
  LANE_SPAN,
  SLIDE_MS,
  SPAWN_Z,
  START_GAP,
  caveProgress,
  type CaveState,
} from "../encounters/cave-runner.ts";
import type { CaveSceneOptions } from "./cave-scene.ts";
import { EventStamp, Particles, clamp, clamp01, easeOut, hash01, lerp, roundedRect, type StageFrame } from "./stage.ts";
import { FLOOR_PERIOD, LANE_WIDTH, PATH_WIDTH, paintCaveTextures, type CaveTextures } from "./cave-textures.ts";
import {
  OBSTACLE_HEIGHT,
  PATH_HALF,
  SLAB_HALF,
  WATER_Y,
  buildArm,
  buildBrazier,
  buildCliff,
  buildCoin,
  buildGateway,
  buildKit,
  buildObstacle,
  buildRuin,
  buildSheep,
  buildThrown,
  type CaveKit,
} from "./cave-props.ts";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Metres of world kept behind Odysseus (under the camera). */
const BEHIND = 14;
/** Metres of world kept ahead. Fog hides the far edge. */
const AHEAD = 130;
const STRIP = AHEAD + BEHIND;
/** Parapet blocks: centre line and spacing along the causeway. */
const PARAPET_X = PATH_HALF + 0.31;
const PARAPET_STEP = 1.32;
const BRAZIER_EVERY = 9;
const GATE_STEP = 36;
const RUIN_STEP = 13;
const CLIFF_STEP = 17;
const CEILING_STEP = 26;
const CEILING_Y = 15.5;
const STALACTITE_STEP = 1.7;
const SHAFT_STEP = 44;
/** Where a thrown boulder lands, metres ahead of Odysseus. */
const IMPACT_AHEAD = 1.2;
const PIXEL_FONT = `"Pixel", "Press Start 2P", monospace`;

const laneCentre = (lane: number) => (lane - 1) * LANE_WIDTH;
const HURT = new THREE.Color(0xff6a5a);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Mood: the light of each stretch of the escape
// ---------------------------------------------------------------------------

type Mood = {
  fog: THREE.Color;
  near: number;
  far: number;
  sky: THREE.Color;
  ground: THREE.Color;
  hemi: number;
  sun: THREE.Color;
  sunI: number;
  water: THREE.Color;
  caustic: THREE.Color;
  torch: number;
  hero: THREE.Color;
  motes: THREE.Color;
  shafts: number;
};

const mood = (m: { fog: number; near: number; far: number; sky: number; ground: number; hemi: number; sun: number; sunI: number; water: number; caustic: number; torch: number; hero: number; motes: number; shafts: number }): Mood => ({
  ...m,
  fog: new THREE.Color(m.fog),
  sky: new THREE.Color(m.sky),
  ground: new THREE.Color(m.ground),
  sun: new THREE.Color(m.sun),
  water: new THREE.Color(m.water),
  caustic: new THREE.Color(m.caustic),
  hero: new THREE.Color(m.hero),
  motes: new THREE.Color(m.motes),
});

/** Inside the grotto: teal haze, torchlit stone, the sea glowing below. */
const GROTTO = mood({ fog: 0x173a42, near: 16, far: 96, sky: 0x7fb6bb, ground: 0x3e2c18, hemi: 1.7, sun: 0xc8ecea, sunI: 1.25, water: 0x0e4750, caustic: 0x46d8cc, torch: 1, hero: 0xeadfce, motes: 0xc6f7ef, shafts: 1 });
/** The roof coming down: dust, ember light, a red sea. */
const COLLAPSE = mood({ fog: 0x3d2416, near: 12, far: 84, sky: 0xd09a62, ground: 0x3c1c0e, hemi: 1.45, sun: 0xffb074, sunI: 1.1, water: 0x1d3134, caustic: 0xb98452, torch: 1.3, hero: 0xf2d6be, motes: 0xffaf62, shafts: 0.35 });
/** Out through the mouth: open sky and the bright sea. */
const DAYLIGHT = mood({ fog: 0x9fd4e0, near: 34, far: 170, sky: 0xd4f0fb, ground: 0x957040, hemi: 1.55, sun: 0xfff1d2, sunI: 2.7, water: 0x168c98, caustic: 0x9ff5ea, torch: 0.3, hero: 0xffffff, motes: 0xfff6dc, shafts: 0 });

function mixMood(out: Mood, a: Mood, b: Mood, t: number) {
  out.fog.copy(a.fog).lerp(b.fog, t);
  out.sky.copy(a.sky).lerp(b.sky, t);
  out.ground.copy(a.ground).lerp(b.ground, t);
  out.sun.copy(a.sun).lerp(b.sun, t);
  out.water.copy(a.water).lerp(b.water, t);
  out.caustic.copy(a.caustic).lerp(b.caustic, t);
  out.hero.copy(a.hero).lerp(b.hero, t);
  out.motes.copy(a.motes).lerp(b.motes, t);
  out.near = lerp(a.near, b.near, t);
  out.far = lerp(a.far, b.far, t);
  out.hemi = lerp(a.hemi, b.hemi, t);
  out.sunI = lerp(a.sunI, b.sunI, t);
  out.torch = lerp(a.torch, b.torch, t);
  out.shafts = lerp(a.shafts, b.shafts, t);
  return out;
}

const cloneMood = (m: Mood) => mixMood(mood({ fog: 0, near: 0, far: 0, sky: 0, ground: 0, hemi: 0, sun: 0, sunI: 0, water: 0, caustic: 0, torch: 0, hero: 0, motes: 0, shafts: 0 }), m, m, 0);

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

/**
 * Objects keyed by an absolute slot index along the causeway. A slot keeps its
 * object while visible, so a gate never swaps art as it approaches; objects
 * are built lazily per variant and recycled when their slot scrolls away.
 */
class SlotPool<T extends THREE.Object3D> {
  private live = new Map<number, T>();
  private spare = new Map<number, T[]>();
  private build: (variant: number) => T;
  private parent: THREE.Object3D;
  constructor(parent: THREE.Object3D, build: (variant: number) => T) {
    this.parent = parent;
    this.build = build;
  }
  /** Mark the start of a frame: every live slot is a candidate for release. */
  private touched = new Set<number>();
  begin() {
    this.touched.clear();
  }
  take(slot: number, variant: number): T {
    this.touched.add(slot);
    let item = this.live.get(slot);
    if (item && item.userData.variant === variant) return item;
    if (item) this.release(slot, item);
    item = this.spare.get(variant)?.pop() ?? this.build(variant);
    item.userData.variant = variant;
    item.visible = true;
    if (!item.parent) this.parent.add(item);
    this.live.set(slot, item);
    return item;
  }
  private release(slot: number, item: T) {
    item.visible = false;
    this.live.delete(slot);
    const list = this.spare.get(item.userData.variant as number) ?? [];
    list.push(item);
    this.spare.set(item.userData.variant as number, list);
  }
  /** Release every slot not taken since `begin`. */
  end() {
    for (const [slot, item] of this.live) if (!this.touched.has(slot)) this.release(slot, item);
  }
}

/** Absolute slot indices from `BEHIND` metres back to `AHEAD` metres forward. */
function slotRange(distance: number, step: number, behind = BEHIND, ahead = AHEAD) {
  return [Math.ceil((distance - behind) / step), Math.floor((distance + ahead) / step)] as const;
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

export type CaveWorldOptions = CaveSceneOptions;

type ScreenPoint = { x: number; y: number; on: boolean };

export class CaveWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 420);
  private overlay: HTMLCanvasElement;
  private host: HTMLElement;
  private glCanvas: HTMLCanvasElement;
  private textures: CaveTextures;
  private kit: CaveKit;
  private mood = cloneMood(GROTTO);

  // Lights.
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private torches: THREE.PointLight[] = [];

  // Fixed pieces that scroll their textures rather than moving.
  private floor: THREE.Mesh;
  private beds: THREE.Mesh[] = [];
  private water: THREE.Mesh;
  private caustics: THREE.Mesh[] = [];
  private foam: THREE.Mesh[] = [];
  private sky: THREE.Mesh;
  private sunGlow: THREE.Sprite;

  // Streamed scenery.
  private parapets: THREE.InstancedMesh;
  private stalactites: THREE.InstancedMesh;
  private braziers: SlotPool<THREE.Group>;
  private gates: SlotPool<THREE.Group>;
  private ruins: SlotPool<THREE.Group>;
  private cliffs: SlotPool<THREE.Mesh>;
  private ceilings: SlotPool<THREE.Mesh>;
  private shafts: SlotPool<THREE.Group>;
  private mouth: THREE.Group;
  private motes: THREE.Points;
  private moteSeeds: Float32Array;
  private falling: { mesh: THREE.Mesh; x: number; y: number; z: number; vy: number; active: boolean }[] = [];

  // Actors.
  private hero: THREE.Mesh;
  private heroShadow: THREE.Mesh;
  private heroMaterial: THREE.MeshBasicMaterial;
  private heroSource: HTMLImageElement | null = null;
  private giant: THREE.Mesh;
  private arm: THREE.Group;
  private telegraph: THREE.Mesh;
  private target: THREE.Mesh;
  private obstacles = new Map<number, THREE.Group>();
  private sheep = new Map<number, THREE.Group>();
  private coins = new Map<number, THREE.Group>();
  private thrown = new Map<number, { group: THREE.Group; shadow: THREE.Mesh; landedAt: number }>();

  // Presentation-only bookkeeping.
  private particles = new Particles(260);
  private hitStamp = new EventStamp();
  private landStamp = new EventStamp();
  private pickupStamp = new EventStamp();
  private mouthAt: number | null = null;
  private lastDistance = 0;
  private lastElapsed = 0;
  private footDistance = 0;
  private settled = new Set<number>();
  private size = { w: 0, h: 0, ratio: 1 };
  private maxRatio: number;
  private slowFrames = 0;
  private lastFrameAt = 0;
  private v = new THREE.Vector3();
  private scratch = { matrix: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), sc: new THREE.Vector3(), colour: new THREE.Color() };

  constructor(host: HTMLElement, overlay: HTMLCanvasElement) {
    this.host = host;
    this.overlay = overlay;
    this.glCanvas = document.createElement("canvas");
    this.glCanvas.className = "fs-cave-canvas fs-cave-gl";
    this.glCanvas.setAttribute("aria-hidden", "true");
    host.insertBefore(this.glCanvas, overlay);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: true, powerPreference: "high-performance" });
    } catch (error) {
      this.glCanvas.remove();
      throw error;
    }
    // Neutral keeps the stone warm and the sea teal where ACES would bleach them.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.maxRatio = Math.min(1.75, window.devicePixelRatio || 1);
    this.size.ratio = this.maxRatio;

    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures = paintCaveTextures(anisotropy);
    this.kit = buildKit(this.textures);
    const { m, geometry } = this.kit;
    const t = this.textures;

    this.scene.fog = new THREE.Fog(GROTTO.fog, GROTTO.near, GROTTO.far);
    this.scene.background = GROTTO.fog.clone();
    this.scene.add(this.hemi, this.sun, this.sun.target, this.camera);
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffa04a, 0, 12, 1.6);
      this.torches.push(light);
      this.scene.add(light);
    }

    // --- Causeway -------------------------------------------------------
    t.floor.repeat.set(1, STRIP / FLOOR_PERIOD);
    t.floorBump.repeat.copy(t.floor.repeat);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(PATH_WIDTH, STRIP).rotateX(-Math.PI / 2), m.floor);
    this.floor.position.z = -(STRIP / 2 - BEHIND);
    this.scene.add(this.floor);

    // The parapet bed: the strip of crown between the paving and the sea wall.
    const bedTexture = t.mossTop.clone();
    bedTexture.repeat.set(1, STRIP / 1.4);
    bedTexture.needsUpdate = true;
    const bedMaterial = new THREE.MeshStandardMaterial({ map: bedTexture, roughness: 1 });
    for (const side of [-1, 1]) {
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(SLAB_HALF - PATH_HALF, STRIP).rotateX(-Math.PI / 2), bedMaterial);
      bed.position.set(side * (PATH_HALF + SLAB_HALF) / 2, 0, this.floor.position.z);
      this.beds.push(bed);
      this.scene.add(bed);
    }

    // --- Sea ------------------------------------------------------------
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(460, 460).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: GROTTO.water }));
    this.water.position.set(0, WATER_Y, -120);
    this.scene.add(this.water);
    // Two caustic layers drifting against each other. They fade toward the
    // horizon through vertex colour, because additive layers and fog do not mix.
    for (const [scale, lift] of [[10, 0.02], [14.5, 0.04]] as const) {
      const geometry = new THREE.PlaneGeometry(300, 300, 30, 30).rotateX(-Math.PI / 2);
      const colours = new Float32Array(geometry.getAttribute("position").count * 3);
      const position = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        const d = Math.hypot(position.getX(i), position.getZ(i) - 120);
        const fade = Math.pow(clamp01(1 - d / 130), 1.4);
        colours.set([fade, fade, fade], i * 3);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      const map = t.caustics.clone();
      map.repeat.set(300 / scale, 300 / scale);
      map.needsUpdate = true;
      const layer = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ map, color: GROTTO.caustic, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      );
      layer.position.set(0, WATER_Y + lift, -120);
      layer.userData.scale = scale;
      this.caustics.push(layer);
      this.scene.add(layer);
    }
    // Surf where the sea meets the wall.
    for (const side of [-1, 1]) {
      const geometry = new THREE.PlaneGeometry(STRIP, 1.4).rotateX(-Math.PI / 2).rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      const map = t.foam.clone();
      map.repeat.set(STRIP / 7, 1);
      map.needsUpdate = true;
      const strip = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0.8 }));
      strip.position.set(side * (SLAB_HALF + 0.7), WATER_Y + 0.06, this.floor.position.z);
      strip.userData.side = side;
      this.foam.push(strip);
      this.scene.add(strip);
    }

    // --- Sky, for once the cave is behind us ---------------------------
    const skyGeometry = new THREE.SphereGeometry(360, 32, 16);
    const skyColours = new Float32Array(skyGeometry.getAttribute("position").count * 3);
    const skyPosition = skyGeometry.getAttribute("position") as THREE.BufferAttribute;
    const zenith = new THREE.Color(0x3f8fce);
    const horizon = new THREE.Color(0xd2ecf0);
    const sea = new THREE.Color(0x9fd4e0);
    const c = new THREE.Color();
    for (let i = 0; i < skyPosition.count; i++) {
      const y = skyPosition.getY(i) / 360;
      if (y >= 0) c.copy(horizon).lerp(zenith, Math.pow(y, 0.55));
      else c.copy(horizon).lerp(sea, clamp01(-y * 6));
      skyColours.set([c.r, c.g, c.b], i * 3);
    }
    skyGeometry.setAttribute("color", new THREE.BufferAttribute(skyColours, 3));
    this.sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0 }));
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.glow, color: 0xfff2c8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
    this.sunGlow.scale.setScalar(70);
    this.scene.add(this.sunGlow);

    // --- Streamed scenery ----------------------------------------------
    // Two draws for every parapet block on the causeway: the mossy tops, then
    // the stone sides. BoxGeometry lists its faces +x, -x, +y, -y, +z, -z, so the
    // top face is moved to the front of the index buffer.
    const block = geometry.unitBox.clone();
    const index = Array.from(block.getIndex()!.array);
    block.setIndex([2, 0, 1, 3, 4, 5].flatMap(face => index.slice(face * 6, face * 6 + 6)));
    block.clearGroups();
    block.addGroup(0, 6, 1);
    block.addGroup(6, 30, 0);
    this.parapets = new THREE.InstancedMesh(block, [m.block, m.mossTop], 2 * Math.ceil(STRIP / PARAPET_STEP) + 6);
    this.parapets.frustumCulled = false;
    this.scene.add(this.parapets);

    this.stalactites = new THREE.InstancedMesh(geometry.stalactite, m.rockDark, Math.ceil(STRIP / STALACTITE_STEP) + 4);
    this.stalactites.frustumCulled = false;
    this.scene.add(this.stalactites);

    this.braziers = new SlotPool(this.scene, () => buildBrazier(this.kit));
    this.gates = new SlotPool(this.scene, variant => buildGateway(this.kit, variant));
    this.ruins = new SlotPool(this.scene, variant => buildRuin(this.kit, variant));
    this.cliffs = new SlotPool(this.scene, variant => buildCliff(this.kit, variant));
    const ceilingGeometry = new THREE.PlaneGeometry(60, CEILING_STEP + 0.5).rotateX(Math.PI / 2);
    const ceilingUV = ceilingGeometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < ceilingUV.count; i++) ceilingUV.setXY(i, ceilingUV.getX(i) * 7, ceilingUV.getY(i) * 3);
    this.ceilings = new SlotPool(this.scene, () => new THREE.Mesh(ceilingGeometry, m.rockDark));
    const shaftMaterial = new THREE.MeshBasicMaterial({ map: t.shaft, color: 0xcff6ef, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, opacity: 0.2 });
    this.shafts = new SlotPool(this.scene, () => {
      const group = new THREE.Group();
      for (const angle of [0.6, -0.6]) {
        const card = new THREE.Mesh(geometry.plane, shaftMaterial);
        card.scale.set(4.2, CEILING_Y + 2, 1);
        card.position.y = (CEILING_Y + 2) / 2 - 1;
        card.rotation.y = angle;
        group.add(card);
      }
      group.rotation.z = 0.22;
      return group;
    });
    this.mouth = this.buildMouth();
    this.scene.add(this.mouth);

    // Motes: dust in the torchlight, embers in the collapse, spray in the sun.
    const moteCount = 240;
    this.moteSeeds = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount * 3; i++) this.moteSeeds[i] = hash01(i * 1.7 + 3);
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(moteCount * 3), 3));
    this.motes = new THREE.Points(
      moteGeometry,
      new THREE.PointsMaterial({ map: t.glow, size: 0.11, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.8 }),
    );
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);

    for (let i = 0; i < 4; i++) {
      const rock = new THREE.Mesh(geometry.rocksLow[i % 3], m.rockDark);
      rock.visible = false;
      this.scene.add(rock);
      this.falling.push({ mesh: rock, x: 0, y: 0, z: 0, vy: 0, active: false });
    }

    // --- Actors ---------------------------------------------------------
    this.heroMaterial = new THREE.MeshBasicMaterial({ map: heroTexture(null), transparent: true, alphaTest: 0.32 });
    const heroGeometry = new THREE.PlaneGeometry(2.2, 2.2).translate(0, 1.1 - 0.1, 0);
    this.hero = new THREE.Mesh(heroGeometry, this.heroMaterial);
    this.hero.renderOrder = 2;
    this.scene.add(this.hero);
    this.heroShadow = new THREE.Mesh(geometry.floorPlane, m.blob);
    this.heroShadow.renderOrder = 1;
    this.scene.add(this.heroShadow);

    this.giant = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 10.8).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: t.giant, color: 0x000000, transparent: true, depthWrite: false, opacity: 0 }),
    );
    this.giant.renderOrder = 1;
    this.scene.add(this.giant);

    this.arm = buildArm(this.kit);
    this.arm.visible = false;
    this.camera.add(this.arm);

    t.chevrons.repeat.set(1, 44 / 1.7);
    this.telegraph = new THREE.Mesh(geometry.floorPlane, m.telegraph);
    this.telegraph.scale.set(1.38, 1, 44);
    this.telegraph.renderOrder = 3;
    this.telegraph.visible = false;
    this.scene.add(this.telegraph);
    this.target = new THREE.Mesh(geometry.floorPlane, m.target);
    this.target.renderOrder = 3;
    this.target.visible = false;
    this.scene.add(this.target);
  }

  /** The cave mouth: a rock wall with an arched opening onto daylight. */
  private buildMouth() {
    const { m, g, geometry } = this.kit;
    const group = new THREE.Group();
    const outer = new THREE.Shape();
    outer.moveTo(-90, WATER_Y - 2);
    outer.lineTo(90, WATER_Y - 2);
    outer.lineTo(90, 70);
    outer.lineTo(-90, 70);
    outer.closePath();
    const hole = new THREE.Path();
    // Low enough that the rock above the arch frames the view on the approach.
    const half = 8.5;
    const spring = 4.5;
    hole.moveTo(-half, WATER_Y - 1);
    hole.lineTo(-half, spring);
    hole.absarc(0, spring, half, Math.PI, 0, true);
    hole.lineTo(half, WATER_Y - 1);
    hole.closePath();
    outer.holes.push(hole);
    const wallGeometry = new THREE.ShapeGeometry(outer, 24);
    const uv = wallGeometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 9, uv.getY(i) / 9);
    group.add(new THREE.Mesh(wallGeometry, m.rockDark));
    // A rugged rim of boulders around the arch.
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      const rock = new THREE.Mesh(geometry.rocks[i % 4], m.rock);
      const s = 1.3 + hash01(i * 3) * 1.1;
      rock.scale.set(s, s * 1.2, s);
      rock.position.set(Math.cos(a) * (half + 0.6), spring + Math.sin(a) * (half + 0.6), 0.8);
      group.add(rock);
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const rock = new THREE.Mesh(geometry.rocks[(k + 2) % 4], m.rock);
        rock.scale.set(1.8, 2.4, 1.8);
        rock.position.set(side * (half + 0.8), WATER_Y + 2.4 + k * 2.8, 1);
        group.add(rock);
      }
    }
    // Daylight pouring through: bright enough to read through the haze.
    const light = new THREE.Sprite(g.sun.clone());
    light.material.fog = false;
    light.scale.set(34, 30, 1);
    light.position.set(0, 4, -6);
    group.add(light);
    group.userData.light = light;
    group.visible = false;
    return group;
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  render(s: CaveState, frame: StageFrame, options: CaveWorldOptions) {
    const now = options.still ? 0 : frame.now;
    // A retry can reuse this view; ids and event stamps restart with the run.
    if (s.elapsed + 500 < this.lastElapsed) this.resetRun();
    this.lastElapsed = s.elapsed;
    this.resize();
    this.governQuality();
    this.syncHeroSprite(options.sprites.hero);

    const progress = caveProgress(s);
    this.placeMouth(s, progress);
    const outside = this.mouthAt === null ? 0 : smooth(this.mouthAt - 6, this.mouthAt + 34, s.distance);
    const collapse = smooth(0.37, 0.46, progress) * (1 - outside);
    mixMood(this.mood, GROTTO, COLLAPSE, collapse);
    mixMood(this.mood, this.mood, DAYLIGHT, outside);
    this.applyMood(outside);

    const travelled = Math.max(0, s.distance - this.lastDistance);
    this.lastDistance = s.distance;

    this.placeCamera(s, now, options, collapse);
    this.scrollSurfaces(s.distance, now);
    this.streamScenery(s.distance, now, outside, options);
    this.placeHero(s, now, options);
    this.placeGiant(s, now, options);
    this.placeEntities(s, now);
    this.placeThrows(s, now);
    this.placeTelegraph(s, now);
    this.animateMotes(s.distance, now, collapse, outside, options);
    this.animateFalling(travelled, frame.dt, collapse, options);

    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(s, frame, now, options, travelled, collapse);
  }

  private resetRun() {
    for (const view of [...this.obstacles.values(), ...this.sheep.values(), ...this.coins.values()]) this.scene.remove(view);
    for (const view of this.thrown.values()) this.scene.remove(view.group, view.shadow);
    this.obstacles.clear();
    this.sheep.clear();
    this.coins.clear();
    this.thrown.clear();
    this.settled.clear();
    this.particles.clear();
    this.hitStamp.reset();
    this.landStamp.reset();
    this.pickupStamp.reset();
    this.mouthAt = null;
    this.lastDistance = 0;
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    if (w === this.size.w && h === this.size.h && this.renderer.getPixelRatio() === this.size.ratio) return;
    this.size.w = w;
    this.size.h = h;
    this.renderer.setPixelRatio(this.size.ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Drop the render resolution on a machine that cannot hold the frame rate.
   * It only steps down, so the picture never oscillates.
   */
  private governQuality() {
    const at = performance.now();
    const gap = this.lastFrameAt ? at - this.lastFrameAt : 16;
    this.lastFrameAt = at;
    if (gap > 120) return;
    this.slowFrames = gap > 24 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90 && this.size.ratio > 0.75) {
      this.size.ratio = Math.max(0.75, this.size.ratio - 0.25);
      this.slowFrames = 0;
    }
  }

  private syncHeroSprite(image: HTMLImageElement | null) {
    if (!image || image === this.heroSource || !image.complete || !image.naturalWidth) return;
    this.heroSource = image;
    this.heroMaterial.map?.dispose();
    this.heroMaterial.map = heroTexture(image);
    this.heroMaterial.needsUpdate = true;
  }

  /** Fix where the cave ends, once, shortly before the daylight stretch begins. */
  private placeMouth(s: CaveState, progress: number) {
    if (this.mouthAt !== null || progress < 0.68) return;
    const remaining = Math.max(0, 0.78 * s.duration - s.elapsed);
    // Speed keeps ramping; the average over the remaining stretch is close enough.
    const average = s.speed + 0.0011 * remaining * 0.5;
    this.mouthAt = s.distance + (average * remaining) / 1000 + (remaining > 0 ? 0 : 40);
  }

  private applyMood(outside: number) {
    const mo = this.mood;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(mo.fog);
    fog.near = mo.near;
    fog.far = mo.far;
    (this.scene.background as THREE.Color).copy(mo.fog);
    this.hemi.color.copy(mo.sky);
    this.hemi.groundColor.copy(mo.ground);
    this.hemi.intensity = mo.hemi;
    this.sun.color.copy(mo.sun);
    this.sun.intensity = mo.sunI;
    (this.water.material as THREE.MeshBasicMaterial).color.copy(mo.water);
    for (const layer of this.caustics) (layer.material as THREE.MeshBasicMaterial).color.copy(mo.caustic).multiplyScalar(0.42);
    this.heroMaterial.color.copy(mo.hero);
    (this.sky.material as THREE.MeshBasicMaterial).opacity = outside;
    this.sky.visible = outside > 0.01;
    (this.sunGlow.material as THREE.SpriteMaterial).opacity = outside * 0.75;
    this.sunGlow.visible = outside > 0.01;
  }

  private placeCamera(s: CaveState, now: number, options: CaveWorldOptions, collapse: number) {
    const heroX = s.laneX * LANE_WIDTH;
    const lift = s.jump > 0 ? Math.sin((1 - s.jump / JUMP_MS) * Math.PI) * 1.55 : 0;
    const strength = options.shakeStrength;
    const shake = Math.min(1, s.shake / 420) * strength;
    // Polyphemus' footfalls thud through the floor once he is close.
    const near = clamp01(1 - (s.cyclops.gap - 8) / (START_GAP - 8));
    const step = (s.cyclops.stride / 1000) * Math.PI * 2;
    const thud = options.still ? 0 : Math.pow(Math.max(0, Math.cos(step * 2)), 16) * near * near * 0.12 * strength;
    const rumble = options.still ? 0 : collapse * 0.025 * strength;
    const sx = Math.sin(now * 0.08) * 0.16 * shake + Math.sin(now * 0.043) * rumble;
    const sy = Math.cos(now * 0.113) * 0.11 * shake + Math.cos(now * 0.057) * rumble - thud;
    const run = options.still || s.jump > 0 ? 0 : Math.abs(Math.sin((s.distance / 1.9) * Math.PI)) * 0.035;
    this.camera.position.set(heroX * 0.55 + sx, 3.75 + lift * 0.28 + run + sy, 5.7);
    this.camera.lookAt(heroX * 0.72, 0.55 + lift * 0.22, -9.5);
    // A little roll into a lane change: pure arcade, and it sells the move.
    const pull = clamp((s.lane - 1) * LANE_SPAN - s.laneX, -1, 1);
    if (!options.still) this.camera.rotateZ(-pull * 0.035 * strength);
    const aspect = this.size.w / Math.max(1, this.size.h);
    // Narrow frames widen the lens so all three lanes and the parapets stay in shot.
    const base = aspect >= 1.6 ? 56 : 56 + (1.6 - aspect) * 26;
    const fov = Math.min(84, base + clamp01((s.speed - 15) / 13) * 5);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }

  private scrollSurfaces(distance: number, now: number) {
    const t = this.textures;
    t.floor.offset.y = (distance / FLOOR_PERIOD) % 1;
    t.floorBump.offset.y = t.floor.offset.y;
    const bed = (this.beds[0].material as THREE.MeshStandardMaterial).map;
    if (bed) bed.offset.y = (distance / 1.4) % 1;
    this.caustics.forEach((layer, i) => {
      const map = (layer.material as THREE.MeshBasicMaterial).map;
      if (!map) return;
      const scale = layer.userData.scale as number;
      const drift = now * 0.00002 * (i ? -1 : 1);
      map.offset.set(drift + i * 0.37, ((distance / scale) % 1) + drift * 0.6);
    });
    for (const strip of this.foam) {
      const material = strip.material as THREE.MeshBasicMaterial;
      if (material.map) material.map.offset.x = ((distance / 7) % 1) * (strip.userData.side > 0 ? 1 : -1) + now * 0.00004;
      material.opacity = 0.55 + Math.sin(now * 0.0016 + strip.userData.side) * 0.2;
    }
  }

  // -------------------------------------------------------------------------
  // Scenery
  // -------------------------------------------------------------------------

  private streamScenery(distance: number, now: number, outside: number, options: CaveWorldOptions) {
    const inside = (at: number) => this.mouthAt === null || at < this.mouthAt;
    const z = (at: number) => -(at - distance);
    const { matrix, q, e, p, sc, colour } = this.scratch;

    // Parapet blocks, with the odd one missing or broken, and braziers on top.
    const [p0, p1] = slotRange(distance, PARAPET_STEP);
    let count = 0;
    const blockTop = new Map<number, number>();
    this.braziers.begin();
    for (let n = p0; n <= p1; n++) {
      for (const side of [-1, 1]) {
        const h = hash01(n * 2 + (side > 0 ? 1 : 0) + 7);
        const brazier = n % BRAZIER_EVERY === 0 && (Math.floor(n / BRAZIER_EVERY) % 2 === 0 ? -1 : 1) === side;
        if (h < 0.05 && !brazier) continue;
        const broken = h < 0.13 && !brazier;
        const height = (0.68 + hash01(n * 3.1 + side) * 0.3) * (broken ? 0.55 : 1);
        e.set(broken ? (hash01(n) - 0.5) * 0.3 : 0, (hash01(n * 1.3 + side) - 0.5) * 0.08, broken ? side * 0.12 : 0);
        q.setFromEuler(e);
        p.set(side * PARAPET_X + (hash01(n * 5 + side) - 0.5) * 0.05, height / 2 - (broken ? 0.06 : 0), z(n * PARAPET_STEP));
        sc.set(0.56, height, 1.06);
        matrix.compose(p, q, sc);
        this.parapets.setMatrixAt(count, matrix);
        colour.setScalar(0.86 + hash01(n * 7 + side) * 0.24);
        this.parapets.setColorAt(count, colour);
        count++;
        if (brazier) blockTop.set(n, height);
      }
    }
    this.parapets.count = count;
    this.parapets.instanceMatrix.needsUpdate = true;
    if (this.parapets.instanceColor) this.parapets.instanceColor.needsUpdate = true;

    const lit: { x: number; y: number; z: number }[] = [];
    for (const [n, height] of blockTop) {
      const side = Math.floor(n / BRAZIER_EVERY) % 2 === 0 ? -1 : 1;
      const at = z(n * PARAPET_STEP);
      // Past the haze a brazier is only a dot; it is not worth its draw calls.
      if (-at > this.mood.far) continue;
      const brazier = this.braziers.take(n, 0);
      brazier.position.set(side * PARAPET_X, height, at);
      const fire = brazier.userData.fire as THREE.Object3D;
      const flicker = options.still ? 1 : 0.85 + Math.sin(now * 0.017 + n) * 0.1 + Math.sin(now * 0.041 + n * 2) * 0.07;
      fire.scale.set(0.62, 0.95 * flicker, 1);
      const fade = clamp01((95 - -at) / 30);
      (brazier.userData.glow as THREE.Sprite).scale.setScalar(2.4 * fade * flicker);
      fire.visible = fade > 0.02;
      lit.push({ x: side * PARAPET_X * 0.92, y: height + 1.2, z: at });
    }
    this.braziers.end();
    this.assignTorchLights(lit, now, options);

    // Gates: the monuments that frame the run.
    const [g0, g1] = slotRange(distance, GATE_STEP, BEHIND + 4, AHEAD + 10);
    this.gates.begin();
    for (let n = g0; n <= g1; n++) {
      if (n <= 0 || hash01(n * 5.3) > 0.74) continue;
      const gate = this.gates.take(n, Math.floor(hash01(n * 2.9) * 3));
      gate.position.set(0, 0, z(n * GATE_STEP + 4));
      if (!options.still) {
        (gate.userData.vines as THREE.Object3D).rotation.x = Math.sin(now * 0.0011 + n) * 0.06;
      }
    }
    this.gates.end();

    // Ruins standing in the sea.
    const [r0, r1] = slotRange(distance, RUIN_STEP, BEHIND, AHEAD + 20);
    this.ruins.begin();
    for (let n = r0; n <= r1; n++) {
      const h = hash01(n * 3.7 + 1);
      if (h < 0.18) continue;
      const side = hash01(n * 1.9) < 0.5 ? -1 : 1;
      const ruin = this.ruins.take(n, Math.floor(hash01(n * 4.1) * 5));
      const out = inside(n * RUIN_STEP) ? 0 : 6;
      ruin.position.set(side * (9 + h * 15 + out), WATER_Y, z(n * RUIN_STEP));
      ruin.rotation.y = side * -0.3 + (h - 0.5) * 0.5;
    }
    this.ruins.end();

    // Grotto walls inside; sea stacks, further out, past the mouth.
    const [c0, c1] = slotRange(distance, CLIFF_STEP, BEHIND + 10, AHEAD + 30);
    this.cliffs.begin();
    for (let n = c0; n <= c1; n++) {
      for (const side of [-1, 1]) {
        const slot = n * 2 + (side > 0 ? 1 : 0);
        const h = hash01(slot * 2.3);
        const rock = this.cliffs.take(slot, Math.floor(hash01(slot * 6.1) * 4));
        const out = inside(n * CLIFF_STEP) ? 0 : 1;
        const w = 7 + h * 6;
        const height = (out ? 8 : 16) + hash01(slot * 4.4) * 8;
        rock.scale.set(w, height, 6 + hash01(slot) * 5);
        rock.position.set(side * (15 + h * 6 + out * 22), WATER_Y + height * 0.32, z(n * CLIFF_STEP + h * 6));
        rock.rotation.set(0, h * 6, 0);
      }
    }
    this.cliffs.end();

    // The cave roof and its stalactites, which stop at the mouth.
    const [k0, k1] = slotRange(distance, CEILING_STEP, BEHIND + 10, AHEAD + 10);
    this.ceilings.begin();
    for (let n = k0; n <= k1; n++) {
      const start = n * CEILING_STEP;
      if (!inside(start + CEILING_STEP * 0.5)) continue;
      const tile = this.ceilings.take(n, 0);
      tile.position.set(0, CEILING_Y, z(start + CEILING_STEP / 2));
    }
    this.ceilings.end();
    const [s0, s1] = slotRange(distance, STALACTITE_STEP);
    let hanging = 0;
    for (let n = s0; n <= s1; n++) {
      const at = n * STALACTITE_STEP;
      if (!inside(at) || n <= 2) continue;
      const x = (hash01(n * 1.1) - 0.5) * 44;
      const overPath = Math.abs(x) < 6;
      const length = (overPath ? 1.2 + hash01(n * 2.2) * 2.4 : 2 + hash01(n * 2.2) * 6.5);
      const radius = 0.25 + hash01(n * 3.3) * 0.7;
      p.set(x, CEILING_Y + 0.2, z(at));
      q.identity();
      sc.set(radius, length, radius);
      matrix.compose(p, q, sc);
      this.stalactites.setMatrixAt(hanging++, matrix);
    }
    this.stalactites.count = hanging;
    this.stalactites.instanceMatrix.needsUpdate = true;

    // Light falling through gaps in the roof.
    const [h0, h1] = slotRange(distance, SHAFT_STEP, 6, AHEAD);
    this.shafts.begin();
    for (let n = h0; n <= h1; n++) {
      if (hash01(n * 8.1) > 0.62 || !inside(n * SHAFT_STEP)) continue;
      const shaft = this.shafts.take(n, 0);
      const at = z(n * SHAFT_STEP);
      shaft.position.set((hash01(n * 2.7) - 0.5) * 9, WATER_Y + 1, at);
      const fade = clamp01((90 + at) / 40) * clamp01((-at + 4) / 10);
      shaft.children.forEach(card => {
        ((card as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.16 * this.mood.shafts * fade;
      });
    }
    this.shafts.end();

    // The cave mouth itself.
    if (this.mouthAt !== null) {
      const at = z(this.mouthAt);
      this.mouth.visible = at < 30 && at > -260;
      this.mouth.position.set(0, 0, at);
      const light = this.mouth.userData.light as THREE.Sprite;
      light.material.opacity = 0.9 * (1 - outside);
    } else {
      this.mouth.visible = false;
    }
    this.sunGlow.position.set(-60, 90, -300);
  }

  /** Four real lights follow the braziers and fire vents nearest the runner. */
  private assignTorchLights(braziers: { x: number; y: number; z: number }[], now: number, options: CaveWorldOptions) {
    const candidates = [...braziers];
    for (const [, obstacle] of this.obstacles) {
      if (obstacle.userData.kind === "fire") candidates.push({ x: obstacle.position.x, y: 0.9, z: obstacle.position.z });
    }
    candidates.sort((a, b) => Math.abs(a.z + 7) - Math.abs(b.z + 7));
    this.torches.forEach((light, i) => {
      const source = candidates[i];
      if (!source || source.z < -60 || source.z > 6) {
        light.intensity = 0;
        return;
      }
      const flicker = options.still ? 1 : 0.86 + Math.sin(now * 0.019 + i * 2.4) * 0.09 + Math.sin(now * 0.053 + i) * 0.05;
      light.position.set(source.x, source.y, source.z);
      light.intensity = 26 * this.mood.torch * flicker;
    });
  }

  private animateMotes(distance: number, now: number, collapse: number, outside: number, options: CaveWorldOptions) {
    const material = this.motes.material as THREE.PointsMaterial;
    material.color.copy(this.mood.motes);
    material.opacity = (0.55 + collapse * 0.35) * (options.effectStrength > 0 ? 1 : 0) * (1 - outside * 0.5);
    this.motes.visible = options.effectStrength > 0;
    if (!this.motes.visible) return;
    const position = this.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    const seeds = this.moteSeeds;
    const span = 70;
    for (let i = 0; i < position.count; i++) {
      const a = seeds[i * 3];
      const b = seeds[i * 3 + 1];
      const c = seeds[i * 3 + 2];
      const x = (a - 0.5) * 22;
      // Embers rise in the collapse; dust drifts everywhere else.
      const rise = options.still ? 0 : ((now * 0.0004 * (0.5 + b) * (0.3 + collapse * 1.6)) % 1) * 9;
      const y = ((b * 9 + rise) % 9) + 0.2;
      const zz = -(((c * span - distance) % span) + span) % span + 6;
      position.setXYZ(i, x + (options.still ? 0 : Math.sin(now * 0.0007 + i) * 0.3), y, zz);
    }
    position.needsUpdate = true;
  }

  /** Decorative rocks dropping from the roof into the sea while it collapses. */
  private animateFalling(travelled: number, dt: number, collapse: number, options: CaveWorldOptions) {
    for (const rock of this.falling) {
      if (!rock.active) {
        if (options.still || options.effectStrength <= 0 || collapse < 0.5 || Math.random() > dt * 0.5) continue;
        const side = Math.random() < 0.5 ? -1 : 1;
        rock.active = true;
        rock.x = side * (6 + Math.random() * 10);
        rock.y = CEILING_Y - 1;
        rock.z = -(18 + Math.random() * 45);
        rock.vy = 0;
        rock.mesh.scale.setScalar(0.5 + Math.random() * 0.9);
        rock.mesh.visible = true;
      }
      rock.vy -= 22 * dt;
      rock.y += rock.vy * dt;
      rock.z += travelled;
      rock.mesh.position.set(rock.x, rock.y, rock.z);
      rock.mesh.rotation.x += dt * 2;
      if (rock.y < WATER_Y) {
        rock.active = false;
        rock.mesh.visible = false;
        const at = this.toScreen(rock.x, WATER_Y, rock.z);
        if (at.on) {
          this.particles.burst(at.x, at.y, 12, i => ({
            vx: (hash01(i + rock.x) - 0.5) * 160,
            vy: -120 - hash01(i * 3) * 160,
            size: 2 + hash01(i) * 3,
            colour: i % 2 ? "#d8fbff" : "#7fd8df",
            gravity: 420,
            max: 700,
            kind: "splash",
          }));
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Actors
  // -------------------------------------------------------------------------

  private placeHero(s: CaveState, now: number, options: CaveWorldOptions) {
    const x = s.laneX * LANE_WIDTH;
    const jumpT = s.jump > 0 ? 1 - s.jump / JUMP_MS : 0;
    const lift = s.jump > 0 ? Math.sin(jumpT * Math.PI) * 1.55 : 0;
    const sliding = s.slide > 0;
    const stepPhase = s.distance / 1.9;
    const grounded = s.jump <= 0 && !sliding;
    const bob = options.still || !grounded ? 0 : Math.abs(Math.sin(stepPhase * Math.PI)) * 0.09;
    const sway = options.still || !grounded ? 0 : Math.sin(stepPhase * Math.PI) * 0.045;
    const pull = clamp((s.lane - 1) * LANE_SPAN - s.laneX, -1, 1);
    const struck = clamp01(1 - (s.elapsed - s.struckAt) / 420);

    this.hero.position.set(x, lift + bob, 0);
    this.hero.rotation.set(0, Math.atan2(this.camera.position.x - x, this.camera.position.z), -pull * 0.2 + sway + Math.sin(struck * 18) * struck * 0.2);
    if (sliding) {
      const t = 1 - s.slide / SLIDE_MS;
      this.hero.scale.set(1.14, 0.5 + easeOut(t) * 0.06, 1);
    } else if (s.jump > 0) {
      const tuck = Math.sin(jumpT * Math.PI);
      this.hero.scale.set(1 - tuck * 0.04, 1 + tuck * 0.05, 1);
    } else {
      this.hero.scale.set(1 - bob * 0.25, 1 + bob * 0.35, 1);
    }
    // Ghosted flicker while invulnerable: unmistakable, never invisible.
    const ghost = s.invulnerable > 0 && Math.floor(now / 90) % 2 === 1;
    this.heroMaterial.opacity = ghost ? 0.38 : 1;
    if (struck > 0) this.heroMaterial.color.lerp(HURT, struck * 0.7);

    this.heroShadow.position.set(x, 0.015, 0.1);
    const shrink = 1 - lift / 3.2;
    this.heroShadow.scale.set(1.3 * shrink, 1, (sliding ? 1.4 : 0.9) * shrink);
  }

  /**
   * Polyphemus is behind the camera, so he is felt rather than seen: his
   * shadow stretches past Odysseus as he closes, his footfalls shake the
   * view, and when he commits to a throw his arm rises into the frame on the
   * side of the lane he has chosen.
   */
  private placeGiant(s: CaveState, now: number, options: CaveWorldOptions) {
    const cy = s.cyclops;
    const near = clamp01(1 - (cy.gap - 8) / (START_GAP - 8));
    const winding = cy.state === "winding";
    const length = lerp(3.5, 15, near);
    const stride = options.still ? 0 : Math.sin((cy.stride / 1000) * Math.PI * 2) * 0.5;
    this.giant.scale.set(lerp(0.7, 1.35, near), 1, length / 10.8);
    this.giant.position.set(s.laneX * LANE_WIDTH * 0.3 + stride, 0.02, 5 - length / 2);
    (this.giant.material as THREE.MeshBasicMaterial).opacity = clamp01(near * 0.62 + (winding ? 0.12 : 0) - 0.04);

    // The masks on every gate answer their master's eye.
    const wind = winding ? 1 - cy.timer / Math.max(1, cy.windTotal) : 0;
    const roar = clamp01(1 - (s.elapsed - cy.roarAt) / 700);
    const pulse = options.still ? 0.5 : 0.5 + Math.sin(now * 0.02) * 0.5;
    this.kit.m.mask.emissiveIntensity = winding ? 1.4 + wind * 2.6 * (0.7 + pulse * 0.3) : 0.5 + roar * 2.4;

    const throwing = cy.state === "throwing";
    const lane = winding ? cy.windLane : -1;
    if (!(winding && lane >= 0) && !throwing) {
      this.arm.visible = false;
      return;
    }
    if (winding) this.arm.userData.side = lane === 0 ? -1 : 1;
    const side = (this.arm.userData.side as number) ?? 1;
    const rise = winding ? easeOut(clamp01(wind * 1.6)) : 1;
    const release = throwing ? 1 - cy.timer / 320 : 0;
    const tremble = options.still ? 0 : Math.sin(now * 0.05) * 0.03 * rise;
    this.arm.visible = true;
    // Camera space: x right, y up, -z ahead.
    this.arm.position.set(side * (lane === 1 ? 1.3 : 1.7) + tremble, lerp(3.2, 0.9, rise) + release * 2.4, -3.6 - release * 1.4);
    this.arm.rotation.set(-release * 0.8, 0, -side * 0.25);
    (this.arm.userData.boulder as THREE.Object3D).visible = winding;
  }

  private placeEntities(s: CaveState, now: number) {
    const kit = this.kit;
    const seen = new Set<number>();
    for (const o of s.obstacles) {
      if (o.z > SPAWN_Z + 2 || o.z < -BEHIND) continue;
      seen.add(o.id);
      let view = this.obstacles.get(o.id);
      if (!view) {
        view = buildObstacle(kit, o.kind, o.variant);
        view.userData.kind = o.kind;
        this.obstacles.set(o.id, view);
        this.scene.add(view);
      }
      view.position.set(laneCentre(o.lane), 0, -o.z);
      const fade = clamp01((SPAWN_Z - o.z) / 18);
      if (view.userData.roll) (view.userData.roll as THREE.Object3D).rotation.x = -o.z / 0.74;
      if (view.userData.fall) {
        // Rubble drops out of the roof and settles while still far ahead.
        const fall = clamp01((SPAWN_Z - o.z) / 38);
        const pile = view.userData.fall as THREE.Object3D;
        pile.position.y = (1 - easeOut(fall)) * 11;
        pile.rotation.y = (1 - fall) * 3;
        if (fall >= 1 && !this.settled.has(o.id)) {
          this.settled.add(o.id);
          const at = this.toScreen(view.position.x, 0.2, view.position.z);
          if (at.on) {
            this.particles.burst(at.x, at.y, 10, i => ({
              vx: (hash01(i + o.id) - 0.5) * 120,
              vy: -30 - hash01(i * 3) * 50,
              size: 3 + hash01(i * 5) * 4,
              colour: "#b9a98a",
              gravity: 160,
              max: 700,
              kind: "dust",
            }));
          }
        }
      }
      if (view.userData.flames) {
        (view.userData.flames as THREE.Object3D[]).forEach((flame, i) => {
          const flicker = 0.78 + Math.sin(now * 0.021 + i * 2 + o.id) * 0.14 + Math.sin(now * 0.057 + i) * 0.08;
          flame.scale.set(1, flicker * fade, 1);
        });
      }
      view.traverse(child => {
        if (child instanceof THREE.Sprite) child.visible = fade > 0.05;
      });
    }
    for (const [id, view] of this.obstacles) {
      if (seen.has(id)) continue;
      this.scene.remove(view);
      this.obstacles.delete(id);
      this.settled.delete(id);
    }

    seen.clear();
    for (const sheep of s.sheep) {
      if (sheep.taken || sheep.z > SPAWN_Z + 8 || sheep.z < -6) continue;
      seen.add(sheep.id);
      let view = this.sheep.get(sheep.id);
      if (!view) {
        view = buildSheep(kit);
        this.sheep.set(sheep.id, view);
        this.scene.add(view);
      }
      view.position.set((sheep.lane - 1 + sheep.drift) * LANE_WIDTH, 0, -sheep.z);
      const trot = now * 0.012 + sheep.id;
      const body = view.userData.body as THREE.Object3D;
      body.position.y = Math.abs(Math.sin(trot)) * 0.06;
      (view.userData.legs as THREE.Object3D[]).forEach((leg, i) => {
        leg.rotation.x = Math.sin(trot + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5;
      });
      const ring = view.userData.ring as THREE.Object3D;
      ring.scale.setScalar(1.35 + Math.sin(now * 0.006 + sheep.id) * 0.12);
    }
    for (const [id, view] of this.sheep) {
      if (seen.has(id)) continue;
      this.scene.remove(view);
      this.sheep.delete(id);
    }

    seen.clear();
    for (const coin of s.coins) {
      if (coin.taken || coin.z > SPAWN_Z + 6 || coin.z < -6) continue;
      seen.add(coin.id);
      let view = this.coins.get(coin.id);
      if (!view) {
        view = buildCoin(kit);
        this.coins.set(coin.id, view);
        this.scene.add(view);
      }
      view.position.set(laneCentre(coin.lane), Math.sin(now * 0.005 + coin.id) * 0.08, -coin.z);
      (view.userData.coin as THREE.Object3D).rotation.y = now * 0.004 + coin.id;
    }
    for (const [id, view] of this.coins) {
      if (seen.has(id)) continue;
      this.scene.remove(view);
      this.coins.delete(id);
    }
  }

  /** Boulders in flight, from Polyphemus' fist to the locked lane. */
  private placeThrows(s: CaveState, now: number) {
    const seen = new Set<number>();
    for (const b of s.boulders) {
      seen.add(b.id);
      let view = this.thrown.get(b.id);
      if (!view) {
        const group = buildThrown(this.kit);
        const shadow = new THREE.Mesh(this.kit.geometry.floorPlane, this.kit.m.blob);
        shadow.renderOrder = 1;
        this.scene.add(group, shadow);
        view = { group, shadow, landedAt: -1 };
        this.thrown.set(b.id, view);
      }
      const t = clamp01(b.t / b.total);
      const endX = laneCentre(b.lane);
      const side = b.lane === 0 ? -1 : 1;
      const startX = s.laneX * LANE_WIDTH * 0.55 + side * (b.lane === 1 ? 1.15 : 1.55);
      if (!b.resolved) {
        const x = lerp(startX, endX, t);
        const y = lerp(4.05, 0.8, t * t) + Math.sin(t * Math.PI) * 1.6;
        const z = lerp(2.15, -IMPACT_AHEAD, t);
        view.group.position.set(x, y, z);
        view.group.rotation.set(t * 9, t * 4, 0);
        view.shadow.visible = true;
        view.shadow.position.set(endX, 0.02, -IMPACT_AHEAD);
        view.shadow.scale.setScalar(0.6 + t * 1.4);
      } else {
        // Landed: it rests in its lane and streams past with the floor.
        if (view.landedAt < 0) {
          view.landedAt = s.elapsed;
          const at = this.toScreen(endX, 0.3, -IMPACT_AHEAD);
          if (at.on) {
            this.particles.burst(at.x, at.y, 26, i => ({
              vx: Math.cos((i / 26) * Math.PI * 2) * (140 + hash01(i) * 200),
              vy: -60 - hash01(i * 3) * 200,
              size: 4 + hash01(i * 7) * 6,
              colour: i % 3 === 0 ? "#ff8a4a" : "#cdb894",
              gravity: 620,
              max: 620,
              kind: i % 2 ? "shard" : "dust",
            }));
          }
        }
        const back = (Math.max(0, b.t - b.total) / 1000) * s.speed;
        view.group.position.set(endX, 0.8, -IMPACT_AHEAD + back);
        view.shadow.position.set(endX, 0.02, -IMPACT_AHEAD + back);
        view.shadow.scale.setScalar(2);
      }
      void now;
    }
    for (const [id, view] of this.thrown) {
      if (seen.has(id)) continue;
      this.scene.remove(view.group, view.shadow);
      this.thrown.delete(id);
    }
  }

  /** The locked lane: chevrons streaming toward the runner, and the impact ring. */
  private placeTelegraph(s: CaveState, now: number) {
    const cy = s.cyclops;
    const winding = cy.state === "winding" && cy.windLane >= 0;
    const inFlight = s.boulders.find(b => !b.resolved);
    const lane = winding ? cy.windLane : inFlight ? inFlight.lane : -1;
    this.telegraph.visible = winding;
    this.target.visible = lane >= 0;
    if (lane < 0) return;
    const t = winding ? 1 - cy.timer / Math.max(1, cy.windTotal) : 1;
    const pulse = 0.5 + Math.abs(Math.sin(t * Math.PI * 5)) * 0.5;
    this.telegraph.position.set(laneCentre(lane), 0.02, -(44 / 2) + 1.5);
    this.textures.chevrons.offset.y = (now * 0.0016) % 1;
    this.kit.m.telegraph.opacity = 0.32 + pulse * 0.4;
    this.target.position.set(laneCentre(lane), 0.03, -IMPACT_AHEAD);
    this.target.scale.setScalar(lerp(2.8, 1.5, t));
    this.target.rotation.y = now * 0.002;
    this.kit.m.target.opacity = 0.55 + pulse * 0.45;
  }

  // -------------------------------------------------------------------------
  // Arcade overlay
  // -------------------------------------------------------------------------

  private toScreen(x: number, y: number, z: number): ScreenPoint {
    this.v.set(x, y, z).project(this.camera);
    return { x: ((this.v.x + 1) / 2) * this.size.w, y: ((1 - this.v.y) / 2) * this.size.h, on: this.v.z > -1 && this.v.z < 1 };
  }

  private pxPerMetre(x: number, y: number, z: number) {
    const a = this.toScreen(x, y, z);
    const b = this.toScreen(x + 1, y, z);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  private drawOverlay(s: CaveState, frame: StageFrame, now: number, options: CaveWorldOptions, travelled: number, collapse: number) {
    const canvas = this.overlay;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = this.size.w;
    const h = this.size.h;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    const c = canvas.getContext("2d");
    if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, w, h);
    const unit = Math.min(w / 1600, h / 900);

    this.spawnEffects(s, options, travelled, collapse, frame.dt);
    this.particles.update(options.still ? 0 : frame.dt);

    if (options.effectStrength > 0 && !options.still) this.drawSpeedLines(c, s, now, unit);
    this.drawPrompts(c, s, unit);
    this.drawTargetCountdown(c, s, unit);
    this.drawInsight(c, s, options, unit);
    this.particles.draw(c);
    this.drawPops(c, s, unit);

    if (s.flash > 0) {
      c.globalAlpha = clamp01(s.flash / 320) * 0.38;
      c.fillStyle = "#f4604f";
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 1;
    }
    const vignette = c.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, "rgba(2,8,12,0)");
    vignette.addColorStop(1, "rgba(2,8,12,0.42)");
    c.fillStyle = vignette;
    c.fillRect(0, 0, w, h);
    // A danger rim as Polyphemus closes, instead of a flashing full-screen tint.
    const near = clamp01(1 - (s.cyclops.gap - 8) / 34);
    if (near > 0.02) {
      const rim = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.66);
      rim.addColorStop(0, "rgba(244,96,79,0)");
      rim.addColorStop(1, `rgba(244,96,79,${0.42 * near})`);
      c.fillStyle = rim;
      c.fillRect(0, 0, w, h);
    }
  }

  private spawnEffects(s: CaveState, options: CaveWorldOptions, travelled: number, collapse: number, dt: number) {
    if (options.effectStrength <= 0) return;
    const feet = this.toScreen(s.laneX * LANE_WIDTH, 0.05, 0);
    const chest = this.toScreen(s.laneX * LANE_WIDTH, 1.2, 0);
    const scale = Math.max(0.6, this.size.h / 900);
    if (this.hitStamp.fired(s.struckAt) && s.struckAt > 0) {
      this.particles.burst(chest.x, chest.y, 22, i => ({
        vx: Math.cos((i / 22) * Math.PI * 2) * (120 + hash01(i) * 180) * scale,
        vy: (Math.sin((i / 22) * Math.PI * 2) * (90 + hash01(i * 3) * 140) - 60) * scale,
        size: (4 + hash01(i * 7) * 6) * scale,
        colour: i % 3 === 0 ? "#f4604f" : "#d8c7a8",
        gravity: 520,
        max: 520,
        kind: "shard",
      }));
      this.particles.spawn({ x: chest.x, y: chest.y, vx: 0, vy: 0, size: 30 * scale, colour: "#f4604f", gravity: 0, max: 420, kind: "ring" });
    }
    if (this.landStamp.fired(s.landedAt) && s.landedAt > 0) {
      this.particles.burst(feet.x, feet.y, 14, i => ({
        vx: (hash01(i) - 0.5) * 260 * scale,
        vy: (-40 - hash01(i * 5) * 70) * scale,
        size: (5 + hash01(i * 11) * 7) * scale,
        colour: "#d8c4a0",
        gravity: 420,
        max: 460,
        kind: "dust",
      }));
    }
    if (this.pickupStamp.fired(s.pickupAt) && s.pickupAt > 0) {
      this.particles.burst(chest.x, chest.y - 20 * scale, 18, i => ({
        vx: (hash01(i) - 0.5) * 220 * scale,
        vy: (-120 - hash01(i * 2) * 160) * scale,
        size: (3 + hash01(i * 13) * 4) * scale,
        colour: i % 2 ? "#ffd27a" : "#fff6dc",
        gravity: 260,
        max: 640,
        kind: "spark",
      }));
      this.particles.spawn({ x: chest.x, y: chest.y - 20 * scale, vx: 0, vy: 0, size: 24 * scale, colour: "#ffd27a", gravity: 0, max: 460, kind: "ring" });
    }
    if (options.still) return;
    // Footfall dust, paced by distance so it tracks real speed.
    this.footDistance += travelled;
    if (this.footDistance >= 1.9 && s.jump <= 0) {
      this.footDistance = 0;
      this.particles.burst(feet.x + (Math.random() - 0.5) * 30 * scale, feet.y, s.slide > 0 ? 6 : 3, i => ({
        vx: (hash01(i + s.distance) - 0.5) * 150 * scale,
        vy: (-30 - hash01(i) * 60) * scale,
        size: (3 + hash01(i * 3) * 5) * scale,
        colour: "#cdb894",
        gravity: 300,
        max: 420,
        kind: "dust",
      }));
    }
    // Grit falling from the roof as it gives way.
    if (collapse > 0.3 && Math.random() < dt * 14 * collapse * options.effectStrength) {
      this.particles.spawn({
        x: Math.random() * this.size.w,
        y: -10,
        vx: (Math.random() - 0.5) * 30,
        vy: 160 + Math.random() * 220,
        size: (2 + Math.random() * 3) * scale,
        colour: "#a8957a",
        gravity: 200,
        max: 2400,
        kind: "dust",
      });
    }
  }

  /** Thin streaks off the screen edges once the run is really moving. */
  private drawSpeedLines(c: CanvasRenderingContext2D, s: CaveState, now: number, unit: number) {
    const fast = clamp01((s.speed - 19) / 8);
    if (fast <= 0) return;
    const w = this.size.w;
    const h = this.size.h;
    const vanish = this.toScreen(0, 1, -60);
    c.save();
    c.lineCap = "round";
    for (let i = 0; i < 14; i++) {
      const seed = Math.floor(now / 140) * 31 + i;
      const angle = hash01(seed) * Math.PI * 2;
      const t = (now / 260 + hash01(seed * 3)) % 1;
      const r0 = Math.max(w, h) * (0.42 + t * 0.4);
      const len = 60 * unit + t * 160 * unit;
      const x0 = vanish.x + Math.cos(angle) * r0;
      const y0 = vanish.y + Math.sin(angle) * r0 * 0.7;
      c.strokeStyle = `rgba(255,248,226,${0.16 * fast * (1 - t)})`;
      c.lineWidth = Math.max(1, 3 * unit);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x0 + Math.cos(angle) * len, y0 + Math.sin(angle) * len * 0.7);
      c.stroke();
    }
    c.restore();
  }

  /**
   * The avoidance prompt over each hazard while it is still answerable. Part
   * of fair play, not debug information, so it shows in every display mode.
   */
  private drawPrompts(c: CanvasRenderingContext2D, s: CaveState, unit: number) {
    for (const o of s.obstacles) {
      if (o.resolved || o.z <= 6 || o.z >= 54) continue;
      const rule = AVOIDANCE[o.kind];
      const alpha = clamp01((54 - o.z) / 22) * clamp01((o.z - 6) / 8);
      const anchor = this.toScreen(laneCentre(o.lane), OBSTACLE_HEIGHT[o.kind] + 0.55, -o.z);
      if (!anchor.on) continue;
      const ppm = this.pxPerMetre(laneCentre(o.lane), 0, -o.z);
      const size = clamp(ppm * 0.2, 9 * unit + 6, 26 * unit + 8);
      const style = rule.jump ? JUMP_STYLE : rule.slide ? SLIDE_STYLE : DODGE_STYLE;
      // The full label for the runner's own lane and a compact badge for the
      // others, so a wave across all three lanes never stacks into a pile.
      if (o.lane === s.lane) arcadeTag(c, anchor.x, anchor.y, size, rule.prompt, style, alpha);
      else arcadeBadge(c, anchor.x, anchor.y, size, style, alpha * 0.9);
    }
  }

  private drawTargetCountdown(c: CanvasRenderingContext2D, s: CaveState, unit: number) {
    const cy = s.cyclops;
    if (cy.state !== "winding" || cy.windLane < 0) return;
    const at = this.toScreen(laneCentre(cy.windLane), 1.5, -IMPACT_AHEAD - 1.4);
    if (!at.on) return;
    const size = 22 * unit + 8;
    c.save();
    c.font = `${size}px ${PIXEL_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = Math.max(3, size * 0.28);
    c.strokeStyle = "#2a0b08";
    c.fillStyle = "#ffe4d4";
    const text = `${(cy.timer / 1000).toFixed(1)}s`;
    c.strokeText(text, at.x, at.y);
    c.fillText(text, at.x, at.y);
    c.restore();
  }

  /** Debug-only reveals for the AI inspector. They never change what Polyphemus does. */
  private drawInsight(c: CanvasRenderingContext2D, s: CaveState, options: CaveWorldOptions, unit: number) {
    if (options.overlay.showPrediction) {
      const decision = s.ai.decisions[s.ai.decisions.length - 1];
      if (decision?.confidence !== undefined && decision.target) {
        const lane = ["Left", "Centre", "Right"].findIndex(n => decision.target?.startsWith(n));
        if (lane >= 0) {
          c.save();
          c.setLineDash([10, 8]);
          c.strokeStyle = "rgba(50,212,245,0.85)";
          c.lineWidth = 3;
          this.floorEllipse(c, laneCentre(lane), -24, 0.7, 1.2);
          c.stroke();
          c.setLineDash([]);
          const label = this.toScreen(laneCentre(lane), 0.9, -24);
          c.font = `${Math.round(11 * unit + 7)}px ${PIXEL_FONT}`;
          c.textAlign = "center";
          c.fillStyle = "#32d4f5";
          c.fillText(`forecast ${Math.round(decision.confidence * 100)}%`, label.x, label.y);
          c.restore();
        }
      }
    }
    if (options.overlay.showHistory) {
      const recent = s.model.recent.slice(-6);
      c.save();
      recent.forEach((lane, i) => {
        c.fillStyle = `rgba(50,212,245,${0.14 + (i / recent.length) * 0.36})`;
        this.floorEllipse(c, laneCentre(lane), -(7 + (recent.length - i) * 4.5), 0.5, 0.7);
        c.fill();
      });
      c.restore();
    }
  }

  /** Trace an ellipse lying on the floor, in true perspective. */
  private floorEllipse(c: CanvasRenderingContext2D, x: number, z: number, rx: number, rz: number) {
    c.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p = this.toScreen(x + Math.cos(a) * rx, 0.03, z + Math.sin(a) * rz);
      if (i === 0) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
    }
    c.closePath();
  }

  /** Floating score and health callouts, stacked over the lane that earned them. */
  private drawPops(c: CanvasRenderingContext2D, s: CaveState, unit: number) {
    s.pops.forEach((popped, index) => {
      const age = clamp01((s.elapsed - popped.at) / 1000);
      if (age >= 1) return;
      const p = this.toScreen(laneCentre(popped.lane) + 0.95, 2.1 + age * 0.8, 0);
      // A quick overshoot as each pop lands, then it floats away.
      const punch = age < 0.12 ? 1 + (0.12 - age) * 3 : 1;
      const size = Math.round((14 * unit + 7) * punch);
      const y = p.y - (s.pops.length - 1 - index) * (14 * unit + 7) * 1.3;
      c.save();
      c.globalAlpha = (1 - age) * (age < 0.12 ? age / 0.12 : 1);
      c.font = `${size}px ${PIXEL_FONT}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineJoin = "round";
      c.lineWidth = Math.max(4, size * 0.45);
      c.strokeStyle = "#1a0d06";
      c.strokeText(popped.text, p.x, y);
      c.fillStyle = popped.good ? "#ffd65a" : "#ff6a5a";
      c.fillText(popped.text, p.x, y);
      c.restore();
    });
  }

  // -------------------------------------------------------------------------

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const collect = (object: THREE.Object3D) => {
      object.traverse(child => {
        const item = child as THREE.Mesh;
        if (item.geometry) geometries.add(item.geometry);
        const material = item.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach(entry => materials.add(entry));
        else if (material) materials.add(material);
      });
    };
    collect(this.scene);
    for (const view of this.obstacles.values()) collect(view);
    Object.values(this.kit.geometry).forEach(entry => (Array.isArray(entry) ? entry : [entry]).forEach(geometry => geometries.add(geometry)));
    Object.values(this.kit.m).forEach(material => materials.add(material));
    Object.values(this.kit.g).forEach(material => materials.add(material));
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
    geometries.forEach(geometry => geometry.dispose());
    Object.values(this.textures).forEach(texture => texture.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.glCanvas.remove();
    this.particles.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TagStyle = { top: string; bottom: string; edge: string; icon: "up" | "down" | "sides" };
const JUMP_STYLE: TagStyle = { top: "#8dffb4", bottom: "#24a85a", edge: "#06301a", icon: "up" };
const SLIDE_STYLE: TagStyle = { top: "#9fe0ff", bottom: "#2a7fd0", edge: "#071f3a", icon: "down" };
const DODGE_STYLE: TagStyle = { top: "#ffd39a", bottom: "#e0632c", edge: "#3a1206", icon: "sides" };

/** A chunky arcade label with an action glyph and a pointer to the hazard. */
function arcadeTag(c: CanvasRenderingContext2D, x: number, y: number, size: number, text: string, style: TagStyle, alpha: number) {
  c.save();
  c.globalAlpha = alpha;
  c.font = `${Math.round(size)}px ${PIXEL_FONT}`;
  c.textBaseline = "middle";
  const glyph = size * 0.9;
  const pad = size * 0.55;
  const textW = c.measureText(text).width;
  const w = glyph + pad * 0.7 + textW + pad * 2;
  const h = size + pad * 1.3;
  const left = x - w / 2;
  const top = y - h - size * 0.45;
  // Pointer.
  c.fillStyle = style.edge;
  c.beginPath();
  c.moveTo(x - size * 0.42, top + h - 1);
  c.lineTo(x + size * 0.42, top + h - 1);
  c.lineTo(x, top + h + size * 0.5);
  c.closePath();
  c.fill();
  // Body.
  c.fillStyle = style.edge;
  roundedRect(c, left - 3, top - 3, w + 6, h + 6, size * 0.45);
  c.fill();
  const fill = c.createLinearGradient(0, top, 0, top + h);
  fill.addColorStop(0, style.top);
  fill.addColorStop(1, style.bottom);
  c.fillStyle = fill;
  roundedRect(c, left, top, w, h, size * 0.35);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.35)";
  roundedRect(c, left + 3, top + 2, w - 6, h * 0.36, size * 0.25);
  c.fill();
  const gy = top + h / 2;
  drawGlyph(c, left + pad + glyph / 2, gy, glyph / 2, style);
  // Text.
  c.fillStyle = style.edge;
  c.fillText(text, left + pad + glyph + pad * 0.7, gy + size * 0.06);
  c.restore();
}

function drawGlyph(c: CanvasRenderingContext2D, gx: number, gy: number, g: number, style: TagStyle) {
  c.fillStyle = style.edge;
  c.beginPath();
  if (style.icon === "up") {
    c.moveTo(gx - g, gy + g * 0.6);
    c.lineTo(gx + g, gy + g * 0.6);
    c.lineTo(gx, gy - g * 0.8);
  } else if (style.icon === "down") {
    c.moveTo(gx - g, gy - g * 0.6);
    c.lineTo(gx + g, gy - g * 0.6);
    c.lineTo(gx, gy + g * 0.8);
  } else {
    c.moveTo(gx - g, gy);
    c.lineTo(gx - g * 0.15, gy - g * 0.7);
    c.lineTo(gx - g * 0.15, gy + g * 0.7);
    c.closePath();
    c.moveTo(gx + g, gy);
    c.lineTo(gx + g * 0.15, gy - g * 0.7);
    c.lineTo(gx + g * 0.15, gy + g * 0.7);
  }
  c.closePath();
  c.fill();
}

/** The glyph alone in a small rounded badge, for hazards in the other lanes. */
function arcadeBadge(c: CanvasRenderingContext2D, x: number, y: number, size: number, style: TagStyle, alpha: number) {
  c.save();
  c.globalAlpha = alpha;
  const s = size * 1.7;
  const left = x - s / 2;
  const top = y - s - size * 0.4;
  c.fillStyle = style.edge;
  c.beginPath();
  c.moveTo(x - size * 0.34, top + s - 1);
  c.lineTo(x + size * 0.34, top + s - 1);
  c.lineTo(x, top + s + size * 0.42);
  c.closePath();
  c.fill();
  roundedRect(c, left - 2.5, top - 2.5, s + 5, s + 5, s * 0.32);
  c.fill();
  const fill = c.createLinearGradient(0, top, 0, top + s);
  fill.addColorStop(0, style.top);
  fill.addColorStop(1, style.bottom);
  c.fillStyle = fill;
  roundedRect(c, left, top, s, s, s * 0.26);
  c.fill();
  drawGlyph(c, x, top + s / 2, size * 0.48, style);
  c.restore();
}

/**
 * Odysseus as a camera-facing card cut from the painted atlas (tile 1 is the
 * running back view), with a dark ink outline so he pops off the stone the way
 * an arcade sprite should.
 */
function heroTexture(image: HTMLImageElement | null) {
  const S = 512;
  const draw = (c: CanvasRenderingContext2D) => {
    if (image) {
      const tw = image.naturalWidth / 2;
      const th = image.naturalHeight / 2;
      c.drawImage(image, tw, 0, tw, th, 0, 0, S, S);
      return;
    }
    // Simple stand-in until the atlas loads.
    c.fillStyle = "#9a2a24";
    c.beginPath();
    c.moveTo(200, 150);
    c.lineTo(110, 330);
    c.lineTo(260, 300);
    c.closePath();
    c.fill();
    c.fillStyle = "#c08f5f";
    c.fillRect(220, 140, 90, 170);
    c.fillStyle = "#e8dcc0";
    c.fillRect(210, 290, 110, 70);
    c.fillStyle = "#b07e52";
    c.fillRect(228, 360, 30, 120);
    c.fillRect(272, 360, 30, 110);
    c.fillStyle = "#2a1c18";
    c.beginPath();
    c.arc(265, 115, 42, 0, Math.PI * 2);
    c.fill();
  };
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const c = canvas.getContext("2d");
  const silhouette = document.createElement("canvas");
  silhouette.width = S;
  silhouette.height = S;
  const sc = silhouette.getContext("2d");
  if (c && sc) {
    draw(sc);
    sc.globalCompositeOperation = "source-in";
    sc.fillStyle = "#1c1008";
    sc.fillRect(0, 0, S, S);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.drawImage(silhouette, Math.cos(a) * 4.5, Math.sin(a) * 4.5);
    }
    draw(c);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
