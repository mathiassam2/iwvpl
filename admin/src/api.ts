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

const getCache = new Map<string, { data: unknown; ts: number }>()
const inFlightGets = new Map<string, Promise<unknown>>()
const CACHE_FRESH_MS = 20_000
const CACHE_REVALIDATE_MS = 3_500

export function invalidateAdminCache(): void {
  getCache.clear()
  inFlightGets.clear()
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET') {
    invalidateAdminCache()
    return fetchJson<T>(path, init)
  }

  const now = Date.now()
  const cached = getCache.get(path)
  if (cached && now - cached.ts < CACHE_FRESH_MS) {
    if (now - cached.ts > CACHE_REVALIDATE_MS && !inFlightGets.has(path)) {
      const bg = fetchJson<T>(path, init)
        .then((fresh) => {
          getCache.set(path, { data: fresh, ts: Date.now() })
          return fresh
        })
        .catch(() => cached.data as T)
        .finally(() => {
          inFlightGets.delete(path)
        })
      inFlightGets.set(path, bg)
    }
    return cached.data as T
  }

  const existing = inFlightGets.get(path)
  if (existing) {
    return existing as Promise<T>
  }

  const p = fetchJson<T>(path, init)
    .then((data) => {
      getCache.set(path, { data, ts: Date.now() })
      return data
    })
    .finally(() => {
      inFlightGets.delete(path)
    })

  inFlightGets.set(path, p)
  return p
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
  home_club_id?: number
  home_name: string
  home_slug: string
  home_code: string | null
  home_logo: string | null
  home_ea_club_id?: string | null
  home_ea_club_name?: string | null
  away_club_id?: number
  away_name: string
  away_slug: string
  away_code: string | null
  away_logo: string | null
  away_ea_club_id?: string | null
  away_ea_club_name?: string | null
  ea_match_id?: string | null
}

export interface Club {
  id: number
  name: string
  slug: string
  short_code: string | null
  flag: string | null
  ea_club_id?: string | null
  ea_club_name?: string | null
  logo_local: string | null
  logo_url: string | null
  status: string
  is_featured?: boolean | number
  /** Division currently entered in, null when unassigned. */
  division_id: number | null
  players: number
  manager_user_id?: number | null
  manager_email?: string | null
  manager_name?: string | null
}

export type FormatStatus = 'active' | 'inactive' | 'coming_soon'

export interface CompetitionFormat {
  id: number
  name: string
  tag: string
  description: string
  status: FormatStatus
  sort_order: number
}

export interface CompetitionFormatInput {
  name: string
  tag: string
  description: string
  status: FormatStatus
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
export interface GenerateScheduleConfig {
  autoSchedule?: boolean
  startDate?: string
  matchDays?: number[]
  timeMode?: 'fixed' | 'slots' | 'interval' | 'unscheduled'
  fixedTime?: string
  timeSlots?: string[]
  startTime?: string
  intervalMinutes?: number
  concurrentMatches?: number
}

export interface PreviewMatch {
  homeClubId: number
  homeClubName: string
  homeClubLogo: string | null
  awayClubId: number
  awayClubName: string
  awayClubLogo: string | null
  kickoff: string | null
  time: string | null
  isDuplicate: boolean
}

export interface PreviewRound {
  roundNumber: number
  date: string | null
  dayName: string | null
  matches: PreviewMatch[]
}

export interface PreviewDivision {
  divisionId: number
  divisionName: string
  totalRounds: number
  totalMatches: number
  newMatches: number
  skippedMatches: number
  rounds: PreviewRound[]
}

export interface FixturePreviewResult {
  preview: true
  totalRounds: number
  totalMatches: number
  newMatches: number
  skippedMatches: number
  divisions: PreviewDivision[]
}

export interface GenerateFixturesParams {
  seasonId?: number
  divisionIds: number[]
  rounds: number
  schedule?: GenerateScheduleConfig
}

export const previewFixtures = (params: GenerateFixturesParams) =>
  request<FixturePreviewResult>('/api/admin/matches/generate', {
    method: 'POST',
    body: JSON.stringify({ ...params, preview: true }),
  })

export const generateFixtures = (params: GenerateFixturesParams) =>
  request<{ created: number; skipped: number; missing: number; scheduled?: number }>(
    '/api/admin/matches/generate',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
  )

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
  short_code?: string | null
  flag?: string | null
  logo_local?: string | null
  logo_url?: string | null
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
  max_teams?: number | null
  /** False once an admin pauses the league. See `setDivisionActive`. */
  is_active: boolean | number
}

