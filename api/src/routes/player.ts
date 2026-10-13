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
import { requireAuth, requireRole } from '../middleware/auth.js'
import { notify } from '../domain/auth.js'

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

/** The player row behind the signed-in account. */
async function ownPlayer(userId: number): Promise<{
  id: number
  gamertag: string
  club_id: number | null
}> {
  const row = await queryOne<{ id: number; gamertag: string; club_id: number | null }>(
    'SELECT id, gamertag, club_id FROM players WHERE user_id = ?',
    [userId],
  )
  if (!row) {
    throw Object.assign(new Error('This account has no player profile.'), { status: 404 })
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
  requireRole('player'),
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
        WHERE player_id = ? AND status = 'pending'`,
      [me.id],
    )

    res.json({ player: me, club, pending: Number(pending?.n ?? 0) })
  }),
)

/* ---------------------------------------------------------------- inbox */

/** Incoming offers awaiting a decision. */
player.get(
  '/offers',
  requireRole('player'),
  handler(async (req, res) => {
    const me = await ownPlayer(req.user!.id)
    const rows = await queryAll(
      `SELECT tr.id, tr.kind, tr.message, tr.status, tr.created_at,
              c.id AS club_id, c.name AS club_name, c.slug AS club_slug, c.logo_local
         FROM transfer_requests tr
         JOIN clubs c ON c.id = tr.to_club_id
        WHERE tr.player_id = ? AND tr.status = 'pending'
        ORDER BY tr.created_at DESC`,
      [me.id],
    )
    res.json({ offers: rows })
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
  requireRole('player'),
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
  requireRole('player'),
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