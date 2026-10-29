// The Unbound Winds: Aeolus' wind-field opponent controller.
//
// One decision cycle runs at a gust point — the moment the engine's own
// gustClock is ready for a new value — and returns the force to add to
// gravity for the next cycle. The controller owns no engine state: it reads
// a perception snapshot, writes its reasoning into the AI runtime, and hands
// back a plain action object.
//
// Unlike Polyphemus and the Sirens this file keeps no PlayerModel. Aeolus has
// no discrete choice set to track occupancy or transitions over — a tap is
// an instant event, not a pick among options — and the one signal that
// matters, tap rhythm, is already the engine's own capped history
// (`liftHistory`). There is nothing left to remember that the perception
// snapshot does not already carry, so `decideAeolus` takes no model
// argument; see the `wiring` note this file ships with for exactly how the
// integrator should call it.
//
// Four fairness invariants hold on every difficulty, and the tests assert
// them:
//
//   1. The gust is a pure function of `view`, `difficulty` and `adaptive`.
//      No branch calls Math.random or Date.now, so the same engine state
//      always produces the same wind.
//   2. A gust's magnitude never exceeds the tier's own bound (`policy.bound`,
//      stated on every decision this policy commits), and the bound is the
//      same number the reason sentence quotes.
//   3. Before any counter-gust is applied, the hull's best achievable climb
//      (tapping every `FASTEST_LIFT_MS`) and its worst achievable fall (no
//      more taps at all) are projected forward to the next opening. The gust
//      is reduced, and then withheld outright, the instant it would put that
//      opening's gap outside the range those two paths bound. An opening
//      already out of that range with no wind added at all is not this
//      policy's doing, and no wind is added to it either.
//   4. Only the predictive tier reads the player at all — the measured tap
//      interval and the projected trajectory. The fixed and the time-varying
//      tiers never look at `view.y`, `view.vy`, or `view.liftHistory`, which
//      is what keeps them learnable: the same round always blows the same
//      way.

import {
  argmax,
  byTier,
  commitDecision,
  logEvent,
  ms,
  tierOf,
  type AIDecision,
  type AIRuntime,
  type AIState,
  type Candidate,
  type Difficulty,
  type Reading,
} from "./types.ts";

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- Mirrored engine physics (src/lib/encounters/odyssey-games.ts) -------------------
//
// These numbers are not this policy's to choose: they are the ship's real
// physics, copied from the engine's own aeolus tick so the trajectory this
// file projects is the trajectory that will actually happen. If the engine's
// constants change, this mirror — and the fairness bound it feeds — is only
// as true as the sync between the two files.

/** px/s² the hull falls under with no lift and no wind. */
export const GRAVITY_PX_S2 = 440;
/** vy set instantly on a tap. */
export const LIFT_IMPULSE_PX_S = -205;
export const VY_MIN_PX_S = -240;
export const VY_MAX_PX_S = 270;
/** Fixed horizontal position the engine checks every gate's hit/collect/pass against. */
export const SHIP_X_PX = 155;
/** Mirrors the engine's own hit margin (`gate.gap / 2 - 15`) — the fairness bound must match the rule that actually judges a strike, not a guessed hull size. */
export const HULL_MARGIN_PX = 15;
export const gateSpeedPxS = (difficulty: Difficulty) => byTier(difficulty, 135, 150, 165);

/**
 * The quickest interval between two taps this fairness check is allowed to
 * credit the player with, in ms.
 *
 * It is a floor on the climb envelope rather than a measurement: one
 * unusually fast burst must not be allowed to tighten the reachability bound
 * to something only that burst could sustain.
 */
export const FASTEST_LIFT_MS = 150;
/** Per-cycle budget used until a lift has actually been timed. */
export const DEFAULT_LIFT_INTERVAL_MS = 900;

/** Easy tier: a fixed, gentle headwind. Chosen well inside the bounded hard-tier cap. */
export const EASY_BREEZE_PX_S2 = 14;
/** Medium tier: amplitude of the time-based field. */
export const MEDIUM_AMPLITUDE_PX_S2 = 24;
/** Medium tier: ms per full oscillation — slow enough to read as a pattern, not noise. */
export const MEDIUM_PERIOD_MS = 4200;
/**
 * Hard tier: the counter-gust's hard ceiling, in px/s² added to gravity.
 *
 * 32 against a 440 px/s² fall and a 205 px/s lift impulse is a lean, not a
 * wall — enough to matter against a lazy climb, never enough on its own to
 * turn a reachable opening into an unreachable one without help from rule 3.
 */
