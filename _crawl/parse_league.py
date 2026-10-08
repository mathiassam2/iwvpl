"""Phase 1d (v3): definitive structured extraction from rendered HTML."""
import re, json, os, html, glob

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = f"{HERE}/raw"


def rd(p):
    return open(p, encoding="utf-8", errors="ignore").read()


def strip_tags(s):
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", s or "", flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _int(s):
    m = re.search(r"-?\d+", (s or "").replace("\u2212", "-"))
    return int(m.group(0)) if m else 0


def table_rows(tbl):
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S | re.I):
        cells = [strip_tags(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S | re.I)]
        if any(cells):
            out.append(cells)
    return out


def select_options(h, name):
    m = re.search(rf'name="{name}".*?</select>', h, re.S | re.I)
    if not m:
        return []
    return [strip_tags(o) for o in re.findall(r"<option[^>]*>(.*?)</option>", m.group(0), re.S | re.I)]


def flag(name):
    """Split trailing flag emoji off a club name -> (name, flag)."""
    m = re.search(r"([\U0001F1E6-\U0001F1FF]{2})\s*$", name or "")
    return (name[: m.start()].strip(), m.group(1)) if m else ((name or "").strip(), "")


doc = {}

# ==================== STANDINGS ====================
st = rd(f"{HERE}/pages/standings.html")
blocks = re.split(r'text-transform: uppercase;">', st)
standings_by_div = {}
for b in blocks[1:]:
    div_name = strip_tags(b.split("</div>")[0]).title()
    tbl = re.search(r"<table.*?</table>", b, re.S | re.I)
    if not tbl:
        continue
    rows = table_rows(tbl.group(0))
    if not rows:
        continue
    out = []
    for r in rows[1:]:
        pos = re.match(r"^(\d+)", r[0] or "")
        if not pos or len(r) < 10:
            continue
        nm, fl = flag(r[1])
        out.append({"pos": int(pos.group(1)), "team": nm, "flag": fl,
                    "pl": _int(r[2]), "w": _int(r[3]), "d": _int(r[4]), "l": _int(r[5]),
                    "gf": _int(r[6]), "ga": _int(r[7]), "gd": _int(r[8]), "pts": _int(r[9]),
                    "form": [c for c in (r[10].split(" ") if len(r) > 10 else []) if c]})
    if out:
        standings_by_div[div_name] = {"columns": rows[0], "rows": out}
doc["standings_by_division"] = standings_by_div
doc["standings"] = next(iter(standings_by_div.values()))["rows"] if standings_by_div else []
doc["divisions"] = select_options(st, "sp_division")
doc["seasons"] = select_options(st, "sp_season")

# ==================== LEADERBOARD ====================
lb = rd(f"{HERE}/pages/leaderboard.html")
widgets = re.findall(r'<div class="pl-leaderboard-widget".*?(?=<div class="pl-leaderboard-widget"|</section>)',
                     lb, re.S | re.I)
leaderboards = []
for w in widgets:
    t = re.search(r'pl-header-title">(.*?)</div>', w, re.S | re.I)
    title = strip_tags(t.group(1)) if t else ""
    items = re.findall(r'<li class="pl-leaderboard-item">(.*?)</li>', w, re.S | re.I)
    rows = []
    for it in items:
        rank = re.search(r'pl-rank">(.*?)</div>', it, re.S | re.I)
        nm = re.search(r'pl-player-name"[^>]*>(.*?)</a>', it, re.S | re.I)
        tm = re.search(r'pl-team-info"[^>]*>(.*?)</a>', it, re.S | re.I)
        av = re.findall(r'pl-avatar"[^>]*>.*?src="([^"]+)"', it, re.S | re.I)
        tl = re.search(r'pl-team-logo"[^>]*src="([^"]+)"', it, re.S | re.I)
        val = re.search(r'pl-stat-value">(.*?)</div>', it, re.S | re.I)
        ur = re.search(r'href="(https://www\.iwvpl\.asia/player/[^"]+)"', it)
        rows.append({"pos": _int(strip_tags(rank.group(1))) if rank else 0,
                     "name": strip_tags(nm.group(1)) if nm else "",
                     "team": flag(strip_tags(tm.group(1)) if tm else "")[0],
                     "team_flag": flag(strip_tags(tm.group(1)) if tm else "")[1],
                     "value": _int(strip_tags(val.group(1))) if val else 0,
                     "avatar": av[0] if av else "", "team_logo": tl.group(1) if tl else "",
                     "url": html.unescape(ur.group(1)) if ur else ""})
    if rows:
        leaderboards.append({"title": title, "rows": rows})
