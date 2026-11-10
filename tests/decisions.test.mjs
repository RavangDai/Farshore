import test from "node:test";
import assert from "node:assert/strict";
import { acceptChoice, allowedNumbers, DecisionDirector, groundedNumbers, openMenu, requestFor, settle } from "../src/lib/arcade/decisions.ts";
import { adaptivePlan, standardPlan } from "../src/lib/arcade/arcade.ts";
import { BOW, archeryShot, bestAim, bowPhysics, mythicAction, newMythic, tickMythic } from "../src/lib/encounters/mythic.ts";
import { blockTargets, bowMenu } from "../src/lib/ai/antinous.ts";
import { boardStrategy } from "../src/lib/ai/ithaca.ts";
import { POST as decidePOST, decisionPrompt, verifyChoice } from "../server/decide.ts";
import { mockDecision } from "../server/lib/mock-ai.ts";
import { caveAction, caveChoice, newCave, tickCave } from "../src/lib/encounters/cave-runner.ts";
import { doctrineOfPlan, doctrinesFor } from "../src/lib/ai/cyclops.ts";
import { debriefRequest } from "../src/lib/arcade/debrief.ts";
import { SONG_REST_MS, SONG_WAIT_MS, songBeat } from "../src/lib/encounters/mythic.ts";
import { BEAT_CEIL_MS, BEAT_FLOOR_MS, MAX_NOTES, MIN_NOTES, WEAVE_MAX_SHARE, answerableNotes, perNoteBudgetMs, proposalFor } from "../src/lib/ai/sirens.ts";

function advance(s, ms) { for (let elapsed = 0; elapsed < ms && !s.done; elapsed += 50) s = tickMythic(s, Math.min(50, ms - elapsed)); return s; }
function loose(s, aim) {
  if (aim) for (const field of ["aim", "elevation"]) s = mythicAction(s, { type: "aim", field, value: aim[field] });
  s = mythicAction(s, { type: "draw", held: true });
  s = advance(s, 1000);
  return mythicAction(s, { type: "draw", held: false });
}
const menuOf = () => openMenu("bow-1", "Antinous' arrow 1 of 5", { score: "Odysseus 9, Antinous 0" }, [
  { id: "full", label: "Read the full draught", features: { "expected axes": 9.4 }, score: 9.4 },
  { id: "block-6", label: "Lodge an arrow in axe 6", features: { "expected axes": 5.8 }, score: 7.1 },
], 1000);

test("numbers in a reason must come from the facts; decimals may be rounded, nothing may be invented", () => {
  const allowed = allowedNumbers({ "expected axes": 8.4, score: "Odysseus 17, Antinous 15" });
  assert.equal(groundedNumbers("I expect 8.4 axes, about 8, while you lead 17 to 15.", allowed).ok, true);
  const invented = groundedNumbers("I will thread all 12.", allowed);
  assert.equal(invented.ok, false);
  assert.deepEqual(invented.stray, ["12"]);
});

test("a choice only lands on its own menu, and only as one of that menu's options", () => {
  const pending = { menu: menuOf(), choice: null, failed: null };
  assert.equal(pending.menu.enginePick, "full", "the game's own pick is its highest score");
  const choice = { menuId: "bow-1", optionId: "block-6", reason: "r", line: "", latencyMs: 900, model: "m" };
  assert.equal(acceptChoice(pending, { type: "choose", choice: { ...choice, menuId: "bow-0" } }).choice, null, "a stale answer is ignored");
  assert.equal(acceptChoice(pending, { type: "choose", choice: { ...choice, optionId: "perfect-shot" } }).choice, null, "an option the game never offered is ignored");
  const accepted = acceptChoice(pending, { type: "choose", choice });
  assert.equal(accepted.choice.optionId, "block-6");
  assert.equal(acceptChoice(accepted, { type: "choose-failed", menuId: "bow-1", why: "timeout" }).failed, null, "a settled pick is not undone");
  const failed = acceptChoice(pending, { type: "choose-failed", menuId: "bow-1", why: "invalid" });
  assert.equal(failed.failed, "invalid");
});

