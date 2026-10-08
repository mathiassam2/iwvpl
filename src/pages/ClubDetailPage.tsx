import { useMemo } from 'react'
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
} from '@/components/ui'
import { AVATAR_PLACEHOLDER } from '@/lib/format'
import { FormGuide, MatchRow, StatTile } from '@/components/league'
import { SITE, siteData } from '@/data'
import { CLUB_PLACEHOLDER, clubSlug, cx, stripFlag } from '@/lib/format'

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

  const club = useMemo(
    () => siteData.clubs.find((c) => clubSlug(stripFlag(c.name)) === clubSlug(slug)),
    [slug],
  )

  const data = useMemo(() => {
    if (!club) return null
    const standing = siteData.standings.find((s) => sameClub(s.team, club.name))
    const matches = siteData.results.filter(
      (m) => sameClub(m.home, club.name) || sameClub(m.away, club.name),
    )
    const transfers = siteData.transfers
      .filter((t) => sameClub(t.from.name, club.name) || sameClub(t.to.name, club.name))
      .slice(0, 8)
    const scorers = siteData.leaderboards
      .map((board) => ({
        board: board.title,
        rows: board.rows.filter((r) => sameClub(r.team, club.name)),
      }))
      .filter((g) => g.rows.length > 0)
    return { standing, matches, transfers, scorers }
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

  return (
    <>
      {/* ---------------- masthead ---------------- */}
      <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--surface-2)]">
        <div aria-hidden className="absolute inset-0 bg-grid opacity-50" />
        <Container size="wide" className="relative py-12 lg:py-16">
          <nav aria-label="Breadcrumb" className="mb-7">
            <ol className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
              <li>
                <Link to="/clubs" className="transition-colors hover:text-[var(--text)]">
                  Clubs
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-[var(--text-muted)]">{stripFlag(club.name)}</li>
            </ol>
          </nav>

          <div className="flex flex-col items-start gap-7 sm:flex-row sm:items-center">
            <SmartImage
              src={club.logoLocal}
              fallback={CLUB_PLACEHOLDER}
              alt={`${club.name} crest`}
              wrapperClassName="h-28 w-28 shrink-0 sm:h-32 sm:w-32"
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
              <h1 className="mt-3 text-3xl font-extrabold leading-tight text-[var(--text-strong)] sm:text-5xl">
                {stripFlag(club.name)}
              </h1>
              {data.standing && (
                <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
                  <span>
                    <span className="numeric font-bold text-[var(--accent-text)]">
                      {data.standing.pos}
                    </span>{' '}
                    in the table
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

            <div className="flex shrink-0 flex-wrap gap-2.5">
              <ButtonLink to="/register" size="md">
                Register a club
              </ButtonLink>
              {club.url && (
                <ButtonLink to={club.url} variant="outline" size="md">
                  View on iwvpl.asia
                </ButtonLink>
              )}
            </div>
          </div>
        </Container>
      </section>

      {/* ---------------- record ---------------- */}
      {data.standing && (
        <Section tone="raised">
          <Container size="wide">
            <SectionHead eyebrow="Season record" title="At a glance" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Position" value={data.standing.pos} />
              <StatTile label="Played" value={data.standing.pl} />
              <StatTile label="Won" value={data.standing.w} />
              <StatTile label="Goals for" value={data.standing.gf} />
              <StatTile label="Goals against" value={data.standing.ga} />
              <StatTile label="Points" value={data.standing.pts} />
            </div>
          </Container>
        </Section>
      )}

      {/* ---------------- matches ---------------- */}
      <Section>
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
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
                  {data.matches.slice(0, 8).map((m, i) => (
                    <MatchRow key={`${m.url}-${i}`} match={m} />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-10">
              {/* honours */}
              <div>
                <SectionHead eyebrow="Individual honours" title="Top scorers" />
                {data.scorers.length === 0 ? (
                  <EmptyState
                    title="No leaderboard entries"
                    hint="Nobody from this club appears on an individual board yet."
                  />
                ) : (
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
                )}
              </div>

              {/* transfers */}
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
                  <EmptyState
                    title="No recorded moves"
                    hint="Registered signings and releases appear here."
                  />
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
          </div>
        </Container>
      </Section>

      {/* ---------------- footer CTA ---------------- */}
      <Section tone="deep" className="!py-14">
        <Container size="narrow">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Questions about {stripFlag(club.name)}? Reach the league at{' '}
              <a
                href={`mailto:${SITE.email}`}
                className="font-semibold text-[var(--accent-text)] hover:underline"
              >
                {SITE.email}
              </a>
            </p>
            <ButtonLink to="/clubs" variant="outline">
              Back to all clubs
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  )
}