doc["leaderboards"] = leaderboards

# ==================== MATCHES ====================
def parse_results(h):
    """Front-end 'custom-match-row' results listing."""
    out = []
    parts = re.split(r'class="custom-date-row"', h)
    for p in parts[1:]:
        date = strip_tags(p.split("</div>")[0]).lstrip(">").strip()
        for row in re.split(r'class="custom-match-row"', p)[1:]:
            row = row.split('class="custom-date-row"')[0]
            tm = re.search(r'row-time">(.*?)</div>', row, re.S | re.I)
            left = re.search(r'row-team-left"[^>]*>(.*?)</div>', row, re.S | re.I)
            right = re.search(r'row-team-right"[^>]*>(.*?)</div>', row, re.S | re.I)
            sc = re.search(r'row-score">(.*?)</div>', row, re.S | re.I)
            ur = re.search(r"onclick=\"window\.location\.href='([^']+)'\"", row)
            if not (left and right):
                continue

            def side(blob):
                nm = re.search(r"<span>(.*?)</span>", blob, re.S | re.I)
                lg = re.findall(r'<img[^>]+src="([^"]+)"', blob)
                n, f = flag(strip_tags(nm.group(1)) if nm else "")
                return n, f, (lg[0] if lg else "")

            hn, hf, hl = side(left.group(1))
            an, af, al = side(right.group(1))
            score = strip_tags(sc.group(1)) if sc else ""
            hs = as_ = ""
            m = re.match(r"^\s*(\d+)\s*[:\-–]\s*(\d+)\s*$", score)
            if m:
                hs, as_ = m.group(1), m.group(2)
            out.append({"date": date, "time": strip_tags(tm.group(1)) if tm else "",
                        "home": hn, "home_flag": hf, "home_logo": hl,
                        "away": an, "away_flag": af, "away_logo": al,
                        "score": score, "hs": hs, "as": as_,
                        "url": html.unescape(ur.group(1)) if ur else ""})
    return out


doc["results"] = parse_results(rd(f"{HERE}/pages/match-result.html"))

# ==================== CLUBS (participants gallery) ====================
pt = rd(f"{HERE}/pages/participants.html")
clubs = []
for item in re.split(r'<div class="gallery-item">', pt)[1:]:
    nm = re.search(r"<h4[^>]*>\s*<a href=\"([^\"]+)\"[^>]*>(.*?)</a>", item, re.S | re.I)
    if not nm:
        continue
    name, fl = flag(strip_tags(nm.group(2)))
    logo = ""
    for attr in ("data-lazy-src", "data-lazy-srcset", "src", "srcset"):
        m = re.search(rf'<div class="team-logo"[^>]*>.*?<img[^>]+{attr}="([^"]+)"', item, re.S | re.I)
        if m and not m.group(1).startswith("data:"):
            logo = m.group(1)
            if "srcset" in attr:
                logo = logo.split(",")[0].strip().split(" ")[0]
            break
    # short code: the div styled with letter-spacing:1px that precedes the name
    code = ""
    head = item[: nm.start()]
    cm = re.search(r'letter-spacing:\s*1px[^>]*>([^<]+)</div>', head, re.I)
    if cm:
        cand = strip_tags(cm.group(1))
        if re.fullmatch(r"[A-Z0-9]{2,5}", cand):
            code = cand
    # Stop at the card boundary: a bare `.+?$` would run on into the footer and
    # swallow unrelated numbers.
    ex = re.search(r'sp-club-extra-data"[^>]*>(.*?)</div>\s*</div>\s*(?:<div class="gallery-item">|$)', item, re.S | re.I)
    if not ex:
        ex = re.search(r'sp-club-extra-data"[^>]*>(.*?)(?:</div>\s*</div>|<footer)', item, re.S | re.I)
    status_raw = strip_tags(ex.group(1)) if ex else ""
    clubs.append({
        "name": name, "flag": fl, "code": code,
        "url": html.unescape(nm.group(1)),
        "logo": html.unescape(logo),
        "players": _int(status_raw, 0, 40),
        "status": ("Active" if "Active" in status_raw and "Non-Active" not in status_raw else
                   "Non-Active" if "Non-Active" in status_raw else
                   "Pending Approval" if "Pending" in status_raw else ""),
        "raw": status_raw,
    })
doc["clubs"] = clubs

