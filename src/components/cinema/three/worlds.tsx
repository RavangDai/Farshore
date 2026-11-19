"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { TrialId } from "../../../lib/arcade/arcade";
import { AEGEAN_LOOK, TRIAL_LOOKS, type SceneLook, type Vec3 } from "../../../lib/cinema/scenes";
import { Flame, LightShaft, Mist, Ocean, Whirlpool, sea, waveHeight } from "./fx";
import { animateShip, arch, axes, brazier, cliff, columns, cypresses, islandBase, lilyPads, lotus, mat, palm, raft, rock, scatter, serpent, ship, shrubs, temple, tholos, type ColumnSpot } from "./kit";
import { Glow, LightningBolt, Ridges, flash } from "./sky";
import { floorTexture, rng, rockify } from "./util";
import { Atmosphere, CameraRig, StillFrames, useBuilt } from "./world-kit";

export type WorldProps = { still: boolean; share: number; segments: number; framing: "wide" | "close" | "result"; mood?: "victory" | "defeat" };

/** A built object placed in the world. */
function Prop({ make, deps = [], position, rotation, scale }: { make: () => THREE.Object3D; deps?: unknown[]; position?: Vec3; rotation?: Vec3; scale?: number | Vec3 }) {
  const object = useBuilt(make, deps);
  // Only override what the caller gives: builders such as rock() set their own scale.
  return <primitive object={object} {...(position ? { position } : {})} {...(rotation ? { rotation } : {})} {...(scale !== undefined ? { scale } : {})} />;
}

/** A galley riding the shared swell. */
export function Ship({ position, heading = 0, scale = 1, chop, still, wind = 1, rowing = 1, lanterns = true }: { position: Vec3; heading?: number; scale?: number; chop: number; still: boolean; wind?: number; rowing?: number; lanterns?: boolean }) {
  const parts = useMemo(() => ship({ lanterns }), [lanterns]);
  const holder = useBuilt(() => parts.root, [parts]);
  const group = useRef<THREE.Group>(null);
  const once = useRef(false);
  useFrame(() => {
    const t = sea.t;
    if (!still || !once.current) { animateShip(parts, t, wind, still ? 0 : rowing); once.current = true; }
    const g = group.current; if (!g) return;
    const [x, y, z] = position, h = waveHeight(x, z, t, chop);
    const sx = waveHeight(x + 2, z, t, chop) - waveHeight(x - 2, z, t, chop), sz = waveHeight(x, z + 3, t, chop) - waveHeight(x, z - 3, t, chop);
    g.position.set(x, y + h * 0.85 - 0.12 * scale, z);
    g.rotation.set(-sz * 0.18, heading, sx * 0.2);
  });
  return <group ref={group} position={position} rotation-y={heading} scale={scale}><primitive object={holder} /></group>;
}

function poseFor(look: SceneLook, framing: WorldProps["framing"]) {
  const c = framing === "close" ? look.camera.close : look.camera.wide;
  if (framing !== "result") return c;
  const w = look.camera.wide;
  return { ...w, position: [w.position[0] * 0.5, w.position[1] + 0.3, w.position[2] - 1.2] as Vec3 };
}

const moodDim = (mood?: WorldProps["mood"]) => (mood === "defeat" ? 0.62 : mood === "victory" ? 1.12 : 1);

/* ------------------------------------------------------------------ menu */

