/**
 * Stripe Payment & Checkout Routes.
 */

import { Router, type Request, type Response } from 'express'
import { config } from '../config.js'
import { execute, queryOne } from '../db.js'
import { resolveSession, notify } from '../domain/auth.js'
import {
  createCheckoutSession,
  getStripeCredentials,
  retrieveCheckoutSession,
  verifyStripeWebhook,
  type StripeLineItem,
} from '../domain/stripe.js'

export const payments = Router()

function handler(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error('[Payments Error]:', err)
      const status = err?.status || 500
      const message = err?.message || 'Payment service error.'
      res.status(status).json({ error: message })
    })
  }
}

/**
 * Public Stripe configuration (Publishable Key and currency).
 */
payments.get(
  '/config',
  handler(async (_req, res) => {
    const creds = await getStripeCredentials()
    res.json({
      ok: true,
      publishableKey: creds.publishableKey,
      currency: config.stripe.currency,
    })
  }),
)

/**
 * Create a Stripe Hosted Checkout Session for cart items or team registration.
 */
payments.post(
  '/checkout-session',
  handler(async (req, res) => {
    const rawItems = req.body?.items
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ error: 'At least one item is required in the cart.' })
    }

    const items: StripeLineItem[] = []
    let totalAmount = 0

    for (const it of rawItems) {
      const name = String(it.name || '').trim()
      const amount = Number(it.amount)
      const quantity = Math.max(1, Number.parseInt(String(it.quantity || 1), 10))

      if (!name || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: `Invalid item details for: ${name || 'item'}` })
      }

      items.push({
        name,
        description: it.description ? String(it.description).slice(0, 400) : undefined,
        amount,
        quantity,
        image: it.image ? String(it.image) : undefined,
      })
      totalAmount += amount * quantity
    }

    // Identify logged-in user if available
    const sessionToken = req.cookies?.[config.auth.cookieName]
    const user = await resolveSession(sessionToken)

    const customerEmail = String(req.body?.customerEmail || user?.email || '').trim()
    const customerName = String(req.body?.customerName || user?.display_name || '').trim()
    const clubId = req.body?.clubId ? Number(req.body.clubId) : (user?.club_id ?? null)
    const clubName = req.body?.clubName ? String(req.body.clubName).trim() : null

    // Generate Order Number: IWV-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randSuffix = Math.floor(1000 + Math.random() * 9000)
    const orderNumber = `IWV-${dateStr}-${randSuffix}`

    // Base URL for redirects
    const origin = req.get('origin') || req.get('referer')
    let baseUrl = origin ? origin.replace(/\/+$/, '') : 'https://beta.iwvpl.asia'
    // If coming from another path, ensure baseUrl has no path
    try {
      const u = new URL(baseUrl)
      baseUrl = u.origin
    } catch {
      baseUrl = 'https://beta.iwvpl.asia'
    }

    const successUrl = `${baseUrl}/#/checkout/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/#/cart`

    // Pre-create pending order in DB
    const orderId = await execute(
      `INSERT INTO orders
         (order_number, user_id, club_id, customer_email, customer_name, total_amount, currency, status, items_json, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW(), NOW())`,
      [
        orderNumber,
        user?.id ?? null,
        clubId ?? null,
        customerEmail || 'guest@iwvpl.asia',
        customerName || null,
        totalAmount,
        config.stripe.currency,
        JSON.stringify(items),
        JSON.stringify({ clubName, userId: user?.id, ...req.body?.metadata }),
      ],
    )

    // Create Stripe Checkout Session
    const session = await createCheckoutSession({
      orderNumber,
      items,
      customerEmail: customerEmail || undefined,
      customerName: customerName || undefined,
      successUrl,
      cancelUrl,
      metadata: {
        orderId: String(orderId),
        orderNumber,
        userId: user ? String(user.id) : '',
        clubId: clubId ? String(clubId) : '',
        clubName: clubName || '',
      },
    })

    // Attach stripe session id to the order
    await execute('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [session.id, orderId])

    res.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
      orderNumber,
      totalAmount,
      currency: config.stripe.currency,
    })
  }),
)

/**
 * Retrieve session & order status for confirmation display.
 */
/**
 * List orders and receipts for the currently signed-in user.
 */
