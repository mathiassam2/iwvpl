/** Shared formatting + lookup helpers. */

export const CLUB_PLACEHOLDER = '/assets/brand/club-placeholder.svg'
export const AVATAR_PLACEHOLDER = '/assets/brand/avatar-placeholder.svg'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Strip a trailing regional-indicator flag emoji pair. */
export function stripFlag(name: string): string {
  return (name || '').replace(/[\u{1F1E6}-\u{1F1FF}]{2}\s*$/u, '').trim()
}

const FLAG_OFFSET = 0x1f1e6
const LETTER_OFFSET = 0x41

/** Map an ISO-3166 alpha-2 code to its flag emoji. */
export function isoToFlag(iso: string): string {
  if (!iso || iso.length !== 2) return ''
  const a = iso.toUpperCase().codePointAt(0)! - LETTER_OFFSET + FLAG_OFFSET
  const b = iso.toUpperCase().codePointAt(1)! - LETTER_OFFSET + FLAG_OFFSET
  return String.fromCodePoint(a, b)
}

/** ISO codes for the countries IWVPL operates in. */
export const COUNTRY_ISO: Record<string, string> = {
  singapore: 'SG',
  malaysia: 'MY',
  indonesia: 'ID',
  thailand: 'TH',
  brunei: 'BN',
}

export function communityFlag(name: string): string {
  return isoToFlag(COUNTRY_ISO[name.toLowerCase()] ?? '')
}

/** "Friday, 02 October 2026" -> "02 Oct 2026" */
export function shortDate(d: string): string {
  if (!d) return ''
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return d
  return t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** "Friday, 02 October 2026" -> "Fri" */
export function weekday(d: string): string {
  if (!d) return ''
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleDateString('en-GB', { weekday: 'short' })
}

export function dayNum(d: string): string {
  if (!d) return ''
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleDateString('en-GB', { day: '2-digit' })
}

export function monthShort(d: string): string {
  if (!d) return ''
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleDateString('en-GB', { month: 'short' })
}

export function formatDate(d: string): string {
  if (!d) return ''
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return d
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Group matches by their `date` field, preserving descending order. */
export function groupByDate<T extends { date: string }>(items: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const list = map.get(item.date)
    if (list) list.push(item)
    else map.set(item.date, [item])
  }
  return [...map.entries()]
}

export function outcomeOf(m: { hs: string; as: string }): 'W' | 'D' | 'L' | '?' {
  const h = Number(m.hs)
  const a = Number(m.as)
  if (Number.isNaN(h) || Number.isNaN(a) || m.hs === '' || m.as === '') return '?'
  if (h > a) return 'W'
  if (h < a) return 'L'
  return 'D'
}

/** Head-to-head record for a club across the result list. */
export function clubRecord(club: string, results: Array<{ home: string; away: string; hs: string; as: string }>) {
  const clean = stripFlag(club).toUpperCase()
  let w = 0
  let d = 0
  let l = 0
  let gf = 0
  let ga = 0
  for (const m of results) {
    const home = stripFlag(m.home).toUpperCase()
    const away = stripFlag(m.away).toUpperCase()
    const hs = Number(m.hs)
    const as = Number(m.as)
    if (Number.isNaN(hs) || Number.isNaN(as)) continue
    if (home === clean) {
      gf += hs
      ga += as
      if (hs > as) w++
      else if (hs < as) l++
      else d++
    } else if (away === clean) {
      gf += as
      ga += hs
      if (as > hs) w++
      else if (as < hs) l++
      else d++
    }
  }
  return { w, d, l, gf, ga, played: w + d + l }
}

export function totalGoals(results: Array<{ hs: string; as: string }>): number {
  return results.reduce((acc, m) => {
    const h = Number(m.hs)
    const a = Number(m.as)
    return acc + (Number.isNaN(h) ? 0 : h) + (Number.isNaN(a) ? 0 : a)
  }, 0)
}

/**
 * Internal, stable route for a club. WordPress team URLs contain accented and
 * punctuated slugs that would need re-encoding; this normalises to a single
 * dash-separated key that matches on both sides of the app.
 */
export function clubSlug(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\p{L}\p{N}-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

export function clubHref(name: string): string {
  return `/clubs/${clubSlug(stripFlag(name))}`
}
