// Cyclops' Cave renderer.
//
// A pseudo-3D cave corridor. Everything the simulation owns carries a `z`
// distance in metres, and `project` turns that into a screen position and a
// scale with a single perspective divide. Nothing here reads or writes game
// state: the scene is a pure function of a state snapshot plus a decorative
// clock, so pausing freezes the cave and reduced motion freezes only the
// decoration.

import {
  AVOIDANCE,
  LANE_SPAN,
  MAX_GAP,
  SPAWN_Z,
  START_GAP,
  caveProgress,
  type CaveState,
  type Obstacle,
} from "../encounters/cave-runner.ts";
import {
  EventStamp,
  Particles,
  VIEW_H,
  VIEW_W,
  clamp,
  clamp01,
  easeOut,
  ellipseShadow,
  fillCircle,
  glow,
  hash01,
  lerp,
  roundedRect,
  shakeOffset,
  type StageFrame,
} from "./stage.ts";

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Screen row the corridor converges on. */
const HORIZON_Y = 322;
/** Screen row of the player's own plane (z = 0). */
const GROUND_Y = 806;
/** Metres the camera sits behind Odysseus. Also the normalising depth. */
const CAM_Z = 11.5;
/** Half-width of the corridor at the player's plane, in logical pixels. */
const LANE_PX = 292;
const CENTRE_X = VIEW_W / 2;

export type Projected = { x: number; y: number; scale: number };

/**
 * Project a world point onto the screen.
 *
 * `d` is the perspective divide, normalised so the player's own plane sits at
 * exactly 1. Anything at or behind the camera is clamped to a thin sliver so a
 * stray entity can never produce an inverted or enormous shape.
 */
export function project(z: number, laneOffset: number): Projected {
  const depth = Math.max(0.6, z + CAM_Z);
  const d = CAM_Z / depth;
  return {
    x: CENTRE_X + laneOffset * LANE_PX * d,
    y: HORIZON_Y + (GROUND_Y - HORIZON_Y) * d,
    scale: d,
  };
}

/** Screen x of a lane index at a given depth. */
const laneAt = (lane: number, z: number) => project(z, (lane - 1) * LANE_SPAN);

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const GOLD = "#e9b85c";
const CYAN = "#32d4f5";
const EMBER = "#ff9a3c";
const CREAM = "#f6f0e3";
const DANGER = "#f4604f";

type ZoneTint = { top: string; mid: string; floor: string; rock: string; haze: string; light: number };

