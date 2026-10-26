import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  getAdminClubs,
  getAdminPlayers,
  getAdminRegions,
  getAdminSeasons,
  getAdminUsers,
  getDivisions,
  getFormats,
  getPendingClubs,
  getSiteContent,
} from './api'
import { ClubsView } from './views/ClubsView'
import { MatchesStandingsView } from './views/MatchesStandingsView'
import { LeaderboardsView } from './views/LeaderboardsView'
import { OverviewView } from './views/OverviewView'
import { SeasonsDivisionsView } from './views/SeasonsDivisionsView'
import { UsersPlayersView } from './views/UsersPlayersView'
import { WebsiteContentView } from './views/WebsiteContentView'

export type AdminTab = 'overview' | 'clubs' | 'matches' | 'leaderboards' | 'seasons' | 'users' | 'website'

interface Notice {
  kind: 'ok' | 'error' | 'info'
  text: string
}

interface Toast extends Notice {
  id: number
}

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="toaster" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: number) => void
}) {
  useEffect(() => {
    if (toast.kind === 'error') return
    const timer = window.setTimeout(() => onDismiss(toast.id), 4500)
    return () => window.clearTimeout(timer)
  }, [toast.id, toast.kind, onDismiss])

  return (
    <div
      className={`toast ${toast.kind}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      <span className="toast-icon" aria-hidden="true">
        {toast.kind === 'ok' ? '✓' : toast.kind === 'error' ? '!' : 'i'}
      </span>
      <span className="toast-text">{toast.text}</span>
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  )
}

const NAV_ITEMS: Array<{
  id: AdminTab
  label: string
  shortLabel: string
  icon: string
  title: string
  subtitle: string
}> = [
  {
    id: 'overview',
    label: 'Dashboard Overview',
    shortLabel: 'Overview',
    icon: '◈',
    title: 'League Operations Overview',
    subtitle: 'At-a-glance league metrics, pending club approvals, priority fixtures, and quick actions.',
  },
  {
    id: 'clubs',
    label: 'Clubs & Applications',
    shortLabel: 'Clubs',
    icon: '🛡️',
    title: 'Clubs & Applications',
    subtitle: 'Approve new manager sign-ups, upload club logos, assign divisions & regions, and manage squads.',
  },
  {
    id: 'matches',
    label: 'Matches & Standings',
    shortLabel: 'Matches',
    icon: '⚽',
    title: 'Match Centre & Live Standings',
    subtitle: 'Enter match scores, schedule fixtures, auto-generate round-robin seasons, and inspect league tables.',
  },
  {
    id: 'leaderboards',
    label: 'Leaderboards & Stats',
    shortLabel: 'Stats',
    icon: '🎖️',
    title: 'Individual Honours & Stats',
    subtitle: 'Manage top scorers, playmakers, and goalkeepers, key in performance tallies, and upload overflowing celebration cutouts for podium winners.',
  },
  {
    id: 'seasons',
    label: 'Seasons & Divisions',
    shortLabel: 'Seasons',
    icon: '🏆',
    title: 'Seasons & Division Tiers',
    subtitle: 'Manage the active season, division ladder, promotion/relegation rules, and season rollover wizard.',
  },
  {
    id: 'users',
    label: 'Users & Players',
    shortLabel: 'Users',
    icon: '👥',
    title: 'Accounts & League Players',
    subtitle: 'Manage registered club manager & player accounts, free agents, and squad transfers.',
  },
  {
    id: 'website',
    label: 'Website Content (CMS)',
    shortLabel: 'Website',
    icon: '🌐',
    title: 'Website Content & CMS',
    subtitle: 'Edit the Homepage Flag Rail (1:1 live preview), Competition Formats, Crest Wall, News, Entry Passes, About & FAQ.',
  },
]

export default function App() {
  const [tab, setTab] = useState<AdminTab>(() => {
    const saved = window.localStorage.getItem('iwvpl-admin-v2-tab') as AdminTab | null
    if (saved && NAV_ITEMS.some((i) => i.id === saved)) return saved
    return 'overview'
  })
  const [subTarget, setSubTarget] = useState<string | undefined>(undefined)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const nextToastId = useRef(0)

  const report = useCallback((kind: Notice['kind'], text: string) => {
    const id = (nextToastId.current += 1)
    setToasts((current) => [...current, { id, kind, text }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const guard = useCallback(
    async <T,>(fn: () => Promise<T>, what: string): Promise<T> => {
      try {
        return await fn()
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)
        report('error', `${what}: ${message}`)
        throw err
      }
    },
    [report],
  )

  useEffect(() => {
    window.localStorage.setItem('iwvpl-admin-v2-tab', tab)
  }, [tab])

  const refreshPending = useCallback(async () => {
    try {
      const list = await getPendingClubs()
      setPendingCount(list.length)
    } catch {
      /* ignore background poll failure */
    }
  }, [])

  useEffect(() => {
    void refreshPending()
    // Warm core admin caches in the background so switching tabs is instantaneous
    const warmup = window.setTimeout(() => {
      void getAdminClubs().catch(() => {})
      void getDivisions().catch(() => {})
      void getAdminSeasons().catch(() => {})
      void getAdminUsers().catch(() => {})
      void getAdminPlayers().catch(() => {})
      void getAdminRegions().catch(() => {})
      void getFormats().catch(() => {})
      void getSiteContent().catch(() => {})
    }, 150)
    const timer = window.setInterval(() => void refreshPending(), 45_000)
    return () => {
      window.clearTimeout(warmup)
      window.clearInterval(timer)
    }
  }, [refreshPending])

  const handleNavigate = useCallback((nextTab: AdminTab, sub?: string) => {
    setSubTarget(sub)
    setTab(nextTab)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const currentNav = NAV_ITEMS.find((i) => i.id === tab) ?? NAV_ITEMS[0]

  return (
    <div className="adm-shell">
      {/* Top Bar */}
      <header className="adm-topbar">
        <div className="adm-topbar-left">
          <a href="/admin/" className="adm-brand" onClick={(e) => { e.preventDefault(); handleNavigate('overview') }}>
            <span className="adm-brand-badge">IW</span>
            <div className="adm-brand-text">
              <strong>IWVPL Admin</strong>
              <small>LEAGUE & WEBSITE CONTROL CENTRE</small>
            </div>
          </a>
        </div>

        <div className="adm-topbar-right">
          {pendingCount > 0 && (
            <button
              type="button"
              className="adm-pending-pill"
              onClick={() => handleNavigate('clubs', 'pending')}
            >
              <span className="adm-pulse-dot" />
              {pendingCount} Pending Club{pendingCount === 1 ? '' : 's'}
            </button>
          )}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="adm-btn adm-btn-secondary adm-btn-sm"
          >
            ↗ View Live Website
          </a>
        </div>
      </header>

      {/* Main Layout */}
      <div className="adm-layout">
        {/* Sidebar Navigation */}
        <aside className="adm-sidebar">
          <div className="adm-sidebar-group">
            <span className="adm-sidebar-label">CONTROL CENTRE</span>
            <nav className="adm-nav" aria-label="Admin sections">
              {NAV_ITEMS.map((item) => {
                const isActive = tab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`adm-nav-btn ${isActive ? 'is-active' : ''}`}
                    onClick={() => handleNavigate(item.id)}
                  >
                    <span className="adm-nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="adm-nav-text">{item.label}</span>
                    {item.id === 'clubs' && pendingCount > 0 && (
                      <span className="adm-nav-badge">{pendingCount}</span>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="adm-sidebar-footer">
            <div className="adm-live-indicator">
              <span className="adm-live-dot" />
              <span>Connected to live database</span>
            </div>
            <p>All changes save immediately to the live league & website.</p>
          </div>
        </aside>

        {/* Workspace Content */}
        <main className="adm-main">
          <div className="adm-page-header">
            <div>
              <p className="adm-breadcrumb">
                IWVPL ADMIN <span>/</span> {currentNav.label.toUpperCase()}
              </p>
              <h1>{currentNav.title}</h1>
              <p className="adm-page-sub">{currentNav.subtitle}</p>
            </div>
          </div>

          {tab === 'overview' && (
            <OverviewView
              guard={guard}
              report={report}
              onNavigate={handleNavigate}
              onPendingCountChange={setPendingCount}
            />
          )}
          {tab === 'clubs' && (
            <ClubsView
              guard={guard}
              report={report}
              initialSub={subTarget}
              onPendingCountChange={setPendingCount}
            />
          )}
          {tab === 'matches' && (
            <MatchesStandingsView
              guard={guard}
              report={report}
              initialSub={subTarget}
            />
          )}
          {tab === 'leaderboards' && (
            <LeaderboardsView
              guard={guard}
              report={report}
            />
          )}
          {tab === 'seasons' && (
            <SeasonsDivisionsView
              guard={guard}
              report={report}
            />
          )}
          {tab === 'users' && (
            <UsersPlayersView
              guard={guard}
              report={report}
              initialSub={subTarget}
            />
          )}
          {tab === 'website' && (
            <WebsiteContentView
              guard={guard}
              report={report}
              initialSub={subTarget}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="adm-mobile-nav" aria-label="Mobile admin navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`adm-mobile-nav-btn ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => handleNavigate(item.id)}
          >
            <span className="adm-mobile-icon">{item.icon}</span>
            <span>{item.shortLabel}</span>
            {item.id === 'clubs' && pendingCount > 0 && (
              <span className="adm-mobile-badge">{pendingCount}</span>
            )}
          </button>
        ))}
      </nav>

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
