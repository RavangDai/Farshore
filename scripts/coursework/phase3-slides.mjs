// Builds the Phase 3 midterm deck (10 minutes plus 2 of Q&A) as an editable PowerPoint file.
// Results come only from phase3/slides/results.json, written from the test data workbook after
// the sessions. Without it the results slides show empty placeholders: nothing is estimated.
//
// pptxgenjs is not a project dependency. Install it anywhere and point NODE_PATH at that
// node_modules; APPLY_THEME points at apply_theme.js (writes the palette into the deck theme).
// Usage: node scripts/coursework/phase3-slides.mjs  (run phase3-slide-images.py first)
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");
const PHASE = new URL("../../docs/coursework/docs/assignment/phase3/", import.meta.url);
const file = (p) => fileURLToPath(new URL(p, PHASE));
const results = existsSync(file("slides/results.json")) ? JSON.parse(readFileSync(file("slides/results.json"), "utf8")) : null;
const OUT = file("Farshore-Phase-3-Slides.pptx");

// The game's own design tokens (src/styles/tokens.css) are the deck's palette.
const THEME = {
  name: "Farshore",
  headFontFace: "Georgia",
  bodyFontFace: "Calibri",
  colors: { dk1: "071523", lt1: "F6F0E3", dk2: "0B2033", lt2: "93AFC0", accent1: "E9B85C", accent2: "32D4F5", accent3: "F4604F", accent4: "9FE6B4", accent5: "B18B4E", accent6: "102E44", hlink: "32D4F5", folHlink: "93AFC0" },
};
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.author = "Bibek Pathak";
pres.title = "Farshore: Phase 3 midterm";
const C = pres.SchemeColor;
const NAVY = "071523", LINE_HEX = "2A4A63";
const TEXT = C.background1, MUTED = C.background2, SURFACE = C.text2, GOLD = C.accent1, CYAN = C.accent2, RED = C.accent3, GREEN = C.accent4, INK = C.text1;

pres.defineSlideMaster({
  title: "FS_TITLE",
  background: { color: NAVY },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 2.0, w: 5.9, h: 1.3, fontSize: 60, color: TEXT, valign: "bottom", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 3.4, w: 5.9, h: 1.1, fontSize: 24, color: GOLD, valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "FS_CONTENT",
  background: { color: NAVY },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 34, color: TEXT, valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "Farshore · CMPS 4200 HCI · Phase 3 midterm", options: { x: 0.6, y: 7.0, w: 6, h: 0.3, fontSize: 10, color: MUTED, margin: 0 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: MUTED, align: "right" },
});

const img = (id) => file(`frames/img/${id}.jpg`);
const crop = (name) => file(`slides/img/${name}.png`);
const box = (o) => ({ isTextBox: true, margin: 0, valign: "top", ...o });
// Motif: screenshots sit in a thin gold frame on the surface colour.
function framed(slide, path, x, y, w, h, alt, caption) {
  slide.addShape(pres.shapes.RECTANGLE, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, fill: { color: SURFACE }, line: { color: GOLD, width: 1 }, objectName: `frame ${alt}` });
  slide.addImage({ path, x, y, w, h, altText: alt, objectName: alt });
  if (caption) slide.addText(caption, box({ x, y: y + h + 0.12, w, h: 0.3, fontSize: 11, color: MUTED, italic: true }));
}
// Motif: numbered circles.
function badge(slide, label, x, y, d = 0.5, fill = GOLD, color = INK) {
  slide.addText(String(label), { shape: pres.shapes.OVAL, x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 }, color, fontSize: d >= 0.5 ? 16 : 12, bold: true, align: "center", valign: "middle", margin: 0, objectName: `badge ${label}` });
}
function row(slide, label, title, text, x, y, w, fill = GOLD) {
  badge(slide, label, x, y + 0.02, 0.48, fill);
  slide.addText(title, box({ x: x + 0.68, y, w: w - 0.68, h: 0.36, fontSize: 18, bold: true, color: TEXT }));
  slide.addText(text, box({ x: x + 0.68, y: y + 0.38, w: w - 0.68, h: 0.62, fontSize: 14, color: MUTED }));
}
function card(slide, x, y, w, h, tag, title, text, accent = GOLD) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: SURFACE }, line: { color: LINE_HEX, width: 1 }, objectName: `card ${title}` });
  slide.addText(tag, box({ x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.28, fontSize: 12, bold: true, color: accent, charSpacing: 1 }));
  slide.addText(title, box({ x: x + 0.25, y: y + 0.52, w: w - 0.5, h: 0.42, fontSize: 18, bold: true, color: TEXT }));
  slide.addText(text, box({ x: x + 0.25, y: y + 1.0, w: w - 0.5, h: h - 1.15, fontSize: 14, color: MUTED }));
}
function pending(slide, x, y, w, text) {
  slide.addText(text, { shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.06, x, y, w, h: 0.42, fill: { color: SURFACE }, line: { color: GOLD, width: 1.25 }, color: GOLD, fontSize: 13, bold: true, align: "center", valign: "middle", margin: 0, objectName: "pending badge" });
}
const dash = "—";

