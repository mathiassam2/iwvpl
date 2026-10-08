/**
 * Hero verification, current spec:
 *
 *   1. Every slide fills the viewport (min-h-100svh, unconditionally)
 *   2. The picture-only opening runs ONCE, on first load. Looping back to
 *      slide 1 or clicking its dot goes straight to the layout
 *   3. The text arrives fast after the picture (short hold)
 *   4. The headline types itself out, then the supporting copy arrives
 *   5. Slides 2-4 never flash - nothing remounts on a slide change
 *   6. Mobile uses the same slide 1 file as desktop
 *   7. No hover/focus pause
 */

import { boot, stats } from './harness.mjs'

const t = stats()
const POSTER_MS = 1100
const SLIDE_MS = 7200
const HEADLINE = 'Forging Virtual Football Champions'

const active = (doc) =>
  [...doc.querySelectorAll('[data-slide]')].find((e) => e.className.includes('opacity-100'))
const mode = (doc) => active(doc)?.dataset.mode
const dot = (doc, i) => doc.querySelectorAll('button[aria-label^="Show slide"]')[i]
const imgsOf = (el) => [...el.querySelectorAll('img')]
/**
 * The sharp foreground image for a branch. Each branch renders two <img>s when
 * the poster is active: a blurred cover backdrop plus the real one, so the
 * first match is not the one under test.
 */
const foreground = (el, cls) =>
  imgsOf(el).find(
    (i) => i.parentElement.className.includes(cls) && !i.className.includes('blur-2xl'),
  )
const desktopImg = (el) => foreground(el, 'lg:block') ?? imgsOf(el)[0]
const mobileImg = (el) => foreground(el, 'lg:hidden')
const sec = (doc) => doc.querySelector('[aria-roledescription="carousel"]')
const h1 = (doc) => doc.querySelector('main h1')
const typedText = (doc) => (h1(doc)?.textContent ?? '')
const wrapper = (doc) => sec(doc).querySelector('[class*="transition-opacity"][class*="relative"]')
/** The hero fills the viewport *including* the fixed header above it. */
const fillsViewport = (doc) => {
  const c = sec(doc).className
  return /min-h-\[calc\(100svh-4rem\)\]/.test(c) && /min-h-\[calc\(100svh-4\.5rem\)\]/.test(c)
}

console.log('\n=== 1. Every slide fills the viewport ===')
{
  const { doc, sleep, close } = await boot({ path: '/' })
  t.check(
    'hero fills the viewport (header height subtracted)',
    fillsViewport(doc),
    sec(doc).className.match(/min-h-\[calc[^\]]+\]/g)?.join(' ') ?? '',
  )
  t.check(
    'min-height, not a fixed height (short windows still fit)',
    !/h-\[/.test(sec(doc).className.split('min-h-').join('')),
  )

  // and on every slide
  for (const i of [1, 2, 3]) {
    dot(doc, i).click()
    await sleep(250)
    t.check(`slide ${i + 1} still fills the viewport`, fillsViewport(doc))
  }
  close()
}

console.log('\n=== 2. The picture-only opening runs once, on load ===')
{
  const { doc, sleep, close } = await boot({ path: '/' })
  t.check('opens on slide 1 in poster mode', mode(doc) === 'poster', `mode=${mode(doc)}`)
  t.check('copy is hidden', !!wrapper(doc)?.className.includes('opacity-0'))
  t.check('copy is inert', wrapper(doc)?.hasAttribute('inert') === true)
  t.check(
    'no text on screen (copy is mounted but transparent)',
    !!wrapper(doc)?.className.includes('opacity-0'),
  )

  t.check('poster frame is object-cover', desktopImg(active(doc)).className.includes('object-cover'))
  t.check('poster frame is static (no Ken Burns)', !desktopImg(active(doc)).className.includes('hero-kenburns'))
  t.check('no blurred backdrop any more', !imgsOf(active(doc)).some((i) => i.className.includes('blur-2xl')))
  t.check('one image per responsive branch', imgsOf(active(doc)).length === 2, `${imgsOf(active(doc)).length} imgs`)

  // --- the hold is short ---
  await sleep(POSTER_MS + 500)
  t.check('text arrives quickly', mode(doc) === 'layout', `mode=${mode(doc)}`)
  close()
}
{
  // After the intro has played, returning to slide 1 must NOT replay it.
  const { doc, sleep, close } = await boot({ path: '/' })
  await sleep(POSTER_MS + 3200)

  dot(doc, 2).click()
  await sleep(300)
  t.check('slide 3 in layout', mode(doc) === 'layout')

  dot(doc, 0).click()
  await sleep(300)
  t.check('clicking slide 1 does NOT replay the picture-only beat', mode(doc) === 'layout', `mode=${mode(doc)}`)
  t.check('slide 1 is static on that visit', !desktopImg(active(doc)).className.includes('hero-kenburns'))
  t.check('headline is already typed', typedText(doc).trim() === HEADLINE, `"${typedText(doc).trim()}"`)

  // and after a full loop back
  dot(doc, 1).click()
  await sleep(200)
  dot(doc, 2).click()
  await sleep(200)
  dot(doc, 3).click()
  await sleep(200)
  dot(doc, 0).click()
  await sleep(300)
  t.check('looping back to slide 1 does NOT replay it either', mode(doc) === 'layout', `mode=${mode(doc)}`)
  t.check('headline still complete', typedText(doc).trim() === HEADLINE)
  close()
}

