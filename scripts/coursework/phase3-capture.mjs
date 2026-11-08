// Captures Farshore's current screens and AI states for the Phase 3 screen designs.
// Needs the game (npm run dev) and a reachable model. playwright-core is not a project
// dependency: set PLAYWRIGHT_CORE to an installed copy, as for phase3-pdf.mjs.
// Usage: node scripts/coursework/phase3-capture.mjs <outDir> [desktop|phone] [step-ids, e.g. D07,D13]
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
if (!process.env.PLAYWRIGHT_CORE) throw new Error("Set PLAYWRIGHT_CORE to the folder of an installed playwright-core.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_CORE, "index.mjs")).href);
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2];
const DEVICE = process.argv[3] || "desktop";
const ONLY = process.argv[4] || "";
mkdirSync(OUT, { recursive: true });
const phone = DEVICE === "phone";
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const ctxOptions = (phone
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
let ctx = await browser.newContext(ctxOptions);
const hideDevBadge = () => {
  const style = () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.documentElement.appendChild(s); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", style); else style();
};
await ctx.addInitScript(hideDevBadge);
let page = await ctx.newPage();
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + "s", ...a);
const manifest = [];
async function shot(id, title, notes = {}) {
  const file = `${id}.png`;
  await page.screenshot({ path: `${OUT}/${file}` });
  manifest.push({ id, title, file, device: DEVICE, ...notes });
  log("shot", id, title);
}
const button = (name) => page.getByRole("button", { name }).first();
async function settle(ms = 1200) { await page.waitForTimeout(ms); }
async function step(id, fn) {
  if (ONLY && !ONLY.split(",").some(o => id.startsWith(o))) return;
  // Each step starts from a fresh browser profile, so no earlier save changes the flow.
  await ctx.close().catch(() => {});
  ctx = await browser.newContext(ctxOptions);
  await ctx.addInitScript(hideDevBadge);
  page = await ctx.newPage();
  try { await fn(); } catch (e) { log("FAILED", id, String(e).split("\n")[0]); await page.screenshot({ path: `${OUT}/_fail-${id}.png` }).catch(() => {}); }
}
async function home() {
  for (let attempt = 0; ; attempt++) {
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 120000 });
    try { await page.getByText(/press enter to start/i).first().waitFor({ timeout: 90000 }); break; }
    catch (e) { await page.screenshot({ path: `${OUT}/_home-fail-${attempt}.png` }); if (attempt >= 1) throw e; }
  }
  await settle(1500);
}
const menu = (label) => page.getByRole("button", { name: new RegExp("^" + label) }).first();
async function toTitle() { await home(); await page.keyboard.press("Enter"); await settle(1500); }
async function openTrial(index) {
  await button(/^Settings$/).waitFor({ timeout: 15000 }).catch(() => {});
  const trialsTab = page.getByRole("button", { name: "Trials", exact: true });
  if (await trialsTab.count()) await trialsTab.click();
  await settle(600);
  await page.locator(`[data-trial-index='${index}']`).first().click();
  await settle(600);
  await page.getByRole("button", { name: /enter trial/i }).first().click();
  await settle(1500);
}
async function waitReady() { await page.getByRole("button", { name: /counts toward/i }).waitFor({ timeout: 120000 }); await settle(800); }
async function startRound() {
  await page.getByRole("button", { name: /counts toward/i }).click();
  await page.locator(".fs-stage-veil").first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
}
async function unlockAll() {
  await button(/^Settings$/).click();
  await settle(800);
  await page.getByRole("button", { name: /unlock all islands/i }).first().click();
  await settle(800);
  const confirm = page.getByRole("button", { name: /unlock/i }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => {});
  await page.keyboard.press("Escape");
  await settle(800);
}

