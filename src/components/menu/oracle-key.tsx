"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, KeyRound, Loader2, RefreshCw, Search, ShieldCheck, Shuffle, Sparkles, X } from "lucide-react";
import type { OracleQuestion, OracleState } from "../../lib/ai/oracle";

/**
 * The Oracle's Key: the question that opens an encounter.
 *
 * Shows the question and its four options. Once the player answers, it shows
 * the verdict, the explanation and the quoted passage from the Odyssey, and
 * offers the way in (or another question). "How the Oracle chose this
 * question" lays out the retrieval-augmented generation behind it: the search
 * and the passages it ranked, the model that wrote the question, every check
 * the server made, and the shuffle.
 */

type Props = {
  trialTitle: string;
  state: OracleState;
  onSolved: () => void;
  /** Every answer, right or wrong, for the round report. */
  onAnswer?: (item: OracleQuestion, picked: number) => void;
  onEnter: () => void;
  onAgain: () => void;
  onClose: (answeredWrong: boolean) => void;
};

const LETTERS = ["A", "B", "C", "D"];
const pct = (v: number | null) => (v === null ? "—" : v.toFixed(2));

/** The passage with the quoted evidence marked, when it can be found as written. */
function Passage({ item }: { item: OracleQuestion }) {
  const text = item.source.text, at = text.toLowerCase().indexOf(item.evidence.toLowerCase().replace(/^[“"]|[”"]$/g, ""));
  if (at < 0) return <p className="fs-oracle-passage">{text}</p>;
  const end = at + item.evidence.replace(/^[“"]|[”"]$/g, "").length;
  return <p className="fs-oracle-passage">{text.slice(0, at)}<mark>{text.slice(at, end)}</mark>{text.slice(end)}</p>;
}

