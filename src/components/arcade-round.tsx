import { useEffect, useRef, useState, type CSSProperties } from "react";
import { activeCue, markerPosition, moveLane, newRound, planNames, pressTiming, tickRound, trialFor, visibleCue, type Difficulty, type OpponentPlan, type Round, type TrialId } from "../lib/arcade";
import { BowScene, CyclopsScene, SirensScene } from "./arcade-scenes";
export { Ship } from "./arcade-scenes";

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

  const index = activeCue(round), visibleIndex = visibleCue(round);
  const target = visibleIndex >= 0 ? round.targets[visibleIndex] : null;
  const position = target ? markerPosition(round, target) : .5;
  const edges = target ? [markerPosition(round, target, target.at - round.window), markerPosition(round, target, target.at + round.window)].sort((a, b) => a - b) : [.45, .55];
  const inZone = index >= 0 && !!target && Math.abs(round.elapsed - target.at) <= round.window;
  const judgment = round.judgments[visibleIndex];
  const seconds = Math.ceil((round.duration - round.elapsed) / 1000);
  return <section className="a-round" aria-label={trial.title + (practice ? " practice" : " challenge")}>
    <div className="a-round-top"><div><span className="a-eyebrow">{practice ? "PRACTICE · NO SCORE" : plan.source === "ai" ? "AI RIVAL" : "STANDARD RIVAL"} · {difficulty.toUpperCase()}</span><h2>{trial.title}</h2></div><button className="a-btn a-small" onClick={() => setPhase("paused")} aria-label="Pause challenge">Ⅱ Pause</button></div>
    <div className="a-game-hud"><span className="a-hud-goal">{lanes ? `Hull ${"♥".repeat(Math.max(0, 3 - round.hits))}${"♡".repeat(Math.min(3, round.hits))}` : `${round.successes} / ${practice ? round.targets.length : round.needed} ${id === "sirens" ? "strokes needed" : "shots needed"}`}</span><span>{lanes ? `${seconds}s to safety` : `Attempt ${Math.min(round.targets.length, visibleIndex + 1)} / ${round.targets.length}`}</span></div>
    <div className="a-tactic-strip"><span>Tactic: <strong>{planNames[plan.planId]}</strong></span><span>{round.combo > 1 ? `${round.combo}× streak` : lanes ? "Red lanes lock before impact" : `Precision ±${round.window} ms`}</span></div>
    <div ref={board} className={"a-game-board " + (lanes ? "a-lane-board" : "a-timing-board") + (still ? " a-still" : "")} tabIndex={0} aria-label={lanes ? "Ship controls. Use left and right arrows." : "Timing controls. Press Space in the gold zone."}>
      <div className="a-stage-art" style={{ backgroundPosition: `${(trial.tile % 3) * 50}% ${Math.floor(trial.tile / 3) * 100}%` }} />
      {lanes ? <CyclopsScene round={round} still={still}/> : <>
        {id === "sirens" ? <SirensScene round={round} still={still}/> : <BowScene round={round}/>}
        <div className="a-timing-instruction">{judgment ? judgment === "good" ? "A clean hit!" : "Watch the next attempt" : inZone ? id === "sirens" ? "ROW NOW!" : "RELEASE!" : target?.reverse ? "← Follow the returning marker" : "Follow the marker →"}</div>
        <div className={"a-timing-track" + (judgment ? " a-shot-active" : "")} role="img" aria-label={inZone ? "Marker in the gold zone. Press now." : "Marker moving toward the gold zone."}><div className="a-target-zone" style={{ left: `${edges[0] * 100}%`, width: `${(edges[1] - edges[0]) * 100}%` }}/><div className="a-timing-marker" style={{ left: `${position * 100}%` }}/></div>
        <div className="a-cue-dots" aria-label="Attempt results">{round.targets.map((_, i) => <span key={i} className={round.judgments[i] || ""} title={`Attempt ${i + 1}: ${round.judgments[i] || "waiting"}`}/>)}</div>
      </>}
      {phase !== "active" && <div className={"a-round-overlay" + (phase === "paused" ? " a-paused" : "")}><div className="a-overlay-panel">{phase === "countdown" ? <><span className="a-eyebrow">GET READY</span><strong className="a-count">{count}</strong><p>{lanes ? "Left / Right to dodge" : "Space or tap the action button"}</p></> : <><span className="a-eyebrow">TAKE A BREATH</span><h2>Voyage paused</h2><p>Your challenge clock is stopped.</p>{confirmLeave ? <><p>Leave this attempt? Completed encounters stay saved.</p><button className="a-btn a-primary" onClick={onLeave}>Leave attempt</button><button className="a-btn" onClick={() => setConfirmLeave(false)}>Keep playing</button></> : <><button className="a-btn a-primary" onClick={resume}>Resume with countdown</button><button className="a-btn" onClick={() => setConfirmLeave(true)}>Back to encounter</button></>}</>}</div></div>}
    </div>
    <p className={"a-game-feedback " + (round.elapsed - round.feedbackAt < 800 && round.resolved.length ? round.judgments[round.resolved.at(-1)!] === "good" ? "a-feedback-good" : "a-feedback-bad" : "")} aria-live="polite" aria-atomic="true">{round.feedback}</p>
    <div className="a-game-controls">{lanes ? <><button className="a-btn a-control" disabled={phase !== "active"} onClick={() => action(-1)} aria-label="Move left">← <span>Left</span></button><span className="a-key-hint">← →<br/>or A / D</span><button className="a-btn a-control" disabled={phase !== "active"} onClick={() => action(1)} aria-label="Move right"><span>Right</span> →</button></> : <button className="a-btn a-primary a-action" disabled={phase !== "active" || index < 0} onClick={() => action()}>{id === "sirens" ? "Row" : "Release"}<kbd>SPACE</kbd></button>}</div>
    <div className="a-progress" style={{ "--progress": `${round.elapsed / round.duration * 100}%` } as CSSProperties} aria-hidden="true"><span/></div>
  </section>;
}
