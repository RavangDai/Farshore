import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArcadeRound } from "./components/play/arcade-round";
import { RoundReport } from "./components/play/round-report";
import { ARCADE_PREFS, ARCADE_SAVE, adaptivePlan, assistTrial, gamePlan, planDescription, challengeObjective, clearedCount, difficultyNames, medalFor, finishAttempt, newArcade, planLabel, readArcade, trialFor, trials, unlocked, standardPlan, type ArcadeSave, type Difficulty, type OpponentPlan, type TrialId } from "./lib/arcade/arcade";
import { createGame, gameSummary, type GameState } from "./lib/arcade/arcade-runtime";
import { OdysseyPreferences } from "./components/menu/odyssey-preferences";
import { TrialGlyph } from "./components/menu/odyssey-map";
import { ArrowRight, ArrowLeft, Play, Map, BookOpen, Settings, Info, Compass, Trophy, Volume2, VolumeX, Sparkles, RotateCcw, FlaskConical, BrainCircuit, Swords, GraduationCap, Mic, MicOff, RefreshCw, Feather, SlidersHorizontal, Loader2, CircleUser, Users } from "lucide-react";
import { VoyageAudio } from "./lib/audio/voyage-audio";
import { encounterSounds } from "./lib/audio/cues";
import "./styles/arcade.css";
import "./styles/mythic.css";
import "./styles/odyssey.css";
import "./styles/farshore.css";
import { FarshoreLogo, TrialArtwork, CharacterPortrait } from "./components/farshore-art";
import { PerformanceSeals, ResultFrieze } from "./components/ai/encounter-intel";
import "./styles/farshore-detail.css";
import "./styles/farshore-stage.css";
import "./styles/farshore-cinema.css";
import "./styles/farshore-viewport.css";
import "./styles/farshore-crossing.css";
import "./styles/farshore-race.css";
import "./styles/farshore-oracle.css";
import "./styles/farshore-report.css";
import "./styles/farshore-pixel.css";
import "./styles/farshore-pixel-motion.css";
import { TrialSelection } from "./components/menu/trial-selection";
import { PixelAmbience, PixelFilters, PixelTransition, Typewriter, WordmarkAssembly } from "./components/fx/pixel-fx";
import type { AmbiencePreset } from "./lib/render/pixel-fx";
import { VoyageCrossing } from "./components/menu/voyage-crossing";
import { OracleKey } from "./components/menu/oracle-key";
import { askOracle, readOracleEnabled, rememberQuestion, writeOracleEnabled, type OracleState } from "./lib/ai/oracle";
import { LotusRaceRound } from "./components/play/lotus-race";
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

type Screen = "splash" | "howto" | "credits" | "title" | "intro" | "map" | "crossing" | "brief" | "play" | "result" | "ending" | "lab";
/** The voyage crossing between encounters. A preview returns to `back` instead of opening the briefing. */
type Crossing = { from: TrialId; to: TrialId; preview?: boolean; back?: Screen };
type Prefs = OnlinePreferences;
/** The rival's opening taunt, the one line written before the round. Its tactic is the game's own choice. */
type AiState = "idle" | "loading" | "ready";
/** Every encounter is played against a model-planned rival; this is the gate. */
type Rival = { status: "checking" | "online" | "offline"; message: string; model: string | null; commentary: string | null; oracle?: string | null; embedder?: string | null };
type Run = { plan: OpponentPlan; practice: boolean; key: number; modelPrepared: boolean; taunt?: string; tacticReason?: string; opening?: Promise<string>; originalCave?: boolean; demo?: boolean; lab?: boolean; seed?: number; race?: { layout: LotusLayout } };
function loadPrefs(): Prefs {
  const defaults: Prefs = { ...defaultPreferences(), still: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false };
  try { const v = JSON.parse(localStorage.getItem(ARCADE_PREFS) || "null"); if (v) { const parsed = preferencesSchema.safeParse({ ...defaults, ...v, revision: 2, difficulty: v.revision === 2 ? v.difficulty : "normal" }); if (parsed.success) return parsed.data; } } catch { /* Storage is optional. */ }
  return defaults;
}
function Portrait(props: { tile: number; label: string; large?: boolean }) { return <CharacterPortrait {...props}/>; }
/** The motes that drift over each trial's art on its briefing. */
const AMBIENCE: Record<TrialId, AmbiencePreset> = { lotus: "petals", cyclops: "embers", aeolus: "wind", circe: "bubbles", sirens: "notes", scylla: "spray", calypso: "storm", bow: "torch" };
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const voiceLabels: Record<VoiceStatus, string> = { checking: "Checking…", loading: "Natural voices, getting ready", neural: "Natural voices", browser: "Browser voices", unavailable: "Browser voices" };
const voiceNotes: Record<VoiceStatus, string> = {
  checking: "Checking which voices are available.",
  loading: "Preparing the natural voices. Until they are ready, your browser reads the lines.",
  neural: "Each character speaks with their own natural voice.",
  browser: "Natural voices are turned off on this server, so your browser reads the lines.",
  unavailable: "The natural voices could not be prepared, so your browser reads the lines. The first run needs an internet connection.",
};

/** Counts a result number up from zero once, unless motion is reduced. */
/** The facts of a round that has not started, for the lines written before it. */
const openingFacts = (objective: string) => ({ score: 0, hits: 0, misses: 0, streak: 0, livesLeft: null, secondsLeft: null, progress: 0, status: objective.slice(0, 160) });

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

