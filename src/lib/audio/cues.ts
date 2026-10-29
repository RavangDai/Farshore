import type { TrialId } from "../arcade/arcade.ts";
import { isAdventure, isCave, type GameState } from "../arcade/arcade-runtime.ts";
import { START_GAP, type CaveState } from "../encounters/cave-runner.ts";
import { BOW, arrowTime, axeZ, songBeat, strikeZ, type MythicState, type Shot } from "../encounters/mythic.ts";
import type { AdventureState } from "../encounters/odyssey-games.ts";
import type { LoopName, SceneName } from "./ambience.ts";
import type { SoundName } from "./sounds.ts";

// Sound follows the simulation, never the other way round: each frame
// compares the engine's previous and next state and names what was heard.
// Pan runs from -1 (left) to 1 (right); rate shifts pitch (2 is an octave up).

export type Cue = { sound: SoundName; pan?: number; gain?: number; rate?: number; delay?: number };
export type AudioFrame = { cues: Cue[]; loops: Partial<Record<LoopName, number>>; scene: SceneName };

const semitones = (n: number) => 2 ** (n / 12);
const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
/** The Sirens' four lanes sing C, E, G and the octave above, against recipes tuned to C. */
export const laneRate = (lane: number) => semitones([0, 4, 7, 12][lane] ?? 0);

/** Everything an encounter can sound, so it can be rendered while the briefing is read. */
const round: SoundName[] = ["countdown", "go", "victory", "defeat"];
export const encounterSounds: Record<TrialId, SoundName[]> = {
  cyclops: [...round, "jump", "land", "slide", "swish", "coin", "rescue", "precise", "hit", "pass-by", "windup", "throw", "roar", "crash", "giant-step", "step-stone", "wool", "cave-air", "torch", "drip", "rumble", "wind", "sea"],
  lotus: [...round, "step-grass", "ui-confirm", "rescue", "blessing", "relic", "hit", "costly", "garden-air", "bird"],
  aeolus: [...round, "flap", "blessing", "precise", "hull-crack", "wind", "sea", "creak"],
  circe: [...round, "glass-tick", "clink", "plop", "fizz", "coin", "curse", "hall-air", "torch"],
  sirens: [...round, "siren-note", "lyre", "song-won", "song-lost", "sea", "creak"],
  scylla: [...round, "hiss", "strike", "clang", "ting", "hull-crack", "splash", "oar", "sea", "whirlpool", "creak"],
  calypso: [...round, "hop", "driftwood", "rescue", "charge", "thunder", "hit", "splash-big", "rain", "wind", "distant-thunder"],
  bow: [...round, "bow-draw", "bow-release", "arrow", "thunk", "ting", "gust", "hall-air", "torch"],
};

export function audioFrame(prev: GameState | null, next: GameState): AudioFrame {
  const frame: AudioFrame = { cues: [], loops: {}, scene: "sea" };
  if (isCave(next)) cave(prev && isCave(prev) ? prev : null, next, frame);
  else if (isAdventure(next)) adventure(prev && isAdventure(prev) && prev.id === next.id ? prev : null, next, frame);
  else mythic(prev && !isCave(prev) && !isAdventure(prev) && prev.id === next.id ? prev : null, next, frame);
  if (prev && next.done && !prev.done) frame.cues.push({ sound: next.won ? "victory" : "defeat" });
  return frame;
}

function cave(prev: CaveState | null, s: CaveState, frame: AudioFrame) {
  const { cues, loops } = frame;
  frame.scene = s.zone === "cave" ? "cave" : s.zone === "collapse" ? "collapse" : "daylight";
  loops.giant = clamp01(1 - (s.cyclops.gap - 8) / (START_GAP - 8));
  loops.run = s.done || s.jump > 0 || s.slide > 0 ? 0 : clamp01(s.speed / 30);
  if (!prev) return;
  const pan = (lane: number) => (lane - 1) * 0.6, here = pan(s.lane);
  if (s.jump > 0 && prev.jump === 0) cues.push({ sound: "jump", pan: here });
  if (s.landedAt !== prev.landedAt) cues.push({ sound: "land", pan: here });
  if (s.slide > 0 && prev.slide <= 0) cues.push({ sound: "slide", pan: here });
  if (s.lane !== prev.lane) cues.push({ sound: "swish", pan: here });
  if (s.coinsTaken > prev.coinsTaken) cues.push({ sound: "coin", pan: here, rate: semitones(Math.min(7, s.combo)) });
  if (s.sheepSaved > prev.sheepSaved) cues.push({ sound: "rescue" });
  if (s.precision > prev.precision) cues.push({ sound: "precise", pan: here });
  if (s.hits > prev.hits) cues.push({ sound: "hit", pan: here });
  const passed = new Set(prev.obstacles.filter(o => o.resolved).map(o => o.id));
  for (const o of s.obstacles) if (o.resolved && !passed.has(o.id) && o.lane !== s.lane) cues.push({ sound: "pass-by", pan: pan(o.lane), gain: 0.7 });
  const giant = s.cyclops, was = prev.cyclops.state;
  if (giant.state === "winding" && was !== "winding") cues.push({ sound: "windup", pan: pan(giant.windLane) * 0.5 });
  if (giant.state === "throwing" && was === "winding") cues.push({ sound: "throw" });
  if (giant.state === "roaring" && was !== "roaring") cues.push({ sound: "roar" });
  const landed = new Set(prev.boulders.filter(b => b.resolved).map(b => b.id));
  for (const b of s.boulders) if (b.resolved && !landed.has(b.id)) cues.push({ sound: "crash", pan: pan(b.lane) });
}

