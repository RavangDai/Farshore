// Renders the audio pack's 21 voice lines with the game's own Kokoro-82M
// voices (the same engine, voices and clean-up as live speech), replacing the
// pack's basic Flite starters. Free and offline once the model is cached.
//
//   node --experimental-strip-types scripts/audio/render-voices.mjs [line-id ...]
//
// Writes 24 kHz mono WAV masters to .cache/audio-build/voice; then
// scripts/audio/master_audio.py masters them into public/audio/farshore.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createKokoroEngine } from "../../server/lib/kokoro.ts";
import { encodeWav, prepareSpeech } from "../../server/lib/wav.ts";
import { LINES } from "../../src/lib/audio/library.ts";
import { voices } from "../../src/lib/arcade/rivals.ts";
import { pronounce } from "../../src/lib/speech/lexicon.ts";
import { pauseAfter, sentences } from "../../src/lib/speech/sentences.ts";

const out = path.join(process.cwd(), ".cache", "audio-build", "voice");
await mkdir(out, { recursive: true });
const only = new Set(process.argv.slice(2));
const engine = await createKokoroEngine();

for (const [id, line] of Object.entries(LINES)) {
  if (only.size && !only.has(id)) continue;
  const profile = voices[line.voice];
  const started = performance.now();
  const parts = [];
  // Narration breathes a little longer between sentences than live commentary does.
  const breath = line.kind === "narration" ? 1.8 : 1.2;
  for (const piece of sentences(line.subtitle)) {
    const raw = await engine.synthesize(pronounce(piece), profile.kokoro, profile.speed);
    parts.push(prepareSpeech(raw, engine.sampleRate));
    parts.push(new Float32Array(Math.round(engine.sampleRate * pauseAfter(piece) * breath)));
  }
  parts.pop();
  const total = parts.reduce((n, p) => n + p.length, 0), joined = new Float32Array(total);
  let at = 0;
  for (const p of parts) { joined.set(p, at); at += p.length; }
  await writeFile(path.join(out, `${id}.wav`), encodeWav(joined, engine.sampleRate));
  console.log(`${id.padEnd(20)} ${line.voice.padEnd(9)} ${(total / engine.sampleRate).toFixed(2)} s  (${((performance.now() - started) / 1000).toFixed(1)} s)`);
}
