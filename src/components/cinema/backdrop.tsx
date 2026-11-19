"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ENVIRONMENTS, envFor, envSrc, type EnvId } from "../../lib/cinema/art";
import { QUALITY_BUDGET, type Quality } from "../../lib/cinema/quality";
import type { WorldSpec } from "../../lib/cinema/scenes";
import { AmbientFx } from "./ambient-fx";

const loaded = new Set<string>();
/** Fetches and decodes a painting before it is shown, so a cut never flashes an empty frame. */
export function preloadArt(src: string): Promise<void> {
  if (loaded.has(src)) return Promise.resolve();
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img.decode().then(() => { loaded.add(src); }, () => {});
}

type Framing = "wide" | "close" | "result";

/**
 * One painted environment in a stage box with the painting's exact aspect
 * ratio, sized to cover the screen and anchored on its focal subject. The
 * camera (framing zoom, slow drift, pointer sway) moves the whole box, so the
 * effects stay pinned to the art.
 */
function ArtStage({ env, framing, fx }: { env: EnvId; framing: Framing; fx: { density: number; dpr: number; paused: boolean } | null }) {
  const art = ENVIRONMENTS[env];
  return <div className="cn-art-stage" style={{ "--fx": art.focus[0], "--fy": art.focus[1] } as CSSProperties}>
    <div className="cn-art-cam" data-framing={framing}>
      <div className="cn-art-drift">
        <img className="cn-art-img" src={envSrc(env)} alt="" decoding="async" draggable={false} />
        {fx && fx.density > 0 && <AmbientFx spec={art.fx} density={fx.density} dpr={fx.dpr} paused={fx.paused} />}
      </div>
    </div>
  </div>;
}

/**
 * The cinematic backdrop behind every menu screen: the asset pack's painting
 * for the screen, with its atmosphere drawn over it. Views of the same
 * painting (a trial's chapter view and result) glide between framings; a new
 * painting is decoded first and then cross-fades in. The voyage chart draws
 * its own stage, so the backdrop stays dark beneath it.
 */
export function CinemaBackdrop({ world, quality, still, paused = false }: { world: WorldSpec; quality: Quality; still: boolean; paused?: boolean }) {
  const env = envFor(world);
  const framing: Framing = world.kind === "trial" ? world.framing : "wide";
  const [current, setCurrent] = useState<EnvId | null>(null);
  const [leaving, setLeaving] = useState<EnvId | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const budget = QUALITY_BUDGET[quality];
  const moving = !still && budget.drift;

  useEffect(() => {
    if (env === current) return;
    let live = true;
    const show = () => { if (!live) return; setLeaving(current); setCurrent(env); };
    if (env) preloadArt(envSrc(env)).then(show); else show();
    return () => { live = false; };
  }, [env, current]);
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), still ? 0 : 1100);
    return () => clearTimeout(t);
  }, [leaving, current, still]);

  // The camera leans a little towards the pointer.
  useEffect(() => {
    const el = root.current;
    if (!moving || !el) return;
    let raf = 0, x = 0, y = 0;
    const move = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth) * 2 - 1; y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; el.style.setProperty("--mx", x.toFixed(3)); el.style.setProperty("--my", y.toFixed(3)); });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); el.style.removeProperty("--mx"); el.style.removeProperty("--my"); };
  }, [moving]);

  const fx = moving ? { density: budget.particles, dpr: budget.dpr, paused } : null;
  return <div ref={root} className="cn-backdrop" data-world={world.kind} data-mood={world.kind === "trial" ? world.mood : undefined} data-moving={moving || undefined}>
    {/* Keyed by painting, so the one leaving stays mounted beneath while the new one fades in over it. */}
    {leaving && leaving !== current && <ArtStage key={leaving} env={leaving} framing={framing} fx={null} />}
    {current && <ArtStage key={current} env={current} framing={framing} fx={fx} />}
  </div>;
}
