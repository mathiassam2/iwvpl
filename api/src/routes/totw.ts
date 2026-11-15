/**
 * Team of the Week.
 *
 * Two routers live here:
 *
 *  - `totw`      public site, mounted at /api/totw. Everything except the
 *                access probe is gated by the access setting below.
 *  - `totwAdmin` admin app, mounted at /api/admin/totw behind basic auth.
 *
 * Who may view the page (while it is being tested) is one setting:
 *
 *    totw_access_mode   'all'      everyone, signed in or not
 *                       'selected' only the accounts listed in totw_access_users
 *                                  (owner / admin accounts are always allowed)
 *
 * Until an admin changes it the mode is 'selected' with nobody listed, so a
 * freshly deployed page is invisible by default.
 *
 * The formation is fixed at 4-4-2. Slots are numbered in display order, top of
 * the poster to bottom: 0-1 attack, 2-5 midfield, 6-9 defence, 10 goalkeeper.
 *
 * Every week belongs to one division and one game week (matches.round_number).
 * That binding is what makes the suggestions honest: the candidate list is
 * built from the ratings the players earned in exactly that game week, so a
 * number on the card is the number that earned the place rather than a
 * season average or last week's form.
 */

import { Router } from 'express'
import { execute, pool, queryAll, queryOne } from '../db.js'
import { attachUser } from '../middleware/auth.js'

export const totw = Router()
export const totwAdmin = Router()

const SLOT_COUNT = 11
const MAX_IMAGE_CHARS = 9_000_000 // ~6.5 MB of binary once decoded
const KINDS = { close: 'photo_close', candid: 'photo_candid' } as const
type PhotoKind = keyof typeof KINDS

function handler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next)
}

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status })
}

/* ---------------------------------------------------------------- settings */

interface TotwAccess {
  mode: 'all' | 'selected'
  userIds: number[]
}

async function readAccess(): Promise<TotwAccess> {
  const rows = await queryAll<{ setting_key: string; setting_value: string }>(
    `SELECT setting_key, setting_value FROM system_settings
      WHERE setting_key IN ('totw_access_mode', 'totw_access_users')`,
  ).catch(() => [])
  const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]))
  const mode = map.get('totw_access_mode') === 'all' ? 'all' : 'selected'
  let userIds: number[] = []
  try {
    const parsed = JSON.parse(map.get('totw_access_users') ?? '[]')
    if (Array.isArray(parsed)) {
      userIds = parsed.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0)
    }
  } catch {
    userIds = []
  }
  return { mode, userIds }
}

async function writeSetting(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
    [key, value, value],
  )
}

async function canView(req: any): Promise<boolean> {
  const access = await readAccess()
  if (access.mode === 'all') return true
  const user = req.user as { id: number; role: string } | undefined
  if (!user) return false
  if (user.role === 'owner' || user.role === 'admin') return true
  return access.userIds.includes(user.id)
}

/* -------------------------------------------------------------- the shape */

/**
 * Which positions belong to which group.
 *
 * The C/L/R variants are EA's own abbreviations for the same lines (LCM plays
 * as a CM, LCB as a CB) and sit in the same group.
 */
