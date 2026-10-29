# FARSHORE — Eight Trials. One Journey Home.

FARSHORE is the product name. Homer's *The Odyssey* is its story inspiration. This applies to the splash, main menu, loading screens, browser metadata, offline title, and current documentation. Internal `odyssey` filenames remain compatible with existing code and saves.

The supplied `farshore-style-reference.png` is the primary style reference: illustrated Greek adventure art, cobalt seas, amber torchlight, engraved gold typography, bronze frames, parchment trial ribbons, and a compact arcade HUD. The reference contact sheet is not served as an interface or gameplay background.

The interface uses responsive HTML, CSS, SVG, and the existing canvas renderers. Eight illustrated trial cards show real selection, locks, records, medals, and difficulty choices. The connected voyage map remains an alternate view. Pause, results, settings, help, and credits share the same frame styling. Reduced motion disables decorative animation. The reference's rhythm track and Ithaca board do not replace the existing melody-memory and trajectory-archery rules.

## Original assets and final prompt set

All three assets were produced with the built-in Image Generation tool, visually inspected, and copied into `public/art/farshore/`. Earlier artwork remains available to the preserved modes. These are original scene illustrations and transparent sprites, with all controls and game behavior implemented separately.

| Saved asset | Production prompt |
| --- | --- |
| `homeward-sea.png` | Create one clean widescreen moonlit Greek adventure illustration, using the supplied contact sheet as a style reference only. Polished painted/cel-shaded 2D art, navy/cobalt night, cyan sea, amber torchlight. Dark curly-haired, bearded Odysseus wears bronze armor, cream tunic, dark red cape, and leather sandals on the left shore. An ochre-sailed Greek ship and cliffside temple occupy the right, with storm clouds and a large moon above. Leave calm dark blue space centrally for real HTML controls. No text, logo, interface, borders, or watermark. |
| `trials-and-cast.png` | Create a square atlas in exactly four equal columns and three rows. Reading order: glowing lotus in a Greek garden maze; one-eyed Polyphemus in a torchlit cave; ship beneath Aeolus's winds; dark-haired Circe in purple with a potion; violet-lit Siren on moonlit rocks; blue six-headed sea monster and whirlpool; raft platforms in a lightning storm; golden Ithacan palace with twelve axe rings. Final row: matching close-up portraits of Odysseus, Circe, Siren, and Polyphemus. Uniform illustrated style and character identities, no lettering, labels, frames, UI, or watermark. |
| `odysseus-and-ship.png` | Create a new square transparent sprite atlas in exactly two columns and two rows. Match the cast atlas's Odysseus: olive skin, dark curly hair, short full beard, bronze cuirass, cream tunic, dark red cape. Reading order: full-body three-quarter front hero with shield; running back view; archer aiming right; Greek wooden ship with ochre sail, red stripe, curled prow, and oars. Readable small-scale silhouettes, transparent padding, no scenery, text, panels, or watermark. |

`farshore-art.tsx` supplies the shared logo, torch SVGs, portrait styling, and atlas positioning. `farshore-hud.tsx` presents relevant engine state. `farshore-rendering.ts` draws original artwork inside the existing canvas scenes; collision geometry and simulation remain owned by the original engines.

The online shell uses Next.js's documented dynamic component loader so each mode's CSS arrives with its component. This also preserves lazy loading of the earlier mystery and advice modes.

## Verification

- All 134 regression tests pass, covering encounter engines, optional skill rewards, progression, saves, account isolation, and AI adapters.
- Next.js production build and the Vite offline build pass. The offline bundle retains its existing size advisory.
- Browser review at desktop size and 390 × 844 verified the splash, menu, trial selector, difficulty choices, game HUD, touch movement, Escape pause, resume countdown, and confirmation before leaving an attempt. Practice did not unlock the next trial or alter campaign records.
- Screenshots are saved in `screenshots/farshore-redesign/`. The supplied reference remains a design reference, separate from the original production artwork.

The [encounter detail pass](FARSHORE-DETAIL-PASS.md) documents the added game rewards, tactical cues, richer arena rendering, transparent item atlas, and its production prompt.
