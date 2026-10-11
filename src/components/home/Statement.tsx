import { Container, Section } from '@/components/ui'

/**
 * A pause in the middle of the page.
 *
 * The line here was previously league statistics read straight out of
 * the data ("3 nations. 5 divisions. 37 clubs."). It read like a
 * dashboard rather than a statement, and it duplicated numbers the hero
 * already shows two sections earlier. This is brand copy instead.
 *
 * Animation is per WORD rather than per line: each word sits in its own
 * overflow clip and slides up out of it, offset a little further along
 * the scroll than the last, so the sentence assembles left to right as
 * it arrives. Still a pure CSS scroll timeline - see `.stmt*` in
 * styles/index.css. Nothing here is a link or a control, so it is
 * marked aria-hidden and the readable text is exposed once, in full.
 */

/** Trailing word is pulled out so it can carry the accent. */
const LINES: Array<Array<{ text: string; accent?: boolean }>> = [
  [{ text: 'No' }, { text: 'stadium.' }],
  [{ text: 'No' }, { text: 'excuses.' }],
  [{ text: 'Just' }, { text: 'the' }, { text: 'game.', accent: true }],
]

export function Statement() {
  return (
    <Section tone="deep" className="stmt-band">
      <Container size="wide">
        <p className="sr-only">No stadium. No excuses. Just the game.</p>

        <p className="stmt" aria-hidden="true">
          {LINES.map((line, li) => (
            <span className="stmt__line" key={li}>
              {line.map((word, wi) => (
                <span className="stmt__w" key={wi}>
                  <span className={word.accent ? 'stmt__in stmt__accent' : 'stmt__in'}>
                    {word.text}
                  </span>
                </span>
              ))}
            </span>
          ))}
        </p>
      </Container>
    </Section>
  )
}