# The Lotus-Eaters race rival: training, evaluation and export

The **Rescue Race** (Encounter 01, Land of the Lotus-Eaters) pits you against a rival trained with reinforcement learning. This folder trains that rival with Stable-Baselines3 PPO, evaluates it, and exports it to ONNX for the browser.

The policy plays the game itself, not a copy of it. A Node process (`lotus_env_server.mjs`) runs the game's own TypeScript rules (`src/lib/encounters/odyssey-games.ts`, `lotus-race.ts`, and the observation and reward in `src/lib/ai/lotus-agent.ts`). Python drives it as a vectorised environment (`lotus_rl/node_vec_env.py`); `lotus_rl/gym_env.py` wraps one garden as a standard `gymnasium.Env`, which passes Gymnasium's `check_env`. The browser race calls the same `observe()` before every rival move, so training and live play see identical numbers.

## Setup (once)

```powershell
python -m venv --system-site-packages training/.venv
training/.venv/Scripts/python -m pip install "stable-baselines3>=2.4" "gymnasium>=1.0" onnx
```

`--system-site-packages` reuses an installed PyTorch and onnxruntime. Without them, also install `torch` (CPU is enough) and `onnxruntime`. Node 22.13 or newer must be on the PATH.

## Commands

| Step | Command |
|---|---|
| Train the guarded rival (v2 observation, half the gardens guarded) | `training/.venv/Scripts/python training/train_lotus.py --run ppo-guarded --obs-version 2 --net 256 --ent-coef 0.005 --guarded-share 0.5 --steps 20000000 --eval-every 500000 --val-gardens 60 --val-guarded 60` |
| Smoke test (about 30 s) | `training/.venv/Scripts/python training/train_lotus.py --run smoke --steps 60000 --eval-every 30000 --early-steps 30000 --val-gardens 8 --envs 32 --workers 4` |
| Train | `training/.venv/Scripts/python training/train_lotus.py --run ppo-main --steps 15000000` |
| Resume | `training/.venv/Scripts/python training/train_lotus.py --run ppo-main --steps 20000000 --resume training/runs/ppo-main/latest.zip` |
| Train the shipped rival (v3) | `training/.venv/Scripts/python training/train_lotus.py --run ppo-v3 --obs-version 3 --net 256 --ent-coef 0.005 --guarded-share 0.5 --hit-penalty -5 --steps 15000000 --eval-every 500000 --early-steps 250000 --val-gardens 60 --val-guarded 60 --seed 17` |
| Evaluate | `training/.venv/Scripts/python training/evaluate_lotus.py --run ppo-v3 --also training/checkpoints/ppo-main/early.zip training/checkpoints/ppo-main/best.zip` |
| Export to the game | `training/.venv/Scripts/python training/export_lotus_onnx.py --checkpoint training/checkpoints/ppo-v3/best.zip --label "PPO v3 best"` |
| Check parity | `npm test` (runs `tests/lotus-onnx.test.mjs` with ONNX Runtime Web) |

Training defaults: 64 gardens across 8 Node workers, about 7,000 steps a second on an 18-thread CPU, so 15 million steps take about 35 minutes. `--resume` continues the step count and keeps the run's early and best checkpoints.

## What gets saved

Each run lives in `training/runs/<run>/` (ignored by git):

