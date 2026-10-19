# FARSHORE — UI design system

## Design language

**Cinematic Greek Mythology + Illustrated 2.5D Arcade + modern indie polish.** Navy and cobalt seas, amber/bronze torchlight, engraved gold typography, parchment-and-bronze framing. The style is established by the original menus (`src/farshore.css`, `src/farshore-brand.css`, `src/farshore-detail.css`) and extended, not replaced, by the new gameplay stage and AI inspector (`src/farshore-stage.css`).

### Colour tokens (`farshore-stage.css`)

```
--fs-navy-900 #04080f   --fs-gold        #e9b85c
--fs-navy-800 #071523   --fs-gold-bright #ffe4a3
--fs-navy-700 #0b2033   --fs-bronze      #b18b4e
--fs-navy-600 #102e44   --fs-cyan        #32d4f5
--fs-cream    #f6f0e3   --fs-danger      #f4604f
--fs-ink      #93afc0   --fs-good        #9fe6b4
```

Gold/bronze for structure and interactive chrome, cyan exclusively for AI/forecast data (never for gameplay hazards, so a player never confuses "the opponent is thinking" with "you are in danger"), red reserved for actual threat, green for confirmation and successful escapes.

### Typography

Press Start 2P (pixel, licensed SIL OFL) for arcade chrome and eyebrow labels; Georgia serif for narrative and headline text, matching the "engraved gold typography" reference. Monospace (`SFMono-Regular`/Consolas) exclusively inside the AI inspector, for algorithm names, candidate scores and timeline codes — a deliberate register shift that reads as "instrumentation" against the serif game chrome around it.

## The immersive gameplay stage (`src/components/game-stage.tsx`)

The highest-priority correction from the design brief: the previous Cyclops screen was a small canvas embedded in a page column. The replacement is a dedicated, full-viewport stage:

- `position: fixed; inset: 0` — the stage owns the whole browser viewport, independent of page scroll position.
- `document.body`/`documentElement` get `overflow: hidden` and `overscroll-behavior: none` for the stage's entire mounted lifetime, restored to their prior values on unmount (not just cleared) — so leaving the stage can't leave the menus mis-styled.
- The gameplay frame is a fixed 16:9 logical box (`VIEW_W=1600 × VIEW_H=900` in `src/lib/render/stage.ts`), letterboxed to fit whatever space is available via `aspect-ratio` and a `max-width` computed from the viewport height. Rendering coordinates are always in this logical space — a canvas on a phone and a canvas on a 4K monitor draw identical geometry, just scaled, which is what keeps hitboxes, obstacle sizing and HUD proportions predictable everywhere.
- Native Fullscreen API support (`F` key or the on-screen button), entering and exiting cleanly, with a guard that exits fullscreen on unmount so a player can't get stranded in it after leaving mid-attempt.
- The HUD and AI inspector are **overlays on the frame** (`position: absolute` inside `.fs-stage-hud`), not page content beside it — this is what lets the action area use essentially the whole frame rather than ceding width to a sidebar for chrome that doesn't need to be beside the action, only visible over it.

A `labMode` variant widens a dedicated side column (`clamp(330px, 26vw, 430px)`) only when the expanded AI Lab panel is open, collapsing back to full width in AI Insights or Immersive mode — so the "distinct feature" doesn't cost playable space when a player isn't using it.

## The perspective runner (`src/lib/render/cave-scene.ts`)

A from-scratch pseudo-3D renderer for Cyclops' Cave, replacing the prior flat/static presentation:

- A single perspective-divide function (`project(z, laneOffset)`) turns a world-space depth `z` and lane offset into screen position and scale. Every entity — obstacles, sheep, coins, the boulder in flight, Polyphemus himself — is placed through this one function, which is what keeps depth sorting, scaling and lane alignment consistent without per-entity special-casing.
- Three render passes per frame in back-to-front order: far ridges (parallax, driven by real distance travelled, not wall-clock time) → walls and torches → floor and lane guides → depth-sorted world entities → in-flight boulders → the hero sprite → particles → foreground vignette.
- A capped (240-entry) particle pool (`src/lib/render/stage.ts`) driven by **event stamps** the simulation already publishes (`struckAt`, `landedAt`, `pickupAt`) — the renderer watches for a stamp changing and fires a burst exactly once, rather than the simulation knowing anything about particles. This is the separation the brief asked for: decorative effects derived from gameplay events, never vice versa.
- Screen shake, damage flash and hit-stop are all bounded, driven by the same stamps, and independently disableable via the Visual Effects / Camera Shake preference (`src/components/odyssey-preferences.tsx`) — accessibility settings the brief required, not an afterthought.
- Reduced motion (`still`) freezes every decorative animation — ambient particles, footstep dust, flicker — while leaving the actual game state (position, hazards, HUD numbers) fully live and legible.

