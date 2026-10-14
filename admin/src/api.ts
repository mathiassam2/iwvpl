/**
 * API client for the admin app.
 *
 * Requests are same-origin and relative: in production the API serves this
 * bundle at the same host, and in dev Vite proxies /api. There is deliberately
 * no base URL to configure — an absolute URL would reintroduce CORS and a
 * second place for the host to be wrong.
 *
 * Credentials are always sent. Same-origin makes this a no-op in production,
 * but it is what lets the dev proxy reuse the browser's basic-auth session.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    // Basic auth is enforced at the HTTP layer, so the browser supplies the
    // header itself once the user has passed the prompt. Sending cookies
    // matters for the dev proxy, where the two look like different origins.
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      /* non-JSON error body - keep the generic message */
    }
    throw new ApiError(res.status, message)
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

/* ------------------------------------------------------------------ types */

export interface Standing {
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
  club_id: number
  name: string
  slug: string
  short_code: string | null
  logo_local: string | null
  flag: string | null
  division_name: string
  division_slug: string
}

export interface Match {
  id: number
  kickoff: string | null
  status: string
  home_score: number | null
  away_score: number | null
  home_name: string
  home_slug: string
  home_code: string | null
  home_logo: string | null
  away_name: string
  away_slug: string
  away_code: string | null
  away_logo: string | null
}

export interface Club {
  id: number
  name: string
  slug: string
  short_code: string | null
  flag: string | null
  logo_local: string | null
  logo_url: string | null
  status: string
  /** Division currently entered in, null when unassigned. */
  division_id: number | null
  players: number
}

export interface SeasonDivisionMovement {
  club_id: number
  source_division_id: number
  destination_division_id: number
  movement_type: 'promotion' | 'relegation' | 'transfer'
  source_position: number | null
}

/* --------------------------------------------------------------- requests */

export const getStandings = (seasonId?: number, division?: string) => {
  const params = new URLSearchParams()
  if (seasonId != null) params.set('seasonId', String(seasonId))
  if (division) params.set('division', division)
  const query = params.toString()
  return request<{ standings: Standing[] }>(
    `/api/standings${query ? `?${query}` : ''}`,
  ).then((r) => r.standings)
}

export interface MatchPage {
  matches: Match[]
  total: number
  pending: number
  completed: number
  limit: number
  offset: number
}

export type MatchSort = 'priority' | 'latest'

/**
 * The fixture list, page by page.
 *
 * `priority` is the server's default: what needs a date first, then overdue,
 * then today, then the rest, with played games last. `latest` is plain
 * kickoff order, newest first, with undated fixtures at the bottom.
 */
export const getMatches = ({
  limit,
  offset,
  result,
  search,
  sort,
}: {
  limit: number
  offset: number
  result: 'all' | 'pending' | 'completed'
  search: string
  sort?: MatchSort
}) => {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    result,
    search,
  })
  if (sort === 'latest') params.set('sort', 'latest')
  return request<MatchPage>(`/api/matches?${params}`)
}

export const getMatchPriorities = () =>
  request<{ matches: Match[] }>('/api/matches/priorities').then((r) => r.matches)

export const getClubs = (seasonId?: number) =>
  request<{ clubs: Club[] }>(
    `/api/clubs${seasonId == null ? '' : `?seasonId=${seasonId}`}`,
  ).then((r) => r.clubs)

export const scheduleMatch = (matchId: number, kickoff: string | null) =>
  request<{ ok: true; kickoff: string | null }>(`/api/admin/matches/${matchId}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify({ kickoff }),
  })

export const createMatch = (
  homeSlug: string,
  awaySlug: string,
  kickoff: string | null,
  seasonId?: number,
) =>
  request<{ match: Match }>('/api/admin/matches', {
    method: 'POST',
    body: JSON.stringify({ homeSlug, awaySlug, kickoff, ...(seasonId == null ? {} : { seasonId }) }),
  }).then((r) => r.match)

/** Clubs awaiting an admin decision, with the manager who applied. */
export interface PendingClub {
  id: number
  name: string
  slug: string
  created_at: string
  user_id: number | null
  email: string | null
  display_name: string | null
  players: number
}

export const getPendingClubs = () =>
  request<{ clubs: PendingClub[] }>('/api/admin/clubs/pending').then((r) => r.clubs)

/** Approve publishes the club; reject withdraws it. Both notify the manager. */
export const decideClub = (slug: string, decision: 'approve' | 'reject') =>
  request<{ ok: true; status: string }>(`/api/admin/clubs/${slug}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  })

export interface Division {
  id: number
  name: string
  slug: string
  season_id?: number
  season: string
  sort_order: number
  promotion_count: number | null
  relegation_count: number | null
}

export interface AdminSeason {
  id: number
  name: string
  year: number
  is_current: boolean | number
  featured_division_id: number | null
}

