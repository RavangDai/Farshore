# Local Llama verification, September 23, 2026

Farshore is connected to local Ollama with `llama3.2:3b`. The connection is verified, with model-quality limitations described below. Phase 1 was already submitted and presented; no assignment or presentation was restarted.

## September 26 recovery update

- Reproduced a stopped Ollama service while the old status endpoint still reported `aiAvailable: true`. Starting Ollama restored a real API turn, which returned `source: "ai"` in 25.71 seconds end to end. This is one observed request, not a benchmark.
- Status now checks the model catalog. Settings provides a connection recheck. Generation allows 90 seconds, with a 95-second browser deadline, and distinguishes connection, provider, timeout, and invalid-reply failures.
- Brave on Windows offers Windows voice typing guidance and focuses the counsel box. A browser check confirmed that existing counsel stays intact. Actual microphone transcription and the Windows voice panel were not exercised.
- A separate preview voyage at `http://[::1]:4173/` completed a real AI lotus turn: 3 months and +12 trust. With only the preview process pointed at an unavailable test endpoint, a Cyclops turn displayed the connection error, retained counsel, and kept time/trust unchanged across retry. **Send in Story mode** then completed the same counsel with 4 months and +12 trust. Settings correctly disabled AI while that test endpoint was unavailable.
- All 34 automated tests and the production build passed. The test preview was stopped; the main server at port 5173 was checked again and reported the configured model available. The root `.env` was unchanged.

The remaining sections record the September 23 checks and implementation at that time. The decision-consistency limitation remains unresolved.

## Setup and changes

- Ollama was already installed (client 0.21.0). Its stopped background server was started, and `llama3.2:3b` was downloaded successfully.
- Model digest: `a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72`. Ollama reports 3.2B parameters and Q4_K_M quantization.
- A new root `.env` connects to `http://127.0.0.1:11434/v1/chat/completions`, model `llama3.2:3b`, without an API key. No previous `.env` existed. The existing `.gitignore` excludes it.
- Start Ollama, run `npm.cmd run dev` in `D:\Farshore\Farshore`, open `http://localhost:5173`, and choose Settings > AI dialogue. The existing app resets dialogue mode to Story mode on a full reload, so select AI again when needed.
- The adapter now requests a strict JSON schema, keeps Zod validation, and gives Llama an explicit decision-consistency table. The schema requests dialogue before decision flags; temperature is 0.2. Numeric costs, trust changes, and authored outcomes remain server-controlled. The 25-second model timeout and 30-second browser timeout are unchanged.
- This uses Ollama's documented [structured outputs](https://docs.ollama.com/capabilities/structured-outputs) through its [compatible API](https://docs.ollama.com/api/openai-compatibility). Other providers must support `response_format.type = json_schema`.

## Real API checks

The first request through `/api/turn` succeeded in 17.87 seconds. After the final adapter changes, these sequential requests to port 5173 all returned HTTP 200 with `source: "ai"`. Full requests and responses are in [the JSON evidence](ai-verification-2026-09-23.json).

| Advice | Trust | Elapsed | Result |
| --- | --- | --- | --- |
| Lotus: return to the ship and remember families | 50 | 18.93 s | Consistent safe choice, followed advice, 3 months, +12 trust |
| Winds: politely say not to open the bag | 100 | 18.92 s | Consistent safe choice, followed advice, 2 months, +12 trust |
| Winds: politely ask to open the bag | 100 | 11.39 s | Valid schema, inconsistent meaning; see below |

These individual end-to-end timings are not a latency benchmark and do not support the presentation's under-one-second claim. Ollama reported CPU inference (`size_vram: 0`) and a 4096-token context. Total laptop memory usage was not benchmarked.

## Browser and automated checks

Browser testing used `http://localhost:5174` to avoid changing the existing voyage saved under port 5173.

- An initial browser AI request showed an error, retained the advice, and kept time/trust unchanged. Clicking Speak retried successfully. Ollama logged HTTP 200 for the failed request, but its response body was not captured, so the exact validation failure is unknown.
- After the final changes, the wind-bag advice at trust 50 returned: "I will keep the bag sealed, my rest is worth more than their curiosity."
- The browser displayed **HE LISTENED**, **+2 MONTHS**, **TRUST +12**, and **AI interpretation** under the expanded explanation. Time advanced from 144 to 146 months and trust from 50 to 62.
- Story mode completed a Cyclops turn using Ctrl+Enter, added 4 months and +12 trust, and displayed **Scripted interpretation**.
- Reload preserved the separate test voyage. Screenshot inspection confirmed the existing pixel art, portraits, colors, and game layout.
- `npm.cmd test`: all 12 tests passed. Six new API tests cover the request contract, server-controlled scoring, malformed decisions, retries, provider failures/timeouts, Story mode, and invalid input. These use mocked provider responses and do not measure Llama's understanding.
- `npm.cmd run build`: TypeScript and production build passed.

Baseline hashes confirmed no changes to existing `src/`, `public/`, or gameplay test files. Edits are limited to the adapter, TypeScript import support, test command, new API tests, local configuration, and setup/verification notes. This extracted folder has no Git metadata for a normal diff.

## Remaining limitations

The polite-danger case still contradicted itself: the reply says "I will keep the bag sealed," but `safeChoice` is `false`. The server consequently applied its authored risky penalty of 18 months, which conflicts with the dialogue. Llama also labeled the polite advice Commanding. Schema constraints enforce structure, not semantic correctness. The connection works; nuanced decision consistency remains unresolved and needs evaluation before relying on AI turns for fair scoring.

Llama is the only connected Farshore model from the proposed stack. Browser speech remains a substitute for faster-whisper and Piper/VITS. SER-Odyssey, MiniLM, response pre-generation, and generated encounters are not implemented. The eleven encounters remain authored. These checks establish no interview completion, instructor approval, or later-phase requirements.
