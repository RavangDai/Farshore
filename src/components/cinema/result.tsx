"use client";
import gsap from "gsap";
import { ArrowRight, RotateCcw, Volume2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { difficultyNames, trials, type Medal, type TrialId } from "../../lib/arcade/arcade";
import type { GameState } from "../../lib/arcade/arcade-runtime";
import { TRIAL_COPY, TRIAL_LOOKS, chapterOf } from "../../lib/cinema/scenes";
import { Cta, Drawer, Subtitle, Wordmark } from "./chrome";
import { LaurelWreath } from "./icons";

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

type Props = {
  id: TrialId;
  state: GameState;
  medal: Medal | null;
  demo: boolean;
  still: boolean;
  corner: ReactNode;
  headingRef: RefObject<HTMLElement | null>;
  next: { title: string } | null;
  finale: boolean;
  canRetry: boolean;
  retryNote?: string;
  best: number | null;
  recap: { speaker: string; text: string } | "pending" | null;
  details: ReactNode;
  scoreLabel: string;
  rivalScore?: string;
  onContinue: () => void;
  onRetry: () => void;
  onBrief: () => void;
  onMap: () => void;
  onMenu: () => void;
  onAssist?: () => void;
  onHear: () => void;
};

/** Counts a figure up once (GSAP), or shows it at once in still mode. */
function Figure({ value, still, format = (n: number) => Math.round(n).toLocaleString() }: { value: number; still: boolean; format?: (n: number) => string }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    if (still) { ref.current.textContent = format(value); return; }
    const o = { n: 0 };
    const tween = gsap.to(o, { n: value, duration: 1.4, delay: 0.9, ease: "power2.out", onUpdate: () => { if (ref.current) ref.current.textContent = format(o.n); } });
    return () => { tween.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, still]);
  return <strong ref={ref}>{format(still ? value : 0)}</strong>;
}

export function ResultScreen(p: Props) {
  const { id, state, medal, still } = p;
  const root = useRef<HTMLElement>(null);
  const [details, setDetails] = useState(false);
  const won = state.won, practice = state.practice;
  const tone = practice ? "practice" : won ? "victory" : "defeat";
  const copy = TRIAL_COPY[id], trial = trials.find(t => t.id === id)!;
  const title = practice ? (p.demo ? "A lesson in cunning" : "Practice complete") : won ? "Victory" : "Trial failed";
  const line = practice ? "Nothing was saved. Take what you learned into the trial." : won ? trial.success : state.feedback;
  useLayoutEffect(() => {
    if (still || !root.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      if (tone === "victory") {
        tl.from(".cn-wreath-stem", { strokeDasharray: 400, strokeDashoffset: 400, duration: 1.4, ease: "power2.inOut" })
          .from(".cn-wreath-leaf", { scale: 0, opacity: 0, transformOrigin: "center", duration: 0.6, stagger: 0.035, ease: "back.out(2)" }, "<0.25")
          .from(".cn-result-medal", { opacity: 0, scale: 0.6, duration: 0.8, ease: "back.out(1.8)" }, "<0.4");
      }
      tl.from(".cn-result-label", { opacity: 0, y: 10, duration: 0.8 }, tone === "victory" ? "<0.1" : 0.3)
        .from(".cn-result-title", { opacity: 0, y: 24, letterSpacing: tone === "victory" ? "0.3em" : "0.06em", filter: "blur(8px)", duration: 1.3 }, "<0.1")
        .fromTo(".cn-result-line, .cn-result-stats > *, .cn-result-actions > *", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, clearProps: "opacity,transform" }, "<0.5");
    }, root);
    return () => ctx.revert();
  }, [still, tone]);
  const recap = p.recap && p.recap !== "pending" ? p.recap : null;
  return <main ref={root} className="cn-screen cn-result" data-tone={tone} style={{ "--cn-accent": TRIAL_LOOKS[id].accent } as CSSProperties}>
    <header className="cn-topbar"><Wordmark onClick={p.onMenu} />{p.corner}</header>
    <section className="cn-result-core cn-glass">
      {tone === "victory" && <div className="cn-result-crown" data-medal={medal ?? undefined}><LaurelWreath size={190} /><span className="cn-result-medal">{medal ? `${medal}` : ""}</span></div>}
      <span className="cn-ceremonial cn-result-label">{chapterOf(id)} · {copy.short}</span>
      <h1 ref={p.headingRef as RefObject<HTMLHeadingElement>} tabIndex={-1} className="cn-result-title">{title}</h1>
      <p className="cn-result-line">{line}</p>
      <dl className="cn-result-stats">
        <div><dt>{p.scoreLabel}</dt><dd><Figure value={state.score} still={still} /></dd></div>
        <div><dt>Time</dt><dd><Figure value={state.elapsed} still={still} format={clock} /></dd></div>
        <div><dt>Difficulty</dt><dd><strong>{difficultyNames[state.difficulty]}</strong></dd></div>
        {p.rivalScore && <div><dt>Rival</dt><dd><strong>{p.rivalScore}</strong></dd></div>}
        {p.best !== null && !practice && <div><dt>Best</dt><dd><strong>{p.best.toLocaleString()}</strong></dd></div>}
      </dl>
      <div className="cn-result-actions">
        {!practice && won && <Cta laurels onClick={p.onContinue} sub={p.finale ? undefined : p.next?.title}>{p.finale ? "Return to Ithaca" : "Continue Voyage"}</Cta>}
        {(!won || practice) && <Cta onClick={p.onRetry} disabled={!p.canRetry} sub={p.canRetry ? undefined : p.retryNote} icon={<RotateCcw size={18} strokeWidth={1.6} />}>{practice ? "Again" : "Retry"}</Cta>}
        <div className="cn-result-links">
          {won && !practice && <button type="button" onClick={p.onRetry} disabled={!p.canRetry}>Replay</button>}
          <button type="button" onClick={p.onBrief}>Briefing</button>
          <button type="button" onClick={p.onMap}>Voyage map</button>
          <button type="button" onClick={() => setDetails(true)}>{won ? "Details" : "Insights"}<ArrowRight size={14} /></button>
          {p.onAssist && <button type="button" onClick={p.onAssist}>Request Athena’s help</button>}
        </div>
      </div>
    </section>
    {p.recap === "pending" ? <Subtitle speaker="The bard" text={null} /> : recap && <Subtitle speaker={recap.speaker} text={recap.text} action={<button type="button" className="cn-hear" onClick={p.onHear} aria-label="Hear it again"><Volume2 size={16} strokeWidth={1.5} /></button>} />}
    <Drawer open={details} title={won ? "How the round went" : "What happened"} onClose={() => setDetails(false)} wide>{p.details}</Drawer>
  </main>;
}