export const getDivisions = (seasonId?: number) =>
  request<{ divisions: Division[] }>(
    `/api/divisions${seasonId == null ? '' : `?seasonId=${seasonId}`}`,
  ).then((r) => r.divisions)

export const getSeasonDivisionMovements = () =>
  request<{ movements: SeasonDivisionMovement[] }>('/api/admin/season-movements').then(
    (r) => r.movements,
  )

export const getAdminSeasons = () =>
  request<{ seasons: AdminSeason[] }>('/api/admin/seasons').then((r) => r.seasons)

export const updateSeason = (id: number, name: string) =>
  request<{ season: AdminSeason }>(`/api/admin/seasons/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  }).then((r) => r.season)

export const setCurrentSeason = (id: number) =>
  request<{ season: AdminSeason }>(`/api/admin/seasons/${id}/current`, {
    method: 'PUT',
  }).then((r) => r.season)

export const setFeaturedDivision = (seasonId: number, divisionId: number | null) =>
  request<{ season: AdminSeason }>(`/api/admin/seasons/${seasonId}/featured-division`, {
    method: 'PUT',
    body: JSON.stringify({ divisionId }),
  }).then((r) => r.season)

export const createSeason = (name: string, year: number) =>
  request<{ season: AdminSeason; divisions: Array<Omit<Division, 'season'>> }>('/api/admin/seasons', {
    method: 'POST',
    body: JSON.stringify({ name, year }),
  })

export type DivisionInput = Omit<Division, 'id' | 'slug' | 'season' | 'sort_order'>

export const createDivision = (division: DivisionInput) =>
  request<{ division: Division }>('/api/admin/divisions', {
    method: 'POST',
    body: JSON.stringify(division),
  }).then((r) => r.division)

export const updateDivision = (id: number, division: DivisionInput) =>
  request<{ division: Division }>(`/api/admin/divisions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(division),
  }).then((r) => r.division)

export const updateDivisionOrder = (divisionIds: number[]) =>
  request<{ ok: true }>('/api/admin/divisions/order', {
    method: 'PUT',
    body: JSON.stringify({ divisionIds }),
  })

/**
 * Put a club into a division, or take it out of one with `null`.
 *
 * A plain move. It does not spend a promotion or relegation slot, whatever
 * direction the club travels: `moveClub` below is the only thing that does.
 *
 * Passing `null` unassigns the club from the current season. It drops this
 * season's membership and table row, so the club lands in the unassigned
 * table rather than silently staying where it was.
 *
 * Also creates its standings row, so it appears in the league table
 * immediately rather than waiting to play a match that cannot be scheduled
 * without a table to enter.
 */
export const assignDivision = (slug: string, divisionId: number | null) =>
  request<{ ok: true; divisionId: number | null; divisionName: string | null }>(
    `/api/admin/clubs/${slug}/division`,
    {
      method: 'POST',
      body: JSON.stringify({ divisionId }),
    },
  )

export type ClubMovementType = 'promotion' | 'relegation'

/**
 * Promote or relegate a club one rung of the ladder.
 *
 * Only the direction is sent. The server works out the destination league from
 * the club's own position, so the two can never disagree, and it refuses the
 * move when the source league has no slots left this season.
 */
export const moveClub = (slug: string, movementType: ClubMovementType) =>
  request<{
    ok: true
    movementType: ClubMovementType
    sourceDivisionId: number
    sourceDivisionName: string
    divisionId: number
    divisionName: string
  }>(`/api/admin/clubs/${slug}/movement`, {
    method: 'POST',
    body: JSON.stringify({ movementType }),
  })

export const setResult = (matchId: number, homeScore: number, awayScore: number) =>
  request<{ ok: true }>(`/api/admin/matches/${matchId}/result`, {
    method: 'POST',
    body: JSON.stringify({ homeScore, awayScore }),
  })

export const withdrawResult = (matchId: number) =>
  request<{ ok: true }>(`/api/admin/matches/${matchId}/result`, { method: 'DELETE' })

export const deleteMatch = (matchId: number) =>
  request<{ ok: true; matchId: number }>(`/api/admin/matches/${matchId}`, { method: 'DELETE' })

/** `shortCode` is camelCase on the wire, and null clears the code. */
export const updateClub = (
  slug: string,
  patch: { name?: string; shortCode?: string | null; status?: string },
) =>
  request<{ ok: true }>(`/api/admin/clubs/${slug}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

export const addPlayer = (slug: string, gamertag: string) =>
  request<{ ok: true; id: number }>(`/api/admin/clubs/${slug}/players`, {
    method: 'POST',
    body: JSON.stringify({ gamertag }),
  })

export const removePlayer = (slug: string, gamertag: string) =>
  request<{ ok: true }>(
    `/api/admin/clubs/${slug}/players/${encodeURIComponent(gamertag)}`,
    { method: 'DELETE' },
  )