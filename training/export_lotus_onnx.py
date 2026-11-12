"""Export a trained Lotus-Eaters checkpoint to ONNX for the browser.

    training/.venv/Scripts/python training/export_lotus_onnx.py --checkpoint training/runs/ppo-main/best.zip

Writes public/models/lotus/lotus-policy.onnx and lotus-policy.json (the
checkpoint label, run, step count, seed, observation version and hash), then
plays the policy on held-out gardens to collect real observations and checks
that Stable-Baselines3, the PyTorch export module and ONNX Runtime all choose
the same action for every one. Those observations, actions and logits are
saved to tests/fixtures/lotus-parity.json, which `npm test` and the browser
check use to confirm the game's runtime chooses the same moves too.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from stable_baselines3 import PPO

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from lotus_rl.evaluation import garden_scenarios, named_scenarios, obs_version_of  # noqa: E402
from lotus_rl.node_vec_env import ACTION_NAMES, NodeVecEnv  # noqa: E402


class PolicyLogits(torch.nn.Module):
    """The policy's action head only: observation in, five action logits out."""

    def __init__(self, policy):
        super().__init__()
        self.extractor = policy.pi_features_extractor
        self.actor = policy.mlp_extractor.policy_net
        self.head = policy.action_net

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        return self.head(self.actor(self.extractor(obs)))


def collect(model: PPO, samples: int, obs_version: int) -> np.ndarray:
    """Real observations from the policy playing held-out gardens, the showcase and the classic garden."""
    scenarios = garden_scenarios("eval", 6, ("normal", "hard")) + named_scenarios("showcase", ("hard",)) + named_scenarios("classic", ("hard",))
    env = NodeVecEnv(len(scenarios), workers=4, mode="eval", scenarios=scenarios, obs_version=obs_version)
    seen: list[np.ndarray] = []
    try:
        obs = env.reset()
        finished = 0
        while finished < len(scenarios):
            seen.extend(obs[~env.idle])
            actions, _ = model.predict(obs, deterministic=True)
            obs, _, _, infos = env.step(actions)
            finished += sum("lotus" in i for i in infos)
    finally:
        env.close()
    picks = np.linspace(0, len(seen) - 1, num=min(samples, len(seen))).astype(int)
    return np.stack([seen[i] for i in picks]).astype(np.float32)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--checkpoint", type=Path, required=True)
    p.add_argument("--out-dir", type=Path, default=ROOT / "public" / "models" / "lotus")
    p.add_argument("--fixture", type=Path, default=ROOT / "tests" / "fixtures" / "lotus-parity.json")
    p.add_argument("--samples", type=int, default=256)
    p.add_argument("--label", help="shown in the game; defaults to the checkpoint's label")
    args = p.parse_args()

    meta_file = args.checkpoint.with_suffix(".json")
    ckpt_meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
    model = PPO.load(args.checkpoint, device="cpu")
    obs_size = int(model.observation_space.shape[0])
    module = PolicyLogits(model.policy).eval()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = args.out_dir / "lotus-policy.onnx"
    torch.onnx.export(module, torch.zeros(1, obs_size), onnx_path, input_names=["obs"], output_names=["logits"],
                      dynamic_axes={"obs": {0: "batch"}, "logits": {0: "batch"}}, opset_version=17, dynamo=False)
    digest = hashlib.sha256(onnx_path.read_bytes()).hexdigest()

    obs_version = obs_version_of(ckpt_meta)
    obs = collect(model, args.samples, obs_version)
    with torch.no_grad():
        torch_logits = module(torch.from_numpy(obs)).numpy()
    sb3_actions, _ = model.predict(obs, deterministic=True)
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    ort_logits = session.run(None, {"obs": obs})[0]
    torch_actions, ort_actions = torch_logits.argmax(1), ort_logits.argmax(1)
    mismatch_sb3 = int((sb3_actions != torch_actions).sum())
    mismatch_ort = int((ort_actions != torch_actions).sum())
    max_diff = float(np.abs(ort_logits - torch_logits).max())
    print(f"{len(obs)} observations: SB3 vs export module {mismatch_sb3} mismatches, ONNX Runtime vs PyTorch {mismatch_ort} mismatches, max logit difference {max_diff:.2e}")
    if mismatch_sb3 or mismatch_ort:
        raise SystemExit("The exported model does not choose the same actions. Not writing the game's model description.")

    run = ckpt_meta.get("run", args.checkpoint.parent.name)
    label = args.label or f"PPO {ckpt_meta.get('label', args.checkpoint.stem)}"
    meta = {
        "label": label,
        "checkpoint": f"{run}/{args.checkpoint.name}",
        "run": run,
        "steps": int(ckpt_meta.get("steps", model.num_timesteps)),
        "seed": ckpt_meta.get("seed"),
        "obsVersion": obs_version,
        "obsSize": obs_size,
        "actions": ACTION_NAMES,
        "exportedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sha256": digest,
        "validation": {k: ckpt_meta.get("validation", {}).get(k) for k in ("runs", "full_rescue_rate", "avg_rescued", "median_finish_s", "avg_hits")},
        "parity": {"observations": len(obs), "mismatches": 0, "maxLogitDifference": max_diff},
    }
    (args.out_dir / "lotus-policy.json").write_text(json.dumps(meta, indent=2) + "\n")
    args.fixture.parent.mkdir(parents=True, exist_ok=True)
    args.fixture.write_text(json.dumps({
        "model": "public/models/lotus/lotus-policy.onnx",
        "sha256": digest,
        "obsSize": obs_size,
        "obsVersion": obs_version,
        "observations": [[float(v) for v in row] for row in obs],
        "actions": [int(a) for a in torch_actions],
        "logits": [[round(float(v), 6) for v in row] for row in torch_logits],
    }) + "\n")
    print(f"Wrote {onnx_path} ({onnx_path.stat().st_size / 1024:.0f} KB), its description, and {args.fixture}. Label: {label}")


if __name__ == "__main__":
    main()
