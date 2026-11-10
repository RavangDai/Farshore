// Polyphemus' section plans for the cave.
//
// The cave has three sections: the narrow passage, the collapsing hall and the
// run to daylight. The briefing plan sets the first; before each of the others
// the game lays out the doctrines the difficulty allows, each described by what
// the player model has actually measured, and a pretrained model picks one.
// The doctrine only changes how throws are scored and which hazard type the
// spawner leans toward: every throw still passes the escape-lane vetoes, every
// wave still passes `patternIsFair`, and the tier keeps its own warning times.

import { openMenu, type DecisionMenu, type DecisionOption, type Facts } from "../arcade/decisions.ts";
import { DOCTRINE_LABELS, cavePolicy, doctrinesFor, laneName, type CaveDoctrine, type CaveZone } from "./cyclops.ts";
import { favouriteOption, meanReaction, occupancyPrior, predictAfter, weakestOption, weaknessOf, type PlayerModel } from "./player-model.ts";
import { pct, type Difficulty } from "./types.ts";

/** How a hazard is answered: jumped, slid under, or dodged by changing lane. */
export type HazardKind = "jump" | "slide" | "lane";
export type HazardRecord = Record<HazardKind, { met: number; failed: number }>;
export const newHazardRecord = (): HazardRecord => ({ jump: { met: 0, failed: 0 }, slide: { met: 0, failed: 0 }, lane: { met: 0, failed: 0 } });
export const HAZARD_WORDS: Record<HazardKind, string> = { jump: "jumps", slide: "slides", lane: "lane dodges" };

/** The hazard type the player fails most, once it has been met twice and failed once. */
export function weakestHazard(record: HazardRecord): HazardKind | null {
  let best: HazardKind | null = null, worst = 0;
  for (const kind of ["jump", "slide", "lane"] as HazardKind[]) {
    const { met, failed } = record[kind];
    if (met < 2 || failed < 1) continue;
    const rate = failed / met;
    if (rate > worst) { worst = rate; best = kind; }
  }
  return best;
}

export const ZONE_NAMES: Record<CaveZone, string> = { cave: "the narrow passage", collapse: "the collapsing hall", daylight: "the run to daylight" };
/** Where each section starts and ends, as a share of the run. Mirrors `zoneFor`. */
export const ZONE_SPAN: Record<CaveZone, [number, number]> = { cave: [0, 0.4], collapse: [0.4, 0.78], daylight: [0.78, 1] };
export const NEXT_ZONE: Record<CaveZone, CaveZone | null> = { cave: "collapse", collapse: "daylight", daylight: null };
/** How far through a section the next one is planned, so the model has the rest of it to answer. */
export const PLAN_AT = 0.7;

export type CaveSectionView = {
  difficulty: Difficulty;
  /** The section being planned. */
  zone: CaveZone;
  lane: number;
  gap: number;
  hits: number;
  sheep: number;
  hazards: HazardRecord;
  /** The doctrine in force now, which the model may keep. */
  current: CaveDoctrine;
};

export function sectionMenu(view: CaveSectionView, model: PlayerModel, id: string, openedAt: number): DecisionMenu {
  const policy = cavePolicy(view.difficulty, true, "cutoff");
  const forecast = predictAfter(model, view.lane, policy.telegraphMs + policy.flightMs);
  const prior = occupancyPrior(model), fav = favouriteOption(model);
  const weakLane = weakestOption(model), weakRate = weakLane === null ? null : weaknessOf(model, weakLane);
  const hazard = weakestHazard(view.hazards);
  const reaction = meanReaction(model);
  const confidence = forecast.grounded ? pct(forecast.probability) : `${pct(forecast.probability)} (thin history)`;
  const cutoffScore = forecast.grounded ? forecast.probability * 100 : 40;

  const options: DecisionOption[] = doctrinesFor(view.difficulty).map(doctrine => {
    const keep: Facts = doctrine === view.current ? { "in force now": "yes" } : {};
    if (doctrine === "rotation") {
      return { id: doctrine, label: DOCTRINE_LABELS[doctrine], features: { "reads your play": "no", pattern: "Left, Centre, Right in turn", ...keep }, score: 30 };
    }
    if (doctrine === "hunt") {
      return { id: doctrine, label: DOCTRINE_LABELS[doctrine], features: { "reads": "the lane you are in now", "your favourite lane": `${laneName(fav)} ${pct(prior[fav])}`, ...keep }, score: 25 + prior[fav] * 60 };
    }
    if (doctrine === "cutoff") {
      return { id: doctrine, label: DOCTRINE_LABELS[doctrine], features: { "reads": "where your moves lead", "forecast confidence": confidence, ...(reaction === null ? {} : { "your mean reaction": `${Math.round(reaction)} ms` }), ...keep }, score: cutoffScore };
    }
    const features: Facts = { "reads": "your forecast and your weakest spots", "forecast confidence": confidence, ...keep };
    if (weakLane !== null && weakRate !== null) features["your weakest lane"] = `${laneName(weakLane)}, ${pct(weakRate)} of dodges failed`;
    if (hazard) features["hazard lean"] = `${HAZARD_WORDS[hazard]}: ${view.hazards[hazard].failed} of ${view.hazards[hazard].met} failed`;
    return {
      id: doctrine,
      label: DOCTRINE_LABELS[doctrine],
      features,
      score: cutoffScore + 10 + (weakLane !== null ? 10 : 0) + (hazard ? (view.hazards[hazard].failed / view.hazards[hazard].met) * 30 : 0),
    };
  });

  const facts: Facts = {
    "next section": ZONE_NAMES[view.zone],
    "hits so far": `${view.hits} of 3`,
    "chase gap": `${Math.round(view.gap)} m`,
    "lane dwell": prior.map((p, lane) => `${laneName(lane)} ${pct(p)}`).join(", "),
    "sheep saved": view.sheep,
  };
  return openMenu(id, `Polyphemus plans ${ZONE_NAMES[view.zone]}`, facts, options, openedAt);
}
