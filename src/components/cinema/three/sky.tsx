"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SceneLook } from "../../../lib/cinema/scenes";
import { GLSL_NOISE, fbm3, glowTexture, rng } from "./util";

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uFog;
uniform vec3 uOrbDir; uniform vec3 uOrbColor; uniform vec3 uOrbGlow; uniform float uOrbSize; uniform float uOrbKind;
uniform float uStars; uniform float uCover; uniform float uSpeed; uniform vec3 uCloud; uniform float uStorm;
uniform float uTime; uniform float uFlash; uniform float uDim;
varying vec3 vDir;
${GLSL_NOISE}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uMid, uZenith, smoothstep(0.08, 0.85, h));
  col = mix(uHorizon, col, smoothstep(-0.01, 0.32, h));
  col = mix(col, uFog, smoothstep(0.02, -0.12, h));

  if (uStars > 0.0) {
    vec3 sp = d * 230.0; vec3 f = fract(sp) - 0.5; float r = hash13(floor(sp));
    float star = step(1.0 - 0.03 * uStars, r) * smoothstep(0.3, 0.0, length(f));
    float tw = 0.55 + 0.45 * sin(uTime * (1.3 + r * 5.0) + r * 70.0);
    vec3 bandN = normalize(vec3(0.42, 0.62, 0.66));
    float band = exp(-pow(dot(d, bandN) * 3.0, 2.0));
    vec3 sp2 = d * 540.0; float r2 = hash13(floor(sp2));
    float star2 = step(1.0 - 0.07 * band * uStars, r2) * smoothstep(0.35, 0.0, length(fract(sp2) - 0.5));
    float mw = band * smoothstep(0.35, 0.9, fbm(d.xy * 5.0 + d.z * 2.7)) * 0.42 * uStars;
    float vis = smoothstep(0.03, 0.3, h);
    col += (vec3(1.0, 0.96, 0.9) * star * tw * 1.6 + vec3(0.85, 0.9, 1.0) * star2 * 0.55 + vec3(0.42, 0.48, 0.78) * mw) * vis;
  }

  float od = dot(d, uOrbDir);
  float ang = acos(clamp(od, -1.0, 1.0));
  if (uOrbKind > 0.5) {
    float sun = step(1.5, uOrbKind);
    float disc = smoothstep(uOrbSize, uOrbSize * 0.9, ang);
    vec3 local = d - uOrbDir * od;
    float maria = fbm(local.xy / uOrbSize * 1.6 + 4.0);
    float limb = sqrt(max(0.0, 1.0 - pow(ang / uOrbSize, 2.0)));
    vec3 surface = uOrbColor * mix(0.78 + 0.32 * maria, 1.0, sun) * mix(0.75 + 0.25 * limb, 1.0, sun);
    col = mix(col, surface * mix(1.5, 4.0, sun), disc);
    float halo = exp(-ang * mix(7.0, 3.5, sun)) * mix(0.32, 0.9, sun) + exp(-ang * 28.0) * mix(0.42, 0.9, sun);
    col += uOrbGlow * halo * (1.0 - disc);
    if (sun > 0.5) col += uOrbGlow * 0.35 * exp(-abs(h - uOrbDir.y) * 12.0) * smoothstep(0.6, 1.0, dot(normalize(d.xz), normalize(uOrbDir.xz)));
  }

  if (uCover > 0.0) {
    vec2 uv = d.xz / (max(h, 0.0) + 0.16) * 0.85;
    uv += vec2(uTime * uSpeed, uTime * uSpeed * 0.35);
    float n = fbm(uv * 1.15);
    float n2 = fbm(uv * 3.3 + 7.0);
    float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.38, n * 0.72 + n2 * 0.38);
    c *= smoothstep(-0.03, 0.1, h);
    float lit = pow(max(od, 0.0), 5.0);
    vec3 cc = uCloud * (0.45 + 0.55 * n2) * mix(1.0, 0.55, uStorm * (1.0 - n2));
    cc += uOrbGlow * lit * (0.55 + 0.9 * (1.0 - c)) * 0.75;
    cc += vec3(0.75, 0.85, 1.0) * uFlash * (0.6 + n2) * 1.8;
    col = mix(col, cc, c * 0.94);
  }
  col += vec3(0.22, 0.28, 0.38) * uFlash * smoothstep(-0.1, 0.6, h);
  col *= uDim;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Lightning: a shared flash level that the sky, the lights and the bolt read. */
export const flash = { level: 0, next: 4, bolt: 0 };

