import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { LeaderboardTable } from '@/components/league'
import { LeaderboardPodium } from '@/components/league/LeaderboardPodium'
import { Container, Section, Tabs } from '@/components/ui'
import { siteData } from '@/data'
import { useSeasonName } from '@/lib/season'
import {
  getLiveLeaderboardSummary,
  peekLiveLeaderboards,
  type LiveLeaderboardSummary,
} from '@/lib/liveLeague'
import type { Leaderboard } from '@/types/site'

export default function LeaderboardPage() {
  const seasonName = useSeasonName()
  const [liveData, setLiveData] = useState<LiveLeaderboardSummary | null>(peekLiveLeaderboards())

  useEffect(() => {
    void getLiveLeaderboardSummary().then((res) => {
      if (res) setLiveData(res)
    })
  }, [])

  const effectiveBoards: Leaderboard[] = useMemo(() => {
    if (liveData && liveData.boards.some((b) => b.rows.length > 0)) {
      return liveData.boards.map((b) => ({
        title: b.title,
        rows: b.rows.map((r, idx) => ({
          pos: idx + 1,
          name: r.gamertag,
          team: r.club_name || 'Free Agent',
          team_flag: r.club_flag || '',
          value: r.value,
          avatar: r.avatar_local || '',
          avatarLocal: r.avatar_local || '',
          team_logo: r.club_logo || '',
          teamLogoLocal: r.club_logo || '',
          url: `/players/${r.slug}`,
          celebrationImage: r.celebration_image || null,
        })),
      }))
    }
    return siteData.leaderboards
  }, [liveData])

  const [active, setActive] = useState(effectiveBoards[0]?.title ?? '')

  useEffect(() => {
    if (effectiveBoards.length > 0 && !effectiveBoards.some((b) => b.title === active)) {
      setActive(effectiveBoards[0].title)
    }
  }, [effectiveBoards, active])

  const board = effectiveBoards.find((b) => b.title === active) ?? effectiveBoards[0]

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Individual honours"
        title="Leaderboard"
        lede={`Top performers across the ${liveData?.season?.name || seasonName} IWVPL Pro Club League — goals, assists and goalkeeping.`}
      />

      <Section>
        <Container size="narrow">
          {/* bare tabs — no outer container */}
          <div className="mb-8 border-b border-[var(--border)]">
            <Tabs
              tabs={effectiveBoards.map((b) => ({
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
            {liveData?.season?.name || seasonName}.
          </p>
        </Container>
      </Section>
    </div>
  )
}