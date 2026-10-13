import { applyProgressCommand, mutationSchema, ProgressError, type OnlinePlayer, type OnlineRecord } from "../src/lib/online.ts";
import { checkWriteRequest, json, payloadHash, readJson } from "./http.ts";

export interface ProgressRepository {
  load(): Promise<OnlineRecord>;
  previous(requestId: string): Promise<{ payloadHash: string } | null>;
  commit(input: { requestId: string; expectedRevision: number; payloadHash: string; save: OnlineRecord["save"]; preferences: OnlineRecord["preferences"] }): Promise<OnlineRecord>;
  limit(category: string, max: number): Promise<boolean>;
}
export class RevisionConflict extends Error {}
export class RequestConflict extends Error {}
export function createProgressApi(repository: ProgressRepository, authenticate: (request: Request) => Promise<OnlinePlayer | null>) {
  return async (request: Request): Promise<Response> => {
    const player = await authenticate(request);
    if (!player) return json({ error: "Sign in to save a voyage to your account." }, 401);
    if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
    if (request.method === "POST") { const invalid = checkWriteRequest(request); if (invalid) return invalid; }
    try {
      if (!await repository.limit("progress", 90)) return json({ error: "Too many requests. Your voyage is kept; retry in a minute." }, 429, { "Retry-After": "60" });
      const record = await repository.load();
      if (request.method === "GET") return json({ player, record });
      let mutation;
      try { mutation = mutationSchema.parse(await readJson(request)); }
      catch (error) { return json({ error: error instanceof Error && error.message === "large_body" ? "This request is too large." : "The voyage update is unsupported." }, error instanceof Error && error.message === "large_body" ? 413 : 400); }
      const hash = await payloadHash(JSON.stringify(mutation.command)), previous = await repository.previous(mutation.requestId);
      if (previous) return previous.payloadHash === hash ? json({ record, replayed: true }) : json({ error: "This request ID was already used for a different update." }, 409);
      if (mutation.expectedRevision !== record.revision) return json({ error: "Your voyage changed in another tab or device. Load the latest online voyage before continuing.", code: "revision_conflict", record }, 409);
      let next;
      try { next = applyProgressCommand(record, mutation.command); }
      catch (error) { if (error instanceof ProgressError) return json({ error: error.message }, 422); throw error; }
      try {
        const current = await repository.commit({ requestId: mutation.requestId, expectedRevision: mutation.expectedRevision, payloadHash: hash, ...next });
        return json({ record: current });
      } catch (error) {
        if (error instanceof RequestConflict) return json({ error: "This request ID was already used for a different update." }, 409);
        if (error instanceof RevisionConflict) return json({ error: "Your voyage changed in another tab or device.", code: "revision_conflict", record: await repository.load() }, 409);
        throw error;
      }
    } catch {
      return json({ error: "Online saving is temporarily unavailable. Keep this tab open and retry.", code: "storage_unavailable" }, 503);
    }
  };
}
