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
import { clubSlug } from '../domain/slug.js'

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

type DivisionRanges = {
  promotion_from: number | null
  promotion_to: number | null
  relegation_from: number | null
  relegation_to: number | null
}

function parsePosition(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null
  const position = Number(value)
  if (!Number.isSafeInteger(position) || position < 1 || position > 1000) {
    throw Object.assign(new Error(`${field} must be a standings position between 1 and 1000.`), {
      status: 400,
    })
  }
  return position
}

function parseDivisionRanges(body: Record<string, unknown> | undefined): DivisionRanges {
  const ranges: DivisionRanges = {
    promotion_from: parsePosition(body?.promotion_from, 'promotion_from'),
    promotion_to: parsePosition(body?.promotion_to, 'promotion_to'),
    relegation_from: parsePosition(body?.relegation_from, 'relegation_from'),
    relegation_to: parsePosition(body?.relegation_to, 'relegation_to'),
  }
  const checkRange = (label: string, from: number | null, to: number | null) => {
    if ((from === null) !== (to === null)) {
      throw Object.assign(new Error(`${label} requires both a start and end position.`), {
        status: 400,
      })
    }
    if (from !== null && to !== null && from > to) {
      throw Object.assign(new Error(`${label} start position must not exceed its end position.`), {
        status: 400,
      })
    }
  }
  checkRange('Promotion range', ranges.promotion_from, ranges.promotion_to)
  checkRange('Relegation range', ranges.relegation_from, ranges.relegation_to)
  const promotionFrom = ranges.promotion_from
  const promotionTo = ranges.promotion_to
  const relegationFrom = ranges.relegation_from
  const relegationTo = ranges.relegation_to
  if (
    promotionFrom !== null &&
    promotionTo !== null &&
    relegationFrom !== null &&
    relegationTo !== null &&
    promotionFrom <= relegationTo &&
    relegationFrom <= promotionTo
  ) {
    throw Object.assign(new Error('Promotion and relegation ranges must not overlap.'), {
      status: 400,
    })
  }
  return ranges
}

function parseKickoff(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw Object.assign(new Error('kickoff must be a local date and time or null.'), { status: 400 })
  }

  const [date, time] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const valid = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (
    valid.getUTCFullYear() !== year ||
    valid.getUTCMonth() !== month - 1 ||
    valid.getUTCDate() !== day ||
    valid.getUTCHours() !== hour ||
    valid.getUTCMinutes() !== minute
  ) {
    throw Object.assign(new Error('kickoff is not a valid date and time.'), { status: 400 })
  }
  return `${date} ${time}:00`
}

/* --------------------------------------------------------------- results */

