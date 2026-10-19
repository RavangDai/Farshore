"use client";
import { useEffect, useRef, useState } from "react";
import { difficultyNames, planLabel, planNames, trialFor, type Difficulty, type OpponentPlan, type TrialId } from "../lib/arcade";
import { songBeat, statusLabel } from "../lib/mythic";
import {
  createGame,
  gameAction,
  tickGame,
  isAdventure,
  isCave,
  demonstrate,
  type GameAction,
  type GameState,
} from "../lib/arcade-runtime";
import { adventureStatus } from "../lib/odyssey-games";
import { caveStatus, START_GAP } from "../lib/encounters/cave-runner";
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
import { AdventureGame } from "./adventure-game";
import { MythicGame } from "./mythic-games";
import { CaveGame } from "./cave-game";
import { GameStage } from "./game-stage";
import { ArcadeHUD } from "./arcade-hud";
import { AIInspector, nextMode, type InspectorMode } from "./ai-inspector";
import { caveFeed } from "../lib/ai/feeds";
import { CharacterPortrait } from "./farshore-art";
import { FieldNotes } from "./encounter-intel";

const INSPECTOR_KEY = "farshore-ai-inspector-mode";

function loadInspectorMode(): InspectorMode {
  try {
    const stored = localStorage.getItem(INSPECTOR_KEY);
    if (stored === "immersive" || stored === "insights" || stored === "lab") return stored;
  } catch {
    /* Storage is optional. */
  }
  return "insights";
}

type Props = {
  id: TrialId;
  difficulty: Difficulty;
  plan: OpponentPlan;
  practice: boolean;
  seed: number;
  still: boolean;
  /** 0 disables screen shake, 1 is full. */
  shake?: number;
  /** 0 disables decorative particles, 1 is full. */
  effects?: number;
  modelPrepared?: boolean;
  originalCave?: boolean;
  demo?: boolean;
  /**
   * Forces the world-space prediction and history overlays on, regardless of
   * the player's own inspector mode choice — the AI Lab's presenter toggles.
   */
  labOverlay?: { showPrediction: boolean; showHistory: boolean };
  onSettings: () => void;
  onFinish: (round: GameState) => void;
  onLeave: () => void;
  onFeedback: (good: boolean) => void;
  onNote: (lane: number) => void;
  /** 0..1 chase tension, pushed every tick for encounters that have one (Cyclops' chase gap). */
  onIntensity?: (level: number) => void;
};

