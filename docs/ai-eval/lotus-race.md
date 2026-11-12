# Lotus-Eaters rescue race: trained rival evaluation

Generated 2026-11-12T05:38:58+00:00 by `training/evaluate_lotus.py --run ppo-v3`. Every number is measured from the game's own rules: sailors aboard, whether all three came aboard, finish time and hits. The training reward is not used. Runs are deterministic: the policy takes its highest-scoring action and the garden has no randomness.

## Held-out test gardens

120 held-out gardens (eval seeds 1,000,000+) x easy/normal/hard, guardian plan rotating. None of these gardens was used in training or to choose the best checkpoint.

| Policy | Runs | Full-rescue rate | Avg sailors rescued | Median finish (completed runs) | Avg hits |
|---|---|---|---|---|---|
| PPO early (500,032 steps) | 360 | 93.3% | 2.91 | 17.5 s | 0.28 |
| PPO best (2,000,000 steps) | 360 | 94.4% | 2.92 | 17.5 s | 0.23 |
| PPO ppo-main early (250,048 steps) | 360 | 0.0% | 0.03 | — | 1.69 |
| PPO ppo-main best (3,000,000 steps) | 360 | 70.3% | 2.54 | 16.5 s | 1.20 |
| A* baseline | 360 | 66.7% | 2.45 | 16.1 s | 1.27 |
| Guardian-aware A* | 360 | 93.6% | 2.91 | 17.5 s | 0.13 |
| Browser model (ONNX, PPO v3 best) | 360 | 94.4% | 2.92 | 17.5 s | 0.23 |

### By difficulty

**Easy**

| Policy | Runs | Full-rescue rate | Avg sailors rescued | Median finish (completed runs) | Avg hits |
|---|---|---|---|---|---|
| PPO early (500,032 steps) | 120 | 95.8% | 2.95 | 17.2 s | 0.08 |
| PPO best (2,000,000 steps) | 120 | 95.8% | 2.96 | 17.2 s | 0.03 |
| PPO ppo-main early (250,048 steps) | 120 | 0.0% | 0.05 | — | 0.26 |
| PPO ppo-main best (3,000,000 steps) | 120 | 84.2% | 2.78 | 16.5 s | 0.83 |
| A* baseline | 120 | 80.0% | 2.71 | 16.2 s | 0.91 |
| Guardian-aware A* | 120 | 95.0% | 2.92 | 17.2 s | 0.01 |
| Browser model (ONNX, PPO v3 best) | 120 | 95.8% | 2.96 | 17.2 s | 0.03 |

**Medium**

| Policy | Runs | Full-rescue rate | Avg sailors rescued | Median finish (completed runs) | Avg hits |
|---|---|---|---|---|---|
| PPO early (500,032 steps) | 120 | 92.5% | 2.89 | 18.2 s | 0.36 |
| PPO best (2,000,000 steps) | 120 | 95.0% | 2.92 | 17.9 s | 0.32 |
| PPO ppo-main early (250,048 steps) | 120 | 0.0% | 0.03 | — | 2.42 |
| PPO ppo-main best (3,000,000 steps) | 120 | 65.8% | 2.48 | 16.3 s | 1.33 |
| A* baseline | 120 | 61.7% | 2.38 | 16.1 s | 1.39 |
| Guardian-aware A* | 120 | 93.3% | 2.91 | 18.2 s | 0.17 |
| Browser model (ONNX, PPO v3 best) | 120 | 95.0% | 2.92 | 17.9 s | 0.32 |

**Hard**

| Policy | Runs | Full-rescue rate | Avg sailors rescued | Median finish (completed runs) | Avg hits |
|---|---|---|---|---|---|
| PPO early (500,032 steps) | 120 | 91.7% | 2.88 | 17.5 s | 0.41 |
| PPO best (2,000,000 steps) | 120 | 92.5% | 2.89 | 17.5 s | 0.35 |
| PPO ppo-main early (250,048 steps) | 120 | 0.0% | 0.02 | — | 2.38 |
| PPO ppo-main best (3,000,000 steps) | 120 | 60.8% | 2.34 | 16.5 s | 1.43 |
| A* baseline | 120 | 58.3% | 2.27 | 16.1 s | 1.50 |
| Guardian-aware A* | 120 | 92.5% | 2.89 | 18.9 s | 0.22 |
| Browser model (ONNX, PPO v3 best) | 120 | 92.5% | 2.89 | 17.5 s | 0.35 |

## Held-out gardens with guarded escort routes

The same test gardens, but the guardians patrol the tiles the escorts home funnel through, as in the showcase garden. This is the harder skill: noticing a watched route and going round.

