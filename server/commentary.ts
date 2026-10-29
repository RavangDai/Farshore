import { z } from "zod/v3";
import { difficultyNames, trialFor, type TrialId } from "../src/lib/arcade/arcade.ts";
import { cleanLine, momentKinds, type CommentaryRequest } from "../src/lib/arcade/commentary.ts";
import { personas } from "../src/lib/arcade/rivals.ts";
import { chatJson, ModelError } from "./lib/chat.ts";
import type { ModelConnection } from "./turn.ts";

const count = z.number().int().min(0).max(1_000_000);
const input = z.object({
  trialId: z.enum(["lotus", "cyclops", "aeolus", "circe", "sirens", "scylla", "calypso", "bow"]),
  difficulty: z.enum(["easy", "normal", "hard"]),
  moment: z.enum(momentKinds),
  speaker: z.enum(["bard", "rival"]),
  facts: z.object({
    score: count, hits: count.max(100), misses: count.max(100), streak: count.max(1000),
    livesLeft: z.number().int().min(0).max(3).nullable(),
    secondsLeft: z.number().int().min(0).max(3600).nullable(),
    progress: z.number().int().min(0).max(100),
    status: z.string().max(160),
  }).strict(),
  recent: z.array(z.string().max(200)).max(4),
}).strict();
const output = z.object({ line: z.string().min(2).max(220) }).strict();
const schema = { type: "object", properties: { line: { type: "string", minLength: 2, maxLength: 160 } }, required: ["line"], additionalProperties: false };

const momentNotes: Record<CommentaryRequest["moment"], string> = {
  start: "The encounter has just begun. Set the scene and the stakes.",
  score: "Odysseus just earned points.",
  streak: "Odysseus is on a streak of successes.",
  hit: "Odysseus was just struck or failed to dodge.",
  miss: "Odysseus just missed or fumbled an action.",
  danger: "The rival is closing in. Tension is high.",
  progress: "Odysseus has passed a milestone in this encounter.",
  win: "Odysseus has won this encounter.",
  loss: "Odysseus has lost this attempt.",
};

/**
 * The system prompt is identical for every line in an encounter, whichever
 * voice speaks, so a local server can keep it cached and only read the short
 * per-line request. On a CPU-only laptop that is the difference between a
 * line in about three seconds and one in about thirteen.
 */
export function commentaryPrompt(data: CommentaryRequest) {
  const trial = trialFor(data.trialId as TrialId);
  const system = `You voice live commentary for FARSHORE, an arcade game based on Homer's Odyssey. Encounter: ${trial.title}.
There are two voices.
BARD: a Homeric narrator singing the moment live. Warm, vivid, present tense, third person, at most one epithet such as 'wily Odysseus'.
RIVAL: ${personas[data.trialId as TrialId]}. Speaks in first person directly to Odysseus, in character, taunting or scheming.
Each request names the voice, the moment and the facts. Write exactly one spoken sentence of at most 18 words, in that voice, reacting to that moment.
Use only the facts given. Never invent numbers, outcomes or rules. Do not explain controls.
No emojis, hashtags, stage directions, quotation marks or lists. Do not repeat a recent line.
Return JSON with a single field: line.`;
  // Plain lines rather than JSON: fewer tokens for a CPU to read per request.
  const f = data.facts;
  const facts = [
    `score ${f.score}`,
    f.livesLeft === null ? null : `lives ${f.livesLeft} of 3`,
    f.secondsLeft === null ? null : `${f.secondsLeft} s left`,
    `${f.progress}% through`,
    `streak ${f.streak}`,
    `hits ${f.hits}`,
    `misses ${f.misses}`,
    f.status || null,
  ].filter(Boolean).join("; ");
  const user = [
    `Voice: ${data.speaker === "bard" ? "BARD" : "RIVAL"}`,
    `Moment: ${momentNotes[data.moment]}`,
    `Difficulty: ${difficultyNames[data.difficulty]}`,
    `Facts: ${facts}`,
    data.recent.length ? `Recent lines: ${data.recent.map(line => JSON.stringify(line)).join(" ")}` : null,
  ].filter(Boolean).join("\n");
  return { system, user };
}

export async function POST(request: Request, connection?: ModelConnection) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Commentary requests must come from Farshore." }, { status: 403 });
  let data: z.infer<typeof input>;
  try {
    const raw = await request.text();
    if (raw.length > 4000) return Response.json({ error: "Commentary request is too large." }, { status: 413 });
    data = input.parse(JSON.parse(raw));
  } catch { return Response.json({ error: "Unsupported commentary request." }, { status: 400 }); }
  const url = connection ? connection.url : process.env.FARSHORE_MODEL_URL;
  // A smaller, faster model can voice the match while a stronger one plans it.
  // The override applies to the server's own model service, not account connections.
  const serverModel = !connection || connection.url === process.env.FARSHORE_MODEL_URL;
  const model = (serverModel && process.env.FARSHORE_COMMENTARY_MODEL) || (connection ? connection.model : process.env.FARSHORE_MODEL_NAME);
  const key = connection ? connection.key : process.env.FARSHORE_API_KEY;
  if (!url || !model) return Response.json({ error: "No model is connected." }, { status: 503 });
  try {
    const { system, user } = commentaryPrompt(data);
    const reply = output.parse(await chatJson({
      connection: { url, model, key }, name: "farshore_commentary", schema, system, user,
      maxTokens: 70, temperature: 0.85,
      // A cold local model reads the system prompt once per encounter; allow for it.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
    }));
    const line = cleanLine(reply.line);
    if (line.length < 2) throw new SyntaxError("Empty line");
    return Response.json({ line, speaker: data.speaker }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const invalid = error instanceof SyntaxError || error instanceof z.ZodError;
    const busy = error instanceof ModelError && error.code === "busy";
    return Response.json(
      { error: timeout ? "Commentary timed out." : invalid ? "The model returned an unusable line." : busy ? "The model is busy." : "The model is not reachable." },
      { status: timeout ? 504 : invalid ? 422 : busy ? 429 : 503 },
    );
  }
}
