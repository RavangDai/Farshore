"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ParticleSpec, SceneLook } from "../../../lib/cinema/scenes";
import { flash } from "./sky";
import { GLSL_NOISE, glowTexture, rng } from "./util";

/** Ocean swell: direction (x, z), wavelength, amplitude. Long waves move the mesh; all shade it. */
const WAVES: [number, number, number, number][] = [[1, 0.3, 11, 0.24], [0.6, -0.8, 6.3, 0.15], [-0.35, 1, 3.6, 0.08], [0.9, 0.55, 1.9, 0.045], [0.25, -1, 1.15, 0.025]];

/** The sea's clock, shared by the water shader and everything that floats on it. */
export const sea = { t: 11 };

/** The same swell on the CPU, so a ship or a raft rides the water the shader draws. */
export function waveHeight(x: number, z: number, t: number, chop: number) {
  let h = 0;
  for (let i = 0; i < 3; i++) {
    const [dx, dz, len, amp] = WAVES[i], l = Math.hypot(dx, dz), k = (Math.PI * 2) / len, c = Math.sqrt(9.8 / k);
    h += amp * chop * 1.6 * Math.sin(k * ((dx / l) * x + (dz / l) * z - c * t));
  }
  return h;
}

const OCEAN_VERT = /* glsl */ `
uniform float uTime; uniform float uChop; uniform vec4 uWaves[5];
varying vec3 vWorld; varying float vHeight;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float h = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 wv = uWaves[i]; vec2 dir = normalize(wv.xy); float k = 6.28318 / wv.z; float c = sqrt(9.8 / k);
    float f = k * (dot(dir, w.xz) - c * uTime); float a = wv.w * uChop * 1.6;
    h += a * sin(f);
    w.xz += dir * (0.55 / k) * cos(f) * uChop;
  }
  w.y += h; vHeight = h; vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const OCEAN_FRAG = /* glsl */ `
uniform float uTime; uniform float uChop; uniform vec4 uWaves[5];
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uGlint; uniform vec3 uSkyH; uniform vec3 uSkyZ; uniform vec3 uFog; uniform float uFogDensity;
uniform vec3 uLightDir; uniform float uFlash; uniform float uDim;
varying vec3 vWorld; varying float vHeight;
${GLSL_NOISE}
void main() {
  float dist = length(cameraPosition - vWorld);
  float detail = smoothstep(90.0, 8.0, dist);
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    vec4 wv = uWaves[i]; vec2 dir = normalize(wv.xy); float k = 6.28318 / wv.z; float c = sqrt(9.8 / k);
    float f = k * (dot(dir, vWorld.xz) - c * uTime); float a = wv.w * uChop * 1.6 * (i > 2 ? detail : 1.0);
    grad += dir * a * k * cos(f);
  }
  vec2 q = vWorld.xz * 1.3 + uTime * vec2(0.22, 0.15);
  grad += (vec2(vnoise(q * 1.9), vnoise(q * 3.7 - uTime * 0.3)) - 0.5) * (0.05 + uChop * 0.16) * detail;
  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSkyH, uSkyZ, smoothstep(0.0, 0.55, R.y));
  vec3 water = mix(uDeep, uShallow, clamp(vHeight * 1.8 + 0.3, 0.0, 1.0) * 0.55);
  vec3 col = mix(water, sky, fres * 0.72);
  float s = max(dot(R, uLightDir), 0.0);
  // The glitter path: sparkles only where the swell tilts the orb's reflection toward the eye.
  float glitter = step(0.86, vnoise(vWorld.xz * 15.0 + uTime * 1.6)) * pow(s, 48.0) * smoothstep(0.04, 0.35, uChop) * detail;
  col += uGlint * (pow(s, 700.0) * 5.0 + pow(s, 90.0) * 0.32 + glitter * 2.2);
  float crest = clamp(vHeight / (0.36 * uChop + 0.02), 0.0, 1.0);
  float foam = smoothstep(0.62, 1.0, crest) * smoothstep(0.45, 0.8, fbm(vWorld.xz * 1.1 + uTime * 0.25));
  col = mix(col, vec3(0.82, 0.88, 0.93), foam * smoothstep(0.22, 0.6, uChop) * 0.55);
  col += vec3(0.55, 0.65, 0.85) * uFlash * 0.5 * fres;
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFog, fogF * 0.8) * uDim;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function Ocean({ look, still, segments = 1, dim = 1 }: { look: SceneLook; still: boolean; segments?: number; dim?: number }) {
  const water = look.water!;
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG,
    uniforms: {
      uTime: { value: 11 }, uChop: { value: water.chop }, uWaves: { value: WAVES.map(w => new THREE.Vector4(...w)) },
      uDeep: { value: new THREE.Color(water.deep) }, uShallow: { value: new THREE.Color(water.shallow) }, uGlint: { value: new THREE.Color(water.glint) },
      uSkyH: { value: new THREE.Color(look.sky[2]) }, uSkyZ: { value: new THREE.Color(look.sky[1]) }, uFog: { value: new THREE.Color(look.fog) }, uFogDensity: { value: look.fogDensity },
      uLightDir: { value: new THREE.Vector3(...(look.orb?.direction ?? look.key.position)).normalize() }, uFlash: { value: 0 }, uDim: { value: 1 },
    },
  }), [look, water]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, dt) => {
    if (!still) sea.t += Math.min(dt, 0.1);
    material.uniforms.uTime.value = sea.t;
    material.uniforms.uFlash.value = flash.level;
    material.uniforms.uDim.value += (dim - material.uniforms.uDim.value) * Math.min(1, dt * 3);
  });
  const seg = Math.round(170 * segments);
  return <mesh material={material} rotation-x={-Math.PI / 2} position={[0, water.level, -water.size * 0.32]} frustumCulled={false}><planeGeometry args={[water.size, water.size, seg, seg]} /></mesh>;
}

