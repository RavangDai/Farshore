"use client";
import { useEffect, useRef, useState } from "react";
import { clearedCount, trials, unlocked, type ArcadeSave, type TrialId } from "../../lib/arcade/arcade";
import { FARSHORE_ATLAS } from "../farshore-art";
import { shortNames } from "./trial-panel";

/**
 * The voyage chart.
 *
 * A bronze-framed sea chart from Troy to Ithaca. Each island is a round
 * medallion painted with its own trial, numbered along the route, so the
 * chart reads as a journey between recognisable places. The ship rides the
 * route between the last island cleared and the next.
 *
 * Everything animated here is decorative. With reduced motion the waves, the
 * route and the ring hold still, and the chart stays fully usable.
 */

type Props = {
  save: ArcadeSave;
  selected: TrialId;
  still: boolean;
  onSelect: (id: TrialId) => void;
  onOpen: (id: TrialId) => void;
  /** The island under the pointer or keyboard focus, so the panel can preview it. */
  onHover: (id: TrialId | null) => void;
};

/** Island anchors in chart space (1000 x 620), ordered along the route. */
const ANCHORS: [number, number][] = [
  [126, 150],
  [290, 96],
  [470, 150],
  [660, 112],
  [826, 208],
  [800, 390],
  [596, 448],
  [372, 406],
];

/** The sailing line, drawn through the anchors with a hand-drawn drift. */
const ROUTE =
  "M126 150 C 196 96, 236 72, 290 96 S 406 176, 470 150 S 598 82, 660 112 S 806 150, 826 208 S 846 338, 800 390 S 686 420, 596 448 S 448 448, 372 406";

/** Medallion radius, and the trial atlas: 1254 px square, four tiles by three. */
const R = 46;
const ATLAS = 1254;
const TILE_W = ATLAS / 4;
const TILE_H = ATLAS / 3;
/** A square crop of a 3:4 tile, inset past the dark gutters between tiles. */
const CROP = TILE_W - 12;

/** The framed sea area, inside the tick labels. The route is drawn into it at 0.92 scale. */
const FRAME = { x: 40, y: 34, w: 920, h: 552 };
const LONGITUDES = [20, 22, 24, 26, 28, 30, 32, 34];
const LATITUDES = [40, 38, 36, 34, 32, 30];

/** Where the ship waits before the first island. */
const HARBOUR = { x: 58, y: 300, angle: -30 };

