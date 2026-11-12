import { createHash, randomInt } from "node:crypto";
import { z } from "zod/v3";
import { trialFor, type TrialId } from "../../src/lib/arcade/arcade.ts";
import { chatJson, ModelError } from "../lib/chat.ts";
import type { ModelConnection } from "../turn.ts";
import { GET as arcadeGET } from "../arcade.ts";
import { oracleModel } from "./config.ts";
import { CORPUS_SOURCE, PASSAGES, bookTitle, cosine, embedTexts, retrieve, tokens, warmIndex, type Passage, type Retrieval } from "./retrieval.ts";

/**
 * The Oracle's Key: a multiple-choice question written by retrieval-augmented
 * generation before an encounter. Retrieval (retrieval.ts) finds passages of
 * the Odyssey about the trial; the connected model writes one question from
 * them, citing the passage and quoting its evidence; this file checks every
 * claim against the passage text before the player sees it, and shuffles the
 * options itself. A question that fails a check is never shown: the model
 * tries again on freshly sampled passages, up to three times.
 */

const TRIALS = ["lotus", "cyclops", "aeolus", "circe", "sirens", "scylla", "calypso", "bow"] as const;
const input = z.object({ trialId: z.enum(TRIALS), avoid: z.array(z.string().max(240)).max(8).optional() }).strict();
export type OracleInput = z.infer<typeof input>;

const SOURCES = ["P1", "P2"] as const;
export const ORACLE_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string", maxLength: 200 },
    options: { type: "array", items: { type: "string", maxLength: 90 }, minItems: 4, maxItems: 4 },
    answer: { type: "integer", enum: [0, 1, 2, 3] },
    source: { type: "string", enum: [...SOURCES] },
    evidence: { type: "string", maxLength: 300 },
    explanation: { type: "string", maxLength: 240 },
  },
  required: ["question", "options", "answer", "source", "evidence", "explanation"],
  additionalProperties: false,
};
const reply = z.object({
  question: z.string().max(400),
  options: z.array(z.string().max(200)).length(4),
  answer: z.number().int().min(0).max(3),
  source: z.enum(SOURCES),
  evidence: z.string().max(600),
  explanation: z.string().max(600),
}).strict();
export type OracleReply = z.infer<typeof reply>;

