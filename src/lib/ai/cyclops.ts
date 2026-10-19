// Polyphemus: the Cyclops' Cave opponent controller.
//
// One decision cycle runs the six stages from the design document and returns
// an action for the engine to execute. The controller owns no engine state: it
// reads a perception snapshot, reads and updates the player model, writes its
// reasoning into the AI runtime, and hands back a plain action object.
//
// Three fairness invariants hold on every difficulty, and the tests assert them:
//
//   1. A throw is announced for at least `telegraphMs` before the boulder can
//      reach the player, and `telegraphMs` always exceeds the measured time a
//      lane change takes.
//   2. The target lane is chosen once, at telegraph time, and the engine never
//      lets it be re-aimed afterwards.
//   3. A lane is only targeted when the player has a reachable escape given the
//      obstacle layout that will exist at impact. With no escape, Polyphemus
//      holds the throw.

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
  dodgeBias,
  favouriteOption,
  meanReaction,
  occupancyPrior,
  predictAfter,
  weaknessOf,
  weakestOption,
  type PlayerModel,
} from "./player-model.ts";

export const LANE_NAMES = ["Left", "Centre", "Right"] as const;
export const laneName = (lane: number) => LANE_NAMES[lane] ?? "Unknown";

/** How long a committed lane change takes the player, in ms. Fairness floor. */
export const LANE_CHANGE_MS = 230;

export type CaveZone = "cave" | "collapse" | "daylight";

export type CavePerception = {
  /** Simulation time in ms. */
  at: number;
  lane: number;
  /** 0 while settled, rising to 1 across a lane change. */
  laneProgress: number;
  airborne: boolean;
  sliding: boolean;
  /** Metres between Polyphemus and Odysseus. */
  gap: number;
  /** Player forward speed in metres per second. */
  speed: number;
  lives: number;
  /**
   * Metres to the nearest obstacle that blocks each lane outright — one that no
   * jump or slide answers. Infinity means nothing blocks the lane.
   */
  laneBlocked: number[];
  /**
   * Metres to the nearest obstacle of any kind in each lane, including the ones
   * a jump or slide clears. Used to find a lane where Odysseus needs to do
   * nothing at all, which is what the fairness rule requires.
   */
  laneClear: number[];
  /** Lanes with a boulder already locked in. */
  laneTargeted: boolean[];
  zone: CaveZone;
  /** Seconds of encounter remaining, for pacing. */
  remainingMs: number;
};

export type CaveAction =
  | { kind: "wait" }
  | { kind: "roar"; commitMs: number }
  | { kind: "sprint"; commitMs: number }
  | {
      kind: "boulder";
      /** The locked lane. Never changes after this decision. */
      lane: number;
      commitMs: number;
      /** Flight time once released, in ms. */
      flightMs: number;
      predictedLane: number;
      confidence?: number;
      decisionId: string;
    };

export type CavePolicy = {
  algorithm: string;
  /** ms between decision cycles. */
  cooldownMs: number;
  /** Warning length before a boulder is released. */
  telegraphMs: number;
  /** Boulder travel time after release. */
  flightMs: number;
  /** Whether the policy consults the Markov forecast. */
  predictive: boolean;
  /** Whether the policy consults the player's current position at all. */
  tracking: boolean;
};

export function cavePolicy(difficulty: Difficulty, adaptive: boolean): CavePolicy {
  const tier = tierOf(difficulty);
  const predictive = tier === 2 || (adaptive && tier >= 1);
  return {
    algorithm: predictive
      ? "Markov lane forecast + utility choice"
      : tier >= 1 || adaptive
        ? "Lane tracking (current position)"
        : "Reactive rotation (fixed sequence)",
    cooldownMs: byTier(difficulty, 3400, 2750, 2300),
    telegraphMs: byTier(difficulty, 2050, 1550, 1250),
    flightMs: byTier(difficulty, 900, 780, 700),
    predictive,
    tracking: tier >= 1 || adaptive,
  };
}

/**
 * The safety margin, in seconds of running, added beyond a boulder's impact
 * before a lane is accepted as an escape.
 *
 * Without it the opponent could lock onto a lane whose neighbours close moments
 * after the boulder lands, which is survivable only with frame-perfect play.
 * One lane change plus one reaction is the honest allowance.
 */
export const ESCAPE_MARGIN_S = 1.1;

/**
 * Lanes Odysseus can reach and survive if a boulder is thrown at `targetLane`.
 *
 * A lane qualifies when it is not the target, carries no boulder of its own, is
 * close enough to reach inside the telegraph, and stays free of un-answerable
 * hazards until a margin past the moment of impact.
 */
