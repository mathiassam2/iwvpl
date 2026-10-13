/**
 * Entry passes.
 *
 * Moved off the registration form, where it was a sidebar beside the club
 * fields. Three reasons it did not belong there:
 *
 *   1. The form is the signup. A price list next to it reads as part of signing
 *      up, so someone could reasonably believe the fee is charged by submitting.
 *   2. It only ever applied to club entries, so it had to be hidden for players
 *      anyway — a permanent blank column for half the people who use the page.
 *   3. The cart is two clicks from anywhere, but the passes were only reachable
 *      from a form you were halfway through.
 *
 * Buying an entry and creating the account are separate steps on purpose. The
 * account is created the moment the form is submitted; the entry pass is what
 * the admin team processes afterwards.
 */

import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, ButtonLink, Card, Container, Section, SectionHead } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { useCart } from '@/lib/cart'

export default function EntriesPage() {
  const { add, has, openPanel } = useCart()

  const activeClubs = siteData.clubs.filter((c) => c.status === 'Active').length
  const slotsLeft = SITE.teamCap - SITE.teamsRegistered

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={`${SITE.season} entries`}
        title="Choose your entry pass"
        lede={`${SITE.teamsRegistered} of ${SITE.teamCap} team slots filled at ${SITE.registrationFee} per team. Your purchase does not finalise registration — allow 24 to 48 hours for the admin team to process it.`}
      />

      <Section>
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:gap-12">
            {/* ---------------------------------------------- passes ------------ */}
            <div>
              <SectionHead eyebrow="Available entries" title="What is on offer" />
              <ul className="grid gap-6 sm:grid-cols-2">
                {siteData.products.map((p) => (
                  <li key={p.slug}>
                    <Card className="flex h-full flex-col overflow-hidden p-0">
                      <img
                        src={p.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-36 w-full object-cover"
                      />
                      <div className="flex flex-1 flex-col p-6">
                        <Badge tone="neutral">{p.kicker}</Badge>
                        <h3 className="mt-2.5 font-display text-base font-bold leading-snug text-[var(--text-strong)]">
                          {p.name}
                        </h3>
                        <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                          {p.summary}
                        </p>
                        <div className="mt-6 flex items-center justify-between gap-3">
                          <span className="numeric text-xl font-bold text-[var(--accent-text)]">
                            {p.price}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (!has(p.slug)) add(p.slug)
                              openPanel()
                            }}
                          >
                            {has(p.slug) ? 'In cart' : 'Add to cart'}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <ButtonLink to="/cart" variant="outline">
                  Go to cart
                </ButtonLink>
              </div>
            </div>

            {/* ---------------------------------------------- aside ------------- */}
            <aside className="space-y-6">
              <Card className="p-6">
                <h3 className="font-display text-base font-bold text-[var(--text-strong)]">
                  Season snapshot
                </h3>
                <dl className="mt-4 space-y-3">
                  {[
                    ['Team cap', `${SITE.teamCap} clubs`],
                    ['Registered', `${SITE.teamsRegistered} clubs`],
                    ['Slots left', `${slotsLeft} clubs`],
                    ['Active rosters', `${activeClubs} clubs`],
                    ['Entry fee', SITE.registrationFee],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0"
                    >
                      <dt className="text-sm text-[var(--text-muted)]">{k}</dt>
                      <dd className="numeric text-sm font-bold text-[var(--text-strong)]">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card className="border-[var(--badge-gold-bg)] bg-[var(--badge-gold-bg)] p-6">
                <h3 className="flex items-center gap-2 font-display text-base font-bold text-[var(--badge-gold-fg)]">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M10 6v5M10 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Confirmation note
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  Your purchase does not immediately finalise registration. Please allow
                  24&ndash;48 hours for our admin team to process your entry. You will receive a
                  confirmation email containing your team submission forms.
                </p>
                <ButtonLink to="/register" className="mt-4 !text-sm !font-semibold !underline !underline-offset-4">
                  Register your club
                </ButtonLink>
              </Card>
            </aside>
          </div>
        </Container>
      </Section>
    </div>
  )
}