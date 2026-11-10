import type { Difficulty, TrialId } from "./arcade.ts";
import { cleanLine } from "./commentary.ts";

// In-game model decisions: the game proposes, the model picks, the game rules.
//
// At a decision point an engine builds a menu of options it has already checked
// are fair, each carrying the real numbers that describe it. The model picks one
// by id and says why. The engine then executes that option with its own physics,
// its own seeded error and its own scoring: the model chooses intent, never the
// outcome. Everything here is plain data so a whole engine state, pending menu
// included, still survives `structuredClone` on every tick.

export type FactValue = string | number;
/** Labelled values, already formatted the way the player would read them. */
export type Facts = Record<string, FactValue>;

export type DecisionOption = {
  /** Short machine id, e.g. "block-6". Unique within its menu. */
  id: string;
  /** What the option is, in the game's words: "Lodge an arrow in axe 6". */
  label: string;
  /** The numbers that describe it, shown to the model and in the inspector. */
  features: Facts;
  /** The engine's own utility. Never sent to the model; used for the game's pick. */
  score: number;
};

export type DecisionMenu = {
  /** Deterministic, `<trial>-<seq>`, so a late answer can never land on the wrong menu. */
  id: string;
  /** The decision point in words: "Antinous' arrow 3 of 5". */
  point: string;
  facts: Facts;
  options: DecisionOption[];
  /** The option the game itself would choose: the highest engine score. */
  enginePick: string;
  /** Simulation ms when the menu opened. */
  openedAt: number;
};

export type ModelChoice = {
  menuId: string;
  optionId: string;
  /** One sentence, checked against the facts before it reaches the engine. */
  reason: string;
  /** One spoken line in the rival's voice. May be empty. */
  line: string;
  /** The model that chose, as the server names it. */
  model?: string;
  latencyMs: number;
  /** Set when the server replaced part of the model's text, and why. */
  edited?: string;
};

export type ChoiceFailure = "timeout" | "invalid" | "unreachable";

export type ChoiceAction =
  | { type: "choose"; choice: ModelChoice }
  | { type: "choose-failed"; menuId: string; why: ChoiceFailure };

/** A pending decision as an engine holds it. */
export type PendingDecision = { menu: DecisionMenu; choice: ModelChoice | null; failed: ChoiceFailure | null };

/** Who made the pick that was executed, recorded on the decision for the inspector. */
export type Chooser = {
  by: "model" | "game";
  model?: string;
  latencyMs?: number;
  /** The game's own top option, by label, for the side-by-side. */
  enginePick: string;
  /** The same option's candidate id, where a controller's candidates are named by id rather than label. */
  engineAction?: string;
  agreed?: boolean;
  /** Why the game picked instead, or what was corrected in the model's text. */
  note?: string;
};

export function enginePickOf(options: DecisionOption[]): string {
  let best = options[0];
  for (const option of options) if (option.score > best.score) best = option;
  return best.id;
}

export function openMenu(id: string, point: string, facts: Facts, options: DecisionOption[], openedAt: number): DecisionMenu {
  return { id, point, facts, options, enginePick: enginePickOf(options), openedAt: Math.round(openedAt) };
}

/** Apply a model answer to a pending decision. Anything not for this menu, or not on it, is ignored. */
export function acceptChoice(pending: PendingDecision | null, action: ChoiceAction): PendingDecision | null {
  if (!pending || pending.choice || pending.failed) return pending;
  if (action.type === "choose-failed") return action.menuId === pending.menu.id ? { ...pending, failed: action.why } : pending;
  const { choice } = action;
  if (choice.menuId !== pending.menu.id || !pending.menu.options.some(o => o.id === choice.optionId)) return pending;
  return { ...pending, choice: { ...choice } };
}

const FAILURE_NOTES: Record<ChoiceFailure, string> = {
  timeout: "the model did not answer in time, so the game played its own top option",
  invalid: "the model's reply could not be verified, so the game played its own top option",
  unreachable: "the model could not be reached, so the game played its own top option",
};

/**
 * Settle a pending decision into the option to execute and the record of who
 * chose it. With no answer yet, the game's own top option plays and the record
 * says why: a decision is never silently attributed to the model.
 */
export function settle(pending: PendingDecision): { option: DecisionOption; chooser: Chooser; reason: string; line: string } {
  const { menu, choice } = pending;
  const engine = menu.options.find(o => o.id === menu.enginePick) ?? menu.options[0];
  const picked = choice ? menu.options.find(o => o.id === choice.optionId) : undefined;
  if (choice && picked) {
    return {
      option: picked,
      reason: choice.reason,
      line: choice.line,
      chooser: {
        by: "model",
        model: choice.model,
        latencyMs: choice.latencyMs,
        enginePick: engine.label,
        agreed: picked.id === engine.id,
        ...(choice.edited ? { note: choice.edited } : {}),
      },
    };
  }
  return {
    option: engine,
    reason: `Game's pick: ${engine.label}, the highest-scored option.`,
    line: "",
    chooser: { by: "game", enginePick: engine.label, agreed: true, note: FAILURE_NOTES[pending.failed ?? "timeout"] },
  };
}

// ---------------------------------------------------------------------------
// Grounding: a reason may only quote numbers the game supplied.
// ---------------------------------------------------------------------------

const NUMBER = /\d+(?:\.\d+)?/g;

/** The numbers a text contains, as written ("8.4", "52"). */
export const numbersIn = (text: string) => text.match(NUMBER) ?? [];