- `checkpoints/ckpt_<steps>.zip` and `.json`: one per validation, every `--eval-every` steps. The JSON holds the seed, the full configuration, the step count and the validation results.
- `early.zip`: the first checkpoint at or after `--early-steps`, kept to show how the rival improved.
- `best.zip`: the checkpoint with the best validation score: full-rescue rate first, then average sailors rescued, then median finish time.
- `latest.zip`, `config.json`, `validation.jsonl` (one line per validation), `logs/progress.csv` (PPO's training log) and `env-server.log`.

The early and best checkpoints are copied to `training/checkpoints/<run>/` with their JSON, the run's `config.json` and `validation.jsonl`, so they stay with the repository.

## The shipped rival and how it got there

| Run | Observation | Steps run | Best checkpoint | Held-out test: full rescues |
|---|---|---|---|---|
| `ppo-main` | v1 | 9.75M of 15M (stopped: validation flat after 3M) | 3M | 70.3% (A* 66.7%) |
| `ppo-v2`, `ppo-guarded` | v2 | 1.5M and 5M (stopped: no better than `ppo-main` on the same validation) | — | not evaluated |
| **`ppo-v3`** (shipped) | v3, half the gardens guarded, hit −5 | 3.5M of 15M (stopped: validation flat at about 98% from 1.5M) | **2M** | **94.4%** (guardian-aware A* 93.6%) |

Version 1 learned little more than shortest-path routing: on the classic and showcase gardens it played exactly like A*. A hand-written guardian-aware A* showed the gardens were far more solvable (about 96% on validation), and the missing information was where the safe route runs. Version 3 adds it, and the policy reached 97% on validation within 500,000 steps. Full numbers: [docs/ai-eval/lotus-race.md](../docs/ai-eval/lotus-race.md). The runs stopped early can be continued with `--resume training/runs/<run>/latest.zip` (run folders are not in git; the kept checkpoints are in `training/checkpoints/`).

## Gardens: training, validation and test never overlap

`src/lib/encounters/lotus-layouts.ts` generates 15 × 11 gardens from a seed and validates each one before use. It checks that the hedge is closed, every path connects to the ship, every sailor has a route home, nothing shares a tile, guardians start at least 6 steps from the ship, and the patrol points are on paths.

| Set | Gardens | Used for |
|---|---|---|
| Training | seeds 1 to 999,998 | every training episode draws a fresh one; `--guarded-share` of them guarded |
| Validation | seeds 1,500,000 and up (`val:N`, guarded `valguarded:N`) | choosing the best checkpoint |
| Test | seeds 1,000,000 and up (`eval:N`, guarded `guarded:N`) | the final comparison only |
| Classic | the original garden | never trained on; reported separately |
| Showcase | "The crossing" | never trained on; reported separately |
| New Maze in the race | seeds 2,000,000 and up | fresh gardens for players |

**Guarded gardens.** `generateLotusLayout(seed, "guarded")` keeps a garden's maze, ship, sailors and guardian starts, but moves the patrol onto the tiles the escorts home funnel through. `escortTraffic()` scores each tile by the share of shortest ship-to-sailor routes through it, so a chokepoint every route must cross scores 1 per sailor. That makes the shortest way home often watched, as at the showcase garden's crossing, which is the situation where reading the patrol and going round pays. A plain garden for a seed never changes, so every evaluation garden stays the same.

Training episodes also draw the difficulty (Easy 20%, Medium 30%, Hard 50%) and the guardian plan (standard patrol, pincer or undertow).

## The policy

- **Actions:** `UP`, `DOWN`, `LEFT`, `RIGHT`, `WAIT`, chosen once per movement opportunity. Odysseus can step every 170 ms; time runs in fixed 10 ms ticks, so one decision covers 17 ticks. A wait, or a step into a hedge, spends the opportunity, just as a held key against a hedge does.
- **Network:** an MLP with two hidden layers (Tanh) for the policy and the same for the value function: 128 wide by default, `--net` to change.
- **PPO:** 256 steps per environment per rollout, batch 2048, 5 epochs, learning rate 3e-4, gamma 0.99, GAE lambda 0.95, clip 0.2, entropy 0.01 (`--ent-coef`).

### Observation (version 1, 175 numbers)

Everything comes from what a player can see on screen. Nothing reveals where a guardian will move next, the patrol counter, or any random state. Path distances are breadth-first distances through the hedges. Distances are divided by 40 (20 for guardians) and capped at 1; 1 also means "none".

| Index | Count | Meaning |
|---|---|---|
| 0 | 1 | escorting a sailor (0/1) |
| 1 | 1 | sailors aboard / 3 |
| 2 | 1 | sailors still waiting / 3 |
| 3 | 1 | hits taken / 3 (health) |
| 4 | 1 | moly protection left / 14 s |
| 5 | 1 | invulnerability after a hit / 1.8 s |
| 6 | 1 | time left / time limit |
| 7 | 1 | the guardians' step rhythm: time since their last step / their step interval (visible on screen as they move) |
| 8–10 | 3 | difficulty (Easy, Medium, Hard), one-hot |
| 11–13 | 3 | guardian plan (patrol, pincer, undertow), one-hot, as shown in the briefing |
| 14–17 | 4 | Odysseus x/14, y/10; ship minus Odysseus, x/14 and y/10 |
| 18–49 | 4 × 8 | for up, down, left, right: open (0/1); progress toward the current goal (+1 closer, −1 further); path distance to the goal; to the ship; to the nearest waiting sailor; to the nearest guardian; a guardian on that tile (0/1); to the nearest moly |
| 50–54 | 5 | the same five distances from where he stands |
| 55–64 | 2 × 5 | each guardian: dx/14, dy/10, path distance, Manhattan distance/20, within 7 tiles (the distance at which guardians start chasing) |
| 65–76 | 3 × 4 | each waiting sailor, nearest first: present, dx/14, dy/10, path distance |
| 77–125 | 49 | a 7 × 7 view centred on Odysseus: hedges (and the edge) as 1 |
| 126–174 | 49 | the same view: guardians as 1 |

"The goal" is the ship while a sailor follows, otherwise the nearest waiting sailor by path.

### Observation version 2 (179 numbers)

Version 2 is version 1 followed by four more numbers: the direction of each guardian's last step, `dx` then `dy` (−1, 0 or 1), for guardian 1 then guardian 2 (indices 175–178). A player sees this as the guardians move; it says nothing about their next step. Train with `--obs-version 2`.

### Observation version 3 (193 numbers)

Version 3 is version 2 followed by 14 numbers about danger and the safe route. A tile is *guarded* when a guardian stands on it or next to it (no tile is guarded while moly protects Odysseus). The *safe route* is the shortest way to the current goal that never enters a guarded tile, apart from the one Odysseus stands on.

| Index | Count | Meaning |
|---|---|---|
| 179 | 1 | a safe route exists from here (0/1) |
| 180 | 1 | safe-route distance from here / 40 (1 if none) |
| 181–192 | 4 × 3 | for up, down, left, right: that tile is guarded (0/1); progress along the safe route (+1, 0, −1); safe-route distance from that tile / 40 |

Train with `--obs-version 3`.

Every model records the version it was trained on (`obs_version` in the checkpoint JSON, `obsVersion` in `lotus-policy.json`). The environment server, the evaluation, the export and the browser race all build exactly that version. Add a new version to `OBS_SIZES` rather than changing an existing one; the game refuses a model whose version it cannot build.

### Reward

Per decision: **+10** for each sailor brought aboard, **+10** more for the third, **−3** for each hit (`--hit-penalty`; the v3 run uses −5), **−0.01** per step, plus potential-based shaping `0.99·φ(next) − φ(prev)` with `φ = sailors aboard + 0.5·escorting − 0.05·path distance to the goal` (φ = 0 once the board ends). Shaping by a potential difference cannot be farmed: a loop back to the same state nets nothing beyond the step cost. `tests/lotus-race.test.mjs` checks that delivering earns far more than waiting, and more than collecting a sailor without delivering.

Evaluation never uses the reward. It reports what happened in the game: sailors aboard, full rescues, finish times and hits.

## The baselines

- **A\*** (`astarAction()`): the game's own A* shortest path (`mazePath`) to the nearest sailor, then home. It ignores the guardians, so it shows what pure route-finding achieves under the same rules and the same 170 ms cadence.
- **Guardian-aware A\*** (`carefulAction()`): follows the safe route defined above; with none, it steps to the open tile farthest from the guardians if that is further than where it stands, else falls back to A*. It is a hand-written heuristic and a much stronger yardstick: on the validation gardens it brings everyone home in about 96% of runs against about 79% for A*.

## In the game

- The game loads `public/models/lotus/lotus-policy.onnx`, described by `lotus-policy.json` (label, checkpoint, steps, seed, observation version, hash, validation results).
- ONNX Runtime Web runs it on WebAssembly in the browser. The game serves the runtime's `.wasm` and its JavaScript glue from `app/ort/[file]`, so it works offline. The content security policy allows `'wasm-unsafe-eval'` for that.
- The model loads before the countdown. If it fails, the race shows the error and a retry button; no other logic stands in for it.
- One model call per movement opportunity. The shared clock waits for the answer, so neither board gains a move.

### Parity

`export_lotus_onnx.py` collects 256 real observations from held-out play and checks that Stable-Baselines3, the PyTorch export module and ONNX Runtime (Python) choose the same action for every one. It saves them to `tests/fixtures/lotus-parity.json`. `npm test` then checks the shipped model with ONNX Runtime Web. In a development build the page exposes `window.farshoreLotusPolicy()`, so a browser check can run the same fixture through the page's own loader.

## If training goes wrong

- Logs: `training/runs/<run>.log` (if started with redirection), `training/runs/<run>/logs/progress.csv`, `validation.jsonl` and `env-server.log`.
- "The environment server stopped": read `env-server.log`, usually a TypeScript error after a rules change.
- To resume after an interruption, use the Resume command above with the run's `latest.zip`.
