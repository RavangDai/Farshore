import { Compass, Sparkles, AlertTriangle, Star, Trophy } from "lucide-react";
import type { GameState } from "../lib/arcade-runtime";
import { gameSummary, isAdventure } from "../lib/arcade-runtime";
import { medalFor } from "../lib/arcade";
import { encounterCue, fieldNotes } from "../lib/field-notes";
import { TrialArtwork } from "./farshore-art";

export function EncounterIntel({ state }: { state: GameState }) {
  const cue = encounterCue(state);
  return <div className={`fs-tactical-cue${cue.danger ? " danger" : ""}`}>
    <span className="fs-cue-seal" aria-hidden="true">{cue.danger ? <AlertTriangle size={20}/> : <Compass size={21}/>}</span>
    <div><strong>{cue.title}</strong><span>{cue.detail}</span></div>
    <div className="fs-cue-counter"><span><Sparkles size={12}/>{cue.value}</span><i><b style={{ transform: `scaleX(${Math.max(0, Math.min(1, cue.fill))})` }}/></i></div>
  </div>;
}

export function FieldNotes({ id }: { id: GameState["id"] }) {
  const note = fieldNotes[id];
  return <div className="fs-field-notes"><span><Star size={13}/> BONUS CHALLENGE</span><strong>{note.bonus}</strong><p>{note.lesson}</p><div>{note.keys.map(k => <kbd key={k}>{k}</kbd>)}</div></div>;
}

export function PerformanceSeals({ state: s }: { state: GameState }) {
  const bonus = isAdventure(s) ? s.id === "lotus" ? [s.relicsFound, "relics found"] : s.id === "cyclops" ? [s.precision, "precise escapes"] : s.id === "aeolus" ? [s.perfectPasses, "perfect gates"] : [s.progress, "safe shores"] : s.id === "circe" ? [s.chains, "chain reactions"] : s.id === "sirens" ? [s.successes, "melodies echoed"] : s.id === "bow" ? [s.shots.filter(n => n === 12).length, "perfect shots"] : [s.successes, "deflections"];
  const damage = isAdventure(s) || s.id === "scylla" || s.id === "cyclops";
  return <div className="fs-performance-seals" aria-label="Encounter performance"><span><Star size={15}/><strong>{s.bestCombo}</strong> best streak</span><span><Compass size={15}/><strong>{bonus[0]}</strong> {bonus[1]}</span><span><Sparkles size={15}/><strong>{damage ? gameSummary(s).hits : s.misses}</strong> {damage ? "damage taken" : "misses"}</span></div>;
}

export function ResultFrieze({ state }: { state: GameState }) {
  const medal = medalFor(gameSummary(state)), stars = medal === "gold" ? 3 : medal === "silver" ? 2 : 1;
  return <div className={`fs-result-frieze ${state.won ? "victory" : "defeat"}`}><TrialArtwork id={state.id}/><div><span>{state.practice ? "PRACTICE VOYAGE" : state.won ? "TRIAL COMPLETE" : "THE SEA WAS NOT KIND"}</span>{state.won && !state.practice ? <div className="fs-result-stars" aria-label={`${medal} medal`}>{[0, 1, 2].map(i => <Star key={i} size={39} className={i < stars ? "earned" : ""} fill="currentColor"/>)}</div> : <Trophy size={34}/>}<small>{state.practice ? "Your voyage progress is untouched" : state.won ? `${medal.toUpperCase()} MEDAL EARNED` : "Gather your courage. Try again."}</small></div></div>;
}
