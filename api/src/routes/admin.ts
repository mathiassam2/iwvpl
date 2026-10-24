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
import { hashPassword, MAX_PASSWORD_BYTES, notify } from '../domain/auth.js'
import {
  applySeasonRollover,
  loadRolloverContext,
  loadSeasonFixtureStats,
  planSeasonRollover,
  previewSeasonRollover,
  readCurrentSeasonRollover,
  undoSeasonRollover,
  type RolloverSetting,
} from '../domain/rollover.js'
import { clubSlug, gamertagKey } from '../domain/slug.js'

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

type DivisionMovement = {
  promotion_count: number | null
  relegation_count: number | null
}

function parseMovementCount(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 0 || count > 1000) {
    throw Object.assign(new Error(`${field} must be a whole number between 0 and 1000.`), {
      status: 400,
    })
  }
  return count === 0 ? null : count
}

function parseDivisionMovement(body: Record<string, unknown> | undefined): DivisionMovement {
  return {
    promotion_count: parseMovementCount(body?.promotion_count, 'promotion_count'),
    relegation_count: parseMovementCount(body?.relegation_count, 'relegation_count'),
  }
}

/** How a club changed league. 'transfer' is a league chosen by hand. */
type MovementType = 'promotion' | 'relegation' | 'transfer'

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
    const requestedSeasonId = req.body?.seasonId
    const seasonId =
      requestedSeasonId === undefined || requestedSeasonId === null || requestedSeasonId === ''
        ? null
        : Number(requestedSeasonId)
    if (seasonId !== null && (!Number.isSafeInteger(seasonId) || seasonId < 1)) {
      return res.status(400).json({ error: 'seasonId must be a positive integer.' })
    }

    const result = await withTransaction(async (conn) => {
      const selectedSeason = seasonId === null
        ? (await conn.query(
            'SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1 FOR UPDATE',
          ))[0]
        : (await conn.query('SELECT id FROM seasons WHERE id = ? FOR UPDATE', [seasonId]))[0]
      const selectedSeasonId = (selectedSeason as Array<{ id: number }>)[0]?.id
      if (!selectedSeasonId) {
        return { error: 'Choose an existing season before creating the fixture.' as const, status: 404 }
      }

      const findClub = async (slug: string) => {
        const [rows] = await conn.query(
          `SELECT c.id, c.name, d.id AS division_id, s.id AS season_id
             FROM clubs c
             JOIN division_clubs dc ON dc.club_id = c.id
             JOIN divisions d ON d.id = dc.division_id
             JOIN seasons s ON s.id = d.season_id
            WHERE c.slug = ? AND c.status = 'active' AND s.id = ?
            ORDER BY dc.id DESC LIMIT 1`,
          [slug, selectedSeasonId],
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
        return { error: 'Both clubs must be active and entered in the selected season.' as const, status: 400 }
      }
      if (home.division_id !== away.division_id || home.season_id !== away.season_id) {
        return { error: 'Choose two clubs from the same division in the selected season.' as const, status: 400 }
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

/**
 * Build a round-robin fixture list for one or more leagues.
 *
 * Fixtures are created with no kickoff on purpose. The admin is laying out the
 * season, not committing dates, so everything lands in Needs scheduling and
 * can be dated from there — which is the same state a fixture that was created
 * by hand and left blank is in.
 *
 * Pairs are skipped when that league already has the fixture in either
 * orientation. The unique index on (season, home, away, kickoff) cannot do this
 * for us: it contains NULL for every row we write, and SQL unique indexes do not
 * treat NULLs as equal to each other, so a second run would happily insert the
 * whole season again.
 */
admin.post(
  '/matches/generate',
  handler(async (req, res) => {
    const requestedSeasonId = req.body?.seasonId
    let seasonId: number
    if (requestedSeasonId == null) {
      const current = await queryOne<{ id: number }>(
        'SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1',
      )
      if (!current) return res.status(404).json({ error: 'No current season.' })
      seasonId = current.id
    } else {
      seasonId = Number(requestedSeasonId)
      if (!Number.isSafeInteger(seasonId) || seasonId < 1) {
        return res.status(400).json({ error: 'seasonId must be a positive integer.' })
      }
    }

    const divisionIds = req.body?.divisionIds
    if (
      !Array.isArray(divisionIds) ||
      divisionIds.length === 0 ||
      divisionIds.some((id) => !Number.isSafeInteger(id) || id < 1)
    ) {
      return res.status(400).json({ error: 'divisionIds must be a non-empty array of division IDs.' })
    }

    const rounds = Number(req.body?.rounds)
    // Capped at 2 on purpose. A round robin is one complete set of pairings;
    // repeating it a third time would produce the same fixtures again, and
    // generating genuinely different third and fourth rounds is a real
    // scheduling problem rather than a loop. One leg and home-and-away are the
    // two formats a league actually plays.
    if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 2) {
      return res.status(400).json({ error: 'rounds must be 1 (single round robin) or 2 (home and away).' })
    }

    const result = await withTransaction(async (conn) => {
      const [existingMatches] = await conn.query(
        `SELECT home_club_id, away_club_id
           FROM matches
          WHERE season_id = ?
            AND home_club_id IN (
              SELECT dc.club_id
                FROM division_clubs dc
                JOIN divisions d ON d.id = dc.division_id
               WHERE d.season_id = ? AND d.id IN (?)
            )`,
        [seasonId, seasonId, [divisionIds]],
      )
      // Two sets, because "have these two clubs met" and "does this exact
      // fixture exist" are different questions and conflating them is what made
      // rounds=2 silently behave as rounds=1.
      //
      // existingFixtures is oriented — home:away — so a league already holding
      // A-home-to-B does not block generating B-home-to-A, which is the whole
      // point of a second leg. metPairs is order-independent, so the first leg
      // is skipped when the pairing exists in either direction.
      const existingFixtures = new Set(
        (existingMatches as Array<{ home_club_id: number; away_club_id: number }>).map(
          (m) => fixtureKey(m.home_club_id, m.away_club_id),
        ),
      )
      const metPairs = new Set(
        (existingMatches as Array<{ home_club_id: number; away_club_id: number }>).map((m) =>
          pairKey(m.home_club_id, m.away_club_id),
        ),
      )

      const created: number[] = []
      let skipped = 0
      let missing = 0

      for (const divisionId of divisionIds) {
        const [clubRows] = await conn.query(
          `SELECT c.id
             FROM division_clubs dc
             JOIN divisions d ON d.id = dc.division_id
             JOIN clubs c ON c.id = dc.club_id
            WHERE d.id = ? AND d.season_id = ?
            ORDER BY c.id`,
          [divisionId, seasonId],
        )
        const clubIds = (clubRows as Array<{ id: number }>).map((row) => row.id)

        // Two clubs cannot play each other, so there is nothing to schedule.
        if (clubIds.length < 2) {
          missing += 1
          continue
        }

        const singleRound = roundRobinLegs(clubIds)
        for (let leg = 0; leg < rounds; leg += 1) {
          for (const [a, b] of singleRound) {
            // Swap ends on later legs so nobody plays every home match.
            const [homeId, awayId] = leg % 2 === 0 ? [a, b] : [b, a]
            const exact = fixtureKey(homeId, awayId)
            const pairAlreadyPlayed = metPairs.has(pairKey(homeId, awayId))
            // The first leg skips if the pairing exists either way round; later
            // legs only skip on the exact same fixture, which is what lets the
            // return leg through.
            const duplicate =
              existingFixtures.has(exact) || (leg === 0 && pairAlreadyPlayed)
            if (duplicate) {
              skipped += 1
              continue
            }
            await conn.execute(
              `INSERT INTO matches
                 (division_id, season_id, home_club_id, away_club_id, kickoff, status,
                  home_score, away_score, created_at, updated_at)
               VALUES (?, ?, ?, ?, NULL, 'unscheduled', NULL, NULL, NOW(), NOW())`,
              [divisionId, seasonId, homeId, awayId],
            )
            existingFixtures.add(exact)
            metPairs.add(pairKey(homeId, awayId))
            created.push(0)
          }
        }
      }

      return { created: created.length, skipped, missing }
    })

    res.status(201).json(result)
  }),
)

/** Oriented identity of one fixture: A at home to B. */
function fixtureKey(home: number, away: number): string {
  return `${home}:${away}`
}

/** Order-independent identity of a pairing: "these two have met". */
function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`
}

/**
 * One full single round of fixtures, each club appearing exactly once.
 *
 * The circle method: the first club is held still and everything else rotates
 * around it, which is the standard way to get a balanced schedule where every
 * pair meets exactly once. An odd number of clubs gets a null bye.
 */
function roundRobinLegs(clubIds: number[]): Array<[number, number]> {
  const teams = [...clubIds]
  if (teams.length % 2 !== 0) teams.push(0)
  const n = teams.length
  const rounds = n - 1
  const legs: Array<[number, number]> = []
  for (let r = 0; r < rounds; r += 1) {
    for (let i = 0; i < n / 2; i += 1) {
      const home = teams[i]
      const away = teams[n - 1 - i]
      if (home === 0 || away === 0) continue
      legs.push([home, away])
    }
    // Rotate everyone but the first entry.
    teams.splice(1, 0, teams.pop() as number)
  }
  return legs
}

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

/**
 * Delete every fixture that has no kickoff date.
 *
 * The undo for a season laid out from scratch: the auto-scheduler writes
 * fixtures with a NULL date so they arrive in Needs scheduling, and if the
 * shape is wrong the whole batch has to go rather than be picked through.
 *
 * Registered before /matches/:id on purpose — that route would otherwise
 * swallow this path and 400 on the non-numeric segment.
 *
 * Refuses if any of them somehow carries a result. An undated fixture cannot
 * have been played, so this should never fire; it is here so that if it ever
 * could, the refusal is loud instead of a silent loss of a result.
 */
admin.delete(
  '/matches/unscheduled',
  handler(async (_req, res) => {
    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT m.id, home.name AS home_name, away.name AS away_name,
                m.home_score, m.away_score
           FROM matches m
           JOIN clubs home ON home.id = m.home_club_id
           JOIN clubs away ON away.id = m.away_club_id
          WHERE m.kickoff IS NULL
          FOR UPDATE`,
      )
      const undated = rows as Array<{
        id: number
        home_name: string
        away_name: string
        home_score: number | null
        away_score: number | null
      }>

      const played = undated.filter((m) => m.home_score !== null || m.away_score !== null)
      if (played.length > 0) {
        return {
          status: 409 as const,
          error: `${played.length} of those fixtures have a result recorded against them, so nothing was deleted. Delete those on their own first: ${played
            .slice(0, 3)
            .map((m) => `${m.home_name} vs ${m.away_name}`)
            .join(', ')}${played.length > 3 ? ', …' : ''}.`,
        }
      }

      if (undated.length === 0) return { status: 200 as const, deleted: 0, total: 0 }

      const ids = undated.map((m) => m.id)
      await conn.query('DELETE FROM match_events WHERE match_id IN (?)', [ids])
      await conn.query('DELETE FROM match_stats WHERE match_id IN (?)', [ids])
      await conn.query('DELETE FROM matches WHERE id IN (?)', [ids])
      return { status: 201 as const, deleted: ids.length, total: ids.length }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.status(result.status === 201 ? 200 : 200).json({ ok: true, deleted: result.deleted })
  }),
)

