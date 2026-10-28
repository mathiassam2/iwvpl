import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ButtonLink, Container, Section } from '@/components/ui'
import { HeaderWash } from '@/components/layout/HeaderWash'
import { getOrderSession, type OrderSessionResult } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { useAuth } from '@/lib/auth'

export default function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const { clear } = useCart()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<OrderSessionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setLoading(false)
      setError('No payment session found.')
      return
    }

    let active = true
    getOrderSession(sessionId)
      .then((res) => {
        if (!active) return
        setData(res)
        // Clear cart now that order is confirmed
        clear()
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not retrieve payment details.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [sessionId, clear])

  const order = data?.order
  const session = data?.session
  const isPaid = order?.status === 'paid' || session?.payment_status === 'paid'

  return (
    <Section className="-mt-16 overflow-hidden pt-16 lg:-mt-[72px] lg:pt-[72px]">
      <HeaderWash />
      <Container size="narrow" className="py-12">
        <div className="surface rounded-2xl border border-[var(--border)] p-6 sm:p-10 shadow-lg text-center">
          {loading ? (
            <div className="py-12 space-y-4">
              <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-[var(--accent)] border-r-transparent" />
              <p className="text-base font-semibold text-[var(--text-strong)]">
                Verifying your payment with Stripe…
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Please hold on while we confirm your official transaction.
              </p>
            </div>
          ) : error ? (
            <div className="py-8 space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-2xl text-red-400">
                ⚠️
              </div>
              <h1 className="text-2xl font-bold text-[var(--text-strong)]">Payment Verification Issue</h1>
              <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">{error}</p>
              <div className="pt-4 flex justify-center gap-3">
                <ButtonLink to="/cart" variant="outline">
                  Return to Cart
                </ButtonLink>
                <ButtonLink to="/contact">Contact Support</ButtonLink>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Success Badge */}
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30 text-3xl text-emerald-400">
                ✓
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                  Payment Confirmed
                </span>
                <h1 className="mt-1 font-display text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
                  {isPaid ? 'Thank You for Your Order!' : 'Payment Processing'}
                </h1>
                <p className="mt-2 text-sm text-[var(--text-muted)] max-w-md mx-auto">
                  Your transaction has been processed securely via Stripe. A copy of your receipt and tournament entry confirmation has been emailed to you.
                </p>
              </div>

              {/* Order Receipt Card */}
              {order && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/60 p-5 text-left space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                        Order Reference
                      </span>
                      <p className="font-mono text-sm font-bold text-[var(--text-strong)]">
                        {order.order_number}
                      </p>
                    </div>
                    <span className="adm-status-badge status-active text-xs">
                      {isPaid ? '✓ Paid via Stripe' : order.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[var(--text-faint)] uppercase font-semibold">Customer Email</span>
                      <p className="text-[var(--text-strong)] font-medium mt-0.5 truncate">
                        {order.customer_email || session?.customer_email || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[var(--text-faint)] uppercase font-semibold">Total Paid</span>
                      <p className="text-base font-bold text-[var(--accent-text)] mt-0.5">
                        {order.currency} {Number(order.total_amount).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Items purchased */}
                  {order.items && order.items.length > 0 && (
                    <div className="border-t border-[var(--border)] pt-3 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                        Purchased Items
                      </span>
                      <ul className="divide-y divide-[var(--border)]/60 text-xs">
                        {order.items.map((it, idx) => (
                          <li key={idx} className="py-1.5 flex items-center justify-between">
                            <span className="font-medium text-[var(--text-strong)]">
                              {it.quantity}× {it.name}
                            </span>
                            <span className="font-mono font-semibold text-[var(--text-muted)]">
                              {order.currency} {(it.amount * it.quantity).toFixed(2)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Next Steps Card */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-left space-y-2 text-[var(--text-muted)]">
                <strong className="text-[var(--text-strong)] block text-sm">Next Steps</strong>
                <p>
                  1. Roster submission forms and scheduling details are accessible from your Manager Dashboard.
                </p>
                <p>
                  2. If you registered a Pro Club team, our competition admins will verify your squad entries within 24 to 48 hours.
                </p>
                <p>
                  3. Join our official Discord community for match-day coordination, announcements, and support.
                </p>
              </div>

              {/* Actions */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                {user?.role === 'club_manager' ? (
                  <ButtonLink to="/dashboard" size="lg">
                    Go to Manager Dashboard →
                  </ButtonLink>
                ) : (
                  <ButtonLink to="/standings" size="lg">
                    View Standings & Matches →
                  </ButtonLink>
                )}
                <ButtonLink to="/" variant="outline" size="lg">
                  Return Home
                </ButtonLink>
              </div>
            </div>
          )}
        </div>
      </Container>
    </Section>
  )
}
