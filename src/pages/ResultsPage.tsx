import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MatchRow, StatTile } from '@/components/league'
import { Container, EmptyState, Section, Select } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { groupByDate, stripFlag, totalGoals } from '@/lib/format'
import {
  getLiveResultsPage,
  getLiveSeasonClubs,
  getLiveSeasons,
  liveLeagueEnabled,
  type LeagueClub,
  type LeagueSeason,
} from '@/lib/liveLeague'
import { matchIndexOf } from '@/lib/match'
import { useSeasonName } from '@/lib/season'

export default function ResultsPage() {
  const seasonName = useSeasonName()
  const [team, setTeam] = useState('all')
  const [seasonClubs, setSeasonClubs] = useState<LeagueClub[]>([])
  const [liveResults, setLiveResults] = useState<typeof siteData.results>([])
  const [liveResultTotal, setLiveResultTotal] = useState(0)
  const [seasons, setSeasons] = useState<LeagueSeason[]>([])
  const [seasonId, setSeasonId] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(liveLeagueEnabled)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!liveLeagueEnabled) return
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
          setError(cause instanceof Error ? cause.message : 'Could not load available seasons.')
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [reload])

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

  useEffect(() => {
    if (!liveLeagueEnabled || seasonId === null) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setLiveResults([])

    getLiveResultsPage(controller.signal, {
      seasonId,
      clubSlug: team === 'all' ? undefined : team,
      limit: 20,
      offset: page * 20,
    })
      .then(({ matches, total }) => {
        setLiveResults(matches)
        setLiveResultTotal(total)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load live results.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [reload, seasonId, team, page])

  const results = liveLeagueEnabled
    ? liveResults
    : [...siteData.results].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
  const selectedSeason = seasons.find((season) => season.id === seasonId)

  const teams = useMemo(() => {
    if (liveLeagueEnabled) {
      return seasonClubs.map((club) => ({ value: club.slug, label: club.name }))
    }
    const names = new Set<string>()
    results.forEach((m) => {
      names.add(stripFlag(m.home))
      names.add(stripFlag(m.away))
    })
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }))
  }, [results, seasonClubs])

  const filtered = useMemo(() => {
    if (liveLeagueEnabled || team === 'all') return results
    return results.filter((m) => stripFlag(m.home) === team || stripFlag(m.away) === team)
  }, [results, team])

  const totalMatches = liveLeagueEnabled ? liveResultTotal : filtered.length
  const pageCount = Math.max(1, Math.ceil(totalMatches / 20))
  const firstMatch = totalMatches === 0 ? 0 : page * 20 + 1
  const lastMatch = Math.min((page + 1) * 20, totalMatches)
  const visibleMatches = liveLeagueEnabled
    ? filtered
    : filtered.slice(page * 20, (page + 1) * 20)
  const grouped = useMemo(() => groupByDate(visibleMatches), [visibleMatches])

  const wins = visibleMatches.filter((m) => Number(m.hs) > Number(m.as)).length
  const draws = visibleMatches.filter((m) => Number(m.hs) === Number(m.as)).length

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Match centre"
        title="Match Results"
        lede={`Every completed fixture reported across the ${selectedSeason?.name ?? seasonName} IWVPL Pro Club League, with the latest matches first.`}
      />

      <Section>
        <Container size="wide">
          {loading && (
            <p role="status" className="mb-4 text-sm text-[var(--text-muted)]">
              Loading live results…
            </p>
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
          {!loading && !error && (
            <>
          {liveLeagueEnabled && seasons.length > 0 && (
            <label className="mb-6 flex max-w-sm flex-col gap-2 text-sm font-semibold text-[var(--text-muted)]">
              Match season
              <Select
                ariaLabel="Match season"
                value={String(seasonId ?? '')}
                options={seasons.map((season) => ({
                  value: String(season.id),
                  label: `${season.name}${season.is_current ? ' · Current' : ''}`,
                }))}
                onChange={(value) => {
                  setTeam('all')
                  setPage(0)
                  setSeasonId(Number(value))
                }}
              />
            </label>
          )}
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            <StatTile
              label="Fixtures"
              value={totalMatches}
              hint={totalMatches > 20 ? `Showing ${firstMatch}–${lastMatch}` : 'Reported'}
            />
            <StatTile
              label="Home wins"
              value={wins}
              hint="On this page"
            />
            <StatTile
              label="Draws"
              value={draws}
              hint="On this page"
            />
            <StatTile label="Goals" value={totalGoals(visibleMatches)} hint="On this page" />
          </div>

          {/* filter */}
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label
              htmlFor="team-filter"
              className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]"
            >
              Filter by club
            </label>
            <Select
              id="team-filter"
              value={team}
              onChange={(value) => {
                setTeam(value)
                setPage(0)
              }}
              options={[
                { value: 'all', label: 'All clubs' },
                ...teams,
              ]}
              className="sm:w-72"
            />
            {team !== 'all' && (
              <button
                onClick={() => {
                  setTeam('all')
                  setPage(0)
                }}
                className="shrink-0 text-xs font-semibold text-[var(--accent-text)] transition-opacity hover:opacity-70"
              >
                Clear filter
              </button>
            )}
          </div>

          {grouped.length === 0 ? (
            <EmptyState
              title="No results found"
              hint="Try another season or club filter."
            />
          ) : (
            <div className="space-y-8">
              {grouped.map(([date, matches]) => (
                <section key={date}>
                  <div className="mb-3 flex items-center gap-4">
                    <h2 className="shrink-0 font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {date}
                    </h2>
                    <span aria-hidden className="h-px flex-1 bg-[var(--border)]" />
                    <span className="numeric shrink-0 text-xs text-[var(--text-faint)]">
                      {matches.length} {matches.length === 1 ? 'match' : 'matches'}
                    </span>
                  </div>
                  {/* overflow-hidden + rounded here so the row-hover highlight
                      fills each row edge to edge, not the card's rounded corners */}
                  <div className="surface divide-y divide-[var(--border)] overflow-hidden rounded-card">
                    {matches.map((m) => (
                      <MatchRow
                        key={m.url + m.home}
                        match={m}
                        index={liveLeagueEnabled ? undefined : matchIndexOf(m)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {totalMatches > 20 && (
            <nav
              className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5"
              aria-label="Match results pagination"
            >
              <p className="text-xs text-[var(--text-faint)]">
                Showing <strong className="text-[var(--text-muted)]">{firstMatch}–{lastMatch}</strong>
                {' '}of <strong className="text-[var(--text-muted)]">{totalMatches}</strong> matches
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-button border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  Previous
                </button>
                <span className="px-2 text-xs tabular-nums text-[var(--text-muted)]">
                  Page {page + 1} of {pageCount}
                </span>
                <button
                  className="rounded-button border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={page >= pageCount - 1 || loading}
                  onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                >
                  Next
                </button>
              </div>
            </nav>
          )}

          <p className="mt-10 max-w-3xl text-xs leading-relaxed text-[var(--text-faint)]">
            Results are submitted by registered team managers. If a scoreline looks incorrect,
            report it to {SITE.email} and our admin team will review the submission.
          </p>
            </>
          )}
        </Container>
      </Section>
    </div>
  )
}