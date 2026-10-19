// Decorative rendering only. All positions and warnings come from the simulation.
export function shadow(c: CanvasRenderingContext2D, x: number, y: number, width: number, height = width / 4) {
  c.fillStyle = "#02091478"; c.beginPath(); c.ellipse(x, y, width, height, 0, 0, Math.PI * 2); c.fill();
}

export function gardenTile(c: CanvasRenderingContext2D, x: number, y: number, size: number, wall: boolean, seed: number) {
  const g = c.createLinearGradient(x, y, x + size, y + size);
  g.addColorStop(0, wall ? "#68705c" : seed % 3 ? "#c1ac7e" : "#b49a70");
  g.addColorStop(1, wall ? "#263c32" : "#8f7855");
  c.fillStyle = g; c.fillRect(x, y, size, size);
  c.strokeStyle = wall ? "#182c28" : "#74654c"; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, size - 1, size - 1);
  if (wall) {
    c.fillStyle = "#14291e88"; c.fillRect(x + 2, y + size - 8, size, 10);
    c.strokeStyle = "#97a18466"; c.strokeRect(x + 3, y + 7, size - 6, size - 15);
    for (let i = 0; i < 6; i++) {
      const px = x + 5 + (seed * 13 + i * 11) % (size - 9), py = y + 4 + (seed * 7 + i * 9) % (size - 11);
      c.fillStyle = ["#385c32", "#58753d", "#74904e", "#416f48"][i % 4];
      c.beginPath(); c.ellipse(px, py, 8, 4, -.6 + i * .4, 0, Math.PI * 2); c.fill();
    }
    if (seed % 4 === 0) {
      for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? "#dc8cb7" : "#a86dba"; c.beginPath(); c.arc(x + 17 + Math.cos(i * 1.25) * 4, y + 14 + Math.sin(i * 1.25) * 4, 3, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = "#f9d179"; c.fillRect(x + 16, y + 13, 2, 2);
    }
  } else {
    c.strokeStyle = "#f1ddb54d"; c.beginPath(); c.moveTo(x + 3, y + size - 3); c.lineTo(x + 3, y + 3); c.lineTo(x + size - 3, y + 3); c.stroke();
    if (seed % 5 === 0) { c.strokeStyle = "#6b695d66"; c.beginPath(); c.moveTo(x + 9, y + size); c.lineTo(x + 12, y + 25); c.lineTo(x + 8, y + 20); c.stroke(); }
    for (let i = 0; i < 3; i++) { c.fillStyle = "#efdfb329"; c.fillRect(x + 6 + (seed + i * 17) % 25, y + 8 + (seed * 3 + i * 11) % 23, 2, 1); }
  }
}

export function torchlight(c: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const glow = c.createRadialGradient(x, y, 1, x, y, 85);
  glow.addColorStop(0, "#ffd17c55"); glow.addColorStop(1, "#e7851200"); c.fillStyle = glow; c.fillRect(x - 85, y - 85, 170, 170);
  c.fillStyle = "#68462d"; c.fillRect(x - 4, y + 5, 8, 36);
  c.fillStyle = "#d4a655"; c.beginPath(); c.moveTo(x - 13, y + 6); c.lineTo(x + 13, y + 6); c.lineTo(x + 7, y + 17); c.lineTo(x - 7, y + 17); c.fill();
  c.fillStyle = "#ffae48"; c.beginPath(); c.moveTo(x, y - 29 - Math.sin(time / 130) * 3); c.quadraticCurveTo(x + 23, y + 6, x, y + 9); c.quadraticCurveTo(x - 20, y + 7, x, y - 29); c.fill();
  c.fillStyle = "#fff0ad"; c.beginPath(); c.ellipse(x, y - 3, 5, 12, .15, 0, Math.PI * 2); c.fill();
}

export function motes(c: CanvasRenderingContext2D, time: number, kind: "pollen" | "embers" | "rain") {
  c.save();
  for (let i = 0; i < 26; i++) {
    const x = (i * 137 + (kind === "rain" ? time * .035 : Math.sin(time / 2400 + i) * 12) + 800) % 800;
    const y = (i * 83 + time * (kind === "rain" ? .2 : -.009) + 48000) % 480;
    c.globalAlpha = .12 + (Math.sin(i + time / 1000) + 1) * .14;
    if (kind === "rain") { c.strokeStyle = "#a5e5f6"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 5, y + 18); c.stroke(); }
    else { c.fillStyle = kind === "pollen" ? "#ffdbac" : "#ffb758"; c.beginPath(); c.arc(x, y, 1 + i % 2, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
}

export function sceneFrame(c: CanvasRenderingContext2D, width: number, height: number) {
  const g = c.createRadialGradient(width / 2, height / 2, width * .2, width / 2, height / 2, width * .65);
  g.addColorStop(0, "#02091400"); g.addColorStop(1, "#0209149c"); c.fillStyle = g; c.fillRect(0, 0, width, height);
  c.strokeStyle = "#e9b85c66"; c.lineWidth = 1; c.strokeRect(4.5, 4.5, width - 9, height - 9);
  for (const [x, y, dx, dy] of [[10, 10, 1, 1], [width - 10, 10, -1, 1], [10, height - 10, 1, -1], [width - 10, height - 10, -1, -1]]) {
    c.save(); c.translate(x, y); c.scale(dx, dy); c.strokeStyle = "#e9b85caa"; c.beginPath(); c.moveTo(0, 27); c.lineTo(0, 0); c.lineTo(27, 0); c.moveTo(6, 21); c.lineTo(6, 6); c.lineTo(21, 6); c.lineTo(21, 15); c.lineTo(13, 15); c.lineTo(13, 11); c.stroke(); c.restore();
  }
}
