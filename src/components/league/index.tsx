import { Link } from 'react-router-dom'
import { Badge, SmartImage } from '@/components/ui'
import type { Club, Leaderboard, Match, Standing } from '@/types/site'
import {
  AVATAR_PLACEHOLDER,
  CLUB_PLACEHOLDER,
  clubHref,
  cx,
  dayNum,
  isoToFlag,
  monthShort,
  stripFlag,
  weekday,
} from '@/lib/format'
import { matchHref } from '@/lib/match'
import { playerHref } from '@/lib/players'

/* ============================================================ Form guide dots */
export function FormGuide({ form }: { form: string[] }) {
  if (!form?.length) return null
  const tones: Record<string, string> = {
    W: 'bg-[var(--accent-on-fill)] text-[var(--on-volt)]',
    D: 'bg-[var(--surface-2)] text-[var(--text-muted)] ring-1 ring-inset ring-[var(--border-strong)]',
    L: 'bg-[var(--danger-text)]/80 text-white',
  }
  return (
    <span className="inline-flex gap-1" title={`Form: ${form.join(' ')}`}>
      {form.slice(-5).map((f, i) => (
        <span
          key={i}
          className={cx(
            'numeric grid h-5 w-5 place-items-center rounded text-[10px] font-bold',
            tones[f] ?? 'bg-[var(--surface-2)] text-[var(--text-faint)]',
          )}
        >
          {f}
        </span>
      ))}
    </span>
  )
}

/* ============================================================ Promotion zones */
/**
 * `leagueSize` is the size of the WHOLE league, not the number of rows on
 * screen. The home page renders only the top 10, so deriving the relegation
 * cut-off from `rows.length` painted positions 9 and 10 as relegated.
 */
function posCell(pos: number, leagueSize: number) {
  if (pos <= 2) return 'bg-[var(--badge-up-bg)] text-[var(--badge-up-fg)]'
  if (leagueSize - pos < 2) return 'bg-[var(--badge-down-bg)] text-[var(--badge-down-fg)]'
  return 'text-[var(--text-muted)]'
}

/* ============================================================== StandingsTable */
export type StandingSortKey = 'pos' | 'pl' | 'w' | 'd' | 'l' | 'gf' | 'ga' | 'gd' | 'pts'

interface SortState {
  key: StandingSortKey
  desc: boolean
}

/**
 * The header and the rows are two halves of ONE grid template, so a column's
 * header and its values cannot drift apart by construction. (A real <table>
 * was unreliable here: the header and body rows resolved to different column
 * widths.) ARIA table roles preserve the semantics.
 *
 * The track list lives in the `.tbl-tpl` CSS rule rather than an inline
 * `gridTemplateColumns: 'var(--tpl)'`. A custom property does NOT get
 * Tailwind's underscore-to-space conversion, so passing
 * `[3.5rem_minmax(0,1fr)_...]` through one silently produced an invalid value,
 * every cell dropped into a single column, and the table stacked vertically.
 * Defining it in CSS also means both halves follow the same media queries
 * without any JS measurement.
 */
interface Col {
  key?: StandingSortKey
  label: string
  hide?: '' | 'sm' | 'md'
  align: 'left' | 'center'
}

const COLS: Col[] = [
  { key: 'pos', label: 'Pos', align: 'center' },
  { label: 'Club', align: 'left' },
  { key: 'pl', label: 'Pl', align: 'center' },
  { key: 'w', label: 'W', hide: 'sm', align: 'center' },
  { key: 'd', label: 'D', hide: 'sm', align: 'center' },
  { key: 'gd', label: 'GD', hide: 'sm', align: 'center' },
  { key: 'gf', label: 'GF', hide: 'md', align: 'center' },
  { key: 'ga', label: 'GA', hide: 'md', align: 'center' },
  { key: 'pts', label: 'Pts', align: 'center' },
]

const hideCls = { '': '', sm: 'hidden sm:grid', md: 'hidden md:grid' } as const

