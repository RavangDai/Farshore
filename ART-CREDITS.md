# Farshore art credits

## Voyage map

The Mediterranean chart uses Natural Earth’s public-domain [1:50m land polygons](https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-land/), clipped and simplified into `src/lib/map-land.ts`. See the [terms of use](https://www.naturalearthdata.com/about/terms-of-use/). The chart styling, labels, markers, and route lines were made for Farshore. Coordinates for legendary locations are illustrative, not evidence of their historical position. Oceanus is shown symbolically. The coastline is modern and is not a Bronze Age reconstruction.

Original generated game assets, made for this project with OpenAI image generation:

- `public/art/title.png`: Mediterranean sea, Greek ship, and distant Ithaca at dusk.
- `public/art/locations.png`: 3 × 2 scenery atlas. Row 1: Cyclops cave, Aeolus' island, Circe's palace. Row 2: Underworld, dangerous straits, Ithaca garden. Scenery is reused for related episodes.
- `public/art/portraits.png`: 5 × 4 character atlas with transparent background, in the row-major order in `src/lib/cast.ts`. Each is an original stylized mythological interpretation. No actor or film images were used.

The atlas is rendered with percentage background positions, avoiding a separate image dependency for every character. Idle motion, entrances, title drift, and text reveal are CSS/React animations. These are not full walking or combat sprite sheets.

Water currents, shore foam, reflections, and the captain's brows, blink, and speaking mouth are original SVG/CSS overlays on the existing artwork. Character reactions are authored from the encounter and decision, rather than acoustic emotion detection or phoneme-level lip sync.

Press Start 2P by CodeMan38 is bundled under the SIL Open Font License. See `public/fonts/OFL.txt`. Source: https://github.com/google/fonts/tree/main/ofl/pressstart2p.

The original version used a moonlit image from the supplied presentation. The laptop edition uses the new pixel assets listed above.

The mystery case uses `public/art/mystery-rooms.png`, a three-scene backdrop atlas for the entrance hall, workshop, and harbor gate. It reuses the existing character portraits. The room objects, mechanisms, and their placement are game fiction.

## Mystery room generation record

Generated October 1, 2026 with the built-in OpenAI image generation tool, image_gen__imagegen. The final asset is [public/art/mystery-rooms.png](public/art/mystery-rooms.png). The original generated file was exec-dd57b359-81e0-413e-80a5-cd65e311cdd0.png in the 01a0f88f-760f-78f2-bc74-d47909f73357 generated-images directory. It was copied into the project without editing. The atlas has three vertically stacked scenes.

Prompt:

> Create a pixel-art game background atlas for Farshore, an Odyssey mystery escape game. EXACT layout: three equal-width, equal-height 16:9 landscape room scenes STACKED VERTICALLY, no borders or gaps between the panels; entire image portrait aspect ratio about 16:27. Match rich detailed SNES adventure pixel art: crisp visible square pixels, deep midnight navy shadows, warm amber lamps, teal sea, weathered cream Greek stone, restrained purple magic. No text, letters, UI, labels, characters or people. TOP panel: Circe's palace entrance hall at night, symmetrical columns, a broken circular seal on a low pedestal near the left foreground, a carved stone inscription on the right wall, a closed bronze workshop door in the center back wall, small ship's red cord beside pedestal. MIDDLE panel: cozy ancient alchemical workshop, amber lighting, central broad wooden workbench with three separate pale stone seal fragments bearing abstract sun, wave, moon emblems, carving on left wall, wooden drawers and blue bottles on right, ivy. BOTTOM panel: atmospheric harbor gate at blue dawn, Greek stone terrace, central closed bronze gate with circular socket, turning lever to left, a small rolled scroll on right near a lantern, ocean and an ancient Greek sailing ship visible beyond. Each scene composed as readable side-on point-and-click adventure room, wide shot, with distinct foreground interaction objects, consistent art style across all three panels. Beautiful cinematic lighting rendered with pixel clusters, no smooth painted gradients.

## Music and sound

The four voyage themes and matching cues are original procedural compositions for Farshore, defined in `src/lib/voyage-audio.ts`. Plucked and flute-like synthesized voices, bass, a soft drum, and filtered sea noise are generated locally with Web Audio. No external recordings, samples, or third-party music are bundled. Scene changes crossfade between themes.
