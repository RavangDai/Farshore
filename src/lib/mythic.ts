import { validPlan, type AttemptSummary, type Difficulty, type OpponentPlan, type TrialId } from "./arcade.ts";

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const tierOf = (d: Difficulty) => ["easy", "normal", "hard"].indexOf(d);
type Base = { id: TrialId; difficulty: Difficulty; plan: OpponentPlan; practice: boolean; seed: number; elapsed: number; done: boolean; won: boolean; feedback: string; rivalLine: string; score: number; rivalScore: number; hits: number; successes: number; misses: number; combo: number; bestCombo: number };
export type Point = { x: number; y: number };
export type GridState = Base & { id: "cyclops"; player: Point; sheep: Point[]; walls: Point[]; noise: Point[]; heat: number[]; target: Point; turn: number; phase: "player" | "warning"; timer: number; evaded: boolean; stance: "sneak" | "dash"; hidden: boolean };
export type Tile = 0 | 1 | 2 | 3 | 4 | 5;
export const TILE_NAMES = ["Empty", "Wine", "Moly", "Swine", "Rune", "Curse"];
export type PotionState = Base & { id: "circe"; board: Tile[]; rivalBoard: Tile[]; piece: Tile[]; rivalPiece: Tile[]; next: Tile[]; rivalNext: Tile[]; column: number; rivalColumn: number; rivalRotation: number; timer: number; rivalTimer: number; bank: number; turn: number; chains: number };
export type SongNote = { lane: number; rest: boolean };
export type SongState = Base & { id: "sirens"; notes: SongNote[]; phase: "listen" | "reply" | "rest"; timer: number; beat: number; entered: number[]; temptation: number; round: number; laneMisses: [number, number, number, number]; lastLane: number; flash: number };
export type Strike = { x: number; y: number; vx: number; vy: number; reflected: boolean; head: number };
export type StraitState = Base & { id: "scylla"; paddle: number; boat: number; rowing: boolean; strikes: Strike[]; spawn: number; head: number; pull: number; duration: number; telegraph: number; targetY: number };
export type Aim = { aim: number; elevation: number; tension: number };
export type Shot = { aim: Aim; wind: number; rings: number; path: Point[]; block: number; owner: "player" | "rival" };
export type BowState = Base & { id: "bow"; aim: Aim; wind: number; turn: number; phase: "player" | "rival" | "review"; timer: number; shot: Shot | null; blocked: number; rivalAim: Aim; shots: number[]; rivalShots: number[] };
export type MythicState = GridState | PotionState | SongState | StraitState | BowState;
export type Action = { type: "move"; dx: number; dy: number } | { type: "stance"; stance: "sneak" | "dash" } | { type: "hide" } | { type: "column"; direction: number } | { type: "rotate" } | { type: "drop" } | { type: "note"; lane: number } | { type: "paddle"; y: number } | { type: "row"; held: boolean } | { type: "aim"; field: keyof Aim; value: number } | { type: "shoot" };
function roll(s: Base) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const covers = (t: Point, p: Point) => p.x >= t.x && p.x <= t.x + 1 && p.y >= t.y && p.y <= t.y + 1;
const isExit = (p: Point) => p.x === 7 && (p.y === 0 || p.y === 7);
function end<T extends MythicState>(s: T, won: boolean, feedback: string): T { s.done = true; s.won = won; s.feedback = feedback; return s; }
function streak(s: Base, good: boolean) { s.combo = good ? s.combo + 1 : 0; s.bestCombo = Math.max(s.bestCombo, s.combo); }
function clone<T extends MythicState>(s: T): T { return structuredClone(s); }