/** The opening scene: a moonlit Aegean coast, a temple on the cliffs, a galley at sea. */
export function AegeanWorld({ still, share, segments, dim = 1 }: { still: boolean; share: number; segments: number; dim?: number }) {
  const look = AEGEAN_LOOK;
  return <>
    <Atmosphere look={look} still={still} share={share} dim={dim} />
    <CameraRig pose={look.camera.wide} still={still} drift={1} parallax={0.8} />
    <StillFrames still={still} deps={[dim]} />
    <Ocean look={look} still={still} segments={segments} />
    <Ridges seed={4} layers={[{ z: -170, height: 15, color: "#1d2c48", lights: 0 }, { z: -125, height: 8, color: "#131f34", width: 300, x: -60, lights: 14 }, { z: -95, height: 5, color: "#0d1626", width: 160, x: -90, lights: 8, rough: 1.6 }]} />
    {/* The headland: a cliff, a temple and its terraces, cypresses and the lights of a town. */}
    <Prop make={() => cliff({ radius: 9, height: 15, seed: 5, color: "#6a6c70" })} position={[19, -1, -34]} />
    <Prop make={() => cliff({ radius: 6, height: 10, seed: 8, color: "#5c6068" })} position={[9, -1, -40]} />
    <Prop make={() => temple({ w: 6.5, d: 9, front: 6, side: 7, h: 3.1, lit: "#ffb05a", seed: 2 })} position={[17.5, 13.1, -37]} rotation={[0, -0.35, 0]} scale={0.95} />
    <Prop make={() => temple({ w: 4, d: 5, front: 4, side: 5, h: 2.4, lit: "#ffb05a", seed: 3 })} position={[10.5, 8.6, -42]} rotation={[0, -0.2, 0]} scale={0.8} />
    <Prop make={() => cypresses([[22, 14, -31], [23.5, 13.6, -34], [13.4, 13.4, -32], [12.6, 13, -35], [14.8, 13.2, -29.5], [8.4, 9.4, -38], [7.2, 9.1, -41]].map((p, i) => ({ p: p as Vec3, s: 0.9 + (i % 3) * 0.18 })))} />
    {[[14.2, 9.2, -27], [16.5, 6.4, -26.2], [21, 8.2, -27.5], [12, 4.2, -29], [18.4, 3.1, -25.5], [24, 5, -29], [9.6, 5.5, -34], [7.2, 3.2, -35]].map((p, i) => <Glow key={i} position={p as Vec3} color="#ffb867" size={1.1 + (i % 3) * 0.5} opacity={0.85} />)}
    <Glow position={[17.5, 16.4, -33]} color="#ffb05a" size={9} opacity={0.35} />
    {/* A far headland with its own small shrine. */}
    <Prop make={() => cliff({ radius: 5, height: 6, seed: 11, color: "#222b38" })} position={[-34, -1, -70]} />
    <Glow position={[-33, 6.2, -68]} color="#ffb867" size={2.4} opacity={0.6} />
    {/* Foreground rocks frame the lower left like the edge of a lens. */}
    <Prop make={() => rock({ size: [3.4, 2.2, 2.4], seed: 3, color: "#1d2128" })} position={[-10.5, -0.6, 4.5]} />
    <Prop make={() => rock({ size: [2.2, 1.4, 2], seed: 6, color: "#1a1e25" })} position={[-7.4, -0.7, 7.2]} />
    <Prop make={() => rock({ size: [1.6, 1.2, 1.4], seed: 9, color: "#2a2f37" })} position={[5, -0.4, -12]} />
    <Prop make={() => rock({ size: [2.6, 3.4, 2.2], seed: 12, color: "#262b33" })} position={[-3, -0.6, -26]} />
    <Ship position={[6.4, 0, -2.2]} heading={-1.15} scale={0.95} chop={look.water!.chop} still={still} />
    <Mist position={[10, 1.2, -24]} size={[60, 6]} color="#8ea3c4" opacity={0.28} still={still} />
    <Mist position={[-12, 0.9, -16]} size={[40, 4]} color="#7e93b6" opacity={0.2} speed={0.03} still={still} />
    <Mist position={[16, 4.2, -31]} size={[22, 5]} color="#9fb0cc" opacity={0.22} still={still} />
  </>;
}

/* ---------------------------------------------------------------- trials */

