// Measures the Oracle's retrieval: does the passage search find the passage
// that answers a question? 25 paraphrased questions, each labelled by a phrase
// only its answering passages contain, ranked within the trial's own pool the
// way the game ranks them (server/oracle/retrieval.ts).
//
//   node --experimental-strip-types scripts/rag-eval.mjs [--embed <embeddings URL>] [--model <name>[,<name>...]] [--key <key>] [--minilm] [--out docs/ai-eval]
//
//   --embed   an OpenAI-compatible /v1/embeddings URL: the Colab gateway
//             (https://<tunnel>/v1/embeddings) or Ollama (http://127.0.0.1:11434/v1/embeddings)
//   --model   embedding models on that service (default embeddinggemma:300m)
//   --minilm  also measure all-MiniLM-L6-v2 in this process (the Oracle's first embedder)
//
// BM25 alone is always measured. For each embedder it reports meaning alone,
// the hybrid at the weight the game uses for it, and the best weight found.
//   hit@1, hit@3  share of questions whose answering passage ranks first, or in the top three
//   MRR           mean reciprocal rank of the first answering passage
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PASSAGES, bm25, candidatesFor, cosine, embedPrompt, remoteEmbedder, weightsFor } from "../server/oracle/retrieval.ts";

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const embedUrl = arg("embed"), models = (arg("model") || "embeddinggemma:300m").split(","), key = arg("key") ?? "", out = arg("out") || "docs/ai-eval";

export const QUERIES = [
  ["lotus", "What food made the scouts lose all wish to go home?", /who live on a food that comes from a kind of flower|left off caring about home/],
  ["lotus", "How did Odysseus get the men who ate the fruit back on board?", /under the benches|forced them back|tied them/i],
  ["cyclops", "What false name did Odysseus give the giant?", /Noman/],
  ["cyclops", "How did the Greeks get out of the cave past the blind giant?", /under the|belly|fleece/],
  ["cyclops", "What did Odysseus use to put out the giant's eye?", /stake|olive wood|sharpened/i],
  ["cyclops", "What drink did Odysseus give the giant to make him drunk?", /wine/],
  ["aeolus", "What gift did the keeper of the winds give Odysseus for his voyage?", /silver thread|ox hide|sack|bag/i],
  ["aeolus", "Why were the ships blown back to the windy island?", /untied|opened the|bag/i],
  ["aeolus", "How did the king of the winds receive them when they came back?", /begone|abhorred|hated|go away/i],
  ["circe", "What did the goddess turn the crew into?", /pigs|swine|hogs/i],
  ["circe", "Which plant protected Odysseus from the goddess's drugs?", /moly/i],
  ["circe", "Who escaped and ran back to tell Odysseus what happened at the house?", /Eurylochus/],
  ["sirens", "How did the crew avoid hearing the deadly singing?", /wax/i],
  ["sirens", "Why was Odysseus tied up as they sailed past?", /mast/i],
  ["sirens", "What lies around the singers in their meadow?", /bones|skin/i],
  ["scylla", "How many heads does the monster in the cliff have?", /six heads/i],
  ["scylla", "What does the whirlpool do three times a day?", /three times|sucks|vomits/i],
  ["scylla", "What did Odysseus cling to above the whirlpool?", /fig tree/i],
  ["calypso", "Who brought the gods' order to release Odysseus from the goddess's island?", /Hermes|Argicide|messenger/],
  ["calypso", "What did Odysseus build to leave the island?", /raft/i],
  ["calypso", "Who gave Odysseus a veil to save him from drowning?", /veil|Ino/],
  ["bow", "What test did Penelope set for the suitors?", /axes/i],
  ["bow", "Who failed first to bend the weapon?", /Leiodes|Leodes/],
  ["bow", "Who put the string on the bow in the end?", /strung|string the bow|stringing/i],
  ["bow", "Who did Odysseus reveal himself to before the contest?", /scar|Eumaeus|Philoetius/],
];

