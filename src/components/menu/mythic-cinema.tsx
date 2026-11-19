"use client";
import { useEffect, useRef, useState, type Ref } from "react";
import { ArrowRight, KeyRound, SkipForward } from "lucide-react";
import { trials, type TrialId } from "../../lib/arcade/arcade";
import { CINEMA_THEMES, DURATION, captionAt, cinemaCaptions, cinemaCues, cuesBetween, flashAt, type Caption, type CinemaKind } from "../../lib/story/cinema";
import { crossingLines } from "../../lib/story/crossing";
import type { SoundName } from "../../lib/audio/sounds";
import { ART } from "../../lib/art";
import type { CinemaWorld } from "../../lib/render/cinema-world";

/**
 * The mythic cinematics, in 3D: Odysseus unlocking a trial's gate with the
 * Oracle's key, and Odysseus walking from the trial he has won to the next.
 *
 * The film itself is lib/story/cinema.ts (pure, tested) drawn by
 * lib/render/cinema-world.ts (three.js, loaded on demand). This screen runs the
 * clock, plays the cues, shows the captions and the letterbox, and ends the
 * film. Enter, Space, Escape or the button skip it. Where WebGL is missing it
 * calls `onFail` at once, so the caller can fall back. With reduced motion the
 * game never opens it.
 */

type Rival = "studying" | "ready" | "waiting";
type Props = {
  kind: CinemaKind;
  /** The trial whose gate opens (unlock), or the trial ahead (journey). */
  to: TrialId;
  /** Journey: the trial just won. */
  from?: TrialId;
  /** Journey: whether the next rival is still preparing. */
  rival?: Rival;
  preview?: boolean;
  headingRef?: Ref<HTMLElement>;
  onSound: (name: SoundName, gain?: number, pan?: number) => void;
  onSpeak?: (text: string) => void;
  onSilence?: () => void;
  onDone: () => void;
  onFail: () => void;
};

const SPEAK_AT = 0.6;

