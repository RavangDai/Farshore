// Antinous: the archery-contest and palace-defence controller.
//
// One decision cycle runs at one of two moments, told apart by `view.stage`.
// During the contest Antinous aims his own shot and may lodge a block ring.
// Once the contest's turns are spent and the palace stage begins, the player
// aims directly at Antinous, who must read the live trajectory and find
// cover. Both moments share the six-stage pipeline: perceive the real state,
// remember what the player model has measured, evaluate every option into
// `candidates`, decide by argmax, telegraph a committed attack, and learn
// once it resolves. The controller owns no engine state and pulls in no
// engine module — `sampleTrajectory` below mirrors `archeryShot` in
// mythic.ts by hand, the way sirens.ts mirrors the engine's own song timers,
// so this file introduces no import cycle.
//
// Five fairness invariants hold on every difficulty:
//
//   1. A block shot is announced for `commitMs` before it lodges, and the
//      ring it targets is locked at that moment and never re-aimed — the
//      same telegraph invariant cyclops.ts states for its boulder throw.
//   2. A block shot is only ever thrown when a ring index is found that
//      narrows the player's own last line while leaving at least
//      `MIN_CLEAR_RINGS` ring reachable before it — verified by replaying
//      their last aim through the real trajectory, never assumed. Where no
//      ring index qualifies, or the score does not justify the trade, the
//      block is withheld and the candidate and the reason both say so.
//   3. Antinous never has perfect aim: every committed shot, on every tier,
//      carries an execution error bounded by `errorBoundDeg` and drawn from
//      `roll()`, and that bound is written into the decision — the aim a
//      tier searches for is never quite the shot that is actually loosed.
//   4. A block shot's strategic value is only ever weighed once the real
//      ring lead (`boardStrategy`) shows Antinous can afford the trade; a
//      comfortable lead is a precondition for proposing it, not a bonus
//      added after the fact.
//   5. In the palace stage, the cover station is read once per decision
//      cycle from the real predicted trajectory (and, on the hard tier, the
//      measured zone tendency) and stays committed for `commitMs` — never
//      re-rolled mid-cycle and never a coin flip standing in for a reason.

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
  type Tier,
} from "./types.ts";
import {
  observeChoice,
  observeResolution,
  predict,
  weakestOption,
  weaknessOf,
  type PlayerModel,
} from "./player-model.ts";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The three cover stations, named the way the room's three stations are set at the rings. */
export type Position = 0 | 1 | 2;
export const POSITION_NAMES = ["Left", "Centre", "Right"] as const;
export const positionName = (p: number) => POSITION_NAMES[p] ?? "Unknown";

/** Structurally identical to mythic.ts's `Aim`, declared here rather than imported (see header). */
export type IthacaAim = { aim: number; elevation: number; tension: number };

/** One sampled point of a trajectory, in the same units `archeryShot` reports. */
export type TrajectoryPoint = { x: number; y: number };

// ---------------------------------------------------------------------------
// Trajectory physics — a hand-kept mirror of mythic.ts's archeryShot/bestAim
// ---------------------------------------------------------------------------

/** Ring radius by tier, byte-for-byte the table `archeryShot` uses. */
const RING_RADIUS_BY_TIER: readonly [number, number, number] = [0.25, 0.19, 0.145];

/**
 * Mirrors `archeryShot` in mythic.ts exactly: the same 12-sample path, the
 * same contiguous-ring rule, the same radius-by-tier table and the same
 * block-ring shrink. If the engine's formula changes, this must change with
 * it — there is no import to keep the two in sync automatically.
 */
export function sampleTrajectory(
  aim: IthacaAim,
  wind: number,
  blockedRing: number,
  tier: Tier,
): { path: TrajectoryPoint[]; rings: number } {
  const path: TrajectoryPoint[] = [];
  let rings = 0;
  for (let i = 1; i <= 12; i++) {
    const z = i / 12;
    const x = aim.aim * 0.043 * z + wind * 0.009 * z * z * (75 / aim.tension);
    const y = aim.elevation * 0.04 * z + (aim.tension - 75) * 0.018 * z * z;
    path.push({ x, y });
    const radius = RING_RADIUS_BY_TIER[tier] * (blockedRing === i ? 0.58 : 1);
    if (rings === i - 1 && Math.hypot(x, y) <= radius) rings++;
  }
  return { path, rings };
}

