// Authoritative arcade rules. A model selects a bounded plan; it cannot change
// difficulty, warnings, hit detection, success conditions, or campaign progress.
export const ARCADE_SAVE = "farshore-arcade-v1";
export const ARCADE_PREFS = "farshore-arcade-preferences-v1";
export type TrialId = "cyclops" | "sirens" | "bow";
export type Difficulty = "easy" | "normal";
export type OpponentSource = "standard" | "ai";
export type Focus = "left" | "center" | "right" | "balanced" | "early" | "late";
export type PlanId = "alternating" | "focused" | "sweep" | "steady" | "swell" | "echo" | "patient" | "surge" | "feint";
export type OpponentPlan = { planId: PlanId; focus: Focus; source: OpponentSource };
export const trials = [
  { id: "cyclops" as const, title: "Cyclops' Coast", location: "The first escape", character: "Polyphemus", portrait: 5, tile: 0, book: "IX", kind: "lanes", objective: "Dodge the rocks. Survive for 45 seconds.", controls: "Move with Left / Right or A / D. Three hits end the attempt.", story: "You have escaped the Cyclops' cave. Now Polyphemus hurls rocks toward your departing ship. Keep the crew out of his reach.", quote: "You cannot hide on that little ship forever, Nobody!", success: "The last rock falls behind you. Your crew rows out to sea.", homer: "Odysseus escapes beneath the Cyclops' sheep. From shore, Polyphemus throws rocks toward the departing ship.", adaptation: "The three lanes, repeated throws, and survival challenge are invented arcade rules.", plans: ["alternating", "focused", "sweep"] as PlanId[], focuses: ["left", "center", "right"] as Focus[] },
  { id: "sirens" as const, title: "Sirens' Passage", location: "Keep the oars moving", character: "The Sirens", portrait: 11, tile: 4, book: "XII", kind: "timing", objective: "Row on the marker. Make 6 of 8 good strokes.", controls: "Press Space or tap Row when the marker enters the gold zone.", story: "Circe warned you about these voices. The crew's ears are sealed with wax and Odysseus is tied to the mast. Keep rowing until their song fades.", quote: "Stay, Odysseus. We know the stories you long to hear.", success: "The voices fade. The crew removes the wax, and the voyage continues.", homer: "The crew rows past the Sirens with wax in their ears, while Odysseus listens bound to the mast.", adaptation: "The visible rowing cues and changing cadence are an invented representation of keeping the ship moving.", plans: ["steady", "swell", "echo"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[] },
  { id: "bow" as const, title: "Ithaca's Bow", location: "One final trial", character: "Antinous", portrait: 17, tile: 5, book: "XXI", kind: "timing", objective: "Align the bow. Make 3 of 5 good shots.", controls: "Press Space or tap Release when the marker enters the gold zone.", story: "After the long crossing, Ithaca is beneath your feet. Penelope has set a contest with Odysseus' bow. Steady your aim and reclaim your place at home.", quote: "That bow has defeated every man here. What makes you different?", success: "The arrow flies true. The bow is yours, and the path to your family is open.", homer: "Penelope sets a contest to string Odysseus' bow and shoot through twelve axes. Odysseus succeeds.", adaptation: "Five timed shots and the suitor's pressure pattern are invented. The reunion epilogue condenses the remaining homecoming.", plans: ["patient", "surge", "feint"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[] },
];
export const planNames: Record<PlanId, string> = { alternating: "Alternating throws", focused: "A favored lane", sweep: "A sweeping volley", steady: "Steady rowing", swell: "A changing cadence", echo: "Echoing pulses", patient: "A patient contest", surge: "A shifting aim", feint: "An uneven cadence" };
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
  if (id === "cyclops") return `${planNames[plan.planId]}. The Cyclops favors the ${plan.focus} lane. Every rock is marked before it lands.`;
  return `${planNames[plan.planId]}. ${plan.focus === "balanced" ? "The target stays near the middle" : "The target leans " + plan.focus + " in the cycle"}. Watch the gold zone; your timing window stays the same.`;
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
export type Round = {
  id: TrialId; difficulty: Difficulty; practice: boolean; plan: OpponentPlan;
  elapsed: number; duration: number; warning: number; window: number;
  targets: { at: number; lane: number }[]; resolved: number[];
  lane: number; hits: number; successes: number; early: number; late: number; misses: number;
  laneMs: [number, number, number]; done: boolean; won: boolean;
  feedback: string; feedbackAt: number;
};
function random(seed: number) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
export function newRound(id: TrialId, difficulty: Difficulty, plan: OpponentPlan, practice = false, seed = 4200): Round {
  if (!validPlan(id, plan)) throw new Error("Invalid opponent plan");
  const rand = random(seed), isLane = id === "cyclops", count = isLane ? (practice ? 3 : 18) : practice ? 3 : id === "sirens" ? 8 : 5;
  const warning = difficulty === "easy" ? 2000 : 1500, window = difficulty === "easy" ? 800 : 450;
  const targets = Array.from({ length: count }, (_, i) => {
    if (isLane) {
      const focus = ["left", "center", "right"].indexOf(plan.focus);
      const lane = plan.planId === "sweep" ? (i + focus) % 3 : plan.planId === "focused" ? (i % 3 === 0 ? Math.floor(rand() * 3) : focus) : (i % 2 === 0 ? focus : (focus + 1 + Math.floor(rand() * 2)) % 3);
      return { at: 3000 + i * 2300, lane };
    }
    const offset = plan.focus === "early" ? -300 : plan.focus === "late" ? 300 : 0;
    const variation = ["swell", "surge"].includes(plan.planId) ? (i % 2 ? 300 : -300) : ["echo", "feint"].includes(plan.planId) ? Math.round(rand() * 600 - 300) : 0;
    return { at: i * 4000 + 2000 + offset + variation, lane: 0 };
  });
  return { id, difficulty, plan: { ...plan }, practice, elapsed: 0, duration: isLane ? (practice ? 10000 : 45000) : count * 4000, warning, window, targets, resolved: [], lane: 1, hits: 0, successes: 0, early: 0, late: 0, misses: 0, laneMs: [0, 0, 0], done: false, won: false, feedback: isLane ? "Watch for a marked lane" : "Watch the gold zone", feedbackAt: 0 };
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
    const needed = r.id === "sirens" ? 6 : 3;
    if (r.successes >= needed) return { ...r, done: true, won: true };
    if (r.resolved.length >= r.targets.length || r.elapsed >= r.duration) return { ...r, done: true, won: false };
  }
  return r;
}
// Caller pauses the clock instead of passing hidden-tab or countdown time here.
export function tickRound(state: Round, delta: number): Round {
  if (state.done || !Number.isFinite(delta) || delta <= 0) return state;
  const dt = Math.min(delta, 100), elapsed = Math.min(state.duration, state.elapsed + dt);
  const r: Round = { ...state, elapsed, resolved: [...state.resolved], laneMs: [...state.laneMs] };
  r.laneMs[r.lane] += elapsed - state.elapsed;
  state.targets.forEach((target, i) => {
    if (r.resolved.includes(i)) return;
    if (state.id === "cyclops" && elapsed >= target.at) {
      r.resolved.push(i);
      if (r.lane === target.lane) { r.hits++; r.feedback = "Rock hit! Watch the next marked lane."; } else { r.successes++; r.feedback = "Dodged!"; }
      r.feedbackAt = elapsed;
    } else if (state.id !== "cyclops" && elapsed >= (Math.floor(target.at / 4000) + 1) * 4000) {
      // Keep the cue available through its cycle so a late press is observable.
      // Only a cycle with no press is classified as missed.
      r.resolved.push(i); r.misses++; r.feedback = "Missed. Watch the next cue."; r.feedbackAt = elapsed;
    }
  });
  return conclude(r);
}
export function moveLane(state: Round, direction: -1 | 1): Round {
  if (state.done || state.id !== "cyclops") return state;
  return { ...state, lane: Math.max(0, Math.min(2, state.lane + direction)) };
}
export function activeCue(state: Round): number {
  return state.targets.findIndex((t, i) => !state.resolved.includes(i) && state.elapsed >= Math.floor(t.at / 4000) * 4000);
}
export function pressTiming(state: Round): Round {
  if (state.done || state.id === "cyclops") return state;
  const index = activeCue(state);
  if (index < 0) return state;
  const distance = state.elapsed - state.targets[index].at, good = Math.abs(distance) <= state.window;
  return conclude({ ...state, resolved: [...state.resolved, index], successes: state.successes + Number(good), early: state.early + Number(!good && distance < 0), late: state.late + Number(!good && distance >= 0), feedback: good ? (state.id === "sirens" ? "Good stroke!" : "Arrow aligned!") : distance < 0 ? "Early. Wait for the gold zone." : "Late. Try the next cue.", feedbackAt: state.elapsed });
}
export function roundSummary(r: Round): AttemptSummary {
  return { won: r.won, source: r.plan.source, hits: r.hits, successes: r.successes, early: r.early, late: r.late, misses: r.misses, laneMs: r.laneMs.map(Math.round) as [number, number, number] };
}
