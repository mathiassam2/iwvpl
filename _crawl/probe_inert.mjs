import { boot } from './harness.mjs'
const { doc } = await boot({ path: '/' })
const w = doc.querySelector('[aria-roledescription="carousel"] [class*="transition-opacity"][class*="relative"]')
console.log('wrapper found:', !!w)
console.log('has inert attr:', w?.hasAttribute('inert'))
console.log('outerHTML head:', w?.outerHTML.slice(0, 260))
console.log('setInert in bundle:', /setAttribute\("inert"/.test(await (await import('node:fs/promises')).readFile('_crawl/verify-dist/app.js','utf8')))
