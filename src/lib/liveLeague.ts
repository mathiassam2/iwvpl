import { asset } from '@/lib/assets'
import { AVATAR_PLACEHOLDER } from '@/lib/format'
import type { ClubLineup } from '@/lib/fixtures'
import type { PlayerProfile } from '@/lib/players'
import type { Club, Format, Match, StandingDivision } from '@/types/site'

interface ApiClub {
  id: number
  name: string
  slug: string
  short_code: string | null
  flag: string | null
  logo_url: string | null
  logo_local: string | null
  status: string
  is_featured?: boolean | number
  players: number
}

interface ApiFormat {
  id: number
  name: string
  tag: string
  description: string
  status: 'active' | 'inactive' | 'coming_soon'
  sort_order: number
}

interface ApiMatch {
  id: number
  kickoff: string | null
  status: string
  home_score: number | null
  away_score: number | null
  source_url: string | null
  home_name: string
  home_logo: string | null
  away_name: string
  away_logo: string | null
}

interface ApiStanding {
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  form: string
  name: string
  short_code: string | null
  logo_local: string | null
  flag: string | null
  division_name: string
  sort_order: number
  promotion_count: number | null
  relegation_count: number | null
}

export interface LeagueSeason {
  id: number
  name: string
  year: number
  is_current: boolean | number
  featured_division_id: number | null
}

export interface LeagueClub {
  id: number
  name: string
  slug: string
}

export interface LiveMatchPage {
  matches: Match[]
  total: number
}

export interface LiveStandings {
  season: LeagueSeason
  divisions: Record<string, StandingDivision>
}

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const liveLeagueEnabled = Boolean(apiBase) || import.meta.env.BASE_URL === '/'

export function orderedStandingDivisions(
  divisions: Record<string, StandingDivision>,
): Array<[string, StandingDivision]> {
  return Object.entries(divisions).sort(
    ([, a], [, b]) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  )
}

export function featuredStandingDivision(
  standings: LiveStandings,
): [string, StandingDivision] | undefined {
  return (
    Object.entries(standings.divisions).find(
      ([, division]) => division.id === standings.season.featured_division_id,
    ) ?? orderedStandingDivisions(standings.divisions)[0]
  )
}

const liveGetCache = new Map<string, { data: unknown; ts: number }>()
const inFlightLiveGets = new Map<string, Promise<unknown>>()
const LIVE_FRESH_MS = 25_000
const LIVE_REVALIDATE_MS = 4_000

