// The arcade layer over the great hall: what to do, how it went, who leads.
//
// Drawn in the logical 16:9 stage space with the same camera the 3D hall uses,
// so the sight, the guide line and the axe numbers sit exactly on the scene.
// The flat fallback for machines without WebGL draws the hall itself here too.

import { BOW, archeryShot, arrowTime, axeZ, bowScoreShown, bowSway, draughtAllowance, openingOf, shotAdvice, strikeZ, tierOf, type BowState, type Shot } from "../encounters/mythic.ts";
import { LINE_Y, arrowPoint, axeAt, flightOf, onLine, projector, sightPoint, type HallCamera, type ScreenPoint, type Vec3 } from "./hall-view.ts";
import { EventStamp, Particles, VIEW_H, VIEW_W, clamp01, roundedRect, type StageFrame } from "./stage.ts";

const SERIF = `Georgia, "Times New Roman", serif`;
const PIXEL = `"Pixel", "Press Start 2P", monospace`;
const SANS = `"Trebuchet MS", Arial, sans-serif`;
const GOLD = "#f2d27e";
const CREAM = "#f6eacb";
const COPPER = "#e8a07c";
const DANGER = "#f0745c";
const PANEL = "rgba(5,19,33,0.8)";
const EDGE = "rgba(214,178,104,0.6)";

/** How much of the predicted flight is shown: the landing point and its verdict on easy, the landing point on medium, nothing on hard. */
export type GuideReach = "full" | "near" | "none";
export const guideFor = (s: BowState): GuideReach => (["full", "near", "none"] as const)[tierOf(s.difficulty)];

export type HallOverlayOptions = {
  still: boolean;
  /** The full how-to card, shown until the player has loosed an arrow. */
  coach: boolean;
  /** Whether the player is on a touch screen, for the wording of the controls. */
  touch: boolean;
  /**
   * The stage's height on screen, in CSS pixels. On a short stage, such as a
   * phone held sideways, the HUD bar covers more of the frame and the panels
   * switch to a compact, larger-type layout below it.
   */
  stageHeight: number;
};

/** Where the panels go: under the HUD bar, and how large their type is. */
type Layout = { top: number; type: number; compact: boolean };
function layoutFor(options: HallOverlayOptions): Layout {
  const scale = Math.max(0.2, options.stageHeight / VIEW_H);
  // The HUD bar is about 118 CSS px tall on a desktop stage and 92 on a phone.
  if (options.stageHeight >= 520) return { top: Math.max(156, 124 / scale), type: 1, compact: false };
  return { top: 96 / scale, type: Math.min(1.9, 0.62 / scale), compact: true };
}

type Project = (p: Vec3) => ScreenPoint;

function panel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, edge = EDGE) {
  c.save();
  roundedRect(c, x, y, w, h, 10);
  c.fillStyle = PANEL;
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = edge;
  c.stroke();
  c.restore();
}

function text(c: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, colour: string, align: CanvasTextAlign = "left", alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.font = font;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillStyle = colour;
  c.fillText(value, x, y);
  c.restore();
}

/** A gently shadowed line of text, for words laid over the scene itself. */
function shadowed(c: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, colour: string, align: CanvasTextAlign = "center", alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.font = font;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.shadowColor = "rgba(0,0,0,0.85)";
  c.shadowBlur = 10;
  c.fillStyle = colour;
  c.fillText(value, x, y);
  c.restore();
}

/** Fades a banner in over 250 ms and out over its last 350 ms. */
const fade = (t: number, length: number) => clamp01(Math.min(t / 250, (length - t) / 350));

/** A soft dark band behind a banner, so its words read against the bright doorway. */
function band(c: CanvasRenderingContext2D, y: number, h: number, alpha: number) {
  if (alpha <= 0) return;
  const g = c.createLinearGradient(0, 0, VIEW_W, 0);
  g.addColorStop(0, "rgba(6,10,16,0)");
  g.addColorStop(0.25, `rgba(6,10,16,${0.62 * alpha})`);
  g.addColorStop(0.75, `rgba(6,10,16,${0.62 * alpha})`);
  g.addColorStop(1, "rgba(6,10,16,0)");
  c.fillStyle = g;
  c.fillRect(0, y, VIEW_W, h);
}

