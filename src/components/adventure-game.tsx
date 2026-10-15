import { useEffect, useRef } from "react";
import { LOTUS_MAZE, LOTUS_SHIP, adventureStatus, type AdventureState, type AdventureAction } from "../lib/odyssey-games";

const gold = "#e9b85c", cyan = "#32d4f5", cream = "#f6f0e3";
function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function hero(c: CanvasRenderingContext2D, x: number, y: number, scale = 1, sailor = false) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  c.fillStyle = "#030b1866"; c.beginPath(); c.ellipse(0, 16, 18, 5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = sailor ? "#9fced9" : "#a54944"; c.beginPath(); c.moveTo(-8, -6); c.lineTo(-14, 14); c.lineTo(11, 14); c.lineTo(7, -6); c.fill();
  c.fillStyle = "#cba377"; c.fillRect(-6, -7, 13, 17); c.fillStyle = sailor ? "#dbe4df" : "#d2a454"; c.fillRect(-8, -9, 16, 5); circle(c, 0, -16, 8, "#d7b590");
  c.fillStyle = sailor ? "#ddd8c4" : gold; c.fillRect(-9, -24, 18, 7); if (!sailor) { c.fillStyle = "#923e3a"; c.fillRect(-8, -30, 4, 9); circle(c, -10, 3, 9, "#d9ac56"); circle(c, -10, 3, 6, "#8d693c"); }
  c.fillStyle = "#cabf9e"; c.fillRect(-7, 12, 5, 6); c.fillRect(3, 12, 5, 6); c.restore();
}
function ship(c: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  c.save(); c.translate(x, y); c.scale(scale, scale); c.strokeStyle = "#294e65"; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 22, 53, 10, 0, 0, Math.PI * 2); c.stroke();
  c.fillStyle = "#a27443"; c.beginPath(); c.moveTo(-47, 8); c.lineTo(-31, 27); c.lineTo(33, 27); c.lineTo(49, 3); c.lineTo(27, 12); c.closePath(); c.fill(); c.strokeStyle = gold; c.lineWidth = 2; c.stroke();
  c.fillStyle = "#e3c792"; c.fillRect(-3, -48, 4, 59); c.beginPath(); c.moveTo(4, -44); c.quadraticCurveTo(40, -32, 34, 0); c.lineTo(4, 0); c.fill(); c.fillStyle = "#8a4841"; c.fillRect(13, -29, 8, 19); c.restore();
}
function sea(c: CanvasRenderingContext2D, time: number, still: boolean) {
  const g = c.createLinearGradient(0, 0, 0, 480); g.addColorStop(0, "#101d36"); g.addColorStop(.5, "#12334b"); g.addColorStop(1, "#071a32"); c.fillStyle = g; c.fillRect(0, 0, 800, 480);
  circle(c, 640, 64, 33, "#c0d5d22a"); circle(c, 642, 63, 26, "#c9ded84a");
  c.fillStyle = "#0a182d"; c.beginPath(); c.moveTo(0, 180); for (let x = 0; x <= 800; x += 50) c.lineTo(x, 138 + Math.sin(x * .016) * 34); c.lineTo(800, 240); c.lineTo(0, 240); c.fill();
  c.lineWidth = 1; for (let y = 210; y < 480; y += 24) { c.strokeStyle = y % 3 ? "#32d4f51a" : "#e9b85c18"; c.beginPath(); for (let x = 0; x <= 800; x += 10) { const py = y + Math.sin(x * .02 + (still ? 0 : time / 1500) + y) * 3; x ? c.lineTo(x, py) : c.moveTo(x, py); } c.stroke(); }
}
export function AdventureGame({ state: s, active, act, still }: { state: AdventureState; active: boolean; act: (a: AdventureAction) => void; still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current?.getContext("2d"); if (!c) return;
    c.clearRect(0, 0, 800, 480); sea(c, s.elapsed, still);
    if (s.id === "lotus") {
      const unit = 39, ox = 108, oy = 22;
      for (let y = 0; y < LOTUS_MAZE.length; y++) for (let x = 0; x < LOTUS_MAZE[y].length; x++) {
        const px = ox + x * unit, py = oy + y * unit;
        c.fillStyle = LOTUS_MAZE[y][x] === "#" ? "#283f49" : "#132b34"; c.fillRect(px, py, unit - 1, unit - 1);
        if (LOTUS_MAZE[y][x] === "#") { c.fillStyle = "#66817835"; c.fillRect(px, py, unit - 1, 3); c.fillStyle = "#7f6aa03b"; c.fillRect(px + 9, py + 14, 19, 9); }
        else if ((x * 7 + y * 3) % 9 === 0) { circle(c, px + 11, py + 13, 3, "#a879ff66"); circle(c, px + 16, py + 10, 3, "#a879ff66"); }
      }
      const pos = (p: { x: number; y: number }) => ({ x: ox + p.x * unit + unit / 2, y: oy + p.y * unit + unit / 2 });
      const home = pos(LOTUS_SHIP); circle(c, home.x, home.y, 19, "#32d4f525"); ship(c, home.x, home.y + 3, .37);
      for (const p of s.pickups) { const a = pos(p); circle(c, a.x, a.y, 13, "#e9b85c24"); c.fillStyle = gold; c.font = "22px Georgia"; c.textAlign = "center"; c.fillText("✦", a.x, a.y + 8); }
      for (const p of s.sailors) { const a = pos(p); hero(c, a.x, a.y + 4, .6, true); c.fillStyle = cream; c.font = "bold 14px sans-serif"; c.textAlign = "center"; c.fillText("!", a.x, a.y - 18); }
      for (const p of s.guardians) { const a = pos(p); circle(c, a.x, a.y, 14, "#a879ff22"); circle(c, a.x, a.y, 10, "#77519d"); c.fillStyle = "#edd7ff"; c.fillRect(a.x - 6, a.y - 3, 4, 3); c.fillRect(a.x + 2, a.y - 3, 4, 3); }
      const a = pos(s.player); if (s.protection) { c.strokeStyle = gold; c.lineWidth = 2; c.beginPath(); c.arc(a.x, a.y, 18, 0, Math.PI * 2); c.stroke(); } if (!s.invulnerable || Math.floor(s.elapsed / 100) % 2) hero(c, a.x, a.y + 6, .73);
      if (s.carrying) { circle(c, a.x + 13, a.y + 11, 5, cyan); }
    } else if (s.id === "cyclops") {
      c.fillStyle = "#12101d"; c.fillRect(0, 0, 800, 480); const glow = c.createRadialGradient(400, 80, 5, 400, 170, 390); glow.addColorStop(0, "#737369"); glow.addColorStop(.25, "#3d3c3c"); glow.addColorStop(1, "#181626"); c.fillStyle = glow; c.fillRect(0, 0, 800, 480);
      c.fillStyle = "#88764d22"; c.beginPath(); c.moveTo(345, 90); c.lineTo(455, 90); c.lineTo(770, 480); c.lineTo(30, 480); c.fill();
      for (let i = 0; i < 4; i++) { c.strokeStyle = "#e9b85c44"; c.lineWidth = 2; c.beginPath(); c.moveTo(345 + i * 37, 90); c.lineTo(30 + i * 247, 480); c.stroke(); }
      for (let i = 0; i < 6; i++) { const p = ((s.elapsed / 2400 + i / 6) % 1), y = 90 + p * p * 390, half = 55 + p * 315; c.strokeStyle = "#bbae9130"; c.beginPath(); c.moveTo(400 - half, y); c.lineTo(400 + half, y); c.stroke(); }
      for (const x of [115, 685]) { c.fillStyle = "#7d533a"; c.fillRect(x, 225, 7, 65); circle(c, x + 3, 216, 23, "#ffb64d13"); circle(c, x + 3, 216, 9, "#ffcb64"); }
      c.fillStyle = "#645240"; c.beginPath(); c.ellipse(400, 64, 42, 54, 0, 0, Math.PI * 2); c.fill(); circle(c, 400, 58, 13, "#a95044"); c.fillStyle = "#211a22"; c.fillRect(386, 56, 28, 5);
      for (const o of [...s.obstacles].sort((a, b) => b.remaining - a.remaining)) {
        const p = 1 - o.remaining / o.warning, y = 105 + p * p * 310, width = 36 + p * 145, x = 400 + (o.lane - 1) * (39 + p * 210);
        c.save(); c.translate(x, y); c.scale(width / 100, width / 100);
        if (o.kind === "sheep") { circle(c, 0, -8, 22, "#d9e1d3"); circle(c, 20, -5, 11, "#798991"); }
        else if (o.kind === "beam") { c.fillStyle = "#956442"; c.fillRect(-45, -47, 90, 18); c.fillRect(-45, -47, 9, 60); c.fillRect(36, -47, 9, 60); c.fillStyle = gold; c.font = "14px sans-serif"; c.textAlign = "center"; c.fillText("SLIDE", 0, -52); }
        else if (o.kind === "gap") { c.fillStyle = "#050812"; c.beginPath(); c.ellipse(0, 8, 45, 16, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = "#e9b85c"; c.stroke(); }
        else { c.fillStyle = o.kind === "rock" ? "#6d7080" : "#9a7044"; c.beginPath(); c.moveTo(-30, 8); c.lineTo(-36, -15); c.lineTo(-12, -44); c.lineTo(23, -38); c.lineTo(36, 8); c.fill(); c.strokeStyle = "#d6c08c"; c.stroke(); }
        c.restore();
      }
      const x = 400 + (s.lane - 1) * 230, y = 420 - (s.jump ? Math.sin(s.jump / 1000 * Math.PI) * 85 : 0);
      c.save(); if (s.slide) { c.translate(x, y); c.scale(1, .5); hero(c, 0, 0, 1.8); } else if (!s.invulnerable || Math.floor(s.elapsed / 100) % 2) hero(c, x, y, 1.8); c.restore();
      c.fillStyle = "#b2b7c5"; c.font = "12px monospace"; c.textAlign = "center"; c.fillText("LEFT", 165, 465); c.fillText("CENTER", 400, 465); c.fillText("RIGHT", 635, 465);
    } else if (s.id === "aeolus") {
      for (const gate of s.gates) {
        const top = gate.center - gate.gap / 2, bottom = gate.center + gate.gap / 2;
        c.fillStyle = "#3b5563"; c.fillRect(gate.x - 22, 0, 44, top); c.fillRect(gate.x - 26, top - 14, 52, 14); c.fillStyle = "#708486"; c.fillRect(gate.x - 17, 0, 5, top - 15);
        c.fillStyle = "#203c50"; c.beginPath(); c.moveTo(gate.x - 42, 480); c.lineTo(gate.x - 34, bottom + 20); c.lineTo(gate.x - 7, bottom); c.lineTo(gate.x + 25, bottom + 13); c.lineTo(gate.x + 40, 480); c.fill(); c.strokeStyle = "#32d4f567"; c.stroke();
        if (!gate.collected) { circle(c, gate.x, gate.center, 17, gate.pickup === "repair" ? "#5dde9322" : "#32d4f522"); c.fillStyle = gate.pickup === "repair" ? "#5dde93" : cyan; c.font = "22px sans-serif"; c.textAlign = "center"; c.fillText(gate.pickup === "repair" ? "+" : "✦", gate.x, gate.center + 8); }
      }
      if (!s.invulnerable || Math.floor(s.elapsed / 100) % 2) ship(c, 155, s.y + 7, .72);
      c.fillStyle = "#aec5d0"; c.font = "12px monospace"; c.textAlign = "left"; c.fillText("THE WINDS OF AEOLUS", 25, 30);
    } else {
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
        } c.restore();
        c.fillStyle = "#a9bcd077"; c.font = "16px sans-serif"; c.textAlign = "left"; c.fillText(r.speed > 0 ? "→" : "←", 15, y + 6);
      }
      c.fillStyle = "#e9d49e"; c.fillRect(325, 15, 150, 8); for (let x = 335; x < 475; x += 30) c.fillRect(x, 23, 10, 26); c.beginPath(); c.moveTo(315, 15); c.lineTo(400, -8); c.lineTo(485, 15); c.fill();
      if (s.lightning) {
        const bolt = s.lightning, x = 54 + bolt.x * width, y = oy - bolt.row * height;
        c.fillStyle = bolt.warning > 0 ? "#f6535855" : "#fff3b6cc"; c.fillRect(x - 60, y - 21, 120, 43);
        c.fillStyle = cream; c.font = "bold 12px monospace"; c.textAlign = "center"; c.fillText(bolt.warning > 0 ? "! LIGHTNING" : "STRIKE", x, y + 5);
      }
      if (s.lightning) {
        const x = 54 + s.lightning.x * width, y = oy - s.lightning.row * height;
        c.fillStyle = s.lightning.warning > 0 ? "#f6535833" : "#ffd67a88"; c.fillRect(x - 58, y - 21, 116, 42);
        c.strokeStyle = s.lightning.warning > 0 ? "#f65358" : "#fff6c5"; c.lineWidth = 2; c.strokeRect(x - 58, y - 21, 116, 42);
        c.fillStyle = s.lightning.warning > 0 ? "#ffb391" : "#fff6c5"; c.font = "bold 19px sans-serif"; c.textAlign = "center"; c.fillText(s.lightning.warning > 0 ? "!" : "ϟ", x, y + 6);
      }
      if (!s.invulnerable || Math.floor(s.elapsed / 100) % 2) hero(c, 54 + s.x * width, oy - s.row * height + 3, .95);
    }
  }, [s, still]);
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