export function escapeLanes(view: CavePerception, targetLane: number, horizonMs: number, speed: number): number[] {
  const horizonMetres = (speed * horizonMs) / 1000 + speed * ESCAPE_MARGIN_S;
  const reach = Math.max(1, Math.floor(horizonMs / LANE_CHANGE_MS));
  const escapes: number[] = [];
  for (let lane = 0; lane < 3; lane++) {
    if (lane === targetLane) continue;
    if (Math.abs(lane - view.lane) > reach) continue;
    if (view.laneTargeted[lane]) continue;
    if (view.laneBlocked[lane] <= horizonMetres) continue;
    escapes.push(lane);
  }
  return escapes;
}

/**
 * Escape lanes where Odysseus needs no jump or slide — he only has to be there.
 *
 * The fairness rule is stated in terms of these: a boulder is only ever thrown
 * when at least one such lane exists, so answering a committed attack never
 * demands two correct inputs in the same window.
 */
export function cleanEscapeLanes(view: CavePerception, targetLane: number, horizonMs: number, speed: number): number[] {
  const horizonMetres = (speed * horizonMs) / 1000 + speed * ESCAPE_MARGIN_S;
  return escapeLanes(view, targetLane, horizonMs, speed).filter(lane => view.laneClear[lane] > horizonMetres);
}

function perceptionReadings(view: CavePerception): Reading[] {
  return [
    { key: "lane", label: "Odysseus lane", value: laneName(view.lane), hint: view.laneProgress > 0.05 ? "mid-change" : "settled" },
    { key: "posture", label: "Posture", value: view.airborne ? "Airborne" : view.sliding ? "Sliding" : "Running" },
    { key: "gap", label: "Chase gap", value: `${Math.round(view.gap)} m` },
    { key: "speed", label: "Player speed", value: `${view.speed.toFixed(1)} m/s` },
    { key: "lives", label: "Odysseus lives", value: String(view.lives) },
    {
      key: "layout",
      label: "Lanes blocked ahead",
      value: view.laneBlocked
        .map((d, i) => (Number.isFinite(d) ? `${laneName(i)} ${Math.round(d)}m` : `${laneName(i)} clear`))
        .join(" · "),
      hint: "hazards no jump or slide answers",
    },
    {
      key: "clear",
      label: "Nearest hazard",
      value: view.laneClear
        .map((d, i) => (Number.isFinite(d) ? `${laneName(i)} ${Math.round(d)}m` : `${laneName(i)} open`))
        .join(" · "),
      hint: "any kind",
    },
    { key: "zone", label: "Cave section", value: view.zone === "cave" ? "Narrow passage" : view.zone === "collapse" ? "Collapsing hall" : "Daylight ahead" },
  ];
}

function memoryReadings(model: PlayerModel, policy: CavePolicy): Reading[] {
  const prior = occupancyPrior(model);
  const reaction = meanReaction(model);
  const weakest = weakestOption(model);
  const readings: Reading[] = [
    {
      key: "occupancy",
      label: "Lane dwell (decayed)",
      value: prior.map((p, i) => `${laneName(i)} ${pct(p)}`).join(" · "),
    },
    { key: "favourite", label: "Preferred lane", value: laneName(favouriteOption(model)) },
    {
      key: "recent",
      label: "Recent lane changes",
      value: model.recent.length > 1 ? model.recent.map(laneName).join(" → ") : "none observed",
    },
    { key: "reaction", label: "Mean reaction", value: reaction === null ? "not yet measured" : `${Math.round(reaction)} ms` },
    { key: "bias", label: "Dodge bias", value: dodgeBias(model) === "down" ? "favours left" : dodgeBias(model) === "up" ? "favours right" : "no clear side" },
  ];
  if (weakest !== null) {
    const rate = weaknessOf(model, weakest);
    readings.push({ key: "weak", label: "Weakest lane", value: `${laneName(weakest)}${rate === null ? "" : ` (${pct(rate)} failures)`}` });
  }
  if (!policy.predictive) {
    readings.push({ key: "scope", label: "Policy memory use", value: policy.tracking ? "position only" : "none — fixed sequence" });
  }
  return readings;
}

/**
 * Run one decision cycle.
 *
 * `wave` drives the easy-tier rotation and `roll` is the engine's seeded RNG, so
 * the same seed and the same inputs always produce the same decision.
 */