## The explainable AI inspector (`src/components/ai-inspector.tsx`)

Three modes, switchable live with `F3` or the on-screen chip group, matching the design brief's Immersive / AI Insights / AI Lab split exactly:

- **Immersive** — no inspector. Only fair, on-screen attack telegraphs (the red lane stripe, the countdown ring) remain, because those are gameplay information every player is entitled to, not AI debug output.
- **AI Insights** — a compact, dark-navy-and-gold overlay panel (`.ai-insights`, positioned clear of the HUD) showing the opponent's current state, algorithm, selected action, confidence (or an honest "no probability model" when none exists), a countdown to telegraphed attacks, a one-line grounded reason, and the most recent outcome.
- **AI Lab** — the full six-stage pipeline as collapsible `<details>` sections (Perception, Memory, Evaluation, Decision, Execution, Result), a candidate score table with the winning row highlighted and withheld options visibly dimmed with their own fairness note, a forecast-distribution bar chart when the policy produces one, live metrics (decisions, mean interval, forecast accuracy, attack success rate, search nodes, coordination events — each present only when the controller actually feeds it), and a chronological decision timeline.

A closing footnote on the AI Lab panel states explicitly: *"Every value on this panel is read from the opponent's own decision records. Opening or closing this panel does not change how the opponent plays."* — a claim that is true because the panel and the compact overlay consume the identical `InspectorFeed` the engine produced for its own use, never a parallel "demo" data path.

## HUD (`src/components/arcade-hud.tsx`)

Arranged per the brief: captain portrait and lives top-left, encounter name/objective/progress top-centre, score/difficulty/pause top-right, a live tactical cue strip along the bottom (reused across all eight encounters via `src/lib/field-notes.ts`'s `encounterCue()`, with a Cyclops-specific branch reading real hazard distance and lane-lock state). A chase-distance meter is shown only for the Cyclops encounter, where it's meaningful. Hit damage flashes red across the frame (outside the camera-shake transform, so it stays legible even when the screen is shaking); pickups fire a floating `+score`/`+HEALTH` callout anchored over the lane that earned it, stacked rather than overlapping on rapid pickups.

## The voyage chart (`src/components/voyage-chart.tsx`)

Replaces the previous abstract island-and-route map with eight hand-drawn SVG landmarks — a lotus garden with glowing blossoms, a cave mouth with the Cyclops' torchlit silhouette, wind-swept peaks, Circe's purple towers, jagged singing rocks, Scylla's twin headlands with an animated whirlpool, a storm-battered coast with an animated lightning strike, and Ithaca's golden colonnade — each reacting to its lock state (muted/grey when locked, its real tint and a completion checkmark when cleared). A ship rides the actual SVG route path (computed via `getPointAtLength`, so it always sits exactly on the curve), its position driven by real campaign progress rather than a fixed illustration. Weather motifs (mist, wind streaks, a storm bolt, a magical glow) animate per-island and freeze completely under reduced motion. The companion panel shows the hovered or selected island's genre, objective, controls, difficulty picker, personal best and medal, and the entry button — live preview on hover, not just on click.

## Accessibility

- Reduced motion is honoured at three levels: system preference, an explicit in-game toggle, and (for the cave) an additional Visual Effects strength slider independent of the motion toggle, so a player can keep full particle density while declining camera shake, or vice versa.
- Every colour-coded state (locked/unlocked/cleared islands, danger cues, candidate table rows) is paired with an icon, text label, or pattern, not colour alone.
- Keyboard navigation is complete: arrow-key trial grid navigation, full pause-menu focus trapping, `Escape` to pause/resume, `F3` to cycle the inspector without losing focus context.
- All interactive SVG/canvas regions carry `role`, `aria-label` and (for the voyage chart's island targets) `aria-pressed`/keyboard activation, not mouse-only hit targets.
