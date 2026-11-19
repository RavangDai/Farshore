// The mythic cinematics in 3D: the gate unlock and the walk to the next trial.
//
// Built from the Cyclops' Cave kit (its painted stone, marble, bronze, braziers,
// ruins and sea cliffs), so the films share one world with the 3D encounters.
// Odysseus is the pixel sprite on a camera-facing card, crisp against painted
// stone with bloom on the light: a small diorama, filmed. Every pose comes from
// lib/story/cinema.ts as a pure function of time; this file only draws it.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLOOR_PERIOD, PATH_WIDTH, paintCaveTextures, seeded, type CaveTextures } from "./cave-textures.ts";
import { PATH_HALF, PIER_X, SLAB_HALF, WATER_Y, buildBrazier, buildCliff, buildGateway, buildKit, buildRuin, type CaveKit } from "./cave-props.ts";
import { DURATION, JOURNEY_GATE_Z, JOURNEY_PAST_GATE_Z, LOCK, cameraAt, doorsAt, heroAt, keyAt, lightAt, runesAt, span, type CinemaKind, type CinemaTheme } from "../story/cinema.ts";

export type CinemaOptions = {
  kind: CinemaKind;
  /** The trial whose gate this is (unlock), or the one ahead (journey). */
  theme: CinemaTheme;
  /** Journey only: the light of the trial just won, which the sky leaves behind. */
  pastTheme?: CinemaTheme;
  /** The pixel sprite sheet: 2x2 tiles, Odysseus standing (0) and from behind (1). */
  sprites: HTMLImageElement | null;
};

const DOOR_H = 9.2;
const DOOR_W = PIER_X - 0.675;
const OPEN_ANGLE = 1.4;
const CAUSEWAY = { from: 44, to: -64 };
const HERO_H = 2.35;

/** One gate: the cave kit's stone gateway with two hinged bronze leaves, a split lock and burning runes. */
type Gate = {
  group: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  door: THREE.MeshStandardMaterial;
  seal: THREE.MeshStandardMaterial;
  portal: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Sprite;
  light: THREE.PointLight;
  ring: THREE.Mesh;
};

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const c = el.getContext("2d");
  if (c) draw(c);
  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The face of both leaves together, and the rune channels that burn when the key turns. */
