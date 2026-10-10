import { useMemo } from 'react'
import { siteData } from '@/data'
import { CLUB_PLACEHOLDER, stripFlag } from '@/lib/format'

/**
 * Live results ticker.
 *
 * An infinite marquee of real scorelines. It runs straight after the hero,
 * which is deliberate: the second thing a visitor meets is league data
 * moving, not a pitch about the league.
 *
 * The list is rendered twice — the second copy is aria-hidden — because a
 * seamless loop has to wrap at exactly half the track width. See
 * `.marquee*` in styles/index.css; the motion is pure CSS.
 */

/** Club suffixes that carry no information in an abbreviation. */
const NOISE = new Set(['FC', 'VFC', 'THE', 'CF', 'SC', 'AC'])

/**
 * Short code for a club name.
 *
 * The table already carries proper codes (KKV, TRB, RV) and those are used
 * wherever we can. The fallback matters more than it looks: a naive
 * slice(0, 3) renders "THE ROYAL BLOOD VFC" as "THE", which is not an
 * abbreviation of anything. So drop the club suffixes, then take
 * initials — or if that leaves too little, fall back to a truncated word.
 */
function fallbackCode(name: string): string {
  const words = stripFlag(name).split(/[\s-]+/).filter(Boolean)
  const meaningful = words.filter((w) => !NOISE.has(w.toUpperCase()))
  const pool = meaningful.length ? meaningful : words
  if (pool.length >= 2) return pool.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
  if (pool.length === 1) return pool[0].slice(0, 3).toUpperCase()
  return '—'
}

function Crest({ logo, alt }: { logo?: string; alt: string }) {
  return (
    <img
      src={logo || CLUB_PLACEHOLDER}
      alt=""
      width={22}
      height={22}
      decoding="async"
      className="marquee__crest"
    />
  )
}

export function Scroller() {
  const { items, codeOf } = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of siteData.standings) {
      if (row.code) map.set(row.team, row.code)
    }
    const rows = siteData.results.slice(0, 26)
    return {
      codeOf: (name: string) => map.get(name) || fallbackCode(name),
      items: rows.map((m, i) => ({
        key: `${m.url}-${i}`,
        home: m.home,
        away: m.away,
        hs: m.hs,
        as: m.as,
        homeLogo: m.homeLogo,
        awayLogo: m.awayLogo,
      })),
    }
  }, [])

  if (!items.length) return null

  const group = (hidden?: boolean) => (
    <div className="marquee__group" aria-hidden={hidden || undefined}>
      {items.map((m) => (
        <span className="marquee__item" key={m.key}>
          <Crest logo={m.homeLogo} alt={m.home} />
          <span className="marquee__code">{codeOf(m.home)}</span>
          <span className="marquee__score">
            {m.hs} – {m.as}
          </span>
          <span className="marquee__code">{codeOf(m.away)}</span>
          <Crest logo={m.awayLogo} alt={m.away} />
          <span className="marquee__sep" />
        </span>
      ))}
    </div>
  )

  return (
    <section className="marquee" aria-label="Latest match results">
      <div className="marquee__track">
        {group()}
        {group(true)}
      </div>
    </section>
  )
}