const POSITION_GROUP_MEMBERS: Record<string, string[]> = {
  GK: ['GK'],
  DEF: ['LB', 'LWB', 'CB', 'RB', 'RWB', 'LCB', 'RCB'],
  MID: ['CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'LCM', 'RCM'],
  ST: ['CF', 'ST'],
}

/** The fixed 4-4-2 slot layout: 0-1 attack, 2-5 midfield, 6-9 defence, 10 keeper. */
const SLOT_POSITIONS = ['ST', 'ST', 'LM', 'CM', 'CM', 'RM', 'LB', 'CB', 'CB', 'RB', 'GK']

/** Which group a recorded position belongs to. Null when it is not one we know. */
function positionGroup(position: unknown): string | null {
  const p = String(position ?? '').trim().toUpperCase()
  if (!p) return null
  for (const group of Object.keys(POSITION_GROUP_MEMBERS)) {
    if (POSITION_GROUP_MEMBERS[group].includes(p)) return group
  }
  return null
}

/** The group each formation slot belongs to. */
const SLOT_GROUPS = SLOT_POSITIONS.map((p) => positionGroup(p))

/**
 * The divisions a Team of the Week can be made for.
 *
 * The current season's active divisions come first and, when it has any, are
 * the only ones returned: a live page should not offer last season's Premier
 * League. If the current season somehow has none, every active division is
 * returned instead of an empty picker.
 */
async function listDivisions() {
  const rows = await queryAll<{
    id: number
    name: string
    slug: string
    season_id: number
    sort_order: number
    season_name: string
    is_current: number
  }>(
    `SELECT d.id, d.name, d.slug, d.season_id, d.sort_order,
            s.name AS season_name, s.is_current
       FROM divisions d
       JOIN seasons s ON s.id = d.season_id
      WHERE d.is_active = TRUE
      ORDER BY s.is_current DESC, d.sort_order, d.id`,
  )
  const current = rows.filter((r) => Number(r.is_current) === 1)
  return current.length > 0 ? current : rows
}

/**
 * The game weeks that have fixtures in a division, with how many of those
 * fixtures have been played and how many player-stat rows have been imported
 * for them. The stat count is what tells the admin whether the suggestion
 * list will have anything in it.
 */
async function listGameWeeks(divisionId: number) {
  const [fixtures, stats] = await Promise.all([
    queryAll<{ gameWeek: number; matches: number; played: number }>(
      `SELECT round_number AS gameWeek,
              COUNT(*) AS matches,
              COALESCE(SUM(home_score IS NOT NULL AND away_score IS NOT NULL), 0) AS played
         FROM matches
        WHERE division_id = ? AND round_number IS NOT NULL AND round_number > 0
        GROUP BY round_number
        ORDER BY round_number`,
      [divisionId],
    ),
    queryAll<{ gameWeek: number; statRows: number }>(
      `SELECT m.round_number AS gameWeek, COUNT(ps.id) AS statRows
         FROM match_player_stats ps
         JOIN matches m ON m.id = ps.match_id
        WHERE m.division_id = ? AND m.round_number IS NOT NULL AND m.round_number > 0
        GROUP BY m.round_number`,
      [divisionId],
    ),
  ])
  const statsByWeek = new Map(stats.map((s) => [Number(s.gameWeek), Number(s.statRows)]))
  return fixtures.map((f) => {
    const gameWeek = Number(f.gameWeek)
    return {
      gameWeek,
      matches: Number(f.matches),
      played: Number(f.played),
      statRows: statsByWeek.get(gameWeek) ?? 0,
    }
  })
}

/**
 * Players worth a slot, ranked by the rating they earned in one game week.
 *
 * The filter is deliberately narrow: one division, one game week, matches that
 * were actually played, and a rating that was actually recorded. A player who
 * did not feature that week is not a candidate for that week's team, and a
 * rating from a different week is a different number entirely.
 */
async function suggestPlayers(divisionId: number, gameWeek: number, group: string) {
  const positions = POSITION_GROUP_MEMBERS[group] ?? []
  const placeholders = positions.map(() => '?').join(',')
  if (!positions.length) return []
  return queryAll(
    `SELECT ps.player_id AS player_id,
            MAX(ps.gamertag) AS gamertag,
            MAX(ps.pos) AS pos,
            MAX(ps.club_id) AS club_id,
            MAX(c.name) AS club_name,
            MAX(CASE
                  WHEN LEFT(COALESCE(c.logo_local, c.logo_url, ''), 5) = 'data:'
                    THEN CONCAT('/api/clubs/', c.slug, '/logo?v=', COALESCE(UNIX_TIMESTAMP(c.updated_at), 1))
                  ELSE COALESCE(c.logo_local, c.logo_url)
                END) AS club_logo,
            MAX(COALESCE(pl.avatar_local, pl.avatar_url)) AS avatar,
            ROUND(AVG(ps.rating), 1) AS rating,
            COALESCE(SUM(ps.goals), 0) AS goals,
            COALESCE(SUM(ps.assists), 0) AS assists,
            COUNT(*) AS appearances,
            COALESCE(SUM(ps.is_mom), 0) AS mom
       FROM match_player_stats ps
       JOIN matches m ON m.id = ps.match_id
       LEFT JOIN players pl ON pl.id = ps.player_id
       LEFT JOIN clubs c ON c.id = ps.club_id
      WHERE m.division_id = ?
        AND m.round_number = ?
        AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
        AND ps.rating IS NOT NULL AND ps.rating > 0
        AND UPPER(ps.pos) IN (${placeholders})
      GROUP BY ps.player_id
      ORDER BY rating DESC, goals DESC, assists DESC, appearances DESC, gamertag ASC
      LIMIT 50`,
    [divisionId, gameWeek, ...positions],
  )
}

/**
 * One player's numbers in one game week. Used to snapshot the rating onto
 * the pick, so the card can never show a rating from a different week.
 */
async function playerPerformance(
  divisionId: number,
  gameWeek: number,
  playerId: number,
): Promise<{ rating: number | null; goals: number; assists: number; appearances: number } | null> {
  const row = await queryOne<{
    rating: number | null
    goals: number
    assists: number
    appearances: number
  }>(
    `SELECT ROUND(AVG(ps.rating), 1) AS rating,
            COALESCE(SUM(ps.goals), 0) AS goals,
            COALESCE(SUM(ps.assists), 0) AS assists,
            COUNT(*) AS appearances
       FROM match_player_stats ps
       JOIN matches m ON m.id = ps.match_id
      WHERE m.division_id = ?
        AND m.round_number = ?
        AND ps.player_id = ?
        AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
        AND ps.rating IS NOT NULL AND ps.rating > 0`,
    [divisionId, gameWeek, playerId],
  )
  if (!row || Number(row.appearances) === 0) return null
  return {
    rating: row.rating == null ? null : Number(row.rating),
    goals: Number(row.goals ?? 0),
    assists: Number(row.assists ?? 0),
    appearances: Number(row.appearances),
  }
}

/* ------------------------------------------------------------------ shared */

interface PlayerRow {
  id: number
  week_id: number
  slot: number
  name: string
  shirt_number: number | null
  position: string
  club_id: number | null
  club_name: string | null
  club_logo: string | null
  player_id: number | null
  player_slug: string | null
  player_avatar: string | null
  rating: number | null
  goals: number
  assists: number
  has_close: number
  has_candid: number
  v: number
}

async function loadPlayersForWeek(weekId: number): Promise<PlayerRow[]> {
  return queryAll<PlayerRow>(
    `SELECT
      p.id, p.week_id, p.slot, p.name, p.shirt_number, p.position,
      COALESCE(p.club_id, c.id) AS club_id,
      COALESCE(p.club_name, c.name) AS club_name,
      CASE
        WHEN LEFT(COALESCE(c.logo_local, c.logo_url, ''), 5) = 'data:'
          THEN CONCAT('/api/clubs/', c.slug, '/logo?v=', COALESCE(UNIX_TIMESTAMP(c.updated_at), 1))
        ELSE COALESCE(c.logo_local, c.logo_url)
      END AS club_logo,
      p.player_id,
      pl.slug AS player_slug,
      COALESCE(pl.avatar_local, pl.avatar_url) AS player_avatar,
      p.rating,
      p.goals,
      p.assists,
      (p.photo_close IS NOT NULL AND p.photo_close <> '') AS has_close,
      (p.photo_candid IS NOT NULL AND p.photo_candid <> '') AS has_candid,
      COALESCE(UNIX_TIMESTAMP(p.updated_at), 1) AS v
     FROM totw_players p
     LEFT JOIN clubs c ON (
       (p.club_id IS NOT NULL AND c.id = p.club_id)
       OR
       (p.club_id IS NULL AND p.club_name IS NOT NULL AND LOWER(TRIM(c.name)) = LOWER(TRIM(p.club_name)))
     )
     LEFT JOIN players pl ON pl.id = p.player_id
    WHERE p.week_id = ?
    ORDER BY p.slot ASC`,
    [weekId],
  )
}

function serializePlayer(row: PlayerRow, photoBase: string) {
  const url = (kind: PhotoKind) => `${photoBase}/${row.id}/${kind}?v=${row.v}`
  return {
    id: row.id,
    slot: row.slot,
    name: row.name,
    shirtNumber: row.shirt_number,
    position: row.position,
    clubId: row.club_id,
    clubName: row.club_name,
    clubLogo: row.club_logo || null,
    playerId: row.player_id,
    playerSlug: row.player_slug || null,
    // The registered player's own avatar, used when no poster photo was
    // uploaded. A pick made from the suggestion list is usable without one.
    avatarUrl: row.player_avatar || null,
    rating: row.rating == null ? null : Number(row.rating),
    goals: Number(row.goals ?? 0),
    assists: Number(row.assists ?? 0),
    closeUrl: row.has_close ? url('close') : null,
    candidUrl: row.has_candid ? url('candid') : null,
  }
}

function parseKind(value: unknown): PhotoKind {
  if (value === 'close' || value === 'candid') return value
  fail(404, 'Not found')
}

/** Streams a stored data-URL photo. Anything else is a 404. */
async function sendPhoto(res: any, playerRowId: number, kind: PhotoKind, onlyPublished: boolean) {
  const column = KINDS[kind]
  const row = await queryOne<{ img: string | null; status: string }>(
    `SELECT p.${column} AS img, w.status
       FROM totw_players p JOIN totw_weeks w ON w.id = p.week_id
      WHERE p.id = ? LIMIT 1`,
    [playerRowId],
  )
  if (!row?.img || (onlyPublished && row.status !== 'published')) {
    res.status(404).end()
    return
  }
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/is.exec(row.img)
  if (!match) {
    res.status(404).end()
    return
  }
  res.setHeader('Content-Type', match[1])
  // The URL carries ?v=<updated_at>, so a long private cache is safe.
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.setHeader('Pragma', 'cache')
  res.removeHeader('Expires')
  res.send(Buffer.from(match[2], 'base64'))
}

/* ------------------------------------------------------------------ public */

totw.use(attachUser())

totw.get(
  '/access',
  handler(async (req, res) => {
    res.json({ allowed: await canView(req) })
  }),
)

totw.get(
  '/',
  handler(async (req, res) => {
    if (!(await canView(req))) fail(403, 'Team of the Week is not available to your account yet.')

    const divisions = await listDivisions()
    const published = await queryAll<{
      id: number
      label: string
      published_at: string | null
      division_id: number | null
      game_week: number | null
      division_name: string | null
    }>(
      `SELECT w.id, w.label, w.published_at, w.division_id, w.game_week,
              d.name AS division_name
         FROM totw_weeks w
         LEFT JOIN divisions d ON d.id = w.division_id
        WHERE w.status = 'published'
        ORDER BY w.published_at DESC, w.id DESC
        LIMIT 300`,
    )

    const requestedWeek = Number.parseInt(String(req.query.week ?? ''), 10)
    const requestedDivision = Number.parseInt(String(req.query.division ?? ''), 10)
    const weekById = new Map(published.map((w) => [w.id, w]))
    const requested = Number.isSafeInteger(requestedWeek) ? weekById.get(requestedWeek) : undefined

    // A link to a week wins over the requested division: the week knows which
    // division it belongs to, so following the link cannot land the visitor
    // in the wrong tab.
    let divisionId: number | null = null
    if (requested?.division_id != null) {
      divisionId = requested.division_id
    } else if (
      Number.isSafeInteger(requestedDivision) &&
      divisions.some((d) => d.id === requestedDivision)
    ) {
      divisionId = requestedDivision
    }
    if (divisionId === null) {
      // Default to the first division that actually has a published team.
      const withWeeks = new Set(published.map((w) => w.division_id).filter((v) => v != null))
      divisionId = divisions.find((d) => withWeeks.has(d.id))?.id ?? null
    }

    const weeks = published
      .filter((w) => (divisionId === null ? true : w.division_id === divisionId))
      .sort((a, b) => Number(a.game_week ?? 0) - Number(b.game_week ?? 0) || a.id - b.id)

    const current =
      (requested && weeks.some((w) => w.id === requested.id) ? requested : weeks[weeks.length - 1]) ??
      null

    let players: ReturnType<typeof serializePlayer>[] = []
    if (current) {
      const rows = await loadPlayersForWeek(current.id)
      players = rows.map((r) => serializePlayer(r, '/api/totw/photo'))
    }

    const weekCountByDivision = new Map<number, number>()
    for (const w of published) {
      if (w.division_id == null) continue
      weekCountByDivision.set(w.division_id, (weekCountByDivision.get(w.division_id) ?? 0) + 1)
    }

    res.json({
      divisions: divisions.map((d) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        seasonName: d.season_name,
        weekCount: weekCountByDivision.get(d.id) ?? 0,
      })),
      divisionId,
      weeks: weeks.map((w) => ({
        id: w.id,
        label: w.label,
        publishedAt: w.published_at,
        divisionId: w.division_id,
        divisionName: w.division_name,
        gameWeek: w.game_week == null ? null : Number(w.game_week),
      })),
      week: current
        ? {
            id: current.id,
            label: current.label,
            publishedAt: current.published_at,
            divisionId: current.division_id,
            divisionName: current.division_name,
            gameWeek: current.game_week == null ? null : Number(current.game_week),
            players,
          }
        : null,
    })
  }),
)