export interface AdminSeason {
  id: number
  name: string
  year: number
  is_current: boolean | number
  featured_division_id: number | null
}

/**
 * Every division in a season, paused ones included.
 *
 * The public route hides paused leagues, which is what the standings page
 * wants; the admin has to see them in order to switch them back on, so it asks
 * for them explicitly. Everything else in the admin filters them out again at
 * the point of use rather than here, because the Divisions tab is the one
 * place they belong.
 */
export const getDivisions = (seasonId?: number) =>
  request<{ divisions: Division[] }>(
    `/api/divisions?includeInactive=true${seasonId == null ? '' : `&seasonId=${seasonId}`}`,
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

export interface ResetSeasonOptions {
  confirmSeasonName: string
  deleteFixtures?: boolean
  resetStandings?: boolean
  resetPlayerStats?: boolean
}

export const resetSeason = (id: number, options: ResetSeasonOptions) =>
  request<{ ok: true; message: string }>('/api/admin/seasons/' + id + '/reset', {
    method: 'POST',
    body: JSON.stringify(options),
  })

export const createSeason = (name: string, year: number) =>
  request<{ season: AdminSeason; divisions: Array<Omit<Division, 'season'>> }>('/api/admin/seasons', {
    method: 'POST',
    body: JSON.stringify({ name, year }),
  })

/**
 * Pause a league or bring it back.
 *
 * A separate call from `updateDivision` on purpose: the toggle is a one-button
 * decision that must not depend on the edit form being open or correctly
 * filled in. The server refuses to pause the season's last active league, and
 * clears the homepage feature if the paused league was the one being featured.
 */
export const setDivisionActive = (id: number, isActive: boolean) =>
  request<{
    division: { id: number; is_active: boolean | number }
    season: AdminSeason | null
    featuredCleared: boolean
  }>(`/api/admin/divisions/${id}/active`, {
    method: 'PUT',
    body: JSON.stringify({ isActive }),
  })

/** `is_active` is read-only on the create/update body; use `setDivisionActive`. */
export type DivisionInput = Omit<Division, 'id' | 'slug' | 'season' | 'sort_order' | 'is_active'>

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

export interface AdminClubInput {
  name: string
  shortCode?: string | null
  flag?: string | null
  logoLocal?: string | null
  logoUrl?: string | null
  status?: 'active' | 'pending' | 'withdrawn'
  divisionId?: number | null
}

export const getAdminClubs = (seasonId?: number) =>
  request<{ clubs: Club[] }>(
    `/api/admin/clubs${seasonId == null ? '' : `?seasonId=${seasonId}`}`,
  ).then((r) => r.clubs)

export const createAdminClub = (input: AdminClubInput) =>
  request<{ club: Club }>('/api/admin/clubs', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.club)

export const deleteAdminClub = (slug: string) =>
  request<{ ok: true; id: number; slug: string }>(
    `/api/admin/clubs/${encodeURIComponent(slug)}`,
    { method: 'DELETE' },
  )

/** `shortCode` is camelCase on the wire, and null clears the code. */
export const updateClub = (
  slug: string,
  patch: {
    name?: string
    shortCode?: string | null
    flag?: string | null
    logoLocal?: string | null
    logoUrl?: string | null
    status?: string
    eaClubId?: string | null
    eaClubName?: string | null
  },
) =>
  request<{ ok: true }>(`/api/admin/clubs/${slug}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

export const assignClubManager = (slug: string, userId: number | null) =>
  request<{ ok: true; clubId: number }>(`/api/admin/clubs/${encodeURIComponent(slug)}/manager`, {
    method: 'PUT',
    body: JSON.stringify({ userId }),
  })

export interface ClubLineupSlot {
  position: string
  playerId: number | null
  gamertag: string
  shirtNumber: number
}

export interface ClubLineupBench {
  playerId: number | null
  gamertag: string
  shirtNumber: number
  position?: string
}

export interface ClubLineup {
  formation: string
  starters: Array<ClubLineupSlot | null>
  bench: ClubLineupBench[]
}

export const saveClubLineup = (slug: string, lineup: ClubLineup) =>
  request<{ ok: true; starting_xi: ClubLineup }>(`/api/admin/clubs/${encodeURIComponent(slug)}/lineup`, {
    method: 'PUT',
    body: JSON.stringify(lineup),
  })

export const addPlayer = (slug: string, gamertag: string, shirtNumber?: number | null) =>
  request<{ ok: true; id: number }>(`/api/admin/clubs/${slug}/players`, {
    method: 'POST',
    body: JSON.stringify({ gamertag, ...(shirtNumber === undefined ? {} : { shirtNumber }) }),
  })

export const removePlayer = (slug: string, gamertag: string) =>
  request<{ ok: true }>(
    `/api/admin/clubs/${slug}/players/${encodeURIComponent(gamertag)}`,
    { method: 'DELETE' },
  )

/* ----------------------------------------------------- homepage & formats */

export const getFormats = () =>
  request<{ formats: CompetitionFormat[] }>('/api/formats?includeInactive=true').then(
    (r) => r.formats,
  )

export const createFormat = (input: CompetitionFormatInput) =>
  request<{ format: CompetitionFormat }>('/api/admin/formats', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.format)

export const updateFormat = (id: number, input: CompetitionFormatInput) =>
  request<{ format: CompetitionFormat }>(`/api/admin/formats/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }).then((r) => r.format)