function LotusWorld({ still, share, segments, framing, mood }: WorldProps) {
  const look = TRIAL_LOOKS.lotus;
  const pond = { x: 1.5, z: -5, r: 7.5 };
  const banks = useMemo(() => scatter(42, pond.r - 0.3, pond.r + 3, 0, 4).map(p => [p[0] + pond.x, -0.1, p[2] + pond.z] as Vec3), [pond.r, pond.x, pond.z]);
  return <>
    <Atmosphere look={look} still={still} share={share} dim={moodDim(mood)} envIntensity={0.7} />
    <CameraRig pose={poseFor(look, framing)} still={still} drift={0.7} parallax={0.6} />
    <StillFrames still={still} deps={[framing, mood]} />
    <Ocean look={look} still={still} segments={segments * 0.5} />
    {/* Garden ground with the pond cut out of it. */}
    <mesh rotation-x={-Math.PI / 2} position={[pond.x, 0.04, pond.z]} material={useMemo(() => new THREE.MeshStandardMaterial({ color: "#1f3420", roughness: 1 }), [])}><ringGeometry args={[pond.r, 80, 64, 1]} /></mesh>
    <Prop make={() => shrubs(banks.map((p, i) => ({ p, s: 0.45 + (i % 4) * 0.18 })), ["#5f6157", "#4b4c45", "#6b6a60"], 0, 21)} />
    <Prop make={() => shrubs(scatter(26, pond.r + 1, pond.r + 7, 0.3, 8).filter(([x, , z]) => z < pond.z + 2 || x < -2).map((p, i) => ({ p: [p[0] + pond.x, p[1], p[2] + pond.z] as Vec3, s: 0.7 + (i % 5) * 0.25 })), ["#1e4d2b", "#24603a", "#173d23", "#2d6b3c"], 0, 13)} />
    <Prop make={() => shrubs(scatter(30, pond.r + 0.8, pond.r + 6, 0.7, 19).filter(([x, , z]) => z < pond.z + 2 || x < -2).map((p, i) => ({ p: [p[0] + pond.x, p[1] + (i % 3) * 0.2, p[2] + pond.z] as Vec3, s: 0.32 + (i % 4) * 0.1 })), ["#ff7fb6", "#f05f9b", "#ffa3cb"], 0.45, 31, "#ff5fa2")} />
    {/* The great lotus and its court of smaller flowers. */}
    <Prop make={() => lotus({ size: 1.9 })} position={[2.6, 0.06, -5.2]} />
    <Glow position={[2.6, 0.9, -5.2]} color="#ffd27a" size={3.6} opacity={0.6} />
    <Glow position={[2.6, 0.7, -5.2]} color="#ff7fb8" size={7} opacity={0.26} />
    <pointLight color="#ffb6d3" intensity={9} distance={14} decay={1.6} position={[2.6, 1.6, -5.2]} />
    {([[-1.6, -2.2, 0.55], [5.8, -2.6, 0.6], [-0.4, -7.6, 0.5], [5, -8.6, 0.45], [-3.2, -5.6, 0.4], [7.2, -5.2, 0.5]] as const).map(([x, z, s], i) => <group key={i}><Prop make={() => lotus({ size: s, intensity: 0.26 })} position={[x, 0.05, z]} rotation={[0, i, 0]} /><Glow position={[x, 0.35, z]} color="#ff9ccb" size={1.6} opacity={0.5} /></group>)}
    <Prop make={() => lilyPads(scatter(34, 1.2, pond.r - 0.6, 0.03, 6).map((p, i) => ({ p: [p[0] + pond.x, 0.03, p[2] + pond.z] as Vec3, s: 0.3 + (i % 4) * 0.12 })))} />
    {/* Ruins: an arch, a broken colonnade, steps to a temple on the hill. */}
    <Prop make={() => arch({ span: 2.6, height: 5.4, pier: 0.75, depth: 1.1 })} position={[-5.4, 0, -8.6]} rotation={[0, 0.35, 0]} />
    <Prop make={() => columns(([[6.5, 0, -11], [8.8, 0, -11.6], [11.1, 0, -12.2], [13.4, 0, -12.8], [7.2, 0, -14.6], [9.6, 0, -15.2], [12, 0, -15.8]] as Vec3[]).map((p, i): ColumnSpot => ({ p, h: [1, 0.55, 1, 0.3, 1, 0.8, 1][i], broken: [false, true, false, true, false, true, false][i] })), 0.34, 3.6)} />
    <Prop make={() => { const g = new THREE.Group(), m = mat.marble("#cfc3ad"); for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(5.4 - i * 0.2, 0.32, 0.9), m); s.position.set(0, 0.16 + i * 0.32, -i * 0.9); g.add(s); } return g; }} position={[1.2, 0, -12.5]} />
    <Prop make={() => temple({ w: 6, d: 8, front: 6, side: 7, h: 3, lit: "#ffc27a", seed: 6, ruined: 0.2 })} position={[1.5, 6.5, -34]} scale={1.2} />
    <Prop make={() => islandBase({ radius: 12, height: 7, seed: 7, rockColor: "#3f4339", grass: "#20361f" })} position={[1.5, 0, -36]} />
    {([[-2.2, 0.9, -11], [4.6, 0.9, -11]] as Vec3[]).map((p, i) => <group key={i}><Prop make={() => brazier(0.8)} position={p} /><Flame position={[p[0], p[1] + 0.35, p[2]]} size={0.9} light={i === 0 ? 5 : 0} distance={10} still={still} color="#ffae4d" /></group>)}
    <Prop make={() => cypresses([[-8, 0, -14], [-9.8, 0, -17], [-6.4, 0, -19], [10.5, 0, -20], [14, 0, -18], [16.5, 0, -22], [-4, 4, -30], [7, 4, -30]].map((p, i) => ({ p: p as Vec3, s: 1 + (i % 3) * 0.25 })), "#163a24")} />
    <Ridges seed={9} layers={[{ z: -80, height: 9, color: "#1e2a33" }, { z: -60, height: 5, color: "#16231d", width: 200 }]} />
    <Mist position={[pond.x, 0.45, pond.z - 1]} size={[22, 3]} color="#c9b3d8" opacity={0.3} still={still} />
    <Mist position={[0, 2.5, -24]} size={[50, 7]} color="#9b86a8" opacity={0.3} speed={0.015} still={still} />
  </>;
}

