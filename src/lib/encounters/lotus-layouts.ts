import { LOTUS_CLASSIC, type LotusLayout, type Point } from "./odyssey-games.ts";

/**
 * Lotus-Eaters gardens beyond the classic one.
 *
 * `generateLotusLayout(seed)` builds a 15 x 11 garden with the same grammar as
 * the classic maze: hedges on the even tiles, paths on the odd ones, a spanning
 * maze opened up with extra loops so there is more than one way home. It then
 * places the ship in a corner, three sailors far from it, two guardians away
 * from the ship, two moly pickups, three relics and a patrol route. Every
 * garden passes `validateLotusLayout` before it is used.
 *
 * Seeds are split so a trained rival is always measured on gardens it never
 * saw: training draws seeds below EVAL_SEED_START, evaluation uses seeds from
 * EVAL_SEED_START up, and the classic and showcase gardens are never trained on.
 */

export const LOTUS_WIDTH = 15;
export const LOTUS_HEIGHT = 11;
export const EVAL_SEED_START = 1_000_000;
/** Gardens kept out of training entirely. */
export const HELD_OUT_LAYOUTS = ["classic", "showcase"];

const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const key = (p: Point) => p.y * LOTUS_WIDTH + p.x;
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** A small seeded generator (mulberry32), so a seed always gives the same garden. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Breadth-first path distances from `from` to every open tile; -1 where unreachable. */
export function pathDistances(maze: string[], from: Point): Int16Array {
  const dist = new Int16Array(LOTUS_WIDTH * LOTUS_HEIGHT).fill(-1);
  if (maze[from.y]?.[from.x] !== ".") return dist;
  const queue = [from];
  dist[key(from)] = 0;
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head], d = dist[key(p)];
    for (const [dx, dy] of DIRS) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (maze[q.y]?.[q.x] === "." && dist[key(q)] < 0) { dist[key(q)] = d + 1; queue.push(q); }
    }
  }
  return dist;
}

export function openTiles(maze: string[]): Point[] {
  const tiles: Point[] = [];
  for (let y = 0; y < maze.length; y++) for (let x = 0; x < maze[y].length; x++) if (maze[y][x] === ".") tiles.push({ x, y });
  return tiles;
}

