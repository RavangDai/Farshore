import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newCave,
  tickCave,
  caveAction,
  perceive,
  patternIsFair,
  laneBlockedDistances,
  caveProgress,
  zoneFor,
  AVOIDANCE,
  SPAWN_Z,
  JUMP_MS,
  SLIDE_MS,
  MAX_GAP,
  caveSummary,
} from "../src/lib/encounters/cave-runner.ts";
import { cavePolicy, escapeLanes, decideCave, LANE_CHANGE_MS, laneName } from "../src/lib/ai/cyclops.ts";
import {
  newPlayerModel,
  observeChoice,
  observeDwell,
  observeReaction,
  predict,
  predictAfter,
  meanReaction,
  favouriteOption,
  occupancyPrior,
  weakestOption,
  observeResolution,
} from "../src/lib/ai/player-model.ts";
import { newRuntime, commitDecision, argmax, softmax, averageInterval } from "../src/lib/ai/types.ts";

const plan = { planId: "alternating", focus: "center", source: "standard" };
const adaptive = { planId: "focused", focus: "center", source: "ai" };

/** Run the simulation forward in fixed 32 ms steps, like the render loop does. */
function run(state, ms, onStep) {
  let s = state;
  for (let t = 0; t < ms && !s.done; t += 32) {
    s = tickCave(s, 32);
    if (onStep) s = onStep(s) || s;
  }
  return s;
}

/**
 * Advance exactly `ms` of simulation time.
 *
 * `tickCave` bounds a single delta to 100 ms on purpose, so that a stalled tab
 * cannot teleport hazards past the player. Tests therefore have to slice long
 * waits the same way the real loop does.
 */
function step(state, ms) {
  let s = state;
  let left = ms;
  while (left > 0 && !s.done) {
    const slice = Math.min(100, left);
    s = tickCave(s, slice);
    left -= slice;
  }
  return s;
}

test("a new cave run starts centred, grounded and unthreatened", () => {
  const s = newCave("normal", plan);
  assert.equal(s.lane, 1);
  assert.equal(s.laneX, 0);
  assert.equal(s.jump, 0);
  assert.equal(s.slide, 0);
  assert.equal(s.grounded, true);
  assert.equal(s.hits, 0);
  assert.equal(s.done, false);
  assert.equal(s.boulders.length, 0);
  assert.equal(s.cyclops.state, "chasing");
  assert.ok(s.cyclops.gap > 0);
  assert.equal(s.ai.agentId, "polyphemus");
  assert.equal(s.model.options, 3);
});

test("rejects an unsupported difficulty", () => {
  assert.throws(() => newCave("legendary", plan), /Unsupported encounter difficulty/);
  for (const difficulty of ["easy", "normal", "hard"]) {
    assert.equal(newCave(difficulty, plan).difficulty, difficulty);
  }
});

test("the world scrolls toward the player and spawns ahead", () => {
  const s = run(newCave("normal", plan), 1600);
  assert.ok(s.distance > 10, `expected forward motion, got ${s.distance}`);
  assert.ok(s.obstacles.length > 0, "expected a spawned wave");
  for (const o of s.obstacles) assert.ok(o.z <= SPAWN_Z + 8, `obstacle spawned too far: ${o.z}`);
});

test("lane changes are immediate in intent and animated in position", () => {
  let s = newCave("normal", plan);
  s = caveAction(s, { type: "move", dx: -1 });
  assert.equal(s.lane, 0, "intent applies at once");
  assert.equal(s.changing, LANE_CHANGE_MS);
  assert.equal(s.laneX, 0, "rendered position has not moved yet");
  s = step(s, LANE_CHANGE_MS + 32);
  assert.equal(s.changing, 0);
  assert.equal(s.laneX, -1, "rendered position settles on the lane");
});

test("lane movement clamps to the three lanes", () => {
  let s = newCave("normal", plan);
  for (let i = 0; i < 5; i++) s = caveAction(s, { type: "move", dx: -1 });
  assert.equal(s.lane, 0);
  for (let i = 0; i < 9; i++) s = caveAction(s, { type: "move", dx: 1 });
  assert.equal(s.lane, 2);
});

test("a jump has takeoff, airborne and landing phases", () => {
  let s = caveAction(newCave("normal", plan), { type: "jump" });
  assert.equal(s.jump, JUMP_MS);
  assert.equal(s.grounded, false);
  s = step(s, JUMP_MS / 2);
  assert.ok(s.jump > 0 && !s.grounded, "still airborne mid-arc");
  s = step(s, JUMP_MS);
  assert.equal(s.jump, 0);
  assert.equal(s.grounded, true);
  assert.ok(s.landedAt > 0, "landing is stamped for the renderer");
});