export class HallOverlay {
  private sparks = new Particles(200);
  private passes = new EventStamp();
  private landings = new EventStamp();

  reset() {
    this.sparks.clear();
    this.passes.reset();
    this.landings.reset();
  }

  draw(c: CanvasRenderingContext2D, s: BowState, cam: HallCamera, frame: StageFrame, options: HallOverlayOptions) {
    const project = projector(cam);
    const settled = s.phase === "player" ? clamp01((s.timer - 500) / 400) : 0;
    this.spawn(s, project);
    this.sparks.update(options.still ? 0 : frame.dt);

    this.vignette(c);
    this.numerals(c, s, project, clamp01((cam.eye.x - 0.6) / 0.8));
    if (s.phase === "player" && settled > 0) {
      c.save();
      c.globalAlpha = settled;
      this.ghost(c, s, project);
      this.guide(c, s, project);
      this.sight(c, s, project, frame.now);
      c.restore();
    }
    this.streak(c, s, project);
    this.sparks.draw(c);
    const L = layoutFor(options);
    this.track(c, s, L);
    this.scoreboard(c, s, frame.now, L);
    this.wind(c, s, L);
    this.banners(c, s, L);
    if (s.phase === "player" && settled > 0) this.coach(c, s, options, L, settled);
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  /** One gold ring as the arrow threads each axe, and sparks where it strikes. */
  private spawn(s: BowState, project: Project) {
    const f = flightOf(s);
    if (!f) return;
    const turn = (s.turn * 2 + (f.shot.owner === "rival" ? 1 : 0)) * 100;
    for (let i = 1; i <= f.shot.rings; i++) {
      if (f.t < arrowTime(axeZ(i)) || !this.passes.fired(turn + i)) continue;
      const p = project(axeAt(i));
      // Capped, so an axe right beside the chasing camera rings rather than sweeping the screen.
      if (p.on) this.sparks.spawn({ x: p.x, y: p.y, vx: 0, vy: 0, max: 520, size: Math.min(46, Math.max(6, openingOf(s.difficulty, i) * BOW.unitM * p.scale)), colour: f.shot.owner === "player" ? GOLD : COPPER, gravity: 0, kind: "ring" });
    }
    if (f.landed && this.landings.fired(turn)) {
      const p = project(arrowPoint(f.shot, f.end));
      if (!p.on) return;
      const perfect = f.shot.rings >= BOW.axes;
      this.sparks.burst(p.x, p.y, perfect ? 34 : 22, i => {
        const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.4, speed = 140 + Math.random() * 260;
        return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80, max: 380 + Math.random() * 380, size: 2 + Math.random() * 2.5, colour: perfect ? "#fff1b8" : "#ffc777", gravity: 520, kind: "spark" };
      });
    }
  }

