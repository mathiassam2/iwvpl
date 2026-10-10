import { Link } from 'react-router-dom'
import { Card, SmartImage } from '@/components/ui'
import { CLUB_PLACEHOLDER, cx, stripFlag } from '@/lib/format'
import type { Squad } from '@/lib/fixtures'
import type { Match } from '@/types/site'

/* ====================================================================== Pitch */

/**
 * Formation board. Positions arrive as percentages from lib/fixtures, so the
 * same eleven always renders in the same spots - an absolutely positioned
 * div rather than a fixed image, which keeps the names selectable and lets the
 * whole thing reflow on narrow screens without a second layout.
 */
export function Pitch({ squad, home }: { squad: Squad; home: boolean }) {
  return (
    // Every child is absolutely positioned against percentage coordinates, so
    // the box needs an explicit ratio or it collapses to zero height.
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-card">
      {/* mown stripes - eight bands, alternating, behind the markings */}
      <div aria-hidden className="absolute inset-0 flex flex-col">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className={cx('flex-1', i % 2 === 0 ? 'bg-[#0e2c18]' : 'bg-[#123823]')}
          />
        ))}
      </div>

      {/* markings */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.4" vectorEffect="non-scaling-stroke">
          <rect x="1.5" y="1.5" width="97" height="97" />
          <line x1="1.5" y1="50" x2="98.5" y2="50" />
          <circle cx="50" cy="50" r="9" />
          {/* penalty boxes, mirrored for the two goal ends */}
          <rect x="22" y="1.5" width="56" height="13" />
          <rect x="38" y="1.5" width="24" height="5" />
          <rect x="22" y="85.5" width="56" height="13" />
          <rect x="38" y="93.5" width="24" height="5" />
        </g>
      </svg>

      {/* players */}
      {squad.starters.map((p) => (
        <div
          key={p.number}
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          <span
            className={cx(
              'numeric mx-auto grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold sm:h-9 sm:w-9 sm:text-sm',
              home
                ? 'bg-[var(--accent-solid)] text-[var(--on-volt)] ring-2 ring-black/25'
                : 'bg-white text-[#111] ring-2 ring-black/25',
            )}
          >
            {p.number}
          </span>
          <span className="mt-1 block max-w-[4.5rem] text-[9px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] sm:max-w-[5.5rem] sm:text-[11px]">
            {p.name}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ================================================================= LineupList */

/** Flattened XI + bench, for the two-column match-centre presentation. */
export function LineupList({
  squad,
  home,
}: {
  squad: Squad
  home: boolean
}) {
  const Row = ({
    number,
    name,
    role,
    keeper,
  }: {
    number: number
    name: string
    role: string
    keeper?: boolean
  }) => (
    <li className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2 last:border-0">
      <span
        className={cx(
          'numeric grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
          home
            ? 'bg-[var(--accent-tint)] text-[var(--accent-text)]'
            : 'bg-[var(--surface-2)] text-[var(--text-muted)]',
        )}
      >
        {number}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
        {name}
      </span>
      {keeper && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
          GK
        </span>
      )}
      {!keeper && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
          {role}
        </span>
      )}
    </li>
  )

  return (
    <div>
      <ul>
        {squad.starters.map((p) => (
          <Row
            key={`s${p.number}`}
            number={p.number}
            name={p.name}
            role={p.role}
            keeper={p.role === 'GK'}
          />
        ))}
      </ul>
      <p className="border-y border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
        Bench
      </p>
      <ul>
        {squad.bench.map((p) => (
          <Row key={`b${p.number}`} number={p.number} name={p.name} role={p.role} />
        ))}
      </ul>
    </div>
  )
}

/* ================================================================= TeamFormStrip */

/**
 * The five-match strip: opponent crest, home/away tag and the result, in one
 * fixed-width column each so the crests stay on a common baseline.
 */
export function TeamFormStrip({ matches, club }: { matches: Match[]; club: string }) {
  if (matches.length === 0) {
    return (
      <p className="px-1 text-sm text-[var(--text-muted)]">
        No recorded matches in the current season.
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-5 gap-1.5">
      {matches.slice(0, 5).map((m, i) => {
        const hs = Number(m.hs)
        const as = Number(m.as)
        const played = Number.isFinite(hs) && Number.isFinite(as)
        const clubIsHome = stripFlag(m.home) === stripFlag(club)
        const gf = clubIsHome ? hs : as
        const ga = clubIsHome ? as : hs
        const outcome = !played ? null : gf > ga ? 'W' : gf < ga ? 'L' : 'D'
        const opponent = clubIsHome ? m.away : m.home
        const opponentLogo = clubIsHome ? m.awayLogo : m.homeLogo

        return (
          <li key={`${m.url}-${i}`} className="flex flex-col items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              {clubIsHome ? 'H' : 'A'}
            </span>
            <SmartImage
              src={opponentLogo ?? CLUB_PLACEHOLDER}
              fallback={CLUB_PLACEHOLDER}
              alt=""
              wrapperClassName="h-8 w-8 sm:h-10 sm:w-10"
              className="object-contain"
            />
            <span className="max-w-full truncate text-center text-[10px] text-[var(--text-muted)]">
              {stripFlag(opponent).split(' ').slice(-1)[0]}
            </span>
            {outcome ? (
              <span
                className={cx(
                  'numeric w-full rounded-md py-1 text-center text-[11px] font-bold',
                  outcome === 'W' && 'bg-[var(--badge-up-bg)] text-[var(--badge-up-fg)]',
                  outcome === 'D' && 'bg-[var(--surface-2)] text-[var(--text-muted)]',
                  outcome === 'L' && 'bg-[var(--badge-down-bg)] text-[var(--badge-down-fg)]',
                )}
              >
                {gf}-{ga}
              </span>
            ) : (
              <span className="numeric w-full rounded-md bg-[var(--surface-2)] py-1 text-center text-[11px] font-bold text-[var(--text-muted)]">
                {m.time || 'TBC'}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ================================================================ TableSnippet */

/** Compact table around the club - the PL-style "position" panel. */
export function TableSnippet({
  rows,
  highlight,
}: {
  rows: Array<{
    pos: number
    team: string
    logo: string
    pl: number
    w: number
    d: number
    l: number
    gd: number
    pts: number
  }>
  highlight: string
}) {
  const idx = rows.findIndex((r) => stripFlag(r.team) === highlight)
  if (idx < 0) return null
  const start = Math.max(0, Math.min(idx - 2, rows.length - 5))
  const window = rows.slice(start, start + 5)

  return (
    <div className="flex items-end gap-4">
      <div className="shrink-0">
        <p className="text-5xl font-extrabold leading-none text-[var(--text-strong)]">
          {rows[idx].pos}
          <span className="text-2xl text-[var(--text-muted)]">
            {rows[idx].pos === 1 ? 'st' : rows[idx].pos === 2 ? 'nd' : rows[idx].pos === 3 ? 'rd' : 'th'}
          </span>
        </p>
        <p className="mt-2 max-w-[9rem] text-xs text-[var(--text-muted)]">
          {rows[idx].pts} points from {rows[idx].pl} played
        </p>
      </div>

      <ul className="min-w-0 flex-1">
        {window.map((r) => {
          const on = stripFlag(r.team) === highlight
          return (
            <li
              key={r.team}
              className={cx(
                'flex items-center gap-2.5 border-l-2 py-1.5 pl-3',
                on ? 'border-[var(--accent-solid)] bg-[var(--accent-tint)]' : 'border-transparent',
              )}
            >
              <span className="numeric w-4 shrink-0 text-right text-[11px] text-[var(--text-faint)]">
                {r.pos}
              </span>
              <SmartImage
                src={r.logo}
                fallback={CLUB_PLACEHOLDER}
                alt=""
                wrapperClassName="h-6 w-6 shrink-0"
                className="object-contain"
              />
              <Link
                to={`/clubs/${r.team
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')}`}
                className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text)] hover:underline"
              >
                {stripFlag(r.team)}
              </Link>
              <span className="numeric text-xs text-[var(--text-faint)]">{r.pts}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ================================================================= LastResult */

/** The "Next Match" panel. With no upcoming fixture, shows the last result. */
export function NextMatchCard({
  next,
  last,
  href,
}: {
  next?: Match
  last?: Match
  href: string
}) {
  const m = next ?? last
  const isNext = Boolean(next)
  if (!m) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">No fixtures yet.</p>
      </Card>
    )
  }

  const played = m.hs !== '' && m.as !== ''

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
          {isNext ? 'Next match' : 'Last result'}
        </p>
        <Link
          to={href}
          className="text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
        >
          Match centre →
        </Link>
      </div>

      <Link to={href} className="group block px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <SmartImage
              src={m.homeLogo ?? CLUB_PLACEHOLDER}
              fallback={CLUB_PLACEHOLDER}
              alt=""
              wrapperClassName="h-12 w-12 sm:h-14 sm:w-14"
              className="object-contain"
            />
            <span className="line-clamp-2 text-xs font-semibold text-[var(--text-strong)] sm:text-sm">
              {stripFlag(m.home)}
            </span>
          </div>

          <div className="shrink-0 px-2 text-center">
            {played ? (
              <span className="numeric rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-lg font-bold text-[var(--text-strong)] ring-1 ring-[var(--border-strong)]">
                {m.hs} : {m.as}
              </span>
            ) : (
              <span className="numeric rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)]">
                {m.time || 'TBC'}
              </span>
            )}
            <p className="mt-2 text-[10px] text-[var(--text-faint)]">{m.date}</p>
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <SmartImage
              src={m.awayLogo ?? CLUB_PLACEHOLDER}
              fallback={CLUB_PLACEHOLDER}
              alt=""
              wrapperClassName="h-12 w-12 sm:h-14 sm:w-14"
              className="object-contain"
            />
            <span className="line-clamp-2 text-xs font-semibold text-[var(--text-strong)] sm:text-sm">
              {stripFlag(m.away)}
            </span>
          </div>
        </div>
      </Link>
    </Card>
  )
}

export { FormGuide }