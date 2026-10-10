import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Badge,
  ButtonLink,
  Card,
  Container,
  EmptyState,
  Section,
  SectionHead,
  SmartImage,
  Tabs,
} from '@/components/ui'
import { FormGuide, MatchRow, StatTile } from '@/components/league'
import { NextMatchCard, Pitch, TableSnippet, TeamFormStrip } from '@/components/club'
import { SITE, siteData } from '@/data'
import { AVATAR_PLACEHOLDER, CLUB_PLACEHOLDER, clubSlug, cx, stripFlag } from '@/lib/format'
import { matchIndexOf } from '@/lib/match'
import { squadFor } from '@/lib/fixtures'

const STATUS_TONE = {
  Active: 'volt',
  'Non-Active': 'muted',
  'Pending Approval': 'gold',
  '': 'muted',
} as const

/** Names differ only by flag emoji / case between the datasets. */
function sameClub(a: string, b: string): boolean {
  return clubSlug(stripFlag(a)) === clubSlug(stripFlag(b))
}

export default function ClubDetailPage() {
  const { slug = '' } = useParams()
  const [tab, setTab] = useState('overview')

  const club = useMemo(
    () => siteData.clubs.find((c) => clubSlug(stripFlag(c.name)) === clubSlug(slug)),
    [slug],
  )

  const data = useMemo(() => {
    if (!club) return null
    const standing = siteData.standings.find((s) => sameClub(s.team, club.name))
    const all = siteData.results.filter(
      (m) => sameClub(m.home, club.name) || sameClub(m.away, club.name),
    )
    const played = all.filter((m) => m.hs !== '' && m.as !== '')
    const next = all.find((m) => m.hs === '' || m.as === '')
    const last = played.length
      ? [...played].sort((a, b) => b.date.localeCompare(a.date))[0]
      : undefined
    const transfers = siteData.transfers
      .filter((t) => sameClub(t.from.name, club.name) || sameClub(t.to.name, club.name))
      .slice(0, 8)
    const scorers = siteData.leaderboards
      .map((board) => ({
        board: board.title,
        rows: board.rows.filter((r) => sameClub(r.team, club.name)),
      }))
      .filter((g) => g.rows.length > 0)
    const squad = squadFor(club.name)
    return { standing, matches: played, next, last, transfers, scorers, squad }
  }, [club])

  if (!club || !data) {
    return (
      <Section>
        <Container size="narrow">
          <EmptyState
            title="Club not found"
            hint="That club is not registered in this league. Browse the full list to find your team."
          />
          <div className="mt-6 flex justify-center">
            <ButtonLink to="/clubs" size="lg">
              All clubs
            </ButtonLink>
          </div>
        </Container>
      </Section>
    )
  }

  const name = stripFlag(club.name)
  const lastHref = data.last ? `/matches/${matchIndexOf(data.last)}` : '/results'

  const overview = (
    <div className="space-y-6">
      {/* last starting XI on a pitch */}
      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              Last starting XI
            </p>
            {data.last && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                vs {stripFlag(data.last.away === club.name ? data.last.home : data.last.away)} ·{' '}
                <Link
                  to={lastHref}
                  className="font-semibold text-[var(--text-strong)] hover:underline"
                >
                  {data.last.hs} - {data.last.as}
                </Link>
              </p>
            )}
          </div>
          <span className="numeric shrink-0 rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-xs font-bold text-[var(--text-muted)]">
            {data.squad.formation}
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mx-auto max-w-[30rem]">
            <Pitch squad={data.squad} home />
          </div>
        </div>

        <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-faint)]">
          Manager <span className="font-semibold text-[var(--text-muted)]">{data.squad.manager}</span>
          {' · '}
          <span className="text-[var(--text-faint)]">Lineup is placeholder data until squads are registered.</span>
        </p>
      </Card>

      {/* matches */}
      <div>
        <SectionHead
          eyebrow="Fixtures"
          title="Matches played"
          action={
            <ButtonLink to="/results" variant="outline">
              All results
            </ButtonLink>
          }
        />
        {data.matches.length === 0 ? (
          <EmptyState
            title="No recorded matches yet"
            hint="Results appear here as soon as fixtures are submitted."
          />
        ) : (
          <div className="surface divide-y divide-[var(--border)] overflow-hidden rounded-card">
            {data.matches.slice(0, 6).map((m) => (
              <MatchRow key={`${m.url}-${m.home}`} match={m} index={matchIndexOf(m)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const squadPanel = (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-0">
        <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
          Starting XI · {data.squad.formation}
        </p>
        <ul className="divide-y divide-[var(--border)]">
          {data.squad.starters.map((p) => (
            <li key={p.number} className="flex items-center gap-3 px-5 py-2.5">
              <span className="numeric grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent-tint)] text-[11px] font-bold text-[var(--accent-text)]">
                {p.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
                {p.name}
              </span>
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                {p.role}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-0">
        <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
          Bench
        </p>
        <ul className="divide-y divide-[var(--border)]">
          {data.squad.bench.map((p) => (
            <li key={p.number} className="flex items-center gap-3 px-5 py-2.5">
              <span className="numeric grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[11px] font-bold text-[var(--text-muted)]">
                {p.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
                {p.name}
              </span>
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                {p.role}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )

  const statsPanel = (
    <div className="space-y-8">
      {data.standing && (
        <div>
          <SectionHead eyebrow="Season record" title="At a glance" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Position" value={data.standing.pos} />
            <StatTile label="Played" value={data.standing.pl} />
            <StatTile label="Won" value={data.standing.w} />
            <StatTile label="Goals for" value={data.standing.gf} />
            <StatTile label="Goals against" value={data.standing.ga} />
            <StatTile label="Points" value={data.standing.pts} />
          </div>
        </div>
      )}

      {data.scorers.length > 0 && (
        <div>
          <SectionHead eyebrow="Individual honours" title="Top scorers" />
          <div className="space-y-5">
            {data.scorers.map((g) => (
              <Card key={g.board} className="p-0">
                <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                  {g.board}
                </p>
                <ul className="divide-y divide-[var(--border)]">
                  {g.rows.slice(0, 5).map((r) => (
                    <li key={r.name} className="flex items-center gap-3 px-5 py-3">
                      <span className="numeric w-6 shrink-0 text-right text-xs text-[var(--text-faint)]">
                        {r.pos}
                      </span>
                      <SmartImage
                        src={r.avatarLocal || AVATAR_PLACEHOLDER}
                        fallback={AVATAR_PLACEHOLDER}
                        alt=""
                        wrapperClassName="h-8 w-8 shrink-0 rounded-full"
                        className="object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
                        {r.name}
                      </span>
                      <span className="numeric text-sm font-bold text-[var(--accent-text)]">
                        {r.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionHead
          eyebrow="Squad"
          title="Transfer activity"
          action={
            <ButtonLink to="/transfer" variant="outline">
              All moves
            </ButtonLink>
          }
        />
        {data.transfers.length === 0 ? (
          <EmptyState title="No recorded moves" hint="Registered signings and releases appear here." />
        ) : (
          <ul className="surface divide-y divide-[var(--border)] overflow-hidden rounded-card">
            {data.transfers.map((t, i) => {
              const inbound = sameClub(t.to.name, club.name)
              const other = inbound ? t.from : t.to
              return (
                <li key={`${t.player}-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className={cx(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold',
                      inbound
                        ? 'bg-[var(--badge-up-bg)] text-[var(--badge-up-fg)]'
                        : 'bg-[var(--badge-down-bg)] text-[var(--badge-down-fg)]',
                    )}
                  >
                    {inbound ? '\u2193' : '\u2191'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--text-strong)]">
                      {t.player}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {inbound ? 'from' : 'to'} {stripFlag(other.name)}
                    </span>
                  </span>
                  <span className="numeric shrink-0 text-[11px] text-[var(--text-faint)]">
                    {t.date}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )

  return (
    <div className="page-enter">
      {/* ---------------- club banner ---------------- */}
      <section className="relative overflow-hidden border-b border-[var(--border)]">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 12% 0%, color-mix(in oklab, var(--accent) 26%, transparent) 0%, transparent 62%), var(--surface-2)',
          }}
        />
        <Container size="wide" className="relative py-8 lg:py-11">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
              <li>
                <Link to="/clubs" className="transition-colors hover:text-[var(--text)]">
                  Clubs
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-[var(--text-muted)]">{name}</li>
            </ol>
          </nav>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <SmartImage
              src={club.logoLocal}
              fallback={CLUB_PLACEHOLDER}
              alt={`${name} crest`}
              wrapperClassName="h-24 w-24 shrink-0 sm:h-28 sm:w-28"
              className="object-contain"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge tone={STATUS_TONE[club.status] ?? 'muted'}>
                  {club.status || 'Unregistered'}
                </Badge>
                {club.code && (
                  <span className="numeric text-xs tracking-[0.2em] text-[var(--text-faint)]">
                    {club.code}
                  </span>
                )}
              </div>
              <h1 className="mt-2.5 text-2xl font-extrabold leading-tight text-[var(--text-strong)] sm:text-4xl">
                {name}
              </h1>
              {data.standing && (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                  <span className="numeric">
                    <span className="font-bold text-[var(--accent-text)]">{data.standing.pos}</span> in
                    the table
                  </span>
                  <span aria-hidden className="text-[var(--border-strong)]">
                    |
                  </span>
                  <span className="numeric">
                    {data.standing.w}W {data.standing.d}D {data.standing.l}L
                  </span>
                  <FormGuide form={data.standing.form} />
                </p>
              )}
            </div>

            <ButtonLink to="/clubs" variant="outline" size="md" className="shrink-0 self-start sm:self-auto">
              All clubs
            </ButtonLink>
          </div>
        </Container>
      </section>

      {/* ---------------- main ---------------- */}
      <Section>
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
            {/* left: tabs */}
            <div className="min-w-0 order-2 lg:order-1">
              <div className="mb-6 border-b border-[var(--border)]">
                <Tabs
                  tabs={[
                    { id: 'overview', label: 'Overview' },
                    { id: 'squad', label: 'Squad', count: data.squad.starters.length + data.squad.bench.length },
                    { id: 'stats', label: 'Stats' },
                  ]}
                  active={tab}
                  onChange={setTab}
                  idPrefix="club"
                />
              </div>
              <div id={`club-panel-${tab}`} role="tabpanel" aria-labelledby={`club-${tab}`}>
                {tab === 'overview' ? overview : tab === 'squad' ? squadPanel : statsPanel}
              </div>
            </div>

            {/* right rail */}
            <div className="space-y-6 lg:order-2">
              <NextMatchCard next={data.next} last={data.last} href={lastHref} />

              <Card className="p-0">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                    Team form
                  </p>
                  <Link
                    to="/results"
                    className="text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
                  >
                    All results →
                  </Link>
                </div>
                <div className="p-4">
                  <TeamFormStrip matches={data.matches} club={club.name} />
                </div>
              </Card>

              {data.standing && (
                <Card className="p-0">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                      Table
                    </p>
                    <Link
                      to="/standings"
                      className="text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
                    >
                      Full table →
                    </Link>
                  </div>
                  <div className="p-5">
                    <TableSnippet rows={siteData.standings} highlight={name} />
                  </div>
                </Card>
              )}
            </div>
          </div>
        </Container>
      </Section>

      {/* ---------------- CTA ---------------- */}
      <Section tone="deep" className="!py-14">
        <Container size="narrow">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Questions about {name}? Reach the league at{' '}
              <a
                href={`mailto:${SITE.email}`}
                className="font-semibold text-[var(--accent-text)] hover:underline"
              >
                {SITE.email}
              </a>
              .
            </p>
            <ButtonLink to="/register" size="lg">
              Join {SITE.shortName}
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </div>
  )
}