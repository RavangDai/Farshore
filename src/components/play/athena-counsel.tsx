"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import type { BowState } from "../../lib/encounters/mythic";
import { ATHENA_COUNSEL, QUESTION_MAX, askAthena, athenaFacts, type AthenaAnswer } from "../../lib/ai/athena";
import { DictationSession, dictationIssue, type DictationState, type SpeechRecognition as Recognition } from "../../lib/speech/dictation";
import type { Facts } from "../../lib/arcade/decisions";

type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

const SUGGESTED = ["Which way should I aim?", "What went wrong with my last arrow?", "How long can I hold the draw?"];

type Counsel = { question: string; answer: AthenaAnswer; facts: Facts; arrow: number };

/**
 * Ask Athena: the player's own line to the model. She answers only from the
 * facts the hall supplies for this shot, cut to the difficulty's precision, and
 * every answer shows which of those facts it used.
 */
export function AthenaCounsel({
  state,
  active,
  onCounsel,
  onSpeak,
}: {
  state: BowState;
  active: boolean;
  /** Counts a question in the engine, which owns the limit. */
  onCounsel: () => void;
  onSpeak?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [counsel, setCounsel] = useState<Counsel | null>(null);
  const [dictation, setDictation] = useState<DictationState>("idle");
  const [canDictate, setCanDictate] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const session = useRef<DictationSession | null>(null);

  const left = ATHENA_COUNSEL - state.counsel;
  // Before the first arrow the hall's how-to-shoot box fills the lower left, so Athena waits above it.
  const coach = state.shots.length === 0 || undefined;
  const yourTurn = active && state.phase === "player" && !state.drawing;
  const usable = yourTurn && left > 0 && !busy;

  useEffect(() => {
    const w = window as SpeechWindow;
    setCanDictate(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      request.current?.abort();
      session.current?.cancel();
    };
  }, []);

  // A restarted contest starts with fresh counsel.
  useEffect(() => {
    if (state.counsel === 0 && state.turn === 1 && state.shots.length === 0) {
      setCounsel(null);
      setError("");
    }
  }, [state.counsel, state.turn, state.shots.length]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  async function ask(text: string) {
    const q = text.trim();
    if (!usable || q.length < 2) return;
    session.current?.cancel();
    const facts = athenaFacts(state);
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const answer = await askAthena({ trialId: "bow", difficulty: state.difficulty, question: q.slice(0, QUESTION_MAX), facts }, controller.signal);
      if (controller.signal.aborted) return;
      // Only an answered question is counted against the contest's three.
      onCounsel();
      setCounsel({ question: q, answer, facts, arrow: state.turn });
      setQuestion("");
      onSpeak?.(answer.answer);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Athena could not answer. Try again.");
    } finally {
      if (request.current === controller) request.current = null;
      setBusy(false);
    }
  }

  function dictate() {
    if (session.current) {
      if (dictation === "starting") session.current.cancel();
      else session.current.stop();
      return;
    }
    const w = window as SpeechWindow, C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) return;
    try {
      const s = new DictationSession(new C(), {
        onState: next => {
          setDictation(next);
          if (next === "idle" && session.current === s) session.current = null;
        },
        onTranscript: text => setQuestion(old => `${old} ${text}`.trim().slice(0, QUESTION_MAX)),
        onError: code => setError(dictationIssue(code).title),
      });
      session.current = s;
      s.start();
    } catch {
      session.current?.cancel();
      setError(dictationIssue("start-failed").title);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="fs-athena-toggle"
        data-coach={coach}
        onClick={() => setOpen(true)}
        disabled={!active}
        title="Ask Athena about this shot"
      >
        <Sparkles size={15} aria-hidden="true" />
        <span>Ask Athena</span>
        <small>{left} left</small>
      </button>
    );
  }

  return (
    <section
      className="fs-athena"
      data-coach={coach}
      aria-label="Athena's counsel"
      onKeyDown={e => {
        // Keys typed here are for Athena, not the bow; Escape closes the panel.
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
        }
        e.stopPropagation();
      }}
    >
      <header>
        <span className="fs-athena-title">
          <Sparkles size={14} aria-hidden="true" /> Athena&rsquo;s counsel
        </span>
        <small>{left} of {ATHENA_COUNSEL} left · costs no medal</small>
        <button type="button" className="fs-athena-close" onClick={() => setOpen(false)} aria-label="Close Athena's counsel">
          <X size={14} />
        </button>
      </header>

      {counsel && (
        <div className="fs-athena-answer" aria-live="polite">
          <p className="fs-athena-question">You asked: {counsel.question}</p>
          <p>{counsel.answer.answer}</p>
          {counsel.answer.usedFacts.length > 0 ? (
            <div className="fs-athena-used">
              <span>Athena used</span>
              <ul>
                {counsel.answer.usedFacts.map(key => (
                  <li key={key}>
                    <b>{key}</b> {String(counsel.facts[key])}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="fs-athena-muted">No hall facts were needed for this answer.</p>
          )}
          <small className="fs-athena-meta">
            {counsel.arrow !== state.turn ? `Given for arrow ${counsel.arrow}; the draught has changed since. ` : ""}
            {counsel.answer.model ? `Answered by ${counsel.answer.model}, from the hall's own facts.` : "Answered from the hall's own facts."}
          </small>
        </div>
      )}

      {busy && <p className="fs-athena-busy" role="status">Athena considers the hall…</p>}
      {error && <p className="fs-athena-error" role="alert">{error}</p>}

      {left > 0 ? (
        <>
          <div className="fs-athena-suggest" role="group" aria-label="Suggested questions">
            {SUGGESTED.map(text => (
              <button key={text} type="button" disabled={!usable} onClick={() => void ask(text)}>
                {text}
              </button>
            ))}
          </div>
          <form
            className="fs-athena-form"
            onSubmit={e => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              ref={input}
              value={question}
              maxLength={QUESTION_MAX}
              onChange={e => setQuestion(e.target.value)}
              placeholder={yourTurn ? "Ask about the draught, your draw, the axes…" : "Ask on your turn, before you draw"}
              aria-label="Your question for Athena"
              disabled={busy}
            />
            {canDictate && (
              <button type="button" className="fs-athena-mic" onClick={dictate} aria-pressed={dictation !== "idle"} aria-label={dictation === "idle" ? "Speak your question" : "Stop listening"}>
                {dictation === "idle" ? <Mic size={15} /> : <MicOff size={15} />}
              </button>
            )}
            <button type="submit" className="fs-athena-send" disabled={!usable || question.trim().length < 2} aria-label="Ask Athena">
              <Send size={15} />
            </button>
          </form>
          {!yourTurn && <p className="fs-athena-muted">Athena answers on your turn, while the bow is at rest.</p>}
        </>
      ) : (
        <p className="fs-athena-muted">Athena has given her counsel for this contest. The rest is your own eye.</p>
      )}
    </section>
  );
}
