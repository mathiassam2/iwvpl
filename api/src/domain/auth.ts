/**
 * Accounts, sessions and notifications.
 *
 * Passwords are bcrypt hashes; the plaintext is never stored, logged or
 * compared directly. Sessions are server-side rows rather than signed tokens,
 * so revoking one is a DELETE. The cookie carries a random token and the table
 * carries only its SHA-256 — a database dump does not hand out live sessions.
 */

import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
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

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash)
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
export async function resolveSession(token: string | undefined): Promise<AccountUser | undefined> {
  if (!token) return undefined

  return queryOne<AccountUser>(
    `SELECT u.id, u.email, u.display_name, u.role, u.club_id,
            p.id AS player_id, p.gamertag
       FROM sessions s
       JOIN users u    ON u.id = s.user_id
       LEFT JOIN players p ON p.user_id = u.id
      WHERE s.token_hash = ?
        AND s.expires_at > NOW()
        AND u.is_active = TRUE`,
    [sha256(token)],
  )
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
    sameSite: (config.isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.auth.cookieName, token, {
    ...cookieBase(),
    maxAge: config.auth.sessionDays * 24 * 60 * 60 * 1000,
  })
}

/**
 * Clear the cookie.
 *
 * The attributes must match the ones it was set with, including SameSite and
 * Secure. A mismatched pair is treated by browsers as a different cookie, so
 * the old one is left in place and the user stays signed in after "logging
 * out" — which looks like the button simply does not work.
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.auth.cookieName, cookieBase())
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
  const club = user.club_id
    ? await queryOne<{ name: string; slug: string }>(
        'SELECT name, slug FROM clubs WHERE id = ?',
        [user.club_id],
      )
    : undefined

  return {
    id: user.id,
    email: user.email,
    name: user.display_name || user.gamertag || user.email.split('@')[0],
    role: user.role,
    clubId: user.club_id,
    clubName: club?.name ?? null,
    clubSlug: club?.slug ?? null,
    playerId: user.player_id ?? null,
    gamertag: user.gamertag ?? null,
    unread: await unreadCount(user.id),
  }
}

export const timestamp = now