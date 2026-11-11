"use client";
import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { ArrowRight, SkipForward } from "lucide-react";
import { trials, type ArcadeSave, type TrialId } from "../../lib/arcade/arcade";
import { crossingBeats, crossingLines, ease, lerp, span } from "../../lib/story/crossing";
import type { SoundName } from "../../lib/audio/sounds";
import { TrialArtwork } from "../farshore-art";
import { ANCHORS, ChartCompass, ChartDefs, ChartIsland, ChartRoute, ChartSea, FRAME, R, ROUTE, ROUTE_SCALE, ROUTE_TRANSFORM } from "./voyage-chart";
import { shortNames } from "./trial-panel";

/**
 * The voyage crossing: the cinematic between one encounter and the next.
 *
 * Shot from the gods' point of view. Cloud parts over the whole chart, the
 * camera dives to the island Odysseus has just won, he walks down to the shore
 * and boards his ship, the camera follows the ship along the route, and he
 * walks up onto the next island before its title card. The bard narrates.
 *
 * It films the voyage chart itself, so the islands, route and sea are the ones
 * the player knows. Every moving part is driven from one animation frame loop
 * that writes SVG attributes directly; React renders only a few beat changes.
 * Enter, Space, Escape or the button skip straight to the briefing. With
 * reduced motion the game never opens this screen.
 */

type Rival = "studying" | "ready" | "waiting";
type Props = {
  save: ArcadeSave;
  from: TrialId;
  to: TrialId;
  /** A showcase preview: the briefing does not follow and nothing is prepared. */
  preview?: boolean;
  rival: Rival;
  headingRef?: Ref<HTMLElement>;
  onSound: (name: SoundName, gain?: number, pan?: number) => void;
  onSpeak: (text: string) => void;
  onSilence: () => void;
  onDone: () => void;
};
type Point = { x: number; y: number };
type Beat = "sky" | "voyage" | "arrived" | "card";

/** The sprite sheet: Odysseus standing (tile 0) and his ship (tile 3), on transparency. */
const SHEET = "/art/farshore/odysseus-and-ship.png";
const SHEET_SIZE = 1254;
const TILE = SHEET_SIZE / 2;
/**
 * Islands lie only about 190 route units apart, so as the camera dives the
 * medallions shrink a little to open up the sea the ship crosses.
 */
const ISLAND_SCALE = 0.68;
const ISLAND_R = R * ISLAND_SCALE;
/** Sizes in route units. */
const HERO_H = 46;
const SHIP_W = 66;
/** The ship's waterline, as a share of its tile's height. */
const SHIP_WATER = 0.8;
/** Odysseus at the prow, relative to the ship's waterline centre, facing right. */
const DECK = { x: SHIP_W * 0.34, y: -SHIP_W * 0.17, h: SHIP_W * 0.21 };
const DECK_SCALE = DECK.h / HERO_H;
/** How far along the route from an island's centre the ship moors: alongside its shore. */
const MOORING = ISLAND_R + 16;
/** Visible width of the chart, in chart units, for the close shots and while sailing. */
const CLOSE = 300;
const SAILING = 270;
const FOAM = 18;

const pad = (n: number) => String(n).padStart(2, "0");
const toChart = (p: Point): Point => ({ x: FRAME.x + ROUTE_SCALE * p.x, y: FRAME.y + ROUTE_SCALE * p.y });
const mix = (a: Point, b: Point, t: number): Point => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/** The length along the route nearest each island's anchor. */
function anchorLengths(path: SVGPathElement) {
  const total = path.getTotalLength(), steps = 700;
  const best = ANCHORS.map(() => ({ d: Infinity, at: 0 }));
  for (let s = 0; s <= steps; s++) {
    const at = (total * s) / steps, p = path.getPointAtLength(at);
    ANCHORS.forEach(([x, y], i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < best[i].d) best[i] = { d, at };
    });
  }
  return { total, at: best.map(b => b.at) };
}

