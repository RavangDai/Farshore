// Copies the FARSHORE cinematic asset pack (docs/Farshore-Cinematic-Assets)
// into public/art/cinematic and writes the WebP derivatives the menus load.
// The original PNGs are copied unchanged next to their derivatives.
//
//   node scripts/build-cinematic-assets.mjs
//
// Per environment: <name>.png (original), <name>.webp (full 1672x941) and
// <name>-card.webp (720 px wide, for cards and panel thumbnails).

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pack = join(root, "docs", "Farshore-Cinematic-Assets");
const out = join(root, "public", "art", "cinematic");

async function derive(src, destBase, { quality, card }) {
  await copyFile(src, `${destBase}.png`);
  await sharp(src).webp({ quality, effort: 5, smartSubsample: true }).toFile(`${destBase}.webp`);
  if (card) await sharp(src).resize({ width: 720 }).webp({ quality: 80, effort: 5 }).toFile(`${destBase}-card.webp`);
}

await mkdir(join(out, "environments"), { recursive: true });
await mkdir(join(out, "map"), { recursive: true });
await mkdir(join(out, "markers"), { recursive: true });

const environments = (await readdir(join(pack, "environments"))).filter(f => f.endsWith(".png"));
for (const file of environments) {
  await derive(join(pack, "environments", file), join(out, "environments", file.replace(/\.png$/, "")), { quality: 86, card: true });
  console.log(`environments/${file}`);
}

// The map keeps more detail: its labels sit on small landmarks.
await derive(join(pack, "map", "voyage-map.png"), join(out, "map", "voyage-map"), { quality: 90, card: false });
await copyFile(join(pack, "map", "route.svg"), join(out, "map", "route.svg"));
await copyFile(join(pack, "map", "map-layout.json"), join(out, "map", "map-layout.json"));
console.log("map/voyage-map.png, route.svg, map-layout.json");

for (const file of await readdir(join(pack, "ui", "markers"))) {
  await copyFile(join(pack, "ui", "markers", file), join(out, "markers", file));
  console.log(`markers/${file}`);
}
