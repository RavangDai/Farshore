// Online behavioural model of the player over a small discrete choice set
// (three running lanes, four rhythm lanes, raft columns).
//
// This is online statistics, not machine learning, and the UI says so. Three
// signals are maintained, each from observations the opponent could plausibly
// make: where the player spends time, which move follows which, and how long
// they take to answer a telegraph.
//
// Everything is plain arrays and numbers so a model survives structuredClone.

import { clamp01 } from "./types.ts";

export type PlayerModel = {
  options: number;
  /** Time-weighted ms spent on each option. Decays, so old habits fade. */
  occupancy: number[];
  /** transitions[from][to] — counts, Laplace-smoothed at read time. */
  transitions: number[][];
  /** Most recent choices, newest last. */
  recent: number[];
  /** Mean ms between a locked telegraph and the player's evasive input. */
  reactionSum: number;
  reactionCount: number;
  /** How often the player escaped by moving down-index vs up-index. */
  dodgeDown: number;
  dodgeUp: number;
  /** Per-option count of answered-in-time escapes and failures. */
  escapes: number[];
  failures: number[];
  /** Total observations folded in; gates how much the model is trusted. */
  samples: number;
};

export const RECENT_LIMIT = 10;

export function newPlayerModel(options: number, start = 0): PlayerModel {
  return {
    options,
    occupancy: Array(options).fill(0),
    transitions: Array.from({ length: options }, () => Array(options).fill(0)),
    recent: [start],
    reactionSum: 0,
    reactionCount: 0,
    dodgeDown: 0,
    dodgeUp: 0,
    escapes: Array(options).fill(0),
    failures: Array(options).fill(0),
    samples: 0,
  };
}

/** Fold in dwell time on the option the player currently occupies. */
export function observeDwell(model: PlayerModel, option: number, dt: number, halfLifeMs = 9000) {
  if (option < 0 || option >= model.options) return;
  // Exponential decay keeps the window recent without storing a history buffer.
  const decay = Math.pow(0.5, dt / halfLifeMs);
  for (let i = 0; i < model.options; i++) model.occupancy[i] *= decay;
  model.occupancy[option] += dt;
}

/** Fold in a deliberate change of option. */
export function observeChoice(model: PlayerModel, option: number) {
  if (option < 0 || option >= model.options) return;
  const from = model.recent[model.recent.length - 1];
  if (from !== undefined && from !== option) {
    model.transitions[from][option]++;
    if (option < from) model.dodgeDown++;
    else model.dodgeUp++;
  }
  model.recent.push(option);
  if (model.recent.length > RECENT_LIMIT) model.recent.shift();
  model.samples++;
}

/** Fold in how quickly the player answered a telegraph that had already locked. */
export function observeReaction(model: PlayerModel, delayMs: number) {
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 6000) return;
  model.reactionSum += delayMs;
  model.reactionCount++;
}

export function observeResolution(model: PlayerModel, option: number, escaped: boolean) {
  if (option < 0 || option >= model.options) return;
  if (escaped) model.escapes[option]++;
  else model.failures[option]++;
}

export const meanReaction = (model: PlayerModel) =>
  model.reactionCount > 0 ? model.reactionSum / model.reactionCount : null;

/** The option the player has dwelt on most within the decayed window. */
export function favouriteOption(model: PlayerModel): number {
  let best = 0;
  for (let i = 1; i < model.options; i++) if (model.occupancy[i] > model.occupancy[best]) best = i;
  return best;
}

/**
 * Observation needed, in ms of decayed dwell, before the prior is trusted on
 * its own. Below this it is blended toward uniform.
 */
export const PRIOR_EVIDENCE_MS = 7000;

/**
 * Occupancy as a distribution, weighted by how much has been observed.
 *
 * Standing in one lane for two seconds is not evidence that the player always
 * uses it, so an early prior stays close to uniform. Without this the opponent
 * would report a 100% forecast from its first few seconds of watching.
 */
