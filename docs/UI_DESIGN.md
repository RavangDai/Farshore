# FARSHORE — UI design system

## The cinematic interface (2026-11-18)

Supersedes the pixel skin below. The arcade root and the account shell carry `data-skin="cinema"`; the pixel sheets and fonts are no longer loaded. Gameplay engines, saves, routes and AI are unchanged.

**Palette and type.** Obsidian `#080C13`, deep ocean `#102533`, ancient bronze `#B98847`, imperial gold `#E4BF79`, warm ivory `#F5E8D0`, defined once as `--cn-*` in `src/styles/tokens.css` (the older `--fs-*` names alias them). Each trial adds an environmental accent (`--cn-accent`) from `src/lib/cinema/scenes.ts`. Cinzel for titles and chapter headings, Cormorant Garamond for editorial lines, Inter for controls and readable interface text, all self-hosted through Fontsource (the CSP allows fonts from `self` only). Wide uppercase tracking is reserved for chapter numbers, navigation and small ceremonial labels.

**Worlds.** One React Three Fiber canvas (`src/components/cinema/backdrop.tsx`, `three/stage.tsx`) sits behind every menu screen and is unmounted during play. It shows one world at a time: the moonlit Aegean (menu, prologue, pages), each trial's environment (chapter view, briefing, result), or the 3D voyage chart. Worlds that share a key glide between camera framings (chapter view to briefing to result); a different world dips to dark and back. Everything is procedural (`three/kit.ts`, `sky.tsx`, `fx.tsx`): no downloaded models, HDRIs or textures. Each world's environment lighting is prefiltered from its own sky colours.

**Performance.** A new world's shaders compile with `compileAsync` (off the main thread where `KHR_parallel_shader_compile` exists) while the frame loop waits and the veil stays down; every world is padded to the same point-light count so standard materials are shared, not recompiled. A governor lowers the resolution when frames run long. Graphics quality (Automatic, Cinematic, Balanced, Lite) is a per-device setting in its own local key (`lib/cinema/quality.ts`); Lite and browsers without WebGL get the painted art, slowly drifting. Reduced motion renders composed still frames and skips GSAP reveals.

**Motion.** GSAP runs the coordinated sequences (title reveal, chapter titles, map camera approaches, the victory laurel); Motion runs mount and unmount transitions (drawers, tabs, the carousel highlight, the map card). Lag smoothing is off so a long frame lets a reveal finish rather than crawl.

**Progressive disclosure.** Each screen shows one title, one short objective and one primary action. Lore, controls, the rival's plan, detailed results and technical AI facts live in drawers (`chrome.tsx` `Drawer`: focus trap, Escape, focus return). Commentary and taunts appear as film subtitles, never as panels.

