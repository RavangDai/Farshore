import { z } from "zod/v3";
import { assistTrial, finishAttempt, newArcade, readArcade, unlocked, validSummary, type ArcadeSave, type AttemptSummary } from "./arcade.ts";

export const preferencesSchema = z.object({
  revision: z.literal(2), difficulty: z.enum(["easy", "normal", "hard"]),
  sound: z.boolean(), still: z.boolean(), mode: z.enum(["standard", "ai"]),
}).strict();
export type OnlinePreferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences = (): OnlinePreferences => ({ revision: 2, difficulty: "normal", sound: false, still: false, mode: "standard" });
const trialId = z.enum(["cyclops", "circe", "sirens", "scylla", "bow"]);
const summarySchema = z.object({ won: z.boolean(), source: z.enum(["ai", "standard"]), hits: z.number().int().min(0).max(100), successes: z.number().int().min(0).max(100), early: z.number().int().min(0).max(100), late: z.number().int().min(0).max(100), misses: z.number().int().min(0).max(100), laneMs: z.tuple([z.number().int().min(0).max(60000), z.number().int().min(0).max(60000), z.number().int().min(0).max(60000)]), laneMisses: z.tuple([z.number().int().min(0).max(100), z.number().int().min(0).max(100), z.number().int().min(0).max(100), z.number().int().min(0).max(100)]).optional() }).strict();
const saveSchema = z.unknown().transform((input, ctx) => {
  const save = readArcade(JSON.stringify(input));
  if (!save) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unsupported voyage save." }); return z.NEVER; }
  return save;
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }).strict(),
  z.object({ type: z.literal("restart") }).strict(),
  z.object({ type: z.literal("complete"), trialId, summary: summarySchema }).strict(),
  z.object({ type: z.literal("assist"), trialId }).strict(),
  z.object({ type: z.literal("preferences"), preferences: preferencesSchema }).strict(),
  z.object({ type: z.literal("import"), save: saveSchema, preferences: preferencesSchema }).strict(),
]);
export type ProgressCommand = z.infer<typeof commandSchema>;
export const mutationSchema = z.object({ expectedRevision: z.number().int().nonnegative().max(1_000_000_000), requestId: z.string().uuid(), command: commandSchema }).strict();
export type OnlineRecord = { revision: number; save: ArcadeSave; preferences: OnlinePreferences; updatedAt: string };
export type OnlinePlayer = { id: string; displayName: string; email: string };
export type OnlineGame = {
  initialSave: ArcadeSave; initialPreferences: OnlinePreferences; storageKey: string;
  command: (command: ProgressCommand) => void;
};

export class ProgressError extends Error {}
export function applyProgressCommand(record: OnlineRecord, command: ProgressCommand): Omit<OnlineRecord, "revision" | "updatedAt"> {
  let save = record.save, preferences = record.preferences;
  if (command.type === "start") {
    if (!save.started) save = { ...newArcade(), started: true };
  } else if (command.type === "restart") save = { ...newArcade(), started: true };
  else if (command.type === "preferences") preferences = command.preferences;
  else if (command.type === "import") {
    if (save.started || Object.values(save.records).some(r => r.attempts > 0 || r.cleared !== "pending")) throw new ProgressError("This account already has a voyage. Import is only available before starting.");
    save = command.save; preferences = command.preferences;
  } else {
    if (!unlocked(save, command.trialId)) throw new ProgressError("Complete the earlier encounters first.");
    if (command.type === "assist") save = assistTrial(save, command.trialId);
    else {
      if (!validSummary(command.summary)) throw new ProgressError("Unsupported round summary.");
      save = finishAttempt(save, command.trialId, command.summary as AttemptSummary);
    }
  }
  return { save, preferences };
}