test("a jump pressed just before landing is buffered and fires on touchdown", () => {
  let s = caveAction(newCave("normal", plan), { type: "jump" });
  // Press inside the buffer window, shortly before touchdown.
  s = step(s, JUMP_MS - 80);
  s = caveAction(s, { type: "jump" });
  assert.ok(s.buffer > 0, "the early press is remembered");
  s = step(s, 100);
  assert.ok(s.jump > 0, "the buffered jump fired on landing");
});

test("a jump pressed far too early is forgotten rather than queued", () => {
  let s = caveAction(newCave("normal", plan), { type: "jump" });
  s = step(s, 150);
  s = caveAction(s, { type: "jump" });
  s = step(s, JUMP_MS);
  assert.equal(s.jump, 0, "a buffer is a short window, not an input queue");
  assert.equal(s.buffer, 0);
});

test("sliding lowers the player and expires", () => {
  let s = caveAction(newCave("normal", plan), { type: "slide" });
  assert.equal(s.slide, SLIDE_MS);
  s = step(s, SLIDE_MS + 32);
  assert.equal(s.slide, 0);
});

test("every obstacle kind has a stated avoidance method", () => {
  for (const [kind, rule] of Object.entries(AVOIDANCE)) {
    assert.equal(typeof rule.prompt, "string", `${kind} needs a prompt`);
    assert.ok(rule.prompt.length > 0);
    if (!rule.jump && !rule.slide) assert.equal(rule.prompt, "DODGE", `${kind} must read as a lane change`);
  }
});

test("a jumpable obstacle in the player's lane is cleared by a jump", () => {
  let s = newCave("normal", plan);
  s.obstacles = [{ id: 99, lane: 1, kind: "crate", z: 6, resolved: false, variant: 0 }];
  s.sheep = [];
  s.coins = [];
  s = caveAction(s, { type: "jump" });
  s = run(s, 600);
  assert.equal(s.hits, 0, "a timed jump takes no damage");
  assert.ok(s.precision >= 1, "a timed clear counts as a precision escape");
});

test("a jumpable obstacle in the player's lane damages a grounded runner", () => {
  let s = newCave("normal", plan);
  s.obstacles = [{ id: 99, lane: 1, kind: "crate", z: 6, resolved: false, variant: 0 }];
  s.sheep = [];
  s.coins = [];
  s = run(s, 700);
  assert.equal(s.hits, 1, "standing in the lane is a hit");
  assert.ok(s.struckAt > 0, "the hit is stamped for the renderer");
});

test("a beam requires a slide, not a jump", () => {
  const base = () => {
    const s = newCave("normal", plan);
    s.obstacles = [{ id: 7, lane: 1, kind: "beam", z: 6, resolved: false, variant: 0 }];
    s.sheep = [];
    s.coins = [];
    return s;
  };
  const jumped = run(caveAction(base(), { type: "jump" }), 700);
  assert.equal(jumped.hits, 1, "jumping into a beam is still a hit");
  const slid = run(caveAction(base(), { type: "slide" }), 700);
  assert.equal(slid.hits, 0, "sliding clears the beam");
  assert.ok(slid.precision >= 1);
});

test("changing lanes avoids an obstacle entirely", () => {
  let s = newCave("normal", plan);
  s.obstacles = [{ id: 5, lane: 1, kind: "pillar", z: 30, resolved: false, variant: 0 }];
  s.sheep = [];
  s.coins = [];
  s = caveAction(s, { type: "move", dx: 1 });
  s = run(s, 2200);
  assert.equal(s.hits, 0, "the pillar was in another lane");
  assert.ok(s.score > 0, "a clean pass scores");
});

test("collecting a sheep restores a life, scores, and widens the gap", () => {
  let s = newCave("normal", plan);
  s.hits = 2;
  s.obstacles = [];
  s.coins = [];
  s.sheep = [{ id: 3, lane: 1, z: 5, drift: 0, taken: false, variant: 0 }];
  const gapBefore = s.cyclops.gap;
  s = run(s, 600);
  assert.equal(s.hits, 1, "a sheep restores one life");
  assert.equal(s.sheepSaved, 1);
  assert.ok(s.score >= 150);
  assert.ok(s.cyclops.gap > gapBefore, "the sheep buys distance");
  assert.ok(s.pops.some(p => p.text.includes("HEALTH")), "a +HEALTH callout is queued");
});

test("a sheep in another lane is missed without penalty", () => {
  let s = newCave("normal", plan);
  s.obstacles = [];
  s.coins = [];
  s.sheep = [{ id: 3, lane: 0, z: 5, drift: 0, taken: false, variant: 0 }];
  s = run(s, 800);
  assert.equal(s.sheepSaved, 0);
  assert.equal(s.hits, 0);
});

test("three hits end the run as a loss", () => {
  let s = newCave("normal", plan);
  s.sheep = [];
  s.coins = [];
  for (let i = 0; i < 3 && !s.done; i++) {
    s.obstacles = [{ id: 40 + i, lane: s.lane, kind: "pillar", z: 5, resolved: false, variant: 0 }];
    s.invulnerable = 0;
    s = run(s, 700);
  }
  assert.equal(s.done, true);
  assert.equal(s.won, false);
  assert.equal(s.hits, 3);
});

