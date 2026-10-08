# Five-trial verification, October 8, 2026

## Automated checks

`npm.cmd test` passed all 95 tests. `npm.cmd run build` passed TypeScript and Vite production bundling. The build reports a non-fatal bundle-size advisory; the retained mystery and original voyage are bundled with the new arcade edition. No runtime dependencies were added.

The new gameplay checks cover:

- Five distinct engines, seeded determinism, immutable actions, bounded clock gaps, and completed-round immutability.
- Grid exits across all difficulties and three strategies with multiple seeds; rock boundaries, sheep concealment, lives, one evade step, and warning locks.
- Moly purification, curse transmission, gravity-created chains, Circe's autonomous board, adaptive placement with Circe's own next-piece queue, and both overflow outcomes.
- Siren Listen/Reply separation, correct melodies across all strategies/difficulties, missed-lane adaptation, temptation loss, and summary lane counts.
- Strait rowing, shield reflection, coordinated pull, unattended loss, and successful responses to every difficulty/strategy.
- Archery wind/elevation/tension effects, legal trajectory search, Normal winds requiring adjustments, independent opponent turns, duplicate-release rejection, block lifetime, and a winnable five-shot adaptive contest.
- Migration of old three-trial saves with retained clears, insertion of pending shores, and ordered progression.
- Separate model strategy catalogs for Circe and the strait, Siren miss-history disclosure, invalid output rejection, cancellation, provider failures, and existing campaign/mystery/voyage regressions.

Historical lane/timing tests exercise `legacy-arcade.ts`; those engines are not the current playable game. The new mechanics are checked in `mythic.test.mjs`.

## Model integration

The installed Ollama service was initially stopped. A real preparation request displayed an unavailable-service error without starting a match or changing progress. Starting the installed service restored availability; no environment settings or credentials were changed.

Two real requests using the configured `llama3.2:3b` returned valid bounded plans:

| Encounter | HTTP | Strategy | End-to-end seconds |
| --- | ---: | --- | ---: |
| Circe | 200 | Chain Alchemist (`chain`, `balanced`) | 2.347 |
| Scylla & Charybdis | 200 | Shield Pincer (`pincer`, `balanced`) | 8.838 |

Exact responses are retained in [the evidence file](evidence/mythic-model-check-2026-10-08.json). A separate real Circe preparation was completed in Brave, reviewed as **Model strategy ready**, and launched as **MODEL-PLANNED AI BATTLE**. The game showed both boards, Moly purification, curse transmission, Circe's own drop/score, and retained pause/leave controls. These are connection and integration examples, not a model benchmark or evidence that adaptive play improves enjoyment.

## Browser checks

Used a separate localhost origin to avoid modifying the user's existing saved voyage. Inspected the title, introduction, five-stop map, each briefing, Solo/AI choice, model failure/ready states, countdown, scoreboards, rival dialogue, pause/leave confirmation, assistance, and encounter rendering in Brave.

Completed a real adaptive grid escape in the browser. Verified sheep concealment, a marked 2×2 smash, lives decreasing on hits, the clear result, and advancement to Circe. In Circe's model-planned match, dropping the first Moly triplet cleared swine, sent a curse to the other board, and changed the score; Circe subsequently made her own move. Pausing stopped both boards; leaving preserved the existing clear. Assistance was recorded and advanced the test voyage.

Inspected the Sirens' four numbered/color pads, visible sequence, separate reply phase with hidden answers, deadline, and increased Temptation after an unanswered melody. Inspected the strait's six heads, telegraphed strikes, vortex, hull loss, shield position change, rowing control, and rival feedback. In the twelve-ring gallery, changing aim from 0 to 12 degrees changed the predicted score from 12 to 4 rings. Restoring aim and releasing scored 12, disabled the controls for the opponent turn, and Antinous then scored his own 12-ring shot before a new wind and player turn appeared.

Applied a temporary 390×844 browser viewport for responsive checks. The page's content width matched its scroll width (375 CSS px excluding the scrollbar). Inspected both potion boards and touch controls, Siren lanes, and modal layout, then restored the normal viewport. Keyboard/sustained shield control and full-round wins across the new engines have deterministic test coverage; a complete human reflex-play evaluation has not been conducted.

## Practical limits

Human difficulty balance, touch accuracy on a physical phone, and whether each adaptive strategy is enjoyable remain to be evaluated. The time-capped puzzle duel and tied-score rules are documented game choices. Existing Phase 2 artifacts still describe the advice voyage. No new interview results, persona evidence, instructor approval, or grading outcome is claimed.
