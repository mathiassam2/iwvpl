import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, ButtonLink, Card, Container, Section, SectionHead } from '@/components/ui'
import { siteData, useSiteContentVersion } from '@/data'
import { useAuth } from '@/lib/auth'
import { useCart } from '@/lib/cart'

const SECTIONS = ['Registration Fee', 'Merchandise'] as const
type ShopSection = (typeof SECTIONS)[number]

function sectionFor(category: string | undefined): ShopSection {
  return category === 'Merchandise' ? 'Merchandise' : 'Registration Fee'
}

export default function ShopPage() {
  // Subscribe to the live CMS so products added in admin appear without a reload.
  const contentVersion = useSiteContentVersion()
  const { add, has, openPanel, count } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [section, setSection] = useState<ShopSection>('Registration Fee')

  const products = useMemo(
    () => siteData.products.filter((p) => sectionFor(p.category) === section),
    [section, contentVersion],
  )

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="IWVPL Shop"
        title="Registration fees & merchandise"
        lede="Pay your league registration or pick up official IWVPL merchandise. Registration purchases are processed by the admin team within 24–48 hours."
      />

      <Section>
        <Container size="wide">
          <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Shop sections">
              {SECTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={section === item}
                  onClick={() => setSection(item)}
                  className={
                    section === item
                      ? 'rounded-full bg-[var(--accent-solid)] px-4 py-2 text-sm font-bold text-[var(--on-volt)]'
                      : 'rounded-full border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]'
                  }
                >
                  {item}
                </button>
              ))}
            </div>
            <ButtonLink to="/cart" variant="outline" size="sm">
              View cart{count > 0 ? ` (${count})` : ''}
            </ButtonLink>
          </div>

          <div className="mt-8">
            <SectionHead
              eyebrow={section}
              title={section === 'Merchandise' ? 'Official IWVPL gear' : 'League registration'}
            />
            {products.length === 0 ? (
              <div className="mt-6 rounded-card border border-dashed border-[var(--border-strong)] px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold text-[var(--text-strong)]">
                  Nothing here yet
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
                  {section === 'Merchandise'
                    ? 'Merchandise will appear here as soon as the league office adds it in the admin shop.'
                    : 'Registration products will appear here once they are published.'}
                </p>
              </div>
            ) : (
              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => {
                  const inCart = has(product.slug)
                  return (
                    <li key={product.slug}>
                      <Card className="flex h-full flex-col overflow-hidden p-0">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-44 w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-44 place-items-center bg-[var(--surface-2)] text-sm text-[var(--text-faint)]">
                            IWVPL
                          </div>
                        )}
                        <div className="flex flex-1 flex-col p-6">
                          <div className="flex items-center justify-between gap-3">
                            <Badge tone="neutral">{product.kicker || section}</Badge>
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                              {section}
                            </span>
                          </div>
                          <h3 className="mt-3 font-display text-lg font-bold leading-snug text-[var(--text-strong)]">
                            {product.name}
                          </h3>
                          <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                            {product.summary}
                          </p>
                          {product.validFor && (
                            <p className="mt-4 text-xs text-[var(--text-faint)]">
                              <span className="font-semibold text-[var(--text-muted)]">Includes:</span>{' '}
                              {product.validFor}
                            </p>
                          )}
                          <div className="mt-6 flex items-center justify-between gap-3">
                            <span className="numeric text-xl font-bold text-[var(--accent-text)]">
                              {product.price}
                            </span>
                            {user?.role === 'player' && section === 'Registration Fee' ? (
                              <span className="text-[12px] font-semibold text-[var(--text-faint)]">
                                Managers only
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant={inCart ? 'outline' : 'primary'}
                                onClick={() => {
                                  add(product.slug)
                                  if (user) openPanel()
                                  else navigate('/cart')
                                }}
                              >
                                {inCart ? 'Add another' : 'Add to cart'}
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Container>
      </Section>
    </div>
  )
}
