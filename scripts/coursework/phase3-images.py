"""Copy the captures named in phase3/editable/frames.json to phase3/frames/img/<id>.jpg for the PDF.

Usage: python scripts/coursework/phase3-images.py <captures-dir>   (needs Pillow)
JPEG keeps the printed document small; the SVG frames for Figma keep the original PNGs.
"""
import json, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PHASE = ROOT / "docs/coursework/docs/assignment/phase3"
captures = Path(sys.argv[1])
spec = json.loads((PHASE / "editable/frames.json").read_text(encoding="utf-8"))
out = PHASE / "frames/img"
out.mkdir(parents=True, exist_ok=True)
count = 0
for frame in spec["frames"]:
    src = captures / frame["capture"]
    if not src.exists():
        print("missing", frame["capture"])
        continue
    img = Image.open(src).convert("RGB")
    width = 390 * 2 if frame["device"] == "phone" else 1440
    if img.width != width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(out / f"{frame['id']}.jpg", "JPEG", quality=84, optimize=True, progressive=True)
    count += 1
print(f"wrote {count} images")
