"""A Stable-Baselines3 vectorised environment backed by the game's own rules.

Each worker is a Node process running training/lotus_env_server.mjs, which
hosts a batch of Lotus-Eaters gardens using the TypeScript game code. Steps go
to every worker at once, so the workers simulate in parallel.
"""

from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path
from typing import Any, Sequence

import gymnasium as gym
import numpy as np
from stable_baselines3.common.vec_env.base_vec_env import VecEnv

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "training" / "lotus_env_server.mjs"
ACTION_NAMES = ["UP", "DOWN", "LEFT", "RIGHT", "WAIT"]


def _floats(text: str) -> np.ndarray:
    return np.frombuffer(base64.b64decode(text), dtype=np.float32)


class _Worker:
    def __init__(self, n: int, init: dict[str, Any], log: Path | None):
        self.n = n
        err = open(log, "ab") if log else subprocess.DEVNULL
        self.proc = subprocess.Popen(
            ["node", "--experimental-strip-types", "--no-warnings", str(SERVER)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=err, cwd=str(ROOT), bufsize=1 << 20,
        )
        self.info = self.call({"cmd": "init", "n": n, **init})

    def send(self, message: dict[str, Any]) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write((json.dumps(message) + "\n").encode())
        self.proc.stdin.flush()

    def receive(self) -> dict[str, Any]:
        assert self.proc.stdout is not None
        line = self.proc.stdout.readline()
        if not line:
            raise RuntimeError(f"The environment server stopped (exit code {self.proc.poll()}).")
        reply = json.loads(line)
        if "error" in reply:
            raise RuntimeError(reply["error"])
        return reply

    def call(self, message: dict[str, Any]) -> dict[str, Any]:
        self.send(message)
        return self.receive()

    def close(self) -> None:
        try:
            self.send({"cmd": "close"})
        except OSError:
            pass
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


class NodeVecEnv(VecEnv):
    """`num_envs` gardens across `workers` Node processes.

    mode="train": every episode draws a fresh training garden, difficulty and guardian plan.
    mode="eval": the given scenarios are played once each, in order; finished envs then idle.
    """

    def __init__(self, num_envs: int, workers: int = 1, mode: str = "train", seed: int = 1,
                 scenarios: Sequence[dict[str, Any]] | None = None, log: Path | None = None):
        workers = max(1, min(workers, num_envs))
        sizes = [num_envs // workers + (1 if w < num_envs % workers else 0) for w in range(workers)]
        self.workers: list[_Worker] = []
        scenarios = list(scenarios or [])
        for w, n in enumerate(sizes):
            share = scenarios[w::workers] if mode == "eval" else None
            init: dict[str, Any] = {"mode": mode, "seed": seed * 1000 + w}
            if share is not None:
                init["scenarios"] = share
            self.workers.append(_Worker(n, init, log))
        info = self.workers[0].info
        self.obs_size = int(info["obsSize"])
        self.obs_version = int(info["obsVersion"])
        obs_space = gym.spaces.Box(low=-2.0, high=2.0, shape=(self.obs_size,), dtype=np.float32)
        super().__init__(num_envs, obs_space, gym.spaces.Discrete(int(info["actions"])))
        self._actions: np.ndarray | None = None
        self._returns = np.zeros(num_envs, dtype=np.float64)
        self._lengths = np.zeros(num_envs, dtype=np.int64)
        self.idle = np.zeros(num_envs, dtype=bool)

    def _broadcast(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for worker, message in zip(self.workers, messages):
            worker.send(message)
        return [worker.receive() for worker in self.workers]

    def reset(self) -> np.ndarray:
        replies = self._broadcast([{"cmd": "reset"}] * len(self.workers))
        self._returns[:] = 0
        self._lengths[:] = 0
        self.idle = np.array([i for r in replies for i in r["idle"]], dtype=bool)
        return np.concatenate([_floats(r["obs"]).reshape(-1, self.obs_size) for r in replies])

    def step_async(self, actions: np.ndarray) -> None:
        self._actions = np.asarray(actions).reshape(-1)

    def step_wait(self):
        assert self._actions is not None
        messages, offset = [], 0
        for worker in self.workers:
            messages.append({"cmd": "step", "actions": [int(a) for a in self._actions[offset:offset + worker.n]]})
            offset += worker.n
        replies = self._broadcast(messages)
        obs = np.concatenate([_floats(r["obs"]).reshape(-1, self.obs_size) for r in replies])
        rewards = np.concatenate([_floats(r["rew"]) for r in replies]).astype(np.float32)
        dones = np.array([bool(d) for r in replies for d in r["done"]])
        self.idle = np.array([bool(i) for r in replies for i in r["idle"]])
        infos: list[dict[str, Any]] = [{} for _ in range(self.num_envs)]
        self._returns += rewards
        self._lengths += ~self.idle
        offset = 0
        for worker, reply in zip(self.workers, replies):
            for episode in reply["episodes"]:
                i = offset + episode["env"]
                infos[i] = {"episode": {"r": float(self._returns[i]), "l": int(self._lengths[i])}, "lotus": episode}
                self._returns[i] = 0
                self._lengths[i] = 0
            offset += worker.n
        return obs, rewards, dones, infos

    def astar_actions(self) -> np.ndarray:
        replies = self._broadcast([{"cmd": "astar"}] * len(self.workers))
        return np.array([a for r in replies for a in r["actions"]], dtype=np.int64)

    def close(self) -> None:
        for worker in self.workers:
            worker.close()

    # The remaining VecEnv methods: these environments have no Python-side attributes or wrappers.
    def get_attr(self, attr_name, indices=None):
        return [None for _ in self._get_indices(indices)]

    def set_attr(self, attr_name, value, indices=None):
        return None

    def env_method(self, method_name, *method_args, indices=None, **method_kwargs):
        return [None for _ in self._get_indices(indices)]

    def env_is_wrapped(self, wrapper_class, indices=None):
        return [False for _ in self._get_indices(indices)]

    def seed(self, seed=None):
        return [None for _ in range(self.num_envs)]
