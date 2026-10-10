import { useMemo } from 'react'
import { Container, Section } from '@/components/ui'
import { siteData } from '@/data'

/**
 * A pause in the middle of the page.
 *
 * Three lines of display type, each masked by an overflow clip and slid
 * up out of it as it scrolls into view — the standard editorial reveal,
 * done with a CSS scroll timeline instead of an observer.
 *
 * The numbers are read from the data rather than typed in, so the copy
 * cannot drift away from the league. Nation count is the number of
 * distinct flags that actually appear in the table, not an assumption.
 */

export function Statement() {
  const { nations, divisions, clubs } = useMemo(
    () => ({
      nations: new Set(siteData.standings.map((r) => r.flag).filter(Boolean)).size,
      divisions: siteData.divisions?.length ?? 0,
      clubs: siteData.clubs.length,
    }),
    [],
  )

  const lines = [`${nations} nations.`, `${divisions} divisions.`, `${clubs} clubs, one table.`]

  return (
    <Section tone="deep" className="stmt-band">
      <Container size="wide">
        <p className="stmt">
          {lines.map((line, i) => (
            /* Index is stable across renders, and the lines never
               reorder, so this key is safe. */
            <span className="stmt__line" key={i}>
              <span className="stmt__in">
                {i === lines.length - 1 ? (
                  <>
                    {clubs} clubs,{' '}
                    <em className="stmt__accent">one table.</em>
                  </>
                ) : (
                  line
                )}
              </span>
            </span>
          ))}
        </p>
      </Container>
    </Section>
  )
}