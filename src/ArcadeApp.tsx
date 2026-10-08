import { useEffect, useRef, useState } from "react";
import { ArcadeRound } from "./components/arcade-round";
import { ARCADE_PREFS, ARCADE_SAVE, adaptivePlan, assistTrial, challengeObjective, clearedCount, difficultyNames, finishAttempt, newArcade, planDescription, readArcade, standardPlan, trialFor, trials, unlocked, validPlan, type ArcadeSave, type Difficulty, type OpponentPlan, type TrialId } from "./lib/arcade";
import { mythicSummary, scoreLabel, type MythicState } from "./lib/mythic";
import { VoyageAudio } from "./lib/voyage-audio";
import "./arcade.css";
import "./mythic.css";

type Screen = "title" | "intro" | "map" | "brief" | "play" | "result" | "ending";
type Prefs = { revision: 2; difficulty: Difficulty; sound: boolean; still: boolean; mode: "standard" | "ai" };
type AiState = "idle" | "loading" | "ready" | "error" | "uncertain";
function loadPrefs(): Prefs {
  const defaults: Prefs = { revision: 2, difficulty: "normal", sound: false, still: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, mode: "standard" };
  try { const v = JSON.parse(localStorage.getItem(ARCADE_PREFS) || "null"); if (v && ["easy", "normal", "hard"].includes(v.difficulty) && typeof v.sound === "boolean" && typeof v.still === "boolean" && ["standard", "ai"].includes(v.mode)) return { ...v, revision: 2, difficulty: v.revision === 2 ? v.difficulty : "normal" }; } catch { /* Defaults remain playable without storage. */ }
  return defaults;
}
function Portrait({ tile, label, large = false }: { tile: number; label: string; large?: boolean }) {
  return <span role="img" aria-label={label} className={"a-portrait" + (large ? " large" : "")} style={{ backgroundPosition: `${tile % 5 * 25}% ${Math.floor(tile / 5) * 100 / 3}%` }}/>;
}
export default function ArcadeApp() {
  const [save, setSave] = useState<ArcadeSave>(() => { try { return readArcade(localStorage.getItem(ARCADE_SAVE)) || newArcade(); } catch { return newArcade(); } });
  const [prefs, setPrefs] = useState(loadPrefs), [screen, setScreen] = useState<Screen>("title");
  const [selected, setSelected] = useState<TrialId>("cyclops"), [intro, setIntro] = useState(0);
  const [settings, setSettings] = useState(false), [restart, setRestart] = useState(false), [assistance, setAssistance] = useState(false);
  const [storageError, setStorageError] = useState(""), [audioError, setAudioError] = useState("");
  const [aiState, setAiState] = useState<AiState>("idle"), [aiError, setAiError] = useState(""), [aiPlan, setAiPlan] = useState<OpponentPlan | null>(null);
  const [modelStatus, setModelStatus] = useState("Optional model connection not checked yet."), [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState<{ plan: OpponentPlan; practice: boolean; key: number; modelPrepared: boolean } | null>(null), [result, setResult] = useState<MythicState | null>(null);
  const request = useRef<AbortController | null>(null), generation = useRef(0), runKey = useRef(0), audio = useRef<VoyageAudio | null>(null), heading = useRef<HTMLElement>(null);
  const trial = trialFor(selected), completed = clearedCount(save);

  useEffect(() => { const service = new VoyageAudio(); audio.current = service; return () => { service.dispose(); audio.current = null; request.current?.abort(); }; }, []);
  useEffect(() => { try { localStorage.setItem(ARCADE_SAVE, JSON.stringify(save)); localStorage.setItem(ARCADE_PREFS, JSON.stringify(prefs)); setStorageError(""); } catch { setStorageError("Browser saving is unavailable. Keep this tab open to preserve your voyage."); } }, [save, prefs]);
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0, behavior: "instant" }); }, [screen, selected]);
  useEffect(() => { audio.current?.update({ enabled: prefs.sound, music: .24, effects: .45, ducked: false, quiet: settings, mood: screen === "ending" ? "home" : screen === "play" ? selected === "bow" ? "home" : "danger" : "voyage" }); }, [prefs.sound, screen, selected, settings]);
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
      if (e.key === "Escape") { setSettings(false); setRestart(false); setAssistance(false); }
      if (e.key !== "Tab") return;
      const items = Array.from(document.querySelectorAll<HTMLElement>(".a-modal button, .a-modal input, .a-modal select, .a-modal a, .a-modal summary")).filter(el => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); heading.current?.focus(); };
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
  function navigate(next: Screen) { wakeAudio(); cancelAi(); setAssistance(false); setRestart(false); setScreen(next); }
  function openTrial(id: TrialId) { if (!unlocked(save, id)) return; cancelAi(); setSelected(id); setAssistance(false); setResult(null); setScreen("brief"); }
  function launch(practice = false, standard = false) {
    const plan = practice || standard || prefs.mode === "standard" ? standardPlan(selected) : aiPlan || adaptivePlan(selected);
    const modelPrepared = !practice && !standard && prefs.mode === "ai" && aiState === "ready";
    wakeAudio(); cancelAi(); setRun({ plan, practice, modelPrepared, key: ++runKey.current }); setScreen("play"); audio.current?.cue("sail");
  }
  function finish(round: MythicState) {
    if (!round.practice) setSave(old => finishAttempt(old, selected, mythicSummary(round)));
    setResult(round); setScreen("result"); audio.current?.cue(round.won ? "sail" : "costly");
  }
  async function toggleSound() {
    const enabled = !prefs.sound;
    if (enabled) { try { await audio.current?.unlock(); setAudioError(""); } catch { setAudioError("Audio could not start. Every game cue is also visible."); return; } }
    setPrefs(old => ({ ...old, sound: enabled }));
  }
  function setDifficulty(value: Difficulty) { cancelAi(); setPrefs(old => ({ ...old, difficulty: value })); }
  function newVoyage() { cancelAi(); setSave({ ...newArcade(), started: true }); setSelected("cyclops"); setIntro(0); setRestart(false); setScreen("intro"); }
  function continueVoyage() { const next = trials.find(t => save.records[t.id].cleared === "pending"); if (next) openTrial(next.id); else navigate("ending"); }
  function useAssistance() {
    const updated = assistTrial(save, selected);
    setSave(updated); cancelAi(); setAssistance(false); setResult(null);
    const index = trials.findIndex(t => t.id === selected);
    // React commits the save asynchronously. Navigate from the new state,
    // rather than asking openTrial to check the previous render's locked route.
    if (index === trials.length - 1) setScreen("ending");
    else if (unlocked(updated, trials[index + 1].id)) { setSelected(trials[index + 1].id); setScreen("brief"); }
  }
  const primaryLabel = prefs.mode === "ai" ? aiState === "ready" ? "Start model-planned duel" : "Start local AI duel" : "Start solo trial";

  return <div className={"a-app" + (prefs.still ? " a-still" : "")}>
    {screen === "title" ? <main className="a-title" inert={settings || restart || assistance}><div className="a-title-art"/><div className="a-title-shade"/><div className="a-title-top"><span>AN ODYSSEY ARCADE ADVENTURE</span><button className="a-btn a-small a-ghost" onClick={() => setSettings(true)}>Settings</button></div><section className="a-title-content" ref={heading} tabIndex={-1}><span className="a-eyebrow">THE LONG WAY HOME</span><h1>FARSHORE<span>The Odyssey: Arcade Trials</span></h1><p>Outwit a giant. Break a spell.<br/>Bring Odysseus home.</p><button className="a-btn a-primary a-begin" onClick={save.started ? () => navigate(completed === trials.length ? "ending" : "map") : newVoyage}>{save.started ? completed === trials.length ? "Your homecoming" : "Continue voyage" : "Begin voyage"}<span>→</span></button><span className="a-title-note">Five distinct trials · Keyboard or touch · Saved as you play</span>{save.started && <span className="a-resume-note">{completed} of {trials.length} encounters cleared <button onClick={() => setRestart(true)}>Start a new voyage</button></span>}</section><div className="a-title-bottom"><span>TROY → ITHACA</span><span>Inspired by Homer. Made for play.</span></div></main> : <>
      <header className="a-header" inert={settings || restart || assistance}><button className="a-brand" onClick={() => navigate("title")} disabled={screen === "play"}>FARSHORE<span>THE ODYSSEY: ARCADE TRIALS</span></button><nav aria-label="Game navigation"><button className="a-btn a-small a-ghost" disabled={screen === "play"} onClick={() => navigate("map")}>Voyage map</button><button className="a-btn a-small a-ghost" disabled={screen === "play"} onClick={() => setSettings(true)}>Settings</button></nav></header>
      <main className="a-main" inert={settings || restart || assistance} ref={heading} tabIndex={-1}>
        {screen === "intro" && <section className="a-intro a-paper"><span className="a-eyebrow">{intro === 0 ? "01 · THE WAR IS OVER" : "02 · YOUR WAY HOME"}</span><div className="a-intro-portraits"><Portrait tile={0} label="Odysseus" large/>{intro === 1 && <Portrait tile={3} label="Penelope" large/>}</div><h1>{intro === 0 ? "Troy has fallen. Home is still far away." : "Five rivals. One homecoming."}</h1><p>{intro === 0 ? "You are Odysseus, king of Ithaca. After ten years at war, you set sail for Penelope, Telemachus, and the home you left behind." : "Sneak past Polyphemus, brew against Circe, echo the Sirens, guard the strait, and outshoot Antinous. Each shore is a different arcade game. Practice or retry whenever you need."}</p><div className="a-actions"><button className="a-btn a-primary" onClick={() => intro === 0 ? setIntro(1) : openTrial("cyclops")}>{intro === 0 ? "Next" : "Meet the Cyclops"} →</button><button className="a-btn a-ghost" onClick={() => openTrial("cyclops")}>Skip introduction</button></div><p className="a-caption">An abridged, original arcade adaptation of the Odyssey.</p></section>}
        {screen === "map" && <section className="a-map-screen"><span className="a-eyebrow">TROY TO ITHACA</span><h1>Your way home</h1><p className="a-lead">{completed === trials.length ? "The voyage is complete. Revisit a trial or return to your homecoming." : `${completed} of ${trials.length} encounters cleared. The next shore is waiting.`}</p><div className="a-route" aria-label="Voyage progress"><div className="a-route-line"/><span className="a-route-start">TROY</span>{trials.map((t, i) => <button key={t.id} className={"a-map-stop " + save.records[t.id].cleared + (!unlocked(save, t.id) ? " locked" : "")} disabled={!unlocked(save, t.id)} onClick={() => openTrial(t.id)}><span className="a-stop-number">{save.records[t.id].cleared === "pending" ? i + 1 : "✓"}</span><Portrait tile={t.portrait} label={t.character}/><strong>{t.location}</strong><small className="m-stop-kind">{t.kind}</small><span>{save.records[t.id].cleared === "assisted" ? "Assisted passage" : save.records[t.id].cleared === "cleared" ? "Cleared · Replay" : unlocked(save, t.id) ? "Ready to play" : "Clear earlier trials"}</span></button>)}</div><button className="a-btn a-primary" onClick={continueVoyage}>{completed === trials.length ? "Return to your family" : "Continue voyage"} →</button><p className="a-caption">Other episodes are condensed between these five stops.</p></section>}
        {screen === "brief" && <section className="a-brief"><div className="a-brief-scene"><div className="a-stage-art" style={{ backgroundPosition: `${trial.tile % 3 * 50}% ${Math.floor(trial.tile / 3) * 100}%` }}/><div className="a-brief-shade"/><div className="a-character-intro"><Portrait tile={trial.portrait} label={trial.character} large/><div><span className="a-eyebrow">{trials.findIndex(t => t.id === selected) + 1} / {trials.length} · {trial.location.toUpperCase()}</span><h1>{trial.title}</h1><p>“{trial.quote}”</p><span>{trial.character}</span></div></div></div><div className="a-brief-body"><div className="a-brief-instructions"><span className="a-eyebrow">YOUR NEXT MOVE</span><h2>{challengeObjective(selected, prefs.difficulty)}</h2><p>{trial.controls}</p><p className="a-story">{trial.story}</p><details className="a-source"><summary>In Homer / in this game</summary><p><strong>Book {trial.book}:</strong> {trial.homer}</p><p>{trial.adaptation}</p><a href={`https://www.gutenberg.org/files/1727/1727-h/1727-h.htm#chap${trial.book === "IX" ? "09" : trial.book === "X" ? "10" : trial.book === "XII" ? "12" : "21"}`} target="_blank" rel="noreferrer">Read the episode ↗</a></details></div><div className="a-brief-options"><label className="a-field">Difficulty<select value={prefs.difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}><option value="easy">Easy · learn the controls</option><option value="normal">Normal · recommended challenge</option><option value="hard">Hard · demanding arcade play</option></select></label><p className="a-difficulty-note">{prefs.difficulty === "hard" ? "Shorter warnings, tougher melodies, and smaller ring openings." : prefs.difficulty === "normal" ? "The recommended challenge for a full arcade voyage." : "Longer warnings, slower drops, and larger ring openings."}</p><fieldset className="a-rival-picker"><legend>Game mode</legend><div className="a-segment"><button aria-pressed={prefs.mode === "standard"} onClick={() => { cancelAi(); setPrefs(p => ({ ...p, mode: "standard" })); }}>Arcade Solo</button><button aria-pressed={prefs.mode === "ai"} onClick={() => { cancelAi(); setPrefs(p => ({ ...p, mode: "ai" })); }}>AI Rival Battle</button></div></fieldset><div className="a-opponent-info" aria-live="polite">{prefs.mode === "standard" ? <><strong>A learnable mythic opponent</strong><p>{trial.standard}</p></> : aiState === "loading" ? <><strong>Preparing {trial.character}'s strategy...</strong><p>{elapsed}s elapsed. Both boards and every clock are stopped.</p><button className="a-text-btn" onClick={cancelAi}>Cancel preparation</button></> : aiState === "ready" && aiPlan ? <><strong>Model strategy ready</strong><p>{planDescription(selected, aiPlan)}</p><p className="a-rival-explanation">{difficultyNames[prefs.difficulty]} rules stay fixed. The rival acts during play.</p><button className="a-text-btn" onClick={() => void prepare()}>Prepare another</button></> : <><strong>{["error", "uncertain"].includes(aiState) ? "Model preparation unavailable" : "A rival who reacts to you"}</strong>{aiError && <p role="alert">{aiError}</p>}<p>{trial.adaptive}</p><p className="a-rival-explanation">Local adaptive AI is ready immediately. Optionally ask your connected model to choose the rival's strategy.</p><button className="a-text-btn" onClick={() => void prepare()}>{aiError ? "Retry model preparation" : "Prepare with connected model"}</button><details><summary>How does the AI work?</summary><p>Local heuristic rivals take turns or react during play. Optional model planning selects a strategy before the round using up to two attempt summaries. Scores, warnings, and wins stay under the game's rules.</p></details></>}</div><button className="a-btn a-primary" disabled={aiState === "loading"} onClick={() => launch()}>{primaryLabel} →</button><button className="a-btn" onClick={() => launch(true)}>Try a short practice</button><button className="a-text-btn" onClick={() => setAssistance(true)}>Need an assisted passage?</button></div></div></section>}
        {screen === "play" && run && <ArcadeRound key={run.key} id={selected} difficulty={prefs.difficulty} plan={run.plan} practice={run.practice} seed={4200 + run.key * 19 + save.records[selected].attempts} still={prefs.still} modelPrepared={run.modelPrepared} onNote={lane => audio.current?.arcadeNote(lane)} onFinish={finish} onLeave={() => navigate("brief")} onFeedback={good => audio.current?.cue(good ? "select" : "costly")}/>}
        {screen === "result" && result && <section className="a-result a-paper"><span className="a-eyebrow">{result.practice ? "PRACTICE COMPLETE" : result.won ? "ENCOUNTER CLEARED" : "ANOTHER CHANCE"}</span><div className="a-result-emblem">{result.practice ? "◇" : result.won ? "✦" : "↻"}</div><h1>{result.practice ? "Ready for the real duel?" : result.won ? selected === "bow" ? "The bow remembers you." : "The next shore awaits." : "The voyage isn't over."}</h1><p>{result.practice ? "Practice changes no progress. Return to the briefing or try again." : result.won ? trial.success : result.feedback}</p><div className="a-result-stats"><span><strong>{result.score}</strong>{scoreLabel(result)}</span><span><strong>{difficultyNames[result.difficulty]}</strong>difficulty</span><span><strong>{result.plan.source === "ai" ? "Adaptive AI" : "Solo"}</strong>game mode</span></div><p className="a-caption">{selected === "bow" || selected === "circe" ? `Odysseus ${result.score} · ${trial.character} ${result.rivalScore}` : `Best streak ${result.bestCombo}${selected === "sirens" ? ` · ${result.misses} missed notes` : ` · ${result.hits} hits`}`}</p><div className="a-actions">{!result.practice && result.won ? <button className="a-btn a-primary" onClick={() => selected === "bow" ? navigate("ending") : continueVoyage()}>{selected === "bow" ? "Return to your family" : "Sail to the next trial"} →</button> : <button className="a-btn a-primary" onClick={() => navigate("brief")}>{result.practice ? "Back to challenge" : "Try again"} →</button>}<button className="a-btn" onClick={() => launch(true)}>Practice again</button><button className="a-btn a-ghost" onClick={() => navigate("map")}>Voyage map</button></div>{!result.practice && !result.won && <button className="a-text-btn" onClick={() => setAssistance(true)}>Use an assisted passage</button>}</section>}
        {screen === "ending" && <section className="a-ending a-paper"><span className="a-eyebrow">ITHACA · AT LAST</span><div className="a-family"><Portrait tile={0} label="Odysseus" large/><Portrait tile={3} label="Penelope" large/><Portrait tile={4} label="Telemachus" large/></div><h1>Home is more than a shore.</h1><p>The long crossing is behind you. Penelope recognizes the man who returned, and Telemachus stands beside his father. For this moment, the sea can wait.</p><div className="a-ending-report">{trials.map(t => <div key={t.id}><span>{t.title}</span><strong>{save.records[t.id].cleared === "assisted" ? "Assisted" : "Cleared"}</strong></div>)}</div><div className="a-actions"><button className="a-btn a-primary" onClick={() => navigate("map")}>Replay a trial</button><button className="a-btn" onClick={() => setRestart(true)}>New voyage</button></div><p className="a-caption">An original epilogue condensing the Odyssey's homecoming.</p></section>}
      </main><footer className="a-footer" inert={settings || restart || assistance}><span>{completed} / {trials.length} ENCOUNTERS CLEARED</span><span>Every shore brings you closer.</span></footer>
    </>}
    {(storageError || audioError) && <div className="a-notice" role="status">{storageError || audioError}</div>}
    {settings && <div className="a-modal-backdrop"><section className="a-settings a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-settings-title"><div className="a-modal-head"><span className="a-eyebrow">MAKE YOURSELF AT HOME</span><button className="a-btn a-small" onClick={() => setSettings(false)}>Close</button></div><h2 id="a-settings-title">Voyage settings</h2><button className="a-setting-toggle" aria-pressed={prefs.sound} onClick={() => void toggleSound()}><span>Music & sounds<small>Original maritime music. Every cue is also visible.</small></span><strong>{prefs.sound ? "On" : "Off"}</strong></button><button className="a-setting-toggle" aria-pressed={prefs.still} onClick={() => setPrefs(p => ({ ...p, still: !p.still }))}><span>Still scenery<small>Stops decorative motion. Game markers stay visible.</small></span><strong>{prefs.still ? "On" : "Off"}</strong></button><p className="a-caption">Pace and rival type can be changed before each challenge.</p><div className="a-connection"><strong>AI connection</strong><p role="status">{modelStatus}</p><button className="a-btn a-small" onClick={() => void checkModel()}>Check connection again</button><p className="a-caption">Both game modes work without a model. Optional model planning requires your configured service.</p></div><details><summary>Earlier Farshore modes</summary><div className="a-legacy"><a href="/?mystery">Circe's mystery ↗</a><a href="/?voyage">Original advice voyage ↗</a></div><p className="a-caption">Each mode has its own saved progress.</p></details></section></div>}
    {restart && <div className="a-modal-backdrop"><section className="a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-restart-title"><h2 id="a-restart-title">Begin a new voyage?</h2><p>This resets arcade progress. Earlier game modes have separate saves.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setRestart(false)}>Keep this voyage</button><button className="a-btn a-primary" onClick={newVoyage}>Begin anew</button></div></section></div>}
    {assistance && <div className="a-modal-backdrop"><section className="a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-assist-title"><h2 id="a-assist-title">A little help from Athena.</h2><p>Pass this encounter and continue the story. Your voyage report will mark it Assisted. You can replay it later to earn a clear.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setAssistance(false)}>Keep trying</button><button className="a-btn a-primary" onClick={useAssistance}>Continue with help →</button></div></section></div>}
  </div>;
}
