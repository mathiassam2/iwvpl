/**
 * Accounts, sessions and notifications.
 *
 * Passwords are bcrypt hashes; the plaintext is never stored, logged or
 * compared directly. Sessions are server-side rows rather than signed tokens,
 * so revoking one is a DELETE. The cookie carries a random token and the table
 * carries only its SHA-256 — a database dump does not hand out live sessions.
 */

import bcrypt from 'bcryptjs'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { config } from '../config.js'
import { execute, now, queryOne } from '../db.js'

/** 'owner' | 'admin' | 'club_manager' | 'player'. */
export type Role = 'owner' | 'admin' | 'club_manager' | 'player'

export const ROLES: Role[] = ['owner', 'admin', 'club_manager', 'player']

/** Roles that own a club and can sign players. */
export const MANAGER_ROLES: Role[] = ['owner', 'admin', 'club_manager']

export interface AccountUser {
  id: number
  email: string
  display_name: string | null
  role: Role
  club_id: number | null
  player_id: number | null
  gamertag: string | null
}

/** What the browser is allowed to see. Never includes club_id or player_id raw
 *  ids beyond what the UI needs to route; no password material, ever. */
export interface PublicUser {
  id: number
  email: string
  name: string
  role: Role
  clubId: number | null
  clubName: string | null
  clubSlug: string | null
  /** 'active' | 'pending' | 'withdrawn'. Null when the account owns no club. */
  clubStatus: string | null
  playerId: number | null
  gamertag: string | null
  unread: number
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

/* ------------------------------------------------------------- passwords */

/** Bcrypt silently truncates past 72 bytes, so a 200-character password would
 *  hash to the same value as its own first 72 bytes. Rejecting is clearer than
 *  accepting a password weaker than it looks. */
export const MAX_PASSWORD_BYTES = 72

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.auth.bcryptRounds)
}

const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function encode64(input: Buffer, count: number): string {
  let output = ''
  let i = 0
  do {
    let value = input[i++]
    output += ITOA64[value & 0x3f]
    if (i < count) value |= input[i] << 8
    output += ITOA64[(value >> 6) & 0x3f]
    if (i++ >= count) break
    if (i < count) value |= input[i] << 16
    output += ITOA64[(value >> 12) & 0x3f]
    if (i++ >= count) break
    output += ITOA64[(value >> 18) & 0x3f]
  } while (i < count)
  return output
}

export function verifyPhpass(plain: string, hash: string): boolean {
  if (hash.length !== 34) return false
  const id = hash.slice(0, 3)
  if (id !== '$P$' && id !== '$H$') return false
  const countLog2 = ITOA64.indexOf(hash[3])
  if (countLog2 < 7 || countLog2 > 30) return false
  let count = 1 << countLog2
  const salt = hash.slice(4, 12)
  if (salt.length !== 8) return false

  let digest = createHash('md5').update(salt + plain, 'utf8').digest()
  while (count > 0) {
    digest = createHash('md5').update(Buffer.concat([digest, Buffer.from(plain, 'utf8')])).digest()
    count--
  }

  const output = hash.slice(0, 12) + encode64(digest, 16)
  return output === hash
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    if (hash.startsWith('$P$') || hash.startsWith('$H$')) {
      return verifyPhpass(plain, hash)
    }
    if (hash.startsWith('$wp')) {
      const prehashed = createHmac('sha384', 'wp-sha384')
        .update(plain, 'utf8')
        .digest('base64')
      const bHash = hash.slice(3).replace(/^\$2y\$/, '$2b$')
      return await bcrypt.compare(prehashed, bHash)
    }
    if (/^[0-9a-f]{32}$/i.test(hash)) {
      return createHash('md5').update(plain, 'utf8').digest('hex').toLowerCase() === hash.toLowerCase()
    }
    const normalizedHash = hash.replace(/^\$2y\$/, '$2b$')
    return await bcrypt.compare(plain, normalizedHash)
  } catch {
    // A malformed hash in the database must read as "wrong password", never as
    // a 500 that tells an attacker the row exists.
    return false
  }
}

/* -------------------------------------------------------------- sessions */

export async function createSession(userId: number, req: Request): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const agent = (req.get('user-agent') ?? '').slice(0, 255) || null
  // trust proxy is set in server.ts, so req.ip is the client, not Render.
  const ip = (req.ip ?? '').slice(0, 45) || null

  await execute(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, created_at, expires_at)
     VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [userId, sha256(token), agent, ip, config.auth.sessionDays],
  )
  return token
}

/**
 * Resolve a cookie token to its account.
 *
 * Returns undefined for a missing, unknown, expired or deactivated token. The
 * expiry is enforced in SQL rather than in JavaScript so a clock skew between
 * two Render instances cannot extend a session.
 */
export function getAllTokens(req: Request): string[] {
  const header = req.headers.cookie
  if (!header) return []
  const name = config.auth.cookieName
  const tokens: string[] = []
  const regex = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, 'g')
  let m: RegExpExecArray | null
  while ((m = regex.exec(header)) !== null) {
    if (m[1]) {
      const val = decodeURIComponent(m[1].trim())
      if (val && !tokens.includes(val)) {
        tokens.push(val)
      }
    }
  }
  return tokens
}