**AI made visible.** The Oracle sigil (`OracleSigil`) reflects real state only: connected, unavailable, writing (the Oracle's question, the rival's taunt or the bard's recap is in flight), trained (the PPO policy, which needs no language model) and, in play, the rival's live line in the HUD. That line is the AI feed's headline for the rivals that decide in play (Cyclops, Sirens, Antinous) and the engine's own current line elsewhere. The AI Lab's "Models & measurements" tab shows the trained policy's metadata, its documented held-out evaluation, and an inference benchmark measured on the player's device.

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

## The pixel skin (2026-11-14, retired 2026-11-18)

Replaced by the cinematic interface above; kept here as a record.

Menus, cinematics, dialogs and the overlays during play are drawn as pixel art. Gameplay canvases (the 3D cave and hall, the 2D encounters) keep their painted rendering. `?skin=classic` shows the earlier painted look for comparison.

**How it is applied.** The root of the arcade and the account shell carry `data-skin="pixel"`. `src/styles/farshore-pixel-shell.css` (loaded by the layout) holds the fonts, the palette and the frame images; `src/styles/farshore-pixel.css` and `farshore-pixel-motion.css` load last in the arcade, and every rule is scoped to `.fs-app.a-app[data-skin="pixel"]`, so the older layered sheets are restyled without being rewritten. `scripts/css-codemod.mjs` made those sheets read three variables (`--fs-font-floor`, `--fs-round`, and the font tokens); with the skin off they resolve to the old values.

**Palette.** One palette for art and interface: ink `#04080f`, night `#071523`, deep `#0b2033`, lapis `#123049`, sea `#1d4a66`, cream `#f6f0e3`, mist `#93afc0`, bronze `#8a5a2b`/`#c08a3e`, gold `#e9b85c`/`#ffe3a1`. Cyan `#32d4f5` stays reserved for AI state, red for threat, green for success. The pixel art is quantized to the same colours (`src/lib/render/palette.generated.ts`).

**Type.** Pixelify Sans (weight 500 for reading, 700 for headings and labels) carries everything players read; Press Start 2P is for the wordmark, numerals and countdowns, at multiples of 8 px; VT323 is the AI's instrument voice and the map's numerals, where Pixelify's zero could pass for a D. No text is smaller than 12 px. Italics are not used: the faces have none.

**Frames.** One notched 9-slice frame per tier, drawn as SVG `border-image`s: paper (bronze, main panels), inset (sunken wells), AI (cyan, AI state only) and the button outline. Buttons have one style: an ink outline, a bevel and a hard drop; gold is the primary action, sea marks the chosen option, a checker pattern marks disabled. Radii are 0.

**Motion.** Interface moves in whole steps (`steps()`), never in blurs. Each screen has one moment: a dithered dissolve between screens (`PixelTransition`), the wordmark gathering from the sea on the splash (`WordmarkAssembly`), stars, petals, embers, notes or rain drifting over scenes (`PixelAmbience`), art resolving through 32, 16, 8 and 4 px mosaics, typed story lines, taunts and subtitles (`Typewriter`), the title card's slam and the result's falling stars. Lightning is limited to one small flash every few seconds. Reduced motion stops all of it and shows the final state.

**Words.** One term per concept: a *trial* is one of the eight episodes, an *island* is a place on the chart, the *rival* is the AI opponent, its plan is its *strategy*, the campaign and save are the *voyage*, and the map screen is the *Voyage map*. A button's second line stays only when it adds something the label does not say. Developer details (model names, setup steps) live in Settings and the AI Lab, not on play screens.

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

- Reduced motion is honoured at three levels: the system preference (which sets the in-game toggle's starting value), the in-game toggle (which decides: a player on a device that asks for reduced motion can still turn it off and get the cinematics; `data-motion` on the app root tells the stylesheets), and (for the cave) an additional Visual Effects strength slider independent of the motion toggle, so a player can keep full particle density while declining camera shake, or vice versa.
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
- **Reduced motion** (the in-game toggle, which starts from the system setting) removes the curtain, mist, shutters, reveals, pulses and the 3D cinematics; information stays in place.

### The mythic cinematics (3D)

Two short films in three.js, built from the Cyclops' Cave kit so they share one world with the 3D encounters: painted stone, marble, bronze braziers, ruins and sea cliffs, with Odysseus as the pixel sprite on a camera-facing card (crisp against painted stone, with bloom on fire and light). Timeline in `src/lib/story/cinema.ts` (pure and tested), drawn by `src/lib/render/cinema-world.ts`, shown by `src/components/menu/mythic-cinema.tsx`.

- **The gate (7.4 s).** When the Oracle's key is won and the player presses "Enter the trial", Odysseus walks up a torch-lit causeway to the trial's bronze gate. The gold key falls in a shaft of light, tips into the sun-seal and turns a quarter, runes in the trial's colour ignite along the doors, the doors swing open on light, and the camera rides into it before the trial starts.
- **The walk (8.8 s).** After a win, "Next trial" shows Odysseus walking out through the gate he opened, along the sea causeway, while the sky blends from one trial's light to the next, to the next trial's gate, its runes stirring under the title card. The bard reads the crossing line. It replaces the 2D chart crossing, which stays as the fallback when WebGL is unavailable.
- Every screen inside the chrome arrives like a camera move (`fs-ride-in`: out of depth, slightly below the eye line, drawing into focus), and the briefing's scene settles from a push-in.
- Enter, Space, Escape or the button skip a film. Settings → Showcase has "Preview a crossing" and "Preview the gate". Development builds expose `window.farshoreCinema` (`hold`, `seek`, `world`) for frame-exact checks.
