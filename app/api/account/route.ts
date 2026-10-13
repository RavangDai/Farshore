import { verifiedPlayer } from "../../../lib/auth";
import { database } from "../../../lib/mongodb";
import { accountsConfigured } from "../../../lib/runtime-config";
import { progressRepository } from "../../../lib/progress-repository";
import { createProgressApi } from "../../../server/progress-api";
import { json } from "../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  if (!accountsConfigured()) return json({ error: "Accounts are being set up. You can play on this device.", code: "not_configured" }, 503);
  try {
    const player = await verifiedPlayer(request);
    if (!player) return json({ error: "Sign in to save a voyage to your account." }, 401);
    const connection = await database();
    if (!connection) throw new Error("Missing database.");
    return createProgressApi(progressRepository(connection.db, connection.client, player.id), async () => player)(request);
  } catch { return json({ error: "Online saving is temporarily unavailable. Keep this tab open and retry." }, 503); }
}
export const GET = handle;
export const POST = handle;
