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

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { Pitch } from '@/components/club'
import { SignPlayerModal } from '@/components/manager/SignPlayerModal'
import { AccountSettingsModal } from '@/components/layout/AccountSettingsModal'
import { Button, ButtonLink, Container, EmptyState, SmartImage } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import {
  cancelOffer,
  createClub,
  createManagerSelfPlayer,
  decideOffer,
  incomingOffers,
  leaveClub,
  managerOffers,
  playerOverview,
  saveManagerLineup,
  squad,
  updateManagerClub,
  updateMyPlayerProfile,
  updateSquadPlayerShirt,
  releaseSquadPlayer,
  getMyOrders,
  getManagerJoinRequests,
  decideJoinRequest,
  getPlayerJoinRequests,
  cancelJoinRequest,
  getTransferWindowStatus,
  type JoinRequest,
  type UserOrder,
  type ManagerClub,

  type Offer,
} from '@/lib/api'
import {
  buildSquadFromLineup,
  FORMATIONS,
  type ClubLineup,
  type ClubLineupBench,
  type ClubLineupSlot,
} from '@/lib/fixtures'
import { AVATAR_PLACEHOLDER, CLUB_PLACEHOLDER, compressClubLogo, cx, stripFlag } from '@/lib/format'
import { getLiveMatches, invalidateLiveClubCache } from '@/lib/liveLeague'
import type { Match } from '@/types/site'

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

/* ===================================================== Transfer Window Banner */

function TransferWindowClosedBanner({ open }: { open: boolean }) {
  if (open) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5 text-xs text-amber-200">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-base">
          🔒
        </span>
        <div>
          <p className="font-extrabold uppercase tracking-wider text-amber-300">
            Transfer Window Closed
          </p>
          <p className="mt-0.5 text-[var(--text-muted)]">
            Player signings, contract offers, join requests, and squad releases are currently locked by league administration.
          </p>
        </div>
      </div>
      <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
        Roster Locked
      </span>
    </div>
  )
}

