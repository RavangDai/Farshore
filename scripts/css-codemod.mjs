// One-time rewrite of the arcade stylesheets so the pixel skin can restyle
// them through variables instead of fighting their selectors. With the skin
// off every variable falls back to today's value, so nothing changes until
// `[data-skin="pixel"]` sets them:
//   1. font sizes under 12px  -> max(var(--fs-font-floor, 0px), Npx)
//   2. Georgia / Arial stacks -> var(--fs-font-display) / var(--fs-font-ui)
//   3. border-radius lengths  -> calc(var(--fs-round, 1) * Npx)
// Run once: node scripts/css-codemod.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "src/styles/arcade.css", "src/styles/mythic.css", "src/styles/odyssey.css", "src/styles/farshore.css",
  "src/styles/farshore-brand.css", "src/styles/farshore-detail.css", "src/styles/farshore-stage.css",
  "src/styles/farshore-cinema.css", "src/styles/farshore-viewport.css", "src/styles/farshore-crossing.css",
  "src/styles/farshore-race.css", "src/styles/farshore-oracle.css", "app/online.css",
];
const check = process.argv.includes("--check");

const NAME = `(?:"[^"]+"|'[^']+'|[A-Za-z][\\w-]*)`;
const DISPLAY = new RegExp(`(?<![\\w-])(?:Georgia|"Palatino Linotype"|'Palatino Linotype'|Palatino|"Times New Roman"|serif)(?:\\s*,\\s*${NAME})*`, "g");
const UI = new RegExp(`(?<![\\w-])(?:Arial|Helvetica|"Helvetica Neue"|'Helvetica Neue')(?:\\s*,\\s*${NAME})*`, "g");
const floor = n => `max(var(--fs-font-floor,0px),${n}px)`;

function fonts(value) {
  // Only whole stacks are replaced; a generic family alone (sans-serif) stays.
  return value.replace(DISPLAY, m => (m === "serif" ? m : "var(--fs-font-display)")).replace(UI, "var(--fs-font-ui)");
}

function rewrite(css) {
  let changes = 0;
  // Declarations: property, colon, value up to ; or } (values here never contain braces).
  const out = css.replace(/(^|[{;\s])((?:-?[a-z-]+))\s*:\s*([^;{}]+)/g, (whole, lead, prop, value) => {
    let v = value;
    if (prop === "font-family") v = fonts(v);
    else if (prop === "font") {
      v = fonts(v);
      // The size in the shorthand: a px length followed by "/" or a space, outside any function.
      v = v.replace(/(^|\s)(\d*\.?\d+)px(?=\/|\s)/, (m, sp, n) => (Number(n) < 12 ? `${sp}${floor(n)}` : m));
    } else if (prop === "font-size") {
      v = v.replace(/^(\s*)(\d*\.?\d+)px(\s*(?:!important)?\s*)$/, (m, a, n, b) => (Number(n) < 12 ? `${a}${floor(n)}${b}` : m));
    } else if (/^border(?:-(?:top|bottom)-(?:left|right))?-radius$/.test(prop) && !v.includes("--fs-round")) {
      v = v.replace(/(?<![\w.(-])(\d*\.?\d+)px/g, (m, n) => (Number(n) === 0 ? m : `calc(var(--fs-round,1)*${n}px)`));
    }
    if (v === value) return whole;
    changes++;
    return whole.slice(0, whole.length - value.length) + v;
  });
  return { out, changes };
}

let total = 0;
for (const file of FILES) {
  const css = readFileSync(file, "utf8");
  const { out, changes } = rewrite(css);
  total += changes;
  console.log(`${file}: ${changes} declarations`);
  if (!check && out !== css) writeFileSync(file, out);
}
console.log(`${total} declarations ${check ? "would change" : "changed"}`);
