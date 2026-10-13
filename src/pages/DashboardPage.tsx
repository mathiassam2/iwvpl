/**
 * The signed-in dashboard.
 *
 * One route, two very different jobs. A manager is running a club; a player is
 * answering offers and deciding whether to stay. They share a page because
 * they share a header, and splitting it would mean two routes that differ only
 * by which panel loads.
 *
 * The route is guarded by redirect rather than by an error boundary: an
 * unsigned visitor has no account to show anything about, so the honest
 * response is to send them to sign in and come back.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, ButtonLink, Container, EmptyState, SmartImage } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import {
  cancelOffer,
  createClub,
  decideOffer,
  incomingOffers,
  leaveClub,
  managerOffers,
  playerOverview,
  searchPlayers,
  sendOffer,
  squad,
  type Offer,
} from '@/lib/api'
import { cx } from '@/lib/format'

/**
 * Panel.
 *
 * Dense on purpose. This is a workspace, not a marketing page: the admin app
 * sets the scale for anything an operator uses daily, and at the public
 * site's display sizes a squad list becomes one name per screen. Tighter
 * padding and the `default` container keep a whole club on one screen.
 */
const card = 'rounded-card border border-[var(--border-strong)] bg-[var(--surface)] p-4 sm:p-5'

/* Section headings inside a panel. Smaller than the public site's SectionHead,
   which is sized for a full-width section between hero bands. */
