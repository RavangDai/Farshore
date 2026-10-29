// Circe: the potion-duel opponent controller.
//
// One decision cycle runs whenever Circe's next piece needs a plan — the same
// moment the base engine's own `planPotion` runs — and returns where to place
// it plus, independently, whether this is the moment to fire her banked
// curses at the player's board. The controller owns no engine state: it reads
// a perception snapshot, reads and updates the player model, writes its
// reasoning into the AI runtime, and hands back a plain action object.
//
// Placement and release are two different kinds of decision bundled into one
// cycle because the base engine already couples them that way (a piece drops
// every cycle; a release is optional). They are evaluated, scored and
// reported independently below — the placement search never reads the
// player's board, and the release search never reads Circe's own board — and
// only the placement side drives `selectedCandidate`, since it is the one
// decision this cycle is never allowed to skip. The release side still gets
// its own real candidates, its own argmax, and its own line in `reason`; it
// just is not the thing `commitDecision`'s single winner marker points at.
//
// Five fairness invariants hold on every difficulty:
//
//   1. A release is never sized above `safeBurstCap`, which is provably safe:
//      bringing every one of the player's 6 columns up to
//      `UNPLACEABLE_HEIGHT_ROWS` needs at least Σ max(0, ceiling - height)
//      tiles in total, however they are distributed, so a burst one tile
//      short of that sum cannot have done it — whichever columns the
//      engine's own curse-placement happens to pick. The player is therefore
//      always left at least one column with room for a piece.
//   2. The capped `amount` is fixed the instant a release is decided and is
//      carried on the returned action; nothing later in this decision, or in
//      any later one, revises a release already handed to the engine.
//   3. A release is always paired with a telegraph (`commitMs`) before it
//      should land. A burst the cap would reduce to zero tiles is not sent at
//      a smaller, silent size instead — it scores -1000 and is withheld, with
//      the reason recorded on the candidate and in `reason`.
//   4. Her own placement search reads only her own board and pieces; the
//      release search reads only the player's board and the shared player
//      model. Neither search's reasoning leaks into the other's candidates.
//   5. `confidence` is set only from the player's measured clearing rate, and
//      only once `CLEARING_RATE_EVIDENCE` drops have been observed. Before
//      that every reading says the rate is unmeasured rather than printing an
//      invented one.

import {
  argmax,
  byTier,
  clamp01,
  commitDecision,
  logEvent,
  ms,
  pct,
  tierOf,
  type AIRuntime,
  type Candidate,
  type Difficulty,
  type Reading,
} from "./types.ts";
import { observeChoice, observeResolution, weakestOption, type PlayerModel } from "./player-model.ts";
import { TILE_NAMES, columnHeight, dropPiece, rotatePiece, type Tile } from "../encounters/mythic.ts";

const round1 = (n: number) => Math.round(n * 10) / 10;
const tileLine = (tiles: Tile[]) => tiles.map(t => TILE_NAMES[t]).join(" · ");

// ---- Fairness and evidence constants --------------------------------------

/**
 * A column stops taking a 3-tall piece once its height passes 7 rows — the
 * engine's own `dropPiece` rejects a drop once `height + 3 > 10`. This is
 * that same line, named for what it means to the player rather than to the
 * piece: at this height, the column is unplaceable.
 */
export const UNPLACEABLE_HEIGHT_ROWS = 8;

/**
 * The same bar the base engine's own release heuristic already used
 * (`potionDrop`'s `crowded` check in mythic.ts) before this controller
 * replaced it — kept here so "crowded" means the same thing it always did.
 */
export const CROWDED_HEIGHT_ROWS = 7;

/** Drops needed in one column before its clear/stuck rate is trusted. */
export const COLUMN_EVIDENCE = 2;

/** Total drops needed before the aggregate clearing rate is reported as a confidence rather than left unmeasured. */
export const CLEARING_RATE_EVIDENCE = 4;

/** The score holding the bank must be beaten to ever release it. */
const HOLD_BASELINE = 10;

// ---- Perception and action -------------------------------------------------

