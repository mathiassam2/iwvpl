import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'
import { CustomSelect } from './CustomSelect'
import { SeasonRollover } from './SeasonRollover'
import {
  ApiError,
  addPlayer,
  assignDivision,
  createAdminClub,
  createAdminPlayer,
  createAdminRegion,
  createAdminUser,
  createFormat,
  decideClub,
  deleteAdminClub,
  deleteAdminPlayer,
  deleteAdminRegion,
  deleteAdminUser,
  deleteFormat,
  deleteMatch,
  deleteMatches,
  deleteUnscheduledMatches,
  createDivision,
  createSeason,
  createMatch,
  getAdminClubs,
  getAdminPlayers,
  getAdminRegions,
  getAdminUsers,
  getClubs,
  getAdminSeasons,
  getDivisions,
  getFormats,
  getMatches,
  getMatchPriorities,
  getPendingClubs,
  getSeasonRollover,
  getStandings,
  generateFixtures,
  removePlayer,
  scheduleMatch,
  setFeaturedClubs,
  setFormatStatus,
  setResult,
  setCurrentSeason,
  setFeaturedDivision,
  setDivisionActive,
  updateAdminPlayer,
  updateAdminRegion,
  updateAdminRegionOrder,
  updateAdminUser,
  updateClub,
  updateDivision,
  updateDivisionOrder,
  updateFormat,
  updateSeason,
  withdrawResult,
  type AdminPlayer,
  type AdminUser,
  type Club,
  type CompetitionFormat,
  type FormatStatus,
  type HomepageRegion,
  type AdminSeason,
  type Division,
  type Match,
  type MatchSort,
  type PendingClub,
  type RolloverRecord,
  type Standing,
  type UserRole,
} from './api'

type Tab = 'homepage' | 'members' | 'clubs' | 'applications' | 'results' | 'standings'
type ClubSection = 'clubs' | 'divisions' | 'directory'

/** Which bulk action is running, so only that button shows its spinner. */
type BulkAction = 'update'

interface Notice {
  kind: 'ok' | 'error' | 'info'
  text: string
}

/**
 * A notice on its way to the toaster.
 *
 * The id is what lets a toast retire itself on a timer without two notices
 * landing together sharing one, and is what the dismiss button matches on.
 */
interface Toast extends Notice {
  id: number
}

/**
 * Corner toaster.
 *
 * Errors stay until dismissed because they usually say what to do next and
 * losing one to a timeout costs the admin the message they were about to read.
 * Successes are confirmations of something already done, so they clear
 * themselves. Several stack rather than replace each other, because a bulk
 * action reports per-item and the last line would otherwise hide the rest.
 */
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
        {toast.kind === 'ok' ? '\u2713' : toast.kind === 'error' ? '!' : 'i'}
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

