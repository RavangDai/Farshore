"""Crop close-ups of the AI states from the Phase 3 frame images, for the slides.

Usage: python scripts/coursework/phase3-slide-images.py   (needs Pillow)
Reads phase3/frames/img/<id>.jpg (desktop captures, 1440 x 900) and writes phase3/slides/img/<name>.png.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PHASE = ROOT / "docs/coursework/docs/assignment/phase3"
OUT = PHASE / "slides/img"
OUT.mkdir(parents=True, exist_ok=True)

# name: (frame id, (left, top, right, bottom) in screenshot pixels)
CROPS = {
    "state-empty": ("D23", (1096, 196, 1424, 418)),
    "state-loading": ("D25", (822, 384, 1306, 545)),
    "state-success": ("D07", (822, 648, 1306, 900)),
    "state-uncertain": ("D22", (822, 252, 1306, 534)),
    "state-error": ("D09", (822, 524, 1306, 672)),
    "control-undo": ("D24", (822, 280, 1306, 668)),
}
for name, (frame, box) in CROPS.items():
    img = Image.open(PHASE / "frames/img" / f"{frame}.jpg").convert("RGB").crop(box)
    img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    img.save(OUT / f"{name}.png", optimize=True)
    print(name, frame, img.size)