function CyclopsWorld({ still, share, segments, framing, mood }: WorldProps) {
  const look = TRIAL_LOOKS.cyclops;
  void segments;
  const eye = useRef<THREE.Group>(null);
  const pole = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2b1a0e", roughness: 0.85 }), []);
  useFrame(({ clock }) => {
    if (!eye.current || still) return;
    const t = clock.elapsedTime;
    eye.current.position.x = Math.sin(t * 0.23) * 1.6;
    eye.current.position.y = 6.2 + Math.sin(t * 0.37) * 0.3;
    const blink = Math.max(0, Math.sin(t * 0.9)) > 0.995 ? 0.1 : 1;
    eye.current.scale.y += (blink - eye.current.scale.y) * 0.3;
  });
  return <>
    <Atmosphere look={look} still={still} share={share} dim={moodDim(mood)} envIntensity={0.25} />
    <CameraRig pose={poseFor(look, framing)} still={still} drift={0.6} parallax={0.6} />
    <StillFrames still={still} deps={[framing, mood]} />
    {/* The cave: a long rough tunnel lit from inside. */}
    <Prop make={() => {
      const geo = new THREE.CylinderGeometry(9, 9, 70, 48, 28, true); geo.rotateX(Math.PI / 2);
      const pos = geo.attributes.position as THREE.BufferAttribute; const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const n = Math.sin(v.z * 0.4) * 0.6 + Math.sin(v.x * 1.3 + v.z * 0.7) * 0.5; const k = 1 - (0.08 + n * 0.06); pos.setXYZ(i, v.x * k, v.y < -4 ? -4.2 : v.y * k, v.z); }
      geo.computeVertexNormals();
      const colors = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { const g = 0.5 + Math.random() * 0.25; colors.set([g, g * 0.9, g * 0.82], i * 3); }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#7a6250", roughness: 1, vertexColors: true, side: THREE.BackSide }));
    }} position={[0, 4, -20]} />
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -18]} material={useMemo(() => new THREE.MeshStandardMaterial({ color: "#2b211b", roughness: 1 }), [])}><planeGeometry args={[30, 70]} /></mesh>
    {([[-4.8, -0.2, -3, 1.6], [5.4, -0.3, -6, 2], [-6, -0.2, -13, 2.2], [3.2, -0.3, -16, 1.4], [-2.4, -0.2, -22, 1.2], [6.5, -0.2, -24, 2.4]] as const).map(([x, y, z, s], i) => <Prop key={i} make={() => rock({ size: [s, s * 0.8, s], seed: i + 3, color: "#5a463a" })} position={[x, y, z]} />)}
    {/* Sheep: the way out, if you hold on tight. */}
    <Prop make={() => shrubs([[-2.4, 0.55, -2], [-1.2, 0.5, -3.4], [2.8, 0.55, -4.2], [3.9, 0.5, -2.8]].map(p => ({ p: p as Vec3, s: 0.62 })), ["#d9cfbf", "#cbbfac", "#e6dccb"], 0, 41)} />
    {([[-6.4, 2.6, -8], [6.4, 2.6, -12], [-6, 2.6, -20], [6, 2.6, -26]] as Vec3[]).map((p, i) => <group key={i}><mesh position={[p[0], p[1] - 1.3, p[2]]} material={pole}><cylinderGeometry args={[0.07, 0.09, 2.6, 6]} /></mesh><Flame position={p} size={1.5} light={i < 3 ? 12 : 0} distance={16} still={still} color="#ff8a3a" /></group>)}
    <LightShaft position={[1.5, 6, -14]} rotation={[0, 0, 0.12]} height={9} radius={[0.6, 2.4]} color="#ffb070" opacity={0.18} />
    <LightShaft position={[-2, 6.4, -24]} rotation={[0.1, 0, -0.08]} height={9} radius={[0.5, 2]} color="#ff9a55" opacity={0.14} />
    {/* Polyphemus waits in the dark: a mountain of shadow and one burning eye. */}
    <group position={[0, 0, -27]}>
      <Prop make={() => { const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: "#120a06", roughness: 1 }); const add = (s: Vec3, p: Vec3) => { const b = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m); b.scale.set(...s); b.position.set(...p); g.add(b); }; add([4.2, 3.6, 3], [0, 6, 0]); add([7.5, 4.5, 4], [0, 2, 1]); add([2.4, 3.6, 2.4], [-6, 3.5, 2]); add([2.4, 3.6, 2.4], [6, 3.5, 2]); return g; }} />
      <group ref={eye} position={[0, 6.2, 3.1]}>
        <mesh material={useMemo(() => { const m = mat.glow("#ffb347", 5); m.fog = false; return m; }, [])}><sphereGeometry args={[0.55, 20, 14]} /></mesh>
        <mesh position={[0, 0, 0.45]} material={useMemo(() => mat.basic("#1a0800"), [])}><sphereGeometry args={[0.18, 12, 8]} /></mesh>
        <Glow position={[0, 0, 0.2]} color="#ff8a2a" size={7} opacity={0.9} fog={false} />
        <Glow position={[0, 0, 0.3]} color="#ffd27a" size={2.2} opacity={0.9} fog={false} />
      </group>
      <pointLight color="#ff7a2a" intensity={22} distance={22} decay={1.6} position={[0, 6, 5]} />
    </group>
    <Mist position={[0, 1, -10]} size={[18, 4]} color="#5a3420" opacity={0.35} still={still} />
    <Mist position={[0, 3, -28]} size={[20, 8]} color="#3a2216" opacity={0.45} still={still} />
  </>;
}

