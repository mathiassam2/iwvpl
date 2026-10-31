/**
 * Player routes: /api/player/*
 *
 * Membership is not binding. A player can accept an offer or walk away from a
 * club at any moment, and neither path needs a counterparty's permission —
 * that is the product rule, not an oversight.
 *
 * Accepting an offer is the only place in the codebase where a player moves
 * between clubs as a result of someone else's action, and it is deliberately
 * the player's own click that performs the move. The manager's offer only
 * creates a pending row.
 */

import { Router } from 'express'
import { queryAll, queryOne, withTransaction } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { notify } from '../domain/auth.js'
import { clubSlug, gamertagKey } from '../domain/slug.js'
import { execute } from '../db.js'

export const player = Router()

player.use(requireAuth())

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

async function uniquePlayerSlug(tag: string, excludePlayerId?: number): Promise<string> {
  const baseSlug = clubSlug(tag) || 'player'
  let slug = baseSlug
  let counter = 1
  while (true) {
    const clash = await queryOne<{ id: number }>(
      'SELECT id FROM players WHERE slug = ?' + (excludePlayerId ? ' AND id != ?' : ''),
      excludePlayerId ? [slug, excludePlayerId] : [slug],
    )
    if (!clash) break
    counter++
    slug = `${baseSlug}-${counter}`
  }
  return slug
}

/** The player row behind the signed-in account. */
async function ownPlayer(userId: number, candidateGamertag?: string): Promise<{
  id: number
  gamertag: string
  club_id: number | null
  shirt_number: number | null
}> {
  let row = await queryOne<{ id: number; gamertag: string; club_id: number | null; shirt_number: number | null; is_free_agent: number }>(
    'SELECT id, gamertag, club_id, shirt_number, is_free_agent FROM players WHERE user_id = ?',
    [userId],
  )
  if (!row) {
    const user = await queryOne<{ display_name: string | null; username?: string | null; email: string; club_id: number | null }>(
      'SELECT display_name, username, email, club_id FROM users WHERE id = ?',
      [userId],
    )
    const rawCandidate =
      candidateGamertag?.trim() ||
      user?.display_name?.trim() ||
      user?.username?.trim() ||
      user?.email?.split('@')[0] ||
      `User_${userId}`

    let candidateName = rawCandidate
    const key = gamertagKey(candidateName)
    const match = await queryOne<{ id: number }>(
      'SELECT id FROM players WHERE gamertag_key = ? AND user_id IS NULL LIMIT 1',
      [key],
    )
    if (match) {
      const clubId = user?.club_id ?? null
      const isFree = clubId ? 0 : 1
      await execute(
        'UPDATE players SET user_id = ?, club_id = ?, is_free_agent = ?, updated_at = NOW() WHERE id = ?',
        [userId, clubId, isFree, match.id],
      )
      row = await queryOne<{ id: number; gamertag: string; club_id: number | null; shirt_number: number | null; is_free_agent: number }>(
        'SELECT id, gamertag, club_id, shirt_number, is_free_agent FROM players WHERE id = ?',
        [match.id],
      )
    } else {
      let candidateKey = key
      const keyTaken = await queryOne<{ id: number }>('SELECT id FROM players WHERE gamertag_key = ?', [candidateKey])
      if (keyTaken) {
        candidateName = `${rawCandidate}_${userId}`
        candidateKey = gamertagKey(candidateName)
      }
      const slug = await uniquePlayerSlug(candidateName)
      const clubId = user?.club_id ?? null
      const isFree = clubId ? 0 : 1
      await execute(
        `INSERT INTO players (gamertag, gamertag_key, slug, is_free_agent, club_id, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [candidateName, candidateKey, slug, isFree, clubId, userId],
      )
      row = await queryOne<{ id: number; gamertag: string; club_id: number | null; shirt_number: number | null; is_free_agent: number }>(
        'SELECT id, gamertag, club_id, shirt_number, is_free_agent FROM players WHERE user_id = ?',
        [userId],
      )
    }
  }
  if (!row) {
    throw Object.assign(new Error('This account has no player profile.'), { status: 404 })
  }
  if (row.is_free_agent) {
    row.club_id = null
  }
  return row
}

/** The manager account that owns a club, if there is one. New clubs have an
 *  owner by construction, so this is normally present. */
async function notifyClubOwner(clubId: number | null, kind: string, title: string, body: string) {
  if (!clubId) return
  const owner = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE club_id = ? AND is_active = TRUE LIMIT 1',
    [clubId],
  )
  if (owner) await notify(owner.id, kind, title, body, '/dashboard')
}

/* -------------------------------------------------------------- overview */

player.get(
  '/me',
    handler(async (req, res) => {
    const me = await ownPlayer(req.user!.id)
    const club = me.club_id
      ? await queryOne<{ id: number; name: string; slug: string }>(
          'SELECT id, name, slug FROM clubs WHERE id = ?',
          [me.club_id],
        )
      : null

    const pending = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transfer_requests
        WHERE player_id = ? AND status = 'pending' AND (initiated_by = 'club' OR initiated_by IS NULL)`,
      [me.id],
    )

    res.json({ player: me, club, pending: Number(pending?.n ?? 0) })
  }),
)