// 1. Title -------------------------------------------------------------------
pres.addSection({ title: "Introduction" });
let s = pres.addSlide({ masterName: "FS_TITLE", sectionTitle: "Introduction" });
s.addText("Farshore", { placeholder: "title" });
s.addText("Phase 3: UI design, frontend and usability testing", { placeholder: "body" });
s.addText("Bibek Pathak · CMPS 4200 HCI: AI-Enhanced UI/UX · November 2026", box({ x: 0.7, y: 4.75, w: 5.9, h: 0.35, fontSize: 14, color: MUTED }));
s.addText("Eight trials. One journey home. A mythic rival that a language model plans every round.", box({ x: 0.7, y: 5.4, w: 5.6, h: 0.8, fontSize: 16, italic: true, color: TEXT }));
framed(s, img("D02"), 7.0, 1.5, 5.7, 3.5625, "Farshore title menu", "The title menu of the tested build");
s.addNotes("Hi, I'm Bibek. Farshore is a solo project: an arcade journey home through Homer's Odyssey, where every opponent is planned by a language model. In the next ten minutes: the design system and screens, how the AI feature looks in all five states, how players stay in control of it, the mock AI service I test with, the usability test and its baseline results, and what I fixed. Then a short live demo.");

// 2. What it is ------------------------------------------------------------------
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Introduction" });
s.addText("An arcade Odyssey with an AI rival", { placeholder: "title" });
row(s, 1, "Eight trials, one per episode", "Lotus-Eaters maze, Cyclops' Cave runner, Aeolus' winds, Circe's duel, the Sirens, Scylla, Calypso and Ithaca's bow.", 0.6, 1.75, 5.9);
row(s, 2, "A model plans every rival", "Before each round, Qwen3-4B reads the player's recent attempts and picks the rival's strategy and taunt.", 0.6, 3.15, 5.9, CYAN);
row(s, 3, "The game keeps it fair", "Code owns scoring and collisions. The AI's choice is shown, explained and checked before play.", 0.6, 4.55, 5.9);
framed(s, img("D04"), 7.0, 1.75, 5.7, 3.5625, "Trial selection screen", "Trial selection, with each trial's AI technique");
s.addNotes("Each of the eight trials is its own small arcade game, one per episode of the Odyssey. The AI part: before every round, a local language model, Qwen3-4B, reads how the player did recently and chooses the rival's strategy and opening taunt. It also writes live commentary. The game code still owns scoring and collisions, so the AI decides how the rival plays, never whether you win. That split is what most of my design decisions protect.");

