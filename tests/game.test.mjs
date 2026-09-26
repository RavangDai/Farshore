import test from "node:test";
import assert from "node:assert/strict";
import {
  encounters,
  firstGame,
  storyDecision,
  applyDecision,
  advance,
  newGame,
  validSave,
  restoreSave,
  route,
  routeAfterChoice,
} from "../src/lib/game.ts";
import { chapterLore, mapStops, projectMap } from "../src/lib/odyssey.ts";
import { sceneArt, prologue } from "../src/lib/cast.ts";
const wind = encounters.find((e) => e.id === "winds");
test("PPT contrast: commands provoke refusal, supportive warning earns trust", () => {
  assert.equal(storyDecision(wind, "Do not open the bag.", 50).followed, false);
  const d = storyDecision(wind, "You are almost home. Do not risk it.", 50);
  assert.equal(d.followed, true);
  assert.equal(d.safeChoice, true);
});
test("A polite dangerous plan remains dangerous", () => {
  const d = storyDecision(wind, "Please open the bag so we can go home.", 50);
  assert.equal(d.followed, true);
  assert.equal(d.safeChoice, false);
});
test("A negated dangerous action is safe", () =>
  assert.equal(
    storyDecision(wind, "Please don't open the bag.", 50).safeChoice,
    true,
  ));
test("All safe turns reach home and decisions cannot count twice", () => {
  let g = newGame();
  for (let i = 0; i < g.route.length; i++) {
    const e = encounters.find((e) => e.id === g.route[i]);
    const d = storyDecision(e, "Friend, " + e.safe, 100);
    assert.equal(d.safeChoice, true, `${e.id}: ${d.reason}`);
    g = applyDecision(g, e, e.safe, d);
    assert.throws(() => applyDecision(g, e, e.safe, d));
    g = advance(g);
    assert.equal(validSave(g), true);
  }
  assert.equal(g.finished, true);
  assert.deepEqual(g.route, ["cicones", "lotus", "cyclops", "winds", "ithaca", "reunion"]);
  assert.equal(g.log.length, 6);
  assert.ok(g.months < 240);
});
test("Risky turns lose to the twenty-year benchmark and cannot continue", () => {
  let g = newGame();
  while (!g.finished) {
    const e = encounters.find((e) => e.id === g.route[g.index]);
    g = advance(
      applyDecision(
        g,
        e,
        "Obey me, fool.",
        storyDecision(e, "Obey me, fool.", g.trust),
      ),
    );
  }
  assert.ok(g.months >= 240);
  assert.throws(() =>
    applyDecision(g, wind, "anything", storyDecision(wind, "anything", 50)),
  );
});
test("Save validation rejects old versions and broken routes", () => {
  assert.equal(validSave(firstGame), true);
  assert.equal(validSave({ ...firstGame, version: 1 }), false);
  assert.equal(validSave({ ...firstGame, route: ["unknown"] }), false);
  assert.equal(validSave({ ...firstGame, index: 3 }), false);
  assert.equal(new Set(newGame().route).size, 15);
});

function playRoute(riskyAt = new Set()) {
  let game = newGame();
  while (!game.finished) {
    const encounter = encounters.find(e => e.id === game.route[game.index]);
    const text = `Friend, ${riskyAt.has(encounter.id) ? encounter.risk : encounter.safe}`;
    const decision = storyDecision(encounter, text, 100);
    assert.equal(decision.safeChoice, !riskyAt.has(encounter.id), `${encounter.id}: ${text}`);
    game = advance(applyDecision(game, encounter, text, decision));
    assert.equal(validSave(game), true);
  }
  return game;
}

test("the complete voyage follows Homer from Ismarus to recognition on Ithaca", () => {
  assert.deepEqual(route, ["cicones", "lotus", "cyclops", "winds", "laestrygonians", "circe", "underworld", "sirens", "scylla", "cattle", "calypso", "nausicaa", "phaeacians", "ithaca", "reunion"]);
  const game = playRoute(new Set(["winds", "cattle"]));
  assert.equal(game.log.length, 15);
  assert.equal(game.route.at(-1), "reunion");
  assert.ok(game.months < 240, "the longer route remains winnable");
  const wreck = game.log.find(e => e.encounterId === "cattle");
  assert.match(wreck.outcome, /Every remaining companion dies/);
  assert.match(encounters.find(e => e.id === "calypso").scene, /Alone/);
});