const ALL_TABS: Tab[] = ['homepage', 'members', 'clubs', 'applications', 'results', 'standings']
const MOBILE_PRIMARY_TABS: Tab[] = ['homepage', 'members', 'clubs', 'applications']
const MOBILE_OVERFLOW_TABS: Tab[] = ALL_TABS.filter((t) => !MOBILE_PRIMARY_TABS.includes(t))

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = window.localStorage.getItem('iwvpl-admin-tab')
    const savedSection = window.localStorage.getItem('iwvpl-admin-club-section')
    if (
      saved === 'clubs' ||
      saved === 'applications' ||
      saved === 'results' ||
      saved === 'standings' ||
      saved === 'homepage' ||
      saved === 'members'
    ) {
      if (saved === 'clubs' && savedSection === 'applications') return 'applications'
      if (saved === 'clubs' && savedSection === 'homepage') return 'homepage'
      return saved
    }
    if (saved === 'divisions') return 'clubs'
    return 'homepage'
  })
  const [clubSection, setClubSection] = useState<ClubSection>(() => {
    const savedTab = window.localStorage.getItem('iwvpl-admin-tab')
    const savedSection = window.localStorage.getItem('iwvpl-admin-club-section')
    if (savedTab === 'divisions' || savedSection === 'divisions') return 'divisions'
    if (savedSection === 'directory') return 'directory'
    return 'clubs'
  })
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const mobileMoreRef = useRef<HTMLDivElement>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pendingApplicationCount, setPendingApplicationCount] = useState(0)
  // Monotonic so two notices raised in the same tick stay independent toasts
  // instead of colliding on a shared identity.
  const nextToastId = useRef(0)
  const pageTitle: Record<Tab, string> = {
    clubs: 'Club management',
    applications: 'Club applications',
    results: 'Match centre',
    standings: 'League table',
    homepage: 'Homepage settings',
    members: 'Managers & Players',
  }

  const report = useCallback((kind: Notice['kind'], text: string) => {
    const id = (nextToastId.current += 1)
    setToasts((current) => [...current, { id, kind, text }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  useEffect(() => {
    window.localStorage.setItem('iwvpl-admin-tab', tab)
    setMobileMoreOpen(false)
  }, [tab])

  useEffect(() => {
    window.localStorage.setItem('iwvpl-admin-club-section', clubSection)
  }, [clubSection])

  useEffect(() => {
    if (!mobileMoreOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (mobileMoreRef.current && !mobileMoreRef.current.contains(event.target as Node)) {
        setMobileMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [mobileMoreOpen])

  // Any failure is reported through one channel so the views can simply throw
  // and the shell decides how to present it.
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
  const refreshPendingApplicationCount = useCallback(async () => {
    const applications = await guard(getPendingClubs, 'Could not check club applications')
    setPendingApplicationCount(applications.length)
  }, [guard])

  useEffect(() => {
    const refresh = () => {
      refreshPendingApplicationCount().catch(() => {})
    }
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
    }
  }, [refreshPendingApplicationCount])

  const tabLabels: Record<Tab, string> = {
    clubs: 'Clubs',
    applications: 'Applications',
    results: 'Matches',
    standings: 'Standings',
    homepage: 'Homepage',
    members: 'Managers & Players',
  }
  const tabIcons: Record<Tab, string> = {
    clubs: '♙',
    applications: '✉',
    results: '◉',
    standings: '▤',
    homepage: '⌂',
    members: '♟',
  }

  const isOverflowTabActive = MOBILE_OVERFLOW_TABS.includes(tab)

  return (
    <div className="shell">
      <header className="masthead">
        <a className="brand" href="/admin/" aria-label="IWVPL Admin home">
          <span className="brand-mark">I</span>
          <span><strong>IWVPL</strong><small>LEAGUE OPERATIONS</small></span>
        </a>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <p className="nav-label">WORKSPACE</p>
          <nav className="tabs desktop-tabs" role="tablist" aria-label="Admin sections">
            {ALL_TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                <span className="nav-icon" aria-hidden="true">{tabIcons[t]}</span>
                <span>{tabLabels[t]}</span>
                {t === 'applications' && pendingApplicationCount > 0 && (
                  <span
                    className="nav-badge"
                    aria-label={`${pendingApplicationCount} club applications need review`}
                    title={`${pendingApplicationCount} club applications need review`}
                  >
                    {pendingApplicationCount > 99 ? '99+' : pendingApplicationCount}
                  </span>
                )}
                {t === tab && <span className="nav-arrow">›</span>}
              </button>
            ))}
          </nav>

          {/* Mobile navigation bar with More menu for overflow / future tabs */}
          <div className="mobile-nav-wrap" ref={mobileMoreRef}>
            {mobileMoreOpen && (
              <div className="mobile-more-sheet" role="menu" aria-label="More admin sections">
                <p className="mobile-more-title">More sections</p>
                {MOBILE_OVERFLOW_TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="menuitem"
                    aria-current={tab === t ? 'page' : undefined}
                    className={`mobile-more-item${tab === t ? ' is-active' : ''}`}
                    onClick={() => {
                      setTab(t)
                      setMobileMoreOpen(false)
                    }}
                  >
                    <span className="nav-icon" aria-hidden="true">{tabIcons[t]}</span>
                    <span>{tabLabels[t]}</span>
                    {t === tab && <span className="nav-arrow">✓</span>}
                  </button>
                ))}
              </div>
            )}
            <nav className="tabs mobile-tabs" role="tablist" aria-label="Admin sections">
              {MOBILE_PRIMARY_TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => {
                    setTab(t)
                    setMobileMoreOpen(false)
                  }}
                >
                  <span className="nav-icon" aria-hidden="true">{tabIcons[t]}</span>
                  <span>{tabLabels[t]}</span>
                  {t === 'applications' && pendingApplicationCount > 0 && (
                    <span
                      className="nav-badge"
                      aria-label={`${pendingApplicationCount} club applications need review`}
                      title={`${pendingApplicationCount} club applications need review`}
                    >
                      {pendingApplicationCount > 99 ? '99+' : pendingApplicationCount}
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                aria-expanded={mobileMoreOpen}
                aria-haspopup="menu"
                aria-selected={isOverflowTabActive}
                className={isOverflowTabActive || mobileMoreOpen ? 'is-more-active' : undefined}
                onClick={() => setMobileMoreOpen((open) => !open)}
              >
                <span className="nav-icon" aria-hidden="true">⋯</span>
                <span>More</span>
              </button>
            </nav>
          </div>

          <div className="sidebar-note"><span className="secure-dot" />Changes save directly to the league database.</div>
        </aside>

        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">LEAGUE OPERATIONS <span>/</span> {pageTitle[tab].toUpperCase()}</p>
              <h1>{pageTitle[tab]}</h1>
              <p className="page-subtitle">
                {tab === 'results'
                  ? 'Record match scores and keep the table up to date.'
                  : tab === 'standings'
                    ? 'Review standings by season and league division.'
                    : tab === 'applications'
                      ? 'Review and respond to clubs waiting for approval.'
                      : tab === 'homepage'
                        ? 'Control competition formats and featured clubs shown on the public homepage.'
                        : tab === 'members'
                          ? 'View and manage all registered manager accounts and league players.'
                          : 'Update club details, divisions, and player rosters.'}
              </p>
            </div>
          </div>

          {tab === 'standings' && <Standings guard={guard} />}
          {tab === 'results' && <Results guard={guard} report={report} />}
          {tab === 'applications' && (
            <Applications
              guard={guard}
              report={report}
              onPendingCountChange={setPendingApplicationCount}
            />
          )}
          {tab === 'homepage' && (
            <HomepageSettings
              guard={guard}
              report={report}
            />
          )}
          {tab === 'members' && (
            <MembersManagement
              guard={guard}
              report={report}
            />
          )}
          {tab === 'clubs' && (
            <Clubs
              guard={guard}
              report={report}
              section={clubSection}
              setSection={setClubSection}
            />
          )}
        </main>
      </div>

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

/* --------------------------------------------------------------- standings */

function Standings({
  guard,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
}) {
  const [seasons, setSeasons] = useState<AdminSeason[] | null>(null)
  const [seasonId, setSeasonId] = useState('')
  const [divisions, setDivisions] = useState<Division[]>([])
  const [divisionId, setDivisionId] = useState('')
  const [rows, setRows] = useState<Standing[] | null>(null)
  const divisionsRequestId = useRef(0)
  const standingsRequestId = useRef(0)

  useEffect(() => {
    guard(getAdminSeasons, 'Could not load seasons for standings')
      .then((availableSeasons) => {
        setSeasons(availableSeasons)
        setSeasonId(
          String(
            availableSeasons.find((season) => Boolean(season.is_current))?.id ??
              availableSeasons[0]?.id ??
              '',
          ),
        )
      })
      .catch(() => setSeasons([]))
  }, [guard])

  useEffect(() => {
    const requestId = ++divisionsRequestId.current
    setDivisions([])
    setDivisionId('')
    setRows(null)
    if (!seasonId) return

    guard(
      () => getDivisions(Number(seasonId)),
      'Could not load divisions for the selected standings season',
    )
      .then((seasonDivisions) => {
        if (requestId !== divisionsRequestId.current) return
        // Paused leagues are absent from the public standings, so there is no
        // table to show for them here.
        const active = seasonDivisions.filter((division) => Boolean(division.is_active))
        setDivisions(active)
        setDivisionId(String(active[0]?.id ?? ''))
      })
      .catch(() => {
        if (requestId === divisionsRequestId.current) setDivisions([])
      })
  }, [guard, seasonId])

  const selectedDivision = divisions.find(
    (division) =>
      String(division.id) === divisionId &&
      (division.season_id == null || division.season_id === Number(seasonId)),
  )

  useEffect(() => {
    const requestId = ++standingsRequestId.current
    setRows(null)
    if (!seasonId || !selectedDivision) return

    guard(
      () => getStandings(Number(seasonId), selectedDivision.slug),
      'Could not load standings',
    )
      .then((seasonStandings) => {
        if (requestId === standingsRequestId.current) setRows(seasonStandings)
      })
      .catch(() => {
        if (requestId === standingsRequestId.current) setRows([])
      })
  }, [guard, seasonId, selectedDivision])

  const selectedSeason = seasons?.find((season) => String(season.id) === seasonId)

  if (seasons === null) return <div className="loading">Loading seasons…</div>

  return (
    <>
      <div className="standings-filters">
        <label>
          <span>Season</span>
          <CustomSelect
            ariaLabel="Standings season"
            value={seasonId}
            disabled={seasons.length === 0}
            options={seasons.map((season) => ({
              value: String(season.id),
              label: `${season.name}${season.is_current ? ' · Current' : ''}`,
            }))}
            onChange={setSeasonId}
          />
        </label>
        <label>
          <span>League</span>
          <CustomSelect
            ariaLabel="Standings league"
            value={divisionId}
            disabled={!seasonId || divisions.length === 0}
            options={divisions.map((division) => ({
              value: String(division.id),
              label: division.name,
            }))}
            onChange={setDivisionId}
          />
        </label>
      </div>
      <div className="card">
        <header>
          <h2>{selectedDivision?.name ?? 'Standings'}</h2>
          <span className="hint">
            {selectedSeason ? `${selectedSeason.name} · ` : ''}Updates as results are recorded
          </span>
        </header>
        {seasons.length === 0 ? (
          <div className="empty">No seasons are available.</div>
        ) : divisions.length === 0 && seasonId ? (
          <div className="empty">No divisions are configured for this season.</div>
        ) : rows === null ? (
          <div className="loading">Loading standings…</div>
        ) : rows.length === 0 ? (
          <div className="empty">No standings rows for this league and season.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Club</th>
                <th>Form</th>
                <th className="num">P</th>
                <th className="num">W</th>
                <th className="num">D</th>
                <th className="num">L</th>
                <th className="num">GF</th>
                <th className="num">GA</th>
                <th className="num">GD</th>
                <th className="num">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.club_id}>
                  <td className="num pos">{r.position}</td>
                  <td>
                    <div className="club">
                      {r.logo_local && <img src={r.logo_local} alt="" />}
                      {r.flag && <span className="flag">{r.flag}</span>}
                      <span className="name">{r.name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="form-strip">
                      {(r.form ?? '').split('').map((c, i) => (
                        <span key={i} className={c}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="num">{r.played}</td>
                  <td className="num">{r.won}</td>
                  <td className="num">{r.drawn}</td>
                  <td className="num">{r.lost}</td>
                  <td className="num">{r.goals_for}</td>
                  <td className="num">{r.goals_against}</td>
                  <td className="num">{r.goal_difference}</td>
                  <td className="num pts">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="footnote">
        Each season has its own <strong>materialised standings snapshot</strong>. Results update
        the snapshot for the match&rsquo;s season and league; editing a result reverses its previous
        contribution before applying the updated score.
      </p>
    </>
  )
}

/* ----------------------------------------------------------------- results */

const MATCH_TIME_ZONE = 'Asia/Kuala_Lumpur'

function dateTimeInputValue(kickoff: string | null): string {
  return kickoff ? kickoff.replace(' ', 'T').slice(0, 16) : ''
}

function matchKickoffTime(kickoff: string): number {
  const [date, time] = kickoff.split(/[ T]/)
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute, second = '0'] = time.split(':')
  return Date.UTC(year, month - 1, day, Number(hour) - 8, Number(minute), Number(second))
}

function kualaLumpurToday(now: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MATCH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formatKickoff(kickoff: string | null): string {
  if (!kickoff) return 'Needs scheduling'
  return new Intl.DateTimeFormat([], {
    timeZone: MATCH_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(matchKickoffTime(kickoff)))
}

type MatchUrgency = 'unscheduled' | 'overdue' | 'today' | 'upcoming' | 'completed'

/** Fixtures per page in the Needs scheduling panel. */
const PRIORITY_PAGE_SIZE = 10

/** The four views of the fixture list, shown as tabs rather than stacked. */
type MatchTab = 'priority' | 'all' | 'pending' | 'completed'

function matchUrgency(match: Match, now: number, today: string): MatchUrgency {
  if (match.home_score !== null && match.away_score !== null) return 'completed'
  if (!match.kickoff) return 'unscheduled'
  if (matchKickoffTime(match.kickoff) <= now) return 'overdue'
  if (match.kickoff.slice(0, 10) === today) return 'today'
  return 'upcoming'
}

/**
 * One side of the fixture pairing in the create-fixture dialog.
 *
 * Shown as a crest above the picker rather than another dropdown in a row, so
 * the pairing reads as the fixture it will become — two clubs, one against the
 * other — instead of a second two-column form to decode.
 */
function FixtureSlot({
  side,
  club,
  value,
  disabled,
  options,
  placeholder,
  ariaLabel,
  onChange,
}: {
  side: 'home' | 'away'
  club: Club | null
  value: string
  disabled: boolean
  options: Array<{ value: string; label: string }>
  placeholder: string
  ariaLabel: string
  onChange: (value: string) => void
}) {
  return (
    <div className={`fixture-slot ${side}${club ? ' filled' : ''}`}>
      <span className="fixture-slot-crest">
        {club?.logo_local ? (
          <img src={club.logo_local} alt="" />
        ) : (
          <span className="fixture-slot-blank" aria-hidden="true">
            {club ? club.name.slice(0, 2).toUpperCase() : (side === 'home' ? 'H' : 'A')}
          </span>
        )}
      </span>
      <span className="fixture-slot-role">{side === 'home' ? 'Home' : 'Away'}</span>
      <span className="fixture-slot-name">{club?.name ?? 'Not chosen'}</span>
      <CustomSelect
        ariaLabel={ariaLabel}
        value={value}
        disabled={disabled}
        options={[{ value: '', label: placeholder }, ...options]}
        onChange={onChange}
      />
    </div>
  )
}

const FIXTURE_KICKOFF_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/**
 * Render a `datetime-local` value the way the rest of the app renders kickoffs.
 *
 * A datetime-local value is already a naive Kuala Lumpur wall-clock string in
 * exactly the shape `matchKickoffTime` expects, so it is passed straight
 * through. Normalising it with `new Date(...).toISOString()` first would hand
 * that parser a UTC instant, which it reads as local time and turns into NaN —
 * and Intl throws a RangeError on NaN, which blanks the whole page.
 *
 * Returns null for anything half-typed or out of range so the summary degrades
 * to "no date yet" instead of throwing.
 */
function formatFixtureKickoff(value: string): string | null {
  if (!FIXTURE_KICKOFF_PATTERN.test(value)) return null
  const [month, day] = value.slice(5, 10).split('-').map(Number)
  const [hour, minute] = value.slice(11, 16).split(':').map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  return Number.isNaN(matchKickoffTime(value)) ? null : formatKickoff(value)
}

/** True when a non-empty datetime-local value can actually be sent to the API. */
function fixtureKickoffValid(value: string): boolean {
  return value === '' || formatFixtureKickoff(value) !== null
}

/** A datetime-local value `days` from today at `hour`:00, Kuala Lumpur wall time. */
function fixtureKickoffPreset(days: number, hour: number): string {
  const now = new Date()
  const target = new Date(now)
  target.setDate(now.getDate() + days)
  target.setHours(hour, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:00`
}

function Results({
  guard,
  report,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
}) {
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [priorityData, setPriorityData] = useState<Match[]>([])
  const [priorityTotal, setPriorityTotal] = useState(0)
  const [priorityQuery, setPriorityQuery] = useState('')
  const [prioritySearch, setPrioritySearch] = useState('')
  const [priorityPage, setPriorityPage] = useState(0)
  const [prioritySelected, setPrioritySelected] = useState<Set<number>>(() => new Set())
  const [priorityBusy, setPriorityBusy] = useState(false)
  const [deleteAllBusy, setDeleteAllBusy] = useState(false)
  const [totalMatches, setTotalMatches] = useState(0)
  const [allTotal, setAllTotal] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [draft, setDraft] = useState<Record<number, { home: string; away: string }>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')
  /**
   * Which of the four views of the fixture list is on screen.
   *
   * They used to stack: the urgent panel sat on top of the full list, so
   * dating fixtures meant scrolling past everything else first, and both
   * answered different questions — "what still needs a date" against "where is
   * this fixture in the season". One at a time, with its own search and
   * paging, is what each of them is actually for.
   */
  const [matchTab, setMatchTab] = useState<MatchTab>('priority')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<MatchSort>(() => {
    // Most recently kicked-off fixture first. The urgent work has its own panel
    // above the list, so the list itself reads as a timeline.
    return window.localStorage.getItem('iwvpl-admin-match-sort') === 'priority'
      ? 'priority'
      : 'latest'
  })
  const [fixtureClubs, setFixtureClubs] = useState<Club[]>([])
  const [fixtureDivisions, setFixtureDivisions] = useState<Division[]>([])
  const [fixtureSeasons, setFixtureSeasons] = useState<AdminSeason[]>([])
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateLeagues, setGenerateLeagues] = useState<Set<string>>(() => new Set())
  const [generateRounds, setGenerateRounds] = useState('1')
  const [generateBusy, setGenerateBusy] = useState(false)
  const [createSeasonId, setCreateSeasonId] = useState('')
  const [createDivisionId, setCreateDivisionId] = useState('')
  const [scheduleTarget, setScheduleTarget] = useState<number | 'new' | null>(null)
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, string>>({})
  const [createHome, setCreateHome] = useState('')
  const [createAway, setCreateAway] = useState('')
  const [createKickoff, setCreateKickoff] = useState('')
  const [now, setNow] = useState(Date.now())
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const requestId = useRef(0)
  const fixtureClubRequestId = useRef(0)
  const fixtureDivisionRequestId = useRef(0)

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current
    setLoadingMatches(true)
    try {
      const [data, priorities] = await Promise.all([
        guard(
          () => getMatches({
            limit: 20,
            offset: page * 20,
            result: filter,
            search,
            sort,
          }),
          'Could not load matches',
        ),
        guard(
          () =>
            getMatchPriorities({
              limit: PRIORITY_PAGE_SIZE,
              offset: priorityPage * PRIORITY_PAGE_SIZE,
              search: prioritySearch,
            }),
          'Could not load schedule priorities',
        ),
      ])
      if (currentRequest !== requestId.current) return
      const lastPage = Math.max(0, Math.ceil(data.total / 20) - 1)
      if (page > lastPage) {
        setPage(lastPage)
        return
      }
      const lastPriorityPage = Math.max(0, Math.ceil(priorities.total / PRIORITY_PAGE_SIZE) - 1)
      if (priorityPage > lastPriorityPage) {
        setPriorityPage(lastPriorityPage)
        return
      }
      const loadedMatches = [...data.matches, ...priorities.matches]
      setMatches(data.matches)
      setPriorityData(priorities.matches)
      setPriorityTotal(priorities.total)
      setTotalMatches(data.total)
      setAllTotal(data.allTotal)
      setPendingCount(data.pendingTotal)
      setCompletedCount(data.completedTotal)
      setScheduleDrafts((current) => ({
        ...current,
        ...Object.fromEntries(loadedMatches.map((match) => [match.id, dateTimeInputValue(match.kickoff)])),
      }))
      setDraft((current) => ({
        ...current,
        ...Object.fromEntries(
          data.matches.map((match) => [
            match.id,
            {
              home: match.home_score === null ? '' : String(match.home_score),
              away: match.away_score === null ? '' : String(match.away_score),
            },
          ]),
        ),
      }))
    } finally {
      if (currentRequest === requestId.current) setLoadingMatches(false)
    }
  }, [filter, guard, page, priorityPage, prioritySearch, search, sort])

  useEffect(() => {
    load().catch(() => setMatches((current) => current ?? []))
  }, [load])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(query.trim())
      setPage(0)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [query])

  // The panel has its own search box rather than sharing the list's, because
  // the two answer different questions: one is "where is this fixture in the
  // season", the other is "which of these still need a date". Typing in one
  // should not silently filter the other.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPrioritySearch(priorityQuery.trim())
      setPriorityPage(0)
      // A selection that is not on screen any more would delete the wrong rows
      // if it survived the filter.
      setPrioritySelected(new Set())
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [priorityQuery])

  useEffect(() => {
    guard(getAdminSeasons, 'Could not load seasons for fixture creation')
      .then((seasons) => {
        setFixtureSeasons(seasons)
        setCreateSeasonId((current) =>
          current && seasons.some((season) => String(season.id) === current)
            ? current
            : String(seasons.find((season) => Boolean(season.is_current))?.id ?? ''),
        )
      })
      .catch(() => setFixtureSeasons([]))
  }, [guard])

  useEffect(() => {
    const currentRequest = ++fixtureClubRequestId.current
    const currentDivisionRequest = ++fixtureDivisionRequestId.current
    setFixtureClubs([])
    setFixtureDivisions([])
    if (!createSeasonId) {
      return
    }
    guard(() => getClubs(Number(createSeasonId)), 'Could not load clubs for the selected season')
      .then((seasonClubs) => {
        if (currentRequest === fixtureClubRequestId.current) setFixtureClubs(seasonClubs)
      })
      .catch(() => {
        if (currentRequest === fixtureClubRequestId.current) setFixtureClubs([])
      })
    guard(() => getDivisions(Number(createSeasonId)), 'Could not load divisions for the selected season')
      .then((seasonDivisions) => {
        if (currentDivisionRequest === fixtureDivisionRequestId.current) {
          // Only active leagues can be scheduled. Filtering here rather than at
          // each control also keeps the "select every league" checkbox honest,
          // because it compares against this same list.
          setFixtureDivisions(seasonDivisions.filter((division) => Boolean(division.is_active)))
        }
      })
      .catch(() => {
        if (currentDivisionRequest === fixtureDivisionRequestId.current) {
          setFixtureDivisions([])
        }
      })
  }, [createSeasonId, guard])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (scheduleTarget === null) return
    const oldBodyOverflow = document.body.style.overflow
    const oldRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !scheduleBusy) setScheduleTarget(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = oldBodyOverflow
      document.documentElement.style.overflow = oldRootOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [scheduleBusy, scheduleTarget])

  if (matches === null) return <div className="loading">Loading matches…</div>

  const today = kualaLumpurToday(now)

  const save = async (m: Match) => {
    const d = draft[m.id]
    const homeText = d?.home ?? ''
    const awayText = d?.away ?? ''
    const home = Number(homeText)
    const away = Number(awayText)
    if (!/^\d{1,2}$/.test(homeText) || !/^\d{1,2}$/.test(awayText) || home > 99 || away > 99) {
      report('error', 'Enter both scores as whole numbers between 0 and 99.')
      return
    }
    setBusy(m.id)
    try {
      await setResult(m.id, home, away)
      report('ok', `Saved ${m.home_name} ${home}-${away} ${m.away_name}. Table updated.`)
      await load()
    } catch {
      /* already reported by guard */
    } finally {
      setBusy(null)
    }
  }

  const withdraw = async (m: Match) => {
    if (!window.confirm(`Withdraw the saved result for ${m.home_name} vs ${m.away_name}? This will update the standings.`)) {
      return
    }
    setBusy(m.id)
    try {
      await withdrawResult(m.id)
      report('ok', `Result withdrawn from ${m.home_name} vs ${m.away_name}.`)
      await load()
    } catch {
      /* already reported by guard */
    } finally {
      setBusy(null)
    }
  }

  const removeFixture = async (m: Match, played: boolean) => {
    const impact = played ? ' Its result will be removed from the standings.' : ''
    if (!window.confirm(`Permanently delete ${m.home_name} vs ${m.away_name}?${impact} This cannot be undone.`)) {
      return
    }
    setBusy(m.id)
    try {
      await guard(() => deleteMatch(m.id), `Could not delete ${m.home_name} vs ${m.away_name}`)
      report('ok', `Fixture deleted: ${m.home_name} vs ${m.away_name}.`)
      await load()
    } catch {
      /* already reported by guard */
    } finally {
      setBusy(null)
    }
  }

  /**
   * Delete the fixtures ticked in the Needs scheduling panel.
   *
   * Confirmed before it runs and all-or-nothing on the server, because this is
   * the one bulk action here with no undo: the fixtures are gone and nothing
   * on the page can bring them back.
   */
  const deleteSelectedPriorities = async () => {
    const ids = [...prioritySelected]
    if (ids.length === 0 || priorityBusy) return
    const chosen = priorityData.filter((match) => prioritySelected.has(match.id))
    const label =
      ids.length === 1
        ? `this fixture:\n${chosen[0].home_name} vs ${chosen[0].away_name}`
        : `${ids.length} fixtures`
    if (!window.confirm(`Delete ${label}?\n\nThis cannot be undone.`)) return
    setPriorityBusy(true)
    try {
      const result = await guard(
        () => deleteMatches(ids),
        'Could not delete the selected fixtures',
      )
      report('ok', `Deleted ${result.deleted} fixture${result.deleted === 1 ? '' : 's'}.`)
      setPrioritySelected(new Set())
      await load()
    } catch {
      /* already reported */
    } finally {
      setPriorityBusy(false)
    }
  }

  /**
   * Delete every undated fixture at once.
   *
   * The counterpart to auto-scheduling: generate writes a whole season's
   * fixtures with no dates, and if the shape is wrong this takes the lot back
   * rather than leaving it to be picked through one at a time. Confirmed with
   * the real count first, since it crosses every season and has no undo.
   */
  const deleteAllUnscheduled = async () => {
    if (priorityTotal === 0 || deleteAllBusy) return
    const ok = window.confirm(
      `Delete all ${priorityTotal} fixture${priorityTotal === 1 ? '' : 's'} with no date?\n\n` +
        'This affects every season and cannot be undone.',
    )
    if (!ok) return
    setDeleteAllBusy(true)
    try {
      const result = await guard(
        () => deleteUnscheduledMatches(),
        'Could not delete the undated fixtures',
      )
      report(
        'ok',
        `Deleted ${result.deleted} fixture${result.deleted === 1 ? '' : 's'}.`,
      )
      setPrioritySelected(new Set())
      setPriorityQuery('')
      await load()
    } catch {
      /* already reported */
    } finally {
      setDeleteAllBusy(false)
    }
  }

  const togglePriority = (id: number, on: boolean) => {
    setPrioritySelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleAllPriorities = (on: boolean) => {
    setPrioritySelected(on ? new Set(priorityData.map((match) => match.id)) : new Set())
  }

  const saveSchedule = async (match: Match) => {
    const value = scheduleDrafts[match.id] ?? ''
    setScheduleBusy(true)
    try {
      const result = await guard(
        () => scheduleMatch(match.id, value || null),
        `Could not update ${match.home_name} vs ${match.away_name}`,
      )
      setMatches((current) =>
        current?.map((item) =>
          item.id === match.id
          ? {
              ...item,
              kickoff: result.kickoff,
              status:
                item.home_score !== null && item.away_score !== null
                  ? 'finished'
                  : result.kickoff
                    ? 'scheduled'
                    : 'unscheduled',
            }
          : item,
        ) ?? null,
      )
      await load()
      report('ok', result.kickoff ? 'Match schedule updated.' : 'Match moved to Needs scheduling.')
      setScheduleTarget(null)
    } catch {
      /* already reported by guard */
    } finally {
      setScheduleBusy(false)
    }
  }

  /**
   * Generate a round robin for the chosen leagues.
   *
   * Writes the fixtures without a kickoff so the admin is choosing the shape of
   * the season here and the dates afterwards, and reports what was skipped so a
   * second run cannot look like it doubled the fixture list.
   */
  const generateSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const divisionIds = [...generateLeagues].map(Number).filter(Number.isSafeInteger)
    if (divisionIds.length === 0) {
      report('error', 'Choose at least one league.')
      return
    }
    const rounds = Number(generateRounds)
    if (rounds !== 1 && rounds !== 2) {
      report('error', 'Choose one round or two rounds.')
      return
    }
    setGenerateBusy(true)
    try {
      const result = await guard(
        () =>
          generateFixtures({
            seasonId: Number(createSeasonId) || undefined,
            divisionIds,
            rounds,
          }),
        'Could not generate the fixture list',
      )
      const parts = [`${result.created} fixture${result.created === 1 ? '' : 's'} created`]
      if (result.skipped > 0) {
        parts.push(`${result.skipped} already existed and ${result.skipped === 1 ? 'was' : 'were'} left alone`)
      }
      if (result.missing > 0) {
        parts.push(
          `${result.missing} league${result.missing === 1 ? '' : 's'} skipped for having fewer than two clubs`,
        )
      }
      report(result.created > 0 ? 'ok' : 'info', `${parts.join(' · ')}. They are in Needs scheduling.`)
      setGenerateOpen(false)
      await load()
    } catch {
      /* already reported */
    } finally {
      setGenerateBusy(false)
    }
  }

  const saveNewMatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!createDivisionId) {
      report('error', 'Choose a division.')
      return
    }
    if (!createHome || !createAway) {
      report('error', 'Choose a home club and an away club.')
      return
    }
    if (createHome === createAway) {
      report('error', 'Choose two different clubs.')
      return
    }
    if (!fixtureKickoffValid(createKickoff)) {
      report('error', 'Enter a complete kickoff date and time, or clear the field.')
      return
    }
    setScheduleBusy(true)
    try {
      const match = await guard(
        () => createMatch(
          createHome,
          createAway,
          createKickoff || null,
          Number(createSeasonId),
        ),
        'Could not create fixture',
      )
      setDraft((current) => ({ ...current, [match.id]: { home: '', away: '' } }))
      setScheduleDrafts((current) => ({
        ...current,
        [match.id]: dateTimeInputValue(match.kickoff),
      }))
      report(
        'ok',
        match.kickoff
          ? `${match.home_name} vs ${match.away_name} scheduled.`
          : `${match.home_name} vs ${match.away_name} added to Needs scheduling.`,
      )
      setCreateHome('')
      setCreateAway('')
      setCreateDivisionId('')
      setCreateKickoff('')
      setCreateSeasonId((current) =>
        String(fixtureSeasons.find((season) => Boolean(season.is_current))?.id ?? current),
      )
      setScheduleTarget(null)
      await load()
    } catch {
      /* already reported by guard */
    } finally {
      setScheduleBusy(false)
    }
  }

  const urgency = (match: Match) => matchUrgency(match, now, today)
  const visibleMatches = matches
  const priorityPageCount = Math.max(1, Math.ceil(priorityTotal / PRIORITY_PAGE_SIZE))

  const priorityGroups: { key: MatchUrgency; title: string; hint: string }[] = [
    { key: 'unscheduled', title: 'Needs scheduling', hint: 'No kickoff date set' },
    { key: 'overdue', title: 'Past kickoff', hint: 'Kickoff passed · result still missing' },
    { key: 'today', title: 'Today', hint: 'Kickoff is today · Kuala Lumpur time' },
  ]
  const priorityMatches = priorityGroups.map((group) => ({
    ...group,
    matches: priorityData
      .filter((match) => urgency(match) === group.key)
      .sort((a, b) =>
        group.key === 'unscheduled'
          ? a.home_name.localeCompare(b.home_name)
          : (a.kickoff ?? '').localeCompare(b.kickoff ?? ''),
      ),
  }))
  const sortedVisibleMatches = visibleMatches
  const pageCount = Math.max(1, Math.ceil(totalMatches / 20))
  const firstMatch = totalMatches === 0 ? 0 : page * 20 + 1
  const lastMatch = Math.min((page + 1) * 20, totalMatches)
  const selectedDivisionId = createDivisionId ? Number(createDivisionId) : null
  const divisionClubs = fixtureClubs.filter(
    (club) => club.division_id === selectedDivisionId,
  )
  const awayOptions = divisionClubs.filter(
    (club) => club.slug !== createHome,
  )

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">▦</span>          <span className="stat-label">FIXTURES LOADED</span>
          <strong>{pendingCount + completedCount}</strong><small>League fixtures in this season</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon pending-icon">◷</span><span className="stat-label">UNPLAYED FIXTURES</span>
          <strong>{pendingCount}</strong><small>Scheduled or awaiting a date</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon done-icon">✓</span><span className="stat-label">COMPLETED</span>
          <strong>{completedCount}</strong><small>Results recorded</small>
        </div>
      </div>

      <section className="match-section" aria-label="Match schedule and results">
        <div className="match-toolbar">
          <div>
            <h2>Match schedule &amp; results</h2>
            <p>Schedule fixtures, then enter results when they have been played.</p>
          </div>
          <div className="match-toolbar-actions">
            <button
              className="btn primary"
              onClick={() => {
                setCreateHome('')
                setCreateAway('')
                setCreateKickoff('')
                setScheduleTarget('new')
              }}
            >
              <span aria-hidden="true">＋</span> New fixture
            </button>
            <button
              className="btn"
              onClick={() => {
                setGenerateLeagues(
                  new Set(fixtureDivisions.map((division) => String(division.id))),
                )
                setGenerateRounds('1')
                setGenerateOpen(true)
              }}
            >
              <span aria-hidden="true">⛬</span> Auto schedule
            </button>
            <button
              className="btn reload-btn"
              onClick={() => load().catch(() => {})}
              aria-label="Reload matches"
            >
              ↻ <span>Refresh</span>
            </button>
          </div>
        </div>
        <div className="match-tabs" role="tablist" aria-label="Fixture views">
          {([
            { key: 'priority' as const, label: 'Needs scheduling', count: priorityTotal },
            { key: 'pending' as const, label: 'Unplayed', count: pendingCount },
            { key: 'completed' as const, label: 'Completed', count: completedCount },
            { key: 'all' as const, label: 'All fixtures', count: allTotal },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={matchTab === tab.key}
              className={matchTab === tab.key ? 'selected' : ''}
              onClick={() => {
                setMatchTab(tab.key)
                setPage(0)
                if (tab.key !== 'priority') setFilter(tab.key)
              }}
            >
              {tab.label}
              <span className="match-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>

        {matchTab === 'priority' ? (
        <div className="match-priority" aria-label="Schedule priorities">
          <div className="match-priority-heading">
            <div>
              <span className="eyebrow">SCHEDULE PRIORITIES</span>
              <p>Fixtures needing attention · Kuala Lumpur time (UTC+8)</p>
            </div>
            <div className="priority-tools">
              <div className="search-box priority-search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="Both teams"
                  aria-label="Search fixtures needing attention by team"
                  value={priorityQuery}
                  onChange={(event) => setPriorityQuery(event.target.value)}
                />
              </div>
              <button
                className="btn sm danger priority-delete-all"
                type="button"
                disabled={deleteAllBusy || priorityTotal === 0}
                aria-busy={deleteAllBusy}
                onClick={() => void deleteAllUnscheduled()}
              >
                {deleteAllBusy ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Deleting…
                  </>
                ) : (
                  'Delete all undated'
                )}
              </button>
            </div>
          </div>
          {prioritySelected.size > 0 && (
            <div className="priority-bulk">
              <span>
                <strong>{prioritySelected.size}</strong> selected
              </span>
              <button
                className="btn sm"
                type="button"
                onClick={() => setPrioritySelected(new Set())}
                disabled={priorityBusy}
              >
                Clear
              </button>
              <button
                className="btn sm danger"
                type="button"
                onClick={() => void deleteSelectedPriorities()}
                disabled={priorityBusy}
                aria-busy={priorityBusy}
              >
                {priorityBusy ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Deleting…
                  </>
                ) : (
                  'Delete selected'
                )}
              </button>
            </div>
          )}
          {priorityTotal === 0 ? (
            <div className="priority-clear">
              <span aria-hidden="true">✓</span>
              <span>
                <strong>{priorityQuery.trim() ? 'Nothing matches that search' : 'All caught up'}</strong>
                <small>
                  {priorityQuery.trim()
                    ? 'No fixtures needing attention mention either team.'
                    : 'No unscheduled, overdue, or today fixtures.'}
                </small>
              </span>
            </div>
          ) : (
            <div className="priority-groups">
              <div className="priority-select-line">
                <label className="priority-select-all">
                  <input
                    type="checkbox"
                    checked={priorityData.length > 0 && prioritySelected.size === priorityData.length}
                    ref={(node) => {
                      if (node) {
                        node.indeterminate =
                          prioritySelected.size > 0 && prioritySelected.size < priorityData.length
                      }
                    }}
                    onChange={(event) => toggleAllPriorities(event.target.checked)}
                    aria-label="Select every fixture on this page"
                  />
                  <span>Select all on this page</span>
                </label>
                <span className="priority-count-line">
                  {priorityTotal} {priorityTotal === 1 ? 'fixture' : 'fixtures'} to review
                </span>
              </div>
              {priorityMatches.filter((group) => group.matches.length > 0).map((group) => (
                <section className={`priority-group urgency-${group.key}`} key={group.key}>
                  <header>
                    <div className="priority-group-title">
                      <span className="priority-indicator" aria-hidden="true" />
                      <div>
                      <h3>{group.title}</h3>
                      <p>{group.hint}</p>
                      </div>
                    </div>
                    <span className="priority-count">
                      {group.matches.length} {group.matches.length === 1 ? 'fixture' : 'fixtures'}
                    </span>
                  </header>
                  <div className="priority-fixtures" key={group.key}>
                    {group.matches.map((match) => (
                      <div
                        className={`priority-fixture${
                          prioritySelected.has(match.id) ? ' selected' : ''
                        }`}
                        key={match.id}
                      >
                        <div className="priority-fixture-select">
                          <input
                            type="checkbox"
                            checked={prioritySelected.has(match.id)}
                            onChange={(event) => togglePriority(match.id, event.target.checked)}
                            aria-label={`Select ${match.home_name} vs ${match.away_name}`}
                          />
                        </div>
                        <div className="priority-fixture-teams">
                          <strong>{match.home_name}</strong><span>vs</span><strong>{match.away_name}</strong>
                        </div>
                        <time>
                          {match.kickoff ? formatKickoff(match.kickoff) : 'Date & time not set'}
                        </time>
                        <div className="priority-fixture-actions">
                          <button
                            className="btn priority-action"
                            onClick={() => setScheduleTarget(match.id)}
                          >
                            {match.kickoff ? 'Edit schedule' : 'Set schedule'}
                          </button>
                          {!match.kickoff && (
                            <button
                              className="btn danger priority-delete"
                              disabled={busy === match.id}
                              onClick={() => void removeFixture(match, false)}
                            >
                              {busy === match.id ? 'Deleting…' : 'Delete fixture'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {priorityPageCount > 1 && (
                <nav className="priority-pagination" aria-label="Needs scheduling pages">
                  <button
                    className="btn sm"
                    onClick={() => setPriorityPage((p) => Math.max(0, p - 1))}
                    disabled={priorityPage === 0 || loadingMatches}
                  >
                    Previous
                  </button>
                  <span className="pagination-page">
                    Page {priorityPage + 1} of {priorityPageCount}
                  </span>
                  <button
                    className="btn sm"
                    onClick={() =>
                      setPriorityPage((p) => Math.min(priorityPageCount - 1, p + 1))
                    }
                    disabled={priorityPage >= priorityPageCount - 1 || loadingMatches}
                  >
                    Next
                  </button>
                </nav>
              )}
            </div>
          )}
        </div>
        ) : (
        <>
        <div className="match-controls">
          <span className="match-controls-label">
            {matchTab === 'pending'
              ? `${pendingCount} unplayed`
              : matchTab === 'completed'
                ? `${completedCount} with a result`
                : `${allTotal} in this season`}
          </span>
          <div className="match-controls-right">
            <label className="match-sort-control">
              <span>Order</span>
              <CustomSelect
                ariaLabel="Order fixtures"
                value={sort}
                onChange={(value) => {
                  if (value !== 'latest' && value !== 'priority') return
                  setSort(value)
                  setPage(0)
                  window.localStorage.setItem('iwvpl-admin-match-sort', value)
                }}
                options={[
                  { value: 'latest', label: 'Latest first' },
                  { value: 'priority', label: 'Needs attention' },
                ]}
              />
            </label>
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a club…"
                aria-label="Find a club"
              />
            </label>
          </div>
        </div>

        {visibleMatches.length === 0 ? (
          <div className="empty match-empty">
            <strong>{query ? 'No matches found' : 'No fixtures to show'}</strong>
            <span>
              {query
                ? 'Try another club name or clear your search.'
                : priorityTotal > 0 && filter !== 'completed'
                  ? 'Fixtures still needing a date are on the Needs scheduling tab.'
                  : 'Nothing here yet.'}
            </span>
          </div>
        ) : (
          <div className="match-list">
            {sortedVisibleMatches.map((m) => {
              const played = m.home_score !== null && m.away_score !== null
              const d = draft[m.id] ?? { home: '', away: '' }
              return (
                <article className="match-card" key={m.id}>
                  <div className="match-card-top">
                    <span className={`kickoff ${!m.kickoff ? 'kickoff-unscheduled' : ''}`}>
                      {formatKickoff(m.kickoff)}
                    </span>
                    <span className={`match-status ${played ? 'is-complete' : `is-${urgency(m)}`}`}>
                      <i />
                      {played
                        ? 'RESULT SAVED'
                        : urgency(m) === 'unscheduled'
                          ? 'NEEDS SCHEDULE'
                          : urgency(m) === 'overdue'
                            ? 'OVERDUE'
                            : urgency(m) === 'today'
                              ? 'TODAY'
                              : 'AWAITING RESULT'}
                    </span>
                    <button className="schedule-edit-link" onClick={() => setScheduleTarget(m.id)}>
                      {m.kickoff ? 'Edit schedule' : 'Set schedule'}
                    </button>
                  </div>
                  <div className="match-entry">
                    <div className="match-team home-team">
                      {m.home_logo && <img src={m.home_logo} alt="" />}
                      <span>{m.home_name}</span><small>HOME</small>
                    </div>
                    <div className="score-entry" role="group" aria-label={`Score for ${m.home_name} versus ${m.away_name}`}>
                      <input
                        type="number" min="0" max="99" step="1" inputMode="numeric"
                        aria-label={`${m.home_name} goals`} placeholder="–" value={d.home}
                        disabled={busy === m.id}
                        onChange={(e) => setDraft((s) => ({ ...s, [m.id]: { ...d, home: e.target.value } }))}
                      />
                      <span>:</span>
                      <input
                        type="number" min="0" max="99" step="1" inputMode="numeric"
                        aria-label={`${m.away_name} goals`} placeholder="–" value={d.away}
                        disabled={busy === m.id}
                        onChange={(e) => setDraft((s) => ({ ...s, [m.id]: { ...d, away: e.target.value } }))}
                      />
                    </div>
                    <div className="match-team away-team">
                      {m.away_logo && <img src={m.away_logo} alt="" />}
                      <span>{m.away_name}</span><small>AWAY</small>
                    </div>
                  </div>
                  <div className="match-actions">
                    {played && <span className="saved-score">Current: {m.home_score} – {m.away_score}</span>}
                    <div>
                      {played && <button className="btn danger" disabled={busy === m.id} onClick={() => withdraw(m)}>Withdraw</button>}
                      <button className="btn danger" disabled={busy === m.id} onClick={() => removeFixture(m, played)}>
                        Delete fixture
                      </button>
                      <button className="btn primary save-btn" disabled={busy === m.id} onClick={() => save(m)}>
                        {busy === m.id ? 'Saving…' : played ? 'Update result' : 'Save result'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
        {totalMatches > 0 && (
          <nav className="match-pagination" aria-label="Match result pages">
            <span>
              Showing {firstMatch}–{lastMatch} of {totalMatches} fixtures
              {loadingMatches && <span className="pagination-loading"> · Loading…</span>}
            </span>
            <div>
              <button
                className="btn"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || loadingMatches}
              >
                Previous
              </button>
              <span className="pagination-page">Page {page + 1} of {pageCount}</span>
              <button
                className="btn"
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                disabled={page >= pageCount - 1 || loadingMatches}
              >
                Next
              </button>
            </div>
          </nav>
        )}
        </>
        )}
      </section>

      <p className="footnote">
        Saving a result reverses any previous contribution to both clubs before applying the new
        one, so repeated corrections do not drift. <strong>Withdraw</strong> removes a result from
        the standings while keeping the fixture; <strong>Delete fixture</strong> permanently
        removes the match.
      </p>
      {generateOpen && (
        <div
          className="squad-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !generateBusy) setGenerateOpen(false)
          }}
        >
          <form
            className="squad-modal generate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-modal-title"
            onSubmit={(event) => void generateSchedule(event)}
          >
            <header>
              <div>
                <p className="eyebrow">FIXTURE BUILDER</p>
                <h2 id="generate-modal-title">Auto schedule</h2>
                <p className="club-edit-subtitle">
                  Build a round robin across the leagues you pick. Every fixture is created with no
                  date, so they land in Needs scheduling for you to fill in.
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close auto schedule"
                disabled={generateBusy}
                onClick={() => setGenerateOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="club-edit-content">
              <div className="generate-section">
                <div className="generate-section-heading">
                  <h3>Leagues</h3>
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() =>
                      setGenerateLeagues((current) =>
                        current.size === fixtureDivisions.length
                          ? new Set()
                          : new Set(fixtureDivisions.map((division) => String(division.id))),
                      )
                    }
                  >
                    {generateLeagues.size === fixtureDivisions.length && fixtureDivisions.length > 0
                      ? 'Clear all'
                      : 'Select all'}
                  </button>
                </div>
                <div className="generate-leagues">
                  {fixtureDivisions.map((division) => {
                    const on = generateLeagues.has(String(division.id))
                    return (
                      <label className="generate-league" key={division.id}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(event) => {
                            setGenerateLeagues((current) => {
                              const next = new Set(current)
                              if (event.target.checked) next.add(String(division.id))
                              else next.delete(String(division.id))
                              return next
                            })
                          }}
                        />
                        <span>{division.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="generate-section">
                <div className="generate-section-heading">
                  <h3>Rounds</h3>
                </div>
                <div className="generate-rounds" role="radiogroup" aria-label="Rounds per league">
                  {(['1', '2'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={generateRounds === value}
                      className={`generate-round${generateRounds === value ? ' selected' : ''}`}
                      onClick={() => setGenerateRounds(value)}
                    >
                      <strong>{value} round{value === '1' ? '' : 's'}</strong>
                      <small>
                        {value === '1'
                          ? 'Every club plays every other once.'
                          : 'Every pairing plays home and away.'}
                      </small>
                    </button>
                  ))}
                </div>
                <p className="generate-help">
                  {(() => {
                    // Counted from the season's club list, not `divisionClubs`:
                    // that is scoped to the single-fixture dialog's league
                    // picker and says nothing about the leagues ticked here.
                    const sizes = [...generateLeagues]
                      .map((id) => fixtureClubs.filter((club) => club.division_id === Number(id)).length)
                      .filter((n) => n >= 2)
                    if (sizes.length === 0) {
                      return 'Choose at least one league with two or more clubs.'
                    }
                    const pairs = sizes.reduce((sum, n) => sum + (n * (n - 1)) / 2, 0)
                    return `${sizes.length} league${sizes.length === 1 ? '' : 's'} · will create ${pairs * Number(generateRounds)} fixtures, all with no date so they land in Needs scheduling.`
                  })()}
                </p>
              </div>
            </div>
            <footer className="club-edit-footer">
              <button
                type="button"
                className="btn"
                disabled={generateBusy}
                onClick={() => setGenerateOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                type="submit"
                disabled={generateBusy || generateLeagues.size === 0}
              >
                {generateBusy ? 'Building…' : 'Generate fixtures'}
              </button>
            </footer>
          </form>
        </div>
      )}
      {scheduleTarget !== null && (
        <div
          className="squad-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !scheduleBusy) setScheduleTarget(null)
          }}
        >
{scheduleTarget === 'new' ? (
            (() => {
              const homeClub = divisionClubs.find((club) => club.slug === createHome) ?? null
              const awayClub = divisionClubs.find((club) => club.slug === createAway) ?? null
              const divisionName =
                fixtureDivisions.find((division) => String(division.id) === createDivisionId)?.name ??
                'that league'
              const seasonName =
                fixtureSeasons.find((season) => String(season.id) === createSeasonId)?.name ??
                'the selected season'
              const kickoffLabel = formatFixtureKickoff(createKickoff)
              return (
            <form
              className="squad-modal fixture-modal fixture-builder"
              role="dialog"
              aria-modal="true"
              aria-labelledby="fixture-modal-title"
              onSubmit={(event) => void saveNewMatch(event)}
            >
              <header>
                <div>
                  <p className="eyebrow">FIXTURE SETUP</p>
                  <h2 id="fixture-modal-title">Create a fixture</h2>
                  <p className="club-edit-subtitle">
                    {createSeasonId
                      ? `Choose a league, then pick who is playing in ${seasonName}.`
                      : 'Choose a season to load its clubs and leagues.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Close fixture setup"
                  disabled={scheduleBusy}
                  onClick={() => setScheduleTarget(null)}
                >
                  ×
                </button>
              </header>
              <div className="club-edit-content">
                <div className="fixture-context">
                  <label>
                    <span>Season</span>
                    <CustomSelect
                      ariaLabel="Fixture season"
                      value={createSeasonId}
                      disabled={fixtureSeasons.length === 0}
                      options={fixtureSeasons.map((season) => ({
                        value: String(season.id),
                        label: season.name,
                      }))}
                      onChange={(value) => {
                        setCreateSeasonId(value)
                        setCreateDivisionId('')
                        setFixtureClubs([])
                        setFixtureDivisions([])
                        setCreateHome('')
                        setCreateAway('')
                      }}
                    />
                  </label>
                  <label>
                    <span>League</span>
                    <CustomSelect
                      ariaLabel="Fixture league"
                      value={createDivisionId}
                      disabled={!createSeasonId || fixtureDivisions.length === 0}
                      options={[
                        { value: '', label: 'Choose league' },
                        ...fixtureDivisions.map((division) => ({
                          value: String(division.id),
                          label: division.name,
                        })),
                      ]}
                      onChange={(value) => {
                        setCreateDivisionId(value)
                        setCreateHome('')
                        setCreateAway('')
                      }}
                    />
                  </label>
                </div>

                <div className="fixture-versus">
                  <FixtureSlot
                    side="home"
                    club={homeClub}
                    disabled={!createDivisionId}
                    value={createHome}
                    ariaLabel="Home club"
                    placeholder="Choose home club"
                    options={divisionClubs.map((club) => ({ value: club.slug, label: club.name }))}
                    onChange={(value) => {
                      setCreateHome(value)
                      setCreateAway('')
                    }}
                  />
                  <div className="fixture-versus-badge" aria-hidden="true">
                    <span>VS</span>
                  </div>
                  <FixtureSlot
                    side="away"
                    club={awayClub}
                    disabled={!createHome || awayOptions.length === 0}
                    value={createAway}
                    ariaLabel="Away club"
                    placeholder="Choose away club"
                    options={awayOptions.map((club) => ({ value: club.slug, label: club.name }))}
                    onChange={setCreateAway}
                  />
                </div>

                <section className="fixture-kickoff">
                  <div className="fixture-kickoff-heading">
                    <h3>Kickoff</h3>
                    <span>Entered in Kuala Lumpur time (UTC+8)</span>
                  </div>
                  <input
                    className="text"
                    type="datetime-local"
                    aria-label="Kickoff date and time"
                    value={createKickoff}
                    onChange={(event) => setCreateKickoff(event.target.value)}
                  />
                  <div className="fixture-kickoff-presets">
                    <button
                      className="btn sm"
                      type="button"
                      disabled={scheduleBusy}
                      onClick={() => setCreateKickoff(fixtureKickoffPreset(0, 20))}
                    >
                      Tonight 20:00
                    </button>
                    <button
                      className="btn sm"
                      type="button"
                      disabled={scheduleBusy}
                      onClick={() => setCreateKickoff(fixtureKickoffPreset(1, 20))}
                    >
                      Tomorrow 20:00
                    </button>
                    <button
                      className="btn sm"
                      type="button"
                      disabled={scheduleBusy}
                      onClick={() => setCreateKickoff('')}
                    >
                      Leave blank
                    </button>
                  </div>
                  <p className="fixture-note">
                    Leaving kickoff blank is allowed. The fixture is created anyway and shows under
                    <strong> Needs scheduling</strong> until a date is set.
                  </p>
                </section>
              </div>
              <footer className="club-edit-footer fixture-footer">
                <p className="fixture-summary">
                  {homeClub && awayClub ? (
                    <>
                      <strong>{homeClub.name}</strong> host <strong>{awayClub.name}</strong> in{' '}
                      {divisionName}
                      {kickoffLabel ? ` · ${kickoffLabel}` : ' · no date yet'}
                    </>
                  ) : (
                    'Pick two clubs to see the fixture summary.'
                  )}
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={scheduleBusy}
                  onClick={() => setScheduleTarget(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  disabled={scheduleBusy || !createSeasonId || !createDivisionId || !createHome || !createAway}
                >
                  {scheduleBusy ? 'Creating…' : 'Create fixture'}
                </button>
              </footer>
            </form>
              )
            })()
          ) : (
            (() => {
              const match = [...matches, ...priorityData].find((item) => item.id === scheduleTarget)
              if (!match) return null
              return (
                <form
                  className="squad-modal fixture-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="schedule-modal-title"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveSchedule(match)
                  }}
                >
                  <header>
                    <div>
                      <p className="eyebrow">FIXTURE SCHEDULE</p>
                      <h2 id="schedule-modal-title">{match.home_name} <span>vs</span> {match.away_name}</h2>
                      <p className="club-edit-subtitle">Times are entered in Kuala Lumpur time (UTC+8).</p>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Close schedule editor"
                      disabled={scheduleBusy}
                      onClick={() => setScheduleTarget(null)}
                    >
                      ×
                    </button>
                  </header>
                  <div className="club-edit-content">
                    <label className="fixture-date-field">
                      <span>Kickoff date &amp; time</span>
                      <input
                        className="text"
                        type="datetime-local"
                        value={scheduleDrafts[match.id] ?? ''}
                        onChange={(event) =>
                          setScheduleDrafts((current) => ({
                            ...current,
                            [match.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <p className="fixture-note">
                      Clear the date to move this fixture to <strong>Needs scheduling</strong>.
                    </p>
                  </div>
                  <footer className="club-edit-footer">
                    <button
                      type="button"
                      className="btn"
                      disabled={scheduleBusy}
                      onClick={() => setScheduleTarget(null)}
                    >
                      Cancel
                    </button>
                    <button className="btn primary" disabled={scheduleBusy}>
                      {scheduleBusy ? 'Saving…' : 'Save schedule'}
                    </button>
                  </footer>
                </form>
              )
            })()
          )}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------- clubs */

function Applications({
  guard,
  report,
  onPendingCountChange,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
  onPendingCountChange: (count: number) => void
}) {
  const [clubs, setClubs] = useState<PendingClub[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await guard(getPendingClubs, 'Could not load applications')
    setClubs(data)
    onPendingCountChange(data.length)
  }, [guard, onPendingCountChange])

  useEffect(() => {
    load().catch(() => setClubs([]))
  }, [load])

  /* Rejecting is destructive and there is no undo other than retyping the
   * whole application, so it asks first. Approve does not: it is what the
   * row is sitting there waiting for. */
  const decide = async (club: PendingClub, decision: 'approve' | 'reject') => {
    if (
      decision === 'reject' &&
      !window.confirm(
        `Reject "${club.name}"?\n\nThe club is withdrawn, not deleted, and ${club.display_name ?? club.email ?? 'the manager'} is notified.`,
      )
    ) {
      return
    }

    setBusy(club.slug)
    try {
      await guard(() => decideClub(club.slug, decision), `Could not ${decision} ${club.name}`)
      report('ok', `${club.name} ${decision === 'approve' ? 'approved' : 'rejected'}.`)
      await load()
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  if (clubs === null) return <div className="loading">Loading applications…</div>

  return (
    <div className="card">
      <header>
        <h2>Club applications</h2>
        <span className="hint">
          {clubs.length === 0 ? 'Nothing waiting' : `${clubs.length} waiting`}
        </span>
      </header>

      {clubs.length === 0 ? (
        <p className="empty">
          Every club has been reviewed. New ones appear here the moment a manager creates one
          from the registration form.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Club</th>
              <th>Manager</th>
              <th>Applied</th>
              <th>Squad</th>
              <th style={{ textAlign: 'right' }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.slug}>
                <td>
                  <span className="name">{c.name}</span>
                </td>
                <td>
                  <div className="name">{c.display_name ?? <span className="hint">No name given</span>}</div>
                  {c.email && <div className="hint">{c.email}</div>}
                </td>
                <td>
                  <span className="hint">{c.created_at?.slice(0, 10)}</span>
                </td>
                <td>
                  <span className="hint">
                    {c.players === 0 ? '—' : `${c.players} signed`}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="row-actions">
                    <button
                      className="btn sm primary"
                      disabled={busy === c.slug}
                      onClick={() => void decide(c, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      className="btn sm danger"
                      disabled={busy === c.slug}
                      onClick={() => void decide(c, 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="footnote">
        Approving makes the club visible on the public site. Assign it to a division from Clubs
        before it can play fixtures.
      </p>
    </div>
  )
}

function Divisions({
  guard,
  report,
  onDivisionsChanged,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
  onDivisionsChanged: (divisions: Division[]) => void
}) {
  const [divisions, setDivisions] = useState<Division[] | null>(null)
  const [seasons, setSeasons] = useState<AdminSeason[] | null>(null)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [name, setName] = useState('')
  const [promotionCount, setPromotionCount] = useState('0')
  const [relegationCount, setRelegationCount] = useState('0')
  const [busy, setBusy] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [featuredBusy, setFeaturedBusy] = useState(false)
  const [featuredDivisionId, setFeaturedDivisionId] = useState('')
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const [divisionData, seasonData] = await Promise.all([
      guard(getDivisions, 'Could not load divisions'),
      guard(getAdminSeasons, 'Could not load seasons'),
    ])
    setDivisions(divisionData)
    setSeasons(seasonData)
    setFeaturedDivisionId(
      String(seasonData.find((season) => Boolean(season.is_current))?.featured_division_id ?? ''),
    )
  }, [guard])

  useEffect(() => {
    load().catch(() => setDivisions([]))
  }, [load])

  if (divisions === null || seasons === null) return <div className="loading">Loading divisions…</div>

  const currentSeason = seasons.find((season) => Boolean(season.is_current))

  const chooseFeaturedDivision = async (value: string) => {
    if (!currentSeason) return
    setFeaturedBusy(true)
    try {
      const updated = await guard(
        () => setFeaturedDivision(currentSeason.id, value ? Number(value) : null),
        'Could not update the featured league',
      )
      setFeaturedDivisionId(String(updated.featured_division_id ?? ''))
      setSeasons((current) =>
        (current ?? []).map((season) =>
          season.id === updated.id ? { ...season, featured_division_id: updated.featured_division_id } : season,
        ),
      )
      report(
        'ok',
        updated.featured_division_id == null
          ? 'The homepage will feature the highest-ranked league.'
          : 'Featured league updated for the homepage.',
      )
    } catch {
      /* already reported */
    } finally {
      setFeaturedBusy(false)
    }
  }

  const edit = (division: Division | null) => {
    setEditing(division?.id ?? 'new')
    setName(division?.name ?? '')
    setPromotionCount(division?.promotion_count == null ? '0' : String(division.promotion_count))
    setRelegationCount(division?.relegation_count == null ? '0' : String(division.relegation_count))
  }

  const activeDivisions = divisions.filter((division) => Boolean(division.is_active))

  /**
   * Whether this league's switch is locked.
   *
   * Only one state is unreachable: a season with no active league at all. The
   * server refuses to pause the last one, so this mirrors that rule and explains
   * it through the switch's title instead of failing after a round trip.
   *
   * Deliberately not "can this be paused". A paused league has to be switchable
   * back on — it is the only way out of the paused state — so the lock applies
   * to the active half of the switch and never the inactive half.
   */
  const switchLocked = (division: Division) => Boolean(division.is_active) && activeDivisions.length <= 1

  /**
   * Pause a league, or bring it back.
   *
   * Applied to local state first and reconciled from the response, so the
   * switch does not lag a round trip behind the click. A refusal — the season's
   * last active league — leaves the row exactly as it was, because the flag is
   * only merged in once the server has agreed to it.
   */
  const toggleActive = async (division: Division) => {
    if (togglingId !== null) return
    const next = !Boolean(division.is_active)
    const previous = division.is_active
    setTogglingId(division.id)
    setDivisions((current) =>
      (current ?? []).map((item) => (item.id === division.id ? { ...item, is_active: next } : item)),
    )
    try {
      const saved = await guard(
        () => setDivisionActive(division.id, next),
        next ? `Could not switch ${division.name} back on` : `Could not pause ${division.name}`,
      )
      setDivisions((current) =>
        (current ?? []).map((item) =>
          item.id === division.id ? { ...item, is_active: Boolean(saved.division.is_active) } : item,
        ),
      )
      if (saved.season) {
        setSeasons((current) =>
          (current ?? []).map((season) =>
            season.id === saved.season!.id
              ? { ...season, featured_division_id: saved.season!.featured_division_id }
              : season,
          ),
        )
        setFeaturedDivisionId(String(saved.season.featured_division_id ?? ''))
      }
      onDivisionsChanged(
        (divisions ?? []).map((item) =>
          item.id === division.id ? { ...item, is_active: Boolean(saved.division.is_active) } : item,
        ),
      )
      report(
        'ok',
        next
          ? `${division.name} is active again.`
          : saved.featuredCleared
            ? `${division.name} is paused and is no longer the homepage featured league.`
            : `${division.name} is paused. It is hidden from the site and cannot take new clubs or fixtures.`,
      )
    } catch {
      // Put the switch back the way it was; the server refused the change.
      setDivisions((current) =>
        (current ?? []).map((item) =>
          item.id === division.id ? { ...item, is_active: previous } : item,
        ),
      )
    } finally {
      setTogglingId(null)
    }
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editing === null) return
    const editId = editing
    setBusy(true)
    try {
      const input = {
        name: name.trim(),
        promotion_count: Number(promotionCount) || null,
        relegation_count: Number(relegationCount) || null,
      }
      const division = await guard(
        () => editId === 'new'
          ? createDivision(input)
          : updateDivision(editId, input),
        editId === 'new' ? 'Could not add division' : 'Could not update division',
      )
      const rows = editId === 'new'
        ? [...divisions, division]
        : divisions.map((item) => item.id === division.id ? division : item)
      const sorted = rows.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      setDivisions(sorted)
      onDivisionsChanged(sorted)
      report('ok', `${division.name} saved.`)
      setEditing(null)
    } catch {
      /* already reported */
    } finally {
      setBusy(false)
    }
  }

  const moveDivision = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= divisions.length || reordering || editing !== null) return

    const reordered = [...divisions]
    const [movedDivision] = reordered.splice(index, 1)
    reordered.splice(nextIndex, 0, movedDivision)
    setReordering(true)
    try {
      await guard(
        () => updateDivisionOrder(reordered.map((division) => division.id)),
        'Could not change league order',
      )
      const savedOrder = reordered.map((division, sort_order) => ({ ...division, sort_order }))
      setDivisions(savedOrder)
      // Promotion and relegation destinations are derived from this order, so
      // the club list has to see the new ladder immediately.
      onDivisionsChanged(savedOrder)
      report('ok', 'League order saved.')
    } catch {
      /* already reported */
    } finally {
      setReordering(false)
    }
  }

  const form = (
    <form className="division-editor" onSubmit={(event) => void save(event)}>
      <label>
        <span>Division name</span>
        <input
          className="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={64}
          required
          autoFocus
        />
      </label>
      <p className="division-range-help">
        Choose how many clubs move. Their positions are calculated from the division's current team count.
      </p>
      <div className="division-ranges">
        <fieldset>
          <legend>Promotion</legend>
          <label>
            <span>Promote top</span>
            <CustomSelect
              ariaLabel="Promote top"
              value={promotionCount}
              onChange={setPromotionCount}
              options={[
                { value: '0', label: 'No movement' },
                ...(Number(promotionCount) > 20
                  ? [{ value: promotionCount, label: `${promotionCount} clubs` }]
                  : []),
                ...Array.from({ length: 20 }, (_, index) => index + 1).map((count) => ({
                  value: String(count),
                  label: `${count} ${count === 1 ? 'club' : 'clubs'}`,
                })),
              ]}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Relegation</legend>
          <label>
            <span>Relegate bottom</span>
            <CustomSelect
              ariaLabel="Relegate bottom"
              value={relegationCount}
              onChange={setRelegationCount}
              options={[
                { value: '0', label: 'No movement' },
                ...(Number(relegationCount) > 20
                  ? [{ value: relegationCount, label: `${relegationCount} clubs` }]
                  : []),
                ...Array.from({ length: 20 }, (_, index) => index + 1).map((count) => ({
                  value: String(count),
                  label: `${count} ${count === 1 ? 'club' : 'clubs'}`,
                })),
              ]}
            />
          </label>
        </fieldset>
      </div>
      <div className="division-editor-actions">
        <button className="btn" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : editing === 'new' ? 'Add division' : 'Save changes'}
        </button>
      </div>
    </form>
  )

  return (
    <div className="division-management">
      <div className="card">
        <header>
          <div>
            <h2>Divisions</h2>
            <p className="hint">
              {currentSeason?.name ?? divisions[0]?.season ?? 'Current season'} · set the standings order and homepage feature independently
            </p>
          </div>
          <button
            className="btn primary sm"
            onClick={() => edit(null)}
            disabled={editing !== null || reordering}
          >
            <span aria-hidden="true">＋</span> Add division
          </button>
        </header>
        <div className="featured-league-setting">
          <div>
            <strong>Homepage featured league</strong>
            <p>
              Choose the league shown in the homepage leaders panel. This does not change league order on the standings page.
            </p>
          </div>
          <CustomSelect
            ariaLabel="Homepage featured league"
            value={featuredDivisionId}
            disabled={!currentSeason || activeDivisions.length === 0 || featuredBusy}
            options={[
              { value: '', label: 'Use highest-ranked league' },
              // Paused leagues are hidden from the homepage, so offering one
              // here would select something that cannot be rendered. The
              // toggle clears the feature if the featured league is paused.
              ...activeDivisions.map((division) => ({
                value: String(division.id),
                label: division.name,
              })),
            ]}
            onChange={(value) => void chooseFeaturedDivision(value)}
          />
        </div>
        {editing === 'new' && form}
        {divisions.length === 0 && editing !== 'new' ? (
          <p className="empty">There are no divisions in the current season yet. Add the first one to get started.</p>
        ) : (
          <div className="division-admin-list">
            {divisions.map((division, index) => (
              <article
                className={`division-admin-item${division.is_active ? '' : ' is-inactive'}`}
                key={division.id}
              >
                {editing === division.id ? form : (
                  <>
                    <div className="division-admin-heading">
                      <div className="division-admin-title">
                        <span className="division-admin-rank" aria-label={`League priority ${index + 1}`}>
                          {index + 1}
                        </span>
                        <div>
                          <h3>
                            {division.name}
                            {!division.is_active && (
                              <span className="division-inactive-badge">Inactive</span>
                            )}
                          </h3>
                          <span className="hint">{division.season}</span>
                        </div>
                      </div>
                      <div className="division-admin-actions">
                        <div className="division-reorder-controls" aria-label={`Reorder ${division.name}`}>
                          <button
                            className="icon-btn"
                            type="button"
                            aria-label={`Move ${division.name} higher`}
                            title="Move higher"
                            disabled={index === 0 || editing !== null || reordering}
                            onClick={() => void moveDivision(index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            className="icon-btn"
                            type="button"
                            aria-label={`Move ${division.name} lower`}
                            title="Move lower"
                            disabled={index === divisions.length - 1 || editing !== null || reordering}
                            onClick={() => void moveDivision(index, 1)}
                          >
                            ↓
                          </button>
                        </div>
                        <label
                          className="division-active-toggle"
                          title={
                            switchLocked(division)
                              ? `${division.name} is the only active league this season. Add another one before pausing it.`
                              : division.is_active
                                ? 'Pause this league'
                                : 'Make this league active again'
                          }
                        >
                          <input
                            type="checkbox"
                            role="switch"
                            checked={Boolean(division.is_active)}
                            disabled={togglingId !== null || editing !== null || reordering || switchLocked(division)}
                            aria-label={`${division.is_active ? 'Pause' : 'Activate'} ${division.name}`}
                            onChange={() => void toggleActive(division)}
                          />
                          <span className="division-active-track" aria-hidden="true" />
                          <span className="division-active-label">
                            {division.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </label>
                        <button className="btn sm" onClick={() => edit(division)} disabled={editing !== null || reordering}>
                          Edit division
                        </button>
                      </div>
                    </div>
                    <div className="division-range-summary">
                      <p><span>Promotion</span><strong>
                        {!division.is_active
                          ? 'Paused'
                          : division.promotion_count == null
                            ? 'Not set'
                            : `Top ${division.promotion_count}`}
                      </strong></p>
                      <p><span>Relegation</span><strong>
                        {!division.is_active
                          ? 'Paused'
                          : division.relegation_count == null
                            ? 'Not set'
                            : `Bottom ${division.relegation_count}`}
                      </strong></p>
                    </div>
                    {!division.is_active && (
                      <p className="division-inactive-note">
                        Hidden from the site and from every league picker in this admin. Clubs,
                        fixtures and standings are kept as they are, and no club can move in or out
                        of it at the end of the season until it is switched back on.
                      </p>
                    )}
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      <p className="footnote">
        Promotion and relegation are shown on the public standings. Divisions are retained for
        season history, so they cannot be deleted here. Pausing one keeps all of its history and
        hides it until you switch it back on.
      </p>
    </div>
  )
}

/**
 * Which season the club list is showing, and the maintenance actions for it.
 *
 * The picker and the season list are one card because they are one decision:
 * the leagues, clubs and squads below are all scoped to the selected season,
 * so splitting "pick a season" from "manage seasons" put a maintenance panel
 * and the control that drives it in different places.
 *
 * The maintenance half is collapsed by default — this page is for the clubs —
 * while the header keeps naming the season in view and whether it is writable,
 * so nothing needed to orient yourself is hidden.
 */
function SeasonManagement({
  guard,
  report,
  seasons,
  setSeasons,
  seasonId,
  selectedSeason,
  readOnly,
  onSeasonChange,
  onCurrentSeasonChanged,
  onCompleteSeason,
  lastRollover,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
  seasons: AdminSeason[]
  setSeasons: Dispatch<SetStateAction<AdminSeason[]>>
  seasonId: string
  selectedSeason: AdminSeason | null
  readOnly: boolean
  onSeasonChange: (seasonId: string) => void
  onCurrentSeasonChanged: (seasonId: number) => void
  onCompleteSeason: () => void
  /** The rollover that opened the season in view, if there was one. */
  lastRollover: RolloverRecord | null
}) {
  const [editingSeasonId, setEditingSeasonId] = useState<number | null>(null)
  const [seasonName, setSeasonName] = useState('')
  const [showNewSeason, setShowNewSeason] = useState(false)
  const [newSeasonName, setNewSeasonName] = useState('')
  const [newSeasonYear, setNewSeasonYear] = useState(String(new Date().getFullYear()))
  const [busy, setBusy] = useState(false)
  // Collapsed by default: this is a maintenance panel, and the club list it
  // scopes is what the page is actually for. It still shows which season is
  // live, so nothing here is hidden that you need to orient yourself.
  const [expanded, setExpanded] = useState(false)

  const saveSeasonName = async (event: FormEvent<HTMLFormElement>, season: AdminSeason) => {
    event.preventDefault()
    setBusy(true)
    try {
      const updated = await guard(
        () => updateSeason(season.id, seasonName.trim()),
        'Could not update season name',
      )
      setSeasons((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setEditingSeasonId(null)
      onCurrentSeasonChanged(updated.id)
      report('ok', `${updated.name} saved.`)
    } catch {
      /* already reported */
    } finally {
      setBusy(false)
    }
  }

  const activateSeason = async (season: AdminSeason) => {
    setBusy(true)
    try {
      const activated = await guard(
        () => setCurrentSeason(season.id),
        'Could not activate season',
      )
      setSeasons((current) =>
        current.map((item) => ({ ...item, is_current: item.id === activated.id })),
      )
      setEditingSeasonId(null)
      onCurrentSeasonChanged(activated.id)
      report('ok', `${activated.name} is now the current season.`)
    } catch {
      /* already reported */
    } finally {
      setBusy(false)
    }
  }

  const addSeason = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const created = await guard(
        () => createSeason(newSeasonName.trim(), Number(newSeasonYear)),
        'Could not create season',
      )
      setSeasons((current) =>
        [
          ...current.map((season) => ({ ...season, is_current: false })),
          created.season,
        ].sort(
          (a, b) =>
            Number(Boolean(b.is_current)) - Number(Boolean(a.is_current)) || b.year - a.year,
        ),
      )
      setNewSeasonName('')
      setShowNewSeason(false)
      onCurrentSeasonChanged(created.season.id)
      report('ok', `${created.season.name} created and activated with copied divisions and club entries.`)
    } catch {
      /* already reported */
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`card season-management${expanded ? ' expanded' : ''}`}>
      <header className="season-management-header">
        <label className="season-context-picker">
          <span>Season</span>
          <CustomSelect
            ariaLabel="Season to show clubs for"
            value={seasonId}
            disabled={seasons.length === 0}
            options={[
              ...(seasons.length > 0 ? [] : [{ value: '', label: 'Loading seasons…' }]),
              ...seasons.map((season) => ({
                value: String(season.id),
                label: Boolean(season.is_current) ? `${season.name} (current)` : season.name,
              })),
            ]}
            onChange={onSeasonChange}
          />
        </label>
        <div className="season-context-note">
          {selectedSeason ? (
            <>
              <strong>{selectedSeason.name}</strong>
              <span>{readOnly ? 'Closed season · read only' : 'Live season · editable'}</span>
            </>
          ) : (
            <span>Loading seasons…</span>
          )}
        </div>
        <div className="season-management-actions">
          <button
            className="btn sm"
            type="button"
            aria-expanded={expanded}
            aria-controls="season-management-body"
            onClick={() => setExpanded((open) => !open)}
          >
            <span className="season-management-caret" aria-hidden="true">
              {'▸'}
            </span>
            {expanded ? 'Hide options' : 'More options'}
          </button>
          <button
            className="btn primary sm season-complete-btn"
            type="button"
            disabled={busy || readOnly}
            onClick={onCompleteSeason}
          >
            Complete season
          </button>
          <button
            className="btn primary sm"
            type="button"
            disabled={busy}
            onClick={() => {
              const year = Math.max(new Date().getFullYear(), ...seasons.map((season) => season.year))
              setNewSeasonYear(String(year))
              setNewSeasonName(`${year} Season 1`)
              setEditingSeasonId(null)
              setExpanded(true)
              setShowNewSeason((shown) => !shown)
            }}
          >
            ＋ New season
          </button>
        </div>
      </header>
      <div className="season-management-body" id="season-management-body" hidden={!expanded}>
      {!readOnly && lastRollover && (
        <div className="rollover-history">
          <div>
            <strong>
              {lastRollover.sourceSeason.name} → {lastRollover.season.name}
            </strong>
            <span>
              {lastRollover.movedClubs === 0
                ? 'Completed with no movement.'
                : `${lastRollover.movedClubs} club${
                    lastRollover.movedClubs === 1 ? '' : 's'
                  } changed league.`}
            </span>
          </div>
          <p className="hint">
            {lastRollover.undoable
              ? 'Nothing has been added to this season yet, so the rollover can still be taken back.'
              : 'Fixtures or results have since been added, so the rollover can no longer be taken back.'}
          </p>
        </div>
      )}
      {showNewSeason && (
        <form className="season-create-form" onSubmit={(event) => void addSeason(event)}>
          <label>
            <span>Season name</span>
            <input
              className="text"
              value={newSeasonName}
              onChange={(event) => setNewSeasonName(event.target.value)}
              maxLength={64}
              required
              autoFocus
            />
          </label>
          <label>
            <span>Season year</span>
            <input
              className="text"
              type="number"
              min="2000"
              max="9999"
              value={newSeasonYear}
              onChange={(event) => setNewSeasonYear(event.target.value)}
              required
            />
          </label>
          <p className="season-copy-note">
            This will become current. Divisions and club entries will be copied from the current season;
            fixtures and results start fresh.
          </p>
          <div className="division-editor-actions">
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => setShowNewSeason(false)}
            >
              Cancel
            </button>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create and activate'}
            </button>
          </div>
        </form>
      )}
      <div className="season-admin-list">
        {seasons.map((season) => (
          <article className="season-admin-item" key={season.id}>
            {editingSeasonId === season.id ? (
              <form
                className="season-name-editor"
                onSubmit={(event) => void saveSeasonName(event, season)}
              >
                <label>
                  <span>Season name</span>
                  <input
                    className="text"
                    value={seasonName}
                    onChange={(event) => setSeasonName(event.target.value)}
                    maxLength={64}
                    required
                    autoFocus
                  />
                </label>
                <button className="btn sm primary" type="submit" disabled={busy}>
                  Save name
                </button>
                <button
                  className="btn sm"
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingSeasonId(null)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <div className="season-admin-name">
                  <strong>{season.name}</strong>
                  {Boolean(season.is_current) && <span className="season-current-badge">Current</span>}
                </div>
                <div className="season-admin-actions">
                  <button
                    className="btn sm"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSeasonName(season.name)
                      setShowNewSeason(false)
                      setEditingSeasonId(season.id)
                    }}
                  >
                    Rename
                  </button>
                  {!Boolean(season.is_current) && (
                    <button
                      className="btn sm"
                      type="button"
                      disabled={busy}
                      onClick={() => void activateSeason(season)}
                    >
                      Make current
                    </button>
                  )}
                </div>
              </>
            )}
          </article>
        ))}
      </div>
      </div>
    </section>
  )
}

const CLUB_REGION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Not set' },
  { value: '🇸🇬', label: '🇸🇬 Singapore' },
  { value: '🇲🇾', label: '🇲🇾 Malaysia' },
  { value: '🇮🇩', label: '🇮🇩 Indonesia' },
  { value: '🇹🇭', label: '🇹🇭 Thailand' },
  { value: '🇧🇳', label: '🇧🇳 Brunei' },
  { value: '🇵🇭', label: '🇵🇭 Philippines' },
  { value: '🇻🇳', label: '🇻🇳 Vietnam' },
]

async function compressUploadedClubLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read uploaded logo file'))
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        reject(new Error('Empty logo file'))
        return
      }
      const img = new Image()
      img.onerror = () => resolve(dataUrl)
      img.onload = () => {
        try {
          const maxDim = 256
          let width = img.naturalWidth || img.width
          let height = img.naturalHeight || img.height
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height)
            width = Math.max(1, Math.round(width * scale))
            height = Math.max(1, Math.round(height * scale))
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(dataUrl)
            return
          }
          ctx.clearRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          const webp = canvas.toDataURL('image/webp', 0.9)
          resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png'))
        } catch {
          resolve(dataUrl)
        }
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

function AllClubsDirectory({
  guard,
  report,
  divisions,
  onClubsChanged,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
  divisions: Division[]
  onClubsChanged: () => Promise<void>
}) {
  const [allClubs, setAllClubs] = useState<Club[] | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'withdrawn'>('all')
  const [editingSlug, setEditingSlug] = useState<string | 'new' | null>(null)
  const [formName, setFormName] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formFlag, setFormFlag] = useState('')
  const [formStatus, setFormStatus] = useState<'active' | 'pending' | 'withdrawn'>('active')
  const [formDivisionId, setFormDivisionId] = useState('')
  const [formLogo, setFormLogo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await guard(() => getAdminClubs(), 'Could not load club directory')
    setAllClubs(data)
  }, [guard])

  useEffect(() => {
    load().catch(() => setAllClubs([]))
  }, [load])

  const assignableDivisions = divisions.filter((d) => Boolean(d.is_active))

  const openEditor = (club: Club | null) => {
    if (club) {
      setEditingSlug(club.slug)
      setFormName(club.name)
      setFormCode(club.short_code ?? '')
      setFormFlag(club.flag ?? '')
      setFormStatus(
        club.status === 'pending' || club.status === 'withdrawn' ? club.status : 'active',
      )
      setFormDivisionId(club.division_id ? String(club.division_id) : '')
      setFormLogo(club.logo_local ?? club.logo_url ?? null)
    } else {
      setEditingSlug('new')
      setFormName('')
      setFormCode('')
      setFormFlag('')
      setFormStatus('active')
      setFormDivisionId('')
      setFormLogo(null)
    }
  }

  const handleLogoFile = async (file: File | null) => {
    if (!file) return
    try {
      const compressed = await compressUploadedClubLogo(file)
      setFormLogo(compressed)
      report('info', `Loaded logo "${file.name}". Click Save to publish.`)
    } catch (err) {
      report('error', err instanceof Error ? err.message : 'Could not read logo image')
    }
  }

  const saveClubForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editingSlug === null) return
    const target = editingSlug
    const trimmedName = formName.trim()
    if (!trimmedName) {
      report('error', 'Club name is required.')
      return
    }
    setBusy(true)
    try {
      if (target === 'new') {
        const created = await guard(
          () =>
            createAdminClub({
              name: trimmedName,
              shortCode: formCode.trim().toUpperCase() || null,
              flag: formFlag.trim() || null,
              status: formStatus,
              logoLocal: formLogo,
              logoUrl: formLogo,
              divisionId: formDivisionId ? Number(formDivisionId) : null,
            }),
          'Could not create club',
        )
        await load()
        await onClubsChanged()
        setEditingSlug(null)
        report('ok', `${created.name} created.`)
      } else {
        const existing = allClubs?.find((c) => c.slug === target)
        await guard(
          () =>
            updateClub(target, {
              name: trimmedName,
              shortCode: formCode.trim().toUpperCase() || null,
              flag: formFlag.trim() || null,
              status: formStatus,
              logoLocal: formLogo,
              logoUrl: formLogo,
            }),
          `Could not update ${trimmedName}`,
        )
        const prevDiv = existing?.division_id ? String(existing.division_id) : ''
        if (formDivisionId !== prevDiv && formStatus === 'active') {
          await guard(
            () => assignDivision(target, formDivisionId ? Number(formDivisionId) : null),
            `Could not update league assignment for ${trimmedName}`,
          )
        }
        await load()
        await onClubsChanged()
        setEditingSlug(null)
        report('ok', `${trimmedName} updated.`)
      }
    } catch {
      /* already reported */
    } finally {
      setBusy(false)
    }
  }

  const removeClub = async (club: Club) => {
    if (
      deletingSlug !== null ||
      !window.confirm(
        `Delete "${club.name}" permanently?\n\nIts players will become free agents and any fixtures or standings rows for this club will be removed.`,
      )
    ) {
      return
    }
    setDeletingSlug(club.slug)
    try {
      await guard(() => deleteAdminClub(club.slug), `Could not delete ${club.name}`)
      await load()
      await onClubsChanged()
      if (editingSlug === club.slug) setEditingSlug(null)
      report('ok', `${club.name} deleted.`)
    } catch {
      /* already reported */
    } finally {
      setDeletingSlug(null)
    }
  }

  const filtered = (allClubs ?? []).filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      (c.short_code ?? '').toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.flag ?? '').toLowerCase().includes(q)
    )
  })

  const clubEditorForm = (
    <form className="division-editor" onSubmit={(event) => void saveClubForm(event)}>
      <div className="club-crud-logo-row">
        <div className="club-crud-logo-preview">
          {formLogo ? (
            <img src={formLogo} alt="Club crest preview" />
          ) : (
            <span>{(formCode || formName || 'CLB').slice(0, 3).toUpperCase()}</span>
          )}
        </div>
        <div className="club-crud-logo-controls">
          <span className="club-crud-logo-title">Club crest / logo</span>
          <p className="hint">
            Upload a PNG, WebP, or JPG crest. It is automatically optimized to 256×256 so it loads fast across tables and fixtures.
          </p>
          <div className="club-crud-logo-buttons">
            <label className="btn sm">
              Upload logo image
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  void handleLogoFile(file)
                  event.target.value = ''
                }}
              />
            </label>
            {formLogo && (
              <button
                type="button"
                className="btn sm"
                onClick={() => setFormLogo(null)}
              >
                Remove logo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="members-form-grid">
        <label>
          <span>Club name</span>
          <input
            className="text"
            placeholder="e.g. GARUDA VFC"
            value={formName}
            onChange={(event) => setFormName(event.target.value)}
            maxLength={120}
            required
            autoFocus
          />
        </label>
        <label>
          <span>Short code (3–8 chars)</span>
          <input
            className="text"
            placeholder="e.g. GRD"
            value={formCode}
            onChange={(event) => setFormCode(event.target.value.toUpperCase())}
            maxLength={8}
          />
        </label>
        <label>
          <span>Region / flag</span>
          <CustomSelect
            ariaLabel="Club region flag"
            value={formFlag}
            options={CLUB_REGION_OPTIONS}
            onChange={setFormFlag}
          />
        </label>
        <label>
          <span>Status</span>
          <CustomSelect
            ariaLabel="Club status"
            value={formStatus}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'pending', label: 'Pending' },
              { value: 'withdrawn', label: 'Withdrawn' },
            ]}
            onChange={(val) => {
              if (val === 'active' || val === 'pending' || val === 'withdrawn') {
                setFormStatus(val)
              }
            }}
          />
        </label>
        <label>
          <span>Current season league</span>
          <CustomSelect
            ariaLabel="Current season league"
            value={formDivisionId}
            disabled={formStatus !== 'active'}
            options={[
              { value: '', label: 'Unassigned' },
              ...assignableDivisions.map((d) => ({ value: String(d.id), label: d.name })),
            ]}
            onChange={setFormDivisionId}
          />
        </label>
      </div>

      <div className="division-editor-actions">
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => setEditingSlug(null)}
        >
          Cancel
        </button>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : editingSlug === 'new' ? 'Create club' : 'Save changes'}
        </button>
      </div>
    </form>
  )

  return (
    <div className="division-management">
      <div className="card">
        <header>
          <div>
            <h2>All clubs directory</h2>
            <p className="hint">
              Create, edit, upload club logos, or delete clubs across the entire database ({filtered.length} of {allClubs?.length ?? 0} shown).
            </p>
          </div>
          <button
            className="btn primary sm"
            type="button"
            disabled={editingSlug !== null}
            onClick={() => openEditor(null)}
          >
            <span aria-hidden="true">＋</span> Add club
          </button>
        </header>

        {editingSlug === 'new' && clubEditorForm}

        <div className="members-toolbar">
          <input
            className="text"
            type="search"
            placeholder="Search clubs by name, short code, or slug…"
            aria-label="Search clubs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="members-filter-select">
            <CustomSelect
              ariaLabel="Filter clubs by status"
              value={statusFilter}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active only' },
                { value: 'pending', label: 'Pending only' },
                { value: 'withdrawn', label: 'Withdrawn only' },
              ]}
              onChange={(val) => {
                if (val === 'all' || val === 'active' || val === 'pending' || val === 'withdrawn') {
                  setStatusFilter(val)
                }
              }}
            />
          </div>
        </div>

        {allClubs === null ? (
          <div className="loading">Loading clubs…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No clubs match your filter.</div>
        ) : (
          <div className="division-admin-list">
            {filtered.map((c) => {
              const divName = divisions.find((d) => d.id === c.division_id)?.name
              const logoSrc = c.logo_local || c.logo_url
              return (
                <article
                  key={c.slug}
                  className={`division-admin-item${c.status !== 'active' ? ' is-inactive' : ''}`}
                >
                  {editingSlug === c.slug ? (
                    clubEditorForm
                  ) : (
                    <div className="division-admin-heading members-row">
                      <div className="division-admin-title">
                        <div className="club-crud-avatar">
                          {logoSrc ? (
                            <img src={logoSrc} alt="" />
                          ) : (
                            <span>{(c.short_code || c.name).slice(0, 3).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <h3>
                            {c.flag && <span className="flag">{c.flag}</span>}
                            {c.name}
                            {c.short_code && (
                              <span className="format-tag-badge">{c.short_code}</span>
                            )}
                            <span
                              className={`format-status-badge ${
                                c.status === 'active'
                                  ? 'status-active'
                                  : c.status === 'pending'
                                    ? 'status-coming_soon'
                                    : 'status-inactive'
                              }`}
                            >
                              {c.status}
                            </span>
                          </h3>
                          <span className="hint">
                            {divName ? `League: ${divName}` : 'Unassigned'} · {c.players}{' '}
                            {c.players === 1 ? 'player' : 'players'} · Slug: <code>{c.slug}</code>
                          </span>
                        </div>
                      </div>
                      <div className="division-admin-actions">
                        <button
                          className="btn sm"
                          type="button"
                          disabled={editingSlug !== null}
                          onClick={() => openEditor(c)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn sm danger"
                          type="button"
                          disabled={deletingSlug === c.slug || editingSlug !== null}
                          onClick={() => void removeClub(c)}
                        >
                          {deletingSlug === c.slug ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Clubs({
  guard,
  report,
  section,
  setSection,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
  section: ClubSection
  setSection: (section: ClubSection) => void
}) {
  const [clubs, setClubs] = useState<Club[] | null>(null)
  const [standings, setStandings] = useState<Standing[]>([])
  // The rollover that opened the current season, if there was one. Null when the
  // season was not started by a rollover, or when it could not be read.
  const [lastRollover, setLastRollover] = useState<RolloverRecord | null>(null)
  const [seasons, setSeasons] = useState<AdminSeason[]>([])
  const [seasonId, setSeasonId] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<Record<string, string>>({})
  const [logos, setLogos] = useState<Record<string, string | null>>({})
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [divisions, setDivisions] = useState<Division[]>([])
  const [divisionOf, setDivisionOf] = useState<Record<string, string>>({})
  const [players, setPlayers] = useState<Record<string, string[]>>({})
  const [newPlayer, setNewPlayer] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [squadSlug, setSquadSlug] = useState<string | null>(null)
  const [squadLoading, setSquadLoading] = useState(false)
  const [squadError, setSquadError] = useState<string | null>(null)
  const [clubSort, setClubSort] = useState<'standings' | 'name'>('standings')
  // Bulk selection is a set of slugs so it survives the resort that happens
  // after every action, and so one row can be toggled without rebuilding it.
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(() => new Set())
  // Which bulk action is in flight, if any. One state rather than a boolean so
  // each button can show its own spinner instead of every button claiming the
  // work while a different one is actually running.
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null)
  const [bulkLeague, setBulkLeague] = useState('')
  const [bulkStatus, setBulkStatus] = useState('')
  // Season rollover. The dialog is open across a re-render while it is up, so
  // this state has to live above the loading return below.
  const [rolloverOpen, setRolloverOpen] = useState(false)
  const activeClub = clubs?.find((club) => club.slug === editing) ?? null

  const currentSeasonId = seasons.find((season) => Boolean(season.is_current))?.id ?? null
  const selectedSeason = seasons.find((season) => String(season.id) === seasonId) ?? null
  // Only the live season can be written to. Every earlier season is kept as
  // history, so a past table stays exactly as the season finished rather than
  // being edited months later by someone who has forgotten what it was.
  const readOnly = currentSeasonId !== null && Number(seasonId) !== currentSeasonId

  /**
   * Load one season's clubs, leagues and table.
   *
   * Everything on this page is scoped to the selected season rather than
   * whatever happens to be current, which is what makes the read-only past
   * season view meaningful instead of a second copy of the live data.
   */
  const loadSeason = useCallback(async (targetSeasonId: number) => {
    const [data, currentDivisions, currentStandings, rollover] = await Promise.all([
      guard(() => getClubs(targetSeasonId), 'Could not load clubs'),
      guard(() => getDivisions(targetSeasonId), 'Could not load leagues'),
      guard(() => getStandings(targetSeasonId), 'Could not load standings').catch(() => []),
      guard(getSeasonRollover, 'Could not load the last season rollover').catch(() => null),
    ])
    setClubs(data)
    setStandings(currentStandings)
    setLastRollover(rollover)
    setNames(Object.fromEntries(data.map((c) => [c.slug, c.name])))
    setCodes(Object.fromEntries(data.map((c) => [c.slug, c.short_code ?? ''])))
    setFlags(Object.fromEntries(data.map((c) => [c.slug, c.flag ?? ''])))
    setLogos(Object.fromEntries(data.map((c) => [c.slug, c.logo_local ?? c.logo_url ?? null])))
    setStatuses(Object.fromEntries(data.map((c) => [c.slug, c.status])))
    setDivisions(currentDivisions)
    setDivisionOf(
      Object.fromEntries(data.map((club) => [
        club.slug,
        club.division_id ? String(club.division_id) : '',
      ])),
    )
  }, [guard])

  useEffect(() => {
    guard(getAdminSeasons, 'Could not load seasons for club management')
      .then((available) => {
        setSeasons(available)
        const preferred =
          available.find((season) => Boolean(season.is_current)) ?? available[0]
        if (preferred) setSeasonId(String(preferred.id))
      })
      .catch(() => setSeasons([]))
  }, [guard])

  useEffect(() => {
    if (!seasonId) return
    // Cleared here rather than inside loadSeason: a bulk update reloads the
    // season and has to keep the selection, so that the admin can set the next
    // field on the same clubs. Only a change of season drops it.
    setSelectedSlugs(new Set())
    setClubs(null)
    loadSeason(Number(seasonId)).catch(() => setClubs([]))
  }, [loadSeason, seasonId])

  // Everything that writes reloads the season it was working on, so a refresh
  // after a season switch cannot land the previous season's rows back on screen.
  const refresh = useCallback(async () => {
    if (!seasonId) return
    await loadSeason(Number(seasonId))
  }, [loadSeason, seasonId])

  // Whether the floating bulk bar is on screen.
  const bulkBarVisible = clubs !== null && selectedSlugs.size > 0 && !readOnly

  const loadPlayers = async (slug: string) => {
    const res = await fetch(`/api/clubs/${encodeURIComponent(slug)}`)
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    const body: { players: { gamertag: string }[] } = await res.json()
    setPlayers((s) => ({ ...s, [slug]: body.players.map((p) => p.gamertag) }))
  }

  useEffect(() => {
    if (!squadSlug && !editing) return
    const previousOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSquadSlug(null)
        setEditing(null)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.style.overflow = previousRootOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [editing, squadSlug])

  // Every hook must be above this line. Returning early with hooks still to be
  // called makes React throw "Rendered more hooks than during the previous
  // render" the moment clubs arrives and the data branch renders — which
  // unmounts the page and shows nothing at all, not a visible error.
  if (clubs === null) return <div className="loading">Loading clubs…</div>

  const save = async (c: Club) => {
    if (readOnly) return
    const nextName = (names[c.slug] ?? c.name).trim()
    if (!nextName) {
      report('error', 'Club name is required.')
      return
    }
    setBusy(c.slug)
    try {
      const nextFlag = (flags[c.slug] ?? '').trim() || null
      const nextLogo = logos[c.slug] !== undefined ? logos[c.slug] : c.logo_local
      await guard(
        () =>
          updateClub(c.slug, {
            name: nextName,
            shortCode: codes[c.slug] || null,
            flag: nextFlag,
            logoLocal: nextLogo,
            logoUrl: nextLogo,
            status: statuses[c.slug],
          }),
        `Could not save ${nextName}`,
      )
      const chosen = divisionOf[c.slug] ?? ''
      setClubs((current) =>
        current?.map((club) =>
          club.slug === c.slug
            ? {
                ...club,
                name: nextName,
                short_code: codes[c.slug] || null,
                flag: nextFlag,
                logo_local: nextLogo,
                logo_url: nextLogo,
                status: statuses[c.slug],
              }
            : club,
        ) ?? null,
      )

      // Division is a separate call: it has to create the club's standings row,
      // which is not something the club PATCH knows how to do.
      //
      // Clearing the picker is a real change, not "leave it alone": choosing
      // Unassigned has to take the club out of its league and drop it into the
      // unassigned table, so this tests whether the selection changed rather
      // than whether there is a selection at all.
      const wasIn = c.division_id ? String(c.division_id) : ''
      if (chosen !== wasIn) {
        const target = chosen === '' ? null : Number(chosen)
        const res = await guard(
          () => assignDivision(c.slug, target),
          target === null
            ? `Could not remove ${nextName} from its league`
            : `Could not assign ${nextName} to the division`,
        )
        setClubs((current) =>
          current?.map((club) =>
            club.slug === c.slug ? { ...club, division_id: res.divisionId } : club,
          ) ?? null,
        )
        const updatedStandings = await guard(
          () => getStandings(Number(seasonId)),
          'Could not refresh standings after changing the league',
        )
        setStandings(updatedStandings)
        report(
          'ok',
          res.divisionName
            ? `Saved ${nextName} and entered it into ${res.divisionName}.`
            : `Saved ${nextName} and removed it from its league. It is now unassigned.`,
        )
      } else {
        report('ok', `Saved ${nextName}.`)
      }

      setEditing(null)
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  const edit = (c: Club) => {
    setNames((s) => ({ ...s, [c.slug]: c.name }))
    setCodes((s) => ({ ...s, [c.slug]: c.short_code ?? '' }))
    setFlags((s) => ({ ...s, [c.slug]: c.flag ?? '' }))
    setLogos((s) => ({ ...s, [c.slug]: c.logo_local ?? c.logo_url ?? null }))
    setStatuses((s) => ({ ...s, [c.slug]: c.status }))
    setDivisionOf((s) => ({ ...s, [c.slug]: c.division_id ? String(c.division_id) : '' }))
    setNewPlayer((s) => ({ ...s, [c.slug]: '' }))
    setEditing(c.slug)
  }

  const cancelEdit = (c: Club) => {
    setNames((s) => ({ ...s, [c.slug]: c.name }))
    setCodes((s) => ({ ...s, [c.slug]: c.short_code ?? '' }))
    setFlags((s) => ({ ...s, [c.slug]: c.flag ?? '' }))
    setLogos((s) => ({ ...s, [c.slug]: c.logo_local ?? c.logo_url ?? null }))
    setStatuses((s) => ({ ...s, [c.slug]: c.status }))
    setDivisionOf((s) => ({ ...s, [c.slug]: c.division_id ? String(c.division_id) : '' }))
    setNewPlayer((s) => ({ ...s, [c.slug]: '' }))
    setEditing(null)
  }

  const viewSquad = async (c: Club) => {
    setEditing(null)
    setSquadSlug(c.slug)
    setSquadError(null)
    if (players[c.slug]) return

    setSquadLoading(true)
    try {
      await guard(() => loadPlayers(c.slug), `Could not load ${c.name}'s squad`)
    } catch (err) {
      setSquadError(err instanceof Error ? err.message : String(err))
    } finally {
      setSquadLoading(false)
    }
  }

  const add = async (c: Club) => {
    if (readOnly) return
    const tag = (newPlayer[c.slug] ?? '').trim()
    if (!tag) {
      report('error', 'Enter a gamertag first.')
      return
    }
    setBusy(c.slug)
    try {
      await guard(() => addPlayer(c.slug, tag), `Could not add ${tag} to ${c.name}`)
      report('ok', `${tag} added to ${c.name}.`)
      setNewPlayer((s) => ({ ...s, [c.slug]: '' }))
      setClubs((current) =>
        current?.map((club) =>
          club.slug === c.slug ? { ...club, players: club.players + 1 } : club,
        ) ?? null,
      )
      setPlayers((current) => ({
        ...current,
        [c.slug]: [...(current[c.slug] ?? []), tag],
      }))
      await guard(() => loadPlayers(c.slug), `Could not refresh ${c.name}'s squad`)
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  const drop = async (c: Club, gamertag: string) => {
    if (readOnly) return
    setBusy(c.slug)
    try {
      await guard(
        () => removePlayer(c.slug, gamertag),
        `Could not release ${gamertag} from ${c.name}`,
      )
      report('ok', `${gamertag} released by ${c.name}.`)
      setClubs((current) =>
        current?.map((club) =>
          club.slug === c.slug ? { ...club, players: Math.max(0, club.players - 1) } : club,
        ) ?? null,
      )
      setPlayers((current) => ({
        ...current,
        [c.slug]: (current[c.slug] ?? []).filter((player) => player !== gamertag),
      }))
      await guard(() => loadPlayers(c.slug), `Could not refresh ${c.name}'s squad`)
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  const getDivisionId = (club: Club) => String(club.division_id ?? '')
  const configuredDivisionIds = new Set(divisions.map((division) => String(division.id)))

  /**
   * Leagues a club can be entered into.
   *
   * `divisions` still holds paused leagues, because their clubs are still in
   * one and the list has to keep showing them where they are. This is the
   * narrower list the two "move to league" pickers read from, so nothing new can
   * be put into a league that is switched off.
   */
  const assignableDivisions = divisions.filter((division) => Boolean(division.is_active))
  const standingsByClub = new Map(standings.map((standing) => [standing.club_id, standing]))

  /**
   * How many clubs a league sends up and down at the end of the season.
   *
   * Straight from the league's configuration: nothing moves during the season,
   * so there is no progress to subtract and no slots to run out of. The zone
   * colours on this page are a preview of who is currently in line, not a record
   * of movement that has happened.
   *
   * A league that promotes but sets no relegation count still sends one club
   * down - a tier that never loses anyone cannot have a relegation zone on the
   * standings page. This mirrors `movementQuota` in api/src/domain/rollover.ts,
   * which is what actually decides the movement at the end of the season.
   */
  const promotionTargetFor = (division: Division) =>
    // A paused league takes no part in the ladder, so it gets no zone to colour
    // on this page either.
    division.is_active ? (division.promotion_count ?? 0) : 0
  const relegationTargetFor = (division: Division) => {
    if (!division.is_active) return 0
    const configuredCount = division.relegation_count ?? 0
    return configuredCount > 0
      ? configuredCount
      : (division.promotion_count ?? 0) > 0
        ? 1
        : 0
  }

  /**
   * Each club's rank inside its own league, and how big that league is.
   *
   * Ranked from the league's club list rather than from standings rows alone.
   * A club can be entered in a league without a standings_snapshot row behind
   * it yet, and reading that as "no position at all" would put those clubs in
   * the relegation zone by accident. Ranking the list keeps position and league
   * size describing the same set of clubs, so the bottom N is always the bottom
   * N of what the admin is actually looking at.
   */
  const leagueRankByClubId = new Map<number, number>()
  const leagueSizeByDivisionId = new Map<number, number>()
  for (const division of divisions) {
    const members = clubs.filter((club) => club.division_id === division.id)
    leagueSizeByDivisionId.set(division.id, members.length)
    const ranked = [...members].sort((a, b) => {
      const positionA = standingsByClub.get(a.id)?.position ?? Number.POSITIVE_INFINITY
      const positionB = standingsByClub.get(b.id)?.position ?? Number.POSITIVE_INFINITY
      if (positionA !== positionB) return positionA - positionB
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    })
    ranked.forEach((club, index) => leagueRankByClubId.set(club.id, index + 1))
  }

  /** Which end of the table a club is in, as things stand right now. */
  const clubZone = (club: Club) => {
    if (readOnly) return { promotion: false, relegation: false }
    const division = divisions.find((item) => item.id === club.division_id)
    const position = leagueRankByClubId.get(club.id)
    if (!division || position === undefined) return { promotion: false, relegation: false }
    const divisionSize = leagueSizeByDivisionId.get(division.id) ?? 0
    const promotionCount = promotionTargetFor(division)
    const relegationCount = relegationTargetFor(division)
    const promotion = promotionCount > 0 && position <= promotionCount
    return {
      promotion,
      relegation: !promotion && relegationCount > 0 && position > divisionSize - relegationCount,
    }
  }
  const hasPromotionZones = divisions.some((division) => promotionTargetFor(division) > 0)
  const hasRelegationZones = divisions.some((division) => relegationTargetFor(division) > 0)

  /* ------------------------------------------------------------- bulk edits */

  const bulkBusy = bulkAction !== null

  const selectedClubs = clubs.filter((club) => selectedSlugs.has(club.slug))
  const selectedCount = selectedClubs.length
  const toggleSelected = (slug: string, on: boolean) => {
    setSelectedSlugs((current) => {
      const next = new Set(current)
      if (on) next.add(slug)
      else next.delete(slug)
      return next
    })
  }
  const setGroupSelected = (groupClubs: Club[], on: boolean) => {
    setSelectedSlugs((current) => {
      const next = new Set(current)
      for (const club of groupClubs) {
        if (on) next.add(club.slug)
        else next.delete(club.slug)
      }
      return next
    })
  }
  const clearSelection = () => setSelectedSlugs(new Set())

  /**
   * What the bar has staged but not yet applied.
   *
   * Both fields can be set at once and are applied together by one press of
   * Update, so this is what the hint line states back to the admin before
   * anything is written.
   */
  const bulkHasPending = bulkLeague !== '' || bulkStatus !== ''

  const bulkPendingLabels = [
    bulkLeague !== '' &&
      `move to ${
        bulkLeague === 'unassigned'
          ? 'Unassigned'
          : (divisions.find((division) => String(division.id) === bulkLeague)?.name ?? 'a league')
      }`,
    bulkStatus !== '' && `status ${bulkStatus}`,
  ].filter((label): label is string => Boolean(label))

  /**
   * Run one action over the selection and report it as a single outcome.
   *
   * Deliberately not routed through `guard`: that raises a toast per failure,
   * which turns one bulk action into a wall of notifications and buries the
   * summary. Failures are collected and reported once, naming the clubs that
   * did not go through.
   */
  const runBulk = async (
    targets: Club[],
    action: (club: Club) => Promise<void>,
    describeDone: string,
    label: BulkAction,
  ) => {
    setBulkAction(label)
    const failed: string[] = []
    let done = 0
    try {
      for (const club of targets) {
        try {
          await action(club)
          done += 1
        } catch {
          failed.push(club.name)
        }
      }
      await refresh()
      if (failed.length === 0) {
        // Drop the selection once the work is done. The staged fields are
        // cleared with it, so a bar left showing a spent selection invites a
        // second press against rows the admin has already moved on from.
        report('ok', describeDone)
        clearSelection()
      } else if (done === 0) {
        report('error', `Could not ${describeDone.replace(/\.$/, '')}: ${failed.join(', ')}.`)
      } else {
        report(
          'error',
          `${done} of ${targets.length} clubs updated. Failed: ${failed.join(', ')}.`,
        )
      }
    } finally {
      setBulkAction(null)
    }
  }

  /**
   * Apply whatever is staged in the bar.
   *
   * League and status are staged rather than applied on selection: a dropdown
   * that fires the moment you touch it is one stray click away from moving a
   * dozen clubs, and there is no undo. Update is the deliberate press.
   *
   * Both fields are applied in one pass so a single toast covers the lot, and
   * the selection survives so the next field can be set on the same clubs.
   */
  const applyBulkEdits = async () => {
    if (bulkBusy || (!bulkLeague && !bulkStatus)) return
    const league = bulkLeague
    const status = bulkStatus
    const target = league === '' || league === 'unassigned' ? null : Number(league)
    const leagueName =
      league === ''
        ? ''
        : target === null
          ? 'unassigned'
          : (divisions.find((division) => division.id === target)?.name ?? 'the league')
    const changes = [leagueName && `league → ${leagueName}`, status && `status → ${status}`].filter(
      Boolean,
    )
    await runBulk(
      selectedClubs,
      async (club) => {
        if (status) await updateClub(club.slug, { status }).then(() => undefined)
        if (league !== '' && getDivisionId(club) !== (target === null ? '' : String(target))) {
          await assignDivision(club.slug, target)
        }
      },
      `Updated ${selectedCount} club${selectedCount === 1 ? '' : 's'} (${changes.join(', ')}).`,
      'update',
    )
    setBulkLeague('')
    setBulkStatus('')
  }


  const clubGroups = [
    ...divisions.map((division) => ({
      id: String(division.id),
      divisionId: division.id,
      name: division.name,
      movement: {
        promotion: promotionTargetFor(division),
        relegation: relegationTargetFor(division),
      },
      clubs: clubs
        .filter((club) => getDivisionId(club) === String(division.id))
        .sort((a, b) => {
          if (clubSort === 'name') {
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
          }
          const positionA = standingsByClub.get(a.id)?.position ?? Number.POSITIVE_INFINITY
          const positionB = standingsByClub.get(b.id)?.position ?? Number.POSITIVE_INFINITY
          if (positionA !== positionB) return positionA - positionB
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
        }),
    })),
    {
      id: 'unassigned',
      divisionId: null,
      name: 'Unassigned',
      movement: null,
      clubs: clubs
        .filter((club) => !configuredDivisionIds.has(getDivisionId(club)))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
        ),
    },
  ]

  return (
    <>
      <div className="club-subnav" role="tablist" aria-label="Club workspace">
        <button
          role="tab"
          aria-selected={section === 'clubs'}
          onClick={() => setSection('clubs')}
        >
          Current clubs <span>{clubs.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={section === 'divisions'}
          onClick={() => setSection('divisions')}
        >
          Divisions
        </button>
        <button
          role="tab"
          aria-selected={section === 'directory'}
          onClick={() => setSection('directory')}
        >
          All clubs (CRUD)
        </button>
      </div>
      {section === 'divisions' ? (
        <Divisions
          guard={guard}
          report={report}
          onDivisionsChanged={(nextDivisions) => setDivisions(nextDivisions)}
        />
      ) : section === 'directory' ? (
        <AllClubsDirectory
          guard={guard}
          report={report}
          divisions={divisions}
          onClubsChanged={refresh}
        />
      ) : (
        <>
          <SeasonManagement
            guard={guard}
            report={report}
            seasons={seasons}
            setSeasons={setSeasons}
            seasonId={seasonId}
            selectedSeason={selectedSeason}
            readOnly={readOnly}
            onSeasonChange={(nextSeasonId) => {
              if (!nextSeasonId || nextSeasonId === seasonId) return
              setEditing(null)
              setSquadSlug(null)
              setSeasonId(nextSeasonId)
            }}
            onCurrentSeasonChanged={(nextSeasonId) => {
              setEditing(null)
              setSquadSlug(null)
              setSeasonId(String(nextSeasonId))
            }}
            onCompleteSeason={() => setRolloverOpen(true)}
            lastRollover={lastRollover}
          />
          {readOnly && (
            <p className="season-readonly-banner" role="status">
              <strong>{selectedSeason?.name}</strong> is a closed season, so this list is read only.
              Clubs, leagues and squads below are exactly as that season finished. Switch to the
              current season to make changes.
            </p>
          )}
          <div className="club-league-groups">
            <div className="club-league-overview">
              <div>
                <h2>Clubs by league</h2>
                <p>
                  Clubs default to standings order. Click a row to edit the club or change its league.
                </p>
              </div>
              <div className="club-league-controls">
                <label className="club-sort-control">
                  <span>Order</span>
                  <CustomSelect
                    ariaLabel="Order clubs"
                    value={clubSort}
                    onChange={(value) => {
                      if (value === 'standings' || value === 'name') setClubSort(value)
                    }}
                    options={[
                      { value: 'standings', label: 'League standings' },
                      { value: 'name', label: 'Name' },
                    ]}
                  />
                </label>
                <span>{clubs.length} {clubs.length === 1 ? 'club' : 'clubs'}</span>
              </div>
            </div>
            {(hasPromotionZones || hasRelegationZones) && (
              <div className="club-zone-legend" aria-label="Promotion and relegation zone key">
                {hasPromotionZones && (
                  <span className="club-zone-key promotion">Promotion</span>
                )}
                {hasRelegationZones && (
                  <span className="club-zone-key relegation">Relegation</span>
                )}
                <span>
                  Colours show who is in the movement zone on the current table. Nothing moves until
                  the season is completed, and then it happens automatically.
                </span>
              </div>
            )}
            {clubGroups.map((group) => {
              const groupAllSelected =
                group.clubs.length > 0 && group.clubs.every((club) => selectedSlugs.has(club.slug))
              const groupSomeSelected =
                !groupAllSelected && group.clubs.some((club) => selectedSlugs.has(club.slug))
              return (
                <section className="card club-league-group" key={group.id}>
                <header>
                  <div className="club-league-heading">
                    {group.clubs.length > 0 && (
                      <label className="club-group-select">
                        <input
                          type="checkbox"
                          checked={groupAllSelected}
                          ref={(node) => {
                            if (node) node.indeterminate = groupSomeSelected
                          }}
                          disabled={readOnly}
                          aria-label={`Select all clubs in ${group.name}`}
                          onChange={(event) => setGroupSelected(group.clubs, event.target.checked)}
                        />
                        <span className="visually-hidden">Select all in {group.name}</span>
                      </label>
                    )}
                    <h2>{group.name}</h2>
                    <span className="club-league-count">{group.clubs.length}</span>
                  </div>
                  <div className="club-league-meta">
                    <span className="hint">{group.clubs.length === 1 ? 'club' : 'clubs'}</span>
                    {group.movement && group.movement.promotion > 0 && (
                      <span className="club-movement-progress">
                        Top {group.movement.promotion} promoted
                      </span>
                    )}
                    {group.movement && group.movement.relegation > 0 && (
                      <span className="club-movement-progress">
                        Bottom {group.movement.relegation} relegated
                      </span>
                    )}
                  </div>
                </header>
                {group.clubs.length === 0 ? (
                  <p className="club-league-empty">
                    {group.id === 'unassigned'
                      ? 'All clubs have been assigned to a league.'
                      : 'No clubs have been assigned to this league yet.'}
                  </p>
                ) : (
                  <table className="club-management-table">
                    <thead>
                      <tr>
                        <th className="club-select-col"><span className="visually-hidden">Select</span></th>
                        <th>Club</th>
                        <th>Code</th>
                        <th>Status</th>
                        <th>Squad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.clubs.map((c) => {
                        const movement = clubZone(c)
                        const zoneLabels = [
                          movement.promotion ? 'Promotion zone' : '',
                          movement.relegation ? 'Relegation zone' : '',
                        ].filter(Boolean)
                        const zoneClass = movement.promotion
                          ? ' promotion-zone'
                          : movement.relegation
                            ? ' relegation-zone'
                            : ''
                        return (
                          <tr
                            key={c.slug}
                            className={`club-row${zoneClass}${selectedSlugs.has(c.slug) ? ' selected' : ''}`}
                            tabIndex={0}
                            aria-label={`Edit ${c.name}${zoneLabels.length ? `. ${zoneLabels.join(' and ')}.` : ''} Press Enter to open.`}
                            onClick={() => {
                              if (readOnly) return
                              edit(c)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                if (readOnly) return
                                edit(c)
                              }
                            }}
                          >
                            <td
                              className="club-select-cell"
                              onClick={(event) => {
                                // The whole cell toggles, not just the 16px
                                // box: reaching for a checkbox that sits in a
                                // corner of a 60px row is how selections get
                                // missed. The input stops propagation so
                                // clicking it directly does not double-fire.
                                event.stopPropagation()
                                if (readOnly) return
                                toggleSelected(c.slug, !selectedSlugs.has(c.slug))
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedSlugs.has(c.slug)}
                                disabled={readOnly}
                                aria-label={`Select ${c.name}`}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => toggleSelected(c.slug, event.target.checked)}
                              />
                            </td>
                            <td>
                              <div className="club">
                                {c.logo_local && <img src={c.logo_local} alt="" />}
                                {c.flag && <span className="flag">{c.flag}</span>}
                                <span className="name">{c.name}</span>
                              </div>
                            </td>
                            <td>
                              <span className="hint">{c.short_code || '—'}</span>
                            </td>
                            <td>
                              <span>{c.status}</span>
                            </td>
                            <td>
                              <button
                                className="squad-link"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void viewSquad(c)
                                }}
                              >
                                View Squad <span className="squad-count">{c.players}</span>
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                </section>
              )
            })}
          </div>

          {bulkBarVisible && (
            <div className="bulk-bar" role="region" aria-label="Bulk actions">
              <div className="bulk-bar-count">
                <strong>{selectedCount}</strong>
                <span>selected</span>
              </div>
              <div className="bulk-bar-actions">
                <label className="bulk-bar-field">
                  <span>Move to league</span>
                  <CustomSelect
                    ariaLabel="Bulk move clubs to league"
                    value={bulkLeague}
                    disabled={bulkBusy}
                    options={[
                      { value: '', label: 'No change' },
                      ...assignableDivisions.map((division) => ({
                        value: String(division.id),
                        label: division.name,
                      })),
                      { value: 'unassigned', label: 'Unassigned' },
                    ]}
                    onChange={setBulkLeague}
                  />
                </label>
                <label className="bulk-bar-field">
                  <span>Set status</span>
                  <CustomSelect
                    ariaLabel="Bulk set club status"
                    value={bulkStatus}
                    disabled={bulkBusy}
                    options={[
                      { value: '', label: 'No change' },
                      { value: 'active', label: 'Active' },
                      { value: 'pending', label: 'Pending' },
                      { value: 'withdrawn', label: 'Withdrawn' },
                    ]}
                    onChange={setBulkStatus}
                  />
                </label>
                <button
                  className="btn primary sm bulk-bar-update"
                  type="button"
                  disabled={bulkBusy || !bulkHasPending}
                  aria-busy={bulkAction === 'update'}
                  onClick={() => void applyBulkEdits()}
                >
                  {bulkAction === 'update' ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      Updating…
                    </>
                  ) : (
                    'Update'
                  )}
                </button>
              </div>
              <p className="bulk-bar-hint" role="status">
                {bulkHasPending
                  ? `Update will apply to ${selectedCount} club${selectedCount === 1 ? '' : 's'}: ${bulkPendingLabels.join(', ')}.`
                  : 'Pick a league or status above, then press Update.'}
              </p>
              <button
                className="bulk-bar-clear"
                type="button"
                disabled={bulkBusy}
                onClick={clearSelection}
              >
                Clear selection
              </button>
            </div>
          )}

          <p className="footnote">
            Short codes are <strong>not unique</strong>: the crawl assigns <code>KKV</code> to both
            KITA KITA VFC and KOEMPOEL KEBOW VFC, so the schema deliberately does not constrain them.
            Gamertags are matched case-insensitively — registering a name that already exists is
            rejected rather than creating a duplicate player.
          </p>
          <SeasonRollover
            open={rolloverOpen}
            onClose={() => setRolloverOpen(false)}
            onCompleted={(newSeasonId) => {
              guard(getAdminSeasons, 'Could not reload seasons')
                .then(setSeasons)
                .catch(() => undefined)
              setSeasonId(String(newSeasonId))
              clearSelection()
              refresh().catch(() => undefined)
            }}
            onUndone={(restoredId) => {
              guard(getAdminSeasons, 'Could not reload seasons')
                .then(setSeasons)
                .catch(() => undefined)
              setSeasonId(String(restoredId))
              setRolloverOpen(false)
              refresh().catch(() => undefined)
            }}
            guard={guard}
            report={report}
          />
          {activeClub && (
            <div
              className="squad-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) cancelEdit(activeClub)
              }}
            >
              <form
                className="squad-modal club-edit-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="club-edit-title"
                onSubmit={(event) => {
                  event.preventDefault()
                  void save(activeClub)
                }}
              >
            <header>
              <div className="club-edit-heading">
                {(logos[activeClub.slug] ?? activeClub.logo_local) && (
                  <img src={logos[activeClub.slug] ?? activeClub.logo_local ?? ''} alt="" />
                )}
                <div>
                  <p className="eyebrow">CLUB MANAGEMENT</p>
                  <h2 id="club-edit-title">Edit {activeClub.name}</h2>
                  <p className="club-edit-subtitle">Update details, logo, and manage the squad.</p>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close editor"
                onClick={() => cancelEdit(activeClub)}
              >
                ×
              </button>
            </header>
            <div className="club-edit-content">
              <div className="club-crud-logo-row">
                <div className="club-crud-logo-preview">
                  {logos[activeClub.slug] ? (
                    <img src={logos[activeClub.slug] ?? ''} alt={`${activeClub.name} crest`} />
                  ) : (
                    <span>
                      {(codes[activeClub.slug] || names[activeClub.slug] || activeClub.name)
                        .slice(0, 3)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="club-crud-logo-controls">
                  <span className="club-crud-logo-title">Club crest / logo</span>
                  <div className="club-crud-logo-buttons">
                    <label className="btn sm">
                      Upload logo
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          if (file) {
                            compressUploadedClubLogo(file)
                              .then((dataUrl) => {
                                setLogos((current) => ({
                                  ...current,
                                  [activeClub.slug]: dataUrl,
                                }))
                                report('info', `Loaded logo "${file.name}". Click Save changes to publish.`)
                              })
                              .catch((err) => {
                                report('error', err instanceof Error ? err.message : 'Could not read logo')
                              })
                          }
                          event.target.value = ''
                        }}
                      />
                    </label>
                    {logos[activeClub.slug] && (
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() =>
                          setLogos((current) => ({
                            ...current,
                            [activeClub.slug]: null,
                          }))
                        }
                      >
                        Remove logo
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="club-edit-fields">
                <label>
                  <span>Club name</span>
                  <input
                    className="text"
                    maxLength={120}
                    required
                    aria-label={`Club name for ${activeClub.name}`}
                    value={names[activeClub.slug] ?? activeClub.name}
                    onChange={(event) =>
                      setNames((current) => ({
                        ...current,
                        [activeClub.slug]: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Short code</span>
                  <input
                    className="text"
                    maxLength={8}
                    aria-label={`Short code for ${activeClub.name}`}
                    value={codes[activeClub.slug] ?? ''}
                    onChange={(event) =>
                      setCodes((current) => ({
                        ...current,
                        [activeClub.slug]: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Region / flag</span>
                  <CustomSelect
                    ariaLabel={`Region for ${activeClub.name}`}
                    value={flags[activeClub.slug] ?? ''}
                    onChange={(value) =>
                      setFlags((current) => ({
                        ...current,
                        [activeClub.slug]: value,
                      }))
                    }
                    options={CLUB_REGION_OPTIONS}
                  />
                </label>
                <label>
                  <span>Status</span>
                  <CustomSelect
                    ariaLabel={`Status for ${activeClub.name}`}
                    value={statuses[activeClub.slug] ?? activeClub.status}
                    onChange={(value) =>
                      setStatuses((current) => ({
                        ...current,
                        [activeClub.slug]: value,
                      }))
                    }
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'pending', label: 'Pending' },
                      { value: 'withdrawn', label: 'Withdrawn' },
                    ]}
                  />
                </label>
              </div>
              {(() => {
                const inactive = statuses[activeClub.slug] !== 'active'
                const clubDivision = divisions.find((item) => item.id === activeClub.division_id)
                return (
                  <>
                    <section className="club-edit-section" aria-labelledby="club-league-title">
                      <div className="club-edit-section-heading">
                        <h3 id="club-league-title">League</h3>
                        <p>
                          Put the club in any league you like. This is a plain correction and never
                          promotes or relegates anyone: where a club finishes the season is decided
                          by its position on the table when the season is completed.
                        </p>
                      </div>
                      <div className="club-edit-fields">
                        <label>
                          <span>League</span>
                          <CustomSelect
                            ariaLabel={`League for ${activeClub.name}`}
                            value={divisionOf[activeClub.slug] ?? ''}
                            disabled={inactive}
                            onChange={(value) =>
                              setDivisionOf((current) => ({
                                ...current,
                                [activeClub.slug]: value,
                              }))
                            }
                            options={[
                              { value: '', label: 'Unassigned' },
                              ...assignableDivisions.map((division) => ({
                                value: String(division.id),
                                label: division.name,
                              })),
                            ]}
                          />
                        </label>
                      </div>
                      <p className="club-edit-current">
                        Currently in <strong>{clubDivision?.name ?? 'no league'}</strong>. Saving
                        sends the club straight to whatever is picked above.
                      </p>
                    </section>
                  </>
                )
              })()}
              <section className="club-edit-roster" aria-labelledby="add-player-title">
                <div>
                  <h3 id="add-player-title">Add a player</h3>
                  <p>{activeClub.players} {activeClub.players === 1 ? 'player' : 'players'} signed</p>
                </div>
                <div className="club-edit-add">
                  <input
                    className="text"
                    placeholder="Enter gamertag"
                    aria-label={`Add a player to ${activeClub.name}`}
                    value={newPlayer[activeClub.slug] ?? ''}
                    onChange={(event) =>
                      setNewPlayer((current) => ({
                        ...current,
                        [activeClub.slug]: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={busy === activeClub.slug}
                    onClick={() => void add(activeClub)}
                  >
                    Add player
                  </button>
                </div>
              </section>
            </div>
            <footer className="club-edit-footer">
              <button
                type="button"
                className="btn"
                disabled={busy === activeClub.slug}
                onClick={() => cancelEdit(activeClub)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy === activeClub.slug}>
                {busy === activeClub.slug ? 'Saving…' : 'Save changes'}
              </button>
            </footer>
          </form>
        </div>
      )}
      {squadSlug && (
        <div
          className="squad-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSquadSlug(null)
          }}
        >
          <section
            className="squad-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="squad-modal-title"
          >
            <header>
              <div>
                <p className="eyebrow">CLUB SQUAD</p>
                <h2 id="squad-modal-title">
                  {clubs.find((c) => c.slug === squadSlug)?.name ?? 'Squad'}
                </h2>
              </div>
              <button
                className="icon-btn"
                aria-label="Close squad"
                onClick={() => setSquadSlug(null)}
              >
                ×
              </button>
            </header>
            {squadLoading ? (
              <p className="squad-modal-message">Loading squad…</p>
            ) : squadError ? (
              <p className="squad-modal-message error">{squadError}</p>
            ) : players[squadSlug]?.length ? (
              <div className="squad-list">
                {players[squadSlug].map((gamertag) => (
                  <div className="squad-player" key={gamertag}>
                    <span>{gamertag}</span>
                    <button
                      className="btn sm danger"
                      disabled={busy === squadSlug}
                      onClick={() => {
                        const club = clubs.find((c) => c.slug === squadSlug)
                        if (club) void drop(club, gamertag)
                      }}
                    >
                      Release
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="squad-modal-message">No players signed to this club yet.</p>
            )}
          </section>
        </div>
      )}
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------- homepage settings */

const FORMAT_STATUS_OPTIONS: Array<{ value: FormatStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'coming_soon', label: 'Coming Soon' },
  { value: 'inactive', label: 'Inactive' },
]

const REGION_PRESETS: Array<{ iso: string; name: string; flag: string; defaultArt: string }> = [
  { iso: 'SG', name: 'Singapore', flag: '🇸🇬', defaultArt: '/assets/hero/sg-hero.webp' },
  { iso: 'MY', name: 'Malaysia', flag: '🇲🇾', defaultArt: '/assets/hero/my-hero.webp' },
  { iso: 'ID', name: 'Indonesia', flag: '🇮🇩', defaultArt: '/assets/hero/in-hero.webp' },
  { iso: 'TH', name: 'Thailand', flag: '🇹🇭', defaultArt: '/assets/hero/sg-hero.webp' },
  { iso: 'BN', name: 'Brunei', flag: '🇧🇳', defaultArt: '/assets/hero/my-hero.webp' },
  { iso: 'PH', name: 'Philippines', flag: '🇵🇭', defaultArt: '/assets/hero/in-hero.webp' },
  { iso: 'VN', name: 'Vietnam', flag: '🇻🇳', defaultArt: '/assets/hero/sg-hero.webp' },
]

function clubMatchesRegionAdmin(club: Club, region: Pick<HomepageRegion, 'flag' | 'iso' | 'name'>): boolean {
  const raw = (club.flag ?? '').trim()
  if (!raw) return false
  if (raw === region.flag) return true
  const upper = raw.toUpperCase()
  if (upper === region.iso.toUpperCase()) return true
  if (raw.toLowerCase() === region.name.toLowerCase()) return true
  const preset = REGION_PRESETS.find((p) => p.iso === region.iso.toUpperCase())
  if (preset && raw === preset.flag) return true
  return false
}

function clubThreeCode(club: Club): string {
  const explicit = (club.short_code ?? '').trim().toUpperCase()
  if (explicit) return explicit.slice(0, 3)
  return club.name
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)
}

async function compressUploadedFlagImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read uploaded image file'))
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        reject(new Error('Empty image file'))
        return
      }
      const img = new Image()
      img.onerror = () => resolve(dataUrl)
      img.onload = () => {
        try {
          const maxWidth = 1920
          const maxHeight = 1080
          let width = img.naturalWidth || img.width
          let height = img.naturalHeight || img.height
          if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height)
            width = Math.round(width * scale)
            height = Math.round(height * scale)
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(dataUrl)
            return
          }
          ctx.drawImage(img, 0, 0, width, height)
          const webp = canvas.toDataURL('image/webp', 0.86)
          resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.86))
        } catch {
          resolve(dataUrl)
        }
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

function HomepageSettings({
  guard,
  report,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
}) {
  const [subview, setSubview] = useState<'flags' | 'formats' | 'clubs'>(() => {
    const saved = window.localStorage.getItem('iwvpl-admin-homepage-subview')
    if (saved === 'flags' || saved === 'formats' || saved === 'clubs') return saved
    return 'flags'
  })
  const [formats, setFormats] = useState<CompetitionFormat[] | null>(null)
  const [clubs, setClubs] = useState<Club[] | null>(null)
  const [regions, setRegions] = useState<HomepageRegion[] | null>(null)

  useEffect(() => {
    window.localStorage.setItem('iwvpl-admin-homepage-subview', subview)
  }, [subview])

  const [editingFormat, setEditingFormat] = useState<number | 'new' | null>(null)
  const [formatName, setFormatName] = useState('')
  const [formatTag, setFormatTag] = useState('')
  const [formatDesc, setFormatDesc] = useState('')
  const [formatStatusInput, setFormatStatusInput] = useState<FormatStatus>('active')
  const [formatBusy, setFormatBusy] = useState(false)
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null)

  // Horizontal Flag Rail state
  const [editingRegion, setEditingRegion] = useState<number | 'new' | null>(null)
  const [regionPreset, setRegionPreset] = useState('SG')
  const [regionIso, setRegionIso] = useState('SG')
  const [regionName, setRegionName] = useState('Singapore')
  const [regionFlag, setRegionFlag] = useState('🇸🇬')
  const [regionArtUrl, setRegionArtUrl] = useState('/assets/hero/sg-hero.webp')
  const [regionIsActive, setRegionIsActive] = useState(true)
  const [regionBusy, setRegionBusy] = useState(false)
  const [regionReordering, setRegionReordering] = useState(false)
  const [regionTogglingId, setRegionTogglingId] = useState<number | null>(null)
  const [regionDeletingId, setRegionDeletingId] = useState<number | null>(null)
  const [previewActiveIdx, setPreviewActiveIdx] = useState(0)
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const previewTrackRef = useRef<HTMLDivElement>(null)

  const [featuredSlugs, setFeaturedSlugs] = useState<Set<string>>(new Set())
  const [savedFeaturedSlugs, setSavedFeaturedSlugs] = useState<Set<string>>(new Set())
  const [clubSearch, setClubSearch] = useState('')
  const [featuredBusy, setFeaturedBusy] = useState(false)
  const [assigningClubSlug, setAssigningClubSlug] = useState<string | null>(null)

  useEffect(() => {
    guard(getFormats, 'Could not load competition formats')
      .then(setFormats)
      .catch(() => setFormats([]))

    guard(getAdminRegions, 'Could not load homepage flag regions')
      .then(setRegions)
      .catch(() => setRegions([]))

    guard(() => getClubs(), 'Could not load clubs for homepage feature')
      .then((allClubs) => {
        setClubs(allClubs)
        const initial = new Set(
          allClubs
            .filter((c) => (c.is_featured === undefined ? true : Boolean(c.is_featured)))
            .map((c) => c.slug),
        )
        setFeaturedSlugs(initial)
        setSavedFeaturedSlugs(new Set(initial))
      })
      .catch(() => setClubs([]))
  }, [guard])

  useEffect(() => {
    if (!previewExpanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [previewExpanded])

  const openRegionEditor = (region: HomepageRegion | null) => {
    if (region) {
      const matchedPreset = REGION_PRESETS.find((p) => p.iso === region.iso.toUpperCase())
      setEditingRegion(region.id)
      setRegionPreset(matchedPreset ? matchedPreset.iso : 'CUSTOM')
      setRegionIso(region.iso)
      setRegionName(region.name)
      setRegionFlag(region.flag)
      setRegionArtUrl(region.art_url)
      setRegionIsActive(Boolean(region.is_active))
    } else {
      const defaultPreset =
        REGION_PRESETS.find(
          (preset) => !(regions ?? []).some((existing) => existing.iso.toUpperCase() === preset.iso),
        ) ?? REGION_PRESETS[0]
      setEditingRegion('new')
      setRegionPreset(defaultPreset.iso)
      setRegionIso(defaultPreset.iso)
      setRegionName(defaultPreset.name)
      setRegionFlag(defaultPreset.flag)
      setRegionArtUrl(defaultPreset.defaultArt)
      setRegionIsActive(true)
    }
  }

  const applyRegionPreset = (value: string) => {
    setRegionPreset(value)
    const preset = REGION_PRESETS.find((p) => p.iso === value)
    if (preset) {
      setRegionIso(preset.iso)
      setRegionName(preset.name)
      setRegionFlag(preset.flag)
      if (!regionArtUrl || regionArtUrl.startsWith('/assets/hero/')) {
        setRegionArtUrl(preset.defaultArt)
      }
    }
  }

  const handleFlagFileUpload = async (file: File | null) => {
    if (!file) return
    try {
      const compressed = await compressUploadedFlagImage(file)
      setRegionArtUrl(compressed)
      report('info', `Loaded "${file.name}" into the flag preview. Click Save to publish.`)
    } catch (err) {
      report('error', err instanceof Error ? err.message : 'Could not read image file')
    }
  }

  const saveRegion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editingRegion === null) return
    const target = editingRegion
    const trimmedIso = regionIso.trim().toUpperCase()
    const trimmedName = regionName.trim()
    const trimmedFlag = regionFlag.trim()
    const trimmedArt = regionArtUrl.trim()
    if (!trimmedIso || !trimmedName || !trimmedFlag || !trimmedArt) {
      report('error', 'Region code, name, flag emoji, and flag image are required.')
      return
    }
    setRegionBusy(true)
    try {
      const payload = {
        iso: trimmedIso,
        name: trimmedName,
        flag: trimmedFlag,
        artUrl: trimmedArt,
        art_url: trimmedArt,
        isActive: regionIsActive,
        is_active: regionIsActive,
      }
      const saved = await guard(
        () => (target === 'new' ? createAdminRegion(payload) : updateAdminRegion(target, payload)),
        target === 'new' ? 'Could not add region flag panel' : 'Could not update region flag panel',
      )
      setRegions((current) => {
        const list = current ?? []
        const next =
          target === 'new'
            ? [...list, saved]
            : list.map((item) => (item.id === saved.id ? saved : item))
        return next.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      })
      setEditingRegion(null)
      report('ok', `${saved.flag} ${saved.name} panel saved.`)
    } catch {
      /* already reported */
    } finally {
      setRegionBusy(false)
    }
  }

  const toggleRegionActive = async (region: HomepageRegion) => {
    if (regionTogglingId !== null) return
    const nextActive = !Boolean(region.is_active)
    setRegionTogglingId(region.id)
    try {
      const updated = await guard(
        () => updateAdminRegion(region.id, { is_active: nextActive }),
        `Could not update ${region.name}`,
      )
      setRegions((current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      )
      report('ok', `${region.name} is now ${nextActive ? 'visible' : 'hidden'} on the homepage.`)
    } catch {
      /* already reported */
    } finally {
      setRegionTogglingId(null)
    }
  }

  const moveRegion = async (index: number, direction: -1 | 1) => {
    if (!regions) return
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= regions.length || regionReordering || editingRegion !== null) {
      return
    }
    const reordered = [...regions]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(nextIndex, 0, moved)
    setRegionReordering(true)
    try {
      await guard(
        () => updateAdminRegionOrder(reordered.map((r) => r.id)),
        'Could not reorder region flag panels',
      )
      setRegions(reordered.map((r, sort_order) => ({ ...r, sort_order })))
      report('ok', 'Flag rail order updated.')
    } catch {
      /* already reported */
    } finally {
      setRegionReordering(false)
    }
  }

  const removeRegionItem = async (region: HomepageRegion) => {
    if (
      regionDeletingId !== null ||
      !window.confirm(`Remove the "${region.flag} ${region.name}" panel from the homepage flag rail?`)
    ) {
      return
    }
    setRegionDeletingId(region.id)
    try {
      await guard(() => deleteAdminRegion(region.id), `Could not remove ${region.name}`)
      setRegions((current) => (current ?? []).filter((item) => item.id !== region.id))
      if (editingRegion === region.id) setEditingRegion(null)
      report('ok', `${region.name} panel removed.`)
    } catch {
      /* already reported */
    } finally {
      setRegionDeletingId(null)
    }
  }

  const quickAssignClubRegion = async (club: Club, nextFlag: string) => {
    if (assigningClubSlug !== null) return
    setAssigningClubSlug(club.slug)
    try {
      const normalized = nextFlag.trim() || null
      await guard(
        () => updateClub(club.slug, { flag: normalized }),
        `Could not update region for ${club.name}`,
      )
      setClubs((current) =>
        (current ?? []).map((c) => (c.slug === club.slug ? { ...c, flag: normalized } : c)),
      )
      report('ok', `${club.name} assigned to ${normalized ?? 'Unassigned'}.`)
    } catch {
      /* already reported */
    } finally {
      setAssigningClubSlug(null)
    }
  }

  const openFormatEditor = (format: CompetitionFormat | null) => {
    setEditingFormat(format?.id ?? 'new')
    setFormatName(format?.name ?? '')
    setFormatTag(format?.tag ?? '')
    setFormatDesc(format?.description ?? '')
    setFormatStatusInput(format?.status ?? 'active')
  }

  const saveFormat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editingFormat === null) return
    const target = editingFormat
    const trimmedName = formatName.trim()
    if (!trimmedName) {
      report('error', 'Enter a format name.')
      return
    }
    setFormatBusy(true)
    try {
      const payload = {
        name: trimmedName,
        tag: formatTag.trim(),
        description: formatDesc.trim(),
        status: formatStatusInput,
      }
      const saved = await guard(
        () => (target === 'new' ? createFormat(payload) : updateFormat(target, payload)),
        target === 'new' ? 'Could not add competition format' : 'Could not update competition format',
      )
      setFormats((current) => {
        const list = current ?? []
        const next =
          target === 'new'
            ? [...list, saved]
            : list.map((item) => (item.id === saved.id ? saved : item))
        return next.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      })
      setEditingFormat(null)
      report('ok', `${saved.name} saved.`)
    } catch {
      /* already reported */
    } finally {
      setFormatBusy(false)
    }
  }

  const changeFormatStatus = async (format: CompetitionFormat, nextStatus: FormatStatus) => {
    if (format.status === nextStatus || statusBusyId !== null) return
    setStatusBusyId(format.id)
    try {
      const updated = await guard(
        () => setFormatStatus(format.id, nextStatus),
        `Could not update status for ${format.name}`,
      )
      setFormats((current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      )
      const statusLabel =
        nextStatus === 'active'
          ? 'Active'
          : nextStatus === 'coming_soon'
            ? 'Coming Soon'
            : 'Inactive'
      report('ok', `${format.name} set to ${statusLabel}.`)
    } catch {
      /* already reported */
    } finally {
      setStatusBusyId(null)
    }
  }

  const removeFormatItem = async (format: CompetitionFormat) => {
    if (deleteBusyId !== null) return
    setDeleteBusyId(format.id)
    try {
      await guard(() => deleteFormat(format.id), `Could not remove ${format.name}`)
      setFormats((current) => (current ?? []).filter((item) => item.id !== format.id))
      if (editingFormat === format.id) setEditingFormat(null)
      report('ok', `${format.name} removed.`)
    } catch {
      /* already reported */
    } finally {
      setDeleteBusyId(null)
    }
  }

  const toggleClubFeatured = (slug: string, checked: boolean) => {
    setFeaturedSlugs((current) => {
      const next = new Set(current)
      if (checked) next.add(slug)
      else next.delete(slug)
      return next
    })
  }

  const filteredClubs = (clubs ?? []).filter((club) => {
    const q = clubSearch.trim().toLowerCase()
    if (!q) return true
    return (
      club.name.toLowerCase().includes(q) ||
      (club.short_code ?? '').toLowerCase().includes(q) ||
      club.slug.toLowerCase().includes(q)
    )
  })

  const selectAllFilteredClubs = () => {
    setFeaturedSlugs((current) => {
      const next = new Set(current)
      for (const club of filteredClubs) next.add(club.slug)
      return next
    })
  }

  const deselectAllFilteredClubs = () => {
    setFeaturedSlugs((current) => {
      const next = new Set(current)
      for (const club of filteredClubs) next.delete(club.slug)
      return next
    })
  }

  const featuredDirty =
    featuredSlugs.size !== savedFeaturedSlugs.size ||
    [...featuredSlugs].some((slug) => !savedFeaturedSlugs.has(slug))

  const saveFeaturedClubsSelection = async () => {
    if (featuredBusy) return
    setFeaturedBusy(true)
    try {
      const slugs = [...featuredSlugs]
      await guard(
        () => setFeaturedClubs(slugs),
        'Could not update featured clubs on homepage',
      )
      setSavedFeaturedSlugs(new Set(slugs))
      setClubs((current) =>
        (current ?? []).map((club) => ({
          ...club,
          is_featured: featuredSlugs.has(club.slug),
        })),
      )
      report(
        'ok',
        `Homepage featured clubs updated (${slugs.length} ${slugs.length === 1 ? 'club' : 'clubs'} selected).`,
      )
    } catch {
      /* already reported */
    } finally {
      setFeaturedBusy(false)
    }
  }

  // Build live preview panels: if the admin is currently editing a panel, reflect their live draft immediately in the 1:1 preview!
  const previewRegions: HomepageRegion[] = (() => {
    const base = (regions ?? []).map((r) =>
      editingRegion === r.id
        ? {
            ...r,
            iso: regionIso.trim().toUpperCase() || r.iso,
            name: regionName.trim() || r.name,
            flag: regionFlag.trim() || r.flag,
            art_url: regionArtUrl.trim() || r.art_url,
            is_active: regionIsActive,
          }
        : r,
    )
    if (editingRegion === 'new') {
      base.push({
        id: -1,
        iso: regionIso.trim().toUpperCase() || 'NEW',
        name: regionName.trim() || 'New Region',
        flag: regionFlag.trim() || '🏳️',
        art_url: regionArtUrl.trim() || '/assets/hero/sg-hero.webp',
        is_active: regionIsActive,
        sort_order: base.length,
      })
    }
    return base.filter((r) => Boolean(r.is_active))
  })()

  const activeClubs = (clubs ?? []).filter((c) => c.status === 'active')

  const scrollPreviewToPanel = (idx: number) => {
    setPreviewActiveIdx(idx)
    const track = previewTrackRef.current
    if (!track) return
    const panel = track.children[idx] as HTMLElement | undefined
    if (panel) {
      track.scrollTo({ left: panel.offsetLeft, behavior: 'smooth' })
    }
  }

  const renderOneToOneRailPreview = (isFullscreen: boolean) => (
    <div className={`rail-preview-shell${isFullscreen ? ' is-fullscreen' : ''}`}>
      <div className="rail-preview-toolbar">
        <div className="rail-preview-tabs" role="tablist" aria-label="Preview region panels">
          {previewRegions.map((r, idx) => {
            const assignedCount = activeClubs.filter((c) => clubMatchesRegionAdmin(c, r)).length
            return (
              <button
                key={`${r.id}-${r.iso}`}
                type="button"
                role="tab"
                aria-selected={previewActiveIdx === idx}
                className={`rail-preview-tab${previewActiveIdx === idx ? ' is-active' : ''}`}
                onClick={() => scrollPreviewToPanel(idx)}
              >
                <span className="rail-preview-tab-num">{String(idx + 1).padStart(2, '0')}</span>
                <span>{r.flag}</span>
                <span>{r.name}</span>
                <span className="rail-preview-tab-count">{assignedCount}</span>
              </button>
            )
          })}
        </div>
        <div className="rail-preview-actions">
          <span className="rail-preview-badge">1:1 Main Web Preview</span>
          <button
            type="button"
            className="btn sm"
            onClick={() => setPreviewExpanded((prev) => !prev)}
          >
            {isFullscreen ? 'Close full preview' : 'Expand 1:1 full screen'}
          </button>
        </div>
      </div>

      {previewRegions.length === 0 ? (
        <div className="empty">No active region flag panels to preview.</div>
      ) : (
        <div
          className="rail-preview-viewport"
          ref={isFullscreen ? undefined : previewTrackRef}
          onScroll={(event) => {
            const el = event.currentTarget
            if (el.clientWidth > 0) {
              const idx = Math.round(el.scrollLeft / el.clientWidth)
              if (idx !== previewActiveIdx && idx >= 0 && idx < previewRegions.length) {
                setPreviewActiveIdx(idx)
              }
            }
          }}
        >
          {previewRegions.map((r, idx) => {
            const regionClubs = activeClubs
              .filter((c) => clubMatchesRegionAdmin(c, r))
              .sort((a, b) => a.name.localeCompare(b.name))
            return (
              <article
                key={`${r.id}-${r.iso}`}
                className={`rail__panel rail__panel--${r.iso.toLowerCase()}`}
              >
                <div className="rail__art" aria-hidden="true">
                  <img className="rail__art-img" src={r.art_url} alt="" />
                </div>
                <div className="rail__scrim" aria-hidden="true" />
                <div className="rail__body">
                  <span className="rail__index">0{idx + 1}</span>
                  <p className="rail__flag" aria-hidden="true">
                    {r.flag}
                  </p>
                  <h3 className="rail__name">{r.name}</h3>
                  <p className="rail__meta">
                    {regionClubs.length} {regionClubs.length === 1 ? 'club' : 'clubs'} registered in{' '}
                    {r.name}
                  </p>
                  <ul className="rail__clubs" aria-label={`${r.name} clubs`}>
                    {regionClubs.map((c) => (
                      <li key={c.slug} className="rail__chip" title={c.name}>
                        {c.logo_local ? (
                          <img src={c.logo_local} alt={c.name} loading="lazy" />
                        ) : (
                          <span className="rail__chip-fallback">{clubThreeCode(c)}</span>
                        )}
                        <span className="rail__chip-code">{clubThreeCode(c)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )

  const regionForm = (
    <form className="division-editor region-editor" onSubmit={(event) => void saveRegion(event)}>
      <div className="homepage-format-fields region-editor-grid">
        <label>
          <span>Preset region</span>
          <CustomSelect
            ariaLabel="Preset region"
            value={regionPreset}
            options={[
              ...REGION_PRESETS.map((p) => ({
                value: p.iso,
                label: `${p.flag} ${p.name} (${p.iso})`,
              })),
              { value: 'CUSTOM', label: 'Custom region…' },
            ]}
            onChange={applyRegionPreset}
          />
        </label>
        <label>
          <span>ISO code</span>
          <input
            className="text"
            placeholder="e.g. SG"
            value={regionIso}
            onChange={(event) => {
              setRegionIso(event.target.value.toUpperCase())
              setRegionPreset('CUSTOM')
            }}
            maxLength={8}
            required
          />
        </label>
        <label>
          <span>Country / region name</span>
          <input
            className="text"
            placeholder="e.g. Singapore"
            value={regionName}
            onChange={(event) => {
              setRegionName(event.target.value)
              setRegionPreset('CUSTOM')
            }}
            maxLength={64}
            required
          />
        </label>
        <label>
          <span>Flag icon / emoji</span>
          <input
            className="text"
            placeholder="e.g. 🇸🇬"
            value={regionFlag}
            onChange={(event) => {
              setRegionFlag(event.target.value)
              setRegionPreset('CUSTOM')
            }}
            maxLength={16}
            required
          />
        </label>
      </div>

      <div className="region-upload-row">
        <div className="region-upload-controls">
          <label>
            <span>Upload flag background artwork</span>
            <div className="region-upload-input-group">
              <label className="btn sm region-upload-btn">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleFlagFileUpload(event.target.files?.[0] ?? null)}
                />
                Upload flag image…
              </label>
              <input
                className="text"
                placeholder="Or paste image URL / path (e.g. /assets/hero/sg-hero.webp)"
                value={regionArtUrl.startsWith('data:') ? 'Uploaded custom flag image' : regionArtUrl}
                readOnly={regionArtUrl.startsWith('data:')}
                onChange={(event) => setRegionArtUrl(event.target.value)}
              />
              {regionArtUrl.startsWith('data:') && (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    const preset = REGION_PRESETS.find((p) => p.iso === regionIso.toUpperCase())
                    setRegionArtUrl(preset?.defaultArt ?? '/assets/hero/sg-hero.webp')
                  }}
                >
                  Reset to default art
                </button>
              )}
            </div>
          </label>
          <p className="hint">
            Recommended: wide landscape flag artwork (1920×1080 WebP/JPG/PNG). Changes appear immediately in the 1:1 preview below.
          </p>
        </div>
        {regionArtUrl && (
          <div className="region-upload-thumb">
            <img src={regionArtUrl} alt={`${regionName} flag preview`} />
          </div>
        )}
      </div>

      <div className="division-editor-actions">
        <button
          className="btn"
          type="button"
          disabled={regionBusy}
          onClick={() => setEditingRegion(null)}
        >
          Cancel
        </button>
        <button className="btn primary" type="submit" disabled={regionBusy}>
          {regionBusy
            ? 'Saving…'
            : editingRegion === 'new'
              ? 'Add region flag'
              : 'Save region changes'}
        </button>
      </div>
    </form>
  )

  const formatForm = (
    <form className="division-editor" onSubmit={(event) => void saveFormat(event)}>
      <div className="homepage-format-fields">
        <label>
          <span>Format name</span>
          <input
            className="text"
            placeholder="e.g. Pro Club League"
            value={formatName}
            onChange={(event) => setFormatName(event.target.value)}
            maxLength={120}
            required
            autoFocus
          />
        </label>
        <label>
          <span>Format tag / mode</span>
          <input
            className="text"
            placeholder="e.g. 11 vs 11"
            value={formatTag}
            onChange={(event) => setFormatTag(event.target.value)}
            maxLength={64}
          />
        </label>
        <label>
          <span>Status</span>
          <CustomSelect
            ariaLabel="Format status"
            value={formatStatusInput}
            options={FORMAT_STATUS_OPTIONS}
            onChange={(value) => setFormatStatusInput(value as FormatStatus)}
          />
        </label>
      </div>
      <label>
        <span>Description</span>
        <input
          className="text"
          placeholder="Short description of this competition format"
          value={formatDesc}
          onChange={(event) => setFormatDesc(event.target.value)}
          maxLength={512}
        />
      </label>
      <div className="division-editor-actions">
        <button
          className="btn"
          type="button"
          disabled={formatBusy}
          onClick={() => setEditingFormat(null)}
        >
          Cancel
        </button>
        <button className="btn primary" type="submit" disabled={formatBusy}>
          {formatBusy
            ? 'Saving…'
            : editingFormat === 'new'
              ? 'Add format'
              : 'Save changes'}
        </button>
      </div>
    </form>
  )

  return (
    <div className="division-management homepage-management">
      <div className="club-subnav" role="tablist" aria-label="Homepage sections">
        <button
          role="tab"
          aria-selected={subview === 'flags'}
          onClick={() => setSubview('flags')}
        >
          Regional flags <span>{regions?.length ?? 0}</span>
        </button>
        <button
          role="tab"
          aria-selected={subview === 'formats'}
          onClick={() => setSubview('formats')}
        >
          Ways to compete <span>{formats?.length ?? 0}</span>
        </button>
        <button
          role="tab"
          aria-selected={subview === 'clubs'}
          onClick={() => setSubview('clubs')}
        >
          Featured clubs <span>{featuredSlugs.size}</span>
        </button>
      </div>

      {subview === 'flags' && (
        <div className="card">
          <header>
            <div>
              <h2>Horizontal flags &amp; regional clubs (&ldquo;The Island&rdquo;)</h2>
              <p className="hint">
                Upload flag artwork and manage the horizontal region panels on the main website. Registered clubs are automatically assigned to their matching flag based on their registered region.
              </p>
            </div>
            <button
              className="btn primary sm"
              type="button"
              onClick={() => openRegionEditor(null)}
              disabled={editingRegion !== null || regionReordering}
            >
              <span aria-hidden="true">＋</span> Add region flag
            </button>
          </header>

          {editingRegion === 'new' && regionForm}

          {regions === null ? (
            <div className="loading">Loading region flag panels…</div>
          ) : regions.length === 0 && editingRegion !== 'new' ? (
            <p className="empty">No region flag panels configured yet. Add one to display on the homepage.</p>
          ) : (
            <div className="division-admin-list">
              {regions.map((region, index) => {
                const matchedClubs = activeClubs.filter((c) => clubMatchesRegionAdmin(c, region))
                return (
                  <article
                    className={`division-admin-item region-admin-item${region.is_active ? '' : ' is-inactive'}`}
                    key={region.id}
                  >
                    {editingRegion === region.id ? (
                      regionForm
                    ) : (
                      <>
                        <div className="division-admin-heading homepage-format-row">
                          <div className="division-admin-title region-admin-title">
                            <span className="division-admin-rank" aria-label={`Panel ${index + 1}`}>
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <div className="region-admin-art-preview">
                              <img src={region.art_url} alt={`${region.name} flag`} />
                            </div>
                            <div>
                              <h3>
                                <span>{region.flag}</span> {region.name}
                                <span className="format-status-badge status-active">{region.iso}</span>
                                {!region.is_active && (
                                  <span className="division-inactive-badge">Hidden</span>
                                )}
                              </h3>
                              <span className="hint">
                                Auto-assigned: <strong>{matchedClubs.length}</strong>{' '}
                                {matchedClubs.length === 1 ? 'registered club' : 'registered clubs'} in{' '}
                                {region.name}
                              </span>
                            </div>
                          </div>

                          <div className="division-admin-actions homepage-format-actions">
                            <div className="division-reorder-controls" aria-label={`Reorder ${region.name}`}>
                              <button
                                className="icon-btn"
                                type="button"
                                aria-label={`Move ${region.name} left`}
                                title="Move earlier"
                                disabled={index === 0 || editingRegion !== null || regionReordering}
                                onClick={() => void moveRegion(index, -1)}
                              >
                                ↑
                              </button>
                              <button
                                className="icon-btn"
                                type="button"
                                aria-label={`Move ${region.name} right`}
                                title="Move later"
                                disabled={
                                  index === regions.length - 1 ||
                                  editingRegion !== null ||
                                  regionReordering
                                }
                                onClick={() => void moveRegion(index, 1)}
                              >
                                ↓
                              </button>
                            </div>
                            <button
                              className="btn sm"
                              type="button"
                              disabled={regionTogglingId === region.id || editingRegion !== null}
                              onClick={() => void toggleRegionActive(region)}
                            >
                              {region.is_active ? 'Hide' : 'Show'}
                            </button>
                            <button
                              className="btn sm"
                              type="button"
                              disabled={editingRegion !== null}
                              onClick={() => openRegionEditor(region)}
                            >
                              Edit / Upload flag
                            </button>
                            <button
                              className="btn sm danger"
                              type="button"
                              disabled={regionDeletingId === region.id || editingRegion !== null}
                              onClick={() => void removeRegionItem(region)}
                            >
                              {regionDeletingId === region.id ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        </div>

                        {matchedClubs.length > 0 && (
                          <details className="region-assigned-clubs-details">
                            <summary>
                              View {matchedClubs.length}{' '}
                              {matchedClubs.length === 1 ? 'club' : 'clubs'} in {region.name}
                            </summary>
                            <div className="region-assigned-clubs" aria-label={`Clubs in ${region.name}`}>
                              {matchedClubs.map((c) => (
                                <span className="region-club-pill" key={c.slug}>
                                  {c.logo_local && <img src={c.logo_local} alt="" />}
                                  <span>{c.name}</span>
                                  {c.short_code && <code>{c.short_code}</code>}
                                </span>
                              ))}
                            </div>
                          </details>
                        )}
                      </>
                    )}
                  </article>
                )
              })}
            </div>
          )}

          <details className="region-assignment-Override">
            <summary>
              Manage club region assignments ({activeClubs.filter((c) => Boolean(c.flag)).length} of{' '}
              {activeClubs.length} active clubs have a region set)
            </summary>
            <p className="hint" style={{ marginTop: 8, marginBottom: 12 }}>
              New clubs are automatically assigned a region when their manager registers. You can also assign or update any club&rsquo;s region below so it appears under the right flag panel.
            </p>
            <div className="region-club-assign-grid">
              {activeClubs.map((club) => (
                <div className="region-club-assign-row" key={club.slug}>
                  <div className="club">
                    {club.logo_local && <img src={club.logo_local} alt="" />}
                    <span className="name">{club.name}</span>
                  </div>
                  <CustomSelect
                    ariaLabel={`Region for ${club.name}`}
                    value={club.flag ?? ''}
                    disabled={assigningClubSlug === club.slug}
                    options={[
                      { value: '', label: 'Unassigned' },
                      ...(regions ?? []).map((r) => ({
                        value: r.flag,
                        label: `${r.flag} ${r.name}`,
                      })),
                      ...REGION_PRESETS.filter(
                        (p) => !(regions ?? []).some((r) => r.flag === p.flag),
                      ).map((p) => ({
                        value: p.flag,
                        label: `${p.flag} ${p.name}`,
                      })),
                    ]}
                    onChange={(value) => void quickAssignClubRegion(club, value)}
                  />
                </div>
              ))}
            </div>
          </details>

          {renderOneToOneRailPreview(false)}

          {previewExpanded && (
            <div
              className="squad-modal-backdrop rail-preview-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setPreviewExpanded(false)
              }}
            >
              <div className="rail-preview-modal" role="dialog" aria-modal="true" aria-label="1:1 Main Website Flag Rail Preview">
                {renderOneToOneRailPreview(true)}
              </div>
            </div>
          )}
        </div>
      )}

      {subview === 'formats' && (
        <div className="card">
          <header>
            <div>
              <h2>Ways to compete</h2>
              <p className="hint">
                Control the competition formats section on the main page — add, remove, or set each format to Active, Coming Soon, or Inactive.
              </p>
            </div>
            <button
              className="btn primary sm"
              type="button"
              onClick={() => openFormatEditor(null)}
              disabled={editingFormat !== null}
            >
              <span aria-hidden="true">＋</span> Add format
            </button>
          </header>

          {editingFormat === 'new' && formatForm}

          {formats === null ? (
            <div className="loading">Loading competition formats…</div>
          ) : formats.length === 0 && editingFormat !== 'new' ? (
            <p className="empty">No competition formats configured yet. Add one to display on the homepage.</p>
          ) : (
            <div className="division-admin-list">
              {formats.map((format, index) => (
                <article
                  className={`division-admin-item${format.status === 'inactive' ? ' is-inactive' : ''}`}
                  key={format.id}
                >
                  {editingFormat === format.id ? (
                    formatForm
                  ) : (
                    <div className="division-admin-heading homepage-format-row">
                      <div className="division-admin-title">
                        <span className="division-admin-rank" aria-label={`Format ${index + 1}`}>
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <h3>
                            {format.name}
                            <span className={`format-status-badge status-${format.status}`}>
                              {format.status === 'active'
                                ? format.tag || 'Active'
                                : format.status === 'coming_soon'
                                  ? 'Coming Soon'
                                  : 'Inactive'}
                            </span>
                          </h3>
                          {format.description && (
                            <span className="hint">{format.description}</span>
                          )}
                        </div>
                      </div>
                      <div className="division-admin-actions homepage-format-actions">
                        <div className="homepage-status-select">
                          <CustomSelect
                            ariaLabel={`Status for ${format.name}`}
                            value={format.status}
                            disabled={statusBusyId === format.id || editingFormat !== null}
                            options={FORMAT_STATUS_OPTIONS}
                            onChange={(value) =>
                              void changeFormatStatus(format, value as FormatStatus)
                            }
                          />
                        </div>
                        <button
                          className="btn sm"
                          type="button"
                          disabled={editingFormat !== null}
                          onClick={() => openFormatEditor(format)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn sm danger"
                          type="button"
                          disabled={deleteBusyId === format.id || editingFormat !== null}
                          onClick={() => void removeFormatItem(format)}
                        >
                          {deleteBusyId === format.id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {subview === 'clubs' && (
        <div className="card">
          <header>
            <div>
              <h2>Every club in the league</h2>
              <p className="hint">
                Multi-select which clubs are featured in the homepage crest wall ({featuredSlugs.size} of {clubs?.length ?? 0} selected).
              </p>
            </div>
            <div className="homepage-club-header-actions">
              <button
                className="btn sm"
                type="button"
                disabled={!clubs || filteredClubs.length === 0 || featuredBusy}
                onClick={selectAllFilteredClubs}
              >
                Select all
              </button>
              <button
                className="btn sm"
                type="button"
                disabled={!clubs || filteredClubs.length === 0 || featuredBusy}
                onClick={deselectAllFilteredClubs}
              >
                Clear all
              </button>
              <button
                className="btn primary sm"
                type="button"
                disabled={!featuredDirty || featuredBusy}
                onClick={() => void saveFeaturedClubsSelection()}
              >
                {featuredBusy ? 'Saving…' : 'Save featured clubs'}
              </button>
            </div>
          </header>

          <div className="homepage-club-toolbar">
            <input
              className="text"
              type="search"
              placeholder="Search clubs by name or code…"
              aria-label="Search clubs to feature on the homepage"
              value={clubSearch}
              onChange={(event) => setClubSearch(event.target.value)}
            />
            {featuredDirty && (
              <span className="homepage-unsaved-pill">Unsaved changes</span>
            )}
          </div>

          {clubs === null ? (
            <div className="loading">Loading clubs…</div>
          ) : filteredClubs.length === 0 ? (
            <div className="empty">No clubs match your search.</div>
          ) : (
            <div className="homepage-club-grid" role="group" aria-label="Featured clubs selection">
              {filteredClubs.map((club) => {
                const checked = featuredSlugs.has(club.slug)
                return (
                  <label
                    key={club.slug}
                    className={`homepage-club-option${checked ? ' is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={featuredBusy}
                      onChange={(event) => toggleClubFeatured(club.slug, event.target.checked)}
                    />
                    {club.logo_local && <img src={club.logo_local} alt="" />}
                    <div className="homepage-club-meta">
                      <span className="name">{club.name}</span>
                      <span className="hint">{club.short_code || '—'}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------- registered managers & players */

const USER_ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'club_manager', label: 'Club Manager' },
  { value: 'player', label: 'Player' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
]

function formatUserRole(role: UserRole): string {
  return USER_ROLE_OPTIONS.find((opt) => opt.value === role)?.label ?? role
}

function MembersManagement({
  guard,
  report,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
}) {
  const [subview, setSubview] = useState<'accounts' | 'players'>('accounts')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null)
  const [clubs, setClubs] = useState<Club[]>([])

  // Account filters & editor state
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | UserRole>('all')
  const [editingUser, setEditingUser] = useState<number | 'new' | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userDisplayName, setUserDisplayName] = useState('')
  const [userRole, setUserRole] = useState<UserRole>('club_manager')
  const [userClubId, setUserClubId] = useState('')
  const [userGamertag, setUserGamertag] = useState('')
  const [userActive, setUserActive] = useState(true)
  const [userBusy, setUserBusy] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null)

  // Player filters & editor state
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerClubFilter, setPlayerClubFilter] = useState('')
  const [editingPlayer, setEditingPlayer] = useState<number | 'new' | null>(null)
  const [playerGamertag, setPlayerGamertag] = useState('')
  const [playerClubId, setPlayerClubId] = useState('')
  const [playerBusy, setPlayerBusy] = useState(false)
  const [deletingPlayerId, setDeletingPlayerId] = useState<number | null>(null)

  const loadAll = useCallback(async () => {
    const [usersData, playersData, clubsData] = await Promise.all([
      guard(getAdminUsers, 'Could not load registered accounts'),
      guard(getAdminPlayers, 'Could not load league players'),
      guard(() => getClubs(), 'Could not load clubs'),
    ])
    setUsers(usersData)
    setPlayers(playersData)
    setClubs(clubsData)
  }, [guard])

  useEffect(() => {
    loadAll().catch(() => {
      setUsers((prev) => prev ?? [])
      setPlayers((prev) => prev ?? [])
    })
  }, [loadAll])

  const openUserEditor = (user: AdminUser | null) => {
    setEditingUser(user?.id ?? 'new')
    setUserEmail(user?.email ?? '')
    setUserPassword('')
    setUserDisplayName(user?.display_name ?? '')
    setUserRole(user?.role ?? 'club_manager')
    setUserClubId(user?.club_id ? String(user.club_id) : '')
    setUserGamertag(user?.gamertag ?? '')
    setUserActive(user ? Boolean(user.is_active) : true)
  }

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editingUser === null) return
    const target = editingUser
    setUserBusy(true)
    try {
      const payload = {
        email: userEmail.trim(),
        ...(userPassword ? { password: userPassword } : {}),
        displayName: userDisplayName.trim() || null,
        role: userRole,
        clubId: userClubId ? Number(userClubId) : null,
        gamertag: userGamertag.trim() || null,
        isActive: userActive,
      }
      await guard(
        () => (target === 'new' ? createAdminUser(payload) : updateAdminUser(target, payload)),
        target === 'new' ? 'Could not create account' : 'Could not update account',
      )
      await loadAll()
      setEditingUser(null)
      report('ok', target === 'new' ? 'Account created.' : 'Account updated.')
    } catch {
      /* already reported */
    } finally {
      setUserBusy(false)
    }
  }

  const removeUser = async (user: AdminUser) => {
    if (
      deletingUserId !== null ||
      !window.confirm(`Delete account "${user.email}"? Any active sessions will be revoked.`)
    ) {
      return
    }
    setDeletingUserId(user.id)
    try {
      await guard(() => deleteAdminUser(user.id), `Could not delete ${user.email}`)
      await loadAll()
      if (editingUser === user.id) setEditingUser(null)
      report('ok', `${user.email} deleted.`)
    } catch {
      /* already reported */
    } finally {
      setDeletingUserId(null)
    }
  }

  const openPlayerEditor = (player: AdminPlayer | null) => {
    setEditingPlayer(player?.id ?? 'new')
    setPlayerGamertag(player?.gamertag ?? '')
    setPlayerClubId(player?.club_id ? String(player.club_id) : '')
  }

  const savePlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editingPlayer === null) return
    const target = editingPlayer
    setPlayerBusy(true)
    try {
      const payload = {
        gamertag: playerGamertag.trim(),
        clubId: playerClubId ? Number(playerClubId) : null,
      }
      await guard(
        () =>
          target === 'new' ? createAdminPlayer(payload) : updateAdminPlayer(target, payload),
        target === 'new' ? 'Could not add player' : 'Could not update player',
      )
      await loadAll()
      setEditingPlayer(null)
      report('ok', `${payload.gamertag} saved.`)
    } catch {
      /* already reported */
    } finally {
      setPlayerBusy(false)
    }
  }

  const removePlayerItem = async (player: AdminPlayer) => {
    if (
      deletingPlayerId !== null ||
      !window.confirm(`Delete player "${player.gamertag}" from the league?`)
    ) {
      return
    }
    setDeletingPlayerId(player.id)
    try {
      await guard(() => deleteAdminPlayer(player.id), `Could not delete ${player.gamertag}`)
      await loadAll()
      if (editingPlayer === player.id) setEditingPlayer(null)
      report('ok', `${player.gamertag} deleted.`)
    } catch {
      /* already reported */
    } finally {
      setDeletingPlayerId(null)
    }
  }

  const filteredUsers = (users ?? []).filter((u) => {
    if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false
    const q = userSearch.trim().toLowerCase()
    if (!q) return true
    return (
      u.email.toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q) ||
      (u.club_name ?? '').toLowerCase().includes(q) ||
      (u.gamertag ?? '').toLowerCase().includes(q)
    )
  })

  const filteredPlayers = (players ?? []).filter((p) => {
    if (playerClubFilter === 'free' && p.club_id !== null) return false
    if (playerClubFilter === 'signed' && p.club_id === null) return false
    if (
      playerClubFilter &&
      playerClubFilter !== 'free' &&
      playerClubFilter !== 'signed' &&
      String(p.club_id ?? '') !== playerClubFilter
    ) {
      return false
    }
    const q = playerSearch.trim().toLowerCase()
    if (!q) return true
    return (
      p.gamertag.toLowerCase().includes(q) ||
      (p.club_name ?? '').toLowerCase().includes(q) ||
      (p.user_email ?? '').toLowerCase().includes(q)
    )
  })

  const clubOptions = [
    { value: '', label: 'None / Free agent' },
    ...clubs.map((c) => ({ value: String(c.id), label: c.name })),
  ]

  const userForm = (
    <form className="division-editor" onSubmit={(event) => void saveUser(event)}>
      <div className="members-form-grid">
        <label>
          <span>Email address</span>
          <input
            className="text"
            type="email"
            placeholder="manager@example.com"
            value={userEmail}
            onChange={(event) => setUserEmail(event.target.value)}
            maxLength={190}
            required
            autoFocus
          />
        </label>
        <label>
          <span>{editingUser === 'new' ? 'Password (min 8 chars)' : 'New password (leave blank to keep)'}</span>
          <input
            className="text"
            type="password"
            placeholder={editingUser === 'new' ? 'At least 8 characters' : 'Unchanged'}
            value={userPassword}
            onChange={(event) => setUserPassword(event.target.value)}
            minLength={8}
            required={editingUser === 'new'}
          />
        </label>
        <label>
          <span>Display name</span>
          <input
            className="text"
            placeholder="Optional name"
            value={userDisplayName}
            onChange={(event) => setUserDisplayName(event.target.value)}
            maxLength={120}
          />
        </label>
        <label>
          <span>Role</span>
          <CustomSelect
            ariaLabel="Account role"
            value={userRole}
            options={USER_ROLE_OPTIONS}
            onChange={(value) => setUserRole(value as UserRole)}
          />
        </label>
        <label>
          <span>Managed / assigned club</span>
          <CustomSelect
            ariaLabel="Managed club"
            value={userClubId}
            options={clubOptions}
            onChange={setUserClubId}
          />
        </label>
        <label>
          <span>Linked player gamertag</span>
          <input
            className="text"
            placeholder="Optional EA FC gamertag"
            value={userGamertag}
            onChange={(event) => setUserGamertag(event.target.value)}
            maxLength={120}
          />
        </label>
      </div>
      <div className="members-form-footer">
        <label className="division-active-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={userActive}
            onChange={(event) => setUserActive(event.target.checked)}
          />
          <span className="division-active-track" aria-hidden="true" />
          <span className="division-active-label">
            {userActive ? 'Account active' : 'Deactivated'}
          </span>
        </label>
        <div className="division-editor-actions">
          <button
            className="btn"
            type="button"
            disabled={userBusy}
            onClick={() => setEditingUser(null)}
          >
            Cancel
          </button>
          <button className="btn primary" type="submit" disabled={userBusy}>
            {userBusy
              ? 'Saving…'
              : editingUser === 'new'
                ? 'Create account'
                : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  )

  const playerForm = (
    <form className="division-editor" onSubmit={(event) => void savePlayer(event)}>
      <div className="members-player-form-grid">
        <label>
          <span>Player gamertag</span>
          <input
            className="text"
            placeholder="e.g. LethaL_ShoTs11"
            value={playerGamertag}
            onChange={(event) => setPlayerGamertag(event.target.value)}
            maxLength={120}
            required
            autoFocus
          />
        </label>
        <label>
          <span>Club</span>
          <CustomSelect
            ariaLabel="Player club"
            value={playerClubId}
            options={clubOptions}
            onChange={setPlayerClubId}
          />
        </label>
      </div>
      <div className="division-editor-actions">
        <button
          className="btn"
          type="button"
          disabled={playerBusy}
          onClick={() => setEditingPlayer(null)}
        >
          Cancel
        </button>
        <button className="btn primary" type="submit" disabled={playerBusy}>
          {playerBusy
            ? 'Saving…'
            : editingPlayer === 'new'
              ? 'Add player'
              : 'Save changes'}
        </button>
      </div>
    </form>
  )

  return (
    <div className="division-management members-management">
      <div className="club-subnav" role="tablist" aria-label="Managers and players views">
        <button
          role="tab"
          aria-selected={subview === 'accounts'}
          onClick={() => setSubview('accounts')}
        >
          Registered accounts <span>{users?.length ?? 0}</span>
        </button>
        <button
          role="tab"
          aria-selected={subview === 'players'}
          onClick={() => setSubview('players')}
        >
          League players <span>{players?.length ?? 0}</span>
        </button>
      </div>

      {subview === 'accounts' ? (
        <div className="card">
          <header>
            <div>
              <h2>Registered managers &amp; player accounts</h2>
              <p className="hint">
                Create, edit, deactivate, or delete registered login accounts and their club or gamertag links.
              </p>
            </div>
            <button
              className="btn primary sm"
              type="button"
              disabled={editingUser !== null}
              onClick={() => openUserEditor(null)}
            >
              <span aria-hidden="true">＋</span> Add account
            </button>
          </header>

          {editingUser === 'new' && userForm}

          <div className="members-toolbar">
            <input
              className="text"
              type="search"
              placeholder="Search by email, name, club, or gamertag…"
              aria-label="Search registered accounts"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
            />
            <div className="members-filter-select">
              <CustomSelect
                ariaLabel="Filter by role"
                value={userRoleFilter}
                options={[
                  { value: 'all', label: 'All roles' },
                  ...USER_ROLE_OPTIONS,
                ]}
                onChange={(value) => setUserRoleFilter(value as 'all' | UserRole)}
              />
            </div>
          </div>

          {users === null ? (
            <div className="loading">Loading registered accounts…</div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty">No registered accounts match the current filter.</div>
          ) : (
            <div className="division-admin-list">
              {filteredUsers.map((u) => (
                <article
                  key={u.id}
                  className={`division-admin-item${u.is_active ? '' : ' is-inactive'}`}
                >
                  {editingUser === u.id ? (
                    userForm
                  ) : (
                    <div className="division-admin-heading members-row">
                      <div className="division-admin-title">
                        <div>
                          <h3>
                            {u.display_name || u.gamertag || u.email}
                            <span className={`format-status-badge ${u.role === 'club_manager' ? 'status-active' : 'status-coming_soon'}`}>
                              {formatUserRole(u.role)}
                            </span>
                            {!u.is_active && (
                              <span className="division-inactive-badge">Deactivated</span>
                            )}
                          </h3>
                          <span className="hint">
                            {u.email}
                            {u.club_name ? ` · Club: ${u.club_name}` : ''}
                            {u.gamertag ? ` · Gamertag: ${u.gamertag}` : ''}
                            {u.created_at ? ` · Joined ${u.created_at.slice(0, 10)}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="division-admin-actions">
                        <button
                          className="btn sm"
                          type="button"
                          disabled={editingUser !== null}
                          onClick={() => openUserEditor(u)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn sm danger"
                          type="button"
                          disabled={deletingUserId === u.id || editingUser !== null}
                          onClick={() => void removeUser(u)}
                        >
                          {deletingUserId === u.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <header>
            <div>
              <h2>League players</h2>
              <p className="hint">
                Manage all player rosters, gamertags, and club assignments across the league ({filteredPlayers.length} shown).
              </p>
            </div>
            <button
              className="btn primary sm"
              type="button"
              disabled={editingPlayer !== null}
              onClick={() => openPlayerEditor(null)}
            >
              <span aria-hidden="true">＋</span> Add player
            </button>
          </header>

          {editingPlayer === 'new' && playerForm}

          <div className="members-toolbar">
            <input
              className="text"
              type="search"
              placeholder="Search players by gamertag, club, or account email…"
              aria-label="Search league players"
              value={playerSearch}
              onChange={(event) => setPlayerSearch(event.target.value)}
            />
            <div className="members-filter-select">
              <CustomSelect
                ariaLabel="Filter players by club"
                value={playerClubFilter}
                options={[
                  { value: '', label: 'All clubs & free agents' },
                  { value: 'signed', label: 'Signed to a club' },
                  { value: 'free', label: 'Free agents only' },
                  ...clubs.map((c) => ({ value: String(c.id), label: c.name })),
                ]}
                onChange={setPlayerClubFilter}
              />
            </div>
          </div>

          {players === null ? (
            <div className="loading">Loading league players…</div>
          ) : filteredPlayers.length === 0 ? (
            <div className="empty">No players match your search.</div>
          ) : (
            <div className="division-admin-list">
              {filteredPlayers.map((p) => (
                <article key={p.id} className="division-admin-item">
                  {editingPlayer === p.id ? (
                    playerForm
                  ) : (
                    <div className="division-admin-heading members-row">
                      <div className="division-admin-title">
                        <div>
                          <h3>
                            {p.gamertag}
                            <span className={`format-status-badge ${p.club_id ? 'status-active' : 'status-inactive'}`}>
                              {p.club_name ?? 'Free agent'}
                            </span>
                          </h3>
                          <span className="hint">
                            {p.user_email
                              ? `Linked account: ${p.user_name ? `${p.user_name} (${p.user_email})` : p.user_email}`
                              : 'No linked login account'}
                          </span>
                        </div>
                      </div>
                      <div className="division-admin-actions">
                        <button
                          className="btn sm"
                          type="button"
                          disabled={editingPlayer !== null}
                          onClick={() => openPlayerEditor(p)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn sm danger"
                          type="button"
                          disabled={deletingPlayerId === p.id || editingPlayer !== null}
                          onClick={() => void removePlayerItem(p)}
                        >
                          {deletingPlayerId === p.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


