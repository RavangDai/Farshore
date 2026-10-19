// Poseidon: the Storm's lightning controller for the raft crossing (Calypso's
// currents, Odysseus' Raft).
//
// One decision cycle runs at a storm beat — the moment the engine's own
// countdown reaches zero and no bolt is already marked — and returns the tile
// Poseidon marks, or nothing. The controller owns no engine state: it reads a
// perception snapshot, reads and updates the player model, writes its
// reasoning into the AI runtime, and hands back a plain action object.
//
// Three fairness invariants hold on every difficulty, and the tests assert them:
//
//   1. A bolt is announced for at least `warningMs` before it lands, and the
//      marked tile — both the row and the x position — is locked the instant
//      the telegraph begins. It is never re-aimed while the warning counts
//      down.
//   2. A tile is only ever marked when a breadth-first search over the raft's
//      current position proves at least one tile stays reachable within the
//      warning and is still a timber (or a shore) once the bolt resolves.
//      With no such tile, the strike is withheld — this is the one invariant
//      that must never be relaxed, because every other mistake is survivable
//      and this one is not.
//   3. The easy and normal tiers draw no random numbers and consult no column
//      history, which is what makes their marks learnable; only the hard
//      tier's forecast leads once enough hops have actually been observed,
//      and it always folds the row's own current into the target, never a
//      stationary-world guess.

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
  type Candidate,
  type Difficulty,
  type Reading,
} from "./types.ts";
import {
  favouriteOption,
  meanReaction,
  occupancyPrior,
  predictAfter,
  weaknessOf,
  weakestOption,
  type PlayerModel,
} from "./player-model.ts";

/** Columns across the raft's width. Matches the whole-unit hops `adventureAction` allows. */
export const NUM_COLUMNS = 7;
/** World `x` of a column's centre. Inverse of `columnOf`. */
export const columnX = (column: number) => column + 0.5;
/**
 * Nearest column to a world `x`.
 *
 * `x` is clamped to [0.3, 6.7] by the engine, so the two outer clamp values
 * collapse onto the nearest proper column rather than getting their own —
 * the half-tile this loses is well inside `TIMBER_EDGE`'s own tolerance.
 */
export const columnOf = (x: number) => clamp(Math.round(x - 0.5), 0, NUM_COLUMNS - 1);

/** How long a single hop takes before the next one is accepted. Fairness floor. */
export const HOP_MS = 210;
/** Period of the timber pattern along `x`, mirrored from the engine's `onTimber`. */
export const TIMBER_PERIOD = 5.5;
/** Margin from a timber's edge that still counts as standing on it. Mirrored from `onTimber`. */
export const TIMBER_EDGE = 0.12;
/** The engine's own strike collision radius — kept here so the two never drift apart. */
export const STRIKE_RADIUS = 0.6;
/**
 * Clearance from the struck tile a candidate landing must keep to count as a
 * genuine escape rather than a graze just outside `STRIKE_RADIUS`.
 */
export const SAFE_MARGIN = 0.75;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const mod = (n: number, m: number) => ((n % m) + m) % m;

export type CalypsoRow = { offset: number; speed: number; width: number };

export type CalypsoPerception = {
  /** Simulation time in ms. */
  at: number;
  x: number;
  /** 0 (near shore) through the river rows to the far shore. */
  row: number;
  /** `columnOf(x)`, kept for display — every computation below rederives it from `x`. */
  column: number;
  /** The river rows between the two shores, nearest first. */
  rows: CalypsoRow[];
  /** The engine's own marked bolt, if one is currently telegraphed. */
  lightning: { x: number; row: number; warning: number; age: number } | null;
  crossing: number;
  /** Shores reached so far. */
  progress: number;
  wood: number;
  gatheredRows: number[];
  lives: number;
  /** Whether the next hop is off its cooldown. */
  moveReady: boolean;
  remainingMs: number;
};

/** A grid cell a breadth-first search reached, and how many hops it took. */
export type CalypsoTile = { row: number; column: number; hops: number };