admin.post(
  '/matches',
  handler(async (req, res) => {
    const homeSlug = requiredString(req.body?.homeSlug, 'homeSlug', 140)
    const awaySlug = requiredString(req.body?.awaySlug, 'awaySlug', 140)
    if (homeSlug === awaySlug) {
      return res.status(400).json({ error: 'Choose two different clubs.' })
    }
    const kickoff = parseKickoff(req.body?.kickoff)

    const result = await withTransaction(async (conn) => {
      const findClub = async (slug: string) => {
        const [rows] = await conn.query(
          `SELECT c.id, c.name, d.id AS division_id, s.id AS season_id
             FROM clubs c
             JOIN division_clubs dc ON dc.club_id = c.id
             JOIN divisions d ON d.id = dc.division_id
             JOIN seasons s ON s.id = d.season_id AND s.is_current = TRUE
            WHERE c.slug = ? AND c.status = 'active'
            ORDER BY dc.id DESC LIMIT 1`,
          [slug],
        )
        return (rows as Array<{
          id: number
          name: string
          division_id: number
          season_id: number
        }>)[0]
      }
      const [home, away] = await Promise.all([findClub(homeSlug), findClub(awaySlug)])
      if (!home || !away) {
        return { error: 'Both clubs must be active and entered in the current season.' as const, status: 400 }
      }
      if (home.division_id !== away.division_id || home.season_id !== away.season_id) {
        return { error: 'Choose two clubs from the same current division.' as const, status: 400 }
      }

      const [standings] = await conn.query(
        `SELECT club_id FROM standings_snapshot
          WHERE season_id = ? AND division_id = ? AND club_id IN (?, ?)`,
        [home.season_id, home.division_id, home.id, away.id],
      )
      if ((standings as unknown[]).length !== 2) {
        return {
          error: 'Both clubs need a current standings row before they can be scheduled.' as const,
          status: 409,
        }
      }

      const [duplicate] = await conn.query(
        `SELECT id FROM matches
          WHERE season_id = ? AND home_club_id = ? AND away_club_id = ? AND kickoff <=> ?
          LIMIT 1`,
        [home.season_id, home.id, away.id, kickoff],
      )
      if ((duplicate as unknown[]).length > 0) {
        return { error: 'This fixture already exists with that kickoff time.' as const, status: 409 }
      }

      const [inserted] = await conn.execute(
        `INSERT INTO matches
           (division_id, season_id, home_club_id, away_club_id, kickoff, status,
            home_score, away_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NOW(), NOW())`,
        [
          home.division_id,
          home.season_id,
          home.id,
          away.id,
          kickoff,
          kickoff === null ? 'unscheduled' : 'scheduled',
        ],
      )
      return { id: (inserted as any).insertId }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    const match = await queryOne(
      `SELECT m.id, m.kickoff, m.status, m.home_score, m.away_score,
              home.name AS home_name, home.slug AS home_slug, home.short_code AS home_code,
              home.logo_local AS home_logo,
              away.name AS away_name, away.slug AS away_slug, away.short_code AS away_code,
              away.logo_local AS away_logo
         FROM matches m
         JOIN clubs home ON home.id = m.home_club_id
         JOIN clubs away ON away.id = m.away_club_id
        WHERE m.id = ?`,
      [result.id],
    )
    if (!match) throw new Error('Created fixture could not be loaded.')
    res.status(201).json({ match })
  }),
)

admin.patch(
  '/matches/:id/schedule',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Match id must be an integer.' })
    }
    if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, 'kickoff')) {
      return res.status(400).json({ error: 'kickoff must be supplied (use null to unschedule).' })
    }
    const kickoff = parseKickoff(req.body.kickoff)
    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        'SELECT id, season_id, home_club_id, away_club_id, home_score, away_score FROM matches WHERE id = ? FOR UPDATE',
        [id],
      )
      const match = (rows as Array<{
        id: number
        season_id: number
        home_club_id: number
        away_club_id: number
        home_score: number | null
        away_score: number | null
      }>)[0]
      if (!match) return { error: 'Match not found.' as const, status: 404 }

      const [duplicates] = await conn.query(
        `SELECT id FROM matches
          WHERE id <> ? AND season_id = ? AND home_club_id = ? AND away_club_id = ? AND kickoff <=> ?
          LIMIT 1`,
        [id, match.season_id, match.home_club_id, match.away_club_id, kickoff],
      )
      if ((duplicates as unknown[]).length > 0) {
        return { error: 'Another fixture already has that kickoff time.' as const, status: 409 }
      }

      const status =
        match.home_score !== null && match.away_score !== null
          ? 'finished'
          : kickoff === null
            ? 'unscheduled'
            : 'scheduled'
      await conn.execute(
        'UPDATE matches SET kickoff = ?, status = ?, updated_at = NOW() WHERE id = ?',
        [kickoff, status, id],
      )
      return { ok: true as const, kickoff }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.json(result)
  }),
)

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
        `UPDATE matches SET home_score = NULL, away_score = NULL,
                status = IF(kickoff IS NULL, 'unscheduled', 'scheduled'), updated_at = NOW()
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
 *
 * Restricted to clubs that actually have a manager account. The seed carries
 * over the source site's own status, and around two thirds of the crawled
 * clubs were marked pending *there* — so 'pending' alone is full of historical
 * registrations that nobody is waiting on. They are decided by whoever runs
 * the league, not by this queue, and offering an Approve/Reject button on a
 * real club from 2023 is how one gets withdrawn by accident.
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
          AND EXISTS (SELECT 1 FROM users m WHERE m.club_id = c.id)
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


/* ------------------------------------------------------ division management */

admin.post(
  '/divisions',
  handler(async (req, res) => {
    const name = requiredString(req.body?.name, 'name', 64)
    const ranges = parseDivisionRanges(req.body)
    const division = await withTransaction(async (conn) => {
      const [seasonRows] = await conn.query(
        'SELECT id, name, year FROM seasons WHERE is_current = TRUE LIMIT 1 FOR UPDATE',
      )
      const season = (seasonRows as Array<{ id: number; name: string; year: number }>)[0]
      if (!season) return null

      const [duplicates] = await conn.query(
        'SELECT id FROM divisions WHERE season_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
        [season.id, name],
      )
      if ((duplicates as unknown[]).length > 0) {
        throw Object.assign(new Error('A division with that name already exists this season.'), {
          status: 409,
        })
      }

      const baseSlug = clubSlug(name) || 'division'
      let slug = `${baseSlug}-${season.year}`
      let suffix = 2
      while (true) {
        const [existing] = await conn.query('SELECT id FROM divisions WHERE slug = ? LIMIT 1', [slug])
        if ((existing as unknown[]).length === 0) break
        slug = `${baseSlug}-${season.year}-${suffix++}`
      }
      const [inserted] = await conn.execute(
        `INSERT INTO divisions
           (season_id, name, slug, promotion_from, promotion_to, relegation_from, relegation_to, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          season.id,
          name,
          slug,
          ranges.promotion_from,
          ranges.promotion_to,
          ranges.relegation_from,
          ranges.relegation_to,
        ],
      )
      const id = (inserted as { insertId: number }).insertId
      return {
        id,
        name,
        slug,
        season_id: season.id,
        season: season.name,
        ...ranges,
      }
    })
    if (!division) return res.status(404).json({ error: 'There is no current season.' })
    res.status(201).json({ division })
  }),
)

