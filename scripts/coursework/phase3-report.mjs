// Assembles the Phase 3 submission document as HTML (print it with phase3-pdf.mjs).
// Sources: phase3/*.md, phase3/kit/test-script.md, phase3/frames/index.json,
// phase3/links.json and, once sessions are done, phase3/results/results.json.
// No dependencies; the Markdown subset used by these files is converted here.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const PHASE = new URL("../../docs/coursework/docs/assignment/phase3/", import.meta.url);
const read = (p) => readFileSync(new URL(p, PHASE), "utf8").replace(/\r\n/g, "\n");
const json = (p, fallback) => existsSync(new URL(p, PHASE)) ? JSON.parse(read(p)) : fallback;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function inline(t) {
  return esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}
// Markdown subset: headings, paragraphs, lists (one nesting level), tables, blockquotes.
function md(src, { shift = 0, drop = [] } = {}) {
  const lines = src.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(6, h[1].length + shift);
      if (!drop.includes(h[1].length)) out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++; continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i++; }
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (line.startsWith(">")) {
      const block = [];
      while (i < lines.length && lines[i].startsWith(">")) { block.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${md(block.join("\n"))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const indent = lines[i].match(/^\s*/)[0].length;
        const text = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        if (indent >= 2 && items.length) (items.at(-1).sub ||= []).push(text);
        else items.push({ text });
        i++;
        while (i < lines.length && lines[i].trim() && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) && !lines[i].startsWith("#") && !lines[i].startsWith("|")) {
          items.at(-1).text += " " + lines[i].trim(); i++;
        }
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it.text)}${it.sub ? `<ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${tag}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||>|\s*([-*]|\d+\.)\s)/.test(lines[i])) { para.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

const links = json("links.json", { figma: "", repository: "" });
const frames = json("frames/index.json", []);
const results = json("results/results.json", null);
const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const link = (url, label) => url ? `<a href="${esc(url)}">${esc(url)}</a>` : `<span class="todo">${label} (to be added)</span>`;

// The printed frames use the annotation spec directly: screenshot with numbered markers,
// notes as readable text. The SVG frames (frames/*.svg) carry the same notes for Figma.
const spec = json("editable/frames.json", { frames: [] }).frames.filter((f) => frames.some((x) => x.id === f.id));
const desktop = spec.filter((f) => f.device === "desktop");
const phone = spec.filter((f) => f.device === "phone");
const kindClass = (n) => n.kind === "ai" ? "ai" : n.kind === "issue" ? "issue" : "ui";
const frameFigure = (f) => {
  const w = f.device === "phone" ? 390 : 1440, h = f.device === "phone" ? 844 : 900;
  const markers = (f.notes || []).map((n, i) => n.at ? `<i class="mk ${kindClass(n)}" style="left:${(n.at[0] / w * 100).toFixed(2)}%;top:${(n.at[1] / h * 100).toFixed(2)}%">${i + 1}</i>` : "").join("");
  const notes = (f.notes || []).map((n, i) => `<li class="${kindClass(n)}"><b>${i + 1}</b>${inline(n.text)}</li>`).join("");
  return `<figure class="frame ${f.device}">
  <figcaption><span class="fid">${esc(f.id)}</span> <strong>${esc(f.title)}</strong> <span class="flow">${esc(f.flow)} · ${esc(f.persona || "All players")}</span></figcaption>
  <div class="shot"><img src="frames/img/${esc(f.id)}.jpg" alt="${esc(f.title)}">${markers}</div>
  <div class="meta">${f.ai ? `<p class="ai-state"><b>AI state:</b> ${inline(f.ai)}</p>` : ""}${f.simulated ? `<p class="sim">Failure simulated for this capture (${inline(f.simulated)}); the interface is real.</p>` : ""}<ol class="notes">${notes}</ol></div>
</figure>`;
};

// Style basics are read from the design tokens in code, so this document and the app use the same values.
const tokensCss = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");
const token = (name) => tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim() ?? "";
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return ((hi + 0.05) / (lo + 0.05)).toFixed(1); };
const colourRows = [
  ["Background", "fs-color-bg", "Page and stage background"],
  ["Surface", "fs-color-surface", "Panels and cards"],
  ["Text", "fs-color-text", "Primary text"],
  ["Muted text", "fs-color-text-muted", "Secondary lines and status text"],
  ["Accent", "fs-color-accent", "The one accent: buttons, focus, interactive chrome"],
  ["AI", "fs-color-ai", "Only for AI state and AI data, never for hazards"],
  ["Error", "fs-color-error", "Errors and real threats"],
  ["Success", "fs-color-success", "Confirmation and successful escapes"],
];
const bg = token("fs-color-bg");
const swatches = colourRows.map(([label, name, use]) => {
  const value = token(name);
  const ratio = ["fs-color-bg", "fs-color-surface"].includes(name) ? "" : ` · ${contrast(value, bg)}:1 on background`;
  return `<div class="swatch"><i style="background:${esc(value)}"></i><div><b>${esc(label)}</b> <code>--${esc(name)}</code><br><span>${esc(value)}${ratio}</span><br><small>${esc(use)}</small></div></div>`;
}).join("");
const sizeRows = [["XS", "fs-text-xs", "Captions, status lines, labels"], ["S", "fs-text-sm", "Body text and buttons"], ["M", "fs-text-md", "Panel titles, quotes, lead text"], ["L", "fs-text-lg", "Section headings"], ["XL", "fs-text-xl", "Screen titles (scales with the window)"]];
const sizeSample = (name) => name === "fs-text-xl" ? "40px" : token(name);
const typeScale = sizeRows.map(([label, name, use]) => `<tr><td><b>${label}</b><br><code>--${name}</code></td><td>${esc(token(name))}</td><td><span class="specimen" style="font-size:${esc(sizeSample(name))}">The rival is studying you</span></td><td>${esc(use)}</td></tr>`).join("");
const families = [["Display", "fs-font-display", "Story, headings, the rival panel"], ["UI", "fs-font-ui", "Small interface details"], ["Pixel", "fs-font-pixel", "Arcade labels and eyebrows"], ["Mono", "fs-font-mono", "Inside the AI inspector only"]];
const familyRows = families.map(([label, name, use]) => `<tr><td><b>${label}</b><br><code>--${name}</code></td><td>${esc(token(name))}</td><td><span class="specimen" style="font-family:${esc(token(name))};font-size:${name === "fs-font-pixel" ? "11px" : "16px"}">Eight Trials. One Journey Home.</span></td><td>${esc(use)}</td></tr>`).join("");
const spaceRows = [1, 2, 3, 4, 5, 6, 7].map((n) => { const v = token(`fs-space-${n}`); return `<div class="space"><code>--fs-space-${n}</code><i style="width:${esc(v)}"></i><span>${esc(v)}</span></div>`; }).join("");
const styleBasics = `
<h3>1.1 Style basics (design system)</h3>
<p>Decided before the screens and reused on every one. The values below are read from <code>src/styles/tokens.css</code>, the single file where the app defines its colours, type and spacing, when this document is built. Every stylesheet reads these variables.</p>
<h4>Colour palette</h4>
<div class="swatches">${swatches}</div>
<p class="note">One accent, gold, for everything a player can press. Cyan is reserved for the AI, so "the rival is thinking" is never confused with "you are in danger" (red). Contrast ratios use the WCAG formula against the background. A few extra navy, gold and bronze tints are used only for depth and highlights.</p>
<h4>Type: four families, five sizes</h4>
<table class="tokens"><thead><tr><th>Family</th><th>Stack</th><th>Specimen</th><th>Use</th></tr></thead><tbody>${familyRows}</tbody></table>
<table class="tokens"><thead><tr><th>Size</th><th>Value</th><th>Specimen</th><th>Use</th></tr></thead><tbody>${typeScale}</tbody></table>
<h4>Spacing scale</h4>
<div class="spaces">${spaceRows}</div>
<p class="note">In code: <code>tokens.css</code> defines the values, and the older colour names in <code>farshore-stage.css</code> are aliases of them. The AI rival panel, in all five states, uses only tokens. In the older stylesheets, every value equal to a token was replaced with that token. Off-scale values remain in in-game HUD labels and some menu rules, and are listed for Phase 4 (<code>docs/UI_DESIGN.md</code>).</p>`;

const aiStates = `
<h3>1.2 AI components: five states and user control</h3>
<p>The main AI feature is the rival's strategy. Before each round, the model reads the player's recent attempts and chooses how the mythic rival will play. It appears in the briefing's rival panel (flow F3) and is designed in all five states. The explainable AI Insights panel in Cyclops' Cave has its own empty state (D23).</p>
<table><thead><tr><th>State</th><th>What the player sees</th><th>Frames</th></tr></thead><tbody>
<tr><td><b>1. Empty / initial</b></td><td>The briefing opens before any strategy exists. Preparation starts at once, so the panel opens in the loading design at 0 s rather than as an empty box. With no model connected, the initial state is "No AI rival connected", with three ways to connect and Check again. In Cyclops' Cave, AI Insights reads "Observing. No committed action." until the rival's first decision.</td><td>D06, D10, D23</td></tr>
<tr><td><b>2. Loading</b></td><td>"[Rival] is studying you", an elapsed-seconds counter and a cyan scanning bar, which does not pretend to know the remaining time. Matched to measured latency: the Phase 2 spike measured 7.3-11.6 s (mean 8.3 s) per strategy, and a CPU laptop with Qwen3-4B takes about 15 s. The mock's slow mode (12 s) tests this. Cancel, or Keep the previous strategy if there is one.</td><td>D06, D25</td></tr>
<tr><td><b>3. Success</b></td><td>The strategy name, "Strategy chosen by [model]", a plain description, the rival's taunt (with Hear it), and Ask for another strategy. Start is enabled.</td><td>D07, D13</td></tr>
<tr><td><b>4. Low confidence</b></td><td>"The rival's plan was set aside". The model's strategy did not pass the game's checks, so it was not used and nothing changed. The main action is Ask for another strategy. Keep the previous strategy appears if one exists. Amber, not red: nothing is broken.</td><td>D22</td></tr>
<tr><td><b>5. Error, with recovery</b></td><td>"The rival is not ready", with a plain message and no codes. One clear action, Prepare the rival again, plus "Nothing about your voyage changes". Keep the previous strategy appears if one exists. Task 4 of the test leads participants here.</td><td>D09</td></tr>
</tbody></table>
<h4>User control over AI results</h4>
<table><thead><tr><th>Control</th><th>How it works</th><th>Frames</th></tr></thead><tbody>
<tr><td><b>Regenerate</b></td><td>"Ask for another strategy" on a ready strategy, and as the main action in the low-confidence state. The model chooses again.</td><td>D07, D24</td></tr>
<tr><td><b>Undo</b></td><td>After asking again, "Undo: back to [previous strategy]" restores it, and pressing Undo again swaps back. While a new strategy is loading, or if it fails or is set aside, "Keep the previous strategy" returns to the old one.</td><td>D24, D25, D22</td></tr>
<tr><td><b>Reject</b></td><td>The game rejects a strategy that fails its checks before it can be used (low-confidence state). Players can reject the AI commentary by switching commentary or voice off in Settings, or with the Voice button on the menu.</td><td>D22, D18</td></tr>
<tr><td><b>Cancel</b></td><td>"Cancel preparation" stops a request in progress. The pilot found that the briefing then starts a new request at once. This is noted for the sessions.</td><td>D06</td></tr>
<tr><td><b>Edit</b></td><td>Not offered by design: the strategy is the opponent's move. Changing the difficulty asks the model for a new strategy at the new level.</td><td>D08</td></tr>
</tbody></table>
<h4>Mock AI service</h4>
<p>All AI calls (rival status, strategy and live commentary) go through one module, <code>server/lib/model-api.ts</code>. It asks <code>server/lib/mock-ai.ts</code> first. The mock answers in the modes success, slow, uncertain, error and offline, plus "-once" modes that fail once and then recover. A moderator switches modes from a second browser tab at <code>/api/ai-mock?mode=...</code>, or for the whole server with <code>FARSHORE_AI_MOCK</code>. Farshore's live model is already connected (change A2), so in Phase 4 the mock stays as the test fixture for these states instead of being replaced. Frames marked "mock" were captured in the real interface with the mock answering, and name the model as "mock-ai (test mode)".</p>`;

const pending = (what) => `<div class="pending"><strong>Pending real session data.</strong> ${what} This section is generated from <code>Farshore-Phase-3-Test-Data.xlsx</code> after the usability sessions. No results are estimated.</div>`;

const reportBody = results ? results.html : `
<h3>3.1 Method</h3>
<p>Moderated, in-person think-aloud sessions with five or six adults who had not seen Farshore, run by the author with the script in Section 2 (the instructor's template, filled in). Each session took about 20 minutes and had four tasks (T1-T4), on a Windows laptop running the prototype locally. Tasks 1-3 used Qwen3-4B-Instruct through Ollama. Task 4 used the mock AI service to trigger an AI error without warning. Measures, as on the template: completion (Yes / Partly / No / Gave up), time on task, errors or wrong turns, ease from 1 to 5 after Tasks 1-3, and for Task 4 whether the participant noticed the failure and recovered without help. After all tasks: the System Usability Scale, and the template's five AI trust and perception questions (trust in the results, 1-5, with the reason).</p>
<p>Analysis: success rate per task (Yes only, and including Partly), median time on task, mean ease, SUS scored by the standard method and compared with the 68 average, mean AI trust, and an issue list rated on the 0-4 severity scale (0 = not a problem, 4 = usability catastrophe). All calculations are live formulas in the raw data workbook. These results are the baseline that Phase 5 repeats.</p>
<h3>3.2 Participants</h3>${pending("Participant count and background (age range, gaming frequency, AI chatbot use, familiarity with the Odyssey).")}
<h3>3.3 Task results</h3>${pending("Completion, time, errors, assists and SEQ for each task.")}
<h3>3.4 SUS and AI trust</h3>${pending("SUS per participant and overall, and AI trust item means.")}
<h3>3.5 Findings</h3>${pending("Issues with severity, frequency and participant quotes.")}
<h3>3.6 Pilot walkthrough</h3>
<p>Before the sessions, the task path was checked in an automated browser to confirm that every task can be completed and the script matches the interface. These are not participant results.</p>
${md(read("kit/pilot-notes.md"), { shift: 2, drop: [1] })}`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Farshore Phase 3 Submission</title>
<style>
@page { size: Letter; margin: 0.6in 0.65in 0.7in; }
:root { --navy: #102e40; --teal: #126978; --gold: #a9884b; --gray: #526875; --line: #c9d6dc; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.45 Arial, sans-serif; color: var(--navy); background: #fff; }
h1, h2 { font-family: Georgia, serif; font-weight: 400; }
h1 { font-size: 30pt; margin: 0 0 6pt; }
h2 { font-size: 20pt; margin: 0 0 10pt; padding-bottom: 6pt; border-bottom: 2px solid var(--gold); break-before: page; }
h3 { font-size: 13pt; margin: 16pt 0 6pt; color: var(--teal); break-after: avoid; }
h4, h5, h6 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; }
p { margin: 0 0 7pt; }
a { color: var(--teal); }
code { font: 9pt Consolas, monospace; background: #eef3f5; padding: 0 3px; border-radius: 2px; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 9pt; break-inside: auto; }
th { background: var(--navy); color: #fff; text-align: left; font-weight: 700; }
th, td { border: 1px solid var(--line); padding: 4pt 5pt; vertical-align: top; }
tr { break-inside: avoid; }
blockquote { margin: 6pt 0; padding: 6pt 10pt; border-left: 3px solid var(--gold); background: #faf7f0; }
ul, ol { margin: 0 0 7pt; padding-left: 18pt; }
li { margin-bottom: 2pt; }
.cover { height: 9.4in; display: flex; flex-direction: column; justify-content: space-between; }
.cover .eyebrow { font: 700 9pt Arial; letter-spacing: 2pt; color: var(--teal); text-transform: uppercase; }
.cover .sub { font: 14pt Georgia, serif; color: var(--gray); margin-bottom: 26pt; }
.cover dl { display: grid; grid-template-columns: 1.4in 1fr; gap: 6pt 12pt; margin: 0; }
.cover dt { font-weight: 700; } .cover dd { margin: 0; }
.cover .contents { border-top: 1px solid var(--line); padding-top: 12pt; }
.cover .contents ol { columns: 2; }
.todo { color: #b3261e; font-weight: 700; }
.pending { border: 1px dashed #b3261e; background: #fdf3f2; padding: 8pt 10pt; margin: 6pt 0 10pt; }
figure.frame { margin: 0 0 16pt; break-inside: avoid; }
figure.frame figcaption { margin-bottom: 4pt; font-size: 11pt; }
figure.frame .fid { font: 700 8.5pt Arial; letter-spacing: 1pt; color: #fff; background: var(--teal); padding: 1pt 4pt; border-radius: 2px; }
figure.frame .flow { display: block; font-size: 8.5pt; color: var(--gray); }
figure.frame .shot { position: relative; }
figure.frame .shot img { width: 100%; display: block; border: 1px solid var(--line); }
.mk { position: absolute; width: 17pt; height: 17pt; margin: -8.5pt 0 0 -8.5pt; border-radius: 50%; border: 1.5pt solid #fff; color: #fff; font: 700 8.5pt/14pt Arial; font-style: normal; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.5); }
.mk.ui, .notes li.ui b { background: var(--gold); } .mk.ai, .notes li.ai b { background: #0e8fae; } .mk.issue, .notes li.issue b { background: #b3261e; }
figure.frame .meta { margin-top: 5pt; font-size: 9pt; }
figure.frame .meta p { margin: 0 0 3pt; } .ai-state { color: #0b6f88; } .sim { color: var(--gray); font-style: italic; }
.notes { list-style: none; padding: 0; margin: 4pt 0 0; columns: 2; column-gap: 14pt; }
.notes li { break-inside: avoid; display: flex; gap: 5pt; margin-bottom: 4pt; }
.notes li b { flex: 0 0 13pt; height: 13pt; border-radius: 50%; color: #fff; font-size: 7.5pt; line-height: 13pt; text-align: center; }
figure.frame.desktop { break-before: auto; }
figure.frame.phone { display: grid; grid-template-columns: 1.95in 1fr; gap: 0 12pt; align-items: start; }
figure.frame.phone figcaption { grid-column: 1 / -1; }
figure.frame.phone .notes { columns: 1; }
.note { color: var(--gray); font-size: 9pt; }
@font-face { font-family: Pixel; src: url("../../../../../public/fonts/press-start-2p.ttf") format("truetype"); }
.swatches { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt 14pt; margin: 4pt 0 8pt; break-inside: avoid; }
.swatch { display: flex; gap: 7pt; align-items: flex-start; font-size: 9pt; line-height: 1.35; }
.swatch i { flex: 0 0 34pt; height: 34pt; border: 1px solid var(--line); border-radius: 3px; }
.swatch span { color: var(--gray); } .swatch small { color: var(--gray); }
.specimen { color: #f6f0e3; background: #071523; padding: 1pt 5pt; border-radius: 2px; white-space: nowrap; line-height: 1.3; }
.spaces { display: grid; gap: 3pt; margin: 4pt 0 8pt; }
.space { display: grid; grid-template-columns: 1.1in auto 1fr; align-items: center; gap: 8pt; font-size: 9pt; }
.tokens td:first-child { width: 1.45in; } .tokens code { white-space: nowrap; }
.space i { display: block; height: 10pt; background: #e9b85c; }
</style></head><body>

<section class="cover">
  <div>
    <div class="eyebrow">CMPS 4200 HCI: AI-Enhanced UI/UX · Phase 3</div>
    <h1>Farshore</h1>
    <div class="sub">Usability testing and iteration of an AI-rival arcade journey through Homer's <em>Odyssey</em></div>
    <dl>
      <dt>Student</dt><dd>Bibek Pathak (solo project)</dd>
      <dt>Date</dt><dd>${esc(today)}</dd>
      <dt>Figma file</dt><dd>${link(links.figma, "Figma view link")}</dd>
      <dt>Repository</dt><dd>${link(links.repository, "GitHub repository link")}</dd>
      <dt>Raw data</dt><dd><code>Farshore-Phase-3-Test-Data.xlsx</code> (submitted separately)</dd>
      <dt>AI in the product</dt><dd>Qwen3-4B-Instruct plans each rival and writes live commentary; Kokoro-82M speaks it</dd>
    </dl>
  </div>
  <div class="contents">
    <strong>Contents</strong>
    <ol><li>Screen designs: style basics, AI states and user control, screens</li><li>Test script</li><li>Test report</li><li>List of changes</li><li>AI tool use statement</li><li>Team contribution statement</li></ol>
  </div>
</section>

<h2>1. Screen designs</h2>
<p>High-fidelity screens of the tested prototype, captured from the running game and annotated. The same frames are in the Figma file (${links.figma ? `<a href="${esc(links.figma)}">view link</a>` : `<span class="todo">link to be added</span>`}). Numbered markers match the notes beside each screen: gold = interface, cyan = AI behavior or AI state. Failure states were produced with the mock AI service (Section 1.2), and the interface shown is the real one.</p>
<p class="note">Flows: F1 Start, F2 Choose a trial, F3 Prepare the rival (the AI planning states), F4 Play, F5 Understand the rival (explainable AI), F6 Settings, F7 Account. Personas are the Phase 1 sketches: Maya (gamer, fairness), Daniel (reader, limited technical comfort), Rosa (AI skeptic). What changed from the Phase 2 wireframes, and why, is in Section 4, Part A.</p>
${styleBasics}
${aiStates}
<h3>1.3 Desktop screens (1440 × 900)</h3>
${desktop.map(frameFigure).join("\n")}
${phone.length ? `<h3>1.4 Phone screens (390 × 844)</h3>${phone.map(frameFigure).join("\n")}` : ""}

<h2>2. Test script</h2>
${md(read("kit/test-script.md"), { shift: 1, drop: [1] })}
<p class="note">Materials used with this script: task cards, the SUS and AI trust questionnaire, the observer sheet and the session logger (<code>phase3/kit/</code>).</p>

<h2>3. Test report</h2>
${reportBody}

<h2>4. List of changes</h2>
${md(read("changes.md"), { shift: 1, drop: [1] })}

<h2>5. AI tool use statement</h2>
${md(read("ai-tool-use.md").replace(/^> \*\*Draft[^\n]*\n\n?/m, ""), { shift: 1, drop: [1] })}

<h2>6. Team contribution statement</h2>
${md(read("contribution-statement.md"), { shift: 1, drop: [1] })}
</body></html>`;

writeFileSync(new URL("report.html", PHASE), html);
console.log(`wrote report.html (${desktop.length} desktop and ${phone.length} phone frames, results ${results ? "included" : "pending"})`);