totw.get(
  '/photo/:id/:kind',
  handler(async (req, res) => {
    if (!(await canView(req))) {
      res.status(403).end()
      return
    }
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(404).end()
      return
    }
    await sendPhoto(res, id, parseKind(req.params.kind), true)
  }),
)

/* ------------------------------------------------------------------- admin */

function weekId(value: unknown): number {
  const id = Number.parseInt(String(value), 10)
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'Invalid week.')
  return id
}

function slotIndex(value: unknown): number {
  const n = Number.parseInt(String(value), 10)
  if (!Number.isInteger(n) || n < 0 || n >= SLOT_COUNT) fail(400, 'Invalid formation slot.')
  return n
}

function cleanLabel(value: unknown): string {
  const s = String(value ?? '').trim()
  if (!s) fail(400, 'Give this week a name, e.g. "Matchweek 12".')
  if (s.length > 120) fail(400, 'Week name is too long.')
  return s
}

function cleanImage(value: unknown, what: string): string {
  const s = String(value ?? '')
  if (!/^data:image\/(png|webp|jpeg|jpg|avif);base64,/i.test(s)) {
    fail(400, `${what} must be a PNG, WebP or JPEG image.`)
  }
  if (s.length > MAX_IMAGE_CHARS) fail(400, `${what} is too large. Use an image under about 6 MB.`)
  return s
}

