import { createHash, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { trialFor, type TrialId } from "../../src/lib/arcade/arcade.ts";
import { chapterLore, homerLink } from "../../src/lib/story/odyssey.ts";
import { BOOK_TITLES, CORPUS_SOURCE, ODYSSEY_PASSAGES } from "./corpus-data.ts";
import { embeddingConfig } from "./config.ts";

/**
 * The Oracle's retrieval: the "R" in its retrieval-augmented generation.
 *
 * The knowledge base is the books of Homer's Odyssey behind the eight trials
 * (Butler's translation, corpus-data.ts) plus the game's own notes on each
 * episode. A question starts from one of the trial's topic queries. Every
 * candidate passage is scored two ways: by meaning, as the cosine similarity
 * of embeddings from an embedding service (EmbeddingGemma by default, served
 * by the Colab notebook or Ollama), and by words, with BM25. The best six by
 * the combined score are kept, and two are sampled from them, weighted by
 * score, to ground the question. Without an embedding service, retrieval uses
 * BM25 alone and says so. scripts/rag-eval.mjs measures the choices.
 */

export type Passage = {
  id: string;
  kind: "odyssey" | "lore";
  book: number;
  ref: string;
  url: string;
  text: string;
  trial?: TrialId;
};

export const TRIAL_BOOK: Record<TrialId, number> = { lotus: 9, cyclops: 9, aeolus: 10, circe: 10, sirens: 12, scylla: 12, calypso: 5, bow: 21 };
const LORE_KEY: Record<TrialId, string> = { lotus: "lotus", cyclops: "cyclops", aeolus: "winds", circe: "circe", sirens: "sirens", scylla: "scylla", calypso: "calypso", bow: "ithaca" };

/** What a question about each trial can be about. One is chosen at random each time. */
export const TOPIC_QUERIES: Record<TrialId, string[]> = {
  lotus: ["the land of the Lotus-eaters and the flower they eat", "what happened to the men who ate the lotus", "how Odysseus brought the scouts back to the ships", "the winds and currents off Cape Malea before the Lotus-eaters"],
  cyclops: ["the Cyclops in his cave with his sheep and goats", "Odysseus tells the Cyclops that his name is Noman", "blinding the Cyclops with a burning stake of olive wood", "escaping from the cave beneath the rams", "the Cyclops throws rocks at the departing ship", "the strong wine Odysseus gave the Cyclops"],
  aeolus: ["Aeolus keeper of the winds on his floating island", "the bag of winds tied with a silver thread", "the crew opens the bag while Odysseus sleeps", "Aeolus refuses to help them a second time"],
  circe: ["Circe turns the men into pigs", "Hermes gives Odysseus the herb moly", "Eurylochus warns the others about Circe's house", "Circe tells Odysseus he must visit the house of Hades"],
  sirens: ["the Sirens singing in a meadow among the bones of men", "wax in the ears of the crew", "Odysseus bound to the mast as they pass the Sirens", "Circe's warning about the Sirens"],
  scylla: ["Scylla with six heads in her cave high on the cliff", "Charybdis sucks down the water three times a day", "Odysseus clings to the fig tree above Charybdis", "six men snatched from the ship by Scylla"],
  calypso: ["Hermes brings the order of Zeus to Calypso", "Odysseus builds a raft on Calypso's island", "Poseidon wrecks the raft with a storm", "Ino gives Odysseus her veil to save him"],
  bow: ["Penelope brings out the bow of Odysseus", "the suitors fail to string the bow", "Odysseus strings the bow and shoots through the axes", "the twelve axes set up in a line for the contest"],
};

/**
 * The game's own summaries of what happens in the poem, retrievable beside it.
 * Only the Homer summaries are used, not the game's premise for each trial,
 * so every question is about the Odyssey itself.
 */
function lorePassages(): Passage[] {
  return (Object.keys(TRIAL_BOOK) as TrialId[]).flatMap(trial => {
    const t = trialFor(trial), lore = chapterLore[LORE_KEY[trial]], book = TRIAL_BOOK[trial];
    const out: Passage[] = [];
    if (lore) out.push({ id: `lore-${trial}-summary`, kind: "lore", book, trial, ref: `Farshore notes on ${lore.reference}`, url: homerLink(lore.book), text: lore.summary });
    const homer = (t as { homer?: string }).homer;
    if (homer) out.push({ id: `lore-${trial}-homer`, kind: "lore", book, trial, ref: `Farshore notes on Book ${t.book}`, url: homerLink(book), text: homer });
    return out;
  });
}

export const PASSAGES: Passage[] = [
  ...ODYSSEY_PASSAGES.map(p => ({ id: p.id, kind: "odyssey" as const, book: p.book, ref: p.ref, url: p.url, text: p.text })),
  ...lorePassages(),
];
const BY_ID = new Map(PASSAGES.map(p => [p.id, p]));
export const passageById = (id: string) => BY_ID.get(id);
export const bookTitle = (book: number) => BOOK_TITLES[book] ?? "";
/** Identifies this exact corpus, for the cached embedding index. */
export const CORPUS_HASH = createHash("sha256").update(PASSAGES.map(p => p.id + p.text).join("\n")).digest("hex").slice(0, 16);

/** The passages a trial's questions may draw on: its book of the Odyssey and the game's notes on it. */
export const candidatesFor = (trial: TrialId) => PASSAGES.filter(p => p.book === TRIAL_BOOK[trial] && (p.kind === "odyssey" || p.trial === trial));

// ------------------------------------------------------------------ BM25 --

const STOP = new Set("a an and are as at be been but by for from had has have he her him his i if in into is it its me my no not of on or our she so that the their them then there they this to up was we were what when which who will with would you your all any can could did do does each how more most other our out over said shall should some such than these those through under upon very while why".split(" "));
export function tokens(text: string): string[] {
  return (text.toLowerCase().replace(/[’']/g, "").match(/[a-z]+/g) ?? [])
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(w => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}
const DOC_TOKENS = new Map(PASSAGES.map(p => [p.id, tokens(p.text)]));
const AVG_LEN = [...DOC_TOKENS.values()].reduce((n, t) => n + t.length, 0) / DOC_TOKENS.size;
const DOC_FREQ = new Map<string, number>();
for (const t of DOC_TOKENS.values()) for (const w of new Set(t)) DOC_FREQ.set(w, (DOC_FREQ.get(w) ?? 0) + 1);

/** BM25 (k1 1.2, b 0.75), with document frequencies over the whole corpus. */
export function bm25(query: string, passage: Passage) {
  const doc = DOC_TOKENS.get(passage.id) ?? tokens(passage.text), n = PASSAGES.length;
  let score = 0;
  for (const w of new Set(tokens(query))) {
    const f = doc.filter(d => d === w).length;
    if (!f) continue;
    const df = DOC_FREQ.get(w) ?? 0, idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    score += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * doc.length / AVG_LEN));
  }
  return score;
}

// ------------------------------------------------------------ embeddings --

export type EmbedKind = "query" | "document";
export type Embedder = { id: string; label: string; embed(texts: string[], kind: EmbedKind): Promise<Float32Array[]> };

/**
 * Embedding models retrieve best with the prompts they were trained on.
 * EmbeddingGemma's are its documented retrieval prompts; without them it found
 * the right passage first 40% of the time on scripts/rag-eval.mjs, with them 60%.
 */
export function embedPrompt(model: string, kind: EmbedKind, text: string) {
  const m = model.toLowerCase();
  if (m.includes("embeddinggemma")) return kind === "query" ? `task: search result | query: ${text}` : `title: none | text: ${text}`;
  if (m.includes("qwen3-embedding")) return kind === "query" ? `Instruct: Given a question about Homer's Odyssey, retrieve the passage that answers it\nQuery: ${text}` : text;
  if (m.includes("nomic-embed")) return kind === "query" ? `search_query: ${text}` : `search_document: ${text}`;
  return text;
}

/**
 * How much meaning counts against keywords, per embedder. Measured with
 * scripts/rag-eval.mjs (25 paraphrased questions with labelled answers):
 * EmbeddingGemma ranks best at 0.8 to 0.9 (MRR 0.774 to 0.791, against 0.718
 * for BM25 alone); 0.8 keeps more say for exact names such as "Noman". Other
 * models default to 0.7.
 */
export function weightsFor(embedder: string | null) {
  const semantic = !embedder ? 0 : embedder.toLowerCase().includes("embeddinggemma") ? 0.8 : 0.7;
  return { semantic, keyword: +(1 - semantic).toFixed(2) };
}

const unit = (v: number[]) => { const n = Math.hypot(...v) || 1; return Float32Array.from(v, x => x / n); };

export function remoteEmbedder(config: NonNullable<ReturnType<typeof embeddingConfig>>): Embedder {
  return {
    id: `${config.model}@${new URL(config.url).host}`,
    label: config.model,
    async embed(texts, kind) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += 32) {
        const response = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}) },
          body: JSON.stringify({ model: config.model, input: texts.slice(i, i + 32).map(t => embedPrompt(config.model, kind, t)) }),
          // One short query is quick even on a processor; a batch of passages on a cold model is not.
          signal: AbortSignal.timeout(kind === "query" ? 20_000 : 60_000),
        });
        if (!response.ok) throw new Error(`The embedding service answered ${response.status}.`);
        const body = await response.json() as { data?: { embedding: number[]; index?: number }[] };
        const rows = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        if (rows.length !== Math.min(32, texts.length - i)) throw new Error("The embedding service returned the wrong number of vectors.");
        out.push(...rows.map(r => unit(r.embedding)));
      }
      return out;
    },
  };
}

