import pathlib

p = pathlib.Path('src/components/league/index.tsx')
s = p.read_text(encoding='utf-8')

start = s.index('/* ============================================================== StandingsTable */')
end = s.index('/* ================================================================== MatchRow */')

new = r'''/* ============================================================== StandingsTable */
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
 */
const TEMPLATE =
  '[3.5rem_minmax(0,1fr)_3.75rem_3.75rem_3.5rem_3.5rem_3.5rem_3.5rem_4rem_8rem]'
const TEMPLATE_SM =
  '[3.5rem_minmax(0,1fr)_3.75rem_3.75rem_3.5rem_3.5rem_3.5rem_3.5rem_4rem]'
const TEMPLATE_MD =
  '[3.5rem_minmax(0,1fr)_3.75rem_3.75rem_3.5rem_3.5rem_4rem_4rem_3.5rem_8rem]'

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

function templateFor(hidden: Array<Col['hide']>) {
  let t = TEMPLATE
  if (hidden.includes('md')) t = TEMPLATE_MD
  if (hidden.includes('sm')) t = TEMPLATE_SM
  return t
}

export function StandingsTable({
  rows,
  sort,
  onSort,
}: {
  rows: Standing[]
  sort?: SortState
  onSort?: (key: StandingSortKey) => void
}) {
  const total = rows.length
  const hidden = COLS.filter((c) => c.hide).map((c) => c.hide)
  const tpl = templateFor(hidden)
  const visible = COLS.filter((c) => !c.hide)
  const showForm = true

  return (
    <div className="surface overflow-hidden rounded-card">
      <div className="overflow-x-auto">
        <div
          role="table"
          aria-label="League standings"
          aria-sort={undefined}
          className="w-full min-w-[720px]"
          style={{ ['--tpl' as string]: tpl }}
        >
          {/* ---------- header ---------- */}
          <div
            role="row"
            className="grid border-b border-[var(--border)] bg-[var(--surface-2)]"
            style={{ gridTemplateColumns: 'var(--tpl)' }}
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
              className="row-hover grid items-center border-b border-[var(--border)] last:border-0"
              style={{ gridTemplateColumns: 'var(--tpl)' }}
            >
              <div
                role="cell"
                className="flex justify-center px-3 py-3"
              >
                <span
                  className={cx(
                    'numeric grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold transition-transform duration-300 group-hover:scale-110',
                    posCell(r.pos, total),
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-strong)]">
                    {stripFlag(r.team)}
                  </p>
                  {r.code && (
                    <p className="numeric text-[10px] tracking-widest text-[var(--text-faint)]">
                      {r.code}
                    </p>
                  )}
                </div>
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

              {showForm && (
                <div
                  role="cell"
                  className="hidden justify-center px-3 py-3 lg:flex"
                >
                  <FormGuide form={r.form} />
                </div>
              )}
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

'''

s = s[:start] + new + s[end:]
p.write_text(s, encoding='utf-8')
print('StandingsTable rebuilt on a shared CSS grid')