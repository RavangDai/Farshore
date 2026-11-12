"""Train the Lotus-Eaters race rival with Stable-Baselines3 PPO.

    training/.venv/Scripts/python training/train_lotus.py --steps 3000000 --run ppo-main

Every --eval-every steps the deterministic policy plays the validation gardens
(never used for training or for the final test). Each evaluation saves a
checkpoint with a JSON file holding the seed, the configuration, the step
count and the validation results. The first evaluation at or after
--early-steps is kept as early.zip, the best so far as best.zip, and the
latest as latest.zip. --resume continues from a saved checkpoint.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.logger import configure

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lotus_rl.evaluation import garden_scenarios, play, sb3_policy, selection_key, summarise, by  # noqa: E402
from lotus_rl.node_vec_env import NodeVecEnv  # noqa: E402

RUNS = Path(__file__).resolve().parent / "runs"


class ValidationCheckpoints(BaseCallback):
    def __init__(self, run_dir: Path, config: dict, every: int, early_steps: int, gardens: int):
        super().__init__()
        self.run_dir, self.config, self.every, self.early_steps = run_dir, config, every, early_steps
        self.scenarios = garden_scenarios("val", gardens)
        self.next_eval = every
        self.best_key: tuple | None = None
        self.early_saved = (run_dir / "early.zip").exists()
        best = run_dir / "best.json"
        if best.exists():
            self.best_key = tuple(json.loads(best.read_text())["selection_key"])
        self.history_file = run_dir / "validation.jsonl"

    def _on_training_start(self) -> None:
        self.next_eval = (self.num_timesteps // self.every + 1) * self.every

    def _on_step(self) -> bool:
        if self.num_timesteps >= self.next_eval:
            self.next_eval += self.every
            self.evaluate()
        return True

    def _on_training_end(self) -> None:
        self.evaluate()

    def evaluate(self) -> None:
        started = time.time()
        episodes = play(sb3_policy(self.model), self.scenarios, envs=48, workers=self.config["workers"])
        summary = summarise(episodes)
        key = selection_key(summary)
        steps = self.num_timesteps
        meta = {
            "run": self.run_dir.name,
            "steps": steps,
            "seed": self.config["seed"],
            "config": self.config,
            "obs_version": self.config["obs_version"],
            "validation": {"scenarios": len(self.scenarios), **summary, "by_difficulty": by(episodes, "difficulty")},
            "selection_key": list(key),
            "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        name = f"ckpt_{steps:09d}"
        self.model.save(self.run_dir / "checkpoints" / f"{name}.zip")
        (self.run_dir / "checkpoints" / f"{name}.json").write_text(json.dumps(meta, indent=2))
        for label, wanted in (("latest", True), ("early", not self.early_saved and steps >= self.early_steps),
                              ("best", self.best_key is None or key > self.best_key)):
            if wanted:
                shutil.copy(self.run_dir / "checkpoints" / f"{name}.zip", self.run_dir / f"{label}.zip")
                (self.run_dir / f"{label}.json").write_text(json.dumps({**meta, "label": label}, indent=2))
        if steps >= self.early_steps:
            self.early_saved = True
        if self.best_key is None or key > self.best_key:
            self.best_key = key
        with self.history_file.open("a") as f:
            f.write(json.dumps({"steps": steps, **summary}) + "\n")
        for k, v in summary.items():
            if isinstance(v, (int, float)):
                self.logger.record(f"validation/{k}", v)
        print(f"[validation] {steps:,} steps: full rescue {summary['full_rescue_rate']:.1%}, "
              f"avg rescued {summary['avg_rescued']:.2f}, median finish {summary['median_finish_s']}, "
              f"avg hits {summary['avg_hits']:.2f} ({time.time() - started:.0f}s)", flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--run", default="ppo-main", help="run name under training/runs/")
    p.add_argument("--steps", type=int, default=3_000_000, help="total environment steps")
    p.add_argument("--envs", type=int, default=64)
    p.add_argument("--workers", type=int, default=8, help="Node simulation processes")
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--eval-every", type=int, default=200_000)
    p.add_argument("--early-steps", type=int, default=100_000)
    p.add_argument("--val-gardens", type=int, default=40, help="validation gardens, each at all three difficulties")
    p.add_argument("--resume", type=Path, help="a checkpoint .zip to continue from")
    p.add_argument("--threads", type=int, default=4, help="torch CPU threads")
    args = p.parse_args()

    torch.set_num_threads(args.threads)
    run_dir = RUNS / args.run
    (run_dir / "checkpoints").mkdir(parents=True, exist_ok=True)
    env = NodeVecEnv(args.envs, workers=args.workers, mode="train", seed=args.seed, log=run_dir / "env-server.log")
    ppo = dict(n_steps=256, batch_size=2048, n_epochs=5, learning_rate=3e-4, gamma=0.99, gae_lambda=0.95,
               clip_range=0.2, ent_coef=0.01, vf_coef=0.5, max_grad_norm=0.5)
    policy_kwargs = dict(net_arch=dict(pi=[128, 128], vf=[128, 128]))
    config = {"seed": args.seed, "envs": args.envs, "workers": args.workers, "total_steps": args.steps,
              "ppo": ppo, "policy": "MlpPolicy", "policy_kwargs": {"net_arch": {"pi": [128, 128], "vf": [128, 128]}, "activation": "Tanh"},
              "obs_size": env.obs_size, "obs_version": env.obs_version,
              "train_difficulties": {"easy": 0.2, "normal": 0.3, "hard": 0.5}, "train_plans": ["standard", "pincer", "undertow"],
              "train_gardens": "generated seeds 1..999,998 (classic, showcase, eval and validation gardens excluded)"}
    (run_dir / "config.json").write_text(json.dumps(config, indent=2))

    if args.resume:
        model = PPO.load(args.resume, env=env, device="cpu")
        print(f"Resuming from {args.resume} at {model.num_timesteps:,} steps", flush=True)
    else:
        model = PPO("MlpPolicy", env, policy_kwargs=policy_kwargs, seed=args.seed, device="cpu", verbose=0, **ppo)
    model.set_logger(configure(str(run_dir / "logs"), ["stdout", "csv"]))
    callback = ValidationCheckpoints(run_dir, config, args.eval_every, args.early_steps, args.val_gardens)
    started = time.time()
    remaining = max(0, args.steps - model.num_timesteps)
    model.learn(total_timesteps=remaining, callback=callback, reset_num_timesteps=not args.resume, log_interval=4)
    env.close()
    print(f"Done: {model.num_timesteps:,} steps in {(time.time() - started) / 60:.1f} min. Run folder: {run_dir}", flush=True)


if __name__ == "__main__":
    main()