// 3. Design system ---------------------------------------------------------------
pres.addSection({ title: "Design" });
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Design" });
s.addText("Style basics, defined once in code", { placeholder: "title" });
s.addText("Colour", box({ x: 0.6, y: 1.5, w: 5.4, h: 0.4, fontSize: 18, bold: true, color: GOLD }));
const swatches = [["Background", "071523", NAVY], ["Surface", "0B2033", SURFACE], ["Text", "F6F0E3", TEXT], ["Muted text", "93AFC0", MUTED], ["Accent (gold)", "E9B85C", GOLD], ["AI (cyan)", "32D4F5", CYAN], ["Error", "F4604F", RED], ["Success", "9FE6B4", GREEN]];
swatches.forEach(([name, hex, color], i) => {
  const x = 0.6 + (i % 2) * 2.75, y = 2.05 + Math.floor(i / 2) * 0.95;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 0.62, h: 0.62, rectRadius: 0.06, fill: { color }, line: { color: LINE_HEX, width: 1 }, objectName: `swatch ${name}` });
  s.addText([{ text: name, options: { bold: true, color: TEXT, breakLine: true } }, { text: `#${hex}`, options: { color: MUTED } }], box({ x: x + 0.78, y: y + 0.02, w: 1.9, h: 0.62, fontSize: 14 }));
});
s.addText("Five text sizes", box({ x: 6.4, y: 1.5, w: 3.4, h: 0.4, fontSize: 18, bold: true, color: GOLD }));
[["XS · 12 px", 10], ["S · 14 px", 12], ["M · 16 px", 14], ["L · 24 px", 20], ["XL · 40-72 px", 30]].forEach(([label, pt], i) => {
  const y = 2.05 + [0, 0.45, 0.95, 1.5, 2.2][i];
  s.addText([{ text: "Aa  ", options: { fontFace: "Georgia", fontSize: pt, color: TEXT } }, { text: label, options: { fontSize: 13, color: MUTED } }], box({ x: 6.4, y, w: 3.4, h: 0.65, valign: "bottom" }));
});
s.addText("Spacing scale", box({ x: 10.1, y: 1.5, w: 2.6, h: 0.4, fontSize: 18, bold: true, color: GOLD }));
[4, 8, 12, 16, 24, 32, 48].forEach((px, i) => {
  const y = 2.1 + i * 0.42;
  s.addShape(pres.shapes.RECTANGLE, { x: 10.1, y: y + 0.08, w: px * 0.025, h: 0.2, fill: { color: GOLD }, line: { color: GOLD, width: 0 }, objectName: `space ${px}` });
  s.addText(`${px} px`, box({ x: 11.45, y, w: 1.0, h: 0.36, fontSize: 13, color: MUTED, valign: "middle" }));
});
s.addText([{ text: "src/styles/tokens.css", options: { fontFace: "Consolas", color: TEXT } }, { text: " is the only place these values are defined; every stylesheet reads them. Cyan is kept for the AI, so \"the rival is thinking\" never looks like danger.", options: { color: MUTED } }], box({ x: 0.6, y: 6.05, w: 12.1, h: 0.65, fontSize: 14 }));
s.addNotes("Before the screens I fixed the style basics: a navy background, cream text, one accent, gold, for everything you can press, plus error red and success green. Cyan is reserved for the AI only, so the rival thinking never reads as danger. Four font families, five text sizes, and one spacing scale. In code these live in a single tokens file, and every stylesheet reads from it, so the Figma frames and the build use the same values.");

// 4. Screens ---------------------------------------------------------------------
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Design" });
s.addText("Core screens built from the Phase 2 site map", { placeholder: "title" });
[["D02", "Title menu"], ["D07", "Briefing: strategy ready"], ["D14", "Cyclops' Cave with AI Insights"], ["D18", "Settings: AI status and controls"]].forEach(([id, label], i) => {
  const x = 0.66 + (i % 2) * 3.82, y = 1.55 + Math.floor(i / 2) * 2.65;
  framed(s, img(id), x, y, 3.5, 2.1875, label, label);
});
s.addText("29", box({ x: 8.5, y: 1.5, w: 4.2, h: 1.0, fontSize: 60, bold: true, color: GOLD, fontFace: "Georgia" }));
s.addText("annotated frames in the Figma file: 25 desktop, 4 phone", box({ x: 8.5, y: 2.55, w: 4.2, h: 0.65, fontSize: 16, color: TEXT }));
s.addText(["F1 Start", "F2 Choose a trial", "F3 Prepare the rival", "F4 Play", "F5 Understand the rival", "F6 Settings", "F7 Account"].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })), box({ x: 8.5, y: 3.45, w: 4.2, h: 2.9, fontSize: 15, color: MUTED, paraSpaceAfter: 4 }));
s.addNotes("These are four of the core screens, captured from the running game. The build covers every flow from the Phase 2 site map, F1 to F7. The Figma file has 29 annotated frames: real captures with numbered notes, gold for interface decisions and cyan for AI behavior. The briefing, top right, is where the AI feature lives, so the next two slides zoom in on it.");

