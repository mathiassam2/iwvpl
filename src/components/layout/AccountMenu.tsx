/**
 * Signed-in header controls: the notification bell and the account menu.
 *
 * Replaces the flat Login link when a session exists. The menu is the only
 * place a signed-in person can leave their account, so it also carries the
 * logout that has to clear the cookie server-side — clearing it in the client
 * alone would leave a live session row that nobody can see but still works.
 *
 * Dropdowns close on Escape, on outside click and on route change. The last one
 * matters: without it a menu opened over the dashboard stays open on top of
 * whatever the link navigated to.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { listNotifications, markNotificationsRead, type Notification } from '@/lib/api'
import { cx } from '@/lib/format'

/** Shared open/close plumbing for both dropdowns. */
function useDropdown(onNavigate?: () => void) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const location = useLocation()

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  // A navigation changes the URL without a click on the panel, so the outside
  // handler never fires for it.
  useEffect(() => {
    setOpen(false)
    onNavigate?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  return { open, setOpen, ref }
}

const panel =
  'absolute right-0 top-[calc(100%+10px)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden ' +
  'rounded-card border border-[var(--border-strong)] bg-[var(--surface)] shadow-2xl ' +
  'shadow-black/40 animate-[pageEnter_.16s_ease-out]'

const row =
  'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ' +
  'hover:bg-[var(--surface-hover)]'

/* --------------------------------------------------------------- bell */

function NotificationBell() {
  const { user, setUnread } = useAuth()
  const { open, setOpen, ref } = useDropdown()
  const [items, setItems] = useState<Notification[] | null>(null)

  // Opening the panel is the read receipt. Fetching lazily on open keeps the
  // header from polling a table nobody is looking at.
  useEffect(() => {
    if (!open) return
    let live = true
    void (async () => {
      try {
        const data = await listNotifications()
        if (!live) return
        setItems(data.notifications)
        setUnread(data.unread)
        if (data.unread > 0) {
          await markNotificationsRead()
          setUnread(0)
        }
      } catch {
        if (live) setItems([])
      }
    })()
    return () => {
      live = false
    }
  }, [open, setUnread])

  if (!user) return null
  const unread = user.unread

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-lg border border-[var(--border-strong)] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-hover)]"
      >
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M10 2.5a4.75 4.75 0 0 0-4.75 4.75v3L4 13.5h12L14.75 10.25v-3A4.75 4.75 0 0 0 10 2.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 16a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--accent-text)] px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={panel} role="dialog" aria-label="Notifications">
          <p className="border-b border-[var(--border-strong)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
            Notifications
          </p>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <p className={cx(row, 'text-[var(--text-muted)]')}>Loading…</p>
            ) : items.length === 0 ? (
              <p className={cx(row, 'text-[var(--text-muted)]')}>Nothing here yet.</p>
            ) : (
              items.map((n) => (
                <div key={n.id} className="border-b border-[var(--border-strong)] last:border-0 px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">{n.title}</p>
                  {n.body && (
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">{n.body}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">
                    {new Date(n.created_at.replace(' ', 'T') + 'Z').toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- account */

export default function AccountMenu() {
  const { user, loading, signOut } = useAuth()
  const { open, setOpen, ref } = useDropdown()
  const navigate = useNavigate()

  const initials = useCallback(
    (name: string) =>
      name
        .split(/[\s_]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join(''),
    [],
  )

  // Render nothing while the session is being resolved. Mounting a Login link
  // and replacing it with the account menu a frame later makes the header jump
  // and flashes the wrong affordance.
  if (loading) return <div className="h-10 w-24" aria-hidden />

  if (!user) return null

  const roleLabel =
    user.role === 'player'
      ? 'Player'
      : user.role === 'club_manager'
        ? 'Manager'
        : user.role === 'admin'
          ? 'Admin'
          : 'Owner'

  const onSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="flex items-center gap-2">
      <NotificationBell />

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border-strong)] pl-1.5 pr-2.5 transition-colors hover:bg-[var(--surface-hover)]"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--accent-tint)] text-[11px] font-bold text-[var(--accent-text)]">
            {initials(user.name)}
          </span>
          <span className="hidden max-w-[9rem] truncate text-sm font-semibold text-[var(--text-strong)] sm:inline">
            {user.name}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="shrink-0">
            <path d="m2 4 3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {open && (
          <div className={panel} role="menu">
            <div className="border-b border-[var(--border-strong)] px-4 py-3">
              <p className="truncate text-sm font-bold text-[var(--text-strong)]">{user.name}</p>
              <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{user.email}</p>
              <p className="mt-2 inline-flex rounded-full bg-[var(--accent-tint)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                {roleLabel}
              </p>
            </div>

            <div className="py-1">
              <Link to="/dashboard" role="menuitem" className={row}>
                <span className="w-4 text-center" aria-hidden>
                  ◉
                </span>
                Dashboard
              </Link>
              {user.clubSlug && (
                <Link to={`/clubs/${user.clubSlug}`} role="menuitem" className={row}>
                  <span className="w-4 text-center" aria-hidden>
                    ♙
                  </span>
                  My Club
                </Link>
              )}
              <Link to="/dashboard#notifications" role="menuitem" className={row}>
                <span className="w-4 text-center" aria-hidden>
                  ◎
                </span>
                Notifications
              </Link>
            </div>

            <div className="border-t border-[var(--border-strong)] py-1">
              <button onClick={onSignOut} role="menuitem" className={cx(row, 'text-[var(--danger-text)]')}>
                <span className="w-4 text-center" aria-hidden>
                  ⤴
                </span>
                Log out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}