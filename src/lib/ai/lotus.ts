// The Lotus Garden's guardians: Pac-Man-style maze-rescue opponent controller.
//
// One decision cycle reassigns roles across the whole guardian squad at once —
// never per guardian in isolation — because the hard tier's entire point is
// that the squad shares a single plan rather than every guardian chasing
// Odysseus into the same corridor. The controller owns no engine state: it
// reads a perception snapshot, reads the player model, writes its reasoning
// into the AI runtime, and hands back a plain action the engine executes by
// moving each guardian along the path this cycle planned for it.
//
// Four fairness invariants hold on every difficulty:
//
//   1. An intercept target is chosen once, when the ambush is first assigned,
//      and is never reconsidered while the guardian is still travelling
//      there. `committed` on the perception is how a guardian tells this
//      controller "don't re-aim me" — such a guardian gets no fresh candidate
//      this cycle and its plan is echoed back unchanged.
//   2. A choke point is only ever assigned when this guardian's own route
//      there is no longer than Odysseus's own remaining route to the same
//      tile. An interception that would arrive after him is withheld.
//   3. No set of intercept assignments made in one cycle may seal every route
//      the perception reports Odysseus still has to the ship. Assignments are
//      accepted in score order, and the one that would close the last route
//      is withheld instead of committed.
//   4. At most one guardian is ever assigned direct pursuit on the
//      coordinating tier; every other detecting guardian either computes a
//      choke point or, failing both of the rules above, falls back to
//      pursuit itself rather than stacking on a doomed interception.
//
// The maze layout below is mirrored from odyssey-games.ts's LOTUS_MAZE and
// LOTUS_SHIP, not imported from it: the engine module will need to import
// this controller to wire it in, and the reverse import would be the cycle
// rule 6 of the contract forbids. If the garden layout ever changes there, it
// must change here too.

import {
  argmax,
  byTier,
  clamp01,
  commitDecision,
  logEvent,
  ms,
  pct,
  tierOf,
  type AIDecision,
  type AIRuntime,
  type AIState,
  type Candidate,
  type Difficulty,
  type Reading,
} from "./types.ts";
import {
  favouriteOption,
  occupancyPrior,
  predictAfter,
  weaknessOf,
  weakestOption,
  type PlayerModel,
} from "./player-model.ts";

// ---------------------------------------------------------------------------
// Garden layout (mirror — see header comment)
// ---------------------------------------------------------------------------

const MAZE_ROWS = [
  "###############",
  "#.............#",
  "#.###.###.###.#",
  "#...#...#...#.#",
  "###.#.#.###.#.#",
  "#...#.#.....#.#",
  "#.###.#####.#.#",
  "#.....#.....#.#",
  "#.###.#.###.#.#",
  "#.............#",
  "###############",
];

export type Tile = { x: number; y: number };

/** Mirrored from LOTUS_SHIP. Where every rescued sailor is carried to. */
export const SHIP_TILE: Tile = { x: 1, y: 9 };

const tileWalkable = (p: Tile) => MAZE_ROWS[p.y]?.[p.x] === ".";
const sameTile = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
const tileKey = (p: Tile) => `${p.x},${p.y}`;
const manhattan = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Four-connected. Order matches DIRECTION_NAMES / directionOf exactly. */
const DIRECTIONS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const DIRECTION_NAMES = ["East", "West", "South", "North"] as const;

/**
 * The cardinal step from `from` to `to`, as a player-model option index, or
 * null when the two tiles are not orthogonally adjacent (e.g. the first tile
 * of a run, before anything has moved).
 */
export function directionOf(from: Tile, to: Tile): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (let i = 0; i < DIRECTIONS.length; i++) if (DIRECTIONS[i][0] === dx && DIRECTIONS[i][1] === dy) return i;
  return null;
}

export type Route = { path: Tile[]; nodesExplored: number };

/**
 * A* over the garden's tile graph, four-connected, Manhattan heuristic.
 *
 * Node expansions are counted and returned rather than discarded: the Lab's
 * `nodesExplored` figure is the one honest way to show the player that the
 * coordinating tier is actually searching and not just claiming to.
 */
