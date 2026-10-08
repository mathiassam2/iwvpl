import { PageHeader } from '@/components/layout/PageHeader'
import {
  Accordion,
  Badge,
  ButtonLink,
  Card,
  Container,
  Reveal,
  Section,
  SectionHead,
  SmartImage,
} from '@/components/ui'
import { SITE, siteData } from '@/data'
import { communityFlag } from '@/lib/format'

export default function AboutPage() {
  const stats = [
    { k: String(siteData.clubs.length), v: 'Clubs registered' },
    { k: String(siteData.formats.length), v: 'Competition formats' },
    { k: '5', v: 'Pro Club divisions' },
    { k: '5', v: 'Countries' },
  ]

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="About us"
        title="About IWVPL"
        lede="An independent esports organisation built by passionate gamers, for the community."
      />

      <Section>
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div className="space-y-6">
              <div>
                <h2 className="mb-4 font-display text-xl font-bold text-[var(--text-strong)] sm:text-2xl">
                  {SITE.name}
                </h2>
                <p className="text-base leading-relaxed text-[var(--text-muted)]">
                  {siteData.about.intro}
                </p>
              </div>

              <blockquote className="surface rounded-card border-l-2 !border-l-[var(--accent)] p-6 sm:p-7">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                  Our vision is simple
                </p>
                <p className="mt-3 font-display text-xl font-semibold leading-snug text-[var(--text-strong)] sm:text-2xl">
                  {siteData.about.vision}
                </p>
              </blockquote>

              <div>
                <h3 className="mb-3 font-display text-lg font-bold text-[var(--text-strong)]">
                  We organise a variety of EA SPORTS FC competitions, including:
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {siteData.formats.map((f) => (
                    <li key={f.name} className="flex items-start gap-3 text-[15px] text-[var(--text-muted)]">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                      <span>
                        <span className="font-semibold text-[var(--text-strong)]">{f.name}</span>{' '}
                        ({f.tag})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-3 font-display text-lg font-bold text-[var(--text-strong)]">
                  Our primary communities are:
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {siteData.communities.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-hover)] px-3.5 py-1.5 text-sm font-semibold text-[var(--text)]"
                    >
                      <span aria-hidden>{communityFlag(c)}</span>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Card className="p-7 sm:p-8">
                <dl className="grid grid-cols-2 gap-6">
                  {stats.map((s) => (
                    <div key={s.v}>
                      <dt className="numeric text-4xl font-bold text-[var(--accent-text)]">
                        {s.k}
                      </dt>
                      <dd className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                        {s.v}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-8 border-t border-[var(--border)] pt-7">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    As we continue to grow, we warmly welcome
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {[
                      'New sponsors and business partners',
                      'Community feedback and ideas',
                      'Content creators and streamers',
                      'Volunteers who share our passion',
                    ].map((x) => (
                      <li key={x} className="flex items-start gap-3 text-sm text-[var(--text-muted)]">
                        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold-text)]" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </div>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-14">
            <Reveal>
              <div className="relative overflow-hidden rounded-card">
                <div data-parallax="0.16" className="parallax-layer">
                  <SmartImage
                    src="/assets/brand/player-hero.webp"
                    fallback="/assets/brand/banner-wide.webp"
                    alt="IWVPL player celebrating"
                    wrapperClassName="aspect-[4/5] w-full bg-[var(--bg-deep)]"
                    className="object-cover"
                  />
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--bg-deep)] via-transparent to-transparent" />
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div>
                <SectionHead eyebrow="Our promise" title="One Community. One Passion. One League." />
                <div className="space-y-5 text-base leading-relaxed text-[var(--text-muted)]">
                  <p>
                    Most importantly, we don&rsquo;t want IWVPL to feel like just another
                    organisation. We want it to feel like{' '}
                    <strong className="text-[var(--text-strong)]">family</strong>.
                  </p>
                  <p>
                    Every player, manager, streamer, sponsor, and supporter is an important part of
                    our journey. We&rsquo;ll celebrate your victories, help you through challenges,
                    and continue building a community where everyone feels welcome.
                  </p>
                  <p>
                    Whether you&rsquo;re competing on the virtual pitch or simply hanging out in our
                    Discord, our promise remains the same:{' '}
                    <span className="font-semibold text-[var(--text-strong)]">
                      IWVPL will always be here for you — both in the game and beyond it.
                    </span>
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink to="/register" size="lg">
                    Join the community
                  </ButtonLink>
                  <ButtonLink to="/contact" variant="outline" size="lg">
                    Contact us
                  </ButtonLink>
                </div>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>

      <Section tone="raised">
        <Container size="narrow">
          <SectionHead
            eyebrow="Questions"
            title="Frequently asked questions"
            lede="Everything you need to know before stepping onto the virtual pitch."
            align="center"
          />
          <Accordion items={siteData.about.faq} />
        </Container>
      </Section>

      <Section tone="deep">
        <Container size="wide">
          <SectionHead
            eyebrow="Formats"
            title="Choose your battlefield"
            action={
              <ButtonLink to="/standings" variant="outline">
                View standings
              </ButtonLink>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {siteData.formats.map((f) => (
              <Card key={f.name} as="article" interactive className="flex h-full flex-col p-6">
                <Badge tone={f.tag.toLowerCase().includes('soon') ? 'muted' : 'volt'}>
                  {f.tag}
                </Badge>
                <h3 className="mt-5 text-lg font-bold text-[var(--text-strong)]">{f.name}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">{f.desc}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>
    </div>
  )
}