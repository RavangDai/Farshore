# Farshore: laptop / VS Code edition

The complete retro browser game with twenty character portraits, six illustrated backdrops, an animated intro, eleven encounters, a character book, a voyage map, and saved progress.

## Start in VS Code (Windows, macOS, or Linux)

1. Install Node.js 24 from https://nodejs.org/ if needed. Node 22.13 or newer also works. Restart VS Code after installing Node.
2. Extract the ZIP. In VS Code, choose **File > Open Folder** and select **Farshore-VSCode**, the folder containing `package.json`.
3. Choose **Terminal > New Terminal**. Run these commands one at a time:

```sh
npm install
npm run dev
```

4. Open **http://localhost:5173** in your browser. Press **Begin Voyage**.
5. Leave the terminal running while you play. Press **Ctrl+C** in the terminal to stop.

Next time, only run `npm run dev`. Installation requires internet. All artwork and fonts are included locally. Story mode needs no API key or external model.

Do not double-click `index.html` or use VS Code Live Server. The npm command starts both the game and its local dialogue endpoint.

## If Windows PowerShell blocks npm.ps1

In VS Code's terminal dropdown, choose **Command Prompt**, or use:

```bat
npm.cmd install
npm.cmd run dev
```

No PowerShell security policy change is needed. If npm is not recognized, install Node and restart VS Code. If port 5173 is in use, stop your other dev server, or run `npm run dev -- --port 5174` and open the printed address.

## Edit the game

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Title screen, intro, UI, sound, speech, saves |
| `src/styles.css` | Retro theme, motion, responsive layouts |
| `src/lib/game.ts` | Encounters, scoring, trust, scripted decisions |
| `src/lib/cast.ts` | Characters, lore, scene assignments, intro |
| `server/turn.ts` | Dialogue validation and optional model connection |
| `vite.config.ts` | Local server and API wiring |
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

This optional integration still needs testing with your laptop and selected model. Browser dictation and spoken replies depend on browser support. Voice input may use its online speech service; typing always works.

## Other commands

```sh
npm test
npm run build
npm run preview
```

Build checks TypeScript and bundles the app. Preview serves that build at http://localhost:4173 with the same local dialogue endpoint. The preview server is for local use.

Progress is saved per browser and local address. Your hosted-game save will not transfer automatically to localhost. Port 4173 also has separate progress from port 5173.

This edition uses React, TypeScript, Vite, Tailwind CSS, and Radix UI. It runs locally without a hosting account. Original design notes, narrative sources, HCI limitations, and art credits are in `PROJECT-NOTES.md` and `ART-CREDITS.md`.