function astar(from: Tile, to: Tile): Route {
  if (sameTile(from, to)) return { path: [], nodesExplored: 0 };
  const open = [{ tile: from, g: 0, f: manhattan(from, to) }];
  const cameFrom = new Map<string, Tile>();
  const gScore = new Map<string, number>([[tileKey(from), 0]]);
  const closed = new Set<string>();
  let nodesExplored = 0;
  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const currentKey = tileKey(current.tile);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    nodesExplored++;
    if (sameTile(current.tile, to)) {
      const path: Tile[] = [];
      let step: Tile | undefined = current.tile;
      while (step && !sameTile(step, from)) {
        path.unshift(step);
        step = cameFrom.get(tileKey(step));
      }
      return { path, nodesExplored };
    }
    for (const [dx, dy] of DIRECTIONS) {
      const next = { x: current.tile.x + dx, y: current.tile.y + dy };
      if (!tileWalkable(next)) continue;
      const nextKey = tileKey(next);
      if (closed.has(nextKey)) continue;
      const g = current.g + 1;
      if (g < (gScore.get(nextKey) ?? Infinity)) {
        gScore.set(nextKey, g);
        cameFrom.set(nextKey, current.tile);
        open.push({ tile: next, g, f: g + manhattan(next, to) });
      }
    }
  }
  return { path: [], nodesExplored };
}

/** Whether `to` is reachable from `from` without crossing any tile in `blocked`. */
function reachableAvoiding(from: Tile, to: Tile, blocked: Set<string>): boolean {
  if (sameTile(from, to)) return true;
  const queue: Tile[] = [from];
  const seen = new Set<string>([tileKey(from)]);
  while (queue.length > 0) {
    const tile = queue.shift()!;
    for (const [dx, dy] of DIRECTIONS) {
      const next = { x: tile.x + dx, y: tile.y + dy };
      const k = tileKey(next);
      if (!tileWalkable(next) || seen.has(k) || blocked.has(k)) continue;
      if (sameTile(next, to)) return true;
      seen.add(k);
      queue.push(next);
    }
  }
  return false;
}

/**
 * Odysseus's open first moves toward the ship, given a set of tiles already
 * sealed by a locked intercept.
 *
 * This is the shared fact fairness rule 3 is checked against: an assignment
 * is only accepted while at least one entry here would survive it. A perfect
 * maze often has exactly one living route between two points, so this is not
 * a formality — in the narrow stretches it is frequently the only thing
 * standing between a clever squad and an unwinnable corner.
 */
export function escapeRoutes(player: Tile, sealed: Tile[]): Tile[] {
  const blocked = new Set(sealed.map(tileKey));
  const routes: Tile[] = [];
  for (const [dx, dy] of DIRECTIONS) {
    const next = { x: player.x + dx, y: player.y + dy };
    if (!tileWalkable(next) || blocked.has(tileKey(next))) continue;
    if (reachableAvoiding(next, SHIP_TILE, blocked)) routes.push(next);
  }
  return routes;
}

/** The fixed loop the lowest tier's guardians walk, regardless of Odysseus. */
const PATROL_WAYPOINTS: Tile[] = [
  { x: 7, y: 1 },
  { x: 13, y: 5 },
  { x: 9, y: 9 },
  { x: 5, y: 5 },
  { x: 1, y: 1 },
];

/** How many decision cycles a patrol holds a waypoint before advancing to the next. */
const PATROL_HOLD_CYCLES = 5;

function patrolTarget(guardianIndex: number, tick: number): Tile {
  const step = Math.floor(tick / PATROL_HOLD_CYCLES) + guardianIndex * 2;
  const index = ((step % PATROL_WAYPOINTS.length) + PATROL_WAYPOINTS.length) % PATROL_WAYPOINTS.length;
  return PATROL_WAYPOINTS[index];
}

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export type GuardianRole = "patrol" | "pursue" | "intercept";

