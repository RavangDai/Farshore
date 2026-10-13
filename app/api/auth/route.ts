import { getAuth } from "../../../lib/auth";
import { runtimeConfig } from "../../../lib/runtime-config";
import { createAuthApi } from "../../../server/auth-api";
import { checkWriteRequest, json } from "../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const invalid = checkWriteRequest(request); if (invalid) return invalid;
  try {
    const auth = await getAuth();
    if (!auth) return json({ error: "Accounts are being set up. You can play on this device.", code: "not_configured" }, 503);
    return createAuthApi(auth, runtimeConfig().appUrl!)(request);
  } catch { return json({ error: "Sign-in is temporarily unavailable. Try again." }, 503); }
}