export function VoyageCrossing(props: Props) {
  const { save, from, to, preview = false, rival, headingRef } = props;
  const fromIndex = trials.findIndex(t => t.id === from), toIndex = trials.findIndex(t => t.id === to);
  const legs = Math.max(1, Math.abs(toIndex - fromIndex));
  const beats = crossingBeats(legs);
  const trial = trials[toIndex];
  const line = crossingLines[to];

  const [beat, setBeat] = useState<Beat>("sky");
  const svg = useRef<SVGSVGElement>(null), path = useRef<SVGPathElement>(null), camera = useRef<SVGGElement>(null);
  const hero = useRef<SVGGElement>(null), heroBody = useRef<SVGGElement>(null), heroShadow = useRef<SVGEllipseElement>(null);
  const ship = useRef<SVGGElement>(null), shipBody = useRef<SVGGElement>(null), deck = useRef<SVGGElement>(null);
  const wake = useRef<SVGGElement>(null), foam = useRef<SVGGElement>(null), islands = useRef<SVGGElement>(null);
  const beam = useRef<SVGGElement>(null), ring = useRef<SVGCircleElement>(null);
  const finished = useRef(false);
  // The loop reads the latest callbacks without restarting.
  const live = useRef(props);
  live.current = props;

  function finish(skipped: boolean) {
    if (finished.current) return;
    finished.current = true;
    if (skipped) live.current.onSilence();
    live.current.onDone();
  }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Escape") return;
      if (e.key !== "Escape" && (e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    }
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  useEffect(() => {
    const node = path.current, view = svg.current;
    if (!node || !view) return;
    const { total, at } = anchorLengths(node);
    const P = (length: number): Point => {
      const p = node.getPointAtLength(Math.max(0, Math.min(total, length)));
      return { x: p.x, y: p.y };
    };
    const dir = toIndex >= fromIndex ? 1 : -1;
    const L0 = at[fromIndex] + dir * MOORING, L1 = at[toIndex] - dir * MOORING;
    const feet = (i: number): Point => ({ x: ANCHORS[i][0], y: ANCHORS[i][1] + ISLAND_R * 0.45 });
    const srcFeet = feet(fromIndex), dstFeet = feet(toIndex);
    const shoreOut = P(L0), shoreIn = P(L1);
    const headingAt = (length: number) => {
      const a = P(length - dir * 2), b = P(length + dir * 2), d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
    };
    // Camera targets, in chart space.
    const onHero = (p: Point) => toChart({ x: p.x, y: p.y - HERO_H * 0.42 });
    const onShip = (p: Point) => toChart({ x: p.x, y: p.y - SHIP_W * 0.3 });
    const sky = { x: 500, y: 310 };
    const srcShot = onHero(mix(srcFeet, shoreOut, 0.5)), dstShot = onHero(mix(shoreIn, dstFeet, 0.5));
    const finale = toChart({ x: ANCHORS[toIndex][0], y: ANCHORS[toIndex][1] });

    // The chart is drawn with "slice", so the widest visible span depends on
    // the window's shape. `tall` is the visible height per unit of width.
    let visible = 1000, tall = 0.46;
    const measure = () => {
      const box = view.getBoundingClientRect();
      visible = Math.min(1000, (620 * box.width) / Math.max(1, box.height));
      tall = box.height / Math.max(1, box.width);
    };
    measure();
    window.addEventListener("resize", measure);

    const islandNodes = Array.from(islands.current?.children ?? []);
    const foamNodes = Array.from(foam.current?.children ?? []) as SVGCircleElement[];
    const wakeNodes = Array.from(wake.current?.children ?? []) as SVGPathElement[];
    const particles: { x: number; y: number; born: number }[] = [];
    const cues: [number, SoundName, number, number?][] = [
      [0.15, "gust", 0.45],
      [beats.appear, "blessing", 0.55],
      [beats.board, "creak", 0.5],
      [beats.board + 0.3, "splash", 0.35],
      [beats.sail, "sail", 0.8],
      [lerp(beats.sail, beats.land, 0.5), "gust", 0.35],
      [beats.land, "splash", 0.4],
      [beats.land + 0.1, "creak", 0.35],
      [beats.arrive, "relic", 0.65],
      [beats.card, "ui-confirm", 0.45],
    ];
    let next = 0, spoken = false, steps = -1, oars = -1, foamClock = 0, slot = 0;
    let facing = Math.sign(headingAt(L0).x) || 1, shown: Beat = "sky";
    let t = 0, last = performance.now(), raf = 0;

    const set = (el: Element | null | undefined, name: string, value: string | number) => el?.setAttribute(name, String(value));

    const frame = (now: number) => {
      if (finished.current) return;
      // A hidden tab pauses the crossing rather than skipping it.
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      const b = beats;

      // Sound and voice.
      while (next < cues.length && t >= cues[next][0]) {
        const [, name, gain, pan] = cues[next++];
        live.current.onSound(name, gain, pan);
      }
      if (!spoken && t >= b.dive - 0.6) { spoken = true; live.current.onSpeak(line); }

      // The beat the overlay text follows.
      const nowBeat: Beat = t >= b.card ? "card" : t >= b.arrive ? "arrived" : t >= b.dive ? "voyage" : "sky";
      if (nowBeat !== shown) { shown = nowBeat; setBeat(nowBeat); }

      // The ship.
      const sailing = span(t, b.sail, b.land);
      const L = t < b.sail ? L0 : t < b.land ? lerp(L0, L1, ease(sailing)) : L1;
      const shipAt = P(L), heading = headingAt(L);
      facing += ((Math.sign(heading.x) || facing) - facing) * Math.min(1, dt * 7);
      const shipIn = ease(span(t, b.board, b.board + 0.45));
      const roll = Math.sin(t * 2.1) * 2.2, bob = Math.sin(t * 1.7) * 1.6;
      set(ship.current, "transform", `translate(${shipAt.x.toFixed(2)} ${shipAt.y.toFixed(2)})`);
      // Once he is ashore the ship withdraws, leaving the island to him.
      set(ship.current, "opacity", (shipIn * (1 - ease(span(t, b.arrive - 0.2, b.arrive + 0.7)))).toFixed(3));
      set(shipBody.current, "transform", `translate(0 ${(bob + (1 - shipIn) * 10).toFixed(2)}) rotate(${roll.toFixed(2)}) scale(${(facing * lerp(0.85, 1, shipIn)).toFixed(3)} ${lerp(0.85, 1, shipIn).toFixed(3)})`);
      const deckWorld = { x: shipAt.x + DECK.x * facing, y: shipAt.y + DECK.y + bob };
      const onDeck = t < b.land ? span(t, b.board + 0.25, b.sail) : 1 - span(t, b.land, b.land + 0.25);
      set(deck.current, "opacity", onDeck.toFixed(3));

      // Oars and foam while under way.
      if (t >= b.sail && t < b.land) {
        const stroke = Math.floor((t - b.sail) / 0.95);
        if (stroke !== oars) { oars = stroke; live.current.onSound("oar", 0.3); }
        foamClock += dt;
        while (foamClock > 0.1) {
          foamClock -= 0.1;
          const stern = P(L - dir * SHIP_W * 0.42);
          particles[slot] = { x: stern.x + (Math.random() - 0.5) * 7, y: stern.y + (Math.random() - 0.5) * 5, born: t };
          slot = (slot + 1) % FOAM;
        }
      }
      foamNodes.forEach((c, i) => {
        const p = particles[i];
        const age = p ? t - p.born : 99;
        if (!p || age > 1.4) { set(c, "opacity", 0); return; }
        set(c, "cx", p.x.toFixed(1)); set(c, "cy", p.y.toFixed(1));
        set(c, "r", (1 + age * 6).toFixed(2));
        set(c, "opacity", (0.4 * (1 - age / 1.4)).toFixed(3));
      });

      // The islands draw back as the camera falls toward them.
      if (t <= b.appear + 0.1) {
        const s = lerp(1, ISLAND_SCALE, ease(span(t, b.dive, b.appear))).toFixed(4);
        islandNodes.forEach((g, i) => set(g, "transform", `translate(${ANCHORS[i][0]} ${ANCHORS[i][1]}) scale(${s}) translate(${-ANCHORS[i][0]} ${-ANCHORS[i][1]})`));
      }

      // The new wake, drawn from the mooring left behind to the ship.
      const a = Math.min(L0, L), len = Math.abs(L - L0);
      const dash = `0 ${((a / total) * 100).toFixed(3)} ${((len / total) * 100).toFixed(3)} 200`;
      wakeNodes.forEach(p => set(p, "stroke-dasharray", dash));
      // A round cap would draw a dot before the ship has moved.
      set(wake.current, "opacity", len > 0.5 ? 1 : 0);

      // Odysseus.
      let feetAt = srcFeet, scale = 1, shade = 0, lift = 0, tilt = 0, flip = 1, walking = -1;
      if (t < b.appear) shade = 0;
      else if (t < b.walkOut) {
        const u = ease(span(t, b.appear, b.appear + 0.55));
        shade = u; scale = lerp(0.75, 1, u); lift = (1 - u) * -26;
      } else if (t < b.board) {
        const u = ease(span(t, b.walkOut, b.board - 0.05));
        feetAt = mix(srcFeet, shoreOut, u); shade = 1; flip = shoreOut.x < srcFeet.x ? -1 : 1; walking = t - b.walkOut;
      } else if (t < b.sail) {
        const u = ease(span(t, b.board, b.sail));
        feetAt = mix(shoreOut, deckWorld, u); scale = lerp(1, DECK_SCALE, u); shade = 1 - span(t, b.board + 0.25, b.sail); flip = facing < 0 ? -1 : 1;
      } else if (t < b.land) shade = 0;
      else if (t < b.walkIn) {
        const u = ease(span(t, b.land, b.walkIn));
        feetAt = mix(deckWorld, shoreIn, u); scale = lerp(DECK_SCALE, 1, u); shade = span(t, b.land, b.land + 0.25); flip = facing < 0 ? -1 : 1;
      } else if (t < b.arrive) {
        const u = ease(span(t, b.walkIn, b.arrive - 0.05));
        feetAt = mix(shoreIn, dstFeet, u); shade = 1; flip = dstFeet.x < shoreIn.x ? -1 : 1; walking = t - b.walkIn;
      } else {
        feetAt = dstFeet; shade = 1; lift = Math.sin((t - b.arrive) * 2.2) * 0.8;
      }
      if (walking >= 0) {
        const phase = walking * 2.6 * Math.PI;
        lift = -Math.abs(Math.sin(phase)) * 3.4;
        tilt = Math.sin(phase) * 3;
        const step = Math.floor(phase / Math.PI);
        if (step !== steps) { steps = step; live.current.onSound("step-grass", 0.3, step % 2 ? 0.15 : -0.15); }
      }
      set(hero.current, "transform", `translate(${feetAt.x.toFixed(2)} ${feetAt.y.toFixed(2)})`);
      set(hero.current, "opacity", shade.toFixed(3));
      set(heroBody.current, "transform", `translate(0 ${lift.toFixed(2)}) rotate(${tilt.toFixed(2)}) scale(${(flip * scale).toFixed(3)} ${scale.toFixed(3)})`);
      set(heroShadow.current, "transform", `scale(${scale.toFixed(3)})`);

      // The gods' light: on the island won, then on the island ahead. It
      // falls on the island's centre, around where Odysseus stands.
      const first = span(t, b.appear - 0.35, b.walkOut + 0.7), second = span(t, b.arrive - 0.2, b.arrive + 1.5);
      const lightAt = t < b.sail ? srcFeet : dstFeet, glow = Math.sin(Math.PI * (t < b.sail ? first : second));
      set(beam.current, "transform", `translate(${lightAt.x} ${lightAt.y})`);
      set(beam.current, "opacity", glow.toFixed(3));
      const burst = t < b.sail ? span(t, b.appear, b.appear + 0.9) : span(t, b.arrive, b.arrive + 0.9);
      set(ring.current, "r", (ISLAND_R * 0.6 + burst * 46).toFixed(2));
      set(ring.current, "opacity", ((1 - burst) * (burst > 0 ? 0.9 : 0)).toFixed(3));

      // The camera.
      let focus: Point, width: number;
      if (t < b.dive) { focus = sky; width = lerp(1350, 1000, ease(span(t, 0, b.dive))); }
      else if (t < b.walkOut) { const u = ease(span(t, b.dive, b.walkOut)); focus = mix(sky, srcShot, u); width = lerp(1000, CLOSE, u); }
      else if (t < b.sail) { focus = mix(srcShot, onShip(shoreOut), ease(span(t, b.walkOut + 0.5, b.sail))); width = CLOSE; }
      else if (t < b.land) {
        // Ease from the boarding shot into a tighter tracking shot, leading the ship.
        const into = ease(span(t, b.sail, b.sail + 0.6)), out = ease(span(t, b.land - 0.6, b.land));
        const swell = Math.sin(Math.PI * sailing), ahead = { x: shipAt.x + heading.x * 26 * swell, y: shipAt.y + heading.y * 26 * swell };
        focus = onShip(ahead); width = lerp(CLOSE, SAILING, into * (1 - out)) + 40 * swell;
      } else if (t < b.arrive) { focus = mix(onShip(shoreIn), dstShot, ease(span(t, b.land, b.arrive))); width = CLOSE; }
      else { const u = ease(span(t, b.arrive, b.end)); focus = mix(dstShot, finale, u); width = lerp(CLOSE, 520, u); }
      // A tall, narrow window (a phone) needs closer shots to keep the figures large.
      const close = t < b.dive ? 0 : ease(span(t, b.dive, b.walkOut));
      width *= lerp(1, Math.max(0.45, Math.min(1, 1 / tall / 1.6)), close);
      // Close shots sit above the subtitle; the closing shot lifts the island clear of the title card.
      const raise = width * tall * (t >= b.arrive ? lerp(0.1, 0.14, ease(span(t, b.arrive, b.end))) : 0.1 * close);
      const zoom = visible / width;
      set(camera.current, "transform", `translate(500 310) scale(${zoom.toFixed(4)}) translate(${(-focus.x).toFixed(2)} ${(-(focus.y + raise)).toFixed(2)})`);

      if (t >= b.end) { finish(false); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
    // The crossing is fixed for the life of this screen (the parent keys it by route).
  }, []);

  const timing = {
    "--x-dive": `${beats.dive}s`,
    "--x-sail": `${beats.sail}s`,
    "--x-arrive": `${beats.arrive}s`,
    "--x-card": `${beats.card}s`,
  } as CSSProperties;
  const rivalLine = preview ? "Preview · your voyage is unchanged"
    : rival === "studying" ? `${trial.character} is studying your last attempts…`
    : rival === "ready" ? `${trial.character} has chosen a strategy`
    : `${trial.character} awaits`;
  const sprite = <image href={SHEET} width={SHEET_SIZE} height={SHEET_SIZE} />;

  return (
    <main
      className="fs-crossing"
      data-beat={beat}
      style={timing}
      tabIndex={-1}
      aria-labelledby="fs-crossing-title"
      ref={headingRef}
    >
      <svg ref={svg} className="fs-crossing-chart" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <ChartDefs />
        <defs>
          <linearGradient id="fs-x-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6d8" stopOpacity="0" />
            <stop offset=".7" stopColor="#ffe4a3" stopOpacity=".45" />
            <stop offset="1" stopColor="#fff6d8" stopOpacity=".85" />
          </linearGradient>
          <radialGradient id="fs-x-pool">
            <stop offset="0" stopColor="#fff3c4" stopOpacity=".8" />
            <stop offset="1" stopColor="#ffe4a3" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={camera}>
          {/* The table the chart lies on, for windows wider or taller than the chart. */}
          <rect x="-2400" y="-2400" width="5800" height="5420" fill="#030b14" />
          <ChartSea />
          <g transform={ROUTE_TRANSFORM}>
            <ChartCompass />
            <ChartRoute sailed={null} pathRef={path} />
            <g ref={wake} opacity="0">
              <path d={ROUTE} pathLength={100} fill="none" stroke="#ffd98a" strokeWidth="10" opacity=".3" filter="url(#chart-glow)" strokeDasharray="0 200" />
              <path d={ROUTE} pathLength={100} fill="none" stroke="#fff0c4" strokeWidth="2.8" strokeLinecap="round" opacity=".9" strokeDasharray="0 200" />
            </g>
            <g ref={islands}>
              {trials.map((t, i) => (
                <g key={t.id}>
                  <ChartIsland index={i} open={save.started} done={save.records[t.id].cleared !== "pending"} selected={i === toIndex && (beat === "arrived" || beat === "card")} />
                </g>
              ))}
            </g>
            <g ref={foam}>
              {Array.from({ length: FOAM }, (_, i) => <circle key={i} r="0" fill="none" stroke="#e8fbff" strokeWidth="1.1" opacity="0" />)}
            </g>
            <g ref={beam} opacity="0">
              <path d="M-18 -560 L18 -560 L34 0 L-34 0Z" fill="url(#fs-x-beam)" filter="url(#chart-glow)" />
              <ellipse rx="52" ry="17" fill="url(#fs-x-pool)" />
              <circle ref={ring} r="0" fill="none" stroke="#ffe4a3" strokeWidth="3" opacity="0" />
            </g>
            <g ref={ship} opacity="0">
              <ellipse cy="2" rx={SHIP_W * 0.42} ry={SHIP_W * 0.06} fill="#02101b" opacity=".4" />
              <g ref={shipBody}>
                {/* Drawn before the hull, so the rail hides his feet and he stands on deck. */}
                <g ref={deck} opacity="0">
                  <svg x={DECK.x - DECK.h / 2} y={DECK.y - DECK.h * 0.98} width={DECK.h} height={DECK.h} viewBox={`0 0 ${TILE} ${TILE}`}>{sprite}</svg>
                </g>
                <svg x={-SHIP_W / 2} y={-SHIP_W * SHIP_WATER} width={SHIP_W} height={SHIP_W} viewBox={`${TILE} ${TILE} ${TILE} ${TILE}`}>{sprite}</svg>
              </g>
            </g>
            <g ref={hero} opacity="0">
              <ellipse ref={heroShadow} rx={HERO_H * 0.24} ry={HERO_H * 0.07} fill="#02101b" opacity=".5" />
              <g ref={heroBody}>
                <svg x={-HERO_H / 2} y={-HERO_H * 0.98} width={HERO_H} height={HERO_H} viewBox={`0 0 ${TILE} ${TILE}`}>{sprite}</svg>
              </g>
            </g>
          </g>
        </g>
      </svg>

      <div className="fs-crossing-sky" aria-hidden="true"><i /><i /><i /></div>
      <div className="fs-crossing-rays" aria-hidden="true" />
      <div className="fs-crossing-vignette" aria-hidden="true" />
      <span className="fs-letterbox fs-letterbox-top" aria-hidden="true" />
      <span className="fs-letterbox fs-letterbox-bottom" aria-hidden="true" />

      <header className="fs-crossing-top">
        <span>THE VOYAGE CONTINUES</span>
        <span>{pad(fromIndex + 1)} {shortNames[from]} <ArrowRight size={12} aria-label="to" /> {pad(toIndex + 1)} {shortNames[to]}</span>
      </header>
      <div className="fs-crossing-olympus" aria-hidden="true">
        <span>FROM MOUNT OLYMPUS</span>
        <strong>The gods are watching.</strong>
      </div>
      <p className="fs-crossing-line" aria-live="polite"><span>The bard</span>{line}</p>
      <section className="fs-crossing-card">
        <TrialArtwork id={to} className="fs-crossing-art" />
        <div>
          <span className="fs-crossing-eyebrow">ENCOUNTER {pad(toIndex + 1)} / {pad(trials.length)} · {trial.kind.toUpperCase()}</span>
          <h1 id="fs-crossing-title">{trial.title}</h1>
          <p data-rival={preview ? "preview" : rival}>{rivalLine}</p>
        </div>
      </section>
      <button className="fs-crossing-skip" onClick={() => finish(true)} aria-label={preview ? "End the preview" : beat === "card" ? "Open the briefing" : "Skip the voyage and open the briefing"}>
        {beat === "card" ? <>{preview ? "Done" : "Open the briefing"} <ArrowRight size={15} /></> : <>Skip <SkipForward size={15} /></>}
        <kbd>Enter</kbd>
      </button>
    </main>
  );
}
