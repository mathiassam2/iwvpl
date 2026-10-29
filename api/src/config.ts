/**
 * Environment configuration.
 *
 * Read once at import time and validated eagerly. Failing here with a named
 * message beats failing later inside a route handler, where the real cause is
 * three stack frames away from the symptom.
 */

import { config as loadEnv } from 'dotenv'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const apiRoot = resolve(here, '..')
const repoRoot = resolve(apiRoot, '..')

// Loaded from an explicit path rather than via `dotenv/config`, which reads
// process.cwd(). `npm run dev` then behaves the same whether it is launched
// from the repo root or from inside api/. In production the file is absent and
// real environment variables — which dotenv never overwrites — take over.
loadEnv({ path: resolve(apiRoot, '.env'), quiet: true })

process.env.NODE_ENV ??= process.env.RENDER ? 'production' : 'development'

function required(name: string): string {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy api/.env.example to api/.env and fill it in.`,
    )
  }
  return raw.trim()
}

function optional(name: string, fallback: string): string {
  const raw = process.env[name]
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim()
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number.parseInt(raw.trim(), 10)
  if (!Number.isInteger(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}".`)
  }
  return parsed
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const v = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  throw new Error(`Environment variable ${name} must be a boolean, got "${raw}".`)
}

const isProd = process.env.NODE_ENV === 'production'

/**
 * TLS CA bundle for the database connection.
 *
 * Accepts either the PEM text itself (with literal newline escapes, so it can
 * live on one line in an environment variable) or a path to a .pem file, which
 * is what the TiDB Cloud "Download the CA cert" button hands you. Paths resolve
 * against the api/ directory so the value does not depend on the shell's cwd.
 *
 * Returns undefined when unset, in which case the connection is still
 * encrypted but the server certificate is not verified.
 */
function readSslCa(): string[] | undefined {
  const raw = process.env.DB_SSL_CA?.trim()
  if (!raw) return undefined
  if (raw.includes('-----BEGIN')) return [raw.replace(/\\n/g, String.fromCharCode(10))]

  const file = resolve(apiRoot, raw)
  try {
    return [readFileSync(file, 'utf8')]
  } catch {
    throw new Error(
      `DB_SSL_CA points at "${file}", which could not be read. Use a path ` +
        `relative to api/, or paste the PEM text itself.`,
    )
  }
}

export const config = {
  env: process.env.NODE_ENV,
  isProd,
  port: int('PORT', 8080),

  db: {
    host: required('DB_HOST'),
    port: int('DB_PORT', 4000),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
    connectionLimit: int('DB_POOL_SIZE', 10),

    // TiDB Cloud requires TLS on every cluster, so this defaults to on. Set
    // DB_SSL=false only for a local MySQL with no certificate.
    tls: bool('DB_SSL', true),
    // Optional PEM CA bundle. TiDB can verify against its own issued
    // certificate; leaving this unset falls back to not verifying the issuer,
    // which is acceptable only because the connection is still encrypted.
    ca: readSslCa(),
  },

  paths: {
    repoRoot,
    apiRoot,
    migrations: resolve(apiRoot, 'migrations'),
    /** Built public SPA. Served at / on production. */
    webDist: resolve(repoRoot, 'dist'),
    /** Built admin app. Served at /admin. Absent until Phase 3. */
    adminDist: resolve(repoRoot, 'admin', 'dist'),
    /** Crawl output the seed reads from. */
    crawlData: resolve(repoRoot, 'src', 'data', 'site_data.json'),
  },

  /**
   * HTTP basic auth guarding /admin. Set ADMIN_ENABLED=false to serve the
   * admin bundle unprotected — only ever do that on localhost.
   */
  admin: {
    enabled: bool('ADMIN_ENABLED', true),
    username: optional('ADMIN_USERNAME', 'admin'),
    password: required('ADMIN_PASSWORD'),
  },

  /**
   * Player and manager accounts.
   *
   * Separate from the `admin` block above on purpose: admin is one shared
   * basic-auth credential guarding a staff tool, while these are individual
   * logins on the public site. They do not share a gate, a store or a cookie.
   */
  auth: {
    cookieName: optional('AUTH_COOKIE', 'iwvpl_session'),

    // Long, because the league is not a daily product: an admin entering
    // scorelines from a phone should not be signed out mid-round. Sessions are
    // revocable server-side (DELETE the row), so a long lifetime is not a
    // revocation problem.
    sessionDays: int('AUTH_SESSION_DAYS', 30),

    // 10 is bcrypt's own default and costs ~100ms here. Raising it mainly
    // slows login, since the hash is only computed on register and login.
    bcryptRounds: int('AUTH_BCRYPT_ROUNDS', 10),

    /**
     * Origins allowed to send credentialed requests.
     *
     * The public SPA is served from GitHub Pages but the API runs on Render, so
     * a session cookie is cross-site and needs SameSite=None. That in turn needs
     * an explicit Access-Control-Allow-Origin plus Allow-Credentials, which a
     * wildcard cannot express. So the list is explicit.
     *
     * Loopback is always permitted: it is the dev server, and a browser
     * treats http://localhost and http://127.0.0.1 as distinct origins.
     */
    extraOrigins: optional('AUTH_EXTRA_ORIGINS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  /**
   * Apply pending migrations at boot.
   *
   * Convenient and correct for a single instance. It stops being correct the
   * moment you scale to two or more replicas: they would race to apply the same
   * file. Set MIGRATE_ON_BOOT=false there and run `npm run migrate` as an
   * explicit deploy step instead.
   */
  wordpress: {
    enabled: bool('WP_AUTH_ENABLED', true),
    dbName: optional('WP_DB_NAME', 'iwvq7995_wp967'),
    tablePrefix: optional('WP_TABLE_PREFIX', 'wpla_'),
  },

  stripe: {
    secretKey: optional('STRIPE_SECRET_KEY', ''),
    publishableKey: optional('STRIPE_PUBLISHABLE_KEY', ''),
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
    currency: optional('STRIPE_CURRENCY', 'SGD'),
  },

  mail: {
    host: optional('SMTP_HOST', 'iwvpl.asia'),
    port: int('SMTP_PORT', 465),
    secure: bool('SMTP_SECURE', true),
    user: optional('SMTP_USER', 'noreply@iwvpl.asia'),
    pass: optional('SMTP_PASS', 'IwvplSecureMail2026!'),
    from: optional('SMTP_FROM', '"IWVPL" <noreply@iwvpl.asia>'),
    siteUrl: optional('PUBLIC_SITE_URL', 'https://iwvpl.asia'),
  },

  migrateOnBoot: bool('MIGRATE_ON_BOOT', true),

  /** Binds the dev server to loopback only unless explicitly widened. */
  host: optional('HOST', isProd ? '0.0.0.0' : '127.0.0.1'),
} as const

if (config.admin.enabled && config.admin.password.length < 12 && isProd) {
  throw new Error(
    'ADMIN_PASSWORD must be at least 12 characters in production. ' +
      'It is the only thing standing between the public internet and the admin bundle.',
  )
}