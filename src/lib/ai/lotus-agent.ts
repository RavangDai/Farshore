import { lotusMoveInPlace, lotusTickInPlace, mazePath, type LotusState, type Point } from "../encounters/odyssey-games.ts";
import { LOTUS_HEIGHT, LOTUS_WIDTH, pathDistances } from "../encounters/lotus-layouts.ts";

/**
 * The trained Lotus-Eaters rival: what it sees, what it can do, how it is
 * rewarded, and the A* baseline it is measured against.
 *
 * The same functions run in three places: the Node training server, the
 * evaluation harness, and the browser race. That is what keeps the policy's
 * view of the game identical between training and live play.
 *
 * Time runs in fixed 10 ms ticks. Odysseus can step once every 170 ms
 * (MOVE_TICKS), so the agent chooses one action per movement opportunity:
 * up, down, left, right, or wait. A wait, or a step into a hedge, spends that
 * opportunity, exactly as a held key against a hedge would.
 */

export const TICK_MS = 10;
export const MOVE_TICKS = 17;
export const ACTIONS = ["UP", "DOWN", "LEFT", "RIGHT", "WAIT"] as const;
export type AgentAction = 0 | 1 | 2 | 3 | 4;
export const ACTION_DELTAS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]];
export const WAIT: AgentAction = 4;

/**
 * Observation versions. A model records the version it was trained on, and
 * the game builds exactly that observation for it; any other is refused.
 * Version 2 adds the direction of each guardian's last step. Version 3 adds
 * the danger next to each move and progress along the safest route home.
 */
export const OBS_VERSION = 1;
const WINDOW = 7;
const HALF = (WINDOW - 1) / 2;
export const OBS_SIZE = 14 + 4 + 4 * 8 + 5 + 2 * 5 + 3 * 4 + 2 * WINDOW * WINDOW;
export const OBS_SIZES: Record<number, number> = { 1: OBS_SIZE, 2: OBS_SIZE + 4, 3: OBS_SIZE + 4 + 14 };

const GUARD_INTERVALS = [1050, 780, 600];
const DIFFICULTIES = ["easy", "normal", "hard"];
const FAR = 40;
const NEAR = 20;

const cell = (p: Point) => p.y * LOTUS_WIDTH + p.x;
const open = (maze: string[], p: Point) => maze[p.y]?.[p.x] === ".";

/** Path distances from the ship never change within a garden, so they are kept per garden. */
const shipCache = new Map<string, Int16Array>();
function fromShip(s: LotusState) {
  const k = `${s.layout.ship.x},${s.layout.ship.y}:${s.layout.maze.join("")}`;
  let d = shipCache.get(k);
  if (!d) {
    if (shipCache.size > 512) shipCache.clear();
    d = pathDistances(s.layout.maze, s.layout.ship);
    shipCache.set(k, d);
  }
  return d;
}

/** The smallest path distance from `p` to any of `points`, through open path; -1 when there is none. */
function nearest(maps: Int16Array[], p: Point) {
  let best = -1;
  for (const m of maps) { const d = m[cell(p)]; if (d >= 0 && (best < 0 || d < best)) best = d; }
  return best;
}
const scaled = (d: number, range: number) => (d < 0 ? 1 : Math.min(1, d / range));

/** The guardians' plan as the guardian logic applies it. */
export const effectivePlan = (s: LotusState) => (s.plan.source === "ai" ? s.plan.planId : "patrol");

/**
 * The observation: OBS_SIZE numbers, each roughly between -1 and 1, built
 * only from what the player can see on screen. Documented in
 * training/README.md; the order here is the contract with the trained model.
 */
