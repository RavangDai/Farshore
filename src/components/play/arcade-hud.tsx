"use client";
import { AlertTriangle, Compass, Footprints, Heart, Pause, Sparkles, Trophy } from "lucide-react";
import { difficultyNames, trialFor, type Difficulty, type TrialId } from "../../lib/arcade/arcade";
import { isBow, isCave, type GameState } from "../../lib/arcade/arcade-runtime";
import { caveProgress, START_GAP } from "../../lib/encounters/cave-runner";
import { BOW, bowScoreShown } from "../../lib/encounters/mythic";
import { encounterCue, fieldNotes } from "../../lib/story/field-notes";
import { FARSHORE_ATLAS, artPosition } from "../farshore-art";
import { InspectorModeSwitch, type InspectorMode } from "../ai/ai-inspector";

/** Odysseus' own portrait cell in the cast atlas. */
const ODYSSEUS_TILE = 8;

function Hearts({ lives, max }: { lives: number; max: number }) {
  return (
    <div className="fs-hud-hearts" aria-label={`${Math.max(0, lives)} of ${max} lives remaining`}>
      {Array.from({ length: max }, (_, i) => (
        <Heart key={i} size={17} className={i < lives ? "full" : "empty"} fill="currentColor" strokeWidth={1.4} />
      ))}
    </div>
  );
}

/**
 * The in-frame arcade HUD.
 *
 * Laid out as described in the design: captain and health top-left, encounter
 * and progress top-centre, score and threat top-right, the live tactical cue
 * along the bottom. It is an overlay on the gameplay frame, so it costs the
 * action area nothing but its own padding.
 */
export function ArcadeHUD({
  state,
  difficulty,
  practice,
  mode,
  onMode,
  onPause,
}: {
  state: GameState;
  difficulty: Difficulty;
  practice: boolean;
  mode: InspectorMode;
  onMode: (mode: InspectorMode) => void;
  onPause: () => void;
}) {
  const trial = trialFor(state.id as TrialId);
  const cue = encounterCue(state);
  const notes = fieldNotes[state.id as TrialId];
  const cave = isCave(state);
  const lives = cave ? 3 - state.hits : null;
  // The archery contest fills its track arrow by arrow, both archers' together.
  const progress = cave ? caveProgress(state) : isBow(state) ? (state.shots.length + state.rivalShots.length) / ((state.practice ? 1 : BOW.turns) * 2) : 0;
  // Not every engine runs to a clock: the grid and puzzle encounters end on a
  // turn or score condition instead.
  const timed = "duration" in state ? state.duration : null;
  const seconds = timed === null ? null : Math.ceil(Math.max(0, timed - state.elapsed) / 1000);

  return (
    <>
      <header className="fs-arcade-hud">
        <div className="fs-hud-block">
          <span
            className="fs-hud-portrait"
            role="img"
            aria-label="Odysseus"
            style={{
              backgroundImage: `url('${FARSHORE_ATLAS}')`,
              backgroundSize: "400% 300%",
              backgroundPosition: artPosition(ODYSSEUS_TILE),
            }}
          />
          <div className="fs-hud-captain">
            <span className="fs-hud-name">ODYSSEUS</span>
            {lives !== null ? <Hearts lives={lives} max={3} /> : <span className="fs-hud-name">THE WANDERER</span>}
            {cave && (
              <span className="fs-hud-stat" style={{ justifyItems: "start" }}>
                <span>
                  <Sparkles size={9} /> SHEEP {state.sheepSaved}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="fs-hud-centre">
          <h2 className="fs-hud-title">{trial.title}</h2>
          <span className="fs-hud-objective">
            {practice ? "PRACTICE · " : ""}
            {cave
              ? state.zone === "cave"
                ? "The narrow passage"
                : state.zone === "collapse"
                  ? "The collapsing hall"
                  : "Daylight ahead"
              : trial.kind}
          </span>
          <div
            className="fs-hud-track"
            role="progressbar"
            aria-label={cave ? "Escape progress" : "Encounter progress"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <i style={{ width: `${Math.min(100, progress * 100)}%` }} />
            {cave && <b style={{ left: "40%" }} />}
            {cave && <b style={{ left: "78%" }} />}
          </div>
        </div>

        <div className="fs-hud-right">
          <div className="fs-hud-block">
            <div className="fs-hud-score">
              <span>SCORE</span>
              <strong>{(isBow(state) ? bowScoreShown(state).score : state.score).toLocaleString()}</strong>
            </div>
            {cave && (
              <div
                className="fs-chase"
                data-close={state.cyclops.gap < 26}
                aria-label={`Polyphemus is ${Math.round(state.cyclops.gap)} metres behind`}
              >
                <span className="fs-chase-label">
                  <span>
                    <Footprints size={9} /> POLYPHEMUS
                  </span>
                  <span>{Math.round(state.cyclops.gap)} m</span>
                </span>
                <span className="fs-chase-bar">
                  <i style={{ width: `${Math.max(2, 100 - (state.cyclops.gap / START_GAP) * 100)}%` }} />
                </span>
              </div>
            )}
            <div className="fs-hud-stat">
              <span>
                <Trophy size={9} /> {difficultyNames[difficulty].toUpperCase()}
              </span>
              <strong>
                {seconds === null
                  ? "—"
                  : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
              </strong>
            </div>
            <button className="fs-hud-pause" onClick={onPause} aria-label="Pause the encounter">
              <Pause size={18} fill="currentColor" strokeWidth={1} />
            </button>
          </div>
          {/* Only the runner publishes an inspector feed; elsewhere the switch would do nothing. */}
          {cave && <InspectorModeSwitch mode={mode} onMode={onMode} />}
        </div>
      </header>

      <div />

      <footer className="fs-hud-foot">
        <div className="fs-hud-cue" data-danger={!!cue.danger} role="status" aria-live="polite">
          <span aria-hidden="true">{cue.danger ? <AlertTriangle size={17} /> : <Compass size={17} />}</span>
          <div>
            <strong>{cue.title}</strong>
            <p>{cue.detail}</p>
          </div>
        </div>
        <div className="fs-hud-keys" aria-hidden="true">
          {notes.keys.map(key => (
            <kbd key={key}>{key}</kbd>
          ))}
          <kbd>ESC PAUSE</kbd>
          {cave && <kbd>F3 AI</kbd>}
        </div>
      </footer>
    </>
  );
}