function paintDoors() {
  const W = 768, H = 1002, seamY = H * (1 - LOCK[1] / DOOR_H), rand = seeded(77);
  const face = canvas(W, H, c => {
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#5a3a16"); g.addColorStop(0.45, "#a8772e"); g.addColorStop(0.55, "#8c6024"); g.addColorStop(1, "#4a2e10");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Hammered metal.
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = `rgba(${rand() < 0.5 ? "255,220,150" : "40,22,6"},${0.04 + rand() * 0.06})`;
      c.fillRect(rand() * W, rand() * H, 2 + rand() * 5, 2 + rand() * 5);
    }
    // Two columns of three sunken panels on each leaf.
    c.lineWidth = 6;
    for (const leaf of [0, 1]) for (let col = 0; col < 2; col++) for (let row = 0; row < 3; row++) {
      const x = leaf * (W / 2) + 34 + col * (W / 4 - 22), y = 40 + row * (H - 80) / 3;
      if (row === 1) continue; // the sun takes the middle band
      c.strokeStyle = "#3a2208"; c.strokeRect(x, y, W / 4 - 56, (H - 80) / 3 - 26);
      c.strokeStyle = "#e0b060aa"; c.strokeRect(x + 4, y + 4, W / 4 - 56, (H - 80) / 3 - 26);
    }
    // Rivets.
    for (let x = 18; x < W; x += 46) for (const y of [16, H - 16]) { c.fillStyle = "#2e1a06"; c.beginPath(); c.arc(x + 2, y + 2, 7, 0, 7); c.fill(); c.fillStyle = "#e8c070"; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); }
    // Odysseus' sun, across the seam, behind the lock.
    c.save(); c.translate(W / 2, seamY);
    for (let i = 0; i < 16; i++) {
      c.rotate(Math.PI / 8);
      c.fillStyle = i % 2 ? "#d8a448" : "#f2cc72";
      c.beginPath(); c.moveTo(-22, -96); c.lineTo(0, -218 + (i % 2) * 52); c.lineTo(22, -96); c.closePath(); c.fill();
    }
    c.fillStyle = "#6a4416"; c.beginPath(); c.arc(0, 0, 104, 0, 7); c.fill();
    c.restore();
    // The seam.
    c.fillStyle = "#1a0e04"; c.fillRect(W / 2 - 3, 0, 6, H);
  });
  const runes = canvas(W, H, c => {
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    c.strokeStyle = "#fff"; c.lineCap = "round"; c.lineJoin = "round";
    // Rays of the sun, the ring round the lock and the seam.
    c.save(); c.translate(W / 2, seamY); c.lineWidth = 5;
    for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.beginPath(); c.moveTo(0, -112); c.lineTo(0, -200 + (i % 2) * 52); c.stroke(); }
    c.lineWidth = 7; c.beginPath(); c.arc(0, 0, 112, 0, 7); c.stroke();
    c.restore();
    c.lineWidth = 3; c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke();
    // A line of runes down each panel: zigzags, eyes and keys.
    c.lineWidth = 4;
    for (const leaf of [0, 1]) for (let col = 0; col < 2; col++) for (const row of [0, 2]) {
      const x0 = leaf * (W / 2) + 34 + col * (W / 4 - 22) + (W / 4 - 56) / 2, y0 = 40 + row * (H - 80) / 3 + 26;
      for (let k = 0; k < 4; k++) {
        const y = y0 + k * 52, kind = Math.floor(rand() * 3);
        c.beginPath();
        if (kind === 0) { c.moveTo(x0 - 18, y); c.lineTo(x0 - 6, y + 22); c.lineTo(x0 + 6, y); c.lineTo(x0 + 18, y + 22); }
        else if (kind === 1) { c.ellipse(x0, y + 11, 18, 10, 0, 0, 7); c.moveTo(x0 + 4, y + 11); c.arc(x0, y + 11, 4, 0, 7); }
        else { c.moveTo(x0, y); c.lineTo(x0, y + 24); c.moveTo(x0 - 14, y + 6); c.lineTo(x0 + 14, y + 6); c.moveTo(x0 - 8, y + 18); c.lineTo(x0 + 8, y + 18); }
        c.stroke();
      }
    }
  });
  return { face, runes };
}

/** Two thin bars crossing inside the key's ring. */
function mergeCross() {
  const bars = [new THREE.BoxGeometry(0.36, 0.03, 0.03), new THREE.BoxGeometry(0.03, 0.03, 0.36)];
  const merged = mergeGeometries(bars)!;
  bars.forEach(b => b.dispose());
  return merged;
}

