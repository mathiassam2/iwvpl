import { asset } from '@/lib/assets'
import { AVATAR_PLACEHOLDER } from '@/lib/format'
import type { PlayerProfile } from '@/lib/players'
import type { Club, Match, StandingDivision } from '@/types/site'

interface ApiClub {
  id: number
  name: string
  slug: string
  short_code: string | null
  flag: string | null
  logo_url: string | null
  logo_local: string | null
  status: string
  players: number
}

interface ApiMatch {
  id: number
  kickoff: string
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

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`Live league data request failed (${response.status}).`)
  }
  return (await response.json()) as T
}

export async function getLiveSeason(signal: AbortSignal): Promise<LeagueSeason> {
  return get<LeagueSeason>('/api/seasons/current', signal)
}

export async function getLiveSeasons(signal: AbortSignal): Promise<LeagueSeason[]> {
  const response = await get<{ seasons: LeagueSeason[] }>('/api/seasons', signal)
  return response.seasons
}

function toMatch(match: ApiMatch): Match {
  const [datePart, timePart = ''] = match.kickoff.split(' ')
  const date = new Date(`${datePart}T00:00:00`)
  const formattedDate = Number.isNaN(date.getTime())
    ? datePart
    : date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })

  return {
    date: formattedDate,
    time: timePart.slice(0, 5),
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

export async function getLiveResults(signal: AbortSignal): Promise<Match[]> {
  const response = await get<{ matches: ApiMatch[] }>(
    '/api/matches?limit=200&status=finished',
    signal,
  )
  return response.matches.map(toMatch)
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
export async function getLiveClubs(signal: AbortSignal): Promise<Club[]> {
  const response = await get<{ clubs: ApiClub[] }>('/api/clubs', signal)

  return response.clubs.map((c) => ({
    name: c.name,
    flag: c.flag ?? '',
    code: c.short_code ?? '',
    // Internal detail page, never the original site.
    url: '',
    logo: c.logo_url ?? '',
    logoLocal: c.logo_local ?? '',
    players: Number(c.players ?? 0),
    status: (c.status === 'active' ? 'Active' : 'Pending') as Club['status'],
    raw: c.name,
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
export async function getLiveClub(
  slug: string,
  signal: AbortSignal,
): Promise<(Club & { division: string | null; roster: Array<{ name: string }> }) | null> {
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
      division: { name: string } | null
      players: Array<{ gamertag: string }>
    }>(`/api/clubs/${encodeURIComponent(slug)}`, signal)

    if (response.status !== 'active') return null

    return {
      name: response.name,
      flag: response.flag ?? '',
      code: response.short_code ?? '',
      url: '',
      logo: response.logo_url ?? '',
      logoLocal: response.logo_local ?? '',
      players: response.players.length,
      status: 'Active',
      raw: response.name,
      division: response.division?.name ?? null,
      roster: response.players.map((p) => ({ name: p.gamertag })),
    }
  } catch {
    return null
  }
}
