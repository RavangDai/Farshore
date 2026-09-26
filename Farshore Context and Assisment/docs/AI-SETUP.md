# Connect Farshore to local Llama on Windows

Local setup was completed on September 23, 2026. See [AI-VERIFICATION.md](AI-VERIFICATION.md) for real responses, browser checks, timings, and the remaining decision-consistency limitation. The steps below remain the setup and restart guide.

The Codex CLI shown in your screenshot already has a coding model connection. Farshore's in-game AI uses a separate connection in `server/turn.ts`. This guide follows your slide's Llama 3.2 3B choice. Its performance on your laptop still needs measurement.

## 1. Install and start Ollama

Install Ollama for Windows from https://ollama.com/download/windows. Start Ollama from the Start menu, then open a new VS Code terminal so it sees the installed command.

Run:

```powershell
ollama pull llama3.2:3b
ollama run llama3.2:3b
```

The first command downloads the model. In the model chat, ask it to say hello. After it replies, type `/bye` to return to PowerShell. Keep the Ollama background application running. The first response can take longer while the model loads. Do not expect the slide's under-one-second figure without measuring it.

If the command is not recognized, restart VS Code after installation. If the server cannot be reached, start the Ollama application. Use `ollama serve` in a separate terminal only if the background server is not already running.

## 2. Configure the project

In your project terminal:

```powershell
cd D:\Farshore\Farshore
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Open `.env` in VS Code. Set these entries, removing the leading `#` from them if present. Preserve other existing settings and avoid duplicate entries:

```dotenv
FARSHORE_MODEL_URL=http://127.0.0.1:11434/v1/chat/completions
FARSHORE_MODEL_NAME=llama3.2:3b
FARSHORE_API_KEY=
```

Local Ollama does not require an API key. These names are read by the server. Do not rename them with a `VITE_` prefix or place credentials in browser code. `.env` is already excluded from Git.

If you choose a cloud provider later, configure that provider's compatible endpoint, served model name, and server-side credential instead. The current adapter expects chat completions with strict JSON-schema output (`response_format.type = json_schema`); not every provider/model supports the same fields. Your Codex session credentials are not used by this adapter.

## 3. Restart and play

Stop any running Farshore dev server with Ctrl+C. Run:

```powershell
npm run dev
```

If dependencies have not been installed, run `npm install` first. If PowerShell blocks npm.ps1, use `npm.cmd run dev` or VS Code's Command Prompt terminal.

Open http://localhost:5173, or the address printed by Vite. Open the game's Settings and choose **AI dialogue**. Start or continue a voyage, type advice, and submit it. A successful model turn displays **AI interpretation** with Odysseus' response. Story mode remains available separately.

Settings now checks the model service and confirms that it lists the configured model. Use **Check connection again** after starting Ollama. This check does not generate a reply; verify a real turn as described below.

## 4. Verify a real request

With Ollama and `npm run dev` still running, open a second PowerShell terminal. This check requests a model turn directly without changing your browser's saved voyage:

```powershell
$turnBody = @{
    encounterId = 'lotus'
    advice = 'Let us return to the ship and keep our promise to our families.'
    trust = 50
    mode = 'ai'
} | ConvertTo-Json

$turnResult = Invoke-RestMethod `
    -Uri 'http://localhost:5173/api/turn' `
    -Method Post `
    -ContentType 'application/json' `
    -Body $turnBody

$turnResult | ConvertTo-Json -Depth 5
```

Success returns `source: "ai"`, a reply, a reason, and validated decision fields. The decision can vary; this is a connection check, not a guarantee that a particular advice prompt always wins. Then test one turn in the browser too.

| Problem | What to check |
| --- | --- |
| AI dialogue is unavailable | Check the status message in Settings. Ensure `.env` is beside package.json, the model is installed, and Ollama is running. Select **Check connection again** after starting it. Restart the dev server after changing `.env` |
| Model is absent | Run `ollama list`; check that `llama3.2:3b` is installed |
| Ollama is unreachable | Start the Ollama application; use `ollama run llama3.2:3b` to check it directly |
| Request takes too long | The adapter allows 90 seconds for loading and inference. Use **Try AI again** after a timeout, or explicitly choose **Send in Story mode** |
| Game shows a model error | The message distinguishes an unreachable service, provider rejection, timeout, or invalid reply. Counsel stays in the input for retry. A successful connection check alone does not verify generation |
| Port differs | Use Vite's printed port in both the browser and the API-check URI |

## What the game model sees

`server/turn.ts` sends Odysseus' personality, current scene, trust, possible actions, the player's advice, and a required JSON format. The professor's PDF and AGENTS.md guide the coding assistant; they are not automatically sent to the in-game model.

The server validates the model's answer and assigns game costs and outcomes. Failed AI requests retain the advice and display an error. The game does not silently substitute Story mode for a failed AI response.

## Official setup references

Checked September 22, 2026:

- Ollama on Windows: https://docs.ollama.com/windows
- Llama 3.2 3B model: https://ollama.com/library/llama3.2:3b
- Compatible chat-completions API: https://docs.ollama.com/api/openai-compatibility
- Codex project instructions: https://learn.chatgpt.com/docs/agent-configuration/agents-md

The original package supplied instructions and an unverified adapter. The local connection has since been established and tested; see [the verification record](AI-VERIFICATION.md) for results and limitations.