  private vignette(c: CanvasRenderingContext2D) {
    const g = c.createRadialGradient(VIEW_W / 2, VIEW_H * 0.52, VIEW_H * 0.42, VIEW_W / 2, VIEW_H * 0.52, VIEW_W * 0.62);
    g.addColorStop(0, "rgba(10,6,2,0)");
    g.addColorStop(1, "rgba(10,6,2,0.5)");
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // -------------------------------------------------------------------------
  // On the scene
  // -------------------------------------------------------------------------

  /**
   * Each axe's number on the floor beside it, from the gallery, where the line
   * is seen side-on and the numbers spread out. From behind the bow they
   * would pile up, and the track above already counts the axes.
   */
  private numerals(c: CanvasRenderingContext2D, s: BowState, project: Project, side: number) {
    if (side <= 0) return;
    c.save();
    c.globalAlpha = side;
    for (let i = 1; i <= BOW.axes; i++) {
      const p = project({ x: -0.62, y: 0.02, z: axeAt(i).z });
      if (!p.on || p.x < -40 || p.x > VIEW_W + 40 || p.y < 0 || p.y > VIEW_H + 20) continue;
      const size = Math.max(10, Math.min(28, p.scale * 0.16));
      const blocked = s.blocked === i || (flightOf(s)?.shot.block ?? 0) === i;
      c.save();
      c.globalAlpha = 0.85;
      roundedRect(c, p.x - size * 0.75, p.y - size * 0.62, size * 1.5, size * 1.24, size * 0.25);
      c.fillStyle = "rgba(20,12,6,0.72)";
      c.fill();
      c.restore();
      text(c, String(i), p.x, p.y + 1, `${Math.round(size * 0.7)}px ${PIXEL}`, blocked ? DANGER : GOLD, "center");
    }
    c.restore();
  }

  /**
   * A glowing trail behind an arrow in flight, so it can be followed from the
   * gallery as well as from behind. Short when the camera rides behind it, so
   * the trail never reaches back past the eye.
   */
  private streak(c: CanvasRenderingContext2D, s: BowState, project: Project) {
    const f = flightOf(s);
    if (!f) return;
    const perfect = f.shot.rings >= BOW.axes;
    if (f.landed && !perfect) return;
    const head = perfect && f.landed ? Math.min(BOW.doorway + 0.3, f.end + f.since / BOW.reachMs) : f.z;
    const mine = f.shot.owner === "player", tail = Math.max(0.01, head - (mine ? 0.06 : 0.14));
    if (head - tail < 0.005) return;
    c.save();
    c.lineCap = "round";
    for (const [width, alpha] of [[11, 0.16], [4.5, 0.5], [1.8, 0.95]]) {
      c.strokeStyle = mine ? `rgba(255,228,150,${alpha})` : `rgba(255,168,128,${alpha})`;
      c.lineWidth = width;
      this.path(c, f.shot, tail, head, project);
    }
    c.restore();
  }

  /** The player's previous arrow, faint, so the next can be corrected against it. */
  private ghost(c: CanvasRenderingContext2D, s: BowState, project: Project) {
    const shot = s.lastShot;
    if (!shot) return;
    const end = strikeZ(shot);
    c.save();
    c.strokeStyle = "rgba(246,234,203,0.38)";
    c.lineWidth = 2;
    c.setLineDash([3, 7]);
    this.path(c, shot, 0.04, end, project);
    c.setLineDash([]);
    const p = project(arrowPoint(shot, end));
    if (p.on) {
      const r = 7;
      c.strokeStyle = shot.rings >= BOW.axes ? "rgba(242,210,126,0.7)" : "rgba(240,116,92,0.75)";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(p.x - r, p.y - r); c.lineTo(p.x + r, p.y + r);
      c.moveTo(p.x + r, p.y - r); c.lineTo(p.x - r, p.y + r);
      c.stroke();
      text(c, "LAST", p.x + 12, p.y - 12, `9px ${PIXEL}`, "rgba(246,234,203,0.7)");
    }
    c.restore();
  }

  /**
   * Where this draw will carry the arrow by the twelfth axe, on easy and
   * medium: the draught and a short draw pull it off the sight, and the task
   * is to put this marker in the far hole. Seen down the line, a path would
   * shrink to a dot behind the sight, so the landing point is what is shown.
   * Easy also says whether the arrow will clear every axe on the way.
   */
  private guide(c: CanvasRenderingContext2D, s: BowState, project: Project) {
    const reach = guideFor(s);
    if (reach === "none") return;
    const sway = bowSway(s);
    // Undrawn, the marker shows a full draw: what the player gets by drawing all the way.
    const aim = { aim: s.aim.aim + sway.aim, elevation: s.aim.elevation + sway.elevation, tension: s.drawing ? Math.max(25, Math.round(s.draw * 100)) : 100 };
    const preview = archeryShot(aim, s.wind, s.blocked, "player", s.difficulty);
    const sight = project(sightPoint(aim)), land = project(arrowPoint(preview, 1));
    if (!sight.on || !land.on) return;
    const clean = preview.rings >= BOW.axes, colour = reach === "full" ? (clean ? GOLD : DANGER) : CREAM;
    c.save();
    c.strokeStyle = colour;
    c.globalAlpha *= 0.75;
    c.lineWidth = 2;
    c.setLineDash([3, 5]);
    c.beginPath();
    c.moveTo(sight.x, sight.y);
    c.lineTo(land.x, land.y);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha /= 0.75;
    // A dark halo keeps the marker readable against the bright bronze around the holes.
    const diamond = () => {
      c.beginPath();
      c.moveTo(land.x, land.y - 10); c.lineTo(land.x + 10, land.y); c.lineTo(land.x, land.y + 10); c.lineTo(land.x - 10, land.y); c.closePath();
    };
    c.lineJoin = "round";
    c.strokeStyle = "rgba(10,6,2,0.75)";
    c.lineWidth = 6;
    diamond();
    c.stroke();
    c.strokeStyle = colour;
    c.lineWidth = 2.5;
    diamond();
    c.stroke();
    c.fillStyle = colour;
    c.beginPath(); c.arc(land.x, land.y, 3, 0, Math.PI * 2); c.fill();
    c.restore();
    if (reach === "full") shadowed(c, clean ? "THROUGH ALL 12" : `STRIKES AXE ${preview.rings + 1}`, land.x, land.y - 22, `9px ${PIXEL}`, colour);
  }

  private path(c: CanvasRenderingContext2D, shot: Pick<Shot, "aim" | "wind">, from: number, to: number, project: Project) {
    c.beginPath();
    let started = false;
    const step = Math.min(0.02, Math.max(0.004, (to - from) / 8));
    for (let z = from; z <= to + 1e-9; z += step) {
      const p = project(arrowPoint(shot, Math.min(z, to)));
      if (!p.on) continue;
      if (started) c.lineTo(p.x, p.y);
      else c.moveTo(p.x, p.y);
      started = true;
    }
    c.stroke();
  }

  /** The sight and, around it, the draw: a ring that fills as the string comes back and reddens as the arm tires. */
  private sight(c: CanvasRenderingContext2D, s: BowState, project: Project, now: number) {
    const sway = bowSway(s);
    const p = project(sightPoint({ aim: s.aim.aim + sway.aim, elevation: s.aim.elevation + sway.elevation }));
    if (!p.on) return;
    const trembling = Math.hypot(sway.aim, sway.elevation) > 0 || s.pull > BOW.drawMs + BOW.steadyMs;
    const ring = s.draw >= 1 ? (trembling ? DANGER : GOLD) : "rgba(242,210,126,0.95)";
    c.save();
    c.lineCap = "round";
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.lineWidth = 6;
    c.beginPath(); c.arc(p.x, p.y, 21, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = CREAM;
    c.lineWidth = 2;
    c.beginPath(); c.arc(p.x, p.y, 21, 0, Math.PI * 2); c.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.beginPath();
      c.moveTo(p.x + dx * 9, p.y + dy * 9);
      c.lineTo(p.x + dx * 30, p.y + dy * 30);
      c.stroke();
    }
    c.fillStyle = CREAM;
    c.beginPath(); c.arc(p.x, p.y, 2.2, 0, Math.PI * 2); c.fill();
    if (s.drawing) {
      const pulse = trembling ? 0.55 + 0.45 * Math.sin(now / 70) : 1;
      c.strokeStyle = ring;
      c.globalAlpha *= pulse;
      c.lineWidth = 6;
      c.beginPath();
      c.arc(p.x, p.y, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.draw);
      c.stroke();
      c.globalAlpha = 1;
      const label = s.draw < 1 ? "DRAWING" : trembling ? "ARM TIRING - LET GO!" : "FULL DRAW - LET GO";
      shadowed(c, label, p.x, p.y + 60, `11px ${PIXEL}`, s.draw < 1 ? CREAM : trembling ? DANGER : GOLD);
    }
    c.restore();
  }

  // -------------------------------------------------------------------------
  // Panels
  // -------------------------------------------------------------------------

  /** The mission, always in view: twelve numbered axes, lit as an arrow threads them. */
  private track(c: CanvasRenderingContext2D, s: BowState, L: Layout) {
    const gap = 42 * L.type, r = 14 * L.type, w = gap * 11 + r * 2 + 36, h = (L.compact ? 44 : 76) * L.type;
    const x = (VIEW_W - w) / 2, y = L.top, first = x + (w - gap * 11) / 2, cy = y + h - (L.compact ? h / 2 : 26 * L.type);
    panel(c, x, y, w, h);
    if (!L.compact) text(c, "THREAD ALL 12 AXE HEADS  ·  1 POINT EACH", VIEW_W / 2, y + 18, `10px ${PIXEL}`, GOLD, "center");
    const f = flightOf(s);
    const shown: Shot | null = f ? f.shot : s.phase === "player" ? null : s.shot;
    const blocked = s.phase === "player" ? s.blocked : f?.shot.block ?? 0;
    for (let i = 1; i <= BOW.axes; i++) {
      const cx = first + (i - 1) * gap;
      const reached = shown ? (f ? f.t >= arrowTime(axeZ(i)) : true) : false;
      const passed = !!shown && reached && i <= shown.rings;
      const struck = !!shown && i === shown.rings + 1 && (f ? f.landed : true);
      const colour = shown?.owner === "rival" ? COPPER : GOLD;
      c.save();
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fillStyle = passed ? colour : "rgba(255,255,255,0.05)";
      c.fill();
      c.lineWidth = 2 * L.type;
      c.strokeStyle = struck || blocked === i ? DANGER : passed ? colour : "rgba(246,234,203,0.4)";
      c.stroke();
      c.restore();
      text(c, String(i), cx, cy + 1, `${Math.round((i > 9 ? 9 : 10) * L.type)}px ${PIXEL}`, passed ? "#2a1a08" : struck || blocked === i ? DANGER : CREAM, "center");
      if (struck) {
        const k = 9 * L.type;
        c.save();
        c.strokeStyle = DANGER;
        c.lineWidth = 2.5 * L.type;
        c.beginPath();
        c.moveTo(cx - k, cy - k); c.lineTo(cx + k, cy + k);
        c.moveTo(cx + k, cy - k); c.lineTo(cx - k, cy + k);
        c.stroke();
        c.restore();
      }
    }
  }

  /** Both archers' arrows so far, the totals, and whose arrow is next. An arrow counts here once it lands. */
  private scoreboard(c: CanvasRenderingContext2D, s: BowState, now: number, L: Layout) {
    const turns = s.practice ? 1 : BOW.turns, shown = bowScoreShown(s);
    const rows: [string, number[], number, string, boolean][] = [
      ["ODYSSEUS", shown.shots, shown.score, GOLD, s.phase === "player" || s.phase === "rival" && shown.shots.length < s.shots.length],
      ["ANTINOUS", shown.rivalShots, shown.rivalScore, COPPER, s.phase !== "player" && shown.shots.length === s.shots.length],
    ];
    if (L.compact) {
      // Totals only: the per-arrow cells are too small to read on a phone.
      const x = 24, y = L.top + 60 * L.type, w = 236 * L.type, h = 86 * L.type;
      panel(c, x, y, w, h);
      text(c, `ARROW ${Math.min(s.turn, turns)}/${turns}`, x + 12 * L.type, y + 16 * L.type, `${Math.round(8 * L.type)}px ${PIXEL}`, "rgba(246,234,203,0.75)");
      rows.forEach(([name, , total, colour], r) => {
        const ry = y + (38 + r * 28) * L.type;
        text(c, name, x + 12 * L.type, ry, `${Math.round(9 * L.type)}px ${PIXEL}`, colour);
        text(c, String(total), x + w - 12 * L.type, ry + 1, `bold ${Math.round(20 * L.type)}px ${SERIF}`, colour, "right");
      });
      return;
    }
    const x = 32, y = L.top, w = 392, h = 112;
    panel(c, x, y, w, h);
    text(c, `ARROW ${Math.min(s.turn, turns)} OF ${turns}  ·  TIES GO TO ANTINOUS`, x + 16, y + 17, `9px ${PIXEL}`, "rgba(246,234,203,0.75)");
    rows.forEach(([name, shots, total, colour, active], r) => {
      const ry = y + 46 + r * 38;
      text(c, name, x + 16, ry, `10px ${PIXEL}`, colour);
      for (let i = 0; i < turns; i++) {
        const cx = x + 132 + i * 40;
        const current = active && i === shots.length && !s.done;
        c.save();
        roundedRect(c, cx, ry - 14, 34, 28, 5);
        c.fillStyle = i < shots.length ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.25)";
        c.fill();
        c.lineWidth = current ? 2 : 1;
        c.strokeStyle = current ? `rgba(242,210,126,${0.55 + 0.45 * Math.sin(now / 180)})` : "rgba(246,234,203,0.22)";
        c.stroke();
        c.restore();
        if (i < shots.length) text(c, String(shots[i]), cx + 17, ry + 1, `bold 15px ${SANS}`, shots[i] >= BOW.axes ? colour : CREAM, "center");
      }
      text(c, String(total), x + w - 18, ry + 1, `bold 26px ${SERIF}`, colour, "right");
    });
  }

