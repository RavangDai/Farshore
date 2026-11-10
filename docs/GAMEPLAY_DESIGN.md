# FARSHORE — gameplay design

Eight encounters, each a distinct arcade genre, connected by a voyage from Troy to Ithaca. This document describes mechanics, controls, scoring and win/lose conditions as implemented. Where an encounter has been fully rebuilt this session, that is noted; the other seven retain their pre-existing, tested mechanics, described as they stand.

## Shared structure

- **Difficulty**: Easy / Medium / Hard, chosen per attempt, selectable independently of campaign progress once an island is unlocked.
- **The rival**: every attempt is played against a model-planned rival. At the briefing a connected model reads your last two attempts and picks one of the encounter's two plans, and the plan changes how the rival plays. In Cyclops' Cave, Sirens' Passage and the Palace of Ithaca the model also decides during play, choosing from menus the game has checked are fair. See `AI_ARCHITECTURE.md`.
- **Medals**: gold (0 hits, 0 misses), silver (≤2 combined), bronze (any clear). `medalFor()` in `src/lib/arcade/arcade.ts`.
- **Progression**: clearing an island unlocks the next (`unlocked()` in `src/lib/arcade/arcade.ts`). Practice and AI-demonstration runs never touch campaign state. An "Assisted" accessibility passage is available after a failed attempt, explicitly confirmed, and earns no medal.
- **Saves**: per-device by default; versioned and validated (`readArcade`, `validSummary`) so a corrupted or tampered save is rejected rather than silently accepted.

---

## 1 · Lotus-Eaters — maze rescue

**Genre**: Pac-Man-style top-down maze. **File**: `src/lib/encounters/odyssey-games.ts` (`LotusState`), rendered by `src/components/play/adventure-game.tsx`.

**Objective**: find a sailor, carry them back to the ship at the maze's entrance, repeat (1 for practice, 3 for a full attempt). Laurel relics are optional bonus pickups (+125 each). A moly pickup grants 14 seconds of guardian immunity.

**Controls**: WASD / arrows, one tile per press (170ms move cooldown).

**AI**: guardians patrol waypoints and, from Medium up, pursue with A* once they detect you. The model's plan shapes the second guardian. Under *pincer* it circles round to cut you off from the far side; under *undertow* it takes the junction ahead, or the path home while you carry a sailor. It may hold one spot for at most four steps before it patrols again. The separate controller in `src/lib/ai/lotus.ts` is not wired in.

**Win/lose**: win by delivering the required number of sailors before the duration elapses; a caught player (guardian collision without moly active) drops any carried sailor and returns to the ship, costing a life — three hits ends the attempt.

---

## 2 · Cyclops' Cave — three-lane perspective runner

**Genre**: Subway-Surfers-style endless runner with a finite, winnable ending. **File**: `src/lib/encounters/cave-runner.ts`. **This is the fully rebuilt flagship encounter** — see `AI_ARCHITECTURE.md` and `UI_DESIGN.md` for the explainable-AI and rendering detail.

**Objective**: outrun Polyphemus through a collapsing cave to daylight. The cave has three sections (narrow passage → collapsing hall → daylight), each with its own hazard mix and pacing.

**Controls**:

| Input | Action |
|---|---|
| A / Left, D / Right | Change lane |
| W / Up / Space | Jump (700ms arc, with coyote time and a short input buffer) |
| S / Down | Slide (600ms, lowers the hitbox) |
| Escape | Pause |

**Hazards**, each with a stated, on-screen avoidance method (`AVOIDANCE` in `cave-runner.ts`): pillars and boulders must be dodged by changing lane; crates, low rocks, fire vents, falling debris and cracked floor are jumped; overhead beams are slid under.

**Collectibles**: sheep (restore one life, +150 score, widen the chase gap, animated with a real trot cycle), coins (+60, safe-lane bonus route).

**Procedural generation**: waves are built from a weighted pattern table, then validated by `patternIsFair()` — any pattern that would close every lane without an answerable escape is rejected and retried (up to 8 attempts) or trimmed down to something survivable before it ever reaches the world. See `AI_ARCHITECTURE.md` §4 for the matching guarantee on the opponent's own attacks.

