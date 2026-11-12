"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BrainCircuit, Heart, LogOut, Pause, Play, RefreshCw, RotateCcw, Shuffle } from "lucide-react";
import { difficultyNames, planLabel, type Difficulty, type OpponentPlan } from "../../lib/arcade/arcade";
import type { LotusLayout, LotusState } from "../../lib/encounters/odyssey-games";
import { freshLayout } from "../../lib/encounters/lotus-layouts";
import { aiAwaitingDecision, describeResult, newRace, raceTick, type LotusRace, type RaceResult } from "../../lib/encounters/lotus-race";
import { ACTIONS, TICK_MS, liveLine, observe } from "../../lib/ai/lotus-agent";
import { loadLotusPolicy, type LotusModelMeta, type LotusPolicy } from "../../lib/ai/lotus-onnx";
import { audioFrame, type AudioFrame } from "../../lib/audio/cues";
import { useFarshoreItems, useFarshoreSprites } from "../../lib/render/farshore-rendering";
import { LOTUS_UNIT, drawLotusGarden } from "./adventure-game";
import { GameStage } from "./game-stage";

/**
 * The Lotus-Eaters Rescue Race: you on the left board, the trained rival on
 * the right, the same garden and guardians on both, one shared clock.
 *
 * The race runs in fixed 10 ms ticks (lib/encounters/lotus-race.ts). When the
 * rival's move is due, its PPO policy (ONNX, in the browser) is asked once and
 * the clock waits for the answer, so neither board gains a movement
 * opportunity. The boards are painted straight onto their canvases from the
 * animation loop; React only re-renders when a number on screen changes.
 * There is no commentary and no language model in the race.
 */

type Phase = "loading" | "error" | "countdown" | "running" | "paused" | "done";
type Props = {
  difficulty: Difficulty;
  plan: OpponentPlan;
  layout: LotusLayout;
  onLeave: () => void;
  onAudio?: (frame: AudioFrame) => void;
};
type SideHud = { rescued: number; hits: number; carrying: boolean; out: boolean; won: boolean };
type Hud = { tenths: number; left: number; human: SideHud; ai: SideHud; aiLine: string; aiAction: number | null; decisions: number; you: string; rival: string };

const PAD = 6;
const BOARD_W = 15 * LOTUS_UNIT + PAD * 2;
const BOARD_H = 11 * LOTUS_UNIT + PAD * 2;
const KEYS: Record<string, [number, number]> = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };

