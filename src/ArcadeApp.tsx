import { useEffect, useRef, useState } from "react";
import { ArcadeRound } from "./components/arcade-round";
import { ARCADE_PREFS, ARCADE_SAVE, adaptivePlan, assistTrial, challengeObjective, clearedCount, difficultyNames, medalFor, finishAttempt, newArcade, planDescription, readArcade, standardPlan, trialFor, trials, unlocked, validPlan, type ArcadeSave, type Difficulty, type OpponentPlan, type TrialId } from "./lib/arcade";
import { gameSummary, type GameState } from "./lib/arcade-runtime";
import { OdysseyPreferences } from "./components/odyssey-preferences";
import { TrialGlyph } from "./components/odyssey-map";
import { ArrowRight, ArrowLeft, Play, Map, BookOpen, Settings, Info, Compass, Trophy, Volume2, VolumeX, Ship, Sparkles, RotateCcw, FlaskConical } from "lucide-react";
import { VoyageAudio } from "./lib/voyage-audio";
import "./arcade.css";
import "./mythic.css";
import "./odyssey.css";
import "./farshore.css";
import "./farshore-brand.css";
import { FarshoreLogo, Torch, TrialArtwork, CharacterPortrait } from "./components/farshore-art";
import { PerformanceSeals, ResultFrieze } from "./components/encounter-intel";
import "./farshore-detail.css";
import "./farshore-stage.css";
import { TrialSelection } from "./components/trial-selection";
import { AILabMode, labRunFrom, type LabRun, type LabSettings } from "./components/ai-lab-mode";
import { aiRuntimeOf } from "./lib/arcade-runtime";
import { defaultPreferences, preferencesSchema, type OnlineGame, type OnlinePreferences } from "./lib/online";

