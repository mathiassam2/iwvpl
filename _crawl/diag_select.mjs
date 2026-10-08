/**
 * Does selecting an option from the portalled listbox actually commit?
 *
 * The listbox is rendered with createPortal into document.body, so it sits
 * OUTSIDE the Select's rootRef subtree. The outside-click handler therefore
 * sees an option click as "outside" and closes the menu.
 */

import { boot } from './harness.mjs'

const pages = ['/transfer', '/clubs', '/results', '/register', '/contact', '/standings']

for (const path of pages) {
  const { window, doc, sleep, close } = await boot({ path })
  const trigger = doc.querySelector('[aria-haspopup="listbox"]')
  if (!trigger) {
    console.log(`${path.padEnd(12)} no select on this page`)
    close()
    continue
  }

  const before = trigger.textContent.trim()
  trigger.click()
  await sleep(150)

  const list = doc.querySelector('[role="listbox"]')
  const optCount = list ? list.querySelectorAll('[role="option"]').length : 0
  const inRoot = list ? trigger.closest('[class*="relative"]')?.contains(list) : null

  // Simulate a genuine user click: pointerdown then click, in that order.
  const opt = list?.querySelectorAll('[role="option"]')[1]
  let committed = null
  if (opt) {
    opt.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    const stillOpenAfterPointerDown = !!doc.querySelector('[role="listbox"]')
    opt.click()
    await sleep(150)
    committed = {
      stillOpenAfterPointerDown,
      textAfter: trigger.textContent.trim(),
      changed: trigger.textContent.trim() !== before,
      closedAfterClick: !doc.querySelector('[role="listbox"]'),
    }
  }

  console.log(
    `${path.padEnd(12)} opts=${String(optCount).padStart(3)}  portalOutsideRoot=${inRoot === false}  before="${before}"  after="${committed?.textAfter}"  changed=${committed?.changed}  closed=${committed?.closedAfterClick}`,
  )
  close()
}
console.log('')
