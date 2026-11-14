"use client";
// The pixel skin's cinematic layer. Every effect is decoration over the real
// interface: it never takes input (pointer-events: none), it pauses in hidden
// tabs, and with reduced motion it renders its final state at once.
import { useEffect, useRef, useState } from "react";
import { type AmbiencePreset, type Dissolve, PRESETS, moteAlpha, seeded, spawnMote, stepMote, typeSchedule, uncoverAt, type Mote } from "../../lib/render/pixel-fx";

const INK: [number, number, number] = [4, 8, 15];
/** CSS pixels per art pixel for the full-screen effects. */
const CELL = 8;

/** Uncovers a new screen from night ink in a dithered dissolve (or a block sweep). */
export function PixelTransition({ kind = "dither", ms = 560, still = false }: { kind?: Dissolve; ms?: number; still?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(still);
  useEffect(() => {
    const c = canvas.current;
    if (!c || still) return;
    const cols = Math.ceil(window.innerWidth / CELL), rows = Math.ceil(window.innerHeight / CELL);
    c.width = cols; c.height = rows;
    const ctx = c.getContext("2d");
    if (!ctx) { setDone(true); return; }
    const image = ctx.createImageData(cols, rows), order = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) order[y * cols + x] = uncoverAt(x, y, cols, kind);
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      // Thirty steps a second: the dissolve reads as frames, not as a fade.
      const t = Math.floor(((now - start) / ms) * 30) / 30;
      for (let i = 0; i < order.length; i++) {
        const o = i * 4, covered = order[i] >= t;
        image.data[o] = INK[0]; image.data[o + 1] = INK[1]; image.data[o + 2] = INK[2]; image.data[o + 3] = covered ? 255 : 0;
      }
      ctx.putImageData(image, 0, 0);
      if (t < 1) raf = requestAnimationFrame(frame); else setDone(true);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind, ms, still]);
  if (done) return null;
  return <canvas ref={canvas} className="fs-px-transition" aria-hidden="true" />;
}

/** Ambient pixel motes over a scene: stars above the night sea, embers in the cave, rain in the storm. */
export function PixelAmbience({ preset, still = false, strength = 1, seed = 7, className = "" }: { preset: AmbiencePreset; still?: boolean; strength?: number; seed?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current, host = c?.parentElement;
    if (!c || !host) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const rand = seeded(seed), spec = PRESETS[preset];
    let w = 0, h = 0, motes: Mote[] = [], raf = 0, last = performance.now(), acc = 0, flash = 0, nextBolt = 3 + rand() * 4, shooting: { x: number; y: number; t: number } | null = null, nextStar = 2.5;
    const size = () => {
      const r = host.getBoundingClientRect();
      w = Math.max(1, Math.ceil(r.width / 3)); h = Math.max(1, Math.ceil(r.height / 3));
      c.width = w; c.height = h;
      const count = Math.round(spec.count * Math.max(0, Math.min(1, strength)));
      motes = Array.from({ length: count }, () => spawnMote(preset, rand, w, h, true));
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      if (flash > 0) { ctx.globalAlpha = Math.min(0.35, flash); ctx.fillStyle = "#d8f4ff"; ctx.fillRect(0, 0, w, h); }
      for (const m of motes) {
        const a = moteAlpha(m, preset);
        if (!a) continue;
        ctx.globalAlpha = a; ctx.fillStyle = m.color;
        const x = Math.round(m.x), y = Math.round(m.y);
        if (preset === "storm") ctx.fillRect(x, y, 1, 3);
        else if (preset === "wind") ctx.fillRect(x, y, 6, 1);
        else if (preset === "notes") { ctx.fillRect(x, y, 2, 2); ctx.fillRect(x + 1, y - 4, 1, 4); ctx.fillRect(x + 2, y - 4, 1, 1); }
        else if (m.size === 2) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
        else ctx.fillRect(x, y, 1, 1);
      }
      if (shooting) {
        ctx.globalAlpha = 1; ctx.fillStyle = "#ffe3a1";
        for (let i = 0; i < 7; i++) { ctx.globalAlpha = 1 - i / 7; ctx.fillRect(Math.round(shooting.x - i * 2), Math.round(shooting.y - i), 2, 1); }
      }
      ctx.globalAlpha = 1;
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) { last = now; return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
      if (acc < 1 / 30) return;
      const step = acc; acc = 0;
      motes = motes.map(m => (stepMote(m, preset, step, w, h) ? m : spawnMote(preset, rand, w, h)));
      if (preset === "stars") {
        nextStar -= step;
        if (!shooting && nextStar <= 0) { shooting = { x: w * (0.15 + rand() * 0.6), y: h * (0.04 + rand() * 0.18), t: 0 }; nextStar = 4 + rand() * 6; }
        if (shooting) { shooting.t += step; shooting.x += 150 * step; shooting.y += 75 * step; if (shooting.t > 0.7) shooting = null; }
      }
      if (preset === "storm") {
        // At most one flash every few seconds, low and brief (photosensitivity).
        nextBolt -= step; flash = Math.max(0, flash - step * 3);
        if (nextBolt <= 0) { flash = 0.5; nextBolt = 4 + rand() * 5; }
      }
      draw();
    };
    size();
    draw();
    if (!still) raf = requestAnimationFrame(tick);
    const observer = new ResizeObserver(() => { size(); draw(); });
    observer.observe(host);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [preset, still, strength, seed]);
  return <canvas ref={canvas} className={`fs-px-ambience ${className}`} data-preset={preset} aria-hidden="true" />;
}

