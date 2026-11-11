import { useEffect, useRef } from "react";
import { mazePath, adventureStatus, type AdventureState, type AdventureAction, type LotusState } from "../../lib/encounters/odyssey-games";
import { useFarshoreAtlas, useFarshoreSprites, useFarshoreItems, drawFarshoreItem, drawFarshoreTile, drawFarshoreSprite } from "../../lib/render/farshore-rendering";
import { gardenTile, shadow, torchlight, motes, sceneFrame } from "../../lib/render/scene-details";

const gold = "#e9b85c", cyan = "#32d4f5", cream = "#f6f0e3";
function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function hero(c: CanvasRenderingContext2D, x: number, y: number, scale = 1, sailor = false, sprites: HTMLImageElement | null = null, pose = 0) {
  if (!sailor && sprites) { const size = 62 * scale; drawFarshoreSprite(c, sprites, pose, x - size / 2, y - size * .8, size, size); return; }
  c.save(); c.translate(x, y); c.scale(scale, scale);
  c.fillStyle = "#030b1866"; c.beginPath(); c.ellipse(0, 16, 18, 5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = sailor ? "#9fced9" : "#a54944"; c.beginPath(); c.moveTo(-8, -6); c.lineTo(-14, 14); c.lineTo(11, 14); c.lineTo(7, -6); c.fill();
  c.fillStyle = "#cba377"; c.fillRect(-6, -7, 13, 17); c.fillStyle = sailor ? "#dbe4df" : "#d2a454"; c.fillRect(-8, -9, 16, 5); circle(c, 0, -16, 8, "#d7b590");
  c.fillStyle = sailor ? "#ddd8c4" : gold; c.fillRect(-9, -24, 18, 7); if (!sailor) { c.fillStyle = "#923e3a"; c.fillRect(-8, -30, 4, 9); circle(c, -10, 3, 9, "#d9ac56"); circle(c, -10, 3, 6, "#8d693c"); }
  c.fillStyle = "#cabf9e"; c.fillRect(-7, 12, 5, 6); c.fillRect(3, 12, 5, 6); c.restore();
}
function ship(c: CanvasRenderingContext2D, x: number, y: number, scale = 1, sprites: HTMLImageElement | null = null) {
  if (sprites) { const size = 135 * scale; drawFarshoreSprite(c, sprites, 3, x - size / 2, y - size * .65, size, size); return; }
  c.save(); c.translate(x, y); c.scale(scale, scale); c.strokeStyle = "#294e65"; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 22, 53, 10, 0, 0, Math.PI * 2); c.stroke();
  c.fillStyle = "#a27443"; c.beginPath(); c.moveTo(-47, 8); c.lineTo(-31, 27); c.lineTo(33, 27); c.lineTo(49, 3); c.lineTo(27, 12); c.closePath(); c.fill(); c.strokeStyle = gold; c.lineWidth = 2; c.stroke();
  c.fillStyle = "#e3c792"; c.fillRect(-3, -48, 4, 59); c.beginPath(); c.moveTo(4, -44); c.quadraticCurveTo(40, -32, 34, 0); c.lineTo(4, 0); c.fill(); c.fillStyle = "#8a4841"; c.fillRect(13, -29, 8, 19); c.restore();
}
/** The size of one garden tile, in canvas pixels, at which the garden is drawn. */
export const LOTUS_UNIT = 39;
/**
 * The lotus garden on a 39-pixel grid from the origin: hedges, the ship,
 * relics, moly, sailors, guardians, and Odysseus with any sailor following.
 * Callers translate and scale the context to place it. `route` draws the path
 * home while a sailor follows, the easy-mode guide.
 */