test("settling names who chose: the model's pick beside the game's own, or the game's pick with the reason", () => {
  const model = settle({ menu: menuOf(), choice: { menuId: "bow-1", optionId: "block-6", reason: "Narrow his line.", line: "Mind axe six.", latencyMs: 1200, model: "qwen3:14b" }, failed: null });
  assert.equal(model.option.id, "block-6");
  assert.deepEqual([model.chooser.by, model.chooser.agreed, model.chooser.enginePick, model.chooser.model], ["model", false, "Read the full draught", "qwen3:14b"]);
  const game = settle({ menu: menuOf(), choice: null, failed: "timeout" });
  assert.equal(game.option.id, "full");
  assert.equal(game.chooser.by, "game");
  assert.match(game.chooser.note, /did not answer in time/);
  assert.match(game.reason, /Game's pick/);
});

test("the model never sees the game's own scores, only labels and measured features", () => {
  const body = requestFor(menuOf(), "bow", "normal", ["one", "two", "three", "four"]);
  assert.deepEqual(Object.keys(body.options[0]).sort(), ["features", "id", "label"]);
  assert.equal(body.recent.length, 3);
  assert.equal(JSON.stringify(body).includes("7.1"), false);
});

test("Antinous' menus keep their promises on every tier, across many draughts and lines", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    for (let seed = 1; seed <= 40; seed++) {
      let s = newMythic("bow", difficulty, adaptivePlan("bow"), false, seed * 7907);
      const ideal = bestAim(s.wind, 0, difficulty);
      s = loose(s, { ...ideal, aim: ideal.aim + ((seed % 7) - 3) * 0.6 });
      const menu = s.decision.menu, physics = bowPhysics(s);
      assert.ok(menu.options.length >= 2, `${difficulty} ${seed}: a real choice`);
      assert.ok(menu.options.some(o => o.id === "full"), "the wind reader can always read the full draught");
      const blocks = menu.options.filter(o => o.id.startsWith("block-"));
      if (difficulty === "easy") assert.equal(blocks.length, 0, "easy never lodges an arrow");
      assert.ok(blocks.length <= (difficulty === "hard" ? 2 : 1));
      for (const option of blocks) {
        const axe = Number(option.id.slice(6));
        assert.ok(axe >= 2, "at least one axe stays clear before the narrowed one");
        // Replayed through the real flight, the narrowed axe really costs the line.
        assert.ok(archeryShot(s.shot.aim, s.wind, axe, "rival", difficulty).rings < archeryShot(s.shot.aim, s.wind, 0, "rival", difficulty).rings);
        assert.ok(option.features["expected axes"] <= 6, "a block shot's own count is capped");
      }
      const boast = menu.options.find(o => o.id === "boast");
      assert.equal(!!boast, boardStrategy(s.score, s.rivalScore).strategy === "guard", "pride only when he leads comfortably");
      for (const option of menu.options) assert.ok(Number.isFinite(option.features["expected axes"]));
      assert.deepEqual(blockTargets({ ...menuView(s), playerAim: s.shot.aim }, physics).slice(0, blocks.length).map(t => `block-${t.axe}`), blocks.map(b => b.id));
    }
  }
  // No block on the last arrow: there is no next shot for it to narrow.
  let last = newMythic("bow", "hard", adaptivePlan("bow"), false, 31);
  last = { ...last, turn: BOW.turns };
  last = loose(last, bestAim(last.wind, 0, "hard"));
  assert.equal(last.decision.menu.options.some(o => o.id.startsWith("block-")), false);
  // The unsteady suitor cannot read the full draught at all.
  const unsteady = loose(newMythic("bow", "normal", standardPlan("bow")));
  assert.equal(unsteady.decision.menu.options.some(o => o.id === "full"), false);
});
const menuView = s => ({ difficulty: s.difficulty, planId: s.plan.planId, turn: s.turn, score: s.score, rivalScore: s.rivalScore, wind: s.wind, seed: s.seed });

test("menus are measured from a private seed: building one never changes how the contest plays", () => {
  const a = loose(newMythic("bow", "hard", adaptivePlan("bow"), false, 99));
  const view = { ...menuView(a), playerAim: a.shot.aim };
  const first = bowMenu(view, bowPhysics(a), "x", 0), second = bowMenu(view, bowPhysics(a), "x", 0);
  assert.deepEqual(first, second);
  assert.equal(a.seed, loose(newMythic("bow", "hard", adaptivePlan("bow"), false, 99)).seed);
});

test("a live contest waits for the model, then plays the game's own pick and says so", () => {
  let s = loose(newMythic("bow", "normal", adaptivePlan("bow"), false, 4200, { modelDecisions: true }));
  s = advance(s, BOW.flightMs + BOW.resultMs + BOW.rivalAimMs + 200);
  assert.equal(s.rivalShots.length, 0, "Antinous holds his aim while the model decides");
  assert.ok(s.decision && !s.decision.choice, "the menu is still open");
  s = advance(s, BOW.decisionWaitMs);
  assert.equal(s.rivalShots.length, 1);
  const decision = s.ai.decisions.at(-1);
  assert.equal(decision.chooser.by, "game");
  assert.match(decision.chooser.note, /did not answer in time/);
  assert.equal(s.ai.stats.gamePicks, 1);
});