admin.delete(
  '/matches/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Match id must be a positive integer.' })
    }

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT id, season_id, division_id, home_club_id, away_club_id, home_score, away_score
           FROM matches WHERE id = ? FOR UPDATE`,
        [id],
      )
      const match = (rows as Array<{
        id: number
        season_id: number
        division_id: number
        home_club_id: number
        away_club_id: number
        home_score: number | null
        away_score: number | null
      }>)[0]
      if (!match) return { error: 'Match not found.' as const, status: 404 }
      if ((match.home_score === null) !== (match.away_score === null)) {
        return { error: 'That match has an incomplete result and cannot be deleted safely.' as const, status: 409 }
      }

      if (match.home_score !== null && match.away_score !== null) {
        await clearResult(conn, { seasonId: match.season_id, divisionId: match.division_id }, {
          homeClubId: match.home_club_id,
          awayClubId: match.away_club_id,
          homeScore: match.home_score,
          awayScore: match.away_score,
        })
      }

      await conn.execute('DELETE FROM match_events WHERE match_id = ?', [id])
      await conn.execute('DELETE FROM match_stats WHERE match_id = ?', [id])
      await conn.execute('DELETE FROM matches WHERE id = ?', [id])
      return { ok: true as const }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.json({ ok: true, matchId: id })
  }),
)

/**
 * Delete several fixtures at once.
 *
 * The bulk form of DELETE /matches/:id and carries the same guards: a match
 * with one score but not the other cannot be removed safely, and a played match
 * has its contribution taken back out of the standings first so the table does
 * not keep a result nobody can see any more.
 *
 * All of it or none of it. A partial delete from the admin's point of view is
 * worse than a refusal — they asked for a set of fixtures gone and would have no
 * way to tell which half went.
 */
admin.post(
  '/matches/delete',
  handler(async (req, res) => {
    const ids = req.body?.matchIds
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.some((id) => !Number.isSafeInteger(id) || id < 1)
    ) {
      return res
        .status(400)
        .json({ error: 'matchIds must be a non-empty array of match IDs.' })
    }
    if (ids.length > 500) {
      return res.status(400).json({ error: 'Delete at most 500 fixtures at a time.' })
    }

    const result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT id, season_id, division_id, home_club_id, away_club_id, home_score, away_score
           FROM matches WHERE id IN (?) FOR UPDATE`,
        [ids],
      )
      const matches = rows as Array<{
        id: number
        season_id: number
        division_id: number
        home_club_id: number
        away_club_id: number
        home_score: number | null
        away_score: number | null
      }>

      const missing = ids.filter((id) => !matches.some((match) => match.id === id))
      if (missing.length > 0) {
        return {
          error: `Some of those fixtures no longer exist (${missing.length}). Refresh and try again.` as const,
          status: 409,
        }
      }

      for (const match of matches) {
        if ((match.home_score === null) !== (match.away_score === null)) {
          return {
            error: 'One of those fixtures has an incomplete result and cannot be deleted safely. Delete it on its own to see which.' as const,
            status: 409,
          }
        }
      }

      for (const match of matches) {
        if (match.home_score !== null && match.away_score !== null) {
          await clearResult(
            conn,
            { seasonId: match.season_id, divisionId: match.division_id },
            {
              homeClubId: match.home_club_id,
              awayClubId: match.away_club_id,
              homeScore: match.home_score,
              awayScore: match.away_score,
            },
          )
        }
      }

      await conn.query('DELETE FROM match_events WHERE match_id IN (?)', [ids])
      await conn.query('DELETE FROM match_stats WHERE match_id IN (?)', [ids])
      await conn.query('DELETE FROM matches WHERE id IN (?)', [ids])
      return { ok: true as const, deleted: matches.length }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.json({ ok: true, deleted: result.deleted })
  }),
)

/* ----------------------------------------------------------------- clubs */

admin.get(
  '/clubs',
  handler(async (req, res) => {
    const requestedSeasonId = req.query.seasonId
    let seasonId: number | null = null
    if (requestedSeasonId !== undefined) {
      seasonId = Number(requestedSeasonId)
      if (!Number.isSafeInteger(seasonId) || seasonId < 1) {
        return res.status(400).json({ error: 'seasonId must be a positive integer.' })
      }
    }

    const clubs = await queryAll(
      `SELECT c.id, c.name, c.slug, c.short_code, c.flag, c.logo_url, c.logo_local, c.status,
              c.is_featured, c.description, c.formation,
              (SELECT COUNT(*) FROM players p WHERE p.club_id = c.id) AS players,
              (SELECT dc.division_id FROM division_clubs dc
                JOIN divisions d ON d.id = dc.division_id
                WHERE dc.club_id = c.id
                  AND (? IS NULL OR d.season_id = ?)
                  AND (? IS NOT NULL OR d.season_id = (
                    SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1
                  ))
                ORDER BY dc.id DESC LIMIT 1) AS division_id
         FROM clubs c
        ORDER BY c.name`,
      [seasonId, seasonId, seasonId],
    )
    res.json({ clubs })
  }),
)

