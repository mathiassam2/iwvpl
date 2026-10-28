/**
 * Account routes: /api/auth/*
 *
 * Two roles can self-register: `player` and `club_manager`. `owner` and `admin`
 * are never created here — they are inserted by an administrator, because the
 * moment the public can mint itself an admin the permission model is fiction.
 *
 * A club_manager registration also creates the club. That club is left out of
 * every division on purpose: a manager may name a club, but which division it
 * competes in is a league decision, and an unassigned club is visible in the
 * admin app rather than silently joining a table it was never entered into.
 */

import { Router } from 'express'
import { execute, queryOne, withTransaction } from '../db.js'
import { findAndMigrateWordPressUser } from '../domain/wordpressAuth.js'
import { attachUser } from '../middleware/auth.js'
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  MAX_PASSWORD_BYTES,
  notify,
  resolveSession,
  revokeSession,
  setSessionCookie,
  toPublicUser,
  verifyPassword,
  type AccountUser,
} from '../domain/auth.js'
import { clubSlug, gamertagKey } from '../domain/slug.js'
import { config } from '../config.js'
import { createRateLimiter } from '../middleware/rateLimit.js'
import { getManagerPasscodeSettings } from '../domain/settings.js'
import { verifyManagerInvite } from '../domain/invites.js'

export const auth = Router()

// Rate limiters to prevent brute-force attacks and credential stuffing
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
})

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many accounts created from this IP. Please try again later.',
})

function handler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next)
}

/** 400 with a message written for the person reading it, not the developer. */
function bad(message: string): never {
  throw Object.assign(new Error(message), { status: 400 })
}

