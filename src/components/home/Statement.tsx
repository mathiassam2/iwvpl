import { Container, Section } from '@/components/ui'
import { IwMark } from '@/components/home/IwMark'

/**
 * A pause in the middle of the page.
 *
 * The line here was previously league statistics read straight out of the
 * data ("3 nations. 5 divisions. 37 clubs."). It read like a dashboard
 * rather than a statement, and it duplicated numbers the hero already shows
 * two sections earlier. This is brand copy instead.
 *
 * Both halves are driven by ONE named timeline (`--stmt`) declared on the
 * section, which matters: the words are masked with `overflow: hidden`, and
 * any `overflow` other than `visible` makes an element a scroll container,
 * so a bare `view()` on a word or on the mark would resolve its scrollport
 * to that clip - which never scrolls - and freeze solid. A named timeline
 * carries its own scrollport with it. See `.stmt-band` in styles/index.css.
 *
 * The section is shorter than the viewport, so `contain` would be an
 * inverted (start-after-end) range here; every range is on `cover`.
 */
const LINES: Array<Array<{ text: string; accent?: boolean }>> = [
  [{ text: 'No' }, { text: 'stadium.' }],
  [{ text: 'No' }, { text: 'excuses.' }],
  [{ text: 'Just' }, { text: 'the' }, { text: 'game.', accent: true }],
]

export function Statement() {
  return (
    <Section tone="deep" className="stmt-band">
      <Container size="wide">
        <div className="stmt-layout">
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

          {/* Signature. Draws itself as the statement lands, on the same
              timeline, so the two read as one gesture rather than two
              unrelated animations. */}
          <IwMark className="iw-mark" />
        </div>
      </Container>
    </Section>
  )
}