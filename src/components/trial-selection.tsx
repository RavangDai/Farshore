import { LockKeyhole, Trophy, ArrowRight, Map, LayoutGrid, Check, Ship } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { fieldNotes } from "../lib/field-notes";
import { trials, unlocked, difficultyNames, clearedCount, type ArcadeSave, type TrialId, type Difficulty } from "../lib/arcade";
import { TrialArtwork } from "./farshore-art";
import { VoyageChart } from "./voyage-chart";

const shortNames: Record<TrialId, string> = { lotus: "Lotus-Eaters", cyclops: "Cyclops’ Cave", aeolus: "Aeolus", circe: "Circe’s Palace", sirens: "Sirens’ Passage", scylla: "Scylla & Charybdis", calypso: "Calypso’s Raft", bow: "Ithaca" };
type Props = { save: ArcadeSave; selected: TrialId; difficulty: Difficulty; still?: boolean; onSelect: (id: TrialId) => void; onOpen: (id: TrialId) => void; onDifficulty: (d: Difficulty) => void; onBegin: () => void };

export function TrialSelection(props: Props) {
  const [view, setView] = useState<"trials" | "map">("trials");
  const { save, selected, difficulty, still = false, onSelect, onOpen, onDifficulty, onBegin } = props;
  const trial = trials.find(t => t.id === selected)!, index = trials.indexOf(trial), record = save.records[selected], canPlay = unlocked(save, selected), best = record.bests[difficulty];
  const note = fieldNotes[selected];
  function moveSelection(e: KeyboardEvent<HTMLDivElement>) {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-trial-index]");
    if (!button) return;
    const current = Number(button.dataset.trialIndex), columns = getComputedStyle(e.currentTarget).gridTemplateColumns.split(" ").length;
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key];
    if (offset === undefined && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? 7 : Math.max(0, Math.min(7, current + (offset || 0)));
    onSelect(trials[next].id); e.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }
  return <section className="fs-selection">
    <div className="fs-selection-heading"><div><span className="a-eyebrow">THE VOYAGE HOME</span><h1>Select your trial</h1></div><div className="fs-view-switch" aria-label="Encounter selection view"><button aria-pressed={view === "trials"} onClick={() => setView("trials")}><LayoutGrid size={15}/> Trials</button><button aria-pressed={view === "map"} onClick={() => setView("map")}><Map size={15}/> Voyage map</button></div></div>
    {view === "map" ? <VoyageChart {...props} still={still}/> : <div className="fs-trial-layout"><div className="fs-trial-gallery"><div className="fs-gallery-rule"><span>TROY</span><i/><Ship size={19}/><i/><span>ITHACA</span></div><div className="fs-trial-grid" onKeyDown={moveSelection} aria-label="Select one of eight Greek mythology trials">{trials.map((t, i) => {
      const open = unlocked(save, t.id), cleared = save.records[t.id].cleared !== "pending", medal = save.records[t.id].bests[difficulty]?.medal;
      return <button key={t.id} data-trial-index={i} className={`fs-trial-card ${selected === t.id ? "selected" : ""} ${open ? "unlocked" : "locked"} ${cleared ? "completed" : ""}`} onClick={() => onSelect(t.id)} aria-pressed={selected === t.id} aria-label={`${i + 1}. ${t.title}. ${cleared ? "Completed" : open ? "Unlocked" : "Locked"}`}>
        <TrialArtwork id={t.id}/><span className="fs-trial-number">{i + 1}</span><span className="fs-trial-card-state">{cleared ? <Check size={13}/> : !open ? <LockKeyhole size={13}/> : null}</span><span className="fs-trial-card-shade"/><strong>{shortNames[t.id]}</strong><span className="fs-trial-card-kind">{t.kind}</span>{medal && <span className={`fs-card-medal ${medal}`}><Trophy size={12}/>{medal}</span>}
      </button>;
    })}</div><div className="fs-gallery-footer"><span><i/> {clearedCount(save)} of 8 trials complete</span><span>Arrow keys to explore / Select to read the briefing.</span></div></div>
      <aside className="fs-level-preview" aria-live="polite"><div className="fs-panel-ribbon">LEVEL BRIEFING</div><div className="fs-preview-body"><span className="fs-preview-index">TRIAL {String(index + 1).padStart(2, "0")} / 08</span><h2>{trial.title}</h2><div className="fs-preview-picture"><TrialArtwork id={selected}/><span>{trial.character}</span></div><span className="fs-preview-genre">{trial.kind}</span><p>{trial.objective}</p><div className="fs-preview-controls">{note.keys.map(k => <kbd key={k}>{k}</kbd>)}</div><details className="fs-preview-notes"><summary>Bonus challenge</summary><strong>{note.bonus}</strong><p>{note.lesson}</p></details><fieldset className="fs-difficulty"><legend>DIFFICULTY</legend><div>{(["easy", "normal", "hard"] as Difficulty[]).map(d => <button key={d} aria-pressed={difficulty === d} onClick={() => onDifficulty(d)}>{difficultyNames[d]}</button>)}</div></fieldset><div className="fs-record-line"><span>BEST SCORE <strong>{best?.score.toLocaleString() ?? "—"}</strong></span><span><Trophy size={14}/>{best ? `${best.medal} medal` : "No medal yet"}</span></div>{save.started ? <button className="a-btn a-primary fs-start-trial" disabled={!canPlay} onClick={() => onOpen(selected)}>{canPlay ? "Enter trial" : "Trial locked"}{canPlay ? <ArrowRight size={16}/> : <LockKeyhole size={15}/>}</button> : <button className="a-btn a-primary fs-start-trial" onClick={onBegin}>Begin journey <ArrowRight size={16}/></button>}<p className="fs-unlock-note">{canPlay ? "Practice or play at your own pace." : "Complete the earlier trials to unlock this island."}</p></div></aside>
    </div>}
  </section>;
}
