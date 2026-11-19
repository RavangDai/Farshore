"use client";
import { ArrowRight, BrainCircuit, Compass, FlaskConical, KeyRound, Play, Trophy } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import { trials, type ArcadeSave } from "../../lib/arcade/arcade";
import { TRIAL_COPY } from "../../lib/cinema/scenes";
import { prologue } from "../../lib/story/prologue";
import { ChapterTitle, Cta, Drawer, Wordmark } from "./chrome";
import { Constellation, LaurelBranch, Rule } from "./icons";
import { FarshoreMark } from "./main-menu";

export function Prologue({ slide, still, corner, headingRef, onNext, onSkip, onMenu }: { slide: number; still: boolean; corner: ReactNode; headingRef: RefObject<HTMLElement | null>; onNext: () => void; onSkip: () => void; onMenu: () => void }) {
  const s = prologue[slide];
  return <main className="cn-screen cn-prologue">
    <span className="cn-letterbox" data-edge="top" aria-hidden="true" /><span className="cn-letterbox" data-edge="bottom" aria-hidden="true" />
    <header className="cn-topbar"><Wordmark onClick={onMenu} />{corner}</header>
    <section className="cn-prologue-card" key={slide}>
      <span className="cn-ceremonial">{s.chapter}</span>
      <ChapterTitle lines={s.lines} still={still} headingRef={headingRef} revealKey={`p${slide}`} className="cn-title-prologue" />
      <p className="cn-editorial">{s.text}</p>
      <div className="cn-actions">
        <Cta onClick={onNext} laurels={slide === prologue.length - 1} sub={s.detail}>{s.next}<ArrowRight size={18} strokeWidth={1.6} /></Cta>
        <button type="button" className="cn-text-btn" onClick={onSkip}>Skip prologue</button>
      </div>
      <div className="cn-pips" role="img" aria-label={`Part ${slide + 1} of ${prologue.length}`}>{prologue.map((_, i) => <i key={i} data-on={i <= slide || undefined} />)}</div>
    </section>
  </main>;
}

export function HowToPlay({ corner, headingRef, canDemo, onDemo, onLab, onMenu }: { corner: ReactNode; headingRef: RefObject<HTMLElement | null>; canDemo: boolean; onDemo: () => void; onLab: () => void; onMenu: () => void }) {
  const [controls, setControls] = useState(false);
  const pillars: [ReactNode, string, string][] = [
    [<Compass key="c" size={26} strokeWidth={1.2} />, "Follow the voyage", "Eight trials, in any order. Continue opens the next unfinished one."],
    [<KeyRound key="k" size={26} strokeWidth={1.2} />, "Win the Oracle’s key", "Before a trial counts, answer one question drawn from Homer’s text."],
    [<BrainCircuit key="b" size={26} strokeWidth={1.2} />, "Face a living rival", "Each rival adapts to your last attempts. The game keeps every rule."],
    [<Trophy key="t" size={26} strokeWidth={1.2} />, "Earn your laurels", "No hits for gold, two or fewer for silver, any finish for bronze."],
  ];
  return <main className="cn-screen cn-page">
    <header className="cn-topbar"><Wordmark onClick={onMenu} back />{corner}</header>
    <section className="cn-page-body">
      <span className="cn-ceremonial cn-ceremonial-rule">How to play</span>
      <h1 ref={headingRef as RefObject<HTMLHeadingElement>} tabIndex={-1} className="cn-page-title">Every trial keeps its own rules.</h1>
      <div className="cn-pillars">{pillars.map(([icon, title, text]) => <article key={title}>{icon}<h2>{title}</h2><p>{text}</p></article>)}</div>
      <p className="cn-note cn-center">Escape pauses and silences the voices. F toggles fullscreen. F3 shows how a rival decides.</p>
      <div className="cn-actions cn-center">
        <Cta onClick={onDemo} disabled={!canDemo} icon={<Play size={18} fill="currentColor" strokeWidth={0} />} sub={canDemo ? "Demonstration · not saved" : "Connect a model first"}>Watch a rescue</Cta>
        <button type="button" className="cn-ghost" onClick={() => setControls(true)}><span>Controls for every trial</span></button>
        <button type="button" className="cn-ghost" onClick={onLab}><FlaskConical size={17} strokeWidth={1.3} /><span>AI Lab</span></button>
      </div>
    </section>
    <Drawer open={controls} title="Controls" onClose={() => setControls(false)} wide>
      <ol className="cn-control-list">{trials.map(t => <li key={t.id}><span className="cn-ceremonial">{TRIAL_COPY[t.id].numeral}</span><div><h3>{TRIAL_COPY[t.id].short}</h3><p>{t.controls}</p></div></li>)}</ol>
    </Drawer>
  </main>;
}

