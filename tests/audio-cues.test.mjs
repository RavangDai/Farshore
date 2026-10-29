import test from "node:test";
import assert from "node:assert/strict";
import { standardPlan } from "../src/lib/arcade/arcade.ts";
import { createGame, gameAction, tickGame } from "../src/lib/arcade/arcade-runtime.ts";
import { scenes } from "../src/lib/audio/ambience.ts";
import { audioFrame, encounterSounds, laneRate } from "../src/lib/audio/cues.ts";
import { sounds } from "../src/lib/audio/sounds.ts";

const game = (id, originalCave = false) => createGame(id, "normal", standardPlan(id), false, 7, originalCave);
const heard = (prev, next) => audioFrame(prev, next).cues.map(c => c.sound);
/** Ticks an engine, collecting every sound heard along the way. */
function play(state, ms, act = s => s) {
  const all = [];
  let s = state;
  for (let t = 0; t < ms && !s.done; t += 50) {
    const next = tickGame(act(s), 50);
    all.push(...audioFrame(s, next).cues);
    s = next;
  }
  return { state: s, cues: all, names: all.map(c => c.sound) };
}

test("an unchanged state makes no sound, and every frame names a real scene and real sounds", () => {
  for (const [id, original] of [["cyclops", false], ["cyclops", true], ["lotus"], ["aeolus"], ["circe"], ["sirens"], ["scylla"], ["calypso"], ["bow"]]) {
    const s = game(id, original), frame = audioFrame(s, s);
    assert.deepEqual(frame.cues, [], id);
    assert.ok(scenes[frame.scene], `${id} scene ${frame.scene}`);
    const { cues } = play(s, 20000);
    for (const cue of cues) assert.ok(sounds[cue.sound], `${id} cue ${cue.sound}`);
  }
});

test("the cave runner sounds its jumps, slides and lane changes, panned to the runner", () => {
  const s = game("cyclops");
  assert.ok(heard(s, gameAction(s, { type: "jump" })).includes("jump"));
  assert.ok(heard(s, gameAction(s, { type: "slide" })).includes("slide"));
  const right = audioFrame(s, gameAction(s, { type: "move", dx: 1 })).cues.find(c => c.sound === "swish");
  const left = audioFrame(s, gameAction(s, { type: "move", dx: -1 })).cues.find(c => c.sound === "swish");
  assert.ok(right.pan > 0 && left.pan < 0);
  const landing = play(gameAction(s, { type: "jump" }), 1000).names;
  assert.ok(landing.includes("land"), "a jump comes down");
});

test("the cave's giant winds up, throws and lands boulders, and a runner who never moves is hit", () => {
  const { names, state } = play(game("cyclops"), 60000);
  for (const sound of ["windup", "throw", "crash", "hit", "pass-by"]) assert.ok(names.includes(sound), sound);
  assert.equal(state.done, true);
  assert.ok(names.includes("defeat"));
});

test("coins rise in pitch with the combo, and sheep are a rescue", () => {
  const s = game("cyclops");
  const coin = audioFrame(s, { ...s, coinsTaken: 1, combo: 4 }).cues.find(c => c.sound === "coin");
  assert.ok(Math.abs(coin.rate - 2 ** (4 / 12)) < 1e-9);
  assert.ok(heard(s, { ...s, sheepSaved: 1 }).includes("rescue"));
});

test("the chase drives the giant's footfalls and the runner's own steps", () => {
  const s = game("cyclops"), calm = audioFrame(null, s).loops;
  const close = audioFrame(null, { ...s, cyclops: { ...s.cyclops, gap: 12 } }).loops;
  assert.ok(close.giant > calm.giant);
  assert.ok(close.giant <= 1 && calm.giant >= 0);
  const running = audioFrame(null, { ...s, speed: 24 }).loops;
  assert.ok(running.run > 0.5);
  assert.equal(audioFrame(null, { ...s, speed: 24, jump: 300 }).loops.run, 0, "no footsteps in the air");
  assert.equal(audioFrame(null, { ...s, zone: "collapse" }).scene, "collapse");
});

test("potion moves, rotations, drops and matches each have a sound", () => {
  const s = game("circe");
  assert.deepEqual(heard(s, gameAction(s, { type: "column", direction: 1 })), ["glass-tick"]);
  assert.deepEqual(heard(s, gameAction(s, { type: "rotate" })).filter(n => n !== "glass-tick"), s.piece.join() === [...s.piece.slice(1), s.piece[0]].join() ? [] : ["clink"]);
  assert.ok(heard(s, gameAction(s, { type: "drop" })).includes("plop"));
  assert.ok(heard(s, { ...s, score: s.score + 30, combo: 1 }).includes("fizz"));
});

test("the Sirens sing in the listen phase and the lyre answers in the reply phase", () => {
  const s = game("sirens"), listened = play(s, 6000);
  const notes = listened.cues.filter(c => c.sound === "siren-note");
  const melody = s.notes.filter(n => !n.rest);
  assert.equal(notes.length, melody.length, "one sung note per note of the melody");
  assert.deepEqual(notes.map(c => c.rate), melody.map(n => laneRate(n.lane)));
  const reply = listened.state;
  assert.equal(reply.phase, "reply");
  const answered = audioFrame(reply, gameAction(reply, { type: "note", lane: 2 })).cues.find(c => c.sound === "lyre");
  assert.equal(answered.rate, laneRate(2));
  assert.ok(Math.abs(laneRate(3) - 2) < 1e-9, "the top lane is an octave up");
});

