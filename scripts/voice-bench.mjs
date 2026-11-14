// Measures the built-in voice on this computer, so the dtype and thread count
// in server/lib/kokoro.ts are chosen by numbers, not guesses.
//
//   node --experimental-strip-types scripts/voice-bench.mjs [--configs uint8@8,fp32@8] [--lines 12] [--no-wer] [--out .cache/voice-bench]
//   node --experimental-strip-types scripts/voice-bench.mjs --http http://localhost:3000
//
// Each configuration runs in its own process, so its load time is a real cold
// start (the first run of a dtype also includes its download). Reported:
//   load      seconds from nothing to a warmed engine
//   first     seconds until the first piece of a line is ready, using the same
//             split the game uses (sentences with firstMax 70)
//   rtf       synthesis seconds per second of speech (below 1 is faster than real time)
//   wer       word error rate of Whisper tiny.en listening to the lines (lower is clearer)
//   names     share of Greek names Whisper heard as the name
//   rss       peak memory in MB
// WAVs land in the output folder for listening. --http times the running
// server's /api/voice instead: a cold line, the same line again (cache), a
// fixed line (disk), and a request abandoned after 100 ms.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const OUT = path.resolve(flag("--out") || ".cache/voice-bench");

export const LINES = [
  "Run, little Nobody! My boulders will find you in the dark.",
  "Ahead lies Aeaea, where the sorceress Circe is already brewing.",
  "Scylla watches from above, and Charybdis turns below.",
  "Telemachus waits in the hall, and Antinous laughs at the old beggar.",
  "Polyphemus counts his sheep, and waits.",
  "The winds of Aeolus are free, and they remember who opened the bag.",
  "Sing to me, Muse, of the man of many ways, who wandered far.",
  "Your arrow flies true through twelve axe heads. The suitors fall silent.",
  "The Sirens call your name across the water. Keep the oars moving.",
  "Poseidon gathers his storm. Hold the raft together, Odysseus!",
  "Tiresias warned you: do not touch the cattle of Helios.",
  "You are Odysseus, king of Ithaca. Ten years at Troy have taken you far from Penelope and Telemachus.",
];
const NAMES = ["Nobody", "Aeaea", "Circe", "Scylla", "Charybdis", "Telemachus", "Antinous", "Polyphemus", "Aeolus", "Sirens", "Poseidon", "Odysseus", "Tiresias", "Helios", "Ithaca", "Troy", "Penelope"];

const words = text => text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
function wer(reference, heard) {
  const r = words(reference), h = words(heard), d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / Math.max(1, r.length);
}
function wav(samples, rate) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + samples.length * 2, 4); bytes.write("WAVE", 8); bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return bytes;
}
const root = pathToFileURL(path.resolve(".") + path.sep);
const load = rel => import(new URL(rel, root).href);

/** One configuration, in this process: load, then speak every line piece by piece. */
async function child(dtype, threads, count) {
  const { createKokoroEngine } = await load("server/lib/kokoro.ts");
  const { prepareSpeech } = await load("server/lib/wav.ts");
  const { pronounce } = await load("src/lib/speech/lexicon.ts");
  const { sentences } = await load("src/lib/speech/sentences.ts");
  const { SPLIT } = await load("src/lib/story/spoken-lines.ts");
  let peak = 0;
  const sample = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 50);
  const t0 = performance.now();
  const engine = await createKokoroEngine({ dtype, threads });
  const loadS = (performance.now() - t0) / 1000;
  const dir = path.join(OUT, `${dtype}@${threads}`);
  mkdirSync(dir, { recursive: true });
  const lines = [];
  for (const [n, text] of LINES.slice(0, count).entries()) {
    const pieces = sentences(pronounce(text), SPLIT), audio = [];
    let first = 0, synth = 0;
    for (const [i, piece] of pieces.entries()) {
      const s = performance.now();
      const out = prepareSpeech(await engine.synthesize(piece, n % 2 ? "am_michael" : "bm_george", 0.95), engine.sampleRate);
      const took = (performance.now() - s) / 1000;
      if (i === 0) first = took;
      synth += took;
      audio.push(out, new Float32Array(Math.round(engine.sampleRate * 0.15)));
    }
    const joined = new Float32Array(audio.reduce((n, a) => n + a.length, 0));
    let at = 0;
    for (const a of audio) { joined.set(a, at); at += a.length; }
    const file = path.join(dir, `line-${String(n + 1).padStart(2, "0")}.wav`);
    writeFileSync(file, wav(joined, engine.sampleRate));
    lines.push({ text, file, first, synth, seconds: joined.length / engine.sampleRate });
  }
  clearInterval(sample);
  process.stdout.write("RESULT " + JSON.stringify({ dtype, threads, load: loadS, rss: Math.round(peak / 1048576), lines }) + "\n");
}

