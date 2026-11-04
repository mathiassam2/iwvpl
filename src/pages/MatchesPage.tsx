import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { MatchRow, StatTile } from '@/components/league'
import { Container, EmptyState, Section, Select } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { cx, stripFlag } from '@/lib/format'
import {
  getLiveMatches,
  getLiveSeasonClubs,
  getLiveSeasons,
  liveLeagueEnabled,
  type LeagueClub,
  type LeagueSeason,
} from '@/lib/liveLeague'
import { matchIndexOf } from '@/lib/match'
import { useSeasonName } from '@/lib/season'
import type { Match } from '@/types/site'

interface RoundDateSubgroup {
  key: string
  dateLabel: string
  isUnscheduled: boolean
  matches: Match[]
}

interface RoundGroup {
  key: string
  roundNum: number
  label: string
  dateLabel: string
  unscheduledCount: number
  dateGroups: RoundDateSubgroup[]
  matches: Match[]
  completedCount: number
}

function extractMatchYmd(m: Match): string | null {
  if (m.kickoff) {
    const match = String(m.kickoff).trim().match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
  }
  if (m.date && !/unscheduled|tbd/i.test(m.date)) {
    const dt = new Date(m.date)
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10)
    }
  }
  return null
}

function formatYmdShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatYmdFull(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function divisionSortRank(name: string): number {
  const lower = name.toLowerCase().trim()
  if (lower.includes('premier') || lower.includes('super')) return 0
  if (/\b(one|1|i)\b/.test(lower)) return 1
  if (/\b(two|2|ii)\b/.test(lower)) return 2
  if (/\b(three|3|iii)\b/.test(lower)) return 3
  if (/\b(four|4|iv)\b/.test(lower)) return 4
  if (/\b(five|5|v)\b/.test(lower)) return 5
  const numMatch = lower.match(/\d+/)
  if (numMatch) return Number(numMatch[0])
  return 999
}

function buildRoundGroups(matches: Match[]): RoundGroup[] {
  if (matches.length === 0) return []

  const hasExplicitRounds = matches.some((m) => m.roundNumber != null && m.roundNumber > 0)
  const map = new Map<string, Match[]>()

  if (hasExplicitRounds) {
    const sorted = [...matches].sort((a, b) => {
      const ra = a.roundNumber ?? 9999
      const rb = b.roundNumber ?? 9999
      if (ra !== rb) return ra - rb
      const ka = a.kickoff || '9999-12-31'
      const kb = b.kickoff || '9999-12-31'
      if (ka !== kb) return ka.localeCompare(kb)
      return (a.id ?? 0) - (b.id ?? 0)
    })
    for (const m of sorted) {
      const key = m.roundNumber != null && m.roundNumber > 0 ? `round-${m.roundNumber}` : 'unscheduled'
      const list = map.get(key) ?? []
      list.push(m)
      map.set(key, list)
    }
  } else {
    // Group by calendar date (YYYY-MM-DD) in chronological order as Round 1, Round 2, ...
    const sorted = [...matches].sort((a, b) => {
      if (!a.kickoff && !b.kickoff) return (a.id ?? 0) - (b.id ?? 0)
      if (!a.kickoff) return 1
      if (!b.kickoff) return -1
      const cmp = a.kickoff.localeCompare(b.kickoff)
      if (cmp !== 0) return cmp
      return (a.id ?? 0) - (b.id ?? 0)
    })
    for (const m of sorted) {
      const dayKey = m.kickoff ? m.kickoff.slice(0, 10) : m.date || 'unscheduled'
      const list = map.get(dayKey) ?? []
      list.push(m)
      map.set(dayKey, list)
    }
  }

  const groups: RoundGroup[] = []
  let idx = 1
  for (const [key, list] of map.entries()) {
    const explicitRound = list[0]?.roundNumber
    const roundNum = explicitRound && explicitRound > 0 ? explicitRound : idx

    const byYmd = new Map<string, Match[]>()
    const unscheduled: Match[] = []
    for (const m of list) {
      const ymd = extractMatchYmd(m)
      if (ymd) {
        const arr = byYmd.get(ymd) ?? []
        arr.push(m)
        byYmd.set(ymd, arr)
      } else {
        unscheduled.push(m)
      }
    }

    const sortedYmds = [...byYmd.keys()].sort((a, b) => a.localeCompare(b))
    const dateGroups: RoundDateSubgroup[] = sortedYmds.map((ymd) => ({
      key: ymd,
      dateLabel: formatYmdFull(ymd),
      isUnscheduled: false,
      matches: byYmd.get(ymd)!,
    }))
    if (unscheduled.length > 0) {
      dateGroups.push({
        key: 'unscheduled',
        dateLabel: 'Unscheduled / Kick-off TBD',
        isUnscheduled: true,
        matches: unscheduled,
      })
    }

    const dateLabel =
      sortedYmds.length === 0
        ? 'Unscheduled / Kick-off TBD'
        : sortedYmds.length === 1
          ? formatYmdFull(sortedYmds[0])
          : `${formatYmdShort(sortedYmds[0])} – ${formatYmdShort(sortedYmds[sortedYmds.length - 1])} (${sortedYmds.length} Matchdays)`

    const completedCount = list.filter((m) => m.hs !== '' && m.as !== '').length
    groups.push({
      key,
      roundNum,
      label: key === 'unscheduled' && !explicitRound ? `Game Week ${roundNum} (TBD)` : `Game Week ${roundNum}`,
      dateLabel,
      unscheduledCount: unscheduled.length,
      dateGroups,
      matches: list,
      completedCount,
    })
    idx += 1
  }

  return groups.sort((a, b) => a.roundNum - b.roundNum)
}

export default function MatchesPage() {
  const seasonName = useSeasonName()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = searchParams.get('tab') || 'all'
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'results'>(
    initialTab === 'upcoming' ? 'upcoming' : initialTab === 'results' ? 'results' : 'all',
  )
  const [divisionFilter, setDivisionFilter] = useState<string>('all')
  const [selectedRoundKey, setSelectedRoundKey] = useState<string>('all')
  const [collapsedRounds, setCollapsedRounds] = useState<Record<string, boolean>>({})
  const [team, setTeam] = useState('all')

  const [allMatches, setAllMatches] = useState<Match[]>([])
  const [seasonClubs, setSeasonClubs] = useState<LeagueClub[]>([])
  const [seasons, setSeasons] = useState<LeagueSeason[]>([])
  const [seasonId, setSeasonId] = useState<number | null>(null)

  const [loading, setLoading] = useState(liveLeagueEnabled)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  // 1. Load seasons list
  useEffect(() => {
    if (!liveLeagueEnabled) {
      setAllMatches(siteData.results)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getLiveSeasons(controller.signal)
      .then((availableSeasons) => {
        setSeasons(availableSeasons)
        if (availableSeasons.length === 0) setLoading(false)
        setSeasonId((current) =>
          current != null && availableSeasons.some((season) => season.id === current)
            ? current
            : availableSeasons.find((season) => Boolean(season.is_current))?.id ??
                availableSeasons[0]?.id ??
                null,
        )
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load seasons.')
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [reload])

  // 2. Load clubs for chosen season
  useEffect(() => {
    if (!liveLeagueEnabled || seasonId === null) return
    const controller = new AbortController()
    setSeasonClubs([])
    setTeam('all')

    getLiveSeasonClubs(controller.signal, seasonId)
      .then(setSeasonClubs)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load season clubs.')
        }
      })

    return () => controller.abort()
  }, [seasonId])

  // 3. Load all matches for season
  useEffect(() => {
    if (!liveLeagueEnabled || seasonId === null) return
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getLiveMatches(controller.signal, {
      seasonId,
      limit: 500,
    })
      .then(({ matches }) => {
        setAllMatches(matches)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load matches.')
          setAllMatches(siteData.results)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [seasonId, reload])

  // Available divisions in this season's matches (sorted in natural tier order: Division One -> Division Two -> ...)
  const divisions = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of allMatches) {
      if (m.divisionName) {
        const key = m.divisionId != null ? String(m.divisionId) : m.divisionName
        map.set(key, m.divisionName)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        const rankDiff = divisionSortRank(a.name) - divisionSortRank(b.name)
        if (rankDiff !== 0) return rankDiff
        const numA = Number(a.id)
        const numB = Number(b.id)
        if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
          return numA - numB
        }
        return a.name.localeCompare(b.name)
      })
  }, [allMatches])

  // Clubs filter options
  const clubOptions = useMemo(() => {
    const clubsMap = new Map<string, string>()
    for (const m of allMatches) {
      for (const sideName of [m.home, m.away]) {
        if (sideName) {
          const name = stripFlag(sideName).trim()
          if (name && !clubsMap.has(name)) {
            const matchedSeasonClub = seasonClubs.find(
              (c) => stripFlag(c.name).toLowerCase() === name.toLowerCase(),
            )
            const slug = matchedSeasonClub?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            clubsMap.set(name, slug)
          }
        }
      }
    }
    return Array.from(clubsMap.entries())
      .map(([name, slug]) => ({ value: slug, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allMatches, seasonClubs])

  // Matches scoped to selected division & club (before status filter)
  const scopedMatches = useMemo(() => {
    let result = allMatches

    if (divisionFilter !== 'all') {
      result = result.filter(
        (m) =>
          String(m.divisionId) === divisionFilter || m.divisionName === divisionFilter,
      )
    }

    const cleanTeam = String(team || 'all').trim().toLowerCase()
    if (cleanTeam !== 'all') {
      result = result.filter((m) => {
        const homeName = stripFlag(m.home).toLowerCase().trim()
        const awayName = stripFlag(m.away).toLowerCase().trim()
        const homeSlug = homeName.replace(/[^a-z0-9]+/g, '-')
        const awaySlug = awayName.replace(/[^a-z0-9]+/g, '-')
        return (
          homeSlug === cleanTeam ||
          awaySlug === cleanTeam ||
          homeName === cleanTeam ||
          awayName === cleanTeam ||
          homeName.includes(cleanTeam) ||
          awayName.includes(cleanTeam)
        )
      })
    }

    return result
  }, [allMatches, divisionFilter, team])

  // Filter matches by status
  const filteredMatches = useMemo(() => {
    if (statusFilter === 'upcoming') {
      return scopedMatches.filter((m) => m.hs === '' || m.as === '')
    }
    if (statusFilter === 'results') {
      return scopedMatches.filter((m) => m.hs !== '' && m.as !== '')
    }
    return scopedMatches
  }, [scopedMatches, statusFilter])

  // Build Round-by-Round groups (like Step 4 of Round-Robin generator)
  const roundGroups = useMemo(() => buildRoundGroups(filteredMatches), [filteredMatches])

  const visibleRoundGroups = useMemo(() => {
    if (selectedRoundKey === 'all') return roundGroups
    return roundGroups.filter((rg) => rg.key === selectedRoundKey)
  }, [roundGroups, selectedRoundKey])

  // Scoped stats (reflects selected division & club)
  const totalCompleted = useMemo(
    () => scopedMatches.filter((m) => m.hs !== '' && m.as !== '').length,
    [scopedMatches],
  )
  const totalUpcoming = scopedMatches.length - totalCompleted
  const totalRoundsCount = useMemo(() => buildRoundGroups(scopedMatches).length, [scopedMatches])

  const handleStatusChange = (next: 'all' | 'upcoming' | 'results') => {
    setStatusFilter(next)
    const nextParams = new URLSearchParams(searchParams)
    if (next === 'all') nextParams.delete('tab')
    else nextParams.set('tab', next)
    setSearchParams(nextParams, { replace: true })
  }

  const toggleRound = (key: string) => {
    setCollapsedRounds((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const expandAll = () => setCollapsedRounds({})
  const collapseAll = () => {
    const next: Record<string, boolean> = {}
    for (const rg of roundGroups) next[rg.key] = true
    setCollapsedRounds(next)
  }

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Fixtures & Results"
        title="Matches"
        lede={`Game-week-by-game-week schedule, kick-off times and official results for ${seasonName}. Published in SGT (UTC+8).`}
      />

      <Section>
        <Container size="wide">
          {/* Top summary stats (matching Round-Robin Step 4 summary boxes) */}
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            <StatTile label="Total Fixtures" value={scopedMatches.length} hint="In current view" />
            <StatTile label="Total Game Weeks" value={totalRoundsCount} hint="Match game weeks" />
            <StatTile label="Upcoming Matches" value={totalUpcoming} hint="Awaiting kick-off" />
            <StatTile label="Completed Results" value={totalCompleted} hint="Scores recorded" />
          </div>

          {/* Division Tabs if multiple divisions exist */}
          {divisions.length > 1 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDivisionFilter('all')
                  setSelectedRoundKey('all')
                }}
                className={cx(
                  'rounded-xl px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition-all',
                  divisionFilter === 'all'
                    ? 'bg-[var(--accent-solid)] text-[var(--on-volt)] shadow-sm'
                    : 'border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:text-white',
                )}
              >
                All Divisions ({allMatches.length})
              </button>
              {divisions.map((d) => {
                const count = allMatches.filter(
                  (m) => String(m.divisionId) === d.id || m.divisionName === d.name,
                ).length
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setDivisionFilter(d.id)
                      setSelectedRoundKey('all')
                    }}
                    className={cx(
                      'rounded-xl px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition-all',
                      divisionFilter === d.id
                        ? 'bg-[var(--accent-solid)] text-[var(--on-volt)] shadow-sm'
                        : 'border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:text-white',
                    )}
                  >
                    {d.name} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {/* Primary Controls Bar: Status Pills + Jump to Round + Club + Season + Expand/Collapse */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
            {/* Status filter pills */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[var(--surface-2)] p-1">
              {(
                [
                  { id: 'all', label: `All (${scopedMatches.length})` },
                  { id: 'upcoming', label: `Upcoming (${totalUpcoming})` },
                  { id: 'results', label: `Results (${totalCompleted})` },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleStatusChange(item.id)}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
                    statusFilter === item.id
                      ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                      : 'text-[var(--text-muted)] hover:text-white',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Filters & Expand/Collapse Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {seasons.length > 0 && (
                <div className="w-full sm:w-auto sm:min-w-64">
                  <Select
                    value={seasonId != null ? String(seasonId) : ''}
                    onChange={(val) => setSeasonId(Number(val))}
                    options={seasons.map((s) => ({
                      value: String(s.id),
                      label: `${s.name}${s.is_current ? ' (Current)' : ''}`,
                    }))}
                  />
                </div>
              )}

              {roundGroups.length > 1 && (
                <div className="w-full sm:w-auto sm:min-w-48">
                  <Select
                    value={selectedRoundKey}
                    onChange={(val) => setSelectedRoundKey(val || 'all')}
                    options={[
                      { value: 'all', label: `All Game Weeks (${roundGroups.length})` },
                      ...roundGroups.map((rg) => ({
                        value: rg.key,
                        label: `${rg.label} · ${rg.matches.length}m`,
                      })),
                    ]}
                  />
                </div>
              )}

              <div className="w-full sm:w-auto sm:min-w-52">
                <Select
                  value={team}
                  onChange={(val) => setTeam(val || 'all')}
                  options={[{ value: 'all', label: 'All Clubs' }, ...clubOptions]}
                />
              </div>

              {visibleRoundGroups.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:text-white"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:text-white"
                  >
                    Collapse All
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Round-by-Round Collapsible Cards */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-solid)] border-t-transparent" />
              <p className="mt-4 text-xs font-semibold text-[var(--text-muted)]">
                Loading fixtures and results…
              </p>
            </div>
          ) : error && allMatches.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[var(--danger-text)]">{error}</p>
              <button
                type="button"
                onClick={() => setReload((v) => v + 1)}
                className="mt-3 text-xs font-semibold underline text-[var(--accent-text)]"
              >
                Retry
              </button>
            </div>
          ) : visibleRoundGroups.length === 0 ? (
            <EmptyState
              title="No matches found"
              hint={
                team !== 'all'
                  ? `No fixtures found for the selected club and filters.`
                  : 'No fixtures match the selected filters.'
              }
            />
          ) : (
            <div className="space-y-4">
              {visibleRoundGroups.map((rg) => {
                const isCollapsed = Boolean(collapsedRounds[rg.key])
                const allDone = rg.completedCount === rg.matches.length && rg.matches.length > 0
                return (
                  <section
                    key={rg.key}
                    className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] transition-all"
                  >
                    {/* Collapsible Round Card Header (matching Step 4 of Round-Robin Generator) */}
                    <button
                      type="button"
                      onClick={() => toggleRound(rg.key)}
                      className="flex w-full items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5 text-left transition-colors hover:bg-white/5"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-lg bg-[var(--accent-solid)] px-2.5 py-1 font-display text-xs font-extrabold uppercase tracking-wider text-[var(--on-volt)]">
                          {rg.label}
                        </span>
                        <span className="text-xs font-bold text-[var(--text-strong)]">
                          📅 {rg.dateLabel}
                        </span>
                        {rg.unscheduledCount > 0 && rg.unscheduledCount < rg.matches.length && (
                          <span className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                            +{rg.unscheduledCount} TBD
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={cx(
                            'numeric rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                            allDone
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-white/10 text-[var(--text-muted)]',
                          )}
                        >
                          {rg.completedCount}/{rg.matches.length} Played
                        </span>
                        <span className="text-xs font-bold text-[var(--text-muted)]">
                          {isCollapsed ? '▸ Show' : '▾ Hide'}
                        </span>
                      </div>
                    </button>

                    {/* Round Fixtures Body (Sub-grouped by Date when multiple dates exist) */}
                    {!isCollapsed && (
                      <div className="divide-y divide-[var(--border)]">
                        {(rg.dateGroups ?? []).map((dg) => (
                          <div key={dg.key}>
                            {rg.dateGroups.length > 1 && (
                              <div
                                className={cx(
                                  'flex items-center justify-between px-5 py-2 text-[11px] font-bold tracking-wide border-b border-[var(--border)]',
                                  dg.isUnscheduled
                                    ? 'bg-white/[0.02] text-[var(--text-muted)]'
                                    : 'bg-[var(--accent-tint)]/40 text-[var(--accent-text)]',
                                )}
                              >
                                <span>
                                  {dg.isUnscheduled ? '⚪ ' : '📅 '}
                                  {dg.dateLabel}
                                </span>
                                <span className="numeric text-[10px] opacity-80">
                                  {dg.matches.length} {dg.matches.length === 1 ? 'Fixture' : 'Fixtures'}
                                </span>
                              </div>
                            )}
                            <div className="divide-y divide-[var(--border)]">
                              {dg.matches.map((m) => (
                                <MatchRow
                                  key={m.id ? `match-${m.id}` : `${m.url}-${m.home}-${m.away}`}
                                  match={m}
                                  showDate
                                  index={m.id ? m.id : matchIndexOf(m)}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}

          <p className="mt-12 text-center text-xs text-[var(--text-faint)]">
            Match kick-off times are published in Malaysia/Singapore Time (SGT, UTC+8). Fixtures and
            schedules are managed via the official {SITE.shortName} League System.
          </p>
        </Container>
      </Section>
    </div>
  )
}
