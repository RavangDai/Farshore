"use client";
import { useEffect, useRef } from "react";
import { ART_WIDTH, type FxEmitter, type FxSpec } from "../../lib/cinema/art";

/**
 * The atmosphere over a painted environment: drifting petals, embers off a
 * torch, wind, rain, sea spray, glints on the water, flickering firelight and
 * the odd distant flash. One 2D canvas laid exactly over the painting (it sits
 * in the same stage box), so every position is a percentage of the painting.
 * The art itself is never redrawn or blurred. Not mounted in still mode or on
 * the Lite tier; pauses while hidden or while a film has the screen.
 */

type Particle = { e: FxEmitter; x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; rot: number; spin: number; phase: number; alpha: number };
type Spark = { x: number; y: number; age: number; life: number; size: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function lighten(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16), mix = (c: number) => Math.round(c + (255 - c) * k);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  let s = sprites.get(key);
  if (!s) {
    s = document.createElement("canvas");
    s.width = w; s.height = h;
    draw(s.getContext("2d")!);
    sprites.set(key, s);
  }
  return s;
}
const glowSprite = (color: string) => sprite(`glow${color}`, 64, 64, c => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, rgba(color, 1)); g.addColorStop(0.3, rgba(color, 0.5)); g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
});
const petalSprite = (color: string) => sprite(`petal${color}`, 48, 26, c => {
  c.translate(24, 13);
  const g = c.createRadialGradient(-7, -3, 1, 0, 0, 24);
  g.addColorStop(0, lighten(color, 0.55)); g.addColorStop(1, color);
  c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = rgba("#ffffff", 0.3); c.lineWidth = 1.2; c.beginPath(); c.moveTo(-16, 0); c.quadraticCurveTo(0, -2, 16, 0); c.stroke();
});
const streakSprite = (color: string) => sprite(`streak${color}`, 256, 8, c => {
  const g = c.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.55, rgba(color, 0.9)); g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.globalAlpha = 0.35; c.fillRect(0, 1, 256, 6);
  c.globalAlpha = 1; c.fillRect(0, 3, 256, 2);
});
const ringSprite = (color: string) => sprite(`ring${color}`, 32, 32, c => {
  c.strokeStyle = rgba(color, 0.85); c.lineWidth = 1.6; c.beginPath(); c.arc(16, 16, 13, 0, Math.PI * 2); c.stroke();
  c.fillStyle = rgba("#ffffff", 0.7); c.beginPath(); c.arc(11, 11, 2.4, 0, Math.PI * 2); c.fill();
});

const outside = (p: Particle, m = 6) => { const [x0, y0, x1, y1] = p.e.area; return p.x < x0 - m || p.x > x1 + m || p.y < y0 - m || p.y > y1 + m; };

function spawn(p: Particle, initial: boolean) {
  const e = p.e, [x0, y0, x1, y1] = e.area, [dx, dy] = e.drift ?? [0, 0];
  p.x = rand(x0, x1); p.y = rand(y0, y1); p.age = 0; p.size = e.size * rand(0.65, 1.3); p.rot = rand(0, Math.PI * 2); p.spin = rand(-1.6, 1.6); p.phase = rand(0, 100); p.alpha = 1;
  switch (e.kind) {
    case "petals": if (!initial) p.y = y0 - rand(0, 5); p.vx = dx * rand(0.6, 1.3); p.vy = dy * rand(0.7, 1.3); p.life = Infinity; break;
    case "embers": if (!initial) p.y = y1; p.vx = dx + rand(-0.5, 0.5); p.vy = dy * rand(0.6, 1.4); p.life = rand(1.6, 3.4); break;
    case "bubbles": if (!initial) p.y = y1; p.vx = dx; p.vy = dy * rand(0.6, 1.4); p.life = rand(2, 4); break;
    case "motes": p.vx = dx * rand(0.5, 1.5) + rand(-0.2, 0.2); p.vy = dy * rand(0.5, 1.5) + rand(-0.2, 0.2); p.life = rand(5, 10); break;
    case "wind": if (!initial) p.x = x0 - rand(0, 20); p.vx = dx * rand(0.7, 1.3); p.vy = dy; p.life = rand(1.5, 3); p.size = e.size * rand(40, 90); break;
    case "rain": if (!initial) p.y = y0 - rand(0, 10); p.vx = dx; p.vy = dy * rand(0.85, 1.15); p.life = Infinity; break;
    case "spray": p.y = rand(y0 + (y1 - y0) * 0.4, y1); p.vx = rand(-1.5, 2.5); p.vy = rand(-9, -4); p.life = rand(0.8, 1.6); break;
    case "mist": p.vx = dx * rand(0.6, 1.4); p.vy = dy; p.life = Infinity; p.alpha = rand(0.6, 1.2); break;
  }
  if (initial && Number.isFinite(p.life)) p.age = rand(0, p.life);
}