export function newMythic(id: TrialId, difficulty: Difficulty, plan: OpponentPlan, practice = false, seed = 4200): MythicState {
  if (!validPlan(id, plan) || !["easy", "normal", "hard"].includes(difficulty)) throw new Error("Unsupported trial rules");
  const b: Base = { id, difficulty, plan: { ...plan }, practice, seed, elapsed: 0, done: false, won: false, feedback: "", rivalLine: "", score: 0, rivalScore: 0, hits: 0, successes: 0, misses: 0, combo: 0, bestCombo: 0 };
  if (id === "cyclops") return { ...b, id, player: { x: 0, y: 7 }, sheep: [{ x: 1, y: 7 }, { x: 3, y: 5 }, { x: 5, y: 3 }, { x: 6, y: 7 }, { x: 4, y: 0 }], walls: [{ x: 2, y: 6 }, { x: 2, y: 5 }, { x: 4, y: 4 }, { x: 4, y: 3 }, { x: 1, y: 2 }, { x: 5, y: 1 }], noise: [], heat: Array(64).fill(0), target: { x: 3, y: 3 }, turn: 0, phase: "player", timer: 0, evaded: false, stance: "sneak", hidden: false, feedback: "Sneak toward either gold exit. Sheep conceal your footsteps.", rivalLine: "Nobody... where are you?" };
  if (id === "circe") {
    const s: PotionState = { ...b, id, board: Array(60).fill(0), rivalBoard: Array(60).fill(0), piece: [], rivalPiece: [], next: [], rivalNext: [], column: 2, rivalColumn: 2, rivalRotation: 0, timer: 0, rivalTimer: 0, bank: 0, turn: 0, chains: 0, feedback: "Match three potions. Moly clears swine and curses the other board.", rivalLine: "Your crew will make such lovely swine." };
    for (let y = 8; y < 10; y++) for (let x = 0; x < 6; x++) { s.board[y * 6 + x] = ((x + y) % 4 + 1) as Tile; s.rivalBoard[y * 6 + x] = ((x * 3 + y) % 4 + 1) as Tile; }
    s.piece = [2, 2, 2]; s.next = nextPiece(s); s.rivalPiece = nextPiece(s); s.rivalNext = nextPiece(s); planPotion(s); return s;
  }
  if (id === "sirens") { const s: SongState = { ...b, id, notes: [], phase: "listen", timer: 0, beat: 0, entered: [], temptation: 0, round: 1, laneMisses: [0, 0, 0, 0], lastLane: -1, flash: 0, feedback: "Listen first. Echo the numbered notes when YOUR REPLY appears.", rivalLine: "Come closer. Remember our song." }; compose(s); return s; }
  if (id === "scylla") return { ...b, id, paddle: 200, boat: 55, rowing: false, strikes: [], spawn: 1500, head: 0, pull: 0, duration: practice ? 12000 : [30000, 40000, 50000][tierOf(difficulty)], telegraph: 0, targetY: 200, feedback: "Move the shield up and down. Hold Row to resist the vortex.", rivalLine: "Six heads. One ship." };
  const s: BowState = { ...b, id: "bow", aim: { aim: 0, elevation: 0, tension: 75 }, wind: 0, turn: 1, phase: "player", timer: 0, shot: null, blocked: 0, rivalAim: { aim: 0, elevation: 0, tension: 75 }, shots: [], rivalShots: [], feedback: "Read the wind, adjust your trajectory, then release.", rivalLine: "My hall. My contest." }; setWind(s); return s;
}

