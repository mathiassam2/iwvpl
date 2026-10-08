"""Phase 1e: build the master site_data.json with local asset paths wired in."""
import json, os, re, html, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
RAW = f"{HERE}/raw"

data = json.load(open(f"{RAW}/league_data.json", encoding="utf-8"))
records = json.load(open(f"{RAW}/asset_records.json", encoding="utf-8"))


def stem(u):
    """URL path basename without extension and without WP size suffix."""
    b = os.path.basename(urllib.parse.urlparse(u).path)
    b = re.sub(r"\.(png|jpe?g|webp|avif|gif|svg)$", "", b, flags=re.I)
    b = re.sub(r"-\d{2,4}x\d{2,4}$", "", b)
    b = re.sub(r"-\d{3,4}-x-\d{3,4}-px(-\d+)?$", "", b, flags=re.I)
    return b.lower()


# remote url -> local file  (match on basename stem, exact first then fuzzy)
by_exact, by_stem = {}, {}
for r in records:
    by_exact[urllib.parse.urlparse(r["source"]).path] = r["file"]
    by_stem.setdefault(stem(r["source"]), r["file"])


PLACEHOLDER = "/assets/brand/club-placeholder.svg"

# logos fetched by resolve_crests.py (remote url -> local file, guaranteed on disk)
_sup = f"{RAW}/logo_supplement.json"
supplement = json.load(open(_sup, encoding="utf-8")) if os.path.exists(_sup) else {}

# Index what is ACTUALLY on disk, so we never emit a stale path.
DISK = f"{PROJECT}/public/assets"
disk_exact, disk_stem = {}, {}
for sub in ("clubs", "players", "brand", "news", "sponsors"):
    d = f"{DISK}/{sub}"
    if not os.path.isdir(d):
        continue
    for fn in os.listdir(d):
        rel = f"/assets/{sub}/{fn}"
        disk_exact[fn] = rel
        disk_stem.setdefault(stem(fn), rel)


EXTS = (".png", ".webp", ".jpg", ".jpeg", ".avif", ".svg")


def on_disk(rel):
    """Return rel if the file exists, else the same stem with a different extension."""
    if rel and os.path.exists(f"{PROJECT}/public{rel}"):
        return rel
    if not rel:
        return None
    stemname = rel.rsplit(".", 1)[0]
    for e in EXTS:
        cand = stemname + e
        if os.path.exists(f"{PROJECT}/public{cand}"):
            return cand
    return None


def local_for(remote):
    """supplement -> exact filename on disk -> exact stem on disk -> placeholder.
    No fuzzy guessing (it previously mis-mapped e.g. PENYAMUNZ's '3.webp')."""
    if not remote or remote.startswith("data:"):
        return ""
    hit = on_disk(supplement.get(remote, ""))
    if hit:
        return hit
    fn = os.path.basename(urllib.parse.urlparse(remote).path)
    if fn in disk_exact:
        return disk_exact[fn]
    s = stem(remote)
    if s in disk_stem:
        return disk_stem[s]
    return ""

# ---------------- clubs ----------------
for c in data["clubs"]:
    c["logoLocal"] = local_for(c.get("logo", "")) or PLACEHOLDER

# name -> crest index (populated after standings resolve)
crest_by_name = {}

# ---------------- standings: attach club logo ----------------
club_by_name = {c["name"]: c for c in data["clubs"]}


def decorate(row):
    c = club_by_name.get(row["team"])
    row["logo"] = (c or {}).get("logoLocal", PLACEHOLDER)
    row["code"] = (c or {}).get("code", "")
    return row


for s in data["standings"]:
    decorate(s)

# The per-division tables power the Standings page - they need the same fields.
for div in data["standings_by_division"].values():
    for row in div["rows"]:
        decorate(row)

# ---------------- results ----------------
# Results pages link WordPress thumbnail variants that cannot be stem-matched,
# so fall back to a club-name -> crest index built from clubs + standings.
crest_by_name = {}
for c in data["clubs"]:
    if c["logoLocal"] != PLACEHOLDER:
        crest_by_name[c["name"].upper()] = c["logoLocal"]
for s in data["standings"]:
    if s["logo"] != PLACEHOLDER:
        crest_by_name.setdefault(s["team"].upper(), s["logo"])

for m in data["results"]:
    for side in ("home", "away"):
        m[f"{side}Logo"] = (
            local_for(m.get(f"{side}_logo", ""))
            or crest_by_name.get(m[side].upper(), "")
            or PLACEHOLDER
        )

