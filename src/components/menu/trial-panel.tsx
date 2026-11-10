import { ArrowRight, Brain, Compass, LockKeyhole, Ship, Trophy } from "lucide-react";
import { clearedCount, difficultyNames, trials, unlocked, type ArcadeSave, type Difficulty, type TrialId } from "../../lib/arcade/arcade";
import { fieldNotes } from "../../lib/story/field-notes";
import { TrialArtwork } from "../farshore-art";

/** Short names for the chart's plaques and the gallery cards. */
export const shortNames: Record<TrialId, string> = { lotus: "Lotus-Eaters", cyclops: "Cyclops’ Cave", aeolus: "Aeolus", circe: "Circe’s Palace", sirens: "Sirens’ Passage", scylla: "Scylla & Charybdis", calypso: "Calypso’s Raft", bow: "Palace of Ithaca" };

/** Where each trial takes place, as the chart names it. */
export const islandLabels: Record<TrialId, string> = {
  lotus: "The lotus shore",
  cyclops: "The cave of Polyphemus",
  aeolus: "Aeolia of the winds",
  circe: "Aeaea",
  sirens: "The singing rocks",
  scylla: "The strait of two terrors",
  calypso: "The storm beyond Ogygia",
  bow: "The palace of Ithaca",
};

const pad = (n: number) => String(n).padStart(2, "0");

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
        <span>{islandLabels[id]}</span>
      </div>
      <span className="fs-chart-ribbon">TRIAL {pad(trials.indexOf(trial) + 1)} / 08</span>
      <h2>{trial.title}</h2>
      <p className="fs-chart-genre">
        <Compass size={13} /> {trial.kind} · {trial.character}
      </p>
      <p className="fs-chart-objective">{trial.objective}</p>
      <div className="fs-chart-ai">
        <Brain size={13} />
        <div>
          <span>RIVAL BEHAVIOR</span>
          <p>{trial.adaptive}</p>
        </div>
      </div>
      <div className="fs-chart-keys">
        {fieldNotes[id].keys.map(k => (
          <kbd key={k}>{k}</kbd>
        ))}
      </div>
      {id === selected && (
        <>
          <fieldset className="fs-difficulty">
            <legend>DIFFICULTY</legend>
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
              BEST SCORE<strong>{best?.score.toLocaleString() ?? "—"}</strong>
            </span>
            <span>
              <Trophy size={13} />
              <strong className={best?.medal}>{best?.medal ?? "No medal yet"}</strong>
            </span>
          </div>
          {save.started ? (
            <button className="a-btn a-primary fs-chart-start" disabled={!canPlay} onClick={() => onOpen(selected)}>
              {canPlay ? (record.cleared === "pending" ? "Approach island" : "Revisit encounter") : "Island locked"}
              {canPlay ? <ArrowRight size={18} /> : <LockKeyhole size={15} />}
            </button>
          ) : (
            <button className="a-btn a-primary fs-chart-start" onClick={onBegin}>
              Begin the voyage <ArrowRight size={18} />
            </button>
          )}
          <p className="fs-chart-note">{canPlay ? `${fieldNotes[selected].bonus}.` : "Complete the earlier islands to sail here."}</p>
        </>
      )}
      <p className="fs-chart-progress">
        <Ship size={13} /> {pad(clearedCount(save))} of 08 islands behind you
      </p>
    </aside>
  );
}
