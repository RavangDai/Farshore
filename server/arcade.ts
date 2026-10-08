import { z } from "zod";
import { trialFor, validPlan, planDescription, type TrialId, type OpponentPlan } from "../src/lib/arcade.ts";
import { GET as modelGET } from "./turn.ts";

const summary = z.object({ won: z.boolean(), source: z.enum(["ai", "standard"]), hits: z.number().int().min(0).max(100), successes: z.number().int().min(0).max(100), early: z.number().int().min(0).max(100), late: z.number().int().min(0).max(100), misses: z.number().int().min(0).max(100), laneMs: z.tuple([z.number().int().min(0).max(60000), z.number().int().min(0).max(60000), z.number().int().min(0).max(60000)]), laneMisses: z.tuple([z.number().int().min(0).max(100), z.number().int().min(0).max(100), z.number().int().min(0).max(100), z.number().int().min(0).max(100)]).optional() }).strict();
const input = z.object({ trialId: z.enum(["cyclops", "circe", "sirens", "scylla", "bow"]), difficulty: z.enum(["easy", "normal", "hard"]), recent: z.array(summary).max(2) }).strict();
export async function GET() {
  const response = await modelGET(), status = await response.json();
  if (!status.aiConfigured) status.message = "Solo and adaptive AI are ready. Connect a model for optional strategy planning.";
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
  const laneMisses = [0, 1, 2, 3].map(i => data.recent.reduce((n, a) => n + (a.laneMisses?.[i] || 0), 0));
  const observations = { mostUsedLane: dominantLane, weakestSongLane: Math.max(...laneMisses) ? ["red", "blue", "green", "gold"][laneMisses.indexOf(Math.max(...laneMisses))] : "no missed lane yet", timingTendency: early > late ? "early" : late > early ? "late" : "balanced", repeatedLosses: data.recent.length === 2 && data.recent.every(a => !a.won) };
  const expectedFocus = data.trialId === "cyclops" ? maxLane > 0 ? dominantLane : "center" : observations.timingTendency;
  // AI uses a different tactical catalog from the standard repeating pattern.
  const aiPlans = trial.plans.slice(1);
  const schema = { type: "object", properties: { planId: { type: "string", enum: aiPlans }, focus: { type: "string", enum: [expectedFocus] } }, required: ["planId", "focus"], additionalProperties: false };
  const policyGuide = {
    cyclops: "focused follows a heatmap of audible footsteps; sweep predicts the next grid position from the last two noise clues. The blind giant cannot see the player. Prefer focused for repeated losses, otherwise sweep.",
    circe: "chain previews the next potion for multi-chain matches; hoard uses the same planning but banks curses until the other board is crowded. Prefer chain for repeated losses, otherwise hoard.",
    sirens: "swell repeats the weakest missed sound lane in new melodies; echo also adds visible rests and changes tempo between melodies. Choose a melody strategy using the missed-lane history.",
    scylla: "pincer sends heads around the shield and synchronizes moderate whirlpool pull; undertow adds stronger synchronized pull during approaching attacks. Prefer pincer for repeated losses, otherwise undertow.",
    bow: "surge calculates wind compensation for scored shots; feint can sacrifice rings to block and narrow the player's next ring opening. Prefer surge for repeated losses, otherwise feint.",
  }[data.trialId];
  try {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...(process.env.FARSHORE_API_KEY ? { Authorization: "Bearer " + process.env.FARSHORE_API_KEY } : {}) },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
      body: JSON.stringify({ model, stream: false, temperature: 0, max_tokens: 100,
        response_format: { type: "json_schema", json_schema: { name: "farshore_opponent", strict: true, schema } },
        messages: [{ role: "system", content: `Prepare ${trial.character}'s policy. Output a JSON object with exactly planId and focus. Choose planId from ${aiPlans.join(" or ")}. focus must be exactly "${expectedFocus}", the game-derived habit. ${policyGuide} These policies execute locally after preparation. You cannot change speed, hit windows, scoring or progress. Return JSON only.` }, { role: "user", content: JSON.stringify({ encounter: data.trialId, difficulty: data.difficulty, observations, requiredFocus: expectedFocus, previousWins: data.recent.filter(a => a.won).length }) }],
      }),
    });
    if (!response.ok) return Response.json({ error: response.status === 429 ? "The model is busy. Retry shortly, or play a standard opponent." : "The model service could not prepare the opponent. Retry or play standard.", code: "provider_error" }, { status: 502 });
    const body = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).parse(await response.json());
    const candidate = z.object({ planId: z.string(), focus: z.string() }).strict().parse(JSON.parse(body.choices[0].message.content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")));
    const plan = { ...candidate, source: "ai" };
    if (!validPlan(data.trialId, plan) || !aiPlans.includes(plan.planId) || plan.focus !== expectedFocus) throw new Error("Invalid plan");
    if (request.signal.aborted) return Response.json({ error: "Preparation cancelled." }, { status: 499 });
    return Response.json({ plan: plan as OpponentPlan, description: planDescription(data.trialId, plan), source: "ai" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const cancelled = request.signal.aborted;
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const invalid = error instanceof SyntaxError || error instanceof z.ZodError || (error instanceof Error && error.message === "Invalid plan");
    return Response.json({ error: cancelled ? "Preparation cancelled." : timeout ? "The model took too long. Retry or play a standard opponent." : invalid ? "The model returned an unsupported strategy. Nothing changed. Prepare another or play standard." : "The model is not reachable. Start your model service, retry, or play standard.", code: cancelled ? "cancelled" : invalid ? "invalid_plan" : timeout ? "timeout" : "unreachable" }, { status: cancelled ? 499 : timeout ? 504 : invalid ? 422 : 503 });
  }
}
