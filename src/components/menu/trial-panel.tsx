import { ArrowRight, Compass, LockKeyhole, Trophy } from "lucide-react";
import { difficultyNames, trials, unlocked, type ArcadeSave, type Difficulty, type TrialId } from "../../lib/arcade/arcade";
import { fieldNotes } from "../../lib/story/field-notes";
import { TrialArtwork } from "../farshore-art";

/** Short names for the chart's plaques and the gallery cards. */
export const shortNames: Record<TrialId, string> = { lotus: "Lotus-Eaters", cyclops: "Cyclops’ Cave", aeolus: "Aeolus", circe: "Circe’s Palace", sirens: "Sirens’ Passage", scylla: "Scylla & Charybdis", calypso: "Calypso’s Raft", bow: "Palace of Ithaca" };

type Props = {
  /** The trial to describe: the selected one, or the island under the pointer on the chart. */
  id: TrialId;
  save: ArcadeSave;
  selected: TrialId;
  difficulty: Difficulty;
  onOpen: (id: TrialId) => void;
  onDifficulty: (d: Difficulty) => void;
  onBegin: () => void;
};

/**
 * The trial briefing beside the chart and the gallery. It always describes the
 * trial in view; difficulty, record and the start button belong to the
 * selected trial, so they show only while that is the one described.
 */
export function TrialPanel({ id, save, selected, difficulty, onOpen, onDifficulty, onBegin }: Props) {
  const trial = trials.find(t => t.id === id)!;
  const record = save.records[selected], canPlay = unlocked(save, selected), best = record.bests[difficulty];
  return (
    <aside className="fs-chart-preview fs-trial-panel" aria-live="polite">
      <div className="fs-chart-art">
        <TrialArtwork id={id} />
      </div>
      <span className="fs-chart-ribbon">Trial {trials.indexOf(trial) + 1} of 8</span>
      <h2>{trial.title}</h2>
      <p className="fs-chart-genre">
        <Compass size={13} /> {trial.kind} · {trial.character}
      </p>
      <p className="fs-chart-objective">{trial.objective}</p>
      <div className="fs-chart-keys">
        {fieldNotes[id].keys.map(k => (
          <kbd key={k}>{k}</kbd>
        ))}
      </div>
      {id === selected && (
        <>
          <fieldset className="fs-difficulty">
            <legend>Difficulty</legend>
            <div>
              {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                <button key={d} aria-pressed={difficulty === d} onClick={() => onDifficulty(d)}>
                  {difficultyNames[d]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="fs-chart-record">
            <span>
              Best score<strong>{best?.score.toLocaleString() ?? "—"}</strong>
            </span>
            <span>
              <Trophy size={13} />
              <strong className={best?.medal}>{best?.medal ?? "No medal yet"}</strong>
            </span>
          </div>
          {save.started ? (
            <button className="a-btn a-primary fs-chart-start" disabled={!canPlay} onClick={() => onOpen(selected)}>
              {canPlay ? (record.cleared === "pending" ? "Open briefing" : "Replay trial") : "Locked"}
              {canPlay ? <ArrowRight size={18} /> : <LockKeyhole size={15} />}
            </button>
          ) : (
            <button className="a-btn a-primary fs-chart-start" onClick={onBegin}>
              New game <ArrowRight size={18} />
            </button>
          )}
          {canPlay && <p className="fs-chart-note">{fieldNotes[selected].bonus}.</p>}
        </>
      )}
    </aside>
  );
}