function AeolusWorld({ still, share, segments, framing, mood }: WorldProps) {
  const look = TRIAL_LOOKS.aeolus;
  const isle = useRef<THREE.Group>(null), debris = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime;
    if (isle.current) { isle.current.position.y = 5.2 + Math.sin(t * 0.5) * 0.25; isle.current.rotation.y = Math.sin(t * 0.1) * 0.05; }
    if (debris.current) debris.current.rotation.y = t * 0.22;
  });
  const ribbons = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 3.2 + i * 1.3, r = 3.4 + i * 0.6 + Math.sin(k * 0.3) * 0.4; pts.push(new THREE.Vector3(Math.cos(a) * r, -1 + k * 0.12 + i * 0.4, Math.sin(a) * r)); }
    return new THREE.CatmullRomCurve3(pts);
  }), []);
  const ribbonMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float uTime; varying vec2 vUv; void main(){ float d = fract(vUv.x * 3.0 - uTime * 0.35); float a = smoothstep(0.0, 0.25, d) * smoothstep(0.7, 0.3, d) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.85, vUv.x) * 0.5; gl_FragColor = vec4(vec3(0.85, 0.93, 1.0) * a, a); }",
  }), []);
  useFrame((_, dt) => { if (!still) ribbonMat.uniforms.uTime.value += dt; });
  return <>
    <Atmosphere look={look} still={still} share={share} dim={moodDim(mood)} />
    <CameraRig pose={poseFor(look, framing)} still={still} drift={1} parallax={0.7} />
    <StillFrames still={still} deps={[framing, mood]} />
    <Ocean look={look} still={still} segments={segments} />
    <group ref={isle} position={[2.4, 5.2, -12]}>
      <Prop make={() => { const geo = new THREE.ConeGeometry(4.6, 7, 28, 10); geo.rotateX(Math.PI); geo.translate(0, -3.5, 0); return new THREE.Mesh(rockify(geo, 1.4, 0.55, 22, 0, true), mat.stone("#4d5560")); }} />
      <Prop make={() => islandBase({ radius: 4.6, height: 1, seed: 21, rockColor: "#566070", grass: "#3b5640" })} position={[0, -0.6, 0]} />
      <Prop make={() => tholos({ radius: 1.9, count: 10, h: 2.6 })} position={[0, 0.1, 0]} />
      <Glow position={[0, 2, 0]} color="#cfe4ff" size={6} opacity={0.4} />
      {ribbons.map((c, i) => <mesh key={i} material={ribbonMat}><tubeGeometry args={[c, 120, 0.05 + i * 0.01, 6, false]} /></mesh>)}
      <group ref={debris}>{scatter(12, 5.6, 8, 0, 33).map((p, i) => <Prop key={i} make={() => rock({ size: [0.35 + (i % 3) * 0.2, 0.3, 0.3], seed: 40 + i, color: "#59616c", detail: 1 })} position={[p[0], -1 + (i % 5) * 0.7, p[2]]} />)}</group>
    </group>
    <Ship position={[5.2, 0, -2.5]} heading={-2.4} scale={0.8} chop={look.water!.chop} still={still} wind={1.7} rowing={0.4} />
    <Prop make={() => cliff({ radius: 5, height: 9, seed: 23, color: "#2c333d" })} position={[-16, -1, -26]} />
    <Prop make={() => cliff({ radius: 3, height: 6, seed: 24, color: "#2a313a" })} position={[15, -1, -30]} />
    <Ridges seed={12} layers={[{ z: -120, height: 10, color: "#26364a" }]} />
    <Mist position={[0, 1, -14]} size={[50, 5]} color="#a9bed6" opacity={0.25} speed={0.06} still={still} />
  </>;
}

