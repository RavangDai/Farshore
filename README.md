# FARSHORE - Eight Trials. One Journey Home.

**FARSHORE** is the game's official name; Homer's *The Odyssey* is its story inspiration. The illustrated arcade interface follows the supplied FARSHORE concept, with an interactive eight-trial selector, temple menus, matching character art, and a shared arcade HUD. See [visual design and asset prompts](docs/FARSHORE-VISUAL-DESIGN.md).

## Immersive gameplay stage and explainable AI

Gameplay now opens in a full-viewport, fixed-16:9 stage (`F` for fullscreen, `Escape` to pause) instead of a small canvas embedded in the page — see [UI_DESIGN.md](docs/UI_DESIGN.md). Cyclops' Cave was rebuilt as a true perspective three-lane runner with a real explainable-AI opponent: every decision Polyphemus makes is recorded with the actual candidates it scored, the one it chose, a grounded reason, and a fairness guarantee that it withholds any attack it can't prove is survivable. Press **F3** during any encounter to cycle Immersive → AI Insights → AI Lab and watch that reasoning live. A dedicated **AI Lab** (Professor mode, from the main menu) lets you run any encounter at any difficulty, side by side, with no effect on your campaign save.

In three encounters, **Cyclops' Cave, Sirens' Passage and the Palace of Ithaca**, a pretrained model makes the rival's decisions during play. The game lays out a menu of options it has already checked are fair. The model picks one and says why, and the game carries it out with its own physics and scoring. The inspector shows the model's pick beside the game's own best option. In Ithaca, **Ask Athena** answers your questions about the shot from the hall's own measurements and shows which ones she used. After those three encounters the rival gives a **debrief** built on what the game measured. Full detail in [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md), [GAMEPLAY_DESIGN.md](docs/GAMEPLAY_DESIGN.md), and [UI_DESIGN.md](docs/UI_DESIGN.md).

The online app uses MongoDB, Better Auth email/password accounts, arcade saves across devices, and private AI provider settings. Run `npm.cmd run dev` and open http://localhost:3000. Database setup can wait: guest games work on the device without it. Configuration and Node hosting instructions are in [ONLINE-SETUP.md](docs/ONLINE-SETUP.md).

The paragraphs below describe gameplay and the earlier local setup. For the current online build and security boundary, use the setup guide and [SECURITY.md](SECURITY.md).

An eight-encounter Greek mythology arcade adventure: Lotus maze rescue, Cyclops cave runner, Aeolus wind sailing, Circe falling-potion match-3, Sirens melody memory, Scylla & Charybdis paddle defense, Calypso raft hopping, and the archery contest at Ithaca.

**Rescue Race against a trained AI.** In the Land of the Lotus-Eaters briefing, **Race the trained AI** puts you on one board and a reinforcement-learning rival on a second: the same garden, ship, sailors and guardians, one shared clock. The rival is a PPO policy trained with Stable-Baselines3 on the game's own rules and run in your browser with ONNX Runtime Web; no language model is involved. Pick the classic garden, the showcase garden with a patrolled crossing, or a new random garden; **Race Again** and **New Maze** restart. Races are exhibitions and never change your voyage. Training, evaluation and export: [training/README.md](training/README.md); results: [docs/ai-eval/lotus-race.md](docs/ai-eval/lotus-race.md).

Choose **New Game** after the cinematic opening, follow the connected island map, and complete each encounter to unlock the next. After each encounter, **Next encounter** plays a short crossing filmed from Olympus: Odysseus walks down from the island he won, sails the chart's route and walks up onto the next island, while the rival prepares its strategy. Enter, Space or Escape skip it, it is left out under reduced motion, and **Settings > Showcase** can preview it without changing your voyage. Every island has Easy, Medium, and Hard difficulty, its own briefing, practice, pause/resume, retries, and saved scores and medals. Keyboard and touch controls work without sound. The How to Play screen includes a real A* rescue demonstration.

The existing arcade engines, audio, local/account saves, optional model preparation, and earlier modes are preserved. Three- and five-stop saves migrate without losing clears. The original Cyclops grid game remains available as practice in its briefing. Details of the adaptation and save behavior are in [ODYSSEY-ADAPTATION.md](docs/ODYSSEY-ADAPTATION.md).

