import test from "node:test";
import assert from "node:assert/strict";
import { gamePlan, trials, validPlan } from "../src/lib/arcade/arcade.ts";
import { createGame } from "../src/lib/arcade/arcade-runtime.ts";
import { detectMoment, factsFor } from "../src/lib/arcade/commentary.ts";
import { GAME_RULES_NOTE, openMenu, settle } from "../src/lib/arcade/decisions.ts";
import { mythicAction, newMythic, tickMythic } from "../src/lib/encounters/mythic.ts";
import { commentaryPrompt } from "../server/commentary.ts";
import { commentaryStats, emptyLog, logEvent, logLine, LOG_LIMIT, medalRule, roundHighlights, roundStats, timeline } from "../src/lib/arcade/report.ts";

const attempt = (won, extra = {}) => ({ won, source: "ai", hits: 0, successes: 0, early: 0, late: 0, misses: 0, laneMs: [0, 0, 0], ...extra });
const with_ = (state, change) => ({ ...state, ...change });
function advance(s, ms) { for (let t = 0; t < ms && !s.done; t += 50) s = tickMythic(s, 50); return s; }
function loose(s) { s = mythicAction(s, { type: "draw", held: true }); s = advance(s, 1000); return mythicAction(s, { type: "draw", held: false }); }

// -- The rival's tactic is the game's choice ------------------------------------

test("the game chooses a valid tactic for every trial, from the history alone", () => {
  for (const t of trials) {
    for (const recent of [[], [attempt(true)], [attempt(false), attempt(false)], [attempt(false), attempt(true)]]) {
      const { plan, reason } = gamePlan(t.id, recent);
      assert.ok(validPlan(t.id, plan), `${t.id} plan is valid`);
      assert.ok(reason.length > 10, `${t.id} says why`);
      assert.deepEqual(gamePlan(t.id, recent), { plan, reason }, "the same history gives the same tactic");
    }
  }
});

test("after two losses the rival plays its gentler tactic; otherwise the sharper one", () => {
  for (const t of trials.filter(t => t.id !== "sirens")) {
    assert.equal(gamePlan(t.id, [attempt(false), attempt(false)]).plan.planId, t.plans[1], t.id);
    assert.equal(gamePlan(t.id, [attempt(false), attempt(true)]).plan.planId, t.plans[2], t.id);
    assert.equal(gamePlan(t.id, []).plan.planId, t.plans[2], t.id);
  }
});

test("the Sirens lean on the lane you miss most; the cave hunts the lane you use most", () => {
  const sirens = gamePlan("sirens", [attempt(false, { laneMisses: [0, 0, 3, 1] })]);
  assert.equal(sirens.plan.planId, "swell");
  assert.match(sirens.reason, /green/);
  assert.equal(gamePlan("sirens", []).plan.planId, "echo");
  assert.equal(gamePlan("cyclops", [attempt(true, { laneMs: [100, 200, 9000] })]).plan.focus, "right");
});

// -- In play, the rival's picks are its own -----------------------------------------

test("a pick the game makes without asking a model gives no model excuse", () => {
  const menu = openMenu("bow-1", "Arrow 1", { score: "0" }, [{ id: "full", label: "Read the full draught", features: { axes: 9 }, score: 9 }], 0);
  assert.equal(settle({ menu, choice: null, failed: null }, false).chooser.note, GAME_RULES_NOTE);
  assert.match(settle({ menu, choice: null, failed: null }).chooser.note, /did not answer/, "a live model round still says why it fell back");
});

test("in a round without model decisions, Antinous shoots at once and his record never mentions a model", () => {
  let s = advance(newMythic("bow", "normal", gamePlan("bow", []).plan), 1500);
  s = loose(s);
  s = advance(s, 12000);
  assert.ok(s.rivalShots.length >= 1, "Antinous shot without waiting");
  for (const d of s.ai.decisions) assert.doesNotMatch(d.chooser?.note ?? "", /model/);
});

// -- Commentary is about what happened ------------------------------------------------