export function SkyDome({ look, still, dim = 1, lightning = false }: { look: SceneLook; still: boolean; dim?: number; lightning?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const camera = useThree(s => s.camera);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
      uOrbDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() }, uOrbColor: { value: new THREE.Color("#ffffff") }, uOrbGlow: { value: new THREE.Color("#ffffff") },
      uOrbSize: { value: 0.05 }, uOrbKind: { value: 0 }, uStars: { value: 0 }, uCover: { value: 0 }, uSpeed: { value: 0 }, uCloud: { value: new THREE.Color() },
      uStorm: { value: 0 }, uTime: { value: 37 }, uFlash: { value: 0 }, uDim: { value: 1 },
    },
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const u = material.uniforms;
    u.uZenith.value.set(look.sky[0]); u.uMid.value.set(look.sky[1]); u.uHorizon.value.set(look.sky[2]); u.uFog.value.set(look.fog);
    u.uStars.value = look.stars; u.uCover.value = look.clouds.cover; u.uSpeed.value = look.clouds.speed; u.uCloud.value.set(look.clouds.color); u.uStorm.value = look.clouds.storm ? 1 : 0;
    if (look.orb) {
      u.uOrbDir.value.set(...look.orb.direction).normalize(); u.uOrbColor.value.set(look.orb.color); u.uOrbGlow.value.set(look.orb.glow);
      u.uOrbSize.value = look.orb.size; u.uOrbKind.value = look.orb.kind === "sun" ? 2 : 1;
    } else u.uOrbKind.value = 0;
  }, [look, material]);
  useFrame((_, dt) => {
    const u = material.uniforms;
    if (!still) u.uTime.value += Math.min(dt, 0.1);
    u.uDim.value += (dim - u.uDim.value) * Math.min(1, dt * 3);
    if (lightning && !still) {
      flash.next -= dt;
      if (flash.next <= 0) { flash.level = 1; flash.bolt = 0.18; flash.next = 2.5 + Math.random() * 5; }
      flash.level = Math.max(0, flash.level - dt * 3.2);
      flash.bolt = Math.max(0, flash.bolt - dt);
      u.uFlash.value = flash.level * (0.6 + 0.4 * Math.sin(flash.level * 40));
    } else u.uFlash.value = 0;
    ref.current?.position.copy(camera.position);
  });
  return <mesh ref={ref} material={material} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[480, 48, 24]} /></mesh>;
}

/** A soft additive light sprite: lantern halos, the lotus glow, ember bloom. */
export function Glow({ position, color, size, opacity = 1, fog = true }: { position: [number, number, number]; color: string; size: number; opacity?: number; fog?: boolean }) {
  const material = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog }), [color, opacity, fog]);
  useEffect(() => () => material.dispose(), [material]);
  return <sprite position={position} scale={[size, size, 1]} material={material} />;
}

/**
 * Layered mountain silhouettes. Each layer is a flat ridge shape far away;
 * the scene fog fades the farther layers into the horizon, which is all the
 * depth a silhouette needs.
 */
export function Ridges({ layers, seed = 3 }: { layers: { z: number; height: number; color: string; width?: number; x?: number; rough?: number; lights?: number }[]; seed?: number }) {
  const meshes = useMemo(() => layers.map((layer, li) => {
    const w = layer.width ?? 360, steps = 160, shape = new THREE.Shape();
    shape.moveTo(-w / 2, -30);
    const tops: THREE.Vector2[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = -w / 2 + (w * i) / steps;
      const n = fbm3(x * 0.018 * (layer.rough ?? 1) + seed * 3 + li * 11, li * 1.7, seed, 5);
      const ridge = Math.pow(n, 1.6) * layer.height * 2.2;
      tops.push(new THREE.Vector2(x, ridge));
      shape.lineTo(x, ridge);
    }
    shape.lineTo(w / 2, -30);
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({ color: layer.color, fog: true });
    const r = rng(seed * 31 + li), lights: [number, number][] = [];
    for (let i = 0; i < (layer.lights ?? 0); i++) {
      const t = tops[Math.floor(r() * tops.length)];
      lights.push([t.x + (r() - 0.5) * 2, Math.max(0.3, t.y * (0.15 + r() * 0.7))]);
    }
    return { geometry, material, z: layer.z, x: layer.x ?? 0, lights };
  }), [layers, seed]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); }), [meshes]);
  return <>{meshes.map((m, i) => <group key={i} position={[m.x, 0, m.z]}>
    <mesh geometry={m.geometry} material={m.material} />
    {m.lights.map((l, k) => <Glow key={k} position={[l[0], l[1], 0.5]} color="#ffb867" size={1.4 + (k % 3) * 0.5} opacity={0.75} />)}
  </group>)}</>;
}

/** The jagged bolt drawn for a moment at each lightning strike. */
export function LightningBolt({ origin }: { origin: [number, number, number] }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 24), 3));
    const material = new THREE.LineBasicMaterial({ color: "#e8f3ff", transparent: true, opacity: 0, fog: false, blending: THREE.AdditiveBlending });
    return new THREE.Line(geometry, material);
  }, []);
  const last = useRef(0);
  useEffect(() => () => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }, [line]);
  useFrame(() => {
    const m = line.material as THREE.LineBasicMaterial;
    if (flash.bolt > 0 && last.current <= 0) {
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      let x = origin[0] + (Math.random() - 0.5) * 30, y = origin[1], z = origin[2];
      for (let i = 0; i < 24; i++) { pos.setXYZ(i, x, y, z); x += (Math.random() - 0.5) * 3.2; y -= origin[1] / 23; z += (Math.random() - 0.5) * 1.2; }
      pos.needsUpdate = true;
    }
    last.current = flash.bolt;
    m.opacity = flash.bolt > 0 ? Math.min(1, flash.bolt * 8) : 0;
  });
  return <primitive object={line} />;
}
