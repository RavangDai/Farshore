import { useState } from "react";
import { isAdventure, type GameState } from "../lib/arcade-runtime";
import type { AIDebug } from "../lib/odyssey-games";

export function inspectAI(s: GameState): AIDebug {
  if (isAdventure(s)) return s.debug;
  const base = { confidence: 1, prediction: "No prediction", pathLength: 0 };
  if (s.id === "cyclops") return { ...base, algorithm: s.plan.planId === "sweep" ? "Noise prediction" : "Noise heatmap", state: s.phase, target: `${s.target.x}, ${s.target.y}`, decision: s.rivalLine, pathLength: s.noise.length };
  if (s.id === "circe") return { ...base, algorithm: s.difficulty === "hard" || s.plan.source === "ai" ? "Two-piece lookahead" : "Board evaluation", state: s.bank ? "Banking curses" : "Evaluating placement", target: `Column ${s.rivalColumn + 1}; rotation ${s.rivalRotation}`, decision: s.rivalLine, prediction: `${s.bank} curses banked` };
  if (s.id === "sirens") return { ...base, algorithm: s.plan.source === "ai" || s.difficulty === "hard" ? "Weak-lane melody generation" : "Repeating melody", state: s.phase, target: `Weak lane ${s.laneMisses.indexOf(Math.max(...s.laneMisses)) + 1}`, decision: s.rivalLine, prediction: `${s.laneMisses.join(" / ")} misses by lane` };
  if (s.id === "scylla") return { ...base, algorithm: s.difficulty === "hard" || s.plan.source === "ai" ? "Coordinated flank + undertow" : "Head patrol", state: s.telegraph > 0 ? "Telegraph locked" : "Recovering", target: `Head ${s.head + 1}; Y ${Math.round(s.targetY)}`, decision: s.rivalLine, prediction: `Pull ${s.pull.toFixed(1)}; ${s.strikes.length} active strikes`, pathLength: s.strikes.length };
  return { ...base, algorithm: s.difficulty === "hard" || s.plan.source === "ai" ? "Trajectory search + blocking" : "Imperfect aim", state: s.phase, target: `Wind ${s.wind}; ring ${s.blocked || "open"}`, decision: s.rivalLine, prediction: `Aim ${s.rivalAim.aim}°; elevation ${s.rivalAim.elevation}°` };
}
export function AIObservatory({ state }: { state: GameState }) {
  const [open, setOpen] = useState(false);
  if (process.env.NODE_ENV === "production") return null;
  const data = inspectAI(state);
  return <aside className="od-ai-observatory"><button className="a-text-btn" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? "Close" : "Open"} AI observatory <small>DEV</small></button>{open && <div className="od-ai-readings"><strong>{data.algorithm} · {state.difficulty}</strong><dl><dt>State</dt><dd>{data.state}</dd><dt>Target</dt><dd>{data.target}</dd><dt>Prediction</dt><dd>{data.prediction}</dd><dt>Confidence</dt><dd>{data.confidence.toFixed(2)}</dd><dt>Path / alternatives</dt><dd>{data.pathLength}</dd></dl><p>{data.decision}</p></div>}</aside>;
}
