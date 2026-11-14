// Runs once when a Next.js server starts. It starts loading the built-in voice
// in the background and returns at once, so the server is never held up by it.
// FARSHORE_VOICE_WARM=off leaves loading until the game first asks.
export async function register() {
  // The import sits inside this check so the edge build never bundles the
  // Node-only voice code (Next replaces NEXT_RUNTIME at compile time).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build" || /^(0|false|off|no)$/i.test(process.env.FARSHORE_VOICE_WARM ?? "")) return;
    try {
      const { warmVoiceAtBoot } = await import("./server/voice-boot");
      warmVoiceAtBoot();
    } catch (error) {
      console.warn(`The voice could not be warmed at startup: ${error instanceof Error ? error.message : error}`);
    }
  }
}
