import pathlib

p = pathlib.Path('_crawl/verify_hero.mjs')
s = p.read_text(encoding='utf-8')

# Foreground image = the one that is NOT the blurred backdrop.
s = s.replace(
    """const branchOf = (el, cls) => imgsOf(el).find((i) => i.parentElement.className.includes(cls))
const desktopImg = (el) => branchOf(el, 'lg:block') ?? imgsOf(el)[0]
const mobileImg = (el) => branchOf(el, 'lg:hidden')""",
    """/**
 * The sharp foreground image for a branch. Each branch renders two <img>s when
 * the poster is active: a blurred cover backdrop plus the real one, so the
 * first match is not the one under test.
 */
const foreground = (el, cls) =>
  imgsOf(el).find(
    (i) => i.parentElement.className.includes(cls) && !i.className.includes('blur-2xl'),
  )
const desktopImg = (el) => foreground(el, 'lg:block') ?? imgsOf(el)[0]
const mobileImg = (el) => foreground(el, 'lg:hidden')""",
)

# `min-h-[100svh]` contains the substring `h-[`, so strip it before testing.
s = s.replace(
    "  t.check('min-height, not a fixed height (short windows still fit)', !/\\bh-\\[/.test(sec(doc).className))",
    """  t.check(
    'min-height, not a fixed height (short windows still fit)',
    !/h-\\[/.test(sec(doc).className.split('min-h-').join('')),
  )""",
)
p.write_text(s, encoding='utf-8')
print('helpers fixed')