export const GUST_MAX_PX_S2 = 32;
/**
 * How much of the predicted drift becomes lean, in px/s² per px of error.
 *
 * Scaled so a drift already as wide as the hard tier's own half-gap (~78px)
 * earns close to the full bound; a well-centred approach, with little to
 * exploit, gets a small nudge instead of the cap every single cycle.
 */
export const LEAN_GAIN = 0.4;

export type AeolusGateView = { x: number; center: number; gap: number; pickup: "wind" | "repair"; collected: boolean };

export type AeolusPerception = {
  /** Simulation time in ms. */
  at: number;
  /** Hull altitude in px; smaller is higher, mirroring the engine's own axis. */
  y: number;
  /** Vertical speed in px/s; negative is climbing. */
  vy: number;
  /** The wind force currently in effect, px/s², added to gravity. */
  gust: number;
  /** Gates the engine is still tracking, nearest first. */
  gates: AeolusGateView[];
  /** Timestamps of the player's last taps, newest last — the engine's own capped window. */
  liftHistory: number[];
  /** The previous gate's centre, which is what bounds how far the next one may drift. */
  lastCenter: number;
};

export type TrajectoryPoint = { tMs: number; y: number };

export type AeolusAction =
  /** Hold the air still this cycle: no gust was fair, or none scored above it. */
  | { kind: "calm"; decisionId: string }
  | {
      kind: "gust";
      /** px/s² to add to gravity for the next cycle. Never exceeds `bound` in magnitude. */
      force: number;
      /** The ceiling this tier's wind may reach; stated so the UI can show the headroom left. */
      bound: number;
      decisionId: string;
    };

export type AeolusPolicy = {
  algorithm: string;
  /** ms this gust holds before the engine asks again — mirrors the engine's own `gustClock`. */
  cycleMs: number;
  /** The ceiling this tier's wind may reach, px/s². */
  bound: number;
  /** Whether the wind varies at all, or is one flat constant every cycle. */
  timeVarying: boolean;
  /** Whether the wind reads the player's rhythm and projected trajectory at all. */
  predictive: boolean;
};

export function aeolusPolicy(difficulty: Difficulty, adaptive: boolean): AeolusPolicy {
  const tier = tierOf(difficulty);
  const predictive = tier === 2 || (adaptive && tier >= 1);
  const timeVarying = tier >= 1 || adaptive;
  return {
    algorithm: predictive
      ? "Predictive counter-gust (trajectory forecast + bounded opposition)"
      : timeVarying
        ? "Variable wind field (time-based oscillation)"
        : "Fixed wind (constant bias)",
    cycleMs: 500,
    bound: byTier(difficulty, EASY_BREEZE_PX_S2, MEDIUM_AMPLITUDE_PX_S2, GUST_MAX_PX_S2),
    timeVarying,
    predictive,
  };
}

/**
 * The nearest gate still ahead of (or just entering) the ship's fixed hit
 * position, or null once nothing is left to aim at.
 *
 * Gates already fully behind the ship are excluded: projecting a trajectory
 * toward one would be aiming at a target that no longer exists.
 */
export function nearestGate(gates: AeolusGateView[]): AeolusGateView | null {
  const ahead = gates.filter(g => g.x >= SHIP_X_PX - 20);
  if (ahead.length === 0) return null;
  return ahead.reduce((a, b) => (a.x < b.x ? a : b));
}

/**
 * Mean ms between the player's last taps, from the engine's own capped
 * history.
 *
 * `grounded` only turns true once a handful of taps back it — with one or
 * two the "interval" is really just luck of the window, not rhythm.
 */
export function measuredLiftInterval(liftHistory: number[]): { intervalMs: number; grounded: boolean } {
  if (liftHistory.length < 2) return { intervalMs: DEFAULT_LIFT_INTERVAL_MS, grounded: false };
  const span = liftHistory[liftHistory.length - 1] - liftHistory[0];
  const steps = liftHistory.length - 1;
  const mean = steps > 0 ? span / steps : DEFAULT_LIFT_INTERVAL_MS;
  return { intervalMs: Math.max(FASTEST_LIFT_MS, mean), grounded: liftHistory.length >= 4 };
}

