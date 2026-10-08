import { useEffect, useRef, useState } from "react";
import { planNames, trialFor, type Difficulty, type OpponentPlan, type TrialId } from "../lib/arcade";
import { mythicAction, newMythic, scoreLabel, songBeat, statusLabel, tickMythic, type Action, type MythicState } from "../lib/mythic";
import { MythicGame } from "./mythic-games";

type Props = { id: TrialId; difficulty: Difficulty; plan: OpponentPlan; practice: boolean; seed: number; still: boolean; modelPrepared?: boolean; onFinish: (round: MythicState) => void; onLeave: () => void; onFeedback: (good: boolean) => void; onNote: (lane: number) => void };
export function ArcadeRound({ id, difficulty, plan, practice, seed, still, modelPrepared, onFinish, onLeave, onFeedback, onNote }: Props) {
  const [round, setRound] = useState(() => newMythic(id, difficulty, plan, practice, seed));
  const current = useRef(round), finished = useRef(false), held = useRef(new Set<string>());
  const [phase, setPhase] = useState<"countdown" | "active" | "paused">("countdown"), [count, setCount] = useState(3), countdown = useRef(3000);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const arena = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null), callbacks = useRef({ onFinish, onFeedback, onNote }), lastSung = useRef("");
  callbacks.current = { onFinish, onFeedback, onNote };
  const trial = trialFor(id);
  function commit(next: MythicState) {
    if (next === current.current) return;
    const old = current.current; current.current = next; setRound(next);
    if (next.id === "sirens" && next.phase === "listen") {
      const i = Math.floor(next.timer / songBeat(next)), key = `${next.round}:${i}`;
      if (i < next.notes.length && key !== lastSung.current) { lastSung.current = key; if (!next.notes[i].rest) callbacks.current.onNote(next.notes[i].lane); }
    }
    if (next.score > old.score || next.hits > old.hits || next.misses > old.misses) callbacks.current.onFeedback(next.score > old.score);
    if (next.done && !finished.current) { finished.current = true; callbacks.current.onFinish(next); }
  }
  function act(action: Action) {
    if (phase !== "active" || finished.current) return;
    if (action.type === "note" && current.current.id === "sirens" && current.current.phase === "reply") callbacks.current.onNote(action.lane);
    commit(mythicAction(current.current, action));
  }
  function release() { held.current.clear(); if (current.current.id === "scylla") commit(mythicAction(current.current, { type: "row", held: false })); }
  function pause() { release(); setPhase("paused"); }
  function resume() { countdown.current = 3000; setCount(3); setConfirmLeave(false); setPhase("countdown"); }
  useEffect(() => { if (phase === "active") arena.current?.focus(); else if (phase === "paused") overlay.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [phase, confirmLeave]);
  useEffect(() => {
    if (phase === "paused") return;
    let previous = 0, handle = 0, pending = 0;
    function frame(now: number) {
      const gap = previous ? now - previous : 0; previous = now;
      // A visible tab can stall briefly while fonts or tooling load. The
      // bounded delta preserves reaction time; only backgrounding pauses it.
      if (gap > 500 && document.hidden) { pause(); return; }
      const delta = Math.min(100, gap);
      if (phase === "countdown") { countdown.current -= delta; setCount(Math.max(1, Math.ceil(countdown.current / 1000))); if (countdown.current <= 0) { setPhase("active"); return; } }
      else {
        pending += delta;
        if (pending >= 32) {
          let next = current.current;
          if (next.id === "scylla") {
            const direction = Number(held.current.has("arrowdown") || held.current.has("s")) - Number(held.current.has("arrowup") || held.current.has("w"));
            if (direction) next = mythicAction(next, { type: "paddle", y: next.paddle + direction * 310 * pending / 1000 });
          }
          commit(tickMythic(next, pending)); pending = 0;
        }
      }
      if (!finished.current) handle = requestAnimationFrame(frame);
    }
    handle = requestAnimationFrame(frame); return () => cancelAnimationFrame(handle);
  }, [phase]);
  useEffect(() => {
    function visibility() { if (document.hidden) pause(); }
    function blur() { pause(); }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); pause(); return; }
      if (phase === "paused" && e.key === "Tab") {
        const nodes = [...(overlay.current?.querySelectorAll<HTMLButtonElement>("button") || [])];
        if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); } return;
      }
      if (phase !== "active" || (e.target as HTMLElement).closest("input,select,a,summary")) return;
      const k = e.key.toLowerCase(), state = current.current;
      if (k === " " && (e.target as HTMLElement).closest("button")) return;
      if (state.id === "scylla" && ["arrowup", "arrowdown", "w", "s", " "].includes(k)) { e.preventDefault(); held.current.add(k); if (k === " ") act({ type: "row", held: true }); return; }
      if (e.repeat) return;
      if (state.id === "cyclops") {
        const moves: Record<string, [number, number]> = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
        if (moves[k]) { e.preventDefault(); act({ type: "move", dx: moves[k][0], dy: moves[k][1] }); }
        else if (k === " ") { e.preventDefault(); act({ type: "hide" }); }
      } else if (state.id === "circe") {
        if (["arrowleft", "arrowright", "arrowup", "a", "d", "w", " "].includes(k)) { e.preventDefault(); if (["arrowleft", "a"].includes(k)) act({ type: "column", direction: -1 }); else if (["arrowright", "d"].includes(k)) act({ type: "column", direction: 1 }); else act({ type: k === " " ? "drop" : "rotate" }); }
      } else if (state.id === "sirens" && ["a", "s", "d", "f", "1", "2", "3", "4"].includes(k)) { e.preventDefault(); act({ type: "note", lane: /^[1-4]$/.test(k) ? Number(k) - 1 : ["a", "s", "d", "f"].indexOf(k) }); }
      else if (state.id === "bow" && k === " ") { e.preventDefault(); act({ type: "shoot" }); }
    }
    function keyUp(e: KeyboardEvent) { held.current.delete(e.key.toLowerCase()); if (e.key === " " && current.current.id === "scylla") act({ type: "row", held: false }); }
    window.addEventListener("keydown", key); window.addEventListener("keyup", keyUp); window.addEventListener("blur", blur); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); };
  }, [phase]);
  return <section className="a-round m-round" aria-label={`${trial.title} ${practice ? "practice" : "challenge"}`}>
    <div className="a-round-top"><div><span className="a-eyebrow">{practice ? "PRACTICE" : plan.source === "ai" ? modelPrepared ? "MODEL-PLANNED AI BATTLE" : "ADAPTIVE AI BATTLE" : "ARCADE SOLO"} · {difficulty.toUpperCase()}</span><h2>{trial.title}</h2></div><button className="a-btn a-small" onClick={pause} aria-label="Pause challenge">Ⅱ Pause</button></div>
    <div className="m-scoreboard"><div><span>ODYSSEUS</span><strong>{String(round.score).padStart(3, "0")}</strong></div><span className="m-score-vs">VS</span><div><span>{trial.character.toUpperCase()}</span><strong>{id === "circe" || id === "bow" ? String(round.rivalScore).padStart(3, "0") : id === "cyclops" ? `${round.hits} / 3` : id === "sirens" && round.id === "sirens" ? `${round.temptation}%` : `${round.hits} / 5`}</strong></div></div>
    <div className="m-match-status"><span>{statusLabel(round)}</span><span>{planNames[plan.planId]}</span></div>
    <div ref={arena} tabIndex={0} className="m-arena" aria-label={`${trial.kind}. ${trial.controls}`}>
      <div inert={phase !== "active"}><MythicGame state={round} active={phase === "active"} act={act} still={still}/></div>
      {phase !== "active" && <div ref={overlay} className="a-round-overlay" role={phase === "paused" ? "dialog" : "status"} aria-modal={phase === "paused" ? true : undefined} aria-label={phase === "paused" ? "Challenge paused" : "Get ready"}><div className="a-overlay-panel">{phase === "countdown" ? <><span className="a-eyebrow">{trial.kind.toUpperCase()}</span><strong className="a-count">{count}</strong><p>{trial.controls}</p></> : <><span className="a-eyebrow">TAKE A BREATH</span><h2>Voyage paused</h2><p>Both rivals and every clock are stopped.</p>{confirmLeave ? <><p>Leave this attempt? Completed encounters stay saved.</p><button className="a-btn a-primary" onClick={onLeave}>Leave attempt</button><button className="a-btn" onClick={() => setConfirmLeave(false)}>Keep playing</button></> : <><button className="a-btn a-primary" onClick={resume}>Resume with countdown</button><button className="a-btn" onClick={() => setConfirmLeave(true)}>Back to encounter</button></>}</>}</div></div>}
    </div>
    <p className="a-game-feedback" role="status" aria-live="polite">{round.feedback}</p>
    <div className="m-rival-speech"><span className="m-mini-portrait" style={{ backgroundPosition: `${trial.portrait % 5 * 25}% ${Math.floor(trial.portrait / 5) * 100 / 3}%` }}/><div><span>{trial.character} · {planNames[plan.planId]}</span><p aria-live="polite">{round.rivalLine}</p></div></div>
    <p className="m-help">{scoreLabel(round)} · {practice ? "Practice leaves your voyage progress untouched." : modelPrepared ? "The model chose the strategy. The rival takes actions locally during play." : plan.source === "ai" ? "Adaptive rival logic reacts during play." : "Solo rivals use learnable strategies."}</p>
  </section>;
}
