import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { ArcadeRound } from "./components/play/arcade-round";
import { RoundReport } from "./components/play/round-report";
import { ARCADE_PREFS, ARCADE_SAVE, adaptivePlan, assistTrial, gamePlan, planDescription, clearedCount, medalFor, finishAttempt, newArcade, planLabel, readArcade, trialFor, trials, unlocked, standardPlan, type ArcadeSave, type Difficulty, type OpponentPlan, type TrialId } from "./lib/arcade/arcade";
import { createGame, gameSummary, type GameState } from "./lib/arcade/arcade-runtime";
import { VoyageAudio } from "./lib/audio/voyage-audio";
import { encounterSounds } from "./lib/audio/cues";
import "./styles/arcade.css";
import "./styles/mythic.css";
import "./styles/odyssey.css";
import "./styles/farshore.css";
import { PerformanceSeals, ResultFrieze } from "./components/ai/encounter-intel";
import "./styles/farshore-detail.css";
import "./styles/farshore-stage.css";
import "./styles/farshore-cinema.css";
import "./styles/farshore-viewport.css";
import "./styles/farshore-crossing.css";
import "./styles/farshore-race.css";
import "./styles/farshore-hunt.css";
import "./styles/farshore-mythic.css";
import "./styles/farshore-oracle.css";
import "./styles/farshore-report.css";
import "./styles/cinema.css";
import "./styles/cinema-skin.css";
import { VoyageCrossing } from "./components/menu/voyage-crossing";
import { MythicCinema } from "./components/menu/mythic-cinema";
import { OracleKey } from "./components/menu/oracle-key";
import { askOracle, readOracleEnabled, rememberQuestion, writeOracleEnabled, type OracleState } from "./lib/ai/oracle";
import { LotusRaceRound } from "./components/play/lotus-race";
import { LotusHuntRound } from "./components/play/lotus-hunt";
import { RACE_LAYOUTS, freshLayout } from "./lib/encounters/lotus-layouts";
import type { LotusLayout } from "./lib/encounters/odyssey-games";
import { AILabMode, labRunFrom, type LabRun, type LabSettings } from "./components/ai/ai-lab-mode";
import { aiRuntimeOf } from "./lib/arcade/arcade-runtime";
import { defaultPreferences, preferencesSchema, type AccountChip, type OnlineGame, type OnlinePreferences } from "./lib/online/online";
import { factsFor, requestLine } from "./lib/arcade/commentary";
import { emptyLog, roundHighlights, type OracleAttempt, type RoundLog } from "./lib/arcade/report";
import { voices, type Speaker, type VoiceId } from "./lib/arcade/rivals";
import { VOICE_PREFS, VoiceBox, readVoicePrefs, type VoiceLoad, type VoicePrefs, type VoiceStatus } from "./lib/speech/voice";
import { prologue, prologueSpeech } from "./lib/story/prologue";
import { TEST_LINE } from "./lib/story/spoken-lines";
import { crossingLines } from "./lib/story/crossing";
import { PLAN_EFFECTS } from "./lib/ai/feeds";
import type { LotusModelMeta } from "./lib/ai/lotus-onnx";
import { LOTUS_MODEL_META_URL } from "./lib/ai/lotus-onnx";
import { TRIAL_COPY, TRIAL_LOOKS, AEGEAN_LOOK, type WorldSpec } from "./lib/cinema/scenes";
import { readQualityChoice, resolveQuality, writeQualityChoice, type QualityChoice } from "./lib/cinema/quality";
import { CinemaBackdrop } from "./components/cinema/backdrop";
import { CornerIcons, OracleSigil, type SigilState } from "./components/cinema/chrome";
import { MainMenu } from "./components/cinema/main-menu";
import { TrialCarousel } from "./components/cinema/trial-carousel";
import { VoyageMap } from "./components/cinema/voyage-map";
import { Briefing, type BriefMode } from "./components/cinema/briefing";
import { ResultScreen } from "./components/cinema/result";
import { Credits, Ending, HowToPlay, Prologue } from "./components/cinema/pages";
import { SettingsPanel, type SettingsTab } from "./components/cinema/settings-panel";
import { ModelLab } from "./components/cinema/model-lab";

type Screen = "splash" | "howto" | "credits" | "title" | "intro" | "trials" | "map" | "crossing" | "brief" | "play" | "result" | "ending" | "lab";
/** The voyage crossing between encounters. A preview returns to `back` instead of opening the briefing. */
type Crossing = { from: TrialId; to: TrialId; preview?: boolean; back?: Screen };
type Prefs = OnlinePreferences;
/** The rival's opening taunt, the one line written before the round. Its tactic is the game's own choice. */
type AiState = "idle" | "loading" | "ready";
/** Every encounter is played against a model-planned rival; this is the gate. */
type Rival = { status: "checking" | "online" | "offline"; message: string; model: string | null; commentary: string | null; oracle?: string | null; embedder?: string | null };
type Run = { plan: OpponentPlan; practice: boolean; key: number; modelPrepared: boolean; taunt?: string; tacticReason?: string; opening?: Promise<string>; originalCave?: boolean; demo?: boolean; lab?: boolean; seed?: number; race?: { layout: LotusLayout }; hunt?: { layout: LotusLayout } };
function loadPrefs(): Prefs {
  const defaults: Prefs = { ...defaultPreferences(), still: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false };
  try { const v = JSON.parse(localStorage.getItem(ARCADE_PREFS) || "null"); if (v) { const parsed = preferencesSchema.safeParse({ ...defaults, ...v, revision: 2, difficulty: v.revision === 2 ? v.difficulty : "normal" }); if (parsed.success) return parsed.data; } } catch { /* Storage is optional. */ }
  return defaults;
}

