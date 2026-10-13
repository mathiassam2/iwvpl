/**
 * Manager routes: /api/manager/*
 *
 * A manager owns exactly one club — users.club_id is a single column, not a
 * join table — so every handler starts by resolving that club and refusing to
 * act if there isn't one. Nothing here accepts a club id from the request: the
 * club is always the caller's own, which is what stops a manager from signing
 * players onto somebody else's squad by editing a URL.
 */

import { Router } from 'express'
import { queryAll, queryOne, withTransaction } from '../db.js'
import { requireAuth, requireManager } from '../middleware/auth.js'
import { clubSlug } from '../domain/slug.js'
import { notify } from '../domain/auth.js'

export const manager = Router()

/* Both are factories, so both are called. requireAuth must come first:
 * requireRole only inspects req.user, which nothing has populated yet, so
 * mounting the role check alone would 401 a perfectly valid session. */
manager.use(requireAuth(), requireManager())

function handler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next)
}

function bad(message: string): never {
  throw Object.assign(new Error(message), { status: 400 })
}

function id(value: unknown, field: string): number {
  const n = Number.parseInt(String(value), 10)
  if (!Number.isInteger(n) || n < 1) bad(`${field} must be a valid id.`)
  return n
}

/** The caller's club, or a 409 explaining that they need one first. */
async function ownClub(userId: number): Promise<{ id: number; name: string; slug: string }> {
  const club = await queryOne<{ id: number; name: string; slug: string }>(
    'SELECT id, name, slug FROM clubs WHERE id = (SELECT club_id FROM users WHERE id = ?)',
    [userId],
  )
  if (!club) {
    throw Object.assign(new Error('Create your club before managing a squad.'), { status: 409 })
  }
  return club
}

/* ------------------------------------------------------------ create club */

/**
 * Create a club and claim it.
 *
 * Created 'pending'. A league admin approves it before it appears anywhere
 * public. The manager can still build a squad in the meantime — signing
 * players is their own business — but the club cannot be listed or play until
 * then.
 *
 * Also left out of every division on purpose. Putting it in a table would give
 * it a position and a points total it never earned, and the standings file is
 * documented as authoritative base state that incremental results are applied
 * to — a fabricated row there is not something a later result can fix.
 *
 * An admin assigns the division separately, after approving.
 */
manager.post(
  '/club',
  handler(async (req, res) => {
    const user = req.user!
    const existing = await queryOne('SELECT club_id FROM users WHERE id = ?', [user.id])
    if (existing?.club_id) {
      throw Object.assign(new Error('You already manage a club.'), { status: 409 })
    }

    const name = String(req.body?.name ?? '').trim()
    if (!name) bad('Club name is required.')
    if (name.length > 120) bad('Club name is too long.')

    const slug = clubSlug(name)
    if (!slug) bad('That club name has no usable characters.')
    if (await queryOne('SELECT id FROM clubs WHERE slug = ?', [slug])) {
      bad('A club with that name already exists.')
    }

    const clubId = await withTransaction(async (conn) => {
      const [clubRes] = await conn.execute(
        `INSERT INTO clubs (name, slug, status, created_at, updated_at)
         VALUES (?, ?, 'pending', NOW(), NOW())`,
        [name, slug],
      )
      const id = (clubRes as any).insertId
      await conn.execute('UPDATE users SET club_id = ?, updated_at = NOW() WHERE id = ?', [
        id,
        user.id,
      ])
      return id
    })

    await notify(
      user.id,
      'welcome',
      'Club created',
      `${name} is waiting for league admin approval. Build your squad in the meantime.`,
      '/dashboard',
    )

    res.status(201).json({ ok: true, clubId })
  }),
)

/* -------------------------------------------------------- player search */

/**
 * Search players to sign.
 *
 * Restricted to players who have an account. An offer is a request for a
 * decision from someone who can log in and give it; sending one to a row that
 * has no account behind it produces a pending request that can never be
 * answered, and the only way to clear it is for an admin to edit the database.
 *
 * A club's own current squad is excluded — offering a signed player to the club
 * they already play for is a no-op at best.
 */
