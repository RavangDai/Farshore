import { verifiedPlayer } from "../../../../lib/auth";
import { accountsConfigured, runtimeConfig } from "../../../../lib/runtime-config";
import { json } from "../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const config = runtimeConfig(), configured = accountsConfigured();
  if (!configured) return json({ player: null, configured: false, local: config.local });
  try { return json({ player: await verifiedPlayer(request), configured: true, local: config.local }); }
  catch { return json({ error: "Sign-in is temporarily unavailable. Try again." }, 503); }
}
