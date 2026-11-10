// Authoritative arcade rules. A model selects a bounded plan; it cannot change
// difficulty, warnings, hit detection, success conditions, or campaign progress.
export const ARCADE_SAVE = "farshore-arcade-v1";
export const ARCADE_PREFS = "farshore-arcade-preferences-v1";
export type LegacyTrialId = "cyclops" | "circe" | "sirens" | "scylla" | "bow";
export type TrialId = LegacyTrialId | "lotus" | "aeolus" | "calypso";
export type Difficulty = "easy" | "normal" | "hard";
export type OpponentSource = "standard" | "ai";
export type Focus = "left" | "center" | "right" | "balanced" | "early" | "late";
export type PlanId = "alternating" | "focused" | "sweep" | "steady" | "swell" | "echo" | "patient" | "surge" | "feint" | "brew" | "chain" | "hoard" | "patrol" | "pincer" | "undertow";
export type OpponentPlan = { planId: PlanId; focus: Focus; source: OpponentSource };
// The old timing/lane rules below remain for historical regression checks.
// The playable edition extends the preserved engines with journey.ts.
const earlierTrials = [
  { id: "cyclops" as const, title: "Cyclops' Coast", location: "The first escape", character: "Polyphemus", portrait: 5, tile: 0, book: "IX", kind: "lanes", objective: "Dodge the rocks. Survive for 45 seconds.", controls: "Move with Left / Right or A / D. Three hits end the attempt.", story: "You have escaped the Cyclops' cave. Now Polyphemus hurls rocks toward your departing ship. Keep the crew out of his reach.", quote: "You cannot hide on that little ship forever, Nobody!", success: "The last rock falls behind you. Your crew rows out to sea.", homer: "Odysseus escapes beneath the Cyclops' sheep. From shore, Polyphemus throws rocks toward the departing ship.", adaptation: "The three lanes, repeated throws, and survival challenge are invented arcade rules.", plans: ["alternating", "focused", "sweep"] as PlanId[], focuses: ["left", "center", "right"] as Focus[] },
  { id: "sirens" as const, title: "Sirens' Passage", location: "Keep the oars moving", character: "The Sirens", portrait: 11, tile: 4, book: "XII", kind: "timing", objective: "Row on the marker. Keep your rhythm through the song.", controls: "Press Space or tap Row when the beat enters the gold ring. Returning beats move right to left.", story: "Circe warned you about these voices. The crew's ears are sealed with wax and Odysseus is tied to the mast. Keep rowing until their song fades.", quote: "Stay, Odysseus. We know the stories you long to hear.", success: "The voices fade. The crew removes the wax, and the voyage continues.", homer: "The crew rows past the Sirens with wax in their ears, while Odysseus listens bound to the mast.", adaptation: "The visible rowing cues and changing cadence are an invented representation of keeping the ship moving.", plans: ["steady", "swell", "echo"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[] },
  { id: "bow" as const, title: "Ithaca's Bow", location: "One final trial", character: "Antinous", portrait: 17, tile: 5, book: "XXI", kind: "timing", objective: "Align the bow. Shoot through the axes.", controls: "Press Space or tap Release when the sight's center crosses the gold opening. The matching bar below shows your timing window.", story: "After the long crossing, Ithaca is beneath your feet. Penelope has set a contest with Odysseus' bow. Steady your aim and reclaim your place at home.", quote: "That bow has defeated every man here. What makes you different?", success: "The arrow flies true. The bow is yours, and the path to your family is open.", homer: "Penelope sets a contest to string Odysseus' bow and shoot through twelve axes. Odysseus succeeds.", adaptation: "Repeated timed shots and the suitor's pressure pattern are invented. The reunion epilogue condenses the remaining homecoming.", plans: ["patient", "surge", "feint"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[] },
];
const legacyTrials = [
  { ...earlierTrials[0], title: "Blind Grid Tactics", location: "Cyclops' Coast", kind: "Grid stealth", objective: "Reach a cave exit before Polyphemus catches you.", controls: "Arrows / WASD or tap an adjacent tile. Sneak one tile, dash two, or hide beneath a sheep. Your move is followed by a warned 2×2 smash.", story: "Polyphemus is blinded. Become Nobody, creep beneath his sheep, and slip out of the cave while he searches for the sounds you leave behind.", quote: "Nobody! I can still hear your footsteps.", success: "Nobody slips out beneath the sheep. Your crew reaches the waiting ship.", adaptation: "The cave grid, noise clues, predictive searches, and repeatable escapes are invented arcade rules.", standard: "Polyphemus searches around your last noise. Sheep conceal a quiet move.", adaptive: "Polyphemus builds a noise heatmap and predicts the direction of your escape. A warning marks every smash before it lands." },
  { id: "circe" as const, title: "Transmutation Match-3", location: "Aeaea", character: "Circe", portrait: 7, tile: 2, book: "X", kind: "Potion puzzle duel", objective: "Outlast Circe in a duel of falling potions.", controls: "Left / Right to choose a column, Up to rotate your three potions, Space to drop. Match three in a row or column. Moly matches purify swine and send curses.", story: "Your crew has become swine. Brew with Hermes' moly to counter Circe's potions, and send the enchantment back across her own board.", quote: "Let us see whose magic fills the room first.", success: "The spell breaks. Your companions stand beside you again.", homer: "Circe transforms the crew into pigs. Hermes gives Odysseus moly; Circe later restores his companions.", adaptation: "The falling potions, competitive boards, and curse attacks are invented. Circe does not compete in a puzzle duel in the poem.", plans: ["brew", "chain", "hoard"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[], standard: "Circe places potions for immediate matches and sends curses as she earns them.", adaptive: "Circe previews chain reactions or banks curses for a burst when your board is crowded." },
  { ...earlierTrials[1], title: "Rhythm-Note Counter-Duel", location: "Sirens' Passage", kind: "Melody memory", objective: "Echo five melodies without filling your Temptation gauge.", controls: "Watch four numbered color lanes, then echo the melody with A / S / D / F or the four pads. The reply window is generous enough to play from memory.", story: "Odysseus is bound to the mast and the crew's ears are sealed. Echo the visible melody to keep the oars moving beyond the rocks.", adaptation: "Echoing melodies, four sound lanes, and the temptation meter are invented arcade rules. The poem's crew does not answer the Sirens' song.", standard: "The Sirens repeat learnable four-lane melodies at a steady tempo.", adaptive: "The Sirens remember your missed lanes and weave those notes into the next melody. Trick rests and tempo changes are shown as they happen." },
  { id: "scylla" as const, title: "Twin-Paddle Escape", location: "Scylla & Charybdis", character: "Scylla & Charybdis", portrait: 12, tile: 4, book: "XII", kind: "Paddle deflector", objective: "Survive the strait with your ship afloat.", controls: "Up / Down or W / S move your shield. Hold Space or the Row button to resist the whirlpool. Deflect glowing head strikes with your shield.", story: "Six heads strike from the cliffs while Charybdis drags the hull into her vortex. Guard the starboard side and keep the oars pulling.", quote: "Watch the heads. Feel the current. You cannot watch only one.", success: "Your battered ship reaches open water beyond the strait.", homer: "Circe advises passing Scylla rather than risking the ship at Charybdis. Scylla takes six companions during the crossing.", adaptation: "Paddle reflection and a survivable arcade duel are invented. A clear here does not imply a lossless passage in Homer.", plans: ["patrol", "pincer", "undertow"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[], standard: "Scylla sends a repeating sequence of six heads. Charybdis pulses at a steady rhythm.", adaptive: "Scylla aims successive heads around your shield; Charybdis synchronizes the pull with incoming strikes." },
  { ...earlierTrials[2], title: "12-Axes Archery Showdown", location: "Ithaca's Hall", kind: "Twelve-axe archery", objective: "Shoot through the line of twelve axe heads. Every axe your arrow passes scores a point. After five arrows each, beat Antinous' total; ties go to him.", controls: "Aim with the mouse, the arrow keys or WASD, or drag on a touch screen. Hold the mouse button, Space or DRAW to pull the bow, then let go to shoot. A full draw flies flattest, but hold it too long and your arm trembles. Aim into the draught.", story: "Penelope's twelve axes stand in a line down the hall. String the great bow, read the draught from the doors, and send an arrow through every one.", adaptation: "Antinous cannot string the bow in Homer. His competitive shots, wind, and temporary ring blocks are invented for this arcade showdown.", standard: "Antinous aims down the line and allows for only half the draught, so strong winds carry his arrows wide.", adaptive: "Antinous reads the draught fully, and when he leads he may lodge an arrow in one axe to narrow its opening for your next shot." },
];
const extraTrial = (id: TrialId, title: string, character: string, portrait: number, tile: number, book: string, kind: string, objective: string, controls: string, story: string, standard: string, adaptive: string) => ({ id, title, location: title, character, portrait, tile, book, kind, objective, controls, story, standard, adaptive, quote: "The way home is earned, one crossing at a time.", success: "The crossing is behind you. Ithaca is a little closer.", homer: story, adaptation: "The guardians, obstacles, pickups, and survival rules are an original arcade interpretation of this episode.", plans: ["patrol", "pincer", "undertow"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[] });
export const trials = [
  extraTrial("lotus", "Land of the Lotus-Eaters", "Lotus Guardians", 6, 1, "IX", "Maze rescue", "Find three sailors and bring each back to the ship before the lotus takes hold.", "Arrows / WASD to move, or use the compass. Touch a sailor to lead them home. Gold moly grants temporary protection.", "On the lotus shore, your companions forget their desire to return home. Odysseus brings them back to the waiting ship.", "Guardians patrol the garden. Rescue one sailor at a time and return to the ship.", "On Medium, guardians pursue along the maze after detecting you. On Hard, they predict your next junction and guard the way back."),
  { ...legacyTrials[0], title: "Cyclops’ Cave", location: "Cyclops’ Cave", kind: "Three-lane runner", objective: "Escape the cave. Dodge boulders, jump broken floors, and slide beneath beams.", controls: "A / D or Left / Right switch lanes. W / Up / Space jumps. S / Down slides. Sheep restore one life. Watch the chase gap.", story: "Polyphemus has been blinded. Race beneath the sheep and through the collapsing cave before the giant catches up.", standard: "The Cyclops attacks in a predictable rotation. Every obstacle has at least two seconds of warning.", adaptive: "The Cyclops targets your current lane; Hard anticipates your recent lane choices. Attacks lock early enough to dodge." },
  extraTrial("aeolus", "Island of Aeolus", "The Unbound Winds", 9, 3, "X", "Wind sailing", "Keep your ship aloft through the wind gates until you reach open water.", "Space / Up / W or tap Lift to catch the wind. Release to descend. Cyan blessings score points; green repairs restore the hull.", "Aeolus gives Odysseus a bag of contrary winds. When the crew opens it, the escaping winds drive the ship away from Ithaca.", "Wind gates follow a gentle wave. Short taps keep your ship steady.", "Storm gates vary their altitude and currents. Their safe passages remain visible well before arrival."),
  { ...legacyTrials[1], title: "Circe’s Palace", location: "Circe’s Palace" },
  { ...legacyTrials[2], title: "Sirens’ Passage" },
  { ...legacyTrials[3], title: "Scylla & Charybdis" },
  extraTrial("calypso", "Calypso’s Raft Escape", "Poseidon’s Storm", 13, 3, "V", "Raft hopping", "Cross the drifting timbers and reach the distant shore before the storm closes in.", "Left / Right or A / D hop sideways. Up / W / Space hops forward. Down / S hops back. Stay on drifting timber and avoid the sea.", "Released from Ogygia, Odysseus builds a raft and chooses the journey to Penelope. Poseidon’s storm breaks the raft, and he swims toward Scheria.", "Timbers drift slowly. Look for the next safe landing before you jump.", "Currents grow stronger on each difficulty. Predict the timber’s drift and choose the broadest crossing."),
  { ...legacyTrials[4], title: "Palace of Ithaca", location: "Palace of Ithaca" },
];
export const planNames: Record<PlanId, string> = { alternating: "Blind search", focused: "Noise heatmap", sweep: "Exit ambush", steady: "Repeating melody", swell: "Weak-lane refrain", echo: "Trick-note echo", patient: "Unsteady suitor", surge: "Wind reader", feint: "Block-shot gambit", brew: "Simple brew", chain: "Chain alchemist", hoard: "Banked curses", patrol: "Six-head patrol", pincer: "Shield pincer", undertow: "Synchronized undertow" };
export function planLabel(id: TrialId, plan: OpponentPlan) {
  const names: Partial<Record<TrialId, Partial<Record<PlanId, string>>>> = {
    lotus: { patrol: "Garden patrol", pincer: "Pincer pursuit", undertow: "Junction interception" },
    cyclops: { alternating: "Cave patrol", focused: "Lane pursuit", sweep: "Lane prediction" },
    aeolus: { patrol: "Gentle breeze", pincer: "Shifting winds", undertow: "Counter-gusts" },
    calypso: { patrol: "Drifting currents", pincer: "Storm watch", undertow: "Landing prediction" },
  };
  return names[id]?.[plan.planId] || planNames[plan.planId];
}
export const difficultyNames: Record<Difficulty, string> = { easy: "Easy", normal: "Medium", hard: "Hard" };
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
  return `${planLabel(id, plan)}. ${plan.source === "standard" ? trialFor(id).standard : trialFor(id).adaptive}`;
}
export function adaptivePlan(id: TrialId): OpponentPlan { return { ...standardPlan(id), planId: trialFor(id).plans[1], source: "ai" }; }
export type AttemptSummary = { won: boolean; source: OpponentSource; hits: number; successes: number; early: number; late: number; misses: number; laneMs: [number, number, number]; laneMisses?: [number, number, number, number]; score?: number; timeMs?: number; difficulty?: Difficulty };
export type Medal = "gold" | "silver" | "bronze";
export type BestRun = { score: number; timeMs: number; medal: Medal };
export type TrialRecord = { cleared: "pending" | "cleared" | "assisted"; attempts: number; recent: AttemptSummary[]; bests: Partial<Record<Difficulty, BestRun>> };
export type ArcadeSave = { version: 3; started: boolean; legacy: boolean; records: Record<TrialId, TrialRecord> };
export function newArcade(): ArcadeSave {
  const records = {} as Record<TrialId, TrialRecord>;
  for (const trial of trials) records[trial.id] = { cleared: "pending", attempts: 0, recent: [], bests: {} };
  return { version: 3, started: false, legacy: false, records };
}
export function validSummary(value: unknown): value is AttemptSummary {
  if (!value || typeof value !== "object") return false;
  const a = value as AttemptSummary;
  if (a.score !== undefined && (!Number.isInteger(a.score) || a.score < 0 || a.score > 1000000) || a.timeMs !== undefined && (!Number.isInteger(a.timeMs) || a.timeMs < 0 || a.timeMs > 3600000) || a.difficulty !== undefined && !["easy", "normal", "hard"].includes(a.difficulty)) return false;
  return typeof a.won === "boolean" && ["standard", "ai"].includes(a.source) && [a.hits, a.successes, a.early, a.late, a.misses].every(n => Number.isInteger(n) && n >= 0 && n <= 100) && Array.isArray(a.laneMs) && a.laneMs.length === 3 && a.laneMs.every(n => Number.isInteger(n) && n >= 0 && n <= 60000) && (a.laneMisses === undefined || Array.isArray(a.laneMisses) && a.laneMisses.length === 4 && a.laneMisses.every(n => Number.isInteger(n) && n >= 0 && n <= 100));
}
export function readArcade(raw: string | null): ArcadeSave | null {
  try {
    if (!raw || raw.length > 10000) return null;
    const v = JSON.parse(raw);
    if (![1, 2, 3].includes(v?.version) || typeof v.started !== "boolean" || !v.records || Object.keys(v.records).length !== (v.version === 1 ? 3 : v.version === 2 ? 5 : 8) || (v.version >= 2 && typeof v.legacy !== "boolean")) return null;
    const result = newArcade(); result.started = v.started; result.legacy = v.version < 3 || v.legacy;
    const route = v.version === 1 ? earlierTrials : v.version === 2 ? legacyTrials : trials;
    for (const t of route) {
      const r = v.records[t.id];
      if (!r || !["pending", "cleared", "assisted"].includes(r.cleared) || !Number.isInteger(r.attempts) || r.attempts < 0 || r.attempts > 99999 || !Array.isArray(r.recent) || r.recent.length > 2 || r.recent.length > r.attempts || !r.recent.every(validSummary)) return null;
      if (!v.started && (r.attempts > 0 || r.cleared !== "pending")) return null;
      const bests: TrialRecord["bests"] = {};
      if (r.bests !== undefined) {
        if (!r.bests || typeof r.bests !== "object" || Object.keys(r.bests).some(k => !["easy", "normal", "hard"].includes(k))) return null;
        for (const difficulty of ["easy", "normal", "hard"] as Difficulty[]) {
          const best = r.bests[difficulty];
          if (best === undefined) continue;
          if (!best || r.cleared !== "cleared" || !Number.isInteger(best.score) || best.score < 0 || best.score > 1000000 || !Number.isInteger(best.timeMs) || best.timeMs < 0 || best.timeMs > 3600000 || !["gold", "silver", "bronze"].includes(best.medal)) return null;
          bests[difficulty] = { score: best.score, timeMs: best.timeMs, medal: best.medal };
        }
      }
      result.records[t.id] = { cleared: r.cleared, attempts: r.attempts, recent: r.recent.map((a: AttemptSummary) => ({ ...a, laneMs: [...a.laneMs] })), bests };
    }
    return result;
  } catch { return null; }
}
// Every trial is open as soon as a voyage has started — play them in any
// order, any number of times. `id` is still checked against the real trial
// list so an unknown id never slips through as "open".
export function unlocked(save: ArcadeSave, id: TrialId) {
  return save.started && trials.some(t => t.id === id);
}
export function medalFor(summary: Pick<AttemptSummary, "hits" | "misses">): Medal { return summary.hits === 0 && summary.misses === 0 ? "gold" : summary.hits + summary.misses <= 2 ? "silver" : "bronze"; }
export function finishAttempt(save: ArcadeSave, id: TrialId, summary: AttemptSummary): ArcadeSave {
  if (!unlocked(save, id) || !validSummary(summary)) return save;
  const old = save.records[id];
  const bests = { ...old.bests };
  if (summary.won && summary.difficulty && summary.score !== undefined && summary.timeMs !== undefined) {
    const best = bests[summary.difficulty], medal = medalFor(summary), rank = { bronze: 0, silver: 1, gold: 2 };
    bests[summary.difficulty] = { score: Math.max(best?.score ?? 0, summary.score), timeMs: Math.min(best?.timeMs ?? Infinity, summary.timeMs), medal: best && rank[best.medal] > rank[medal] ? best.medal : medal };
  }
  return { ...save, records: { ...save.records, [id]: { cleared: summary.won ? "cleared" : old.cleared, attempts: Math.min(99999, old.attempts + 1), recent: [...old.recent, summary].slice(-2), bests } } };
}
export function assistTrial(save: ArcadeSave, id: TrialId): ArcadeSave {
  if (!unlocked(save, id) || save.records[id].cleared !== "pending") return save;
  return { ...save, records: { ...save.records, [id]: { ...save.records[id], cleared: "assisted" } } };
}
export const clearedCount = (save: ArcadeSave) => trials.filter(t => save.records[t.id].cleared !== "pending").length;
export const totalScore = (save: ArcadeSave) => Object.values(save.records).reduce((sum, record) => sum + Math.max(0, ...Object.values(record.bests).map(best => best?.score ?? 0)), 0);
export function challengeObjective(id: TrialId, difficulty: Difficulty) {
  const tier = ["easy", "normal", "hard"].indexOf(difficulty);
  return id === "scylla" ? `Deflect the heads and resist the pull for ${[60, 75, 90][tier]} seconds.` : trialFor(id).objective;
}