/* ------------------------------------------- check gamertag availability */

player.get(
  '/check-gamertag',
  handler(async (req, res) => {
    const rawTag = String(req.query.gamertag ?? '').trim().replace(/\s+/g, ' ')
    if (!rawTag) return res.json({ available: false, reason: 'Gamertag cannot be empty' })
    if (rawTag.length < 2) return res.json({ available: false, reason: 'At least 2 characters required' })
    if (rawTag.length > 50) return res.json({ available: false, reason: 'Maximum 50 characters allowed' })
    if (!/^[a-zA-Z0-9_.-\s]+$/.test(rawTag)) {
      return res.json({ available: false, reason: 'Only letters, numbers, spaces, underscores, dots, and hyphens' })
    }

    const myPlayer = await queryOne<{ id: number; gamertag: string }>(
      'SELECT id, gamertag FROM players WHERE user_id = ?',
      [req.user!.id],
    )
    if (myPlayer && rawTag.toLowerCase() === myPlayer.gamertag.toLowerCase()) {
      return res.json({ available: true, isCurrent: true })
    }

    const key = gamertagKey(rawTag)
    const takenPlayer = await queryOne<{ id: number; user_id: number | null }>(
      'SELECT id, user_id FROM players WHERE gamertag_key = ?' + (myPlayer ? ' AND id != ?' : ''),
      myPlayer ? [key, myPlayer.id] : [key],
    )
    if (takenPlayer && takenPlayer.user_id && takenPlayer.user_id !== req.user!.id) {
      return res.json({ available: false, reason: 'That gamertag is already taken' })
    }

    const takenUser = await queryOne<{ id: number }>(
      'SELECT id FROM users WHERE (LOWER(username) = LOWER(?) OR LOWER(display_name) = LOWER(?)) AND id != ?',
      [rawTag, rawTag, req.user!.id],
    )
    if (takenUser) {
      return res.json({ available: false, reason: 'That name is already in use' })
    }

    res.json({ available: true })
  }),
)

/* ------------------------------------------------ update profile / gamertag */

