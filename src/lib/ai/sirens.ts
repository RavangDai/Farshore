// The Sirens: call-and-response composition controller.
//
// One decision cycle runs at a composition point — the moment the engine is
// about to set the next melody — and returns the melody, its tempo, and the
// windows it promises. The controller owns no engine state: it reads a
// perception snapshot, reads and updates the player model, writes its reasoning
// into the AI runtime, and hands back a plain action object.
//
// Four fairness invariants hold on every difficulty:
//
//   1. The whole melody is sung before the reply window opens, and the note
//      list and tempo are fixed at that moment. The controller is never asked
//      for a melody mid-round and never revises one: the listen phase is the
//      telegraph, and `commitMs` is its length.
//   2. The tempo never leaves [`BEAT_FLOOR_MS`, `BEAT_CEIL_MS`], so no note is
//      ever shown for less than `BEAT_FLOOR_MS`, and the melody length never
//      leaves [`MIN_NOTES`, `MAX_NOTES`].
//   3. A melody is only issued when the reply window it creates admits at least
//      as many taps as the melody asks for, measured against the player's own
//      observed pace. Where that cannot be shown the melody is withheld, and
//      the candidate note and the reason both say so.
//   4. The weakness weighting on the hard tier never puts more than
//      `WEAVE_MAX_SHARE` of a melody into one lane, so adaptation stays a weave
//      and never becomes a single-key drill.
//
// The easy and normal tiers draw no random numbers at all, which is what makes
// their patterns learnable: the same round always produces the same melody.

import {
  argmax,
  byTier,
  clamp01,
  commitDecision,
  logEvent,
  ms,
  pct,
  softmax,
  tierOf,
  type AIDecision,
  type AIRuntime,
  type AIState,
  type Candidate,
  type Difficulty,
  type Reading,
} from "./types.ts";
import {
  meanReaction,
  observeChoice,
  observeReaction,
  observeResolution,
  weaknessOf,
  weakestOption,
  type PlayerModel,
} from "./player-model.ts";

/** The four lanes, named the way the encounter names them on screen. */
export const NOTE_NAMES = ["Red", "Blue", "Green", "Gold"] as const;
/** The keys the player answers with, in lane order. Used in hints only. */
export const NOTE_KEYS = ["A", "S", "D", "F"] as const;
export const noteName = (lane: number) => NOTE_NAMES[lane] ?? "Unknown";

/**
 * One note of a melody. Structurally identical to the engine's `SongNote`, and
 * declared here rather than imported so this controller pulls in no engine
 * module. A `rest` is shown and heard but must not be answered.
 */
export type SirenNote = { lane: number; rest: boolean };

/** Melody length bounds. The engine's own composer stays inside these too. */
export const MIN_NOTES = 3;
export const MAX_NOTES = 6;

/**
 * Tempo bounds, in ms per note.
 *
 * The floor is the fairness one: during the listen phase each note occupies one
 * beat, so a beat below this would show a note for less time than it takes to
 * read which lane lit. The ceiling keeps a relaxed melody from dragging the
 * round out past the point where the player can still hold it in memory.
 */
export const BEAT_FLOOR_MS = 440;
export const BEAT_CEIL_MS = 900;

/**
 * Phase timings mirrored from the engine's own song tick:
 *   listen ends at  notes.length * beat + LISTEN_TAIL_MS
 *   reply  ends at  (notes.length + REPLY_WINDOW_BEATS) * beat * REPLY_WINDOW_SCALE
 *
 * The controller has to compute the same windows it is promising against, so
 * they are stated here instead of guessed. If the engine's timers change these
 * must change with them — the fairness bound in rule 3 is only as true as this
 * mirror.
 */
export const LISTEN_TAIL_MS = 500;
export const REPLY_WINDOW_BEATS = 2;
export const REPLY_WINDOW_SCALE = 1.6;

/**
 * The fastest interval between two deliberate taps on separate keys that is
 * assumed sustainable, in ms.
 *
 * It is a floor on the per-note budget rather than an estimate of the player:
 * one unusually quick round must not be allowed to tighten the answerable bound
 * to something only that round could have hit.
 */
export const TAP_FLOOR_MS = 180;

/**
 * Per-note budget used until a reply has actually been timed. The same default
 * the player model uses for an unmeasured reaction, so the two agree.
 */
export const REPLY_FALLBACK_MS = 420;

/** Answers on a lane before its failure rate is treated as evidence. */
export const LANE_EVIDENCE = 2;

/** The largest share of one melody the weakness weave may place in one lane. */
export const WEAVE_MAX_SHARE = 0.5;

/**
 * Softmax temperature over the measured per-lane failure rates.
 *
 * Rates live in 0..1, and 0.25 makes a lane with twice another's failure rate
 * roughly three times as likely to be drawn. A colder setting would crowd the
 * whole melody into one lane, which invariant 4 rejects anyway.
 */
export const WEAVE_TEMPERATURE = 0.25;

/** Temptation above which the brink term starts damping escalation. */
export const BRINK_FROM = 60;