function chooseSmash(s: GridState) {
  const last = s.noise.at(-1);
  let clue = last || { x: Math.floor(roll(s) * 8), y: Math.floor(roll(s) * 8) };
  if (s.plan.source === "ai" && last) {
    if (s.plan.planId === "sweep" && s.noise.length > 1) {
      const prev = s.noise.at(-2)!;
      clue = { x: clamp(last.x + Math.sign(last.x - prev.x) * 2, 0, 7), y: clamp(last.y + Math.sign(last.y - prev.y), 0, 7) };
      s.rivalLine = "You are heading for the door. I will be waiting.";
    } else {
      const weighted = s.heat.map((h, i) => h + (i % 8 >= last.x && i % 8 <= last.x + 1 ? .2 : 0));
      const i = weighted.indexOf(Math.max(...weighted)); clue = { x: i % 8, y: Math.floor(i / 8) };
      s.rivalLine = "Those footsteps leave a trail, Nobody.";
    }
  } else s.rivalLine = last ? "I heard you near there!" : "Silence? Then I will search the cave.";
  s.target = { x: clamp(clue.x - Math.floor(roll(s) * 2), 0, 6), y: clamp(clue.y - Math.floor(roll(s) * 2), 0, 6) };
  s.phase = "warning"; s.timer = 0; s.evaded = false;
  s.feedback = covers(s.target, s.player) ? "SMASH INCOMING! Take one quiet step out of the marked square." : "The marked square is locked. Stay safe or take one quiet step.";
}
function gridMove(s: GridState, dx: number, dy: number) {
  if (Math.abs(dx) + Math.abs(dy) !== 1 || s.phase === "warning" && s.evaded) return;
  const steps = s.phase === "player" && s.stance === "dash" ? 2 : 1;
  const from = { ...s.player }; let moved = 0;
  for (let i = 0; i < steps; i++) {
    const p = { x: s.player.x + dx, y: s.player.y + dy };
    if (p.x < 0 || p.x > 7 || p.y < 0 || p.y > 7 || s.walls.some(w => same(w, p))) break;
    s.player = p; moved++;
    if (isExit(p)) { s.score += 100 + Math.max(0, 30 - s.turn) * 10; s.successes++; end(s, true, "Nobody slips out beneath the sheep. The cave is behind you."); return; }
  }
  if (!moved) { s.feedback = "Rock blocks that path. Choose another tile."; return; }
  s.hidden = s.sheep.some(p => same(p, s.player)) && steps === 1;
  if (s.phase === "warning") { s.evaded = true; s.feedback = "Your quiet step is taken. The smash stays where it was marked."; return; }
  s.turn++; s.successes++; s.score += s.hidden ? 20 : 10;
  s.heat = s.heat.map(h => h * .65);
  if (!s.hidden) { const noise = steps === 2 ? s.player : from; s.noise = [...s.noise, { ...noise }].slice(-4); s.heat[noise.y * 8 + noise.x] += steps === 2 ? 4 : 2; }
  else { s.noise = []; }
  chooseSmash(s);
}

