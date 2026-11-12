"""Compare the early PPO checkpoint, the best PPO checkpoint and the A* baseline.

    training/.venv/Scripts/python training/evaluate_lotus.py --run ppo-main

All three play the same held-out test gardens (seeds the training and the
checkpoint selection never saw), each at Easy, Medium and Hard with the
guardian plan rotating, then the classic garden and the showcase garden under
every difficulty and plan. The exported ONNX model is also played on the test
gardens through ONNX Runtime, to confirm the browser's model performs the same
as the checkpoint. Results are measured from the game: sailors aboard, full
rescues, finish times and hits. Writes docs/ai-eval/lotus-race.json and .md.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime as ort
from stable_baselines3 import PPO

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from lotus_rl.evaluation import by, garden_scenarios, named_scenarios, obs_version_of, play, sb3_policy, summarise  # noqa: E402


def onnx_policy(path: Path):
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])

    def act(obs: np.ndarray) -> np.ndarray:
        return session.run(None, {"obs": obs.astype(np.float32)})[0].argmax(1)
    return act


def fmt(summary: dict) -> list[str]:
    median = summary.get("median_finish_s")
    return [str(summary["runs"]), f"{summary['full_rescue_rate']:.1%}", f"{summary['avg_rescued']:.2f}",
            f"{median:.1f} s" if median is not None else "—", f"{summary['avg_hits']:.2f}"]


def table(rows: list[tuple[str, dict]]) -> str:
    head = "| Policy | Runs | Full-rescue rate | Avg sailors rescued | Median finish (completed runs) | Avg hits |\n|---|---|---|---|---|---|\n"
    return head + "\n".join(f"| {name} | " + " | ".join(fmt(s)) + " |" for name, s in rows)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--run", default="ppo-main")
    p.add_argument("--gardens", type=int, default=120, help="held-out test gardens, each at all three difficulties")
    p.add_argument("--onnx", type=Path, default=ROOT / "public" / "models" / "lotus" / "lotus-policy.onnx")
    p.add_argument("--out", type=Path, default=ROOT / "docs" / "ai-eval" / "lotus-race")
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--also", nargs="*", default=[], type=Path, help="more checkpoints to compare (each with its .json beside it)")
    args = p.parse_args()

    run_dir = HERE / "runs" / args.run
    checkpoints = {label: run_dir / f"{label}.zip" for label in ("early", "best")}
    metas = {label: json.loads(path.with_suffix(".json").read_text()) for label, path in checkpoints.items()}
    policies: dict[str, tuple[object, int]] = {f"PPO {label} ({metas[label]['steps']:,} steps)": (sb3_policy(PPO.load(path, device="cpu")), obs_version_of(metas[label])) for label, path in checkpoints.items()}
    extras = []
    for extra in args.also:
        meta = json.loads(extra.with_suffix(".json").read_text())
        extras.append({"label": f"{meta.get('run', extra.parent.name)} {extra.stem}", "steps": meta["steps"], "seed": meta["seed"], "saved_at": meta["saved_at"], "file": extra.as_posix()})
        policies[f"PPO {meta.get('run', extra.parent.name)} {extra.stem} ({meta['steps']:,} steps)"] = (sb3_policy(PPO.load(extra, device="cpu")), obs_version_of(meta))
    policies["A* baseline"] = ("astar", 1)
    policies["Guardian-aware A*"] = ("careful", 1)
    onnx_meta_file = args.onnx.with_suffix(".json")
    onnx_meta = json.loads(onnx_meta_file.read_text()) if onnx_meta_file.exists() else None

    test, guarded = garden_scenarios("eval", args.gardens), garden_scenarios("guarded", args.gardens)
    classic, showcase = named_scenarios("classic"), named_scenarios("showcase")
    results: dict[str, dict] = {}
    for name, (policy, version) in policies.items():
        print(f"Playing {name}...", flush=True)
        episodes = {"test": play(policy, test, envs=64, workers=args.workers, obs_version=version), "guarded": play(policy, guarded, envs=64, workers=args.workers, obs_version=version), "classic": play(policy, classic, envs=9, workers=3, obs_version=version), "showcase": play(policy, showcase, envs=9, workers=3, obs_version=version)}
        results[name] = {k: {"summary": summarise(v), "by_difficulty": by(v, "difficulty"), "by_plan": by(v, "plan"), "episodes": v} for k, v in episodes.items()}
    if onnx_meta:
        name = f"Browser model (ONNX, {onnx_meta['label']})"
        print(f"Playing {name}...", flush=True)
        episodes = play(onnx_policy(args.onnx), test, envs=64, workers=args.workers, obs_version=int(onnx_meta["obsVersion"]))
        results[name] = {"test": {"summary": summarise(episodes), "by_difficulty": by(episodes, "difficulty"), "by_plan": by(episodes, "plan"), "episodes": episodes}}

    report = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "run": args.run,
        "checkpoints": {label: {k: metas[label][k] for k in ("steps", "seed", "saved_at", "selection_key")} | {"file": f"training/runs/{args.run}/{label}.zip"} for label in metas},
        "compared_checkpoints": extras,
        "browser_model": onnx_meta,
        "scenarios": {"test": f"{args.gardens} held-out gardens (eval seeds 1,000,000+) x easy/normal/hard, guardian plan rotating", "guarded": "the same gardens with the patrol on the escort routes", "classic": "the classic garden x 3 difficulties x 3 guardian plans", "showcase": "the showcase garden x 3 difficulties x 3 guardian plans"},
        "results": results,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.with_suffix(".json").write_text(json.dumps(report, indent=1), encoding="utf-8")

    names = list(policies)
    lines = [
        "# Lotus-Eaters rescue race: trained rival evaluation",
        "",
        f"Generated {report['generated']} by `training/evaluate_lotus.py --run {args.run}`. Every number is measured from the game's own rules: sailors aboard, whether all three came aboard, finish time and hits. The training reward is not used. Runs are deterministic: the policy takes its highest-scoring action and the garden has no randomness.",
        "",
        "## Held-out test gardens",
        "",
        f"{report['scenarios']['test']}. None of these gardens was used in training or to choose the best checkpoint.",
        "",
        table([(n, results[n]["test"]["summary"]) for n in results]),
        "",
        "### By difficulty",
        "",
    ]
    for d in ("easy", "normal", "hard"):
        lines += [f"**{ {'easy': 'Easy', 'normal': 'Medium', 'hard': 'Hard'}[d] }**", "", table([(n, results[n]["test"]["by_difficulty"][d]) for n in results]), ""]
    lines += ["## Held-out gardens with guarded escort routes", "", "The same test gardens, but the guardians patrol the tiles the escorts home funnel through, as in the showcase garden. This is the harder skill: noticing a watched route and going round.", "",
              table([(n, results[n]["guarded"]["summary"]) for n in names]), ""]
    lines += ["## The classic garden (your current maze)", "", "Each policy plays it under all three difficulties and all three guardian plans (9 runs). The garden was never used in training.", "",
              table([(n, results[n]["classic"]["summary"]) for n in names]), "", "Hard runs, one per guardian plan:", "",
              "| Policy | Plan | Sailors aboard | Finish | Hits |", "|---|---|---|---|---|"]
    for n in names:
        for e in results[n]["classic"]["episodes"]:
            if e["difficulty"] == "hard":
                lines.append(f"| {n} | {e['plan']} | {e['rescued']}/3 | {e['finishMs'] / 1000:.1f} s |" if e["won"] else f"| {n} | {e['plan']} | {e['rescued']}/3 | — |")
                lines[-1] += f" {e['hits']} |"
    lines += ["", "## The showcase garden (route choice)", "", "A short crossing through the middle that the guardians patrol, or a longer loop. 9 runs each.", "",
              table([(n, results[n]["showcase"]["summary"]) for n in names]), ""]
    lines += ["## Checkpoints", "", "| Label | Steps | Seed | Saved | File |", "|---|---|---|---|---|"]
    for label, c in report["checkpoints"].items():
        lines.append(f"| {args.run} {label} | {c['steps']:,} | {c['seed']} | {c['saved_at']} | `{c['file']}` |")
    for c in extras:
        lines.append(f"| {c['label']} | {c['steps']:,} | {c['seed']} | {c['saved_at']} | `{c['file']}` |")
    if onnx_meta:
        lines += ["", f"The game loads `public/models/lotus/lotus-policy.onnx`: **{onnx_meta['label']}**, from `{onnx_meta['checkpoint']}` at {onnx_meta['steps']:,} steps (sha256 `{onnx_meta['sha256'][:16]}…`)."]
    args.out.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
