import type { Difficulty, TrialId } from "./arcade.ts";
import type { GameState } from "./arcade-runtime.ts";
import type { Speaker } from "./rivals.ts";

/// Live commentary is derived from game events, never the other way round: the
// engine owns every number, the model only puts words to facts it is handed.
// Every moment carries what just happened, in the engine's own words, so the
// line can be about the sailor, the boulder or the axe count rather than a
// generic cheer.
export const momentKinds = ["start", "score", "streak", "hit", "miss", "danger", "progress", "rival", "win", "loss"] as const;
export type MomentKind = (typeof momentKinds)[number];
export type Moment = { kind: MomentKind; speaker: Speaker; priority: number; detail?: string };
export type CommentaryFacts = {
  score: number;
  hits: number;
  misses: number;
  streak: number;
  livesLeft: number | null;
  secondsLeft: number | null;
  progress: number;
  status: string;
  /** What just happened, in the engine's own words. */
  event?: string;
  /** The rival's score, in the two encounters scored head to head. */
  rivalScore?: number | null;
};
export type CommentaryRequest = {
  trialId: TrialId;
  difficulty: Difficulty;
  moment: MomentKind;
  speaker: Speaker;
  facts: CommentaryFacts;
  recent: string[];
};
export type CommentaryLine = {
  id: number;
  speaker: Speaker;
  text: string;
  moment: MomentKind;
  /** Game time of the moment the line is about, in ms. */
  at?: number;
  /** What happened, as handed to the model. */
  detail?: string;
  /** From request to reply, in ms. */
  latencyMs?: number;
};
/** One thing that happened in a round, kept for the results screen whether or not a line was said about it. */
export type RoundEvent = { at: number; kind: MomentKind; detail: string };

const speakerFor: Record<MomentKind, Speaker> = {
  start: "bard", score: "bard", streak: "bard", hit: "rival", miss: "rival",
  danger: "rival", progress: "bard", rival: "rival", win: "bard", loss: "rival",
};
const priorityFor: Record<MomentKind, number> = {
  start: 3, score: 1, streak: 1, hit: 2, miss: 2, danger: 2, progress: 2, rival: 2, win: 3, loss: 3,
};
const tidy = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 200);
export const moment = (kind: MomentKind, detail?: string): Moment => ({ kind, speaker: speakerFor[kind], priority: priorityFor[kind], ...(detail && tidy(detail) ? { detail: tidy(detail) } : {}) });

