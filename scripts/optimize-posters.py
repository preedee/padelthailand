#!/usr/bin/env python3
"""
optimize-posters.py — make the downloaded posters cheap to render.

Instagram serves originals as *progressive* JPEGs at 1080px. The wall never draws a tile
wider than about 380px, so those files are ~4x oversized, and ten progressive 1080px
decodes at once is enough to stall a renderer — tiles paint blank until they finish.

This rewrites each poster as a baseline JPEG no wider than DISPLAY_WIDTH. Aspect ratio is
untouched, so nothing is cropped; only pixel dimensions come down. Clicking a tile opens
the real post on Instagram, which is where the full-resolution image belongs.

Idempotent: a poster already at or below the target width in baseline form is left alone.

    python3 scripts/optimize-posters.py [--width 760] [--quality 80]
"""

import argparse
import json
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: python3 -m pip install --user Pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
POSTER_DIR = ROOT / "posters"
MANIFEST = ROOT / "data" / "posters.json"

DISPLAY_WIDTH = 760          # 2x the widest tile the grid ever draws
JPEG_QUALITY = 80


def needs_work(path: pathlib.Path, width: int) -> bool:
    with Image.open(path) as im:
        return im.width > width or im.info.get("progressive") or im.info.get("progression")


def optimize(path: pathlib.Path, width: int, quality: int) -> tuple[int, int]:
    with Image.open(path) as im:
        im = im.convert("RGB")
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(path, "JPEG", quality=quality, optimize=True, progressive=False)
        return im.size


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=DISPLAY_WIDTH)
    ap.add_argument("--quality", type=int, default=JPEG_QUALITY)
    args = ap.parse_args()

    posters = sorted(POSTER_DIR.glob("*.jpg"))
    if not posters:
        sys.exit(f"no posters in {POSTER_DIR}")

    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}

    before = after = converted = 0
    for path in posters:
        size_before = path.stat().st_size
        before += size_before
        if needs_work(path, args.width):
            w, h = optimize(path, args.width, args.quality)
            converted += 1
        else:
            with Image.open(path) as im:
                w, h = im.size
        after += path.stat().st_size

        entry = manifest.setdefault(path.stem, {"file": f"posters/{path.name}"})
        entry["w"], entry["h"] = w, h

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    mb = lambda n: f"{n / 1_048_576:.1f} MB"
    print(f"{converted}/{len(posters)} rewritten · {mb(before)} → {mb(after)}")


if __name__ == "__main__":
    main()