/** A vertical sky: zenith, horizon glow and the haze the sea fades into. */
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.6, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, 0.08, -h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export class CinemaWorld {
  private host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 500);
  private textures: CaveTextures;
  private kit: CaveKit;
  private options: CinemaOptions;
  private owned: THREE.Texture[] = [];
  private hemi = new THREE.HemisphereLight(0xffffff, 0x3a2a18, 1.2);
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private sky: THREE.ShaderMaterial;
  private sunGlow: THREE.Sprite;
  private water: THREE.MeshStandardMaterial;
  private caustics: THREE.MeshBasicMaterial;
  private gates: Gate[] = [];
  private braziers: THREE.Group[] = [];
  private torches: THREE.PointLight[] = [];
  private hero: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private heroShadow: THREE.Mesh;
  private heroTexture: THREE.Texture | null = null;
  private stride = 0;
  private key: THREE.Group;
  private keyGold: THREE.MeshStandardMaterial;
  private keyGlow: THREE.Sprite;
  private keyLight = new THREE.PointLight(0xffd27a, 0, 9, 1.6);
  private shaft: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private motes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private moteSeeds: Float32Array;
  private lastT = 0;
  private slowFrames = 0;
  private lastFrameAt = 0;
  private colours = { a: new THREE.Color(), b: new THREE.Color() };
  private resizer: ResizeObserver;

  constructor(host: HTMLElement, options: CinemaOptions) {
    this.host = host;
    this.options = options;
    // Throws where WebGL is unavailable; the screen then plays the 2D version or goes straight on.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.domElement.className = "fs-mythic-gl";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);

    this.textures = paintCaveTextures(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.kit = buildKit(this.textures);
    const { m, geometry: geo } = this.kit, t = this.textures, theme = options.theme;
    const rand = seeded(options.kind === "unlock" ? 41 : 97);

    // --- Sky, sun and sea ----------------------------------------------------
    this.scene.fog = new THREE.Fog(theme.fog, theme.near, theme.far);
    this.scene.background = new THREE.Color(theme.fog);
    this.sky = skyMaterial();
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), this.sky));
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.glow, color: theme.sun, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sunGlow.scale.setScalar(150);
    this.sunGlow.position.set(-60, 26, -260);
    this.scene.add(this.sunGlow);
    this.sun.position.set(-40, 26, -90);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.camera, this.keyLight);

    // Rough enough that the low sun leaves a soft sheen: a sharp glint on glossy water is a hot spot the bloom smears.
    this.water = new THREE.MeshStandardMaterial({ color: theme.water, roughness: 0.62, metalness: 0 });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), this.water);
    sea.position.set(0, WATER_Y, -60);
    this.scene.add(sea);
    const causticMap = t.caustics.clone();
    causticMap.wrapS = causticMap.wrapT = THREE.RepeatWrapping;
    causticMap.repeat.set(40, 40);
    causticMap.needsUpdate = true;
    this.owned.push(causticMap);
    this.caustics = new THREE.MeshBasicMaterial({ map: causticMap, color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending });
    const glints = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), this.caustics);
    glints.position.set(0, WATER_Y + 0.02, -40);
    this.scene.add(glints);

    // --- The causeway --------------------------------------------------------
    const length = CAUSEWAY.from - CAUSEWAY.to, middle = (CAUSEWAY.from + CAUSEWAY.to) / 2;
    t.floor.repeat.set(1, length / FLOOR_PERIOD);
    t.floorBump.repeat.copy(t.floor.repeat);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(PATH_WIDTH, length).rotateX(-Math.PI / 2), m.floor);
    floor.position.z = middle;
    this.scene.add(floor);
    const bedMap = t.mossTop.clone();
    bedMap.repeat.set(1, length / 1.4);
    bedMap.needsUpdate = true;
    this.owned.push(bedMap);
    const bed = new THREE.MeshStandardMaterial({ map: bedMap, roughness: 1 });
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(SLAB_HALF - PATH_HALF, length).rotateX(-Math.PI / 2), bed);
      strip.position.set(side * (PATH_HALF + SLAB_HALF) / 2, 0, middle);
      this.scene.add(strip);
    }
    const wallMap = t.block.clone();
    wallMap.wrapS = wallMap.wrapT = THREE.RepeatWrapping;
    wallMap.repeat.set(length / 3, 1.4);
    wallMap.needsUpdate = true;
    this.owned.push(wallMap);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(SLAB_HALF * 2, -WATER_Y, length), new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.95 }));
    wall.position.set(0, WATER_Y / 2 - 0.01, middle);
    this.scene.add(wall);

    // --- Gates ---------------------------------------------------------------
    const doors = paintDoors();
    this.owned.push(doors.face, doors.runes);
    if (options.kind === "unlock") this.gates.push(this.buildGate(0, theme, doors));
    else {
      this.gates.push(this.buildGate(JOURNEY_PAST_GATE_Z, options.pastTheme ?? theme, doors));
      this.gates.push(this.buildGate(JOURNEY_GATE_Z, theme, doors));
    }

    // --- Braziers, columns, ruins and cliffs --------------------------------
    const gateZ = options.kind === "unlock" ? [0] : [JOURNEY_PAST_GATE_Z, JOURNEY_GATE_Z];
    const brazierZ = options.kind === "unlock" ? [3, 9, 15, 21, 27] : [JOURNEY_PAST_GATE_Z - 6, -6, -13, -20, -27, JOURNEY_GATE_Z + 3];
    for (const z of brazierZ) for (const side of [-1, 1]) {
      const b = buildBrazier(this.kit);
      b.position.set(side * 3.0, 0, z);
      b.scale.setScalar(1.15);
      this.braziers.push(b);
      this.scene.add(b);
    }
    // Four real lights, in the braziers nearest the gates.
    const lit = options.kind === "unlock" ? [3, 3, 9, 9] : [JOURNEY_GATE_Z + 3, JOURNEY_GATE_Z + 3, JOURNEY_PAST_GATE_Z - 6, JOURNEY_PAST_GATE_Z - 6];
    lit.forEach((z, i) => {
      // Short reach: the sea lies 6 m below the light, and a torch glint on glossy water is a hot spot the bloom smears.
      const light = new THREE.PointLight(0xffa04a, 3.2, 5.8, 1.2);
      light.position.set(i % 2 ? 2.4 : -2.4, 2.6, z);
      this.torches.push(light);
      this.scene.add(light);
    });
    for (let z = CAUSEWAY.from - 4; z > CAUSEWAY.to + 4; z -= 7) {
      for (const side of [-1, 1]) {
        const at = z + rand() * 2;
        if (rand() < 0.3 || gateZ.some(g => Math.abs(at - g) < 3.5) || brazierZ.some(b => Math.abs(at - b) < 1.6)) continue;
        const column = new THREE.Mesh(rand() < 0.25 ? geo.columnBroken : geo.columnWhole, m.marble);
        column.scale.set(0.62, 1.15, 0.62);
        column.position.set(side * (SLAB_HALF - 0.38), 0, at);
        this.scene.add(column);
      }
    }
    for (let i = 0; i < 16; i++) {
      const ruin = buildRuin(this.kit, i);
      const side = i % 2 ? 1 : -1;
      ruin.position.set(side * (9 + rand() * 9), WATER_Y, CAUSEWAY.from - 8 - i * 6.5 + rand() * 3);
      ruin.rotation.y = rand() * Math.PI;
      ruin.scale.setScalar(0.8 + rand() * 0.6);
      this.scene.add(ruin);
    }
    for (let i = 0; i < 10; i++) {
      const cliff = buildCliff(this.kit, i);
      const side = i % 2 ? 1 : -1;
      cliff.scale.set(10 + rand() * 10, 14 + rand() * 18, 10 + rand() * 8);
      cliff.position.set(side * (32 + rand() * 30), WATER_Y, CAUSEWAY.from - i * 12 - rand() * 8);
      cliff.rotation.y = rand() * Math.PI;
      this.scene.add(cliff);
    }

    // --- Odysseus ----------------------------------------------------------
    this.hero = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
    this.hero.scale.set(HERO_H, HERO_H, 1);
    this.hero.material.color.set(0xffffff).lerp(new THREE.Color(theme.sun), 0.18);
    this.setSprites(options.sprites);
    this.heroShadow = new THREE.Mesh(geo.floorPlane, m.blob);
    this.heroShadow.scale.set(1.3, 1, 0.7);
    this.heroShadow.position.y = 0.02;
    this.scene.add(this.hero, this.heroShadow);

    // --- The Oracle's key and its shaft of light ------------------------------
    // The Oracle's key is gold whatever the trial: its light is the Oracle's, the runes are the trial's.
    this.keyGold = new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 0.75, roughness: 0.28, emissive: 0xffb84a, emissiveIntensity: 0.3 });
    this.key = new THREE.Group();
    // The bow is a ring round the shaft's axis with a cross inside, so it faces the camera once the key
    // points into the lock, and the quarter turn shows as the cross turning.
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.034, 10, 32).rotateX(Math.PI / 2), this.keyGold);
    bow.position.y = 0.42;
    const cross = new THREE.Mesh(mergeCross(), this.keyGold);
    cross.position.y = 0.42;
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), this.keyGold);
    jewel.position.y = 0.42;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 10), this.keyGold);
    stem.position.y = -0.06;
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.05), this.keyGold);
    bit.position.set(0.1, -0.28, 0);
    const bit2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), this.keyGold);
    bit2.position.set(0.06, -0.16, 0);
    this.key.add(bow, cross, jewel, stem, bit, bit2);
    this.key.scale.setScalar(1.6);
    this.keyGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.glow, color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.keyGlow.scale.setScalar(1.2);
    this.keyLight.color.set(0xffd9a0);
    this.scene.add(this.key, this.keyGlow);
    this.shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 14).translate(0, 7, 0), new THREE.MeshBasicMaterial({ map: t.shaft, color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.shaft.position.set(LOCK[0], LOCK[1] - 0.6, 1.3);
    this.scene.add(this.shaft);

    // --- Motes: embers by the braziers, fireflies over the sea ---------------
    const count = 260, positions = new Float32Array(count * 3);
    this.moteSeeds = new Float32Array(count);
    const span0 = options.kind === "unlock" ? [-4, 30] : [JOURNEY_GATE_Z - 4, JOURNEY_PAST_GATE_Z + 8];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 22;
      positions[i * 3 + 1] = 0.3 + rand() * 7;
      positions[i * 3 + 2] = span0[0] + rand() * (span0[1] - span0[0]);
      this.moteSeeds[i] = rand() * 100;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(moteGeometry, new THREE.PointsMaterial({ map: t.glow, color: theme.rune, size: 0.2, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.motes);

    // --- Post: bloom on the fire, the runes and the light --------------------
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.32, 0.9);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } catch {
      this.composer = null;
    }

    this.applyTheme(0);
    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(host);
    this.resize();
  }

  /** The sprite sheet arrives after the world is built more often than not. */
  setSprites(image: HTMLImageElement | null) {
    if (!image || this.heroTexture?.image === image) return;
    this.heroTexture?.dispose();
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    // The painted sheet: smooth filtering, mipmapped for the long shots.
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.repeat.set(0.5, 0.5);
    texture.offset.set(0.5, 0.5);
    texture.needsUpdate = true;
    this.heroTexture = texture;
    this.hero.material.map = texture;
    this.hero.material.needsUpdate = true;
  }

  private buildGate(z: number, theme: CinemaTheme, art: { face: THREE.Texture; runes: THREE.Texture }): Gate {
    const group = buildGateway(this.kit, 0);
    group.position.z = z;
    const door = new THREE.MeshStandardMaterial({ map: art.face, emissiveMap: art.runes, emissive: new THREE.Color(theme.rune), emissiveIntensity: 0, metalness: 0.55, roughness: 0.42 });
    const edge = this.kit.m.bronze;
    const leaf = (side: -1 | 1) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * DOOR_W, 0, 0);
      const geometry = new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.3);
      // The front face shows its own half of the painted pair.
      const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 16; i < 20; i++) uv.setX(i, uv.getX(i) * 0.5 + (side < 0 ? 0 : 0.5));
      const slab = new THREE.Mesh(geometry, [edge, edge, edge, edge, door, edge]);
      slab.position.set(-side * DOOR_W / 2, DOOR_H / 2, 0);
      pivot.add(slab);
      return pivot;
    };
    const left = leaf(-1), right = leaf(1);
    // The lock: a gold seal split down the seam, one half on each leaf.
    const seal = new THREE.MeshStandardMaterial({ color: 0xe8b85a, metalness: 0.7, roughness: 0.48, emissive: new THREE.Color(theme.rune), emissiveIntensity: 0 });
    for (const [pivot, side] of [[left, -1], [right, 1]] as const) {
      const half = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32, side < 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), seal);
      half.position.set(-side * DOOR_W, LOCK[1], 0.17);
      pivot.add(half);
      if (side < 0) {
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.32), new THREE.MeshBasicMaterial({ color: 0x0a0602 }));
        hole.position.set(-side * DOOR_W - 0.05, LOCK[1], 0.18);
        pivot.add(hole);
      }
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.06, 8, 40), seal);
    ring.position.set(0, LOCK[1], 0.2);
    // Behind the doors: the light of the trial, hidden until they open.
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W * 2, DOOR_H), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.rune).lerp(new THREE.Color(0xfff4d8), 0.7), transparent: true, opacity: 0, depthWrite: false, fog: false }));
    portal.position.set(0, DOOR_H / 2, -0.5);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.glow, color: theme.rune, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.set(22, 16, 1);
    halo.position.set(0, DOOR_H / 2, -1);
    const light = new THREE.PointLight(theme.rune, 0, 26, 1.4);
    light.position.set(0, 3.5, 2.5);
    group.add(left, right, ring, portal, halo, light);
    this.scene.add(group);
    return { group, left, right, door, seal, portal, halo, light, ring };
  }

  /** Sky, fog, sea and sun at blend `u` from the past trial's light (journey) to this trial's. */
  private applyTheme(u: number) {
    const to = this.options.theme, from = this.options.pastTheme ?? to;
    const { a, b } = this.colours;
    const blend = (x: number, y: number) => a.set(x).lerp(b.set(y), u);
    this.sky.uniforms.top.value.copy(blend(from.sky, to.sky));
    this.sky.uniforms.horizon.value.copy(blend(from.horizon, to.horizon));
    this.sky.uniforms.bottom.value.copy(blend(from.fog, to.fog));
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(blend(from.fog, to.fog));
    fog.near = from.near + (to.near - from.near) * u;
    fog.far = from.far + (to.far - from.far) * u;
    (this.scene.background as THREE.Color).copy(fog.color);
    this.water.color.copy(blend(from.water, to.water));
    this.sun.color.copy(blend(from.sun, to.sun));
    this.sun.intensity = from.sunI + (to.sunI - from.sunI) * u;
    (this.sunGlow.material as THREE.SpriteMaterial).color.copy(this.sun.color);
    this.hemi.color.copy(blend(from.horizon, to.horizon)).lerp(b.set(0xffffff), 0.4);
    this.hemi.intensity = from.hemi + (to.hemi - from.hemi) * u;
    this.motes.material.color.copy(blend(from.rune, to.rune));
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(Math.round(w / 2), Math.round(h / 2));
    this.camera.aspect = w / h;
    // A narrow screen widens the lens so the gate still fits.
    this.camera.fov = w / h < 1.2 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  /** Draws the film at `t` seconds. */
  render(t: number) {
    const { kind } = this.options;
    const dt = Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;

    // Light.
    if (kind === "journey") this.applyTheme(span(t, 1.5, 7.2));
    for (let i = 0; i < this.braziers.length; i++) {
      const { fire, glow } = this.braziers[i].userData as { fire: THREE.Sprite; glow: THREE.Sprite };
      const f = 0.85 + 0.15 * Math.sin(t * 13 + i * 1.7) * Math.sin(t * 7.3 + i);
      fire.scale.set(0.62 * (0.92 + 0.08 * f), 0.95 * f, 1);
      glow.material.opacity = 0.75 + 0.25 * f;
    }
    this.torches.forEach((light, i) => { light.intensity = 3.2 * (0.85 + 0.15 * Math.sin(t * 11 + i * 2.1)); });

    // Gates.
    const doors = doorsAt(kind, t), runes = runesAt(kind, t), light = lightAt(kind, t);
    this.gates.forEach((gate, i) => {
      const past = kind === "journey" && i === 0;
      // The gate he walks out of stands open and quiet: its light would sit between the camera and him.
      const open = past ? 1 : doors, burn = past ? 0.35 : runes, glow = past ? 0 : light;
      gate.left.rotation.y = open * OPEN_ANGLE;
      gate.right.rotation.y = -open * OPEN_ANGLE;
      gate.door.emissiveIntensity = burn * 1.3;
      gate.seal.emissiveIntensity = burn * 0.8;
      gate.ring.rotation.z = kind === "unlock" ? keyAt(t).turn * 2 + span(t, 4.4, 5.2) * Math.PI : 0;
      gate.ring.scale.setScalar(past ? 0.001 : 1 - span(t, 5.0, 5.3) * 0.999 * (kind === "unlock" ? 1 : 0));
      gate.portal.material.opacity = glow;
      gate.halo.material.opacity = glow * 0.9;
      gate.light.intensity = glow * 22;
    });
    if (this.bloom) this.bloom.strength = 0.35 + light * 0.4;

    // The key.
    const k = kind === "unlock" ? keyAt(t) : null;
    this.key.visible = !!k?.visible;
    this.keyGlow.visible = this.key.visible;
    if (k?.visible) {
      this.key.position.set(k.x, k.y, k.z);
      // Upright while it falls, spinning on its shaft; then tipped to point into the lock and turned.
      this.key.rotation.set(k.pitch, k.spin + k.turn, 0);
      this.key.scale.setScalar(1.6 * Math.max(0.001, k.scale));
      this.keyGold.emissiveIntensity = 0.12 + k.glow * 0.35;
      this.keyGlow.position.copy(this.key.position);
      this.keyGlow.material.opacity = 0.1 + 0.12 * k.glow;
      this.keyGlow.scale.setScalar(0.5 + k.glow * 0.4);
    }
    this.keyLight.position.set(k?.x ?? 0, k?.y ?? 0, (k?.z ?? 0) + 0.8);
    this.keyLight.intensity = k?.visible ? 1 + k.glow * 2 : 0;
    this.shaft.material.opacity = kind === "unlock" ? 0.32 * span(t, 2.4, 2.8) * (1 - span(t, 3.6, 4.4)) : 0;

    // Odysseus.
    const hero = heroAt(kind, t);
    const { cam, look } = cameraAt(kind, t);
    this.camera.position.set(cam[0], cam[1], cam[2]);
    this.camera.lookAt(look[0], look[1], look[2]);
    this.stride += dt * (hero.walking ? 1.9 + hero.speed * 0.9 : 0);
    const step = hero.walking ? Math.abs(Math.sin(this.stride * Math.PI)) : 0;
    const breathe = hero.walking ? 0 : Math.sin(t * 2.2) * 0.012;
    this.hero.position.set(hero.x, step * 0.09, hero.z);
    this.hero.rotation.set(0, Math.atan2(cam[0] - hero.x, cam[2] - hero.z), hero.walking ? Math.sin(this.stride * Math.PI) * 0.035 : 0);
    this.hero.scale.set(HERO_H * (1 - step * 0.03), HERO_H * (1 + step * 0.035 + breathe), 1);
    // From behind while the camera follows him; his face when it waits ahead of him.
    if (this.heroTexture) this.heroTexture.offset.set(cam[2] > hero.z ? 0.5 : 0, 0.5);
    this.heroShadow.position.set(hero.x, 0.02, hero.z);
    // In the open doorway he walks into the light.
    this.hero.visible = !(kind === "unlock" && hero.z < -5.5);

    // Motes drift and wink.
    const pos = this.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const s = this.moteSeeds[i];
      pos.setY(i, pos.getY(i) + dt * (0.25 + (s % 1) * 0.3));
      if (pos.getY(i) > 8) pos.setY(i, 0.3);
      pos.setX(i, pos.getX(i) + Math.sin(t * 0.6 + s) * dt * 0.3);
    }
    pos.needsUpdate = true;
    this.caustics.map?.offset.set(t * 0.012, -t * 0.009);

    this.draw();
  }

  private draw() {
    const now = performance.now();
    // A machine that cannot keep up drops the bloom, then the pixel ratio, rather than the film's pace.
    if (this.lastFrameAt && now - this.lastFrameAt > 45) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    this.lastFrameAt = now;
    if (this.slowFrames > 20 && this.composer) { this.composer = null; this.slowFrames = 0; }
    else if (this.slowFrames > 20 && this.renderer.getPixelRatio() > 1) { this.renderer.setPixelRatio(1); this.resize(); this.slowFrames = 0; }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** The finished frame of a film, for a skip. */
  end() { this.render(DURATION[this.options.kind]); }

  dispose() {
    this.resizer.disconnect();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach(x => materials.add(x));
      else if (m) materials.add(m);
    });
    materials.forEach(m => m.dispose());
    Object.values(this.textures).forEach(t => t.dispose());
    this.owned.forEach(t => t.dispose());
    this.heroTexture?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