  /** The draught through the hall: which way it carries an arrow, how hard, and which way to aim. */
  private wind(c: CanvasRenderingContext2D, s: BowState, L: Layout) {
    const w = (L.compact ? 236 : 258) * L.type, h = (L.compact ? 86 : 112) * L.type;
    const x = VIEW_W - w - (L.compact ? 24 : 32), y = L.compact ? L.top + 60 * L.type : L.top;
    panel(c, x, y, w, h);
    const t = L.type;
    text(c, "DRAUGHT", x + 14 * t, y + 16 * t, `${Math.round(9 * t)}px ${PIXEL}`, "rgba(246,234,203,0.75)");
    const strength = Math.abs(s.wind), max = [20, 40, 55][tierOf(s.difficulty)];
    text(c, strength ? String(strength) : "CALM", x + w - 14 * t, y + 18 * t, `bold ${Math.round((strength ? 24 : 16) * t)}px ${SERIF}`, CREAM, "right");
    const cy = y + (L.compact ? 46 : 56) * t, left = x + 20 * t, right = x + w - 20 * t, mid = (left + right) / 2;
    c.save();
    c.strokeStyle = "rgba(246,234,203,0.3)";
    c.lineWidth = 2 * t;
    c.beginPath(); c.moveTo(left, cy); c.lineTo(right, cy); c.stroke();
    c.beginPath(); c.moveTo(mid, cy - 9 * t); c.lineTo(mid, cy + 9 * t); c.stroke();
    if (strength) {
      const dir = Math.sign(s.wind), tip = mid + dir * (14 * t + (right - mid - 18 * t) * clamp01(strength / max));
      c.strokeStyle = "#9fe3dc";
      c.fillStyle = "#9fe3dc";
      c.lineWidth = 5 * t;
      c.lineCap = "round";
      c.beginPath(); c.moveTo(mid, cy); c.lineTo(tip - dir * 8 * t, cy); c.stroke();
      c.beginPath(); c.moveTo(tip, cy); c.lineTo(tip - dir * 14 * t, cy - 9 * t); c.lineTo(tip - dir * 14 * t, cy + 9 * t); c.closePath(); c.fill();
    }
    c.restore();
    const into = `aim ${draughtAllowance(s.wind, s.difficulty).words} ${s.wind > 0 ? "left" : "right"}`;
    const hint = strength ? (L.compact ? into : `Blows ${s.wind > 0 ? "right" : "left"}  ·  ${into}`) : "Still air  ·  aim a touch high";
    text(c, hint, x + w / 2, y + h - 20 * t, `${Math.round(15 * t)}px ${SANS}`, CREAM, "center");
  }

