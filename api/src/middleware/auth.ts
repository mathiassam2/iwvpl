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
 *
 * All three exports are FACTORIES: they take no request and return a
 * RequestHandler. Every use site must therefore call them —
 *
 *   router.use(requireAuth())      // correct
 *   router.use(requireAuth)        // hangs forever, silently
 *
 * The broken form registers a function that Express invokes once, which
 * returns the real handler and discards it: nothing responds and nothing calls
 * next(), so the request hangs with no error logged anywhere. They are
 * factories rather than plain middleware so that per-request arguments (the
 * role list) stay expressible, while every call site is forced to spell the
 * parentheses out.
 */

import type { Request, RequestHandler } from 'express'
import { config } from '../config.js'
import { getAllTokens, MANAGER_ROLES, resolveSession, type AccountUser, type Role } from '../domain/auth.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccountUser
    }
  }
}

export function readTokens(req: Request): string[] {
  const direct = req.cookies?.[config.auth.cookieName]
  const all = getAllTokens(req)
  if (direct && !all.includes(direct)) all.unshift(direct)
  return all
}

export function requireAuth(): RequestHandler {
  return (req, res, next) => {
    resolveSession(readTokens(req))
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
    resolveSession(readTokens(req))
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
export const requireManager = (): RequestHandler => requireRole(...MANAGER_ROLES)