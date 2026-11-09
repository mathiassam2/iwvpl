/**
 * Match identity and routing.
 *
 * The crawled results carry no stable id - WordPress slugs are percent-encoded
 * and duplicated across seasons - so a match is addressed by its index in
 * `siteData.results`, which is stable for a given build.
 */

import { siteData } from '@/data'
import { clubSlug, isSameClub, slugify, stripFlag } from '@/lib/format'
import type { Match } from '@/types/site'

export function matchHref(index: number | string | undefined | null): string {
  if (index == null || (typeof index === 'number' && index < 0)) return '/matches'
  return `/matches/${index}`
}

/**
 * Robust link generator for a match.
 * Always prefers `match.id` (database match id), falls back to static index if valid,
 * or '/matches'. Never returns '/matches/-1'.
 */
export function matchHrefFor(match?: Match | null, fallbackIndex?: number): string {
  if (match?.id != null) return `/matches/${match.id}`
  const idx = fallbackIndex !== undefined ? fallbackIndex : (match ? matchIndexOf(match) : -1)
  if (typeof idx === 'number' && idx >= 0) return `/matches/${idx}`
  if (typeof idx === 'string' && idx) return `/matches/${idx}`
  return '/matches'
}

/**
 * Index of a match object in the canonical list, by reference. Callers filter
 * the results array before rendering, which discards the original position, so
 * rows need to recover it before they can link to the match centre.
 */
export function matchIndexOf(match: Match): number {
  return siteData.results.indexOf(match)
}

/** Route param may be an index, or a readable `home-vs-away` slug. */
export function findMatch(param: string | undefined): { match: Match; index: number } | null {
  if (!param) return null

  const asIndex = Number(param)
  if (Number.isInteger(asIndex) && asIndex >= 0 && asIndex < siteData.results.length) {
    return { match: siteData.results[asIndex], index: asIndex }
  }

  // Fall back to slug matching so a hand-typed URL still lands somewhere.
  const target = param.toLowerCase()
  const targetSlug = slugify(param)
  const index = siteData.results.findIndex(
    (m) =>
      `${clubSlug(stripFlag(m.home))}-vs-${clubSlug(stripFlag(m.away))}` === target ||
      `${slugify(m.home)}-vs-${slugify(m.away)}` === targetSlug ||
      isSameClub(m.home, target) ||
      isSameClub(m.away, target),
  )
  return index >= 0 ? { match: siteData.results[index], index } : null
}