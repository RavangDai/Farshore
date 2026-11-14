// Where the art lives. Menus, cinematics and overlays use the pixel sheets made
// by scripts/pixelate-art.mjs from the painted originals, in one shared
// palette. Gameplay canvases keep the painted originals.
export const ART = {
  px: {
    /** 4x3 tiles of 120x160: the eight trial scenes, then four portraits (same layout as the painted atlas). */
    trials: "/art/farshore/px/trials.png",
    /** 5x4 portraits of 48x48, in the legacy portrait numbering (0 Odysseus, 3 Penelope, 4 Telemachus...). */
    cast: "/art/farshore/px/cast.png",
    /** 480x270: Odysseus on the cliff above the night sea. */
    sea: "/art/farshore/px/sea.png",
    /** 2x2 sprites of 128x128: stand, leap, archer, ship. */
    sprites: "/art/farshore/px/sprites.png",
  },
  hd: {
    trials: "/art/farshore/trials-and-cast.png",
    sprites: "/art/farshore/odysseus-and-ship.png",
    items: "/art/farshore/trial-items-v2.png",
    sea: "/art/farshore/homeward-sea.png",
  },
} as const;

/** Background position of a portrait in the 5x4 cast sheet. */
export const castPosition = (tile: number) => `${(tile % 5) * 25}% ${Math.floor(tile / 5) * (100 / 3)}%`;
