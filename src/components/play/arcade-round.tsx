"use client";
import { useEffect, useRef, useState } from "react";
import { Keyboard, LogOut, Play, RotateCcw, Settings as SettingsIcon } from "lucide-react";
import { difficultyNames, planLabel, planNames, trialFor, trials, type Difficulty, type OpponentPlan, type TrialId } from "../../lib/arcade/arcade";
import { statusLabel } from "../../lib/encounters/mythic";
import {
  createGame,
  gameAction,
  tickGame,
  isAdventure,
  isBow,
  isCave,
  demonstrate,
  type GameAction,
  type GameState,
} from "../../lib/arcade/arcade-runtime";
import { adventureStatus } from "../../lib/encounters/odyssey-games";
import { caveStatus } from "../../lib/encounters/cave-runner";
import { audioFrame, type AudioFrame } from "../../lib/audio/cues";
import { CommentaryDirector, detectMoment, moment, type CommentaryLine } from "../../lib/arcade/commentary";
import type { VoiceId } from "../../lib/arcade/rivals";
import { AdventureGame } from "./adventure-game";
import { MythicGame } from "./mythic-games";
import { CaveGame } from "./cave-game";
import { HallGame } from "./hall-game";
import { GameStage } from "./game-stage";
import { ArcadeHUD } from "./arcade-hud";
import { AIInspector, nextMode, type InspectorMode } from "../ai/ai-inspector";
import { caveFeed } from "../../lib/ai/feeds";
import { CharacterPortrait, TrialArtwork } from "../farshore-art";
import { CommentarySubtitle, EncounterCodex } from "./encounter-codex";

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

