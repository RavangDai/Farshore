// The great hall of Ithaca in 3D.
//
// Penelope's twelve axes stand in a trench down the middle of the megaron,
// their heads in a line at an archer's height. The player looks down that
// line from behind Odysseus' bow; the camera rides behind each of their
// arrows, then swings out to the colonnade to watch Antinous shoot.
//
// Placement comes from hall-view.ts, which the overlay and the flat fallback
// share, and nothing here reads back into the simulation.
//
// A 2D canvas laid over the WebGL one carries the arcade layer: the sight, the
// draw, the scoreboard, the draught and the twelve-axe track.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BOW, arrowTime, axeZ, bowSway, openingOf, strikeZ, type BowState, type Shot } from "../encounters/mythic.ts";
import { LINE_M, LINE_Y, arrowPoint, axeAt, flightOf, hallCamera, sightPoint, type Vec3 } from "./hall-view.ts";
import { HallOverlay, type HallOverlayOptions } from "./hall-overlay.ts";
import { paintHallTextures, type HallTextures } from "./hall-textures.ts";
import { VIEW_H, VIEW_W, clamp01, easeOut, type StageFrame } from "./stage.ts";

export type HallWorldOptions = HallOverlayOptions & { shakeStrength: number; effectStrength: number };

/** Inner faces of the side walls, the colonnade, and the coffered ceiling, in metres. */
const WALL_X = 5.2;
const COLUMN_X = 3.35;
const CEILING = 6.8;
/** The far doorway an arrow through all twelve flies out of, and the wall behind the archer. */
const DOOR_Z = -LINE_M * BOW.doorway;
const BACK_Z = 4.5;
const HALL_LENGTH = BACK_Z - DOOR_Z;
const HALL_MID = (BACK_Z + DOOR_Z) / 2;
/** Where the lamp stands are, either side of the line. */
const LAMP_X = 2.35;
const LAMP_ZS = [-2.1, -5.1, -8.1, -11.1, -14.1];
const COLUMN_ZS = [2.4, -0.6, -3.6, -6.6, -9.6, -12.6, -15.6];
/** The bow's cant, top to the right, so its upper limb clears the line of axes. */
const CANT = 0.5;
/**
 * Where the bow hand sits in the frame: low and to the right, as in a
 * first-person archery view, at this depth in front of the eye. It is placed
 * by the frame rather than the world so it stays put as the view narrows on
 * a full draw. The nocked arrow points at the sight; the arrow that flies
 * leaves from the line itself.
 */
const BOW_FRAME = { x: 0.52, y: -0.5, depth: 0.62 };
/** The field of view the bow is modelled at; narrower views scale it down to keep its size on screen. */
const BOW_FOV = 30;
/** Arrow shaft length, and how far the nock comes back at full draw (brace height to anchor). */
const ARROW = 0.76;
const BRACE = 0.2;
const DRAW_LENGTH = 0.5;

const v3 = (p: Vec3, out = new THREE.Vector3()) => out.set(p.x, p.y, p.z);

type Axe = { group: THREE.Group; rim: THREE.Mesh; rimMaterial: THREE.MeshStandardMaterial; narrowed: THREE.Mesh };
type Lamp = { flame: THREE.Sprite; glow: THREE.Sprite; at: THREE.Vector3; seed: number };
type Bow = {
  group: THREE.Group;
  upper: THREE.Group;
  lower: THREE.Group;
  strings: [THREE.Mesh, THREE.Mesh];
  arrow: THREE.Group;
};