export const setFormatStatus = (id: number, status: FormatStatus) =>
  request<{ format: CompetitionFormat }>(`/api/admin/formats/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }).then((r) => r.format)

export const deleteFormat = (id: number) =>
  request<{ ok: true; id: number }>(`/api/admin/formats/${id}`, {
    method: 'DELETE',
  })

export const setFeaturedClubs = (slugs: string[]) =>
  request<{ ok: true; featuredSlugs: string[] }>('/api/admin/clubs/featured', {
    method: 'PUT',
    body: JSON.stringify({ slugs }),
  })

export interface HomepageRegion {
  id: number
  iso: string
  name: string
  flag: string
  art_url: string
  is_active: boolean | number
  sort_order: number
}

export interface HomepageRegionInput {
  iso?: string
  name?: string
  flag?: string
  artUrl?: string
  art_url?: string
  isActive?: boolean
  is_active?: boolean
}

export const getAdminRegions = () =>
  request<{ regions: HomepageRegion[] }>('/api/admin/regions').then((r) => r.regions)

export const createAdminRegion = (input: HomepageRegionInput) =>
  request<{ region: HomepageRegion }>('/api/admin/regions', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.region)

export const updateAdminRegion = (id: number, input: HomepageRegionInput) =>
  request<{ region: HomepageRegion }>(`/api/admin/regions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }).then((r) => r.region)

export const updateAdminRegionOrder = (regionIds: number[]) =>
  request<{ ok: true }>('/api/admin/regions/order', {
    method: 'PUT',
    body: JSON.stringify({ regionIds }),
  })

export const deleteAdminRegion = (id: number) =>
  request<{ ok: true; id: number }>(`/api/admin/regions/${id}`, {
    method: 'DELETE',
  })

/* ------------------------------------------- registered managers & players */

export type UserRole = 'player' | 'club_manager' | 'admin' | 'owner'

export interface AdminUser {
  id: number
  email: string
  display_name: string | null
  role: UserRole
  club_id: number | null
  club_name: string | null
  club_slug: string | null
  player_id: number | null
  gamertag: string | null
  player_slug: string | null
  is_active: boolean | number
  created_at: string
}

