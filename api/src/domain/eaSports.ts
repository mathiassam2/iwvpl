/**
 * EA Sports FC Pro Clubs Integration Service.
 *
 * Connects directly to EA Sports FC Pro Clubs REST API endpoints to:
 * 1. Search clubs and retrieve club IDs / records.
 * 2. Fetch match histories (league & playoff matches) for linked clubs.
 * 3. Extract scores, timestamps, and individual player performance stats
 *    (gamertag, goals, assists, saves, clean sheets, ratings, MoM).
 */

const EA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.ea.com/',
}

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
  proName?: string
  pos: string
  platform?: string
  rating: number
  goals: number
  assists: number
  shots: number
  shotAccuracy?: number
  passes: number
  passAttempts?: number
  passAccuracy?: number
  dribbles?: number
  dribbleSuccessRate?: number
  tackles: number
  tackleAttempts?: number
  tackleSuccessRate?: number
  offsides?: number
  foulsCommitted?: number
  possessionWon?: number
  possessionLost?: number
  saves: number
  cleanSheet: boolean
  isMom: boolean
  yellowCards?: number
  redCards?: number
  minutesPlayed?: number
  distanceCovered?: number
  distanceSprinted?: number
}

export interface EaSuggestedTeamStats {
  shotsHome: number | null
  shotsAway: number | null
  passesHome: number | null
  passesAway: number | null
  passAccuracyHome: number | null
  passAccuracyAway: number | null
  tacklesHome: number | null
  tacklesAway: number | null
  tacklesWonHome: number | null
  tacklesWonAway: number | null
  savesHome: number | null
  savesAway: number | null
  redCardsHome: number | null
  redCardsAway: number | null
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
  suggestedTeamStats?: EaSuggestedTeamStats
  homePlayers: EaPlayerStatItem[]
  awayPlayers: EaPlayerStatItem[]
}

const searchCache = new Map<string, { timestamp: number; results: EaClubSearchResult[] }>()
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Search clubs by name directly via official EA Pro Clubs API endpoints,
 * with multi-tier fallback (All-Time Leaderboard -> Season Leaderboard -> Community Cache).
 */