/**
 * The splash's one big moment: a bolt strikes, and the wordmark assembles from
 * golden motes rising out of the sea; then the real logo takes over.
 */
export function WordmarkAssembly({ target, still = false, onDone }: { target: () => HTMLElement | null; still?: boolean; onDone?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [gone, setGone] = useState(still);
  useEffect(() => {
    if (still) { onDone?.(); return; }
    const c = canvas.current, el = target();
    if (!c || !el) { setGone(true); onDone?.(); return; }
    const ctx = c.getContext("2d");
    if (!ctx) { setGone(true); onDone?.(); return; }
    const scale = 3, W = Math.ceil(window.innerWidth / scale), H = Math.ceil(window.innerHeight / scale);
    c.width = W; c.height = H;
    const box = el.getBoundingClientRect(), style = getComputedStyle(el);
    // Sample the word as the page draws it, at art resolution.
    const off = document.createElement("canvas"), ow = Math.ceil(box.width / scale), oh = Math.ceil(box.height / scale);
    off.width = ow; off.height = oh;
    const o = off.getContext("2d")!;
    o.font = `${parseFloat(style.fontSize) / scale}px ${style.fontFamily}`;
    o.textBaseline = "middle"; o.fillStyle = "#fff";
    o.fillText(el.textContent || "FARSHORE", 0, oh / 2);
    const data = o.getImageData(0, 0, ow, oh).data, rand = seeded(11);
    type P = { tx: number; ty: number; sx: number; sy: number; delay: number; color: string };
    const ps: P[] = [];
    const left = box.left / scale, top = box.top / scale;
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      if (data[(y * ow + x) * 4 + 3] < 128) continue;
      const band = y / oh;
      ps.push({ tx: left + x, ty: top + y, sx: rand() * W, sy: H * (0.62 + rand() * 0.38), delay: 0.25 + rand() * 0.55 + (x / ow) * 0.25, color: band < 0.3 ? "#ffe3a1" : band < 0.55 ? "#e9b85c" : band < 0.8 ? "#c08a3e" : "#8a5a2b" });
    }
    const start = performance.now(), total = 1.9;
    let raf = 0;
    const frame = (now: number) => {
      const t = Math.floor(((now - start) / 1000) * 30) / 30;
      ctx.clearRect(0, 0, W, H);
      // The bolt: two frames of light down to the trident, once.
      if (t > 0.08 && t < 0.2) {
        ctx.fillStyle = "rgba(216,244,255,0.28)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#f6f0e3";
        let x = left + ow * 0.69, y = 0;
        while (y < top) { const nx = x + (rand() - 0.5) * 6; for (let i = 0; i < 4 && y < top; i++, y++) ctx.fillRect(Math.round(x + (nx - x) * (i / 4)), y, 1, 1); x = nx; }
      }
      for (const p of ps) {
        const k = Math.max(0, Math.min(1, (t - p.delay) / 0.7));
        if (k <= 0) continue;
        const e = 1 - Math.pow(1 - k, 3);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.sx + (p.tx - p.sx) * e), Math.round(p.sy + (p.ty - p.sy) * e), 1, 1);
      }
      if (t < total) raf = requestAnimationFrame(frame);
      else { setGone(true); onDone?.(); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // The splash plays this once per visit.
  }, []);
  if (gone) return null;
  return <canvas ref={canvas} className="fs-px-assembly" aria-hidden="true" />;
}

/** Types a line out letter by letter. The finished line reserves its space, and screen readers get it whole. */
export function Typewriter({ text, still = false, cps = 42, delay = 0, className = "", as: Tag = "span" }: { text: string; still?: boolean; cps?: number; delay?: number; className?: string; as?: "span" | "p" }) {
  const [shown, setShown] = useState(still ? text.length : 0);
  useEffect(() => {
    if (still) { setShown(text.length); return; }
    setShown(0);
    const { at } = typeSchedule(text, cps), start = performance.now() + delay;
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      let n = 0;
      while (n < at.length && at[n] <= t) n++;
      setShown(n);
      if (n < text.length) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [text, still, cps, delay]);
  const done = shown >= text.length;
  // One text flow: the typed part shows, the rest keeps its place invisibly, so
  // wrapping (and any line clamp) is exactly the finished paragraph's.
  return (
    <Tag className={`fs-type ${className}`} data-done={done || undefined} onClick={() => setShown(text.length)}>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      {!done && <i className="fs-type-caret" aria-hidden="true" />}
      {!done && <span className="fs-type-rest" aria-hidden="true">{text.slice(shown)}</span>}
      <span className="fs-sr-only">{text}</span>
    </Tag>
  );
}

/**
 * SVG filters that turn any element into a mosaic of square blocks; the
 * motion sheet steps art through them (32, 16, 8, 4 px, then sharp) so it
 * resolves like an old console loading a picture.
 */
export function PixelFilters() {
  const sizes = [32, 16, 8, 4];
  return (
    <svg className="fs-px-filters" aria-hidden="true" focusable="false" width="0" height="0">
      {sizes.map(s => (
        <filter key={s} id={`fs-mosaic-${s}`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feFlood x={s / 2 - 1} y={s / 2 - 1} width="2" height="2" />
          <feComposite width={s} height={s} />
          <feTile result="grid" />
          <feComposite in="SourceGraphic" in2="grid" operator="in" />
          <feMorphology operator="dilate" radius={s / 2} />
        </filter>
      ))}
    </svg>
  );
}