Every encounter is played against an **AI rival planned by a connected model**; there is no model-free mode. When a briefing opens, the model reads your recent attempts and picks the rival's strategy and opening taunt, and in every encounter that choice changes how the rival plays. In Cyclops, Sirens and Ithaca the model also decides during play: each cave section's hunt, each melody, each of Antinous' shots. Throughout, it writes live commentary from a Homeric bard and from the rival, spoken aloud. Game code owns scoring, collisions, warnings, and progress. Without a reachable model, menus and briefings still open, but encounters cannot start. See [Connect the AI rival](#connect-the-ai-rival-required-to-play).

Guests save on the device; signed-in players synchronize through MongoDB. New Game confirms before resetting a voyage. Failed attempts do not unlock islands. Practice and demonstrations do not advance progress. The retained accessibility passage is explicitly confirmed, marked Assisted, and earns no medal. Unfinished encounters restart after a reload.

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run build
```

Keep the Node server running. Earlier modes remain in **Settings > Earlier Farshore modes**: [Circe's mystery](http://localhost:3000/?mystery) and the [original advice voyage](http://localhost:3000/?voyage), each with separate progress.

## Earlier modes and original voyage notes

The sections below preserve setup, source, art, and AI notes for the earlier modes. The arcade rules are documented above.

## Story and map

The journey now starts with the Cicones after Troy, includes the Laestrygonians and the Phaeacian court, and ends with Penelope’s recognition and peace on Ithaca. Open **What happens in Homer?** beneath an encounter to compare the game with the poem. **Story & Sources** on the title screen includes links and a downloadable [presentation source guide](public/story-sources.md).

The map uses real Natural Earth coastlines, selectable shores, route progress, zoom, and source notes. Legendary locations are marked as illustrative; Oceanus is symbolic. It is a narrative map, not a proven historical itinerary.

To rebuild its vector layer, download the [Natural Earth land GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson), then run `node scripts/build-map.mjs <path-to-ne_50m_land.geojson>` from the project root. This regenerates `src/lib/story/map-land.ts` without adding a runtime dependency.

Choices can change the route: keeping the wind bag sealed leads to an earlier arrival; sparing Helios’s cattle preserves the remaining companions and avoids the shipwreck and captivity. Otherwise, the full route follows fifteen chapters. Old saves retain their counsel and scores; new chapters are added ahead of an ongoing voyage. Begin a new voyage to experience the revised story from the Cicones. Replay the introduction from **How to play** without resetting progress.

Dialogue now appears in character-linked speech bubbles, with animated scenery and clearer time/trust feedback. Select **Enable music & sounds** on the title screen for an original retro maritime soundtrack. Music changes with the voyage, with separate music/effect volumes in **Music & Settings**. Audio is synthesized locally with Web Audio; it needs no downloads or account. It pauses in hidden tabs and during dictation, and music lowers during spoken replies.

The sea has separate moving currents, foam, and shimmering reflections, masked to the water in each landscape. Odysseus blinks and speaks with small pixel mouth movements, expressive brows, nods, and a head shake. His acting follows the scene and his decision; it does not analyze emotion in your voice. Speaking motion follows both the text reveal and spoken replies.

Settings also include instant dialogue and **Scene motion**: **Follow device** respects your system's reduced-motion preference, **Animated** explicitly enables the scenery and character acting, and **Still** stops the motion. Scenery pauses while a menu is open or the tab is hidden. **Show full text** skips an individual text reveal. Audio, volume, and reading preferences are saved in this browser.

Dictation depends on the browser's speech service as well as microphone access. Wait for **Listening**, speak, then stop and review the transcript before sending. A connection failure is different from no speech being detected. The game now reports microphone permission, capture, service, network, and silence failures separately, with retry and typing options. Existing text remains intact.

Brave exposes a speech API without a working recognition service. On Windows, Farshore offers **Voice typing** in Brave: click it to focus the counsel box, then press **Windows + H** to start [Windows voice typing](https://support.microsoft.com/en-US/accessibility/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc). The webpage cannot open the Windows voice panel itself. This requires an internet connection and a working microphone. Other supported browsers keep the **Dictate** control. See [Brave's speech-recognition issue](https://github.com/brave/brave-browser/issues/2802). Progress is local to each browser, so switching browsers does not move your save.

## Start in VS Code (Windows, macOS, or Linux)

1. Install Node.js 24 from https://nodejs.org/ if needed. Node 22.13 or newer also works. Restart VS Code after installing Node.
2. Extract the ZIP. In VS Code, choose **File > Open Folder** and select **Farshore-VSCode**, the folder containing `package.json`.
3. Choose **Terminal > New Terminal**. Run these commands one at a time:

```sh
npm install
npm run dev
```

4. Open **http://localhost:3000** in your browser. Press **Begin voyage**. Earlier modes are available in Settings.
5. Leave the terminal running while you play. Press **Ctrl+C** in the terminal to stop.

Next time, only run `npm run dev`. Installation requires internet. All artwork and fonts are included locally. Story mode needs no API key or external model.

Use the npm command to start the game and server endpoints. Live Server does not run the account or model APIs.

## If Windows PowerShell blocks npm.ps1

In VS Code's terminal dropdown, choose **Command Prompt**, or use:

```bat
npm.cmd install
npm.cmd run dev
```

No PowerShell security policy change is needed. If npm is not recognized, install Node and restart VS Code. For a different port, run `npm run dev -- --port 53173` and open the printed address. Match `BETTER_AUTH_URL` to that origin when enabling accounts.

## Project layout

```text
app/                 Next.js pages and API routes (thin wrappers around server/)
server/              Request handlers behind the Next.js API routes
  lib/               Server-only helpers: accounts, database, model calls, the built-in voice