type Screen = "splash" | "howto" | "credits" | "title" | "intro" | "map" | "brief" | "play" | "result" | "ending" | "lab";
type Prefs = OnlinePreferences;
type AiState = "idle" | "loading" | "ready" | "error" | "uncertain";
function loadPrefs(): Prefs {
  const defaults: Prefs = { ...defaultPreferences(), still: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false };
  try { const v = JSON.parse(localStorage.getItem(ARCADE_PREFS) || "null"); if (v) { const parsed = preferencesSchema.safeParse({ ...defaults, ...v, revision: 2, difficulty: v.revision === 2 ? v.difficulty : "normal" }); if (parsed.success) return parsed.data; } } catch { /* Storage is optional. */ }
  return defaults;
}
function Portrait(props: { tile: number; label: string; large?: boolean }) { return <CharacterPortrait {...props}/>; }
export default function ArcadeApp({ online }: { online?: OnlineGame } = {}) {
  const saveKey = online ? `${online.storageKey}:voyage` : ARCADE_SAVE;
  const preferencesKey = online ? `${online.storageKey}:preferences` : ARCADE_PREFS;
  const [save, setSave] = useState<ArcadeSave>(() => { if (online) return online.initialSave; try { return readArcade(localStorage.getItem(saveKey)) || newArcade(); } catch { return newArcade(); } });
  const [prefs, setPrefs] = useState(() => online?.initialPreferences || loadPrefs()), [screen, setScreen] = useState<Screen>("splash");
  const previousPreferences = useRef(prefs);
  const [systemStill, setSystemStill] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const sceneStill = prefs.still || systemStill;
  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setSystemStill(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const [selected, setSelected] = useState<TrialId>("lotus"), [intro, setIntro] = useState(0);
  const [settings, setSettings] = useState(false), [restart, setRestart] = useState(false), [assistance, setAssistance] = useState(false);
  const [storageError, setStorageError] = useState(""), [audioError, setAudioError] = useState("");
  const [aiState, setAiState] = useState<AiState>("idle"), [aiError, setAiError] = useState(""), [aiPlan, setAiPlan] = useState<OpponentPlan | null>(null);
  const [modelStatus, setModelStatus] = useState("Optional model connection not checked yet."), [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState<{ plan: OpponentPlan; practice: boolean; key: number; modelPrepared: boolean; originalCave?: boolean; demo?: boolean; lab?: boolean; seed?: number } | null>(null), [result, setResult] = useState<GameState | null>(null);
  // AI Lab state. Lab runs never touch the campaign save: they launch as
  // practice attempts, and their results are kept only in this table.
  const [lab, setLab] = useState<LabSettings>({ trial: "cyclops", difficulty: "hard", seeded: true, seed: 20250, showPrediction: true, showHistory: true });
  const [labRuns, setLabRuns] = useState<LabRun[]>([]);
  const labRunId = useRef(0);
  const request = useRef<AbortController | null>(null), generation = useRef(0), runKey = useRef(0), audio = useRef<VoyageAudio | null>(null), heading = useRef<HTMLElement>(null);
  const trial = trialFor(selected), completed = clearedCount(save);

  useEffect(() => { const service = new VoyageAudio(); audio.current = service; return () => { service.dispose(); audio.current = null; request.current?.abort(); }; }, []);
  useEffect(() => { try { localStorage.setItem(saveKey, JSON.stringify(save)); localStorage.setItem(preferencesKey, JSON.stringify(prefs)); setStorageError(""); } catch { setStorageError("Browser saving is unavailable. Keep this tab open to preserve your voyage."); } }, [save, prefs, saveKey, preferencesKey]);
  useEffect(() => { if (previousPreferences.current !== prefs) { previousPreferences.current = prefs; online?.command({ type: "preferences", preferences: prefs }); } }, [prefs, online]);
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0, behavior: "instant" }); }, [screen]);
  useEffect(() => { audio.current?.update({ enabled: prefs.sound, music: prefs.music, effects: prefs.effects, ducked: false, quiet: settings, mood: screen === "ending" ? "home" : screen === "play" ? selected === "bow" ? "home" : "danger" : "voyage" }); }, [prefs.sound, prefs.music, prefs.effects, screen, selected, settings]);
  useEffect(() => {
    if (aiState !== "loading") return;
    const start = Date.now(), interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [aiState]);
  useEffect(() => { void checkModel(); }, []);
  useEffect(() => {
    if (!settings && !restart && !assistance) return;
    document.querySelector<HTMLButtonElement>(".a-modal button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSettings(false); setRestart(false); setAssistance(false); }
      if (e.key !== "Tab") return;
      const items = Array.from(document.querySelectorAll<HTMLElement>(".a-modal button, .a-modal input, .a-modal select, .a-modal a, .a-modal summary")).filter(el => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); if (screen === "play") document.querySelector<HTMLButtonElement>(".a-round-overlay button")?.focus(); else heading.current?.focus(); };
  }, [settings, restart, assistance]);
  function cancelAi() { generation.current++; request.current?.abort(); request.current = null; setAiState("idle"); setAiPlan(null); setAiError(""); }
  async function checkModel() {
    setModelStatus("Checking AI connection...");
    try { const r = await fetch("/api/arcade", { signal: AbortSignal.timeout(6000) }); const v = await r.json(); setModelStatus(typeof v.message === "string" ? v.message : "AI status unavailable. Local rivals are ready."); }
    catch { setModelStatus("AI connection unavailable. Local rivals are ready."); }
  }
  async function prepare() {
    cancelAi(); const controller = new AbortController(), token = generation.current; request.current = controller;
    setAiState("loading"); setElapsed(0);
    try {
      const response = await fetch("/api/arcade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trialId: selected, difficulty: prefs.difficulty, recent: save.records[selected].recent }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(95000)]) });
      const body = await response.json();
      if (token !== generation.current || controller.signal.aborted) return;
      if (!response.ok) { setAiError(typeof body.error === "string" ? body.error : "The opponent could not be prepared."); setAiState(body.code === "invalid_plan" ? "uncertain" : "error"); return; }
      if (!validPlan(selected, body.plan) || body.plan.source !== "ai") { setAiError("The returned strategy is unsupported. Prepare another or play standard."); setAiState("uncertain"); return; }
      setAiPlan(body.plan); setAiState("ready"); audio.current?.cue("reply");
    } catch {
      if (token !== generation.current || controller.signal.aborted) return;
      setAiError("The AI request failed or timed out. Retry, or play standard. Your voyage is kept."); setAiState("error");
    } finally { if (token === generation.current) request.current = null; }
  }
  function wakeAudio() { if (prefs.sound) void audio.current?.unlock().catch(() => setAudioError("Audio could not start. Every cue is also visible.")); }
  function navigate(next: Screen) { wakeAudio(); cancelAi(); if (screen === "play") audio.current?.setIntensity(0); setAssistance(false); setRestart(false); setScreen(next); }
  function openTrial(id: TrialId) { if (!unlocked(save, id)) return; cancelAi(); setSelected(id); setAssistance(false); setResult(null); setScreen("brief"); }
  function launch(practice = false, standard = false, originalCave = false) {
    const plan = practice || standard || prefs.mode === "standard" ? standardPlan(selected) : aiPlan || adaptivePlan(selected);
    const modelPrepared = !practice && !standard && prefs.mode === "ai" && aiState === "ready";
    wakeAudio(); cancelAi(); setRun({ plan, practice, modelPrepared, originalCave, key: ++runKey.current }); setScreen("play"); audio.current?.cue("sail");
  }
  function finish(round: GameState) {
    if (!round.done || round.id !== selected) return;
    audio.current?.setIntensity(0);
    if (run?.lab) {
      // A lab run records a comparison row and returns to the lab, leaving the
      // campaign save, medals and unlocks untouched.
      const runtime = aiRuntimeOf(round);
      if (runtime) setLabRuns(old => [...old, labRunFrom(round, runtime, run.seed ?? 0, ++labRunId.current)].slice(-24));
      setResult(round);
      setScreen("lab");
      audio.current?.cue(round.won ? "sail" : "costly");
      return;
    }
    if (!round.practice) {
      const summary = gameSummary(round);
      setSave(old => finishAttempt(old, selected, summary));
      online?.command({ type: "complete", trialId: selected, summary });
    }
    setResult(round); setScreen("result"); audio.current?.cue(round.won ? "sail" : "costly");
  }
  async function toggleSound() {
    const enabled = !prefs.sound;
    if (enabled) { try { await audio.current?.unlock(); setAudioError(""); } catch { setAudioError("Audio could not start. Every game cue is also visible."); return; } }
    setPrefs(old => ({ ...old, sound: enabled }));
  }
  function setDifficulty(value: Difficulty) { cancelAi(); setPrefs(old => ({ ...old, difficulty: value })); }
  function newVoyage() { online?.command({ type: save.started ? "restart" : "start" }); cancelAi(); setSave({ ...newArcade(), started: true }); setSelected("lotus"); setIntro(0); setRestart(false); setScreen("intro"); }
  function continueVoyage() { const next = trials.find(t => save.records[t.id].cleared === "pending"); if (next) openTrial(next.id); else navigate("ending"); }
  function unlockAllForShowcase() {
    cancelAi();
    setSave(old => ({
      ...old,
      started: true,
      records: Object.fromEntries(
        trials.map(t => [t.id, { ...old.records[t.id], cleared: old.records[t.id].cleared === "pending" ? "cleared" : old.records[t.id].cleared }]),
      ) as typeof old.records,
    }));
  }
  function useAssistance() {
    const updated = assistTrial(save, selected);
    if (updated !== save) online?.command({ type: "assist", trialId: selected });
    setSave(updated); cancelAi(); setAssistance(false); setResult(null);
    const index = trials.findIndex(t => t.id === selected);
    // React commits the save asynchronously. Navigate from the new state,
    // rather than asking openTrial to check the previous render's locked route.
    if (index === trials.length - 1) setScreen("ending");
    else if (unlocked(updated, trials[index + 1].id)) { setSelected(trials[index + 1].id); setScreen("brief"); }
  }
  function launchLab(difficulty: Difficulty) {
    wakeAudio();
    cancelAi();
    // A seeded comparison holds one layout across the three difficulties, so a
    // presenter can show that only the opponent changed.
    const seed = lab.seeded ? lab.seed : 4200 + ++runKey.current * 19;
    setSelected(lab.trial);
    setPrefs(old => ({ ...old, difficulty }));
    setResult(null);
    setRun({ plan: standardPlan(lab.trial), practice: false, modelPrepared: false, lab: true, seed, key: ++runKey.current });
    setScreen("play");
    audio.current?.cue("sail");
  }
  function launchDemo() { wakeAudio(); cancelAi(); setSelected("lotus"); setRun({ plan: standardPlan("lotus"), practice: true, modelPrepared: false, demo: true, key: ++runKey.current }); setScreen("play"); }
  const primaryLabel = prefs.mode === "ai" ? aiState === "ready" ? "Start model-planned duel" : "Start local AI duel" : "Start encounter";

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (settings || restart || assistance || (e.target as HTMLElement).closest("input,select,textarea,summary")) return;
      if (screen === "splash" && e.key === "Enter") { e.preventDefault(); navigate("title"); }
      else if (screen === "title" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        const items = [...document.querySelectorAll<HTMLButtonElement>(".od-menu button:not(:disabled)")];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = index < 0 ? e.key === "ArrowUp" || e.key === "End" ? items.length - 1 : 0 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        e.preventDefault(); items[next]?.focus();
      } else if (e.key === "Escape" && screen !== "play" && screen !== "title") navigate("title");
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [screen, settings, restart, assistance]);
  const blocked = settings || restart || assistance;
  const best = save.records[selected].bests[prefs.difficulty];

  return <div className={"a-app od-app fs-app" + (sceneStill ? " a-still" : "") + (prefs.contrast ? " od-contrast" : "")}>
    {screen === "splash" ? <main className="od-splash" inert={blocked}>
      <div className="od-backdrop"/><div className="od-cinematic-shade"/><div className="od-particles" aria-hidden="true"/>
      <span className="od-presents">AN EPIC ARCADE ADVENTURE</span>
      <section className="od-splash-content" ref={heading} tabIndex={-1}><div className="od-title-ornament"><span/><Compass size={34} strokeWidth={1}/><span/></div><h1 className="od-wordmark"><FarshoreLogo/></h1><p>Eight Trials. One Journey Home.</p><button className="od-enter" onClick={() => navigate("title")}>PRESS ENTER TO START <ArrowRight size={17}/></button><span className="od-start-hint">or click to set sail</span></section>
      <div className="od-cinematic-footer"><span>AN ADVENTURE INSPIRED BY HOMER</span><span>KEYBOARD | MOUSE | TOUCH</span></div>
    </main> : screen === "title" ? <main className="od-menu-screen" inert={blocked}>
      <div className="od-backdrop"/><div className="od-menu-shade"/><div className="od-particles" aria-hidden="true"/>
      <div className="od-menu-top"><span><Compass size={17}/> FARSHORE / ARCADE ADVENTURES</span><button className="od-sound" onClick={() => void toggleSound()} aria-label={prefs.sound ? "Mute sound" : "Enable sound"}>{prefs.sound ? <Volume2 size={18}/> : <VolumeX size={18}/>} SOUND {prefs.sound ? "ON" : "OFF"}</button></div>
      <div className="fs-menu-temple"><span className="fs-column fs-column-left" aria-hidden="true"/><span className="fs-column fs-column-right" aria-hidden="true"/><Torch/><Torch side="right"/><section className="od-menu-content" ref={heading} tabIndex={-1}><span className="a-eyebrow">THE LONG WAY HOME</span><h1 className="od-wordmark"><FarshoreLogo/></h1><p className="od-menu-tagline">Eight Trials. One Journey Home.</p>
        <nav className="od-menu" aria-label="Main menu">
          {save.started && <button className="od-menu-primary" onClick={continueVoyage}><Play size={17}/><span>CONTINUE JOURNEY</span><ArrowRight size={17}/></button>}
          <button className={!save.started ? "od-menu-primary" : ""} onClick={() => save.started ? setRestart(true) : newVoyage()}><Sparkles size={17}/><span>NEW GAME</span><ArrowRight size={17}/></button>
          {!save.started && <button disabled><Play size={17}/><span>CONTINUE JOURNEY</span><small>NO SAVE YET</small></button>}
          <button onClick={() => navigate("map")}><Map size={17}/><span>SELECT TRIAL</span><small>08 TRIALS</small></button>
          <button onClick={() => navigate("howto")}><BookOpen size={17}/><span>HOW TO PLAY</span><ArrowRight size={16}/></button>
          <button onClick={() => navigate("lab")}><FlaskConical size={17}/><span>AI LAB</span><small>PROFESSOR MODE</small></button>
          <button onClick={() => setSettings(true)}><Settings size={17}/><span>SETTINGS</span><ArrowRight size={16}/></button>
          <button onClick={() => navigate("credits")}><Info size={17}/><span>CREDITS</span><ArrowRight size={16}/></button>
        </nav><p className="od-menu-save">{save.started ? `${String(completed).padStart(2, "0")} / 08 encounters completed · Your voyage is saved` : "No account needed. Your voyage saves as you play."}</p>
      </section></div><aside className="od-title-story"><span className="od-story-rule"/><span className="a-eyebrow">A KING. A SHIP. A PROMISE.</span><p>The gods have other plans.<br/>Ithaca is still waiting.</p><span>Outwit the myths. Find your way home.</span></aside>
      <div className="od-cinematic-footer"><span>TROY <span className="od-route-dots">..................</span> ITHACA</span><span>AN ORIGINAL MYTHOLOGICAL ARCADE ADVENTURE</span></div>
    </main> : <>
      <header className="a-header" inert={blocked}><button className="a-brand" onClick={() => navigate("title")} disabled={screen === "play"}><Compass size={27} strokeWidth={1.2}/><span><FarshoreLogo compact/><small>Eight Trials. One Journey Home.</small></span></button><nav aria-label="Game navigation"><button className="a-btn a-small a-ghost" disabled={screen === "play"} onClick={() => navigate("map")}><Map size={16}/> Voyage map</button><button className="a-btn a-small a-ghost" disabled={screen === "play"} onClick={() => setSettings(true)}><Settings size={16}/> Settings</button></nav></header>
      <main className="a-main" inert={blocked} ref={heading} tabIndex={-1}>
        {screen === "intro" && <section className="a-intro a-paper od-intro"><span className="a-eyebrow">{intro === 0 ? "PROLOGUE · AFTER THE FALL OF TROY" : "YOUR VOYAGE BEGINS"}</span><div className="a-intro-portraits"><Portrait tile={0} label="Odysseus" large/>{intro === 1 && <Portrait tile={3} label="Penelope" large/>}</div><h1>{intro === 0 ? "The war is over. The journey is not." : "Eight trials stand between you and home."}</h1><p>{intro === 0 ? "You are Odysseus, king of Ithaca. Ten years at Troy have taken you far from Penelope and Telemachus. Now, with your crew beside you, you turn your ship toward home." : "Rescue your crew from the lotus, outrun a giant, sail the winds, break Circe's spell, resist the Sirens, survive the strait, cross a storm, and reclaim the bow of Ithaca."}</p><div className="a-actions"><button className="a-btn a-primary" onClick={() => intro === 0 ? setIntro(1) : openTrial("lotus")}>{intro === 0 ? "The journey ahead" : "Land of the Lotus-Eaters"}<ArrowRight size={17}/></button><button className="a-btn a-ghost" onClick={() => navigate("map")}>Open voyage map</button></div><p className="a-caption">An original arcade retelling. Each island has its own controls and a short practice.</p></section>}
        {screen === "map" && <TrialSelection save={save} selected={selected} difficulty={prefs.difficulty} still={sceneStill} onSelect={setSelected} onOpen={openTrial} onDifficulty={setDifficulty} onBegin={newVoyage}/>}
        {screen === "brief" && <section className="a-brief"><div className="a-brief-scene"><TrialArtwork id={selected} className="fs-brief-art"/><div className="a-brief-shade"/><div className="a-character-intro"><div className="od-brief-icon"><TrialGlyph id={selected} size={42}/></div><div><span className="a-eyebrow">ENCOUNTER 0{trials.findIndex(t => t.id === selected) + 1} / 08 · {trial.kind.toUpperCase()}</span><h1>{trial.title}</h1><p>{trial.story}</p></div></div></div><div className="a-brief-body"><div className="a-brief-instructions"><span className="a-eyebrow">YOUR OBJECTIVE</span><h2>{challengeObjective(selected, prefs.difficulty)}</h2><div className="od-control-guide"><BookOpen size={21}/><div><strong>Know your controls</strong><p>{trial.controls}</p></div></div><div className="od-enemy"><Portrait tile={trial.portrait} label={trial.character}/><div><span>YOUR OPPONENT</span><strong>{trial.character}</strong><p>&ldquo;{trial.quote}&rdquo;</p></div></div><details className="a-source"><summary>In Homer / in this game</summary><p><strong>Book {trial.book}:</strong> {trial.homer}</p><p>{trial.adaptation}</p><a href={`https://www.gutenberg.org/files/1727/1727-h/1727-h.htm#chap${trial.book === "IX" ? "09" : trial.book === "X" ? "10" : trial.book === "XII" ? "12" : trial.book === "V" ? "05" : "21"}`} target="_blank" rel="noreferrer">Read the episode</a></details>{selected === "cyclops" && <details className="a-source"><summary>Original cave tactics</summary><p>The original grid escape remains playable as a separate practice. It does not affect voyage progress.</p><button className="a-btn a-small" onClick={() => launch(true, true, true)}>Play cave tactics</button></details>}</div><div className="a-brief-options"><span className="a-eyebrow">PREPARE FOR THE TRIAL</span><label className="a-field">Difficulty<select value={prefs.difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}><option value="easy">Easy - find your sea legs</option><option value="normal">Medium - the full adventure</option><option value="hard">Hard - challenge the gods</option></select></label><p className="a-difficulty-note">{prefs.difficulty === "hard" ? "Faster hazards and demanding opponents. Every attack still gives you time to react." : prefs.difficulty === "normal" ? "A balanced challenge. Practice once to learn the island's rhythm." : "Slower hazards, wider openings, and more room to learn."}</p><fieldset className="a-rival-picker"><legend>Opponent behavior</legend><div className="a-segment"><button aria-pressed={prefs.mode === "standard"} onClick={() => { cancelAi(); setPrefs(p => ({ ...p, mode: "standard" })); }}>Arcade Solo</button><button aria-pressed={prefs.mode === "ai"} onClick={() => { cancelAi(); setPrefs(p => ({ ...p, mode: "ai" })); }}>Adaptive AI</button></div></fieldset><div className="a-opponent-info" aria-live="polite">{prefs.mode === "standard" ? <><strong>A learnable mythic opponent</strong><p>{trial.standard}</p></> : aiState === "loading" ? <><strong>Preparing {trial.character}'s strategy...</strong><p>{elapsed}s elapsed. The encounter has not started.</p><button className="a-text-btn" onClick={cancelAi}>Cancel preparation</button></> : aiState === "ready" && aiPlan ? <><strong>Model strategy ready</strong><p>{planDescription(selected, aiPlan)}</p><button className="a-text-btn" onClick={() => void prepare()}>Prepare another</button></> : <><strong>A rival who reacts to you</strong>{aiError && <p role="alert">{aiError}</p>}<p>{trial.adaptive}</p><button className="a-text-btn" onClick={() => void prepare()}>{aiError ? "Retry model preparation" : "Prepare with connected model"}</button><details><summary>How does the AI work?</summary><p>Local game AI acts during play. Optional model planning selects its strategy before the round. The game always owns collisions, scoring, and progress.</p></details></>}</div>{best && <span className="od-personal-best"><Trophy size={16}/> {best.medal} · Best {best.score} · {Math.round(best.timeMs / 1000)}s</span>}<button className="a-btn a-primary" disabled={aiState === "loading"} onClick={() => launch()}>{primaryLabel}<ArrowRight size={17}/></button><button className="a-btn" onClick={() => launch(true)}>Try a short practice</button><span className="od-practice-note">Practice keeps your voyage progress untouched. The encounter opens in a full-screen stage; F3 cycles the AI inspector and Escape pauses.</span></div></div></section>}
        {screen === "play" && run && <p className="a-caption od-stage-note">The encounter is running in the full-screen stage. Press Escape to pause.</p>}
        {screen === "result" && result && <section className={`a-result a-paper od-result fs-rich-result ${result.won ? "won" : "lost"}`}><ResultFrieze state={result}/><span className="a-eyebrow">ENCOUNTER 0{trials.findIndex(t => t.id === selected) + 1} · {trial.title.toUpperCase()}</span><div className={`od-medal ${result.practice ? "practice" : result.won ? medalFor(gameSummary(result)) : "failed"}`}><Trophy size={49} strokeWidth={1}/><span>{result.practice ? "PRACTICE" : result.won ? `${medalFor(gameSummary(result)).toUpperCase()} MEDAL` : "TRY AGAIN"}</span></div><h1>{result.practice ? run?.demo ? "A lesson in cunning." : "Practice complete." : result.won ? "VICTORY" : "TRIAL FAILED"}</h1><p>{result.practice ? "No progress was changed. Take what you've learned into the encounter." : result.won ? trial.success : result.feedback}</p><div className="a-result-stats"><span><strong>{result.score.toLocaleString()}</strong>{selected === "bow" ? "rings" : selected === "circe" ? "brew points" : "final score"}</span><span><strong>{Math.floor(result.elapsed / 60000)}:{String(Math.floor(result.elapsed / 1000) % 60).padStart(2, "0")}</strong>completion time</span><span><strong>{difficultyNames[result.difficulty]}</strong>difficulty</span></div><PerformanceSeals state={result}/><p className="a-caption">{selected === "bow" || selected === "circe" ? `Odysseus ${result.score} · ${trial.character} ${result.rivalScore}` : `${gameSummary(result).hits} hits · Best streak ${result.bestCombo} · ${result.misses} misses`}{!result.practice && ` · Personal best ${save.records[selected].bests[result.difficulty]?.score ?? "—"}`}</p><div className="a-actions">{!result.practice && result.won && <button className="a-btn a-primary" onClick={() => completed === trials.length ? navigate("ending") : continueVoyage()}>{completed === trials.length ? "Return to Ithaca" : "Next encounter"}<ArrowRight size={17}/></button>}<button className={`a-btn ${!result.won || result.practice ? "a-primary" : ""}`} onClick={() => save.started ? launch() : newVoyage()}><RotateCcw size={16}/>{!save.started ? "Begin voyage" : result.won ? "Replay encounter" : "Retry"}</button><button className="a-btn a-ghost" onClick={() => navigate("brief")}>Change difficulty</button><button className="a-btn a-ghost" onClick={() => navigate("map")}>World map</button></div>{!result.practice && !result.won && <details className="od-accessibility-passage"><summary>Accessibility: request Athena's help</summary><p>An assisted passage is recorded separately and earns no medal.</p><button className="a-text-btn" onClick={() => setAssistance(true)}>Request an assisted passage</button></details>}</section>}
        {screen === "ending" && <section className="a-ending a-paper"><span className="a-eyebrow">ITHACA / AT LAST</span><div className="a-family"><Portrait tile={0} label="Odysseus" large/><Portrait tile={3} label="Penelope" large/><Portrait tile={4} label="Telemachus" large/></div><h1>Home is more than a shore.</h1><p>The long crossing is behind you. Penelope recognizes the man who returned, and Telemachus stands beside his father. For this moment, the sea can wait.</p><div className="a-ending-report">{trials.map(t => <div key={t.id}><span>{t.title}</span><strong>{save.records[t.id].cleared === "assisted" ? "Assisted" : save.records[t.id].bests[prefs.difficulty]?.medal || "Cleared"}</strong></div>)}</div><div className="a-actions"><button className="a-btn a-primary" onClick={() => navigate("map")}>Revisit the voyage</button><button className="a-btn" onClick={() => setRestart(true)}>New game</button></div><p className="a-caption">An original epilogue condensing the Odyssey's homecoming.</p></section>}
        {screen === "lab" && <AILabMode settings={lab} runs={labRuns} onSettings={setLab} onLaunch={launchLab} onClearRuns={() => setLabRuns([])} onBack={() => navigate("title")}/>}
        {screen === "howto" && <section className="od-guide"><span className="a-eyebrow">A CAPTAIN'S HANDBOOK</span><h1>Every island has its own rules.</h1><p className="a-lead">Eight encounters. Three difficulties. As many attempts as you need.</p><div className="od-guide-basics"><div><Compass size={26}/><h2>Follow the voyage</h2><p>Win an encounter to unlock the next island. Continue returns you to the first unfinished trial. Completed islands can be replayed for better medals.</p></div><div><Trophy size={26}/><h2>Earn your legend</h2><p>Win with no hits or misses for gold, up to two for silver, or finish for bronze. Best scores, times, and medals are saved for each difficulty.</p></div><div><Play size={26}/><h2>Take your time</h2><p>Escape pauses the simulation. Resume, restart, check controls, or change settings there. Switching tabs also pauses the action.</p></div></div><div className="od-control-list">{trials.map((t, i) => <article key={t.id}><span className="od-guide-number">0{i + 1}</span><TrialGlyph id={t.id}/><div><h2>{t.title}<small>{t.kind}</small></h2><p>{t.controls}</p></div></article>)}</div><div className="a-actions"><button className="a-btn a-primary" onClick={launchDemo}><Play size={17}/> Watch AI rescue demonstration</button><button className="a-btn" onClick={() => navigate("lab")}><FlaskConical size={17}/> Open the AI Lab</button><button className="a-btn a-ghost" onClick={() => navigate("title")}><ArrowLeft size={17}/> Main menu</button></div><p className="a-caption">The demonstration uses local A* pathfinding to rescue a sailor. No model connection or account is needed, and no progress is saved.</p></section>}
        {screen === "credits" && <section className="a-paper od-credits"><span className="a-eyebrow">THE PEOPLE & THE POEM</span><Compass size={50} strokeWidth={1}/><h1>A story three thousand years in the making.</h1><p>Inspired by Homer's <em>The Odyssey</em>. An independent FARSHORE arcade adaptation with original rules and imaginative mythological settings.</p><dl><div><dt>PROJECT</dt><dd>FARSHORE / Bibek Pathak</dd></div><div><dt>ART & SOUND</dt><dd>Original generated landscape and portrait art / Locally synthesized maritime music</dd></div><div><dt>TYPE & ICONS</dt><dd>Press Start 2P by CodeMan38 (SIL OFL) / Georgia / Lucide (ISC)</dd></div><div><dt>BUILT WITH</dt><dd>React / TypeScript / Next.js / Canvas & SVG</dd></div></dl><p className="a-caption">Lotus Guardians, competitive potion brewing, wind gates, and repeated arcade contests are fictional game devices. The earlier advice voyage and Circe mystery remain in Settings.</p><div className="a-actions"><a className="a-btn" href="/story-sources.md" target="_blank" rel="noreferrer">Story & sources</a><button className="a-btn a-primary" onClick={() => navigate("title")}>Main menu</button></div></section>}
      </main><footer className="a-footer" inert={blocked}><span>{String(completed).padStart(2, "0")} / 08 ENCOUNTERS COMPLETE</span><span>THE SEA REMEMBERS EVERY JOURNEY.</span></footer>
    </>}
    {screen === "play" && run && <ArcadeRound key={run.key} id={selected} difficulty={prefs.difficulty} plan={run.plan} practice={run.practice} seed={run.seed ?? 4200 + run.key * 19 + save.records[selected].attempts} still={sceneStill} shake={prefs.shake && !sceneStill ? 1 : 0} effects={sceneStill ? 0 : prefs.visuals} originalCave={run.originalCave} demo={run.demo} modelPrepared={run.modelPrepared} onSettings={() => setSettings(true)} onNote={lane => audio.current?.arcadeNote(lane)} onIntensity={level => audio.current?.setIntensity(level)} onFinish={finish} onLeave={() => navigate(run.lab ? "lab" : "map")} labOverlay={run.lab ? { showPrediction: lab.showPrediction, showHistory: lab.showHistory } : undefined} onFeedback={good => audio.current?.cue(good ? "select" : "costly")}/>}
    {(storageError || audioError) && <div className="a-notice" role="status">{storageError || audioError}</div>}
    {settings && <div className="a-modal-backdrop"><section className="a-settings a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-settings-title"><div className="a-modal-head"><span className="a-eyebrow">MAKE YOURSELF AT HOME</span><button className="a-btn a-small" onClick={() => setSettings(false)}>Close</button></div><h2 id="a-settings-title">Voyage settings</h2><button className="a-setting-toggle" aria-pressed={prefs.sound} onClick={() => void toggleSound()}><span>Music & sounds<small>Original maritime music. Every cue is also visible.</small></span><strong>{prefs.sound ? "On" : "Off"}</strong></button><OdysseyPreferences preferences={prefs} onChange={setPrefs}/><button className="a-setting-toggle" aria-pressed={prefs.still} onClick={() => setPrefs(p => ({ ...p, still: !p.still }))}><span>Reduced motion<small>Stops decorative scenery, particles, and transitions.</small></span><strong>{prefs.still ? "On" : "Off"}</strong></button><p className="a-caption">Difficulty and opponent behavior can be changed before each encounter. Game movement remains visible when reduced motion is enabled.</p><div className="a-connection"><strong>Optional model connection</strong><p role="status">{modelStatus}</p><button className="a-btn a-small" onClick={() => void checkModel()}>Check connection again</button><p className="a-caption">Every encounter and the AI demonstration work without a model.</p></div><div className="a-connection"><strong>Showcase / presentation</strong><p className="a-caption">Unlocks every island on the voyage map so you can open any encounter directly, without playing through the earlier ones. Existing scores and medals are kept; nothing is fabricated or overwritten. For a quicker path into a specific encounter&apos;s UI and AI inspector with zero effect on your save at all, use <strong>AI LAB</strong> from the main menu instead.</p><button className="a-btn a-small a-primary" onClick={unlockAllForShowcase}>Unlock all islands</button></div><details><summary>Earlier Farshore modes</summary><div className="a-legacy"><a href="/?mystery">Circe's mystery</a><a href="/?voyage">Original advice voyage</a></div><p className="a-caption">Each mode has its own saved progress. Original cave tactics are available in the Cyclops briefing.</p></details></section></div>}
    {restart && <div className="a-modal-backdrop"><section className="a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-restart-title"><span className="a-eyebrow">A FRESH HORIZON</span><h2 id="a-restart-title">Begin a new voyage?</h2><p>This resets your eight-trial voyage, best scores, and medals.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setRestart(false)}>Keep this voyage</button><button className="a-btn a-primary" onClick={newVoyage}>Begin anew</button></div></section></div>}
    {assistance && <div className="a-modal-backdrop"><section className="a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-assist-title"><h2 id="a-assist-title">A little help from Athena.</h2><p>Continue with an assisted passage. Your voyage report will mark it Assisted, with no medal or score. Replay later to earn a victory.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setAssistance(false)}>Keep trying</button><button className="a-btn a-primary" onClick={useAssistance}>Accept Athena's help</button></div></section></div>}
  </div>;
}
