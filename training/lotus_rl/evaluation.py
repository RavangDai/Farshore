"""Playing a policy on fixed scenarios and summarising the results.

Scenarios name a garden ("classic", "showcase", "eval:N" for the held-out test
gardens, "val:N" for the validation gardens used to pick checkpoints), a
difficulty and a guardian plan. Results are measured from the game itself:
sailors rescued, whether all three came aboard, the finish time and the hits
taken. The training reward plays no part in them.
"""

from __future__ import annotations

import statistics
from typing import Any, Callable, Sequence

import numpy as np

from .node_vec_env import NodeVecEnv

DIFFICULTIES = ("easy", "normal", "hard")
PLANS = ("standard", "pincer", "undertow")


def garden_scenarios(kind: str, count: int, difficulties: Sequence[str] = DIFFICULTIES) -> list[dict[str, Any]]:
    """`count` gardens of a kind, each at every difficulty, with the guardian plan rotating."""
    return [{"layout": f"{kind}:{n}", "difficulty": d, "plan": PLANS[(n + k) % len(PLANS)]}
            for n in range(count) for k, d in enumerate(difficulties)]


def named_scenarios(layout: str, difficulties: Sequence[str] = DIFFICULTIES) -> list[dict[str, Any]]:
    """One named garden at every difficulty and under every guardian plan."""
    return [{"layout": layout, "difficulty": d, "plan": p} for d in difficulties for p in PLANS]


Policy = Callable[[np.ndarray], np.ndarray]


def play(policy: Policy | str, scenarios: Sequence[dict[str, Any]], envs: int = 32, workers: int = 4) -> list[dict[str, Any]]:
    """Plays every scenario once. `policy` maps a batch of observations to actions, or is "astar"."""
    env = NodeVecEnv(min(envs, len(scenarios)), workers=workers, mode="eval", scenarios=scenarios)
    episodes: list[dict[str, Any]] = []
    try:
        obs = env.reset()
        while len(episodes) < len(scenarios):
            actions = env.astar_actions() if policy == "astar" else policy(obs)
            obs, _, _, infos = env.step(actions)
            episodes.extend(info["lotus"] for info in infos if "lotus" in info)
    finally:
        env.close()
    return sorted(episodes, key=lambda e: e["index"])


def summarise(episodes: Sequence[dict[str, Any]]) -> dict[str, Any]:
    if not episodes:
        return {"runs": 0}
    finished = [e["finishMs"] / 1000 for e in episodes if e["won"]]
    out = {
        "runs": len(episodes),
        "full_rescue_rate": sum(e["won"] for e in episodes) / len(episodes),
        "avg_rescued": sum(e["rescued"] for e in episodes) / len(episodes),
        "median_finish_s": statistics.median(finished) if finished else None,
        "completed_runs": len(finished),
        "avg_hits": sum(e["hits"] for e in episodes) / len(episodes),
    }
    return out


def by(episodes: Sequence[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for e in episodes:
        groups.setdefault(e[field], []).append(e)
    return {k: summarise(v) for k, v in sorted(groups.items())}


def selection_key(summary: dict[str, Any]) -> tuple:
    """Higher is better: more full rescues, then more sailors on average, then faster."""
    median = summary.get("median_finish_s")
    return (round(summary["full_rescue_rate"], 4), round(summary["avg_rescued"], 4), -(median if median is not None else 1e9))


def sb3_policy(model) -> Policy:
    def act(obs: np.ndarray) -> np.ndarray:
        actions, _ = model.predict(obs, deterministic=True)
        return actions
    return act
