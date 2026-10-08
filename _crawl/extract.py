"""Extract visible text structure + asset URLs from a saved HTML page."""
import re, html, json, sys, urllib.parse

def clean(s):
    s = re.sub(r"<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</(p|div|li|h[1-6]|tr|td|section)>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t\xa0]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return "\n".join(l.strip() for l in s.split("\n") if l.strip())

def main(path):
    h = open(path, encoding="utf-8", errors="ignore").read()
    out = {}
    t = re.search(r"<title>(.*?)</title>", h, re.S)
    out["title"] = html.unescape(t.group(1)) if t else ""
    out["meta"] = [f"{m.group(1)}: {html.unescape(m.group(2))}"
                   for m in re.finditer(r'<meta[^>]+(?:name|property)=["\']([^"\']+)["\'][^>]*content=["\']([^"\']*)["\']', h, re.I)]
    out["links"] = sorted(set(html.unescape(u) for u in re.findall(r'<a[^>]+href=["\']([^"\'#]+)', h, re.I)))
    out["imgs"] = sorted(set(html.unescape(u) for u in re.findall(r'<img[^>]+(?:src|data-src|data-lazy-src)=["\']([^"\']+)', h, re.I)))
    out["sources"] = sorted(set(html.unescape(u) for u in re.findall(r'<source[^>]+src=["\']([^"\']+)', h, re.I)))
    out["videos"] = sorted(set(html.unescape(u) for u in re.findall(r'https?://[^\s"\'<>]+\.(?:mp4|webm|ogg|mp3|wav|m4a|mov)', h, re.I)))
    out["bgimgs"] = sorted(set(html.unescape(u) for u in re.findall(r'background(?:-image)?\s*:\s*url\(["\']?([^"\')]+)', h, re.I)))
    out["iframes"] = sorted(set(html.unescape(u) for u in re.findall(r'<iframe[^>]+src=["\']([^"\']+)', h, re.I)))
    out["css"] = sorted(set(html.unescape(u) for u in re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)', h, re.I)))
    out["text"] = clean(h)
    print(json.dumps(out, indent=1, ensure_ascii=False))

main(sys.argv[1])