function nextPiece(s: Base): Tile[] { return Array.from({ length: 3 }, () => (Math.floor(roll(s) * 4) + 1) as Tile); }
export function rotatePiece(piece: Tile[], n = 1) { return [...piece.slice(n % 3), ...piece.slice(0, n % 3)]; }
export function columnHeight(board: Tile[], x: number) { const y = Array.from({ length: 10 }, (_, y) => y).find(y => board[y * 6 + x] !== 0); return y === undefined ? 0 : 10 - y; }
export function resolveBoard(input: Tile[]) {
  const board = [...input]; let cleared = 0, moly = 0, chains = 0;
  for (let pass = 0; pass < 20; pass++) {
    const remove = new Set<number>();
    for (let y = 0; y < 10; y++) for (let x = 0; x < 6; x++) {
      const i = y * 6 + x, tile = board[i]; if (!tile || tile === 5) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const run = [i]; for (let k = 1; x + dx * k < 6 && y + dy * k < 10; k++) { const j = (y + dy * k) * 6 + x + dx * k; if (board[j] !== tile) break; run.push(j); }
        if (run.length >= 3) run.forEach(j => remove.add(j));
      }
    }
    if (!remove.size) break;
    chains++; let herbs = 0;
    for (const i of remove) { if (board[i] === 2) herbs++; board[i] = 0; }
    moly += herbs; cleared += remove.size;
    // Moly purifies pigs anywhere on the board and curses bordering a match.
    if (herbs >= 3) for (let i = 59, left = herbs; i >= 0 && left; i--) if (board[i] === 3 || board[i] === 5) { board[i] = 0; cleared++; left--; }
    for (let x = 0; x < 6; x++) { const col = Array.from({ length: 10 }, (_, y) => board[y * 6 + x]).filter(Boolean) as Tile[]; for (let y = 0; y < 10; y++) board[y * 6 + x] = y < 10 - col.length ? 0 : col[y - (10 - col.length)]; }
  }
  return { board, cleared, moly, chains, attack: Math.floor(moly / 3) + Math.max(0, chains - 1) * 2 };
}
export function dropPiece(board: Tile[], piece: Tile[], column: number) {
  const h = columnHeight(board, column);
  if (h + 3 > 10) return null;
  const next = [...board]; piece.forEach((tile, i) => { next[(10 - h - 3 + i) * 6 + column] = tile; });
  return resolveBoard(next);
}
function curse(s: PotionState, rival: boolean, count: number) {
  const board = rival ? s.rivalBoard : s.board;
  for (let k = 0; k < count && !s.done; k++) {
    const options = [0, 1, 2, 3, 4, 5].sort((a, b) => columnHeight(board, a) - columnHeight(board, b));
    const x = options[Math.floor(roll(s) * 2)], h = columnHeight(board, x);
    if (h >= 10) { end(s, rival, rival ? "Circe's board overflowed. Your crew is free!" : "The curse filled your board. Try a moly match to purify it."); break; }
    board[(9 - h) * 6 + x] = 5;
  }
}
export function potionChoice(board: Tile[], piece: Tile[], next: Tile[], adaptive: boolean) {
  let best = -Infinity, choice = { column: 0, rotation: 0 };
  for (let x = 0; x < 6; x++) for (let rotation = 0; rotation < 3; rotation++) {
    const result = dropPiece(board, rotatePiece(piece, rotation), x); if (!result) continue;
    const heights = [0, 1, 2, 3, 4, 5].map(c => columnHeight(result.board, c));
    let value = result.cleared * 8 + result.attack * 12 - Math.max(...heights) * 3 - heights.reduce((a, b) => a + b * b, 0) * .3;
    if (adaptive) { let future = 0; for (let c = 0; c < 6; c++) for (let r = 0; r < 3; r++) { const second = dropPiece(result.board, rotatePiece(next, r), c); if (second) future = Math.max(future, second.cleared * 4 + second.attack * 7); } value += future; }
    if (value > best) { best = value; choice = { column: x, rotation }; }
  }
  return choice;
}
function planPotion(s: PotionState) { const c = potionChoice(s.rivalBoard, s.rivalPiece, s.rivalNext, s.plan.source === "ai"); s.rivalColumn = c.column; s.rivalRotation = c.rotation; }
function potionDrop(s: PotionState, rival: boolean) {
  const result = dropPiece(rival ? s.rivalBoard : s.board, rival ? rotatePiece(s.rivalPiece, s.rivalRotation) : s.piece, rival ? s.rivalColumn : s.column);
  if (!result) { end(s, rival, rival ? "Circe's board reaches the ceiling. The enchantment breaks!" : "Your board reaches the ceiling. Keep columns open and brew moly."); return; }
  if (rival) {
    s.rivalBoard = result.board; s.rivalScore += result.cleared * 10 * Math.max(1, result.chains); s.bank += result.attack;
    const crowded = Math.max(...[0, 1, 2, 3, 4, 5].map(x => columnHeight(s.board, x))) >= 7;
    const release = s.plan.planId !== "hoard" || s.bank >= 4 || crowded;
    s.rivalLine = release && s.bank ? `Circe sends ${s.bank} curse blocks!` : result.chains > 1 ? `Circe brews a ${result.chains}-chain combo.` : s.bank ? `Circe banks ${s.bank} curses for later.` : `Circe drops into column ${s.rivalColumn + 1}.`;
    if (release) { curse(s, false, s.bank); s.bank = 0; }
    s.rivalPiece = s.rivalNext; s.rivalNext = nextPiece(s); planPotion(s); s.rivalTimer = 0;
  } else {
    s.board = result.board; s.score += result.cleared * 10 * Math.max(1, result.chains); s.successes += result.cleared; s.chains = Math.max(s.chains, result.chains); streak(s, result.cleared > 0); s.turn++;
    s.feedback = result.moly >= 3 ? `Moly purified the swine! ${result.attack} curses sent to Circe.` : result.chains ? `${result.chains}-chain brew! ${result.cleared} potions cleared.` : "Potions placed. Build a match of three.";
    curse(s, true, result.attack); s.piece = s.next; s.next = nextPiece(s); s.timer = 0;
  }
  if (!s.done && (rival ? s.rivalBoard : s.board).slice(0, 6).some(Boolean)) end(s, rival, rival ? "Circe's board is full. The enchantment breaks!" : "Your board is full. Match moly before curses pile up.");
  if (s.practice && s.turn >= 4 && !s.done) end(s, true, "Potion practice complete. You can now challenge Circe.");
}

