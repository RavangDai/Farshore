"use client";
import { Anchor, BrainCircuit, Feather, Flame, Heart, Music, Shield, Ship, Sparkles, Target, Timer, Wind } from "lucide-react";
import type { ReactNode } from "react";
import type { TrialId } from "../../lib/arcade/arcade";
import { isAdventure, isCave, type GameState } from "../../lib/arcade/arcade-runtime";
import type { CommentaryLine } from "../../lib/arcade/commentary";
import { voices } from "../../lib/arcade/rivals";
import { CharacterPortrait } from "../farshore-art";
import { FieldNotes } from "../ai/encounter-intel";

type Track = { icon: ReactNode; label: string; value: string; fill?: number; pips?: [number, number]; warn?: boolean };

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);
const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Live objective rows read straight from the engine state of each encounter. */
export function trackersFor(s: GameState): Track[] {
  const lives = (hits: number): Track => ({ icon: <Heart size={13} />, label: "Hull", value: `${Math.max(0, 3 - hits)} / 3`, pips: [Math.max(0, 3 - hits), 3], warn: hits >= 2 });
  if (isCave(s)) return [
    { icon: <Target size={13} />, label: "To daylight", value: `${Math.round((s.elapsed / s.duration) * 100)}%`, fill: s.elapsed / s.duration },
    { icon: <Flame size={13} />, label: "Chase gap", value: `${Math.round(s.cyclops.gap)} m`, fill: Math.min(1, s.cyclops.gap / 70), warn: s.cyclops.gap < 26 },
    { icon: <Sparkles size={13} />, label: "Precise escapes", value: String(s.precision) },
    lives(s.hits),
  ];
  if (isAdventure(s)) {
    if (s.id === "lotus") return [
      { icon: <Ship size={13} />, label: "Crew aboard", value: `${s.rescued} / 3`, pips: [s.rescued, 3] },
      { icon: <Sparkles size={13} />, label: "Laurel relics", value: `${s.relicsFound} / 3`, pips: [s.relicsFound, 3] },
      { icon: <Shield size={13} />, label: "Moly ward", value: s.protection > 0 ? `${Math.ceil(s.protection / 1000)}s` : "None", fill: s.protection > 0 ? Math.min(1, s.protection / 14000) : 0 },
      { icon: <Anchor size={13} />, label: "Leading", value: s.carrying ? "A sailor" : "No one" },
      lives(s.hits),
    ];
    if (s.id === "aeolus") return [
      { icon: <Wind size={13} />, label: "Gates sailed", value: String(s.wave) },
      { icon: <Sparkles size={13} />, label: "Blessings", value: String(s.blessings) },
      { icon: <Target size={13} />, label: "Perfect passages", value: String(s.perfectPasses) },
      lives(s.hits),
    ];
    if (s.id === "calypso") return [
      { icon: <Anchor size={13} />, label: "Safe shores", value: `${s.progress} / ${s.practice ? 1 : 5}`, pips: [s.progress, s.practice ? 1 : 5] },
      { icon: <Feather size={13} />, label: "Driftwood", value: `${s.wood} / 3`, pips: [Math.min(3, s.wood), 3] },
      { icon: <Flame size={13} />, label: "Storm", value: s.lightning ? "Lightning marked" : "Gathering", warn: !!s.lightning },
      lives(s.hits),
    ];
    return [{ icon: <Target size={13} />, label: "Escapes", value: String(s.successes) }, lives(s.hits)];
  }
  if (s.id === "circe") return [
    { icon: <Sparkles size={13} />, label: "Chain reactions", value: String(s.chains) },
    { icon: <Flame size={13} />, label: "Curses banked", value: String(s.bank), warn: s.bank > 2 },
    { icon: <BrainCircuit size={13} />, label: "Circe's brew", value: s.rivalScore.toLocaleString() },
  ];
  if (s.id === "sirens") return [
    { icon: <Music size={13} />, label: "Melody", value: `${Math.min(5, s.round)} / 5`, pips: [Math.min(5, s.round - 1), 5] },
    { icon: <Flame size={13} />, label: "Temptation", value: `${Math.round(s.temptation)}%`, fill: s.temptation / 100, warn: s.temptation > 60 },
    { icon: <Target size={13} />, label: "Notes echoed", value: String(s.successes) },
  ];
  if (s.id === "scylla") return [
    { icon: <Ship size={13} />, label: "From the vortex", value: `${Math.round(s.boat)}`, fill: s.boat / 85, warn: s.boat < 25 },
    { icon: <Shield size={13} />, label: "Deflections", value: String(s.successes) },
    { icon: <Timer size={13} />, label: "Strait clears in", value: clock(s.duration - s.elapsed) },
    { icon: <Heart size={13} />, label: "Hits taken", value: String(s.hits), warn: s.hits >= 2 },
  ];
  if (s.id === "bow") return [
    { icon: <Target size={13} />, label: "Shot", value: `${Math.min(5, s.shots.length + (s.phase === "player" ? 1 : 0))} / 5`, pips: [s.shots.length, 5] },
    { icon: <Sparkles size={13} />, label: "Your rings", value: String(sum(s.shots)) },
    { icon: <BrainCircuit size={13} />, label: "Antinous", value: String(sum(s.rivalShots)), warn: sum(s.rivalShots) > sum(s.shots) },
    { icon: <Wind size={13} />, label: "Wind", value: s.wind === 0 ? "Calm" : `${Math.abs(s.wind)} ${s.wind > 0 ? "east" : "west"}` },
  ];
  return [
    { icon: <Target size={13} />, label: "Turn", value: String(s.turn) },
    { icon: <Shield size={13} />, label: "Cover", value: s.hidden ? "Beneath a sheep" : "Exposed", warn: !s.hidden },
    { icon: <Heart size={13} />, label: "Hits taken", value: String(s.hits) },
  ];
}

