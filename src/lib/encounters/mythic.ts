import { validPlan, type AttemptSummary, type Difficulty, type OpponentPlan, type TrialId, type LegacyTrialId } from "../arcade/arcade.ts";

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
/** A sight (`aim` sideways, `elevation` up, in sight units) and how far the string is drawn (`tension`, 0-100). */
export type Aim = { aim: number; elevation: number; tension: number };
export type Shot = { aim: Aim; wind: number; rings: number; path: Point[]; block: number; owner: "player" | "rival" };
/**
 * `aim.tension` follows the draw while the player pulls. `pull` is the ms the
 * string has been held back, which `draw` (0-1) and the tremble both derive
 * from. `lastShot` keeps the player's previous arrow for the sight's ghost line.
 */
export type BowState = Base & { id: "bow"; aim: Aim; wind: number; turn: number; phase: "player" | "rival" | "review"; timer: number; shot: Shot | null; blocked: number; rivalAim: Aim; shots: number[]; rivalShots: number[]; drawing: boolean; draw: number; pull: number; lastShot: Shot | null };
export type MythicState = GridState | PotionState | SongState | StraitState | BowState;
export type Action = { type: "move"; dx: number; dy: number } | { type: "stance"; stance: "sneak" | "dash" } | { type: "hide" } | { type: "column"; direction: number } | { type: "rotate" } | { type: "drop" } | { type: "note"; lane: number } | { type: "paddle"; y: number } | { type: "row"; held: boolean } | { type: "aim"; field: "aim" | "elevation"; value: number } | { type: "draw"; held: boolean } | { type: "shoot" } | { type: "letdown" };
function roll(s: Base) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const covers = (t: Point, p: Point) => p.x >= t.x && p.x <= t.x + 1 && p.y >= t.y && p.y <= t.y + 1;
const isExit = (p: Point) => p.x === 7 && (p.y === 0 || p.y === 7);
function end<T extends MythicState>(s: T, won: boolean, feedback: string): T { s.done = true; s.won = won; s.feedback = feedback; return s; }
function streak(s: Base, good: boolean) { s.combo = good ? s.combo + 1 : 0; s.bestCombo = Math.max(s.bestCombo, s.combo); }
function clone<T extends MythicState>(s: T): T { return structuredClone(s); }