  // -------------------------------------------------------------------------
  // Banners
  // -------------------------------------------------------------------------

  private banners(c: CanvasRenderingContext2D, s: BowState, L: Layout) {
    const turns = s.practice ? 1 : BOW.turns, f = flightOf(s), t = Math.min(1.5, L.type);
    // On a phone the banners sit lower, clear of the panels under the HUD.
    const y = L.compact ? 450 : 320;
    if (s.phase === "player" && s.timer < 1500) {
      const a = fade(s.timer, 1500);
      band(c, y - 36 * t, 124 * t, a);
      shadowed(c, `ARROW ${s.turn} OF ${turns}`, VIEW_W / 2, y + 10 * t, `bold ${Math.round(54 * t)}px ${SERIF}`, GOLD, "center", a);
      shadowed(c, s.blocked ? `AXE ${s.blocked} IS NARROWED BY ANTINOUS' ARROW` : "YOUR SHOT", VIEW_W / 2, y + 62 * t, `${Math.round(13 * t)}px ${PIXEL}`, s.blocked ? DANGER : CREAM, "center", a);
      return;
    }
    // Once your arrow's result has had its moment, the hall turns to Antinous.
    const watching = s.phase === "rival" && s.timer >= BOW.flightMs + BOW.resultMs;
    if (f && f.landed && !watching) {
      const a = fade(f.since, Math.max(600, BOW.flightMs + BOW.resultMs - arrowTime(f.end)));
      const rings = f.shot.rings, mine = f.shot.owner === "player";
      const headline = rings >= BOW.axes ? (mine ? "ALL TWELVE!" : "ANTINOUS: ALL TWELVE") : `${mine ? "" : "ANTINOUS: "}${rings} AXE${rings === 1 ? "" : "S"}`;
      band(c, y - 50 * t, 136 * t, a);
      shadowed(c, headline, VIEW_W / 2, y, `bold ${Math.round((mine ? 60 : 46) * t)}px ${SERIF}`, mine ? GOLD : COPPER, "center", a);
      shadowed(c, mine ? shotAdvice(f.shot) : s.rivalLine, VIEW_W / 2, y + 58 * t, `${Math.round(22 * t)}px ${SANS}`, CREAM, "center", a);
      return;
    }
    if (watching) {
      // He holds the aim while the model decides, so the banner stays until he looses.
      const since = s.timer - BOW.flightMs - BOW.resultMs, a = clamp01(since / 250);
      const deciding = !!s.decision && !s.decision.choice && !s.decision.failed;
      band(c, y - 46 * t, 128 * t, a);
      shadowed(c, deciding ? "ANTINOUS STUDIES THE DRAUGHT" : "ANTINOUS DRAWS", VIEW_W / 2, y, `bold ${Math.round((deciding ? 38 : 46) * t)}px ${SERIF}`, COPPER, "center", a);
      shadowed(c, deciding ? "He weighs his shots. Watch where his arrow strikes." : s.rivalLine || "His arrow flies down the same line. Watch where it strikes.", VIEW_W / 2, y + 54 * t, `${Math.round(21 * t)}px ${SANS}`, CREAM, "center", a);
    }
  }

