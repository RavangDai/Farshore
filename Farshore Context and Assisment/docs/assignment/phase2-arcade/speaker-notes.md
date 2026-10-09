# Ten-minute presentation notes

Present slides 1-12 in 600 seconds. Slides 13-51 are an untimed review appendix. Allow 3-5 minutes of Q&A afterward.

## 1. Farshore

Timing: 30 seconds.

Farshore turns Odysseus' journey into five distinct arcade trials. Phase 2 focuses on how a player learns a trial, reviews an optional model strategy and recovers from failure. The new direction keeps the Odyssey setting and makes each shore a recognizable game. Source: user arcade design, current src/ArcadeApp.tsx. Original project artwork: public/art/title.png.

## 2. The five arcade trials

Timing: 50 seconds.

Explain the variety briefly. The player moves on a grid, solves a puzzle duel, echoes a melody, controls a shield while rowing, then aims through twelve axe rings. Rivals take turns or visibly react. The myth provides context, while the arcade rules are adaptations. Antinous' competitive shots are an arcade invention. In Book XXI he postpones the contest before taking his turn. Source: src/lib/arcade.ts and src/lib/mythic.ts; Odyssey Books IX, X, XII, XXI. https://www.gutenberg.org/files/1727/1727-h/1727-h.htm#chap21, accessed October 8, 2026.

## 3. Players and design needs

Timing: 45 seconds.

Maya is the gamer concerned about fairness, Daniel is the reader with limited technical comfort, and Rosa is skeptical of AI. Their ages and sketches come from my Phase 1 slide. The arcade needs are design hypotheses, not new interview findings. Each of the five full task flows names the persona it serves. Source: original/Farshore_Phase12nd.pptx, slide 4; design packet persona page.

## 4. Screen hierarchy

Timing: 45 seconds.

The first path is Title, Introduction, Map and Briefing. A briefing opens one of five games, then a result either retries or unlocks the next shore. The fifth passage reaches Homecoming. Settings, Pause/leave, Restart and Assistance are shared overlays. The full packet inventories all fifteen screens and their content. F1 handles starting and learning. F5 handles progress, assistance and finishing. Source: src/ArcadeApp.tsx, round component and design packet S01-S15.

## 5. Model data flow and privacy

Timing: 55 seconds.

The browser sends a shore ID, difficulty and at most two numeric attempts. The server derives the player observations and gives Llama a finite strategy catalog. It validates planId and focus and supplies an authored description. The player reviews it, then local game logic runs the match. Completed records and preferences stay in browser localStorage. The server sends derived habits and win count, rather than raw attempt objects, to the model. The game fixes focus while Llama chooses one of two strategies. Our measured endpoint is loopback Ollama. No third-party model provider receives these calls. A hosted endpoint would require a changed disclosure. Sources: server/arcade.ts, src/lib/arcade.ts, https://docs.ollama.com/api/openai-compatibility and https://docs.ollama.com/capabilities/structured-outputs, accessed October 8, 2026.

## 6. F2: Strategy preparation and review

Timing: 60 seconds.

After selecting AI Rival Battle, Prepare sends the model request. Loading shows elapsed seconds and Cancel. Server validation must succeed before a strategy can be shown. The player can read its description and start, regenerate, or change input. Changing difficulty or mode discards the plan. A dedicated Discard action is a design proposal for clearer undo of preparation. There is no score undo after a completed round. Source: F2 and W05-W09/W27; src/ArcadeApp.tsx prepare, cancelAi and setDifficulty.

## 7. F3: Active play and recovery

Timing: 45 seconds.

Gameplay differs at each shore, but the interaction cycle is shared: enter, act, observe the rival and reach a clear or loss condition. Local simulation owns the physics and scoring, even in a model-planned match. Hidden tabs or lost focus pause and release held controls. Loss offers retry, practice, the map or assistance. Practice changes no campaign progress. The packet includes all five play interfaces and major turns. Sources: F3, W11-W20, src/components/arcade-round.tsx and src/lib/mythic.ts.

## 8. AI preparation states

Timing: 45 seconds.

These grayscale wireframes show information hierarchy rather than game art. Initial makes the optional model action visible. Loading provides real feedback and Cancel. A prepared result names the strategy and explains that the selected difficulty stays fixed. Start is disabled while the request is pending. The measured maximum above ten seconds supports elapsed-time feedback and cancellation. Source: W05-W07 and current prepare states; professor Phase 2 brief page 2.

