// The interactive voyage chart: the asset pack's painted map, its checkpoint
// anchors (map/map-layout.json, % of the un-cropped 1672 x 941 image) and the
// marker state each trial shows, from the player's real progress.

import { trials, type ArcadeSave, type TrialId } from "../arcade/arcade.ts";

const ROOT = "/art/cinematic";

export const MAP_ART = {
  src: `${ROOT}/map/voyage-map.webp`,
  original: `${ROOT}/map/voyage-map.png`,
  route: `${ROOT}/map/route.svg`,
  width: 1672,
  height: 941,
} as const;

export type MarkerState = "available" | "current" | "completed" | "locked";

export const MARKER_ART: Record<MarkerState, string> = {
  available: `${ROOT}/markers/available.svg`,
  current: `${ROOT}/markers/current.svg`,
  completed: `${ROOT}/markers/completed.svg`,
  locked: `${ROOT}/markers/locked.svg`,
};

/** Checkpoint anchors from map-layout.json (tests/map-layout.test.mjs keeps them in step). */
export const CHECKPOINTS: Record<TrialId, { id: string; number: string; x: number; y: number }> = {
  lotus: { id: "lotus-eaters", number: "01", x: 11.7, y: 35.5 },
  cyclops: { id: "cyclops-cave", number: "02", x: 25.5, y: 26.8 },
  aeolus: { id: "aeolus", number: "03", x: 44.6, y: 35.0 },
  circe: { id: "circes-palace", number: "04", x: 63.7, y: 28.8 },
  sirens: { id: "sirens-passage", number: "05", x: 79.7, y: 40.0 },
  scylla: { id: "scylla-charybdis", number: "06", x: 64.0, y: 62.9 },
  calypso: { id: "calypsos-raft", number: "07", x: 38.1, y: 72.2 },
  bow: { id: "ithaca", number: "08", x: 17.7, y: 65.9 },
};

/** The route, island to island in voyage order. */
export const ROUTE: TrialId[] = trials.map(t => t.id);

/**
 * Each marker's state from the save: cleared or assisted trials are completed,
 * the first unfinished trial is the current one, and the rest are available.
 * A trial is locked only when `canEnter` says so; the voyage currently lets
 * every trial be entered in any order, so by default nothing is locked.
 */
export function markerStates(save: ArcadeSave, canEnter: (id: TrialId) => boolean = () => true): Record<TrialId, MarkerState> {
  const next = ROUTE.find(id => save.records[id].cleared === "pending") ?? null;
  const states = {} as Record<TrialId, MarkerState>;
  for (const id of ROUTE) {
    states[id] = save.records[id].cleared !== "pending" ? "completed" : !canEnter(id) ? "locked" : id === next ? "current" : "available";
  }
  return states;
}

/** The spoken state for a marker's accessible name. */
export function markerStateLabel(state: MarkerState, record: ArcadeSave["records"][TrialId]): string {
  if (state === "completed") return record.cleared === "assisted" ? "assisted" : "cleared";
  return state === "current" ? "next on your voyage" : state === "locked" ? "locked" : "open";
}