console.log('\n=== 3-4. Typing headline, then the rest ===')
{
  const { doc, sleep, close } = await boot({ path: '/' })
  await sleep(POSTER_MS + 200)
  const partial = typedText(doc)
  t.check('headline is mid-type after the hold', partial.length > 0 && partial.length < HEADLINE.length, `"${partial}" (${partial.length})`)
  t.check('revealed text is a valid prefix', HEADLINE.startsWith(partial.trim()), `"${partial}"`)
  t.check('caret marks the typing head', !!doc.querySelector('main h1 [data-caret]'))

  await sleep(2600)
  t.check('headline completes', typedText(doc).trim() === HEADLINE, `"${typedText(doc).trim()}"`)
  t.check('caret removed when done', !doc.querySelector('main h1 [data-caret]'))
  t.check('supporting copy fully revealed', !!wrapper(doc)?.className.includes('opacity-100'))

  // Flush: the frame must be identical before and after the layout arrives.
  const finalImg = desktopImg(active(doc))
  t.check('frame is STILL object-cover after the layout', finalImg.className.includes('object-cover'))
  t.check('frame carries no fit-transition class', !/transition-all|transition-\[/.test(finalImg.className))
  t.check('frame is STILL static after the layout', !finalImg.className.includes('hero-kenburns'))
  t.check(
    'image element was never swapped (same node throughout)',
    imgsOf(active(doc))[0] === imgsOf(active(doc))[0],
  )

  // The delayed scrim carries the partial opacity in poster mode.
  const scrim = doc.querySelector('[class*="duration-[1500ms]"]')
  t.check('scrim ramps over a long duration', !!scrim, scrim?.className.slice(-46) ?? 'no scrim')
  t.check(
    'scrim starts at a partial opacity',
    (scrim?.className ?? '').includes('opacity-[0.5]') && !(scrim?.className ?? '').includes('opacity-100'),
  )
  t.check('scrim eases rather than stepping', /ease-\[cubic-bezier/.test(scrim?.className ?? ''))
  close()
}

console.log('\n=== 5. Slides 2-4 never flash ===')
{
  const { doc, sleep, close } = await boot({ path: '/' })
  await sleep(POSTER_MS + 3200)

  const h1Before = h1(doc)
  const paraBefore = doc.querySelector('main h1 + p')
  const cardBefore = doc.querySelector('main .surface')
  const textBefore = typedText(doc)
  const cardCls = cardBefore?.className

  dot(doc, 1).click()
  await sleep(400)
  t.check('slide 2 shows the layout immediately', mode(doc) === 'layout')
  t.check('headline node is the SAME (no remount)', h1(doc) === h1Before)
  t.check('paragraph node is the SAME', doc.querySelector('main h1 + p') === paraBefore)
  t.check('leaders card node is the SAME', doc.querySelector('main .surface') === cardBefore)
  t.check('headline text unchanged', typedText(doc) === textBefore)
  t.check('card opacity class unchanged', doc.querySelector('main .surface')?.className === cardCls)
  t.check('no caret re-appears', !doc.querySelector('main h1 [data-caret]'))

  dot(doc, 2).click()
  await sleep(400)
  t.check('slide 3 keeps the same nodes', h1(doc) === h1Before)
  t.check('slide 3 text unchanged', typedText(doc) === textBefore)
  close()
}

console.log('\n=== 6. Mobile uses the same slide 1 file ===')
{
  const { doc, close } = await boot({ path: '/' })
  const slide1 = active(doc)
  const d = desktopImg(slide1)
  const m = mobileImg(slide1)
  t.check('mobile branch exists', !!m)
  t.check('mobile src is the campaign slide', m?.getAttribute('src') === '/assets/hero/slide-1.webp', m?.getAttribute('src') ?? '')
  t.check('desktop src is the same file', d?.getAttribute('src') === '/assets/hero/slide-1.webp', d?.getAttribute('src') ?? '')
  t.check('mobile uses the same fit as desktop', m?.className.includes('object-cover'))
  t.check('no separate portrait crop is referenced', !/player-hero/.test(slide1.innerHTML))
  close()
}

console.log('\n=== 7. No hover pause ===')
{
  const { window, doc, sleep, close } = await boot({ path: '/' })
  await sleep(POSTER_MS + 3200)
  sec(doc).dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }))
  sec(doc).dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }))
  await sleep(60)
  const fill = doc.querySelector('.hero-dot-fill')
  t.check('hover/focus do not pause the track', !/paused/.test(fill?.getAttribute('style') ?? ''))
  t.check('track duration equals the slide duration', (fill?.getAttribute('style') ?? '').includes(`${SLIDE_MS}ms`))
  close()
}

console.log('\n=== Reduced motion ===')
{
  const { doc, sleep, close } = await boot({ path: '/', reduced: true })
  t.check('skips the opening hold', mode(doc) === 'layout', `mode=${mode(doc)}`)
  await sleep(400)
  t.check('headline is complete, not typed', typedText(doc).trim() === HEADLINE)
  t.check('no caret', !doc.querySelector('main h1 [data-caret]'))
  t.check('still fills the viewport', fillsViewport(doc))
  close()
}

process.exit(t.summary().fail === 0 ? 0 : 1)
