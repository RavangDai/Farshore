// Antinous' shot menu for the contest of the twelve axes.
//
// Before each of his arrows the game lays out the shots open to him and what
// each is worth, measured with the hall's own physics (handed in by the engine,
// so there is one copy of the flight rules, not a mirror that can drift). A
// pretrained model then picks one in character; the engine looses it with its
// own seeded execution error. Antinous chooses what to try, never how well it
// flies.
//
// What every menu guarantees, on every tier:
//
//   1. Expected axes are measured, not asserted: each option is flown
//      SAMPLES times through the real trajectory with the tier's real
//      execution error, from a private seed that never disturbs the engine's
//      own random stream.
//   2. A block shot is only offered when replaying the player's last line
//      through the real trajectory shows the lodged arrow would actually cost
//      it an axe, when the opening it narrows leaves at least one axe clear
//      before it, and never on the last arrow, when there is no next shot for
//      it to narrow. The narrowed axe is announced the moment it is chosen.
//   3. The showy half-draw is offered only when Antinous leads comfortably
//      (`boardStrategy` reads "guard"): pride is a luxury he has to afford.
//   4. Easy never lodges an arrow; Hard offers a second block target. The
//      difficulty sets the menu; the model picks from it. Under the declared
//      "Unsteady suitor" plan he cannot read the full draught at all, which is
//      what that plan has always meant.

import type { Difficulty, PlanId } from "../arcade/arcade.ts";
import { openMenu, type DecisionMenu, type DecisionOption, type Facts } from "../arcade/decisions.ts";
import { BLOCK_SHOT_CAP, BOARD_LEAD_BAND, boardStrategy } from "./ithaca.ts";
import { tierOf } from "./types.ts";

export type BowAim = { aim: number; elevation: number; tension: number };

/** The hall's rules, passed in by the engine. */
export type BowPhysics = {
  rings: (aim: BowAim, wind: number, blocked: number) => number;
  bestAim: (wind: number) => BowAim;
  /** Each axe's opening on this tier, in path units, and sight units per path unit. */
  opening: number;
  perSight: number;
  axes: number;
  turns: number;
};

export type BowView = {
  difficulty: Difficulty;
  planId: PlanId;
  /** 1-based arrow number: Antinous is about to loose his `turn`th. */
  turn: number;
  score: number;
  rivalScore: number;
  wind: number;
  /** The aim the player just loosed, as flown (sway included). */
  playerAim: BowAim;
  seed: number;
};

/** The execution error a tier's archer carries, in sight units, as `rivalShot` applies it. */
export function errorBounds(difficulty: Difficulty, physics: BowPhysics) {
  const tier = tierOf(difficulty), openings = physics.opening / physics.perSight;
  return { aim: [2.6, 1.8, 1.4][tier] * openings, elevation: [1.5, 1.1, 0.9][tier] * openings };
}

export type BowIntent = { kind: "full" | "steady" | "boast" | "block"; block: number };

/** The sight and draw an intent aims with, before execution error. `tension` is drawn by the engine for full draws. */
export function intendedAim(intent: BowIntent, wind: number, physics: BowPhysics): BowAim {
  const ideal = physics.bestAim(wind);
  if (intent.kind === "steady") return { ...ideal, aim: ideal.aim / 2 };
  if (intent.kind === "boast") {
    // A half-draw flies slower, so it drops and drifts by the square of the
    // shortfall; he allows for that, which is what makes it skill, not folly.
    const slow = (100 / BOAST_TENSION) ** 2;
    return { aim: ideal.aim * slow, elevation: ideal.elevation * slow, tension: BOAST_TENSION };
  }
  return ideal;
}

/** A showy shot's draw, and how much wider its error is than a full draw's. */
export const BOAST_TENSION = 72;
export const BOAST_ERROR = 1.5;
/** A steady shot allows for only half the draught, but the hand holds tighter. */
export const STEADY_ERROR = 0.7;
/** How much an intent widens or tightens the tier's execution error. */
export const errorScale = (kind: BowIntent["kind"]) => (kind === "boast" ? BOAST_ERROR : kind === "steady" ? STEADY_ERROR : 1);
const SAMPLES = 40;

function privateRoll(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Fly an intent SAMPLES times with the tier's real error; the block cap applies to his own count. */
function measure(intent: BowIntent, view: BowView, physics: BowPhysics) {
  const roll = privateRoll(view.seed ^ Math.imul(view.turn + 1, 2654435761) ^ (intent.block * 977 + intent.kind.length * 131));
  const error = errorBounds(view.difficulty, physics), widen = errorScale(intent.kind);
  const base = intendedAim(intent, view.wind, physics);
  const counts: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const tension = intent.kind === "boast" ? BOAST_TENSION : Math.round(88 + roll() * 12);
    const aim = {
      aim: base.aim + (roll() - 0.5) * 2 * error.aim * widen,
      elevation: base.elevation + (roll() - 0.5) * 2 * error.elevation * widen,
      tension,
    };
    const rings = physics.rings(aim, view.wind, 0);
    counts.push(intent.kind === "block" ? Math.min(BLOCK_SHOT_CAP, rings) : rings);
  }
  counts.sort((a, b) => a - b);
  const mean = counts.reduce((n, c) => n + c, 0) / counts.length;
  // The middle 80% of outcomes: what "usually" means, without the freak ends.
  return { mean: Math.round(mean * 10) / 10, low: counts[Math.floor(SAMPLES * 0.1)], high: counts[Math.floor(SAMPLES * 0.9)] };
}