src/
  ArcadeApp.tsx      The eight-trial arcade (the default game)
  VoyageApp.tsx      The earlier advice voyage (?voyage)
  MysteryApp.tsx     The mystery case (?mystery)
  components/
    play/            The encounter screen: stage, HUD, the three engines' views
    ai/              AI inspector and AI Lab
    menu/            Voyage map, trial selection, preferences
    voyage/          The advice voyage's portraits, speech bubbles and map
    ui/              Shared buttons, dialogs and text areas
  lib/
    arcade/          Trials, saves, the game runtime, commentary and the rivals' voices
    encounters/      The game engines: the cave runner, mythic duels, adventures
    ai/              The explainable AI opponents
    render/          The 3D cave and sprite drawing
    audio/           Music, sound effects, ambience, and what each game event sounds like
    speech/          Spoken voices and dictation
    story/           Lore, cast, and the Mediterranean map
    voyage/, mystery/, online/   The earlier modes and online saves
  styles/            Stylesheets; tokens.css holds the design tokens
public/              Art and fonts
tests/               Node test suites (npm test)
scripts/             Development and production launchers, the model evaluation and the map builder
docs/                Design notes, credits, model evaluation results and screenshots
colab/               Notebook that serves the model and voice from Google Colab
```

| To change | Edit |
| --- | --- |
| A trial's rules or difficulty | `src/lib/encounters/` and `src/lib/arcade/arcade.ts` |
| A character's voice | `src/lib/arcade/rivals.ts` |
| A sound effect | `src/lib/audio/sounds.ts` |
| When a sound plays | `src/lib/audio/cues.ts` |
| An encounter's ambience | `src/lib/audio/ambience.ts` |
| The music | `src/lib/audio/voyage-audio.ts` |

Changes appear while `npm run dev` is running. In VS Code, **Terminal > Run Task > Run Farshore** is also available after installation.

## Connect the AI rival (required to play)

Any OpenAI-compatible chat server works. The recommended model is **`qwen3:4b-instruct`** (Qwen3-4B-Instruct-2507, Apache 2.0): it scores 69.6 on MMLU-Pro against 22.2 for Llama 3.2 3B, follows JSON schemas reliably, and has no slow thinking phase, which matters for live commentary.

**On this computer.** Install Ollama from https://ollama.com/, run `ollama pull qwen3:4b-instruct`, then set in `.env` and restart the game server:

```env
FARSHORE_MODEL_URL=http://127.0.0.1:11434/v1/chat/completions
FARSHORE_MODEL_NAME=qwen3:4b-instruct
```

On a CPU-only laptop, a rival strategy takes about 15 seconds (shown with progress on the briefing) and a commentary line about 3 to 7 seconds. The bard's opening line is written while you read the briefing, which also warms the model's prompt cache for the encounter. Setting `OLLAMA_NUM_PARALLEL=2` for Ollama keeps both the strategy and commentary prompts cached.

**On Google Colab (free GPU).** Open [`colab/farshore_model_server.ipynb`](colab/farshore_model_server.ipynb) in Colab, choose a T4 GPU runtime and run every cell. It serves the same model plus the Kokoro-82M neural voice behind an API key and a Cloudflare tunnel, then prints the `FARSHORE_*` lines to paste into `.env`. Lines come back in well under a second. Keep the Colab tab open while you play; the address changes each session.

**Online accounts.** Signed-in players add an OpenAI, Groq or OpenRouter connection under Account.

**Two models: planner and commentary.** `FARSHORE_MODEL_NAME` is the planner. It chooses every rival plan, every in-game decision, Athena's counsel and the debriefs. `FARSHORE_COMMENTARY_MODEL` can name a smaller, faster model for the live commentary. The Colab notebook sets up both: `gemma3:12b` plans and `qwen3:4b-instruct` comments. To compare planners on the game's real requests, run `node --experimental-strip-types scripts/ai-eval.mjs --url <chat URL> --model <name> [--key <key>]`; results go to [docs/ai-eval](docs/ai-eval/README.md).

Optional settings: Voices are covered in [Voices and sound](#voices-and-sound). Voice, commentary and volume can be switched off in Settings.

## Mock AI service (testing every AI state)

Every model request from the arcade (rival status, strategy, in-game decisions, Athena, debriefs, live commentary) goes through one module, `server/lib/model-api.ts`. It asks the mock service, `server/lib/mock-ai.ts`, first. When a mock mode is set, the mock answers and no model is called. With no mode set, normal play uses the live model.

| Mode | What the player sees |
| --- | --- |
| `success` | A strategy after about 1.5 s. Asking again gives a different one. |
| `slow` | The loading state for about 12 s, with elapsed time, Cancel and (after a first strategy) Keep the previous strategy. Cancel stops the request and waits for the player. |
| `uncertain` / `uncertain-once` | The low-confidence state: the strategy did not pass the game's checks and was set aside. `-once` recovers on the retry. |
| `error` / `error-once` | The error state, "The rival is not ready", with "Prepare the rival again". `-once` recovers on the retry. |
| `offline` | The "No AI rival connected" state with connection steps. |

During play the same modes drive the in-game decisions (`/api/decide`) and Athena (`/api/athena`):

| Mode | In-game decisions | Athena |
| --- | --- | --- |
| `success` | The model's pick in about 0.6 s, cycling through the menu, so it sometimes differs from the game's own top option. | An answer naming the fact it used, so the "Athena used" chips show. |
| `slow` | No answer before the wait runs out: the inspector shows the menu while the model is choosing, then *Game's pick*. | "Athena considers the hall…" for about 12 s. |
| `uncertain` | The reply is rejected at once, and the game's own pick is labelled as such. | "Athena's answer could not be checked against the hall". |
| `error` / `offline` | As `uncertain`, with the reason "could not be reached". | "Athena cannot be reached". |

Set a mode in either of two ways:

- **For one browser window** (local server only): open `http://localhost:3000/api/ai-mock?mode=error-once`. The page lists every mode, and `?mode=off` returns to the live model.
- **For the whole server**: start it with `FARSHORE_AI_MOCK=slow` (for example `$env:FARSHORE_AI_MOCK="slow"; npm.cmd run dev` in PowerShell).

