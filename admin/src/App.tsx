import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
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
  moveClub,
  recordSeasonDivisionMovement,
  resetSeasonDivisionMovements,
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
type ClubSection = 'clubs' | 'preview' | 'applications' | 'divisions'

interface Notice {
  kind: 'ok' | 'error' | 'info'
  text: string
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
        : savedSection === 'preview'
          ? 'preview'
          : 'clubs'
  })
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pendingApplicationCount, setPendingApplicationCount] = useState(0)
  const pageTitle: Record<Tab, string> = {
    results: 'Match centre',
    standings: 'League table',
    clubs: 'Club management',
  }

  const report = useCallback((kind: Notice['kind'], text: string) => setNotice({ kind, text }), [])

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

          {notice && (
            <div className={`notice ${notice.kind}`} role="status">
              <span>{notice.text}</span>
              <button className="btn sm" onClick={() => setNotice(null)}>Dismiss</button>
            </div>
          )}

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
  const [clubs, setClubs] = useState<Club[]>([])
  const [fixtureClubs, setFixtureClubs] = useState<Club[]>([])
  const [fixtureDivisions, setFixtureDivisions] = useState<Division[]>([])
  const [fixtureSeasons, setFixtureSeasons] = useState<AdminSeason[]>([])
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
    getClubs().then(setClubs).catch((err) => {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)
      report('error', `Could not load clubs for match scheduling: ${message}`)
    })
  }, [report])

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
      {scheduleTarget !== null && (
        <div
          className="squad-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !scheduleBusy) setScheduleTarget(null)
          }}
        >
          {scheduleTarget === 'new' ? (
            <form
              className="squad-modal fixture-modal"
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
                      ? `Choose a division, then select two clubs from ${fixtureSeasons.find((season) => String(season.id) === createSeasonId)?.name ?? 'the selected season'}.`
                      : 'Choose a season to load its clubs and divisions.'}
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
                <div className="club-edit-fields">
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
                    <span>Division</span>
                    <CustomSelect
                      ariaLabel="Fixture division"
                      value={createDivisionId}
                      disabled={!createSeasonId || fixtureDivisions.length === 0}
                      options={[
                        { value: '', label: 'Choose division' },
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
                  <div className="fixture-clubs-pair">
                    <label>
                      <span>Home club</span>
                      <CustomSelect
                        ariaLabel="Home club"
                        value={createHome}
                        disabled={!createDivisionId}
                        options={[
                          { value: '', label: 'Choose home club' },
                          ...divisionClubs.map((club) => ({
                            value: club.slug,
                            label: club.name,
                          })),
                        ]}
                        onChange={(value) => {
                          setCreateHome(value)
                          setCreateAway('')
                        }}
                      />
                    </label>
                    <label>
                      <span>Away club</span>
                      <CustomSelect
                        ariaLabel="Away club"
                        disabled={!createHome || awayOptions.length === 0}
                        value={createAway}
                        options={[
                          { value: '', label: 'Choose away club' },
                          ...awayOptions.map((club) => ({ value: club.slug, label: club.name })),
                        ]}
                        onChange={setCreateAway}
                      />
                    </label>
                  </div>
                  <label>
                    <span>Kickoff date &amp; time <small>(Kuala Lumpur, UTC+8)</small></span>
                    <input
                      className="text"
                      type="datetime-local"
                      value={createKickoff}
                      onChange={(event) => setCreateKickoff(event.target.value)}
                    />
                  </label>
                </div>
                <p className="fixture-note">
                  You can leave kickoff blank and schedule the fixture later. It will appear in
                  <strong> Needs scheduling</strong>.
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
                <button
                  className="btn primary"
                  disabled={scheduleBusy || !createSeasonId || !createDivisionId || !createHome || !createAway}
                >
                  {scheduleBusy ? 'Creating…' : 'Create fixture'}
                </button>
              </footer>
            </form>
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
  onDivisionSaved,
  onCurrentSeasonChanged,
  onSeasonChanged,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
  onDivisionSaved: (division: Division) => void
  onCurrentSeasonChanged: (divisions: Division[]) => void
  onSeasonChanged: () => void
}) {
  const [divisions, setDivisions] = useState<Division[] | null>(null)
  const [seasons, setSeasons] = useState<AdminSeason[] | null>(null)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [editingSeasonId, setEditingSeasonId] = useState<number | null>(null)
  const [seasonName, setSeasonName] = useState('')
  const [showNewSeason, setShowNewSeason] = useState(false)
  const [newSeasonName, setNewSeasonName] = useState('')
  const [newSeasonYear, setNewSeasonYear] = useState(String(new Date().getFullYear()))
  const [name, setName] = useState('')
  const [promotionCount, setPromotionCount] = useState('0')
  const [relegationCount, setRelegationCount] = useState('0')
  const [busy, setBusy] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [seasonBusy, setSeasonBusy] = useState(false)
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

  const saveSeasonName = async (event: FormEvent<HTMLFormElement>, season: AdminSeason) => {
    event.preventDefault()
    setSeasonBusy(true)
    try {
      const updated = await guard(
        () => updateSeason(season.id, seasonName.trim()),
        'Could not update season name',
      )
      setSeasons((current) =>
        (current ?? []).map((item) => item.id === updated.id ? updated : item),
      )
      if (Boolean(updated.is_current)) {
        const updatedDivisions = divisions.map((division) => ({ ...division, season: updated.name }))
        setDivisions(updatedDivisions)
        onCurrentSeasonChanged(updatedDivisions)
        onSeasonChanged()
      }
      setEditingSeasonId(null)
      report('ok', `${updated.name} saved.`)
    } catch {
      /* already reported */
    } finally {
      setSeasonBusy(false)
    }
  }

  const activateSeason = async (season: AdminSeason) => {
    setSeasonBusy(true)
    try {
      const activated = await guard(
        () => setCurrentSeason(season.id),
        'Could not activate season',
      )
      const currentDivisions = await guard(getDivisions, 'Could not load the selected season divisions')
      setSeasons((current) =>
        (current ?? []).map((item) => ({ ...item, is_current: item.id === activated.id })),
      )
      setDivisions(currentDivisions)
      setFeaturedDivisionId(String(activated.featured_division_id ?? ''))
      onCurrentSeasonChanged(currentDivisions)
      onSeasonChanged()
      setEditing(null)
      setEditingSeasonId(null)
      report('ok', `${activated.name} is now the current season.`)
    } catch {
      /* already reported */
    } finally {
      setSeasonBusy(false)
    }
  }

  const addSeason = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSeasonBusy(true)
    try {
      const created = await guard(
        () => createSeason(newSeasonName.trim(), Number(newSeasonYear)),
        'Could not create season',
      )
      const copiedDivisions = created.divisions.map((division) => ({
        ...division,
        season: created.season.name,
      }))
      setSeasons((current) => [
        ...(current ?? []).map((season) => ({ ...season, is_current: false })),
        created.season,
      ].sort((a, b) => Number(Boolean(b.is_current)) - Number(Boolean(a.is_current)) || b.year - a.year))
      setDivisions(copiedDivisions)
      setFeaturedDivisionId(String(created.season.featured_division_id ?? ''))
      onCurrentSeasonChanged(copiedDivisions)
      onSeasonChanged()
      setNewSeasonName('')
      setShowNewSeason(false)
      report('ok', `${created.season.name} created and activated with copied divisions and club entries.`)
    } catch {
      /* already reported */
    } finally {
      setSeasonBusy(false)
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
      setDivisions((current) => {
        const rows = current ?? []
        return editId === 'new'
          ? [...rows, division].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
          : rows.map((item) => item.id === division.id ? division : item)
            .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      })
      onDivisionSaved(division)
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
      <div className="card season-management">
        <header>
          <div>
            <h2>Season management</h2>
            <p className="hint">Rename seasons, preserve past tables, or switch the active season.</p>
          </div>
          <button
            className="btn primary sm"
            type="button"
            disabled={seasonBusy}
            onClick={() => {
              const year = Math.max(new Date().getFullYear(), ...seasons.map((season) => season.year))
              setNewSeasonYear(String(year))
              setNewSeasonName(`${year} Season 1`)
              setEditingSeasonId(null)
              setShowNewSeason((shown) => !shown)
            }}
          >
            ＋ New season
          </button>
        </header>
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
                disabled={seasonBusy}
                onClick={() => setShowNewSeason(false)}
              >
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={seasonBusy}>
                {seasonBusy ? 'Creating…' : 'Create and activate'}
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
                  <button className="btn sm primary" type="submit" disabled={seasonBusy}>
                    Save name
                  </button>
                  <button
                    className="btn sm"
                    type="button"
                    disabled={seasonBusy}
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
                      disabled={seasonBusy}
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
                        disabled={seasonBusy}
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
            disabled={editing !== null || reordering || seasonBusy}
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
  const [backfillTarget, setBackfillTarget] = useState<{
    divisionId: number
    type: 'promotion' | 'relegation'
  } | null>(null)
  const [backfillClubSlug, setBackfillClubSlug] = useState('')
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

  const load = useCallback(async () => {
    const [data, currentDivisions, currentStandings, currentMovements] = await Promise.all([
      guard(getClubs, 'Could not load clubs'),
      guard(getDivisions, 'Could not load leagues'),
      guard(getStandings, 'Could not load current standings').catch(() => []),
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
    load().catch(() => setClubs([]))
  }, [load])

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

  if (clubs === null) return <div className="loading">Loading clubs…</div>

  const save = async (c: Club) => {
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
      if (chosen && chosen !== (c.division_id ? String(c.division_id) : '')) {
        const res = await guard(
          () => assignDivision(c.slug, Number(chosen)),
          `Could not assign ${c.name} to the division`,
        )
        setClubs((current) =>
          current?.map((club) =>
            club.slug === c.slug
                ? { ...club, division_id: Number(chosen) }
                : club,
          ) ?? null,
        )
        setSeasonMovements(null)
        const [updatedStandings, updatedMovements] = await Promise.all([
          guard(getStandings, 'Could not refresh standings after changing the league'),
          guard(
            getSeasonDivisionMovements,
            'Could not refresh movement history after changing the league',
          ),
        ])
        setStandings(updatedStandings)
        setSeasonMovements(updatedMovements)
        report('ok', `Saved ${c.name} and entered it into ${res.divisionName}. No movement slot used.`)
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

  const recordPreviousMovement = async (source: Division, slug: string) => {
    setBusy(`movement-${source.id}-${slug}`)
    try {
      const movement = await guard(
        () => recordSeasonDivisionMovement(slug, source.id),
        'Could not record the completed movement',
      )
      setBackfillTarget(null)
      setBackfillClubSlug('')
      setSeasonMovements(null)
      const updatedMovements = await guard(
        getSeasonDivisionMovements,
        'Could not refresh movement history',
      )
      setSeasonMovements(updatedMovements)
      const movedClub = clubs?.find((club) => club.slug === slug)
      report(
        'ok',
        `Recorded ${movedClub?.name ?? slug} as an already completed ${movement.movement_type}.`,
      )
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  const resetMovementProgress = async () => {
    if (
      !window.confirm(
        'Reset this season’s promotion/relegation progress? This clears movement records only and will not change any club’s current league.',
      )
    ) {
      return
    }
    setBusy('reset-movements')
    try {
      const result = await guard(
        resetSeasonDivisionMovements,
        'Could not reset this season’s movement progress',
      )
      setSeasonMovements([])
      report('ok', `Reset movement progress (${result.cleared} record${result.cleared === 1 ? '' : 's'} cleared).`)
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
  const standingsCountByDivision = new Map<string, number>()
  for (const standing of standings) {
    standingsCountByDivision.set(
      standing.division_slug,
      (standingsCountByDivision.get(standing.division_slug) ?? 0) + 1,
    )
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
  const clubMovement = (club: Club) => {
    if (seasonMovements === null) return { promotion: false, relegation: false }
    if (movementCompletedClubIds.has(club.id)) return { promotion: false, relegation: false }
    const standing = standingsByClub.get(club.id)
    const division = divisions.find((item) => item.id === club.division_id)
    if (!standing || !division) return { promotion: false, relegation: false }
    const divisionSize = standingsCountByDivision.get(division.slug) ?? 0
    const promotionCount = promotionCountFor(division)
    const relegationCount = relegationCountFor(division)
    const promotion = promotionCount > 0 && standing.position <= promotionCount
    return {
      promotion,
      relegation:
        !promotion && relegationCount > 0 && standing.position > divisionSize - relegationCount,
    }
  }
  const hasPromotionZones =
    seasonMovements !== null && divisions.some((division) => promotionCountFor(division) > 0)
  const hasRelegationZones =
    seasonMovements !== null && divisions.some((division) => relegationCountFor(division) > 0)
  const backfillCandidatesFor = (
    sourceDivisionId: number,
    type: 'promotion' | 'relegation',
  ) => {
    const sourceDivision = divisions.find((division) => division.id === sourceDivisionId)
    if (!sourceDivision || seasonMovements === null) return []
    return clubs
      .filter((club) => {
        const destination = divisions.find((division) => division.id === club.division_id)
        if (!destination || destination.id === sourceDivisionId) return false
        if (
          activeSeasonMovements.some(
            (movement) =>
              movement.club_id === club.id &&
              movement.source_division_id === sourceDivisionId,
          )
        ) {
          return false
        }
        return type === 'promotion'
          ? destination.sort_order < sourceDivision.sort_order
          : destination.sort_order > sourceDivision.sort_order
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
      )
  }
  const projectedMoves = new Map<
    number,
    {
      club: Club
      source: Division
      destination: Division
      type: 'promotion' | 'relegation'
      sourcePosition: number
      completed: boolean
    }
  >()
  for (const movement of activeSeasonMovements) {
    if (movement.movement_type === 'transfer') continue
    const club = clubs.find((item) => item.id === movement.club_id)
    const source = divisions.find((item) => item.id === movement.source_division_id)
    const destination = divisions.find((item) => item.id === movement.destination_division_id)
    if (!club || !source || !destination || club.division_id !== destination.id) continue
    projectedMoves.set(club.id, {
      club,
      source,
      destination,
      type: movement.movement_type,
      sourcePosition:
        movement.source_position ?? standingsByClub.get(club.id)?.position ?? Number.MAX_SAFE_INTEGER,
      completed: true,
    })
  }
  const orderedDivisions = [...divisions].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
  for (const [index, source] of orderedDivisions.entries()) {
    const sourceClubs = clubs
      .filter((club) => club.division_id === source.id)
      .sort((a, b) => {
        const positionA = standingsByClub.get(a.id)?.position ?? Number.POSITIVE_INFINITY
        const positionB = standingsByClub.get(b.id)?.position ?? Number.POSITIVE_INFINITY
        return positionA - positionB || a.name.localeCompare(b.name)
      })
    const promotionTarget = promotionTargetFor(source)
    const completedPromotions = promotionCompletedFor(source)
    const promotionDestination = orderedDivisions[index - 1]
    const promotionsToProject = Math.max(0, promotionTarget - completedPromotions)
    if (promotionDestination && promotionsToProject > 0) {
      const candidates = sourceClubs.filter((club) => !projectedMoves.has(club.id))
      for (const club of candidates.slice(0, promotionsToProject)) {
        projectedMoves.set(club.id, {
          club,
          source,
          destination: promotionDestination,
          type: 'promotion',
          sourcePosition: standingsByClub.get(club.id)?.position ?? Number.MAX_SAFE_INTEGER,
          completed: false,
        })
      }
    }
    const relegationTarget = relegationTargetFor(source)
    const completedRelegations = relegationCompletedFor(source)
    const relegationDestination = orderedDivisions[index + 1]
    const relegationsToProject = Math.max(0, relegationTarget - completedRelegations)
    if (relegationDestination && relegationsToProject > 0) {
      const candidates = sourceClubs.filter((club) => !projectedMoves.has(club.id))
      for (const club of candidates.slice(-relegationsToProject)) {
        projectedMoves.set(club.id, {
          club,
          source,
          destination: relegationDestination,
          type: 'relegation',
          sourcePosition: standingsByClub.get(club.id)?.position ?? Number.MAX_SAFE_INTEGER,
          completed: false,
        })
      }
    }
  }
  const projectedTables = orderedDivisions.map((division) => {
    const returning = clubs
      .filter((club) => club.division_id === division.id && !projectedMoves.has(club.id))
      .sort((a, b) => {
        const positionA = standingsByClub.get(a.id)?.position ?? Number.POSITIVE_INFINITY
        const positionB = standingsByClub.get(b.id)?.position ?? Number.POSITIVE_INFINITY
        return positionA - positionB || a.name.localeCompare(b.name)
      })
    const incoming = [...projectedMoves.values()]
      .filter((move) => move.destination.id === division.id)
      .sort(
        (a, b) =>
          a.source.sort_order - b.source.sort_order ||
          a.sourcePosition - b.sourcePosition ||
          a.club.name.localeCompare(b.club.name),
      )
    return { division, clubs: [...returning, ...incoming.map((move) => move.club)], incoming }
  })
  const projectedPromotionCount = [...projectedMoves.values()].filter(
    (move) => move.type === 'promotion',
  ).length
  const projectedRelegationCount = [...projectedMoves.values()].filter(
    (move) => move.type === 'relegation',
  ).length

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
      name: 'Not assigned to a league',
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
          aria-selected={section === 'preview'}
          onClick={() => setSection('preview')}
        >
          Next season preview
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
      ) : section === 'preview' ? (
        <section className="season-preview">
          <header className="season-preview-heading">
            <div>
              <span className="season-preview-eyebrow">Season planning · {divisions[0]?.season ?? 'Current season'}</span>
              <h2>Next season table preview</h2>
              <p>
                A projection from the current standings and each league&rsquo;s movement rules.
                Returning clubs keep their order; projected arrivals are appended. Nothing is changed.
              </p>
            </div>
            <button
              className="btn sm"
              type="button"
              disabled={busy !== null || seasonMovements === null || seasonMovements.length === 0}
              onClick={() => void resetMovementProgress()}
            >
              Reset movement progress
            </button>
          </header>
          <div className="season-preview-summary">
            <div>
              <strong>{projectedTables.reduce((count, table) => count + table.clubs.length, 0)}</strong>
              <span>projected clubs</span>
            </div>
            <div className="promotion">
              <strong>{projectedPromotionCount}</strong>
              <span>promotions</span>
            </div>
            <div className="relegation">
              <strong>{projectedRelegationCount}</strong>
              <span>relegations</span>
            </div>
            <p>Next season starts with zero played, won, drawn, lost, and points.</p>
          </div>
          {seasonMovements === null && (
            <p className="season-preview-warning">
              Movement history could not be loaded. This view is showing configured movement rules
              only; completed moves may not be reflected.
            </p>
          )}
          {projectedTables.length === 0 ? (
            <div className="season-preview-empty">
              <strong>No league tables to preview yet</strong>
              <span>Create the next season&rsquo;s divisions in League setup when you are ready.</span>
            </div>
          ) : (
            <div className="season-preview-grid">
              {projectedTables.map(({ division, clubs: projectedClubs, incoming }) => {
                const incomingByClubId = new Map(incoming.map((move) => [move.club.id, move]))
                return (
                  <article className="season-preview-league" key={division.id}>
                    <header>
                      <div>
                        <h3>{division.name}</h3>
                        <span>{projectedClubs.length} projected clubs</span>
                      </div>
                      <div className="season-preview-rules">
                        {division.promotion_count ? <span>{division.promotion_count} up</span> : null}
                        {relegationTargetFor(division) > 0 ? (
                          <span>{relegationTargetFor(division)} down</span>
                        ) : null}
                      </div>
                    </header>
                    {projectedClubs.length === 0 ? (
                      <p className="season-preview-empty-league">No clubs in this projected table.</p>
                    ) : (
                      <ol>
                        {projectedClubs.map((club, index) => {
                          const movement = incomingByClubId.get(club.id)
                          return (
                            <li
                              className={movement ? `incoming ${movement.type}` : ''}
                              key={club.id}
                            >
                              <span className="season-preview-position">{index + 1}</span>
                              {club.logo_local ? <img src={club.logo_local} alt="" /> : null}
                              {club.flag ? <span>{club.flag}</span> : null}
                              <span className="season-preview-club-name">{club.name}</span>
                              {movement ? (
                                <span className="season-preview-movement">
                                  {movement.completed ? 'Moved' : 'Projected'} {movement.type}
                                  <small>from {movement.source.name}</small>
                                </span>
                              ) : (
                                <span className="season-preview-returning">Returning</span>
                              )}
                            </li>
                          )
                        })}
                      </ol>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      ) : section === 'divisions' ? (
        <Divisions
          guard={guard}
          report={report}
          onDivisionSaved={(savedDivision) => {
            setDivisions((current) =>
              current.some((division) => division.id === savedDivision.id)
                ? current.map((division) =>
                    division.id === savedDivision.id ? savedDivision : division,
                  ).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
                : [...current, savedDivision].sort(
                    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
                  ),
            )
          }}
          onCurrentSeasonChanged={setDivisions}
          onSeasonChanged={() => {
            setSeasonMovements(null)
            void load().catch((cause: unknown) => {
              const message = cause instanceof Error ? cause.message : String(cause)
              report('error', `Could not refresh clubs for the selected season: ${message}`)
            })
          }}
        />
      ) : (
        <>
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
            {seasonMovements === null && (
              <p className="club-movement-warning" role="status">
                Movement progress could not be loaded, so zone colors are hidden. Refresh the page
                before making league changes.
              </p>
            )}
            {clubGroups.map((group) => {
              const sourceDivision = group.divisionId == null
                ? undefined
                : divisions.find((division) => division.id === group.divisionId)
              const promotionCandidates = sourceDivision && promotionCountFor(sourceDivision) > 0
                ? backfillCandidatesFor(sourceDivision.id, 'promotion')
                : []
              const relegationCandidates = sourceDivision && relegationCountFor(sourceDivision) > 0
                ? backfillCandidatesFor(sourceDivision.id, 'relegation')
                : []
              const activeBackfill =
                backfillTarget?.divisionId === group.divisionId ? backfillTarget.type : null
              const activeBackfillCandidates =
                activeBackfill === 'promotion'
                  ? promotionCandidates
                  : activeBackfill === 'relegation'
                    ? relegationCandidates
                    : []
              return (
                <section className="card club-league-group" key={group.id}>
                <header>
                  <div className="club-league-heading">
                    <h2>{group.name}</h2>
                    <span className="club-league-count">{group.clubs.length}</span>
                  </div>
                  <div className="club-league-meta">
                    <span className="hint">{group.clubs.length === 1 ? 'club' : 'clubs'}</span>
                    {seasonMovements !== null &&
                      group.movementProgress &&
                      group.movementProgress.promotionTarget > 0 && (
                      <span className="club-movement-progress">
                        {group.movementProgress.promotionCompleted}/
                        {group.movementProgress.promotionTarget} promoted
                      </span>
                    )}
                    {seasonMovements !== null &&
                      group.movementProgress &&
                      group.movementProgress.relegationTarget > 0 && (
                      <span className="club-movement-progress">
                        {group.movementProgress.relegationCompleted}/
                        {group.movementProgress.relegationTarget} relegated
                      </span>
                    )}
                  </div>
                </header>
                {sourceDivision && seasonMovements !== null && (
                  <>
                    {(promotionCandidates.length > 0 || relegationCandidates.length > 0) && (
                      <div className="club-movement-backfill">
                        <div className="club-movement-backfill-copy">
                          <strong>Record a move completed earlier</strong>
                          <span>
                            Use this only if the club has already changed leagues this season.
                            This updates the progress count and zone color; it does not move the club.
                          </span>
                        </div>
                        {promotionCandidates.length > 0 && (
                          <button
                            className="btn sm"
                            type="button"
                            onClick={() => {
                              setBackfillTarget({
                                divisionId: sourceDivision.id,
                                type: 'promotion',
                              })
                              setBackfillClubSlug('')
                            }}
                          >
                            Mark prior promotion complete
                          </button>
                        )}
                        {relegationCandidates.length > 0 && (
                          <button
                            className="btn sm"
                            type="button"
                            onClick={() => {
                              setBackfillTarget({
                                divisionId: sourceDivision.id,
                                type: 'relegation',
                              })
                              setBackfillClubSlug('')
                            }}
                          >
                            Mark prior relegation complete
                          </button>
                        )}
                      </div>
                    )}
                    {activeBackfill && (
                      <div className="club-movement-backfill-form">
                        <strong>
                          Mark a {activeBackfill} from {sourceDivision.name} as complete
                        </strong>
                        <span>This only updates this season&rsquo;s movement tracking.</span>
                        <CustomSelect
                          ariaLabel={`Choose club with completed ${activeBackfill} from ${sourceDivision.name}`}
                          value={backfillClubSlug}
                          onChange={setBackfillClubSlug}
                          options={[
                            {
                              value: '',
                              label: `Choose ${activeBackfill === 'promotion' ? 'promoted' : 'relegated'} club`,
                            },
                            ...activeBackfillCandidates.map((club) => ({
                              value: club.slug,
                              label: club.name,
                            })),
                          ]}
                        />
                        <button
                          className="btn primary sm"
                          type="button"
                          disabled={!backfillClubSlug || busy !== null}
                          onClick={() => {
                            void recordPreviousMovement(sourceDivision, backfillClubSlug)
                          }}
                        >
                          Mark as completed
                        </button>
                        <button
                          className="btn sm"
                          type="button"
                          disabled={busy !== null}
                          onClick={() => setBackfillTarget(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </>
                )}
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
                            className={`club-row${zoneClass}`}
                            tabIndex={0}
                            aria-label={`Edit ${c.name}${zoneLabels.length ? `. ${zoneLabels.join(' and ')}.` : ''} Press Enter to open.`}
                            onClick={() => edit(c)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                edit(c)
                              }
                            }}
                          >
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

          <p className="footnote">
            Short codes are <strong>not unique</strong>: the crawl assigns <code>KKV</code> to both
            KITA KITA VFC and KOEMPOEL KEBOW VFC, so the schema deliberately does not constrain them.
            Gamertags are matched case-insensitively — registering a name that already exists is
            rejected rather than creating a duplicate player.
          </p>
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
                              { value: '', label: 'Not entered' },
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