export function decideCave(
  ai: AIRuntime,
  model: PlayerModel,
  view: CavePerception,
  difficulty: Difficulty,
  adaptive: boolean,
  wave: number,
  roll: () => number,
): CaveAction {
  const policy = cavePolicy(difficulty, adaptive);
  const observations = perceptionReadings(view);
  const memory = memoryReadings(model, policy);
  logEvent(ai, view.at, "perceive", `Odysseus in ${laneName(view.lane)}, gap ${Math.round(view.gap)} m`);

  const horizonMs = policy.telegraphMs + policy.flightMs;
  const forecast = predictAfter(model, view.lane, horizonMs);
  if (policy.predictive) {
    logEvent(
      ai,
      view.at,
      "remember",
      `Forecast in ${ms(horizonMs)}: ${laneName(forecast.option)} at ${pct(forecast.probability)}${forecast.grounded ? "" : " (thin history)"}`,
    );
  } else {
    logEvent(ai, view.at, "remember", policy.tracking ? "Tracking current position only" : "No player memory in this policy");
  }

  // ---- Stage 3: evaluate -------------------------------------------------
  const candidates: Candidate[] = [];
  const weakest = weakestOption(model);

  // Throwing at each lane. Scores are utilities in the same arbitrary unit,
  // reported verbatim so the inspector shows the real comparison.
  const laneScores: number[] = [0, 0, 0];
  for (let lane = 0; lane < 3; lane++) {
    const escapes = escapeLanes(view, lane, horizonMs, view.speed);
    const clean = cleanEscapeLanes(view, lane, horizonMs, view.speed);
    let score: number;
    let note: string;
    if (clean.length === 0) {
      // Fairness: a throw is only ever made when Odysseus has somewhere to
      // stand that asks nothing more of him than being there.
      score = -1000;
      note = escapes.length === 0 ? "no escape lane would remain — withheld" : "no action-free escape lane — withheld";
    } else if (policy.predictive) {
      const p = forecast.distribution[lane] ?? 0;
      score = p * 100;
      note = `P(lane) ${pct(p)}`;
      if (weakest === lane) {
        score += 12;
        note += " +12 weakest lane";
      }
      // Favour a lane the layout is already squeezing: fewer alternatives for
      // the player means a throw there is worth more.
      const squeeze = (3 - clean.length) * 6;
      if (squeeze > 0) {
        score += squeeze;
        note += ` +${squeeze} layout squeeze`;
      }
      if (view.laneTargeted[lane]) {
        score -= 40;
        note += " -40 already targeted";
      }
    } else if (policy.tracking) {
      score = lane === view.lane ? 70 : 20;
      note = lane === view.lane ? "player is here now" : "not the current lane";
      if (view.laneTargeted[lane]) {
        score -= 40;
        note += " -40 already targeted";
      }
    } else {
      score = lane === wave % 3 ? 60 : 15;
      note = lane === wave % 3 ? `fixed rotation step ${wave % 3 + 1}` : "off-sequence";
    }
    laneScores[lane] = score;
    candidates.push({ action: `boulder:${laneName(lane).toLowerCase()}`, score: Math.round(score * 10) / 10, note });
  }

  // Roaring builds pressure when the player has been untouched for a while and
  // does no damage, so it stays cheap and legible.
  const roarScore = view.gap < 70 ? 34 + (70 - view.gap) * 0.35 : 12;
  candidates.push({ action: "roar", score: Math.round(roarScore * 10) / 10, note: `gap ${Math.round(view.gap)} m` });

  // Sprinting closes distance instead of attacking; worth most when far behind.
  const sprintScore = view.gap > 62 ? 30 + (view.gap - 62) * 1.4 : 8;
  candidates.push({ action: "sprint", score: Math.round(sprintScore * 10) / 10, note: `gap ${Math.round(view.gap)} m` });

  // Holding is the floor. It wins when every throw was withheld for fairness.
  candidates.push({ action: "wait", score: 5, note: "observe one more cycle" });

  logEvent(
    ai,
    view.at,
    "evaluate",
    candidates.map(c => `${c.action} ${c.score}`).join("  "),
  );

  // ---- Stage 4: decide ---------------------------------------------------
  const winner = argmax(candidates);
  const selected = winner.action;
  const withheldLanes = laneScores.filter(s => s <= -1000).length;
  // When fairness removed throws from contention, every other action's reason
  // has to say so. Reporting "nothing outscored a roar" would misdescribe the
  // decision that was actually made.
  const fairnessNote =
    withheldLanes > 0
      ? ` ${withheldLanes} of 3 lanes were withheld because a throw there would have left no action-free escape lane.`
      : "";

  if (selected.startsWith("boulder:")) {
    const lane = LANE_NAMES.findIndex(n => n.toLowerCase() === selected.slice(8));
    const clean = cleanEscapeLanes(view, lane, horizonMs, view.speed);
    const confidence = policy.predictive ? clamp01(forecast.distribution[lane] ?? 0) : undefined;
    const reason = policy.predictive
      ? `${laneName(lane)} scored highest: the decayed lane history and the observed ${laneName(view.lane)}→? transitions put Odysseus there with probability ${pct(forecast.distribution[lane] ?? 0)} in ${ms(horizonMs)}${weakest === lane ? ", and that lane has the worst escape record" : ""}. ${clean.length} action-free escape lane${clean.length === 1 ? "" : "s"} stay open.`
      : policy.tracking
        ? `Odysseus is in ${laneName(view.lane)} right now, so the throw tracks that lane. ${clean.length} action-free escape lane${clean.length === 1 ? "" : "s"} stay open.`
        : `Fixed rotation reached step ${(wave % 3) + 1}, which targets ${laneName(lane)}. No player history is consulted on this difficulty.`;
    const decision = commitDecision(ai, view.at, {
      algorithm: policy.algorithm,
      state: policy.predictive ? "predicting" : "preparing",
      observations,
      memory,
      candidates,
      selectedAction: `Throw boulder at ${laneName(lane)} lane`,
      selectedCandidate: selected,
      target: `${laneName(lane)} lane`,
      ...(confidence === undefined ? {} : { confidence }),
      reason,
      commitMs: policy.telegraphMs,
    });
    ai.committed = decision;
    ai.commitRemaining = policy.telegraphMs;
    ai.stats.attacks++;
    if (policy.predictive) ai.stats.predictions++;
    logEvent(ai, view.at, "telegraph", `Winding up — ${laneName(lane)} locked for ${ms(policy.telegraphMs)}`, decision.id);
    return {
      kind: "boulder",
      lane,
      commitMs: policy.telegraphMs,
      flightMs: policy.flightMs,
      predictedLane: forecast.option,
      ...(confidence === undefined ? {} : { confidence }),
      decisionId: decision.id,
    };
  }

  if (selected === "roar") {
    const decision = commitDecision(ai, view.at, {
      algorithm: policy.algorithm,
      state: "pursuing",
      observations,
      memory,
      candidates,
      selectedAction: "Roar",
      selectedCandidate: "roar",
      reason: `A roar scored highest this cycle. The gap is ${Math.round(view.gap)} m, so Polyphemus presses the chase instead of committing a boulder.${fairnessNote}`,
      commitMs: 700,
    });
    ai.committed = decision;
    ai.commitRemaining = 700;
    return { kind: "roar", commitMs: 700 };
  }

  if (selected === "sprint") {
    const decision = commitDecision(ai, view.at, {
      algorithm: policy.algorithm,
      state: "pursuing",
      observations,
      memory,
      candidates,
      selectedAction: "Sprint to close the gap",
      selectedCandidate: "sprint",
      reason: `At ${Math.round(view.gap)} m Polyphemus is too far back for a throw to matter, so closing distance scored highest.${fairnessNote}`,
      commitMs: 900,
    });
    ai.committed = decision;
    ai.commitRemaining = 900;
    return { kind: "sprint", commitMs: 900 };
  }

  commitDecision(ai, view.at, {
    algorithm: policy.algorithm,
    state: "observing",
    observations,
    memory,
    candidates,
    selectedAction: "Hold — no committed action",
    selectedCandidate: "wait",
    reason:
      withheldLanes > 0
        ? `${withheldLanes} of 3 lanes were withheld because a throw there would have left Odysseus no action-free escape lane. Polyphemus waits for a fair opening.`
        : "No action outscored holding position. Polyphemus keeps watching.",
  });
  ai.committed = null;
  ai.commitRemaining = 0;
  // `roll` keeps the signature uniform with the other controllers and keeps the
  // engine's RNG stream advancing identically whichever branch is taken.
  void roll;
  return { kind: "wait" };
}

