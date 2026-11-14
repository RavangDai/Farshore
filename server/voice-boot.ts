import { voices } from "../src/lib/arcade/rivals.ts";
import { pronounce } from "../src/lib/speech/lexicon.ts";
import { fixedPieces } from "../src/lib/story/spoken-lines.ts";
import { onKokoroReady, speakWithKokoro, warmKokoro } from "./lib/kokoro.ts";
import { voiceConfig } from "./voice.ts";

// Loads the voice while the server starts, instead of when the first player
// opens the game, then speaks the lines the game will certainly say (the
// prologue, the crossings, the settings test) into the disk cache, behind any
// line a player is waiting for.

const BOOTED = Symbol.for("farshore.voice.booted");

export function warmVoiceAtBoot() {
  const flags = globalThis as Record<symbol, unknown>;
  if (flags[BOOTED]) return;
  flags[BOOTED] = true;
  const config = voiceConfig();
  if (config.engine === "remote") { void warmRemote(config); return; }
  if (config.engine !== "builtin") return;
  // A moment's grace, so the first page compile does not fight the model load.
  setTimeout(() => {
    warmKokoro();
    onKokoroReady(() => { void primeFixedLines(); });
  }, 1500).unref?.();
}

async function primeFixedLines() {
  for (const piece of fixedPieces) {
    const profile = voices[piece.voice];
    try { await speakWithKokoro(pronounce(piece.text), profile.kokoro, profile.speed, { priority: "prime", persist: true }); }
    catch { /* Busy or reloading: the line is made when it is first asked for. */ }
  }
}

/** A remote voice server loads each accent's model on first use; ask once for each. */
async function warmRemote(config: ReturnType<typeof voiceConfig>) {
  for (const voice of ["bm_george", "af_heart"]) {
    try {
      await fetch(config.url!, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(config.key ? { Authorization: "Bearer " + config.key } : {}) },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ model: config.model, input: "Ready.", voice, response_format: "wav", speed: 1 }),
      });
    } catch { /* Not reachable yet; the game falls back to the browser's voices. */ }
  }
}