export type SirensPerception = {
  /** Simulation time in ms. */
  at: number;
  phase: "listen" | "reply" | "rest";
  /** ms elapsed inside the current phase. */
  phaseMs: number;
  round: number;
  /** The melody the engine currently holds, rests included. */
  notes: SirenNote[];
  /** ms per note the current melody is being sung at. */
  beatMs: number;
  /** Lanes the player has pressed this round, in order. */
  entered: number[];
  /** Last lane pressed, or -1 before the first tap of the round. */
  lastLane: number;
  /** 0..100. The run ends when this reaches 100. */
  temptation: number;
  melodiesAnswered: number;
  melodiesNeeded: number;
  /** The engine's own per-lane missed-note counter. */
  laneMisses: number[];
  /** Total notes missed across the run, from the engine's counter. */
  missedNotes: number;
  combo: number;
};

export type SirensAction =
  /** Issue a new melody. The engine sets the notes and the tempo and sings. */
  | {
      kind: "sing";
      /** Locked at this moment. Never revised while the round runs. */
      notes: SirenNote[];
      beatMs: number;
      /** Length of the listen phase this melody implies. */
      listenMs: number;
      /** Length of the reply window this melody implies. */
      replyMs: number;
      /** Taps the reply window admits, at the player's observed pace. */
      answerableNotes: number;
      complexity: number;
      decisionId: string;
    }
  /** Sing the melody just played again, unchanged. The engine must say so. */
  | {
      kind: "repeat";
      notes: SirenNote[];
      beatMs: number;
      listenMs: number;
      replyMs: number;
      answerableNotes: number;
      complexity: number;
      decisionId: string;
    }
  /** Issue nothing: every melody was withheld. Stay in rest and ask again. */
  | { kind: "hold"; retryMs: number };

export type SirensPolicy = {
  algorithm: string;
  /** Tier tempo before any adaptation, ms per note. */
  beatMs: number;
  beatFloorMs: number;
  beatCeilMs: number;
  minNotes: number;
  maxNotes: number;
  /** Fraction of the tier tempo the adaptive tier may move it by. */
  tempoSwing: number;
  /** Temptation the engine adds per missed note on this tier. */
  temptationPerError: number;
  /** ms the engine should wait before asking again after a hold. */
  retryMs: number;
  /** Whether composition reads the measured per-lane failure rates. */
  weighted: boolean;
  /** Whether rhythm varies at all, or follows the one fixed staircase. */
  varied: boolean;
};

/**
 * The adaptive flag promotes the normal tier to weighted composition, matching
 * how the other encounters treat an AI-authored opponent plan.
 */
export function sirensPolicy(difficulty: Difficulty, adaptive: boolean): SirensPolicy {
  const tier = tierOf(difficulty);
  const weighted = tier === 2 || (adaptive && tier >= 1);
  const varied = tier >= 1 || adaptive;
  return {
    algorithm: weighted
      ? "Weakness-weighted composition (softmax over measured per-lane failure rates)"
      : varied
        ? "Rhythm variety search (round-paced, no accuracy memory)"
        : "Fixed rotation (round-indexed staircase)",
    beatMs: byTier(difficulty, 820, 650, 520),
    beatFloorMs: BEAT_FLOOR_MS,
    beatCeilMs: BEAT_CEIL_MS,
    minNotes: MIN_NOTES,
    maxNotes: MAX_NOTES,
    tempoSwing: 0.15,
    temptationPerError: byTier(difficulty, 14, 20, 25),
    retryMs: 600,
    weighted,
    varied,
  };
}

/**
 * The algorithm actually in force this cycle.
 *
 * The weighted tier's name claims a softmax over measured failure rates. Until
 * a note has been missed there are no rates, so claiming it would be a lie; on
 * that path the variety scoring is what decided, and the name says that.
 */
export function sirensAlgorithm(policy: SirensPolicy, model: PlayerModel): string {
  if (!policy.weighted) return policy.algorithm;
  return weakestLane(model) === null
    ? "Rhythm variety search (weakness weighting idle — no missed notes yet)"
    : policy.algorithm;
}

const clampMs = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The notes that must be answered. Rests are heard but never played. */
export const melodyOf = (notes: SirenNote[]) => notes.filter(note => !note.rest);

export const noteLine = (notes: SirenNote[]) =>
  notes.length === 0 ? "none set" : notes.map(note => (note.rest ? "rest" : noteName(note.lane))).join(" · ");

export const listenWindowMs = (notes: SirenNote[], beatMs: number) => notes.length * beatMs + LISTEN_TAIL_MS;

export const replyWindowMs = (notes: SirenNote[], beatMs: number) =>
  (notes.length + REPLY_WINDOW_BEATS) * beatMs * REPLY_WINDOW_SCALE;

/**
 * ms the player is assumed to need per answered note.
 *
 * `measured` is what separates an observation from a standing assumption, and
 * every reading that shows this number reports which it was.
 */
export function perNoteBudgetMs(model: PlayerModel): { budget: number; measured: number | null; replies: number } {
  const measured = meanReaction(model);
  return {
    budget: measured === null ? REPLY_FALLBACK_MS : Math.max(TAP_FLOOR_MS, measured),
    measured,
    replies: model.reactionCount,
  };
}

