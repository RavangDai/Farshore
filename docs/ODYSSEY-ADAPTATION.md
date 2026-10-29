# FARSHORE: eight-trial adaptation

The existing React/TypeScript application, Next.js hosting, guest and MongoDB account saves, audio service, optional model preparation, and round lifecycle are preserved. This is an extension of Farshore rather than a new scaffold.

## Existing systems

| Treatment | Systems |
| --- | --- |
| Preserve | Circe's falling-potion duel, Sirens' melody memory, Scylla's shield/rowing game, Ithaca's trajectory-based archery, account security and synchronization, local audio, original mystery and advice modes. |
| Adapt | Title, navigation, map, briefings, HUD, pause/results, help, credits, difficulty behavior, and the save schema. |
| Extend | Lotus maze rescue, Cyclops runner, Aeolus wind sailing, Calypso raft hopping, per-difficulty medals/scores/times, accessibility settings, and a local AI demonstration. |
| Retain separately | The original Cyclops grid escape is available as practice from the Cyclops briefing. Earlier modes remain in Settings. |

## Runtime

`src/lib/arcade/arcade-runtime.ts` dispatches to the existing `mythic.ts` engines or the new pure functions in `odyssey-games.ts`. `ArcadeRound` still owns the animation-frame lifecycle, countdown, input, pause, focus, background-tab handling, and final callback. Game state owns collision, timers, scores, and terminal outcomes. Large frame deltas remain bounded to preserve reaction time.

The eight stops are Lotus, Cyclops, Aeolus, Circe, Sirens, Scylla & Charybdis, Calypso, and Ithaca. Each has Easy, Medium (`normal` in existing storage), and Hard. Ordinary victory unlocks the next shore. Failed rounds keep attempt history without unlocking islands. Practice and the AI rescue demonstration do not award campaign progress. The retained, explicitly confirmed Athena assistance route is marked Assisted and earns no medal.

## Saves

Version 3 uses the existing storage keys. Versions 1 and 2 migrate to the eight-stop route, retaining clears and attempts while introducing new islands as pending. Previously cleared islands remain replayable. Unfinished new islands must be completed to finish the expanded voyage. Best scores, fastest victory times, and best medals are retained separately for each difficulty. Replays cannot erase better records.

Gold requires zero damage and misses; silver permits up to two; bronze recognizes a victory. Healing restores current health without erasing lifetime damage for medals. New Game confirms before resetting an existing voyage.

## AI and presentation

Lotus uses patrol, A* pursuit, and predicted junction interception. Cyclops locks lane attacks at least three seconds before impact. Aeolus uses bounded wind forces and readable wind gates. Calypso checks reachable timber alternatives before marking a storm strike. The existing potion, song, strait, and archery policies remain local gameplay AI. Optional model preparation chooses from a constrained strategy catalog; no model is required to play.

The How to Play screen includes an A* rescue demonstration that runs the real practice engine. A development-only AI observatory exposes decisions for inspection. Production hides developer readings.

The interface reuses the original landscape and portrait art, local pixel font, and synthesized soundtrack. Navy/gold/cyan tokens, classical titles, connected island nodes, keyboard focus, touch controls, volume controls, high contrast, and reduced motion apply across the new shell. Canvas scenes preserve their aspect ratios. Pause covers the viewport so its controls stay visible on short screens.

## Running and verification

Run `npm.cmd run dev`, `npm.cmd test`, and `npm.cmd run build`. Preview a production build with `npm.cmd run preview -- --port 4175`. Optional model calls are covered by mocked provider checks; live provider quality and playthrough timing still benefit from human playtesting.

New engine checks cover deterministic starts, bounded clocks, reachable maze targets, rescue victory/defeat, runner dodge/jump/slide and healing, all-difficulty wind and raft victories, the AI demonstration, migration, medals, and ordered progression. Existing gameplay, earlier modes, account APIs, authentication, encryption, and database integration retain their regression coverage.
