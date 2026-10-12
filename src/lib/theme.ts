/**
 * Theme — DARK ONLY.
 *
 * The in-app toggle has been removed, so there is no longer a second theme to
 * choose between. What was left behind was the resolution logic, and it still
 * asked the operating system:
 *
 *     window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
 *
 * so a visitor whose OS was set to light got a light site, with no toggle to
 * correct it. That was the bug. This module now makes it impossible rather
 * than merely unlikely.
 *
 * Two decisions worth naming:
 *
 *  - NEITHER the system preference NOR localStorage is consulted. Both are a
 *    way for the page to end up light, and the light token block has been
 *    deleted from index.css, so there is nothing left to render even if
 *    something tried. A guard that can be defeated by a stale key is not a
 *    guard.
 *  - `iwvpl-theme` is actively REMOVED, not just ignored. Anyone who picked
 *    light while the toggle still existed carries `'light'` in their
 *    localStorage from that visit, and leaving it there is a trap for whatever
 *    reads the key next.
 *
 * The resolution logic used to be duplicated in `index.html` as an inline
 * pre-paint script. That duplication is why the bug survived a toggle removal:
 * the fix had to be made twice, and the second copy was easy to miss. The
 * inline script is gone. `<html class="dark">` in the markup plus
 * `color-scheme: dark` on `:root` in the stylesheet already paint the page
 * dark before any JavaScript runs, so there is nothing for a pre-paint script
 * left to do.
 */

export type Theme = 'dark'

/** Legacy key from when the toggle existed. Cleared on boot, never read. */
const STORAGE_KEY = 'iwvpl-theme'

const DARK_INK = '#0a0b0d'

function apply() {
  const root = document.documentElement
  // `.light` is removed defensively, even though nothing sets it any more.
  root.classList.remove('light')
  root.classList.add('dark')
  // Tells the browser to render its own UI dark as well - scrollbars, form
  // controls, autofill, the canvas behind the document. Without this an OS set
  // to light still paints light scrollbars down the side of a dark site, which
  // is the same bug wearing a different hat.
  root.style.colorScheme = 'dark'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', DARK_INK)
}

/** Applies the dark theme before the first paint. Called from main.tsx. */
export function initTheme() {
  apply()
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage blocked - nothing to clear, and nothing reads it */
  }
}

/* ---------- scroll helpers used by the parallax layer ---------- */

export function scrollY(): number {
  return window.scrollY
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}