export interface AdminUserInput {
  email: string
  password?: string
  displayName?: string | null
  role: UserRole
  clubId?: number | null
  gamertag?: string | null
  isActive?: boolean
}

export interface AdminPlayer {
  id: number
  gamertag: string
  slug: string
  shirt_number: number | null
  club_id: number | null
  club_name: string | null
  club_slug: string | null
  club_code: string | null
  is_free_agent: boolean | number
  user_id: number | null
  user_email: string | null
  user_name: string | null
  created_at: string
}

export interface AdminPlayerInput {
  gamertag: string
  clubId: number | null
  shirtNumber?: number | null
}

export const getAdminUsers = () =>
  request<{ users: AdminUser[] }>('/api/admin/users').then((r) => r.users)

export const createAdminUser = (input: AdminUserInput) =>
  request<{ user: AdminUser }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.user)

export const updateAdminUser = (id: number, input: AdminUserInput) =>
  request<{ user: AdminUser }>(`/api/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }).then((r) => r.user)

export const deleteAdminUser = (id: number) =>
  request<{ ok: true; id: number }>(`/api/admin/users/${id}`, {
    method: 'DELETE',
  })

export const getAdminPlayers = () =>
  request<{ players: AdminPlayer[] }>('/api/admin/players').then((r) => r.players)

export const createAdminPlayer = (input: AdminPlayerInput) =>
  request<{ player: AdminPlayer }>('/api/admin/players', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.player)

export const updateAdminPlayer = (id: number, input: AdminPlayerInput) =>
  request<{ player: AdminPlayer }>(`/api/admin/players/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }).then((r) => r.player)

export const deleteAdminPlayer = (id: number) =>
  request<{ ok: true; id: number }>(`/api/admin/players/${id}`, {
    method: 'DELETE',
  })

export interface ClubDetailResponse {
  id: number
  name: string
  slug: string
  short_code: string | null
  flag: string | null
  logo_url: string | null
  logo_local: string | null
  status: string
  starting_xi?: ClubLineup | null
  manager_name?: string | null
  division: { id: number; name: string; slug: string } | null
  players: Array<{
    id: number
    gamertag: string
    slug: string
    shirt_number: number | null
    avatar_local: string | null
    is_free_agent: number | boolean
  }>
}

export const getClubDetail = (slug: string) =>
  request<ClubDetailResponse>(`/api/clubs/${encodeURIComponent(slug)}`)

/* ----------------------------------------------------- website content cms */

export interface CmsSocialLink {
  label: string
  href: string
}

export interface CmsSiteMeta {
  name: string
  shortName: string
  tagline: string
  subtitle: string
  description: string
  url: string
  email: string
  base: string
  copyright: string
  disclaimer: string
  social: CmsSocialLink[]
  season: string
  registrationFee: string
  teamCap: number
  teamsRegistered: number
}

export interface CmsFaqItem {
  q: string
  a: string
}

export interface CmsAboutData {
  intro: string
  vision: string
  faq: CmsFaqItem[]
}

export interface CmsProduct {
  slug: string
  name: string
  kicker: string
  price: string
  image: string
  summary: string
  validFor: string
  access: string
  features: string
  note: string
}

export interface CmsNewsPost {
  id: number
  slug: string
  title: string
  date: string
  categories: string[]
  tags: string[]
  excerpt: string
  body: string
  images: string[]
  featured: string
  featuredLocal: string
}

export interface SiteContentData {
  site: CmsSiteMeta
  about: CmsAboutData
  products: CmsProduct[]
  news: CmsNewsPost[]
}

export type SiteSectionKey = 'site' | 'about' | 'products' | 'news'

export const getSiteContent = () =>
  request<SiteContentData>('/api/admin/site-content')