/** 0..1 progress through the encounter, from whichever measure the engine keeps. */
export function progressOf(s: GameState): number {
  const value =
    "rescued" in s
      ? (s as { rescued: number }).rescued / 3
      : "duration" in s && typeof s.duration === "number" && s.duration > 0
        ? s.elapsed / s.duration
        : 0;
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

// The runner and the adventure encounters end on the third hit.
const livesOf = (s: GameState) => ("invulnerable" in s ? Math.max(0, 3 - s.hits) : null);
const headToHead = (s: GameState) => s.id === "bow" || s.id === "circe";

export function factsFor(s: GameState, status: string, event = ""): CommentaryFacts {
  const timed = "duration" in s && typeof s.duration === "number" ? s.duration : null;
  return {
    score: Math.max(0, Math.round(s.score)),
    hits: s.hits,
    misses: s.misses,
    streak: s.combo,
    livesLeft: livesOf(s),
    secondsLeft: timed === null ? null : Math.max(0, Math.ceil((timed - s.elapsed) / 1000)),
    progress: Math.round(progressOf(s) * 100),
    status: status.replace(/\s+/g, " ").trim().slice(0, 160),
    event: tidy(event),
    rivalScore: headToHead(s) ? Math.max(0, Math.round(s.rivalScore)) : null,
  };
}

// Reads one field the engine keeps, whichever encounter it belongs to.
const field = (s: GameState, key: string): unknown => (s as unknown as Record<string, unknown>)[key];
const num = (s: GameState, key: string): number => {
  const v = field(s, key);
  return typeof v === "number" ? v : Array.isArray(v) ? v.length : 0;
};
const str = (s: GameState, key: string): string => {
  const v = field(s, key);
  return typeof v === "string" ? v : "";
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ZONES: Record<string, string> = { cave: "the narrow passage", collapse: "the collapsing hall", daylight: "the run to daylight" };

/**
 * The most important thing that changed between two commits, if anything did,
 * with what happened in the engine's own words. A loss of life or a finish
 * comes first, then each encounter's own events, then the shared counters.
 */
export function detectMoment(prev: GameState, next: GameState): Moment | null {
  const said = str(next, "feedback") !== str(prev, "feedback") ? str(next, "feedback") : "";
  if (next.done && !prev.done) return moment(next.won ? "win" : "loss", next.feedback);
  if (next.hits > prev.hits) return moment("hit", said || `Odysseus is struck: ${plural(next.hits, "hit")} taken.`);

  if (next.id === "bow") {
    const mine = num(next, "shots"), his = num(next, "rivalShots");
    const score = `Odysseus ${next.score}, Antinous ${next.rivalScore}.`;
    if (mine > num(prev, "shots")) {
      const rings = (field(next, "shots") as number[])[mine - 1];
      const detail = `Odysseus' arrow ${mine} threads ${rings} of 12 axes. ${score}`;
      // The bard sings any honest arrow; the suitor only gets to sneer at a poor one.
      return moment(rings >= 12 ? "streak" : rings >= 5 ? "score" : "miss", detail);
    }
    if (his > num(prev, "rivalShots")) return moment("rival", `${next.rivalLine} ${score}`);
  }
  if (next.id === "circe" && next.rivalScore - prev.rivalScore >= 30) return moment("rival", `${next.rivalLine} Circe ${next.rivalScore}, Odysseus ${next.score}.`);
  if (next.misses > prev.misses) return moment("miss", said || `A miss: ${plural(next.misses, "miss")} so far.`);
  if ("cyclops" in next && "cyclops" in prev) {
    const gap = (s: GameState) => (s as unknown as { cyclops: { gap: number } }).cyclops.gap;
    if (gap(next) < 26 && gap(prev) >= 26) return moment("danger", `Polyphemus closes in: the chase gap is down to ${Math.round(gap(next))} m.`);
  }

  // Each encounter's own milestones.
  if (num(next, "rescued") > num(prev, "rescued")) return moment("progress", said || `${num(next, "rescued")} of 3 sailors are safe aboard.`);
  if (next.id === "lotus" && field(next, "carrying") === true && field(prev, "carrying") !== true) return moment("score", "Odysseus reaches a dazed sailor and leads him toward the ship.");
  if (num(next, "relicsFound") > num(prev, "relicsFound")) return moment("score", said || `Relic ${num(next, "relicsFound")} of 3 recovered.`);
  if (num(next, "sheepSaved") > num(prev, "sheepSaved")) return moment("score", said || "A sheep falls in beside Odysseus: one life restored.");
  if (str(next, "zone") && str(prev, "zone") && str(next, "zone") !== str(prev, "zone")) return moment("progress", `The run enters ${ZONES[str(next, "zone")] ?? str(next, "zone")}.`);
  if (next.id === "cyclops" && num(next, "precision") > num(prev, "precision")) return moment("score", said || "A precise escape.");
  if (next.id === "aeolus" && num(next, "perfectPasses") > num(prev, "perfectPasses")) return moment("score", said || "A perfect passage through the wind gate.");
  if (next.id === "calypso" && num(next, "progress") > num(prev, "progress")) return moment("progress", `${said || "A safe shore."} ${plural(num(next, "progress"), "shore")} reached.`);
  if (next.id === "calypso" && num(next, "wood") > num(prev, "wood")) return moment("score", said || "Driftwood secured.");
  if (next.id === "sirens" && next.successes > prev.successes) return moment("score", `Melody ${next.successes} echoed back cleanly. Temptation ${Math.round(num(next, "temptation"))}%.`);
  if (next.id === "circe" && num(next, "chains") > num(prev, "chains") && num(next, "chains") > 1) return moment("score", `Odysseus brews a ${num(next, "chains")}-chain reaction. Odysseus ${next.score}, Circe ${next.rivalScore}.`);
  if (next.id === "scylla" && next.successes > prev.successes && /perfect/i.test(said)) return moment("score", said);

  if (next.combo > prev.combo && next.combo >= 3 && next.combo % 3 === 0) return moment("streak", `${plural(next.combo, "success")} in a row.`);
  const before = progressOf(prev), after = progressOf(next);
  const mark = [0.25, 0.5, 0.75].find(m => before < m && after >= m);
  if (mark) return moment("progress", `${Math.round(mark * 100)}% of the way through.`);
  if (next.score - prev.score >= 100) {
    const gain = Math.round(next.score - prev.score), total = Math.round(next.score);
    return moment("score", said || (next.id === "cyclops" ? `Odysseus slips past a hazard untouched: ${total} points now.` : `Odysseus gains ${gain} points: ${total} in all.`));
  }
  return null;
}

/** Strip anything a narrator should not say aloud: markup, links, stray quotes. */
export function cleanLine(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`~<>[\]{}|]/g, "")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type DirectorOptions = {
  trialId: TrialId;
  difficulty: Difficulty;
  onLine: (line: CommentaryLine) => void;
  fetcher?: Fetcher;
  now?: () => number;
  minGapMs?: number;
  staleMs?: number;
};

/** One commentary line, or "" when the model is unavailable or answers badly. */
export async function requestLine(body: CommentaryRequest, signal?: AbortSignal, fetcher: Fetcher = (input, init) => fetch(input, init)) {
  const response = await fetcher("/api/commentary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(28000)]) : AbortSignal.timeout(28000),
  });
  const data = (await response.json()) as { line?: unknown };
  return response.ok && typeof data.line === "string" ? cleanLine(data.line) : "";
}

/**
 * Paces commentary so it reads like a broadcast rather than a firehose: one
 * request in flight, a minimum gap between lines, the most important pending
 * moment wins, and a line that arrives too late to match the action is dropped.
 */
export class CommentaryDirector {
  private inFlight = false;
  private lastAt = -Infinity;
  private pending: { moment: Moment; at: number; state: GameState; status: string } | null = null;
  private recent: string[] = [];
  private id = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private readonly options: DirectorOptions;

  constructor(options: DirectorOptions) { this.options = options; }

  private now() { return this.options.now ? this.options.now() : performance.now(); }

  offer(m: Moment, state: GameState, status: string) {
    if (this.stopped) return;
    if (this.pending && this.pending.moment.priority > m.priority) return;
    this.pending = { moment: m, at: this.now(), state, status };
    this.schedule();
  }

  /** A line said outside the director (the prefetched opening) still counts as recent. */
  remember(text: string) { this.recent = [...this.recent, text].slice(-4); }

  /** Pausing drops what was waiting; nothing is said over a pause menu. */
  hold() {
    this.pending = null;
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose() { this.stopped = true; this.hold(); }

  private schedule() {
    if (this.inFlight || this.timer || !this.pending) return;
    const gap = this.options.minGapMs ?? 6500;
    const wait = Math.max(0, this.lastAt + (this.pending.moment.priority >= 3 ? gap / 2 : gap) - this.now());
    this.timer = setTimeout(() => { this.timer = null; void this.send(); }, wait);
  }

  private async send() {
    const job = this.pending;
    if (!job || this.stopped) return;
    this.pending = null;
    if (this.now() - job.at > (this.options.staleMs ?? 5000) && job.moment.priority < 3) { this.schedule(); return; }
    this.inFlight = true;
    this.lastAt = this.now();
    const sent = this.now();
    const controller = new AbortController();
    this.controller = controller;
    const body: CommentaryRequest = {
      trialId: this.options.trialId,
      difficulty: this.options.difficulty,
      moment: job.moment.kind,
      speaker: job.moment.speaker,
      facts: factsFor(job.state, job.status, job.moment.detail),
      recent: this.recent.slice(-3),
    };
    try {
      const text = await requestLine(body, controller.signal, this.options.fetcher);
      // A line about a hit that lands eight seconds later describes the past.
      const late = this.now() - job.at > (this.options.staleMs ?? 5000) + 4000 && job.moment.priority < 3;
      if (text && !late && !this.stopped && !controller.signal.aborted) {
        this.recent = [...this.recent, text].slice(-4);
        this.options.onLine({
          id: ++this.id, speaker: job.moment.speaker, text, moment: job.moment.kind,
          at: Math.round(job.state.elapsed), latencyMs: Math.round(this.now() - sent),
          ...(job.moment.detail ? { detail: job.moment.detail } : {}),
        });
      }
    } catch {
      /* Commentary is decoration; a failed line is simply not said. */
    } finally {
      this.inFlight = false;
      if (this.controller === controller) this.controller = null;
      this.schedule();
    }
  }
}