export function oraclePrompt(trialId: TrialId, passages: Passage[], avoid: string[] = []) {
  const trial = trialFor(trialId);
  const system = `You are the Oracle in FARSHORE, an arcade game based on Homer's Odyssey. Before Odysseus may enter "${trial.title}", you test him with one multiple-choice question.
Write the question from the passages given, and from nothing else. It must be answerable from a single passage.
Give exactly four short options: one correct, and three plausible but clearly wrong according to that passage.
"answer" is the index (0 to 3) of the correct option. "source" names the passage it comes from (P1 or P2).
"evidence" must be copied word for word from that passage: one phrase or sentence, at most 30 words, that shows the answer is right.
"explanation" is one sentence for the player, after they answer.
Use the names as the passages write them. Do not ask about passage numbers, books or translators. Do not put the answer in the question.`;
  const user = [
    `Encounter: ${trial.title} (${trial.character})`,
    ...passages.map((p, i) => `P${i + 1} (${p.ref}): ${p.text}`),
    avoid.length ? `Recently asked, so ask something different:\n${avoid.map(q => `- ${q}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  return { system, user };
}

/** Lower case, straight quotes, no punctuation, single spaces: how quotes are compared with the passage. */
export const normalize = (s: string) => s.toLowerCase().replace(/[‘’`']/g, "").replace(/[“”"]/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const wordCount = (s: string) => normalize(s).split(" ").filter(Boolean).length;

export type OracleCheck = { id: string; label: string; ok: boolean; detail: string };

/** Every check the server makes on a question before it is shown. */
export function verifyQuestion(r: OracleReply, passages: Passage[], avoid: string[] = []): { ok: boolean; checks: OracleCheck[]; source: Passage | null } {
  const checks: OracleCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) => checks.push({ id, label, ok, detail });
  const options = r.options.map(o => o.trim());
  const distinct = new Set(options.map(normalize)).size === 4;
  add("options", "Four distinct options", options.every(o => o.length > 0 && o.length <= 90) && distinct, distinct ? "4 options, none empty or repeated" : "Two options are the same");
  const question = r.question.trim();
  add("question", "A real question", question.length >= 10 && question.length <= 200 && question.endsWith("?"), `${question.length} characters${question.endsWith("?") ? "" : ", no question mark"}`);
  const sourceIndex = SOURCES.indexOf(r.source), source = passages[sourceIndex] ?? null;
  add("source", "Cites a retrieved passage", !!source, source ? `${r.source}: ${source.ref}` : `${r.source} was not retrieved`);
  const evidence = normalize(r.evidence), n = wordCount(r.evidence);
  const quoted = !!source && n >= 4 && n <= 40 && normalize(source.text).includes(evidence);
  add("evidence", "Evidence is quoted from that passage", quoted, quoted ? `${n} words found verbatim` : n < 4 ? "Evidence too short" : n > 40 ? "Evidence too long" : "Evidence not found in the passage");
  const correct = options[r.answer] ?? "", key = new Set(tokens(correct));
  const inEvidence = [...key].filter(w => tokens(r.evidence).includes(w)), inPassage = source ? [...key].filter(w => tokens(source.text).includes(w)) : [];
  add("support", "The answer is in the text", inEvidence.length > 0 || inPassage.length > 0, inEvidence.length ? `“${inEvidence.slice(0, 3).join(", ")}” in the evidence` : inPassage.length ? `“${inPassage.slice(0, 3).join(", ")}” in the passage` : "None of the answer's words are in the passage");
  const leaked = normalize(correct).length >= 4 && normalize(question).includes(normalize(correct));
  add("leak", "The question does not give the answer away", !leaked, leaked ? "The correct option appears in the question" : "Answer not in the question");
  const repeat = avoid.some(a => normalize(a) === normalize(question));
  add("fresh", "Not a question asked recently", !repeat, repeat ? "Asked recently" : avoid.length ? `Differs from the last ${avoid.length}` : "First question");
  return { ok: checks.every(c => c.ok), checks, source };
}

/** Above this similarity, a wrong option says the same thing as the right one. */
export const SAME_MEANING = 0.85;

/**
 * A wrong option must not mean the same as the right one. Measured with
 * all-MiniLM-L6-v2 in this server (retrieval.ts, embedTexts): e.g. "Plug his
 * men's ears with wax and bind himself to the mast" against "Bind himself to
 * the mast and keep his ears covered with wax" scores 0.88 and is set aside.
 * Skipped (and said so) while that model is unavailable. It cannot catch every ambiguity: a wrong option that is
 * true in other words can still score low.
 */
export async function distinctMeaning(options: string[], answer: number): Promise<OracleCheck> {
  const label = "No wrong option means the same as the answer";
  const vectors = await embedTexts(options.map(o => o.trim()));
  if (!vectors) return { id: "meaning", label, ok: true, detail: "Skipped: the embedding model is not available" };
  const closest = Math.max(...vectors.map((v, i) => (i === answer ? -1 : cosine(v, vectors[answer]))));
  return { id: "meaning", label, ok: closest < SAME_MEANING, detail: `Closest wrong option ${closest.toFixed(2)} similar (limit ${SAME_MEANING})` };
}

/** Shuffles the options on the server; the model's order is never shown. */
export function shuffleOptions(options: string[], answer: number, random: (max: number) => number = randomInt) {
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = random(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return { options: order.map(i => options[i].trim()), answer: order.indexOf(answer) };
}

export type OracleQuestion = {
  id: string;
  trialId: TrialId;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  evidence: string;
  source: { id: string; ref: string; kind: Passage["kind"]; url: string; text: string; bookTitle: string; label: string };
  retrieval: Omit<Retrieval, "chosen"> & { chosen: { label: string; id: string; ref: string }[] };
  generation: { model: string; ms: number; attempts: number; temperature: number; rejected?: { attempt: number; failed: string[] }[] };
  checks: OracleCheck[];
  corpus: { work: string; translator: string; gutenberg: number; passages: number };
  ms: number;
  mock?: boolean;
};

const TEMPERATURE = 0.8, ATTEMPTS = 3, BUDGET_MS = 150_000;

/** The question as the client receives it, once it has passed every check. */
export function oracleResponse(trialId: TrialId, r: OracleReply, retrieval: Retrieval, checked: ReturnType<typeof verifyQuestion>, generation: OracleQuestion["generation"], started: number, random?: (max: number) => number): OracleQuestion {
  const source = checked.source!, shuffled = shuffleOptions(r.options, r.answer, random);
  const { chosen, ...trace } = retrieval;
  return {
    id: createHash("sha256").update(trialId + r.question).digest("hex").slice(0, 12),
    trialId,
    question: r.question.trim(),
    options: shuffled.options,
    answer: shuffled.answer,
    explanation: r.explanation.trim(),
    evidence: r.evidence.trim(),
    source: { id: source.id, ref: source.ref, kind: source.kind, url: source.url, text: source.text, bookTitle: bookTitle(source.book), label: r.source },
    retrieval: { ...trace, chosen: chosen.map((p, i) => ({ label: `P${i + 1}`, id: p.id, ref: p.ref })) },
    generation,
    checks: checked.checks,
    corpus: { work: CORPUS_SOURCE.work, translator: CORPUS_SOURCE.translator, gutenberg: CORPUS_SOURCE.gutenberg, passages: PASSAGES.length },
    ms: Math.round(performance.now() - started),
  };
}

/**
 * Test mode (the mock AI service): real retrieval, but the question is built
 * without a model, by blanking one word of a sentence from the top passage.
 * It passes the same checks and shuffle, so the inspector stays real.
 */
export async function mockQuestion(trialId: TrialId, random: (max: number) => number = randomInt): Promise<OracleQuestion> {
  const started = performance.now();
  const retrieval = await retrieve(trialId, { random });
  const source = retrieval.chosen[0];
  // A line short enough for the question to stay under 200 characters.
  const sentences = (source.text.match(/[^.!?]+[.!?]+[”’]*/g) ?? [source.text]).map(s => s.trim()).filter(s => wordCount(s) >= 8 && s.length <= 200 - 70 - source.ref.length);
  const own = new Set(tokens(source.text));
  const elsewhere = [...new Set(retrieval.chosen.slice(1).flatMap(p => p.text.match(/(?<![A-Za-z])[a-z]{5,}(?![A-Za-z])/g) ?? []))].filter(w => !own.has(tokens(w)[0]) && tokens(w).length === 1);
  const build = (line: string, word: string): OracleReply => {
    const distractors = [...elsewhere, "harbour", "trident", "chariot", "laurel", "javelin"].filter(w => normalize(w) !== normalize(word)).slice(0, 3);
    return {
      question: `Test mode: which word completes this line from ${source.ref}: “${line.replace(word, "____")}”?`,
      options: [word, ...distractors],
      answer: 0,
      source: "P1",
      evidence: line,
      explanation: `${source.ref} reads: “${line}”`,
    };
  };
  // The first line and word that pass every check: a word that appears once in its line, so blanking it gives nothing away.
  // Whole sentences first, then shorter clauses from anywhere in the passage.
  const clauses = source.text.split(/[.;:!?]\s+|,\s+(?=[a-z])/).map(c => c.trim()).filter(c => wordCount(c) >= 6 && c.length <= 200 - 70 - source.ref.length);
  const lines = [...sentences, ...clauses, source.text.split(/\s+/).slice(0, 20).join(" ")].map(s => s.replace(/^[“"‘']+|[”"’']+$/g, "").trim());
  let r = build(lines[0], "Odysseus"), checked = verifyQuestion(r, retrieval.chosen);
  search: for (const line of lines) {
    for (const word of line.match(/[A-Za-z][a-z]{4,}/g) ?? []) {
      if (tokens(word).length !== 1 || line.toLowerCase().split(word.toLowerCase()).length !== 2) continue;
      const candidate = build(line, word), result = verifyQuestion(candidate, retrieval.chosen);
      if (result.ok) { r = candidate; checked = result; break search; }
    }
  }
  return { ...oracleResponse(trialId, r, retrieval, checked, { model: "mock-ai (test mode)", ms: 0, attempts: 1, temperature: 0 }, started, random), mock: true };
}

export { oracleModel };

/**
 * The model status, as /api/arcade reports it. Asking also starts building the
 * passage index, which takes about a minute on a processor (seconds on a GPU),
 * so it is ready before the first briefing.
 */
export async function GET(connection?: ModelConnection) {
  const response = await arcadeGET(connection);
  warmIndex();
  return response;
}

export async function POST(request: Request, connection?: ModelConnection) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "The Oracle answers only Farshore." }, { status: 403 });
  let data: OracleInput;
  try {
    const raw = await request.text();
    if (raw.length > 4000) return Response.json({ error: "That request is too large." }, { status: 413 });
    data = input.parse(JSON.parse(raw));
  } catch { return Response.json({ error: "Choose one of the eight trials." }, { status: 400 }); }
  const url = connection ? connection.url : process.env.FARSHORE_MODEL_URL;
  const model = oracleModel(connection);
  const key = connection ? connection.key : process.env.FARSHORE_API_KEY;
  if (!url || !model) return Response.json({ error: "The Oracle needs a connected model to write its question." }, { status: 503 });
  const started = performance.now(), avoid = data.avoid ?? [];
  let lastChecks: OracleCheck[] = [];
  const rejected: { attempt: number; failed: string[] }[] = [];
  try {
    let retrieval = await retrieve(data.trialId);
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      // Each retry samples fresh passages for the same topic.
      if (attempt > 1) retrieval = await retrieve(data.trialId, { query: retrieval.query });
      const { system, user } = oraclePrompt(data.trialId, retrieval.chosen, avoid);
      const asked = performance.now();
      const raw = await chatJson({
        connection: { url, model, key }, name: "farshore_oracle", schema: ORACLE_SCHEMA, system, user,
        maxTokens: 320, temperature: TEMPERATURE,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
      });
      const parsed = reply.safeParse(raw);
      if (!parsed.success) {
        lastChecks = [{ id: "shape", label: "The reply has the question's shape", ok: false, detail: "Missing or malformed fields" }];
        rejected.push({ attempt, failed: ["The reply has the question's shape"] });
        continue;
      }
      const checked = verifyQuestion(parsed.data, retrieval.chosen, avoid);
      if (checked.ok) {
        const meaning = await distinctMeaning(parsed.data.options, parsed.data.answer);
        checked.checks.push(meaning);
        checked.ok = meaning.ok;
      }
      lastChecks = checked.checks;
      if (checked.ok) {
        const generation = { model, ms: Math.round(performance.now() - asked), attempts: attempt, temperature: TEMPERATURE, rejected };
        return Response.json(oracleResponse(data.trialId, parsed.data, retrieval, checked, generation, started), { headers: { "Cache-Control": "no-store" } });
      }
      rejected.push({ attempt, failed: checked.checks.filter(c => !c.ok).map(c => c.label) });
      if (performance.now() - started > BUDGET_MS) break;
    }
    return Response.json({ error: "The Oracle's question could not be checked against the text, so it was set aside. Ask again.", code: "invalid_question", checks: lastChecks, rejected }, { status: 422 });
  } catch (error) {
    const cancelled = request.signal.aborted;
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const invalid = error instanceof SyntaxError || error instanceof z.ZodError;
    const busy = error instanceof ModelError && error.code === "busy";
    return Response.json(
      { error: cancelled ? "Question cancelled." : timeout ? "The Oracle took too long. Ask again in a moment." : invalid ? "The Oracle's reply could not be read, so it was set aside. Ask again." : busy ? "The model is busy. Ask again in a moment." : "The Oracle cannot be reached. Check the model service.", code: cancelled ? "cancelled" : timeout ? "timeout" : invalid ? "invalid_question" : busy ? "busy" : "unreachable" },
      { status: cancelled ? 499 : timeout ? 504 : invalid ? 422 : busy ? 429 : 503 },
    );
  }
}
