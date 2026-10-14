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
import {
  ApiError,
  addPlayer,
  assignDivision,
  decideClub,
  deleteMatch,
  createDivision,
  createSeason,
  createMatch,
  getClubs,
  getAdminSeasons,
  getDivisions,
  getMatches,
  getMatchPriorities,
  getPendingClubs,
  getSeasonDivisionMovements,
  getStandings,
  generateFixtures,
  moveClub,
  removePlayer,
  scheduleMatch,
  setResult,
  setCurrentSeason,
  setFeaturedDivision,
  updateClub,
  updateDivision,
  updateDivisionOrder,
  updateSeason,
  withdrawResult,
  type Club,
  type ClubMovementType,
  type AdminSeason,
  type Division,
  type Match,
  type MatchSort,
  type PendingClub,
  type SeasonDivisionMovement,
  type Standing,
} from './api'

type Tab = 'standings' | 'results' | 'clubs'
type ClubSection = 'clubs' | 'applications' | 'divisions'

/** Which bulk action is running, so only that button shows its spinner. */
type BulkAction = 'update' | ClubMovementType

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

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = window.localStorage.getItem('iwvpl-admin-tab')
    return saved === 'standings' || saved === 'clubs' || saved === 'applications' || saved === 'divisions'
      ? saved === 'applications' || saved === 'divisions' ? 'clubs' : saved
      : 'results'
  })
  const [clubSection, setClubSection] = useState<ClubSection>(() => {
    const savedTab = window.localStorage.getItem('iwvpl-admin-tab')
    const savedSection = window.localStorage.getItem('iwvpl-admin-club-section')
    return savedTab === 'applications' || savedSection === 'applications'
      ? 'applications'
      : savedTab === 'divisions' || savedSection === 'divisions'
        ? 'divisions'
        : 'clubs'
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pendingApplicationCount, setPendingApplicationCount] = useState(0)
  // Monotonic so two notices raised in the same tick stay independent toasts
  // instead of colliding on a shared identity.
  const nextToastId = useRef(0)
  const pageTitle: Record<Tab, string> = {
    results: 'Match centre',
    standings: 'League table',
    clubs: 'Club management',
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
  }, [tab])

  useEffect(() => {
    window.localStorage.setItem('iwvpl-admin-club-section', clubSection)
  }, [clubSection])

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
    results: 'Matches',
    standings: 'Standings',
  }
  const tabIcons: Record<Tab, string> = {
    clubs: '♙',
    results: '◉',
    standings: '▤',
  }

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
          <nav className="tabs" role="tablist" aria-label="Admin sections">
            {(['clubs', 'results', 'standings'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                <span className="nav-icon" aria-hidden="true">{tabIcons[t]}</span>
                <span>{tabLabels[t]}</span>
                {t === 'clubs' && pendingApplicationCount > 0 && (
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
                    : tab === 'clubs' && clubSection === 'applications'
                      ? 'Review and respond to clubs waiting for approval.'
                      : tab === 'clubs'
                        ? 'Update club details and manage player rosters.'
                        : ''}
              </p>
            </div>
          </div>

          {tab === 'standings' && <Standings guard={guard} />}
          {tab === 'results' && <Results guard={guard} report={report} />}
          {tab === 'clubs' && (
            <Clubs
              guard={guard}
              report={report}
              section={clubSection}
              setSection={setClubSection}
              pendingApplicationCount={pendingApplicationCount}
              onPendingCountChange={setPendingApplicationCount}
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
        setDivisions(seasonDivisions)
        setDivisionId(String(seasonDivisions[0]?.id ?? ''))
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
  const [totalMatches, setTotalMatches] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [draft, setDraft] = useState<Record<number, { home: string; away: string }>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')
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
        guard(() => getMatchPriorities(), 'Could not load schedule priorities'),
      ])
      if (currentRequest !== requestId.current) return
      const lastPage = Math.max(0, Math.ceil(data.total / 20) - 1)
      if (page > lastPage) {
        setPage(lastPage)
        return
      }
      const loadedMatches = [...data.matches, ...priorities]
      setMatches(data.matches)
      setPriorityData(priorities)
      setTotalMatches(data.total)
      setPendingCount(data.pending)
      setCompletedCount(data.completed)
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
  }, [filter, guard, page, search, sort])

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
          setFixtureDivisions(seasonDivisions)
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
    if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 20) {
      report('error', 'Enter a whole number of rounds between 1 and 20.')
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
        <div className="match-priority" aria-label="Schedule priorities">
          <div className="match-priority-heading">
            <div>
              <span className="eyebrow">SCHEDULE PRIORITIES</span>
              <p>Fixtures needing attention · Kuala Lumpur time (UTC+8)</p>
            </div>
            <span className="priority-total">
              {priorityMatches.reduce((total, group) => total + group.matches.length, 0)} to review
            </span>
          </div>
          {priorityMatches.every((group) => group.matches.length === 0) ? (
            <div className="priority-clear">
              <span aria-hidden="true">✓</span>
              <span><strong>All caught up</strong><small>No unscheduled, overdue, or today fixtures.</small></span>
            </div>
          ) : (
            <div className="priority-groups">
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
                  <div className="priority-fixtures">
                    {group.matches.map((match) => (
                      <div className="priority-fixture" key={match.id}>
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
            </div>
          )}
        </div>
        <div className="match-controls">
          <div className="filter-pills" role="group" aria-label="Filter fixtures">
            {(['all', 'pending', 'completed'] as const).map((f) => (
              <button
                key={f}
                className={filter === f ? 'selected' : ''}
                onClick={() => { setFilter(f); setPage(0) }}
              >
                {f === 'pending' ? `Unplayed (${pendingCount})` : f === 'completed' ? `Completed (${completedCount})` : 'All fixtures'}
              </button>
            ))}
          </div>
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
                : priorityMatches[0].matches.length > 0 && filter !== 'completed'
                  ? 'Fixtures needing a date are shown in the schedule priorities above.'
                  : 'Switch filters to see other fixtures.'}
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
                <input
                  className="text generate-rounds"
                  type="number"
                  min="1"
                  max="20"
                  value={generateRounds}
                  onChange={(event) => setGenerateRounds(event.target.value)}
                  aria-label="Rounds per league"
                />
                <p className="generate-help">
                  One round plays every club once. Two rounds plays every pairing home and away,
                  which is the usual league format.
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
            disabled={!currentSeason || divisions.length === 0 || featuredBusy}
            options={[
              { value: '', label: 'Use highest-ranked league' },
              ...divisions.map((division) => ({
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
              <article className="division-admin-item" key={division.id}>
                {editing === division.id ? form : (
                  <>
                    <div className="division-admin-heading">
                      <div className="division-admin-title">
                        <span className="division-admin-rank" aria-label={`League priority ${index + 1}`}>
                          {index + 1}
                        </span>
                        <div>
                          <h3>{division.name}</h3>
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
                        <button className="btn sm" onClick={() => edit(division)} disabled={editing !== null || reordering}>
                          Edit division
                        </button>
                      </div>
                    </div>
                    <div className="division-range-summary">
                      <p><span>Promotion</span><strong>
                        {division.promotion_count == null ? 'Not set' : `Top ${division.promotion_count}`}
                      </strong></p>
                      <p><span>Relegation</span><strong>
                        {division.relegation_count == null ? 'Not set' : `Bottom ${division.relegation_count}`}
                      </strong></p>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      <p className="footnote">
        Promotion and relegation are shown on the public standings. Divisions are retained for
        season history, so they cannot be deleted here.
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
  onUndoSeason,
  seasonBusy,
  canUndo,
  previousSeasonName,
  rolloverHint,
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
  onUndoSeason: () => void
  seasonBusy: boolean
  canUndo: boolean
  previousSeasonName: string | null
  rolloverHint: string | null
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
          {canUndo && (
            <button
              className="btn sm"
              type="button"
              disabled={seasonBusy}
              onClick={onUndoSeason}
            >
              Undo · back to {previousSeasonName}
            </button>
          )}
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
            disabled={seasonBusy || readOnly}
            title={rolloverHint ?? undefined}
            onClick={onCompleteSeason}
          >
            Complete season
          </button>
          <button
            className="btn primary sm"
            type="button"
            disabled={seasonBusy}
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

function Clubs({
  guard,
  report,
  section,
  setSection,
  pendingApplicationCount,
  onPendingCountChange,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
  section: ClubSection
  setSection: (section: ClubSection) => void
  pendingApplicationCount: number
  onPendingCountChange: (count: number) => void
}) {
  const [clubs, setClubs] = useState<Club[] | null>(null)
  const [standings, setStandings] = useState<Standing[]>([])
  const [seasonMovements, setSeasonMovements] = useState<SeasonDivisionMovement[] | null>(null)
  const [seasons, setSeasons] = useState<AdminSeason[]>([])
  const [seasonId, setSeasonId] = useState('')
  const [codes, setCodes] = useState<Record<string, string>>({})
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
  const [seasonBusy, setSeasonBusy] = useState(false)
  const [seasonCompleteOpen, setSeasonCompleteOpen] = useState(false)
  const [nextSeasonName, setNextSeasonName] = useState('')
  const [nextSeasonYear, setNextSeasonYear] = useState('')
  // The plan the rollover confirm dialog is showing, null when none is queued.
  const [confirmRelocate, setConfirmRelocate] = useState<{
    source: Division
    neighbour: Division
    neighbourType: ClubMovementType
    type: ClubMovementType
    inbound: Club[]
  } | null>(null)
  const closeCompleteSeason = () => {
    setSeasonCompleteOpen(false)
    setConfirmRelocate(null)
  }
  const openCompleteSeason = () => {
    const year = Math.max(new Date().getFullYear(), ...seasons.map((season) => season.year)) + 1
    setNextSeasonYear(String(year))
    setNextSeasonName(`${year} Season 1`)
    const plan =
      selectedCount > 0 && !bulkMoveBlock(bulkDirection) ? planBulkRelocate(bulkDirection) : null
    setConfirmRelocate(plan)
    setSeasonCompleteOpen(true)
  }
  // Which movement the club editor is waiting on confirmation for, and the one
  // it has actually sent. Both are per club so a failed move cannot leave the
  // confirm strip open on a different club.
  const [confirmingMovement, setConfirmingMovement] = useState<{
    slug: string
    type: ClubMovementType
  } | null>(null)
  const [movingClub, setMovingClub] = useState<{
    slug: string
    type: ClubMovementType
  } | null>(null)
  const activeClub = clubs?.find((club) => club.slug === editing) ?? null

  const currentSeasonId = seasons.find((season) => Boolean(season.is_current))?.id ?? null
  const selectedSeason = seasons.find((season) => String(season.id) === seasonId) ?? null
  // Only the live season can be written to. Every earlier season is kept as
  // history, so a past table stays exactly as the season finished rather than
  // being edited months later by someone who has forgotten what it was.
  const readOnly = currentSeasonId !== null && Number(seasonId) !== currentSeasonId
  // Movement history is tracked per current season, so past seasons have none
  // to show and the zone colours stay off.
  const movementTracked = seasonMovements !== null && !readOnly

  /**
   * Load one season's clubs, leagues and table.
   *
   * Everything on this page is scoped to the selected season rather than
   * whatever happens to be current, which is what makes the read-only past
   * season view meaningful instead of a second copy of the live data.
   */
  const loadSeason = useCallback(async (targetSeasonId: number) => {
    const [data, currentDivisions, currentStandings, currentMovements] = await Promise.all([
      guard(() => getClubs(targetSeasonId), 'Could not load clubs'),
      guard(() => getDivisions(targetSeasonId), 'Could not load leagues'),
      guard(() => getStandings(targetSeasonId), 'Could not load standings').catch(() => []),
      guard(getSeasonDivisionMovements, 'Could not load current-season movement history').catch(
        () => null,
      ),
    ])
    setClubs(data)
    setStandings(currentStandings)
    setSeasonMovements(currentMovements)
    setCodes(Object.fromEntries(data.map((c) => [c.slug, c.short_code ?? ''])))
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
    setBusy(c.slug)
    try {
      await guard(
        () =>
          updateClub(c.slug, {
            shortCode: codes[c.slug] || null,
            status: statuses[c.slug],
          }),
        `Could not save ${c.name}`,
      )
      const chosen = divisionOf[c.slug] ?? ''
      setClubs((current) =>
        current?.map((club) =>
          club.slug === c.slug
            ? {
                ...club,
                short_code: codes[c.slug] || null,
                status: statuses[c.slug],
              }
            : club,
        ) ?? null,
      )

      // Division is a separate call: it has to create the club's standings row,
      // which is not something the club PATCH knows how to do. It is recorded as
      // a plain move, so it never spends a promotion or relegation slot — see
      // `move` below for that.
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
            ? `Could not remove ${c.name} from its league`
            : `Could not assign ${c.name} to the division`,
        )
        setClubs((current) =>
          current?.map((club) =>
            club.slug === c.slug ? { ...club, division_id: res.divisionId } : club,
          ) ?? null,
        )
        setSeasonMovements(null)
        const [updatedStandings, updatedMovements] = await Promise.all([
          guard(() => getStandings(Number(seasonId)), 'Could not refresh standings after changing the league'),
          guard(
            getSeasonDivisionMovements,
            'Could not refresh movement history after changing the league',
          ),
        ])
        setStandings(updatedStandings)
        setSeasonMovements(updatedMovements)
        report(
          'ok',
          res.divisionName
            ? `Saved ${c.name} and entered it into ${res.divisionName}. No movement slot used.`
            : `Saved ${c.name} and removed it from its league. It is now unassigned.`,
        )
      } else {
        report('ok', `Saved ${c.name}.`)
      }

      setEditing(null)
      setConfirmingMovement(null)
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  /**
   * Promote or relegate the club one rung of the ladder.
   *
   * Deliberately does not touch `codes` or `statuses`: the editor stays open
   * so several clubs can be moved in a row, and an unsaved short code would be
   * silently discarded by a full save. It does resync the league draft to the
   * league the club is actually in, otherwise the dropdown would sit there
   * offering to make a move that already happened.
   */
  const move = async (c: Club, type: ClubMovementType) => {
    if (readOnly) return
    setMovingClub({ slug: c.slug, type })
    try {
      const result = await guard(
        () => moveClub(c.slug, type),
        `Could not ${type === 'promotion' ? 'promote' : 'relegate'} ${c.name}`,
      )
      setClubs((current) =>
        current?.map((club) =>
          club.slug === c.slug ? { ...club, division_id: result.divisionId } : club,
        ) ?? null,
      )
      setDivisionOf((current) => ({ ...current, [c.slug]: String(result.divisionId) }))
      setSeasonMovements(null)
      const [updatedStandings, updatedMovements] = await Promise.all([
        guard(getStandings, 'Could not refresh standings after the movement'),
        guard(getSeasonDivisionMovements, 'Could not refresh movement history after the movement'),
      ])
      setStandings(updatedStandings)
      setSeasonMovements(updatedMovements)
      setConfirmingMovement(null)
      report(
        'ok',
        `${type === 'promotion' ? 'Promoted' : 'Relegated'} ${c.name} from ${result.sourceDivisionName} to ${result.divisionName}.`,
      )
    } catch {
      /* already reported */
    } finally {
      setMovingClub(null)
    }
  }

  const edit = (c: Club) => {
    setCodes((s) => ({ ...s, [c.slug]: c.short_code ?? '' }))
    setStatuses((s) => ({ ...s, [c.slug]: c.status }))
    setDivisionOf((s) => ({ ...s, [c.slug]: c.division_id ? String(c.division_id) : '' }))
    setNewPlayer((s) => ({ ...s, [c.slug]: '' }))
    setConfirmingMovement(null)
    setEditing(c.slug)
  }

  const cancelEdit = (c: Club) => {
    setCodes((s) => ({ ...s, [c.slug]: c.short_code ?? '' }))
    setStatuses((s) => ({ ...s, [c.slug]: c.status }))
    setDivisionOf((s) => ({ ...s, [c.slug]: c.division_id ? String(c.division_id) : '' }))
    setNewPlayer((s) => ({ ...s, [c.slug]: '' }))
    setConfirmingMovement(null)
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
  const standingsByClub = new Map(standings.map((standing) => [standing.club_id, standing]))
  const activeSeasonMovements = (seasonMovements ?? []).filter(
    (movement) =>
      clubs.some(
        (club) =>
          club.id === movement.club_id && club.division_id === movement.destination_division_id,
      ),
  )
  const movementCompletedClubIds = new Set(
    activeSeasonMovements
      .filter((movement) => movement.movement_type !== 'transfer')
      .map((movement) => movement.club_id),
  )
  const completedMovementsByDivision = new Map<
    number,
    { promotion: number; relegation: number }
  >()
  for (const movement of activeSeasonMovements) {
    if (movement.movement_type === 'transfer') continue
    const counts = completedMovementsByDivision.get(movement.source_division_id) ?? {
      promotion: 0,
      relegation: 0,
    }
    counts[movement.movement_type] += 1
    completedMovementsByDivision.set(movement.source_division_id, counts)
  }
  const promotionCompletedFor = (division: Division) =>
    completedMovementsByDivision.get(division.id)?.promotion ?? 0
  const promotionTargetFor = (division: Division) => division.promotion_count ?? 0
  const relegationCompletedFor = (division: Division) =>
    completedMovementsByDivision.get(division.id)?.relegation ?? 0
  const relegationTargetFor = (division: Division) => {
    const configuredCount = division.relegation_count ?? 0
    return configuredCount > 0
      ? configuredCount
      : (division.promotion_count ?? 0) > 0
        ? 1
        : 0
  }
  const promotionCountFor = (division: Division) =>
    Math.max(0, promotionTargetFor(division) - promotionCompletedFor(division))
  const relegationCountFor = (division: Division) =>
    Math.max(0, relegationTargetFor(division) - relegationCompletedFor(division))
  /**
   * Each club's rank inside its own league, and how big that league is.
   *
   * Ranked from the league's club list rather than from standings rows alone.
   * A club can be entered in a league without a standings_snapshot row behind
   * it yet, and the previous code read that as "no position at all" — those
   * clubs still sort to the bottom of the list, so they looked like the
   * relegation zone while never being coloured for it. Ranking the list keeps
   * position and league size describing the same set of clubs, so the bottom
   * N is always the bottom N of what the admin is actually looking at.
   */
  const leagueRankByClubId = new Map<number, number>()
  const leagueSizeByDivisionId = new Map<number, number>()
  const rankedClubsByDivisionId = new Map<number, Club[]>()
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
    rankedClubsByDivisionId.set(division.id, ranked)
  }

  const clubMovement = (club: Club) => {
    if (!movementTracked) return { promotion: false, relegation: false }
    if (movementCompletedClubIds.has(club.id)) return { promotion: false, relegation: false }
    const division = divisions.find((item) => item.id === club.division_id)
    const position = leagueRankByClubId.get(club.id)
    if (!division || position === undefined) return { promotion: false, relegation: false }
    const divisionSize = leagueSizeByDivisionId.get(division.id) ?? 0
    const promotionCount = promotionCountFor(division)
    const relegationCount = relegationCountFor(division)
    const promotion = promotionCount > 0 && position <= promotionCount
    return {
      promotion,
      relegation: !promotion && relegationCount > 0 && position > divisionSize - relegationCount,
    }
  }
  const hasPromotionZones =
    movementTracked && divisions.some((division) => promotionCountFor(division) > 0)
  const hasRelegationZones =
    movementTracked && divisions.some((division) => relegationCountFor(division) > 0)
  const orderedDivisions = [...divisions].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
  /**
   * What the club editor's movement buttons would do, for one club.
   *
   * Both halves are resolved here so the buttons and the API cannot disagree:
   * the destination is the neighbouring division in league order, which is what
   * the server walks, and the blocking reason is stated instead of left for the
   * admin to work out from a disabled button.
   */
  const movementPlan = (club: Club) => {
    const ladder = orderedDivisions
    const source = ladder.find((division) => division.id === club.division_id) ?? null
    const index = source ? ladder.indexOf(source) : -1

    const describe = (type: ClubMovementType) => {
      if (!source) {
        return {
          type,
          destination: null,
          quota: 0,
          completed: 0,
          reason: 'Set this club’s league above before moving it up or down.',
        }
      }
      const destination =
        type === 'promotion'
          ? (index > 0 ? ladder[index - 1] : null)
          : (index >= 0 && index < ladder.length - 1 ? ladder[index + 1] : null)
      if (!destination) {
        return {
          type,
          destination: null,
          quota: 0,
          completed: 0,
          reason: `${source.name} is the ${
            type === 'promotion' ? 'highest' : 'lowest'
          } league; there is nothing ${type === 'promotion' ? 'above' : 'below'} it.`,
        }
      }
      const quota = type === 'promotion' ? promotionTargetFor(source) : relegationTargetFor(source)
      const completed = type === 'promotion' ? promotionCompletedFor(source) : relegationCompletedFor(source)
      if (quota < 1) {
        return {
          type,
          destination,
          quota,
          completed,
          reason: `No ${type} slots are configured for ${source.name}. Set a number under Clubs › Divisions.`,
        }
      }
      if (completed >= quota) {
        return {
          type,
          destination,
          quota,
          completed,
          reason: `All ${quota} ${type} slot${quota === 1 ? '' : 's'} for ${source.name} are used (${completed}/${quota}). Raise the limit under Clubs › Divisions, or use the league picker above to move without using a slot.`,
        }
      }
      return { type, destination, quota, completed, reason: null }
    }

    return { source, promotion: describe('promotion'), relegation: describe('relegation') }
  }

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

  /**
   * Which way the rollover will move the selection.
   *
   * Read off the selection rather than chosen: clubs sitting in the promotion
   * zone are obviously going up, and the rest are obviously coming down. A
   * plain computation, not a memo — it walks a handful of clubs, and a hook
   * here would sit below the loading return and tear the page down the moment
   * the data arrived.
   */
  const bulkDirection: ClubMovementType =
    selectedClubs.length > 0 && selectedClubs.every((club) => clubMovement(club).promotion)
      ? 'promotion'
      : 'relegation'

  /** The season to return to: the most recently created one that is not current. */
  const previousSeason =
    [...seasons].filter((season) => !Boolean(season.is_current)).sort((a, b) => b.id - a.id)[0] ??
    null
  const createdSeasonName = previousSeason?.name ?? 'The newer season'
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
   * Whether a bulk promote/relegate can run, and why not when it cannot.
   *
   * A movement spends a season slot out of one league, so a bulk move has to
   * come from a single league and fit inside what that league has left. The
   * server enforces both of these per call regardless; this is here so the bar
   * says so up front instead of stalling halfway through and leaving the admin
   * to work out which half succeeded.
   */
  const planBulkRelocate = (
    type: ClubMovementType,
  ): {
    source: Division
    neighbour: Division
    type: ClubMovementType
    neighbourType: ClubMovementType
    inbound: Club[]
  } | null => {
    if (selectedCount === 0) return null
    const sources = new Set(selectedClubs.map((club) => getDivisionId(club)))
    if (sources.size !== 1) return null
    const source = orderedDivisions.find((division) => String(division.id) === [...sources][0])
    if (!source) return null
    const index = orderedDivisions.indexOf(source)
    const neighbour =
      type === 'promotion' ? orderedDivisions[index - 1] : orderedDivisions[index + 1]
    if (!neighbour) return null
    // The club going the other way. Relegating out of a league leaves the one
    // below it a club too many, so the counterpart is taken from that league's
    // promotion zone — the clubs its own rules already nominate.
    const neighbourType: ClubMovementType = type === 'promotion' ? 'relegation' : 'promotion'
    const ranked = rankedClubsByDivisionId.get(neighbour.id) ?? []
    const inbound =
      neighbourType === 'promotion' ? ranked.slice(0, selectedCount) : ranked.slice(-selectedCount)
    return { source, neighbour, type, neighbourType, inbound }
  }

  /**
   * Whether a bulk relocate can run, and why not when it cannot.
   *
   * A relocation moves twice: the selected clubs travel one way, and an equal
   * number come back the other so both leagues keep the size their rules say
   * they should have. That second half is spending slots too, so both quotas
   * are checked before anything is sent.
   */
  const bulkMoveBlock = (type: ClubMovementType): string | null => {
    if (readOnly) return 'This season is read-only.'
    if (selectedCount === 0) return 'Select at least one club.'
    const sources = new Set(selectedClubs.map((club) => getDivisionId(club)))
    if (sources.size !== 1) {
      return 'Select clubs from one league only — a move spends that league’s slots.'
    }
    const source = orderedDivisions.find((division) => String(division.id) === [...sources][0])
    if (!source) return 'Those clubs are not in a league yet. Set their league first.'
    const outboundPlan = movementPlan(selectedClubs[0])[type]
    if (!outboundPlan.destination) {
      return `${source.name} is the ${type === 'promotion' ? 'highest' : 'lowest'} league; there is nothing ${type === 'promotion' ? 'above' : 'below'} it to swap with.`
    }
    const plan = planBulkRelocate(type)
    if (!plan) {
      return `${source.name} has no neighbouring league to take the place in return.`
    }
    if (plan.inbound.length < selectedCount) {
      return `${plan.neighbour.name} can only send ${plan.inbound.length} club${plan.inbound.length === 1 ? '' : 's'} the other way, so the leagues would not stay the same size.`
    }
    const outboundRemaining = Math.max(0, outboundPlan.quota - outboundPlan.completed)
    if (outboundRemaining < selectedCount) {
      return `Only ${outboundRemaining} ${type} slot${outboundRemaining === 1 ? '' : 's'} left for ${source.name}, but ${selectedCount} club${selectedCount === 1 ? '' : 's'} are selected.`
    }
    const inboundPlan = movementPlan(plan.inbound[0])[plan.neighbourType]
    const inboundRemaining = Math.max(0, inboundPlan.quota - inboundPlan.completed)
    if (inboundRemaining < selectedCount) {
      return `${plan.neighbour.name} has ${inboundRemaining} ${plan.neighbourType} slot${inboundRemaining === 1 ? '' : 's'} left, so it can only send ${inboundRemaining} club${inboundRemaining === 1 ? '' : 's'} back.`
    }
    return null
  }

  /**
   * Why Complete season cannot run as things stand, if it cannot.
   *
   * Stated on the button rather than left to a failed confirm: a selection
   * spread across two leagues, or one bigger than the slots left, is a problem
   * the admin can see before committing.
   */
  const rolloverHint: string | null =
    selectedCount > 0
      ? bulkMoveBlock(bulkDirection)
      : null

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

  /**
   * Finish the season: apply the queued movement, then start the next one.
   *
   * One action because the order matters and neither half is useful alone. A
   * new season is copied from the leagues as they stand, so any promotion or
   * relegation has to be committed first or the new season would start from
   * the standings the movement was meant to replace.
   */
  const completeSeason = async (name: string, year: number) => {
    const plan = planBulkRelocate(bulkDirection)
    const blocked = plan ? bulkMoveBlock(bulkDirection) : selectedCount > 0
      ? bulkMoveBlock(bulkDirection)
      : null
    if (blocked) {
      report('error', blocked)
      return
    }
    setSeasonBusy(true)
    try {
      const failed: string[] = []
      if (plan) {
        for (const club of selectedClubs) {
          try {
            await moveClub(club.slug, plan.type).then(() => undefined)
          } catch {
            failed.push(club.name)
          }
        }
        for (const club of plan.inbound) {
          try {
            await moveClub(club.slug, plan.neighbourType).then(() => undefined)
          } catch {
            failed.push(club.name)
          }
        }
      }
      const created = await guard(() => createSeason(name, year), 'Could not start the new season')
      setSeasons((current) =>
        [
          ...current.map((season) => ({ ...season, is_current: false })),
          created.season,
        ].sort(
          (a, b) => Number(Boolean(b.is_current)) - Number(Boolean(a.is_current)) || b.year - a.year,
        ),
      )
      clearSelection()
      closeCompleteSeason()
      setSeasonId(String(created.season.id))
      report(
        failed.length === 0 ? 'ok' : 'error',
        failed.length === 0
          ? `${created.season.name} started. ${created.divisions.length} league${
              created.divisions.length === 1 ? '' : 's'
            } carried over with the new league places.`
          : `${created.season.name} started, but these clubs did not move: ${failed.join(', ')}.`,
      )
    } catch {
      /* already reported */
    } finally {
      setSeasonBusy(false)
    }
  }

  /**
   * Undo a rollover by putting the previous season back in charge.
   *
   * Seasons are retained rather than replaced, so this only moves the
   * is_current flag. The season that was rolled into is still there and can be
   * re-activated from the list, which makes this safe to offer.
   */
  const undoSeasonRollover = async () => {
    if (!previousSeason) return
    setSeasonBusy(true)
    try {
      const restored = await guard(
        () => setCurrentSeason(previousSeason.id),
        'Could not switch back to the previous season',
      )
      setSeasons((current) =>
        current.map((season) => ({
          ...season,
          is_current: season.id === restored.id,
        })),
      )
      clearSelection()
      setSeasonId(String(restored.id))
      report('ok', `${restored.name} is current again. ${createdSeasonName} is still on record.`)
    } catch {
      /* already reported */
    } finally {
      setSeasonBusy(false)
    }
  }

  const clubGroups = [
    ...divisions.map((division) => ({
      id: String(division.id),
      divisionId: division.id,
      name: division.name,
      movementProgress: {
        promotionTarget: promotionTargetFor(division),
        promotionCompleted: promotionCompletedFor(division),
        relegationTarget: relegationTargetFor(division),
        relegationCompleted: relegationCompletedFor(division),
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
      movementProgress: null,
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
          aria-selected={section === 'applications'}
          onClick={() => setSection('applications')}
        >
          Applications
          {pendingApplicationCount > 0 && (
            <span className="club-subnav-badge" aria-label={`${pendingApplicationCount} waiting`}>
              {pendingApplicationCount > 99 ? '99+' : pendingApplicationCount}
            </span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={section === 'divisions'}
          onClick={() => setSection('divisions')}
        >
          Divisions
        </button>
      </div>
      {section === 'applications' ? (
        <Applications
          guard={guard}
          report={report}
          onPendingCountChange={onPendingCountChange}
        />
      ) : section === 'divisions' ? (
        <Divisions
          guard={guard}
          report={report}
          onDivisionsChanged={(nextDivisions) => setDivisions(nextDivisions)}
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
              setConfirmingMovement(null)
              setSeasonId(nextSeasonId)
            }}
            onCurrentSeasonChanged={(nextSeasonId) => {
              setEditing(null)
              setSquadSlug(null)
              setConfirmingMovement(null)
              setSeasonId(String(nextSeasonId))
            }}
            onCompleteSeason={openCompleteSeason}
            onUndoSeason={() => void undoSeasonRollover()}
            seasonBusy={seasonBusy}
            canUndo={previousSeason !== null}
            previousSeasonName={previousSeason?.name ?? null}
            rolloverHint={rolloverHint}
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
                  Colors mark remaining movement slots. Reassigning a club completes its move this
                  season; new seasons start fresh.
                </span>
              </div>
            )}
            {seasonMovements === null && !readOnly && (
              <p className="club-movement-warning" role="status">
                Movement progress could not be loaded, so zone colors are hidden. Refresh the page
                before making league changes.
              </p>
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
                    {movementTracked &&
                      group.movementProgress &&
                      group.movementProgress.promotionTarget > 0 && (
                      <span className="club-movement-progress">
                        {group.movementProgress.promotionCompleted}/
                        {group.movementProgress.promotionTarget} promoted
                      </span>
                    )}
                    {movementTracked &&
                      group.movementProgress &&
                      group.movementProgress.relegationTarget > 0 && (
                      <span className="club-movement-progress">
                        {group.movementProgress.relegationCompleted}/
                        {group.movementProgress.relegationTarget} relegated
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
                        const movement = clubMovement(c)
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
                      ...divisions.map((division) => ({
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
          {seasonCompleteOpen && (
            <div
              className="squad-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !seasonBusy) closeCompleteSeason()
              }}
            >
              <form
                className="squad-modal season-rollover-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="season-rollover-title"
                onSubmit={(event) => {
                  event.preventDefault()
                  void completeSeason(nextSeasonName.trim(), Number(nextSeasonYear))
                }}
              >
                <header>
                  <div>
                    <p className="eyebrow">END OF SEASON</p>
                    <h2 id="season-rollover-title">Complete {selectedSeason?.name}</h2>
                    <p className="club-edit-subtitle">
                      One action: the movement below is committed first, then the new season
                      starts from the leagues as they stand afterwards.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Close"
                    disabled={seasonBusy}
                    onClick={closeCompleteSeason}
                  >
                    ×
                  </button>
                </header>
                <div className="club-edit-content">
                  <div className="season-rollover-moves">
                    {confirmRelocate ? (
                      <>
                        <div className="season-rollover-leg">
                          <strong>
                            {confirmRelocate.source.name} → {confirmRelocate.neighbour.name}
                          </strong>
                          <ul>
                            {selectedClubs.map((club) => (
                              <li key={club.slug}>{club.name}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="season-rollover-leg">
                          <strong>
                            {confirmRelocate.neighbour.name} → {confirmRelocate.source.name}
                          </strong>
                          <ul>
                            {confirmRelocate.inbound.map((club) => (
                              <li key={club.slug}>{club.name}</li>
                            ))}
                          </ul>
                          <span className="season-rollover-note">
                            Taken automatically so both leagues keep the size their movement rules
                            say they should have.
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="season-rollover-none">
                        No clubs selected, so nothing will move. The new season starts from the
                        leagues exactly as they are now.
                      </p>
                    )}
                  </div>
                  <div className="season-create-form">
                    <label>
                      <span>New season name</span>
                      <input
                        className="text"
                        value={nextSeasonName}
                        onChange={(event) => setNextSeasonName(event.target.value)}
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
                        value={nextSeasonYear}
                        onChange={(event) => setNextSeasonYear(event.target.value)}
                        required
                      />
                    </label>
                  </div>
                </div>
                <footer className="club-edit-footer">
                  <p className="fixture-summary">
                    Past seasons are kept, so this can be undone by switching the current season
                    back — nothing is deleted.
                  </p>
                  <button
                    type="button"
                    className="btn"
                    disabled={seasonBusy}
                    onClick={closeCompleteSeason}
                  >
                    Cancel
                  </button>
                  <button className="btn primary" type="submit" disabled={seasonBusy}>
                    {seasonBusy ? 'Starting…' : 'Confirm and start new season'}
                  </button>
                </footer>
              </form>
            </div>
          )}
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
                {activeClub.logo_local && <img src={activeClub.logo_local} alt="" />}
                <div>
                  <p className="eyebrow">CLUB MANAGEMENT</p>
                  <h2 id="club-edit-title">Edit {activeClub.name}</h2>
                  <p className="club-edit-subtitle">Update details and manage the squad.</p>
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
              <div className="club-edit-fields">
                <label>
                  <span>Short code</span>
                  <input
                    className="text"
                    maxLength={12}
                    autoFocus
                    aria-label={`Short code for ${activeClub.name}`}
                    value={codes[activeClub.slug] ?? ''}
                    onChange={(event) =>
                      setCodes((current) => ({
                        ...current,
                        [activeClub.slug]: event.target.value,
                      }))
                    }
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
                const plan = movementPlan(activeClub)
                const confirming = confirmingMovement?.slug === activeClub.slug ? confirmingMovement : null
                const movingThis = movingClub?.slug === activeClub.slug ? movingClub : null
                const inactive = statuses[activeClub.slug] !== 'active'
                return (
                  <>
                    <section className="club-edit-section" aria-labelledby="club-league-title">
                      <div className="club-edit-section-heading">
                        <h3 id="club-league-title">League</h3>
                        <p>
                          Put the club in any league you like. This is a plain move and never uses a
                          promotion or relegation slot, so the season&rsquo;s numbers stay untouched.
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
                              ...divisions.map((division) => ({
                                value: String(division.id),
                                label: division.name,
                              })),
                            ]}
                          />
                        </label>
                      </div>
                      <p className="club-edit-current">
                        Currently in <strong>{plan.source?.name ?? 'no league'}</strong>. Saving sends
                        the club straight to whatever is picked above.
                      </p>
                    </section>
                    <section className="club-edit-section" aria-labelledby="club-movement-title">
                      <div className="club-edit-section-heading">
                        <h3 id="club-movement-title">Promotion &amp; relegation</h3>
                        <p>
                          Send the club one league up or down the ladder. Unlike the picker above this
                          spends one of the current league&rsquo;s slots for the season, which is what
                          fills the coloured zones on the league list.
                        </p>
                      </div>
                      {inactive && (
                        <p className="club-edit-blocked" role="status">
                          Set the club&rsquo;s status to Active before moving it between leagues.
                        </p>
                      )}
                      <div className="club-movement-options">
                        {[plan.promotion, plan.relegation].map((option) => {
                          const isConfirming = confirming?.type === option.type
                          const blocked = inactive || !option.destination || option.reason !== null
                          const summary =
                            option.reason ??
                            (option.destination
                              ? `Moves to ${option.destination.name} \u00b7 uses slot ${option.completed + 1} of ${option.quota} for ${plan.source?.name ?? 'this league'}.`
                              : '')
                          return (
                            <div className={`club-movement-option ${option.type}`} key={option.type}>
                              <div className="club-movement-option-copy">
                                <span className="club-movement-arrow" aria-hidden="true">
                                  {option.type === 'promotion' ? '\u25b2' : '\u25bc'}
                                </span>
                                <div>
                                  <strong>
                                    {option.type === 'promotion' ? 'Promote' : 'Relegate'}
                                  </strong>
                                  <span>{summary}</span>
                                </div>
                              </div>
                              {isConfirming ? (
                                <div className="club-movement-confirm" role="group" aria-label={`Confirm ${option.type} for ${activeClub.name}`}>
                                  <p>
                                    Move <strong>{activeClub.name}</strong> from{' '}
                                    <strong>{plan.source?.name}</strong> to{' '}
                                    <strong>{option.destination?.name}</strong>? It starts the new
                                    league on 0 points.
                                  </p>
                                  <div className="club-movement-confirm-actions">
                                    <button
                                      type="button"
                                      className="btn sm"
                                      disabled={movingThis !== null}
                                      onClick={() => setConfirmingMovement(null)}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      className={`btn sm primary ${option.type}`}
                                      disabled={movingThis !== null}
                                      onClick={() => void move(activeClub, option.type)}
                                    >
                                      {movingThis?.type === option.type
                                        ? option.type === 'promotion'
                                          ? 'Promoting\u2026'
                                          : 'Relegating\u2026'
                                        : option.type === 'promotion'
                                          ? 'Confirm promotion'
                                          : 'Confirm relegation'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className={`btn sm ${option.type}`}
                                  disabled={blocked || movingThis !== null}
                                  title={inactive ? undefined : (option.reason ?? undefined)}
                                  onClick={() =>
                                    setConfirmingMovement({ slug: activeClub.slug, type: option.type })
                                  }
                                >
                                  {option.type === 'promotion' ? 'Promote \u2191' : 'Relegate \u2193'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
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