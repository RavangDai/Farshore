// Builds annotated screen-design frames (SVG) for Figma import and the Phase 3 PDF.
// Each frame embeds a real prototype capture and adds vector callouts, so the
// annotations stay editable after import. No dependencies.
//
// Usage: node scripts/coursework/phase3-frames.mjs <captures-dir>
// Reads docs/coursework/docs/assignment/phase3/editable/frames.json and writes
// phase3/frames/<id>.svg plus phase3/frames/index.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url);
const PHASE = new URL("docs/coursework/docs/assignment/phase3/", ROOT);
const captures = process.argv[2];
if (!captures) throw new Error("Pass the folder that holds the PNG captures.");
const spec = JSON.parse(readFileSync(new URL("editable/frames.json", PHASE), "utf8"));
const outDir = new URL("frames/", PHASE);
mkdirSync(outDir, { recursive: true });

const NAVY = "#102e40", TEAL = "#126978", GOLD = "#a9884b", GRAY = "#526875", CYAN = "#0e8fae", RED = "#b3261e";
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Greedy word wrap using an average glyph width; good enough for Arial at these sizes.
function wrap(text, width, size) {
  const max = Math.max(8, Math.floor(width / (size * 0.53)));
  const lines = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (line && (line + " " + word).length > max) { lines.push(line); line = word; }
      else line = line ? line + " " + word : word;
    }
    lines.push(line);
  }
  return lines;
}
function textBlock(x, y, width, text, { size = 15, weight = 400, color = NAVY, gap = 1.35, family = "Arial" } = {}) {
  const lines = wrap(text, width, size);
  const tspans = lines.map((l, i) => `<tspan x="${x}" dy="${i ? size * gap : 0}">${esc(l)}</tspan>`).join("");
  return { svg: `<text x="${x}" y="${y + size}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}">${tspans}</text>`, height: lines.length * size * gap };
}

const index = [];
for (const frame of spec.frames) {
  const png = join(captures, frame.capture);
  if (!existsSync(png)) { console.warn("missing capture", frame.capture); continue; }
  const phone = frame.device === "phone";
  const shotW = phone ? 390 : 1440, shotH = phone ? 844 : 900;
  const pad = 40, side = phone ? 460 : 520, head = 96;
  const W = pad + shotW + pad + side + pad, H = Math.max(head + shotH + pad, head + 200);
  const sx = pad, sy = head;
  const data = readFileSync(png).toString("base64");
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#f5f8f9"/>`);
  parts.push(`<text x="${pad}" y="40" font-family="Arial" font-size="13" font-weight="700" letter-spacing="2" fill="${TEAL}">${esc(`${frame.id} · ${frame.flow.toUpperCase()}`)}</text>`);
  parts.push(`<text x="${pad}" y="74" font-family="Georgia" font-size="28" fill="${NAVY}">${esc(frame.title)}</text>`);
  parts.push(`<text x="${W - pad}" y="40" text-anchor="end" font-family="Arial" font-size="13" fill="${GRAY}">${esc(`${phone ? "Phone 390 × 844" : "Desktop 1440 × 900"} · ${frame.stage || "Tested prototype"}`)}</text>`);
  parts.push(`<g id="screen"><rect x="${sx - 1}" y="${sy - 1}" width="${shotW + 2}" height="${shotH + 2}" fill="none" stroke="#9eb9c5"/>`);
  parts.push(`<image x="${sx}" y="${sy}" width="${shotW}" height="${shotH}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${data}"/></g>`);
  // Numbered markers on the screen, matching notes in the side panel.
  const markers = [];
  (frame.notes || []).forEach((n, i) => {
    if (!n.at) return;
    const [mx, my] = [sx + n.at[0], sy + n.at[1]];
    const color = n.kind === "ai" ? CYAN : n.kind === "issue" ? RED : GOLD;
    markers.push(`<g id="marker-${i + 1}"><circle cx="${mx}" cy="${my}" r="15" fill="${color}" stroke="#fff" stroke-width="3"/><text x="${mx}" y="${my + 5}" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#fff">${i + 1}</text></g>`);
  });
  parts.push(`<g id="markers">${markers.join("")}</g>`);
  const px = sx + shotW + pad, pw = side;
  let y = sy;
  const panel = [];
  const meta = [["Flow", frame.flow], ["Persona", frame.persona || "All players"], ["AI state", frame.ai || "No AI call on this screen"]];
  for (const [k, v] of meta) {
    panel.push(`<text x="${px}" y="${y + 12}" font-family="Arial" font-size="11" font-weight="700" letter-spacing="1.5" fill="${GRAY}">${esc(k.toUpperCase())}</text>`);
    const b = textBlock(px, y + 18, pw, v, { size: 15, color: k === "AI state" && frame.ai ? CYAN : NAVY });
    panel.push(b.svg); y += 26 + b.height;
  }
  if (frame.simulated) {
    const b = textBlock(px + 12, y + 10, pw - 24, `Failure simulated for this capture: ${frame.simulated}. The interface is the real one.`, { size: 13, color: GRAY });
    panel.push(`<rect x="${px}" y="${y}" width="${pw}" height="${b.height + 22}" fill="#fff" stroke="#c9d6dc"/>`, b.svg);
    y += b.height + 34;
  }
  panel.push(`<line x1="${px}" x2="${px + pw}" y1="${y}" y2="${y}" stroke="#c9d6dc"/>`); y += 18;
  (frame.notes || []).forEach((n, i) => {
    const color = n.kind === "ai" ? CYAN : n.kind === "issue" ? RED : GOLD;
    panel.push(`<circle cx="${px + 13}" cy="${y + 12}" r="12" fill="${color}"/><text x="${px + 13}" y="${y + 17}" text-anchor="middle" font-family="Arial" font-size="12" font-weight="700" fill="#fff">${i + 1}</text>`);
    const b = textBlock(px + 36, y, pw - 36, n.text, { size: 15 });
    panel.push(b.svg); y += Math.max(26, b.height) + 14;
  });
  if (y > H - pad) console.warn("notes overflow the frame:", frame.id, Math.round(y), H);
  parts.push(`<g id="annotations">${panel.join("")}</g>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
  writeFileSync(new URL(`${frame.id}.svg`, outDir), svg);
  index.push({ id: frame.id, title: frame.title, device: frame.device, flow: frame.flow, file: `frames/${frame.id}.svg`, width: W, height: H });
}
writeFileSync(new URL("index.json", outDir), JSON.stringify(index, null, 2));
console.log(`wrote ${index.length} frames`);