const statusOf = (s: GameState) => (isCave(s) ? caveStatus(s) : isAdventure(s) ? adventureStatus(s) : statusLabel(s));

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
  /** What the round sounds like: cues, continuous loops and the scene, from the engine's own state. */
  onAudio?: (frame: AudioFrame) => void;
  /** The rival's opening line from the model, spoken over the title card. */
  taunt?: string;
  /** The bard's opening line, written while the player read the briefing. */
  opening?: Promise<string>;
  /** Live model commentary during play. */
  commentary?: boolean;
  onSpeak?: (text: string, voice: VoiceId) => void;
  onSilence?: () => void;
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
  onAudio,
  taunt,
  opening: openingLine,
  commentary = false,
  onSpeak,
  onSilence,
}: Props) {
  const [round, setRound] = useState(() => createGame(id, difficulty, plan, practice, seed, originalCave));
  const current = useRef(round), finished = useRef(false), held = useRef(new Set<string>());
  const [phase, setPhase] = useState<"countdown" | "active" | "paused">("countdown");
  const [count, setCount] = useState(3);
  const countdown = useRef(3000);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [inspector, setInspector] = useState<InspectorMode>("insights");
  // The opening countdown doubles as the encounter's title card; a resume
  // countdown after a pause is just a countdown.
  const [opening, setOpening] = useState(true);
  const [log, setLog] = useState<CommentaryLine[]>([]);
  const arena = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onFinish, onAudio, onSpeak, onSilence }), shownCount = useRef(0);
  callbacks.current = { onFinish, onAudio, onSpeak, onSilence };
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const director = useRef<CommentaryDirector | null>(null);

  const perspective = isCave(round) || isBow(round);
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
  const chapter = trials.findIndex(t => t.id === id) + 1;

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

  useEffect(() => {
    if (!commentary) return;
    const d = new CommentaryDirector({
      trialId: id,
      difficulty,
      onLine: line => {
        setLog(old => [...old, line].slice(-8));
        callbacks.current.onSpeak?.(line.text, line.speaker === "bard" ? "bard" : id);
      },
    });
    director.current = d;
    return () => {
      d.dispose();
      director.current = null;
    };
  }, [commentary, id, difficulty]);

  // The rival's taunt opens the encounter, once, over the title card.
  useEffect(() => {
    if (taunt) callbacks.current.onSpeak?.(taunt, id);
    return () => callbacks.current.onSilence?.();
  }, []);

  // The prefetched opening line is used when it is ready in time; otherwise the
  // director asks for one live.
  function beginCommentary() {
    if (!commentary) return;
    const begun = performance.now();
    if (!openingLine) { director.current?.offer(moment("start"), current.current, statusOf(current.current)); return; }
    void openingLine.then(text => {
      if (!text) { director.current?.offer(moment("start"), current.current, statusOf(current.current)); return; }
      if (finished.current || performance.now() - begun > 12000) return;
      director.current?.remember(text);
      setLog(old => [...old, { id: -1, speaker: "bard" as const, text, moment: "start" as const }].slice(-8));
      callbacks.current.onSpeak?.(text, "bard");
    });
  }

  function commit(next: GameState) {
    if (next === current.current) return;
    const old = current.current;
    current.current = next;
    setRound(next);
    // Sound and commentary are both derived from what just changed in the
    // engine. The final word on a round belongs to the results screen.
    callbacks.current.onAudio?.(audioFrame(old, next));
    const m = detectMoment(old, next);
    if (m && m.priority < 3 && phaseRef.current === "active") director.current?.offer(m, next, statusOf(next));
    if (next.done && !finished.current) {
      finished.current = true;
      callbacks.current.onFinish(next);
    }
  }

  function act(action: GameAction) {
    if (phase !== "active" || finished.current) return;
    commit(gameAction(current.current, action));
  }

  function release() {
    held.current.clear();
    if (current.current.id === "scylla") commit(gameAction(current.current, { type: "row", held: false }));
    // Pausing mid-draw lets the string down rather than loosing an arrow nobody aimed.
    if (current.current.id === "bow") commit(gameAction(current.current, { type: "letdown" }));
  }
  function pause() {
    release();
    director.current?.hold();
    callbacks.current.onSilence?.();
    callbacks.current.onAudio?.({ ...audioFrame(null, current.current), loops: {} });
    setPhase("paused");
  }
  function restartRound() {
    const next = createGame(id, difficulty, plan, practice, seed, originalCave);
    current.current = next;
    finished.current = false;
    held.current.clear();
    setRound(next);
    setLog([]);
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
        const shown = Math.max(1, Math.ceil(countdown.current / 1000));
        setCount(shown);
        if (shown !== shownCount.current && countdown.current > 0) {
          shownCount.current = shown;
          callbacks.current.onAudio?.({ ...audioFrame(null, current.current), loops: {}, cues: [{ sound: "countdown", rate: shown === 1 ? 1.12 : 1 }] });
        }
        if (countdown.current <= 0) {
          shownCount.current = 0;
          callbacks.current.onAudio?.({ ...audioFrame(null, current.current), cues: [{ sound: "go" }] });
          // The bard sets the scene as play begins. On a local model this first
          // line also warms the prompt cache for the rest of the encounter.
          if (opening) beginCommentary();
          setPhase("active");
          setOpening(false);
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
          if (isBow(next) && next.phase === "player") {
            // Held arrows or WASD steer the sight; Shift steadies it for fine adjustment.
            const dx = Number(held.current.has("arrowright") || held.current.has("d")) - Number(held.current.has("arrowleft") || held.current.has("a"));
            const dy = Number(held.current.has("arrowup") || held.current.has("w")) - Number(held.current.has("arrowdown") || held.current.has("s"));
            const step = (held.current.has("shift") ? 2.5 : 8) * pending / 1000;
            if (dx || dy) next = gameAction(next, { type: "sight", aim: next.aim.aim + dx * step, elevation: next.aim.elevation + dy * step });
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
      if (isBow(state) && ["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d", "shift"].includes(k)) {
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
        act({ type: "draw", held: true });
      }
    }
    function keyUp(e: KeyboardEvent) {
      held.current.delete(e.key.toLowerCase());
      if (e.key === " " && current.current.id === "scylla") act({ type: "row", held: false });
      // Letting go of Space looses the arrow.
      if (e.key === " " && current.current.id === "bow") act({ type: "draw", held: false });
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
  const status = statusOf(round);
  const latest = log.at(-1) ?? null;
  const note = demo
    ? "AI demonstration · no progress is saved."
    : practice
      ? "Practice leaves your voyage progress untouched."
      : modelPrepared
        ? "Your AI rival chose this strategy before the round and acts on it live. The game owns every collision, score and unlock."
        : "Rival logic reacts to you during play.";

  const veil =
    phase !== "active" ? (
      <div
        ref={overlay}
        className={`fs-stage-veil${phase === "countdown" && opening ? " fs-title-veil" : ""}`}
        role={phase === "paused" ? "dialog" : "status"}
        aria-modal={phase === "paused" ? true : undefined}
        aria-label={phase === "paused" ? "Encounter paused" : `${trial.title}. Get ready`}
      >
        {phase === "countdown" && opening ? (
          <div className="fs-title-card">
            <TrialArtwork id={id} className="fs-title-art" />
            <span className="fs-title-bars" aria-hidden="true" />
            <div className="fs-title-copy">
              <span className="fs-title-chapter">
                {demo ? "Demonstration" : practice ? "Practice" : `Encounter ${chapter} of ${trials.length}`} · {trial.kind}
              </span>
              <h2>{trial.title}</h2>
              <div className="fs-title-rival">
                <CharacterPortrait tile={trial.portrait} label={trial.character} />
                <div>
                  <strong>{trial.character}</strong>
                  <small>{strategy} · {difficultyNames[difficulty]}</small>
                </div>
              </div>
              {taunt && <p className="fs-title-taunt">{taunt}</p>}
            </div>
            <div className="fs-title-count" aria-live="assertive">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="44" />
                <circle key={count} className="fs-count-sweep" cx="50" cy="50" r="44" />
              </svg>
              <strong key={count}>{count}</strong>
            </div>
            <p className="fs-title-controls">{trial.controls}</p>
          </div>
        ) : (
          <div className="fs-veil-panel">
            {phase === "countdown" ? (
              <>
                <span className="a-eyebrow">BACK TO THE ACTION</span>
                <strong className="fs-veil-count" key={count}>{count}</strong>
                <p>{trial.controls}</p>
              </>
            ) : (
              <>
                <span className="a-eyebrow">TAKE A BREATH</span>
                <h2>Paused</h2>
                <p>{trial.title} · {difficultyNames[difficulty]} · Score {round.score.toLocaleString()}. Both rivals and every clock are stopped.</p>
                {confirmLeave ? (
                  <>
                    <p>Leave this attempt? It will not be recorded. Completed encounters stay saved.</p>
                    <button className="a-btn a-primary fs-rich" onClick={onLeave}>
                      <LogOut size={17} />
                      <span><b>Leave attempt</b><small>Return to the voyage map</small></span>
                    </button>
                    <button className="a-btn fs-rich" onClick={() => setConfirmLeave(false)}>
                      <Play size={17} />
                      <span><b>Keep playing</b><small>Back to the pause menu</small></span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="a-btn a-primary fs-rich" onClick={resume}>
                      <Play size={17} />
                      <span><b>Resume</b><small>A 3-second countdown first</small></span>
                      <kbd>Esc</kbd>
                    </button>
                    <button className="a-btn fs-rich" onClick={restartRound}>
                      <RotateCcw size={17} />
                      <span><b>Restart encounter</b><small>Same rival strategy, fresh attempt</small></span>
                    </button>
                    <details className="od-pause-controls">
                      <summary><Keyboard size={15} /> Controls</summary>
                      <p>{trial.controls}</p>
                    </details>
                    <button className="a-btn fs-rich" onClick={onSettings}>
                      <SettingsIcon size={17} />
                      <span><b>Settings</b><small>Sound, voice, commentary, motion</small></span>
                    </button>
                    <button className="a-btn fs-rich" onClick={() => setConfirmLeave(true)}>
                      <LogOut size={17} />
                      <span><b>Return to map</b><small>This attempt will not be saved</small></span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
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
          {phase === "active" && <CommentarySubtitle line={latest} id={id} />}
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
        {isBow(round) ? (
          <HallGame
            state={round}
            active={phase === "active"}
            still={still}
            shakeStrength={shake}
            effectStrength={effects}
            onAction={act}
          />
        ) : perspective && isCave(round) ? (
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
        <aside className="fs-legacy-support fs-codex" aria-label="Encounter details">
          <EncounterCodex
            state={round}
            character={trial.character}
            portrait={trial.portrait}
            strategy={strategy}
            objective={trial.objective}
            log={log}
            note={note}
            feedback={round.feedback}
          />
        </aside>
      )}
      <span className="sr-only">
        {difficultyNames[difficulty]} difficulty. {round.rivalLine}
      </span>
    </GameStage>
  );
}