player.patch(
  '/me',
  handler(async (req, res) => {
    // 1. Shirt number validation
    const rawShirt = req.body?.shirtNumber
    let shirtNumber: number | null | undefined = undefined
    if (rawShirt !== undefined) {
      if (rawShirt === null || String(rawShirt).trim() === '') {
        shirtNumber = null
      } else {
        const n = Number.parseInt(String(rawShirt), 10)
        if (!Number.isInteger(n) || n < 1 || n > 99) {
          bad('Jersey number must be a whole number between 1 and 99.')
        }
        shirtNumber = n
      }
    }

    // 2. Gamertag validation and uniqueness check
    const rawGamertag = req.body?.gamertag
    let newGamertag: string | null = null
    if (rawGamertag !== undefined && rawGamertag !== null) {
      const tag = String(rawGamertag).trim().replace(/\s+/g, ' ')
      if (!tag) bad('Gamertag cannot be empty.')
      if (tag.length < 2) bad('Gamertag must be at least 2 characters.')
      if (tag.length > 50) bad('Gamertag cannot exceed 50 characters.')
      if (!/^[a-zA-Z0-9_.-\s]+$/.test(tag)) {
        bad('Gamertag can only contain letters, numbers, spaces, underscores, dots, and hyphens.')
      }
      newGamertag = tag
    }

    const me = await ownPlayer(req.user!.id, newGamertag || undefined)
    const oldGamertag = me.gamertag

    let shouldUpdateGamertag = false
    if (newGamertag && newGamertag !== oldGamertag) {
      if (newGamertag.toLowerCase() !== oldGamertag.toLowerCase()) {
        const key = gamertagKey(newGamertag)
        const clashPlayer = await queryOne<{ id: number; user_id: number | null }>(
          'SELECT id, user_id FROM players WHERE gamertag_key = ? AND id != ?',
          [key, me.id],
        )
        if (clashPlayer && clashPlayer.user_id && clashPlayer.user_id !== req.user!.id) {
          bad(`The gamertag "${newGamertag}" is already taken. Please choose another.`)
        }

        const clashUser = await queryOne<{ id: number }>(
          'SELECT id FROM users WHERE (LOWER(username) = LOWER(?) OR LOWER(display_name) = LOWER(?)) AND id != ?',
          [newGamertag, newGamertag, req.user!.id],
        )
        if (clashUser) {
          bad(`The gamertag "${newGamertag}" is already taken. Please choose another.`)
        }
      }
      shouldUpdateGamertag = true
    }

    await withTransaction(async (conn) => {
      // Update shirt number if provided
      if (shirtNumber !== undefined) {
        await conn.execute('UPDATE players SET shirt_number = ?, updated_at = NOW() WHERE id = ?', [
          shirtNumber,
          me.id,
        ])
      }

      // Update gamertag if changed
      if (shouldUpdateGamertag && newGamertag) {
        const key = gamertagKey(newGamertag)
        const slug = await uniquePlayerSlug(newGamertag, me.id)
        await conn.execute(
          'UPDATE players SET gamertag = ?, gamertag_key = ?, slug = ?, updated_at = NOW() WHERE id = ?',
          [newGamertag, key, slug, me.id],
        )
        await conn.execute(
          'UPDATE users SET display_name = ?, updated_at = NOW() WHERE id = ?',
          [newGamertag, req.user!.id],
        )
      }

      // Synchronize clubs.starting_xi_json if player is attached to a club
      if (me.club_id && (shirtNumber !== undefined || newGamertag)) {
        const [clubRows] = await conn.query(
          'SELECT id, starting_xi_json FROM clubs WHERE id = ? FOR UPDATE',
          [me.club_id],
        )
        const club = (clubRows as any[])[0]
        if (club?.starting_xi_json) {
          try {
            const parsed = JSON.parse(club.starting_xi_json)
            let modified = false

            if (Array.isArray(parsed.starters)) {
              for (const s of parsed.starters) {
                if (
                  s &&
                  ((s.playerId && Number(s.playerId) === Number(me.id)) ||
                    (s.gamertag && s.gamertag.toLowerCase() === oldGamertag.toLowerCase()))
                ) {
                  if (shirtNumber !== undefined) {
                    s.shirtNumber = shirtNumber ?? undefined
                    s.number = shirtNumber ?? undefined
                  }
                  if (newGamertag) {
                    s.gamertag = newGamertag
                  }
                  modified = true
                }
              }
            }

            if (Array.isArray(parsed.bench)) {
              for (const b of parsed.bench) {
                if (
                  b &&
                  ((b.playerId && Number(b.playerId) === Number(me.id)) ||
                    (b.gamertag && b.gamertag.toLowerCase() === oldGamertag.toLowerCase()))
                ) {
                  if (shirtNumber !== undefined) {
                    b.shirtNumber = shirtNumber ?? undefined
                    b.number = shirtNumber ?? undefined
                  }
                  if (newGamertag) {
                    b.gamertag = newGamertag
                  }
                  modified = true
                }
              }
            }

            if (
              newGamertag &&
              parsed.captainGamertag &&
              parsed.captainGamertag.toLowerCase() === oldGamertag.toLowerCase()
            ) {
              parsed.captainGamertag = newGamertag
              modified = true
            }

            if (modified) {
              await conn.execute(
                'UPDATE clubs SET starting_xi_json = ?, updated_at = NOW() WHERE id = ?',
                [JSON.stringify(parsed), club.id],
              )
            }
          } catch {
            /* ignore malformed json */
          }
        }
      }
    })

    const updated = await ownPlayer(req.user!.id)
    res.json({ ok: true, player: updated, user: { ...req.user, name: updated.gamertag, gamertag: updated.gamertag } })
  }),
)

