# The Odyssey: Arcade Trials

Farshore is a head-to-head retro arcade voyage from Troy to Ithaca. Each of five shores teaches a different game. Mythic opponents act on the board, sing the next melody, launch coordinated attacks, or take their own scored shots. This replaces the earlier three-lane dodge and shared timing-slider design.

Run `npm.cmd run dev`, open the printed localhost URL, and choose **Begin voyage**. **Arcade Solo** uses learnable opponent policies. **AI Rival Battle** uses adaptive heuristic opponents immediately. Both offer Easy, Normal, and Hard, practice, retries, pause, and an assisted passage. Normal is the default. Optional sound includes four distinct Siren notes; numbered/color lanes remain usable when muted.

| Shore | Recognizable game | Player action | Visible rival action | Clear |
| --- | --- | --- | --- | --- |
| Cyclops' Coast | 8×8 grid stealth | Sneak, dash, hide beneath sheep, evade once per warning | Blind Polyphemus marks and smashes a 2×2 area from noise clues | Reach either gold exit before three hits or the turn limit |
| Aeaea | Falling-potion match-3 duel | Choose a column, rotate three potions, drop | Circe drops her own pieces, clears chains, and sends curse blocks | Her board fills first; a two-minute cap compares brew scores |
| Sirens' Passage | Four-lane melody memory | Watch/listen, then echo with A/S/D/F or pads | Sirens compose and play a melody, then target missed lanes | Echo five melodies before Temptation reaches 100% |
| Scylla & Charybdis | Paddle deflector | Move shield with Up/Down; hold Space to row | Six heads telegraph strikes while Charybdis pulses her pull | Keep the ship afloat for 30/40/50 seconds |
| Ithaca's Hall | Turn-based target archery | Adjust wind aim, elevation, tension, then release | Antinous visibly takes his own wind-adjusted shot | Score more rings across five shots |

Circe's tiles are Wine, Moly, Swine, Rune, and Curse. Horizontal and vertical matches clear three or more. Gravity can create chains. Matching Moly removes swine/curse tiles and sends curses; chains send additional curses. Curse tiles do not form ordinary matches. Reaching the board ceiling loses. At the visible time cap, a tie favors Circe. The next triplet and both falling pieces are visible.

In the cave, sheep conceal a quiet move. Dashes travel up to two cells and generate louder noise. Polyphemus never reads the player's current coordinates to choose a smash: he uses audible clues or a blind search. The entire warning locks before the player gets one evade step. Easy/Normal/Hard provide 32/26/22 turns and 1500/1150/900 ms warning time.

The Sirens have separate Listen and Reply phases. Pressing during Listen does not count. The reply is a memory challenge with a generous deadline, rather than a single-bar timing test. Adaptive Trick-note Echo adds visible rests and changes tempo between melodies; rests are omitted from the reply. Mismatched or absent notes increase Temptation and the relevant lane's miss count. A correct melody reduces Temptation.

The strait has independent controls for shield and rowing, pointer dragging on the sea, and a hold-to-row button for touch. Reflected attacks visibly return toward Scylla. Five hull strikes or reaching the vortex loses. Arrow/W/S keys support continuous shield movement. Releasing Space, pointer capture, or focus releases the oars; backgrounding pauses the round.

The archery gallery renders twelve rings in perspective, an end-on inspection target, and a live trajectory preview. Wind, elevation, and tension affect the same path formula for both contestants. After the player's shot, Antinous shoots, the results remain visible, and new wind is set for the next turn. Adaptive Wind Reader calculates aim; Block-shot Gambit can sacrifice points to partially obstruct one ring for the next shot only. Antinous risks a showy third shot so optimal play can beat him. Tied scores favor the defending suitor.

## What the AI contributes

| Opponent | Solo policy | Adaptive policies |
| --- | --- | --- |
| Polyphemus | Search around the last noise | Noise Heatmap follows decaying clues; Exit Ambush projects the next position from two noises |
| Circe | Prioritize immediate matches | Chain Alchemist previews the next piece; Banked Curses waits for a crowded player board or a large bank |
| Sirens | Repeating four-lane melody | Weak-lane Refrain repeats the least reliable lane; Trick-note Echo adds rests and tempo changes |
| Scylla & Charybdis | Repeating heads and regular pull | Shield Pincer aims around the shield; Synchronized Undertow coordinates stronger pull with attacks |
| Antinous | Imprecise scored shots | Wind Reader searches legal trajectories; Block-shot Gambit narrows the player's next opening |

