"use client";
import { useEffect, useRef } from "react";
import { CaveScene, type CaveOverlay } from "../lib/render/cave-scene";
import { VIEW_H, VIEW_W, prepareCanvas } from "../lib/render/stage";
import { caveStatus, type CaveState } from "../lib/encounters/cave-runner";
import { useFarshoreItems, useFarshoreSprites } from "../lib/farshore-rendering";

/**
 * The Cyclops' Cave view.
 *
 * The renderer runs its own animation frame loop and reads the newest state out
 * of a ref, which decouples the 60 fps cave from the simulation's fixed tick.
 * Torchlight, dust and the Cyclops' stride stay smooth while the authoritative
 * simulation advances in bounded steps, and React is not asked to re-render on
 * every frame.
 */
export function CaveGame({
  state,
  active,
  still,
  shakeStrength,
  effectStrength,
  overlay,
  onAction,
}: {
  state: CaveState;
  active: boolean;
  still: boolean;
  shakeStrength: number;
  effectStrength: number;
  overlay: CaveOverlay;
  onAction: (action: { type: "move"; dx: number } | { type: "jump" } | { type: "slide" }) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CaveScene | null>(null);
  const latest = useRef(state);
  const options = useRef({ still, shakeStrength, effectStrength, overlay });
  const hero = useFarshoreSprites();
  const items = useFarshoreItems();
  const sprites = useRef({ hero, items });

  latest.current = state;
  options.current = { still, shakeStrength, effectStrength, overlay };
  sprites.current = { hero, items };

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const view = new CaveScene();
    scene.current = view;
    let handle = 0;
    let previous = 0;
    let decorative = 0;

    const frame = (now: number) => {
      const raw = previous ? now - previous : 16;
      previous = now;
      // Bounded so a stalled tab cannot fling particles across the screen.
      const dt = Math.min(0.05, Math.max(0, raw / 1000));
      if (!options.current.still) decorative += raw;
      const context = prepareCanvas(node);
      if (context) {
        view.draw(context, latest.current, { now: decorative, dt }, {
          still: options.current.still,
          shakeStrength: options.current.shakeStrength,
          effectStrength: options.current.effectStrength,
          overlay: options.current.overlay,
          sprites: sprites.current,
        });
      }
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(handle);
      view.reset();
      scene.current = null;
    };
  }, []);

  // Touch controls: large zones rather than small buttons, so a phone player
  // can swipe the way the keyboard player presses.
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    if (!active) return;
    touch.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!active || !touch.current) return;
    const dx = e.clientX - touch.current.x;
    const dy = e.clientY - touch.current.y;
    const elapsed = performance.now() - touch.current.t;
    touch.current = null;
    if (elapsed > 700) return;
    const threshold = 34;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      onAction({ type: "jump" });
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) onAction({ type: "move", dx: Math.sign(dx) });
    else onAction(dy < 0 ? { type: "jump" } : { type: "slide" });
  }

  return (
    <div className="fs-cave-view">
      <canvas
        ref={canvas}
        width={VIEW_W}
        height={VIEW_H}
        className="fs-cave-canvas"
        role="img"
        aria-label={`Cyclops' Cave escape. ${caveStatus(state)}. ${state.feedback}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          touch.current = null;
        }}
      />
      <div className="fs-touch-pad" aria-hidden="true">
        <button disabled={!active} onClick={() => onAction({ type: "move", dx: -1 })} tabIndex={-1}>
          ◀
        </button>
        <button disabled={!active} onClick={() => onAction({ type: "jump" })} tabIndex={-1}>
          JUMP
        </button>
        <button disabled={!active} onClick={() => onAction({ type: "slide" })} tabIndex={-1}>
          SLIDE
        </button>
        <button disabled={!active} onClick={() => onAction({ type: "move", dx: 1 })} tabIndex={-1}>
          ▶
        </button>
      </div>
    </div>
  );
}
