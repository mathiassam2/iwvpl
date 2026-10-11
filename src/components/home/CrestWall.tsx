import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ButtonLink, Container, Section, SectionHead } from '@/components/ui'
import { siteData } from '@/data'
import { clubSlug, stripFlag } from '@/lib/format'

/** How much of the shared timeline the bottom-to-top cascade spans. */
const CASCADE_SPAN = 32
/** Each crest's own window, as a share of the timeline. */
const CREST_WINDOW = 20

/**
 * Per-crest timing and travel, so the wall rises from the bottom as a scatter
 * rather than arriving as a slab.
 *
 * THE DIRECTION HAD TO BE BUILT. Each crest originally carried its own
 * `animation-timeline: view()`, which reads as "animate while I am crossing
 * the viewport". That sounds bottom-up and is not: measured across the three
 * rows at a fixed scroll position, mean progress was row 1 **0.62**, row 2
 * 0.38, row 3 **0.21** - the top row ran furthest ahead, because a cell's
 * `cover` range has effectively been running longest by the time the cells
 * below it have finished entering. It arrived from the top and scattered from
 * there, which is the opposite of the wave that was asked for.
 *
 * So the crests share ONE timeline, declared on the wall, and the stagger is
 * derived from each crest's ROW instead of from its position in the viewport.
 * Bottom row opens its window at 0%, top row at the far end. Deterministic,
 * and it cannot invert itself when the viewport changes.
 *
 * WHICH ROW A CREST IS IN CANNOT BE ASKED IN CSS. `.crest-wall` is
 * `auto-fill`, so the column count is whatever the width allows and an
 * `nth-child` wave silently re-breaks on every resize. Hence the measurement
 * below: the resolved `grid-template-columns` gives the real track count, and
 * a ResizeObserver keeps it honest.
 *
 * Four axes of variance on top of the cascade, because variance has to come
 * from the gap between neighbours and the direction each one moves, not from
 * stretching the windows:
 *
 *  - A per-crest jitter of +/-4% on the start, so a row does not land as a
 *    single step.
 *  - HOW FAR it rises: 20-72px, so no two neighbours share a horizon line.
 *  - WHICH WAY it drifts sideways: +/-26px.
 *  - HOW IT IS TURNED AND SCALED on arrival: +/-2.4deg of tilt and a start
 *    scale of 0.84-0.96. These break the grid while it is in motion without
 *    leaving it mis-aligned once it settles - every one returns to exactly
 *    zero, so the resting wall is still a wall.
 *
 * Hashed from the club NAME, not its index, so the pattern is stable across
 * renders and does not reshuffle when the roster changes.
 *
 * Tilt is deliberately not applied to the resting state. A permanently
 * off-square grid of crests looks like a bug; one that settles square looks
 * intentional.
 */
function crestVars(name: string, row: number, rows: number): CSSProperties {
  // FNV-1a. Cheap, no allocation, and stable for a given string.
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  /** One independent draw per axis, so the axes do not correlate. */
  const draw = (shift: number, span: number) =>
    ((h >>> shift) >>> 0) / 0x100000000 * span

  // `depth` is 0 on the BOTTOM row and rows-1 on the top one, so the wave
  // travels upward. The step divides the cascade span across however many
  // rows there happen to be, which is what keeps the whole thing inside the
  // timeline on a phone where the wall is ten rows deep instead of three.
  const depth = rows - 1 - row
  const step = rows > 1 ? CASCADE_SPAN / (rows - 1) : 0
  const start = depth * step + (draw(0, 8) - 4)

  return {
    '--crest-start': `${Math.max(0, start).toFixed(1)}%`,
    '--crest-drift': `${(draw(7, 52) - 26).toFixed(1)}px`,
    '--crest-rise': `${(20 + draw(14, 52)).toFixed(1)}px`,
    '--crest-tilt': `${(draw(21, 4.8) - 2.4).toFixed(2)}deg`,
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
  const wallRef = useRef<HTMLUListElement>(null)
  const [cols, setCols] = useState(1)

  // The wall is `auto-fill`, so how many columns it resolves to is only knowable
  // from the used value. Reading it back is the difference between a cascade
  // that survives a resize and one that quietly turns into a random scatter
  // again at every width.
  useLayoutEffect(() => {
    const el = wallRef.current
    if (!el) return

    const measure = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns
      const n = tracks ? tracks.split(' ').filter(Boolean).length : 1
      setCols((prev) => (prev === n ? prev : n || 1))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!clubs.length) return null

  const rows = Math.max(1, Math.ceil(clubs.length / cols))

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

        <ul className="crest-wall" ref={wallRef}>
          {clubs.map((club, i) => (
            <li
              className="crest-wall__cell"
              style={crestVars(club.name, Math.floor(i / cols), rows)}
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