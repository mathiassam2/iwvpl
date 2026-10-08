import pathlib

p = pathlib.Path('src/components/league/index.tsx')
s = p.read_text(encoding='utf-8')

start = s.index('              {COLS.map((c) =>')
end = s.index('              <th\n                scope="col"\n                className={cx(\n                  HEAD_TH,\n                  BODY_TD,\n                  \'py-3.5\',\n                  FORM_COL.cls,')

new = """              {COLS.map((c) => {
                const isSorted = c.key != null && sort?.key === c.key
                const sortable = Boolean(c.key && onSort)
                const label = (
                  <>
                    {c.label}
                    {isSorted && (
                      <span aria-hidden className="text-[8px] leading-none">
                        {sort.desc ? '\\u25bc' : '\\u25b2'}
                      </span>
                    )}
                  </>
                )
                const tone = isSorted
                  ? 'text-[var(--accent-text)]'
                  : 'text-[var(--text-faint)]'

                if (!sortable) {
                  return (
                    <th
                      key={c.label}
                      scope="col"
                      className={cx(HEAD_TH, BODY_TD, 'py-3.5', c.cls, c.align, tone)}
                    >
                      {c.label}
                    </th>
                  )
                }

                // The <th> itself is the control. An inner <button> changes the
                // cell's box model and pulls the header out of alignment with
                // the body row, so the sort affordance lives on the cell.
                return (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={
                      isSorted ? (sort.desc ? 'descending' : 'ascending') : 'none'
                    }
                    onClick={() => onSort(c.key!)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSort(c.key!)
                      }
                    }}
                    tabIndex={0}
                    title={`Sort by ${c.label}`}
                    className={cx(
                      HEAD_TH,
                      BODY_TD,
                      'py-3.5 cursor-pointer select-none transition-colors hover:text-[var(--text)]',
                      c.cls,
                      c.align,
                      tone,
                    )}
                  >
                    <span className="inline-flex items-center gap-1">{label}</span>
                  </th>
                )
              })}
"""

s = s[:start] + new + s[end:]
p.write_text(s, encoding='utf-8')
print('header cells are now the sort control')