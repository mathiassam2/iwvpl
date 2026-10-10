/**
 * Player identity, stats and career history.
 *
 * The crawl has no squad endpoint, so players exist in two unrelated places:
 * the leaderboards (28 names with a club and a value) and the transfer log (183
 * names with dated club moves). Only two players appear in both. This module
 * joins them into one addressable player so a profile URL works for either
 * source - otherwise a transfer-only player would 404 on the same route.
 */

import { siteData } from '@/data'
import { AVATAR_PLACEHOLDER, clubSlug, isoToFlag, stripFlag } from '@/lib/format'
import type { LeaderboardRow } from '@/types/site'

export interface PlayerStat {
  board: string
  value: number
  rank: number
  unit: 'goals' | 'assists' | 'saves'
}

export interface PlayerMove {
  date: string
  direction: 'in' | 'out'
  club: string
  clubLogo: string
  free: boolean
}

export interface PlayerProfile {
  name: string
  avatar: string
  /** Club as recorded on the leaderboards. Null for a player with no moves.
   *  `free` marks a free agent, which is a state rather than a club. */
  club: { name: string; logo: string; flag: string; free: boolean } | null
  stats: PlayerStat[]
  moves: PlayerMove[]
  /** Best rank across every board the player appears on. */
  bestRank: number | null
}

/** Matches leaderboard names, which carry EA gamertags, exactly. */
function samePlayer(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function unitFor(board: string): PlayerStat['unit'] {
  if (board.includes('ASSIST')) return 'assists'
  if (board.includes('SAVE')) return 'saves'
  return 'goals'
}

/** Current club from the most recent move, used when no board lists the player. */
function clubFromMoves(moves: PlayerMove[]): PlayerProfile['club'] {
  const latest = moves.find((m) => !m.free) ?? moves[0]
  if (!latest) return null
  const club = siteData.clubs.find((c) => clubSlug(stripFlag(c.name)) === clubSlug(latest.club))
  return {
    name: latest.club,
    logo: club?.logoLocal || '',
    flag: club?.flag ?? '',
    free: latest.free,
  }
}

export function findPlayer(name: string | undefined): PlayerProfile | null {
  if (!name) return null

  const stats: PlayerStat[] = []
  let avatar = ''
  let club: PlayerProfile['club'] = null

  for (const board of siteData.leaderboards) {
    const row = board.rows.find((r) => samePlayer(r.name, name))
    if (!row) continue
    const rank = board.rows.indexOf(row) + 1
    stats.push({ board: board.title, value: row.value, rank, unit: unitFor(board.title) })
    if (!avatar && row.avatarLocal) avatar = row.avatarLocal
    if (!club && row.team) {
      // `teamLogoLocal` is populated on only a couple of leaderboard rows, so
      // fall back to the clubs list, which is the app's canonical crest source.
      const match = siteData.clubs.find(
        (c) => clubSlug(stripFlag(c.name)) === clubSlug(stripFlag(row.team)),
      )
      club = {
        name: row.team,
        logo: row.teamLogoLocal || match?.logoLocal || '',
        flag: row.team_flag || match?.flag || '',
        free: false,
      }
    }
  }

  const moves: PlayerMove[] = siteData.transfers
    .filter((t) => samePlayer(t.player, name))
    .map((t) => {
      // The feed records both ends, so direction is read off which side is the
      // real club. Joined from free agency is an arrival; released to free
      // agency is a departure; club to club reads as joining the new one.
      const joined = t.from.free || !t.to.free
      const side = joined ? t.to : t.from
      return {
        date: t.date,
        direction: (joined ? 'in' : 'out') as 'in' | 'out',
        club: side.name,
        clubLogo: side.logoLocal || '',
        free: Boolean(side.free),
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  if (!stats.length && !moves.length) return null
  if (!club) club = clubFromMoves(moves)

  const bestRank = stats.length ? Math.min(...stats.map((s) => s.rank)) : null

  return {
    name,
    avatar: avatar || AVATAR_PLACEHOLDER,
    club,
    stats: stats.sort((a, b) => a.rank - b.rank),
    moves,
    bestRank,
  }
}

/**
 * Route key. Gamertags contain underscores and mixed case and can carry
 * accents, so this normalises to the same dash-separated form clubSlug uses.
 */
export function playerSlug(name: string): string {
  return clubSlug(name)
}

export function playerHref(name: string): string {
  return `/players/${playerSlug(name)}`
}

/** Resolve a slug back to a player, tolerating the gamertag's raw form too. */
export function findPlayerBySlug(slug: string | undefined): PlayerProfile | null {
  if (!slug) return null
  const direct = findPlayer(slug)
  if (direct) return direct

  const wanted = slug.toLowerCase()
  const names = new Set<string>()
  for (const b of siteData.leaderboards) for (const r of b.rows) names.add(r.name)
  for (const t of siteData.transfers) names.add(t.player)

  for (const n of names) {
    if (playerSlug(n) === wanted) return findPlayer(n)
  }
  return null
}

/** Every player with a profile, leaderboard first. */
export function allPlayers(): string[] {
  const seen = new Map<string, string>()
  for (const b of siteData.leaderboards) {
    for (const r of b.rows) seen.set(r.name.toLowerCase(), r.name)
  }
  for (const t of siteData.transfers) seen.set(t.player.toLowerCase(), t.player)
  return [...seen.values()]
}

/** Leaderboard rows for a player, whichever board they are on. */
export function rowsForPlayer(name: string): LeaderboardRow[] {
  const out: LeaderboardRow[] = []
  for (const b of siteData.leaderboards) {
    for (const r of b.rows) if (samePlayer(r.name, name)) out.push(r)
  }
  return out
}

export { isoToFlag }