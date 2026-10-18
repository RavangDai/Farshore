import { Heart, Coins, Clock3, Trophy, Shield, Pause } from "lucide-react";
import { isAdventure, type GameState } from "../lib/arcade-runtime";
import { difficultyNames, trialFor } from "../lib/arcade";
import { CharacterPortrait, TrialArtwork } from "./farshore-art";

export function FarshoreHUD({ state: s, onPause }: { state: GameState; onPause: () => void }) {
  const adventure = isAdventure(s), trial = trialFor(s.id);
  const lives = adventure || s.id === "cyclops" ? 3 - s.hits : s.id === "scylla" ? 5 - s.hits : null;
  const maxLives = s.id === "scylla" ? 5 : 3;
  let label = "PROGRESS", value = "", progress = 0, seconds: number | null = null;
  if (adventure) {
    seconds = Math.ceil(Math.max(0, s.duration - s.elapsed) / 1000);
    if (s.id === "lotus") { label = "CREW SAVED"; value = `${s.rescued}/${s.practice ? 1 : 3}`; progress = s.rescued / (s.practice ? 1 : 3); }
    if (s.id === "cyclops") { label = "CHASE GAP"; value = `${Math.round(s.gap)} m`; progress = s.elapsed / s.duration; }
    if (s.id === "aeolus") { label = "WIND BLESSINGS"; value = String(s.blessings); progress = s.elapsed / s.duration; }
    if (s.id === "calypso") { label = "SHORES REACHED"; value = `${s.progress}/${s.practice ? 1 : 5}`; progress = s.progress / (s.practice ? 1 : 5); }
  } else if (s.id === "sirens") { label = "MELODIES"; value = `${s.successes}/${s.practice ? 1 : 5}`; progress = s.successes / (s.practice ? 1 : 5); }
  else if (s.id === "scylla") { label = "OPEN SEA"; value = `${Math.round(s.elapsed / s.duration * 100)}%`; progress = s.elapsed / s.duration; seconds = Math.ceil(Math.max(0, s.duration - s.elapsed) / 1000); }
  else if (s.id === "circe") { label = "CIRCE’S SCORE"; value = s.rivalScore.toLocaleString(); seconds = Math.ceil(Math.max(0, (s.practice ? 25000 : 120000) - s.elapsed) / 1000); progress = s.elapsed / (s.practice ? 25000 : 120000); }
  else if (s.id === "bow") { label = "ANTINOUS"; value = `${s.rivalScore} rings`; progress = s.shots.length / (s.practice ? 1 : 5); }
  else { label = "TURNS"; value = String(s.turn); progress = s.turn / 32; }
  return <div className="fs-hud" aria-label={`${trial.title} game status`}>
    <CharacterPortrait/>
    <div className="fs-hud-captain"><span>ODYSSEUS</span>{lives !== null ? <div className="fs-hearts" aria-label={`${Math.max(0, lives)} of ${maxLives} lives`}>{Array.from({ length: maxLives }, (_, i) => <Heart key={i} size={20} className={i < lives ? "full" : "empty"} fill="currentColor" strokeWidth={1.5}/>)}</div> : s.id === "sirens" ? <span className="fs-resolve"><Shield size={13}/> Resolve {Math.max(0, 100 - s.temptation)}%</span> : <span className="fs-hud-mode">{s.id === "bow" ? `SHOT ${s.turn} / ${s.practice ? 1 : 5}` : "THE SPELLBREAKER"}</span>}</div>
    <div className="fs-hud-score"><span><Coins size={13}/> SCORE</span><strong key={s.score}>{s.score.toLocaleString()}</strong></div>
    <div className="fs-hud-objective"><span>{label}</span><strong>{value}</strong></div>
    <div className="fs-hud-clock"><span>{seconds === null ? <Trophy size={14}/> : <Clock3 size={14}/>} {difficultyNames[s.difficulty]}</span><strong>{seconds === null ? s.id === "bow" ? s.phase === "player" ? "Your turn" : "Rival’s turn" : "Stay sharp" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</strong></div>
    <button className="fs-pause" onClick={onPause} aria-label="Pause challenge"><Pause size={21} fill="currentColor" strokeWidth={1}/></button>
    <div className="fs-hud-progress" aria-label="Encounter progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, progress) * 100)}><i style={{ width: `${Math.min(1, progress) * 100}%` }}/></div>
  </div>;
}

export function EncounterBanner({ id }: { id: GameState["id"] }) {
  const trial = trialFor(id);
  return <div className="fs-game-illustration" aria-hidden="true"><TrialArtwork id={id}/><div><span>{trial.character}</span><strong>{trial.kind}</strong></div></div>;
}
