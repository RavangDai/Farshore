"use client";
import { useEffect, useRef, useState } from "react";
import { BOW, statusLabel, type BowState } from "../../lib/encounters/mythic";
import { HallOverlay, drawFlatHall, type HallOverlayOptions } from "../../lib/render/hall-overlay";
import { hallCamera } from "../../lib/render/hall-view";
import type { HallWorld } from "../../lib/render/hall-world";
import { VIEW_H, VIEW_W, prepareCanvas } from "../../lib/render/stage";

export type HallAction = { type: "sight"; aim: number; elevation: number } | { type: "draw"; held: boolean };

/**
 * Sight units per logical stage pixel. The bow's whole sight range spans the
 * middle of the hall, so a mouse moves it like a heavy, precise cursor rather
 * than a twitchy one, and a finger drags it the same distance.
 */
const SIGHT_PER_PX = BOW.sightLimit / 450;

/**
 * The great hall of Ithaca: Penelope's contest of the twelve axes.
 *
 * Like the cave, the renderer runs its own animation frame and reads the
 * newest state from a ref. The hall is drawn in 3D with three.js, loaded only
 * when this encounter mounts; the canvas below is the arcade overlay on top of
 * it, and where WebGL is unavailable the same canvas draws the flat hall.
 *
 * The whole hall is the aiming surface: move the mouse to aim and hold its
 * button to draw, or on a touch screen drag to aim and hold DRAW.
 */
export function HallGame({
  state,
  active,
  still,
  shakeStrength,
  effectStrength,
  onAction,
}: {
  state: BowState;
  active: boolean;
  still: boolean;
  shakeStrength: number;
  effectStrength: number;
  onAction: (action: HallAction) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(state);
  const [touch, setTouch] = useState(false);
  const options = useRef<HallOverlayOptions & { shakeStrength: number; effectStrength: number }>({ still, shakeStrength, effectStrength, coach: true, touch, stageHeight: VIEW_H });
  const act = useRef(onAction);
  const live = useRef(active);
  // Pointer moves are gathered and applied once per frame, so a fast mouse
  // does not commit the round dozens of times between paints.
  const pending = useRef<{ aim: number; elevation: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  latest.current = state;
  act.current = onAction;
  live.current = active;
  options.current = { ...options.current, still, shakeStrength, effectStrength, coach: state.shots.length === 0, touch };

  function flush() {
    if (!pending.current) return;
    act.current({ type: "sight", ...pending.current });
    pending.current = null;
  }

  useEffect(() => {
    const node = canvas.current;
    const host = stage.current;
    if (!node || !host) return;
    let disposed = false;
    let world: HallWorld | null = null;
    let flat: HallOverlay | null = null;
    let handle = 0;
    let previous = 0;
    let decorative = 0;
    // The world module carries three.js, so it is fetched only for this encounter.
    import("../../lib/render/hall-world")
      .then(({ HallWorld }) => {
        if (disposed) return;
        try {
          world = new HallWorld(host, node);
        } catch {
          host.querySelector(".fs-cave-gl")?.remove();
          flat = new HallOverlay();
        }
      })
      .catch(() => {
        if (!disposed) flat = new HallOverlay();
      });

    const frame = (now: number) => {
      const raw = previous ? now - previous : 16;
      previous = now;
      const dt = Math.min(0.05, Math.max(0, raw / 1000));
      if (!options.current.still) decorative += raw;
      if (live.current) flush();
      options.current.stageHeight = node.clientHeight || VIEW_H;
      const view = { now: decorative, dt };
      if (world) world.render(latest.current, view, options.current);
      else if (flat) {
        const context = prepareCanvas(node);
        if (context) {
          const cam = hallCamera(latest.current);
          drawFlatHall(context, latest.current, cam);
          flat.draw(context, latest.current, cam, view, options.current);
        }
      }
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(handle);
      world?.dispose();
      flat?.reset();
    };
  }, []);

  /** A pointer's position in the logical stage space. */
  function at(e: React.PointerEvent) {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / Math.max(1, box.width)) * VIEW_W, y: ((e.clientY - box.top) / Math.max(1, box.height)) * VIEW_H };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!live.current) return;
    const p = at(e);
    if (e.pointerType === "mouse") {
      pending.current = { aim: (p.x - VIEW_W / 2) * SIGHT_PER_PX, elevation: -(p.y - VIEW_H / 2) * SIGHT_PER_PX };
      return;
    }
    // A finger drags the sight by how far it travels, so it never covers the sight itself.
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const from = pending.current ?? latest.current.aim;
    pending.current = { aim: from.aim + (p.x - d.x) * SIGHT_PER_PX, elevation: from.elevation - (p.y - d.y) * SIGHT_PER_PX };
    drag.current = { id: d.id, x: p.x, y: p.y };
  }
  function onPointerDown(e: React.PointerEvent) {
    if (!live.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      onPointerMove(e);
      flush();
      act.current({ type: "draw", held: true });
      return;
    }
    setTouch(true);
    const p = at(e);
    drag.current = { id: e.pointerId, x: p.x, y: p.y };
  }
  function onPointerUp(e: React.PointerEvent) {
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      // The arrow leaves from exactly where the sight was when the button let go.
      flush();
      act.current({ type: "draw", held: false });
      return;
    }
    if (drag.current?.id === e.pointerId) drag.current = null;
  }
  function draw(held: boolean) {
    if (!live.current && held) return;
    flush();
    act.current({ type: "draw", held });
  }

  const aiming = active && state.phase === "player";
  return (
    <div className="fs-cave-view fs-hall-view" data-aiming={aiming}>
      <div className="fs-cave-stage" ref={stage}>
        <canvas
          ref={canvas}
          width={VIEW_W}
          height={VIEW_H}
          className="fs-cave-canvas fs-cave-overlay fs-hall-canvas"
          role="img"
          aria-label={`Twelve axe heads stand in a line down the hall. ${statusLabel(state)}. ${state.feedback}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={e => {
            if (e.pointerType === "mouse") draw(false);
            drag.current = null;
          }}
          onContextMenu={e => e.preventDefault()}
        />
      </div>
      <button
        className="fs-hall-draw"
        data-touch={touch}
        data-drawing={state.drawing}
        disabled={!aiming}
        tabIndex={-1}
        aria-hidden="true"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setTouch(true);
          draw(true);
        }}
        onPointerUp={() => draw(false)}
        onPointerCancel={() => draw(false)}
        onContextMenu={e => e.preventDefault()}
      >
        <span>{state.drawing && state.draw >= 1 ? "LET GO" : "DRAW"}</span>
        <small>{state.drawing ? `${Math.round(state.draw * 100)}%` : "hold"}</small>
      </button>
    </div>
  );
}