/** The labrys head: two curved blades either side of a bronze ring around the opening. */
function axeHeadShape(r: number) {
  const ro = r + 0.045, reach = ro + 0.17, half = 0.12 + r * 0.25, a = 0.62;
  const s = new THREE.Shape();
  s.moveTo(Math.cos(a) * ro, Math.sin(a) * ro);
  s.quadraticCurveTo(ro + 0.08, ro * 0.92, reach, half);
  s.quadraticCurveTo(reach + 0.08, 0, reach, -half);
  s.quadraticCurveTo(ro + 0.08, -ro * 0.92, Math.cos(a) * ro, -Math.sin(a) * ro);
  s.absarc(0, 0, ro, -a, -Math.PI + a, true);
  s.quadraticCurveTo(-ro - 0.08, -ro * 0.92, -reach, -half);
  s.quadraticCurveTo(-reach - 0.08, 0, -reach, half);
  s.quadraticCurveTo(-ro - 0.08, ro * 0.92, -Math.cos(a) * ro, Math.sin(a) * ro);
  s.absarc(0, 0, ro, Math.PI - a, a, true);
  const hole = new THREE.Path();
  hole.absarc(0, 0, r, 0, Math.PI * 2, false);
  s.holes.push(hole);
  return s;
}

/** Puts a unit-height Y cylinder between two points. */
function stretch(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a), length = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  mesh.scale.set(1, Math.max(1e-4, length), 1);
}

