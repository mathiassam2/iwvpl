import pathlib

p = pathlib.Path('_crawl/verify_pass6.mjs')
s = p.read_text(encoding='utf-8')

nl = chr(10)
bad = "console.log('" + nl + "=== Hero"
good = "console.log(`" + nl + "=== Hero"
s = s.replace(bad, good)

bad2 = "no hover pause (detail in verify_hero.mjs) ===')"
good2 = "no hover pause (detail in verify_hero.mjs) ===`)"
s = s.replace(bad2, good2)

p.write_text(s, encoding='utf-8')
print('template literal fixed')
