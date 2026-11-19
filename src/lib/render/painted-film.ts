// Draws the mythic cinematics (lib/story/cinema.ts) with the cinematic asset
// pack's own paintings: plain DOM layers moved by transforms each frame, no
// WebGL. Every painting sits in a box with its exact 1672:941 ratio, so the
// map's checkpoints, the ship's light and the markers stay where the art puts
// them at any zoom.

import type { TrialId } from "../arcade/arcade.ts";
import { ART_HEIGHT, ART_WIDTH, ENVIRONMENTS, envSrc } from "../cinema/art.ts";
import { CHECKPOINTS, MAP_ART, MARKER_ART } from "../cinema/map-layout.ts";
import { DURATION, gateShot, journeyShot, voyagePoint, type CinemaKind } from "../story/cinema.ts";

const RATIO = ART_WIDTH / ART_HEIGHT;
const MARKER_PX = 68;

type Layer = { root: HTMLDivElement; stage: HTMLDivElement; focus: [number, number] };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
function img(src: string, className: string, parent: HTMLElement) {
  const node = el("img", className, parent);
  node.alt = ""; node.decoding = "async"; node.draggable = false; node.src = src;
  return node;
}
const decode = (node: HTMLImageElement) => node.decode().catch(() => {});

export class PaintedFilm {
  /** Resolves once every painting is decoded, so the film never opens on an empty frame. */
  readonly ready: Promise<void>;
  private readonly root: HTMLDivElement;
  private readonly kind: CinemaKind;
  private readonly from: TrialId | null;
  private readonly to: TrialId;
  private readonly layers: Partial<Record<"from" | "map" | "to", Layer>> = {};
  private ship: HTMLSpanElement | null = null;
  /** The pack's sea route as a path, and where on it the voyage starts and ends (path lengths). */
  private route: { path: SVGPathElement; from: number; to: number } | null = null;
  private markers: HTMLImageElement[] = [];
  private key: HTMLSpanElement | null = null;
  private seal: HTMLSpanElement | null = null;
  private pour: HTMLSpanElement | null = null;
  private size = { w: 1, h: 1 };
  private readonly resize: ResizeObserver;

  constructor(host: HTMLElement, opts: { kind: CinemaKind; to: TrialId; from?: TrialId | null }) {
    this.kind = opts.kind; this.to = opts.to; this.from = opts.from ?? null;
    this.root = el("div", "fs-film", host);
    const images: HTMLImageElement[] = [];
    const painting = (name: "from" | "to", id: TrialId) => {
      const root = el("div", "fs-film-layer", this.root), stage = el("div", "fs-film-stage", root);
      images.push(img(envSrc(id), "fs-film-art", stage));
      this.layers[name] = { root, stage, focus: ENVIRONMENTS[id].focus };
    };
    if (this.kind === "journey") {
      if (this.from) painting("from", this.from);
      const root = el("div", "fs-film-layer", this.root), stage = el("div", "fs-film-stage fs-film-map", root);
      images.push(img(MAP_ART.src, "fs-film-art", stage));
      img(MAP_ART.route, "fs-film-art fs-film-route", stage);
      const pins: [TrialId | null, string][] = [[this.from, MARKER_ART.completed], [this.to, MARKER_ART.current]];
      for (const [id, src] of pins) {
        if (!id) continue;
        const pin = img(src, "fs-film-marker", stage);
        pin.style.left = `${CHECKPOINTS[id].x}%`; pin.style.top = `${CHECKPOINTS[id].y}%`;
        this.markers.push(pin);
      }
      this.ship = el("span", "fs-film-ship", stage);
      this.layers.map = { root, stage, focus: [0.5, 0.5] };
      painting("to", this.to);
    } else {
      painting("to", this.to);
      this.pour = el("span", "fs-film-pour", this.root);
      this.seal = el("span", "fs-film-seal", this.root);
      this.key = el("span", "fs-film-key", this.root);
    }
    this.resize = new ResizeObserver(() => this.measure());
    this.resize.observe(host);
    this.measure();
    const routed = this.kind === "journey" && this.from ? this.traceRoute(this.from, this.to) : Promise.resolve();
    this.ready = Promise.all([...images.map(decode), routed]).then(() => {});
  }

