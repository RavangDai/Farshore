import { z } from "zod/v3";
import type { ModelConnection } from "./turn.ts";

const completion = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) });

export class ModelError extends Error {
  readonly code: "provider_error" | "busy" | "invalid_reply";
  constructor(code: ModelError["code"], message: string) { super(message); this.code = code; }
}

/** Reasoning models may prefix their answer with a think block or a code fence. */
export function modelText(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
}

/**
 * One schema-constrained chat completion against any OpenAI-compatible server
 * (Ollama, vLLM, LM Studio, Groq, OpenRouter, a Colab tunnel). The schema both
 * constrains generation and is re-checked by the caller afterwards.
 */
export async function chatJson(options: {
  connection: Required<Pick<ModelConnection, "url" | "model">> & Pick<ModelConnection, "key">;
  name: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  signal: AbortSignal;
}): Promise<unknown> {
  const { connection, signal } = options;
  const response = await fetch(connection.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(connection.key ? { Authorization: "Bearer " + connection.key } : {}) },
    signal,
    body: JSON.stringify({
      model: connection.model,
      stream: false,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: { type: "json_schema", json_schema: { name: options.name, strict: true, schema: options.schema } },
      messages: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
    }),
  });
  if (response.status === 429) throw new ModelError("busy", "The model is busy.");
  if (!response.ok) throw new ModelError("provider_error", "The model service could not answer.");
  const body = completion.parse(await response.json());
  return JSON.parse(modelText(body.choices[0].message.content));
}
