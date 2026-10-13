import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  addPlayer,
  getClubs,
  getMatches,
  getStandings,
  removePlayer,
  setResult,
  updateClub,
  withdrawResult,
  type Club,
  type Match,
  type Standing,
} from './api'

type Tab = 'standings' | 'results' | 'clubs'

interface Notice {
  kind: 'ok' | 'error' | 'info'
  text: string
}

export default function App() {
  const [tab, setTab] = useState<Tab>('standings')
  const [notice, setNotice] = useState<Notice | null>(null)

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
        <h1>IWVPL Admin</h1>
        <span className="tag">Manager Portal</span>
      </header>

      <nav className="tabs" role="tablist">
        {(['standings', 'results', 'clubs'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {notice && (
        <div className={`notice ${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {tab === 'standings' && <Standings guard={guard} report={report} />}
      {tab === 'results' && <Results guard={guard} report={report} />}
      {tab === 'clubs' && <Clubs guard={guard} report={report} />}
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
    const home = Number.parseInt(d?.home ?? '', 10)
    const away = Number.parseInt(d?.away ?? '', 10)
    if (!Number.isInteger(home) || !Number.isInteger(away)) {
      report('error', 'Enter both scores as whole numbers.')
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

  return (
    <>
      <div className="card">
        <header>
          <h2>Results</h2>
          <button className="btn" onClick={() => load().catch(() => {})}>
            Reload
          </button>
        </header>
        {matches.length === 0 ? (
          <div className="empty">No matches.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kickoff</th>
                <th>Home</th>
                <th className="num">Score</th>
                <th>Away</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const played = m.home_score !== null && m.away_score !== null
                const d = draft[m.id] ?? { home: '', away: '' }
                return (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-faint)' }}>
                      {m.kickoff.slice(0, 16)}
                    </td>
                    <td>
                      <div className="club">
                        {m.home_logo && <img src={m.home_logo} alt="" />}
                        <span className="name">{m.home_name}</span>
                      </div>
                    </td>
                    <td className="num">
                      <span className={`score${played ? '' : ' pending'}`}>
                        {played ? `${m.home_score} – ${m.away_score}` : 'not played'}
                      </span>
                    </td>
                    <td>
                      <div className="club">
                        {m.away_logo && <img src={m.away_logo} alt="" />}
                        <span className="name">{m.away_name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <div className="form">
                          <input
                            className="text"
                            inputMode="numeric"
                            aria-label={`${m.home_name} goals`}
                            value={d.home}
                            disabled={busy === m.id}
                            onChange={(e) =>
                              setDraft((s) => ({ ...s, [m.id]: { ...d, home: e.target.value } }))
                            }
                          />
                          <input
                            className="text"
                            inputMode="numeric"
                            aria-label={`${m.away_name} goals`}
                            value={d.away}
                            disabled={busy === m.id}
                            onChange={(e) =>
                              setDraft((s) => ({ ...s, [m.id]: { ...d, away: e.target.value } }))
                            }
                          />
                        </div>
                        <button
                          className="btn primary sm"
                          disabled={busy === m.id}
                          onClick={() => save(m)}
                        >
                          Save
                        </button>
                        {played && (
                          <button
                            className="btn danger sm"
                            disabled={busy === m.id}
                            title="Remove this result from the standings table"
                            onClick={() => withdraw(m)}
                          >
                            Withdraw
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="footnote">
        Saving a result reverses any previous contribution to both clubs before applying the new
        one, so repeated corrections do not drift. <strong>Withdraw</strong> removes the match
        from the table entirely.
      </p>
    </>
  )
}

/* ------------------------------------------------------------------- clubs */

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
  const [players, setPlayers] = useState<Record<string, string[]>>({})
  const [newPlayer, setNewPlayer] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await guard(getClubs, 'Could not load clubs')
    setClubs(data)
    setCodes(Object.fromEntries(data.map((c) => [c.slug, c.short_code ?? ''])))
    setStatuses(Object.fromEntries(data.map((c) => [c.slug, c.status])))
  }, [guard])

  useEffect(() => {
    load().catch(() => setClubs([]))
  }, [load])

  const loadPlayers = async (slug: string) => {
    const res = await fetch(`/api/clubs/${slug}`)
    if (!res.ok) return
    const body = await res.json()
    setPlayers((s) => ({ ...s, [slug]: body.players.map((p: any) => p.gamertag) }))
  }

  if (clubs === null) return <div className="loading">Loading clubs…</div>

  const save = async (c: Club) => {
    setBusy(c.slug)
    try {
      await updateClub(c.slug, {
        shortCode: codes[c.slug] || null,
        status: statuses[c.slug],
      })
      report('ok', `Saved ${c.name}.`)
      await load()
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
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
      await loadPlayers(c.slug)
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
      await loadPlayers(c.slug)
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
        <table>
          <thead>
            <tr>
              <th>Club</th>
              <th>Code</th>
              <th>Status</th>
              <th>Squad</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.slug}>
                <td>
                  <div className="club">
                    {c.logo_local && <img src={c.logo_local} alt="" />}
                    {c.flag && <span className="flag">{c.flag}</span>}
                    <span className="name">{c.name}</span>
                  </div>
                </td>
                <td>
                  <input
                    className="text"
                    style={{ width: 72 }}
                    aria-label={`Short code for ${c.name}`}
                    value={codes[c.slug] ?? ''}
                    onChange={(e) => setCodes((s) => ({ ...s, [c.slug]: e.target.value }))}
                  />
                </td>
                <td>
                  <select
                    className="text"
                    aria-label={`Status for ${c.name}`}
                    value={statuses[c.slug] ?? 'active'}
                    onChange={(e) => setStatuses((s) => ({ ...s, [c.slug]: e.target.value }))}
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </td>
                <td>
                  {players[c.slug] ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260 }}>
                      {players[c.slug].map((p) => (
                        <button
                          key={p}
                          className="btn sm"
                          title="Release this player"
                          onClick={() => drop(c, p)}
                        >
                          {p} ×
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button className="btn sm" onClick={() => loadPlayers(c.slug)}>
                      View squad
                    </button>
                  )}
                </td>
                <td>
                  <div className="row-actions">
                    <input
                      className="text"
                      style={{ width: 130 }}
                      placeholder="gamertag"
                      aria-label={`Add a player to ${c.name}`}
                      value={newPlayer[c.slug] ?? ''}
                      onChange={(e) => setNewPlayer((s) => ({ ...s, [c.slug]: e.target.value }))}
                    />
                    <button
                      className="btn sm"
                      disabled={busy === c.slug}
                      onClick={() => add(c)}
                    >
                      Add
                    </button>
                    <button
                      className="btn primary sm"
                      disabled={busy === c.slug}
                      onClick={() => save(c)}
                    >
                      Save
                    </button>
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
    </>
  )
}