export function newMythic(id: LegacyTrialId, difficulty: Difficulty, plan: OpponentPlan, practice = false, seed = 4200): MythicState {
  if (!validPlan(id, plan) || !["easy", "normal", "hard"].includes(difficulty)) throw new Error("Unsupported trial rules");
  const b: Base = { id, difficulty, plan: { ...plan }, practice, seed, elapsed: 0, done: false, won: false, feedback: "", rivalLine: "", score: 0, rivalScore: 0, hits: 0, successes: 0, misses: 0, combo: 0, bestCombo: 0 };
  if (id === "cyclops") return { ...b, id, player: { x: 0, y: 7 }, sheep: [{ x: 1, y: 7 }, { x: 3, y: 5 }, { x: 5, y: 3 }, { x: 6, y: 7 }, { x: 4, y: 0 }], walls: [{ x: 2, y: 6 }, { x: 2, y: 5 }, { x: 4, y: 4 }, { x: 4, y: 3 }, { x: 1, y: 2 }, { x: 5, y: 1 }], noise: [], heat: Array(64).fill(0), target: { x: 3, y: 3 }, turn: 0, phase: "player", timer: 0, evaded: false, stance: "sneak", hidden: false, feedback: "Sneak toward either gold exit. Sheep conceal your footsteps.", rivalLine: "Nobody... where are you?" };
  if (id === "circe") {
    const s: PotionState = { ...b, id, board: Array(60).fill(0), rivalBoard: Array(60).fill(0), piece: [], rivalPiece: [], next: [], rivalNext: [], column: 2, rivalColumn: 2, rivalRotation: 0, timer: 0, rivalTimer: 0, bank: 0, turn: 0, chains: 0, feedback: "Match three potions. Moly clears swine and curses the other board.", rivalLine: "Your crew will make such lovely swine." };
    for (let y = 8; y < 10; y++) for (let x = 0; x < 6; x++) { s.board[y * 6 + x] = ((x + y) % 4 + 1) as Tile; s.rivalBoard[y * 6 + x] = ((x * 3 + y) % 4 + 1) as Tile; }
    s.piece = [2, 2, 2]; s.next = nextPiece(s); s.rivalPiece = nextPiece(s); s.rivalNext = nextPiece(s); planPotion(s); return s;
  }
  if (id === "sirens") { const s: SongState = { ...b, id, notes: [], phase: "listen", timer: 0, beat: 0, entered: [], temptation: 0, round: 1, laneMisses: [0, 0, 0, 0], lastLane: -1, flash: 0, feedback: "Listen first. Echo the numbered notes when YOUR REPLY appears.", rivalLine: "Come closer. Remember our song." }; compose(s); return s; }
  if (id === "scylla") return { ...b, id, paddle: 200, boat: 55, rowing: false, strikes: [], spawn: 1500, head: 0, pull: 0, duration: practice ? 12000 : [60000, 75000, 90000][tierOf(difficulty)], telegraph: 0, targetY: 200, feedback: "Move the shield up and down. Hold Row to resist the vortex.", rivalLine: "Six heads. One ship." };
  const s: BowState = { ...b, id: "bow", aim: { aim: 0, elevation: 0, tension: 0 }, wind: 0, turn: 1, phase: "player", timer: 0, shot: null, blocked: 0, rivalAim: { aim: 0, elevation: 0, tension: 100 }, shots: [], rivalShots: [], drawing: false, draw: 0, pull: 0, lastShot: null, feedback: "Shoot through the twelve axe heads. Hold to draw, let go to loose.", rivalLine: "My hall. My contest." }; setWind(s); return s;
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
function planPotion(s: PotionState) { const c = potionChoice(s.rivalBoard, s.rivalPiece, s.rivalNext, s.difficulty === "hard" || s.plan.source === "ai"); s.rivalColumn = c.column; s.rivalRotation = c.rotation; }
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
  s.notes = Array.from({ length: count }, (_, i) => ({ lane: s.plan.source === "ai" || s.difficulty === "hard" ? i % 2 === 1 ? weakest : Math.floor(roll(s) * 4) : (i + s.round - 1) % 4, rest: s.plan.planId === "echo" && i === count - 2 && s.round > 1 }));
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

/**
 * The contest of the twelve axes, shared by the rules, the hall renderer and
 * the sound cues so all three agree on where an arrow is and when.
 *
 * Distance runs along the line from the bow: `z` is the share of the way to
 * the twelfth axe. Offsets from the line are in path units, the same units as
 * an axe's opening. The sight reads in sight units: one moves the straight
 * line `perSight` path units at the twelfth axe.
 */
export const BOW = {
  axes: 12,
  turns: 5,
  /** Where the axes stand, in metres from the bow. The hall is built to match. */
  firstAxeM: 3.5,
  axeGapM: 1,
  /** Metres per path unit, for anything drawn in the hall. */
  unitM: 0.84,
  perSight: 0.043,
  /** How far a full-draw arrow has dropped by the twelfth axe. */
  drop: 0.15,
  /** Sideways push per point of wind by the twelfth axe, at full draw. */
  push: 0.009,
  /** Each axe head's opening by tier. */
  opening: [0.25, 0.19, 0.145] as readonly number[],
  /** An opening with Antinous' arrow lodged in it keeps this share of its radius. */
  blockedShare: 0.58,
  sightLimit: 20,
  /** Empty to full draw. Letting go below `minDraw` lets the string down instead. */
  drawMs: 900,
  minDraw: 0.3,
  /** A full draw is steady this long, then trembles up to `swayMax` sight units over `trembleMs`. */
  steadyMs: 1600,
  trembleMs: 2400,
  swayMax: 2.4,
  /** An arrow reaches the twelfth axe this long after it is loosed, then flies on to the doorway. */
  reachMs: 1050,
  doorway: 1.2,
  /** Each arrow flies, then its result holds, then Antinous lines up his own. */
  flightMs: 1500,
  resultMs: 1100,
  rivalAimMs: 1300,
};
/** Axe `i` (1-12) as a share of the way to the twelfth. */
export const axeZ = (i: number) => (BOW.firstAxeM + (i - 1) * BOW.axeGapM) / (BOW.firstAxeM + (BOW.axes - 1) * BOW.axeGapM);
/** Where the arrow comes to rest: the first axe it fails to pass, or the far doorway. */
export const strikeZ = (shot: Shot) => shot.rings < BOW.axes ? axeZ(shot.rings + 1) : BOW.doorway;
/** Ms after release that the arrow reaches `z`. */
export const arrowTime = (z: number) => z * BOW.reachMs;
/**
 * Where an arrow is `z` of the way to the twelfth axe. A weaker draw is a
 * slower arrow: it drops further and the wind carries it further, both by the
 * square of the shortfall.
 */
export function trajectoryAt(aim: Aim, wind: number, z: number): Point {
  const power = clamp(aim.tension, 25, 100) / 100, slow = 1 / (power * power);
  return { x: aim.aim * BOW.perSight * z + wind * BOW.push * z * z * slow, y: aim.elevation * BOW.perSight * z - BOW.drop * z * z * slow };
}
/** An opening's radius, narrowed when Antinous' arrow is lodged in it. */
export const openingOf = (difficulty: Difficulty, axe: number, blocked = 0) => BOW.opening[tierOf(difficulty)] * (blocked === axe ? BOW.blockedShare : 1);
export function archeryShot(aim: Aim, wind: number, blocked = 0, owner: "player" | "rival" = "player", difficulty: Difficulty = "normal"): Shot {
  const path: Point[] = []; let rings = 0;
  for (let i = 1; i <= BOW.axes; i++) {
    const p = trajectoryAt(aim, wind, axeZ(i));
    path.push(p);
    if (rings === i - 1 && Math.hypot(p.x, p.y) <= openingOf(difficulty, i, blocked)) rings++;
  }
  return { aim: { ...aim }, wind, rings, path, block: blocked, owner };
}
/**
 * The sight that threads the line most centrally at full draw. It starts from
 * the solved aim, into the wind by its push and up by the drop, so the curve
 * comes back to the line at the twelfth axe, then refines around it with each
 * opening's own size as the measure.
 */
export function bestAim(wind: number, blocked = 0, difficulty: Difficulty = "normal"): Aim {
  const centre = { aim: -wind * BOW.push / BOW.perSight, elevation: BOW.drop / BOW.perSight };
  let best = -Infinity, choice: Aim = { ...centre, tension: 100 };
  for (let da = -25; da <= 25; da++) for (let de = -25; de <= 25; de++) {
    const aim = { aim: clamp(centre.aim + da / 10, -BOW.sightLimit, BOW.sightLimit), elevation: clamp(centre.elevation + de / 10, -BOW.sightLimit, BOW.sightLimit), tension: 100 };
    const shot = archeryShot(aim, wind, blocked, "rival", difficulty);
    const value = shot.rings * 100 - shot.path.reduce((n, p, i) => n + Math.hypot(p.x, p.y) / openingOf(difficulty, i + 1, blocked), 0);
    if (value > best) { best = value; choice = aim; }
  }
  return choice;
}
/** The sight's tremble once a full draw has been held past `steadyMs`, in sight units. */
export function bowSway(s: BowState) {
  const shake = clamp((s.pull - BOW.drawMs - BOW.steadyMs) / BOW.trembleMs, 0, 1) * BOW.swayMax;
  if (!shake) return { aim: 0, elevation: 0 };
  return { aim: shake * Math.sin(s.elapsed / 175), elevation: shake * 0.7 * Math.sin(s.elapsed / 121 + 1.3) };
}
/** What went wrong, read at the axe the arrow struck, and how to correct it. */
export function shotAdvice(shot: Shot): string {
  if (shot.rings >= BOW.axes) return "Clean through all twelve axes!";
  const p = shot.path[shot.rings], sideways = Math.abs(p.x) >= Math.abs(p.y);
  const side = sideways ? (p.x > 0 ? "wide right" : "wide left") : p.y > 0 ? "high" : "low";
  const fix = sideways ? `aim further ${p.x > 0 ? "left" : "right"}` : p.y > 0 ? "aim a little lower" : shot.aim.tension < 95 ? "draw fully, or aim higher" : "aim a little higher";
  const wind = sideways && Math.sign(p.x) === Math.sign(shot.wind) ? " on the draught" : "";
  return `Through ${shot.rings} of 12. It struck axe ${shot.rings + 1} ${side}${wind}: ${fix}.`;
}
function setWind(s: BowState) { s.wind = Math.round((roll(s) - .5) * [40, 80, 110][tierOf(s.difficulty)]); }
function letDown(s: BowState) { s.drawing = false; s.pull = 0; s.draw = 0; s.aim.tension = 0; }
function loose(s: BowState) {
  const sway = bowSway(s);
  s.shot = archeryShot({ aim: s.aim.aim + sway.aim, elevation: s.aim.elevation + sway.elevation, tension: Math.round(s.draw * 100) }, s.wind, s.blocked, "player", s.difficulty);
  const rings = s.shot.rings;
  s.lastShot = s.shot; s.shots.push(rings); s.score += rings; s.successes += Number(rings >= 8); s.misses += Number(rings < BOW.axes); streak(s, rings >= 8);
  s.feedback = `${shotAdvice(s.shot)} Antinous shoots next.`;
  s.blocked = 0; s.phase = "rival"; s.timer = 0; letDown(s);
}
function rivalShot(s: BowState) {
  const tier = tierOf(s.difficulty), reads = s.plan.source === "ai" || s.difficulty === "hard";
  const ideal = bestAim(s.wind, 0, s.difficulty);
  // The unsteady suitor allows for only half the draught; the wind reader allows for all of it.
  const aim: Aim = { aim: reads ? ideal.aim : ideal.aim / 2, elevation: ideal.elevation, tension: Math.round(88 + roll(s) * 12) };
  // No archer's hand is perfect. The error is bounded, seeded, and measured in
  // openings, so easy's wider axes do not make him perfect: about 7, 9 and 10
  // axes a shot on easy, medium and hard.
  const openings = BOW.opening[tier] / BOW.perSight;
  aim.aim += (roll(s) - .5) * 2 * [2.6, 1.8, 1.4][tier] * openings;
  aim.elevation += (roll(s) - .5) * 2 * [1.5, 1.1, 0.9][tier] * openings;
  // Antinous' pride: one showy, half-drawn shot is a real risk rather than an unbeatable perfect score.
  const boast = s.turn === 3 && s.plan.source === "ai";
  if (boast) aim.tension = 72;
  s.rivalAim = aim; s.shot = archeryShot(aim, s.wind, 0, "rival", s.difficulty);
  const blockShot = s.plan.planId === "feint" && s.plan.source === "ai" && s.score >= s.rivalScore;
  if (blockShot) s.shot.rings = Math.min(6, s.shot.rings);
  const rings = s.shot.rings, axes = `${rings} axe${rings === 1 ? "" : "s"}`;
  s.rivalScore += rings; s.rivalShots.push(rings); s.blocked = blockShot ? 4 + Math.floor(roll(s) * 5) : 0;
  s.rivalLine = blockShot ? `Antinous threads ${axes}, then lodges an arrow in axe ${s.blocked}. Its opening is narrower for your next shot.` : boast ? `Antinous shows off with a quick half-draw and threads ${axes}.` : `Antinous ${reads ? "leans into the draught" : "aims down the line"} and threads ${axes}.`;
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
    if (action.type === "aim" && (action.field === "aim" || action.field === "elevation") && Number.isFinite(action.value)) s.aim[action.field] = clamp(action.value, -BOW.sightLimit, BOW.sightLimit);
    if (action.type === "draw" && action.held && !s.drawing) { s.drawing = true; s.pull = 0; s.draw = 0; }
    if ((action.type === "draw" && !action.held || action.type === "shoot") && s.drawing) {
      if (s.draw >= BOW.minDraw) loose(s);
      else { letDown(s); s.feedback = "Draw the bow further before you let go."; }
    }
    if (action.type === "letdown") letDown(s);
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
    const synced = (s.plan.source === "ai" || s.difficulty === "hard") && (s.strikes.some(a => !a.reflected && a.x < 480) || s.telegraph > 0);
    s.pull = clamp(5 + 4 * Math.sin(time * 2) + (synced ? s.plan.planId === "undertow" ? 7 : 4 : 0), 2, 16);
    s.boat = clamp(s.boat + (s.rowing ? 11 - s.pull * .3 : -s.pull * .48) * dt / 1000, 0, 85);
    s.spawn -= dt;
    if (s.spawn <= 0 && !s.telegraph) {
      s.head = (s.head + 1) % 6;
      s.targetY = s.plan.source === "ai" || s.difficulty !== "easy" ? clamp(s.paddle + (s.head % 2 ? 90 : -90), 45, 355) : 55 + s.head * 57;
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
        if (Math.abs(a.y - s.paddle) <= [58, 47, 37][tier]) { const perfect = Math.abs(a.y - s.paddle) <= 12; a.reflected = true; a.vx = Math.abs(a.vx) * 1.45; a.vy = (a.y - s.paddle) * 3; s.successes++; s.score += perfect ? 200 : 100; if (perfect) s.boat = Math.min(85, s.boat + 4); streak(s, true); s.feedback = perfect ? "Perfect parry! +200 points. The recoil carries the ship away from the vortex." : "Reflected! The head recoils. Keep rowing."; }
        else { s.hits++; s.boat = Math.max(0, s.boat - 7); streak(s, false); s.feedback = "A head strikes the hull. Move the shield toward the next warning."; continue; }
      }
      if (a.x < 800) keep.push(a);
    }
    s.strikes = keep;
    if (s.boat <= 0 || s.hits >= 5) end(s, false, s.boat <= 0 ? "The vortex takes the ship. Hold Row as you guard." : "Five strikes breach the hull. Track the warned heads with your shield.");
    else if (s.elapsed >= s.duration) end(s, true, "The ship slips beyond the six heads and the whirlpool.");
  } else if (s.id === "bow") {
    s.timer += dt;
    if (s.phase === "player") {
      if (s.drawing) { s.pull += dt; s.draw = Math.min(1, s.pull / BOW.drawMs); s.aim.tension = Math.round(s.draw * 100); }
    } else if (s.phase === "rival" && s.timer >= BOW.flightMs + BOW.resultMs + BOW.rivalAimMs) rivalShot(s);
    else if (s.phase === "review" && s.timer >= BOW.flightMs + BOW.resultMs) {
      if (s.turn >= (s.practice ? 1 : BOW.turns)) end(s, s.practice || s.score > s.rivalScore, `Final score: Odysseus ${s.score}, Antinous ${s.rivalScore}. ${s.score > s.rivalScore ? "The bow remembers its king." : "Antinous wins ties. Read the draught and draw fully."}`);
      else { s.turn++; setWind(s); s.phase = "player"; s.timer = 0; s.feedback = s.blocked ? `Your arrow ${s.turn} of ${BOW.turns}. Axe ${s.blocked} has Antinous' arrow in it: its opening is narrower. Read the new draught.` : `Your arrow ${s.turn} of ${BOW.turns}. The draught has changed: read the wind, then draw.`; }
    }
  }
  return s;
}
export function mythicSummary(s: MythicState): AttemptSummary {
  return { won: s.done && s.won, source: s.plan.source, hits: clamp(s.hits, 0, 100), successes: clamp(s.successes, 0, 100), early: 0, late: 0, misses: clamp(s.misses, 0, 100), laneMs: [0, 0, 0], score: Math.round(s.score), timeMs: Math.round(s.elapsed), difficulty: s.difficulty, ...(s.id === "sirens" ? { laneMisses: [...s.laneMisses] as [number, number, number, number] } : {}) };
}
export function scoreLabel(s: MythicState) { return s.id === "bow" ? "axes" : s.id === "circe" ? "brew points" : "points"; }
export function statusLabel(s: MythicState) {
  if (s.id === "cyclops") return `Turn ${s.turn}/${s.practice ? 4 : [32, 26, 22][tierOf(s.difficulty)]} · ${3 - s.hits} lives · ${s.phase === "warning" ? "Evade once" : "Your move"}`;
  if (s.id === "circe") return `${Math.ceil(((s.practice ? 25000 : 120000) - s.elapsed) / 1000)}s · Chain record ${s.chains} · Curses banked ${s.bank}`;
  if (s.id === "sirens") return `${s.successes}/${s.practice ? 1 : 5} melodies · Temptation ${s.temptation}%`;
  if (s.id === "scylla") return `${Math.ceil((s.duration - s.elapsed) / 1000)}s to safety · Hull ${5 - s.hits}/5`;
  const flying = s.phase === "rival" && s.timer < BOW.flightMs + BOW.resultMs;
  return `Arrow ${s.turn}/${s.practice ? 1 : BOW.turns} · You ${s.score} – Antinous ${s.rivalScore} · ${s.phase === "player" ? "Your shot" : flying ? "Your arrow flies" : "Antinous shoots"}`;
}