/** How many taps the reply window admits at the player's own pace. */
export const answerableNotes = (notes: SirenNote[], beatMs: number, perNoteMs: number) =>
  Math.floor(replyWindowMs(notes, beatMs) / perNoteMs);

/**
 * The slowest-permitted-tempo-independent floor: the smallest beat at which
 * this melody's reply window still admits every note it asks for.
 *
 * Inverting `answerableNotes` rather than searching for it keeps the bound
 * exact, so the fairness check and the number shown to the player agree.
 */
export const fairBeatFloorMs = (notes: SirenNote[], perNoteMs: number) =>
  (melodyOf(notes).length * perNoteMs) / ((notes.length + REPLY_WINDOW_BEATS) * REPLY_WINDOW_SCALE);

export type LaneRecord = {
  lane: number;
  asked: number;
  answered: number;
  missed: number;
  /** answered / asked, or null when the lane has never been asked. */
  accuracy: number | null;
  /** missed / asked, or null when the lane has never been asked. */
  failureRate: number | null;
  /** True once the lane has `LANE_EVIDENCE` answers behind it. */
  evidenced: boolean;
};

/**
 * Per-lane accuracy from the model's own counts.
 *
 * The engine's `laneMisses` is a numerator with no denominator — it cannot say
 * whether three misses on Blue came from four askings or forty. The model keeps
 * answers and failures as a pair, so the accuracy shown is a real rate.
 */
export function laneRecords(model: PlayerModel): LaneRecord[] {
  return NOTE_NAMES.map((_, lane) => {
    const answered = model.escapes[lane] || 0;
    const missed = model.failures[lane] || 0;
    const asked = answered + missed;
    return {
      lane,
      asked,
      answered,
      missed,
      accuracy: asked > 0 ? answered / asked : null,
      failureRate: asked > 0 ? missed / asked : null,
      evidenced: asked >= LANE_EVIDENCE,
    };
  });
}

/**
 * The lane the player answers worst, or null when nothing has been missed.
 *
 * Deferring to the shared model keeps one definition of "weakest" across the
 * encounters, including its two-answer evidence gate.
 */
export const weakestLane = (model: PlayerModel) => weakestOption(model);

export type MissForecast = {
  /** Measured failure rate per sung note's lane; null where unevidenced. */
  rates: (number | null)[];
  /** Σ rates — expected missed notes. Null unless every lane is evidenced. */
  expectedMisses: number | null;
  /** Expected share of the melody missed. Null on the same condition. */
  expectedShare: number | null;
  /** 1 − Π(1 − rate) — P(at least one note missed). Null on the same condition. */
  anyMiss: number | null;
  grounded: boolean;
};

/**
 * What the model expects this melody to cost the player.
 *
 * Only produced when every lane in the melody carries evidence; a melody that
 * touches an untested lane has no honest forecast, and the decision then
 * reports none rather than filling the gap with a prior. `anyMiss` multiplies
 * the per-note rates, which treats notes as independent draws — an assumption
 * the counts cannot confirm, so every reading that shows it says so.
 */
export function missForecast(model: PlayerModel, notes: SirenNote[]): MissForecast {
  const records = laneRecords(model);
  const sung = melodyOf(notes);
  const rates = sung.map(note => (records[note.lane]?.evidenced ? records[note.lane].failureRate : null));
  const grounded = sung.length > 0 && rates.every(rate => rate !== null);
  if (!grounded) return { rates, expectedMisses: null, expectedShare: null, anyMiss: null, grounded: false };
  const known = rates as number[];
  const expectedMisses = known.reduce((sum, rate) => sum + rate, 0);
  const anyMiss = 1 - known.reduce((product, rate) => product * (1 - rate), 1);
  return {
    rates,
    expectedMisses,
    expectedShare: expectedMisses / known.length,
    anyMiss: clamp01(anyMiss),
    grounded: true,
  };
}

/**
 * How hard a melody is to read back, in 0..1.
 *
 * Three terms, weighted by how much each actually costs the player. A wide leap
 * between consecutive notes dominates, because it has to be read and then
 * played across the keyboard; melody length comes next, as notes to hold in
 * memory; a rest counts least, since it only has to be skipped.
 */
export function patternComplexity(notes: SirenNote[]): number {
  const sung = melodyOf(notes);
  if (notes.length === 0 || sung.length === 0) return 0;
  let leap = 0;
  for (let i = 1; i < sung.length; i++) leap += Math.abs(sung[i].lane - sung[i - 1].lane);
  const widestLeap = (NOTE_NAMES.length - 1) * Math.max(1, sung.length - 1);
  const leapDensity = leap / widestLeap;
  const lengthLoad = clamp01((sung.length - MIN_NOTES) / Math.max(1, MAX_NOTES - MIN_NOTES));
  const restShare = (notes.length - sung.length) / notes.length;
  return clamp01(leapDensity * 0.5 + lengthLoad * 0.3 + restShare * 0.2);
}

/**
 * How much a melody differs from the one just played, in 0..1.
 *
 * Positional, because the player echoes in order: the same lanes in a different
 * order are a different melody to answer. Derived from the perception's current
 * notes, so no extra engine state is needed to avoid repeating a shape.
 */
