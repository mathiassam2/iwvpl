import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, Container, Reveal, Section, SectionHead } from '@/components/ui'
import { NewsThumb } from '@/components/home'
import { SITE, siteData } from '@/data'
import { formatDate } from '@/lib/format'

export default function NewsPage() {
  const [lead, ...rest] = siteData.news

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Insights"
        title="News"
        lede="Discover the latest news, upcoming features, and official announcements from the IWVPL admin team."
      />

      <Section>
        <Container size="wide">
          {/* lead article */}
          {lead && (
            <Reveal className="mb-14">
              <Link to={`/news/${lead.slug}`} className="group block">
                <Card interactive className="grid overflow-hidden lg:grid-cols-2">
                  <div className="relative aspect-[16/10] overflow-hidden bg-[var(--bg-deep)] lg:aspect-auto lg:min-h-[380px]">
                    <img
                      src={lead.featuredLocal}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-deep)]/80 to-transparent lg:bg-gradient-to-r" />
                    {lead.categories[0] && (
                      <span className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-lg ring-1 ring-white/15 backdrop-blur-sm">
                        {lead.categories[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
                    <h2 className="text-2xl font-bold leading-tight text-[var(--text-strong)] transition-colors group-hover:text-[var(--accent-text)] sm:text-3xl lg:text-[2.25rem]">
                      {lead.title}
                    </h2>
                    <p className="mt-4 line-clamp-4 text-base leading-relaxed text-[var(--text-muted)]">
                      {lead.excerpt}
                    </p>
                    <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                      {formatDate(lead.date)} · {SITE.name}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-text)]">
                      Read article
                      <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </span>
                  </div>
                </Card>
              </Link>
            </Reveal>
          )}

          <SectionHead eyebrow="All updates" title="More from the league" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((p, i) => (
              <Reveal key={p.id} delay={i * 80}>
                <Link to={`/news/${p.slug}`} className="group block h-full">
                  <Card as="article" interactive className="flex h-full flex-col overflow-hidden">
                    <NewsThumb post={p} />
                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                        {formatDate(p.date)}
                      </p>
                      <h3 className="mt-2.5 text-base font-bold leading-snug text-[var(--text-strong)] transition-colors group-hover:text-[var(--text-strong)] group-hover:text-[var(--accent-text)]">
                        {p.title}
                      </h3>
                      <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                        {p.excerpt}
                      </p>
                    </div>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>
    </div>
  )
}