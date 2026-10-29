// Cyclops' Cave — three-lane perspective runner.
//
// The world is measured in metres ahead of Odysseus, not in milliseconds of
// countdown. Every entity carries a `z` distance that shrinks as he runs, which
// is what lets the renderer place it with a real perspective divide and what
// lets the AI reason about "the layout at impact" rather than about timers.
//
// The engine is a pure reducer: `newCave`, `caveAction`, `tickCave`. It holds
// only plain data so `structuredClone` works and so a seeded run replays
// exactly. Decorative effects are derived by the renderer from the event stamps
// this state exposes; the simulation never stores particles.

import {
  byTier,
  newRuntime,
  tierOf,
  type AIRuntime,
  type Difficulty,
} from "../ai/types.ts";
import {
  newPlayerModel,
  observeChoice,
  observeDwell,
  observeReaction,
  observeResolution,
  type PlayerModel,
} from "../ai/player-model.ts";
import {
  decideCave,
  LANE_CHANGE_MS,
  laneName,
  learnFromThrow,
  type CaveAction,
  type CavePerception,
  type CaveZone,
} from "../ai/cyclops.ts";
import type { AttemptSummary, OpponentPlan } from "../arcade/arcade.ts";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Metres ahead where entities enter the world. Matches the render horizon. */
export const SPAWN_Z = 96;
/** Lane half-spacing in world units. */
export const LANE_SPAN = 1;
export const JUMP_MS = 700;
export const SLIDE_MS = 600;
/** Grace window after leaving the ground where a jump still registers. */
export const COYOTE_MS = 90;
/** How long an early jump press is remembered. */
export const BUFFER_MS = 130;
/** Collision half-depth in metres: how deep the hit band around z=0 is. */
export const HIT_DEPTH = 1.6;
/**
 * How close the runner's rendered position must be to a lane's centre to count
 * as standing in it, in lane units.
 *
 * Collisions are judged on where Odysseus actually appears, not on the lane he
 * has asked to move to. Exactly half way between two lanes he is in neither,
 * which is the familiar runner rule: commit early, or thread the gap.
 */
export const LANE_TOLERANCE = 0.5;
/** Starting chase distance in metres. */
export const START_GAP = 74;
/** Waves at the mouth of the cave that carry a single hazard, to teach. */
export const OPENING_WAVES = 2;
export const MAX_GAP = 108;

export type ObstacleKind =
  | "pillar" // fallen column: must change lane
  | "crate" // wooden crate: jump
  | "boulder" // rolling boulder: must change lane
  | "lowrock" // low rock shelf: jump
  | "beam" // overhead beam: slide
  | "debris" // falling ceiling rubble: jump or change lane
  | "fire" // flame vent: jump
  | "crack"; // cracked floor: jump

/** How each obstacle may be answered. Drives both rules and on-screen prompts. */
export const AVOIDANCE: Record<ObstacleKind, { jump: boolean; slide: boolean; prompt: string }> = {
  pillar: { jump: false, slide: false, prompt: "DODGE" },
  crate: { jump: true, slide: false, prompt: "JUMP" },
  boulder: { jump: false, slide: false, prompt: "DODGE" },
  lowrock: { jump: true, slide: false, prompt: "JUMP" },
  beam: { jump: false, slide: true, prompt: "SLIDE" },
  debris: { jump: true, slide: false, prompt: "JUMP" },
  fire: { jump: true, slide: false, prompt: "JUMP" },
  crack: { jump: true, slide: false, prompt: "JUMP" },
};

export type Obstacle = {
  id: number;
  lane: number;
  kind: ObstacleKind;
  z: number;
  /** Set once the player has passed it, so it scores and collides only once. */
  resolved: boolean;
  /** Seeded per entity so the renderer can vary art without storing art. */
  variant: number;
};

export type Sheep = {
  id: number;
  lane: number;
  z: number;
  /** Lateral wander within the lane, in world units. */
  drift: number;
  taken: boolean;
  variant: number;
};

export type Coin = { id: number; lane: number; z: number; taken: boolean };

export type Boulder = {
  id: number;
  lane: number;
  /** ms elapsed of its flight. */
  t: number;
  total: number;
  decisionId: string;
  resolved: boolean;
};

