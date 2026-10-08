import { boot } from './harness.mjs'
const { doc, sleep } = await boot({ path: '/' })
await sleep(2200 + 300)
console.log('h1 exists:', !!doc.querySelector('main h1'))
console.log('caret via attr:', !!doc.querySelector('main h1 [data-caret]'))
console.log('any caret:', !!doc.querySelector('[data-caret]'))
console.log('h1 html:', doc.querySelector('main h1')?.innerHTML.slice(-260))
