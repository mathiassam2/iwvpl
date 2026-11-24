import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { StandingsTable, StatTile, type StandingSortKey } from '@/components/league'
import { Container, LoadingBar, Section, Select, Tabs } from '@/components/ui'
import { SITE, siteData } from '@/data'
import {
  getLiveSeasons,
  getLiveStandings,
  liveLeagueEnabled,
  orderedStandingDivisions,
  peekLiveStandings,
  type LeagueSeason,
} from '@/lib/liveLeague'
import { preloadImages, runWhenIdle } from '@/lib/network'
import type { StandingDivision } from '@/types/site'

function StandingsSkeleton() {
  return (
    <div className="surface overflow-hidden rounded-card" aria-busy="true" aria-label="Loading standings">
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
        <div className="shimmer h-3 w-40 rounded" />
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <div className="shimmer h-4 w-5 rounded" />
            <div className="shimmer h-7 w-7 rounded-full" />
            <div className="shimmer h-4 flex-1 max-w-[14rem] rounded" />
            <div className="ml-auto flex items-center gap-4">
              <div className="shimmer hidden h-3.5 w-8 rounded sm:block" />
              <div className="shimmer hidden h-3.5 w-8 rounded sm:block" />
              <div className="shimmer h-4 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StandingsPage() {
  const initialStandings = liveLeagueEnabled ? peekLiveStandings() : null
  const [liveStandings, setLiveStandings] = useState<{
    season: LeagueSeason
    divisions: Record<string, StandingDivision>
  } | null>(initialStandings)
  const [seasons, setSeasons] = useState<LeagueSeason[]>([])
  const [seasonId, setSeasonId] = useState<number | null>(initialStandings?.season.id ?? null)
  const [loading, setLoading] = useState(liveLeagueEnabled && !initialStandings)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [searchParams] = useSearchParams()
  const requestedDivision = searchParams.get('division') ?? ''
  const initialDivisions = orderedStandingDivisions(
    initialStandings?.divisions ?? siteData.standingsByDivision,
  ).map(([name]) => name)
  const [div, setDiv] = useState(
    requestedDivision && initialDivisions.includes(requestedDivision)
      ? requestedDivision
      : initialDivisions[0] ?? '',
  )
  const hasChosenDivision = useRef(Boolean(requestedDivision))
  const [sort, setSort] = useState<{ key: StandingSortKey; desc: boolean }>({
    key: 'pos',
    desc: false,
  })

  useEffect(() => {
    if (!liveLeagueEnabled) return
    const controller = new AbortController()
    if (!peekLiveStandings()) setLoading(true)
    setError('')

    getLiveSeasons(controller.signal)
      .then((availableSeasons) => {
        setSeasons(availableSeasons)
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
          setError(cause instanceof Error ? cause.message : 'Could not load available seasons.')
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (!liveLeagueEnabled || seasonId === null) return
    const controller = new AbortController()
    const cached = peekLiveStandings(seasonId)
    if (cached) {
      setLiveStandings(cached)
      const cachedDivs = orderedStandingDivisions(cached.divisions).map(([name]) => name)
      setDiv((current) => {
        if (hasChosenDivision.current && cachedDivs.includes(current)) return current
        if (requestedDivision && cachedDivs.includes(requestedDivision)) return requestedDivision
        return cachedDivs[0] ?? ''
      })
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError('')

    getLiveStandings(controller.signal, seasonId)
      .then((standings) => {
        if (controller.signal.aborted) return
        setLiveStandings(standings)
        const divisions = orderedStandingDivisions(standings.divisions).map(([name]) => name)
        setDiv((current) => {
          if (requestedDivision && divisions.includes(requestedDivision) && !hasChosenDivision.current) {
            return requestedDivision
          }
          if (hasChosenDivision.current && divisions.includes(current)) {
            return current
          }
          if (requestedDivision && divisions.includes(requestedDivision)) {
            return requestedDivision
          }
          return divisions[0] ?? ''
        })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load live standings.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [reload, seasonId])

  // Preload club crests for sibling divisions during idle time so switching tabs is crisp.
  useEffect(() => {
    if (!liveStandings) return
    return runWhenIdle(() => {
      const logos: string[] = []
      for (const [name, d] of Object.entries(liveStandings.divisions)) {
        if (name === div) continue
        for (const row of d.rows) {
          if (row.logo) logos.push(row.logo)
        }
      }
      preloadImages(logos, 24)
    })
  }, [liveStandings, div])

  const divisions = liveStandings
    ? orderedStandingDivisions(liveStandings.divisions).map(([name]) => name)
    : initialDivisions
  const division = liveStandings
    ? liveStandings.divisions[div]
    : siteData.standingsByDivision[div]
  const rows = liveStandings
    ? division?.rows ?? []
    : siteData.standingsByDivision[div]?.rows ?? []
  const selectedSeason = seasons.find((season) => season.id === seasonId)

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (typeof av === 'number' && typeof bv === 'number') return sort.desc ? bv - av : av - bv
      return String(av).localeCompare(String(bv))
    })
    return copy
  }, [rows, sort])

  const onSort = (key: StandingSortKey) =>
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'pos' }))

  const goals = rows.reduce((a, r) => a + r.gf, 0)
  const teamMatches = rows.reduce((a, r) => a + r.pl, 0) / 2

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="League table"
        title="Standings"
        lede={`${selectedSeason?.name ?? SITE.season} — IWVPL Pro Club League. Select any column heading to re-sort the table.`}
      />

      {/* Tight top padding. The table is the reason anyone opens this page, and
          behind a tall PageHeader, a tab strip and a row of stat cards it
          started below the fold on a laptop. Summary moved underneath it. */}
      <Section className="!py-10 sm:!py-12">
        <Container size="wide">
          {liveLeagueEnabled && seasons.length > 0 && (
            <label className="mb-6 flex max-w-sm flex-col gap-2 text-sm font-semibold text-[var(--text-muted)]">
              Standings season
              <Select
                ariaLabel="Standings season"
                value={String(seasonId ?? '')}
                options={seasons.map((season) => ({
                  value: String(season.id),
                  label: `${season.name}${season.is_current ? ' · Current' : ''}`,
                }))}
                onChange={(value) => {
                  hasChosenDivision.current = false
                  setSeasonId(Number(value))
                }}
              />
            </label>
          )}
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-center justify-between gap-4 text-sm text-[var(--danger-text)]"
            >
              <span>{error}</span>
              <button className="font-semibold underline" onClick={() => setReload((value) => value + 1)}>
                Retry
              </button>
            </div>
          )}
          {!error && divisions.length > 1 && (
            <div className="mb-6 border-b border-[var(--border)]">
              <Tabs
                tabs={divisions.map((d) => ({
                  id: d,
                  label: d,
                  count: liveStandings?.divisions[d]?.rows.length ?? siteData.standingsByDivision[d]?.rows.length,
                }))}
                active={div}
                onChange={(value) => {
                  hasChosenDivision.current = true
                  setDiv(value)
                }}
                loading={loading}
                idPrefix="div"
              />
            </div>
          )}
          {!error && divisions.length <= 1 && loading && (
            <LoadingBar active className="mb-6" label="Loading live standings" />
          )}

          {loading ? (
            <StandingsSkeleton />
          ) : !error && (
            <>
              {division?.promotionCount || division?.relegationCount ? (
                <p className="mb-3 text-xs text-[var(--text-muted)]">
                  {division.promotionCount != null && (
                    <span>
                      Promotion: top {division.promotionCount}
                    </span>
                  )}
                  {division.promotionCount != null && division.relegationCount != null && <span> · </span>}
                  {division.relegationCount != null && (
                    <span>
                      Relegation: bottom {division.relegationCount}
                    </span>
                  )}
                </p>
              ) : null}
              {sorted.length > 0 ? (
                <StandingsTable
                  rows={sorted}
                  sort={sort}
                  onSort={onSort}
                  promotionCount={division?.promotionCount}
                  relegationCount={division?.relegationCount}
                  promotionRange={division?.promotionRange}
                  relegationRange={division?.relegationRange}
                />
              ) : (
                <div className="surface rounded-card px-5 py-8 text-center text-sm text-[var(--text-muted)]">
                  No clubs have been entered in this division yet.
                </div>
              )}
            </>
          )}

          {!loading && !error && (
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <StatTile label="Clubs" value={rows.length} hint={div} />
              <StatTile label="Fixtures" value={teamMatches} hint="Team-matches played" />
              <StatTile
                label="Goals"
                value={goals}
                hint={`${(goals / Math.max(teamMatches, 1)).toFixed(2)} per match`}
              />
            </div>
          )}

          {!loading && !error && (
            <p className="mt-5 max-w-3xl text-xs leading-relaxed text-[var(--text-faint)]">
            Form shows each club&rsquo;s last five results. Standings reflect completed fixtures
            reported by team managers through the Manager Portal and may update shortly after a
            match ends.
            </p>
          )}
        </Container>
      </Section>
    </div>
  )
}