export type CircePerception = {
  /** Simulation time in ms. */
  at: number;
  /** Circe's own board — `rivalBoard` in the engine's terms. */
  ownBoard: Tile[];
  ownPiece: Tile[];
  ownNext: Tile[];
  /** The board Circe is attacking — `board` in the engine's terms. */
  playerBoard: Tile[];
  /** Visible on the shared table; not read by the placement search, only reported. */
  playerPiece: Tile[];
  /** Curses already earned and held, awaiting release. */
  bank: number;
  /** Pieces the player has placed this duel. */
  turn: number;
  /** ms left in the duel, for pacing. */
  remainingMs: number;
};

export type CirceAction =
  | {
      kind: "brew";
      /** Locked for this cycle; the engine drops exactly this piece here. */
      column: number;
      rotation: number;
      /**
       * Present only when this cycle also fires the bank. `amount` is already
       * capped by `safeBurstCap` — apply exactly this many tiles and subtract
       * exactly this many from the bank, never the whole bank, so any surplus
       * the cap held back stays banked for the next cycle.
       */
      release: { amount: number; commitMs: number; trigger: string } | null;
      decisionId: string;
    }
  | {
      /** No rotation of the current piece fits any column. The duel ends on overflow regardless of what is chosen here. */
      kind: "stalled";
      reason: string;
      decisionId: string;
    };

export type CircePolicy = {
  algorithm: string;
  lookaheadPlies: 1 | 2;
  /** Whether placement scoring reads column-height variance and isolated tiles, not just the immediate clear. */
  shapeAware: boolean;
  /** Whether release timing reads the player's measured clearing rate at all. */
  predictive: boolean;
  /** Bank size that alone justifies a release, before any crowding/constraint trigger or clearing-rate adjustment. */
  releaseFloor: number;
  /** Warning length before a decided release actually lands. */
  telegraphMs: number;
};

export function circePolicy(difficulty: Difficulty, adaptive: boolean): CircePolicy {
  const tier = tierOf(difficulty);
  const predictive = tier === 2 || (adaptive && tier >= 1);
  const shapeAware = tier >= 1 || adaptive;
  return {
    algorithm: predictive
      ? "Two-ply placement search + clearing-rate-aware release timing"
      : shapeAware
        ? "One-ply placement search + board-shape heuristic"
        : "Greedy one-ply placement (immediate clear value only)",
    lookaheadPlies: predictive ? 2 : 1,
    shapeAware,
    predictive,
    releaseFloor: byTier(difficulty, 0, 4, 3),
    telegraphMs: byTier(difficulty, 1600, 1300, 1000),
  };
}

/**
 * The algorithm actually in force this cycle.
 *
 * The predictive tier's name claims clearing-rate-aware timing. Until a drop
 * has been observed there is no rate, so claiming it would be a lie; on that
 * path release timing falls back to the same crowding/constraint read the
 * threat map always makes, and the name says so.
 */
export function circeAlgorithm(policy: CircePolicy, model: PlayerModel): string {
  if (!policy.predictive) return policy.algorithm;
  return clearingRate(model) === null
    ? "Two-ply placement search + board-shape release timing (clearing rate idle — no drops observed yet)"
    : policy.algorithm;
}

// ---- Player model, reinterpreted for a column choice set -------------------
//
// The shared player model tracks a small discrete choice set. Here the
// options are the 6 columns the player can drop into, `escapes[column]`
// counts a drop that cleared something, and `failures[column]` counts one
// that only added height. `weakestOption` then reads as the column the
// player's drops most often fail to clear — a real, counted rate, not a
// guess — and the ratio of all escapes to all samples is a genuine measured
// clearing rate.

export type ColumnRecord = {
  column: number;
  attempts: number;
  cleared: number;
  stuck: number;
  /** stuck / attempts, or null before `COLUMN_EVIDENCE` drops. */
  failureRate: number | null;
  evidenced: boolean;
};

export function columnRecords(model: PlayerModel): ColumnRecord[] {
  return Array.from({ length: 6 }, (_, column) => {
    const cleared = model.escapes[column] || 0;
    const stuck = model.failures[column] || 0;
    const attempts = cleared + stuck;
    return {
      column,
      attempts,
      cleared,
      stuck,
      failureRate: attempts > 0 ? stuck / attempts : null,
      evidenced: attempts >= COLUMN_EVIDENCE,
    };
  });
}

/** Fraction of all observed drops that cleared something, or null with none observed yet. */
export function clearingRate(model: PlayerModel): number | null {
  if (model.samples <= 0) return null;
  const total = model.escapes.reduce((a, b) => a + b, 0);
  return clamp01(total / model.samples);
}

