/**
 * The IWVPL server.
 *
 * One process serves three things from one origin:
 *
 *   /api/*    the JSON API
 *   /admin/*  the admin SPA, behind HTTP basic auth
 *   /*        the public SPA
 *
 * Single-origin is the whole point. Because the SPA and the API share an
 * origin, there is no CORS configuration and no cross-site cookie dance —
 * `SameSite=Lax` sessions just work, and neither SPA needs to know where the
 * other lives.
 */

import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.js'
import { closePool } from './db.js'
import { runMigrations } from './migrate.js'
import { league } from './routes/league.js'
import { admin } from './routes/admin.js'
import { requireBasicAuth } from './middleware/basicAuth.js'

const app = express()

// Behind Render's proxy. Without this `req.ip` is the proxy's address and every
// session row records the same value.
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(express.json({ limit: '256kb' }))

/* --------------------------------------------------------------- logging */

app.use((req, res, next) => {
  const started = process.hrtime.bigint()
  res.on('finish', () => {
    if (req.path.startsWith('/assets/')) return // hashed, immutable, noisy
    const ms = Number(process.hrtime.bigint() - started) / 1e6
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`)
  })
  next()
})

/* ------------------------------------------------------------------- api */

app.use('/api', league)

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

  const server = app.listen(config.port, config.host, () => {
    console.log(`IWVPL api  http://${config.host}:${config.port}`)
    console.log(`  env      ${config.env}`)
    console.log(`  database ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database} (tls=${config.db.tls})`)
    console.log(`  spa      ${webBuilt ? config.paths.webDist : 'NOT BUILT'}`)
    console.log(`  admin    ${adminBuilt ? '/admin (basic auth)' : 'NOT BUILT'}`)
  })

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