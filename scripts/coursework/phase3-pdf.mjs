// Prints phase3/report.html to Farshore-Phase-3-Submission.pdf with page numbers.
// playwright-core is not a project dependency: point PLAYWRIGHT_CORE at an installed copy
// (for example `npm i --prefix .tmp playwright-core` and PLAYWRIGHT_CORE=.tmp/node_modules/playwright-core).
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

const core = process.env.PLAYWRIGHT_CORE;
if (!core) throw new Error("Set PLAYWRIGHT_CORE to the folder of an installed playwright-core.");
const { chromium } = await import(pathToFileURL(resolve(core, "index.mjs")).href);
const PHASE = new URL("../../docs/coursework/docs/assignment/phase3/", import.meta.url);
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage();
await page.goto(new URL("report.html", PHASE).href, { waitUntil: "load" });
await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
await page.pdf({
  path: fileURLToPath(new URL("Farshore-Phase-3-Submission.pdf", PHASE)),
  format: "Letter",
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: '<div style="width:100%;font:8px Arial;color:#526875;padding:0 0.65in;display:flex;justify-content:space-between"><span>Farshore · CMPS 4200 Phase 3 · Bibek Pathak</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  timeout: 300000,
});
await browser.close();
console.log("wrote Farshore-Phase-3-Submission.pdf");
