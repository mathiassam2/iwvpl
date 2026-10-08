import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatTile } from '@/components/league'
import { Badge, Container, EmptyState, Section, Select, SmartImage, Tabs } from '@/components/ui'
import { siteData } from '@/data'
import { CLUB_PLACEHOLDER, cx, stripFlag } from '@/lib/format'

type Scope = 'all' | 'in' | 'out' | 'internal' | 'signed'

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
  { id: 'signed', label: 'Newly signed' },
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
  const rows = (siteData.transfers ?? []) as Row[]
  const [scope, setScope] = useState<Scope>('all')
  const [club, setClub] = useState('all')
  const [q, setQ] = useState('')

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
    const c: Record<Scope, number> = { all: rows.length, in: 0, out: 0, internal: 0, signed: 0 }
    rows.forEach((r) => {
      const f = r.from.free
      const t = r.to.free
      if (f && !t) c.in++
      else if (!f && t) c.out++
      else if (!f && !t) c.internal++
      else c.signed++
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
      if (scope === 'signed' && !(f && t)) return false

      if (club !== 'all') {
        const target = club.toUpperCase()
        if (stripFlag(r.from.name).toUpperCase() !== target && stripFlag(r.to.name).toUpperCase() !== target)
          return false
      }
      if (term && !r.player.toLowerCase().includes(term)) return false
      return true
    })
  }, [rows, scope, club, q])

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
            <StatTile label="Logged moves" value={rows.length} hint="This window" />
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

              <div className="relative sm:w-56">
                <label htmlFor="transfer-q" className="sr-only">
                  Search player
                </label>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
                >
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  id="transfer-q"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search player…"
                  className={cx(
                    'h-11 w-full rounded-full border border-[var(--border-strong)] bg-[var(--surface)]',
                    'pl-11 pr-4 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-faint)]',
                    'outline-none transition-colors focus:border-[var(--accent-ring)]',
                  )}
                />
              </div>
            </div>
          </div>

          {/* ---------- results ---------- */}
          {filtered.length === 0 ? (
            <EmptyState
              title="No transfers match your filters"
              hint="Try a different scope, club or player name."
            />
          ) : (
            <>
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                Showing{' '}
                <span className="numeric font-semibold text-[var(--text)]">{filtered.length}</span> of{' '}
                {rows.length} moves
              </p>

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

                {filtered.map((r, i) => (
                  <div
                    key={`${r.date}-${r.player}-${i}`}
                    role="row"
                    className="row-hover trf-tpl grid items-center border-b border-[var(--border)] last:border-0"
                  >
                    <div
                      role="cell"
                      className="numeric truncate px-3 py-3 text-[13px] text-[var(--text-muted)]"
                    >
                      {r.date}
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