admin.post(
  '/clubs',
  handler(async (req, res) => {
    const name = requiredString(req.body?.name, 'Club name', 120)
    const shortCode = optionalString(req.body?.shortCode, 8)
    const flag = optionalString(req.body?.flag, 16)
    const logoLocal = optionalString(req.body?.logoLocal ?? req.body?.logo_local, 6_000_000)
    const logoUrl = optionalString(req.body?.logoUrl ?? req.body?.logo_url, 6_000_000)
    const rawStatus = req.body?.status !== undefined ? String(req.body.status).trim() : 'active'
    if (!['active', 'pending', 'withdrawn'].includes(rawStatus)) {
      return res.status(400).json({ error: 'status must be active, pending or withdrawn.' })
    }
    const rawDivisionId = req.body?.divisionId
    const divisionId =
      rawDivisionId === null || rawDivisionId === undefined || rawDivisionId === ''
        ? null
        : Number(rawDivisionId)
    if (divisionId !== null && (!Number.isSafeInteger(divisionId) || divisionId < 1)) {
      return res.status(400).json({ error: 'divisionId must be a positive integer or null.' })
    }

    const created = await withTransaction(async (conn) => {
      const [dupName] = await conn.query(
        'SELECT id FROM clubs WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [name],
      )
      if ((dupName as unknown[]).length > 0) {
        return { error: 'A club with that name already exists.' as const, status: 409 }
      }

      const baseSlug = clubSlug(name) || 'club'
      let slug = baseSlug
      let suffix = 2
      while (true) {
        const [slugRows] = await conn.query('SELECT id FROM clubs WHERE slug = ? LIMIT 1', [slug])
        if ((slugRows as unknown[]).length === 0) break
        slug = `${baseSlug}-${suffix++}`
      }

      let targetDivision: (SeasonDivision & { is_active: number }) | null = null
      if (divisionId !== null) {
        const [divRows] = await conn.query(
          `SELECT d.id, d.name, d.season_id, d.sort_order, d.promotion_count, d.relegation_count,
                  d.is_active
             FROM divisions d
             JOIN seasons s ON s.id = d.season_id AND s.is_current = TRUE
            WHERE d.id = ? FOR UPDATE`,
          [divisionId],
        )
        targetDivision = (divRows as Array<SeasonDivision & { is_active: number }>)[0] ?? null
        if (!targetDivision) {
          return { error: 'Selected division was not found in the current season.' as const, status: 404 }
        }
        if (!targetDivision.is_active) {
          return {
            error: `${targetDivision.name} is paused. Switch it back on before adding a club to it.` as const,
            status: 400,
          }
        }
      }

      const [inserted] = await conn.execute(
        `INSERT INTO clubs
           (name, slug, short_code, flag, logo_url, logo_local, status, is_featured, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
        [name, slug, shortCode, flag, logoUrl ?? logoLocal, logoLocal ?? logoUrl, rawStatus],
      )
      const clubId = (inserted as any).insertId as number

      if (targetDivision) {
        await applyDivisionMove(conn, {
          clubId,
          destination: targetDivision,
          movementType: 'transfer',
        })
      }

      return { id: clubId, slug }
    })

    if ('error' in created) return res.status(created.status).json({ error: created.error })

    const club = await queryOne(
      `SELECT c.id, c.name, c.slug, c.short_code, c.flag, c.logo_url, c.logo_local, c.status,
              c.is_featured,
              (SELECT COUNT(*) FROM players p WHERE p.club_id = c.id) AS players,
              (SELECT dc.division_id FROM division_clubs dc
                JOIN divisions d ON d.id = dc.division_id
                WHERE dc.club_id = c.id
                  AND d.season_id = (SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1)
                ORDER BY dc.id DESC LIMIT 1) AS division_id
         FROM clubs c
        WHERE c.id = ?`,
      [created.id],
    )
    res.status(201).json({ club })
  }),
)

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
      values.push(optionalString(req.body.logoUrl, 6_000_000))
    }
    if ('logoLocal' in req.body) {
      fields.push('logo_local = ?')
      values.push(optionalString(req.body.logoLocal, 6_000_000))
    }
    if ('status' in req.body) {
      const status = requiredString(req.body.status, 'status', 32)
      if (!['active', 'pending', 'withdrawn'].includes(status)) {
        return res.status(400).json({ error: 'status must be active, pending or withdrawn.' })
      }
      fields.push('status = ?')
      values.push(status)
    }
    if ('description' in req.body) {
      fields.push('description = ?')
      values.push(optionalString(req.body.description, 2000))
    }
    if ('formation' in req.body) {
      fields.push('formation = ?')
      values.push(optionalString(req.body.formation, 16) ?? '4-3-3')
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

admin.delete(
  '/clubs/:slug',
  handler(async (req, res) => {
    const slug = requiredString(req.params.slug, 'slug', 140)

    const result = await withTransaction(async (conn) => {
      const [clubRows] = await conn.query(
        'SELECT id, name FROM clubs WHERE slug = ? FOR UPDATE',
        [slug],
      )
      const club = (clubRows as Array<{ id: number; name: string }>)[0]
      if (!club) return { error: 'Club not found.' as const, status: 404 }

      const [matchRows] = await conn.query(
        `SELECT id, season_id, division_id, home_club_id, away_club_id, home_score, away_score
           FROM matches
          WHERE home_club_id = ? OR away_club_id = ?
            FOR UPDATE`,
        [club.id, club.id],
      )
      const clubMatches = matchRows as Array<{
        id: number
        season_id: number
        division_id: number
        home_club_id: number
        away_club_id: number
        home_score: number | null
        away_score: number | null
      }>

      for (const match of clubMatches) {
        if (match.home_score !== null && match.away_score !== null) {
          await clearResult(
            conn,
            { seasonId: match.season_id, divisionId: match.division_id },
            {
              homeClubId: match.home_club_id,
              awayClubId: match.away_club_id,
              homeScore: match.home_score,
              awayScore: match.away_score,
            },
          )
        }
      }

      if (clubMatches.length > 0) {
        const matchIds = clubMatches.map((m) => m.id)
        await conn.query('DELETE FROM match_events WHERE match_id IN (?)', [matchIds])
        await conn.query('DELETE FROM match_stats WHERE match_id IN (?)', [matchIds])
        await conn.query('DELETE FROM matches WHERE id IN (?)', [matchIds])
      }

      await conn.execute('UPDATE users SET club_id = NULL, updated_at = NOW() WHERE club_id = ?', [
        club.id,
      ])
      await conn.execute(
        'UPDATE players SET club_id = NULL, is_free_agent = TRUE, updated_at = NOW() WHERE club_id = ?',
        [club.id],
      )
      await conn.execute('UPDATE transfers SET from_club_id = NULL WHERE from_club_id = ?', [
        club.id,
      ])
      await conn.execute('UPDATE transfers SET to_club_id = NULL WHERE to_club_id = ?', [club.id])
      await conn.execute('DELETE FROM transfer_requests WHERE club_id = ?', [club.id])
      await conn.execute('DELETE FROM season_division_movements WHERE club_id = ?', [club.id])
      await conn.execute('DELETE FROM standings_snapshot WHERE club_id = ?', [club.id])
      await conn.execute('DELETE FROM division_clubs WHERE club_id = ?', [club.id])
      await conn.execute('DELETE FROM clubs WHERE id = ?', [club.id])

      return { ok: true as const, id: club.id, slug }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.json(result)
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

/**
 * Bulk or selective update of starting XI and formation for a club.
 */
admin.put(
  '/clubs/:slug/lineup',
  handler(async (req, res) => {
    const slug = requiredString(req.params.slug, 'slug', 140)
    const club = await queryOne<{ id: number }>('SELECT id FROM clubs WHERE slug = ?', [slug])
    if (!club) return res.status(404).json({ error: 'Club not found.' })

    const startingIds = Array.isArray(req.body?.startingPlayerIds)
      ? req.body.startingPlayerIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : null

    const playerList = Array.isArray(req.body?.players) ? req.body.players : null

    await withTransaction(async (conn) => {
      if (req.body?.formation) {
        await conn.execute('UPDATE clubs SET formation = ?, updated_at = NOW() WHERE id = ?', [
          String(req.body.formation).trim().slice(0, 16),
          club.id,
        ])
      }

      if (startingIds !== null) {
        await conn.execute('UPDATE players SET is_starting_11 = FALSE WHERE club_id = ?', [club.id])
        if (startingIds.length > 0) {
          const placeholders = startingIds.map(() => '?').join(', ')
          await conn.execute(
            `UPDATE players SET is_starting_11 = TRUE, updated_at = NOW() WHERE club_id = ? AND id IN (${placeholders})`,
            [club.id, ...startingIds],
          )
        }
      } else if (playerList !== null) {
        for (const p of playerList) {
          const pid = Number(p.id)
          if (!Number.isInteger(pid) || pid < 1) continue
          const isStarter = Boolean(p.is_starting_11)
          const shirtNum = p.shirt_number !== undefined && p.shirt_number !== null && p.shirt_number !== '' ? Number(p.shirt_number) : null
          const pos = p.position ? String(p.position).trim().slice(0, 16) : null
          await conn.execute(
            'UPDATE players SET is_starting_11 = ?, shirt_number = ?, position = ?, updated_at = NOW() WHERE id = ? AND club_id = ?',
            [isStarter ? 1 : 0, shirtNum, pos, pid, club.id],
          )
        }
      }
    })

    const updated = await queryAll(
      'SELECT id, gamertag, slug, avatar_local, is_free_agent, is_starting_11, shirt_number, position FROM players WHERE club_id = ? ORDER BY is_starting_11 DESC, shirt_number ASC, gamertag ASC',
      [club.id],
    )
    res.json({ ok: true, players: updated })
  }),
)

admin.patch(
  '/clubs/:slug/players/:playerId',
  handler(async (req, res) => {
    const slug = requiredString(req.params.slug, 'slug', 140)
    const playerId = Number(req.params.playerId)
    if (!Number.isInteger(playerId) || playerId < 1) {
      return res.status(400).json({ error: 'Invalid player ID' })
    }
    const club = await queryOne<{ id: number }>('SELECT id FROM clubs WHERE slug = ?', [slug])
    if (!club) return res.status(404).json({ error: 'Club not found.' })

    const fields: string[] = []
    const values: any[] = []

    if ('is_starting_11' in req.body) {
      fields.push('is_starting_11 = ?')
      values.push(Boolean(req.body.is_starting_11) ? 1 : 0)
    }
    if ('shirt_number' in req.body) {
      fields.push('shirt_number = ?')
      values.push(req.body.shirt_number === null || req.body.shirt_number === '' ? null : Number(req.body.shirt_number))
    }
    if ('position' in req.body) {
      fields.push('position = ?')
      values.push(req.body.position ? String(req.body.position).trim().slice(0, 16) : null)
    }

    if (fields.length > 0) {
      values.push(playerId, club.id)
      await execute(`UPDATE players SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ? AND club_id = ?`, values)
    }

    res.json({ ok: true, playerId })
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

admin.get(
  '/seasons',
  handler(async (_req, res) => {
    const seasons = await queryAll(
      `SELECT id, name, year, is_current, featured_division_id
         FROM seasons
        ORDER BY is_current DESC, year DESC, id DESC`,
    )
    res.json({ seasons })
  }),
)

admin.put(
  '/seasons/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Season id must be a positive integer.' })
    }
    const name = requiredString(req.body?.name, 'name', 64)
    const season = await withTransaction(async (conn) => {
      const [seasonRows] = await conn.query(
        'SELECT id, name, year, is_current, featured_division_id FROM seasons WHERE id = ? FOR UPDATE',
        [id],
      )
      const current = (seasonRows as Array<{
        id: number
        name: string
        year: number
        is_current: number
        featured_division_id: number | null
      }>)[0]
      if (!current) return null

      const [duplicates] = await conn.query(
        'SELECT id FROM seasons WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1',
        [name, id],
      )
      if ((duplicates as unknown[]).length > 0) {
        throw Object.assign(new Error('A season with that name already exists.'), { status: 409 })
      }

      await conn.execute('UPDATE seasons SET name = ? WHERE id = ?', [name, id])
      return { ...current, name }
    })
    if (!season) return res.status(404).json({ error: 'Season not found.' })
    res.json({ season })
  }),
)

admin.put(
  '/seasons/:id/featured-division',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Season id must be a positive integer.' })
    }
    const rawDivisionId = req.body?.divisionId
    const divisionId =
      rawDivisionId === null || rawDivisionId === ''
        ? null
        : Number(rawDivisionId)
    if (divisionId !== null && (!Number.isSafeInteger(divisionId) || divisionId < 1)) {
      return res.status(400).json({ error: 'divisionId must be null or a positive integer.' })
    }

    const season = await withTransaction(async (conn) => {
      const [seasonRows] = await conn.query(
        'SELECT id, name, year, is_current FROM seasons WHERE id = ? FOR UPDATE',
        [id],
      )
      const current = (seasonRows as Array<{
        id: number
        name: string
        year: number
        is_current: number
      }>)[0]
      if (!current) return null

      if (divisionId !== null) {
        // The homepage cannot render a paused league, so setting it as the
        // feature is refused rather than silently ignored.
        const [divisionRows] = await conn.query(
          'SELECT id, is_active FROM divisions WHERE id = ? AND season_id = ?',
          [divisionId, id],
        )
        const division = (divisionRows as Array<{ id: number; is_active: number }>)[0]
        if (!division) {
          return { error: 'Choose a league from this season.' as const }
        }
        if (!division.is_active) {
          return { error: 'That league is paused. Switch it back on before featuring it.' as const }
        }
      }

      await conn.execute('UPDATE seasons SET featured_division_id = ? WHERE id = ?', [
        divisionId,
        id,
      ])
      return { ...current, featured_division_id: divisionId }
    })
    if (!season) return res.status(404).json({ error: 'Season not found.' })
    if ('error' in season) return res.status(400).json({ error: season.error })
    res.json({ season })
  }),
)

/**
 * Point the app at a different season.
 *
 * This switches which season is live; it does not undo a rollover. A completed
 * season is taken back with POST /seasons/complete/undo, which removes the
 * season the rollover opened instead of merely making the old one current
 * again — flipping the flag alone would leave two seasons and the movement
 * between them still applied.
 */
admin.put(
  '/seasons/:id/current',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Season id must be a positive integer.' })
    }

    const activated = await withTransaction(async (conn) => {
      const [currentRows] = await conn.query(
        'SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1 FOR UPDATE',
      )
      const [targetRows] = await conn.query(
        'SELECT id, name, year, featured_division_id FROM seasons WHERE id = ? FOR UPDATE',
        [id],
      )
      const target = (targetRows as Array<{
        id: number
        name: string
        year: number
        featured_division_id: number | null
      }>)[0]
      if (!target) return null
      const current = (currentRows as Array<{ id: number }>)[0]
      if (current?.id !== target.id) {
        await conn.execute('UPDATE seasons SET is_current = FALSE WHERE is_current = TRUE')
        await conn.execute('UPDATE seasons SET is_current = TRUE WHERE id = ?', [target.id])
      }
      return { ...target, is_current: 1 }
    })
    if (!activated) return res.status(404).json({ error: 'Season not found.' })
    res.json({ season: activated })
  }),
)

admin.post(
  '/seasons',
  handler(async (req, res) => {
    const name = requiredString(req.body?.name, 'name', 64)
    const year = Number(req.body?.year)
    if (!Number.isSafeInteger(year) || year < 2000 || year > 9999) {
      return res.status(400).json({ error: 'year must be a whole number between 2000 and 9999.' })
    }

    const created = await withTransaction(async (conn) => {
      const [currentRows] = await conn.query(
        'SELECT id, featured_division_id FROM seasons WHERE is_current = TRUE LIMIT 1 FOR UPDATE',
      )
      const sourceSeason = (currentRows as Array<{
        id: number
        featured_division_id: number | null
      }>)[0]
      const [duplicates] = await conn.query(
        'SELECT id FROM seasons WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [name],
      )
      if ((duplicates as unknown[]).length > 0) {
        throw Object.assign(new Error('A season with that name already exists.'), { status: 409 })
      }

      const [inserted] = await conn.execute(
        'INSERT INTO seasons (name, year, is_current, created_at) VALUES (?, ?, FALSE, NOW())',
        [name, year],
      )
      const id = (inserted as { insertId: number }).insertId
      const copiedDivisions: Array<{
        id: number
        name: string
        slug: string
        sort_order: number
        promotion_count: number | null
        relegation_count: number | null
        is_active: number
      }> = []
      let copiedFeaturedDivisionId: number | null = null

      if (sourceSeason) {
        const [divisionRows] = await conn.query(
          `SELECT id, name, slug, sort_order, promotion_count, relegation_count, is_active
             FROM divisions
            WHERE season_id = ?
            ORDER BY sort_order, id`,
          [sourceSeason.id],
        )
        for (const division of divisionRows as Array<{
          id: number
          name: string
          slug: string
          sort_order: number
          promotion_count: number | null
          relegation_count: number | null
          is_active: number
        }>) {
          const suffix = `-s${id}`
          const slug = `${division.slug.slice(0, 80 - suffix.length)}${suffix}`
          const [newDivisionResult] = await conn.execute(
            `INSERT INTO divisions
               (season_id, name, slug, sort_order, promotion_count, relegation_count, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              id,
              division.name,
              slug,
              division.sort_order,
              division.promotion_count,
              division.relegation_count,
              // Copy the pause along with everything else, so opening a new
              // season does not quietly restart a league that was switched off.
              division.is_active,
            ],
          )
          const newDivisionId = (newDivisionResult as { insertId: number }).insertId
          // A paused league cannot be the homepage feature, so the copy is not
          // carried over: the new season falls back to its highest-ranked league.
          if (sourceSeason.featured_division_id === division.id && division.is_active) {
            copiedFeaturedDivisionId = newDivisionId
          }
          await conn.execute(
            `INSERT INTO division_clubs (division_id, club_id, code_at_registration, created_at)
             SELECT ?, club_id, code_at_registration, NOW()
               FROM division_clubs
              WHERE division_id = ?`,
            [newDivisionId, division.id],
          )
          await conn.execute(
            `INSERT INTO standings_snapshot
               (season_id, division_id, club_id, position, played, won, drawn, lost,
                goals_for, goals_against, goal_difference, points, form, updated_at)
             SELECT ?, ?, dc.club_id,
                    ROW_NUMBER() OVER (ORDER BY COALESCE(ss.position, 65535), dc.id),
                    0, 0, 0, 0, 0, 0, 0, 0, '', NOW()
               FROM division_clubs dc
               LEFT JOIN standings_snapshot ss
                 ON ss.season_id = ? AND ss.division_id = dc.division_id AND ss.club_id = dc.club_id
              WHERE dc.division_id = ?`,
            [id, newDivisionId, sourceSeason.id, division.id],
          )
          copiedDivisions.push({
            id: newDivisionId,
            name: division.name,
            slug,
            sort_order: division.sort_order,
            promotion_count: division.promotion_count,
            relegation_count: division.relegation_count,
            is_active: division.is_active,
          })
        }

        await conn.execute('UPDATE seasons SET featured_division_id = ? WHERE id = ?', [
          copiedFeaturedDivisionId,
          id,
        ])
        await conn.execute('UPDATE seasons SET is_current = FALSE WHERE is_current = TRUE')
      }
      await conn.execute('UPDATE seasons SET is_current = TRUE WHERE id = ?', [id])
      return {
        season: {
          id,
          name,
          year,
          is_current: 1,
          featured_division_id: copiedFeaturedDivisionId,
        },
        divisions: copiedDivisions,
      }
    })
    res.status(201).json(created)
  }),
)

