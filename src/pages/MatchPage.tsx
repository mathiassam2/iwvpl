import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, ButtonLink, Card, Container, EmptyState, Section, Tabs } from '@/components/ui'
import { HeaderWash } from '@/components/layout/HeaderWash'
import { LineupList, Pitch } from '@/components/club'
import { SITE, siteData } from '@/data'
import { CLUB_PLACEHOLDER, cx, stripFlag, weekday, dayNum, monthShort } from '@/lib/format'
import { FORMATIONS, type PitchPlayer, type Squad } from '@/lib/fixtures'
import { findMatch } from '@/lib/match'
import {
  getLiveMatchDetail,
  type LiveMatchDetail,
  type LiveMatchEvent,
  type LiveMatchPlayerStat,
  type LiveMatchSquadMember,
} from '@/lib/liveLeague'

/* --------------------------------------------------------------- sub-parts */

function StatBar({
  label,
  home,
  away,
  suffix = '',
}: {
  label: string
  home: number | string
  away: number | string
  suffix?: string
}) {
  const h = Number(home)
  const a = Number(away)
  const total = h + a || 1
  const homePct = Math.round((h / total) * 100)
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="numeric text-sm font-bold text-[var(--text-strong)]">
          {home}
          {suffix}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
          {label}
        </span>
        <span className="numeric text-sm font-bold text-[var(--text-strong)]">
          {away}
          {suffix}
        </span>
      </div>
      <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <span
          className="h-full rounded-full bg-[var(--accent-solid)] transition-[width] duration-700"
          style={{ width: `${homePct}%` }}
        />
        <span
          className="h-full flex-1 rounded-full bg-[var(--border-strong)] transition-[width] duration-700"
          style={{ width: `${100 - homePct}%` }}
        />
      </div>
    </div>
  )
}

const EVENT_TONE: Record<string, { icon: string; text: string }> = {
  goal: { icon: '⚽', text: 'text-[var(--accent-text)]' },
  'own goal': { icon: '⚽', text: 'text-[var(--danger-text)]' },
  yellow: { icon: '▮', text: 'text-[var(--gold-text)]' },
  red: { icon: '▮', text: 'text-[var(--danger-text)]' },
  sub: { icon: '⇄', text: 'text-[var(--text-muted)]' },
}

