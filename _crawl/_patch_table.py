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

/* One definition per column, consumed by <colgroup>, <th> and <td>, so a header
   and its cells can never drift apart. */
const COLS: Array<{ key?: StandingSortKey; label: string; cls: string; align: string }> = [
  { key: 'pos', label: 'Pos', cls: 'w-[3.5rem]', align: 'text-center' },
  { label: 'Club', cls: '', align: 'text-left' },
  { key: 'pl', label: 'Pl', cls: 'w-12', align: 'text-center' },
  { key: 'w', label: 'W', cls: 'w-12 hidden sm:table-cell', align: 'text-center' },
  { key: 'd', label: 'D', cls: 'w-12 hidden sm:table-cell', align: 'text-center' },
  { key: 'gd', label: 'GD', cls: 'w-14 hidden sm:table-cell', align: 'text-center' },
  { key: 'gf', label: 'GF', cls: 'w-14 hidden md:table-cell', align: 'text-center' },
  { key: 'ga', label: 'GA', cls: 'w-14 hidden md:table-cell', align: 'text-center' },
  { key: 'pts', label: 'Pts', cls: 'w-16', align: 'text-center' },
]
const FORM_COL = { cls: 'w-32 hidden lg:table-cell', align: 'text-center' }

const HEAD_TH = 'px-3 text-[10px] font-bold uppercase tracking-[0.14em]'
const BODY_TD = 'px-3 py-3'

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

  return (
    <div className="surface overflow-hidden rounded-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse">
          <caption className="sr-only">League standings</caption>
          <colgroup>
            {COLS.map((c) => (
              <col
                key={c.label}
                className={c.cls.split(' ').filter((t) => t.startsWith('w-')).join(' ')}
              />
            ))}
            <col className={FORM_COL.cls.split(' ')[0]} />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
              {COLS.map((c) =>
                c.key && onSort ? (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={
                      sort?.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'
                    }
                    className={cx(HEAD_TH, 'py-0', c.cls, c.align)}
                  >
                    {/* Negative margin + full-bleed width means the button
                        occupies the entire header cell, so its own padding can
                        never nudge the label out of alignment. */}
                    <button
                      onClick={() => onSort(c.key!)}
                      className={cx(
                        '-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1 py-3.5 transition-colors',
                        c.align === 'text-center' ? 'justify-center' : 'justify-start',
                        sort?.key === c.key
                          ? 'text-[var(--accent-text)]'
                          : 'text-[var(--text-faint)] hover:text-[var(--text)]',
                      )}
                    >
                      {c.label}
                      {sort?.key === c.key && (
                        <span aria-hidden className="text-[8px] leading-none">
                          {sort.desc ? '▼' : '▲'}
                        </span>
                      )}
                    </button>
                  </th>
                ) : (
                  <th
                    key={c.label}
                    scope="col"
                    className={cx(
                      HEAD_TH,
                      BODY_TD,
                      'py-3.5',
                      c.cls,
                      c.align,
                      'text-[var(--text-faint)]',
                    )}
                  >
                    {c.label}
                  </th>
                ),
              )}
              <th
                scope="col"
                className={cx(
                  HEAD_TH,
                  BODY_TD,
                  'py-3.5',
                  FORM_COL.cls,
                  FORM_COL.align,
                  'text-[var(--text-faint)]',
                )}
              >
                Form
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.team}
                className="row-hover group border-b border-[var(--border)] last:border-0"
              >
                <td className={cx(BODY_TD, 'text-center')}>
                  <span
                    className={cx(
                      'numeric mx-auto grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold transition-transform duration-300 group-hover:scale-110',
                      posCell(r.pos, total),
                    )}
                  >
                    {r.pos}
                  </span>
                </td>
                <td className={BODY_TD}>
                  <div className="flex items-center gap-3">
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
                </td>
                <Num>{r.pl}</Num>
                <Num cls={COLS[3].cls}>{r.w}</Num>
                <Num cls={COLS[4].cls}>{r.d}</Num>
                <Num cls={COLS[5].cls} signed={r.gd}>
                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                </Num>
                <Num cls={COLS[6].cls}>{r.gf}</Num>
                <Num cls={COLS[7].cls}>{r.ga}</Num>
                <td className={cx(BODY_TD, 'text-center')}>
                  <span className="numeric rounded-md bg-[var(--accent-tint)] px-2 py-1 text-sm font-bold text-[var(--accent-text)]">
                    {r.pts}
                  </span>
                </td>
                <td className={cx(BODY_TD, FORM_COL.cls, 'text-center')}>
                  <div className="flex justify-center">
                    <FormGuide form={r.form} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[11px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 rounded bg-[var(--accent-tint)] ring-1 ring-[var(--accent-ring)]"
          />
          Title / promotion
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded bg-[var(--danger-text)]/25" />
          Relegation zone
        </span>
      </div>
    </div>
  )
}

function Num({
  children,
  cls,
  signed,
}: {
  children: React.ReactNode
  cls?: string
  signed?: number
}) {
  return (
    <td
      className={cx(
        'numeric px-3 py-3 text-center text-sm',
        signed === undefined
          ? 'text-[var(--text)]'
          : signed > 0
            ? 'text-[var(--accent-text)]'
            : signed < 0
              ? 'text-[var(--danger-text)]'
              : 'text-[var(--text-muted)]',
        cls,
      )}
    >
      {children}
    </td>
  )
}

'''

s = s[:start] + new + s[end:]
p.write_text(s, encoding='utf-8')
print('StandingsTable rewritten')