# FARSHORE — gameplay design

Eight encounters, each a distinct arcade genre, connected by a voyage from Troy to Ithaca. This document describes mechanics, controls, scoring and win/lose conditions as implemented. Where an encounter has been fully rebuilt this session, that is noted; the other seven retain their pre-existing, tested mechanics, described as they stand.

## Shared structure

- **Difficulty**: Easy / Medium / Hard, chosen per attempt, selectable independently of campaign progress once an island is unlocked.
- **Opponent source**: *Arcade Solo* (a local, learnable, deterministic-per-seed policy) or *Adaptive AI* (the same engine's harder, player-reactive branch — see `AI_ARCHITECTURE.md` for how "adaptive" is implemented honestly rather than just faster).
- **Medals**: gold (0 hits, 0 misses), silver (≤2 combined), bronze (any clear). `medalFor()` in `src/lib/arcade/arcade.ts`.
- **Progression**: clearing an island unlocks the next (`unlocked()` in `src/lib/arcade/arcade.ts`). Practice and AI-demonstration runs never touch campaign state. An "Assisted" accessibility passage is available after a failed attempt, explicitly confirmed, and earns no medal.
- **Saves**: per-device by default; versioned and validated (`readArcade`, `validSummary`) so a corrupted or tampered save is rejected rather than silently accepted.

---

## 1 · Lotus-Eaters — maze rescue

**Genre**: Pac-Man-style top-down maze. **File**: `src/lib/encounters/odyssey-games.ts` (`LotusState`), rendered by `src/components/play/adventure-game.tsx`.

**Objective**: find a sailor, carry them back to the ship at the maze's entrance, repeat (1 for practice, 3 for a full attempt). Laurel relics are optional bonus pickups (+125 each). A moly pickup grants 14 seconds of guardian immunity.

**Controls**: WASD / arrows, one tile per press (170ms move cooldown).

**AI**: `AI_ARCHITECTURE.md` §"Status" — original patrol/pursuit logic is live (A* pathing once a guardian detects the player within range, waypoint patrol otherwise); the explainable-AI controller described in that document (`src/lib/ai/lotus.ts`) is written and reviewed but not yet wired into this engine's tick loop.

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

**Win/lose**: survive to the end of the duration (daylight) to win. Three hits, or the chase gap reaching zero, ends the attempt. A committed boulder throw is always telegraphed (1.25–2.05s depending on difficulty) and the target lane is locked for that whole window.

**Scoring**: dodges, precise jump/slide timing (+200, vs +100 for a lane-change dodge), sheep (+150), coins (+60), and a clear-run bonus on victory.

---

## 3 · Island of Aeolus — wind sailing

**Genre**: Flappy-Bird-style vertical navigation. **File**: `src/lib/encounters/odyssey-games.ts` (`WindState`).

**Objective**: keep the ship inside a series of gate openings until reaching open water.

**Controls**: Space / Up / W to lift; gravity pulls the ship down otherwise.

**AI**: fixed wind (easy), a time-varying wind field (medium), and an adaptive counter-gust tier (hard) exist in the original engine. The dedicated explainable-AI controller for this encounter is authored and reviewed but not yet wired in — see `AI_ARCHITECTURE.md`.

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

**AI**: a complete, reviewed explainable-AI controller (`src/lib/ai/sirens.ts`) exists for this encounter — fixed learnable patterns (easy), varied tempo (medium), and adaptive composition that weaves the player's weakest lanes into future melodies while respecting a stated per-melody share cap and a reply-window bound (hard). It is the most directly integrable of the pending controllers (see `AI_ARCHITECTURE.md`'s closing note) but is not yet wired into this tick loop; the live encounter still uses its original timer-driven composition.

**Win/lose**: five clean melodies win; the Temptation gauge reaching 100% (from missed or wrong notes) loses.

---

## 6 · Scylla & Charybdis — six-head defence

**Genre**: Galaga-style positional defence against six independently animated heads, plus a whirlpool pull. **File**: `src/lib/encounters/mythic.ts` (`StraitState`).

**Objective**: survive the strait with the ship afloat.

**Controls**: Up/Down or W/S move the shield; hold Space (or drag on the canvas) to row against the pull.