  /** How to shoot, beside the scene until the first arrow is loosed; a one-line reminder after, and on a phone. */
  private coach(c: CanvasRenderingContext2D, s: BowState, options: HallOverlayOptions, L: Layout, alpha: number) {
    if (s.drawing) return;
    c.save();
    c.globalAlpha = alpha;
    if (options.coach && !L.compact) {
      const x = 32, y = 560, w = 452, h = 218;
      panel(c, x, y, w, h);
      text(c, "HOW TO SHOOT", x + 20, y + 26, `11px ${PIXEL}`, GOLD);
      const steps: [string, string][] = options.touch
        ? [["AIM", "Drag anywhere on the hall"], ["DRAW", "Hold the DRAW button"], ["LOOSE", "Let go. A full draw flies flattest"]]
        : [["AIM", "Point down the line of holes (mouse / arrows)"], ["DRAW", "Hold the mouse button or SPACE"], ["LOOSE", "Let go. A full draw flies flattest"]];
      steps.forEach(([verb, how], i) => {
        const sy = y + 66 + i * 40;
        c.save();
        c.beginPath(); c.arc(x + 34, sy, 13, 0, Math.PI * 2);
        c.fillStyle = GOLD; c.fill();
        c.restore();
        text(c, String(i + 1), x + 34, sy + 1, `bold 15px ${SANS}`, "#2a1a08", "center");
        text(c, verb, x + 58, sy, `11px ${PIXEL}`, CREAM);
        text(c, how, x + 140, sy, `17px ${SANS}`, CREAM);
      });
      text(c, "Hold too long and your arm trembles.", x + 20, y + h - 22, `15px ${SANS}`, "rgba(246,234,203,0.7)");
    } else {
      const t = Math.min(1.6, L.type);
      shadowed(c, options.touch ? "Drag to aim  ·  hold DRAW  ·  let go to loose" : "Aim  ·  hold to draw  ·  let go to loose", VIEW_W / 2, L.compact ? L.top + 100 * t : VIEW_H - 150, `${Math.round(18 * t)}px ${SANS}`, CREAM, "center", 0.85);
    }
    c.restore();
  }
}