export function speakerName(line: Pick<CommentaryLine, "speaker">, id: TrialId) {
  return line.speaker === "bard" ? voices.bard.name : voices[id].name;
}

/**
 * The encounter's companion column: what you are trying to do and how it is
 * going, who you are up against and what they are planning, and the live
 * commentary as a running log.
 */
export function EncounterCodex({
  state,
  character,
  portrait,
  strategy,
  objective,
  log,
  note,
  feedback,
}: {
  state: GameState;
  character: string;
  portrait: number;
  strategy: string;
  objective: string;
  log: CommentaryLine[];
  note: string;
  /** The engine's latest feedback line ("Guardian spotted you"). */
  feedback?: string;
}) {
  const rows = trackersFor(state);
  return (
    <>
      <section className="fs-codex-card fs-codex-objective" aria-label="Objective">
        <h3><Target size={13} /> Objective</h3>
        <p>{objective}</p>
        {feedback && <p className="fs-codex-now">{feedback}</p>}
        <ul className="fs-codex-tracks">
          {rows.map(row => (
            <li key={row.label} data-warn={row.warn || undefined}>
              <span className="fs-codex-label">{row.icon}{row.label}</span>
              <strong>{row.value}</strong>
              {row.pips ? (
                <span className="fs-codex-pips" aria-hidden="true">
                  {Array.from({ length: row.pips[1] }, (_, i) => <i key={i} data-on={i < row.pips![0] || undefined} />)}
                </span>
              ) : row.fill !== undefined ? (
                <span className="fs-codex-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, row.fill))})` }} /></span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="fs-codex-card fs-codex-rival" aria-label="Your rival">
        <div className="fs-codex-rival-head">
          <CharacterPortrait tile={portrait} label={character} />
          <div>
            <h3>{character}</h3>
            <span className="fs-codex-plan"><BrainCircuit size={12} /> {strategy}</span>
          </div>
        </div>
        <p aria-live="polite">{state.rivalLine}</p>
      </section>
      <section className="fs-codex-card fs-codex-log" aria-label="Live commentary">
        <h3><Feather size={13} /> Live from the voyage</h3>
        {log.length === 0 ? (
          <p className="fs-codex-empty">The bard is watching. Lines appear here as the encounter unfolds.</p>
        ) : (
          <ol>
            {log.slice(-4).reverse().map((line, i) => (
              <li key={line.id} data-speaker={line.speaker} data-latest={i === 0 || undefined}>
                <span>{speakerName(line, state.id as TrialId)}</span>
                <p>{line.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <FieldNotes id={state.id} />
      <p className="fs-codex-note">{note}</p>
    </>
  );
}

/** Broadcast-style subtitle for the newest line, over the action. */
export function CommentarySubtitle({ line, id }: { line: CommentaryLine | null; id: TrialId }) {
  if (!line) return null;
  return (
    <div className="fs-subtitle" key={line.id} data-speaker={line.speaker} role="status" aria-live="polite">
      <span>{speakerName(line, id)}</span>
      <p>{line.text}</p>
    </div>
  );
}