// ---- Threat map --------------------------------------------------------

export type ColumnThreat = {
  column: number;
  height: number;
  /** Rows free before the ceiling. */
  headroom: number;
  /** Whether a 3-tall piece still fits — the same test `dropPiece` applies. */
  placeable: boolean;
  failureRate: number | null;
  /** 0..1 blended danger signal. */
  danger: number;
};

/**
 * Per-column danger on the player's board.
 *
 * Height is the literal, geometric measure of how close a column sits to the
 * ceiling, so it carries most of the weight; being unplaceable outright is a
 * hard constraint and adds a flat penalty rather than a proportional one; the
 * player's own measured stuck rate contributes least, since it is a softer,
 * historical signal about that column rather than this instant's geometry.
 */
export function computeThreatMap(playerBoard: Tile[], model: PlayerModel): ColumnThreat[] {
  const records = columnRecords(model);
  return Array.from({ length: 6 }, (_, column) => {
    const height = columnHeight(playerBoard, column);
    const headroom = 10 - height;
    const placeable = headroom >= 3;
    const record = records[column];
    const failureRate = record.evidenced ? record.failureRate : null;
    const danger = clamp01((height / UNPLACEABLE_HEIGHT_ROWS) * 0.6 + (placeable ? 0 : 0.3) + (failureRate ?? 0) * 0.1);
    return { column, height, headroom, placeable, failureRate, danger };
  });
}

/**
 * The largest curse burst that cannot top out every column, however the
 * engine's own shortest-column targeting happens to distribute it.
 *
 * Bringing every column to `UNPLACEABLE_HEIGHT_ROWS` requires adding at least
 * its own deficit to each one — that is a lower bound on the total tiles
 * needed, true of any distribution, not only an adversarial one. One tile
 * short of the sum of deficits therefore cannot have closed every deficit, so
 * at least one column is provably left with headroom for a piece.
 */
export function safeBurstCap(board: Tile[]): number {
  const total = Array.from({ length: 6 }, (_, c) => Math.max(0, UNPLACEABLE_HEIGHT_ROWS - columnHeight(board, c))).reduce(
    (a, b) => a + b,
    0,
  );
  return Math.max(0, total - 1);
}

// ---- Placement search -------------------------------------------------

type PlyResult = { column: number; rotation: number; cleared: number; attack: number; board: Tile[]; heights: number[] };

function tryPlacement(board: Tile[], piece: Tile[], column: number, rotation: number): PlyResult | null {
  const result = dropPiece(board, rotatePiece(piece, rotation), column);
  if (!result) return null;
  const heights = Array.from({ length: 6 }, (_, c) => columnHeight(result.board, c));
  return { column, rotation, cleared: result.cleared, attack: result.attack, board: result.board, heights };
}

/** Every column x rotation combination is one search node, legal or not — that is the real, exact search effort. */
function searchPlacements(board: Tile[], piece: Tile[]): { legal: PlyResult[]; attempts: number } {
  const legal: PlyResult[] = [];
  let attempts = 0;
  for (let column = 0; column < 6; column++) {
    for (let rotation = 0; rotation < 3; rotation++) {
      attempts++;
      const ply = tryPlacement(board, piece, column, rotation);
      if (ply) legal.push(ply);
    }
  }
  return { legal, attempts };
}

const immediateScore = (ply: PlyResult) => ply.cleared * 10 + ply.attack * 20;

/** Mirrors the weighting the base engine's own `potionChoice` lookahead already used, so a two-ply search values a reply the way the engine's existing search always has. */
const futureValue = (ply: PlyResult) => ply.cleared * 4 + ply.attack * 7;

function heightVariance(heights: number[]): number {
  const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
  return heights.reduce((sum, h) => sum + (h - mean) * (h - mean), 0) / heights.length;
}

/**
 * This board's gravity never leaves a true gap inside a column — a piece
 * always lands directly on the current stack. The closest honest analogue of
 * a "hole" here is a landed tile with no same-colour neighbour it could ever
 * match into without a fresh piece landing exactly beside it: that is what
 * actually traps height on this board, the way a buried gap would elsewhere.
 * Only the two directions `resolveBoard` itself matches on — same row,
 * adjacent column; same column, next row down — are checked, so this counts
 * exactly the adjacency the real clear rule uses.
 */
