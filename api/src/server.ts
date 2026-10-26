/**
 * The IWVPL server.
 *
 * One process serves three things from one origin:
 *
 *   /api/*    the JSON API
 *   /admin/*  the admin SPA, behind HTTP basic auth
 *   /*        the public SPA
 *
 * Single-origin is the point for the *admin* app, which is served from this
 * process and therefore same-origin with the API.
 *
 * The public SPA is not, though. Its GitHub Pages build is compiled with
 * VITE_API_BASE_URL pointing here, so every request it makes is cross-site.
 * That was fine while the API only served public GETs; accounts make it not
 * fine, because a session cookie is dropped on a cross-site request unless it
 * is SameSite=None, and SameSite=None is only accepted alongside
 * Access-Control-Allow-Credentials — which a wildcard origin cannot express.
 * So the CORS block below is explicit rather than a library default.
 */

import express, { type NextFunction, type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { config } from './config.js'
import { closePool, queryOne } from './db.js'
import { runMigrations } from './migrate.js'
import { seed } from './domain/seed.js'
import { league } from './routes/league.js'
import { admin } from './routes/admin.js'
import { auth } from './routes/auth.js'
import { manager } from './routes/manager.js'
import { player } from './routes/player.js'
import { notifications } from './routes/notifications.js'
import { requireBasicAuth } from './middleware/basicAuth.js'
import { pruneExpiredSessions } from './domain/auth.js'

const app = express()

// Behind Render's proxy. Without this `req.ip` is the proxy's address and every
// session row records the same value.
app.set('trust proxy', 1)
app.disable('x-powered-by')

// Standard security headers (defense in depth against MIME-sniffing, clickjacking, and XSS)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

// Bounded body limits to prevent resource exhaustion / DoS
app.use(express.json({ limit: '15mb' }))
app.use(express.urlencoded({ extended: true, limit: '15mb' }))
app.use(cookieParser())

// Compress JSON API responses (>1KB) with gzip so large club/CMS payloads transfer 4-6x faster.
app.use((req, res, next) => {
  const accept = req.headers['accept-encoding'] ?? ''
  if (!accept.includes('gzip')) return next()
  const origJson = res.json.bind(res)
  res.json = ((body: unknown) => {
    if (res.headersSent) return origJson(body)
    const jsonStr = JSON.stringify(body)
    if (!jsonStr || jsonStr.length < 1024) {
      return origJson(body)
    }
    const compressed = gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 6 })
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Vary', 'Accept-Encoding')
    res.setHeader('Content-Length', String(compressed.length))
    return res.end(compressed)
  }) as typeof res.json
  next()
})

/* --------------------------------------------------------------- logging */

/**
 * Registered before the CORS block below so preflights are logged too.
 *
 * A cross-site credentialed request always sends OPTIONS first, and a login
 * that "just does not work" produces two requests where the logs would show
 * one. Logging only the second makes the failure invisible.
 */
