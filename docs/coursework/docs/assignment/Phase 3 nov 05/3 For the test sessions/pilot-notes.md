# Pilot walkthrough notes (not participant data)

On 2026-11-04 the moderator's assistant ran the task path in an automated headless Edge browser (software rendering, so slower than a real laptop), with local Ollama `qwen3:4b-instruct`. This checks that each task can be completed and that the script matches the real interface. **It is not a usability result and is not counted in the data.**

## Task feasibility

| Task | Can it be completed? | Script consequences |
| --- | --- | --- |
| T1 | Yes. New game, then "The journey ahead", then "Land of the Lotus-Eaters" (or "Open voyage map", then card 1, then Enter trial) reaches the briefing. | Both paths count as success. |
| T2 | Yes. The rival panel shows the strategy name, "Strategy chosen by qwen3:4b-instruct", a description and a taunt. Preparation took about 40 s in the headless run. | The 3-minute limit is enough. Warm the model before each session so the first plan is not a cold start. |
| T3 | Yes, after unlocking (the moderator uses Settings > Unlock all islands). AI Insights is on by default, and only in the cave. Its first committed decision takes a few seconds of play. | Keep T3 on Cyclops' Cave. The participant needs to survive a few seconds before the panel shows a reason. |
| T4 | Yes. With the mock AI service in mode `error-once`, the Aeolus briefing shows "The rival is not ready", and "Prepare the rival again" then succeeds. Checked in the browser on 2026-11-04. | The failure is triggered with the mock service, as the brief requires, instead of quitting Ollama. |

The protocol follows the instructor's template and was cut from six tasks to four (about 20 minutes per session). The dropped tasks were playing a full Lotus round on Easy and finding the voice toggle in Settings. Both completed in the pilot. Observations 4 and 5 below come from them.

## Things to watch for during sessions (pilot observations, to be confirmed or not by participants)

1. **The start button is below the fold.** At 1440 × 900 the briefing's "Face [rival]" button sits below the visible area, so players must scroll past the objective and the rival panel to start (T1, T2).
2. **The Lotus strategy has no gameplay effect.** In the Lotus-Eaters maze, the guardians' behavior depends only on difficulty. The strategy the model chooses (Garden patrol / Maze pursuit / Junction interception) is shown, but the maze code never reads it. This matters for T2 and AT1 to AT3 (AI honesty). Recommendation: either make the plan change guardian behavior or say so in the panel. **Decision (2026-11-04): tested as-is.** Watch whether participants notice in T2 and T3. It will be fixed after the sessions and reported as a change.
3. **The plan name repeats and the panel disagrees with the HUD.** The rival panel title "Maze pursuit" is repeated as the first words of its description. In play, the HUD says "Maze pursuit" under the rival but "Patrol · guardians follow the garden paths" as the live line. Players may read these as conflicting (T2).
4. **The Lotus side panel is clipped.** At 1440 × 900 the "Bonus challenge" card in the encounter side panel is cut off at the bottom.
5. **Medium is the default difficulty.** New players may not notice the selector (not a task in the 20-minute protocol).
6. **On a phone, AI Insights sit below the play area.** In Cyclops' Cave at 390 × 844 the Insights panel is under the game and touch controls, so it cannot be read while dodging. Sessions run on a laptop, so this is a design note rather than a test task.
7. **On a phone, the briefing is long.** The rival's strategy and the start button are several screens below the objective.
8. **The voyage chart labels overlap.** Some island labels overlap the "wine-dark sea" caption at 1440 × 900.
9. **Model availability can flicker under load.** Once during the automated run, the status check briefly reported "AI rival offline" while the laptop was busy, then recovered by itself. If it happens in a session, note it. It may affect T2 waiting times.
10. **"Cancel preparation" starts again straight away.** Cancelling returns the panel to its initial state, and the briefing then starts a new preparation by itself, so cancelling only restarts the wait. Watch whether anyone tries it in T2.
11. **The start button says "The model is choosing a strategy" when nothing is being prepared.** In the error and low-confidence states the disabled start button keeps that label, which can mislead (T4).
