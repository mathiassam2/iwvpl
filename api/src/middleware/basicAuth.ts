/**
 * HTTP basic auth.
 *
 * The gate in front of the admin bundle. Chosen over a login form because its
 * job here is not identity — it is making the admin JavaScript *unfetchable*.
 * Anything served under /admin is public knowledge the moment the bytes leave
 * the server, so the bundle should never leave at all.
 *
 * This is deliberately not the app's auth. Real per-user permissions live in
 * the `users` table and the `sessions` table (see 001_init.sql); this sits
 * outside that, in front of everything.
 *
 * Comparison is constant-time. `===` on strings leaks length and content
 * through timing, which is exactly the class of bug that makes credential
 * guessing practical.
 */

import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { config } from '../config.js'

/** Length-safe constant-time compare over raw bytes. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // timingSafeEqual throws on a length mismatch, so pad to the longer length
  // first; the comparison then still runs in constant time.
  const length = Math.max(bufA.length, bufB.length)
  const padA = Buffer.alloc(length)
  const padB = Buffer.alloc(length)
  bufA.copy(padA)
  bufB.copy(padB)
  return timingSafeEqual(padA, padB)
}

export function requireBasicAuth(): RequestHandler {
  return (req, res, next) => {
    if (!config.admin.enabled) return next()

    const header = req.headers.authorization ?? ''
    const [scheme, encoded] = header.split(' ')

    if (scheme?.toLowerCase() === 'basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8')
      const separator = decoded.indexOf(':')
      if (separator >= 0) {
        const user = decoded.slice(0, separator)
        const pass = decoded.slice(separator + 1)

        // Both comparisons always run. Short-circuiting on a failed username
        // would reintroduce the timing signal this is avoiding.
        const userOk = safeEqual(user, config.admin.username)
        const passOk = safeEqual(pass, config.admin.password)
        if (userOk && passOk) return next()
      }
    }

    // `realm` is what the browser shows in its prompt.
    res.setHeader('WWW-Authenticate', 'Basic realm="IWVPL Admin", charset="UTF-8"')
    res.status(401).send('Authentication required.')
  }
}