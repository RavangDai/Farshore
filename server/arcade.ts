import { z } from "zod";
import { trialFor, validPlan, planDescription, type TrialId, type OpponentPlan } from "../src/lib/arcade.ts";
import { GET as modelGET } from "./turn.ts";

const summary = z.object({ won: z.boolean(), source: z.enum(["ai", "standard"]), hits: z.number().int().min(0).max(100), successes: z.number().int().min(0).max(100), early: z.number().int().min(0).max(100), late: z.number().int().min(0).max(100), misses: z.number().int().min(0).max(100), laneMs: z.tuple([z.number().int().min(0).max(60000), z.number().int().min(0).max(60000), z.number().int().min(0).max(60000)]) }).strict();
const input = z.object({ trialId: z.enum(["cyclops", "sirens", "bow"]), difficulty: z.enum(["easy", "normal", "hard"]), recent: z.array(summary).max(2) }).strict();
export async function GET() {
  const response = await modelGET(), status = await response.json();
  if (!status.aiConfigured) status.message = "Play is ready. Connect a model to prepare AI opponents.";
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Opponent requests must come from Farshore." }, { status: 403 });
  let data: z.infer<typeof input>;
  try {
    const raw = await request.text();
    if (raw.length > 6000) return Response.json({ error: "Opponent request is too large." }, { status: 413 });
    data = input.parse(JSON.parse(raw));
  } catch { return Response.json({ error: "Choose a supported encounter and difficulty. At most two attempt summaries are accepted." }, { status: 400 }); }
  const url = process.env.FARSHORE_MODEL_URL, model = process.env.FARSHORE_MODEL_NAME;
  if (!url || !model) return Response.json({ error: "No model is configured. You can play a standard opponent." }, { status: 503 });
  const trial = trialFor(data.trialId as TrialId);
  const laneTotals = [0, 1, 2].map(i => data.recent.reduce((sum, a) => sum + a.laneMs[i], 0));
  const maxLane = Math.max(...laneTotals);
  const dominantLane = maxLane > 0 ? ["left", "center", "right"][laneTotals.indexOf(maxLane)] : "no previous lane preference";
  const early = data.recent.reduce((sum, a) => sum + a.early, 0), late = data.recent.reduce((sum, a) => sum + a.late, 0);
  const observations = { mostUsedLane: dominantLane, timingTendency: early > late ? "early" : late > early ? "late" : "balanced", repeatedLosses: data.recent.length === 2 && data.recent.every(a => !a.won) };
  // AI uses a different tactical catalog from the standard repeating pattern.
  const aiPlans = trial.plans.slice(1);
  const schema = { type: "object", properties: { planId: { type: "string", enum: aiPlans }, focus: { type: "string", enum: trial.focuses } }, required: ["planId", "focus"], additionalProperties: false };
  try {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...(process.env.FARSHORE_API_KEY ? { Authorization: "Bearer " + process.env.FARSHORE_API_KEY } : {}) },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
      body: JSON.stringify({ model, stream: false, temperature: 0, max_tokens: 100,
        response_format: { type: "json_schema", json_schema: { name: "farshore_opponent", strict: true, schema } },
        messages: [{ role: "system", content: `Choose an opponent policy for ${trial.title}. Return only JSON with planId and focus. Allowed planId: ${aiPlans.join(" or ")}. Allowed focus: ${trial.focuses.join(", ")}. Rules: Cyclops focused hunts the player's favored lane and locally reacts to lane habits; sweep uses cycling crossfire. Pick focused if a previous lane preference exists; otherwise sweep. Cyclops focus MUST equal observations.mostUsedLane if it is left, center, or right; otherwise center. Sirens swell alternates fast/slow beats; echo alternates direction with uneven beats. Bow surge alternates sight direction; feint changes sight speed. Timing focus MUST equal observations.timingTendency. Favor echo/feint after successful attempts, swell/surge after losses. Do not choose a standard plan. The local engine executes your policy and locks warnings before attacks. Difficulty controls speed and precision independently. You cannot change hit windows, scoring or progress. Use the explicit observations supplied, not guesses.` }, { role: "user", content: JSON.stringify({ encounter: data.trialId, difficulty: data.difficulty, observations, previousWins: data.recent.filter(a => a.won).length }) }],
      }),
    });
    if (!response.ok) return Response.json({ error: response.status === 429 ? "The model is busy. Retry shortly, or play a standard opponent." : "The model service could not prepare the opponent. Retry or play standard.", code: "provider_error" }, { status: 502 });
    const body = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).parse(await response.json());
    const candidate = z.object({ planId: z.string(), focus: z.string() }).strict().parse(JSON.parse(body.choices[0].message.content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")));
    const plan = { ...candidate, source: "ai" };
    if (!validPlan(data.trialId, plan) || !aiPlans.includes(plan.planId)) throw new Error("Invalid plan");
    if (request.signal.aborted) return Response.json({ error: "Preparation cancelled." }, { status: 499 });
    return Response.json({ plan: plan as OpponentPlan, description: planDescription(data.trialId, plan), source: "ai" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const cancelled = request.signal.aborted;
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const invalid = error instanceof SyntaxError || error instanceof z.ZodError || (error instanceof Error && error.message === "Invalid plan");
    return Response.json({ error: cancelled ? "Preparation cancelled." : timeout ? "The model took too long. Retry or play a standard opponent." : invalid ? "The model returned an unsupported strategy. Nothing changed. Prepare another or play standard." : "The model is not reachable. Start your model service, retry, or play standard.", code: cancelled ? "cancelled" : invalid ? "invalid_plan" : timeout ? "timeout" : "unreachable" }, { status: cancelled ? 499 : timeout ? 504 : invalid ? 422 : 503 });
  }
}
