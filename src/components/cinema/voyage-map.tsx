"use client";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { trials, type ArcadeSave, type TrialId } from "../../lib/arcade/arcade";
import { FLAT_POSITION, ROUTE, mapLabels } from "../../lib/cinema/map-layout";
import { TRIAL_COPY, TRIAL_LOOKS } from "../../lib/cinema/scenes";
import { Cta, Wordmark } from "./chrome";
import { CompassRose, Constellation, Helmet, LaurelBranch } from "./icons";
import { ChapterArt } from "./trial-carousel";

type Props = {
  save: ArcadeSave;
  selected: TrialId;
  /** False when the chart is painted (no WebGL): labels then sit at fixed positions. */
  live: boolean;
  still: boolean;
  corner: ReactNode;
  headingRef: RefObject<HTMLElement | null>;
  onSelect: (id: TrialId) => void;
  onEnter: (id: TrialId) => void;
  onTrials: () => void;
  onMenu: () => void;
};

export function VoyageMap({ save, selected, live, still, corner, headingRef, onSelect, onEnter, onTrials, onMenu }: Props) {
  const index = ROUTE.indexOf(selected), copy = TRIAL_COPY[selected];
  const done = trials.map(t => save.records[t.id].cleared !== "pending");
  const [hint, setHint] = useState(true);
  const labels = useRef(new Map<TrialId, HTMLButtonElement>());
  useEffect(() => { const t = window.setTimeout(() => setHint(false), 6000); return () => clearTimeout(t); }, []);
  useEffect(() => () => { for (const id of ROUTE) mapLabels.delete(id); }, []);
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = ROUTE[(index + step + 8) % 8];
    onSelect(next);
    labels.current.get(next)?.focus();
  }
  return <main className="cn-screen cn-map" data-live={live || undefined} style={{ "--cn-accent": TRIAL_LOOKS[selected].accent } as CSSProperties}>
    <header className="cn-topbar">
      <div className="cn-map-title">
        <Wordmark onClick={onMenu} />
        <h1 ref={headingRef as RefObject<HTMLHeadingElement>} tabIndex={-1}>Voyage Map</h1>
      </div>
      <div className="cn-topbar-right"><button type="button" className="cn-ghost" onClick={onTrials}><Helmet size={18} /><span>Trials</span></button>{corner}</div>
    </header>
    {!live && <svg className="cn-flat-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={ROUTE.map(id => { const f = FLAT_POSITION(id); return `${f.left},${f.top + 3}`; }).join(" ")} /></svg>}
    <div className="cn-isles" role="group" aria-label="Islands of the voyage. Use the arrow keys to move between them." onKeyDown={keys}>
      {ROUTE.map((id, i) => {
        const on = id === selected, cleared = done[i], flat = FLAT_POSITION(id);
        return <button type="button" key={id} className="cn-isle" data-on={on || undefined} data-cleared={cleared || undefined}
          ref={el => { if (el) { labels.current.set(id, el); if (live) mapLabels.set(id, el); } else { labels.current.delete(id); mapLabels.delete(id); } }}
          style={live ? undefined : { left: `${flat.left}%`, top: `${flat.top}%` }}
          tabIndex={on ? 0 : -1} aria-pressed={on}
          aria-label={`${String(i + 1).padStart(2, "0")}. ${TRIAL_COPY[id].short}${cleared ? ", cleared" : ""}`}
          onClick={() => (on ? onEnter(id) : onSelect(id))}>
          <span className="cn-isle-num">{String(i + 1).padStart(2, "0")}</span>
          <span className="cn-isle-name">{TRIAL_COPY[id].short}</span>
        </button>;
      })}
    </div>
    <CompassRose className="cn-compass" size={118} />
    <AnimatePresence mode="wait">
      <motion.aside key={selected} className="cn-map-card" aria-live="polite" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <ChapterArt id={selected} className="cn-map-card-art" />
        <div className="cn-map-card-body">
          <span className="cn-ceremonial">Trial {String(index + 1).padStart(2, "0")}</span>
          <h2>{copy.short}</h2>
          <p>{copy.objective}</p>
          <Cta onClick={() => onEnter(selected)} className="cn-cta-enter" wide>Enter Trial<ArrowRight size={20} strokeWidth={1.6} /></Cta>
        </div>
      </motion.aside>
    </AnimatePresence>
    <footer className="cn-map-foot">
      <div className="cn-map-progress"><LaurelBranch size={26} /><span>{done.filter(Boolean).length} / 8</span></div>
      <Constellation done={done} active={index} className="cn-constellation" />
    </footer>
    {live && !still && <p className="cn-map-hint" data-on={hint || undefined}>Drag to pan · Scroll to zoom · Click an island</p>}
  </main>;
}