**AI**: in a live round the briefing plan sets Polyphemus' doctrine for the narrow passage. Most of the way through each section, the model picks the doctrine for the next one from those the difficulty allows: *Lane rotation* (Easy), *Hunt your lane* (all tiers), *Cut off your next move* (Medium, Hard), *Press your weak spot* (Hard). The doctrine changes how throws are scored and which hazard type single hazards lean toward, never the warning time or the escape-lane guarantee.

**Win/lose**: survive to the end of the duration (daylight) to win. Three hits, or the chase gap reaching zero, ends the attempt. A committed boulder throw is always telegraphed (1.25–2.05s depending on difficulty) and the target lane is locked for that whole window.

**Scoring**: dodges, precise jump/slide timing (+200, vs +100 for a lane-change dodge), sheep (+150), coins (+60), and a clear-run bonus on victory.

---

## 3 · Island of Aeolus — wind sailing

**Genre**: Flappy-Bird-style vertical navigation. **File**: `src/lib/encounters/odyssey-games.ts` (`WindState`).

**Objective**: keep the ship inside a series of gate openings until reaching open water.

**Controls**: Space / Up / W to lift; gravity pulls the ship down otherwise.

**AI**: fixed wind (Easy), a time-varying wind field (Medium) and adaptive counter-gusts (Hard). The model's plan chooses the pressure: *pincer* swings the gate openings higher and lower, while *undertow* brings counter-gusts that answer your lift rhythm from Medium up. The separate controller in `src/lib/ai/aeolus.ts` is not wired in.

**Win/lose**: colliding with a gate's edge costs a life; three hits ends the attempt. Collecting a blessing while passing a gate untouched earns a perfect-passage bonus.

---

## 4 · Circe's Palace — falling-potion duel

**Genre**: competitive match-3 (a two-board falling-block duel, not literal Bomberman — see note below). **File**: `src/lib/encounters/mythic.ts` (`PotionState`).

**Note on genre**: the original design brief called for a Bomberman-style arena. This codebase's established, tested implementation is a competitive falling-potion duel against Circe, matching three potions to clear lines, with moly purifying swine and sending curse blocks to her board. This session preserved that existing, working design rather than replacing it with an unbuilt genre, per the standing instruction to keep an established design unless clearly inadequate — the duel is a complete, winnable game with real stakes (a full board ends the attempt) and a genuine opponent.

**Controls**: A/D or arrows to choose a column, W to rotate, Space to drop.

**Win/lose**: outscore Circe before the clock runs out, or empty her board; losing means your own board fills to the top.

---

## 5 · Sirens' Passage — call-and-response rhythm

**Genre**: Guitar-Hero-style listen-then-echo over four lanes. **File**: `src/lib/encounters/mythic.ts` (`SongState`).

**Objective**: echo five melodies without filling the Temptation gauge.

**Controls**: A/S/D/F (or the four on-screen pads) during the reply phase, matching the lanes of the melody just heard.

**AI**: the composition controller (`src/lib/ai/sirens.ts`) scores every melody shape: a fixed staircase on Easy, rhythm variety on Medium, and on Hard a weave of your weakest lane, measured from your misses. Between melodies the model picks one of the best fair melodies. Every melody on its menu keeps the tempo between 440 and 900 ms, opens a reply window that admits every note at your measured pace, and never puts more than half a melody on your weakest lane. The plan leans the choice: *swell* toward the weave, *echo* toward melodies with rests.

**Win/lose**: five clean melodies win; the Temptation gauge reaching 100% (from missed or wrong notes) loses.

---

## 6 · Scylla & Charybdis — six-head defence

**Genre**: Galaga-style positional defence against six independently animated heads, plus a whirlpool pull. **File**: `src/lib/encounters/mythic.ts` (`StraitState`).

**Objective**: survive the strait with the ship afloat.

**Controls**: Up/Down or W/S move the shield; hold Space (or drag on the canvas) to row against the pull.

**AI**: heads aim around your shield from Medium up (and in every model-planned round), and Charybdis' pull is synchronized to incoming strikes. The model's plan sets how hard: *undertow* pulls harder during an attack than *pincer*. There is no separate controller for this encounter.