/** Degrees that split the ±20° aim range into three equal zones, Left/Centre/Right. */
const ZONE_SPLIT_DEG = 20 / 3;

/** Which zone an aim angle represents, by the player's own stated intent — not by where wind later carries it. */
function zoneOfAim(aimDeg: number): Position {
  if (aimDeg < -ZONE_SPLIT_DEG) return 0;
  if (aimDeg > ZONE_SPLIT_DEG) return 2;
  return 1;
}

/** Lateral position of each cover station, in the same path units `sampleTrajectory` reports. */
const STATION_X: readonly [number, number, number] = [-0.75, 0, 0.75];

/** Distance beyond which a station reads as fully clear of a given landing point. Calibrated against the trajectory's own typical magnitude. */
const SAFETY_RADIUS = 1.05;

/** Real distance from a predicted landing point to a station. Lower = more exposed. Vertical miss counts for less than lateral, since the rings themselves are mostly a lateral spread. */
function exposureAt(point: TrajectoryPoint, station: Position): number {
  return Math.hypot(point.x - STATION_X[station], point.y * 0.4);
}

/** Exposure turned into a 0-100 safety score so every candidate here reads on the same "higher is better" scale as the rest of the contract. */
function safetyScore(exposure: number): number {
  return Math.round(clamp01(exposure / SAFETY_RADIUS) * 1000) / 10;
}

/**
 * The aim degrees that zero `sampleTrajectory`'s own x term at the final
 * sample — solved directly from that formula rather than searched for, which
 * is the real technique "wind compensation" names.
 */
function windCompensatedAim(wind: number, tension = 75): number {
  return -(wind * 0.009 * (75 / tension)) / 0.043;
}

/**
 * Mirrors `bestAim` in mythic.ts: the same tension×aim×elevation grid, scored
 * by the same rings-first, path-cost-second utility. `nodes` accumulates
 * every evaluation so the decision can report the search's real cost rather
 * than an estimate of it.
 */
function sweepAim(wind: number, tier: Tier, nodes: { count: number }): { aim: IthacaAim; value: number } {
  let best = -Infinity;
  let choice: IthacaAim = { aim: 0, elevation: 0, tension: 75 };
  for (let tension = 60; tension <= 90; tension += 5) {
    for (let aim = -15; aim <= 15; aim++) {
      for (let elevation = -7; elevation <= 7; elevation++) {
        nodes.count++;
        const { path, rings } = sampleTrajectory({ aim, elevation, tension }, wind, 0, tier);
        const value = rings * 100 - path.reduce((n, p) => n + Math.hypot(p.x, p.y), 0);
        if (value > best) {
          best = value;
          choice = { aim, elevation, tension };
        }
      }
    }
  }
  return { aim: choice, value: best };
}

/** Rings a block shot's cap still leaves reachable before the lodged ring, and the floor it must clear. */
export const BLOCK_SHOT_CAP = 6;
const MIN_BLOCK_RING = 2;
const MAX_BLOCK_RING = 11;
export const MIN_CLEAR_RINGS = 1;

/**
 * Which ring index, if lodged, costs the player's last line the most rings —
 * found by replaying their own aim through the real trajectory, rather than
 * picked at random the way the plain engine logic does. Assumes a similar
 * wind next turn, since the real figure has not been rolled yet; that
 * assumption is why this is presented as a strategic read, not a guarantee.
 */