export type CyclopsEntity = {
  /** Metres behind Odysseus. */
  gap: number;
  state: "chasing" | "winding" | "throwing" | "recovering" | "roaring";
  /** ms left in the current state. */
  timer: number;
  /** ms since the roar began, for the renderer's mouth animation. */
  roarAt: number;
  /** Target lane of the throw being wound up, or -1. */
  windLane: number;
  windTotal: number;
  decisionId: string;
  /** Rises as the player loses ground; drives animation intensity and audio. */
  aggression: number;
  /** Footfall phase in ms, so steps and screen-thud stay in sync. */
  stride: number;
};

export type CaveState = {
  id: "cyclops";
  difficulty: Difficulty;
  plan: OpponentPlan;
  practice: boolean;
  seed: number;
  elapsed: number;
  duration: number;
  done: boolean;
  won: boolean;
  feedback: string;
  rivalLine: string;

  // Scoring, shared with the rest of the arcade.
  score: number;
  rivalScore: number;
  hits: number;
  damageTaken: number;
  successes: number;
  misses: number;
  combo: number;
  bestCombo: number;
  invulnerable: number;

  // Runner body.
  lane: number;
  /** Rendered lane position, tweened toward `lane`. */
  laneX: number;
  /** ms remaining of the current lane change. */
  changing: number;
  jump: number;
  slide: number;
  grounded: boolean;
  coyote: number;
  buffer: number;
  /** Metres travelled. */
  distance: number;
  speed: number;

  // World.
  obstacles: Obstacle[];
  sheep: Sheep[];
  coins: Coin[];
  boulders: Boulder[];
  cyclops: CyclopsEntity;
  nextId: number;
  spawnZ: number;
  wave: number;
  zone: CaveZone;

  // Collectibles and bonuses.
  sheepSaved: number;
  coinsTaken: number;
  precision: number;

  // Presentation stamps. The renderer derives particles and shake from these.
  shake: number;
  hitstop: number;
  flash: number;
  landedAt: number;
  pickupAt: number;
  struckAt: number;
  /** Floating callouts the HUD animates. Capped. */
  pops: { at: number; text: string; good: boolean; lane: number }[];

  // Explainable AI.
  ai: AIRuntime;
  model: PlayerModel;
  /** ms until the next decision cycle. */
  think: number;
  /** When the current telegraph locked, for measuring the player's reaction. */
  lockedAt: number;
  /** Whether the player has already answered the current telegraph. */
  answered: boolean;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** Whether the runner's rendered position puts him inside `lane`. */
export const occupiesLane = (s: Pick<CaveState, "laneX">, lane: number) =>
  Math.abs(s.laneX - (lane - 1) * LANE_SPAN) < LANE_TOLERANCE;

function random(s: CaveState) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}

export function zoneFor(progress: number): CaveZone {
  return progress < 0.4 ? "cave" : progress < 0.78 ? "collapse" : "daylight";
}