test("sparing the cattle preserves the companions and skips the solitary shipwreck episodes", () => {
  const game = playRoute(new Set(["winds"]));
  assert.ok(game.route.includes("laestrygonians"));
  assert.ok(game.route.includes("cattle"));
  for (const id of ["calypso", "nausicaa", "phaeacians"]) assert.ok(!game.route.includes(id), id);
  assert.deepEqual(game.route.slice(-2), ["ithaca", "reunion"]);
  assert.match(game.log.find(e => e.encounterId === "cattle").outcome, /companions sail toward Ithaca/);
});

test("every safe recommendation has a coherent scripted choice, including less-visited chapters", () => {
  for (const encounter of encounters) {
    const decision = storyDecision(encounter, `Friend, ${encounter.safe}`, 100);
    assert.equal(decision.safeChoice, true, encounter.id);
    assert.equal(decision.outcome, encounter.good);
    assert.ok(decision.reply.includes(encounter.safe.charAt(0).toLowerCase() + encounter.safe.slice(1)));
  }
});

test("branches keep the completed prefix and work independently of dialogue source", () => {
  const original = [...route];
  const index = route.indexOf("winds");
  assert.deepEqual(routeAfterChoice(route, index, true), [...route.slice(0, index + 1), "ithaca", "reunion"]);
  assert.deepEqual(routeAfterChoice(route, index, false), route);
  assert.deepEqual(route, original, "routing must not mutate the shared route");
  let game = newGame();
  while (game.route[game.index] !== "winds") {
    const encounter = encounters.find(e => e.id === game.route[game.index]);
    game = advance(applyDecision(game, encounter, "Friend, home.", storyDecision(encounter, `Friend, ${encounter.safe}`, 100)));
  }
  const next = applyDecision(game, wind, "Keep it sealed.", { ...storyDecision(wind, "Please keep it sealed.", 100), source: "ai" });
  assert.equal(next.route[next.index + 1], "ithaca");
  assert.throws(() => applyDecision(game, encounters.find(e => e.id === "calypso"), "Home", storyDecision(wind, "Please keep it sealed.", 100)));
});

test("old saves keep their counsel, scores, and current chapter while gaining future chapters", () => {
  const oldRoute = ["lotus", "cyclops", "winds", "circe", "underworld", "sirens", "scylla", "cattle", "calypso", "nausicaa", "ithaca"];
  const lotus = encounters.find(e => e.id === "lotus");
  const entry = { ...storyDecision(lotus, `Friend, ${lotus.safe}`, 100), encounterId: "lotus", advice: "My original counsel", at: 120 };
  const old = { version: 2, route: oldRoute, index: 1, months: 123, trust: 62, log: [entry], finished: false };
  const restored = restoreSave(old);
  assert.equal(restored.version, 3);
  assert.equal(restored.route[restored.index], "cyclops");
  assert.equal(restored.months, 123);
  assert.equal(restored.trust, 62);
  assert.deepEqual(restored.log, [entry]);
  assert.ok(restored.route.includes("laestrygonians"));
  assert.ok(restored.route.includes("phaeacians"));
  assert.ok(!restored.route.includes("cicones"), "do not replay missed events before the saved chapter");
  assert.equal(restored.route.at(-1), "reunion");
  assert.deepEqual(old.route, oldRoute, "do not mutate the old save");
  assert.equal(validSave(restored), true);
  assert.equal(restoreSave({ ...old, route: ["unknown"] }), null);
  assert.equal(restoreSave({ ...old, index: 99 }), null);
});

test("every chapter has artwork, source notes, and a map entry; the intro can change length", () => {
  assert.ok(prologue.length > 4);
  for (const page of prologue) assert.ok(page.book >= 1 && page.book <= 24 && page.caption);
  for (const id of route) {
    assert.ok(sceneArt[id], id);
    assert.ok(chapterLore[id]?.summary && chapterLore[id]?.difference, id);
    assert.equal(mapStops.filter(stop => stop.chapters.includes(id)).length, 1, id);
  }
  for (const stop of mapStops) {
    const [x, y] = projectMap(stop.lon, stop.lat);
    assert.ok(x >= 0 && x <= 1200 && y >= 0 && y <= 710, stop.name);
  }
});