/* ===================================================== Club Fixture Calendar */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function parseKickoffDate(m: Match): Date | null {
  if (m.kickoff) {
    const d = new Date(m.kickoff.replace(' ', 'T'))
    if (!Number.isNaN(d.getTime())) return d
  }
  if (m.date) {
    const d = new Date(m.date)
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ClubFixtureCalendar({
  clubSlug,
  clubName,
}: {
  clubSlug?: string | null
  clubName?: string | null
}) {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(false)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null)
  const [listMode, setListMode] = useState<'upcoming' | 'results'>('upcoming')

  useEffect(() => {
    if (!clubSlug && !clubName) {
      setMatches([])
      return
    }
    const controller = new AbortController()
    setLoading(true)

    getLiveMatches(controller.signal, {
      clubSlug: clubSlug || undefined,
      limit: 200,
    })
      .then(({ matches: fetched }) => {
        let clubMatches = fetched
        if (clubName && (!clubSlug || clubMatches.length === 0)) {
          const target = stripFlag(clubName).toLowerCase().trim()
          clubMatches = fetched.filter(
            (m) =>
              stripFlag(m.home).toLowerCase().trim() === target ||
              stripFlag(m.away).toLowerCase().trim() === target,
          )
        }
        setMatches(clubMatches)

        // Auto-focus the calendar month to the next upcoming fixture (or most recent fixture)
        const dated = clubMatches
          .map((m) => ({ m, d: parseKickoffDate(m) }))
          .filter((x): x is { m: Match; d: Date } => x.d !== null)
          .sort((a, b) => a.d.getTime() - b.d.getTime())

        if (dated.length > 0) {
          const upcoming = dated.find((x) => x.m.hs === '' || x.m.as === '')
          const focusDate = upcoming ? upcoming.d : dated[dated.length - 1].d
          setViewYear(focusDate.getFullYear())
          setViewMonth(focusDate.getMonth())
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setMatches([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [clubSlug, clubName])

  const cleanMyClub = stripFlag(clubName || '').toLowerCase().trim()

  const matchesByYmd = useMemo(() => {
    const map = new Map<string, Match[]>()
    for (const m of matches) {
      const d = parseKickoffDate(m)
      if (!d) continue
      const key = toYmd(d)
      const list = map.get(key) ?? []
      list.push(m)
      map.set(key, list)
    }
    return map
  }, [matches])

  // Calendar cells for (viewYear, viewMonth) starting Monday
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const lastDay = new Date(viewYear, viewMonth + 1, 0)
    const startDow = (firstDay.getDay() + 6) % 7 // 0 = Mon, 6 = Sun
    const daysInMonth = lastDay.getDate()

    const cells: Array<{
      ymd: string
      day: number
      inMonth: boolean
      isToday: boolean
      fixtures: Match[]
    }> = []

    const todayYmd = toYmd(new Date())

    // Previous month trailing days
    const prevMonthLast = new Date(viewYear, viewMonth, 0).getDate()
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, prevMonthLast - i)
      const ymd = toYmd(d)
      cells.push({
        ymd,
        day: d.getDate(),
        inMonth: false,
        isToday: ymd === todayYmd,
        fixtures: matchesByYmd.get(ymd) ?? [],
      })
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewYear, viewMonth, day)
      const ymd = toYmd(d)
      cells.push({
        ymd,
        day,
        inMonth: true,
        isToday: ymd === todayYmd,
        fixtures: matchesByYmd.get(ymd) ?? [],
      })
    }

    // Next month leading days to complete 6 rows or end of week
    const remainder = (7 - (cells.length % 7)) % 7
    for (let day = 1; day <= remainder; day++) {
      const d = new Date(viewYear, viewMonth + 1, day)
      const ymd = toYmd(d)
      cells.push({
        ymd,
        day,
        inMonth: false,
        isToday: ymd === todayYmd,
        fixtures: matchesByYmd.get(ymd) ?? [],
      })
    }

    return cells
  }, [viewYear, viewMonth, matchesByYmd])

  const upcomingMatches = useMemo(
    () => matches.filter((m) => m.hs === '' || m.as === ''),
    [matches],
  )
  const completedMatches = useMemo(
    () => matches.filter((m) => m.hs !== '' && m.as !== '').slice().reverse(),
    [matches],
  )

  const prevMonth = () => {
    setSelectedYmd(null)
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    setSelectedYmd(null)
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const goToday = () => {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    setSelectedYmd(toYmd(now))
  }

  if (!clubSlug && !clubName) {
    return (
      <section className={card}>
        <PanelHead
          label="Schedule & Calendar"
          title="Fixture Calendar"
          action={
            <ButtonLink to="/matches" variant="outline" size="sm">
              All League Matches
            </ButtonLink>
          }
        />
        <EmptyState
          title="No Club Assigned Yet"
          hint="Join or create a club to see your personalised fixture calendar and upcoming kick-offs."
        />
      </section>
    )
  }

  const activeSideList = selectedYmd
    ? matchesByYmd.get(selectedYmd) ?? []
    : listMode === 'upcoming'
      ? upcomingMatches
      : completedMatches

  const getFixtureContext = (m: Match) => {
    const isHome = stripFlag(m.home).toLowerCase().trim() === cleanMyClub
    const opponent = isHome ? stripFlag(m.away) : stripFlag(m.home)
    const oppLogo = isHome ? m.awayLogo : m.homeLogo
    const played = m.hs !== '' && m.as !== ''
    let outcome: 'W' | 'D' | 'L' | null = null
    if (played) {
      const myScore = Number(isHome ? m.hs : m.as)
      const oppScore = Number(isHome ? m.as : m.hs)
      if (myScore > oppScore) outcome = 'W'
      else if (myScore < oppScore) outcome = 'L'
      else outcome = 'D'
    }
    return { isHome, opponent, oppLogo, played, outcome }
  }

  return (
    <section className={card}>
      <PanelHead
        label="Schedule & Calendar"
        title={`${stripFlag(clubName || 'Club')} Fixture Calendar`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-muted)]">
              {upcomingMatches.length} Upcoming · {completedMatches.length} Played
            </span>
            <ButtonLink to="/matches" variant="outline" size="sm">
              Full Schedule
            </ButtonLink>
          </div>
        }
      />

      {loading ? (
        <div className="py-10 text-center text-xs text-[var(--text-muted)]">
          Loading scheduled fixtures…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* LEFT (7 cols): Interactive Monthly Calendar Grid */}
          <div className="lg:col-span-7 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5 sm:p-4">
            {/* Month Header Controls */}
            <div className="mb-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-bold text-[var(--text-strong)] hover:bg-white/10"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-bold text-[var(--text-strong)] hover:bg-white/10"
                  aria-label="Next month"
                >
                  ›
                </button>
                <h3 className="ml-1 font-display text-sm font-extrabold tracking-wide text-[var(--text-strong)] sm:text-base">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </h3>
              </div>

              <div className="flex items-center gap-1.5">
                {selectedYmd && (
                  <button
                    type="button"
                    onClick={() => setSelectedYmd(null)}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-muted)] hover:text-white"
                  >
                    Show All
                  </button>
                )}
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent-text)] hover:bg-white/10"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 border-b border-[var(--border)] pb-2 text-center text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-faint)]">
              {WEEKDAYS.map((wd) => (
                <div key={wd}>{wd}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {calendarDays.map((cell) => {
                const hasMatch = cell.fixtures.length > 0
                const isSelected = selectedYmd === cell.ymd
                const firstFixture = cell.fixtures[0]
                const ctx = firstFixture ? getFixtureContext(firstFixture) : null

                return (
                  <button
                    key={cell.ymd}
                    type="button"
                    onClick={() => setSelectedYmd(isSelected ? null : cell.ymd)}
                    className={cx(
                      'group relative flex min-h-16 flex-col justify-between rounded-lg border p-1.5 text-left transition-all',
                      !cell.inMonth && 'opacity-35',
                      isSelected
                        ? 'border-[var(--accent-solid)] bg-[var(--accent-tint)] ring-1 ring-[var(--accent-solid)]'
                        : hasMatch
                          ? 'border-[var(--accent-ring)] bg-[var(--surface)] hover:border-[var(--accent-solid)]'
                          : 'border-white/5 bg-[var(--surface)]/40 hover:border-white/15',
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={cx(
                          'numeric text-[11px] font-bold',
                          cell.isToday
                            ? 'rounded bg-[var(--accent-solid)] px-1 text-[var(--on-volt)] font-extrabold'
                            : hasMatch
                              ? 'text-white'
                              : 'text-[var(--text-muted)]',
                        )}
                      >
                        {cell.day}
                      </span>
                      {ctx && (
                        <span
                          className={cx(
                            'rounded px-1 text-[9px] font-extrabold uppercase',
                            ctx.isHome
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-sky-500/20 text-sky-300',
                          )}
                        >
                          {ctx.isHome ? 'H' : 'A'}
                        </span>
                      )}
                    </div>

                    {ctx && firstFixture && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <img
                            src={ctx.oppLogo || CLUB_PLACEHOLDER}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.src = CLUB_PLACEHOLDER
                            }}
                            className="h-3.5 w-3.5 shrink-0 object-contain"
                          />
                          <span className="truncate text-[10px] font-bold text-[var(--text-strong)]">
                            {ctx.opponent}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          {ctx.played ? (
                            <span
                              className={cx(
                                'numeric rounded px-1 text-[9px] font-extrabold',
                                ctx.outcome === 'W'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : ctx.outcome === 'L'
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : 'bg-amber-500/20 text-amber-300',
                              )}
                            >
                              {ctx.outcome} {firstFixture.hs}-{firstFixture.as}
                            </span>
                          ) : (
                            <span className="numeric text-[9px] font-bold text-[var(--accent-text)]">
                              {firstFixture.time || 'TBC'}
                            </span>
                          )}
                          {cell.fixtures.length > 1 && (
                            <span className="text-[9px] font-extrabold text-[var(--text-faint)]">
                              +{cell.fixtures.length - 1}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* RIGHT (5 cols): Upcoming / Selected Day Fixture Cards */}
          <div className="lg:col-span-5 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
              {selectedYmd ? (
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent-text)]">
                    📅 Fixtures on {selectedYmd}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedYmd(null)}
                    className="text-[11px] font-bold text-[var(--text-muted)] hover:text-white"
                  >
                    ✕ Clear Day
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-lg bg-[var(--surface)] p-1 w-full">
                  <button
                    type="button"
                    onClick={() => setListMode('upcoming')}
                    className={cx(
                      'flex-1 rounded-md py-1.5 text-xs font-bold transition-colors',
                      listMode === 'upcoming'
                        ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                        : 'text-[var(--text-muted)] hover:text-white',
                    )}
                  >
                    Upcoming ({upcomingMatches.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setListMode('results')}
                    className={cx(
                      'flex-1 rounded-md py-1.5 text-xs font-bold transition-colors',
                      listMode === 'results'
                        ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                        : 'text-[var(--text-muted)] hover:text-white',
                    )}
                  >
                    Results ({completedMatches.length})
                  </button>
                </div>
              )}
            </div>

            {activeSideList.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                <p className="text-xs font-bold text-[var(--text-strong)]">
                  {selectedYmd
                    ? 'No fixtures scheduled on this date'
                    : listMode === 'upcoming'
                      ? 'No upcoming fixtures scheduled'
                      : 'No completed results yet'}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                  {selectedYmd
                    ? 'Click a highlighted date on the calendar or clear the day filter.'
                    : 'Once league admins publish fixtures for your division, they will appear here.'}
                </p>
              </div>
            ) : (
              <ul className="scroll-slim max-h-80 space-y-2.5 overflow-y-auto pr-1">
                {activeSideList.map((m, idx) => {
                  const ctx = getFixtureContext(m)
                  return (
                    <li key={m.id ?? idx}>
                      <Link
                        to={m.id ? `/matches/${m.id}` : '/matches'}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:border-[var(--accent-ring)]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <img
                            src={ctx.oppLogo || CLUB_PLACEHOLDER}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.src = CLUB_PLACEHOLDER
                            }}
                            className="h-9 w-9 shrink-0 object-contain"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cx(
                                  'rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase',
                                  ctx.isHome
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-sky-500/20 text-sky-300',
                                )}
                              >
                                {ctx.isHome ? 'HOME' : 'AWAY'}
                              </span>
                              {m.roundNumber && (
                                <span className="text-[10px] font-bold text-[var(--text-faint)]">
                                  Round {m.roundNumber}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs font-extrabold text-[var(--text-strong)]">
                              vs {ctx.opponent}
                            </p>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              {m.date || 'Date TBD'} · {m.time || 'Kick-off TBD'}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          {ctx.played ? (
                            <span
                              className={cx(
                                'numeric inline-block rounded-lg px-2.5 py-1 text-xs font-extrabold',
                                ctx.outcome === 'W'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : ctx.outcome === 'L'
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : 'bg-amber-500/20 text-amber-300',
                              )}
                            >
                              {ctx.outcome} · {m.hs}:{m.as}
                            </span>
                          ) : (
                            <span className="inline-block rounded-lg bg-[var(--accent-tint)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--accent-text)]">
                              Match →
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/* ================================================================ manager */

function ManagerPanel({ transferWindowOpen }: { transferWindowOpen: boolean }) {
  const { user, refresh } = useAuth()
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [clubName, setClubName] = useState('')
  const [clubShortCode, setClubShortCode] = useState('')
  const [clubLogoDraft, setClubLogoDraft] = useState<string | null>(null)
  const createLogoRef = useRef<HTMLInputElement | null>(null)
  const editLogoRef = useRef<HTMLInputElement | null>(null)

  const [myClub, setMyClub] = useState<ManagerClub | null>(null)
  const [editShortCode, setEditShortCode] = useState('')

  const [squadList, setSquadList] = useState<Awaited<ReturnType<typeof squad>>['squad']>([])
  const [squadPage, setSquadPage] = useState(1)
  const squadPageSize = 10
  const totalSquadPages = Math.max(1, Math.ceil(squadList.length / squadPageSize))
  const safeSquadPage = Math.min(squadPage, totalSquadPages)
  const pagedSquad = squadList.slice((safeSquadPage - 1) * squadPageSize, safeSquadPage * squadPageSize)
  const [offers, setOffers] = useState<Offer[]>([])

  // Starting XI state
  const [formation, setFormation] = useState<string>('4-3-3')
  const [starters, setStarters] = useState<Array<ClubLineupSlot | null>>(Array(11).fill(null))
  const [bench, setBench] = useState<ClubLineupBench[]>([])
  const [captainGamertag, setCaptainGamertag] = useState<string | null>(null)
  const [clubManagers, setClubManagers] = useState<
    Array<{ id: number; name: string; email?: string; gamertag?: string | null }>
  >([])
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null)
  const [slotSearch, setSlotSearch] = useState('')

  // Auto-save & Outside click state for Starting XI
  const pickerRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)
  const lastSavedPayloadRef = useRef<string>('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close player picker when clicking outside the popover (even outside the field)
  useEffect(() => {
    if (activeSlotIdx === null) return

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null
      if (pickerRef.current && pickerRef.current.contains(e.target as Node)) {
        return
      }
      if (target && target.closest('[data-pitch-slot]')) {
        return
      }
      setActiveSlotIdx(null)
      setSlotSearch('')
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveSlotIdx(null)
        setSlotSearch('')
      }
    }

    document.addEventListener('pointerdown', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeSlotIdx])

  const assignOrSwapSlot = (
    targetIdx: number,
    player: { id: number; gamertag: string; shirt_number?: number | null },
  ) => {
    const slots = (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots
    const targetCoord = slots[targetIdx]
    if (!targetCoord) return
    const targetPos = targetCoord[0]

    setStarters((prev) => {
      const next = [...prev]
      const currentInTarget = next[targetIdx]
      const existingIdx = next.findIndex(
        (s, i) => i !== targetIdx && s && s.gamertag.toLowerCase() === player.gamertag.toLowerCase(),
      )

      if (existingIdx !== -1) {
        const existingSlot = next[existingIdx]!
        const existingPos = slots[existingIdx]?.[0] ?? existingSlot.position
        const num = existingSlot.shirtNumber ?? existingSlot.number ?? player.shirt_number ?? targetIdx + 1
        next[targetIdx] = {
          position: targetPos,
          role: targetPos,
          playerId: player.id,
          gamertag: player.gamertag,
          shirtNumber: num,
          number: num,
        }
        next[existingIdx] = currentInTarget
          ? {
              ...currentInTarget,
              position: existingPos,
              role: existingPos,
            }
          : null
      } else {
        const num =
          currentInTarget?.shirtNumber ??
          currentInTarget?.number ??
          player.shirt_number ??
          targetIdx + 1
        next[targetIdx] = {
          position: targetPos,
          role: targetPos,
          playerId: player.id,
          gamertag: player.gamertag,
          shirtNumber: num,
          number: num,
        }
      }
      return next
    })

    setBench((prev) =>
      prev.filter((b) => b.gamertag.toLowerCase() !== player.gamertag.toLowerCase()),
    )
    setActiveSlotIdx(null)
    setSlotSearch('')
  }

  const [showSignModal, setShowSignModal] = useState(false)
  const squadPlayerIds = useMemo(() => new Set(squadList.map((p) => p.id)), [squadList])

  const initLineupState = useCallback(
    (clubData: ManagerClub | null, players: Awaited<ReturnType<typeof squad>>['squad']) => {
      const saved = clubData?.starting_xi
      const fmtKey = saved?.formation && FORMATIONS[saved.formation] ? saved.formation : '4-3-3'
      const slots = FORMATIONS[fmtKey].slots
      const initialCaptain =
        saved?.captainGamertag ??
        saved?.starters?.find((s) => s?.isCaptain)?.gamertag ??
        null
      setCaptainGamertag(initialCaptain)
      setFormation(fmtKey)
      setStarters(
        slots.map(([pos], idx) => {
          const s = saved?.starters?.[idx]
          if (s && s.gamertag) {
            const pMatch = players.find(
              (p) =>
                (s.playerId && p.id === s.playerId) ||
                p.gamertag.toLowerCase() === s.gamertag.toLowerCase(),
            )
            const num = pMatch?.shirt_number ?? s.shirtNumber ?? s.number ?? idx + 1
            const isCap = Boolean(
              s.isCaptain ||
              (initialCaptain && s.gamertag.toLowerCase() === initialCaptain.toLowerCase()),
            )
            return {
              position: pos,
              role: pos,
              playerId: s.playerId ?? pMatch?.id ?? null,
              gamertag: s.gamertag,
              shirtNumber: num,
              number: num,
              isCaptain: isCap,
            }
          }
          return null
        }),
      )
      const benchItems = Array.isArray(saved?.bench)
        ? saved.bench.map((b, idx) => {
            const pMatch = players.find(
              (p) =>
                (b.playerId && p.id === b.playerId) ||
                p.gamertag.toLowerCase() === b.gamertag.toLowerCase(),
            )
            const num = pMatch?.shirt_number ?? b.shirtNumber ?? b.number ?? 12 + idx
            return {
              playerId: b.playerId ?? pMatch?.id ?? null,
              gamertag: b.gamertag,
              shirtNumber: num,
              number: num,
              position: b.position || b.role || 'SUB',
              role: b.position || b.role || 'SUB',
            }
          })
        : []
      setBench(benchItems)

      // Initialize saved payload reference so initial load does not trigger auto-save
      lastSavedPayloadRef.current = JSON.stringify({
        formation: fmtKey,
        captainGamertag: initialCaptain,
        starters: slots.map(([pos], idx) => {
          const s = saved?.starters?.[idx]
          if (s && s.gamertag) {
            const pMatch = players.find(
              (p) =>
                (s.playerId && p.id === s.playerId) ||
                p.gamertag.toLowerCase() === s.gamertag.toLowerCase(),
            )
            const num = pMatch?.shirt_number ?? s.shirtNumber ?? s.number ?? idx + 1
            const isCap = Boolean(
              s.isCaptain ||
              (initialCaptain && s.gamertag.toLowerCase() === initialCaptain.toLowerCase()),
            )
            return {
              position: pos,
              role: pos,
              playerId: s.playerId ?? pMatch?.id ?? null,
              gamertag: s.gamertag,
              shirtNumber: num,
              number: num,
              isCaptain: isCap,
            }
          }
          return null
        }),
        bench: benchItems,
      })
      isInitializedRef.current = true
    },
    [],
  )

  const loadClub = useCallback(async () => {
    try {
      const data = await squad()
      setMyClub(data.club)
      setEditShortCode(data.club.short_code ?? '')
      setSquadList(data.squad)
      if (Array.isArray((data as any).managers)) {
        setClubManagers((data as any).managers)
      }
      initLineupState(data.club, data.squad)
    } catch {
      setMyClub(null)
      setSquadList([])
    }
  }, [initLineupState])

  // Auto-save every action in starting XI and bench
  useEffect(() => {
    if (!myClub || !isInitializedRef.current) return

    const currentPayload: ClubLineup = {
      formation,
      captainGamertag,
      starters: starters.map((s) =>
        s
          ? {
              ...s,
              isCaptain: Boolean(
                captainGamertag &&
                  s.gamertag.toLowerCase() === captainGamertag.toLowerCase(),
              ),
            }
          : null,
      ),
      bench,
    }
    const currentJson = JSON.stringify(currentPayload)

    // Skip if nothing changed from last saved state
    if (lastSavedPayloadRef.current === currentJson) {
      return
    }

    setSaveStatus('saving')
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveManagerLineup(currentPayload)
        lastSavedPayloadRef.current = currentJson
        setSaveStatus('saved')
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev))
        }, 2200)
      } catch (err) {
        setSaveStatus('error')
      }
    }, 400)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [formation, starters, bench, captainGamertag, myClub])

  const loadOffers = useCallback(async () => {
    try {
      setOffers((await managerOffers()).offers)
    } catch {
      setOffers([])
    }
  }, [])

  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])

  const loadJoinRequests = useCallback(async () => {
    try {
      const data = await getManagerJoinRequests()
      setJoinRequests(data.requests)
    } catch {
      setJoinRequests([])
    }
  }, [])

  useEffect(() => {
    void loadClub()
    void loadOffers()
    void loadJoinRequests()
  }, [loadClub, loadOffers, loadJoinRequests])

  const handleDecideJoinRequest = async (id: number, decision: 'accept' | 'reject') => {
    setBusy(true)
    setNotice(null)
    try {
      await decideJoinRequest(id, decision)
      setNotice({
        kind: 'ok',
        text: decision === 'accept' ? 'Player accepted and added to your squad!' : 'Join request declined.',
      })
      await Promise.all([loadClub(), loadJoinRequests()])
      await refresh()
    } catch (err: unknown) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const [showClaimSelf, setShowClaimSelf] = useState(false)
  const [selfGamertag, setSelfGamertag] = useState(user?.gamertag || user?.name || '')
  const [selfShirtNumber, setSelfShirtNumber] = useState('')
  const [selfBusy, setSelfBusy] = useState(false)

  const isManagerInSquad = squadList.some(
    (p) =>
      (user?.playerId && p.id === user.playerId) ||
      (user?.id && p.user_id === user.id) ||
      Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()),
  )

  const handleReleasePlayer = async (p: { id: number; gamertag: string; user_id?: number | null }) => {
    const isSelf =
      (user?.playerId && p.id === user.playerId) ||
      (user?.id && p.user_id === user.id) ||
      Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase())
    const confirmMsg = isSelf
      ? 'Are you sure you want to step down from the squad as Playing Captain? You will become a free agent.'
      : `Are you sure you want to release ${p.gamertag} from your squad? They will become a free agent.`
    if (!window.confirm(confirmMsg)) return

    setBusy(true)
    setNotice(null)
    try {
      await releaseSquadPlayer(p.id)
      setNotice({
        kind: 'ok',
        text: isSelf
          ? 'You have stepped down from the squad and are now a free agent.'
          : `${p.gamertag} has been released and is now a free agent.`,
      })
      await loadClub()
      await refresh()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleClaimSelfPlayer = async (e: FormEvent) => {
    e.preventDefault()
    const cleanTag = selfGamertag.trim()
    if (!cleanTag) return
    setSelfBusy(true)
    try {
      const shirt = selfShirtNumber.trim() ? Number.parseInt(selfShirtNumber.trim(), 10) : undefined
      await createManagerSelfPlayer({
        gamertag: cleanTag,
        shirtNumber: shirt,
      })
      setNotice({
        kind: 'ok',
        text: `You've joined ${myClub?.name || 'the squad'} as Playing Captain! You can now place yourself in the Starting XI.`,
      })
      setShowClaimSelf(false)
      await loadClub()
      await refresh()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setSelfBusy(false)
    }
  }

  const onCreateLogoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressClubLogo(file)
      setClubLogoDraft(dataUrl)
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not read image.' })
    }
  }

  const onUpdateClubLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setNotice(null)
    try {
      const dataUrl = await compressClubLogo(file)
      const res = await updateManagerClub({ logo: dataUrl })
      setMyClub(res.club)
      setNotice({ kind: 'ok', text: 'Club logo updated.' })
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onRemoveClubLogo = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await updateManagerClub({ logo: null })
      setMyClub(res.club)
      setNotice({ kind: 'ok', text: 'Club logo removed.' })
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onSaveShortCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const res = await updateManagerClub({ shortCode: editShortCode.trim() || null })
      setMyClub(res.club)
      setEditShortCode(res.club.short_code ?? '')
      setNotice({ kind: 'ok', text: 'Club short code saved.' })
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onCreateClub = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await createClub(clubName.trim(), {
        shortCode: clubShortCode.trim() || undefined,
        logo: clubLogoDraft,
      })
      setClubName('')
      setClubShortCode('')
      setClubLogoDraft(null)
      setNotice({ kind: 'ok', text: 'Club created. An admin assigns it to a division before it can play.' })
      await Promise.all([loadClub(), refresh()])
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
        <form onSubmit={onCreateClub} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder="Enter your club name"
              required
              maxLength={120}
              className={field}
            />
            <input
              value={clubShortCode}
              onChange={(e) => setClubShortCode(e.target.value.toUpperCase())}
              placeholder="Short code (optional)"
              maxLength={8}
              className={cx(field, 'sm:w-48 uppercase')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <img
              src={clubLogoDraft || CLUB_PLACEHOLDER}
              alt="Club crest preview"
              className="h-12 w-12 rounded-lg border border-[var(--border)] object-contain p-1"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--text-strong)]">
                {clubLogoDraft ? 'Club logo ready' : 'Upload club logo (optional)'}
              </p>
              <p className="text-[11px] text-[var(--text-faint)]">
                PNG, JPG, WebP or SVG crest image
              </p>
            </div>
            <input
              ref={createLogoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => void onCreateLogoPick(e)}
              className="hidden"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => createLogoRef.current?.click()}
            >
              {clubLogoDraft ? 'Change logo' : 'Upload logo'}
            </Button>
            {clubLogoDraft && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setClubLogoDraft(null)}
              >
                Remove
              </Button>
            )}
          </div>

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
      <TransferWindowClosedBanner open={transferWindowOpen} />

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

      {/* ---- club identity & logo ---- */}
      <section className={card}>
        <PanelHead
          label="Club identity"
          title={myClub?.name ?? user.clubName ?? 'Your club'}
          action={
            myClub?.slug && user.clubStatus === 'active' ? (
              <ButtonLink to={`/clubs/${myClub.slug}`} variant="outline" size="sm">
                Public page
              </ButtonLink>
            ) : undefined
          }
        />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] p-1.5">
              <img
                src={myClub?.logo_local || myClub?.logo_url || CLUB_PLACEHOLDER}
                alt={myClub?.name || 'Club logo'}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text-strong)]">Club crest / logo</p>
              <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                Shown on standings tables, fixtures, and your club profile.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <input
                  ref={editLogoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => void onUpdateClubLogo(e)}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => editLogoRef.current?.click()}
                >
                  {myClub?.logo_local || myClub?.logo_url ? 'Change logo' : 'Upload logo'}
                </Button>
                {(myClub?.logo_local || myClub?.logo_url) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onRemoveClubLogo()}
                  >
                    Remove logo
                  </Button>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={onSaveShortCode} className="flex items-end gap-2 sm:ml-auto">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Short code
              </label>
              <input
                value={editShortCode}
                onChange={(e) => setEditShortCode(e.target.value.toUpperCase())}
                placeholder="3-letter code"
                maxLength={8}
                className={cx(field, 'w-36 uppercase')}
              />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={busy}>
              Save
            </Button>
          </form>
        </div>
      </section>

      {/* ---- club fixture calendar ---- */}
      <ClubFixtureCalendar
        clubSlug={myClub?.slug}
        clubName={myClub?.name ?? user.clubName}
      />

      {/* ---- starting xi & lineup ---- */}
      <section className={card}>
        <PanelHead
          label="Lineup & formation"
          title="Starting XI & Bench"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={formation}
                onChange={(e) => {
                  const nextFmt = e.target.value
                  const slots = (FORMATIONS[nextFmt] || FORMATIONS['4-3-3']).slots
                  setFormation(nextFmt)
                  setStarters((prev) =>
                    slots.map(([pos], idx) =>
                      prev[idx] ? { ...prev[idx]!, position: pos, role: pos } : null,
                    ),
                  )
                }}
                className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-xs font-bold text-[var(--text-strong)]"
              >
                {Object.keys(FORMATIONS).map((fmt) => (
                  <option key={fmt} value={fmt} className="bg-[#12151a] text-white">
                    Formation: {fmt}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || squadList.length === 0}
                onClick={() => {
                  const slots = (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots
                  setStarters(
                    slots.map(([pos], idx) => {
                      const p = squadList[idx]
                      if (!p) return null
                      const num = p.shirt_number ?? idx + 1
                      return {
                        position: pos,
                        role: pos,
                        playerId: p.id,
                        gamertag: p.gamertag,
                        shirtNumber: num,
                        number: num,
                      }
                    }),
                  )
                  setBench(
                    squadList.slice(11).map((p, idx) => ({
                      playerId: p.id,
                      gamertag: p.gamertag,
                      shirtNumber: p.shirt_number ?? 12 + idx,
                      number: p.shirt_number ?? 12 + idx,
                      position: 'SUB',
                      role: 'SUB',
                    })),
                  )
                }}
              >
                Auto-fill from squad
              </Button>
              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-bold text-amber-400">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving…
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-400">
                  <span>✓</span> Auto-saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 text-xs font-bold text-rose-400">
                  <span>⚠</span> Save failed
                </span>
              )}
            </div>
          }
        />

        <div className="space-y-6">
          <div className="mx-auto w-full max-w-[520px]">
            <Pitch
              home
              squad={
                buildSquadFromLineup(
                  {
                    formation,
                    captainGamertag,
                    starters: starters.map((s) =>
                      s
                        ? {
                            ...s,
                            isCaptain: Boolean(
                              captainGamertag &&
                                s.gamertag.toLowerCase() === captainGamertag.toLowerCase(),
                            ),
                          }
                        : null,
                    ),
                    bench,
                  },
                  user?.name,
                ) ?? {
                  formation,
                  manager: user?.name || 'Club Manager',
                  starters: (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots.map(
                    ([role, x, y], idx) => ({
                      number: idx + 1,
                      name: 'Unassigned',
                      role,
                      x,
                      y,
                    }),
                  ),
                  bench: [],
                }
              }
              activeSlotIndex={activeSlotIdx}
              onSelectSlot={(idx) => {
                if (activeSlotIdx === idx) {
                  setActiveSlotIdx(null)
                  setSlotSearch('')
                } else {
                  setActiveSlotIdx(idx)
                  setSlotSearch('')
                }
              }}
            >
              {activeSlotIdx !== null && (
                <>
                  <div
                    className="fixed inset-0 z-[20] bg-black/35 cursor-default transition-opacity"
                    onClick={() => {
                      setActiveSlotIdx(null)
                      setSlotSearch('')
                    }}
                  />
                  {(() => {
                    const slots = (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots
                    const activeCoord = slots[activeSlotIdx]
                    if (!activeCoord) return null
                    const [pos, x, y] = activeCoord
                    const currentSlot = starters[activeSlotIdx]
                    const q = slotSearch.trim().toLowerCase()
                    const filtered = squadList.filter((p) =>
                      q ? p.gamertag.toLowerCase().includes(q) : true,
                    )
                    const openAbove = y > 54

                    return (
                      <div
                        ref={pickerRef}
                        className="absolute z-[30] w-[min(296px,calc(100%-16px))] -translate-x-1/2 overflow-hidden rounded-xl border border-[#c8ff3d]/45 bg-[#0c1014]/95 shadow-[0_20px_44px_rgba(0,0,0,0.8)] backdrop-blur-md"
                        style={{
                          left: `clamp(156px, ${x}%, calc(100% - 156px))`,
                          ...(openAbove
                            ? { bottom: `${Math.max(6, 100 - y + 7)}%` }
                            : { top: `${Math.min(62, y + 7)}%` }),
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="shrink-0 rounded bg-[#c8ff3d] px-1.5 py-0.5 font-mono text-[10.5px] font-black text-[#0b0f05]">
                              {pos}
                            </span>
                            <strong className="truncate text-xs font-bold text-white">
                              {currentSlot ? currentSlot.gamertag : 'Empty Position'}
                            </strong>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {currentSlot && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCaptainGamertag((prev) =>
                                      prev && prev.toLowerCase() === currentSlot.gamertag.toLowerCase()
                                        ? null
                                        : currentSlot.gamertag,
                                    )
                                  }}
                                  className={cx(
                                    'h-6 rounded px-2 text-[10.5px] font-bold transition flex items-center gap-1',
                                    captainGamertag && captainGamertag.toLowerCase() === currentSlot.gamertag.toLowerCase()
                                      ? 'bg-amber-400 text-black font-extrabold shadow-sm'
                                      : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white',
                                  )}
                                  title={
                                    captainGamertag && captainGamertag.toLowerCase() === currentSlot.gamertag.toLowerCase()
                                      ? 'Remove Captain'
                                      : 'Set as Captain'
                                  }
                                >
                                  <span>©</span>
                                  <span>Captain</span>
                                </button>
                                <label
                                  className="inline-flex h-6 items-center gap-0.5 rounded border border-white/20 bg-black/50 px-1.5 font-mono text-[11px] font-extrabold text-[#c8ff3d]"
                                  title="Jersey Number (1–99)"
                                >
                                  <span>#</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    value={currentSlot.shirtNumber ?? currentSlot.number ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value ? Number(e.target.value) : null
                                      if (val != null && val >= 1 && val <= 99) {
                                        setStarters((prev) => {
                                          const next = [...prev]
                                          if (next[activeSlotIdx]) {
                                            next[activeSlotIdx] = {
                                              ...next[activeSlotIdx]!,
                                              shirtNumber: val,
                                              number: val,
                                            }
                                          }
                                          return next
                                        })
                                      }
                                    }}
                                    className="w-7 bg-transparent text-center font-mono text-[11px] font-extrabold text-white outline-none"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      captainGamertag &&
                                      currentSlot.gamertag.toLowerCase() === captainGamertag.toLowerCase()
                                    ) {
                                      setCaptainGamertag(null)
                                    }
                                    setStarters((prev) => {
                                      const next = [...prev]
                                      next[activeSlotIdx] = null
                                      return next
                                    })
                                  }}
                                  className="h-6 rounded border border-red-400/35 bg-red-500/15 px-2 text-[10px] font-bold text-red-300 hover:bg-red-500/25 hover:text-white"
                                >
                                  Clear
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSlotIdx(null)
                                setSlotSearch('')
                              }}
                              className="grid h-6 w-6 place-items-center rounded bg-white/10 text-sm text-white/75 hover:bg-white/20 hover:text-white"
                              aria-label="Close picker"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* Search input */}
                        <div className="border-b border-white/10 p-2">
                          <input
                            type="search"
                            autoFocus
                            value={slotSearch}
                            onChange={(e) => setSlotSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setActiveSlotIdx(null)
                                setSlotSearch('')
                              } else if (e.key === 'Enter' && filtered.length > 0) {
                                e.preventDefault()
                                assignOrSwapSlot(activeSlotIdx, filtered[0])
                              }
                            }}
                            placeholder="Search squad player…"
                            className="h-8 w-full rounded-lg border border-white/20 bg-black/55 px-2.5 text-xs text-white placeholder:text-white/45 focus:border-[#c8ff3d] focus:outline-none"
                          />
                        </div>

                        {/* Player list */}
                        <div className="max-h-44 space-y-1 overflow-y-auto p-1.5">
                          {filtered.length === 0 ? (
                            <p className="px-2 py-3 text-center text-[11px] text-white/60">
                              {squadList.length === 0
                                ? 'No signed squad players yet. Sign players below first.'
                                : 'No squad players match your search.'}
                            </p>
                          ) : (
                            filtered.map((p, pIdx) => {
                              const isCurrent =
                                currentSlot?.gamertag.toLowerCase() === p.gamertag.toLowerCase()
                              const otherIdx = starters.findIndex(
                                (s, idx) =>
                                  idx !== activeSlotIdx &&
                                  s &&
                                  s.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                              )
                              const otherPos = otherIdx !== -1 ? slots[otherIdx]?.[0] : null
                              const isOnBench = bench.some(
                                (b) => b.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                              )
                              const displayNum =
                                (isCurrent
                                  ? currentSlot?.shirtNumber ?? currentSlot?.number
                                  : null) ??
                                (otherIdx !== -1
                                  ? starters[otherIdx]?.shirtNumber ?? starters[otherIdx]?.number
                                  : null) ??
                                p.shirt_number ??
                                pIdx + 1

                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => assignOrSwapSlot(activeSlotIdx, p)}
                                  className={cx(
                                    'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition',
                                    isCurrent
                                      ? 'border-[#c8ff3d]/45 bg-[#c8ff3d]/15 text-white'
                                      : 'border-transparent text-white hover:border-white/15 hover:bg-white/10',
                                  )}
                                >
                                  <span className="min-w-[28px] rounded bg-white/10 px-1.5 py-0.5 text-center font-mono text-[10.5px] font-extrabold text-[#c8ff3d]">
                                    #{displayNum}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-semibold">
                                    {p.gamertag}
                                  </span>
                                  {isCurrent ? (
                                    <span className="rounded bg-[#c8ff3d] px-1.5 py-0.5 text-[10px] font-bold text-[#0b0f05]">
                                      ✓ Current
                                    </span>
                                  ) : otherPos ? (
                                    <span className="rounded border border-sky-400/35 bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                                      ⇄ Swap {otherPos}
                                    </span>
                                  ) : isOnBench ? (
                                    <span className="rounded border border-amber-400/35 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                      ↑ From Bench
                                    </span>
                                  ) : (
                                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/75">
                                      Assign
                                    </span>
                                  )}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}
            </Pitch>
            <p className="mt-2.5 text-center text-xs leading-relaxed text-[var(--text-faint)]">
              Click any jersey on the pitch to open the smart player dropdown — search your squad,
              swap positions, or edit jersey numbers directly on the field. All changes auto-save.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 items-stretch">
            {/* Bench / Substitutes */}
            <div className="flex flex-col h-[360px] rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5">
              <div className="mb-2.5 flex items-center justify-between shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                  Bench / Substitutes ({bench.length})
                </p>
                <select
                  value=""
                  onChange={(e) => {
                    const tag = e.target.value
                    if (!tag) return
                    const p = squadList.find((sp) => sp.gamertag === tag)
                    if (!p) return
                    if (bench.some((b) => b.gamertag.toLowerCase() === tag.toLowerCase())) return
                    setBench((prev) => [
                      ...prev,
                      {
                        playerId: p.id,
                        gamertag: p.gamertag,
                        shirtNumber: p.shirt_number ?? 12 + prev.length,
                        position: 'SUB',
                      },
                    ])
                  }}
                  className="h-7 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[11px] font-semibold text-[var(--text-strong)]"
                >
                  <option value="" className="bg-[#12151a] text-white">+ Add Substitute…</option>
                  {squadList.map((p) => (
                    <option key={p.id} value={p.gamertag} className="bg-[#12151a] text-white">
                      {p.gamertag}
                    </option>
                  ))}
                </select>
              </div>
              {bench.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-4">
                  <p className="text-xs text-[var(--text-faint)]">No substitutes added yet.</p>
                </div>
              ) : (
                <ul className="scroll-slim flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {bench.map((b, bIdx) => (
                    <li
                      key={`${b.gamertag}-${bIdx}`}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs"
                    >
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={b.shirtNumber ?? ''}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setBench((prev) =>
                            prev.map((item, i) =>
                              i === bIdx && n >= 1 && n <= 99 ? { ...item, shirtNumber: n } : item,
                            ),
                          )
                        }}
                        className="h-7 w-12 rounded border border-[var(--border-strong)] bg-[var(--bg)] px-1 text-center font-mono text-xs font-bold text-[var(--text-strong)]"
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-strong)]">
                        {b.gamertag}
                      </span>
                      <button
                        type="button"
                        onClick={() => setBench((prev) => prev.filter((_, i) => i !== bIdx))}
                        className="text-xs font-bold text-[var(--danger-text)] hover:underline"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Signed Squad Lineup Status */}
            <div className="flex flex-col h-[360px] rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5">
              <div className="mb-2.5 flex items-center justify-between shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                  Squad Lineup Status ({starters.filter(Boolean).length} / 11 Starters)
                </p>
                {starters.some(Boolean) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStarters(Array(11).fill(null))
                      setBench([])
                      setCaptainGamertag(null)
                    }}
                    className="text-[11px] font-semibold text-[var(--text-faint)] hover:text-[var(--text-strong)]"
                  >
                    Clear Pitch
                  </button>
                )}
              </div>
              {squadList.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-4 text-center">
                  <p className="text-xs text-[var(--text-faint)]">
                    Sign players to your squad below to place them on the pitch.
                  </p>
                </div>
              ) : (
                <ul className="scroll-slim flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {squadList.map((p, idx) => {
                    const starterIdx = starters.findIndex(
                      (s) => s && s.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                    )
                    const starterPos =
                      starterIdx !== -1
                        ? (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots[starterIdx]?.[0]
                        : null
                    const isSub = bench.some(
                      (b) => b.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                    )
                    const isMgr =
                      (user?.playerId === p.id || user?.id === p.user_id) ||
                      Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()) ||
                      clubManagers.some((m) =>
                        m.id === p.user_id ||
                        (m.gamertag && m.gamertag.toLowerCase() === p.gamertag.toLowerCase()) ||
                        (m.name && m.name.toLowerCase() === p.gamertag.toLowerCase())
                      )
                    const isCap = Boolean(captainGamertag && p.gamertag.toLowerCase() === captainGamertag.toLowerCase())

                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs"
                      >
                        <span className="rounded bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-[var(--text-muted)]">
                          #{p.shirt_number ?? idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-strong)] flex items-center gap-1.5">
                          {p.gamertag}
                          {isMgr && (
                            <span className="rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 px-1 py-0.2 text-[9px] font-bold shrink-0">
                              MGR
                            </span>
                          )}
                        </span>
                        {starterPos ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setCaptainGamertag((prev) =>
                                  prev && prev.toLowerCase() === p.gamertag.toLowerCase()
                                    ? null
                                    : p.gamertag,
                                )
                              }}
                              className={cx(
                                'rounded px-1.5 py-0.5 font-mono text-[10px] font-extrabold transition-colors flex items-center gap-0.5',
                                isCap
                                  ? 'bg-amber-400 text-black border border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                                  : 'bg-[var(--surface-2)] text-[var(--text-faint)] hover:text-amber-400 hover:bg-amber-500/10 border border-transparent',
                              )}
                              title={
                                isCap
                                  ? 'Team Captain (Click to remove captaincy)'
                                  : 'Make Team Captain (C)'
                              }
                            >
                              <span>©</span>
                              <span>{isCap ? 'CAP' : ''}</span>
                            </button>
                            <span className="rounded bg-[var(--accent-tint)] px-2 py-0.5 font-mono text-[10px] font-extrabold text-[var(--accent-text)]">
                              XI: {starterPos}
                            </span>
                          </div>
                        ) : isSub ? (
                          <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                            SUB
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-faint)]">Reserve</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

      </section>

      {/* ---- join requests ---- */}
      {(() => {
        const pendingCount = joinRequests.filter((r) => r.status === 'pending').length
        return (
          <section className={card}>
            <PanelHead
              label="Applications"
              title={pendingCount > 0 ? `Join Requests (${pendingCount} Pending)` : 'Join Requests'}
            />
            {joinRequests.length === 0 ? (
              <EmptyState
                title="No join requests yet"
                hint="When players request to join your club, their applications will appear here."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {joinRequests.map((req) => (
                  <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <SmartImage
                        src={req.avatar_local || AVATAR_PLACEHOLDER}
                        fallback={AVATAR_PLACEHOLDER}
                        alt=""
                        wrapperClassName="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-[var(--surface-hover)] border border-[var(--border)]"
                        className="h-full w-full object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/players/${req.slug}`}
                            target="_blank"
                            className="truncate text-sm font-bold text-[var(--text-strong)] hover:text-[var(--accent-text)]"
                          >
                            {req.gamertag}
                          </Link>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {req.current_club_name ? `From ${req.current_club_name}` : 'Free Agent'}
                          </span>
                        </div>
                        {req.message && (
                          <p className="mt-1 text-xs italic text-[var(--text-muted)] line-clamp-2">
                            "{req.message}"
                          </p>
                        )}
                        <span className="text-[10px] text-[var(--text-faint)]">
                          Applied {new Date(req.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {req.status === 'pending' ? (
                        <>
                          <Button
                            size="sm"
                            disabled={busy || !transferWindowOpen}
                            onClick={() => handleDecideJoinRequest(req.id, 'accept')}
                            className="gap-1 font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                          >
                            {transferWindowOpen ? '✓ Accept' : '🔒 Window Closed'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => handleDecideJoinRequest(req.id, 'reject')}
                            className="text-red-400 hover:text-red-300 hover:border-red-500/50"
                          >
                            ✕ Decline
                          </Button>
                        </>
                      ) : (
                        <span
                          className={cx(
                            'rounded-lg px-2.5 py-1 text-xs font-semibold capitalize',
                            req.status === 'accepted'
                              ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                              : 'bg-[var(--surface-hover)] text-[var(--text-muted)]',
                          )}
                        >
                          {req.status}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })()}

      {/* ---- squad ---- */}
      <section className={card}>
        <PanelHead
          label="Squad"
          title={myClub?.name ?? 'Your squad'}
          action={
            <Button
              size="sm"
              disabled={!transferWindowOpen}
              onClick={() => setShowSignModal(true)}
              className="gap-1.5 font-bold shadow-sm"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              {transferWindowOpen ? 'Sign a Player' : '🔒 Window Closed'}
            </Button>
          }
        />
        {!isManagerInSquad && transferWindowOpen && (
          <div className="mb-4 rounded-xl border border-[var(--accent-ring)] bg-[var(--accent-tint)]/40 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚽</span>
                  <span className="text-sm font-bold text-[var(--text-strong)]">
                    Add Yourself to Squad (Playing Captain)
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Club managers have playing privileges! Register your in-game identity to place yourself on your squad roster and be eligible for the Starting XI.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClaimSelf((prev) => !prev)}
                className="adm-btn adm-btn-primary px-3 py-1.5 text-xs font-semibold shrink-0"
              >
                {showClaimSelf ? 'Close' : '⚽ Add Myself to Squad'}
              </button>
            </div>

            {showClaimSelf && (
              <form
                onSubmit={handleClaimSelfPlayer}
                className="mt-3.5 pt-3.5 border-t border-[var(--border)] flex flex-wrap items-end gap-3"
              >
                <div className="flex-1 min-w-[160px] space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                    Your EA ID / Gamertag
                  </label>
                  <input
                    type="text"
                    required
                    value={selfGamertag}
                    onChange={(e) => setSelfGamertag(e.target.value)}
                    placeholder="e.g. Captain_Ace"
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text-strong)]"
                  />
                </div>
                <div className="w-28 space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                    Jersey # (1–99)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={selfShirtNumber}
                    onChange={(e) => setSelfShirtNumber(e.target.value)}
                    placeholder="10"
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-center font-mono text-xs font-bold text-[var(--text-strong)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={selfBusy || !selfGamertag.trim()}
                  className="adm-btn adm-btn-primary h-9 px-4 text-xs font-semibold whitespace-nowrap"
                >
                  {selfBusy ? 'Adding…' : 'Join as Playing Captain'}
                </button>
              </form>
            )}
          </div>
        )}
        {squadList.length === 0 ? (
          <div className="py-6 text-center">
            <EmptyState title="No players signed yet" hint="Search for players and send contract offers to build your roster." />
            <div className="mt-3">
              <Button
                size="sm"
                disabled={!transferWindowOpen}
                onClick={() => setShowSignModal(true)}
                className="gap-1.5 font-bold"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                {transferWindowOpen ? 'Sign First Player' : '🔒 Window Closed'}
              </Button>
            </div>
          </div>
        ) : (
          <>
          <ul className="divide-y divide-[var(--border)]">
            {pagedSquad.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <SmartImage
                  src={p.avatar_local || AVATAR_PLACEHOLDER}
                  fallback={AVATAR_PLACEHOLDER}
                  alt=""
                  wrapperClassName="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-[var(--surface-hover)] border border-[var(--border)]"
                  className="h-full w-full object-cover"
                />
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <Link
                    to={`/players/${p.slug}`}
                    className="truncate text-sm font-semibold text-[var(--text-strong)] hover:text-[var(--accent-text)]"
                  >
                    {p.gamertag}
                  </Link>
                  {Boolean(captainGamertag && p.gamertag.toLowerCase() === captainGamertag.toLowerCase()) && (
                    <span
                      className="shrink-0 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold"
                      title="Starting XI captain"
                    >
                      👑 Captain
                    </span>
                  )}
                  {((user?.playerId === p.id || user?.id === p.user_id) || Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase())) && (
                    <span
                      className="shrink-0 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 text-[10px] font-bold"
                      title="Club manager registered as a player"
                    >
                      Player-Manager
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                    Jersey #
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    defaultValue={p.shirt_number ?? ''}
                    placeholder="—"
                    onBlur={async (e) => {
                      const raw = e.target.value.trim()
                      const nextNum = raw === '' ? null : Number(raw)
                      if (nextNum === (p.shirt_number ?? null)) return
                      try {
                        await updateSquadPlayerShirt(p.id, nextNum)
                        setNotice({ kind: 'ok', text: `Updated jersey number for ${p.gamertag}.` })
                        await loadClub()
                      } catch (err) {
                        setNotice({ kind: 'error', text: msg(err) })
                      }
                    }}
                    className="h-8 w-14 rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-center font-mono text-xs font-bold text-[var(--text-strong)]"
                  />
                  <button
                    type="button"
                    disabled={busy || !transferWindowOpen}
                    onClick={() => handleReleasePlayer(p)}
                    className="ml-1 shrink-0 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition-all duration-150 hover:border-red-500/60 hover:bg-red-500 hover:text-white active:scale-95 disabled:opacity-50"
                    title={!transferWindowOpen ? 'Transfer window is closed' : (user?.playerId && p.id === user.playerId) || (user?.id && p.user_id === user.id) || (user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()) ? "Leave Squad" : "Release Player"}
                  >
                    {(user?.playerId && p.id === user.playerId) || (user?.id && p.user_id === user.id) || (user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()) ? "Leave" : "Release"}
                  </button>
                </div>
                {p.pending > 0 && (
                  <span className="rounded-full bg-[var(--accent-tint)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                    Awaiting reply
                  </span>
                )}
              </li>
            ))}
          </ul>

          {squadList.length > squadPageSize && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
              <span>
                Showing {(safeSquadPage - 1) * squadPageSize + 1}–
                {Math.min(safeSquadPage * squadPageSize, squadList.length)} of {squadList.length} players
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeSquadPage <= 1}
                  onClick={() => setSquadPage((p) => Math.max(1, p - 1))}
                >
                  ← Previous
                </Button>
                <span className="px-2 font-mono font-medium">
                  {safeSquadPage} / {totalSquadPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeSquadPage >= totalSquadPages}
                  onClick={() => setSquadPage((p) => Math.min(totalSquadPages, p + 1))}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </>
        )}
      </section>

      {/* ---- recruitment modal ---- */}
      <SignPlayerModal
        open={showSignModal}
        onClose={() => setShowSignModal(false)}
        squadPlayerIds={squadPlayerIds}
        onOfferSent={() => {
          void loadOffers()
        }}
      />

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

function PlayerPanel({ transferWindowOpen }: { transferWindowOpen: boolean }) {
  const { refresh } = useAuth()
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [club, setClub] = useState<{ id: number; name: string; slug: string } | null>(null)
  const [shirtNumber, setShirtNumber] = useState<string>('')
  const [offers, setOffers] = useState<Offer[]>([])

  const [playerRequests, setPlayerRequests] = useState<JoinRequest[]>([])

  const loadJoinRequests = useCallback(async () => {
    try {
      const data = await getPlayerJoinRequests()
      setPlayerRequests(data.requests)
    } catch {
      setPlayerRequests([])
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const overview = await playerOverview()
      setClub(overview.club)
      setShirtNumber(overview.player.shirt_number != null ? String(overview.player.shirt_number) : '')
      setOffers((await incomingOffers()).offers)
      await loadJoinRequests()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    }
  }, [loadJoinRequests])

  const onCancelPlayerRequest = async (id: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await cancelJoinRequest(id)
      setNotice({ kind: 'ok', text: 'Join request withdrawn.' })
      await loadJoinRequests()
    } catch (err: unknown) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  const onSaveShirtNumber = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const parsed = shirtNumber.trim() === '' ? null : Number(shirtNumber)
      await updateMyPlayerProfile({ shirtNumber: parsed })
      invalidateLiveClubCache()
      setNotice({ kind: 'ok', text: 'Jersey number updated.' })
      await load()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

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
      <TransferWindowClosedBanner open={transferWindowOpen} />

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
            <Button
              size="sm"
              variant="danger"
              disabled={busy || !transferWindowOpen}
              onClick={() => void onLeave()}
            >
              {transferWindowOpen ? 'Leave club' : '🔒 Window Closed'}
            </Button>
          </div>
        )}

        <form onSubmit={onSaveShirtNumber} className="mt-5 flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Jersey / Shirt Number (1–99)
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={shirtNumber}
              onChange={(e) => setShirtNumber(e.target.value)}
              placeholder="e.g. 10"
              className={cx(field, 'w-32 font-mono font-bold')}
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            Save Number
          </Button>
        </form>
      </section>

      {/* ---- club fixture calendar ---- */}
      <ClubFixtureCalendar clubSlug={club?.slug} clubName={club?.name} />

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
                      {o.created_at ? new Date(o.created_at.includes('T') ? o.created_at : o.created_at.replace(' ', 'T') + (o.created_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString() : ''}
                    </p>
                  </div>
                </div>
                {o.message && (
                  <p className={`mt-2 ${prose}`}>{o.message}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Button
                    size="sm"
                    disabled={busy || !transferWindowOpen}
                    onClick={() => void onDecide(o.id, 'accept')}
                  >
                    {transferWindowOpen ? 'Accept' : '🔒 Window Closed'}
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

      {/* ---- club applications ---- */}
      <section className={card}>
        <div className="flex items-center justify-between pb-1">
          <PanelHead label="Applications" title="Your Club Applications" />
          <ButtonLink to="/clubs" size="sm" variant="outline" className="gap-1.5 font-bold">
            Browse Clubs
          </ButtonLink>
        </div>
        {playerRequests.length === 0 ? (
          <EmptyState
            title="No applications sent"
            hint="You can browse the club list and request to join any club."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {playerRequests.map((r) => (
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <SmartImage
                    src={r.logo_local || r.logo_url || CLUB_PLACEHOLDER}
                    fallback={CLUB_PLACEHOLDER}
                    alt=""
                    wrapperClassName="h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-hover)] border border-[var(--border)]"
                    className="h-full w-full object-cover"
                  />
                  <div className="min-w-0">
                    <Link
                      to={`/clubs/${r.club_slug}`}
                      className="truncate text-sm font-bold text-[var(--text-strong)] hover:text-[var(--accent-text)]"
                    >
                      {r.club_name}
                    </Link>
                    {r.message && (
                      <p className="text-xs italic text-[var(--text-muted)] line-clamp-1">
                        "{r.message}"
                      </p>
                    )}
                    <span className="text-[10px] text-[var(--text-faint)]">
                      Applied {r.created_at ? new Date(r.created_at.includes('T') ? r.created_at : r.created_at.replace(' ', 'T') + (r.created_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span
                    className={cx(
                      'rounded-lg px-2.5 py-1 text-xs font-semibold capitalize',
                      r.status === 'pending'
                        ? 'bg-[var(--accent-tint)] text-[var(--accent-text)] font-bold'
                        : r.status === 'accepted'
                          ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                          : 'bg-[var(--surface-hover)] text-[var(--text-muted)]',
                    )}
                  >
                    {r.status === 'pending' ? 'Pending Review' : r.status}
                  </span>
                  {r.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onCancelPlayerRequest(r.id)}
                      className="text-xs text-[var(--text-muted)] hover:text-red-400"
                    >
                      Withdraw
                    </Button>
                  )}
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

/* ========================================================= orders & receipts */

function OrdersSection() {
  const [orders, setOrders] = useState<UserOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeReceipt, setActiveReceipt] = useState<UserOrder | null>(null)

  useEffect(() => {
    let active = true
    getMyOrders()
      .then((res) => {
        if (active) setOrders(res.orders || [])
      })
      .catch(() => {
        if (active) setOrders([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading || orders.length === 0) return null

  return (
    <section className="mt-8 rounded-card border border-[var(--border-strong)] bg-[var(--surface)] p-4 sm:p-5">
      <PanelHead label="Purchases" title="Payment History & Receipts" />
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
              <div>
                <span className="font-mono text-xs font-bold text-[var(--accent-text)]">{o.order_number}</span>
                <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                  {new Date(o.paid_at || o.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="adm-status-badge status-active text-[10px]">
                  {o.status.toUpperCase()}
                </span>
                <span className="font-mono text-sm font-bold text-[var(--text-strong)]">
                  {o.currency} {Number(o.total_amount).toFixed(2)}
                </span>
              </div>
            </div>

            {o.items && o.items.length > 0 && (
              <ul className="mt-2.5 space-y-1 text-xs text-[var(--text-muted)]">
                {o.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{it.quantity}× {it.name}</span>
                    <span className="font-mono">{o.currency} {(it.amount * it.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveReceipt(o)}
                className="adm-btn adm-btn-secondary px-2.5 py-1 text-xs font-semibold"
              >
                🖨️ View & Print Receipt
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeReceipt &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto animate-[fadeIn_.15s_ease-out]">
            <div className="surface relative my-auto w-full max-w-lg rounded-2xl border border-[var(--border)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">IWVPL Official Receipt</span>
                <p className="font-mono text-sm font-bold text-[var(--accent-text)]">{activeReceipt.order_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="text-lg text-[var(--text-muted)] hover:text-[var(--text-strong)]"
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">Date</span>
                  <p className="text-[var(--text-strong)] font-medium">
                    {new Date(activeReceipt.paid_at || activeReceipt.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">Payment Method</span>
                  <p className="text-[var(--text-strong)] font-medium">Stripe Card Payment</p>
                </div>
              </div>

              {activeReceipt.items && (
                <div className="border-t border-[var(--border)] pt-2 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-[var(--text-faint)]">Items</span>
                  {activeReceipt.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between py-1">
                      <span>{it.quantity}× {it.name}</span>
                      <span className="font-mono">{activeReceipt.currency} {(it.amount * it.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-sm font-bold">
                <span>Total Paid</span>
                <span className="font-mono text-[var(--accent-text)]">
                  {activeReceipt.currency} {Number(activeReceipt.total_amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="adm-btn adm-btn-primary px-3 py-1.5 text-xs font-semibold"
              >
                🖨️ Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="adm-btn adm-btn-outline px-3 py-1.5 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const sent = useRef(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [transferWindowOpen, setTransferWindowOpen] = useState(true)

  useEffect(() => {
    let active = true
    getTransferWindowStatus()
      .then((res) => {
        if (active && typeof res.open === 'boolean') {
          setTransferWindowOpen(res.open)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (window.location.hash.includes('settings')) {
      setShowSettingsModal(true)
    }
  }, [])

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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSettingsModal(true)}
            className="gap-1.5 font-bold"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Account Settings
          </Button>
          <ButtonLink to="/" variant="outline" size="sm">
            Back to site
          </ButtonLink>
        </div>
      </div>

      <Container size="default" className="pb-20">
        {isPlayer ? (
          <PlayerPanel transferWindowOpen={transferWindowOpen} />
        ) : (
          <ManagerPanel transferWindowOpen={transferWindowOpen} />
        )}
        <OrdersSection />
      </Container>

      <AccountSettingsModal
        open={showSettingsModal}
        onClose={() => {
          setShowSettingsModal(false)
          if (window.location.hash.includes('settings')) {
            window.history.replaceState(null, '', window.location.pathname)
          }
        }}
      />
    </div>
  )
}