payments.get(
  '/my-orders',
  handler(async (req, res) => {
    const sessionToken = req.cookies?.[config.auth.cookieName]
    const user = await resolveSession(sessionToken)
    if (!user) {
      return res.status(401).json({ error: 'Sign in to view orders.' })
    }

    const rows = await queryOne(
      `SELECT id FROM users WHERE id = ?`,
      [user.id]
    )
    if (!rows) return res.status(401).json({ error: 'User not found.' })

    const { queryAll } = await import('../db.js')
    const orders = await queryAll<any>(
      `SELECT id, order_number, user_id, club_id, customer_email, customer_name,
              total_amount, currency, status, stripe_session_id, stripe_payment_intent_id,
              items_json, metadata_json, paid_at, created_at
         FROM orders
        WHERE user_id = ? OR (customer_email IS NOT NULL AND LOWER(customer_email) = LOWER(?))
        ORDER BY id DESC
        LIMIT 50`,
      [user.id, user.email],
    )

    res.json({
      ok: true,
      orders: orders.map((o) => ({
        ...o,
        items: typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json,
        metadata: typeof o.metadata_json === 'string' ? JSON.parse(o.metadata_json) : o.metadata_json,
      })),
    })
  }),
)

payments.get(
  '/session/:sessionId',
  handler(async (req, res) => {
    const sessionId = req.params.sessionId
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required.' })
    }

    const order = await queryOne<any>(
      `SELECT id, order_number, user_id, club_id, customer_email, customer_name,
              total_amount, currency, status, stripe_session_id, stripe_payment_intent_id,
              items_json, metadata_json, paid_at, created_at
         FROM orders
        WHERE stripe_session_id = ?`,
      [sessionId],
    )

    let stripeSession: any = null
    try {
      stripeSession = await retrieveCheckoutSession(sessionId)
    } catch (err) {
      console.warn('[Payments] Could not retrieve stripe session:', err)
    }

    // Auto-reconcile if stripe says paid but DB order is still pending
    if (order && order.status === 'pending' && stripeSession?.payment_status === 'paid') {
      const intentId =
        typeof stripeSession.payment_intent === 'string'
          ? stripeSession.payment_intent
          : stripeSession.payment_intent?.id || null

      await execute(
        `UPDATE orders
            SET status = 'paid',
                stripe_payment_intent_id = ?,
                paid_at = NOW(),
                updated_at = NOW()
          WHERE id = ?`,
        [intentId, order.id],
      )
      order.status = 'paid'
      order.paid_at = new Date()
      order.stripe_payment_intent_id = intentId

      if (order.user_id) {
        await notify(
          order.user_id,
          'payment_confirmed',
          `Payment Confirmed (${order.order_number})`,
          `Your payment of ${order.currency} ${order.total_amount} was successfully processed.`,
          '/dashboard',
        ).catch(() => undefined)
      }
    }

    res.json({
      ok: true,
      order: order
        ? {
            ...order,
            items: typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json,
            metadata: typeof order.metadata_json === 'string' ? JSON.parse(order.metadata_json) : order.metadata_json,
          }
        : null,
      session: stripeSession
        ? {
            id: stripeSession.id,
            payment_status: stripeSession.payment_status,
            customer_email: stripeSession.customer_details?.email || stripeSession.customer_email,
            customer_name: stripeSession.customer_details?.name,
            amount_total: stripeSession.amount_total,
            currency: stripeSession.currency,
          }
        : null,
    })
  }),
)

/**
 * Stripe Webhook Handler for asynchronous payment events.
 */
payments.post(
  '/webhook',
  handler(async (req, res) => {
    const sig = req.headers['stripe-signature'] as string | undefined
    const rawBody = (req as any).rawBody || req.body

    const verification = await verifyStripeWebhook(rawBody, sig)
    if (!verification.valid) {
      console.error('[Stripe Webhook Verification Failed]:', verification.error)
      return res.status(400).send(`Webhook Error: ${verification.error}`)
    }

    const event = verification.event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const sessionId = session.id
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null

      const order = await queryOne<any>(
        'SELECT id, order_number, user_id, total_amount, currency FROM orders WHERE stripe_session_id = ?',
        [sessionId],
      )

      if (order) {
        await execute(
          `UPDATE orders
              SET status = 'paid',
                  stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
                  paid_at = NOW(),
                  updated_at = NOW()
            WHERE id = ?`,
          [paymentIntentId, order.id],
        )

        if (order.user_id) {
          await notify(
            order.user_id,
            'payment_confirmed',
            `Payment Confirmed (${order.order_number})`,
            `Your payment of ${order.currency} ${order.total_amount} was successfully verified via Stripe.`,
            '/dashboard',
          ).catch(() => undefined)
        }
      }
    }

    res.json({ received: true })
  }),
)
