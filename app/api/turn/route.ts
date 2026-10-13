import { GET as get, POST as post } from "../../../server/turn";
import { modelApi } from "../../../lib/model-api";
import { canonicalRequest, checkWriteRequest, json, readJson } from "../../../server/http";
export const dynamic = "force-dynamic";
export const GET = modelApi(get,post);
export async function POST(request: Request) {
  request = canonicalRequest(request);
  const invalid = checkWriteRequest(request); if (invalid) return invalid;
  try { const body = await readJson(request, 6000) as { mode?: string }; request = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body), signal: request.signal }); if (body?.mode === "story") return post(request,{}); }
  catch (error) { return json({ error: error instanceof Error && error.message === "large_body" ? "This request is too large." : "A valid game request is required." }, error instanceof Error && error.message === "large_body" ? 413 : 400); }
  return GET(request);
}
