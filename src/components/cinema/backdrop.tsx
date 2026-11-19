"use client";
import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { TrialId } from "../../lib/arcade/arcade";
import { trials } from "../../lib/arcade/arcade";
import { ART } from "../../lib/art";
import type { Quality } from "../../lib/cinema/quality";
import { worldKey, type WorldSpec } from "../../lib/cinema/scenes";

const Stage = lazy(() => import("./three/stage"));

/** Catches a failure inside the 3D stage (shader compile, lost context) and falls back to paint. */
class StageBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** The painted fallback: the original illustrations, slowly drifting. Used on Lite and without WebGL. */
export function PaintedBackdrop({ world }: { world: WorldSpec }) {
  const index = world.kind === "trial" ? trials.findIndex(t => t.id === world.id) : -1;
  const style: CSSProperties = index >= 0
    ? { backgroundImage: `url('${ART.hd.trials}')`, backgroundSize: "400% 300%", backgroundPosition: `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 50}%` }
    : { backgroundImage: `url('${ART.hd.sea}')`, backgroundSize: "cover", backgroundPosition: world.kind === "map" ? "60% 70%" : "50% 50%" };
  return <div className="cn-painted" data-kind={world.kind} data-mood={world.kind === "trial" ? world.mood : undefined}><i style={style} /></div>;
}

/**
 * The single cinematic backdrop behind every menu screen. Worlds that share a
 * key (a trial's chapter view, briefing and result) glide between camera
 * framings in place; a different world dips to dark and back, like a cut.
 */
export function CinemaBackdrop({ world, quality, still, paused = false, map, onFail }: { world: WorldSpec; quality: Quality; still: boolean; paused?: boolean; map: { selected: TrialId; cleared: TrialId[]; onSelect: (id: TrialId) => void }; onFail: () => void }) {
  const [shown, setShown] = useState(world);
  const [veil, setVeil] = useState(false);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const signature = JSON.stringify(world);
  const shownKey = useRef(worldKey(world));
  const painted = quality === "lite";
  useEffect(() => {
    const next = JSON.parse(signature) as WorldSpec;
    if (worldKey(next) === shownKey.current) { setShown(next); return; }
    if (still) { shownKey.current = worldKey(next); setShown(next); return; }
    setVeil(true);
    const swap = window.setTimeout(() => { shownKey.current = worldKey(next); setShown(next); }, 420);
    // Failsafe: the veil never stays down longer than this, compiled or not.
    const lift = window.setTimeout(() => setVeil(false), 5200);
    return () => { clearTimeout(swap); clearTimeout(lift); };
  }, [signature, still]);
  // The veil lifts once the new world has compiled its shaders and drawn (or at once when painted).
  useEffect(() => {
    if (!veil) return;
    const key = worldKey(shown);
    if (key !== shownKey.current || (!painted && readyKey !== key)) return;
    const t = window.setTimeout(() => setVeil(false), 160);
    return () => clearTimeout(t);
  }, [veil, shown, readyKey, painted]);
  return <div className="cn-backdrop" data-mood={shown.kind === "trial" ? shown.mood : undefined} data-world={shown.kind}>
    {painted ? <PaintedBackdrop world={shown} /> : <StageBoundary onFail={onFail}>
      <Suspense fallback={<PaintedBackdrop world={shown} />}>
        <Stage world={shown} quality={quality} still={still} paused={paused} map={map} onFail={onFail} onReady={setReadyKey} />
      </Suspense>
    </StageBoundary>}
    <div className="cn-veil" data-on={veil || undefined} aria-hidden="true" />
  </div>;
}
