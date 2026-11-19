"use client";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { TrialId } from "../../../lib/arcade/arcade";
import { ISLANDS, ROUTE, mapLabels } from "../../../lib/cinema/map-layout";
import { MAP_LOOK, TRIAL_LOOKS, type Vec3 } from "../../../lib/cinema/scenes";
import { Flame, Mist, Ocean, Whirlpool, sea, waveHeight } from "./fx";
import { animateShip, arch, brazier, columns, cypresses, islandBase, lotus, palm, raft, rock, serpent, ship, shrubs, temple, tholos, type ColumnSpot } from "./kit";
import { Glow, Ridges } from "./sky";
import { Atmosphere, StillFrames, useBuilt } from "./world-kit";

export type MapProps = { still: boolean; share: number; segments: number; selected: TrialId; cleared: TrialId[]; onSelect: (id: TrialId) => void };

/** The landmark that names each island at a glance. */
function landmark(id: TrialId): THREE.Group {
  const g = new THREE.Group();
  const add = (o: THREE.Object3D, p: Vec3 = [0, 0, 0], s = 1, ry = 0) => { o.position.set(...p); o.scale.multiplyScalar(s); o.rotation.y = ry; g.add(o); return o; };
  switch (id) {
    case "lotus":
      add(columns([[-0.9, 0, -0.6], [0, 0, -0.9], [0.9, 0, -0.6], [-1.2, 0, 0.4]].map((p, i): ColumnSpot => ({ p: p as Vec3, h: [1, 0.5, 1, 0.7][i], broken: i % 2 === 1 })), 0.12, 1.1), [0, 0.6, 0]);
      add(lotus({ size: 0.55 }), [0.4, 0.66, 0.6]);
      add(shrubs([[1.2, 0.8, -0.2], [-1.4, 0.8, -0.3], [0.2, 0.8, -1.4]].map(p => ({ p: p as Vec3, s: 0.32 })), ["#ff7fb6", "#e9609c"], 0.4, 3, "#ff5fa2"));
      break;
    case "cyclops": {
      const m = rock({ size: [1.8, 2.6, 1.6], seed: 14, color: "#5b5047", rough: 0.6 }); add(m, [0, 1.6, -0.2]);
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16, 0, Math.PI), new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ff7a2a", emissiveIntensity: 2.2 }));
      add(mouth, [0, 0.72, 1.32]);
      break;
    }
    case "aeolus":
      add(tholos({ radius: 0.7, count: 8, h: 0.95, lit: null }), [0, 0.62, 0]);
      add(rock({ size: [0.9, 0.5, 0.9], seed: 4, color: "#606a78", detail: 2 }), [1.3, 0.8, -0.6]);
      break;
    case "circe":
      add(temple({ w: 2.2, d: 1.6, front: 5, side: 4, h: 0.85, radius: 0.08, lit: "#b47cff", seed: 3 }), [0, 0.6, -0.2]);
      add(shrubs([[1.6, 0.9, 0.6], [-1.6, 0.9, 0.5], [1.4, 0.9, -1.1], [-1.5, 0.9, -1]].map(p => ({ p: p as Vec3, s: 0.42 })), ["#6b3fa0", "#8a55c4", "#4c2a78"], 0.35, 8, "#8a4fe0"));
      break;
    case "sirens":
      [[0, 1, 0, 0.8, 1.9], [-0.9, 0.8, 0.5, 0.6, 1.3], [0.9, 0.8, -0.4, 0.55, 1.5]].forEach(([x, y, z, w, h], i) => add(rock({ size: [w, h, w], seed: 30 + i, color: "#36404f", rough: 0.6 }), [x, y, z]));
      break;
    case "scylla":
      add(rock({ size: [1, 2.6, 1], seed: 41, color: "#2c3439", rough: 0.6 }), [-1.2, 1.4, -0.4]);
      add(serpent({ points: [[0, 0, 0], [0.5, 1.2, 0.3], [1, 2, 0.8], [1.6, 2.2, 1.3]], radius: 0.13 }), [-1, 0.6, 0]);
      add(serpent({ points: [[0, 0, 0], [0.3, 1.4, -0.2], [0.8, 2.5, 0.2], [1.4, 2.6, 0.8]], radius: 0.12 }), [-1.3, 0.6, -0.5]);
      break;
    case "calypso":
      add(palm({ height: 1.9, lean: 0.35, seed: 3 }), [-0.6, 0.6, 0]);
      add(palm({ height: 1.6, lean: -0.3, seed: 4 }), [0.4, 0.6, -0.7]);
      add(raft(), [1.4, 0.2, 1.4], 0.32, 0.6);
      break;
    case "bow":
      add(temple({ w: 2.6, d: 2.2, front: 6, side: 5, h: 1, radius: 0.09, lit: "#ffc070", seed: 9 }), [0, 0.6, -0.2]);
      add(cypresses([[-1.8, 0.5, -0.6], [1.9, 0.5, -0.5], [-1.6, 0.5, 0.9]].map(p => ({ p: p as Vec3, s: 0.32 }))));
      break;
  }
  return g;
}