// 5. Five AI states ------------------------------------------------------------------
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Design" });
s.addText("The rival's strategy in all five states", { placeholder: "title" });
const states = [
  ["1", "Empty", "state-empty", 656 / 444, MUTED, "AI Insights before the rival commits: \"no committed action\"."],
  ["2", "Loading", "state-loading", 968 / 322, CYAN, "Elapsed seconds, no fake progress bar. Measured: 7-12 s."],
  ["3", "Success", "state-success", 968 / 504, GOLD, "The strategy, the model that chose it, and the rival's taunt."],
  ["4", "Low confidence", "state-uncertain", 968 / 564, GOLD, "Failed the game's checks, so it was set aside. Amber, not red."],
  ["5", "Error", "state-error", 968 / 296, RED, "A plain message and one recovery action. Nothing is lost."],
];
const colW = 3.85, gapX = 0.28;
states.forEach(([n, name, pic, ratio, color, text], i) => {
  const x = 0.6 + (i % 3) * (colW + gapX), y0 = i < 3 ? 1.45 : 4.2;
  badge(s, n, x, y0, 0.4, color);
  s.addText(name, box({ x: x + 0.52, y: y0 + 0.03, w: colW - 0.52, h: 0.36, fontSize: 17, bold: true, color: TEXT }));
  const h = Math.min(colW / ratio, 1.35);
  s.addImage({ path: crop(pic), x, y: y0 + 0.5, w: h * ratio, h, altText: `${name} state of the rival panel`, objectName: `state ${name}` });
  s.addText(text, box({ x, y: y0 + 1.95, w: colW, h: 0.55, fontSize: 14, color: MUTED }));
});
card(s, 0.6 + 2 * (colW + gapX), 4.2, colW, 2.4, "HOW THESE WERE MADE", "From the running game", "States 4 and 5 were triggered with the mock AI service. Success shows the live model, qwen3:4b-instruct.");
s.addNotes("The main AI feature is the rival's strategy, designed in all five states. Empty: before the rival has committed to anything, the AI Insights panel says so honestly instead of inventing a reason; the briefing itself skips an empty box and opens straight into loading. Loading: I show elapsed seconds, not a fake progress bar, because model time varies; in my Phase 2 spike it took 7 to 12 seconds. Success names the strategy and who chose it. Low confidence is new: if the model's plan fails the game's checks it is set aside, in amber rather than red, because nothing is broken. Error gives a plain message and one recovery button.");

// 6. User control ----------------------------------------------------------------------
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Design" });
s.addText("Players stay in control of the AI's choice", { placeholder: "title" });
framed(s, crop("control-undo"), 0.66, 1.6, 4.95 * (968 / 776), 4.95, "Rival panel after asking for another strategy, with undo");
row(s, 1, "Regenerate", "\"Ask for another strategy\": the model chooses again.", 7.3, 1.55, 5.4);
row(s, 2, "Undo", "Go back to the previous strategy, even while a new one loads or if it fails.", 7.3, 2.6, 5.4, CYAN);
row(s, 3, "Reject", "The game rejects plans that fail its checks. Commentary and voice can be switched off.", 7.3, 3.65, 5.4);
row(s, 4, "Cancel", "Stop a request that is taking too long.", 7.3, 4.7, 5.4);
row(s, 5, "Edit: not offered", "The strategy is the opponent's move. Changing difficulty asks for a new one.", 7.3, 5.75, 5.4, MUTED);
s.addNotes("Players can act on the AI's result. Ask for another strategy regenerates it. New this phase is undo: after asking again you can go back to the strategy you had, and if the new request is slow, fails or is set aside, Keep the previous strategy is one click away. The game itself rejects plans that fail its checks, and players can switch the commentary off. I deliberately don't let players edit the strategy, because it is the opponent's move; changing difficulty asks for a new one instead.");

