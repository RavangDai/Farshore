# Ten-minute presentation notes

The twelve slide timings total 600 seconds. Allow 3-5 minutes of Q&A afterward.

## 1. Farshore

Timing: 30 seconds.

Farshore turns Odysseus' journey into five distinct arcade trials. Phase 2 focuses on how a player learns a trial, reviews an optional model strategy and recovers from failure. The new direction keeps the Odyssey setting and makes each shore a recognizable game. Source: user arcade design, current src/ArcadeApp.tsx. Original project artwork: public/art/title.png.

## 2. The five arcade trials

Timing: 50 seconds.

Explain the variety briefly. The player moves on a grid, solves a puzzle duel, echoes a melody, controls a shield while rowing, then aims through twelve axe rings. Rivals take turns or visibly react. The myth provides context, while the arcade rules are adaptations. Antinous' competitive shots are invented because in Homer he cannot string the bow. Source: src/lib/arcade.ts and src/lib/mythic.ts; Odyssey Books IX, X, XII, XXI.

## 3. Players and design needs

Timing: 45 seconds.

Maya is the gamer concerned about fairness, Daniel is the reader with limited technical comfort, and Rosa is skeptical of AI. Their ages and sketches come from my Phase 1 slide. The arcade needs are design hypotheses, not new interview findings. Each of the five full task flows names the persona it serves. Source: original/Farshore_Phase12nd.pptx, slide 4; design packet persona page.

## 4. Screen hierarchy

Timing: 45 seconds.

The first path is Title, Introduction, Map and Briefing. A briefing opens one of five games, then a result either retries or unlocks the next shore. The fifth passage reaches Homecoming. Settings, Pause/leave, Restart and Assistance are shared overlays. The full packet inventories all fifteen screens and their content. F1 handles starting and learning. F5 handles progress, assistance and finishing. Source: src/ArcadeApp.tsx, round component and design packet S01-S15.

## 5. Model data flow and privacy

Timing: 55 seconds.

The browser sends a shore ID, difficulty and at most two numeric attempts. The server derives the player observations and gives Llama a finite strategy catalog. It validates planId and focus and supplies an authored description. The player reviews it, then local game logic runs the match. Completed records and preferences stay in browser localStorage. Our measured endpoint is loopback Ollama. No third-party model provider receives these calls. A hosted endpoint would require a changed disclosure. Sources: server/arcade.ts, src/lib/arcade.ts, https://docs.ollama.com/api/openai-compatibility and https://docs.ollama.com/capabilities/structured-outputs, accessed October 8, 2026.

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

An unsupported or empty model result cannot start a game. Finite allowed IDs and authored descriptions keep arbitrary prose out of the interface. A legal but unwanted strategy can still be regenerated or rejected. Connection failure, timeout and a busy provider preserve progress and provide explicit local play. Unsupported input returns guidance before inference. We show no confidence percentage because this generative model does not supply a calibrated probability. Source: F4, EC1-EC5, W08-W10, server/arcade.ts; professor confidence note on page 2.

## 10. AI technical spike

Timing: 65 seconds.

A standalone script calls the production adapter with six realistic current-use-case inputs and captures raw provider outputs. Temperature is zero, structured schema is strict, output cap is one hundred tokens and streaming is off. Report each latency, then minimum, arithmetic mean and maximum. All outputs are legal. First-time Cyclops and one-loss Strait differ from advisory prompt preferences. That demonstrates why validity is not the same as choosing the best tactics. Siren missed-lane targeting executes locally. This is not an accuracy or enjoyment benchmark. Sources: evidence/phase2-arcade-spike-2026-10-08.json, quality-review.json, scripts/phase2-arcade-spike.mjs.

## 11. Failure evidence and design decisions

Timing: 65 seconds.

Two probes actually reach the model service: a nonexistent model returns 404 and malformed provider JSON returns 400 with unexpected EOF. Unsupported difficulty stops at the app boundary and returns 400. Exact error bodies are archived. No live rate-limit threshold or sustained load is measured. The adapter has a busy-service path for 429. Local inference produces no billed API fee in this run, but hardware and electricity cost are unmeasured. These results support visible preparation, elapsed time and Cancel, validated plans and retained progress with explicit fallback. Source: raw spike failure records and one-page summary.

## 12. Phase 2 design and next evaluation

Timing: 40 seconds.

The prototype implements the core arcade loop and the model controls discussed today. Discard, explicit privacy detail and a persistent storage warning remain design proposals. Actual interviews and class critique require real people and are not invented in this package. The model remains provisional until player evaluation shows whether its strategy choices help. The supporting packet has every screen, five persona-labeled tasks, twenty-eight wireframes and exact technical evidence. Finish at ten minutes and invite the separate three-to-five-minute Q&A. Sources: design packet and peer-critique record.