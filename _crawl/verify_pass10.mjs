/**
 * Pass 10 verification:
 *   1. Format cards no longer use badge pills
 *   2. Contact page has the new hierarchy
 *   3. Slide 1 has no Ken Burns push
 *   4. The carousel controls sit inside the first viewport
 */

import { boot, stats } from './harness.mjs'

const t = stats()
const POSTER_MS = 1100
const active = (doc) =>
  [...doc.querySelectorAll('[data-slide]')].find((e) => e.className.includes('opacity-100'))
const sec = (doc) => doc.querySelector('[aria-roledescription="carousel"]')
const foreground = (el, cls) =>
  [...el.querySelectorAll('img')].find(
    (i) => i.parentElement.className.includes(cls) && !i.className.includes('blur-2xl'),
  )

console.log('\n=== 1. Formats: no badge pills ===')
{
  const { doc, sleep, close } = await boot({ path: '/' })
  const fmt = [...doc.querySelectorAll('section')].find((s) =>
    s.textContent.includes('Four ways to compete'),
  )
  t.check('formats section found', !!fmt)
  const tags = ['11 vs 11', '1 vs 1', 'Coming Soon'].map((x) =>
    [...fmt.querySelectorAll('*')].find((e) => e.textContent.trim() === x),
  )
  t.check('all format tags still present', tags.every(Boolean), `${tags.filter(Boolean).length}/3`)
  const pills = tags.filter((el) => el.className.includes('rounded-full'))
  t.check('no format tag uses a pill', pills.length === 0, `${pills.length} pills`)
  t.check(
    'tags are plain uppercase labels',
    tags.filter(Boolean).every((el) => el.className.includes('uppercase') && el.className.includes('tracking')),
  )
  // No Badge component left inside the format cards.
  const cards = fmt.querySelectorAll('article')
  t.check('no badge elements inside format cards', ![...cards].some((c) => c.querySelector('span.rounded-full.bg-')))
  close()
}

console.log('\n=== 2. Contact page hierarchy ===')
{
  const { doc, sleep, close } = await boot({ path: '/contact' })
  const main = doc.querySelector('main')

  t.check('page title', /Get in touch/i.test(main.textContent))
  t.check(
    'email is the single primary action',
    !!main.querySelector('a[href^="mailto:"]'),
  )
  t.check('email is rendered large', (() => {
    const a = main.querySelector('a[href^="mailto:"]')
    return /2xl|3xl/.test(a.className)
  })())
  t.check('email label exists', /Email/i.test(main.textContent))

  // Old three-icon channel cards are gone.
  t.check('no icon channel cards', main.querySelectorAll('.rounded-card.p-5').length === 0)
  t.check('season is stated', /Season/i.test(main.textContent))
  t.check('base is stated', /Singapore/i.test(main.textContent))

  // Hierarchy: h1 page title, h2 form heading, labelled fields.
  t.check('exactly one h1', main.querySelectorAll('h1').length === 1)
  t.check('form has an h2', !!main.querySelector('h2'))
  for (const f of ['name', 'email', 'subject', 'message']) {
    t.check(`field "${f}" is labelled`, !!doc.querySelector(`label[for="${f}"]`))
  }
  t.check(
    'subject hint is shown under the dropdown',
    /does not fit the other categories/i.test(main.textContent),
  )
  t.check('social links present', (main.querySelectorAll('a[target="_blank"]').length || 0) >= 2)
  t.check('cross-links to registration', /Registration is open/i.test(main.textContent))
  t.check('direct-email fallback under submit', /Or email us directly/i.test(main.textContent))

  // Form still validates and the custom select still commits.
  const submit = [...main.querySelectorAll('button')].find((b) => /Send message/i.test(b.textContent))
  submit.click()
  await sleep(150)
  t.check('empty submit shows errors', main.querySelectorAll('[role="alert"]').length >= 3, `${main.querySelectorAll('[role="alert"]').length} alerts`)
  t.check('focus moves to the first bad field', doc.activeElement?.id === 'name', doc.activeElement?.id ?? '')

  const sel = doc.querySelector('[aria-haspopup="listbox"]')
  sel.click()
  await sleep(150)
  const opt = [...doc.querySelectorAll('[role="option"]')][3]
  opt.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown', { bubbles: true }))
  opt.click()
  await sleep(150)
  t.check('subject dropdown commits', /Sponsorship/.test(sel.textContent), sel.textContent.trim())
  close()
}

console.log('\n=== 3. Slide 1 never moves ===')
{
  const { doc, sleep, close } = await boot({ path: '/' })
  const posterImg = foreground(active(doc), 'lg:block')
  t.check('slide 1 poster is static', !posterImg.className.includes('hero-kenburns'), posterImg.className.match(/hero-\w+/)?.[0] ?? 'no animation class')

  await sleep(POSTER_MS + 1400)
  const layoutImg = foreground(active(doc), 'lg:block')
  t.check('slide 1 is STILL static after the layout arrives', !layoutImg.className.includes('hero-kenburns'))
  t.check('slide 1 switches contain -> cover', layoutImg.className.includes('object-cover'))

  // Slides 2-4 keep their push.
  doc.querySelectorAll('button[aria-label^="Show slide"]')[1].click()
  await sleep(300)
  t.check(
    'slide 2 keeps the Ken Burns push',
    foreground(active(doc), 'lg:block').className.includes('hero-kenburns'),
  )
  close()
}

console.log('\n=== 4. Controls inside the first viewport ===')
{
  const { doc, close } = await boot({ path: '/' })
  const s = sec(doc)
  const cls = s.className
  t.check('section reserves the fixed header height', /pt-16/.test(cls) && /lg:pt-\[72px\]/.test(cls))
  t.check(
    'content box is viewport minus the header',
    /min-h-\[calc\(100svh-4rem\)\]/.test(cls) && /lg:min-h-\[calc\(100svh-4\.5rem\)\]/.test(cls),
    cls.match(/min-h-\[calc[^\]]+\]/g)?.join(' ') ?? '',
  )
  // Mobile: pt-16 = 4rem pairs with min-h calc(100svh - 4rem).
  // Desktop: pt-[72px] = 4.5rem pairs with min-h calc(100svh - 4.5rem).
  t.check('mobile pairing: pt-16 with 4rem', /(?:^|\s)pt-16(?:\s|$)/.test(cls) && /100svh-4rem/.test(cls))
  t.check('desktop pairing: pt-[72px] with 4.5rem', /lg:pt-\[72px\]/.test(cls) && /100svh-4\.5rem/.test(cls))
  const dots = doc.querySelectorAll('button[aria-label^="Show slide"]')
  t.check('dots are pinned to the bottom of the hero', !!dots[0])
  t.check(
    'dots sit inside the section, not after it',
    s.contains(dots[0]),
  )
  close()
}

process.exit(t.summary().fail === 0 ? 0 : 1)
