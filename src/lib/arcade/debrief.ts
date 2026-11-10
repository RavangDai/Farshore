// The rival's debrief: what the game measured about the player this round,
// and what the rival chose. The numbers here are the engine's own; the model
// only puts them into the rival's words, and the server rejects any debrief
// that quotes a number not found here.

import type { GameState } from "./arcade-runtime.ts";
import { isBow, isCave, isSong } from "./arcade-runtime.ts";
import type { DebriefPick, DebriefRequest, Facts } from "./decisions.ts";
import { meanReaction } from "../ai/player-model.ts";
import { laneName } from "../ai/cyclops.ts";
import { ZONE_NAMES, HAZARD_WORDS, type HazardKind } from "../ai/polyphemus.ts";
import { NOTE_NAMES, perNoteBudgetMs } from "../ai/sirens.ts";
import type { AIDecision } from "../ai/types.ts";

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

/** Picks recorded on the runtime: each a decision a model (or the game, standing in) chose from a menu. */
function menuPicks(decisions: AIDecision[], point: (d: AIDecision) => string): DebriefPick[] {
  return decisions
    .filter(d => d.chooser)
    .slice(-8)
    .map(d => ({ point: point(d), label: d.selectedAction.slice(0, 60), by: d.chooser!.by, outcome: (d.outcomeNote ?? "no result recorded").slice(0, 80) }));
}
const reading = (d: AIDecision, key: string) => d.observations.find(r => r.key === key)?.value ?? "";

/** The game's own account of the round, shown on the results screen and handed to the model. */
export function debriefFacts(s: GameState): Facts | null {
  if (isCave(s)) {
    const facts: Facts = {
      "time in each lane": [0, 1, 2].map(lane => `${laneName(lane)} ${seconds(s.laneMs[lane])}`).join(", "),
      "boulders thrown": s.ai.stats.attacks,
      "boulders that hit": s.ai.stats.attacksLanded,
      "hits taken": s.hits,
      "sheep saved": s.sheepSaved,
    };
    const reaction = meanReaction(s.model);
    if (reaction !== null) facts["mean reaction"] = `${Math.round(reaction)} ms`;
    for (const kind of ["jump", "slide", "lane"] as HazardKind[]) {
      const { met, failed } = s.hazards[kind];
      if (met > 0) facts[HAZARD_WORDS[kind]] = `${failed} of ${met} failed`;
    }
    return facts;
  }
  if (isBow(s)) {
    return {
      "your arrows": s.shots.join(", ") || "none",
      "his arrows": s.rivalShots.join(", ") || "none",
      "your total": s.score,
      "his total": s.rivalScore,
      "block shots that cost you": `${s.ai.stats.attacksLanded} of ${s.ai.stats.attacks}`,
      "questions to Athena": s.counsel,
    };
  }
  if (isSong(s)) {
    const pace = perNoteBudgetMs(s.model).measured;
    const facts: Facts = {
      "melodies echoed cleanly": s.successes,
      "notes missed": s.misses,
      "missed by lane": NOTE_NAMES.map((name, lane) => `${name} ${s.laneMisses[lane]}`).join(", "),
      "temptation at the end": `${Math.min(100, Math.round(s.temptation))}%`,
    };
    if (pace !== null) facts["your reply pace"] = `${Math.round(pace)} ms per note`;
    return facts;
  }
  return null;
}

export function debriefRequest(s: GameState): DebriefRequest | null {
  const facts = debriefFacts(s);
  if (!facts) return null;
  const trialId = isBow(s) ? "bow" : isSong(s) ? "sirens" : "cyclops";
  const picks: DebriefPick[] = isCave(s)
    ? s.plans.map(p => ({ point: `Plan for ${ZONE_NAMES[p.zone]}`, label: p.label, by: p.by, outcome: p.outcome }))
    : isBow(s)
      ? menuPicks(s.ai.decisions, d => `Arrow ${reading(d, "arrow")}`)
      : isSong(s)
        ? menuPicks(s.ai.decisions, d => `Melody ${reading(d, "round").replace(/^Round (\d+).*/, "$1")}`)
        : [];
  return { kind: "debrief", trialId, difficulty: s.difficulty, won: s.done && s.won, facts, picks };
}
