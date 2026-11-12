import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { CORPUS_SOURCE, ODYSSEY_PASSAGES } from "../server/oracle/corpus-data.ts";
import { PASSAGES, TOPIC_QUERIES, bm25, candidatesFor, retrieve, setOracleEmbedder, tokens } from "../server/oracle/retrieval.ts";
import { ORACLE_SCHEMA, POST as oraclePOST, SAME_MEANING, distinctMeaning, mockQuestion, normalize, oraclePrompt, shuffleOptions, verifyQuestion } from "../server/oracle/oracle.ts";
import { mockOracle } from "../server/lib/mock-ai.ts";

// Retrieval runs offline in tests: a deterministic bag-of-words embedder
// stands in for all-MiniLM-L6-v2, and the index is cached in a temporary folder.
process.env.FARSHORE_MODEL_CACHE = path.join(os.tmpdir(), "farshore-oracle-test");
function stubEmbedder(id = "stub-hash") {
  return async () => ({
    id, dimensions: 96,
    async embed(texts) {
      return texts.map(t => {
        const v = new Float32Array(96);
        for (const w of tokens(t)) { let h = 7; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 96] += 1; }
        const n = Math.hypot(...v) || 1;
        return v.map(x => x / n);
      });
    },
  });
}
setOracleEmbedder(stubEmbedder());
const seeded = (seed = 1) => { let a = seed; return max => { a = (a * 1103515245 + 12345) >>> 0; return a % max; }; };
const trials = ["lotus", "cyclops", "aeolus", "circe", "sirens", "scylla", "calypso", "bow"];