export function observe(s: LotusState, version = OBS_VERSION): Float32Array {
  const size = OBS_SIZES[version];
  if (!size) throw new Error(`Unknown observation version ${version}.`);
  const o = new Float32Array(size);
  const maze = s.layout.maze, t = DIFFICULTIES.indexOf(s.difficulty), plan = effectivePlan(s);
  const ship = fromShip(s);
  const sailorMaps = s.sailors.map(p => pathDistances(maze, p));
  const guardMaps = s.guardians.map(p => pathDistances(maze, p));
  const molyMaps = s.pickups.map(p => pathDistances(maze, p));
  const goalMap = s.carrying || !s.sailors.length ? ship : null;
  const goalAt = (p: Point) => (goalMap ? goalMap[cell(p)] : nearest(sailorMaps, p));
  let i = 0;
  const put = (v: number) => { o[i++] = v; };

  // Status: escort, crew, health, ward, time, and the guardians' visible step rhythm.
  put(s.carrying ? 1 : 0);
  put(s.rescued / 3);
  put(s.sailors.length / 3);
  put(s.hits / 3);
  put(s.protection / 14000);
  put(s.invulnerable / 1800);
  put(Math.max(0, 1 - s.elapsed / s.duration));
  put(Math.min(1, s.guardClock / GUARD_INTERVALS[Math.max(0, t)]));
  for (let k = 0; k < 3; k++) put(k === t ? 1 : 0);
  for (const name of ["patrol", "pincer", "undertow"]) put(plan === name ? 1 : 0);

  // Where Odysseus is, and where the ship is from him.
  put(s.player.x / (LOTUS_WIDTH - 1));
  put(s.player.y / (LOTUS_HEIGHT - 1));
  put((s.layout.ship.x - s.player.x) / (LOTUS_WIDTH - 1));
  put((s.layout.ship.y - s.player.y) / (LOTUS_HEIGHT - 1));

  // Each of the four directions: is it open, and what lies that way.
  const here = goalAt(s.player);
  for (const [dx, dy] of ACTION_DELTAS.slice(0, 4)) {
    const n = { x: s.player.x + dx, y: s.player.y + dy };
    if (!open(maze, n)) { put(0); put(0); for (let k = 0; k < 6; k++) put(1); continue; }
    const g = goalAt(n);
    put(1);
    put(here >= 0 && g >= 0 ? Math.max(-1, Math.min(1, here - g)) : 0);
    put(scaled(g, FAR));
    put(scaled(ship[cell(n)], FAR));
    put(scaled(nearest(sailorMaps, n), FAR));
    put(scaled(nearest(guardMaps, n), NEAR));
    put(s.guardians.some(p => p.x === n.x && p.y === n.y) ? 1 : 0);
    put(scaled(nearest(molyMaps, n), FAR));
  }

  // The same distances from where he stands.
  put(scaled(here, FAR));
  put(scaled(ship[cell(s.player)], FAR));
  put(scaled(nearest(sailorMaps, s.player), FAR));
  put(scaled(nearest(guardMaps, s.player), NEAR));
  put(scaled(nearest(molyMaps, s.player), FAR));

  // Each guardian relative to Odysseus.
  for (let g = 0; g < 2; g++) {
    const p = s.guardians[g];
    if (!p) { put(0); put(0); put(1); put(1); put(0); continue; }
    const m = Math.abs(p.x - s.player.x) + Math.abs(p.y - s.player.y);
    put((p.x - s.player.x) / (LOTUS_WIDTH - 1));
    put((p.y - s.player.y) / (LOTUS_HEIGHT - 1));
    put(scaled(guardMaps[g][cell(s.player)], NEAR));
    put(Math.min(1, m / NEAR));
    put(m <= 7 ? 1 : 0);
  }

  // The sailors still waiting, nearest first.
  const waiting = s.sailors.map((p, k) => ({ p, d: sailorMaps[k][cell(s.player)] })).sort((a, b) => (a.d < 0 ? 999 : a.d) - (b.d < 0 ? 999 : b.d));
  for (let k = 0; k < 3; k++) {
    const w = waiting[k];
    if (!w) { put(0); put(0); put(0); put(1); continue; }
    put(1);
    put((w.p.x - s.player.x) / (LOTUS_WIDTH - 1));
    put((w.p.y - s.player.y) / (LOTUS_HEIGHT - 1));
    put(scaled(w.d, FAR));
  }

  // A 7 x 7 view around Odysseus: hedges, then guardians.
  for (let y = -HALF; y <= HALF; y++) for (let x = -HALF; x <= HALF; x++) put(open(maze, { x: s.player.x + x, y: s.player.y + y }) ? 0 : 1);
  for (let y = -HALF; y <= HALF; y++) for (let x = -HALF; x <= HALF; x++) put(s.guardians.some(p => p.x === s.player.x + x && p.y === s.player.y + y) ? 1 : 0);

  // Version 2: which way each guardian last stepped (-1, 0 or 1 on each axis).
  if (version >= 2) for (let g = 0; g < 2; g++) {
    const now = s.guardians[g], before = s.lastGuardians?.[g];
    put(now && before ? Math.sign(now.x - before.x) : 0);
    put(now && before ? Math.sign(now.y - before.y) : 0);
  }

  // Version 3: the danger beside each move, and progress along the safe route:
  // the shortest way to the goal that never passes beside a guardian.
  if (version >= 3) {
    const safe = safeDistances(s), safeHere = safe[cell(s.player)];
    put(safeHere >= 0 ? 1 : 0);
    put(scaled(safeHere, FAR));
    const watched = guarded(s);
    for (const [dx, dy] of ACTION_DELTAS.slice(0, 4)) {
      const n = { x: s.player.x + dx, y: s.player.y + dy };
      if (!open(maze, n)) { put(0); put(0); put(1); continue; }
      const d = safe[cell(n)];
      put(watched.has(cell(n)) ? 1 : 0);
      put(safeHere >= 0 && d >= 0 ? Math.max(-1, Math.min(1, safeHere - d)) : 0);
      put(scaled(d, FAR));
    }
  }

  if (i !== size) throw new Error(`Observation has ${i} values, expected ${size}.`);
  return o;
}

