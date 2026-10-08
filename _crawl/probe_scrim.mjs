import { boot } from './harness.mjs'
const { doc } = await boot({ path: '/' })
const scrims = doc.querySelectorAll('[class*="duration-"]')
for (const s of scrims) {
  console.log('SCRIM:', s.className)
}
