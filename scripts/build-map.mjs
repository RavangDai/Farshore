import { readFileSync, writeFileSync } from 'node:fs';
// Run from the project root with Natural Earth 1:50m land GeoJSON (public domain).
// https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson
const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/build-map.mjs <path-to-ne_50m_land.geojson>');
  process.exit(1);
}
const data = JSON.parse(readFileSync(source, 'utf8'));
function clip(ring, axis, limit, keepGreater) {
  const result = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const insideA = keepGreater ? a[axis] >= limit : a[axis] <= limit;
    const insideB = keepGreater ? b[axis] >= limit : b[axis] <= limit;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
}
const paths = [];
for (const feature of data.features) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons) {
    let path = '';
    for (let ring of polygon) {
      for (const boundary of [[0, -1, true], [0, 31, false], [1, 30, true], [1, 45, false]]) ring = clip(ring, ...boundary);
      if (ring.length < 3) continue;
      const projected = ring.map(([lon, lat]) => [(lon + 1) * 37.5, (45 - lat) * 710 / 15]);
      let last;
      const points = projected.filter((p, i) => {
        if (last && i !== projected.length - 1 && Math.hypot(p[0] - last[0], p[1] - last[1]) < .65) return false;
        last = p;
        return true;
      });
      path += 'M' + points.map(p => p.map(n => n.toFixed(1)).join(',')).join('L') + 'Z';
    }
    if (path) paths.push(path);
  }
}
writeFileSync('src/lib/map-land.ts', '// Natural Earth 1:50m land, public domain. Clipped and simplified for Farshore.\n// https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-land/\nexport const landPaths: string[] = ' + JSON.stringify(paths) + ';\n');
console.log(`${paths.length} land polygons; ${paths.join('').length} path characters`);