async function loadWeek(id: number) {
  const week = await queryOne<{
    id: number
    label: string
    status: string
    published_at: string | null
    updated_at: string
    division_id: number | null
    season_id: number | null
    game_week: number | null
  }>(
    `SELECT id, label, status, published_at, updated_at, division_id, season_id, game_week
       FROM totw_weeks WHERE id = ?`,
    [id],
  )
  if (!week) fail(404, 'Week not found.')
  return week
}

/** The division and game week a week is bound to, validated against the fixtures. */
async function resolveBinding(divisionIdRaw: unknown, gameWeekRaw: unknown) {
  const divisionId = Number.parseInt(String(divisionIdRaw ?? ''), 10)
  if (!Number.isSafeInteger(divisionId) || divisionId < 1) {
    fail(400, 'Pick the division this team belongs to.')
  }
  const divisions = await listDivisions()
  const division = divisions.find((d) => d.id === divisionId)
  if (!division) fail(400, 'That division is not available.')

  const gameWeek = Number.parseInt(String(gameWeekRaw ?? ''), 10)
  if (!Number.isSafeInteger(gameWeek) || gameWeek < 1) {
    fail(400, 'Pick the game week this team covers.')
  }
  const weeks = await listGameWeeks(divisionId)
  if (!weeks.some((w) => w.gameWeek === gameWeek)) {
    fail(400, `Game week ${gameWeek} has no fixtures in ${division.name}.`)
  }
  return { divisionId, gameWeek, division }
}

