import type { TrialId } from "../arcade/arcade";
import type { OracleCheck, OracleQuestion } from "../../../server/oracle/oracle";

/**
 * The Oracle's Key, on the client: asking for a question, remembering the
 * last few per trial so the next one differs, and the player's choice to have
 * the Oracle before encounters at all. The question itself is written and
 * checked on the server (server/oracle).
 */

export type { OracleCheck, OracleQuestion };
export type OracleState =
  | { status: "idle"; trial: null }
  | { status: "loading"; trial: TrialId; started: number }
  | { status: "ready"; trial: TrialId; item: OracleQuestion }
  | { status: "error"; trial: TrialId; error: string };

const PREF = "farshore-oracle-key";
const RECENT = "farshore-oracle-recent";

/** On unless the player has turned it off in Settings. */
export function readOracleEnabled() {
  try { return localStorage.getItem(PREF) !== "off"; } catch { return true; }
}
export function writeOracleEnabled(on: boolean) {
  try { localStorage.setItem(PREF, on ? "on" : "off"); } catch { /* Storage is optional. */ }
}

function recentAll(): Record<string, string[]> {
  try { const v = JSON.parse(localStorage.getItem(RECENT) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
export const recentQuestions = (trial: TrialId) => (Array.isArray(recentAll()[trial]) ? recentAll()[trial].filter(q => typeof q === "string").slice(-6) : []);
export function rememberQuestion(trial: TrialId, question: string) {
  const all = recentAll();
  all[trial] = [...(Array.isArray(all[trial]) ? all[trial] : []), question].slice(-6);
  try { localStorage.setItem(RECENT, JSON.stringify(all)); } catch { /* Storage is optional. */ }
}

export class OracleError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

/** One fresh question for a trial, avoiding the last few asked here. */
export async function askOracle(trialId: TrialId, signal: AbortSignal): Promise<OracleQuestion> {
  const response = await fetch("/api/oracle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trialId, avoid: recentQuestions(trialId) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(200_000)]),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new OracleError(typeof body.error === "string" ? body.error : "The Oracle could not be reached.", body.code);
  return body as OracleQuestion;
}