function CirceWorld({ still, share, segments, framing, mood }: WorldProps) {
  const look = TRIAL_LOOKS.circe;
  return <>
    <Atmosphere look={look} still={still} share={share} dim={moodDim(mood)} envIntensity={0.7} />
    <CameraRig pose={poseFor(look, framing)} still={still} drift={0.7} parallax={0.6} />
    <StillFrames still={still} deps={[framing, mood]} />
    <Ocean look={look} still={still} segments={segments * 0.5} />
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, -6]} material={useMemo(() => mat.marble("#6f6577"), [])}><ringGeometry args={[5.5, 70, 48, 1]} /></mesh>
    <Prop make={() => { const g = new THREE.Group(), m = mat.marble("#cbbfd3"); for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(9 - i * 0.3, 0.3, 0.8), m); s.position.set(0, 0.15 + i * 0.3, -i * 0.8); g.add(s); } return g; }} position={[0, 0, -11]} />
    <Prop make={() => temple({ w: 9, d: 7, front: 7, side: 6, h: 3.6, lit: "#b47cff", seed: 14 })} position={[0, 1.8, -19]} />
    <Prop make={() => columns([-6.5, -8.8, -11.1, 6.5, 8.8, 11.1].map((x, i): ColumnSpot => ({ p: [x, 0, -12 - (i % 3) * 1.2] })), 0.3, 3.4, mat.marble("#d6cce0"))} />
    <Prop make={() => { const g = new THREE.Group(), m = mat.marble("#cbbfd3"); for (const x of [-8.8, 8.8]) { const b = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.4, 0.9), m); b.position.set(x, 4.25, -13.2); g.add(b); } return g; }} />
    {([[-3.6, 0, -9], [3.6, 0, -9], [-6.4, 1.8, -15], [6.4, 1.8, -15]] as Vec3[]).map((p, i) => <group key={i}><Prop make={() => brazier(0.85)} position={p} /><Flame position={[p[0], p[1] + 1.4, p[2]]} size={1} light={i < 2 ? 6 : 0} distance={11} still={still} color="#b47cff" /></group>)}
    <Prop make={() => shrubs(scatter(36, 9, 15, 0.8, 51).filter(([, , z]) => z < 3).map((p, i) => ({ p: [p[0], 0.6 + (i % 3) * 0.4, p[2] - 10] as Vec3, s: 0.9 + (i % 4) * 0.3 })), ["#4b2a6e", "#5e3489", "#3a2056", "#7a49b0"], 0.25, 52, "#7c3fc4")} />
    <Prop make={() => cypresses([[-12, 0, -22], [-14, 0, -18], [12.5, 0, -22], [14.5, 0, -17]].map(p => ({ p: p as Vec3, s: 1.2 })), "#1d1630")} />
    <Glow position={[0, 3.6, -15]} color="#b47cff" size={14} opacity={0.35} />
    <pointLight color="#c08cff" intensity={10} distance={18} decay={1.6} position={[0, 3, -12]} />
    <Ridges seed={17} layers={[{ z: -90, height: 12, color: "#251a3d" }, { z: -60, height: 6, color: "#1a1230", width: 220 }]} />
    <Mist position={[0, 0.5, -4]} size={[30, 3]} color="#a67fe0" opacity={0.3} still={still} />
    <Mist position={[0, 2.5, -22]} size={[40, 6]} color="#6d4ea8" opacity={0.3} still={still} />
  </>;
}

function SirensWorld({ still, share, segments, framing, mood }: WorldProps) {
  const look = TRIAL_LOOKS.sirens;
  return <>
    <Atmosphere look={look} still={still} share={share} dim={moodDim(mood)} />
    <CameraRig pose={poseFor(look, framing)} still={still} drift={1} parallax={0.7} />
    <StillFrames still={still} deps={[framing, mood]} />
    <Ocean look={look} still={still} segments={segments} />
    {([[-9, -0.5, -16, 3, 7, 2.6, 2], [-13, -0.5, -22, 3.6, 10, 3, 3], [-5.5, -0.5, -24, 2, 4.5, 2, 4], [9, -0.5, -18, 2.6, 6, 2.4, 5], [13, -0.5, -27, 4, 11, 3.4, 6], [4.5, -0.5, -30, 2, 4, 2, 7], [-2, -0.5, -10, 1.6, 1.4, 1.4, 8], [6, -0.5, -8, 1.2, 1, 1.4, 9]] as const).map(([x, y, z, sx, sy, sz, seed]) => <Prop key={seed} make={() => rock({ size: [sx, sy, sz], seed, color: "#1f2633", rough: 0.6 })} position={[x, y, z]} />)}
    {/* The Sirens: pale shapes on the rocks, lit by their own song. */}
    {([[-8.7, 6.3, -15.4], [9.2, 5.4, -17.4], [-12.6, 9.4, -21]] as Vec3[]).map((p, i) => <group key={i}>
      <Glow position={p} color="#cfe0ff" size={2.6} opacity={0.65} />
      <Prop make={() => { const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: "#9fb2d8", emissive: "#3b4f7a", emissiveIntensity: 0.6, roughness: 0.6 }); const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.8, 4, 10), m); body.position.y = 0.6; g.add(body); const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), m); head.position.y = 1.35; g.add(head); for (const s of [-1, 1]) { const wing = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 4), m); wing.position.set(s * 0.42, 0.75, -0.15); wing.rotation.set(0.2, 0, s * -0.35); g.add(wing); } return g; }} position={[p[0], p[1] - 1.2, p[2]]} scale={0.9} />
    </group>)}
    <Ship position={[1.5, 0, -20]} heading={1.45} scale={0.7} chop={look.water!.chop} still={still} rowing={1.2} />
    <Ridges seed={21} layers={[{ z: -150, height: 6, color: "#13213b" }]} />
    <Mist position={[0, 0.8, -14]} size={[60, 4]} color="#9fb5e0" opacity={0.3} speed={0.03} still={still} />
    <Mist position={[0, 2.4, -30]} size={[70, 7]} color="#7d95c7" opacity={0.28} speed={0.02} still={still} />
  </>;
}