/**
 * Stage 6. Called once a thrown boulder resolves.
 *
 * The prediction is scored against where the player actually was, which is how
 * the inspector can honestly report a failed forecast. Per-lane escape counts
 * are owned by the engine's `observeResolution` call, so this only annotates the
 * decision record and updates the forecast counters.
 */
export function learnFromThrow(
  ai: AIRuntime,
  _model: PlayerModel,
  at: number,
  decisionId: string,
  targetLane: number,
  actualLane: number,
  hit: boolean,
) {
  const decision: AIDecision | undefined = ai.decisions.find(d => d.id === decisionId);
  const correct = targetLane === actualLane;
  if (decision && !decision.outcome) {
    decision.outcome = hit ? "hit" : "dodged";
    decision.outcomeNote = correct
      ? `Odysseus was in ${laneName(actualLane)} as forecast${hit ? " and the boulder landed" : ", but cleared it"}`
      : `Forecast ${laneName(targetLane)}, actual ${laneName(actualLane)} — prediction failed`;
    if (hit) ai.stats.attacksLanded++;
    if (decision.confidence !== undefined && correct) ai.stats.predictionsCorrect++;
  }
  ai.state = "adapting";
  logEvent(
    ai,
    at,
    "learn",
    `${hit ? "Boulder landed" : "Odysseus dodged"} — ${correct ? "forecast held" : `forecast missed (${laneName(targetLane)} vs ${laneName(actualLane)})`}; lane statistics updated`,
    decisionId,
  );
}