const sideHud = (s: LotusState): SideHud => ({ rescued: s.rescued, hits: s.hits, carrying: s.carrying, out: s.done && !s.won && s.hits >= 3, won: s.won });
function hudOf(r: LotusRace): Hud {
  return { tenths: Math.floor(r.tick / 10), left: Math.max(0, Math.ceil((r.human.duration - r.tick * TICK_MS) / 1000)), human: sideHud(r.human), ai: sideHud(r.ai), aiLine: liveLine(r.ai, r.aiLastAction), aiAction: r.aiLastAction, decisions: r.aiDecisions, you: `${r.human.player.x},${r.human.player.y}`, rival: `${r.ai.player.x},${r.ai.player.y}` };
}
const clock = (tenths: number) => `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;

function drawBoard(canvas: HTMLCanvasElement | null, s: LotusState, sprites: HTMLImageElement | null, items: HTMLImageElement | null, side: "human" | "ai") {
  const c = canvas?.getContext("2d");
  if (!c || !canvas) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(BOARD_W * ratio)) { canvas.width = Math.round(BOARD_W * ratio); canvas.height = Math.round(BOARD_H * ratio); }
  c.setTransform(ratio, 0, 0, ratio, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, BOARD_H);
  g.addColorStop(0, "#0d2a24"); g.addColorStop(1, "#06141c");
  c.fillStyle = g; c.fillRect(0, 0, BOARD_W, BOARD_H);
  c.save(); c.translate(PAD, PAD);
  drawLotusGarden(c, s, sprites, items, false);
  c.restore();
  c.strokeStyle = side === "human" ? "#e9b85c99" : "#32d4f599"; c.lineWidth = 2; c.strokeRect(1, 1, BOARD_W - 2, BOARD_H - 2);
  if (s.done) {
    c.fillStyle = s.won ? "#e9b85c2a" : "#020a12b8"; c.fillRect(0, 0, BOARD_W, BOARD_H);
    c.fillStyle = s.won ? "#ffe4a3" : "#cfdbe2"; c.font = "bold 34px Georgia"; c.textAlign = "center";
    c.fillText(s.won ? "ALL CREW ABOARD" : s.hits >= 3 ? "CAUGHT · OUT OF THE RACE" : "TIME", BOARD_W / 2, BOARD_H / 2 + 12);
  }
}

function Crew({ rescued, carrying }: { rescued: number; carrying: boolean }) {
  return (
    <span className="fs-race-crew" aria-label={`${rescued} of 3 sailors aboard${carrying ? ", escorting one" : ""}`}>
      {[0, 1, 2].map(i => <i key={i} data-on={i < rescued || undefined} data-escort={(i === rescued && carrying) || undefined} />)}
    </span>
  );
}
function Lives({ hits }: { hits: number }) {
  return <span className="fs-race-lives" aria-label={`${3 - hits} of 3 lives`}>{[0, 1, 2].map(i => <Heart key={i} size={13} fill="currentColor" className={i < 3 - hits ? "full" : "empty"} />)}</span>;
}

export function LotusRaceRound({ difficulty, plan, layout: initialLayout, onLeave, onAudio }: Props) {
  const [layout, setLayout] = useState(initialLayout);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<LotusModelMeta | null>(null);
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState<Hud | null>(null);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [showAi, setShowAi] = useState(true);
  const race = useRef<LotusRace | null>(null);
  const policy = useRef<LotusPolicy | null>(null);
  const ready = useRef<{ race: LotusRace; tick: number; action: number } | null>(null);
  const inflight = useRef(false);
  const held = useRef(new Set<string>());
  const humanCanvas = useRef<HTMLCanvasElement>(null), aiCanvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const sprites = useFarshoreSprites(), items = useFarshoreItems();
  const images = useRef({ sprites, items });
  images.current = { sprites, items };
  const audio = useRef(onAudio);
  audio.current = onAudio;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const lastHud = useRef("");
  const heard = useRef<LotusState | null>(null);

  const paint = useCallback(() => {
    const r = race.current;
    if (!r) return;
    drawBoard(humanCanvas.current, r.human, images.current.sprites, images.current.items, "human");
    drawBoard(aiCanvas.current, r.ai, images.current.sprites, images.current.items, "ai");
    const next = hudOf(r), key = JSON.stringify(next);
    if (key !== lastHud.current) { lastHud.current = key; setHud(next); }
  }, []);

  /** Asks the trained policy for the rival's move at the current tick. The clock waits for the answer. */
  const decide = useCallback(() => {
    const r = race.current, p = policy.current;
    if (!r || !p || inflight.current || !aiAwaitingDecision(r) || ready.current?.race === r) return;
    inflight.current = true;
    const tick = r.tick, started = performance.now();
    p.act(observe(r.ai, p.meta.obsVersion)).then(({ action }) => {
      inflight.current = false;
      if (race.current !== r || r.tick !== tick) return;
      ready.current = { race: r, tick, action };
      setLatency(performance.now() - started);
    }).catch(e => {
      inflight.current = false;
      setError(`The trained rival stopped responding: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
    });
  }, []);

  const start = useCallback((next: LotusLayout) => {
    race.current = newRace(next, difficulty, plan);
    ready.current = null;
    heard.current = structuredClone(race.current.human);
    held.current.clear();
    setResult(null);
    setCount(3);
    setPhase("countdown");
    // A frame later the canvases exist; paint the starting garden and ask for the first move.
    requestAnimationFrame(() => { paint(); decide(); });
  }, [difficulty, plan, paint, decide]);

  const loadModel = useCallback(() => {
    setPhase("loading");
    setError("");
    loadLotusPolicy().then(p => { policy.current = p; setMeta(p.meta); start(layout); }).catch(e => {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    });
  }, [layout, start]);

  useEffect(() => { loadModel(); }, []);

  const pause = useCallback(() => {
    if (phaseRef.current !== "running" && phaseRef.current !== "countdown") return;
    held.current.clear();
    audio.current?.({ cues: [], loops: {}, scene: "garden" });
    setPhase("paused");
  }, []);
  const resume = () => { setCount(3); setPhase("countdown"); };
  const again = () => start(layout);
  const newMaze = () => { const next = freshLayout(); setLayout(next); start(next); };

  // The countdown, shared by the start and every resume.
  useEffect(() => {
    if (phase !== "countdown") return;
    let left = 3000, last = 0, handle = 0, shown = 0;
    const frame = (now: number) => {
      left -= last ? Math.min(100, now - last) : 0;
      last = now;
      const n = Math.max(1, Math.ceil(left / 1000));
      if (n !== shown) { shown = n; setCount(n); audio.current?.({ cues: [{ sound: "countdown", rate: n === 1 ? 1.12 : 1 }], loops: {}, scene: "garden" }); }
      if (left <= 0) { audio.current?.({ cues: [{ sound: "go" }], loops: {}, scene: "garden" }); setPhase("running"); return; }
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [phase]);

  // The race clock.
  useEffect(() => {
    if (phase !== "running") return;
    let handle = 0, last = 0, pending = 0;
    const frame = (now: number) => {
      const r = race.current;
      if (!r) return;
      const gap = last ? now - last : 0;
      last = now;
      if (gap > 500 && document.hidden) { pause(); return; }
      pending = Math.min(250, pending + Math.min(100, gap));
      while (pending >= TICK_MS && !r.result) {
        let action: number | null = null;
        if (aiAwaitingDecision(r)) {
          const choice = ready.current;
          if (!choice || choice.race !== r || choice.tick !== r.tick) { decide(); break; }
          action = choice.action;
          ready.current = null;
        }
        const has = (k: string) => held.current.has(k);
        const dx = Number(has("arrowright") || has("d")) - Number(has("arrowleft") || has("a"));
        const dy = Number(has("arrowdown") || has("s")) - Number(has("arrowup") || has("w"));
        const aiBefore = r.ai.rescued;
        raceTick(r, dx || dy ? { dx: dx ? dx : 0, dy: dx ? 0 : dy } : null, action);
        if (r.ai.rescued > aiBefore) audio.current?.({ cues: [{ sound: "ting", gain: 0.55, pan: 0.6 }], loops: {}, scene: "garden" });
        pending -= TICK_MS;
      }
      if (aiAwaitingDecision(r)) decide();
      const sounded = structuredClone(r.human);
      audio.current?.(audioFrame(heard.current, sounded));
      heard.current = sounded;
      paint();
      if (r.result) { setResult(r.result); setPhase("done"); audio.current?.({ cues: [{ sound: r.result.winner === "human" ? "victory" : r.result.winner === "ai" ? "defeat" : "reply" }], loops: {}, scene: "garden" }); return; }
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [phase, decide, paint, pause]);

  // Keyboard, focus and visibility.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector(".a-modal")) return;
      const k = e.key.toLowerCase();
      if (k === "escape") { e.preventDefault(); if (phaseRef.current === "paused") resume(); else pause(); return; }
      if (KEYS[k] && phaseRef.current === "running") { e.preventDefault(); held.current.add(k); }
    };
    const up = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase());
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [pause]);

  useEffect(() => { overlay.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [phase]);
  // Repaint when the art arrives.
  useEffect(() => { paint(); }, [sprites, items, paint]);

  const press = (k: string, down: boolean) => { if (down && phaseRef.current === "running") held.current.add(k); else held.current.delete(k); };
  const pad = (k: string, label: string, icon: ReactNode) => (
    <button aria-label={label} onPointerDown={e => { e.preventDefault(); press(k, true); }} onPointerUp={() => press(k, false)} onPointerLeave={() => press(k, false)} onPointerCancel={() => press(k, false)}>{icon}</button>
  );

  const h = hud;
  const trained = !!meta && !!policy.current;
  const words = result ? describeResult(result) : null;
  const checkpoint = meta ? `${meta.label} · ${meta.steps.toLocaleString()} steps` : "";
  const veil = phase === "running" ? null : (
    <div ref={overlay} className="fs-stage-veil fs-race-veil" role={phase === "paused" || phase === "done" || phase === "error" ? "dialog" : "status"} aria-modal={phase === "paused" || phase === "done" ? true : undefined} data-phase={phase}>
      <div className="fs-veil-panel fs-race-panel">
        {phase === "loading" && <>
          <span className="a-eyebrow">RESCUE RACE</span>
          <h2>Loading the trained rival…</h2>
          <p>The PPO policy runs in your browser. Nothing starts until it is ready.</p>
        </>}
        {phase === "error" && <>
          <span className="a-eyebrow">RESCUE RACE</span>
          <h2>The trained rival could not be loaded</h2>
          <p role="alert">{error}</p>
          <p className="fs-race-small">No rival is driven by anything else: without the trained model there is no race.</p>
          <button className="a-btn a-primary fs-rich" onClick={loadModel}><RefreshCw size={17} /><span><b>Try again</b><small>Reload the trained model</small></span></button>
          <button className="a-btn fs-rich" onClick={onLeave}><LogOut size={17} /><span><b>Back to the briefing</b><small>Solo play is unaffected</small></span></button>
        </>}
        {phase === "countdown" && <>
          <span className="a-eyebrow">YOU VS TRAINED AI · {layout.name.toUpperCase()}</span>
          <strong className="fs-veil-count" key={count}>{count}</strong>
          <p>Same garden, same guardians, one clock. Bring all three sailors aboard first. Arrows or WASD to move; Escape pauses.</p>
          <p className="fs-race-small">Rival: {checkpoint}</p>
        </>}
        {phase === "paused" && <>
          <span className="a-eyebrow">RACE PAUSED</span>
          <h2>Both boards are stopped</h2>
          <p>The clock, both rescuers and every guardian wait for you.</p>
          <button className="a-btn a-primary fs-rich" onClick={resume}><Play size={17} /><span><b>Resume</b><small>A 3-second countdown first</small></span><kbd>Esc</kbd></button>
          <button className="a-btn fs-rich" onClick={again}><RotateCcw size={17} /><span><b>Race again</b><small>Same garden, fresh start</small></span></button>
          <button className="a-btn fs-rich" onClick={newMaze}><Shuffle size={17} /><span><b>New maze</b><small>A fresh validated garden</small></span></button>
          <button className="a-btn fs-rich" onClick={onLeave}><LogOut size={17} /><span><b>Leave the race</b><small>Back to the briefing</small></span></button>
        </>}
        {phase === "done" && result && words && <div className="fs-race-result" data-winner={result.winner}>
          <span className="a-eyebrow">RESCUE RACE · {layout.name.toUpperCase()} · {difficultyNames[difficulty].toUpperCase()}</span>
          <h2>{words.headline}</h2>
          <p>{words.why}</p>
          <table className="fs-race-table">
            <thead><tr><th scope="col"><span className="sr-only">Measure</span></th><th scope="col">You</th><th scope="col">Trained AI</th></tr></thead>
            <tbody>
              <tr><th scope="row">Sailors aboard</th><td>{result.human.rescued}/3</td><td>{result.ai.rescued}/3</td></tr>
              <tr><th scope="row">Finish time</th><td>{words.time(result.human.finishMs)}</td><td>{words.time(result.ai.finishMs)}</td></tr>
              <tr><th scope="row">Damage taken</th><td>{result.human.damage}</td><td>{result.ai.damage}</td></tr>
              <tr><th scope="row">Relics <small>(not scored)</small></th><td>{result.human.relics}</td><td>{result.ai.relics}</td></tr>
            </tbody>
          </table>
          <p className="fs-race-small">Race time {(result.ms / 1000).toFixed(1)} s · Rival: {checkpoint}</p>
          <div className="fs-race-actions">
            <button className="a-btn a-primary fs-rich" onClick={again}><RotateCcw size={17} /><span><b>Race again</b><small>Same garden</small></span></button>
            <button className="a-btn fs-rich" onClick={newMaze}><Shuffle size={17} /><span><b>New maze</b><small>A fresh validated garden</small></span></button>
            <button className="a-btn fs-rich" onClick={onLeave}><LogOut size={17} /><span><b>Back to the briefing</b><small>Nothing is saved</small></span></button>
          </div>
        </div>}
      </div>
    </div>
  );

  return (
    <GameStage label="Lotus-Eaters rescue race" overlay={veil}>
      <div className="fs-race" data-phase={phase} data-show-ai={showAi || undefined} data-you={h?.you} data-rival={h?.rival} style={{ "--fs-race-ratio": `${BOARD_W} / ${BOARD_H}` } as CSSProperties}>
        <header className="fs-race-bar">
          <div className="fs-race-side" data-side="human">
            <b>YOU</b>
            {h && <><Crew rescued={h.human.rescued} carrying={h.human.carrying} /><Lives hits={h.human.hits} /></>}
          </div>
          <div className="fs-race-clock" aria-label="Race clock">
            <strong>{h ? clock(h.tenths) : "0:00.0"}</strong>
            <small>{layout.name} · {difficultyNames[difficulty]} · {planLabel("lotus", plan)}{h ? ` · ${h.left}s left` : ""}</small>
          </div>
          <div className="fs-race-side" data-side="ai">
            {h && <><Lives hits={h.ai.hits} /><Crew rescued={h.ai.rescued} carrying={h.ai.carrying} /></>}
            <b>{trained ? "TRAINED AI" : "RIVAL"}</b>
          </div>
          <button className="fs-race-pause" onClick={pause} aria-label="Pause the race" disabled={phase !== "running"}><Pause size={16} /></button>
        </header>
        <div className="fs-race-boards">
          <figure className="fs-race-board" data-side="human">
            <figcaption><span>YOU</span><small>Arrows or WASD · Escape pauses</small></figcaption>
            <div className="fs-race-live" data-side="human">
              <span className="fs-race-live-tag">YOUR RUN</span>
              <span className="fs-race-live-line">{h ? (h.human.out ? "Out of the race" : h.human.won ? "All crew aboard" : h.human.carrying ? "Escorting sailor" : "Seeking crew") : "Ready"} · Crew aboard {h?.human.rescued ?? 0}/3</span>
            </div>
            <canvas ref={humanCanvas} width={BOARD_W} height={BOARD_H} role="img" aria-label={`Your garden. ${h?.human.rescued ?? 0} of 3 sailors aboard.`} />
          </figure>
          <figure className="fs-race-board" data-side="ai">
            <figcaption>
              <span>{trained ? "TRAINED AI" : "RIVAL"}</span>
              <small>{meta ? checkpoint : "No model loaded"}</small>
              <button className="fs-race-ai-toggle" onClick={() => setShowAi(v => !v)} aria-expanded={showAi}>{showAi ? "Hide board" : "Show board"}</button>
            </figcaption>
            <div className="fs-race-live" data-side="ai" aria-live="off">
              <span className="fs-race-live-tag"><BrainCircuit size={13} /> AI LIVE</span>
              <span className="fs-race-live-line" data-action={h?.aiAction === null || h?.aiAction === undefined ? "none" : ACTIONS[h.aiAction]}>{h?.aiLine ?? "Waiting for the model"}</span>
              <small>{h?.decisions ?? 0} moves{latency !== null ? ` · ${latency < 1 ? "<1" : latency.toFixed(0)} ms` : ""}</small>
            </div>
            <canvas ref={aiCanvas} width={BOARD_W} height={BOARD_H} role="img" aria-label={`The trained rival's garden. ${h?.ai.rescued ?? 0} of 3 sailors aboard.`} />
          </figure>
        </div>
        <div className="fs-race-pad" aria-label="Move Odysseus">
          {pad("arrowup", "Move up", <ArrowUp size={20} />)}
          {pad("arrowleft", "Move left", <ArrowLeft size={20} />)}
          {pad("arrowdown", "Move down", <ArrowDown size={20} />)}
          {pad("arrowright", "Move right", <ArrowRight size={20} />)}
        </div>
        <p className="sr-only" aria-live="polite">{h ? `You ${h.human.rescued} of 3. Trained AI ${h.ai.rescued} of 3.` : ""}</p>
      </div>
    </GameStage>
  );
}