/**
 * Which axes, if lodged, would cost the player's last line the most, assuming
 * a similar draught next turn. That assumption is why the menu says "if you
 * repeat your last line": it is a strategic read, not a promise.
 */
export function blockTargets(view: BowView, physics: BowPhysics): { axe: number; cost: number; baseline: number }[] {
  const baseline = physics.rings(view.playerAim, view.wind, 0);
  const targets: { axe: number; cost: number; baseline: number }[] = [];
  // Axe 1 is never narrowed, so at least one opening is always clear before it.
  for (let axe = 2; axe <= physics.axes; axe++) {
    const cost = baseline - physics.rings(view.playerAim, view.wind, axe);
    if (cost > 0) targets.push({ axe, cost, baseline });
  }
  return targets.sort((a, b) => b.cost - a.cost || a.axe - b.axe);
}

const signed = (n: number) => (n > 0 ? `${n} right` : n < 0 ? `${-n} left` : "still");

export function bowMenu(view: BowView, physics: BowPhysics, menuId: string, openedAt: number): DecisionMenu {
  const tier = tierOf(view.difficulty);
  const board = boardStrategy(view.score, view.rivalScore);
  const arrowsLeft = physics.turns - view.turn;
  const range = (m: { low: number; high: number }) => (m.low === m.high ? `${m.low}` : `${m.low}–${m.high}`);
  const options: DecisionOption[] = [];

  if (view.planId !== "patient") {
    const full = measure({ kind: "full", block: 0 }, view, physics);
    options.push({
      id: "full",
      label: "Read the full draught",
      features: { "expected axes": full.mean, "usual range": range(full) },
      score: full.mean,
    });
  }

  // Half the allowance with a tighter hand: better in a light draught, worse
  // in a strong one. A real trade-off, so even Easy has a choice to make.
  const steady = measure({ kind: "steady", block: 0 }, view, physics);
  options.push({
    id: "steady",
    label: "Steady hand, half the draught",
    features: { "expected axes": steady.mean, "usual range": range(steady) },
    score: steady.mean,
  });

  if (board.strategy === "guard") {
    const boast = measure({ kind: "boast", block: 0 }, view, physics);
    options.push({
      id: "boast",
      label: "Showy half-draw",
      features: { "expected axes": boast.mean, "usual range": range(boast), "lead now": board.lead },
      score: boast.mean,
    });
  }

  if (tier >= 1 && arrowsLeft > 0) {
    const targets = blockTargets(view, physics).slice(0, tier === 2 ? 2 : 1);
    for (const target of targets) {
      const block = measure({ kind: "block", block: target.axe }, view, physics);
      // His own axes, capped, plus half of what the narrowed opening is
      // expected to cost the player next turn: the draught will change, so the
      // repeat-line figure is discounted rather than banked.
      const declared = view.planId === "feint" ? 0.75 : 0;
      options.push({
        id: `block-${target.axe}`,
        label: `Lodge an arrow in axe ${target.axe}`,
        features: {
          "expected axes": block.mean,
          "own axes capped at": BLOCK_SHOT_CAP,
          "narrows": `axe ${target.axe}`,
          "your last line would lose": `${target.cost} of ${target.baseline} axes if repeated`,
        },
        score: block.mean + target.cost * 0.5 + declared,
      });
    }
  }

  const facts: Facts = {
    arrow: `${view.turn} of ${physics.turns}`,
    score: `Odysseus ${view.score}, Antinous ${view.rivalScore}`,
    "board read": board.strategy === "press" ? `trailing by ${-board.lead}` : board.strategy === "guard" ? `leading by ${board.lead}` : `within ${Math.abs(board.lead)}`,
    draught: signed(view.wind),
    "arrows after this one": arrowsLeft,
    "comfortable lead": `${BOARD_LEAD_BAND} axes or more`,
    "declared plan": view.planId === "feint" ? "Block-shot gambit" : view.planId === "surge" ? "Wind reader" : "Unsteady suitor",
  };
  return openMenu(menuId, `Antinous' arrow ${view.turn} of ${physics.turns}`, facts, options, openedAt);
}

/** Turn an executed option id back into the intent the engine looses. */
export function intentOf(optionId: string): BowIntent {
  if (optionId.startsWith("block-")) return { kind: "block", block: Number(optionId.slice(6)) || 0 };
  if (optionId === "steady" || optionId === "boast") return { kind: optionId, block: 0 };
  return { kind: "full", block: 0 };
}