function update(p: Particle, dt: number, t: number) {
  p.age += dt; p.rot += p.spin * dt;
  if (p.e.kind === "spray") p.vy += 14 * dt;
  const sway = p.e.kind === "petals" ? Math.sin(t * 1.3 + p.phase) * 1.2 : p.e.kind === "bubbles" ? Math.sin(t * 2.4 + p.phase) * 0.6 : 0;
  p.x += (p.vx + sway) * dt; p.y += p.vy * dt;
  if (p.e.kind === "mist") {
    const [x0, , x1] = p.e.area;
    if (p.x > x1 + 10) p.x = x0 - 10; else if (p.x < x0 - 10) p.x = x1 + 10;
    return;
  }
  if (p.age > p.life || outside(p, p.e.kind === "wind" ? 30 : 6)) spawn(p, false);
}

/** 0..1 envelope that fades a short-lived particle in and out. */
const envelope = (p: Particle) => (Number.isFinite(p.life) ? Math.sin(Math.PI * Math.min(1, p.age / p.life)) : 1);

export function AmbientFx({ spec, density, dpr, paused }: { spec: FxSpec; density: number; dpr: number; paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const wake = useRef<() => void>(() => {});
  pausedRef.current = paused;
  useEffect(() => { if (!paused) wake.current(); }, [paused]);

  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, dpr);
    let W = 0, H = 0, raf = 0, last = 0, t = 0, flashAt = -10, nextFlash = rand(5, 9);
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      // getBoundingClientRect includes the camera's scale; the layout box does not.
      W = canvas.offsetWidth || r.width; H = canvas.offsetHeight || r.height;
      canvas.width = Math.max(1, Math.round(W * ratio)); canvas.height = Math.max(1, Math.round(H * ratio));
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(canvas);

    const particles: Particle[] = [];
    for (const e of spec.emitters) {
      const n = Math.round(e.count * density);
      for (let i = 0; i < n; i++) { const p = { e } as Particle; spawn(p, true); particles.push(p); }
    }
    const sparks: Spark[] = [];
    const shimmer = spec.shimmer;
    const newSpark = (s: Spark, initial: boolean) => {
      const [x0, y0, x1, y1] = shimmer!.area;
      s.x = rand(x0, x1); s.y = rand(y0, y1); s.life = rand(0.5, 1.5); s.size = rand(1, 2.6); s.age = initial ? rand(0, s.life) : 0;
    };
    if (shimmer) for (let i = 0; i < Math.round(shimmer.count * density); i++) { const s = {} as Spark; newSpark(s, true); sparks.push(s); }
    const glowPhase = spec.glows.map(() => rand(0, 100));
    const rain = particles.filter(p => p.e.kind === "rain");

    function draw(dt: number) {
      t += dt;
      const sx = W / 100, sy = H / 100, k = W / ART_WIDTH;
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx!.clearRect(0, 0, W, H);

      // Firelight and lanterns: soft additive pools that breathe.
      ctx!.globalCompositeOperation = "lighter";
      spec.glows.forEach((g, i) => {
        const ph = glowPhase[i], n = 0.5 + 0.5 * (0.5 * Math.sin(t * 7.3 + ph) + 0.3 * Math.sin(t * 13.1 + ph * 2) + 0.2 * Math.sin(t * 2.1 + ph));
        const r = (g.r / 100) * W * (1 + g.flicker * 0.08 * n);
        ctx!.globalAlpha = 0.34 * (1 - g.flicker * 0.55 + g.flicker * 0.55 * n);
        ctx!.drawImage(glowSprite(g.color), g.x * sx - r, g.y * sy - r, r * 2, r * 2);
      });

      if (shimmer) {
        const img = glowSprite(shimmer.color);
        for (const s of sparks) {
          s.age += dt;
          if (s.age > s.life) newSpark(s, false);
          const a = Math.sin(Math.PI * s.age / s.life);
          const r = s.size * k * 3.2;
          ctx!.globalAlpha = a * a * 0.9;
          ctx!.drawImage(img, s.x * sx - r, s.y * sy - r * 0.55, r * 2, r * 1.1);
        }
      }

      if (spec.lightning) {
        if (t >= nextFlash) { flashAt = t; nextFlash = t + rand(7, 14); }
        const f = t - flashAt;
        if (f < 0.65) {
          const a = f < 0.07 ? f / 0.07 : f < 0.15 ? 1 - ((f - 0.07) / 0.08) * 0.7 : f < 0.22 ? 0.3 + ((f - 0.15) / 0.07) * 0.5 : Math.max(0, 0.8 - (f - 0.22) / 0.43 * 0.8);
          const r = W * 0.55;
          ctx!.globalAlpha = a * 0.3;
          ctx!.drawImage(glowSprite("#c8d2ff"), spec.lightning.x * sx - r, spec.lightning.y * sy - r, r * 2, r * 2);
        }
      }

      // Rain is one batched path.
      if (rain.length) {
        ctx!.globalCompositeOperation = "source-over";
        ctx!.globalAlpha = 0.28;
        ctx!.strokeStyle = rain[0].e.color;
        ctx!.lineWidth = Math.max(0.6, k * 1.1);
        ctx!.beginPath();
        for (const p of rain) {
          update(p, dt, t);
          const x = p.x * sx, y = p.y * sy;
          ctx!.moveTo(x, y); ctx!.lineTo(x + p.vx * sx * 0.022, y + p.vy * sy * 0.022);
        }
        ctx!.stroke();
      }

      for (const p of particles) {
        const kind = p.e.kind;
        if (kind === "rain") continue;
        update(p, dt, t);
        const x = p.x * sx, y = p.y * sy, s = p.size * k;
        if (kind === "petals") {
          ctx!.globalCompositeOperation = "source-over";
          ctx!.globalAlpha = 0.82;
          ctx!.save(); ctx!.translate(x, y); ctx!.rotate(p.rot); ctx!.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(t * 1.7 + p.phase)));
          ctx!.drawImage(petalSprite(p.e.color), -s, -s * 0.55, s * 2, s * 1.1);
          ctx!.restore();
          continue;
        }
        ctx!.globalCompositeOperation = "lighter";
        if (kind === "wind") {
          ctx!.globalAlpha = envelope(p) * 0.2;
          ctx!.drawImage(streakSprite(p.e.color), x - s, y - 2 * k, s * 2, 4 * k + 1);
        } else if (kind === "bubbles") {
          ctx!.globalAlpha = envelope(p) * 0.7;
          ctx!.drawImage(ringSprite(p.e.color), x - s * 2, y - s * 2, s * 4, s * 4);
        } else if (kind === "mist") {
          ctx!.globalAlpha = 0.045 * p.alpha;
          ctx!.drawImage(glowSprite(p.e.color), x - s, y - s * 0.45, s * 2, s * 0.9);
        } else {
          const twinkle = kind === "embers" ? 0.6 + 0.4 * Math.sin(t * 11 + p.phase) : kind === "motes" ? 0.55 + 0.45 * Math.sin(t * 1.6 + p.phase) : 1;
          ctx!.globalAlpha = envelope(p) * twinkle * (kind === "spray" ? 0.75 : 0.9);
          ctx!.drawImage(glowSprite(p.e.color), x - s * 2, y - s * 2, s * 4, s * 4);
        }
      }
      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = "source-over";
    }

    const frame = (now: number) => {
      raf = 0;
      if (pausedRef.current || document.hidden) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      draw(dt);
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf && !pausedRef.current && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };
    wake.current = start;
    const visibility = () => start();
    document.addEventListener("visibilitychange", visibility);
    start();
    return () => { cancelAnimationFrame(raf); resize.disconnect(); document.removeEventListener("visibilitychange", visibility); wake.current = () => {}; };
  }, [spec, density, dpr]);

  return <canvas ref={ref} className="cn-fx" aria-hidden="true" />;
}
