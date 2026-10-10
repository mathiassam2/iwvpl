import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button, ButtonLink, Container, EmptyState, Eyebrow, Section } from '@/components/ui'
import { HeaderWash } from '@/components/layout/HeaderWash'
import { useCart } from '@/lib/cart'
import { SITE } from '@/data'
import { cx } from '@/lib/format'

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Side cart, mirroring the original site's header cart: a slide-over panel
 * listing the entries, reachable from the header at any width.
 */
export function CartPanel() {
  const { detailed, count, total, canTotal, panelOpen, closePanel, setQty, remove, clear } = useCart()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!panelOpen) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panelOpen, closePanel])

  return (
    <>
      {/* scrim */}
      <div
        aria-hidden
        onClick={closePanel}
        className={cx(
          'fixed inset-0 z-[70] bg-black/60 transition-opacity duration-300',
          panelOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={cx(
          'fixed inset-y-0 right-0 z-[75] flex w-full max-w-[26rem] flex-col',
          'border-l border-[var(--border-strong)] bg-[var(--bg-raised)] shadow-[var(--shadow-lift)]',
          'transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]',
          panelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[var(--text-strong)]">
            Cart{' '}
            <span className="numeric text-sm font-semibold text-[var(--text-muted)]">
              ({count})
            </span>
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={closePanel}
            aria-label="Close cart"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border-strong)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {detailed.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                Your cart is empty. Add a registration to get started.
              </p>
              <ButtonLink to="/register" variant="outline" className="mt-5">
                Back to registration
              </ButtonLink>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {detailed.map(({ product, qty }) => (
                <li key={product.slug} className="px-5 py-4">
                  <div className="flex gap-3.5">
                    <img
                      src={product.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                        {product.kicker}
                      </p>
                      <p className="mt-1 text-sm font-semibold leading-snug text-[var(--text-strong)]">
                        {product.name}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">
                        {product.price}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 rounded-lg border border-[var(--border-strong)]">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${product.name}`}
                        onClick={() => setQty(product.slug, qty - 1)}
                        className="grid h-8 w-8 place-items-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
                      >
                        &minus;
                      </button>
                      <span className="numeric w-7 text-center text-sm font-semibold text-[var(--text-strong)]">
                        {qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${product.name}`}
                        onClick={() => setQty(product.slug, qty + 1)}
                        className="grid h-8 w-8 place-items-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(product.slug)}
                      className="text-xs font-semibold text-[var(--text-faint)] underline-offset-4 transition-colors hover:text-[var(--danger-text)] hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-4">
          {detailed.length > 0 && (
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text-muted)]">Total</span>
              <span className="numeric text-xl font-bold text-[var(--text-strong)]">
                {canTotal ? total : 'See checkout'}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <ButtonLink to="/cart" onClick={closePanel} className="w-full">
              Go to checkout
            </ButtonLink>
            <Button variant="ghost" onClick={clear} className="w-full">
              Clear cart
            </Button>
          </div>
        </footer>
      </aside>
    </>
  )
}

/** Full-page cart, mirroring the WooCommerce checkout layout. */
export function CartView() {
  const { detailed, count, total, canTotal, setQty, remove, clear } = useCart()
  return (
    /* Header overlap, same treatment as PageHeader and the club/match bands.
       Without it the bar sits on a flat `--bg` fill and reads as a solid strip. */
    <Section className="-mt-16 overflow-hidden pt-16 lg:-mt-[72px] lg:pt-[72px]">
      <HeaderWash />
      <Container size="narrow" className="pt-4">
        <Eyebrow className="mb-4">Checkout</Eyebrow>
        <h1 className="text-4xl font-extrabold sm:text-5xl">Your cart</h1>
        <p className="mt-4 max-w-xl text-[var(--text-muted)]">
          Reserve your league entry. Payment and finalisation are confirmed by our
          team within 24&ndash;48 hours.
        </p>

        {detailed.length === 0 ? (
          <>
            <EmptyState
              className="mt-12"
              title="Your cart is empty"
              hint="Add a registration to reserve your team's spot in the season."
            />
            <div className="mt-6 flex justify-center">
              <ButtonLink to="/register" size="lg">
                Back to registration
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <ul className="surface mt-10 divide-y divide-[var(--border)] overflow-hidden rounded-card">
              {detailed.map(({ product, qty }) => (
                <li key={product.slug} className="flex flex-wrap items-start gap-5 p-5 sm:p-6">
                  <img
                    src={product.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-24 w-24 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                      {product.kicker}
                    </p>
                    <h2 className="mt-1.5 text-lg font-bold text-[var(--text-strong)]">
                      {product.name}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                      {product.summary}
                    </p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex items-center gap-1 rounded-lg border border-[var(--border-strong)]">
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${product.name}`}
                          onClick={() => setQty(product.slug, qty - 1)}
                          className="grid h-9 w-9 place-items-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
                        >
                          &minus;
                        </button>
                        <span className="numeric w-8 text-center text-sm font-semibold text-[var(--text-strong)]">
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase quantity of ${product.name}`}
                          onClick={() => setQty(product.slug, qty + 1)}
                          className="grid h-9 w-9 place-items-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(product.slug)}
                        className="text-xs font-semibold text-[var(--text-faint)] underline-offset-4 transition-colors hover:text-[var(--danger-text)] hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="numeric shrink-0 text-right text-lg font-bold text-[var(--text-strong)]">
                    {product.price}
                  </p>
                </li>
              ))}
            </ul>

            <div className="surface mt-6 rounded-card p-5 sm:p-6">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                <span className="text-sm font-semibold text-[var(--text-muted)]">
                  Items ({count})
                </span>
                <span className="numeric text-sm text-[var(--text)]">
                  {canTotal ? total : 'Confirmed at checkout'}
                </span>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={() => undefined}>
                  Proceed to payment
                </Button>
                <Button variant="outline" size="lg" onClick={clear}>
                  Clear cart
                </Button>
              </div>

              <p className="mt-5 text-xs leading-relaxed text-[var(--text-faint)]">
                Checkout is handled by our team. Once your order is placed we will
                email you at{' '}
                <a
                  href={`mailto:${SITE.email}`}
                  className="font-semibold text-[var(--accent-text)] hover:underline"
                >
                  {SITE.email}
                </a>{' '}
                with your submission forms within 24&ndash;48 hours.
              </p>

              <p className="mt-4 border-t border-[var(--border)] pt-4 text-sm text-[var(--text-muted)]">
                Questions?{' '}
                <Link to="/contact" className="font-semibold text-[var(--accent-text)] hover:underline">
                  Contact the league
                </Link>
              </p>
            </div>
          </>
        )}
      </Container>
    </Section>
  )
}

export default function CartPage() {
  return <CartView />
}