export function laneNovelty(next: SirenNote[], previous: SirenNote[]): number {
  if (previous.length === 0 || next.length === 0) return 1;
  const span = Math.max(next.length, previous.length);
  const shared = Math.min(next.length, previous.length);
  let differences = Math.abs(next.length - previous.length);
  for (let i = 0; i < shared; i++) {
    if (next[i].lane !== previous[i].lane || next[i].rest !== previous[i].rest) differences++;
  }
  return clamp01(differences / span);
}

// ---- Pattern shapes -------------------------------------------------------
//
// Each shape is a pure function of its arguments, so a given round on the easy
// and normal tiers always composes the same melody. Only the weave consults the
// player model or the RNG.

/** The learnable staircase: one step up the lanes per note, offset by the round. */
function staircase(length: number, step: number): SirenNote[] {
  return Array.from({ length }, (_, i) => ({ lane: (i + step) % NOTE_NAMES.length, rest: false }));
}

/** Out to the far lane and back, so the second half mirrors the first. */
function mirror(length: number, step: number): SirenNote[] {
  const span = NOTE_NAMES.length;
  return Array.from({ length }, (_, i) => {
    const t = (i + step) % (span * 2 - 2);
    return { lane: t < span ? t : span * 2 - 2 - t, rest: false };
  });
}

/** A held pedal lane alternating with a climbing one: two things to track. */
function pedal(length: number, step: number): SirenNote[] {
  const home = step % NOTE_NAMES.length;
  return Array.from({ length }, (_, i) => ({
    lane: i % 2 === 0 ? home : (home + 1 + Math.floor(i / 2)) % NOTE_NAMES.length,
    rest: false,
  }));
}

/**
 * The staircase with one rest near the end.
 *
 * A rest lengthens both windows while asking for no extra tap, so this is the
 * one shape that raises reading difficulty and answerability at the same time.
 */
function syncopated(length: number, step: number): SirenNote[] {
  const notes = staircase(length, step);
  if (notes.length >= MIN_NOTES + 1) notes[notes.length - 2].rest = true;
  return notes;
}

/**
 * The adaptive shape: the player's worst lane on alternating positions, the
 * filler drawn by a softmax over the measured failure rates.
 *
 * Alternating placement caps the weak lane at half the melody on its own, and
 * the quota check catches the case where the filler draws it as well — the two
 * together are invariant 4.
 */
function weave(length: number, weakLane: number, records: LaneRecord[], roll: () => number): SirenNote[] {
  const weights = softmax(
    records.map(record => (record.evidenced ? (record.failureRate ?? 0) : 0)),
    WEAVE_TEMPERATURE,
  );
  const quota = Math.max(1, Math.floor(length * WEAVE_MAX_SHARE));
  // The best-answered evidenced lane, used when the weak lane's quota is spent.
  const relief = records.reduce(
    (best, record) => (record.evidenced && (record.failureRate ?? 1) < (records[best].failureRate ?? 1) ? record.lane : best),
    0,
  );
  let placed = 0;
  const notes: SirenNote[] = [];
  for (let i = 0; i < length; i++) {
    let lane = i % 2 === 1 ? weakLane : sampleLane(weights, roll);
    if (lane === weakLane && placed >= quota) lane = relief === weakLane ? (weakLane + 1) % NOTE_NAMES.length : relief;
    if (lane === weakLane) placed++;
    notes.push({ lane, rest: false });
  }
  return notes;
}

