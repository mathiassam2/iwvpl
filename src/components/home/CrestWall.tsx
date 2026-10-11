import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ButtonLink, Container, Section, SectionHead } from '@/components/ui'
import { siteData } from '@/data'
import { clubSlug, stripFlag } from '@/lib/format'

/**
 * Per-crest timing and travel, so the wall arrives as a scatter rather than
 * as a slab.
 *
 * The wall used to carry `.sd-reveal`, which staggers five tiers only 4% of
 * the timeline apart while each crest animates for ~20% of it. Every crest in
 * a row therefore started at nearly the same scroll position and was still
 * mid-animation at the same moment, so the offsets cancelled out and the wall
 * moved as one block. Widening the tiers alone does not fix that - it just
 * smears the slab.
 *
 * Four independent axes of variance, because variance has to come from the
 * gaps and the directions, not from stretching the durations:
 *
 *  - WHEN it starts. Each crest's window is 22% wide and its START is
 *    scattered across the preceding 46%, so one crest is largely finished
 *    before the next begins. Widened from 24% to 46% on the request for
 *    variance: at 24% the wall still read as a band arriving, because a row
 *    of seven crest slots spans less travel than that once the column count
 *    and the gap are accounted for.
 *  - HOW FAR it rises. 20-72px, so no two neighbours share a horizon line.
 *  - WHICH WAY it drifts sideways. +/-26px.
 *  - HOW IT IS TURNED AND SCALED on arrival. +/-2.4deg of tilt and a start
 *    scale of 0.88. These are what break the grid while it is in motion
 *    without leaving the grid mis-aligned once it settles - every one of
 *    these returns to exactly zero, so the resting wall is still a wall.
 *
 * Hashed from the club NAME, not its position, so the pattern is stable
 * across renders and does not reshuffle when the roster changes. It is also
 * independent of the column count, which `.crest-wall` cannot know: it is
 * `auto-fill`, so an nth-child wave would silently re-break every time the
 * columns changed.
 *
 * Tilt is deliberately not applied to the resting state. A permanently
 * off-square grid of crests looks like a bug; a grid that settles crooked
 * and then squares up looks intentional.
 */
function crestVars(name: string): CSSProperties {
  // FNV-1a. Cheap, no allocation, and stable for a given string.
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  /** One independent draw per axis, so the axes do not correlate. */
  const draw = (shift: number, span: number) =>
    ((h >>> shift) >>> 0) / 0x100000000 * span

  const start = 2 + draw(0, 46)
  const drift = draw(7, 52) - 26
  const rise = 20 + draw(14, 52)
  const tilt = draw(21, 4.8) - 2.4

  return {
    '--crest-start': `${start.toFixed(1)}%`,
    '--crest-drift': `${drift.toFixed(1)}px`,
    '--crest-rise': `${rise.toFixed(1)}px`,
    '--crest-tilt': `${tilt.toFixed(2)}deg`,
    '--crest-pop': (0.84 + draw(28, 0.12)).toFixed(3),
  } as CSSProperties
}

/**
 * Every club in the roster, as a wall of crests.
 *
 * Crests only — no plate, no frame, no card. A container around a crest
 * at this size turns the whole wall into a grid of identical boxes and
 * the crests stop reading as crests. The arrival is choreographed per
 * crest by `crestVars` below rather than by a shared class.
 */
export function CrestWall() {
  const clubs = siteData.clubs

  if (!clubs.length) return null

  return (
    <Section tone="raised">
      <Container size="wide">
        <SectionHead
          eyebrow="The roster"
          title="Every club in the league"
          lede={
            clubs.length === 1
              ? 'One club entered this season.'
              : `${clubs.length} clubs entered this season, spread across ${siteData.divisions?.length ?? 0} divisions.`
          }
          action={
            <ButtonLink to="/clubs" variant="outline">
              Browse all
            </ButtonLink>
          }
        />

        <ul className="crest-wall">
          {clubs.map((club) => (
            <li
              className="crest-wall__cell"
              style={crestVars(club.name)}
              key={club.name}
            >
              <Link to={`/clubs/${clubSlug(club.name)}`} className="crest-wall__link">
                <img
                  src={club.logoLocal || undefined}
                  alt=""
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  className="crest-wall__img"
                />
                <span className="crest-wall__name">{stripFlag(club.name)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}