export function StandingsTable({
  rows,
  sort,
  onSort,
  leagueSize,
}: {
  rows: Standing[]
  sort?: SortState
  onSort?: (key: StandingSortKey) => void
  /** Full league size. Defaults to the row count for a full table. */
  leagueSize?: number
}) {
  const size = leagueSize ?? rows.length

  return (
    <div className="surface overflow-hidden rounded-card">
      {/* No `min-w` and no `overflow-x-auto`: the `.tbl-tpl` track list already
          collapses to four columns on a phone, so the table fits the viewport.
          A min-width here is what forced sideways scrolling. */}
      <div>
        <div role="table" aria-label="League standings" className="w-full">
          {/* ---------- header ---------- */}
          <div
            role="row"
            className="tbl-tpl grid border-b border-[var(--border)] bg-[var(--surface-2)]"
          >
            {COLS.map((c) => {
              const isSorted = c.key != null && sort?.key === c.key
              const sortable = c.key != null && onSort != null
              const label = (
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {isSorted && (
                    <span aria-hidden className="text-[8px] leading-none">
                      {sort?.desc ? '\u25bc' : '\u25b2'}
                    </span>
                  )}
                </span>
              )
              return (
                <div
                  key={c.label}
                  role="columnheader"
                  aria-sort={
                    !sortable ? undefined : isSorted ? (sort?.desc ? 'descending' : 'ascending') : 'none'
                  }
                  onClick={sortable ? () => onSort?.(c.key!) : undefined}
                  onKeyDown={
                    sortable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onSort?.(c.key!)
                          }
                        }
                      : undefined
                  }
                  tabIndex={sortable ? 0 : undefined}
                  title={sortable ? `Sort by ${c.label}` : undefined}
                  className={cx(
                    'px-3 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em]',
                    c.align === 'center' ? 'text-center' : 'text-left',
                    hideCls[c.hide ?? ''],
                    sortable && 'cursor-pointer select-none transition-colors',
                    isSorted
                      ? 'text-[var(--accent-text)]'
                      : 'text-[var(--text-faint)] hover:text-[var(--text)]',
                  )}
                >
                  {label}
                </div>
              )
            })}
            <div
              role="columnheader"
              className="hidden px-3 py-3.5 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)] lg:grid"
            >
              Form
            </div>
          </div>

          {/* ---------- rows ---------- */}
          {rows.map((r) => (
            <div
              key={r.team}
              role="row"
              className="row-hover tbl-tpl group relative grid items-center border-b border-[var(--border)] last:border-0"
            >
              <div
                role="cell"
                className="flex justify-center px-3 py-3"
              >
                <span
                  className={cx(
                    'numeric grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold transition-transform duration-300 group-hover:scale-110',
                    posCell(r.pos, size),
                  )}
                >
                  {r.pos}
                </span>
              </div>

              <div role="cell" className="flex min-w-0 items-center gap-3 px-3 py-3">
                <SmartImage
                  src={r.logo}
                  fallback={CLUB_PLACEHOLDER}
                  alt=""
                  wrapperClassName="h-9 w-9 shrink-0"
                  className="object-contain"
                />
                {/* The real link sits on the club name and is stretched across
                    the whole row with a pseudo-element. Keeping the anchor on
                    the name rather than wrapping the row preserves link
                    semantics for screen readers, which `role="row"` on an
                    `<a>` would strip. */}
                <Link
                  to={clubHref(r.team)}
                  className="min-w-0 truncate rounded text-sm font-semibold text-[var(--text-strong)] transition-colors after:absolute after:inset-0 after:content-[''] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:underline"
                >
                  {stripFlag(r.team)}
                </Link>
              </div>

              <NumCell>{r.pl}</NumCell>
              <NumCell hide="sm">{r.w}</NumCell>
              <NumCell hide="sm">{r.d}</NumCell>
              <NumCell hide="sm" signed={r.gd}>
                {r.gd > 0 ? `+${r.gd}` : r.gd}
              </NumCell>
              <NumCell hide="md">{r.gf}</NumCell>
              <NumCell hide="md">{r.ga}</NumCell>

              <div role="cell" className="px-3 py-3 text-center">
                <span className="numeric rounded-md bg-[var(--accent-tint)] px-2 py-1 text-sm font-bold text-[var(--accent-text)]">
                  {r.pts}
                </span>
              </div>

              <div role="cell" className="hidden justify-center px-3 py-3 lg:flex">
                <FormGuide form={r.form} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[11px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 rounded bg-[var(--badge-up-bg)] ring-1 ring-[var(--accent-ring)]"
          />
          Title / promotion
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded bg-[var(--badge-down-bg)]" />
          Relegation zone
        </span>
      </div>
    </div>
  )
}

function NumCell({
  children,
  hide,
  signed,
}: {
  children: React.ReactNode
  hide?: 'sm' | 'md'
  signed?: number
}) {
  return (
    <div
      role="cell"
      className={cx(
        'numeric px-3 py-3 text-center text-sm',
        hideCls[hide ?? ''],
        signed === undefined
          ? 'text-[var(--text)]'
          : signed > 0
            ? 'text-[var(--accent-text)]'
            : signed < 0
              ? 'text-[var(--danger-text)]'
              : 'text-[var(--text-muted)]',
      )}
    >
      {children}
    </div>
  )
}

/* ================================================================== MatchRow */
export function MatchRow({
  match,
  showDate = false,
  index,
}: {
  match: Match
  showDate?: boolean
  /**
   * Position in siteData.results. When given the row opens the in-app match
   * centre; without it the row falls back to /results, which is what the
   * standalone "other matches" list wants.
   */
  index?: number
}) {
  const played = match.hs !== '' && match.as !== ''
  return (
    <Link
      to={index === undefined ? '/results' : matchHref(index)}
      /* `.match-tpl` rather than an arbitrary grid-cols: Tailwind v4 emits no
         rule for `grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]` here, so the
         class landed in the DOM and did nothing. */
      className="row-hover match-tpl group grid items-center gap-3 px-3 py-3.5 sm:gap-5 sm:px-4"
    >
      {/* home */}
      <div className="flex min-w-0 items-center justify-end gap-3 text-right">
        <span className="truncate text-sm font-semibold text-[var(--text-strong)] sm:text-[15px]">
          {stripFlag(match.home)}
        </span>
        <SmartImage
          src={match.homeLogo ?? CLUB_PLACEHOLDER}
          fallback={CLUB_PLACEHOLDER}
          alt=""
          wrapperClassName="h-9 w-9 shrink-0 sm:h-11 sm:w-11"
          className="object-contain"
        />
      </div>

      {/* score */}
      <div className="flex flex-col items-center">
        {played ? (
          <span className="numeric animate-score-pop flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-base font-bold text-[var(--text-strong)] ring-1 ring-[var(--border-strong)] transition-colors group-hover:ring-[var(--accent-ring)] sm:text-lg">
            {match.hs}
            <span className="text-[var(--text-faint)]">:</span>
            {match.as}
          </span>
        ) : (
          <span className="numeric rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)]">
            {match.time || 'TBC'}
          </span>
        )}
        {showDate && (
          <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
            {weekday(match.date)} {dayNum(match.date)} {monthShort(match.date)}
          </span>
        )}
      </div>

      {/* away */}
      <div className="flex min-w-0 items-center gap-3">
        <SmartImage
          src={match.awayLogo ?? CLUB_PLACEHOLDER}
          fallback={CLUB_PLACEHOLDER}
          alt=""
          wrapperClassName="h-9 w-9 shrink-0 sm:h-11 sm:w-11"
          className="object-contain"
        />
        <span className="truncate text-sm font-semibold text-[var(--text-strong)] sm:text-[15px]">
          {stripFlag(match.away)}
        </span>
      </div>
    </Link>
  )
}

/* ================================================================== ClubCard */
const STATUS_TONE = {
  Active: 'volt',
  'Non-Active': 'muted',
  'Pending Approval': 'gold',
  '': 'muted',
} as const

export function ClubCard({ club }: { club: Club }) {
  // Internal detail page, never the original site: every crest stays in the app.
  return (
    <Link
      to={clubHref(club.name)}
      className="surface lift-quiet group flex flex-col items-center gap-3 rounded-card p-5 text-center"
    >
      <SmartImage
        src={club.logoLocal}
        fallback={CLUB_PLACEHOLDER}
        alt={`${club.name} crest`}
        wrapperClassName="h-20 w-20 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
        className="object-contain"
      />
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--text-strong)]">
          {stripFlag(club.name)}
        </p>
        {club.code && (
          <p className="numeric mt-1 text-[10px] tracking-[0.18em] text-[var(--text-faint)]">
            {club.code}
          </p>
        )}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-1">
        <Badge tone={STATUS_TONE[club.status] ?? 'muted'}>{club.status || 'Unregistered'}</Badge>
        {club.players > 0 && (
          <span className="numeric text-[11px] text-[var(--text-muted)]">{club.players} players</span>
        )}
      </div>
    </Link>
  )
}

