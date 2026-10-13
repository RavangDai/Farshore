import type { Db, MongoClient } from "mongodb";
import { defaultPreferences, preferencesSchema, type OnlineRecord } from "../src/lib/online.ts";
import { newArcade, readArcade } from "../src/lib/arcade.ts";
import { RequestConflict, RevisionConflict, type ProgressRepository } from "../server/progress-api.ts";
import { consumeLimit } from "./rate-limit.ts";

type Campaign = OnlineRecord & { userId: string };
type Receipt = { userId: string; requestId: string; payloadHash: string; createdAt: Date };
function parseRecord(row: Campaign | null): OnlineRecord {
  if (!row) throw new Error("Missing voyage.");
  const save = readArcade(JSON.stringify(row.save)), preferences = preferencesSchema.parse(row.preferences);
  if (!save || !Number.isSafeInteger(row.revision) || typeof row.updatedAt !== "string") throw new Error("Invalid stored voyage.");
  return { save, preferences, revision: row.revision, updatedAt: row.updatedAt };
}
export function progressRepository(db: Db, client: MongoClient, userId: string): ProgressRepository {
  const campaigns = db.collection<Campaign>("campaigns"), receipts = db.collection<Receipt>("saveRequests");
  const load = async () => {
    try {
      await campaigns.updateOne({ userId }, { $setOnInsert: { userId, revision: 0, save: newArcade(), preferences: defaultPreferences(), updatedAt: new Date().toISOString() } }, { upsert: true });
    } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    return parseRecord(await campaigns.findOne({ userId }));
  };
  return {
    load,
    async previous(requestId) {
      const receipt = await receipts.findOne({ userId, requestId });
      return receipt ? { payloadHash: receipt.payloadHash } : null;
    },
    async commit(input) {
      const session = client.startSession();
      try {
        return await session.withTransaction(async () => {
          const receipt = await receipts.findOne({ userId, requestId: input.requestId }, { session });
          if (receipt) {
            if (receipt.payloadHash !== input.payloadHash) throw new RequestConflict();
            return parseRecord(await campaigns.findOne({ userId }, { session }));
          }
          const updated = await campaigns.findOneAndUpdate({ userId, revision: input.expectedRevision }, {
            $set: { save: input.save, preferences: preferencesSchema.parse(input.preferences), updatedAt: new Date().toISOString() }, $inc: { revision: 1 },
          }, { session, returnDocument: "after" });
          if (!updated) throw new RevisionConflict();
          await receipts.insertOne({ userId, requestId: input.requestId, payloadHash: input.payloadHash, createdAt: new Date() }, { session });
          return parseRecord(updated);
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
      } finally { await session.endSession(); }
    },
    limit(category, max) {
      const ceilings: Record<string, number> = { progress: 90, "ai-settings": 20, model: 6, "model-check": 8 };
      if (!ceilings[category]) throw new Error("Unsupported request limit.");
      return consumeLimit(db, `user:${userId}:${category}`, Math.min(max, ceilings[category]));
    },
  };
}
