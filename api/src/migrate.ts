/**
 * Migration runner.
 *
 * Deliberately dependency-free. A migration tool would want its own schema
 * table and its own connection handling; for a dozen SQL files the whole thing
 * is a directory listing and a hash.
 *
 * Two properties matter:
 *
 *   1. Files are applied in lexicographic order and recorded by filename, so
 *      the numeric prefix (`001_`, `002_`) is the ordering contract.
 *
 *   2. Each applied file's SHA-256 is stored. Editing a migration that has
 *      already run is the single most common way to end up with a schema that
 *      does not match the repository, so this is detected loudly rather than
 *      silently ignored.
 */

import { createConnection, type Connection } from 'mysql2/promise'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { config } from './config.js'
import { closePool, now } from './db.js'

const LEDGER = '_migrations'

/** Opens its own connection because it needs `multipleStatements`, which the
 *  shared pool deliberately keeps off. */
async function openMigrationConnection(): Promise<Connection> {
  return createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    dateStrings: true,
    multipleStatements: true,
    ssl: config.db.tls
      ? {
          ...(config.db.ca ? { ca: config.db.ca } : { rejectUnauthorized: false }),
          minVersion: 'TLSv1.2',
        }
      : undefined,
  })
}

async function ensureLedger(conn: Connection): Promise<void> {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS ${LEDGER} (
       filename   VARCHAR(255) NOT NULL,
       checksum   CHAR(64)     NOT NULL,
       applied_at DATETIME     NOT NULL,
       PRIMARY KEY (filename)
     ) DEFAULT CHARSET=utf8mb4`,
  )
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

export interface MigrationResult {
  applied: string[]
  skipped: string[]
  drifted: string[]
}

export async function runMigrations(dir = config.paths.migrations): Promise<MigrationResult> {
  const result: MigrationResult = { applied: [], skipped: [], drifted: [] }

  const conn = await openMigrationConnection()
  try {
    await ensureLedger(conn)

    const [rows] = await conn.query(`SELECT filename, checksum FROM ${LEDGER}`)
    const applied = new Map(
      (rows as Array<{ filename: string; checksum: string }>).map((r) => [r.filename, r.checksum]),
    )

    // Only .sql files, sorted so the numeric prefix governs order.
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

    for (const filename of files) {
      const sql = await readFile(join(dir, filename), 'utf8')
      const checksum = sha256(sql)
      const previous = applied.get(filename)

      if (previous !== undefined) {
        if (previous !== checksum) {
          result.drifted.push(filename)
        } else {
          result.skipped.push(filename)
        }
        continue
      }

      // Each file runs on its own. A failure leaves previously applied
      // migrations committed — which is correct, since DDL is not
      // transactional in TiDB and a partial rollback would be a lie.
      await conn.query(sql)
      await conn.query(`INSERT INTO ${LEDGER} (filename, checksum, applied_at) VALUES (?, ?, ?)`, [
        filename,
        checksum,
        now(),
      ])
      result.applied.push(filename)
    }

    return result
  } finally {
    await conn.end()
  }
}

/** CLI entry point: `npm run migrate` */
async function main(): Promise<void> {
  try {
    console.log(`Migrating ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`)
    const result = await runMigrations()

    for (const f of result.applied) console.log(`  applied  ${f}`)
    for (const f of result.skipped) console.log(`  skipped  ${f} (already applied)`)

    if (result.drifted.length > 0) {
      console.error('')
      console.error('DRIFT DETECTED — these migrations were edited after they ran:')
      for (const f of result.drifted) console.error(`  ${f}`)
      console.error('')
      console.error('The database no longer matches the repository. Write a new migration')
      console.error('instead of editing history.')
      process.exitCode = 1
    }

    console.log('')
    console.log(
      result.applied.length === 0
        ? 'Schema is up to date.'
        : `Done. ${result.applied.length} migration(s) applied.`,
    )
  } finally {
    // config.ts imports db.ts for `now()`, which builds a pool at module load.
    // Close it so the process can exit instead of hanging on idle sockets.
    await closePool()
  }
}

// Only run when invoked directly, not when imported by the server.
//
// The comparison has to go through pathToFileURL. String-building the URL by
// hand works on Linux but silently never matches on Windows, where
// `import.meta.url` is `file:///C:/x` while process.argv[1] is `C:\x`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}