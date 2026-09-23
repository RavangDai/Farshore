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
type SpeechEvent = { results: { 0: { 0: { transcript: string } } } };
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
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
function Words({ text }: { text: string }) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    setLength(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLength(text.length);
      return;
    }
    let n = 0;
    const timer = setInterval(() => {
      n += 3;
      setLength(n);
      if (n >= text.length) clearInterval(timer);
    }, 22);
    return () => clearInterval(timer);
  }, [text]);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, length)}
        {length < text.length && <span className="type-cursor">▌</span>}
      </span>
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
    [listening, setListening] = useState(false),
    [micAvailable, setMicAvailable] = useState(false),
    [aiAvailable, setAiAvailable] = useState(false),
    [mode, setMode] = useState<"story" | "ai">("story"),
    [saveError, setSaveError] = useState(false);
  const lock = useRef(false),
    recognition = useRef<Recognition | null>(null),
    inputRef = useRef<HTMLTextAreaElement>(null),
    resultRef = useRef<HTMLDivElement>(null),
    audio = useRef<AudioContext | null>(null),
    gameRef = useRef(game);
  gameRef.current = game;
  const encounter =
      encounters.find((e) => e.id === game.route[game.index]) || encounters[0],
    current = game.log[game.index],
    won = game.finished && game.months < 240,
    scene = sceneArt[encounter.id],
    story = prologue[intro];
  const chime = useCallback(
    (success = true) => {
      if (!sound) return;
      try {
        const ctx = audio.current ?? new AudioContext();
        audio.current = ctx;
        void ctx.resume();
        [0, 1, 2].forEach((n) => {
          const o = ctx.createOscillator(),
            v = ctx.createGain();
          o.type = "triangle";
          o.frequency.value = (
            success ? [261.63, 329.63, 392] : [196, 174.61, 146.83]
          )[n];
          v.gain.setValueAtTime(0.045, ctx.currentTime + n * 0.09);
          v.gain.exponentialRampToValueAtTime(
            0.001,
            ctx.currentTime + n * 0.09 + 0.22,
          );
          o.connect(v);
          v.connect(ctx.destination);
          o.start(ctx.currentTime + n * 0.09);
          o.stop(ctx.currentTime + n * 0.09 + 0.23);
        });
      } catch {}
    },
    [sound],
  );
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
    } catch {}
    setReady(true);
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
      recognition.current?.abort();
      window.speechSynthesis?.cancel();
      void audio.current?.close();
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
          JSON.stringify({ sound, voice }),
        );
      } catch {}
  }, [sound, voice, ready]);
  function begin() {
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
      recognition.current?.stop();
      lock.current = true;
      setBusy(true);
      setError("");
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
        chime(d.safeChoice);
        if (voice && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(d.reply);
          u.rate = 0.88;
          u.pitch = 0.85;
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
    chime();
    setGame((g) => advance(g));
    setError("");
    setAdvice("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }
  function microphone() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    const C =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!C) return;
    const rec = new C();
    recognition.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      setAdvice((a) =>
        (a + " " + e.results[0][0].transcript).trim().slice(0, 800),
      );
      setError("");
    };
    rec.onerror = (e) => {
      setError(
        e.error === "not-allowed"
          ? "Microphone access was declined. You can still type your advice."
          : "Voice input could not hear you. Try again or type your advice.",
      );
      setListening(false);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("The microphone could not start. Please type your advice.");
    }
  }
  function returnTitle() {
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
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
      aria-label={sound ? "Mute game sounds" : "Enable game sounds"}
      onClick={() => setSound(!sound)}
    >
      {sound ? <Volume2 /> : <VolumeX />}
    </Button>
  );
  return (
    <main className={`game-shell screen-${screen}`}>
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
              <Words text={story.text} />
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
            <div className="hud-clock">
              <Hourglass />
              <span>
                <small>AWAY FROM HOME</small>
                <strong>
                  {formatTime(game.months)} <em>/ 20y</em>
                </strong>
              </span>
            </div>
            <div className="hud-trust">
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
            <section className="ending">
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
                className={`encounter-stage scene-${encounter.id}`}
                aria-label={encounter.place}
                key={encounter.id}
              >
                <div
                  className="location-art"
                  style={{
                    backgroundPosition: `${(scene.tile % 3) * 50}% ${Math.floor(scene.tile / 3) * 100}%`,
                  }}
                />
                <div className="stage-shade" />
                <div className="chapter-banner">
                  <span className="pixel">
                    CHAPTER {String(game.index + 1).padStart(2, "0")} /{" "}
                    {game.route.length}
                  </span>
                  <h1>{encounter.place}</h1>
                  <p>{encounter.title}</p>
                </div>
                <div className="stage-captain">
                  <Portrait id={0} className={busy ? "thinking" : "idle"} />
                  <span className="actor-name">ODYSSEUS</span>
                </div>
                <div className="scene-context">
                  <p>{encounter.scene}</p>
                </div>
                <div className="stage-visitors">
                  {scene.actors.slice(0, 2).map((id, i) => (
                    <button
                      className="stage-person"
                      key={id}
                      style={{ "--delay": `${i * 0.7}s` } as CSSProperties}
                      onClick={() => {
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
                <span className="stage-book">HOMER · {scene.book}</span>
              </section>
              <section className="dialogue-box" aria-label="Advise Odysseus">
                <div className="dialogue-header">
                  <span className="pixel">ODYSSEUS</span>
                  <span>
                    {current
                      ? "THE CAPTAIN HAS DECIDED"
                      : busy
                        ? "CONSIDERING YOUR WORDS…"
                        : "PROUD · CURIOUS · HOMESICK"}
                  </span>
                </div>
                {current ? (
                  <div
                    className="decision"
                    tabIndex={-1}
                    ref={resultRef}
                    aria-live="polite"
                  >
                    <div className="result-summary">
                      <span
                        className={
                          current.safeChoice
                            ? "result-tag good"
                            : "result-tag costly"
                        }
                      >
                        {current.followed ? "HE LISTENED" : "HIS OWN CHOICE"}
                      </span>
                      <span className="result-time">
                        +{current.months} MONTHS
                      </span>
                      <span>
                        TRUST {current.trustDelta > 0 ? "+" : ""}
                        {current.trustDelta}
                      </span>
                    </div>
                    <p className="captain-line">
                      <Words text={`“${current.reply}”`} />
                    </p>
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
                    <p className="captain-line">
                      <Words text={`“${encounter.speech}”`} />
                    </p>
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
                            size="icon"
                            onClick={microphone}
                            disabled={!micAvailable || busy}
                            aria-label={
                              listening
                                ? "Stop recording"
                                : "Dictate your advice"
                            }
                            className={listening ? "recording" : ""}
                          >
                            {listening ? <MicOff /> : <Mic />}
                          </Button>
                          <span>{advice.length}/800</span>
                          <Button
                            className="pixel-button primary"
                            type="submit"
                            disabled={
                              busy || advice.trim().length < 3 || !ready
                            }
                          >
                            {busy ? "THINKING…" : "SPEAK"}
                            <Send size={16} />
                          </Button>
                        </div>
                      </div>
                      {listening && (
                        <p className="input-note">
                          Listening. Review the transcript before sending.
                        </p>
                      )}
                      {error && (
                        <p className="error-message" role="alert">
                          {error}
                        </p>
                      )}
                    </form>
                  </>
                )}
              </section>
            </>
          )}
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
              {mode === "story" ? "STORY MODE · SCRIPTED" : "AI DIALOGUE"}
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
          className={`game-dialog ${modal === "cast" ? "cast-dialog" : ""} ${modal === "map" ? "map-dialog" : ""}`}
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
                  <strong>Game sounds</strong>
                  <small>
                    Short retro tones for choices and scene changes.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={sound}
                  onChange={(e) => setSound(e.target.checked)}
                />
              </label>
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
                    if (!e.target.checked) window.speechSynthesis?.cancel();
                  }}
                />
              </label>
              <p>
                Voice input may use your browser’s online speech service. Only
                the reviewed transcript is sent when you choose Speak. Your
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
