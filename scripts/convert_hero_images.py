"""One-off: convert the new hero JPEGs to WebP.

The three source files are 2752x1536 JPEGs at 3.9-4.6 MB each - about 13 MB for
three hero slides, which the browser would download before the hero renders.
WebP at a sensible width cuts that by roughly an order of magnitude.
"""
import os
from PIL import Image

# Repo root, one level up from scripts/.
SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "assets", "hero")
PAIRS = [("sg hero.jpeg", "sg-hero.webp"), ("in hero.jpeg", "in-hero.webp"), ("my hero.jpeg", "my-hero.webp")]
MAX_W = 2560
QUALITY = 82

for src_name, dst_name in PAIRS:
    src = os.path.join(SRC, src_name)
    dst = os.path.join(SRC, dst_name)
    with Image.open(src) as im:
        before = im.size
        if im.mode != "RGB":
            im = im.convert("RGB")
        if im.width > MAX_W:
            h = round(im.height * MAX_W / im.width)
            im = im.resize((MAX_W, h), Image.LANCZOS)
        im.save(dst, "WEBP", quality=QUALITY, method=6)
    after_kb = os.path.getsize(dst) / 1024
    before_kb = os.path.getsize(src) / 1024
    print(f"{src_name}: {before[0]}x{before[1]} {before_kb:.0f} KB -> {dst_name} {im.size[0]}x{im.size[1]} {after_kb:.0f} KB")