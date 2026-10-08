import pathlib

p = pathlib.Path('_crawl/verify_hero.mjs')
lines = p.read_text(encoding='utf-8').split(chr(10))

# Lines 80-84 (1-indexed) still assert the old contain + blurred backdrop.
replacement = [
    "  t.check('poster frame is object-cover', desktopImg(active(doc)).className.includes('object-cover'))",
    "  t.check('poster frame is static (no Ken Burns)', !desktopImg(active(doc)).className.includes('hero-kenburns'))",
    "  t.check('no blurred backdrop any more', !imgsOf(active(doc)).some((i) => i.className.includes('blur-2xl')))",
    "  t.check('one image per responsive branch', imgsOf(active(doc)).length === 2, `${imgsOf(active(doc)).length} imgs`)",
]
lines[79:84] = replacement
p.write_text(chr(10).join(lines), encoding='utf-8')
print('lines 80-84 replaced')
