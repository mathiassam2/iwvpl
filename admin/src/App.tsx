import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  addPlayer,
  assignDivision,
  decideClub,
  getClubs,
  getDivisions,
  getMatches,
  getPendingClubs,
  getStandings,
  removePlayer,
  setResult,
  updateClub,
  withdrawResult,
  type Club,
  type Division,
  type Match,
  type PendingClub,
  type Standing,
} from './api'

type Tab = 'standings' | 'results' | 'clubs' | 'applications'

interface Notice {
  kind: 'ok' | 'error' | 'info'
  text: string
}

export default function App() {
  const [tab, setTab] = useState<Tab>('results')
  const [notice, setNotice] = useState<Notice | null>(null)
  const pageTitle: Record<Tab, string> = {
    results: 'Match centre',
    standings: 'League table',
    clubs: 'Club management',
    applications: 'Club applications',
  }

  const report = useCallback((kind: Notice['kind'], text: string) => setNotice({ kind, text }), [])

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
            {(['results', 'standings', 'clubs', 'applications'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                <span className="nav-icon" aria-hidden="true">
                  {t === 'results'
                    ? '◉'
                    : t === 'standings'
                      ? '▤'
                      : t === 'clubs'
                        ? '♙'
                        : '✦'}
                </span>
                <span>
                  {t === 'results'
                    ? 'Matches'
                    : t === 'standings'
                      ? 'Standings'
                      : t === 'clubs'
                        ? 'Clubs'
                        : 'Applications'}
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
                    : tab === 'applications'
                      ? 'Approve or reject clubs created from the registration form.'
                      : 'Update club details and manage player rosters.'}
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
          {tab === 'clubs' && <Clubs guard={guard} report={report} />}
          {tab === 'applications' && <Applications guard={guard} report={report} />}
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

  const load = useCallback(async () => {
    const data = await guard(() => getMatches(50), 'Could not load matches')
    setMatches(data)
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

  if (matches === null) return <div className="loading">Loading matches…</div>

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

  const completedCount = matches.filter((m) => m.home_score !== null && m.away_score !== null).length
  const pendingCount = matches.length - completedCount
  const visibleMatches = matches.filter((m) => {
    const played = m.home_score !== null && m.away_score !== null
    const matchesFilter = filter === 'all' || (filter === 'completed' ? played : !played)
    const matchesQuery = `${m.home_name} ${m.away_name}`.toLowerCase().includes(query.toLowerCase())
    return matchesFilter && matchesQuery
  })

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">▦</span><span className="stat-label">MATCHES LOADED</span>
          <strong>{matches.length}</strong><small>Recent league fixtures</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon pending-icon">◷</span><span className="stat-label">NEEDS A RESULT</span>
          <strong>{pendingCount}</strong><small>Ready for score entry</small>
        </div>
        <div className="stat-card">
          <span className="stat-icon done-icon">✓</span><span className="stat-label">COMPLETED</span>
          <strong>{completedCount}</strong><small>Results recorded</small>
        </div>
      </div>

      <section className="match-section" aria-label="Match results">
        <div className="match-toolbar">
          <div>
            <h2>Fixtures</h2>
            <p>Choose a fixture, enter the final score, and save.</p>
          </div>
          <button className="btn reload-btn" onClick={() => load().catch(() => {})} aria-label="Reload matches">
            ↻ <span>Refresh</span>
          </button>
        </div>
        <div className="match-controls">
          <div className="filter-pills" role="group" aria-label="Filter fixtures">
            {(['all', 'pending', 'completed'] as const).map((f) => (
              <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>
                {f === 'pending' ? `To enter (${pendingCount})` : f === 'completed' ? `Completed (${completedCount})` : 'All fixtures'}
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
            <strong>{matches.length === 0 ? 'No matches found' : 'No fixtures match this view'}</strong>
            <span>{query ? 'Try another club name or clear your search.' : 'Switch filters to see other fixtures.'}</span>
          </div>
        ) : (
          <div className="match-list">
            {visibleMatches.map((m) => {
              const played = m.home_score !== null && m.away_score !== null
              const d = draft[m.id] ?? { home: '', away: '' }
              return (
                <article className="match-card" key={m.id}>
                  <div className="match-card-top">
                    <span className="kickoff">
                      {new Date(m.kickoff).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <span className={`match-status ${played ? 'is-complete' : 'is-pending'}`}>
                      <i />{played ? 'RESULT SAVED' : 'AWAITING RESULT'}
                    </span>
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
        from the table entirely.
      </p>
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
}: {
  guard: <T>(fn: () => Promise<T>, what: string) => Promise<T>
  report: (kind: Notice['kind'], text: string) => void
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
    if (!squadSlug) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSquadSlug(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [squadSlug])

  if (clubs === null) return <div className="loading">Loading clubs…</div>

  const save = async (c: Club) => {
    setBusy(c.slug)
    try {
      await updateClub(c.slug, {
        shortCode: codes[c.slug] || null,
        status: statuses[c.slug],
      })

      // Division is a separate call: it has to create the club's standings row,
      // which is not something the club PATCH knows how to do.
      const chosen = divisionOf[c.slug] ?? ''
      if (chosen && chosen !== (c.division_id ? String(c.division_id) : '')) {
        const res = await assignDivision(c.slug, Number(chosen))
        report('ok', `Saved ${c.name} and entered it into ${res.divisionName}.`)
      } else {
        report('ok', `Saved ${c.name}.`)
      }

      await load()
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
      await addPlayer(c.slug, tag)
      report('ok', `${tag} added to ${c.name}.`)
      setNewPlayer((s) => ({ ...s, [c.slug]: '' }))
      setClubs((current) =>
        current?.map((club) =>
          club.slug === c.slug ? { ...club, players: club.players + 1 } : club,
        ) ?? null,
      )
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
      await removePlayer(c.slug, gamertag)
      report('ok', `${gamertag} released by ${c.name}.`)
      setClubs((current) =>
        current?.map((club) =>
          club.slug === c.slug ? { ...club, players: Math.max(0, club.players - 1) } : club,
        ) ?? null,
      )
      await guard(() => loadPlayers(c.slug), `Could not refresh ${c.name}'s squad`)
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  return (
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
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.slug} className={editing === c.slug ? 'club-row is-editing' : 'club-row'}>
                <td>
                  <div className="club">
                    {c.logo_local && <img src={c.logo_local} alt="" />}
                    {c.flag && <span className="flag">{c.flag}</span>}
                    <span className="name">{c.name}</span>
                  </div>
                </td>
                <td>
                  {editing === c.slug ? (
                    <input
                      className="text"
                      style={{ width: 72 }}
                      aria-label={`Short code for ${c.name}`}
                      value={codes[c.slug] ?? ''}
                      onChange={(e) => setCodes((s) => ({ ...s, [c.slug]: e.target.value }))}
                    />
                  ) : (
                    <span className="hint">{c.short_code || '—'}</span>
                  )}
                </td>
                <td>
                  {editing === c.slug ? (
                    <select
                      className="table-select"
                      aria-label={`Status for ${c.name}`}
                      value={statuses[c.slug] ?? 'active'}
                      onChange={(e) => setStatuses((s) => ({ ...s, [c.slug]: e.target.value }))}
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="withdrawn">Withdrawn</option>
                    </select>
                  ) : (
                    <span>{c.status}</span>
                  )}
                </td>
                <td>
                  {editing === c.slug ? (
                    <select
                      className="table-select"
                      aria-label={`Division for ${c.name}`}
                      value={divisionOf[c.slug] ?? ''}
                      disabled={c.status !== 'active'}
                      onChange={(e) =>
                        setDivisionOf((s) => ({ ...s, [c.slug]: e.target.value }))
                      }
                    >
                      <option value="">Not entered</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>
                      {divisions.find((d) => String(d.id) === (divisionOf[c.slug] ?? ''))?.name ??
                        'Not entered'}
                    </span>
                  )}
                </td>
                <td>
                  <button className="squad-link" onClick={() => void viewSquad(c)}>
                    View Squad <span className="squad-count">{c.players}</span>
                  </button>
                </td>
                <td>
                  <div className="row-actions">
                    {editing === c.slug ? (
                      <>
                        <input
                          className="text"
                          style={{ width: 130 }}
                          placeholder="Add gamertag"
                          aria-label={`Add a player to ${c.name}`}
                          value={newPlayer[c.slug] ?? ''}
                          onChange={(e) =>
                            setNewPlayer((s) => ({ ...s, [c.slug]: e.target.value }))
                          }
                        />
                        <button
                          className="btn sm"
                          disabled={busy === c.slug}
                          onClick={() => void add(c)}
                        >
                          Add
                        </button>
                        <button
                          className="btn primary sm"
                          disabled={busy === c.slug}
                          onClick={() => void save(c)}
                        >
                          Save
                        </button>
                        <button
                          className="btn sm"
                          disabled={busy === c.slug}
                          onClick={() => cancelEdit(c)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="icon-btn"
                        aria-label={`Edit ${c.name}`}
                        title={`Edit ${c.name}`}
                        disabled={editing !== null}
                        onClick={() => edit(c)}
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                    )}
                  </div>
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
  )
}