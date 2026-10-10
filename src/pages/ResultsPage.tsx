import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MatchRow, StatTile } from '@/components/league'
import { Container, EmptyState, Section, Select } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { groupByDate, stripFlag, totalGoals } from '@/lib/format'
import { matchIndexOf } from '@/lib/match'

export default function ResultsPage() {
  const [team, setTeam] = useState('all')

  const teams = useMemo(() => {
    const names = new Set<string>()
    siteData.results.forEach((m) => {
      names.add(stripFlag(m.home))
      names.add(stripFlag(m.away))
    })
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [])

  const filtered = useMemo(
    () =>
      team === 'all'
        ? siteData.results
        : siteData.results.filter((m) => stripFlag(m.home) === team || stripFlag(m.away) === team),
    [team],
  )

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  const wins = filtered.filter((m) => Number(m.hs) > Number(m.as)).length
  const draws = filtered.filter((m) => Number(m.hs) === Number(m.as)).length

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Match centre"
        title="Match Results"
        lede={`Every completed fixture reported across the ${SITE.season} IWVPL Pro Club League.`}
      />

      <Section>
        <Container size="wide">
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
              hint="Try selecting a different club from the filter above."
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
                      <MatchRow key={m.url + m.home} match={m} index={matchIndexOf(m)} />
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
        </Container>
      </Section>
    </div>
  )
}