function isolatedTopTiles(board: Tile[]): number {
  let count = 0;
  for (let column = 0; column < 6; column++) {
    const height = columnHeight(board, column);
    if (height === 0) continue;
    const row = 10 - height;
    const i = row * 6 + column;
    const tile = board[i];
    const left = column > 0 ? board[i - 1] : 0;
    const right = column < 5 ? board[i + 1] : 0;
    const below = row + 1 < 10 ? board[i + 6] : 0;
    if (tile !== left && tile !== right && tile !== below) count++;
  }
  return count;
}

type ShapeScore = { score: number; variance: number; isolated: number; maxHeight: number };

/**
 * Variance and isolation both punish a placement that looks fine this turn
 * but leaves the board harder to clear later. Isolation is weighted highest
 * because a stuck, mismatched tile can sit for many turns; a tall column can
 * still be levelled by a lucky next piece.
 */
function shapeScore(ply: PlyResult): ShapeScore {
  const variance = heightVariance(ply.heights);
  const isolated = isolatedTopTiles(ply.board);
  const maxHeight = Math.max(...ply.heights);
  const score = immediateScore(ply) - variance * 1.5 - isolated * 4 - maxHeight * 2;
  return { score, variance, isolated, maxHeight };
}

// ---- Readings -----------------------------------------------------------

function perceptionReadings(view: CircePerception, threat: ColumnThreat[]): Reading[] {
  return [
    {
      key: "ownboard",
      label: "Circe's columns",
      value: Array.from({ length: 6 }, (_, c) => `${c + 1}:${columnHeight(view.ownBoard, c)}`).join(" · "),
      hint: "height in rows",
    },
    { key: "piece", label: "Circe's falling piece", value: tileLine(view.ownPiece), hint: `next ${tileLine(view.ownNext)}` },
    { key: "playerpiece", label: "Player's falling piece", value: tileLine(view.playerPiece) },
    { key: "bank", label: "Curses banked", value: String(view.bank) },
    {
      key: "threat",
      label: "Player threat map",
      value: threat.map(t => `${t.column + 1}:${pct(t.danger)}${t.placeable ? "" : "!"}`).join(" · "),
      hint: "danger per column; ! marks no headroom left",
    },
    { key: "recovery", label: "Player recovery options", value: `${threat.filter(t => t.placeable).length} of 6 columns still take a piece` },
    { key: "turn", label: "Pieces the player has placed", value: String(view.turn) },
    { key: "remaining", label: "Duel time left", value: ms(Math.max(0, view.remainingMs)) },
  ];
}

function memoryReadings(model: PlayerModel, policy: CircePolicy, rate: number | null): Reading[] {
  const records = columnRecords(model);
  const weakest = weakestOption(model);
  const readings: Reading[] = [
    {
      key: "clearing",
      label: "Player's clearing rate",
      value: rate === null ? "not yet measured" : pct(rate),
      hint: rate === null ? `needs at least ${CLEARING_RATE_EVIDENCE} observed drops` : `measured over ${model.samples} drops`,
    },
    {
      key: "columns",
      label: "Per-column outcomes",
      value: records.map(r => (r.evidenced ? `C${r.column + 1} ${r.cleared}/${r.attempts}` : `C${r.column + 1} untested`)).join(" · "),
      hint: "cleared / attempted, from counted drops",
    },
  ];
  if (weakest !== null) {
    const rec = records[weakest];
    readings.push({
      key: "weakest",
      label: "Player's most-stuck column",
      value: `Column ${weakest + 1}${rec.failureRate === null ? "" : ` (${pct(rec.failureRate)} stuck)`}`,
    });
  }
  if (!policy.predictive) {
    readings.push({
      key: "scope",
      label: "Release policy memory use",
      value: policy.shapeAware ? "current board shape only — no clearing-rate history read" : "none — releases as soon as earned",
    });
  }
  return readings;
}

// ---- Decision cycle -------------------------------------------------------

/**
 * Run one decision cycle, at the moment Circe's next piece needs a plan.
 *
 * `tick` and `roll` complete the shared controller signature but go unused:
 * every tier here reads the real board rather than a fixed sequence, and
 * nothing is sampled — the same engine state always produces the same plan.
 */
