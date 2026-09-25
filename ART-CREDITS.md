# Farshore art credits

Original generated game assets, made for this project with OpenAI image generation:

- `public/art/title.png`: Mediterranean sea, Greek ship, and distant Ithaca at dusk.
- `public/art/locations.png`: 3 × 2 scenery atlas. Row 1: Cyclops cave, Aeolus' island, Circe's palace. Row 2: Underworld, dangerous straits, Ithaca garden. Scenery is reused for related episodes.
- `public/art/portraits.png`: 5 × 4 character atlas with transparent background, in the row-major order in `src/lib/cast.ts`. Each is an original stylized mythological interpretation. No actor or film images were used.

The atlas is rendered with percentage background positions, avoiding a separate image dependency for every character. Idle motion, entrances, title drift, and text reveal are CSS/React animations. These are not full walking or combat sprite sheets.

Water currents, shore foam, reflections, and the captain's brows, blink, and speaking mouth are original SVG/CSS overlays on the existing artwork. Character reactions are authored from the encounter and decision, rather than acoustic emotion detection or phoneme-level lip sync.

Press Start 2P by CodeMan38 is bundled under the SIL Open Font License. See `public/fonts/OFL.txt`. Source: https://github.com/google/fonts/tree/main/ofl/pressstart2p.

The original version used a moonlit image from the supplied presentation. The laptop edition uses the new pixel assets listed above.

## Music and sound

The four voyage themes and matching cues are original procedural compositions for Farshore, defined in `src/lib/voyage-audio.ts`. Plucked and flute-like synthesized voices, bass, a soft drum, and filtered sea noise are generated locally with Web Audio. No external recordings, samples, or third-party music are bundled. Scene changes crossfade between themes.