test("a model's pick is executed as chosen and counted against the game's own", () => {
  let s = loose(newMythic("bow", "hard", adaptivePlan("bow"), false, 4200, { modelDecisions: true }));
  const menu = s.decision.menu, other = menu.options.find(o => o.id !== menu.enginePick);
  s = mythicAction(s, { type: "choose", choice: { menuId: menu.id, optionId: other.id, reason: "Because.", line: "Watch this, beggar.", latencyMs: 1500, model: "test-model" } });
  s = advance(s, BOW.flightMs + BOW.resultMs + BOW.rivalAimMs + 100);
  assert.equal(s.rivalShots.length, 1, "an answer in time means no extra wait");
  const decision = s.ai.decisions.at(-1);
  assert.equal(decision.selectedCandidate, other.label);
  assert.deepEqual([decision.chooser.by, decision.chooser.agreed, decision.chooser.model], ["model", false, "test-model"]);
  assert.equal(decision.candidates.find(c => c.chosen).action, other.label);
  assert.deepEqual([s.ai.stats.modelPicks, s.ai.stats.modelAgreed], [1, 0]);
  // A failure ends the wait at once.
  let f = loose(newMythic("bow", "normal", adaptivePlan("bow"), false, 4200, { modelDecisions: true }));
  f = mythicAction(f, { type: "choose-failed", menuId: f.decision.menu.id, why: "unreachable" });
  f = advance(f, BOW.flightMs + BOW.resultMs + BOW.rivalAimMs + 100);
  assert.equal(f.rivalShots.length, 1);
  assert.match(f.ai.decisions.at(-1).chooser.note, /could not be reached/);
});

test("a block shot is judged by what it really cost the next arrow", () => {
  let s = newMythic("bow", "normal", adaptivePlan("bow"), false, 4200, { modelDecisions: true });
  const ideal = bestAim(s.wind, 0, s.difficulty);
  s = loose(s, { ...ideal, aim: ideal.aim + 1.2 });
  const block = s.decision.menu.options.find(o => o.id.startsWith("block-"));
  assert.ok(block);
  s = mythicAction(s, { type: "choose", choice: { menuId: s.decision.menu.id, optionId: block.id, reason: "r", line: "", latencyMs: 1 } });
  while (s.phase !== "player") s = advance(s, 100);
  s = loose(s, bestAim(s.wind, s.blocked, s.difficulty));
  assert.equal(s.ai.stats.attacks, 1);
  assert.ok(s.ai.events.some(e => e.stage === "learn" && /lodged in axe/.test(e.text)));
});

// ---------------------------------------------------------------------------
// The decision endpoint.
// ---------------------------------------------------------------------------

const valid = {
  kind: "choose",
  trialId: "bow",
  difficulty: "normal",
  point: "Antinous' arrow 2 of 5",
  facts: { score: "Odysseus 9, Antinous 8", "arrows after this one": 3 },
  options: [
    { id: "full", label: "Read the full draught", features: { "expected axes": 9.4 } },
    { id: "block-6", label: "Lodge an arrow in axe 6", features: { "expected axes": 5.8, narrows: "axe 6" } },
  ],
  recent: [],
};
const post = (body, origin) => new Request("http://localhost:5173/api/decide", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
async function withModel(callback, mock) {
  const keys = ["FARSHORE_MODEL_URL", "FARSHORE_MODEL_NAME", "FARSHORE_API_KEY"];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]])), oldFetch = globalThis.fetch;
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, { FARSHORE_MODEL_URL: "http://127.0.0.1:11434/v1/chat/completions", FARSHORE_MODEL_NAME: "qwen3:14b" });
  globalThis.fetch = mock;
  try { await callback(); } finally {
    globalThis.fetch = oldFetch;
    for (const k of keys) if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k];
  }
}
const reply = content => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });

test("the decision schema only admits the menu's own ids, and the prompt keeps the game's scores out", async () => {
  let sent;
  await withModel(async () => {
    const response = await decidePOST(post(valid));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { optionId: "block-6", reason: "Narrow axe 6 while the score is 9 to 8.", line: "Mind the sixth axe, beggar.", model: "qwen3:14b" });
  }, async (url, init) => {
    sent = JSON.parse(init.body);
    return reply({ optionId: "block-6", reason: "Narrow axe 6 while the score is 9 to 8.", line: "Mind the sixth axe, beggar." });
  });
  assert.deepEqual(sent.response_format.json_schema.schema.properties.optionId.enum, ["full", "block-6"]);
  assert.equal(sent.temperature, 0.2);
  assert.match(sent.messages[1].content, /block-6: Lodge an arrow in axe 6 \(expected axes 5\.8; narrows axe 6\)/);
  const { system } = decisionPrompt(valid);
  assert.equal(decisionPrompt({ ...valid, point: "Antinous' arrow 4 of 5" }).system, system, "one cacheable system prompt per encounter");
});

test("an off-menu pick is refused; invented numbers and spoken numbers are corrected and flagged", async () => {
  await withModel(async () => assert.equal((await decidePOST(post(valid))).status, 422), async () => reply({ optionId: "perfect", reason: "r", line: "l" }));
  const fixed = verifyChoice(valid, { optionId: "full", reason: "I will thread all 12 axes.", line: "Twelve axes, 12 times over." });
  assert.equal(fixed.reason, "Chose Read the full draught.");
  assert.equal(fixed.line, "");
  assert.match(fixed.edited, /quoted 12/);
  assert.equal(verifyChoice(valid, { optionId: "nope", reason: "x", line: "y" }), null);
});

test("bad decision requests and foreign origins never reach the model; failures are typed", async () => {
  await withModel(async () => {
    assert.equal((await decidePOST(post({ ...valid, options: [valid.options[0]] }))).status, 400, "a menu of one is not a choice");
    assert.equal((await decidePOST(post({ ...valid, options: [valid.options[0], valid.options[0]] }))).status, 400, "ids must be unique");
    assert.equal((await decidePOST(post({ ...valid, trialId: "lotus" }))).status, 400, "only the three focus encounters decide live");
    assert.equal((await decidePOST(post(valid, "https://example.com"))).status, 403);
  }, async () => assert.fail("contacted the model"));
  await withModel(async () => assert.equal((await decidePOST(post(valid))).status, 429), async () => Response.json({}, { status: 429 }));
  await withModel(async () => assert.equal((await decidePOST(post(valid))).status, 503), async () => { throw new TypeError("offline"); });
});

test("the debrief may only quote numbers it was given", async () => {
  const debrief = { kind: "debrief", trialId: "bow", difficulty: "hard", won: false, facts: { "your total": 41, "his total": 44 }, picks: [{ point: "Antinous' arrow 2 of 5", label: "Lodge an arrow in axe 6", by: "model", outcome: "cost you 2 axes" }] };
  await withModel(async () => {
    const ok = await decidePOST(post(debrief));
    assert.equal(ok.status, 200);
    assert.match((await ok.json()).text, /44 to 41/);
  }, async () => reply({ text: "I won 44 to 41, beggar, and the arrow in axe 6 cost you 2 axes." }));
  await withModel(async () => assert.equal((await decidePOST(post(debrief))).status, 422), async () => reply({ text: "You missed 9 shots, beggar, and I threaded every one of mine." }));
});

test("the director asks once per menu and turns every answer, or failure, into an engine action", async () => {
  const actions = [];
  let calls = 0;
  const director = new DecisionDirector({
    trialId: "bow", difficulty: "normal", onAction: a => actions.push(a),
    fetcher: async () => { calls++; return calls === 1 ? Response.json({ optionId: "full", reason: "Steady.", line: "Watch.", model: "m" }) : Response.json({ error: "x" }, { status: 422 }); },
  });
  const menu = menuOf();
  director.offer(menu); director.offer(menu);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls, 1, "the same menu is asked about once");
  assert.equal(actions[0].type, "choose");
  assert.equal(actions[0].choice.optionId, "full");
  director.reset(); director.offer(menu);
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(actions[1], { type: "choose-failed", menuId: "bow-1", why: "invalid" });
});

test("the mock AI service rotates through the menu and fails on request", async () => {
  const request = () => new Request("http://localhost/api/decide", { method: "POST", body: JSON.stringify(valid) });
  const first = await (await mockDecision(request(), "success")).json();
  const second = await (await mockDecision(request(), "success")).json();
  assert.notEqual(first.optionId, second.optionId);
  assert.match(first.model, /mock/);
  assert.equal((await mockDecision(request(), "error")).status, 503);
  assert.equal((await mockDecision(request(), "uncertain")).status, 422);
});

