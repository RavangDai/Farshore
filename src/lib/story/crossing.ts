import type { TrialId } from "../arcade/arcade";

/**
 * The voyage crossing: the cinematic between one encounter and the next.
 *
 * The gods look down on the chart from Olympus, the camera dives to the island
 * Odysseus has just left, he walks to the shore and boards his ship, the ship
 * sails the route to the next island, and he walks up onto it. These are the
 * seconds at which each beat starts; the component interpolates between them.
 */
export type CrossingBeats = {
  /** The gods' view of the whole chart, through parting cloud. */
  overview: number;
  /** The camera descends to the island just left behind. */
  dive: number;
  /** Odysseus appears on that island in a column of light. */
  appear: number;
  /** He walks down to the shore. */
  walkOut: number;
  /** The ship comes alongside and he boards. */
  board: number;
  /** The ship sails the route. */
  sail: number;
  /** The ship reaches the far shore and he steps off. */
  land: number;
  /** He walks up onto the next island. */
  walkIn: number;
  /** The gods' light falls on the new island. */
  arrive: number;
  /** The encounter's title card. */
  card: number;
  /** The briefing opens. */
  end: number;
};

/** Sailing time grows with the islands passed, but never drags. */
export const sailingSeconds = (legs: number) => Math.min(5.6, 3 + Math.max(0, Math.abs(legs) - 1) * 0.85);

export function crossingBeats(legs: number): CrossingBeats {
  const overview = 0, dive = 1.5, appear = 2.3, walkOut = 2.9, board = 4.0, sail = 4.6;
  const land = sail + sailingSeconds(legs), walkIn = land + 0.45, arrive = walkIn + 1.1, card = arrive + 0.35, end = card + 2.4;
  return { overview, dive, appear, walkOut, board, sail, land, walkIn, arrive, card, end };
}

/**
 * What the bard says as the ship sets out. Each line looks ahead to the
 * destination only, because the next unfinished island can lie in either
 * direction along the route.
 */
export const crossingLines: Record<TrialId, string> = {
  lotus: "Ahead lies the land of the Lotus-Eaters, where one sweet taste makes a sailor forget his way home.",
  cyclops: "Ahead, smoke rises from a giant's cave. Polyphemus counts his sheep, and waits.",
  aeolus: "Ahead floats the island of Aeolus, keeper of the winds, and a bag that must stay sealed.",
  circe: "Ahead lies Aeaea, where the sorceress Circe is already brewing.",
  sirens: "Ahead, a sweet song drifts across the water. Stop your ears, and keep the oars moving.",
  scylla: "Ahead, the strait narrows between the cliffs. Scylla watches from above, and Charybdis turns below.",
  calypso: "Ahead, open sea and a fragile raft. Poseidon is gathering a storm.",
  bow: "Ahead, at last, the shores of Ithaca. In his own hall, the suitors wait with a bow.",
};

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
/** How far `t` has moved through the span from `from` to `to`, from 0 to 1. */
export const span = (t: number, from: number, to: number) => (to <= from ? (t >= to ? 1 : 0) : clamp01((t - from) / (to - from)));
/** Cubic ease in and out. */
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