export function songBeat(s: SongState) { return [820, 650, 520][tierOf(s.difficulty)] * (s.plan.source === "ai" && s.plan.planId === "echo" ? [1, .85, 1.15][(s.round - 1) % 3] : 1); }
function compose(s: SongState) {
  const count = Math.min(6, s.round + 2), weakest = s.laneMisses.indexOf(Math.max(...s.laneMisses));
  s.notes = Array.from({ length: count }, (_, i) => ({ lane: s.plan.source === "ai" ? i % 2 === 1 ? weakest : Math.floor(roll(s) * 4) : (i + s.round - 1) % 4, rest: s.plan.planId === "echo" && i === count - 2 && s.round > 1 }));
  s.rivalLine = s.plan.source === "ai" && Math.max(...s.laneMisses) > 0 ? `The ${["red", "blue", "green", "gold"][weakest]} note slips away from you. Hear it again.` : "Listen to our melody. Then sing it back.";
  s.phase = "listen"; s.timer = 0; s.entered = []; s.lastLane = -1;
}
function resolveSong(s: SongState) {
  const melody = s.notes.filter(n => !n.rest), errors = melody.reduce((n, note, i) => n + Number(s.entered[i] !== note.lane), 0);
  if (!errors) { s.successes++; s.score += 100 + melody.length * 20; s.temptation = Math.max(0, s.temptation - 15); streak(s, true); s.feedback = "A true echo! The ship moves beyond the rocks."; }
  else { s.misses += errors; s.temptation += errors * [14, 20, 25][tierOf(s.difficulty)]; streak(s, false); s.feedback = `${errors} note${errors > 1 ? "s" : ""} missed. The song pulls at the ship.`; melody.forEach((n, i) => { if (s.entered[i] !== n.lane) s.laneMisses[n.lane]++; }); }
  if (s.temptation >= 100) { end(s, false, "Temptation filled the gauge. The ship veers toward the rocks."); return; }
  if (s.successes >= (s.practice ? 1 : 5)) { end(s, true, "The last melody fades behind your ship."); return; }
  s.phase = "rest"; s.timer = 0;
}