function runChild(dtype, threads, count) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", process.argv[1], "--child", dtype, String(threads), String(count)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    proc.stdout.on("data", d => { out += d; });
    proc.on("exit", code => {
      const line = out.split("\n").find(l => l.startsWith("RESULT "));
      line ? resolve(JSON.parse(line.slice(7))) : reject(new Error(`${dtype}@${threads} exited ${code}`));
    });
  });
}

/** Whisper tiny.en hears each WAV; 24 kHz is resampled to 16 kHz. */
async function listen(results) {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = path.resolve(".cache/models");
  const asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", { dtype: "q8" });
  for (const r of results) for (const line of r.lines) {
    const bytes = readFileSync(line.file), n = (bytes.length - 44) / 2, src = new Float32Array(n);
    for (let i = 0; i < n; i++) src[i] = bytes.readInt16LE(44 + i * 2) / 32768;
    const outN = Math.floor(n * 16000 / 24000), dst = new Float32Array(outN);
    for (let i = 0; i < outN; i++) { const x = i * 1.5, k = Math.floor(x), f = x - k; dst[i] = src[k] * (1 - f) + (src[k + 1] ?? 0) * f; }
    const heard = (await asr(dst)).text;
    line.heard = heard.trim();
    line.wer = wer(line.text, heard);
    const said = NAMES.filter(name => line.text.includes(name));
    line.names = said.length ? said.filter(name => heard.toLowerCase().includes(name.toLowerCase())).length / said.length : null;
  }
}

async function http(base) {
  const post = (text, voice = "bard", signal) => fetch(new URL("/api/voice", base), { method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(base).origin }, body: JSON.stringify({ text, voice }), signal });
  const time = async (label, text) => { const s = performance.now(); const r = await post(text); await r.arrayBuffer(); console.log(`${label.padEnd(12)} ${r.status} ${(((performance.now() - s) / 1000)).toFixed(2)} s  cache=${r.headers.get("x-voice-cache")}`); };
  const status = await (await fetch(new URL("/api/voice", base))).json();
  console.log("status", JSON.stringify(status));
  const word = () => ["amber", "cobalt", "silver", "crimson", "ivory", "violet", "golden", "ashen"][Math.floor(Math.random() * 8)];
  const { TEST_LINE } = await load("src/lib/story/spoken-lines.ts");
  const fresh = `The ${word()} tide turns, and the ${word()} oars bite deep.`;
  await time("cold", fresh);
  await time("repeat", fresh);
  await time("fixed", TEST_LINE);
  const controller = new AbortController();
  const s = performance.now();
  const abandoned = post(`An ${word()} line that nobody waits for any more.`, "bard", controller.signal).catch(e => e.name);
  setTimeout(() => controller.abort(), 100);
  console.log("abandoned   ", await abandoned, (((performance.now() - s) / 1000)).toFixed(2), "s");
  await time("after abort", `And the ${word()} line after it is heard at once.`);
}

if (args[0] === "--child") await child(args[1], Number(args[2]), Number(args[3]));
else if (flag("--http")) await http(flag("--http"));
else {
  const configs = (flag("--configs") || "uint8@8,uint8@6,fp32@8,fp32@6,fp32@4,fp16@8").split(",").map(c => c.split("@"));
  const count = Number(flag("--lines") || LINES.length);
  const results = [];
  for (const [dtype, threads] of configs) {
    console.error(`-- ${dtype} on ${threads} threads`);
    try { results.push(await runChild(dtype, Number(threads), count)); } catch (error) { console.error(String(error)); }
  }
  if (!args.includes("--no-wer")) await listen(results);
  const mean = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const rows = results.map(r => {
    const names = r.lines.map(l => l.names).filter(n => n !== null && n !== undefined);
    return {
      config: `${r.dtype}@${r.threads}`,
      load: +r.load.toFixed(1),
      first: +mean(r.lines.map(l => l.first)).toFixed(2),
      rtf: +(r.lines.reduce((a, l) => a + l.synth, 0) / r.lines.reduce((a, l) => a + l.seconds, 0)).toFixed(2),
      wer: r.lines[0]?.wer === undefined ? null : +(mean(r.lines.map(l => l.wer)) * 100).toFixed(1),
      names: names.length ? +(mean(names) * 100).toFixed(0) : null,
      rss: r.rss,
    };
  });
  console.table(rows);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ when: new Date().toISOString(), rows, results }, null, 2));
  console.error(`Saved ${path.join(OUT, "results.json")}`);
}