## 9. F4: Uncertainty and error recovery

Timing: 55 seconds.

A rejected model result cannot become a model-planned duel. Explicit local play remains available. Finite allowed IDs and authored descriptions keep arbitrary prose out of the interface. A legal but unwanted strategy can still be regenerated or rejected. Connection failure, timeout and a busy provider preserve progress and provide explicit local play. Unsupported input returns guidance before inference. We show no confidence percentage because this generative model does not supply a calibrated probability. Source: F4, EC1-EC5, W08-W10, server/arcade.ts; professor confidence note on page 2.

## 10. AI technical spike

Timing: 65 seconds.

A standalone script calls the production adapter with six synthetic, realistic use-case inputs and captures real provider outputs. Temperature is zero, structured schema is strict, output cap is one hundred tokens and streaming is off. The six archived durations sum to 49.671 seconds. The exact arithmetic mean is 8.2785 seconds, rounded half up to 8.279. The raw JSON retains its original floating-point display of 8.278. All outputs are legal. First-time Cyclops and one-loss Strait differ from advisory preferences. S6 injects left-side lane durations that current new-game summaries do not collect. Its focus is constrained by the schema, rather than discovered by the model. Siren targeting uses current-round misses and begins fresh each round. This is feasibility evidence, not a tactical accuracy or enjoyment benchmark. Sources: evidence/phase2-arcade-spike-2026-10-08.json, quality-review.json, scripts/phase2-arcade-spike.mjs and src/lib/mythic.ts mythicSummary.

## 11. Failure evidence and design decisions

Timing: 65 seconds.

Two probes actually reach the model service: a nonexistent model returns 404 and malformed provider JSON returns 400 with unexpected EOF. Unsupported difficulty stops at the app boundary and returns 400. Exact error bodies are archived. No live rate-limit threshold or sustained load is measured. The adapter has a busy-service path for 429. Local inference produces no billed API fee in this run, but hardware and electricity cost are unmeasured. These results support visible preparation, elapsed time and Cancel, validated plans and retained progress with explicit fallback. Source: raw spike failure records and one-page summary.

## 12. Phase 2 design and next evaluation

Timing: 40 seconds.

The prototype implements the core arcade loop and the model controls discussed today. Discard and explicit provider privacy detail remain proposals. Storage failure already triggers a persistent warning. Actual interviews and class critique require real people and are not invented in this package. The model remains provisional until player evaluation shows whether its strategy choices help. The supporting packet has every screen, five persona-labeled tasks, twenty-eight wireframes and exact technical evidence. Finish at ten minutes and invite the separate three-to-five-minute Q&A. Sources: design packet and peer-critique record.

## 13. Content strategy

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Screen inventory and content strategy. Source: src/ArcadeApp.tsx, src/components/arcade-round.tsx and editable/content.json screens. Screen IDs describe design surfaces, including overlays and the five play views.

## 14. Content strategy

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Screen inventory and content strategy. Source: src/ArcadeApp.tsx, src/components/arcade-round.tsx and editable/content.json screens. Screen IDs describe design surfaces, including overlays and the five play views.

## 15. Content strategy

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Screen inventory and content strategy. Source: src/ArcadeApp.tsx, src/components/arcade-round.tsx and editable/content.json screens. Screen IDs describe design surfaces, including overlays and the five play views.

## 16. A1 model contract

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Sources: server/arcade.ts request schema, observations, expectedFocus, JSON schema, provider body and timeout; src/lib/mythic.ts mythicSummary and compose; src/ArcadeApp.tsx prepare. No names, voice or free text enter this feature. Model output cannot change scoring or warning durations. The model is retained provisionally for bounded selection, pending player evaluation. Documentation: https://docs.ollama.com/api/openai-compatibility and https://docs.ollama.com/capabilities/structured-outputs, accessed October 8, 2026.

## 17. F1: Start, resume and practice

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

The first usable trial needs no model configuration.
Locked stops explain that earlier trials must be passed. Accessibility cues remain visible without sound. Sources: editable/content.json F1; src/ArcadeApp.tsx; server/arcade.ts; src/lib/arcade.ts. The accompanying wireframes show each linked screen and state. F2 and F3 appear in timed slides 6 and 7.

