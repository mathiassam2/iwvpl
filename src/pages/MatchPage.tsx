import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, ButtonLink, Card, Container, EmptyState, Section, Tabs } from '@/components/ui'
import { LineupList, Pitch } from '@/components/club'
import { SITE, siteData } from '@/data'
import { CLUB_PLACEHOLDER, cx, stripFlag, weekday, dayNum, monthShort } from '@/lib/format'
import { eventsFor, squadFor, statsFor } from '@/lib/fixtures'
import { findMatch } from '@/lib/match'

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

const EVENT_TONE = {
  goal: { icon: '⚽', text: 'text-[var(--accent-text)]' },
  'own goal': { icon: '⚽', text: 'text-[var(--danger-text)]' },
  yellow: { icon: '▮', text: 'text-[var(--gold-text)]' },
  red: { icon: '▮', text: 'text-[var(--danger-text)]' },
  sub: { icon: '⇄', text: 'text-[var(--text-muted)]' },
} as const

function Timeline({
  events,
  homeName,
  awayName,
}: {
  events: ReturnType<typeof eventsFor>
  homeName: string
  awayName: string
}) {
  if (events.length === 0) {
    return (
      <EmptyState title="No event data" hint="This fixture has no recorded timeline." />
    )
  }

  const EventChip = ({ e, side }: { e: (typeof events)[number]; side: 'left' | 'right' }) => {
    const tone = EVENT_TONE[e.type]
    return (
      <div
        className={cx(
          'flex min-w-0 items-center gap-2',
          side === 'right' ? 'justify-end text-right' : 'justify-start',
        )}
      >
        {side === 'right' && (
          <span className="line-clamp-2 min-w-0 text-sm text-[var(--text)]">{e.detail}</span>
        )}
        <span className={cx('shrink-0 text-sm', tone.text)}>{tone.icon}</span>
        {side === 'left' && (
          <span className="line-clamp-2 min-w-0 text-sm text-[var(--text)]">{e.detail}</span>
        )}
        {e.type === 'goal' && (
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
      {/* column headers so each side is identifiable */}
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
              {e.team === 'home' && <EventChip e={e} side="right" />}
            </div>
            <span className="numeric w-8 shrink-0 text-center text-xs font-bold text-[var(--text-faint)]">
              {e.minute}'
            </span>
            <div className="min-w-0">
              {e.team === 'away' && <EventChip e={e} side="left" />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* -------------------------------------------------------------------- page */

export default function MatchPage() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState('overview')

  const found = useMemo(() => findMatch(id), [id])
  const match = found?.match

  const derived = useMemo(() => {
    if (!match) return null
    const key = `${match.home}|${match.away}|${match.date}`
    return {
      home: squadFor(`home:${match.home}`),
      away: squadFor(`away:${match.away}`),
      events: eventsFor(match, key),
      stats: statsFor(match, key),
    }
  }, [match])

  const standings = useMemo(() => {
    if (!match) return null
    const rows = siteData.standings
    const h = rows.findIndex((s) => stripFlag(s.team) === stripFlag(match.home))
    const a = rows.findIndex((s) => stripFlag(s.team) === stripFlag(match.away))
    if (h < 0 && a < 0) return null
    const lo = Math.max(0, Math.min(h < 0 ? a : h, a < 0 ? h : a) - 2)
    const hi = Math.min(rows.length, Math.max(h < 0 ? a : h, a < 0 ? h : a) + 3)
    return rows.slice(lo, hi)
  }, [match])

  if (!match || !derived) {
    return (
      <Section>
        <Container size="narrow">
          <EmptyState
            title="Match not found"
            hint="That fixture is not in the current season's results."
          />
          <div className="mt-6 flex justify-center">
            <ButtonLink to="/results" size="lg">
              All results
            </ButtonLink>
          </div>
        </Container>
      </Section>
    )
  }

  const played = match.hs !== '' && match.as !== ''
  const homeStanding = siteData.standings.find(
    (s) => stripFlag(s.team) === stripFlag(match.home),
  )
  const awayStanding = siteData.standings.find(
    (s) => stripFlag(s.team) === stripFlag(match.away),
  )

  const panels: Record<string, React.ReactNode> = {
    overview: (
      <div className="space-y-6">
        <Card className="p-0">
          <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
            Timeline
          </p>
          <Timeline events={derived.events} homeName={match.home} awayName={match.away} />
        </Card>

        <Card className="p-0">
          <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
            Match stats
          </p>
          <div className="divide-y divide-[var(--border)] px-4">
            <StatBar label="Possession" home={derived.stats.possession[0]} away={derived.stats.possession[1]} suffix="%" />
            <StatBar label="Shots" home={derived.stats.shots[0]} away={derived.stats.shots[1]} />
            <StatBar label="On target" home={derived.stats.onTarget[0]} away={derived.stats.onTarget[1]} />
            <StatBar label="Pass accuracy" home={derived.stats.passAccuracy[0]} away={derived.stats.passAccuracy[1]} suffix="%" />
            <StatBar label="Corners" home={derived.stats.corners[0]} away={derived.stats.corners[1]} />
            <StatBar label="Fouls" home={derived.stats.fouls[0]} away={derived.stats.fouls[1]} />
            <StatBar label="Offsides" home={derived.stats.offsides[0]} away={derived.stats.offsides[1]} />
          </div>
        </Card>
      </div>
    ),
    lineups: (
      <div className="space-y-8">
        {/* the two pitches, stacked - the headline of this tab */}
        {[
          { squad: derived.home, name: match.home, home: true },
          { squad: derived.away, name: match.away, home: false },
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
          {[derived.home, derived.away].map((squad, side) => (
            <Card key={side} className="p-0">
              <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                {stripFlag(side === 0 ? match.home : match.away)} · squad list
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
                stripFlag(s.team) === stripFlag(match.home) ||
                stripFlag(s.team) === stripFlag(match.away)
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
      <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--surface-2)]">
        <div aria-hidden className="absolute inset-0 bg-grid opacity-40" />
        <Container size="wide" className="relative py-10 lg:py-12">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
              <li>
                <Link to="/results" className="transition-colors hover:text-[var(--text)]">
                  Results
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-[var(--text-muted)]">
                {stripFlag(match.home)} vs {stripFlag(match.away)}
              </li>
            </ol>
          </nav>

          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
            {SITE.name} · Season 1
          </p>

          <div className="mt-6 flex items-center justify-between gap-3 sm:gap-6">
            <TeamSide name={match.home} logo={match.homeLogo} standing={homeStanding} align="right" />

            <div className="shrink-0 text-center">
              {played ? (
                <p className="numeric text-5xl font-extrabold leading-none text-[var(--text-strong)] sm:text-6xl">
                  {match.hs}
                  <span className="mx-2 text-3xl text-[var(--text-faint)]">:</span>
                  {match.as}
                </p>
              ) : (
                <p className="numeric text-4xl font-extrabold text-[var(--text-strong)]">
                  {match.time || 'TBC'}
                </p>
              )}
              <p className="mt-2 text-[11px] text-[var(--text-faint)]">
                {weekday(match.date)} {dayNum(match.date)} {monthShort(match.date)} {match.date.slice(-4)}
              </p>
              <p className="text-[11px] text-[var(--text-faint)]">Full time</p>
            </div>

            <TeamSide name={match.away} logo={match.awayLogo} standing={awayStanding} align="left" />
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
            <ButtonLink to="/results" variant="outline">
              All results
            </ButtonLink>
            <ButtonLink to="/schedule">Full schedule</ButtonLink>
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