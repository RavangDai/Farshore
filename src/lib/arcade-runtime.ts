import { type TrialId, type LegacyTrialId, type Difficulty, type OpponentPlan, type AttemptSummary } from "./arcade.ts";
import { newMythic, mythicAction, tickMythic, mythicSummary, type MythicState, type Action } from "./mythic.ts";
import { newAdventure, adventureAction, tickAdventure, adventureSummary, mazePath, LOTUS_SHIP, type AdventureState, type AdventureAction, type AdventureId } from "./odyssey-games.ts";

export type GameState = MythicState | AdventureState;
export type GameAction = Action | AdventureAction;
export const isAdventure = (s: GameState): s is AdventureState => "invulnerable" in s;
export const usesAdventure = (id: TrialId) => ["lotus", "cyclops", "aeolus", "calypso"].includes(id);
export function createGame(id: TrialId, difficulty: Difficulty, plan: OpponentPlan, practice: boolean, seed: number, originalCave = false): GameState {
  return usesAdventure(id) && !(originalCave && id === "cyclops") ? newAdventure(id as AdventureId, difficulty, plan, practice, seed) : newMythic(id as LegacyTrialId, difficulty, plan, practice, seed);
}
export const tickGame = (s: GameState, delta: number): GameState => isAdventure(s) ? tickAdventure(s, delta) : tickMythic(s, delta);
export function gameAction(s: GameState, action: GameAction): GameState {
  return isAdventure(s) ? adventureAction(s, action as AdventureAction) : mythicAction(s, action as Action);
}
export function gameSummary(s: GameState): AttemptSummary {
  return isAdventure(s) ? adventureSummary(s) : { ...mythicSummary(s), won: s.done && s.won, score: s.score, timeMs: Math.round(s.elapsed), difficulty: s.difficulty };
}
export function demonstrate(s: GameState): GameState {
  if (!isAdventure(s) || s.id !== "lotus" || s.moveClock > 0) return s;
  const target = s.carrying ? LOTUS_SHIP : [...s.sailors].sort((a, b) => mazePath(s.player, a).length - mazePath(s.player, b).length)[0];
  if (!target) return s;
  const next = mazePath(s.player, target)[0];
  return next ? gameAction(s, { type: "move", dx: next.x - s.player.x, dy: next.y - s.player.y }) : s;
}
