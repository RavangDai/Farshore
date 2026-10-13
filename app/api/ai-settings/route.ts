import { verifiedPlayer } from "../../../lib/auth";
import { database } from "../../../lib/mongodb";
import { progressRepository } from "../../../lib/progress-repository";
import { readAiRow, safeSettings, type AiRow } from "../../../lib/ai-account";
import { runtimeConfig, accountsConfigured } from "../../../lib/runtime-config";
import { checkWriteRequest, json, readJson } from "../../../server/http";
import { modelSettingsSchema } from "../../../src/lib/ai-account";
import { encryptSecret } from "../../../server/secrets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  if (request.method !== "GET") { const invalid = checkWriteRequest(request); if (invalid) return invalid; }
  if (!accountsConfigured()) return json({ error: "Accounts are being set up.", code: "not_configured" }, 503);
  try {
    const player = await verifiedPlayer(request); if (!player) return json({ error: "Sign in to manage your AI connection." }, 401);
    const connection = await database(); if (!connection) throw new Error("Missing database.");
    const { db, client } = connection;
    if (!await progressRepository(db, client, player.id).limit("ai-settings", 20)) return json({ error: "Wait a moment before changing the connection again." }, 429, { "Retry-After": "60" });
    const collection = db.collection<AiRow>("aiSettings");
    if (request.method === "DELETE") { await collection.deleteOne({ userId: player.id }); return json({ settings: null }); }
    const previous = await readAiRow(db, player.id), config = runtimeConfig();
    if (request.method === "GET") return json({ settings: safeSettings(previous), local: config.local, keyStorageReady: !!config.encryptionKey });
    let input;
    try { input = modelSettingsSchema.parse(await readJson(request, 6000)); } catch { return json({ error: "Choose a provider and a valid model ID." }, 400); }
    if (input.provider === "ollama" && !config.local) return json({ error: "Local Ollama works when Farshore runs on your computer. For the online version, choose a hosted provider." }, 400);
    const key = input.apiKey?.trim();
    if (input.provider !== "ollama" && !key && (!previous?.encryptedKey || previous.provider !== input.provider)) return json({ error: "Enter an API key for this provider." }, 400);
    if (input.provider !== "ollama" && !config.encryptionKey) return json({ error: "API key storage is not available yet. Your key was not saved." }, 503);
    const encryptedKey = input.provider === "ollama" ? null : key ? await encryptSecret(key, player.id, config.encryptionKey!) : previous!.encryptedKey;
    const keySuffix = input.provider === "ollama" ? null : key ? key.slice(-4) : previous!.keySuffix;
    await collection.updateOne({ userId: player.id }, { $set: { provider: input.provider, model: input.model, encryptedKey, keySuffix, enabled: input.enabled, updatedAt: new Date().toISOString() } }, { upsert: true });
    return json({ settings: safeSettings(await readAiRow(db, player.id)) });
  } catch { return json({ error: "The AI settings could not be saved. Try again." }, 503); }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
