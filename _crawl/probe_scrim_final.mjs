import { boot } from './harness.mjs'
const { doc, sleep } = await boot({ path: '/' })

// Check immediately
const scrim1 = doc.querySelector('[class*="duration-[1500ms]"]')
console.log('immediate:', !!scrim1, scrim1?.className?.includes('opacity-[0.5]'))

// Wait a tiny bit
await sleep(50)
const scrim2 = doc.querySelector('[class*="duration-[1500ms]"]')
console.log('after 50ms:', !!scrim2, scrim2?.className)

// Check all scrims
const all = document.querySelectorAll('[class*="duration-"]')
for (const s of all) {
  const cls = String(s.className)
  if (cls.includes('1500ms') || cls.includes('opacity-')) {
    console.log('ALL:', cls)
  }
}