// 7. Mock AI service ------------------------------------------------------------------------
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Design" });
s.addText("A mock AI service tests every state on demand", { placeholder: "title" });
const node = (x, y, w, h, title, text, color, name) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: SURFACE }, line: { color, width: 1.5 }, objectName: name });
  s.addText(title, box({ x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.38, fontSize: 17, bold: true, color: TEXT }));
  s.addText(text, box({ x: x + 0.2, y: y + 0.55, w: w - 0.4, h: h - 0.65, fontSize: 14, color: MUTED }));
};
const arrow = (x, y, w, h, name) => s.addShape(pres.shapes.LINE, { x, y, w, h, line: { color: GOLD, width: 2, endArrowType: "triangle" }, objectName: name });
node(0.6, 2.55, 2.9, 1.5, "Game interface", "Briefing, rival panel, live commentary", GOLD, "node game");
node(4.2, 2.55, 3.1, 1.5, "model-api.ts", "One module for every AI call", GOLD, "node model-api");
node(8.1, 1.45, 4.6, 1.95, "mock-ai.ts (test mode)", "success 1.5 s · slow 12 s · uncertain · error · offline. \"-once\" modes fail once, then recover.", CYAN, "node mock");
node(8.1, 3.75, 4.6, 1.5, "Live model", "Qwen3-4B through Ollama, or a hosted provider for signed-in players", GOLD, "node live");
arrow(3.5, 3.3, 0.7, 0, "arrow game to api");
arrow(7.3, 3.0, 0.8, -0.55, "arrow api to mock");
arrow(7.3, 3.6, 0.8, 0.85, "arrow api to live");
s.addText([{ text: "Switch from a second tab: ", options: { color: MUTED } }, { text: "localhost:3000/api/ai-mock?mode=error-once", options: { color: TEXT, fontFace: "Consolas" } }], box({ x: 0.6, y: 5.6, w: 12.1, h: 0.4, fontSize: 15 }));
s.addText("Slow mode is 12 s, just above the slowest measured response (11.6 s). Task 4 of the test uses error-once to cause an AI failure without warning.", box({ x: 0.6, y: 6.05, w: 12.1, h: 0.65, fontSize: 15, color: MUTED }));
s.addNotes("Every AI call goes through one module. It asks the mock service first: in test mode the mock answers with success, a slow response, an uncertain plan, an error or offline, and the model is never called. I switch modes from a second browser tab, which is how Task 4 of my test leads people into an AI error without warning. My live model is already connected, so in Phase 4 the mock stays as the test fixture for these states rather than being replaced.");

// 8. Changes from Phase 2 ----------------------------------------------------------------------
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Design" });
s.addText("What changed since the Phase 2 wireframes", { placeholder: "title" });
const changes = [
  ["A1", "Five trials became eight", "Follows the Odyssey's route, with one game per episode."],
  ["A5", "Explainable AI Insights", "Players see why the rival acted, and that it cannot attack unfairly."],
  ["A7", "Full-screen play stage", "The small embedded canvas competed with the page around it."],
  ["A2", "The AI rival is required", "The opponent is the core experience; a clear offline state replaces the toggle."],
  ["A15-A16", "Low confidence and undo", "A doubtful plan no longer looks like an outage, and asking again can be undone."],
  ["A14, A17", "Mock service and tokens", "Every AI state can be tested on demand; style values are defined once."],
];
changes.forEach(([tag, title, text], i) => card(s, 0.6 + (i % 3) * 4.1, 1.55 + Math.floor(i / 3) * 2.6, 3.85, 2.35, tag, title, text, i >= 4 ? CYAN : GOLD));
s.addNotes("Since the Phase 2 wireframes: five trials became eight, following the Odyssey's route. To answer the Phase 2 trust question, the AI Insights panel shows why the rival acted. The small canvas became a full-screen stage. The AI rival became required, with a clear offline state. And for this phase I added the low-confidence state, undo, the mock service and the design tokens. The full list, with reasons, is in the PDF.");

