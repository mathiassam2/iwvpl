/**
 * Lightweight network-awareness and asset prefetch helpers.
 *
 * Keeps tab switches instant on normal connections while respecting mobile
 * Data Saver (`saveData`) and slow 2G links so we never burn a visitor's
 * bandwidth on background prefetches.
 */

interface NetworkInformationLike {
  saveData?: boolean
  effectiveType?: string
}

function getConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike
    mozConnection?: NetworkInformationLike
    webkitConnection?: NetworkInformationLike
  }
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection
}

/** True when background JSON/image prefetching is safe for the current network. */
export function shouldPrefetch(): boolean {
  const conn = getConnection()
  if (!conn) return true
  if (conn.saveData) return false
  if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return false
  return true
}

/** True when preloading heavy images in the background is appropriate. */
export function shouldPrefetchImages(): boolean {
  const conn = getConnection()
  if (!conn) return true
  if (conn.saveData) return false
  if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g') {
    return false
  }
  return true
}

const preloadedUrls = new Set<string>()

/** Gently warms the browser image cache for upcoming tab assets. */
export function preloadImages(urls: Array<string | null | undefined>, maxCount = 12): void {
  if (typeof window === 'undefined' || !shouldPrefetchImages()) return
  let count = 0
  for (const raw of urls) {
    if (count >= maxCount) break
    if (!raw || preloadedUrls.has(raw)) continue
    preloadedUrls.add(raw)
    if (preloadedUrls.size > 300) {
      const oldest = preloadedUrls.values().next().value
      if (oldest) preloadedUrls.delete(oldest)
    }
    const img = new Image()
    img.decoding = 'async'
    img.src = raw
    count++
  }
}

/** Schedules non-urgent prefetch work during browser idle time. */
export function runWhenIdle(fn: () => void, timeout = 1200): () => void {
  if (typeof window === 'undefined') return () => {}
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(fn, { timeout })
    return () => win.cancelIdleCallback?.(id)
  }
  const timer = window.setTimeout(fn, 350)
  return () => window.clearTimeout(timer)
}
