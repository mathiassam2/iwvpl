"""Phase 3 polish v2: transparent club crests + logo, with anti-fringe cleanup.

Reads pristine files from public/assets/originals so the pass is repeatable.
"""
import os, sys, io, json
from PIL import Image, ImageDraw, ImageFilter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "public", "assets")
BRAND = os.path.join(ASSETS, "brand")
CLUBS = os.path.join(ASSETS, "clubs")
ORIG = os.path.join(ASSETS, "originals")
MARKER = (255, 0, 255)


def flood_mark(src: Image.Image, thresh: int) -> set:
    """Pixel coords of corner-connected background."""
    work = src.copy()
    w, h = work.size
    pts = []
    for x in (0, w // 2, w - 1):
        for y in (0, h // 2, h - 1):
            pts.append((x, y))
    for seed in pts:
        if work.getpixel(seed) != MARKER:
            ImageDraw.floodfill(work, seed, MARKER, thresh=thresh)
    # edge sweep catches white bands that hide the corners
    for x in range(w):
        for seed in ((x, 0), (x, h - 1)):
            ImageDraw.floodfill(work, seed, MARKER, thresh=thresh)
    for y in range(h):
        for seed in ((0, y), (w - 1, y)):
            ImageDraw.floodfill(work, seed, MARKER, thresh=thresh)
    return work


def make_transparent(path_or_im, thresh=42, fringe=2, invert=False, white_cut=236):
    src = Image.open(path_or_im).convert("RGB") if isinstance(path_or_im, str) else path_or_im
    w, h = src.size
    work = flood_mark(src, thresh)
    spx, cpx = src.load(), work.load()

    alpha = Image.new("L", (w, h), 255)
    apx = alpha.load()
    for y in range(h):
        for x in range(w):
            if cpx[x, y] == MARKER:
                apx[x, y] = 0

    # --- anti-fringe: extend transparency `fringe` px into near-white residue ---
    if fringe:
        grown = alpha.filter(ImageFilter.MaxFilter(fringe * 2 + 1))
        gpx = grown.load()
        for y in range(h):
            for x in range(w):
                if apx[x, y] and gpx[x, y] < 255:
                    r, g, b = spx[x, y]
                    # only where the pixel is pale (leftover matte) or already fading
                    if r >= white_cut - fringe * 4 and g >= white_cut - fringe * 4 and b >= white_cut - fringe * 4:
                        apx[x, y] = 0

    im = src.convert("RGBA")
    im.putalpha(alpha)

    if invert:
        r, g, b, a = im.split()
        r, g, b = (c.point(lambda v: 255 - v) for c in (r, g, b))
        im = Image.merge("RGBA", (r, g, b, a))
    return im


# ---------------- logo ----------------
logo_src = os.path.join(ORIG, "untitled.webp")
if os.path.exists(logo_src):
    im = make_transparent(logo_src, thresh=46, fringe=3, invert=True)
    im.save(os.path.join(BRAND, "iwvpl-logo.png"), "PNG", optimize=True)
    mark = im.crop(im.split()[3].getbbox())
    mark.save(os.path.join(BRAND, "iwvpl-mark.png"), "PNG", optimize=True)
    print(f"  iwvpl-logo.png {im.size}   iwvpl-mark.png {mark.size}")

# ---------------- club crests ----------------
recs = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    "raw", "asset_records.json"), encoding="utf-8"))
names = {r["name"] for r in recs if r["bucket"] == "clubs"}
# plus the supplement-downloaded ones
names |= {os.path.splitext(f)[0] for f in os.listdir(CLUBS) if f.endswith(".png")}

made = 0
for name in sorted(names):
    src = None
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".avif"):
        cand = os.path.join(ORIG, name + ext)
        if os.path.exists(cand):
            src = cand
            break
    if not src:
        print(f"  !! no original for {name}")
        continue
    im = make_transparent(src, thresh=42, fringe=2)
    out = os.path.join(CLUBS, name + ".png")
    im.save(out, "PNG", optimize=True)
    made += 1

# drop stale webp crests
for f in os.listdir(CLUBS):
    if f.endswith(".webp"):
        os.remove(os.path.join(CLUBS, f))

print(f"  {made} club crests -> transparent PNG")
print(f"  clubs dir: {len(os.listdir(CLUBS))} files")