function mythic(prev: MythicState | null, s: MythicState, frame: AudioFrame) {
  const { cues, loops } = frame;
  if (s.id === "cyclops") {
    frame.scene = "cave";
    if (!prev || prev.id !== "cyclops") return;
    const stepped = Math.abs(s.player.x - prev.player.x) + Math.abs(s.player.y - prev.player.y);
    if (stepped) cues.push({ sound: "step-stone", gain: s.stance === "sneak" ? 0.6 : 1 });
    if (stepped > 1) cues.push({ sound: "step-stone", delay: 0.14 });
    if (s.hidden && !prev.hidden) cues.push({ sound: "wool" });
    if (s.phase === "warning" && prev.phase !== "warning") cues.push({ sound: "windup", gain: 0.8 });
    if (s.phase === "player" && prev.phase === "warning") cues.push({ sound: "crash", gain: 0.8 }, ...(s.hits > prev.hits ? [{ sound: "hit" as const }] : []));
  } else if (s.id === "circe") {
    frame.scene = "hall";
    if (!prev || prev.id !== "circe") return;
    const curses = (board: number[]) => board.filter(tile => tile === 5).length;
    if (s.column !== prev.column) cues.push({ sound: "glass-tick", pan: (s.column - 2.5) / 3 });
    else if (s.turn === prev.turn && s.piece.join() !== prev.piece.join()) cues.push({ sound: "clink" });
    if (s.turn > prev.turn) cues.push({ sound: "plop", pan: (prev.column - 2.5) / 3 });
    if (s.score > prev.score) cues.push({ sound: "fizz" }, { sound: "coin", rate: semitones(Math.min(7, s.combo + 2)), gain: 0.7, delay: 0.08 });
    if (s.rivalScore > prev.rivalScore) cues.push({ sound: "fizz", pan: 0.7, gain: 0.5 });
    if (s.bank > prev.bank) cues.push({ sound: "curse", pan: 0.6, gain: 0.6 });
    if (curses(s.board) > curses(prev.board)) cues.push({ sound: "curse" });
  } else if (s.id === "sirens") {
    frame.scene = "calm";
    if (!prev || prev.id !== "sirens") return;
    const sameMelody = prev.phase === "listen" && prev.round === s.round;
    if (s.phase === "listen" && (!sameMelody || s.timer !== prev.timer)) {
      // The first note sounds as the melody's clock starts, then one per beat.
      const beat = songBeat(s), note = Math.floor(s.timer / beat);
      const heard = sameMelody && prev.timer > 0 ? Math.floor(prev.timer / beat) : -1;
      if (note !== heard && note < s.notes.length && !s.notes[note].rest) cues.push({ sound: "siren-note", rate: laneRate(s.notes[note].lane), pan: (s.notes[note].lane - 1.5) * 0.3 });
    }
    if (s.entered.length > prev.entered.length) {
      const lane = s.entered[s.entered.length - 1];
      cues.push({ sound: "lyre", rate: laneRate(lane), pan: (lane - 1.5) * 0.3 });
    }
    if (s.successes > prev.successes) cues.push({ sound: "song-won" });
    if (s.misses > prev.misses) cues.push({ sound: "song-lost" });
  } else if (s.id === "scylla") {
    frame.scene = "strait";
    loops.row = s.rowing && !s.done ? 1 : 0;
    loops.whirlpool = clamp01(s.pull / 16);
    if (!prev || prev.id !== "scylla") return;
    if (s.telegraph > 0 && prev.telegraph <= 0) cues.push({ sound: "hiss", pan: 0.6 });
    if (s.strikes.length > prev.strikes.length) cues.push({ sound: "strike", pan: 0.5 });
    if (s.successes > prev.successes) cues.push({ sound: "clang", pan: -0.2 }, ...(s.score - prev.score >= 200 ? [{ sound: "ting" as const, delay: 0.05 }] : []));
    if (s.hits > prev.hits) cues.push({ sound: "hull-crack" }, { sound: "splash", delay: 0.06 });
  } else {
    frame.scene = "hall";
    if (!prev || prev.id !== "bow") return;
    // The string creaks as the draw begins; moving the sight is silent, since a pointer moves it every frame.
    if (s.drawing && !prev.drawing) cues.push({ sound: "bow-draw", gain: 0.6 });
    if (s.shot && (s.shots.length > prev.shots.length || s.rivalShots.length > prev.rivalShots.length)) arrow(cues, s.shot, s.shot.owner === "player" ? -0.3 : 0.4);
    if (s.wind !== prev.wind) cues.push({ sound: "gust", gain: 0.6 });
  }
}

