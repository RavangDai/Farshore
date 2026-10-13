# Ten-minute presentation notes

Present all 8 slides in 600 seconds. Full flows, wireframes and exact failure bodies are in the supporting design packet. Allow 3-5 minutes of Q&A afterward.

## 1. Farshore

Timing: 35 seconds.

Farshore turns Odysseus' journey into five distinct arcade trials. Phase 2 focuses on how a player learns a trial, reviews an optional model strategy and recovers from failure. The new direction keeps the Odyssey setting and makes each shore a recognizable game. Source: user arcade design, current src/ArcadeApp.tsx. Original project artwork: public/art/title.png.

## 2. The five arcade trials

Timing: 65 seconds.

Explain the variety briefly. The player moves on a grid, solves a puzzle duel, echoes a melody, controls a shield while rowing, then aims through twelve axe rings. Rivals take turns or visibly react. The myth provides context, while the arcade rules are adaptations. Antinous' competitive shots are an arcade invention. In Book XXI he postpones the contest before taking his turn. Source: src/lib/arcade.ts and src/lib/mythic.ts; Odyssey Books IX, X, XII, XXI. https://www.gutenberg.org/files/1727/1727-h/1727-h.htm#chap21, accessed October 8, 2026.

## 3. Screen hierarchy

Timing: 75 seconds.

Maya is the gamer concerned about fairness, Daniel is the reader with limited technical comfort, and Rosa is skeptical of AI. Their ages and sketches come from my Phase 1 slide. The arcade needs are design hypotheses, not new interview findings. Each of the five full task flows names the persona it serves. Source: original/Farshore_Phase12nd.pptx, slide 4; design packet persona page.

The first path is Title, Introduction, Map and Briefing. A briefing opens one of five games, then a result either retries or unlocks the next shore. The fifth passage reaches Homecoming. Settings, Pause/leave, Restart and Assistance are shared overlays. The full packet inventories all fifteen screens and their content. F1 handles starting and learning. F5 handles progress, assistance and finishing. Source: src/ArcadeApp.tsx, round component and design packet S01-S15.

## 4. Model data flow and privacy

Timing: 80 seconds.

The browser sends a shore ID, difficulty and at most two numeric attempts. The server derives the player observations and gives Llama a finite strategy catalog. It validates planId and focus and supplies an authored description. The player reviews it, then local game logic runs the match. Completed records and preferences stay in browser localStorage. The server sends derived habits and win count, rather than raw attempt objects, to the model. The game fixes focus while Llama chooses one of two strategies. Our measured endpoint is loopback Ollama. No third-party model provider receives these calls. A hosted endpoint would require a changed disclosure. Sources: server/arcade.ts, src/lib/arcade.ts, https://docs.ollama.com/api/openai-compatibility and https://docs.ollama.com/capabilities/structured-outputs, accessed October 8, 2026.

## 5. Player task flows

Timing: 85 seconds.

Maya needs visible warnings and fixed scoring. Daniel needs a clear objective and short practice. Rosa needs control over the model result. These are design hypotheses based on the supplied Phase 1 sketches. F1: Begin or Continue, read or skip the introduction, choose the first available shore, read the briefing, then practice or play. Restart needs confirmation. F2: select AI Rival Battle, prepare, watch elapsed time with Cancel, validate the allowed plan and focus, review the strategy, then explicitly start. Regenerate replaces the candidate. Changing difficulty or mode discards it. A dedicated Discard is proposed. F3: act with the encounter controls, observe the rival, then reach a result. Pause or lost focus stops clocks and releases controls. A loss offers retry or practice. F4: read the error, retain progress, check settings, then retry or explicitly choose Solo/local AI. No match starts from an invalid response. F5: clear or confirm assistance, continue to the next shore, and reach Homecoming after all five passages. Assistance is labeled and a later clear can replace it. Sources: design packet F1-F5; src/ArcadeApp.tsx; src/components/arcade-round.tsx; server/arcade.ts.

## 6. AI preparation states

Timing: 80 seconds.

These grayscale wireframes summarize W05-W09. Initial makes optional model preparation visible. Loading shows elapsed time and Cancel and consumes no gameplay time. Success names the strategy and keeps difficulty fixed. The player starts, regenerates or changes settings. An unsupported or empty response cannot start a model-planned match. Error preserves the voyage and offers explicit retry or local play. Invalid input stops before inference. No confidence percentage is shown because the model supplies no calibrated probability. Timeout and a busy-provider path are implemented, but they were not induced live in this experiment. Full wireframes cover all fifteen screens, gameplay turns, pause, practice, assistance and save warnings. Sources: design packet W01-W28; src/ArcadeApp.tsx; server/arcade.ts; Phase 2 brief page 2.

## 7. AI technical spike

Timing: 95 seconds.

A standalone script calls the production adapter with six synthetic, realistic use-case inputs and captures real provider outputs. Temperature is zero, structured schema is strict, output cap is one hundred tokens and streaming is off. The six archived durations sum to 49.671 seconds. The exact arithmetic mean is 8.2785 seconds, rounded half up to 8.279. The raw JSON retains its original floating-point display of 8.278. All outputs are legal. First-time Cyclops and one-loss Strait differ from advisory preferences. S6 injects left-side lane durations that current new-game summaries do not collect. Its focus is constrained by the schema, rather than discovered by the model. Siren targeting uses current-round misses and begins fresh each round. This is feasibility evidence, not a tactical accuracy or enjoyment benchmark. Sources: evidence/phase2-arcade-spike-2026-10-08.json, quality-review.json, scripts/phase2-arcade-spike.mjs and src/lib/mythic.ts mythicSummary.

## 8. Recovery and next steps

Timing: 85 seconds.

Two probes actually reach the model service: a nonexistent model returns 404 and malformed provider JSON returns 400 with unexpected EOF. Unsupported difficulty stops at the app boundary and returns 400. Exact error bodies are archived. No live rate-limit threshold or sustained load is measured. The adapter has a busy-service path for 429. Local inference produces no billed API fee in this run, but hardware and electricity cost are unmeasured. These results support visible preparation, elapsed time and Cancel, validated plans and retained progress with explicit fallback. Source: raw spike failure records and one-page summary.

The prototype implements the core arcade loop and the model controls discussed today. Discard and explicit provider privacy detail remain proposals. Storage failure already triggers a persistent warning. Actual interviews and class critique require real people and are not invented in this package. The model remains provisional until player evaluation shows whether its strategy choices help. The supporting packet has every screen, five persona-labeled tasks, twenty-eight wireframes and exact technical evidence. Finish at ten minutes and invite the separate three-to-five-minute Q&A. Sources: design packet and peer-critique record.