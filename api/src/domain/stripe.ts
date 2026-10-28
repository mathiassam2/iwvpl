/**
 * Native Stripe Checkout & Webhook Integration.
 *
 * Uses Stripe's REST API over native fetch and Node crypto to ensure zero
 * external native compilation dependencies on cPanel/Passenger.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'
import { queryOne } from '../db.js'

export interface StripeLineItem {
  name: string
  description?: string
  amount: number // in major units (e.g. SGD 35)
  quantity: number
  image?: string
}

export interface CreateSessionParams {
  orderNumber: string
  items: StripeLineItem[]
  customerEmail?: string
  customerName?: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

export interface StripeSessionResult {
  id: string
  url: string
  payment_status: string
  amount_total: number
  currency: string
}

const STRIPE_API_BASE = 'https://api.stripe.com/v1'

let cachedKeys: { secretKey: string; publishableKey: string; webhookSecret: string } | null = null

/**
 * Dynamically retrieve Stripe credentials.
 * Prioritizes process.env; if unset, auto-queries WooCommerce Stripe settings from WordPress db.
 */
export async function getStripeCredentials(): Promise<{
  secretKey: string
  publishableKey: string
  webhookSecret: string
}> {
  if (config.stripe.secretKey && config.stripe.publishableKey) {
    return {
      secretKey: config.stripe.secretKey,
      publishableKey: config.stripe.publishableKey,
      webhookSecret: config.stripe.webhookSecret,
    }
  }

  if (cachedKeys) return cachedKeys

  try {
    const wpDb = config.wordpress.dbName
    const wpPrefix = config.wordpress.tablePrefix
    const row = await queryOne<{ option_value: string }>(
      `SELECT option_value FROM \`${wpDb}\`.\`${wpPrefix}options\` WHERE option_name = 'woocommerce_stripe_settings' LIMIT 1`,
    )
    if (row?.option_value) {
      const val = row.option_value
      const skMatch = val.match(/secret_key";s:\d+:"([^"]+)"/)
      const pkMatch = val.match(/publishable_key";s:\d+:"([^"]+)"/)
      const whMatch = val.match(/webhook_secret";s:\d+:"([^"]+)"/)
      if (skMatch && pkMatch) {
        cachedKeys = {
          secretKey: skMatch[1],
          publishableKey: pkMatch[1],
          webhookSecret: whMatch ? whMatch[1] : config.stripe.webhookSecret,
        }
        return cachedKeys
      }
    }
  } catch (err) {
    console.warn('[Stripe] Could not load credentials from WordPress options table:', err)
  }

  return {
    secretKey: config.stripe.secretKey,
    publishableKey: config.stripe.publishableKey,
    webhookSecret: config.stripe.webhookSecret,
  }
}

async function getHeaders() {
  const creds = await getStripeCredentials()
  if (!creds.secretKey) {
    throw new Error('Stripe Secret Key is not configured.')
  }
  return {
    Authorization: `Bearer ${creds.secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

/**
 * Create a Stripe Hosted Checkout Session.
 */
export async function createCheckoutSession(
  params: CreateSessionParams,
): Promise<StripeSessionResult> {
  const headers = await getHeaders()
  const form = new URLSearchParams()
  form.set('mode', 'payment')
  form.set('success_url', params.successUrl)
  form.set('cancel_url', params.cancelUrl)
  form.set('client_reference_id', params.orderNumber)

  if (params.customerEmail) {
    form.set('customer_email', params.customerEmail)
  }

  // Allow promotional/discount codes if enabled in Stripe
  form.set('allow_promotion_codes', 'true')

  // Line items
  params.items.forEach((item, index) => {
    const unitAmountCents = Math.round(item.amount * 100)
    form.set(`line_items[${index}][price_data][currency]`, config.stripe.currency.toLowerCase())
    form.set(`line_items[${index}][price_data][unit_amount]`, String(unitAmountCents))
    form.set(`line_items[${index}][price_data][product_data][name]`, item.name)
    if (item.description) {
      form.set(`line_items[${index}][price_data][product_data][description]`, item.description)
    }
    if (item.image && (item.image.startsWith('http://') || item.image.startsWith('https://'))) {
      form.set(`line_items[${index}][price_data][product_data][images][0]`, item.image)
    }
    form.set(`line_items[${index}][quantity]`, String(Math.max(1, item.quantity)))
  })

  // Metadata
  form.set('metadata[order_number]', params.orderNumber)
  if (params.customerName) {
    form.set('metadata[customer_name]', params.customerName)
  }
  if (params.metadata) {
    for (const [k, v] of Object.entries(params.metadata)) {
      if (v !== undefined && v !== null) {
        form.set(`metadata[${k}]`, String(v))
      }
    }
  }

  const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: 'POST',
    headers,
    body: form.toString(),
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    const msg = json?.error?.message || `Stripe error (${res.status})`
    throw new Error(msg)
  }

  return {
    id: json.id,
    url: json.url,
    payment_status: json.payment_status,
    amount_total: json.amount_total,
    currency: json.currency,
  }
}

/**
 * Retrieve a Stripe Checkout Session by ID.
 */
export async function retrieveCheckoutSession(sessionId: string): Promise<any> {
  const headers = await getHeaders()
  const url = `${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items&expand[]=payment_intent`
  const res = await fetch(url, {
    method: 'GET',
    headers,
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Could not retrieve Stripe session.')
  }
  return json
}

/**
 * Verify incoming Stripe webhook signature.
 */
export async function verifyStripeWebhook(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
): Promise<{ valid: boolean; event?: any; error?: string }> {
  const creds = await getStripeCredentials()
  const secret = creds.webhookSecret || config.stripe.webhookSecret
  if (!secret) {
    return { valid: false, error: 'Stripe webhook secret not configured.' }
  }

  if (!signatureHeader) {
    return { valid: false, error: 'Missing Stripe-Signature header.' }
  }

  try {
    const items = signatureHeader.split(',')
    let timestamp: string | null = null
    const signatures: string[] = []

    for (const item of items) {
      const [k, v] = item.trim().split('=')
      if (k === 't') timestamp = v
      if (k === 'v1' && v) signatures.push(v)
    }

    if (!timestamp || signatures.length === 0) {
      return { valid: false, error: 'Malformed Stripe signature header.' }
    }

    // Verify timestamp tolerance (within 5 minutes)
    const now = Math.floor(Date.now() / 1000)
    const ts = Number.parseInt(timestamp, 10)
    if (Math.abs(now - ts) > 300) {
      return { valid: false, error: 'Stripe webhook timestamp expired or out of tolerance.' }
    }

    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
    const payloadToSign = `${timestamp}.${bodyStr}`
    const expectedSig = createHmac('sha256', secret).update(payloadToSign, 'utf8').digest('hex')

    const expectedBuf = Buffer.from(expectedSig, 'hex')
    const match = signatures.some((sig) => {
      try {
        const sigBuf = Buffer.from(sig, 'hex')
        return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)
      } catch {
        return false
      }
    })

    if (!match) {
      return { valid: false, error: 'Invalid Stripe signature.' }
    }

    const event = JSON.parse(bodyStr)
    return { valid: true, event }
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Signature verification error.' }
  }
}
