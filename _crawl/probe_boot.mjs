import { boot } from './harness.mjs'
const { window, doc, sleep } = await boot({ path: '/transfer' })
let prev = 0
for (const t of [0, 100, 200, 400, 800, 1600]) {
  await sleep(t - prev); prev = t
  console.log(`t=${String(t).padStart(4)}  rootLen=${String(doc.getElementById('root').innerHTML.length).padStart(7)}  main=${!!doc.querySelector('main')}  table=${doc.querySelectorAll('table').length}  select=${doc.querySelectorAll('[aria-haspopup="listbox"]').length}`)
}
console.log('main text:', (doc.querySelector('main')?.textContent || '').replace(/\s+/g,' ').slice(0,120))