admin.post(
  '/divisions',
  handler(async (req, res) => {
    const name = requiredString(req.body?.name, 'name', 64)
    const movement = parseDivisionMovement(req.body)
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
      const [orderRows] = await conn.query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order FROM divisions WHERE season_id = ?',
        [season.id],
      )
      const sortOrder = Number((orderRows as Array<{ sort_order: number }>)[0]?.sort_order ?? 0)
      const [inserted] = await conn.execute(
        `INSERT INTO divisions
           (season_id, name, slug, sort_order, promotion_count, relegation_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          season.id,
          name,
          slug,
          sortOrder,
          movement.promotion_count,
          movement.relegation_count,
        ],
      )
      const id = (inserted as { insertId: number }).insertId
      return {
        id,
        name,
        slug,
        season_id: season.id,
        sort_order: sortOrder,
        season: season.name,
        // A new league is always active; the column default would say the same
        // thing, but the response is assembled by hand and must not disagree
        // with the row.
        is_active: 1,
        ...movement,
      }
    })
    if (!division) return res.status(404).json({ error: 'There is no current season.' })
    res.status(201).json({ division })
  }),
)

admin.put(
  '/divisions/order',
  handler(async (req, res) => {
    const divisionIds: unknown = req.body?.divisionIds
    if (
      !Array.isArray(divisionIds) ||
      divisionIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
      new Set(divisionIds).size !== divisionIds.length
    ) {
      return res.status(400).json({ error: 'divisionIds must be unique positive integer IDs.' })
    }

    const reordered = await withTransaction(async (conn) => {
      const [seasonRows] = await conn.query(
        'SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1 FOR UPDATE',
      )
      const season = (seasonRows as Array<{ id: number }>)[0]
      if (!season) return null

      const [divisionRows] = await conn.query(
        'SELECT id FROM divisions WHERE season_id = ? ORDER BY sort_order, id FOR UPDATE',
        [season.id],
      )
      const currentIds = (divisionRows as Array<{ id: number }>).map((division) => division.id)
      if (
        divisionIds.length !== currentIds.length ||
        !currentIds.every((id) => divisionIds.includes(id))
      ) {
        return false
      }

      for (const [sortOrder, id] of divisionIds.entries()) {
        await conn.execute(
          'UPDATE divisions SET sort_order = ? WHERE id = ? AND season_id = ?',
          [sortOrder, id, season.id],
        )
      }
      return true
    })

    if (reordered === null) return res.status(404).json({ error: 'There is no current season.' })
    if (!reordered) {
      return res.status(400).json({ error: 'divisionIds must include every current-season division.' })
    }
    res.json({ ok: true })
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
    const movement = parseDivisionMovement(req.body)
    const division = await withTransaction(async (conn) => {
      const [divisionRows] = await conn.query(
          `SELECT d.id, d.name, d.slug, d.season_id, d.sort_order, d.is_active,
                  s.name AS season, s.year
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
          sort_order: number
          is_active: number
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
            SET name = ?, slug = ?, promotion_count = ?, relegation_count = ?
          WHERE id = ?`,
        [
          name,
          slug,
          movement.promotion_count,
          movement.relegation_count,
          id,
        ],
      )
      return {
        id,
        name,
        slug,
        season_id: current.season_id,
        sort_order: current.sort_order,
        season: current.season,
        // Editing a league never changes whether it is active: the toggle has
        // its own route so the two decisions cannot overwrite each other.
        is_active: current.is_active,
        ...movement,
      }
    })
    if (!division) return res.status(404).json({ error: 'Current-season division not found.' })
    res.json({ division })
  }),
)

/**
 * Pause a league, or bring it back.
 *
 * Two rules the toggle cannot enforce on its own:
 *
 *   - The last active league cannot be paused. With none active the season
 *     disappears from the public site entirely, and the only way back is to
 *     find this setting, so the state is refused rather than allowed.
 *
 *   - A paused league cannot stay featured on the homepage, because the
 *     homepage has no way to render it. The feature is cleared, which leaves
 *     the season defaulting to the highest-ranked league.
 */
admin.put(
  '/divisions/:id/active',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Division id must be a positive integer.' })
    }
    const isActive = req.body?.isActive
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be true or false.' })
    }

    const result = await withTransaction(async (conn) => {
      const [divisionRows] = await conn.query(
        `SELECT d.id, d.name, d.season_id, d.is_active
           FROM divisions d
           JOIN seasons s ON s.id = d.season_id AND s.is_current = TRUE
          WHERE d.id = ? FOR UPDATE`,
        [id],
      )
      const division = (divisionRows as Array<{
        id: number
        name: string
        season_id: number
        is_active: number
      }>)[0]
      if (!division) return { error: 'Current-season division not found.' as const, status: 404 }
      if (Boolean(division.is_active) === isActive) {
        return { division, season: null, clearedFeature: false }
      }

      let clearedFeature = false
      if (!isActive) {
        const [activeRows] = await conn.query(
          'SELECT COUNT(*) AS active_count FROM divisions WHERE season_id = ? AND is_active = TRUE',
          [division.season_id],
        )
        const activeCount = Number(
          (activeRows as Array<{ active_count: number }>)[0]?.active_count ?? 0,
        )
        if (activeCount <= 1) {
          return {
            error: `${division.name} is the only active league in this season. Add another league or switch this one back on before pausing it.` as const,
            status: 400,
          }
        }

        // Clearing the feature in the same transaction as the pause means the
        // homepage can never be left pointing at a league that is hidden. Only
        // reported when this division was the one being featured.
        const [clear] = await conn.execute(
          'UPDATE seasons SET featured_division_id = NULL WHERE id = ? AND featured_division_id = ?',
          [division.season_id, division.id],
        )
        clearedFeature = Number((clear as { affectedRows?: number }).affectedRows ?? 0) > 0
      }

      await conn.execute('UPDATE divisions SET is_active = ? WHERE id = ?', [
        isActive ? 1 : 0,
        division.id,
      ])

      const [seasonRows] = await conn.query(
        'SELECT id, name, year, is_current, featured_division_id FROM seasons WHERE id = ?',
        [division.season_id],
      )
      const season = (seasonRows as Array<{
        id: number
        name: string
        year: number
        is_current: number
        featured_division_id: number | null
      }>)[0]

      return { division: { ...division, is_active: isActive ? 1 : 0 }, season, clearedFeature }
    })

    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.json({
      division: result.division,
      season: result.season,
      // True only when this pause is what unfeatured the league, so the admin
      // can say so rather than claiming a change it did not make.
      featuredCleared: result.clearedFeature,
    })
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
 * The rollover that opened the current season.
 *
 * Replaces the old mid-season movement read. Nothing moves during a season any
 * more, so there is no in-progress movement to show; what there is instead is a
 * record of the last time the ladder turned over, which is also what the undo
 * button offers itself against.
 */
admin.get(
  '/season-movements',
  handler(async (_req, res) => {
    const rollover = await readCurrentSeasonRollover()
    res.json({ rollover })
  }),
)

/** A division, plus the movement counts that decide its end-of-season zones. */
type SeasonDivision = DivisionMovement & {
  id: number
  name: string
  season_id: number
  sort_order: number
}

/**
 * Put a club into a division, recording how it got there.
 *
 * Creates the standings_snapshot row as well as the membership. Membership
 * alone would leave the club in `division_clubs` and absent from every table:
 * the standings page reads standings_snapshot, and applyResult only ever
 * adjusts a row that already exists there, it cannot conjure one. So a club
 * that joined without this step would be invisible until it happened to play,
 * and a result entered against it would have nothing to apply to.
 *
 * Position is the bottom of the table. A newly admitted club has played
 * nothing, so any position but last would be a claim it had not earned.
 *
 * Runs on a caller-supplied connection so a second admin tab cannot interleave
 * its read of the club's membership between the check and the write.
 *
 * Only ever called with movementType 'transfer'. Promotion and relegation are
 * decided by finishing the season, not by an admin moving a club by hand, so
 * there is no longer any path here that could claim a club earned a rung of the
 * ladder during play.
 */
async function applyDivisionMove(
  conn: any,
  input: { clubId: number; destination: SeasonDivision; movementType: MovementType },
): Promise<void> {
  const { clubId, destination, movementType } = input
  const seasonId = destination.season_id

  const [membershipRows] = await conn.query(
    `SELECT d.id AS division_id
       FROM division_clubs dc
       JOIN divisions d ON d.id = dc.division_id
      WHERE dc.club_id = ? AND d.season_id = ?
      ORDER BY dc.id DESC
      FOR UPDATE`,
    [clubId, seasonId],
  )
  const previousMembership = (
    membershipRows as Array<{ division_id: number }>
  )[0]

  await conn.execute(
    `DELETE FROM division_clubs
      WHERE club_id = ?
      AND division_id IN (SELECT id FROM divisions WHERE season_id = ?)
      AND division_id <> ?`,
    [clubId, seasonId, destination.id],
  )

  if (previousMembership && Number(previousMembership.division_id) !== destination.id) {
    // A move is only true for as long as the club is still sitting where it was
    // sent. Once it goes somewhere else the old row would keep counting against
    // a league it is no longer leaving, so clear anything whose recorded
    // destination is not the one being moved to now.
    await conn.execute(
      `DELETE FROM season_division_movements
        WHERE season_id = ? AND club_id = ? AND destination_division_id <> ?`,
      [seasonId, clubId, destination.id],
    )
    await conn.execute(
      `INSERT INTO season_division_movements
         (season_id, club_id, source_division_id, destination_division_id,
          movement_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         destination_division_id = VALUES(destination_division_id),
         movement_type = VALUES(movement_type),
         updated_at = VALUES(updated_at)`,
      [seasonId, clubId, Number(previousMembership.division_id), destination.id, movementType],
    )
  }

  await conn.execute(
    `INSERT INTO division_clubs
       (division_id, club_id, code_at_registration, created_at)
     VALUES (?, ?, (SELECT short_code FROM clubs WHERE id = ?), NOW())
     ON DUPLICATE KEY UPDATE
       code_at_registration = VALUES(code_at_registration)`,
    [destination.id, clubId, clubId],
  )

  const [existing] = await conn.query(
    'SELECT id FROM standings_snapshot WHERE season_id = ? AND division_id = ? AND club_id = ?',
    [seasonId, destination.id, clubId],
  )
  if ((existing as unknown[]).length > 0) return

  const [bottom] = await conn.query(
    'SELECT COALESCE(MAX(position), 0) + 1 AS pos FROM standings_snapshot WHERE season_id = ? AND division_id = ?',
    [seasonId, destination.id],
  )
  const position = Number((bottom as any[])[0]?.pos ?? 1)

  await conn.execute(
    `INSERT INTO standings_snapshot
       (season_id, division_id, club_id, position, played, won, drawn, lost,
        goals_for, goals_against, goal_difference, points, form, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, '', NOW())`,
    [seasonId, destination.id, clubId, position],
  )
}

/**
 * Put a club into a league by hand, or take it out of one.
 *
 * This is a plain move. It never promotes or relegates anything: where a club
 * ends the season comes from its finishing position when the season is
 * completed, so an admin correcting a league mid-season cannot hand out a rung
 * of the ladder by accident.
 *
 * `divisionId: null` unassigns the club from the current season. Membership is
 * per-season and lives in `division_clubs`, so this drops that season's rows
 * rather than the club: the club stays on file, keeps its squad, and reappears
 * in the unassigned table. The standings row goes with it, otherwise the club
 * would linger in a league table it is no longer entered in. Fixtures are left
 * alone — they reference the division, not the membership, and an admin
 * unassigning a club mid-season should not lose the results already recorded.
 */
admin.post(
  '/clubs/:slug/division',
  handler(async (req, res) => {
    const slug = requiredString(req.params.slug, 'slug', 140)
    const body = req.body?.divisionId
    const unassign = body === null || body === undefined
    const raw = Number.parseInt(String(body), 10)
    if (!unassign && !Number.isInteger(raw)) {
      return res.status(400).json({ error: 'divisionId must be an integer or null.' })
    }

    const club = await queryOne<{ id: number; name: string }>(
      'SELECT id, name FROM clubs WHERE slug = ?',
      [slug],
    )
    if (!club) return res.status(404).json({ error: 'Club not found.' })

    if (unassign) {
      const season = await queryOne<{ id: number; name: string }>(
        'SELECT id, name FROM seasons WHERE is_current = TRUE LIMIT 1',
      )
      if (!season) return res.status(404).json({ error: 'No current season.' })

      const previous = await queryOne<{ name: string }>(
        `SELECT d.name
           FROM division_clubs dc
           JOIN divisions d ON d.id = dc.division_id
          WHERE dc.club_id = ? AND d.season_id = ?
          ORDER BY dc.id DESC LIMIT 1`,
        [club.id, season.id],
      )

      await withTransaction(async (conn) => {
        await conn.execute(
          `DELETE FROM division_clubs
            WHERE club_id = ?
              AND division_id IN (SELECT id FROM divisions WHERE season_id = ?)`,
          [club.id, season.id],
        )
        await conn.execute('DELETE FROM standings_snapshot WHERE season_id = ? AND club_id = ?', [
          season.id,
          club.id,
        ])
        // A movement only counts while the club is still sitting where it was
        // sent, which is the same rule applyDivisionMove applies on the way in.
        await conn.execute('DELETE FROM season_division_movements WHERE season_id = ? AND club_id = ?', [
          season.id,
          club.id,
        ])
      })

      if (previous) {
        await notifyClubManagers(
          club.id,
          'club_division',
          `${club.name} left ${previous.name}`,
          `${club.name} has been taken out of ${previous.name} and is no longer in the league table.`,
        )
      }

      return res.json({ ok: true, divisionId: null, divisionName: null })
    }

    const division = await queryOne<SeasonDivision & { is_active: number }>(
      `SELECT d.id, d.name, d.season_id, d.sort_order, d.promotion_count, d.relegation_count,
              d.is_active
         FROM divisions d
         JOIN seasons s ON s.id = d.season_id AND s.is_current = TRUE
        WHERE d.id = ?`,
      [raw],
    )
    if (!division) return res.status(404).json({ error: 'Division not found.' })
    if (!division.is_active) {
      return res
        .status(400)
        .json({ error: `${division.name} is paused. Switch it back on before moving a club into it.` })
    }

    const moved = await withTransaction(async (conn) => {
      const [clubRows] = await conn.query('SELECT id FROM clubs WHERE id = ? FOR UPDATE', [club.id])
      if (!((clubRows as unknown[])[0])) return false
      await applyDivisionMove(conn, {
        clubId: club.id,
        destination: division,
        movementType: 'transfer',
      })
      return true
    })
    if (!moved) return res.status(404).json({ error: 'Club not found.' })

    await notifyClubManagers(
      club.id,
      'club_division',
      `${club.name} entered ${division.name}`,
      `${club.name} has been entered into ${division.name} and now appears in the league table.`,
    )

    res.json({
      ok: true,
      divisionId: division.id,
      divisionName: division.name,
    })
  }),
)

/* ---------------------------------------------------------- season rollover */

/**
 * The leagues taking part in the rollover.
 *
 * An absent list is an empty list rather than an error: finishing a season with
 * no movement is a legitimate thing for an admin to mean, and the preview says
 * so plainly instead of refusing.
 */
function parseSelectedDivisions(value: unknown): number[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw Object.assign(new Error('divisionIds must be a list of league ids.'), { status: 400 })
  }
  const ids = value.map((entry) => Number(entry))
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw Object.assign(new Error('divisionIds must be a list of league ids.'), { status: 400 })
  }
  return [...new Set(ids)]
}

/**
 * Movement settings for the new season's leagues, as edited in the wizard.
 *
 * These configure next season's zones. They do not change what moves now � that
 * was already decided by the finished season's counts � so they are applied only
 * after the movement has been worked out. Sending them in the same request as
 * the league selection keeps the whole rollover one atomic call.
 */
function parseRolloverSettings(value: unknown): Record<number, RolloverSetting> {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(
      new Error('divisionSettings must be an object keyed by league id.'),
      { status: 400 },
    )
  }
  const settings: Record<number, RolloverSetting> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(key)
    if (!Number.isSafeInteger(id) || id < 1) {
      throw Object.assign(new Error('divisionSettings is keyed by league id.'), { status: 400 })
    }
    settings[id] = {
      promotionCount: parseMovementCount(
        (entry as Record<string, unknown> | null)?.promotion_count,
        'promotion_count',
      ),
      relegationCount: parseMovementCount(
        (entry as Record<string, unknown> | null)?.relegation_count,
        'relegation_count',
      ),
    }
  }
  return settings
}

/**
 * What completing the season would do, without doing any of it.
 *
 * Reads the same planner the commit runs, so what the admin approves on screen
 * is what gets written rather than a second implementation of the same rules.
 */
admin.post(
  '/seasons/complete/preview',
  handler(async (req, res) => {
    const divisionIds = parseSelectedDivisions(req.body?.divisionIds)
    const plan = await previewSeasonRollover(divisionIds)
    if (!plan) return res.status(404).json({ error: 'There is no current season.' })
    res.json({ plan })
  }),
)

/**
 * End the season: move the clubs, then open the next one.
 *
 * One transaction, so a season cannot end with half its movement applied. The
 * plan is rebuilt from a locked read inside it rather than trusting the preview
 * the client is holding, because results entered since the preview was drawn
 * could have changed who finishes where.
 *
 * The finished season keeps its standings and results. Clubs move into the new
 * season, which is created here rather than by a separate call, so there is no
 * window in which the ladder has turned over but there is no season for it.
 */
admin.post(
  '/seasons/complete',
  handler(async (req, res) => {
    const divisionIds = parseSelectedDivisions(req.body?.divisionIds)
    const name = requiredString(req.body?.name, 'name', 64)
    const year = Number(req.body?.year)
    if (!Number.isSafeInteger(year) || year < 2000 || year > 9999) {
      return res.status(400).json({ error: 'year must be a whole number between 2000 and 9999.' })
    }
    const settings = parseRolloverSettings(req.body?.divisionSettings)

    const result = await withTransaction(async (conn) => {
      const context = await loadRolloverContext(conn, { lock: true })
      if (!context) {
        throw Object.assign(new Error('There is no current season.'), { status: 404 })
      }

      const [duplicates] = await conn.query(
        'SELECT id FROM seasons WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [name],
      )
      if ((duplicates as unknown[]).length > 0) {
        throw Object.assign(new Error('A season with that name already exists.'), { status: 409 })
      }

      const known = new Set(context.divisions.map((division) => division.id))
      const unknown = divisionIds.filter((id) => !known.has(id))
      if (unknown.length > 0) {
        throw Object.assign(
          new Error(
            `These leagues are not in ${context.season.name}: ${unknown.join(', ')}. Reload the page and try again.`,
          ),
          { status: 400 },
        )
      }

      const stats = await loadSeasonFixtureStats(conn, context.season.id)
      const plan = planSeasonRollover(context, divisionIds, stats)
      if (plan.blocks.length > 0) {
        throw Object.assign(new Error(plan.blocks[0]), { status: 409 })
      }

      return applySeasonRollover(conn, context, plan, { name, year, settings })
    })

    res.status(201).json(result)
  }),
)

/**
 * Take a rollover back.
 *
 * Removes the season it opened and restores the one it closed. The finished
 * season was never rewritten, so there is nothing to restore inside it � which is
 * what makes a full undo possible at all rather than a best-effort reversal.
 */
admin.post(
  '/seasons/complete/undo',
  handler(async (req, res) => {
    const seasonId = Number.parseInt(String(req.body?.seasonId), 10)
    if (!Number.isSafeInteger(seasonId) || seasonId < 1) {
      return res.status(400).json({ error: 'seasonId must be a positive integer.' })
    }
    const result = await withTransaction((conn) => undoSeasonRollover(conn, seasonId))
    res.json(result)
  }),
)

/* ----------------------------------------------------- homepage & formats */

const FORMAT_STATUSES = new Set(['active', 'inactive', 'coming_soon'])

function parseFormatStatus(value: unknown): 'active' | 'inactive' | 'coming_soon' {
  const s = String(value ?? 'active').trim().toLowerCase()
  if (!FORMAT_STATUSES.has(s)) {
    throw Object.assign(
      new Error("status must be 'active', 'inactive', or 'coming_soon'."),
      { status: 400 },
    )
  }
  return s as 'active' | 'inactive' | 'coming_soon'
}

admin.post(
  '/formats',
  handler(async (req, res) => {
    const name = requiredString(req.body?.name, 'name', 120)
    const tag = optionalString(req.body?.tag, 64) ?? ''
    const description = optionalString(req.body?.description, 512) ?? ''
    const status = parseFormatStatus(req.body?.status)

    const format = await withTransaction(async (conn) => {
      const [maxRows] = await conn.query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM competition_formats FOR UPDATE',
      )
      const sortOrder = Math.max(0, Number((maxRows as Array<{ next_order: number }>)[0]?.next_order ?? 0))
      const [inserted] = await conn.execute(
        `INSERT INTO competition_formats (name, tag, description, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [name, tag, description, status, sortOrder],
      )
      const id = (inserted as any).insertId as number
      const [rows] = await conn.query(
        'SELECT id, name, tag, description, status, sort_order FROM competition_formats WHERE id = ?',
        [id],
      )
      return (rows as any[])[0]
    })

    res.status(201).json({ format })
  }),
)

