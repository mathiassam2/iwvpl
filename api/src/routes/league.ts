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

function kualaLumpurClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  const date = `${part('year')}-${part('month')}-${part('day')}`
  return { date, datetime: `${date} ${part('hour')}:${part('minute')}:${part('second')}` }
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

league.get(
  '/seasons/current',
  handler(async (_req, res) => {
    const season = await queryOne<{
      id: number
      name: string
      year: number
      is_current: number
      featured_division_id: number | null
    }>(
      'SELECT id, name, year, is_current, featured_division_id FROM seasons WHERE is_current = TRUE LIMIT 1',
    )
    if (!season) return res.status(404).json({ error: 'No current season' })

    const divisions = await queryAll(
      'SELECT id, name, slug, sort_order FROM divisions WHERE season_id = ? ORDER BY sort_order, id',
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
    const where = includePending ? '' : "WHERE c.status = 'active'"
    const requestedSeasonId = req.query.seasonId
    let seasonId: number | null = null
    if (requestedSeasonId !== undefined) {
      seasonId = Number(requestedSeasonId)
      if (!Number.isSafeInteger(seasonId) || seasonId < 1) {
        return res.status(400).json({ error: 'seasonId must be a positive integer.' })
      }
      const season = await queryOne<{ id: number }>('SELECT id FROM seasons WHERE id = ?', [seasonId])
      if (!season) return res.status(404).json({ error: 'Season not found.' })
    }

    const clubs = await queryAll(
      `SELECT c.id, c.name, c.slug, c.short_code, c.flag, c.logo_url, c.logo_local, c.status,
              (SELECT COUNT(*) FROM players p WHERE p.club_id = c.id) AS players,
              (SELECT dc.division_id FROM division_clubs dc
                JOIN divisions d ON d.id = dc.division_id
                WHERE dc.club_id = c.id
                  AND (? IS NULL OR d.season_id = ?)
                  AND (? IS NOT NULL OR d.season_id = (
                    SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1
                  ))
                ORDER BY dc.id DESC LIMIT 1) AS division_id
         FROM clubs c ${where}
        ORDER BY c.name`,
      [seasonId, seasonId, seasonId],
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
    const requestedSeasonId = req.query.seasonId
    let seasonId: number | null = null
    if (requestedSeasonId !== undefined) {
      seasonId = Number(requestedSeasonId)
      if (!Number.isSafeInteger(seasonId) || seasonId < 1) {
        return res.status(400).json({ error: 'seasonId must be a positive integer.' })
      }
      const season = await queryOne<{ id: number }>(
        'SELECT id FROM seasons WHERE id = ?',
        [seasonId],
      )
      if (!season) return res.status(404).json({ error: 'Season not found.' })
    }
    const requestedClubSlug = req.query.clubSlug
    const clubSlug =
      typeof requestedClubSlug === 'string' && requestedClubSlug.trim()
        ? requestedClubSlug.trim().slice(0, 140)
        : null
    const latestFirst = req.query.sort === 'latest'
    const result = req.query.result === 'pending' || req.query.result === 'completed'
      ? req.query.result
      : 'all'
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : ''
    const searchPattern = `%${search}%`
    const scoreFilter = result === 'pending'
      ? '(m.home_score IS NULL OR m.away_score IS NULL)'
      : result === 'completed'
        ? '(m.home_score IS NOT NULL AND m.away_score IS NOT NULL)'
        : '1 = 1'
    // LOWER on both sides for the same reason as the priorities search: the
    // column collation is not pinned, so plain LIKE follows the cluster
    // default and is not reliably case-insensitive. Short codes are compared
    // too, since that is what the tables and crests actually show.
    const searchFilter = search
      ? `(LOWER(home.name) LIKE LOWER(?) OR LOWER(away.name) LIKE LOWER(?)
          OR LOWER(home.short_code) LIKE LOWER(?) OR LOWER(away.short_code) LIKE LOWER(?))`
      : '1 = 1'
    const where = `(? IS NULL OR m.status = ?)
      AND (? IS NULL OR m.season_id = ?)
      AND (? IS NULL OR home.slug = ? OR away.slug = ?)
      AND ${scoreFilter}
      AND ${searchFilter}`
    const whereParams = [
      status,
      status,
      seasonId,
      seasonId,
      clubSlug,
      clubSlug,
      clubSlug,
      ...(search ? [searchPattern, searchPattern, searchPattern, searchPattern] : []),
    ]
    const { date, datetime } = kualaLumpurClock()
    const ordering = latestFirst
      ? 'ORDER BY m.kickoff DESC, m.id DESC'
      : `ORDER BY
            CASE
              WHEN (m.home_score IS NULL OR m.away_score IS NULL) AND m.kickoff IS NULL THEN 0
              WHEN m.home_score IS NOT NULL AND m.away_score IS NOT NULL THEN 4
              WHEN m.kickoff <= ? THEN 1
              WHEN DATE(m.kickoff) = ? THEN 2
              ELSE 3
            END,
            CASE WHEN m.kickoff <= ? OR DATE(m.kickoff) = ? THEN m.kickoff END ASC,
            m.kickoff DESC, m.id DESC`
    const orderingParams = latestFirst ? [] : [datetime, date, datetime, date]

    const [rows, count, summary] = await Promise.all([
      queryAll(
        `SELECT m.id, m.kickoff, m.status, m.home_score, m.away_score, m.source_url,
                m.venue, m.stream_url,
                home.name AS home_name, home.slug AS home_slug, home.short_code AS home_code,
                home.logo_local AS home_logo, home.flag AS home_flag,
                away.name AS away_name, away.slug AS away_slug, away.short_code AS away_code,
                away.logo_local AS away_logo, away.flag AS away_flag
           FROM matches m
           JOIN clubs home ON home.id = m.home_club_id
           JOIN clubs away ON away.id = m.away_club_id
          WHERE ${where}
          ${ordering}
          LIMIT ? OFFSET ?`,
        [...whereParams, ...orderingParams, limit, offset],
      ),
      queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total
           FROM matches m
           JOIN clubs home ON home.id = m.home_club_id
           JOIN clubs away ON away.id = m.away_club_id
          WHERE ${where}`,
        whereParams,
      ),
      // Unfiltered counts for the admin's tab labels. Kept separate from
      // `total`, which is scoped to the current filter: the admin needs the size
      // of every view at once, and a count that changed as you moved between
      // them was reporting a different population each time.
      //
      // The public site only ever asks for status=finished and reads `total`,
      // so the undated fixtures this now includes do not reach it.
      queryOne<{ all_total: number; pending_total: number; completed_total: number }>(
        `SELECT COUNT(*) AS all_total,
                SUM(m.home_score IS NULL OR m.away_score IS NULL) AS pending_total,
                SUM(m.home_score IS NOT NULL AND m.away_score IS NOT NULL) AS completed_total
           FROM matches m`,
      ),
    ])

    res.json({
      matches: rows,
      total: Number(count?.total ?? 0),
      allTotal: Number(summary?.all_total ?? 0),
      pendingTotal: Number(summary?.pending_total ?? 0),
      completedTotal: Number(summary?.completed_total ?? 0),
      limit,
      offset,
    })
  }),
)

league.get(
  '/matches/priorities',
  handler(async (req, res) => {
    const { date, datetime } = kualaLumpurClock()

    const limit = intParam(req.query.limit, 25, 1, 200)
    const offset = intParam(req.query.offset, 0, 0, 100000)
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

    // Searched on the admin side, which is the only consumer, but kept here so
    // the panel never has to pull the whole list to filter it in the browser.
    // Both ends of the fixture are searched: an admin looking up a club wants
    // its games whether it is listed home or away, and half the results is a
    // worse answer than none.
    //
    // LOWER on both sides rather than relying on the column collation. The
    // schema does not pin a collation, so LIKE inherits the cluster default,
    // and TiDB commonly defaults to a binary one — which made the search
    // quietly case-sensitive.
    const searchClause = search
      ? `AND (LOWER(home.name) LIKE LOWER(?) OR LOWER(away.name) LIKE LOWER(?)
             OR LOWER(home.short_code) LIKE LOWER(?) OR LOWER(away.short_code) LIKE LOWER(?))`
      : ''
    const searchParams = search
      ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
      : []

    const [{ total }] = await queryAll<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM matches m
         JOIN clubs home ON home.id = m.home_club_id
         JOIN clubs away ON away.id = m.away_club_id
        WHERE (m.home_score IS NULL OR m.away_score IS NULL)
          AND (m.kickoff IS NULL OR m.kickoff <= ? OR (DATE(m.kickoff) = ? AND m.kickoff > ?))
          ${searchClause}`,
      [datetime, date, datetime, ...searchParams],
    )

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
        WHERE (m.home_score IS NULL OR m.away_score IS NULL)
          AND (m.kickoff IS NULL OR m.kickoff <= ? OR (DATE(m.kickoff) = ? AND m.kickoff > ?))
          ${searchClause}
        ORDER BY (m.kickoff IS NULL) DESC, m.kickoff ASC, m.id ASC
        LIMIT ? OFFSET ?`,
      [datetime, date, datetime, ...searchParams, limit, offset],
    )
    res.json({ matches: rows, total: Number(total ?? 0), limit, offset })
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
    const requestedSeasonId = req.query.seasonId
    let season: {
      id: number
      name: string
      year: number
      is_current: number
      featured_division_id: number | null
    } | null | undefined
    if (requestedSeasonId === undefined) {
      season = await queryOne(
        'SELECT id, name, year, is_current, featured_division_id FROM seasons WHERE is_current = TRUE LIMIT 1',
      )
    } else {
      const seasonId = Number(requestedSeasonId)
      if (!Number.isSafeInteger(seasonId) || seasonId < 1) {
        return res.status(400).json({ error: 'seasonId must be a positive integer.' })
      }
      season = await queryOne(
        'SELECT id, name, year, is_current, featured_division_id FROM seasons WHERE id = ?',
        [seasonId],
      )
    }
    if (!season) return res.status(404).json({ error: 'Season not found.' })

    const rows = await queryAll(
      `SELECT ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY s.position) AS position,
              s.played, s.won, s.drawn, s.lost,
              s.goals_for, s.goals_against, s.goal_difference, s.points, s.form,
              c.id AS club_id, c.name, c.slug, c.short_code, c.logo_local, c.flag,
              d.name AS division_name, d.slug AS division_slug,
              d.promotion_count, d.relegation_count, d.sort_order
         FROM standings_snapshot s
         JOIN clubs c ON c.id = s.club_id
         JOIN divisions d ON d.id = s.division_id
         JOIN seasons selected_season ON selected_season.id = d.season_id
         JOIN division_clubs current_membership
           ON current_membership.club_id = s.club_id
          AND current_membership.division_id = s.division_id
        WHERE d.season_id = ?
          AND (? IS NULL OR d.slug = ?)
          AND NOT EXISTS (
            SELECT 1
              FROM division_clubs newer_membership
              JOIN divisions newer_division ON newer_division.id = newer_membership.division_id
             WHERE newer_membership.club_id = current_membership.club_id
               AND newer_division.season_id = d.season_id
               AND newer_membership.id > current_membership.id
          )
        ORDER BY d.sort_order, d.id, s.position`,
      [
        season.id,
        typeof req.query.division === 'string' ? req.query.division : null,
        typeof req.query.division === 'string' ? req.query.division : null,
      ],
    )
    res.json({ season, standings: rows })
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

/* -------------------------------------------------------------- divisions */

/**
 * Divisions of the current season.
 *
 * Public because division names already appear in the standings response, so
 * this leaks nothing new — and the admin app assigns clubs from the same list
 * rather than hard-coding division names.
 */
league.get(
  '/divisions',
  handler(async (_req, res) => {
    const requestedSeasonId = _req.query.seasonId
    let seasonId: number
    if (requestedSeasonId === undefined) {
      const season = await queryOne<{ id: number }>(
        'SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1',
      )
      if (!season) return res.json({ divisions: [] })
      seasonId = season.id
    } else {
      seasonId = Number(requestedSeasonId)
      if (!Number.isSafeInteger(seasonId) || seasonId < 1) {
        return res.status(400).json({ error: 'seasonId must be a positive integer.' })
      }
      const season = await queryOne<{ id: number }>('SELECT id FROM seasons WHERE id = ?', [seasonId])
      if (!season) return res.status(404).json({ error: 'Season not found.' })
    }
    const rows = await queryAll(
      `SELECT d.id, d.name, d.slug, s.id AS season_id, s.name AS season,
              d.sort_order, d.promotion_count, d.relegation_count
         FROM divisions d
         JOIN seasons s ON s.id = d.season_id
        WHERE s.id = ?
        ORDER BY d.sort_order, d.id`,
      [seasonId],
    )
    res.json({ divisions: rows })
  }),
)

/* ---------------------------------------------------------------- players */

/**
 * One player, addressed by slug.
 *
 * The public profile route exists because players created through an account
 * are rows here and nothing else — the SPA's static crawl JSON cannot know
 * about them. Everything the profile page shows is assembled here: club from
 * players.club_id, season totals from player_season_stats, career from
 * transfers.
 *
 * Rank is counted within the player's own division rather than taken from the
 * crawl, so a new signing is ranked against the same table it will appear in.
 * A player with no stats row simply has no boards, which is how the profile
 * page renders a newcomer with no season history.
 */
league.get(
  '/players/:slug',
  handler(async (req, res) => {
    const player = await queryOne<{
      id: number
      gamertag: string
      slug: string
      avatar_local: string | null
      is_free_agent: number
      club_name: string | null
      club_logo: string | null
      club_flag: string | null
    }>(
      `SELECT p.id, p.gamertag, p.slug, p.avatar_local, p.is_free_agent,
              c.name AS club_name, c.logo_local AS club_logo, c.flag AS club_flag
         FROM players p
         LEFT JOIN clubs c ON c.id = p.club_id
        WHERE p.slug = ?`,
      [req.params.slug],
    )
    if (!player) return res.status(404).json({ error: 'Player not found' })

    const totals = await queryOne<{
      goals: number
      assists: number
      saves: number
      appearances: number
      division_id: number | null
    }>(
      `SELECT ps.goals, ps.assists, ps.saves, ps.appearances, ps.division_id
         FROM player_season_stats ps
         JOIN seasons s ON s.id = ps.season_id AND s.is_current = TRUE
        WHERE ps.player_id = ?
        LIMIT 1`,
      [player.id],
    )

    // Rank within the same division, counting how many are strictly ahead.
    // Absent a stats row there is nothing to rank.
    const rank = async (column: string): Promise<number | null> => {
      if (!totals) return null
      const row = await queryOne<{ n: number }>(
        `SELECT COUNT(*) + 1 AS n
           FROM player_season_stats mine
           JOIN player_season_stats other ON other.division_id = mine.division_id
           JOIN seasons s ON s.id = mine.season_id AND s.is_current = TRUE
          WHERE mine.player_id = ?
            AND other.${column} > mine.${column}`,
        [player.id],
      )
      return Number(row?.n ?? 1)
    }

    const moves = await queryAll(
      `SELECT t.occurred_at, t.kind, t.from_club_id, t.to_club_id,
              fc.name AS from_name, fc.logo_local AS from_logo,
              tc.name AS to_name, tc.logo_local AS to_logo
         FROM transfers t
         LEFT JOIN clubs fc ON fc.id = t.from_club_id
         LEFT JOIN clubs tc ON tc.id = t.to_club_id
        WHERE t.player_id = ?
        ORDER BY t.occurred_at DESC, t.id DESC
        LIMIT 50`,
      [player.id],
    )

    const boards = []
    if (totals) {
      const units: Array<[string, string, number]> = [
        ['Goals', 'goals', totals.goals],
        ['Assists', 'assists', totals.assists],
        ['Saves', 'saves', totals.saves],
      ]
      for (const [board, column, value] of units) {
        if (!value) continue
        boards.push({ board, unit: column, value, rank: await rank(column) })
      }
    }

    res.json({
      player: {
        gamertag: player.gamertag,
        slug: player.slug,
        avatar: player.avatar_local,
        club: player.club_name
          ? {
              name: player.club_name,
              logo: player.club_logo,
              flag: player.club_flag,
              free: false,
            }
          : { name: 'Free agent', logo: null, flag: null, free: true },
        isFreeAgent: Boolean(player.is_free_agent),
        appearances: totals?.appearances ?? 0,
        stats: boards,
        moves: moves.map((m: any) => {
          // Direction is read off which side is the real club: joining from free
          // agency or another club is an arrival, dropping to NULL is a
          // departure. Same rule the static transfer feed uses.
          const joined = !m.from_club_id || Boolean(m.to_club_id)
          return {
            date: m.occurred_at,
            direction: joined ? 'in' : 'out',
            club: joined ? m.to_name : m.from_name,
            logo: joined ? m.to_logo : m.from_logo,
            free: !joined || !m.to_club_id,
            kind: m.kind,
          }
        }),
      },
    })
  }),
)