export type GuardianObservation = {
  id: number;
  tile: Tile;
  /**
   * The role, target and route an earlier decision cycle assigned this
   * guardian. Read only when `committed` is true — it is how this cycle
   * honours fairness rule 1 without needing to remember its own past calls.
   */
  role: GuardianRole;
  target: Tile;
  path: Tile[];
  /** True while a locked intercept is still travelling; must not be re-aimed. */
  committed: boolean;
  /**
   * The id of the AIDecision that assigned this role, when there was one.
   *
   * Only one decision is committed per cycle (the headline — see
   * `decideLotus`'s own comment), so a guardian whose role changed as a
   * quieter part of the same cycle still needs this to report an outcome
   * later. Absent for a guardian still on patrol, which nothing decided.
   */
  decisionId?: string;
};

export type LotusPerception = {
  /** Simulation time in ms. */
  at: number;
  player: Tile;
  previousPlayer: Tile;
  /** Whether Odysseus currently holds a rescued sailor. */
  carrying: boolean;
  /** ms of moly protection remaining; no guardian can capture while this is positive. */
  protectionMs: number;
  guardians: GuardianObservation[];
  /**
   * Odysseus's currently open first moves toward the ship, given whatever
   * intercepts are already locked from earlier cycles. Computed by the
   * engine with this module's own `escapeRoutes`, so the fairness check this
   * cycle performs and the number the inspector shows agree by construction.
   */
  escapeRoutes: Tile[];
};

export type GuardianPlan = {
  id: number;
  role: GuardianRole;
  target: Tile;
  /** Remaining route to `target`, nearest tile first. The renderer draws this. */
  path: Tile[];
  pathLength: number;
  detection: boolean;
  sightRadius: number;
  /** True while this is a locked intercept the engine must not re-aim. */
  committed: boolean;
  /** Set when this role was assigned by a decision — see GuardianObservation. */
  decisionId?: string;
};

export type LotusAction =
  | { kind: "patrol"; guardians: GuardianPlan[]; decisionId: string }
  | { kind: "pursue"; guardians: GuardianPlan[]; decisionId: string }
  | {
      kind: "intercept";
      guardians: GuardianPlan[];
      /** The guardian whose new assignment is this cycle's headline event. */
      leadGuardianId: number;
      commitMs: number;
      decisionId: string;
    };

export type LotusPolicy = {
  algorithm: string;
  /** ms between decision cycles, and the assumed cost of one guardian tile-step. */
  stepMs: number;
  /** Manhattan tiles a guardian can detect Odysseus across. Zero: never detects. */
  sightRadius: number;
  /** Whether a detecting guardian gives chase at all. */
  pursues: boolean;
  /** Whether detecting guardians beyond the nearest coordinate on choke points. */
  intercepts: boolean;
};

/**
 * The adaptive flag promotes a tier to the next one's behaviour, matching how
 * cyclops.ts and sirens.ts treat an AI-authored opponent plan: a specific plan
 * can play smarter than the raw difficulty slider would otherwise allow.
 */
export function lotusPolicy(difficulty: Difficulty, adaptive: boolean): LotusPolicy {
  const tier = tierOf(difficulty);
  const pursues = tier >= 1 || adaptive;
  const intercepts = tier === 2 || (adaptive && tier >= 1);
  return {
    algorithm: intercepts
      ? "Cooperative interception (shared A* assignment to a choke point on Odysseus's route to the ship)"
      : pursues
        ? "A* pursuit (detect, then shortest path to Odysseus's tile)"
        : "Fixed patrol (waypoint cycle, no detection used)",
    stepMs: byTier(difficulty, 1050, 780, 600),
    sightRadius: byTier(difficulty, 0, 5, 6),
    pursues,
    intercepts,
  };
}

/**
 * The algorithm actually in force this cycle.
 *
 * The coordinating tier's name claims a shared assignment. On a cycle where no
 * guardian detects Odysseus at all there is nothing to coordinate, so claiming
 * it would be a lie; the honest name for that cycle is the pursuit tier's own.
 */