function zoneTint(s: CaveState, progress: number): ZoneTint {
  if (s.zone === "daylight") {
    // The cave mouth brightens across the last stretch.
    const t = clamp01((progress - 0.78) / 0.22);
    return {
      top: `rgb(${Math.round(lerp(20, 96, t))},${Math.round(lerp(26, 126, t))},${Math.round(lerp(46, 150, t))})`,
      mid: `rgb(${Math.round(lerp(34, 132, t))},${Math.round(lerp(30, 138, t))},${Math.round(lerp(42, 140, t))})`,
      floor: "#2b2630",
      rock: "#3a3344",
      haze: `rgba(255,236,186,${0.08 + t * 0.3})`,
      light: 0.55 + t * 0.45,
    };
  }
  if (s.zone === "collapse") {
    return { top: "#2a1c30", mid: "#44303d", floor: "#3b2f36", rock: "#4d3b48", haze: "rgba(255,170,96,0.13)", light: 0.78 };
  }
  return { top: "#131a2f", mid: "#27304a", floor: "#2e2f3d", rock: "#3a3d52", haze: "rgba(140,185,230,0.08)", light: 0.7 };
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export type CaveOverlay = {
  /** Reveal the AI's locked target lane and countdown in the world. */
  showTarget: boolean;
  /** Reveal the forecast lane and its probability (debug/lab only). */
  showPrediction: boolean;
  /** Reveal the recent lane history trail (debug/lab only). */
  showHistory: boolean;
};

export type CaveSprites = {
  hero: HTMLImageElement | null;
  items: HTMLImageElement | null;
};

export type CaveSceneOptions = {
  still: boolean;
  /** 0 disables shake, 1 is full. */
  shakeStrength: number;
  /** 0 disables decorative particles, 1 is full. */
  effectStrength: number;
  overlay: CaveOverlay;
  sprites: CaveSprites;
};

/**
 * Per-run renderer. Holds only presentation state: particle pool, event
 * trackers, and a decorative clock. Constructed once per attempt.
 */
export class CaveScene {
  private particles = new Particles(240);
  private hitStamp = new EventStamp();
  private landStamp = new EventStamp();
  private pickupStamp = new EventStamp();
  private footDistance = 0;
  private lastDistance = 0;
  private torchSeed = 0;

  reset() {
    this.particles.clear();
    this.hitStamp.reset();
    this.landStamp.reset();
    this.pickupStamp.reset();
    this.footDistance = 0;
    this.lastDistance = 0;
  }

  draw(c: CanvasRenderingContext2D, s: CaveState, frame: StageFrame, options: CaveSceneOptions) {
    const progress = caveProgress(s);
    const tint = zoneTint(s, progress);
    const now = options.still ? 0 : frame.now;
    const effects = options.effectStrength;

    this.spawnEventEffects(s, options);
    if (effects > 0) this.spawnAmbient(s, frame, options);
    this.particles.update(options.still ? 0 : frame.dt);

    const [shakeX, shakeY] = shakeOffset(s.shake, frame.now, options.shakeStrength);
    c.save();
    c.translate(shakeX, shakeY);

    this.drawSky(c, tint, s, progress, now);
    this.drawFarRidges(c, tint, s, now);
    this.drawPolyphemus(c, s, now, options);
    this.drawWalls(c, tint, s, now, options);
    this.drawFloor(c, tint, s, now);
    this.drawLaneGuides(c, s, options);
    this.drawWorldEntities(c, s, now, options);
    this.drawBoulders(c, s, options);
    this.drawHero(c, s, now, options);
    this.particles.draw(c);
    this.drawForeground(c, tint, s, now, options);
    this.drawCallouts(c, s);

    c.restore();

    // Damage flash and the vignette sit outside the shake so they stay steady.
    if (s.flash > 0) {
      c.save();
      c.globalAlpha = clamp01(s.flash / 320) * 0.4;
      c.fillStyle = DANGER;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      c.restore();
    }
    this.drawVignette(c, s);
  }

  // -- Effects -----------------------------------------------------------

  private spawnEventEffects(s: CaveState, options: CaveSceneOptions) {
    if (options.effectStrength <= 0) return;
    const player = project(0, s.laneX);
    if (this.hitStamp.fired(s.struckAt)) {
      this.particles.burst(player.x, player.y - 60, 22, i => ({
        vx: Math.cos((i / 22) * Math.PI * 2) * (120 + hash01(i) * 180),
        vy: Math.sin((i / 22) * Math.PI * 2) * (90 + hash01(i * 3) * 140) - 60,
        size: 4 + hash01(i * 7) * 6,
        colour: i % 3 === 0 ? DANGER : "#d8c7a8",
        gravity: 520,
        max: 520,
        kind: "shard",
      }));
      this.particles.spawn({ x: player.x, y: player.y - 50, vx: 0, vy: 0, size: 30, colour: DANGER, gravity: 0, max: 420, kind: "ring" });
    }
    if (this.landStamp.fired(s.landedAt)) {
      this.particles.burst(player.x, player.y + 6, 14, i => ({
        vx: (hash01(i) - 0.5) * 260,
        vy: -40 - hash01(i * 5) * 70,
        size: 5 + hash01(i * 11) * 7,
        colour: "#cdbfa6",
        gravity: 420,
        max: 460,
        kind: "dust",
      }));
    }
    if (this.pickupStamp.fired(s.pickupAt)) {
      this.particles.burst(player.x, player.y - 110, 16, i => ({
        vx: (hash01(i) - 0.5) * 200,
        vy: -120 - hash01(i * 2) * 140,
        size: 3 + hash01(i * 13) * 4,
        colour: i % 2 ? GOLD : CREAM,
        gravity: 260,
        max: 620,
        kind: "spark",
      }));
      this.particles.spawn({ x: player.x, y: player.y - 110, vx: 0, vy: 0, size: 22, colour: GOLD, gravity: 0, max: 460, kind: "ring" });
    }
  }

  private spawnAmbient(s: CaveState, frame: StageFrame, options: CaveSceneOptions) {
    if (options.still) return;
    const strength = options.effectStrength;
    // Footfall dust, driven by distance travelled so it tracks real speed.
    const stride = 2.6;
    this.footDistance += Math.max(0, s.distance - this.lastDistance);
    this.lastDistance = s.distance;
    if (this.footDistance >= stride && s.jump <= 0) {
      this.footDistance = 0;
      const player = project(0, s.laneX);
      this.particles.burst(player.x + (Math.random() - 0.5) * 40, player.y + 4, Math.round(3 * strength) + 1, i => ({
        vx: (hash01(i + s.distance) - 0.5) * 140,
        vy: -30 - hash01(i) * 50,
        size: 3 + hash01(i * 3) * 4,
        colour: "#b6a98f",
        gravity: 300,
        max: 380,
        kind: "dust",
      }));
    }
    // Ceiling grit in the collapsing section, embers near the torches.
    if (s.zone !== "cave" && Math.random() < 0.3 * strength) {
      const x = Math.random() * VIEW_W;
      this.particles.spawn({
        x,
        y: HORIZON_Y - 40,
        vx: (Math.random() - 0.5) * 30,
        vy: 90 + Math.random() * 140,
        size: 2 + Math.random() * 3,
        colour: "#9f907a",
        gravity: 120,
        max: 2600,
        kind: "dust",
      });
    }
    if (Math.random() < 0.22 * strength) {
      this.particles.spawn({
        x: Math.random() < 0.5 ? 120 + Math.random() * 180 : VIEW_W - 300 + Math.random() * 180,
        y: 520 + Math.random() * 220,
        vx: (Math.random() - 0.5) * 40,
        vy: -60 - Math.random() * 90,
        size: 2 + Math.random() * 2.5,
        colour: Math.random() < 0.5 ? EMBER : "#ffd08a",
        gravity: -30,
        max: 1500,
        kind: "ember",
      });
    }
    void frame;
  }

  // -- Layers ------------------------------------------------------------

  private drawSky(c: CanvasRenderingContext2D, tint: ZoneTint, s: CaveState, progress: number, now: number) {
    const g = c.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, tint.top);
    g.addColorStop(0.42, tint.mid);
    g.addColorStop(1, tint.floor);
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    // The vanishing point: a cave throat in the first sections, widening into
    // daylight in the last one.
    const open = s.zone === "daylight" ? clamp01((progress - 0.78) / 0.22) : 0;
    const mouthW = lerp(96, 560, open);
    const mouthH = lerp(70, 330, open);
    if (open > 0.01) {
      glow(c, CENTRE_X, HORIZON_Y + 30, mouthW * 1.9, `rgba(255,243,206,${0.5 * open})`, "rgba(255,243,206,0)");
      const sky = c.createLinearGradient(0, HORIZON_Y - mouthH, 0, HORIZON_Y + mouthH);
      sky.addColorStop(0, "#bfe6f7");
      sky.addColorStop(0.55, "#f6e6bd");
      sky.addColorStop(1, "#d6b982");
      c.fillStyle = sky;
      c.beginPath();
      c.ellipse(CENTRE_X, HORIZON_Y + 34, mouthW, mouthH, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillStyle = "#05070f";
      c.beginPath();
      c.ellipse(CENTRE_X, HORIZON_Y + 26, mouthW, mouthH, 0, 0, Math.PI * 2);
      c.fill();
      glow(c, CENTRE_X, HORIZON_Y + 26, 230, "rgba(70,96,150,0.18)", "rgba(70,96,150,0)");
    }
    // A slow haze keeps the depth readable without hiding hazards.
    c.fillStyle = tint.haze;
    c.fillRect(0, HORIZON_Y - 120, VIEW_W, 420);
    void now;
  }

  private drawFarRidges(c: CanvasRenderingContext2D, tint: ZoneTint, s: CaveState, now: number) {
    // Two parallax bands. Their offsets come from distance travelled, so the
    // depth cue is tied to real speed rather than to wall-clock time.
    const slow = -s.distance * 1.6;
    const mid = -s.distance * 3.4;
    c.save();
    c.globalAlpha = 0.75;
    this.ridge(c, HORIZON_Y + 18, 54, 1.7, tint.rock, slow);
    c.globalAlpha = 0.9;
    this.ridge(c, HORIZON_Y + 52, 86, 3.1, tint.floor, mid);
    c.restore();
    void now;
  }

  private ridge(
    c: CanvasRenderingContext2D,
    y: number,
    height: number,
    seed: number,
    fill: string,
    offset: number,
  ) {
    // Stalactites above and rubble below, drawn as one silhouette band.
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(0, y + height);
    for (let x = 0; x <= VIEW_W; x += 40) {
      const n = Math.sin((x + offset) * 0.006 + seed) * 0.6 + Math.sin((x + offset) * 0.019 + seed * 3.1) * 0.4;
      c.lineTo(x, y + n * height);
    }
    c.lineTo(VIEW_W, y + height);
    c.closePath();
    c.fill();
  }

  /**
   * Polyphemus.
   *
   * He is nine metres tall and the corridor arches behind the runner, so his
   * head and shoulders stay in frame although his feet are behind the camera.
   * On-screen size maps the chase gap directly: closing the gap grows him and
   * walks him down the frame. The numeric gap is also on the HUD, so the
   * staging never has to carry the information on its own.
   */
  /**
   * Polyphemus.
   *
   * He is nine metres tall and the corridor arches behind the runner, so his
   * head and shoulders stay in frame although his feet are behind the camera.
   * On-screen size maps the chase gap directly: closing the gap grows him and
   * walks him down the frame until he fills the passage. The numeric gap is
   * also on the HUD, so the staging never has to carry the information alone.
   */
  private drawPolyphemus(c: CanvasRenderingContext2D, s: CaveState, now: number, options: CaveSceneOptions) {
    const cy = s.cyclops;
    const near = clamp01(1 - (cy.gap - 8) / (START_GAP - 8));
    const scale = lerp(0.55, 1.8, near * near);
    // Anchored by the crown of his head rather than by a notional foot line:
    // his legs are behind the camera, so only the head position is meaningful,
    // and this keeps him inside the frame at every size.
    const CROWN = 518;
    const headTop = lerp(152, 26, near);
    const stridePhase = (cy.stride / 1000) * Math.PI * 2;
    const sway = options.still ? 0 : Math.sin(stridePhase) * 26 * scale;
    const lurch = options.still ? 0 : Math.abs(Math.sin(stridePhase)) * 20 * scale;
    const x = CENTRE_X + sway;
    const y = headTop + CROWN * scale - lurch;
    const winding = cy.state === "winding";
    const roaring = cy.state === "roaring" || now - cy.roarAt < 620;
    const wind = winding ? easeOut(1 - cy.timer / Math.max(1, cy.windTotal)) : 0;

    c.save();
    c.translate(x, y);
    c.scale(scale, scale);

    // He blocks the passage, so light pools behind and around him.
    glow(c, 0, -170, 520, `rgba(255,138,60,${0.12 + near * 0.22})`, "rgba(255,138,60,0)");

    const body = c.createLinearGradient(0, -470, 0, 150);
    body.addColorStop(0, "#453450");
    body.addColorStop(0.45, "#2b2135");
    body.addColorStop(1, "#120d1a");

    // Legs, planted wide, reaching below the frame.
    c.fillStyle = "#171120";
    for (const side of [-1, 1]) {
      const kick = options.still ? 0 : Math.sin(stridePhase + (side > 0 ? Math.PI : 0)) * 34;
      c.beginPath();
      c.moveTo(side * 40, -40);
      c.lineTo(side * 150, -30);
      c.lineTo(side * 168 + kick, 320);
      c.lineTo(side * 58 + kick, 320);
      c.closePath();
      c.fill();
    }

    // Torso: tall, hunched, square-shouldered. Height over width is what makes
    // him read as a giant stooping under a low roof rather than as a boulder.
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(-168, 60);
    c.lineTo(-196, -168);
    c.lineTo(-174, -300);
    c.lineTo(-104, -366);
    c.lineTo(-38, -392);
    c.lineTo(52, -388);
    c.lineTo(126, -352);
    c.lineTo(186, -282);
    c.lineTo(202, -150);
    c.lineTo(178, 60);
    c.closePath();
    c.fill();

    // A lit rim down one side picks the silhouette off the cave wall.
    c.strokeStyle = `rgba(255,164,86,${0.26 + near * 0.3})`;
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(-174, -300);
    c.lineTo(-104, -366);
    c.lineTo(-38, -392);
    c.stroke();

    // Neck and head, set forward of the shoulders.
    c.fillStyle = "#3a2c44";
    c.beginPath();
    c.moveTo(-62, -372);
    c.lineTo(-78, -452);
    c.lineTo(-30, -512);
    c.lineTo(44, -508);
    c.lineTo(86, -450);
    c.lineTo(74, -368);
    c.closePath();
    c.fill();
    // Matted hair across the crown, and a heavy brow ridge.
    c.fillStyle = "#1b1424";
    c.beginPath();
    c.moveTo(-80, -448);
    c.lineTo(-34, -518);
    c.lineTo(48, -514);
    c.lineTo(90, -446);
    c.lineTo(46, -470);
    c.lineTo(-10, -482);
    c.lineTo(-52, -466);
    c.closePath();
    c.fill();
    c.fillStyle = "#281e32";
    c.beginPath();
    c.moveTo(-78, -440);
    c.lineTo(86, -436);
    c.lineTo(72, -404);
    c.lineTo(-66, -408);
    c.closePath();
    c.fill();

    // The blinded eye: a scarred socket that still catches torchlight, and
    // flares as he commits to a throw. That flare is the readable telegraph.
    const eyeGlow = winding ? 0.6 + wind * 0.4 : roaring ? 0.85 : 0.3 + near * 0.25;
    glow(c, 4, -398, 130, `rgba(255,${winding ? 104 : 164},64,${eyeGlow})`, "rgba(255,120,60,0)");
    c.fillStyle = winding ? "#ff8a4a" : "#c9643a";
    c.beginPath();
    c.ellipse(4, -398, 40, 29, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2a1016";
    c.beginPath();
    c.ellipse(4, -398, 15, 23, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#5e3326";
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(-62, -440);
    c.lineTo(62, -358);
    c.stroke();

    // Mouth.
    if (roaring) {
      c.fillStyle = "#3a1218";
      c.beginPath();
      c.ellipse(4, -336, 46, 32 + Math.sin(now * 0.03) * 8, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#e8d7b2";
      for (let i = -2; i <= 2; i++) c.fillRect(i * 15 - 4, -364, 9, 14);
    } else {
      c.strokeStyle = "#140c18";
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(-34, -340);
      c.quadraticCurveTo(4, -326, 42, -342);
      c.stroke();
    }

    // Throwing arm: rises across the telegraph with a boulder in the fist.
    const armSide = cy.windLane >= 0 ? (cy.windLane === 2 ? 1 : -1) : -1;
    const armAngle = winding ? lerp(0.55, -1.1, wind) : -0.12;
    c.save();
    c.translate(armSide * 172, -268);
    c.rotate(armSide * armAngle);
    c.fillStyle = "#2b2135";
    roundedRect(c, -30, -22, 128, 66, 30);
    c.fill();
    if (winding) {
      const rockR = 52;
      c.save();
      c.translate(108, 12);
      glow(c, 0, 0, 140, `rgba(255,140,60,${0.3 + wind * 0.45})`, "rgba(255,140,60,0)");
      c.fillStyle = "#5c5363";
      c.beginPath();
      c.moveTo(-rockR, 12);
      c.lineTo(-rockR * 0.7, -rockR * 0.8);
      c.lineTo(rockR * 0.2, -rockR);
      c.lineTo(rockR, -rockR * 0.3);
      c.lineTo(rockR * 0.6, rockR * 0.7);
      c.lineTo(-rockR * 0.3, rockR * 0.85);
      c.closePath();
      c.fill();
      c.strokeStyle = "#8a7f93";
      c.lineWidth = 4;
      c.stroke();
      c.restore();
    }
    c.restore();

    // Trailing arm, groping along the wall.
    c.save();
    c.translate(-armSide * 180, -238);
    c.rotate(-armSide * (0.42 + (options.still ? 0 : Math.sin(stridePhase + 1) * 0.18)));
    c.fillStyle = "#231a2d";
    roundedRect(c, -armSide * 112, -20, armSide * 134, 60, 27);
    c.fill();
    c.restore();

    c.restore();
  }

  private drawWalls(
    c: CanvasRenderingContext2D,
    tint: ZoneTint,
    s: CaveState,
    now: number,
    options: CaveSceneOptions,
  ) {
    // Left and right rock walls, built as a strip of quads between depth rungs
    // so they converge properly on the vanishing point.
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side < 0 ? 0 : VIEW_W, VIEW_H);
      let first = true;
      for (let z = 0; z <= SPAWN_Z; z += 4) {
        const p = project(z, side * 2.05);
        if (first) {
          c.lineTo(p.x, p.y);
          first = false;
        } else {
          c.lineTo(p.x, p.y);
        }
      }
      for (let z = SPAWN_Z; z >= 0; z -= 4) {
        const p = project(z, side * 2.05);
        c.lineTo(p.x, p.y - 620 * p.scale);
      }
      c.lineTo(side < 0 ? 0 : VIEW_W, 0);
      c.closePath();
      const g = c.createLinearGradient(side < 0 ? 0 : VIEW_W, 0, CENTRE_X, 0);
      g.addColorStop(0, tint.rock);
      g.addColorStop(1, "#0a0c16");
      c.fillStyle = g;
      c.fill();
    }

    // Wall ribs, placed in world space so they stream toward the camera.
    const ribSpacing = 11;
    const ribPhase = s.distance % ribSpacing;
    for (let i = 0; i < 10; i++) {
      const z = i * ribSpacing - ribPhase + 2;
      if (z <= 0.3 || z > SPAWN_Z) continue;
      for (const side of [-1, 1]) {
        const base = project(z, side * 2.02);
        const h = 520 * base.scale;
        c.globalAlpha = clamp01(base.scale * 2.4) * 0.5;
        c.fillStyle = "#070912";
        c.fillRect(base.x - side * 26 * base.scale, base.y - h, 30 * base.scale, h);
        c.globalAlpha = 1;
      }
    }

    // Torches at fixed world positions. Each flickers on its own phase and
    // throws light onto the floor, which is the cave's main light source.
    const torchSpacing = 14;
    const torchPhase = s.distance % torchSpacing;
    for (let i = 0; i < 9; i++) {
      const z = i * torchSpacing - torchPhase + 4;
      if (z <= 0.5 || z > SPAWN_Z) continue;
      // Alternate sides by the torch's own index in world space, so a given
      // torch keeps its wall as it approaches instead of flipping.
      const index = Math.round((s.distance + z) / torchSpacing);
      const side = index % 2 === 0 ? -1 : 1;
      const p = project(z, side * 1.78);
      const scale = p.scale;
      const flicker = options.still ? 1 : 0.78 + Math.sin(now * 0.013 + i * 2.1) * 0.12 + Math.sin(now * 0.041 + i) * 0.1;
      const y = p.y - 250 * scale;
      glow(c, p.x, y, 420 * scale * flicker, `rgba(255,172,80,${0.5 * tint.light * flicker})`, "rgba(255,150,60,0)");
      // A pool of light on the floor beneath each torch: the main reason the
      // lanes are readable at all.
      glow(c, p.x * 0.72 + CENTRE_X * 0.28, p.y, 360 * scale * flicker, `rgba(255,154,72,${0.34 * flicker})`, "rgba(255,150,70,0)");
      // Bracket and flame.
      c.fillStyle = "#4a3521";
      c.fillRect(p.x - 5 * scale, y, 10 * scale, 64 * scale);
      c.fillStyle = `rgba(255,${Math.round(170 * flicker)},70,0.95)`;
      c.beginPath();
      c.moveTo(p.x, y - 56 * scale * flicker);
      c.quadraticCurveTo(p.x + 26 * scale, y + 10 * scale, p.x, y + 16 * scale);
      c.quadraticCurveTo(p.x - 24 * scale, y + 8 * scale, p.x, y - 56 * scale * flicker);
      c.fill();
      c.fillStyle = "#fff2b8";
      c.beginPath();
      c.ellipse(p.x, y - 10 * scale, 7 * scale, 20 * scale * flicker, 0, 0, Math.PI * 2);
      c.fill();
    }
    this.torchSeed = torchPhase;
  }

  private drawFloor(c: CanvasRenderingContext2D, tint: ZoneTint, s: CaveState, now: number) {
    // Corridor floor.
    const near = project(0, -2.05);
    const nearR = project(0, 2.05);
    const far = project(SPAWN_Z, -2.05);
    const farR = project(SPAWN_Z, 2.05);
    c.beginPath();
    c.moveTo(near.x, near.y);
    c.lineTo(nearR.x, nearR.y);
    c.lineTo(farR.x, farR.y);
    c.lineTo(far.x, far.y);
    c.closePath();
    const g = c.createLinearGradient(0, far.y, 0, VIEW_H);
    g.addColorStop(0, "#1d2232");
    g.addColorStop(0.42, tint.floor);
    g.addColorStop(1, "#4a3f42");
    c.fillStyle = g;
    c.fill();
    // Bottom skirt so the floor reaches the frame edge at the player's plane.
    c.fillStyle = "#4a3f42";
    c.beginPath();
    c.moveTo(0, VIEW_H);
    c.lineTo(near.x, near.y);
    c.lineTo(nearR.x, nearR.y);
    c.lineTo(VIEW_W, VIEW_H);
    c.closePath();
    c.fill();

    // Depth rungs: flagstone seams at fixed world intervals. These are the
    // dominant speed cue, so their spacing is in metres, never in frames.
    const spacing = 5;
    const phase = s.distance % spacing;
    for (let i = 0; i < 26; i++) {
      const z = i * spacing - phase;
      if (z < -0.4 || z > SPAWN_Z) continue;
      const l = project(z, -2.05);
      const r = project(z, 2.05);
      c.globalAlpha = clamp01(l.scale * 1.6) * 0.62;
      c.strokeStyle = i % 2 === 0 ? "#6d6274" : "#4a4352";
      c.lineWidth = Math.max(1, 5 * l.scale);
      c.beginPath();
      c.moveTo(l.x, l.y);
      c.lineTo(r.x, r.y);
      c.stroke();
    }
    c.globalAlpha = 1;

    // Lane dividers, plus a lit rim where the floor meets the walls.
    for (const offset of [-0.5, 0.5]) {
      const a = project(-1, offset * 2);
      const b = project(SPAWN_Z, offset * 2);
      const grad = c.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, "rgba(243,206,132,0.62)");
      grad.addColorStop(0.55, "rgba(233,184,92,0.26)");
      grad.addColorStop(1, "rgba(233,184,92,0)");
      c.strokeStyle = grad;
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    for (const edge of [-2.05, 2.05]) {
      const a = project(-1, edge);
      const b = project(SPAWN_Z, edge);
      const grad = c.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, "rgba(255,186,110,0.5)");
      grad.addColorStop(1, "rgba(255,186,110,0)");
      c.strokeStyle = grad;
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    void now;
    void tint;
  }

  /** Lane framing and, when enabled, the AI's own markers. */
  private drawLaneGuides(c: CanvasRenderingContext2D, s: CaveState, options: CaveSceneOptions) {
    const cy = s.cyclops;
    // The locked target lane is a fair-play telegraph: it is shown in every
    // display mode, because the player is entitled to see a committed attack.
    if (cy.state === "winding" && cy.windLane >= 0) {
      const t = 1 - cy.timer / Math.max(1, cy.windTotal);
      const pulse = 0.3 + Math.abs(Math.sin(t * Math.PI * 5)) * 0.4;
      const nearL = laneAt(cy.windLane, -1.2);
      const farL = laneAt(cy.windLane, 46);
      // The warning is a stripe painted on the floor of the lane, a touch
      // narrower than the lane itself and faint enough to read Odysseus
      // through. It is the fair telegraph, not a curtain.
      const halfNear = LANE_PX * 0.86;
      const halfFar = LANE_PX * 0.86 * farL.scale;
      c.save();
      c.beginPath();
      c.moveTo(nearL.x - halfNear, nearL.y);
      c.lineTo(nearL.x + halfNear, nearL.y);
      c.lineTo(farL.x + halfFar, farL.y);
      c.lineTo(farL.x - halfFar, farL.y);
      c.closePath();
      const g = c.createLinearGradient(0, farL.y, 0, nearL.y);
      g.addColorStop(0, "rgba(244,96,79,0)");
      g.addColorStop(0.72, `rgba(244,96,79,${0.07 + pulse * 0.07})`);
      g.addColorStop(1, `rgba(244,96,79,${0.13 + pulse * 0.12})`);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = `rgba(255,150,120,${0.3 + pulse * 0.35})`;
      c.lineWidth = 3;
      c.stroke();
      c.restore();

      // Impact marker and countdown, set a little ahead of the runner so the
      // ring reads as the ground he must not be standing on.
      const mark = laneAt(cy.windLane, 5.5);
      c.save();
      c.translate(mark.x, mark.y + 10);
      c.globalAlpha = 0.55 + pulse * 0.45;
      c.strokeStyle = DANGER;
      c.lineWidth = 5;
      const radius = (150 - t * 44) * mark.scale;
      c.beginPath();
      c.ellipse(0, 0, radius, radius * 0.3, 0, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.ellipse(0, 0, radius * 0.55, radius * 0.165, 0, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = "#ffe4d4";
      c.font = `700 ${Math.round(46 * mark.scale)}px Georgia, serif`;
      c.textAlign = "center";
      c.lineWidth = 5;
      c.strokeStyle = "#2a0b08";
      c.strokeText(`${(cy.timer / 1000).toFixed(1)}s`, 0, -radius * 0.5);
      c.fillText(`${(cy.timer / 1000).toFixed(1)}s`, 0, -radius * 0.5);
      c.restore();
    }

    // Debug-only reveals. These read state the player cannot normally see, and
    // changing them never changes what Polyphemus does.
    if (options.overlay.showPrediction) {
      const decision = s.ai.decisions[s.ai.decisions.length - 1];
      if (decision?.confidence !== undefined && decision.target) {
        const laneIndex = ["Left", "Centre", "Right"].findIndex(n => decision.target?.startsWith(n));
        if (laneIndex >= 0) {
          const p = laneAt(laneIndex, 24);
          c.save();
          c.setLineDash([12, 10]);
          c.strokeStyle = `rgba(50,212,245,0.75)`;
          c.lineWidth = 3;
          c.beginPath();
          c.ellipse(p.x, p.y, 86 * p.scale * 1.6, 26 * p.scale * 1.6, 0, 0, Math.PI * 2);
          c.stroke();
          c.setLineDash([]);
          c.fillStyle = CYAN;
          c.font = "600 26px Georgia, serif";
          c.textAlign = "center";
          c.fillText(`forecast ${Math.round(decision.confidence * 100)}%`, p.x, p.y - 34);
          c.restore();
        }
      }
    }
    if (options.overlay.showHistory) {
      const recent = s.model.recent.slice(-6);
      c.save();
      c.globalAlpha = 0.8;
      recent.forEach((lane, i) => {
        const z = 8 + (recent.length - i) * 5;
        const p = laneAt(lane, z);
        c.fillStyle = `rgba(50,212,245,${0.15 + (i / recent.length) * 0.4})`;
        c.beginPath();
        c.ellipse(p.x, p.y, 54 * p.scale, 16 * p.scale, 0, 0, Math.PI * 2);
        c.fill();
      });
      c.restore();
    }
  }

  private drawWorldEntities(
    c: CanvasRenderingContext2D,
    s: CaveState,
    now: number,
    options: CaveSceneOptions,
  ) {
    type Drawable = { z: number; draw: () => void };
    const items: Drawable[] = [];

    for (const o of s.obstacles) {
      if (o.z > SPAWN_Z || o.z < -10) continue;
      items.push({ z: o.z, draw: () => this.drawObstacle(c, o, s, now) });
    }
    for (const sheep of s.sheep) {
      if (sheep.taken || sheep.z > SPAWN_Z || sheep.z < -6) continue;
      items.push({ z: sheep.z, draw: () => this.drawSheep(c, sheep, now, options) });
    }
    for (const coin of s.coins) {
      if (coin.taken || coin.z > SPAWN_Z || coin.z < -6) continue;
      items.push({ z: coin.z, draw: () => this.drawCoin(c, coin, now) });
    }
    // Far to near: correct depth sorting is what makes the corridor read.
    items.sort((a, b) => b.z - a.z);
    for (const item of items) item.draw();
  }

  private drawObstacle(c: CanvasRenderingContext2D, o: Obstacle, s: CaveState, now: number) {
    const p = laneAt(o.z, o.z);
    const k = p.scale;
    const w = 190 * k;
    const rule = AVOIDANCE[o.kind];
    const fade = clamp01((SPAWN_Z - o.z) / 22);
    c.save();
    c.globalAlpha = fade;
    ellipseShadow(c, p.x, p.y + 4 * k, w * 0.55, w * 0.16, 0.5 * fade);

    if (o.kind === "beam") {
      // An arch to slide under: posts plus a low lintel, with clear headroom.
      const h = 300 * k;
      c.fillStyle = "#6a4a2c";
      c.fillRect(p.x - w * 0.62, p.y - h, w * 0.17, h);
      c.fillRect(p.x + w * 0.45, p.y - h, w * 0.17, h);
      const beam = c.createLinearGradient(0, p.y - h, 0, p.y - h * 0.62);
      beam.addColorStop(0, "#a3763f");
      beam.addColorStop(1, "#5f4227");
      c.fillStyle = beam;
      c.fillRect(p.x - w * 0.72, p.y - h, w * 1.44, h * 0.4);
      c.strokeStyle = "#d8b071";
      c.lineWidth = Math.max(1, 3 * k);
      c.strokeRect(p.x - w * 0.72, p.y - h, w * 1.44, h * 0.4);
      // Bronze braces.
      c.fillStyle = "#c79a52";
      for (const dx of [-0.5, 0, 0.5]) c.fillRect(p.x + dx * w - 7 * k, p.y - h, 14 * k, h * 0.4);
    } else if (o.kind === "crate") {
      const h = 150 * k;
      const box = c.createLinearGradient(p.x - w / 2, p.y - h, p.x + w / 2, p.y);
      box.addColorStop(0, "#9c7340");
      box.addColorStop(0.55, "#7d5a30");
      box.addColorStop(1, "#5b4123");
      c.fillStyle = box;
      c.fillRect(p.x - w * 0.46, p.y - h, w * 0.92, h);
      c.strokeStyle = "#cfa460";
      c.lineWidth = Math.max(1, 4 * k);
      c.strokeRect(p.x - w * 0.46, p.y - h, w * 0.92, h);
      c.beginPath();
      c.moveTo(p.x - w * 0.46, p.y - h);
      c.lineTo(p.x + w * 0.46, p.y);
      c.moveTo(p.x + w * 0.46, p.y - h);
      c.lineTo(p.x - w * 0.46, p.y);
      c.stroke();
      c.fillStyle = "#b98f4d";
      for (const corner of [-0.46, 0.34]) c.fillRect(p.x + corner * w, p.y - h, w * 0.12, h * 0.16);
    } else if (o.kind === "boulder") {
      const r = 104 * k;
      const spin = o.z * 0.4 + (o.variant * 1.3);
      c.save();
      c.translate(p.x, p.y - r * 0.82);
      c.rotate(spin);
      const rock = c.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
      rock.addColorStop(0, "#8d8597");
      rock.addColorStop(0.6, "#5d5768");
      rock.addColorStop(1, "#332f3c");
      c.fillStyle = rock;
      c.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const rr = r * (0.84 + hash01(i + o.variant * 7) * 0.26);
        if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.strokeStyle = "#a79cb3";
      c.lineWidth = Math.max(1, 3 * k);
      c.stroke();
      c.restore();
    } else if (o.kind === "pillar") {
      const h = 250 * k;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(0.42);
      const col = c.createLinearGradient(-w * 0.3, 0, w * 0.3, 0);
      col.addColorStop(0, "#9f9a86");
      col.addColorStop(0.5, "#d6cfb4");
      col.addColorStop(1, "#7c765f");
      c.fillStyle = col;
      c.fillRect(-w * 0.3, -h, w * 0.6, h);
      // Fluting.
      c.strokeStyle = "#6f6a56";
      c.lineWidth = Math.max(1, 2 * k);
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(i * w * 0.11, -h);
        c.lineTo(i * w * 0.11, 0);
        c.stroke();
      }
      c.fillStyle = "#e4dcc0";
      c.fillRect(-w * 0.4, -h - 22 * k, w * 0.8, 24 * k);
      c.restore();
    } else if (o.kind === "fire") {
      const flame = options_flicker(now, o.variant);
      glow(c, p.x, p.y - 60 * k, 240 * k, `rgba(255,140,60,${0.45 * flame})`, "rgba(255,120,40,0)");
      c.fillStyle = "#3a2a1c";
      c.beginPath();
      c.ellipse(p.x, p.y, w * 0.4, w * 0.13, 0, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 3; i++) {
        const h = (120 + i * 34) * k * flame;
        c.fillStyle = i === 2 ? "#fff0b0" : i === 1 ? "#ffb24a" : "#ff7a2c";
        c.beginPath();
        c.moveTo(p.x - (34 - i * 10) * k, p.y);
        c.quadraticCurveTo(p.x + (28 - i * 9) * k, p.y - h * 0.6, p.x, p.y - h);
        c.quadraticCurveTo(p.x - (30 - i * 9) * k, p.y - h * 0.5, p.x - (34 - i * 10) * k, p.y);
        c.fill();
      }
    } else if (o.kind === "crack") {
      // A split floor that must be jumped. Drawn as a dark gap with lit edges.
      c.fillStyle = "#05060c";
      c.beginPath();
      c.ellipse(p.x, p.y, w * 0.52, w * 0.17, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#e9b85c";
      c.lineWidth = Math.max(1, 4 * k);
      c.stroke();
      glow(c, p.x, p.y, 120 * k, "rgba(255,120,50,0.3)", "rgba(255,120,50,0)");
      c.strokeStyle = "#8c6a3a";
      c.lineWidth = Math.max(1, 2 * k);
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(p.x - w * 0.5 + i * w * 0.33, p.y - w * 0.14);
        c.lineTo(p.x - w * 0.42 + i * w * 0.33, p.y + w * 0.14);
        c.stroke();
      }
    } else if (o.kind === "debris") {
      // Falling rubble: a cluster that settles as it nears.
      const fall = clamp01((SPAWN_Z - o.z) / 40);
      const lift = (1 - fall) * 320 * k;
      for (let i = 0; i < 4; i++) {
        const dx = (hash01(i + o.variant * 5) - 0.5) * w * 0.8;
        const r = (34 + hash01(i * 3 + o.variant) * 26) * k;
        c.fillStyle = i % 2 ? "#5a5263" : "#443e4e";
        c.save();
        c.translate(p.x + dx, p.y - r - lift - i * 8 * k);
        c.rotate(hash01(i) * 3 + o.z * 0.1);
        c.beginPath();
        c.moveTo(-r, r * 0.4);
        c.lineTo(-r * 0.5, -r);
        c.lineTo(r * 0.7, -r * 0.6);
        c.lineTo(r, r * 0.5);
        c.closePath();
        c.fill();
        c.restore();
      }
      if (lift > 4) {
        c.strokeStyle = "rgba(255,180,110,0.3)";
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(p.x, p.y, w * 0.4, w * 0.13, 0, 0, Math.PI * 2);
        c.stroke();
      }
    } else {
      // lowrock
      const h = 104 * k;
      const rock = c.createLinearGradient(0, p.y - h, 0, p.y);
      rock.addColorStop(0, "#6e687c");
      rock.addColorStop(1, "#332f3c");
      c.fillStyle = rock;
      c.beginPath();
      c.moveTo(p.x - w * 0.5, p.y);
      c.lineTo(p.x - w * 0.38, p.y - h * 0.8);
      c.lineTo(p.x - w * 0.05, p.y - h);
      c.lineTo(p.x + w * 0.34, p.y - h * 0.72);
      c.lineTo(p.x + w * 0.5, p.y);
      c.closePath();
      c.fill();
      c.strokeStyle = "#9c93a8";
      c.lineWidth = Math.max(1, 3 * k);
      c.stroke();
    }

    // The avoidance prompt, shown while the hazard is still answerable. It is
    // part of fair play, not debug information.
    if (o.z > 6 && o.z < 52 && !o.resolved) {
      const alpha = clamp01((52 - o.z) / 24) * clamp01((o.z - 6) / 8);
      c.globalAlpha = alpha * 0.95;
      c.fillStyle = rule.jump ? "#9fe6b4" : rule.slide ? "#9fd4f5" : "#ffc9a8";
      c.font = `700 ${Math.max(14, 44 * k)}px Georgia, serif`;
      c.textAlign = "center";
      c.fillText(rule.prompt, p.x, p.y - 340 * k);
      // A small chevron pointing at the hazard.
      c.beginPath();
      c.moveTo(p.x - 14 * k * 1.6, p.y - 318 * k);
      c.lineTo(p.x + 14 * k * 1.6, p.y - 318 * k);
      c.lineTo(p.x, p.y - 296 * k);
      c.closePath();
      c.fill();
    }
    c.restore();
    void s;
  }

  private drawSheep(c: CanvasRenderingContext2D, sheep: { lane: number; z: number; drift: number; variant: number; id: number }, now: number, options: CaveSceneOptions) {
    const p = project(sheep.z, (sheep.lane - 1) * LANE_SPAN + sheep.drift);
    const k = p.scale;
    const w = 150 * k;
    // A trot cycle, so it reads as a creature rather than a floating icon.
    const trot = options.still ? 0 : Math.sin(now * 0.009 + sheep.id) * 1;
    const bob = Math.abs(trot) * 9 * k;
    c.save();
    ellipseShadow(c, p.x, p.y + 2 * k, w * 0.45, w * 0.13, 0.45);
    glow(c, p.x, p.y - w * 0.4, 190 * k, "rgba(246,240,227,0.3)", "rgba(246,240,227,0)");

    // Legs.
    c.strokeStyle = "#5e5347";
    c.lineWidth = Math.max(1, 9 * k);
    for (let i = 0; i < 4; i++) {
      const dx = (i < 2 ? -1 : 1) * w * 0.22 + (i % 2 ? w * 0.08 : -w * 0.08);
      const swing = Math.sin(now * 0.012 + sheep.id + i * 1.6) * (options.still ? 0 : 1) * w * 0.07;
      c.beginPath();
      c.moveTo(p.x + dx, p.y - w * 0.3 - bob);
      c.lineTo(p.x + dx + swing, p.y);
      c.stroke();
    }
    // Woolly body.
    const body = c.createRadialGradient(p.x - w * 0.1, p.y - w * 0.58 - bob, w * 0.05, p.x, p.y - w * 0.45 - bob, w * 0.5);
    body.addColorStop(0, "#fffaf0");
    body.addColorStop(1, "#d7cfbc");
    c.fillStyle = body;
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      c.arc(p.x + Math.cos(a) * w * 0.3, p.y - w * 0.46 - bob + Math.sin(a) * w * 0.2, w * 0.15, 0, Math.PI * 2);
    }
    c.fill();
    // Head and horn.
    c.fillStyle = "#4b4038";
    c.beginPath();
    c.ellipse(p.x + w * 0.36, p.y - w * 0.56 - bob, w * 0.14, w * 0.12, 0.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#cbb183";
    c.lineWidth = Math.max(1, 5 * k);
    c.beginPath();
    c.arc(p.x + w * 0.4, p.y - w * 0.68 - bob, w * 0.1, Math.PI * 0.2, Math.PI * 1.5);
    c.stroke();
    c.fillStyle = "#f6f0e3";
    c.beginPath();
    c.arc(p.x + w * 0.44, p.y - w * 0.58 - bob, w * 0.03, 0, Math.PI * 2);
    c.fill();

    // Pickup halo and label while it is still reachable.
    if (sheep.z > 4 && sheep.z < 48) {
      const pulse = options.still ? 0.6 : 0.6 + Math.sin(now * 0.006 + sheep.id) * 0.3;
      c.globalAlpha = clamp01((48 - sheep.z) / 22) * 0.9;
      c.strokeStyle = `rgba(159,230,180,${pulse})`;
      c.lineWidth = Math.max(1, 4 * k);
      c.beginPath();
      c.ellipse(p.x, p.y, w * 0.48, w * 0.15, 0, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#9fe6b4";
      c.font = `700 ${Math.max(12, 32 * k)}px Georgia, serif`;
      c.textAlign = "center";
      c.fillText("+ LIFE", p.x, p.y - 190 * k);
    }
    c.restore();
  }

  private drawCoin(c: CanvasRenderingContext2D, coin: { lane: number; z: number; id: number }, now: number) {
    const p = laneAt(coin.lane, coin.z);
    const k = p.scale;
    const r = 44 * k;
    const spin = Math.cos(now * 0.004 + coin.id);
    const y = p.y - 150 * k + Math.sin(now * 0.005 + coin.id) * 14 * k;
    glow(c, p.x, y, 120 * k, "rgba(233,184,92,0.4)", "rgba(233,184,92,0)");
    c.save();
    c.fillStyle = "#e9b85c";
    c.beginPath();
    c.ellipse(p.x, y, Math.max(1, r * Math.abs(spin)), r, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#fff0bd";
    c.lineWidth = Math.max(1, 4 * k);
    c.stroke();
    c.restore();
  }

  private drawBoulders(c: CanvasRenderingContext2D, s: CaveState, options: CaveSceneOptions) {
    for (const b of s.boulders) {
      if (b.resolved) continue;
      const t = clamp01(b.t / b.total);
      // The boulder leaves Polyphemus' hand behind and above the camera and
      // lands on the player's plane, so its arc crosses the whole frame.
      const target = laneAt(b.lane, 1.2);
      const fromX = CENTRE_X;
      const fromY = HORIZON_Y + 40;
      const x = lerp(fromX, target.x, t);
      const arc = Math.sin(t * Math.PI) * 190;
      const y = lerp(fromY, target.y - 30, t * t) - arc;
      const r = lerp(26, 118, t * t);
      // Impact shadow grows under the landing spot: the fair warning of where.
      c.save();
      c.globalAlpha = 0.3 + t * 0.5;
      c.fillStyle = "#04060c";
      c.beginPath();
      c.ellipse(target.x, target.y + 8, r * 1.05, r * 0.32, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      glow(c, x, y, r * 2.4, "rgba(255,130,60,0.3)", "rgba(255,130,60,0)");
      c.save();
      c.translate(x, y);
      c.rotate(t * 7);
      const rock = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      rock.addColorStop(0, "#9a90a6");
      rock.addColorStop(0.6, "#625b70");
      rock.addColorStop(1, "#302c3a");
      c.fillStyle = rock;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = r * (0.82 + hash01(i + b.id) * 0.3);
        if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.strokeStyle = "#b3a8bf";
      c.lineWidth = 3;
      c.stroke();
      c.restore();
      // Motion trail.
      if (!options.still) {
        c.save();
        c.globalAlpha = 0.25;
        c.strokeStyle = "#ffb27a";
        c.lineWidth = r * 0.5;
        c.beginPath();
        c.moveTo(x, y);
        const pt = clamp01(t - 0.12);
        c.lineTo(lerp(fromX, target.x, pt), lerp(fromY, target.y - 30, pt * pt) - Math.sin(pt * Math.PI) * 190);
        c.stroke();
        c.restore();
      }
    }
  }

  private drawHero(c: CanvasRenderingContext2D, s: CaveState, now: number, options: CaveSceneOptions) {
    const p = project(0, s.laneX);
    // A jump arc, and a slide that lowers and lengthens the silhouette.
    const jumpT = s.jump > 0 ? 1 - s.jump / 700 : 0;
    const lift = s.jump > 0 ? Math.sin(jumpT * Math.PI) * 240 : 0;
    const sliding = s.slide > 0;
    const run = options.still ? 0 : (s.distance * 0.55) % 1;
    const bob = s.jump > 0 ? 0 : Math.abs(Math.sin(run * Math.PI * 2)) * 14;
    const lean = clamp(s.laneX - (s.lane - 1) * LANE_SPAN, -1, 1) * -16 + (s.changing > 0 ? 0 : 0);
    const x = p.x;
    const y = p.y - lift - bob;
    const height = 262;
    // A ghosted flicker while invulnerable: unmistakable, but he never
    // disappears outright, which would read as a rendering fault.
    const flicker = s.invulnerable > 0 ? (Math.floor(now / 90) % 2 === 1 ? 0.28 : 0.85) : 1;

    ellipseShadow(c, p.x, p.y + 6, 80 * (1 - lift / 700), 23 * (1 - lift / 900), 0.5);

    c.save();
    c.globalAlpha = flicker;
    c.translate(x, y);
    c.rotate((lean * Math.PI) / 180);
    if (sliding) {
      const t = 1 - s.slide / 600;
      c.scale(1.12, 0.52 + easeOut(t) * 0.1);
      c.translate(0, 120);
    }
    if (s.jump > 0) c.rotate(Math.sin(jumpT * Math.PI) * -0.1);

    // The cape streams behind him, so it is drawn first and kept inside his
    // own silhouette width — otherwise it reads as a slab across the lane.
    const flap = options.still ? 0 : Math.sin(run * Math.PI * 2) * 0.05;
    c.save();
    c.globalAlpha = 0.82;
    const capeTop = -height * 0.72;
    const capeBottom = -height * 0.22;
    const capeHalf = height * 0.115;
    const cape = c.createLinearGradient(0, capeTop, 0, capeBottom);
    cape.addColorStop(0, "#7e3330");
    cape.addColorStop(1, "#40181a");
    c.fillStyle = cape;
    c.beginPath();
    c.moveTo(-capeHalf * 0.8, capeTop);
    c.quadraticCurveTo(-capeHalf * (1.5 + flap) - lean, (capeTop + capeBottom) / 2, -capeHalf * (0.9 + flap), capeBottom);
    c.lineTo(capeHalf * (0.9 - flap), capeBottom);
    c.quadraticCurveTo(capeHalf * (1.5 - flap) - lean, (capeTop + capeBottom) / 2, capeHalf * 0.8, capeTop);
    c.closePath();
    c.fill();
    c.restore();

    const sprite = options.sprites.hero;
    if (sprite?.complete && sprite.naturalWidth) {
      // Tile 1 of the sprite atlas is the running back view, which is exactly
      // the camera this encounter uses.
      const tw = sprite.naturalWidth / 2;
      const th = sprite.naturalHeight / 2;
      const w = height * 0.92;
      c.drawImage(sprite, tw, 0, tw, th, -w / 2, -height, w, height);
    } else {
      this.drawHeroFallback(c, height, run);
    }
    c.restore();

    // Running dust, placed after the hero so it reads in front of his heels.
    if (!options.still && s.jump <= 0 && options.effectStrength > 0) {
      c.save();
      c.globalAlpha = 0.3;
      c.fillStyle = "#b5a88e";
      for (let i = 0; i < 3; i++) {
        const t = ((run + i / 3) % 1);
        c.beginPath();
        c.ellipse(x - 20 + t * 40, p.y + 10 - t * 26, 26 * (1 - t), 9 * (1 - t), 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  }

  /** Vector Odysseus, used until the sprite atlas has loaded. */
  private drawHeroFallback(c: CanvasRenderingContext2D, height: number, run: number) {
    const swing = Math.sin(run * Math.PI * 2);
    c.strokeStyle = "#c9a173";
    c.lineWidth = 26;
    c.lineCap = "round";
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 26, -height * 0.46);
      c.lineTo(side * 26 + swing * side * 30, -height * 0.04);
      c.stroke();
    }
    c.fillStyle = "#b8893f";
    roundedRect(c, -58, -height * 0.78, 116, height * 0.36, 18);
    c.fill();
    c.fillStyle = "#e8dcc0";
    roundedRect(c, -50, -height * 0.46, 100, height * 0.12, 10);
    c.fill();
    c.strokeStyle = "#c9a173";
    c.lineWidth = 22;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 54, -height * 0.74);
      c.lineTo(side * 70 - swing * side * 26, -height * 0.46);
      c.stroke();
    }
    fillCircle(c, 0, -height * 0.86, 40, "#c08f5f");
    c.fillStyle = "#2a1c18";
    c.beginPath();
    c.ellipse(0, -height * 0.9, 42, 30, 0, Math.PI, Math.PI * 2);
    c.fill();
  }

  private drawForeground(
    c: CanvasRenderingContext2D,
    tint: ZoneTint,
    s: CaveState,
    now: number,
    options: CaveSceneOptions,
  ) {
    // Near wall edges, to frame the action and sell the corridor width.
    for (const side of [-1, 1]) {
      const g = c.createLinearGradient(side < 0 ? 0 : VIEW_W, 0, side < 0 ? 210 : VIEW_W - 210, 0);
      g.addColorStop(0, "rgba(6,8,16,0.82)");
      g.addColorStop(1, "rgba(6,8,16,0)");
      c.fillStyle = g;
      c.fillRect(side < 0 ? 0 : VIEW_W - 210, 0, 210, VIEW_H);
    }
    // Lane labels, kept low-contrast so they inform without competing.
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = "#9fb0c4";
    c.textAlign = "center";
    c.letterSpacing = "3px";
    for (let lane = 0; lane < 3; lane++) {
      const p = laneAt(lane, 26);
      c.font = `600 ${Math.round(34 * p.scale)}px Arial, sans-serif`;
      c.fillStyle = lane === s.lane ? GOLD : "#5f6f83";
      c.globalAlpha = lane === s.lane ? 0.5 : 0.26;
      c.fillText(["LEFT", "CENTRE", "RIGHT"][lane], p.x, p.y + 30 * p.scale);
    }
    c.restore();
    void tint;
    void now;
    void options;
  }

  /** Floating score and health callouts, anchored over the lane that earned them. */
  private drawCallouts(c: CanvasRenderingContext2D, s: CaveState) {
    // Newest last, and each one offset a little further up, so a quick run of
    // pickups reads as a stack rather than as one illegible overlap.
    s.pops.forEach((popped, index) => {
      const age = clamp01((s.elapsed - popped.at) / 1000);
      if (age >= 1) return;
      const p = laneAt(popped.lane, 3);
      c.save();
      c.globalAlpha = (1 - age) * (age < 0.12 ? age / 0.12 : 1);
      c.font = "700 32px Georgia, serif";
      c.textAlign = "center";
      c.lineWidth = 5;
      c.strokeStyle = "#07101c";
      c.fillStyle = popped.good ? "#ffe9a8" : "#ffb0a0";
      const y = p.y - 330 - age * 96 - (s.pops.length - 1 - index) * 40;
      c.strokeText(popped.text, p.x, y);
      c.fillText(popped.text, p.x, y);
      c.restore();
    });
  }

  private drawVignette(c: CanvasRenderingContext2D, s: CaveState) {
    const g = c.createRadialGradient(CENTRE_X, VIEW_H * 0.54, VIEW_W * 0.26, CENTRE_X, VIEW_H * 0.54, VIEW_W * 0.72);
    g.addColorStop(0, "rgba(2,6,14,0)");
    g.addColorStop(1, "rgba(2,6,14,0.46)");
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    // A danger rim as Polyphemus closes, instead of a flashing full-screen tint.
    const near = clamp01(1 - (s.cyclops.gap - 8) / 34);
    if (near > 0.02) {
      const rim = c.createRadialGradient(CENTRE_X, VIEW_H * 0.5, VIEW_W * 0.3, CENTRE_X, VIEW_H * 0.5, VIEW_W * 0.62);
      rim.addColorStop(0, "rgba(244,96,79,0)");
      rim.addColorStop(1, `rgba(244,96,79,${0.42 * near})`);
      c.fillStyle = rim;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    void MAX_GAP;
  }
}

/** Torch and flame flicker, shared by the fire hazard. */
function options_flicker(now: number, seed: number) {
  return 0.82 + Math.sin(now * 0.017 + seed * 2.3) * 0.12 + Math.sin(now * 0.053 + seed) * 0.08;
}
