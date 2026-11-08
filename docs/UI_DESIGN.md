# FARSHORE — UI design system

## Design language

**Cinematic Greek Mythology + Illustrated 2.5D Arcade + modern indie polish.** Navy and cobalt seas, amber/bronze torchlight, engraved gold typography, parchment-and-bronze framing. The style is established by the original menus (`src/styles/farshore.css`, `src/styles/farshore-brand.css`, `src/styles/farshore-detail.css`) and extended, not replaced, by the new gameplay stage and AI inspector (`src/styles/farshore-stage.css`).

### Design tokens (`src/styles/tokens.css`)

Colour, type and spacing are defined once, in `tokens.css`, and every stylesheet reads the variables. The older names in `farshore-stage.css` (`--fs-gold`, `--fs-cyan` and so on) are aliases of these tokens.

| Colour | Token | Value | Use |
| --- | --- | --- | --- |
| Background | `--fs-color-bg` | `#071523` | Page and stage background |
| Surface | `--fs-color-surface` | `#0b2033` | Panels and cards |
| Text | `--fs-color-text` | `#f6f0e3` | Primary text |
| Muted text | `--fs-color-text-muted` | `#93afc0` | Secondary lines and status text |
| Accent | `--fs-color-accent` | `#e9b85c` | The one accent: buttons, focus, interactive chrome |
| AI | `--fs-color-ai` | `#32d4f5` | Only for AI state and AI data |
| Error | `--fs-color-error` | `#f4604f` | Errors and real threats |
| Success | `--fs-color-success` | `#9fe6b4` | Confirmation and successful escapes |

Cyan is kept for AI data and never used for gameplay hazards, so a player never confuses "the opponent is thinking" with "you are in danger". Red is reserved for real threat, and green for confirmation and successful escapes. A few extra navy, gold and bronze tints are used for depth and highlights only.

| Text size | Token | Value | Use |
| --- | --- | --- | --- |
| XS | `--fs-text-xs` | 12 px | Captions, status lines, labels |
| S | `--fs-text-sm` | 14 px | Body text and buttons |
| M | `--fs-text-md` | 16 px | Panel titles, quotes, lead text |
| L | `--fs-text-lg` | 24 px | Section headings |
| XL | `--fs-text-xl` | 40-72 px (scales with the window) | Screen titles |

Spacing scale: `--fs-space-1` to `--fs-space-7` = 4, 8, 12, 16, 24, 32 and 48 px.

### Typography

Four families, each a token:

- **Pixel** (`--fs-font-pixel`): Press Start 2P (SIL OFL), for arcade chrome and eyebrow labels.
- **Display** (`--fs-font-display`): Georgia serif, for narrative and headline text, matching the "engraved gold typography" reference.
- **UI** (`--fs-font-ui`): Arial, for small interface details.
- **Mono** (`--fs-font-mono`): used only inside the AI inspector, for algorithm names, candidate scores and timeline codes. The shift in register reads as "instrumentation" against the serif game chrome around it.

### Migration status

The AI rival panel (all five states) and the shared page colours use only tokens. In the older stylesheets, every value that matched a token was replaced with it (179 font sizes, 244 font-family stacks, 38 colours and 393 spacing values). Values that are not on the scale remain, mostly in in-game HUD labels and minified menu rules. They will be moved onto the scale screen by screen in Phase 4.

## The immersive gameplay stage (`src/components/play/game-stage.tsx`)

The highest-priority correction from the design brief: the previous Cyclops screen was a small canvas embedded in a page column. The replacement is a dedicated, full-viewport stage:

- `position: fixed; inset: 0` — the stage owns the whole browser viewport, independent of page scroll position.
- `document.body`/`documentElement` get `overflow: hidden` and `overscroll-behavior: none` for the stage's entire mounted lifetime, restored to their prior values on unmount (not just cleared) — so leaving the stage can't leave the menus mis-styled.
- The gameplay frame is a fixed 16:9 logical box (`VIEW_W=1600 × VIEW_H=900` in `src/lib/render/stage.ts`), letterboxed to fit whatever space is available via `aspect-ratio` and a `max-width` computed from the viewport height. Rendering coordinates are always in this logical space — a canvas on a phone and a canvas on a 4K monitor draw identical geometry, just scaled, which is what keeps hitboxes, obstacle sizing and HUD proportions predictable everywhere.
- Native Fullscreen API support (`F` key or the on-screen button), entering and exiting cleanly, with a guard that exits fullscreen on unmount so a player can't get stranded in it after leaving mid-attempt.
- The HUD and AI inspector are **overlays on the frame** (`position: absolute` inside `.fs-stage-hud`), not page content beside it — this is what lets the action area use essentially the whole frame rather than ceding width to a sidebar for chrome that doesn't need to be beside the action, only visible over it.