export function archeryShot(aim: Aim, wind: number, blocked = 0, owner: "player" | "rival" = "player", difficulty: Difficulty = "normal"): Shot {
  const path: Point[] = []; let rings = 0;
  for (let i = 1; i <= 12; i++) {
    const z = i / 12;
    const x = aim.aim * .043 * z + wind * .009 * z * z * (75 / aim.tension);
    const y = aim.elevation * .04 * z + (aim.tension - 75) * .018 * z * z;
    path.push({ x, y });
    const radius = [0.25, .19, .145][tierOf(difficulty)] * (blocked === i ? .58 : 1);
    if (rings === i - 1 && Math.hypot(x, y) <= radius) rings++;
  }
  return { aim: { ...aim }, wind, rings, path, block: blocked, owner };
}
export function bestAim(wind: number, blocked = 0, difficulty: Difficulty = "normal"): Aim {
  let best = -Infinity, choice: Aim = { aim: 0, elevation: 0, tension: 75 };
  for (let tension = 60; tension <= 90; tension += 5) for (let aim = -15; aim <= 15; aim++) for (let elevation = -7; elevation <= 7; elevation++) {
    const shot = archeryShot({ aim, elevation, tension }, wind, blocked, "rival", difficulty);
    const value = shot.rings * 100 - shot.path.reduce((n, p) => n + Math.hypot(p.x, p.y), 0);
    if (value > best) { best = value; choice = { aim, elevation, tension }; }
  }
  return choice;
}
function setWind(s: BowState) { s.wind = Math.round((roll(s) - .5) * [40, 80, 110][tierOf(s.difficulty)]); }
function rivalShot(s: BowState) {
  let aim: Aim;
  if (s.plan.source === "ai") {
    aim = bestAim(s.wind, 0, s.difficulty);
    // Small execution error preserves a beatable contest; policy is about aim.
    aim.aim += Math.round((roll(s) - .5) * 3); aim.elevation += Math.round((roll(s) - .5) * 2);
    // Antinous' pride makes one showy shot a real risk, rather than an
    // unbeatable perfect score. It uses the same trajectory scoring.
    if (s.turn === 3) aim.aim = clamp(aim.aim + 8, -20, 20);
  } else aim = { aim: Math.round((roll(s) - .5) * 14), elevation: Math.round((roll(s) - .5) * 9), tension: Math.round(65 + roll(s) * 20) };
  s.rivalAim = aim; s.shot = archeryShot(aim, s.wind, 0, "rival", s.difficulty);
  const blockShot = s.plan.planId === "feint" && s.plan.source === "ai" && s.score >= s.rivalScore;
  if (blockShot) s.shot.rings = Math.min(6, s.shot.rings);
  s.rivalScore += s.shot.rings; s.rivalShots.push(s.shot.rings); s.blocked = blockShot ? 4 + Math.floor(roll(s) * 5) : 0;
  s.rivalLine = blockShot ? `Antinous scores ${s.shot.rings} and lodges an arrow at ring ${s.blocked}. Your next opening is smaller.` : s.turn === 3 && s.plan.source === "ai" ? `Antinous risks a boastful angle shot and scores ${s.shot.rings} rings.` : `Antinous aims ${aim.aim}° against the wind and scores ${s.shot.rings} rings.`;
  s.phase = "review"; s.timer = 0;
}

export function mythicAction(state: MythicState, action: Action): MythicState {
  if (state.done) return state;
  const s = clone(state);
  if (s.id === "cyclops") {
    if (action.type === "move") gridMove(s, action.dx, action.dy);
    if (action.type === "stance" && s.phase === "player") s.stance = action.stance;
    if (action.type === "hide" && s.phase === "player") {
      if (!s.sheep.some(p => same(p, s.player))) { s.feedback = "Move onto a sheep tile before hiding."; return s; }
      s.turn++; s.hidden = true; s.noise = []; s.heat = s.heat.map(h => h * .3); chooseSmash(s);
    }
  } else if (s.id === "circe") {
    if (action.type === "column") s.column = clamp(s.column + action.direction, 0, 5);
    if (action.type === "rotate") s.piece = rotatePiece(s.piece);
    if (action.type === "drop") potionDrop(s, false);
  } else if (s.id === "sirens") {
    if (action.type === "note" && s.phase === "reply" && action.lane >= 0 && action.lane < 4 && Number.isInteger(action.lane)) {
      s.entered.push(action.lane); s.lastLane = action.lane; s.flash = 240;
      if (s.entered.length >= s.notes.filter(n => !n.rest).length) resolveSong(s);
    }
  } else if (s.id === "scylla") {
    if (action.type === "paddle" && Number.isFinite(action.y)) s.paddle = clamp(action.y, 38, 362);
    if (action.type === "row") s.rowing = action.held;
  } else if (s.id === "bow" && s.phase === "player") {
    if (action.type === "aim" && Number.isFinite(action.value)) s.aim[action.field] = clamp(action.value, action.field === "tension" ? 45 : -20, action.field === "tension" ? 100 : 20);
    if (action.type === "shoot") {
      s.shot = archeryShot(s.aim, s.wind, s.blocked, "player", s.difficulty); s.shots.push(s.shot.rings); s.score += s.shot.rings; s.successes += Number(s.shot.rings >= 8); streak(s, s.shot.rings >= 8);
      s.feedback = `Your arrow passes through ${s.shot.rings} of 12 rings. Antinous takes his turn next.`; s.blocked = 0; s.phase = "rival"; s.timer = 0;
    }
  }
  return s;
}

