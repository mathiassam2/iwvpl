"""Parse the transfer-window log from the original site."""
import re, json, os, html, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)

doc = open(f"{HERE}/pages/transfer-window.html", encoding="utf-8", errors="ignore").read()

tbl = re.search(r'<table id="transferLogTable".*?</table>', doc, re.S | re.I)
if not tbl:
    raise SystemExit("transfer table not found")
tbl = tbl.group(0)


def strip_tags(s):
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", s or "", flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def side_of(blob):
    """club-name-cell -> {name, logo, emoji, free}"""
    logo = ""
    m = re.search(r'data-lazy-src="([^"]+)"', blob) or re.search(r'<img[^>]+src="(https://[^"]+)"', blob)
    if m:
        logo = html.unescape(m.group(1))
    emoji = ""
    e = re.search(r"<span[^>]*>([\U0001F300-\U0001FAFF☀-➿])</span>", blob)
    if e:
        emoji = e.group(1)
    name = strip_tags(blob)
    name = re.sub(r"[\U0001F300-\U0001FAFF☀-➿️]", "", name).strip()
    return {"name": name, "logo": logo, "emoji": emoji, "free": name.lower() == "free agent"}


rows = []
for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S | re.I):
    tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)
    if len(tds) < 5:
        continue
    date = strip_tags(tds[0])
    if not re.match(r"\d{4}-\d{2}-\d{2}", date):
        continue
    player = strip_tags(tds[1])
    frm = side_of(re.search(r'class="club-name-cell"[^>]*>(.*?)</div>', tds[2], re.S | re.I).group(1)) \
        if "club-name-cell" in tds[2] else {"name": strip_tags(tds[2]), "logo": "", "emoji": "", "free": False}
    to = side_of(re.search(r'class="club-name-cell"[^>]*>(.*?)</div>', tds[4], re.S | re.I).group(1)) \
        if "club-name-cell" in tds[4] else {"name": strip_tags(tds[4]), "logo": "", "emoji": "", "free": False}
    rows.append({"date": date, "player": player, "from": frm, "to": to})

print("transfer rows parsed:", len(rows))
print("sample:", json.dumps(rows[0], ensure_ascii=False))
print("sample:", json.dumps(rows[2], ensure_ascii=False))

# summary
inbound = sum(1 for r in rows if r["to"]["free"] and not r["from"]["free"])
outbound = sum(1 for r in rows if r["from"]["free"] and not r["to"]["free"])
internal = sum(1 for r in rows if not r["from"]["free"] and not r["to"]["free"])
signed = sum(1 for r in rows if r["from"]["free"] and r["to"]["free"])
print(f"inbound={inbound} outbound={outbound} internal={internal} newly-signed={signed}")

json.dump(rows, open(f"{HERE}/raw/transfer_data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)