function bestBlockRing(
  lastPlayerAim: IthacaAim,
  wind: number,
  tier: Tier,
  nodes: { count: number },
): { ring: number; clearRings: number; costRings: number } | null {
  const baseline = sampleTrajectory(lastPlayerAim, wind, 0, tier).rings;
  let bestRing = 0;
  let bestCost = 0;
  for (let ring = MIN_BLOCK_RING; ring <= MAX_BLOCK_RING; ring++) {
    // Fairness invariant 2, verified rather than assumed: a ring whose cap
    // would leave fewer than MIN_CLEAR_RINGS reachable is never a candidate,
    // even though the loop bounds already keep this true by construction.
    if (ring - 1 < MIN_CLEAR_RINGS) continue;
    nodes.count++;
    const cost = baseline - sampleTrajectory(lastPlayerAim, wind, ring, tier).rings;
    if (cost > bestCost) {
      bestCost = cost;
      bestRing = ring;
    }
  }
  return bestCost > 0 ? { ring: bestRing, clearRings: bestRing - 1, costRings: bestCost } : null;
}

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export type IthacaStage = "contest" | "palace";

export type IthacaPerception = {
  /** Simulation time in ms. */
  at: number;
  stage: IthacaStage;
  turn: number;
  totalTurns: number;
  /** Mirrors BowState's own phase name exactly. */
  phase: "player" | "rival" | "review";
  wind: number;
  score: number;
  rivalScore: number;
  /** The ring index a previous block shot narrowed for this shot. 0 = none. */
  blockedRing: number;
  /**
   * The aim as `s.aim` currently holds it: mid-draft while `phase ===
   * "player"`, and — since nothing touches it again until the player's next
   * turn — still exactly the aim behind their last shot throughout Antinous'
   * own turn and the review window that follows it.
   */
  playerAim: IthacaAim;
  /** Which of the three stations Antinous currently occupies. Meaningless before the palace stage begins. */
  antinousPosition: Position;
};

export type IthacaAction =
  | {
      kind: "shoot";
      aim: IthacaAim;
      path: TrajectoryPoint[];
      rings: number;
      /** Set only when this shot also lodges a block: the ring index (1-12) it narrows for the player's next shot. */
      blockRing?: number;
      /** The bound actually applied to this shot's execution error, in degrees either way. */
      errorBound: { aim: number; elevation: number };
      /** >0 only for a block shot: how long the ring is telegraphed before it lodges. */
      commitMs: number;
      decisionId: string;
    }
  | {
      kind: "dodge";
      from: Position;
      to: Position;
      /** The incoming shot's predicted path, sampled the same way `archeryShot` samples one. */
      path: TrajectoryPoint[];
      commitMs: number;
      decisionId: string;
    }
  | { kind: "hold"; commitMs: number; decisionId: string };

export type IthacaPolicy = {
  algorithm: string;
  /** ms a block shot (contest) or a cover move (palace) is telegraphed for. */
  commitMs: number;
  /** Degrees of execution error applied to every committed aim, on every tier. */
  errorBoundDeg: { aim: number; elevation: number };
  /** Whether the contest's aim selection is the full tension×aim×elevation sweep. */
  exhaustiveSearch: boolean;
  /** Whether aim selection reads the measured wind at all. */
  windAware: boolean;
  /** Whether a block shot is ever considered on this tier. */
  blockShotCapable: boolean;
  /** Whether the palace stage reads the predicted trajectory at all (false = fixed rotation). */
  coverAware: boolean;
  /** Whether the palace stage additionally reads the measured per-zone tendency. */
  predictive: boolean;
  /** Score bonus for staying put, before stations are compared. Large on medium (moves only when clearly threatened); zero on hard (always optimises). */
  holdBias: number;
};

/**
 * The adaptive flag promotes the normal tier to the hard tier's algorithm,
 * matching how cyclops.ts and sirens.ts both treat an AI-authored opponent
 * plan: a richer behaviour the player can still meet at normal difficulty,
 * not a fourth tier nobody picks directly.
 */
