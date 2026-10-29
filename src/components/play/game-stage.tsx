"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * The immersive gameplay viewport.
 *
 * While a stage is mounted the document cannot scroll and the arcade chrome is
 * out of the way: gameplay fills the browser window, letterboxed to 16:9 so the
 * fixed logical render space never distorts. The HUD and the AI inspector are
 * overlays on the frame rather than page sections beside it, which is what keeps
 * the action area large.
 */
export function GameStage({
  children,
  hud,
  overlay,
  inspector,
  /** Widen the frame's companion column for the expanded inspector. */
  labMode = false,
  label,
  onFullscreenChange,
}: {
  children: ReactNode;
  hud?: ReactNode;
  overlay?: ReactNode;
  inspector?: ReactNode;
  labMode?: boolean;
  label: string;
  onFullscreenChange?: (active: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  // Lock document scrolling for as long as the stage is mounted. Restoring the
  // previous values (rather than clearing them) keeps the menus' own styling
  // intact when the attempt ends.
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const previous = {
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.classList.add("fs-stage-open");
    window.scrollTo({ top: 0, behavior: "instant" });
    return () => {
      body.style.overflow = previous.bodyOverflow;
      html.style.overflow = previous.htmlOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      body.classList.remove("fs-stage-open");
    };
  }, []);

  useEffect(() => {
    setCanFullscreen(typeof document.fullscreenEnabled === "boolean" ? document.fullscreenEnabled : true);
    const update = () => {
      const active = document.fullscreenElement === root.current;
      setFullscreen(active);
      onFullscreenChange?.(active);
    };
    document.addEventListener("fullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      // Leaving mid-attempt should not strand the browser in fullscreen.
      if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {});
    };
  }, [onFullscreenChange]);

  const toggleFullscreen = useCallback(() => {
    const node = root.current;
    if (!node) return;
    if (document.fullscreenElement === node) void document.exitFullscreen().catch(() => {});
    else void node.requestFullscreen?.().catch(() => setCanFullscreen(false));
  }, []);

  // F11 is the browser's own; F for the game keeps a keyboard route available
  // without fighting it.
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) return;
      e.preventDefault();
      toggleFullscreen();
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggleFullscreen]);

  return (
    <div
      ref={root}
      className={`fs-stage${labMode ? " fs-stage-lab" : ""}${fullscreen ? " fs-stage-fullscreen" : ""}`}
      data-label={label}
    >
      <div className="fs-stage-main">
        <div className="fs-stage-frame">
          <div className="fs-stage-canvas">{children}</div>
          {hud && <div className="fs-stage-hud">{hud}</div>}
          {overlay}
          {canFullscreen && (
            <button
              className="fs-stage-fullscreen-btn"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Leave fullscreen" : "Play fullscreen"}
              title={fullscreen ? "Leave fullscreen (F)" : "Play fullscreen (F)"}
            >
              {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          )}
        </div>
      </div>
      {inspector && <div className="fs-stage-side">{inspector}</div>}
    </div>
  );
}