test("surviving to the end of the duration wins and reaches daylight", () => {
  let s = newCave("easy", plan, true);
  s.duration = 2000;
  s = run(s, 2400, next => {
    // Stay out of trouble by hugging whichever lane is clear.
    const blocked = laneBlockedDistances(next);
    if (blocked[next.lane] < 20) {
      const safe = [0, 1, 2].find(l => blocked[l] > 40);
      if (safe !== undefined && safe !== next.lane) return caveAction(next, { type: "move", dx: Math.sign(safe - next.lane) });
    }
    return next;
  });
  assert.equal(s.done, true);
  assert.equal(s.won, true);
  assert.match(s.feedback, /[Dd]aylight/);
});

test("the cave is caught by the Cyclops when the gap closes", () => {
  let s = newCave("normal", plan);
  s.cyclops.gap = 0.05;
  s = run(s, 400);
  assert.equal(s.done, true);
  assert.equal(s.won, false);
  assert.match(s.feedback, /catches you/);
});

test("the cave progresses through its three sections", () => {
  assert.equal(zoneFor(0), "cave");
  assert.equal(zoneFor(0.5), "collapse");
  assert.equal(zoneFor(0.9), "daylight");
  const s = newCave("normal", plan);
  assert.equal(s.zone, "cave");
  assert.equal(caveProgress(s), 0);
});

test("invulnerability prevents two hits from one mistake", () => {
  let s = newCave("normal", plan);
  s.sheep = [];
  s.coins = [];
  s.obstacles = [
    { id: 1, lane: 1, kind: "pillar", z: 4, resolved: false, variant: 0 },
    { id: 2, lane: 1, kind: "pillar", z: 8, resolved: false, variant: 0 },
  ];
  s = run(s, 800);
  assert.equal(s.hits, 1, "the invulnerability window absorbed the second");
});

// ---------------------------------------------------------------------------
// Fairness
// ---------------------------------------------------------------------------

test("a telegraph always outlasts the time a lane change takes", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    for (const source of ["standard", "ai"]) {
      const policy = cavePolicy(difficulty, source === "ai");
      assert.ok(
        policy.telegraphMs > LANE_CHANGE_MS * 2,
        `${difficulty}/${source}: ${policy.telegraphMs} ms warning is too short for a ${LANE_CHANGE_MS} ms lane change`,
      );
      assert.ok(policy.cooldownMs > policy.telegraphMs, `${difficulty}: cooldown must exceed the telegraph`);
    }
  }
});

test("harder difficulties warn less but never below the reaction floor", () => {
  const easy = cavePolicy("easy", false);
  const hard = cavePolicy("hard", false);
  assert.ok(hard.telegraphMs < easy.telegraphMs, "hard commits faster");
  assert.ok(hard.telegraphMs >= 1200, "but still leaves over a second to react");
});

test("escapeLanes reports only lanes that are reachable and open", () => {
  const view = {
    at: 0,
    lane: 1,
    laneProgress: 0,
    airborne: false,
    sliding: false,
    gap: 60,
    speed: 20,
    lives: 3,
    laneBlocked: [Infinity, Infinity, 4],
    laneTargeted: [false, false, false],
    zone: "cave",
    remainingMs: 50000,
  };
  const escapes = escapeLanes(view, 1, 1800, 20);
  assert.deepEqual(escapes, [0], "the right lane is blocked within the window");
});

test("a lane already carrying a boulder is not counted as an escape", () => {
  const view = {
    at: 0,
    lane: 1,
    laneProgress: 0,
    airborne: false,
    sliding: false,
    gap: 60,
    speed: 20,
    lives: 3,
    laneBlocked: [Infinity, Infinity, Infinity],
    laneTargeted: [true, false, false],
    zone: "cave",
    remainingMs: 50000,
  };
  assert.deepEqual(escapeLanes(view, 1, 1800, 20), [2]);
});

test("Polyphemus withholds a throw when it would leave no escape", () => {
  const ai = newRuntime("polyphemus", "Polyphemus", "test");
  const model = newPlayerModel(3, 1);
  const view = {
    at: 5000,
    lane: 1,
    laneProgress: 0,
    airborne: false,
    sliding: false,
    gap: 50,
    speed: 20,
    lives: 3,
    // Every lane is closed by un-answerable hazards, so no throw can be fair.
    // `patternIsFair` stops the spawner producing this, but the guard still holds.
    laneBlocked: [3, 3, 3],
    laneTargeted: [false, false, false],
    zone: "collapse",
    remainingMs: 40000,
  };
  const action = decideCave(ai, model, view, "hard", true, 4, () => 0.5);
  assert.notEqual(action.kind, "boulder", "a throw here would be unavoidable");
  const decision = ai.decisions.at(-1);
  const scoredOut = decision.candidates.filter(c => c.score <= -1000);
  assert.equal(scoredOut.length, 3, "all three lanes must be scored out, not hidden");
  for (const candidate of scoredOut) assert.match(candidate.note, /no escape/i);
  // Whatever wins instead, the stated reason has to mention the withholding
  // rather than claiming the throws simply lost on score.
  assert.match(decision.reason, /withheld/i);
});

