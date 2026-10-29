// Pure data shapes and projections for the AI Lab / Professor mode.
//
// Kept separate from the ai-lab-mode component (which is .tsx and therefore
// cannot be loaded by a type-stripping-only runtime) so this logic is directly
// testable with the same `node --experimental-strip-types --test` harness the
// rest of the engine uses.

import type { Difficulty, TrialId } from "../arcade/arcade.ts";
import { averageInterval, attackSuccessRate, predictionAccuracy, type AIRuntime } from "./types.ts";

/**
 * One finished AI Lab run, kept for side-by-side comparison.
 *
 * Only values the opponent genuinely recorded are stored. A controller that
 * makes no probabilistic forecast leaves `accuracy` null, and the table says so
 * rather than printing a zero.
 */
export type LabRun = {
  id: number;
  trial: TrialId;
  difficulty: Difficulty;
  seed: number;
  algorithm: string;
  agent: string;
  decisions: number;
  intervalMs: number;
  accuracy: number | null;
  attackRate: number | null;
  attacks: number;
  nodesExplored: number;
  coordinationEvents: number;
  score: number;
  elapsedMs: number;
  won: boolean;
};

/** The minimal shape of a finished encounter state this projection needs. */
export type LabFinishedState = {
  id: TrialId;
  difficulty: Difficulty;
  score: number;
  elapsed: number;
  done: boolean;
  won: boolean;
};

export function labRunFrom(state: LabFinishedState, runtime: AIRuntime, seed: number, id: number): LabRun {
  return {
    id,
    trial: state.id,
    difficulty: state.difficulty,
    seed,
    algorithm: runtime.algorithm,
    agent: runtime.agentName,
    decisions: runtime.stats.decisions,
    intervalMs: Math.round(averageInterval(runtime)),
    accuracy: predictionAccuracy(runtime),
    attackRate: attackSuccessRate(runtime),
    attacks: runtime.stats.attacks,
    nodesExplored: runtime.stats.nodesExplored,
    coordinationEvents: runtime.stats.coordinationEvents,
    score: Math.round(state.score),
    elapsedMs: Math.round(state.elapsed),
    won: state.done && state.won,
  };
}

export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

export type LabSettings = {
  trial: TrialId;
  difficulty: Difficulty;
  /** Hold the seed across difficulties so the comparison is like-for-like. */
  seeded: boolean;
  seed: number;
  showPrediction: boolean;
  showHistory: boolean;
};
