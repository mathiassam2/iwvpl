/**
 * Mobile fit check: find anything that would force a horizontal scrollbar.
 *
 * jsdom has no layout, so this works statically - it looks for the constructs
 * that actually cause sideways scrolling (a min-width on a table-ish element,
 * a wide fixed grid template, an overflow-x wrapper around a table) plus any
 * hard-coded pixel width that exceeds a phone viewport.
 */

import { boot } from './harness.mjs'

const ROUTES = [
  '/', '/standings', '/results', '/schedule', '/clubs', '/transfer',
  '/leaderboard', '/news', '/about', '/contact', '/register', '/login',
  '/cart', '/clubs/kita-kita-vfc', '/zzz',
]

const PHONE = 390

let problems = 0
let checks = 0

for (const path of ROUTES) {
  const { doc, close } = await boot({ path, width: PHONE })
  const found = []

  for (const el of doc.querySelectorAll('*')) {
    const cls = (el.className || '').toString()

    // A min-width wider than the viewport guarantees a scrollbar.
    for (const m of cls.matchAll(/min-w-\[(\d+)px\]/g)) {
      found.push(`min-w-[${m[1]}px] on <${el.tagName.toLowerCase()}> "${cls.slice(0, 40)}"`)
    }
    // Explicit pixel widths beyond the viewport.
    for (const m of cls.matchAll(/(?<!max-)(?<!min-)w-\[(\d{4,})px\]/g)) {
      found.push(`w-[${m[1]}px] on <${el.tagName.toLowerCase()}> "${cls.slice(0, 40)}"`)
    }
    // A table inside a horizontal scroller is a sideways-scroll affordance.
    if (el.classList.contains('overflow-x-auto') && el.querySelector('table, [role="table"]')) {
      found.push(`horizontal scroller around a table: "${cls.slice(0, 50)}"`)
    }
    // Real <table>s are the class of element that broke twice already.
    if (el.tagName === 'TABLE') {
      found.push(`raw <table>: "${cls.slice(0, 50)}"`)
    }
  }

  checks++
  if (found.length) {
    problems++
    console.log(`\n${path}`)
    for (const f of [...new Set(found)]) console.log(`   - ${f}`)
  }
  close()
}

console.log(`\n  ${ROUTES.length} routes checked at ${PHONE}px`)
console.log(problems === 0 ? '  no sideways-scroll risks found\n' : `  ${problems} route(s) need attention\n`)
process.exit(problems === 0 ? 0 : 1)
