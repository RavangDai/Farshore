import { z } from "zod/v3";
import { difficultyNames, trialFor, type TrialId } from "../src/lib/arcade/arcade.ts";
import { cleanLine } from "../src/lib/arcade/commentary.ts";
import { allowedNumbers, cleanText, groundedNumbers, type Facts } from "../src/lib/arcade/decisions.ts";
import { personas } from "../src/lib/arcade/rivals.ts";
import { chatJson, ModelError } from "./lib/chat.ts";
import type { ModelConnection } from "./turn.ts";

// In-game decisions for the three encounters whose rival a model steers live.
// The game sends a menu it has already checked is fair; the model may only
// answer with one of that menu's ids, which the schema enforces during
// generation and this handler checks again afterwards. The engine re-checks a
// third time before it executes anything.

const focusTrials = ["cyclops", "sirens", "bow"] as const;
const value = z.union([z.string().max(80), z.number().finite()]);
const facts = (max: number) => z.record(z.string().min(1).max(40), value).refine(o => Object.keys(o).length <= max, "Too many facts.");
const option = z.object({ id: z.string().regex(/^[a-z0-9-]{1,24}$/), label: z.string().min(1).max(60), features: facts(8) }).strict();
const choose = z.object({
  kind: z.literal("choose"),
  trialId: z.enum(focusTrials),
  difficulty: z.enum(["easy", "normal", "hard"]),
  point: z.string().min(1).max(60),
  facts: facts(12),
  options: z.array(option).min(2).max(5).refine(list => new Set(list.map(o => o.id)).size === list.length, "Option ids must be unique."),
  recent: z.array(z.string().max(200)).max(3),
  lab: z.boolean().optional(),
}).strict();
const debrief = z.object({
  kind: z.literal("debrief"),
  trialId: z.enum(focusTrials),
  difficulty: z.enum(["easy", "normal", "hard"]),
  won: z.boolean(),
  facts: facts(16),
  picks: z.array(z.object({ point: z.string().max(60), label: z.string().max(60), by: z.enum(["model", "game"]), outcome: z.string().max(80) }).strict()).max(8),
}).strict();
const input = z.discriminatedUnion("kind", [choose, debrief]);
export type ChooseInput = z.infer<typeof choose>;
export type DebriefInput = z.infer<typeof debrief>;

/** What each rival is trying to do, in the game's own terms. Kept short so small models stay on task. */
const goals: Record<(typeof focusTrials)[number], string> = {
  bow: "Antinous wins the contest of the twelve axes with the higher total after five arrows each; ties go to him. A block shot caps his own arrow at six axes but lodges it in one axe, narrowing that opening for Odysseus' next arrow. A showy half-draw scores less on average but shows off his pride; he only considers it when comfortably ahead.",
  sirens: "The Sirens win when the Temptation gauge reaches 100. Each wrong or missed note in Odysseus' echo raises it; a clean echo lowers it. A melody he is likely to miss is good for the Sirens, but they also enjoy variety.",
  cyclops: "Polyphemus wins if he closes the chase gap or lands three hits before Odysseus reaches daylight. Each doctrine changes how he aims his boulders for the next section of the cave; every throw is still warned and always leaves an escape.",
};

const line = (facts: Facts) => Object.entries(facts).map(([k, v]) => `${k} ${v}`).join("; ");

/**
 * The system prompt is identical for every decision in an encounter, so a
 * local server keeps it cached and reads only the short per-decision menu.
 */
export function decisionPrompt(data: ChooseInput) {
  const trial = trialFor(data.trialId as TrialId);
  const system = `You are the strategist for ${personas[data.trialId as TrialId]} in FARSHORE, an arcade game based on Homer's Odyssey. Encounter: ${trial.title}.
${goals[data.trialId]}
At each decision the game sends facts and a menu of options. The game has already checked every option is fair, and the game alone decides physics, aim error and scoring: you choose intent, never the result.
Choose the option most likely to beat Odysseus that also suits your character. Weigh the numbers; do not simply take the first option.
Return JSON with optionId (one of the menu ids), reason (one sentence of at most 25 words explaining the choice, quoting only numbers that appear in the facts or options), and line (one spoken sentence of at most 16 words, in character, to Odysseus, hinting at your intent, with no numbers).
No emojis, stage directions, quotation marks or lists.`;
  const user = [
    `Decision: ${data.point}`,
    `Difficulty: ${difficultyNames[data.difficulty]}`,
    `Facts: ${line(data.facts)}`,
    "Options:",
    ...data.options.map(o => `- ${o.id}: ${o.label} (${line(o.features)})`),
    data.recent.length ? `Your recent lines: ${data.recent.map(text => JSON.stringify(text)).join(" ")}` : null,
  ].filter(Boolean).join("\n");
  return { system, user };
}

