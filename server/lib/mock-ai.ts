import { trialFor, planDescription, type TrialId, type OpponentPlan } from "../../src/lib/arcade/arcade.ts";
import { runtimeConfig } from "./runtime-config.ts";

/**
 * Test-only stand-in for the AI service (CMPS 4200 Phase 3 "mock AI service").
 * Every model request from the arcade passes through `modelApi`, which asks this
 * module first; when a mock mode is active it answers here and the model is never
 * called. Normal play is unchanged: with no mode set, the live model is required.
 *
 * Modes come from FARSHORE_AI_MOCK (whole server) or, on a local server only, the
 * `farshore-ai-mock` cookie set by /api/ai-mock?mode=... so a moderator can switch
 * modes during a session from a second tab. The "-once" modes fail one strategy
 * request, then fall back to success, so the player can recover by retrying.
 */
export const mockModes = ["success", "slow", "uncertain", "uncertain-once", "error", "error-once", "offline"] as const;
export type MockMode = (typeof mockModes)[number];
export const MOCK_COOKIE = "farshore-ai-mock";
const SLOW_MS = 12_000;
const lastPlan: Partial<Record<TrialId, OpponentPlan["planId"]>> = {};

const isMode = (value: unknown): value is MockMode => mockModes.includes(value as MockMode);

export function mockMode(request: Request): MockMode | null {
  const env = process.env.FARSHORE_AI_MOCK;
  if (isMode(env)) return env;
  if (!runtimeConfig().local) return null;
  const cookie = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${MOCK_COOKIE}=([a-z-]+)`))?.[1];
  return isMode(cookie) ? cookie : null;
}

export function mockCookie(mode: MockMode | "off") {
  return mode === "off" ? `${MOCK_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict` : `${MOCK_COOKIE}=${mode}; Path=/; SameSite=Strict`;
}

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

/** The status check: the same shape as the live GET, naming the mock as the model. */
export function mockStatus(mode: MockMode) {
  const online = mode !== "offline";
  return Response.json({
    aiConfigured: true,
    aiAvailable: online,
    message: online ? "Mock AI service (test mode). No model is called." : "Mock AI service (test mode): the model service is unreachable. Start your model service, then check again.",
    model: online ? "mock-ai (test mode)" : null,
    commentary: online ? "mock-ai (test mode)" : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

/** A strategy request: success, slow success, uncertain (rejected plan) or error, as the live POST would answer. */
export async function mockStrategy(request: Request, mode: MockMode) {
  const body = await request.json().catch(() => null) as { trialId?: TrialId } | null;
  const trial = body?.trialId ? trialFor(body.trialId) : null;
  if (!trial || !body?.trialId) return Response.json({ error: "Choose a supported encounter and difficulty." }, { status: 400 });
  // A "-once" failure is used up by this request; the next one succeeds.
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (mode === "error-once" || mode === "uncertain-once") headers["Set-Cookie"] = mockCookie("success");
  try { await wait(mode === "slow" ? SLOW_MS : 1500, request.signal); }
  catch { return Response.json({ error: "Preparation cancelled.", code: "cancelled" }, { status: 499, headers }); }
  if (mode === "offline" || mode === "error" || mode === "error-once") {
    return Response.json({ error: "The model service could not prepare the rival. Retry in a moment.", code: "provider_error" }, { status: 502, headers });
  }
  if (mode === "uncertain" || mode === "uncertain-once") {
    return Response.json({ error: "The model returned a strategy the game could not verify, so it was set aside. Nothing changed. Prepare another.", code: "invalid_plan" }, { status: 422, headers });
  }
  // Each success moves to the trial's next strategy, so "Ask for another strategy" visibly changes the plan.
  const planId = trial.plans[(trial.plans.indexOf(lastPlan[body.trialId] ?? trial.plans[0]) + 1) % trial.plans.length];
  lastPlan[body.trialId] = planId;
  const plan: OpponentPlan = { planId, focus: body.trialId === "cyclops" ? "center" : "balanced", source: "ai" };
  return Response.json({ plan, description: planDescription(body.trialId, plan), taunt: trial.quote, source: "ai", mock: true }, { headers });
}

const lines = {
  bard: ["The mock bard watches the trial unfold.", "Steady now, the sea is listening.", "A test of nerve, and a test of the game."],
  rival: ["You will not pass so easily.", "I have seen this move before.", "Again, Odysseus. Again."],
};

/** Live commentary: a short canned line, or an error in the failing modes. */
export async function mockCommentary(request: Request, mode: MockMode) {
  const body = await request.json().catch(() => null) as { speaker?: "bard" | "rival" } | null;
  const speaker = body?.speaker === "rival" ? "rival" : "bard";
  if (mode === "offline" || mode === "error") return Response.json({ error: "No model is connected." }, { status: 503 });
  await new Promise(resolve => setTimeout(resolve, mode === "slow" ? 4000 : 400));
  const pool = lines[speaker];
  return Response.json({ line: pool[Math.floor(Math.random() * pool.length)], speaker }, { headers: { "Cache-Control": "no-store" } });
}