test("each encounter's own events reach the commentary with what happened", () => {
  const lotus = createGame("lotus", "normal", gamePlan("lotus", []).plan, false, 7);
  const rescue = detectMoment(lotus, with_(lotus, { rescued: 1, feedback: "1 of 3 sailors safe aboard." }));
  assert.equal(rescue.kind, "progress");
  assert.equal(rescue.detail, "1 of 3 sailors safe aboard.");

  let bow = advance(newMythic("bow", "normal", gamePlan("bow", []).plan), 1500);
  const before = bow;
  bow = advance(loose(bow), 200);
  const shot = detectMoment(before, bow);
  assert.match(shot.detail, /Odysseus' arrow 1 threads \d+ of 12 axes\. Odysseus \d+, Antinous 0\./);
  const waiting = bow;
  bow = advance(bow, 12000);
  const rival = detectMoment(waiting, with_(bow, { done: false, hits: waiting.hits, misses: waiting.misses, shots: waiting.shots }));
  assert.equal(rival.kind, "rival");
  assert.equal(rival.speaker, "rival");
  assert.match(rival.detail, /Antinous/);
});

test("the facts carry the event and, head to head, the rival's score", () => {
  const bow = with_(newMythic("bow", "normal", gamePlan("bow", []).plan), { score: 9, rivalScore: 11 });
  const facts = factsFor(bow, "status", "Odysseus' arrow 1 threads 9 of 12 axes.");
  assert.equal(facts.event, "Odysseus' arrow 1 threads 9 of 12 axes.");
  assert.equal(facts.rivalScore, 11);
  assert.equal(factsFor(createGame("lotus", "normal", gamePlan("lotus", []).plan, false, 7), "").rivalScore, null);
});

test("the prompt sets each encounter's tone and puts what happened first", () => {
  const facts = { score: 9, hits: 0, misses: 1, streak: 0, livesLeft: null, secondsLeft: null, progress: 20, status: "", event: "Antinous threads 10 axes.", rivalScore: 10 };
  const { system, user } = commentaryPrompt({ trialId: "bow", difficulty: "hard", moment: "rival", speaker: "rival", facts, recent: [] });
  assert.match(system, /Antinous/);
  assert.match(system, /Tone, for this encounter:\nBARD: .+\nRIVAL: .+/);
  assert.match(system, /Name the concrete thing/);
  assert.match(user, /^What happened: Antinous threads 10 axes\.$/m);
  assert.match(user, /rival score 10/);
  assert.match(user, /^Moment: The rival has just made its own play\.$/m);
});

// -- The round report ----------------------------------------------------------------------

test("every encounter reports the numbers that decided it", () => {
  for (const t of trials) {
    const s = { ...createGame(t.id, "normal", gamePlan(t.id, []).plan, false, 7), done: true, won: true };
    const rows = roundStats(s);
    assert.ok(rows.length >= 3, `${t.id} has stats`);
    for (const r of rows) assert.ok(r.label && r.value !== undefined && r.value !== "undefined" && r.value !== "NaN", `${t.id}: ${r.label}=${r.value}`);
    assert.match(medalRule(s), /gold needs none/);
    assert.ok(roundHighlights(s).length <= 200);
  }
  const practice = { ...createGame("lotus", "normal", gamePlan("lotus", []).plan, true, 7), done: true, won: true };
  assert.equal(medalRule(practice), "Practice rounds earn no medal.");
});

test("the timeline puts each line beside the event it was written for", () => {
  let log = emptyLog();
  log = logLine(log, { id: -1, speaker: "bard", text: "The garden waits.", moment: "start", at: 0 });
  log = logEvent(log, { at: 4000, kind: "hit", detail: "A guardian catches you." });
  log = logEvent(log, { at: 9000, kind: "progress", detail: "1 of 3 sailors safe aboard." });
  log = logLine(log, { id: 1, speaker: "bard", text: "One comes home.", moment: "progress", at: 9000, latencyMs: 2400 });
  const story = timeline(log);
  assert.deepEqual(story.map(e => e.kind), ["start", "hit", "progress"]);
  assert.equal(story[1].line, undefined, "no line was said about the hit");
  assert.equal(story[2].line.text, "One comes home.");
  assert.deepEqual(commentaryStats(log.lines), { total: 2, bard: 2, rival: 0, medianMs: 2400 });
});

test("a long round keeps its hits and its ending when the log fills", () => {
  let log = logEvent(emptyLog(), { at: 1, kind: "hit", detail: "struck" });
  for (let i = 0; i < LOG_LIMIT.events + 20; i++) log = logEvent(log, { at: 10 + i, kind: "score", detail: `score ${i}` });
  log = logEvent(log, { at: 9999, kind: "win", detail: "won" });
  assert.equal(log.events.length, LOG_LIMIT.events);
  assert.ok(log.events.some(e => e.kind === "hit"));
  assert.equal(log.events.at(-1).kind, "win");
});