manager.get(
  '/players',
  handler(async (req, res) => {
    const club = await ownClub(req.user!.id)
    const q = String(req.query.q ?? '').trim().slice(0, 80)

    const rows = await queryAll(
      `SELECT p.id, p.gamertag, p.slug, p.avatar_local, p.club_id,
              c.name AS club_name,
              (SELECT tr.id FROM transfer_requests tr
                WHERE tr.player_id = p.id
                  AND tr.to_club_id = ?
                  AND tr.status = 'pending'
                LIMIT 1) AS pending_id
         FROM players p
         LEFT JOIN clubs c ON c.id = p.club_id
        WHERE p.user_id IS NOT NULL
          AND (p.club_id IS NULL OR p.club_id <> ?)
          AND (? = '' OR p.gamertag LIKE ?)
        ORDER BY p.gamertag
        LIMIT 25`,
      [club.id, club.id, q, `%${q}%`],
    )

    res.json({ players: rows })
  }),
)

/* --------------------------------------------------------------- offers */

/** Create an offer. One open offer per player per club, enforced here inside
 *  the transaction rather than by a unique index, because a rejected offer
 *  must not stop the same club offering again later. */
manager.post(
  '/offers',
  handler(async (req, res) => {
    const user = req.user!
    const club = await ownClub(user.id)
    const playerId = id(req.body?.playerId, 'Player')

    const kind = req.body?.kind ? String(req.body.kind) : null
    if (kind && !['loan', 'free', 'permanent'].includes(kind)) {
      bad('Kind must be loan, free or permanent.')
    }
    const message = req.body?.message ? String(req.body.message).trim().slice(0, 255) : null

    const player = await queryOne<{ id: number; gamertag: string; user_id: number | null; club_id: number | null }>(
      `SELECT id, gamertag, user_id, club_id FROM players WHERE id = ?`,
      [playerId],
    )
    if (!player) throw Object.assign(new Error('That player does not exist.'), { status: 404 })
    if (!player.user_id) {
      // Defence in depth: the search already filters these out, but this route
      // is reachable directly.
      throw Object.assign(
        new Error('That player has no account, so they cannot be offered to.'),
        { status: 400 },
      )
    }
    if (player.club_id === club.id) {
      throw Object.assign(new Error('That player already plays for your club.'), { status: 400 })
    }

    const requestId = await withTransaction(async (conn) => {
      const [open] = await conn.query(
        `SELECT id FROM transfer_requests
          WHERE player_id = ? AND to_club_id = ? AND status = 'pending' LIMIT 1`,
        [playerId, club.id],
      )
      if ((open as any[]).length > 0) {
        throw Object.assign(new Error('You already have an open offer for that player.'), {
          status: 409,
        })
      }

      const [res2] = await conn.execute(
        `INSERT INTO transfer_requests
           (player_id, from_club_id, to_club_id, kind, status, message, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, NOW())`,
        [playerId, player.club_id, club.id, kind, message],
      )
      return (res2 as any).insertId
    })

    await notify(
      player.user_id,
      'offer',
      `Offer from ${club.name}`,
      message || `${club.name} would like to sign you.`,
      '/dashboard',
    )

    res.status(201).json({ ok: true, id: requestId })
  }),
)

/** Outbox: every offer this club has made, newest first. */
manager.get(
  '/offers',
  handler(async (req, res) => {
    const club = await ownClub(req.user!.id)
    const rows = await queryAll(
      `SELECT tr.id, tr.status, tr.kind, tr.message, tr.created_at, tr.responded_at,
              p.id AS player_id, p.gamertag, p.avatar_local,
              fc.name AS from_club_name
         FROM transfer_requests tr
         JOIN players p   ON p.id = tr.player_id
         LEFT JOIN clubs fc ON fc.id = tr.from_club_id
        WHERE tr.to_club_id = ?
        ORDER BY tr.created_at DESC
        LIMIT 100`,
      [club.id],
    )
    res.json({ offers: rows })
  }),
)

/** Withdraw an offer. Only while it is still pending: an accepted or rejected
 *  request is a record of what happened and must not be rewritten. */
