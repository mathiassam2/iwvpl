/**
 * Match identity and routing.
 *
 * The crawled results carry no stable id - WordPress slugs are percent-encoded
 * and duplicated across seasons - so a match is addressed by its index in
 * `siteData.results`, which is stable for a given build.
 */

import { siteData } from '@/data'
import { clubSlug, stripFlag } from '@/lib/format'
import type { Match } from '@/types/site'

export function matchHref(index: number): string {
  return `/matches/${index}`
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
  const index = siteData.results.findIndex(
    (m) =>
      `${clubSlug(stripFlag(m.home))}-vs-${clubSlug(stripFlag(m.away))}` === target ||
      clubSlug(stripFlag(m.home)) === target ||
      clubSlug(stripFlag(m.away)) === target,
  )
  return index >= 0 ? { match: siteData.results[index], index } : null
}