export function tickMythic(state: MythicState, delta: number): MythicState {
  if (state.done || !Number.isFinite(delta) || delta <= 0) return state;
  const s = clone(state), dt = Math.min(100, delta), tier = tierOf(s.difficulty); s.elapsed += dt;
  if (s.id === "cyclops" && s.phase === "warning") {
    s.timer += dt;
    if (s.timer >= [1500, 1150, 900][tier]) {
      if (covers(s.target, s.player)) { s.hits++; streak(s, false); s.feedback = "The smash found you! Two quiet paths lead toward the exits."; } else { s.score += 15; streak(s, true); s.feedback = "His hand strikes empty stone. Your turn."; }
      s.phase = "player"; s.timer = 0;
      if (s.hits >= 3) end(s, false, "Polyphemus catches Nobody. Use sheep and evade the warned smash.");
      else if (s.turn >= (s.practice ? 4 : [32, 26, 22][tier])) end(s, s.practice, s.practice ? "Stealth practice complete." : "The cave door closes. Dash when you have an open path.");
    }
  } else if (s.id === "circe") {
    s.timer += dt; s.rivalTimer += dt;
    if (s.timer >= [8000, 6200, 4600][tier]) potionDrop(s, false);
    if (!s.done && s.rivalTimer >= [6500, 5400, 4400][tier]) potionDrop(s, true);
    // Long duels finish on a visible score comparison; no unbounded demonstration.
    if (!s.done && s.elapsed >= (s.practice ? 25000 : 120000)) end(s, s.practice || s.score > s.rivalScore, `Brew time is over. You ${s.score}, Circe ${s.rivalScore}. ${s.score > s.rivalScore ? "Your crew is free." : "Circe holds the spell. A tie belongs to the defending enchantress."}`);
  } else if (s.id === "sirens") {
    s.timer += dt; s.flash = Math.max(0, s.flash - dt);
    const beat = songBeat(s);
    if (s.phase === "listen") {
      if (s.timer >= s.notes.length * beat + 500) { s.phase = "reply"; s.timer = 0; s.feedback = "YOUR REPLY! Echo the notes with A / S / D / F. Skip the rests."; }
    } else if (s.phase === "reply" && s.timer >= (s.notes.length + 2) * beat * 1.6) resolveSong(s);
    else if (s.phase === "rest" && s.timer >= 1700) { s.round++; compose(s); s.feedback = "The next melody begins. Watch the four lanes."; }
  } else if (s.id === "scylla") {
    const time = s.elapsed / 1000;
    const synced = s.plan.source === "ai" && (s.strikes.some(a => !a.reflected && a.x < 480) || s.telegraph > 0);
    s.pull = clamp(5 + 4 * Math.sin(time * 2) + (synced ? s.plan.planId === "undertow" ? 7 : 4 : 0), 2, 16);
    s.boat = clamp(s.boat + (s.rowing ? 11 - s.pull * .3 : -s.pull * .48) * dt / 1000, 0, 85);
    s.spawn -= dt;
    if (s.spawn <= 0 && !s.telegraph) {
      s.head = (s.head + 1) % 6;
      s.targetY = s.plan.source === "ai" ? clamp(s.paddle + (s.head % 2 ? 90 : -90), 45, 355) : 55 + s.head * 57;
      s.telegraph = [950, 800, 650][tier];
      s.rivalLine = synced ? "Charybdis pulls while Scylla aims around your shield!" : `Scylla's head ${s.head + 1} prepares a strike. Follow the gold warning.`;
    }
    if (s.telegraph > 0) {
      s.telegraph -= dt;
      if (s.telegraph <= 0) { const startY = 50 + s.head * 60, speed = [175, 220, 275][tier]; s.strikes.push({ x: 755, y: startY, vx: -speed, vy: (s.targetY - startY) / (465 / speed), reflected: false, head: s.head }); s.telegraph = 0; s.spawn = [1500, 1000, 750][tier]; }
    }
    const keep: Strike[] = [];
    for (const a of s.strikes) {
      const oldX = a.x; a.x += a.vx * dt / 1000; a.y += a.vy * dt / 1000;
      if (a.y < 20 || a.y > 380) { a.y = clamp(a.y, 20, 380); a.vy *= -1; }
      if (!a.reflected && oldX > 300 && a.x <= 300) {
        if (Math.abs(a.y - s.paddle) <= [58, 47, 37][tier]) { a.reflected = true; a.vx = Math.abs(a.vx) * 1.45; a.vy = (a.y - s.paddle) * 3; s.successes++; s.score += 100; streak(s, true); s.feedback = "Reflected! The head recoils. Keep rowing."; }
        else { s.hits++; s.boat = Math.max(0, s.boat - 7); streak(s, false); s.feedback = "A head strikes the hull. Move the shield toward the next warning."; continue; }
      }
      if (a.x < 800) keep.push(a);
    }
    s.strikes = keep;
    if (s.boat <= 0 || s.hits >= 5) end(s, false, s.boat <= 0 ? "The vortex takes the ship. Hold Row as you guard." : "Five strikes breach the hull. Track the warned heads with your shield.");
    else if (s.elapsed >= s.duration) end(s, true, "The ship slips beyond the six heads and the whirlpool.");
  } else if (s.id === "bow" && s.phase !== "player") {
    s.timer += dt;
    if (s.phase === "rival" && s.timer >= 1600) rivalShot(s);
    else if (s.phase === "review" && s.timer >= 1800) {
      if (s.turn >= (s.practice ? 1 : 5)) end(s, s.practice || s.score > s.rivalScore, `Final score: Odysseus ${s.score}, Antinous ${s.rivalScore}. ${s.score > s.rivalScore ? "The bow remembers its king." : "The defending suitor wins ties. Adjust your next trajectory."}`);
      else { s.turn++; setWind(s); s.phase = "player"; s.timer = 0; s.feedback = s.blocked ? `YOUR TURN. Ring ${s.blocked} is partly blocked this shot. Read the new wind.` : "YOUR TURN. The wind has changed. Adjust and release."; }
    }
  }
  return s;
}
export function mythicSummary(s: MythicState): AttemptSummary {
  return { won: s.won, source: s.plan.source, hits: clamp(s.hits, 0, 100), successes: clamp(s.successes, 0, 100), early: 0, late: 0, misses: clamp(s.misses, 0, 100), laneMs: [0, 0, 0], ...(s.id === "sirens" ? { laneMisses: [...s.laneMisses] as [number, number, number, number] } : {}) };
}
export function scoreLabel(s: MythicState) { return s.id === "bow" ? "rings" : s.id === "circe" ? "brew points" : "points"; }
export function statusLabel(s: MythicState) {
  if (s.id === "cyclops") return `Turn ${s.turn}/${s.practice ? 4 : [32, 26, 22][tierOf(s.difficulty)]} · ${3 - s.hits} lives · ${s.phase === "warning" ? "Evade once" : "Your move"}`;
  if (s.id === "circe") return `${Math.ceil(((s.practice ? 25000 : 120000) - s.elapsed) / 1000)}s · Chain record ${s.chains} · Curses banked ${s.bank}`;
  if (s.id === "sirens") return `${s.successes}/${s.practice ? 1 : 5} melodies · Temptation ${s.temptation}%`;
  if (s.id === "scylla") return `${Math.ceil((s.duration - s.elapsed) / 1000)}s to safety · Hull ${5 - s.hits}/5`;
  return `Shot ${s.turn}/${s.practice ? 1 : 5} · ${s.phase === "player" ? "Your turn" : "Antinous' turn"}`;
}
