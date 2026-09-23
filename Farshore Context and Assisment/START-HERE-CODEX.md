# Give Codex the Farshore assignment context

The previous laptop ZIP included project notes but did not include the professor's original PDF, the presentation, or AGENTS.md. This add-on supplies those files and model setup instructions.

## Install the add-on

1. Extract `Farshore-Codex-Context.zip` into a temporary folder.
2. Copy `AGENTS.md`, `START-HERE-CODEX.md`, and the `docs` folder into your existing project folder, currently `D:\Farshore\Farshore`.
3. Check that `D:\Farshore\Farshore\AGENTS.md` is beside `package.json`. Avoid adding another nested project folder. If you have since created your own AGENTS.md, merge these instructions with it.
4. Start a new Codex session from that folder. Close the previous Codex session normally, then run:

```powershell
cd D:\Farshore\Farshore
codex
```

Codex reads AGENTS.md at session startup. Other coding tools may need you to attach it or ask explicitly for these files to be read. This add-on includes only instructions and source documents; it contains no game source replacements or credentials.

## First message to Codex

Paste this into the new session:

```text
Read AGENTS.md and its referenced assignment and presentation documents. I have already submitted and presented Phase 1. Briefly confirm the professor's requirements, my Farshore game concept, and the current implementation gaps. Then help me connect the existing game API to local Llama 3.2 3B using Ollama, following docs/AI-SETUP.md. Inspect my current files first and preserve my edits. Keep the retro game design. Verify a real AI turn and tell me what you tested. Do not claim interviews or benchmarks are complete without evidence.
```

## Two different AI connections

Your screenshot shows Codex already connected to its coding model. This lets it help edit your project. Farshore's in-game Odysseus requires its own model endpoint. Follow `docs/AI-SETUP.md` for that connection.

## Included context

- `AGENTS.md`: instructions Codex loads for this project.
- `docs/assignment/REQUIREMENTS.md`: verified professor requirements with page references.
- `docs/assignment/PRESENTATION.md`: proposal summary and known differences.
- `docs/assignment/PROFESSOR-BRIEF.txt` and `PRESENTATION-TEXT.txt`: complete text extractions for coding tools.
- `docs/assignment/original/`: unmodified professor PDF and your six-slide PPTX.
- `docs/AI-SETUP.md`: Windows/Ollama setup and a real API check.

Official Codex reference: https://learn.chatgpt.com/docs/agent-configuration/agents-md
