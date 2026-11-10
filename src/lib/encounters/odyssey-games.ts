import { validPlan, type AttemptSummary, type Difficulty, type OpponentPlan } from "../arcade/arcade.ts";

export type AdventureId = "lotus" | "cyclops" | "aeolus" | "calypso";
type Point = { x: number; y: number };
export type AIDebug = { algorithm: string; state: string; target: string; prediction: string; confidence: number; pathLength: number; decision: string };
type Base = { id: AdventureId; difficulty: Difficulty; plan: OpponentPlan; practice: boolean; seed: number; elapsed: number; done: boolean; won: boolean; feedback: string; rivalLine: string; score: number; rivalScore: number; hits: number; damageTaken: number; successes: number; misses: number; combo: number; bestCombo: number; invulnerable: number; duration: number; debug: AIDebug };
export type LotusState = Base & { id: "lotus"; player: Point; previous: Point; sailors: Point[]; carrying: boolean; rescued: number; guardians: Point[]; guardClock: number; moveClock: number; protection: number; pickups: Point[]; patrol: number; relics: Point[]; relicsFound: number; camp?: number };
export type Obstacle = { lane: number; kind: "rock" | "crate" | "beam" | "gap" | "sheep" | "coin"; remaining: number; warning: number };
export type RunnerState = Base & { id: "cyclops"; lane: number; history: number[]; jump: number; slide: number; gap: number; obstacles: Obstacle[]; spawn: number; wave: number; coins: number; precision: number };
export type WindGate = { x: number; center: number; gap: number; passed: boolean; pickup: "wind" | "repair"; collected: boolean; hit?: boolean };
export type WindState = Base & { id: "aeolus"; y: number; vy: number; gates: WindGate[]; spawn: number; wave: number; blessings: number; gust: number; gustClock: number; liftHistory: number[]; lastCenter: number; perfectPasses: number };
export type RaftRow = { offset: number; speed: number; width: number };
export type RaftState = Base & { id: "calypso"; x: number; row: number; progress: number; rows: RaftRow[]; moveClock: number; crossing: number; stormClock: number; lightning: { x: number; row: number; warning: number; age: number } | null; wood: number; gatheredRows: number[] };
export type AdventureState = LotusState | RunnerState | WindState | RaftState;
export type AdventureAction = { type: "move"; dx: number; dy: number } | { type: "jump" } | { type: "slide" } | { type: "lift" };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const tier = (s: Base) => ["easy", "normal", "hard"].indexOf(s.difficulty);
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
function end(s: Base, won: boolean, message: string) { s.done = true; s.won = won; s.feedback = message; if (won) s.score += Math.max(0, 3 - s.hits) * 150; }
function reward(s: Base, points = 100) { s.score += points; s.successes++; s.combo++; s.bestCombo = Math.max(s.combo, s.bestCombo); }
function damage(s: Base, message: string) { if (s.invulnerable > 0) return false; s.hits++; s.damageTaken++; s.combo = 0; s.invulnerable = 1800; s.feedback = message; if (s.hits >= 3) end(s, false, message); return true; }

