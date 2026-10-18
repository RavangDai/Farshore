import { useEffect, useRef, useState } from "react";
import { trials, planLabel, planNames, trialFor, type Difficulty, type OpponentPlan, type TrialId } from "../lib/arcade";
import { songBeat, statusLabel } from "../lib/mythic";
import { createGame, gameAction, tickGame, isAdventure, demonstrate, type GameAction, type GameState } from "../lib/arcade-runtime";
import { adventureStatus } from "../lib/odyssey-games";
import { AdventureGame } from "./adventure-game";
import { MythicGame } from "./mythic-games";
import { FarshoreHUD, EncounterBanner } from "./farshore-hud";
import { CharacterPortrait } from "./farshore-art";
import { AIObservatory } from "./ai-observatory";

type Props = { id: TrialId; difficulty: Difficulty; plan: OpponentPlan; practice: boolean; seed: number; still: boolean; modelPrepared?: boolean; originalCave?: boolean; demo?: boolean; onSettings: () => void; onFinish: (round: GameState) => void; onLeave: () => void; onFeedback: (good: boolean) => void; onNote: (lane: number) => void };
export function ArcadeRound({ id, difficulty, plan, practice, seed, still, modelPrepared, originalCave, demo, onSettings, onFinish, onLeave, onFeedback, onNote }: Props) {
  const [round, setRound] = useState(() => createGame(id, difficulty, plan, practice, seed, originalCave));
  const current = useRef(round), finished = useRef(false), held = useRef(new Set<string>());
  const [phase, setPhase] = useState<"countdown" | "active" | "paused">("countdown"), [count, setCount] = useState(3), countdown = useRef(3000);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [burst, setBurst] = useState<{ label: string; good: boolean; key: number } | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (burstTimer.current) clearTimeout(burstTimer.current); }, []);
  const arena = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null), callbacks = useRef({ onFinish, onFeedback, onNote }), lastSung = useRef("");
  callbacks.current = { onFinish, onFeedback, onNote };
  const trial = originalCave ? { ...trialFor(id), title: "Cyclops’ Cave: Original Tactics", kind: "Grid stealth", controls: "Arrows / WASD or tap an adjacent tile. Sneak one tile, dash two, or hide beneath a sheep with Space. Evade each marked smash before it lands." } : trialFor(id);
  const strategy = originalCave ? planNames[plan.planId] : planLabel(id, plan);
  function commit(next: GameState) {
    if (next === current.current) return;
    const old = current.current; current.current = next; setRound(next);
    if (next.score > old.score || next.hits > old.hits) {
      if (burstTimer.current) clearTimeout(burstTimer.current);
      setBurst({ label: next.hits > old.hits ? "WATCH YOUR STEP" : `+${next.score - old.score}`, good: next.hits <= old.hits, key: Date.now() });
      burstTimer.current = setTimeout(() => setBurst(null), 900);
    }
    if (next.id === "sirens" && next.phase === "listen") {
      const i = Math.floor(next.timer / songBeat(next)), key = `${next.round}:${i}`;
      if (i < next.notes.length && key !== lastSung.current) { lastSung.current = key; if (!next.notes[i].rest) callbacks.current.onNote(next.notes[i].lane); }
    }
    if (next.score > old.score || next.hits > old.hits || next.misses > old.misses) callbacks.current.onFeedback(next.score > old.score);
    if (next.done && !finished.current) { finished.current = true; callbacks.current.onFinish(next); }
  }
  function act(action: GameAction) {
    if (phase !== "active" || finished.current) return;
    if (action.type === "note" && current.current.id === "sirens" && current.current.phase === "reply") callbacks.current.onNote(action.lane);
    commit(gameAction(current.current, action));
  }
  function release() { held.current.clear(); if (current.current.id === "scylla") commit(gameAction(current.current, { type: "row", held: false })); }
  function pause() { release(); setPhase("paused"); }
  function restartRound() { const next = createGame(id, difficulty, plan, practice, seed, originalCave); current.current = next; finished.current = false; lastSung.current = ""; held.current.clear(); setRound(next); resume(); }
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
          if (isAdventure(next) && next.id === "lotus") {
            const dx = Number(held.current.has("arrowright") || held.current.has("d")) - Number(held.current.has("arrowleft") || held.current.has("a"));
            const dy = Number(held.current.has("arrowdown") || held.current.has("s")) - Number(held.current.has("arrowup") || held.current.has("w"));
            if (dx || dy) next = gameAction(next, { type: "move", dx: dx ? dx : 0, dy: dx ? 0 : dy });
          }
          if (next.id === "scylla") {
            const direction = Number(held.current.has("arrowdown") || held.current.has("s")) - Number(held.current.has("arrowup") || held.current.has("w"));
            if (direction) next = gameAction(next, { type: "paddle", y: next.paddle + direction * 310 * pending / 1000 });
          }
          if (demo) next = demonstrate(next);
          commit(tickGame(next, pending)); pending = 0;
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
      if (document.querySelector(".a-modal")) return;
      if (e.key === "Escape") { e.preventDefault(); if (phase === "paused") resume(); else pause(); return; }
      if (phase === "paused" && e.key === "Tab") {
        const nodes = [...(overlay.current?.querySelectorAll<HTMLElement>("button, summary") || [])];
        if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); } return;
      }
      if (demo || phase !== "active" || (e.target as HTMLElement).closest("input,select,a,summary")) return;
      const k = e.key.toLowerCase(), state = current.current;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) && !(e.target as HTMLElement).closest("button")) e.preventDefault();
      if (k === " " && (e.target as HTMLElement).closest("button")) return;
      if (state.id === "scylla" && ["arrowup", "arrowdown", "w", "s", " "].includes(k)) { e.preventDefault(); held.current.add(k); if (k === " ") act({ type: "row", held: true }); return; }
      if (isAdventure(state) && state.id === "lotus" && ["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"].includes(k)) { e.preventDefault(); held.current.add(k); }
      if (e.repeat) return;
      if (isAdventure(state)) {
        const moves: Record<string, [number, number]> = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
        if (state.id === "aeolus" && [" ", "arrowup", "w"].includes(k)) { e.preventDefault(); act({ type: "lift" }); }
        else if (k === " " && state.id === "cyclops") { e.preventDefault(); act({ type: "jump" }); }
        else if (k === " " && state.id === "calypso") { e.preventDefault(); act({ type: "move", dx: 0, dy: -1 }); }
        else if (moves[k]) { e.preventDefault(); act({ type: "move", dx: moves[k][0], dy: moves[k][1] }); }
      } else if (state.id === "cyclops") {
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
    window.addEventListener("farshore:account-open", pause);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("farshore:account-open", pause); };
  }, [phase]);
  return <section data-trial={id} className="a-round m-round fs-round" aria-label={`${trial.title} ${practice ? "practice" : "challenge"}`}>
    <div className="a-round-top"><span className="fs-round-number">0{trials.findIndex(t => t.id === id) + 1}</span><div><span className="a-eyebrow">{demo ? "AI DEMONSTRATION / NO PROGRESS SAVED" : practice ? "PRACTICE" : plan.source === "ai" ? modelPrepared ? "MODEL-PLANNED AI BATTLE" : "ADAPTIVE AI BATTLE" : "ARCADE SOLO"} · {difficulty.toUpperCase()}</span><h2>{trial.title}</h2></div></div>
    <p className="od-round-objective">{practice && id === "lotus" ? "Rescue one sailor and bring them back to the ship." : originalCave ? "Original cave tactics / Reach either gold exit" : trial.objective}</p><FarshoreHUD state={round} onPause={pause}/>
    <div className="m-match-status"><span>{isAdventure(round) ? adventureStatus(round) : statusLabel(round)}</span><span>{strategy}</span></div>
    <AIObservatory state={round}/>
    <div ref={arena} tabIndex={0} className="m-arena" aria-label={`${trial.kind}. ${trial.controls}`}>
      <div className="fs-arena-stage" inert={phase !== "active"}>{(id === "circe" || id === "sirens") && <EncounterBanner id={id}/ >}{isAdventure(round) ? <AdventureGame state={round} active={phase === "active"} act={act} still={still}/> : <MythicGame state={round} active={phase === "active"} act={act} still={still}/>}</div>
      {burst && <span key={burst.key} className={`fs-action-burst ${burst.good ? "good" : "hurt"}`} aria-hidden="true">{burst.label}</span>}
      {phase !== "active" && <div ref={overlay} className="a-round-overlay" role={phase === "paused" ? "dialog" : "status"} aria-modal={phase === "paused" ? true : undefined} aria-label={phase === "paused" ? "Challenge paused" : "Get ready"}><div className="a-overlay-panel fs-stone-panel">{phase === "countdown" ? <><span className="a-eyebrow">{trial.kind.toUpperCase()}</span><strong className="a-count">{count}</strong><p>{trial.controls}</p></> : <><span className="a-eyebrow">TAKE A BREATH</span><h2>PAUSED</h2><p>Both rivals and every clock are stopped.</p>{confirmLeave ? <><p>Leave this attempt? Completed encounters stay saved.</p><button className="a-btn a-primary" onClick={onLeave}>Leave attempt</button><button className="a-btn" onClick={() => setConfirmLeave(false)}>Keep playing</button></> : <><button className="a-btn a-primary" onClick={resume}>Resume with countdown</button><button className="a-btn" onClick={restartRound}>Restart encounter</button><details className="od-pause-controls"><summary>Controls</summary><p>{trial.controls}</p></details><button className="a-btn" onClick={onSettings}>Settings</button><button className="a-btn" onClick={() => setConfirmLeave(true)}>Return to map</button></>}</>}</div></div>}
    </div>
    <p className="a-game-feedback" role="status" aria-live="polite">{round.feedback}</p>
    <div className="m-rival-speech"><CharacterPortrait tile={trial.portrait} label={trial.character}/><div><span>{trial.character} · {strategy}</span><p aria-live="polite">{round.rivalLine}</p></div></div>
    <p className="m-help">{id === "bow" ? "rings" : id === "circe" ? "brew points" : "points"} · {practice ? "Practice leaves your voyage progress untouched." : modelPrepared ? "The model chose the strategy. The rival takes actions locally during play." : plan.source === "ai" ? "Adaptive rival logic reacts during play." : "Solo rivals use learnable strategies."}</p>
  </section>;
}