export function newCave(
  difficulty: Difficulty,
  plan: OpponentPlan,
  practice = false,
  seed = 4200,
): CaveState {
  if (!["easy", "normal", "hard"].includes(difficulty)) throw new Error("Unsupported encounter difficulty");
  const tier = tierOf(difficulty);
  return {
    id: "cyclops",
    difficulty,
    plan: { ...plan },
    practice,
    seed,
    elapsed: 0,
    duration: practice ? 32000 : byTier(difficulty, 95000, 88000, 82000),
    done: false,
    won: false,
    feedback: "Run for the daylight. Change lanes, jump the crates, slide under the beams.",
    rivalLine: "Polyphemus hears you. Every throw is announced before it lands.",
    score: 0,
    rivalScore: 0,
    hits: 0,
    damageTaken: 0,
    successes: 0,
    misses: 0,
    combo: 0,
    bestCombo: 0,
    invulnerable: 0,
    lane: 1,
    laneX: 0,
    changing: 0,
    jump: 0,
    slide: 0,
    grounded: true,
    coyote: COYOTE_MS,
    buffer: 0,
    distance: 0,
    speed: byTier(difficulty, 15, 17.5, 19.5),
    obstacles: [],
    sheep: [],
    coins: [],
    boulders: [],
    cyclops: {
      gap: START_GAP,
      state: "chasing",
      timer: 0,
      roarAt: -9999,
      windLane: -1,
      windTotal: 0,
      decisionId: "",
      aggression: 0,
      stride: 0,
    },
    nextId: 1,
    spawnZ: SPAWN_Z,
    wave: 0,
    zone: "cave",
    sheepSaved: 0,
    coinsTaken: 0,
    precision: 0,
    shake: 0,
    hitstop: 0,
    flash: 0,
    landedAt: -9999,
    pickupAt: -9999,
    struckAt: -9999,
    pops: [],
    ai: newRuntime("polyphemus", "Polyphemus", tier === 2 ? "Markov lane forecast + utility choice" : tier === 1 ? "Lane tracking (current position)" : "Reactive rotation (fixed sequence)"),
    model: newPlayerModel(3, 1),
    // Nothing is thrown until the runner has met a hazard or two. The grace is
    // longer on the gentler difficulties.
    think: byTier(difficulty, 7000, 5400, 4200),
    lockedAt: -1,
    answered: true,
  };
}

export const caveProgress = (s: CaveState) => clamp(s.elapsed / s.duration, 0, 1);

function pop(s: CaveState, text: string, good: boolean, lane = s.lane) {
  s.pops.push({ at: s.elapsed, text, good, lane });
  if (s.pops.length > 6) s.pops.shift();
}

function reward(s: CaveState, points: number, text?: string) {
  s.score += points;
  s.successes++;
  s.combo++;
  s.bestCombo = Math.max(s.combo, s.bestCombo);
  if (text) pop(s, text, true);
}

function damage(s: CaveState, message: string) {
  if (s.invulnerable > 0) return false;
  s.hits++;
  s.damageTaken++;
  s.combo = 0;
  s.invulnerable = 1500;
  s.feedback = message;
  s.shake = Math.max(s.shake, 420);
  s.hitstop = 110;
  s.flash = 320;
  s.struckAt = s.elapsed;
  s.cyclops.gap = Math.max(0, s.cyclops.gap - 16);
  pop(s, "HIT", false);
  if (s.hits >= 3) finish(s, false, "Polyphemus closes his hand around the dark. Watch the locked lane and move early.");
  return true;
}