export function occupancyPrior(model: PlayerModel): number[] {
  const uniform = 1 / model.options;
  const total = model.occupancy.reduce((a, b) => a + b, 0);
  if (total <= 0) return Array(model.options).fill(uniform);
  const evidence = clamp01(total / PRIOR_EVIDENCE_MS);
  return model.occupancy.map(n => (n / total) * evidence + uniform * (1 - evidence));
}

/**
 * P(next option | current option).
 *
 * The transition row is Laplace-smoothed and then blended toward the occupancy
 * prior. The blend weight rises with the number of transitions actually seen
 * from this option, so an unobserved player yields a near-uniform forecast
 * instead of a confident guess. This is the number reported as "confidence".
 */
export function predictDistribution(model: PlayerModel, current: number): number[] {
  const prior = occupancyPrior(model);
  if (current < 0 || current >= model.options) return prior;
  const row = model.transitions[current];
  const seen = row.reduce((a, b) => a + b, 0);
  // A player who has not moved yet is most likely to stay; weight the diagonal
  // by observed dwell rather than inventing a transition.
  const smoothed = row.map((n, i) => n + (i === current ? 1.5 : 0.5));
  const smoothedTotal = smoothed.reduce((a, b) => a + b, 0);
  const markov = smoothed.map(n => n / smoothedTotal);
  const trust = clamp01(seen / 6);
  return markov.map((p, i) => p * trust + prior[i] * (1 - trust));
}

export type Prediction = {
  option: number;
  probability: number;
  distribution: number[];
  /** True once enough transitions exist for the Markov row to lead the blend. */
  grounded: boolean;
};

export function predict(model: PlayerModel, current: number): Prediction {
  const distribution = predictDistribution(model, current);
  let option = 0;
  for (let i = 1; i < distribution.length; i++) if (distribution[i] > distribution[option]) option = i;
  const seen = current >= 0 && current < model.options
    ? model.transitions[current].reduce((a, b) => a + b, 0)
    : 0;
  return { option, probability: distribution[option], distribution, grounded: seen >= 3 };
}

/**
 * Where the player is likely to be after `horizonMs`.
 *
 * Below one mean reaction time they have no time to commit a new move, so the
 * forecast stays on the current option. Past that the single-step Markov
 * forecast applies. The opponent therefore respects the player's own movement
 * constraints instead of assuming instant repositioning.
 */
export function predictAfter(model: PlayerModel, current: number, horizonMs: number): Prediction {
  const reaction = meanReaction(model) ?? 420;
  if (horizonMs < reaction * 0.8) {
    const distribution = Array(model.options).fill(0);
    distribution[Math.max(0, Math.min(model.options - 1, current))] = 1;
    return { option: current, probability: 1, distribution, grounded: false };
  }
  return predict(model, current);
}

export const dodgeBias = (model: PlayerModel): "down" | "up" | "even" => {
  const total = model.dodgeDown + model.dodgeUp;
  if (total < 4) return "even";
  if (model.dodgeDown >= model.dodgeUp * 2) return "down";
  if (model.dodgeUp >= model.dodgeDown * 2) return "up";
  return "even";
};

/** Failure rate on one option, or null when it has never been contested there. */
export function weaknessOf(model: PlayerModel, option: number): number | null {
  const attempts = model.escapes[option] + model.failures[option];
  return attempts > 0 ? model.failures[option] / attempts : null;
}

/** The option the player has defended worst, among those tested at least twice. */
export function weakestOption(model: PlayerModel): number | null {
  let best: number | null = null;
  let worst = -1;
  for (let i = 0; i < model.options; i++) {
    const attempts = model.escapes[i] + model.failures[i];
    if (attempts < 2) continue;
    const rate = model.failures[i] / attempts;
    if (rate > worst) {
      worst = rate;
      best = i;
    }
  }
  return worst > 0 ? best : null;
}
