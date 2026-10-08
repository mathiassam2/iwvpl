import pathlib

p = pathlib.Path('src/components/league/index.tsx')
s = p.read_text(encoding='utf-8')

# Sortable header: the <th> carries no padding and the <button> supplies the
# identical px-3. Negative margins made the cell paint outside its own column.
old = """                    className={cx(HEAD_TH, 'py-0', c.cls, c.align)}
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
                    >"""
new = """                    className={cx(HEAD_TH, 'p-0', c.cls, c.align)}
                  >
                    {/* The <th> has no padding of its own; the button supplies
                        the exact same px-3 the body cells use, so the header box
                        and the data box are identical and can never drift. */}
                    <button
                      onClick={() => onSort(c.key!)}
                      className={cx(
                        'flex w-full items-center gap-1 px-3 py-3.5 transition-colors',
                        c.align === 'text-center' ? 'justify-center' : 'justify-start',
                        sort?.key === c.key
                          ? 'text-[var(--accent-text)]'
                          : 'text-[var(--text-faint)] hover:text-[var(--text)]',
                      )}
                    >"""
assert old in s
s = s.replace(old, new)

# Header vertical padding must match the body cells so rows share a height.
s = s.replace("const HEAD_TH = 'px-3 text-[10px] font-bold uppercase tracking-[0.14em]'",
              "const HEAD_TH = 'text-[10px] font-bold uppercase tracking-[0.14em]'")

p.write_text(s, encoding='utf-8')
print('header cells use exact box parity with body cells')