/* ---------------------------------------------------------------- inbox */

/** Incoming offers awaiting a decision. */
player.get(
  '/offers',
    handler(async (req, res) => {
    const me = await ownPlayer(req.user!.id)
    const rows = await queryAll(
      `SELECT tr.id, tr.kind, tr.message, tr.status, tr.created_at,
              c.id AS club_id, c.name AS club_name, c.slug AS club_slug, c.logo_local
         FROM transfer_requests tr
         JOIN clubs c ON c.id = tr.to_club_id
        WHERE tr.player_id = ? AND tr.status = 'pending'
          AND (tr.initiated_by = 'club' OR tr.initiated_by IS NULL)
        ORDER BY tr.created_at DESC`,
      [me.id],
    )
    res.json({ offers: rows })
  }),
)

/* ------------------------------------------------------- join requests */

/** Player-initiated club join requests. */
player.get(
  '/join-requests',
  handler(async (req, res) => {
    const me = await ownPlayer(req.user!.id)
    const rows = await queryAll(
      `SELECT tr.id, tr.status, tr.message, tr.created_at, tr.responded_at,
              c.id AS club_id, c.name AS club_name, c.slug AS club_slug, c.logo_local, c.logo_url
         FROM transfer_requests tr
         JOIN clubs c ON c.id = tr.to_club_id
        WHERE tr.player_id = ? AND tr.initiated_by = 'player'
        ORDER BY (tr.status = 'pending') DESC, tr.created_at DESC`,
      [me.id],
    )
    res.json({ requests: rows })
  }),
)

/** Submit a request to join a club. */
player.post(
  '/join-requests',
  handler(async (req, res) => {
    const me = await ownPlayer(req.user!.id)
    const clubId = Number(req.body?.clubId)
    if (!Number.isSafeInteger(clubId) || clubId < 1) {
      throw Object.assign(new Error('Invalid club ID.'), { status: 400 })
    }
    const message = req.body?.message ? String(req.body.message).trim().slice(0, 255) : null

    const targetClub = await queryOne<{ id: number; name: string }>(
      'SELECT id, name FROM clubs WHERE id = ?',
      [clubId],
    )
    if (!targetClub) {
      throw Object.assign(new Error('That club does not exist.'), { status: 404 })
    }

    if (me.club_id === clubId) {
      throw Object.assign(new Error('You are already a member of this club.'), { status: 400 })
    }

    // Check if player already has an open pending join request to this club
    const existing = await queryOne<{ id: number }>(
      `SELECT id FROM transfer_requests
        WHERE player_id = ? AND to_club_id = ? AND status = 'pending' AND initiated_by = 'player'
        LIMIT 1`,
      [me.id, clubId],
    )
    if (existing) {
      throw Object.assign(new Error('You already have a pending join request to this club.'), {
        status: 409,
      })
    }

    // Check if club already offered the player a contract
    const openOffer = await queryOne<{ id: number }>(
      `SELECT id FROM transfer_requests
        WHERE player_id = ? AND to_club_id = ? AND status = 'pending' AND (initiated_by = 'club' OR initiated_by IS NULL)
        LIMIT 1`,
      [me.id, clubId],
    )
    if (openOffer) {
      throw Object.assign(
        new Error(
          `${targetClub.name} has already sent you a contract offer! Review and accept it in your dashboard.`,
        ),
        { status: 409 },
      )
    }

    let requestId: number
    await withTransaction(async (conn) => {
      const [res] = await conn.execute(
        `INSERT INTO transfer_requests (player_id, from_club_id, to_club_id, initiated_by, kind, status, message, created_at)
         VALUES (?, ?, ?, 'player', 'free', 'pending', ?, NOW())`,
        [me.id, me.club_id, clubId, message],
      )
      requestId = (res as any).insertId
    })

    // Notify the club manager if there is one
    const manager = await queryOne<{ id: number }>(
      'SELECT id FROM users WHERE club_id = ? AND is_active = 1 LIMIT 1',
      [clubId],
    )
    if (manager) {
      notify(
        manager.id,
        'join_request',
        `Join request: ${me.gamertag}`,
        message || `${me.gamertag} has requested to join ${targetClub.name}.`,
        '/dashboard',
      ).catch(() => undefined)
    }

    res.status(201).json({ ok: true, id: requestId! })
  }),
)