/**
 * Project the hull forward under constant acceleration (gravity + `gust`),
 * optionally re-applying the lift impulse on a fixed cadence.
 *
 * `liftIntervalS === null` models never tapping again — the worst-case fall.
 * A finite interval models tapping on a steady rhythm, which is how both the
 * expected trajectory (the player's measured pace) and the best-case climb
 * (`FASTEST_LIFT_MS`) are produced from the same stepper. Stepped at 50 ms,
 * the same granularity the engine's own tick integrates at, so the forecast
 * does not claim precision the physics it mirrors does not have.
 */
function simulate(
  y0: number,
  vy0: number,
  durationS: number,
  gust: number,
  liftIntervalS: number | null,
  sampleCount = 0,
): { finalY: number; points: TrajectoryPoint[] } {
  const steps = Math.max(1, Math.round(durationS / 0.05));
  const dt = durationS / steps;
  let y = y0;
  let vy = vy0;
  let nextLiftAt = liftIntervalS ?? Infinity;
  let elapsed = 0;
  const points: TrajectoryPoint[] = [];
  const sampleEvery = sampleCount > 0 ? Math.max(1, Math.round(steps / sampleCount)) : Infinity;
  for (let i = 1; i <= steps; i++) {
    vy = clamp(vy + (GRAVITY_PX_S2 + gust) * dt, VY_MIN_PX_S, VY_MAX_PX_S);
    y += vy * dt;
    elapsed += dt;
    if (elapsed >= nextLiftAt) {
      vy = LIFT_IMPULSE_PX_S;
      nextLiftAt += liftIntervalS as number;
    }
    if (sampleCount > 0 && i % sampleEvery === 0 && points.length < sampleCount) {
      points.push({ tMs: Math.round(elapsed * 1000), y: Math.round(y) });
    }
  }
  return { finalY: y, points };
}

/** Whether the gate's gap, allowing for the hull's own size, overlaps what either extreme of play can reach in `tGateS`. */
function reachableAt(y0: number, vy0: number, tGateS: number, gust: number, gate: AeolusGateView): boolean {
  const gapTop = gate.center - (gate.gap / 2 - HULL_MARGIN_PX);
  const gapBottom = gate.center + (gate.gap / 2 - HULL_MARGIN_PX);
  const highest = simulate(y0, vy0, tGateS, gust, FASTEST_LIFT_MS / 1000).finalY; // best-case climb
  const lowest = simulate(y0, vy0, tGateS, gust, null).finalY; // worst-case fall
  return highest <= gapBottom && lowest >= gapTop;
}

type FairGust = { gust: number; reduced: boolean; withheld: boolean; note: string };

/**
 * Rule 3 as code: shrink `desired` toward zero, in its own direction, until
 * the gate it would be judged against is provably still reachable — and
 * refuse it outright if even that is not enough.
 *
 * A gate already unreachable with no wind at all is never this policy's
 * problem to fix, so that case adds no gust rather than attempting a rescue
 * it was never asked to perform.
 */
function fairGust(y0: number, vy0: number, tGateS: number | null, gate: AeolusGateView | null, desired: number): FairGust {
  if (!gate || tGateS === null) return { gust: desired, reduced: false, withheld: false, note: "no opening ahead yet to check against" };
  if (!reachableAt(y0, vy0, tGateS, 0, gate)) {
    return { gust: 0, reduced: true, withheld: true, note: "the opening is already out of reach with no wind at all — Aeolus adds none" };
  }
  if (desired === 0 || reachableAt(y0, vy0, tGateS, desired, gate)) return { gust: desired, reduced: false, withheld: false, note: "" };
  const dir = Math.sign(desired);
  let lo = 0;
  let hi = Math.abs(desired);
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (reachableAt(y0, vy0, tGateS, dir * mid, gate)) lo = mid;
    else hi = mid;
  }
  const safe = round1(dir * lo);
  const withheld = Math.abs(safe) < 1;
  return {
    gust: withheld ? 0 : safe,
    reduced: true,
    withheld,
    note: withheld
      ? `the full ${Math.abs(desired).toFixed(1)} px/s² lean would put the opening out of reach — withheld`
      : `reduced from ${Math.abs(desired).toFixed(1)} to ${Math.abs(safe).toFixed(1)} px/s² to keep the opening reachable`,
  };
}

