// FARSHORE explainable AI contract.
//
// Every opponent controller is a pure function over a perception snapshot and a
// memory record. Nothing here holds engine objects, DOM nodes, images, or
// closures: a whole runtime survives `structuredClone`, which the encounter
// engines use on every tick, and serializes for inspection.
//
// Reading this data NEVER changes opponent behaviour. The inspector UI consumes
// the same records the engine already produced for its own decisions.

import type { Chooser } from "../arcade/decisions.ts";
export type { Chooser };

export type Difficulty = "easy" | "normal" | "hard";

/** Named tiers, so policies read as intent rather than array indexes. */
export type Tier = 0 | 1 | 2;
export const tierOf = (d: Difficulty): Tier => (["easy", "normal", "hard"].indexOf(d) as Tier);
export const byTier = <T,>(d: Difficulty, easy: T, normal: T, hard: T): T => [easy, normal, hard][tierOf(d)];

export type AIState =
  | "idle"
  | "observing"
  | "pursuing"
  | "evaluating"
  | "predicting"
  | "preparing"
  | "attacking"
  | "recovering"
  | "adapting";

/** The six pipeline stages from the design document. */
export type AIStage = "perceive" | "remember" | "evaluate" | "decide" | "telegraph" | "learn";
export const STAGES: AIStage[] = ["perceive", "remember", "evaluate", "decide", "telegraph", "learn"];

/** One labelled reading. `value` is pre-formatted so the UI never recomputes game logic. */
export type Reading = { key: string; label: string; value: string; hint?: string };

/** A considered action with the score the policy actually computed for it. */
export type Candidate = { action: string; score: number; note?: string; chosen?: boolean };

export type DecisionOutcome = "hit" | "dodged" | "expired" | "correct" | "wrong" | "blocked" | "scored";

export type AIDecision = {
  /** Deterministic (`agent-seq`), so replays and seeded runs produce stable ids. */
  id: string;
  /** Simulation time in ms, not wall clock: pausing the game pauses the record. */
  at: number;
  agentId: string;
  /** The algorithm that produced this decision, named honestly. */
  algorithm: string;
  state: AIState;
  observations: Reading[];
  memory: Reading[];
  candidates: Candidate[];
  /** Human-readable sentence for the UI, e.g. "Throw boulder at Left lane". */
  selectedAction: string;
  /**
   * The `action` id of the winning candidate, e.g. "boulder:left".
   *
   * Kept separate from the readable sentence so the inspector can mark the
   * winning row by identity instead of by matching prose — the acceptance
   * criterion that selected actions match executed ones depends on it.
   */
  selectedCandidate?: string;
  target?: string;
  /**
   * Only present when a probability model produced it. Policies that pick by
   * utility alone leave it undefined and the UI shows no percentage.
   */
  confidence?: number;
  reason: string;
  /**
   * One short clause for the compact in-play panel, e.g. "Your recent moves
   * point to Right lane". The full `reason` stays available under the panel's
   * details and in the AI Lab. Controllers without one fall back to `reason`.
   */
  summary?: string;
  /** Telegraph length in ms. The target is locked for this whole window. */
  commitMs?: number;
  /**
   * The escape routes this decision left the player, counted at the moment it
   * was made.
   *
   * Recording it on the decision rather than recomputing it later is what lets
   * the fairness guarantee be checked against the instant it was actually
   * given, and lets the inspector state the promise the opponent kept.
   */
  safety?: { escapes: number; actionFree: number };
  /**
   * Set when a pretrained model picked this action from the game's checked
   * menu (or the game picked because the model could not). The candidates are
   * then the menu, scored by the game, and `chosen` marks the executed option.
   */
  chooser?: Chooser;
  /** Filled in by the learn stage once the action resolves. */
  outcome?: DecisionOutcome;
  outcomeNote?: string;
};

export type AIEvent = { at: number; stage: AIStage; text: string; decisionId?: string };

export type AIMetric = { key: string; label: string; value: string; detail?: string };

/** Counters the learn stage maintains. Only metrics a controller truly feeds are surfaced. */
export type AIStats = {
  decisions: number;
  attacks: number;
  attacksLanded: number;
  predictions: number;
  predictionsCorrect: number;
  /** Mean ms between committed decisions, maintained incrementally. */
  intervalSum: number;
  intervalCount: number;
  lastDecisionAt: number;
  /** Search effort, for controllers that search (A*, trajectory sweeps, lookahead). */
  nodesExplored: number;
  coordinationEvents: number;
  /** Menu decisions a pretrained model picked, and how many matched the game's own top option. */
  modelPicks: number;
  modelAgreed: number;
  /** Menu decisions the game had to pick because the model did not answer usably. */
  gamePicks: number;
};

export type AIRuntime = {
  agentId: string;
  /** Display name of the opposing character. */
  agentName: string;
  algorithm: string;
  state: AIState;
  seq: number;
  /** Newest last. Capped by DECISION_LIMIT. */
  decisions: AIDecision[];
  /** Newest last. Capped by EVENT_LIMIT. */
  events: AIEvent[];
  stats: AIStats;
  /** Live stage readings, refreshed every decision cycle. */
  perception: Reading[];
  memory: Reading[];
  /** The decision currently being telegraphed or executed, if any. */
  committed: AIDecision | null;
  /** ms remaining on the committed telegraph. */
  commitRemaining: number;
};