test("every committed throw leaves at least one escape lane", () => {
  // Drive a full hard run and assert the invariant on each released boulder.
  let s = newCave("hard", adaptive, false, 991);
  let checks = 0;
  for (let t = 0; t < 40000 && !s.done; t += 32) {
    const before = s.cyclops.state;
    s = tickCave(s, 32);
    if (before !== "winding" && s.cyclops.state === "winding") {
      const view = perceive(s);
      const escapes = escapeLanes(view, s.cyclops.windLane, s.cyclops.windTotal + 800, s.speed);
      assert.ok(
        escapes.length > 0,
        `throw at ${laneName(s.cyclops.windLane)} left no escape (blocked ${JSON.stringify(view.laneBlocked)})`,
      );
      checks++;
    }
    // Keep the runner alive so the run lasts long enough to sample throws.
    const blocked = laneBlockedDistances(s);
    if (blocked[s.lane] < 18) {
      const safe = [0, 1, 2].find(l => blocked[l] > 36 && l !== s.cyclops.windLane);
      if (safe !== undefined) s = caveAction(s, { type: "move", dx: Math.sign(safe - s.lane) });
    }
  }
  assert.ok(checks > 0, "the run produced no throws to verify");
});

test("the locked lane is never re-aimed once the telegraph begins", () => {
  let s = newCave("hard", adaptive, false, 4242);
  let locked = -1;
  let observed = 0;
  for (let t = 0; t < 30000 && !s.done; t += 32) {
    s = tickCave(s, 32);
    if (s.cyclops.state === "winding") {
      if (locked < 0) locked = s.cyclops.windLane;
      else assert.equal(s.cyclops.windLane, locked, "the target changed mid-telegraph");
      // Move constantly: a tracking policy would want to follow.
      s = caveAction(s, { type: "move", dx: t % 128 < 64 ? 1 : -1 });
    } else if (locked >= 0) {
      const boulder = s.boulders.find(b => !b.resolved);
      if (boulder) assert.equal(boulder.lane, locked, "the released boulder left the locked lane");
      locked = -1;
      observed++;
    }
  }
  assert.ok(observed > 0, "no telegraphs were observed");
});

// ---------------------------------------------------------------------------
// Difficulty is algorithmic, not just faster
// ---------------------------------------------------------------------------

test("each difficulty names a different algorithm", () => {
  const names = ["easy", "normal", "hard"].map(d => cavePolicy(d, false).algorithm);
  assert.equal(new Set(names).size, 3, `expected three distinct policies, got ${names.join(" / ")}`);
  assert.match(names[0], /rotation/i);
  assert.match(names[1], /tracking/i);
  assert.match(names[2], /forecast|predict/i);
});

test("easy ignores the player's position; normal tracks it", () => {
  const view = lane => ({
    at: 9000,
    lane,
    laneProgress: 0,
    airborne: false,
    sliding: false,
    gap: 55,
    speed: 20,
    lives: 3,
    laneBlocked: [Infinity, Infinity, Infinity],
    laneTargeted: [false, false, false],
    zone: "cave",
    remainingMs: 40000,
  });
  // Normal tracks: whichever lane the player occupies is the target.
  for (const lane of [0, 1, 2]) {
    const ai = newRuntime("p", "P", "t");
    const action = decideCave(ai, newPlayerModel(3, lane), view(lane), "normal", false, 0, () => 0.5);
    assert.equal(action.kind, "boulder");
    assert.equal(action.lane, lane, "normal should target the occupied lane");
  }
  // Easy follows a fixed rotation driven by the wave counter, not the player.
  const targets = new Set();
  for (let wave = 0; wave < 3; wave++) {
    const ai = newRuntime("p", "P", "t");
    const action = decideCave(ai, newPlayerModel(3, 1), view(1), "easy", false, wave, () => 0.5);
    if (action.kind === "boulder") targets.add(action.lane);
  }
  assert.ok(targets.size > 1, "easy must not simply follow the player");
});

