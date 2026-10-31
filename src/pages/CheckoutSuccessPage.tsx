import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ButtonLink, Container, Section } from '@/components/ui'
import { HeaderWash } from '@/components/layout/HeaderWash'
import { getOrderSession, type OrderSessionResult } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { useAuth } from '@/lib/auth'

export default function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams()
  // Support both hash search params (?session_id=) and window.location.search
  const sessionId =
    searchParams.get('session_id') ||
    new URLSearchParams(window.location.search).get('session_id') ||
    new URLSearchParams(window.location.hash.split('?')[1] || '').get('session_id')

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
                  Your transaction has been processed securely via Stripe. A copy of your official receipt and tournament entry is detailed below.
                </p>
              </div>

              {/* Printable Official Receipt Card */}
              {order && (
                <div id="payment-receipt" className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-muted)]/60 p-5 sm:p-7 text-left space-y-5 print:border-black print:bg-white print:text-black">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4 print:border-gray-300">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black tracking-wider text-[var(--text-strong)] print:text-black">IWVPL</span>
                        <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Official Receipt</span>
                      </div>
                      <p className="mt-1 font-mono text-sm font-bold text-[var(--accent-text)]">
                        {order.order_number}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="adm-status-badge status-active text-xs">
                        {isPaid ? '✓ Paid via Stripe' : order.status.toUpperCase()}
                      </span>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)] print:text-gray-500">
                        {new Date(order.paid_at || order.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[var(--text-faint)] tracking-wider block">Customer</span>
                      <p className="text-[var(--text-strong)] font-semibold mt-0.5 truncate">
                        {user?.name || order.customer_name || 'IWVPL Competitor'}
                      </p>
                      <p className="text-[var(--text-muted)] font-mono text-[11px] truncate">
                        {order.customer_email || session?.customer_email || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[var(--text-faint)] tracking-wider block">Payment Details</span>
                      <p className="text-[var(--text-strong)] font-semibold mt-0.5">
                        Card Payment (Stripe)
                      </p>
                      <p className="text-[var(--text-muted)] text-[11px]">
                        {isPaid ? 'Payment confirmed' : 'Awaiting confirmation'}
                      </p>
                    </div>
                  </div>

                  {/* Items purchased */}
                  {order.items && order.items.length > 0 && (
                    <div className="border-t border-[var(--border)] pt-4 space-y-2 print:border-gray-300">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                        Purchased Items
                      </span>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-[var(--border)]/60 text-[10px] uppercase text-[var(--text-faint)] print:border-gray-200">
                              <th className="pb-1.5 font-bold">Item</th>
                              <th className="pb-1.5 text-center font-bold">Qty</th>
                              <th className="pb-1.5 text-right font-bold">Unit Price</th>
                              <th className="pb-1.5 text-right font-bold">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]/40 print:divide-gray-100">
                            {order.items.map((it: any, idx: number) => (
                              <tr key={idx} className="py-2">
                                <td className="py-2 font-medium text-[var(--text-strong)] print:text-black">
                                  {it.name}
                                </td>
                                <td className="py-2 text-center text-[var(--text-muted)] font-mono">
                                  {it.quantity}
                                </td>
                                <td className="py-2 text-right text-[var(--text-muted)] font-mono">
                                  {order.currency} {Number(it.amount).toFixed(2)}
                                </td>
                                <td className="py-2 text-right font-semibold text-[var(--text-strong)] font-mono print:text-black">
                                  {order.currency} {(it.amount * it.quantity).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Grand Total */}
                  <div className="border-t-2 border-[var(--border)] pt-3 flex items-center justify-between print:border-black">
                    <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-strong)] print:text-black">
                      Total Paid
                    </span>
                    <span className="font-mono text-xl font-extrabold text-[var(--accent-text)] print:text-black">
                      {order.currency} {Number(order.total_amount).toFixed(2)}
                    </span>
                  </div>

                  {/* Print / Save Receipt Action */}
                  <div className="pt-2 flex justify-end print:hidden">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="adm-btn adm-btn-secondary gap-1.5 px-3 py-1.5 text-xs font-semibold"
                    >
                      🖨️ Print / Save Receipt (PDF)
                    </button>
                  </div>
                </div>
              )}

              {/* Next Steps Card */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-left space-y-2 text-[var(--text-muted)] print:hidden">
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
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3 print:hidden">
                {user?.role === 'club_manager' ? (
                  <ButtonLink to="/dashboard" size="lg">
                    Go to Manager Dashboard →
                  </ButtonLink>
                ) : (
                  <ButtonLink to="/dashboard" size="lg">
                    Go to My Dashboard →
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