/* ============================================================ LeaderboardTable */
export function LeaderboardTable({
  board,
  limit,
  offset = 0,
}: {
  board: Leaderboard
  limit?: number
  offset?: number
}) {
  const unit = board.title.includes('SCOR')
    ? 'goals'
    : board.title.includes('ASSIST')
      ? 'assists'
      : 'saves'
  const rows = board.rows.slice(offset, typeof limit === 'number' ? offset + limit : undefined)
  const start = offset

  return (
    <ol className="divide-y divide-[var(--border)]">
      {rows.map((r, i) => {
        const rank = start + i + 1
        return (
        <li key={`${r.name}-${i}`} className="border-b border-[var(--border)] last:border-b-0">
          <Link
            to={playerHref(r.name)}
            className="row-hover group flex items-center gap-4 px-4 py-3.5 sm:px-5"
          >
          <span
            className={cx(
              'numeric grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold transition-transform duration-300 group-hover:scale-110',
              rank === 1
                ? 'bg-[var(--badge-gold-bg)] text-[var(--badge-gold-fg)]'
                : rank <= 3
                  ? 'bg-[var(--accent-tint)] text-[var(--accent-text)]'
                  : 'bg-[var(--surface-2)] text-[var(--text-muted)]',
            )}
          >
            {rank}
          </span>

          <SmartImage
            src={r.avatarLocal}
            fallback={AVATAR_PLACEHOLDER}
            alt=""
            wrapperClassName="h-11 w-11 shrink-0 rounded-full ring-1 ring-[var(--border)]"
            className="object-cover"
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{r.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span aria-hidden>{r.team_flag || isoToFlag('')}</span>
              <span className="truncate">{stripFlag(r.team)}</span>
            </p>
          </div>

          <div className="text-right">
            <span className="numeric block text-lg font-bold text-[var(--text-strong)]">{r.value}</span>
            <span className="block text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
              {unit}
            </span>
          </div>
          </Link>
        </li>
        )
      })}
    </ol>
  )
}

/* ================================================================ StatTile */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="surface group rounded-card p-5 transition-colors duration-300 hover:border-[var(--accent-ring)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
        {label}
      </p>
      <p className="numeric mt-2 text-4xl font-bold text-[var(--text-strong)] transition-colors duration-300 group-hover:text-[var(--text-strong)] group-hover:text-[var(--accent-text)]">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}