test("only the predictive policy reports a confidence value", () => {
  const view = {
    at: 9000,
    lane: 1,
    laneProgress: 0,
    airborne: false,
    sliding: false,
    gap: 55,
    speed: 20,
    lives: 3,
    laneBlocked: [Infinity, Infinity, Infinity],
    laneTargeted: [false, false, false],
    zone: "cave",
    remainingMs: 40000,
  };
  const easyAi = newRuntime("p", "P", "t");
  decideCave(easyAi, newPlayerModel(3, 1), view, "easy", false, 0, () => 0.5);
  assert.equal(easyAi.decisions.at(-1).confidence, undefined, "no probability model, no percentage");

  const hardAi = newRuntime("p", "P", "t");
  const model = newPlayerModel(3, 1);
  for (let i = 0; i < 6; i++) {
    observeDwell(model, 0, 900);
    observeChoice(model, 0);
    observeChoice(model, 1);
  }
  decideCave(hardAi, model, view, "hard", true, 0, () => 0.5);
  const confidence = hardAi.decisions.at(-1).confidence;
  assert.equal(typeof confidence, "number");
  assert.ok(confidence > 0 && confidence <= 1, `confidence out of range: ${confidence}`);
});

test("the hard policy follows the observed lane habit", () => {
  const model = newPlayerModel(3, 1);
  // A player who keeps returning to the left lane.
  for (let i = 0; i < 8; i++) {
    observeDwell(model, 0, 1400);
    observeChoice(model, 0);
    observeDwell(model, 1, 220);
    observeChoice(model, 1);
  }
  observeReaction(model, 300);
  observeReaction(model, 340);
  const ai = newRuntime("p", "P", "t");
  const action = decideCave(
    ai,
    model,
    {
      at: 20000,
      lane: 1,
      laneProgress: 0,
      airborne: false,
      sliding: false,
      gap: 50,
      speed: 20,
      lives: 3,
      laneBlocked: [Infinity, Infinity, Infinity],
      laneTargeted: [false, false, false],
      zone: "collapse",
      remainingMs: 30000,
    },
    "hard",
    true,
    0,
    () => 0.5,
  );
  assert.equal(action.kind, "boulder");
  assert.equal(action.lane, 0, "the forecast should follow the left-lane habit");
  assert.match(ai.decisions.at(-1).reason, /probability/i);
});

test("the predictive policy can be wrong", () => {
  // Build a habit, then defy it, and confirm the record says the forecast failed.
  let s = newCave("hard", adaptive, false, 77);
  s.sheep = [];
  s.coins = [];
  s.obstacles = [];
  for (let i = 0; i < 8; i++) {
    s = caveAction(s, { type: "move", dx: -1 });
    s = tickCave(s, 400);
    s = caveAction(s, { type: "move", dx: 1 });
    s = tickCave(s, 400);
  }
  let failures = 0;
  let resolved = 0;
  for (let t = 0; t < 40000 && !s.done; t += 32) {
    s = tickCave(s, 32);
    s.obstacles = [];
    s.hits = 0;
    const boulder = s.boulders.find(b => !b.resolved);
    // Always sidestep the locked lane: the forecast must sometimes miss.
    if (boulder && s.lane === boulder.lane) {
      s = caveAction(s, { type: "move", dx: boulder.lane === 0 ? 1 : -1 });
    }
    if (s.cyclops.state === "winding" && s.lane === s.cyclops.windLane) {
      s = caveAction(s, { type: "move", dx: s.cyclops.windLane === 0 ? 1 : -1 });
    }
    for (const d of s.ai.decisions) {
      if (d.outcome === "dodged") resolved++;
    }
    failures = s.ai.decisions.filter(d => d.outcomeNote?.includes("prediction failed")).length;
    if (failures > 0) break;
  }
  assert.ok(resolved > 0 || failures > 0, "no throws resolved during the run");
  assert.ok(failures > 0, "a determined dodger should defeat the forecast at least once");
});

// ---------------------------------------------------------------------------
// Telemetry integrity
// ---------------------------------------------------------------------------

test("the selected action always matches a scored candidate", () => {
  let s = newCave("hard", adaptive, false, 31337);
  s = run(s, 20000, next => {
    next.hits = 0;
    return next;
  });
  assert.ok(s.ai.decisions.length > 0, "no decisions were recorded");
  for (const decision of s.ai.decisions) {
    assert.ok(decision.candidates.length > 0, "a decision with no candidates");
    const chosen = decision.candidates.filter(c => c.chosen);
    assert.equal(chosen.length, 1, `expected exactly one chosen candidate in ${decision.id}`);
    const best = argmax(decision.candidates);
    assert.equal(chosen[0].action, best.action, "the chosen candidate was not the highest scoring one");
    assert.ok(decision.reason.length > 20, "a decision needs a readable reason");
    assert.ok(decision.observations.length > 0, "a decision needs perception readings");
    assert.ok(decision.id.startsWith("polyphemus-"), "decision ids must be deterministic");
  }
});

test("decision and event buffers stay bounded over a long run", () => {
  let s = newCave("hard", adaptive, false, 5);
  s = run(s, 70000, next => {
    next.hits = 0;
    next.cyclops.gap = 60;
    return next;
  });
  assert.ok(s.ai.decisions.length <= 14, `decisions grew to ${s.ai.decisions.length}`);
  assert.ok(s.ai.events.length <= 44, `events grew to ${s.ai.events.length}`);
  assert.ok(s.pops.length <= 6);
});