export class HallWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.03, 70);
  private host: HTMLElement;
  private overlay: HTMLCanvasElement;
  private glCanvas: HTMLCanvasElement;
  private textures: HallTextures;
  private environment: THREE.Texture;
  private hud = new HallOverlay();

  private lamps: Lamp[] = [];
  private lampLights: THREE.PointLight[] = [];
  private axes: Axe[] = [];
  private axeTier = -1;
  private bow: Bow;
  private mine: THREE.Group;
  private his: THREE.Group;
  private lodged: THREE.Group;
  private motes: THREE.Points;
  private moteSeeds: Float32Array;

  private m: Record<"bronze" | "wood" | "gold" | "fletch" | "rivalFletch" | "string" | "grip" | "stone", THREE.MeshStandardMaterial>;
  private axeGeometry: { head: THREE.ExtrudeGeometry; haft: THREE.CylinderGeometry; rim: THREE.TorusGeometry; narrowed: THREE.TorusGeometry } | null = null;

  private size = { w: 0, h: 0, ratio: 1 };
  private maxRatio: number;
  private slowFrames = 0;
  private lastFrameAt = 0;
  private lastElapsed = 0;
  private scratch = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion() };

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
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.maxRatio = Math.min(1.75, window.devicePixelRatio || 1);
    this.size.ratio = this.maxRatio;
    this.textures = paintHallTextures(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    const t = this.textures;
    this.m = {
      bronze: new THREE.MeshStandardMaterial({ map: t.bronze, color: 0xf0c27a, metalness: 0.78, roughness: 0.3 }),
      wood: new THREE.MeshStandardMaterial({ map: t.wood, color: 0xc49a72, roughness: 0.72 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xd8ab55, metalness: 0.85, roughness: 0.3 }),
      fletch: new THREE.MeshStandardMaterial({ color: 0xf2e6cc, roughness: 0.8, side: THREE.DoubleSide }),
      rivalFletch: new THREE.MeshStandardMaterial({ color: 0x6b2a4a, roughness: 0.8, side: THREE.DoubleSide }),
      string: new THREE.MeshStandardMaterial({ color: 0xece0c4, roughness: 0.6 }),
      grip: new THREE.MeshStandardMaterial({ color: 0x4a2414, roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xe6d6b4, roughness: 0.55 }),
    };

    this.scene.background = new THREE.Color(0x24180c);
    this.scene.fog = new THREE.Fog(0x3a2814, 18, 44);
    // Bronze, gold and polished marble need something to reflect, or metal reads as flat paint.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.55;

    // Light: warm sky from the smoke-hole, the courtyard's glow through the
    // far doorway behind the axes, a key from behind the archer, and lamps.
    const hemi = new THREE.HemisphereLight(0xffebc8, 0x3b2814, 1.5);
    const door = new THREE.DirectionalLight(0xffe0a8, 1.7);
    door.position.set(0, 7, DOOR_Z - 6);
    door.target.position.set(0, 0, 0);
    const key = new THREE.DirectionalLight(0xfff0d6, 1.05);
    key.position.set(1.8, 5.5, 3.5);
    key.target.position.set(0, 1.2, -8);
    this.scene.add(hemi, door, door.target, key, key.target, this.camera);
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffa24a, 0, 9, 1.6);
      this.lampLights.push(light);
      this.scene.add(light);
    }

    this.buildRoom();
    this.buildLamps();
    this.bow = this.buildBow();
    this.mine = this.buildArrow(this.m.fletch);
    this.his = this.buildArrow(this.m.rivalFletch);
    this.lodged = this.buildArrow(this.m.rivalFletch);
    this.scene.add(this.mine, this.his, this.lodged);

    // Dust motes in the lamplight. They drift with the draught, which is how
    // the wind shows itself inside a hall.
    const count = 260;
    const positions = new Float32Array(count * 3);
    this.moteSeeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.moteSeeds[i * 3] = Math.random();
      this.moteSeeds[i * 3 + 1] = Math.random();
      this.moteSeeds[i * 3 + 2] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(geometry, new THREE.PointsMaterial({ map: t.glow, color: 0xffe2a8, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  // -------------------------------------------------------------------------
  // Building the hall
  // -------------------------------------------------------------------------

  private buildRoom() {
    const t = this.textures;
    t.floor.repeat.set((WALL_X * 2) / 2, HALL_LENGTH / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, HALL_LENGTH).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t.floor, roughness: 0.28 }));
    floor.position.z = HALL_MID;
    this.scene.add(floor);

    // The trench Telemachus dug to stand the axes in.
    const first = -BOW.firstAxeM + 0.6, last = -LINE_M - 0.6;
    const trench = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, first - last), new THREE.MeshStandardMaterial({ color: 0x2a1b0e, roughness: 0.95 }));
    trench.position.set(0, 0.006, (first + last) / 2);
    this.scene.add(trench);

    // Colonnade.
    const shaft = new THREE.CylinderGeometry(0.3, 0.34, CEILING - 0.86, 28, 1, true);
    const base = new THREE.BoxGeometry(0.9, 0.3, 0.9);
    const capital = new THREE.CylinderGeometry(0.47, 0.31, 0.34, 28);
    const abacus = new THREE.BoxGeometry(0.98, 0.14, 0.98);
    const column = new THREE.MeshStandardMaterial({ map: t.column, roughness: 0.42 });
    for (const z of COLUMN_ZS) {
      for (const x of [-COLUMN_X, COLUMN_X]) {
        const s = new THREE.Mesh(shaft, column);
        s.position.set(x, 0.3 + (CEILING - 0.86) / 2, z);
        const b = new THREE.Mesh(base, this.m.stone);
        b.position.set(x, 0.15, z);
        const cap = new THREE.Mesh(capital, this.m.gold);
        cap.position.set(x, CEILING - 0.39, z);
        const ab = new THREE.Mesh(abacus, this.m.gold);
        ab.position.set(x, CEILING - 0.07, z);
        this.scene.add(s, b, cap, ab);
      }
    }

    // Walls, with the hangings between the columns.
    t.wall.repeat.set(HALL_LENGTH / 4, 1.6);
    const wall = new THREE.MeshStandardMaterial({ map: t.wall, roughness: 0.85 });
    for (const side of [-1, 1]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(HALL_LENGTH, CEILING), wall);
      plane.rotation.y = -side * Math.PI / 2;
      plane.position.set(side * WALL_X, CEILING / 2, HALL_MID);
      this.scene.add(plane);
    }
    const drape = new THREE.MeshStandardMaterial({ map: t.drape, roughness: 0.9 });
    const hanging = new THREE.PlaneGeometry(1.7, 3.7);
    for (let i = 0; i < COLUMN_ZS.length - 1; i++) {
      const z = (COLUMN_ZS[i] + COLUMN_ZS[i + 1]) / 2;
      for (const side of [-1, 1]) {
        const d = new THREE.Mesh(hanging, drape);
        d.rotation.y = -side * Math.PI / 2;
        d.position.set(side * (WALL_X - 0.04), 3.05, z);
        this.scene.add(d);
      }
    }

    t.ceiling.repeat.set(WALL_X, HALL_LENGTH / 2);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, HALL_LENGTH).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: t.ceiling, roughness: 0.8 }));
    ceiling.position.set(0, CEILING, HALL_MID);
    this.scene.add(ceiling);

    // The far wall, its doorway, and the bright courtyard beyond.
    const farWall = new THREE.MeshStandardMaterial({ map: t.wall, roughness: 0.85 });
    const doorHalf = 1.05, doorHigh = 3.3;
    for (const side of [-1, 1]) {
      const width = WALL_X - doorHalf;
      const part = new THREE.Mesh(new THREE.PlaneGeometry(width, CEILING), farWall);
      part.position.set(side * (doorHalf + width / 2), CEILING / 2, DOOR_Z);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, doorHigh, 0.3), this.m.gold);
      post.position.set(side * (doorHalf + 0.11), doorHigh / 2, DOOR_Z + 0.05);
      this.scene.add(part, post);
    }
    const lintel = new THREE.Mesh(new THREE.PlaneGeometry(doorHalf * 2, CEILING - doorHigh), farWall);
    lintel.position.set(0, doorHigh + (CEILING - doorHigh) / 2, DOOR_Z);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(doorHalf * 2 + 0.44, 0.24, 0.32), this.m.gold);
    beam.position.set(0, doorHigh + 0.12, DOOR_Z + 0.05);
    const courtyard = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: t.courtyard, fog: false }));
    courtyard.position.set(0, 3.2, DOOR_Z - 2.2);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.glow, color: 0xffe0a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sun.scale.set(4.6, 4.6, 1);
    sun.position.set(0, 1.6, DOOR_Z - 0.2);
    this.scene.add(lintel, beam, courtyard, sun);

    // The wall behind the archer, seen from the gallery.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, CEILING), farWall);
    back.rotation.y = Math.PI;
    back.position.set(0, CEILING / 2, BACK_Z);
    this.scene.add(back);
  }

  /** Tall bronze lamp stands either side of the line, as on the trial card. */
  private buildLamps() {
    const t = this.textures;
    const pole = new THREE.CylinderGeometry(0.03, 0.05, 1.9, 10);
    const foot = new THREE.CylinderGeometry(0.02, 0.025, 0.42, 6);
    const bowl = new THREE.CylinderGeometry(0.17, 0.06, 0.12, 16);
    LAMP_ZS.forEach((z, zi) => {
      for (const x of [-LAMP_X, LAMP_X]) {
        const stand = new THREE.Group();
        const p = new THREE.Mesh(pole, this.m.bronze);
        p.position.y = 0.95 + 0.12;
        stand.add(p);
        for (let k = 0; k < 3; k++) {
          const f = new THREE.Mesh(foot, this.m.bronze);
          const angle = (k / 3) * Math.PI * 2;
          f.position.set(Math.cos(angle) * 0.13, 0.17, Math.sin(angle) * 0.13);
          f.rotation.set(Math.sin(angle) * 0.6, 0, -Math.cos(angle) * 0.6);
          stand.add(f);
        }
        const b = new THREE.Mesh(bowl, this.m.gold);
        b.position.y = 2.08;
        stand.add(b);
        stand.position.set(x, 0, z);
        this.scene.add(stand);
        const at = new THREE.Vector3(x, 2.32, z);
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.flame, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        flame.scale.set(0.24, 0.44, 1);
        flame.position.copy(at);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.glow, color: 0xffa955, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.set(1.6, 1.6, 1);
        glow.position.copy(at);
        this.scene.add(flame, glow);
        this.lamps.push({ flame, glow, at, seed: zi * 2 + (x > 0 ? 1 : 0) });
      }
    });
  }

  /** The twelve axes, built for the tier's opening the first time it is known. */
  private ensureAxes(difficulty: BowState["difficulty"]) {
    const tier = ["easy", "normal", "hard"].indexOf(difficulty);
    if (tier === this.axeTier) return;
    for (const axe of this.axes) {
      this.scene.remove(axe.group);
      axe.rimMaterial.dispose();
      (axe.narrowed.material as THREE.Material).dispose();
    }
    if (this.axeGeometry) Object.values(this.axeGeometry).forEach(g => g.dispose());
    this.axes = [];
    this.axeTier = tier;
    const r = openingOf(difficulty, 1) * BOW.unitM, ro = r + 0.05;
    const head = new THREE.ExtrudeGeometry(axeHeadShape(r), { depth: 0.036, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 28 });
    head.translate(0, 0, -0.018);
    const haftLength = LINE_Y - ro + 0.03;
    const haft = new THREE.CylinderGeometry(0.026, 0.032, haftLength, 10).translate(0, haftLength / 2, 0);
    const rim = new THREE.TorusGeometry(r + 0.004, 0.012, 8, 48);
    const narrowed = new THREE.TorusGeometry(r * BOW.blockedShare, 0.01, 8, 40);
    this.axeGeometry = { head, haft, rim, narrowed };
    for (let i = 1; i <= BOW.axes; i++) {
      const group = new THREE.Group();
      const h = new THREE.Mesh(head, this.m.bronze);
      h.position.y = LINE_Y;
      const shaft = new THREE.Mesh(haft, this.m.wood);
      const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xffd58a, metalness: 0.9, roughness: 0.22, emissive: 0x000000 });
      const ring = new THREE.Mesh(rim, rimMaterial);
      ring.position.y = LINE_Y;
      const tight = new THREE.Mesh(narrowed, new THREE.MeshBasicMaterial({ color: 0xff6a4e, transparent: true, opacity: 0.85 }));
      tight.position.y = LINE_Y;
      tight.visible = false;
      group.add(h, shaft, ring, tight);
      group.position.z = axeAt(i).z;
      this.scene.add(group);
      this.axes.push({ group, rim: ring, rimMaterial, narrowed: tight });
    }
  }

  /**
   * One arrow: bronze head at the origin pointing +z, ash shaft and three vanes
   * behind it. The nocked arrow's vanes sit right by the eye, so it draws them small.
   */
  private buildArrow(fletch: THREE.MeshStandardMaterial, vanes = 1) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, ARROW, 6).rotateX(Math.PI / 2).translate(0, 0, -ARROW / 2), this.m.wood);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.08, 8).rotateX(Math.PI / 2), this.m.bronze);
    g.add(shaft, head);
    // Each vane lies along the shaft, standing out from it; three, a third of a turn apart.
    const vane = new THREE.PlaneGeometry(0.024, 0.12).rotateX(Math.PI / 2).translate(0.016, 0, 0);
    for (let k = 0; k < 3; k++) {
      const v = new THREE.Mesh(vane, fletch);
      v.rotation.z = (k / 3) * Math.PI * 2;
      v.position.z = -ARROW + 0.09;
      v.scale.setScalar(vanes);
      g.add(v);
    }
    g.visible = false;
    return g;
  }

  /**
   * Odysseus' great bow, held at arm's length in front of the camera. In its
   * own frame the arrow rest is the origin, the arrow points `-z`, and the
   * limbs bend back toward the archer (`+z`) with recurved tips.
   */
  private buildBow(): Bow {
    const group = new THREE.Group();
    const limbCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.1, 0.0),
      new THREE.Vector3(0, 0.3, 0.05),
      new THREE.Vector3(0, 0.5, 0.1),
      new THREE.Vector3(0, 0.63, 0.1),
      new THREE.Vector3(0, 0.7, 0.06),
    ]);
    const limbGeometry = new THREE.TubeGeometry(limbCurve, 24, 0.011, 8, false);
    const limbs: THREE.Group[] = [];
    for (const side of [1, -1]) {
      const limb = new THREE.Group();
      const mesh = new THREE.Mesh(limbGeometry, this.m.wood);
      mesh.scale.y = side;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), this.m.gold);
      tip.position.set(0, 0.7 * side, 0.06);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), this.m.gold);
      band.position.set(0, 0.12 * side, 0.005);
      limb.add(mesh, tip, band);
      limb.position.set(0.024, 0, 0);
      group.add(limb);
      limbs.push(limb);
    }
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.24, 12), this.m.grip);
    grip.position.set(0.024, 0, 0);
    group.add(grip);
    const string = () => new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 6), this.m.string);
    const strings: [THREE.Mesh, THREE.Mesh] = [string(), string()];
    group.add(...strings);
    const arrow = this.buildArrow(this.m.fletch, 0.45);
    arrow.visible = true;
    group.add(arrow);
    group.visible = false;
    this.camera.add(group);
    return { group, upper: limbs[0], lower: limbs[1], strings, arrow };
  }

  // -------------------------------------------------------------------------
  // Each frame
  // -------------------------------------------------------------------------

  render(s: BowState, frame: StageFrame, options: HallWorldOptions) {
    const now = options.still ? 0 : frame.now;
    // A restarted attempt reuses this view: transient effects restart with it.
    if (s.elapsed + 500 < this.lastElapsed) this.hud.reset();
    this.lastElapsed = s.elapsed;
    this.resize();
    this.governQuality();
    this.ensureAxes(s.difficulty);

    const cam = hallCamera(s);
    this.camera.position.copy(v3(cam.eye));
    this.camera.lookAt(v3(cam.look));
    if (this.camera.fov !== cam.fov) {
      this.camera.fov = cam.fov;
      this.camera.updateProjectionMatrix();
    }
    this.shake(s, options);
    this.camera.updateMatrixWorld();

    this.placeBow(s);
    this.placeArrows(s);
    this.lightAxes(s, now);
    this.animateLamps(s, now);
    this.animateMotes(s, now, options);

    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(s, cam, frame, options);
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    if (w === this.size.w && h === this.size.h && this.renderer.getPixelRatio() === this.size.ratio) return;
    this.size.w = w;
    this.size.h = h;
    this.renderer.setPixelRatio(this.size.ratio);
    this.renderer.setSize(w, h, false);
    // The stage is letterboxed to 16:9, the overlay's logical space; holding
    // the camera to it keeps the overlay's projection exact.
    this.camera.aspect = VIEW_W / VIEW_H;
    this.camera.updateProjectionMatrix();
  }

  /** Drop the render resolution on a machine that cannot hold the frame rate. It only steps down. */
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

  /** A short jolt as the player's arrow strikes an axe. */
  private shake(s: BowState, options: HallWorldOptions) {
    const f = flightOf(s);
    if (!f || !f.landed || f.shot.owner !== "player" || f.shot.rings >= BOW.axes || options.still) return;
    const k = Math.max(0, 1 - f.since / 260) * 0.012 * options.shakeStrength;
    if (k <= 0) return;
    this.camera.position.x += Math.sin(f.since * 0.21) * k;
    this.camera.position.y += Math.cos(f.since * 0.17) * k;
  }

  /** The bow and nocked arrow, drawn back with the draw and pointed at the sight. */
  private placeBow(s: BowState) {
    const b = this.bow, { a, b: tipA, c: tipB, q, q2 } = this.scratch;
    const loosedFor = s.phase === "rival" && s.shot?.owner === "player" ? s.timer : Infinity;
    const aiming = s.phase === "player";
    b.group.visible = aiming || loosedFor < 220;
    if (!b.group.visible) return;
    // The bow hand, placed by the frame, and the sight brought from the world into camera space.
    const half = Math.tan((this.camera.fov * Math.PI) / 360), size = half / Math.tan((BOW_FOV * Math.PI) / 360);
    const rest = a.set(BOW_FRAME.x * half * this.camera.aspect * BOW_FRAME.depth, BOW_FRAME.y * half * BOW_FRAME.depth, -BOW_FRAME.depth);
    const settle = aiming ? easeOut(clamp01((s.timer - 250) / 650)) : 1;
    b.group.position.set(rest.x, rest.y - (1 - settle) * 0.45 * size, rest.z);
    b.group.scale.setScalar(size);
    const sway = bowSway(s);
    const sight = sightPoint(aiming ? { aim: s.aim.aim + sway.aim, elevation: s.aim.elevation + sway.elevation } : s.shot?.aim ?? { aim: 0, elevation: 0 });
    const target = this.camera.worldToLocal(tipA.set(sight.x, sight.y, sight.z)).sub(rest).normalize();
    q.setFromUnitVectors(tipB.set(0, 0, -1), target);
    q2.setFromAxisAngle(target, CANT);
    b.group.quaternion.copy(q2).multiply(q);
    // Limbs flex back toward the archer as the string comes to the anchor.
    const draw = aiming ? easeOut(s.draw) : 0;
    b.upper.rotation.x = draw * 0.16;
    b.lower.rotation.x = -draw * 0.16;
    const nock = BRACE + DRAW_LENGTH * draw;
    const upperTip = tipA.set(0, 0.7, 0.06).applyAxisAngle(new THREE.Vector3(1, 0, 0), draw * 0.16).add(b.upper.position);
    const lowerTip = tipB.set(0, -0.7, 0.06).applyAxisAngle(new THREE.Vector3(1, 0, 0), -draw * 0.16).add(b.lower.position);
    const nockAt = new THREE.Vector3(0, 0, nock);
    stretch(b.strings[0], upperTip, nockAt);
    stretch(b.strings[1], lowerTip, nockAt);
    // The arrow sits on the string, pointing away down the hall, until it is loosed.
    b.arrow.visible = aiming;
    b.arrow.position.set(0, 0, nock - ARROW);
    b.arrow.rotation.set(0, Math.PI, 0);
  }

  /** Arrows in flight, struck in an axe, or lodged by Antinous to narrow an opening. */
  private placeArrows(s: BowState) {
    const f = flightOf(s);
    // Yours flies while Antinous waits, and stays where it struck while he shoots.
    const mine = f?.shot.owner === "player" ? f : s.phase === "review" && s.lastShot ? { shot: s.lastShot, z: strikeZ(s.lastShot), end: strikeZ(s.lastShot), landed: true, since: 9999 } : null;
    this.placeArrow(this.mine, mine);
    this.placeArrow(this.his, f?.shot.owner === "rival" ? f : null);
    // Antinous' block arrow sits in the narrowed opening for the player's next shot.
    const blocked = s.phase === "player" ? s.blocked : f?.shot.owner === "player" ? f.shot.block : 0;
    this.lodged.visible = blocked > 0;
    if (blocked > 0) {
      const at = axeAt(blocked), r = openingOf(s.difficulty, blocked) * BOW.unitM;
      this.lodged.position.set(-r * 0.62, LINE_Y + r * 0.62, at.z + 0.005);
      this.lodged.lookAt(this.scratch.a.set(-r * 0.62, LINE_Y + r * 0.62, at.z - 1));
    }
  }

  private placeArrow(arrow: THREE.Group, f: { shot: Shot; z: number; end: number; landed: boolean; since: number } | null) {
    arrow.visible = !!f;
    if (!f) return;
    const perfect = f.shot.rings >= BOW.axes;
    // A perfect arrow sails on out of the doorway into the light.
    const z = perfect && f.landed ? f.end + f.since / BOW.reachMs : f.z;
    if (perfect && z > BOW.doorway + 0.3) {
      arrow.visible = false;
      return;
    }
    const at = arrowPoint(f.shot, z), ahead = arrowPoint(f.shot, z + 0.01);
    arrow.position.set(at.x, at.y, at.z);
    arrow.lookAt(this.scratch.a.set(ahead.x, ahead.y, ahead.z));
    if (f.landed && !perfect) {
      // Driven into the bronze: a little way in, quivering as it settles.
      arrow.translateZ(0.025);
      const quiver = Math.exp(-f.since / 320) * Math.sin(f.since / 24) * 0.05;
      arrow.rotateX(quiver);
      arrow.rotateY(quiver * 0.6);
    }
  }

  /** Openings flash gold as an arrow threads them; the struck axe and a narrowed opening glow red. */
  private lightAxes(s: BowState, now: number) {
    const f = flightOf(s);
    const blocked = s.phase === "player" ? s.blocked : f?.shot.owner === "player" ? f.shot.block : 0;
    this.axes.forEach((axe, index) => {
      const i = index + 1;
      let glow = 0, colour = 0xffc65a;
      if (f) {
        const reached = f.t - arrowTime(axeZ(i));
        if (i <= f.shot.rings && reached >= 0) glow = Math.max(0.35, 1 - reached / 900);
        if (i === f.shot.rings + 1 && f.landed) {
          glow = 0.6 + 0.4 * Math.sin(now / 90);
          colour = 0xff5a3c;
        }
        if (f.shot.owner === "rival" && colour !== 0xff5a3c) colour = 0xff9a6a;
      }
      if (blocked === i) {
        glow = Math.max(glow, 0.55 + 0.25 * Math.sin(now / 160));
        colour = 0xff5a3c;
      }
      axe.rimMaterial.emissive.setHex(colour);
      axe.rimMaterial.emissiveIntensity = glow * 2.2;
      axe.narrowed.visible = blocked === i;
    });
  }

  /** Lamp flames flicker and lean with the draught; the four nearest the camera cast light. */
  private animateLamps(s: BowState, now: number) {
    const lean = -s.wind * 0.006;
    for (const lamp of this.lamps) {
      const flicker = 0.88 + Math.sin(now * 0.019 + lamp.seed * 2.1) * 0.08 + Math.sin(now * 0.051 + lamp.seed) * 0.04;
      lamp.flame.scale.set(0.24 * flicker, 0.44 * (0.9 + flicker * 0.12), 1);
      (lamp.flame.material as THREE.SpriteMaterial).rotation = lean + Math.sin(now * 0.004 + lamp.seed) * 0.04;
      (lamp.glow.material as THREE.SpriteMaterial).opacity = 0.38 * flicker;
    }
    const eye = this.camera.position;
    const nearest = [...this.lamps].sort((a, b) => a.at.distanceToSquared(eye) - b.at.distanceToSquared(eye));
    this.lampLights.forEach((light, i) => {
      const lamp = nearest[i];
      light.position.copy(lamp.at);
      light.intensity = 16 * (0.9 + Math.sin(now * 0.019 + lamp.seed * 2.1) * 0.08);
    });
  }

  /** Motes drift down the hall with the draught, so the wind is visible in the light. */
  private animateMotes(s: BowState, now: number, options: HallWorldOptions) {
    const attribute = this.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    const drift = options.still ? 0 : now / 1000;
    const span = WALL_X * 2 - 1;
    for (let i = 0; i < attribute.count; i++) {
      const sx = this.moteSeeds[i * 3], sy = this.moteSeeds[i * 3 + 1], sz = this.moteSeeds[i * 3 + 2];
      const x = ((((sx * span + drift * s.wind * 0.028 + Math.sin(drift * 0.6 + sz * 9) * 0.15) % span) + span) % span) - span / 2;
      const y = 0.4 + ((sy * 4.6 - drift * 0.05) % 4.6 + 4.6) % 4.6;
      const z = BACK_Z - 1 - sz * (HALL_LENGTH - 2);
      attribute.setXYZ(i, x, y, z);
    }
    attribute.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).opacity = 0.35 + 0.35 * clamp01(options.effectStrength);
  }

  private drawOverlay(s: BowState, cam: ReturnType<typeof hallCamera>, frame: StageFrame, options: HallWorldOptions) {
    const canvas = this.overlay;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = this.size.w, h = this.size.h;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    const c = canvas.getContext("2d");
    if (!c) return;
    c.setTransform((ratio * w) / VIEW_W, 0, 0, (ratio * h) / VIEW_H, 0, 0);
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    this.hud.draw(c, s, cam, frame, { ...options, stageHeight: h });
  }

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(child => {
      const item = child as THREE.Mesh;
      if (item.geometry) geometries.add(item.geometry);
      const material = item.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach(entry => materials.add(entry));
      else if (material) materials.add(material);
    });
    Object.values(this.m).forEach(material => materials.add(material));
    for (const material of materials) material.dispose();
    geometries.forEach(geometry => geometry.dispose());
    Object.values(this.textures).forEach(texture => texture.dispose());
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.glCanvas.remove();
    this.hud.reset();
  }
}
