"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BrainCircuit, Footprints, LogOut, Pause, Play, RefreshCw, Repeat, RotateCcw, Shuffle, Sparkles, UserPlus } from "lucide-react";
import { difficultyNames, planLabel, type Difficulty, type OpponentPlan } from "../../lib/arcade/arcade";
import type { LotusLayout, LotusState, Point } from "../../lib/encounters/odyssey-games";
import { freshLayout } from "../../lib/encounters/lotus-layouts";
import { HUNT, cycleHunter, describeHunt, huntAwaitingDecision, huntTick, leapLive, newHunt, pickAction, possess, toggleThird, type HuntEvent, type HuntResult, type LotusHunt, type ThirdPhase } from "../../lib/encounters/lotus-hunt";
import { ACTIONS, TICK_MS, liveLine, observe } from "../../lib/ai/lotus-agent";
import { loadLotusPolicy, type LotusModelMeta, type LotusPolicy } from "../../lib/ai/lotus-onnx";
import { audioFrame, type AudioFrame, type Cue } from "../../lib/audio/cues";
import { useFarshoreItems, useFarshoreSprites } from "../../lib/render/farshore-rendering";
import { LOTUS_UNIT, drawLotusGarden } from "./adventure-game";
import { GameStage } from "./game-stage";
import { Lives } from "./lotus-race";

/**
 * The Lotus Hunt: the trained Odysseus plays the garden, you play the
 * guardians.
 *
 * One garden, large. The hunt runs in fixed 10 ms ticks
 * (lib/encounters/lotus-hunt.ts). When Odysseus's move is due, his PPO policy
 * (ONNX, in the browser) is asked once and the clock waits for the answer, so
 * he never loses a movement opportunity to a slow frame. You possess one
 * hunter at a time (Tab swaps), step it with the arrows, and summon or dismiss
 * the third hunter with Space. He has two powers, both game rules applied at
 * his decision time: Hermes' sandals (a sprint when a hunter closes in) and
 * the leap, live only while your third hunter is out. The
 * board is painted straight onto the canvas from the animation loop; React
 * only re-renders when a number on screen changes. There is no commentary and
 * no language model in the hunt.
 */

type Phase = "loading" | "error" | "countdown" | "running" | "paused" | "done";
type Props = {
  difficulty: Difficulty;
  plan: OpponentPlan;
  layout: LotusLayout;
  onLeave: () => void;
  onAudio?: (frame: AudioFrame) => void;
};
type LeapState = "sealed" | "ready" | "cooling";
type SprintState = "ready" | "active" | "cooling";
type Hud = {
  tenths: number; left: number;
  rescued: number; carrying: boolean; hits: number;
  hunters: number; possessed: number; third: ThirdPhase; thirdS: number;
  leap: LeapState; cooldownS: number; leaps: number;
  sprint: SprintState; sprintS: number;
  aiLine: string; aiAction: number | null; decisions: number;
};

const PAD = 6;
const BOARD_W = 15 * LOTUS_UNIT + PAD * 2;
const BOARD_H = 11 * LOTUS_UNIT + PAD * 2;
const LEAP_FLASH_MS = 500;
const SPRINT_TAG_MS = 700;
const SAILOR_BLOOM_MS = 900;
const KEYS: Record<string, [number, number]> = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };

/** The hunt's events of one kind from the last `ms` milliseconds, newest last. */
const recent = (h: LotusHunt, kind: HuntEvent["kind"], ms: number) => h.events.filter(e => e.kind === kind && (h.tick - e.tick) * TICK_MS < ms);