Adaptive heuristics are game AI, not a pretrained model. **Prepare with connected model** optionally calls the configured Llama/OpenAI-compatible service to choose one of the encounter's two adaptive strategies. The screen distinguishes a **local AI duel** from a **model-planned duel**. The model chooses the policy before play; authored local logic executes opponent actions during the match. No inference blocks real-time input. Model output cannot change collisions, scoring, warnings, or campaign progress.

The preparation request contains the encounter, difficulty, and at most two numeric attempt summaries. Siren summaries include four lane miss counts. The server constrains legal strategies and habit focus, rejects invalid or extra fields, and generates its own strategy description. Keys stay on the server. Loading, elapsed time, cancel, regeneration, failure, and an explicitly labeled local start are supported. No failed request silently starts a match or grants a clear.

Two real requests for the new rivals returned HTTP 200 on October 8: Circe selected `chain` in 2.347 s; Scylla selected `pincer` in 8.838 s. Exact replies are in [the new evidence record](evidence/mythic-model-check-2026-10-08.json). These two examples verify integration, not comparative model quality. The [earlier technical spike](technical-spike.md) and [three-trial design record](three-trial-record.md) describe the superseded mechanics.

## Progress and class demonstration

Saves retain the `farshore-arcade-v1` storage key and migrate to schema 2. Existing clears and attempts are retained. Circe and the strait are inserted as pending encounters. Every earlier shore must be cleared or assisted before later trials become playable. A failed replay never removes a clear; a successful replay upgrades assistance. Practice does not change progress. In-progress rounds restart after reload. Preferences and completed progress remain browser-local.

For a concise class demonstration:

1. Show the five-shore map and explain that each stop uses a different interaction.
2. Sneak onto a sheep, then show Polyphemus locking a smash and your evade move.
3. In Circe's duel, drop the first all-Moly piece. Show purification and the curse arriving on her separate board.
4. Echo a Siren melody; deliberately miss a lane in an AI round, then show it appearing in the next refrain.
5. Hold Row while moving the shield in the strait. Point out the heads' warnings and pulsing vortex.
6. Move the archery aim to change the trajectory preview, release, then watch Antinous take his scored turn.
7. Show **Prepare with connected model**, its reviewed strategy, and the labeled model-planned match. Assistance can advance the demonstration; the homecoming report identifies it honestly.

The briefing's **In Homer / in this game** notes distinguish the literary episode from invented arcade rules. Scylla's arcade clear does not claim that Homer describes a lossless escape. Antinous' competitive shots are explicitly invented; in Homer he cannot string Odysseus' bow. The original Phase 2 slides/PDFs still describe the advice voyage. This implementation does not establish new interviews, personas, user-study results, or instructor approval.

## Implementation

- `src/ArcadeApp.tsx`: five-stop hub, preparation, preferences, progression, and homecoming.
- `src/lib/arcade.ts`: encounter content, strategies, save migration, and campaign validation.
- `src/lib/mythic.ts`: five deterministic gameplay engines and adaptive decisions.
- `src/components/arcade-round.tsx`: shared countdown, input, pause, scoreboards, and rival dialogue.
- `src/components/mythic-games.tsx`: modular boards; canvas strait and perspective archery; accessible grid, puzzle, and melody controls.
- `src/mythic.css`: responsive mythic arcade layout with the existing local pixel art and fonts.
- `server/arcade.ts`: bounded optional model planning for all five encounters.
- `tests/mythic.test.mjs`: new mechanics, AI reactions, win/loss paths, and migration.
- `src/lib/legacy-arcade.ts`: historical rules retained for older regression checks; not used by the current game.

Run `npm.cmd test` and `npm.cmd run build`. The mystery remains at `?mystery` and the advice voyage at `?voyage`, with their separate saves. See [current verification](trials-verification.md) for checks and practical limits.
