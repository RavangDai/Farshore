"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Compass,
  Flag,
  HelpCircle,
  Hourglass,
  Mic,
  MicOff,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  advance,
  applyDecision,
  encounters,
  firstGame,
  formatTime,
  newGame,
  validSave,
  type Decision,
  type Game,
} from "@/lib/game";
import { cast, prologue, sceneArt } from "@/lib/cast";
import { SpeechBubble } from "@/components/speech-bubble";
import { VoyageAudio, musicMood, type AudioCue } from "@/lib/voyage-audio";
import { DictationSession, dictationIssue, type DictationState, type DictationIssue, type SpeechRecognition as Recognition } from "@/lib/dictation";
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
type Modal =
  | "pause"
  | "cast"
  | "log"
  | "map"
  | "help"
  | "settings"
  | "restart"
  | null;
const SAVE = "farshore-voyage-v2";
function Portrait({ id, className = "" }: { id: number; className?: string }) {
  return (
    <div
      role="img"
      aria-label={cast[id].name}
      className={`portrait ${className}`}
      style={{
        backgroundPosition: `${(id % 5) * 25}% ${(Math.floor(id / 5) * 100) / 3}%`,
      }}
    />
  );
}
function Words({ text, instant = false }: { text: string; instant?: boolean }) {
  const [length, setLength] = useState(0);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (instant) {
      setLength(text.length);
      setRevealed(true);
      return;
    }
    if (revealed) return;
    let n = 0;
    const timer = setInterval(() => {
      n += 3;
      setLength(n);
      if (n >= text.length) clearInterval(timer);
    }, 22);
    return () => clearInterval(timer);
  }, [text, instant, revealed]);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {revealed || instant ? text : text.slice(0, length)}
        {!revealed && !instant && length < text.length && <span className="type-cursor">▌</span>}
      </span>
      {!revealed && !instant && length < text.length && <button className="reveal-text intro-reveal" onClick={() => setRevealed(true)}>Show full text</button>}
    </>
  );
}
export default function Home() {
  const [game, setGame] = useState<Game>(firstGame),
    [ready, setReady] = useState(false),
    [screen, setScreen] = useState<"title" | "intro" | "play">("title"),
    [intro, setIntro] = useState(0),
    [hasSave, setHasSave] = useState(false),
    [advice, setAdvice] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [modal, setModal] = useState<Modal>(null),
    [selected, setSelected] = useState(0),
    [voice, setVoice] = useState(false),
    [sound, setSound] = useState(false),
    [musicVolume, setMusicVolume] = useState(.35),
    [effectsVolume, setEffectsVolume] = useState(.55),
    [instantText, setInstantText] = useState(false),
    [reduceMotion, setReduceMotion] = useState(false),
    [systemReducedMotion, setSystemReducedMotion] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [pageHidden, setPageHidden] = useState(false),
    [keyboardInput, setKeyboardInput] = useState(false),
    [audioError, setAudioError] = useState(""),
    [dictationState, setDictationState] = useState<DictationState>("idle"),
    [voiceIssue, setVoiceIssue] = useState<DictationIssue | null>(null),
    [micAvailable, setMicAvailable] = useState(false),
    [aiAvailable, setAiAvailable] = useState(false),
    [mode, setMode] = useState<"story" | "ai">("story"),
    [saveError, setSaveError] = useState(false);
  const lock = useRef(false),
    recognition = useRef<DictationSession | null>(null),
    brave = useRef(false),
    inputRef = useRef<HTMLTextAreaElement>(null),
    sceneRef = useRef<HTMLElement>(null),
    resultRef = useRef<HTMLDivElement>(null),
    audio = useRef<VoyageAudio | null>(null),
    gameRef = useRef(game);
  gameRef.current = game;
  const encounter =
      encounters.find((e) => e.id === game.route[game.index]) || encounters[0],
    current = game.log[game.index],
    won = game.finished && game.months < 240,
    scene = sceneArt[encounter.id],
    story = prologue[intro],
    reducedMotion = reduceMotion || systemReducedMotion,
    mood = musicMood(screen, encounter.id, game.finished, won),
    listening = dictationState !== "idle";
  const chime = useCallback(
    (cue: AudioCue = "sail") => {
      audio.current?.cue(cue);
    },
    [],
  );
  function toggleAudio() {
    if (sound) { setSound(false); return; }
    void audio.current?.unlock().then(() => {
      setSound(true);
      setAudioError("");
    }).catch(() => setAudioError("Audio could not start. Try enabling it again."));
  }
  useEffect(() => {
    audio.current = new VoyageAudio();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setSystemReducedMotion(preference.matches);
    const visibility = () => {
      setPageHidden(document.hidden);
      if (document.hidden) {
        recognition.current?.cancel();
        window.speechSynthesis?.cancel();
        setSpeaking(false);
        setDictationState("idle");
      }
    };
    const keyboard = () => setKeyboardInput(true);
    const pointer = () => setKeyboardInput(false);
    motion();
    visibility();
    preference.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      preference.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointer, true);
      audio.current?.dispose();
    };
  }, []);
  useEffect(() => {
    audio.current?.update({ enabled: sound, music: musicVolume, effects: effectsVolume, ducked: speaking || modal === "pause", quiet: listening || pageHidden, mood });
  }, [sound, musicVolume, effectsVolume, speaking, listening, pageHidden, mood, modal]);
  useEffect(() => {
    if (!sound) return;
    const unlock = () => {
      void audio.current?.unlock().catch(() => setAudioError("Audio could not start. Try enabling it again."));
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [sound]);
  useEffect(() => {
    if (modal) recognition.current?.cancel();
  }, [modal]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE);
      if (raw) {
        const saved = JSON.parse(raw);
        if (validSave(saved)) {
          setGame(saved);
          setHasSave(true);
        }
      }
      const prefs = JSON.parse(
        localStorage.getItem("farshore-preferences") || "{}",
      );
      setSound(prefs.sound === true);
      setVoice(prefs.voice === true);
      if (typeof prefs.musicVolume === "number" && Number.isFinite(prefs.musicVolume)) setMusicVolume(Math.max(0, Math.min(1, prefs.musicVolume)));
      if (typeof prefs.effectsVolume === "number" && Number.isFinite(prefs.effectsVolume)) setEffectsVolume(Math.max(0, Math.min(1, prefs.effectsVolume)));
      setInstantText(prefs.instantText === true);
      setReduceMotion(prefs.reduceMotion === true);
    } catch {}
    setReady(true);
    const browser = navigator as Navigator & { brave?: { isBrave: () => Promise<boolean> } };
    void browser.brave?.isBrave().then((value) => { brave.current = value; }).catch(() => {});
    setMicAvailable(
      !!(
        (window as SpeechWindow).SpeechRecognition ||
        (window as SpeechWindow).webkitSpeechRecognition
      ),
    );
    fetch("/api/turn")
      .then((r) => r.json() as Promise<{ aiAvailable: boolean }>)
      .then((d) => setAiAvailable(d.aiAvailable === true))
      .catch(() => {});
    return () => {
      recognition.current?.cancel();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    if (ready && hasSave)
      try {
        localStorage.setItem(SAVE, JSON.stringify(game));
        setSaveError(false);
      } catch {
        setSaveError(true);
      }
  }, [game, ready, hasSave]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          "farshore-preferences",
          JSON.stringify({ sound, voice, musicVolume, effectsVolume, instantText, reduceMotion }),
        );
      } catch {}
  }, [sound, voice, musicVolume, effectsVolume, instantText, reduceMotion, ready]);
  function begin() {
    recognition.current?.cancel();
    setVoiceIssue(null);
    chime();
    setGame(newGame());
    setHasSave(true);
    setAdvice("");
    setError("");
    setIntro(0);
    setScreen("intro");
    setModal(null);
  }
  function nextIntro() {
    chime();
    if (intro < prologue.length - 1) setIntro((i) => i + 1);
    else setScreen("play");
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (modal || e.defaultPrevented || e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.closest("button,a,input,textarea,select")) return;
      if (e.key === "Enter" && ready) {
        if (screen === "title") {
          e.preventDefault();
          if (hasSave) setScreen("play");
          else begin();
        } else if (screen === "intro") {
          e.preventDefault();
          nextIntro();
        }
      }
      if (e.key === "Escape" && screen === "play") {
        e.preventDefault();
        setModal("pause");
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const submit = useCallback(
    async (text = advice) => {
      if (recognition.current) {
        setVoiceIssue({ title: "Finish dictating first", detail: "Stop dictation and review the transcript before sending your counsel." });
        return { error: "Review the transcript before sending." };
      }
      if (
        lock.current ||
        gameRef.current.finished ||
        gameRef.current.log.length > gameRef.current.index
      )
        return { error: "Finish the current decision first." };
      const trimmed = text.trim();
      if (trimmed.length < 3 || trimmed.length > 800) {
        setError("Write between 3 and 800 characters.");
        return { error: "Invalid advice length." };
      }
      lock.current = true;
      setBusy(true);
      setError("");
      setVoiceIssue(null);
      chime("send");
      try {
        const active = gameRef.current,
          e = encounters.find((e) => e.id === active.route[active.index])!;
        const r = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encounterId: e.id,
            advice: trimmed,
            trust: active.trust,
            mode,
          }),
          signal: AbortSignal.timeout(30000),
        });
        const d = (await r.json()) as Decision & { error?: string };
        if (!r.ok) throw new Error(d.error || "The sea is quiet. Try again.");
        const updated = applyDecision(active, e, trimmed, d);
        gameRef.current = updated;
        setGame(updated);
        setAdvice("");
        chime(d.safeChoice ? "reply" : "costly");
        if (voice && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(d.reply);
          u.rate = 0.88;
          u.pitch = 0.85;
          setSpeaking(true);
          u.onend = u.onerror = () => setSpeaking(false);
          window.speechSynthesis.speak(u);
        }
        setTimeout(() => resultRef.current?.focus(), 50);
        return { decision: d, months: updated.months, trust: updated.trust };
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : "Unable to send. Your advice is still here.";
        setError(message);
        return { error: message };
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [advice, mode, voice, chime],
  );
  function next() {
    if (lock.current) return;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    chime();
    setGame((g) => advance(g));
    setError("");
    setVoiceIssue(null);
    setAdvice("");
    requestAnimationFrame(() => {
      sceneRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }
  function microphone() {
    if (recognition.current) {
      if (dictationState === "starting") recognition.current.cancel();
      else recognition.current.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    const C =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!C) { setVoiceIssue(dictationIssue("service-not-allowed")); return; }
    setVoiceIssue(null);
    try {
      const session = new DictationSession(new C(), {
        onState: (state) => {
          setDictationState(state);
          if (state === "idle" && recognition.current === session) recognition.current = null;
        },
        onTranscript: (text) => {
          setAdvice((previous) => (previous + " " + text).trim().slice(0, 800));
          setVoiceIssue(null);
          setError("");
        },
        onError: (code) => setVoiceIssue(dictationIssue(code, brave.current)),
      });
      recognition.current = session;
      session.start();
    } catch {
      recognition.current?.cancel();
      setVoiceIssue(dictationIssue("start-failed"));
    }
  }
  function returnTitle() {
    recognition.current?.cancel();
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setScreen("title");
    setModal(null);
  }
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: unknown,
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const entries = [
      {
        name: "read_farshore_voyage",
        description:
          "Read the current encounter, journey time, trust, and latest decision.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => ({
          game: gameRef.current,
          encounter: encounters.find(
            (e) => e.id === gameRef.current.route[gameRef.current.index],
          ),
        }),
      },
      {
        name: "advise_odysseus",
        description:
          "Send advice to Odysseus for the current encounter. Commits his decision and advances time.",
        inputSchema: {
          type: "object",
          properties: {
            advice: { type: "string", minLength: 3, maxLength: 800 },
          },
          required: ["advice"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input: unknown) => {
          if (
            !input ||
            typeof input !== "object" ||
            typeof (input as { advice?: unknown }).advice !== "string"
          )
            throw new Error("Advice must be text.");
          return submitRef.current((input as { advice: string }).advice);
        },
      },
    ];
    for (const tool of entries) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
  const iconSound = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={sound ? "Mute all audio" : "Enable music and sounds"}
      aria-pressed={sound}
      title={sound ? "Mute all audio" : "Enable music and sounds"}
      onClick={toggleAudio}
    >
      {sound ? <Volume2 /> : <VolumeX />}
    </Button>
  );
  return (
    <main className={`game-shell screen-${screen} ${reducedMotion ? "reduce-motion" : ""}`} data-input={keyboardInput ? "keyboard" : "pointer"}>
      <div className="scanlines" aria-hidden="true" />
      {screen === "title" ? (
        <section className="title-screen" aria-label="Farshore title screen">
          <div className="title-landscape" />
          <div className="title-vignette" />
          <header className="title-top">
            <span>BIBEK PATHAK PRESENTS</span>
            <div>
              {iconSound}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Game settings"
                onClick={() => setModal("settings")}
              >
                <Settings2 />
              </Button>
            </div>
          </header>
          <div className="title-center">
            <p className="pixel overline">AN ODYSSEY OF YOUR OWN</p>
            <h1>FARSHORE</h1>
            <p className="title-subtitle">
              One king. A thousand wrong turns.
              <br />
              Your words are his way home.
            </p>
            <div className="title-menu">
              {hasSave ? (
                <>
                  <Button
                    className="pixel-button primary start-button"
                    disabled={!ready}
                    onClick={() => {
                      chime();
                      setScreen("play");
                    }}
                  >
                    <Play size={17} />
                    {game.finished ? "JOURNEY REPORT" : "CONTINUE VOYAGE"}
                  </Button>
                  <button
                    className="menu-text"
                    onClick={() => setModal("restart")}
                  >
                    NEW VOYAGE
                  </button>
                </>
              ) : (
                <>
                  <p className="press-start pixel">PRESS START</p>
                  <Button
                    className="pixel-button primary start-button"
                    disabled={!ready}
                    onClick={begin}
                  >
                    <Play size={17} />
                    {ready ? "BEGIN VOYAGE" : "LOADING"}
                  </Button>
                </>
              )}
              <div className="sub-menu">
                <button onClick={() => setModal("cast")}>CHARACTERS</button>
                <span>·</span>
                <button onClick={() => setModal("help")}>HOW TO PLAY</button>
              </div>
              <button className={`audio-invitation ${sound ? "audio-on" : ""}`} onClick={toggleAudio} aria-pressed={sound}>
                <Music2 size={16} />
                {sound ? "Soundtrack on" : "Enable music & sounds"}
                <span>{sound ? "A song for the way home" : "Best with sound"}</span>
              </button>
              {audioError && <p className="error-message" role="alert">{audioError}</p>}
            </div>
          </div>
          <div className="title-captain">
            <Portrait id={0} />
            <span>“I must see Ithaca again.”</span>
          </div>
          <footer className="title-footer">
            <span>A CONVERSATION ADVENTURE</span>
            <span className="keyboard-hint">
              ENTER TO {hasSave ? "CONTINUE" : "START"}
            </span>
            <span>STORY MODE · v2.0</span>
          </footer>
        </section>
      ) : screen === "intro" ? (
        <section className="intro-screen" aria-label="Story prologue">
          <div className="title-landscape" />
          <div className="intro-shade" />
          <header className="intro-top">
            <span className="pixel">FARSHORE</span>
            <Button
              variant="ghost"
              onClick={() => {
                setScreen("play");
                chime();
              }}
            >
              Skip intro
              <ChevronRight />
            </Button>
          </header>
          <div className="intro-content" key={intro}>
            <span className="pixel overline">{story.kicker}</span>
            <h1>{story.title}</h1>
            <div className="intro-cast">
              {story.actors.map((id, i) => (
                <div
                  className="intro-person"
                  key={id}
                  style={{ "--delay": `${i * 0.17}s` } as CSSProperties}
                >
                  <Portrait id={id} />
                  <span>{cast[id].name}</span>
                </div>
              ))}
            </div>
            <p className="intro-text">
              <Words text={story.text} instant={instantText || reducedMotion || keyboardInput} />
            </p>
          </div>
          <div className="intro-controls">
            <span className="intro-dots" aria-label={`Scene ${intro + 1} of 4`}>
              {prologue.map((_, i) => (
                <span className={i === intro ? "active" : ""} key={i} />
              ))}
            </span>
            <Button className="pixel-button primary" onClick={nextIntro}>
              {intro === 3 ? "SET SAIL" : "CONTINUE"}
              <ChevronRight />
            </Button>
          </div>
        </section>
      ) : (
        <div className="play-screen">
          <header className="game-hud">
            <button
              className="hud-brand pixel"
              onClick={() => setModal("pause")}
            >
              FARSHORE
            </button>
            <div className="hud-clock" key={`time-${game.months}`}>
              <Hourglass />
              <span>
                <small>AWAY FROM HOME</small>
                <strong>
                  {formatTime(game.months)} <em>/ 20y</em>
                </strong>
                <span className="time-remaining">{Math.max(0, 240 - game.months)} months to reach home</span>
              </span>
            </div>
            <div className="hud-trust" key={`trust-${game.trust}`}>
              <span>
                TRUST <b>{game.trust}/100</b>
              </span>
              <div
                className="trust-meter"
                role="meter"
                aria-label="Odysseus’ trust"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={game.trust}
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <i
                    className={i < Math.ceil(game.trust / 10) ? "filled" : ""}
                    key={i}
                  />
                ))}
              </div>
            </div>
            <div className="hud-buttons">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Voyage map"
                onClick={() => setModal("map")}
              >
                <Compass />
              </Button>
              {iconSound}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Pause menu"
                onClick={() => setModal("pause")}
              >
                <Pause />
              </Button>
            </div>
          </header>
          {game.finished ? (
            <section className="ending" ref={sceneRef} tabIndex={-1} aria-label="Journey report">
              <div className="ending-landscape" />
              <div className="ending-content">
                <span className="pixel overline">
                  {won ? "THE FAR SHORE, AT LAST" : "THE LEGEND OUTLASTED YOU"}
                </span>
                <h1>{won ? "Welcome home." : "Twenty years of longing."}</h1>
                <div className="ending-cast">
                  <Portrait id={0} />
                  <Portrait id={won ? 3 : 2} />
                </div>
                <p>
                  {won
                    ? `Odysseus returns to Ithaca in ${formatTime(game.months)}. You beat the twenty-year legend by ${formatTime(240 - game.months)}.`
                    : "The twenty-year mark has passed. Another voyage might turn on a different word."}
                </p>
                <div className="ending-score">
                  <span>
                    <b>
                      {game.log.filter((x) => x.followed).length}/
                      {game.log.length}
                    </b>
                    times he listened
                  </span>
                  <span>
                    <b>{game.trust}/100</b>final trust
                  </span>
                  <span>
                    <b>{game.log.filter((x) => !x.safeChoice).length}</b>costly
                    decisions
                  </span>
                </div>
                <div className="ending-actions">
                  <Button
                    className="pixel-button primary"
                    onClick={() => setModal("log")}
                  >
                    JOURNEY REPORT
                    <BookOpen />
                  </Button>
                  <Button className="pixel-button" onClick={begin}>
                    SAIL AGAIN
                    <RotateCcw />
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section
                className={`encounter-stage scene-${encounter.id} mood-${mood}`}
                aria-label={encounter.place}
                ref={sceneRef}
                tabIndex={-1}
                key={encounter.id}
              >
                <div
                  className="location-art"
                  style={{
                    backgroundPosition: `${(scene.tile % 3) * 50}% ${Math.floor(scene.tile / 3) * 100}%`,
                  }}
                />
                <div className="stage-shade" />
                <div className="scene-atmosphere" aria-hidden="true">
                  <div className="sea-mist" />
                  {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ "--particle": i } as CSSProperties} />)}
                </div>
                <div className="chapter-banner">
                  <span className="pixel">
                    CHAPTER {String(game.index + 1).padStart(2, "0")} /{" "}
                    {game.route.length}
                  </span>
                  <h1>{encounter.place}</h1>
                  <p>{encounter.title}</p>
                </div>
                <div className="scene-context">
                  <p>{encounter.scene}</p>
                </div>
                <div className="conversation-stage">
                  <div className="captain-conversation">
                    <div className={`stage-captain ${busy ? "captain-thinking" : ""}`}>
                      <Portrait id={0} className="idle" />
                      <span className="actor-name">YOUR CAPTAIN</span>
                    </div>
                    <SpeechBubble
                      key={`${encounter.id}-${current ? "reply" : "opening"}`}
                      text={current?.reply || encounter.speech}
                      instant={instantText || reducedMotion || keyboardInput}
                      busy={busy}
                      decided={!!current}
                    />
                  </div>
                <div className="stage-visitors">
                  {scene.actors.slice(0, 2).map((id, i) => (
                    <button
                      className="stage-person"
                      key={id}
                      style={{ "--delay": `${i * 0.7}s` } as CSSProperties}
                      onClick={() => {
                        chime("select");
                        setSelected(id);
                        setModal("cast");
                      }}
                      aria-label={`Meet ${cast[id].name}`}
                    >
                      <Portrait id={id} className="idle" />
                      <span className="actor-name">
                        {cast[id].name.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
                </div>
                <span className="stage-book">HOMER · {scene.book}</span>
              </section>
              <section className="dialogue-box" aria-label="Advise Odysseus">
                <div className="dialogue-header">
                  <span className="pixel">{current ? "THE CONSEQUENCE" : "YOUR NEXT MOVE"}</span>
                  <button className="mode-switch" onClick={() => setModal("settings")}>
                    <span className={`mode-dot ${mode}`} />
                    {mode === "story" ? "Story mode · scripted" : "AI dialogue"}
                    <Settings2 size={14} />
                  </button>
                </div>
                {current ? (
                  <div
                    className="decision"
                    tabIndex={-1}
                    ref={resultRef}
                    aria-live="polite"
                    aria-label={`Odysseus replied: ${current.reply}`}
                  >
                    <div className="result-summary">
                      <span
                        className={
                          current.safeChoice
                            ? "result-tag good"
                            : "result-tag costly"
                        }
                      >
                        <small>HIS CHOICE</small>
                        <strong>{current.followed ? "He listened" : "His own choice"}</strong>
                        <em>{current.safeChoice ? "Passage earned" : "A costly turn"}</em>
                      </span>
                      <span className="result-time">
                        <small>TIME PASSED</small>
                        <strong>+{current.months} <em>months</em></strong>
                      </span>
                      <span className={current.trustDelta >= 0 ? "good" : "costly"}>
                        <small>TRUST</small>
                        <strong>{current.trustDelta > 0 ? "+" : ""}{current.trustDelta} <em>points</em></strong>
                      </span>
                    </div>
                    <p className="outcome">{current.outcome}</p>
                    <div className="decision-actions">
                      <details>
                        <summary>Why this choice?</summary>
                        <p>{current.reason}</p>
                        <small>
                          {current.tone} wording ·{" "}
                          {current.source === "ai"
                            ? "AI interpretation"
                            : "Scripted interpretation"}
                        </small>
                      </details>
                      <Button className="pixel-button primary" onClick={next}>
                        {game.index === game.route.length - 1 ||
                        game.months >= 240
                          ? "JOURNEY REPORT"
                          : "NEXT SHORE"}
                        <ArrowRight />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submit();
                      }}
                    >
                      <label htmlFor="advice">
                        YOUR COUNSEL{" "}
                        <span>He needs a reason to listen, not an order.</span>
                      </label>
                      <div className="composer">
                        <Textarea
                          id="advice"
                          ref={inputRef}
                          value={advice}
                          onChange={(e) => setAdvice(e.target.value)}
                          placeholder="Odysseus, think of home…"
                          maxLength={800}
                          disabled={busy || !ready}
                          aria-describedby={`counsel-hint${error ? " counsel-error" : ""}${voiceIssue ? " dictation-error" : ""}`}
                          aria-invalid={!!error}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                              e.preventDefault();
                              void submit();
                            }
                          }}
                        />
                        <div className="composer-actions">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={microphone}
                            disabled={!micAvailable || busy || dictationState === "finishing"}
                            aria-label={
                              dictationState === "starting" ? "Cancel dictation"
                                : dictationState === "finishing" ? "Finishing dictation"
                                : listening ? "Stop dictation" : "Dictate your advice"
                            }
                            className={listening ? "recording" : ""}
                          >
                            {listening ? <MicOff /> : <Mic />}<span>{dictationState === "starting" ? "Cancel" : dictationState === "finishing" ? "Finishing" : listening ? "Stop" : "Dictate"}</span>
                          </Button>
                          <span>{advice.length}/800</span>
                          <Button
                            className="pixel-button primary"
                            type="submit"
                            disabled={
                              busy || listening || advice.trim().length < 3 || !ready
                            }
                          >
                            {busy ? "THINKING…" : "SEND COUNSEL"}
                            <Send size={16} />
                          </Button>
                        </div>
                      </div>
                      <p className="composer-hint" id="counsel-hint">
                        <span>{busy ? "Your words are with the captain. This may take a moment." : "You advise. He decides. Every choice changes the journey."}</span>
                        <span className="shortcut-hint">Ctrl / ⌘ + Enter to send</span>
                      </p>
                      {!micAvailable && <p className="input-note">Dictation is unavailable in this browser. You can always type your counsel.</p>}
                      {listening && (
                        <p className="input-note" role="status">
                          {dictationState === "starting" ? "Starting dictation. Allow microphone access if your browser asks."
                            : dictationState === "finishing" ? "Finishing your transcript. Review it before sending."
                            : "Listening. Speak now, then stop and review your words before sending."}
                        </p>
                      )}
                      {voiceIssue && (
                        <div className="dictation-error" role="alert" id="dictation-error">
                          <strong>{voiceIssue.title}</strong>
                          <p>{voiceIssue.detail}</p>
                          <div className="dictation-recovery">
                            {!listening && micAvailable && <button type="button" onClick={microphone} disabled={busy}>Try dictation again</button>}
                            <button type="button" onClick={() => {
                              recognition.current?.cancel();
                              setVoiceIssue(null);
                              inputRef.current?.focus();
                            }}>Type instead</button>
                          </div>
                        </div>
                      )}
                      {error && (
                        <p className="error-message" role="alert" id="counsel-error">
                          {error} Your counsel is still here. You can edit it and send again.
                        </p>
                      )}
                    </form>
                  </>
                )}
              </section>
            </>
          )}
          {saveError && <p className="save-warning" role="alert">Progress could not be saved on this device. Keep this tab open to continue your voyage.</p>}
          {audioError && <p className="save-warning" role="alert">{audioError}</p>}
          <footer className="game-footer">
            <div>
              <button onClick={() => setModal("cast")}>
                <BookOpen />
                CHARACTERS
              </button>
              <button onClick={() => setModal("log")}>CAPTAIN’S LOG</button>
              <button onClick={() => setModal("help")} aria-label="How to play">
                <HelpCircle />
              </button>
            </div>
            <span>
              {saveError
                ? "PROGRESS COULD NOT BE SAVED"
                : ready
                  ? "SAVED ON THIS DEVICE"
                  : "LOADING"}
            </span>
            <button onClick={() => setModal("settings")}>
              MUSIC & SETTINGS
              <Settings2 size={14} />
            </button>
          </footer>
        </div>
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent
          className={`game-dialog ${modal === "cast" ? "cast-dialog" : ""} ${modal === "map" ? "map-dialog" : ""} ${reducedMotion || keyboardInput ? "reduce-motion" : ""}`}
        >
          <DialogHeader>
            <DialogTitle className="pixel">
              {
                {
                  pause: "VOYAGE PAUSED",
                  cast: "GODS, MORTALS & MONSTERS",
                  log: "CAPTAIN’S LOG",
                  map: "THE WAY HOME",
                  help: "HOW TO PLAY",
                  settings: "GAME SETTINGS",
                  restart: "A NEW VOYAGE?",
                }[modal || "pause"]
              }
            </DialogTitle>
            <DialogDescription>
              {
                {
                  pause: "The sea can wait.",
                  cast: "Twenty figures from Homer’s Odyssey. Select a portrait to meet them.",
                  log: "Your words. His choices. Every consequence.",
                  map: "Eleven trials between Troy and home.",
                  help: "You advise. Odysseus decides.",
                  settings: "Set the voice of your adventure.",
                  restart:
                    "This replaces your current saved voyage on this device.",
                }[modal || "pause"]
              }
            </DialogDescription>
          </DialogHeader>
          {modal === "pause" ? (
            <div className="pause-menu">
              <Button
                className="pixel-button primary"
                onClick={() => setModal(null)}
              >
                <Play />
                RESUME
              </Button>
              <Button className="pixel-button" onClick={() => setModal("map")}>
                <Compass />
                VOYAGE MAP
              </Button>
              <Button className="pixel-button" onClick={() => setModal("cast")}>
                <BookOpen />
                CHARACTERS
              </Button>
              <Button
                className="pixel-button"
                onClick={() => setModal("settings")}
              >
                <Settings2 />
                SETTINGS
              </Button>
              <Button
                className="pixel-button"
                onClick={returnTitle}
                disabled={busy}
              >
                SAVE & TITLE SCREEN
              </Button>
              <button
                className="menu-text"
                disabled={busy}
                onClick={() => setModal("restart")}
              >
                START OVER
              </button>
            </div>
          ) : null}
          {modal === "cast" ? (
            <div className="cast-layout">
              <div className="cast-grid">
                {cast.map((c, id) => (
                  <button
                    key={c.name}
                    className={
                      selected === id ? "cast-cell selected" : "cast-cell"
                    }
                    onClick={() => setSelected(id)}
                    aria-pressed={selected === id}
                  >
                    <Portrait id={id} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
              <article className="cast-detail">
                <Portrait id={selected} />
                <small>{cast[selected].role}</small>
                <h2>{cast[selected].name}</h2>
                <p>{cast[selected].bio}</p>
                <span className="book-reference">
                  HOMER · {cast[selected].book}
                </span>
              </article>
              <p className="cast-note">
                Original character designs. A selection of the poem’s main cast;
                the game’s choices and time costs are a fictional retelling.
              </p>
            </div>
          ) : null}
          {modal === "map" ? (
            <div className="voyage-map">
              <ol>
                {game.route.map((id, i) => (
                  <li
                    key={id}
                    className={
                      i === game.index
                        ? "map-current"
                        : game.log[i]
                          ? "map-complete"
                          : ""
                    }
                  >
                    <span>
                      {game.log[i] ? (
                        <Check size={18} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <div>
                      <strong>
                        {encounters.find((e) => e.id === id)?.place}
                      </strong>
                      <small>
                        {game.log[i]
                          ? `${game.log[i].safeChoice ? "Passage earned" : "A costly turn"} · +${game.log[i].months} months`
                          : i === game.index
                            ? "YOU ARE HERE"
                            : "Uncharted"}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
              <p>
                <Flag size={17} /> Reach the final homecoming before 20 years.
              </p>
            </div>
          ) : null}
          {modal === "log" ? (
            <div className="journal">
              {!game.log.length ? (
                <p>Your first choice will begin the captain’s log.</p>
              ) : (
                game.log.map((entry, i) => (
                  <article key={i}>
                    <div className="log-top">
                      <span>
                        CHAPTER {i + 1} ·{" "}
                        {
                          encounters.find((e) => e.id === entry.encounterId)
                            ?.place
                        }
                      </span>
                      <b>+{entry.months}m</b>
                    </div>
                    <blockquote>“{entry.advice}”</blockquote>
                    <strong className={entry.safeChoice ? "good" : "costly"}>
                      {entry.followed
                        ? "He took your advice."
                        : "He followed his own mind."}
                    </strong>
                    <p>{entry.reason}</p>
                    <p className="log-outcome">{entry.outcome}</p>
                    <small>
                      {entry.tone} · Trust {entry.trustDelta > 0 ? "+" : ""}
                      {entry.trustDelta} ·{" "}
                      {entry.source === "ai"
                        ? "AI dialogue"
                        : "Scripted decision"}
                    </small>
                  </article>
                ))
              )}
            </div>
          ) : null}
          {modal === "help" ? (
            <div className="help-content">
              <ol>
                <li>
                  <b>Read the encounter.</b> Every shore tests his pride,
                  curiosity, or loyalty.
                </li>
                <li>
                  <b>Give your own counsel.</b> Type freely, or dictate and
                  review your words.
                </li>
                <li>
                  <b>Let him decide.</b> Supportive reasons can win him over.
                  Commands can provoke refusal.
                </li>
                <li>
                  <b>Learn from the result.</b> Watch time and trust. Open “Why
                  this choice?” or the captain’s log.
                </li>
              </ol>
              <p>
                The clock starts at ten years for the war at Troy. Complete
                eleven encounters before twenty total years pass. These time
                costs and branching outcomes are invented game rules.
              </p>
              <p>
                <b>Story mode uses simple wording rules.</b> It can miss nuance.
                AI dialogue requires a connected model. Speech input transcribes
                words; it does not detect emotion.
              </p>
              <div className="control-key">
                <kbd>Enter</kbd> Start / advance intro <kbd>Ctrl + Enter</kbd>{" "}
                Send counsel <kbd>Esc</kbd> Pause / close
              </div>
              <Button
                className="pixel-button primary"
                onClick={() => setModal(null)}
              >
                UNDERSTOOD
                <Check />
              </Button>
            </div>
          ) : null}
          {modal === "restart" ? (
            <div className="restart-actions">
              <Button className="pixel-button" onClick={() => setModal(null)}>
                KEEP MY VOYAGE
              </Button>
              <Button
                className="pixel-button primary"
                disabled={busy}
                onClick={begin}
              >
                START AGAIN
                <RotateCcw />
              </Button>
            </div>
          ) : null}
          {modal === "settings" ? (
            <div className="settings-content">
              <fieldset>
                <legend>Dialogue</legend>
                <label>
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "story"}
                    onChange={() => setMode("story")}
                    disabled={busy}
                  />
                  <span>
                    <strong>Story mode</strong>
                    <small>
                      Authored scenes and simple wording rules. Ready to play.
                    </small>
                  </span>
                </label>
                <label className={!aiAvailable ? "unavailable" : ""}>
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "ai"}
                    onChange={() => setMode("ai")}
                    disabled={!aiAvailable || busy}
                  />
                  <span>
                    <strong>
                      AI dialogue {aiAvailable ? "" : "· Not connected"}
                    </strong>
                    <small>
                      A connected language model interprets your counsel.
                    </small>
                  </span>
                </label>
              </fieldset>
              <label>
                <span>
                  <strong>Music & sounds</strong>
                  <small>
                    A sea-worn melody, soft strings, and the sound of each choice.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={sound}
                  onChange={toggleAudio}
                />
              </label>
              <div className="audio-mixer">
                <label htmlFor="music-volume"><span>Music <output>{Math.round(musicVolume * 100)}%</output></span>
                  <input id="music-volume" type="range" min="0" max="100" value={Math.round(musicVolume * 100)} onChange={(e) => setMusicVolume(Number(e.target.value) / 100)} />
                </label>
                <label htmlFor="effects-volume"><span>Sound effects <output>{Math.round(effectsVolume * 100)}%</output></span>
                  <input id="effects-volume" type="range" min="0" max="100" value={Math.round(effectsVolume * 100)} onChange={(e) => setEffectsVolume(Number(e.target.value) / 100)} onPointerUp={() => chime("select")} onKeyUp={() => chime("select")} />
                </label>
                <span className="audio-caption">{sound ? "Playing" : "Muted"} · {mood === "title" ? "A song for the way home" : mood === "danger" ? "Beneath an uneasy sea" : mood === "home" ? "The lights of Ithaca" : "On a following wind"}</span>
              </div>
              {audioError && <p className="error-message" role="alert">{audioError}</p>}
              <label>
                <span>
                  <strong>Read replies aloud</strong>
                  <small>Uses your browser’s available voice.</small>
                </span>
                <input
                  type="checkbox"
                  checked={voice}
                  onChange={(e) => {
                    setVoice(e.target.checked);
                    if (!e.target.checked) {
                      window.speechSynthesis?.cancel();
                      setSpeaking(false);
                    }
                  }}
                />
              </label>
              <fieldset className="reading-settings">
                <legend>Reading & motion</legend>
                <label><span><strong>Instant dialogue</strong><small>Show the whole line without the typewriter effect.</small></span><input type="checkbox" checked={instantText} onChange={(e) => setInstantText(e.target.checked)} /></label>
                <label><span><strong>Reduced motion</strong><small>{systemReducedMotion ? "Your device already requests reduced motion." : "Still scenery and characters, with instant transitions."}</small></span><input type="checkbox" checked={reducedMotion} disabled={systemReducedMotion} onChange={(e) => setReduceMotion(e.target.checked)} /></label>
              </fieldset>
              <p>
                Voice input may use your browser’s online speech service. Only
                the reviewed transcript is sent when you choose Send counsel. Your
                progress is saved in this browser.
              </p>
              <Button
                className="pixel-button primary"
                onClick={() => setModal(null)}
              >
                DONE
                <Check />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
