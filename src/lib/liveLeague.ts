import { asset } from '@/lib/assets'
import { AVATAR_PLACEHOLDER, CLUB_PLACEHOLDER } from '@/lib/format'
import type { ClubLineup } from '@/lib/fixtures'
import type { PlayerProfile } from '@/lib/players'
import type { Club, Format, Match, StandingDivision, Transfer } from '@/types/site'

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
  division_id?: number | null
  division_name?: string | null
  round_number?: number | null
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

function divisionTierRank(name: string): number {
  const lower = name.toLowerCase().trim()
  if (lower.includes('premier') || lower.includes('super')) return 0
  if (/\b(one|1|i)\b/.test(lower)) return 1
  if (/\b(two|2|ii)\b/.test(lower)) return 2
  if (/\b(three|3|iii)\b/.test(lower)) return 3
  if (/\b(four|4|iv)\b/.test(lower)) return 4
  if (/\b(five|5|v)\b/.test(lower)) return 5
  const numMatch = lower.match(/\d+/)
  if (numMatch) return Number(numMatch[0])
  return 999
}

export function orderedStandingDivisions(
  divisions: Record<string, StandingDivision>,
): Array<[string, StandingDivision]> {
  return Object.entries(divisions).sort(([nameA, a], [nameB, b]) => {
    const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER
    const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    const rankDiff = divisionTierRank(nameA) - divisionTierRank(nameB)
    if (rankDiff !== 0) return rankDiff
    return nameA.localeCompare(nameB)
  })
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
    divisionId: match.division_id ?? null,
    divisionName: match.division_name ?? null,
    roundNumber: match.round_number ?? null,
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

let cachedLiveStandings: LiveStandings | null = null

export function peekLiveStandings(): LiveStandings | null {
  return cachedLiveStandings
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

  const result = { season: response.season, divisions }
  cachedLiveStandings = result
  return result
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

/* -------------------------------------------------------------- divisions */

export interface LiveDivision {
  id: number
  name: string
  slug: string
  season_id?: number
  season?: string
  sort_order: number
  promotion_count?: number | null
  relegation_count?: number | null
  is_active?: number | boolean
  max_teams?: number
}

let cachedLiveDivisions: LiveDivision[] | null = null

export function peekLiveDivisions(): LiveDivision[] | null {
  return cachedLiveDivisions
}

export async function getLiveDivisions(signal?: AbortSignal): Promise<LiveDivision[]> {
  const response = await get<{ divisions: LiveDivision[] }>('/api/divisions', signal)
  cachedLiveDivisions = response.divisions
  return response.divisions
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
  managers?: string[]
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
      managers?: string[]
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
      managers: Array.isArray(response.managers) && response.managers.length > 0
        ? response.managers
        : response.manager_name
          ? response.manager_name.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
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

export async function getLiveLeaderboardSummary(
  signal?: AbortSignal,
  seasonId?: number | null,
): Promise<LiveLeaderboardSummary | null> {
  try {
    const query = seasonId
      ? `?seasonId=${encodeURIComponent(String(seasonId))}&_=${Date.now()}`
      : `?_=${Date.now()}`
    const res = await get<LiveLeaderboardSummary>(`/api/leaderboards/summary${query}`, signal)
    cachedLiveLeaderboards = res
    return res
  } catch {
    return null
  }
}

let cachedLiveTransfers: Transfer[] | null = null

export function peekLiveTransfers(): Transfer[] | null {
  return cachedLiveTransfers
}

export async function getLiveTransfers(signal?: AbortSignal): Promise<Transfer[] | null> {
  if (cachedLiveTransfers) return cachedLiveTransfers
  try {
    const res = await get<{ transfers: Transfer[] }>('/api/transfers', signal)
    if (Array.isArray(res?.transfers)) {
      cachedLiveTransfers = res.transfers
      return res.transfers
    }
    return null
  } catch {
    return null
  }
}


/* ------------------------------------------------------------- live match detail */

export interface LiveMatchPlayerStat {
  id: number
  playerId: number | null
  clubId: number
  gamertag: string
  proName: string | null
  pos: string
  platform: 'ps' | 'pc' | 'xbox'
  rating: number | null
  goals: number
  assists: number
  shots: number | null
  shotAccuracy: number | null
  passes: number | null
  passAttempts: number | null
  passAccuracy: number | null
  dribbles: number | null
  dribbleSuccessRate: number | null
  tackles: number | null
  tackleAttempts: number | null
  tackleSuccessRate: number | null
  offsides: number | null
  foulsCommitted: number | null
  possessionWon: number | null
  possessionLost: number | null
  minutesPlayed: number | null
  distanceCovered: number | null
  distanceSprinted: number | null
  saves: number
  cleanSheet: boolean
  isMom: boolean
  yellowCards: number
  redCards: number
}

export interface LiveMatchEvent {
  minute: number
  type: string
  teamSide: 'home' | 'away'
  playerName: string
  detail: string | null
  score: string | null
}

export interface LiveMatchSquadMember {
  id: number
  gamertag: string
  shirtNumber: number | null
  isStarting11: boolean
  sortOrder: number | null
  position?: string | null
}

export interface LiveMatchDetail {
  id: number
  kickoff: string | null
  date: string
  time: string
  status: string
  homeScore: number | null
  awayScore: number | null
  hs: string
  as: string
  played: boolean
  venue: string | null
  streamUrl: string | null
  eaMatchId: string | null
  divisionId?: number | null
  seasonId?: number | null
  divisionName?: string
  roundNumber?: number | null
  home: {
    id: number
    name: string
    slug: string
    code: string
    logo: string
    flag: string
    formation?: string | null
    startingXi?: ClubLineup | null
    managerName?: string | null
  }
  away: {
    id: number
    name: string
    slug: string
    code: string
    logo: string
    flag: string
    formation?: string | null
    startingXi?: ClubLineup | null
    managerName?: string | null
  }
  playerStats: LiveMatchPlayerStat[]
  events: LiveMatchEvent[]
  stats: {
    dribbleSuccess: [number, number] | null
    shotAccuracy: [number, number] | null
    passAccuracy: [number, number] | null
    possession: [number, number] | null
    ballRecoveryTime: [number, number] | null
    xg: [number, number] | null
    shots: [number, number] | null
    onTarget: [number, number] | null
    passes: [number, number] | null
    tackles: [number, number] | null
    tacklesWon: [number, number] | null
    interceptions: [number, number] | null
    saves: [number, number] | null
    fouls: [number, number] | null
    offsides: [number, number] | null
    corners: [number, number] | null
    freeKicks: [number, number] | null
    penalties: [number, number] | null
    yellowCards: [number, number] | null
    redCards: [number, number] | null
  }
  hasStats: boolean
  homeSquad: LiveMatchSquadMember[]
  awaySquad: LiveMatchSquadMember[]
}

export async function getLiveMatchDetail(
  idOrSlug: string | number,
  signal?: AbortSignal,
): Promise<LiveMatchDetail | null> {
  try {
    const raw = await get<any>(`/api/matches/${encodeURIComponent(String(idOrSlug))}`, signal)
    if (!raw || !raw.id) return null

    const { date, time } = formatMatchKickoff(raw.kickoff)
    const played = raw.home_score !== null && raw.away_score !== null

    const playerStats: LiveMatchPlayerStat[] = (raw.playerStats ?? []).map((p: any) => ({
      id: p.id,
      playerId: p.player_id ?? null,
      clubId: p.club_id,
      gamertag: p.gamertag,
      proName: p.pro_name || null,
      pos: p.pos || 'CM',
      platform: p.platform === 'pc' || p.platform === 'xbox' ? p.platform : 'ps',
      rating: p.rating != null ? Number(p.rating) : null,
      goals: Number(p.goals) || 0,
      assists: Number(p.assists) || 0,
      shots: p.shots != null ? Number(p.shots) : null,
      shotAccuracy: p.shot_accuracy != null ? Number(p.shot_accuracy) : null,
      passes: p.passes != null ? Number(p.passes) : null,
      passAttempts: p.pass_attempts != null ? Number(p.pass_attempts) : null,
      passAccuracy: p.pass_accuracy != null ? Number(p.pass_accuracy) : null,
      dribbles: p.dribbles != null ? Number(p.dribbles) : null,
      dribbleSuccessRate: p.dribble_success_rate != null ? Number(p.dribble_success_rate) : null,
      tackles: p.tackles != null ? Number(p.tackles) : null,
      tackleAttempts: p.tackle_attempts != null ? Number(p.tackle_attempts) : null,
      tackleSuccessRate: p.tackle_success_rate != null ? Number(p.tackle_success_rate) : null,
      offsides: p.offsides != null ? Number(p.offsides) : null,
      foulsCommitted: p.fouls_committed != null ? Number(p.fouls_committed) : null,
      possessionWon: p.possession_won != null ? Number(p.possession_won) : null,
      possessionLost: p.possession_lost != null ? Number(p.possession_lost) : null,
      minutesPlayed: p.minutes_played != null ? Number(p.minutes_played) : null,
      distanceCovered: p.distance_covered != null ? Number(p.distance_covered) : null,
      distanceSprinted: p.distance_sprinted != null ? Number(p.distance_sprinted) : null,
      saves: Number(p.saves) || 0,
      cleanSheet: Boolean(p.clean_sheet),
      isMom: Boolean(p.is_mom),
      yellowCards: Number(p.yellow_cards) || 0,
      redCards: Number(p.red_cards) || 0,
    }))

    const events: LiveMatchEvent[] = (raw.events ?? []).map((e: any) => ({
      minute: Number(e.minute) || 0,
      type: e.type || 'goal',
      teamSide: e.team_side === 'away' ? 'away' : 'home',
      playerName: e.player_name || '',
      detail: e.detail ?? null,
      score: e.score ?? null,
    }))

    const homeSquad: LiveMatchSquadMember[] = (raw.homeSquad ?? []).map((p: any) => ({
      id: p.id,
      gamertag: p.gamertag,
      shirtNumber: p.shirt_number != null ? Number(p.shirt_number) : null,
      isStarting11: Boolean(p.is_starting_11),
      sortOrder: p.sort_order != null ? Number(p.sort_order) : null,
      position: p.position ?? null,
    }))

    const awaySquad: LiveMatchSquadMember[] = (raw.awaySquad ?? []).map((p: any) => ({
      id: p.id,
      gamertag: p.gamertag,
      shirtNumber: p.shirt_number != null ? Number(p.shirt_number) : null,
      isStarting11: Boolean(p.is_starting_11),
      sortOrder: p.sort_order != null ? Number(p.sort_order) : null,
      position: p.position ?? null,
    }))

    const ms = raw.stats
    const pairOrNull = (h: unknown, a: unknown): [number, number] | null => {
      if (h != null && h !== '' && a != null && a !== '') {
        return [Number(h), Number(a)]
      }
      return null
    }

    let dribbleSuccess = ms ? pairOrNull(ms.dribble_success_home, ms.dribble_success_away) : null
    let shotAccuracy = ms ? pairOrNull(ms.shot_accuracy_home, ms.shot_accuracy_away) : null
    let passAccuracy = ms ? pairOrNull(ms.pass_accuracy_home, ms.pass_accuracy_away) : null
    let possession = ms ? pairOrNull(ms.possession_home, ms.possession_away) : null
    let ballRecoveryTime = ms ? pairOrNull(ms.ball_recovery_time_home, ms.ball_recovery_time_away) : null
    let xg = ms ? pairOrNull(ms.xg_home, ms.xg_away) : null
    let shots = ms ? pairOrNull(ms.shots_home, ms.shots_away) : null
    let onTarget = ms ? pairOrNull(ms.on_target_home, ms.on_target_away) : null
    let passes = ms ? pairOrNull(ms.passes_home, ms.passes_away) : null
    let tackles = ms ? pairOrNull(ms.tackles_home, ms.tackles_away) : null
    let tacklesWon = ms ? pairOrNull(ms.tackles_won_home, ms.tackles_won_away) : null
    let interceptions = ms ? pairOrNull(ms.interceptions_home, ms.interceptions_away) : null
    let saves = ms ? pairOrNull(ms.saves_home, ms.saves_away) : null
    let fouls = ms ? pairOrNull(ms.fouls_home, ms.fouls_away) : null
    let offsides = ms ? pairOrNull(ms.offsides_home, ms.offsides_away) : null
    let corners = ms ? pairOrNull(ms.corners_home, ms.corners_away) : null
    let freeKicks = ms ? pairOrNull(ms.free_kicks_home, ms.free_kicks_away) : null
    let penalties = ms ? pairOrNull(ms.penalties_home, ms.penalties_away) : null
    let yellowCards = ms ? pairOrNull(ms.yellow_cards_home, ms.yellow_cards_away) : null
    let redCards = ms ? pairOrNull(ms.red_cards_home, ms.red_cards_away) : null

    if (playerStats.length > 0) {
      const homeP = playerStats.filter((p) => p.clubId === raw.home_club_id)
      const awayP = playerStats.filter((p) => p.clubId === raw.away_club_id)

      if (!shots) {
        const hShots = homeP.reduce((acc, p) => acc + (p.shots ?? 0), 0)
        const aShots = awayP.reduce((acc, p) => acc + (p.shots ?? 0), 0)
        if (hShots > 0 || aShots > 0) shots = [hShots, aShots]
      }
      if (!passes) {
        const hPasses = homeP.reduce((acc, p) => acc + (p.passes ?? 0), 0)
        const aPasses = awayP.reduce((acc, p) => acc + (p.passes ?? 0), 0)
        if (hPasses > 0 || aPasses > 0) passes = [hPasses, aPasses]
      }
      if (!saves) {
        const hSaves = homeP.reduce((acc, p) => acc + p.saves, 0)
        const aSaves = awayP.reduce((acc, p) => acc + p.saves, 0)
        if (hSaves > 0 || aSaves > 0) saves = [hSaves, aSaves]
      }
      if (!tacklesWon) {
        const hTackles = homeP.reduce((acc, p) => acc + (p.tackles ?? 0), 0)
        const aTackles = awayP.reduce((acc, p) => acc + (p.tackles ?? 0), 0)
        if (hTackles > 0 || aTackles > 0) tacklesWon = [hTackles, aTackles]
      }
      if (!tackles) {
        const hTackleAtt = homeP.reduce((acc, p) => acc + (p.tackleAttempts ?? p.tackles ?? 0), 0)
        const aTackleAtt = awayP.reduce((acc, p) => acc + (p.tackleAttempts ?? p.tackles ?? 0), 0)
        if (hTackleAtt > 0 || aTackleAtt > 0) tackles = [hTackleAtt, aTackleAtt]
      }
    }

    const statsObj = {
      dribbleSuccess,
      shotAccuracy,
      passAccuracy,
      possession,
      ballRecoveryTime,
      xg,
      shots,
      onTarget,
      passes,
      tackles,
      tacklesWon,
      interceptions,
      saves,
      fouls,
      offsides,
      corners,
      freeKicks,
      penalties,
      yellowCards,
      redCards,
    }

    const hasStats = Object.values(statsObj).some(Boolean)

    return {
      id: raw.id,
      kickoff: raw.kickoff,
      date,
      time,
      status: raw.status,
      homeScore: raw.home_score,
      awayScore: raw.away_score,
      hs: raw.home_score !== null ? String(raw.home_score) : '',
      as: raw.away_score !== null ? String(raw.away_score) : '',
      played,
      venue: raw.venue ?? null,
      streamUrl: raw.stream_url ?? null,
      eaMatchId: raw.ea_match_id ?? null,
      divisionId: raw.division_id ?? null,
      seasonId: raw.season_id ?? null,
      divisionName: raw.division_name ?? undefined,
      roundNumber: raw.round_number ?? null,
      home: {
        id: raw.home_club_id,
        name: raw.home_name,
        slug: raw.home_slug,
        code: raw.home_code ?? '',
        logo: raw.home_logo ? asset(raw.home_logo) : CLUB_PLACEHOLDER,
        flag: raw.home_flag ?? '',
        formation: raw.homeStartingXi?.formation || raw.home_formation || '4-3-3',
        startingXi: raw.homeStartingXi ?? null,
        managerName: raw.home_manager ?? null,
      },
      away: {
        id: raw.away_club_id,
        name: raw.away_name,
        slug: raw.away_slug,
        code: raw.away_code ?? '',
        logo: raw.away_logo ? asset(raw.away_logo) : CLUB_PLACEHOLDER,
        flag: raw.away_flag ?? '',
        formation: raw.awayStartingXi?.formation || raw.away_formation || '4-3-3',
        startingXi: raw.awayStartingXi ?? null,
        managerName: raw.away_manager ?? null,
      },
      playerStats,
      events,
      stats: statsObj,
      hasStats,
      homeSquad,
      awaySquad,
    }
  } catch {
    return null
  }
}
