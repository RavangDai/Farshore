"""A single Lotus-Eaters garden as a standard Gymnasium environment.

Training uses NodeVecEnv directly (many gardens per Node process). This wraps
one garden from the same server as a plain `gymnasium.Env`, for tools that
expect the Gymnasium API and for checking it with Gymnasium's env checker:

    env = LotusEnv(obs_version=3)
    obs, info = env.reset(seed=1)
    obs, reward, terminated, truncated, info = env.step(env.action_space.sample())

Actions: 0 up, 1 down, 2 left, 3 right, 4 wait, one per movement opportunity
(170 ms of game time). An episode ends when the board ends: all three sailors
aboard, caught three times, or the time limit (which the observation shows).
`info["lotus"]` on the last step holds the game's own result.
"""

from __future__ import annotations

from typing import Any

import gymnasium as gym
import numpy as np

from .node_vec_env import NodeVecEnv


class LotusEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, obs_version: int = 1, guarded_share: float = 0.0, hit_penalty: float = -3.0,
                 scenario: dict[str, Any] | None = None):
        """A training garden per episode, or always `scenario` (e.g. {"layout": "classic", "difficulty": "hard", "plan": "standard"})."""
        self._args = dict(obs_version=obs_version, guarded_share=guarded_share, hit_penalty=hit_penalty)
        self._scenario = scenario
        self._vec: NodeVecEnv | None = None
        self._open(seed=1)
        assert self._vec is not None
        self.observation_space = self._vec.observation_space
        self.action_space = self._vec.action_space

    def _open(self, seed: int) -> None:
        if self._vec is not None:
            self._vec.close()
        if self._scenario:
            self._vec = NodeVecEnv(1, workers=1, mode="eval", seed=seed, scenarios=[self._scenario] * 10_000, **self._args)
        else:
            self._vec = NodeVecEnv(1, workers=1, mode="train", seed=seed, **self._args)

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        if seed is not None:
            self._open(seed)
        assert self._vec is not None
        return self._vec.reset()[0], {}

    def step(self, action):
        assert self._vec is not None
        obs, rewards, dones, infos = self._vec.step(np.array([int(action)]))
        info = infos[0]
        # The vector server starts the next garden itself; Gymnasium callers call reset().
        return obs[0], float(rewards[0]), bool(dones[0]), False, info

    def close(self) -> None:
        if self._vec is not None:
            self._vec.close()
            self._vec = None