test("Scylla hisses before she strikes, a parry clangs and a hull strike cracks", () => {
  const { names } = play(game("scylla"), 8000);
  assert.ok(names.includes("hiss") && names.includes("strike"));
  const s = game("scylla");
  assert.ok(heard(s, { ...s, successes: 1, score: 100 }).includes("clang"));
  assert.ok(heard(s, { ...s, successes: 1, score: 200 }).includes("ting"), "a perfect parry rings");
  assert.deepEqual(heard(s, { ...s, hits: 1 }), ["hull-crack", "splash"]);
  assert.equal(audioFrame(null, { ...s, rowing: true }).loops.row, 1);
});

test("the bow creaks as it is drawn, and each arrow rings once per axe it threads before it strikes home", () => {
  const s = game("bow");
  assert.deepEqual(heard(s, gameAction(s, { type: "aim", field: "aim", value: 4 })), [], "moving the sight is silent");
  const nocked = gameAction(s, { type: "draw", held: true });
  assert.ok(heard(s, nocked).includes("bow-draw"));
  // Wind 40 carries a straight shot out of the line part-way down the hall.
  for (const wind of [0, 40]) {
    const drawn = play({ ...nocked, wind }, 1000).state, shot = gameAction(drawn, { type: "draw", held: false });
    const cues = audioFrame(drawn, shot).cues, rings = shot.shots[shot.shots.length - 1];
    assert.deepEqual(cues.slice(0, 2).map(c => c.sound), ["bow-release", "arrow"]);
    const tings = cues.filter(c => c.sound === "ting"), thunk = cues.filter(c => c.sound === "thunk");
    assert.equal(tings.length, Math.min(12, rings), `wind ${wind}`);
    assert.ok(tings.every((c, i) => !i || c.delay > tings[i - 1].delay), "rings follow one another");
    assert.equal(thunk.length, 1);
    assert.ok(thunk[0].delay > (tings.at(-1)?.delay ?? 0), "the arrow strikes after the last axe it passes");
  }
});

test("lotus, aeolus, calypso and the original cave each have their sounds", () => {
  const lotus = game("lotus");
  const step = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => gameAction(lotus, { type: "move", dx, dy })).find(n => n !== lotus);
  assert.ok(heard(lotus, step).includes("step-grass"));
  const aeolus = game("aeolus");
  assert.ok(heard(aeolus, gameAction(aeolus, { type: "lift" })).includes("flap"));
  assert.ok(audioFrame(null, { ...aeolus, gust: 32 }).loops.gust === 1);
  const raft = game("calypso");
  assert.ok(heard(raft, gameAction(raft, { type: "move", dx: 0, dy: -1 })).includes("hop"));
  assert.ok(heard(raft, { ...raft, hits: 1 }).includes("splash-big"));
  const grid = game("cyclops", true);
  const moved = [[1, 0], [0, -1], [-1, 0], [0, 1]].map(([dx, dy]) => gameAction(grid, { type: "move", dx, dy })).find(n => n.player.x !== grid.player.x || n.player.y !== grid.player.y);
  assert.ok(heard(grid, moved).includes("step-stone"));
});

test("a round ends with a victory or a defeat, once", () => {
  const s = game("lotus");
  assert.deepEqual(heard(s, { ...s, done: true, won: true }), ["victory"]);
  assert.deepEqual(heard(s, { ...s, done: true, won: false }), ["defeat"]);
  const over = { ...s, done: true, won: true };
  assert.deepEqual(heard(over, over), []);
});

test("every sound an encounter makes is rendered while its briefing is read", () => {
  const presses = { lotus: [{ type: "move", dx: 1, dy: 0 }, { type: "move", dx: 0, dy: -1 }], aeolus: [{ type: "lift" }], calypso: [{ type: "move", dx: 0, dy: -1 }], cyclops: [{ type: "jump" }, { type: "move", dx: 1 }, { type: "slide" }], circe: [{ type: "column", direction: 1 }, { type: "rotate" }, { type: "drop" }], scylla: [{ type: "row", held: true }], bow: [{ type: "draw", held: true }, { type: "draw", held: false }], sirens: [{ type: "note", lane: 1 }] };
  for (const id of Object.keys(encounterSounds)) {
    let step = 0;
    const { cues } = play(game(id), 30000, s => (++step % 9 === 0 ? gameAction(s, presses[id][step % presses[id].length]) : s));
    const frame = audioFrame(null, game(id)), scene = scenes[frame.scene];
    const prepared = new Set([...encounterSounds[id], ...scene.beds.map(b => b.sound), ...scene.shots.map(s => s.sound)]);
    for (const cue of cues) assert.ok(prepared.has(cue.sound), `${id} plays ${cue.sound} without preparing it`);
  }
});
