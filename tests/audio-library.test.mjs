import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { LINES, PLACES, SAMPLES, TRIAL_PLACE, UI_SAMPLES, ambienceUrl, lineUrl, musicUrl, pickFormat, sampleUrl } from "../src/lib/audio/library.ts";
import { voices } from "../src/lib/arcade/rivals.ts";
import { trials } from "../src/lib/arcade/arcade.ts";

const pack = JSON.parse(readFileSync(new URL("../docs/ai-eval/Farshore-Audio-Assets/audio-manifest.json", import.meta.url), "utf8"));
const status = JSON.parse(readFileSync(new URL("../public/audio/farshore/generation-status.json", import.meta.url), "utf8"));
const inPublic = url => existsSync(new URL(`../public${url}`, import.meta.url));

test("the registry carries the pack's scenes, narration, lines, subtitles and effects", () => {
  assert.deepEqual(Object.keys(PLACES).sort(), Object.keys(pack.scenes).sort());
  for (const [place, scene] of Object.entries(pack.scenes)) {
    assert.equal(PLACES[place].name, scene.name, place);
    assert.equal(PLACES[place].narration, scene.narration, `${place} narration`);
  }
  assert.deepEqual(Object.keys(LINES).sort(), Object.keys(pack.voices).sort());
  for (const [id, line] of Object.entries(pack.voices)) {
    assert.equal(LINES[id].subtitle, line.subtitle, `${id} subtitle`);
    assert.equal(LINES[id].role, line.role, `${id} role`);
  }
  assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(pack.sfx).sort());
});

test("each speaker has one consistent voice; narration is the bard's and the Oracle has its own", () => {
  const byRole = new Map();
  for (const [id, line] of Object.entries(LINES)) {
    assert.ok(line.voice in voices, `${id} speaks with a real voice`);
    if (byRole.has(line.role)) assert.equal(byRole.get(line.role), line.voice, `${line.role} keeps one voice`);
    byRole.set(line.role, line.voice);
  }
  assert.equal(byRole.get("Narrator"), "bard");
  assert.equal(byRole.get("Oracle"), "oracle");
  assert.deepEqual(Object.keys(TRIAL_PLACE).sort(), trials.map(t => t.id).sort());
});

test("every mastered file is in public/, in both formats", () => {
  for (const format of ["ogg", "mp3"]) {
    for (const place of Object.keys(PLACES)) {
      assert.ok(inPublic(musicUrl(place, format)), musicUrl(place, format));
      assert.ok(inPublic(ambienceUrl(place, format)), ambienceUrl(place, format));
    }
    for (const id of Object.keys(LINES)) assert.ok(inPublic(lineUrl(id, format)), lineUrl(id, format));
    for (const name of Object.keys(SAMPLES)) assert.ok(inPublic(sampleUrl(name, format)), sampleUrl(name, format));
  }
  for (const name of UI_SAMPLES) assert.ok(name in SAMPLES);
});

test("generation status records truthfully which assets were upgraded", () => {
  for (const id of Object.keys(LINES)) assert.match(status.voice[id], /Kokoro-82M/, id);
  for (const kind of ["music", "ambience", "sfx"]) for (const [name, note] of Object.entries(status[kind])) assert.match(note, /Original procedural starter/, `${kind}/${name} is still the starter`);
});

test("OGG where the browser decodes Vorbis, MP3 otherwise", () => {
  assert.equal(pickFormat(type => (type.includes("ogg") ? "probably" : "")), "ogg");
  assert.equal(pickFormat(() => ""), "mp3");
});
