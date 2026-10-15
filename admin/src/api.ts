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

/* ------------------------------------------------------------------ types */

export type RolloverDirection = 'promotion' | 'relegation'

/** A club as the rollover sees it: who it is, and where it finished. */
export interface RolloverClub {
  clubId: number
  clubName: string
  clubSlug: string
  position: number | null
  points: number | null
  goalDifference: number | null
}

/** One league's movement in one direction, whether it runs or is skipped. */
export interface RolloverLeg {
  type: RolloverDirection
  sourceDivisionId: number
  sourceDivisionName: string
  destinationDivisionId: number | null
  destinationDivisionName: string | null
  clubs: RolloverClub[]
  skipped: boolean
  skipReason: string | null
}

export interface RolloverDivisionPlan {
  id: number
  name: string
  sortOrder: number
  promotionCount: number | null
  relegationCount: number | null
  /** The league promotes but sets no relegation count, so one is assumed. */
  relegationInferred: boolean
  currentSize: number
  nextSize: number
  selected: boolean
  outgoing: RolloverClub[]
  incoming: RolloverClub[]
  table: Array<RolloverClub & { incoming: boolean }>
}

/**
 * What completing the season would do, as the server works it out.
 *
 * The wizard renders this rather than repeating the rules, so what the admin
 * approves on screen is the same calculation the commit runs.
 */
export interface RolloverPlan {
  seasonId: number
  seasonName: string
  seasonYear: number
  selectedDivisionIds: number[]
  legs: RolloverLeg[]
  divisions: RolloverDivisionPlan[]
  warnings: string[]
  blocks: string[]
  matchedResults: number
  outstandingFixtures: number
}

export interface RolloverResult {
  season: { id: number; name: string; year: number; is_current: number }
  divisions: Array<{ id: number; name: string; clubCount: number }>
  movements: Array<{
    type: RolloverDirection
    sourceDivisionName: string
    destinationDivisionName: string
    clubs: Array<{ clubId: number; clubName: string; position: number | null; points: number | null }>
  }>
  warnings: string[]
}

export interface RolloverRecord {
  sourceSeason: { id: number; name: string; year: number }
  season: { id: number; name: string; year: number }
  completedAt: string
  movements: Array<{
    type: RolloverDirection
    sourceDivisionName: string
    destinationDivisionName: string
    clubs: Array<{ clubId: number; clubName: string; position: number | null; points: number | null }>
  }>
  movedClubs: number
  /** False once the new season has fixtures or results of its own. */
  undoable: boolean
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
  /** Matches the current filter would return, for paging this list. */
  total: number
  /** Unfiltered totals, so the tab labels do not change as you switch views. */
  allTotal: number
  pendingTotal: number
  completedTotal: number
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

/**
 * The fixtures needing attention: undated, overdue, or today.
 *
 * Paged like the main list rather than returned whole. An admin laying out a
 * season can have hundreds of undated fixtures, and loading all of them to show
 * the first twenty is the thing this avoids. Search matches either club.
 */
export const getMatchPriorities = ({
  limit,
  offset,
  search,
}: {
  limit?: number
  offset?: number
  search?: string
}) => {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (offset != null) params.set('offset', String(offset))
  if (search) params.set('search', search)
  const query = params.toString()
  return request<{ matches: Match[]; total: number; limit: number; offset: number }>(
    `/api/matches/priorities${query ? `?${query}` : ''}`,
  )
}

/**
 * Delete several fixtures at once.
 *
 * All or nothing: the server refuses the whole set rather than removing part of
 * it, so there is no half-done state to reason about afterwards.
 */
export const deleteMatches = (matchIds: number[]) =>
  request<{ ok: true; deleted: number }>('/api/admin/matches/delete', {
    method: 'POST',
    body: JSON.stringify({ matchIds }),
  })

/**
 * Delete every fixture that has no kickoff date, across every season.
 *
 * The undo for laying a season out from scratch. Refuses outright if any of
 * them carries a result, rather than quietly taking a scoreline with it.
 */
export const deleteUnscheduledMatches = () =>
  request<{ ok: true; deleted: number }>('/api/admin/matches/unscheduled', {
    method: 'DELETE',
  })

export const getClubs = (seasonId?: number) =>
  request<{ clubs: Club[] }>(
    `/api/clubs${seasonId == null ? '' : `?seasonId=${seasonId}`}`,
  ).then((r) => r.clubs)

/**
 * Build a round-robin fixture list for whole leagues at once.
 *
 * Every fixture is written with no kickoff, so they land in Needs scheduling
 * for the admin to date. Pairs that already exist in that season are skipped
 * rather than duplicated.
 */
export const generateFixtures = ({
  seasonId,
  divisionIds,
  rounds,
}: {
  seasonId?: number
  divisionIds: number[]
  rounds: number
}) =>
  request<{ created: number; skipped: number; missing: number }>('/api/admin/matches/generate', {
    method: 'POST',
    body: JSON.stringify({ seasonId, divisionIds, rounds }),
  })

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

/**
 * The rollover that opened the current season, if there was one.
 *
 * Read from the server rather than remembered, so the undo button survives a
 * page reload.
 */
export const getSeasonRollover = () =>
  request<{ rollover: RolloverRecord | null }>('/api/admin/season-movements').then(
    (r) => r.rollover,
  )

/**
 * What completing the season would do, without doing it.
 *
 * Sent on every change to the league selection so the wizard always shows the
 * current answer rather than a stale one from when it was opened.
 */
export const previewSeasonRollover = (divisionIds: number[]) =>
  request<{ plan: RolloverPlan }>('/api/admin/seasons/complete/preview', {
    method: 'POST',
    body: JSON.stringify({ divisionIds }),
  }).then((r) => r.plan)

/**
 * End the season and open the next one.
 *
 * One call, so the movement and the new season land together or not at all.
 * `divisionSettings` carries the promotion and relegation counts edited in the
 * wizard; they configure the new season and do not change what moves now.
 */
export const completeSeason = ({
  divisionIds,
  name,
  year,
  divisionSettings,
}: {
  divisionIds: number[]
  name: string
  year: number
  divisionSettings: Record<number, { promotion_count: number | null; relegation_count: number | null }>
}) =>
  request<RolloverResult>('/api/admin/seasons/complete', {
    method: 'POST',
    body: JSON.stringify({ divisionIds, name, year, divisionSettings }),
  })

/**
 * Take a completed rollover back.
 *
 * Removes the season it opened and restores the one it closed. Refused once the
 * new season has fixtures or results in it.
 */
export const undoSeasonRollover = (seasonId: number) =>
  request<{
    season: { id: number; name: string; year: number }
    restoredSeason: { id: number; name: string; year: number }
    removedMovements: number
    removedNotifications: number
  }>('/api/admin/seasons/complete/undo', {
    method: 'POST',
    body: JSON.stringify({ seasonId }),
  })

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
 * A plain move. It never promotes or relegates anything: where a club ends the
 * season comes from its finishing position when the season is completed, so an
 * admin correcting a league mid-season cannot hand out a rung of the ladder by
 * accident.
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