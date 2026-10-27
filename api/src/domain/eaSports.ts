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

/**
 * Search clubs by name via EA Pro Clubs discovery endpoint.
 */
export async function searchEaClubs(name: string): Promise<EaClubSearchResult[]> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length < 2) return []

  try {
    const url = `https://fc.kedai.com.my/api/public/club-check?name=${encodeURIComponent(trimmed)}`
    const res = await fetch(url, { headers: { 'User-Agent': EA_HEADERS['User-Agent'], Accept: 'application/json' } })
    if (!res.ok) return []
    const data = (await res.json()) as any

    const results: EaClubSearchResult[] = []
    const seen = new Set<string>()

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

    return results
  } catch (err) {
    console.error('searchEaClubs error:', err)
    return []
  }
}

/**
 * Fetch raw matches from EA Pro Clubs for a given clubId.
 */
async function fetchMatchesForClub(
  clubId: string,
  matchType: 'leagueMatch' | 'playoffMatch',
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
  const list = Object.values(rawPlayers) as any[]

  return list.map((p) => {
    const goals = Math.max(0, Number.parseInt(String(p.goals ?? 0), 10) || 0)
    const assists = Math.max(0, Number.parseInt(String(p.assists ?? 0), 10) || 0)
    const saves = Math.max(0, Number.parseInt(String(p.saves ?? 0), 10) || 0)
    const shots = Math.max(0, Number.parseInt(String(p.shots ?? 0), 10) || 0)
    const passes = Math.max(0, Number.parseInt(String(p.passesmade ?? 0), 10) || 0)
    const tackles = Math.max(0, Number.parseInt(String(p.tacklesmade ?? 0), 10) || 0)
    const rating = Math.max(0, Math.min(10, Number.parseFloat(String(p.rating ?? 0)) || 0))
    const isMom = String(p.mom) === '1' || p.mom === 1

    const hasGkCs = String(p.cleansheetsgk) === '1' || p.cleansheetsgk === 1
    const hasDefCs = String(p.cleansheetsdef) === '1' || p.cleansheetsdef === 1
    const cleanSheet = conceded === 0 || hasGkCs || hasDefCs

    return {
      gamertag: String(p.playername ?? '').trim(),
      pos: String(p.pos ?? 'midfielder').toLowerCase(),
      rating,
      goals,
      assists,
      shots,
      passes,
      tackles,
      saves,
      cleanSheet,
      isMom,
    }
  })
}

/**
 * Retrieve candidate EA matches for an IWVPL fixture between home and away clubs.
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
    const [leagues, playoffs] = await Promise.all([
      fetchMatchesForClub(cid, 'leagueMatch', platform),
      fetchMatchesForClub(cid, 'playoffMatch', platform),
    ])

    for (const m of [...leagues, ...playoffs]) {
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

    const playersObj = m.players ?? {}

    if (homeId && (idA === homeId || idB === homeId)) {
      if (idA === homeId) {
        suggestedHomeScore = goalsA
        homePlayers = parsePlayersForClub(playersObj[idA], goalsB)
      } else {
        suggestedHomeScore = goalsB
        homePlayers = parsePlayersForClub(playersObj[idB], goalsA)
      }
    }

    if (awayId && (idA === awayId || idB === awayId)) {
      if (idA === awayId) {
        suggestedAwayScore = goalsA
        awayPlayers = parsePlayersForClub(playersObj[idA], goalsB)
      } else {
        suggestedAwayScore = goalsB
        awayPlayers = parsePlayersForClub(playersObj[idB], goalsA)
      }
    }

    // If only one club was matched, or clubs were in neutral, map players according to clubA / clubB
    if (homePlayers.length === 0 && idA) {
      homePlayers = parsePlayersForClub(playersObj[idA], goalsB)
    }
    if (awayPlayers.length === 0 && idB) {
      awayPlayers = parsePlayersForClub(playersObj[idB], goalsA)
    }

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