export function ithacaPolicy(difficulty: Difficulty, adaptive: boolean): IthacaPolicy {
  const tier = tierOf(difficulty);
  const promoted = tier === 2 || (adaptive && tier >= 1);
  const coverAware = tier >= 1 || adaptive;
  return {
    algorithm: promoted
      ? "Exhaustive tension×aim×elevation sweep with trajectory prediction and Markov zone forecasting"
      : coverAware
        ? "Wind-compensated aim solve with threshold-gated cover"
        : "Randomised aim jitter with fixed station rotation",
    commitMs: byTier(difficulty, 1400, 1100, 850),
    errorBoundDeg: { aim: byTier(difficulty, 2.5, 1.8, 1.2), elevation: byTier(difficulty, 1.8, 1.2, 0.8) },
    exhaustiveSearch: promoted,
    windAware: coverAware,
    blockShotCapable: promoted,
    coverAware,
    predictive: promoted,
    holdBias: promoted ? 0 : coverAware ? 25 : 0,
  };
}

/**
 * The algorithm actually in force this cycle.
 *
 * The hard tier's name claims a Markov zone forecast. Until a shot has been
 * observed there is nothing to forecast, so claiming it would be a lie; on
 * that path trajectory prediction alone is what decided, and the name says
 * so — the same honesty sirens.ts keeps for its own weighted tier.
 */
export function ithacaAlgorithm(policy: IthacaPolicy, model: PlayerModel): string {
  if (!policy.predictive) return policy.algorithm;
  return model.samples === 0
    ? "Exhaustive tension×aim×elevation sweep with trajectory prediction (zone forecasting idle — no shots observed yet)"
    : policy.algorithm;
}

export type BossStrategy = "press" | "balanced" | "guard";
export type BoardRead = { strategy: BossStrategy; lead: number; note: string };

/** Ring lead past which the board is read as comfortably won or lost. */
export const BOARD_LEAD_BAND = 3;

/**
 * Antinous' running read of the contest, from the real score difference
 * alone. This is what the block-shot gate is tested against, and what the
 * inspector shows as "the boss strategy for the turn" — never a mood, only a
 * number.
 */