The mock needs no model, API key or network. `tests/mock-ai.test.mjs` covers it.

**Before/after captures.** The in-play "Opponent plan" panel was reworked after the first usability round: action and target first, one short reason, the forecast labelled as a prediction, the last observed result kept apart, and the algorithm under "How it decided". Add `?ui=baseline` to the URL (for example `http://localhost:3000/?ui=baseline`) to show the panel as it was first tested.

## Design tokens

Colour, type and spacing are defined once in `src/styles/tokens.css`:

- **Colour:** background, surface, text, muted text, one accent (gold), an AI colour (cyan), error and success.
- **Type:** four font families and five text sizes.
- **Spacing:** one scale (4, 8, 12, 16, 24, 32 and 48 px).

The other stylesheets read these variables. `docs/UI_DESIGN.md` explains when each one is used.

## Voices and sound

**Voices.** The bard and every rival speak with natural Kokoro-82M voices, run inside the game server: no API key or extra service. The first time a line is spoken, the server downloads the voice model (about 180 MB) into `.cache/models`; until it finishes, your browser reads the lines, and **Settings** shows the progress. Each character has their own voice and is placed in their world: Polyphemus booms through the cave, the Sirens sing as a doubled chorus, Poseidon's storm rolls with reverb. A line is spoken a sentence at a time, so the voice starts while the rest is still being made.