/** Every rule a garden must meet. Returns the problems found; an empty list means it is playable. */
export function validateLotusLayout(layout: LotusLayout): string[] {
  const problems: string[] = [];
  const { maze } = layout;
  if (maze.length !== LOTUS_HEIGHT || maze.some(row => row.length !== LOTUS_WIDTH)) return [`The garden must be ${LOTUS_WIDTH} x ${LOTUS_HEIGHT}.`];
  if (maze.some(row => /[^#.]/.test(row))) problems.push("Only hedges (#) and paths (.) are allowed.");
  for (let x = 0; x < LOTUS_WIDTH; x++) if (maze[0][x] !== "#" || maze[LOTUS_HEIGHT - 1][x] !== "#") problems.push("The outer hedge must be closed.");
  for (let y = 0; y < LOTUS_HEIGHT; y++) if (maze[y][0] !== "#" || maze[y][LOTUS_WIDTH - 1] !== "#") problems.push("The outer hedge must be closed.");
  const open = (p: Point) => maze[p.y]?.[p.x] === ".";
  const fromShip = pathDistances(maze, layout.ship);
  const reach = (p: Point) => fromShip[key(p)];
  if (!open(layout.ship)) problems.push("The ship must stand on a path.");
  if (openTiles(maze).some(p => reach(p) < 0)) problems.push("Every path must connect to the ship.");
  const named: [string, Point[], number][] = [["sailor", layout.sailors, 3], ["guardian", layout.guardians, 2], ["moly", layout.pickups, 2], ["relic", layout.relics, 3]];
  const occupied: Point[] = [layout.ship];
  for (const [name, points, count] of named) {
    if (points.length !== count) problems.push(`There must be ${count} ${name}s.`);
    for (const p of points) {
      if (!open(p)) problems.push(`A ${name} stands in a hedge at ${p.x}, ${p.y}.`);
      else if (reach(p) < 1) problems.push(`A ${name} at ${p.x}, ${p.y} has no route to the ship.`);
      if (occupied.some(o => same(o, p))) problems.push(`Two things share the tile ${p.x}, ${p.y}.`);
      occupied.push(p);
    }
  }
  // A guardian must not be able to catch Odysseus before he can take a step.
  for (const g of layout.guardians) if (reach(g) >= 0 && reach(g) < 6) problems.push(`A guardian at ${g.x}, ${g.y} starts too close to the ship.`);
  if (layout.waypoints.length < 3) problems.push("The guardians need at least three patrol points.");
  for (const w of layout.waypoints) if (!open(w)) problems.push(`A patrol point at ${w.x}, ${w.y} is in a hedge.`);
  return [...new Set(problems)];
}

/** Picks one of the best-scoring candidates, so placements spread out but still vary by seed. */
function pick(candidates: Point[], score: (p: Point) => number, random: () => number, top = 4): Point | undefined {
  const ranked = [...candidates].sort((a, b) => score(b) - score(a)).slice(0, Math.max(1, top));
  return ranked[Math.floor(random() * ranked.length)];
}

/** Generates the garden for `seed`. The same seed always gives the same garden. */
export function generateLotusLayout(seed: number): LotusLayout {
  for (let attempt = 0; attempt < 50; attempt++) {
    const layout = buildLayout(seed, attempt);
    if (layout && validateLotusLayout(layout).length === 0) return layout;
  }
  throw new Error(`No valid garden for seed ${seed}.`);
}

function buildLayout(seed: number, attempt: number): LotusLayout | null {
  const random = seededRandom(seed * 7919 + attempt * 104729 + 17);
  const grid = Array.from({ length: LOTUS_HEIGHT }, () => Array.from({ length: LOTUS_WIDTH }, () => "#"));
  const cells: Point[] = [];
  for (let y = 1; y < LOTUS_HEIGHT; y += 2) for (let x = 1; x < LOTUS_WIDTH; x += 2) { grid[y][x] = "."; cells.push({ x, y }); }
  // A spanning maze by randomised depth-first search between the odd tiles.
  const seen = new Set<number>([key(cells[0])]);
  const stack = [cells[Math.floor(random() * cells.length)]];
  seen.add(key(stack[0]));
  while (stack.length) {
    const here = stack[stack.length - 1];
    const next = DIRS.map(([dx, dy]) => ({ x: here.x + dx * 2, y: here.y + dy * 2 })).filter(p => p.x > 0 && p.y > 0 && p.x < LOTUS_WIDTH - 1 && p.y < LOTUS_HEIGHT - 1 && !seen.has(key(p)));
    if (!next.length) { stack.pop(); continue; }
    const to = next[Math.floor(random() * next.length)];
    grid[(here.y + to.y) / 2][(here.x + to.x) / 2] = ".";
    seen.add(key(to));
    stack.push(to);
  }
  // Open extra gaps so most places have two ways in: route choices, and room to slip past a guardian.
  const loops = 0.22 + random() * 0.14;
  for (let y = 1; y < LOTUS_HEIGHT - 1; y++) for (let x = 1; x < LOTUS_WIDTH - 1; x++) {
    const between = (x % 2 === 0) !== (y % 2 === 0);
    if (between && grid[y][x] === "#" && random() < loops) grid[y][x] = ".";
  }
  // Every dead end becomes a loop with some chance, which keeps chases escapable.
  for (const c of cells) {
    const exits = DIRS.filter(([dx, dy]) => grid[c.y + dy][c.x + dx] === ".");
    if (exits.length === 1 && random() < 0.5) {
      const closed = DIRS.filter(([dx, dy]) => grid[c.y + dy][c.x + dx] === "#" && c.x + dx * 2 > 0 && c.x + dx * 2 < LOTUS_WIDTH - 1 && c.y + dy * 2 > 0 && c.y + dy * 2 < LOTUS_HEIGHT - 1);
      const [dx, dy] = closed[Math.floor(random() * closed.length)] ?? [0, 0];
      if (dx || dy) grid[c.y + dy][c.x + dx] = ".";
    }
  }
  const maze = grid.map(row => row.join(""));
  const corners = [{ x: 1, y: 9 }, { x: 1, y: 1 }, { x: 13, y: 1 }, { x: 13, y: 9 }];
  const ship = corners[Math.floor(random() * corners.length)];
  const fromShip = pathDistances(maze, ship);
  const tiles = openTiles(maze).filter(p => !same(p, ship));
  const d = (p: Point) => fromShip[key(p)];
  const taken: Point[] = [ship];
  const free = (p: Point) => !taken.some(t => same(t, p));

  const sailors: Point[] = [];
  for (let i = 0; i < 3; i++) {
    const s = pick(tiles.filter(p => free(p) && d(p) >= 8), p => (sailors.length ? Math.min(...sailors.map(o => manhattan(o, p))) * 2 : 0) + d(p), random, 5);
    if (!s) return null;
    sailors.push(s); taken.push(s);
  }
  const guardians: Point[] = [];
  for (let i = 0; i < 2; i++) {
    const g = pick(tiles.filter(p => free(p) && d(p) >= 7 && sailors.every(s => manhattan(s, p) >= 2) && guardians.every(o => manhattan(o, p) >= 4)), () => random(), random, 8);
    if (!g) return null;
    guardians.push(g); taken.push(g);
  }
  const pickups: Point[] = [];
  for (let i = 0; i < 2; i++) {
    const m = pick(tiles.filter(p => free(p) && d(p) >= 4 && d(p) <= 13 && pickups.every(o => manhattan(o, p) >= 5)), () => random(), random, 10);
    if (!m) return null;
    pickups.push(m); taken.push(m);
  }
  const relics: Point[] = [];
  for (let i = 0; i < 3; i++) {
    const r = pick(tiles.filter(p => free(p) && d(p) >= 3 && relics.every(o => manhattan(o, p) >= 4)), () => random(), random, 12);
    if (!r) return null;
    relics.push(r); taken.push(r);
  }
  // Patrol points spread across the garden, never camped next to the ship.
  const waypoints: Point[] = [guardians[0]];
  for (let i = 0; i < 4; i++) {
    const w = pick(tiles.filter(p => d(p) >= 5 && !waypoints.some(o => same(o, p))), p => Math.min(...waypoints.map(o => manhattan(o, p))), random, 3);
    if (!w) return null;
    waypoints.push(w);
  }
  return { id: `garden-${seed}`, name: `Garden ${seed}`, maze, ship, sailors, guardians, pickups, relics, waypoints };
}

/**
 * The showcase garden, "The crossing". Two far sailors sit on the east side.
 * Bringing either home is 20 steps through the middle row, which the guardians
 * patrol, or 36 and 24 steps round the outer loop. A guardian-blind shortest
 * path walks into the patrol; reading the patrol, or taking the loop, pays.
 */
export const LOTUS_SHOWCASE: LotusLayout = {
  id: "showcase",
  name: "The crossing",
  maze: [
    "###############",
    "#.............#",
    "#.###.###.###.#",
    "#.#...###...#.#",
    "#.#.#######.#.#",
    "#.............#",
    "#.###.###.###.#",
    "#...#.###.#...#",
    "###.#.###.#.###",
    "#.....###.....#",
    "###############",
  ],
  ship: { x: 1, y: 9 },
  sailors: [{ x: 13, y: 9 }, { x: 13, y: 1 }, { x: 3, y: 3 }],
  guardians: [{ x: 7, y: 5 }, { x: 11, y: 3 }],
  pickups: [{ x: 1, y: 5 }, { x: 11, y: 7 }],
  relics: [{ x: 9, y: 1 }, { x: 3, y: 7 }, { x: 13, y: 7 }],
  waypoints: [{ x: 7, y: 5 }, { x: 9, y: 5 }, { x: 5, y: 5 }, { x: 9, y: 7 }, { x: 5, y: 3 }],
};

/** The named gardens a race can start on. */
export const RACE_LAYOUTS: LotusLayout[] = [LOTUS_CLASSIC, LOTUS_SHOWCASE];

/** A fresh validated garden for "New Maze": from its own seed range, apart from training and evaluation. */
export const freshLayout = (random: () => number = Math.random) => generateLotusLayout(2_000_000 + Math.floor(random() * 1_000_000));

/** A garden for training: any seed below the evaluation range. */
export function trainingLayout(random: () => number): LotusLayout {
  return generateLotusLayout(1 + Math.floor(random() * (EVAL_SEED_START - 2)));
}

/** The n-th held-out evaluation garden. */
export const evaluationLayout = (n: number) => generateLotusLayout(EVAL_SEED_START + n);

export { LOTUS_CLASSIC };