// ---------------------------------------------------------------------------
// The Sirens.
// ---------------------------------------------------------------------------

/** Play one melody: echo it, missing the given lane whenever it appears. */
function playMelody(s, missLane = -1) {
  s = advance(s, s.notes.length * songBeat(s) + 600);
  for (const n of s.notes.filter(n => !n.rest)) s = mythicAction(s, { type: "note", lane: n.lane === missLane ? (n.lane + 1) % 4 : n.lane });
  return s;
}

test("every melody on the Sirens' menu keeps the controller's fairness bounds", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    for (const planId of ["swell", "echo"]) {
      for (let seed = 1; seed <= 6; seed++) {
        let s = newMythic("sirens", difficulty, { ...adaptivePlan("sirens"), planId }, false, seed * 613);
        for (let round = 0; round < 4 && !s.done; round++) {
          s = playMelody(s, seed % 4);
          if (s.done) break;
          const menu = s.decision?.menu;
          assert.ok(menu, `${difficulty} ${planId} ${seed}: a menu between melodies`);
          assert.ok(menu.options.length >= 2 && menu.options.length <= 4);
          const { budget } = perNoteBudgetMs(s.model);
          for (const option of menu.options) {
            const proposal = proposalFor(s.composition, option.id);
            assert.ok(proposal && !proposal.withheld, "a withheld melody never reaches the model");
            const asks = proposal.notes.filter(n => !n.rest).length;
            assert.ok(proposal.notes.length >= MIN_NOTES && proposal.notes.length <= MAX_NOTES);
            assert.ok(proposal.beatMs >= BEAT_FLOOR_MS && proposal.beatMs <= BEAT_CEIL_MS, "tempo stays readable");
            assert.ok(answerableNotes(proposal.notes, proposal.beatMs, budget) >= asks, "the reply window admits every note asked");
            if (proposal.id === "sing:weave") {
              const weak = s.composition.weakest, onWeak = proposal.notes.filter(n => !n.rest && n.lane === weak).length;
              assert.ok(onWeak <= Math.max(1, Math.floor(asks * WEAVE_MAX_SHARE)), "a weave never puts more than half a melody on your weakest lane");
            }
          }
          s = advance(s, 1800);
        }
      }
    }
  }
});

test("a live passage waits for the model between melodies, then sings its pick, or the controller's own", () => {
  let s = newMythic("sirens", "hard", adaptivePlan("sirens"), false, 4200, { modelDecisions: true });
  assert.equal(s.phase, "rest", "the first melody is chosen during the title card");
  s = advance(s, 200);
  assert.equal(s.phase, "rest", "and play waits for it");
  s = advance(s, SONG_WAIT_MS);
  assert.equal(s.phase, "listen");
  assert.equal(s.ai.decisions.at(-1).chooser.by, "game");
  s = playMelody(s, s.notes[0].lane);
  const menu = s.decision.menu, pick = menu.options.at(-1);
  s = mythicAction(s, { type: "choose", choice: { menuId: menu.id, optionId: pick.id, reason: "Let him drown in it.", line: "Sing with us.", latencyMs: 800, model: "test-model" } });
  s = advance(s, SONG_REST_MS + 100);
  assert.equal(s.phase, "listen", "an answer in time means no extra wait");
  const sung = s.ai.decisions.at(-1);
  assert.equal(sung.chooser.by, "model");
  assert.equal(sung.selectedCandidate, proposalFor({ proposals: sung.candidates.map(c => ({ id: c.action })) }, pick.id)?.id ?? sung.selectedCandidate);
  assert.equal(s.rivalLine, "Sing with us.");
  assert.match(sung.reason, /^Let him drown in it\. Sung at \d+ ms per note/, "the game's promised window always follows the model's reason");
});

// ---------------------------------------------------------------------------
// Polyphemus' section plans.
// ---------------------------------------------------------------------------

const cavePlan = planId => ({ planId, focus: "center", source: "ai" });
/** Run a live cave with an untouchable runner who weaves between lanes, answering menus with `answer`. */
function runCave(difficulty, planId, seed, answer = () => null) {
  let s = newCave(difficulty, cavePlan(planId), false, seed, { modelDecisions: true });
  const menus = [];
  for (let t = 0; !s.done && t < 120000; t += 50) {
    s.invulnerable = 1e9; s.cyclops.gap = Math.max(s.cyclops.gap, 40);
    s = tickCave(s, 50);
    const menu = s.decision && !s.decision.choice && !s.decision.failed ? s.decision.menu : null;
    if (menu && !menus.some(m => m.id === menu.id)) {
      menus.push(structuredClone(menu));
      const optionId = answer(menu);
      if (optionId) s = caveChoice(s, { type: "choose", choice: { menuId: menu.id, optionId, reason: "r", line: "", latencyMs: 1, model: "m" } });
    }
    if (t % 1700 === 0) s = caveAction(s, { type: "move", dx: ((t / 1700) % 3) - 1 });
  }
  return { s, menus };
}

