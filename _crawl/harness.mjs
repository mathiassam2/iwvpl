/**
 * Shared jsdom harness for verifying the real built bundle.
 *
 * The browser automation tool returns 502 for every module request in this
 * environment (while curl serves the identical files with 200), so UI checks
 * run against `_crawl/verify-dist/app.js` instead.
 */

import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'

export const BUNDLE = '_crawl/verify-dist/app.js'
export const CSS = '_crawl/verify-dist/app.css'

export function cssText() {
  return (
    readFileSync(CSS, 'utf8')
      // jsdom's CSS parser rejects these; harmless for our assertions.
      .replace(/@(property|container|keyframes|supports)[^{]*\{[^}]*\}/g, '')
      .replace(/animation:[^;}]*/g, '')
  )
}

export function stats() {
  let pass = 0
  let fail = 0
  const failures = []
  return {
    check(label, cond, extra = '') {
      const line = `${label}${extra ? '   ' + extra : ''}`
      if (cond) {
        pass++
        console.log(`  PASS  ${line}`)
      } else {
        fail++
        failures.push(label)
        console.log(`  FAIL  ${line}`)
      }
    },
    summary() {
      console.log(`\n  ${pass} passed, ${fail} failed`)
      if (failures.length) console.log('  failing: ' + failures.join(' | '))
      console.log('')
      return { pass, fail, failures }
    },
  }
}

/**
 * Boot the app at `path` with an optional reduced-motion flag.
 * Returns the window plus small helpers.
 */
export async function boot({ path = '/', reduced = false, width = 1400 } = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
    {
      url: 'http://localhost:3000' + path,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    },
  )
  const { window } = dom

  // jsdom has no layout engine, so every measurement-based code path needs a
  // deterministic geometry. This is the viewport, not the app's real layout.
  const viewport = { innerWidth: width, innerHeight: 900 }
  Object.defineProperty(window, 'innerWidth', { value: viewport.innerWidth, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: viewport.innerHeight, configurable: true })

  window.matchMedia = (q) => ({
    matches: q.includes('prefers-reduced-motion') ? reduced : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })
  window.scrollTo = () => {}
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
  window.cancelAnimationFrame = (id) => clearTimeout(id)

  // Every element reports a size, so bounding-rect logic and
  // scrollHeight > clientHeight both behave.
  const W = 320
  const H = 40
  window.Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0, y: 0, left: 0, top: 0,
      right: W, bottom: H, width: W, height: H,
      toJSON() {},
    }
  }
  Object.defineProperty(window.Element.prototype, 'scrollHeight', {
    get() { return this.tagName === 'BODY' ? 4000 : H },
    configurable: true,
  })
  Object.defineProperty(window.Element.prototype, 'clientHeight', {
    get() { return H },
    configurable: true,
  })

  // jsdom implements neither of these; the app calls both.
  window.Element.prototype.scrollIntoView = function () {}
  window.Element.prototype.scrollTo = function () {}

  class IO {
    constructor(cb) {
      this.cb = cb
    }
    observe(el) {
      this.cb([{ isIntersecting: true, target: el }], this)
    }
    unobserve() {}
    disconnect() {}
  }

  const shims = {
    window,
    document: window.document,
    localStorage: window.localStorage,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    matchMedia: window.matchMedia,
    IntersectionObserver: IO,
    scrollTo: window.scrollTo,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    Element: window.Element,
    Node: window.Node,
    getComputedStyle: window.getComputedStyle.bind(window),
    DOMMatrix: class {
      constructor() {
        this.a = 1
      }
    },
  }
  for (const [k, v] of Object.entries(shims)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
  }

  const doc = window.document
  const style = doc.createElement('style')
  style.textContent = cssText()
  doc.head.appendChild(style)

  window.eval(readFileSync(BUNDLE, 'utf8'))

  // The route component is lazy-loaded, so mount happens in stages: shell
  // first, then the page chunk, then its effects. Wait for the page to render.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // Wait for the lazy route chunk to mount.
  for (let i = 0; i < 250; i++) {
    const shell = doc.getElementById('root').innerHTML.length > 20_000
    const page = !!doc.querySelector('main') && !!doc.querySelector('main').textContent.trim()
    if (shell && page) break
    await sleep(20)
  }
  // Let page effects (filters, tab state) settle.
  await sleep(150)

  return { window, doc, sleep, close: () => window.close() }
}
