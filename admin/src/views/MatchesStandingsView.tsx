import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { GenerateRoundRobinWizardModal } from './GenerateRoundRobinWizardModal'
import { EaMatchResultModal } from './EaMatchResultModal'
import { ManualMatchStatsModal } from './ManualMatchStatsModal'
import {
  createMatch,
  deleteMatch,
  deleteMatches,
  deleteUnscheduledMatches,
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
  type Standing,
} from '../api'
import {
  formatKickoffDisplay,
  toDatetimeLocalValue,
  type Guard,
  type Report,
} from '../utils'

type SubView = 'fixtures' | 'standings'

interface GroupedRound {
  roundNumber: number
  date: string | null
  dayName: string | null
  matches: Match[]
  completedCount: number
}

function extractDatePart(kickoff: string | null | undefined): string | null {
  if (!kickoff) return null
  const m = String(kickoff).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function extractTimePart(kickoff: string | null | undefined): string | null {
  if (!kickoff) return null
  const str = String(kickoff).trim()
  const m = str.match(/[T ](\d{2}:\d{2})/)
  if (m) return m[1]
  const d = new Date(str)
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  return null
}

function formatDayName(dateStr: string | null): string | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getUTCDay()] ?? null
}

function groupMatchesIntoRounds(matches: Match[]): GroupedRound[] {
  if (matches.length === 0) return []

  // Sort chronologically first so greedy round assignment follows schedule order
  const sorted = [...matches].sort((a, b) => {
    const rA = a.round_number ?? 999999
    const rB = b.round_number ?? 999999
    if (rA !== rB) return rA - rB
    const kA = a.kickoff ? String(a.kickoff) : '9999-99-99'
    const kB = b.kickoff ? String(b.kickoff) : '9999-99-99'
    if (kA !== kB) return kA.localeCompare(kB)
    return a.id - b.id
  })

  const roundBuckets = new Map<number, Match[]>()
  const roundUsedClubs = new Map<number, Set<string>>()
  const roundDateMap = new Map<number, string | null>()

  for (const m of sorted) {
    const homeKey = String(m.home_club_id ?? m.home_slug)
    const awayKey = String(m.away_club_id ?? m.away_slug)
    const mDate = extractDatePart(m.kickoff)

    let targetRound = m.round_number && m.round_number > 0 ? m.round_number : null

    if (targetRound === null) {
      // Find earliest round where neither team has played (and if dated, matches round date)
      let candidate = 1
      while (true) {
        const used = roundUsedClubs.get(candidate)
        const rDate = roundDateMap.get(candidate)
        const dateCompatible = !mDate || !rDate || mDate === rDate
        if (!used) {
          targetRound = candidate
          break
        }
        if (!used.has(homeKey) && !used.has(awayKey) && dateCompatible) {
          targetRound = candidate
          break
        }
        candidate++
      }
    }

    const list = roundBuckets.get(targetRound) ?? []
    list.push(m)
    roundBuckets.set(targetRound, list)

    const used = roundUsedClubs.get(targetRound) ?? new Set<string>()
    used.add(homeKey)
    used.add(awayKey)
    roundUsedClubs.set(targetRound, used)

    if (mDate && !roundDateMap.get(targetRound)) {
      roundDateMap.set(targetRound, mDate)
    }
  }

  const rounds: GroupedRound[] = [...roundBuckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, roundMatches]) => {
      const firstDated = roundMatches.find((x) => extractDatePart(x.kickoff))
      const date = firstDated ? extractDatePart(firstDated.kickoff) : null
      const dayName = formatDayName(date)
      const completedCount = roundMatches.filter(
        (x) => x.home_score !== null && x.away_score !== null,
      ).length
      return {
        roundNumber,
        date,
        dayName,
        matches: roundMatches,
        completedCount,
      }
    })

  return rounds
}

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
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | 'all'>('all')
  const [selectedDivisionSlug, setSelectedDivisionSlug] = useState<string>('')

  // Matches state
  const [matches, setMatches] = useState<Match[]>([])
  const [allTotal, setAllTotal] = useState(0)
  const [, setPendingTotal] = useState(0)
  const [, setCompletedTotal] = useState(0)
  const [resultFilter, setResultFilter] = useState<'all' | 'pending' | 'completed'>('all')
  const [roundFilter, setRoundFilter] = useState<string>('all')
  const [collapsedRounds, setCollapsedRounds] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
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
  const [manualStatsMatch, setManualStatsMatch] = useState<Match | null>(null)

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
      const seasonsList = await guard(getAdminSeasons, 'Could not load seasons')
      setSeasons(seasonsList)
      const current = seasonsList.find((s) => Boolean(s.is_current)) ?? seasonsList[0] ?? null
      const activeSeasonId = selectedSeasonId ?? current?.id ?? null
      if (current && selectedSeasonId === null) {
        setSelectedSeasonId(current.id)
      }

      const [divsList, clubsList] = await Promise.all([
        guard(() => getDivisions(activeSeasonId ?? undefined), 'Could not load divisions'),
        guard(() => getClubs(activeSeasonId ?? undefined), 'Could not load clubs'),
      ])
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
            limit: 500,
            offset: 0,
            result: 'all',
            search: '',
            seasonId: selectedSeasonId,
            includeDrafts: true,
          }),
        'Could not load matches',
      )
      setMatches(page.matches)
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
  }, [guard, selectedSeasonId])

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

  // Compute division match counts & rounds
  const activeDivisions = useMemo(
    () => divisions.filter((d) => Boolean(d.is_active)),
    [divisions],
  )

  const divisionMatchesMap = useMemo(() => {
    const map = new Map<number, Match[]>()
    for (const m of matches) {
      if (m.division_id != null) {
        const list = map.get(m.division_id) ?? []
        list.push(m)
        map.set(m.division_id, list)
      }
    }
    return map
  }, [matches])

  // Matches scoped to selected division
  const divisionScopedMatches = useMemo(() => {
    if (selectedDivisionId === 'all') return matches
    return matches.filter((m) => m.division_id === selectedDivisionId)
  }, [matches, selectedDivisionId])

  // Group into rounds BEFORE filtering by search/result so round numbers remain stable
  const allRounds = useMemo(() => {
    if (selectedDivisionId === 'all' && divisionMatchesMap.size > 1) {
      // Group per division then merge by roundNumber
      const mergedMap = new Map<number, Match[]>()
      for (const divMatches of divisionMatchesMap.values()) {
        const divRounds = groupMatchesIntoRounds(divMatches)
        for (const r of divRounds) {
          const list = mergedMap.get(r.roundNumber) ?? []
          list.push(...r.matches)
          mergedMap.set(r.roundNumber, list)
        }
      }
      // Also include any matches without division_id
      const noDivMatches = matches.filter((m) => m.division_id == null)
      if (noDivMatches.length > 0) {
        const extra = groupMatchesIntoRounds(noDivMatches)
        for (const r of extra) {
          const list = mergedMap.get(r.roundNumber) ?? []
          list.push(...r.matches)
          mergedMap.set(r.roundNumber, list)
        }
      }
      return [...mergedMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([roundNumber, roundMatches]) => {
          const firstDated = roundMatches.find((x) => extractDatePart(x.kickoff))
          const date = firstDated ? extractDatePart(firstDated.kickoff) : null
          const dayName = formatDayName(date)
          const completedCount = roundMatches.filter(
            (x) => x.home_score !== null && x.away_score !== null,
          ).length
          return { roundNumber, date, dayName, matches: roundMatches, completedCount }
        })
    }
    return groupMatchesIntoRounds(divisionScopedMatches)
  }, [selectedDivisionId, divisionMatchesMap, divisionScopedMatches, matches])

  // Apply search, resultFilter, and roundFilter to rounds
  const displayedRounds = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRounds
      .filter((r) => roundFilter === 'all' || String(r.roundNumber) === roundFilter)
      .map((r) => {
        const filteredMatches = r.matches.filter((m) => {
          const hasScore = m.home_score !== null && m.away_score !== null
          if (resultFilter === 'pending' && hasScore) return false
          if (resultFilter === 'completed' && !hasScore) return false
          if (q) {
            const matchText = `${m.home_name} ${m.home_code ?? ''} ${m.away_name} ${m.away_code ?? ''} ${m.division_name ?? ''}`.toLowerCase()
            if (!matchText.includes(q)) return false
          }
          return true
        })
        return {
          ...r,
          matches: filteredMatches,
        }
      })
      .filter((r) => r.matches.length > 0)
  }, [allRounds, roundFilter, resultFilter, search])

  const scopedAllCount = divisionScopedMatches.length
  const scopedCompletedCount = divisionScopedMatches.filter(
    (m) => m.home_score !== null && m.away_score !== null,
  ).length
  const scopedPendingCount = scopedAllCount - scopedCompletedCount

  const toggleRoundCollapse = (roundNumber: number) => {
    if (roundFilter !== 'all') return
    setCollapsedRounds((prev) => {
      const next = new Set(prev)
      if (next.has(roundNumber)) next.delete(roundNumber)
      else next.add(roundNumber)
      return next
    })
  }

  const expandAllRounds = () => setCollapsedRounds(new Set())
  const collapseAllRounds = () =>
    setCollapsedRounds(new Set(allRounds.map((r) => r.roundNumber)))

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
        () => createMatch(homeSlug, awaySlug, kickoffInput || null, selectedSeasonId ?? undefined),
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
            ⚽ Match Centre & Round Schedule ({allTotal})
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
          <select
            value={selectedSeasonId ?? ''}
            onChange={(e) => {
              const nextId = Number(e.target.value)
              setSelectedSeasonId(nextId)
              setSelectedDivisionId('all')
              setRoundFilter('all')
            }}
            className="adm-select"
            aria-label="Select season"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.year}){Boolean(s.is_current) ? ' · Live' : Boolean(s.is_draft) ? ' · Draft' : ''}
              </option>
            ))}
          </select>
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
          {/* Summary Metric Stats (Matching Step 4 of Round-Robin Wizard) */}
          <div className="adm-wizard-stats" style={{ marginBottom: 16 }}>
            <div className="adm-stat-box">
              <span className="adm-stat-label">Total Matchdays</span>
              <strong className="adm-stat-val">{allRounds.length} Rounds</strong>
            </div>
            <div className="adm-stat-box">
              <span className="adm-stat-label">Total Fixtures</span>
              <strong className="adm-stat-val">{scopedAllCount} Matches</strong>
            </div>
            <div className="adm-stat-box">
              <span className="adm-stat-label">Needs Score / Unplayed</span>
              <strong className="adm-stat-val" style={{ color: '#f59e0b' }}>
                {scopedPendingCount}
              </strong>
            </div>
            <div className="adm-stat-box">
              <span className="adm-stat-label">Completed Results</span>
              <strong className="adm-stat-val adm-text-accent">
                {scopedCompletedCount}
              </strong>
            </div>
          </div>

          {/* Division Tabs (Matching Step 4 of Round-Robin Wizard) */}
          {activeDivisions.length > 0 && (
            <div className="adm-division-tabs" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className={`adm-division-tab ${selectedDivisionId === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedDivisionId('all')
                  setRoundFilter('all')
                }}
              >
                All Divisions
                <span className="adm-pill adm-pill-sm">{matches.length} matches</span>
              </button>
              {activeDivisions.map((div) => {
                const count = divisionMatchesMap.get(div.id)?.length ?? 0
                return (
                  <button
                    key={div.id}
                    type="button"
                    className={`adm-division-tab ${selectedDivisionId === div.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedDivisionId(div.id)
                      setRoundFilter('all')
                    }}
                  >
                    {div.name}
                    <span className="adm-pill adm-pill-sm">{count} matches</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Filter / Jump to Round Bar */}
          <div className="adm-preview-filter-bar" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div className="adm-field-inline">
                <span>Jump to Round:</span>
                <select
                  value={roundFilter}
                  onChange={(e) => setRoundFilter(e.target.value)}
                  className="adm-select adm-select-sm"
                >
                  <option value="all">All Rounds ({allRounds.length})</option>
                  {allRounds.map((r) => (
                    <option key={r.roundNumber} value={String(r.roundNumber)}>
                      Round {r.roundNumber} {r.date ? `(${r.date})` : ''} · {r.matches.length} matches
                    </option>
                  ))}
                </select>
              </div>

              <div className="adm-pill-tabs">
                <button
                  type="button"
                  className={`adm-pill-tab ${resultFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setResultFilter('all')}
                >
                  All ({scopedAllCount})
                </button>
                <button
                  type="button"
                  className={`adm-pill-tab ${resultFilter === 'pending' ? 'is-active' : ''}`}
                  onClick={() => setResultFilter('pending')}
                >
                  Needs Score ({scopedPendingCount})
                </button>
                <button
                  type="button"
                  className={`adm-pill-tab ${resultFilter === 'completed' ? 'is-active' : ''}`}
                  onClick={() => setResultFilter('completed')}
                >
                  Completed ({scopedCompletedCount})
                </button>
              </div>

              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search club name or code…"
                className="adm-input adm-input-sm"
                style={{ minWidth: 210 }}
              />
            </div>

            <div className="adm-preview-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {roundFilter === 'all' && allRounds.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={expandAllRounds}
                    className="adm-btn adm-btn-ghost adm-btn-sm"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllRounds}
                    className="adm-btn adm-btn-ghost adm-btn-sm"
                  >
                    Collapse All
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => void loadMatches()}
                className="adm-btn adm-btn-ghost adm-btn-sm"
                title="Refresh fixtures"
              >
                ↻ Refresh
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={() => void handleClearUnscheduled()}
              >
                Clear Unscheduled
              </button>
            </div>
          </div>

          {selectedMatchIds.size > 0 && (
            <div className="adm-bulk-bar" style={{ marginBottom: 14 }}>
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

          {loadingMatches ? (
            <div className="adm-empty">Loading fixtures…</div>
          ) : displayedRounds.length === 0 ? (
            <div className="adm-empty">
              <p>No fixtures match this filter.</p>
            </div>
          ) : (
            <div className="adm-preview-rounds-container" style={{ maxHeight: 'none', overflow: 'visible' }}>
              {displayedRounds.map((rnd) => {
                const isCollapsed = collapsedRounds.has(rnd.roundNumber) && roundFilter === 'all'
                const allInRoundSelected =
                  rnd.matches.length > 0 && rnd.matches.every((m) => selectedMatchIds.has(m.id))

                return (
                  <div key={rnd.roundNumber} className="adm-preview-round-card">
                    <div
                      className="adm-preview-round-header"
                      onClick={() => toggleRoundCollapse(rnd.roundNumber)}
                      style={{ cursor: roundFilter === 'all' ? 'pointer' : 'default' }}
                    >
                      <div className="adm-round-title">
                        <input
                          type="checkbox"
                          checked={allInRoundSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => {
                            setSelectedMatchIds((prev) => {
                              const next = new Set(prev)
                              if (allInRoundSelected) {
                                for (const m of rnd.matches) next.delete(m.id)
                              } else {
                                for (const m of rnd.matches) next.add(m.id)
                              }
                              return next
                            })
                          }}
                          title={`Select all fixtures in Round ${rnd.roundNumber}`}
                        />
                        <span className="adm-round-badge">Round {rnd.roundNumber}</span>
                        {rnd.date ? (
                          <span className="adm-round-date">
                            📅 {rnd.dayName}, {rnd.date}
                          </span>
                        ) : (
                          <span className="adm-round-date adm-text-muted">
                            ⚪ Unscheduled Kickoff
                          </span>
                        )}
                      </div>

                      <div className="adm-round-header-right">
                        <span
                          className={`adm-pill adm-pill-sm ${
                            rnd.completedCount === rnd.matches.length
                              ? 'adm-pill-success'
                              : rnd.completedCount > 0
                              ? 'adm-pill-accent'
                              : ''
                          }`}
                        >
                          {rnd.completedCount}/{rnd.matches.length} played
                        </span>
                        <span className="adm-round-count">{rnd.matches.length} fixtures</span>
                        {roundFilter === 'all' && (
                          <span className="adm-collapse-arrow">{isCollapsed ? '▼' : '▲'}</span>
                        )}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="adm-preview-matches-list">
                        {rnd.matches.map((m) => {
                          const pair = scores[m.id] ?? { hs: '', as: '' }
                          const hasResult = m.home_score !== null && m.away_score !== null
                          const isBusy = busyMatchId === m.id
                          const timeStr = extractTimePart(m.kickoff)

                          return (
                            <div
                              key={m.id}
                              className="adm-preview-match-row"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: 10,
                                padding: '10px 14px',
                              }}
                            >
                              {/* Left: Checkbox + Kickoff Time Button + Division Badge */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 165 }}>
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
                                <button
                                  type="button"
                                  className={`adm-kickoff-btn ${!m.kickoff ? 'is-unscheduled' : ''}`}
                                  onClick={() => {
                                    setScheduleTarget(m)
                                    setScheduleValue(toDatetimeLocalValue(m.kickoff))
                                  }}
                                  title={`Edit Kickoff (${formatKickoffDisplay(m.kickoff)})`}
                                >
                                  {timeStr ? `🕐 ${timeStr}` : `📅 ${formatKickoffDisplay(m.kickoff)}`}
                                </button>
                                {selectedDivisionId === 'all' && m.division_name && (
                                  <span className="adm-code-pill" style={{ fontSize: '0.7rem' }}>
                                    {m.division_name}
                                  </span>
                                )}
                              </div>

                              {/* Center: Home Club + Inline Score Inputs + Away Club */}
                              <div
                                className="adm-preview-pairing"
                                style={{
                                  flex: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 12,
                                  minWidth: 340,
                                }}
                              >
                                <div className="adm-team-cell home" style={{ flex: 1, justifyContent: 'flex-end' }}>
                                  <span className="adm-team-name">{m.home_name}</span>
                                  {m.home_code && <span className="adm-code-pill">{m.home_code}</span>}
                                  {m.home_logo ? (
                                    <img src={m.home_logo} alt="" className="adm-team-avatar" />
                                  ) : (
                                    <span className="adm-team-avatar-ph">
                                      {m.home_name.slice(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                </div>

                                <div className="adm-score-inline" style={{ justifyContent: 'center', gap: 6 }}>
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
                                  <span className="adm-vs-pill">{hasResult ? ':' : 'VS'}</span>
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
                                    className="adm-btn adm-btn-primary adm-btn-xs"
                                    disabled={isBusy || pair.hs === '' || pair.as === ''}
                                    onClick={() => void handleSaveScore(m)}
                                  >
                                    {isBusy ? '…' : hasResult ? 'Update' : 'Save'}
                                  </button>
                                </div>

                                <div className="adm-team-cell away" style={{ flex: 1, justifyContent: 'flex-start' }}>
                                  {m.away_logo ? (
                                    <img src={m.away_logo} alt="" className="adm-team-avatar" />
                                  ) : (
                                    <span className="adm-team-avatar-ph">
                                      {m.away_name.slice(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                  <span className="adm-team-name">{m.away_name}</span>
                                  {m.away_code && <span className="adm-code-pill">{m.away_code}</span>}
                                </div>
                              </div>

                              {/* Right: EA Sync, Manual Stats, Clear, Delete */}
                              <div
                                className="adm-row-actions"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}
                              >
                                <button
                                  type="button"
                                  className="adm-btn adm-btn-secondary adm-btn-xs"
                                  title="Fetch Friendly Match score & player stats from EA Sports Pro Clubs"
                                  onClick={() => setEaModalMatch(m)}
                                >
                                  EA Sync
                                </button>
                                <button
                                  type="button"
                                  className="adm-btn adm-btn-secondary adm-btn-xs"
                                  title="Open full EA FC 26 Match Summary & Player Performance Editor"
                                  onClick={() => setManualStatsMatch(m)}
                                >
                                  Manual Stats
                                </button>
                                {m.ea_match_id && (
                                  <span
                                    className="adm-code-pill"
                                    title={`Linked EA Match #${m.ea_match_id}`}
                                    style={{
                                      color: '#38bdf8',
                                      border: '1px solid rgba(56,189,248,0.4)',
                                      fontSize: '0.68rem',
                                    }}
                                  >
                                    EA Linked
                                  </span>
                                )}
                                {hasResult && (
                                  <button
                                    type="button"
                                    className="adm-btn adm-btn-ghost adm-btn-xs"
                                    disabled={isBusy}
                                    onClick={() => void handleWithdrawScore(m)}
                                  >
                                    Clear
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="adm-btn adm-btn-danger adm-btn-xs"
                                  disabled={isBusy}
                                  onClick={() => void handleDeleteOne(m)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
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
        seasons={seasons}
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

      {/* Manual Match Stats Modal */}
      <ManualMatchStatsModal
        isOpen={manualStatsMatch !== null}
        match={manualStatsMatch}
        onClose={() => setManualStatsMatch(null)}
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