export function drawLotusGarden(c: CanvasRenderingContext2D, s: LotusState, sprites: HTMLImageElement | null, items: HTMLImageElement | null, route: boolean) {
  const unit = LOTUS_UNIT, maze = s.layout.maze;
  for (let y = 0; y < maze.length; y++) for (let x = 0; x < maze[y].length; x++) gardenTile(c, x * unit, y * unit, unit, maze[y][x] === "#", x * 7 + y * 13);
  const pos = (p: { x: number; y: number }) => ({ x: p.x * unit + unit / 2, y: p.y * unit + unit / 2 });
  const home = pos(s.layout.ship); circle(c, home.x, home.y, 19, "#32d4f565"); ship(c, home.x, home.y + 3, .37, sprites);
  if (s.carrying && route) {
    c.strokeStyle = "#ffdf8988"; c.lineWidth = 3; c.setLineDash([3, 7]); c.beginPath(); const start = pos(s.player); c.moveTo(start.x, start.y);
    for (const p of mazePath(s.player, s.layout.ship, maze)) { const a = pos(p); c.lineTo(a.x, a.y); } c.stroke(); c.setLineDash([]);
  }
  for (const p of s.relics) { const a = pos(p); circle(c, a.x, a.y, 13, "#ffcf522b"); if (!drawFarshoreItem(c, items, 3, a.x - 12, a.y - 12, 24)) circle(c, a.x, a.y, 7, gold); }
  for (const p of s.pickups) { const a = pos(p); circle(c, a.x, a.y, 17, "#e9b85c24"); if (!drawFarshoreItem(c, items, 2, a.x - 17, a.y - 17, 34)) circle(c, a.x, a.y, 8, gold); }
  for (const p of s.sailors) { const a = pos(p); shadow(c, a.x, a.y + 13, 12); if (!drawFarshoreItem(c, items, 0, a.x - 19, a.y - 28, 38, 45)) hero(c, a.x, a.y + 4, .6, true); c.fillStyle = cream; c.font = "bold 12px Georgia"; c.textAlign = "center"; c.fillText("!", a.x, a.y - 28); }
  for (const p of s.guardians) { const a = pos(p); shadow(c, a.x, a.y + 13, 14); circle(c, a.x, a.y + 10, 17, "#a879ff30"); if (!drawFarshoreItem(c, items, 1, a.x - 22, a.y - 27, 44, 48)) circle(c, a.x, a.y, 10, "#77519d"); }
  const a = pos(s.player); if (s.protection) { c.strokeStyle = gold; c.lineWidth = 2; c.beginPath(); c.arc(a.x, a.y, 18, 0, Math.PI * 2); c.stroke(); } if (!s.invulnerable || Math.floor(s.elapsed / 100) % 2) hero(c, a.x, a.y + 6, .73, false, sprites);
  if (s.carrying) { const follower = pos(s.previous); drawFarshoreItem(c, items, 0, follower.x - 14, follower.y - 22, 28, 35); }
}
function sea(c: CanvasRenderingContext2D, time: number, still: boolean) {
  const g = c.createLinearGradient(0, 0, 0, 480); g.addColorStop(0, "#101d36"); g.addColorStop(.5, "#12334b"); g.addColorStop(1, "#071a32"); c.fillStyle = g; c.fillRect(0, 0, 800, 480);
  circle(c, 640, 64, 33, "#c0d5d22a"); circle(c, 642, 63, 26, "#c9ded84a");
  c.fillStyle = "#0a182d"; c.beginPath(); c.moveTo(0, 180); for (let x = 0; x <= 800; x += 50) c.lineTo(x, 138 + Math.sin(x * .016) * 34); c.lineTo(800, 240); c.lineTo(0, 240); c.fill();
  c.lineWidth = 1; for (let y = 210; y < 480; y += 24) { c.strokeStyle = y % 3 ? "#32d4f51a" : "#e9b85c18"; c.beginPath(); for (let x = 0; x <= 800; x += 10) { const py = y + Math.sin(x * .02 + (still ? 0 : time / 1500) + y) * 3; x ? c.lineTo(x, py) : c.moveTo(x, py); } c.stroke(); }
}
export function AdventureGame({ state: s, active, act, still }: { state: AdventureState; active: boolean; act: (a: AdventureAction) => void; still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const atlas = useFarshoreAtlas(), sprites = useFarshoreSprites(), items = useFarshoreItems();
  useEffect(() => {
    const c = canvas.current?.getContext("2d"); if (!c) return;
    c.clearRect(0, 0, 800, 480); sea(c, s.elapsed, still);
    if (s.id === "lotus") {
      drawFarshoreTile(c, atlas, 0, 0, 0, 800, 480, .5);
      c.save(); c.translate(108, 22);
      drawLotusGarden(c, s, sprites, items, s.difficulty === "easy" || s.practice);
      c.restore();
      motes(c, still ? 0 : s.elapsed, "pollen");
    } else if (s.id === "cyclops") {
      c.fillStyle = "#12101d"; c.fillRect(0, 0, 800, 480); const glow = c.createRadialGradient(400, 80, 5, 400, 170, 390); glow.addColorStop(0, "#737369"); glow.addColorStop(.25, "#3d3c3c"); glow.addColorStop(1, "#181626"); c.fillStyle = glow; c.fillRect(0, 0, 800, 480);
      drawFarshoreTile(c, atlas, 1, 0, 0, 800, 480, .7);
      c.fillStyle = "#080a12aa"; c.fillRect(0, 230, 800, 250);
      c.fillStyle = "#88764d22"; c.beginPath(); c.moveTo(345, 90); c.lineTo(455, 90); c.lineTo(770, 480); c.lineTo(30, 480); c.fill();
      c.fillStyle = "#32d4f512"; c.beginPath(); c.moveTo(345 + s.lane * 37, 90); c.lineTo(382 + s.lane * 37, 90); c.lineTo(277 + s.lane * 247, 480); c.lineTo(30 + s.lane * 247, 480); c.fill();
      for (let i = 0; i < 4; i++) { c.strokeStyle = "#e9b85c44"; c.lineWidth = 2; c.beginPath(); c.moveTo(345 + i * 37, 90); c.lineTo(30 + i * 247, 480); c.stroke(); }
      for (let i = 0; i < 6; i++) { const p = ((s.elapsed / 2400 + i / 6) % 1), y = 90 + p * p * 390, half = 55 + p * 315; c.strokeStyle = "#bbae9130"; c.beginPath(); c.moveTo(400 - half, y); c.lineTo(400 + half, y); c.stroke(); }
      for (const x of [102, 698]) torchlight(c, x, 231, still ? 0 : s.elapsed);
      if (!atlas) { c.fillStyle = "#645240"; c.beginPath(); c.ellipse(400, 64, 42, 54, 0, 0, Math.PI * 2); c.fill(); circle(c, 400, 58, 13, "#a95044"); c.fillStyle = "#211a22"; c.fillRect(386, 56, 28, 5); }
      for (const o of [...s.obstacles].sort((a, b) => b.remaining - a.remaining)) {
        const p = 1 - o.remaining / o.warning, y = 105 + p * p * 310, width = 36 + p * 145, x = 400 + (o.lane - 1) * (39 + p * 210);
        c.save(); c.translate(x, y); c.scale(width / 100, width / 100);
        shadow(c, 0, 10, 36, 9);
        const item = { rock: 4, crate: 5, beam: 6, sheep: 7, coin: 3, gap: -1 }[o.kind];
        if (item >= 0 && drawFarshoreItem(c, items, item, -45, -66, 90, 90)) {
          if (o.kind === "beam" || o.kind === "crate") { c.fillStyle = gold; c.font = "bold 12px Georgia"; c.textAlign = "center"; c.fillText(o.kind === "beam" ? "SLIDE" : "JUMP", 0, -68); }
        }
        else if (o.kind === "coin") circle(c, 0, -8, 18, gold);
        else if (o.kind === "sheep") { circle(c, 0, -8, 22, "#d9e1d3"); circle(c, 20, -5, 11, "#798991"); }
        else if (o.kind === "beam") { c.fillStyle = "#956442"; c.fillRect(-45, -47, 90, 18); c.fillRect(-45, -47, 9, 60); c.fillRect(36, -47, 9, 60); c.fillStyle = gold; c.font = "14px sans-serif"; c.textAlign = "center"; c.fillText("SLIDE", 0, -52); }
        else if (o.kind === "gap") { c.fillStyle = "#050812"; c.beginPath(); c.ellipse(0, 8, 45, 16, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = "#e9b85c"; c.stroke(); }
        else { c.fillStyle = o.kind === "rock" ? "#6d7080" : "#9a7044"; c.beginPath(); c.moveTo(-30, 8); c.lineTo(-36, -15); c.lineTo(-12, -44); c.lineTo(23, -38); c.lineTo(36, 8); c.fill(); c.strokeStyle = "#d6c08c"; c.stroke(); }
        c.restore();
      }
      const x = 400 + (s.lane - 1) * 230, y = 420 - (s.jump ? Math.sin(s.jump / 1000 * Math.PI) * 85 : 0);
      c.save(); if (s.slide) { c.translate(x, y); c.scale(1, .5); hero(c, 0, 0, 1.8, false, sprites, 1); } else if (!s.invulnerable || Math.floor(s.elapsed / 100) % 2) hero(c, x, y, 1.8, false, sprites, 1); c.restore();
      c.fillStyle = "#b2b7c5"; c.font = "12px monospace"; c.textAlign = "center"; c.fillText("LEFT", 165, 465); c.fillText("CENTER", 400, 465); c.fillText("RIGHT", 635, 465);
      motes(c, still ? 0 : s.elapsed, "embers");
    } else if (s.id === "aeolus") {
      drawFarshoreTile(c, atlas, 2, 0, 0, 800, 480, .3);
      for (const gate of s.gates) {
        const top = gate.center - gate.gap / 2, bottom = gate.center + gate.gap / 2;
        c.fillStyle = "#3b5563"; c.fillRect(gate.x - 22, 0, 44, top); c.fillRect(gate.x - 26, top - 14, 52, 14); c.fillStyle = "#708486"; c.fillRect(gate.x - 17, 0, 5, top - 15);
        c.fillStyle = "#203c50"; c.beginPath(); c.moveTo(gate.x - 42, 480); c.lineTo(gate.x - 34, bottom + 20); c.lineTo(gate.x - 7, bottom); c.lineTo(gate.x + 25, bottom + 13); c.lineTo(gate.x + 40, 480); c.fill(); c.strokeStyle = "#32d4f567"; c.stroke();
        drawFarshoreItem(c, items, 8, gate.x - 42, bottom, 84, 480 - bottom + 5);
        c.save(); c.translate(gate.x, top); c.scale(1, -1); drawFarshoreItem(c, items, 8, -30, 0, 60, top + 6); c.restore();
        c.strokeStyle = "#84e8f12c"; c.setLineDash([3, 8]); c.beginPath(); c.moveTo(gate.x - 70, gate.center); c.lineTo(gate.x + 65, gate.center); c.stroke(); c.setLineDash([]);
        if (!gate.collected) { circle(c, gate.x, gate.center, 20, gate.pickup === "repair" ? "#5dde9333" : "#32d4f533"); if (!drawFarshoreItem(c, items, gate.pickup === "repair" ? 9 : 10, gate.x - 19, gate.center - 19, 38)) circle(c, gate.x, gate.center, 8, cyan); }
      }
      if (!s.invulnerable || Math.floor(s.elapsed / 100) % 2) ship(c, 155, s.y + 7, .72, sprites);
      c.fillStyle = "#aec5d0"; c.font = "12px monospace"; c.textAlign = "left"; c.fillText("THE WINDS OF AEOLUS", 25, 30);
      c.fillStyle = "#0d304f77"; c.fillRect(0, 395, 800, 85); c.strokeStyle = "#96e2ef4a"; c.beginPath(); for (let x = 0; x <= 800; x += 8) { const y = 394 + Math.sin(x / 27 + (still ? 0 : s.elapsed / 450)) * 7; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); motes(c, still ? 0 : s.elapsed, "rain");
    } else {
      drawFarshoreTile(c, atlas, 6, 0, 0, 800, 480, .3);
      const width = 99, oy = 445, height = 46;
      c.fillStyle = "#786e4b"; c.fillRect(40, oy - 8 * height - 25, 720, 40); c.fillRect(40, oy - 14, 720, 45);
      for (let row = 1; row <= 7; row++) {
        const r = s.rows[row - 1], y = oy - row * height;
        c.fillStyle = row % 2 ? "#123c54" : "#112f49"; c.fillRect(40, y - 20, 720, 42);
        c.save(); c.beginPath(); c.rect(40, y - 22, 720, 44); c.clip();
        for (let n = -3; n <= 3; n++) {
          const x = 54 + (n * 5.5 + r.offset % 5.5) * width;
          c.fillStyle = "#9c7247"; c.fillRect(x, y - 13, r.width * width, 28); c.strokeStyle = "#d7ac65"; c.strokeRect(x, y - 13, r.width * width, 28); c.fillStyle = "#614a36"; c.fillRect(x + 8, y - 4, r.width * width - 16, 3);
          for (let rope = 30; rope < r.width * width; rope += 80) { c.fillStyle = "#d7bf80"; c.fillRect(x + rope, y - 13, 3, 28); }
          c.strokeStyle = "#3f2f2499"; c.lineWidth = 1; for (let grain = 0; grain < 5; grain++) { c.beginPath(); c.moveTo(x + 4, y - 10 + grain * 5); c.bezierCurveTo(x + 80, y - 15 + grain * 5, x + 160, y - 3 + grain * 5, x + r.width * width - 4, y - 10 + grain * 5); c.stroke(); }
          if (!s.gatheredRows.includes(row)) { const center = x + r.width * width / 2; circle(c, center, y - 3, 15, "#ffd67a33"); drawFarshoreItem(c, items, 11, center - 17, y - 22, 34); }
        } c.restore();
        c.fillStyle = "#a9bcd077"; c.font = "16px sans-serif"; c.textAlign = "left"; c.fillText(r.speed > 0 ? "→" : "←", 15, y + 6);
      }
      c.fillStyle = "#e9d49e"; c.fillRect(325, 15, 150, 8); for (let x = 335; x < 475; x += 30) c.fillRect(x, 23, 10, 26); c.beginPath(); c.moveTo(315, 15); c.lineTo(400, -8); c.lineTo(485, 15); c.fill();
      if (s.lightning) {
        const x = 54 + s.lightning.x * width, y = oy - s.lightning.row * height;
        c.fillStyle = s.lightning.warning > 0 ? "#f6535833" : "#ffd67a88"; c.fillRect(x - 58, y - 21, 116, 42);
        c.strokeStyle = s.lightning.warning > 0 ? "#f65358" : "#fff6c5"; c.lineWidth = 2; c.strokeRect(x - 58, y - 21, 116, 42);
        c.fillStyle = s.lightning.warning > 0 ? "#ffb391" : "#fff6c5"; c.font = "bold 19px sans-serif"; c.textAlign = "center"; c.fillText(s.lightning.warning > 0 ? "!" : "ϟ", x, y + 6);
      }
      if (!s.invulnerable || Math.floor(s.elapsed / 100) % 2) hero(c, 54 + s.x * width, oy - s.row * height + 3, .95, false, sprites);
      motes(c, still ? 0 : s.elapsed, "rain");
    }
    sceneFrame(c, 800, 480);
  }, [s, still, atlas, sprites, items]);
  const move = (dx: number, dy: number) => act({ type: "move", dx, dy });
  return <div className="od-game"><canvas ref={canvas} width={800} height={480} className="od-canvas" role="img" aria-label={`${s.id} game. ${adventureStatus(s)}. ${s.feedback}`}/><div className="od-touch-controls" aria-label="Game controls">
    {s.id === "aeolus" ? <button className="a-btn a-primary" disabled={!active} onClick={() => act({ type: "lift" })}>Catch the wind <kbd>SPACE</kbd></button> : <>
      <button className="a-btn" disabled={!active} aria-label="Move left" onClick={() => move(-1, 0)}>←</button>
      <button className="a-btn" disabled={!active} onClick={() => move(0, -1)}>{s.id === "cyclops" ? "Jump ↑" : "Forward ↑"}</button>
      <button className="a-btn" disabled={!active} onClick={() => move(0, 1)}>{s.id === "cyclops" ? "Slide ↓" : "Back ↓"}</button>
      <button className="a-btn" disabled={!active} aria-label="Move right" onClick={() => move(1, 0)}>→</button>
    </>}
  </div><p className="m-help">{s.id === "aeolus" ? "SPACE / W / ↑ to lift · Release to descend" : "WASD / Arrow keys to move"}{s.id === "cyclops" ? " · SPACE to jump" : ""} · ESC to pause</p></div>;
}