const ISLAND_COLORS: Partial<Record<TrialId, [string, string]>> = { lotus: ["#5a5a4c", "#2c4a2c"], cyclops: ["#4f463e", "#3a3a2c"], aeolus: ["#5a6270", "#3b5640"], circe: ["#585068", "#3c3258"], sirens: ["#38404c", "#2f3a3c"], scylla: ["#2c3438", "#273034"], calypso: ["#8a7a62", "#cbb88a"], bow: ["#6b6556", "#4a5a36"] };

function Outcrop({ x, z, s, seed }: { x: number; z: number; s: number; seed: number }) {
  const object = useBuilt(() => rock({ size: [s, s * 0.6, s], seed, color: "#3e434a" }), [s, seed]);
  return <primitive object={object} position={[x, -0.2, z]} />;
}

function Island({ id, selected, cleared, still, onSelect }: { id: TrialId; selected: boolean; cleared: boolean; still: boolean; onSelect: (id: TrialId) => void }) {
  const isle = ISLANDS[id], [rockColor, grass] = ISLAND_COLORS[id] ?? ["#57524b", "#2f4a2a"];
  const base = useBuilt(() => islandBase({ radius: isle.radius * 0.8, height: 1, seed: id.length * 7, rockColor, grass }), [id]);
  const mark = useBuilt(() => { const g = landmark(id); g.scale.setScalar(0.72); g.position.y = 0.16; return g; }, [id]);
  const ring = useRef<THREE.Mesh>(null);
  const accent = TRIAL_LOOKS[id].accent;
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const m = ring.current.material as THREE.MeshBasicMaterial;
    const target = selected ? 0.85 : 0;
    m.opacity += (target - m.opacity) * 0.12;
    ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2) * 0.04);
  });
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#c99a52", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  const hover = (e: ThreeEvent<PointerEvent>, on: boolean) => { e.stopPropagation(); document.body.style.cursor = on ? "pointer" : ""; };
  return <group position={[isle.x, 0, isle.z]}
    onClick={e => { e.stopPropagation(); onSelect(id); }}
    onPointerOver={e => hover(e, true)} onPointerOut={e => hover(e, false)}>
    <primitive object={base} />
    <primitive object={mark} />
    <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.08, 0]} material={ringMat}><ringGeometry args={[isle.radius * 1.04, isle.radius * 1.09, 72]} /></mesh>
    <Glow position={[0, 1.4, 0]} color={accent} size={selected ? 6.5 : cleared ? 4 : 3} opacity={selected ? 0.5 : 0.28} />
    {id === "scylla" && <Whirlpool position={[1.4, 0.1, 1.2]} radius={1.3} still={still} />}
  </group>;
}

