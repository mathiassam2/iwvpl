/**
 * Read-only league endpoints.
 *
 * Everything here is a thin projection over tables the admin app will later
 * write to. Phase 1 is read-only on purpose: it proves the schema, the seed and
 * the connection before any write path exists to debug alongside them.
 */

import { Router } from 'express'
import { queryAll, queryOne, ping } from '../db.js'
import type { Row } from '../db.js'

export const league = Router()

/**
 * Express 4 does not catch rejected promises from async handlers — an
 * unhandled rejection escapes the router and the request hangs until the client
 * times out. This wrapper routes it to the error middleware instead.
 */
function handler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next)
}

/** Clamp a query parameter to a sane integer. Never trust the query string. */
function intParam(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/* ------------------------------------------------------------------ health */

league.get(
  '/health',
  handler(async (_req, res) => {
    const startedAt = process.hrtime.bigint()
    try {
      await ping()
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6
      res.json({ status: 'ok', database: 'reachable', latencyMs: Math.round(ms * 100) / 100 })
    } catch (err) {
      // 503, not 500: the server is up, its dependency is not. Render treats
      // these differently when deciding whether to keep the instance alive.
      res.status(503).json({
        status: 'degraded',
        database: 'unreachable',
        error: err instanceof Error ? err.message : 'unknown',
      })
    }
  }),
)

/* ------------------------------------------------------------------ season */

league.get(
  '/seasons/current',
  handler(async (_req, res) => {
    const season = await queryOne<{ id: number; name: string; year: number }>(
      'SELECT id, name, year FROM seasons WHERE is_current = TRUE LIMIT 1',
    )
    if (!season) return res.status(404).json({ error: 'No current season' })

    const divisions = await queryAll(
      'SELECT id, name, slug FROM divisions WHERE season_id = ? ORDER BY id',
      [season.id],
    )
    res.json({ ...season, divisions })
  }),
)

/* ------------------------------------------------------------------- clubs */

league.get(
  '/clubs',
  handler(async (req, res) => {
    const includePending = req.query.includePending === 'true'
    const where = includePending ? '' : 'WHERE status = \'active\''

    const clubs = await queryAll(
      `SELECT id, name, slug, short_code, flag, logo_url, logo_local, status
         FROM clubs ${where}
        ORDER BY name`,
    )
    res.json({ clubs })
  }),
)

league.get(
  '/clubs/:slug',
  handler(async (req, res) => {
    const club = await queryOne<{ id: number }>(
      `SELECT id, name, slug, short_code, flag, logo_url, logo_local, status, source_url
         FROM clubs WHERE slug = ?`,
      [req.params.slug],
    )
    if (!club) return res.status(404).json({ error: 'Club not found' })

    const [division, players] = await Promise.all([
      queryOne(
        `SELECT d.id, d.name, d.slug
           FROM divisions d
           JOIN division_clubs dc ON dc.division_id = d.id
          WHERE dc.club_id = ?
          ORDER BY d.id DESC LIMIT 1`,
        [club.id],
      ),
      queryAll(
        `SELECT id, gamertag, slug, avatar_local, is_free_agent
           FROM players WHERE club_id = ? ORDER BY gamertag`,
        [club.id],
      ),
    ])

    res.json({ ...club, division, players })
  }),
)

/* ----------------------------------------------------------------- matches */

league.get(
  '/matches',
  handler(async (req, res) => {
    const limit = intParam(req.query.limit, 50, 1, 200)
    const offset = intParam(req.query.offset, 0, 0, 100000)
    const status = typeof req.query.status === 'string' ? req.query.status : null

    const rows = await queryAll(
      `SELECT m.id, m.kickoff, m.status, m.home_score, m.away_score, m.source_url,
              m.venue, m.stream_url,
              home.name AS home_name, home.slug AS home_slug, home.short_code AS home_code,
              home.logo_local AS home_logo, home.flag AS home_flag,
              away.name AS away_name, away.slug AS away_slug, away.short_code AS away_code,
              away.logo_local AS away_logo, away.flag AS away_flag
         FROM matches m
         JOIN clubs home ON home.id = m.home_club_id
         JOIN clubs away ON away.id = m.away_club_id
        WHERE (? IS NULL OR m.status = ?)
        ORDER BY m.kickoff DESC, m.id DESC
        LIMIT ? OFFSET ?`,
      [status, status, limit, offset],
    )

    res.json({ matches: rows, limit, offset })
  }),
)

league.get(
  '/matches/:id',
  handler(async (req, res) => {
    const match = await queryOne<{ id: number }>(
      `SELECT m.id, m.kickoff, m.status, m.home_score, m.away_score,
              m.venue, m.stream_url, m.source_url,
              home.name AS home_name, home.slug AS home_slug, home.logo_local AS home_logo,
              away.name AS away_name, away.slug AS away_slug, away.logo_local AS away_logo
         FROM matches m
         JOIN clubs home ON home.id = m.home_club_id
         JOIN clubs away ON away.id = m.away_club_id
        WHERE m.id = ?`,
      [req.params.id],
    )
    if (!match) return res.status(404).json({ error: 'Match not found' })

    const [events, stats] = await Promise.all([
      queryAll(
        `SELECT minute, type, team_side, player_name, detail, score
           FROM match_events WHERE match_id = ? ORDER BY minute, id`,
        [match.id],
      ),
      queryOne('SELECT * FROM match_stats WHERE match_id = ?', [match.id]),
    ])

    res.json({ ...match, events, stats: stats ?? null })
  }),
)

/* --------------------------------------------------------------- standings */

/**
 * Reads the materialised snapshot, not a recomputation over `matches`.
 * See the comment on the standings_snapshot table for why that distinction is
 * load-bearing.
 */
league.get(
  '/standings',
  handler(async (req, res) => {
    const rows = await queryAll(
      `SELECT s.position, s.played, s.won, s.drawn, s.lost,
              s.goals_for, s.goals_against, s.goal_difference, s.points, s.form,
              c.id AS club_id, c.name, c.slug, c.short_code, c.logo_local, c.flag,
              d.name AS division_name, d.slug AS division_slug
         FROM standings_snapshot s
         JOIN clubs c ON c.id = s.club_id
         JOIN divisions d ON d.id = s.division_id
        WHERE (? IS NULL OR d.slug = ?)
        ORDER BY d.id, s.position`,
      [
        typeof req.query.division === 'string' ? req.query.division : null,
        typeof req.query.division === 'string' ? req.query.division : null,
      ],
    )
    res.json({ standings: rows })
  }),
)

/* ------------------------------------------------------------ leaderboards */

/** Which leaderboard column a requested board name maps to. */
const BOARDS: Record<string, 'goals' | 'assists' | 'saves'> = {
  scorer: 'goals',
  'top-scorer': 'goals',
  goals: 'goals',
  assist: 'assists',
  assists: 'assists',
  saves: 'saves',
}

league.get(
  '/leaderboards',
  handler(async (req, res) => {
    const requested = typeof req.query.board === 'string' ? req.query.board.toLowerCase() : 'goals'
    const column = BOARDS[requested]
    if (!column) {
      return res.status(400).json({
        error: `Unknown board "${requested}"`,
        available: Object.keys(BOARDS),
      })
    }

    const limit = intParam(req.query.limit, 10, 1, 100)
    const rows = await queryAll<Row>(
      `SELECT ps.${column} AS value, p.id AS player_id, p.gamertag, p.slug,
              p.avatar_local, c.name AS club_name, c.slug AS club_slug
         FROM player_season_stats ps
         JOIN players p ON p.id = ps.player_id
         LEFT JOIN clubs c ON c.id = p.club_id
        WHERE ps.${column} > 0
        ORDER BY ps.${column} DESC, p.gamertag ASC
        LIMIT ?`,
      [limit],
    )

    res.json({ board: column, rows })
  }),
)