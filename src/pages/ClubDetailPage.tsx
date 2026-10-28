import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Badge,
  Button,
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
import {
  getLiveClub,
  getLiveMatches,
  getLiveStandings,
  liveLeagueEnabled,
  peekLiveClub,
  peekLiveClubs,
  type LiveStandings,
} from '@/lib/liveLeague'
import type { Match, Standing } from '@/types/site'
import { buildSquadFromLineup } from '@/lib/fixtures'
import { useAuth } from '@/lib/auth'
import { RequestJoinClubModal } from '@/components/club/RequestJoinClubModal'
import { getPlayerJoinRequests, cancelJoinRequest, type JoinRequest } from '@/lib/api'
import { updateClubDescription } from '@/lib/api'


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
  const { user } = useAuth()
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [descInput, setDescInput] = useState('')
  const [descSaving, setDescSaving] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [myJoinRequests, setMyJoinRequests] = useState<JoinRequest[]>([])
  const [joinBusy, setJoinBusy] = useState(false)

  const loadMyJoinRequests = useCallback(async () => {
    if (!user) {
      setMyJoinRequests([])
      return
    }
    try {
      const data = await getPlayerJoinRequests()
      setMyJoinRequests(data.requests)
    } catch {
      setMyJoinRequests([])
    }
  }, [user])

  useEffect(() => {
    void loadMyJoinRequests()
  }, [loadMyJoinRequests])

  /**
   * Club identity, live, falling back to the crawl.
   *
   * Without this the page resolved the slug against `siteData.clubs` and an
   * approved club created through an account read "not found" — the row is in
   * the database, the crawl JSON is from before it existed. Only the identity
   * comes from the API; history below is still the crawl, which is empty for a
   * new club and correctly so.
   */
  const [liveClub, setLiveClub] = useState<Awaited<ReturnType<typeof getLiveClub>> | undefined>(
    () => (slug ? peekLiveClub(slug) : undefined),
  )
  const [liveStandings, setLiveStandings] = useState<LiveStandings | null>(null)
  const [liveMatches, setLiveMatches] = useState<Match[] | null>(null)

  useEffect(() => {
    if (!liveLeagueEnabled || !slug) return
    const controller = new AbortController()
    const cached = peekLiveClub(slug)
    if (cached) setLiveClub(cached)

    void (async () => {
      try {
        const [clubRes, standingsRes, matchesRes] = await Promise.allSettled([
          getLiveClub(slug, controller.signal),
          getLiveStandings(controller.signal),
          getLiveMatches(controller.signal, { clubSlug: slug, limit: 200 }),
        ])

        if (clubRes.status === 'fulfilled') {
          setLiveClub(clubRes.value)
        } else if (!cached) {
          setLiveClub(null)
        }

        if (standingsRes.status === 'fulfilled') {
          setLiveStandings(standingsRes.value)
        }

        if (matchesRes.status === 'fulfilled') {
          setLiveMatches(matchesRes.value.matches)
        }
      } catch {
        if (!cached) setLiveClub(null)
      }
    })()

    return () => controller.abort()
  }, [slug])

  const crawled = useMemo(() => {
    const target = clubSlug(slug)
    const fromLiveList = peekLiveClubs()?.find(
      (c) => (c.slug ? c.slug.toLowerCase() === slug.toLowerCase() : false) || clubSlug(stripFlag(c.name)) === target,
    )
    if (fromLiveList) return { ...fromLiveList, status: 'Active' as const }
    const found = siteData.clubs.find((c) => clubSlug(stripFlag(c.name)) === target)
    return found ? { ...found, status: 'Active' as const } : undefined
  }, [slug])

  const club = liveClub === undefined ? crawled : (liveClub ?? crawled)

  const data = useMemo(() => {
    if (!club) return null

    // Find live standing row and division table
    let liveStanding: Standing | undefined
    let divisionTable: Standing[] = []
    if (liveStandings) {
      for (const div of Object.values(liveStandings.divisions)) {
        const found = div.rows.find(
          (r) =>
            sameClub(r.team, club.name) ||
            clubSlug(stripFlag(r.team)) === clubSlug(stripFlag(slug)) ||
            (club.slug && clubSlug(stripFlag(r.team)) === clubSlug(stripFlag(club.slug))),
        )
        if (found) {
          liveStanding = found
          divisionTable = div.rows
          break
        }
      }
    }

    const crawlStanding = siteData.standings.find((s) => sameClub(s.team, club.name))
    const standing = liveStanding ?? crawlStanding

    // Matches
    let played: Match[]
    let next: Match | undefined
    let last: Match | undefined

    if (liveMatches !== null) {
      const sortedPlayed = liveMatches
        .filter((m) => (m.hs !== '' && m.as !== '') || m.status === 'finished')
        .sort((a, b) => {
          const dateA = a.rawDate || a.date
          const dateB = b.rawDate || b.date
          const cmp = dateB.localeCompare(dateA)
          if (cmp !== 0) return cmp
          return (b.id ?? 0) - (a.id ?? 0)
        })

      const sortedPending = liveMatches
        .filter((m) => m.status !== 'finished' && (m.hs === '' || m.as === ''))
        .sort((a, b) => {
          const dateA = a.rawDate || a.date
          const dateB = b.rawDate || b.date
          const cmp = dateA.localeCompare(dateB)
          if (cmp !== 0) return cmp
          return (a.id ?? 0) - (b.id ?? 0)
        })

      played = sortedPlayed
      next = sortedPending[0]
      last = sortedPlayed[0]
    } else {
      const all = siteData.results.filter(
        (m) => sameClub(m.home, club.name) || sameClub(m.away, club.name),
      )
      const crawlPlayed = all
        .filter((m) => m.hs !== '' && m.as !== '')
        .sort((a, b) => b.date.localeCompare(a.date))
      played = crawlPlayed
      next = all.find((m) => m.hs === '' || m.as === '')
      last = crawlPlayed[0]
    }

    const transfers = siteData.transfers
      .filter((t) => sameClub(t.from.name, club.name) || sameClub(t.to.name, club.name))
      .slice(0, 8)
    const scorers = siteData.leaderboards
      .map((board) => ({
        board: board.title,
        rows: board.rows.filter((r) => sameClub(r.team, club.name)),
      }))
      .filter((g) => g.rows.length > 0)
    const squad = buildSquadFromLineup(
      liveClub?.startingXi,
      liveClub?.managerName || 'Club Manager',
      liveClub?.roster,
    )
    return { standing, divisionTable, matches: played, next, last, transfers, scorers, squad }
  }, [club, liveClub, liveStandings, liveMatches, slug])

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
  const lastHref = data.last
    ? data.last.id != null
      ? `/matches/${data.last.id}`
      : matchIndexOf(data.last) >= 0
        ? `/matches/${matchIndexOf(data.last)}`
        : '/matches'
    : '/matches'

  const nextMatchTarget = data.next ?? data.last
  const nextMatchHref = nextMatchTarget
    ? nextMatchTarget.id != null
      ? `/matches/${nextMatchTarget.id}`
      : matchIndexOf(nextMatchTarget) >= 0
        ? `/matches/${matchIndexOf(nextMatchTarget)}`
        : '/matches'
    : '/matches'

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
            {data.squad ? data.squad.formation : 'No XI yet'}
          </span>
        </div>

        {data.squad ? (
          <>
            <div className="p-4 sm:p-5">
              <div className="mx-auto max-w-[30rem]">
                <Pitch squad={data.squad} home />
              </div>
            </div>

            <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-faint)]">
              Manager{' '}
              <span className="font-semibold text-[var(--text-muted)]">{data.squad.manager}</span>
              {' · '}
              <span className="text-[var(--text-faint)]">
                Official Starting XI ({data.squad.formation})
              </span>

            </p>
          </>
        ) : (
          <div className="p-5 sm:p-6">
            <EmptyState
              title="No starting XI set yet"
              hint="Once the club manager or league admin sets the Starting XI, the formation and jerseys appear here."

            />
          </div>
        )}
      </Card>

      {/* matches */}
      <div>
        <SectionHead
          eyebrow="Fixtures"
          title="Matches played"
          action={
            <ButtonLink to="/matches" variant="outline">
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

  /*
   * For a club the crawl does not know, the real roster is the one the API
   * returned. For a club it does know, the crawl's squad is used — it carries
   * shirt numbers and roles that the database has no columns for.
   */
  const squadPanel = !data.squad ? (
    <Card className="p-0">
      <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
        Squad · {liveClub?.roster.length ?? 0} signed
      </p>
      {liveClub && liveClub.roster.length > 0 ? (
        <ul className="divide-y divide-[var(--border)]">
          {liveClub.roster.map((p) => (
            <li key={p.name} className="flex items-center gap-3 px-5 py-2.5 text-sm text-[var(--text)]">
              <span className="numeric grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[11px] font-bold text-[var(--accent-text)]">
                {p.shirtNumber ?? '—'}
              </span>
              <span className="font-medium">{p.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-5">
          <EmptyState
            title="No players signed"
            hint="Players appear here once a manager signs them."
          />
        </div>
      )}
    </Card>
  ) : (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
            Starting XI · {data.squad.formation}
          </p>
          <ul className="divide-y divide-[var(--border)]">
            {data.squad.starters.map((p, idx) => (
              <li key={`${idx}-${p.role}`} className="flex items-center gap-3 px-5 py-2.5">
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
            Bench ({data.squad.bench.length})
          </p>
          {data.squad.bench.length === 0 ? (
            <p className="px-5 py-4 text-xs text-[var(--text-faint)]">No substitutes listed.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.squad.bench.map((p, idx) => (
                <li key={`${idx}-${p.name}`} className="flex items-center gap-3 px-5 py-2.5">
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
          )}
        </Card>
      </div>

      {liveClub && liveClub.roster.length > 0 && (
        <Card className="p-0">
          <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Full Signed Squad ({liveClub.roster.length})
          </p>
          <ul className="grid divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-y-0">
            {liveClub.roster.map((p) => (
              <li
                key={p.name}
                className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text)]"
              >
                <span className="numeric grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[11px] font-bold text-[var(--accent-text)]">
                  {p.shirtNumber ?? '—'}
                </span>
                <span className="truncate font-medium">{p.name}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
      {/* ---------------- club banner ----------------
          Pulled behind the fixed header exactly like PageHeader does. Without
          the negative margin the banner started below the bar, so the bar - which
          is deliberately bare at rest and only frosts on scroll or hover - had
          nothing to show through and read as a solid strip. */}
      <section className="band-wash relative -mt-16 overflow-hidden border-b border-[var(--border)] pt-16 lg:-mt-[72px] lg:pt-[72px]">
        <Container size="wide" className="relative pb-8 pt-2 lg:pb-11">
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
              {club.description && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
                  {club.description}
                </p>
              )}
              {user?.role === 'club_manager' && (user.clubSlug === slug || user.clubId === liveClub?.id) && (
                <div className="mt-2.5">
                  {!isEditingDesc ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDescInput(club.description ?? '')
                        setIsEditingDesc(true)
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-text)] transition-opacity hover:opacity-80"
                    >
                      <span>✏️</span> {club.description ? 'Edit club description' : 'Add club description'}
                    </button>
                  ) : (
                    <div className="mt-2 max-w-xl space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                      <textarea
                        className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] p-2.5 text-xs text-[var(--text-strong)] outline-none focus:border-[var(--accent-ring)]"
                        rows={3}
                        maxLength={1000}
                        placeholder="Add sub text / description for your club…"
                        value={descInput}
                        onChange={(e) => setDescInput(e.target.value)}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--text-faint)]">{descInput.length}/1000 characters</span>
                        <div className="flex items-center gap-2">
                          {club.description && (
                            <button
                              type="button"
                              disabled={descSaving}
                              onClick={async () => {
                                setDescSaving(true)
                                try {
                                  await updateClubDescription('')
                                  if (liveClub) setLiveClub({ ...liveClub, description: null })
                                  setIsEditingDesc(false)
                                } finally {
                                  setDescSaving(false)
                                }
                              }}
                              className="px-2 py-1 text-xs font-medium text-[var(--danger-text)] hover:underline"
                            >
                              Remove
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={descSaving}
                            onClick={() => setIsEditingDesc(false)}
                            className="px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={descSaving}
                            onClick={async () => {
                              setDescSaving(true)
                              try {
                                const trimmed = descInput.trim()
                                await updateClubDescription(trimmed)
                                if (liveClub) setLiveClub({ ...liveClub, description: trimmed || null })
                                setIsEditingDesc(false)
                              } finally {
                                setDescSaving(false)
                              }
                            }}
                            className="rounded-md bg-[var(--accent-solid)] px-3 py-1 text-xs font-bold text-[var(--on-volt)] hover:brightness-110"
                          >
                            {descSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
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

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-auto">
              {liveClub?.id && user?.clubId === liveClub.id ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Your Club
                </span>
              ) : liveClub?.id && myJoinRequests.some((r) => r.club_id === liveClub.id && r.status === 'pending') ? (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--accent-ring)] bg-[var(--accent-tint)] px-3 py-2 text-xs font-bold text-[var(--accent-text)]">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
                      <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Request Pending
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={joinBusy}
                    onClick={async () => {
                      const req = myJoinRequests.find((r) => r.club_id === liveClub.id && r.status === 'pending')
                      if (!req) return
                      setJoinBusy(true)
                      try {
                        await cancelJoinRequest(req.id)
                        await loadMyJoinRequests()
                      } finally {
                        setJoinBusy(false)
                      }
                    }}
                    className="text-xs text-[var(--text-muted)] hover:text-red-400"
                    title="Withdraw your join request"
                  >
                    Cancel
                  </Button>
                </div>
              ) : liveClub?.id ? (
                user ? (
                  <Button
                    size="md"
                    onClick={() => setShowJoinModal(true)}
                    className="gap-1.5 font-bold shadow-md"
                  >
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    Request to Join Club
                  </Button>
                ) : (
                  <ButtonLink to="/login" variant="outline" size="md">
                    Log in to Join
                  </ButtonLink>
                )
              ) : null}

              <ButtonLink to="/clubs" variant="outline" size="md">
                All clubs
              </ButtonLink>
            </div>
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
                    {
                      id: 'squad',
                      label: 'Squad',
                      count: data.squad
                        ? data.squad.starters.length + data.squad.bench.length
                        : (liveClub?.roster.length ?? 0),
                    },
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
              <NextMatchCard next={data.next} last={data.last} href={nextMatchHref} />

              <Card className="p-0">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                    Team form
                  </p>
                  <Link
                    to="/matches"
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
                    <TableSnippet rows={data.divisionTable.length > 0 ? data.divisionTable : siteData.standings} highlight={name} />
                  </div>
                </Card>
              )}
            </div>
          </div>
        </Container>
      </Section>

      {liveClub?.id && (
        <RequestJoinClubModal
          open={showJoinModal}
          onClose={() => setShowJoinModal(false)}
          club={{
            id: liveClub.id,
            name: liveClub.name,
            logo: liveClub.logoLocal || liveClub.logo || null,
            slug: liveClub.slug,
          }}
          onSuccess={() => {
            void loadMyJoinRequests()
          }}
        />
      )}

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