"""Phase 1f: re-file assets into semantic folders (brand/news/sponsors/clubs/...)."""
import json, os, re, shutil, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
A = f"{PROJECT}/public/assets"
RAW = f"{HERE}/raw"

os.makedirs(f"{A}/brand", exist_ok=True)
os.makedirs(f"{A}/news", exist_ok=True)
os.makedirs(f"{A}/sponsors", exist_ok=True)

# ui/ -> semantic destinations
MOVES = {
    "untitled":                     ("brand", "iwvpl-logo"),
    "6a8b31c949f4d":               ("brand", "uefa-champions-league"),
    "bc6b5199-d652-4827-86e2-164cb72d693f":     ("brand", "hero-stadium"),
    "bc6b5199-d652-4827-86e2-164cb72d693f-1":   ("brand", "banner-wide"),
    "bc":                          ("brand", "banner-dark"),
    "bc-1":                        ("brand", "banner-dark-alt"),
    "default-profile":             ("brand", "avatar-placeholder"),
    "f0eca3b3-c14c-4bee-9ab9-d34b7fa37a17":     ("brand", "player-hero"),
    "b4fd7c7e-9c4b-4fb5-9d18-96ad5c327189":     ("news", "champions-league-1v1"),
    "cae3ed88-8a5b-46db-bcba-48ffb31bd9e1-1":   ("news", "official-website-live"),
    "gemini-generated-image-rcisehrcisehrcis":  ("news", "pro-club-update"),
    "b8efaaf0-d805-46e2-8d3c-2555d27e6d2e":     ("news", "season-1-registration"),
    "b8efaaf0-d805-46e2-8d3c-2555d27e6d2e-1":   ("news", "season-1-registration-alt"),
    "cl1":                         ("sponsors", "champions-league-registration"),
    "cl2":                         ("sponsors", "champions-league-participating-teams"),
    "pc1":                         ("sponsors", "pro-club-registration"),
    "pc2":                         ("sponsors", "pro-club-registration-detail"),
}

recs = json.load(open(f"{RAW}/asset_records.json", encoding="utf-8"))
renames = {}
for r in recs:
    if r["bucket"] != "ui":
        continue
    if r["name"] in MOVES:
        dest, new = MOVES[r["name"]]
        src = f"{PROJECT}/public{r['file']}"
        dst = f"{A}/{dest}/{new}.{r['format']}"
        if os.path.exists(src):
            shutil.move(src, dst)
            r["bucket"], r["name"] = dest, new
            r["file"] = f"/assets/{dest}/{new}.{r['format']}"
            renames[r["name"]] = dst
            print(f"  {r['file']}")

json.dump(recs, open(f"{RAW}/asset_records.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

leftover = os.listdir(f"{A}/ui")
print(f"\nui leftovers: {leftover}")
for f in leftover:
    os.remove(f"{A}/ui/{f}")
os.rmdir(f"{A}/ui")
print("removed empty ui/")
for d in sorted(os.listdir(A)):
    p = f"{A}/{d}"
    if os.path.isdir(p):
        print(f"  {d:12s} {len(os.listdir(p)):3d} files")