async function fetchLiveJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Live league data request failed (${response.status}).`)
  }
  return (await response.json()) as T
}

async function get<T>(path: string, _signal?: AbortSignal): Promise<T> {
  const now = Date.now()
  const cached = liveGetCache.get(path)
  if (cached && now - cached.ts < LIVE_FRESH_MS) {
    if (now - cached.ts > LIVE_REVALIDATE_MS && !inFlightLiveGets.has(path)) {
      const bg = fetchLiveJson<T>(path)
        .then((fresh) => {
          liveGetCache.set(path, { data: fresh, ts: Date.now() })
          return fresh
        })
        .catch(() => cached.data as T)
        .finally(() => {
          inFlightLiveGets.delete(path)
        })
      inFlightLiveGets.set(path, bg)
    }
    return cached.data as T
  }

  const existing = inFlightLiveGets.get(path)
  if (existing) {
    return existing as Promise<T>
  }

  const p = fetchLiveJson<T>(path)
    .then((data) => {
      liveGetCache.set(path, { data, ts: Date.now() })
      return data
    })
    .finally(() => {
      inFlightLiveGets.delete(path)
    })

  inFlightLiveGets.set(path, p)
  return p
}

export async function getLiveSeason(signal: AbortSignal): Promise<LeagueSeason> {
  return get<LeagueSeason>('/api/seasons/current', signal)
}

export async function getLiveSeasons(signal: AbortSignal): Promise<LeagueSeason[]> {
  const response = await get<{ seasons: LeagueSeason[] }>('/api/seasons', signal)
  return response.seasons
}

export async function getLiveSeasonClubs(
  signal: AbortSignal,
  seasonId: number,
): Promise<LeagueClub[]> {
  const response = await get<{ clubs: LeagueClub[] }>(
    `/api/clubs?seasonId=${seasonId}`,
    signal,
  )
  return response.clubs
}

export function formatMatchKickoff(kickoff: string | null | undefined): {
  date: string
  time: string
  rawDate: string | null
} {
  if (!kickoff) {
    return { date: 'Unscheduled / TBD', time: '', rawDate: null }
  }
  const clean = kickoff.replace(' ', 'T')
  const dateObj = new Date(clean)
  if (Number.isNaN(dateObj.getTime())) {
    const [d = '', t = ''] = kickoff.split(/[ T]/)
    return { date: d || 'Unscheduled', time: t.slice(0, 5), rawDate: d || null }
  }
  const formattedDate = dateObj.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const hours = String(dateObj.getHours()).padStart(2, '0')
  const minutes = String(dateObj.getMinutes()).padStart(2, '0')
  const time = `${hours}:${minutes}`
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')
  return {
    date: formattedDate,
    time,
    rawDate: `${year}-${month}-${day}`,
  }
}

export function toMatch(match: ApiMatch): Match {
  const { date, time, rawDate } = formatMatchKickoff(match.kickoff)
  return {
    id: match.id,
    date,
    time,
    rawDate,
    kickoff: match.kickoff,
    status: match.status,
    home: match.home_name,
    home_flag: '',
    home_logo: '',
    away: match.away_name,
    away_flag: '',
    away_logo: '',
    score:
      match.home_score === null || match.away_score === null
        ? ''
        : `${match.home_score} : ${match.away_score}`,
    hs: match.home_score === null ? '' : String(match.home_score),
    as: match.away_score === null ? '' : String(match.away_score),
    url: match.source_url ?? `/matches/${match.id}`,
    homeLogo: match.home_logo ? asset(match.home_logo) : undefined,
    awayLogo: match.away_logo ? asset(match.away_logo) : undefined,
  }
}

export async function getLiveResults(
  signal: AbortSignal,
  seasonId?: number,
): Promise<Match[]> {
  const page = await getLiveResultsPage(signal, {
    seasonId,
    limit: 200,
    offset: 0,
  })
  return page.matches
}

export async function getLiveMatches(
  signal: AbortSignal,
  opts?: {
    seasonId?: number
    clubSlug?: string
    status?: string
    result?: 'all' | 'pending' | 'completed'
    sort?: 'latest' | 'priority'
    limit?: number
    offset?: number
  },
): Promise<{ matches: Match[]; total: number; pendingTotal: number; completedTotal: number }> {
  const params = new URLSearchParams({
    limit: String(opts?.limit ?? 500),
    offset: String(opts?.offset ?? 0),
  })
  if (opts?.seasonId != null) params.set('seasonId', String(opts.seasonId))
  if (opts?.clubSlug) params.set('clubSlug', opts.clubSlug)
  if (opts?.status && opts.status !== 'all') params.set('status', opts.status)
  if (opts?.result && opts.result !== 'all') params.set('result', opts.result)
  if (opts?.sort) params.set('sort', opts.sort)

  const response = await get<{
    matches: ApiMatch[]
    total: number
    pendingTotal?: number
    completedTotal?: number
  }>(`/api/matches?${params}`, signal)

  return {
    matches: response.matches.map(toMatch),
    total: response.total,
    pendingTotal: response.pendingTotal ?? 0,
    completedTotal: response.completedTotal ?? 0,
  }
}

export async function getLiveResultsPage(
  signal: AbortSignal,
  {
    seasonId,
    clubSlug,
    limit,
    offset,
  }: {
    seasonId?: number
    clubSlug?: string
    limit: number
    offset: number
  },
): Promise<LiveMatchPage> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    status: 'finished',
    sort: 'latest',
  })
  if (seasonId != null) params.set('seasonId', String(seasonId))
  if (clubSlug) params.set('clubSlug', clubSlug)
  const response = await get<{ matches: ApiMatch[]; total: number }>(
    `/api/matches?${params}`,
    signal,
  )
  return {
    matches: response.matches.map(toMatch),
    total: response.total,
  }
}

export async function getLiveStandings(
  signal: AbortSignal,
  seasonId?: number,
): Promise<LiveStandings> {
  const response = await get<{ season: LeagueSeason; standings: ApiStanding[] }>(
    `/api/standings${seasonId == null ? '' : `?seasonId=${seasonId}`}`,
    signal,
  )
  const divisionResponse = await get<{
    divisions: Array<{
      id: number
      name: string
      sort_order: number
      promotion_count: number | null
      relegation_count: number | null
    }>
  }>(
    `/api/divisions?seasonId=${response.season.id}`,
    signal,
  )
  const movementByDivision = new Map(
    divisionResponse.divisions.map((division) => [
      division.name,
      {
        promotion: division.promotion_count,
        relegation: division.relegation_count,
      },
    ]),
  )
  const divisions: Record<string, StandingDivision> = Object.fromEntries(
    divisionResponse.divisions.map((division) => [
      division.name,
      {
        columns: [],
        rows: [],
        id: division.id,
        sortOrder: division.sort_order,
        promotionCount: division.promotion_count,
        relegationCount: division.relegation_count,
        promotionRange: null,
        relegationRange: null,
      },
    ]),
  )

  for (const row of response.standings) {
    const division = divisions[row.division_name] ?? (divisions[row.division_name] = {
      columns: [],
      rows: [],
      sortOrder: row.sort_order,
      promotionCount: row.promotion_count,
      relegationCount: row.relegation_count,
      promotionRange: null,
      relegationRange: null,
    })
    if (!movementByDivision.has(row.division_name)) {
      movementByDivision.set(row.division_name, {
        promotion: row.promotion_count,
        relegation: row.relegation_count,
      })
    }
    const rows = division.rows
    rows.push({
      pos: row.position,
      team: row.name,
      flag: row.flag ?? '',
      pl: row.played,
      w: row.won,
      d: row.drawn,
      l: row.lost,
      gf: row.goals_for,
      ga: row.goals_against,
      gd: row.goal_difference,
      pts: row.points,
      form: row.form.split(''),
      logo: row.logo_local ? asset(row.logo_local) : '',
      code: row.short_code ?? '',
    })
  }

  for (const [name, division] of Object.entries(divisions)) {
    const movement = movementByDivision.get(name)
    const teamCount = division.rows.length
    division.promotionCount = movement?.promotion ?? null
    division.relegationCount = movement?.relegation ?? null
    division.promotionRange = movement?.promotion == null
      ? null
      : { from: 1, to: movement.promotion }
    division.relegationRange = movement?.relegation == null || teamCount === 0
      ? null
      : { from: Math.max(1, teamCount - movement.relegation + 1), to: teamCount }
  }

  return { season: response.season, divisions }
}

/* ------------------------------------------------------------------ clubs */

/**
 * Clubs, live.
 *
 * The crawl JSON is a build-time snapshot, so a club created through an
 * account exists only in the database and the clubs page reported "not found"
 * for it. This is the live equivalent of `siteData.clubs`, shaped the same so
 * the page does not care which source it got.
 *
 * Only `status = 'active'` clubs are served, which is the same filter the
 * crawl-backed list applies — a pending club is a claim nobody has approved
 * yet and has no business on the public site.
 */
let cachedLiveClubs: Club[] | null = null

export function peekLiveClubs(): Club[] | null {
  return cachedLiveClubs
}

export async function getLiveClubs(signal?: AbortSignal): Promise<Club[]> {
  const response = await get<{ clubs: ApiClub[] }>('/api/clubs', signal)

  const mapped = response.clubs.map((c) => ({
    name: c.name,
    slug: c.slug,
    flag: c.flag ?? '',
    code: c.short_code ?? '',
    // Internal detail page, never the original site.
    url: '',
    logo: c.logo_url || c.logo_local || '',
    logoLocal: c.logo_local || c.logo_url || '',
    players: Number(c.players ?? 0),
    status: (c.status === 'active' ? 'Active' : 'Pending Approval') as Club['status'],
    raw: c.name,
    isFeatured: c.is_featured === undefined ? true : Boolean(c.is_featured),
  }))
  cachedLiveClubs = mapped
  return mapped
}

export interface HomepageRegion {
  id: number
  iso: string
  name: string
  flag: string
  art: string
  sortOrder: number
}

interface ApiRegion {
  id: number
  iso: string
  name: string
  flag: string
  art_url: string
  is_active: boolean | number
  sort_order: number
}

export async function getLiveFormats(signal: AbortSignal): Promise<Format[]> {
  const response = await get<{ formats: ApiFormat[] }>('/api/formats', signal)
  return response.formats.map((f) => ({
    id: f.id,
    name: f.name,
    tag: f.status === 'coming_soon' ? 'Coming Soon' : f.tag,
    desc: f.description,
    status: f.status,
  }))
}

export async function getLiveRegions(signal: AbortSignal): Promise<HomepageRegion[]> {
  const response = await get<{ regions: ApiRegion[] }>('/api/regions', signal)
  return response.regions.map((r) => ({
    id: r.id,
    iso: r.iso,
    name: r.name,
    flag: r.flag,
    art: r.art_url,
    sortOrder: r.sort_order,
  }))
}

/* ---------------------------------------------------------------- players */

/**
 * One player, live.
 *
 * `null` means the profile is not in the database — the caller should fall back
 * to the crawl, which is the only source for players the league never had
 * accounts for. Throwing would be wrong: a 404 here means "not ours", not
 * "broken".
 */
export async function getLivePlayer(
  slug: string,
  signal: AbortSignal,
): Promise<PlayerProfile | null> {
  let response: {
    player: {
      gamertag: string
      avatar: string | null
      club: { name: string; logo: string | null; flag: string | null; free: boolean }
      stats: Array<{ board: string; unit: string; value: number; rank: number | null }>
      moves: Array<{
        date: string
        direction: 'in' | 'out'
        club: string | null
        logo: string | null
        free: boolean
      }>
    }
  }

  try {
    response = await get<typeof response>(`/api/players/${encodeURIComponent(slug)}`, signal)
  } catch {
    return null
  }

  const p = response.player
  const stats = p.stats
    .filter((s) => s.rank !== null)
    .map((s) => ({
      board: s.board,
      value: s.value,
      rank: s.rank as number,
      unit: s.unit as 'goals' | 'assists' | 'saves',
    }))

  return {
    name: p.gamertag,
    avatar: p.avatar || AVATAR_PLACEHOLDER,
    club: {
      name: p.club.name,
      logo: p.club.logo ? asset(p.club.logo) : '',
      flag: p.club.flag ?? '',
      free: p.club.free,
    },
    stats,
    moves: p.moves
      .filter((m) => m.club)
      .map((m) => ({
        date: m.date,
        direction: m.direction,
        club: m.club as string,
        clubLogo: m.logo ? asset(m.logo) : '',
        free: m.free,
      })),
    bestRank: stats.length ? Math.min(...stats.map((s) => s.rank)) : null,
  }
}

/**
 * One club, live, by slug.
 *
 * `null` means "not an active club in the database", so the caller falls back
 * to the crawl. A pending or withdrawn club is deliberately invisible here
 * even though its row exists — it has not been approved, and exposing it would
 * publish an unapproved entry.
 */
export type LiveClubDetail = Club & {
  id?: number
  division: string | null
  managerName: string | null
  startingXi: ClubLineup | null
  roster: Array<{ id: number; name: string; shirtNumber: number | null }>
}

const cachedLiveClubBySlug = new Map<string, LiveClubDetail>()

export function peekLiveClub(slug: string): LiveClubDetail | undefined {
  return cachedLiveClubBySlug.get(slug.toLowerCase())
}

export function invalidateLiveClubCache(slug?: string) {
  if (slug) {
    liveGetCache.delete(`/api/clubs/${encodeURIComponent(slug)}`)
    cachedLiveClubBySlug.delete(slug.toLowerCase())
  } else {
    liveGetCache.clear()
    cachedLiveClubBySlug.clear()
  }

}

export async function getLiveClub(
  slug: string,
  signal?: AbortSignal,

): Promise<LiveClubDetail | null> {
  try {
    const response = await get<{
      id: number
      name: string
      slug: string
      short_code: string | null
      flag: string | null
      logo_url: string | null
      logo_local: string | null
      status: string
      description?: string | null
      formation?: string | null
      manager_name?: string | null
      starting_xi?: ClubLineup | null
      division: { name: string } | null
      players: Array<{ id: number; gamertag: string; shirt_number?: number | null }>

    }>(`/api/clubs/${encodeURIComponent(slug)}`, signal)

    if (response.status !== 'active') return null

    const detail: LiveClubDetail = {

      id: response.id,
      name: response.name,
      slug: response.slug,
      flag: response.flag ?? '',
      code: response.short_code ?? '',
      url: '',
      logo: response.logo_url || response.logo_local || '',
      logoLocal: response.logo_local || response.logo_url || '',
      players: response.players.length,
      status: 'Active',
      raw: response.name,
      description: response.description ?? null,
      formation: response.formation ?? null,

      division: response.division?.name ?? null,
      managerName: response.manager_name ?? null,
      startingXi: response.starting_xi ?? null,
      roster: response.players.map((p) => ({
        id: p.id,
        name: p.gamertag,
        shirtNumber: p.shirt_number ?? null,
      })),

    }
    cachedLiveClubBySlug.set(slug.toLowerCase(), detail)
    if (response.slug) cachedLiveClubBySlug.set(response.slug.toLowerCase(), detail)
    return detail
  } catch {
    return null
  }
}

/* ------------------------------------------------------------ leaderboards */

export interface LiveLeaderboardRow {
  value: number
  player_id: number
  gamertag: string
  slug: string
  celebration_image: string | null
  avatar_local: string | null
  club_name: string | null
  club_slug: string | null
  club_flag: string | null
  club_logo: string | null
}

export interface LiveLeaderboardSummary {
  season: { id: number; name: string } | null
  boards: Array<{
    title: string
    key: 'goals' | 'assists' | 'saves'
    rows: LiveLeaderboardRow[]
  }>
}

let cachedLiveLeaderboards: LiveLeaderboardSummary | null = null

export function peekLiveLeaderboards(): LiveLeaderboardSummary | null {
  return cachedLiveLeaderboards
}

export async function getLiveLeaderboardSummary(signal?: AbortSignal): Promise<LiveLeaderboardSummary | null> {
  try {
    const res = await get<LiveLeaderboardSummary>(`/api/leaderboards/summary?_=${Date.now()}`, signal)
    cachedLiveLeaderboards = res
    return res
  } catch {
    return null
  }
}
