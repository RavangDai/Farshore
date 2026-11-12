import type { ModelConnection } from "../turn.ts";

/**
 * Which services the Oracle uses, from the environment. Kept apart from the
 * corpus so the status check can report them without loading it.
 */

/**
 * The model that writes the questions. FARSHORE_ORACLE_MODEL can name a
 * different model on the server's own service (the Colab notebook sets it);
 * like the commentary model, it does not apply to a player's own connection.
 */
export function oracleModel(connection?: ModelConnection, env: Record<string, string | undefined> = process.env) {
  const serverModel = !connection || connection.url === env.FARSHORE_MODEL_URL;
  return (serverModel && env.FARSHORE_ORACLE_MODEL?.trim()) || (connection ? connection.model : env.FARSHORE_MODEL_NAME);
}

/**
 * The embedding service the Oracle retrieves with: any OpenAI-compatible
 * `/v1/embeddings` endpoint, such as the Colab gateway or Ollama on this
 * computer. FARSHORE_EMBED_URL names it; without it, the chat model's address
 * is used with `/embeddings` in place of `/chat/completions`, which is what the
 * Colab notebook and Ollama both serve. FARSHORE_EMBED_URL=off turns semantic
 * retrieval off (BM25 only).
 */
export function embeddingConfig(env: Record<string, string | undefined> = process.env) {
  const explicit = env.FARSHORE_EMBED_URL?.trim();
  if (explicit === "off") return null;
  const chat = env.FARSHORE_MODEL_URL?.trim() ?? "";
  const url = explicit || (/\/chat\/completions\/?$/.test(chat) ? chat.replace(/\/chat\/completions\/?$/, "/embeddings") : "");
  if (!url) return null;
  return { url, model: env.FARSHORE_EMBED_MODEL?.trim() || "embeddinggemma:300m", key: env.FARSHORE_EMBED_KEY ?? env.FARSHORE_API_KEY ?? "" };
}