export type CalypsoAction =
  | {
      kind: "strike";
      /** The locked tile. Neither field changes after this decision. */
      row: number;
      x: number;
      /** Telegraph length before the bolt lands, in ms. */
      warningMs: number;
      /** Where the model expects Odysseus to be when the bolt resolves. */
      predictedLanding: { row: number; column: number; x: number };
      /** Only present on the hard tier, where a real Markov forecast ran. */
      confidence?: number;
      decisionId: string;
    }
  | { kind: "wait" };

export type CalypsoPolicy = {
  algorithm: string;
  /** ms the storm waits between bolts. */
  cooldownMs: number;
  /** Warning length before the bolt lands. The target is locked for this whole window. */
  warningMs: number;
  /** Whether the policy forecasts the player's next column with the memory model. */
  predictive: boolean;
  /** Whether the policy targets the player's current row at all. */
  tracking: boolean;
};

export function calypsoPolicy(difficulty: Difficulty, adaptive: boolean): CalypsoPolicy {
  const tier = tierOf(difficulty);
  const predictive = tier === 2 || (adaptive && tier >= 1);
  const tracking = tier >= 1 || adaptive;
  return {
    algorithm: predictive
      ? "Landing prediction (Markov column forecast + current drift)"
      : tracking
        ? "Current-position storm tracking (drift-adjusted)"
        : "Telegraphed rotation (fixed tile sequence)",
    // Mirrors the engine's own [10000, 8000, 6500] / [2400, 2000, 1700] constants in
    // odyssey-games.ts — kept here so the integrator has one place to read them from.
    cooldownMs: byTier(difficulty, 10000, 8000, 6500),
    warningMs: byTier(difficulty, 2400, 2000, 1700),
    predictive,
    tracking,
  };
}

/**
 * The algorithm actually in force this cycle.
 *
 * The predictive tier's name claims a Markov forecast. Before more than a
 * couple of hops have been observed that forecast is barely more than a
 * uniform guess, so the name says the forecast is idle rather than implying a
 * confidence the history cannot support.
 */
export function calypsoAlgorithm(policy: CalypsoPolicy, model: PlayerModel): string {
  if (!policy.predictive) return policy.algorithm;
  return model.samples < 3
    ? "Landing prediction (forecast idle — too few hops observed yet)"
    : policy.algorithm;
}

/**
 * Mirrors `onTimber` in `src/lib/odyssey-games.ts` exactly: a timber's span is
 * periodic in `x` with period `TIMBER_PERIOD`, and the whole pattern drifts at
 * the row's own current speed. Duplicated rather than imported so this file
 * never imports the engine it is wired into (rule 6: no engine import cycles)
 * — if the engine's geometry ever changes, this copy has to change with it.
 */
export function onTimberAt(row: CalypsoRow, x: number, futureMs: number): boolean {
  const phase = mod(x - row.offset - (row.speed * futureMs) / 1000, TIMBER_PERIOD);
  return phase >= TIMBER_EDGE && phase <= row.width - TIMBER_EDGE;
}

/**
 * Every grid cell reachable from `(fromRow, fromCol)` within `maxHops` unit
 * hops, nearest first. The grid is small (at most 9 rows by `NUM_COLUMNS`
 * columns) so a plain breadth-first search is cheap and exact — no heuristic
 * is needed, and none would be honest to report a score from.
 */