test("decision timestamps use simulation time, so pausing freezes the record", () => {
  let s = run(newCave("normal", plan, false, 12), 8000);
  const before = s.ai.decisions.length;
  const at = s.ai.decisions.at(-1)?.at;
  assert.equal(typeof at, "number");
  assert.ok(at <= s.elapsed);
  // No ticks: no new decisions, and nothing drifts with wall-clock time.
  const idle = s;
  assert.equal(idle.ai.decisions.length, before);
});

test("the runtime records a measurable decision interval", () => {
  const s = run(newCave("normal", plan, false, 8), 14000);
  assert.ok(s.ai.stats.decisions >= 2, "expected several decision cycles");
  assert.ok(averageInterval(s.ai) > 0, "the average interval should be measured, not assumed");
});

test("the whole state survives structuredClone, including the AI runtime", () => {
  const s = run(newCave("hard", adaptive, false, 3), 9000);
  const copy = structuredClone(s);
  assert.deepEqual(copy.ai.decisions, s.ai.decisions);
  assert.deepEqual(copy.model.transitions, s.model.transitions);
  assert.equal(copy.ai.stats.decisions, s.ai.stats.decisions);
});

test("a seeded run is deterministic", () => {
  const a = run(newCave("hard", adaptive, false, 606), 12000);
  const b = run(newCave("hard", adaptive, false, 606), 12000);
  assert.equal(a.score, b.score);
  assert.equal(a.hits, b.hits);
  assert.equal(a.wave, b.wave);
  assert.deepEqual(
    a.ai.decisions.map(d => d.selectedAction),
    b.ai.decisions.map(d => d.selectedAction),
  );
});

test("reading perception does not alter the simulation", () => {
  const s = run(newCave("hard", adaptive, false, 44), 6000);
  const snapshot = structuredClone(s);
  perceive(s);
  perceive(s);
  assert.deepEqual(s, snapshot, "perceive must be read-only");
});

test("generated patterns always leave an answerable lane", () => {
  assert.equal(patternIsFair({ lanes: [{ lane: 0, kind: "pillar" }] }), true, "two lanes are still open");
  assert.equal(
    // `debris` can be jumped, so it does not close a lane.
    patternIsFair({ lanes: [{ lane: 0, kind: "pillar" }, { lane: 1, kind: "boulder" }, { lane: 2, kind: "debris" }] }),
    true,
    "a jumpable hazard keeps its lane answerable",
  );
  assert.equal(
    patternIsFair({ lanes: [{ lane: 0, kind: "pillar" }, { lane: 1, kind: "boulder" }, { lane: 2, kind: "pillar" }] }),
    false,
    "three lanes that can only be dodged leaves nowhere to go",
  );
  assert.equal(
    patternIsFair({ lanes: [{ lane: 0, kind: "pillar" }, { lane: 1, kind: "beam" }, { lane: 2, kind: "boulder" }] }),
    true,
    "the beam can be slid under",
  );
});

