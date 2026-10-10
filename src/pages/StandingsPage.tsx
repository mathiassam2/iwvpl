import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { StandingsTable, StatTile, type StandingSortKey } from '@/components/league'
import { Container, Section, Tabs } from '@/components/ui'
import { SITE, siteData } from '@/data'

export default function StandingsPage() {
  const divisions = useMemo(() => Object.keys(siteData.standingsByDivision), [])
  const [div, setDiv] = useState(divisions[0] ?? '')
  const [sort, setSort] = useState<{ key: StandingSortKey; desc: boolean }>({
    key: 'pts',
    desc: true,
  })

  const rows = siteData.standingsByDivision[div]?.rows ?? []

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
          {divisions.length > 1 && (
            <div className="mb-6 border-b border-[var(--border)]">
              <Tabs
                tabs={divisions.map((d) => ({
                  id: d,
                  label: d,
                  count: siteData.standingsByDivision[d]?.rows.length,
                }))}
                active={div}
                onChange={setDiv}
                idPrefix="div"
              />
            </div>
          )}

          <StandingsTable rows={sorted} sort={sort} onSort={onSort} />

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <StatTile label="Clubs" value={rows.length} hint={div} />
            <StatTile label="Fixtures" value={teamMatches} hint="Team-matches played" />
            <StatTile
              label="Goals"
              value={goals}
              hint={`${(goals / Math.max(teamMatches, 1)).toFixed(2)} per match`}
            />
          </div>

          <p className="mt-5 max-w-3xl text-xs leading-relaxed text-[var(--text-faint)]">
            Form shows each club&rsquo;s last five results. Standings reflect completed fixtures
            reported by team managers through the Manager Portal and may update shortly after a
            match ends.
          </p>
        </Container>
      </Section>
    </div>
  )
}