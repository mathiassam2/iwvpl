import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { LeaderboardTable } from '@/components/league'
import { LeaderboardPodium } from '@/components/league/LeaderboardPodium'
import { Container, Section, Select, Tabs } from '@/components/ui'
import { siteData } from '@/data'
import { useSeasonName } from '@/lib/season'
import {
  getLiveLeaderboardSummary,
  getLiveSeasons,
  type LeagueSeason,
  type LiveLeaderboardSummary,
} from '@/lib/liveLeague'
import type { Leaderboard } from '@/types/site'

export default function LeaderboardPage() {
  const seasonName = useSeasonName()
  const [seasons, setSeasons] = useState<LeagueSeason[]>([])
  const [seasonId, setSeasonId] = useState<number | null>(null)
  const [liveData, setLiveData] = useState<LiveLeaderboardSummary | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getLiveSeasons(controller.signal)
      .then((list) => {
        setSeasons(list)
        const current = list.find((s) => Boolean(s.is_current)) ?? list[0]
        setSeasonId(current?.id ?? null)
      })
      .catch(() => {
        /* static fallback stays available */
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!seasonId) return
    const controller = new AbortController()
    setLiveData(null)
    void getLiveLeaderboardSummary(controller.signal, seasonId).then((res) => {
      if (res) setLiveData(res)
    })
    return () => controller.abort()
  }, [seasonId])

  const selectedSeason = seasons.find((s) => s.id === seasonId) ?? null
  const seasonLabel = liveData?.season?.name || selectedSeason?.name || seasonName

  const effectiveBoards: Leaderboard[] = useMemo(() => {
    if (liveData) {
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
          celebrationImage:
            r.celebration_image &&
            r.celebration_image !== r.avatar_local &&
            !r.celebration_image.includes('avatar-placeholder') &&
            !r.celebration_image.includes('profile-photo-') &&
            !r.celebration_image.includes('/assets/players/')
              ? r.celebration_image
              : null,
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
        lede={`Top performers across the ${seasonLabel} IWVPL Pro Club League — goals, assists and goalkeeping.`}
      />

      <Section>
        <Container size="narrow">
          {seasons.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  Season filter
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Showing {seasonLabel}
                </p>
              </div>
              <Select
                value={seasonId ? String(seasonId) : ''}
                onChange={(value) => setSeasonId(Number(value))}
                options={seasons.map((s) => ({
                  value: String(s.id),
                  label: `${s.name}${Boolean(s.is_current) ? ' · Live' : ''}`,
                }))}
                ariaLabel="Select season"
                size="sm"
                className="min-w-[15rem]"
              />
            </div>
          )}

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
            {seasonLabel}.
          </p>
        </Container>
      </Section>
    </div>
  )
}