/** Cancel an outstanding join request. */
player.delete(
  '/join-requests/:id',
  handler(async (req, res) => {
    const me = await ownPlayer(req.user!.id)
    const requestId = Number(req.params.id)
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
      throw Object.assign(new Error('Invalid request ID.'), { status: 400 })
    }

    const row = await queryOne<{ id: number; to_club_id: number; status: string }>(
      `SELECT id, to_club_id, status FROM transfer_requests
        WHERE id = ? AND player_id = ? AND initiated_by = 'player'`,
      [requestId, me.id],
    )
    if (!row) throw Object.assign(new Error('Join request not found.'), { status: 404 })
    if (row.status !== 'pending') {
      throw Object.assign(new Error('This request has already been answered.'), { status: 409 })
    }

    await execute(
      `UPDATE transfer_requests SET status = 'cancelled', responded_at = NOW()
        WHERE id = ? AND status = 'pending'`,
      [requestId],
    )

    res.json({ ok: true })
  }),
)

/* --------------------------------------------------------------- decide */

/**
 * Accept or reject.
 *
 * The status is checked in the UPDATE's WHERE clause as well as in the
 * preceding SELECT, so two taps racing on a slow connection cannot both accept.
 * The affected-row count is the authority; the SELECT is only for the error
 * message. A player leaving their club at the same moment is a conflicting
 * update, and one of the two writers loses rather than interleaving.
 */