/** Charybdis: a spiral of foam and a dark throat on the water. */
export function Whirlpool({ position, radius, still }: { position: [number, number, number]; radius: number; still: boolean }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv; ${GLSL_NOISE}
      void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
        float swirl = sin(a * 5.0 + log(r + 0.02) * 9.0 + uTime * 3.2);
        float n = fbm(vec2(a * 2.0 + uTime * 0.6, r * 6.0 - uTime));
        float foam = smoothstep(0.55, 1.0, swirl * 0.6 + n * 0.8) * smoothstep(0.08, 0.35, r);
        vec3 col = mix(vec3(0.0, 0.02, 0.03), vec3(0.06, 0.22, 0.26), smoothstep(0.0, 0.9, r));
        col = mix(col, vec3(0.78, 0.9, 0.95), foam * 0.8);
        float alpha = smoothstep(1.0, 0.55, r) * 0.95;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, dt) => { if (!still) material.uniforms.uTime.value += Math.min(dt, 0.1); });
  return <mesh material={material} position={position} rotation-x={-Math.PI / 2} renderOrder={2}><circleGeometry args={[radius, 64]} /></mesh>;
}

/** A drifting bank of sea mist or cave haze. */
export function Mist({ position, size, color, opacity = 0.35, speed = 0.02, still, rotation }: { position: [number, number, number]; size: [number, number]; color: string; opacity?: number; speed?: number; still: boolean; rotation?: [number, number, number] }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: Math.random() * 40 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uSpeed: { value: speed } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uSpeed; varying vec2 vUv; ${GLSL_NOISE}
      void main(){ vec2 p = vUv * vec2(4.0, 1.6) + vec2(uTime * uSpeed * 6.0, uTime * uSpeed);
        float n = fbm(p) * 0.7 + fbm(p * 2.3 - uTime * uSpeed * 3.0) * 0.4;
        float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float a = smoothstep(0.35, 0.85, n) * edge * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  }), [color, opacity, speed]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, dt) => { if (!still) material.uniforms.uTime.value += Math.min(dt, 0.1); });
  return <mesh material={material} position={position} rotation={rotation ?? [0, 0, 0]} renderOrder={5}><planeGeometry args={size} /></mesh>;
}

/** A soft cone of light: torch beams in the cave, sun through the hall's high windows. */
export function LightShaft({ position, rotation = [0, 0, 0], height, radius, color, opacity = 0.25 }: { position: [number, number, number]; rotation?: [number, number, number]; height: number; radius: [number, number]; color: string; opacity?: number }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float a = edge * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * uOpacity; gl_FragColor = vec4(uColor * a, a); }",
  }), [color, opacity]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh material={material} position={position} rotation={rotation} renderOrder={6}><cylinderGeometry args={[radius[0], radius[1], height, 24, 1, true]} /></mesh>;
}

const KIND_INDEX: Record<ParticleSpec["kind"], number> = { petals: 0, embers: 1, wind: 2, motes: 3, bubbles: 4, spray: 5, rain: 6, dust: 7 };