function ScyllaWorld({ still, share, segments, framing, mood }: WorldProps) {
  const look = TRIAL_LOOKS.scylla;
  const heads = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (still || !heads.current) return;
    const t = clock.elapsedTime;
    heads.current.children.forEach((c, i) => { c.rotation.z = Math.sin(t * 0.6 + i * 1.7) * 0.05; c.rotation.x = Math.sin(t * 0.45 + i) * 0.04; });
  });
  return <>
    <Atmosphere look={look} still={still} share={share} dim={moodDim(mood)} lightning />
    <CameraRig pose={poseFor(look, framing)} still={still} drift={1.2} parallax={0.7} />
    <StillFrames still={still} deps={[framing, mood]} />
    <Ocean look={look} still={still} segments={segments} />
    <Whirlpool position={[4.5, 0.12, -13]} radius={6.5} still={still} />
    <Prop make={() => cliff({ radius: 7, height: 16, seed: 31, color: "#232c30" })} position={[-14, -1, -18]} />
    <Prop make={() => cliff({ radius: 6, height: 13, seed: 32, color: "#20282c" })} position={[15, -1, -22]} />
    <Prop make={() => cliff({ radius: 4, height: 8, seed: 33, color: "#1b2226" })} position={[-6, -1, -32]} />
    <group ref={heads} position={[-8, 0, -15]}>
      <Prop make={() => serpent({ points: [[0, 0, 0], [2, 4, 1], [3.5, 7, 3], [5.5, 8.2, 5], [7, 7.6, 7]] })} />
      <Prop make={() => serpent({ points: [[-1, 0, 1], [0.5, 5, 2], [2, 9.5, 3], [4, 11, 4.5], [5.5, 10.4, 6.5]] })} />
      <Prop make={() => serpent({ points: [[1, 0, -1], [3.5, 3.5, -0.5], [5.5, 5.5, 1], [7.5, 6, 2.8], [9, 5.2, 4.2]], radius: 0.32 })} />
    </group>
    <LightningBolt origin={[2, 40, -60]} />
    <Ridges seed={26} layers={[{ z: -120, height: 9, color: "#122025" }]} />
    <Mist position={[4, 0.8, -12]} size={[30, 4]} color="#b9d6dd" opacity={0.3} speed={0.08} still={still} />
  </>;
}

function CalypsoWorld({ still, share, segments, framing, mood }: WorldProps) {
  const look = TRIAL_LOOKS.calypso;
  const raftRef = useRef<THREE.Group>(null), logs = useRef<THREE.Group>(null);
  const timber = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5d3e22", roughness: 0.8 }), []);
  useFrame(() => {
    const t = sea.t, c = look.water!.chop;
    const ride = (g: THREE.Object3D, x: number, z: number, k = 1) => {
      g.position.y = waveHeight(x, z, t, c) * 0.9 + 0.05;
      g.rotation.z = (waveHeight(x + 1, z, t, c) - waveHeight(x - 1, z, t, c)) * 0.35 * k;
      g.rotation.x = -(waveHeight(x, z + 1, t, c) - waveHeight(x, z - 1, t, c)) * 0.35 * k;
    };
    if (raftRef.current) ride(raftRef.current, 1.5, -3.5);
    logs.current?.children.forEach(l => ride(l, l.position.x, l.position.z, 1.4));
  });
  return <>
    <Atmosphere look={look} still={still} share={share} dim={moodDim(mood)} envIntensity={0.8} />
    <CameraRig pose={poseFor(look, framing)} still={still} drift={1} parallax={0.7} />
    <StillFrames still={still} deps={[framing, mood]} />
    <Ocean look={look} still={still} segments={segments} />
    <group position={[-9, -0.4, -20]}>
      <Prop make={() => islandBase({ radius: 8, height: 3, seed: 61, rockColor: "#8a7a62", grass: "#d8c497" })} />
      <Prop make={() => rock({ size: [4, 4.5, 3.4], seed: 62, color: "#6d5e4b" })} position={[-3, 2, -2]} />
      <mesh position={[-1.2, 2.2, 0.4]} material={useMemo(() => mat.basic("#0c0806"), [])}><sphereGeometry args={[1.2, 16, 10, 0, Math.PI]} /></mesh>
      <Glow position={[-1.2, 2.1, 0.8]} color="#ffb067" size={2.2} opacity={0.6} />
      {([[2, 2.5, 1, 6, 0.8], [4, 2.5, -1.5, 5.4, 1.1], [0.5, 2.5, 3, 4.8, -0.6], [5.5, 2.5, 2, 4.4, 0.4]] as const).map(([x, y, z, h, lean], i) => <Prop key={i} make={() => palm({ height: h, lean, seed: 70 + i })} position={[x, y, z]} />)}
      <Prop make={() => shrubs(scatter(14, 2, 6, 2.6, 71).map((p, i) => ({ p, s: 0.5 + (i % 3) * 0.2 })), ["#2f5b2a", "#3c6e33", "#24481f"], 0, 72)} />
    </group>
    <group ref={raftRef} position={[1.5, 0, -3.5]} rotation-y={0.5}><Prop make={() => raft()} /></group>
    <group ref={logs}>{([[-1.5, -1.5], [4.5, -6], [-3.5, -7], [6.5, -1.2], [2.2, -10]] as const).map(([x, z], i) => <group key={i} position={[x, 0, z]} rotation-y={i * 1.2}><mesh rotation-z={Math.PI / 2} material={timber}><cylinderGeometry args={[0.18, 0.18, 2.4, 8]} /></mesh></group>)}</group>
    <Ridges seed={33} layers={[{ z: -140, height: 7, color: "#6d5a72", x: 40 }]} />
    <Mist position={[0, 0.6, -10]} size={[50, 3]} color="#ffd9c0" opacity={0.22} speed={0.05} still={still} />
  </>;
}