admin.put(
  '/divisions/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Division id must be a positive integer.' })
    }
    const name = requiredString(req.body?.name, 'name', 64)
    const ranges = parseDivisionRanges(req.body)
    const division = await withTransaction(async (conn) => {
      const [divisionRows] = await conn.query(
          `SELECT d.id, d.name, d.slug, d.season_id, s.name AS season, s.year
           FROM divisions d
           JOIN seasons s ON s.id = d.season_id AND s.is_current = TRUE
          WHERE d.id = ? FOR UPDATE`,
        [id],
      )
      const current = (divisionRows as Array<{
        id: number
          name: string
          slug: string
          season_id: number
          season: string
          year: number
      }>)[0]
      if (!current) return null

      const [duplicates] = await conn.query(
        'SELECT id FROM divisions WHERE season_id = ? AND LOWER(name) = LOWER(?) AND id <> ? LIMIT 1',
        [current.season_id, name, id],
      )
      if ((duplicates as unknown[]).length > 0) {
        throw Object.assign(new Error('A division with that name already exists this season.'), {
          status: 409,
        })
      }

      let slug = current.slug
      if (name !== current.name) {
        const baseSlug = clubSlug(name) || 'division'
        slug = `${baseSlug}-${current.year}`
        let suffix = 2
        while (true) {
          const [existing] = await conn.query(
            'SELECT id FROM divisions WHERE slug = ? AND id <> ? LIMIT 1',
            [slug, id],
          )
          if ((existing as unknown[]).length === 0) break
          slug = `${baseSlug}-${current.year}-${suffix++}`
        }
      }
      await conn.execute(
        `UPDATE divisions
            SET name = ?, slug = ?, promotion_from = ?, promotion_to = ?,
                relegation_from = ?, relegation_to = ?
          WHERE id = ?`,
        [
          name,
          slug,
          ranges.promotion_from,
          ranges.promotion_to,
          ranges.relegation_from,
          ranges.relegation_to,
          id,
        ],
      )
      return {
        id,
        name,
        slug,
        season_id: current.season_id,
        season: current.season,
        ...ranges,
      }
    })
    if (!division) return res.status(404).json({ error: 'Current-season division not found.' })
    res.json({ division })
  }),
)