A `labMode` variant widens a dedicated side column (`clamp(330px, 26vw, 430px)`) only when the expanded AI Lab panel is open, collapsing back to full width in AI Insights or Immersive mode — so the "distinct feature" doesn't cost playable space when a player isn't using it.

## The 3D cave (`src/lib/render/cave-world.ts`)

Cyclops' Cave now renders in real 3D with three.js, in the manner of the classic temple runners: a sunlit sandstone causeway across Polyphemus' sea grotto, seen from behind and above Odysseus. The 2D renderer below remains as the fallback when WebGL is unavailable.

- **Loaded only for this encounter.** `cave-game.tsx` imports the world module with `import()`, so three.js never enters the bundle for the other seven encounters.
- **The engine stays authoritative.** The world is placed from each state snapshot. Odysseus stands at the origin and an entity `z` metres ahead in the engine sits at `-z`. Scenery (parapet blocks, braziers, gates, ruins, cliffs, the cave roof) is keyed to absolute distance travelled, so a given gate keeps its place and its look as it streams toward the camera.
- **Hazards sit inside their lanes.** Lanes are 1.55 m apart and no model is wider than 1.5 m, so a blocked lane never appears to spill into the next one.
- **Polyphemus is behind the camera**, so he is felt rather than seen: his shadow stretches past Odysseus as the chase gap closes, his footfalls shake the view, and when he locks a throw his hand rises into the top of the frame on that lane's side, holding a glowing boulder. Every gate's one-eyed mask blazes while the throw is locked, and chevrons stream down the locked lane toward the runner.
- **Three moods by progress:** a teal, torchlit grotto, then an ember-lit collapse with falling rock, then the run out through the cave mouth into daylight and open sea. The mouth is fixed once, shortly before the daylight stretch, so the player runs toward it and through it.
- **All surfaces are painted on canvas at load** (`cave-textures.ts`): flagstones with bronze lane inlays and moss, block stone, ashlar, the Greek key, the guardian mask, vines and water caustics. The repository gains no image files.
- **The arcade layer is a transparent 2D canvas on top:** pixel-font JUMP / SLIDE / DODGE tags over hazards in the runner's lane, compact badges over the others, score pops, particles, speed streaks and the danger vignette.
- **Performance:** about 150 draw calls in a busy stretch, instanced parapets and roof, merged gate geometry, and a governor that lowers the render resolution if the frame rate cannot hold. Disposal releases every geometry, material, texture and the WebGL context.

## The perspective runner (`src/lib/render/cave-scene.ts`)

The 2D fallback for Cyclops' Cave, used where WebGL is unavailable:

- A single perspective-divide function (`project(z, laneOffset)`) turns a world-space depth `z` and lane offset into screen position and scale. Every entity — obstacles, sheep, coins, the boulder in flight, Polyphemus himself — is placed through this one function, which is what keeps depth sorting, scaling and lane alignment consistent without per-entity special-casing.
- Three render passes per frame in back-to-front order: far ridges (parallax, driven by real distance travelled, not wall-clock time) → walls and torches → floor and lane guides → depth-sorted world entities → in-flight boulders → the hero sprite → particles → foreground vignette.
- A capped (240-entry) particle pool (`src/lib/render/stage.ts`) driven by **event stamps** the simulation already publishes (`struckAt`, `landedAt`, `pickupAt`) — the renderer watches for a stamp changing and fires a burst exactly once, rather than the simulation knowing anything about particles. This is the separation the brief asked for: decorative effects derived from gameplay events, never vice versa.
- Screen shake, damage flash and hit-stop are all bounded, driven by the same stamps, and independently disableable via the Visual Effects / Camera Shake preference (`src/components/menu/odyssey-preferences.tsx`) — accessibility settings the brief required, not an afterthought.
- Reduced motion (`still`) freezes every decorative animation — ambient particles, footstep dust, flicker — while leaving the actual game state (position, hazards, HUD numbers) fully live and legible.

## The explainable AI inspector (`src/components/ai/ai-inspector.tsx`)

Three modes, switchable live with `F3` or the on-screen chip group, matching the design brief's Immersive / AI Insights / AI Lab split exactly:

- **Immersive** — no inspector. Only fair, on-screen attack telegraphs (the red lane stripe, the countdown ring) remain, because those are gameplay information every player is entitled to, not AI debug output.
- **AI Insights** — a compact, dark-navy-and-gold overlay panel (`.ai-insights`, positioned clear of the HUD) showing the opponent's current state, algorithm, selected action, confidence (or an honest "no probability model" when none exists), a countdown to telegraphed attacks, a one-line grounded reason, and the most recent outcome.
- **AI Lab** — the full six-stage pipeline as collapsible `<details>` sections (Perception, Memory, Evaluation, Decision, Execution, Result), a candidate score table with the winning row highlighted and withheld options visibly dimmed with their own fairness note, a forecast-distribution bar chart when the policy produces one, live metrics (decisions, mean interval, forecast accuracy, attack success rate, search nodes, coordination events — each present only when the controller actually feeds it), and a chronological decision timeline.