| Policy | Runs | Full-rescue rate | Avg sailors rescued | Median finish (completed runs) | Avg hits |
|---|---|---|---|---|---|
| PPO early (500,032 steps) | 360 | 87.5% | 2.82 | 17.5 s | 0.32 |
| PPO best (2,000,000 steps) | 360 | 91.7% | 2.88 | 17.7 s | 0.28 |
| PPO ppo-main early (250,048 steps) | 360 | 0.0% | 0.03 | — | 2.01 |
| PPO ppo-main best (3,000,000 steps) | 360 | 65.6% | 2.44 | 16.5 s | 1.38 |
| A* baseline | 360 | 62.2% | 2.36 | 16.5 s | 1.44 |
| Guardian-aware A* | 360 | 90.0% | 2.82 | 17.9 s | 0.20 |

## The classic garden (your current maze)

Each policy plays it under all three difficulties and all three guardian plans (9 runs). The garden was never used in training.

| Policy | Runs | Full-rescue rate | Avg sailors rescued | Median finish (completed runs) | Avg hits |
|---|---|---|---|---|---|
| PPO early (500,032 steps) | 9 | 100.0% | 3.00 | 14.8 s | 0.22 |
| PPO best (2,000,000 steps) | 9 | 100.0% | 3.00 | 14.8 s | 0.22 |
| PPO ppo-main early (250,048 steps) | 9 | 0.0% | 0.00 | — | 2.00 |
| PPO ppo-main best (3,000,000 steps) | 9 | 100.0% | 3.00 | 14.8 s | 0.00 |
| A* baseline | 9 | 100.0% | 3.00 | 14.8 s | 0.00 |
| Guardian-aware A* | 9 | 100.0% | 3.00 | 14.8 s | 0.00 |

Hard runs, one per guardian plan:

| Policy | Plan | Sailors aboard | Finish | Hits |
|---|---|---|---|---|
| PPO early (500,032 steps) | undertow | 3/3 | 14.8 s | 0 |
| PPO early (500,032 steps) | standard | 3/3 | 26.5 s | 1 |
| PPO early (500,032 steps) | pincer | 3/3 | 26.7 s | 1 |
| PPO best (2,000,000 steps) | undertow | 3/3 | 18.9 s | 0 |
| PPO best (2,000,000 steps) | standard | 3/3 | 26.2 s | 1 |
| PPO best (2,000,000 steps) | pincer | 3/3 | 26.2 s | 1 |
| PPO ppo-main early (250,048 steps) | pincer | 0/3 | — | 3 |
| PPO ppo-main early (250,048 steps) | standard | 0/3 | — | 3 |
| PPO ppo-main early (250,048 steps) | undertow | 0/3 | — | 3 |
| PPO ppo-main best (3,000,000 steps) | standard | 3/3 | 14.8 s | 0 |
| PPO ppo-main best (3,000,000 steps) | pincer | 3/3 | 14.8 s | 0 |
| PPO ppo-main best (3,000,000 steps) | undertow | 3/3 | 14.8 s | 0 |
| A* baseline | standard | 3/3 | 14.8 s | 0 |
| A* baseline | pincer | 3/3 | 14.8 s | 0 |
| A* baseline | undertow | 3/3 | 14.8 s | 0 |
| Guardian-aware A* | standard | 3/3 | 14.8 s | 0 |
| Guardian-aware A* | pincer | 3/3 | 14.8 s | 0 |
| Guardian-aware A* | undertow | 3/3 | 14.8 s | 0 |

## The showcase garden (route choice)

A short crossing through the middle that the guardians patrol, or a longer loop. 9 runs each.

| Policy | Runs | Full-rescue rate | Avg sailors rescued | Median finish (completed runs) | Avg hits |
|---|---|---|---|---|---|
| PPO early (500,032 steps) | 9 | 100.0% | 3.00 | 20.2 s | 0.00 |
| PPO best (2,000,000 steps) | 9 | 100.0% | 3.00 | 20.2 s | 0.00 |
| PPO ppo-main early (250,048 steps) | 9 | 0.0% | 0.00 | — | 0.00 |
| PPO ppo-main best (3,000,000 steps) | 9 | 11.1% | 2.11 | 20.7 s | 2.89 |
| A* baseline | 9 | 11.1% | 2.11 | 20.7 s | 2.89 |
| Guardian-aware A* | 9 | 100.0% | 3.00 | 19.6 s | 0.00 |

## Checkpoints

| Label | Steps | Seed | Saved | File |
|---|---|---|---|---|
| ppo-v3 early | 500,032 | 17 | 2026-11-12T05:27:21+00:00 | `training/runs/ppo-v3/early.zip` |
| ppo-v3 best | 2,000,000 | 17 | 2026-11-12T05:32:09+00:00 | `training/runs/ppo-v3/best.zip` |
| ppo-main early | 250,048 | 7 | 2026-11-12T00:02:10+00:00 | `training/checkpoints/ppo-main/early.zip` |
| ppo-main best | 3,000,000 | 7 | 2026-11-12T00:08:19+00:00 | `training/checkpoints/ppo-main/best.zip` |

The game loads `public/models/lotus/lotus-policy.onnx`: **PPO v3 best**, from `ppo-v3/best.zip` at 2,000,000 steps (sha256 `7f199e01f9941861…`).