async function loadConfigured(): Promise<Embedder> {
  const config = embeddingConfig();
  if (!config) throw new Error("No embedding service is configured.");
  const embedder = remoteEmbedder(config);
  await embedder.embed(["Odysseus"], "query");
  return embedder;
}

type IndexState = {
  loader: () => Promise<Embedder>;
  embedder: Promise<Embedder> | null;
  index: Promise<Map<string, Float32Array>> | null;
  status: "idle" | "loading" | "ready" | "failed";
  failedAt: number;
  built: { ms: number; cached: boolean } | null;
  error: string;
};
// On globalThis, so a development server's recompiles share one index (as with the voice).
const STATE = Symbol.for("farshore.oracle.retrieval.v2");
const store = globalThis as unknown as Record<symbol, IndexState | undefined>;
const state: IndexState = (store[STATE] ??= { loader: loadConfigured, embedder: null, index: null, status: "idle", failedAt: 0, built: null, error: "" });
const RETRY_MS = 60_000;

const encode = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
const decode = (s: string) => { const b = Buffer.from(s, "base64"); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

async function buildIndex(embedder: Embedder): Promise<Map<string, Float32Array>> {
  const dir = path.join(process.env.FARSHORE_MODEL_CACHE || path.join(process.cwd(), ".cache"), "oracle");
  const file = path.join(dir, `index-${CORPUS_HASH}-${embedder.label.replace(/[^a-z0-9.-]+/gi, "_")}.json`);
  const started = performance.now();
  try {
    const saved = JSON.parse(await readFile(file, "utf8")) as Record<string, string>;
    if (PASSAGES.every(p => saved[p.id])) {
      state.built = { ms: Math.round(performance.now() - started), cached: true };
      return new Map(PASSAGES.map(p => [p.id, decode(saved[p.id])]));
    }
  } catch { /* No saved index yet. */ }
  const vectors = await embedder.embed(PASSAGES.map(p => p.text), "document");
  const index = new Map(PASSAGES.map((p, i) => [p.id, vectors[i]]));
  state.built = { ms: Math.round(performance.now() - started), cached: false };
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(Object.fromEntries([...index].map(([id, v]) => [id, encode(v)]))));
  } catch { /* The index works from memory if it cannot be saved. */ }
  return index;
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  // Said once per kind of failure, not on every retry.
  if (message !== state.error) console.warn(`The Oracle's embedding service is unavailable, so retrieval uses keywords only: ${message}`);
  state.status = "failed";
  state.failedAt = Date.now();
  state.error = message;
  state.embedder = null;
  state.index = null;
}