export function debriefPrompt(data: DebriefInput) {
  const trial = trialFor(data.trialId as TrialId);
  const system = `You are ${personas[data.trialId as TrialId]} in FARSHORE, an arcade game based on Homer's Odyssey. Encounter: ${trial.title}. The encounter is over.
Speak to Odysseus in first person, in character, in two or three sentences: what you noticed about how he played, and how you tried to use it.
Use only the facts and picks given. Quote only numbers that appear in them. Never invent outcomes.
No emojis, stage directions, quotation marks or lists. Return JSON with a single field: text.`;
  const user = [
    `Result: ${data.won ? "Odysseus won" : "Odysseus lost"}`,
    `Difficulty: ${difficultyNames[data.difficulty]}`,
    `Facts: ${line(data.facts)}`,
    data.picks.length ? "Your choices:" : null,
    ...data.picks.map(p => `- ${p.point}: ${p.label} (${p.by === "model" ? "your pick" : "the game picked"}) → ${p.outcome}`),
  ].filter(Boolean).join("\n");
  return { system, user };
}

/**
 * Check the model's words against what it was told. The pick itself is valid
 * or the whole reply is rejected; a reason or line that quotes a number the
 * game never supplied is replaced, and the reply says so.
 */
export function verifyChoice(data: ChooseInput, reply: { optionId: string; reason: string; line: string }) {
  const picked = data.options.find(o => o.id === reply.optionId);
  if (!picked) return null;
  const allowed = allowedNumbers(data.facts, ...data.options.map(o => o.features));
  let reason = cleanLine(reply.reason), spoken = cleanLine(reply.line);
  const edits: string[] = [];
  const why = groundedNumbers(reason, allowed);
  if (!why.ok || reason.length < 3) {
    edits.push(why.ok ? "the reason was empty" : `the reason quoted ${why.stray.join(", ")}, which the game never gave`);
    reason = `Chose ${picked.label}.`;
  }
  if (/\d/.test(spoken)) {
    edits.push("the spoken line contained a number");
    spoken = "";
  }
  return { optionId: picked.id, reason, line: spoken, ...(edits.length ? { edited: `Corrected by the game: ${edits.join("; ")}.` } : {}) };
}

function connectionFor(connection?: ModelConnection) {
  const url = connection ? connection.url : process.env.FARSHORE_MODEL_URL;
  const model = connection ? connection.model : process.env.FARSHORE_MODEL_NAME;
  const key = connection ? connection.key : process.env.FARSHORE_API_KEY;
  return url && model ? { url, model, key } : null;
}

export async function POST(request: Request, connection?: ModelConnection) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Decision requests must come from Farshore." }, { status: 403 });
  let data: z.infer<typeof input>;
  try {
    const raw = await request.text();
    if (raw.length > 6000) return Response.json({ error: "Decision request is too large." }, { status: 413 });
    data = input.parse(JSON.parse(raw));
  } catch { return Response.json({ error: "Unsupported decision request." }, { status: 400 }); }
  const target = connectionFor(connection);
  if (!target) return Response.json({ error: "No AI rival is connected." }, { status: 503 });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(data.kind === "choose" ? 20_000 : 30_000)]);
  try {
    if (data.kind === "choose") {
      const { system, user } = decisionPrompt(data);
      const schema = {
        type: "object",
        properties: {
          optionId: { type: "string", enum: data.options.map(o => o.id) },
          reason: { type: "string", minLength: 3, maxLength: 200 },
          line: { type: "string", minLength: 2, maxLength: 140 },
        },
        required: ["optionId", "reason", "line"],
        additionalProperties: false,
      };
      const reply = z.object({ optionId: z.string(), reason: z.string().max(400), line: z.string().max(400) }).strict().parse(await chatJson({
        connection: target, name: "farshore_decision", schema, system, user,
        maxTokens: 140, temperature: data.lab ? 0 : 0.2, signal,
      }));
      const checked = verifyChoice(data, reply);
      if (!checked) throw new SyntaxError("Option not on the menu");
      return Response.json({ ...checked, model: target.model }, { headers: { "Cache-Control": "no-store" } });
    }
    const { system, user } = debriefPrompt(data);
    const schema = { type: "object", properties: { text: { type: "string", minLength: 10, maxLength: 360 } }, required: ["text"], additionalProperties: false };
    const reply = z.object({ text: z.string().max(800) }).strict().parse(await chatJson({
      connection: target, name: "farshore_debrief", schema, system, user,
      maxTokens: 160, temperature: 0.6, signal,
    }));
    const text = cleanText(reply.text, 360);
    const allowed = allowedNumbers(data.facts, ...data.picks.map(p => ({ [`${p.point} ${p.label}`]: p.outcome })));
    if (text.length < 10 || !groundedNumbers(text, allowed).ok) throw new SyntaxError("Ungrounded debrief");
    return Response.json({ text, model: target.model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const cancelled = request.signal.aborted;
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const invalid = error instanceof SyntaxError || error instanceof z.ZodError;
    const busy = error instanceof ModelError && error.code === "busy";
    return Response.json(
      { error: cancelled ? "Decision cancelled." : timeout ? "The model took too long." : invalid ? "The model's answer could not be verified." : busy ? "The model is busy." : "The model is not reachable.", code: cancelled ? "cancelled" : timeout ? "timeout" : invalid ? "invalid_choice" : busy ? "busy" : "unreachable" },
      { status: cancelled ? 499 : timeout ? 504 : invalid ? 422 : busy ? 429 : 503 },
    );
  }
}
