"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Brain, Compass, LockKeyhole, Ship, Trophy } from "lucide-react";
import {
  clearedCount,
  difficultyNames,
  trials,
  unlocked,
  type ArcadeSave,
  type Difficulty,
  type TrialId,
} from "../lib/arcade";
import { fieldNotes } from "../lib/field-notes";
import { TrialArtwork } from "./farshore-art";

/**
 * The voyage chart.
 *
 * Eight illustrated islands on a living sea. Each island is drawn as its own
 * landmark rather than as a generic blob, so the chart reads as a journey
 * between recognisable places: the lotus garden, the cave mouth, the wind
 * peaks, Circe's towers, the singing rocks, the strait, the storm, and the
 * palace at the end.
 *
 * Everything animated here is decorative. With reduced motion the waves, the
 * weather and the route glow all hold still, and the chart stays fully usable.
 */

type Props = {
  save: ArcadeSave;
  selected: TrialId;
  difficulty: Difficulty;
  still: boolean;
  onSelect: (id: TrialId) => void;
  onOpen: (id: TrialId) => void;
  onDifficulty: (d: Difficulty) => void;
  onBegin: () => void;
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

type Weather = "calm" | "mist" | "storm" | "wind" | "glow";

const ISLANDS: Record<TrialId, { label: string; weather: Weather; tint: string; accent: string }> = {
  lotus: { label: "The lotus shore", weather: "mist", tint: "#4d7a52", accent: "#e59fc9" },
  cyclops: { label: "The cave of Polyphemus", weather: "calm", tint: "#5a4f52", accent: "#ff9a3c" },
  aeolus: { label: "Aeolia of the winds", weather: "wind", tint: "#53697e", accent: "#9fe0f5" },
  circe: { label: "Aeaea", weather: "glow", tint: "#5d4a79", accent: "#c79bf5" },
  sirens: { label: "The singing rocks", weather: "mist", tint: "#47566b", accent: "#d9a7f0" },
  scylla: { label: "The strait of two terrors", weather: "storm", tint: "#3d5566", accent: "#5fd3e8" },
  calypso: { label: "The storm beyond Ogygia", weather: "storm", tint: "#4a4f63", accent: "#8fb7e8" },
  bow: { label: "The palace of Ithaca", weather: "calm", tint: "#7a6338", accent: "#ffd98a" },
};

/** One island's silhouette, drawn to its own landmark. */
function Island({ id, open, cleared }: { id: TrialId; open: boolean; cleared: boolean }) {
  const { tint, accent } = ISLANDS[id];
  const rock = open ? tint : "#2c3a46";
  const lit = open ? accent : "#4a5b68";
  const common = (
    <>
      <ellipse cx="0" cy="26" rx="62" ry="15" fill="#06131f" opacity=".5" />
      <path d="M-58 26 L-44 2 L-20 -8 L8 -14 L34 -4 L54 10 L60 26Z" fill={rock} />
      <path d="M-58 26 L-44 2 L-20 -8 L-4 -2 L-14 26Z" fill="#00000033" />
    </>
  );
  if (id === "lotus")
    return (
      <g>
        {common}
        <path d="M-34 2 q10-20 22-14 q4-16 18-12 q14-4 16 12 q14 0 10 16Z" fill="#3f6b45" />
        {[-20, 0, 20].map(x => (
          <g key={x} transform={`translate(${x} -12)`}>
            <circle r="5" fill={lit} />
            <circle r="2" fill="#fff0bd" />
          </g>
        ))}
      </g>
    );
  if (id === "cyclops")
    return (
      <g>
        {common}
        <path d="M-46 26 L-26 -34 L0 -52 L26 -34 L46 26Z" fill="#413a3f" />
        <path d="M-16 26 q0-26 16-26 q16 0 16 26Z" fill="#0a0810" />
        <circle cx="0" cy="12" r="5" fill={lit} opacity={open ? 1 : 0.35} />
      </g>
    );
  if (id === "aeolus")
    return (
      <g>
        {common}
        <path d="M-44 26 L-18 -40 L2 -16 L22 -48 L46 26Z" fill="#4b5e70" />
        <path d="M-18 -40 L-8 -24 L-26 -16Z" fill="#cfe4ef" />
        <path d="M22 -48 L34 -26 L12 -20Z" fill="#cfe4ef" />
      </g>
    );
  if (id === "circe")
    return (
      <g>
        {common}
        <rect x="-30" y="-44" width="18" height="70" fill="#584577" />
        <rect x="12" y="-52" width="18" height="78" fill="#584577" />
        <rect x="-10" y="-26" width="22" height="52" fill="#6b5490" />
        <path d="M-30-44 l9-16 l9 16Z M12-52 l9-16 l9 16Z" fill={lit} />
        <circle cx="-21" cy="-18" r="3" fill={lit} />
        <circle cx="21" cy="-26" r="3" fill={lit} />
      </g>
    );
  if (id === "sirens")
    return (
      <g>
        {common}
        <path d="M-42 26 L-24 -36 L-10 -2 L4 -46 L20 -6 L34 -28 L46 26Z" fill="#3f4d60" />
        <path d="M4-46 L10-28 L-2-26Z" fill={lit} opacity=".85" />
      </g>
    );
  if (id === "scylla")
    return (
      <g>
        {common}
        <path d="M-56 26 L-44 -30 L-26 6 L-18 26Z" fill="#36495a" />
        <path d="M56 26 L44 -30 L26 6 L18 26Z" fill="#36495a" />
        <g opacity={open ? 0.95 : 0.4}>
          <path d="M-4 24 a 18 10 0 1 0 8 0" fill="none" stroke={lit} strokeWidth="3" />
          <path d="M-10 20 a 26 14 0 1 0 20 -2" fill="none" stroke={lit} strokeWidth="2" opacity=".6" />
        </g>
      </g>
    );
  if (id === "calypso")
    return (
      <g>
        {common}
        <path d="M-40 26 L-20 -16 L4 -30 L28 -12 L44 26Z" fill="#474c5e" />
        <path d="M-26 20 l16-30 l4 8 l10-14" fill="none" stroke="#8a7050" strokeWidth="4" />
        <path d="M6-34 l8 16 l-14 2Z" fill={lit} opacity={open ? 0.95 : 0.4} />
      </g>
    );
  return (
    <g>
      {common}
      <rect x="-34" y="-30" width="68" height="56" fill="#6d5833" />
      <path d="M-40-30 L0-56 L40-30Z" fill="#8a6d3c" />
      {[-22, -8, 6, 20].map(x => (
        <rect key={x} x={x} y="-22" width="8" height="48" fill="#4d3e24" />
      ))}
      <circle cx="0" cy="-40" r="5" fill={cleared ? "#ffe9a8" : lit} />
    </g>
  );
}

export function VoyageChart({ save, selected, difficulty, still, onSelect, onOpen, onDifficulty, onBegin }: Props) {
  const index = trials.findIndex(t => t.id === selected);
  const trial = trials[index];
  const record = save.records[selected];
  const canPlay = unlocked(save, selected);
  const best = record.bests[difficulty];
  const note = fieldNotes[selected];
  const cleared = clearedCount(save);
  const [hovered, setHovered] = useState<TrialId | null>(null);
  const path = useRef<SVGPathElement>(null);
  const [shipAt, setShipAt] = useState<{ x: number; y: number; angle: number } | null>(null);

  // The ship rides the real route path, so it always sits exactly on the line
  // however the curve is later adjusted.
  const furthest = Math.min(trials.length - 1, cleared);
  const sailed = (furthest / (trials.length - 1)) * 100;
  useEffect(() => {
    const node = path.current;
    if (!node) return;
    const total = node.getTotalLength();
    const t = trials.length > 1 ? furthest / (trials.length - 1) : 0;
    const at = node.getPointAtLength(total * t);
    const ahead = node.getPointAtLength(Math.min(total, total * t + 6));
    setShipAt({ x: at.x, y: at.y, angle: (Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180) / Math.PI });
  }, [furthest]);

  const preview = hovered ?? selected;
  const previewTrial = trials.find(t => t.id === preview)!;

  return (
    <div className={`fs-chart-layout${still ? " fs-chart-still" : ""}`}>
      <div className="fs-chart-frame">
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
            <filter id="chart-soft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" />
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

          {/* The sailed route, and the glow that travels along it. */}
          <path ref={path} d={ROUTE} fill="none" stroke="transparent" strokeWidth="1" />
          <path d={ROUTE} fill="none" stroke="url(#chart-route)" strokeWidth="11" opacity=".16" filter="url(#chart-glow)" />
          <path
            d={ROUTE}
            fill="none"
            stroke="#8fd3e0"
            strokeWidth="2"
            strokeDasharray="7 11"
            opacity=".6"
            className="fs-chart-route"
          />
          {/* The sailed portion, lit from Troy up to the voyage's progress.
              pathLength normalises the curve to 100 units so the dash pattern
              is simply "sailed, then the rest". */}
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

          {/* Compass rose. */}
          <g transform="translate(500 316)" fill="none" stroke="#9eae9544" opacity=".8">
            <circle r="58" />
            <circle r="42" />
            <path d="M0-80L12-12 80 0 12 12 0 80-12 12-80 0-12-12z" fill="#9eae9522" stroke="#9eae9566" />
            <path d="M-44-44L44 44M44-44L-44 44" strokeDasharray="3 7" />
          </g>
          <text x="500" y="228" textAnchor="middle" fill="#9fb3bd" fontSize="10" letterSpacing="7" opacity=".75">
            THE WINE-DARK SEA
          </text>

          {/* Islands. */}
          {trials.map((t, i) => {
            const [x, y] = ANCHORS[i];
            const open = unlocked(save, t.id);
            const done = save.records[t.id].cleared !== "pending";
            const isSelected = selected === t.id;
            const weather = ISLANDS[t.id].weather;
            return (
              <g key={t.id} transform={`translate(${x} ${y})`} className={`fs-chart-island${isSelected ? " selected" : ""}`}>
                {/* Weather, drawn over the island it belongs to. */}
                {open && weather === "mist" && (
                  <g className="fs-weather-mist" opacity=".4">
                    <ellipse cx="-10" cy="-6" rx="54" ry="16" fill="#e6a9d8" filter="url(#chart-soft)" />
                    <ellipse cx="16" cy="4" rx="40" ry="12" fill="#c58fd8" filter="url(#chart-soft)" />
                  </g>
                )}
                {open && weather === "wind" && (
                  <g className="fs-weather-wind" stroke="#aee4f5" strokeWidth="2" fill="none" opacity=".55">
                    <path d="M-62-30 q22-10 44 0 t38-4" />
                    <path d="M-54-14 q26-12 50 2 t34-6" />
                  </g>
                )}
                {open && weather === "storm" && (
                  <g className="fs-weather-storm">
                    <ellipse cx="0" cy="-44" rx="52" ry="17" fill="#2b3647" opacity=".9" />
                    <ellipse cx="-22" cy="-50" rx="30" ry="14" fill="#36435a" opacity=".9" />
                    <path className="fs-bolt" d="M4-38 l-12 22 h10 l-6 18 18-26h-10z" fill="#ffe9a8" />
                  </g>
                )}
                {open && weather === "glow" && (
                  <circle className="fs-weather-glow" r="56" fill="#a86ff0" opacity=".2" filter="url(#chart-glow)" />
                )}

                <Island id={t.id} open={open} cleared={done} />

                {isSelected && <circle r="74" fill="none" stroke="#ffe4a3" strokeWidth="2" opacity=".8" className="fs-chart-ring" />}
                {done && (
                  <g transform="translate(44 -34)">
                    <circle r="13" fill="#0b2033" stroke="#e9b85c" strokeWidth="1.5" />
                    <path d="M-5 0 L-1 4 L6 -4" fill="none" stroke="#ffe4a3" strokeWidth="2.4" strokeLinecap="round" />
                  </g>
                )}
                {!open && (
                  <g transform="translate(0 -44)" opacity=".85">
                    <circle r="14" fill="#0b2033" stroke="#4a5b68" strokeWidth="1.5" />
                    <rect x="-5" y="-3" width="10" height="9" rx="1.6" fill="#7d8f9d" />
                    <path d="M-3-3 v-3 a3 3 0 0 1 6 0 v3" fill="none" stroke="#7d8f9d" strokeWidth="1.8" />
                  </g>
                )}
                <text y="56" textAnchor="middle" fill={open ? "#f0e2c0" : "#6a7b88"} fontSize="13" fontFamily="Georgia, serif">
                  {t.title}
                </text>
                <text y="72" textAnchor="middle" fill="#7f97a8" fontSize="9" letterSpacing="2">
                  {String(i + 1).padStart(2, "0")} · {t.kind.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* The ship, riding the route at the voyage's current progress. */}
          {shipAt && (
            <g transform={`translate(${shipAt.x} ${shipAt.y})`} className="fs-chart-ship" aria-hidden="true">
              <ellipse cy="10" rx="26" ry="7" fill="#0a1c2b" opacity=".6" />
              <g transform={`rotate(${shipAt.angle * 0.25})`}>
                <path d="M-20 6 L20 6 L13 15 L-13 15Z" fill="#a9763f" />
                <rect x="-1.5" y="-20" width="3" height="26" fill="#e3c792" />
                <path d="M2-18 q16 6 12 18 H2Z" fill="#d7a95e" />
                <path d="M2-18 q16 6 12 18 H2Z" fill="#9a4b3f" opacity=".45" />
              </g>
            </g>
          )}

          <text x="34" y="40" fill="#9fb3bd" fontSize="11" letterSpacing="4">
            TROY
          </text>
          <text x="966" y="596" textAnchor="end" fill="#7f97a8" fontSize="9" letterSpacing="2">
            A MYTHICAL COURSE · NOT A SAILING CHART
          </text>

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
                onMouseEnter={() => setHovered(t.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(t.id)}
                onBlur={() => setHovered(null)}
              >
                <circle cx={x} cy={y} r="68" fill="transparent" />
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="fs-chart-preview" aria-live="polite">
        <span className="fs-chart-ribbon">
          TRIAL {String(trials.findIndex(t => t.id === preview) + 1).padStart(2, "0")} / 08
        </span>
        <div className="fs-chart-art">
          <TrialArtwork id={preview} />
          <span>{ISLANDS[preview].label}</span>
        </div>
        <h2>{previewTrial.title}</h2>
        <p className="fs-chart-genre">
          <Compass size={13} /> {previewTrial.kind} · {previewTrial.character}
        </p>
        <p className="fs-chart-objective">{previewTrial.objective}</p>
        <div className="fs-chart-ai">
          <Brain size={13} />
          <div>
            <span>AI TECHNIQUE (HARD)</span>
            <p>{previewTrial.adaptive}</p>
          </div>
        </div>
        <div className="fs-chart-keys">
          {fieldNotes[preview].keys.map(k => (
            <kbd key={k}>{k}</kbd>
          ))}
        </div>
        {preview === selected && (
          <>
            <fieldset className="fs-difficulty">
              <legend>DIFFICULTY</legend>
              <div>
                {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                  <button key={d} aria-pressed={difficulty === d} onClick={() => onDifficulty(d)}>
                    {difficultyNames[d]}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="fs-chart-record">
              <span>
                BEST SCORE<strong>{best?.score.toLocaleString() ?? "—"}</strong>
              </span>
              <span>
                <Trophy size={13} />
                <strong className={best?.medal}>{best?.medal ?? "No medal yet"}</strong>
              </span>
            </div>
            {save.started ? (
              <button className="a-btn a-primary fs-chart-start" disabled={!canPlay} onClick={() => onOpen(selected)}>
                {canPlay ? (record.cleared === "pending" ? "Approach island" : "Revisit encounter") : "Island locked"}
                {canPlay ? <ArrowRight size={16} /> : <LockKeyhole size={15} />}
              </button>
            ) : (
              <button className="a-btn a-primary fs-chart-start" onClick={onBegin}>
                Begin the voyage <ArrowRight size={16} />
              </button>
            )}
            <p className="fs-chart-note">
              {canPlay ? `${note.bonus}.` : "Complete the earlier islands to sail here."}
            </p>
          </>
        )}
        <p className="fs-chart-progress">
          <Ship size={13} /> {String(cleared).padStart(2, "0")} of 08 islands behind you
        </p>
      </aside>
    </div>
  );
}
