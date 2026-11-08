import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArcadeRound } from "./components/play/arcade-round";
import { ARCADE_PREFS, ARCADE_SAVE, adaptivePlan, assistTrial, challengeObjective, clearedCount, difficultyNames, medalFor, finishAttempt, newArcade, planDescription, planLabel, readArcade, trialFor, trials, unlocked, validPlan, type ArcadeSave, type Difficulty, type OpponentPlan, type TrialId } from "./lib/arcade/arcade";
import { gameSummary, type GameState } from "./lib/arcade/arcade-runtime";
import { OdysseyPreferences } from "./components/menu/odyssey-preferences";
import { TrialGlyph } from "./components/menu/odyssey-map";
import { ArrowRight, ArrowLeft, Play, Map, BookOpen, Settings, Info, Compass, Trophy, Volume2, VolumeX, Sparkles, RotateCcw, FlaskConical, BrainCircuit, Swords, GraduationCap, Mic, MicOff, RefreshCw, Feather, SlidersHorizontal, Loader2, Undo2 } from "lucide-react";
import { VoyageAudio } from "./lib/audio/voyage-audio";
import { encounterSounds } from "./lib/audio/cues";
import "./styles/arcade.css";
import "./styles/mythic.css";
import "./styles/odyssey.css";
import "./styles/farshore.css";
import "./styles/farshore-brand.css";
import { FarshoreLogo, Torch, TrialArtwork, CharacterPortrait } from "./components/farshore-art";
import { PerformanceSeals, ResultFrieze } from "./components/ai/encounter-intel";
import "./styles/farshore-detail.css";
import "./styles/farshore-stage.css";
import "./styles/farshore-cinema.css";
import { TrialSelection } from "./components/menu/trial-selection";
import { AILabMode, labRunFrom, type LabRun, type LabSettings } from "./components/ai/ai-lab-mode";
import { aiRuntimeOf } from "./lib/arcade/arcade-runtime";
import { defaultPreferences, preferencesSchema, type OnlineGame, type OnlinePreferences } from "./lib/online/online";
import { factsFor, requestLine } from "./lib/arcade/commentary";
import { voices, type Speaker, type VoiceId } from "./lib/arcade/rivals";
import { VOICE_PREFS, VoiceBox, readVoicePrefs, type VoicePrefs, type VoiceStatus } from "./lib/speech/voice";

type Screen = "splash" | "howto" | "credits" | "title" | "intro" | "map" | "brief" | "play" | "result" | "ending" | "lab";
type Prefs = OnlinePreferences;
type AiState = "idle" | "loading" | "ready" | "error" | "uncertain" | "cancelled";
/** Every encounter is played against a model-planned rival; this is the gate. */
type Rival = { status: "checking" | "online" | "offline"; message: string; model: string | null; commentary: string | null };
type Run = { plan: OpponentPlan; practice: boolean; key: number; modelPrepared: boolean; taunt?: string; opening?: Promise<string>; originalCave?: boolean; demo?: boolean; lab?: boolean; seed?: number };
function loadPrefs(): Prefs {
  const defaults: Prefs = { ...defaultPreferences(), still: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false };
  try { const v = JSON.parse(localStorage.getItem(ARCADE_PREFS) || "null"); if (v) { const parsed = preferencesSchema.safeParse({ ...defaults, ...v, revision: 2, difficulty: v.revision === 2 ? v.difficulty : "normal" }); if (parsed.success) return parsed.data; } } catch { /* Storage is optional. */ }
  return defaults;
}
function Portrait(props: { tile: number; label: string; large?: boolean }) { return <CharacterPortrait {...props}/>; }
const prologue = [
  { chapter: "Prologue · after the fall of Troy", lines: ["The war is over.", "The journey is not."], text: "You are Odysseus, king of Ithaca. Ten years at Troy have taken you far from Penelope and Telemachus. Now, with your crew beside you, you turn your ship toward home.", next: "The journey ahead", detail: "Continue the prologue" },
  { chapter: "The voyage begins", lines: ["Eight trials stand", "between you and home."], text: "Rescue your crew from the lotus, outrun a giant, sail the winds, break Circe's spell, resist the Sirens, survive the strait, cross a storm, and reclaim the bow of Ithaca.", next: "Land of the Lotus-Eaters", detail: "Read the first briefing" },
];
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const voiceLabels: Record<VoiceStatus, string> = { checking: "Checking…", loading: "Natural voices, getting ready", neural: "Natural voices", browser: "Browser voices", unavailable: "Browser voices" };
const voiceNotes: Record<VoiceStatus, string> = {
  checking: "Checking which voices are available.",
  loading: "Preparing the natural voices. The first time, this downloads about 180 MB; until it finishes, your browser reads the lines.",
  neural: "Each character speaks with their own natural voice.",
  browser: "Natural voices are turned off on this server, so your browser reads the lines.",
  unavailable: "The natural voices could not be prepared, so your browser reads the lines. The first run needs an internet connection.",
};

