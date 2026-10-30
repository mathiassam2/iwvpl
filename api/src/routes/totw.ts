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
 * The formation is fixed at 4-3-3. Slots are numbered in display order, top of
 * the poster to bottom: 0-2 attack, 3-5 midfield, 6-9 defence, 10 goalkeeper.
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
      (p.photo_close IS NOT NULL AND p.photo_close <> '') AS has_close,
      (p.photo_candid IS NOT NULL AND p.photo_candid <> '') AS has_candid,
      COALESCE(UNIX_TIMESTAMP(p.updated_at), 1) AS v
     FROM totw_players p
     LEFT JOIN clubs c ON (
       (p.club_id IS NOT NULL AND c.id = p.club_id)
       OR
       (p.club_id IS NULL AND p.club_name IS NOT NULL AND LOWER(TRIM(c.name)) = LOWER(TRIM(p.club_name)))
     )
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

    const weeks = await queryAll<{ id: number; label: string; published_at: string | null }>(
      `SELECT id, label, published_at FROM totw_weeks
        WHERE status = 'published'
        ORDER BY published_at DESC, id DESC
        LIMIT 60`,
    )
    const requested = Number.parseInt(String(req.query.week ?? ''), 10)
    const current = weeks.find((w) => w.id === requested) ?? weeks[0]

    let players: ReturnType<typeof serializePlayer>[] = []
    if (current) {
      const rows = await loadPlayersForWeek(current.id)
      players = rows.map((r) => serializePlayer(r, '/api/totw/photo'))
    }

    res.json({
      weeks: weeks.map((w) => ({ id: w.id, label: w.label, publishedAt: w.published_at })),
      week: current
        ? { id: current.id, label: current.label, publishedAt: current.published_at, players }
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
  }>('SELECT id, label, status, published_at, updated_at FROM totw_weeks WHERE id = ?', [id])
  if (!week) fail(404, 'Week not found.')
  return week
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
      player_count: number
    }>(
      `SELECT w.id, w.label, w.status, w.published_at, w.created_at, w.updated_at,
              (SELECT COUNT(*) FROM totw_players p WHERE p.week_id = w.id) AS player_count
         FROM totw_weeks w
        ORDER BY w.created_at DESC, w.id DESC`,
    )
    res.json({
      weeks: weeks.map((w) => ({
        id: w.id,
        label: w.label,
        status: w.status,
        publishedAt: w.published_at,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
        playerCount: Number(w.player_count),
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

totwAdmin.post(
  '/weeks',
  handler(async (req, res) => {
    const label = cleanLabel(req.body?.label)
    const [result] = await pool.execute(
      `INSERT INTO totw_weeks (label, status, created_at, updated_at)
       VALUES (?, 'draft', NOW(), NOW())`,
      [label],
    )
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

    if (status === 'published') {
      const count = await queryOne<{ n: number }>(
        'SELECT COUNT(*) AS n FROM totw_players WHERE week_id = ?',
        [week.id],
      )
      if (!count || Number(count.n) < 1) fail(400, 'Add at least one player before publishing.')
    }

    await execute(
      `UPDATE totw_weeks
          SET label = ?, status = ?,
              published_at = CASE
                WHEN ? = 'published' AND published_at IS NULL THEN NOW()
                WHEN ? = 'draft' THEN NULL
                ELSE published_at END,
              updated_at = NOW()
        WHERE id = ?`,
      [label, status, status, status, week.id],
    )
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
    if (!close.has && !candid.has) fail(400, 'Upload at least one photo for this player.')

    if (existing) {
      const sets = [
        'name = ?',
        'shirt_number = ?',
        'position = ?',
        'club_id = ?',
        'club_name = ?',
        'player_id = ?',
      ]
      const params: (string | number | null)[] = [name, shirtNumber, position, clubId, clubName, playerId]
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
            photo_close, photo_candid, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          week.id,
          slot,
          name,
          shirtNumber,
          position,
          clubId,
          clubName,
          playerId,
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