await step("D01", async () => { await home(); await shot(`${DEVICE}-01-splash`, "Splash", { flow: "F1 Start", ai: "Rival status chip begins checking" }); });
await step("D02", async () => { await toTitle(); await settle(4000); await shot(`${DEVICE}-02-title`, "Title menu", { flow: "F1 Start", ai: "Rival chip: online / model name" }); });
await step("D03", async () => {
  await toTitle();
  await menu("NEW GAME").click(); await settle(1800);
  await shot(`${DEVICE}-03-prologue`, "Prologue", { flow: "F1 Start", ai: "Bard voice reads the prologue" });
  await page.getByRole("button", { name: /journey ahead/i }).click(); await settle(1800);
  await shot(`${DEVICE}-04-prologue-2`, "Prologue, second card", { flow: "F1 Start" });
  await page.getByRole("button", { name: /lotus-eaters/i }).first().click(); await settle(2500);
  await shot(`${DEVICE}-05-trial-select`, "Trial selection", { flow: "F2 Choose a trial", ai: "Per-trial AI technique note" });
  const chart = page.locator(".fs-view-switch button").nth(1);
  await chart.click(); await settle(2500);
  await shot(`${DEVICE}-06-voyage-chart`, "Voyage chart", { flow: "F2 Choose a trial" });
});
await step("D07", async () => {
  // Fresh voyage: the first briefing opens directly from the prologue.
  await toTitle();
  await menu("NEW GAME").click(); await settle(1500);
  await page.getByRole("button", { name: /open voyage map/i }).click(); await settle(1500);
  await openTrial(0);
  await page.getByText(/is studying you/i).first().waitFor({ timeout: 60000 });
  await settle(2500);
  await shot(`${DEVICE}-07-brief-loading`, "Briefing: rival preparing", { flow: "F3 Prepare the rival", ai: "A1 loading: elapsed seconds, cancel" });
  await waitReady();
  await shot(`${DEVICE}-08-brief-ready`, "Briefing: strategy ready", { flow: "F3 Prepare the rival", ai: "A1 success: named strategy, description, taunt, ask again" });
  await page.mouse.wheel(0, 700); await settle(800);
  await shot(`${DEVICE}-09-brief-ready-scrolled`, "Briefing: controls and AI explanation", { flow: "F3 Prepare the rival" });
  await page.mouse.wheel(0, -2000); await settle(500);
  await startRound();
  await settle(2500);
  await shot(`${DEVICE}-10-lotus-countdown`, "Lotus maze: countdown", { flow: "F4 Play", ai: "Rival plan runs locally every frame" });
  await page.locator(".fs-stage-veil").first().waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
  await page.keyboard.down("ArrowRight"); await settle(1500); await page.keyboard.up("ArrowRight");
  await page.keyboard.down("ArrowDown"); await settle(1500); await page.keyboard.up("ArrowDown");
  await settle(4000);
  await shot(`${DEVICE}-11-lotus-play`, "Lotus maze: play with live commentary", { flow: "F4 Play", ai: "Live bard and rival commentary" });
  await page.keyboard.press("Escape"); await settle(1500);
  await shot(`${DEVICE}-12-pause`, "Pause", { flow: "F4 Play" });
});
await step("D13", async () => {
  // Cyclops' Cave is the encounter with the explainable AI inspector.
  await toTitle();
  await menu("NEW GAME").click(); await settle(1500);
  await page.getByRole("button", { name: /open voyage map/i }).click(); await settle(1500);
  await unlockAll();
  await openTrial(1);
  await waitReady();
  await shot(`${DEVICE}-13-cyclops-brief`, "Cyclops briefing: strategy ready", { flow: "F3 Prepare the rival", ai: "A1 success" });
  await startRound();
  await page.locator(".fs-stage-veil").first().waitFor({ state: "detached", timeout: 90000 }).catch(() => {});
  // Wait for Polyphemus' first committed decision so the panel shows a real reason.
  await page.waitForFunction(() => { const p = document.querySelector(".ai-insights"); return p && !/no committed action/i.test(p.textContent || ""); }, null, { timeout: 180000, polling: 250 }).catch(() => log("no committed decision seen"));
  await settle(1400);
  await shot(`${DEVICE}-14-cave-insights`, "Cyclops' Cave: AI Insights", { flow: "F5 Understand the rival", ai: "Insights: state, action, reason, telegraph" });
  await page.keyboard.press("F3"); await settle(1500);
  await page.evaluate(() => document.querySelectorAll(".fs-stage details, aside details").forEach(d => { d.open = true; })).catch(() => {});
  await settle(800);
  await shot(`${DEVICE}-15-cave-ailab`, "Cyclops' Cave: AI Lab panel", { flow: "F5 Understand the rival", ai: "Lab: candidate scores, fairness, metrics" });
  await page.keyboard.press("F3"); await settle(2500);
  await shot(`${DEVICE}-16-cave-immersive`, "Cyclops' Cave: Immersive", { flow: "F4 Play", ai: "Inspector hidden; telegraphs stay" });
  // Let the giant win to reach the result screen.
  await page.locator(".a-result").first().waitFor({ timeout: 240000 });
  await settle(5000);
  await shot(`${DEVICE}-17-result-failed`, "Result: trial failed", { flow: "F4 Play", ai: "Bard recap verse" });
});
await step("D18", async () => {
  await toTitle();
  await menu("SETTINGS").click(); await settle(1500);
  await shot(`${DEVICE}-18-settings`, "Settings", { flow: "F6 Settings", ai: "Model status, commentary and voice toggles" });
  await page.mouse.wheel(0, 900); await settle(800);
  await shot(`${DEVICE}-19-settings-scrolled`, "Settings, lower half", { flow: "F6 Settings" });
});
await step("D20", async () => {
  await toTitle();
  await menu("HOW TO PLAY").click(); await settle(1500);
  await shot(`${DEVICE}-20-how-to-play`, "How to play", { flow: "F2 Learn" });
});
await step("D21", async () => {
  await toTitle();
  await menu("AI LAB").click(); await settle(2000);
  await shot(`${DEVICE}-21-ai-lab`, "AI Lab (Professor mode)", { flow: "F5 Understand the rival", ai: "Run any encounter at any difficulty" });
});
await step("D22", async () => {
  await home();
  await page.getByText(/sign in/i).first().click(); await settle(3000);
  await shot(`${DEVICE}-22-sign-in`, "Sign in", { flow: "F7 Account" });
});
await step("D23", async () => {
  // Real UI under a simulated failure: the planning request is answered with a provider error.
  await page.route("**/api/arcade", route => route.request().method() === "POST"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "The model service did not answer in time. Try again." }) })
    : route.continue());
  await toTitle();
  await menu("NEW GAME").click(); await settle(1500);
  await page.getByRole("button", { name: /open voyage map/i }).click(); await settle(1500);
  await openTrial(0); await settle(4000);
  await shot(`${DEVICE}-23-brief-error`, "Briefing: rival not ready (error)", { flow: "F3 Prepare the rival", ai: "A1 error: message, retry, nothing lost", simulated: "POST /api/arcade answered 503" });
  await page.unroute("**/api/arcade");
});
await step("D24", async () => {
  await page.route("**/api/arcade", route => route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ aiConfigured: true, aiAvailable: false, message: "Ollama is not reachable at 127.0.0.1:11434. Open Ollama, then check again." }) })
    : route.continue());
  await toTitle();
  await menu("NEW GAME").click(); await settle(1500);
  await page.getByRole("button", { name: /open voyage map/i }).click(); await settle(1500);
  await openTrial(0); await settle(2500);
  await shot(`${DEVICE}-24-brief-offline`, "Briefing: no AI rival connected", { flow: "F3 Prepare the rival", ai: "A1 offline: connect steps, check again", simulated: "GET /api/arcade reported unavailable" });
  await page.unroute("**/api/arcade");
});

writeFileSync(`${OUT}/manifest-${DEVICE}.json`, JSON.stringify(manifest, null, 2));
await browser.close();
log("done", manifest.length, "screens");
