import { boot } from './harness.mjs'
const { doc } = await boot({ path: '/' })
const scrims = doc.querySelectorAll('[class*="duration-"]')
for (const s of scrims) {
  const cls = String(s.className)
  if (cls.includes('hero-scrim') || cls.includes('opacity-45') || cls.includes('opacity-[0.5]') || cls.includes('opacity-45')) {
    console.log('SCRIM:', cls)
  }
}