/** Spare px either side of the gate's safe band once `gust` is in force — the continuous-domain reading of "escape room left". */
function marginPx(y0: number, vy0: number, tGateS: number, gate: AeolusGateView, gust: number): number {
  const gapTop = gate.center - (gate.gap / 2 - HULL_MARGIN_PX);
  const gapBottom = gate.center + (gate.gap / 2 - HULL_MARGIN_PX);
  const highest = simulate(y0, vy0, tGateS, gust, FASTEST_LIFT_MS / 1000).finalY;
  const lowest = simulate(y0, vy0, tGateS, gust, null).finalY;
  return Math.min(gapBottom - highest, lowest - gapTop);
}

function perceptionReadings(view: AeolusPerception, gate: AeolusGateView | null, tGateS: number | null): Reading[] {
  return [
    { key: "altitude", label: "Hull altitude", value: `${Math.round(view.y)} px`, hint: view.vy < 0 ? "climbing" : "falling" },
    { key: "vy", label: "Vertical speed", value: `${Math.round(view.vy)} px/s`, hint: `clamped to ${VY_MIN_PX_S}..${VY_MAX_PX_S}` },
    {
      key: "wind",
      label: "Current wind",
      value: `${view.gust >= 0 ? "+" : ""}${view.gust.toFixed(1)} px/s²`,
      hint: view.gust === 0 ? "calm" : view.gust > 0 ? "pushing the hull down" : "pushing the hull up",
    },
    {
      key: "gate",
      label: "Next opening",
      value: gate
        ? `centre ${Math.round(gate.center)}px · gap ${gate.gap}px · ${gate.pickup === "repair" ? "repair" : "wind"} blessing${gate.collected ? " (collected)" : ""}`
        : "none spawned yet",
      hint: gate && tGateS !== null ? `arrives in ${ms(tGateS * 1000)}` : undefined,
    },
    { key: "lastCenter", label: "Previous opening", value: `${Math.round(view.lastCenter)} px` },
  ];
}

function memoryReadings(
  view: AeolusPerception,
  policy: AeolusPolicy,
  tapIntervalMs: number,
  tapGrounded: boolean,
  trajectory: TrajectoryPoint[],
  prepared: FairGust,
): Reading[] {
  const readings: Reading[] = [];
  if (policy.predictive) {
    readings.push(
      {
        key: "rhythm",
        label: "Measured tap interval",
        value: tapGrounded ? `${Math.round(tapIntervalMs)} ms` : `assumed ${DEFAULT_LIFT_INTERVAL_MS} ms`,
        hint: tapGrounded ? `${view.liftHistory.length} taps remembered` : "fewer than 4 taps recorded so far",
      },
      {
        key: "trajectory",
        label: "Predicted path to next opening",
        value: trajectory.length ? trajectory.map(p => `${p.tMs}ms→${p.y}px`).join(" · ") : "no opening to project toward yet",
        hint: "given the current vy, with no gust applied — the path the counter-gust is read against",
      },
    );
  } else {
    readings.push({
      key: "scope",
      label: "Policy memory use",
      value: policy.timeVarying ? "elapsed time only — no player data read" : "none — a fixed breeze every cycle",
    });
  }
  readings.push({
    key: "prepared",
    label: "Next gust prepared",
    value: `${prepared.gust >= 0 ? "+" : ""}${prepared.gust.toFixed(1)} px/s²`,
    hint: `bounded to ±${policy.bound} px/s²${prepared.reduced ? " · adjusted for fairness" : ""}`,
  });
  return readings;
}

/**
 * Run one decision cycle, at a gust point.
 *
 * `tick` is the engine's own gust-cycle counter, used only in the event log —
 * every tier here is time- or trajectory-indexed rather than step-indexed, so
 * unlike Polyphemus' `wave` or the Sirens' `tick` it steers no policy math.
 * `roll` is accepted only so the engine's RNG stream advances identically
 * whichever branch runs: no tier draws a random number, which is what makes
 * the fixed and time-varying winds exactly repeatable.
 */