function Inspector({ item }: { item: OracleQuestion }) {
  const r = item.retrieval, used = new Map(r.chosen.map(c => [c.id, c.label]));
  const pool = item.source.kind === "lore" ? "the trial's book and the game's notes" : "the trial's book of the Odyssey and the game's notes";
  return (
    <details className="fs-oracle-inspector">
      <summary><Sparkles size={15} /> How the Oracle chose this question</summary>
      <ol className="fs-oracle-steps">
        <li>
          <h3><Search size={14} /> Retrieve</h3>
          <p>Query: <q>{r.query}</q></p>
          <p className="fs-oracle-small">
            {r.mode === "hybrid"
              ? `Ranked by meaning (${r.embedder} embeddings, ${Math.round(r.weights.semantic * 100)}%) and by words (BM25, ${Math.round(r.weights.keyword * 100)}%)`
              : r.note ?? "Ranked by words only (BM25): no embedding service is connected"}
            {` across ${r.pool} passages of ${pool} in ${r.ms} ms. `}
            {r.index.builtMs !== null && `Index of ${r.index.passages} passages ${r.index.cached ? "loaded from cache" : `built in ${(r.index.builtMs / 1000).toFixed(1)} s`}.`}
          </p>
          <table className="fs-oracle-table">
            <thead><tr><th scope="col">Passage</th><th scope="col">Meaning</th><th scope="col">Words</th><th scope="col">Score</th><th scope="col">Used</th></tr></thead>
            <tbody>
              {r.candidates.map(c => (
                <tr key={c.id} data-used={used.has(c.id) || undefined} data-source={c.id === item.source.id || undefined}>
                  <th scope="row">{c.ref}</th><td>{pct(c.semantic)}</td><td>{pct(c.keyword)}</td><td>{pct(c.score)}</td>
                  <td>{used.get(c.id) ?? ""}{c.id === item.source.id ? " ★" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fs-oracle-small">The best six are kept; two are drawn from them by score, so the question changes each time. ★ is the passage the question came from.</p>
        </li>
        <li>
          <h3><Sparkles size={14} /> Generate</h3>
          <p className="fs-oracle-small">{item.mock
            ? "Test mode: no model was asked. The question was made by blanking one word of a line from P1, then checked like any other."
            : `${item.generation.model} wrote the question from ${r.chosen.map(c => c.label).join(" and ")} only, as JSON in a fixed schema, in ${(item.generation.ms / 1000).toFixed(1)} s (temperature ${item.generation.temperature}).`}</p>
          {item.generation.rejected?.map(x => <p key={x.attempt} className="fs-oracle-small fs-oracle-rejected"><X size={12} /> Attempt {x.attempt} set aside: {x.failed.join("; ")}.</p>)}
        </li>
        <li>
          <h3><ShieldCheck size={14} /> Verify</h3>
          <ul className="fs-oracle-checks">
            {item.checks.map(c => <li key={c.id} data-ok={c.ok}>{c.ok ? <Check size={13} /> : <X size={13} />} <b>{c.label}</b> <span>{c.detail}</span></li>)}
          </ul>
        </li>
        <li>
          <h3><Shuffle size={14} /> Shuffle</h3>
          <p className="fs-oracle-small">The server shuffled the four options. The order the model wrote them in is never shown.</p>
        </li>
      </ol>
      <p className="fs-oracle-small fs-oracle-corpus">Knowledge base: {item.corpus.work}, translated by {item.corpus.translator}, Project Gutenberg eBook {item.corpus.gutenberg}, plus the game&apos;s own episode notes: {item.corpus.passages} passages in all.</p>
    </details>
  );
}

export function OracleKey({ trialTitle, state, onSolved, onAnswer, onEnter, onAgain, onClose }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const root = useRef<HTMLElement>(null);
  const item = state.status === "ready" ? state.item : null;
  const correct = item !== null && picked === item.answer;

  useEffect(() => { setPicked(null); }, [item?.id]);
  useEffect(() => {
    if (state.status !== "loading") return;
    const tick = () => setElapsed(Math.floor((Date.now() - state.started) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state]);
  // Focus follows the state: the first option, then the way forward.
  useEffect(() => { root.current?.querySelector<HTMLButtonElement>(picked === null ? ".fs-oracle-option, .fs-oracle-actions button" : ".fs-oracle-actions button")?.focus(); }, [state.status, item?.id, picked]);

  function pick(i: number) {
    if (!item || picked !== null) return;
    setPicked(i);
    onAnswer?.(item, i);
    if (i === item.answer) onSolved();
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!item || picked !== null || (e.target as HTMLElement).closest("summary")) return;
      const i = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (i >= 0 && e.key.length === 1) { e.preventDefault(); pick(i); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const close = () => onClose(item !== null && picked !== null && !correct);
  return (
    <div className="a-modal-backdrop fs-oracle-backdrop">
      <section ref={root} className="a-modal a-paper fs-oracle" role="dialog" aria-modal="true" aria-labelledby="fs-oracle-title" data-state={state.status} data-verdict={picked === null ? undefined : correct ? "correct" : "wrong"}>
        <div className="fs-oracle-head">
          <span className="a-eyebrow"><KeyRound size={13} /> The Oracle&apos;s key · {trialTitle}</span>
          <button className="a-btn a-small" onClick={close}>Briefing</button>
        </div>
        {state.status === "loading" && (
          <div className="fs-oracle-wait" role="status" aria-live="polite">
            <Loader2 size={22} className="fs-spin" />
            <h2 id="fs-oracle-title">The Oracle consults the Odyssey…</h2>
            <p className="fs-oracle-small">A question from Homer&apos;s own words · {elapsed} s{elapsed > 20 ? " · this can take a minute" : ""}</p>
          </div>
        )}
        {state.status === "error" && (
          <div className="fs-oracle-wait" role="alert">
            <h2 id="fs-oracle-title">The Oracle is silent</h2>
            <p>{state.error}</p>
            <div className="fs-oracle-actions"><button className="a-btn a-primary fs-rich" onClick={onAgain}><RefreshCw size={16} /><span><b>New question</b></span></button></div>
          </div>
        )}
        {item && (
          <>
            <h2 id="fs-oracle-title">{item.question}</h2>
            <div className="fs-oracle-options" role="group" aria-label="Choose an answer">
              {item.options.map((o, i) => (
                <button
                  key={i}
                  className="fs-oracle-option"
                  data-state={picked === null ? undefined : i === item.answer ? "answer" : i === picked ? "wrong" : "other"}
                  aria-pressed={picked === i}
                  disabled={picked !== null}
                  onClick={() => pick(i)}
                >
                  <kbd>{LETTERS[i]}</kbd><span>{o}</span>
                </button>
              ))}
            </div>
            {picked !== null && (
              <div className="fs-oracle-verdict" aria-live="assertive">
                <strong>{correct ? "The gate opens." : `Not so. The answer was ${LETTERS[item.answer]}.`}</strong>
                <p>{item.explanation}</p>
                <figure className="fs-oracle-source">
                  <blockquote>{item.evidence}</blockquote>
                  <figcaption><BookOpen size={13} /> {item.source.kind === "odyssey" ? `Homer, Odyssey, ${item.source.ref} (Butler)` : item.source.ref} · <a href={item.source.url} target="_blank" rel="noreferrer">Read the book</a></figcaption>
                </figure>
                <details className="fs-oracle-full"><summary>The whole passage</summary><Passage item={item} /></details>
              </div>
            )}
            <div className="fs-oracle-actions">
              {picked === null ? null : correct
                ? <button className="a-btn a-primary fs-rich" onClick={onEnter}><ArrowRight size={17} /><span><b>Enter the trial</b></span></button>
                : <button className="a-btn a-primary fs-rich" onClick={onAgain}><RefreshCw size={16} /><span><b>New question</b></span></button>}
            </div>
            <Inspector item={item} />
          </>
        )}
      </section>
    </div>
  );
}
