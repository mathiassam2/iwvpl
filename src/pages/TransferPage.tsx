import { useEffect, useMemo, useState } from 'react'
import { getLiveTransfers, peekLiveTransfers } from '@/lib/liveLeague'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatTile } from '@/components/league'
import { Badge, Button, Container, EmptyState, Section, Select, SmartImage, Tabs } from '@/components/ui'
import { siteData } from '@/data'
import { CLUB_PLACEHOLDER, cx, stripFlag } from '@/lib/format'

type Scope = 'all' | 'in' | 'out' | 'internal'

interface Side {
  name: string
  logo: string
  emoji: string
  free: boolean
  logoLocal: string
}

interface Row {
  date: string
  player: string
  from: Side
  to: Side
}

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'all', label: 'All moves' },
  { id: 'in', label: 'Signings' },
  { id: 'out', label: 'Departures' },
  { id: 'internal', label: 'Internal' },
]

/** Columns, in order. `hide` marks columns dropped at a breakpoint. */
const TRANSFER_COLS = [
  { label: 'Date', align: 'left', nowrap: true, hide: '' },
  { label: 'Player', align: 'left', nowrap: false, hide: '' },
  { label: 'From', align: 'left', nowrap: false, hide: 'sm' },
  { label: '', align: 'center', nowrap: false, hide: 'sm' },
  { label: 'To', align: 'left', nowrap: false, hide: '' },
] as const

const hideCls = { '': '', sm: 'hidden sm:block' } as const

function ClubCell({ side }: { side: Side }) {
  if (side.free) {
    return (
      <span className="inline-flex min-w-0 items-center gap-2 text-[var(--text-muted)]">
        <span aria-hidden className="shrink-0 text-sm">
          🛡️
        </span>
        <span className="truncate text-sm">Free Agent</span>
      </span>
    )
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <SmartImage
        src={side.logoLocal || CLUB_PLACEHOLDER}
        fallback={CLUB_PLACEHOLDER}
        alt=""
        wrapperClassName="h-7 w-7 shrink-0"
        className="object-contain"
      />
      <span className="truncate text-sm font-semibold text-[var(--text-strong)]">
        {stripFlag(side.name)}
      </span>
    </span>
  )
}