admin.put(
  '/formats/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Format id must be a positive integer.' })
    }
    const name = requiredString(req.body?.name, 'name', 120)
    const tag = optionalString(req.body?.tag, 64) ?? ''
    const description = optionalString(req.body?.description, 512) ?? ''
    const status = parseFormatStatus(req.body?.status)

    const format = await withTransaction(async (conn) => {
      const [existing] = await conn.query(
        'SELECT id FROM competition_formats WHERE id = ? FOR UPDATE',
        [id],
      )
      if (!((existing as unknown[])[0])) return null

      await conn.execute(
        `UPDATE competition_formats
            SET name = ?, tag = ?, description = ?, status = ?, updated_at = NOW()
          WHERE id = ?`,
        [name, tag, description, status, id],
      )
      const [rows] = await conn.query(
        'SELECT id, name, tag, description, status, sort_order FROM competition_formats WHERE id = ?',
        [id],
      )
      return (rows as any[])[0]
    })

    if (!format) return res.status(404).json({ error: 'Competition format not found.' })
    res.json({ format })
  }),
)

admin.patch(
  '/formats/:id/status',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Format id must be a positive integer.' })
    }
    const status = parseFormatStatus(req.body?.status)

    const format = await withTransaction(async (conn) => {
      const [existing] = await conn.query(
        'SELECT id FROM competition_formats WHERE id = ? FOR UPDATE',
        [id],
      )
      if (!((existing as unknown[])[0])) return null

      await conn.execute(
        'UPDATE competition_formats SET status = ?, updated_at = NOW() WHERE id = ?',
        [status, id],
      )
      const [rows] = await conn.query(
        'SELECT id, name, tag, description, status, sort_order FROM competition_formats WHERE id = ?',
        [id],
      )
      return (rows as any[])[0]
    })

    if (!format) return res.status(404).json({ error: 'Competition format not found.' })
    res.json({ format })
  }),
)

