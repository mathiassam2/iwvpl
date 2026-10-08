"""Phase 1 crawler for iwvpl.asia -> raw structured data."""
import json, os, re, sys, time, html, urllib.request, urllib.parse, gzip, io

BASE = "https://www.iwvpl.asia"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
os.makedirs(OUT, exist_ok=True)


def fetch(url, tries=3, timeout=60):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept-Encoding": "gzip, deflate",
                "Accept": "*/*",
            })
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
                ct = r.headers.get("Content-Type", "")
                if "json" in ct or "xml" in ct or "text" in ct:
                    return data.decode("utf-8", "ignore")
                return data  # binary
        except Exception as e:
            if i == tries - 1:
                print(f"  !! {url} -> {e}", flush=True)
                return None
            time.sleep(1.5 * (i + 1))
    return None


def fetch_json(url):
    t = fetch(url)
    if not t:
        return None
    try:
        return json.loads(t)
    except Exception:
        return None


def paged(rest_base, per_page=100, max_pages=60, label=""):
    """Fetch all items of a WP REST collection via ?page=N&per_page."""
    items, page = [], 1
    while page <= max_pages:
        url = f"{BASE}/wp-json/wp/v2/{rest_base}?per_page={per_page}&page={page}&_embed=1"
        d = fetch_json(url)
        if not d:
            break
        if isinstance(d, dict) and d.get("code"):
            break
        if not isinstance(d, list) or len(d) == 0:
            break
        items.extend(d)
        print(f"  {label or rest_base}: page {page} (+{len(d)}) total={len(items)}", flush=True)
        if len(d) < per_page:
            break
        page += 1
        time.sleep(0.35)
    return items


def sitemap_urls():
    idx = fetch(f"{BASE}/sitemap.xml") or ""
    maps = re.findall(r"<loc>(.*?)</loc>", idx)
    urls = set()
    for sm in maps:
        xml = fetch(sm)
        if not xml:
            continue
        for u in re.findall(r"<loc>(.*?)</loc>", xml):
            urls.add(html.unescape(u.strip()))
    return sorted(urls)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"

    if which in ("all", "sitemap"):
        print("== sitemaps ==", flush=True)
        urls = sitemap_urls()
        json.dump(urls, open(f"{OUT}/sitemap_urls.json", "w", encoding="utf-8"), indent=1)
        print(f"  sitemap urls: {len(urls)}", flush=True)

    if which in ("all", "rest"):
        targets = [
            ("pages", "pages"), ("posts", "posts"), ("teams", "sp_team"),
            ("players", "sp_player"), ("staff", "sp_staff"), ("events", "sp_event"),
            ("tournaments", "sp_tournament"), ("calendars", "sp_calendar"),
            ("tables", "sp_table"), ("lists", "sp_list"), ("products", "product"),
            ("media", "media"), ("menus", "menu-items"),
            ("tax_leagues", "sp_league"), ("tax_seasons", "sp_season"),
            ("tax_positions", "sp_position"), ("tax_venues", "sp_venue"),
        ]
        for label, base in targets:
            print(f"== rest: {label} ==", flush=True)
            items = paged(base, label=label)
            json.dump(items, open(f"{OUT}/rest_{label}.json", "w", encoding="utf-8"),
                      ensure_ascii=False)
            print(f"  saved {label}: {len(items)}", flush=True)