# ---------------- leaderboards ----------------
for b in data["leaderboards"]:
    for r in b["rows"]:
        r["avatarLocal"] = local_for(r.get("avatar", "")) or "/assets/brand/avatar-placeholder.svg"
        r["teamLogoLocal"] = local_for(r.get("team_logo", "")) or ""

# ---------------- news: local featured images ----------------
NEWS_IMG = {
    6688: "/assets/news/season-1-registration.webp",
    5659: "/assets/news/champions-league-1v1.webp",
    5655: "/assets/news/pro-club-update.webp",
    5647: "/assets/news/official-website-live.webp",
}
for n in data["news"]:
    n["featuredLocal"] = NEWS_IMG.get(n["id"], "/assets/brand/player-hero.webp")

# ---------------- copy cleanup ----------------
copy = data["copy"]

ABOUT = """The Island-Wide Virtual Premier League (IWVPL) is an independent esports organisation built by passionate gamers, for the community.
Unlike large organisations or associations, IWVPL is operated independently with the support of our valued sponsors. Every league, tournament, event, and community initiative is organised by our dedicated team, driven by passion rather than profit."""

VISION = "To unite the EA SPORTS FC community across Southeast Asia on one platform."

FORMATS = [
    {"name": "Pro Club League", "tag": "11 vs 11", "desc": "The flagship 11-a-side club competition, split across 5 divisions with promotion and relegation."},
    {"name": "FUT League", "tag": "1 vs 1", "desc": "Head-to-head FUT battles decided on individual skill and tactical mastery."},
    {"name": "Champions League", "tag": "1 vs 1", "desc": "A double-elimination 1v1 showdown featuring only the most iconic European clubs."},
    {"name": "2v2 Competitions", "tag": "Coming Soon", "desc": "Doubles action is on the roadmap — pair up and take on the region together."},
]

COMMUNITIES = ["Singapore", "Malaysia", "Indonesia", "Thailand", "Brunei"]

FAQ = [
    {"q": "What is IWVPL?",
     "a": "The Island-Wide Virtual Premier League is an independent esports organisation running competitive EA SPORTS FC events across Southeast Asia. We operate Pro Clubs (11v11), 1v1 FUT competitions and Champions League tournaments, with 2v2 competitions coming soon."},
    {"q": "Which countries can take part?",
     "a": "Our primary communities are Singapore, Malaysia, Indonesia, Thailand and Brunei. Anyone from these regions can register and compete."},
    {"q": "How much does registration cost?",
     "a": "IWVPL Pro Club Season 1 team registration is SGD 35 per team, covering one complete team entry pass with full access to all Season 1 league and playoff matches, plus prize pool eligibility."},
    {"q": "How many teams can enter?",
     "a": "IWVPL Pro Club Season 1 is capped at 36 teams. At the time of our latest announcement 18 teams had already registered, leaving 18 slots available."},
    {"q": "What happens after I purchase an entry?",
     "a": "Your purchase does not immediately finalise registration. Please allow 24-48 hours for our admin team to verify and process your entry. You will then receive a confirmation email containing your team submission forms. Your entry remains pending until that confirmation is received and your roster is submitted."},
    {"q": "How are matches scheduled and reported?",
     "a": "Team managers input and update match results directly through the Manager Portal, keeping league standings accurate in near real-time. Kick-off times are published in SGT and fixtures are listed on the schedule page."},
    {"q": "Are IWVPL competitions official EA tournaments?",
     "a": "No. IWVPL is an independent league promoter and is not affiliated with, sponsored or endorsed by Electronic Arts Inc. EA SPORTS and EA FC are registered trademarks of Electronic Arts Inc."},
    {"q": "How can I get involved beyond competing?",
     "a": "We warmly welcome new sponsors and business partners, community feedback, content creators and streamers, and volunteers who share our passion for growing the EA SPORTS FC scene. Reach us on Discord, Instagram or TikTok."},
]

