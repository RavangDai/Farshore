// Projections from engine state onto the AI inspector's feed.
//
// Each encounter contributes a feed: the opponent's runtime, the metrics that
// actually mean something for that genre, and an optional probability
// distribution to chart. Nothing here computes AI behaviour — it only selects
// and formats what the controller already recorded. A metric with no backing
// data is omitted rather than filled with a placeholder.

import type { InspectorFeed } from "../../components/ai/ai-inspector";
import { laneName } from "./cyclops.ts";
import { dodgeBias, meanReaction, occupancyPrior, predictAfter } from "./player-model.ts";
import { DOCTRINE_LABELS, cavePolicy } from "./cyclops.ts";
import { ZONE_NAMES } from "./polyphemus.ts";
import { commitDecision, newRuntime, type AIMetric, type AIRuntime, type Difficulty } from "./types.ts";
import type { PlanId, TrialId } from "../arcade/arcade.ts";
import type { CaveState } from "../encounters/cave-runner.ts";
import { BOW, draughtAllowance, songBeat, type BowState, type SongState } from "../encounters/mythic.ts";
import { laneRecords, noteName, perNoteBudgetMs, weakestLane } from "./sirens.ts";
import { ATHENA_COUNSEL } from "./athena.ts";

/** What each pre-round plan changes in the five encounters without live in-game decisions. */
export const PLAN_EFFECTS: Partial<Record<TrialId, Partial<Record<PlanId, string>>>> = {
  lotus: {
    patrol: "Guardians follow their garden paths.",
    pincer: "From Medium up, once you are seen, the second guardian circles round to cut you off.",
    undertow: "From Medium up, the second guardian takes the junction ahead of you, or the path home while you carry a sailor.",
  },
  aeolus: {
    patrol: "The wind gates follow a gentle wave.",
    pincer: "The wind-gate openings swing higher and lower.",
    undertow: "From Medium up, counter-gusts answer the rhythm of your lifts.",
  },
  calypso: {
    patrol: "Lightning is telegraphed and ignores where you are heading.",
    pincer: "Lightning comes more often, aimed at the timber you stand on.",
    undertow: "From Medium up, lightning aims where the current will carry you.",
  },
  circe: {
    brew: "Circe brews one potion at a time.",
    chain: "Circe plans two drops ahead and sends her curses as soon as she brews them.",
    hoard: "Circe plans two drops ahead and banks her curses until your board is crowded.",
  },
  scylla: {
    patrol: "Each head strikes in turn along a fixed ladder.",
    pincer: "Heads strike around your shield while Charybdis pulls.",
    undertow: "Charybdis pulls hardest while a head is striking.",
  },
};

/**
 * A runtime holding the one decision a model makes in these encounters: the
 * plan it chose before the round. Built once per round, so the inspector shows
 * every encounter's AI, including the ones it does not steer live.
 */
export function planRuntime(id: TrialId, character: string, planId: PlanId, label: string): AIRuntime {
  const runtime = newRuntime(id, character, "Model-chosen plan, executed by the game's own rules");
  const effect = PLAN_EFFECTS[id]?.[planId] ?? "The rival follows the game's fixed rules.";
  commitDecision(runtime, 0, {
    algorithm: runtime.algorithm,
    state: "pursuing",
    observations: [{ key: "plan", label: "Rival plan", value: label }],
    memory: [{ key: "recent", label: "What the model read", value: "your last two attempts at this encounter" }],
    candidates: [],
    selectedAction: label,
    reason: `Your AI rival chose this plan from two before the round. ${effect} The game carries it out with its own rules, timings and scoring.`,
    summary: effect,
  });
  return runtime;
}

/** The compact feed for an encounter the model planned before the round. */
export function planFeed(runtime: AIRuntime, difficulty: Difficulty, elapsed: number, live: AIMetric[]): InspectorFeed {
  return { runtime, difficulty, elapsed, headline: runtime.decisions[0]?.selectedAction, metrics: [{ key: "when", label: "When the model decides", value: "once, before the round", detail: "the game's rules carry the plan out" }, ...live] };
}

/**
 * Antinous in the hall. While the model weighs his next arrow, the menu it is
 * choosing from is shown live, with the numbers the game measured for each.
 */
export function bowFeed(s: BowState): InspectorFeed {
  const pending = s.decision && !s.decision.choice && !s.decision.failed ? s.decision.menu : undefined;
  const allowance = draughtAllowance(s.wind, s.difficulty);
  const blocks = s.ai.stats.attacks;
  const metrics: AIMetric[] = [
    { key: "draught", label: "Draught", value: s.wind ? `${s.wind > 0 ? "right" : "left"}, ${allowance.words}` : "still", detail: "the allowance into the wind, in hole widths" },
    { key: "score", label: "Contest", value: `You ${s.score} · Antinous ${s.rivalScore}`, detail: `arrow ${s.turn} of ${s.practice ? 1 : BOW.turns}; ties go to Antinous` },
    { key: "blocks", label: "Block shots that cost you", value: blocks ? `${s.ai.stats.attacksLanded} of ${blocks}` : "none yet", detail: "judged against the same arrow through an open axe" },
    { key: "counsel", label: "Athena's counsel", value: `${s.counsel} of ${ATHENA_COUNSEL} asked`, detail: "counsel costs no medal" },
  ];
  const latest = s.ai.decisions.at(-1);
  const headline = pending ? `Choosing from ${pending.options.length} measured shots` : s.phase === "player" ? "Watching your shot" : latest ? latest.selectedAction : "Observing";
  return { runtime: s.ai, difficulty: s.difficulty, metrics, headline, elapsed: s.elapsed, ...(pending ? { pending } : {}) };
}

