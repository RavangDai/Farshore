# FARSHORE: encounter detail pass

The supplied contact sheet remains the visual reference. This pass extends the existing engines and scenes; it does not change the eight-island campaign, save format, or victory requirements.

## Playable additions

- Lotus: three optional laurel relics worth 125 points each. Rescued sailors have their own following sprite. Easy and practice modes trace a walkable route back to the ship.
- Cyclops: optional coins in a safe lane, plus 200-point precision escapes for correctly timed jumps and slides. Sidestepping remains a valid 100-point escape.
- Aeolus: collecting a gate's blessing without touching its rocks earns a perfect-passage bonus. Repairs retain lifetime damage in the performance record.
- Calypso: a bundle rides the center of each current's timbers. Each row rewards only once per crossing. Three driftwood pieces restore a life when reaching a safe shore; materials cannot be farmed by hopping back and forth.
- Scylla: meeting a strike within 12 pixels of the shield center earns 200 points and four units of distance from the vortex. Edge reflections retain their original protection.
- Circe, Sirens, and Ithaca preserve their puzzle, memory, and trajectory rules, with new illustrated potion items, lyre controls, richer arena art, and contextual guidance.

## Interface

All eight encounters receive a live tactical cue and a bonus/controls field guide. Trial selection supports arrow keys, Home, and End without losing focus. The preview includes control keys and expandable bonus rules. Results include illustrated trial friezes, earned medal stars, and performance seals. Canvas texture, torchlight, weather, foliage, character shadows, projectiles, and borders use simulation time so pausing stops them; reduced motion freezes decorative effects.

## Original artwork

Built-in Image Generation mode produced `public/art/farshore/trial-items-v2.png`. The transparent 4×4 atlas supplies sailors, guardians, moly, coins, boulders, crates, beams, sheep, rocks, repairs, wind blessings, raft bundles, and potion pieces. The asset was inspected and copied into the project; the reference screenshot is not served as gameplay.

Final production prompt:

> Use case: stylized-concept. Asset type: transparent 2D arcade game sprite atlas for FARSHORE, a Greek mythology adventure inspired by Homer. Create ONE square sprite atlas in EXACTLY FOUR equal columns and FOUR equal rows, 16 separate objects, one centered object per cell, reading order below. Painted cel-shaded game illustration, crisp silhouettes readable at 32-80 pixels, detailed bronze and stone material, rich navy outlines, gold and cyan highlights, amber torchlight, matching a polished retro Greek arcade adventure. Actual transparent background everywhere around objects, no panels, labels, lettering, grid lines or scenery, generous clear padding within each cell, no objects crossing cell boundaries. Row 1: (1) full-body dazed Greek sailor, curly brown hair, white linen tunic and blue sash, front three-quarter view; (2) full-body Lotus Guardian, purple bark humanoid with pink lotus flower crown, glowing pale eyes, green leaf shoulders, front view; (3) golden-white moly flower with green leaves, magical glow; (4) antique gold coin with laurel and trident engraving, no letters. Row 2: (5) chunky jagged cave boulder with warm reflected light; (6) detailed wooden crate with bronze corner braces; (7) overhead wooden beam supported by two short pillars forming an open arch to slide under, full silhouette; (8) woolly white Greek sheep with curled horns and dark face. Row 3: (9) tall jagged blue sea-rock spire with foamy base; (10) green glowing repair amphora with gold handles; (11) luminous cyan wing-shaped wind blessing, compact silhouette; (12) floating wooden raft of three weathered planks tied with rope, slight top-down view. Row 4: (13) red round potion bottle with gold stopper; (14) elegant green moly leaf; (15) charming pink pig side profile; (16) faceted purple crystal. All objects consistent perspective appropriate to 2D game sprites, without drop-shadow rectangles or backgrounds. This is production game artwork, not a UI mockup.

## Verification

All 134 tests pass, including six new engine tests for one-time collection, precision rewards, untouched gate bonuses, raft repair costs, lifetime-damage accounting, and centered versus edge parries. TypeScript also passes. Browser screenshots are saved with the redesign outputs.