/** A shot: the release, the flight, one ring as it passes each axe, and the strike where it comes to rest, timed with the hall's own flight. */
function arrow(cues: Cue[], shot: Shot, pan: number) {
  cues.push({ sound: "bow-release", pan }, { sound: "arrow", pan, delay: 0.05 });
  for (let i = 1; i <= Math.min(BOW.axes, shot.rings); i++) cues.push({ sound: "ting", pan: pan * 0.5, delay: arrowTime(axeZ(i)) / 1000, rate: semitones(i - 1), gain: 0.6 });
  cues.push({ sound: "thunk", pan: pan * 0.5, delay: arrowTime(strikeZ(shot)) / 1000 });
}

function adventure(prev: AdventureState | null, s: AdventureState, frame: AudioFrame) {
  const { cues, loops } = frame;
  if (s.id === "lotus") {
    frame.scene = "garden";
    if (!prev || prev.id !== "lotus") return;
    const pursuing = (line: string) => /^(Pursuit|Intercept)/.test(line);
    if (s.player.x !== prev.player.x || s.player.y !== prev.player.y) cues.push({ sound: "step-grass", gain: 0.8, pan: (s.player.x - 7) / 10 });
    if (s.carrying && !prev.carrying) cues.push({ sound: "ui-confirm" });
    if (s.rescued > prev.rescued) cues.push({ sound: "rescue" });
    if (s.protection > prev.protection) cues.push({ sound: "blessing" });
    if (s.relicsFound > prev.relicsFound) cues.push({ sound: "relic" });
    if (s.hits > prev.hits) cues.push({ sound: "hit" });
    if (pursuing(s.rivalLine) && !pursuing(prev.rivalLine)) cues.push({ sound: "costly", gain: 0.6 });
  } else if (s.id === "aeolus") {
    frame.scene = "gale";
    loops.gust = clamp01(Math.abs(s.gust) / 32);
    if (!prev || prev.id !== "aeolus") return;
    if (s.liftHistory[s.liftHistory.length - 1] !== prev.liftHistory[prev.liftHistory.length - 1]) cues.push({ sound: "flap" });
    if (s.blessings > prev.blessings) cues.push({ sound: "blessing" });
    if (s.perfectPasses > prev.perfectPasses) cues.push({ sound: "precise" });
    if (s.hits > prev.hits) cues.push({ sound: "hull-crack" });
  } else if (s.id === "calypso") {
    frame.scene = "storm";
    if (!prev || prev.id !== "calypso") return;
    const pan = (x: number) => (x - 3.5) / 5;
    const struck = !!s.lightning && !!prev.lightning && s.lightning.warning <= 0 && prev.lightning.warning > 0;
    if (s.moveClock > prev.moveClock) cues.push({ sound: "hop", pan: pan(s.x) });
    if (s.wood > prev.wood) cues.push({ sound: "driftwood" });
    if (s.progress > prev.progress) cues.push({ sound: "rescue" });
    if (s.lightning && !prev.lightning) cues.push({ sound: "charge", pan: pan(s.lightning.x) });
    if (struck) cues.push({ sound: "thunder", pan: pan(s.lightning!.x) });
    if (s.hits > prev.hits) cues.push({ sound: struck ? "hit" : "splash-big" });
  } else frame.scene = "cave";
}
