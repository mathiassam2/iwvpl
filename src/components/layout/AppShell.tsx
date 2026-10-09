import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'

/** Resets scroll on every route change (but preserves in-page hash jumps). */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) return
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, hash])
  return null
}

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--accent-solid)] focus:px-4 focus:py-2 focus:font-semibold focus:text-[var(--on-volt)]"
      >
        Skip to content
      </a>

      <ScrollToTop />
      <Header />

      <main id="main" className="flex-1 pt-16 lg:pt-[72px]">
        {children ?? <Outlet />}
      </main>

      <Footer />
    </div>
  )
}