export function decideAeolus(
  ai: AIRuntime,
  view: AeolusPerception,
  difficulty: Difficulty,
  adaptive: boolean,
  tick: number,
  roll: () => number,
): AeolusAction {
  void roll;
  const policy = aeolusPolicy(difficulty, adaptive);
  const gate = nearestGate(view.gates);
  const speed = gateSpeedPxS(difficulty);
  const tGateS = gate ? Math.max(0.05, (gate.x - SHIP_X_PX) / speed) : null;
  const { intervalMs: tapIntervalMs, grounded: tapGrounded } = measuredLiftInterval(view.liftHistory);

  logEvent(ai, view.at, "perceive", `y ${Math.round(view.y)}px vy ${Math.round(view.vy)}px/s wind ${view.gust.toFixed(1)}px/s² · cycle ${tick}`);

  // ---- Stage 2: remember (predictive tier only) --------------------------
  let predictedY: number | null = null;
  let trajectory: TrajectoryPoint[] = [];
  if (policy.predictive && gate && tGateS !== null) {
    const sim = simulate(view.y, view.vy, tGateS, 0, tapIntervalMs / 1000, 4);
    predictedY = sim.finalY;
    trajectory = sim.points;
    logEvent(
      ai,
      view.at,
      "remember",
      `tap interval ~${Math.round(tapIntervalMs)}ms${tapGrounded ? "" : " (assumed — too little history)"}; unforced path lands at ${Math.round(predictedY)}px`,
    );
  } else if (policy.timeVarying) {
    logEvent(ai, view.at, "remember", "No player rhythm read — the field is a function of elapsed time only");
  } else {
    logEvent(ai, view.at, "remember", "No player memory in this policy — a fixed breeze every cycle");
  }

  // ---- Stage 3: evaluate --------------------------------------------------
  let desired = 0;
  let activeId: string;
  let activeLabel: string;
  let activeDescribe = "";

  if (policy.predictive) {
    activeId = "gust:lean";
    activeLabel = "predictive counter-gust";
    if (gate && predictedY !== null) {
      const error = predictedY - gate.center;
      const dir = error === 0 ? 1 : Math.sign(error);
      const magnitude = clamp(Math.abs(error) * LEAN_GAIN, 0, GUST_MAX_PX_S2);
      desired = dir * magnitude;
      activeDescribe = `unforced path lands ${Math.round(Math.abs(error))}px ${error >= 0 ? "below" : "above"} centre — leaning the same way by ${magnitude.toFixed(1)} px/s²`;
    }
  } else if (policy.timeVarying) {
    activeId = "gust:field";
    activeLabel = "variable wind field";
    const phase = (2 * Math.PI * view.at) / MEDIUM_PERIOD_MS;
    desired = MEDIUM_AMPLITUDE_PX_S2 * Math.sin(phase);
    activeDescribe = `${phase.toFixed(2)} rad into a ${ms(MEDIUM_PERIOD_MS)} cycle`;
  } else {
    activeId = "gust:breeze";
    activeLabel = "steady breeze";
    desired = EASY_BREEZE_PX_S2;
    activeDescribe = "fixed every cycle, regardless of the ship or the opening";
  }

  const prepared = fairGust(view.y, view.vy, tGateS, gate, desired);
  const noTarget = policy.predictive && !gate;

  logEvent(
    ai,
    view.at,
    "evaluate",
    `${activeId} ${prepared.gust.toFixed(1)}  calm 0${prepared.note ? `  (${prepared.note})` : ""}`,
  );

  const activeScore = prepared.withheld ? -1000 : noTarget ? -5 : round1(Math.abs(prepared.gust) * 2.5 + 20);
  const activeNote = prepared.withheld
    ? prepared.note
    : noTarget
      ? "no opening has spawned yet — nothing to lean against"
      : `${activeDescribe}${prepared.reduced ? ` · ${prepared.note}` : ""}`;

  const candidates: Candidate[] = [
    { action: activeId, score: activeScore, note: activeNote },
    { action: "calm", score: 5, note: "hold the air still and wait a cycle" },
  ];

  // ---- Stage 4: decide ------------------------------------------------------
  const winner = argmax(candidates);
  const observations = perceptionReadings(view, gate, tGateS);
  const memory = memoryReadings(view, policy, tapIntervalMs, tapGrounded, trajectory, prepared);
  const state: AIState = policy.predictive ? "predicting" : policy.timeVarying ? "evaluating" : "preparing";

  if (winner.action === "calm") {
    const reason = noTarget
      ? "No opening has spawned yet, so there is nothing for the counter-gust to aim at. Aeolus holds the air still."
      : prepared.withheld
        ? `${activeLabel} was withheld: ${prepared.note}. Aeolus waits rather than add wind it cannot prove is survivable.`
        : "No gust outscored holding the air still this cycle.";
    const decision = commitDecision(ai, view.at, {
      algorithm: policy.algorithm,
      state: "observing",
      observations,
      memory,
      candidates,
      selectedAction: "Hold the air still",
      selectedCandidate: "calm",
      ...(gate ? { target: `Opening ${Math.round(gate.center)}px` } : {}),
      reason,
      commitMs: policy.cycleMs,
    });
    ai.committed = null;
    ai.commitRemaining = 0;
    logEvent(ai, view.at, "telegraph", "Air held calm for this cycle", decision.id);
    return { kind: "calm", decisionId: decision.id };
  }

  const reason = !policy.timeVarying
    ? `A steady ${EASY_BREEZE_PX_S2} px/s² breeze blows every cycle — fixed, not tied to your position, your rhythm, or the opening ahead.${prepared.reduced ? ` ${prepared.note}.` : ""}`
    : !policy.predictive
      ? `The wind field is a smooth function of elapsed time: at ${ms(view.at)} elapsed it reads ${prepared.gust.toFixed(1)} px/s², bounded to ±${policy.bound} px/s². No player data is read on this difficulty.${prepared.reduced ? ` ${prepared.note}.` : ""}`
      : gate
        ? `Your taps land roughly every ${Math.round(tapIntervalMs)}ms${tapGrounded ? "" : " (assumed — too little history yet)"}; projecting the current climb ${ms((tGateS ?? 0) * 1000)} ahead to the next opening (centre ${Math.round(gate.center)}px, gap ${gate.gap}px) lands the hull at ${Math.round(predictedY ?? view.y)}px, ${Math.round(Math.abs((predictedY ?? view.y) - gate.center))}px off centre. Aeolus leans the wind the same way${prepared.reduced ? `, reduced to ${Math.abs(prepared.gust).toFixed(1)} px/s² so the opening stays reachable` : ` by ${Math.abs(prepared.gust).toFixed(1)} px/s²`}, bounded to ±${policy.bound} px/s².`
        : "No opening has spawned yet, so there is nothing to lean the wind against.";

  const decision = commitDecision(ai, view.at, {
    algorithm: policy.algorithm,
    state,
    observations,
    memory,
    candidates,
    selectedAction:
      prepared.gust === 0
        ? "Hold the wind level"
        : `${prepared.gust > 0 ? "Press the wind down" : "Draw the wind up"} to ${Math.abs(prepared.gust).toFixed(1)} px/s²`,
    selectedCandidate: activeId,
    ...(gate ? { target: `Opening ${Math.round(gate.center)}px` } : {}),
    reason,
    commitMs: policy.cycleMs,
    ...(gate && tGateS !== null
      ? { safety: { escapes: 1, actionFree: Math.max(0, Math.round(marginPx(view.y, view.vy, tGateS, gate, prepared.gust))) } }
      : {}),
  });
  ai.committed = decision;
  ai.commitRemaining = policy.cycleMs;
  ai.stats.attacks++;
  ai.stats.nodesExplored += candidates.length;
  logEvent(ai, view.at, "telegraph", `Wind set to ${prepared.gust.toFixed(1)} px/s² — locked for ${ms(policy.cycleMs)}`, decision.id);
  return { kind: "gust", force: prepared.gust, bound: policy.bound, decisionId: decision.id };
}