/** Refuses a second team for the same division and game week. */
async function assertNoDuplicate(divisionId: number, gameWeek: number, exceptWeekId?: number) {
  const clash = await queryOne<{ id: number }>(
    `SELECT id FROM totw_weeks
      WHERE division_id = ? AND game_week = ? AND (? IS NULL OR id <> ?)
      LIMIT 1`,
    [divisionId, gameWeek, exceptWeekId ?? null, exceptWeekId ?? null],
  )
  if (clash) fail(409, 'That division already has a Team of the Week for this game week.')
}

totwAdmin.get(
  '/',
  handler(async (_req, res) => {
    const weeks = await queryAll<{
      id: number
      label: string
      status: string
      published_at: string | null
      created_at: string
      updated_at: string
      division_id: number | null
      game_week: number | null
      division_name: string | null
      player_count: number
    }>(
      `SELECT w.id, w.label, w.status, w.published_at, w.created_at, w.updated_at,
              w.division_id, w.game_week, d.name AS division_name,
              (SELECT COUNT(*) FROM totw_players p WHERE p.week_id = w.id) AS player_count
         FROM totw_weeks w
         LEFT JOIN divisions d ON d.id = w.division_id
        ORDER BY w.created_at DESC, w.id DESC`,
    )
    const divisions = await listDivisions()
    res.json({
      weeks: weeks.map((w) => ({
        id: w.id,
        label: w.label,
        status: w.status,
        publishedAt: w.published_at,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
        divisionId: w.division_id,
        divisionName: w.division_name,
        gameWeek: w.game_week == null ? null : Number(w.game_week),
        playerCount: Number(w.player_count),
      })),
      divisions: divisions.map((d) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        seasonName: d.season_name,
      })),
      access: await readAccess(),
    })
  }),
)

totwAdmin.put(
  '/access',
  handler(async (req, res) => {
    const mode = req.body?.mode === 'all' ? 'all' : 'selected'
    const raw: unknown[] = Array.isArray(req.body?.userIds) ? req.body.userIds : []
    const userIds = [
      ...new Set(raw.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0)),
    ].slice(0, 5000)
    await writeSetting('totw_access_mode', mode)
    await writeSetting('totw_access_users', JSON.stringify(userIds))
    res.json({ access: { mode, userIds } })
  }),
)

totwAdmin.get(
  '/game-weeks',
  handler(async (req, res) => {
    const divisionId = Number.parseInt(String(req.query.divisionId ?? ''), 10)
    if (!Number.isSafeInteger(divisionId) || divisionId < 1) {
      fail(400, 'Pick a division first.')
    }
    res.json({ gameWeeks: await listGameWeeks(divisionId) })
  }),
)

