# Farshore: The Odyssey: Arcade Trials

The online app uses MongoDB, Better Auth email/password accounts, arcade saves across devices, and private AI provider settings. Run `npm.cmd run dev` and open http://localhost:3000. Database setup can wait: guest games work on the device without it. Configuration and Node hosting instructions are in [ONLINE-SETUP.md](ONLINE-SETUP.md).

The paragraphs below describe gameplay and the earlier local setup. For the current online build and security boundary, use the setup guide and [SECURITY.md](SECURITY.md).

A head-to-head retro arcade voyage through five distinct games: Polyphemus grid stealth, Circe falling-potion match-3, Sirens four-lane melody memory, Scylla and Charybdis paddle defense, and Antinous turn-based twelve-ring archery.

Run **`npm.cmd run dev`**, open the printed localhost URL (normally **http://localhost:3000**), and choose **Begin voyage**. Each encounter teaches its own controls and offers practice, retries, Easy/Normal/Hard difficulty, pause, and an assisted passage. Keyboard, pointer, and touch controls work without sound. Optional music includes four distinct notes for the Sirens.

Choose **Arcade Solo** for learnable opponents or **AI Rival Battle** for immediate adaptive opponents. Rivals take visible actions during play. **Prepare with connected model** optionally uses your configured pretrained model to select the strategy before a match. Local adaptive AI and model-selected strategies are labeled separately. Game code owns scores, warnings, collision rules, and progress.

Guests save completed encounters and preferences in the browser. Signed-in arcade players save them in MongoDB. Existing three-trial saves migrate without losing clears; Circe and the strait are added as pending stops. Practice does not advance progress. Assisted passages are marked in the homecoming report and can be upgraded by replaying. Unfinished rounds restart after reload.

See the [five-trial rules and class demonstration](<Farshore Context and Assisment/docs/arcade/README.md>) and [verification record](<Farshore Context and Assisment/docs/arcade/trials-verification.md>). Real model checks for Circe and Scylla are recorded; the [earlier model experiment](<Farshore Context and Assisment/docs/arcade/technical-spike.md>) describes the previous mechanics.

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run build
```

Keep the Node server running. Earlier modes remain in **Settings > Earlier Farshore modes**: [Circe's mystery](http://localhost:3000/?mystery) and the [original advice voyage](http://localhost:3000/?voyage), each with separate device progress. The existing Phase 2 slides and PDFs describe the original advice voyage and await revision for the arcade concept. The original Vite edition is available with `npm.cmd run dev:offline` on port 5173.

## Earlier modes and original voyage notes

The sections below preserve setup, source, art, and AI notes for the earlier modes. The arcade rules are documented above.

## Story and map

The journey now starts with the Cicones after Troy, includes the Laestrygonians and the Phaeacian court, and ends with Penelope’s recognition and peace on Ithaca. Open **What happens in Homer?** beneath an encounter to compare the game with the poem. **Story & Sources** on the title screen includes links and a downloadable [presentation source guide](public/story-sources.md).

The map uses real Natural Earth coastlines, selectable shores, route progress, zoom, and source notes. Legendary locations are marked as illustrative; Oceanus is symbolic. It is a narrative map, not a proven historical itinerary.

To rebuild its vector layer, download the [Natural Earth land GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson), then run `node scripts/build-map.mjs <path-to-ne_50m_land.geojson>` from the project root. This regenerates `src/lib/map-land.ts` without adding a runtime dependency.

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

## Edit the game

| File | Purpose |
| --- | --- |
| `src/MysteryApp.tsx` | Mystery title, investigation UI, journal, inventory, and saves |
| `src/lib/mystery.ts` | Case truth, clues, puzzle prerequisites, and objective stars |
| `server/mystery.ts` | Validated AI question matching to authored character answers |
| `src/mystery.css` | Mystery layout, scene hotspots, and responsive styles |
| `src/App.tsx` | Title screen, intro, UI, sound, speech, saves |
| `src/styles.css` | Retro theme, motion, responsive layouts |
| `src/components/speech-bubble.tsx` | Character dialogue and text reveal |
| `src/components/scene-water.tsx` | Water currents, foam, and landscape masks |
| `src/components/captain-portrait.tsx` | Pixel facial features and character acting |
| `src/lib/character-performance.ts` | Scene and decision based expressions |
| `src/lib/voyage-audio.ts` | Original music, ambience, and sound effects |
| `src/lib/game.ts` | Encounters, scoring, trust, scripted decisions |
| `src/lib/cast.ts` | Characters, lore, scene assignments, intro |
| `server/turn.ts` | Dialogue validation and optional model connection |
| `app/online-shell.tsx` | Accounts, AI settings, and progress synchronization |
| `lib/auth.ts` | Better Auth and email/password security |
| `lib/mongodb.ts` | MongoDB connection and indexes |
| `lib/progress-repository.ts` | Transactional account saves |
| `vite.offline.config.ts` | Original local edition's server and API wiring |
| `public/art/` | Title, scenery, and portrait atlases |
| `public/fonts/` | Pixel font and license |

Changes appear while `npm run dev` is running. In VS Code, **Terminal > Run Task > Run Farshore** is also available after installation.

## Optional local AI

The default **Story mode** uses authored scenes and simple wording rules, not a trained AI model. AI is optional and not installed with this project.

If you already run an OpenAI-compatible model server, copy `.env.example` to `.env` and set its full chat-completions URL, model name, and any key. Restart `npm run dev`, then select AI dialogue in the game's Settings.

For the project's planned Ollama setup, install Ollama from https://ollama.com/ and run `ollama pull llama3.2:3b`. While Ollama is running, use:

```env
FARSHORE_MODEL_URL=http://127.0.0.1:11434/v1/chat/completions
FARSHORE_MODEL_NAME=llama3.2:3b
FARSHORE_API_KEY=
```

Local Llama 3.2 3B was connected and verified through the API and browser on September 23, 2026. See the [setup guide](<Farshore Context and Assisment/docs/AI-SETUP.md>) and [verification record](<Farshore Context and Assisment/docs/AI-VERIFICATION.md>) for timings and remaining decision-consistency limitations. Browser dictation and spoken replies depend on browser support. Voice input may use its online speech service; typing always works.

Keep Ollama running while you play. Settings checks the model service's `/models` endpoint and confirms that the configured model is listed. If Ollama was closed, open it and select **Check connection again**. A successful status check confirms availability; a real turn still needs to produce a valid reply. The app allows up to 90 seconds for a reply, including loading the model. A failed turn keeps your counsel and offers **Try AI again** or **Send in Story mode**. Story mode is used only when you choose it.

## Other commands

```sh
npm test
npm run build
npm run preview
```

Build checks TypeScript and creates the production Next.js app. Preview serves that build on port 3000. Production requires server environment variables from the setup guide; machine-wide local AI is development-only. Use `build:offline` and `preview:offline` for the original Vite edition and its local model endpoint on port 4173.

Progress is saved per browser and local address. Your hosted-game save will not transfer automatically to localhost. Port 4173 also has separate progress from port 5173.

The online edition uses React, TypeScript, Next.js, MongoDB, Better Auth, Tailwind CSS, and Radix UI. The original local edition uses Vite. Original design notes, narrative sources, HCI limitations, and art credits are in `PROJECT-NOTES.md` and `ART-CREDITS.md`.
