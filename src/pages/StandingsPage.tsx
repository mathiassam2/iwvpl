import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { StandingsTable, StatTile, type StandingSortKey } from '@/components/league'
import { Container, Section, Tabs } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { getLiveStandings, liveLeagueEnabled } from '@/lib/liveLeague'
import type { Standing } from '@/types/site'

export default function StandingsPage() {
  const [liveStandings, setLiveStandings] = useState<Record<string, Standing[]> | null>(null)
  const [loading, setLoading] = useState(liveLeagueEnabled)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const initialDivisions = Object.keys(siteData.standingsByDivision)
  const [div, setDiv] = useState(initialDivisions[0] ?? '')
  const [sort, setSort] = useState<{ key: StandingSortKey; desc: boolean }>({
    key: 'pos',
    desc: false,
  })

  useEffect(() => {
    if (!liveLeagueEnabled) return
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getLiveStandings(controller.signal)
      .then((standings) => {
        setLiveStandings(standings)
        const divisions = Object.keys(standings)
        setDiv((current) => divisions.includes(current) ? current : divisions[0] ?? '')
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
  }, [reload])

  const divisions = liveStandings ? Object.keys(liveStandings) : initialDivisions
  const rows = liveStandings
    ? liveStandings[div] ?? []
    : siteData.standingsByDivision[div]?.rows ?? []

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
        lede={`${SITE.season} — IWVPL Pro Club League. Select any column heading to re-sort the table.`}
      />

      {/* Tight top padding. The table is the reason anyone opens this page, and
          behind a tall PageHeader, a tab strip and a row of stat cards it
          started below the fold on a laptop. Summary moved underneath it. */}
      <Section className="!py-10 sm:!py-12">
        <Container size="wide">
          {loading && (
            <p role="status" className="mb-4 text-sm text-[var(--text-muted)]">
              Loading live standings…
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
          {!loading && !error && divisions.length > 1 && (
            <div className="mb-6 border-b border-[var(--border)]">
              <Tabs
                tabs={divisions.map((d) => ({
                  id: d,
                  label: d,
                  count: liveStandings?.[d]?.length ?? siteData.standingsByDivision[d]?.rows.length,
                }))}
                active={div}
                onChange={setDiv}
                idPrefix="div"
              />
            </div>
          )}

          {!loading && !error && <StandingsTable rows={sorted} sort={sort} onSort={onSort} />}

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