totwAdmin.post(
  '/weeks',
  handler(async (req, res) => {
    const { divisionId, gameWeek, division } = await resolveBinding(
      req.body?.divisionId,
      req.body?.gameWeek,
    )
    await assertNoDuplicate(divisionId, gameWeek)
    const label =
      req.body?.label === undefined || String(req.body.label ?? '').trim() === ''
        ? `Game Week ${gameWeek}`
        : cleanLabel(req.body.label)
    const [result] = await pool.execute(
      `INSERT INTO totw_weeks (label, status, division_id, season_id, game_week, created_at, updated_at)
         VALUES (?, 'draft', ?, ?, ?, NOW(), NOW())`,
      [label, divisionId, division.season_id, gameWeek],
    ).catch((err: any) => {
      // The unique index on (division_id, game_week) is the real guard; this
      // only catches two admins creating the same team at the same moment.
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
        fail(409, 'That division already has a Team of the Week for this game week.')
      }
      throw err
    })
    res.status(201).json({ id: (result as { insertId: number }).insertId })
  }),
)

totwAdmin.get(
  '/weeks/:id',
  handler(async (req, res) => {
    const week = await loadWeek(weekId(req.params.id))
    const rows = await loadPlayersForWeek(week.id)
    res.json({
      week: {
        id: week.id,
        label: week.label,
        status: week.status,
        publishedAt: week.published_at,
        divisionId: week.division_id,
        gameWeek: week.game_week == null ? null : Number(week.game_week),
      },
      players: rows.map((r) => serializePlayer(r, '/api/admin/totw/photo')),
    })
  }),
)

totwAdmin.put(
  '/weeks/:id',
  handler(async (req, res) => {
    const week = await loadWeek(weekId(req.params.id))
    const label = req.body?.label === undefined ? week.label : cleanLabel(req.body.label)

    let status = week.status
    if (req.body?.status !== undefined) {
      if (req.body.status !== 'draft' && req.body.status !== 'published') {
        fail(400, "status must be 'draft' or 'published'.")
      }
      status = req.body.status
    }

    let divisionId = week.division_id
    let gameWeek = week.game_week == null ? null : Number(week.game_week)
    const rebinding = req.body?.divisionId !== undefined || req.body?.gameWeek !== undefined
    if (rebinding) {
      const resolved = await resolveBinding(
        req.body?.divisionId ?? divisionId,
        req.body?.gameWeek ?? gameWeek,
      )
      divisionId = resolved.divisionId
      gameWeek = resolved.gameWeek
      await assertNoDuplicate(divisionId, gameWeek, week.id)
    }

    if (status === 'published') {
      const count = await queryOne<{ n: number }>(
        'SELECT COUNT(*) AS n FROM totw_players WHERE week_id = ?',
        [week.id],
      )
      if (!count || Number(count.n) < 1) fail(400, 'Add at least one player before publishing.')
    }

    await execute(
      `UPDATE totw_weeks
          SET label = ?, status = ?, division_id = ?, game_week = ?,
              published_at = CASE
                WHEN ? = 'published' AND published_at IS NULL THEN NOW()
                WHEN ? = 'draft' THEN NULL
                ELSE published_at END,
              updated_at = NOW()
        WHERE id = ?`,
      [label, status, divisionId, gameWeek, status, status, week.id],
    )

    // Moving a team to another game week invalidates the ratings frozen onto
    // its players, so they are retaken from the new week.
    if (rebinding && divisionId != null && gameWeek != null) {
      await resnapshotRatings(week.id, divisionId, gameWeek)
    }

    res.json({ ok: true })
  }),
)

totwAdmin.delete(
  '/weeks/:id',
  handler(async (req, res) => {
    const id = weekId(req.params.id)
    await execute('DELETE FROM totw_players WHERE week_id = ?', [id])
    await execute('DELETE FROM totw_weeks WHERE id = ?', [id])
    res.json({ ok: true })
  }),
)

/** Rewrites the frozen rating of every player in a week from that week. */
async function resnapshotRatings(weekId: number, divisionId: number, gameWeek: number) {
  const rows = await queryAll<{ id: number; player_id: number | null }>(
    'SELECT id, player_id FROM totw_players WHERE week_id = ?',
    [weekId],
  )
  for (const row of rows) {
    if (row.player_id == null) {
      await execute(
        'UPDATE totw_players SET rating = NULL, goals = 0, assists = 0 WHERE id = ?',
        [row.id],
      )
      continue
    }
    const perf = await playerPerformance(divisionId, gameWeek, row.player_id)
    await execute('UPDATE totw_players SET rating = ?, goals = ?, assists = ? WHERE id = ?', [
      perf?.rating ?? null,
      perf?.goals ?? 0,
      perf?.assists ?? 0,
      row.id,
    ])
  }
}