function clean(value: unknown, field: string, max: number): string {
  const s = String(value ?? '').trim()
  if (!s) bad(`${field} is required.`)
  if (s.length > max) bad(`${field} is too long.`)
  return s
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function email(value: unknown): string {
  const s = clean(value, 'Email', 190).toLowerCase()
  if (!EMAIL_RE.test(s)) bad('That email address looks incomplete.')
  return s
}

function password(value: unknown): string {
  const s = String(value ?? '')
  if (!s) bad('Password is required.')
  // Matches the existing login form's minimum, so the same credentials work
  // whichever end validated them.
  if (s.length < 8) bad('Use at least 8 characters.')
  if (Buffer.byteLength(s, 'utf8') > MAX_PASSWORD_BYTES) {
    bad('That password is too long.')
  }
  return s
}

/* ------------------------------------------------ registration settings */

auth.get(
  '/registration-settings',
  handler(async (_req, res) => {
    const settings = await getManagerPasscodeSettings()
    res.json({
      managerPasscodeRequired: true,
      fallbackPasscodeEnabled: settings.enabled,
    })
  }),
)


auth.post(
  '/verify-invite',
  handler(async (req, res) => {
    const code = String(req.body?.code ?? '').trim()
    const email = req.body?.email ? String(req.body.email).trim() : undefined
    const clubName = req.body?.clubName ? String(req.body.clubName).trim() : undefined
    const result = await verifyManagerInvite(code, email, clubName)
    if (!result.valid) {
      const passcodeSettings = await getManagerPasscodeSettings()
      if (passcodeSettings.enabled && code.toLowerCase() === passcodeSettings.passcode.toLowerCase()) {
        return res.json({ valid: true, invite: null, type: 'passcode' })
      }
      return res.status(400).json({ valid: false, error: result.error || 'Invalid or expired invite code.' })
    }
    res.json({ valid: true, invite: result.invite, type: 'invite' })
  }),
)

/* ------------------------------------------------------------- register */

auth.post(
  '/register',
  registerLimiter,
  handler(async (req, res) => {
    const role = String(req.body?.role ?? '')
    if (role !== 'player' && role !== 'club_manager') {
      bad('Choose whether you are joining as a player or a manager.')
    }

    const address = email(req.body?.email)
    const secret = password(req.body?.password)
    const displayName = req.body?.name ? clean(req.body.name, 'Name', 120) : null

    const taken = await queryOne('SELECT id FROM users WHERE email = ?', [address])
    if (taken) {
      // Deliberately the same shape as every other rejection here. Telling a
      // caller that an address is registered turns the signup form into a way
      // to enumerate members.
      throw Object.assign(new Error('That email address cannot be used.'), { status: 400 })
    }

    const hash = await hashPassword(secret)
    let matchedInviteId: number | null = null
    if (role === 'club_manager') {
      const submittedCode = String(
        req.body?.managerPasscode ?? req.body?.passcode ?? req.body?.inviteCode ?? ''
      ).trim()
      if (!submittedCode) {
        bad('Manager invite code is required to register as a club manager. Contact a league admin or Discord.')
      }

      const inviteCheck = await verifyManagerInvite(submittedCode, address, req.body?.clubName ? String(req.body.clubName).trim() : undefined)
      if (inviteCheck.valid && inviteCheck.invite) {
        matchedInviteId = inviteCheck.invite.id
      } else {
        const passcodeSettings = await getManagerPasscodeSettings()
        if (passcodeSettings.enabled && submittedCode.toLowerCase() === passcodeSettings.passcode.toLowerCase()) {
          // Matched general passcode
        } else {
          bad(inviteCheck.error || 'Invalid or expired manager invite code.')
        }
      }
    }


    // Player: create a brand new players row. Existing gamertags belong to
    // people who crawled into the league before accounts existed; they cannot
    // be claimed here, so a collision is reported rather than silently
    // attaching an account to someone else's identity.
    // If gamertag provided (player or playing manager captain)
    const gamertag = req.body?.gamertag ? clean(req.body.gamertag, 'Gamertag', 120) : null
    const rawShirtNumber = req.body?.shirtNumber
    let shirtNumber: number | null = null
    if (
      rawShirtNumber !== undefined &&
      rawShirtNumber !== null &&
      String(rawShirtNumber).trim() !== ''
    ) {
      const parsedShirt = Number.parseInt(String(rawShirtNumber), 10)
      if (!Number.isInteger(parsedShirt) || parsedShirt < 1 || parsedShirt > 99) {
        bad('Jersey number must be a whole number between 1 and 99.')
      }
      shirtNumber = parsedShirt
    }
    const clubName = role === 'club_manager' ? clean(req.body?.clubName, 'Club name', 120) : null

    /* Optional. The code is decorative — it is not unique and slugs are the
       real identity — but a manager naming their own club knows what to call
       it, and it saves an admin a round trip. Uppercased because every
       existing code in the crawl is. */
    const shortCode =
      role === 'club_manager' && req.body?.shortCode
        ? clean(req.body.shortCode, 'Short code', 8).toUpperCase()
        : null

    const regionRaw =
      role === 'club_manager' && req.body?.region ? String(req.body.region).trim() : ''
    const REGION_FLAGS: Record<string, string> = {
      singapore: '🇸🇬',
      sg: '🇸🇬',
      malaysia: '🇲🇾',
      my: '🇲🇾',
      indonesia: '🇮🇩',
      id: '🇮🇩',
      thailand: '🇹🇭',
      th: '🇹🇭',
      brunei: '🇧🇳',
      bn: '🇧🇳',
      philippines: '🇵🇭',
      ph: '🇵🇭',
      vietnam: '🇻🇳',
      vn: '🇻🇳',
    }
    const clubFlag =
      role === 'club_manager' && regionRaw
        ? REGION_FLAGS[regionRaw.toLowerCase()] ?? (regionRaw.length <= 16 ? regionRaw : null)
        : null

    const clubLogoRaw =
      role === 'club_manager' && req.body?.clubLogo ? String(req.body.clubLogo).trim() : ''
    if (clubLogoRaw.length > 6_000_000) {
      bad('Club logo image is too large.')
    }
    const clubLogo = clubLogoRaw || null

    if (gamertag) {
      const clash = await queryOne(
        'SELECT id FROM players WHERE gamertag_key = ?',
        [gamertagKey(gamertag)],
      )
      if (clash) {
        throw Object.assign(
          new Error(
            'That gamertag is already registered in the league. ' +
              'Contact the league admin to link your account.',
          ),
          { status: 400 },
        )
      }
    }

    if (clubName) {
      const clash = await queryOne('SELECT id FROM clubs WHERE slug = ?', [clubSlug(clubName)])
      if (clash) {
        throw Object.assign(
          new Error('A club with that name already exists.'),
          { status: 400 },
        )
      }
    }

    const created = await withTransaction(async (conn) => {
      let clubId: number | null = null
      if (clubName) {
        // 'pending', not 'active'. A club name chosen by the public is a claim,
        // not a fact: until a league admin approves it the club exists but is
        // listed nowhere public and cannot play fixtures. GET /api/clubs
        // already filters on status, so pending needs no separate hiding.
        const [res] = await conn.execute(
          `INSERT INTO clubs (name, slug, short_code, flag, logo_local, logo_url, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
          [clubName, clubSlug(clubName), shortCode, clubFlag, clubLogo, clubLogo],
        )
        clubId = (res as any).insertId
      }

      let playerId: number | null = null
      if (gamertag) {
        const [res] = await conn.execute(
          `INSERT INTO players
             (gamertag, gamertag_key, slug, shirt_number, club_id, is_free_agent, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            gamertag,
            gamertagKey(gamertag),
            clubSlug(gamertag),
            shirtNumber,
            clubId ?? null,
            clubId ? false : true,
          ],
        )
        playerId = (res as any).insertId
      }

      const [userRes] = await conn.execute(
        `INSERT INTO users
           (email, password_hash, display_name, role, club_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
        [address, hash, displayName, role, clubId],
      )
      const userId = (userRes as any).insertId

      // Bind the account to its player. One account controls at most one
      // player, so this cannot collide with an existing row.
      if (playerId) {
        await conn.execute('UPDATE players SET user_id = ? WHERE id = ?', [userId, playerId])
      }

      if (matchedInviteId) {
        await conn.execute(
          'UPDATE manager_invites SET is_used = TRUE, used_by_user_id = ?, used_at = NOW(), updated_at = NOW() WHERE id = ?',
          [userId, matchedInviteId]
        )
      }

      return { userId, clubId, playerId, clubName, gamertag }
    })

    const token = await createSession(created.userId, req)
    setSessionCookie(res, token)

    await notify(
      created.userId,
      'welcome',
      role === 'club_manager' ? 'Club created' : 'Welcome to IWVPL',
      role === 'club_manager'
        ? `${created.clubName} is waiting for league admin approval. You can build your squad in the meantime — it just cannot play fixtures until it is approved.`
        : 'You are a free agent until a club signs you.',
      '/dashboard',
    )

    const user = await resolveSession(token)
    res.status(201).json({ user: user && (await toPublicUser(user)) })
  }),
)

/* ---------------------------------------------------------------- login */

auth.post(
  '/login',
  loginLimiter,
  handler(async (req, res) => {
    const identifier = String(req.body?.email ?? '').trim()
    const secret = String(req.body?.password ?? '')
    if (!identifier || !secret) {
      throw Object.assign(new Error('Enter your email or username and password.'), { status: 400 })
    }

    const lower = identifier.toLowerCase()
    const row = await queryOne<AccountUser & { password_hash: string; is_active: number }>(
      `SELECT u.id, u.email, u.display_name, u.role, u.club_id, u.password_hash, u.is_active,
              p.id AS player_id, p.gamertag
         FROM users u
         LEFT JOIN players p ON p.user_id = u.id
        WHERE LOWER(u.email) = ?
           OR LOWER(u.username) = ?
           OR LOWER(u.display_name) = ?
           OR p.gamertag_key = ?
        ORDER BY (LOWER(u.email) = ?) DESC, (LOWER(u.username) = ?) DESC, u.id ASC
        LIMIT 1`,
      [lower, lower, lower, lower, lower, lower],
    )

    // One message for every failure — unknown address, wrong password, disabled
    // account. Anything more specific is a credential oracle.
    const invalid = () =>
      Object.assign(new Error('Email/username or password is incorrect.'), { status: 401 })

    // Hash against a throwaway hash even when the address is unknown.
    // Returning early would make the response time a reliable signal that the
    // address is not registered, which is the same oracle the generic message
    // exists to close.
    const storedHash =
      row?.password_hash ??
      '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu'

    const ok = await verifyPassword(secret, storedHash)
    let authenticatedUser: AccountUser | null = (row && ok) ? row : null

    // If local authentication failed or account is not in v2 yet, try WordPress auto-migration
    if (!authenticatedUser) {
      const migrated = await findAndMigrateWordPressUser(identifier, secret)
      if (migrated) {
        authenticatedUser = migrated
      }
    }

    if (!authenticatedUser) throw invalid()

    if (row && !row.is_active) {
      throw Object.assign(new Error('That account has been deactivated.'), { status: 403 })
    }

    // If local row had a legacy hash ($P, $H, $wp, or MD5), upgrade to bcrypt on the fly
    if (row && ok && (storedHash.startsWith('$' + 'P$') || storedHash.startsWith('$' + 'H$') || storedHash.startsWith('$' + 'wp') || /^[0-9a-f]{32}$/i.test(storedHash))) {
      const freshHash = await hashPassword(secret)
      await execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [freshHash, row.id])
    }

    const token = await createSession(authenticatedUser.id, req)
    setSessionCookie(res, token)
    res.json({ user: await toPublicUser(authenticatedUser) })
  }),
)

/* --------------------------------------------------------------- logout */

auth.post(
  '/logout',
  handler(async (req, res) => {
    await revokeSession(req.cookies?.[config.auth.cookieName])
    clearSessionCookie(res)
    res.json({ ok: true })
  }),
)

/* ------------------------------------------------------------------ me */

/**
 * Never 401s. The client calls this on boot to decide between the logged-in
 * header and the Login button, so "not signed in" is an answer, not an error.
 */
auth.get(
  '/me',
  attachUser(),
  handler(async (req, res) => {
    if (!req.user) return res.json({ user: null })
    res.json({ user: await toPublicUser(req.user) })
  }),
)