test("the corpus is Butler's Odyssey, books V, IX, X, XII and XXI, cleaned and split into short passages", () => {
  assert.equal(CORPUS_SOURCE.gutenberg, 1727);
  assert.match(CORPUS_SOURCE.translator, /Butler/);
  assert.deepEqual([...new Set(ODYSSEY_PASSAGES.map(p => p.book))], [5, 9, 10, 12, 21]);
  assert.ok(ODYSSEY_PASSAGES.length >= 150);
  for (const p of ODYSSEY_PASSAGES) {
    const words = p.text.split(/\s+/).length;
    assert.ok(words >= 20 && words <= 220, `${p.ref}: ${words} words`);
    assert.match(p.ref, /^Book [IVX]+, passage \d+$/);
    assert.match(p.url, /gutenberg\.org\/files\/1727\/1727-h\/1727-h\.htm#chap\d\d$/);
    assert.doesNotMatch(p.text, /\b(Ulysses|Jove|Minerva|Neptune)\b/, "names are in their Greek forms");
    assert.doesNotMatch(p.text, /[a-z][.,;]\d{1,3}\s/, "no footnote markers");
    assert.doesNotMatch(p.text, /Project Gutenberg/i);
  }
  for (const t of trials) {
    assert.ok(candidatesFor(t).some(p => p.kind === "lore" && p.trial === t), `game notes for ${t}`);
    assert.ok(candidatesFor(t).filter(p => p.kind === "odyssey").length >= 30, `the book for ${t}`);
    assert.ok(TOPIC_QUERIES[t].length >= 4);
  }
});

test("BM25 finds the Lotus-eaters passage for a question about the lotus", () => {
  const query = "what happened to the men who ate the lotus";
  const best = candidatesFor("lotus").map(p => [p, bm25(query, p)]).sort((a, b) => b[1] - a[1])[0][0];
  assert.match(best.text, /Lotus-eaters/);
  assert.equal(bm25("zzzz qqqq", best), 0);
});

test("hybrid retrieval ranks by meaning and words, keeps six and samples two of them", async () => {
  const r = await retrieve("lotus", { query: "what happened to the men who ate the lotus", random: seeded(3) });
  assert.equal(r.mode, "hybrid");
  assert.equal(r.embedder, "stub-hash");
  assert.equal(r.candidates.length, 6);
  for (let i = 1; i < r.candidates.length; i++) assert.ok(r.candidates[i - 1].score >= r.candidates[i].score);
  assert.equal(r.chosen.length, 2);
  assert.ok(r.chosen.every(p => r.candidates.some(c => c.id === p.id && c.chosen)));
  assert.match(PASSAGES.find(p => p.id === r.candidates[0].id).text, /lotus/i);
  assert.ok(Math.abs(r.candidates[0].score - (0.7 * r.candidates[0].semantic + 0.3 * r.candidates[0].keyword)) < 0.002, "score = 0.7 x meaning + 0.3 x words");
  // A topic is drawn at random when none is given.
  assert.ok(TOPIC_QUERIES.cyclops.includes((await retrieve("cyclops", { random: seeded(9) })).query));
});

test("without the embedding model, retrieval falls back to keywords and says so", async () => {
  setOracleEmbedder(async () => { throw new Error("offline"); });
  try {
    const r = await retrieve("sirens", { query: "wax in the ears of the crew", random: seeded(2) });
    assert.equal(r.mode, "keyword");
    assert.equal(r.embedder, null);
    assert.ok(r.candidates.every(c => c.semantic === null));
    assert.match(PASSAGES.find(p => p.id === r.candidates[0].id).text, /wax/i);
    const meaning = await distinctMeaning(["a", "b", "c", "d"], 0);
    assert.equal(meaning.ok, true);
    assert.match(meaning.detail, /Skipped/);
  } finally { setOracleEmbedder(stubEmbedder()); }
});

const lotus = PASSAGES.find(p => /Lotus-eaters, who live on a food/.test(p.text));
const other = PASSAGES.find(p => p.book === 9 && p.id !== lotus.id);
const good = () => ({
  question: "What did the people of that land live on?",
  options: ["A food that comes from a kind of flower", "Goat's milk and cheese", "Fish from the harbour", "Bread from Ithaca"],
  answer: 0,
  source: "P1",
  evidence: "the land of the Lotus-eaters, who live on a food that comes from a kind of flower",
  explanation: "They live on the lotus, a food that comes from a kind of flower.",
});

test("the server checks every claim before a question is shown", () => {
  assert.equal(verifyQuestion(good(), [lotus, other]).ok, true);
  const failed = (change, avoid = []) => verifyQuestion({ ...good(), ...change }, [lotus, other], avoid).checks.filter(c => !c.ok).map(c => c.id);
  assert.deepEqual(failed({ evidence: "the Lotus-eaters live on honey cakes and the milk of their goats" }), ["evidence"], "evidence not in the passage");
  assert.deepEqual(failed({ options: ["Bread", "Bread", "Fish", "Milk"] }).includes("options"), true, "duplicate options");
  assert.deepEqual(failed({ source: "P2" }), ["evidence"], "evidence cited from the wrong passage");
  assert.deepEqual(failed({ question: "Did they live on a food that comes from a kind of flower?" }), ["leak"], "answer given away");
  assert.deepEqual(failed({ question: "What was it" }), ["question"]);
  assert.deepEqual(failed({ options: ["Golden apples of the west", "Goat's milk and cheese", "Fish from the harbour", "Bread from Ithaca"] }), ["support"], "the answer's words are not in the text");
  assert.deepEqual(failed({}, ["What did the people of that land live on?"]), ["fresh"], "asked recently");
  assert.equal(verifyQuestion({ ...good(), source: "P3" }, [lotus, other]).source, null);
  assert.equal(normalize("“Noman,” he said—"), "noman he said");
});

test("a wrong option that means the same as the answer is set aside", async () => {
  const same = await distinctMeaning(["the wax in the ears of the crew", "wax in the crew's ears", "a song of Troy", "the mast"], 0);
  assert.equal(same.ok, false, same.detail);
  const fine = await distinctMeaning(["the wax in the ears of the crew", "a golden apple", "a song of Troy", "a broken oar"], 0);
  assert.equal(fine.ok, true, fine.detail);
  assert.ok(SAME_MEANING > 0.5 && SAME_MEANING < 1);
});

test("the server shuffles the options and keeps the right answer", () => {
  const options = ["right", "w1", "w2", "w3"];
  for (let seed = 1; seed < 30; seed++) {
    const s = shuffleOptions(options, 0, seeded(seed));
    assert.deepEqual([...s.options].sort(), [...options].sort());
    assert.equal(s.options[s.answer], "right");
  }
  const positions = new Set(Array.from({ length: 40 }, (_, i) => shuffleOptions(options, 0, seeded(i + 1)).answer));
  assert.ok(positions.size >= 3, "the answer does not always land in the same place");
});

test("the prompt carries only the retrieved passages and the recent questions; the schema allows only P1 and P2", () => {
  const { system, user } = oraclePrompt("lotus", [lotus, other], ["What did they eat?"]);
  assert.match(system, /from the passages given, and from nothing else/);
  assert.match(user, /P1 \(Book IX, passage \d+\): /);
  assert.match(user, /P2 \(/);
  assert.doesNotMatch(user, /P3 \(/);
  assert.match(user, /- What did they eat\?/);
  assert.deepEqual(ORACLE_SCHEMA.properties.source.enum, ["P1", "P2"]);
  assert.equal(ORACLE_SCHEMA.additionalProperties, false);
});

// A model stand-in that reads the real prompt and writes a question from P1.
function fakeModel({ bad = 0 } = {}) {
  let calls = 0;
  const fetcher = async (url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    const user = body.messages[1].content;
    const p1 = user.match(/P1 \([^)]*\): ([^\n]+)/)[1];
    const sentence = (p1.match(/[^.!?]+[.!?]/g) ?? [p1]).map(s => s.trim()).find(s => s.split(/\s+/).length >= 6 && s.split(/\s+/).length <= 30) ?? p1.split(/\s+/).slice(0, 12).join(" ");
    // Always a word from its own evidence, so a well-behaved model's question passes.
    const word = (sentence.match(/[A-Za-z]{6,}/g) ?? []).find(w => tokens(w).length === 1 && tokens(sentence).includes(tokens(w)[0])) ?? sentence.split(/\s+/).find(w => /^[A-Za-z]{4,}$/.test(w) && tokens(w).length === 1) ?? "Odysseus";
    const evidence = calls <= bad ? "words that appear nowhere in any passage at all" : sentence;
    const reply = { question: "Which of these words does the passage use?", options: [word, "trident", "chariot", "laurel"], answer: 0, source: "P1", evidence, explanation: `The passage says: ${sentence}` };
    return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
  };
  return { fetcher, calls: () => calls };
}
const post = (body, origin) => new Request("http://localhost:3000/api/oracle", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
async function withModel(fetcher, callback) {
  const keys = ["FARSHORE_MODEL_URL", "FARSHORE_MODEL_NAME", "FARSHORE_API_KEY"], old = Object.fromEntries(keys.map(k => [k, process.env[k]])), oldFetch = globalThis.fetch;
  Object.assign(process.env, { FARSHORE_MODEL_URL: "http://127.0.0.1:11434/v1/chat/completions", FARSHORE_MODEL_NAME: "qwen3:4b-instruct", FARSHORE_API_KEY: "" });
  globalThis.fetch = fetcher;
  try { await callback(); } finally {
    globalThis.fetch = oldFetch;
    for (const k of keys) if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k];
  }
}

test("the Oracle answers with a checked question, its passage and the whole retrieval trace", async () => {
  const model = fakeModel();
  await withModel(model.fetcher, async () => {
    const res = await oraclePOST(post({ trialId: "cyclops", avoid: ["An old question?"] }));
    assert.equal(res.status, 200);
    const q = await res.json();
    assert.equal(q.options.length, 4);
    assert.ok(q.answer >= 0 && q.answer < 4);
    assert.ok(q.checks.every(c => c.ok), JSON.stringify(q.checks));
    assert.ok(q.checks.some(c => c.id === "meaning"));
    assert.equal(q.source.kind === "odyssey" || q.source.kind === "lore", true);
    assert.ok(normalize(q.source.text).includes(normalize(q.evidence)));
    assert.equal(q.retrieval.mode, "hybrid");
    assert.equal(q.retrieval.chosen.length, 2);
    assert.equal(q.generation.model, "qwen3:4b-instruct");
    assert.equal(q.generation.rejected.length, q.generation.attempts - 1, "every earlier attempt is listed with its reasons");
    assert.equal(q.corpus.gutenberg, 1727);
  });
  assert.ok(model.calls() >= 1 && model.calls() <= 3);
});

test("a question that fails its checks is never shown: the Oracle tries again, then gives up with the reasons", async () => {
  const once = fakeModel({ bad: 1 });
  await withModel(once.fetcher, async () => {
    const q = await (await oraclePOST(post({ trialId: "sirens" }))).json();
    assert.equal(q.generation.attempts, 2);
    assert.deepEqual(q.generation.rejected, [{ attempt: 1, failed: ["Evidence is quoted from that passage"] }]);
  });
  const always = fakeModel({ bad: 99 });
  await withModel(always.fetcher, async () => {
    const res = await oraclePOST(post({ trialId: "bow" }));
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.code, "invalid_question");
    assert.equal(body.rejected.length, 3);
    assert.ok(body.checks.some(c => c.id === "evidence" && !c.ok));
  });
  assert.equal(always.calls(), 3);
});

test("bad requests never reach the model, and failures are typed", async () => {
  await withModel(async () => assert.fail("contacted the model"), async () => {
    assert.equal((await oraclePOST(post({ trialId: "troy" }))).status, 400);
    assert.equal((await oraclePOST(post({ trialId: "lotus", extra: 1 }))).status, 400);
    assert.equal((await oraclePOST(post({ trialId: "lotus" }, "https://example.com"))).status, 403);
  });
  await withModel(async () => { throw new TypeError("offline"); }, async () => assert.equal((await oraclePOST(post({ trialId: "lotus" }))).status, 503));
  const keys = ["FARSHORE_MODEL_URL", "FARSHORE_MODEL_NAME"], old = keys.map(k => process.env[k]);
  for (const k of keys) delete process.env[k];
  try { assert.equal((await oraclePOST(post({ trialId: "lotus" }))).status, 503); }
  finally { keys.forEach((k, i) => { if (old[i] !== undefined) process.env[k] = old[i]; }); }
});

test("test mode builds a checked question from real retrieval, without a model", async () => {
  const q = await mockQuestion("circe", seeded(4));
  assert.equal(q.mock, true);
  assert.ok(q.checks.every(c => c.ok), JSON.stringify(q.checks.filter(c => !c.ok)));
  assert.match(q.question, /____/);
  const res = await mockOracle(new Request("http://localhost/api/oracle", { method: "POST", body: JSON.stringify({ trialId: "aeolus" }) }), "success");
  assert.equal(res.status, 200);
  assert.equal((await mockOracle(new Request("http://localhost/api/oracle", { method: "POST", body: JSON.stringify({ trialId: "aeolus" }) }), "error")).status, 503);
  assert.equal((await mockOracle(new Request("http://localhost/api/oracle", { method: "POST", body: JSON.stringify({ trialId: "aeolus" }) }), "uncertain")).status, 422);
  assert.equal((await mockOracle(new Request("http://localhost/api/oracle", { method: "POST", body: JSON.stringify({ trialId: "nowhere" }) }), "success")).status, 400);
});
