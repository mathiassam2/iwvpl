import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ButtonLink } from '@/components/ui'
import { SITE } from '@/data'
import { asset } from '@/lib/assets'
import { useCart } from '@/lib/cart'
import { cx } from '@/lib/format'
import { setInert } from '@/lib/inert'
import { CartPanel } from '@/pages/CartPage'

const LEAGUE_LINKS = [
  { label: 'Standings', href: '/standings', desc: 'League tables & form guides' },
  { label: 'Results', href: '/results', desc: 'Every completed fixture' },
  { label: 'Schedule', href: '/schedule', desc: 'Upcoming kick-off times' },
  { label: 'Leaderboard', href: '/leaderboard', desc: 'Top scorers, assists & saves' },
  { label: 'Clubs', href: '/clubs', desc: 'Registered clubs & rosters' },
  { label: 'Transfer', href: '/transfer', desc: 'Signings, releases & moves' },
]

const PRIMARY = [
  { label: 'News', href: '/news' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
]

/* Black artwork on transparent: correct on paper, `dark:invert` flips it to
   white on ink. One rule covers both themes. */
const LOGO_WORDMARK = asset('/assets/brand/iwvpl-wordmark.png')

/** Logo: bare artwork on the page — no plate, no ring, no background. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cx('group flex shrink-0 items-center', className)}
      aria-label="IWVPL — home"
    >
      <img
        src={LOGO_WORDMARK}
        alt="IWVPL"
        className="h-8 w-auto select-none object-contain transition-all duration-300 group-hover:opacity-80 sm:h-9 dark:invert"
      />
    </Link>
  )
}

/** Mega-menu with hover intent.
 *
 *  - The wrapper spans the trigger-to-panel gap (pt-3) so the pointer never
 *    crosses dead space, and closing is deferred, so the menu cannot vanish
 *    mid-move.
 *  - The trigger's click handler deliberately does NOT toggle: hovering has
 *    already opened the menu, so toggling would close it again on the same
 *    interaction. Closing is owned by mouseleave / blur / Escape only.
 *  - While closed the panel is `inert`, so its links stay out of the tab order
 *    and the accessibility tree.
 */
function LeagueMenu() {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const groupRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const clearClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = undefined
    }
  }

  const openNow = useCallback(() => {
    clearClose()
    setOpen(true)
  }, [])

  const closeSoon = useCallback((delay = 240) => {
    clearClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), delay)
  }, [])

  const closeNow = useCallback(() => {
    clearClose()
    setOpen(false)
  }, [])

  useEffect(() => clearClose, [])

  // `inert` must be set imperatively: React 18 drops it as a prop.
  useEffect(() => {
    setInert(panelRef.current, !open)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      closeNow()
      groupRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeNow])

  return (
    <div
      ref={groupRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={() => closeSoon()}
      onBlur={(e) => {
        if (!groupRef.current?.contains(e.relatedTarget as Node)) closeSoon(140)
      }}
    >
      <button
        onClick={openNow}
        onFocus={openNow}
        aria-expanded={open}
        aria-haspopup="true"
        className="nav-underline flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
        data-active={open || undefined}
      >
        League
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden
          className={cx('transition-transform duration-300', open && 'rotate-180')}
        >
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      <div
        ref={panelRef}
        aria-hidden={!open}
        className={cx(
          'absolute left-1/2 top-full w-[600px] -translate-x-1/2 pt-3',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        <div
          className={cx(
            // Same material as the bar so the menu reads as part of it rather
            // than an opaque card dropped underneath a translucent strip.
            'glass-panel overflow-hidden rounded-card transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]',
            open ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
          )}
        >
          <div className="border-b border-[var(--glass-border)] bg-white/[0.04] px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              {SITE.season}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              IWVPL Pro Club League — follow every division.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-0.5 p-2">
            {LEAGUE_LINKS.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                onClick={closeNow}
                className="group/item rounded-md px-3 py-2.5 transition-colors hover:bg-[var(--surface-hover)]"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-strong)]">
                  {l.label}
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden
                    className="opacity-0 transition-all duration-300 group-hover/item:translate-x-0.5 group-hover/item:opacity-100"
                  >
                    <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">
                  {l.desc}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Header cart trigger: bag icon + live item count, opens the side panel. */
function CartButton() {
  const { count, openPanel, pulse } = useCart()
  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label={count ? `Open cart, ${count} item${count === 1 ? '' : 's'}` : 'Open cart'}
      data-pulse={pulse || undefined}
      className="relative grid h-10 w-10 place-items-center rounded-lg border border-[var(--border-strong)] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-hover)]"
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M4 6.5h12l-1 10.5a1.5 1.5 0 0 1-1.5 1.4H6.5A1.5 1.5 0 0 1 5 17L4 6.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M7.5 8.5V5.8a2.5 2.5 0 0 1 5 0v2.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {count > 0 && (
        <span
          key={pulse}
          aria-hidden
          className="cart-badge absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-[var(--accent-solid)] px-1 text-[10px] font-bold leading-[18px] text-[var(--on-volt)]"
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  // Open by default: the drawer is mostly league links, so hiding them behind
  // another toggle just added a tap.
  const [mobileLeague, setMobileLeague] = useState(true)
  /* The bar is bare at the top of the page so the hero artwork runs under it,
     then frosts in once the content scrolls beneath. Hovering or tab-focusing
     it also frosts it, so a pointer resting at the top of the page still gets
     the treatment rather than sitting on unreadable artwork. */
  const [scrolled, setScrolled] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const { pathname } = useLocation()

  const frosted = scrolled || hovered || focusWithin

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    /* Hover and focus are sticky across navigation: clicking a nav link leaves
       focus on it, and the pointer is still sitting over the bar. Both kept the
       header frosted at the top of a freshly loaded page, so it never returned to
       transparent. Clear both on route change - `preventScroll` so blurring a
       focused link cannot itself scroll the page. The blur fires the header's
       own onBlur, which is harmless now that the state is already reset. */
    setHovered(false)
    setFocusWithin(false)
    if (document.activeElement instanceof HTMLElement) {
      /* `blur({ preventScroll })` is not in this project's DOM typings, and a
         plain blur() can scroll the focused element into view. Record the
         position and put it straight back. */
      const y = window.scrollY
      document.activeElement.blur()
      if (window.scrollY !== y) window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })
    }
  }, [pathname])

  /* Navigating back to a page restores the previous scroll position, which can
     land us past the threshold with no scroll event having fired. Re-read on
     every route change so the bar starts in the right state. */
  useEffect(() => {
    setScrolled(window.scrollY > 8)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  return (
    // Fixed height at every breakpoint and scroll position - only the surface
    // treatment changes, never the metrics, so nothing "resizes".
    <header
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false)
      }}
      className={cx(
        'fixed inset-x-0 top-0 z-50 h-16 lg:h-[72px]',
        // The drawer needs a solid bar plus a seam: both scrim and sheet start
        // below the header, so nothing behind them should show through.
        mobileOpen && 'border-b border-[var(--border)] bg-[var(--bg-raised)]',
      )}
    >
      {/* The frost lives on its own layer so it can fade as opacity.
          `backdrop-filter` and `background-color` cannot be transitioned
          smoothly - animating them directly either snaps or does nothing - so
          the bar cross-fades a separate overlay instead. The header box itself
          carries no background, which is what leaves it bare at the top.

          Long enough to smooth the swap, short enough not to trail the scroll.
          700ms read as laggy; the previous 450ms expo curve read as a flick. This
          sits between the two: a quick, heavily-eased curve that leaves quickly
          but never snaps. */}
      <div
        aria-hidden
        data-frosted={frosted ? '' : undefined}
        className={cx(
          'glass pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[280ms]',
          'ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
          'data-[frosted]:opacity-100',
        )}
      />

      <div className="relative mx-auto flex h-full w-full max-w-[110rem] items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
        <Logo />

        {/* ---------- desktop nav ---------- */}
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
          <LeagueMenu />

          {PRIMARY.map((l) => (
            <NavLink
              key={l.href}
              to={l.href}
              className={({ isActive }) =>
                cx(
                  'nav-underline rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                  isActive
                    ? 'text-[var(--text-strong)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]',
                )
              }
            >
              {({ isActive }) => (
                <span data-active={isActive} className="contents">
                  {l.label}
                </span>
              )}
            </NavLink>
          ))}

          <span aria-hidden className="mx-1.5 h-5 w-px bg-[var(--border-strong)]" />

          <NavLink
            to="/login"
            className={({ isActive }) =>
              cx(
                'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                isActive
                  ? 'text-[var(--text-strong)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]',
              )
            }
          >
            Login
          </NavLink>
        </nav>

        {/* ---------- actions ---------- */}
        <div className="flex items-center gap-2">
          <CartButton />
          <ButtonLink to="/register" size="sm" className="hidden sm:inline-flex">
            Register
          </ButtonLink>

          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border-strong)] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-hover)] lg:hidden"
          >
            <span className="relative block h-4 w-5">
              <span
                className={cx(
                  'absolute left-0 h-[1.8px] w-5 rounded bg-current transition-all duration-300',
                  mobileOpen ? 'top-[7px] rotate-45' : 'top-0.5',
                )}
              />
              <span
                className={cx(
                  'absolute left-0 top-[7px] h-[1.8px] w-5 rounded bg-current transition-all duration-200',
                  mobileOpen && 'opacity-0',
                )}
              />
              <span
                className={cx(
                  'absolute left-0 h-[1.8px] w-5 rounded bg-current transition-all duration-300',
                  mobileOpen ? 'top-[7px] -rotate-45' : 'top-[13.5px]',
                )}
              />
            </span>
          </button>
        </div>
      </div>

      <CartPanel />

      {/* ---------- mobile drawer ---------- */}
      {/* A scrim sits behind the sheet, and the sheet itself is fully opaque.
          A translucent panel over the hero just looked like a rendering bug. */}
      {/* Starts BELOW the bar. It used to be `inset-0`, and because the header
          is translucent glass the black scrim showed through it - the top bar
          looked darkened instead of the page content behind the sheet. */}
      <div
        aria-hidden
        onClick={() => setMobileOpen(false)}
        className={cx(
          'fixed inset-x-0 bottom-0 top-16 z-40 bg-black/65 transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <div
        className={cx(
          'fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain',
          'border-b border-[var(--border-strong)] bg-[var(--bg-raised)] shadow-[var(--shadow-lift)]',
          'transition-[transform,opacity,visibility] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden',
          mobileOpen
            ? 'visible translate-y-0 opacity-100'
            : 'invisible pointer-events-none -translate-y-3 opacity-0',
        )}
      >
        <div className="mx-auto w-full max-w-[110rem] px-5 py-5 sm:px-6 lg:px-8">
          <button
            onClick={() => setMobileLeague((v) => !v)}
            aria-expanded={mobileLeague}
            className="mb-3 flex w-full items-center justify-between"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              League
            </span>
            <span
              aria-hidden
              className={cx(
                'grid h-6 w-6 place-items-center rounded-full border border-[var(--border-strong)] text-[var(--text-muted)] transition-transform duration-300',
                mobileLeague && 'rotate-180 border-[var(--accent-ring)] text-[var(--accent-text)]',
              )}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M1 4l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
          </button>

          <div
            className={cx(
              'grid transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]',
              mobileLeague ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="overflow-hidden">
              <div className="grid grid-cols-2 gap-1 pb-1">
                {LEAGUE_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    to={l.href}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 transition-colors hover:border-[var(--accent-ring)]"
                  >
                    <span className="block text-sm font-semibold text-[var(--text-strong)]">
                      {l.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
                      {l.desc}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <p className="mb-3 mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Explore
          </p>
          <div className="flex flex-col">
            {[...PRIMARY, { label: 'Login', href: '/login' }].map((l) => (
              <NavLink
                key={l.href}
                to={l.href}
                className={({ isActive }) =>
                  cx(
                    'border-b border-[var(--border)] py-3 text-[15px] font-semibold transition-colors',
                    isActive ? 'text-[var(--accent-text)]' : 'text-[var(--text)]',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>

          <ButtonLink to="/register" size="lg" className="mt-6 w-full">
            Register your team
          </ButtonLink>
        </div>
      </div>
    </header>
  )
}

export { LOGO_WORDMARK }