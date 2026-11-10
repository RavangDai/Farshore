import { z } from "zod/v3";
import { trialFor, validPlan, planDescription, type TrialId, type OpponentPlan } from "../src/lib/arcade/arcade.ts";
import { GET as modelGET, type ModelConnection } from "./turn.ts";
import { modelText } from "./lib/chat.ts";
import { cleanLine } from "../src/lib/arcade/commentary.ts";
import { personas } from "../src/lib/arcade/rivals.ts";

const summary = z.object({ won: z.boolean(), source: z.enum(["ai", "standard"]), hits: z.number().int().min(0).max(100), successes: z.number().int().min(0).max(100), early: z.number().int().min(0).max(100), late: z.number().int().min(0).max(100), misses: z.number().int().min(0).max(100), laneMs: z.tuple([z.number().int().min(0).max(60000), z.number().int().min(0).max(60000), z.number().int().min(0).max(60000)]), score: z.number().int().min(0).max(1000000).optional(), timeMs: z.number().int().min(0).max(3600000).optional(), difficulty: z.enum(["easy", "normal", "hard"]).optional(), laneMisses: z.tuple([z.number().int().min(0).max(100), z.number().int().min(0).max(100), z.number().int().min(0).max(100), z.number().int().min(0).max(100)]).optional() }).strict();
const input = z.object({ trialId: z.enum(["lotus", "cyclops", "aeolus", "circe", "sirens", "scylla", "calypso", "bow"]), difficulty: z.enum(["easy", "normal", "hard"]), recent: z.array(summary).max(2) }).strict();
export async function GET(connection?: ModelConnection) {
  const response = await modelGET(connection), status = await response.json();
  // Every encounter is played against a model-planned rival, so the status is
  // also the gate: no reachable model, no encounter.
  if (!status.aiConfigured) status.message = "No AI rival is connected. Start a model service to play.";
  const url = connection ? connection.url : process.env.FARSHORE_MODEL_URL;
  status.model = status.aiAvailable ? (connection ? connection.model : process.env.FARSHORE_MODEL_NAME) : null;
  status.commentary = status.aiAvailable ? (!connection || url === process.env.FARSHORE_MODEL_URL) && process.env.FARSHORE_COMMENTARY_MODEL || status.model : null;
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, connection?: ModelConnection) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Opponent requests must come from Farshore." }, { status: 403 });
  let data: z.infer<typeof input>;
  try {
    const raw = await request.text();
    if (raw.length > 6000) return Response.json({ error: "Opponent request is too large." }, { status: 413 });
    data = input.parse(JSON.parse(raw));
  } catch { return Response.json({ error: "Choose a supported encounter and difficulty. At most two attempt summaries are accepted." }, { status: 400 }); }
  const url = connection ? connection.url : process.env.FARSHORE_MODEL_URL, model = connection ? connection.model : process.env.FARSHORE_MODEL_NAME, key = connection ? connection.key : process.env.FARSHORE_API_KEY;
  if (!url || !model) return Response.json({ error: "No AI rival is connected. Start your model service, then retry." }, { status: 503 });
  const trial = trialFor(data.trialId as TrialId);
  const laneTotals = [0, 1, 2].map(i => data.recent.reduce((sum, a) => sum + a.laneMs[i], 0));
  const maxLane = Math.max(...laneTotals);
  const dominantLane = maxLane > 0 ? ["left", "center", "right"][laneTotals.indexOf(maxLane)] : "no previous lane preference";
  const early = data.recent.reduce((sum, a) => sum + a.early, 0), late = data.recent.reduce((sum, a) => sum + a.late, 0);
  const laneMisses = [0, 1, 2, 3].map(i => data.recent.reduce((n, a) => n + (a.laneMisses?.[i] || 0), 0));
  const observations = { mostUsedLane: dominantLane, weakestSongLane: Math.max(...laneMisses) ? ["red", "blue", "green", "gold"][laneMisses.indexOf(Math.max(...laneMisses))] : "no missed lane yet", timingTendency: early > late ? "early" : late > early ? "late" : "balanced", repeatedLosses: data.recent.length === 2 && data.recent.every(a => !a.won) };
  const expectedFocus = data.trialId === "cyclops" ? maxLane > 0 ? dominantLane : "center" : observations.timingTendency;
  // AI uses a different tactical catalog from the standard repeating pattern.
  const aiPlans = trial.plans.slice(1);
  // The taunt is the rival's opening line, spoken as the encounter starts. It is
  // flavour only: it never feeds back into the plan or the rules.
  const schema = { type: "object", properties: { planId: { type: "string", enum: aiPlans }, focus: { type: "string", enum: [expectedFocus] }, taunt: { type: "string", minLength: 2, maxLength: 140 } }, required: ["planId", "focus", "taunt"], additionalProperties: false };
  // Each line describes what the plan really does in that engine, so the model
  // is choosing between real behaviours. Prefer the gentler plan after losses.
  const policyGuide = {
    lotus: "From Medium up, pincer sends the second guardian round to cut Odysseus off from the far side; undertow sends it to the junction ahead, or onto the path home while he carries a sailor. On Easy the guardians patrol. All moves obey walls and fixed step times. Prefer pincer for repeated losses, otherwise undertow.",
    aeolus: "pincer swings the wind-gate openings higher and lower; undertow adds counter-gusts that answer the player's lift rhythm, from Medium up. Neither changes collision windows. Prefer pincer for repeated losses, otherwise undertow.",
    calypso: "pincer, the storm watch, strikes more often at the timber where Odysseus stands; undertow, landing prediction, strikes where the current will carry him, from Medium up. Every strike keeps a verified safe hop. Prefer pincer for repeated losses, otherwise undertow.",
    cyclops: "focused hunts the runner's current lane through the first section of the cave; sweep forecasts his next lane from his lane history. Each later section is re-planned live. Every throw is warned and leaves an escape lane that needs no jump or slide. Prefer focused for repeated losses, otherwise sweep.",
    circe: "chain previews the next potion for multi-chain matches; hoard uses the same planning but banks curses until the other board is crowded. Prefer chain for repeated losses, otherwise hoard.",
    sirens: "swell leans each melody toward the lane Odysseus misses most; echo leans toward melodies with rests and changes. Each melody is then chosen live from fair options. Choose using the missed-lane history.",
    scylla: "pincer sends heads around the shield and synchronizes moderate whirlpool pull; undertow adds stronger synchronized pull during approaching attacks. Prefer pincer for repeated losses, otherwise undertow.",
    bow: "surge, the wind reader, reads the full draught; feint, the block-shot gambit, favours lodging an arrow to narrow an opening for Odysseus' next shot. Each arrow is then chosen live from measured shots. Prefer surge for repeated losses, otherwise feint.",
  }[data.trialId];
  try {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
      body: JSON.stringify({ model, stream: false, temperature: 0.2, max_tokens: 160,
        response_format: { type: "json_schema", json_schema: { name: "farshore_opponent", strict: true, schema } },
        messages: [{ role: "system", content: `Prepare ${trial.character}'s policy. Output a JSON object with exactly planId, focus and taunt. Choose planId from ${aiPlans.join(" or ")}. focus must be exactly "${expectedFocus}", the game-derived habit. ${policyGuide} These policies execute locally after preparation. You cannot change speed, hit windows, scoring or progress. taunt: one spoken sentence of at most 16 words, in character as ${personas[data.trialId as TrialId]}, addressed to Odysseus, hinting at your chosen strategy without numbers. Return JSON only.` }, { role: "user", content: JSON.stringify({ encounter: data.trialId, difficulty: data.difficulty, observations, requiredFocus: expectedFocus, previousWins: data.recent.filter(a => a.won).length }) }],
      }),
    });
    if (!response.ok) return Response.json({ error: response.status === 429 ? "The model is busy. Retry in a moment." : "The model service could not prepare the rival. Retry in a moment.", code: "provider_error" }, { status: 502 });
    const body = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).parse(await response.json());
    const { taunt, ...candidate } = z.object({ planId: z.string(), focus: z.string(), taunt: z.string().max(400).optional() }).strict().parse(JSON.parse(modelText(body.choices[0].message.content)));
    const plan = { ...candidate, source: "ai" };
    if (!validPlan(data.trialId, plan) || !aiPlans.includes(plan.planId) || plan.focus !== expectedFocus) throw new Error("Invalid plan");
    if (request.signal.aborted) return Response.json({ error: "Preparation cancelled." }, { status: 499 });
    const line = cleanLine(taunt || "");
    return Response.json({ plan: plan as OpponentPlan, description: planDescription(data.trialId, plan), taunt: line.length > 1 ? line : trial.quote, source: "ai" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const cancelled = request.signal.aborted;
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const invalid = error instanceof SyntaxError || error instanceof z.ZodError || (error instanceof Error && error.message === "Invalid plan");
    return Response.json({ error: cancelled ? "Preparation cancelled." : timeout ? "The model took too long. It may still be loading; retry in a moment." : invalid ? "The model returned an unsupported strategy. Nothing changed. Prepare another." : "The model is not reachable. Start your model service, then retry.", code: cancelled ? "cancelled" : invalid ? "invalid_plan" : timeout ? "timeout" : "unreachable" }, { status: cancelled ? 499 : timeout ? 504 : invalid ? 422 : 503 });
  }
}