/** Tiles a guardian stands on or beside. Empty while moly protects Odysseus. */
function guarded(s: LotusState): Set<number> {
  const tiles = new Set<number>();
  if (s.protection > 0) return tiles;
  for (const g of s.guardians) for (const [dx, dy] of [[0, 0], ...ACTION_DELTAS.slice(0, 4)]) tiles.add(cell({ x: g.x + dx, y: g.y + dy }));
  return tiles;
}

/**
 * Path distances to the current goal (the ship while escorting, otherwise the
 * nearest waiting sailor) through the garden with every guarded tile treated
 * as a hedge, except the one Odysseus stands on. -1 where no safe route exists.
 */
function safeDistances(s: LotusState): Int16Array {
  const watched = guarded(s), here = cell(s.player), maze = s.layout.maze;
  const passable = (p: Point) => open(maze, p) && (!watched.has(cell(p)) || cell(p) === here);
  const dist = new Int16Array(LOTUS_WIDTH * LOTUS_HEIGHT).fill(-1);
  const goals = (s.carrying || !s.sailors.length ? [s.layout.ship] : s.sailors).filter(passable);
  const queue: Point[] = [];
  for (const g of goals) if (dist[cell(g)] < 0) { dist[cell(g)] = 0; queue.push(g); }
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    for (const [dx, dy] of ACTION_DELTAS.slice(0, 4)) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (passable(q) && dist[cell(q)] < 0) { dist[cell(q)] = dist[cell(p)] + 1; queue.push(q); }
    }
  }
  return dist;
}

/**
 * A guardian-aware baseline: follow the safe route (see safeDistances); when
 * there is none, step to the open tile farthest from the guardians if that is
 * further than where Odysseus stands; otherwise fall back to plain A*.
 */
export function carefulAction(s: LotusState): AgentAction {
  const maze = s.layout.maze, safe = safeDistances(s), here = safe[cell(s.player)];
  const moves = ACTION_DELTAS.slice(0, 4).map(([dx, dy], a) => ({ a: a as AgentAction, p: { x: s.player.x + dx, y: s.player.y + dy } })).filter(m => open(maze, m.p));
  if (here > 0) {
    const next = moves.find(m => safe[cell(m.p)] === here - 1);
    if (next) return next.a;
  }
  if (here !== 0 && !s.protection && s.guardians.length) {
    const far = (p: Point) => Math.min(...s.guardians.map(g => Math.abs(g.x - p.x) + Math.abs(g.y - p.y)));
    const away = [...moves].sort((a, b) => far(b.p) - far(a.p))[0];
    if (away && far(away.p) > far(s.player)) return away.a;
  }
  return astarAction(s);
}