/** The embedder and the passage index, loading them on first use. Null while unavailable. */
async function semantic(): Promise<{ embedder: Embedder; index: Map<string, Float32Array> } | null> {
  if (state.status === "failed" && Date.now() - state.failedAt < RETRY_MS) return null;
  if (!state.embedder) {
    state.status = "loading";
    state.embedder = state.loader();
    state.index = state.embedder.then(buildIndex);
  }
  try {
    const [embedder, index] = await Promise.all([state.embedder, state.index!]);
    state.status = "ready";
    state.error = "";
    return { embedder, index };
  } catch (error) {
    fail(error);
    return null;
  }
}

/** Starts loading the embedder and the index in the background, so the first question need not wait. */
export function warmIndex() {
  void semantic();
}

export const retrievalStatus = () => ({ status: state.status, built: state.built, error: state.error, service: embeddingConfig()?.model ?? null });

/** Tests swap in a stub embedder (null restores the configured service). Resets the index. */
export function setOracleEmbedder(loader: (() => Promise<Embedder>) | null) {
  state.loader = loader ?? loadConfigured;
  state.embedder = null;
  state.index = null;
  state.status = "idle";
  state.failedAt = 0;
  state.built = null;
  state.error = "";
}

// ------------------------------------------- similarity for the checks --