A closing footnote on the AI Lab panel states explicitly: *"Every value on this panel is read from the opponent's own decision records. Opening or closing this panel does not change how the opponent plays."* — a claim that is true because the panel and the compact overlay consume the identical `InspectorFeed` the engine produced for its own use, never a parallel "demo" data path.

## HUD (`src/components/play/arcade-hud.tsx`)

Arranged per the brief: captain portrait and lives top-left, encounter name/objective/progress top-centre, score/difficulty/pause top-right, a live tactical cue strip along the bottom (reused across all eight encounters via `src/lib/story/field-notes.ts`'s `encounterCue()`, with a Cyclops-specific branch reading real hazard distance and lane-lock state). A chase-distance meter is shown only for the Cyclops encounter, where it's meaningful. Hit damage flashes red across the frame (outside the camera-shake transform, so it stays legible even when the screen is shaking); pickups fire a floating `+score`/`+HEALTH` callout anchored over the lane that earned it, stacked rather than overlapping on rapid pickups.

## The voyage chart (`src/components/menu/voyage-chart.tsx`)

Replaces the previous abstract island-and-route map with eight hand-drawn SVG landmarks — a lotus garden with glowing blossoms, a cave mouth with the Cyclops' torchlit silhouette, wind-swept peaks, Circe's purple towers, jagged singing rocks, Scylla's twin headlands with an animated whirlpool, a storm-battered coast with an animated lightning strike, and Ithaca's golden colonnade — each reacting to its lock state (muted/grey when locked, its real tint and a completion checkmark when cleared). A ship rides the actual SVG route path (computed via `getPointAtLength`, so it always sits exactly on the curve), its position driven by real campaign progress rather than a fixed illustration. Weather motifs (mist, wind streaks, a storm bolt, a magical glow) animate per-island and freeze completely under reduced motion. The companion panel shows the hovered or selected island's genre, objective, controls, difficulty picker, personal best and medal, and the entry button — live preview on hover, not just on click.

## Accessibility

- Reduced motion is honoured at three levels: system preference, an explicit in-game toggle, and (for the cave) an additional Visual Effects strength slider independent of the motion toggle, so a player can keep full particle density while declining camera shake, or vice versa.
- Every colour-coded state (locked/unlocked/cleared islands, danger cues, candidate table rows) is paired with an icon, text label, or pattern, not colour alone.
- Keyboard navigation is complete: arrow-key trial grid navigation, full pause-menu focus trapping, `Escape` to pause/resume, `F3` to cycle the inspector without losing focus context.
- All interactive SVG/canvas regions carry `role`, `aria-label` and (for the voyage chart's island targets) `aria-pressed`/keyboard activation, not mouse-only hit targets.

## The cinematic layer (`src/styles/farshore-cinema.css`)

Loaded after every other sheet and extending, not replacing, the language above.

- **One orchestrated transition.** Every screen change fades up from night with a gold horizon line drawn across the dark (`.fs-curtain`), instead of per-section entrance effects. Pages inside the chrome rise out of it over 0.75 s.
- **Opening titles.** The splash opens with anamorphic shutter bars, a slow Ken Burns push on the art, sea mist, the wordmark resolving out of a blur with a band of light crossing the gold, then the tagline and start prompt in sequence.
- **Prologue.** A full-bleed two-part scene: chapter line, a two-line headline that rises line by line, the cast, then the eight trials as a numbered route of portrait cards. The bard reads it aloud when voice is on.
- **Encounter title card.** The opening countdown is a title card: chapter, trial name, the rival with the model-chosen strategy, the rival's taunt as a subtitle, and a countdown ring. A resume after a pause is a plain countdown.
- **Buttons say what they do.** Menu, briefing, pause and result buttons carry a second line with the consequence or context ("Next: Cyclops' Cave · 1 of 8 cleared", "Same rival strategy · nothing is saved", "This attempt will not be saved").
- **The codex.** Beside every board, a real column (never overlapping the board) holds the objective with live per-encounter trackers read from engine state, the rival card with its strategy and live line, the commentary log, and the bonus challenge. Commentary also appears as a broadcast subtitle over the action.
- **Phones.** In portrait, the stage stops letterboxing to 16:9 and becomes a scrolling column: sticky HUD, the board at full width, its controls, the cue strip, then the inspector or codex.
- **Reduced motion** (system setting or the in-game toggle) removes the curtain, mist, shutters, reveals and pulses; information stays in place.
