import type { CSSProperties } from "react";
import type { TrialId } from "../lib/arcade/arcade";
import { ART } from "../lib/art";
import { ENVIRONMENTS, envCard } from "../lib/cinema/art";

/** The painted 4 x 3 atlas: eight trial scenes, then four portraits (Odysseus, Circe, a Siren, the Cyclops). */
export const FARSHORE_ATLAS = ART.hd.trials;

export function FarshoreLogo({ compact = false }: { compact?: boolean }) {
  return <span className={`fs-logo${compact ? " fs-logo-compact" : ""}`} aria-label="FARSHORE"><span className="fs-logo-text" aria-hidden="true">FARSHORE</span><svg className="fs-logo-trident" viewBox="0 0 28 67" aria-hidden="true"><path d="M14 2 9 14h3v15H6V17H3L1 30l6 5h5v28h4V35h5l6-5-2-13h-3v12h-6V14h3z" fill="currentColor"/><path d="M14 5v54M4 22v7l3 3h14l3-3v-7" fill="none" stroke="#ffedab" strokeWidth="1"/></svg></span>;
}

export function Torch({ side = "left" }: { side?: "left" | "right" }) {
  return <span className={`fs-torch fs-torch-${side}`} aria-hidden="true"><span className="fs-torch-halo"/><svg viewBox="0 0 70 155"><defs><linearGradient id={`fire-${side}`} x2="0" y2="1"><stop stopColor="#fff5ad"/><stop offset=".5" stopColor="#ffc34b"/><stop offset="1" stopColor="#ed5f1c"/></linearGradient><linearGradient id={`bronze-${side}`}><stop stopColor="#51351f"/><stop offset=".45" stopColor="#c39756"/><stop offset="1" stopColor="#543821"/></linearGradient></defs><path className="fs-flame" d="M17 73C0 48 29 42 24 16c20 16 12 29 17 37 12-9 7-22 11-26 19 27 19 39 3 49Z" fill={`url(#fire-${side})`}/><path className="fs-flame-core" d="M28 75c-11-13 6-18 5-34 12 12 10 20 15 27l-6 9z" fill="#fff4b1"/><path d="M8 77h54l-6 12-16 10v30h11v9H19v-9h11V99L14 89z" fill={`url(#bronze-${side})`} stroke="#e6b85e" strokeWidth="1.3"/><path d="M8 77h54M15 86h40M29 102h13M29 126h13" fill="none" stroke="#f4d590" strokeWidth="2"/></svg></span>;
}

/**
 * A trial's chapter art: its painting from the cinematic asset pack, cropped
 * (never stretched) towards the focal subject, whatever the box's shape.
 */
export function TrialArtwork({ id, className = "" }: { id: TrialId; className?: string }) {
  const position = `${ENVIRONMENTS[id].card}% 50%`;
  return <span className={`fs-trial-art ${className}`} style={{ backgroundImage: `url('${envCard(id)}')`, backgroundSize: "cover", backgroundPosition: position, "--fs-art-position": position } as CSSProperties} aria-hidden="true"/>;
}

/**
 * Legacy portrait numbers that have a painted face or scene in the atlas
 * (the same mapping scripts/pixelate-art.mjs used): portrait -> atlas tile.
 */
const PAINTED: Record<number, number> = { 0: 8, 5: 11, 6: 0, 7: 9, 9: 2, 11: 10, 12: 5, 13: 6 };

/**
 * A character portrait: the painted face where the atlas has one, otherwise a
 * bronze medallion with the character's initial. Never pixel art.
 */
export function CharacterPortrait({ tile = 0, label = "Odysseus", large = false }: { tile?: number; label?: string; large?: boolean }) {
  const atlas = PAINTED[tile];
  if (atlas === undefined) return <span role="img" aria-label={label} className={`a-portrait fs-portrait cn-medallion${large ? " large" : ""}`}>{label.replace(/^The /, "").charAt(0)}</span>;
  const [x, y] = [(atlas % 4) * 100 / 3, Math.floor(atlas / 4) * 50];
  return <span role="img" aria-label={label} className={`a-portrait fs-portrait${large ? " large" : ""}`} style={{ backgroundImage: `url('${ART.hd.trials}')`, backgroundSize: "400% 300%", backgroundPosition: `${x}% ${y}%` }}/>;
}
