import { boot } from './harness.mjs'
const { doc, sleep } = await boot({ path: '/' })
await sleep(100)
const scrim = doc.querySelector('[class*="duration-[1500ms]"]')
console.log('scrim found:', !!scrim)
console.log('className:', scrim?.className)
console.log('has opacity-[0.5]:', scrim?.className?.includes('opacity-[0.5]'))
console.log('has opacity-100:', scrim?.className?.includes('opacity-100'))
