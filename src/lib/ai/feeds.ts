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
import { cavePolicy } from "./cyclops.ts";
import type { AIMetric } from "./types.ts";
import type { CaveState } from "../encounters/cave-runner.ts";

export function caveFeed(s: CaveState): InspectorFeed {
  const policy = cavePolicy(s.difficulty, s.plan.source === "ai");
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

  return { runtime: s.ai, difficulty: s.difficulty, metrics, distribution, headline, elapsed: s.elapsed };
}
