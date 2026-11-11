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
  getSeasonDivisions,
  type LeagueSeason,
  type LiveDivision,
  type LiveLeaderboardSummary,
} from '@/lib/liveLeague'
import type { Leaderboard } from '@/types/site'

export default function LeaderboardPage() {
  const seasonName = useSeasonName()
  const [seasons, setSeasons] = useState<LeagueSeason[]>([])
  const [seasonId, setSeasonId] = useState<number | null>(null)
  const [divisions, setDivisions] = useState<LiveDivision[]>([])
  const [divisionId, setDivisionId] = useState<number | null>(null)
  const [liveData, setLiveData] = useState<LiveLeaderboardSummary | null>(null)
  const [loading, setLoading] = useState(false)

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

  // Divisions follow the season, so a stale division id can never be sent.
  useEffect(() => {
    if (!seasonId) return
    const controller = new AbortController()
    setDivisionId(null)
    setDivisions([])
    void getSeasonDivisions(seasonId, controller.signal)
      .then((list) => setDivisions(list))
      .catch(() => setDivisions([]))
    return () => controller.abort()
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) return
    const controller = new AbortController()
    setLoading(true)
    void getLiveLeaderboardSummary(controller.signal, seasonId, divisionId)
      .then((res) => {
        if (res && !controller.signal.aborted) setLiveData(res)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [seasonId, divisionId])

  const selectedSeason = seasons.find((s) => s.id === seasonId) ?? null
  const seasonLabel = liveData?.season?.name || selectedSeason?.name || seasonName
  const selectedDivision = divisions.find((d) => d.id === divisionId) ?? null
  const scopeLabel =
    divisions.length > 1 ? (selectedDivision?.name ?? 'Combined divisions') : null

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
          {(seasons.length > 0 || divisions.length > 1) && (
            <div className="surface mb-6 flex flex-col gap-3 rounded-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              {seasons.length > 0 && (
                <div className="flex items-center justify-between gap-3 sm:justify-start">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Season
                  </span>
                  <Select
                    value={seasonId ? String(seasonId) : ''}
                    onChange={(value) => {
                      setDivisionId(null)
                      setSeasonId(Number(value))
                    }}
                    options={seasons.map((s) => ({
                      value: String(s.id),
                      label: `${s.name}${Boolean(s.is_current) ? ' · Live' : ''}`,
                    }))}
                    ariaLabel="Select season"
                    size="sm"
                    className="min-w-[12rem]"
                  />
                </div>
              )}

              {divisions.length > 1 && (
                <div className="flex items-center justify-between gap-3 sm:justify-start">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    Division
                  </span>
                  <div
                    role="group"
                    aria-label="Filter leaderboard by division"
                    className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-1"
                  >
                    {[
                      { id: 'combined', label: 'Combined' },
                      ...divisions.map((d) => ({ id: String(d.id), label: d.name })),
                    ].map((d) => {
                      const on = d.id === 'combined' ? divisionId === null : divisionId === Number(d.id)
                      return (
                        <button
                          key={d.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setDivisionId(d.id === 'combined' ? null : Number(d.id))}
                          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors duration-200 ${
                            on
                              ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                          }`}
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <p role="status" className="sr-only">
            Showing {seasonLabel}
            {scopeLabel ? `, ${scopeLabel}` : ''}
            {loading ? ', updating' : ''}
          </p>

          {/* bare tabs — no outer container */}
          <div className="mb-8 flex items-end justify-between gap-3 border-b border-[var(--border)]">
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
            {loading && (
              <span className="shrink-0 pb-2.5 text-[11px] font-semibold text-[var(--accent-text)]">
                Updating…
              </span>
            )}
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