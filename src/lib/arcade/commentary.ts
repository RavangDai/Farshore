import type { Difficulty, TrialId } from "./arcade.ts";
import type { GameState } from "./arcade-runtime.ts";
import type { Speaker } from "./rivals.ts";

// Live commentary is derived from game events, never the other way round: the
// engine owns every number, the model only puts words to facts it is handed.
export const momentKinds = ["start", "score", "streak", "hit", "miss", "danger", "progress", "win", "loss"] as const;
export type MomentKind = (typeof momentKinds)[number];
export type Moment = { kind: MomentKind; speaker: Speaker; priority: number };
export type CommentaryFacts = {
  score: number;
  hits: number;
  misses: number;
  streak: number;
  livesLeft: number | null;
  secondsLeft: number | null;
  progress: number;
  status: string;
};
export type CommentaryRequest = {
  trialId: TrialId;
  difficulty: Difficulty;
  moment: MomentKind;
  speaker: Speaker;
  facts: CommentaryFacts;
  recent: string[];
};
export type CommentaryLine = { id: number; speaker: Speaker; text: string; moment: MomentKind };

const speakerFor: Record<MomentKind, Speaker> = {
  start: "bard", score: "bard", streak: "bard", hit: "rival", miss: "rival",
  danger: "rival", progress: "bard", win: "bard", loss: "rival",
};
const priorityFor: Record<MomentKind, number> = {
  start: 3, score: 1, streak: 1, hit: 2, miss: 2, danger: 2, progress: 1, win: 3, loss: 3,
};
export const moment = (kind: MomentKind): Moment => ({ kind, speaker: speakerFor[kind], priority: priorityFor[kind] });

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

export function factsFor(s: GameState, status: string): CommentaryFacts {
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
  };
}

/** The most important thing that changed between two commits, if anything did. */
export function detectMoment(prev: GameState, next: GameState): Moment | null {
  if (next.done && !prev.done) return moment(next.won ? "win" : "loss");
  if (next.hits > prev.hits) return moment("hit");
  if (next.misses > prev.misses) return moment("miss");
  if ("cyclops" in next && "cyclops" in prev) {
    const gap = (s: GameState) => (s as unknown as { cyclops: { gap: number } }).cyclops.gap;
    if (gap(next) < 26 && gap(prev) >= 26) return moment("danger");
  }
  if (next.combo > prev.combo && next.combo >= 3 && next.combo % 3 === 0) return moment("streak");
  const before = progressOf(prev), after = progressOf(next);
  if ([0.25, 0.5, 0.75].some(mark => before < mark && after >= mark)) return moment("progress");
  if (next.score - prev.score >= 100) return moment("score");
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
    const controller = new AbortController();
    this.controller = controller;
    const body: CommentaryRequest = {
      trialId: this.options.trialId,
      difficulty: this.options.difficulty,
      moment: job.moment.kind,
      speaker: job.moment.speaker,
      facts: factsFor(job.state, job.status),
      recent: this.recent.slice(-3),
    };
    try {
      const text = await requestLine(body, controller.signal, this.options.fetcher);
      // A line about a hit that lands eight seconds later describes the past.
      const late = this.now() - job.at > (this.options.staleMs ?? 5000) + 4000 && job.moment.priority < 3;
      if (text && !late && !this.stopped && !controller.signal.aborted) {
        this.recent = [...this.recent, text].slice(-4);
        this.options.onLine({ id: ++this.id, speaker: job.moment.speaker, text, moment: job.moment.kind });
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
