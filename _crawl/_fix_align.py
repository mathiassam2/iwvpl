import pathlib

p = pathlib.Path('src/components/league/index.tsx')
s = p.read_text(encoding='utf-8')

# 1. Drop <colgroup>: `hidden` / `table-cell` are invalid on <col> and were
#    silently collapsing columns under table-fixed, shifting every cell.
old_colgroup = """          <colgroup>
            {COLS.map((c) => (
              <col
                key={c.label}
                className={c.cls.split(' ').filter((t) => t.startsWith('w-')).join(' ')}
              />
            ))}
            <col className={FORM_COL.cls.split(' ')[0]} />
          </colgroup>
"""
assert old_colgroup in s
s = s.replace(old_colgroup, "")

# 2. Back to auto layout: widths come from the shared th/td classes instead.
s = s.replace(
    '<table className="w-full min-w-[720px] table-fixed border-collapse">',
    '<table className="w-full min-w-[720px] border-collapse">',
)

# 3. Apply the width class to the Pos and Pts cells too, so every column's
#    header and body cell share identical horizontal metrics.
s = s.replace(
    """                <td className={cx(BODY_TD, 'text-center')}>
                  <span
                    className={cx(
                      'numeric mx-auto grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold transition-transform duration-300 group-hover:scale-110',
                      posCell(r.pos, total),
                    )}
                  >
                    {r.pos}
                  </span>
                </td>""",
    """                <td className={cx(BODY_TD, COLS[0].cls, 'text-center')}>
                  <span
                    className={cx(
                      'numeric mx-auto grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold transition-transform duration-300 group-hover:scale-110',
                      posCell(r.pos, total),
                    )}
                  >
                    {r.pos}
                  </span>
                </td>""",
)
s = s.replace(
    """                <td className={cx(BODY_TD, 'text-center')}>
                  <span className="numeric rounded-md bg-[var(--accent-tint)] px-2 py-1 text-sm font-bold text-[var(--accent-text)]">
                    {r.pts}
                  </span>
                </td>""",
    """                <td className={cx(BODY_TD, COLS[8].cls, 'text-center')}>
                  <span className="numeric rounded-md bg-[var(--accent-tint)] px-2 py-1 text-sm font-bold text-[var(--accent-text)]">
                    {r.pts}
                  </span>
                </td>""",
)

# 4. `mx-auto` on a 14px span inside a 56px cell centres it; the header button
#    already spans the full cell, so both resolve to the same centre.
p.write_text(s, encoding='utf-8')
print('StandingsTable alignment fixed')