/** The facts of a round that has not started, for the lines written before it. */
const openingFacts = (objective: string) => ({ score: 0, hits: 0, misses: 0, streak: 0, livesLeft: null, secondsLeft: null, progress: 0, status: objective.slice(0, 160) });
/** Screens drawn over a cinematic backdrop. Play and the films bring their own renderers. */
const MENU_SCREENS: Screen[] = ["title", "splash", "intro", "trials", "map", "brief", "result", "ending", "howto", "credits", "lab"];

export default function ArcadeApp({ online, account }: { online?: OnlineGame; account?: AccountChip } = {}) {
  const saveKey = online ? `${online.storageKey}:voyage` : ARCADE_SAVE;
  const preferencesKey = online ? `${online.storageKey}:preferences` : ARCADE_PREFS;
  const [save, setSave] = useState<ArcadeSave>(() => { if (online) return online.initialSave; try { return readArcade(localStorage.getItem(saveKey)) || newArcade(); } catch { return newArcade(); } });
  const [prefs, setPrefs] = useState(() => online?.initialPreferences || loadPrefs()), [screen, setScreen] = useState<Screen>("title");
  const previousPreferences = useRef(prefs);
  const [systemStill, setSystemStill] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  // The in-game setting decides. It starts from the device's reduced-motion preference
  // (see loadPrefs), but a player who turns it off gets the cinematics even when the
  // device asks for less motion; data-motion tells the stylesheets the same.
  const sceneStill = prefs.still;
  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setSystemStill(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const [selected, setSelected] = useState<TrialId>("lotus"), [intro, setIntro] = useState(0);
  const [settings, setSettings] = useState(false), [settingsTab, setSettingsTab] = useState<SettingsTab>("sound"), [restart, setRestart] = useState(false), [assistance, setAssistance] = useState(false);
  const [storageError, setStorageError] = useState(""), [audioError, setAudioError] = useState("");
  const [aiState, setAiState] = useState<AiState>("idle"), [aiTaunt, setAiTaunt] = useState("");
  const [rival, setRival] = useState<Rival>({ status: "checking", message: "Looking for your AI rival...", model: null, commentary: null });
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(readVoicePrefs), [speaking, setSpeaking] = useState(false), [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("checking"), [voiceLoad, setVoiceLoad] = useState<VoiceLoad>({ progress: 0, sizeMb: null });
  const [recap, setRecap] = useState<{ speaker: Speaker; text: string } | "pending" | null>(null);
  const [run, setRun] = useState<Run | null>(null), [result, setResult] = useState<GameState | null>(null);
  /** What happened in the finished round and what was said about it, for the round report. */
  const [roundLog, setRoundLog] = useState<RoundLog>(emptyLog);
  /** The Oracle's questions answered in this briefing, by trial, for the round report. */
  const [oracleLog, setOracleLog] = useState<Partial<Record<TrialId, OracleAttempt[]>>>({});
  const [crossing, setCrossing] = useState<Crossing | null>(null);
  /** The garden for the Lotus-Eaters rescue race: a named one, or a fresh validated one. */
  const [raceGarden, setRaceGarden] = useState<string>("classic");
  /** How the briefing will start the trial: the voyage attempt, practice, or (Lotus) the trained-AI exhibitions. */
  const [briefMode, setBriefMode] = useState<BriefMode>("story");
  /** Where the briefing's back arrow returns to. */
  const [briefFrom, setBriefFrom] = useState<Screen>("trials");
  // The Oracle's Key: a retrieval-augmented question that opens each encounter.
  const [oracleOn, setOracleOn] = useState(readOracleEnabled);
  const [oracle, setOracle] = useState<OracleState>({ status: "idle", trial: null });
  const [oracleOpen, setOracleOpen] = useState(false);
  /** The gate cinematic that plays when the Oracle's key turns (or its showcase preview). */
  const [gate, setGate] = useState<{ trial: TrialId; preview?: boolean } | null>(null);
  /** Set once WebGL fails: the films then fall back to the 2D crossing, and the gate opens without one. */
  const [cinemaFailed, setCinemaFailed] = useState(false);
  /** How much atmosphere the menus draw over the painted environments (Lite: the still paintings). */
  const [qualityChoice, setQualityChoice] = useState<QualityChoice>(readQualityChoice);
  const quality = useMemo(() => resolveQuality(qualityChoice), [qualityChoice]);
  /** The trained rival's own description, for the briefing's honest label. */
  const [trainedMeta, setTrainedMeta] = useState<LotusModelMeta | null>(null);
  const [labTab, setLabTab] = useState<"live" | "models">("live");
  /** Trials whose key the player has earned since opening their briefing. */
  const [oracleKeys, setOracleKeys] = useState<TrialId[]>([]);
  const oracleKeysRef = useRef(oracleKeys), oracleRequest = useRef<AbortController | null>(null);
  oracleKeysRef.current = oracleKeys;
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
  const rivalOnline = rival.status === "online";
  // The rival's tactic is the game's own choice from the last two attempts: instant, and the same for the same history.
  const tactic = gamePlan(selected, save.records[selected].recent);
  // The model asks the Oracle's question and voices the commentary, so a round needs it to start.
  const canStart = rivalOnline;
  const exhibition = selected === "lotus" && (briefMode === "race" || briefMode === "hunt");
  const briefReady = exhibition || canStart;

  useEffect(() => { const service = new VoyageAudio(); audio.current = service; return () => { service.dispose(); audio.current = null; request.current?.abort(); }; }, []);
  useEffect(() => {
    const box = new VoiceBox(); voice.current = box; box.onSpeaking(setSpeaking); box.onStatus(setVoiceStatus); box.onLoad(setVoiceLoad);
    return () => { box.dispose(); voice.current = null; };
  }, []);
  useEffect(() => { voice.current?.setVolume(voicePrefs.volume); if (!voicePrefs.voice) voice.current?.stop(); try { localStorage.setItem(VOICE_PREFS, JSON.stringify(voicePrefs)); } catch { /* Storage is optional. */ } }, [voicePrefs]);
  useEffect(() => { try { localStorage.setItem(saveKey, JSON.stringify(save)); localStorage.setItem(preferencesKey, JSON.stringify(prefs)); setStorageError(""); } catch { setStorageError("Browser saving is unavailable. Keep this tab open to preserve your voyage."); } }, [save, prefs, saveKey, preferencesKey]);
  useEffect(() => { if (previousPreferences.current !== prefs) { previousPreferences.current = prefs; online?.command({ type: "preferences", preferences: prefs }); } }, [prefs, online]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); }, [screen]);
  // The race and hunt modes exist only on the Lotus-Eaters briefing.
  useEffect(() => { if (selected !== "lotus" && (briefMode === "race" || briefMode === "hunt")) setBriefMode("story"); }, [selected, briefMode]);
  useEffect(() => {
    if (selected !== "lotus" || trainedMeta) return;
    const c = new AbortController();
    fetch(LOTUS_MODEL_META_URL, { signal: c.signal }).then(r => (r.ok ? r.json() : null)).then(m => m && setTrainedMeta(m)).catch(() => {});
    return () => c.abort();
  }, [selected, trainedMeta]);
  // Development only: lets the screenshot checks reach any screen without playing through.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __farshore?: unknown }).__farshore = {
      go: (next: Screen, trial?: TrialId) => { if (trial) setSelected(trial); setScreen(next === "splash" ? "title" : next); },
      result: (trial: TrialId, won: boolean, practice = false) => {
        const round = createGame(trial, prefs.difficulty, standardPlan(trial), practice, 7);
        setSelected(trial); setResult({ ...round, done: true, won, score: won ? 1240 : 310 } as GameState); setScreen("result");
      },
      settings: (open: boolean, tab: SettingsTab = "sound") => { setSettingsTab(tab); setSettings(open); },
      mode: (m: BriefMode) => setBriefMode(m),
      quality: (q: QualityChoice) => setQualityChoice(q),
    };
  }, [prefs.difficulty]);
  useEffect(() => { audio.current?.update({ enabled: prefs.sound, music: prefs.music, effects: prefs.effects, ducked: speaking, quiet: settings, mood: screen === "ending" ? "home" : screen === "play" ? selected === "bow" ? "home" : "danger" : "voyage" }); }, [prefs.sound, prefs.music, prefs.effects, screen, selected, settings, speaking]);
  useEffect(() => { void checkModel(); }, []);
  // Starting a model service is noticed without a reload.
  useEffect(() => {
    if (rival.status !== "offline" || screen === "play") return;
    const poll = window.setInterval(() => void checkModel(true), 15000);
    return () => clearInterval(poll);
  }, [rival.status, screen]);
  // A briefing always opens with the rival already studying you. On the way
  // there, the rival starts studying while the ship is still at sea.
  const sailingToBrief = screen === "crossing" && !!crossing && !crossing.preview;
  useEffect(() => { if ((screen === "brief" || sailingToBrief) && rivalOnline && aiState === "idle") void prepare(); }, [screen, sailingToBrief, rivalOnline, aiState, selected, prefs.difficulty]);
  useEffect(() => { setOracleKeys([]); setOracleLog({}); }, [selected]);
  useEffect(() => { if (screen === "map" || screen === "title" || screen === "trials") setOracleKeys([]); }, [screen]);
  useEffect(() => {
    if (screen !== "brief" || !oracleOn || !rivalOnline || oracleKeys.includes(selected) || exhibition) return;
    if (oracle.trial !== selected) consultOracle(selected);
  }, [screen, selected, oracleOn, rivalOnline, exhibition]);
  useEffect(() => () => oracleRequest.current?.abort(), []);
  // Asking the Oracle's status starts its passage index building on the server, ahead of the first briefing.
  useEffect(() => { if (oracleOn && rivalOnline) void fetch("/api/oracle", { cache: "no-store" }).catch(() => {}); }, [oracleOn, rivalOnline]);
  // Each environment has its own soundscape: the chapter views and briefings play the trial's ambience, the rest the open sea.
  useEffect(() => {
    if (screen === "play") return;
    audio.current?.setLoops({});
    audio.current?.setScene(screen === "trials" || screen === "brief" || screen === "result" ? TRIAL_COPY[selected].ambience : screen === "ending" ? "hall" : "sea");
    if (screen === "brief") audio.current?.prepare(encounterSounds[selected]);
  }, [screen, selected]);
  // The bard reads the prologue aloud.
  useEffect(() => { if (screen === "intro") speak(prologueSpeech(prologue[intro]), "bard"); return () => voice.current?.stop(); }, [screen, intro]);
  // Lines the game knows ahead of time are fetched while the player reads, so they play at once.
  useEffect(() => { if (voiceStatus === "neural" && voicePrefs.voice && !save.started) prologue.forEach(slide => voice.current?.prime(prologueSpeech(slide), "bard")); }, [voiceStatus, voicePrefs.voice, save.started]);
  useEffect(() => { if (aiState === "ready" && aiTaunt && voicePrefs.voice) voice.current?.prime(aiTaunt, selected); }, [aiState, aiTaunt, selected, voicePrefs.voice]);
  useEffect(() => { if (settings && voicePrefs.voice) voice.current?.prime(TEST_LINE, "bard"); }, [settings, voicePrefs.voice]);
  // The small confirmation dialogs (and the Oracle) trap focus here; the drawers trap their own.
  useEffect(() => {
    if (!restart && !assistance && !oracleOpen) return;
    if (!oracleOpen) document.querySelector<HTMLButtonElement>(".a-modal button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setRestart(false); setAssistance(false); setOracleOpen(false); }
      if (e.key !== "Tab") return;
      const items = Array.from(document.querySelectorAll<HTMLElement>(".a-modal button, .a-modal input, .a-modal select, .a-modal a, .a-modal summary")).filter(el => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); if (screen === "play") document.querySelector<HTMLButtonElement>(".a-round-overlay button")?.focus(); else heading.current?.focus({ preventScroll: true }); };
  }, [restart, assistance, oracleOpen]);
  const speak = useCallback((text: string, id: VoiceId) => { if (voicePrefsRef.current.voice) voice.current?.say(text, id); }, []);
  const silence = useCallback(() => voice.current?.stop(), []);
  /** Drops the taunt being written; "idle" lets the next briefing ask again. */
  function cancelAi() { generation.current++; request.current?.abort(); request.current = null; setAiState("idle"); setAiTaunt(""); }
  async function checkModel(quiet = false) {
    if (!quiet) setRival(old => ({ ...old, status: "checking", message: "Looking for your AI rival…" }));
    try {
      const r = await fetch("/api/arcade", { signal: AbortSignal.timeout(6000) }); const v = await r.json();
      setRival({ status: v.aiAvailable ? "online" : "offline", message: typeof v.message === "string" ? v.message : "The AI rival could not be checked.", model: typeof v.model === "string" ? v.model : null, commentary: typeof v.commentary === "string" ? v.commentary : null, oracle: typeof v.oracle === "string" ? v.oracle : null, embedder: typeof v.embedder === "string" ? v.embedder : null });
    } catch { setRival({ status: "offline", message: "The game could not reach an AI model. Start your model service, then check again.", model: null, commentary: null }); }
  }
  /**
   * The rival's opening taunt. The game has already chosen its tactic; the
   * model is handed that tactic and writes the line the rival opens with.
   * Without live commentary, or when the model does not answer, the rival
   * speaks its own written quote.
   */
  async function prepare() {
    cancelAi(); const controller = new AbortController(), token = generation.current; request.current = controller;
    const id = selected, difficulty = prefs.difficulty, t = trialFor(id), { plan } = gamePlan(id, save.records[id].recent);
    setAiState("loading");
    const line = voicePrefsRef.current.commentary
      ? await requestLine({ trialId: id, difficulty, moment: "start", speaker: "rival", facts: { ...openingFacts(t.objective), event: `${t.character} prepares the ${planDescription(id, plan)}`.slice(0, 200) }, recent: [] }, controller.signal).catch(() => "")
      : "";
    if (token !== generation.current || controller.signal.aborted) return;
    request.current = null;
    setAiTaunt(line || t.quote); setAiState("ready"); audio.current?.cue("reply");
    prefetchOpening(id, difficulty);
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
    opening.current = requestLine({ trialId: id, difficulty, moment: "start", speaker: "bard", facts: { ...openingFacts(t.objective), event: `Odysseus steps up to face ${t.character}.` }, recent: [] })
      .then(line => { if (line && voicePrefsRef.current.voice) voice.current?.prime(line, "bard"); return line; })
      .catch(() => "");
  }
  function wakeAudio() { if (prefs.sound) void audio.current?.unlock().catch(() => setAudioError("Audio could not start. Every cue is also visible.")); }
  function navigate(next: Screen) { wakeAudio(); cancelAi(); if (screen === "play") audio.current?.setLoops({}); setAssistance(false); setRestart(false); setScreen(next); }
  function openTrial(id: TrialId, from: Screen = screen) { if (!unlocked(save, id)) return; cancelAi(); setSelected(id); setAssistance(false); setResult(null); setBriefFrom(from === "brief" || from === "result" ? "trials" : from); setScreen("brief"); }
  /** Opens a trial's briefing from the chapter views; a first visit starts the voyage on the way. */
  function enterTrial(id: TrialId) {
    wakeAudio();
    if (!save.started) { online?.command({ type: "start" }); setSave({ ...newArcade(), started: true }); }
    cancelAi(); setSelected(id); setAssistance(false); setResult(null); setBriefFrom(screen === "map" ? "map" : "trials"); setScreen("brief");
  }
  function openSettings(tab: SettingsTab = "sound") { setSettingsTab(tab); setSettings(true); }
  /** Asks the Oracle for a fresh question about a trial; any earlier request is dropped. */
  function consultOracle(trial: TrialId) {
    oracleRequest.current?.abort();
    const controller = new AbortController();
    oracleRequest.current = controller;
    setOracle({ status: "loading", trial, started: Date.now() });
    askOracle(trial, controller.signal).then(item => {
      if (controller.signal.aborted) return;
      rememberQuestion(trial, item.question);
      setOracle({ status: "ready", trial, item });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setOracle({ status: "error", trial, error: error instanceof Error ? error.message : "The Oracle could not be reached." });
    });
  }
  /** After a wrong answer, the next visit to the Oracle brings a new question. */
  function closeOracle(answeredWrong: boolean) { setOracleOpen(false); if (answeredWrong) consultOracle(selected); }
  /** The Oracle's key turns: Odysseus walks up and unlocks the trial's gate, then the trial begins. */
  function enterGate() {
    if (sceneStill || cinemaFailed) { launch(); return; }
    setOracleOpen(false); wakeAudio(); setGate({ trial: selected });
  }
  function gateOpened() { const done = gate; setGate(null); if (!done?.preview) launch(); }
  /** Showcase: watch the selected trial's gate open, without answering or starting anything. */
  function previewGate() { setSettings(false); wakeAudio(); setGate({ trial: selected, preview: true }); }
  /** Starts an attempt against the rival. Without a connected model, nothing starts. */
  function launch(practice = false, originalCave = false, reuse?: Pick<Run, "plan" | "taunt" | "tacticReason">) {
    const plan = reuse?.plan ?? tactic.plan;
    if (!rivalOnline) return;
    // A campaign start from the briefing needs the Oracle's key first. Practice, retries and the cave tactics do not.
    if (!practice && !originalCave && !reuse && oracleOn && !oracleKeysRef.current.includes(selected)) {
      if (oracle.trial !== selected || oracle.status === "error") consultOracle(selected);
      setOracleOpen(true);
      return;
    }
    setOracleOpen(false);
    const taunt = reuse ? reuse.taunt : aiState === "ready" ? aiTaunt : trial.quote;
    wakeAudio(); cancelAi(); setRecap(null);
    const openingLine = opening.current ?? undefined; opening.current = null;
    setRun({ plan, practice, modelPrepared: true, originalCave, taunt, tacticReason: reuse ? reuse.tacticReason : tactic.reason, opening: openingLine, key: ++runKey.current }); setScreen("play"); audio.current?.cue("sail");
  }
  /** The briefing's Begin button, for whichever mode is chosen. */
  function begin() {
    if (briefMode === "race" && selected === "lotus") launchRace();
    else if (briefMode === "hunt" && selected === "lotus") launchHunt();
    else launch(briefMode === "practice");
  }
  function requestRecap(round: GameState) {
    const token = ++recapToken.current;
    if (!rivalOnline || !voicePrefsRef.current.commentary) { setRecap(null); return; }
    const speaker: Speaker = round.won ? "bard" : "rival";
    setRecap("pending");
    void requestLine({ trialId: round.id as TrialId, difficulty: round.difficulty, moment: round.won ? "win" : "loss", speaker, facts: factsFor(round, "", roundHighlights(round)), recent: [] })
      .then(text => { if (token !== recapToken.current) return; if (!text) { setRecap(null); return; } setRecap({ speaker, text }); speak(text, speaker === "bard" ? "bard" : round.id as TrialId); })
      .catch(() => { if (token === recapToken.current) setRecap(null); });
  }
  function finish(round: GameState, log: RoundLog = emptyLog()) {
    if (!round.done || round.id !== selected) return;
    setRoundLog(log);
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
  function continueVoyage() { if (nextTrial) openTrial(nextTrial.id, "title"); else navigate("ending"); }
  /**
   * After an encounter, Odysseus crosses the chart to the next island before
   * its briefing. With reduced motion the briefing opens directly.
   */
  function sailTo(from: TrialId, to: TrialId) {
    cancelAi(); setSelected(to); setAssistance(false); setResult(null); setBriefFrom("map");
    if (sceneStill || from === to) { setScreen("brief"); return; }
    if (voicePrefsRef.current.voice) voice.current?.prime(crossingLines[to], "bard");
    wakeAudio(); setCrossing({ from, to }); setScreen("crossing");
  }
  /** The crossing has ended or was skipped. The rival's preparation carries on into the briefing. */
  function landed() {
    const done = crossing; setCrossing(null);
    setScreen(done?.preview ? done.back ?? "map" : "brief");
  }
  /** Showcase: watch a crossing from the last island cleared, without touching the voyage. */
  function previewCrossing() {
    const cleared = trials.map((t, i) => save.records[t.id].cleared !== "pending" ? i : -1).filter(i => i >= 0);
    const fromIndex = Math.min(trials.length - 2, cleared.length ? cleared[cleared.length - 1] : 0);
    setSettings(false); wakeAudio();
    setCrossing({ from: trials[fromIndex].id, to: trials[fromIndex + 1].id, preview: true, back: screen });
    setScreen("crossing");
  }
  function useAssistance() {
    const updated = assistTrial(save, selected);
    if (updated !== save) online?.command({ type: "assist", trialId: selected });
    setSave(updated); cancelAi(); setAssistance(false); setResult(null);
    const index = trials.findIndex(t => t.id === selected);
    // React commits the save asynchronously. Navigate from the new state,
    // rather than asking openTrial to check the previous render's locked route.
    if (index === trials.length - 1) setScreen("ending");
    else if (unlocked(updated, trials[index + 1].id)) sailTo(selected, trials[index + 1].id);
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
  /**
   * The Lotus-Eaters rescue race against the trained (PPO) rival. It needs no
   * language model: the guardians on both boards use the game's chosen
   * tactic. A race is an exhibition: it never changes the voyage, medals or records.
   */
  function launchRace() { launchExhibition("race"); }
  /** The Lotus Hunt: the same garden and tactic, but you drive the guardians against the trained Odysseus. */
  function launchHunt() { launchExhibition("hunt"); }
  function launchExhibition(mode: "race" | "hunt") {
    wakeAudio();
    const layout = raceGarden === "fresh" ? freshLayout() : RACE_LAYOUTS.find(l => l.id === raceGarden) ?? RACE_LAYOUTS[0];
    const plan = selected === "lotus" ? tactic.plan : standardPlan("lotus");
    setRun({ plan, practice: true, modelPrepared: false, key: ++runKey.current, ...(mode === "race" ? { race: { layout } } : { hunt: { layout } }) });
    setScreen("play");
  }
  function leaveRace() { audio.current?.setLoops({}); setScreen("brief"); }
  function launchDemo() { if (!rivalOnline) return; wakeAudio(); cancelAi(); setSelected("lotus"); setRun({ plan: adaptivePlan("lotus"), practice: true, modelPrepared: false, demo: true, key: ++runKey.current }); setScreen("play"); }
  function chooseQuality(choice: QualityChoice) { writeQualityChoice(choice); setQualityChoice(choice); }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (settings || restart || assistance || oracleOpen || gate || (e.target as HTMLElement).closest("input,select,textarea,summary,[role=dialog]")) return;
      if (screen === "brief" && e.key === "Enter" && briefReady && !(e.target as HTMLElement).closest("button,a")) { e.preventDefault(); begin(); }
      else if (screen === "title" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        const items = [...document.querySelectorAll<HTMLButtonElement>(".cn-menu-nav button:not(:disabled)")];
        const index = items.indexOf(document.activeElement as HTMLButtonElement), back = e.key === "ArrowUp";
        const next = index < 0 ? back || e.key === "End" ? items.length - 1 : 0 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (back ? -1 : 1) + items.length) % items.length;
        e.preventDefault(); items[next]?.focus();
      } else if (e.key === "Escape" && screen !== "play" && screen !== "title" && screen !== "crossing") navigate(screen === "brief" ? briefFrom : screen === "lab" || screen === "howto" || screen === "credits" || screen === "intro" ? "title" : screen === "result" ? "map" : "title");
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [screen, settings, restart, assistance, oracleOpen, gate, canStart, save, selected, aiState, aiTaunt, rivalOnline, briefMode, briefReady, briefFrom, raceGarden]);
  const blocked = settings || restart || assistance || oracleOpen || !!gate;

  /* ------------------------------------------------------------ the Oracle sigil */
  const thinking = oracle.status === "loading" || aiState === "loading" || recap === "pending";
  const sigilState: SigilState = rival.status === "checking" ? "thinking" : !rivalOnline ? "offline" : thinking ? "thinking" : "online";
  const sigilLabel = rival.status === "checking" ? "Seeking the Oracle" : !rivalOnline ? "Oracle unavailable" : oracle.status === "loading" ? "The Oracle is writing" : aiState === "loading" ? `${trial.character} chooses words` : recap === "pending" ? "The bard is writing" : "Oracle connected";
  const sigilDetail = !rivalOnline ? (rival.status === "checking" ? "One moment" : "Connect a model in Settings") : rival.commentary ?? rival.model ?? undefined;
  const cornerSigil = <OracleSigil state={sigilState} label={sigilLabel} detail={sigilDetail} compact onClick={() => openSettings("ai")} />;
  const corner = <CornerIcons sound={prefs.sound} onSound={() => void toggleSound()} onLab={() => navigate("lab")} account={account ? { name: account.name ?? null, label: account.label, open: account.open } : undefined} onSettings={() => openSettings("sound")} sigil={cornerSigil} />;
  const briefStatus = exhibition
    ? <OracleSigil state="trained" label="Trained rival ready" detail={trainedMeta ? `${trainedMeta.label} · runs in your browser` : "PPO policy · runs in your browser"} />
    : <OracleSigil state={sigilState} label={!rivalOnline ? sigilLabel : thinking ? sigilLabel : "AI ready"} detail={!rivalOnline ? sigilDetail : `${planLabel(selected, tactic.plan)} · ${rival.commentary ?? rival.model ?? "model connected"}`} onClick={() => openSettings("ai")} />;

  /* ---------------------------------------------------------------- the worlds */
  const world: WorldSpec | null = !MENU_SCREENS.includes(screen) ? null
    : screen === "trials" ? { kind: "trial", id: selected, framing: "wide" }
      : screen === "brief" ? { kind: "trial", id: selected, framing: "close" }
        : screen === "result" && result ? { kind: "trial", id: selected, framing: "result", mood: result.practice ? undefined : result.won ? "victory" : "defeat" }
          : screen === "ending" ? { kind: "trial", id: "bow", framing: "result", mood: "victory" }
            : screen === "map" ? { kind: "map" }
              : { kind: "aegean", dim: screen === "lab" || screen === "howto" || screen === "credits" };
  const accent = world?.kind === "trial" ? TRIAL_LOOKS[world.id].accent : AEGEAN_LOOK.accent;
  const doneFlags = trials.map(t => save.records[t.id].cleared !== "pending");

  let view: ReactNode = null;
  if (screen === "title" || screen === "splash") view = <MainMenu started={save.started} next={nextTrial?.id ?? null} done={doneFlags} still={sceneStill} corner={corner} headingRef={heading}
    onContinue={continueVoyage} onNewVoyage={() => (save.started ? setRestart(true) : newVoyage())} onMap={() => navigate("map")} onHowTo={() => navigate("howto")} />;
  else if (screen === "intro") view = <Prologue slide={intro} still={sceneStill} corner={corner} headingRef={heading} onNext={() => (intro === 0 ? setIntro(1) : openTrial("lotus", "title"))} onSkip={() => navigate("map")} onMenu={() => navigate("title")} />;
  else if (screen === "trials") view = <TrialCarousel save={save} selected={selected} difficulty={prefs.difficulty} still={sceneStill} corner={corner} headingRef={heading} onSelect={setSelected} onEnter={enterTrial} onDifficulty={setDifficulty} onMap={() => navigate("map")} onMenu={() => navigate("title")} />;
  else if (screen === "map") view = <VoyageMap save={save} selected={selected} quality={quality} still={sceneStill} corner={corner} headingRef={heading} onSelect={setSelected} onEnter={enterTrial} onTrials={() => navigate("trials")} onMenu={() => navigate("title")} />;
  else if (screen === "brief") view = <Briefing id={selected} save={save} difficulty={prefs.difficulty} mode={selected === "lotus" ? briefMode : briefMode === "practice" ? "practice" : "story"} still={sceneStill} corner={corner} status={briefStatus} headingRef={heading}
    ready={briefReady} holdLabel={rival.status === "checking" ? "Seeking the Oracle" : "Connect the Oracle"} oracleFirst={oracleOn && !oracleKeys.includes(selected)} garden={raceGarden}
    taunt={aiState === "ready" && aiTaunt ? { speaker: trial.character, text: aiTaunt } : null}
    rival={{ character: trial.character, tactic: planLabel(selected, tactic.plan), reason: tactic.reason, effect: PLAN_EFFECTS[selected]?.[tactic.plan.planId] ?? trial.adaptive, models: { commentary: rival.commentary, oracle: rival.oracle ?? rival.model } }}
    trainedMeta={trainedMeta ? { label: trainedMeta.label, steps: trainedMeta.steps } : null}
    onMode={setBriefMode} onGarden={setRaceGarden} onDifficulty={setDifficulty} onBegin={begin} onBlocked={() => (rival.status === "checking" ? void checkModel() : openSettings("ai"))}
    onBack={() => navigate(briefFrom)} onHear={() => aiTaunt && speak(aiTaunt, selected)} />;
  else if (screen === "result" && result) {
    const medal = result.practice || !result.won ? null : medalFor(gameSummary(result));
    const finale = completed === trials.length || !nextTrial;
    view = <ResultScreen id={selected} state={result} medal={medal} demo={!!run?.demo} still={sceneStill} corner={corner} headingRef={heading}
      next={nextTrial ? { title: TRIAL_COPY[nextTrial.id].short } : null} finale={finale} canRetry={rivalOnline && !!run} retryNote={!rivalOnline ? "Connect a model first" : undefined}
      best={save.records[selected].bests[result.difficulty]?.score ?? null}
      recap={recap === "pending" ? "pending" : recap ? { speaker: recap.speaker === "bard" ? voices.bard.name : trial.character, text: recap.text } : null}
      scoreLabel={selected === "bow" ? "Axes" : selected === "circe" ? "Brew points" : "Score"} rivalScore={selected === "bow" || selected === "circe" ? `${result.rivalScore}` : undefined}
      details={<div className="cn-details-stack"><ResultFrieze state={result} /><PerformanceSeals state={result} /><RoundReport state={result} log={roundLog} recap={recap} bardName={voices.bard.name} rivalName={trial.character} tactic={run && !run.lab && !run.demo ? { label: planLabel(selected, run.plan), reason: run.tacticReason ?? "" } : null} oracle={oracleLog[selected] ?? []} oracleOn={oracleOn} models={{ commentary: rival.commentary, oracle: rival.oracle ?? rival.model }} onSpeak={(text, speaker) => speak(text, speaker === "bard" ? "bard" : selected)} /></div>}
      onContinue={() => (finale ? navigate("ending") : sailTo(selected, nextTrial!.id))}
      onRetry={() => (save.started ? run && launch(result.practice, run.originalCave, run) : newVoyage())}
      onBrief={() => navigate("brief")} onMap={() => navigate("map")} onMenu={() => navigate("title")}
      onAssist={!result.practice && !result.won ? () => setAssistance(true) : undefined}
      onHear={() => recap && recap !== "pending" && speak(recap.text, recap.speaker === "bard" ? "bard" : selected)} />;
  }
  else if (screen === "ending") view = <Ending save={save} corner={corner} headingRef={heading} onMap={() => navigate("map")} onNewVoyage={() => setRestart(true)} onMenu={() => navigate("title")} />;
  else if (screen === "howto") view = <HowToPlay corner={corner} headingRef={heading} canDemo={rivalOnline} onDemo={launchDemo} onLab={() => navigate("lab")} onMenu={() => navigate("title")} />;
  else if (screen === "credits") view = <Credits corner={corner} headingRef={heading} onMenu={() => navigate("title")} />;
  else if (screen === "lab") view = <main className="cn-screen cn-lab">
    <header className="cn-topbar"><button type="button" className="cn-wordmark" onClick={() => navigate("title")} aria-label="Back"><svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M21 7H2M7 1L1 7l6 6" /></svg><i aria-hidden="true" /><span>Farshore</span></button>{corner}</header>
    <div className="cn-lab-head"><span className="cn-ceremonial cn-ceremonial-rule">AI Lab</span><h1 ref={heading as React.RefObject<HTMLHeadingElement>} tabIndex={-1} className="cn-page-title cn-small">How the rivals decide</h1>
      <div className="cn-tabs" role="tablist" aria-label="AI Lab sections">{([["live", "Live demonstrations"], ["models", "Models & measurements"]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={labTab === id} className="cn-tab" onClick={() => setLabTab(id)}>{label}{labTab === id && <i className="cn-tab-line" />}</button>)}</div>
    </div>
    <div className="cn-lab-body">{labTab === "live"
      ? <AILabMode settings={lab} runs={labRuns} onSettings={setLab} onLaunch={launchLab} onClearRuns={() => setLabRuns([])} onBack={() => navigate("title")} locked={rivalOnline ? undefined : rival.status === "checking" ? "Looking for the AI model…" : "Open Settings to connect an AI model."} />
      : <ModelLab model={rival} />}</div>
  </main>;

  return <div className={"a-app od-app fs-app cn-app" + (sceneStill ? " a-still" : "") + (prefs.contrast ? " od-contrast" : "")} data-screen={screen} data-skin="cinema" data-motion={sceneStill ? "reduced" : "full"} data-quality={quality} style={{ "--cn-accent": accent, "--cn-fx": String(prefs.visuals) } as CSSProperties}>
    <MotionConfig reducedMotion={sceneStill ? "always" : "never"}>
      {world && <CinemaBackdrop world={world} quality={quality} still={sceneStill} paused={!!gate} />}
      {world && <div className="cn-grade" aria-hidden="true" />}
      {view && <div className="cn-view" key={screen} inert={blocked}>{view}</div>}
      {screen === "crossing" && crossing && !cinemaFailed ? <MythicCinema
        kind="journey"
        key={`3d:${crossing.from}>${crossing.to}`}
        from={crossing.from} to={crossing.to} preview={crossing.preview}
        rival={!rivalOnline ? "waiting" : aiState === "ready" ? "ready" : "studying"}
        headingRef={heading}
        onSound={(name, gain, pan) => audio.current?.play([{ sound: name, gain, pan }])}
        onSpeak={text => speak(text, "bard")}
        onSilence={silence}
        onDone={landed}
        onFail={() => setCinemaFailed(true)}
      /> : screen === "crossing" && crossing ? <VoyageCrossing
        key={`${crossing.from}>${crossing.to}`}
        save={save} from={crossing.from} to={crossing.to} preview={crossing.preview}
        rival={!rivalOnline ? "waiting" : aiState === "ready" ? "ready" : "studying"}
        headingRef={heading}
        onSound={(name, gain, pan) => audio.current?.play([{ sound: name, gain, pan }])}
        onSpeak={text => speak(text, "bard")}
        onSilence={silence}
        onDone={landed}
      /> : null}
      {screen === "play" && run?.race && <LotusRaceRound key={run.key} difficulty={prefs.difficulty} plan={run.plan} layout={run.race.layout} onLeave={leaveRace} onAudio={frame => audio.current?.frame(frame)} />}
      {screen === "play" && run?.hunt && <LotusHuntRound key={run.key} difficulty={prefs.difficulty} plan={run.plan} layout={run.hunt.layout} onLeave={leaveRace} onAudio={frame => audio.current?.frame(frame)} />}
      {screen === "play" && run && !run.race && !run.hunt && <ArcadeRound key={run.key} id={selected} difficulty={prefs.difficulty} plan={run.plan} practice={run.practice} seed={run.seed ?? 4200 + run.key * 19 + save.records[selected].attempts} still={sceneStill} shake={prefs.shake && !sceneStill ? 1 : 0} effects={sceneStill ? 0 : prefs.visuals} originalCave={run.originalCave} demo={run.demo} modelPrepared={run.modelPrepared} taunt={run.taunt} opening={run.opening} commentary={rivalOnline && voicePrefs.commentary} onSpeak={speak} onSilence={silence} onSettings={() => openSettings("sound")} onAudio={frame => audio.current?.frame(frame)} onFinish={finish} onLeave={() => navigate(run.lab ? "lab" : "brief")} labOverlay={run.lab ? { showPrediction: lab.showPrediction, showHistory: lab.showHistory } : undefined} />}
      {(storageError || audioError) && <div className="a-notice cn-notice" role="status">{storageError || audioError}</div>}
      <SettingsPanel open={settings} initialTab={settingsTab} onClose={() => setSettings(false)} prefs={prefs} setPrefs={setPrefs} onToggleSound={() => void toggleSound()}
        voicePrefs={voicePrefs} setVoicePrefs={setVoicePrefs} voiceStatus={voiceStatus} voiceLoad={voiceLoad} onTestVoice={() => speak(TEST_LINE, "bard")}
        rival={rival} onCheck={() => void checkModel()} oracleOn={oracleOn} onOracle={() => setOracleOn(v => { writeOracleEnabled(!v); return !v; })}
        quality={qualityChoice} resolved={quality} onQuality={chooseQuality} systemStill={systemStill} onCredits={() => { setSettings(false); navigate("credits"); }}
        showcase={screen !== "play" ? <div className="cn-showcase"><b>Showcase</b><small>Watch Odysseus sail on to the next trial, or the Oracle’s key open a gate. Your voyage is unchanged.{sceneStill ? " Turn off Reduced motion to watch." : ""}</small><div><button type="button" className="cn-ghost" disabled={sceneStill} onClick={previewCrossing}><span>Preview a crossing</span></button><button type="button" className="cn-ghost" disabled={sceneStill || cinemaFailed} onClick={previewGate}><span>Preview the gate</span></button></div></div> : null} />
      {gate && <MythicCinema kind="unlock" key={`gate:${gate.trial}`} to={gate.trial} preview={gate.preview}
        onSound={(name, gain, pan) => audio.current?.play([{ sound: name, gain, pan }])}
        onDone={gateOpened}
        onFail={() => { setCinemaFailed(true); gateOpened(); }} />}
      {oracleOpen && <OracleKey trialTitle={trial.title} state={oracle} onAnswer={(item, picked) => setOracleLog(log => ({ ...log, [item.trialId]: [...(log[item.trialId] ?? []), {
        trial: item.trialId, question: item.question, picked: item.options[picked], answer: item.options[item.answer], correct: picked === item.answer,
        evidence: item.evidence, ref: item.source.kind === "odyssey" ? `Homer, Odyssey, ${item.source.ref}` : item.source.ref,
        model: item.generation.model, ms: item.generation.ms, retrieval: item.retrieval.mode === "hybrid" ? `${item.retrieval.embedder} meaning search with BM25 keywords` : "BM25 keyword search", mock: !!item.mock,
      }].slice(-3) }))} onSolved={() => setOracleKeys(keys => keys.includes(selected) ? keys : [...keys, selected])} onEnter={enterGate} onAgain={() => consultOracle(selected)} onClose={closeOracle} />}
      {restart && <div className="a-modal-backdrop cn-modal-backdrop"><section className="a-modal a-paper cn-modal" role="dialog" aria-modal="true" aria-labelledby="a-restart-title"><h2 id="a-restart-title">Begin a new voyage?</h2><p>This clears your voyage, best scores and medals.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setRestart(false)}>Keep this voyage</button><button className="a-btn a-primary" onClick={newVoyage}>New voyage</button></div></section></div>}
      {assistance && <div className="a-modal-backdrop cn-modal-backdrop"><section className="a-modal a-paper cn-modal" role="dialog" aria-modal="true" aria-labelledby="a-assist-title"><h2 id="a-assist-title">A little help from Athena.</h2><p>Your voyage marks this trial Assisted, with no medal or score. You can replay it later.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setAssistance(false)}>Keep trying</button><button className="a-btn a-primary" onClick={useAssistance}>Accept Athena’s help</button></div></section></div>}
    </MotionConfig>
  </div>;
}
