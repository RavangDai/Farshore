"use client";
import { useState } from "react";
import { BookOpen, Check, Feather, KeyRound, ListOrdered, Loader2, Sparkles, Swords, Volume2, X } from "lucide-react";
import type { GameState } from "../../lib/arcade/arcade-runtime";
import type { MomentKind } from "../../lib/arcade/commentary";
import { clock, commentaryStats, medalRule, rivalChoices, roundStats, timeline, type OracleAttempt, type RoundLog } from "../../lib/arcade/report";

type Tab = "moments" | "stats" | "ai";
type Recap = { speaker: "bard" | "rival"; text: string } | "pending" | null;

const KIND_LABEL: Record<MomentKind, string> = {
  start: "Opening", score: "Good play", streak: "Streak", hit: "Hit", miss: "Miss", danger: "Danger",
  progress: "Milestone", rival: "Rival", win: "Victory", loss: "Defeat",
};
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * The results screen's account of the round: the moments that decided it (and
 * what the bard and the rival said about each), the numbers behind the medal,
 * and exactly where a model took part: the Oracle's question and the live
 * commentary. The rival itself plays by the game's rules.
 */
export function RoundReport({
  state,
  log,
  recap,
  bardName,
  rivalName,
  tactic,
  oracle,
  oracleOn,
  models,
  onSpeak,
}: {
  state: GameState;
  log: RoundLog;
  recap: Recap;
  bardName: string;
  rivalName: string;
  tactic: { label: string; reason: string } | null;
  oracle: OracleAttempt[];
  oracleOn: boolean;
  models: { commentary: string | null; oracle: string | null };
  onSpeak: (text: string, speaker: "bard" | "rival") => void;
}) {
  const [tab, setTab] = useState<Tab>("moments");
  const story = timeline(log), talk = commentaryStats(log.lines), choices = rivalChoices(state);
  const name = (speaker: "bard" | "rival") => (speaker === "bard" ? bardName : rivalName);
  const tabs: [Tab, string, typeof ListOrdered][] = [["moments", "Moments", ListOrdered], ["stats", "How it was scored", Sparkles], ["ai", "How the AI helped", Feather]];

  return (
    <section className="fs-report" aria-label="Round report">
      {recap === "pending" && <p className="fs-recap fs-recap-pending"><Loader2 size={15} className="fs-spin" /> The bard is composing the round&apos;s verse…</p>}
      {recap && recap !== "pending" && (
        <blockquote className="fs-recap" data-speaker={recap.speaker}>
          <span>{name(recap.speaker)}</span>
          <p>{recap.text}</p>
          <button className="a-text-btn" onClick={() => onSpeak(recap.text, recap.speaker)} aria-label={`Hear ${name(recap.speaker)} again`}><Volume2 size={13} /></button>
        </blockquote>
      )}
      <div className="fs-report-tabs" role="tablist" aria-label="Round report">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} role="tab" id={`fs-report-${id}`} aria-selected={tab === id} aria-controls="fs-report-panel" tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}
            onKeyDown={e => {
              const order = tabs.map(t => t[0]), i = order.indexOf(tab);
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const next = order[(i + (e.key === "ArrowRight" ? 1 : order.length - 1)) % order.length];
              setTab(next);
              (e.currentTarget.parentElement?.querySelector(`#fs-report-${next}`) as HTMLButtonElement | null)?.focus();
            }}>
            <Icon size={14} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div className="fs-report-panel" id="fs-report-panel" role="tabpanel" aria-labelledby={`fs-report-${tab}`} tabIndex={0}>
        {tab === "moments" && (story.length ? (
          <ol className="fs-report-timeline">
            {story.map((entry, i) => (
              <li key={i} data-kind={entry.kind}>
                <time>{clock(entry.at)}</time>
                <div>
                  <b>{KIND_LABEL[entry.kind]}</b>
                  {entry.detail && <span>{entry.detail}</span>}
                  {entry.line && <q data-speaker={entry.line.speaker}><i>{name(entry.line.speaker)}:</i> {entry.line.text}</q>}
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="fs-report-empty">This round ended before anything notable happened.</p>)}

        {tab === "stats" && (
          <>
            <dl className="fs-report-stats">
              {roundStats(state).map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
            </dl>
            <p className="fs-report-rule"><b>Medal.</b> {medalRule(state)}</p>
            <p className="fs-report-note">Every number here was measured by the game&apos;s own rules. No model sets a score, a hit or a medal.</p>
          </>
        )}

        {tab === "ai" && (
          <div className="fs-report-ai">
            <article>
              <h3><KeyRound size={15} /> The Oracle&apos;s question</h3>
              {oracle.length ? oracle.map((o, i) => (
                <div key={i} className="fs-report-oracle" data-correct={o.correct}>
                  <p className="fs-report-q">{o.question}</p>
                  <p>{o.correct ? <Check size={13} /> : <X size={13} />} You answered <b>{o.picked}</b>{o.correct ? "." : `; the answer was ${o.answer}.`}</p>
                  <figure><blockquote>{o.evidence}</blockquote><figcaption><BookOpen size={12} /> {o.ref}</figcaption></figure>
                  <small>{o.mock ? "Test mode: built without a model from the passage, then checked like any other." : `Written by ${o.model} in ${seconds(o.ms)} from passages found by ${o.retrieval}, then checked against the quote before you saw it.`}</small>
                </div>
              )) : <p className="fs-report-empty">{!oracleOn ? "The Oracle's key is off in Settings, so no question was asked." : state.practice ? "Practice skips the Oracle's question." : "No question this time: a retry keeps the key you already earned."}</p>}
            </article>
            <article>
              <h3><Feather size={15} /> Live commentary</h3>
              {talk.total ? (
                <p>{talk.total} line{talk.total === 1 ? "" : "s"} during play: {talk.bard} from {bardName}, {talk.rival} from {rivalName}{talk.medianMs !== null ? `, about ${seconds(talk.medianMs)} from event to line` : ""}.</p>
              ) : <p>No lines were spoken during play{models.commentary ? "" : ": no model was connected"}.</p>}
              <p className="fs-report-note">The game spots each moment and hands {models.commentary ?? "the model"} what happened, in its own words, with the score. The model only chooses the words; the Moments tab shows every event beside the line written for it.</p>
            </article>
            <article>
              <h3><Swords size={15} /> The rival</h3>
              {tactic && <p><b>{tactic.label}.</b> {tactic.reason}</p>}
              <p className="fs-report-note">The tactic is chosen by the game from your last attempts, not by a model.{choices ? ` In play, ${rivalName} weighed ${choices} move${choices === 1 ? "" : "s"} by its own rules and played the best-scored each time.` : ""}</p>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}