function hudOf(h: LotusHunt): Hud {
  const b = h.board;
  const leapt = h.lastLeap && (h.tick - h.lastLeap.tick) * TICK_MS < 1500;
  return {
    tenths: Math.floor(h.tick / 10), left: Math.max(0, Math.ceil((b.duration - h.tick * TICK_MS) / 1000)),
    rescued: h.aboard, carrying: b.carrying, hits: b.hits,
    hunters: b.guardians.length, possessed: h.possessed, third: h.third.phase, thirdS: Math.ceil(h.third.ms / 1000),
    leap: !leapLive(h) ? "sealed" : h.leapCooldown > 0 ? "cooling" : "ready", cooldownS: Math.ceil(h.leapCooldown / 1000), leaps: h.leaps,
    sprint: h.sprint > 0 ? "active" : h.sprintCooldown > 0 ? "cooling" : "ready", sprintS: Math.ceil(h.sprintCooldown / 1000),
    aiLine: (leapt ? "LEAP! · " : h.sprint > 0 ? "SPRINT! · " : "") + liveLine(b, h.aiLastAction).replace(/ · Crew aboard \d+\/3$/, ""), // the crew dots carry the count
    aiAction: h.aiLastAction, decisions: h.aiDecisions,
  };
}
const clock = (tenths: number) => `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;

/** Six crew dots: sailors aboard, and the one he is escorting. */
function HuntCrew({ rescued, carrying }: { rescued: number; carrying: boolean }) {
  return (
    <span className="fs-race-crew fs-hunt-crew" aria-label={`${rescued} of ${HUNT.crew} sailors aboard${carrying ? ", escorting one" : ""}`}>
      {Array.from({ length: HUNT.crew }, (_, i) => <i key={i} data-on={i < rescued || undefined} data-escort={(i === rescued && carrying) || undefined} />)}
    </span>
  );
}

/** Sounds for what the hunt itself did this tick; the board's own sounds (steps, hits) come from `audioFrame`. */
function cuesFor(e: HuntEvent): Cue[] {
  switch (e.kind) {
    case "catch": return [{ sound: "costly", gain: 0.7 }];
    case "rescue": return [{ sound: "rescue" }];
    case "sailor": return [{ sound: "bird", gain: 0.45, pan: e.to ? (e.to.x - 7) / 10 : 0 }];
    case "sprint": return [{ sound: "swish" }, { sound: "flap", gain: 0.6, delay: 0.08 }];
    case "leap": return [{ sound: "jump" }, { sound: "land", delay: 0.35 }];
    case "summon": return [{ sound: "charge", gain: 0.6 }];
    case "risen": return [{ sound: "thunk" }];
    case "dismiss": return [{ sound: "ui-back" }];
    case "gone": return [{ sound: "hiss", gain: 0.5 }];
    default: return [];
  }
}

// ------------------------------------------------------------------ paint --

const centre = (p: Point) => ({ x: PAD + p.x * LOTUS_UNIT + LOTUS_UNIT / 2, y: PAD + p.y * LOTUS_UNIT + LOTUS_UNIT / 2 });
function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width: number, dash?: number[]) {
  c.save(); c.strokeStyle = color; c.lineWidth = width; if (dash) c.setLineDash(dash);
  c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.stroke(); c.restore();
}
function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}
function tag(c: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  c.save(); c.font = "bold 11px ui-monospace, Consolas, monospace"; c.textAlign = "center";
  const w = c.measureText(text).width + 10;
  c.fillStyle = "#03101dd0"; c.fillRect(x - w / 2, y - 10, w, 14);
  c.fillStyle = color; c.fillText(text, x, y + 1); c.restore();
}

function drawBoard(canvas: HTMLCanvasElement | null, h: LotusHunt, sprites: HTMLImageElement | null, items: HTMLImageElement | null) {
  const c = canvas?.getContext("2d");
  if (!c || !canvas) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(BOARD_W * ratio)) { canvas.width = Math.round(BOARD_W * ratio); canvas.height = Math.round(BOARD_H * ratio); }
  c.setTransform(ratio, 0, 0, ratio, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, BOARD_H);
  g.addColorStop(0, "#0d2a24"); g.addColorStop(1, "#06141c");
  c.fillStyle = g; c.fillRect(0, 0, BOARD_W, BOARD_H);
  c.save(); c.translate(PAD, PAD);
  drawLotusGarden(c, h.board, sprites, items, false);
  c.restore();

  const b = h.board, pulse = (Math.sin(h.tick / 8) + 1) / 2; // tick-driven, so it holds still while paused
  // Your hunter: a gold ring and a tag.
  const mine = b.guardians[h.possessed];
  if (mine) { const a = centre(mine); ring(c, a.x, a.y + 10, 21, "#f2c46d", 2.5); tag(c, a.x, a.y - 34, "YOU", "#f2c46d"); }
  // The third hunter on its way: a lotus bloom opening on its rise tile.
  if (h.third.phase === "arriving" && h.third.at) {
    const a = centre(h.third.at), open = 1 - h.third.ms / HUNT.summonMs;
    disc(c, a.x, a.y, 16, `rgba(216,179,255,${0.12 + 0.25 * open})`);
    ring(c, a.x, a.y, 10 + 8 * pulse, "#d8b3ff", 2);
    ring(c, a.x, a.y, 17 * open, "#f2c46d99", 1.5, [3, 5]);
  }
  // The third hunter fading: lotus mist thickening over it.
  if (h.third.phase === "leaving" && b.guardians[2]) {
    const a = centre(b.guardians[2]), gone = 1 - h.third.ms / HUNT.leaveMs;
    disc(c, a.x, a.y + 2, 24, `rgba(13,42,36,${0.3 + 0.55 * gone})`);
    ring(c, a.x, a.y + 2, 24, "#d8b3ff88", 1.5, [2, 6]);
  }
  // Odysseus's magic: an aura while his leap is live and ready; the arc for half a second after a leap.
  const o = centre(b.player);
  if (leapLive(h) && h.leapCooldown <= 0 && !b.done) ring(c, o.x, o.y + 6, 23, `rgba(111,224,245,${0.45 + 0.4 * pulse})`, 1.5, [4, 4]);
  if (h.lastLeap && (h.tick - h.lastLeap.tick) * TICK_MS < LEAP_FLASH_MS) {
    const from = centre(h.lastLeap.from), to = centre(h.lastLeap.to), left = 1 - ((h.tick - h.lastLeap.tick) * TICK_MS) / LEAP_FLASH_MS;
    c.save(); c.strokeStyle = `rgba(111,224,245,${0.3 + 0.6 * left})`; c.lineWidth = 3; c.setLineDash([6, 4]);
    c.beginPath(); c.moveTo(from.x, from.y);
    const flat = from.y === to.y;
    c.quadraticCurveTo(flat ? (from.x + to.x) / 2 : from.x + LOTUS_UNIT, flat ? from.y - LOTUS_UNIT : (from.y + to.y) / 2, to.x, to.y);
    c.stroke(); c.restore();
    tag(c, to.x, to.y - 40, "LEAP", "#6fe0f5");
  }
  // Hermes' sandals: wind streaks trailing him while he sprints, and the word for its first moments.
  if (h.sprint > 0 && !b.done) {
    const dx = Math.sign(b.player.x - b.previous.x), dy = Math.sign(b.player.y - b.previous.y);
    c.save(); c.strokeStyle = `rgba(255,236,170,${0.35 + 0.45 * pulse})`; c.lineWidth = 2; c.lineCap = "round";
    for (const k of [-1, 0, 1]) {
      const sx = o.x - dx * 12 + dy * k * 9, sy = o.y + 4 - dy * 12 + dx * k * 9, len = 16 - Math.abs(k) * 5;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - dx * len, sy - dy * len); c.stroke();
    }
    c.restore();
    ring(c, o.x, o.y + 6, 21, "rgba(255,228,163,0.7)", 1.5);
    const started = recent(h, "sprint", SPRINT_TAG_MS).at(-1);
    if (started) tag(c, o.x, o.y - 40, "SPRINT", "#ffe4a3");
  }
  // A new sailor wandering out of the lotus fields: a warm ring opening on its tile.
  for (const e of recent(h, "sailor", SAILOR_BLOOM_MS)) {
    if (!e.to) continue;
    const a = centre(e.to), t = ((h.tick - e.tick) * TICK_MS) / SAILOR_BLOOM_MS;
    ring(c, a.x, a.y, 8 + 18 * t, `rgba(242,196,109,${0.85 * (1 - t)})`, 2);
  }
  c.strokeStyle = "#e9b85c99"; c.lineWidth = 2; c.strokeRect(1, 1, BOARD_W - 2, BOARD_H - 2);
  if (h.result) {
    const r = h.result, won = r.winner === "hunters";
    c.fillStyle = won ? "#e9b85c2a" : "#020a12b8"; c.fillRect(0, 0, BOARD_W, BOARD_H);
    c.fillStyle = won ? "#ffe4a3" : "#cfdbe2"; c.font = "bold 34px Georgia"; c.textAlign = "center";
    const word = won ? (r.reason === "caught" ? "CAUGHT" : "TIME · YOU LEAD") : r.reason === "rescued" ? "ALL CREW ABOARD" : r.winner === "draw" ? "TIME · A DRAW" : "TIME · HE SLIPS AWAY";
    c.fillText(word, BOARD_W / 2, BOARD_H / 2 + 12);
  }
}

// -------------------------------------------------------------- component --

export function LotusHuntRound({ difficulty, plan, layout: initialLayout, onLeave, onAudio }: Props) {
  const [layout, setLayout] = useState(initialLayout);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<LotusModelMeta | null>(null);
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState<Hud | null>(null);
  const [result, setResult] = useState<HuntResult | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const hunt = useRef<LotusHunt | null>(null);
  const policy = useRef<LotusPolicy | null>(null);
  const ready = useRef<{ hunt: LotusHunt; tick: number; action: number } | null>(null);
  const inflight = useRef(false);
  const held = useRef(new Set<string>());
  /** Sounds queued by key presses between frames. */
  const extra = useRef<Cue[]>([]);
  /** Where your hunter stood at the last frame, for its footstep. */
  const mine = useRef("");
  const canvas = useRef<HTMLCanvasElement>(null);
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
    const h = hunt.current;
    if (!h) return;
    drawBoard(canvas.current, h, images.current.sprites, images.current.items);
    const next = hudOf(h), key = JSON.stringify(next);
    if (key !== lastHud.current) { lastHud.current = key; setHud(next); }
  }, []);

  /** Asks the trained policy for Odysseus's move at the current tick. The clock waits for the answer. */
  const decide = useCallback(() => {
    const h = hunt.current, p = policy.current;
    if (!h || !p || inflight.current || !huntAwaitingDecision(h) || ready.current?.hunt === h) return;
    inflight.current = true;
    const tick = h.tick, started = performance.now();
    p.act(observe(h.board, p.meta.obsVersion)).then(({ logits }) => {
      inflight.current = false;
      if (hunt.current !== h || h.tick !== tick) return;
      ready.current = { hunt: h, tick, action: pickAction(logits) };
      setLatency(performance.now() - started);
    }).catch(e => {
      inflight.current = false;
      setError(`The trained Odysseus stopped responding: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
    });
  }, []);

  const start = useCallback((next: LotusLayout) => {
    // A fresh seed each hunt, so the replacement sailors wander out somewhere new.
    hunt.current = newHunt(next, difficulty, plan, Math.floor(Math.random() * 2 ** 31));
    ready.current = null;
    heard.current = structuredClone(hunt.current.board);
    held.current.clear();
    extra.current = [];
    mine.current = "";
    setResult(null);
    setCount(3);
    setPhase("countdown");
    // A frame later the canvas exists; paint the starting garden and ask for his first move.
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

  // Development builds expose the live hunt, as lotus-onnx.ts exposes the
  // policy, so a browser check can corner Odysseus on purpose and watch the leap.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { farshoreLotusHunt?: () => LotusHunt | null }).farshoreLotusHunt = () => hunt.current;
  }, []);

  const pause = useCallback(() => {
    if (phaseRef.current !== "running" && phaseRef.current !== "countdown") return;
    held.current.clear();
    audio.current?.({ cues: [], loops: {}, scene: "garden" });
    setPhase("paused");
  }, []);
  const resume = () => { setCount(3); setPhase("countdown"); };
  const again = () => start(layout);
  const newGarden = () => { const next = freshLayout(); setLayout(next); start(next); };

  /** A command for the hunt while it runs; refs only, so key handlers may hold it. */
  const act = (fn: (h: LotusHunt) => void) => { const h = hunt.current; if (h && phaseRef.current === "running") fn(h); };
  const swap = () => act(h => { cycleHunter(h); mine.current = ""; extra.current.push({ sound: "ui-tick" }); });
  const third = () => act(toggleThird);
  const select = (i: number) => act(h => {
    if (i === 2 && h.third.phase === "away") toggleThird(h);
    else if (possess(h, i)) { mine.current = ""; extra.current.push({ sound: "ui-tick" }); }
  });

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

  // The hunt clock.
  useEffect(() => {
    if (phase !== "running") return;
    let handle = 0, last = 0, pending = 0;
    const frame = (now: number) => {
      const h = hunt.current;
      if (!h) return;
      const gap = last ? now - last : 0;
      last = now;
      if (gap > 500 && document.hidden) { pause(); return; }
      pending = Math.min(250, pending + Math.min(100, gap));
      const cues: Cue[] = extra.current.splice(0);
      while (pending >= TICK_MS && !h.result) {
        let action: number | null = null;
        if (huntAwaitingDecision(h)) {
          const choice = ready.current;
          if (!choice || choice.hunt !== h || choice.tick !== h.tick) { decide(); break; }
          action = choice.action;
          ready.current = null;
        }
        const has = (k: string) => held.current.has(k);
        const dx = Number(has("arrowright") || has("d")) - Number(has("arrowleft") || has("a"));
        const dy = Number(has("arrowdown") || has("s")) - Number(has("arrowup") || has("w"));
        const seen = h.events.length;
        huntTick(h, dx || dy ? { dx: dx ? dx : 0, dy: dx ? 0 : dy } : null, action);
        for (const e of h.events.slice(seen)) cues.push(...cuesFor(e));
        pending -= TICK_MS;
      }
      if (huntAwaitingDecision(h)) decide();
      const me = h.board.guardians[h.possessed], at = me ? `${me.x},${me.y}` : "";
      if (mine.current && at !== mine.current) cues.push({ sound: "step-stone", gain: 0.5, pan: me ? (me.x - 7) / 10 : 0 });
      mine.current = at;
      // The board's own sounds speak for Odysseus; his victory and defeat are rephrased below from your side,
      // and rescues come from the hunt's events (the board's own count only follows the last three sailors).
      const sounded = structuredClone(h.board);
      const soundtrack = audioFrame(heard.current, sounded);
      soundtrack.cues = [...soundtrack.cues.filter(q => q.sound !== "victory" && q.sound !== "defeat" && q.sound !== "rescue"), ...cues];
      audio.current?.(soundtrack);
      heard.current = sounded;
      paint();
      if (h.result) {
        setResult(h.result); setPhase("done");
        audio.current?.({ cues: [{ sound: h.result.winner === "hunters" ? "victory" : h.result.winner === "odysseus" ? "defeat" : "reply" }], loops: {}, scene: "garden" });
        return;
      }
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
      if (phaseRef.current !== "running") return;
      if (KEYS[k]) { e.preventDefault(); held.current.add(k); }
      else if (k === "tab" || k === "q") { e.preventDefault(); if (!e.repeat) swap(); }
      else if (k === "1" || k === "2" || k === "3") { e.preventDefault(); if (!e.repeat) select(Number(k) - 1); }
      else if (k === " ") { e.preventDefault(); if (!e.repeat) third(); }
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
  const words = result ? describeHunt(result) : null;
  const checkpoint = meta ? `${meta.label} · ${meta.steps.toLocaleString()} steps` : "";
  const chipLabel = (i: number) => {
    if (!h) return "";
    if (i < 2) return h.possessed === i ? "yours" : "patrol";
    if (h.third === "away") return "Space";
    if (h.third === "arriving") return `rising ${h.thirdS}s`;
    if (h.third === "leaving") return "fading";
    return h.possessed === 2 ? "yours" : "out";
  };
  const leapText = !h || h.leap === "sealed" ? "Leap sealed" : h.leap === "ready" ? "Leap ready" : `Leap ${h.cooldownS}s`;
  const sprintText = !h || h.sprint === "ready" ? "Sprint ready" : h.sprint === "active" ? "Sprinting" : `Sprint ${h.sprintS}s`;
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const veil = phase === "running" ? null : (
    <div ref={overlay} className="fs-stage-veil fs-race-veil" role={phase === "paused" || phase === "done" || phase === "error" ? "dialog" : "status"} aria-modal={phase === "paused" || phase === "done" ? true : undefined} data-phase={phase}>
      <div className="fs-veil-panel fs-race-panel">
        {phase === "loading" && <>
          <span className="a-eyebrow">THE LOTUS HUNT</span>
          <h2>Loading the trained Odysseus…</h2>
          <p>The trained rival is loading in your browser.</p>
        </>}
        {phase === "error" && <>
          <span className="a-eyebrow">THE LOTUS HUNT</span>
          <h2>The trained Odysseus could not be loaded</h2>
          <p role="alert">{error}</p>
          <button className="a-btn a-primary fs-rich" onClick={loadModel}><RefreshCw size={17} /><span><b>Try again</b></span></button>
          <button className="a-btn fs-rich" onClick={onLeave}><LogOut size={17} /><span><b>Briefing</b></span></button>
        </>}
        {phase === "countdown" && <>
          <span className="a-eyebrow">YOU VS TRAINED AI · {layout.name.toUpperCase()}</span>
          <strong className="fs-veil-count" key={count}>{count}</strong>
          <p>Catch him three times before all {HUNT.crew} sailors are aboard. He sprints when you close in, and your third hunter unseals his leap.</p>
          <p className="fs-race-small">Odysseus: {checkpoint}</p>
        </>}
        {phase === "paused" && <>
          <span className="a-eyebrow">HUNT PAUSED</span>
          <h2>The garden holds its breath</h2>
          <p>The clock, Odysseus and every hunter wait for you.</p>
          <button className="a-btn a-primary fs-rich" onClick={resume}><Play size={17} /><span><b>Resume</b><small>A 3-second countdown first</small></span><kbd>Esc</kbd></button>
          <button className="a-btn fs-rich" onClick={again}><RotateCcw size={17} /><span><b>Hunt again</b></span></button>
          <button className="a-btn fs-rich" onClick={newGarden}><Shuffle size={17} /><span><b>New garden</b></span></button>
          <button className="a-btn fs-rich" onClick={onLeave}><LogOut size={17} /><span><b>Leave the hunt</b><small>Back to the briefing</small></span></button>
        </>}
        {phase === "done" && result && words && <div className="fs-race-result fs-hunt-result" data-winner={result.winner}>
          <span className="a-eyebrow">THE LOTUS HUNT · {layout.name.toUpperCase()} · {difficultyNames[difficulty].toUpperCase()}</span>
          <h2>{words.headline}</h2>
          <p>{words.why}</p>
          <table className="fs-race-table fs-hunt-table">
            <tbody>
              <tr><th scope="row">Sailors aboard</th><td>{result.rescued}/{HUNT.crew}</td></tr>
              <tr><th scope="row">Catches</th><td>{result.catches}/{HUNT.catches}</td></tr>
              <tr><th scope="row">Sprints (Hermes&apos; sandals)</th><td>{result.sprints}</td></tr>
              <tr><th scope="row">Leaps</th><td>{result.leaps}</td></tr>
              <tr><th scope="row">Third hunter out</th><td>{seconds(result.thirdMs)}</td></tr>
              <tr><th scope="row">Hunt time</th><td>{seconds(result.ms)}</td></tr>
            </tbody>
          </table>
          <p className="fs-race-small">Odysseus: {checkpoint}</p>
          <div className="fs-race-actions">
            <button className="a-btn a-primary fs-rich" onClick={again}><RotateCcw size={17} /><span><b>Hunt again</b></span></button>
            <button className="a-btn fs-rich" onClick={newGarden}><Shuffle size={17} /><span><b>New garden</b></span></button>
            <button className="a-btn fs-rich" onClick={onLeave}><LogOut size={17} /><span><b>Briefing</b><small>Not saved</small></span></button>
          </div>
        </div>}
      </div>
    </div>
  );

  return (
    <GameStage label="Lotus-Eaters hunt" overlay={veil}>
      <div className="fs-race fs-hunt" data-phase={phase} data-leap={h?.leap} style={{ "--fs-race-ratio": `${BOARD_W} / ${BOARD_H}` } as CSSProperties}>
        <header className="fs-race-bar fs-hunt-bar">
          <div className="fs-race-side" data-side="human">
            <b>YOU · HUNTERS</b>
            <span className="fs-hunt-chips" role="group" aria-label="Your hunters">
              {[0, 1, 2].map(i => (
                <button key={i} type="button" className="fs-hunt-chip" data-possessed={h?.possessed === i || undefined} data-phase={i === 2 ? h?.third : undefined}
                  disabled={phase !== "running" || (i === 2 && (h?.third === "arriving" || h?.third === "leaving"))}
                  aria-label={i === 2 && h?.third === "away" ? "Summon the third hunter" : `Possess hunter ${i + 1}`}
                  onClick={e => { select(i); e.currentTarget.blur(); }}>
                  {i + 1}<small>{chipLabel(i)}</small>
                </button>
              ))}
            </span>
          </div>
          <div className="fs-race-clock" aria-label="Hunt clock">
            <strong>{h ? clock(h.tenths) : "0:00.0"}</strong>
            <small>{layout.name} · {difficultyNames[difficulty]} · {planLabel("lotus", plan)}{h ? ` · ${h.left}s left` : ""}</small>
          </div>
          <div className="fs-race-side" data-side="ai">
            {h && <><Lives hits={h.hits} /><HuntCrew rescued={h.rescued} carrying={h.carrying} /></>}
            <b>ODYSSEUS · TRAINED AI</b>
          </div>
          <button className="fs-race-pause" onClick={pause} aria-label="Pause the hunt" disabled={phase !== "running"}><Pause size={16} /></button>
        </header>
        <div className="fs-hunt-field">
          <figure className="fs-race-board fs-hunt-board" data-side="human">
            <canvas ref={canvas} width={BOARD_W} height={BOARD_H} role="img" aria-label={`The lotus garden. ${h?.rescued ?? 0} of ${HUNT.crew} sailors aboard, ${h?.hits ?? 0} catches.`} />
          </figure>
        </div>
        <footer className="fs-hunt-foot">
          <div className="fs-race-live" data-side="ai" aria-live="off">
            <span className="fs-race-live-tag"><BrainCircuit size={13} /> AI LIVE</span>
            <span className="fs-race-live-line" data-action={h?.aiAction === null || h?.aiAction === undefined ? "none" : ACTIONS[h.aiAction]}>{h?.aiLine ?? "Waiting for the model"}</span>
            <small>{h?.decisions ?? 0} moves{latency !== null ? ` · ${latency < 1 ? "<1" : latency.toFixed(0)} ms` : ""}</small>
          </div>
          <div className="fs-hunt-powers" aria-label="Odysseus's powers">
            <span className="fs-hunt-leap fs-hunt-sprint" data-state={h?.sprint ?? "ready"} title="Hermes' sandals: he sprints for a moment when a hunter comes within two steps"><Footprints size={13} /> {sprintText}</span>
            <span className="fs-hunt-leap" data-state={h?.leap ?? "sealed"} title="His leap is live while your third hunter is in the garden"><Sparkles size={13} /> {leapText}</span>
          </div>
          <p className="fs-hunt-hint"><kbd>←↑↓→</kbd> move <kbd>Tab</kbd> swap <kbd>Space</kbd> third <kbd>Esc</kbd> pause</p>
        </footer>
        <div className="fs-race-pad fs-hunt-pad" aria-label="Drive your hunter">
          {pad("arrowup", "Move up", <ArrowUp size={20} />)}
          {pad("arrowleft", "Move left", <ArrowLeft size={20} />)}
          {pad("arrowdown", "Move down", <ArrowDown size={20} />)}
          {pad("arrowright", "Move right", <ArrowRight size={20} />)}
          <button aria-label="Swap hunter" onClick={swap}><Repeat size={18} /></button>
          <button aria-label="Summon or dismiss the third hunter" onClick={third}><UserPlus size={18} /></button>
        </div>
        <p className="sr-only" aria-live="polite">{h ? `You ${h.hits} of ${HUNT.catches} catches. Odysseus ${h.rescued} of ${HUNT.crew} sailors.` : ""}</p>
      </div>
    </GameStage>
  );
}