const missing = QUERIES.filter(([trial, , re]) => !candidatesFor(trial).some(p => re.test(p.text)));
if (missing.length) { console.error("These questions have no answering passage in their pool:", missing.map(q => q[1])); process.exit(1); }

const rankOf = (scored, re) => scored.sort((a, b) => b.s - a.s).findIndex(x => re.test(x.p.text)) + 1;
const score = ranks => {
  const n = ranks.length, hit = k => ranks.filter(r => r <= k).length / n;
  return { hit1: +hit(1).toFixed(3), hit3: +hit(3).toFixed(3), mrr: +(ranks.reduce((s, r) => s + 1 / r, 0) / n).toFixed(3) };
};
const keywordRanks = QUERIES.map(([trial, q, re]) => rankOf(candidatesFor(trial).map(p => ({ p, s: bm25(q, p) })), re));
const hybridRanks = (index, queries, w) => QUERIES.map(([trial, q, re], i) => {
  const pool = candidatesFor(trial), kw = new Map(pool.map(p => [p.id, bm25(q, p)])), top = Math.max(1e-9, ...kw.values());
  return rankOf(pool.map(p => ({ p, s: w * cosine(queries[i], index.get(p.id)) + (1 - w) * kw.get(p.id) / top })), re);
});

const rows = [{ name: "BM25 (keywords only)", ...score(keywordRanks) }];
async function measure(name, embed) {
  const started = performance.now();
  let docs, queries;
  try {
    docs = await embed(PASSAGES.map(p => p.text), "document");
    queries = await embed(QUERIES.map(q => q[1]), "query");
  } catch (error) { console.log(`${name}: unavailable (${error.message.slice(0, 120)})`); return; }
  const seconds = +((performance.now() - started) / 1000).toFixed(1);
  const index = new Map(PASSAGES.map((p, i) => [p.id, docs[i]]));
  const shipped = weightsFor(name).semantic;
  const sweep = Array.from({ length: 11 }, (_, i) => i / 10).map(w => ({ w, ...score(hybridRanks(index, queries, w)) }));
  const best = sweep.reduce((a, b) => (b.mrr > a.mrr ? b : a));
  rows.push(
    { name, ...score(hybridRanks(index, queries, 1)), seconds },
    { name: `${name} + BM25 at ${shipped} (game setting)`, ...score(hybridRanks(index, queries, shipped)) },
    { name: `${name} + BM25 at ${best.w} (best)`, hit1: best.hit1, hit3: best.hit3, mrr: best.mrr },
  );
}

if (embedUrl) for (const model of models) await measure(model, remoteEmbedder({ url: embedUrl, model, key }).embed);
if (process.argv.includes("--minilm")) {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = path.join(process.cwd(), ".cache", "models");
  const extract = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8", device: "cpu" });
  await measure("all-MiniLM-L6-v2", async texts => (await extract(texts, { pooling: "mean", normalize: true })).tolist().map(r => Float32Array.from(r)));
}

const pct = v => `${Math.round(v * 100)}%`;
console.log(`\n${QUERIES.length} questions over ${PASSAGES.length} passages\n`);
console.log("| Retrieval | Hit@1 | Hit@3 | MRR | Index time |");
console.log("|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.name} | ${pct(r.hit1)} | ${pct(r.hit3)} | ${r.mrr.toFixed(3)} | ${r.seconds ? `${r.seconds} s` : ""} |`);
mkdirSync(out, { recursive: true });
const file = `${out}/rag-retrieval.json`;
writeFileSync(file, JSON.stringify({ measured: new Date().toISOString(), embedUrl: embedUrl ? new URL(embedUrl).host : null, questions: QUERIES.length, passages: PASSAGES.length, prompts: Object.fromEntries(models.map(m => [m, { query: embedPrompt(m, "query", "…"), document: embedPrompt(m, "document", "…") }])), rows }, null, 2));
console.log(`Saved ${file}`);
