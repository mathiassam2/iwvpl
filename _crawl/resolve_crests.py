"""Resolve every club crest to a local file. Downloads anything still unresolved."""
import json, os, re, io, sys, html, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFilter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = f"{HERE}/raw"
CLUBS = f"{ROOT}/public/assets/clubs"
os.makedirs(CLUBS, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

data = json.load(open(f"{RAW}/league_data.json", encoding="utf-8"))
recs = json.load(open(f"{RAW}/asset_records.json", encoding="utf-8"))
prev = json.load(open(f"{RAW}/logo_supplement.json", encoding="utf-8"))


def slug(s):
    s = urllib.parse.unquote(s or "")
    s = re.sub(r"[%][0-9a-fA-F]{2}", " ", s)
    return re.sub(r"-{2,}", "-", re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower())


def stem(u):
    b = os.path.basename(urllib.parse.urlparse(u).path)
    b = re.sub(r"\.(png|jpe?g|webp|avif|gif|svg)$", "", b, flags=re.I)
    b = re.sub(r"-\d{2,4}x\d{2,4}$", "", b)
    return b.lower()


by_path = {urllib.parse.urlparse(r["source"]).path: r for r in recs}
by_stem = {}
for r in recs:
    by_stem.setdefault(stem(r["source"]), r)

# current on-disk crest files (already processed to transparent PNG)
on_disk = {os.path.splitext(f)[0]: f"/assets/clubs/{f}" for f in os.listdir(CLUBS)}


def get(u, tries=2):
    for i in range(tries):
        try:
            with urllib.request.urlopen(
                urllib.request.Request(u, headers={"User-Agent": UA}), timeout=40
            ) as r:
                return r.read()
        except Exception:
            if i == tries - 1:
                return None
    return None


def to_transparent_png(raw, name):
    src = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = src.size
    work = src.copy()
    MARKER = (255, 0, 255)
    for seed in [(x, y) for x in (0, w // 2, w - 1) for y in (0, h // 2, h - 1)]:
        if work.getpixel(seed) != MARKER:
            ImageDraw.floodfill(work, seed, MARKER, thresh=42)
    for x in range(w):
        for seed in ((x, 0), (x, h - 1)):
            ImageDraw.floodfill(work, seed, MARKER, thresh=42)
    for y in range(h):
        for seed in ((0, y), (w - 1, y)):
            ImageDraw.floodfill(work, seed, MARKER, thresh=42)
    alpha = Image.new("L", (w, h), 255)
    apx, cpx = alpha.load(), work.load()
    for y in range(h):
        for x in range(w):
            if cpx[x, y] == MARKER:
                apx[x, y] = 0
    grown = alpha.filter(ImageFilter.MaxFilter(5)).load()
    spx = src.load()
    for y in range(h):
        for x in range(w):
            if apx[x, y] and grown[x, y] < 255:
                r, g, b = spx[x, y]
                if r >= 228 and g >= 228 and b >= 228:
                    apx[x, y] = 0
    im = src.convert("RGBA")
    im.putalpha(alpha)
    if im.width > 512:
        im = im.resize((512, round(im.height * 512 / im.width)), Image.LANCZOS)
    path = f"{CLUBS}/{name}.png"
    im.save(path, "PNG", optimize=True)
    return f"/assets/clubs/{name}.png"


# ---- collect every remote crest url, keyed by club name ----
wanted = {}
for c in data["clubs"]:
    if c.get("logo") and not c["logo"].startswith("data:"):
        wanted[c["name"]] = c["logo"]
for m in data["results"]:
    for side in ("home", "away"):
        u = m.get(f"{side}_logo", "")
        if u and not u.startswith("data:"):
            wanted.setdefault(m[side], u)

resolved, todo = {}, []
for name, url in wanted.items():
    if url in prev:
        resolved[url] = prev[url]
        continue
    p = urllib.parse.urlparse(url).path
    if p in by_path:
        f = by_path[p]["file"].replace(".webp", ".png")
        resolved[url] = f
        continue
    s = stem(url)
    if s in by_stem:
        resolved[url] = by_stem[s]["file"].replace(".webp", ".png")
        continue
    todo.append((name, url))

print(f"crest urls: {len(wanted)} | resolved from library: {len(resolved)} | need download: {len(todo)}")


def work(item):
    name, url = item
    for cand in (url, re.sub(r"-\d{2,4}x\d{2,4}(\.\w+)$", r"\1", url)):
        raw = get(cand)
        if not raw:
            continue
        fn = slug(name) or slug(stem(url))
        try:
            return (url, to_transparent_png(raw, fn), cand)
        except Exception as e:
            print(f"  !! {name}: {e}")
    return (url, None, None)


with ThreadPoolExecutor(max_workers=8) as ex:
    for url, local, used in ex.map(work, todo):
        if local:
            resolved[url] = local
            print(f"  {local}  <- {used.rsplit('/', 1)[-1]}")

json.dump(resolved, open(f"{RAW}/logo_supplement.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# report
names = sorted({v.split("/")[-1] for v in resolved.values()})
missing = [n for n, u in wanted.items() if u not in resolved]
print(f"\nresolved: {len(resolved)} unique urls -> {len(names)} distinct crest files")
print(f"unresolved clubs ({len(missing)}): {missing}")