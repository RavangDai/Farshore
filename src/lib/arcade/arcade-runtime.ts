import { type TrialId, type LegacyTrialId, type Difficulty, type OpponentPlan, type AttemptSummary } from "./arcade.ts";
import { newMythic, mythicAction, tickMythic, mythicSummary, type BowState, type MythicState, type SongState, type Action } from "../encounters/mythic.ts";
import { newAdventure, adventureAction, tickAdventure, adventureSummary, mazePath, type AdventureState, type AdventureAction, type AdventureId } from "../encounters/odyssey-games.ts";
import {
  newCave,
  caveAction,
  caveChoice,
  tickCave,
  caveSummary,
  type CaveInput,
  type CaveState,
} from "../encounters/cave-runner.ts";
import type { AIRuntime } from "../ai/types.ts";
import type { ChoiceAction, DecisionMenu } from "./decisions.ts";

export type GameState = MythicState | AdventureState | CaveState;
export type GameAction = Action | AdventureAction | CaveInput;

/** The perspective runner, which carries its own explainable AI runtime. */
export const isCave = (s: GameState): s is CaveState => s.id === "cyclops" && "cyclops" in s;
export const isAdventure = (s: GameState): s is AdventureState => "invulnerable" in s && !isCave(s);
/** The contest of the twelve axes, drawn in the 3D hall. */
export const isBow = (s: GameState): s is BowState => s.id === "bow";
export const usesAdventure = (id: TrialId) => ["lotus", "cyclops", "aeolus", "calypso"].includes(id);

export function createGame(
  id: TrialId,
  difficulty: Difficulty,
  plan: OpponentPlan,
  practice: boolean,
  seed: number,
  originalCave = false,
  /** A live round, where a pretrained model makes the rival's in-game decisions. */
  modelDecisions = false,
): GameState {
  // The cave is the perspective runner. Its predecessors stay reachable: the
  // original grid-stealth tactics remain playable from the briefing, and the
  // earlier lane engine is still covered by its own regression tests.
  if (id === "cyclops" && !originalCave) return newCave(difficulty, plan, practice, seed, { modelDecisions });
  return usesAdventure(id) && !(originalCave && id === "cyclops")
    ? newAdventure(id as AdventureId, difficulty, plan, practice, seed)
    : newMythic(id as LegacyTrialId, difficulty, plan, practice, seed, { modelDecisions });
}

export const tickGame = (s: GameState, delta: number): GameState =>
  isCave(s) ? tickCave(s, delta) : isAdventure(s) ? tickAdventure(s, delta) : tickMythic(s, delta);

export function gameAction(s: GameState, action: GameAction): GameState {
  if (isCave(s)) {
    // The cave takes lateral intent, a jump, or a slide. Vertical `move`
    // actions from the shared input layer map onto jump and slide.
    const a = action as AdventureAction | CaveInput | ChoiceAction;
    if (a.type === "choose" || a.type === "choose-failed") return caveChoice(s, a);
    if (a.type === "jump" || a.type === "slide") return caveAction(s, a);
    if (a.type === "move") {
      const move = a as { type: "move"; dx: number; dy?: number };
      if (move.dx) return caveAction(s, { type: "move", dx: move.dx });
      if (move.dy !== undefined && move.dy < 0) return caveAction(s, { type: "jump" });
      if (move.dy !== undefined && move.dy > 0) return caveAction(s, { type: "slide" });
      return s;
    }
    return s;
  }
  return isAdventure(s) ? adventureAction(s, action as AdventureAction) : mythicAction(s, action as Action);
}

export function gameSummary(s: GameState): AttemptSummary {
  if (isCave(s)) return caveSummary(s);
  return isAdventure(s)
    ? adventureSummary(s)
    : { ...mythicSummary(s), won: s.done && s.won, score: s.score, timeMs: Math.round(s.elapsed), difficulty: s.difficulty };
}

/** The AI runtime for engines that expose one, for the inspector to read. */
export const isSong = (s: GameState): s is SongState => s.id === "sirens";
export const aiRuntimeOf = (s: GameState): AIRuntime | null => (isCave(s) || isBow(s) || isSong(s) ? s.ai : null);

/** The menu an engine is waiting on the model to choose from, if any. */
export function pendingMenu(s: GameState): DecisionMenu | null {
  const pending = isBow(s) || isSong(s) || isCave(s) ? s.decision : null;
  return pending && !pending.choice && !pending.failed ? pending.menu : null;
}

export function demonstrate(s: GameState): GameState {
  if (!isAdventure(s) || s.id !== "lotus" || s.moveClock > 0) return s;
  const maze = s.layout.maze, target = s.carrying ? s.layout.ship : [...s.sailors].sort((a, b) => mazePath(s.player, a, maze).length - mazePath(s.player, b, maze).length)[0];
  if (!target) return s;
  const step = mazePath(s.player, target, maze)[0];
  if (!step) return s;
  return gameAction(s, { type: "move", dx: step.x - s.player.x, dy: step.y - s.player.y });
}
