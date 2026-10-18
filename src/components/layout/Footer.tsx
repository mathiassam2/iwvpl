import { Link } from 'react-router-dom'
import { Container, Reveal } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { asset } from '@/lib/assets'
import { communityFlag, cx } from '@/lib/format'

const ESSENTIAL = [
  { label: 'About Us', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Standings', href: '/standings' },
  { label: 'Results', href: '/results' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Clubs', href: '/clubs' },
  { label: 'Transfer', href: '/transfer' },
  { label: 'Entries', href: '/entries' },
  { label: 'Login', href: '/login' },
  { label: 'Register', href: '/register' },
]

const LEAGUES = [
  { label: 'Standings', href: '/standings' },
  { label: 'Results', href: '/results' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Clubs', href: '/clubs' },
  { label: 'Transfer', href: '/transfer' },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="relative border-t border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text)]">
      <Container size="wide" className="py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link to="/" className="inline-block" aria-label="IWVPL — home">
              <img
                src={asset('/assets/brand/iwvpl-wordmark.png')}
                alt="IWVPL"
                className="h-9 w-auto select-none object-contain transition-opacity hover:opacity-80 dark:invert"
              />
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
              {SITE.tagline}. An independent esports organisation uniting the EA SPORTS FC
              community across Southeast Asia.
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-faint)]">
              Based in {SITE.base}
            </p>
          </div>

          <nav aria-labelledby="f-leagues">
            <h3
              id="f-leagues"
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-faint)]"
            >
              League
            </h3>
            <ul className="flex flex-col gap-2.5">
              {LEAGUES.map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="f-essential">
            <h3
              id="f-essential"
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-faint)]"
            >
              Essential links
            </h3>
            <ul className="flex flex-col gap-2.5">
              {ESSENTIAL.map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-faint)]">
              Our community
            </h3>
            <ul className="mb-6 flex flex-wrap gap-2">
              {siteData.communities.map((c) => (
                <li key={c}>
                  <Reveal>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
                      <span aria-hidden>{communityFlag(c)}</span>
                      {c}
                    </span>
                  </Reveal>
                </li>
              ))}
            </ul>

            <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-faint)]">
              Get in touch
            </h3>
            <ul className="flex flex-col gap-2.5">
              {SITE.social.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
                  >
                    <span aria-hidden className={cx('h-1.5 w-1.5 rounded-full bg-[var(--accent)]')} />
                    {s.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${SITE.email}`}
                  className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
                >
                  {SITE.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-[var(--border)] pt-7 md:flex-row md:items-start md:justify-between">
          <p className="max-w-3xl text-xs leading-relaxed text-[var(--text-faint)]">
            {SITE.disclaimer}
          </p>
          <p className="shrink-0 text-xs text-[var(--text-faint)]">
            © {year} {SITE.name}. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  )
}