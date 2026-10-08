import { validPlan, type Difficulty, type OpponentPlan, type TrialId, type AttemptSummary } from "./arcade.ts";

// Historical three-trial rules retained for regression checks and old SVG scenery.
// The current playable five-trial edition is implemented in mythic.ts.
export type Judgment = "good" | "hit" | "early" | "late" | "miss";
export type Target = { at: number; start: number; end: number; lane: number; blocked: number[]; locked: boolean; reverse: boolean };
export type Round = {
  id: TrialId; difficulty: Difficulty; practice: boolean; plan: OpponentPlan;
  elapsed: number; duration: number; warning: number; window: number; needed: number;
  targets: Target[]; resolved: number[]; judgments: (Judgment | null)[];
  lane: number; hits: number; successes: number; early: number; late: number; misses: number;
  combo: number; bestCombo: number;
  laneMs: [number, number, number]; done: boolean; won: boolean;
  feedback: string; feedbackAt: number;
};
export function challengeRules(id: TrialId, difficulty: Difficulty, practice = false) {
  const tier = ["easy", "normal", "hard"].indexOf(difficulty);
  return {
    warning: [1600, 950, 650][tier],
    interval: [2100, 1450, 1100][tier],
    window: (id === "bow" ? [300, 120, 75] : [350, 160, 100])[tier],
    cycle: (id === "bow" ? [3600, 2600, 2000] : [2800, 2000, 1500])[tier],
    count: practice ? 3 : (id === "bow" ? [5, 7, 9] : [8, 12, 16])[tier],
    needed: practice ? 0 : (id === "bow" ? [3, 5, 7] : [6, 9, 13])[tier],
  };
}
export function challengeObjective(id: TrialId, difficulty: Difficulty) {
  const tier = ["easy", "normal", "hard"].indexOf(difficulty);
  return id === "scylla" ? `Deflect the heads and resist the pull for ${[30, 40, 50][tier]} seconds.` : id === "cyclops" ? `Reach an exit in ${[32, 26, 22][tier]} turns. Three smashes end the escape.` : trialFor(id).objective;
}
function random(seed: number) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
export function newRound(id: TrialId, difficulty: Difficulty, plan: OpponentPlan, practice = false, seed = 4200): Round {
  if (!validPlan(id, plan)) throw new Error("Invalid opponent plan");
  if (!["easy", "normal", "hard"].includes(difficulty)) throw new Error("Invalid difficulty");
  const rand = random(seed), isLane = id === "cyclops", rules = challengeRules(id, difficulty, practice);
  const duration = isLane ? (practice ? 10000 : 45000) : 0;
  const targets: Target[] = [];
  if (isLane) {
    for (let at = 2400, i = 0; at < duration - 300; i++) {
      const focus = ["left", "center", "right"].indexOf(plan.focus);
      const lane = plan.planId === "focused" ? (i % 3 === 0 ? (focus + 1) % 3 : focus) : plan.planId === "sweep" ? (focus + [0, 2, 1, 2, 0, 1][i % 6]) % 3 : (i + focus) % 3;
      const dual = difficulty === "easy" ? i % 3 === 2 : difficulty === "normal" ? i % 2 === 1 : i % 4 !== 0;
      targets.push({ at, start: at - rules.warning, end: at + 400, lane, blocked: dual ? [lane, (lane + 1) % 3] : [lane], locked: plan.source === "standard", reverse: false });
      // Waves grow faster, but never overlap their telegraphs.
      at += Math.max(rules.warning + 220, rules.interval - Math.floor(i / 6) * 55);
    }
  } else {
    let start = 0;
    for (let i = 0; i < rules.count; i++) {
      const varying = ["swell", "surge"].includes(plan.planId);
      const uneven = ["echo", "feint"].includes(plan.planId);
      const span = Math.round(rules.cycle * (varying ? (i % 2 ? 1.16 : .82) : uneven ? [.78, 1.2, .9, 1.12][i % 4] : 1));
      const offset = plan.focus === "early" ? -.12 : plan.focus === "late" ? .12 : 0;
      const fraction = .5 + offset + (uneven ? (rand() - .5) * .14 : 0);
      targets.push({ start, end: start + span, at: Math.round(start + span * fraction), lane: 0, blocked: [], locked: true, reverse: ["echo", "surge"].includes(plan.planId) && i % 2 === 1 });
      start += span;
    }
  }
  return { id, difficulty, plan: { ...plan }, practice, elapsed: 0, duration: isLane ? duration : targets.at(-1)!.end, warning: rules.warning, window: rules.window, needed: rules.needed, targets, resolved: [], judgments: targets.map(() => null), lane: 1, hits: 0, successes: 0, early: 0, late: 0, misses: 0, combo: 0, bestCombo: 0, laneMs: [0, 0, 0], done: false, won: false, feedback: isLane ? "Red lanes are dangerous. Move into open water." : id === "sirens" ? "Row when the beat reaches the gold ring." : "Release when your sight reaches the gold opening.", feedbackAt: 0 };
}
function conclude(r: Round): Round {
  if (r.practice) {
    if (r.elapsed >= r.duration) return { ...r, done: true, won: true, feedback: "Practice complete" };
    return r;
  }
  if (r.id === "cyclops") {
    if (r.hits >= 3) return { ...r, done: true, won: false };
    if (r.elapsed >= r.duration) return { ...r, done: true, won: true };
  } else {
    if (r.successes >= r.needed) return { ...r, done: true, won: true };
    if (r.resolved.length >= r.targets.length || r.elapsed >= r.duration) return { ...r, done: true, won: false };
  }
  return r;
}
// Caller pauses the clock instead of passing hidden-tab or countdown time here.
export function tickRound(state: Round, delta: number): Round {
  if (state.done || !Number.isFinite(delta) || delta <= 0) return state;
  const dt = Math.min(delta, 100), elapsed = Math.min(state.duration, state.elapsed + dt);
  const r: Round = { ...state, elapsed, targets: [...state.targets], resolved: [...state.resolved], judgments: [...state.judgments], laneMs: [...state.laneMs] };
  r.laneMs[r.lane] += elapsed - state.elapsed;
  state.targets.forEach((target, i) => {
    if (r.resolved.includes(i)) return;
    if (state.id === "cyclops" && !target.locked && elapsed >= target.start) {
      // Apply the model-selected policy locally. Lock the complete volley at
      // its telegraph; never retarget after the player has seen the warning.
      const focus = ["left", "center", "right"].indexOf(state.plan.focus);
      const totals = r.laneMs.map((ms, lane) => ms + (lane === focus ? 5000 : 0));
      const habit = totals.indexOf(Math.max(...totals));
      const lane = state.plan.planId === "focused" ? (i % 3 === 0 ? r.lane : habit) : target.lane;
      const other = state.plan.planId === "focused" ? (lane + (i % 2 ? 1 : 2)) % 3 : (lane + 1) % 3;
      r.targets[i] = { ...target, lane, blocked: target.blocked.length === 2 ? [lane, other] : [lane], locked: true };
    }
    if (state.id === "cyclops" && elapsed >= target.at) {
      r.resolved.push(i);
      if (r.targets[i].blocked.includes(r.lane)) { r.hits++; r.combo = 0; r.judgments[i] = "hit"; r.feedback = "Hull struck! Find the open lane."; }
      else { r.successes++; r.combo++; r.judgments[i] = "good"; r.feedback = r.combo >= 3 ? `${r.combo} dodges in a row!` : "Clean dodge!"; }
      r.bestCombo = Math.max(r.bestCombo, r.combo);
      r.feedbackAt = elapsed;
    } else if (state.id !== "cyclops" && elapsed >= target.end) {
      // Keep the cue available through its cycle so a late press is observable.
      // Only a cycle with no press is classified as missed.
      r.resolved.push(i); r.misses++; r.combo = 0; r.judgments[i] = "miss"; r.feedback = "Missed. Watch the next cue."; r.feedbackAt = elapsed;
    }
  });
  return conclude(r);
}
export function moveLane(state: Round, direction: -1 | 1): Round {
  if (state.done || state.id !== "cyclops") return state;
  return { ...state, lane: Math.max(0, Math.min(2, state.lane + direction)) };
}
export function activeCue(state: Round): number {
  return state.targets.findIndex((t, i) => !state.resolved.includes(i) && state.elapsed >= t.start && state.elapsed < t.end);
}
// The cue remains visible after a press so its judgment and shot can animate.
export function visibleCue(state: Round): number {
  return state.targets.findIndex(t => state.elapsed >= t.start && state.elapsed < t.end);
}
export function markerPosition(state: Round, target: Target, time = state.elapsed): number {
  const p = Math.max(0, Math.min(1, (time - target.start) / (target.end - target.start)));
  const warped = state.plan.planId === "feint" ? p + .11 * Math.sin(p * Math.PI * 2) : state.plan.planId === "swell" ? Math.pow(p, 1.2) : p;
  return target.reverse ? 1 - warped : warped;
}
export function pressTiming(state: Round): Round {
  if (state.done || state.id === "cyclops") return state;
  const index = activeCue(state);
  if (index < 0) return state;
  const distance = state.elapsed - state.targets[index].at, good = Math.abs(distance) <= state.window;
  const judgments = [...state.judgments]; judgments[index] = good ? "good" : distance < 0 ? "early" : "late";
  const combo = good ? state.combo + 1 : 0;
  return conclude({ ...state, resolved: [...state.resolved, index], judgments, combo, bestCombo: Math.max(state.bestCombo, combo), successes: state.successes + Number(good), early: state.early + Number(!good && distance < 0), late: state.late + Number(!good && distance >= 0), feedback: good ? (Math.abs(distance) <= state.window / 3 ? "Perfect!" : state.id === "sirens" ? "Strong stroke!" : "Arrow through!") : distance < 0 ? "Early. Wait for the gold opening." : "Late. Try the next cue.", feedbackAt: state.elapsed });
}
export function roundSummary(r: Round): AttemptSummary {
  return { won: r.won, source: r.plan.source, hits: r.hits, successes: r.successes, early: r.early, late: r.late, misses: r.misses, laneMs: r.laneMs.map(Math.round) as [number, number, number] };
}