On an 8-thread laptop a line is ready in about 1 to 3 seconds. `FARSHORE_TTS=browser` turns the built-in voice off, and `FARSHORE_TTS_URL` sends lines to any OpenAI-compatible `/v1/audio/speech` server instead, such as the Colab notebook. When the browser speaks, Farshore picks its most natural installed voices (Edge's "Natural" voices, Google's, or Apple's Premium ones) rather than the default.

**Sound.** Every sound effect is made in code: plucked lyre strings, struck bronze and stone, gravel, splashes, wind, rain, thunder, and Polyphemus' roar are physical models rendered when an encounter's briefing opens, with variations so no two repeats match. Each encounter has its own ambience (cave drips and torchlight, a storm, the strait's whirlpool) and its own reverb. Sounds follow what happens in the game, so footsteps quicken with your speed and the giant's footfalls grow as he closes in.

## Earlier advice voyage: optional local AI

The default **Story mode** uses authored scenes and simple wording rules, not a trained AI model. AI is optional and not installed with this project.

If you already run an OpenAI-compatible model server, copy `.env.example` to `.env` and set its full chat-completions URL, model name, and any key. Restart `npm run dev`, then select AI dialogue in the game's Settings.

For the project's planned Ollama setup, install Ollama from https://ollama.com/ and run `ollama pull llama3.2:3b`. While Ollama is running, use:

```env
FARSHORE_MODEL_URL=http://127.0.0.1:11434/v1/chat/completions
FARSHORE_MODEL_NAME=llama3.2:3b
FARSHORE_API_KEY=
```

Local Llama 3.2 3B was connected and verified through the API and browser on September 23, 2026. Browser dictation and spoken replies depend on browser support. Voice input may use its online speech service; typing always works.

Keep Ollama running while you play. Settings checks the model service's `/models` endpoint and confirms that the configured model is listed. If Ollama was closed, open it and select **Check connection again**. A successful status check confirms availability; a real turn still needs to produce a valid reply. The app allows up to 90 seconds for a reply, including loading the model. A failed turn keeps your counsel and offers **Try AI again** or **Send in Story mode**. Story mode is used only when you choose it.

## Other commands

```sh
npm test
npm run build
npm run preview
```

Build checks TypeScript and creates the production Next.js app. Preview serves that build on port 3000. Production requires server environment variables from the setup guide; machine-wide local AI is development-only.

Guest saves and earlier-mode progress are scoped to the browser and local address. Signed-in arcade progress follows the account when both deployments use the same database. Different local ports have separate guest saves.

The online edition uses React, TypeScript, Next.js, MongoDB, Better Auth, Tailwind CSS, and Radix UI. Original design notes, narrative sources, HCI limitations, and art credits are in [`docs/PROJECT-NOTES.md`](docs/PROJECT-NOTES.md) and [`docs/ART-CREDITS.md`](docs/ART-CREDITS.md).
