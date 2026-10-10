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
      {/* ---------- banner ----------
          Full-bleed artwork under a heavy scrim. The previous overlay used
          Tailwind's `ink-950` palette, which no longer exists after the move to
          semantic theme tokens - the class generated no CSS at all, so the
          headline, badges and date sat on raw artwork and went unreadable
          whenever the frame was bright. `.banner-scrim` is a real gradient with
          a floor high enough that white type clears WCAG on any image. */}
      <div className="relative -mt-16 lg:-mt-[72px]">
        <div className="relative h-[380px] overflow-hidden sm:h-[440px] lg:h-[520px]">
          {/* Slightly scaled so the scrim's blur-free edges never show a seam. */}
          <img
            src={post.featuredLocal}
            alt=""
            className="h-full w-full scale-105 object-cover object-center"
            decoding="async"
          />
          <div className="banner-scrim absolute inset-0" />
          {/* The bar overlaps the top of the frame, so the header needs its own
              local darkening to stay legible against a pale top edge. */}
          <div className="banner-scrim-top absolute inset-x-0 top-0 h-28" />

          {/* Copy sits inside the banner, anchored to its foot, so the image
              reads as a backdrop rather than as a tile the text straddles. */}
          <Container size="narrow" className="absolute inset-x-0 bottom-0 pb-8 sm:pb-10">
            <Link
              to="/news"
              className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M10 6H2M5 3L2 6l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              All news
            </Link>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              {post.categories.map((c) => (
                <Badge key={c} tone="volt">
                  {c}
                </Badge>
              ))}
            </div>

            <h1 className="max-w-3xl text-3xl font-extrabold leading-[1.08] text-white sm:text-4xl lg:text-[2.6rem]">
              {post.title}
            </h1>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-white/70">
              {formatDate(post.date)} · {SITE.name}
            </p>
          </Container>
        </div>
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
                    className="border-l-2 border-[var(--accent-solid)] pl-4 pt-4 text-xl font-bold text-[var(--text-strong)] sm:text-2xl"
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
              <div className="mb-6 flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-bold text-[var(--text-strong)]">Keep reading</h2>
                <Link
                  to="/news"
                  className="text-sm font-semibold text-[var(--accent-text)] transition-opacity hover:opacity-70"
                >
                  All news
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {others.map((p) => (
                  <Link key={p.id} to={`/news/${p.slug}`} className="group block h-full">
                    <Card interactive className="flex h-full flex-col overflow-hidden">
                      <div className="relative aspect-[16/9] overflow-hidden bg-[rgb(var(--banner-ink))]">
                        <img
                          src={p.featuredLocal}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        {/* Same wash on the thumbnails, to seat them on the card. */}
                        <div className="banner-scrim-thumb absolute inset-0" />
                      </div>
                      <div className="flex flex-1 flex-col p-4">
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