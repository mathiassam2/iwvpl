import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { GenerateRoundRobinWizardModal } from './GenerateRoundRobinWizardModal'
import { EaMatchResultModal } from './EaMatchResultModal'
import {
  createMatch,
  deleteMatch,
  deleteMatches,
  deleteUnscheduledMatches,
  generateFixtures,
  getAdminSeasons,
  getClubs,
  getDivisions,
  getMatches,
  getStandings,
  scheduleMatch,
  setResult,
  withdrawResult,
  type AdminSeason,
  type Club,
  type Division,
  type Match,
  type MatchSort,
  type Standing,
} from '../api'
import {
  formatKickoffDisplay,
  toDatetimeLocalValue,
  type Guard,
  type Report,
} from '../utils'

type SubView = 'fixtures' | 'standings'

export function MatchesStandingsView({
  guard,
  report,
  initialSub,
}: {
  guard: Guard
  report: Report
  initialSub?: string
}) {
  const [subView, setSubView] = useState<SubView>(() =>
    initialSub === 'standings' ? 'standings' : 'fixtures',
  )

  // Shared season / division state
  const [seasons, setSeasons] = useState<AdminSeason[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null)
  const [selectedDivisionSlug, setSelectedDivisionSlug] = useState<string>('')

  // Matches state
  const [matches, setMatches] = useState<Match[]>([])
  const [total, setTotal] = useState(0)
  const [allTotal, setAllTotal] = useState(0)
  const [pendingTotal, setPendingTotal] = useState(0)
  const [completedTotal, setCompletedTotal] = useState(0)
  const [resultFilter, setResultFilter] = useState<'all' | 'pending' | 'completed'>('pending')
  const [sort, setSort] = useState<MatchSort>('priority')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 30
  const [loadingMatches, setLoadingMatches] = useState(true)
  const hasLoadedMatchesRef = useRef(false)
  const hasLoadedStandingsRef = useRef(false)

  // Score inputs & selection
  const [scores, setScores] = useState<Record<number, { hs: string; as: string }>>({})
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<number>>(new Set())
  const [busyMatchId, setBusyMatchId] = useState<number | null>(null)

  // Schedule single match modal
  const [createOpen, setCreateOpen] = useState(initialSub === 'schedule')
  const [createDivisionId, setCreateDivisionId] = useState<string>('')
  const [homeSlug, setHomeSlug] = useState('')
  const [awaySlug, setAwaySlug] = useState('')
  const [kickoffInput, setKickoffInput] = useState('')
  const [createBusy, setCreateBusy] = useState(false)

  // Auto-generate Round-Robin modal
  const [genOpen, setGenOpen] = useState(false)

  // Edit kickoff modal
  const [scheduleTarget, setScheduleTarget] = useState<Match | null>(null)
  const [scheduleValue, setScheduleValue] = useState('')
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [eaModalMatch, setEaModalMatch] = useState<Match | null>(null)

  // Standings state
  const [standings, setStandings] = useState<Standing[]>([])
  const [loadingStandings, setLoadingStandings] = useState(false)

  useEffect(() => {
    if (initialSub === 'standings') setSubView('standings')
    else if (initialSub === 'schedule') {
      setSubView('fixtures')
      setCreateOpen(true)
    } else if (initialSub === 'fixtures') {
      setSubView('fixtures')
    }
  }, [initialSub])

  const loadMeta = useCallback(async () => {
    try {
      const [seasonsList, divsList, clubsList] = await Promise.all([
        guard(getAdminSeasons, 'Could not load seasons'),
        guard(() => getDivisions(), 'Could not load divisions'),
        guard(() => getClubs(), 'Could not load clubs'),
      ])
      setSeasons(seasonsList)
      const current = seasonsList.find((s) => Boolean(s.is_current)) ?? seasonsList[0] ?? null
      if (current && selectedSeasonId === null) {
        setSelectedSeasonId(current.id)
      }
      setDivisions(divsList)
      const activeDivs = divsList.filter((d) => Boolean(d.is_active))
      if (activeDivs.length > 0 && !createDivisionId) {
        setCreateDivisionId(String(activeDivs[0].id))
      }
      setClubs(clubsList)
    } catch {
      /* reported */
    }
  }, [guard, selectedSeasonId, createDivisionId])

  useEffect(() => {
    void loadMeta()
  }, [loadMeta])

  const loadMatches = useCallback(async () => {
    if (!hasLoadedMatchesRef.current) setLoadingMatches(true)
    try {
      const page = await guard(
        () =>
          getMatches({
            limit,
            offset,
            result: resultFilter,
            search: search.trim(),
            sort,
          }),
        'Could not load matches',
      )
      setMatches(page.matches)
      setTotal(page.total)
      setAllTotal(page.allTotal)
      setPendingTotal(page.pendingTotal)
      setCompletedTotal(page.completedTotal)

      const nextScores: Record<number, { hs: string; as: string }> = {}
      for (const m of page.matches) {
        nextScores[m.id] = {
          hs: m.home_score != null ? String(m.home_score) : '',
          as: m.away_score != null ? String(m.away_score) : '',
        }
      }
      setScores(nextScores)
      hasLoadedMatchesRef.current = true
    } catch {
      /* reported */
    } finally {
      setLoadingMatches(false)
    }
  }, [guard, limit, offset, resultFilter, search, sort])

  useEffect(() => {
    void loadMatches()
  }, [loadMatches])

  const loadStandingsTable = useCallback(async () => {
    if (selectedSeasonId === null) return
    if (!hasLoadedStandingsRef.current) setLoadingStandings(true)
    try {
      const [divsList, rows] = await Promise.all([
        guard(() => getDivisions(selectedSeasonId), 'Could not load season divisions'),
        guard(
          () => getStandings(selectedSeasonId, selectedDivisionSlug || undefined),
          'Could not load standings',
        ),
      ])
      setDivisions(divsList)
      setStandings(rows)
      hasLoadedStandingsRef.current = true
    } catch {
      /* reported */
    } finally {
      setLoadingStandings(false)
    }
  }, [guard, selectedSeasonId, selectedDivisionSlug])

  useEffect(() => {
    if (subView === 'standings') {
      void loadStandingsTable()
    }
  }, [subView, loadStandingsTable])

  const handleSaveScore = async (match: Match) => {
    const pair = scores[match.id] ?? { hs: '', as: '' }
    const hs = Number.parseInt(pair.hs, 10)
    const as = Number.parseInt(pair.as, 10)
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) {
      report('error', 'Enter valid whole numbers (0–99) for both clubs.')
      return
    }
    setBusyMatchId(match.id)
    try {
      await guard(() => setResult(match.id, hs, as), 'Could not record match score')
      report('ok', `Saved score: ${match.home_name} ${hs} – ${as} ${match.away_name}`)
      await loadMatches()
    } catch {
      /* reported */
    } finally {
      setBusyMatchId(null)
    }
  }

  const handleWithdrawScore = async (match: Match) => {
    setBusyMatchId(match.id)
    try {
      await guard(() => withdrawResult(match.id), 'Could not withdraw result')
      report('ok', `Reset score for ${match.home_name} vs ${match.away_name}.`)
      await loadMatches()
    } catch {
      /* reported */
    } finally {
      setBusyMatchId(null)
    }
  }

  const handleDeleteOne = async (match: Match) => {
    if (!window.confirm(`Delete fixture ${match.home_name} vs ${match.away_name}?`)) return
    setBusyMatchId(match.id)
    try {
      await guard(() => deleteMatch(match.id), 'Could not delete fixture')
      report('ok', `Deleted ${match.home_name} vs ${match.away_name}.`)
      await loadMatches()
    } catch {
      /* reported */
    } finally {
      setBusyMatchId(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedMatchIds.size === 0) return
    if (!window.confirm(`Delete ${selectedMatchIds.size} selected fixture(s)?`)) return
    try {
      const res = await guard(
        () => deleteMatches([...selectedMatchIds]),
        'Could not delete selected fixtures',
      )
      report('ok', `Deleted ${res.deleted} fixture(s).`)
      setSelectedMatchIds(new Set())
      await loadMatches()
    } catch {
      /* reported */
    }
  }

  const handleBulkUnschedule = async () => {
    if (selectedMatchIds.size === 0) return
    if (!window.confirm(`Set ${selectedMatchIds.size} selected fixture(s) to unscheduled?`)) return
    try {
      await guard(
        () => Promise.all([...selectedMatchIds].map((id) => scheduleMatch(id, null))),
        'Could not update some fixtures',
      )
      report('ok', `Set ${selectedMatchIds.size} fixture(s) to unscheduled.`)
      setSelectedMatchIds(new Set())
      await loadMatches()
    } catch {
      /* reported */
    }
  }

  const handleClearUnscheduled = async () => {
    if (!window.confirm('Delete ALL unscheduled fixtures (fixtures without a kickoff date)?')) return
    try {
      const res = await guard(deleteUnscheduledMatches, 'Could not delete unscheduled fixtures')
      report('ok', `Removed ${res.deleted} unscheduled fixture(s).`)
      await loadMatches()
    } catch {
      /* reported */
    }
  }

  const handleCreateMatch = async (e: FormEvent) => {
    e.preventDefault()
    if (!homeSlug || !awaySlug) {
      report('error', 'Choose both home and away clubs.')
      return
    }
    setCreateBusy(true)
    try {
      const m = await guard(
        () => createMatch(homeSlug, awaySlug, kickoffInput || null),
        'Could not create fixture',
      )
      report('ok', `Created fixture: ${m.home_name} vs ${m.away_name}`)
      setHomeSlug('')
      setAwaySlug('')
      setKickoffInput('')
      setCreateOpen(false)
      await loadMatches()
    } catch {
      /* reported */
    } finally {
      setCreateBusy(false)
    }
  }



  const handleSetUnscheduled = async () => {
    if (!scheduleTarget) return
    setScheduleBusy(true)
    try {
      await guard(
        () => scheduleMatch(scheduleTarget.id, null),
        'Could not update kickoff time',
      )
      report('ok', `Set ${scheduleTarget.home_name} vs ${scheduleTarget.away_name} to unscheduled.`)
      setScheduleTarget(null)
      await loadMatches()
    } catch {
      /* reported */
    } finally {
      setScheduleBusy(false)
    }
  }

  const handleSaveKickoff = async (e: FormEvent) => {
    e.preventDefault()
    if (!scheduleTarget) return
    setScheduleBusy(true)
    try {
      await guard(
        () => scheduleMatch(scheduleTarget.id, scheduleValue || null),
        'Could not update kickoff time',
      )
      report(
        'ok',
        scheduleValue
          ? `Scheduled ${scheduleTarget.home_name} vs ${scheduleTarget.away_name}`
          : `Cleared kickoff for ${scheduleTarget.home_name} vs ${scheduleTarget.away_name}`,
      )
      setScheduleTarget(null)
      await loadMatches()
    } catch {
      /* reported */
    } finally {
      setScheduleBusy(false)
    }
  }

  const activeDivisions = divisions.filter((d) => Boolean(d.is_active))
  const clubsInSelectedCreateDiv = clubs.filter(
    (c) => c.status === 'active' && String(c.division_id) === createDivisionId,
  )

  // Group standings by division name
  const standingsByDivision = new Map<string, Standing[]>()
  for (const row of standings) {
    const list = standingsByDivision.get(row.division_name)
    if (list) list.push(row)
    else standingsByDivision.set(row.division_name, [row])
  }

  return (
    <div className="adm-stack">
      {/* Top Sub-View Switcher */}
      <div className="adm-subnav-bar">
        <div className="adm-pill-tabs">
          <button
            type="button"
            className={`adm-pill-tab ${subView === 'fixtures' ? 'is-active' : ''}`}
            onClick={() => setSubView('fixtures')}
          >
            ⚽ Fixtures & Score Entry ({allTotal})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${subView === 'standings' ? 'is-active' : ''}`}
            onClick={() => setSubView('standings')}
          >
            🏆 Live League Standings
          </button>
        </div>

        <div className="adm-row-actions">
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() => setGenOpen(true)}
          >
            ⚡ Auto-Generate Round-Robin
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={() => setCreateOpen(true)}
          >
            + Schedule Single Match
          </button>
        </div>
      </div>

      {subView === 'fixtures' ? (
        <section className="adm-card">
          <div className="adm-card-head">
            <div className="adm-pill-tabs">
              <button
                type="button"
                className={`adm-pill-tab ${resultFilter === 'pending' ? 'is-active' : ''}`}
                onClick={() => {
                  setResultFilter('pending')
                  setOffset(0)
                }}
              >
                Needs Score / Unplayed ({pendingTotal})
              </button>
              <button
                type="button"
                className={`adm-pill-tab ${resultFilter === 'completed' ? 'is-active' : ''}`}
                onClick={() => {
                  setResultFilter('completed')
                  setOffset(0)
                }}
              >
                Completed Results ({completedTotal})
              </button>
              <button
                type="button"
                className={`adm-pill-tab ${resultFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => {
                  setResultFilter('all')
                  setOffset(0)
                }}
              >
                All Fixtures ({allTotal})
              </button>
            </div>

            <div className="adm-row-actions">
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={() => void handleClearUnscheduled()}
              >
                Clear All Unscheduled
              </button>
            </div>
          </div>

          <div className="adm-toolbar">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setOffset(0)
              }}
              placeholder="Search fixture by club name or code…"
              className="adm-input adm-search-input"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as MatchSort)}
              className="adm-select"
              aria-label="Sort fixtures"
            >
              <option value="priority">Sort: Priority (Unscheduled & Overdue first)</option>
              <option value="latest">Sort: Latest Kickoff First</option>
            </select>
          </div>

          {loadingMatches ? (
            <div className="adm-empty">Loading fixtures…</div>
          ) : matches.length === 0 ? (
            <div className="adm-empty">
              <p>No fixtures match this filter.</p>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th style={{ width: 38 }}>
                      <input
                        type="checkbox"
                        checked={
                          matches.length > 0 && matches.every((m) => selectedMatchIds.has(m.id))
                        }
                        onChange={() => {
                          if (matches.every((m) => selectedMatchIds.has(m.id))) {
                            setSelectedMatchIds(new Set())
                          } else {
                            setSelectedMatchIds(new Set(matches.map((m) => m.id)))
                          }
                        }}
                      />
                    </th>
                    <th>Kickoff (MYT)</th>
                    <th>Home Club</th>
                    <th style={{ textAlign: 'center' }}>Score Entry</th>
                    <th>Away Club</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const pair = scores[m.id] ?? { hs: '', as: '' }
                    const hasResult = m.home_score !== null && m.away_score !== null
                    const isBusy = busyMatchId === m.id
                    return (
                      <tr key={m.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedMatchIds.has(m.id)}
                            onChange={() => {
                              setSelectedMatchIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(m.id)) next.delete(m.id)
                                else next.add(m.id)
                                return next
                              })
                            }}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`adm-kickoff-btn ${!m.kickoff ? 'is-unscheduled' : ''}`}
                            onClick={() => {
                              setScheduleTarget(m)
                              setScheduleValue(toDatetimeLocalValue(m.kickoff))
                            }}
                          >
                            📅 {formatKickoffDisplay(m.kickoff)}
                          </button>
                        </td>
                        <td>
                          <div className="adm-row-title">
                            {m.home_logo && (
                              <img src={m.home_logo} alt="" className="adm-crest-xs" />
                            )}
                            <strong>{m.home_name}</strong>
                            {m.home_code && <span className="adm-code-pill">{m.home_code}</span>}
                          </div>
                        </td>
                        <td>
                          <div className="adm-score-inline" style={{ justifyContent: 'center' }}>
                            <input
                              type="number"
                              min={0}
                              max={99}
                              placeholder="H"
                              value={pair.hs}
                              onChange={(e) =>
                                setScores((prev) => ({
                                  ...prev,
                                  [m.id]: { ...pair, hs: e.target.value },
                                }))
                              }
                              className="adm-score-input"
                            />
                            <span>–</span>
                            <input
                              type="number"
                              min={0}
                              max={99}
                              placeholder="A"
                              value={pair.as}
                              onChange={(e) =>
                                setScores((prev) => ({
                                  ...prev,
                                  [m.id]: { ...pair, as: e.target.value },
                                }))
                              }
                              className="adm-score-input"
                            />
                            <button
                              type="button"
                              className="adm-btn adm-btn-primary adm-btn-sm"
                              disabled={isBusy || pair.hs === '' || pair.as === ''}
                              onClick={() => void handleSaveScore(m)}
                            >
                              {isBusy ? '…' : hasResult ? 'Update' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="adm-btn adm-btn-secondary adm-btn-sm"
                              title="Fetch match score and player stats from EA Sports Pro Clubs"
                              onClick={() => setEaModalMatch(m)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            >
                              EA Sync
                            </button>
                            {m.ea_match_id && (
                              <span
                                className="adm-code-pill"
                                title={`Linked EA Match #${m.ea_match_id}`}
                                style={{ color: '#38bdf8', border: '1px solid rgba(56,189,248,0.4)', fontSize: '0.72rem' }}
                              >
                                EA Linked
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="adm-row-title">
                            {m.away_logo && (
                              <img src={m.away_logo} alt="" className="adm-crest-xs" />
                            )}
                            <strong>{m.away_name}</strong>
                            {m.away_code && <span className="adm-code-pill">{m.away_code}</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="adm-row-actions" style={{ justifyContent: 'flex-end' }}>
                            {hasResult && (
                              <button
                                type="button"
                                className="adm-btn adm-btn-ghost adm-btn-sm"
                                disabled={isBusy}
                                onClick={() => void handleWithdrawScore(m)}
                              >
                                Clear Score
                              </button>
                            )}
                            <button
                              type="button"
                              className="adm-btn adm-btn-danger adm-btn-sm"
                              disabled={isBusy}
                              onClick={() => void handleDeleteOne(m)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="adm-pagination">
              <span>
                Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <div className="adm-row-actions">
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {selectedMatchIds.size > 0 && (
            <div className="adm-bulk-bar">
              <strong>{selectedMatchIds.size} fixture(s) selected</strong>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                onClick={() => void handleBulkUnschedule()}
              >
                Set Unscheduled
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-danger adm-btn-sm"
                onClick={() => void handleBulkDelete()}
              >
                Delete Selected
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={() => setSelectedMatchIds(new Set())}
              >
                Clear Selection
              </button>
            </div>
          )}
        </section>
      ) : (
        /* Live League Standings View */
        <section className="adm-card">
          <div className="adm-card-head">
            <div>
              <span className="adm-eyebrow">LEAGUE TABLES</span>
              <h2>Standings Snapshot</h2>
            </div>
            <div className="adm-row-actions">
              <select
                value={selectedSeasonId ?? ''}
                onChange={(e) => {
                  setSelectedSeasonId(Number(e.target.value))
                  setSelectedDivisionSlug('')
                }}
                className="adm-select"
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.year}) {Boolean(s.is_current) ? '· Current' : ''}
                  </option>
                ))}
              </select>
              <select
                value={selectedDivisionSlug}
                onChange={(e) => setSelectedDivisionSlug(e.target.value)}
                className="adm-select"
              >
                <option value="">All Active Divisions</option>
                {divisions
                  .filter((d) => Boolean(d.is_active))
                  .map((d) => (
                    <option key={d.id} value={d.slug}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {loadingStandings ? (
            <div className="adm-empty">Loading standings…</div>
          ) : standingsByDivision.size === 0 ? (
            <div className="adm-empty">No standings rows found for this selection.</div>
          ) : (
            <div className="adm-stack">
              {[...standingsByDivision.entries()].map(([divName, rows]) => (
                <div key={divName} className="adm-subcard">
                  <h3 className="adm-subcard-title">{divName}</h3>
                  <div className="adm-table-wrap">
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th style={{ width: 48 }}>#</th>
                          <th>Club</th>
                          <th>P</th>
                          <th>W</th>
                          <th>D</th>
                          <th>L</th>
                          <th>GF</th>
                          <th>GA</th>
                          <th>GD</th>
                          <th>PTS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.club_id}>
                            <td>
                              <strong>{r.position}</strong>
                            </td>
                            <td>
                              <div className="adm-row-title">
                                {r.logo_local && (
                                  <img src={r.logo_local} alt="" className="adm-crest-xs" />
                                )}
                                <strong>{r.name}</strong>
                                {r.short_code && (
                                  <span className="adm-code-pill">{r.short_code}</span>
                                )}
                                {r.flag && <span>{r.flag}</span>}
                              </div>
                            </td>
                            <td>{r.played}</td>
                            <td>{r.won}</td>
                            <td>{r.drawn}</td>
                            <td>{r.lost}</td>
                            <td>{r.goals_for}</td>
                            <td>{r.goals_against}</td>
                            <td>
                              {r.goal_difference > 0
                                ? `+${r.goal_difference}`
                                : r.goal_difference}
                            </td>
                            <td>
                              <strong className="adm-pts">{r.points}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Schedule Single Match Modal */}
      {createOpen && (
        <div className="adm-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <h3>Schedule a Single Fixture</h3>
              <button type="button" className="adm-close-btn" onClick={() => setCreateOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateMatch} className="adm-form-stack">
              <label className="adm-field">
                <span>Division</span>
                <select
                  value={createDivisionId}
                  onChange={(e) => {
                    setCreateDivisionId(e.target.value)
                    setHomeSlug('')
                    setAwaySlug('')
                  }}
                  className="adm-select"
                >
                  {activeDivisions.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="adm-field-grid">
                <label className="adm-field">
                  <span>Home Club</span>
                  <select
                    required
                    value={homeSlug}
                    onChange={(e) => setHomeSlug(e.target.value)}
                    className="adm-select"
                  >
                    <option value="">Choose Home Club…</option>
                    {clubsInSelectedCreateDiv.map((c) => (
                      <option key={c.slug} value={c.slug} disabled={c.slug === awaySlug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="adm-field">
                  <span>Away Club</span>
                  <select
                    required
                    value={awaySlug}
                    onChange={(e) => setAwaySlug(e.target.value)}
                    className="adm-select"
                  >
                    <option value="">Choose Away Club…</option>
                    {clubsInSelectedCreateDiv.map((c) => (
                      <option key={c.slug} value={c.slug} disabled={c.slug === homeSlug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="adm-field">
                <span>Kickoff Date & Time (Optional — leave blank for unscheduled)</span>
                <input
                  type="datetime-local"
                  value={kickoffInput}
                  onChange={(e) => setKickoffInput(e.target.value)}
                  className="adm-input"
                />
              </label>

              <div className="adm-modal-foot">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={createBusy}>
                  {createBusy ? 'Creating…' : 'Create Fixture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auto-Generate Round Robin Wizard Modal */}
      <GenerateRoundRobinWizardModal
        isOpen={genOpen}
        onClose={() => setGenOpen(false)}
        onSuccess={(msg) => {
          report('ok', msg)
          void loadMatches()
        }}
        seasonId={selectedSeasonId ?? undefined}
        divisions={divisions}
      />



      {/* EA FC Pro Clubs Match Result Modal */}
      <EaMatchResultModal
        isOpen={eaModalMatch !== null}
        match={eaModalMatch}
        onClose={() => setEaModalMatch(null)}
        onSuccess={(msg) => {
          report('ok', msg)
          void loadMatches()
        }}
        guard={guard}
        report={report}
      />

      {/* Edit Kickoff Modal */}
      {scheduleTarget && (
        <div className="adm-modal-backdrop" onClick={() => setScheduleTarget(null)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <h3>
                Kickoff: {scheduleTarget.home_name} vs {scheduleTarget.away_name}
              </h3>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setScheduleTarget(null)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSaveKickoff} className="adm-form-stack">
              <label className="adm-field">
                <span>Kickoff Date & Time (Malaysia Time)</span>
                <input
                  type="datetime-local"
                  value={scheduleValue}
                  onChange={(e) => setScheduleValue(e.target.value)}
                  className="adm-input"
                />
              </label>
              <div className="adm-modal-foot" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="adm-btn adm-btn-danger adm-btn-sm"
                  onClick={() => void handleSetUnscheduled()}
                  disabled={scheduleBusy}
                >
                  ✕ Set Unscheduled
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn-ghost adm-btn-sm"
                    onClick={() => setScheduleTarget(null)}
                    disabled={scheduleBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="adm-btn adm-btn-primary adm-btn-sm"
                    disabled={scheduleBusy}
                  >
                    {scheduleBusy ? 'Saving…' : 'Save Kickoff'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
