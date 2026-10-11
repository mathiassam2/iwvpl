import { Link } from 'react-router-dom'
import { ButtonLink, Container, Section, SectionHead } from '@/components/ui'
import { siteData } from '@/data'
import { clubSlug, stripFlag } from '@/lib/format'

/**
 * Every club in the roster, as a wall of crests.
 *
 * Crests only — no plate, no frame, no card. A container around a crest
 * at this size turns the whole wall into a grid of identical boxes and
 * the crests stop reading as crests.
 *
 * No per-crest logic. The wall used to carry a scatter — a bottom-up row
 * cascade with per-crest rise, drift, tilt and start scale, the stagger
 * derived from each crest's grid row and the column count measured back
 * off the resolved `grid-template-columns` with a ResizeObserver. All of
 * that lived here and measured correctly; it was still wrong for a grid of
 * thirty-seven identical marks, which spends most of its on-screen life
 * half-arrived. The arrival is now one eased fade of the whole wall, in
 * CSS, so this component is a list again.
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
            <li className="crest-wall__cell" key={club.name}>
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