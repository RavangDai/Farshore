"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { TrialId } from "../../../lib/arcade/arcade";
import { QUALITY_BUDGET, type Quality } from "../../../lib/cinema/quality";
import { worldKey, type WorldSpec } from "../../../lib/cinema/scenes";
import { MapWorld } from "./map-world";
import { AegeanWorld, TrialWorld } from "./worlds";

export type StageProps = {
  world: WorldSpec;
  quality: Exclude<Quality, "lite">;
  still: boolean;
  /** Stops drawing while a film or the gameplay has the GPU. */
  paused?: boolean;
  map: { selected: TrialId; cleared: TrialId[]; onSelect: (id: TrialId) => void };
  onFail: () => void;
  /** Called with the world's key once its shaders are compiled and its first frame can draw. */
  onReady?: (key: string) => void;
};

/**
 * Every world carries the same number of point lights (padding with dark
 * ones), so the standard materials compile once and are shared by all the
 * worlds instead of recompiling for each light count.
 */
const POINT_LIGHTS = 6;
function LightBalancer() {
  const scene = useThree(s => s.scene);
  useEffect(() => {
    let count = 0;
    scene.traverse(o => { if ((o as THREE.PointLight).isPointLight && !o.userData.pad) count++; });
    const pads: THREE.PointLight[] = [];
    for (let i = count; i < POINT_LIGHTS; i++) {
      const pad = new THREE.PointLight(0x000000, 0, 1);
      pad.position.set(0, -500, 0);
      pad.userData.pad = true;
      scene.add(pad);
      pads.push(pad);
    }
    return () => pads.forEach(p => scene.remove(p));
  }, [scene]);
  return null;
}

/**
 * Compiles the new world's shaders off the main thread (KHR_parallel_shader_compile
 * where the browser has it) before its first frame, so a world change never
 * freezes the interface. The frame loop waits on this.
 */
function Warmup({ onDone }: { onDone: () => void }) {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    let live = true;
    const done = () => {
      if (!live) return;
      onDone();
      let n = 0;
      const tick = () => { invalidate(); if (++n < 6 && live) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    };
    gl.compileAsync(scene, camera).then(done, done);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * Lowers the resolution when frames run long, and raises it again when there
 * is headroom, so the backdrop never costs the menus their responsiveness.
 */
function Governor({ range }: { range: [number, number] }) {
  const setDpr = useThree(s => s.setDpr);
  const dpr = useRef(range[1]), acc = useRef({ t: 0, n: 0 });
  useFrame((_, dt) => {
    const a = acc.current; a.t += dt; a.n++;
    if (a.t < 2) return;
    const avg = a.t / a.n; a.t = 0; a.n = 0;
    const next = avg > 1 / 32 ? Math.max(range[0], dpr.current - 0.2) : avg < 1 / 55 ? Math.min(range[1], dpr.current + 0.1) : dpr.current;
    if (Math.abs(next - dpr.current) > 0.01) { dpr.current = next; setDpr(next); }
  });
  return null;
}

export default function CinemaStage({ world, quality, still, paused = false, map, onFail, onReady }: StageProps) {
  const budget = QUALITY_BUDGET[quality];
  const key = worldKey(world);
  const [ready, setReady] = useState<string | null>(null);
  // R3F forces a context loss when the canvas unmounts (gameplay takes the GPU); only a
  // loss while the stage is still mounted is a real failure.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const common = { still, share: budget.particles, segments: budget.segments };
  const warm = ready === key;
  return <Canvas
    className="cn-canvas"
    dpr={budget.dpr}
    frameloop={paused || !warm ? "never" : still ? "demand" : "always"}
    gl={{ antialias: budget.antialias, powerPreference: "high-performance", alpha: false, stencil: false }}
    camera={{ fov: 45, near: 0.1, far: 1400, position: [0, 2.4, 14] }}
    onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.domElement.addEventListener("webglcontextlost", e => { e.preventDefault(); window.setTimeout(() => { if (mounted.current) onFail(); }, 0); }, { once: true });
    }}
  >
    <Suspense fallback={null}>
      <group key={key}>
        {world.kind === "aegean" ? <AegeanWorld {...common} dim={world.dim ? 0.5 : 1} />
          : world.kind === "map" ? <MapWorld {...common} {...map} />
            : <TrialWorld id={world.id} framing={world.framing} mood={world.mood} {...common} />}
        <LightBalancer />
        <Warmup onDone={() => { setReady(key); onReady?.(key); }} />
      </group>
    </Suspense>
    {!still && warm && <Governor range={budget.dpr} />}
  </Canvas>;
}
