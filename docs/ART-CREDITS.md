# FARSHORE art credits

## Illustrated arcade edition

The 2026 illustrated FARSHORE assets are original images generated with the built-in Image Generation tool using the user-provided FARSHORE UI concept as a style reference. `public/art/farshore/` contains the moonlit sea backdrop, eight-trial/four-character atlas, and transparent Odysseus/ship sprites. Saved paths and the production prompt set are documented in [FARSHORE-VISUAL-DESIGN.md](FARSHORE-VISUAL-DESIGN.md). The reference screenshot is not used as the interface.

## Voyage map

The Mediterranean chart uses Natural Earth’s public-domain [1:50m land polygons](https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-land/), clipped and simplified into `src/lib/story/map-land.ts`. See the [terms of use](https://www.naturalearthdata.com/about/terms-of-use/). The chart styling, labels, markers, and route lines were made for Farshore. Coordinates for legendary locations are illustrative, not evidence of their historical position. Oceanus is shown symbolically. The coastline is modern and is not a Bronze Age reconstruction.

Original generated game assets, made for this project with OpenAI image generation:

- `public/art/title.png`: Mediterranean sea, Greek ship, and distant Ithaca at dusk.
- `public/art/locations.png`: 3 × 2 scenery atlas. Row 1: Cyclops cave, Aeolus' island, Circe's palace. Row 2: Underworld, dangerous straits, Ithaca garden. Scenery is reused for related episodes.
- `public/art/portraits.png`: 5 × 4 character atlas with transparent background, in the row-major order in `src/lib/story/cast.ts`. Each is an original stylized mythological interpretation. No actor or film images were used.

The atlas is rendered with percentage background positions, avoiding a separate image dependency for every character. Idle motion, entrances, title drift, and text reveal are CSS/React animations. These are not full walking or combat sprite sheets.

Water currents, shore foam, reflections, and the captain's brows, blink, and speaking mouth are original SVG/CSS overlays on the existing artwork. Character reactions are authored from the encounter and decision, rather than acoustic emotion detection or phoneme-level lip sync.

Press Start 2P by CodeMan38 is bundled under the SIL Open Font License. See `public/fonts/OFL.txt`. Source: https://github.com/google/fonts/tree/main/ofl/pressstart2p.

The original version used a moonlit image from the supplied presentation. The laptop edition uses the new pixel assets listed above.

The mystery case uses `public/art/mystery-rooms.png`, a three-scene backdrop atlas for the entrance hall, workshop, and harbor gate. It reuses the existing character portraits. The room objects, mechanisms, and their placement are game fiction.

## Mystery room generation record

Generated October 1, 2026 with the built-in OpenAI image generation tool, image_gen__imagegen. The final asset is [public/art/mystery-rooms.png](../public/art/mystery-rooms.png). The original generated file was exec-dd57b359-81e0-413e-80a5-cd65e311cdd0.png in the 01a0f88f-760f-78f2-bc74-d47909f73357 generated-images directory. It was copied into the project without editing. The atlas has three vertically stacked scenes.

Prompt:

> Create a pixel-art game background atlas for Farshore, an Odyssey mystery escape game. EXACT layout: three equal-width, equal-height 16:9 landscape room scenes STACKED VERTICALLY, no borders or gaps between the panels; entire image portrait aspect ratio about 16:27. Match rich detailed SNES adventure pixel art: crisp visible square pixels, deep midnight navy shadows, warm amber lamps, teal sea, weathered cream Greek stone, restrained purple magic. No text, letters, UI, labels, characters or people. TOP panel: Circe's palace entrance hall at night, symmetrical columns, a broken circular seal on a low pedestal near the left foreground, a carved stone inscription on the right wall, a closed bronze workshop door in the center back wall, small ship's red cord beside pedestal. MIDDLE panel: cozy ancient alchemical workshop, amber lighting, central broad wooden workbench with three separate pale stone seal fragments bearing abstract sun, wave, moon emblems, carving on left wall, wooden drawers and blue bottles on right, ivy. BOTTOM panel: atmospheric harbor gate at blue dawn, Greek stone terrace, central closed bronze gate with circular socket, turning lever to left, a small rolled scroll on right near a lantern, ocean and an ancient Greek sailing ship visible beyond. Each scene composed as readable side-on point-and-click adventure room, wide shot, with distinct foreground interaction objects, consistent art style across all three panels. Beautiful cinematic lighting rendered with pixel clusters, no smooth painted gradients.

## Arcade scenes

The October 8 arcade revision drew its encounters as original code-native SVG scenes: Polyphemus and his throwing arm, projectile arcs, a detailed galley and rowing crew, Sirens and song waves, and an Ithaca hall with twelve axes, a bow, sight, and flying arrows. No raster assets or third-party sprites were downloaded for them. They were retired on October 28, 2026, once every encounter had moved to the current stage renderers.

## Detailed encounter items

The October 19 encounter detail pass adds the original transparent sprite atlas `public/art/farshore/trial-items-v2.png`, produced with the built-in Image Generation tool. Its full prompt, contents, and engine integration are recorded in [FARSHORE-DETAIL-PASS.md](FARSHORE-DETAIL-PASS.md).

## Music and sound

The four voyage themes are original procedural compositions for Farshore, defined in `src/lib/audio/voyage-audio.ts`. Scene changes crossfade between themes.

Every sound effect and ambience is original and rendered in code (`src/lib/audio/sounds.ts`), from physical models rather than recordings: plucked strings built from their partials for the lyre, struck bronze, stone, wood and glass bodies, glottal-pulse throats for Polyphemus, a sung vowel ensemble for the Sirens, scattered grains for gravel, rain and fire, and shaped noise for wind, surf and thunder. Reverbs are generated impulse responses. No external recordings, samples, or third-party music are bundled. During development an AudioSet classifier (Xenova/ast-finetuned-audioset-10-10-0.4593) was used only as a listening check, to confirm that each sound is heard as what it represents; it is not part of the game.

## Voices

Spoken lines use [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad (Apache-2.0), in the [ONNX export](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) published by onnx-community, run with [kokoro-js](https://github.com/hexgrad/kokoro) (Apache-2.0) and [Transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0). Text is converted to phonemes by eSpeak NG (GPL-3.0) through the `phonemizer` package. The model is downloaded on first use and is not stored in this repository. When it is unavailable, the browser's own speech voices read the lines.