export async function searchEaClubs(name: string, platform = 'common-gen5'): Promise<EaClubSearchResult[]> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length < 2) return []

  const cacheKey = `${platform}:${trimmed.toLowerCase()}`
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.results
  }

  const results: EaClubSearchResult[] = []
  const seen = new Set<string>()

  // 1. Primary: Direct official EA Sports FC Pro Clubs Leaderboard Search
  try {
    const url = `https://proclubs.ea.com/api/fc/allTimeLeaderboard/search?clubName=${encodeURIComponent(trimmed)}&platform=${platform}`
    const res = await fetch(url, { headers: EA_HEADERS })
    if (res.ok) {
      const data = (await res.json()) as any[]
      if (Array.isArray(data)) {
        for (const c of data) {
          const cid = String(c.clubId ?? c.clubInfo?.clubId ?? '')
          if (cid && !seen.has(cid)) {
            seen.add(cid)
            results.push({
              clubId: cid,
              name: c.clubName ?? c.clubInfo?.name ?? `Club #${cid}`,
              wins: Number(c.wins ?? 0),
              draws: Number(c.ties ?? c.draws ?? 0),
              losses: Number(c.losses ?? 0),
              matches: Number(c.gamesPlayed ?? 0),
            })
          }
        }
      }
    }
  } catch (err) {
    console.warn('Direct EA all-time search warning:', err)
  }

  // 2. Secondary fallback: Current season leaderboard search if no all-time results
  if (results.length === 0) {
    try {
      const url = `https://proclubs.ea.com/api/fc/currentSeasonLeaderboard/search?clubName=${encodeURIComponent(trimmed)}&platform=${platform}`
      const res = await fetch(url, { headers: EA_HEADERS })
      if (res.ok) {
        const data = (await res.json()) as any[]
        if (Array.isArray(data)) {
          for (const c of data) {
            const cid = String(c.clubId ?? c.clubInfo?.clubId ?? '')
            if (cid && !seen.has(cid)) {
              seen.add(cid)
              results.push({
                clubId: cid,
                name: c.clubName ?? c.clubInfo?.name ?? `Club #${cid}`,
                wins: Number(c.wins ?? 0),
                draws: Number(c.ties ?? c.draws ?? 0),
                losses: Number(c.losses ?? 0),
                matches: Number(c.gamesPlayed ?? 0),
              })
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 3. Tertiary fallback: Community indexed directory (fc.kedai.com.my)
  if (results.length === 0) {
    try {
      const url = `https://fc.kedai.com.my/api/public/club-check?name=${encodeURIComponent(trimmed)}`
      const res = await fetch(url, { headers: { 'User-Agent': EA_HEADERS['User-Agent'], Accept: 'application/json' } })
      if (res.ok) {
        const data = (await res.json()) as any

        if (Array.isArray(data.ea?.results)) {
          for (const c of data.ea.results) {
            const cid = String(c.clubId)
            if (!seen.has(cid)) {
              seen.add(cid)
              results.push({
                clubId: cid,
                name: c.name ?? 'Unknown Club',
                wins: Number(c.wins ?? 0),
                draws: Number(c.draws ?? 0),
                losses: Number(c.losses ?? 0),
              })
            }
          }
        }

        if (Array.isArray(data.found)) {
          for (const c of data.found) {
            const cid = String(c.clubId)
            if (!seen.has(cid)) {
              seen.add(cid)
              results.push({
                clubId: cid,
                name: c.name ?? 'Unknown Club',
                matches: Number(c.matches ?? 0),
                wins: Number(c.wins ?? 0),
                draws: Number(c.draws ?? 0),
                losses: Number(c.losses ?? 0),
              })
            }
          }
        }

        if (Array.isArray(data.near)) {
          for (const c of data.near) {
            const cid = String(c.clubId)
            if (!seen.has(cid)) {
              seen.add(cid)
              results.push({
                clubId: cid,
                name: c.name ?? 'Unknown Club',
                matches: Number(c.matches ?? 0),
              })
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Cache results
  if (results.length > 0) {
    searchCache.set(cacheKey, { timestamp: Date.now(), results })
  }

  return results
}

/**
 * Fetch raw matches from EA Pro Clubs for a given clubId (friendlies only).
 */
async function fetchMatchesForClub(
  clubId: string,
  matchType: 'friendlyMatch' = 'friendlyMatch',
  platform = 'common-gen5',
): Promise<any[]> {
  try {
    const url = `https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${clubId}&platform=${platform}&matchType=${matchType}`
    const res = await fetch(url, { headers: EA_HEADERS })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.error(`fetchMatchesForClub error (${clubId}, ${matchType}):`, err)
    return []
  }
}

function parsePlayersForClub(rawPlayers: any, conceded: number): EaPlayerStatItem[] {
  if (!rawPlayers || typeof rawPlayers !== 'object') return []
  const list = Array.isArray(rawPlayers) ? rawPlayers : (Object.values(rawPlayers) as any[])

  return list.map((p) => {
    const goals = Math.max(0, Number.parseInt(String(p.goals ?? 0), 10) || 0)
    const assists = Math.max(0, Number.parseInt(String(p.assists ?? 0), 10) || 0)
    const saves = Math.max(0, Number.parseInt(String(p.saves ?? 0), 10) || 0)
    const shots = Math.max(0, Number.parseInt(String(p.shots ?? 0), 10) || 0)
    const passes = Math.max(0, Number.parseInt(String(p.passesmade ?? 0), 10) || 0)
    const passAttempts = Math.max(passes, Number.parseInt(String(p.passattempts ?? passes), 10) || 0)
    const passAccuracy =
      passAttempts > 0 ? Math.min(100, Math.round((passes / passAttempts) * 100)) : undefined
    const tackles = Math.max(0, Number.parseInt(String(p.tacklesmade ?? 0), 10) || 0)
    const tackleAttempts = Math.max(tackles, Number.parseInt(String(p.tackleattempts ?? tackles), 10) || 0)
    const tackleSuccessRate =
      tackleAttempts > 0 ? Math.min(100, Math.round((tackles / tackleAttempts) * 100)) : undefined
    const rating = Math.max(0, Math.min(10, Number.parseFloat(String(p.rating ?? 0)) || 0))
    const isMom = String(p.mom) === '1' || p.mom === 1
    const rawSec = Number.parseInt(String(p.secondsPlayed ?? p.secondsplayed ?? p.gameTime ?? 0), 10) || 0
    const minutesPlayed = rawSec > 0 ? Math.min(120, Math.max(1, Math.round(rawSec / 60))) : 90
    const proName = p.vproname ? String(p.vproname).trim() : undefined

    const hasGkCs = String(p.cleansheetsgk) === '1' || p.cleansheetsgk === 1
    const hasDefCs = String(p.cleansheetsdef) === '1' || p.cleansheetsdef === 1
    const cleanSheet = conceded === 0 || hasGkCs || hasDefCs

    const numberOrUndefined = (...keys: string[]): number | undefined => {
      for (const key of keys) {
        const value = p[key]
        if (value === null || value === undefined || value === '') continue
        const parsed = Number.parseFloat(String(value))
        if (Number.isFinite(parsed)) return parsed
      }
      return undefined
    }

    return {
      gamertag: String(p.playername ?? p.name ?? '').trim(),
      proName,
      pos: String(p.pos ?? p.position ?? 'midfielder').toLowerCase(),
      platform: p.platform ? String(p.platform) : undefined,
      rating,
      goals,
      assists,
      shots,
      shotAccuracy: numberOrUndefined('shotaccuracy'),
      passes,
      passAttempts,
      passAccuracy,
      dribbles: numberOrUndefined('dribbles'),
      dribbleSuccessRate: numberOrUndefined('dribblesuccessrate', 'dribblesuccess'),
      tackles,
      tackleAttempts,
      tackleSuccessRate,
      offsides: numberOrUndefined('offsides'),
      foulsCommitted: numberOrUndefined('foulscommitted', 'fouls'),
      possessionWon: numberOrUndefined('possessionwon'),
      possessionLost: numberOrUndefined('possessionlost'),
      saves,
      cleanSheet,
      isMom,
      yellowCards: numberOrUndefined('yellowcards'),
      redCards: numberOrUndefined('redcards', 'red'),
      minutesPlayed,
      distanceCovered: numberOrUndefined('distancecovered'),
      distanceSprinted: numberOrUndefined('distancesprinted'),
    }
  })
}

function summarizeSideAggregates(players: EaPlayerStatItem[], rawAgg: any) {
  const shots =
    rawAgg?.shots != null
      ? Math.max(0, Number.parseInt(String(rawAgg.shots), 10) || 0)
      : players.reduce((acc, p) => acc + p.shots, 0)
  const passesMade =
    rawAgg?.passesmade != null
      ? Math.max(0, Number.parseInt(String(rawAgg.passesmade), 10) || 0)
      : players.reduce((acc, p) => acc + p.passes, 0)
  const passAttempts =
    rawAgg?.passattempts != null
      ? Math.max(passesMade, Number.parseInt(String(rawAgg.passattempts), 10) || 0)
      : players.reduce((acc, p) => acc + (p.passAttempts ?? p.passes), 0)
  const passAccuracy =
    passAttempts > 0 ? Math.min(100, Math.round((passesMade / passAttempts) * 100)) : null
  const tacklesWon =
    rawAgg?.tacklesmade != null
      ? Math.max(0, Number.parseInt(String(rawAgg.tacklesmade), 10) || 0)
      : players.reduce((acc, p) => acc + p.tackles, 0)
  const tackles =
    rawAgg?.tackleattempts != null
      ? Math.max(tacklesWon, Number.parseInt(String(rawAgg.tackleattempts), 10) || 0)
      : players.reduce((acc, p) => acc + (p.tackleAttempts ?? p.tackles), 0)
  const saves =
    rawAgg?.saves != null
      ? Math.max(0, Number.parseInt(String(rawAgg.saves), 10) || 0)
      : players.reduce((acc, p) => acc + p.saves, 0)
  const redCards =
    rawAgg?.redcards != null
      ? Math.max(0, Number.parseInt(String(rawAgg.redcards), 10) || 0)
      : players.reduce((acc, p) => acc + (p.redCards ?? 0), 0)

  return {
    shots,
    passes: passesMade,
    passAccuracy,
    tackles,
    tacklesWon,
    saves,
    redCards,
  }
}

/**
 * Retrieve candidate EA friendly matches for an IWVPL fixture between home and away clubs.
 */
export async function getCandidateMatchesForFixture(
  homeEaClubId: string | null | undefined,
  awayEaClubId: string | null | undefined,
  platform = 'common-gen5',
): Promise<EaMatchCandidate[]> {
  const homeId = homeEaClubId ? String(homeEaClubId).trim() : null
  const awayId = awayEaClubId ? String(awayEaClubId).trim() : null

  if (!homeId && !awayId) return []

  const queryClubIds = [homeId, awayId].filter((id): id is string => Boolean(id))

  const rawMatchesMap = new Map<string, any>()

  for (const cid of queryClubIds) {
    const friendlies = await fetchMatchesForClub(cid, 'friendlyMatch', platform)

    for (const m of friendlies) {
      if (m && m.matchId) {
        rawMatchesMap.set(String(m.matchId), m)
      }
    }
  }

  const allMatches = Array.from(rawMatchesMap.values())
  allMatches.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))

  const candidates: EaMatchCandidate[] = []

  for (const m of allMatches) {
    const clubsObj = m.clubs ?? {}
    const clubIds = Object.keys(clubsObj)
    if (clubIds.length < 2) continue

    const idA = clubIds[0]
    const idB = clubIds[1]
    const clubAData = clubsObj[idA] ?? {}
    const clubBData = clubsObj[idB] ?? {}

    const goalsA = Number.parseInt(String(clubAData.goals ?? 0), 10) || 0
    const goalsB = Number.parseInt(String(clubBData.goals ?? 0), 10) || 0

    const isDirectMatch =
      homeId !== null &&
      awayId !== null &&
      ((idA === homeId && idB === awayId) || (idA === awayId && idB === homeId))

    let suggestedHomeScore: number | null = null
    let suggestedAwayScore: number | null = null
    let homePlayers: EaPlayerStatItem[] = []
    let awayPlayers: EaPlayerStatItem[] = []
    let homeSideKey = idA
    let awaySideKey = idB

    const playersObj = m.players ?? {}
    const aggObj = m.aggregate ?? {}

    if (homeId && (idA === homeId || idB === homeId)) {
      if (idA === homeId) {
        suggestedHomeScore = goalsA
        homePlayers = parsePlayersForClub(playersObj[idA], goalsB)
        homeSideKey = idA
        awaySideKey = idB
      } else {
        suggestedHomeScore = goalsB
        homePlayers = parsePlayersForClub(playersObj[idB], goalsA)
        homeSideKey = idB
        awaySideKey = idA
      }
    }

    if (awayId && (idA === awayId || idB === awayId)) {
      if (idA === awayId) {
        suggestedAwayScore = goalsA
        awayPlayers = parsePlayersForClub(playersObj[idA], goalsB)
        awaySideKey = idA
        if (!homeId) homeSideKey = idB
      } else {
        suggestedAwayScore = goalsB
        awayPlayers = parsePlayersForClub(playersObj[idB], goalsA)
        awaySideKey = idB
        if (!homeId) homeSideKey = idA
      }
    }

    // If only one club was matched, or clubs were in neutral, map players according to clubA / clubB
    if (homePlayers.length === 0 && homeSideKey) {
      const conc = homeSideKey === idA ? goalsB : goalsA
      homePlayers = parsePlayersForClub(playersObj[homeSideKey], conc)
    }
    if (awayPlayers.length === 0 && awaySideKey) {
      const conc = awaySideKey === idA ? goalsB : goalsA
      awayPlayers = parsePlayersForClub(playersObj[awaySideKey], conc)
    }

    const homeAgg = summarizeSideAggregates(homePlayers, aggObj[homeSideKey])
    const awayAgg = summarizeSideAggregates(awayPlayers, aggObj[awaySideKey])

    const ts = Number(m.timestamp) || Math.floor(Date.now() / 1000)
    const dateFormatted = new Date(ts * 1000).toLocaleString('en-GB', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    candidates.push({
      matchId: String(m.matchId),
      timestamp: ts,
      dateFormatted,
      isDirectMatch,
      clubA: {
        id: idA,
        name: clubAData.details?.name ?? clubAData.name ?? `Club ${idA}`,
        goals: goalsA,
      },
      clubB: {
        id: idB,
        name: clubBData.details?.name ?? clubBData.name ?? `Club ${idB}`,
        goals: goalsB,
      },
      suggestedHomeScore,
      suggestedAwayScore,
      suggestedTeamStats: {
        shotsHome: homeAgg.shots,
        shotsAway: awayAgg.shots,
        passesHome: homeAgg.passes,
        passesAway: awayAgg.passes,
        passAccuracyHome: homeAgg.passAccuracy,
        passAccuracyAway: awayAgg.passAccuracy,
        tacklesHome: homeAgg.tackles,
        tacklesAway: awayAgg.tackles,
        tacklesWonHome: homeAgg.tacklesWon,
        tacklesWonAway: awayAgg.tacklesWon,
        savesHome: homeAgg.saves,
        savesAway: awayAgg.saves,
        redCardsHome: homeAgg.redCards,
        redCardsAway: awayAgg.redCards,
      },
      homePlayers,
      awayPlayers,
    })
  }

  // Sort: direct matches first, then newest timestamp
  candidates.sort((a, b) => {
    if (a.isDirectMatch && !b.isDirectMatch) return -1
    if (!a.isDirectMatch && b.isDirectMatch) return 1
    return b.timestamp - a.timestamp
  })

  return candidates
}

export interface EaTeamStatLine {
  possession: number | null
  shots: number | null
  shotsOnTarget: number | null
  passes: number | null
  passAttempts: number | null
  passAccuracy: number | null
  dribbleSuccess: number | null
  tackles: number | null
  tackleAttempts: number | null
  tackleSuccessRate: number | null
  interceptions: number | null
  saves: number | null
  fouls: number | null
  corners: number | null
  offsides: number | null
  freeKicks: number | null
  penalties: number | null
  yellowCards: number | null
  redCards: number | null
  xg: number | null
  ballRecoveryTime: number | null
}

export interface EaMatchSummary {
  matchId: string
  matchType: EaMatchType
  timestamp: number
  dateFormatted: string
  opponentId: string
  opponentName: string
  goalsFor: number
  goalsAgainst: number
  result: 'W' | 'D' | 'L'
  players: EaPlayerStatItem[]
  teamStats: EaTeamStatLine
  opponentTeamStats: EaTeamStatLine
}

export interface EaMatchRecordSummary {
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  cleanSheets: number
  form: string
  winRate: number
  avgGoalsFor: number
  avgGoalsAgainst: number
}

export interface EaClubFullProfile {
  clubId: string
  name: string
  platform: string
  fetchedAt: string
  cached: boolean
  stale: boolean
  stats: {
    gamesPlayed: number
    wins: number
    draws: number
    losses: number
    goalsFor: number
    goalsAgainst: number
    goalDifference: number
    skillRating: number
    bestDivision: string
    winStreak: number
    unbeatenStreak: number
    promotion: number
    relegation: number
  }
  roster: Array<{
    gamertag: string
    proName: string
    position: string
    overallRating: number
    gamesPlayed: number
    goals: number
    assists: number
    ratingAve: number
  }>
  matches: {
    league: EaMatchSummary[]
    friendly: EaMatchSummary[]
    playoff: EaMatchSummary[]
  }
  summaries: {
    league: EaMatchRecordSummary
    friendly: EaMatchRecordSummary
    playoff: EaMatchRecordSummary
    all: EaMatchRecordSummary
  }
  warnings: string[]
}

export type EaMatchType = 'leagueMatch' | 'friendlyMatch' | 'playoffMatch'

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number.parseFloat(String(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function parseInteger(value: unknown): number {
  const parsed = parseNumber(value)
  return parsed == null ? 0 : Math.max(0, Math.round(parsed))
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseNumber(value)
    if (parsed != null) return parsed
  }
  return null
}

function normaliseTeamStats(
  rawAgg: any,
  players: EaPlayerStatItem[],
): EaTeamStatLine {
  const agg = rawAgg && typeof rawAgg === 'object' ? rawAgg : {}
  const sum = (key: keyof EaPlayerStatItem) =>
    players.reduce((acc, player) => acc + (Number(player[key]) || 0), 0)

  const passes = firstNumber(agg.passesmade, agg.passes) ?? sum('passes')
  const passAttempts = Math.max(
    passes ?? 0,
    firstNumber(agg.passattempts) ?? players.reduce((acc, p) => acc + (p.passAttempts ?? p.passes), 0),
  )
  const tackles = firstNumber(agg.tacklesmade, agg.tackles) ?? sum('tackles')
  const tackleAttempts = Math.max(
    tackles ?? 0,
    firstNumber(agg.tackleattempts) ?? players.reduce((acc, p) => acc + (p.tackleAttempts ?? p.tackles), 0),
  )
  const passAccuracy =
    firstNumber(agg.passaccuracy) ??
    (passAttempts > 0 ? Math.round(((passes ?? 0) / passAttempts) * 100) : null)
  const tackleSuccessRate =
    firstNumber(agg.tacklesuccessrate) ??
    (tackleAttempts > 0 ? Math.round(((tackles ?? 0) / tackleAttempts) * 100) : null)

  return {
    possession: firstNumber(agg.possession, agg.ballpossession),
    shots: firstNumber(agg.shots, agg.shotsmade) ?? sum('shots'),
    shotsOnTarget: firstNumber(agg.shotsongoal, agg.shotsontarget, agg.ontarget),
    passes,
    passAttempts,
    passAccuracy,
    dribbleSuccess: firstNumber(agg.dribblesuccess, agg.dribblesuccessrate),
    tackles,
    tackleAttempts,
    tackleSuccessRate,
    interceptions: firstNumber(agg.interceptions),
    saves: firstNumber(agg.saves) ?? sum('saves'),
    fouls: firstNumber(agg.fouls),
    corners: firstNumber(agg.corners),
    offsides: firstNumber(agg.offsides),
    freeKicks: firstNumber(agg.freekicks),
    penalties: firstNumber(agg.penalties),
    yellowCards: firstNumber(agg.yellowcards) ?? sum('yellowCards'),
    redCards: firstNumber(agg.redcards) ?? sum('redCards'),
    xg: firstNumber(agg.xg, agg.expectedgoals),
    ballRecoveryTime: firstNumber(agg.ballrecoverytime),
  }
}

function clubEntries(raw: any): Array<[string, any]> {
  if (!raw || typeof raw !== 'object') return []
  if (Array.isArray(raw)) {
    return raw.map((entry, index) => [
      String(entry?.clubId ?? entry?.teamId ?? entry?.id ?? index),
      entry,
    ])
  }
  return Object.entries(raw)
}

function parseEaMatchList(rawMatches: any[], clubId: string, matchType: EaMatchType): EaMatchSummary[] {
  const cid = String(clubId)
  const summaries: EaMatchSummary[] = []

  for (const match of Array.isArray(rawMatches) ? rawMatches : []) {
    if (!match) continue
    const entries = clubEntries(match.clubs)
    if (entries.length === 0) continue

    const mine = entries.find(([id]) => id === cid)
    const opponent = entries.find(([id]) => id !== cid)
    if (!mine || !opponent) continue

    const [, myData] = mine
    const [opponentId, opponentData] = opponent
    const goalsFor = parseInteger(myData?.goals)
    const goalsAgainst = parseInteger(opponentData?.goals)
    const result: 'W' | 'D' | 'L' = goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L'

    const playersRaw = match.players?.[cid] ?? match.players?.[Number(cid)] ?? null
    const opponentPlayersRaw =
      match.players?.[opponentId] ?? match.players?.[Number(opponentId)] ?? null
    const players = parsePlayersForClub(playersRaw, goalsAgainst)
    const opponentPlayers = parsePlayersForClub(opponentPlayersRaw, goalsFor)

    const timestamp = Number(match.timestamp) || 0
    const dateFormatted = timestamp
      ? new Date(timestamp * 1000).toLocaleString('en-GB', {
          timeZone: 'UTC',
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : 'Unknown date'

    summaries.push({
      matchId: String(match.matchId ?? match.id ?? ''),
      matchType,
      timestamp,
      dateFormatted,
      opponentId,
      opponentName:
        opponentData?.details?.name ??
        opponentData?.name ??
        opponentData?.clubName ??
        `Club #${opponentId}`,
      goalsFor,
      goalsAgainst,
      result,
      players,
      teamStats: normaliseTeamStats(match.aggregate?.[cid], players),
      opponentTeamStats: normaliseTeamStats(match.aggregate?.[opponentId], opponentPlayers),
    })
  }

  summaries.sort((a, b) => b.timestamp - a.timestamp)
  return summaries
}

function summarizeMatchList(matches: EaMatchSummary[]): EaMatchRecordSummary {
  const played = matches.length
  const wins = matches.filter((match) => match.result === 'W').length
  const draws = matches.filter((match) => match.result === 'D').length
  const losses = matches.filter((match) => match.result === 'L').length
  const goalsFor = matches.reduce((acc, match) => acc + match.goalsFor, 0)
  const goalsAgainst = matches.reduce((acc, match) => acc + match.goalsAgainst, 0)
  const cleanSheets = matches.filter((match) => match.goalsAgainst === 0).length

  return {
    played,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    cleanSheets,
    form: matches
      .slice(0, 5)
      .map((match) => match.result)
      .reverse()
      .join(''),
    winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
    avgGoalsFor: played > 0 ? Math.round((goalsFor / played) * 10) / 10 : 0,
    avgGoalsAgainst: played > 0 ? Math.round((goalsAgainst / played) * 10) / 10 : 0,
  }
}

const fullProfileCache = new Map<string, { timestamp: number; data: EaClubFullProfile }>()
const FULL_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000

interface EaFetchResult {
  data: any
  error: string | null
}

async function fetchEaJson(url: string): Promise<EaFetchResult> {
  try {
    const res = await fetch(url, { headers: EA_HEADERS })
    if (!res.ok) return { data: null, error: `EA responded ${res.status}` }
    return { data: await res.json(), error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'EA request failed' }
  }
}

/**
 * Fetch the complete EA Pro Clubs picture for a club: overall record, roster,
 * and every league / friendly / playoff match with player box scores.
 *
 * Responses are cached for five minutes because one dossier open costs five
 * upstream calls, and EA rate-limits. A refresh bypasses the cache; if EA is
 * unreachable the last good snapshot is returned and flagged as stale rather
 * than replacing a usable screen with an error.
 */
export async function fetchEaClubFullProfile(
  clubId: string,
  platform = 'common-gen5',
  options: { refresh?: boolean } = {},
): Promise<EaClubFullProfile> {
  const cid = String(clubId).trim()
  if (!cid) throw new Error('A club id is required.')

  const cacheKey = `${platform}:${cid}`
  const cached = fullProfileCache.get(cacheKey)
  const now = Date.now()

  if (cached && !options.refresh && now - cached.timestamp < FULL_PROFILE_CACHE_TTL_MS) {
    return { ...cached.data, cached: true, stale: false }
  }

  const base = 'https://proclubs.ea.com/api/fc'
  const query = `clubId=${encodeURIComponent(cid)}&platform=${encodeURIComponent(platform)}`
  const matchesQuery = `clubIds=${encodeURIComponent(cid)}&platform=${encodeURIComponent(platform)}`

  const [statsResult, membersResult, leagueResult, friendlyResult, playoffResult] =
    await Promise.all([
      fetchEaJson(`${base}/clubs/overallStats?clubIds=${encodeURIComponent(cid)}&platform=${encodeURIComponent(platform)}`),
      fetchEaJson(`${base}/members/stats?${query}`),
      fetchEaJson(`${base}/clubs/matches?${matchesQuery}&matchType=leagueMatch`),
      fetchEaJson(`${base}/clubs/matches?${matchesQuery}&matchType=friendlyMatch`),
      fetchEaJson(`${base}/clubs/matches?${matchesQuery}&matchType=playoffMatch`),
    ])

  const warnings: string[] = []
  for (const [label, result] of [
    ['overall stats', statsResult],
    ['roster', membersResult],
    ['league matches', leagueResult],
    ['friendly matches', friendlyResult],
    ['playoff matches', playoffResult],
  ] as const) {
    if (result.error) warnings.push(`Could not load ${label}: ${result.error}`)
  }

  const statsRows = Array.isArray(statsResult.data) ? statsResult.data : []
  const statsRow =
    statsRows.find((row: any) => String(row?.clubId ?? row?.id ?? '') === cid) ?? statsRows[0] ?? {}

  const membersData = membersResult.data ?? {}
  const membersRows: any[] = Array.isArray(membersData?.members)
    ? membersData.members
    : Array.isArray(membersData)
      ? membersData
      : []

  const roster = membersRows.map((member) => ({
    gamertag: String(member.name ?? member.playername ?? '').trim(),
    proName: String(member.proName ?? '').trim(),
    position: String(member.favoritePosition ?? member.proPos ?? member.pos ?? 'Midfielder'),
    overallRating: parseInteger(member.proOverall ?? member.overallRating),
    gamesPlayed: parseInteger(member.gamesPlayed),
    goals: parseInteger(member.goals),
    assists: parseInteger(member.assists),
    ratingAve: parseNumber(member.ratingAve) ?? 0,
  }))

  const leagueMatches = parseEaMatchList(
    Array.isArray(leagueResult.data) ? leagueResult.data : [],
    cid,
    'leagueMatch',
  )
  const friendlyMatches = parseEaMatchList(
    Array.isArray(friendlyResult.data) ? friendlyResult.data : [],
    cid,
    'friendlyMatch',
  )
  const playoffMatches = parseEaMatchList(
    Array.isArray(playoffResult.data) ? playoffResult.data : [],
    cid,
    'playoffMatch',
  )

  const gamesPlayed = parseInteger(statsRow.gamesPlayed ?? statsRow.gamesplayed)
  const wins = parseInteger(statsRow.wins)
  const draws = parseInteger(statsRow.ties ?? statsRow.draws)
  const losses = parseInteger(statsRow.losses)
  const goalsFor = parseInteger(statsRow.goals)
  const goalsAgainst = parseInteger(statsRow.goalsAgainst ?? statsRow.goalsagainst)

  const name =
    String(
      statsRow.clubName ??
        statsRow.name ??
        membersData?.clubName ??
        membersData?.name ??
        leagueMatches[0]?.opponentName ??
        '',
    ).trim() || `Club #${cid}`

  const profile: EaClubFullProfile = {
    clubId: cid,
    name,
    platform,
    fetchedAt: new Date().toISOString(),
    cached: false,
    stale: false,
    stats: {
      gamesPlayed,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      skillRating: parseInteger(statsRow.skillRating),
      bestDivision: String(statsRow.bestDivision ?? 'Unranked'),
      winStreak: parseInteger(statsRow.wstreak),
      unbeatenStreak: parseInteger(statsRow.unbeatenstreak),
      promotion: parseInteger(statsRow.promotions),
      relegation: parseInteger(statsRow.relegations),
    },
    roster,
    matches: {
      league: leagueMatches,
      friendly: friendlyMatches,
      playoff: playoffMatches,
    },
    summaries: {
      league: summarizeMatchList(leagueMatches),
      friendly: summarizeMatchList(friendlyMatches),
      playoff: summarizeMatchList(playoffMatches),
      all: summarizeMatchList([...leagueMatches, ...friendlyMatches, ...playoffMatches]),
    },
    warnings,
  }

  const hasData =
    gamesPlayed > 0 ||
    roster.length > 0 ||
    leagueMatches.length > 0 ||
    friendlyMatches.length > 0 ||
    playoffMatches.length > 0

  if (hasData) {
    fullProfileCache.set(cacheKey, { timestamp: now, data: profile })
    return profile
  }

  if (cached) {
    return { ...cached.data, cached: true, stale: true }
  }

  if (warnings.length > 0) {
    throw new Error(warnings[0])
  }

  fullProfileCache.set(cacheKey, { timestamp: now, data: profile })
  return profile
}

export interface EaClubDeepProfile {
  clubId: string
  name: string
  stats: {
    gamesPlayed: number
    wins: number
    draws: number
    losses: number
    goalsFor: number
    goalsAgainst: number
    goalDifference: number
    skillRating: number
    bestDivision: string
    winStreak: number
    unbeatenStreak: number
  }
  roster: Array<{
    gamertag: string
    proName: string
    position: string
    overallRating: number
    gamesPlayed: number
    goals: number
    assists: number
    ratingAve: number
  }>
  recentMatches: Array<{
    matchId: string
    timestamp: number
    dateFormatted: string
    opponentName: string
    goalsFor: number
    goalsAgainst: number
    result: 'W' | 'D' | 'L'
  }>
}

export interface AutoMatchItem {
  clubId: number
  clubName: string
  clubSlug: string
  currentEaClubId: string | null
  currentEaClubName: string | null
  matchStatus: 'exact' | 'high' | 'multiple' | 'none'
  selectedCandidate: EaClubSearchResult | null
  candidates: EaClubSearchResult[]
}

/**
 * Fetch comprehensive deep profile for an EA Pro Clubs team.
 */
export async function fetchEaClubDeepProfile(
  clubId: string,
  platform = 'common-gen5',
): Promise<EaClubDeepProfile | null> {
  const cid = String(clubId).trim()
  if (!cid) return null

  try {
    const [statsRes, membersRes, matchesRes] = await Promise.all([
      fetch(`https://proclubs.ea.com/api/fc/clubs/overallStats?clubIds=${cid}&platform=${platform}`, { headers: EA_HEADERS }),
      fetch(`https://proclubs.ea.com/api/fc/members/stats?clubId=${cid}&platform=${platform}`, { headers: EA_HEADERS }),
      fetch(`https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${cid}&platform=${platform}&matchType=friendlyMatch`, { headers: EA_HEADERS }),
    ])

    const statsData = statsRes.ok ? ((await statsRes.json()) as any[]) : []
    const membersData = membersRes.ok ? ((await membersRes.json()) as any) : {}
    const matchesData = matchesRes.ok ? ((await matchesRes.json()) as any[]) : []

    const st = Array.isArray(statsData) && statsData.length > 0 ? statsData[0] : {}
    const gamesPlayed = Number(st.gamesPlayed ?? 0)
    const wins = Number(st.wins ?? 0)
    const draws = Number(st.ties ?? 0)
    const losses = Number(st.losses ?? 0)
    const goalsFor = Number(st.goals ?? 0)
    const goalsAgainst = Number(st.goalsAgainst ?? 0)
    const goalDifference = goalsFor - goalsAgainst
    const skillRating = Number(st.skillRating ?? 0)
    const bestDivision = String(st.bestDivision ?? 'Unranked')
    const winStreak = Number(st.wstreak ?? 0)
    const unbeatenStreak = Number(st.unbeatenstreak ?? 0)

    const rawMembers: any[] = Array.isArray(membersData.members) ? membersData.members : []
    const roster = rawMembers.map((m) => ({
      gamertag: String(m.name ?? '').trim(),
      proName: String(m.proName ?? '').trim(),
      position: String(m.favoritePosition ?? m.proPos ?? 'Midfielder'),
      overallRating: Number(m.proOverall ?? 0),
      gamesPlayed: Number(m.gamesPlayed ?? 0),
      goals: Number(m.goals ?? 0),
      assists: Number(m.assists ?? 0),
      ratingAve: Number.parseFloat(String(m.ratingAve ?? '0.0')) || 0,
    }))

    const rawMatches: any[] = Array.isArray(matchesData) ? matchesData : []
    const recentMatches = rawMatches.slice(0, 10).map((m) => {
      const clubsObj = m.clubs ?? {}
      const clubIds = Object.keys(clubsObj)
      const myData = clubsObj[cid] ?? {}
      const oppId = clubIds.find((id) => id !== cid) ?? ''
      const oppData = oppId ? clubsObj[oppId] ?? {} : {}

      const gf = Number(myData.goals ?? 0)
      const ga = Number(oppData.goals ?? 0)
      const resChar: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf === ga ? 'D' : 'L'
      const ts = Number(m.timestamp) || 0
      const dateFormatted = ts
        ? new Date(ts * 1000).toLocaleString('en-GB', {
            timeZone: 'UTC',
            dateStyle: 'short',
            timeStyle: 'short',
          })
        : 'Unknown Date'

      return {
        matchId: String(m.matchId),
        timestamp: ts,
        dateFormatted,
        opponentName: oppData.details?.name ?? oppData.name ?? `Club #${oppId}`,
        goalsFor: gf,
        goalsAgainst: ga,
        result: resChar,
      }
    })

    const clubName =
      recentMatches[0]?.opponentName && rawMatches[0]?.clubs?.[cid]?.details?.name
        ? rawMatches[0].clubs[cid].details.name
        : `Club #${cid}`

    return {
      clubId: cid,
      name: clubName,
      stats: {
        gamesPlayed,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDifference,
        skillRating,
        bestDivision,
        winStreak,
        unbeatenStreak,
      },
      roster,
      recentMatches,
    }
  } catch (err) {
    console.error(`fetchEaClubDeepProfile error for clubId ${cid}:`, err)
    return null
  }
}

function cleanClubName(name: string): string {
  return name
    .replace(/\b(VFC|FC|ESPORTS|E-SPORTS|ESPORT|XI|CLUB|UNITED|CITY)\b/gi, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Auto-match a list of IWVPL clubs against EA Pro Clubs directory.
 */
export async function autoMatchClubs(
  clubs: Array<{
    id: number
    name: string
    slug: string
    ea_club_id?: string | null
    ea_club_name?: string | null
  }>,
): Promise<AutoMatchItem[]> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const cleanNorm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(vfc|fc|esports|esport|xi|club|united|city|team)\b/g, '')
      .replace(/[^a-z0-9]/g, '')

  const matchSingleClub = async (club: {
    id: number
    name: string
    slug: string
    ea_club_id?: string | null
    ea_club_name?: string | null
  }): Promise<AutoMatchItem> => {
    const rawName = club.name.trim()
    const candidates = await searchEaClubs(rawName)

    // Cleaned name search if no candidates or single candidate doesn't match raw name
    let extraCandidates: EaClubSearchResult[] = []
    const cleaned = cleanClubName(rawName)
    if (candidates.length === 0 || (candidates.length === 1 && norm(candidates[0].name) !== norm(rawName))) {
      if (cleaned.length >= 3 && cleaned.toLowerCase() !== rawName.toLowerCase()) {
        extraCandidates = await searchEaClubs(cleaned)
      }
    }

    const allCandidates = [...candidates]
    for (const ec of extraCandidates) {
      if (!allCandidates.some((c) => c.clubId === ec.clubId)) {
        allCandidates.push(ec)
      }
    }

    const targetNorm = norm(rawName)
    const targetCleanNorm = cleanNorm(rawName)

    let matchStatus: 'exact' | 'high' | 'multiple' | 'none' = 'none'
    let selectedCandidate: EaClubSearchResult | null = null

    // 1. Exact match check
    const exact = allCandidates.find((c) => norm(c.name) === targetNorm)
    if (exact) {
      matchStatus = 'exact'
      selectedCandidate = exact
    } else {
      // 2. High confidence: clean name match
      const cleanExact = allCandidates.find(
        (c) => targetCleanNorm.length >= 3 && cleanNorm(c.name) === targetCleanNorm,
      )
      if (cleanExact) {
        matchStatus = 'high'
        selectedCandidate = cleanExact
      } else if (allCandidates.length === 1) {
        matchStatus = 'high'
        selectedCandidate = allCandidates[0]
      } else if (allCandidates.length > 1) {
        const startsWith = allCandidates.find(
          (c) =>
            norm(c.name).startsWith(targetNorm) ||
            targetNorm.startsWith(norm(c.name)) ||
            (targetCleanNorm.length >= 3 &&
              (cleanNorm(c.name).startsWith(targetCleanNorm) || targetCleanNorm.startsWith(cleanNorm(c.name)))),
        )
        if (startsWith) {
          matchStatus = 'high'
          selectedCandidate = startsWith
        } else {
          matchStatus = 'multiple'
          selectedCandidate = allCandidates[0]
        }
      }
    }

    return {
      clubId: club.id,
      clubName: club.name,
      clubSlug: club.slug,
      currentEaClubId: club.ea_club_id ?? null,
      currentEaClubName: club.ea_club_name ?? null,
      matchStatus,
      selectedCandidate,
      candidates: allCandidates,
    }
  }

  // Execute in batches of 4 to accelerate search
  const results: AutoMatchItem[] = []
  const batchSize = 4
  for (let i = 0; i < clubs.length; i += batchSize) {
    const chunk = clubs.slice(i, i + batchSize)
    const chunkResults = await Promise.all(chunk.map((c) => matchSingleClub(c)))
    results.push(...chunkResults)
  }

  return results
}