/** Counts a result number up from zero once, unless motion is reduced. */
function CountUp({ value, still, format = (n: number) => n.toLocaleString() }: { value: number; still: boolean; format?: (n: number) => string }) {
  const [shown, setShown] = useState(still ? value : 0);
  useEffect(() => {
    if (still) { setShown(value); return; }
    let frame = 0; const start = performance.now(), length = 1100;
    const step = (now: number) => { const t = Math.min(1, (now - start) / length); setShown(Math.round(value * (1 - Math.pow(1 - t, 3)))); if (t < 1) frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, still]);
  return <>{format(shown)}</>;
}

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
  const [aiState, setAiState] = useState<AiState>("idle"), [aiError, setAiError] = useState(""), [aiPlan, setAiPlan] = useState<OpponentPlan | null>(null), [aiTaunt, setAiTaunt] = useState("");
  // The strategy the player asked to replace, so "Ask for another strategy" can be undone.
  const [previousPlan, setPreviousPlan] = useState<{ plan: OpponentPlan; taunt: string } | null>(null);
  const [rival, setRival] = useState<Rival>({ status: "checking", message: "Looking for your AI rival...", model: null, commentary: null }), [elapsed, setElapsed] = useState(0);
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(readVoicePrefs), [speaking, setSpeaking] = useState(false), [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("checking");
  const [recap, setRecap] = useState<{ speaker: Speaker; text: string } | "pending" | null>(null);
  const [run, setRun] = useState<Run | null>(null), [result, setResult] = useState<GameState | null>(null);
  // AI Lab state. Lab runs never touch the campaign save: they launch as
  // practice attempts, and their results are kept only in this table.
  const [lab, setLab] = useState<LabSettings>({ trial: "cyclops", difficulty: "hard", seeded: true, seed: 20250, showPrediction: true, showHistory: true });
  const [labRuns, setLabRuns] = useState<LabRun[]>([]);
  const labRunId = useRef(0);
  const request = useRef<AbortController | null>(null), generation = useRef(0), runKey = useRef(0), audio = useRef<VoyageAudio | null>(null), heading = useRef<HTMLElement>(null);
  const voice = useRef<VoiceBox | null>(null), voicePrefsRef = useRef(voicePrefs), recapToken = useRef(0), opening = useRef<Promise<string> | null>(null);
  voicePrefsRef.current = voicePrefs;
  const trial = trialFor(selected), completed = clearedCount(save);
  const nextTrial = trials.find(t => save.records[t.id].cleared === "pending");
  const medals = trials.reduce((n, t) => n + Object.keys(save.records[t.id].bests).length, 0);
  const rivalOnline = rival.status === "online";
  const canStart = rivalOnline && aiState === "ready" && !!aiPlan;
  /** Title and note for the disabled start button, matching the rival panel's state. */
  const startHold: [string, string] = !rivalOnline ? ["Connect an AI rival to play", "No model is connected"]
    : aiState === "error" ? ["The rival is not ready", "Prepare the rival again to start"]
    : aiState === "uncertain" ? ["No valid strategy yet", "Ask for another strategy to start"]
    : aiState === "cancelled" ? ["No strategy prepared", "Prepare the rival to start"]
    : ["Waiting for your rival", "The model is choosing a strategy"];
  const lockedReason = rivalOnline ? "" : rival.status === "checking" ? "Looking for your AI rival..." : "Connect an AI model to play. Every rival is planned and voiced by your model.";

  useEffect(() => { const service = new VoyageAudio(); audio.current = service; return () => { service.dispose(); audio.current = null; request.current?.abort(); }; }, []);
  useEffect(() => {
    const box = new VoiceBox(); voice.current = box; box.onSpeaking(setSpeaking); box.onStatus(setVoiceStatus);
    return () => { box.dispose(); voice.current = null; };
  }, []);
  useEffect(() => { voice.current?.setVolume(voicePrefs.volume); if (!voicePrefs.voice) voice.current?.stop(); try { localStorage.setItem(VOICE_PREFS, JSON.stringify(voicePrefs)); } catch { /* Storage is optional. */ } }, [voicePrefs]);
  useEffect(() => { try { localStorage.setItem(saveKey, JSON.stringify(save)); localStorage.setItem(preferencesKey, JSON.stringify(prefs)); setStorageError(""); } catch { setStorageError("Browser saving is unavailable. Keep this tab open to preserve your voyage."); } }, [save, prefs, saveKey, preferencesKey]);
  useEffect(() => { if (previousPreferences.current !== prefs) { previousPreferences.current = prefs; online?.command({ type: "preferences", preferences: prefs }); } }, [prefs, online]);
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0, behavior: "instant" }); }, [screen]);
  useEffect(() => { audio.current?.update({ enabled: prefs.sound, music: prefs.music, effects: prefs.effects, ducked: speaking, quiet: settings, mood: screen === "ending" ? "home" : screen === "play" ? selected === "bow" ? "home" : "danger" : "voyage" }); }, [prefs.sound, prefs.music, prefs.effects, screen, selected, settings, speaking]);
  useEffect(() => {
    if (aiState !== "loading") return;
    const start = Date.now(), interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [aiState]);
  useEffect(() => { void checkModel(); }, []);
  // Starting a model service is noticed without a reload.
  useEffect(() => {
    if (rival.status !== "offline" || screen === "play") return;
    const poll = window.setInterval(() => void checkModel(true), 15000);
    return () => clearInterval(poll);
  }, [rival.status, screen]);
  // A briefing always opens with the rival already studying you.
  useEffect(() => { if (screen === "brief" && rivalOnline && aiState === "idle") void prepare(); }, [screen, rivalOnline, aiState, selected, prefs.difficulty]);
  // A kept strategy belongs to one trial and difficulty, inside one briefing.
  useEffect(() => setPreviousPlan(null), [screen, selected, prefs.difficulty]);
  // Outside an encounter the voyage is at sea; while a briefing is read, the encounter's sounds are rendered.
  useEffect(() => {
    if (screen !== "play") { audio.current?.setScene("sea"); audio.current?.setLoops({}); }
    if (screen === "brief") audio.current?.prepare(encounterSounds[selected]);
  }, [screen, selected]);
  // The bard reads the prologue aloud.
  useEffect(() => { if (screen === "intro") speak(prologue[intro].lines.join(" ") + " " + prologue[intro].text, "bard"); return () => voice.current?.stop(); }, [screen, intro]);
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
  const speak = useCallback((text: string, id: VoiceId) => { if (voicePrefsRef.current.voice) voice.current?.say(text, id); }, []);
  const silence = useCallback(() => voice.current?.stop(), []);
  /** Stops any request in flight. "idle" lets the briefing prepare again automatically; "cancelled" waits for the player. */
  function cancelAi(next: AiState = "idle") { generation.current++; request.current?.abort(); request.current = null; setAiState(next); setAiPlan(null); setAiTaunt(""); setAiError(""); }
  /** Asks the model for a different strategy, keeping the current one so the player can go back to it. */
  function regenerate() { if (aiState === "ready" && aiPlan) setPreviousPlan({ plan: aiPlan, taunt: aiTaunt }); void prepare(); }
  /** Undo: restores the kept strategy. A ready strategy it replaces becomes the one kept. */
  function restorePrevious() {
    if (!previousPlan) return;
    const replaced = aiState === "ready" && aiPlan ? { plan: aiPlan, taunt: aiTaunt } : null;
    cancelAi(); setAiPlan(previousPlan.plan); setAiTaunt(previousPlan.taunt); setAiState("ready"); setPreviousPlan(replaced);
  }
  async function checkModel(quiet = false) {
    if (!quiet) setRival(old => ({ ...old, status: "checking", message: "Looking for your AI rival..." }));
    try {
      const r = await fetch("/api/arcade", { signal: AbortSignal.timeout(6000) }); const v = await r.json();
      setRival({ status: v.aiAvailable ? "online" : "offline", message: typeof v.message === "string" ? v.message : "The AI rival could not be checked.", model: typeof v.model === "string" ? v.model : null, commentary: typeof v.commentary === "string" ? v.commentary : null });
    } catch { setRival({ status: "offline", message: "The game server could not reach an AI model. Start your model service, then check again.", model: null, commentary: null }); }
  }
  async function prepare() {
    cancelAi(); const controller = new AbortController(), token = generation.current; request.current = controller;
    setAiState("loading"); setElapsed(0);
    try {
      const response = await fetch("/api/arcade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trialId: selected, difficulty: prefs.difficulty, recent: save.records[selected].recent }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(95000)]) });
      const body = await response.json();
      if (token !== generation.current || controller.signal.aborted) return;
      if (!response.ok) { setAiError(typeof body.error === "string" ? body.error : "The rival could not be prepared."); setAiState(body.code === "invalid_plan" ? "uncertain" : "error"); return; }
      if (!validPlan(selected, body.plan) || body.plan.source !== "ai") { setAiError("The returned strategy is unsupported. Prepare another."); setAiState("uncertain"); return; }
      setAiPlan(body.plan); setAiTaunt(typeof body.taunt === "string" ? body.taunt : ""); setAiState("ready"); audio.current?.cue("reply");
      prefetchOpening(selected, prefs.difficulty);
    } catch {
      if (token !== generation.current || controller.signal.aborted) return;
      setAiError("The AI request failed or timed out. The model may still be loading; retry in a moment. Your voyage is kept."); setAiState("error");
    } finally { if (token === generation.current) request.current = null; }
  }
  /**
   * The bard's opening line is written while the player reads the briefing. On
   * a local model this also warms the commentary prompt cache, so live lines
   * during play come back in seconds rather than after a cold read.
   */
  function prefetchOpening(id: TrialId, difficulty: Difficulty) {
    opening.current = null;
    if (!voicePrefsRef.current.commentary) return;
    const t = trialFor(id);
    opening.current = requestLine({ trialId: id, difficulty, moment: "start", speaker: "bard", facts: { score: 0, hits: 0, misses: 0, streak: 0, livesLeft: null, secondsLeft: null, progress: 0, status: t.objective.slice(0, 160) }, recent: [] }).catch(() => "");
  }
  function wakeAudio() { if (prefs.sound) void audio.current?.unlock().catch(() => setAudioError("Audio could not start. Every cue is also visible.")); }
  function navigate(next: Screen) { wakeAudio(); cancelAi(); if (screen === "play") audio.current?.setLoops({}); setAssistance(false); setRestart(false); setScreen(next); }
  function openTrial(id: TrialId) { if (!unlocked(save, id)) return; cancelAi(); setSelected(id); setAssistance(false); setResult(null); setScreen("brief"); }
  /** Starts an attempt against the model-planned rival. Without a connected model, nothing starts. */
  function launch(practice = false, originalCave = false, reuse?: Pick<Run, "plan" | "taunt">) {
    const plan = reuse?.plan ?? (aiState === "ready" ? aiPlan : null);
    if (!plan || !rivalOnline) return;
    const taunt = reuse ? reuse.taunt : aiTaunt;
    wakeAudio(); cancelAi(); setRecap(null);
    const openingLine = opening.current ?? undefined; opening.current = null;
    setRun({ plan, practice, modelPrepared: true, originalCave, taunt, opening: openingLine, key: ++runKey.current }); setScreen("play"); audio.current?.cue("sail");
  }
  function requestRecap(round: GameState) {
    const token = ++recapToken.current;
    if (!rivalOnline || !voicePrefsRef.current.commentary) { setRecap(null); return; }
    const speaker: Speaker = round.won ? "bard" : "rival";
    setRecap("pending");
    void requestLine({ trialId: round.id as TrialId, difficulty: round.difficulty, moment: round.won ? "win" : "loss", speaker, facts: factsFor(round, ""), recent: [] })
      .then(text => { if (token !== recapToken.current) return; if (!text) { setRecap(null); return; } setRecap({ speaker, text }); speak(text, speaker === "bard" ? "bard" : round.id as TrialId); })
      .catch(() => { if (token === recapToken.current) setRecap(null); });
  }
  function finish(round: GameState) {
    if (!round.done || round.id !== selected) return;
    // The round's own final frame already sounded the victory or defeat.
    audio.current?.setLoops({});
    requestRecap(round);
    if (run?.lab) {
      // A lab run records a comparison row and returns to the lab, leaving the
      // campaign save, medals and unlocks untouched.
      const runtime = aiRuntimeOf(round);
      if (runtime) setLabRuns(old => [...old, labRunFrom(round, runtime, run.seed ?? 0, ++labRunId.current)].slice(-24));
      setResult(round);
      setScreen("lab");
      return;
    }
    if (!round.practice) {
      const summary = gameSummary(round);
      setSave(old => finishAttempt(old, selected, summary));
      online?.command({ type: "complete", trialId: selected, summary });
    }
    setResult(round); setScreen("result");
  }
  async function toggleSound() {
    const enabled = !prefs.sound;
    if (enabled) { try { await audio.current?.unlock(); setAudioError(""); } catch { setAudioError("Audio could not start. Every game cue is also visible."); return; } }
    setPrefs(old => ({ ...old, sound: enabled }));
  }
  function setDifficulty(value: Difficulty) { cancelAi(); setPrefs(old => ({ ...old, difficulty: value })); }
  function newVoyage() { online?.command({ type: save.started ? "restart" : "start" }); cancelAi(); setSave({ ...newArcade(), started: true }); setSelected("lotus"); setIntro(0); setRestart(false); setScreen("intro"); }
  function continueVoyage() { if (nextTrial) openTrial(nextTrial.id); else navigate("ending"); }
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
    if (!rivalOnline) return;
    wakeAudio();
    cancelAi();
    // A seeded comparison holds one layout across the three difficulties, so a
    // presenter can show that only the opponent changed.
    const seed = lab.seeded ? lab.seed : 4200 + ++runKey.current * 19;
    setSelected(lab.trial);
    setPrefs(old => ({ ...old, difficulty }));
    setResult(null);
    setRun({ plan: adaptivePlan(lab.trial), practice: false, modelPrepared: false, lab: true, seed, key: ++runKey.current });
    setScreen("play");
    audio.current?.cue("sail");
  }
  function launchDemo() { if (!rivalOnline) return; wakeAudio(); cancelAi(); setSelected("lotus"); setRun({ plan: adaptivePlan("lotus"), practice: true, modelPrepared: false, demo: true, key: ++runKey.current }); setScreen("play"); }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (settings || restart || assistance || (e.target as HTMLElement).closest("input,select,textarea,summary")) return;
      if (screen === "splash" && e.key === "Enter") { e.preventDefault(); navigate("title"); }
      else if (screen === "brief" && e.key === "Enter" && canStart && !(e.target as HTMLElement).closest("button,a")) { e.preventDefault(); launch(); }
      else if (screen === "title" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        const items = [...document.querySelectorAll<HTMLButtonElement>(".od-menu button:not(:disabled)")];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = index < 0 ? e.key === "ArrowUp" || e.key === "End" ? items.length - 1 : 0 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        e.preventDefault(); items[next]?.focus();
      } else if (e.key === "Escape" && screen !== "play" && screen !== "title") navigate("title");
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [screen, settings, restart, assistance, canStart, aiPlan, aiTaunt, rivalOnline]);
  const blocked = settings || restart || assistance;
  const best = save.records[selected].bests[prefs.difficulty];
  const attempts = save.records[selected].recent.length;
  const rivalChip = <div className="fs-rival-chip" data-status={rival.status} role="status">
    <BrainCircuit size={15}/>
    <span><b>{rivalOnline ? "AI rival online" : rival.status === "checking" ? "Finding AI rival" : "AI rival offline"}</b><small>{rivalOnline ? rival.model : rival.status === "checking" ? "Checking the model service" : "Connect a model to play"}</small></span>
    {rival.status === "offline" && <button onClick={() => setSettings(true)}>Connect</button>}
  </div>;
  const voiceToggle = <button className="od-sound fs-voice-toggle" aria-pressed={voicePrefs.voice} onClick={() => setVoicePrefs(v => ({ ...v, voice: !v.voice }))} aria-label={voicePrefs.voice ? "Mute the commentary voice" : "Enable the commentary voice"}>{voicePrefs.voice ? <Mic size={17}/> : <MicOff size={17}/>} VOICE {voicePrefs.voice ? "ON" : "OFF"}</button>;
  const recapLine = recap === "pending" ? <p className="fs-recap fs-recap-pending"><Loader2 size={15}/> The bard is composing a verse about this attempt...</p> : recap ? <blockquote className="fs-recap" data-speaker={recap.speaker}><span>{recap.speaker === "bard" ? voices.bard.name : voices[selected].name}</span><p>{recap.text}</p></blockquote> : null;

  const rivalPanel = !rivalOnline ? <div className="fs-rival-panel" data-state="offline" aria-live="polite">
    <div className="fs-rival-panel-head"><BrainCircuit size={18}/><div><strong>{rival.status === "checking" ? "Looking for your AI rival" : "No AI rival connected"}</strong><small>{rival.message}</small></div></div>
    {rival.status === "offline" && <ol className="fs-connect-steps">
      <li><b>This computer</b> Install Ollama, run <code>ollama pull qwen3:4b-instruct</code>, and set <code>FARSHORE_MODEL_NAME=qwen3:4b-instruct</code> in <code>.env</code>.</li>
      <li><b>No strong laptop?</b> Open <code>colab/farshore_model_server.ipynb</code> in Google Colab, run every cell, and paste the printed lines into <code>.env</code>.</li>
      <li><b>Online accounts</b> Add an OpenAI, Groq or OpenRouter connection under Account.</li>
    </ol>}
    <button className="a-btn a-small fs-rich" disabled={rival.status === "checking"} onClick={() => void checkModel()}><RefreshCw size={15}/><span><b>Check again</b><small>Also checked every 15 seconds</small></span></button>
  </div> : aiState === "loading" || aiState === "idle" ? <div className="fs-rival-panel" data-state="loading" aria-live="polite">
    <div className="fs-rival-panel-head"><Loader2 size={18} className="fs-spin"/><div><strong>{trial.character} is studying you</strong><small>{attempts ? `Reading your last ${attempts === 1 ? "attempt" : `${attempts} attempts`} with ${rival.model}` : `First meeting. ${rival.model} is choosing an opening strategy`} · {elapsed}s</small></div></div>
    <span className="fs-rival-progress" aria-hidden="true"><i/></span>
    <div className="fs-rival-actions">
      <button className="a-text-btn" onClick={() => cancelAi("cancelled")}>Cancel preparation</button>
      {previousPlan && <button className="a-text-btn" onClick={restorePrevious}><Undo2 size={13}/> Keep the previous strategy: {planLabel(selected, previousPlan.plan)}</button>}
    </div>
  </div> : aiState === "ready" && aiPlan ? <div className="fs-rival-panel" data-state="ready" aria-live="polite">
    <div className="fs-rival-panel-head"><Portrait tile={trial.portrait} label={trial.character}/><div><strong>{planLabel(selected, aiPlan)}</strong><small>Strategy chosen by {rival.model}</small></div></div>
    <p>{planDescription(selected, aiPlan)}</p>
    {aiTaunt && <blockquote className="fs-rival-taunt"><p>{aiTaunt}</p><button className="a-text-btn" onClick={() => speak(aiTaunt, selected)} aria-label={`Hear ${trial.character}`}><Volume2 size={14}/> Hear it</button></blockquote>}
    <div className="fs-rival-actions">
      <button className="a-text-btn" onClick={regenerate}><RefreshCw size={13}/> Ask for another strategy</button>
      {previousPlan && <button className="a-text-btn" onClick={restorePrevious}><Undo2 size={13}/> Undo: back to {planLabel(selected, previousPlan.plan)}</button>}
    </div>
  </div> : aiState === "uncertain" ? <div className="fs-rival-panel" data-state="uncertain" aria-live="polite">
    <div className="fs-rival-panel-head"><BrainCircuit size={18}/><div><strong>The rival&apos;s plan was set aside</strong><small role="status">{aiError}</small></div></div>
    <p>The game checks every strategy before play. This one did not pass, so it was not used and nothing about your voyage changed.</p>
    <button className="a-btn a-small fs-rich" onClick={() => void prepare()}><RefreshCw size={15}/><span><b>Ask for another strategy</b><small>The model tries again</small></span></button>
    {previousPlan && <button className="a-btn a-small fs-rich" onClick={restorePrevious}><Undo2 size={15}/><span><b>Keep the previous strategy</b><small>{planLabel(selected, previousPlan.plan)}</small></span></button>}
  </div> : aiState === "cancelled" ? <div className="fs-rival-panel" data-state="cancelled" aria-live="polite">
    <div className="fs-rival-panel-head"><BrainCircuit size={18}/><div><strong>No strategy prepared</strong><small role="status">Preparation was cancelled. Nothing about your voyage changed.</small></div></div>
    <button className="a-btn a-small fs-rich" onClick={() => void prepare()}><RefreshCw size={15}/><span><b>Prepare the rival</b><small>The model chooses a strategy</small></span></button>
    {previousPlan && <button className="a-btn a-small fs-rich" onClick={restorePrevious}><Undo2 size={15}/><span><b>Keep the previous strategy</b><small>{planLabel(selected, previousPlan.plan)}</small></span></button>}
  </div> : <div className="fs-rival-panel" data-state="error" aria-live="polite">
    <div className="fs-rival-panel-head"><BrainCircuit size={18}/><div><strong>The rival is not ready</strong><small role="alert">{aiError}</small></div></div>
    <button className="a-btn a-small fs-rich" onClick={() => void prepare()}><RefreshCw size={15}/><span><b>Prepare the rival again</b><small>Nothing about your voyage changes</small></span></button>
    {previousPlan && <button className="a-btn a-small fs-rich" onClick={restorePrevious}><Undo2 size={15}/><span><b>Keep the previous strategy</b><small>{planLabel(selected, previousPlan.plan)}</small></span></button>}
  </div>;

  return <div className={"a-app od-app fs-app" + (sceneStill ? " a-still" : "") + (prefs.contrast ? " od-contrast" : "")} data-screen={screen}>
    {!sceneStill && <div className="fs-curtain" key={`curtain-${screen}-${screen === "intro" ? intro : 0}`} aria-hidden="true"><i/></div>}
    {screen === "splash" ? <main className="od-splash fs-cinematic" inert={blocked}>
      <div className="od-backdrop fs-kenburns"/><div className="fs-fog" aria-hidden="true"/><div className="od-cinematic-shade"/><div className="od-particles" aria-hidden="true"/>
      <span className="fs-letterbox fs-letterbox-top" aria-hidden="true"/><span className="fs-letterbox fs-letterbox-bottom" aria-hidden="true"/>
      <span className="od-presents fs-reveal" style={{ "--d": "0.5s" } as CSSProperties}>AN EPIC ARCADE ADVENTURE</span>
      <section className="od-splash-content" ref={heading} tabIndex={-1}><div className="od-title-ornament fs-ornament-draw"><span/><Compass size={34} strokeWidth={1}/><span/></div><h1 className="od-wordmark fs-wordmark-reveal"><FarshoreLogo/><span className="fs-sweep" aria-hidden="true"/></h1><p className="fs-reveal" style={{ "--d": "2.2s" } as CSSProperties}>Eight Trials. One Journey Home.</p><button className="od-enter fs-reveal" style={{ "--d": "2.9s" } as CSSProperties} onClick={() => navigate("title")}>PRESS ENTER TO START <ArrowRight size={17}/></button><span className="od-start-hint fs-reveal" style={{ "--d": "3.3s" } as CSSProperties}>or click to set sail · your AI rival {rivalOnline ? `(${rival.model}) is ready` : rival.status === "checking" ? "is being found" : "is offline"}</span></section>
      <div className="od-cinematic-footer fs-reveal" style={{ "--d": "3.1s" } as CSSProperties}><span>AN ADVENTURE INSPIRED BY HOMER</span><span>KEYBOARD | MOUSE | TOUCH</span></div>
    </main> : screen === "title" ? <main className="od-menu-screen fs-cinematic" inert={blocked}>
      <div className="od-backdrop fs-kenburns fs-kenburns-slow"/><div className="od-menu-shade"/><div className="od-particles" aria-hidden="true"/>
      <div className="od-menu-top"><span><Compass size={17}/> FARSHORE / ARCADE ADVENTURES</span><div className="fs-menu-status">{rivalChip}{voiceToggle}<button className="od-sound" onClick={() => void toggleSound()} aria-label={prefs.sound ? "Mute sound" : "Enable sound"}>{prefs.sound ? <Volume2 size={18}/> : <VolumeX size={18}/>} SOUND {prefs.sound ? "ON" : "OFF"}</button></div></div>
      <div className="fs-menu-temple"><span className="fs-column fs-column-left" aria-hidden="true"/><span className="fs-column fs-column-right" aria-hidden="true"/><Torch/><Torch side="right"/><section className="od-menu-content" ref={heading} tabIndex={-1}><span className="a-eyebrow">THE LONG WAY HOME</span><h1 className="od-wordmark"><FarshoreLogo/></h1><p className="od-menu-tagline">Eight Trials. One Journey Home.</p>
        <nav className="od-menu fs-menu-rich" aria-label="Main menu">
          {save.started && <button className="od-menu-primary" style={{ "--i": 0 } as CSSProperties} onClick={continueVoyage}><Play size={17}/><span><b>CONTINUE JOURNEY</b><small>{nextTrial ? `Next: ${nextTrial.title} · ${completed} of 8 cleared` : "All eight trials cleared · return to Ithaca"}</small></span><ArrowRight size={17}/></button>}
          <button className={!save.started ? "od-menu-primary" : ""} style={{ "--i": 1 } as CSSProperties} onClick={() => save.started ? setRestart(true) : newVoyage()}><Sparkles size={17}/><span><b>NEW GAME</b><small>{save.started ? "Start over from the shores of Troy" : "Begin at the shores of Troy"}</small></span><ArrowRight size={17}/></button>
          {!save.started && <button disabled style={{ "--i": 2 } as CSSProperties}><Play size={17}/><span><b>CONTINUE JOURNEY</b><small>No voyage saved yet</small></span></button>}
          <button style={{ "--i": 3 } as CSSProperties} onClick={() => navigate("map")}><Map size={17}/><span><b>SELECT TRIAL</b><small>8 islands · {medals} {medals === 1 ? "medal" : "medals"} earned</small></span><ArrowRight size={17}/></button>
          <button style={{ "--i": 4 } as CSSProperties} onClick={() => navigate("howto")}><BookOpen size={17}/><span><b>HOW TO PLAY</b><small>Controls and medals for every island</small></span><ArrowRight size={16}/></button>
          <button style={{ "--i": 5 } as CSSProperties} onClick={() => navigate("lab")}><FlaskConical size={17}/><span><b>AI LAB</b><small>Watch your rival think, step by step</small></span><ArrowRight size={16}/></button>
          <button style={{ "--i": 6 } as CSSProperties} onClick={() => setSettings(true)}><Settings size={17}/><span><b>SETTINGS</b><small>Sound, voice, AI rival, motion</small></span><ArrowRight size={16}/></button>
          <button style={{ "--i": 7 } as CSSProperties} onClick={() => navigate("credits")}><Info size={17}/><span><b>CREDITS</b><small>The people and the poem</small></span><ArrowRight size={16}/></button>
        </nav><p className="od-menu-save">{save.started ? `${String(completed).padStart(2, "0")} / 08 encounters completed · Your voyage is saved` : "No account needed. Your voyage saves as you play."}</p>
      </section></div><aside className="od-title-story"><span className="od-story-rule"/><span className="a-eyebrow">A KING. A SHIP. A PROMISE.</span><p>The gods have other plans.<br/>Ithaca is still waiting.</p><span>Outwit the myths. Find your way home.</span></aside>
      <div className="od-cinematic-footer"><span>TROY <span className="od-route-dots">..................</span> ITHACA</span><span>AN ORIGINAL MYTHOLOGICAL ARCADE ADVENTURE</span></div>
    </main> : screen === "intro" ? <main className="fs-prologue fs-cinematic" data-slide={intro} inert={blocked}>
      <div className="fs-prologue-art fs-kenburns" key={`art-${intro}`}/><div className="fs-prologue-shade"/><div className="od-particles" aria-hidden="true"/>
      <span className="fs-letterbox fs-letterbox-top" aria-hidden="true"/><span className="fs-letterbox fs-letterbox-bottom" aria-hidden="true"/>
      <section className="fs-prologue-content" key={intro} ref={heading} tabIndex={-1} aria-labelledby="fs-prologue-title">
        <span className="fs-prologue-chapter fs-reveal" style={{ "--d": "0.4s" } as CSSProperties}>{prologue[intro].chapter}</span>
        <h1 id="fs-prologue-title">{prologue[intro].lines.map((line, i) => <span key={line} className="fs-rise" style={{ "--d": `${0.8 + i * 0.55}s` } as CSSProperties}>{line}</span>)}</h1>
        <p className="fs-reveal" style={{ "--d": "2s" } as CSSProperties}>{prologue[intro].text}</p>
        {intro === 0 ? <div className="fs-prologue-cast fs-reveal" style={{ "--d": "2.5s" } as CSSProperties}><Portrait tile={0} label="Odysseus" large/><div><strong>Odysseus</strong><small>King of Ithaca · ten years from home</small></div><Portrait tile={3} label="Penelope"/><div><strong>Penelope</strong><small>Waiting in Ithaca</small></div></div>
          : <ol className="fs-prologue-route" aria-label="The eight trials">{trials.map((t, i) => <li key={t.id} className="fs-rise" style={{ "--d": `${2.1 + i * 0.12}s` } as CSSProperties}><TrialArtwork id={t.id}/><span>{t.title}</span></li>)}</ol>}
        <div className="fs-prologue-actions fs-reveal" style={{ "--d": "2.9s" } as CSSProperties}>
          <button className="a-btn a-primary fs-rich" onClick={() => intro === 0 ? setIntro(1) : openTrial("lotus")}><span><b>{prologue[intro].next}</b><small>{prologue[intro].detail}</small></span><ArrowRight size={17}/></button>
          <button className="a-btn a-ghost fs-rich" onClick={() => navigate("map")}><Map size={16}/><span><b>Open voyage map</b><small>Skip the prologue</small></span></button>
        </div>
        <div className="fs-prologue-pips" role="img" aria-label={`Part ${intro + 1} of ${prologue.length}`}>{prologue.map((_, i) => <i key={i} data-on={i <= intro || undefined}/>)}</div>
      </section>
      <div className="od-cinematic-footer"><span>{voicePrefs.voice ? "THE BARD IS READING · VOICE CAN BE MUTED IN SETTINGS" : "AN ORIGINAL ARCADE RETELLING"}</span><span>ESC RETURNS TO THE MENU</span></div>
    </main> : <>
      <header className="a-header" inert={blocked}><button className="a-brand" onClick={() => navigate("title")} disabled={screen === "play"}><Compass size={27} strokeWidth={1.2}/><span><FarshoreLogo compact/><small>Eight Trials. One Journey Home.</small></span></button><nav aria-label="Game navigation">{rivalChip}<button className="a-btn a-small a-ghost" disabled={screen === "play"} onClick={() => navigate("map")}><Map size={16}/> Voyage map</button><button className="a-btn a-small a-ghost" disabled={screen === "play"} onClick={() => setSettings(true)}><Settings size={16}/> Settings</button></nav></header>
      <main className="a-main" inert={blocked} ref={heading} tabIndex={-1}>
        {screen === "map" && <TrialSelection save={save} selected={selected} difficulty={prefs.difficulty} still={sceneStill} onSelect={setSelected} onOpen={openTrial} onDifficulty={setDifficulty} onBegin={newVoyage}/>}
        {screen === "brief" && <section className="a-brief"><div className="a-brief-scene"><TrialArtwork id={selected} className="fs-brief-art"/><div className="a-brief-shade"/><div className="a-character-intro"><div className="od-brief-icon"><TrialGlyph id={selected} size={42}/></div><div><span className="a-eyebrow">ENCOUNTER 0{trials.findIndex(t => t.id === selected) + 1} / 08 · {trial.kind.toUpperCase()}</span><h1>{trial.title}</h1><p>{trial.story}</p></div></div></div><div className="a-brief-body"><div className="a-brief-instructions"><span className="a-eyebrow">YOUR OBJECTIVE</span><h2>{challengeObjective(selected, prefs.difficulty)}</h2><div className="od-control-guide"><BookOpen size={21}/><div><strong>Know your controls</strong><p>{trial.controls}</p></div></div><div className="od-enemy"><Portrait tile={trial.portrait} label={trial.character}/><div><span>YOUR AI RIVAL</span><strong>{trial.character}</strong><p>&ldquo;{trial.quote}&rdquo;</p></div></div><details className="a-source"><summary>In Homer / in this game</summary><p><strong>Book {trial.book}:</strong> {trial.homer}</p><p>{trial.adaptation}</p><a href={`https://www.gutenberg.org/files/1727/1727-h/1727-h.htm#chap${trial.book === "IX" ? "09" : trial.book === "X" ? "10" : trial.book === "XII" ? "12" : trial.book === "V" ? "05" : "21"}`} target="_blank" rel="noreferrer">Read the episode</a></details><details className="a-source"><summary>How does the AI rival work?</summary><p>Before the round, your connected model reads your recent attempts and picks {trial.character}&apos;s strategy and opening line. During play, that strategy runs locally every frame, and the model voices live commentary. The game always owns collisions, scoring and progress.</p></details>{selected === "cyclops" && <details className="a-source"><summary>Original cave tactics</summary><p>The original grid escape remains playable as a separate practice against the same rival plan. It does not affect voyage progress.</p><button className="a-btn a-small" disabled={!canStart} onClick={() => launch(true, true)}>Play cave tactics</button></details>}</div><div className="a-brief-options"><span className="a-eyebrow">PREPARE FOR THE TRIAL</span><label className="a-field">Difficulty<select value={prefs.difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}><option value="easy">Easy - find your sea legs</option><option value="normal">Medium - the full adventure</option><option value="hard">Hard - challenge the gods</option></select></label><p className="a-difficulty-note">{prefs.difficulty === "hard" ? "Faster hazards and demanding opponents. Every attack still gives you time to react." : prefs.difficulty === "normal" ? "A balanced challenge. Practice once to learn the island's rhythm." : "Slower hazards, wider openings, and more room to learn."}</p>{rivalPanel}{best && <span className="od-personal-best"><Trophy size={16}/> {best.medal} · Best {best.score} · {Math.round(best.timeMs / 1000)}s</span>}<button className="a-btn a-primary fs-rich fs-start" disabled={!canStart} onClick={() => launch()}><Swords size={19}/><span><b>{canStart ? `Face ${trial.character}` : startHold[0]}</b><small>{canStart && aiPlan ? `${difficultyNames[prefs.difficulty]} · ${planLabel(selected, aiPlan)} · counts toward your voyage` : lockedReason || startHold[1]}</small></span>{canStart && <kbd>Enter</kbd>}</button><button className="a-btn fs-rich" disabled={!canStart} onClick={() => launch(true)}><GraduationCap size={18}/><span><b>Short practice</b><small>Same rival and strategy · nothing is saved</small></span></button><span className="od-practice-note">The encounter opens in a full-screen stage. Escape pauses, F3 cycles the AI inspector, and F toggles fullscreen.</span></div></div></section>}
        {screen === "play" && run && <p className="a-caption od-stage-note">The encounter is running in the full-screen stage. Press Escape to pause.</p>}
        {screen === "result" && result && <section className={`a-result a-paper od-result fs-rich-result ${result.won ? "won" : "lost"}`}><ResultFrieze state={result}/><span className="a-eyebrow">ENCOUNTER 0{trials.findIndex(t => t.id === selected) + 1} · {trial.title.toUpperCase()}</span><div className={`od-medal fs-medal-reveal ${result.practice ? "practice" : result.won ? medalFor(gameSummary(result)) : "failed"}`}><span className="fs-medal-rays" aria-hidden="true"/><Trophy size={49} strokeWidth={1}/><span>{result.practice ? "PRACTICE" : result.won ? `${medalFor(gameSummary(result)).toUpperCase()} MEDAL` : "TRY AGAIN"}</span></div><h1>{result.practice ? run?.demo ? "A lesson in cunning." : "Practice complete." : result.won ? "VICTORY" : "TRIAL FAILED"}</h1><p>{result.practice ? "No progress was changed. Take what you've learned into the encounter." : result.won ? trial.success : result.feedback}</p>{recapLine}<div className="a-result-stats"><span><strong><CountUp value={result.score} still={sceneStill}/></strong>{selected === "bow" ? "rings" : selected === "circe" ? "brew points" : "final score"}</span><span><strong><CountUp value={result.elapsed} still={sceneStill} format={clock}/></strong>completion time</span><span><strong>{difficultyNames[result.difficulty]}</strong>difficulty</span></div><PerformanceSeals state={result}/><p className="a-caption">{selected === "bow" || selected === "circe" ? `Odysseus ${result.score} · ${trial.character} ${result.rivalScore}` : `${gameSummary(result).hits} hits · Best streak ${result.bestCombo} · ${result.misses} misses`}{!result.practice && ` · Personal best ${save.records[selected].bests[result.difficulty]?.score ?? "—"}`}</p><div className="a-actions">{!result.practice && result.won && <button className="a-btn a-primary fs-rich" onClick={() => completed === trials.length ? navigate("ending") : continueVoyage()}><span><b>{completed === trials.length ? "Return to Ithaca" : "Next encounter"}</b><small>{completed === trials.length ? "The homecoming awaits" : nextTrial ? `${nextTrial.title} · new rival plan` : "Choose your next island"}</small></span><ArrowRight size={17}/></button>}<button className={`a-btn fs-rich ${!result.won || result.practice ? "a-primary" : ""}`} disabled={!rivalOnline || !run} onClick={() => save.started ? run && launch(result.practice, run.originalCave, run) : newVoyage()}><RotateCcw size={16}/><span><b>{!save.started ? "Begin voyage" : result.won ? "Replay encounter" : "Retry"}</b><small>{rivalOnline ? "Same rival strategy, straight back in" : "Connect your AI rival first"}</small></span></button><button className="a-btn a-ghost fs-rich" onClick={() => navigate("brief")}><SlidersHorizontal size={16}/><span><b>Change difficulty</b><small>The rival re-plans from this attempt</small></span></button><button className="a-btn a-ghost fs-rich" onClick={() => navigate("map")}><Map size={16}/><span><b>World map</b><small>All eight islands</small></span></button></div>{!result.practice && !result.won && <details className="od-accessibility-passage"><summary>Accessibility: request Athena's help</summary><p>An assisted passage is recorded separately and earns no medal.</p><button className="a-text-btn" onClick={() => setAssistance(true)}>Request an assisted passage</button></details>}</section>}
        {screen === "ending" && <section className="a-ending a-paper"><span className="a-eyebrow">ITHACA / AT LAST</span><div className="a-family"><Portrait tile={0} label="Odysseus" large/><Portrait tile={3} label="Penelope" large/><Portrait tile={4} label="Telemachus" large/></div><h1>Home is more than a shore.</h1><p>The long crossing is behind you. Penelope recognizes the man who returned, and Telemachus stands beside his father. For this moment, the sea can wait.</p><div className="a-ending-report">{trials.map(t => <div key={t.id}><span>{t.title}</span><strong>{save.records[t.id].cleared === "assisted" ? "Assisted" : save.records[t.id].bests[prefs.difficulty]?.medal || "Cleared"}</strong></div>)}</div><div className="a-actions"><button className="a-btn a-primary" onClick={() => navigate("map")}>Revisit the voyage</button><button className="a-btn" onClick={() => setRestart(true)}>New game</button></div><p className="a-caption">An original epilogue condensing the Odyssey's homecoming.</p></section>}
        {screen === "lab" && <AILabMode settings={lab} runs={labRuns} onSettings={setLab} onLaunch={launchLab} onClearRuns={() => setLabRuns([])} onBack={() => navigate("title")} locked={lockedReason || undefined}/>}
        {screen === "howto" && <section className="od-guide"><span className="a-eyebrow">A CAPTAIN'S HANDBOOK</span><h1>Every island has its own rules.</h1><p className="a-lead">Eight encounters. Three difficulties. One AI rival that studies how you play.</p><div className="od-guide-basics"><div><Compass size={26}/><h2>Follow the voyage</h2><p>Win an encounter to unlock the next island. Continue returns you to the first unfinished trial. Completed islands can be replayed for better medals.</p></div><div><BrainCircuit size={26}/><h2>Face a thinking rival</h2><p>Your connected model reads your recent attempts and plans each rival before the round, then the bard and the rival comment live as you play.</p></div><div><Trophy size={26}/><h2>Earn your legend</h2><p>Win with no hits or misses for gold, up to two for silver, or finish for bronze. Best scores, times, and medals are saved for each difficulty.</p></div><div><Play size={26}/><h2>Take your time</h2><p>Escape pauses the simulation and the voices. Resume, restart, check controls, or change settings there. Switching tabs also pauses the action.</p></div></div><div className="od-control-list">{trials.map((t, i) => <article key={t.id}><span className="od-guide-number">0{i + 1}</span><TrialGlyph id={t.id}/><div><h2>{t.title}<small>{t.kind}</small></h2><p>{t.controls}</p></div></article>)}</div><div className="a-actions"><button className="a-btn a-primary fs-rich" disabled={!rivalOnline} onClick={launchDemo}><Play size={17}/><span><b>Watch the AI rescue demonstration</b><small>{rivalOnline ? "A* pathfinding plays while the bard narrates" : "Connect your AI rival first"}</small></span></button><button className="a-btn fs-rich" onClick={() => navigate("lab")}><FlaskConical size={17}/><span><b>Open the AI Lab</b><small>Compare the rival across difficulties</small></span></button><button className="a-btn a-ghost" onClick={() => navigate("title")}><ArrowLeft size={17}/> Main menu</button></div><p className="a-caption">The demonstration uses local A* pathfinding to rescue a sailor. No progress is saved.</p></section>}
        {screen === "credits" && <section className="a-paper od-credits"><span className="a-eyebrow">THE PEOPLE & THE POEM</span><Compass size={50} strokeWidth={1}/><h1>A story three thousand years in the making.</h1><p>Inspired by Homer's <em>The Odyssey</em>. An independent FARSHORE arcade adaptation with original rules and imaginative mythological settings.</p><dl><div><dt>PROJECT</dt><dd>FARSHORE / Bibek Pathak</dd></div><div><dt>ART & SOUND</dt><dd>Original generated landscape and portrait art / Locally synthesized maritime music</dd></div><div><dt>AI RIVAL</dt><dd>Your connected model plans every rival and voices the live commentary / Qwen3 4B Instruct recommended</dd></div><div><dt>TYPE & ICONS</dt><dd>Press Start 2P by CodeMan38 (SIL OFL) / Georgia / Lucide (ISC)</dd></div><div><dt>BUILT WITH</dt><dd>React / TypeScript / Next.js / Canvas & SVG</dd></div></dl><p className="a-caption">Lotus Guardians, competitive potion brewing, wind gates, and repeated arcade contests are fictional game devices. The earlier advice voyage and Circe mystery remain in Settings.</p><div className="a-actions"><a className="a-btn" href="/story-sources.md" target="_blank" rel="noreferrer">Story & sources</a><button className="a-btn a-primary" onClick={() => navigate("title")}>Main menu</button></div></section>}
      </main><footer className="a-footer" inert={blocked}><span>{String(completed).padStart(2, "0")} / 08 ENCOUNTERS COMPLETE</span><span>THE SEA REMEMBERS EVERY JOURNEY.</span></footer>
    </>}
    {screen === "play" && run && <ArcadeRound key={run.key} id={selected} difficulty={prefs.difficulty} plan={run.plan} practice={run.practice} seed={run.seed ?? 4200 + run.key * 19 + save.records[selected].attempts} still={sceneStill} shake={prefs.shake && !sceneStill ? 1 : 0} effects={sceneStill ? 0 : prefs.visuals} originalCave={run.originalCave} demo={run.demo} modelPrepared={run.modelPrepared} taunt={run.taunt} opening={run.opening} commentary={rivalOnline && voicePrefs.commentary} onSpeak={speak} onSilence={silence} onSettings={() => setSettings(true)} onAudio={frame => audio.current?.frame(frame)} onFinish={finish} onLeave={() => navigate(run.lab ? "lab" : "map")} labOverlay={run.lab ? { showPrediction: lab.showPrediction, showHistory: lab.showHistory } : undefined}/>}
    {(storageError || audioError) && <div className="a-notice" role="status">{storageError || audioError}</div>}
    {settings && <div className="a-modal-backdrop"><section className="a-settings a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-settings-title"><div className="a-modal-head"><span className="a-eyebrow">MAKE YOURSELF AT HOME</span><button className="a-btn a-small" onClick={() => setSettings(false)}>Close</button></div><h2 id="a-settings-title">Voyage settings</h2>
      <div className="a-connection fs-settings-rival" data-status={rival.status}><strong><BrainCircuit size={16}/> AI rival</strong><p role="status">{rival.message}</p>{rivalOnline && <dl className="fs-model-facts"><div><dt>Plans the rivals</dt><dd>{rival.model}</dd></div><div><dt>Voices the commentary</dt><dd>{rival.commentary}</dd></div><div><dt>Voice</dt><dd>{voiceLabels[voiceStatus]}</dd></div></dl>}<button className="a-btn a-small fs-rich" disabled={rival.status === "checking"} onClick={() => void checkModel()}><RefreshCw size={15}/><span><b>Check connection again</b><small>Every encounter needs a connected model</small></span></button>
        <details><summary>How to connect a model</summary><ol className="fs-connect-steps"><li><b>This computer</b> Install Ollama, run <code>ollama pull qwen3:4b-instruct</code>, then set <code>FARSHORE_MODEL_URL=http://127.0.0.1:11434/v1/chat/completions</code> and <code>FARSHORE_MODEL_NAME=qwen3:4b-instruct</code> in <code>.env</code> and restart the game server.</li><li><b>Google Colab</b> Open <code>colab/farshore_model_server.ipynb</code>, choose a T4 GPU runtime, run every cell, and paste the printed <code>FARSHORE_*</code> lines into <code>.env</code>. It also starts a neural voice.</li><li><b>Online accounts</b> Add an OpenAI, Groq or OpenRouter connection under Account.</li></ol></details></div>
      <div className="a-connection"><strong><Feather size={16}/> Commentary & voice</strong>
        <p className="a-caption" role="status">{voiceNotes[voiceStatus]}</p>
        <button className="a-setting-toggle" aria-pressed={voicePrefs.commentary} onClick={() => setVoicePrefs(v => ({ ...v, commentary: !v.commentary }))}><span>Live AI commentary<small>The bard and your rival react to what happens, written by your model.</small></span><strong>{voicePrefs.commentary ? "On" : "Off"}</strong></button>
        <button className="a-setting-toggle" aria-pressed={voicePrefs.voice} onClick={() => setVoicePrefs(v => ({ ...v, voice: !v.voice }))}><span>Spoken voice<small>Reads commentary, taunts and the prologue aloud. Music dips while a voice speaks.</small></span><strong>{voicePrefs.voice ? "On" : "Off"}</strong></button>
        <label className="a-field fs-volume">Voice volume <input type="range" min={0} max={1} step={0.05} value={voicePrefs.volume} onChange={e => setVoicePrefs(v => ({ ...v, volume: Number(e.target.value) }))}/><output>{Math.round(voicePrefs.volume * 100)}%</output></label>
        <button className="a-btn a-small" disabled={!voicePrefs.voice} onClick={() => speak("Sing to me, Muse, of the man of many ways, who wandered far.", "bard")}><Volume2 size={15}/> Test the bard&apos;s voice</button>
      </div>
      <button className="a-setting-toggle" aria-pressed={prefs.sound} onClick={() => void toggleSound()}><span>Music & sounds<small>Original maritime music. Every cue is also visible.</small></span><strong>{prefs.sound ? "On" : "Off"}</strong></button><OdysseyPreferences preferences={prefs} onChange={setPrefs}/><button className="a-setting-toggle" aria-pressed={prefs.still} onClick={() => setPrefs(p => ({ ...p, still: !p.still }))}><span>Reduced motion<small>Stops decorative scenery, particles, and transitions.</small></span><strong>{prefs.still ? "On" : "Off"}</strong></button><p className="a-caption">Difficulty can be changed before each encounter. Game movement remains visible when reduced motion is enabled.</p><div className="a-connection"><strong>Showcase / presentation</strong><p className="a-caption">Unlocks every island on the voyage map so you can open any encounter directly, without playing through the earlier ones. Existing scores and medals are kept; nothing is fabricated or overwritten. For a quicker path into a specific encounter&apos;s UI and AI inspector with zero effect on your save at all, use <strong>AI LAB</strong> from the main menu instead.</p><button className="a-btn a-small a-primary" onClick={unlockAllForShowcase}>Unlock all islands</button></div><details><summary>Earlier Farshore modes</summary><div className="a-legacy"><a href="/?mystery">Circe's mystery</a><a href="/?voyage">Original advice voyage</a></div><p className="a-caption">Each mode has its own saved progress. Original cave tactics are available in the Cyclops briefing.</p></details></section></div>}
    {restart && <div className="a-modal-backdrop"><section className="a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-restart-title"><span className="a-eyebrow">A FRESH HORIZON</span><h2 id="a-restart-title">Begin a new voyage?</h2><p>This resets your eight-trial voyage, best scores, and medals.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setRestart(false)}>Keep this voyage</button><button className="a-btn a-primary" onClick={newVoyage}>Begin anew</button></div></section></div>}
    {assistance && <div className="a-modal-backdrop"><section className="a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-assist-title"><h2 id="a-assist-title">A little help from Athena.</h2><p>Continue with an assisted passage. Your voyage report will mark it Assisted, with no medal or score. Replay later to earn a victory.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setAssistance(false)}>Keep trying</button><button className="a-btn a-primary" onClick={useAssistance}>Accept Athena's help</button></div></section></div>}
  </div>;
}
