import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MatchRow, StatTile } from '@/components/league'
import { Container, EmptyState, Section, Select } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { groupByDate, stripFlag, totalGoals } from '@/lib/format'
import {
  getLiveResults,
  getLiveSeasons,
  liveLeagueEnabled,
  type LeagueSeason,
} from '@/lib/liveLeague'
import { matchIndexOf } from '@/lib/match'
import { useSeasonName } from '@/lib/season'

export default function ResultsPage() {
  const seasonName = useSeasonName()
  const [team, setTeam] = useState('all')
  const [liveResults, setLiveResults] = useState<typeof siteData.results>([])
  const [seasons, setSeasons] = useState<LeagueSeason[]>([])
  const [seasonId, setSeasonId] = useState<number | null>(null)
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
    setLoading(true)
    setError('')
    setLiveResults([])

    getLiveResults(controller.signal, seasonId)
      .then(setLiveResults)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load live results.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [reload, seasonId])

  const results = liveLeagueEnabled ? liveResults : siteData.results
  const selectedSeason = seasons.find((season) => season.id === seasonId)

  const teams = useMemo(() => {
    const names = new Set<string>()
    results.forEach((m) => {
      names.add(stripFlag(m.home))
      names.add(stripFlag(m.away))
    })
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [results])

  const filtered = useMemo(
    () =>
      team === 'all' ? results : results.filter((m) => stripFlag(m.home) === team || stripFlag(m.away) === team),
    [results, team],
  )

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  const wins = filtered.filter((m) => Number(m.hs) > Number(m.as)).length
  const draws = filtered.filter((m) => Number(m.hs) === Number(m.as)).length

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
                  setSeasonId(Number(value))
                }}
              />
            </label>
          )}
          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            <StatTile label="Fixtures" value={filtered.length} hint="Reported" />
            <StatTile
              label="Home wins"
              value={wins}
              hint={`${((wins / Math.max(filtered.length, 1)) * 100).toFixed(0)}%`}
            />
            <StatTile
              label="Draws"
              value={draws}
              hint={`${((draws / Math.max(filtered.length, 1)) * 100).toFixed(0)}%`}
            />
            <StatTile label="Goals" value={totalGoals(filtered)} hint="Combined" />
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
              onChange={setTeam}
              options={[
                { value: 'all', label: 'All clubs' },
                ...teams.map((t) => ({ value: t, label: t })),
              ]}
              className="sm:w-72"
            />
            {team !== 'all' && (
              <button
                onClick={() => setTeam('all')}
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