export function Credits({ corner, headingRef, onMenu }: { corner: ReactNode; headingRef: RefObject<HTMLElement | null>; onMenu: () => void }) {
  return <main className="cn-screen cn-page cn-credits">
    <header className="cn-topbar"><Wordmark onClick={onMenu} back />{corner}</header>
    <section className="cn-page-body cn-center">
      <FarshoreMark tagline="Credits" />
      <h1 ref={headingRef as RefObject<HTMLHeadingElement>} tabIndex={-1} className="cn-page-title cn-small">A story three thousand years in the making.</h1>
      <p className="cn-editorial">Inspired by Homer’s <em>Odyssey</em>. An independent adaptation with original rules and imagined settings.</p>
      <dl className="cn-facts cn-facts-grid">
        <div><dt>Project</dt><dd>FARSHORE · Bibek Pathak</dd></div>
        <div><dt>Worlds</dt><dd>Procedural 3D with three.js and React Three Fiber; painted chapter art</dd></div>
        <div><dt>AI</dt><dd>PPO rival in ONNX Runtime Web · rule-based rivals with search · your connected language model for the Oracle and commentary · Kokoro-82M voices</dd></div>
        <div><dt>Motion</dt><dd>GSAP and Motion</dd></div>
        <div><dt>Type</dt><dd>Cinzel, Cormorant Garamond and Inter (SIL OFL) · Lucide icons (ISC)</dd></div>
        <div><dt>Built with</dt><dd>React, TypeScript, Next.js</dd></div>
      </dl>
      <p className="cn-note">Lotus guardians, potion duels, wind gates and repeated contests are fictional game devices.</p>
      <div className="cn-actions cn-center"><a className="cn-ghost" href="/story-sources.md" target="_blank" rel="noreferrer"><span>Story &amp; sources</span></a><Cta onClick={onMenu}>Main menu</Cta></div>
    </section>
  </main>;
}

export function Ending({ save, corner, headingRef, onMap, onNewVoyage, onMenu }: { save: ArcadeSave; corner: ReactNode; headingRef: RefObject<HTMLElement | null>; onMap: () => void; onNewVoyage: () => void; onMenu: () => void }) {
  const done = trials.map(t => save.records[t.id].cleared !== "pending");
  return <main className="cn-screen cn-page cn-ending">
    <header className="cn-topbar"><Wordmark onClick={onMenu} />{corner}</header>
    <section className="cn-page-body cn-center">
      <span className="cn-ceremonial cn-ceremonial-rule">Ithaca, at last</span>
      <h1 ref={headingRef as RefObject<HTMLHeadingElement>} tabIndex={-1} className="cn-page-title">Home is more than a shore.</h1>
      <p className="cn-editorial">The long crossing is behind you. Penelope knows the man who returned, and Telemachus stands beside his father. For this moment, the sea can wait.</p>
      <div className="cn-ending-laurels"><LaurelBranch size={34} /><Constellation done={done} className="cn-constellation" /><LaurelBranch size={34} flip /></div>
      <ul className="cn-ending-list">{trials.map(t => { const r = save.records[t.id]; const medal = (["hard", "normal", "easy"] as const).map(d => r.bests[d]?.medal).find(Boolean); return <li key={t.id}><span>{TRIAL_COPY[t.id].short}</span><b data-medal={medal}>{r.cleared === "assisted" ? "Assisted" : medal ?? (r.cleared === "cleared" ? "Cleared" : "—")}</b></li>; })}</ul>
      <Rule className="cn-rule-wide" />
      <div className="cn-actions cn-center"><Cta laurels onClick={onMap}>Voyage Map</Cta><button type="button" className="cn-ghost" onClick={onNewVoyage}><span>New Voyage</span></button></div>
    </section>
  </main>;
}
