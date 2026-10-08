"""Phase 1g: top up club/player logos referenced by site_data but not yet local."""
import json, os, re, io, sys, html, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
RAW = f"{HERE}/raw"
DATA = f"{PROJECT}/src/data/site_data.json"
CLUBS = f"{PROJECT}/public/assets/clubs"
PLAYERS = f"{PROJECT}/public/assets/players"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

data = json.load(open(DATA, encoding="utf-8"))


def slug(s):
    s = urllib.parse.unquote(s or "")
    s = re.sub(r"[%][0-9a-fA-F]{2}", " ", s)
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-{2,}", "-", s)


def get(u, tries=2):
    for i in range(tries):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception:
            if i == tries - 1:
                return None
    return None


def to_webp(raw, max_w=512):
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
        im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
        if im.width > max_w:
            im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
        b = io.BytesIO()
        im.save(b, "WEBP", quality=88, method=6)
        return b.getvalue()
    except Exception:
        return None


# strip WP size suffix to get the pristine original
def original_url(remote):
    p = urllib.parse.urlparse(remote)
    b = os.path.basename(p.path)
    ext = ".png" if b.lower().endswith(".png") else ".webp"
    stem = re.sub(r"-\d{2,4}x\d{2,4}$", "", re.sub(r"\.(png|jpe?g|webp)$", "", b, flags=re.I))
    return f"{p.scheme}://{p.netloc}{p.path.rsplit('/', 1)[0]}/{stem}{ext}"


jobs = []
seen = set()
for c in data["clubs"]:
    if not c.get("logo"):
        continue
    if c["logoLocal"].endswith("club-placeholder.svg"):
        jobs.append((c["name"], c["logo"], CLUBS))

for m in data["results"]:
    for side in ("home", "away"):
        name, remote = m[side], m.get(f"{side}_logo", "")
        if remote and m[f"{side}Logo"].endswith("club-placeholder.svg"):
            jobs.append((name, remote, CLUBS))

for b in data["leaderboards"]:
    for r in b["rows"]:
        if r.get("team_logo") and r["avatarLocal"].endswith("avatar-placeholder.svg"):
            jobs.append((r["team"] or r["name"], r["team_logo"], PLAYERS))

# de-dupe by remote url
uniq = {}
for name, remote, dest in jobs:
    uniq.setdefault(remote, (name, dest))
print(f"missing-logo jobs: {len(uniq)}")


def work(item):
    remote, (name, dest) = item
    for candidate in (original_url(remote), remote):
        raw = get(candidate)
        if not raw:
            continue
        wb = to_webp(raw, 512 if dest == CLUBS else 384)
        if not wb:
            continue
        fn = slug(name) or "asset"
        path = f"{dest}/{fn}.webp"
        n = 1
        while os.path.exists(path) and open(path, "rb").read() != wb:
            path = f"{dest}/{fn}-{n}.webp"
            n += 1
        with open(path, "wb") as f:
            f.write(wb)
        return (remote, f"/assets/{'clubs' if dest == CLUBS else 'players'}/{os.path.basename(path)}", candidate)
    return (remote, None, None)


mapping = {}
with ThreadPoolExecutor(max_workers=8) as ex:
    for remote, local, used in ex.map(work, uniq.items()):
        if local:
            mapping[remote] = local
            print(f"  {local}   <- {used.rsplit('/', 1)[-1]}")

json.dump(mapping, open(f"{RAW}/logo_supplement.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\ndownloaded {len(mapping)} additional logos")