/** One agent decision: step (or wait) now. Changes the state in place; returns whether Odysseus moved. */
export function applyAgentAction(s: LotusState, action: number): boolean {
  const [dx, dy] = ACTION_DELTAS[action] ?? [0, 0];
  return dx || dy ? lotusMoveInPlace(s, dx, dy) : false;
}

/** Runs the garden forward by whole ticks, in place, stopping when the board ends. */
export function advanceTicks(s: LotusState, ticks: number) {
  for (let k = 0; k < ticks && !s.done; k++) lotusTickInPlace(s, TICK_MS);
}

/** One full decision step as the training environment takes it: act, then wait out the movement cooldown. */
export function agentStep(s: LotusState, action: number) {
  applyAgentAction(s, action);
  advanceTicks(s, MOVE_TICKS);
}

/** The shaping potential: progress through the crew, plus closeness to the current goal. */
export function potential(s: LotusState) {
  // The goal is the ship while a sailor follows, otherwise the nearest sailor by path.
  const d = s.carrying || !s.sailors.length ? fromShip(s)[cell(s.player)] : nearest(s.sailors.map(p => pathDistances(s.layout.maze, p)), s.player);
  return s.rescued + 0.5 * (s.carrying ? 1 : 0) - 0.05 * Math.max(0, d);
}

export const REWARD = { rescue: 10, complete: 10, hit: -3, step: -0.01, gamma: 0.99 };
export type StepSnapshot = { rescued: number; damage: number; potential: number };
export const snapshot = (s: LotusState): StepSnapshot => ({ rescued: s.rescued, damage: s.damageTaken, potential: potential(s) });

/**
 * The training reward for one decision step. Rescues dominate; a caught
 * Odysseus pays for it; every step costs a little time. The potential term is
 * potential-based shaping (gamma * phi(next) - phi(prev), with phi = 0 once the
 * board ends), which cannot be farmed: any loop back to the same state nets
 * nothing, so it never favours picking a sailor up and losing them again.
 */
export function stepReward(before: StepSnapshot, s: LotusState, hitPenalty = REWARD.hit) {
  const rescues = s.rescued - before.rescued, hits = s.damageTaken - before.damage;
  const shaping = REWARD.gamma * (s.done ? 0 : potential(s)) - before.potential;
  return REWARD.rescue * rescues + (s.done && s.won ? REWARD.complete : 0) + hitPenalty * hits + REWARD.step + shaping;
}

/**
 * The A* baseline: the shortest path to the nearest sailor, then home, using
 * the game's own A* (mazePath). It ignores the guardians entirely.
 */
export function astarAction(s: LotusState): AgentAction {
  const maze = s.layout.maze;
  const target = s.carrying || !s.sailors.length ? s.layout.ship : [...s.sailors].sort((a, b) => mazePath(s.player, a, maze).length - mazePath(s.player, b, maze).length)[0];
  const step = mazePath(s.player, target, maze)[0];
  if (!step) return WAIT;
  const dx = step.x - s.player.x, dy = step.y - s.player.y;
  return ACTION_DELTAS.findIndex(([x, y]) => x === dx && y === dy) as AgentAction;
}

/** The AI Live panel's line: the latest move, the escort, and the crew aboard. */
export function liveLine(s: LotusState, action: number | null) {
  const move = action === null ? "READY" : ACTIONS[action] ?? "WAIT";
  const escort = s.done ? (s.won ? "All crew aboard" : "Out of the race") : s.carrying ? "Escorting sailor" : s.sailors.length ? "Seeking crew" : "Heading home";
  return `${move} · ${escort} · Crew aboard ${s.rescued}/3`;
}
