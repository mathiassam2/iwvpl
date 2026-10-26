import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { asset } from '@/lib/assets'
import { CLUB_PLACEHOLDER, cx, clubSlug, isoToFlag, stripFlag } from '@/lib/format'
import {
  getLiveClubs,
  getLiveRegions,
  liveLeagueEnabled,
  peekLiveClubs,
  type HomepageRegion,
} from '@/lib/liveLeague'
import { siteData } from '@/data'
import type { Club } from '@/types/site'

/**
 * "The Island" — the centrepiece.
 *
 * A tall section with a sticky viewport; inside it a track that travels
 * sideways as the page scrolls down. Each nation gets the campaign key
 * art at its own drift depth, and the clubs registered to that region
 * underneath it.
 *
 * All of it is CSS scroll-driven (see `.rail*` in styles/index.css). No
 * scroll listener, no measurement, no inline styles.
 */

const DEFAULT_NATIONS: HomepageRegion[] = [
  {
    id: 1,
    iso: 'SG',
    flag: '🇸🇬',
    name: 'Singapore',
    art: '/assets/hero/sg-hero.webp',
    sortOrder: 0,
  },
  {
    id: 2,
    iso: 'MY',
    flag: '🇲🇾',
    name: 'Malaysia',
    art: '/assets/hero/my-hero.webp',
    sortOrder: 1,
  },
  {
    id: 3,
    iso: 'ID',
    flag: '🇮🇩',
    name: 'Indonesia',
    art: '/assets/hero/in-hero.webp',
    sortOrder: 2,
  },
]

const DIVISION = 'Premier League'

function CrestChip({ name, logo, code, clubLink }: { name: string; logo: string; code: string; clubLink: string }) {
  return (
    <li className="rail__chip">
      <Link to={`/clubs/${clubLink}`} className="rail__chip-link" title={name}>
        <img
          src={logo || CLUB_PLACEHOLDER}
          alt=""
          width={44}
          height={44}
          loading="lazy"
          decoding="async"
          className="rail__chip-img"
        />
        <span className="rail__chip-code">{code || stripFlag(name).slice(0, 3)}</span>
      </Link>
    </li>
  )
}

/** Normalize a flag or region string so clubs auto-match their region panel. */
function matchesRegion(clubFlag: string | undefined | null, region: HomepageRegion): boolean {
  const f = (clubFlag ?? '').trim()
  if (!f) return false
  const regionFlag = (region.flag ?? '').trim()
  const regionIso = (region.iso ?? '').trim().toUpperCase()
  const regionEmoji = isoToFlag(regionIso)
  const clubEmoji = f.length === 2 ? isoToFlag(f) : ''

  if (f === regionFlag) return true
  if (regionEmoji && (f === regionEmoji || clubEmoji === regionEmoji)) return true
  if (clubEmoji && clubEmoji === regionFlag) return true
  const lower = f.toLowerCase()
  return lower === regionIso.toLowerCase() || lower === (region.name ?? '').trim().toLowerCase()
}

export function IslandRail() {
  const [liveRegions, setLiveRegions] = useState<HomepageRegion[] | null>(null)
  const [liveClubs, setLiveClubs] = useState<Club[] | null>(() => peekLiveClubs())

  useEffect(() => {
    if (!liveLeagueEnabled) return
    const controller = new AbortController()
    getLiveRegions(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setLiveRegions(rows)
      })
      .catch(() => {})
    getLiveClubs(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setLiveClubs(rows)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const regions = liveRegions ?? DEFAULT_NATIONS

  /* Group registered clubs by nation/region. */
  const byNation = useMemo(() => {
    if (liveClubs) {
      const featuredOrAll = liveClubs.filter((c) => c.isFeatured !== false)
      return regions.map((r) => ({
        ...r,
        clubs: featuredOrAll
          .filter((c) => matchesRegion(c.flag, r))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => ({
            team: c.name,
            slug: c.slug || clubSlug(c.name),
            logo: c.logoLocal ? asset(c.logoLocal) : c.logo ? asset(c.logo) : CLUB_PLACEHOLDER,
            code: c.code || stripFlag(c.name).slice(0, 3).toUpperCase(),
          })),
      }))
    }

    const rows = siteData.standingsByDivision?.[DIVISION]?.rows ?? siteData.standings
    return regions.map((r) => ({
      ...r,
      clubs: rows
        .filter((row) => matchesRegion(row.flag, r))
        .map((row) => ({
          team: row.team,
          slug: clubSlug(row.team),
          logo: row.logo,
          code: row.code,
        })),
    }))
  }, [liveClubs, regions])

  if (byNation.length === 0) return null

  return (
    <section className="rail" aria-labelledby="island-heading">
      <h2 id="island-heading" className="sr-only">
        The nations of the Island-Wide Virtual Premier League
      </h2>

      <div className="rail__vp">
        <div className="rail__track">
          {byNation.map((n, i) => (
            <article
              key={`${n.iso}-${n.id}`}
              className={cx('rail__panel', `rail__panel--${n.iso.toLowerCase()}`)}
              aria-label={`${n.name} — ${n.clubs.length} registered ${n.clubs.length === 1 ? 'club' : 'clubs'}`}
            >
              <div className="rail__art">
                <img
                  src={asset(n.art)}
                  alt={`IWVPL campaign artwork — ${n.name}`}
                  className="rail__art-img"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </div>
              <div className="rail__scrim" />

              <div className="rail__body">
                <span className="rail__index" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="rail__flag">
                  <span aria-hidden="true">{n.flag}</span>
                  <span className="sr-only">{n.name}</span>
                </p>
                <h3 className="rail__name">{n.name}</h3>
                <p className="rail__meta">
                  {n.clubs.length} {n.clubs.length === 1 ? 'club' : 'clubs'} registered in {n.name}
                </p>

                <ul className="rail__clubs">
                  {n.clubs.map((c) => (
                    <CrestChip key={c.slug} name={c.team} logo={c.logo} code={c.code} clubLink={c.slug} />
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}