/**
 * The near-duplicate check (a wrong option that means the same as the answer)
 * uses all-MiniLM-L6-v2 in this server, whatever the retrieval embedder: its
 * threshold was calibrated on MiniLM's similarities (oracle.ts, SAME_MEANING).
 */
export type SimilarityModel = { embed(texts: string[]): Promise<Float32Array[]> };
async function loadMiniLM(): Promise<SimilarityModel> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = process.env.FARSHORE_MODEL_CACHE || path.join(process.cwd(), ".cache", "models");
  env.allowLocalModels = false;
  const extract = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8", device: "cpu" });
  return {
    async embed(texts) {
      const tensor = await extract(texts, { pooling: "mean", normalize: true });
      return (tensor.tolist() as number[][]).map(row => Float32Array.from(row));
    },
  };
}
type CheckerState = { loader: () => Promise<SimilarityModel>; model: Promise<SimilarityModel> | null; failedAt: number };
const CHECKER = Symbol.for("farshore.oracle.similarity");
const checkerStore = globalThis as unknown as Record<symbol, CheckerState | undefined>;
const checker: CheckerState = (checkerStore[CHECKER] ??= { loader: loadMiniLM, model: null, failedAt: 0 });

/** Unit-length MiniLM embeddings of short texts for the checks, or null while unavailable. */
export async function embedTexts(texts: string[]): Promise<Float32Array[] | null> {
  if (!checker.model && Date.now() - checker.failedAt < RETRY_MS) return null;
  checker.model ??= checker.loader();
  try { return await (await checker.model).embed(texts); }
  catch (error) {
    checker.model = null;
    checker.failedAt = Date.now();
    console.warn(`The Oracle's similarity check is unavailable: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}
export function setSimilarityModel(loader: (() => Promise<SimilarityModel>) | null) {
  checker.loader = loader ?? loadMiniLM;
  checker.model = null;
  checker.failedAt = 0;
}
export const cosine = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// ------------------------------------------------------------- retrieval --

export type Candidate = { id: string; ref: string; kind: Passage["kind"]; semantic: number | null; keyword: number; score: number; chosen: boolean };
export type Retrieval = {
  query: string;
  mode: "hybrid" | "keyword";
  embedder: string | null;
  weights: { semantic: number; keyword: number };
  candidates: Candidate[];
  chosen: Passage[];
  pool: number;
  ms: number;
  index: { passages: number; builtMs: number | null; cached: boolean | null };
  note?: string;
};

const KEEP = 6, CHOOSE = 2;

/** Weighted sampling without replacement. */
function sample<T>(items: T[], weight: (t: T) => number, n: number, random: (max: number) => number): T[] {
  const pool = [...items], out: T[] = [];
  while (out.length < n && pool.length) {
    const weights = pool.map(t => Math.max(1e-6, weight(t))), total = weights.reduce((a, b) => a + b, 0);
    let r = (random(1_000_000) / 1_000_000) * total, k = 0;
    while (k < pool.length - 1 && r >= weights[k]) { r -= weights[k]; k++; }
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

/**
 * Retrieves passages for a question about `trial`: picks a topic query (or
 * uses `query`), ranks the trial's passages by meaning and by words, keeps
 * the best six and samples two of them by score.
 */
export async function retrieve(trial: TrialId, options: { query?: string; random?: (max: number) => number; exclude?: string[] } = {}): Promise<Retrieval> {
  const started = performance.now(), random = options.random ?? randomInt;
  const topics = TOPIC_QUERIES[trial];
  const query = options.query ?? topics[random(topics.length)];
  const pool = candidatesFor(trial);
  let loaded = await semantic(), sims: Map<string, number> | null = null, note: string | undefined;
  if (loaded) {
    try {
      const [q] = await loaded.embedder.embed([query], "query");
      sims = new Map(pool.map(p => [p.id, cosine(q, loaded!.index.get(p.id)!)]));
    } catch (error) {
      // The service went away mid-session (a closed Colab tab): fall back for now, retry later.
      fail(error);
      loaded = null;
      note = "The embedding service stopped answering; this question used keywords only.";
    }
  }
  if (!loaded && !note && state.status === "failed" && embeddingConfig()) note = "The embedding service did not answer, so this question used keywords only. The game tries it again in a minute.";
  const weights = weightsFor(loaded ? loaded.embedder.label : null);
  const keywords = new Map(pool.map(p => [p.id, bm25(query, p)]));
  const top = Math.max(1e-9, ...keywords.values());
  const ranked = pool
    .map(p => {
      const keyword = keywords.get(p.id)! / top, s = sims?.get(p.id) ?? null;
      return { p, semantic: s, keyword, score: s === null ? keyword : weights.semantic * s + weights.keyword * keyword };
    })
    .sort((a, b) => b.score - a.score);
  const kept = ranked.filter(r => !options.exclude?.includes(r.p.id)).slice(0, KEEP);
  const chosen = sample(kept, r => r.score * r.score, CHOOSE, random);
  const chosenIds = new Set(chosen.map(c => c.p.id));
  return {
    query,
    mode: sims ? "hybrid" : "keyword",
    embedder: loaded ? loaded.embedder.label : null,
    weights,
    candidates: kept.map(r => ({ id: r.p.id, ref: r.p.ref, kind: r.p.kind, semantic: r.semantic === null ? null : +r.semantic.toFixed(3), keyword: +r.keyword.toFixed(3), score: +r.score.toFixed(3), chosen: chosenIds.has(r.p.id) })),
    chosen: chosen.map(c => c.p),
    pool: pool.length,
    ms: Math.round(performance.now() - started),
    index: { passages: PASSAGES.length, builtMs: state.built?.ms ?? null, cached: state.built?.cached ?? null },
    ...(note ? { note } : {}),
  };
}

export { CORPUS_SOURCE, embeddingConfig };