totwAdmin.get(
  '/suggestions',
  handler(async (req, res) => {
    const slot = req.query.slot === undefined ? null : slotIndex(req.query.slot)
    let divisionId: number | null = null
    let gameWeek: number | null = null
    const weekParam = req.query.weekId
    if (weekParam !== undefined && String(weekParam) !== '') {
      const week = await loadWeek(weekId(weekParam))
      divisionId = week.division_id
      gameWeek = week.game_week == null ? null : Number(week.game_week)
    } else {
      divisionId = Number.parseInt(String(req.query.divisionId ?? ''), 10) || null
      gameWeek = Number.parseInt(String(req.query.gameWeek ?? ''), 10) || null
    }

    if (divisionId == null || gameWeek == null) {
      res.json({
        divisionId,
        gameWeek,
        group: slot === null ? null : SLOT_GROUPS[slot],
        candidates: [],
        reason: 'This team is not bound to a division and game week yet.',
      })
      return
    }

    const groupParam = String(req.query.group ?? '').trim().toUpperCase()
    const group =
      groupParam === 'GK' || groupParam === 'DEF' || groupParam === 'MID' || groupParam === 'ST'
        ? groupParam
        : slot === null
          ? 'MID'
          : (SLOT_GROUPS[slot] ?? 'MID')

    const rows = await suggestPlayers(divisionId, gameWeek, group)

    // Players already in this team are flagged rather than hidden: the admin
    // may still want them, they just should not be added twice by accident.
    const pickedIds = new Set<number>()
    if (weekParam !== undefined && String(weekParam) !== '') {
      const picked = await queryAll<{ player_id: number }>(
        'SELECT player_id FROM totw_players WHERE week_id = ? AND player_id IS NOT NULL',
        [weekId(weekParam)],
      )
      for (const p of picked) pickedIds.add(Number(p.player_id))
    }

    res.json({
      divisionId,
      gameWeek,
      group,
      candidates: rows.map((r: any) => ({
        playerId: Number(r.player_id),
        gamertag: r.gamertag,
        position: r.pos,
        clubId: r.club_id == null ? null : Number(r.club_id),
        clubName: r.club_name,
        clubLogo: r.club_logo || null,
        avatarUrl: r.avatar || null,
        rating: Number(r.rating),
        goals: Number(r.goals),
        assists: Number(r.assists),
        appearances: Number(r.appearances),
        mom: Number(r.mom),
        picked: pickedIds.has(Number(r.player_id)),
      })),
      reason:
        rows.length === 0
          ? 'No player ratings have been imported for this game week yet.'
          : null,
    })
  }),
)

