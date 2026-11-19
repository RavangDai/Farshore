# FARSHORE cinematic asset pack

Production artwork and UI references for the eight-trial Greek mythological browser game. All full-screen artwork is 1672 × 941 PNG; it contains no baked-in interface or text. The two reference screenshots are examples, not backgrounds.

## Contents

- `environments/`: main menu, eight trial landscapes, and alternate golden sunrise Lotus-Eaters briefing.
- `map/voyage-map.png`: full cinematic atlas with all eight island landmarks.
- `map/map-layout.json`: normalized interactive checkpoint anchor coordinates and metadata.
- `map/route.svg`: optional sample glowing sea route, aligned to the map's artwork.
- `ui/markers/`: scalable bronze-glass available, current, completed and locked checkpoint badges.
- `ui/glass.css`: reusable glass panels, bronze-glass buttons, map stage and checkpoint styles.
- `references/`: rendered glass voyage map and trial-entry visual references.

## Implementation prompt for Claude

Integrate this asset pack into my existing FARSHORE application. These are the actual production backgrounds and assets. Do not replace them with artwork from the old game or use primitive 3D geometry instead.

Copy the environments, map and marker artwork into the app's public asset directory. Use each image as its corresponding widescreen hero, chapter art, briefing scene, and card image. Set a sensible crop towards the focal subject on the right for portrait cards. Lazy-load trial backgrounds and use an optimized WebP derivative if necessary, retaining these original PNGs. Preserve the original sharpness and artwork.

### Interactive voyage map

Place the new voyage-map.png into an exact 1672:941 aspect-ratio stage. Use map-layout.json for the marker coordinates relative to the image. Keep the SVG route, marker buttons and any camera zoom/pan applied inside that same stage; do not stretch its width and height independently or use a cover crop that breaks marker alignment.

Render checkpoint buttons as actual interactive elements, not baked-in text. Use the available, current, completed and locked SVG assets based on the user's actual progress. Add the trial number as a real HTML layer only for available/current markers; the completed version contains a checkmark and the locked version contains a lock. Use a small accessible number label for all states. Follow current app rules for whether locked trials may be previewed or entered. Do not invent completion data. Keep the route behind the markers. Use the reference screenshot as the design target for a compact floating glass trial panel, progress indicator, navigation, and controls.

### Glass interface

Adapt ui/glass.css to the project's existing design system and import the fonts or self-host them through the existing setup. Follow the glass reference images: smoked translucent navy/charcoal, localized backdrop blur, thin bronze edges, restrained shine, subtle shadows, readable warm ivory text and rounded corners in moderation. Use glass for compact panels, toggles, and selected buttons. Never put a full-screen blur over important environment art during normal navigation.

Use Cinzel for display typography, Inter for readable controls, and an optional Cormorant Garamond for short lore excerpts. Avoid oversized headings, excessive tracking, long text, and flat gold hexagonal buttons.

### Motion and AI

Add atmospheric effects behind the controls: gentle camera drift, floating petals, torch flicker, ocean shimmer, and environment-specific particles. Keep scene art sharp and move independent layers where practical. Respect reduced motion and provide a lightweight fallback. Do not require an external language model for real-time rendering or game controls. Preserve every existing trained model, opponent mode, gameplay mechanic, saved voyage, account feature and Oracle interaction. Actual connection and progress state must drive all AI and completion indicators.

### Verification

After each screen, run the app and capture a screenshot. Compare the rendered application to the included references, focusing on environment fidelity, hierarchy, glass quality, marker alignment and legibility. Prioritize visual correctness before advancing to the next screen. Preserve gameplay and test routes, keyboard input, progress, all AI modes, responsive layouts and reduced motion.