// 9. Test method ---------------------------------------------------------------------------------
pres.addSection({ title: "Testing" });
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Testing" });
s.addText("Usability test: four tasks, one script for everyone", { placeholder: "title" });
const tasks = [
  ["T1", "Start your journey", "F1", "Reach the first trial's briefing"],
  ["T2", "Know your opponent", "F2", "Explain the strategy, and that the AI chose it"],
  ["T3", "Read the rival's mind", "F3", "Cite a reason from AI Insights while playing"],
  ["T4", "AI failure", "F4", "Recover from an AI error without help"],
];
tasks.forEach(([id, title, flow, goal], i) => {
  const x = 0.6 + i * 3.08, accent = i === 3 ? RED : GOLD;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.55, w: 2.85, h: 2.6, rectRadius: 0.08, fill: { color: SURFACE }, line: { color: i === 3 ? RED : LINE_HEX, width: i === 3 ? 1.5 : 1 }, objectName: `task ${id}` });
  s.addText(id, box({ x: x + 0.25, y: 1.75, w: 1.2, h: 0.6, fontSize: 30, bold: true, color: accent, fontFace: "Georgia" }));
  s.addText(`from ${flow}`, box({ x: x + 1.45, y: 1.9, w: 1.2, h: 0.3, fontSize: 12, color: MUTED, align: "right" }));
  s.addText(title, box({ x: x + 0.25, y: 2.45, w: 2.35, h: 0.4, fontSize: 17, bold: true, color: TEXT }));
  s.addText(goal, box({ x: x + 0.25, y: 2.9, w: 2.35, h: 0.85, fontSize: 14, color: MUTED }));
  if (i === 3) s.addText("Mock error, no warning", box({ x: x + 0.25, y: 3.8, w: 2.35, h: 0.3, fontSize: 12, bold: true, color: RED }));
});
s.addText("Measures", box({ x: 0.6, y: 4.6, w: 3, h: 0.4, fontSize: 18, bold: true, color: GOLD }));
["Success: Yes / Partly / No / Gave up", "Time on task", "Ease 1-5", "SUS, 10 items", "AI trust 1-5, with why"].forEach((t, i) => {
  const widths = [3.5, 1.7, 1.35, 1.75, 2.75], x = 0.6 + widths.slice(0, i).reduce((a, b) => a + b + 0.2, 0);
  s.addText(t, { shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.2, x, y: 5.1, w: widths[i], h: 0.5, fill: { color: SURFACE }, line: { color: LINE_HEX, width: 1 }, color: TEXT, fontSize: 14, align: "center", valign: "middle", margin: 0, objectName: `measure ${i + 1}` });
});
s.addText("5-6 adults new to Farshore · think aloud · consent read first, no recording without permission · about 20 minutes · the same script in Phase 5", box({ x: 0.6, y: 5.95, w: 12.1, h: 0.65, fontSize: 15, color: MUTED }));
s.addNotes("I tested with the instructor's script template, filled in, and the same script for every participant. Four tasks from my primary flows: start the journey, find out what the opponent plans and who decided it, explain one of the Cyclops' moves using AI Insights, and Task 4, where the mock service makes the AI fail without warning and I watch whether people notice and recover. I recorded success, time, a 1-to-5 ease rating, SUS after the session, and an AI trust rating with the reason. Phase 5 repeats exactly this.");

