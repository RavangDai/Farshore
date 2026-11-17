// The round report on the results screen: how the round was won or lost, in
// the engine's own numbers, and where the AI took part. Nothing here asks a
// model anything; it only arranges what the round already recorded.

import { medalFor, type TrialId } from "./arcade.ts";
import { gameSummary, isAdventure, isBow, isCave, isSong, type GameState } from "./arcade-runtime.ts";
import { debriefFacts } from "./debrief.ts";
import type { CommentaryLine, MomentKind, RoundEvent } from "./commentary.ts";

/** Everything a round recorded for its report: what happened, and what was said about it. */
export type RoundLog = { events: RoundEvent[]; lines: CommentaryLine[] };
export const emptyLog = (): RoundLog => ({ events: [], lines: [] });
/** How many events and lines a round keeps. A long duel produces hundreds; the report needs the story. */
export const LOG_LIMIT = { events: 60, lines: 30 };

/** Adds an event, dropping the least important when the log is full so wins, losses and hits survive. */
export function logEvent(log: RoundLog, event: RoundEvent): RoundLog {
  const events = [...log.events, event];
  if (events.length > LOG_LIMIT.events) {
    const weakest = events.findIndex(e => e.kind === "score" || e.kind === "streak" || e.kind === "progress");
    events.splice(weakest >= 0 ? weakest : 0, 1);
  }
  return { ...log, events };
}
export const logLine = (log: RoundLog, line: CommentaryLine): RoundLog => ({ ...log, lines: [...log.lines, line].slice(-LOG_LIMIT.lines) });

export type StatRow = { label: string; value: string };

export const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const of = (n: number, total: number) => `${n} of ${total}`;
const row = (label: string, value: string | number): StatRow => ({ label, value: String(value) });

/** The numbers that decided this round, encounter by encounter. */
export function roundStats(s: GameState): StatRow[] {
  const rows: StatRow[] = [];
  if (isCave(s)) {
    rows.push(row("Way to daylight", `${Math.round(Math.min(1, s.elapsed / Math.max(1, s.duration)) * 100)}%`), row("Distance run", `${Math.round(s.distance)} m`), row("Precise escapes", s.precision));
  } else if (isAdventure(s)) {
    if (s.id === "lotus") rows.push(row("Sailors rescued", of(s.rescued, s.practice ? 1 : 3)), row("Relics found", of(s.relicsFound, 3)), row("Times caught", s.hits));
    if (s.id === "aeolus") rows.push(row("Perfect gates", s.perfectPasses), row("Blessings caught", s.blessings), row("Hull damage", s.hits));
    if (s.id === "calypso") rows.push(row("Shores reached", s.progress), row("Driftwood gathered", s.wood), row("Falls and strikes", s.hits));
    if (s.id === "cyclops") rows.push(row("Precise escapes", s.precision), row("Hits taken", s.hits));
  } else if (s.id === "circe") {
    rows.push(row("Your brew", s.score), row("Circe's brew", s.rivalScore), row("Best chain", s.chains), row("Potions matched", s.successes));
  } else if (s.id === "scylla") {
    rows.push(row("Heads deflected", s.successes), row("Hull strikes", of(s.hits, 5)));
  }
  const facts = debriefFacts(s);
  if (facts) for (const [label, value] of Object.entries(facts)) if (label !== "questions to Athena" || Number(value) > 0) rows.push(row(label.replace(/^./, c => c.toUpperCase()), value));
  if (isBow(s)) rows.push(row("Perfect arrows", s.shots.filter(n => n >= 12).length));
  rows.push(row("Best streak", s.bestCombo), row("Time", clock(s.elapsed)));
  return rows;
}

/** How the medal was decided, in the words the player can check against the stats. */
export function medalRule(s: GameState): string {
  const summary = gameSummary(s), slips = summary.hits + summary.misses;
  if (s.practice) return "Practice rounds earn no medal.";
  if (!s.won) return "A medal needs a win.";
  const medal = medalFor(summary);
  return `${slips} slip${slips === 1 ? "" : "s"} (${summary.hits} hit${summary.hits === 1 ? "" : "s"}, ${summary.misses} miss${summary.misses === 1 ? "" : "es"}): gold needs none, silver two or fewer, so ${medal}.`;
}

/** One sentence of the round's facts, handed to the model for the closing recap. */
export function roundHighlights(s: GameState): string {
  const stats = roundStats(s).filter(r => r.label !== "Time" && r.label !== "Best streak").slice(0, 4);
  const said = stats.map(r => `${r.label.toLowerCase()} ${r.value}`).join("; ");
  return `${s.won ? "Won" : "Lost"} in ${clock(s.elapsed)}. ${said}.`.slice(0, 200);
}

export type TimelineEntry = { at: number; kind: MomentKind; detail: string; line?: CommentaryLine };

/**
 * The round's story in order: each event, with the line said about it when
 * there was one. A line is matched to the event it was written for (same
 * moment and game time); the opening line, which has no event, leads.
 */
export function timeline(log: RoundLog): TimelineEntry[] {
  const lines = [...log.lines];
  const take = (e: RoundEvent) => {
    const i = lines.findIndex(l => l.moment === e.kind && l.at !== undefined && Math.abs(l.at - e.at) < 50);
    return i >= 0 ? lines.splice(i, 1)[0] : undefined;
  };
  const entries: TimelineEntry[] = log.events.map(e => ({ ...e, line: take(e) }));
  for (const l of lines) entries.push({ at: l.at ?? 0, kind: l.moment, detail: l.detail ?? "", line: l });
  return entries.sort((a, b) => a.at - b.at);
}

/** Commentary totals for the AI section of the report. */
export function commentaryStats(lines: CommentaryLine[]) {
  const timed = lines.map(l => l.latencyMs).filter((n): n is number => typeof n === "number").sort((a, b) => a - b);
  return {
    total: lines.length,
    bard: lines.filter(l => l.speaker === "bard").length,
    rival: lines.filter(l => l.speaker === "rival").length,
    medianMs: timed.length ? timed[Math.floor(timed.length / 2)] : null,
  };
}

/** The rival's in-play choices, for the encounters whose rules weigh a menu of moves. */
export function rivalChoices(s: GameState): number {
  return isBow(s) || isSong(s) || isCave(s) ? s.ai.decisions.filter(d => d.chooser).length : 0;
}

/** What the player answered at the Oracle before this trial. */
export type OracleAttempt = {
  trial: TrialId;
  question: string;
  picked: string;
  answer: string;
  correct: boolean;
  evidence: string;
  ref: string;
  model: string;
  ms: number;
  retrieval: string;
  mock: boolean;
};