/* ------------------------------------------------------- division assignment */

/**
 * The manager account that owns a club, if there is one.
 *
 * New clubs always have an owner by construction, so this normally resolves. A
 * nil result is tolerated rather than treated as an error: the write already
 * succeeded, and failing the request because a notification had no address
 * would undo nothing and confuse whoever pressed the button.
 */
async function notifyClubManagers(
  clubId: number,
  kind: string,
  title: string,
  body: string,
): Promise<void> {
  const owner = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE club_id = ? AND is_active = TRUE LIMIT 1',
    [clubId],
  )
  if (owner) await notify(owner.id, kind, title, body, '/dashboard')
}

/**
 * Put a club into a division.
 *
 * Creates the standings_snapshot row as well as the membership. Membership
 * alone would leave the club in `division_clubs` and absent from every table:
 * the standings page reads standings_snapshot, and applyResult only ever
 * *adjusts* a row that already exists there — it cannot conjure one. So a club
 * that joined without this step would be invisible until it happened to play,
 * and a result entered against it would have nothing to apply to.
 *
 * Position is the bottom of the table. A newly admitted club has played
 * nothing, so any position but last would be a claim it had not earned.
 */
admin.post(
  '/clubs/:slug/division',
  handler(async (req, res) => {
    const slug = requiredString(req.params.slug, 'slug', 140)
    const raw = Number.parseInt(String(req.body?.divisionId), 10)
    if (!Number.isInteger(raw)) {
      return res.status(400).json({ error: 'divisionId must be an integer.' })
    }

    const club = await queryOne<{ id: number; name: string }>(
      'SELECT id, name FROM clubs WHERE slug = ?',
      [slug],
    )
    if (!club) return res.status(404).json({ error: 'Club not found.' })

    const division = await queryOne<{ id: number; name: string; season_id: number }>(
      `SELECT d.id, d.name, d.season_id
         FROM divisions d
         JOIN seasons s ON s.id = d.season_id AND s.is_current = TRUE
        WHERE d.id = ?`,
      [raw],
    )
    if (!division) return res.status(404).json({ error: 'Division not found.' })

    await withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO division_clubs (division_id, club_id, code_at_registration, created_at)
         VALUES (?, ?, (SELECT short_code FROM clubs WHERE id = ?), NOW())
         ON DUPLICATE KEY UPDATE code_at_registration = VALUES(code_at_registration)`,
        [division.id, club.id, club.id],
      )

      // Re-entering a division the club already holds is a no-op rather than a
      // second row: uq_standings makes that impossible, and resetting a club's
      // position on re-assign would throw away results it has since played.
      const [existing] = await conn.query(
        'SELECT id FROM standings_snapshot WHERE season_id = ? AND division_id = ? AND club_id = ?',
        [division.season_id, division.id, club.id],
      )
      if ((existing as any[]).length > 0) return

      const [bottom] = await conn.query(
        'SELECT COALESCE(MAX(position), 0) + 1 AS pos FROM standings_snapshot WHERE season_id = ? AND division_id = ?',
        [division.season_id, division.id],
      )
      const position = Number((bottom as any[])[0]?.pos ?? 1)

      await conn.execute(
        `INSERT INTO standings_snapshot
           (season_id, division_id, club_id, position, played, won, drawn, lost,
            goals_for, goals_against, goal_difference, points, form, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, '', NOW())`,
        [division.season_id, division.id, club.id, position],
      )
    })

    await notifyClubManagers(
      club.id,
      'club_division',
      `${club.name} entered ${division.name}`,
      `${club.name} has been entered into ${division.name} and now appears in the league table.`,
    )

    res.json({ ok: true, divisionId: division.id, divisionName: division.name })
  }),
)
