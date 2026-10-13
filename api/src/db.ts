/**
 * MySQL connection pool.
 *
 * TiDB Cloud Starter speaks the MySQL wire protocol on port 4000, so `mysql2`
 * connects with the ordinary pool and `multipleStatements` stays OFF. The HTTP
 * serverless driver (`@tidbcloud/serverless`) is only needed for edge runtimes
 * where TCP does not exist — Vercel Edge Functions, Cloudflare Workers. A
 * long-lived Node process on Render has no such constraint.
 *
 * Enabling `multipleStatements` would turn every `?` placeholder into a
 * potential injection vector, because the driver can no longer tell where a
 * bound value ends and raw SQL begins. Migrations that need it open their own
 * short-lived connection (see migrate.ts).
 */

import mysql from 'mysql2/promise'
import { config } from './config.js'

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,

  // Never let a request open unbounded connections. When the pool is full,
  // queue instead of throwing — a brief queue is far better than a 500.
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,

  // Club flags are regional-indicator emoji pairs. Under utf8mb3 they
  // truncate to '?' with no error.
  charset: 'utf8mb4',

  // Return DATE/DATETIME as 'YYYY-MM-DD HH:MM:SS' strings instead of JS
  // Date objects. mysql2 otherwise applies the local timezone in both
  // directions, which is the classic source of "the fixture is on the wrong
  // day" bugs. All DATETIME columns here are naive by convention (UTC), so
  // handing them through verbatim is both simpler and more honest.
  dateStrings: true,

  ssl: config.db.tls
    ? {
        ...(config.db.ca ? { ca: config.db.ca } : { rejectUnauthorized: false }),
        minVersion: 'TLSv1.2',
      }
    : undefined,
})

export type Row = Record<string, unknown>

/** Values mysql2 will bind to a placeholder. */
export type Param = string | number | boolean | null | Date | Buffer
export type Params = Param[]

/** Single-row query. Returns undefined when the query matches nothing. */
export async function queryOne<T = Row>(sql: string, params: Params = []): Promise<T | undefined> {
  const [rows] = await pool.query(sql, params)
  return (rows as T[])[0]
}

/** Multi-row query. Always an array, empty when nothing matches. */
export async function queryAll<T = Row>(sql: string, params: Params = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params)
  return rows as T[]
}

/** INSERT/UPDATE/DELETE. Returns the number of affected rows. */
export async function execute(sql: string, params: Params = []): Promise<number> {
  const [result] = await pool.execute(sql, params)
  return (result as mysql.ResultSetHeader).affectedRows
}

/**
 * Run `fn` inside a transaction, committing on success and rolling back on any
 * throw. The connection is always returned to the pool.
 *
 * Note for TiDB: DDL inside `fn` causes an implicit commit, so keep schema
 * changes out of transactions. Migrations do their own bookkeeping instead.
 */
export async function withTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/** Current time as the naive 'YYYY-MM-DD HH:MM:SS' string the schema stores. */
export function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** Liveness probe. Rejects if the pool cannot reach the database. */
export async function ping(): Promise<void> {
  await pool.query('SELECT 1')
}

export async function closePool(): Promise<void> {
  await pool.end()
}