test("the briefing plan sets the cave's first doctrine, within what the difficulty allows", () => {
  assert.equal(doctrineOfPlan("sweep", "hard"), "cutoff");
  assert.equal(doctrineOfPlan("focused", "hard"), "hunt", "lane pursuit hunts the current lane");
  assert.equal(doctrineOfPlan("sweep", "easy"), "hunt", "easy never forecasts");
  assert.equal(doctrineOfPlan("alternating", "easy"), "rotation");
  assert.equal(doctrineOfPlan("alternating", "hard"), "hunt", "hard has no fixed rotation");
  assert.equal(newCave("hard", cavePlan("sweep"), false, 1, { modelDecisions: true }).doctrine, "cutoff");
  assert.equal(newCave("hard", cavePlan("sweep")).doctrine, null, "the engine on its own keeps the tier's policy");
});

test("each section is planned from the tier's doctrines, and the pick takes over at the boundary", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const { s, menus } = runCave(difficulty, "sweep", 4242, menu => (menu.id === "cave-daylight" ? menu.options.at(-1).id : null));
    assert.deepEqual(menus.map(m => m.id), ["cave-collapse", "cave-daylight"], difficulty);
    for (const menu of menus) {
      assert.deepEqual(menu.options.map(o => o.id), doctrinesFor(difficulty), "only the doctrines the difficulty allows");
      assert.ok(menu.openedAt < (menu.id === "cave-collapse" ? 0.4 : 0.78) * s.duration, "planned before the section begins");
    }
    assert.equal(s.plans.length, 2);
    assert.equal(s.plans[0].by, "game", "no answer by the boundary: the game's own pick, labelled");
    assert.equal(s.plans[1].by, "model");
    assert.equal(s.doctrine, doctrinesFor(difficulty).at(-1));
    assert.ok(s.plans.every(p => p.outcome !== "in progress"), "each plan is judged by what it achieved");
  }
});

test("under every doctrine, a committed throw always leaves an action-free escape lane", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    for (const doctrine of doctrinesFor(difficulty)) {
      for (let seed = 1; seed <= 4; seed++) {
        const { s } = runCave(difficulty, "sweep", seed * 977, () => doctrine);
        const throws = s.ai.decisions.filter(d => d.selectedCandidate?.startsWith("boulder:"));
        for (const d of throws) assert.ok(d.safety.actionFree >= 1, `${difficulty} ${doctrine} ${seed}`);
        if (doctrine === "press" && throws.some(d => d.candidates.some(c => /weakest lane/.test(c.note ?? "")))) {
          assert.ok(throws.some(d => d.candidates.some(c => /\+24 weakest lane/.test(c.note ?? ""))), "the weak-spot doctrine doubles the weak-lane bonus");
        }
      }
    }
  }
});

test("the debrief carries only the game's own measurements and the picks it recorded", () => {
  const { s } = runCave("hard", "sweep", 4242, menu => menu.options[0].id);
  const cave = debriefRequest(s);
  assert.equal(cave.trialId, "cyclops");
  assert.equal(cave.facts["boulders thrown"], s.ai.stats.attacks);
  assert.equal(cave.picks.length, 2);
  assert.match(cave.picks[0].point, /collapsing hall/);
  let bow = newMythic("bow", "normal", adaptivePlan("bow"), false, 991);
  for (let guard = 0; !bow.done && guard < 400; guard++) bow = bow.phase === "player" ? loose(bow, bestAim(bow.wind, bow.blocked, bow.difficulty)) : advance(bow, 500);
  const contest = debriefRequest(bow);
  assert.deepEqual([contest.facts["your total"], contest.facts["his total"]], [bow.score, bow.rivalScore]);
  assert.equal(contest.picks.length, 5);
  assert.match(contest.picks[0].point, /^Arrow 1 of 5$/);
  assert.equal(debriefRequest(newMythic("circe", "normal", adaptivePlan("circe"))), null, "only the three focus encounters debrief");
});
