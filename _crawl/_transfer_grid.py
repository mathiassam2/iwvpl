import pathlib, re

p = pathlib.Path('src/pages/TransferPage.tsx')
s = p.read_text(encoding='utf-8')

old_table = """              <div className="surface overflow-hidden rounded-card">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse">
                    <caption className="sr-only">Transfer log</caption>
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                        <Th className="w-[150px]">Date</Th>
                        <Th className="w-[190px]">Player</Th>
                        <Th>From</Th>
                        <Th className="w-10" />
                        <Th>To</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => (
                        <tr
                          key={`${r.date}-${r.player}-${i}`}
                          className="row-hover border-b border-[var(--border)] last:border-0"
                        >
                          <td className="numeric whitespace-nowrap px-4 py-3 text-[13px] text-[var(--text-muted)]">
                            {r.date}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-semibold text-[var(--text-strong)]">
                              {r.player}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ClubCell side={r.from} />
                          </td>
                          <td className="px-1 py-3 text-center text-[var(--text-faint)]" aria-hidden>
                            »
                          </td>
                          <td className="px-4 py-3">
                            <ClubCell side={r.to} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>"""

new_table = """              {/* Header and rows share one `trf-tpl` track list, so a column's
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
              </div>"""

assert old_table in s, 'transfer table markup not found'
s = s.replace(old_table, new_table)

# Column definition + hide utility, declared above ClubCell.
s = s.replace(
    'function ClubCell({ side }: { side: Side }) {',
    """/** Columns, in order. `hide` marks columns dropped at a breakpoint. */
const TRANSFER_COLS = [
  { label: 'Date', align: 'left', nowrap: true, hide: '' },
  { label: 'Player', align: 'left', nowrap: false, hide: '' },
  { label: 'From', align: 'left', nowrap: false, hide: 'sm' },
  { label: '', align: 'center', nowrap: false, hide: 'sm' },
  { label: 'To', align: 'left', nowrap: false, hide: '' },
] as const

const hideCls = { '': '', sm: 'hidden sm:block' } as const

function ClubCell({ side }: { side: Side }) {""",
    1,
)

# The Th helper is now unused. It sits at the very end of the file with no
# trailing newline, so the pattern must not require one.
before = s
s = re.sub(r'\nfunction Th\(\{ children, className \}[\s\S]*?\n\}(\n|$)', r'\1', s, count=1)
assert s != before, 'Th helper not found'

# ClubCell must be able to shrink on narrow screens.
s = s.replace(
    """      <span className="inline-flex items-center gap-2 text-[var(--text-muted)]">
        <span aria-hidden className="text-sm">🛡️</span>
        <span className="text-sm">Free Agent</span>
      </span>""",
    """      <span className="inline-flex min-w-0 items-center gap-2 text-[var(--text-muted)]">
        <span aria-hidden className="shrink-0 text-sm">
          🛡️
        </span>
        <span className="truncate text-sm">Free Agent</span>
      </span>""",
)

p.write_text(s, encoding='utf-8')
print('transfer table -> grid')