function reachableCells(fromRow: number, fromCol: number, maxHops: number, riverRows: number): CalypsoTile[] {
  const seen = new Set<string>([`${fromRow}:${fromCol}`]);
  const all: CalypsoTile[] = [{ row: fromRow, column: fromCol, hops: 0 }];
  let frontier = all;
  for (let step = 1; step <= maxHops && frontier.length > 0; step++) {
    const next: CalypsoTile[] = [];
    for (const cell of frontier) {
      const moves: [number, number][] = [
        [cell.row - 1, cell.column],
        [cell.row + 1, cell.column],
        [cell.row, cell.column - 1],
        [cell.row, cell.column + 1],
      ];
      for (const [row, column] of moves) {
        if (row < 0 || row > riverRows + 1 || column < 0 || column >= NUM_COLUMNS) continue;
        const key = `${row}:${column}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const found = { row, column, hops: step };
        next.push(found);
        all.push(found);
      }
    }
    frontier = next;
  }
  return all;
}

/**
 * Fairness: the tiles Odysseus can still reach from where he actually is, that
 * remain a timber (or a shore) once a bolt marked at `(targetRow, targetX)`
 * resolves `warningMs` from now.
 *
 * This is the function invariant 2 rests on. A candidate tile is only ever
 * marked once this returns at least one entry for it — if it returns none,
 * the candidate is withheld, never thrown anyway.
 */
export function reachableSafeLandings(
  view: CalypsoPerception,
  targetRow: number,
  targetX: number,
  warningMs: number,
): CalypsoTile[] {
  const riverRows = view.rows.length;
  // A floor of one hop: even a near-zero warning still has to leave somewhere
  // to stand, and a reach of zero would make every tile but the current one
  // unreachable by construction rather than by any real time constraint.
  const maxHops = Math.max(1, Math.floor(warningMs / HOP_MS));
  const cells = reachableCells(view.row, columnOf(view.x), maxHops, riverRows);
  return cells.filter(cell => {
    const x = columnX(cell.column);
    if (cell.row === targetRow && Math.abs(x - targetX) <= SAFE_MARGIN) return false;
    if (cell.row <= 0 || cell.row > riverRows) return true; // the two shores are always solid ground
    return onTimberAt(view.rows[cell.row - 1], x, warningMs);
  });
}

/**
 * How dangerous row `row` is right now, in 0..1, from three grounded terms:
 * how little timber it carries per cycle, how fast its current runs relative
 * to the other rows this crossing, and — the term that actually matters for
 * the player — how far a bolt already marked on it has counted down. A row
 * nobody has marked scores purely on its own terrain, which is why the first
 * two terms are weighted lightly: they are ambient texture, not a threat.
 */
export function platformDanger(view: CalypsoPerception, policy: CalypsoPolicy, row: number): number {
  const riverRows = view.rows.length;
  if (row <= 0 || row > riverRows) return 0;
  const r = view.rows[row - 1];
  const maxSpeed = Math.max(0.0001, ...view.rows.map(other => Math.abs(other.speed)));
  const narrowness = clamp01(1 - r.width / TIMBER_PERIOD);
  const swiftness = clamp01(Math.abs(r.speed) / maxSpeed);
  const targeted =
    view.lightning && view.lightning.row === row ? clamp01(1 - Math.max(0, view.lightning.warning) / policy.warningMs) : 0;
  return clamp01(narrowness * 0.3 + swiftness * 0.2 + targeted * 0.5);
}

function perceptionReadings(view: CalypsoPerception, policy: CalypsoPolicy): Reading[] {
  const riverRows = view.rows.length;
  const dangerLine = Array.from({ length: riverRows }, (_, i) => `R${i + 1} ${pct(platformDanger(view, policy, i + 1))}`).join(
    " · ",
  );
  return [
    {
      key: "position",
      label: "Raft position",
      value: `Row ${view.row} · column ${columnOf(view.x) + 1}`,
      hint: view.row <= 0 ? "near shore" : view.row > riverRows ? "far shore" : "mid-crossing",
    },
    { key: "lives", label: "Hulls remaining", value: String(view.lives) },
    {
      key: "wood",
      label: "Driftwood",
      value: `${view.wood}/3`,
      hint: view.gatheredRows.length > 0 ? `gathered on row ${view.gatheredRows.join(", ")}` : "none gathered this crossing",
    },
    { key: "crossing", label: "Crossing", value: `${view.crossing} · ${view.progress} shores reached` },
    {
      key: "lightning",
      label: "Storm state",
      value: view.lightning
        ? `Row ${view.lightning.row}, tile ${view.lightning.x.toFixed(1)} — ${ms(Math.max(0, view.lightning.warning))} left`
        : "quiet — no bolt marked",
    },
    { key: "danger", label: "Per-row danger", value: dangerLine || "no river rows", hint: "terrain + current + any marked bolt" },
    { key: "ready", label: "Next hop", value: view.moveReady ? "ready" : "cooling down" },
  ];
}

function memoryReadings(model: PlayerModel, policy: CalypsoPolicy): Reading[] {
  const prior = occupancyPrior(model);
  const reaction = meanReaction(model);
  const weakest = weakestOption(model);
  const readings: Reading[] = [
    {
      key: "occupancy",
      label: "Column dwell (decayed)",
      value: prior.map((p, i) => `C${i + 1} ${pct(p)}`).join(" · "),
    },
    { key: "favourite", label: "Preferred column", value: `C${favouriteOption(model) + 1}` },
    {
      key: "recent",
      label: "Recent columns",
      value: model.recent.length > 1 ? model.recent.map(c => `C${c + 1}`).join(" → ") : "none observed",
    },
    { key: "reaction", label: "Mean reaction", value: reaction === null ? "not yet measured" : `${Math.round(reaction)} ms` },
  ];
  if (weakest !== null) {
    const rate = weaknessOf(model, weakest);
    readings.push({ key: "weak", label: "Weakest column", value: `C${weakest + 1}${rate === null ? "" : ` (${pct(rate)} failures)`}` });
  }
  if (!policy.predictive) {
    readings.push({ key: "scope", label: "Policy memory use", value: policy.tracking ? "position and current only" : "none — fixed rotation" });
  }
  return readings;
}

/**
 * Run one decision cycle, at a storm beat.
 *
 * `tick` indexes the fixed rotation on the non-adaptive easy tier; pass the
 * engine's own storm-cycle counter. `roll` is accepted for signature parity
 * with the other controllers but never drawn from: every tier here chooses by
 * utility, never by sampling, so the easy and normal tiers stay exactly
 * learnable and the engine's RNG stream advances identically either way.
 */
export function decideCalypso(
  ai: AIRuntime,
  model: PlayerModel,
  view: CalypsoPerception,
  difficulty: Difficulty,
  adaptive: boolean,
  tick: number,
  roll: () => number,
): CalypsoAction {
  void roll;
  const policy = calypsoPolicy(difficulty, adaptive);
  const algorithm = calypsoAlgorithm(policy, model);
  const riverRows = view.rows.length;
  const currentColumn = columnOf(view.x);
  const observations = perceptionReadings(view, policy);

  logEvent(
    ai,
    view.at,
    "perceive",
    `Odysseus on row ${view.row}, column ${currentColumn + 1}${view.lightning ? `; a bolt already marks row ${view.lightning.row}` : ""}`,
  );

  // The forecast is cheap and always computed, exactly like the cave runner's
  // own lane forecast — only `policy.predictive` decides whether anything
  // downstream actually reads it.
  const forecast = predictAfter(model, currentColumn, policy.warningMs);
  if (policy.predictive) {
    logEvent(
      ai,
      view.at,
      "remember",
      `Forecast in ${ms(policy.warningMs)}: column ${forecast.option + 1} at ${pct(forecast.probability)}${forecast.grounded ? "" : " (thin history)"}`,
    );
  } else {
    logEvent(ai, view.at, "remember", policy.tracking ? "Tracking current position and current only" : "No player memory in this policy");
  }

  // ---- Stage 3: evaluate -------------------------------------------------
  // Easy never references the player at all — not even the row he stands on —
  // which is what "no reference to the player" means literally: the mark is a
  // rotation over the river's own rows, not an aim.
  const targetRow = policy.tracking || policy.predictive ? view.row : 1 + mod(tick, riverRows);
  const validRow = targetRow >= 1 && targetRow <= riverRows;
  const rowSpeed = validRow ? view.rows[targetRow - 1].speed : 0;
  // The current carries the mark during the whole warning, exactly as it
  // carries Odysseus — tracking and prediction both fold this in; the fixed
  // rotation does not, because it consults nothing about the river either.
  const drift = policy.tracking || policy.predictive ? (rowSpeed * policy.warningMs) / 1000 : 0;
  const idealColumn = !validRow
    ? currentColumn
    : policy.predictive
      ? forecast.option
      : policy.tracking
        ? currentColumn
        : mod(tick, NUM_COLUMNS);
  const weakest = weakestOption(model);

  type Proposal = {
    id: string;
    x: number;
    column: number;
    score: number;
    note: string;
    withheld: boolean;
    safe: CalypsoTile[];
  };
  const proposals: Proposal[] = [];

  if (validRow) {
    // A small neighbourhood around the ideal column, not just the column
    // itself — the inspector should see the real alternatives considered, and
    // a neighbour sometimes survives the fairness check when the ideal column
    // does not.
    const columns = new Set([idealColumn - 1, idealColumn, idealColumn + 1].map(c => clamp(c, 0, NUM_COLUMNS - 1)));
    for (const column of columns) {
      const x = columnX(column) + drift;
      const safe = reachableSafeLandings(view, targetRow, x, policy.warningMs);
      let score: number;
      let note: string;
      if (safe.length === 0) {
        // Fairness: a tile is only ever marked when at least one reachable
        // landing survives it. With none, the mark is withheld outright.
        score = -1000;
        note = "no reachable tile stays safe if the bolt lands here — withheld";
      } else if (policy.predictive) {
        const p = forecast.distribution[column] ?? 0;
        score = p * 100;
        note = `P(column) ${pct(p)}, current ${drift >= 0 ? "+" : ""}${drift.toFixed(2)}`;
        if (weakest === column) {
          score += 12;
          note += " +12 weakest column";
        }
      } else if (policy.tracking) {
        score = column === idealColumn ? 70 : 20;
        note = column === idealColumn ? "tracks the current row, current-adjusted" : "off the tracked column";
      } else {
        score = column === idealColumn ? 60 : 15;
        note = column === idealColumn ? `fixed rotation step ${mod(tick, NUM_COLUMNS) + 1}` : "off-sequence";
      }
      proposals.push({
        id: `strike:${targetRow}:${column}`,
        x,
        column,
        score: Math.round(score * 10) / 10,
        note,
        withheld: safe.length === 0,
        safe,
      });
    }
  }

  const candidates: Candidate[] = proposals.map(p => ({ action: p.id, score: p.score, note: p.note }));
  // Holding is the floor. It wins only when fairness removed every mark, or
  // when Odysseus is standing on a shore and there is no river row to mark.
  candidates.push({
    action: "wait",
    score: 5,
    note: validRow ? "observe one more storm cycle" : "no river row under Odysseus right now",
  });

  logEvent(ai, view.at, "evaluate", candidates.map(c => `${c.action} ${c.score}`).join("  "));

  // ---- Stage 4: decide ---------------------------------------------------
  const winner = argmax(candidates);
  const withheldCount = proposals.filter(p => p.withheld).length;
  const fairnessNote =
    withheldCount > 0
      ? ` ${withheldCount} of ${proposals.length} candidate tiles were withheld because the bolt would leave no reachable safe landing.`
      : "";

  if (winner.action === "wait") {
    commitDecision(ai, view.at, {
      algorithm,
      state: "observing",
      observations,
      memory: memoryReadings(model, policy),
      candidates,
      selectedAction: "Hold — no bolt marked",
      selectedCandidate: "wait",
      reason: !validRow
        ? "Odysseus is resting on a shore this cycle, and Poseidon has no river row to mark."
        : withheldCount > 0
          ? `Every candidate tile was withheld: marking it would leave no reachable, safe landing within ${ms(policy.warningMs)}.${fairnessNote} Poseidon waits for a fairer tile.`
          : "No tile outscored holding. Poseidon waits one more storm cycle.",
    });
    ai.committed = null;
    ai.commitRemaining = 0;
    return { kind: "wait" };
  }

  const chosen = proposals.find(p => p.id === winner.action)!;
  // Only the predictive tier produced an actual probability model, so only it
  // ever shows a confidence — the honesty rule the reference files both keep.
  const confidence = policy.predictive ? clamp01(forecast.distribution[chosen.column] ?? 0) : undefined;
  const oneHop = chosen.safe.filter(tile => tile.hops <= 1).length;
  const predictedLanding = { row: targetRow, column: idealColumn, x: Math.round((columnX(idealColumn) + drift) * 100) / 100 };

  const reason = policy.predictive
    ? `Column ${chosen.column + 1} scored highest: the decayed column history puts Odysseus there with probability ${pct(forecast.distribution[chosen.column] ?? 0)} in ${ms(policy.warningMs)}, and the current carries the mark by ${drift.toFixed(2)} tiles over that window${weakest === chosen.column ? ". That column also has the worst escape record" : ""}. ${chosen.safe.length} reachable tile${chosen.safe.length === 1 ? "" : "s"} stay safe (${oneHop} within one hop).${fairnessNote}`
    : policy.tracking
      ? `Odysseus is on row ${targetRow} right now, so the mark tracks that row, carried ${drift.toFixed(2)} tiles by the current over the warning. ${chosen.safe.length} reachable tile${chosen.safe.length === 1 ? "" : "s"} stay safe (${oneHop} within one hop).${fairnessNote}`
      : `Fixed rotation reached step ${mod(tick, NUM_COLUMNS) + 1} of ${NUM_COLUMNS}, which marks row ${targetRow}, column ${chosen.column + 1}. No player history is consulted on this difficulty.${fairnessNote}`;

  const decision = commitDecision(ai, view.at, {
    algorithm,
    state: policy.predictive ? "predicting" : "preparing",
    observations,
    memory: memoryReadings(model, policy),
    candidates,
    selectedAction: `Mark row ${targetRow}, tile ${chosen.x.toFixed(1)}`,
    selectedCandidate: chosen.id,
    target: `Row ${targetRow} · tile ${chosen.x.toFixed(1)}`,
    ...(confidence === undefined ? {} : { confidence }),
    reason,
    // The warning is the telegraph: the tile is locked the instant it starts
    // and nothing here revises it before the bolt lands.
    commitMs: policy.warningMs,
    safety: { escapes: chosen.safe.length, actionFree: oneHop },
  });
  ai.committed = decision;
  ai.commitRemaining = policy.warningMs;
  ai.stats.attacks++;
  if (policy.predictive) ai.stats.predictions++;
  logEvent(
    ai,
    view.at,
    "telegraph",
    `Storm marks row ${targetRow}, tile ${chosen.x.toFixed(1)} — locked for ${ms(policy.warningMs)}`,
    decision.id,
  );

  return {
    kind: "strike",
    row: targetRow,
    x: chosen.x,
    warningMs: policy.warningMs,
    predictedLanding,
    ...(confidence === undefined ? {} : { confidence }),
    decisionId: decision.id,
  };
}

/**
 * Stage 6. Called once a marked bolt resolves, whether it struck or Odysseus
 * cleared the tile in time.
 *
 * `model` is read by the caller, not here — `observeResolution` is the
 * engine's own call, exactly as `resolveBoulder` makes it directly in the cave
 * runner, so the per-column escape counts stay owned by one call site. This
 * only scores the forecast against where Odysseus actually ended up and
 * annotates the decision record.
 */
export function learnFromStrike(
  ai: AIRuntime,
  _model: PlayerModel,
  at: number,
  decisionId: string,
  targetRow: number,
  targetColumn: number,
  actualRow: number,
  actualColumn: number,
  hit: boolean,
) {
  const decision: AIDecision | undefined = ai.decisions.find(d => d.id === decisionId);
  const correct = targetRow === actualRow && targetColumn === actualColumn;
  if (decision && !decision.outcome) {
    decision.outcome = hit ? "hit" : "dodged";
    decision.outcomeNote = correct
      ? `Odysseus was on row ${actualRow}, column ${actualColumn + 1} as marked${hit ? " and the bolt landed" : ", but cleared the tile in time"}`
      : `Marked row ${targetRow}, column ${targetColumn + 1}; Odysseus was on row ${actualRow}, column ${actualColumn + 1} — the forecast missed`;
    if (hit) ai.stats.attacksLanded++;
    if (decision.confidence !== undefined && correct) ai.stats.predictionsCorrect++;
  }
  ai.state = "adapting";
  logEvent(
    ai,
    at,
    "learn",
    `${hit ? "Lightning struck" : "Odysseus escaped"} — ${correct ? "forecast held" : `forecast missed (row ${targetRow} vs ${actualRow}, column ${targetColumn + 1} vs ${actualColumn + 1})`}; column statistics updated`,
    decisionId,
  );
}
