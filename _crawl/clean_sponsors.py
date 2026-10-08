"""Normalise the sponsor logos.

Both upstream PNGs already carry a real alpha channel. The earlier pass
flattened them onto white and re-matted the result, which destroyed
"We Made Supply" (a solid black zigzag mark + wordmark) and left it 99.5%
transparent. This script keeps genuine alpha, and only falls back to
de-matting when an image really is opaque.
"""

import sys
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0"}
OUT_DIR = ROOT / "public" / "assets" / "sponsors"
MAX_DIM = 420

SPONSORS = [
    ("2026/08/Untitled-1.png", "spintrillz-renovation.png"),
    ("2026/08/Untitled-12.png", "we-made-supply.png"),
]

MARKER = (255, 0, 255)


def fetch(remote: str) -> Image.Image:
    url = "https://www.iwvpl.asia/wp-content/uploads/" + remote
    raw = urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=60
    ).read()
    return Image.open(BytesIO(raw))


def alpha_stats(im: Image.Image) -> tuple[int, int, int]:
    a = im.split()[3].histogram()
    total = im.width * im.height
    return a[255], a[0], total - a[255] - a[0]


def dematte(img: Image.Image) -> Image.Image:
    """Fallback for genuinely opaque artwork: remove a flat matte, border-only."""
    from PIL import ImageDraw

    w, h = img.size
    work = img.convert("RGB").copy()

    def fill(seed):
        px = work.getpixel(seed)
        if px != MARKER and min(px[:3]) >= 255 - 42:
            ImageDraw.floodfill(work, seed, MARKER, thresh=42)

    for x in range(w):
        fill((x, 0))
        fill((x, h - 1))
    for y in range(h):
        fill((0, y))
        fill((w - 1, y))

    alpha = Image.new("L", (w, h), 255)
    ap, cp = alpha.load(), work.load()
    for y in range(h):
        for x in range(w):
            if cp[x, y] == MARKER:
                ap[x, y] = 0

    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for remote, name in SPONSORS:
        src = fetch(remote)
        opaque, clear, partial = alpha_stats(src)

        if clear > src.width * src.height * 0.05 or partial > 0:
            im = src.convert("RGBA")
            mode = "kept source alpha"
        else:
            im = dematte(src)
            mode = "de-matted (source was opaque)"

        bbox = im.split()[3].getbbox()
        if bbox:
            pad = 4
            w, h = im.size
            im = im.crop(
                (
                    max(0, bbox[0] - pad),
                    max(0, bbox[1] - pad),
                    min(w, bbox[2] + pad),
                    min(h, bbox[3] + pad),
                )
            )

        if max(im.size) > MAX_DIM:
            im.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)

        dest = OUT_DIR / name
        im.save(dest, "PNG", optimize=True)

        o, c, p = alpha_stats(im)
        total = im.width * im.height
        print(
            f"{name:32s} {im.width}x{im.height}  {mode}\n"
            f"{'':32s} opaque {100*o/total:5.1f}%  clear {100*c/total:5.1f}%  "
            f"edge {100*p/total:4.1f}%  {dest.stat().st_size//1024}KB"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