/** Every number the facts make available, plus whole-number roundings of decimals. */
export function allowedNumbers(...sources: Facts[]): Set<string> {
  const allowed = new Set<string>();
  for (const facts of sources) {
    for (const [key, value] of Object.entries(facts)) {
      for (const n of [...numbersIn(key), ...numbersIn(String(value))]) {
        allowed.add(String(Number(n)));
        allowed.add(String(Math.round(Number(n))));
      }
    }
  }
  return allowed;
}

/** Whether every number in `text` came from the facts. `stray` lists the ones that did not. */
export function groundedNumbers(text: string, allowed: Set<string>): { ok: boolean; stray: string[] } {
  const stray = numbersIn(text).filter(n => !allowed.has(String(Number(n))));
  return { ok: stray.length === 0, stray };
}

// ---------------------------------------------------------------------------
// The client side: one request per menu, answers delivered as engine actions.
// ---------------------------------------------------------------------------

export type DecisionRequest = {
  kind: "choose";
  trialId: TrialId;
  difficulty: Difficulty;
  point: string;
  facts: Facts;
  options: { id: string; label: string; features: Facts }[];
  recent: string[];
  lab?: boolean;
};

export type DecisionReply = { optionId: string; reason: string; line: string; model?: string; edited?: string };

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** The model only ever sees an option's id, label and features, never the engine's own score. */
export function requestFor(menu: DecisionMenu, trialId: TrialId, difficulty: Difficulty, recent: string[], lab = false): DecisionRequest {
  return {
    kind: "choose",
    trialId,
    difficulty,
    point: menu.point,
    facts: menu.facts,
    options: menu.options.map(({ id, label, features }) => ({ id, label, features })),
    recent: recent.slice(-3),
    ...(lab ? { lab: true } : {}),
  };
}

type DirectorOptions = {
  trialId: TrialId;
  difficulty: Difficulty;
  lab?: boolean;
  onAction: (action: ChoiceAction) => void;
  fetcher?: Fetcher;
  now?: () => number;
  /** A hard ceiling on one request; the engine's own wait is shorter. */
  timeoutMs?: number;
};

/**
 * Asks the model once per menu. A newer menu cancels an older request, an
 * answer is delivered as a `choose` action the engine re-validates, and any
 * failure becomes a `choose-failed` action so the engine can stop waiting at
 * once rather than at its cap.
 */
export class DecisionDirector {
  private current: string | null = null;
  private controller: AbortController | null = null;
  private stopped = false;
  private recent: string[] = [];
  private readonly options: DirectorOptions;

  constructor(options: DirectorOptions) { this.options = options; }

  private now() { return this.options.now ? this.options.now() : performance.now(); }

  /** Lines the rival has already spoken this encounter, so it does not repeat itself. */
  remember(line: string) { if (line) this.recent = [...this.recent, line].slice(-4); }

  offer(menu: DecisionMenu | null) {
    if (this.stopped || !menu || menu.id === this.current) return;
    this.controller?.abort();
    this.current = menu.id;
    const controller = new AbortController();
    this.controller = controller;
    void this.send(menu, controller);
  }

  /** A restarted encounter replays the same menu ids, so the director forgets the last one. */
  reset() {
    this.controller?.abort();
    this.controller = null;
    this.current = null;
    this.recent = [];
  }

  dispose() {
    this.stopped = true;
    this.controller?.abort();
    this.controller = null;
  }

  private async send(menu: DecisionMenu, controller: AbortController) {
    const started = this.now();
    const fetcher: Fetcher = this.options.fetcher ?? ((input, init) => fetch(input, init));
    const body = requestFor(menu, this.options.trialId, this.options.difficulty, this.recent, this.options.lab);
    let action: ChoiceAction;
    try {
      const response = await fetcher("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(this.options.timeoutMs ?? 20000)]),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<DecisionReply>;
      if (response.ok && typeof data.optionId === "string") {
        action = {
          type: "choose",
          choice: {
            menuId: menu.id,
            optionId: data.optionId,
            reason: cleanLine(String(data.reason ?? "")),
            line: cleanLine(String(data.line ?? "")),
            ...(typeof data.model === "string" ? { model: data.model } : {}),
            ...(typeof data.edited === "string" ? { edited: data.edited } : {}),
            latencyMs: Math.round(this.now() - started),
          },
        };
      } else {
        action = { type: "choose-failed", menuId: menu.id, why: response.status === 422 ? "invalid" : response.status === 504 ? "timeout" : "unreachable" };
      }
    } catch (error) {
      if (controller.signal.aborted || this.stopped) return;
      const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      action = { type: "choose-failed", menuId: menu.id, why: timeout ? "timeout" : "unreachable" };
    }
    if (this.stopped || controller.signal.aborted) return;
    if (action.type === "choose") this.remember(action.choice.line);
    this.options.onAction(action);
  }
}

// ---------------------------------------------------------------------------
// The rival's debrief, after the round.
// ---------------------------------------------------------------------------

export type DebriefPick = { point: string; label: string; by: "model" | "game"; outcome: string };
export type DebriefRequest = {
  kind: "debrief";
  trialId: TrialId;
  difficulty: Difficulty;
  won: boolean;
  facts: Facts;
  picks: DebriefPick[];
};

/** The rival's account of the round, or "" when the model could not give a grounded one. */
export async function requestDebrief(body: DebriefRequest, signal?: AbortSignal, fetcher: Fetcher = (input, init) => fetch(input, init)) {
  const response = await fetcher("/api/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  const data = (await response.json().catch(() => ({}))) as { text?: unknown };
  return response.ok && typeof data.text === "string" ? cleanText(data.text, 360) : "";
}

/** `cleanLine` for longer text: the same stripping, a longer limit. */
export function cleanText(text: string, max: number): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`~<>[\]{}|]/g, "")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
