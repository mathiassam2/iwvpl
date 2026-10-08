"""Phase 1 crawler part 2: correct rest_base usage for iwvpl.asia."""
import json, os, re, sys, time, html, urllib.request, gzip

BASE = "https://www.iwvpl.asia"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
os.makedirs(OUT, exist_ok=True)


def fetch(url, tries=3, timeout=90):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
                if "json" in r.headers.get("Content-Type", "") or "xml" in r.headers.get("Content-Type", ""):
                    return data.decode("utf-8", "ignore")
                return data
        except Exception as e:
            if i == tries - 1:
                print(f"  !! {url} -> {e}", flush=True)
                return None
            time.sleep(2 * (i + 1))
    return None


def fetch_json(url):
    t = fetch(url)
    if not t:
        return None
    try:
        return json.loads(t)
    except Exception:
        return None


def paged(rest_base, per_page=100, max_pages=40, label=""):
    items, page = [], 1
    while page <= max_pages:
        url = f"{BASE}/wp-json/wp/v2/{rest_base}?per_page={per_page}&page={page}"
        d = fetch_json(url)
        if isinstance(d, dict):          # 400 rest_post_invalid_page_number etc
            break
        if not isinstance(d, list) or not d:
            break
        items.extend(d)
        print(f"  {label or rest_base}: +{len(d)} total={len(items)}", flush=True)
        if len(d) < per_page:
            break
        page += 1
        time.sleep(0.3)
    return items


TARGETS = [
    ("pages", "pages"), ("posts", "posts"), ("teams", "teams"),
    ("players", "players"), ("staff", "staff"), ("events", "events"),
    ("tournaments", "tournaments"), ("calendars", "calendars"),
    ("tables", "tables"), ("lists", "lists"), ("products", "product"),
    ("media", "media"), ("menu-items", "menu-items"),
]

if __name__ == "__main__":
    only = sys.argv[1:] or None
    for label, base in TARGETS:
        if only and label not in only:
            continue
        print(f"== {label} ==", flush=True)
        items = paged(base, label=label)
        json.dump(items, open(f"{OUT}/rest_{label}.json", "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  saved {label}: {len(items)}", flush=True)

    if not only:
        print("== taxonomies ==", flush=True)
        tx = fetch_json(f"{BASE}/wp-json/wp/v2/taxonomies") or {}
        saved = {}
        for name, t in tx.items():
            rb = t.get("rest_base") or name
            if not rb:
                continue
            d = fetch_json(f"{BASE}/wp-json/wp/v2/{rb}?per_page=100")
            saved[name] = d if isinstance(d, list) else []
            time.sleep(0.25)
        json.dump(saved, open(f"{OUT}/rest_taxonomies.json", "w", encoding="utf-8"), ensure_ascii=False)
        for k, v in saved.items():
            print(f"  tax {k}: {len(v) if isinstance(v, list) else 0}", flush=True)