  /**
   * Loads route.svg and finds where the dashed route passes each checkpoint, so
   * the ship's light sails the route the chart draws. Without it, the light
   * takes a gentle arc between the checkpoints instead.
   */
  private async traceRoute(from: TrialId, to: TrialId) {
    try {
      const text = await (await fetch(MAP_ART.route)).text();
      const d = new DOMParser().parseFromString(text, "image/svg+xml").querySelector("path")?.getAttribute("d");
      if (!d) return;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "fs-film-route-probe");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
      this.root.appendChild(svg);
      const total = path.getTotalLength(), samples = 600;
      const nearest = (id: TrialId) => {
        const cx = (CHECKPOINTS[id].x / 100) * ART_WIDTH, cy = (CHECKPOINTS[id].y / 100) * ART_HEIGHT;
        let best = 0, bestD = Infinity;
        for (let i = 0; i <= samples; i++) {
          const at = (i / samples) * total, p = path.getPointAtLength(at), dist = Math.hypot(p.x - cx, p.y - cy);
          if (dist < bestD) { bestD = dist; best = at; }
        }
        return best;
      };
      const a = nearest(from), b = nearest(to);
      // Only trust the route when it really runs past both checkpoints, in voyage order.
      if (b > a) this.route = { path, from: a, to: b };
    } catch { /* The arc stands in. */ }
  }

  private measure() {
    const r = this.root.getBoundingClientRect();
    this.size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  /** A painting covering the frame, anchored on its focal subject, pushed in by `zoom` about that subject. */
  private place(layer: Layer, opacity: number, zoom: number) {
    const { w, h } = this.size, sw = Math.max(w, h * RATIO), sh = sw / RATIO, [fx, fy] = layer.focus;
    layer.root.style.opacity = opacity.toFixed(3);
    layer.root.style.visibility = opacity > 0.001 ? "visible" : "hidden";
    const s = layer.stage.style;
    s.width = `${sw}px`; s.height = `${sh}px`;
    s.transformOrigin = `${fx * 100}% ${fy * 100}%`;
    s.transform = `translate3d(${(w - sw) * fx}px, ${(h - sh) * fy}px, 0) scale(${zoom.toFixed(4)})`;
  }

  /** The chart, with the camera centred on a point of the map (fractions) at `zoom` times the cover size, never showing past its edges. */
  private aim(layer: Layer, opacity: number, zoom: number, point: { x: number; y: number }) {
    const { w, h } = this.size, sw = Math.max(w, h * RATIO), sh = sw / RATIO;
    layer.root.style.opacity = opacity.toFixed(3);
    layer.root.style.visibility = opacity > 0.001 ? "visible" : "hidden";
    const tx = Math.min(0, Math.max(w - sw * zoom, w / 2 - point.x * sw * zoom));
    const ty = Math.min(0, Math.max(h - sh * zoom, h / 2 - point.y * sh * zoom));
    const s = layer.stage.style;
    s.width = `${sw}px`; s.height = `${sh}px`; s.transformOrigin = "0 0";
    s.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${zoom.toFixed(4)})`;
    // Markers and the ship keep their on-screen size while the chart zooms.
    const pin = `${(MARKER_PX / zoom).toFixed(2)}px`;
    for (const m of this.markers) { m.style.width = pin; m.style.height = pin; }
    if (this.ship) { const d = `${(34 / zoom).toFixed(2)}px`; this.ship.style.width = d; this.ship.style.height = d; }
  }

  render(t: number) {
    const time = Math.max(0, Math.min(DURATION[this.kind], t));
    if (this.kind === "journey") {
      const shot = journeyShot(time), to = CHECKPOINTS[this.to], from = this.from ? CHECKPOINTS[this.from] : to;
      const a = { x: from.x / 100, y: from.y / 100 }, b = { x: to.x / 100, y: to.y / 100 };
      let at = voyagePoint(a, b, shot.voyage);
      if (this.route) {
        const p = this.route.path.getPointAtLength(this.route.from + (this.route.to - this.route.from) * shot.voyage);
        at = { x: p.x / ART_WIDTH, y: p.y / ART_HEIGHT };
      }
      if (this.layers.from) this.place(this.layers.from, shot.from, shot.fromZoom);
      if (this.layers.map) this.aim(this.layers.map, this.layers.from ? shot.map : Math.max(shot.map, shot.from), shot.mapZoom, at);
      if (this.layers.to) this.place(this.layers.to, shot.to, shot.toZoom);
      if (this.ship) { this.ship.style.left = `${at.x * 100}%`; this.ship.style.top = `${at.y * 100}%`; }
      return;
    }
    const shot = gateShot(time);
    if (this.layers.to) this.place(this.layers.to, 1, shot.zoom);
    if (this.key) {
      this.key.style.opacity = shot.key.visible ? String(Math.min(1, shot.key.glow + 0.2)) : "0";
      this.key.style.top = `${(-8 + 58 * shot.key.y).toFixed(2)}%`;
    }
    if (this.seal) { this.seal.style.opacity = shot.seal.toFixed(3); this.seal.style.transform = `translate(-50%, -50%) scale(${(0.6 + 0.5 * shot.seal).toFixed(3)})`; }
    if (this.pour) this.pour.style.opacity = shot.light.toFixed(3);
  }

  dispose() {
    this.resize.disconnect();
    this.root.remove();
  }
}
