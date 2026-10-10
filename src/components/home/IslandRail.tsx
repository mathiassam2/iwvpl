import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { asset } from '@/lib/assets'
import { cx, clubSlug, stripFlag } from '@/lib/format'
import { siteData } from '@/data'

/**
 * "The Island" — the centrepiece.
 *
 * A tall section with a sticky viewport; inside it a track that travels
 * sideways as the page scrolls down. Each nation gets the campaign key
 * art at its own drift depth, and the clubs that nation actually has in
 * the Premier League table underneath it.
 *
 * All of it is CSS scroll-driven (see `.rail*` in styles/index.css). No
 * scroll listener, no measurement, no inline styles.
 *
 * Counts are deliberately precise: the table has 18 clubs split 10/6/2
 * across MY/SG/ID, while the wider roster in `siteData.clubs` has 37.
 * Those are different numbers about different things, so they are
 * labelled as such rather than blended into one tidy-looking "28 clubs".
 */

type Nation = {
  iso: string
  flag: string
  name: string
  art: string
  /** Mobile-only horizontal anchor, same convention as the hero. */
  focus: string
}

const NATIONS: Nation[] = [
  {
    iso: 'SG',
    flag: '🇸🇬',
    name: 'Singapore',
    art: '/assets/hero/sg-hero.webp',
    focus: 'hero-focus-sg',
  },
  {
    iso: 'MY',
    flag: '🇲🇾',
    name: 'Malaysia',
    art: '/assets/hero/my-hero.webp',
    focus: 'hero-focus-my',
  },
  {
    iso: 'ID',
    flag: '🇮🇩',
    name: 'Indonesia',
    art: '/assets/hero/in-hero.webp',
    focus: 'hero-focus-in',
  },
]

/** The one division with a real table. */
const DIVISION = 'Premier League'

function CrestChip({ name, logo, code }: { name: string; logo: string; code: string }) {
  return (
    <li className="rail__chip">
      <Link to={`/clubs/${slug(name)}`} className="rail__chip-link" title={name}>
        <img
          src={logo}
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

/** Slug helper, aliased so the chip below reads tersely. */
function slug(name: string): string {
  return clubSlug(name)
}

export function IslandRail() {
  /* Group the real table by nation. Order follows NATIONS, not the data. */
  const byNation = useMemo(() => {
    const rows = siteData.standingsByDivision?.[DIVISION]?.rows ?? siteData.standings
    return NATIONS.map((n) => ({
      ...n,
      clubs: rows.filter((r) => r.flag === n.flag),
    }))
  }, [])

  const rosterSize = siteData.clubs.length
  const divisions = siteData.divisions?.length ?? 0

  return (
    <section className="rail" aria-labelledby="island-heading">
      <h2 id="island-heading" className="sr-only">
        The three nations of the Island-Wide Virtual Premier League
      </h2>

      <div className="rail__vp">
        <div className="rail__track">
          {byNation.map((n, i) => (
            <article
              key={n.iso}
              className={cx('rail__panel', i === 0 && 'rail__panel--full')}
              aria-label={`${n.name} — ${n.clubs.length} clubs in the ${DIVISION} table`}
            >
              <div className="rail__art">
                <img
                  src={asset(n.art)}
                  alt={`IWVPL campaign artwork — ${n.name}`}
                  className={cx('rail__art-img', n.focus)}
                  /* First panel is adjacent to the fold, so it is not
                     deferred; the rest have time to arrive as you scroll. */
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
                  {n.clubs.length} {n.clubs.length === 1 ? 'club' : 'clubs'} in the {DIVISION} table
                </p>

                <ul className="rail__clubs">
                  {n.clubs.map((c) => (
                    <CrestChip key={c.team} name={c.team} logo={c.logo} code={c.code} />
                  ))}
                </ul>
              </div>
            </article>
          ))}

          {/* Closer. Ends the run and hands off to the full roster. */}
          <article className="rail__panel rail__panel--closer" aria-labelledby="rail-closer">
            <div className="rail__art">
              <img
                src={asset('/assets/brand/banner-wide.webp')}
                alt=""
                className="rail__art-img rail-focus-sg"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="rail__scrim" />
            <div className="rail__body">
              <span className="rail__index" aria-hidden="true">
                →
              </span>
              <h3 id="rail-closer" className="rail__name">
                One island. One table.
              </h3>
              <p className="rail__meta">
                {rosterSize} clubs entered across {divisions} divisions.
              </p>
              <Link to="/clubs" className="rail__cta">
                Meet the clubs
                <span aria-hidden="true" className="rail__cta-arrow">
                  →
                </span>
              </Link>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}