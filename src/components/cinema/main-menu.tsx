"use client";
import gsap from "gsap";
import { BookOpen, Map as MapIcon, Play } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { TRIAL_COPY } from "../../lib/cinema/scenes";
import type { TrialId } from "../../lib/arcade/arcade";
import { Cta } from "./chrome";
import { Constellation, Rule, Trident } from "./icons";

type Props = {
  started: boolean;
  next: TrialId | null;
  done: boolean[];
  still: boolean;
  corner: ReactNode;
  headingRef: RefObject<HTMLElement | null>;
  onContinue: () => void;
  onNewVoyage: () => void;
  onMap: () => void;
  onHowTo: () => void;
};

/** The large FARSHORE mark: a trident, the name in bronze, and its ceremonial line. */
export function FarshoreMark({ tagline = "The long way home" }: { tagline?: string }) {
  return <div className="cn-mark">
    <div className="cn-mark-crest"><i /><Trident size={46} /><i /></div>
    <span className="cn-mark-name" aria-label="Farshore">{"FARSHORE".split("").map((c, i) => <span key={i} aria-hidden="true">{c}</span>)}</span>
    <div className="cn-mark-tag"><i /><span>{tagline}</span><i /></div>
  </div>;
}

export function MainMenu({ started, next, done, still, corner, headingRef, onContinue, onNewVoyage, onMap, onHowTo }: Props) {
  const root = useRef<HTMLElement>(null);
  const cleared = done.filter(Boolean).length;
  useLayoutEffect(() => {
    if (still || !root.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".cn-mark-crest svg", { opacity: 0, y: -14, duration: 1.1 })
        .from(".cn-mark-crest i", { scaleX: 0, duration: 1.2, ease: "power2.inOut" }, "<0.2")
        .from(".cn-mark-name > span", { opacity: 0, y: 26, filter: "blur(10px)", duration: 1.3, stagger: 0.07 }, "<0.1")
        .from(".cn-mark-tag", { opacity: 0, letterSpacing: "0.9em", duration: 1.4 }, "<0.6")
        .from(".cn-menu-nav > *", { opacity: 0, x: -24, duration: 0.9, stagger: 0.09 }, "<0.3")
        .from(".cn-menu-foot", { opacity: 0, y: 12, duration: 1 }, "<0.3")
        .from(".cn-corner", { opacity: 0, y: -10, duration: 1 }, "<");
    }, root);
    return () => ctx.revert();
  }, [still]);
  return <main ref={root} className="cn-screen cn-menu" aria-labelledby="cn-menu-title">
    <header className="cn-topbar"><span />{corner}</header>
    <section className="cn-menu-left">
      <h1 id="cn-menu-title" ref={headingRef as RefObject<HTMLHeadingElement>} tabIndex={-1} className="cn-menu-heading"><FarshoreMark /></h1>
      <nav className="cn-menu-nav" aria-label="Main menu">
        {started
          ? <Cta icon={<Play size={22} fill="currentColor" strokeWidth={0} />} sub={next ? TRIAL_COPY[next].short : "Return to Ithaca"} onClick={onContinue} className="cn-cta-menu" laurels>Continue</Cta>
          : <Cta icon={<Play size={22} fill="currentColor" strokeWidth={0} />} sub="Set sail from Troy" onClick={onNewVoyage} className="cn-cta-menu" laurels>Begin</Cta>}
        <button type="button" className="cn-menu-item" onClick={onNewVoyage}><StarIcon /><span>New Voyage</span></button>
        <button type="button" className="cn-menu-item" onClick={onMap}><MapIcon size={21} strokeWidth={1.3} /><span>Voyage Map</span></button>
        <button type="button" className="cn-menu-item" onClick={onHowTo}><BookOpen size={21} strokeWidth={1.3} /><span>How to Play</span></button>
      </nav>
    </section>
    <footer className="cn-menu-foot" aria-label={`${cleared} of 8 trials cleared`}>
      <div className="cn-progress"><StarIcon big /><Constellation done={done} className="cn-constellation" /></div>
      <div className="cn-progress-label"><Rule className="cn-rule-short" /><span>{cleared} / 8 Trials</span><Rule className="cn-rule-short" /></div>
    </footer>
  </main>;
}

function StarIcon({ big }: { big?: boolean }) {
  return <svg className="cn-star-icon" width={big ? 34 : 22} height={big ? 34 : 22} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 1l1.6 8.4L22 12l-8.4 1.6L12 23l-1.6-9.4L2 12l8.4-2.6z" opacity=".9" /><path d="M12 6l.7 4.6 4.3.7-4.3.8L12 17l-.7-4.9-4.3-.8 4.3-.7z" fill="#fff6dc" /></svg>;
}