export function ArcadeRound({
  id,
  difficulty,
  plan,
  practice,
  seed,
  still,
  shake = 1,
  effects = 1,
  modelPrepared,
  originalCave,
  demo,
  labOverlay,
  onSettings,
  onFinish,
  onLeave,
  onFeedback,
  onNote,
  onIntensity,
}: Props) {
  const [round, setRound] = useState(() => createGame(id, difficulty, plan, practice, seed, originalCave));
  const current = useRef(round), finished = useRef(false), held = useRef(new Set<string>());
  const [phase, setPhase] = useState<"countdown" | "active" | "paused">("countdown");
  const [count, setCount] = useState(3);
  const countdown = useRef(3000);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [inspector, setInspector] = useState<InspectorMode>("insights");
  const arena = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onFinish, onFeedback, onNote, onIntensity }), lastSung = useRef("");
  callbacks.current = { onFinish, onFeedback, onNote, onIntensity };

  const perspective = isCave(round);
  const trial = originalCave
    ? {
        ...trialFor(id),
        title: "Cyclops’ Cave: Original Tactics",
        kind: "Grid stealth",
        controls:
          "Arrows / WASD or tap an adjacent tile. Sneak one tile, dash two, or hide beneath a sheep with Space. Evade each marked smash before it lands.",
      }
    : trialFor(id);
  const strategy = originalCave ? planNames[plan.planId] : planLabel(id, plan);

  // A lab run opens straight into the expanded panel — that is the point of
  // the demonstration — rather than the player's own remembered preference.
  useEffect(() => setInspector(labOverlay ? "lab" : loadInspectorMode()), [labOverlay]);
  function chooseInspector(mode: InspectorMode) {
    setInspector(mode);
    try {
      localStorage.setItem(INSPECTOR_KEY, mode);
    } catch {
      /* Storage is optional. */
    }
  }

  function commit(next: GameState) {
    if (next === current.current) return;
    const old = current.current;
    current.current = next;
    setRound(next);
    if (next.id === "sirens" && "phase" in next && next.phase === "listen") {
      const i = Math.floor(next.timer / songBeat(next)), key = `${next.round}:${i}`;
      if (i < next.notes.length && key !== lastSung.current) {
        lastSung.current = key;
        if (!next.notes[i].rest) callbacks.current.onNote(next.notes[i].lane);
      }
    }
    if (next.score > old.score || next.hits > old.hits || next.misses > old.misses)
      callbacks.current.onFeedback(next.score > old.score);
    // The chase gap is real simulation state, read fresh every commit — never a
    // scripted ramp. START_GAP bounds it to a stable 0..1 before it reaches audio.
    if (isCave(next)) callbacks.current.onIntensity?.(clamp01(1 - (next.cyclops.gap - 8) / (START_GAP - 8)));
    if (next.done && !finished.current) {
      finished.current = true;
      callbacks.current.onFinish(next);
    }
  }

  function act(action: GameAction) {
    if (phase !== "active" || finished.current) return;
    if (action.type === "note" && current.current.id === "sirens" && "phase" in current.current && current.current.phase === "reply")
      callbacks.current.onNote(action.lane);
    commit(gameAction(current.current, action));
  }

  function release() {
    held.current.clear();
    if (current.current.id === "scylla") commit(gameAction(current.current, { type: "row", held: false }));
  }
  function pause() {
    release();
    setPhase("paused");
  }
  function restartRound() {
    const next = createGame(id, difficulty, plan, practice, seed, originalCave);
    current.current = next;
    finished.current = false;
    lastSung.current = "";
    held.current.clear();
    setRound(next);
    resume();
  }
  function resume() {
    countdown.current = 3000;
    setCount(3);
    setConfirmLeave(false);
    setPhase("countdown");
  }

  useEffect(() => {
    if (phase === "active") arena.current?.focus();
    else if (phase === "paused") overlay.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [phase, confirmLeave]);

  useEffect(() => {
    if (phase === "paused") return;
    let previous = 0, handle = 0, pending = 0;
    function frame(now: number) {
      const gap = previous ? now - previous : 0;
      previous = now;
      // A visible tab can stall briefly while fonts or tooling load. The
      // bounded delta preserves reaction time; only backgrounding pauses it.
      if (gap > 500 && document.hidden) {
        pause();
        return;
      }
      const delta = Math.min(100, gap);
      if (phase === "countdown") {
        countdown.current -= delta;
        setCount(Math.max(1, Math.ceil(countdown.current / 1000)));
        if (countdown.current <= 0) {
          setPhase("active");
          return;
        }
      } else {
        pending += delta;
        if (pending >= 32) {
          let next = current.current;
          if (isAdventure(next) && next.id === "lotus") {
            const dx = Number(held.current.has("arrowright") || held.current.has("d")) - Number(held.current.has("arrowleft") || held.current.has("a"));
            const dy = Number(held.current.has("arrowdown") || held.current.has("s")) - Number(held.current.has("arrowup") || held.current.has("w"));
            if (dx || dy) next = gameAction(next, { type: "move", dx: dx ? dx : 0, dy: dx ? 0 : dy });
          }
          if (next.id === "scylla" && "paddle" in next) {
            const direction = Number(held.current.has("arrowdown") || held.current.has("s")) - Number(held.current.has("arrowup") || held.current.has("w"));
            if (direction) next = gameAction(next, { type: "paddle", y: next.paddle + direction * 310 * pending / 1000 });
          }
          if (demo) next = demonstrate(next);
          commit(tickGame(next, pending));
          pending = 0;
        }
      }
      if (!finished.current) handle = requestAnimationFrame(frame);
    }
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [phase]);

  useEffect(() => {
    function visibility() {
      if (document.hidden) pause();
    }
    function blur() {
      pause();
    }
    function key(e: KeyboardEvent) {
      if (document.querySelector(".a-modal")) return;
      // F3 cycles the AI inspector without interrupting play, in every phase.
      if (e.key === "F3") {
        e.preventDefault();
        chooseInspector(nextMode(inspector));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "paused") resume();
        else pause();
        return;
      }
      if (phase === "paused" && e.key === "Tab") {
        const nodes = [...(overlay.current?.querySelectorAll<HTMLElement>("button, summary") || [])];
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
        return;
      }
      if (demo || phase !== "active" || (e.target as HTMLElement).closest("input,select,a,summary")) return;
      const k = e.key.toLowerCase(), state = current.current;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) && !(e.target as HTMLElement).closest("button"))
        e.preventDefault();
      if (k === " " && (e.target as HTMLElement).closest("button")) return;
      if (state.id === "scylla" && ["arrowup", "arrowdown", "w", "s", " "].includes(k)) {
        e.preventDefault();
        held.current.add(k);
        if (k === " ") act({ type: "row", held: true });
        return;
      }
      if (isAdventure(state) && state.id === "lotus" && ["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
        held.current.add(k);
      }
      if (e.repeat) return;
      if (isCave(state)) {
        // A / D or arrows change lane, W / Up / Space jump, S / Down slide.
        if (["arrowleft", "a"].includes(k)) {
          e.preventDefault();
          act({ type: "move", dx: -1 });
        } else if (["arrowright", "d"].includes(k)) {
          e.preventDefault();
          act({ type: "move", dx: 1 });
        } else if (["arrowup", "w", " "].includes(k)) {
          e.preventDefault();
          act({ type: "jump" });
        } else if (["arrowdown", "s"].includes(k)) {
          e.preventDefault();
          act({ type: "slide" });
        }
      } else if (isAdventure(state)) {
        const moves: Record<string, [number, number]> = {
          arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
          arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
        };
        if (state.id === "aeolus" && [" ", "arrowup", "w"].includes(k)) {
          e.preventDefault();
          act({ type: "lift" });
        } else if (k === " " && state.id === "calypso") {
          e.preventDefault();
          act({ type: "move", dx: 0, dy: -1 });
        } else if (moves[k]) {
          e.preventDefault();
          act({ type: "move", dx: moves[k][0], dy: moves[k][1] });
        }
      } else if (state.id === "cyclops") {
        const moves: Record<string, [number, number]> = {
          arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
          arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
        };
        if (moves[k]) {
          e.preventDefault();
          act({ type: "move", dx: moves[k][0], dy: moves[k][1] });
        } else if (k === " ") {
          e.preventDefault();
          act({ type: "hide" });
        }
      } else if (state.id === "circe") {
        if (["arrowleft", "arrowright", "arrowup", "a", "d", "w", " "].includes(k)) {
          e.preventDefault();
          if (["arrowleft", "a"].includes(k)) act({ type: "column", direction: -1 });
          else if (["arrowright", "d"].includes(k)) act({ type: "column", direction: 1 });
          else act({ type: k === " " ? "drop" : "rotate" });
        }
      } else if (state.id === "sirens" && ["a", "s", "d", "f", "1", "2", "3", "4"].includes(k)) {
        e.preventDefault();
        act({ type: "note", lane: /^[1-4]$/.test(k) ? Number(k) - 1 : ["a", "s", "d", "f"].indexOf(k) });
      } else if (state.id === "bow" && k === " ") {
        e.preventDefault();
        act({ type: "shoot" });
      }
    }
    function keyUp(e: KeyboardEvent) {
      held.current.delete(e.key.toLowerCase());
      if (e.key === " " && current.current.id === "scylla") act({ type: "row", held: false });
    }
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("farshore:account-open", pause);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("farshore:account-open", pause);
    };
  }, [phase, inspector]);

  const feed = isCave(round) ? caveFeed(round) : null;
  const status = isCave(round) ? caveStatus(round) : isAdventure(round) ? adventureStatus(round) : statusLabel(round);

  const veil =
    phase !== "active" ? (
      <div
        ref={overlay}
        className="fs-stage-veil"
        role={phase === "paused" ? "dialog" : "status"}
        aria-modal={phase === "paused" ? true : undefined}
        aria-label={phase === "paused" ? "Encounter paused" : "Get ready"}
      >
        <div className="fs-veil-panel">
          {phase === "countdown" ? (
            <>
              <span className="a-eyebrow">{trial.kind.toUpperCase()}</span>
              <strong className="fs-veil-count">{count}</strong>
              <p>{trial.controls}</p>
            </>
          ) : (
            <>
              <span className="a-eyebrow">TAKE A BREATH</span>
              <h2>PAUSED</h2>
              <p>Both rivals and every clock are stopped.</p>
              {confirmLeave ? (
                <>
                  <p>Leave this attempt? Completed encounters stay saved.</p>
                  <button className="a-btn a-primary" onClick={onLeave}>
                    Leave attempt
                  </button>
                  <button className="a-btn" onClick={() => setConfirmLeave(false)}>
                    Keep playing
                  </button>
                </>
              ) : (
                <>
                  <button className="a-btn a-primary" onClick={resume}>
                    Resume with countdown
                  </button>
                  <button className="a-btn" onClick={restartRound}>
                    Restart encounter
                  </button>
                  <details className="od-pause-controls">
                    <summary>Controls</summary>
                    <p>{trial.controls}</p>
                  </details>
                  <button className="a-btn" onClick={onSettings}>
                    Settings
                  </button>
                  <button className="a-btn" onClick={() => setConfirmLeave(true)}>
                    Return to map
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    ) : null;

  return (
    <GameStage
      label={`${trial.title} ${practice ? "practice" : "challenge"}`}
      labMode={inspector === "lab" && !!feed}
      hud={
        <ArcadeHUD
          state={round}
          difficulty={difficulty}
          practice={practice}
          mode={inspector}
          onMode={chooseInspector}
          onPause={pause}
        />
      }
      overlay={
        <>
          {veil}
          {inspector === "insights" && feed && <AIInspector mode="insights" feed={feed} onMode={chooseInspector} />}
        </>
      }
      inspector={
        inspector === "lab" && feed ? (
          <AIInspector mode="lab" feed={feed} onMode={chooseInspector} />
        ) : null
      }
    >
      <div
        ref={arena}
        tabIndex={0}
        className={`fs-arena${perspective ? " fs-arena-perspective" : " fs-legacy-scene"}`}
        aria-label={`${trial.kind}. ${trial.controls}`}
        data-trial={id}
      >
        {perspective ? (
          <CaveGame
            state={round}
            active={phase === "active"}
            still={still}
            shakeStrength={shake}
            effectStrength={effects}
            overlay={{
              showTarget: true,
              showPrediction: labOverlay ? labOverlay.showPrediction : inspector === "lab",
              showHistory: labOverlay ? labOverlay.showHistory : inspector === "lab",
            }}
            onAction={act}
          />
        ) : (
          <div className="fs-legacy-inner" inert={phase !== "active"}>
            {isAdventure(round) ? (
              <AdventureGame state={round} active={phase === "active"} act={act} still={still} />
            ) : (
              <MythicGame state={round} active={phase === "active"} act={act} still={still} />
            )}
          </div>
        )}
      </div>
      <p className="fs-arena-status" role="status" aria-live="polite">
        <span>{status}</span>
        <span>{round.feedback}</span>
      </p>
      {!perspective && (
        <aside className="fs-legacy-support">
          <FieldNotes id={id} />
          <div className="m-rival-speech">
            <CharacterPortrait tile={trial.portrait} label={trial.character} />
            <div>
              <span>
                {trial.character} · {strategy}
              </span>
              <p aria-live="polite">{round.rivalLine}</p>
            </div>
          </div>
          <p className="m-help">
            {demo
              ? "AI demonstration · no progress is saved."
              : practice
                ? "Practice leaves your voyage progress untouched."
                : modelPrepared
                  ? "The model chose the strategy. The rival takes actions locally during play."
                  : plan.source === "ai"
                    ? "Adaptive rival logic reacts during play."
                    : "Solo rivals use learnable strategies."}
          </p>
        </aside>
      )}
      <span className="sr-only">
        {difficultyNames[difficulty]} difficulty. {round.rivalLine}
      </span>
    </GameStage>
  );
}