admin.delete(
  '/formats/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Format id must be a positive integer.' })
    }

    const deleted = await withTransaction(async (conn) => {
      const [existing] = await conn.query(
        'SELECT id FROM competition_formats WHERE id = ? FOR UPDATE',
        [id],
      )
      if (!((existing as unknown[])[0])) return false
      await conn.execute('DELETE FROM competition_formats WHERE id = ?', [id])
      return true
    })

    if (!deleted) return res.status(404).json({ error: 'Competition format not found.' })
    res.json({ ok: true, id })
  }),
)

admin.put(
  '/clubs/featured',
  handler(async (req, res) => {
    const slugsRaw = req.body?.slugs
    if (!Array.isArray(slugsRaw)) {
      return res.status(400).json({ error: 'slugs must be an array of club slugs.' })
    }
    const slugs = [...new Set(slugsRaw.map((s) => String(s ?? '').trim()).filter(Boolean))]

    await withTransaction(async (conn) => {
      await conn.execute('UPDATE clubs SET is_featured = FALSE, updated_at = NOW()')
      if (slugs.length > 0) {
        const placeholders = slugs.map(() => '?').join(', ')
        await conn.execute(
          `UPDATE clubs SET is_featured = TRUE, updated_at = NOW() WHERE slug IN (${placeholders})`,
          slugs,
        )
      }
    })

    res.json({ ok: true, featuredSlugs: slugs })
  }),
)