function PanelHead({ label, title, action }: { label: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
          {label}
        </p>
        <h2 className="mt-1 font-display text-lg font-bold leading-tight text-[var(--text-strong)]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  )
}

/** Body copy inside a panel. The public site's `text-[15px]`/relaxed sizing is
 *  paragraph scale; this is UI copy. */
const prose = 'text-[13px] leading-relaxed text-[var(--text-muted)]'
const field =
  'h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px] ' +
  'text-[var(--text-strong)] outline-none focus:border-[var(--accent-ring)]'

/** Shared error/notice line, so every panel reports failure the same way. */
function Notice({ kind, text }: { kind: 'ok' | 'error'; text: string | null }) {
  if (!text) return null
  return (
    <p
      role="status"
      className={cx(
        'rounded-lg px-4 py-3 text-sm',
        kind === 'ok'
          ? 'border border-[var(--accent-ring)] bg-[var(--accent-tint)] text-[var(--accent-text)]'
          : 'border border-[var(--danger-text)] bg-[var(--danger-text)]/10 text-[var(--danger-text)]',
      )}
    >
      {text}
    </p>
  )
}

const msg = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong.')

/* ================================================================ manager */

function ManagerPanel() {
  const { user, refresh } = useAuth()
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [clubName, setClubName] = useState('')
  const [myClub, setMyClub] = useState<{ id: number; name: string; slug: string } | null>(null)
  const [squadList, setSquadList] = useState<Awaited<ReturnType<typeof squad>>['squad']>([])
  const [offers, setOffers] = useState<Offer[]>([])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchPlayers>>['players']>([])
  const [searched, setSearched] = useState(false)


  const loadClub = useCallback(async () => {
    try {
      const data = await squad()
      setMyClub(data.club)
      setSquadList(data.squad)
    } catch {
      setMyClub(null)
      setSquadList([])
    }
  }, [])

  const loadOffers = useCallback(async () => {
    try {
      setOffers((await managerOffers()).offers)
    } catch {
      setOffers([])
    }
  }, [])

  useEffect(() => {
    void loadClub()
    void loadOffers()
  }, [loadClub, loadOffers])

  const onCreateClub = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await createClub(clubName.trim())
      setClubName('')
      setNotice({ kind: 'ok', text: 'Club created. An admin assigns it to a division before it can play.' })
      await Promise.all([loadClub(), refresh()])
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      setResults((await searchPlayers(query.trim())).players)
      setSearched(true)
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  /** Re-run the current search. The pending flag on each row is owned by the
   *  server, so it is re-read rather than patched locally. */
  const refreshResults = useCallback(async () => {
    try {
      setResults((await searchPlayers(query.trim())).players)
    } catch {
      /* the banner already reports failures; a stale list is harmless */
    }
  }, [query])


  const onOffer = async (playerId: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await sendOffer(playerId, null, null)
      setNotice({ kind: 'ok', text: 'Offer sent. They will see it in their notifications.' })
      await refreshResults()
      void loadOffers()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onCancel = async (id: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await cancelOffer(id)
      void loadOffers()
      await refreshResults()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const pending = offers.filter((o) => o.status === 'pending')
  const settled = offers.filter((o) => o.status !== 'pending')

  if (!user?.clubId) {
    return (
      <section className={card}>
        <PanelHead label="Your club" title="Create your club" />
        <p className="mb-4 ">
          A club is created active but sits outside every division until a league admin assigns
          it. It will not appear in the standings until then.
        </p>
        <form onSubmit={onCreateClub} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={clubName}
            onChange={(e) => setClubName(e.target.value)}
            placeholder="e.g. KITA KITA VFC"
            required
            maxLength={120}
            className={field}
          />
          <Button type="submit" disabled={busy || !clubName.trim()}>
            {busy ? 'Creating…' : 'Create club'}
          </Button>
        </form>
        <div className="mt-4">
          <Notice {...(notice ?? { kind: 'ok', text: null })} />
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-8">
      <Notice {...(notice ?? { kind: 'ok', text: null })} />

      {/* ---- approval status ---- */}
      {user.clubStatus === 'pending' && (
        <section className={card}>
          <PanelHead label="Approval" title="Waiting for league admin" />
          <p className={prose}>
            <strong className="text-[var(--text)]">{user.clubName}</strong> has been submitted and
            is waiting to be approved. It is not on the public site yet and cannot play fixtures
            until it is. You can carry on signing players below in the meantime — a squad can be
            built before the club is approved.
          </p>
        </section>
      )}

      {user.clubStatus === 'withdrawn' && (
        <section className={card}>
          <PanelHead label="Approval" title="Club not approved" />
          <p className={prose}>
            <strong className="text-[var(--text)]">{user.clubName}</strong> was not approved. Create
            another club from this dashboard if you want to apply again.
          </p>
        </section>
      )}

      {/* ---- squad ---- */}
      <section className={card}>
        <PanelHead label="Squad" title={myClub?.name ?? 'Your squad'} />
        {squadList.length === 0 ? (
          <EmptyState title="No players signed yet" hint="Search below to offer a contract." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {squadList.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <SmartImage
                  src={p.avatar_local || ''}
                  fallback=""
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg object-cover"
                />
                <Link
                  to={`/players/${p.slug}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-strong)] hover:text-[var(--accent-text)]"
                >
                  {p.gamertag}
                </Link>
                {p.pending > 0 && (
                  <span className="rounded-full bg-[var(--accent-tint)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                    Awaiting reply
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- sign ---- */}
      <section className={card}>
        <PanelHead label="Recruitment" title="Sign a player" />
        <p className="mb-4 ">
          Only players with an account can be offered to — an offer is a request for an answer, so
          it needs someone on the other end who can log in and give it.
        </p>

        <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by gamertag"
            maxLength={80}
            className={field}
          />
          <Button type="submit" variant="outline" disabled={busy}>
            Search
          </Button>
        </form>

        {searched && results.length > 0 && (
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {results.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/players/${p.slug}`}
                    className="block truncate text-sm font-semibold text-[var(--text-strong)] hover:text-[var(--accent-text)]"
                  >
                    {p.gamertag}
                  </Link>
                  <p className="truncate text-[12px] text-[var(--text-muted)]">
                    {p.club_name ?? 'Free agent'}
                  </p>
                </div>
                {p.pending_id ? (
                  <span className="text-[12px] font-semibold text-[var(--text-faint)]">Offered</span>
                ) : (
                  <Button size="sm" disabled={busy} onClick={() => void onOffer(p.id)}>
                    Offer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {searched && results.length === 0 && (
          <EmptyState
            title="No matching players"
            hint="Only players who have signed up themselves appear here."
          />
        )}
      </section>

      {/* ---- outbox ---- */}
      <section className={card}>
        <PanelHead label="Outbox" title="Your offers" />
        {offers.length === 0 ? (
          <EmptyState title="No offers yet" hint="Offers you send to players appear here." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pending.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-strong)]">
                    {o.gamertag}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)]">Waiting for a reply</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void onCancel(o.id)}
                >
                  Withdraw
                </Button>
              </li>
            ))}
            {settled.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3 opacity-60">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-strong)]">
                    {o.gamertag}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {o.status === 'accepted'
                      ? 'Signed'
                      : o.status === 'rejected'
                        ? 'Declined'
                        : 'Withdrawn'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ================================================================= player */

function PlayerPanel() {
  const { refresh } = useAuth()
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [club, setClub] = useState<{ id: number; name: string; slug: string } | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])

  const load = useCallback(async () => {
    try {
      const overview = await playerOverview()
      setClub(overview.club)
      setOffers((await incomingOffers()).offers)
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onDecide = async (id: number, decision: 'accept' | 'reject') => {
    setBusy(true)
    setNotice(null)
    try {
      await decideOffer(id, decision)
      setNotice({
        kind: 'ok',
        text: decision === 'accept' ? 'Signed. Welcome to your new club.' : 'Offer declined.',
      })
      await Promise.all([load(), refresh()])
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onLeave = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await leaveClub()
      setNotice({ kind: 'ok', text: 'You have left the club and are a free agent again.' })
      await Promise.all([load(), refresh()])
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <Notice {...(notice ?? { kind: 'ok', text: null })} />

      <section className={card}>
        <PanelHead label="Your status" title={club ? club.name : 'Free agent'} />
        <p className={prose}>
          {club ? (
            <>
              You are signed for {club.name}. Membership is not binding — you can leave whenever
              you like, and you will be a free agent again immediately.
            </>
          ) : (
            <>
              You are not signed to a club. Managers can find you in their recruitment search and
              send you an offer.
            </>
          )}
        </p>
        {club && (
          <div className="mt-4 flex flex-wrap gap-2.5">
            <ButtonLink to={`/clubs/${club.slug}`} variant="outline" size="sm">
              View club
            </ButtonLink>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void onLeave()}>
              Leave club
            </Button>
          </div>
        )}
      </section>

      <section className={card}>
        <PanelHead label="Inbox" title="Offers" />
        {offers.length === 0 ? (
          <EmptyState title="No offers waiting" hint="Offers from clubs land here." />
        ) : (
          <ul className="space-y-3">
            {offers.map((o) => (
              <li key={o.id} className="rounded-lg border border-[var(--border)] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text-strong)]">
                      {o.club_name}
                    </p>
                    <p className="text-[12px] text-[var(--text-faint)]">
                      {new Date(o.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {o.message && (
                  <p className={`mt-2 ${prose}`}>{o.message}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Button size="sm" disabled={busy} onClick={() => void onDecide(o.id, 'accept')}>
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onDecide(o.id, 'reject')}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* =================================================================== page */

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const sent = useRef(false)

  // Redirect only after the session has actually resolved, or a signed-in user
  // reloading /dashboard bounces to /login during the one frame where `user` is
  // still null.
  useEffect(() => {
    if (loading || user || sent.current) return
    sent.current = true
    navigate('/login', { replace: true })
  }, [loading, user, navigate])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-5 py-24 sm:px-6 lg:px-8">
        <div className="shimmer h-8 w-56 rounded-lg" />
      </div>
    )
  }

  if (!user) return null

  const isPlayer = user.role === 'player'

  return (
    <div className="page-enter">
      {/* Compact header, not PageHeader. That component is sized for a
          marketing page — a 3.5rem display heading and a lede paragraph — which
          on a screen you use daily is just furniture. A workspace opens with a
          line of text and gets out of the way. */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-end justify-between gap-4 px-5 pb-6 pt-24 sm:px-6 lg:px-8 lg:pt-28">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
            {isPlayer ? 'Player hub' : 'Club management'}
          </p>
          <h1 className="mt-1.5 font-display text-2xl font-bold leading-tight text-[var(--text-strong)] sm:text-3xl">
            {user.name}
          </h1>
        </div>
        <ButtonLink to="/" variant="outline" size="sm">
          Back to site
        </ButtonLink>
      </div>

      <Container size="default" className="pb-20">
        {isPlayer ? <PlayerPanel /> : <ManagerPanel />}
      </Container>
    </div>
  )
}