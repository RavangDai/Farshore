import { z } from "zod/v3";
export const providerSchema = z.enum(["openai", "groq", "openrouter", "ollama"]);
export type ModelProvider = z.infer<typeof providerSchema>;
export const modelSettingsSchema = z.object({ provider: providerSchema, model: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:/-]+$/), apiKey: z.string().trim().max(4096).optional(), enabled: z.boolean() }).strict();
export type ModelSettings = { provider: ModelProvider; model: string; hasKey: boolean; keySuffix: string | null; enabled: boolean; updatedAt: string };
export const providerDetails = {
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", modelHint: "Your model ID" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", modelHint: "Your model ID" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", modelHint: "Provider/model ID" },
  ollama: { name: "Local Ollama", baseUrl: "http://127.0.0.1:11434/v1", modelHint: "llama3.2:3b" },
} as const;