export default function ArcadeApp({ online, account }: { online?: OnlineGame; account?: AccountChip } = {}) {
  const saveKey = online ? `${online.storageKey}:voyage` : ARCADE_SAVE;
  const preferencesKey = online ? `${online.storageKey}:preferences` : ARCADE_PREFS;
  const [save, setSave] = useState<ArcadeSave>(() => { if (online) return online.initialSave; try { return readArcade(localStorage.getItem(saveKey)) || newArcade(); } catch { return newArcade(); } });
  const [prefs, setPrefs] = useState(() => online?.initialPreferences || loadPrefs()), [screen, setScreen] = useState<Screen>("splash");
  // The pixel skin; ?skin=classic shows the earlier painted look, for comparison.
  const [skin] = useState(() => { try { return new URLSearchParams(window.location.search).get("skin") === "classic" ? undefined : "pixel"; } catch { return "pixel"; } });
  const previousPreferences = useRef(prefs);
  const [systemStill, setSystemStill] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const sceneStill = prefs.still || systemStill;
  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setSystemStill(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const [selected, setSelected] = useState<TrialId>("lotus"), [intro, setIntro] = useState(0);
  const [settings, setSettings] = useState(false), [restart, setRestart] = useState(false), [assistance, setAssistance] = useState(false);
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
  // The Oracle's Key: a retrieval-augmented question that opens each encounter.
  const [oracleOn, setOracleOn] = useState(readOracleEnabled);
  const [oracle, setOracle] = useState<OracleState>({ status: "idle", trial: null });
  const [oracleOpen, setOracleOpen] = useState(false);
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
  const medals = trials.reduce((n, t) => n + Object.keys(save.records[t.id].bests).length, 0);
  const rivalOnline = rival.status === "online";
  // The rival's tactic is the game's own choice from the last two attempts: instant, and the same for the same history.
  const tactic = gamePlan(selected, save.records[selected].recent);
  // The model asks the Oracle's question and voices the commentary, so a round needs it to start.
  const canStart = rivalOnline;
  /** Title and note for the disabled start button. */
  const startHold: [string, string] = rival.status === "checking" ? ["Looking for the AI", "One moment"] : ["Connect an AI model", "Open Settings to connect one"];
  const lockedReason = rivalOnline ? "" : rival.status === "checking" ? "Looking for the AI model…" : "Open Settings to connect an AI model.";

  useEffect(() => { const service = new VoyageAudio(); audio.current = service; return () => { service.dispose(); audio.current = null; request.current?.abort(); }; }, []);
  useEffect(() => {
    const box = new VoiceBox(); voice.current = box; box.onSpeaking(setSpeaking); box.onStatus(setVoiceStatus); box.onLoad(setVoiceLoad);
    return () => { box.dispose(); voice.current = null; };
  }, []);
  useEffect(() => { voice.current?.setVolume(voicePrefs.volume); if (!voicePrefs.voice) voice.current?.stop(); try { localStorage.setItem(VOICE_PREFS, JSON.stringify(voicePrefs)); } catch { /* Storage is optional. */ } }, [voicePrefs]);
  useEffect(() => { try { localStorage.setItem(saveKey, JSON.stringify(save)); localStorage.setItem(preferencesKey, JSON.stringify(prefs)); setStorageError(""); } catch { setStorageError("Browser saving is unavailable. Keep this tab open to preserve your voyage."); } }, [save, prefs, saveKey, preferencesKey]);
  useEffect(() => { if (previousPreferences.current !== prefs) { previousPreferences.current = prefs; online?.command({ type: "preferences", preferences: prefs }); } }, [prefs, online]);
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0, behavior: "instant" }); }, [screen]);
  // Development only: lets the screenshot checks reach any screen without playing through.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __farshore?: unknown }).__farshore = {
      go: (next: Screen, trial?: TrialId) => { if (trial) setSelected(trial); setScreen(next); },
      result: (trial: TrialId, won: boolean, practice = false) => {
        const round = createGame(trial, prefs.difficulty, standardPlan(trial), practice, 7);
        setSelected(trial); setResult({ ...round, done: true, won, score: won ? 1240 : 310 } as GameState); setScreen("result");
      },
      settings: (open: boolean) => setSettings(open),
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
  useEffect(() => { if (screen === "map" || screen === "title") setOracleKeys([]); }, [screen]);
  useEffect(() => {
    if (screen !== "brief" || !oracleOn || !rivalOnline || oracleKeys.includes(selected)) return;
    if (oracle.trial !== selected) consultOracle(selected);
  }, [screen, selected, oracleOn, rivalOnline]);
  useEffect(() => () => oracleRequest.current?.abort(), []);
  // Asking the Oracle's status starts its passage index building on the server, ahead of the first briefing.
  useEffect(() => { if (oracleOn && rivalOnline) void fetch("/api/oracle", { cache: "no-store" }).catch(() => {}); }, [oracleOn, rivalOnline]);
  // Outside an encounter the voyage is at sea; while a briefing is read, the encounter's sounds are rendered.
  useEffect(() => {
    if (screen !== "play") { audio.current?.setScene("sea"); audio.current?.setLoops({}); }
    if (screen === "brief") audio.current?.prepare(encounterSounds[selected]);
  }, [screen, selected]);
  // The bard reads the prologue aloud.
  useEffect(() => { if (screen === "intro") speak(prologueSpeech(prologue[intro]), "bard"); return () => voice.current?.stop(); }, [screen, intro]);
  // Lines the game knows ahead of time are fetched while the player reads, so they play at once.
  useEffect(() => { if (voiceStatus === "neural" && voicePrefs.voice && !save.started) prologue.forEach(slide => voice.current?.prime(prologueSpeech(slide), "bard")); }, [voiceStatus, voicePrefs.voice, save.started]);
  useEffect(() => { if (aiState === "ready" && aiTaunt && voicePrefs.voice) voice.current?.prime(aiTaunt, selected); }, [aiState, aiTaunt, selected, voicePrefs.voice]);
  useEffect(() => { if (settings && voicePrefs.voice) voice.current?.prime(TEST_LINE, "bard"); }, [settings, voicePrefs.voice]);
  useEffect(() => {
    if (!settings && !restart && !assistance && !oracleOpen) return;
    if (!oracleOpen) document.querySelector<HTMLButtonElement>(".a-modal button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSettings(false); setRestart(false); setAssistance(false); setOracleOpen(false); }
      if (e.key !== "Tab") return;
      const items = Array.from(document.querySelectorAll<HTMLElement>(".a-modal button, .a-modal input, .a-modal select, .a-modal a, .a-modal summary")).filter(el => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); if (screen === "play") document.querySelector<HTMLButtonElement>(".a-round-overlay button")?.focus(); else heading.current?.focus(); };
  }, [settings, restart, assistance, oracleOpen]);
  const speak = useCallback((text: string, id: VoiceId) => { if (voicePrefsRef.current.voice) voice.current?.say(text, id); }, []);
  const silence = useCallback(() => voice.current?.stop(), []);
  /** Stops any request in flight. "idle" lets the briefing prepare again automatically; "cancelled" waits for the player. */
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
  function openTrial(id: TrialId) { if (!unlocked(save, id)) return; cancelAi(); setSelected(id); setAssistance(false); setResult(null); setScreen("brief"); }
  /** Starts an attempt against the model-planned rival. Without a connected model, nothing starts. */
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
  function continueVoyage() { if (nextTrial) openTrial(nextTrial.id); else navigate("ending"); }
  /**
   * After an encounter, Odysseus crosses the chart to the next island before
   * its briefing. With reduced motion the briefing opens directly.
   */
  function sailTo(from: TrialId, to: TrialId) {
    cancelAi(); setSelected(to); setAssistance(false); setResult(null);
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
   * language model: the guardians on both boards use the strategy the model
   * prepared when one is ready, and the standard patrol otherwise. A race is
   * an exhibition: it never changes the voyage, medals or records.
   */
  function launchRace() {
    wakeAudio();
    const layout = raceGarden === "fresh" ? freshLayout() : RACE_LAYOUTS.find(l => l.id === raceGarden) ?? RACE_LAYOUTS[0];
    const plan = selected === "lotus" ? tactic.plan : standardPlan("lotus");
    setRun({ plan, practice: true, modelPrepared: false, key: ++runKey.current, race: { layout } });
    setScreen("play");
  }
  function leaveRace() { audio.current?.setLoops({}); setScreen("brief"); }
  function launchDemo() { if (!rivalOnline) return; wakeAudio(); cancelAi(); setSelected("lotus"); setRun({ plan: adaptivePlan("lotus"), practice: true, modelPrepared: false, demo: true, key: ++runKey.current }); setScreen("play"); }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (settings || restart || assistance || oracleOpen || (e.target as HTMLElement).closest("input,select,textarea,summary")) return;
      if (screen === "splash" && e.key === "Enter") { e.preventDefault(); navigate("title"); }
      else if (screen === "brief" && e.key === "Enter" && canStart && !(e.target as HTMLElement).closest("button,a")) { e.preventDefault(); launch(); }
      else if (screen === "title" && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        // The menu is a two-column grid; every arrow walks it in reading order.
        const items = [...document.querySelectorAll<HTMLButtonElement>(".od-menu button:not(:disabled)")];
        const index = items.indexOf(document.activeElement as HTMLButtonElement), back = e.key === "ArrowUp" || e.key === "ArrowLeft";
        const next = index < 0 ? back || e.key === "End" ? items.length - 1 : 0 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (back ? -1 : 1) + items.length) % items.length;
        e.preventDefault(); items[next]?.focus();
      } else if (e.key === "Escape" && screen !== "play" && screen !== "title" && screen !== "crossing") navigate("title");
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [screen, settings, restart, assistance, canStart, save, selected, aiState, aiTaunt, rivalOnline]);
  const blocked = settings || restart || assistance || oracleOpen;
  const best = save.records[selected].bests[prefs.difficulty];
  const rivalChip = <div className="fs-rival-chip" data-status={rival.status} role="status">
    <BrainCircuit size={15}/>
    <span><b>{rivalOnline ? "AI online" : rival.status === "checking" ? "Finding the AI" : "AI offline"}</b></span>
    {rival.status === "offline" && <button onClick={() => setSettings(true)}>Settings</button>}
  </div>;
  const voiceToggle = <button className="od-sound fs-voice-toggle" aria-pressed={voicePrefs.voice} onClick={() => setVoicePrefs(v => ({ ...v, voice: !v.voice }))} aria-label={voicePrefs.voice ? "Mute the commentary voice" : "Enable the commentary voice"}>{voicePrefs.voice ? <Mic size={17}/> : <MicOff size={17}/>} Voice</button>;
  /** The account and save status. It opens the same account dialog the site bar used to. */
  const accountChip = account && <button className="fs-account-chip" data-status={account.status} onClick={account.open}><CircleUser size={16}/><span><b>{account.name ?? "Sign in"}</b><small>{account.label}</small></span></button>;

  const rivalPanel = !rivalOnline ? <div className="fs-rival-panel" data-state="offline" aria-live="polite">
    <div className="fs-rival-panel-head"><BrainCircuit size={18}/><div><strong>{rival.status === "checking" ? "Looking for the AI model" : "No AI model connected"}</strong><small>{rival.status === "checking" ? "One moment…" : "It asks the Oracle's question and voices the commentary. Settings shows how to connect one."}</small></div></div>
    {rival.status === "offline" && <div className="fs-rival-actions"><button className="a-btn a-small" onClick={() => setSettings(true)}><Settings size={15}/> Open settings</button><button className="a-btn a-small a-ghost" onClick={() => void checkModel()}><RefreshCw size={15}/> Check again</button></div>}
  </div> : <div className="fs-rival-panel" data-state="ready" aria-live="polite">
    <div className="fs-rival-panel-head"><Portrait tile={trial.portrait} label={trial.character}/><div><strong>{planLabel(selected, tactic.plan)}</strong><small>{trial.character}{trial.character.endsWith("s") ? "’" : "’s"} tactic · chosen by the game</small></div></div>
    <p>{trial.adaptive}</p>
    <p className="fs-rival-why">{tactic.reason}</p>
    {aiState === "ready" && aiTaunt ? <blockquote className="fs-rival-taunt">{skin ? <Typewriter as="p" text={aiTaunt} still={sceneStill}/> : <p>{aiTaunt}</p>}<button className="a-text-btn" onClick={() => speak(aiTaunt, selected)} aria-label={`Hear ${trial.character}`}><Volume2 size={14}/> Hear it</button></blockquote>
      : <p className="fs-rival-writing"><Loader2 size={14} className="fs-spin"/> {trial.character} {trial.character.endsWith("s") ? "are" : "is"} choosing words…</p>}
  </div>;

  return <div className={"a-app od-app fs-app" + (sceneStill ? " a-still" : "") + (prefs.contrast ? " od-contrast" : "")} data-screen={screen} data-skin={skin}>
    {skin && <PixelFilters/>}
    {!sceneStill && (skin ? <PixelTransition key={`px-${screen}-${screen === "intro" ? intro : 0}`} kind={screen === "play" || screen === "crossing" ? "blocks" : "dither"}/> : <div className="fs-curtain" key={`curtain-${screen}-${screen === "intro" ? intro : 0}`} aria-hidden="true"><i/></div>)}
    {screen === "splash" ? <main className="od-splash fs-cinematic" inert={blocked}>
      <div className="od-backdrop fs-kenburns"/><div className="fs-fog" aria-hidden="true"/><div className="od-cinematic-shade"/>{skin ? <PixelAmbience preset="stars" still={sceneStill} strength={prefs.visuals}/> : <div className="od-particles" aria-hidden="true"/>}
      {skin && <WordmarkAssembly target={() => document.querySelector(".od-splash .fs-logo-text")} still={sceneStill}/>}
      <span className="fs-letterbox fs-letterbox-top" aria-hidden="true"/><span className="fs-letterbox fs-letterbox-bottom" aria-hidden="true"/>
      <section className="od-splash-content" ref={heading} tabIndex={-1}><div className="od-title-ornament fs-ornament-draw"><span/><Compass size={34} strokeWidth={1}/><span/></div><h1 className="od-wordmark fs-wordmark-reveal"><FarshoreLogo/><span className="fs-sweep" aria-hidden="true"/></h1><p className="fs-reveal" style={{ "--d": "2.2s" } as CSSProperties}>Eight Trials. One Journey Home.</p><button className="od-enter fs-reveal" style={{ "--d": "2.9s" } as CSSProperties} onClick={() => navigate("title")}>Press Enter <ArrowRight size={17}/></button></section>
    </main> : screen === "title" ? <main className="od-menu-screen fs-cinematic fs-title" inert={blocked}>
      <div className="od-backdrop fs-kenburns fs-kenburns-slow"/><div className="od-menu-shade"/>{skin ? <PixelAmbience preset="stars" still={sceneStill} strength={prefs.visuals} seed={3}/> : <div className="od-particles" aria-hidden="true"/>}
      <div className="od-menu-top"><span/><div className="fs-menu-status">{rivalChip}{voiceToggle}<button className="od-sound" aria-pressed={prefs.sound} onClick={() => void toggleSound()} aria-label={prefs.sound ? "Mute sound" : "Enable sound"}>{prefs.sound ? <Volume2 size={18}/> : <VolumeX size={18}/>} Sound</button>{accountChip}</div></div>
      <div className="fs-menu-temple fs-title-panel"><section className="od-menu-content" ref={heading} tabIndex={-1}><h1 className="od-wordmark"><FarshoreLogo/></h1>
        <nav className="od-menu fs-menu-rich" aria-label="Main menu">
          {save.started
            ? <button className="od-menu-primary" style={{ "--i": 0 } as CSSProperties} onClick={continueVoyage}><Play size={19}/><span><b>Continue</b><small>{nextTrial ? nextTrial.title : "Return to Ithaca"}</small></span><ArrowRight size={19}/></button>
            : <button className="od-menu-primary" style={{ "--i": 0 } as CSSProperties} onClick={newVoyage}><Sparkles size={19}/><span><b>New game</b><small>Set sail from Troy</small></span><ArrowRight size={19}/></button>}
          {save.started && <button style={{ "--i": 1 } as CSSProperties} onClick={() => setRestart(true)}><Sparkles size={17}/><span><b>New game</b></span><ArrowRight size={16}/></button>}
          <button style={{ "--i": 2 } as CSSProperties} data-wide={!save.started || undefined} onClick={() => navigate("map")}><Map size={17}/><span><b>Voyage map</b><small>{medals} {medals === 1 ? "medal" : "medals"}</small></span><ArrowRight size={16}/></button>
          <span className="fs-menu-rule" aria-hidden="true"><i/></span>
          <button style={{ "--i": 3 } as CSSProperties} onClick={() => navigate("howto")}><BookOpen size={17}/><span><b>How to play</b></span><ArrowRight size={16}/></button>
          <button style={{ "--i": 4 } as CSSProperties} onClick={() => navigate("lab")}><FlaskConical size={17}/><span><b>AI Lab</b></span><ArrowRight size={16}/></button>
          <button style={{ "--i": 5 } as CSSProperties} onClick={() => setSettings(true)}><Settings size={17}/><span><b>Settings</b></span><ArrowRight size={16}/></button>
          <button style={{ "--i": 6 } as CSSProperties} onClick={() => navigate("credits")}><Info size={17}/><span><b>Credits</b></span><ArrowRight size={16}/></button>
        </nav>
        <div className="fs-title-track" role="img" aria-label={`${completed} of 8 trials cleared, from Troy to Ithaca`}><span>Troy</span><ol aria-hidden="true">{trials.map(t => <li key={t.id} data-done={save.records[t.id].cleared !== "pending" || undefined}/>)}</ol><span>Ithaca</span><small aria-hidden="true">{completed} / 8 trials cleared</small></div>
      </section></div>
    </main> : screen === "intro" ? <main className="fs-prologue fs-cinematic" data-slide={intro} inert={blocked}>
      <div className="fs-prologue-art fs-kenburns" key={`art-${intro}`}/><div className="fs-prologue-shade"/>{skin ? <PixelAmbience preset="stars" still={sceneStill} strength={prefs.visuals} seed={5}/> : <div className="od-particles" aria-hidden="true"/>}
      <span className="fs-letterbox fs-letterbox-top" aria-hidden="true"/><span className="fs-letterbox fs-letterbox-bottom" aria-hidden="true"/>
      <section className="fs-prologue-content" key={intro} ref={heading} tabIndex={-1} aria-labelledby="fs-prologue-title">
        <span className="fs-prologue-chapter fs-reveal" style={{ "--d": "0.4s" } as CSSProperties}>{prologue[intro].chapter}</span>
        <h1 id="fs-prologue-title">{prologue[intro].lines.map((line, i) => <span key={line} className="fs-rise" style={{ "--d": `${0.8 + i * 0.55}s` } as CSSProperties}>{line}</span>)}</h1>
        {skin ? <Typewriter as="p" text={prologue[intro].text} still={sceneStill} delay={1500}/> : <p className="fs-reveal" style={{ "--d": "2s" } as CSSProperties}>{prologue[intro].text}</p>}
        {intro === 0 ? <div className="fs-prologue-cast fs-reveal" style={{ "--d": "2.5s" } as CSSProperties}><Portrait tile={0} label="Odysseus" large/><div><strong>Odysseus</strong></div><Portrait tile={3} label="Penelope"/><div><strong>Penelope</strong></div></div>
          : <ol className="fs-prologue-route" aria-label="The eight trials">{trials.map((t, i) => <li key={t.id} className="fs-rise" style={{ "--d": `${2.1 + i * 0.12}s` } as CSSProperties}><TrialArtwork id={t.id}/><span>{t.title}</span></li>)}</ol>}
        <div className="fs-prologue-actions fs-reveal" style={{ "--d": "2.9s" } as CSSProperties}>
          <button className="a-btn a-primary fs-rich" onClick={() => intro === 0 ? setIntro(1) : openTrial("lotus")}><span><b>{prologue[intro].next}</b><small>{prologue[intro].detail}</small></span><ArrowRight size={17}/></button>
          <button className="a-btn a-ghost fs-rich" onClick={() => navigate("map")}><Map size={16}/><span><b>Skip prologue</b></span></button>
        </div>
        <div className="fs-prologue-pips" role="img" aria-label={`Part ${intro + 1} of ${prologue.length}`}>{prologue.map((_, i) => <i key={i} data-on={i <= intro || undefined}/>)}</div>
      </section>
      <div className="od-cinematic-footer"><span/><span>Esc returns to the menu</span></div>
    </main> : screen === "crossing" && crossing ? <VoyageCrossing
      key={`${crossing.from}>${crossing.to}`}
      save={save} from={crossing.from} to={crossing.to} preview={crossing.preview}
      rival={!rivalOnline ? "waiting" : aiState === "ready" ? "ready" : "studying"}
      headingRef={heading}
      onSound={(name, gain, pan) => audio.current?.play([{ sound: name, gain, pan }])}
      onSpeak={text => speak(text, "bard")}
      onSilence={silence}
      onDone={landed}
    /> : <>
      <header className="a-header" inert={blocked}><button className="a-brand" onClick={() => navigate("title")} disabled={screen === "play"}><Compass size={27} strokeWidth={1.2}/><span><FarshoreLogo compact/></span></button><nav aria-label="Game navigation">{rivalChip}{accountChip}{screen !== "map" && <button className="a-btn a-small a-ghost" disabled={screen === "play"} onClick={() => navigate("map")}><Map size={16}/> Voyage map</button>}<button className="a-btn a-small a-ghost" disabled={screen === "play"} onClick={() => setSettings(true)}><Settings size={16}/> Settings</button></nav></header>
      <main className="a-main" inert={blocked} ref={heading} tabIndex={-1}>
        {screen === "map" && <TrialSelection save={save} selected={selected} difficulty={prefs.difficulty} still={sceneStill} onSelect={setSelected} onOpen={openTrial} onDifficulty={setDifficulty} onBegin={newVoyage}/>}
        {screen === "brief" && <section className="a-brief"><div className="a-brief-scene"><TrialArtwork id={selected} className="fs-brief-art"/>{skin && <PixelAmbience preset={AMBIENCE[selected]} still={sceneStill} strength={prefs.visuals} seed={selected.length}/>}<div className="a-brief-shade"/><div className="a-character-intro"><div className="od-brief-icon"><TrialGlyph id={selected} size={42}/></div><div><span className="a-eyebrow">Trial {trials.findIndex(t => t.id === selected) + 1} of 8 · {trial.kind}</span><h1>{trial.title}</h1>{skin ? <Typewriter as="p" key={selected} text={trial.story} still={sceneStill} delay={500} cps={60}/> : <p>{trial.story}</p>}</div></div></div><div className="a-brief-body"><div className="a-brief-instructions"><span className="a-eyebrow">Objective</span><h2>{challengeObjective(selected, prefs.difficulty)}</h2><div className="od-control-guide"><BookOpen size={21}/><div><strong>Controls</strong><p>{trial.controls}</p></div></div><details className="a-source"><summary>In Homer&apos;s Odyssey</summary>{trial.homer !== trial.story && <p><strong>Book {trial.book}:</strong> {trial.homer}</p>}<p>{trial.adaptation}</p><a href={`https://www.gutenberg.org/files/1727/1727-h/1727-h.htm#chap${trial.book === "IX" ? "09" : trial.book === "X" ? "10" : trial.book === "XII" ? "12" : trial.book === "V" ? "05" : "21"}`} target="_blank" rel="noreferrer">Read the episode</a></details></div><div className="a-brief-options"><label className="a-field">Difficulty<select value={prefs.difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}><option value="easy">Easy</option><option value="normal">Medium</option><option value="hard">Hard</option></select></label>{rivalPanel}{best && <span className="od-personal-best"><Trophy size={16}/> {best.medal} · Best {best.score} · {Math.round(best.timeMs / 1000)}s</span>}<button className="a-btn a-primary fs-rich fs-start" disabled={!canStart} onClick={() => launch()}><Swords size={19}/><span><b>{canStart ? `Face ${trial.character}` : startHold[0]}</b><small>{canStart ? (oracleOn && !oracleKeys.includes(selected) ? "The Oracle asks first" : "Counts toward your voyage") : lockedReason || startHold[1]}</small></span>{canStart && <kbd>Enter</kbd>}</button><button className="a-btn fs-rich" disabled={!canStart} onClick={() => launch(true)}><GraduationCap size={18}/><span><b>Practice</b><small>Not saved</small></span></button>{selected === "lotus" && <div className="fs-race-brief"><span className="a-eyebrow">Rescue race</span><p>Race a rival trained by reinforcement learning on a second board: the same garden, one clock.</p><label className="a-field">Garden<select value={raceGarden} onChange={e => setRaceGarden(e.target.value)}>{RACE_LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}<option value="fresh">A new random garden</option></select></label><button className="a-btn fs-rich" onClick={launchRace}><Users size={18}/><span><b>Race the trained AI</b><small>Exhibition · not saved</small></span></button></div>}</div></div></section>}
        {screen === "play" && run && <p className="a-caption od-stage-note">The encounter is running in the full-screen stage. Press Escape to pause.</p>}
        {screen === "result" && result && <section className={`a-result a-paper od-result fs-rich-result ${result.won ? "won" : "lost"}`}><ResultFrieze state={result}/><span className="a-eyebrow">Trial {trials.findIndex(t => t.id === selected) + 1} · {trial.title}</span><div className={`od-medal fs-medal-reveal ${result.practice ? "practice" : result.won ? medalFor(gameSummary(result)) : "failed"}`}><span className="fs-medal-rays" aria-hidden="true"/><Trophy size={49} strokeWidth={1}/><span>{result.practice ? "Practice" : result.won ? `${medalFor(gameSummary(result))} medal` : "No medal"}</span></div><h1>{result.practice ? run?.demo ? "A lesson in cunning" : "Practice complete" : result.won ? "Victory" : "Trial failed"}</h1><p>{result.practice ? "Nothing was saved. Take what you learned into the trial." : result.won ? trial.success : result.feedback}</p><div className="a-result-stats"><span><strong><CountUp value={result.score} still={sceneStill}/></strong>{selected === "bow" ? "axes" : selected === "circe" ? "brew points" : "score"}</span><span><strong><CountUp value={result.elapsed} still={sceneStill} format={clock}/></strong>time</span><span><strong>{difficultyNames[result.difficulty]}</strong>difficulty</span></div><PerformanceSeals state={result}/><div className="fs-result-side"><RoundReport state={result} log={roundLog} recap={recap} bardName={voices.bard.name} rivalName={trial.character} tactic={run && !run.lab && !run.demo ? { label: planLabel(selected, run.plan), reason: run.tacticReason ?? "" } : null} oracle={oracleLog[selected] ?? []} oracleOn={oracleOn} models={{ commentary: rival.commentary, oracle: rival.oracle ?? rival.model }} onSpeak={(text, speaker) => speak(text, speaker === "bard" ? "bard" : selected)}/></div>{(selected === "bow" || selected === "circe" || !result.practice) && <p className="a-caption">{selected === "bow" || selected === "circe" ? `Odysseus ${result.score} · ${trial.character} ${result.rivalScore}` : ""}{selected !== "bow" && selected !== "circe" ? "" : !result.practice ? " · " : ""}{!result.practice && `Personal best ${save.records[selected].bests[result.difficulty]?.score ?? "—"}`}</p>}<div className="a-actions">{!result.practice && result.won && <button className="a-btn a-primary fs-rich" onClick={() => completed === trials.length || !nextTrial ? navigate("ending") : sailTo(selected, nextTrial.id)}><span><b>{completed === trials.length ? "Return to Ithaca" : "Next trial"}</b>{completed !== trials.length && nextTrial && <small>{nextTrial.title}</small>}</span><ArrowRight size={17}/></button>}<button className={`a-btn fs-rich ${!result.won || result.practice ? "a-primary" : ""}`} disabled={!rivalOnline || !run} onClick={() => save.started ? run && launch(result.practice, run.originalCave, run) : newVoyage()}><RotateCcw size={16}/><span><b>{!save.started ? "New game" : result.won ? "Replay" : "Retry"}</b>{!rivalOnline && <small>Connect an AI model first</small>}</span></button><button className="a-btn a-ghost fs-rich" onClick={() => navigate("brief")}><SlidersHorizontal size={16}/><span><b>Briefing</b><small>Difficulty and tactic</small></span></button><button className="a-btn a-ghost fs-rich" onClick={() => navigate("map")}><Map size={16}/><span><b>Voyage map</b></span></button></div>{!result.practice && !result.won && <details className="od-accessibility-passage"><summary>Accessibility: request Athena's help</summary><p>An assisted passage is recorded separately and earns no medal.</p><button className="a-text-btn" onClick={() => setAssistance(true)}>Request an assisted passage</button></details>}</section>}
        {screen === "ending" && <section className="a-ending a-paper">{skin && <PixelAmbience preset="fireflies" still={sceneStill} strength={prefs.visuals}/>}<span className="a-eyebrow">Ithaca, at last</span><div className="a-family"><Portrait tile={0} label="Odysseus" large/><Portrait tile={3} label="Penelope" large/><Portrait tile={4} label="Telemachus" large/></div><h1>Home is more than a shore.</h1><p>The long crossing is behind you. Penelope recognizes the man who returned, and Telemachus stands beside his father. For this moment, the sea can wait.</p><div className="a-ending-report">{trials.map(t => <div key={t.id}><span>{t.title}</span><strong>{save.records[t.id].cleared === "assisted" ? "Assisted" : save.records[t.id].bests[prefs.difficulty]?.medal || "Cleared"}</strong></div>)}</div><div className="a-actions"><button className="a-btn a-primary" onClick={() => navigate("map")}>Voyage map</button><button className="a-btn" onClick={() => setRestart(true)}>New game</button></div></section>}
        {screen === "lab" && <AILabMode settings={lab} runs={labRuns} onSettings={setLab} onLaunch={launchLab} onClearRuns={() => setLabRuns([])} onBack={() => navigate("title")} locked={lockedReason || undefined}/>}
        {screen === "howto" && <section className="od-guide"><span className="a-eyebrow">How to play</span><h1>Every trial has its own rules.</h1><div className="od-guide-basics"><div><Compass size={26}/><h2>Follow the voyage</h2><p>Play the trials in any order. Continue opens the first unfinished one. Replay any trial for a better medal.</p></div><div><BrainCircuit size={26}/><h2>Face a thinking rival</h2><p>Before each round your AI model reads your recent attempts and picks the rival&apos;s strategy. The game still owns every collision, score and unlock.</p></div><div><Trophy size={26}/><h2>Earn your legend</h2><p>Win with no hits or misses for gold, up to two for silver, or finish for bronze. Best scores, times, and medals are saved for each difficulty.</p></div><div><Play size={26}/><h2>Take your time</h2><p>Escape pauses the game and the voices. F toggles fullscreen and F3 shows the rival&apos;s reasoning.</p></div></div><div className="od-control-list">{trials.map((t, i) => <article key={t.id}><span className="od-guide-number">0{i + 1}</span><TrialGlyph id={t.id}/><div><h2>{t.title}<small>{t.kind}</small></h2><p>{t.controls}</p></div></article>)}</div><div className="a-actions"><button className="a-btn a-primary fs-rich" disabled={!rivalOnline} onClick={launchDemo}><Play size={17}/><span><b>Watch a rescue</b><small>{rivalOnline ? "Demonstration · not saved" : "Connect your AI rival first"}</small></span></button><button className="a-btn fs-rich" onClick={() => navigate("lab")}><FlaskConical size={17}/><span><b>AI Lab</b></span></button><button className="a-btn a-ghost" onClick={() => navigate("title")}><ArrowLeft size={17}/> Main menu</button></div></section>}
        {screen === "credits" && <section className="a-paper od-credits"><span className="a-eyebrow">Credits</span><Compass size={50} strokeWidth={1}/><h1>A story three thousand years in the making.</h1><p>Inspired by Homer's <em>The Odyssey</em>. An independent FARSHORE arcade adaptation with original rules and imaginative mythological settings.</p><dl><div><dt>PROJECT</dt><dd>FARSHORE / Bibek Pathak</dd></div><div><dt>ART & SOUND</dt><dd>Original art, redrawn as pixel art in one palette / Locally synthesized maritime music</dd></div><div><dt>AI RIVAL</dt><dd>Planned by your connected model / Voiced by Kokoro-82M</dd></div><div><dt>TYPE & ICONS</dt><dd>Pixelify Sans, Press Start 2P and VT323 (SIL OFL) / Lucide (ISC)</dd></div><div><dt>BUILT WITH</dt><dd>React / TypeScript / Next.js / Canvas & SVG</dd></div></dl><p className="a-caption">Lotus Guardians, competitive potion brewing, wind gates, and repeated arcade contests are fictional game devices.</p><div className="a-actions"><a className="a-btn" href="/story-sources.md" target="_blank" rel="noreferrer">Story & sources</a><button className="a-btn a-primary" onClick={() => navigate("title")}>Main menu</button></div></section>}
      </main><footer className="a-footer" inert={blocked}><span>{completed} / 8 trials cleared</span><span/></footer>
    </>}
    {screen === "play" && run?.race && <LotusRaceRound key={run.key} difficulty={prefs.difficulty} plan={run.plan} layout={run.race.layout} onLeave={leaveRace} onAudio={frame => audio.current?.frame(frame)}/>}
    {screen === "play" && run && !run.race && <ArcadeRound key={run.key} id={selected} difficulty={prefs.difficulty} plan={run.plan} practice={run.practice} seed={run.seed ?? 4200 + run.key * 19 + save.records[selected].attempts} still={sceneStill} shake={prefs.shake && !sceneStill ? 1 : 0} effects={sceneStill ? 0 : prefs.visuals} originalCave={run.originalCave} demo={run.demo} modelPrepared={run.modelPrepared} taunt={run.taunt} opening={run.opening} commentary={rivalOnline && voicePrefs.commentary} onSpeak={speak} onSilence={silence} onSettings={() => setSettings(true)} onAudio={frame => audio.current?.frame(frame)} onFinish={finish} onLeave={() => navigate(run.lab ? "lab" : "map")} labOverlay={run.lab ? { showPrediction: lab.showPrediction, showHistory: lab.showHistory } : undefined}/>}
    {(storageError || audioError) && <div className="a-notice" role="status">{storageError || audioError}</div>}
    {settings && <div className="a-modal-backdrop"><section className="a-settings a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-settings-title"><div className="a-modal-head"><h2 id="a-settings-title">Settings</h2><button className="a-btn a-small" onClick={() => setSettings(false)}>Close</button></div>
      <div className="fs-settings-cols"><div>
      <div className="a-connection fs-settings-rival" data-status={rival.status}><strong><BrainCircuit size={16}/> AI model</strong><p role="status">{rival.message}</p>{rivalOnline && <dl className="fs-model-facts"><div><dt>Voices the commentary</dt><dd>{rival.commentary}</dd></div>{oracleOn && <><div><dt>Writes the Oracle&apos;s questions</dt><dd>{rival.oracle ?? rival.model}</dd></div><div><dt>Searches the Odyssey</dt><dd>{rival.embedder ? `${rival.embedder} + BM25` : "BM25 keywords (no embedding service)"}</dd></div></>}<div><dt>Voice</dt><dd>{voiceLabels[voiceStatus]}</dd></div></dl>}<button className="a-btn a-small fs-rich" disabled={rival.status === "checking"} onClick={() => void checkModel()}><RefreshCw size={15}/><span><b>Check connection</b><small>Every trial needs a model</small></span></button>
        <details><summary>How to connect a model</summary><ol className="fs-connect-steps"><li><b>This computer</b> Install Ollama, run <code>ollama pull qwen3:4b-instruct</code>, then set <code>FARSHORE_MODEL_URL=http://127.0.0.1:11434/v1/chat/completions</code> and <code>FARSHORE_MODEL_NAME=qwen3:4b-instruct</code> in <code>.env</code> and restart the game server.</li><li><b>Google Colab</b> Open <code>colab/farshore_model_server.ipynb</code>, choose a T4 GPU runtime, run every cell, and paste the printed <code>FARSHORE_*</code> lines into <code>.env</code>. It also starts a neural voice.</li><li><b>Online accounts</b> Add an OpenAI, Groq or OpenRouter connection under Account.</li></ol></details></div>
      <div className="a-connection"><strong><Feather size={16}/> Commentary & voice</strong>
        <p className="a-caption" role="status">{voiceNotes[voiceStatus]}{voiceStatus === "loading" && voiceLoad.progress > 0 && voiceLoad.progress < 1 ? ` ${Math.round(voiceLoad.progress * 100)}%${voiceLoad.sizeMb ? ` of ${voiceLoad.sizeMb} MB` : ""}.` : ""}</p>
        <button className="a-setting-toggle" aria-pressed={voicePrefs.commentary} onClick={() => setVoicePrefs(v => ({ ...v, commentary: !v.commentary }))}><span>Live commentary<small>The bard and your rival react as you play.</small></span><strong>{voicePrefs.commentary ? "On" : "Off"}</strong></button>
        <button className="a-setting-toggle" aria-pressed={voicePrefs.voice} onClick={() => setVoicePrefs(v => ({ ...v, voice: !v.voice }))}><span>Spoken voice<small>Reads the commentary aloud.</small></span><strong>{voicePrefs.voice ? "On" : "Off"}</strong></button>
        <label className="a-field fs-volume">Voice volume <input type="range" min={0} max={1} step={0.05} value={voicePrefs.volume} onChange={e => setVoicePrefs(v => ({ ...v, volume: Number(e.target.value) }))}/><output>{Math.round(voicePrefs.volume * 100)}%</output></label>
        <button className="a-btn a-small" disabled={!voicePrefs.voice} onClick={() => speak(TEST_LINE, "bard")}><Volume2 size={15}/> Test the bard&apos;s voice</button>
      </div>
      </div><div>
      <button className="a-setting-toggle" aria-pressed={prefs.sound} onClick={() => void toggleSound()}><span>Music & sounds<small>Every cue is also shown on screen.</small></span><strong>{prefs.sound ? "On" : "Off"}</strong></button><OdysseyPreferences preferences={prefs} onChange={setPrefs}/><button className="a-setting-toggle" aria-pressed={prefs.still} onClick={() => setPrefs(p => ({ ...p, still: !p.still }))}><span>Reduced motion<small>Stops decorative motion. Gameplay stays live.</small></span><strong>{prefs.still ? "On" : "Off"}</strong></button><button className="a-setting-toggle" aria-pressed={oracleOn} onClick={() => setOracleOn(v => { writeOracleEnabled(!v); return !v; })}><span>The Oracle&apos;s key<small>Answer a question from Homer&apos;s text before each trial.</small></span><strong>{oracleOn ? "On" : "Off"}</strong></button>{screen !== "play" && <div className="a-connection"><strong>Showcase</strong><p className="a-caption">Watch the crossing between two trials. Your voyage is unchanged.{sceneStill ? " Turn off Reduced motion to watch it." : ""}</p><button className="a-btn a-small" disabled={sceneStill} onClick={previewCrossing}>Preview a crossing</button></div>}</div></div></section></div>}
    {oracleOpen && <OracleKey trialTitle={trial.title} state={oracle} onAnswer={(item, picked) => setOracleLog(log => ({ ...log, [item.trialId]: [...(log[item.trialId] ?? []), {
      trial: item.trialId, question: item.question, picked: item.options[picked], answer: item.options[item.answer], correct: picked === item.answer,
      evidence: item.evidence, ref: item.source.kind === "odyssey" ? `Homer, Odyssey, ${item.source.ref}` : item.source.ref,
      model: item.generation.model, ms: item.generation.ms, retrieval: item.retrieval.mode === "hybrid" ? `${item.retrieval.embedder} meaning search with BM25 keywords` : "BM25 keyword search", mock: !!item.mock,
    }].slice(-3) }))} onSolved={() => setOracleKeys(keys => keys.includes(selected) ? keys : [...keys, selected])} onEnter={() => launch()} onAgain={() => consultOracle(selected)} onClose={closeOracle}/>}
    {restart && <div className="a-modal-backdrop"><section className="a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-restart-title"><h2 id="a-restart-title">Start a new game?</h2><p>This clears your voyage, best scores and medals.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setRestart(false)}>Keep this voyage</button><button className="a-btn a-primary" onClick={newVoyage}>New game</button></div></section></div>}
    {assistance && <div className="a-modal-backdrop"><section className="a-modal a-paper" role="dialog" aria-modal="true" aria-labelledby="a-assist-title"><h2 id="a-assist-title">A little help from Athena.</h2><p>Your voyage marks this trial Assisted, with no medal or score. You can replay it later.</p><div className="a-actions"><button autoFocus className="a-btn" onClick={() => setAssistance(false)}>Keep trying</button><button className="a-btn a-primary" onClick={useAssistance}>Accept Athena's help</button></div></section></div>}
  </div>;
}
