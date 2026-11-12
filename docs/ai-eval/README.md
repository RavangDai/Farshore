# Model evaluation for FARSHORE's in-game AI

`scripts/ai-eval.mjs` sends the game's real in-game requests through the same server handlers players use:

- Antinous' shot menus
- the Sirens' melody menus
- Polyphemus' section plans
- the rivals' debriefs
- Athena's questions, including injection attempts

The requests come from seeded engine runs, so every model gets the same set. Each run is saved here as JSON.

```powershell
node --experimental-strip-types scripts/ai-eval.mjs --url <chat-completions URL> --model <name> [--key <key>] [--only athena,choose,debrief]
```

## What the columns mean

| Column | Meaning |
|---|---|
| Valid | Share of requests that got a reply the game accepted. A timeout or an off-menu answer is not valid. In play, an invalid reply means the game makes its own labelled pick. |
| Grounded | Share of accepted decisions whose reason needed no correction: every number came from the game. |
| Agrees with game | Share of decisions matching the game's own top option. **Not a quality score**: a rival in character may choose differently for good reasons. It shows how independent the model's choices are. |
| Refuses off-topic | Share of off-topic and injection questions Athena refused. |
| Answers on-topic | Share of real questions about the shot Athena answered. |
| Debriefs | Share of debriefs that passed the number check. |
| Median / 95th pct | Seconds per request. |

## Results

Measured on 2026-11-08 on the development laptop, a CPU-only machine with Ollama 0.21.

| Model | Where | Valid | Grounded | Agrees with game | Refuses off-topic | Answers on-topic | Debriefs | Median | 95th pct |
|---|---|---|---|---|---|---|---|---|---|
| `qwen3:4b-instruct` | CPU laptop, all 81 requests | 62% | 89% | 26% | 100% | 50% | 83% | 18.3 s | 21.4 s |
| `qwen3:4b-instruct` | CPU laptop, Athena only, after the prompt fix below | 100% | — | — | 100% | 100% | — | 5.2 s | 18.1 s |

### Valid replies by encounter (first run)

| Encounter | Valid | Agrees with game |
|---|---|---|
| Ithaca (Antinous) | 88% | 5% |
| Sirens | 0% (every request passed the 20 s limit) | — |
| Cyclops | 50% | 100% |

### What this run showed, and what changed

**Speed is the limit on a CPU.** A decision took about 18 seconds. That is longer than the time each encounter can give the model:

- Ithaca holds Antinous' aim for about 9 s.
- The Sirens wait up to 3.5 s beyond the rest.
- The cave plans each section about 10 s ahead.

The Sirens' requests carry the most text and all timed out. In play, those decisions become the game's own labelled pick, so nothing breaks, but the model rarely gets to decide. **In-game decisions need a GPU**: the Colab notebook's T4, or a hosted API. Commentary and the briefing plan still work on the CPU.

**Athena refused half of the real questions.** The 4B model refused plain questions about the shot, such as "Which way should I aim?" and "Is the wind strong?". Two fixes:

1. The schema now asks for her answer before the on-topic flag, so the model commits to content first.
2. A refusal is overturned only when the question uses the contest's own words, contains no manipulation words, and the answer still passes the number check.

Injection attempts are still refused every time. That is `tests/athena.test.mjs`.

**Antinous rarely agreed with the game's top option (5%).** The small model often prefers the block shot or the steady hand over the higher expected score. That makes it a more varied rival, and the inspector shows the difference on every shot.

## Next measurement

Run the same script against the Colab planner (`gemma3:12b` by default) through the notebook's tunnel. Then add its row here, and choose the planner from the numbers.

## The Lotus-Eaters race rival (reinforcement learning)

The Rescue Race in Encounter 01 uses a different kind of model: a PPO policy trained with Stable-Baselines3 on the game's own rules, run in the browser with ONNX Runtime Web. It needs no language model. Its evaluation compares the early checkpoint, the best checkpoint and an A* baseline on held-out gardens: [lotus-race.md](lotus-race.md) (raw results in `lotus-race.json`). Training, export and the observation layout: [training/README.md](../../training/README.md).