export function MythicCinema(props: Props) {
  const { kind, to, from, rival = "studying", preview = false, headingRef } = props;
  const host = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [late, setLate] = useState(false);
  const finished = useRef(false);
  // The loop reads the latest callbacks without restarting.
  const live = useRef(props);
  live.current = props;

  const toIndex = trials.findIndex(t => t.id === to), trial = trials[toIndex];
  const fromIndex = from ? trials.findIndex(t => t.id === from) : -1;
  const captions = useRef(cinemaCaptions(kind, from ? { number: fromIndex + 1, title: trials[fromIndex].title } : null, { number: toIndex + 1, title: trial.title, kind: trial.kind }));

  function finish(skipped: boolean) {
    if (finished.current) return;
    finished.current = true;
    if (skipped) live.current.onSilence?.();
    live.current.onDone();
  }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Escape") return;
      if (e.key !== "Escape" && (e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    }
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  useEffect(() => {
    let world: CinemaWorld | null = null, frame = 0, cancelled = false;
    const sprites = new Image();
    sprites.src = ART.hd.sprites;
    sprites.onload = () => world?.setSprites(sprites);
    const cues = cinemaCues(kind), total = DURATION[kind];
    let t = 0, last = 0, spoken = kind !== "journey", shown: Caption | null = null, held = false;

    import("../../lib/render/cinema-world").then(({ CinemaWorld }) => {
      if (cancelled || !host.current) return;
      try {
        world = new CinemaWorld(host.current, { kind, theme: CINEMA_THEMES[to], pastTheme: from ? CINEMA_THEMES[from] : undefined, sprites: sprites.complete && sprites.naturalWidth ? sprites : null });
      } catch {
        live.current.onFail();
        return;
      }
      world.render(0);
      setReady(true);
      // Development builds expose the film, so a browser check can hold and seek it frame by frame.
      if (process.env.NODE_ENV !== "production") (window as unknown as { farshoreCinema?: unknown }).farshoreCinema = { world, seek: (to: number) => { t = Math.max(0, Math.min(total, to)); }, hold: (on: boolean) => { held = on; } };
      const tick = (now: number) => {
        if (!world) return;
        // At most a tenth of a second per frame: a hidden tab or a stall pauses the film rather than skipping it.
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        const before = t;
        if (!held) t = Math.min(total, t + dt);
        world.render(t);
        for (const cue of cuesBetween(cues, before, t)) live.current.onSound(cue.sound, cue.gain, cue.pan);
        if (!spoken && t >= SPEAK_AT) { spoken = true; live.current.onSpeak?.(crossingLines[to]); }
        const now2 = captionAt(captions.current, t);
        if (now2 !== shown) { shown = now2; setCaption(now2); }
        if (flash.current) flash.current.style.opacity = String(flashAt(kind, t));
        if (t >= total) { finish(false); return; }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }).catch(() => { if (!cancelled) live.current.onFail(); });

    // If the 3D world is slow to arrive, say so rather than show a black screen.
    const slow = window.setTimeout(() => setLate(true), 1500);
    return () => {
      cancelled = true;
      clearTimeout(slow);
      cancelAnimationFrame(frame);
      world?.dispose();
      world = null;
    };
  }, [kind, to, from]);

  const rivalLine = preview ? "Preview"
    : rival === "studying" ? `${trial.character} is preparing…`
    : rival === "ready" ? `${trial.character} is ready`
    : `${trial.character} awaits`;
  const skipLabel = kind === "unlock" ? "Skip and enter the trial" : preview ? "End the preview" : "Skip the walk and open the briefing";

  return (
    <main className="fs-mythic" data-kind={kind} data-ready={ready || undefined} tabIndex={-1} aria-labelledby="fs-mythic-title" ref={headingRef}>
      <div ref={host} className="fs-mythic-stage" aria-hidden="true" />
      <div className="fs-mythic-grade" aria-hidden="true" />
      <div className="fs-mythic-grain" aria-hidden="true" />
      <span className="fs-letterbox fs-letterbox-top fs-mythic-bar" aria-hidden="true" />
      <span className="fs-letterbox fs-letterbox-bottom fs-mythic-bar" aria-hidden="true" />
      {!ready && <p className="fs-mythic-loading" role="status">{late ? "The way ahead is being raised…" : ""}</p>}
      {kind === "journey" && <header className="fs-mythic-top"><span>{from ? `${String(fromIndex + 1).padStart(2, "0")} ${trials[fromIndex].title}` : ""} <ArrowRight size={12} aria-label="to" /> {String(toIndex + 1).padStart(2, "0")} {trial.title}</span><small data-rival={preview ? "preview" : rival}>{rivalLine}</small></header>}
      {kind === "journey" && <p className="fs-mythic-line" aria-live="polite"><span>The bard</span>{crossingLines[to]}</p>}
      <section className="fs-mythic-caption" data-show={caption ? "" : undefined} aria-live="polite">
        {caption && <>
          <span className="fs-mythic-eyebrow">{kind === "unlock" && <KeyRound size={13} />} {caption.eyebrow}</span>
          <h1 id="fs-mythic-title" key={caption.title}>{caption.title}</h1>
          {caption.line && <p>{caption.line}</p>}
        </>}
        {!caption && <h1 id="fs-mythic-title" className="sr-only">{kind === "unlock" ? `The gate of ${trial.title} opens` : `Odysseus walks on to ${trial.title}`}</h1>}
      </section>
      <div ref={flash} className="fs-mythic-flash" data-kind={kind} aria-hidden="true" />
      <button className="fs-crossing-skip fs-mythic-skip" onClick={() => finish(true)} aria-label={skipLabel}>
        Skip <SkipForward size={15} /><kbd>Enter</kbd>
      </button>
    </main>
  );
}