/* ------------------------------------------- registered managers & players */

const USER_ROLES = new Set(['player', 'club_manager', 'admin', 'owner'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function parseUserEmail(value: unknown): string {
  const s = requiredString(value, 'Email', 190).toLowerCase()
  if (!EMAIL_RE.test(s)) {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 })
  }
  return s
}

function parseUserRole(value: unknown): string {
  const s = String(value ?? 'club_manager').trim().toLowerCase()
  if (!USER_ROLES.has(s)) {
    throw Object.assign(
      new Error("role must be 'player', 'club_manager', 'admin', or 'owner'."),
      { status: 400 },
    )
  }
  return s
}

function parseOptionalPassword(value: unknown, required: boolean): string | null {
  const s = String(value ?? '')
  if (!s) {
    if (required) throw Object.assign(new Error('Password is required.'), { status: 400 })
    return null
  }
  if (s.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters.'), { status: 400 })
  }
  if (Buffer.byteLength(s, 'utf8') > MAX_PASSWORD_BYTES) {
    throw Object.assign(new Error('Password is too long.'), { status: 400 })
  }
  return s
}

const USER_SELECT_SQL = `
  SELECT u.id, u.email, u.display_name, u.role, u.club_id, u.is_active, u.created_at,
         c.name AS club_name, c.slug AS club_slug,
         p.id AS player_id, p.gamertag, p.slug AS player_slug
    FROM users u
    LEFT JOIN clubs c ON c.id = u.club_id
    LEFT JOIN players p ON p.user_id = u.id
`

admin.get(
  '/users',
  handler(async (_req, res) => {
    const users = await queryAll(`${USER_SELECT_SQL} ORDER BY u.created_at DESC, u.id DESC`)
    res.json({ users })
  }),
)

admin.post(
  '/users',
  handler(async (req, res) => {
    const email = parseUserEmail(req.body?.email)
    const plainPassword = parseOptionalPassword(req.body?.password, true)!
    const displayName = optionalString(req.body?.displayName, 120)
    const role = parseUserRole(req.body?.role)
    const isActive = req.body?.isActive === undefined ? true : Boolean(req.body.isActive)
    const rawClubId = req.body?.clubId
    const clubId =
      rawClubId === null || rawClubId === undefined || rawClubId === ''
        ? null
        : Number(rawClubId)
    if (clubId !== null && (!Number.isSafeInteger(clubId) || clubId < 1)) {
      return res.status(400).json({ error: 'clubId must be a positive integer or null.' })
    }
    const gamertag = optionalString(req.body?.gamertag, 120)

    const hash = await hashPassword(plainPassword)

    const createdId = await withTransaction(async (conn) => {
      const [existingEmail] = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [
        email,
      ])
      if ((existingEmail as unknown[]).length > 0) {
        throw Object.assign(new Error('An account with that email already exists.'), {
          status: 409,
        })
      }

      if (clubId !== null) {
        const [clubRows] = await conn.query('SELECT id FROM clubs WHERE id = ? LIMIT 1', [clubId])
        if (!((clubRows as unknown[])[0])) {
          throw Object.assign(new Error('Selected club does not exist.'), { status: 404 })
        }
      }

      const [inserted] = await conn.execute(
        `INSERT INTO users
           (email, password_hash, display_name, role, club_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [email, hash, displayName, role, clubId, isActive ? 1 : 0],
      )
      const userId = (inserted as any).insertId as number

      if (gamertag) {
        const key = gamertagKey(gamertag)
        const [existingPlayers] = await conn.query(
          'SELECT id, user_id FROM players WHERE gamertag_key = ? FOR UPDATE',
          [key],
        )
        const existingPlayer = (existingPlayers as Array<{ id: number; user_id: number | null }>)[0]
        if (existingPlayer) {
          if (existingPlayer.user_id && existingPlayer.user_id !== userId) {
            throw Object.assign(
              new Error('That gamertag is already linked to another account.'),
              { status: 409 },
            )
          }
          await conn.execute(
            `UPDATE players
                SET user_id = ?,
                    club_id = COALESCE(?, club_id),
                    is_free_agent = IF(COALESCE(?, club_id) IS NULL, TRUE, FALSE),
                    updated_at = NOW()
              WHERE id = ?`,
            [userId, clubId, clubId, existingPlayer.id],
          )
        } else {
          await conn.execute(
            `INSERT INTO players
               (gamertag, gamertag_key, slug, user_id, club_id, is_free_agent, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [gamertag, key, clubSlug(gamertag) || key, userId, clubId, clubId === null ? 1 : 0],
          )
        }
      }

      return userId
    })

    const user = await queryOne(`${USER_SELECT_SQL} WHERE u.id = ?`, [createdId])
    res.status(201).json({ user })
  }),
)

admin.put(
  '/users/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'User id must be a positive integer.' })
    }

    const email = parseUserEmail(req.body?.email)
    const plainPassword = parseOptionalPassword(req.body?.password, false)
    const displayName = optionalString(req.body?.displayName, 120)
    const role = parseUserRole(req.body?.role)
    const isActive = req.body?.isActive === undefined ? true : Boolean(req.body.isActive)
    const rawClubId = req.body?.clubId
    const clubId =
      rawClubId === null || rawClubId === undefined || rawClubId === ''
        ? null
        : Number(rawClubId)
    if (clubId !== null && (!Number.isSafeInteger(clubId) || clubId < 1)) {
      return res.status(400).json({ error: 'clubId must be a positive integer or null.' })
    }
    const gamertagProvided = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'gamertag')
    const gamertag = optionalString(req.body?.gamertag, 120)

    const hash = plainPassword ? await hashPassword(plainPassword) : null

    const found = await withTransaction(async (conn) => {
      const [existingRows] = await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [id])
      if (!((existingRows as unknown[])[0])) return false

      const [emailDup] = await conn.query(
        'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
        [email, id],
      )
      if ((emailDup as unknown[]).length > 0) {
        throw Object.assign(new Error('Another account already uses that email address.'), {
          status: 409,
        })
      }

      if (clubId !== null) {
        const [clubRows] = await conn.query('SELECT id FROM clubs WHERE id = ? LIMIT 1', [clubId])
        if (!((clubRows as unknown[])[0])) {
          throw Object.assign(new Error('Selected club does not exist.'), { status: 404 })
        }
      }

      if (hash) {
        await conn.execute(
          `UPDATE users
              SET email = ?, password_hash = ?, display_name = ?, role = ?, club_id = ?, is_active = ?, updated_at = NOW()
            WHERE id = ?`,
          [email, hash, displayName, role, clubId, isActive ? 1 : 0, id],
        )
      } else {
        await conn.execute(
          `UPDATE users
              SET email = ?, display_name = ?, role = ?, club_id = ?, is_active = ?, updated_at = NOW()
            WHERE id = ?`,
          [email, displayName, role, clubId, isActive ? 1 : 0, id],
        )
      }

      if (!isActive) {
        await conn.execute('DELETE FROM sessions WHERE user_id = ?', [id])
      }

      if (gamertagProvided) {
        if (!gamertag) {
          await conn.execute('UPDATE players SET user_id = NULL, updated_at = NOW() WHERE user_id = ?', [id])
        } else {
          const key = gamertagKey(gamertag)
          const [linkedRows] = await conn.query(
            'SELECT id FROM players WHERE user_id = ? FOR UPDATE',
            [id],
          )
          const linked = (linkedRows as Array<{ id: number }>)[0]

          const [byTagRows] = await conn.query(
            'SELECT id, user_id FROM players WHERE gamertag_key = ? FOR UPDATE',
            [key],
          )
          const byTag = (byTagRows as Array<{ id: number; user_id: number | null }>)[0]

          if (byTag && byTag.user_id && byTag.user_id !== id) {
            throw Object.assign(
              new Error('That gamertag is already linked to another account.'),
              { status: 409 },
            )
          }

          if (linked && (!byTag || byTag.id === linked.id)) {
            await conn.execute(
              `UPDATE players
                  SET gamertag = ?, gamertag_key = ?, slug = ?, updated_at = NOW()
                WHERE id = ?`,
              [gamertag, key, clubSlug(gamertag) || key, linked.id],
            )
          } else if (byTag) {
            if (linked) {
              await conn.execute('UPDATE players SET user_id = NULL, updated_at = NOW() WHERE id = ?', [
                linked.id,
              ])
            }
            await conn.execute('UPDATE players SET user_id = ?, updated_at = NOW() WHERE id = ?', [
              id,
              byTag.id,
            ])
          } else {
            await conn.execute(
              `INSERT INTO players
                 (gamertag, gamertag_key, slug, user_id, club_id, is_free_agent, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [gamertag, key, clubSlug(gamertag) || key, id, clubId, clubId === null ? 1 : 0],
            )
          }
        }
      }

      return true
    })

    if (!found) return res.status(404).json({ error: 'Account not found.' })
    const user = await queryOne(`${USER_SELECT_SQL} WHERE u.id = ?`, [id])
    res.json({ user })
  }),
)

admin.delete(
  '/users/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'User id must be a positive integer.' })
    }

    const deleted = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [id])
      if (!((rows as unknown[])[0])) return false

      await conn.execute('DELETE FROM sessions WHERE user_id = ?', [id])
      await conn.execute('DELETE FROM notifications WHERE user_id = ?', [id])
      await conn.execute('UPDATE players SET user_id = NULL, updated_at = NOW() WHERE user_id = ?', [
        id,
      ])
      await conn.execute('DELETE FROM users WHERE id = ?', [id])
      return true
    })

    if (!deleted) return res.status(404).json({ error: 'Account not found.' })
    res.json({ ok: true, id })
  }),
)

const PLAYER_SELECT_SQL = `
  SELECT p.id, p.gamertag, p.slug, p.club_id, p.is_free_agent, p.user_id, p.created_at,
         c.name AS club_name, c.slug AS club_slug, c.short_code AS club_code,
         u.email AS user_email, u.display_name AS user_name
    FROM players p
    LEFT JOIN clubs c ON c.id = p.club_id
    LEFT JOIN users u ON u.id = p.user_id
`

admin.get(
  '/players',
  handler(async (_req, res) => {
    const players = await queryAll(`${PLAYER_SELECT_SQL} ORDER BY p.gamertag ASC, p.id ASC`)
    res.json({ players })
  }),
)

admin.post(
  '/players',
  handler(async (req, res) => {
    const gamertag = requiredString(req.body?.gamertag, 'Gamertag', 120)
    const rawClubId = req.body?.clubId
    const clubId =
      rawClubId === null || rawClubId === undefined || rawClubId === ''
        ? null
        : Number(rawClubId)
    if (clubId !== null && (!Number.isSafeInteger(clubId) || clubId < 1)) {
      return res.status(400).json({ error: 'clubId must be a positive integer or null.' })
    }

    const createdId = await withTransaction(async (conn) => {
      const key = gamertagKey(gamertag)
      const [existing] = await conn.query(
        'SELECT id, gamertag FROM players WHERE gamertag_key = ? LIMIT 1',
        [key],
      )
      const dup = (existing as Array<{ id: number; gamertag: string }>)[0]
      if (dup) {
        throw Object.assign(new Error(`${dup.gamertag} is already registered.`), { status: 409 })
      }

      if (clubId !== null) {
        const [clubRows] = await conn.query('SELECT id FROM clubs WHERE id = ? LIMIT 1', [clubId])
        if (!((clubRows as unknown[])[0])) {
          throw Object.assign(new Error('Selected club does not exist.'), { status: 404 })
        }
      }

      let slug = clubSlug(gamertag) || key
      let suffix = 2
      while (true) {
        const [slugRows] = await conn.query('SELECT id FROM players WHERE slug = ? LIMIT 1', [slug])
        if ((slugRows as unknown[]).length === 0) break
        slug = `${clubSlug(gamertag) || key}-${suffix++}`
      }

      const [inserted] = await conn.execute(
        `INSERT INTO players
           (gamertag, gamertag_key, slug, club_id, is_free_agent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [gamertag, key, slug, clubId, clubId === null ? 1 : 0],
      )
      return (inserted as any).insertId as number
    })

    const player = await queryOne(`${PLAYER_SELECT_SQL} WHERE p.id = ?`, [createdId])
    res.status(201).json({ player })
  }),
)