player.post(
  '/offers/:id/:decision',
    handler(async (req, res) => {
    const decision = String(req.params.decision)
    if (decision !== 'accept' && decision !== 'reject') {
      bad('Decision must be accept or reject.')
    }

    const me = await ownPlayer(req.user!.id)
    const requestId = id(req.params.id, 'Offer')

    // from_club_id is deliberately not read. It records who the player played for
    // when the offer was made, and they are free to walk away in between, so
    // the transfer log takes the club from the player row instead.
    const row = await queryOne<{
      id: number
      status: string
      to_club_id: number
      kind: string | null
    }>(
      `SELECT id, status, to_club_id, kind
         FROM transfer_requests
        WHERE id = ? AND player_id = ?`,
      [requestId, me.id],
    )
    if (!row) throw Object.assign(new Error('That offer does not exist.'), { status: 404 })
    if (row.status !== 'pending') {
      throw Object.assign(new Error('That offer has already been answered.'), { status: 409 })
    }

    const accepting = decision === 'accept'

    // The player may have been assigned to this club by an admin while the
    // offer was still open. Accepting is harmless, but it must not write a
    // transfer from the club to itself.
    if (accepting && me.club_id === row.to_club_id) {
      await execute(
        `UPDATE transfer_requests
            SET status = 'accepted', responded_at = NOW()
          WHERE id = ? AND player_id = ? AND status = 'pending'`,
        [requestId, me.id],
      )
      return res.json({ ok: true, status: 'accepted', alreadyMember: true })
    }

    if (accepting) {
      await withTransaction(async (conn) => {
        const [claimed] = await conn.execute(
          `UPDATE transfer_requests SET status = 'accepted', responded_at = NOW()
            WHERE id = ? AND player_id = ? AND status = 'pending'`,
          [requestId, me.id],
        )
        if ((claimed as any).affectedRows !== 1) {
          throw Object.assign(new Error('That offer has already been answered.'), { status: 409 })
        }

        // is_free_agent follows club membership rather than being set
        // independently, so the two can never disagree.
        await conn.execute(
          'UPDATE players SET club_id = ?, is_free_agent = FALSE, updated_at = NOW() WHERE id = ?',
          [row.to_club_id, me.id],
        )

        // transfers is the completed-moves log. The request row is the
        // conversation; this row is the fact, and it is written only now that
        // the signing has actually happened.
        //
        // from_club_id is read from the player row, not from the request. The
        // request recorded who they played for when the offer was made, and
        // they are free to walk away in between — recording the stale club
        // would put a transfer in the log from a club they had already left.
        await conn.execute(
          `INSERT INTO transfers (player_id, from_club_id, to_club_id, occurred_at, kind, created_at)
           VALUES (?, ?, ?, CURDATE(), ?, NOW())`,
          [me.id, me.club_id, row.to_club_id, row.kind],
        )
      })

      const club = await queryOne<{ name: string }>('SELECT name FROM clubs WHERE id = ?', [
        row.to_club_id,
      ])
      await notifyClubOwner(
        row.to_club_id,
        'offer_accepted',
        `${me.gamertag} signed`,
        `${me.gamertag} accepted your offer and is now on your squad.`,
      )
      if (me.club_id && me.club_id !== row.to_club_id) {
        await notifyClubOwner(
          me.club_id,
          'released',
          `${me.gamertag} left`,
          `${me.gamertag} accepted an offer from ${club?.name ?? 'another club'}.`,
        )
      }

      return res.json({ ok: true, status: 'accepted' })
    }

    // Rejecting leaves membership untouched.
    await withTransaction(async (conn) => {
      const [claimed] = await conn.execute(
        `UPDATE transfer_requests SET status = 'rejected', responded_at = NOW()
          WHERE id = ? AND player_id = ? AND status = 'pending'`,
        [requestId, me.id],
      )
      if ((claimed as any).affectedRows !== 1) {
        throw Object.assign(new Error('That offer has already been answered.'), { status: 409 })
      }
    })

    await notifyClubOwner(
      row.to_club_id,
      'offer_rejected',
      `${me.gamertag} declined`,
      `${me.gamertag} turned down your offer and is still a free agent.`,
    )

    res.json({ ok: true, status: 'rejected' })
  }),
)

/* ----------------------------------------------------------------- leave */

/**
 * Leave the current club.
 *
 * No approval, no notice period and no counterparty consent — the player is
 * the one deciding, and the only thing that changes is which club row points at
 * them. A transfer row is written so the public transfer page shows the
 * departure rather than the player silently vanishing from a squad.
 *
 * Pending offers from other clubs survive: a free agent is exactly who those
 * offers were aimed at.
 */
player.post(
  '/leave',
    handler(async (req, res) => {
    const me = await ownPlayer(req.user!.id)
    if (!me.club_id) {
      throw Object.assign(new Error('You are not currently in a club.'), { status: 409 })
    }

    const previous = me.club_id

    await withTransaction(async (conn) => {
      await conn.execute(
        'UPDATE players SET club_id = NULL, is_free_agent = TRUE, updated_at = NOW() WHERE id = ?',
        [me.id],
      )
      await conn.execute(
        `INSERT INTO transfers (player_id, from_club_id, to_club_id, occurred_at, kind, created_at)
         VALUES (?, ?, NULL, CURDATE(), 'free', NOW())`,
        [me.id, previous],
      )
    })

    await notifyClubOwner(
      previous,
      'released',
      `${me.gamertag} left the club`,
      `${me.gamertag} left and is a free agent again.`,
    )

    res.json({ ok: true })
  }),
)