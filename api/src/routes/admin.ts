/**
 * Admin write endpoints.
 *
 * Gated by HTTP basic auth in server.ts. That gate keeps the admin bundle
 * unfetchable; it does not express *who* is allowed to do what. There is one
 * shared credential, so every caller here is the same person with full rights.
 * Per-user permissions would come from the `users` table, which exists but is
 * not wired up yet.
 *
 * Everything runs inside a transaction. A result submission touches the match
 * row and both clubs' standings rows at once, and a half-applied scoreline is
 * worse than a rejected one.
 */

import { Router } from 'express'
import { execute, queryAll, queryOne, withTransaction, type Params } from '../db.js'
import { clearResult, setResult } from '../domain/applyResult.js'
import { notify } from '../domain/auth.js'

export const admin = Router()

function handler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next)
}

/** Goals are non-negative and single digit in practice; the ceiling is a guard
 *  against a stray value, not a rule. */
function parseScore(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    throw Object.assign(new Error(`${field} must be a whole number between 0 and 99.`), {
      status: 400,
    })
  }
  return n
}

function requiredString(value: unknown, field: string, max = 160): string {
  const s = String(value ?? '').trim()
  if (!s) throw Object.assign(new Error(`${field} is required.`), { status: 400 })
  if (s.length > max) throw Object.assign(new Error(`${field} is too long.`), { status: 400 })
  return s
}

function optionalString(value: unknown, max = 512): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (s.length > max) throw Object.assign(new Error('Value is too long.'), { status: 400 })
  return s
}

/* --------------------------------------------------------------- results */

/**
 * Record a scoreline.
 *
 * The previous scoreline is read from the stored match, never from the request.
 * If it came from the client, a caller could declare a wrong "previous" value
 * and the standings would drift permanently with no way to detect it.
 */
admin.post(
  '/matches/:id/result',
  handler(async (req, res) => {
    const homeScore = parseScore(req.body.homeScore, 'homeScore')
    const awayScore = parseScore(req.body.awayScore, 'awayScore')
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Match id must be an integer.' })
    }

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT id, season_id, division_id, home_club_id, away_club_id, home_score, away_score
           FROM matches WHERE id = ? FOR UPDATE`,
        [id],
      )
      const match = (rows as any[])[0]
      if (!match) return { error: 'Match not found.' as const, status: 404 }

      const ids = { seasonId: match.season_id, divisionId: match.division_id }
      const wasPlayed = match.home_score !== null && match.away_score !== null
      const previous = wasPlayed
        ? {
            homeClubId: match.home_club_id,
            awayClubId: match.away_club_id,
            homeScore: match.home_score,
            awayScore: match.away_score,
          }
        : null

      await setResult(
        conn,
        ids,
        {
          homeClubId: match.home_club_id,
          awayClubId: match.away_club_id,
          homeScore,
          awayScore,
        },
        previous,
      )

      await conn.execute(
        `UPDATE matches SET home_score = ?, away_score = ?, status = 'finished', updated_at = NOW()
          WHERE id = ?`,
        [homeScore, awayScore, id] as Params,
      )

      return { ids, wasPlayed }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.json({ ok: true, matchId: id, homeScore, awayScore })
  }),
)

/**
 * Withdraw a result and return the clubs to their pre-match state.
 *
 * Useful when a scoreline was entered against the wrong fixture, which is the
 * one mistake an incremental table cannot otherwise be talked out of.
 */
admin.delete(
  '/matches/:id/result',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Match id must be an integer.' })
    }

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT id, season_id, division_id, home_club_id, away_club_id, home_score, away_score
           FROM matches WHERE id = ? FOR UPDATE`,
        [id],
      )
      const match = (rows as any[])[0]
      if (!match) return { error: 'Match not found.' as const, status: 404 }
      if (match.home_score === null || match.away_score === null) {
        return { error: 'That match has no result to withdraw.' as const, status: 409 }
      }

      await clearResult(conn, { seasonId: match.season_id, divisionId: match.division_id }, {
        homeClubId: match.home_club_id,
        awayClubId: match.away_club_id,
        homeScore: match.home_score,
        awayScore: match.away_score,
      })

      await conn.execute(
        `UPDATE matches SET home_score = NULL, away_score = NULL, status = 'scheduled', updated_at = NOW()
          WHERE id = ?`,
        [id],
      )

      return { ok: true }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.json({ ok: true, matchId: id })
  }),
)

/* ----------------------------------------------------------------- clubs */

admin.patch(
  '/clubs/:slug',
  handler(async (req, res) => {
    const slug = requiredString(req.params.slug, 'slug', 140)
    const fields: string[] = []
    const values: Params = []

    if ('name' in req.body) {
      fields.push('name = ?')
      values.push(requiredString(req.body.name, 'name', 120))
    }
    if ('shortCode' in req.body) {
      fields.push('short_code = ?')
      values.push(optionalString(req.body.shortCode, 8))
    }
    if ('flag' in req.body) {
      fields.push('flag = ?')
      values.push(optionalString(req.body.flag, 16))
    }
    if ('logoUrl' in req.body) {
      fields.push('logo_url = ?')
      values.push(optionalString(req.body.logoUrl, 512))
    }
    if ('logoLocal' in req.body) {
      fields.push('logo_local = ?')
      values.push(optionalString(req.body.logoLocal, 512))
    }
    if ('status' in req.body) {
      const status = requiredString(req.body.status, 'status', 32)
      if (!['active', 'pending', 'withdrawn'].includes(status)) {
        return res.status(400).json({ error: 'status must be active, pending or withdrawn.' })
      }
      fields.push('status = ?')
      values.push(status)
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No editable fields supplied.' })
    }

    values.push(slug)
    const affected = await execute(
      `UPDATE clubs SET ${fields.join(', ')}, updated_at = NOW() WHERE slug = ?`,
      values,
    )

    if (affected === 0) {
      return res.status(404).json({ error: 'Club not found.' })
    }
    res.json({ ok: true, slug })
  }),
)