# fallback team list from the results filter dropdown
mr = rd(f"{HERE}/pages/match-result.html")
sel = re.search(r'name="filter_team"[^>]*>(.*?)</select>', mr, re.S | re.I)
if sel:
    ids = {}
    for o in re.findall(r'<option value="(\d+)"[^>]*>(.*?)</option>', sel.group(1), re.S | re.I):
        n, f = flag(strip_tags(o[1]))
        ids[n] = {"id": o[0], "name": n, "flag": f}
    doc["all_team_names"] = [ids[k]["name"] for k in ids]
    doc["team_ids"] = ids

# club logos harvested from matches + leaderboard
logos = {}
for c in clubs:
    if c["logo"] and not c["logo"].startswith("data:"):
        logos[c["name"]] = c["logo"]
for m in doc["results"]:
    for n, l in ((m["home"], m["home_logo"]), (m["away"], m["away_logo"])):
        if n and l and not l.startswith("data:"):
            logos.setdefault(n, l)
doc["club_logos"] = logos

# ==================== LEAGUES / SEASONS / TAXONOMY ====================
doc["leagues"] = select_options(pt, "sp_league")
doc["all_seasons"] = select_options(pt, "sp_season")

# ==================== NEWS ====================
news = json.load(open(f"{RAW}/rest_posts.json", encoding="utf-8"))
tax = json.load(open(f"{RAW}/rest_taxonomies.json", encoding="utf-8"))


def term_name(t):
    n = t.get("name")
    if isinstance(n, dict):
        n = n.get("rendered", "")
    return strip_tags(n or "")


catname = {c["id"]: term_name(c) for c in tax.get("category", []) if isinstance(c, dict)}
tagname = {t["id"]: term_name(t) for t in tax.get("post_tag", []) if isinstance(t, dict)}

media_by_id = {m["id"]: html.unescape(m.get("source_url", "")) for m in json.load(open(f"{RAW}/rest_media.json", encoding="utf-8"))}

doc["news"] = []
for n in news:
    body = n["content"]["rendered"]
    imgs = [html.unescape(u) for u in re.findall(r'<img[^>]+src="(https://www\.iwvpl\.asia/[^"]+)"', body)]
    fm = re.search(r'class="[^"]*post-thumbnail[^"]*"[^>]*>.*?<img[^>]+src="([^"]+)"', n.get("content", {}).get("rendered", "") + n.get("excerpt", {}).get("rendered", ""), re.S)
    doc["news"].append({
        "id": n["id"], "slug": n["slug"], "title": strip_tags(n["title"]["rendered"]),
        "date": n["date"][:10],
        "categories": [catname.get(c, "") for c in n.get("categories", [])],
        "tags": [tagname.get(t, "") for t in n.get("tags", [])],
        "excerpt": strip_tags(re.sub(r"<[^>]+>", " ", n.get("excerpt", {}).get("rendered", ""))),
        "body": strip_tags(body),
        "images": imgs,
        "featured": html.unescape(fm.group(1)) if fm else (imgs[0] if imgs else ""),
    })

# ==================== COPY ====================
def body_text(page):
    h = rd(f"{HERE}/pages/{page}.html")
    m = re.search(r"(<main.*?</main>)", h, re.S | re.I) or re.search(r'(<body.*?</body>)', h, re.S | re.I)
    t = strip_tags(m.group(1) if m else h)
    for junk in ["IWVPL is an independent league promoter"]:
        i = t.find(junk)
        if i > 0:
            t = t[:i]
    return t


doc["copy"] = {p: body_text(p) for p in
               ["about-us", "contact", "history", "faq", "leaderboard", "standings",
                "participants", "match-schedule", "match-result", "transfer-window",
                "news", "shop", "register", "login", "gallery", "tournament"]}

# homepage copy
doc["home_copy"] = strip_tags(rd(f"{HERE}/home.html"))

json.dump(doc, open(f"{RAW}/league_data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("standings   :", {k: len(v["rows"]) for k, v in standings_by_div.items()})
print("results     :", len(doc["results"]))
print("clubs       :", len(clubs))
print("club logos  :", len(logos))
print("leaderboards:", [(b["title"], len(b["rows"])) for b in leaderboards])
print("leagues     :", doc["leagues"])
print("seasons     :", doc["all_seasons"])
print("news        :", len(doc["news"]))
print()
print("SAMPLE result  :", json.dumps(doc["results"][0], ensure_ascii=False))
print("SAMPLE club    :", json.dumps(clubs[1], ensure_ascii=False))
print("SAMPLE lb      :", json.dumps(leaderboards[0]["rows"][0], ensure_ascii=False) if leaderboards else None)
print("SAMPLE standing:", json.dumps(doc["standings"][0], ensure_ascii=False))