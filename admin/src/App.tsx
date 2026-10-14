import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  addPlayer,
  assignDivision,
  decideClub,
  createMatch,
  getClubs,
  getDivisions,
  getMatches,
  getPendingClubs,
  getStandings,
  removePlayer,
  scheduleMatch,
  setResult,
  updateClub,
  withdrawResult,
  type Club,
  type Division,
  type Match,
  type PendingClub,
  type Standing,
} from './api'

type Tab = 'standings' | 'results' | 'clubs'
type ClubSection = 'clubs' | 'applications'

interface Notice {
  kind: 'ok' | 'error' | 'info'
  text: string
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = window.localStorage.getItem('iwvpl-admin-tab')
    return saved === 'standings' || saved === 'clubs' || saved === 'applications'
      ? saved === 'applications' ? 'clubs' : saved
      : 'results'
  })
  const [clubSection, setClubSection] = useState<ClubSection>(() => {
    const savedTab = window.localStorage.getItem('iwvpl-admin-tab')
    const savedSection = window.localStorage.getItem('iwvpl-admin-club-section')
    return savedTab === 'applications' || savedSection === 'applications' ? 'applications' : 'clubs'
  })
  const [notice, setNotice] = useState<Notice | null>(null)
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

  return (
    <div className="shell">
      <header className="masthead">
        <a className="brand" href="/admin/" aria-label="IWVPL Admin home">
          <span className="brand-mark">I</span>
          <span><strong>IWVPL</strong><small>LEAGUE OPERATIONS</small></span>
        </a>
        <div className="masthead-meta"><span className="secure-dot" />Admin workspace</div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <p className="nav-label">WORKSPACE</p>
          <nav className="tabs" role="tablist" aria-label="Admin sections">
            {(['results', 'standings', 'clubs'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                <span className="nav-icon" aria-hidden="true">
                  {t === 'results'
                    ? '◉'
                    : t === 'standings'
                      ? '▤'
                      : '♙'}
                </span>
                <span>
                  {t === 'results'
                    ? 'Matches'
                    : t === 'standings'
                      ? 'Standings'
                      : 'Clubs'}
                </span>
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
                    ? 'Review the current league table and recent form.'
                    : tab === 'clubs' && clubSection === 'applications'
                      ? 'Review and respond to clubs waiting for approval.'
                      : tab === 'clubs'
                        ? 'Update club details and manage player rosters.'
                        : ''}
              </p>
            </div>
            <span className="live-indicator"><i /> LIVE DATA</span>
          </div>

          {notice && (
            <div className={`notice ${notice.kind}`} role="status">
              <span>{notice.text}</span>
              <button className="btn sm" onClick={() => setNotice(null)}>Dismiss</button>
            </div>
          )}

          {tab === 'standings' && <Standings guard={guard} report={report} />}
          {tab === 'results' && <Results guard={guard} report={report} />}
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
    </div>
  )
}

/* --------------------------------------------------------------- standings */

function Standings({
  guard,
  report,
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
}) {
  const [rows, setRows] = useState<Standing[] | null>(null)

  const load = useCallback(async () => {
    const data = await guard(getStandings, 'Could not load standings')
    setRows(data)
  }, [guard])

  useEffect(() => {
    load().catch(() => setRows([]))
  }, [load])

  if (rows === null) return <div className="loading">Loading standings…</div>

  const division = rows[0]?.division_name

  return (
    <>
      <div className="card">
        <header>
          <h2>{division ?? 'Standings'}</h2>
          <span className="hint">Updates as results are recorded</span>
        </header>
        {rows.length === 0 ? (
          <div className="empty">No standings rows.</div>
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
        This table is <strong>materialised</strong>, not recomputed from results. The seeded
        snapshot covers 153 matches while only 50 are stored, so each new result is applied
        incrementally to the existing rows. Editing a result reverses its old contribution
        before applying the new one, which keeps the arithmetic exact.
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
  const [draft, setDraft] = useState<Record<number, { home: string; away: string }>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')
  const [query, setQuery] = useState('')
  const [clubs, setClubs] = useState<Club[]>([])
  const [scheduleTarget, setScheduleTarget] = useState<number | 'new' | null>(null)
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, string>>({})
  const [createHome, setCreateHome] = useState('')
  const [createAway, setCreateAway] = useState('')
  const [createKickoff, setCreateKickoff] = useState('')
  const [now, setNow] = useState(Date.now())
  const [scheduleBusy, setScheduleBusy] = useState(false)

  const load = useCallback(async () => {
    const data = await guard(() => getMatches(200), 'Could not load matches')
    setMatches(data)
    setScheduleDrafts(Object.fromEntries(data.map((match) => [match.id, dateTimeInputValue(match.kickoff)])))
    setDraft(
      Object.fromEntries(
        data.map((m) => [
          m.id,
          {
            home: m.home_score === null ? '' : String(m.home_score),
            away: m.away_score === null ? '' : String(m.away_score),
          },
        ]),
      ),
    )
  }, [guard])

  useEffect(() => {
    load().catch(() => setMatches([]))
  }, [load])

  useEffect(() => {
    getClubs().then(setClubs).catch((err) => {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)
      report('error', `Could not load clubs for match scheduling: ${message}`)
    })
  }, [report])

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
        () => createMatch(createHome, createAway, createKickoff || null),
        'Could not create fixture',
      )
      setMatches((current) => [...(current ?? []), match])
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
      setCreateKickoff('')
      setScheduleTarget(null)
    } catch {
      /* already reported by guard */
    } finally {
      setScheduleBusy(false)
    }
  }

  const completedCount = matches.filter((m) => m.home_score !== null && m.away_score !== null).length
  const pendingCount = matches.length - completedCount
  const filteredMatches = matches.filter((m) => {
    const played = m.home_score !== null && m.away_score !== null
    const matchesFilter = filter === 'all' || (filter === 'completed' ? played : !played)
    const matchesQuery = `${m.home_name} ${m.away_name}`.toLowerCase().includes(query.toLowerCase())
    return matchesFilter && matchesQuery
  })
  const urgency = (match: Match) => matchUrgency(match, now, today)
  const visibleMatches = filteredMatches.filter((match) => urgency(match) !== 'unscheduled')
  const priorityGroups: { key: MatchUrgency; title: string; hint: string }[] = [
    { key: 'unscheduled', title: 'Needs scheduling', hint: 'No kickoff date set' },
    { key: 'overdue', title: 'Past kickoff', hint: 'Kickoff passed · result still missing' },
    { key: 'today', title: 'Today', hint: 'Kickoff is today · Kuala Lumpur time' },
  ]
  const priorityMatches = priorityGroups.map((group) => ({
    ...group,
    matches: matches
      .filter((match) => urgency(match) === group.key)
      .sort((a, b) =>
        group.key === 'unscheduled'
          ? a.home_name.localeCompare(b.home_name)
          : (a.kickoff ?? '').localeCompare(b.kickoff ?? ''),
      ),
  }))
  const sortedVisibleMatches = [...visibleMatches].sort((a, b) => {
    const order: MatchUrgency[] = ['unscheduled', 'overdue', 'today', 'upcoming', 'completed']
    const difference = order.indexOf(urgency(a)) - order.indexOf(urgency(b))
    return difference || (a.kickoff ?? '').localeCompare(b.kickoff ?? '')
  })
  const selectedClub = clubs.find((club) => club.slug === createHome)
  const awayOptions = clubs.filter(
    (club) => club.slug !== createHome && club.division_id === selectedClub?.division_id,
  )

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">▦</span>          <span className="stat-label">FIXTURES LOADED</span>
          <strong>{matches.length}</strong><small>League fixtures in this view</small>
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
                        <button
                          className="btn priority-action"
                          onClick={() => setScheduleTarget(match.id)}
                        >
                          {match.kickoff ? 'Edit schedule' : 'Set schedule'}
                        </button>
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
              <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>
                {f === 'pending' ? `Unplayed (${pendingCount})` : f === 'completed' ? `Completed (${completedCount})` : 'All fixtures'}
              </button>
            ))}
          </div>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a club…" aria-label="Find a club" />
          </label>
        </div>

        {visibleMatches.length === 0 ? (
          <div className="empty match-empty">
            <strong>
              {filteredMatches.length > 0
                ? 'Fixtures needing a date are shown above'
                : matches.length === 0
                  ? 'No matches found'
                  : 'No fixtures match this view'}
            </strong>
            <span>
              {filteredMatches.length > 0
                ? 'Set a kickoff date above to include them in the fixture list.'
                : query
                  ? 'Try another club name or clear your search.'
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
      </section>

      <p className="footnote">
        Saving a result reverses any previous contribution to both clubs before applying the new
        one, so repeated corrections do not drift. <strong>Withdraw</strong> removes the match
        from the standings table while keeping the fixture available.
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
                  <p className="club-edit-subtitle">Choose two clubs in the same current division.</p>
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
                    <span>Home club</span>
                    <select
                      className="text"
                      required
                      value={createHome}
                      onChange={(event) => {
                        setCreateHome(event.target.value)
                        setCreateAway('')
                      }}
                    >
                      <option value="">Choose home club</option>
                      {clubs.filter((club) => club.division_id !== null).map((club) => (
                        <option key={club.slug} value={club.slug}>{club.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Away club</span>
                    <select
                      className="text"
                      required
                      disabled={!createHome}
                      value={createAway}
                      onChange={(event) => setCreateAway(event.target.value)}
                    >
                      <option value="">Choose away club</option>
                      {awayOptions.map((club) => (
                        <option key={club.slug} value={club.slug}>{club.name}</option>
                      ))}
                    </select>
                  </label>
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
                <button className="btn primary" disabled={scheduleBusy || !createHome || !createAway}>
                  {scheduleBusy ? 'Creating…' : 'Create fixture'}
                </button>
              </footer>
            </form>
          ) : (
            (() => {
              const match = matches.find((item) => item.id === scheduleTarget)
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
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
}) {
  const [clubs, setClubs] = useState<PendingClub[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await guard(getPendingClubs, 'Could not load applications')
    setClubs(data)
  }, [guard])

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
  const activeClub = clubs?.find((club) => club.slug === editing) ?? null

  const load = useCallback(async () => {
    const data = await guard(getClubs, 'Could not load clubs')
    setClubs(data)
    setCodes(Object.fromEntries(data.map((c) => [c.slug, c.short_code ?? ''])))
    setStatuses(Object.fromEntries(data.map((c) => [c.slug, c.status])))

    // Divisions are public metadata, and the club rows carry the one they are
    // already in, so the two load together and the select starts on the real
    // value rather than on the first option in the list.
    try {
      const [divs, full] = await Promise.all([
        getDivisions(),
        fetch('/api/clubs?includePending=true').then((r) => (r.ok ? r.json() : { clubs: [] })),
      ])
      setDivisions(divs)
      const current: Record<string, string> = {}
      for (const c of full.clubs ?? []) {
        if (c.division_id) current[c.slug] = String(c.division_id)
      }
      setDivisionOf(current)
    } catch {
      /* the column degrades to "not assigned"; the rest still works */
    }
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
      // which is not something the club PATCH knows how to do.
      if (chosen && chosen !== (c.division_id ? String(c.division_id) : '')) {
        const res = await guard(
          () => assignDivision(c.slug, Number(chosen)),
          `Could not assign ${c.name} to the division`,
        )
        setClubs((current) =>
          current?.map((club) =>
            club.slug === c.slug ? { ...club, division_id: Number(chosen) } : club,
          ) ?? null,
        )
        report('ok', `Saved ${c.name} and entered it into ${res.divisionName}.`)
      } else {
        report('ok', `Saved ${c.name}.`)
      }

      setEditing(null)
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  const edit = (c: Club) => {
    setCodes((s) => ({ ...s, [c.slug]: c.short_code ?? '' }))
    setStatuses((s) => ({ ...s, [c.slug]: c.status }))
    setDivisionOf((s) => ({ ...s, [c.slug]: c.division_id ? String(c.division_id) : '' }))
    setNewPlayer((s) => ({ ...s, [c.slug]: '' }))
    setEditing(c.slug)
  }

  const cancelEdit = (c: Club) => {
    setCodes((s) => ({ ...s, [c.slug]: c.short_code ?? '' }))
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

  return (
    <>
      <div className="club-subnav" role="tablist" aria-label="Club workspace">
        <button
          role="tab"
          aria-selected={section === 'clubs'}
          onClick={() => setSection('clubs')}
        >
          Clubs <span>{clubs.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={section === 'applications'}
          onClick={() => setSection('applications')}
        >
          Applications
        </button>
      </div>
      {section === 'applications' ? (
        <Applications guard={guard} report={report} />
      ) : (
        <>
      <div className="card">
        <header>
          <h2>Clubs</h2>
          <span className="hint">{clubs.length} registered</span>
        </header>
        <table className="club-management-table">
          <thead>
            <tr>
              <th>Club</th>
              <th>Code</th>
              <th>Status</th>
              <th>Division</th>
              <th>Squad</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map((c) => (
              <tr
                key={c.slug}
                className="club-row"
                tabIndex={0}
                aria-label={`Edit ${c.name}. Press Enter to open.`}
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
                  <span>
                    {divisions.find(
                      (d) => String(d.id) === (divisionOf[c.slug] ?? String(c.division_id ?? '')),
                    )?.name ?? 'Not entered'}
                  </span>
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
            ))}
          </tbody>
        </table>
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
                  <select
                    className="text"
                    value={statuses[activeClub.slug] ?? activeClub.status}
                    onChange={(event) =>
                      setStatuses((current) => ({
                        ...current,
                        [activeClub.slug]: event.target.value,
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </label>
                <label>
                  <span>Division</span>
                  <select
                    className="text"
                    value={divisionOf[activeClub.slug] ?? ''}
                    disabled={statuses[activeClub.slug] !== 'active'}
                    onChange={(event) =>
                      setDivisionOf((current) => ({
                        ...current,
                        [activeClub.slug]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Not entered</option>
                    {divisions.map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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