export function boardStrategy(score: number, rivalScore: number): BoardRead {
  const lead = rivalScore - score;
  if (lead <= -BOARD_LEAD_BAND) {
    return { strategy: "press", lead, note: `trailing by ${-lead} ring${-lead === 1 ? "" : "s"} — no margin to spend on anything but scoring` };
  }
  if (lead >= BOARD_LEAD_BAND) {
    return { strategy: "guard", lead, note: `leading by ${lead} ring${lead === 1 ? "" : "s"} — can afford to trade rings for position` };
  }
  return { strategy: "balanced", lead, note: `within ${Math.abs(lead)} ring${Math.abs(lead) === 1 ? "" : "s"} — no margin either way` };
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

function perceptionReadings(view: IthacaPerception, board: BoardRead): Reading[] {
  const scoreline: Reading = { key: "score", label: "Contest score", value: `You ${view.score} · Antinous ${view.rivalScore}`, hint: board.note };
  const windReading: Reading = { key: "wind", label: "Wind", value: `${view.wind > 0 ? "+" : ""}${view.wind}` };
  if (view.stage === "contest") {
    return [
      { key: "turn", label: "Turn", value: `${view.turn} of ${view.totalTurns}` },
      scoreline,
      windReading,
      { key: "blocked", label: "Narrowed ring", value: view.blockedRing > 0 ? `Ring ${view.blockedRing}` : "none" },
      { key: "lastAim", label: "Your last shot", value: `${view.playerAim.aim}° aim · ${view.playerAim.elevation}° elevation · tension ${view.playerAim.tension}` },
    ];
  }
  return [
    scoreline,
    windReading,
    { key: "aim", label: view.phase === "player" ? "Your aim (live)" : "Your last aim", value: `${view.playerAim.aim}° aim · ${view.playerAim.elevation}° elevation` },
    { key: "station", label: "Antinous' position", value: positionName(view.antinousPosition) },
  ];
}

/**
 * `memory[0]` is kept the single most descriptive line on purpose, so the
 * "remember" stage can log it directly instead of re-deriving the same
 * sentence a second way.
 */
function memoryReadings(model: PlayerModel, policy: IthacaPolicy, stage: IthacaStage, lastZone: Position): Reading[] {
  if (stage === "contest") {
    return [{
      key: "scope",
      label: "Policy memory use",
      value: policy.blockShotCapable ? "none for aiming — the block-shot gate reads the score only" : "none — this difficulty does not read player history",
    }];
  }
  if (!policy.coverAware) {
    return [{ key: "scope", label: "Policy memory use", value: "none — fixed station rotation" }];
  }
  if (!policy.predictive) {
    return [{ key: "scope", label: "Policy memory use", value: "current trajectory only — no shot history read" }];
  }
  const forecast = predict(model, lastZone);
  const weak = weakestOption(model);
  const readings: Reading[] = [
    {
      key: "forecast",
      label: "Next-zone forecast",
      value: forecast.grounded ? `${positionName(forecast.option)} ${pct(forecast.probability)}` : "not yet grounded",
      hint: forecast.grounded ? "Markov transition from your last zone" : "fewer than 3 shots observed from this zone",
    },
    { key: "samples", label: "Shots observed", value: String(model.samples) },
  ];
  if (weak !== null) {
    const rate = weaknessOf(model, weak);
    readings.push({ key: "weak", label: "Most-exposed station", value: `${positionName(weak)}${rate === null ? "" : ` (${pct(rate)} hit rate)`}` });
  }
  return readings;
}

// ---------------------------------------------------------------------------
// Decision cycle
// ---------------------------------------------------------------------------

/**
 * Run one decision cycle.
 *
 * `tick` indexes the easy tier's fixed station rotation in the palace stage,
 * kept separate from the real turn counter the way sirens.ts keeps its own
 * rotation index separate from the round number. `roll` is the engine's
 * seeded RNG, consulted for the easy tier's aim jitter and for every tier's
 * bounded execution error (invariant 3) — never for anything the fairness
 * invariants depend on being provably safe.
 */
export function decideIthaca(
  ai: AIRuntime,
  model: PlayerModel,
  view: IthacaPerception,
  difficulty: Difficulty,
  adaptive: boolean,
  tick: number,
  roll: () => number,
): IthacaAction {
  const policy = ithacaPolicy(difficulty, adaptive);
  const algorithm = ithacaAlgorithm(policy, model);
  const tier = tierOf(difficulty);
  const board = boardStrategy(view.score, view.rivalScore);
  const lastZone = zoneOfAim(view.playerAim.aim);
  const observations = perceptionReadings(view, board);
  const memory = memoryReadings(model, policy, view.stage, lastZone);

  logEvent(
    ai,
    view.at,
    "perceive",
    view.stage === "contest"
      ? `Turn ${view.turn} of ${view.totalTurns}, wind ${view.wind}, score you ${view.score} – Antinous ${view.rivalScore}`
      : `Reading your aim (${positionName(lastZone)} zone), Antinous at ${positionName(view.antinousPosition)}`,
  );
  logEvent(ai, view.at, "remember", memory[0].value);

  const nodes = { count: 0 };

  // =====================================================================
  // Contest stage: Antinous takes his own shot, and may lodge a block.
  // =====================================================================
  if (view.stage === "contest") {
    let intendedAim: IthacaAim;
    let searchNote: string;
    if (policy.exhaustiveSearch) {
      const swept = sweepAim(view.wind, tier, nodes);
      intendedAim = swept.aim;
      searchNote = `best of ${nodes.count} tension×aim×elevation combinations swept`;
    } else if (policy.windAware) {
      intendedAim = { aim: Math.round(clamp(windCompensatedAim(view.wind), -15, 15)), elevation: 0, tension: 75 };
      searchNote = `aim solved directly against the current wind (${view.wind})`;
    } else {
      intendedAim = {
        aim: Math.round((roll() - 0.5) * 14),
        elevation: Math.round((roll() - 0.5) * 9),
        tension: Math.round(65 + roll() * 20),
      };
      searchNote = "rolled aim, judged with no wind term";
    }

    const judgingWind = policy.windAware ? view.wind : 0;
    const judged = sampleTrajectory(intendedAim, judgingWind, 0, tier);
    const pathCost = judged.path.reduce((n, p) => n + Math.hypot(p.x, p.y), 0);
    const preciseValue = judged.rings * 100 - pathCost;

    const candidates: Candidate[] = [
      { action: "precise", score: Math.round(preciseValue * 10) / 10, note: `${searchNote} → ${judged.rings} rings judged` },
    ];

    let block: { ring: number; clearRings: number; costRings: number } | null = null;
    if (policy.blockShotCapable) {
      if (board.strategy !== "guard") {
        candidates.push({
          action: "block",
          score: -1000,
          note: `${board.note} — not enough margin to cap this shot at ${BLOCK_SHOT_CAP} rings, withheld`,
        });
      } else {
        block = bestBlockRing(view.playerAim, view.wind, tier, nodes);
        if (!block) {
          candidates.push({ action: "block", score: -1000, note: `no ring narrows your last line while leaving ${MIN_CLEAR_RINGS} clear — withheld` });
        } else {
          const cappedRings = Math.min(BLOCK_SHOT_CAP, judged.rings);
          const blockValue = cappedRings * 100 - pathCost + block.costRings * 55;
          candidates.push({
            action: "block",
            score: Math.round(blockValue * 10) / 10,
            note: `caps this shot at ${cappedRings} ring${cappedRings === 1 ? "" : "s"} to lodge ring ${block.ring}, costing your last line ${block.costRings} ring${block.costRings === 1 ? "" : "s"} (${block.clearRings} still reachable before it)`,
          });
        }
      }
    }

    if (nodes.count > 0) ai.stats.nodesExplored += nodes.count;
    logEvent(ai, view.at, "evaluate", candidates.map(c => `${c.action} ${c.score}`).join("  "));

    const winner = argmax(candidates);
    const doBlock = winner.action === "block" && block !== null;

    // Fairness invariant 3: applied after the search, on every tier.
    const errorAim = (roll() - 0.5) * 2 * policy.errorBoundDeg.aim;
    const errorElevation = (roll() - 0.5) * 2 * policy.errorBoundDeg.elevation;
    const executedAim: IthacaAim = {
      aim: Math.round(clamp(intendedAim.aim + errorAim, -20, 20)),
      elevation: Math.round(clamp(intendedAim.elevation + errorElevation, -20, 20)),
      tension: Math.round(clamp(intendedAim.tension, 45, 100)),
    };
    const executed = sampleTrajectory(executedAim, view.wind, 0, tier);
    const rings = doBlock ? Math.min(BLOCK_SHOT_CAP, executed.rings) : executed.rings;

    const errorNote = `Execution error is bounded to ±${policy.errorBoundDeg.aim}° aim / ±${policy.errorBoundDeg.elevation}° elevation, drawn from roll().`;
    const reason = doBlock
      ? `${board.note}: Antinous pulls the shot, capping it at ${BLOCK_SHOT_CAP} rings to lodge an arrow at ring ${block!.ring}, which would have cost your last line ${block!.costRings} ring${block!.costRings === 1 ? "" : "s"} (${block!.clearRings} still reachable before it). ${errorNote}`
      : `${searchNote}, scoring ${Math.round(preciseValue * 10) / 10} judged ${policy.windAware ? "against the current wind" : "with no wind term"}.${policy.blockShotCapable ? ` ${board.note}.` : ""} ${errorNote}`;

    const decision = commitDecision(ai, view.at, {
      algorithm,
      state: policy.exhaustiveSearch ? "evaluating" : "preparing",
      observations,
      memory,
      candidates,
      selectedAction: doBlock ? `Block shot — lodge ring ${block!.ring}` : `Shoot (${rings} ring${rings === 1 ? "" : "s"})`,
      selectedCandidate: winner.action,
      ...(doBlock ? { target: `Ring ${block!.ring}` } : {}),
      reason,
      ...(doBlock ? { commitMs: policy.commitMs } : {}),
      // `escapes` counts the rings guaranteed reachable before the block;
      // `actionFree` the ones that remain merely possible after it.
      ...(doBlock ? { safety: { escapes: block!.clearRings, actionFree: 12 - block!.ring } } : {}),
    });

    if (doBlock) {
      ai.committed = decision;
      ai.commitRemaining = policy.commitMs;
      ai.stats.attacks++;
      logEvent(ai, view.at, "telegraph", `Lodging ring ${block!.ring} for ${ms(policy.commitMs)} — the ring is locked and never re-aimed`, decision.id);
    } else {
      ai.committed = null;
      ai.commitRemaining = 0;
    }

    return {
      kind: "shoot",
      aim: executedAim,
      path: executed.path,
      rings,
      ...(doBlock ? { blockRing: block!.ring } : {}),
      errorBound: { aim: policy.errorBoundDeg.aim, elevation: policy.errorBoundDeg.elevation },
      commitMs: doBlock ? policy.commitMs : 0,
      decisionId: decision.id,
    };
  }

  // =====================================================================
  // Palace stage: the player now aims at Antinous, who must find cover.
  // =====================================================================
  const current = view.antinousPosition;
  const predictedZone = zoneOfAim(view.playerAim.aim);
  const incoming = sampleTrajectory(view.playerAim, view.wind, 0, tier);
  const landingPoint = incoming.path[incoming.path.length - 1];
  const forecast = policy.predictive ? predict(model, lastZone) : null;
  const weak = policy.predictive ? weakestOption(model) : null;

  const candidates: Candidate[] = [];
  const stationScore: number[] = [0, 0, 0];

  if (!policy.coverAware) {
    // Easy: no exposure is read at all — a fixed rotation, so the pattern is
    // learnable rather than a coin flip dressed up as a decision.
    const chosen = tick % 3;
    for (let s = 0; s < 3; s++) {
      stationScore[s] = s === chosen ? 60 : 15;
      candidates.push({
        action: `station:${s}`,
        score: stationScore[s],
        note: s === chosen ? `fixed rotation step ${chosen + 1} of 3 — no trajectory read` : "off-sequence",
      });
    }
  } else {
    for (let s = 0; s < 3; s++) {
      const exposure = exposureAt(landingPoint, s as Position);
      let score = safetyScore(exposure);
      if (forecast && forecast.grounded) score = Math.max(0, score - forecast.distribution[s] * 30);
      if (weak === s) score = Math.max(0, score - 10);
      stationScore[s] = score;
    }
    // `hold` is pushed first so that a genuine tie with the current station
    // (holdBias 0, on the hard tier) resolves to it under argmax's own
    // earlier-entry rule, rather than to a `station:<current>` row that means
    // exactly the same thing but reads oddly as the inspector's winner.
    candidates.push({
      action: "hold",
      score: Math.round((stationScore[current] + policy.holdBias) * 10) / 10,
      note: policy.holdBias > 0
        ? `staying scores ${stationScore[current].toFixed(1)} +${policy.holdBias} inertia — this tier only moves for a clearly incoming shot`
        : `staying scores ${stationScore[current].toFixed(1)}`,
    });
    for (let s = 0; s < 3; s++) {
      const exposure = exposureAt(landingPoint, s as Position);
      let note = `${exposure.toFixed(2)} units from the predicted line`;
      if (forecast && forecast.grounded) {
        const bias = forecast.distribution[s] * 30;
        note += `, −${Math.round(bias * 10) / 10} for ${pct(forecast.distribution[s])} odds you favour this zone next`;
      }
      if (weak === s) note += ", −10 (your most successful zone so far)";
      candidates.push({ action: `station:${s}`, score: Math.round(stationScore[s] * 10) / 10, note });
    }
  }

  logEvent(ai, view.at, "evaluate", candidates.map(c => `${c.action} ${c.score}`).join("  "));

  const winner = argmax(candidates);
  const toStation: Position = winner.action === "hold" ? current : (Number(winner.action.split(":")[1]) as Position);
  const moved = toStation !== current;
  const confidence = forecast && forecast.grounded ? clamp01(forecast.distribution[toStation]) : undefined;

  const reason = !policy.coverAware
    ? `Fixed rotation reached step ${(tick % 3) + 1} of 3, covering ${positionName(toStation)}. No trajectory or shot history is read on this difficulty.`
    : moved
      ? `The predicted line lands ${exposureAt(landingPoint, current).toFixed(2)} units from ${positionName(current)} (score ${stationScore[current].toFixed(1)}); ${positionName(toStation)} is safer at ${stationScore[toStation].toFixed(1)}.${confidence !== undefined ? ` You have favoured ${positionName(toStation)} ${pct(confidence)} of the time after aiming from ${positionName(lastZone)}.` : ""}`
      : `${positionName(current)} already scores highest against the predicted line (${stationScore[current].toFixed(1)}${policy.holdBias > 0 ? ` incl. ${policy.holdBias} inertia` : ""}), so Antinous holds.`;

  const state: AIState = forecast?.grounded ? "predicting" : policy.coverAware ? "evaluating" : "observing";
  const decision = commitDecision(ai, view.at, {
    algorithm,
    state,
    observations,
    memory,
    candidates,
    selectedAction: moved ? `Take cover at ${positionName(toStation)}` : `Hold at ${positionName(current)}`,
    selectedCandidate: winner.action,
    target: `${positionName(predictedZone)} zone`,
    ...(confidence === undefined ? {} : { confidence }),
    reason,
    commitMs: policy.commitMs,
  });
  ai.committed = moved ? decision : null;
  ai.commitRemaining = moved ? policy.commitMs : 0;
  if (confidence !== undefined) ai.stats.predictions++;
  logEvent(
    ai,
    view.at,
    moved ? "telegraph" : "evaluate",
    moved ? `Moving to ${positionName(toStation)} — committed for ${ms(policy.commitMs)}` : "Holding position",
    decision.id,
  );

  return moved
    ? { kind: "dodge", from: current, to: toStation, path: incoming.path, commitMs: policy.commitMs, decisionId: decision.id }
    : { kind: "hold", commitMs: policy.commitMs, decisionId: decision.id };
}

// ---------------------------------------------------------------------------
// Stage 6: learn
// ---------------------------------------------------------------------------

export type IthacaResolution =
  | {
      /** Antinous' own contest shot resolved. */
      kind: "shot";
      actualRings: number;
    }
  | {
      /** The player's palace shot resolved. */
      kind: "palace";
      playerZone: Position;
      hit: boolean;
    };

/**
 * Called once a shot resolves — Antinous' own, in the contest, or the
 * player's, in the palace. The two share one function because they share one
 * decision record to close out, even though what each folds into the player
 * model differs.
 */
export function learnFromIthaca(
  ai: AIRuntime,
  model: PlayerModel,
  at: number,
  decisionId: string,
  resolution: IthacaResolution,
) {
  const decision: AIDecision | undefined = ai.decisions.find(d => d.id === decisionId);

  if (resolution.kind === "shot") {
    if (decision && !decision.outcome) {
      decision.outcome = "scored";
      decision.outcomeNote = `Antinous scored ${resolution.actualRings} ring${resolution.actualRings === 1 ? "" : "s"}.`;
    }
    ai.state = "recovering";
    logEvent(ai, at, "learn", `Antinous' shot resolved at ${resolution.actualRings} ring${resolution.actualRings === 1 ? "" : "s"}`, decisionId);
    return;
  }

  const zone = resolution.playerZone;
  observeChoice(model, zone);
  // "Escaped" here is Antinous avoiding the hit, not the player avoiding an
  // attack — the same field pair cyclops.ts uses, read from his side of it.
  observeResolution(model, zone, !resolution.hit);

  if (decision && !decision.outcome) {
    decision.outcome = resolution.hit ? "hit" : "dodged";
    decision.outcomeNote = resolution.hit
      ? `The shot from the ${positionName(zone)} zone landed — the cover call did not hold.`
      : `The shot from the ${positionName(zone)} zone was avoided.`;
    if (decision.confidence !== undefined && (decision.confidence >= 0.5) === resolution.hit) {
      ai.stats.predictionsCorrect++;
    }
  }

  ai.state = "adapting";
  const weak = weakestOption(model);
  logEvent(
    ai,
    at,
    "learn",
    `${resolution.hit ? "Hit" : "Dodged"} from the ${positionName(zone)} zone${weak !== null ? ` — most-exposed station now ${positionName(weak)}` : ""}`,
    decisionId,
  );
}
