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
      fetch(`https://proclubs.ea.com/api/fc/clubs/matches?clubIds=${cid}&platform=${platform}&matchType=leagueMatch`, { headers: EA_HEADERS }),
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
  const results: AutoMatchItem[] = []

  for (const club of clubs) {
    const rawName = club.name.trim()
    const candidates = await searchEaClubs(rawName)

    // Cleaned name search if no candidates (strip VFC, FC, ESPORTS)
    let extraCandidates: EaClubSearchResult[] = []
    if (candidates.length === 0) {
      const cleaned = rawName
        .replace(/\b(VFC|FC|ESPORTS|XI|CLUB)\b/gi, '')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
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

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const targetNorm = norm(rawName)

    let matchStatus: 'exact' | 'high' | 'multiple' | 'none' = 'none'
    let selectedCandidate: EaClubSearchResult | null = null

    // Exact match check
    const exact = allCandidates.find((c) => norm(c.name) === targetNorm)
    if (exact) {
      matchStatus = 'exact'
      selectedCandidate = exact
    } else if (allCandidates.length === 1) {
      matchStatus = 'high'
      selectedCandidate = allCandidates[0]
    } else if (allCandidates.length > 1) {
      const startsWith = allCandidates.find((c) => norm(c.name).startsWith(targetNorm) || targetNorm.startsWith(norm(c.name)))
      if (startsWith) {
        matchStatus = 'high'
        selectedCandidate = startsWith
      } else {
        matchStatus = 'multiple'
        selectedCandidate = allCandidates[0]
      }
    }

    results.push({
      clubId: club.id,
      clubName: club.name,
      clubSlug: club.slug,
      currentEaClubId: club.ea_club_id ?? null,
      currentEaClubName: club.ea_club_name ?? null,
      matchStatus,
      selectedCandidate,
      candidates: allCandidates,
    })
  }

  return results
}
