/**
 * Pass 6 verification: hero flush/static, table grids, dropdowns, removals.
 */

import { boot, stats } from './harness.mjs'

const t = stats()
const POSTER = 2200

/* ============================================================ 1. Hero flush */
console.log(`
=== Hero: flush frame, no hover pause (detail in verify_hero.mjs) ===`)
{
  const { window, doc, sleep, close } = await boot({ path: '/' })
  const sec = doc.querySelector('[aria-roledescription="carousel"]')
  t.check('hero renders', !!sec)
  t.check(
    'frame is not pinned to a fixed pixel height',
    !/h-\[/.test(sec.className),
  )
  t.check('4 slides', doc.querySelectorAll('[data-slide]').length === 4)

  sec.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }))
  sec.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }))
  await sleep(60)
  const fill = doc.querySelector('.hero-dot-fill')
  t.check('hover/focus do not pause the track', !/paused/.test(fill?.getAttribute('style') ?? ''))
  await sleep(POSTER + 400)
  t.check('headline types itself out', (sec.querySelector('main h1')?.textContent ?? '').length < 33)
  t.check('caret marks the typing head', !!sec.querySelector('main h1 [data-caret]'))
  close()
}

/* ======================================================== 2. Transfer table */
console.log('\n=== Transfer table ===')
{
  const { window, doc, close } = await boot({ path: '/transfer' })
  const tbl = doc.querySelector('[role="table"]')
  t.check('uses a grid, not a <table>', !!tbl && doc.querySelectorAll('table').length === 0)
  // `.overflow-x-auto` legitimately wraps the tab strip; what matters is that
  // no table sits inside one.
  t.check(
    'no table inside a horizontal-scroll wrapper',
    ![...doc.querySelectorAll('.overflow-x-auto')].some((w) => w.querySelector('[role="table"]')),
  )

  const rows = [...tbl.querySelectorAll('[role="row"]')]
  const head = rows[0]
  const body = rows[1]
  const hc = [...head.children]
  const bc = [...body.children]
  t.check('header and row have the same cell count', hc.length === bc.length, `${hc.length} vs ${bc.length}`)
  t.check(
    'header and rows share one template class',
    head.className.includes('trf-tpl') && body.className.includes('trf-tpl'),
  )
  t.check('header labels present', head.textContent.replace(/\s+/g, ' ').trim().includes('Date'), head.textContent.trim())

  // Every row must carry the same template too.
  const allSame = rows.every((r) => r.className.includes('trf-tpl'))
  t.check('every row shares the template', allSame, `${rows.length} rows`)

  const trackRule = readCss('.trf-tpl')
  t.check('.trf-tpl defines 3 tracks on mobile', /5\.25rem minmax\(0, 1fr\) minmax\(0, 1fr\)/.test(trackRule))
  t.check('.trf-tpl defines 5 tracks from 640px', /7rem minmax\(0, 1\.1fr\) minmax\(0, 1fr\) 1\.75rem minmax\(0, 1fr\)/.test(trackRule))
  t.check('track count matches the mobile cell count', hc.filter((c) => !isHidden(c)).length === 3, `${hc.filter((c) => !isHidden(c)).length} visible header cells`)
  close()
}
function isHidden(el) {
  return /hidden sm:block/.test(el.className)
}
function readCss(sel) {
  const walk = (rules, out) => {
    for (const r of rules) {
      if (r.selectorText === sel) {
        out.push(r.style.gridTemplateColumns || '')
      }
      // @layer and @media nest further rules
      if (r.cssRules) walk(r.cssRules, out)
    }
  }
  const out = []
  for (const sheet of globalThis.document.styleSheets) {
    try {
      walk(sheet.cssRules, out)
    } catch {
      /* cross-origin sheet */
    }
  }
  return out.join(' | ')
}

/* ============================================================ 3. Dropdowns */
console.log('\n=== Dropdowns (all pages) ===')
for (const path of ['/transfer', '/clubs', '/results', '/register', '/contact']) {
  const { window, doc, sleep, close } = await boot({ path })
  const trigger = doc.querySelector('[aria-haspopup="listbox"]')
  if (!trigger) {
    t.check(`${path} has a dropdown`, false)
    close()
    continue
  }
  const before = trigger.textContent.trim()
  trigger.click()
  await sleep(140)
  const list = doc.querySelector('[role="listbox"]')
  const opts = list ? [...list.querySelectorAll('[role="option"]')] : []
  t.check(`${path}: listbox opens`, !!list, `${opts.length} options`)

  // The regression: pointerdown on an option must NOT be treated as outside.
  const opt = opts[1]
  if (opt) {
    opt.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    const survived = !!doc.querySelector('[role="listbox"]')
    t.check(`${path}: option survives pointerdown`, survived)
    opt.click()
    await sleep(140)
    t.check(`${path}: option commits a value`, trigger.textContent.trim() !== before, `"${before}" -> "${trigger.textContent.trim()}"`)
    t.check(`${path}: menu closes after commit`, !doc.querySelector('[role="listbox"]'))
  }
  close()
}

/* ============================================================== 4. Removals */
console.log('\n=== Removals ===')
{
  const { doc, close } = await boot({ path: '/' })
  t.check('theme toggle gone from the header', !doc.querySelector('header button[aria-label*="theme" i]'))
  // The toggle rendered a sun/moon pair; assert on that rather than a count.
  const bar = doc.querySelector('header')
  const hasToggleButton = [...bar.querySelectorAll('button')].some((b) =>
    /theme|dark|light/i.test(b.getAttribute('aria-label') || ''),
  )
  t.check('no theme button in the header', !hasToggleButton)
  t.check('cart button still present', !!bar.querySelector('button[aria-label*="cart" i]'))
  close()
}
{
  const { doc, close } = await boot({ path: '/clubs/kita-kita-vfc' })
  const text = (doc.querySelector('main')?.textContent || '')
  t.check('club page has no "Add entry" purchase CTA', !/Add entry/.test(text))
  t.check('club page has no "In cart" button', !/In cart/.test(text))
  t.check('club page points at registration instead', /Register a club/.test(text))
  t.check('no SGD price on a club page', !/SGD/.test(text))
  close()
}
{
  const { doc, close } = await boot({ path: '/cart' })
  const text = doc.body.textContent || ''
  t.check('cart has no "Browse entries"', !/Browse entries/.test(text))
  t.check('cart empty state links back to registration', /Back to registration/.test(text))
  close()
}

process.exit(t.summary().fail === 0 ? 0 : 1)
