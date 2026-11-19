"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { ArcadeSave, TrialId } from "../../lib/arcade/arcade";
import { ENVIRONMENTS, MAP_FX, envCard } from "../../lib/cinema/art";
import { CHECKPOINTS, MAP_ART, MARKER_ART, ROUTE, markerStateLabel, markerStates, type MarkerState } from "../../lib/cinema/map-layout";
import { QUALITY_BUDGET, type Quality } from "../../lib/cinema/quality";
import { TRIAL_COPY, TRIAL_LOOKS, chapterOf } from "../../lib/cinema/scenes";
import { AmbientFx } from "./ambient-fx";
import { Cta, Wordmark } from "./chrome";
import { Helmet, LaurelBranch } from "./icons";

type Props = {
  save: ArcadeSave;
  selected: TrialId;
  quality: Quality;
  still: boolean;
  corner: ReactNode;
  headingRef: RefObject<HTMLElement | null>;
  onSelect: (id: TrialId) => void;
  onEnter: (id: TrialId) => void;
  onTrials: () => void;
  onMenu: () => void;
};

const MEDAL_ORDER = ["hard", "normal", "easy"] as const;

/** What the trial panel says about the chosen trial, from the save only. */
function statusOf(state: MarkerState, record: ArcadeSave["records"][TrialId]): string | null {
  if (state === "completed") {
    if (record.cleared === "assisted") return "Assisted by Athena";
    const medal = MEDAL_ORDER.map(d => record.bests[d]?.medal).find(Boolean);
    return medal ? `Cleared · ${medal} laurel` : "Cleared";
  }
  if (state === "current") return "Next on your voyage";
  return state === "locked" ? "Locked" : null;
}

/**
 * The voyage chart: the painted map in a stage with its exact 1672:941 ratio,
 * the sample sea route over it, and one real button per checkpoint at the
 * layout's anchors. Art, route, effects and markers share the stage, so any
 * crop or pan moves them together and the markers never drift off their islands.
 */
export function VoyageMap({ save, selected, quality, still, corner, headingRef, onSelect, onEnter, onTrials, onMenu }: Props) {
  const states = markerStates(save);
  const index = ROUTE.indexOf(selected), copy = TRIAL_COPY[selected];
  const cleared = ROUTE.filter(id => save.records[id].cleared !== "pending").length;
  const markers = useRef(new Map<TrialId, HTMLButtonElement>());
  const viewport = useRef<HTMLDivElement>(null);
  const budget = QUALITY_BUDGET[quality];
  const moving = !still && budget.drift && budget.particles > 0;
  const status = statusOf(states[selected], save.records[selected]);

  // On a narrow screen the chart pans sideways: keep the chosen island in view, also after a resize.
  useEffect(() => {
    const centre = (behavior: ScrollBehavior) => {
      const v = viewport.current, m = markers.current.get(selected);
      if (!v || !m || v.scrollWidth <= v.clientWidth + 1) return;
      v.scrollTo({ left: m.offsetLeft - v.clientWidth / 2, behavior });
    };
    centre(still ? "auto" : "smooth");
    const resized = () => centre("auto");
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, [selected, still]);

  function keys(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (step === undefined && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? ROUTE[0] : e.key === "End" ? ROUTE[7] : ROUTE[(index + (step ?? 0) + 8) % 8];
    onSelect(next);
    markers.current.get(next)?.focus();
  }

  return <main className="cn-screen cn-map" style={{ "--cn-accent": TRIAL_LOOKS[selected].accent } as CSSProperties}>
    <div className="cn-map-viewport" ref={viewport}>
      <div className="cn-map-stage">
        <img className="cn-map-art" src={MAP_ART.src} alt="" decoding="async" draggable={false} />
        {moving && <AmbientFx spec={MAP_FX} density={budget.particles} dpr={budget.dpr} paused={false} />}
        <img className="cn-map-route" src={MAP_ART.route} alt="" draggable={false} />
        <div className="cn-markers" role="group" aria-label="Islands of the voyage. Use the arrow keys to move between them." onKeyDown={keys}>
          {ROUTE.map(id => {
            const cp = CHECKPOINTS[id], state = states[id], on = id === selected, numbered = state === "available" || state === "current";
            return <button type="button" key={id} className="cn-marker" data-state={state} data-on={on || undefined} data-trial={id}
              ref={el => { if (el) markers.current.set(id, el); else markers.current.delete(id); }}
              style={{ left: `${cp.x}%`, top: `${cp.y}%` }}
              tabIndex={on ? 0 : -1} aria-pressed={on}
              aria-label={`${cp.number}. ${TRIAL_COPY[id].short}, ${markerStateLabel(state, save.records[id])}`}
              onClick={() => (on ? onEnter(id) : onSelect(id))}>
              <span className="cn-marker-medallion">
                <img src={MARKER_ART[state]} alt="" draggable={false} />
                {numbered ? <span className="cn-marker-num">{cp.number}</span> : <span className="cn-marker-tag">{cp.number}</span>}
              </span>
              <span className="cn-marker-name">{TRIAL_COPY[id].short}</span>
            </button>;
          })}
        </div>
      </div>
    </div>

    <header className="cn-topbar">
      <div className="cn-map-plate">
        <Wordmark onClick={onMenu} />
        <h1 ref={headingRef as RefObject<HTMLHeadingElement>} tabIndex={-1}>Voyage map</h1>
      </div>
      <div className="cn-topbar-right"><button type="button" className="cn-ghost" onClick={onTrials}><Helmet size={18} /><span>Trials</span></button>{corner}</div>
    </header>

    <p className="cn-map-progress cn-glass" aria-label={`${cleared} of 8 trials cleared`}><LaurelBranch size={22} /><span>{cleared} / 8 trials</span><LaurelBranch size={22} flip /></p>

    <AnimatePresence mode="wait">
      <motion.aside key={selected} className="cn-map-panel cn-glass" aria-live="polite" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
        <img className="cn-map-panel-art" src={envCard(selected)} alt="" style={{ objectPosition: `${ENVIRONMENTS[selected].card}% 50%` }} />
        <div className="cn-map-panel-body">
          <h2>{copy.short}</h2>
          <span className="cn-ceremonial cn-ruled">{chapterOf(selected)}</span>
          {status && <p className="cn-map-panel-status">{status}</p>}
          <Cta onClick={() => onEnter(selected)} className="cn-cta-enter" wide>Enter trial</Cta>
        </div>
      </motion.aside>
    </AnimatePresence>
  </main>;
}
