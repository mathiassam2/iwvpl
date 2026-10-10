import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Badge,
  ButtonLink,
  Card,
  Container,
  EmptyState,
  Section,
  SmartImage,
  Tabs,
} from '@/components/ui'
import { HeaderWash } from '@/components/layout/HeaderWash'
import { StatTile } from '@/components/league'
import { SITE } from '@/data'
import {
  AVATAR_PLACEHOLDER,
  CLUB_PLACEHOLDER,
  clubHref,
  cx,
  isoToFlag,
  stripFlag,
} from '@/lib/format'
import { findPlayerBySlug, playerHref } from '@/lib/players'

/** "2026-10-08 13:33" -> "8 Oct 2026" */
function moveDate(d: string): string {
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return d
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "2026-10-08 13:33" -> "Oct 2026", for grouping a season column. */
function moveMonth(d: string): string {
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return d
  return t.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export default function PlayerPage() {
  const { slug = '' } = useParams()
  const [tab, setTab] = useState('overview')

  const player = useMemo(() => findPlayerBySlug(slug), [slug])

  const totals = useMemo(() => {
    if (!player) return null
    const by = (unit: string) =>
      player.stats.find((s) => s.unit === unit)?.value ?? 0
    const rankOf = (unit: string) => player.stats.find((s) => s.unit === unit)?.rank ?? null
    return { goals: by('goals'), assists: by('assists'), saves: by('saves'), rankOf }
  }, [player])

  if (!player) {
    return (
      <Section>
        <Container size="narrow">
          <EmptyState
            title="Player not found"
            hint="That player is not on a board or in the transfer log. Browse the leaderboard to find a name."
          />
          <div className="mt-6 flex justify-center">
            <ButtonLink to="/leaderboard" size="lg">
              Full leaderboard
            </ButtonLink>
          </div>
        </Container>
      </Section>
    )
  }

  const club = player.club
  const goalStat = player.stats.find((s) => s.unit === 'goals')
  const primaryStat = player.stats[0]

  const keyFacts = (
    // Two columns, not four: this sits in the narrow right rail, and the
    // four-up variant squeezed the labels until "ASSISTS" and "SCORER" clipped.
    <div className="grid grid-cols-2 gap-3">
      <StatTile
        label="Rank"
        value={player.bestRank ? `#${player.bestRank}` : '—'}
        hint={primaryStat?.board.replace(/^TOP\s*/i, '') ?? 'Unranked'}
      />
      <StatTile label="Goals" value={totals?.goals ?? 0} />
      <StatTile label="Assists" value={totals?.assists ?? 0} />
      <StatTile label="Saves" value={totals?.saves ?? 0} />
    </div>
  )

  const career = (
    <Card className="p-0">
      <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
        Career history
      </p>
      {player.moves.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--text-muted)]">
          No recorded transfers for this player.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {player.moves.map((m, i) => (
            <li key={`${m.date}-${i}`} className="flex items-center gap-4 px-5 py-3.5">
              <span
                className={cx(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold',
                  m.direction === 'in'
                    ? 'bg-[var(--badge-up-bg)] text-[var(--badge-up-fg)]'
                    : 'bg-[var(--badge-down-bg)] text-[var(--badge-down-fg)]',
                )}
                aria-hidden
              >
                {m.direction === 'in' ? '\u2193' : '\u2191'}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text-strong)]">
                  {m.free ? 'Free agent' : stripFlag(m.club)}
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  {m.direction === 'in' ? 'Joined' : 'Released'} · {moveMonth(m.date)}
                </span>
              </span>

              {!m.free && (
                <Link
                  to={clubHref(m.club)}
                  className="shrink-0 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
                >
                  Club →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'career', label: 'Career history', count: player.moves.length },
  ]

  return (
    <div className="page-enter">
      {/* ---------------- profile header ---------------- */}
      <section className="band-wash relative -mt-16 overflow-hidden border-b border-[var(--border)] pt-16 lg:-mt-[72px] lg:pt-[72px]">
        <HeaderWash />
        <Container size="wide" className="relative pb-8 pt-2 lg:pb-10">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
              <li>
                <Link to="/leaderboard" className="transition-colors hover:text-[var(--text)]">
                  Leaderboard
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="truncate text-[var(--text-muted)]">{player.name}</li>
            </ol>
          </nav>

          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <SmartImage
              src={player.avatar}
              fallback={AVATAR_PLACEHOLDER}
              alt={`${player.name} portrait`}
              wrapperClassName="h-24 w-24 shrink-0 rounded-full ring-2 ring-[var(--border-strong)] sm:h-28 sm:w-28"
              className="object-cover"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                {player.bestRank && player.bestRank <= 3 && (
                  <Badge tone="gold">{`Top ${player.bestRank}`}</Badge>
                )}
                {player.stats.length === 0 && <Badge tone="muted">Unranked</Badge>}
              </div>

              <h1 className="mt-2.5 break-words text-2xl font-extrabold leading-tight text-[var(--text-strong)] sm:text-4xl">
                {player.name}
              </h1>

              {club && (
                <p className="mt-3 flex flex-wrap items-center gap-2.5 text-sm text-[var(--text-muted)]">
                  <SmartImage
                    src={club.logo || CLUB_PLACEHOLDER}
                    fallback={CLUB_PLACEHOLDER}
                    alt=""
                    wrapperClassName="h-6 w-6 shrink-0"
                    className="object-contain"
                  />
                  <span aria-hidden>{club.flag || isoToFlag('')}</span>
                  <Link
                    to={clubHref(club.name)}
                    className="font-semibold text-[var(--text-strong)] hover:text-[var(--accent-text)]"
                  >
                    {stripFlag(club.name)}
                  </Link>
                </p>
              )}
            </div>

            <ButtonLink to="/leaderboard" variant="outline" size="md" className="shrink-0 self-start sm:self-auto">
              Full board
            </ButtonLink>
          </div>
        </Container>
      </section>

      {/* ---------------- body ---------------- */}
      <Section>
        <Container size="wide">
          <div className="mb-6 border-b border-[var(--border)]">
            <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="player" />
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12" id={`player-panel-${tab}`} role="tabpanel" aria-labelledby={`player-${tab}`}>
            {tab === 'overview' && (
              <>
                <div className="min-w-0 space-y-6">
                  {/* current club — links through to the club page */}
                  {club && (
                    <Card className="p-0">
                      <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                        Current club
                      </p>
                      {club.free ? (
                        <div className="flex items-center gap-4 px-5 py-4">
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-dashed border-[var(--border-strong)] text-xs font-bold text-[var(--text-faint)]">
                            FA
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-bold text-[var(--text-strong)]">
                              Free agent
                            </span>
                            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                              Not attached to a club
                            </span>
                          </span>
                        </div>
                      ) : (
                        <Link
                          to={clubHref(club.name)}
                          className="row-hover group flex items-center gap-4 px-5 py-4"
                        >
                          <SmartImage
                            src={club.logo || CLUB_PLACEHOLDER}
                            fallback={CLUB_PLACEHOLDER}
                            alt=""
                            wrapperClassName="h-12 w-12 shrink-0"
                            className="object-contain"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-bold text-[var(--text-strong)]">
                              {stripFlag(club.name)}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                              <span aria-hidden>{club.flag || isoToFlag('')}</span>
                              <span>IWVPL Pro Club League</span>
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-[var(--accent-text)] opacity-0 transition-opacity group-hover:opacity-100">
                            Club page →
                          </span>
                        </Link>
                      )}
                    </Card>
                  )}

                  <Card className="p-0">
                    <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                      Season record
                    </p>
                    <ul className="divide-y divide-[var(--border)]">
                      {player.stats.length === 0 ? (
                        <li className="px-5 py-6 text-sm text-[var(--text-muted)]">
                          Not currently ranked on an individual board.
                        </li>
                      ) : (
                        player.stats.map((s) => (
                          <li key={s.board} className="flex items-center gap-4 px-5 py-3">
                            <span className="numeric grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-2)] text-xs font-bold text-[var(--text-muted)]">
                              {s.rank}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">
                              {s.board.replace(/^TOP\s*/i, '')}
                            </span>
                            <span className="numeric text-lg font-bold text-[var(--accent-text)]">
                              {s.value}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                    <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-faint)]">
                      Appearance, minutes and shot data are not collected for this league yet.
                    </p>
                  </Card>
                </div>

                {/* key facts rail, mirroring the club page's right rail */}
                <div className="min-w-0 space-y-6">
                  <div className="grid grid-cols-2 gap-3">{keyFacts}</div>
                  <Card className="p-0">
                    <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                      Career summary
                    </p>
                    <ul className="divide-y divide-[var(--border)]">
                      <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <span className="text-[var(--text-muted)]">Clubs represented</span>
                        <span className="numeric font-bold text-[var(--text-strong)]">
                          {new Set(player.moves.filter((m) => !m.free).map((m) => m.club)).size}
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <span className="text-[var(--text-muted)]">Registered moves</span>
                        <span className="numeric font-bold text-[var(--text-strong)]">
                          {player.moves.length}
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <span className="text-[var(--text-muted)]">Season</span>
                        <span className="font-bold text-[var(--text-strong)]">{SITE.season}</span>
                      </li>
                    </ul>
                  </Card>
                </div>
              </>
            )}
            {tab === 'career' && career}
          </div>
        </Container>
      </Section>
    </div>
  )
}

export { moveDate, playerHref }