/** Inverse-CDF sample over `weights` using the engine's seeded roll. */
function sampleLane(weights: number[], roll: () => number): number {
  let r = roll();
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ---- Proposals ------------------------------------------------------------

type Proposal = {
  /** Candidate id, and the key the inspector marks the winner by. */
  id: string;
  kind: "sing" | "repeat";
  /** Readable sentence for the decision record. */
  label: string;
  notes: SirenNote[];
  beatMs: number;
  complexity: number;
  score: number;
  note: string;
  /** Taps the reply window admits once the tempo is settled. */
  answerable: number;
  withheld: boolean;
};

/**
 * Settle a proposal's tempo and apply invariants 2 and 3.
 *
 * The fairness floor is raised before the bound is checked, so a melody is only
 * withheld when no permitted tempo can carry it — which is the only case where
 * withholding is the honest answer rather than a slower one.
 */
function settle(notes: SirenNote[], wantedBeatMs: number, policy: SirensPolicy, perNoteMs: number) {
  const floor = Math.max(policy.beatFloorMs, fairBeatFloorMs(notes, perNoteMs));
  const beatMs = Math.round(clampMs(Math.max(wantedBeatMs, floor), policy.beatFloorMs, policy.beatCeilMs));
  const admits = answerableNotes(notes, beatMs, perNoteMs);
  const asks = melodyOf(notes).length;
  const tooLong = asks > admits;
  const tooFast = floor > policy.beatCeilMs;
  return {
    beatMs,
    answerable: admits,
    asks,
    withheld: tooLong || tooFast,
    withheldWhy: tooFast
      ? `needs ${Math.round(floor)} ms per note to stay answerable, above the ${policy.beatCeilMs} ms ceiling — withheld`
      : tooLong
        ? `${asks} notes against a reply window that admits ${admits} at your measured pace — withheld`
        : "",
  };
}

/**
 * Tempo for this round, and the sentence that explains it.
 *
 * Only the weighted tier moves the tempo, and only against a measured pace:
 * answering well inside the beat means the melody can tighten, falling behind
 * it means the melody must relax or the reply window stops being a window.
 * Both directions are capped at `tempoSwing` of the tier tempo and then clamped
 * to the bounds, which is invariant 2.
 */
export function adaptBeatMs(policy: SirensPolicy, model: PlayerModel): { beatMs: number; note: string } {
  const { measured, replies } = perNoteBudgetMs(model);
  if (!policy.weighted) {
    return {
      beatMs: policy.beatMs,
      note: `steady ${policy.beatMs} ms per note — this difficulty does not adapt tempo`,
    };
  }
  if (measured === null) {
    return { beatMs: policy.beatMs, note: `no reply timing measured yet — tempo held at ${policy.beatMs} ms` };
  }
  const swing = policy.beatMs * policy.tempoSwing;
  let beatMs = policy.beatMs;
  let note = `${Math.round(measured)} ms per note measured over ${replies} replies — tempo held`;
  if (measured < policy.beatMs * 0.75) {
    beatMs = policy.beatMs - swing;
    note = `${Math.round(measured)} ms per note measured over ${replies} replies, well inside the ${policy.beatMs} ms beat — tightened by ${Math.round(swing)} ms`;
  } else if (measured > policy.beatMs) {
    beatMs = policy.beatMs + swing;
    note = `${Math.round(measured)} ms per note measured over ${replies} replies, behind the ${policy.beatMs} ms beat — relaxed by ${Math.round(swing)} ms`;
  }
  return { beatMs: Math.round(clampMs(beatMs, policy.beatFloorMs, policy.beatCeilMs)), note };
}

// ---- Readings -------------------------------------------------------------

function perceptionReadings(view: SirensPerception): Reading[] {
  return [
    {
      key: "phase",
      label: "Song phase",
      value: view.phase === "listen" ? "Sirens singing" : view.phase === "reply" ? "Player echoing" : "Between melodies",
      hint: `${(view.phaseMs / 1000).toFixed(1)}s in`,
    },
    {
      key: "round",
      label: "Melody",
      value: `Round ${view.round} · ${view.melodiesAnswered}/${view.melodiesNeeded} answered`,
    },
    { key: "melody", label: "Melody on the lanes", value: noteLine(view.notes), hint: `${NOTE_KEYS.join(" / ")}` },
    { key: "tempo", label: "Current tempo", value: `${Math.round(view.beatMs)} ms per note` },
    {
      key: "entered",
      label: "Echo so far",
      value: view.entered.length === 0 ? "nothing answered yet" : view.entered.map(noteName).join(" · "),
      hint: view.lastLane >= 0 ? `last key ${NOTE_KEYS[view.lastLane] ?? "?"}` : undefined,
    },
    { key: "temptation", label: "Temptation gauge", value: `${Math.round(view.temptation)}%`, hint: "the run ends at 100%" },
    {
      key: "lanemisses",
      label: "Missed notes by lane",
      value: NOTE_NAMES.map((name, lane) => `${name} ${view.laneMisses[lane] || 0}`).join(" · "),
      hint: "the engine's own counter",
    },
    { key: "combo", label: "Clean echoes in a row", value: String(view.combo) },
  ];
}

function memoryReadings(
  model: PlayerModel,
  policy: SirensPolicy,
  tempo: { note: string },
  adaptationNote: string,
): Reading[] {
  const records = laneRecords(model);
  const { measured, replies } = perNoteBudgetMs(model);
  const readings: Reading[] = [
    {
      key: "accuracy",
      label: "Your per-lane accuracy",
      value: records
        .map(record => (record.accuracy === null ? `${noteName(record.lane)} untested` : `${noteName(record.lane)} ${record.answered}/${record.asked}`))
        .join(" · "),
      hint: "answered / asked, from counted notes",
    },
    { key: "adaptation", label: "Adaptation", value: adaptationNote },
    { key: "tempo", label: "Tempo decision", value: tempo.note },
    {
      key: "pace",
      label: "Your reply pace",
      value: measured === null ? "not yet measured" : `${Math.round(measured)} ms per note`,
      hint: measured === null ? `assumed ${REPLY_FALLBACK_MS} ms until a reply is timed` : `measured over ${replies} replies`,
    },
    {
      key: "recent",
      label: "Recent keys pressed",
      value: model.recent.length > 1 ? model.recent.map(noteName).join(" → ") : "none observed",
    },
  ];
  if (!policy.weighted) {
    readings.push({
      key: "scope",
      label: "Policy memory use",
      value: policy.varied ? "round and gauge only — accuracy not read" : "none — fixed rotation",
    });
  }
  return readings;
}

// ---- Decision cycle -------------------------------------------------------

/**
 * Run one decision cycle, at a composition point.
 *
 * `tick` indexes the fixed rotation on the non-adaptive tiers; pass the engine's
 * round counter. It is kept separate from `view.round` so a repeated melody can
 * advance the rotation without the round number moving. `roll` is the engine's
 * seeded RNG and is consulted only by the weighted tier's weave, so the easy and
 * normal tiers compose deterministically.
 */
export function decideSirens(
  ai: AIRuntime,
  model: PlayerModel,
  view: SirensPerception,
  difficulty: Difficulty,
  adaptive: boolean,
  tick: number,
  roll: () => number,
): SirensAction {
  const policy = sirensPolicy(difficulty, adaptive);
  const algorithm = sirensAlgorithm(policy, model);
  const records = laneRecords(model);
  const weakest = weakestLane(model);
  const { budget: perNoteMs } = perNoteBudgetMs(model);
  const tempo = adaptBeatMs(policy, model);
  const observations = perceptionReadings(view);

  logEvent(
    ai,
    view.at,
    "perceive",
    `Round ${view.round}, temptation ${Math.round(view.temptation)}%, last melody ${noteLine(view.notes)}`,
  );

  // The adaptation sentence is the one place the panel is most tempted to
  // invent a weakness, so it is written from the counts and nowhere else.
  const adaptationNote = !policy.weighted
    ? policy.varied
      ? "not adaptive — rhythm varies with the round, not with your accuracy"
      : "not adaptive — a fixed rotation on this difficulty"
    : weakest === null
      ? "nothing to act on — no note has been missed yet"
      : `weaving ${noteName(weakest)} (${records[weakest].missed} of ${records[weakest].asked} missed) into alternating positions`;
  logEvent(ai, view.at, "remember", adaptationNote);

  // ---- Stage 3: evaluate -------------------------------------------------
  const targetLength = Math.min(policy.maxNotes, Math.max(policy.minNotes, view.round + 2));
  const proposals: Proposal[] = [];

  const push = (id: string, kind: "sing" | "repeat", label: string, notes: SirenNote[], wantedBeat: number, describe: (settled: ReturnType<typeof settle>, complexity: number) => string) => {
    if (notes.length === 0) return;
    const settled = settle(notes, wantedBeat, policy, perNoteMs);
    const complexity = patternComplexity(notes);
    proposals.push({
      id,
      kind,
      label,
      notes,
      beatMs: settled.beatMs,
      complexity,
      answerable: settled.answerable,
      withheld: settled.withheld,
      // Fairness: a withheld melody keeps cyclops' -1000 convention, so the
      // inspector shows it losing for a stated reason rather than vanishing.
      score: settled.withheld ? -1000 : 0,
      note: settled.withheld ? settled.withheldWhy : describe(settled, complexity),
    });
  };

  const shapes: { id: string; label: string; notes: SirenNote[] }[] = policy.varied
    ? [
        { id: "sing:staircase", label: "staircase", notes: staircase(targetLength, tick - 1) },
        { id: "sing:mirror", label: "mirror", notes: mirror(targetLength, tick - 1) },
        { id: "sing:pedal", label: "pedal", notes: pedal(targetLength, tick - 1) },
        { id: "sing:syncopated", label: "syncopated", notes: syncopated(targetLength, tick - 1) },
      ]
    : [{ id: "sing:staircase", label: "staircase", notes: staircase(targetLength, tick - 1) }];

  if (policy.weighted && weakest !== null) {
    shapes.push({ id: "sing:weave", label: "weakness weave", notes: weave(targetLength, weakest, records, roll) });
  }

  // The round's complexity target, used by every tier that is not weighted:
  // it rises with the round, because a melody that never gets harder stops
  // being a contest, and falls as the gauge fills, because a player one bad
  // round from losing is owed the easier reading, not the harder one.
  const complexityTarget = clamp01(0.28 + 0.09 * (view.round - 1) - view.temptation / 400);
  const brink = clamp01((view.temptation - BRINK_FROM) / (100 - BRINK_FROM));

  for (const shape of shapes) {
    push(shape.id, "sing", `${melodyOf(shape.notes).length}-note ${shape.label} phrase`, shape.notes, tempo.beatMs, (settled, complexity) => {
      const forecast = policy.weighted ? missForecast(model, shape.notes) : null;
      if (forecast && forecast.grounded && forecast.expectedShare !== null) {
        // The weighted tier's score is the model's own forecast of how much of
        // this melody lands, in points, damped near the top of the gauge.
        const base = forecast.expectedShare * 100;
        const mercy = brink * complexity * 40;
        proposalScore(proposals, shape.id, base - mercy);
        return `expected misses ${forecast.expectedMisses?.toFixed(2)} of ${settled.asks} (${pct(forecast.expectedShare)}) · c${complexity.toFixed(2)}${mercy > 0 ? ` -${round1(mercy)} brink mercy at ${Math.round(view.temptation)}%` : ""}`;
      }
      if (policy.varied) {
        const fit = (1 - Math.abs(complexity - complexityTarget)) * 70;
        const novelty = laneNovelty(shape.notes, view.notes) * 30;
        proposalScore(proposals, shape.id, fit + novelty);
        return `c${complexity.toFixed(2)} vs round target ${complexityTarget.toFixed(2)} → ${round1(fit)} fit · ${round1(novelty)} novelty${forecast && !forecast.grounded ? " · no accuracy evidence to weight with" : ""}`;
      }
      proposalScore(proposals, shape.id, 60);
      return `fixed rotation step ${(tick - 1) % NOTE_NAMES.length + 1} of ${NOTE_NAMES.length} · c${complexity.toFixed(2)} · no player data read`;
    });
  }

  // The fairness floor: the shortest permitted melody at the slowest permitted
  // tempo. It scores barely above holding, so it only ever wins when every
  // other melody was withheld — but it means a withheld round still has a fair
  // melody to fall back on instead of stalling.
  push(
    "sing:short",
    "sing",
    `${MIN_NOTES}-note opening phrase`,
    staircase(MIN_NOTES, tick - 1),
    policy.beatCeilMs,
    (settled, complexity) => {
      proposalScore(proposals, "sing:short", 8);
      return `${MIN_NOTES} notes at the ${policy.beatCeilMs} ms ceiling · admits ${settled.answerable} · c${complexity.toFixed(2)} · fairness floor`;
    },
  );

  // Repeating teaches instead of escalating, so it is worth little while the
  // gauge is low and a great deal near the top of it.
  if (view.notes.length > 0) {
    push("repeat", "repeat", `the same ${melodyOf(view.notes).length}-note melody again`, view.notes.map(note => ({ ...note })), tempo.beatMs, (settled, complexity) => {
      const score = 14 + brink * 40;
      proposalScore(proposals, "repeat", score);
      return `c${complexity.toFixed(2)} · 14 base${brink > 0 ? ` +${round1(brink * 40)} brink mercy at ${Math.round(view.temptation)}%` : ""} · admits ${settled.answerable}`;
    });
  }

  const candidates: Candidate[] = proposals.map(proposal => ({
    action: proposal.id,
    score: round1(proposal.score),
    note: proposal.note,
  }));
  // Holding is the floor. It wins only when fairness removed everything else.
  candidates.push({ action: "hold", score: 5, note: "issue nothing and ask again" });

  ai.stats.nodesExplored += proposals.length;
  logEvent(ai, view.at, "evaluate", candidates.map(c => `${c.action} ${c.score}`).join("  "));

  // ---- Stage 4: decide ---------------------------------------------------
  const winner = argmax(candidates);
  const chosen = proposals.find(proposal => proposal.id === winner.action);
  const withheld = proposals.filter(proposal => proposal.withheld);
  const withheldNote =
    withheld.length > 0
      ? ` ${withheld.length} of ${proposals.length} melodies were withheld because the reply window they would open does not admit the notes they ask for.`
      : "";

  if (!chosen || chosen.withheld) {
    commitDecision(ai, view.at, {
      algorithm,
      state: "observing",
      observations,
      memory: memoryReadings(model, policy, tempo, adaptationNote),
      candidates,
      selectedAction: "Hold — no melody issued",
      selectedCandidate: "hold",
      reason:
        withheld.length > 0
          ? `Every melody scored was withheld: at your measured pace of ${Math.round(perNoteMs)} ms per note, none of them opens a reply window that admits the notes it asks for.${withheldNote} The Sirens wait rather than ask for something unanswerable.`
          : "No melody outscored holding. The Sirens wait a moment longer.",
    });
    ai.committed = null;
    ai.commitRemaining = 0;
    return { kind: "hold", retryMs: policy.retryMs };
  }

  const listenMs = listenWindowMs(chosen.notes, chosen.beatMs);
  const replyMs = replyWindowMs(chosen.notes, chosen.beatMs);
  const asks = melodyOf(chosen.notes).length;
  const forecast = policy.weighted ? missForecast(model, chosen.notes) : null;
  const grounded = forecast?.grounded === true && forecast.anyMiss !== null;
  const confidence = grounded ? clamp01(forecast.anyMiss as number) : undefined;

  const windowSentence = `Sung at ${chosen.beatMs} ms per note: ${ms(listenMs)} of listening, then a ${ms(replyMs)} reply window, which admits ${chosen.answerable} taps against the ${asks} asked.`;

  const reason = grounded
    ? `${noteName(weakest as number)} is the lane you have answered worst (${records[weakest as number].missed} of ${records[weakest as number].asked} missed), and this ${chosen.label} scored highest on the model's own forecast: ${forecast?.expectedMisses?.toFixed(2)} expected misses of ${asks} (${pct(forecast?.expectedShare ?? 0)}), complexity ${chosen.complexity.toFixed(2)}. ${windowSentence}${withheldNote}`
    : policy.weighted
      ? `${adaptationNote}, so the weighting had nothing to weight with and complexity alone decided: this ${chosen.label} measured ${chosen.complexity.toFixed(2)} against the round-${view.round} target of ${complexityTarget.toFixed(2)}, and differs from the melody just played. ${windowSentence}${withheldNote}`
      : policy.varied
        ? `Round ${view.round} targets complexity ${complexityTarget.toFixed(2)}; this ${chosen.label} measured ${chosen.complexity.toFixed(2)}, the closest of ${proposals.length} melodies scored, and changes ${pct(laneNovelty(chosen.notes, view.notes))} of the positions from the melody just played. Your per-lane record is not read on this difficulty. ${windowSentence}${withheldNote}`
        : `Fixed rotation step ${((tick - 1) % NOTE_NAMES.length) + 1} sings ${noteLine(chosen.notes)}. No player history is consulted on this difficulty and the tempo stays at ${chosen.beatMs} ms per note. ${windowSentence}`;

  const state: AIState = grounded ? "predicting" : policy.varied ? "evaluating" : "preparing";
  const decision = commitDecision(ai, view.at, {
    algorithm,
    state,
    observations,
    memory: memoryReadings(model, policy, tempo, adaptationNote),
    candidates,
    selectedAction:
      chosen.kind === "repeat"
        ? `Sing ${chosen.label} (complexity ${chosen.complexity.toFixed(2)})`
        : `Sing a ${chosen.label} at ${chosen.beatMs} ms (complexity ${chosen.complexity.toFixed(2)})`,
    selectedCandidate: chosen.id,
    ...(grounded && weakest !== null ? { target: `${noteName(weakest)} lane` } : {}),
    ...(confidence === undefined ? {} : { confidence }),
    reason,
    // The listen phase is the telegraph: the melody is heard in full before any
    // answer is asked for, and neither the notes nor the tempo move inside it.
    commitMs: listenMs,
    // `escapes` is the taps the reply window admits and `actionFree` the spare
    // ones beyond the melody's length — the shared contract's field names, read
    // in this encounter's terms.
    safety: { escapes: chosen.answerable, actionFree: Math.max(0, chosen.answerable - asks) },
  });
  ai.committed = decision;
  ai.commitRemaining = listenMs;
  ai.stats.attacks++;
  if (confidence !== undefined) ai.stats.predictions++;
  logEvent(
    ai,
    view.at,
    "telegraph",
    `Singing ${noteLine(chosen.notes)} — locked for ${ms(listenMs)} at ${chosen.beatMs} ms per note`,
    decision.id,
  );

  const payload = {
    notes: chosen.notes.map(note => ({ ...note })),
    beatMs: chosen.beatMs,
    listenMs: Math.round(listenMs),
    replyMs: Math.round(replyMs),
    answerableNotes: chosen.answerable,
    complexity: chosen.complexity,
    decisionId: decision.id,
  };
  return chosen.kind === "repeat" ? { kind: "repeat", ...payload } : { kind: "sing", ...payload };
}

/** Write a score into a proposal already pushed, keyed by its candidate id. */
function proposalScore(proposals: Proposal[], id: string, score: number) {
  const proposal = proposals.find(entry => entry.id === id);
  if (proposal && !proposal.withheld) proposal.score = score;
}

/**
 * Stage 6. Called once a reply resolves, whether it was completed or ran out.
 *
 * Every sung note is folded in as an answer or a failure, which is what gives
 * the per-lane accuracy its denominator; the engine's `laneMisses` counts the
 * same events, so the two stay in step. Notes the player never reached count as
 * failures, matching how the engine scores a timed-out reply.
 *
 * `replyMs` is the time from the reply window opening to the last tap. Divided
 * by the notes answered it is the measured per-note pace, and that one number
 * is what the hard tier's tempo adaptation and the answerable bound both read.
 */
export function learnFromEcho(
  ai: AIRuntime,
  model: PlayerModel,
  at: number,
  decisionId: string,
  melody: SirenNote[],
  entered: number[],
  replyMs?: number,
) {
  const sung = melodyOf(melody);
  let missed = 0;
  sung.forEach((note, i) => {
    const answered = entered[i] === note.lane;
    if (!answered) missed++;
    observeResolution(model, note.lane, answered);
  });
  for (const lane of entered) observeChoice(model, lane);
  if (replyMs !== undefined && Number.isFinite(replyMs) && entered.length > 0) {
    observeReaction(model, replyMs / entered.length);
  }

  const forecast = ai.decisions.find(d => d.id === decisionId)?.confidence;
  const decision: AIDecision | undefined = ai.decisions.find(d => d.id === decisionId);
  if (decision && !decision.outcome) {
    const timedOut = entered.length < sung.length;
    decision.outcome = timedOut ? "expired" : missed > 0 ? "hit" : "dodged";
    decision.outcomeNote = timedOut
      ? `${entered.length} of ${sung.length} notes answered before the window closed; ${missed} counted as missed`
      : missed > 0
        ? `${missed} of ${sung.length} notes missed`
        : `all ${sung.length} notes echoed correctly`;
    if (missed > 0) ai.stats.attacksLanded++;
    // A forecast of P(at least one miss) is scored on its direction: it was
    // right when it leaned the way the round actually went. That is the only
    // claim a single round can settle, and the inspector reports it as such.
    if (forecast !== undefined && (forecast >= 0.5) === (missed > 0)) ai.stats.predictionsCorrect++;
  }

  ai.state = "adapting";
  const records = laneRecords(model);
  logEvent(
    ai,
    at,
    "learn",
    `${missed > 0 ? `${missed} note${missed === 1 ? "" : "s"} missed` : "Clean echo"} — per-lane record now ${records
      .map(record => (record.asked === 0 ? `${noteName(record.lane)} 0/0` : `${noteName(record.lane)} ${record.answered}/${record.asked}`))
      .join(" · ")}`,
    decisionId,
  );
}
