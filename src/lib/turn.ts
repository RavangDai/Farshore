// Local models may need time to load before generating their first reply.
export const MODEL_TIMEOUT_MS = 90_000;

export type ModelStatus = {
  aiConfigured: boolean;
  aiAvailable: boolean;
  message: string;
};