app.use((req, res, next) => {
  const started = process.hrtime.bigint()
  res.on('finish', () => {
    if (req.path.startsWith('/assets/')) return // hashed, immutable, noisy
    const ms = Number(process.hrtime.bigint() - started) / 1e6
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`)
  })
  next()
})

/* ------------------------------------------------------------------- cors */

/**
 * Origins allowed to make credentialed requests.
 *
 * PUBLIC_SITE_ORIGIN is the deployed SPA. Loopback is always included because
 * the dev server runs on a different port, which is a different origin, and a
 * browser treats localhost and 127.0.0.1 as distinct from each other too.
 */
const allowedOrigins = new Set<string>([
  'https://beta.iwvpl.asia',
  'https://iwvpl.asia',
  'https://www.iwvpl.asia',
  ...(process.env.PUBLIC_SITE_ORIGIN ? [process.env.PUBLIC_SITE_ORIGIN.trim()] : []),
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...config.auth.extraOrigins,
])

/**
 * Credentials are allowed, so the response must name one exact origin.
 * `Access-Control-Allow-Origin: *` is rejected by the browser whenever
 * Allow-Credentials is set, and reflecting an arbitrary Origin back would make
 * the API an open door for any site a user visits.
 */
app.use((req, res, next) => {
  const origin = req.get('origin')
  const allowed = origin !== undefined && allowedOrigins.has(origin)

  // The `origin &&` guard narrows the type as well as the value.
  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Max-Age', '600')
    // A shared cache must not hand one origin's response to another.
    res.vary('Origin')
  }

  // A preflight is answered here and goes no further. Letting it fall through
  // would 404 as JSON, which the browser reports as a CORS failure rather than
  // as the missing endpoint it is.
  if (req.method === 'OPTIONS') {
    return res.sendStatus(allowed ? 204 : 403)
  }

  next()
})

/* ------------------------------------------------------------------- api */

app.use('/api', league)

// Account routes. Mounted before the admin gate: these are the public site's
// own logins and have nothing to do with the shared basic-auth credential.
app.use('/api/auth', auth)
app.use('/api/manager', manager)
app.use('/api/player', player)
app.use('/api/notifications', notifications)

// Write endpoints sit behind the same basic-auth gate as the admin bundle, not
// because this is a meaningful permission check — it is one shared credential —
// but so the bundle and the routes that back it share a single boundary.
app.use('/api/admin', requireBasicAuth(), admin)

// Unknown /api/* must 404 as JSON. Without this the SPA fallback below would
// answer with index.html and a client parsing JSON would report a baffling
// syntax error instead of "no such endpoint".
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

/* ----------------------------------------------------------------- admin */

const adminBuilt = existsSync(join(config.paths.adminDist, 'index.html'))

if (adminBuilt) {
  app.use('/admin', requireBasicAuth(), express.static(config.paths.adminDist, { index: false }))
  // The admin app is also a SPA, so /admin/anything needs its index.html.
  app.get('/admin/*', requireBasicAuth(), (_req, res) => {
    res.sendFile(join(config.paths.adminDist, 'index.html'))
  })
} else {
  // Claim /admin even when there is nothing to serve. Without this the request
  // falls through to the public SPA's catch-all and returns the *public site*
  // at an admin URL, so a 200 here would read as "admin is up" when the truth
  // is that it is missing entirely.
  app.use('/admin', (_req, res) => {
    res.status(404).type('text/plain').send(
      'The admin app has not been built.\n\n' +
        'Build it from admin/, then restart this server.\n' +
        `Expected: ${config.paths.adminDist}\\index.html`,
    )
  })
}

/* ------------------------------------------------------------ public spa */

const webBuilt = existsSync(join(config.paths.webDist, 'index.html'))

if (webBuilt) {
  // Hashed filenames, so they can be cached forever. Anything not under
  // /assets/ keeps the default, because index.html must revalidate or a deploy
  // would never be picked up by a returning visitor.
  app.use(
    express.static(config.paths.webDist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.replace(/\\/g, '/').includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )

  // History fallback. The public SPA uses react-router, so /clubs/arsenal is a
  // real URL that must return index.html rather than 404 — both for a cold hit
  // and for a refresh.
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(join(config.paths.webDist, 'index.html'))
  })
} else {
  app.get('*', (_req, res) => {
    res
      .status(503)
      .type('text/plain')
      .send(
        'The public SPA has not been built.\n\n' +
          'Run `npm run build` at the repo root, then restart this server.\n' +
          `Expected: ${config.paths.webDist}\\index.html`,
      )
  })
}

/* ------------------------------------------------------- error handling */

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Route handlers tag deliberate failures (validation, not found, conflict)
  // with `status`. Anything else is a genuine fault and becomes a 500.
  const status = Number.isInteger(err?.status) ? err.status : 500
  const message = typeof err?.message === 'string' ? err.message : 'Internal server error'

  if (status >= 500) {
    // Only unexpected faults are worth a stack trace. A 400 with a full driver
    // dump is noise, and the driver message can quote the query that failed.
    console.error(err)
    return res.status(500).json({ error: 'Internal server error' })
  }

  res.status(status).json({ error: message })
})

/* --------------------------------------------------------------- startup */

async function start(): Promise<void> {
  if (config.migrateOnBoot) {
    const result = await runMigrations()
    if (result.applied.length > 0) {
      console.log(`Applied ${result.applied.length} migration(s): ${result.applied.join(', ')}`)
    }
    if (result.drifted.length > 0) {
      console.error(`Drift detected in: ${result.drifted.join(', ')}`)
    }
  }

  // Optional auto-seed on first boot when the clubs table is completely empty.
  if (process.env.SEED_IF_EMPTY === 'true') {
    try {
      const row = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM clubs')
      if (Number(row?.n ?? 0) === 0 && existsSync(config.paths.crawlData)) {
        console.log('Database has 0 clubs; seeding initial league data from site_data.json...')
        const report = await seed()
        console.log(`Seeded ${report.season} / ${report.division}:`, report.counts)
      }
    } catch (err) {
      console.warn('Could not auto-seed database on boot:', err instanceof Error ? err.message : err)
    }
  }

  // Expired sessions are dead weight that nothing else removes, and the table
  // only ever grows. A single DELETE on boot is enough: rows past their expiry
  // are already rejected by the lookup, so pruning is housekeeping, not
  // correctness.
  try {
    await pruneExpiredSessions()
  } catch (err) {
    // Not fatal. Failing to prune must not stop the server from booting.
    console.warn('Could not prune expired sessions:', err instanceof Error ? err.message : err)
  }

  const onListening = () => {
    console.log(`IWVPL api  http://${config.host}:${config.port}`)
    console.log(`  env      ${config.env}`)
    console.log(`  database ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database} (tls=${config.db.tls})`)
    console.log(`  spa      ${webBuilt ? config.paths.webDist : 'NOT BUILT'}`)
    console.log(`  admin    ${adminBuilt ? '/admin (basic auth)' : 'NOT BUILT'}`)
  }

  const isPassenger =
    typeof (globalThis as any).PhusionPassenger !== 'undefined' ||
    Boolean(process.env.PASSENGER_APP_ENV)

  const server = isPassenger
    ? app.listen(config.port, onListening)
    : app.listen(config.port, config.host, onListening)

  // Render sends SIGTERM on deploy. Without a graceful exit the in-flight
  // request is dropped and the pool's sockets are severed mid-query.
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, closing.`)
    server.close(() => {
      closePool()
        .catch(() => undefined)
        .finally(() => process.exit(0))
    })
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})