/**
 * Stage 6. Called once a gate resolves — struck, cleared, or cleared with its
 * blessing collected.
 *
 * A single gust decision rarely owns the whole approach to a gate the way a
 * boulder or a melody owns its round: the engine recomputes the wind every
 * `cycleMs` (500 ms), shorter than the several seconds most gates take to
 * cross. `decisionId` should name whichever decision was on record at the
 * moment the gate entered the engine's own hit window — the one its
 * predicted trajectory can honestly be checked against. See `wiring` for
 * exactly how to track that id.
 */
export function learnFromGust(ai: AIRuntime, at: number, decisionId: string, hit: boolean, blessed: boolean) {
  const decision: AIDecision | undefined = ai.decisions.find(d => d.id === decisionId);
  if (decision && !decision.outcome) {
    decision.outcome = hit ? "hit" : blessed ? "scored" : "dodged";
    decision.outcomeNote = hit
      ? "the hull struck the rock at this opening"
      : blessed
        ? "the opening was cleared and its blessing collected"
        : "the opening was cleared";
    if (hit) ai.stats.attacksLanded++;
  }
  ai.state = "adapting";
  logEvent(
    ai,
    at,
    "learn",
    `${hit ? "Hull struck the rock" : "Opening cleared"}${!hit && blessed ? " — blessing collected" : ""}`,
    decisionId,
  );
}
