import type { Db } from "mongodb";
import { providerDetails, providerSchema, type ModelSettings } from "../src/lib/ai-account.ts";
import { decryptSecret } from "../server/secrets.ts";
import { runtimeConfig } from "./runtime-config.ts";
export type AiRow = { userId: string; provider: string; model: string; encryptedKey: string | null; keySuffix: string | null; enabled: boolean; updatedAt: string };
export function readAiRow(db: Db, userId: string): Promise<AiRow | null> {
  return db.collection<AiRow>("aiSettings").findOne({ userId });
}
export function safeSettings(row: AiRow | null): ModelSettings | null {
  if (!row) return null;
  return { provider: providerSchema.parse(row.provider), model: row.model, hasKey: !!row.encryptedKey, keySuffix: row.keySuffix, enabled: row.enabled, updatedAt: row.updatedAt };
}
export async function modelConnection(db: Db, ownerId: string) {
  const row = await readAiRow(db, ownerId), config = runtimeConfig();
  if (row && !row.enabled) return {};
  if (!row) return config.local && config.localModelUrl && config.localModelName ? { url: config.localModelUrl, model: config.localModelName, key: config.localModelKey } : {};
  const provider = providerSchema.parse(row.provider);
  if (provider === "ollama" && !config.local) throw new Error("local_only");
  if (row.encryptedKey && !config.encryptionKey) throw new Error("encryption_unavailable");
  const key = row.encryptedKey ? await decryptSecret(row.encryptedKey, ownerId, config.encryptionKey!) : undefined;
  return { url: providerDetails[provider].baseUrl + "/chat/completions", model: row.model, key };
}