export const updateSiteContent = <K extends SiteSectionKey>(
  section: K,
  content: SiteContentData[K],
) =>
  request<{ ok: true; content: SiteContentData }>(`/api/admin/site-content/${section}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  }).then((r) => r.content)

/* ------------------------------------------------- leaderboards & player stats */

export interface AdminPlayerStat {
  id: number
  player_id: number
  season_id: number
  division_id: number
  goals: number
  assists: number
  saves: number
  clean_sheets: number
  appearances: number
  updated_at: string
  gamertag: string
  player_slug: string
  celebration_image: string | null
  avatar_local: string | null
  club_id: number | null
  club_name: string | null
  club_slug: string | null
  club_flag: string | null
  division_name: string | null
  division_slug: string | null
}

export interface AdminLeaderboardsData {
  seasons: Array<{ id: number; name: string; year: number; is_current: number }>
  seasonId: number | null
  divisions: Array<{ id: number; name: string; slug: string; sort_order: number }>
  stats: AdminPlayerStat[]
  players: Array<{
    id: number
    gamertag: string
    slug: string
    shirt_number: number | null
    celebration_image: string | null
    avatar_local: string | null
    club_id: number | null
    club_name: string | null
    club_slug: string | null
    club_flag: string | null
  }>
}

export const getAdminLeaderboards = (seasonId?: number) =>
  request<AdminLeaderboardsData>(
    `/api/admin/leaderboards${seasonId != null ? `?seasonId=${seasonId}` : ''}`,
  )

export const saveAdminPlayerStat = (data: {
  playerId: number
  seasonId?: number
  divisionId?: number | null
  goals: number
  assists: number
  saves: number
  cleanSheets?: number
  appearances?: number
}) =>
  request<{ ok: true; stats: AdminPlayerStat }>('/api/admin/leaderboards/stats', {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const updatePlayerCelebration = (playerId: number, celebrationImage: string | null) =>
  request<{ ok: true; playerId: number; celebrationImage: string | null }>(
    `/api/admin/players/${playerId}/celebration`,
    {
      method: 'PATCH',
      body: JSON.stringify({ celebrationImage }),
    },
  )

export const deleteAdminPlayerStat = (statId: number) =>
  request<{ ok: true; id: number }>(`/api/admin/leaderboards/stats/${statId}`, {
    method: 'DELETE',
  })




/* ----------------------------------------------------- ea fc pro clubs api */

export interface EaClubSearchResult {
  clubId: string
  name: string
  wins?: number
  draws?: number
  losses?: number
  matches?: number
}

export interface EaPlayerStatItem {
  gamertag: string
  pos: string
  rating: number
  goals: number
  assists: number
  shots: number
  passes: number
  tackles: number
  saves: number
  cleanSheet: boolean
  isMom: boolean
}

export interface EaMatchCandidate {
  matchId: string
  timestamp: number
  dateFormatted: string
  isDirectMatch: boolean
  clubA: {
    id: string
    name: string
    goals: number
  }
  clubB: {
    id: string
    name: string
    goals: number
  }
  suggestedHomeScore: number | null
  suggestedAwayScore: number | null
  homePlayers: EaPlayerStatItem[]
  awayPlayers: EaPlayerStatItem[]
}

export const searchEaClubs = (query: string) =>
  request<{ ok: true; clubs: EaClubSearchResult[] }>(
    `/api/admin/ea/clubs/search?q=${encodeURIComponent(query)}`,
  ).then((r) => r.clubs)

export const getMatchEaCandidates = (matchId: number) =>
  request<{
    ok: true
    matchId: number
    homeClub: { id: number; name: string; eaClubId: string | null; eaClubName: string | null }
    awayClub: { id: number; name: string; eaClubId: string | null; eaClubName: string | null }
    candidates: EaMatchCandidate[]
  }>(`/api/admin/matches/${matchId}/ea-candidates`)

export const applyEaMatchResult = (
  matchId: number,
  data: {
    homeScore: number
    awayScore: number
    eaMatchId?: string
    players: Array<{
      clubId: number
      gamertag: string
      pos?: string
      rating?: number
      goals: number
      assists: number
      shots?: number
      passes?: number
      tackles?: number
      saves: number
      cleanSheet: boolean
      isMom: boolean
    }>
  },
) =>
  request<{ ok: true; matchId: number; homeScore: number; awayScore: number }>(
    `/api/admin/matches/${matchId}/ea-result`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  )
