import { useEffect, useRef, useState, type CSSProperties } from "react";
import { activeCue, moveLane, newRound, pressTiming, tickRound, trialFor, type Difficulty, type OpponentPlan, type Round, type TrialId } from "../lib/arcade";

export function Ship({ small = false }: { small?: boolean }) {
  return <svg className={small ? "a-ship small" : "a-ship"} viewBox="0 0 140 120" aria-hidden="true" shapeRendering="crispEdges"><path fill="#c89151" d="M24 75h95l-17 26H43L24 75Z"/><path fill="#6c4431" d="M34 88h76l-8 13H43Z"/><path fill="#f4dfac" d="M66 14h7v65h-7zM63 21 32 65h31zM78 24v41h30Z"/><path fill="#be7158" d="M78 24v41h10V36z"/><path fill="#66c5c9" d="M16 106h25v5H16zm34 4h33v5H50zm42-4h30v5H92z"/></svg>;
}

type Props = { id: TrialId; difficulty: Difficulty; plan: OpponentPlan; practice: boolean; seed: number; still: boolean; onFinish: (round: Round) => void; onLeave: () => void; onFeedback: (good: boolean) => void };
export function ArcadeRound({ id, difficulty, plan, practice, seed, still, onFinish, onLeave, onFeedback }: Props) {
  const [round, setRound] = useState(() => newRound(id, difficulty, plan, practice, seed));
  const current = useRef(round), finished = useRef(false);
  const [phase, setPhase] = useState<"countdown" | "active" | "paused">("countdown");
  const [count, setCount] = useState(3), countdown = useRef(3000);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const board = useRef<HTMLDivElement>(null), callbacks = useRef({ onFinish, onFeedback });
  callbacks.current = { onFinish, onFeedback };
  const trial = trialFor(id), lanes = id === "cyclops";

  function commit(next: Round) {
    if (next === current.current) return;
    const old = current.current;
    current.current = next; setRound(next);
    if (next.resolved.length > old.resolved.length) callbacks.current.onFeedback(next.successes > old.successes);
    if (next.done && !finished.current) { finished.current = true; callbacks.current.onFinish(next); }
  }
  function action(direction?: -1 | 1) {
    if (phase !== "active" || finished.current) return;
    commit(direction ? moveLane(current.current, direction) : pressTiming(current.current));
  }
  function resume() { countdown.current = 3000; setCount(3); setConfirmLeave(false); setPhase("countdown"); board.current?.focus(); }

  useEffect(() => { board.current?.focus(); }, []);
  useEffect(() => {
    if (phase === "paused") return;
    let previous = 0, handle = 0;
    function frame(now: number) {
      const gap = previous ? now - previous : 0;
      // Some browsers throttle an occluded window without a visibility event.
      // Pause rather than stretch a 45-second trial or skip unseen warnings.
      if (gap > 500) { setPhase("paused"); return; }
      const delta = Math.min(100, gap);
      previous = now;
      if (phase === "countdown") {
        countdown.current -= delta;
        setCount(Math.max(1, Math.ceil(countdown.current / 1000)));
        if (countdown.current <= 0) { setPhase("active"); return; }
      } else commit(tickRound(current.current, delta));
      if (!finished.current) handle = requestAnimationFrame(frame);
    }
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [phase]);
  useEffect(() => {
    function visibility() { if (document.hidden) setPhase("paused"); }
    function blur() { setPhase("paused"); }
    function key(e: KeyboardEvent) {
      const isControl = (e.target as HTMLElement)?.closest("input, select, a, summary");
      if (e.key === "Escape") { e.preventDefault(); setPhase("paused"); return; }
      if (isControl || e.repeat) return;
      const k = e.key.toLowerCase();
      // Space activates a focused button through native keyboard behavior.
      if (k === " " && (e.target as HTMLElement)?.closest("button")) return;
      if (["arrowleft", "arrowright", "a", "d", " "].includes(k)) {
        e.preventDefault();
        if (lanes && ["arrowleft", "a"].includes(k)) action(-1);
        else if (lanes && ["arrowright", "d"].includes(k)) action(1);
        else if (!lanes && k === " ") action();
      }
    }
    document.addEventListener("visibilitychange", visibility); window.addEventListener("blur", blur); window.addEventListener("keydown", key);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", blur); window.removeEventListener("keydown", key); };
  }, [phase, lanes]);
  useEffect(() => {
    if (phase !== "active") { const overlay = document.querySelector<HTMLButtonElement>(".a-round-overlay button"); overlay?.focus(); }
  }, [phase]);

  const index = activeCue(round), target = index >= 0 ? round.targets[index] : null;
  const cycle = Math.floor(round.elapsed / 4000), position = (round.elapsed % 4000) / 4000;
  const zone = target && Math.floor(target.at / 4000) === cycle ? (target.at % 4000) / 4000 : .5;
  const width = round.window * 2 / 4000;
  const inZone = !!target && Math.abs(round.elapsed - target.at) <= round.window;
  const warnings = round.targets.map((t, i) => ({ ...t, i, progress: 1 - (t.at - round.elapsed) / round.warning })).filter(t => !round.resolved.includes(t.i) && t.progress >= 0 && t.progress <= 1);
  const seconds = Math.ceil((round.duration - round.elapsed) / 1000);
  return <section className="a-round" aria-label={trial.title + (practice ? " practice" : " challenge")}>
    <div className="a-round-top"><div><span className="a-eyebrow">{practice ? "PRACTICE · NO SCORE" : plan.source === "ai" ? "AI RIVAL" : "STANDARD RIVAL"} · {difficulty.toUpperCase()}</span><h2>{trial.title}</h2></div><button className="a-btn a-small" onClick={() => setPhase("paused")} aria-label="Pause challenge">Ⅱ Pause</button></div>
    <div className="a-game-hud"><span>{lanes ? `Ship health: ${"♥".repeat(Math.max(0, 3 - round.hits))}${"♡".repeat(Math.min(3, round.hits))}` : `${round.successes} / ${practice ? 3 : id === "sirens" ? 6 : 3} ${id === "sirens" ? "good strokes" : "good shots"}`}</span><span>{lanes ? `${seconds}s to safety` : `Cue ${Math.min(round.targets.length, round.resolved.length + 1)} / ${round.targets.length}`}</span></div>
    <div ref={board} className={"a-game-board " + (lanes ? "a-lane-board" : "a-timing-board") + (still ? " a-still" : "")} tabIndex={0} aria-label={lanes ? "Ship controls. Use left and right arrows." : "Timing controls. Press Space in the gold zone."}>
      <div className="a-stage-art" style={{ backgroundPosition: `${(trial.tile % 3) * 50}% ${Math.floor(trial.tile / 3) * 100}%` }} />
      {lanes ? <><div className="a-lane-water"/><div className="a-giant"><span className="a-portrait" style={{ backgroundPosition: "0% 33.333%" }}/></div><div className="a-lanes">{[0, 1, 2].map(l => <div key={l} className={"a-lane" + (warnings.some(w => w.lane === l) ? " threatened" : "")}><span className="a-lane-name">{["LEFT", "CENTER", "RIGHT"][l]}</span>{warnings.filter(w => w.lane === l).map(w => <div key={w.i} className="a-rock" style={{ transform: `translate(-50%, ${w.progress * 245}px)` }}><svg viewBox="0 0 50 50" aria-hidden="true"><path fill="#cda284" stroke="#5b4235" strokeWidth="4" d="m12 5 25 3 10 17-8 17-22 5L3 29Z"/><path fill="#f4c6a5" d="m14 10 18 2-5 8-14 3Z"/></svg></div>)}{warnings.some(w => w.lane === l) && <span className="a-danger-label">! ROCK</span>}</div>)}</div><div className="a-player-ship" style={{ left: `${(round.lane + .5) * 100 / 3}%` }}><Ship/></div></> : <>
        <div className="a-timing-scene">{id === "sirens" ? <><div className="a-siren-mist"/><Ship/><span className="a-scene-caption">KEEP THE CREW ROWING</span></> : <><svg className="a-bow-art" viewBox="0 0 280 140" aria-hidden="true"><path d="M62 12q97 58 0 116" fill="none" stroke="#d3a765" strokeWidth="8"/><path d="m62 12 17 58-17 58" fill="none" stroke="#ead8b1" strokeWidth="2"/><path d="M72 70h144l-14-9m14 9-14 9" fill="none" stroke="#f6e9cd" strokeWidth="3"/>{[0, 1, 2, 3].map(i => <path key={i} d={`M${220 + i * 14} 32v78`} stroke="#79aba9" strokeWidth="4"/>)}</svg><span className="a-scene-caption">STEADY YOUR AIM</span></>}</div>
        <div className="a-timing-instruction">{target ? inZone ? "NOW!" : round.elapsed > target.at + round.window ? "Too late for this cue" : "Watch the marker" : "Next cue coming"}</div>
        <div className="a-timing-track" role="img" aria-label={inZone ? "Marker in the gold zone. Press now." : "Marker moving toward the gold zone."}><div className="a-target-zone" style={{ left: `${(zone - width / 2) * 100}%`, width: `${width * 100}%` }}><span>PRESS</span></div><div className="a-timing-marker" style={{ left: `${position * 100}%` }}/></div>
        <div className="a-cue-dots">{round.targets.map((_, i) => <span key={i} className={round.resolved.includes(i) ? "resolved" : ""}>{i + 1}</span>)}</div>
      </>}
      {phase !== "active" && <div className="a-round-overlay"><div className="a-overlay-panel">{phase === "countdown" ? <><span className="a-eyebrow">GET READY</span><strong className="a-count">{count}</strong><p>{lanes ? "Left / Right to dodge" : "Space or tap the action button"}</p></> : <><span className="a-eyebrow">TAKE A BREATH</span><h2>Voyage paused</h2><p>Your challenge clock is stopped.</p>{confirmLeave ? <><p>Leave this attempt? Completed encounters stay saved.</p><button className="a-btn a-primary" onClick={onLeave}>Leave attempt</button><button className="a-btn" onClick={() => setConfirmLeave(false)}>Keep playing</button></> : <><button className="a-btn a-primary" onClick={resume}>Resume with countdown</button><button className="a-btn" onClick={() => setConfirmLeave(true)}>Back to encounter</button></>}</>}</div></div>}
    </div>
    <p className="a-game-feedback" aria-live="polite" aria-atomic="true">{round.feedback}</p>
    <div className="a-game-controls">{lanes ? <><button className="a-btn a-control" disabled={phase !== "active"} onClick={() => action(-1)} aria-label="Move left">← <span>Left</span></button><span className="a-key-hint">← →<br/>or A / D</span><button className="a-btn a-control" disabled={phase !== "active"} onClick={() => action(1)} aria-label="Move right"><span>Right</span> →</button></> : <button className="a-btn a-primary a-action" disabled={phase !== "active" || !target} onClick={() => action()}>{id === "sirens" ? "Row" : "Release"}<kbd>SPACE</kbd></button>}</div>
    <div className="a-progress" style={{ "--progress": `${round.elapsed / round.duration * 100}%` } as CSSProperties} aria-hidden="true"><span/></div>
  </section>;
}
