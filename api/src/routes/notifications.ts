/**
 * Notifications: /api/notifications/*
 *
 * In-app only. Read and unread are the same table with a boolean, because the
 * only two states anything here needs are "has the badge moved" and "what does
 * the dropdown list".
 */

import { Router } from 'express'
import { execute, queryAll } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

export const notifications = Router()

notifications.use(requireAuth())

function handler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next)
}

/** Newest first. The cap is generous for a dropdown that does not paginate. */
notifications.get(
  '/',
  handler(async (req, res) => {
    const rows = await queryAll(
      `SELECT id, kind, title, body, link, is_read, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 50`,
      [req.user!.id],
    )
    const unread = rows.filter((r: any) => !r.is_read).length
    res.json({ notifications: rows, unread })
  }),
)

/**
 * Mark everything read.
 *
 * Deliberately not per-id: the badge is cleared by opening the panel, and
 * making the client track which rows it has shown means a row can stay unread
 * forever while the badge reads zero.
 */
notifications.post(
  '/read',
  handler(async (req, res) => {
    await execute('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', [
      req.user!.id,
    ])
    res.json({ ok: true })
  }),
)