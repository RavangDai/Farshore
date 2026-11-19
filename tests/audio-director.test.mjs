import test from "node:test";
import assert from "node:assert/strict";
import { COOLDOWN, LeadTracker, VoiceRules, hasHeard, markHeard, newVoyage, onceScope, readHeard, writeHeard } from "../src/lib/audio/director.ts";
import { IDENTITY, PLACE_SCENE, soundscape } from "../src/lib/audio/soundscape.ts";
import { PLACES, SAMPLES, TRIAL_PLACE } from "../src/lib/audio/library.ts";
import { sounds } from "../src/lib/audio/sounds.ts";
import { scenes } from "../src/lib/audio/ambience.ts";
import { audioFrame } from "../src/lib/audio/cues.ts";
import { createGame } from "../src/lib/arcade/arcade-runtime.ts";
import { standardPlan, trials } from "../src/lib/arcade/arcade.ts";
import { readMixer, writeMixer, defaultMixer } from "../src/lib/audio/mixer.ts";

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test("each screen has its music state, place and level; gameplay keeps the identity one-shots quiet", () => {
  assert.equal(soundscape("title", "lotus").state, "menu");
  assert.equal(soundscape("title", "lotus").music, "home");
  assert.equal(soundscape("map", "circe").music, "voyage-map");
  const carousel = soundscape("trials", "cyclops");
  assert.equal(carousel.state, "exploration");
  assert.equal(carousel.music, "voyage-map", "the carousel keeps one theme");
  assert.equal(carousel.ambience, "cyclops-cave", "but the ambience follows the island in view");
  const brief = soundscape("brief", "sirens"), play = soundscape("play", "sirens");
  assert.equal(brief.state, "introduction");
  assert.equal(brief.music, "sirens-passage");
  assert.ok(brief.musicLevel < play.musicLevel, "the introduction sits under the narration");
  assert.equal(play.identity, false);
  assert.equal(soundscape("result", "aeolus", "victory").state, "victory");
  assert.equal(soundscape("result", "aeolus", "defeat").state, "defeat");
  assert.ok(soundscape("result", "aeolus", "defeat").musicLevel < 0.6);
  assert.equal(soundscape("ending", "bow").music, "ithaca");
  for (const t of trials) assert.equal(soundscape("brief", t.id).ambience, TRIAL_PLACE[t.id]);
});

test("every island has its own identity, built from real sounds", () => {
  for (const [place, shots] of Object.entries(IDENTITY)) {
    assert.ok(place in PLACES && place in PLACE_SCENE, place);
    assert.ok(PLACE_SCENE[place] in scenes);
    for (const shot of shots) {
      for (const s of [shot, shot.then].filter(Boolean)) {
        assert.ok((s.sound && s.sound in sounds) || (s.sample && s.sample in SAMPLES), `${place}: ${s.sound ?? s.sample}`);
      }
      assert.ok(shot.every[0] > 1 && shot.every[0] <= shot.every[1], `${place} paces its one-shots`);
      assert.ok(shot.gain[1] <= 0.45, `${place} one-shots stay in the background`);
    }
  }
  const signature = place => JSON.stringify([PLACE_SCENE[place], IDENTITY[place].map(s => s.sound ?? s.sample)]);
  const trialsOnly = Object.values(TRIAL_PLACE);
  assert.equal(new Set(trialsOnly.map(signature)).size, trialsOnly.length, "no two islands sound alike");
});

test("narration is heard once: the intro per device, each chapter and the homecoming per voyage", () => {
  assert.equal(onceScope("intro"), "device");
  assert.equal(onceScope("cyclops-cave"), "voyage");
  assert.equal(onceScope("homecoming"), "voyage");
  assert.equal(onceScope("victory"), null);
  assert.equal(onceScope("oracle-ready"), null);
  const storage = memory();
  let heard = readHeard(storage);
  assert.equal(hasHeard(heard, "intro"), false);
  heard = markHeard(markHeard(markHeard(heard, "intro"), "aeolus"), "victory");
  writeHeard(heard, storage);
  heard = readHeard(storage);
  assert.ok(hasHeard(heard, "intro") && hasHeard(heard, "aeolus"));
  assert.equal(hasHeard(heard, "victory"), false, "an outcome is never marked as heard");
  heard = newVoyage(heard);
  assert.ok(hasHeard(heard, "intro"), "a new voyage keeps the intro heard");
  assert.equal(hasHeard(heard, "aeolus"), false, "and hears its chapters again");
  storage.setItem("farshore-narration-v1", "{\"device\":[\"intro\",\"nonsense\"],\"voyage\":7}");
  assert.deepEqual(readHeard(storage), { device: ["intro"], voyage: [] });
});

test("the Oracle and the characters keep their cooldowns", () => {
  const rules = new VoiceRules();
  assert.ok(rules.allow("oracle-ready", 0));
  rules.record("oracle-ready", 0);
  assert.equal(rules.allow("oracle-path", 10), false, "two Oracle lines need a breath between them");
  assert.ok(rules.allow("oracle-path", COOLDOWN.oracle));
  assert.equal(rules.allow("oracle-ready", COOLDOWN.oracle), false, "the same announcement waits longer");
  assert.ok(rules.allow("oracle-ready", COOLDOWN.oracleSame));
  rules.record("sailor-rescued", 100);
  assert.equal(rules.allow("sailor-rescued", 105), false);
  assert.ok(rules.allow("sailor-rescued", 100 + COOLDOWN.character));
  rules.record("victory", 200);
  assert.equal(rules.allow("defeat", 205), false, "outcomes share one cooldown");
  assert.ok(rules.allow("cyclops-cave", 200), "chapter narration has no cooldown (it plays once anyway)");
});

test("a lead change is announced only once it holds, never in the opening seconds, and never a tie", () => {
  const lead = new LeadTracker(0);
  assert.equal(lead.update("player", 0.5), null, "the opening seconds are quiet");
  assert.equal(lead.update("player", 2), null);
  assert.equal(lead.update("player", 3.4), "oracle-player-lead");
  assert.equal(lead.update("player", 9), null, "said once");
  assert.equal(lead.update("rival", 10), null);
  assert.equal(lead.update("player", 10.5), null, "a flicker resets the hold");
  assert.equal(lead.update("rival", 11), null);
  assert.equal(lead.update("rival", 12.5), null, "and the gap since the last announcement still applies");
  assert.equal(lead.update("rival", 18.5), "oracle-rival-lead");
  assert.equal(lead.update("even", 40), null);
  assert.equal(lead.update("even", 50), null, "a tie is never announced");
});

test("only rivals that really keep score report a lead", () => {
  for (const t of trials) {
    const state = createGame(t.id, "normal", standardPlan(t.id), false, 7);
    const frame = audioFrame(null, state);
    if (t.id === "circe" || t.id === "bow") assert.equal(frame.lead, "even", t.id);
    else assert.equal(frame.lead, undefined, `${t.id} has no scoring rival`);
  }
});

test("the mixer is remembered per device and bounded", () => {
  const storage = memory();
  assert.deepEqual(readMixer(storage), defaultMixer);
  writeMixer({ ...defaultMixer, master: 0.4, narration: false }, storage);
  assert.equal(readMixer(storage).master, 0.4);
  assert.equal(readMixer(storage).narration, false);
  storage.setItem("farshore-mixer-v1", "{\"master\":7,\"ui\":-1,\"subtitles\":\"yes\"}");
  assert.deepEqual(readMixer(storage), defaultMixer);
});