/** The route: a bronze thread from island to island, gold where the voyage has been. */
function Route({ cleared, still }: { cleared: TrialId[]; still: boolean }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(ROUTE.map(id => new THREE.Vector3(ISLANDS[id].x, 0.12, ISLANDS[id].z)), false, "catmullrom", 0.35), []);
  const done = cleared.length ? Math.max(...cleared.map(id => ROUTE.indexOf(id))) / (ROUTE.length - 1) : 0;
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDone: { value: done } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float uTime; uniform float uDone; varying vec2 vUv; void main(){ float along = vUv.x; float past = step(along, uDone + 0.001); float dash = smoothstep(0.35, 0.5, fract(along * 46.0 - uTime * 0.6)) * smoothstep(0.95, 0.8, fract(along * 46.0 - uTime * 0.6)); float a = mix(dash * 0.75, 1.0, past); vec3 col = mix(vec3(0.72, 0.53, 0.28), vec3(1.0, 0.82, 0.48), past); gl_FragColor = vec4(col * a, a); }",
  }), []);
  useEffect(() => { material.uniforms.uDone.value = done; }, [done, material]);
  useFrame((_, dt) => { if (!still) material.uniforms.uTime.value += dt; });
  return <mesh material={material} renderOrder={4}><tubeGeometry args={[curve, 400, 0.07, 6, false]} /></mesh>;
}

/** The galley sails the route toward the island in focus. */
function RouteShip({ selected, cleared, still }: { selected: TrialId; cleared: TrialId[]; still: boolean }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(ROUTE.map(id => new THREE.Vector3(ISLANDS[id].x, 0, ISLANDS[id].z)), false, "catmullrom", 0.35), []);
  const parts = useMemo(() => ship({ length: 7, crew: false }), []);
  const holder = useBuilt(() => parts.root, [parts]);
  const group = useRef<THREE.Group>(null);
  const last = cleared.length ? Math.max(...cleared.map(id => ROUTE.indexOf(id))) : 0;
  // The ship waits beside the island, never on top of it.
  const stop = (i: number) => Math.min(1, Math.max(0, i / (ROUTE.length - 1) + (i === ROUTE.length - 1 ? -0.035 : 0.035)));
  const at = useRef(stop(last)), goal = useRef(stop(last));
  useEffect(() => { goal.current = stop(ROUTE.indexOf(selected)); if (still) at.current = goal.current; }, [selected, still]);
  useFrame((_, dt) => {
    const g = group.current; if (!g) return;
    const diff = goal.current - at.current, step = Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.05);
    if (!still) at.current += step;
    const u = Math.min(0.999, Math.max(0.001, at.current)), p = curve.getPointAt(u), tan = curve.getTangentAt(u).multiplyScalar(Math.sign(diff) || 1);
    const t = sea.t, h = waveHeight(p.x, p.z, t, MAP_LOOK.water!.chop);
    g.position.set(p.x, h * 0.6, p.z);
    g.rotation.y = Math.atan2(tan.x, tan.z);
    animateShip(parts, t, 1, Math.abs(diff) > 0.002 ? 1 : 0.15);
  });
  return <group ref={group} scale={0.24}><primitive object={holder} /></group>;
}

/**
 * The chart's camera: drag to pan, wheel or pinch to zoom, both bounded; a
 * selected island draws the camera toward it. The DOM labels follow their
 * islands every frame.
 */