out = {
    "site": {
        "name": "Island-Wide Virtual Premier League",
        "shortName": "IWVPL",
        "tagline": "Forging Virtual Football Champions",
        "subtitle": "Virtual Premier League Competition, Base Singapore",
        "description": "The Island-Wide Virtual Premier League (IWVPL) is your home for top-tier EA FC competitive action across Southeast Asia. Step onto the virtual pitch and make your mark.",
        "url": "https://www.iwvpl.asia",
        "email": "iwvplofficial@gmail.com",
        "base": "Singapore",
        "copyright": "© 2026 Island-Wide Virtual Premier League. All rights reserved.",
        "disclaimer": "IWVPL is an independent league promoter and is not affiliated with, sponsored, or endorsed by Electronic Arts Inc. EA SPORTS and EA FC are registered trademarks of Electronic Arts Inc.",
        "social": [
            {"label": "Discord", "href": "#"},
            {"label": "Instagram", "href": "#"},
            {"label": "TikTok", "href": "#"},
        ],
        "season": "2026 Season 1",
        "registrationFee": "SGD 35",
        "teamCap": 36,
        "teamsRegistered": 18,
    },
    "navigation": [
        {"label": "Home", "href": "/"},
        {"label": "Pro Club League", "href": "/standings"},
        {"label": "Schedule", "href": "/schedule"},
        {"label": "Results", "href": "/results"},
        {"label": "Standings", "href": "/standings"},
        {"label": "Leaderboard", "href": "/leaderboard"},
        {"label": "Participants", "href": "/clubs"},
        {"label": "Champions League", "href": "/news/are-you-ready-for-the-ultimate-1v1-showcase-iwvpl-champions-league-is-coming-soon"},
        {"label": "News", "href": "/news"},
        {"label": "About", "href": "/about"},
        {"label": "Contact", "href": "/contact"},
    ],
    "formats": FORMATS,
    "communities": COMMUNITIES,
    "about": {"intro": ABOUT, "vision": VISION, "faq": FAQ},
    "standings": data["standings"],
    "standingsByDivision": data["standings_by_division"],
    "results": data["results"],
    "clubs": data["clubs"],
    "leaderboards": data["leaderboards"],
    "news": data["news"],
    "leagues": data["leagues"],
    "divisions": data["divisions"],
    "seasons": data["all_seasons"],
    "products": [
        {"slug": "iwvpl-pro-club-season-1", "name": "IWVPL Pro Club Season 1",
         "kicker": "Team Registration", "price": "SGD 35",
         "image": "/assets/sponsors/pro-club-registration.webp",
         "summary": "Secure your team's spot in the premier IWVPL Pro Club Season 1 tournament. Compete at the highest level for recognition, prestige, and exciting prizes.",
         "validFor": "One (1) Complete Team Entry",
         "access": "Full access to Season 1 Tournament & League Matches",
         "features": "Official Roster Submission rights, Match Schedule access, and Prize Pool Eligibility.",
         "note": "Your purchase does not immediately finalise registration. Please allow 24 to 48 hours for our team to process your entry. You will receive a final confirmation email containing your team submission forms and further instructions. Your entry remains pending until this confirmation is received and your team roster is successfully submitted."},
        {"slug": "iwvpl-champions-league", "name": "IWVPL Champions League",
         "kicker": "Season 1 Registration", "price": "Entry Pass",
         "image": "/assets/sponsors/champions-league-registration.webp",
         "summary": "Step onto the ultimate virtual pitch and clash with the elite in the IWVPL Champions League Season 1 — a high-stakes arena where individual skill and tactical mastery are pushed to the limit.",
         "validFor": "One (1) team entry, maximum 2 players",
         "access": "Double-Elimination tournament across Upper and Lower brackets",
         "features": "European club roster, free player rotation for every 1v1 match, and official team submission forms.",
         "note": "Your purchase does not immediately finalise your tournament registration. Please allow 24 to 48 hours for our administration team to verify and process your entry. You will receive a final confirmation email containing your official team submission forms. Your entry status remains pending until this confirmation is received and your 2-player team roster is successfully submitted."},
    ],
    "assets": {
        "records": records,
        "counts": {},
    },
}

# asset counts
counts = {}
for r in records:
    counts[r["bucket"]] = counts.get(r["bucket"], 0) + 1
out["assets"]["counts"] = counts
out["assets"]["total"] = len(records)

# ---------------- transfers ----------------
_tf = f"{RAW}/transfer_data.json"
transfers = []
if os.path.exists(_tf):
    for t in json.load(open(_tf, encoding="utf-8")):
        for side in ("from", "to"):
            t[side]["logoLocal"] = (
                local_for(t[side].get("logo", ""))
                or crest_by_name.get(t[side]["name"].upper(), "")
                or ""
            )
        transfers.append(t)
out["transfers"] = transfers

json.dump(out, open(f"{PROJECT}/src/data/site_data.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print("site_data.json written")
print("  clubs      :", len(out["clubs"]))
print("  standings  :", len(out["standings"]))
print("  results    :", len(out["results"]))
print("  leaderboard:", [b["title"] for b in out["leaderboards"]])
print("  news       :", len(out["news"]))
print("  assets     :", out["assets"]["total"], counts)
print("  logos mapped:", sum(1 for c in out["clubs"] if c["logoLocal"] != PLACEHOLDER), "/", len(out["clubs"]))
print("  results w/ logos:", sum(1 for m in out["results"] if m["homeLogo"] != PLACEHOLDER))