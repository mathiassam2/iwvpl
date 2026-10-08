/**
 * Diagnostics: why does the transfer page dropdown not open, and why is the
 * transfer table laid out badly?
 */

import { boot } from './harness.mjs'

const { window, doc, sleep } = await boot({ path: '/transfer' })

console.log('\n=== transfer page ===')
console.log('selects:', doc.querySelectorAll('[aria-haspopup="listbox"]').length)
console.log('tables:', doc.querySelectorAll('table').length)
console.log('role=table grids:', doc.querySelectorAll('[role="table"]').length)

const trigger = doc.querySelector('[aria-haspopup="listbox"]')
console.log('\ntrigger id:', trigger?.id)
console.log('trigger rect width:', trigger?.getBoundingClientRect().width)

// Open it.
trigger.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
trigger.click()
await sleep(200)

const list = doc.getElementById(trigger.getAttribute('aria-controls') || '') || doc.querySelector('[role="listbox"]')
console.log('\nafter click:')
console.log('  aria-expanded:', trigger.getAttribute('aria-expanded'))
console.log('  listbox in DOM:', !!list)
console.log('  listbox parent:', list?.parentElement?.tagName)
console.log('  options:', list ? list.querySelectorAll('[role="option"]').length : 0)
console.log('  listbox style:', list?.getAttribute('style'))
console.log('  computed position:', list ? window.getComputedStyle(list).position : null)

// Real user interaction: pointerdown on the trigger then click.
console.log('\n--- pointerdown-then-click path ---')
const t2 = doc.querySelector('[aria-haspopup="listbox"]')
t2.click()
await sleep(120)
console.log('  expanded:', t2.getAttribute('aria-expanded'))
console.log('  listbox:', !!doc.querySelector('[role="listbox"]'))

console.log('\n--- click an option ---')
const opt = doc.querySelector('[role="option"]')
if (opt) {
  opt.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
  opt.click()
  await sleep(150)
  console.log('  still open:', !!doc.querySelector('[role="listbox"]'))
  console.log('  trigger text:', t2.textContent.trim().slice(0, 30))
}

// Table geometry.
console.log('\n=== transfer table ===')
const table = doc.querySelector('table')
if (table) {
  const ths = [...table.querySelectorAll('thead th')]
  const td0 = [...table.querySelectorAll('tbody tr:first-child td')]
  console.log('th count:', ths.length)
  console.log('td count:', td0.length)
  console.log('headers:', ths.map((e) => e.textContent.trim().slice(0, 8)))
  console.log('first row:', td0.map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 12)))
  console.log('table classes:', table.className)
  console.log('wrapper classes:', table.parentElement.className)
  console.log('thead tr classes:', table.querySelector('thead tr').className)
}
console.log('')