export function lotusAlgorithm(policy: LotusPolicy, anyDetectedThisCycle: boolean): string {
  if (!policy.intercepts) return policy.algorithm;
  return anyDetectedThisCycle ? policy.algorithm : "A* pursuit (interception idle — nothing detected this cycle)";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Baseline score for the option every guardian always has available. */
const PATROL_BASE_SCORE = 10;

/**
 * Urgency of a direct chase: closer sightings matter more, and a guardian is
 * worth more here when it would undo an actual rescue rather than catch an
 * empty-handed Odysseus.
 */
function pursueScore(distance: number, sightRadius: number, carrying: boolean): number {
  let score = 35 + Math.max(0, sightRadius - distance) * 7;
  if (carrying) score += 15;
  return score;
}

/**
 * Value of a choke-point assignment: cutting off a point further along the
 * route denies more of it (`stepsAhead`), a wider lead makes the ambush safer
 * to commit to (`lead`), and `routeTrust`/`routeWeakness` fold in what the
 * behavioural model actually knows about this direction, which is the one
 * term that makes this a hard-tier technique rather than pure geometry.
 */
function interceptScore(lead: number, stepsAhead: number, carrying: boolean, routeTrust: number, routeWeakness: number): number {
  let score = 45 + stepsAhead * 5 + lead * 8 + routeTrust * 20 + routeWeakness * 15;
  if (carrying) score += 15;
  return score;
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

function perceptionReadings(view: LotusPerception, policy: LotusPolicy, detected: boolean[]): Reading[] {
  return [
    {
      key: "player",
      label: "Odysseus",
      value: `(${view.player.x}, ${view.player.y})${view.carrying ? " · carrying a sailor" : ""}`,
    },
    {
      key: "protection",
      label: "Moly ward",
      value: view.protectionMs > 0 ? `${Math.ceil(view.protectionMs / 1000)}s remaining` : "none",
    },
    {
      key: "guardians",
      label: "Guardian positions",
      value: view.guardians
        .map(g => `G${g.id} (${g.tile.x},${g.tile.y})${detected[g.id] ? " · sees him" : ""}${g.committed ? " · locked" : ""}`)
        .join(" · "),
    },
    {
      key: "sight",
      label: "Sight radius",
      value: policy.sightRadius > 0 ? `${policy.sightRadius} tiles (Manhattan)` : "none — this difficulty never tracks Odysseus",
    },
    {
      key: "escapes",
      label: "Odysseus's open routes to the ship",
      value:
        view.escapeRoutes.length > 0
          ? `${view.escapeRoutes.length} tile${view.escapeRoutes.length === 1 ? "" : "s"}: ${view.escapeRoutes.map(t => `(${t.x},${t.y})`).join(", ")}`
          : "none — every first move is already sealed",
      hint: "first moves with a path to the ship that avoids every locked intercept",
    },
  ];
}

function memoryReadings(model: PlayerModel, policy: LotusPolicy): Reading[] {
  const prior = occupancyPrior(model);
  const favourite = favouriteOption(model);
  const weakest = weakestOption(model);
  const readings: Reading[] = [
    {
      key: "habit",
      label: "Direction habit (decayed)",
      value: prior.map((p, i) => `${DIRECTION_NAMES[i]} ${pct(p)}`).join(" · "),
    },
    { key: "favourite", label: "Favoured direction", value: DIRECTION_NAMES[favourite] },
  ];
  if (weakest !== null) {
    const rate = weaknessOf(model, weakest);
    readings.push({
      key: "weak",
      label: "Weakest escape direction",
      value: `${DIRECTION_NAMES[weakest]}${rate === null ? "" : ` (${pct(rate)} caught)`}`,
    });
  }
  if (!policy.intercepts) {
    readings.push({
      key: "scope",
      label: "Policy memory use",
      value: policy.pursues ? "position only — no behavioural memory" : "none — fixed patrol",
    });
  }
  return readings;
}

// ---------------------------------------------------------------------------
// Decision cycle
// ---------------------------------------------------------------------------

/**
 * Run one decision cycle for the whole guardian squad.
 *
 * `tick` indexes the fixed patrol rotation; pass a counter the engine
 * increments once per call. `roll` is accepted only for signature parity with
 * the other controllers — every choice here is resolved by real geometry and
 * real counts, so nothing in this file ever draws from it.
 */
export function decideLotus(
  ai: AIRuntime,
  model: PlayerModel,
  view: LotusPerception,
  difficulty: Difficulty,
  adaptive: boolean,
  tick: number,
  roll: () => number,
): LotusAction {
  const policy = lotusPolicy(difficulty, adaptive);
  const detected = view.guardians.map(g => policy.sightRadius > 0 && manhattan(g.tile, view.player) <= policy.sightRadius);
  const anyDetected = detected.some(Boolean);
  const algorithm = lotusAlgorithm(policy, anyDetected);
  const warded = view.protectionMs > 0;
  const huntingAllowed = !warded && policy.pursues;

  const observations = perceptionReadings(view, policy, detected);
  logEvent(
    ai,
    view.at,
    "perceive",
    `Odysseus at (${view.player.x}, ${view.player.y})${anyDetected ? " — spotted" : ""}${warded ? ", warded" : ""}`,
  );

  const memory = memoryReadings(model, policy);
  logEvent(
    ai,
    view.at,
    "remember",
    policy.intercepts
      ? "Weighing choke points against the direction model"
      : policy.pursues
        ? "Tracking current position only"
        : "No player memory in this policy",
  );

  const plans: GuardianPlan[] = [];
  const candidates: Candidate[] = [];
  const handled = new Set<number>();
  let nodesExplored = 0;
  let coordinated = false;
  let withheldCount = 0;

  // Guardians already mid-ambush from an earlier cycle: fairness rule 1 means
  // this cycle gives them no fresh thought at all, just an unchanged echo.
  for (const g of view.guardians) {
    if (!g.committed) continue;
    plans.push({
      id: g.id,
      role: g.role,
      target: g.target,
      path: g.path,
      pathLength: g.path.length,
      detection: detected[g.id],
      sightRadius: policy.sightRadius,
      committed: true,
      ...(g.decisionId === undefined ? {} : { decisionId: g.decisionId }),
    });
    handled.add(g.id);
  }

  const decidable = view.guardians.filter(g => !handled.has(g.id));
  const lockedChoke: Tile[] = view.guardians.filter(g => g.committed && g.role === "intercept").map(g => g.target);
  let sealed = [...lockedChoke];
  const claimed = new Set(sealed.map(tileKey));

  // The behavioural read this cycle's interceptions lean on: how much the
  // model trusts that Odysseus's immediate next step matches the direction
  // his own shortest route implies, and whether that direction is the one he
  // has historically been caught heading in. Computed once, since it is a
  // property of Odysseus's route, not of any one guardian's position.
  let routeTrust = 0;
  let routeWeakness = 0;
  let forecastGrounded = false;
  let forecastProbability = 0;
  let forecastComputed = false;
  let shipRoute: Route = { path: [], nodesExplored: 0 };

  if (policy.intercepts && huntingAllowed) {
    const activeDetected = decidable.filter(g => detected[g.id]);
    if (activeDetected.length > 0) {
      let primary = activeDetected[0];
      let primaryRoute = astar(primary.tile, view.player);
      nodesExplored += primaryRoute.nodesExplored;
      for (const g of activeDetected.slice(1)) {
        const route = astar(g.tile, view.player);
        nodesExplored += route.nodesExplored;
        if (route.path.length < primaryRoute.path.length) {
          primary = g;
          primaryRoute = route;
        }
      }
      const primaryScore = pursueScore(manhattan(primary.tile, view.player), policy.sightRadius, view.carrying);
      candidates.push({
        action: `g${primary.id}:pursue`,
        score: round1(primaryScore),
        note: `nearest at ${primaryRoute.path.length} steps — assigned the direct chase`,
      });
      plans.push({
        id: primary.id,
        role: "pursue",
        target: view.player,
        path: primaryRoute.path,
        pathLength: primaryRoute.path.length,
        detection: true,
        sightRadius: policy.sightRadius,
        committed: false,
      });
      handled.add(primary.id);

      const secondaries = activeDetected.filter(g => g.id !== primary.id);
      if (secondaries.length > 0) {
        shipRoute = astar(view.player, SHIP_TILE);
        nodesExplored += shipRoute.nodesExplored;
        const lastDirection = directionOf(view.previousPlayer, view.player);
        const shipDirection = shipRoute.path.length > 0 ? directionOf(view.player, shipRoute.path[0]) : null;
        if (lastDirection !== null && shipDirection !== null) {
          const horizonMs = shipRoute.path.length * policy.stepMs;
          const forecast = predictAfter(model, lastDirection, horizonMs);
          routeTrust = forecast.distribution[shipDirection] ?? 0;
          forecastGrounded = forecast.grounded;
          forecastProbability = forecast.probability;
          routeWeakness = weaknessOf(model, shipDirection) ?? 0;
          forecastComputed = true;
        }

        for (const guardian of secondaries) {
          let found: { tile: Tile; stepIndex: number; route: Route } | null = null;
          for (let k = 0; k < shipRoute.path.length; k++) {
            const tile = shipRoute.path[k];
            if (claimed.has(tileKey(tile))) continue;
            const route = astar(guardian.tile, tile);
            nodesExplored += route.nodesExplored;
            if (route.path.length <= k + 1) {
              found = { tile, stepIndex: k, route };
              break;
            }
          }
          if (!found) {
            candidates.push({
              action: `g${guardian.id}:intercept`,
              score: -1000,
              note: "no point on Odysseus's route to the ship is reachable before he passes it — withheld",
            });
            withheldCount++;
          } else {
            const tentative = [...sealed, found.tile];
            const remaining = escapeRoutes(view.player, tentative);
            if (remaining.length === 0) {
              candidates.push({
                action: `g${guardian.id}:intercept`,
                score: -1000,
                note: `intercepting at (${found.tile.x}, ${found.tile.y}) would seal every remaining route to the ship — withheld`,
              });
              withheldCount++;
              found = null;
            } else {
              const chosen = found;
              const lead = chosen.stepIndex + 1 - chosen.route.path.length;
              const stepsAhead = shipRoute.path.length - (chosen.stepIndex + 1);
              const score = interceptScore(lead, stepsAhead, view.carrying, routeTrust, routeWeakness);
              candidates.push({
                action: `g${guardian.id}:intercept`,
                score: round1(score),
                note: `reaches (${chosen.tile.x}, ${chosen.tile.y}) in ${chosen.route.path.length} steps, ${lead} ahead of Odysseus's own ${chosen.stepIndex + 1}; cuts off ${stepsAhead} further tile${stepsAhead === 1 ? "" : "s"}`,
              });
              plans.push({
                id: guardian.id,
                role: "intercept",
                target: chosen.tile,
                path: chosen.route.path,
                pathLength: chosen.route.path.length,
                detection: true,
                sightRadius: policy.sightRadius,
                committed: true,
              });
              sealed = tentative;
              claimed.add(tileKey(chosen.tile));
              coordinated = true;
              handled.add(guardian.id);
            }
          }
          if (!handled.has(guardian.id)) {
            // Fairness or reachability vetoed the intercept: fall back to a
            // direct chase rather than leaving this guardian doing nothing.
            const route = astar(guardian.tile, view.player);
            nodesExplored += route.nodesExplored;
            const score = pursueScore(manhattan(guardian.tile, view.player), policy.sightRadius, view.carrying);
            candidates.push({
              action: `g${guardian.id}:pursue`,
              score: round1(score),
              note: "interception unavailable this cycle — chasing directly instead",
            });
            plans.push({
              id: guardian.id,
              role: "pursue",
              target: view.player,
              path: route.path,
              pathLength: route.path.length,
              detection: true,
              sightRadius: policy.sightRadius,
              committed: false,
            });
            handled.add(guardian.id);
          }
          candidates.push({
            action: `g${guardian.id}:patrol`,
            score: PATROL_BASE_SCORE,
            note: "fixed waypoint, held in reserve this cycle",
          });
        }
      }
    }
  }

  // Everything left over: medium-tier independent pursuit, and every
  // guardian on every tier that is not currently detecting Odysseus at all.
  for (const guardian of decidable) {
    if (handled.has(guardian.id)) continue;
    if (huntingAllowed && policy.pursues && detected[guardian.id]) {
      const route = astar(guardian.tile, view.player);
      nodesExplored += route.nodesExplored;
      const score = pursueScore(manhattan(guardian.tile, view.player), policy.sightRadius, view.carrying);
      candidates.push({
        action: `g${guardian.id}:pursue`,
        score: round1(score),
        note: `within sight radius (${manhattan(guardian.tile, view.player)} ≤ ${policy.sightRadius} tiles); shortest path to his tile`,
      });
      plans.push({
        id: guardian.id,
        role: "pursue",
        target: view.player,
        path: route.path,
        pathLength: route.path.length,
        detection: true,
        sightRadius: policy.sightRadius,
        committed: false,
      });
      candidates.push({ action: `g${guardian.id}:patrol`, score: PATROL_BASE_SCORE, note: "fixed waypoint, not needed this cycle" });
    } else {
      const target = patrolTarget(guardian.id, tick);
      const route = astar(guardian.tile, target);
      nodesExplored += route.nodesExplored;
      const note = warded
        ? `Odysseus is warded — patrol continues rather than closing in for nothing`
        : !policy.pursues
          ? "fixed waypoint cycle; this difficulty never tracks Odysseus"
          : `outside sight radius (${manhattan(guardian.tile, view.player)} > ${policy.sightRadius} tiles)`;
      candidates.push({ action: `g${guardian.id}:patrol`, score: PATROL_BASE_SCORE, note });
      plans.push({
        id: guardian.id,
        role: "patrol",
        target,
        path: route.path,
        pathLength: route.path.length,
        detection: detected[guardian.id],
        sightRadius: policy.sightRadius,
        committed: false,
      });
    }
    handled.add(guardian.id);
  }

  ai.stats.nodesExplored += nodesExplored;
  if (coordinated) ai.stats.coordinationEvents++;

  const fairnessNote =
    withheldCount > 0
      ? ` ${withheldCount} intercept attempt${withheldCount === 1 ? "" : "s"} were withheld this cycle because they could not beat Odysseus there or would have sealed his last route.`
      : "";

  logEvent(ai, view.at, "evaluate", candidates.map(c => `${c.action} ${c.score}`).join("  "));

  // No guardian had anything fresh to decide (every one is mid-ambush, or
  // there are none at all): nothing beats holding, and argmax needs a
  // non-empty list to be meaningful.
  if (candidates.length === 0) {
    const decision = commitDecision(ai, view.at, {
      algorithm,
      state: "observing",
      observations,
      memory,
      candidates: [{ action: "squad:hold", score: 1, note: "every guardian is already committed to an earlier assignment" }],
      selectedAction: "Hold — every guardian is already committed",
      selectedCandidate: "squad:hold",
      reason:
        view.guardians.length === 0
          ? "No guardians patrol this garden."
          : "Every guardian is still travelling to an assignment made on an earlier cycle; fairness rule 1 forbids reconsidering them before they arrive.",
    });
    ai.committed = null;
    ai.commitRemaining = 0;
    void roll;
    return { kind: "patrol", guardians: plans, decisionId: decision.id };
  }

  const winner = argmax(candidates);
  const winnerId = Number(winner.action.slice(1, winner.action.indexOf(":")));
  const winnerKind: GuardianRole = winner.action.endsWith(":intercept")
    ? "intercept"
    : winner.action.endsWith(":pursue")
      ? "pursue"
      : "patrol";
  const winnerPlan = plans.find(p => p.id === winnerId);

  if (winnerKind === "intercept" && winnerPlan) {
    const confidence = forecastComputed ? clamp01(routeTrust) : undefined;
    const commitMs = winnerPlan.pathLength * policy.stepMs;
    const reason = `Guardian ${winnerId} ${winner.note}. Odysseus${view.carrying ? " is carrying a rescued sailor, raising the stakes, and" : ""} heads toward (${shipRoute.path.at(-1)?.x ?? SHIP_TILE.x}, ${shipRoute.path.at(-1)?.y ?? SHIP_TILE.y}) along a ${shipRoute.path.length}-step route; the model gives his assumed next step ${pct(forecastProbability)} confidence${forecastGrounded ? "" : " (thin history)"} and that direction a ${pct(routeWeakness)} capture rate.${fairnessNote}`;
    const finalEscapes = escapeRoutes(view.player, sealed).length;
    const decision = commitDecision(ai, view.at, {
      algorithm,
      state: (forecastGrounded ? "predicting" : "preparing") as AIState,
      observations,
      memory,
      candidates,
      selectedAction: `Intercept at (${winnerPlan.target.x}, ${winnerPlan.target.y})`,
      selectedCandidate: winner.action,
      target: `(${winnerPlan.target.x}, ${winnerPlan.target.y})`,
      ...(confidence === undefined ? {} : { confidence }),
      reason,
      commitMs,
      safety: { escapes: finalEscapes, actionFree: finalEscapes },
    });
    winnerPlan.decisionId = decision.id;
    ai.committed = decision;
    ai.commitRemaining = commitMs;
    ai.stats.attacks++;
    if (confidence !== undefined) ai.stats.predictions++;
    logEvent(
      ai,
      view.at,
      "telegraph",
      `Guardian ${winnerId} commits to (${winnerPlan.target.x}, ${winnerPlan.target.y}) — locked for ${ms(commitMs)}`,
      decision.id,
    );
    void roll;
    return { kind: "intercept", guardians: plans, leadGuardianId: winnerId, commitMs, decisionId: decision.id };
  }

  if (winnerKind === "pursue" && winnerPlan) {
    const decision = commitDecision(ai, view.at, {
      algorithm,
      state: "pursuing",
      observations,
      memory,
      candidates,
      selectedAction: `Guardian ${winnerId} pursues Odysseus directly`,
      selectedCandidate: winner.action,
      target: `(${winnerPlan.target.x}, ${winnerPlan.target.y})`,
      reason: `Guardian ${winnerId} ${winner.note}.${fairnessNote}`,
      commitMs: policy.stepMs,
    });
    winnerPlan.decisionId = decision.id;
    ai.committed = decision;
    ai.commitRemaining = policy.stepMs;
    void roll;
    return { kind: "pursue", guardians: plans, decisionId: decision.id };
  }

  const decision = commitDecision(ai, view.at, {
    algorithm,
    state: "observing",
    observations,
    memory,
    candidates,
    selectedAction: "Hold the patrol",
    selectedCandidate: winner.action,
    reason: warded
      ? `Odysseus is warded for ${Math.ceil(view.protectionMs / 1000)}s; no guardian could catch him, so the squad keeps its fixed rounds.${fairnessNote}`
      : !policy.pursues
        ? "This difficulty never tracks Odysseus; the squad only walks its fixed waypoint loop."
        : `No guardian's sight radius reaches Odysseus this cycle; the squad continues its rounds.${fairnessNote}`,
  });
  ai.committed = null;
  ai.commitRemaining = 0;
  void roll;
  return { kind: "patrol", guardians: plans, decisionId: decision.id };
}

/**
 * Called once a guardian's assignment resolves — it reached its target tile,
 * or caught Odysseus before that.
 *
 * `_model` is kept, unused, for signature parity with the other controllers'
 * learn functions (see cyclops.ts's `learnFromThrow`); the direction counts it
 * would feed are owned by the engine's own `observeResolution` call, the same
 * separation cyclops.ts documents for lane escapes.
 */
export function learnFromGuardian(
  ai: AIRuntime,
  _model: PlayerModel,
  at: number,
  decisionId: string,
  guardianId: number,
  captured: boolean,
  actualTile: Tile,
) {
  const decision: AIDecision | undefined = ai.decisions.find(d => d.id === decisionId);
  if (decision && !decision.outcome) {
    decision.outcome = captured ? "hit" : "dodged";
    decision.outcomeNote = captured
      ? `Guardian ${guardianId} caught Odysseus at (${actualTile.x}, ${actualTile.y})`
      : `Guardian ${guardianId} arrived, but Odysseus had already moved on to (${actualTile.x}, ${actualTile.y})`;
    if (captured) ai.stats.attacksLanded++;
    // The forecast staked a direction, not a capture outright; it is scored
    // on whether it leaned the way this round actually went, which is the
    // only claim a single round can honestly settle — the same convention
    // sirens.ts uses for its own miss forecast.
    if (decision.confidence !== undefined && (decision.confidence >= 0.5) === captured) ai.stats.predictionsCorrect++;
  }
  ai.state = "adapting";
  logEvent(
    ai,
    at,
    "learn",
    `${captured ? "Captured" : "Evaded"} — guardian ${guardianId} resolved at (${actualTile.x}, ${actualTile.y})`,
    decisionId,
  );
}
