import { verifiedPlayer } from "./auth";
import { database } from "./mongodb";
import { modelConnection } from "./ai-account";
import { progressRepository } from "./progress-repository";
import { runtimeConfig } from "./runtime-config";
import { canonicalRequest, checkWriteRequest, json, readJson } from "../server/http";
import type { ModelConnection } from "../server/turn";
type Get = (connection?: ModelConnection) => Promise<Response>;
type Post = (request: Request, connection?: ModelConnection) => Promise<Response>;
export function modelApi(get: Get, post: Post) {
  return async (request: Request) => {
    request = canonicalRequest(request);
    if (request.method === "POST") {
      const invalid = checkWriteRequest(request); if (invalid) return invalid;
      try { const body = await readJson(request, 6000); request = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body), signal: request.signal }); }
      catch (error) { return json({ error: error instanceof Error && error.message === "large_body" ? "This request is too large." : "A valid game request is required." }, error instanceof Error && error.message === "large_body" ? 413 : 400); }
    }
    const config = runtimeConfig();
    try {
      const player = await verifiedPlayer(request);
      if (!player) {
        if (config.local && config.localModelUrl && config.localModelName) {
          const connection = { url: config.localModelUrl, model: config.localModelName, key: config.localModelKey };
          return request.method === "GET" ? get(connection) : post(request, connection);
        }
        return request.method === "GET" ? json({ aiConfigured: false, aiAvailable: false, message: "Local rivals are ready. Sign in and add your AI connection in Account to use a model." }) : json({ error: "Sign in and add an AI connection in Account. Local rivals are ready without it." }, 401);
      }
      const connection = await database(); if (!connection) throw new Error("Missing database.");
      if (!await progressRepository(connection.db, connection.client, player.id).limit(request.method === "GET" ? "model-check" : "model", request.method === "GET" ? 8 : 6)) return json({ error: "Too many model requests. Wait a minute and retry." }, 429, { "Retry-After": "60" });
      const model = await modelConnection(connection.db, player.id);
      return request.method === "GET" ? get(model) : post(request, model);
    } catch { return json({ error: "The AI connection is unavailable. Check your account settings or play with a local rival." }, 503); }
  };
}
