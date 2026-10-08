# Arcade verification: October 8, 2026

## Automated checks

All 76 tests passed, including 17 new arcade tests and the existing mystery/voyage regressions. The TypeScript and Vite production build passed. Checks cover ordered completion, assistance and replay upgrades, retained clears after failed attempts, bounded save history, malformed saves, all legal Cyclops patterns, strategy effects, lane boundaries, collisions, full standard clears, timing-window edges, early/late/missed input, duplicate input, practice, provider failures, cancellation, invalid model output, foreign origins, and invalid requests.

`npm.cmd test` and `npm.cmd run build` reproduce the checks. No new runtime dependency was added. The earlier modes retain their code and separate existing saves.

## Live AI

Two six-input strategy experiments were recorded. All refined replies were legal. Minimum/average/maximum end-to-end times were 2.606/7.072/10.718 seconds. Both lane-biased examples selected the corresponding focus after the server began supplying explicit observations. Timing adaptation remained inconsistent; legality is not a measure of strategy usefulness. See [the technical spike](technical-spike.md) for outputs, actual provider failures, and scope limits.

In Brave, selected AI rival, submitted a real preparation request, observed elapsed loading and cancellation, cancelled it, retried, reviewed a real prepared Cyclops strategy, and started a round labeled AI RIVAL. Availability alone was not treated as proof of generation.

## Browser checks

Inspected the title, both introduction cards, skip, map locks, Cyclops briefing, practice, gameplay board, result, AI controls, pause, exit confirmation, assistance, next encounter, Sirens briefing and board, final bow briefing, reload/resume, and the reunion report. Desktop layout and a temporary 390 x 844 viewport were inspected; the viewport was restored afterward.

A Cyclops practice run reached its result without changing campaign completion. Verified movement via keyboard and click controls. The browser-assisted route reached the homecoming with all three encounters accurately marked Assisted. Reloading after two encounters retained progress and unlocked the bow trial. This route checks UI progression and recovery; it is not evidence of an unassisted full browser playthrough. The pure gameplay tests complete all standard challenges.

The browser checks found and corrected an assistance navigation bug: updating React save state and immediately checking the old state left the player on the previous shore. The new handler uses the updated state, and direct Sirens-to-bow progression was rechecked. Frame throttling also exposed stretched round timing; gaps above 500 ms now pause instead of consuming unseen warnings or slowing the clock. Pausing and leaving practice retained campaign progress.

Phone-sized game controls, cues, and pause fit within the inspected layout. Scenery, readable text, and clear action labels were visually checked. The temporary test address was localhost:5174, with separate browser storage from the main game at localhost:5173. Main game progress was not replaced with test completion. Preview images are saved in `.tmp/arcade-title.jpg` and `.tmp/arcade-ending.jpg`.

## Remaining evaluation

No actual newcomer interviews, research-backed persona synthesis, physical touch-device test, full keyboard-only completion, or peer critique was collected. Full unassisted browser play and difficulty tuning with newcomers remain useful checks. Audio playback quality was not independently verified; the existing audio regression tests pass and all required game cues are visual. The old Phase 2 slides/PDFs still describe the advice voyage and need a deliberate revision for this design.

Aeolus, Circe, optional medals, extra cases, and a timed whole-voyage mode remain expansion proposals. The delivered arcade scope is the complete three-encounter route.