// 10. Results ------------------------------------------------------------------------------------
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Testing" });
s.addText("Baseline results", { placeholder: "title" });
const r = results || {};
const cell = (t, o = {}) => ({ text: t, options: { color: TEXT, fill: { color: SURFACE }, ...o } });
const head = (t) => ({ text: t, options: { bold: true, color: INK, fill: { color: GOLD } } });
const pct = (v) => v == null ? dash : `${Math.round(v * 100)}%`;
const rows = [[head("Task"), head("Success (Yes)"), head("Median time"), head("Mean ease (1-5)")]];
tasks.forEach(([id, title]) => {
  const t = r.tasks?.[id] || {};
  rows.push([cell(`${id} ${title}`), cell(pct(t.success)), cell(t.median == null ? dash : `${Math.round(t.median)} s`), cell(id === "T4" ? "not asked" : t.ease == null ? dash : t.ease.toFixed(1))]);
});
s.addTable(rows, { x: 0.6, y: 1.6, w: 7.4, colW: [3.0, 1.5, 1.4, 1.5], rowH: 0.62, fontSize: 15, valign: "middle", border: { type: "solid", pt: 1, color: LINE_HEX }, objectName: "results by task" });
const stat = (x, y, value, label, note) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 4.3, h: 1.55, rectRadius: 0.08, fill: { color: SURFACE }, line: { color: LINE_HEX, width: 1 }, objectName: `stat ${label}` });
  s.addText(value, box({ x: x + 0.25, y: y + 0.12, w: 1.9, h: 1.0, fontSize: 48, bold: true, color: GOLD, fontFace: "Georgia", valign: "middle" }));
  s.addText([{ text: label, options: { bold: true, color: TEXT, breakLine: true } }, { text: note, options: { color: MUTED } }], box({ x: x + 2.15, y: y + 0.3, w: 2.0, h: 1.0, fontSize: 14 }));
};
stat(8.4, 1.6, r.sus == null ? dash : r.sus.toFixed(1), "SUS mean", "out of 100; the average is 68");
stat(8.4, 3.35, r.trust == null ? dash : r.trust.toFixed(1), "AI trust", "mean rating, 1-5");
s.addText(`Participants: ${r.n ?? dash}${r.t4 ? ` · Task 4: ${r.t4}` : ""}`, box({ x: 0.6, y: 4.95, w: 7.4, h: 0.4, fontSize: 15, color: TEXT }));
if (!results) pending(s, 0.6, 5.55, 7.4, "To fill after the sessions, from the workbook's Summary sheet");
s.addText("This is the baseline that Phase 5 repeats with the same tasks and measures.", box({ x: 8.4, y: 5.15, w: 4.3, h: 0.7, fontSize: 14, italic: true, color: MUTED }));
s.addNotes(results ? "Read the success rates, median times and SUS from the slide, then the AI trust rating and the most common reason participants gave for it." : "PLACEHOLDER until the sessions are done. These numbers come only from Farshore-Phase-3-Test-Data.xlsx (Summary sheet). Say how many people took part, the success rate and median time for each task, the SUS mean against the average of 68, the AI trust mean and the most common reason for it, and how many recovered in Task 4 without help.");

