// Where the eight islands sit on the 3D voyage chart, and the bridge that lets
// the WebGL world place the DOM labels (real, focusable buttons) over them.

import { trials, type TrialId } from "../arcade/arcade.ts";

/** Island centres on the sea plane (x, z) and the height of each label anchor. */
export const ISLANDS: Record<TrialId, { x: number; z: number; top: number; radius: number }> = {
  lotus: { x: -13.5, z: -1.6, top: 2.2, radius: 2.4 },
  cyclops: { x: -7.4, z: -7.6, top: 3.6, radius: 2.5 },
  aeolus: { x: -0.4, z: -5.4, top: 3.6, radius: 2.1 },
  circe: { x: 7.4, z: -7.8, top: 2.6, radius: 2.6 },
  sirens: { x: 13.6, z: -1.8, top: 2.6, radius: 2.3 },
  scylla: { x: 7.8, z: 4.2, top: 3.4, radius: 2.8 },
  calypso: { x: -0.2, z: 7.4, top: 2.4, radius: 2.4 },
  bow: { x: -9, z: 5.6, top: 2.8, radius: 2.6 },
};

/** The route, island to island in voyage order. */
export const ROUTE: TrialId[] = trials.map(t => t.id);

/** A flat fallback layout (percent of the frame) for the painted, no-WebGL map. */
export const FLAT_POSITION = (id: TrialId) => {
  const i = ISLANDS[id];
  return { left: 50 + (i.x / 34) * 100, top: 50 + (i.z / 22) * 100 };
};

/** DOM label elements registered by the chart overlay; the 3D world moves them every frame. */
export const mapLabels = new Map<TrialId, HTMLElement>();