function Timeline({
  events,
  homeName,
  awayName,
}: {
  events: LiveMatchEvent[]
  homeName: string
  awayName: string
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="Timeline not recorded"
        hint="Minute-by-minute events were not recorded for this fixture."
      />
    )
  }

  const EventChip = ({ e, side }: { e: LiveMatchEvent; side: 'left' | 'right' }) => {
    const tone = EVENT_TONE[e.type] ?? { icon: '•', text: 'text-[var(--text-muted)]' }
    return (
      <div
        className={cx(
          'flex min-w-0 items-center gap-2',
          side === 'right' ? 'justify-end text-right' : 'justify-start',
        )}
      >
        {side === 'right' && (
          <span className="line-clamp-2 min-w-0 text-sm text-[var(--text)]">{e.detail ?? e.playerName}</span>
        )}
        <span className={cx('shrink-0 text-sm', tone.text)}>{tone.icon}</span>
        {side === 'left' && (
          <span className="line-clamp-2 min-w-0 text-sm text-[var(--text)]">{e.detail ?? e.playerName}</span>
        )}
        {e.type === 'goal' && e.score && (
          <span
            className={cx(
              'numeric shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold',
              side === 'right'
                ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                : 'bg-[var(--surface-2)] text-[var(--text-strong)] ring-1 ring-[var(--border-strong)]',
            )}
          >
            {e.score}
          </span>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
        <span className="truncate text-right text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {stripFlag(homeName)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
          Min
        </span>
        <span className="truncate text-left text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {stripFlag(awayName)}
        </span>
      </div>

      <ol>
        {events.map((e, i) => (
          <li
            key={`${e.minute}-${i}`}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[var(--border)] px-4 py-2.5 last:border-0"
          >
            <div className="min-w-0">
              {e.teamSide === 'home' && <EventChip e={e} side="right" />}
            </div>
            <span className="numeric w-8 shrink-0 text-center text-xs font-bold text-[var(--text-faint)]">
              {e.minute}'
            </span>
            <div className="min-w-0">
              {e.teamSide === 'away' && <EventChip e={e} side="left" />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function GoalScorersSummary({
  homeName,
  awayName,
  homeClubId,
  awayClubId,
  playerStats,
}: {
  homeName: string
  awayName: string
  homeClubId: number
  awayClubId: number
  playerStats: LiveMatchPlayerStat[]
}) {
  const homeScorers = playerStats.filter((p) => p.clubId === homeClubId && p.goals > 0)
  const awayScorers = playerStats.filter((p) => p.clubId === awayClubId && p.goals > 0)

  if (homeScorers.length === 0 && awayScorers.length === 0) return null

  return (
    <Card className="p-0">
      <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
        Match Scorers
      </p>
      <div className="grid grid-cols-2 divide-x divide-[var(--border)] p-4 text-xs">
        <div className="space-y-1.5 pr-3 text-right">
          {homeScorers.map((s) => (
            <div key={s.id || s.gamertag} className="flex items-center justify-end gap-1.5">
              <span className="font-semibold text-[var(--text-strong)]">{s.gamertag}</span>
              <span className="text-[11px] font-bold text-[var(--accent-text)]">
                ⚽ {s.goals > 1 ? `x${s.goals}` : ''}
              </span>
            </div>
          ))}
          {homeScorers.length === 0 && <span className="text-[var(--text-faint)]">—</span>}
        </div>
        <div className="space-y-1.5 pl-3">
          {awayScorers.map((s) => (
            <div key={s.id || s.gamertag} className="flex items-center justify-start gap-1.5">
              <span className="text-[11px] font-bold text-[var(--accent-text)]">
                ⚽ {s.goals > 1 ? `x${s.goals}` : ''}
              </span>
              <span className="font-semibold text-[var(--text-strong)]">{s.gamertag}</span>
            </div>
          ))}
          {awayScorers.length === 0 && <span className="text-[var(--text-faint)]">—</span>}
        </div>
      </div>
    </Card>
  )
}

function PlayerStatsSection({
  homeName,
  awayName,
  homeClubId,
  awayClubId,
  playerStats,
}: {
  homeName: string
  awayName: string
  homeClubId: number
  awayClubId: number
  playerStats: LiveMatchPlayerStat[]
}) {
  const homePlayers = playerStats.filter((p) => p.clubId === homeClubId)
  const awayPlayers = playerStats.filter((p) => p.clubId === awayClubId)

  const renderTable = (players: LiveMatchPlayerStat[]) => {
    if (players.length === 0) {
      return (
        <div className="py-6 text-center text-xs text-[var(--text-faint)]">
          No individual player performance recorded.
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              <th className="py-2.5 pl-4 pr-2">Player</th>
              <th className="py-2.5 px-2 text-center">Rating</th>
              <th className="py-2.5 px-2 text-center" title="Goals">⚽</th>
              <th className="py-2.5 px-2 text-center" title="Assists">🎯</th>
              <th className="py-2.5 px-2 text-center" title="Saves">🧤</th>
              <th className="py-2.5 pr-4 pl-2 text-center" title="Clean Sheet">CS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {players.map((p) => (
              <tr key={p.id || p.gamertag} className="hover:bg-white/[0.02]">
                <td className="py-2.5 pl-4 pr-2 font-medium text-[var(--text)] flex items-center gap-1.5 min-w-[120px]">
                  <span>{p.gamertag}</span>
                  {p.isMom && (
                    <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 text-[9px] font-bold" title="Man of the Match">
                      ★ MoM
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-2 text-center font-bold">
                  {p.rating != null ? (
                    <span
                      className={cx(
                        'inline-block min-w-8 rounded px-1.5 py-0.5 text-[11px]',
                        p.rating >= 8.0
                          ? 'bg-emerald-500/20 text-emerald-400 font-extrabold'
                          : p.rating >= 7.0
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'bg-white/5 text-[var(--text-muted)]'
                      )}
                    >
                      {p.rating.toFixed(1)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2.5 px-2 text-center font-bold text-[var(--accent-text)]">
                  {p.goals > 0 ? p.goals : '—'}
                </td>
                <td className="py-2.5 px-2 text-center font-medium text-[var(--text-strong)]">
                  {p.assists > 0 ? p.assists : '—'}
                </td>
                <td className="py-2.5 px-2 text-center font-medium text-[var(--text-muted)]">
                  {p.saves > 0 ? p.saves : '—'}
                </td>
                <td className="py-2.5 pr-4 pl-2 text-center font-medium text-[var(--text-muted)]">
                  {p.cleanSheet ? '✓' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <Card className="p-0 overflow-hidden">
      <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
        Official Player Performances
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-strong)]">
            {stripFlag(homeName)}
          </div>
          {renderTable(homePlayers)}
        </div>
        <div className="border-t lg:border-t-0 lg:border-l border-[var(--border)]">
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-strong)]">
            {stripFlag(awayName)}
          </div>
          {renderTable(awayPlayers)}
        </div>
      </div>
    </Card>
  )
}

function buildSquadFromMembers(
  clubName: string,
  members: LiveMatchSquadMember[],
  formation = '4-3-3',
  manager = '—',
): Squad {
  const formDef = FORMATIONS[formation] ?? FORMATIONS['4-3-3']
  const slots = formDef.slots
  const starters: PitchPlayer[] = slots.map(([role, x, y], idx) => {
    const member = members[idx]
    if (!member) {
      return {
        number: idx === 0 ? 1 : idx + 1,
        name: members.length === 0 ? 'Unassigned' : '—',
        role,
        x,
        y,
      }
    }
    return {
      number: member.shirtNumber ?? (idx === 0 ? 1 : idx + 1),
      name: member.gamertag,
      role,
      x,
      y,
      isCaptain: false,
    }
  })

  const bench: PitchPlayer[] = members.slice(slots.length).map((member, idx) => ({
    number: member.shirtNumber ?? slots.length + idx + 1,
    name: member.gamertag,
    role: 'SUB',
    x: 50,
    y: 50,
  }))

  return {
    formation: formDef.shape,
    starters,
    bench,
    manager,
  }
}

/* -------------------------------------------------------------------- page */

export default function MatchPage() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState('overview')
  const [liveMatch, setLiveMatch] = useState<LiveMatchDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // 1. Fetch live match details from database API
  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    const controller = new AbortController()

    void (async () => {
      try {
        const data = await getLiveMatchDetail(id, controller.signal)
        if (active) {
          setLiveMatch(data)
          setLoading(false)
        }
      } catch {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [id])

  // Fallback to static crawled match if API doesn't return
  const fallbackFound = useMemo(() => findMatch(id), [id])
  const fallbackMatch = fallbackFound?.match

  const matchData = useMemo(() => {
    if (liveMatch) {
      return {
        id: liveMatch.id,
        home: liveMatch.home.name,
        away: liveMatch.away.name,
        homeLogo: liveMatch.home.logo,
        awayLogo: liveMatch.away.logo,
        date: liveMatch.date,
        time: liveMatch.time,
        hs: liveMatch.hs,
        as: liveMatch.as,
        played: liveMatch.played,
        divisionName: liveMatch.divisionName,
        homeSquad: buildSquadFromMembers(liveMatch.home.name, liveMatch.homeSquad),
        awaySquad: buildSquadFromMembers(liveMatch.away.name, liveMatch.awaySquad),
        hasStats: liveMatch.hasStats,
        stats: liveMatch.stats,
        events: liveMatch.events,
        playerStats: liveMatch.playerStats,
      }
    }

    if (fallbackMatch) {
      return {
        id: fallbackMatch.id,
        home: fallbackMatch.home,
        away: fallbackMatch.away,
        homeLogo: fallbackMatch.homeLogo,
        awayLogo: fallbackMatch.awayLogo,
        date: fallbackMatch.date,
        time: fallbackMatch.time,
        hs: fallbackMatch.hs,
        as: fallbackMatch.as,
        played: fallbackMatch.hs !== '' && fallbackMatch.as !== '',
        divisionName: undefined,
        homeSquad: buildSquadFromMembers(fallbackMatch.home, []),
        awaySquad: buildSquadFromMembers(fallbackMatch.away, []),
        hasStats: false,
        stats: null,
        events: [],
        playerStats: [],
      }
    }

    return null
  }, [liveMatch, fallbackMatch])

  const standings = useMemo(() => {
    if (!matchData) return null
    const rows = siteData.standings
    const h = rows.findIndex((s) => stripFlag(s.team) === stripFlag(matchData.home))
    const a = rows.findIndex((s) => stripFlag(s.team) === stripFlag(matchData.away))
    if (h < 0 && a < 0) return null
    const lo = Math.max(0, Math.min(h < 0 ? a : h, a < 0 ? h : a) - 2)
    const hi = Math.min(rows.length, Math.max(h < 0 ? a : h, a < 0 ? h : a) + 3)
    return rows.slice(lo, hi)
  }, [matchData])

  if (loading && !matchData) {
    return (
      <Section>
        <Container size="narrow">
          <div className="py-16 text-center text-sm text-[var(--text-muted)]">
            Loading fixture details...
          </div>
        </Container>
      </Section>
    )
  }

  if (!matchData) {
    return (
      <Section>
        <Container size="narrow">
          <EmptyState
            title="Match not found"
            hint="That fixture is not in the current season's results."
          />
          <div className="mt-6 flex justify-center">
            <ButtonLink to="/matches" size="lg">
              All results
            </ButtonLink>
          </div>
        </Container>
      </Section>
    )
  }

  const homeStanding = siteData.standings.find(
    (s) => stripFlag(s.team) === stripFlag(matchData.home),
  )
  const awayStanding = siteData.standings.find(
    (s) => stripFlag(s.team) === stripFlag(matchData.away),
  )

  const panels: Record<string, React.ReactNode> = {
    overview: (
      <div className="space-y-6">
        {/* Real timeline if recorded */}
        {matchData.events.length > 0 ? (
          <Card className="p-0">
            <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              Timeline
            </p>
            <Timeline events={matchData.events} homeName={matchData.home} awayName={matchData.away} />
          </Card>
        ) : matchData.playerStats.some((p) => p.goals > 0) ? (
          /* Real goal scorers summary if player stats have goals */
          <GoalScorersSummary
            homeName={matchData.home}
            awayName={matchData.away}
            homeClubId={liveMatch?.home.id ?? 0}
            awayClubId={liveMatch?.away.id ?? 0}
            playerStats={matchData.playerStats}
          />
        ) : (
          /* Clean, honest empty state for fixtures without recorded timeline */
          <Card className="p-0">
            <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              Timeline
            </p>
            <div className="py-6 px-4">
              <EmptyState
                title="Timeline not recorded"
                hint="Minute-by-minute timeline was not recorded for this fixture."
              />
            </div>
          </Card>
        )}

        {/* Real Match Stats if recorded */}
        {matchData.hasStats && matchData.stats ? (
          <Card className="p-0">
            <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              Match stats
            </p>
            <div className="divide-y divide-[var(--border)] px-4">
              {matchData.stats.possession && (
                <StatBar label="Possession" home={matchData.stats.possession[0]} away={matchData.stats.possession[1]} suffix="%" />
              )}
              {matchData.stats.shots && (
                <StatBar label="Shots" home={matchData.stats.shots[0]} away={matchData.stats.shots[1]} />
              )}
              {matchData.stats.onTarget && (
                <StatBar label="On target" home={matchData.stats.onTarget[0]} away={matchData.stats.onTarget[1]} />
              )}
              {matchData.stats.passAccuracy && (
                <StatBar label="Pass accuracy" home={matchData.stats.passAccuracy[0]} away={matchData.stats.passAccuracy[1]} suffix="%" />
              )}
              {matchData.stats.tackles && (
                <StatBar label="Tackles" home={matchData.stats.tackles[0]} away={matchData.stats.tackles[1]} />
              )}
              {matchData.stats.saves && (
                <StatBar label="Saves" home={matchData.stats.saves[0]} away={matchData.stats.saves[1]} />
              )}
              {matchData.stats.corners && (
                <StatBar label="Corners" home={matchData.stats.corners[0]} away={matchData.stats.corners[1]} />
              )}
              {matchData.stats.fouls && (
                <StatBar label="Fouls" home={matchData.stats.fouls[0]} away={matchData.stats.fouls[1]} />
              )}
              {matchData.stats.offsides && (
                <StatBar label="Offsides" home={matchData.stats.offsides[0]} away={matchData.stats.offsides[1]} />
              )}
            </div>
          </Card>
        ) : (
          <Card className="p-0">
            <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              Match stats
            </p>
            <div className="py-6 px-4">
              <EmptyState
                title="Statistics not recorded"
                hint="Match statistics were not recorded for this fixture."
              />
            </div>
          </Card>
        )}

        {/* Real Player Performances from EA Pro Clubs or Admin match sheets */}
        {matchData.playerStats.length > 0 && liveMatch && (
          <PlayerStatsSection
            homeName={matchData.home}
            awayName={matchData.away}
            homeClubId={liveMatch.home.id}
            awayClubId={liveMatch.away.id}
            playerStats={matchData.playerStats}
          />
        )}
      </div>
    ),
    lineups: (
      <div className="space-y-8">
        {[
          { squad: matchData.homeSquad, name: matchData.home, home: true },
          { squad: matchData.awaySquad, name: matchData.away, home: false },
        ].map((side, i) => (
          <Card key={i} className="p-0">
            <div className="flex items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3">
              <Badge tone="muted">{side.squad.formation}</Badge>
              <span className="truncate text-sm font-bold text-[var(--text-strong)]">
                {stripFlag(side.name)}
              </span>
              <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                {side.home ? 'Home' : 'Away'}
              </span>
            </div>
            <div className="p-4 sm:p-5">
              <div className="mx-auto max-w-[30rem]">
                <Pitch squad={side.squad} home={side.home} />
              </div>
            </div>
          </Card>
        ))}

        <div className="grid gap-6 lg:grid-cols-2">
          {[matchData.homeSquad, matchData.awaySquad].map((squad, side) => (
            <Card key={side} className="p-0">
              <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                {stripFlag(side === 0 ? matchData.home : matchData.away)} · squad list
              </p>
              <LineupList squad={squad} home={side === 0} />
            </Card>
          ))}
        </div>
      </div>
    ),
    table: (
      <Card className="p-0">
        <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
          Table context
        </p>
        {standings ? (
          <ul className="divide-y divide-[var(--border)]">
            {standings.map((s) => {
              const on =
                stripFlag(s.team) === stripFlag(matchData.home) ||
                stripFlag(s.team) === stripFlag(matchData.away)
              return (
                <li
                  key={s.team}
                  className={cx(
                    'flex items-center gap-3 px-5 py-2.5',
                    on && 'bg-[var(--accent-tint)]',
                  )}
                >
                  <span className="numeric w-5 shrink-0 text-right text-xs text-[var(--text-faint)]">
                    {s.pos}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">
                    {stripFlag(s.team)}
                  </span>
                  <span className="numeric text-xs text-[var(--text-faint)]">{s.pl} pl</span>
                  <span className="numeric w-8 shrink-0 text-right text-sm font-bold text-[var(--text-strong)]">
                    {s.pts}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-[var(--text-muted)]">
            Neither club appears in the current table.
          </p>
        )}
      </Card>
    ),
  }

  return (
    <div className="page-enter">
      {/* ---------------- scoreboard ---------------- */}
      <section className="relative -mt-16 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-2)] pt-16 lg:-mt-[72px] lg:pt-[72px]">
        <HeaderWash />
        <Container size="wide" className="relative pb-10 pt-2 lg:pb-12">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
              <li>
                <Link to="/matches" className="transition-colors hover:text-[var(--text)]">
                  Matches
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-[var(--text-muted)]">
                {stripFlag(matchData.home)} vs {stripFlag(matchData.away)}
              </li>
            </ol>
          </nav>

          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
            {SITE.name} · {matchData.divisionName ?? 'Season 1'}
          </p>

          <div className="mt-6 flex items-center justify-between gap-3 sm:gap-6">
            <TeamSide name={matchData.home} logo={matchData.homeLogo} standing={homeStanding} align="right" />

            <div className="shrink-0 text-center">
              {matchData.played ? (
                <p className="numeric text-5xl font-extrabold leading-none text-[var(--text-strong)] sm:text-6xl">
                  {matchData.hs}
                  <span className="mx-2 text-3xl text-[var(--text-faint)]">:</span>
                  {matchData.as}
                </p>
              ) : (
                <p className="numeric text-4xl font-extrabold text-[var(--text-strong)]">
                  {matchData.time || 'TBC'}
                </p>
              )}
              {matchData.date && (
                <p className="mt-2 text-[11px] text-[var(--text-faint)]">
                  {weekday(matchData.date)} {dayNum(matchData.date)} {monthShort(matchData.date)} {matchData.date.slice(-4)}
                </p>
              )}
              {matchData.played && <p className="text-[11px] text-[var(--text-faint)]">Full time</p>}
            </div>

            <TeamSide name={matchData.away} logo={matchData.awayLogo} standing={awayStanding} align="left" />
          </div>
        </Container>
      </section>

      {/* ---------------- tabs ---------------- */}
      <Section>
        <Container size="wide">
          <div className="mb-6 border-b border-[var(--border)]">
            <Tabs
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'lineups', label: 'Lineups' },
                { id: 'table', label: 'Table' },
              ]}
              active={tab}
              onChange={setTab}
              idPrefix="match"
            />
          </div>

          <div id={`match-panel-${tab}`} role="tabpanel" aria-labelledby={`match-${tab}`}>
            {panels[tab]}
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/matches?tab=results" variant="outline">
              All results
            </ButtonLink>
            <ButtonLink to="/matches?tab=upcoming">Full schedule</ButtonLink>
          </div>
        </Container>
      </Section>
    </div>
  )
}

/* --------------------------------------------------------------- TeamSide */

function TeamSide({
  name,
  logo,
  standing,
  align,
}: {
  name: string
  logo?: string
  standing?: { pos: number; pts: number }
  align: 'left' | 'right'
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-1 flex-col items-center gap-3',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <img
        src={logo ?? CLUB_PLACEHOLDER}
        alt=""
        onError={(e) => {
          e.currentTarget.src = CLUB_PLACEHOLDER
        }}
        className="h-16 w-16 object-contain sm:h-20 sm:w-20"
      />
      <span className="line-clamp-2 text-sm font-bold leading-tight text-[var(--text-strong)] sm:text-base">
        {stripFlag(name)}
      </span>
      {standing && (
        <span className="text-[11px] text-[var(--text-faint)]">
          <span className="numeric font-bold text-[var(--accent-text)]">{standing.pos}</span> ·{' '}
          <span className="numeric">{standing.pts} pts</span>
        </span>
      )}
    </div>
  )
}