// ---------------------------------------------------------------------------
// Flat fallback: the hall drawn in 2D where WebGL is unavailable
// ---------------------------------------------------------------------------

/**
 * The same hall, camera and arrows as the 3D view, drawn as flat shapes. It is
 * plainer, but every gameplay element sits where the 3D view would put it.
 */
export function drawFlatHall(c: CanvasRenderingContext2D, s: BowState, cam: HallCamera) {
  const project = projector(cam);
  const sky = c.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, "#2a1c10");
  sky.addColorStop(0.5, "#5a3f22");
  sky.addColorStop(1, "#c7ad84");
  c.fillStyle = sky;
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  // Floor: the line's trench and the colonnade's edges, in perspective.
  const quad = (pts: Vec3[], fill: string) => {
    const ps = pts.map(project);
    if (ps.some(p => !p.on)) return;
    c.beginPath();
    ps.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  quad([{ x: -3.3, y: 0, z: 0.2 }, { x: 3.3, y: 0, z: 0.2 }, { x: 3.3, y: 0, z: -18 }, { x: -3.3, y: 0, z: -18 }], "#d9c8a6");
  quad([{ x: -0.12, y: 0.001, z: -2.6 }, { x: 0.12, y: 0.001, z: -2.6 }, { x: 0.12, y: 0.001, z: -15.4 }, { x: -0.12, y: 0.001, z: -15.4 }], "#4a3520");
  // Far doorway.
  quad([{ x: -1, y: 0, z: -17.4 }, { x: 1, y: 0, z: -17.4 }, { x: 1, y: 3.2, z: -17.4 }, { x: -1, y: 3.2, z: -17.4 }], "#ffe7ae");
  // Columns, far to near.
  for (let z = -17; z <= 1; z += 3) for (const x of [-3.3, 3.3]) quad([{ x: x - 0.3, y: 0, z }, { x: x + 0.3, y: 0, z }, { x: x + 0.3, y: 6.5, z }, { x: x - 0.3, y: 6.5, z }], "#e8dcc0");
  // Axes, far to near, so nearer heads cover farther ones.
  for (let i = BOW.axes; i >= 1; i--) {
    const at = axeAt(i), r = openingOf(s.difficulty, i) * BOW.unitM;
    quad([{ x: -0.03, y: 0, z: at.z }, { x: 0.03, y: 0, z: at.z }, { x: 0.03, y: LINE_Y - r, z: at.z }, { x: -0.03, y: LINE_Y - r, z: at.z }], "#5a3a1e");
    const centre = project(at);
    if (!centre.on) continue;
    const ro = (r + 0.05) * centre.scale, blade = (r + 0.24) * centre.scale;
    c.fillStyle = "#b8823c";
    c.beginPath();
    c.moveTo(centre.x - blade, centre.y - blade * 0.6);
    c.quadraticCurveTo(centre.x - blade * 1.15, centre.y, centre.x - blade, centre.y + blade * 0.6);
    c.lineTo(centre.x - ro * 0.7, centre.y + ro * 0.5);
    c.lineTo(centre.x + ro * 0.7, centre.y + ro * 0.5);
    c.lineTo(centre.x + blade, centre.y + blade * 0.6);
    c.quadraticCurveTo(centre.x + blade * 1.15, centre.y, centre.x + blade, centre.y - blade * 0.6);
    c.lineTo(centre.x + ro * 0.7, centre.y - ro * 0.5);
    c.lineTo(centre.x - ro * 0.7, centre.y - ro * 0.5);
    c.closePath();
    c.fill();
    c.beginPath();
    c.arc(centre.x, centre.y, ro, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffe7ae";
    c.beginPath();
    c.arc(centre.x, centre.y, r * centre.scale, 0, Math.PI * 2);
    c.fill();
  }
  const f = flightOf(s);
  if (f) {
    const tip = project(arrowPoint(f.shot, f.z)), tail = project(arrowPoint(f.shot, Math.max(0, f.z - 0.05)));
    if (tip.on && tail.on) {
      c.strokeStyle = f.shot.owner === "player" ? "#fff2c8" : "#ffb59a";
      c.lineWidth = Math.max(2, tip.scale * 0.012);
      c.beginPath(); c.moveTo(tail.x, tail.y); c.lineTo(tip.x, tip.y); c.stroke();
    }
  }
  const bow = project(onLine(0));
  if (s.phase === "player" && bow.on) {
    c.strokeStyle = "#3b2414";
    c.lineWidth = 16;
    c.beginPath();
    c.moveTo(bow.x + 40, VIEW_H + 40);
    c.quadraticCurveTo(bow.x + 120, bow.y - 60, bow.x + 420, -40);
    c.stroke();
  }
}