/**
 * The Sirens. Between melodies, the menu of fair melodies the model is
 * choosing from is shown live; during a melody, the one it chose.
 */
export function songFeed(s: SongState): InspectorFeed {
  const pending = s.decision && !s.decision.choice && !s.decision.failed ? s.decision.menu : undefined;
  const weak = weakestLane(s.model), records = laneRecords(s.model), pace = perNoteBudgetMs(s.model);
  const metrics: AIMetric[] = [
    { key: "temptation", label: "Temptation", value: `${Math.min(100, Math.round(s.temptation))}%`, detail: "the Sirens win at 100%" },
    { key: "tempo", label: "Tempo", value: `${Math.round(songBeat(s))} ms per note`, detail: "kept between 440 and 900 ms" },
    { key: "pace", label: "Your reply pace", value: pace.measured === null ? "not yet measured" : `${Math.round(pace.measured)} ms per note`, detail: pace.measured === null ? "measured from your first timed reply" : `over ${pace.replies} replies` },
    { key: "weak", label: "Your weakest lane", value: weak === null ? "none yet" : `${noteName(weak)} (${records[weak].missed} of ${records[weak].asked} missed)`, detail: "needs two answers on a lane before it counts" },
  ];
  const headline = pending ? "Choosing the next melody" : s.phase === "listen" ? "Singing" : s.phase === "reply" ? "Listening to your echo" : "Between melodies";
  return { runtime: s.ai, difficulty: s.difficulty, metrics, headline, elapsed: s.elapsed, ...(pending ? { pending } : {}) };
}

export function caveFeed(s: CaveState): InspectorFeed {
  const policy = cavePolicy(s.difficulty, s.plan.source === "ai", s.doctrine ?? undefined);
  const pending = s.decision && !s.decision.choice && !s.decision.failed ? s.decision.menu : undefined;
  const reaction = meanReaction(s.model);
  const horizon = policy.telegraphMs + policy.flightMs;

  const metrics: AIMetric[] = [
    {
      key: "cadence",
      label: "Decision cadence",
      value: `${(policy.cooldownMs / 1000).toFixed(1)}s`,
      detail: "fixed interval, not every frame",
    },
    {
      key: "telegraph",
      label: "Warning window",
      value: `${(policy.telegraphMs / 1000).toFixed(2)}s`,
      detail: "target locked for the whole window",
    },
    {
      key: "reaction",
      label: "Your mean reaction",
      value: reaction === null ? "not yet measured" : `${Math.round(reaction)} ms`,
      detail: reaction === null ? "measured only against a locked telegraph" : "time from a lock to your answer",
    },
    {
      key: "bias",
      label: "Your dodge bias",
      value: dodgeBias(s.model) === "down" ? "leftward" : dodgeBias(s.model) === "up" ? "rightward" : "no clear side",
      detail: `${s.model.dodgeDown} left · ${s.model.dodgeUp} right`,
    },
    { key: "gap", label: "Chase gap", value: `${Math.round(s.cyclops.gap)} m`, detail: s.cyclops.state },
  ];

  // Only the predictive policy produces a distribution worth charting; the
  // others would be showing a uniform prior dressed up as a forecast.
  const distribution = policy.predictive
    ? (() => {
        const forecast = predictAfter(s.model, s.lane, horizon);
        const committed = s.cyclops.state === "winding" ? s.cyclops.windLane : -1;
        return forecast.distribution.map((value, lane) => ({
          label: laneName(lane),
          value,
          highlight: lane === (committed >= 0 ? committed : forecast.option),
        }));
      })()
    : undefined;

  const headline =
    s.cyclops.state === "winding" && s.cyclops.windLane >= 0
      ? `${laneName(s.cyclops.windLane)} lane · ${(s.cyclops.timer / 1000).toFixed(1)}s`
      : s.cyclops.state === "chasing"
        ? "Observing"
        : s.cyclops.state;

  if (!policy.predictive) {
    metrics.push({
      key: "scope",
      label: "Player model in use",
      value: policy.tracking ? "current position only" : "none",
      detail: policy.tracking
        ? "this policy reads where you are, not where you tend to go"
        : "this policy follows a fixed sequence",
    });
  } else {
    const prior = occupancyPrior(s.model);
    metrics.push({
      key: "dwell",
      label: "Lane dwell",
      value: prior.map((p, i) => `${laneName(i)[0]} ${Math.round(p * 100)}%`).join(" · "),
      detail: "exponentially decayed, so old habits fade",
    });
  }

  // A compact cue for the in-play panel: the lane the player is in now and,
  // only while a throw is locked, the lane it is aimed at.
  const aimed = s.cyclops.state === "winding" ? s.cyclops.windLane : -1;
  const lanes = [0, 1, 2].map(lane => ({ label: laneName(lane), target: lane === aimed, player: lane === s.lane }));

  if (s.doctrine) {
    metrics.unshift({
      key: "doctrine",
      label: "Section plan",
      value: DOCTRINE_LABELS[s.doctrine],
      detail: s.section ? `chosen for ${ZONE_NAMES[s.section.zone]}` : "set by the briefing plan for the narrow passage",
    });
  }
  return { runtime: s.ai, difficulty: s.difficulty, metrics, distribution, headline, lanes, elapsed: s.elapsed, ...(pending ? { pending } : {}) };
}