**Win/lose**: a centred parry (within 12px of the shield's centre) deflects a strike for bonus score and distance from the vortex; an off-centre or missed strike costs hull. Five hits, or the boat reaching the vortex, ends the attempt; surviving the duration wins.

---

## 7 · Calypso's Raft Escape — raft hopping

**Genre**: Frogger-style platform hopping across drifting timbers, under lightning. **File**: `src/lib/encounters/odyssey-games.ts` (`RaftState`).

**Objective**: cross seven currents (five for a full attempt) to reach the far shore.

**Controls**: WASD or arrows (forward/back/strafe), Space to hop forward.

**AI**: telegraphed lightning that is only thrown when a safe alternate hop is verified. The model's plan chooses the storm: *pincer* (storm watch) strikes more often at the timber you stand on; *undertow* (landing prediction) strikes where the current will carry you, from Medium up. The separate controller in `src/lib/ai/calypso.ts` is not wired in.

**Win/lose**: falling into the sea (missing a timber) costs a life and returns the player to shore; a lightning strike on the player's timber costs a life. Three driftwood pieces, gathered one per crossing, repair one life at a safe shore.

---

## 8 · Palace of Ithaca — archery contest then palace battle

**Genre**: first-person archery in a 3D great hall (Phase 1), described in the brief as leading into a tactical palace battle (Phase 2, not yet built). **Files**: rules in `src/lib/encounters/mythic.ts` (`BowState`, `BOW`); the hall in `src/lib/render/hall-world.ts` (three.js), its overlay and flat fallback in `hall-overlay.ts`, the shared camera and geometry in `hall-view.ts`, and the view in `src/components/play/hall-game.tsx`.

**Objective**: shoot through the line of twelve axe heads. Every axe the arrow passes scores a point; the arrow stops at the first axe it strikes. After five arrows each, beat Antinous' total. Ties go to him.

**Controls**: aim with the mouse (the sight sits exactly under the pointer), the arrow keys / WASD (Shift for fine adjustment), or a finger drag. Hold the mouse button, Space, or the touch DRAW button to pull the bow over 0.9 s; let go to shoot. Letting go below 30% draw, or pausing, lets the string down without spending an arrow. A weaker draw drops and drifts by the square of the shortfall, so a full draw flies flattest, but a full draw held more than 2.5 s starts to tremble and the arrow follows the trembling sight. The draught gauge shows which way the wind carries an arrow; aim into it. Easy shows the whole predicted flight, medium its first six axes, hard none; every tier shows the previous arrow's path.

**Presentation**: each turn opens on the gallery view of the numbered line and settles behind the bow, with the eye on the line itself: the twelve openings nest into one tunnel, so aiming into the holes the player sees is aiming the arrow down the line. (An earlier camera sat above the line; the nearest hole then showed well below the true aim, and aiming into it sent arrows into the first axe.) The player's arrow is chased down the hall, each axe ringing as it is threaded; Antinous' arrow is watched from the gallery. A track of twelve pips, the scoreboard and the result banner only reveal an arrow's score once it lands, and a miss names the axe struck, the side it missed on, and the correction.

**AI**: before each of Antinous' arrows the game measures his options with the hall's own physics, 40 simulated loosings each:

- reading the full draught
- a steady hand with half the allowance
- a showy half-draw, only when he leads by three
- on Medium and Hard, lodging an arrow in an axe that would actually cut your last line, never on the last arrow

The model picks one while your arrow flies. A chosen block is announced before it lodges, and it is later judged by what it really cost your next arrow. His aim always carries a seeded execution error, so the model chooses what he tries, never how well it flies.

**Ask Athena**: during your turn, ask up to three questions (typed, suggested or spoken). Athena answers only from the hall's facts, cut to the difficulty's precision, and shows which facts she used.

Phase 2 (the palace battle against the suitors) is not implemented. Phase 1 is a complete, winnable encounter on its own.

**Win/lose**: higher total axes after five arrows each wins; Antinous wins ties. Each arrow short of twelve counts against the medal.

---

## Honest status summary

All eight encounters are playable, with real win and lose conditions, real scoring, and a model-planned rival whose plan changes play. In three of them (Cyclops' Cave, Sirens' Passage and the Palace of Ithaca) the model also decides live from game-checked menus, and the rival gives a debrief after the round. The controllers written for Lotus, Aeolus, Calypso and Circe are not wired in; those encounters run their engines' own logic, shaped by the plan. See `AI_ARCHITECTURE.md`.