const PARTICLE_VERT = /* glsl */ `
uniform float uTime; uniform vec3 uArea; uniform vec3 uCenter; uniform vec3 uVel; uniform float uSway; uniform float uSize; uniform float uPixel; uniform float uKind;
attribute vec4 aSeed;
varying float vAlpha; varying float vSeed; varying float vSpin;
void main() {
  float speed = 0.55 + aSeed.x * 0.9;
  vec3 p = position + uVel * uTime * speed;
  float t = uTime * (0.4 + aSeed.y * 0.8) + aSeed.z * 6.2831;
  p.x += sin(t) * uSway; p.z += cos(t * 0.8) * uSway * 0.6; p.y += sin(t * 1.3) * uSway * 0.3;
  vec3 rel = mod(p - uCenter + uArea * 0.5, uArea) - uArea * 0.5;
  vec3 edge = smoothstep(uArea * 0.5, uArea * 0.38, abs(rel));
  vAlpha = edge.x * edge.y * edge.z;
  float life = 1.0;
  if (uKind == 1.0) { life = smoothstep(0.5, -0.2, rel.y / uArea.y) * (0.6 + 0.4 * sin(uTime * 9.0 + aSeed.w * 40.0)); }
  if (uKind == 3.0 || uKind == 7.0) { life = 0.45 + 0.55 * sin(uTime * (0.8 + aSeed.w) + aSeed.z * 20.0); }
  if (uKind == 5.0) { life = smoothstep(0.5, 0.0, abs(rel.y / uArea.y)); }
  vAlpha *= life; vSeed = aSeed.w; vSpin = t;
  vec4 mv = modelViewMatrix * vec4(uCenter + rel, 1.0);
  gl_PointSize = uSize * (0.45 + aSeed.w * 0.9) * uPixel * 320.0 / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uKind; uniform float uOpacity;
varying float vAlpha; varying float vSeed; varying float vSpin;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = 0.0;
  if (uKind == 0.0) {
    float ang = vSpin; mat2 r = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)); vec2 q = r * c;
    q.x *= 2.1; a = smoothstep(0.25, 0.18, length(q + vec2(0.0, q.x * q.x * 0.6)));
  } else if (uKind == 2.0) {
    a = smoothstep(0.5, 0.0, abs(c.x) * 0.9) * smoothstep(0.05, 0.0, abs(c.y)) ;
  } else if (uKind == 6.0) {
    a = smoothstep(0.03, 0.0, abs(c.x)) * smoothstep(0.5, 0.1, abs(c.y)) * 0.8;
  } else if (uKind == 4.0) {
    float d = length(c); a = smoothstep(0.5, 0.36, d) * (0.35 + smoothstep(0.3, 0.45, d)) ;
  } else {
    float d = length(c); a = smoothstep(0.5, 0.0, d); a *= a;
  }
  vec3 col = uColor * (uKind == 0.0 ? 0.75 + 0.25 * vSeed : 1.0);
  gl_FragColor = vec4(col, a * vAlpha * uOpacity);
  #include <colorspace_fragment>
}`;

/** One drifting particle field (petals, embers, wind, motes...), animated entirely on the GPU. */
export function Particles({ spec, still, share = 1, opacity = 1 }: { spec: ParticleSpec; still: boolean; share?: number; opacity?: number }) {
  const count = Math.max(8, Math.round(spec.count * share));
  const points = useMemo(() => {
    const r = rng(spec.count * 7 + KIND_INDEX[spec.kind]);
    const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = spec.center[k] + (r() - 0.5) * spec.area[k];
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = r();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    const additive = ["embers", "motes", "bubbles", "dust", "wind"].includes(spec.kind);
    const material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 3 + r() * 20 }, uArea: { value: new THREE.Vector3(...spec.area) }, uCenter: { value: new THREE.Vector3(...spec.center) },
        uVel: { value: new THREE.Vector3(...spec.velocity) }, uSway: { value: spec.sway }, uSize: { value: spec.size }, uPixel: { value: Math.min(2, window.devicePixelRatio || 1) },
        uKind: { value: KIND_INDEX[spec.kind] }, uColor: { value: new THREE.Color(spec.color) }, uOpacity: { value: opacity },
      },
    });
    const object = new THREE.Points(geometry, material);
    object.frustumCulled = false;
    object.renderOrder = 8;
    return object;
  }, [spec, count, opacity]);
  useEffect(() => () => { points.geometry.dispose(); (points.material as THREE.Material).dispose(); }, [points]);
  useFrame((_, dt) => { if (!still) (points.material as THREE.ShaderMaterial).uniforms.uTime.value += Math.min(dt, 0.1); });
  return <primitive object={points} />;
}

/**
 * A flame: three stacked additive glows that flicker, with an optional point
 * light that flickers in step. Torches, braziers, lanterns.
 */
export function Flame({ position, color = "#ff9a3c", size = 1, light = 0, distance = 8, still }: { position: [number, number, number]; color?: string; size?: number; light?: number; distance?: number; still: boolean }) {
  const group = useRef<THREE.Group>(null), lamp = useRef<THREE.PointLight>(null);
  const seed = useMemo(() => Math.random() * 100, []);
  const materials = useMemo(() => ["#fff3c4", color, "#c2401a"].map((c, i) => new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: [0.95, 0.7, 0.35][i] })), [color]);
  useEffect(() => () => materials.forEach(m => m.dispose()), [materials]);
  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime + seed;
    const f = 0.85 + Math.sin(t * 11) * 0.06 + Math.sin(t * 23.7) * 0.05 + Math.sin(t * 5.3) * 0.05;
    group.current?.children.forEach((c, i) => c.scale.set(size * [0.35, 0.8, 1.6][i] * f, size * [0.6, 1.25, 1.9][i] * f, 1));
    if (lamp.current) lamp.current.intensity = light * f;
  });
  return <group position={position}>
    <group ref={group}>{materials.map((m, i) => <sprite key={i} material={m} position={[0, size * [0.18, 0.25, 0.3][i], 0]} scale={[size * [0.35, 0.8, 1.6][i], size * [0.6, 1.25, 1.9][i], 1]} />)}</group>
    {light > 0 && <pointLight ref={lamp} color={color} intensity={light} distance={distance} decay={1.6} position={[0, size * 0.4, 0]} />}
  </group>;
}
