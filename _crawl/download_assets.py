"""Phase 1c (parallel): download remaining assets, resumable."""
import json, os, re, io, sys, time, html, gzip, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = f"{HERE}/raw"
PROJECT = os.path.dirname(HERE)
ASSETS = f"{PROJECT}/public/assets"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
RECFILE = f"{RAW}/asset_records.json"

for d in ["clubs", "players", "news", "sponsors", "brand", "ui", "originals"]:
    os.makedirs(f"{ASSETS}/{d}", exist_ok=True)


def slug(s):
    s = urllib.parse.unquote(s or "")
    s = re.sub(r"[%][0-9a-fA-F]{2}", " ", s)
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-{2,}", "-", s) or "asset"


def get(url, tries=2):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=45) as r:
                d = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    d = gzip.decompress(d)
                return d
        except Exception:
            if i == tries - 1:
                return None
            time.sleep(1)


def to_webp(raw, max_w=None, quality=86):
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
        elif im.mode != "RGB":
            im = im.convert("RGB")
        if max_w and im.width > max_w:
            h = round(im.height * max_w / im.width)
            im = im.resize((max_w, h), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=quality, method=6)
        return buf.getvalue(), im.width, im.height
    except Exception:
        return None, None, None


media = json.load(open(f"{RAW}/rest_media.json", encoding="utf-8"))
link_of, title_of = {}, {}
for m in media:
    src = html.unescape(m.get("source_url") or m.get("guid", {}).get("rendered") or "")
    link_of[src] = m.get("link", "")
    title_of[src] = html.unescape((m.get("title", {}) or {}).get("rendered", ""))


def bucket_for(src):
    p = urllib.parse.unquote(urllib.parse.urlparse(link_of.get(src, "")).path).strip("/").split("/")
    head = p[0] if p else ""
    tail = p[-1] if p else ""
    if head == "team":
        return "clubs", tail
    if head == "player":
        return "players", tail
    if head in ("post", "page"):
        return "news", tail
    if head == "product":
        return "sponsors", tail
    return "ui", None


manifest = json.load(open(f"{RAW}/asset_manifest.json", encoding="utf-8"))
done = {}
if os.path.exists(RECFILE):
    for r in json.load(open(RECFILE, encoding="utf-8")):
        done[r["source"]] = r

# pre-assign unique names deterministically over the FULL manifest
assigned = {}
used = set()
for a in manifest:
    src = a["source"]
    if src in done:
        assigned[src] = (done[src]["bucket"], done[src]["name"])
        used.add((done[src]["bucket"], done[src]["name"]))
        continue
    bucket, semantic = bucket_for(src)
    base = os.path.basename(urllib.parse.urlparse(src).path)
    n = base.rsplit(".", 1)[0]
    if bucket is None:
        bucket = "ui"
    if semantic in (None, "", "attachment", "0"):
        semantic = n
    name = slug(semantic)
    key, i = (bucket, name), 1
    while key in used:
        i += 1
        key = (bucket, f"{name}-{i}")
    used.add(key)
    assigned[src] = key

todo = [a for a in manifest if a["source"] not in done]
print(f"already done: {len(done)} | todo: {len(todo)}", flush=True)


def work(a):
    src = a["source"]
    raw = get(src)
    if not raw:
        return None
    bucket, name = assigned[src]
    base = os.path.basename(urllib.parse.urlparse(src).path)
    ext = ("." + base.rsplit(".", 1)[-1].lower()) if "." in base else ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"):
        ext = ".png"
    with open(f"{ASSETS}/originals/{name}{ext}", "wb") as f:
        f.write(raw)
    rec = {"source": src, "bucket": bucket, "name": name,
           "original": f"/assets/originals/{name}{ext}", "bytes_original": len(raw),
           "link": link_of.get(src, ""), "title": title_of.get(src, "") or a.get("title", ""),
           "alt": a.get("alt", "")}
    if ext == ".svg":
        with open(f"{ASSETS}/{bucket}/{name}.svg", "wb") as f:
            f.write(raw)
        rec["file"] = f"/assets/{bucket}/{name}.svg"
        rec["format"] = "svg"
    else:
        max_w = 512 if bucket in ("clubs", "players") else 1600
        wb, w, h = to_webp(raw, max_w=max_w)
        if wb:
            with open(f"{ASSETS}/{bucket}/{name}.webp", "wb") as f:
                f.write(wb)
            rec.update(file=f"/assets/{bucket}/{name}.webp", format="webp", width=w, height=h, bytes=len(wb))
        else:
            with open(f"{ASSETS}/{bucket}/{name}{ext}", "wb") as f:
                f.write(raw)
            rec.update(file=f"/assets/{bucket}/{name}{ext}", format=ext.lstrip("."))
    return rec


with ThreadPoolExecutor(max_workers=8) as ex:
    for i, rec in enumerate(ex.map(work, todo), 1):
        if rec:
            print(f"  [{i}/{len(todo)}] {rec['file']}", flush=True)
            done[rec["source"]] = rec
        else:
            print(f"  [{i}/{len(todo)}] FAILED", flush=True)
        json.dump(list(done.values()), open(RECFILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print(f"\nTOTAL ASSETS: {len(done)}")