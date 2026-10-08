"""Phase 1b: build complete asset manifest from media REST + all scraped HTML."""
import json, os, re, html, glob, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = f"{HERE}/raw"

# ---------- 1. from media REST (authoritative library) ----------
media = json.load(open(f"{RAW}/rest_media.json", encoding="utf-8"))
assets = {}
for m in media:
    src = m.get("source_url") or m.get("guid", {}).get("rendered")
    if not src:
        continue
    src = html.unescape(src)
    det = m.get("media_details", {}) or {}
    assets[src] = {
        "source": src,
        "kind": (m.get("media_type") or "file"),
        "mime": m.get("mime_type", ""),
        "title": html.unescape((m.get("title", {}) or {}).get("rendered", "")),
        "alt": html.unescape(m.get("alt_text", "") or ""),
        "link": m.get("link", ""),
        "width": det.get("width"),
        "height": det.get("height"),
        "origin": "media-library",
    }

# ---------- 2. from scraped HTML (catches assets not in library) ----------
IMG_EXT = r"(?:png|jpe?g|webp|avif|gif|svg|bmp|ico)"
MED_EXT = r"(?:mp4|webm|ogv|ogg|mp3|wav|m4a|mov)"
F_EXT = r"(?:woff2?|ttf|otf|eot)"

rx = [
    (IMG_EXT, re.compile(r'<img[^>]+(?:src|data-src|data-lazy-src)=["\']([^"\']+)', re.I)),
    (IMG_EXT, re.compile(r'<source[^>]+srcset=["\']([^"\']+)', re.I)),
    (IMG_EXT, re.compile(r'background(?:-image)?\s*:\s*url\(["\']?([^"\')\s]+)', re.I)),
    (MED_EXT, re.compile(r'https?://[^\s"\'<>\\]+\.(?:' + MED_EXT + r')', re.I)),
    (F_EXT, re.compile(r'https?://[^\s"\'<>\\)]+\.(?:' + F_EXT + r')', re.I)),
    ("css", re.compile(r'<link[^>]+rel=["\']stylesheet["\'][^>]*?href=["\']([^"\']+)', re.I)),
]

html_files = [f"{HERE}/home.html"] + glob.glob(f"{HERE}/pages/*.html")
for hf in html_files:
    doc = open(hf, encoding="utf-8", errors="ignore").read()
    for ext, rx_ in rx:
        for u in rx_.findall(doc):
            if ext == "css":
                continue
            if ext == IMG_EXT and "data:" in u:
                continue
            # srcset-style "url 300w, url2 600w"
            for part in re.split(r"\s*,\s*", u) if "srcset" in rx_.pattern else [u]:
                pu = part.strip().split(" ")[0]
                if not pu or pu.startswith("data:"):
                    continue
                pu = html.unescape(pu)
                if pu.startswith("//"):
                    pu = "https:" + pu
                if pu.startswith("/") or not pu.startswith("http"):
                    continue
                all_ext = ["." + x for x in
                           (IMG_EXT + "|" + MED_EXT + "|" + F_EXT).split("|")]
                if any(pu.split("?")[0].lower().endswith(e) for e in all_ext):
                    assets.setdefault(pu, {
                        "source": pu, "kind": "image", "mime": "", "title": "",
                        "alt": "", "link": "", "width": None, "height": None,
                        "origin": "scraped-html",
                    })

# ---------- 3. dedupe: drop WP-generated thumbnails, keep originals ----------
def is_thumb(u):
    """True for wp-content/uploads/.../name-300x200.ext style derivatives."""
    return bool(re.search(r"-\d{2,4}x\d{2,4}(\.(?:png|jpe?g|webp|gif|avif))$", u, re.I))

thumbs = [u for u in assets if is_thumb(u)]
for u in thumbs:
    assets.pop(u, None)

# media library entries that ARE thumbs get demoted/dropped too
for u in list(assets):
    if is_thumb(u):
        assets.pop(u)

manifest = sorted(assets.values(), key=lambda a: (a["kind"], a["source"]))
json.dump(manifest, open(f"{RAW}/asset_manifest.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

by_kind = {}
for a in manifest:
    by_kind.setdefault(a["kind"], 0)
    by_kind[a["kind"]] += 1
print("ASSETS (thumbs removed):", len(manifest))
for k, v in sorted(by_kind.items(), key=lambda x: -x[1]):
    print(f"  {k:10s} {v}")
print(f"  [dropped {len(thumbs)} generated thumbnails]")