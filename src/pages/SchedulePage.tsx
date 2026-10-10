import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MatchRow, StatTile } from '@/components/league'
import { ButtonLink, Container, EmptyState, Section, SectionHead, Tabs } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { groupByDate } from '@/lib/format'
import { matchIndexOf } from '@/lib/match'

export default function SchedulePage() {
  const [scope, setScope] = useState<'upcoming' | 'all'>('all')

  const upcoming = useMemo(
    () => siteData.results.filter((m) => m.hs === '' || m.as === ''),
    [],
  )

  const shown = scope === 'upcoming' ? upcoming : siteData.results
  const grouped = useMemo(() => groupByDate(shown), [shown])

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Fixtures"
        title="Match Schedule"
        lede={`Kick-off times are published in SGT (UTC+8). All fixtures for ${SITE.season}.`}
      />

      <Section>
        <Container size="wide">
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatTile label="Fixtures listed" value={siteData.results.length} hint="This season" />
            <StatTile label="Awaiting kick-off" value={upcoming.length} hint="Not yet played" />
            <StatTile label="Season" value={SITE.season.replace(' Season 1', '')} hint={SITE.season} />
          </div>

          <SectionHead eyebrow="Calendar" title="All fixtures" />
          <div className="mb-8 border-b border-[var(--border)]">
            <Tabs
              tabs={[
                { id: 'upcoming', label: 'Upcoming', count: upcoming.length },
                { id: 'all', label: 'All fixtures', count: siteData.results.length },
              ]}
              active={scope}
              onChange={(id) => setScope(id as 'upcoming' | 'all')}
              idPrefix="scope"
            />
          </div>

          {grouped.length === 0 ? (
            <EmptyState
              title="No upcoming fixtures published"
              hint="All fixtures for this matchday have been played. Check the results page for full scorelines."
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
                      <MatchRow key={`${m.url}-${m.home}-${m.away}`} match={m} index={matchIndexOf(m)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className="mt-12 flex justify-center">
            <ButtonLink to="/results" size="lg">
              See completed results
            </ButtonLink>
          </div>

          <p className="mt-6 text-center text-xs text-[var(--text-faint)]">
            Fixture times are indicative and may shift at the discretion of the league admin team.
            Clubs across {SITE.base} and the wider region receive reminders via Discord.
          </p>
        </Container>
      </Section>
    </div>
  )
}