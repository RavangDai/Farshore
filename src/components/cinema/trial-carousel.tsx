"use client";
import { ArrowRight, Check, Map as MapIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { trials, type ArcadeSave, type Difficulty, type TrialId } from "../../lib/arcade/arcade";
import { ENVIRONMENTS, envCard, envSrc } from "../../lib/cinema/art";
import { TRIAL_COPY, TRIAL_LOOKS } from "../../lib/cinema/scenes";
import { preloadArt } from "./backdrop";
import { ChapterTitle, Cta, DifficultySelect, Wordmark } from "./chrome";
import { Rule } from "./icons";

/** A trial's environment painting as a card or thumbnail, cropped towards its focal subject. */
export function ChapterArt({ id, className = "" }: { id: TrialId; className?: string }) {
  return <img className={`cn-art ${className}`} src={envCard(id)} alt="" loading="lazy" decoding="async" draggable={false} style={{ objectPosition: `${ENVIRONMENTS[id].card}% 50%` }} />;
}

type Props = {
  save: ArcadeSave;
  selected: TrialId;
  difficulty: Difficulty;
  still: boolean;
  corner: ReactNode;
  headingRef: RefObject<HTMLElement | null>;
  onSelect: (id: TrialId) => void;
  onEnter: (id: TrialId) => void;
  onDifficulty: (d: Difficulty) => void;
  onMap: () => void;
  onMenu: () => void;
};

export function TrialCarousel({ save, selected, difficulty, still, corner, headingRef, onSelect, onEnter, onDifficulty, onMap, onMenu }: Props) {
  const index = trials.findIndex(t => t.id === selected), copy = TRIAL_COPY[selected];
  const strip = useRef<HTMLDivElement>(null);
  const best = save.records[selected].bests[difficulty];
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-trial-index="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: still ? "auto" : "smooth" });
  }, [index, still]);
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (step === undefined && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? 7 : (index + (step ?? 0) + 8) % 8;
    onSelect(trials[next].id);
    strip.current?.querySelector<HTMLElement>(`[data-trial-index="${next}"]`)?.focus();
  }
  return <main className="cn-screen cn-trials" style={{ "--cn-accent": TRIAL_LOOKS[selected].accent } as CSSProperties}>
    <header className="cn-topbar">
      <Wordmark onClick={onMenu} />
      <div className="cn-topbar-right"><button type="button" className="cn-ghost" onClick={onMap}><MapIcon size={18} strokeWidth={1.3} /><span>Voyage Map</span></button>{corner}</div>
    </header>
    <section className="cn-trials-info cn-glass" aria-live="polite">
      <div className="cn-kicker"><span>The Eight Trials</span><div className="cn-kicker-rule"><Rule /></div></div>
      <span className="cn-chapter-num" key={`n-${selected}`}>{String(index + 1).padStart(2, "0")} <i>/</i> 08</span>
      <ChapterTitle lines={copy.lines} still={still} headingRef={headingRef} revealKey={selected} className="cn-title-xl" />
      <p className="cn-objective" key={`o-${selected}`}>{copy.objective}</p>
      <div className="cn-actions">
        <Cta icon={null} onClick={() => onEnter(selected)} className="cn-cta-enter">Enter trial<ArrowRight size={18} strokeWidth={1.6} /></Cta>
        <DifficultySelect value={difficulty} onChange={onDifficulty} />
      </div>
      {best && <p className="cn-best"><span className={`cn-medal-dot ${best.medal}`} />{best.medal} · best {best.score.toLocaleString()}</p>}
    </section>
    <div className="cn-carousel" ref={strip} role="listbox" aria-label="The eight trials" aria-activedescendant={`cn-card-${selected}`} onKeyDown={keys}>
      {trials.map((t, i) => {
        const on = t.id === selected, cleared = save.records[t.id].cleared !== "pending", medal = save.records[t.id].bests[difficulty]?.medal;
        return <button type="button" key={t.id} id={`cn-card-${t.id}`} role="option" aria-selected={on} tabIndex={on ? 0 : -1} data-trial-index={i} className="cn-card" data-on={on || undefined}
          style={{ "--cn-card-accent": TRIAL_LOOKS[t.id].accent } as CSSProperties}
          onClick={() => (on ? onEnter(t.id) : onSelect(t.id))} onDoubleClick={() => onEnter(t.id)} onPointerEnter={() => void preloadArt(envSrc(t.id))}
          aria-label={`${TRIAL_COPY[t.id].numeral}. ${TRIAL_COPY[t.id].short}${cleared ? ", cleared" : ""}${on ? ". Press Enter to open" : ""}`}>
          <ChapterArt id={t.id} />
          <span className="cn-card-shade" />
          <span className="cn-card-num">{TRIAL_COPY[t.id].numeral}</span>
          {cleared && <span className="cn-card-done" title={medal ? `${medal} medal` : "Cleared"}><Check size={12} strokeWidth={2.4} /></span>}
          <span className="cn-card-name">{TRIAL_COPY[t.id].short}</span>
          {on && <motion.span layoutId="cn-card-frame" className="cn-card-frame" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
        </button>;
      })}
    </div>
  </main>;
}
