/**
 * Session authentication.
 *
 * This *is* the app's auth — unlike basicAuth.ts, which exists to keep the
 * admin bundle unfetchable and is not an identity system.
 *
 * `requireAuth` resolves the session cookie once and hangs the account on the
 * request, so downstream handlers never re-query it. `requireRole` then gates
 * on that, which means the check cannot disagree with itself: the role tested
 * is the role that was actually read from the database, not a client-supplied
 * header.
 */

import type { Request, RequestHandler } from 'express'
import { config } from '../config.js'
import { MANAGER_ROLES, resolveSession, type AccountUser, type Role } from '../domain/auth.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccountUser
    }
  }
}

function readToken(req: Request): string | undefined {
  return req.cookies?.[config.auth.cookieName]
}

export function requireAuth(): RequestHandler {
  return (req, res, next) => {
    resolveSession(readToken(req))
      .then((user) => {
        if (!user) {
          return res.status(401).json({ error: 'Sign in to continue.' })
        }
        req.user = user
        next()
      })
      .catch(next)
  }
}

/** Attaches the account when a valid session exists, but never rejects.
 *  Used by /api/auth/me so the client can ask "am I signed in?" without
 *  handling a 401 as an error state. */
export function attachUser(): RequestHandler {
  return (req, _res, next) => {
    resolveSession(readToken(req))
      .then((user) => {
        if (user) req.user = user
        next()
      })
      .catch(next)
  }
}

export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Sign in to continue.' })
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Your account cannot do that.' })
    }
    next()
  }
}

/** Owner, admin and club_manager. The club itself is checked in the handler,
 *  because a manager may only touch their own club's squad. */
export const requireManager = requireRole(...MANAGER_ROLES)