import { Link } from 'react-router-dom'
import { ButtonLink, Container, Section, SectionHead } from '@/components/ui'
import { siteData } from '@/data'
import { clubSlug, stripFlag } from '@/lib/format'

/**
 * Every club in the roster, as a wall of crests.
 *
 * Crests only — no plate, no frame, no card. A container around a crest
 * at this size turns the whole wall into a grid of identical boxes and
 * the crests stop reading as crests. The stagger comes from
 * `.sd-reveal`, which walks its animation-range across five nth-child
 * tiers so the wall arrives as a sweep rather than a slab.
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
            <li className="sd-reveal" key={club.name}>
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