**AI**: independent per-head attacks (easy), alternating-flank coordination (medium) exist in the live engine. The full six-role coordination system described in `AI_ARCHITECTURE.md` (ATTACK / DEFEND / FLANK LEFT / FLANK RIGHT / REPOSITION / SUPPORT, scored and assigned per cycle) is authored and reviewed as `src/lib/ai/scylla.ts` but not yet wired in.

**Win/lose**: a centred parry (within 12px of the shield's centre) deflects a strike for bonus score and distance from the vortex; an off-centre or missed strike costs hull. Five hits, or the boat reaching the vortex, ends the attempt; surviving the duration wins.

---

## 7 · Calypso's Raft Escape — raft hopping

**Genre**: Frogger-style platform hopping across drifting timbers, under lightning. **File**: `src/lib/encounters/odyssey-games.ts` (`RaftState`).

**Objective**: cross seven currents (five for a full attempt) to reach the far shore.

**Controls**: WASD or arrows (forward/back/strafe), Space to hop forward.

**AI**: telegraphed, player-independent lightning strikes (easy/medium exist live); the full landing-prediction controller (predicting where the player's hop pattern will put them and coordinating strike timing with the wave drift, while guaranteeing a reachable safe landing always remains) is authored and reviewed as `src/lib/ai/calypso.ts` but not yet wired in.

**Win/lose**: falling into the sea (missing a timber) costs a life and returns the player to shore; a lightning strike on the player's timber costs a life. Three driftwood pieces, gathered one per crossing, repair one life at a safe shore.

---

## 8 · Palace of Ithaca — archery contest then palace battle

**Genre**: first-person archery in a 3D great hall (Phase 1), described in the brief as leading into a tactical palace battle (Phase 2, not yet built). **Files**: rules in `src/lib/encounters/mythic.ts` (`BowState`, `BOW`); the hall in `src/lib/render/hall-world.ts` (three.js), its overlay and flat fallback in `hall-overlay.ts`, the shared camera and geometry in `hall-view.ts`, and the view in `src/components/play/hall-game.tsx`.

**Objective**: shoot through the line of twelve axe heads. Every axe the arrow passes scores a point; the arrow stops at the first axe it strikes. After five arrows each, beat Antinous' total. Ties go to him.

**Controls**: aim with the mouse (the sight moves like a heavy, precise cursor), the arrow keys / WASD (Shift for fine adjustment), or a finger drag. Hold the mouse button, Space, or the touch DRAW button to pull the bow over 0.9 s; let go to shoot. Letting go below 30% draw, or pausing, lets the string down without spending an arrow. A weaker draw drops and drifts by the square of the shortfall, so a full draw flies flattest, but a full draw held more than 1.6 s starts to tremble and the arrow follows the trembling sight. The draught gauge shows which way the wind carries an arrow; aim into it. Easy shows the whole predicted flight, medium the first four axes, hard none; every tier shows the previous arrow's path.

**Presentation**: each turn opens on the gallery view of the numbered line and settles behind the bow. The player's arrow is chased down the hall, each axe ringing as it is threaded; Antinous' arrow is watched from the gallery. A track of twelve pips, the scoreboard and the result banner only reveal an arrow's score once it lands, and a miss names the axe struck, the side it missed on, and the correction.

**AI**: Antinous aims with a seeded execution error measured in openings (about 7, 9 and 10 axes a shot on easy, medium and hard). The unsteady suitor allows for half the draught; the wind reader (AI plan) allows for all of it, risks one half-drawn showy shot, and the block-shot plan may lodge an arrow that narrows one opening for the player's next shot. The fuller controller in `src/lib/ai/ithaca.ts` mirrors the same physics but is not yet wired in. Phase 2 (the palace battle against the suitors) is not implemented — Phase 1 is a complete, winnable encounter on its own.

**Win/lose**: higher total axes after five arrows each wins; Antinous wins ties. Each arrow short of twelve counts against the medal.

---

## Honest status summary

All eight encounters are genuinely playable today, with real win/lose conditions, real scoring, and a functioning opponent. The Cyclops encounter received a full gameplay, visual and AI rebuild this session and is the reference standard the design brief asked for. The remaining seven keep their existing, tested mechanics; seven of their eight next-generation AI controllers are written and adversarially reviewed, with one (Sirens) the most directly wireable next step. See `AI_ARCHITECTURE.md` for exactly what "wiring in" entails per encounter.
