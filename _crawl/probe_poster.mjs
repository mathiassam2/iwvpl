import { boot } from './harness.mjs'
const { doc } = await boot({ path: '/' })
const sec = doc.querySelector('[aria-roledescription="carousel"]')
console.log('sec className:', sec.className)
const slide1 = [...doc.querySelectorAll('[data-slide]')].find(e => e.className.includes('opacity-100'))
for (const img of slide1.querySelectorAll('img')) {
  console.log('img', img.getAttribute('src').split('/').pop(), '| parent:', img.parentElement.className, '| object:', img.className.match(/object-(contain|cover)/)?.[0])
}
process.exit(0)
