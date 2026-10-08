// Authoritative arcade rules. A model selects a bounded plan; it cannot change
// difficulty, warnings, hit detection, success conditions, or campaign progress.
export const ARCADE_SAVE = "farshore-arcade-v1";
export const ARCADE_PREFS = "farshore-arcade-preferences-v1";
export type TrialId = "cyclops" | "sirens" | "bow";
export type Difficulty = "easy" | "normal" | "hard";
export type OpponentSource = "standard" | "ai";
export type Focus = "left" | "center" | "right" | "balanced" | "early" | "late";
export type PlanId = "alternating" | "focused" | "sweep" | "steady" | "swell" | "echo" | "patient" | "surge" | "feint";
export type OpponentPlan = { planId: PlanId; focus: Focus; source: OpponentSource };
export const trials = [
  { id: "cyclops" as const, title: "Cyclops' Coast", location: "The first escape", character: "Polyphemus", portrait: 5, tile: 0, book: "IX", kind: "lanes", objective: "Dodge the rocks. Survive for 45 seconds.", controls: "Move with Left / Right or A / D. Three hits end the attempt.", story: "You have escaped the Cyclops' cave. Now Polyphemus hurls rocks toward your departing ship. Keep the crew out of his reach.", quote: "You cannot hide on that little ship forever, Nobody!", success: "The last rock falls behind you. Your crew rows out to sea.", homer: "Odysseus escapes beneath the Cyclops' sheep. From shore, Polyphemus throws rocks toward the departing ship.", adaptation: "The three lanes, repeated throws, and survival challenge are invented arcade rules.", plans: ["alternating", "focused", "sweep"] as PlanId[], focuses: ["left", "center", "right"] as Focus[] },
  { id: "sirens" as const, title: "Sirens' Passage", location: "Keep the oars moving", character: "The Sirens", portrait: 11, tile: 4, book: "XII", kind: "timing", objective: "Row on the marker. Make 6 of 8 good strokes.", controls: "Press Space or tap Row when the marker enters the gold zone.", story: "Circe warned you about these voices. The crew's ears are sealed with wax and Odysseus is tied to the mast. Keep rowing until their song fades.", quote: "Stay, Odysseus. We know the stories you long to hear.", success: "The voices fade. The crew removes the wax, and the voyage continues.", homer: "The crew rows past the Sirens with wax in their ears, while Odysseus listens bound to the mast.", adaptation: "The visible rowing cues and changing cadence are an invented representation of keeping the ship moving.", plans: ["steady", "swell", "echo"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[] },
  { id: "bow" as const, title: "Ithaca's Bow", location: "One final trial", character: "Antinous", portrait: 17, tile: 5, book: "XXI", kind: "timing", objective: "Align the bow. Make 3 of 5 good shots.", controls: "Press Space or tap Release when the marker enters the gold zone.", story: "After the long crossing, Ithaca is beneath your feet. Penelope has set a contest with Odysseus' bow. Steady your aim and reclaim your place at home.", quote: "That bow has defeated every man here. What makes you different?", success: "The arrow flies true. The bow is yours, and the path to your family is open.", homer: "Penelope sets a contest to string Odysseus' bow and shoot through twelve axes. Odysseus succeeds.", adaptation: "Five timed shots and the suitor's pressure pattern are invented. The reunion epilogue condenses the remaining homecoming.", plans: ["patient", "surge", "feint"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[] },
];
export const planNames: Record<PlanId, string> = { alternating: "Shoreline patrol", focused: "Lane hunter", sweep: "Crossfire", steady: "Steady rowing", swell: "Changing tide", echo: "Reverse echo", patient: "Steady aim", surge: "Surging aim", feint: "False release" };
export const difficultyNames: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };
export const trialFor = (id: TrialId) => trials.find(t => t.id === id)!;
export function validPlan(id: TrialId, value: unknown): value is OpponentPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as OpponentPlan, t = trialFor(id);
  return t.plans.includes(p.planId) && t.focuses.includes(p.focus) && ["standard", "ai"].includes(p.source) && Object.keys(p).length === 3;
}
export function standardPlan(id: TrialId): OpponentPlan {
  return { planId: trialFor(id).plans[0], focus: id === "cyclops" ? "center" : "balanced", source: "standard" };
}
export function planDescription(id: TrialId, plan: OpponentPlan) {
  if (id === "cyclops") return `${planNames[plan.planId]}. ${plan.planId === "focused" ? `Starts by hunting your ${plan.focus} lane, then reads where you linger` : plan.planId === "sweep" ? "Two-lane volleys change the escape route" : "A repeating lane sequence you can learn"}. Marked lanes lock before every throw.`;
  if (id === "sirens") return `${planNames[plan.planId]}. ${plan.planId === "echo" ? "Beats alternate direction and arrive in uneven pairs" : plan.planId === "swell" ? "The song alternates fast and slow beats" : "Beats arrive at a regular pace"}. ${plan.focus === "balanced" ? "Watch the gold ring" : `The ring shifts ${plan.focus} in each beat`}.`;
  return `${planNames[plan.planId]}. ${plan.planId === "feint" ? "The sight changes speed before lining up" : plan.planId === "surge" ? "The sight sweeps in alternating directions" : "The sight moves at a constant speed"}. Release when the sight crosses the gold opening.`;
}
export type AttemptSummary = { won: boolean; source: OpponentSource; hits: number; successes: number; early: number; late: number; misses: number; laneMs: [number, number, number] };
export type TrialRecord = { cleared: "pending" | "cleared" | "assisted"; attempts: number; recent: AttemptSummary[] };
export type ArcadeSave = { version: 1; started: boolean; records: Record<TrialId, TrialRecord> };
export function newArcade(): ArcadeSave {
  const empty = (): TrialRecord => ({ cleared: "pending", attempts: 0, recent: [] });
  return { version: 1, started: false, records: { cyclops: empty(), sirens: empty(), bow: empty() } };
}
export function validSummary(value: unknown): value is AttemptSummary {
  if (!value || typeof value !== "object") return false;
  const a = value as AttemptSummary;
  return typeof a.won === "boolean" && ["standard", "ai"].includes(a.source) && [a.hits, a.successes, a.early, a.late, a.misses].every(n => Number.isInteger(n) && n >= 0 && n <= 100) && Array.isArray(a.laneMs) && a.laneMs.length === 3 && a.laneMs.every(n => Number.isInteger(n) && n >= 0 && n <= 60000);
}
export function readArcade(raw: string | null): ArcadeSave | null {
  try {
    if (!raw || raw.length > 10000) return null;
    const v = JSON.parse(raw) as ArcadeSave;
    if (v.version !== 1 || typeof v.started !== "boolean" || !v.records || Object.keys(v.records).length !== 3) return null;
    const result = newArcade(); result.started = v.started;
    for (const t of trials) {
      const r = v.records[t.id];
      if (!r || !["pending", "cleared", "assisted"].includes(r.cleared) || !Number.isInteger(r.attempts) || r.attempts < 0 || r.attempts > 99999 || !Array.isArray(r.recent) || r.recent.length > 2 || r.recent.length > r.attempts || !r.recent.every(validSummary)) return null;
      if (!v.started && (r.attempts > 0 || r.cleared !== "pending")) return null;
      result.records[t.id] = { cleared: r.cleared, attempts: r.attempts, recent: r.recent.map(a => ({ ...a, laneMs: [...a.laneMs] })) };
    }
    // A save cannot skip a locked encounter.
    for (let i = 1; i < trials.length; i++) if ((v.records[trials[i].id].cleared !== "pending" || v.records[trials[i].id].attempts > 0) && v.records[trials[i - 1].id].cleared === "pending") return null;
    return result;
  } catch { return null; }
}
export function unlocked(save: ArcadeSave, id: TrialId) {
  const i = trials.findIndex(t => t.id === id);
  return save.started && (i === 0 || save.records[trials[i - 1].id].cleared !== "pending");
}
export function finishAttempt(save: ArcadeSave, id: TrialId, summary: AttemptSummary): ArcadeSave {
  if (!unlocked(save, id) || !validSummary(summary)) return save;
  const old = save.records[id];
  return { ...save, records: { ...save.records, [id]: { cleared: summary.won ? "cleared" : old.cleared, attempts: Math.min(99999, old.attempts + 1), recent: [...old.recent, summary].slice(-2) } } };
}
export function assistTrial(save: ArcadeSave, id: TrialId): ArcadeSave {
  if (!unlocked(save, id) || save.records[id].cleared !== "pending") return save;
  return { ...save, records: { ...save.records, [id]: { ...save.records[id], cleared: "assisted" } } };
}
export const clearedCount = (save: ArcadeSave) => trials.filter(t => save.records[t.id].cleared !== "pending").length;
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
  const rules = challengeRules(id, difficulty);
  return id === "cyclops" ? "Dodge single rocks and two-lane volleys. Survive 45 seconds." : `Make ${rules.needed} of ${rules.count} good ${id === "sirens" ? "strokes" : "shots"}. ${id === "sirens" ? "Row on the gold ring." : "Release through the gold opening."}`;
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
      const lane = plan.planId === "focused" ? (i % 3 === 0 ? (focus + 1) % 3 : focus) : (i + focus) % 3;
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
