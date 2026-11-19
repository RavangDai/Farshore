// When the recorded voice lines may play. Narration is heard once (the intro
// once per device, each chapter and the homecoming once per voyage), never on
// a revisit. The Oracle's announcements and the characters' lines are tied to
// real game and model states by the caller; these rules only stop them
// crowding the player: cooldowns, and a lead change must hold before it is
// announced. Pure, so tests/audio-director.test.mjs checks every rule.

import { LINES, PLACES, type LineId } from "./library.ts";

export const HEARD_KEY = "farshore-narration-v1";

export type Heard = { device: LineId[]; voyage: LineId[] };

const CHAPTERS = new Set(Object.values(PLACES).map(p => p.narration).filter((n): n is LineId => !!n && n !== "intro"));

/** Where a line's "heard" mark lives: the intro once per device; chapters and the homecoming once per voyage; others never. */
export function onceScope(id: LineId): "device" | "voyage" | null {
  if (id === "intro") return "device";
  return CHAPTERS.has(id) || id === "homecoming" ? "voyage" : null;
}

const ids = (v: unknown): LineId[] => (Array.isArray(v) ? v.filter((x): x is LineId => typeof x === "string" && x in LINES) : []);

export function readHeard(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): Heard {
  try {
    const v = JSON.parse(storage?.getItem(HEARD_KEY) || "null");
    if (v && typeof v === "object") return { device: ids(v.device), voyage: ids(v.voyage) };
  } catch { /* Storage is optional. */ }
  return { device: [], voyage: [] };
}

export function writeHeard(heard: Heard, storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage) {
  try { storage?.setItem(HEARD_KEY, JSON.stringify(heard)); } catch { /* Storage is optional. */ }
}

export const hasHeard = (heard: Heard, id: LineId) => {
  const scope = onceScope(id);
  return scope === "device" ? heard.device.includes(id) : scope === "voyage" ? heard.voyage.includes(id) : false;
};

export function markHeard(heard: Heard, id: LineId): Heard {
  const scope = onceScope(id);
  if (!scope || hasHeard(heard, id)) return heard;
  return scope === "device" ? { ...heard, device: [...heard.device, id] } : { ...heard, voyage: [...heard.voyage, id] };
}

/** A new voyage hears its chapters again; the intro stays heard on this device. */
export const newVoyage = (heard: Heard): Heard => ({ device: heard.device, voyage: [] });

/** Seconds. */
export const COOLDOWN = {
  /** Between any two Oracle announcements. */
  oracle: 25,
  /** Before the same Oracle announcement again. */
  oracleSame: 90,
  /** Before the same character line again. */
  character: 20,
  /** Between two victory or defeat narrations. */
  outcome: 15,
};

/** Cooldowns and priorities for the recorded lines. */
export class VoiceRules {
  private last = new Map<LineId, number>();
  private lastOracle = -Infinity;

  allow(id: LineId, now: number): boolean {
    const kind = LINES[id].kind, since = now - (this.last.get(id) ?? -Infinity);
    if (kind === "oracle") return now - this.lastOracle >= COOLDOWN.oracle && since >= COOLDOWN.oracleSame;
    if (kind === "character") return since >= COOLDOWN.character;
    if (id === "victory" || id === "defeat") return now - Math.max(this.last.get("victory") ?? -Infinity, this.last.get("defeat") ?? -Infinity) >= COOLDOWN.outcome;
    return true;
  }

  record(id: LineId, now: number) {
    this.last.set(id, now);
    if (LINES[id].kind === "oracle") this.lastOracle = now;
  }
}

export type Lead = "player" | "rival" | "even";

/**
 * Announces a lead change only once it has held for `hold` seconds, not in the
 * opening `warmup` seconds of a round, and no more often than `gap` seconds.
 * A tie is never announced; it only resets who was last in front.
 */
export class LeadTracker {
  private announced: Lead = "even";
  private candidate: Lead = "even";
  private since = 0;
  private lastSaid = -Infinity;
  private start: number;
  private opts: { hold: number; warmup: number; gap: number };
  constructor(start: number, opts = { hold: 1.2, warmup: 3, gap: 15 }) {
    this.start = start;
    this.opts = opts;
  }

  update(lead: Lead, now: number): LineId | null {
    if (lead !== this.candidate) { this.candidate = lead; this.since = now; }
    if (lead === "even" || lead === this.announced) return null;
    if (now - this.since < this.opts.hold || now - this.start < this.opts.warmup || now - this.lastSaid < this.opts.gap) return null;
    this.announced = lead;
    this.lastSaid = now;
    return lead === "player" ? "oracle-player-lead" : "oracle-rival-lead";
  }
}