function ChartCamera({ selected, still }: { selected: TrialId; still: boolean }) {
  const { camera, gl, size } = useThree();
  // The chart sits a little left of centre: the selected trial's card holds the lower right.
  const view = useRef({ x: 2.6, z: -0.2, dist: 33 });
  const drag = useRef<{ x: number; y: number; vx: number; vz: number } | null>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const isle = ISLANDS[selected], v = view.current;
    // A gentle approach: lean toward the island, but keep the whole archipelago in frame.
    const target = { x: 2.6 + isle.x * 0.2, z: -0.2 + isle.z * 0.16, dist: 31 };
    if (still) { Object.assign(v, target); return; }
    const tween = gsap.to(v, { ...target, duration: 1.6, ease: "power3.inOut" });
    return () => { tween.kill(); };
  }, [selected, still]);
  useEffect(() => {
    const el = gl.domElement, v = view.current;
    const down = (e: PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vx: v.x, vz: v.z }; };
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const k = v.dist / 700;
      v.x = THREE.MathUtils.clamp(d.vx - (e.clientX - d.x) * k, -11, 11);
      v.z = THREE.MathUtils.clamp(d.vz - (e.clientY - d.y) * k, -7, 7);
      gsap.killTweensOf(v);
    };
    const up = () => { drag.current = null; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); gsap.killTweensOf(v); v.dist = THREE.MathUtils.clamp(v.dist * (1 + Math.sign(e.deltaY) * 0.08), 16, 40); };
    el.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { el.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); el.removeEventListener("wheel", wheel); };
  }, [gl]);
  useFrame(({ clock }) => {
    const v = view.current, t = still ? 0 : clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    // Portrait screens pull back and widen so the whole archipelago stays in frame.
    const aspect = size.width / Math.max(1, size.height), far = aspect < 0.8 ? 1.6 : aspect < 1.2 ? 1.35 : 1, fov = aspect < 0.8 ? 64 : 40;
    cam.position.set(v.x + Math.sin(t * 0.05) * 0.4, v.dist * 0.75 * far, v.z + v.dist * 0.68 * far);
    cam.lookAt(v.x, 0, v.z - 1.2);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    for (const id of ROUTE) {
      const el = mapLabels.get(id); if (!el) continue;
      const isle = ISLANDS[id];
      tmp.set(isle.x, isle.top + 0.5, isle.z).project(cam);
      const x = (tmp.x * 0.5 + 0.5) * size.width, y = (-tmp.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.visibility = tmp.z < 1 && y > 118 && y < size.height - 8 && x > 8 && x < size.width - 8 ? "visible" : "hidden";
    }
  });
  return null;
}

export function MapWorld({ still, share, segments, selected, cleared, onSelect }: MapProps) {
  const look = MAP_LOOK;
  return <>
    <Atmosphere look={look} still={still} share={share} envIntensity={0.7} />
    <ChartCamera selected={selected} still={still} />
    <StillFrames still={still} deps={[selected, cleared.length]} />
    <Ocean look={look} still={still} segments={segments} />
    {ROUTE.map(id => <Island key={id} id={id} selected={id === selected} cleared={cleared.includes(id)} still={still} onSelect={onSelect} />)}
    <Route cleared={cleared} still={still} />
    <RouteShip selected={selected} cleared={cleared} still={still} />
    {/* Outlying rocks and the far shore, to sell the scale. */}
    {([[-19, -6, 1.2], [-4, -1, 0.7], [4, 0.4, 0.9], [18, 3, 1.4], [-17, 9, 1], [12, -12, 1.3], [-12, -12, 1.1], [3, 12, 1.2], [20, -8, 0.9]] as const).map(([x, z, s], i) => <Outcrop key={i} x={x} z={z} s={s} seed={80 + i} />)}
    <group position={[-14, 0.6, -1.6]}>
      <Flame position={[1.2, 0.4, 1]} size={0.25} still={still} color="#ffb04a" />
    </group>
    <Ridges seed={41} layers={[{ z: -70, height: 9, color: "#22324a", lights: 6 }, { z: -50, height: 5, color: "#1a2638", width: 200, lights: 4 }]} />
    <Mist position={[-19, 1.2, 6]} size={[16, 6]} color="#b8c6dc" opacity={0.16} rotation={[-0.9, 0, 0]} still={still} />
    <Mist position={[19, 1.2, 8]} size={[16, 6]} color="#b8c6dc" opacity={0.14} rotation={[-0.9, 0, 0]} still={still} />
    <Mist position={[0, 2, -14]} size={[50, 8]} color="#9fb0c8" opacity={0.25} rotation={[-0.4, 0, 0]} still={still} />
    <Prop3 />
  </>;
}

/** A pair of braziers on Ithaca's quay and the Lotus shore, for a little warm light. */
function Prop3() {
  const a = useBuilt(() => brazier(0.25), []), b = useBuilt(() => arch({ span: 0.6, height: 1.1, pier: 0.18, depth: 0.25 }), []);
  return <>
    <primitive object={a} position={[ISLANDS.bow.x + 1.6, 0.6, ISLANDS.bow.z + 1]} />
    <primitive object={b} position={[ISLANDS.lotus.x - 1.3, 0.6, ISLANDS.lotus.z + 0.9]} />
  </>;
}
