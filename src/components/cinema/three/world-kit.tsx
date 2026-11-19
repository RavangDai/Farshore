"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type DependencyList } from "react";
import * as THREE from "three";
import type { SceneLook, Vec3 } from "../../../lib/cinema/scenes";
import { Particles } from "./fx";
import { SkyDome, flash } from "./sky";
import { disposeTree } from "./util";

/** Builds a three.js object once per dependency change and disposes it with the world. */
export function useBuilt<T extends THREE.Object3D>(make: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const object = useMemo(make, deps);
  useEffect(() => () => disposeTree(object), [object]);
  return object;
}

/**
 * Image-based lighting made from the scene's own sky: a tiny gradient room
 * with the moon (or sun) in it, prefiltered once. Bronze, marble and water
 * then reflect the world they stand in, without downloading an HDRI.
 */
function SceneEnvironment({ look, intensity }: { look: SceneLook; intensity: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const room = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { a: { value: new THREE.Color(look.sky[0]) }, b: { value: new THREE.Color(look.sky[1]) }, c: { value: new THREE.Color(look.sky[2]) }, g: { value: new THREE.Color(look.hemi.ground) } },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 a; uniform vec3 b; uniform vec3 c; uniform vec3 g; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 col = h > 0.0 ? mix(c, mix(b, a, smoothstep(0.2, 0.9, h)), smoothstep(0.0, 0.35, h)) : mix(c, g, smoothstep(0.0, -0.3, h)); gl_FragColor = vec4(col * 1.6, 1.0); }",
    }));
    room.add(sky);
    const orbDir = new THREE.Vector3(...(look.orb?.direction ?? look.key.position)).normalize();
    const orb = new THREE.Mesh(new THREE.SphereGeometry(look.orb?.kind === "sun" ? 1.4 : 0.9, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.orb?.glow ?? look.key.color).multiplyScalar(look.orb ? 6 : 3) }));
    orb.position.copy(orbDir.multiplyScalar(8));
    room.add(orb);
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    return () => { scene.environment = null; target.dispose(); pmrem.dispose(); disposeTree(room); };
  }, [gl, scene, look, intensity]);
  return null;
}

/** Fog, sky, hemisphere and key light, ambient particles, and exposure for a look. */
export function Atmosphere({ look, still, share = 1, dim = 1, lightning = false, particles = true, envIntensity = 0.55, keyShadowless = true }: { look: SceneLook; still: boolean; share?: number; dim?: number; lightning?: boolean; particles?: boolean; envIntensity?: number; keyShadowless?: boolean }) {
  const { scene, gl } = useThree();
  const key = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    scene.fog = new THREE.FogExp2(look.fog, look.fogDensity);
    scene.background = new THREE.Color(look.fog);
    return () => { scene.fog = null; scene.background = null; };
  }, [scene, look]);
  useFrame((_, dt) => {
    const want = look.exposure * dim;
    gl.toneMappingExposure += (want - gl.toneMappingExposure) * Math.min(1, dt * 2.5);
    if (key.current) key.current.intensity = look.key.intensity * (1 + (lightning ? flash.level * 5 : 0));
  });
  void keyShadowless;
  return <>
    <SceneEnvironment look={look} intensity={envIntensity} />
    <SkyDome look={look} still={still} lightning={lightning} />
    <hemisphereLight args={[look.hemi.sky, look.hemi.ground, look.hemi.intensity]} />
    <directionalLight ref={key} color={look.key.color} intensity={look.key.intensity} position={look.key.position} />
    {/* A cool fill from the camera's side, so forms facing us are modelled rather than flat silhouettes. */}
    <directionalLight color={look.hemi.sky} intensity={look.key.intensity * 0.42} position={[-14, 16, 22]} />
    {particles && look.particles.map((p, i) => <Particles key={i} spec={p} still={still} share={share} />)}
  </>;
}

type Pose = { position: Vec3; target: Vec3; fov: number };

/**
 * The cinematic camera: eases toward the framing it is given (so a chapter
 * view can glide into its briefing), with a slow breathing drift and a touch
 * of pointer parallax. Still mode holds the frame.
 */
export function CameraRig({ pose, still, drift = 1, parallax = 1 }: { pose: Pose; still: boolean; drift?: number; parallax?: number }) {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  const size = useThree(s => s.size);
  const state = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3; fov: number } | null>(null);
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  useEffect(() => {
    if (still || parallax === 0) return;
    const move = (e: PointerEvent) => { pointer.current.x = (e.clientX / window.innerWidth - 0.5) * 2; pointer.current.y = (e.clientY / window.innerHeight - 0.5) * 2; };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [still, parallax]);
  useFrame(({ clock }, dt) => {
    const aspect = size.width / Math.max(1, size.height);
    // Narrow frames step back and widen so the set piece stays in shot.
    const widen = aspect < 1.3 ? 1 + (1.3 - aspect) * 0.55 : 1;
    const fov = Math.min(75, pose.fov * widen);
    if (!state.current) state.current = { pos: new THREE.Vector3(...pose.position), tgt: new THREE.Vector3(...pose.target), fov };
    const s = state.current, t = clock.elapsedTime;
    const k = still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 1.5);
    const p = pointer.current;
    p.sx += (p.x - p.sx) * Math.min(1, dt * 2); p.sy += (p.y - p.sy) * Math.min(1, dt * 2);
    const d = still ? 0 : drift, px = still ? 0 : parallax;
    const want = new THREE.Vector3(pose.position[0] + Math.sin(t * 0.07) * 0.6 * d + p.sx * 0.55 * px, pose.position[1] + Math.sin(t * 0.11) * 0.16 * d - p.sy * 0.25 * px, pose.position[2] + Math.cos(t * 0.05) * 0.3 * d);
    s.pos.lerp(want, k);
    s.tgt.lerp(new THREE.Vector3(...pose.target), k);
    s.fov += (fov - s.fov) * k;
    camera.position.copy(s.pos);
    camera.lookAt(s.tgt);
    if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
  });
  return null;
}

/** Re-renders once whenever a still (reduced-motion) world changes, since its frame loop is on demand. */
export function StillFrames({ still, deps }: { still: boolean; deps: DependencyList }) {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    if (!still) return;
    let n = 0, id = 0;
    // A few frames let the camera settle and the environment map arrive.
    const tick = () => { invalidate(); if (++n < 6) id = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, invalidate, ...deps]);
  return null;
}