export async function resolveSession(tokenOrTokens: string | string[] | undefined): Promise<AccountUser | undefined> {
  if (!tokenOrTokens) return undefined
  const tokens = Array.isArray(tokenOrTokens) ? tokenOrTokens : [tokenOrTokens]
  if (tokens.length === 0) return undefined

  for (const t of tokens) {
    if (!t) continue
    const user = await queryOne<AccountUser>(
      `SELECT u.id, u.email, u.display_name, u.role, u.club_id,
              p.id AS player_id, p.gamertag
         FROM sessions s
         JOIN users u    ON u.id = s.user_id
         LEFT JOIN players p ON p.user_id = u.id
        WHERE s.token_hash = ?
          AND s.expires_at > NOW()
          AND u.is_active = TRUE`,
      [sha256(t)],
    )
    if (user) return user
  }
  return undefined
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return
  await execute('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)])
}

/** Drop expired rows. Cheap, idempotent, and called on boot so the table does
 *  not grow without bound between clean deploys. */
export async function pruneExpiredSessions(): Promise<void> {
  await execute('DELETE FROM sessions WHERE expires_at <= NOW()')
}

/* ---------------------------------------------------------------- cookies */

/**
 * Cookie attributes.
 *
 * SameSite=None is required, not a preference: the public site is served from
 * GitHub Pages while this API runs on Render, which makes every session cookie
 * cross-site. A browser drops a SameSite=Lax cookie before it is ever sent on
 * those requests, and SameSite=None is only honoured with Secure.
 *
 * In development both ends are on loopback and same-site, so Lax is used: it
 * avoids the Secure requirement, which would otherwise reject the cookie over
 * plain http.
 */
function cookieBase() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax' as const,
    path: '/',
  }
}

export function clearSessionCookie(res: Response): void {
  const name = config.auth.cookieName
  const base = cookieBase()
  // 1. Clear standard host-only cookie
  res.clearCookie(name, base)
  // 2. Clear any lingering domain-scoped cookies across all subdomains/variations
  res.clearCookie(name, { ...base, domain: '.iwvpl.asia' })
  res.clearCookie(name, { ...base, domain: 'iwvpl.asia' })
  res.clearCookie(name, { ...base, domain: '.beta.iwvpl.asia' })
  res.clearCookie(name, { ...base, domain: 'beta.iwvpl.asia' })
}

export function setSessionCookie(res: Response, token: string): void {
  const name = config.auth.cookieName
  const base = cookieBase()
  // Cleanly wipe any stale domain variations before setting clean host-only cookie
  res.clearCookie(name, { ...base, domain: '.iwvpl.asia' })
  res.clearCookie(name, { ...base, domain: 'iwvpl.asia' })
  res.clearCookie(name, { ...base, domain: '.beta.iwvpl.asia' })
  res.clearCookie(name, { ...base, domain: 'beta.iwvpl.asia' })

  res.cookie(name, token, {
    ...base,
    maxAge: config.auth.sessionDays * 24 * 60 * 60 * 1000,
  })
}

/* ---------------------------------------------------------- notifications */

export async function notify(
  userId: number,
  kind: string,
  title: string,
  body: string | null = null,
  link: string | null = null,
): Promise<void> {
  await execute(
    `INSERT INTO notifications (user_id, kind, title, body, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, FALSE, NOW())`,
    [userId, kind, title.slice(0, 160), body?.slice(0, 400) ?? null, link?.slice(0, 255) ?? null],
  )
}

/* ------------------------------------------------------------ projection */

export async function unreadCount(userId: number): Promise<number> {
  const row = await queryOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = FALSE',
    [userId],
  )
  return Number(row?.n ?? 0)
}

/**
 * The shape the client receives from /api/auth/me.
 *
 * `name` is display_name, then the gamertag, then the local part of the email.
 * A manager with no display name still renders as something better than an
 * address in the header.
 */
export async function toPublicUser(user: AccountUser): Promise<PublicUser> {
  let effectiveClubId: number | null = null
  if (user.role === 'club_manager') {
    effectiveClubId = user.club_id
  } else if (user.player_id) {
    const p = await queryOne<{ club_id: number | null; is_free_agent: number }>(
      'SELECT club_id, is_free_agent FROM players WHERE id = ?',
      [user.player_id],
    )
    if (p && !p.is_free_agent && p.club_id) {
      effectiveClubId = p.club_id
    }
  }

  const club = effectiveClubId
    ? await queryOne<{ name: string; slug: string; status: string }>(
        'SELECT name, slug, status FROM clubs WHERE id = ?',
        [effectiveClubId],
      )
    : undefined

  return {
    id: user.id,
    email: user.email,
    name: user.display_name || user.gamertag || user.email.split('@')[0],
    role: user.role,
    clubId: effectiveClubId,
    clubName: club?.name ?? null,
    clubSlug: club?.slug ?? null,
    clubStatus: club?.status ?? null,
    playerId: user.player_id ?? null,
    gamertag: user.gamertag ?? null,
    unread: await unreadCount(user.id),
  }
}

export const timestamp = now