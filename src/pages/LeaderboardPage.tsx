import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { LeaderboardTable } from '@/components/league'
import { LeaderboardPodium } from '@/components/league/LeaderboardPodium'
import { Container, Section, Tabs } from '@/components/ui'
import { SITE, siteData } from '@/data'

export default function LeaderboardPage() {
  const [active, setActive] = useState(siteData.leaderboards[0]?.title ?? '')
  const board = siteData.leaderboards.find((b) => b.title === active) ?? siteData.leaderboards[0]

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Individual honours"
        title="Leaderboard"
        lede={`Top performers across the ${SITE.season} IWVPL Pro Club League — goals, assists and goalkeeping.`}
      />

      <Section>
        <Container size="narrow">
          {/* bare tabs — no outer container */}
          <div className="mb-8 border-b border-[var(--border)]">
            <Tabs
              tabs={siteData.leaderboards.map((b) => ({
                id: b.title,
                label: b.title.replace('TOP ', 'Top ').toLowerCase(),
                count: b.rows.length,
              }))}
              active={active}
              onChange={setActive}
              idPrefix="lb"
            />
          </div>

          {board ? (
            <>
              <LeaderboardPodium board={board} />

              {board.rows.length > 3 && (
                <div className="surface mt-8 overflow-hidden rounded-card">
                  <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                    Chasing pack
                  </p>
                  <LeaderboardTable board={board} limit={10} offset={3} />
                </div>
              )}
            </>
          ) : (
            <p className="text-[var(--text-muted)]">No leaderboard data available.</p>
          )}

          <p className="mt-6 text-xs leading-relaxed text-[var(--text-faint)]">
            Statistics are compiled from match reports submitted by team managers during{' '}
            {SITE.season}.
          </p>
        </Container>
      </Section>
    </div>
  )
}