/* --------------------------------------------------------------- players */

/**
 * Add a player to a club's squad.
 *
 * `gamertag_key` is the case-insensitive identity, so registering 'Lethal_Shots11'
 * when 'LethaL_ShoTs11' already exists must fail rather than silently create a
 * second human. The unique index enforces it; this turns the resulting error
 * into a readable one.
 */
admin.post(
  '/clubs/:slug/players',
  handler(async (req, res) => {
    const slug = requiredString(req.params.slug, 'slug', 140)
    const gamertag = requiredString(req.body.gamertag, 'gamertag', 120)

    const result = await withTransaction(async (conn) => {
      const [clubs] = await conn.query('SELECT id FROM clubs WHERE slug = ?', [slug])
      const club = (clubs as any[])[0]
      if (!club) return { error: 'Club not found.' as const, status: 404 }

      const key = gamertag.toLowerCase()
      const [existing] = await conn.query(
        'SELECT id, gamertag, club_id FROM players WHERE gamertag_key = ?',
        [key],
      )
      const found = (existing as any[])[0]
      if (found) {
        return {
          error: `${found.gamertag} is already registered (club_id ${found.club_id ?? 'none'}).`,
          status: 409,
        }
      }

      const [ins] = await conn.query(
        `INSERT INTO players (gamertag, gamertag_key, slug, avatar_url, club_id, is_free_agent, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, FALSE, NOW(), NOW())`,
        [gamertag, key, gamertag.toLowerCase().replace(/\s+/g, '-'), club.id],
      )
      return { ok: true, id: (ins as any).insertId }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.status(201).json(result)
  }),
)

admin.delete(
  '/clubs/:slug/players/:gamertag',
  handler(async (req, res) => {
    const slug = requiredString(req.params.slug, 'slug', 140)
    const gamertag = requiredString(req.params.gamertag, 'gamertag', 120)

    const affected = await execute(
      `UPDATE players SET club_id = NULL, is_free_agent = TRUE, updated_at = NOW()
        WHERE gamertag_key = ? AND club_id = (SELECT id FROM clubs WHERE slug = ?)`,
      [gamertag.toLowerCase(), slug],
    )

    if (affected === 0) {
      return res.status(404).json({ error: 'Player not found on that club.' })
    }
    res.json({ ok: true })
  }),
)

/* ------------------------------------------------------- club applications */

/**
 * Clubs awaiting approval.
 *
 * Every club created from the public registration form lands here as 'pending'.
 * It is a claim about a name and an owner, not a fact about the league, so an
 * admin decides. GET /api/clubs already hides anything not 'active', so a
 * pending club is invisible publicly from the moment it is created.
 *
 * The manager's details come along because the decision is about the pair —
 * approving a club whose owner cannot be contacted is not much use.
 *
 * Newest first. A queue people are waiting on is read top-down and acted on
 * from the top; oldest-first buries today's applications under yesterday's.
 */
admin.get(
  '/clubs/pending',
  handler(async (_req, res) => {
    const rows = await queryAll(
      `SELECT c.id, c.name, c.slug, c.created_at,
              u.id AS user_id, u.email, u.display_name,
              (SELECT COUNT(*) FROM players p WHERE p.club_id = c.id) AS players
         FROM clubs c
         LEFT JOIN users u ON u.club_id = c.id AND u.is_active = TRUE
        WHERE c.status = 'pending'
        ORDER BY c.created_at DESC, c.id DESC`,
    )
    res.json({ clubs: rows })
  }),
)

/**
 * Approve or reject a pending club.
 *
 * Separate from the generic PATCH /clubs/:slug because this one has to tell
 * the manager what happened. Changing status silently would leave someone
 * staring at a club that never appears, with no way to find out why.
 *
 * Rejected is 'withdrawn' rather than a delete: the account and the club row
 * stay, so the same manager can create another club without colliding on a
 * slug they no longer control.
 */
admin.post(
  '/clubs/:slug/decision',
  handler(async (req, res) => {
    const slug = requiredString(req.params.slug, 'slug', 140)
    const decision = requiredString(req.body.decision, 'decision', 16)
    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ error: 'decision must be approve or reject.' })
    }

    const club = await queryOne<{ id: number; name: string; status: string }>(
      'SELECT id, name, status FROM clubs WHERE slug = ?',
      [slug],
    )
    if (!club) return res.status(404).json({ error: 'Club not found.' })
    if (club.status !== 'pending') {
      return res.status(409).json({ error: `That club is already ${club.status}.` })
    }

    const status = decision === 'approve' ? 'active' : 'withdrawn'
    await execute('UPDATE clubs SET status = ?, updated_at = NOW() WHERE id = ?', [status, club.id])

    const owner = await queryOne<{ id: number }>(
      'SELECT id FROM users WHERE club_id = ? AND is_active = TRUE LIMIT 1',
      [club.id],
    )
    if (owner) {
      await notify(
        owner.id,
        decision === 'approve' ? 'club_approved' : 'club_rejected',
        decision === 'approve' ? `${club.name} approved` : `${club.name} not approved`,
        decision === 'approve'
          ? 'Your club is live on the public site. An admin will assign it to a division before it plays fixtures.'
          : 'A league admin did not approve this club. You can create another one from your dashboard.',
        '/dashboard',
      )
    }

    res.json({ ok: true, status })
  }),
)