export function VoyageChart({ save, selected, still, onSelect, onOpen, onHover }: Props) {
  const cleared = clearedCount(save);
  const path = useRef<SVGPathElement>(null);
  const [shipAt, setShipAt] = useState<{ x: number; y: number; angle: number } | null>(null);

  // The lit wake runs from Troy to the next island to play.
  const furthest = Math.min(trials.length - 1, cleared);
  const sailed = (furthest / (trials.length - 1)) * 100;

  // The ship rides the real route path, halfway past the last island cleared,
  // so it never sits on top of a medallion.
  useEffect(() => {
    const node = path.current;
    if (!node || cleared === 0) {
      setShipAt(HARBOUR);
      return;
    }
    const total = node.getTotalLength();
    const t = (Math.min(cleared, trials.length - 1) - 0.5) / (trials.length - 1);
    const at = node.getPointAtLength(total * t);
    const ahead = node.getPointAtLength(Math.min(total, total * t + 6));
    setShipAt({ x: at.x, y: at.y, angle: (Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180) / Math.PI });
  }, [cleared]);

  return (
    <div className={`fs-chart-frame${still ? " fs-chart-still" : ""}`}>
      <svg className="fs-chart" viewBox="0 0 1000 620" role="group" aria-label="The voyage from Troy to Ithaca">
        <defs>
          <radialGradient id="chart-deep" cx="50%" cy="42%">
            <stop offset="0%" stopColor="#1b4a63" />
            <stop offset="60%" stopColor="#0e2d44" />
            <stop offset="100%" stopColor="#061626" />
          </radialGradient>
          <linearGradient id="chart-route" x1="0" x2="1">
            <stop offset="0%" stopColor="#e9b85c" />
            <stop offset="100%" stopColor="#32d4f5" />
          </linearGradient>
          <filter id="chart-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <clipPath id="fs-medal-clip">
            <circle r={R} />
          </clipPath>
          <filter id="fs-medal-grey">
            <feColorMatrix type="saturate" values=".5" />
          </filter>
        </defs>

        <rect width="1000" height="620" fill="url(#chart-deep)" />

        {/* Swell: three bands of wave crests at different depths. */}
        {[0, 1, 2].map(band => (
          <g key={band} className={`fs-chart-swell fs-swell-${band}`} opacity={0.3 - band * 0.07}>
            {Array.from({ length: 13 }, (_, row) => (
              <path
                key={row}
                d={Array.from({ length: 11 }, (_, i) => `M${i * 100 - 40} ${30 + row * 48 + band * 9} q14-9 28 0 t28 0`).join(" ")}
                fill="none"
                stroke="#8fd3e0"
                strokeWidth="1.4"
              />
            ))}
          </g>
        ))}

        {/* The graticule and its bronze frame, with degrees along every edge. */}
        <g className="fs-chart-graticule" aria-hidden="true">
          {LONGITUDES.map((deg, k) => {
            const x = FRAME.x + (k * FRAME.w) / (LONGITUDES.length - 1);
            return (
              <g key={deg}>
                <line x1={x} x2={x} y1={FRAME.y} y2={FRAME.y + FRAME.h} stroke="#9fc3d0" strokeOpacity=".09" />
                <line x1={x} x2={x} y1={FRAME.y} y2={FRAME.y + 7} stroke="#c89b50" />
                <line x1={x} x2={x} y1={FRAME.y + FRAME.h - 7} y2={FRAME.y + FRAME.h} stroke="#c89b50" />
                {/* The corner labels lean inward so they never meet the latitudes. */}
                <text x={x} y={FRAME.y - 10} textAnchor={k === 0 ? "start" : k === LONGITUDES.length - 1 ? "end" : "middle"}>{deg}° E</text>
                <text x={x} y={FRAME.y + FRAME.h + 22} textAnchor={k === 0 ? "start" : k === LONGITUDES.length - 1 ? "end" : "middle"}>{deg}° E</text>
              </g>
            );
          })}
          {LATITUDES.map((deg, k) => {
            const y = FRAME.y + (k * FRAME.h) / (LATITUDES.length - 1);
            return (
              <g key={deg}>
                <line x1={FRAME.x} x2={FRAME.x + FRAME.w} y1={y} y2={y} stroke="#9fc3d0" strokeOpacity=".09" />
                <line x1={FRAME.x} x2={FRAME.x + 7} y1={y} y2={y} stroke="#c89b50" />
                <line x1={FRAME.x + FRAME.w - 7} x2={FRAME.x + FRAME.w} y1={y} y2={y} stroke="#c89b50" />
                <text x={FRAME.x - 6} y={y + 4} textAnchor="end">{deg}°N</text>
              </g>
            );
          })}
          <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} fill="none" stroke="#c89b50" strokeOpacity=".7" />
          {/* Scale bar, bottom right. */}
          <g transform={`translate(${FRAME.x + FRAME.w - 170} ${FRAME.y + FRAME.h - 22})`}>
            <line x1="0" x2="150" y1="0" y2="0" stroke="#d8c08a" />
            {[0, 50, 100, 150].map(n => (
              <g key={n}>
                <line x1={n} x2={n} y1="-5" y2="0" stroke="#d8c08a" />
                <text x={n} y="-9" textAnchor="middle" fontSize="10">{n === 150 ? "150 NM" : n}</text>
              </g>
            ))}
          </g>
        </g>

        <g transform={`translate(${FRAME.x} ${FRAME.y}) scale(.92)`}>
          {/* Compass rose. */}
          <g transform="translate(500 316)" fill="none" stroke="#c9b58566" opacity=".85">
            <circle r="58" />
            <circle r="42" />
            <path d="M0-80L12-12 80 0 12 12 0 80-12 12-80 0-12-12z" fill="#c9b58522" stroke="#c9b58588" />
            <path d="M-44-44L44 44M44-44L-44 44" strokeDasharray="3 7" />
            <g fill="#d8c08a" stroke="none" fontSize="15" fontFamily="Georgia, serif" textAnchor="middle">
              <text y="-88">N</text>
              <text y="102">S</text>
              <text x="96" y="5">E</text>
              <text x="-96" y="5">W</text>
            </g>
          </g>

          {/* The route, and the wake already sailed from Troy. */}
          <path ref={path} d={ROUTE} fill="none" stroke="transparent" strokeWidth="1" />
          <path d={ROUTE} fill="none" stroke="url(#chart-route)" strokeWidth="11" opacity=".16" filter="url(#chart-glow)" />
          <path d={ROUTE} fill="none" stroke="#6fd6e6" strokeWidth="2.6" strokeDasharray="9 9" opacity=".75" className="fs-chart-route" />
          {/* pathLength normalises the curve to 100 units, so the dash pattern is
              simply "sailed, then the rest". */}
          <path
            d={ROUTE}
            fill="none"
            stroke="#ffe4a3"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity=".85"
            pathLength={100}
            strokeDasharray={`${sailed} 100`}
            className="fs-chart-wake"
          />

          {/* Islands: a painted medallion, its number on a pin, its name on a plaque. */}
          {trials.map((t, i) => {
            const [x, y] = ANCHORS[i];
            const open = unlocked(save, t.id);
            const done = save.records[t.id].cleared !== "pending";
            const isSelected = selected === t.id;
            const col = i % 4, row = Math.floor(i / 4);
            const name = shortNames[t.id], plaque = Math.round(name.length * 7.4 + 28);
            return (
              <g key={t.id} transform={`translate(${x} ${y})`} className={`fs-chart-island${isSelected ? " selected" : ""}${open ? "" : " locked"}`}>
                {isSelected && <circle r={R + 12} fill="#32d4f514" stroke="#6fd6e6" strokeWidth="2.5" className="fs-chart-ring" />}
                <g className="fs-medallion" filter={open ? undefined : "url(#fs-medal-grey)"} opacity={open ? 1 : 0.85}>
                  <circle r={R + 5} fill="#0b2033" stroke="#c89b50" strokeWidth="2" />
                  <g clipPath="url(#fs-medal-clip)">
                    <svg
                      x={-R}
                      y={-R}
                      width={2 * R}
                      height={2 * R}
                      viewBox={`${col * TILE_W + 6} ${row * TILE_H + (TILE_H - CROP) * 0.4} ${CROP} ${CROP}`}
                      preserveAspectRatio="xMidYMid slice"
                    >
                      <image href={FARSHORE_ATLAS} width={ATLAS} height={ATLAS} />
                    </svg>
                  </g>
                  <circle r={R} fill="none" stroke="#ffe4a3" strokeWidth="1.5" opacity=".8" />
                </g>
                <g transform={`translate(0 ${-R + 3})`} className="fs-chart-pin">
                  <path d="M0 0C-5-7-14-12-14-23a14 14 0 1 1 28 0C14-12 5-7 0 0Z" fill="#0b2033" stroke="#e9b85c" strokeWidth="1.6" />
                  <text y="-18" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ffe4a3" fontFamily="Georgia, serif">
                    {String(i + 1).padStart(2, "0")}
                  </text>
                </g>
                <g transform={`translate(0 ${R + 20})`}>
                  <rect x={-plaque / 2} y="-13" width={plaque} height="26" rx="5" fill="#0b2033ee" stroke="#c89b50" strokeWidth="1.4" />
                  <text y="5" textAnchor="middle" fontSize="15" fontFamily="Georgia, serif" fill={open ? "#f4e6c4" : "#8a9aa6"}>
                    {name}
                  </text>
                </g>
                {done && (
                  <g transform={`translate(${R * 0.74} ${-R * 0.62})`}>
                    <circle r="11" fill="#0b2033" stroke="#e9b85c" strokeWidth="1.5" />
                    <path d="M-4.5 0 L-1 3.5 L5 -3.5" fill="none" stroke="#ffe4a3" strokeWidth="2.2" strokeLinecap="round" />
                  </g>
                )}
                {!open && (
                  <g transform={`translate(${R * 0.74} ${-R * 0.62})`}>
                    <circle r="11" fill="#0b2033" stroke="#4a5b68" strokeWidth="1.5" />
                    <rect x="-4.5" y="-2" width="9" height="7.5" rx="1.5" fill="#9aabb8" />
                    <path d="M-2.7-2 v-2.4 a2.7 2.7 0 0 1 5.4 0 v2.4" fill="none" stroke="#9aabb8" strokeWidth="1.6" />
                  </g>
                )}
              </g>
            );
          })}

          {/* The ship. Its bob is a CSS transform, which would replace a transform
              attribute on the same element, so it sits on its own inner group. */}
          {shipAt && (
            <g transform={`translate(${shipAt.x} ${shipAt.y})`} aria-hidden="true">
              <g className="fs-chart-ship">
                <ellipse cy="10" rx="26" ry="7" fill="#0a1c2b" opacity=".6" />
                <g transform={`rotate(${shipAt.angle * 0.25})`}>
                  <path d="M-20 6 L20 6 L13 15 L-13 15Z" fill="#a9763f" />
                  <rect x="-1.5" y="-20" width="3" height="26" fill="#e3c792" />
                  <path d="M2-18 q16 6 12 18 H2Z" fill="#d7a95e" />
                  <path d="M2-18 q16 6 12 18 H2Z" fill="#9a4b3f" opacity=".45" />
                </g>
              </g>
            </g>
          )}

          {/* Hit targets last, so they sit above every decoration. */}
          {trials.map((t, i) => {
            const [x, y] = ANCHORS[i];
            const open = unlocked(save, t.id);
            const done = save.records[t.id].cleared !== "pending";
            return (
              <g
                key={`hit-${t.id}`}
                className="fs-chart-hit"
                role="button"
                tabIndex={0}
                aria-pressed={selected === t.id}
                aria-label={`${i + 1}. ${t.title}. ${done ? "Completed" : open ? "Unlocked" : "Locked"}`}
                onClick={() => onSelect(t.id)}
                onDoubleClick={() => open && onOpen(t.id)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(t.id);
                  }
                }}
                onMouseEnter={() => onHover(t.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(t.id)}
                onBlur={() => onHover(null)}
              >
                <circle cx={x} cy={y} r={R + 16} fill="transparent" />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
