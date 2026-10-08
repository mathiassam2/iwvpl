export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'iwvpl-theme'

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* storage blocked - fall through to system preference */
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

let current: Theme = 'dark'
const listeners = new Set<(t: Theme) => void>()

function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  root.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0b0d' : '#f6f7f4')
}

/** Applies the stored theme before first paint (called from index.html). */
export function initTheme() {
  current = readInitial()
  apply(current)
}

export function getTheme(): Theme {
  return current
}

export function setTheme(theme: Theme) {
  current = theme
  apply(theme)
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(theme))
}

export function toggleTheme(): Theme {
  setTheme(current === 'dark' ? 'light' : 'dark')
  return current
}

export function subscribe(fn: (t: Theme) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/* ---------- scroll helpers used by the parallax layer ---------- */

export function scrollY(): number {
  return window.scrollY
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}