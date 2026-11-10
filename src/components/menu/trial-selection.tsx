import { LockKeyhole, Trophy, Map, LayoutGrid, Check, Ship } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { trials, unlocked, clearedCount, type ArcadeSave, type TrialId, type Difficulty } from "../../lib/arcade/arcade";
import { TrialArtwork } from "../farshore-art";
import { VoyageChart } from "./voyage-chart";
import { TrialPanel, shortNames } from "./trial-panel";

type Props = { save: ArcadeSave; selected: TrialId; difficulty: Difficulty; still?: boolean; onSelect: (id: TrialId) => void; onOpen: (id: TrialId) => void; onDifficulty: (d: Difficulty) => void; onBegin: () => void };

/** Desktop opens on the chart; on a phone its islands would be too small to tap, so it opens on the cards. */
const initialView = (): "trials" | "map" => (typeof window !== "undefined" && window.matchMedia?.("(min-width: 761px)").matches ? "map" : "trials");

export function TrialSelection(props: Props) {
  const [view, setView] = useState<"trials" | "map">(initialView);
  const [hovered, setHovered] = useState<TrialId | null>(null);
  const { save, selected, difficulty, still = false, onSelect, onOpen, onDifficulty, onBegin } = props;
  function show(next: "trials" | "map") { setHovered(null); setView(next); }
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
    <div className="fs-selection-heading"><div><span className="a-eyebrow">THE VOYAGE HOME</span><h1>Select your trial</h1></div><div className="fs-view-switch" aria-label="Encounter selection view"><button aria-pressed={view === "trials"} onClick={() => show("trials")}><LayoutGrid size={15}/> Trials</button><button aria-pressed={view === "map"} onClick={() => show("map")}><Map size={15}/> Voyage map</button></div></div>
    <div className={view === "map" ? "fs-chart-layout" : "fs-trial-layout"}>
      {view === "map" ? <VoyageChart save={save} selected={selected} still={still} onSelect={onSelect} onOpen={onOpen} onHover={setHovered}/> : <div className="fs-trial-gallery"><div className="fs-gallery-rule"><span>TROY</span><i/><Ship size={19}/><i/><span>ITHACA</span></div><div className="fs-trial-grid" onKeyDown={moveSelection} aria-label="Select one of eight Greek mythology trials">{trials.map((t, i) => {
        const open = unlocked(save, t.id), cleared = save.records[t.id].cleared !== "pending", medal = save.records[t.id].bests[difficulty]?.medal;
        return <button key={t.id} data-trial-index={i} className={`fs-trial-card ${selected === t.id ? "selected" : ""} ${open ? "unlocked" : "locked"} ${cleared ? "completed" : ""}`} onClick={() => onSelect(t.id)} aria-pressed={selected === t.id} aria-label={`${i + 1}. ${t.title}. ${cleared ? "Completed" : open ? "Unlocked" : "Locked"}`}>
          <TrialArtwork id={t.id}/><span className="fs-trial-number">{i + 1}</span><span className="fs-trial-card-state">{cleared ? <Check size={13}/> : !open ? <LockKeyhole size={13}/> : null}</span><span className="fs-trial-card-shade"/><strong>{shortNames[t.id]}</strong><span className="fs-trial-card-kind">{t.kind}</span>{medal && <span className={`fs-card-medal ${medal}`}><Trophy size={12}/>{medal}</span>}
        </button>;
      })}</div><div className="fs-gallery-footer"><span><i/> {clearedCount(save)} of 8 trials complete</span><span>Arrow keys to explore / Select to read the briefing.</span></div></div>}
      <TrialPanel id={hovered ?? selected} save={save} selected={selected} difficulty={difficulty} onOpen={onOpen} onDifficulty={onDifficulty} onBegin={onBegin}/>
    </div>
  </section>;
}