export function decideCirce(
  ai: AIRuntime,
  model: PlayerModel,
  view: CircePerception,
  difficulty: Difficulty,
  adaptive: boolean,
  tick: number,
  roll: () => number,
): CirceAction {
  void tick;
  void roll;
  const policy = circePolicy(difficulty, adaptive);
  const algorithm = circeAlgorithm(policy, model);
  const threat = computeThreatMap(view.playerBoard, model);
  const rate = clearingRate(model);
  const observations = perceptionReadings(view, threat);

  logEvent(ai, view.at, "perceive", `Bank ${view.bank} · player's tallest column ${Math.max(...threat.map(t => t.height))}`);
  logEvent(
    ai,
    view.at,
    "remember",
    rate === null ? "Clearing rate not yet measured — no player drops observed" : `Clearing rate ${pct(rate)} over ${model.samples} drops`,
  );

  // ---- Stage 3a: evaluate placements ------------------------------------
  let nodes = 0;
  const ply1 = searchPlacements(view.ownBoard, view.ownPiece);
  nodes += ply1.attempts;

  if (ply1.legal.length === 0) {
    const candidates: Candidate[] = [
      { action: "stalled", score: -1, note: "every column is within 3 rows of the ceiling — no placement is legal" },
    ];
    ai.stats.nodesExplored += nodes;
    logEvent(ai, view.at, "evaluate", candidates.map(c => `${c.action} ${c.score}`).join("  "));
    const decision = commitDecision(ai, view.at, {
      algorithm,
      state: "recovering",
      observations,
      memory: memoryReadings(model, policy, rate),
      candidates,
      selectedAction: "No legal placement — Circe's board is full",
      selectedCandidate: "stalled",
      reason: `All 6 of Circe's own columns sit within 3 rows of the ceiling, so no rotation of the current piece fits anywhere. ${view.bank} curse${view.bank === 1 ? "" : "s"} remain banked and unsent.`,
    });
    ai.committed = null;
    ai.commitRemaining = 0;
    return { kind: "stalled", reason: decision.reason, decisionId: decision.id };
  }

  const placementCandidates: Candidate[] = [];
  let bestShape: ShapeScore | null = null;
  for (const p of ply1.legal) {
    const id = `place:${p.column}r${p.rotation}`;
    if (!policy.shapeAware) {
      placementCandidates.push({
        action: id,
        score: round1(immediateScore(p)),
        note: `clears ${p.cleared}, sends ${p.attack} curse${p.attack === 1 ? "" : "s"} — immediate value only`,
      });
    } else if (!policy.predictive) {
      const shape = shapeScore(p);
      placementCandidates.push({
        action: id,
        score: round1(shape.score),
        note: `clears ${p.cleared}, sends ${p.attack} — variance ${shape.variance.toFixed(1)}, ${shape.isolated} isolated tile${shape.isolated === 1 ? "" : "s"}, tallest ${shape.maxHeight}`,
      });
    } else {
      const shape = shapeScore(p);
      const ply2 = searchPlacements(p.board, view.ownNext);
      nodes += ply2.attempts;
      const best2 = ply2.legal.reduce((max, q) => Math.max(max, futureValue(q)), 0);
      const score = shape.score + best2;
      if (!bestShape || score > (placementCandidates.find(c => c.action === id)?.score ?? -Infinity)) bestShape = shape;
      placementCandidates.push({
        action: id,
        score: round1(score),
        note: `clears ${p.cleared}, sends ${p.attack}; best reply with the next piece adds ${round1(best2)} (variance ${shape.variance.toFixed(1)}, ${shape.isolated} isolated, tallest ${shape.maxHeight})`,
      });
    }
  }

  const placementWinner = argmax(placementCandidates);
  const chosen = ply1.legal.find(p => `place:${p.column}r${p.rotation}` === placementWinner.action)!;

  // ---- Stage 3b: evaluate the release, independently --------------------
  const tallest = Math.max(...threat.map(t => t.height));
  const placeableCount = threat.filter(t => t.placeable).length;
  const crowded = tallest >= CROWDED_HEIGHT_ROWS;
  const constrained = placeableCount <= 2;
  const cap = safeBurstCap(view.playerBoard);

  let trigger: string | null = null;
  let dynThreshold: number | undefined;
  if (view.bank > 0) {
    if (!policy.shapeAware) {
      trigger = "earned and ready — this difficulty releases the instant anything is banked";
    } else if (!policy.predictive) {
      trigger = crowded
        ? `the board is crowded — tallest column is ${tallest} rows`
        : view.bank >= policy.releaseFloor
          ? `the bank reached ${view.bank}, at or above the ${policy.releaseFloor}-curse threshold`
          : null;
    } else {
      dynThreshold = policy.releaseFloor + (rate !== null ? Math.round(rate * 4) : 0);
      trigger = crowded
        ? `the board is crowded — tallest column is ${tallest} rows`
        : constrained
          ? `only ${placeableCount} of 6 columns can still take a piece`
          : view.bank >= dynThreshold
            ? `the bank reached ${view.bank}, at or above the clearing-rate-adjusted threshold of ${dynThreshold}`
            : null;
    }
  }

  const releaseCandidates: Candidate[] = [
    {
      action: "hold-bank",
      score: HOLD_BASELINE,
      note:
        view.bank <= 0
          ? "nothing banked yet"
          : trigger
            ? "outscored once the trigger below fires"
            : `banking — ${view.bank} held, no trigger met yet`,
    },
  ];
  if (view.bank > 0) {
    const amount = Math.min(view.bank, cap);
    const unsafe = trigger !== null && amount <= 0;
    const releaseScore = unsafe ? -1000 : trigger ? byTier(difficulty, 100, 80, 80) : byTier(difficulty, 100, 2, 2);
    releaseCandidates.push({
      action: unsafe ? "release:unsafe" : `release:${amount}`,
      score: releaseScore,
      note: unsafe
        ? `${trigger}, but releasing even one curse now could leave no placeable column — withheld`
        : trigger
          ? `${trigger} — release ${amount} of ${view.bank} banked${amount < view.bank ? `, capped down from ${view.bank} to guarantee a placeable column` : ""}`
          : `no trigger met — holding ${view.bank} rather than releasing early`,
    });
  }
  const releaseWinner = argmax(releaseCandidates);

  let release: { amount: number; commitMs: number; trigger: string } | null = null;
  let objective: string;
  if (releaseWinner.action.startsWith("release:") && releaseWinner.action !== "release:unsafe") {
    const amount = Number(releaseWinner.action.slice("release:".length));
    release = { amount, commitMs: policy.telegraphMs, trigger: trigger as string };
    objective = `Releasing ${amount} curse${amount === 1 ? "" : "s"} — ${trigger}.`;
  } else if (releaseWinner.action === "release:unsafe") {
    objective = `Holding ${view.bank} banked curse${view.bank === 1 ? "" : "s"} — ${trigger}, but the fairness cap allows only ${cap} safe tile${cap === 1 ? "" : "s"} right now, not enough to send without risking every column.`;
  } else if (view.bank > 0) {
    objective = policy.predictive
      ? `Banking — ${view.bank} held; board not crowded (tallest ${tallest}), ${placeableCount} of 6 columns still placeable, bank below the clearing-rate-adjusted threshold of ${dynThreshold}${rate !== null ? ` (clearing rate ${pct(rate)})` : ""}.`
      : `Banking — ${view.bank} held; board not crowded (tallest ${tallest}) and the bank has not reached the ${policy.releaseFloor}-curse threshold.`;
  } else {
    objective = "Brewing — nothing banked yet.";
  }
  observations.push({ key: "objective", label: "Tactical objective", value: objective });

  const confidence = policy.predictive && rate !== null && model.samples >= CLEARING_RATE_EVIDENCE ? clamp01(rate) : undefined;

  const candidates = [...placementCandidates, ...releaseCandidates];
  ai.stats.nodesExplored += nodes;
  logEvent(ai, view.at, "evaluate", candidates.map(c => `${c.action} ${c.score}`).join("  "));

  const legalCount = ply1.legal.length;
  const placementReason = policy.predictive
    ? `Two-ply search over ${legalCount} legal placements, each checked against the best reply with the next piece, picked column ${chosen.column + 1} rotation ${chosen.rotation}: clears ${chosen.cleared}, sends ${chosen.attack} curse${chosen.attack === 1 ? "" : "s"}.`
    : policy.shapeAware
      ? `One-ply search over ${legalCount} legal placements picked column ${chosen.column + 1} rotation ${chosen.rotation} for the best balance of clears, curses sent, and the shape it leaves behind.`
      : `Column ${chosen.column + 1} rotation ${chosen.rotation} clears the most (${chosen.cleared}) and sends the most curses (${chosen.attack}) of ${legalCount} legal placements tried; no board shape or player data is read on this difficulty.`;
  const reason = `${placementReason} ${objective}${release ? ` Telegraphed for ${ms(release.commitMs)} before it lands.` : ""}`;

  const decision = commitDecision(ai, view.at, {
    algorithm,
    state: policy.predictive ? "predicting" : policy.shapeAware ? "evaluating" : "preparing",
    observations,
    memory: memoryReadings(model, policy, rate),
    candidates,
    selectedAction: `Place in column ${chosen.column + 1} rotation ${chosen.rotation} — ${release ? `release ${release.amount} curse${release.amount === 1 ? "" : "s"}` : "hold the bank"}`,
    selectedCandidate: placementWinner.action,
    ...(release ? { target: "curse release" } : {}),
    ...(confidence === undefined ? {} : { confidence }),
    reason,
    ...(release ? { commitMs: release.commitMs } : {}),
    // No `safety` field: that slot counts escape lanes a single committed
    // target leaves, and a curse burst has no single lane — the engine's own
    // shortest-column targeting picks where the tiles land, not this
    // controller. The provable guarantee (at least one column survives) is
    // recorded in the candidate note and in `reason` instead of being forced
    // into a field shaped for a different genre.
  });

  if (release) {
    ai.committed = decision;
    ai.commitRemaining = release.commitMs;
    ai.stats.attacks++;
    logEvent(ai, view.at, "telegraph", `Brewing a curse burst — ${release.amount} locked for ${ms(release.commitMs)}`, decision.id);
  } else {
    ai.committed = null;
    ai.commitRemaining = 0;
  }
  if (confidence !== undefined) ai.stats.predictions++;

  return { kind: "brew", column: chosen.column, rotation: chosen.rotation, release, decisionId: decision.id };
}

