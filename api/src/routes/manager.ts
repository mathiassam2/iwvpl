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
async function ownClub(userId: number): Promise<{
  id: number
  name: string
  slug: string
  short_code: string | null
  flag: string | null
  logo_local: string | null
  logo_url: string | null
  status: string
  starting_xi: any | null
}> {
  const club = await queryOne<{
    id: number
    name: string
    slug: string
    short_code: string | null
    flag: string | null
    logo_local: string | null
    logo_url: string | null
    status: string
    starting_xi_json: string | null
  }>(
    'SELECT id, name, slug, short_code, flag, logo_local, logo_url, status, starting_xi_json FROM clubs WHERE id = (SELECT club_id FROM users WHERE id = ?)',
    [userId],
  )
  if (!club) {
    throw Object.assign(new Error('Create your club before managing a squad.'), { status: 409 })
  }
  let starting_xi = null
  if (club.starting_xi_json) {
    try {
      starting_xi = JSON.parse(club.starting_xi_json)
    } catch {
      starting_xi = null
    }
  }
  const { starting_xi_json: _ignored, ...rest } = club
  return { ...rest, starting_xi }
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

    const shortCode = req.body?.shortCode
      ? String(req.body.shortCode).trim().toUpperCase().slice(0, 8) || null
      : null
    const region = req.body?.region ?? req.body?.flag
      ? String(req.body?.region ?? req.body?.flag).trim().slice(0, 16) || null
      : null
    const rawLogo = req.body?.logo ?? req.body?.clubLogo
    const logo = rawLogo ? String(rawLogo).trim() || null : null
    if (logo && logo.length > 6_000_000) {
      bad('Club logo image is too large.')
    }

    const clubId = await withTransaction(async (conn) => {
      const [clubRes] = await conn.execute(
        `INSERT INTO clubs (name, slug, short_code, flag, logo_local, logo_url, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [name, slug, shortCode, region, logo, logo],
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

/**
 * Update the manager's own club details (logo, short code, region).
 */
manager.patch(
  '/club',
  handler(async (req, res) => {
    const club = await ownClub(req.user!.id)
    const fields: string[] = []
    const values: any[] = []

    if ('logo' in (req.body ?? {}) || 'clubLogo' in (req.body ?? {})) {
      const raw = req.body.logo !== undefined ? req.body.logo : req.body.clubLogo
      const logo = raw === null || raw === '' ? null : String(raw).trim()
      if (logo && logo.length > 6_000_000) {
        bad('Club logo image is too large.')
      }
      fields.push('logo_local = ?', 'logo_url = ?')
      values.push(logo, logo)
    }

    if ('shortCode' in (req.body ?? {})) {
      const sc = req.body.shortCode
        ? String(req.body.shortCode).trim().toUpperCase().slice(0, 8) || null
        : null
      fields.push('short_code = ?')
      values.push(sc)
    }

    if ('region' in (req.body ?? {}) || 'flag' in (req.body ?? {})) {
      const raw = req.body.region !== undefined ? req.body.region : req.body.flag
      const fl = raw ? String(raw).trim().slice(0, 16) || null : null
      fields.push('flag = ?')
      values.push(fl)
    }

    if (fields.length === 0) {
      bad('No editable club fields provided.')
    }

    values.push(club.id)
    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE clubs SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
        values,
      )
    })

    const updated = await ownClub(req.user!.id)
    res.json({ ok: true, club: updated })
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
 * Current squad, for the dashboard.
 *
 * Read-only. The only way a player gets onto it is by accepting an offer —
 * there is no direct-add path, so a manager cannot sign someone who cannot
 * see it happening.
 */
manager.get(
  '/squad',
  handler(async (req, res) => {
    const club = await ownClub(req.user!.id)
    const rows = await queryAll(
      `SELECT p.id, p.gamertag, p.slug, p.shirt_number, p.avatar_local, p.is_free_agent,
              (SELECT COUNT(*) FROM transfer_requests tr
                WHERE tr.player_id = p.id AND tr.to_club_id = ? AND tr.status = 'pending') AS pending
         FROM players p
        WHERE p.club_id = ?
        ORDER BY COALESCE(p.shirt_number, 999), p.gamertag`,
      [club.id, club.id],
    )
    res.json({ club, squad: rows })
  }),
)

/**
 * Save the manager's Starting XI & Bench lineup, and sync any updated player shirt numbers.
 */
manager.put(
  '/lineup',
  handler(async (req, res) => {
    const club = await ownClub(req.user!.id)
    const lineup = req.body?.lineup ?? req.body
    if (!lineup || typeof lineup !== 'object') {
      bad('Lineup payload is required.')
    }
    const formation = String(lineup.formation ?? '4-3-3').trim()
    const starters = Array.isArray(lineup.starters) ? lineup.starters : []
    const bench = Array.isArray(lineup.bench) ? lineup.bench : []

    const normalized = {
      formation,
      starters: starters.map((s: any, idx: number) => {
        if (!s || !String(s?.gamertag ?? '').trim()) return null
        const pos = String(s?.position ?? s?.role ?? '').slice(0, 12)
        const num = Math.min(
          99,
          Math.max(
            1,
            Number.parseInt(String(s?.shirtNumber ?? s?.number ?? idx + 1), 10) || idx + 1,
          ),
        )
        return {
          slotIndex: Number.isInteger(s?.slotIndex) ? s.slotIndex : idx,
          position: pos,
          role: pos,
          playerId: s?.playerId ? Number(s.playerId) : null,
          gamertag: String(s?.gamertag ?? '').trim().slice(0, 120),
          shirtNumber: num,
          number: num,
        }
      }),
      bench: bench
        .filter((b: any) => Boolean(String(b?.gamertag ?? '').trim()))
        .map((b: any, idx: number) => {
          const pos = String(b?.position ?? b?.role ?? 'SUB').slice(0, 12)
          const num = Math.min(
            99,
            Math.max(
              1,
              Number.parseInt(String(b?.shirtNumber ?? b?.number ?? idx + 12), 10) || idx + 12,
            ),
          )
          return {
            playerId: b?.playerId ? Number(b.playerId) : null,
            gamertag: String(b?.gamertag ?? '').trim().slice(0, 120),
            shirtNumber: num,
            number: num,
            position: pos,
            role: pos,
          }
        }),
      updatedAt: new Date().toISOString(),
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        'UPDATE clubs SET starting_xi_json = ?, updated_at = NOW() WHERE id = ?',
        [JSON.stringify(normalized), club.id],
      )

      // Sync customized jersey numbers back to the club's players
      for (const item of [...normalized.starters, ...normalized.bench]) {
        if (!item) continue
        if (item.playerId && item.number >= 1 && item.number <= 99) {
          await conn.execute(
            'UPDATE players SET shirt_number = ?, updated_at = NOW() WHERE id = ? AND club_id = ?',
            [item.number, item.playerId, club.id],
          )
        } else if (item.gamertag && item.number >= 1 && item.number <= 99) {
          await conn.execute(
            'UPDATE players SET shirt_number = ?, updated_at = NOW() WHERE LOWER(gamertag) = LOWER(?) AND club_id = ?',
            [item.number, item.gamertag, club.id],
          )
        }
      }
    })

    const updatedClub = await ownClub(req.user!.id)
    res.json({ ok: true, club: updatedClub, starting_xi: normalized })
  }),
)

/**
 * Update a squad player's jersey number (1-99).
 */
manager.patch(
  '/players/:playerId',
  handler(async (req, res) => {
    const club = await ownClub(req.user!.id)
    const playerId = id(req.params.playerId, 'Player')
    const rawShirt = req.body?.shirtNumber
    let shirtNumber: number | null = null
    if (rawShirt !== null && rawShirt !== undefined && String(rawShirt).trim() !== '') {
      const n = Number.parseInt(String(rawShirt), 10)
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        bad('Jersey number must be between 1 and 99.')
      }
      shirtNumber = n
    }

    await withTransaction(async (conn) => {
      await conn.execute(
        'UPDATE players SET shirt_number = ?, updated_at = NOW() WHERE id = ? AND club_id = ?',
        [shirtNumber, playerId, club.id],
      )

      // Also sync starting_xi_json for this club
      const [clubRows] = await conn.query(
        'SELECT id, starting_xi_json FROM clubs WHERE id = ? FOR UPDATE',
        [club.id],
      )
      const currentClub = (clubRows as any[])[0]
      if (currentClub?.starting_xi_json) {
        try {
          const parsed = JSON.parse(currentClub.starting_xi_json)
          let modified = false
          if (Array.isArray(parsed.starters)) {
            for (const s of parsed.starters) {
              if (s && Number(s.playerId) === Number(playerId)) {
                s.shirtNumber = shirtNumber ?? undefined
                s.number = shirtNumber ?? undefined
                modified = true
              }
            }
          }
          if (Array.isArray(parsed.bench)) {
            for (const b of parsed.bench) {
              if (b && Number(b.playerId) === Number(playerId)) {
                b.shirtNumber = shirtNumber ?? undefined
                b.number = shirtNumber ?? undefined
                modified = true
              }
            }
          }
          if (modified) {
            await conn.execute(
              'UPDATE clubs SET starting_xi_json = ?, updated_at = NOW() WHERE id = ?',
              [JSON.stringify(parsed), club.id],
            )
          }
        } catch {
          /* ignore */
        }
      }
    })
    res.json({ ok: true, playerId, shirtNumber })
  }),
)