export default function TransferPage() {
  const [liveRows, setLiveRows] = useState<Row[] | null>(() => peekLiveTransfers() as Row[] | null)
  const [page, setPage] = useState(1)
  const pageSize = 25

  useEffect(() => {
    let active = true
    const ctrl = new AbortController()
    getLiveTransfers(ctrl.signal).then((data) => {
      if (active && data && data.length > 0) {
        setLiveRows(data as Row[])
      }
    })
    return () => {
      active = false
      ctrl.abort()
    }
  }, [])

  // Exclude Free Agent to Free Agent moves and ensure strict descending order
  const rows = useMemo(() => {
    const raw = (liveRows ?? siteData.transfers ?? []) as Row[]
    return raw
      .filter((r) => !(r.from.free && r.to.free))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [liveRows])

  const [scope, setScope] = useState<Scope>('all')
  const [club, setClub] = useState('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    setPage(1)
  }, [scope, club, q])

  const clubs = useMemo(() => {
    const s = new Set<string>()
    rows.forEach((r) => {
      s.add(stripFlag(r.from.name))
      s.add(stripFlag(r.to.name))
    })
    s.delete('Free Agent')
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const counts = useMemo(() => {
    const c: Record<Scope, number> = { all: rows.length, in: 0, out: 0, internal: 0 }
    rows.forEach((r) => {
      const f = r.from.free
      const t = r.to.free
      if (f && !t) c.in++
      else if (!f && t) c.out++
      else if (!f && !t) c.internal++
    })
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((r) => {
      const f = r.from.free
      const t = r.to.free
      if (scope === 'in' && !(f && !t)) return false
      if (scope === 'out' && !(t && !f)) return false
      if (scope === 'internal' && (f || t)) return false

      if (club !== 'all') {
        const target = club.toUpperCase()
        if (stripFlag(r.from.name).toUpperCase() !== target && stripFlag(r.to.name).toUpperCase() !== target)
          return false
      }
      if (term && !r.player.toLowerCase().includes(term)) return false
      return true
    })
  }, [rows, scope, club, q])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    return filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  }, [filtered, safePage, pageSize])

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Squad movement"
        title="Transfer Window"
        lede="Every registration, release and inter-club move logged by team managers across the league."
      />

      <Section>
        <Container size="wide">
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Logged moves" value={counts.all} hint="This window" />
            <StatTile label="Signings" value={counts.in} hint="Free agent → club" />
            <StatTile label="Departures" value={counts.out} hint="Club → free agent" />
            <StatTile label="Internal" value={counts.internal} hint="Club → club" />
          </div>

          {/* ---------- filters ---------- */}
          <div className="mb-6 flex flex-col gap-5 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              tabs={SCOPES.map((s) => ({ id: s.id, label: s.label, count: counts[s.id] }))}
              active={scope}
              onChange={(id) => setScope(id as Scope)}
              idPrefix="scope"
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative sm:w-64">
                <label htmlFor="transfer-club" className="sr-only">
                  Filter by club
                </label>
                <Select
                  id="transfer-club"
                  value={club}
                  onChange={setClub}
                  options={[
                    { value: 'all', label: 'All clubs' },
                    ...clubs.map((c) => ({ value: c, label: c })),
                  ]}
                  className="sm:w-64"
                />
              </div>

              <div className="relative sm:w-64">
                <label htmlFor="transfer-q" className="sr-only">
                  Search player
                </label>
                <input
                  id="transfer-q"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search player name…"
                  className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent-ring)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* ---------- results ---------- */}
          {filtered.length === 0 ? (
            <EmptyState
              title="No transfers match your filters"
              hint={
                q || club !== 'all' || scope !== 'all'
                  ? 'Try clearing the search box or selecting another scope or club.'
                  : 'Moves will appear here as soon as signings are completed.'
              }
            />
          ) : (
            <>
              {/* Header and rows share one `trf-tpl` track list, so a column's
                  heading and its values can never drift apart, and the track
                  count shrinks at small widths so nothing scrolls sideways. */}
              <div
                role="table"
                aria-label="Transfer log"
                className="surface overflow-hidden rounded-card"
              >
                <div
                  role="row"
                  className="trf-tpl grid border-b border-[var(--border)] bg-[var(--surface-2)]"
                >
                  {TRANSFER_COLS.map((c, i) => (
                    <div
                      key={c.label || i}
                      role="columnheader"
                      className={cx(
                        'px-3 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]',
                        c.align === 'center' ? 'text-center' : 'text-left',
                        c.hide ? hideCls[c.hide] : '',
                      )}
                    >
                      {c.label ? (
                        <span className={c.nowrap ? 'whitespace-nowrap' : undefined}>{c.label}</span>
                      ) : null}
                    </div>
                  ))}
                </div>

                {pagedRows.map((r, i) => (
                  <div
                    key={`${r.date ? r.date.split(' ')[0] : ''}-${r.player}-${i}`}
                    role="row"
                    className="row-hover trf-tpl grid items-center border-b border-[var(--border)] last:border-0"
                  >
                    <div
                      role="cell"
                      className="numeric truncate px-3 py-3 text-[13px] text-[var(--text-muted)]"
                    >
                      {r.date ? r.date.split(' ')[0] : ''}
                    </div>

                    <div role="cell" className="min-w-0 px-3 py-3">
                      <span className="block truncate text-sm font-semibold text-[var(--text-strong)]">
                        {r.player}
                      </span>
                      {/* Phones drop the From/To columns, so name the destination
                          on a second line rather than losing the information. */}
                      <span className="trf-club-line mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <span aria-hidden className="shrink-0">
                          &rarr;
                        </span>
                        <span className="truncate">
                          {r.to.free ? 'Free Agent' : stripFlag(r.to.name)}
                        </span>
                      </span>
                    </div>

                    <div role="cell" className="hidden min-w-0 px-3 py-3 sm:block">
                      <ClubCell side={r.from} />
                    </div>

                    <div
                      role="cell"
                      aria-hidden
                      className="hidden px-1 py-3 text-center text-[var(--text-faint)] sm:block"
                    >
                      &raquo;
                    </div>

                    <div role="cell" className="min-w-0 px-3 py-3">
                      <ClubCell side={r.to} />
                    </div>
                  </div>
                ))}
              </div>

              {/* ---------- Pagination controls ---------- */}
              {totalPages > 1 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-xs">
                  <div className="text-[var(--text-muted)]">
                    Showing <strong className="font-mono text-[var(--text-strong)]">{(safePage - 1) * pageSize + 1}</strong>
                    –<strong className="font-mono text-[var(--text-strong)]">{Math.min(safePage * pageSize, filtered.length)}</strong> of{' '}
                    <strong className="font-mono text-[var(--text-strong)]">{filtered.length}</strong> transfers
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={safePage <= 1}
                      onClick={() => {
                        setPage((p) => Math.max(1, p - 1))
                        window.scrollTo({ top: 220, behavior: 'smooth' })
                      }}
                    >
                      ← Previous
                    </Button>
                    <span className="px-2 font-mono font-medium text-[var(--text-strong)]">
                      Page {safePage} of {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={safePage >= totalPages}
                      onClick={() => {
                        setPage((p) => Math.min(totalPages, p + 1))
                        window.scrollTo({ top: 220, behavior: 'smooth' })
                      }}
                    >
                      Next →
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <Badge tone="muted">Free agents</Badge>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
                  A player shown as <em>Free Agent</em> has no registered club and can be signed by
                  any manager with an open roster slot. Movements are logged automatically when a
                  manager submits or releases a player through the Manager Portal.
                </p>
              </div>
            </>
          )}
        </Container>
      </Section>
    </div>
  )
}