manager.delete(
  '/offers/:id',
  handler(async (req, res) => {
    const club = await ownClub(req.user!.id)
    const requestId = id(req.params.id, 'Offer')

    const row = await queryOne<{ id: number; player_id: number; status: string }>(
      `SELECT id, player_id, status FROM transfer_requests
        WHERE id = ? AND to_club_id = ?`,
      [requestId, club.id],
    )
    if (!row) throw Object.assign(new Error('That offer does not exist.'), { status: 404 })
    if (row.status !== 'pending') {
      throw Object.assign(new Error('That offer has already been answered.'), { status: 409 })
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE transfer_requests SET status = 'cancelled', responded_at = NOW()
          WHERE id = ? AND status = 'pending'`,
        [requestId],
      )
    })

    const player = await queryOne<{ user_id: number | null }>(
      'SELECT user_id FROM players WHERE id = ?',
      [row.player_id],
    )
    if (player?.user_id) {
      await notify(player.user_id, 'offer_cancelled', `Offer from ${club.name} withdrawn`)
    }

    res.json({ ok: true })
  }),
)

/* ----------------------------------------------------------------- squad */

/**
 * Everyone who can be put on this club's squad, account or not.
 *
 * Deliberately wider than the recruitment search above. An offer asks for a
 * decision, so it needs someone on the other end who can log in and give it.
 * Putting someone on a squad does not — it is the manager registering a player
 * they intend to field, the same thing the admin app has always allowed.
 *
 * `has_account` is returned so the UI can say so, rather than the manager
 * offering a contract to someone who will never see it.
 */
manager.get(
  '/squad/search',
  handler(async (req, res) => {
    const club = await ownClub(req.user!.id)
    const q = String(req.query.q ?? '').trim().slice(0, 80)

    const rows = await queryAll(
      `SELECT p.id, p.gamertag, p.slug, p.avatar_local, p.club_id, p.is_free_agent,
              c.name AS club_name,
              (p.user_id IS NOT NULL) AS has_account
         FROM players p
         LEFT JOIN clubs c ON c.id = p.club_id
        WHERE (p.club_id IS NULL OR p.club_id <> ?)
          AND (? = '' OR p.gamertag LIKE ?)
        ORDER BY p.gamertag
        LIMIT 25`,
      [club.id, q, `%${q}%`],
    )
    res.json({ players: rows })
  }),
)

/**
 * Put a player on this club's squad.
 *
 * Immediate and without the player's agreement, unlike an offer. That is the
 * manager's prerogative: they field who they field. A `transfers` row is
 * written either way so the public transfer page shows the move rather than
 * the player quietly appearing on a different roster.
 *
 * Taking a player who is currently at another club is allowed — it is a
 * release and a signing in one step — but the UI warns first, because from the
 * other club's point of view their player has just vanished.
 */
manager.post(
  '/squad/add',
  handler(async (req, res) => {
    const user = req.user!
    const club = await ownClub(user.id)
    const playerId = id(req.body?.playerId, 'Player')

    const player = await queryOne<{
      id: number
      gamertag: string
      club_id: number | null
      user_id: number | null
    }>('SELECT id, gamertag, club_id, user_id FROM players WHERE id = ?', [playerId])

    if (!player) throw Object.assign(new Error('That player does not exist.'), { status: 404 })
    if (player.club_id === club.id) {
      throw Object.assign(new Error(`${player.gamertag} is already on your squad.`), {
        status: 409,
      })
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        'UPDATE players SET club_id = ?, is_free_agent = FALSE, updated_at = NOW() WHERE id = ?',
        [club.id, player.id],
      )
      await conn.execute(
        `INSERT INTO transfers (player_id, from_club_id, to_club_id, occurred_at, kind, created_at)
         VALUES (?, ?, ?, CURDATE(), 'free', NOW())`,
        [player.id, player.club_id, club.id],
      )
    })

    if (player.user_id) {
      await notify(
        player.user_id,
        'signed',
        `Signed by ${club.name}`,
        `${club.name} have added you to their squad.`,
        '/dashboard',
      )
    }

    res.json({ ok: true })
  }),
)

/** Current squad, for the dashboard. */
manager.get(
  '/squad',
  handler(async (req, res) => {
    const club = await ownClub(req.user!.id)
    const rows = await queryAll(
      `SELECT p.id, p.gamertag, p.slug, p.avatar_local, p.is_free_agent,
              (SELECT COUNT(*) FROM transfer_requests tr
                WHERE tr.player_id = p.id AND tr.to_club_id = ? AND tr.status = 'pending') AS pending
         FROM players p
        WHERE p.club_id = ?
        ORDER BY p.gamertag`,
      [club.id, club.id],
    )
    res.json({ club, squad: rows })
  }),
)