function IthacaWorld({ still, share, segments, framing, mood }: WorldProps) {
  const look = TRIAL_LOOKS.bow;
  void segments;
  const floor = useMemo(() => { const t = floorTexture().clone(); t.needsUpdate = true; t.repeat.set(4, 12); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.22, metalness: 0.15 }); }, []);
  const spots = useMemo(() => { const s: ColumnSpot[] = []; for (let i = 0; i < 10; i++) for (const x of [-4.2, 4.2]) s.push({ p: [x, 0, 2 - i * 3.6] }); return s; }, []);
  const r = useMemo(() => rng(4), []);
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a2717", roughness: 0.95 }), []);
  const banners = useMemo(() => ["#6e1b16", "#1b2c55"].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide })), []);
  return <>
    <Atmosphere look={look} still={still} share={share} dim={moodDim(mood)} envIntensity={0.6} />
    <CameraRig pose={poseFor(look, framing)} still={still} drift={0.6} parallax={0.6} />
    <StillFrames still={still} deps={[framing, mood]} />
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -14]} material={floor}><planeGeometry args={[14, 44]} /></mesh>
    <Prop make={() => columns(spots, 0.38, 5.4, mat.marble("#e9dfcc"))} />
    <mesh position={[0, 6.6, -14]} material={useMemo(() => new THREE.MeshStandardMaterial({ color: "#2a1c12", roughness: 0.9 }), [])}><boxGeometry args={[14, 0.6, 44]} /></mesh>
    {[-6.6, 6.6].map(x => <mesh key={x} position={[x, 3.3, -14]} material={wall}><boxGeometry args={[0.4, 7, 44]} /></mesh>)}
    {/* Banners between the columns. */}
    {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[i % 2 ? 6.35 : -6.35, 4.2, -1 - Math.floor(i / 2) * 7.2]} rotation-y={i % 2 ? -Math.PI / 2 : Math.PI / 2} material={banners[i % 4 < 2 ? 0 : 1]}><planeGeometry args={[1.4, 3.6]} /></mesh>)}
    <mesh position={[0, 3.2, -36]} material={useMemo(() => mat.glow("#ffcf86", 1.4), [])}><planeGeometry args={[4, 6.2]} /></mesh>
    <Glow position={[0, 3, -35]} color="#ffcc80" size={16} opacity={0.5} />
    <Prop make={() => axes(12, 1.75)} position={[0, 0, -5.5]} />
    {([[-2.6, 0, -2], [2.6, 0, -9], [-2.6, 0, -16], [2.6, 0, -23]] as Vec3[]).map((p, i) => <group key={i}><Prop make={() => brazier(0.75)} position={p} /><Flame position={[p[0], 1.25, p[2]]} size={0.85} light={i < 3 ? 6 : 0} distance={11} still={still} color="#ffb04a" /></group>)}
    {Array.from({ length: 5 }, (_, i) => <LightShaft key={i} position={[-3 + (i % 2) * 6, 4.2, -4 - i * 6]} rotation={[0.35, 0, (i % 2 ? 1 : -1) * 0.3]} height={8} radius={[0.5, 1.6]} color="#ffd9a0" opacity={0.12 + r() * 0.06} />)}
    <Mist position={[0, 1.4, -18]} size={[12, 3]} color="#c99a62" opacity={0.18} still={still} />
  </>;
}

const TRIAL_WORLDS: Record<TrialId, (p: WorldProps) => React.JSX.Element> = { lotus: LotusWorld, cyclops: CyclopsWorld, aeolus: AeolusWorld, circe: CirceWorld, sirens: SirensWorld, scylla: ScyllaWorld, calypso: CalypsoWorld, bow: IthacaWorld };

export function TrialWorld({ id, ...props }: WorldProps & { id: TrialId }) {
  const World = TRIAL_WORLDS[id];
  return <World {...props} />;
}

/** Light flashes for the stormy worlds' point lights to follow. */
export const lightningLevel = () => flash.level;
