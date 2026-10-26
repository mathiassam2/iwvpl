import type { Request, Response, NextFunction } from 'express'

interface RateLimitOptions {
  windowMs: number
  max: number
  message?: string
}

/**
 * Lightweight, in-memory sliding window rate limiter.
 * Zero external dependencies, bounded memory footprint, prevents brute-force attacks.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = 'Too many requests, please try again later.' } = options
  const hits = new Map<string, { count: number; resetTime: number }>()

  // Cleanup expired entries periodically
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key)
      }
    }
  }, Math.max(windowMs, 60_000)).unref()

  return (req: Request, res: Response, next: NextFunction) => {
    // req.ip respects 'trust proxy' configured in server.ts
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const key = `${req.baseUrl || req.path}:${ip}`
    const now = Date.now()

    let record = hits.get(key)
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs }
      hits.set(key, record)
    } else {
      record.count += 1
    }

    const remaining = Math.max(0, max - record.count)
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000)

    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', remaining)
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000))

    if (record.count > max) {
      res.setHeader('Retry-After', retryAfterSeconds)
      return res.status(429).json({ error: message })
    }

    next()
  }
}