// A shared tile movement model, extending the original cave grid into a rescue maze.
export const LOTUS_MAZE = [
  "###############", "#.............#", "#.###.###.###.#", "#...#...#...#.#", "###.#.#.###.#.#", "#...#.#.....#.#", "#.###.#####.#.#", "#.....#.....#.#", "#.###.#.###.#.#", "#.............#", "###############",
];
export const LOTUS_SHIP = { x: 1, y: 9 };
export const walkable = (p: Point) => LOTUS_MAZE[p.y]?.[p.x] === ".";
export function mazePath(start: Point, goal: Point): Point[] {
  const frontier = [{ point: start, path: [] as Point[], cost: 0 }], visited = new Set<string>();
  while (frontier.length) {
    frontier.sort((a, b) => a.cost + Math.abs(a.point.x - goal.x) + Math.abs(a.point.y - goal.y) - b.cost - Math.abs(b.point.x - goal.x) - Math.abs(b.point.y - goal.y));
    const node = frontier.shift()!, key = `${node.point.x},${node.point.y}`;
    if (same(node.point, goal)) return node.path;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const point = { x: node.point.x + dx, y: node.point.y + dy };
      if (walkable(point)) frontier.push({ point, path: [...node.path, point], cost: node.cost + 1 });
    }
  }
  return [];
}
function newRows(s: Base): RaftRow[] {
  // The widest gap is under two hop lengths, preserving a reachable landing.
  return Array.from({ length: 7 }, (_, i) => ({ offset: i % 2 ? 1.3 : 0, speed: (i % 2 ? -1 : 1) * [0.2, 0.32, 0.44][tier(s)] * (s.plan.source === "ai" ? 1.15 : 1), width: [4.1, 3.9, 3.8][tier(s)] }));
}
export function newAdventure(id: AdventureId, difficulty: Difficulty, plan: OpponentPlan, practice = false, seed = 4200): AdventureState {
  if (!validPlan(id, plan) || !["easy", "normal", "hard"].includes(difficulty)) throw new Error("Unsupported encounter rules");
  const b: Base = { id, difficulty, plan: { ...plan }, practice, seed, elapsed: 0, done: false, won: false, feedback: "", rivalLine: "", score: 0, rivalScore: 0, hits: 0, damageTaken: 0, successes: 0, misses: 0, combo: 0, bestCombo: 0, invulnerable: 0, duration: practice ? 20000 : 75000, debug: { algorithm: "Patrol", state: "Observing", target: "None", prediction: "No history yet", confidence: 0, pathLength: 0, decision: "Awaiting first decision" } };
  if (id === "lotus") return { ...b, id, relics: [{ x: 3, y: 5 }, { x: 11, y: 3 }, { x: 9, y: 9 }], relicsFound: 0, duration: practice ? 60000 : [180000, 150000, 120000][tier(b)], player: { ...LOTUS_SHIP }, previous: { ...LOTUS_SHIP }, sailors: [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 13, y: 9 }], carrying: false, rescued: 0, guardians: [{ x: 7, y: 1 }, { x: 11, y: 5 }], guardClock: 0, moveClock: 0, protection: 0, pickups: [{ x: 3, y: 3 }, { x: 9, y: 7 }], patrol: 0, feedback: "Find a sailor, then return to the ship at the bottom left.", rivalLine: "Patrol · the guardians keep watch over the lotus garden." };
  if (id === "cyclops") return { ...b, id, coins: 0, precision: 0, lane: 1, history: [1], jump: 0, slide: 0, gap: 70, obstacles: [], spawn: 1700, wave: 0, feedback: "Watch the horizon. Change lanes, jump crates, and slide under beams.", rivalLine: "Polyphemus is closing in. Every attack is warned before it reaches you." };
  if (id === "aeolus") return { ...b, id, perfectPasses: 0, y: 200, vy: 0, gates: [], spawn: 1200, wave: 0, blessings: 0, gust: 0, gustClock: 0, liftHistory: [], lastCenter: 200, feedback: "Tap Lift in short bursts. Sail through the clear water between the rocks.", rivalLine: "Aeolus sends a gentle breeze. Read the next opening." };
  return { ...b, id: "calypso", duration: practice ? 60000 : 150000, x: 3.5, row: 0, progress: 0, rows: newRows(b), moveClock: 0, crossing: 1, stormClock: 5000, lightning: null, wood: 0, gatheredRows: [], feedback: "Hop onto a timber. Cross seven currents, then rest on the far shore.", rivalLine: "The current carries every timber. Choose your landing before you jump." };
}
function checkLotus(s: LotusState) {
  const relic = s.relics.findIndex(p => same(p, s.player));
  if (relic >= 0) { s.relics.splice(relic, 1); s.relicsFound++; reward(s, 125); s.feedback = `Laurel relic ${s.relicsFound}/3 recovered. +125 points. The crew still needs you.`; }
  const sailor = s.sailors.findIndex(p => same(p, s.player));
  if (!s.carrying && sailor >= 0) { s.sailors.splice(sailor, 1); s.carrying = true; s.feedback = "A sailor follows you. Bring them to the ship at the bottom left."; }
  const pickup = s.pickups.findIndex(p => same(p, s.player));
  if (pickup >= 0) { s.pickups.splice(pickup, 1); s.protection = 14000; s.score += 75; s.feedback = "Moly protects you for fourteen seconds. Make for the ship!"; }
  if (s.carrying && same(s.player, LOTUS_SHIP)) { s.carrying = false; s.rescued++; reward(s, 500); s.feedback = `${s.rescued} of ${s.practice ? 1 : 3} sailors safe aboard.`; if (s.rescued >= (s.practice ? 1 : 3)) end(s, true, "Your companions remember Ithaca. The ship leaves the lotus shore."); }
  if (!s.protection && s.guardians.some(p => same(p, s.player)) && damage(s, "A guardian caught you. You return to the ship; keep an eye on the patrols.")) {
    if (s.carrying) { s.sailors.push({ ...s.player }); s.carrying = false; }
    s.player = { ...LOTUS_SHIP };
  }
}
export function onTimber(s: RaftState, x = s.x, row = s.row, futureMs = 0) {
  if (row === 0 || row === 8) return true;
  const r = s.rows[row - 1], phase = ((x - r.offset - r.speed * futureMs / 1000) % 5.5 + 5.5) % 5.5;
  return phase >= 0.12 && phase <= r.width - 0.12;
}
function raftFall(s: RaftState) { if (damage(s, "The sea took your landing. Back to shore—wait for a broad timber.")) { s.row = 0; s.x = 3.5; } }
export function adventureAction(state: AdventureState, action: AdventureAction): AdventureState {
  if (state.done) return state;
  const s = structuredClone(state);
  if (s.id === "lotus" && action.type === "move" && s.moveClock <= 0) {
    if (Math.abs(action.dx) + Math.abs(action.dy) !== 1) return state;
    const point = { x: s.player.x + action.dx, y: s.player.y + action.dy };
    if (!walkable(point)) return state;
    s.previous = s.player; s.player = point; s.moveClock = 170; checkLotus(s);
  } else if (s.id === "cyclops") {
    if (action.type === "move" && action.dx) { s.lane = clamp(s.lane + Math.sign(action.dx), 0, 2); s.history = [...s.history, s.lane].slice(-6); }
    if ((action.type === "jump" || action.type === "move" && action.dy < 0) && !s.jump && !s.slide) s.jump = 1000;
    if ((action.type === "slide" || action.type === "move" && action.dy > 0) && !s.jump && !s.slide) s.slide = 1000;
  } else if (s.id === "aeolus" && action.type === "lift") { s.vy = -205; s.liftHistory = [...s.liftHistory, s.elapsed].slice(-8); }
  else if (s.id === "calypso" && action.type === "move" && s.moveClock <= 0) {
    if (Math.abs(action.dx) + Math.abs(action.dy) !== 1) return state;
    s.x = clamp(s.x + action.dx, 0.3, 6.7); s.row = clamp(s.row - action.dy, 0, 8); s.moveClock = 210;
    const timber = s.rows[s.row - 1];
    if (timber && onTimber(s) && !s.gatheredRows.includes(s.row)) {
      const phase = ((s.x - timber.offset) % 5.5 + 5.5) % 5.5;
      if (Math.abs(phase - timber.width / 2) < .65) { s.gatheredRows.push(s.row); s.wood++; reward(s, 75); s.feedback = `Driftwood secured. ${s.wood}/3 pieces for a repair at the next shore.`; }
    }
    if (!onTimber(s)) raftFall(s);
    else if (s.row === 8) {
      reward(s, 600); s.progress++; s.feedback = "A safe shore! Catch your breath before the next crossing.";
      if (s.wood >= 3 && s.hits > 0) { s.wood -= 3; s.hits--; s.feedback = "Three driftwood pieces repair the raft. One life restored at the safe shore."; }
      if (s.progress >= (s.practice ? 1 : 5)) end(s, true, "The storm breaks. Odysseus reaches the shore of Scheria.");
      else { s.crossing++; s.row = 0; s.rows = newRows(s); s.gatheredRows = []; s.invulnerable = 0; s.lightning = null; }
    }
  }
  return s;
}
export function tickAdventure(state: AdventureState, delta: number): AdventureState {
  if (state.done || !Number.isFinite(delta) || delta <= 0) return state;
  const s = structuredClone(state), dt = Math.min(100, delta), t = tier(s); s.elapsed += dt; s.invulnerable = Math.max(0, s.invulnerable - dt);
  if (s.id === "lotus") {
    s.moveClock = Math.max(0, s.moveClock - dt); s.protection = Math.max(0, s.protection - dt); s.guardClock += dt;
    if (s.guardClock >= [1050, 780, 600][t]) {
      s.guardClock = 0; s.patrol++;
      const waypoints = [{ x: 7, y: 1 }, { x: 13, y: 5 }, { x: 9, y: 9 }, { x: 5, y: 5 }, { x: 1, y: 1 }];
      s.guardians = s.guardians.map((guard, i) => {
        const detected = Math.abs(guard.x - s.player.x) + Math.abs(guard.y - s.player.y) <= 7;
        let target = waypoints[(Math.floor(s.patrol / 9) + i * 2) % waypoints.length];
        // The model's plan shapes the second guardian from Medium up: the
        // pincer cuts you off from the far side, the undertow takes the
        // junction ahead or the path home. It may hold a spot only briefly.
        const plan = s.plan.source === "ai" ? s.plan.planId : "patrol";
        // A guardian that has held one spot for 4 steps patrols for the next 6.
        const camping = i === 1 && ((s.camp ?? 0) >= 4 || (s.camp ?? 0) < 0);
        if (t >= 1 && detected && !camping) {
          target = s.player;
          if (i === 1 && plan === "pincer") {
            const lead = s.guardians[0], dx = Math.sign(s.player.x - lead.x), dy = Math.sign(s.player.y - lead.y);
            const flank = { x: s.player.x + dx * 2, y: s.player.y + dy * 2 };
            target = walkable(flank) ? flank : s.player;
          } else if (i === 1 && (plan === "undertow" || t === 2)) {
            const home = s.carrying && plan === "undertow" ? mazePath(s.player, LOTUS_SHIP)[2] : undefined;
            const prediction = { x: s.player.x + s.player.x - s.previous.x, y: s.player.y + s.player.y - s.previous.y };
            target = home ?? (walkable(prediction) ? prediction : s.player);
          }
          s.rivalLine = plan === "pincer" ? "Pincer · one guardian follows, the other circles to cut you off." : plan === "undertow" || t === 2 ? (s.carrying && plan === "undertow" ? "Undertow · a guardian moves to block your way back to the ship." : "Intercept · a guardian is heading for your next junction.") : "Pursuit · detected! The guardian follows the shortest open path.";
        } else s.rivalLine = "Patrol · guardians follow the garden paths. Walls block their movement.";
        const path = mazePath(guard, target);
        s.debug = { algorithm: t === 0 ? "Patrol FSM" : t === 1 ? "A* pursuit" : "A* interception", state: detected && t > 0 ? t === 2 && i === 1 ? "Intercept" : "Pursuit" : "Patrol", target: `${target.x}, ${target.y}`, prediction: `${s.player.x + s.player.x - s.previous.x}, ${s.player.y + s.player.y - s.previous.y}`, confidence: detected ? .8 : .2, pathLength: path.length, decision: s.rivalLine };
        if (i === 1) { const held = s.camp ?? 0; s.camp = held >= 4 ? -6 : held < 0 ? held + 1 : path.length === 0 && t >= 1 && detected ? held + 1 : 0; }
        return path[0] || guard;
      });
      checkLotus(s);
    }
  } else if (s.id === "cyclops") {
    s.jump = Math.max(0, s.jump - dt); s.slide = Math.max(0, s.slide - dt); s.spawn -= dt; s.gap = Math.min(100, s.gap + dt * .001);
    if (s.spawn <= 0) {
      const adaptive = t > 0 || s.plan.source === "ai";
      const likely = s.history.filter(n => n === s.lane).length >= 3 ? s.lane : s.history.at(-2) ?? s.lane;
      const predicting = t === 2 && (s.plan.source === "standard" || s.plan.planId === "sweep");
      const lane = adaptive ? predicting ? likely : s.lane : s.wave % 3;
      const kind = (["rock", "crate", "beam", "gap", "sheep"] as const)[s.wave % 5];
      s.obstacles.push({ lane, kind, remaining: 3100, warning: 3100 }); s.wave++; s.spawn = [2400, 2100, 1800][t];
      if (s.wave % 2 === 0) s.obstacles.push({ lane: (lane + 1) % 3, kind: "coin", remaining: 3100, warning: 3100 });
      s.rivalLine = kind === "sheep" ? "A sheep leads the way. Catch it to recover one life." : `${adaptive ? t === 2 ? "Prediction" : "Lane pursuit" : "Pattern patrol"} · ${kind} in lane ${lane + 1}. The attack is now locked.`;
      s.debug = { algorithm: t === 2 ? "Lane history prediction" : adaptive ? "Current-lane targeting" : "Patrol sequence", state: "Attack locked", target: `Lane ${lane + 1}`, prediction: `Lane ${likely + 1}`, confidence: s.history.filter(n => n === likely).length / s.history.length, pathLength: 0, decision: `${kind}; two lanes remain clear; 3100 ms warning` };
    }
    for (const obstacle of s.obstacles) {
      obstacle.remaining -= dt;
      if (obstacle.remaining > 0) continue;
      if (obstacle.kind === "coin") { if (s.lane === obstacle.lane) { s.coins++; reward(s, 50); s.feedback = "Laurel coin collected. +50 points. Watch the next warning."; } }
      else if (obstacle.kind === "sheep") { if (s.lane === obstacle.lane) { s.hits = Math.max(0, s.hits - 1); s.gap = Math.min(100, s.gap + 12); reward(s, 75); s.feedback = "The sheep finds a safe path. One life restored."; } }
      else {
        const safe = s.lane !== obstacle.lane || (obstacle.kind === "crate" || obstacle.kind === "gap") && s.jump > 0 || obstacle.kind === "beam" && s.slide > 0;
        if (safe) { const precise = s.lane === obstacle.lane; reward(s, precise ? 200 : 100); if (precise) { s.precision++; s.feedback = "Precision escape! +200 points for a timed jump or slide."; } }
        else if (damage(s, "An obstacle catches you. Watch the warning and give yourself room to react.")) s.gap -= 30;
      }
    }
    s.obstacles = s.obstacles.filter(o => o.remaining > 0);
    if (s.gap <= 0) end(s, false, "Polyphemus catches up. Dodge early to keep your lead.");
  } else if (s.id === "aeolus") {
    s.gustClock -= dt;
    if (s.gustClock <= 0) {
      const interval = s.liftHistory.length > 1 ? (s.liftHistory.at(-1)! - s.liftHistory[0]) / (s.liftHistory.length - 1) : 1000;
      const undertow = s.plan.source === "ai" && s.plan.planId === "undertow", reach = undertow ? 38 : 32;
      s.gust = t === 0 ? 0 : Math.sin(s.elapsed / 1900) * 22 + (t === 2 || undertow ? clamp((-s.vy * .16 + (700 - interval) * .025) * (undertow ? 1.25 : 1), -reach, reach) : 0);
      s.gustClock = 500;
      s.debug = { algorithm: t === 0 ? "Fixed wind" : t === 1 ? "Variable wind field" : "Adaptive counter-gust", state: s.vy < 0 ? "Ascent" : "Descent", target: `Opening ${Math.round(s.lastCenter)} px`, prediction: `Lift interval ${Math.round(interval)} ms`, confidence: Math.min(.9, s.liftHistory.length / 8), pathLength: 0, decision: `Wind force ${s.gust.toFixed(1)}; adjustment bounded to 54` };
    }
    s.vy = clamp(s.vy + (440 + s.gust) * dt / 1000, -240, 270); s.y += s.vy * dt / 1000; s.spawn -= dt;
    if (s.y < 24 || s.y > 376) { if (damage(s, "The hull meets the storm. Short taps help you hold a steady course.")) { s.y = clamp(s.y, 45, 355); s.vy = 0; } else s.y = clamp(s.y, 24, 376); }
    if (s.spawn <= 0) {
      const desired = 200 + Math.sin(s.wave * .85) * (s.plan.source === "ai" && s.plan.planId === "pincer" ? 90 : 65);
      const center = clamp(desired, s.lastCenter - 54, s.lastCenter + 54); s.lastCenter = center;
      s.gates.push({ x: 850, center, gap: [200, 175, 155][t], passed: false, pickup: s.wave % 4 === 3 ? "repair" : "wind", collected: false }); s.wave++; s.spawn = 2900;
      s.rivalLine = `Wind gate ${s.wave} · the clear passage is ${center < 170 ? "high" : center > 230 ? "low" : "central"}. Read ahead.`;
    }
    for (const gate of s.gates) {
      gate.x -= [135, 150, 165][t] * dt / 1000;
      if (Math.abs(gate.x - 155) < 38 && Math.abs(s.y - gate.center) > gate.gap / 2 - 15) { gate.hit = true; damage(s, "Rock and storm strike the hull. Aim for the center of the next opening."); }
      if (!gate.collected && Math.abs(gate.x - 155) < 30 && Math.abs(s.y - gate.center) < 35) { gate.collected = true; s.blessings++; reward(s, 125); if (gate.pickup === "repair") s.hits = Math.max(0, s.hits - 1); s.feedback = gate.pickup === "repair" ? "Shipwright’s blessing. One hull point restored." : "A wind blessing! Keep the sail steady."; }
      if (!gate.passed && gate.x < 110) { gate.passed = true; const perfect = !gate.hit && gate.collected; reward(s, perfect ? 125 : 50); if (perfect) { s.perfectPasses++; s.feedback = "Perfect passage! Blessing collected, hull untouched. +125 points."; } }
    }
    s.gates = s.gates.filter(g => g.x > -60);
  } else {
    s.moveClock = Math.max(0, s.moveClock - dt);
    s.rows.forEach(r => { r.offset += r.speed * dt / 1000; });
    if (s.row > 0 && s.row < 8) {
      s.x += s.rows[s.row - 1].speed * dt / 1000;
      if (s.x < .15 || s.x > 6.85 || !onTimber(s)) raftFall(s);
    }
    s.stormClock -= dt;
    if (s.stormClock <= 0 && !s.lightning) {
      const warning = [2400, 2000, 1700][t], row = s.row, predicted = row > 0 && row < 8 ? s.x + s.rows[row - 1].speed * warning / 1000 : s.x;
      const watch = s.plan.source === "ai" && s.plan.planId === "pincer", predicts = t === 2 || (s.plan.source === "ai" && s.plan.planId === "undertow" && t >= 1);
      const x = watch ? s.x : predicts ? predicted : s.x;
      const alternatives = [-1, 1].map(dx => s.x + dx).filter(next => next > .3 && next < 6.7 && onTimber(s, next, row, warning) && Math.abs(next - x) > .75);
      // Never target either resting shore or a landing without a verified escape.
      if (row > 0 && row < 8 && alternatives.length > 0) s.lightning = { x, row, warning, age: 0 };
      s.debug = { algorithm: t === 0 ? "Telegraphed storm" : t === 1 ? "Current-aware storm FSM" : "Landing prediction + reachability", state: s.lightning ? "Strike locked" : "Withholding strike", target: `Row ${row}; x ${x.toFixed(2)}`, prediction: `Landing ${predicted.toFixed(2)}`, confidence: t === 2 ? .85 : .4, pathLength: alternatives.length, decision: s.lightning ? "Safe alternate verified before warning" : "No safe alternate; no strike" };
      s.stormClock = [10000, 8000, 6500][t] * (s.plan.source === "ai" && s.plan.planId === "pincer" ? 0.8 : 1);
    }
    if (s.lightning) {
      s.lightning.warning -= dt;
      if (s.lightning.warning <= 0) {
        s.lightning.age += dt;
        if (s.row === s.lightning.row && Math.abs(s.x - s.lightning.x) < .6 && damage(s, "Lightning struck the marked timber. Hop away during the warning.")) { s.row = 0; s.x = 3.5; }
        if (s.lightning.age >= 300) s.lightning = null;
      }
    }
  }
  if (!s.done && s.elapsed >= s.duration) {
    const survival = s.id === "cyclops" || s.id === "aeolus";
    end(s, survival, survival ? "Open sea! The last danger falls behind you." : "The storm closes in. Try a shorter route and keep moving.");
  }
  return s;
}
export function adventureSummary(s: AdventureState): AttemptSummary {
  return { won: s.done && s.won, source: s.plan.source, hits: s.damageTaken, successes: Math.min(100, s.successes), misses: s.misses, early: 0, late: 0, laneMs: [0, 0, 0], score: s.score, timeMs: Math.round(s.elapsed), difficulty: s.difficulty };
}
export function adventureStatus(s: AdventureState) {
  if (s.id === "lotus") return `${s.rescued}/${s.practice ? 1 : 3} crew aboard${s.carrying ? " · Sailor following" : ""}${s.protection ? ` · Protection ${Math.ceil(s.protection / 1000)}s` : ""}`;
  if (s.id === "cyclops") return `${Math.min(100, Math.floor(s.elapsed / s.duration * 100))}% to daylight · Chase gap ${Math.round(s.gap)}m`;
  if (s.id === "aeolus") return `${s.blessings} wind blessings · ${Math.floor(s.elapsed / s.duration * 100)}% to open sea`;
  return `Crossing ${s.crossing}/${s.practice ? 1 : 5} · ${s.progress}/${s.practice ? 1 : 5} shores reached · ${s.wood} driftwood`;
}
