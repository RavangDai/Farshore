// Authoritative arcade rules. A model selects a bounded plan; it cannot change
// difficulty, warnings, hit detection, success conditions, or campaign progress.
export const ARCADE_SAVE = "farshore-arcade-v1";
export const ARCADE_PREFS = "farshore-arcade-preferences-v1";
export type TrialId = "cyclops" | "circe" | "sirens" | "scylla" | "bow";
export type Difficulty = "easy" | "normal" | "hard";
export type OpponentSource = "standard" | "ai";
export type Focus = "left" | "center" | "right" | "balanced" | "early" | "late";
export type PlanId = "alternating" | "focused" | "sweep" | "steady" | "swell" | "echo" | "patient" | "surge" | "feint" | "brew" | "chain" | "hoard" | "patrol" | "pincer" | "undertow";
export type OpponentPlan = { planId: PlanId; focus: Focus; source: OpponentSource };
// The old timing/lane rules below remain for historical regression checks.
// The playable edition uses the five engines in mythic.ts.
const earlierTrials = [
  { id: "cyclops" as const, title: "Cyclops' Coast", location: "The first escape", character: "Polyphemus", portrait: 5, tile: 0, book: "IX", kind: "lanes", objective: "Dodge the rocks. Survive for 45 seconds.", controls: "Move with Left / Right or A / D. Three hits end the attempt.", story: "You have escaped the Cyclops' cave. Now Polyphemus hurls rocks toward your departing ship. Keep the crew out of his reach.", quote: "You cannot hide on that little ship forever, Nobody!", success: "The last rock falls behind you. Your crew rows out to sea.", homer: "Odysseus escapes beneath the Cyclops' sheep. From shore, Polyphemus throws rocks toward the departing ship.", adaptation: "The three lanes, repeated throws, and survival challenge are invented arcade rules.", plans: ["alternating", "focused", "sweep"] as PlanId[], focuses: ["left", "center", "right"] as Focus[] },
  { id: "sirens" as const, title: "Sirens' Passage", location: "Keep the oars moving", character: "The Sirens", portrait: 11, tile: 4, book: "XII", kind: "timing", objective: "Row on the marker. Keep your rhythm through the song.", controls: "Press Space or tap Row when the beat enters the gold ring. Returning beats move right to left.", story: "Circe warned you about these voices. The crew's ears are sealed with wax and Odysseus is tied to the mast. Keep rowing until their song fades.", quote: "Stay, Odysseus. We know the stories you long to hear.", success: "The voices fade. The crew removes the wax, and the voyage continues.", homer: "The crew rows past the Sirens with wax in their ears, while Odysseus listens bound to the mast.", adaptation: "The visible rowing cues and changing cadence are an invented representation of keeping the ship moving.", plans: ["steady", "swell", "echo"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[] },
  { id: "bow" as const, title: "Ithaca's Bow", location: "One final trial", character: "Antinous", portrait: 17, tile: 5, book: "XXI", kind: "timing", objective: "Align the bow. Shoot through the axes.", controls: "Press Space or tap Release when the sight's center crosses the gold opening. The matching bar below shows your timing window.", story: "After the long crossing, Ithaca is beneath your feet. Penelope has set a contest with Odysseus' bow. Steady your aim and reclaim your place at home.", quote: "That bow has defeated every man here. What makes you different?", success: "The arrow flies true. The bow is yours, and the path to your family is open.", homer: "Penelope sets a contest to string Odysseus' bow and shoot through twelve axes. Odysseus succeeds.", adaptation: "Repeated timed shots and the suitor's pressure pattern are invented. The reunion epilogue condenses the remaining homecoming.", plans: ["patient", "surge", "feint"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[] },
];
export const trials = [
  { ...earlierTrials[0], title: "Blind Grid Tactics", location: "Cyclops' Coast", kind: "Grid stealth", objective: "Reach a cave exit before Polyphemus catches you.", controls: "Arrows / WASD or tap an adjacent tile. Sneak one tile, dash two, or hide beneath a sheep. Your move is followed by a warned 2×2 smash.", story: "Polyphemus is blinded. Become Nobody, creep beneath his sheep, and slip out of the cave while he searches for the sounds you leave behind.", quote: "Nobody! I can still hear your footsteps.", success: "Nobody slips out beneath the sheep. Your crew reaches the waiting ship.", adaptation: "The cave grid, noise clues, predictive searches, and repeatable escapes are invented arcade rules.", standard: "Polyphemus searches around your last noise. Sheep conceal a quiet move.", adaptive: "Polyphemus builds a noise heatmap and predicts the direction of your escape. A warning marks every smash before it lands." },
  { id: "circe" as const, title: "Transmutation Match-3", location: "Aeaea", character: "Circe", portrait: 7, tile: 2, book: "X", kind: "Potion puzzle duel", objective: "Outlast Circe in a duel of falling potions.", controls: "Left / Right to choose a column, Up to rotate your three potions, Space to drop. Match three in a row or column. Moly matches purify swine and send curses.", story: "Your crew has become swine. Brew with Hermes' moly to counter Circe's potions, and send the enchantment back across her own board.", quote: "Let us see whose magic fills the room first.", success: "The spell breaks. Your companions stand beside you again.", homer: "Circe transforms the crew into pigs. Hermes gives Odysseus moly; Circe later restores his companions.", adaptation: "The falling potions, competitive boards, and curse attacks are invented. Circe does not compete in a puzzle duel in the poem.", plans: ["brew", "chain", "hoard"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[], standard: "Circe places potions for immediate matches and sends curses as she earns them.", adaptive: "Circe previews chain reactions or banks curses for a burst when your board is crowded." },
  { ...earlierTrials[1], title: "Rhythm-Note Counter-Duel", location: "Sirens' Passage", kind: "Melody memory", objective: "Echo five melodies without filling your Temptation gauge.", controls: "Watch four numbered color lanes, then echo the melody with A / S / D / F or the four pads. The reply window is generous enough to play from memory.", story: "Odysseus is bound to the mast and the crew's ears are sealed. Echo the visible melody to keep the oars moving beyond the rocks.", adaptation: "Echoing melodies, four sound lanes, and the temptation meter are invented arcade rules. The poem's crew does not answer the Sirens' song.", standard: "The Sirens repeat learnable four-lane melodies at a steady tempo.", adaptive: "The Sirens remember your missed lanes and weave those notes into the next melody. Trick rests and tempo changes are shown as they happen." },
  { id: "scylla" as const, title: "Twin-Paddle Escape", location: "Scylla & Charybdis", character: "Scylla & Charybdis", portrait: 12, tile: 4, book: "XII", kind: "Paddle deflector", objective: "Survive the strait with your ship afloat.", controls: "Up / Down or W / S move your shield. Hold Space or the Row button to resist the whirlpool. Deflect glowing head strikes with your shield.", story: "Six heads strike from the cliffs while Charybdis drags the hull into her vortex. Guard the starboard side and keep the oars pulling.", quote: "Watch the heads. Feel the current. You cannot watch only one.", success: "Your battered ship reaches open water beyond the strait.", homer: "Circe advises passing Scylla rather than risking the ship at Charybdis. Scylla takes six companions during the crossing.", adaptation: "Paddle reflection and a survivable arcade duel are invented. A clear here does not imply a lossless passage in Homer.", plans: ["patrol", "pincer", "undertow"] as PlanId[], focuses: ["balanced", "early", "late"] as Focus[], standard: "Scylla sends a repeating sequence of six heads. Charybdis pulses at a steady rhythm.", adaptive: "Scylla aims successive heads around your shield; Charybdis synchronizes the pull with incoming strikes." },
  { ...earlierTrials[2], title: "12-Axes Archery Showdown", location: "Ithaca's Hall", kind: "Turn-based archery", objective: "Outscore Antinous across five shots through twelve axe rings.", controls: "Adjust aim, elevation, and string tension. Read the wind and the trajectory preview, then Release. Antinous takes his own shot before your next turn.", story: "Penelope's twelve axes stand in the hall. String the bow, judge the wind, and reclaim your place with a true shot.", adaptation: "Antinous cannot string the bow in Homer. His competitive shots, wind, and temporary ring blocks are invented for this arcade showdown.", standard: "Antinous shoots with imperfect aim and visible trajectory variance.", adaptive: "Antinous calculates wind compensation and can choose a lower-scoring block shot to narrow your next opening." },
];
export const planNames: Record<PlanId, string> = { alternating: "Blind search", focused: "Noise heatmap", sweep: "Exit ambush", steady: "Repeating melody", swell: "Weak-lane refrain", echo: "Trick-note echo", patient: "Unsteady suitor", surge: "Wind reader", feint: "Block-shot gambit", brew: "Simple brew", chain: "Chain alchemist", hoard: "Banked curses", patrol: "Six-head patrol", pincer: "Shield pincer", undertow: "Synchronized undertow" };
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
  return `${planNames[plan.planId]}. ${plan.source === "standard" ? trialFor(id).standard : trialFor(id).adaptive}`;
}
export function adaptivePlan(id: TrialId): OpponentPlan { return { ...standardPlan(id), planId: trialFor(id).plans[1], source: "ai" }; }
export type AttemptSummary = { won: boolean; source: OpponentSource; hits: number; successes: number; early: number; late: number; misses: number; laneMs: [number, number, number]; laneMisses?: [number, number, number, number] };
export type TrialRecord = { cleared: "pending" | "cleared" | "assisted"; attempts: number; recent: AttemptSummary[] };
export type ArcadeSave = { version: 2; started: boolean; legacy: boolean; records: Record<TrialId, TrialRecord> };
export function newArcade(): ArcadeSave {
  const empty = (): TrialRecord => ({ cleared: "pending", attempts: 0, recent: [] });
  return { version: 2, started: false, legacy: false, records: { cyclops: empty(), circe: empty(), sirens: empty(), scylla: empty(), bow: empty() } };
}
export function validSummary(value: unknown): value is AttemptSummary {
  if (!value || typeof value !== "object") return false;
  const a = value as AttemptSummary;
  return typeof a.won === "boolean" && ["standard", "ai"].includes(a.source) && [a.hits, a.successes, a.early, a.late, a.misses].every(n => Number.isInteger(n) && n >= 0 && n <= 100) && Array.isArray(a.laneMs) && a.laneMs.length === 3 && a.laneMs.every(n => Number.isInteger(n) && n >= 0 && n <= 60000) && (a.laneMisses === undefined || Array.isArray(a.laneMisses) && a.laneMisses.length === 4 && a.laneMisses.every(n => Number.isInteger(n) && n >= 0 && n <= 100));
}
export function readArcade(raw: string | null): ArcadeSave | null {
  try {
    if (!raw || raw.length > 10000) return null;
    const v = JSON.parse(raw);
    if (![1, 2].includes(v?.version) || typeof v.started !== "boolean" || !v.records || Object.keys(v.records).length !== (v.version === 1 ? 3 : 5) || (v.version === 2 && typeof v.legacy !== "boolean")) return null;
    const result = newArcade(); result.started = v.started; result.legacy = v.version === 1 || v.legacy;
    const route = v.version === 1 ? earlierTrials : trials;
    for (const t of route) {
      const r = v.records[t.id];
      if (!r || !["pending", "cleared", "assisted"].includes(r.cleared) || !Number.isInteger(r.attempts) || r.attempts < 0 || r.attempts > 99999 || !Array.isArray(r.recent) || r.recent.length > 2 || r.recent.length > r.attempts || !r.recent.every(validSummary)) return null;
      if (!v.started && (r.attempts > 0 || r.cleared !== "pending")) return null;
      result.records[t.id] = { cleared: r.cleared, attempts: r.attempts, recent: r.recent.map((a: AttemptSummary) => ({ ...a, laneMs: [...a.laneMs] })) };
    }
    // A save cannot skip a locked encounter.
    if (!result.legacy || v.version === 1) for (let i = 1; i < route.length; i++) if ((v.records[route[i].id].cleared !== "pending" || v.records[route[i].id].attempts > 0) && v.records[route[i - 1].id].cleared === "pending") return null;
    return result;
  } catch { return null; }
}
export function unlocked(save: ArcadeSave, id: TrialId) {
  const i = trials.findIndex(t => t.id === id);
  return save.started && trials.slice(0, i).every(t => save.records[t.id].cleared !== "pending");
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
export function challengeObjective(id: TrialId, difficulty: Difficulty) {
  const tier = ["easy", "normal", "hard"].indexOf(difficulty);
  return id === "scylla" ? `Deflect the heads and resist the pull for ${[30, 40, 50][tier]} seconds.` : id === "cyclops" ? `Reach an exit in ${[32, 26, 22][tier]} turns. Three smashes end the escape.` : trialFor(id).objective;
}