test("no spawned wave ever closes all three lanes without an answer", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    let s = newCave(difficulty, adaptive, false, 2024);
    for (let t = 0; t < 60000 && !s.done; t += 32) {
      s = tickCave(s, 32);
      s.hits = 0;
      // Group obstacles that share a spawn depth and check the group.
      const groups = new Map();
      for (const o of s.obstacles) {
        if (o.resolved) continue;
        const key = Math.round(o.z / 6);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(o);
      }
      for (const [, group] of groups) {
        if (group.length < 3) continue;
        assert.ok(
          patternIsFair({ lanes: group.map(o => ({ lane: o.lane, kind: o.kind })) }),
          `${difficulty}: an impossible wave reached the world: ${group.map(o => `${o.lane}:${o.kind}`).join(",")}`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Player model
// ---------------------------------------------------------------------------

test("dwell time decays, so old habits fade", () => {
  const model = newPlayerModel(3, 1);
  observeDwell(model, 0, 5000);
  const early = occupancyPrior(model)[0];
  for (let i = 0; i < 20; i++) observeDwell(model, 2, 1000);
  assert.ok(occupancyPrior(model)[0] < early, "the old lane's share should shrink");
  assert.equal(favouriteOption(model), 2);
});

test("an unobserved player yields a near-uniform forecast", () => {
  const model = newPlayerModel(3, 1);
  const prediction = predict(model, 1);
  assert.equal(prediction.grounded, false, "no transitions yet");
  assert.ok(prediction.probability < 0.75, `an unobserved player should not be predicted at ${prediction.probability}`);
});

test("a repeated transition becomes a grounded, confident forecast", () => {
  const model = newPlayerModel(3, 1);
  for (let i = 0; i < 8; i++) {
    observeChoice(model, 1);
    observeChoice(model, 0);
  }
  const prediction = predict(model, 1);
  assert.equal(prediction.option, 0, "1 → 0 is the learnt transition");
  assert.equal(prediction.grounded, true);
  assert.ok(prediction.probability > 0.5);
  const total = prediction.distribution.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, "the distribution must sum to 1");
});

test("a forecast inside one reaction time keeps the player where they are", () => {
  const model = newPlayerModel(3, 1);
  for (let i = 0; i < 8; i++) {
    observeChoice(model, 1);
    observeChoice(model, 0);
  }
  observeReaction(model, 500);
  observeReaction(model, 520);
  const soon = predictAfter(model, 1, 120);
  assert.equal(soon.option, 1, "no time to commit a move");
  assert.equal(soon.probability, 1);
  const later = predictAfter(model, 1, 1800);
  assert.equal(later.option, 0, "past a reaction time the transition applies");
});

test("reaction measurements ignore impossible values", () => {
  const model = newPlayerModel(3, 1);
  observeReaction(model, -40);
  observeReaction(model, 90000);
  assert.equal(meanReaction(model), null, "garbage must not enter the mean");
  observeReaction(model, 400);
  assert.equal(meanReaction(model), 400);
});

test("the weakest lane needs real evidence before it is named", () => {
  const model = newPlayerModel(3, 1);
  assert.equal(weakestOption(model), null);
  observeResolution(model, 2, false);
  assert.equal(weakestOption(model), null, "one sample is not evidence");
  observeResolution(model, 2, false);
  assert.equal(weakestOption(model), 2);
});

test("reaction timing is only taken against a locked telegraph", () => {
  let s = newCave("normal", plan);
  s.lockedAt = -1;
  s.answered = true;
  s = caveAction(s, { type: "move", dx: 1 });
  assert.equal(meanReaction(s.model), null, "a free move is not a reaction");
  s.lockedAt = s.elapsed;
  s.answered = false;
  s = step(s, 320);
  s = caveAction(s, { type: "move", dx: -1 });
  assert.ok(meanReaction(s.model) > 0, "answering a telegraph is a reaction");
});

// ---------------------------------------------------------------------------
// Shared AI helpers
// ---------------------------------------------------------------------------

test("argmax is deterministic on ties", () => {
  const candidates = [
    { action: "a", score: 5 },
    { action: "b", score: 5 },
  ];
  assert.equal(argmax(candidates).action, "a");
});

test("softmax produces a distribution", () => {
  const p = softmax([1, 2, 3]);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(p[2] > p[1] && p[1] > p[0]);
});

test("the decision ring buffer keeps ids unique and ordered", () => {
  const ai = newRuntime("test", "Test", "demo");
  for (let i = 0; i < 30; i++) {
    commitDecision(ai, i * 100, {
      algorithm: "demo",
      state: "observing",
      observations: [],
      memory: [],
      candidates: [{ action: "wait", score: 1 }],
      selectedAction: "wait",
      reason: "a reason long enough to be useful",
    });
  }
  assert.equal(ai.decisions.length, 14);
  assert.equal(new Set(ai.decisions.map(d => d.id)).size, 14);
  assert.equal(ai.decisions.at(-1).id, "test-29");
  for (let i = 1; i < ai.decisions.length; i++) {
    assert.ok(ai.decisions[i].at >= ai.decisions[i - 1].at, "events must stay in order");
  }
});

// ---------------------------------------------------------------------------
// Playability: the acceptance criterion that a player can actually win
// ---------------------------------------------------------------------------

/**
 * A modest bot that plays off the same information the screen gives a person:
 * the avoidance prompt above each hazard, the red lane the telegraph paints,
 * and the sheep halo. It never reads the AI's internals and it cannot act more
 * often than `reactionMs`. If this clears the cave, a human can.
 *
 * It scores the three lanes and steps toward the best one, which is what lets
 * it route around a wave two lanes wide instead of only checking its
 * neighbours.
 */
function playCave(state, { reactionMs = 230 } = {}) {
  let s = state;
  let lastInput = -Infinity;
  let guard = 0;

  while (!s.done && guard++ < 16000) {
    // Hazards whose prompt is on screen, nearest first.
    const hazards = s.obstacles.filter(o => !o.resolved && o.z > -1 && o.z < 62).sort((a, b) => a.z - b.z);
    const owned = new Set();
    for (const b of s.boulders) if (!b.resolved) owned.add(b.lane);
    if (s.cyclops.state === "winding" && s.cyclops.windLane >= 0) owned.add(s.cyclops.windLane);

    // Metres covered while a jump or slide is active: the commit window.
    const actWindow = s.speed * 0.42;
    // Metres covered per lane change, used to judge what is reachable in time.
    const stepMetres = (s.speed * 230) / 1000;

    const scoreLane = lane => {
      const steps = Math.abs(lane - s.lane);
      let score = 100 - steps * 12;
      if (owned.has(lane)) score -= 500;
      for (const o of hazards) {
        if (o.lane !== lane) continue;
        const rule = AVOIDANCE[o.kind];
        // Only hazards close enough to matter before another move is possible.
        if (o.z > 46) continue;
        const reachableInTime = o.z > stepMetres * (steps + 1);
        if (!rule.jump && !rule.slide) score -= reachableInTime ? 180 : 600;
        else score -= 26;
      }
      return score;
    };

    const ranked = [0, 1, 2].map(lane => ({ lane, score: scoreLane(lane) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const mine = hazards.find(o => o.lane === s.lane);

    if (s.elapsed - lastInput >= reactionMs) {
      if (best.lane !== s.lane && best.score > scoreLane(s.lane) + 20) {
        // Step toward the best lane, one lane at a time.
        s = caveAction(s, { type: "move", dx: Math.sign(best.lane - s.lane) });
        lastInput = s.elapsed;
      } else if (mine) {
        const rule = AVOIDANCE[mine.kind];
        // Time the action to the hazard instead of firing it early.
        if ((rule.jump || rule.slide) && mine.z <= actWindow) {
          s = caveAction(s, rule.jump ? { type: "jump" } : { type: "slide" });
          lastInput = s.elapsed;
        }
      } else {
        const sheep = s.sheep.find(
          x => !x.taken && x.z > 14 && x.z < 52 && Math.abs(x.lane - s.lane) === 1 && scoreLane(x.lane) > 70,
        );
        if (sheep) {
          s = caveAction(s, { type: "move", dx: Math.sign(sheep.lane - s.lane) });
          lastInput = s.elapsed;
        }
      }
    }
    s = tickCave(s, 32);
  }
  return s;
}

test("a competent runner escapes the cave on every difficulty and opponent source", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    for (const opponent of [plan, adaptive]) {
      for (const seed of [17, 4200, 90125]) {
        const result = playCave(newCave(difficulty, opponent, false, seed));
        assert.equal(result.done, true, `${difficulty}/${opponent.source}/${seed} never finished`);
        assert.equal(
          result.won,
          true,
          `${difficulty}/${opponent.source}/${seed}: lost with ${result.hits} hits — "${result.feedback}"`,
        );
        assert.ok(result.score > 0, "a cleared run must score");
        assert.ok(result.ai.stats.decisions > 3, "the opponent should have made several decisions");
      }
    }
  }
});

test("standing still loses on every difficulty", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    let s = newCave(difficulty, adaptive, false, 321);
    for (let t = 0; t < 120000 && !s.done; t += 32) s = tickCave(s, 32);
    assert.equal(s.done, true, `${difficulty} never resolved`);
    assert.equal(s.won, false, `${difficulty}: doing nothing should not clear the cave`);
  }
});

test("hard lands more attacks than easy against the same passive player", () => {
  // Difficulty must be algorithmic, so hold the player constant and compare.
  const landed = difficulty => {
    let s = newCave(difficulty, adaptive, false, 555);
    // A player who sits in one lane: the predictive policy should punish this
    // far more reliably than the fixed rotation.
    for (let t = 0; t < 70000 && !s.done; t += 32) {
      s = tickCave(s, 32);
      s.hits = 0;
      s.obstacles = [];
      s.cyclops.gap = 60;
    }
    return { landed: s.ai.stats.attacksLanded, attacks: s.ai.stats.attacks };
  };
  const easy = landed("easy");
  const hard = landed("hard");
  assert.ok(hard.attacks > 0 && easy.attacks > 0, "both tiers must attack");
  assert.ok(
    hard.landed / hard.attacks > easy.landed / easy.attacks,
    `hard (${hard.landed}/${hard.attacks}) should beat easy (${easy.landed}/${easy.attacks}) against a stationary player`,
  );
});

test("the summary clamps into the shared attempt record's valid range", () => {
  let s = playCave(newCave("hard", adaptive, false, 17));
  const summary = caveSummary(s);
  assert.equal(summary.difficulty, "hard");
  assert.equal(summary.won, true);
  for (const key of ["hits", "successes", "misses", "early", "late"]) {
    assert.ok(Number.isInteger(summary[key]) && summary[key] >= 0 && summary[key] <= 100, `${key} out of range`);
  }
  assert.ok(Number.isInteger(summary.score) && summary.score <= 1000000);
  assert.ok(Number.isInteger(summary.timeMs) && summary.timeMs <= 3600000);
  assert.equal(summary.laneMs.length, 3);
  // A very long, very high-scoring run must still validate.
  const huge = caveSummary({ ...s, successes: 99999, score: 99999999, elapsed: 99999999, damageTaken: 400 });
  assert.equal(huge.successes, 100);
  assert.equal(huge.hits, 100);
  assert.equal(huge.score, 1000000);
  assert.equal(huge.timeMs, 3600000);
});