// 11. Issues and fixes -----------------------------------------------------------------------------
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Testing" });
s.addText("Top issues and what I fixed", { placeholder: "title" });
const issues = r.issues?.length ? r.issues : [{}, {}, {}];
const issueRows = [[head("Issue"), head("Severity (0-4)"), head("Seen in"), head("Fix")]];
issues.slice(0, 4).forEach((it) => issueRows.push([cell(it.issue ?? dash), cell(it.severity == null ? dash : String(it.severity)), cell(it.seen ?? dash), cell(it.fix ?? dash)]));
s.addTable(issueRows, { x: 0.6, y: 1.6, w: 7.6, colW: [3.0, 1.4, 1.2, 2.0], rowH: 0.62, fontSize: 14, valign: "middle", border: { type: "solid", pt: 1, color: LINE_HEX }, objectName: "issues table" });
if (!results) pending(s, 0.6, 4.4, 7.6, "To fill after the sessions, with before and after screens");
s.addText("Severity: 0 = not a problem, 4 = usability catastrophe. The worst issues are fixed before the midterm, and the rest are listed for Phase 4.", box({ x: 0.6, y: 5.05, w: 7.6, h: 0.9, fontSize: 14, color: MUTED }));
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.6, y: 1.6, w: 4.1, h: 3.75, rectRadius: 0.08, fill: { color: SURFACE }, line: { color: LINE_HEX, width: 1 }, objectName: "pilot panel" });
s.addText("Pilot watch list", box({ x: 8.85, y: 1.8, w: 3.6, h: 0.4, fontSize: 18, bold: true, color: GOLD }));
s.addText("From an automated walkthrough before the sessions. Not participant data.", box({ x: 8.85, y: 2.25, w: 3.6, h: 0.65, fontSize: 12, italic: true, color: MUTED }));
s.addText([
  "The start button is below the fold at 1440 × 900",
  "The Lotus maze ignores the model's strategy (fix planned after testing)",
  "Cancel preparation starts again at once",
].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })), box({ x: 8.85, y: 3.0, w: 3.6, h: 2.2, fontSize: 14, color: TEXT, paraSpaceAfter: 8 }));
s.addNotes(results ? "Walk through each issue: what participants did, its severity, and the fix, with the before and after screens." : "PLACEHOLDER until the sessions are done. Fill the table from the workbook's Issues sheet, and show before and after screens for each fix. The right-hand list is from my automated pilot walkthrough, not from participants: say so, and say which of these participants actually ran into.");

// 12. Next and demo ----------------------------------------------------------------------------------
pres.addSection({ title: "Next" });
s = pres.addSlide({ masterName: "FS_CONTENT", sectionTitle: "Next" });
s.addText("Next: Phase 4, then a short demo", { placeholder: "title" });
s.addText("Phase 4 plan", box({ x: 0.6, y: 1.5, w: 5.6, h: 0.4, fontSize: 18, bold: true, color: GOLD }));
s.addText([
  "Fix the remaining issues from testing",
  "Move the last off-scale styles onto the tokens",
  "Phone: show AI Insights beside the play area",
  "Keep the mock as the test fixture for every AI state",
  "Phase 5: repeat the same tasks and measures",
].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })), box({ x: 0.6, y: 2.05, w: 5.6, h: 3.4, fontSize: 16, color: TEXT, paraSpaceAfter: 10 }));
s.addText("Live demo, about 2 minutes", box({ x: 7.0, y: 1.5, w: 5.7, h: 0.4, fontSize: 18, bold: true, color: GOLD }));
["New game, then the first briefing", "The rival panel: strategy and who chose it", "Ask for another strategy, then Undo", "Mock error, then Prepare the rival again", "Cyclops' Cave with AI Insights"].forEach((t, i) => {
  badge(s, i + 1, 7.0, 2.05 + i * 0.68, 0.42, i === 3 ? RED : GOLD);
  s.addText(t, box({ x: 7.6, y: 2.08 + i * 0.68, w: 5.1, h: 0.4, fontSize: 16, color: TEXT, valign: "middle" }));
});
s.addText("If the live demo fails: the recorded demo video", box({ x: 7.0, y: 5.6, w: 5.7, h: 0.4, fontSize: 14, italic: true, color: MUTED }));
s.addText("Questions?", box({ x: 0.6, y: 5.75, w: 5.6, h: 0.75, fontSize: 32, color: TEXT, fontFace: "Georgia" }));
s.addNotes("For Phase 4: fix the remaining issues, finish moving the older styles onto the tokens, and put AI Insights beside the play area on phones. Phase 5 repeats the same test so I can show the improvement. Now a quick demo: start a new game and open the briefing, read the rival's strategy, ask for another and undo it, trigger the mock error and recover, and finish in the Cyclops' Cave with AI Insights. If anything fails, I have a recorded video. Thank you, happy to take questions.");

await pres.writeFile({ fileName: OUT });
if (process.env.APPLY_THEME) {
  const { applyTheme } = require(process.env.APPLY_THEME);
  await applyTheme(OUT, THEME);
}
console.log(`wrote ${OUT} (12 slides, results ${results ? "included" : "pending"})`);
