import { Link, useParams } from 'react-router-dom'
import { Badge, ButtonLink, Card, Container, Section } from '@/components/ui'
import { SITE, siteData, findPost } from '@/data'
import { formatDate } from '@/lib/format'
import NotFoundPage from './NotFoundPage'

export default function NewsDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const post = findPost(slug)

  if (!post) return <NotFoundPage />

  const others = siteData.news.filter((p) => p.id !== post.id).slice(0, 3)

  // Preserve paragraph structure from the flattened body text.
  const paragraphs = post.body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 1)

  return (
    <div className="page-enter">
      {/* banner */}
      <div className="relative">
        <div className="relative h-[280px] overflow-hidden bg-ink-950 sm:h-[340px] lg:h-[420px]">
          <img
            src={post.featuredLocal}
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/70 to-ink-900/40" />
        </div>

        <Container size="narrow" className="relative -mt-40 pb-4 sm:-mt-48">
          <Link
            to="/news"
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M10 6H2M5 3L2 6l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            All news
          </Link>

          <div className="mb-5 flex flex-wrap items-center gap-2.5">
            {post.categories.map((c) => (
              <Badge key={c} tone="volt">
                {c}
              </Badge>
            ))}
          </div>

          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl lg:text-[2.75rem]">
            {post.title}
          </h1>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-[var(--text-faint)]">
            {formatDate(post.date)} · {SITE.name}
          </p>
        </Container>
      </div>

      <Section>
        <Container size="narrow">
          <article className="surface rounded-card p-7 sm:p-10">
            <div className="space-y-5">
              {paragraphs.map((para, i) => {
                const isHeading = para.length < 90 && !/[.!?]$/.test(para) && i > 0
                return isHeading ? (
                  <h2
                    key={i}
                    className="pt-4 text-xl font-bold text-[var(--text-strong)] sm:text-2xl"
                  >
                    {para}
                  </h2>
                ) : (
                  <p key={i} className="text-[15px] leading-relaxed text-muted sm:text-base">
                    {para}
                  </p>
                )
              })}
            </div>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-white/8 pt-8">
              {post.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]"
                >
                  #{t}
                </span>
              ))}
            </div>
          </article>

          {/* related */}
          {others.length > 0 && (
            <div className="mt-14">
              <h2 className="mb-6 text-xl font-bold text-[var(--text-strong)]">Keep reading</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {others.map((p) => (
                  <Link key={p.id} to={`/news/${p.slug}`} className="group block h-full">
                    <Card interactive className="flex h-full flex-col overflow-hidden">
                      <div className="aspect-[16/9] overflow-hidden bg-ink-950">
                        <img
                          src={p.featuredLocal}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                          {formatDate(p.date)}
                        </p>
                        <h3 className="mt-1.5 line-clamp-3 text-sm font-semibold leading-snug text-[var(--text-strong)] transition-colors group-hover:text-[var(--accent-text)]">
                          {p.title}
                        </h3>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-12 flex justify-center">
            <ButtonLink to="/register" size="lg">
              Join {SITE.shortName}
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </div>
  )
}