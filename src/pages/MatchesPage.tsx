import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { MatchRow, StatTile } from '@/components/league'
import { Badge, Container, EmptyState, Section, Select } from '@/components/ui'
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

interface RoundGroup {
  key: string
  roundNum: number
  label: string
  dateLabel: string
  matches: Match[]
  completedCount: number
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
      return (a.kickoff || '').localeCompare(b.kickoff || '')
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
      return a.kickoff.localeCompare(b.kickoff)
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
    const dates = Array.from(new Set(list.map((m) => m.date).filter(Boolean)))
    const dateLabel =
      dates.length === 0
        ? 'Kick-off TBD'
        : dates.length === 1
          ? dates[0]
          : `${dates[0]} – ${dates[dates.length - 1]}`
    const completedCount = list.filter((m) => m.hs !== '' && m.as !== '').length
    groups.push({
      key,
      roundNum,
      label: key === 'unscheduled' && !explicitRound ? `Round ${roundNum} (TBD)` : `Round ${roundNum}`,
      dateLabel,
      matches: list,
      completedCount,
    })
    idx += 1
  }

  return groups
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

  // Available divisions in this season's matches
  const divisions = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of allMatches) {
      if (m.divisionName) {
        const key = m.divisionId != null ? String(m.divisionId) : m.divisionName
        map.set(key, m.divisionName)
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
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

  // Filter matches by division, club, and status
  const filteredMatches = useMemo(() => {
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

    if (statusFilter === 'upcoming') {
      result = result.filter((m) => m.hs === '' || m.as === '')
    } else if (statusFilter === 'results') {
      result = result.filter((m) => m.hs !== '' && m.as !== '')
    }

    return result
  }, [allMatches, divisionFilter, team, statusFilter])

  // Build Round-by-Round groups (like Step 4 of Round-Robin generator)
  const roundGroups = useMemo(() => buildRoundGroups(filteredMatches), [filteredMatches])

  const visibleRoundGroups = useMemo(() => {
    if (selectedRoundKey === 'all') return roundGroups
    return roundGroups.filter((rg) => rg.key === selectedRoundKey)
  }, [roundGroups, selectedRoundKey])

  // Overall stats
  const totalCompleted = useMemo(
    () => allMatches.filter((m) => m.hs !== '' && m.as !== '').length,
    [allMatches],
  )
  const totalUpcoming = allMatches.length - totalCompleted
  const totalRoundsCount = useMemo(() => buildRoundGroups(allMatches).length, [allMatches])

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
        lede={`Round-by-round schedule, kick-off times and official results for ${seasonName}. Published in SGT (UTC+8).`}
      />

      <Section>
        <Container size="wide">
          {/* Top summary stats (matching Round-Robin Step 4 summary boxes) */}
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            <StatTile label="Total Fixtures" value={allMatches.length} hint="This season" />
            <StatTile label="Total Rounds" value={totalRoundsCount} hint="Match rounds" />
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
                  { id: 'all', label: `All (${allMatches.length})` },
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
              {seasons.length > 1 && (
                <div className="w-44">
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
                <div className="w-44">
                  <Select
                    value={selectedRoundKey}
                    onChange={(val) => setSelectedRoundKey(val || 'all')}
                    options={[
                      { value: 'all', label: `All Rounds (${roundGroups.length})` },
                      ...roundGroups.map((rg) => ({
                        value: rg.key,
                        label: `${rg.label} · ${rg.matches.length}m`,
                      })),
                    ]}
                  />
                </div>
              )}

              <div className="w-48">
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
                        {rg.matches[0]?.divisionName && divisionFilter === 'all' && divisions.length > 1 && (
                          <Badge tone="muted">{rg.matches[0].divisionName}</Badge>
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

                    {/* Round Fixtures Body */}
                    {!isCollapsed && (
                      <div className="divide-y divide-[var(--border)]">
                        {rg.matches.map((m) => (
                          <MatchRow
                            key={m.id ? `match-${m.id}` : `${m.url}-${m.home}-${m.away}`}
                            match={m}
                            index={m.id ? m.id : matchIndexOf(m)}
                          />
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
