import { verifiedPlayer } from "../../../../server/lib/auth";
import { accountsConfigured, authMethods, runtimeConfig } from "../../../../server/lib/runtime-config";
import { json } from "../../../../server/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const config = runtimeConfig(), configured = accountsConfigured(), methods = authMethods();
  if (!configured) return json({ player: null, configured: false, local: config.local, methods });
  try { return json({ player: await verifiedPlayer(request), configured: true, local: config.local, methods }); }
  catch { return json({ error: "Sign-in is temporarily unavailable. Try again." }, 503); }
}