function finish(s: CaveState, won: boolean, message: string) {
  s.done = true;
  s.won = won;
  s.feedback = message;
  if (won) s.score += Math.max(0, 3 - s.hits) * 180 + s.sheepSaved * 40;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

/**
 * Patterns are chosen so at least one lane is always answerable. Each entry
 * lists obstacles by lane offset from a base lane; the validator below proves
 * a survivable route exists before anything is committed to the world.
 */
type Pattern = { lanes: { lane: number; kind: ObstacleKind }[]; sheepLane?: number; coinLane?: number };

function buildPattern(s: CaveState, tier: number): Pattern {
  const r = random(s);
  const base = Math.floor(random(s) * 3);
  // The first waves teach one idea at a time: a single hazard, two lanes open,
  // and a sheep alongside so the pickup is learnt before it is needed.
  if (s.wave < OPENING_WAVES) {
    return {
      lanes: [{ lane: base, kind: s.wave === 0 ? "crate" : "pillar" }],
      sheepLane: (base + 1) % 3,
      coinLane: (base + 2) % 3,
    };
  }
  const jumpKinds: ObstacleKind[] = ["crate", "lowrock", "crack", "fire"];
  const jumpKind = jumpKinds[Math.floor(random(s) * jumpKinds.length)];
  const blockKinds: ObstacleKind[] = ["pillar", "boulder", "debris"];
  const blockKind = blockKinds[Math.floor(random(s) * blockKinds.length)];

  // A single hazard: always trivially survivable.
  if (r < 0.34 || tier === 0) {
    return { lanes: [{ lane: base, kind: random(s) < 0.5 ? jumpKind : blockKind }], sheepLane: (base + 1) % 3, coinLane: (base + 2) % 3 };
  }
  // Two lanes blocked, one lane free. The free lane is the counterplay.
  if (r < 0.68) {
    const free = base;
    const blocked = [0, 1, 2].filter(l => l !== free);
    return {
      lanes: blocked.map((lane, i) => ({ lane, kind: i === 0 ? blockKind : jumpKind })),
      sheepLane: free,
    };
  }
  // All three lanes carry something, but at least one is answerable in place
  // (a beam to slide under or a crate to jump). Hard tier only.
  if (tier === 2) {
    const soft = base;
    return {
      lanes: [0, 1, 2].map(lane => ({ lane, kind: lane === soft ? (random(s) < 0.5 ? "beam" : jumpKind) : blockKind })),
      coinLane: soft,
    };
  }
  return { lanes: [{ lane: base, kind: "beam" }, { lane: (base + 2) % 3, kind: blockKind }], sheepLane: (base + 1) % 3 };
}

/**
 * Lanes Odysseus could still survive, given a layout and the lanes a boulder
 * has already claimed.
 *
 * A lane is survivable when no boulder owns it and it is either empty or
 * carries a hazard that a jump or a slide clears. Where two hazards share a
 * lane the harsher one decides, so the check can never be talked into
 * optimism.
 */
export function survivableLanes(lanes: { lane: number; kind: ObstacleKind }[], reserved: number[] = []): number[] {
  const occupied = new Map<number, ObstacleKind>();
  for (const entry of lanes) {
    const existing = occupied.get(entry.lane);
    const answerable = AVOIDANCE[entry.kind].jump || AVOIDANCE[entry.kind].slide;
    if (!existing || !answerable) occupied.set(entry.lane, entry.kind);
  }
  const out: number[] = [];
  for (let lane = 0; lane < 3; lane++) {
    if (reserved.includes(lane)) continue;
    const kind = occupied.get(lane);
    if (!kind || AVOIDANCE[kind].jump || AVOIDANCE[kind].slide) out.push(lane);
  }
  return out;
}

/** Nothing reaches the world until this passes. */
export const patternIsFair = (pattern: Pattern, reserved: number[] = []) =>
  survivableLanes(pattern.lanes, reserved).length > 0;

/** Lanes a locked telegraph or an in-flight boulder has already claimed. */
export function reservedLanes(s: CaveState): number[] {
  const out = new Set<number>();
  for (const b of s.boulders) if (!b.resolved) out.add(b.lane);
  if (s.cyclops.state === "winding" && s.cyclops.windLane >= 0) out.add(s.cyclops.windLane);
  return [...out];
}

function spawnWave(s: CaveState) {
  const tier = tierOf(s.difficulty);
  // A boulder already owns its lane. The spawner is the later actor, so it is
  // the spawner's job to leave the runner somewhere to go: this is what stops
  // a wave closing the two lanes a thrown boulder has not claimed.
  const reserved = reservedLanes(s);
  let pattern = buildPattern(s, tier);
  // Reject-and-retry keeps the guarantee without hand-maintaining a table.
  for (let attempt = 0; attempt < 8 && !patternIsFair(pattern, reserved); attempt++) pattern = buildPattern(s, tier);
  if (!patternIsFair(pattern, reserved)) {
    // Trim the wave down to something survivable rather than shipping a trap.
    // Un-answerable hazards go first, since they are the ones closing lanes.
    const trimmed = [...pattern.lanes].sort(
      (a, b) =>
        Number(AVOIDANCE[a.kind].jump || AVOIDANCE[a.kind].slide) - Number(AVOIDANCE[b.kind].jump || AVOIDANCE[b.kind].slide),
    );
    while (trimmed.length > 0 && survivableLanes(trimmed, reserved).length === 0) trimmed.shift();
    pattern = { ...pattern, lanes: trimmed };
  }

  for (const entry of pattern.lanes) {
    s.obstacles.push({
      id: s.nextId++,
      lane: entry.lane,
      kind: entry.kind,
      z: s.spawnZ,
      resolved: false,
      variant: Math.floor(random(s) * 4),
    });
  }
  // A sheep every few waves, and more often when the player is hurt.
  const wantSheep = pattern.sheepLane !== undefined && (s.wave % 3 === 1 || (s.hits > 0 && s.wave % 2 === 1));
  if (wantSheep && pattern.sheepLane !== undefined) {
    s.sheep.push({ id: s.nextId++, lane: pattern.sheepLane, z: s.spawnZ + 6, drift: 0, taken: false, variant: Math.floor(random(s) * 3) });
  }
  if (pattern.coinLane !== undefined && s.wave % 2 === 0) {
    s.coins.push({ id: s.nextId++, lane: pattern.coinLane, z: s.spawnZ + 3, taken: false });
  }
  s.wave++;
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

export type CaveInput = { type: "move"; dx: number } | { type: "jump" } | { type: "slide" };

export function caveAction(state: CaveState, input: CaveInput): CaveState {
  if (state.done) return state;
  const s = structuredClone(state);
  if (input.type === "move" && input.dx) {
    const next = clamp(s.lane + Math.sign(input.dx), 0, 2);
    if (next !== s.lane) {
      s.lane = next;
      s.changing = LANE_CHANGE_MS;
      observeChoice(s.model, next);
      // Reaction timing is only meaningful against a telegraph that has locked.
      if (!s.answered && s.lockedAt >= 0) {
        observeReaction(s.model, s.elapsed - s.lockedAt);
        s.answered = true;
      }
    }
    return s;
  }
  if (input.type === "jump") {
    if (s.slide > 0) s.slide = 0;
    if (s.jump > 0 || (!s.grounded && s.coyote <= 0)) {
      s.buffer = BUFFER_MS;
      return s;
    }
    s.jump = JUMP_MS;
    s.grounded = false;
    s.coyote = 0;
    s.buffer = 0;
    if (!s.answered && s.lockedAt >= 0) {
      observeReaction(s.model, s.elapsed - s.lockedAt);
      s.answered = true;
    }
    return s;
  }
  if (s.jump > 0) {
    // Air-slide ends the jump early and lands into a slide, which reads well
    // and gives a way out of a mistimed hop.
    s.jump = 0;
    s.grounded = true;
    s.landedAt = s.elapsed;
  }
  if (s.slide <= 0) {
    s.slide = SLIDE_MS;
    if (!s.answered && s.lockedAt >= 0) {
      observeReaction(s.model, s.elapsed - s.lockedAt);
      s.answered = true;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Perception
// ---------------------------------------------------------------------------

/** Metres to the nearest obstacle in each lane that no jump or slide answers. */
export function laneBlockedDistances(s: CaveState): number[] {
  const out = [Infinity, Infinity, Infinity];
  for (const o of s.obstacles) {
    if (o.resolved || o.z < 0) continue;
    if (AVOIDANCE[o.kind].jump || AVOIDANCE[o.kind].slide) continue;
    if (o.z < out[o.lane]) out[o.lane] = o.z;
  }
  return out;
}

/** Metres to the nearest obstacle of any kind in each lane. */
export function laneClearDistances(s: CaveState): number[] {
  const out = [Infinity, Infinity, Infinity];
  for (const o of s.obstacles) {
    if (o.resolved || o.z < 0) continue;
    if (o.z < out[o.lane]) out[o.lane] = o.z;
  }
  return out;
}

/**
 * Every hazard ahead, grouped by lane and ordered nearest first.
 *
 * The opponent needs each hazard's own distance, not just the nearest, so it
 * can tell a hazard that shares a boulder's arrival from one the runner passes
 * long before or long after.
 */
export function laneHazardList(s: CaveState): { z: number; answerable: boolean }[][] {
  const out: { z: number; answerable: boolean }[][] = [[], [], []];
  for (const o of s.obstacles) {
    if (o.resolved || o.z < 0) continue;
    const rule = AVOIDANCE[o.kind];
    out[o.lane].push({ z: o.z, answerable: rule.jump || rule.slide });
  }
  for (const lane of out) lane.sort((a, b) => a.z - b.z);
  return out;
}

export function perceive(s: CaveState): CavePerception {
  const targeted = [false, false, false];
  for (const b of s.boulders) if (!b.resolved) targeted[b.lane] = true;
  if (s.cyclops.state === "winding" && s.cyclops.windLane >= 0) targeted[s.cyclops.windLane] = true;
  return {
    at: s.elapsed,
    lane: s.lane,
    laneProgress: s.changing > 0 ? 1 - s.changing / LANE_CHANGE_MS : 0,
    airborne: s.jump > 0,
    sliding: s.slide > 0,
    gap: s.cyclops.gap,
    speed: s.speed,
    lives: Math.max(0, 3 - s.hits),
    laneBlocked: laneBlockedDistances(s),
    laneClear: laneClearDistances(s),
    laneHazards: laneHazardList(s),
    laneTargeted: targeted,
    zone: s.zone,
    remainingMs: Math.max(0, s.duration - s.elapsed),
  };
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

function applyAction(s: CaveState, action: CaveAction) {
  const c = s.cyclops;
  if (action.kind === "boulder") {
    c.state = "winding";
    c.timer = action.commitMs;
    c.windTotal = action.commitMs;
    c.windLane = action.lane;
    c.decisionId = action.decisionId;
    s.lockedAt = s.elapsed;
    s.answered = false;
    s.rivalLine = `Polyphemus hefts a boulder toward the ${laneName(action.lane).toLowerCase()} lane.`;
  } else if (action.kind === "roar") {
    c.state = "roaring";
    c.timer = action.commitMs;
    c.roarAt = s.elapsed;
    s.rivalLine = "A roar fills the passage. Dust falls from the ceiling.";
  } else if (action.kind === "sprint") {
    c.state = "chasing";
    c.timer = action.commitMs;
    c.gap = Math.max(10, c.gap - 9);
    s.rivalLine = "Heavy footfalls gain on you. Keep your speed.";
  } else {
    c.state = "chasing";
    c.timer = 400;
    s.rivalLine = "Polyphemus listens, waiting for a fair opening.";
  }
}

function resolveBoulder(s: CaveState, b: Boulder) {
  b.resolved = true;
  const hit = occupiesLane(s, b.lane);
  // Clearing the marked lane with the change still in flight is the tightest
  // legal answer, and it scores as one.
  const grazing = !hit && s.changing > 0 && s.lane === b.lane;
  observeResolution(s.model, b.lane, !hit);
  if (hit) {
    damage(s, `The boulder lands in the ${laneName(b.lane).toLowerCase()} lane. Leave the marked lane before it falls.`);
  } else {
    reward(s, grazing ? 220 : 160, grazing ? "+220 LATE DODGE" : "+160 DODGE");
    s.cyclops.gap = Math.min(MAX_GAP, s.cyclops.gap + 4);
    s.feedback = grazing ? "Out of the lane with nothing to spare." : "The boulder cracks the stone behind you.";
  }
  s.shake = Math.max(s.shake, hit ? 420 : 240);
  // Stage 6 scores the forecast against where Odysseus actually was.
  if (b.decisionId) learnFromThrow(s.ai, s.model, s.elapsed, b.decisionId, b.lane, s.lane, hit);
}

function resolveObstacle(s: CaveState, o: Obstacle) {
  o.resolved = true;
  const rule = AVOIDANCE[o.kind];
  const sameLane = occupiesLane(s, o.lane);
  if (!sameLane) {
    reward(s, 100, "+100");
    observeResolution(s.model, o.lane, true);
    return;
  }
  const cleared = (rule.jump && s.jump > 0) || (rule.slide && s.slide > 0);
  if (cleared) {
    s.precision++;
    reward(s, 200, "+200 PRECISE");
    s.feedback = rule.slide ? "Under the beam with room to spare." : "Clean vault. Keep your rhythm.";
    observeResolution(s.model, o.lane, true);
    return;
  }
  observeResolution(s.model, o.lane, false);
  damage(s, `${o.kind === "beam" ? "The beam catches your shoulders — slide under it." : `A ${o.kind} stops you — ${rule.jump ? "jump it" : "change lanes"}.`}`);
}

export function tickCave(state: CaveState, delta: number): CaveState {
  if (state.done || !Number.isFinite(delta) || delta <= 0) return state;
  const s = structuredClone(state);
  const dt = Math.min(100, delta);

  // Hit-stop freezes the world briefly on a heavy impact without stalling the
  // clock, which is what gives a hit its weight.
  if (s.hitstop > 0) {
    s.hitstop = Math.max(0, s.hitstop - dt);
    s.elapsed += dt;
    s.shake = Math.max(0, s.shake - dt);
    s.flash = Math.max(0, s.flash - dt);
    s.invulnerable = Math.max(0, s.invulnerable - dt);
    return s;
  }

  s.elapsed += dt;
  const progress = caveProgress(s);
  s.zone = zoneFor(progress);

  // Speed ramps across the escape so the final stretch feels desperate.
  const topSpeed = byTier(s.difficulty, 22, 25.5, 28.5);
  s.speed = clamp(s.speed + dt * 0.0011 * (s.zone === "daylight" ? 2.2 : 1), 0, topSpeed);
  const metres = (s.speed * dt) / 1000;
  s.distance += metres;

  // Body timers.
  s.invulnerable = Math.max(0, s.invulnerable - dt);
  s.shake = Math.max(0, s.shake - dt);
  s.flash = Math.max(0, s.flash - dt);
  s.changing = Math.max(0, s.changing - dt);
  s.laneX += ((s.lane - 1) * LANE_SPAN - s.laneX) * Math.min(1, dt / 90);
  if (s.changing <= 0) s.laneX = (s.lane - 1) * LANE_SPAN;

  if (s.jump > 0) {
    s.jump = Math.max(0, s.jump - dt);
    if (s.jump === 0) {
      s.grounded = true;
      s.coyote = COYOTE_MS;
      s.landedAt = s.elapsed;
    }
  } else {
    s.grounded = true;
    s.coyote = Math.max(0, s.coyote - dt);
  }
  s.slide = Math.max(0, s.slide - dt);
  // Buffered jump fires the instant it becomes legal.
  if (s.buffer > 0) {
    s.buffer = Math.max(0, s.buffer - dt);
    if (s.grounded && s.jump === 0) {
      s.jump = JUMP_MS;
      s.grounded = false;
      s.buffer = 0;
    }
  }

  observeDwell(s.model, s.lane, dt);

  // --- World scroll ------------------------------------------------------
  for (const o of s.obstacles) o.z -= metres;
  for (const sheepEntity of s.sheep) {
    sheepEntity.z -= metres;
    // A gentle wander makes the sheep read as a creature rather than an icon.
    sheepEntity.drift = Math.sin((s.elapsed / 620) + sheepEntity.id) * 0.18;
  }
  for (const coin of s.coins) coin.z -= metres;

  // --- Collisions at the player plane ------------------------------------
  for (const o of s.obstacles) {
    if (o.resolved || o.z > HIT_DEPTH) continue;
    resolveObstacle(s, o);
  }
  for (const sheepEntity of s.sheep) {
    if (sheepEntity.taken || sheepEntity.z > HIT_DEPTH) continue;
    if (occupiesLane(s, sheepEntity.lane) && s.jump <= 0) {
      sheepEntity.taken = true;
      s.sheepSaved++;
      s.hits = Math.max(0, s.hits - 1);
      s.cyclops.gap = Math.min(MAX_GAP, s.cyclops.gap + 10);
      s.pickupAt = s.elapsed;
      reward(s, 150, "+HEALTH");
      s.feedback = "A sheep of Polyphemus falls in beside you. One life restored.";
    } else if (sheepEntity.z < -2) {
      sheepEntity.taken = true;
    }
  }
  for (const coin of s.coins) {
    if (coin.taken || coin.z > HIT_DEPTH) continue;
    if (occupiesLane(s, coin.lane)) {
      coin.taken = true;
      s.coinsTaken++;
      s.pickupAt = s.elapsed;
      reward(s, 60, "+60");
    } else if (coin.z < -2) {
      coin.taken = true;
    }
  }
  s.obstacles = s.obstacles.filter(o => o.z > -14);
  s.sheep = s.sheep.filter(x => x.z > -10 && !(x.taken && x.z < HIT_DEPTH - 1));
  s.coins = s.coins.filter(c => c.z > -8 && !(c.taken && c.z < HIT_DEPTH - 1));
  s.pops = s.pops.filter(p => s.elapsed - p.at < 1100);

  // --- Spawning ----------------------------------------------------------
  // Spacing is expressed in metres so a faster runner still gets the same
  // reaction distance, which is what keeps the ramp fair.
  const spacing = byTier(s.difficulty, 46, 40, 35) * (s.zone === "collapse" ? 0.88 : 1);
  const furthest = s.obstacles.reduce((max, o) => Math.max(max, o.z), -Infinity);
  if (!Number.isFinite(furthest) || s.spawnZ - furthest >= spacing) spawnWave(s);

  // --- Cyclops body ------------------------------------------------------
  const c = s.cyclops;
  c.stride = (c.stride + dt * (1 + c.aggression * 0.5)) % 1000;
  c.aggression = clamp(1 - (c.gap - 14) / (START_GAP - 14), 0, 1);
  // He loses a little ground to a clean runner and gains on a stumbling one.
  c.gap = clamp(c.gap + (s.combo >= 3 ? 0.0016 : -0.0012) * dt * (s.zone === "daylight" ? 1.6 : 1), 0, MAX_GAP);
  if (c.timer > 0) c.timer = Math.max(0, c.timer - dt);

  if (c.state === "winding") {
    if (c.timer <= 0) {
      s.boulders.push({
        id: s.nextId++,
        lane: c.windLane,
        t: 0,
        total: byTier(s.difficulty, 900, 780, 700),
        decisionId: c.decisionId,
        resolved: false,
      });
      c.state = "throwing";
      c.timer = 320;
      c.windLane = -1;
      s.ai.state = "attacking";
      s.ai.commitRemaining = 0;
    } else {
      s.ai.commitRemaining = c.timer;
    }
  } else if ((c.state === "throwing" || c.state === "roaring") && c.timer <= 0) {
    c.state = "recovering";
    c.timer = byTier(s.difficulty, 700, 520, 420);
    s.ai.state = "recovering";
  } else if (c.state === "recovering" && c.timer <= 0) {
    c.state = "chasing";
    s.ai.state = "observing";
  }

  for (const b of s.boulders) {
    // A landed boulder keeps ageing, so it leaves the state once its dust has
    // settled instead of being carried for the rest of the run.
    b.t += dt;
    if (!b.resolved && b.t >= b.total) resolveBoulder(s, b);
  }
  s.boulders = s.boulders.filter(b => !b.resolved || b.t < b.total + 500);

  // --- Decision cycle ---------------------------------------------------
  s.think -= dt;
  const idle = c.state === "chasing" || c.state === "recovering";
  if (s.think <= 0 && idle && !s.done) {
    const action = decideCave(
      s.ai,
      s.model,
      perceive(s),
      s.difficulty,
      s.plan.source === "ai",
      s.wave,
      () => random(s),
    );
    applyAction(s, action);
    s.think = byTier(s.difficulty, 3400, 2750, 2300);
  }

  // --- Conclusion -------------------------------------------------------
  if (!s.done && c.gap <= 0) finish(s, false, "Polyphemus catches you in the dark. Keep your lead by dodging early.");
  if (!s.done && s.elapsed >= s.duration) {
    finish(s, true, "Daylight. The cave mouth opens and the sea air takes you.");
  }
  return s;
}

export function caveStatus(s: CaveState) {
  return `${Math.round(caveProgress(s) * 100)}% to daylight · Chase gap ${Math.round(s.cyclops.gap)} m · ${s.sheepSaved} sheep`;
}

/** Project the run onto the arcade's shared attempt record. */
export function caveSummary(s: CaveState): AttemptSummary {
  return {
    won: s.done && s.won,
    source: s.plan.source,
    hits: clamp(Math.round(s.damageTaken), 0, 100),
    successes: clamp(Math.round(s.successes), 0, 100),
    misses: clamp(Math.round(s.misses), 0, 100),
    early: 0,
    late: 0,
    laneMs: [0, 0, 0],
    score: clamp(Math.round(s.score), 0, 1000000),
    timeMs: clamp(Math.round(s.elapsed), 0, 3600000),
    difficulty: s.difficulty,
  };
}