## 18. F4: Failed-plan recovery

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

The live spike triggers real missing-model and malformed-request failures. 429 behavior is designed and unit-tested, not live-induced.
Unsupported difficulty and oversized/invalid requests stop before model contact. Do not silently replace a failed model response. Sources: editable/content.json F4; src/ArcadeApp.tsx; server/arcade.ts; src/lib/arcade.ts. The accompanying wireframes show each linked screen and state. F2 and F3 appear in timed slides 6 and 7.

## 19. F5: Progress and homecoming

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Assistance improves access to the narrative without claiming a skill-based clear.
Practice and abandoned rounds award no campaign progress. Replays preserve earlier success even when the player loses. Sources: editable/content.json F5; src/ArcadeApp.tsx; server/arcade.ts; src/lib/arcade.ts. The accompanying wireframes show each linked screen and state. F2 and F3 appear in timed slides 6 and 7.

## 20. Edge cases and recovery

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Sources: editable/content.json edges; server/arcade.ts; src/ArcadeApp.tsx; src/components/arcade-round.tsx; src/lib/arcade.ts; raw spike failure records. Live spike probes measure missing model, malformed provider request and unsupported difficulty. Timeout and provider 429 paths are implemented but were not induced live in this spike.

## 21. Edge cases and recovery

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Sources: editable/content.json edges; server/arcade.ts; src/ArcadeApp.tsx; src/components/arcade-round.tsx; src/lib/arcade.ts; raw spike failure records. Live spike probes measure missing model, malformed provider request and unsupported difficulty. Timeout and provider 429 paths are implemented but were not induced live in this spike.

## 22. Edge cases and recovery

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Sources: editable/content.json edges; server/arcade.ts; src/ArcadeApp.tsx; src/components/arcade-round.tsx; src/lib/arcade.ts; raw spike failure records. Live spike probes measure missing model, malformed provider request and unsupported difficulty. Timeout and provider 429 paths are implemented but were not induced live in this spike.

## 23. W01: Title - new player

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W01. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 24. W02: Title - returning player

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W02. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 25. W03: Introduction

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W03. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 26. W04: Five-stop voyage map

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W04. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 27. W05: Model planning - initial

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W05. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 28. W06: Model planning - loading

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W06. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 29. W07: Model planning - ready

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W07. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 30. W08: Model planning - unsupported

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W08. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 31. W09: Model planning - service failure

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W09. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 32. W10: Unsupported input

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W10. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 33. W11: Polyphemus grid

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W11. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 34. W12: Circe puzzle duel

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W12. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 35. W13: Sirens melody

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W13. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 36. W14: Sirens counter melody

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W14. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 37. W15: Twin-paddle escape

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W15. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 38. W16: Archery - player turn

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W16. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 39. W17: Archery - rival turn

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W17. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 40. W18: Round cleared

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W18. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 41. W19: Round lost

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W19. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 42. W20: Practice result

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W20. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 43. W21: Homecoming report

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W21. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 44. W22: Voyage settings

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W22. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 45. W23: Paused round

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W23. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 46. W24: Leave round confirmation

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W24. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 47. W25: New voyage confirmation

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W25. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 48. W26: Assisted passage

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W26. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 49. W27: Discard a prepared plan

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W27. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 50. W28: Saving unavailable

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Source: editable/content.json W28. This is a grayscale design wireframe. Placeholder values illustrate a state and are not measured results. Implemented annotations refer to src/ArcadeApp.tsx, src/components/arcade-round.tsx, src/components/mythic-games.tsx, src/lib/mythic.ts and server/arcade.ts. Proposed controls are labeled on the slide.

## 51. Exact failure responses

Timing: 0 seconds. Review appendix, outside the ten-minute talk.

Exact raw bodies copied without rewriting from evidence/phase2-arcade-spike-2026-10-08.json failures. E1 posts a nonexistent model. E2 posts a single opening brace as malformed JSON. The spike bypasses the app for these two probes, so their recorded statuses are provider statuses. The current app maps a provider non-OK response to HTTP 502 with a generic recovery message. E3 calls the production app adapter with difficulty impossible and returns HTTP 400. The one-page technical-spike-summary.pdf contains rate-limit, cost and output-quality conclusions.