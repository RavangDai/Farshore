// Shared canvas plumbing for the immersive game stage.
//
// Every scene renders into a fixed logical 16:9 space and is scaled to whatever
// the viewport gives it. Keeping the logical space fixed means gameplay
// geometry, sprite proportions and hit feedback stay identical on a laptop and
// on a projector, and a scene never has to think about device pixels.

/** Logical design space. All scene drawing uses these coordinates. */
export const VIEW_W = 1600;
export const VIEW_H = 900;

export type StageFrame = {
  /** Continuously rising decorative clock in ms. Frozen when motion is reduced. */
  now: number;
  /** Seconds since the previous frame, bounded. */
  dt: number;
};

/**
 * Size a canvas to its element box at the device pixel ratio and return a
 * context pre-scaled to the logical 16:9 space.
 *
 * The canvas is letterboxed by CSS (`aspect-ratio`), so the logical space always
 * maps to the full backing store without distortion.
 */
export function prepareCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  const ratio = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
  const box = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round((box.width || VIEW_W) * ratio));
  const height = Math.max(1, Math.round((box.height || VIEW_H) * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(width / VIEW_W, 0, 0, height / VIEW_H, 0, 0);
  return context;
}

// ---------------------------------------------------------------------------
// Small drawing helpers
// ---------------------------------------------------------------------------

export function fillCircle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

export function ellipseShadow(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.45) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = "#01060e";
  c.beginPath();
  c.ellipse(x, y, Math.max(0.5, w), Math.max(0.5, h), 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** A soft radial light. Cheap enough to use several times per frame. */
export function glow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  inner: string,
  outer = "#00000000",
) {
  if (radius <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.fill();
}

export function roundedRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

/** Jagged rock silhouette, deterministic for a given seed. */
export function rockRidge(
  c: CanvasRenderingContext2D,
  y: number,
  height: number,
  seed: number,
  fill: string,
  offset: number,
  step = 150,
) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(-step, VIEW_H);
  for (let x = -step; x <= VIEW_W + step; x += step) {
    const n = Math.sin((x + offset) * 0.0041 + seed) * 0.5 + Math.sin((x + offset) * 0.013 + seed * 2.3) * 0.5;
    c.lineTo(x, y - n * height);
  }
  c.lineTo(VIEW_W + step, VIEW_H);
  c.closePath();
  c.fill();
}

export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const clamp01 = (n: number) => clamp(n, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Smooth 0→1 easing, used for telegraph swells and lane tweens. */
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Deterministic hash in [0,1) — lets scenes vary art without storing it. */
export function hash01(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  colour: string;
  gravity: number;
  kind: "dust" | "spark" | "ember" | "splash" | "ring" | "shard";
};

/**
 * A fixed-capacity particle pool.
 *
 * Decorative only: particles are spawned from gameplay event stamps the engine
 * already publishes, never read back into the simulation, and the cap means a
 * long run cannot grow the frame cost.
 */
export class Particles {
  private pool: Particle[] = [];
  private capacity: number;
  constructor(capacity = 220) {
    this.capacity = capacity;
  }

  get count() {
    return this.pool.length;
  }

  spawn(p: Omit<Particle, "life"> & { life?: number }) {
    if (this.pool.length >= this.capacity) this.pool.shift();
    this.pool.push({ ...p, life: p.life ?? p.max });
  }

  burst(
    x: number,
    y: number,
    count: number,
    make: (i: number) => Partial<Particle>,
    base: Partial<Particle> = {},
  ) {
    const n = Math.min(count, Math.max(0, this.capacity - this.pool.length) + 12);
    for (let i = 0; i < n; i++) {
      const spec = { ...base, ...make(i) };
      this.spawn({
        x,
        y,
        vx: 0,
        vy: 0,
        max: 600,
        size: 4,
        colour: "#ffd8a0",
        gravity: 0,
        kind: "dust",
        ...spec,
      } as Particle);
    }
  }

  update(dt: number) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life -= dt * 1000;
      if (p.life <= 0) {
        this.pool.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(c: CanvasRenderingContext2D) {
    c.save();
    for (const p of this.pool) {
      const t = clamp01(p.life / p.max);
      c.globalAlpha = p.kind === "ring" ? t * 0.5 : t;
      if (p.kind === "ring") {
        c.strokeStyle = p.colour;
        c.lineWidth = 2 + (1 - t) * 3;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (1 + (1 - t) * 3), 0, Math.PI * 2);
        c.stroke();
      } else if (p.kind === "shard") {
        c.fillStyle = p.colour;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.life * 0.01);
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
        c.restore();
      } else if (p.kind === "splash") {
        c.strokeStyle = p.colour;
        c.lineWidth = Math.max(1, p.size * 0.4);
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        c.stroke();
      } else {
        c.fillStyle = p.colour;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (p.kind === "spark" ? t : 1), 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  clear() {
    this.pool.length = 0;
  }
}

/**
 * Fires a callback once per new value of a monotonically rising event stamp.
 *
 * Scenes use this to turn "the engine says a hit happened at 12480 ms" into one
 * particle burst, without the engine having to know particles exist.
 */
export class EventStamp {
  private seen = -Infinity;
  /** Returns true exactly once for each new stamp. */
  fired(stamp: number) {
    if (stamp > this.seen) {
      this.seen = stamp;
      return true;
    }
    return false;
  }
  reset() {
    this.seen = -Infinity;
  }
}

/** Screen shake offset from a decaying magnitude, in logical pixels. */
export function shakeOffset(magnitude: number, now: number, strength = 1): [number, number] {
  if (magnitude <= 0 || strength <= 0) return [0, 0];
  const amount = Math.min(1, magnitude / 420) * 26 * strength;
  return [Math.sin(now * 0.08) * amount, Math.cos(now * 0.113) * amount * 0.7];
}
