import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { MatchRow, MatchWeekStepper, StatTile } from '@/components/league'
import { Button, Container, EmptyState, Section, Select } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { groupByDate, stripFlag } from '@/lib/format'
import {
  getLiveMatches,
  getLiveSeasonClubs,
  getLiveSeasons,
  liveLeagueEnabled,
  type LeagueClub,
  type LeagueSeason,
} from '@/lib/liveLeague'
import { buildWeekGroups, type WeekGroup } from '@/lib/matchWeeks'
import { matchIndexOf } from '@/lib/match'
import { useSeasonName } from '@/lib/season'
import type { Match } from '@/types/site'

type StatusFilter = 'all' | 'upcoming' | 'results'

export default function MatchesPage() {
  const seasonName = useSeasonName()
  const [searchParams, setSearchParams] = useSearchParams()

  // Filter query params: ?tab=results | upcoming, ?week=week-1
  const initialStatus = (searchParams.get('tab') as StatusFilter) || 'all'
  const initialWeek = searchParams.get('week') || ''

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus)
  const [selectedWeekId, setSelectedWeekId] = useState<string>(initialWeek)
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
          // Fallback to crawled data if live API fails
          setAllMatches(siteData.results)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [seasonId, reload])

  // Build week groups from loaded matches
  const { weeks, defaultWeekId, byWeekId } = useMemo(
    () => buildWeekGroups(allMatches),
    [allMatches],
  )

  // Initialize selected week to default once weeks are ready if not explicitly set
  useEffect(() => {
    if (!selectedWeekId && defaultWeekId) {
      setSelectedWeekId(defaultWeekId)
    }
  }, [defaultWeekId, selectedWeekId])

  // Clubs filter options
  const clubOptions = useMemo(() => {
    if (seasonClubs.length > 0) {
      return seasonClubs
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          value: c.slug,
          label: stripFlag(c.name),
        }))
    }
    return siteData.standings
      .slice()
      .sort((a, b) => a.team.localeCompare(b.team))
      .map((c) => ({
        value: c.team,
        label: stripFlag(c.team),
      }))
  }, [seasonClubs])

  // Filter matches by week, status, and team
  const filteredMatches = useMemo(() => {
    let result = allMatches

    // 1. Week filter
    if (selectedWeekId && selectedWeekId !== 'all') {
      const group = byWeekId.get(selectedWeekId)
      if (group) {
        result = group.matches
      }
    }

    // 2. Status filter
    if (statusFilter === 'upcoming') {
      result = result.filter((m) => m.hs === '' || m.as === '')
    } else if (statusFilter === 'results') {
      result = result.filter((m) => m.hs !== '' && m.as !== '')
    }

    // 3. Team filter
    if (team !== 'all') {
      const target = team.toLowerCase()
      result = result.filter((m) => {
        const homeSlug = m.home.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const awaySlug = m.away.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        return (
          m.home.toLowerCase().includes(target) ||
          m.away.toLowerCase().includes(target) ||
          homeSlug.includes(target) ||
          awaySlug.includes(target)
        )
      })
    }

    return result
  }, [allMatches, selectedWeekId, byWeekId, statusFilter, team])

  // Group filtered matches by date
  const grouped = useMemo(() => groupByDate(filteredMatches), [filteredMatches])

  // Active week group object
  const activeWeekGroup = byWeekId.get(selectedWeekId)


  // Overall stats
  const totalCompleted = useMemo(() => allMatches.filter((m) => m.hs !== '' && m.as !== '').length, [allMatches])
  const totalUpcoming = allMatches.length - totalCompleted

  const handleWeekSelect = (id: string) => {
    setSelectedWeekId(id)
    const nextParams = new URLSearchParams(searchParams)
    if (id && id !== 'all') nextParams.set('week', id)
    else nextParams.delete('week')
    setSearchParams(nextParams, { replace: true })
  }

  const handleStatusSelect = (status: StatusFilter) => {
    setStatusFilter(status)
    const nextParams = new URLSearchParams(searchParams)
    if (status !== 'all') nextParams.set('tab', status)
    else nextParams.delete('tab')
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Fixtures & Results"
        title="Matches"
        lede={`Schedule, kick-off times and results for ${seasonName}. Published in SGT (UTC+8).`}
      />

      <Section>
        <Container size="wide">
          {/* Top summary stats */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatTile label="Total Fixtures" value={allMatches.length} hint="This season" />
            <StatTile label="Upcoming Matches" value={totalUpcoming} hint="Awaiting kick-off" />
            <StatTile label="Completed Results" value={totalCompleted} hint="Scores recorded" />
          </div>

          {/* Primary Controls Bar: Season, Team & Status */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
            {/* Status pills: All / Upcoming / Results */}
            <div className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
              <button
                type="button"
                onClick={() => handleStatusSelect('all')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  statusFilter === 'all'
                    ? 'bg-[var(--accent-solid)] text-[var(--on-volt)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                }`}
              >
                All Matches ({allMatches.length})
              </button>
              <button
                type="button"
                onClick={() => handleStatusSelect('upcoming')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  statusFilter === 'upcoming'
                    ? 'bg-[var(--accent-solid)] text-[var(--on-volt)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                }`}
              >
                Upcoming ({totalUpcoming})
              </button>
              <button
                type="button"
                onClick={() => handleStatusSelect('results')}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  statusFilter === 'results'
                    ? 'bg-[var(--accent-solid)] text-[var(--on-volt)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                }`}
              >
                Results ({totalCompleted})
              </button>
            </div>

            {/* Dropdowns: Season & Club */}
            <div className="flex flex-wrap items-center gap-3">
              {seasons.length > 1 && (
                <div className="w-44">
                  <Select
                    value={seasonId != null ? String(seasonId) : ''}
                    onChange={(e) => setSeasonId(Number(e.target.value))}
                    options={seasons.map((s) => ({
                      value: String(s.id),
                      label: `${s.name}${s.is_current ? ' (Current)' : ''}`,
                    }))}
                  />
                </div>
              )}
              <div className="w-48">
                <Select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  options={[{ value: 'all', label: 'All Clubs' }, ...clubOptions]}
                />
              </div>
            </div>
          </div>

          {/* Match Week Stepper with Quick Jump Dropdown */}
          <MatchWeekStepper
            weeks={weeks}
            selectedWeekId={selectedWeekId}
            onSelectWeek={handleWeekSelect}
            totalMatches={allMatches.length}
          />

          {/* Matches List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-solid)] border-t-transparent" />
              <p className="mt-4 text-xs font-semibold text-[var(--text-muted)]">Loading fixtures and results…</p>
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
          ) : grouped.length === 0 ? (
            <EmptyState
              title="No matches found"
              hint={
                statusFilter === 'upcoming'
                  ? 'No upcoming fixtures scheduled in this selection.'
                  : statusFilter === 'results'
                  ? 'No completed match results recorded for this selection yet.'
                  : 'No fixtures match the selected filters.'
              }
            />
          ) : (
            <div className="space-y-8">
              {grouped.map(([date, matches]) => (
                <section key={date}>
                  <div className="mb-3 flex items-center gap-4">
                    <h3 className="shrink-0 font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {date}
                    </h3>
                    <span aria-hidden className="h-px flex-1 bg-[var(--border)]" />
                    <span className="numeric shrink-0 text-xs text-[var(--text-faint)]">
                      {matches.length} {matches.length === 1 ? 'match' : 'matches'}
                    </span>
                  </div>

                  <div className="surface divide-y divide-[var(--border)] overflow-hidden rounded-card">
                    {matches.map((m) => (
                      <MatchRow
                        key={m.id ? `match-${m.id}` : `${m.url}-${m.home}-${m.away}`}
                        match={m}
                        index={m.id ? m.id : matchIndexOf(m)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <p className="mt-12 text-center text-xs text-[var(--text-faint)]">
            Match kick-off times are published in Malaysia/Singapore Time (SGT, UTC+8).
            Fixtures and schedules are managed via the official {SITE.shortName} League System.
          </p>
        </Container>
      </Section>
    </div>
  )
}
