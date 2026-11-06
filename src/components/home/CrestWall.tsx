import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ButtonLink, Container, Section, SectionHead } from '@/components/ui'
import { siteData } from '@/data'
import { asset } from '@/lib/assets'
import { CLUB_PLACEHOLDER, clubSlug, stripFlag } from '@/lib/format'
import {
  getLiveClubs,
  getLiveDivisions,
  liveLeagueEnabled,
  peekLiveClubs,
  peekLiveDivisions,
  type LiveDivision,
} from '@/lib/liveLeague'
import type { Club } from '@/types/site'

/**
 * Every club in the roster, as a wall of crests.
 *
 * Crests only — no plate, no frame, no card. A container around a crest
 * at this size turns the whole wall into a grid of identical boxes and
 * the crests stop reading as crests.
 */
export function CrestWall() {
  const [liveClubs, setLiveClubs] = useState<Club[] | null>(() => peekLiveClubs())
  const [liveDivisions, setLiveDivisions] = useState<LiveDivision[] | null>(() => peekLiveDivisions())

  useEffect(() => {
    if (!liveLeagueEnabled) return
    const controller = new AbortController()
    getLiveClubs(controller.signal)
      .then(setLiveClubs)
      .catch(() => {})
    getLiveDivisions(controller.signal)
      .then(setLiveDivisions)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const clubs = useMemo(() => {
    const source = liveClubs ?? siteData.clubs
    return source.filter((club) => club.isFeatured !== false)
  }, [liveClubs])

  const divisionCount = liveDivisions ? liveDivisions.length : (siteData.divisions?.length ?? 0)

  if (!clubs.length) return null

  return (
    <Section tone="raised">
      <Container size="wide">
        <SectionHead
          eyebrow="The roster"
          title="Every club in the league"
          lede={
            clubs.length === 1
              ? 'One club featured this season.'
              : `${clubs.length} clubs entered this season, spread across ${divisionCount} ${divisionCount === 1 ? 'division' : 'divisions'}.`
          }
          action={
            <ButtonLink to="/clubs" variant="outline">
              Browse all
            </ButtonLink>
          }
        />

        <ul className="crest-wall">
          {clubs.map((club) => {
            const slug = club.slug || clubSlug(club.name)
            const logoSrc = club.logoLocal ? asset(club.logoLocal) : club.logo || CLUB_PLACEHOLDER
            return (
              <li className="crest-wall__cell" key={slug}>
                <Link to={`/clubs/${slug}`} className="crest-wall__link">
                  <img
                    src={logoSrc}
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
            )
          })}
        </ul>
      </Container>
    </Section>
  )
}
