"""Phase 3 prep: self-host latin font subsets -> public/assets/fonts."""
import re, glob, os, urllib.request, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(os.path.dirname(HERE), "public", "assets", "fonts")
os.makedirs(F, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

SPECS = [
    ("inter", "Inter", "Inter (body)", "400 700", "swap"),
    ("sora", "Sora", "Sora (display)", "600 800", "swap"),
    ("oswald", "Oswald", "Oswald (condensed)", "500 700", "swap"),
]

out_css = ["/* Self-hosted latin subsets - no external font requests at runtime. */\n"]
count = 0
for slug, family, label, weights, disp in SPECS:
    req = urllib.request.Request(
        f"https://fonts.googleapis.com/css2?family={family}:wght@{weights.replace(' ', ';')}&display=swap",
        headers={"User-Agent": UA})
    css = urllib.request.urlopen(req, timeout=45).read().decode()
    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S)
    for subset, block in blocks:
        if subset not in ("latin", "latin-ext"):
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block)
        if not url:
            continue
        wght = re.search(r"font-weight:\s*([\d ]+);", block)
        uni = re.search(r"unicode-range:\s*([^;]+);", block)
        fn = f"{slug}-{subset}-{wght.group(1).strip().replace(' ', '-') if wght else '400'}.woff2"
        dest = os.path.join(F, fn)
        if not os.path.exists(dest):
            data = urllib.request.urlopen(
                urllib.request.Request(url.group(1), headers={"User-Agent": UA}), timeout=45).read()
            with open(dest, "wb") as f:
                f.write(data)
        out_css.append(
            f"@font-face {{\n  font-family: '{label}';\n  font-style: normal;\n"
            f"  font-weight: {wght.group(1).strip() if wght else '400'};\n"
            f"  font-display: {disp};\n  src: url('/assets/fonts/{fn}') format('woff2');\n"
            f"  unicode-range: {uni.group(1).strip() if uni else 'U+0000-00FF'};\n}}\n")
        count += 1
        print(f"  {fn:34s} {os.path.getsize(dest):>7d} bytes")

with open(os.path.join(F, "fonts.css"), "w", encoding="utf-8") as f:
    f.write("\n".join(out_css))
print(f"\n{count} @font-face rules -> public/assets/fonts/fonts.css")