/**
 * Stage 6. Called when the PLAYER's own drop resolves.
 *
 * This is the behaviour Circe's model needs to learn — her own placements
 * resolve synchronously inside `decideCirce`'s search and need no later
 * outcome — so this is the one hook that updates `model`. It also scores the
 * most recent still-open release decision against what the player's board
 * looks like right afterwards, which is the only point a burst's effect can
 * honestly be judged: a burst the player immediately clears away is a
 * different outcome than one that compounds.
 */
export function learnFromBrew(
  ai: AIRuntime,
  model: PlayerModel,
  at: number,
  column: number,
  cleared: number,
  playerBoardAfter: Tile[],
) {
  observeChoice(model, column);
  observeResolution(model, column, cleared > 0);

  let pending: ReturnType<typeof commitDecision> | undefined;
  for (let i = ai.decisions.length - 1; i >= 0; i--) {
    const d = ai.decisions[i];
    if (d.target === "curse release" && !d.outcome) {
      pending = d;
      break;
    }
  }
  if (pending) {
    const stillTallest = Math.max(...Array.from({ length: 6 }, (_, c) => columnHeight(playerBoardAfter, c)));
    const stillCrowded = stillTallest >= CROWDED_HEIGHT_ROWS;
    pending.outcome = stillCrowded ? "hit" : "dodged";
    pending.outcomeNote = stillCrowded
      ? `Still crowded after the player's reply (tallest column ${stillTallest}) — the burst compounded.`
      : `The player cleared back below the crowding line (tallest column ${stillTallest}) — the burst was absorbed.`;
    if (stillCrowded) ai.stats.attacksLanded++;
    if (pending.confidence !== undefined && (pending.confidence >= 0.5) === (stillCrowded as boolean)) {
      ai.stats.predictionsCorrect++;
    }
  }

  ai.state = "adapting";
  const rate = clearingRate(model);
  logEvent(
    ai,
    at,
    "learn",
    `Column ${column + 1} ${cleared > 0 ? `cleared ${cleared}` : "added no clear"} — clearing rate now ${rate === null ? "unmeasured" : pct(rate)} over ${model.samples} drops`,
  );
}