export const DECISION_LIMIT = 14;
export const EVENT_LIMIT = 44;

export function newRuntime(agentId: string, agentName: string, algorithm: string): AIRuntime {
  return {
    agentId,
    agentName,
    algorithm,
    state: "observing",
    seq: 0,
    decisions: [],
    events: [],
    stats: {
      decisions: 0,
      attacks: 0,
      attacksLanded: 0,
      predictions: 0,
      predictionsCorrect: 0,
      intervalSum: 0,
      intervalCount: 0,
      lastDecisionAt: 0,
      nodesExplored: 0,
      coordinationEvents: 0,
      modelPicks: 0,
      modelAgreed: 0,
      gamePicks: 0,
    },
    perception: [],
    memory: [],
    committed: null,
    commitRemaining: 0,
  };
}

export function logEvent(ai: AIRuntime, at: number, stage: AIStage, text: string, decisionId?: string) {
  ai.events.push({ at: Math.round(at), stage, text, ...(decisionId ? { decisionId } : {}) });
  if (ai.events.length > EVENT_LIMIT) ai.events.splice(0, ai.events.length - EVENT_LIMIT);
}

/**
 * Record a decision the policy just made. Returns the stored decision so the
 * caller can keep a reference for the learn stage.
 */
export function commitDecision(
  ai: AIRuntime,
  at: number,
  decision: Omit<AIDecision, "id" | "at" | "agentId">,
): AIDecision {
  const stored: AIDecision = { ...decision, id: `${ai.agentId}-${ai.seq}`, at: Math.round(at), agentId: ai.agentId };
  ai.seq++;
  ai.state = stored.state;
  ai.algorithm = stored.algorithm;
  ai.perception = stored.observations;
  ai.memory = stored.memory;
  ai.decisions.push(stored);
  if (ai.decisions.length > DECISION_LIMIT) ai.decisions.splice(0, ai.decisions.length - DECISION_LIMIT);
  ai.stats.decisions++;
  if (ai.stats.lastDecisionAt > 0) {
    ai.stats.intervalSum += Math.max(0, at - ai.stats.lastDecisionAt);
    ai.stats.intervalCount++;
  }
  ai.stats.lastDecisionAt = at;
  if (stored.chooser) {
    if (stored.chooser.by === "model") {
      ai.stats.modelPicks++;
      if (stored.chooser.agreed) ai.stats.modelAgreed++;
    } else ai.stats.gamePicks++;
  }
  const winner = stored.selectedCandidate ?? stored.selectedAction;
  for (const candidate of stored.candidates) candidate.chosen = candidate.action === winner;
  logEvent(ai, at, "decide", `${stored.selectedAction}${stored.target ? ` → ${stored.target}` : ""}`, stored.id);
  return stored;
}

/** Attach an outcome to a decision already in the ring buffer, and update counters. */
export function recordOutcome(
  ai: AIRuntime,
  at: number,
  decisionId: string,
  outcome: DecisionOutcome,
  note?: string,
) {
  const decision = ai.decisions.find(d => d.id === decisionId);
  if (!decision || decision.outcome) return;
  decision.outcome = outcome;
  if (note) decision.outcomeNote = note;
  if (outcome === "hit") ai.stats.attacksLanded++;
  if (outcome === "correct") ai.stats.predictionsCorrect++;
  logEvent(ai, at, "learn", note || `${decision.selectedAction}: ${outcome}`, decisionId);
}

export const averageInterval = (ai: AIRuntime) =>
  ai.stats.intervalCount > 0 ? ai.stats.intervalSum / ai.stats.intervalCount : 0;

export const predictionAccuracy = (ai: AIRuntime) =>
  ai.stats.predictions > 0 ? ai.stats.predictionsCorrect / ai.stats.predictions : null;

/** Share of model picks that matched the game's own top option; null before the model has chosen. */
export const modelAgreement = (ai: AIRuntime) =>
  ai.stats.modelPicks > 0 ? ai.stats.modelAgreed / ai.stats.modelPicks : null;

export const attackSuccessRate = (ai: AIRuntime) =>
  ai.stats.attacks > 0 ? ai.stats.attacksLanded / ai.stats.attacks : null;

/** Highest-scoring candidate. Ties resolve to the earlier entry, keeping runs deterministic. */
export function argmax(candidates: Candidate[]): Candidate {
  let best = candidates[0];
  for (const candidate of candidates) if (candidate.score > best.score) best = candidate;
  return best;
}

/**
 * Normalize scores into a probability distribution with a softmax.
 * Used only where a controller genuinely samples or reports likelihoods.
 */
export function softmax(scores: number[], temperature = 1): number[] {
  const max = Math.max(...scores);
  const exps = scores.map(s => Math.exp((s - max) / Math.max(0.0001, temperature)));
  const total = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / total);
}

export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const ms = (n: number) => `${(n / 1000).toFixed(1)}s`;
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