admin.put(
  '/players/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Player id must be a positive integer.' })
    }
    const gamertag = requiredString(req.body?.gamertag, 'Gamertag', 120)
    const rawClubId = req.body?.clubId
    const clubId =
      rawClubId === null || rawClubId === undefined || rawClubId === ''
        ? null
        : Number(rawClubId)
    if (clubId !== null && (!Number.isSafeInteger(clubId) || clubId < 1)) {
      return res.status(400).json({ error: 'clubId must be a positive integer or null.' })
    }

    const found = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT id, slug FROM players WHERE id = ? FOR UPDATE', [id])
      const current = (rows as Array<{ id: number; slug: string }>)[0]
      if (!current) return false

      const key = gamertagKey(gamertag)
      const [dups] = await conn.query(
        'SELECT id, gamertag FROM players WHERE gamertag_key = ? AND id <> ? LIMIT 1',
        [key, id],
      )
      const dup = (dups as Array<{ id: number; gamertag: string }>)[0]
      if (dup) {
        throw Object.assign(new Error(`${dup.gamertag} is already registered.`), { status: 409 })
      }

      if (clubId !== null) {
        const [clubRows] = await conn.query('SELECT id FROM clubs WHERE id = ? LIMIT 1', [clubId])
        if (!((clubRows as unknown[])[0])) {
          throw Object.assign(new Error('Selected club does not exist.'), { status: 404 })
        }
      }

      let slug = clubSlug(gamertag) || key
      let suffix = 2
      while (true) {
        const [slugRows] = await conn.query(
          'SELECT id FROM players WHERE slug = ? AND id <> ? LIMIT 1',
          [slug, id],
        )
        if ((slugRows as unknown[]).length === 0) break
        slug = `${clubSlug(gamertag) || key}-${suffix++}`
      }

      await conn.execute(
        `UPDATE players
            SET gamertag = ?, gamertag_key = ?, slug = ?, club_id = ?, is_free_agent = ?, updated_at = NOW()
          WHERE id = ?`,
        [gamertag, key, slug, clubId, clubId === null ? 1 : 0, id],
      )
      return true
    })

    if (!found) return res.status(404).json({ error: 'Player not found.' })
    const player = await queryOne(`${PLAYER_SELECT_SQL} WHERE p.id = ?`, [id])
    res.json({ player })
  }),
)

admin.delete(
  '/players/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Player id must be a positive integer.' })
    }

    const deleted = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT id FROM players WHERE id = ? FOR UPDATE', [id])
      if (!((rows as unknown[])[0])) return false

      await conn.execute('DELETE FROM transfer_requests WHERE player_id = ?', [id])
      await conn.execute('DELETE FROM transfers WHERE player_id = ?', [id])
      await conn.execute('DELETE FROM player_season_stats WHERE player_id = ?', [id])
      await conn.execute('DELETE FROM players WHERE id = ?', [id])
      return true
    })

    if (!deleted) return res.status(404).json({ error: 'Player not found.' })
    res.json({ ok: true, id })
  }),
)

/* ------------------------------------------------------- homepage regions */

function parseArtUrl(value: unknown): string {
  const s = String(value ?? '').trim()
  if (!s) throw Object.assign(new Error('Flag artwork image is required.'), { status: 400 })
  if (s.length > 6_000_000) {
    throw Object.assign(new Error('Flag artwork image is too large (max ~4.5 MB).'), { status: 400 })
  }
  return s
}

admin.get(
  '/regions',
  handler(async (_req, res) => {
    const regions = await queryAll(
      `SELECT id, iso, name, flag, art_url, is_active, sort_order
         FROM homepage_regions
        ORDER BY sort_order, id`,
    )
    res.json({ regions })
  }),
)

admin.post(
  '/regions',
  handler(async (req, res) => {
    const name = requiredString(req.body?.name, 'Region name', 120)
    const iso = requiredString(req.body?.iso, 'ISO code', 16).toUpperCase()
    const flag = requiredString(req.body?.flag, 'Flag emoji', 32)
    const artUrl = parseArtUrl(req.body?.artUrl ?? req.body?.art_url)
    const rawActive = req.body?.isActive ?? req.body?.is_active
    const isActive = rawActive === undefined ? true : Boolean(rawActive)

    const region = await withTransaction(async (conn) => {
      const [maxRows] = await conn.query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM homepage_regions FOR UPDATE',
      )
      const sortOrder = Number((maxRows as Array<{ next_order: number }>)[0]?.next_order ?? 0)
      const [inserted] = await conn.execute(
        `INSERT INTO homepage_regions
           (iso, name, flag, art_url, is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [iso, name, flag, artUrl, isActive ? 1 : 0, sortOrder],
      )
      const id = (inserted as any).insertId as number
      return { id, iso, name, flag, art_url: artUrl, is_active: isActive, sort_order: sortOrder }
    })

    res.status(201).json({ region })
  }),
)

admin.put(
  '/regions/order',
  handler(async (req, res) => {
    const ids = req.body?.regionIds
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.some((id) => !Number.isSafeInteger(id) || id < 1)
    ) {
      return res.status(400).json({ error: 'regionIds must be a non-empty array of region IDs.' })
    }

    await withTransaction(async (conn) => {
      for (let i = 0; i < ids.length; i += 1) {
        await conn.execute(
          'UPDATE homepage_regions SET sort_order = ?, updated_at = NOW() WHERE id = ?',
          [i, ids[i]],
        )
      }
    })

    res.json({ ok: true })
  }),
)

admin.put(
  '/regions/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Region id must be a positive integer.' })
    }

    const region = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        'SELECT id, iso, name, flag, art_url, is_active, sort_order FROM homepage_regions WHERE id = ? FOR UPDATE',
        [id],
      )
      const current = (rows as Array<{
        id: number
        iso: string
        name: string
        flag: string
        art_url: string
        is_active: number | boolean
        sort_order: number
      }>)[0]
      if (!current) return null

      const name =
        req.body?.name !== undefined
          ? requiredString(req.body.name, 'Region name', 120)
          : current.name
      const iso =
        req.body?.iso !== undefined
          ? requiredString(req.body.iso, 'ISO code', 16).toUpperCase()
          : current.iso
      const flag =
        req.body?.flag !== undefined
          ? requiredString(req.body.flag, 'Flag emoji', 32)
          : current.flag
      const rawArt = req.body?.artUrl ?? req.body?.art_url
      const artUrl = rawArt !== undefined ? parseArtUrl(rawArt) : current.art_url
      const rawActive = req.body?.isActive ?? req.body?.is_active
      const isActive =
        rawActive !== undefined ? Boolean(rawActive) : Boolean(current.is_active)

      await conn.execute(
        `UPDATE homepage_regions
            SET iso = ?, name = ?, flag = ?, art_url = ?, is_active = ?, updated_at = NOW()
          WHERE id = ?`,
        [iso, name, flag, artUrl, isActive ? 1 : 0, id],
      )
      return {
        id,
        iso,
        name,
        flag,
        art_url: artUrl,
        is_active: isActive,
        sort_order: current.sort_order,
      }
    })

    if (!region) return res.status(404).json({ error: 'Region not found.' })
    res.json({ region })
  }),
)

admin.delete(
  '/regions/:id',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Region id must be a positive integer.' })
    }

    const affected = await execute('DELETE FROM homepage_regions WHERE id = ?', [id])
    if (affected === 0) return res.status(404).json({ error: 'Region not found.' })
    res.json({ ok: true, id })
  }),
)