totwAdmin.put(
  '/weeks/:id/slots/:slot',
  handler(async (req, res) => {
    const week = await loadWeek(weekId(req.params.id))
    const slot = slotIndex(req.params.slot)
    const body = req.body ?? {}

    const name = String(body.name ?? '').trim()
    if (!name) fail(400, 'Player name is required.')
    if (name.length > 120) fail(400, 'Player name is too long.')

    const position = String(body.position ?? '').trim().toUpperCase()
    if (!position) fail(400, 'Position is required.')
    if (position.length > 16) fail(400, 'Position is too long.')

    let shirtNumber: number | null = null
    if (body.shirtNumber !== null && body.shirtNumber !== undefined && body.shirtNumber !== '') {
      const n = Number.parseInt(String(body.shirtNumber), 10)
      if (!Number.isInteger(n) || n < 0 || n > 99) fail(400, 'Shirt number must be 0 to 99.')
      shirtNumber = n
    }

    let clubName = String(body.clubName ?? '').trim().slice(0, 160) || null
    let clubIdRaw = Number.parseInt(String(body.clubId ?? ''), 10)
    let clubId = Number.isSafeInteger(clubIdRaw) && clubIdRaw > 0 ? clubIdRaw : null
    const playerIdRaw = Number.parseInt(String(body.playerId ?? ''), 10)
    const playerId = Number.isSafeInteger(playerIdRaw) && playerIdRaw > 0 ? playerIdRaw : null

    // If clubId is missing but clubName is present, match against registered clubs
    if (!clubId && clubName) {
      const match = await queryOne<{ id: number; name: string }>(
        'SELECT id, name FROM clubs WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
        [clubName],
      )
      if (match) {
        clubId = match.id
        clubName = match.name
      }
    } else if (clubId && !clubName) {
      const match = await queryOne<{ name: string }>('SELECT name FROM clubs WHERE id = ?', [clubId])
      if (match) clubName = match.name
    } else if (!clubId && playerId) {
      const match = await queryOne<{ club_id: number | null; club_name: string | null }>(
        'SELECT p.club_id, c.name AS club_name FROM players p LEFT JOIN clubs c ON c.id = p.club_id WHERE p.id = ?',
        [playerId],
      )
      if (match?.club_id) {
        clubId = match.club_id
        if (!clubName && match.club_name) clubName = match.club_name
      }
    }

    const existing = await queryOne<{
      id: number
      has_close: number
      has_candid: number
    }>(
      `SELECT id,
              (photo_close IS NOT NULL AND photo_close <> '') AS has_close,
              (photo_candid IS NOT NULL AND photo_candid <> '') AS has_candid
         FROM totw_players WHERE week_id = ? AND slot = ?`,
      [week.id, slot],
    )

    // undefined keeps the stored photo, null removes it, a data URL replaces it.
    const resolvePhoto = (incoming: unknown, had: boolean, what: string) => {
      if (incoming === undefined) return { keep: true as const, has: had }
      if (incoming === null || incoming === '') return { keep: false as const, value: null, has: false }
      return { keep: false as const, value: cleanImage(incoming, what), has: true }
    }

    const close = resolvePhoto(body.photoClose, Boolean(existing?.has_close), 'Close-up photo')
    const candid = resolvePhoto(body.photoCandid, Boolean(existing?.has_candid), 'Candid photo')

    // A pick made from the suggestion list carries the player's own avatar,
    // so a photo is only required when there is nothing else to show.
    if (!close.has && !candid.has && !playerId) {
      fail(400, 'Upload a photo for this player.')
    }

    // The rating is taken from this team's own game week, never from the
    // client, so the card cannot carry a number from another week.
    let rating: number | null = null
    let goals = 0
    let assists = 0
    if (playerId != null && week.division_id != null && week.game_week != null) {
      const perf = await playerPerformance(week.division_id, Number(week.game_week), playerId)
      rating = perf?.rating ?? null
      goals = perf?.goals ?? 0
      assists = perf?.assists ?? 0
    }

    if (existing) {
      const sets = [
        'name = ?',
        'shirt_number = ?',
        'position = ?',
        'club_id = ?',
        'club_name = ?',
        'player_id = ?',
        'rating = ?',
        'goals = ?',
        'assists = ?',
      ]
      const params: (number | string | null)[] = [
        name,
        shirtNumber,
        position,
        clubId,
        clubName,
        playerId,
        rating,
        goals,
        assists,
      ]
      if (!close.keep) {
        sets.push('photo_close = ?')
        params.push(close.value)
      }
      if (!candid.keep) {
        sets.push('photo_candid = ?')
        params.push(candid.value)
      }
      await execute(
        `UPDATE totw_players SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
        [...params, existing.id],
      )
    } else {
      await execute(
        `INSERT INTO totw_players
           (week_id, slot, name, shirt_number, position, club_id, club_name, player_id,
            rating, goals, assists, photo_close, photo_candid, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          week.id,
          slot,
          name,
          shirtNumber,
          position,
          clubId,
          clubName,
          playerId,
          rating,
          goals,
          assists,
          close.keep ? null : close.value,
          candid.keep ? null : candid.value,
        ],
      )
    }

    await execute('UPDATE totw_weeks SET updated_at = NOW() WHERE id = ?', [week.id])

    const players = await loadPlayersForWeek(week.id)
    const saved = players.find((p) => p.slot === slot) ?? null
    res.json({ player: saved ? serializePlayer(saved, '/api/admin/totw/photo') : null })
  }),
)

totwAdmin.delete(
  '/weeks/:id/slots/:slot',
  handler(async (req, res) => {
    const week = await loadWeek(weekId(req.params.id))
    const slot = slotIndex(req.params.slot)
    await execute('DELETE FROM totw_players WHERE week_id = ? AND slot = ?', [week.id, slot])
    // A published week with nobody left in it has nothing to show.
    const left = await queryOne<{ n: number }>(
      'SELECT COUNT(*) AS n FROM totw_players WHERE week_id = ?',
      [week.id],
    )
    if (week.status === 'published' && Number(left?.n ?? 0) === 0) {
      await execute(
        "UPDATE totw_weeks SET status = 'draft', published_at = NULL, updated_at = NOW() WHERE id = ?",
        [week.id],
      )
    } else {
      await execute('UPDATE totw_weeks SET updated_at = NOW() WHERE id = ?', [week.id])
    }
    res.json({ ok: true })
  }),
)

totwAdmin.get(
  '/photo/:id/:kind',
  handler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(404).end()
      return
    }
    await sendPhoto(res, id, parseKind(req.params.kind), false)
  }),
)
