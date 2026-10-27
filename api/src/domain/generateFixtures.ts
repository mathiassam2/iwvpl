import { pool, withTransaction } from '../db.js'

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

export interface GenerateFixturesOptions {
  seasonId: number
  divisionIds: number[]
  rounds: number
  preview?: boolean
  schedule?: GenerateScheduleConfig
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

export interface FixtureGenerateResult {
  created: number
  skipped: number
  missing: number
  scheduled: number
}

/** Oriented identity of one fixture: A at home to B. */
export function fixtureKey(home: number, away: number): string {
  return `${home}:${away}`
}

/** Order-independent identity of a pairing: "these two have met". */
export function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`
}

/**
 * Generate complete round-by-round pairings for a single round-robin using the circle method.
 * Each round contains matches where each team plays at most once.
 */
export function roundRobinRounds(clubIds: number[]): Array<Array<[number, number]>> {
  const teams = [...clubIds]
  if (teams.length % 2 !== 0) teams.push(0)
  const n = teams.length
  const roundCount = n - 1
  const rounds: Array<Array<[number, number]>> = []
  for (let r = 0; r < roundCount; r += 1) {
    const roundMatches: Array<[number, number]> = []
    for (let i = 0; i < n / 2; i += 1) {
      const home = teams[i]
      const away = teams[n - 1 - i]
      if (home === 0 || away === 0) continue
      if (i === 0 && r % 2 === 1) {
        roundMatches.push([away, home])
      } else {
        roundMatches.push([home, away])
      }
    }
    rounds.push(roundMatches)
    teams.splice(1, 0, teams.pop() as number)
  }
  return rounds
}

/** Backward-compatible alias that flattens roundRobinRounds. */
export function roundRobinLegs(clubIds: number[]): Array<[number, number]> {
  return roundRobinRounds(clubIds).flat()
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function getDayName(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return DAY_NAMES[dt.getUTCDay()] ?? ''
}

export function getMatchdayDates(startDateStr: string, matchDays: number[], count: number): string[] {
  if (count <= 0) return []
  const allowed = new Set(Array.isArray(matchDays) && matchDays.length > 0 ? matchDays : [5, 6])
  const dates: string[] = []
  const parts = startDateStr.split('-').map(Number)
  const y = parts[0] || 2026
  const m = parts[1] || 1
  const d = parts[2] || 1
  const current = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  let safety = 0
  while (dates.length < count && safety < 1000) {
    safety += 1
    const dayOfWeek = current.getUTCDay()
    if (allowed.has(dayOfWeek)) {
      const yr = current.getUTCFullYear()
      const mo = String(current.getUTCMonth() + 1).padStart(2, '0')
      const da = String(current.getUTCDate()).padStart(2, '0')
      dates.push(`${yr}-${mo}-${da}`)
    }
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

export function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = (timeStr || '20:00').split(':').map(Number)
  const total = (h || 0) * 60 + (m || 0) + minutes
  const finalH = Math.floor(total / 60) % 24
  const finalM = total % 60
  return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`
}

export function computeMatchKickoff(
  roundIdx: number,
  matchIdxInRound: number,
  dates: string[],
  schedule?: GenerateScheduleConfig | null,
): { kickoff: string | null; date: string | null; time: string | null } {
  if (!schedule || !schedule.autoSchedule) {
    return { kickoff: null, date: null, time: null }
  }
  const date = dates[roundIdx] || null
  if (!date) {
    return { kickoff: null, date: null, time: null }
  }

  const mode = schedule.timeMode || 'fixed'
  if (mode === 'unscheduled') {
    return { kickoff: null, date, time: null }
  }
  const concurrency = Math.max(0, Number(schedule.concurrentMatches) || 0)
  const slotIdx = concurrency > 0 ? Math.floor(matchIdxInRound / concurrency) : 0

  let time = '21:00'
  if (mode === 'fixed') {
    time = schedule.fixedTime && /^\d{2}:\d{2}$/.test(schedule.fixedTime) ? schedule.fixedTime : '21:00'
  } else if (mode === 'slots') {
    const slots =
      Array.isArray(schedule.timeSlots) && schedule.timeSlots.length > 0 ? schedule.timeSlots : ['21:00']
    time = slots[Math.min(slotIdx, slots.length - 1)]
  } else if (mode === 'interval') {
    const start = schedule.startTime && /^\d{2}:\d{2}$/.test(schedule.startTime) ? schedule.startTime : '20:00'
    const interval = Math.max(5, Number(schedule.intervalMinutes) || 45)
    time = addMinutesToTime(start, slotIdx * interval)
  }

  return {
    kickoff: `${date} ${time}:00`,
    date,
    time,
  }
}

/**
 * Previews round-robin fixtures without persisting to the database.
 */
export async function previewFixtures(options: GenerateFixturesOptions): Promise<FixturePreviewResult> {
  const { seasonId, divisionIds, rounds, schedule } = options

  const [existingRows] = await pool.query(
    `SELECT home_club_id, away_club_id
       FROM matches
      WHERE season_id = ?
        AND home_club_id IN (
          SELECT dc.club_id
            FROM division_clubs dc
            JOIN divisions d ON d.id = dc.division_id
           WHERE d.season_id = ? AND d.id IN (?)
        )`,
    [seasonId, seasonId, [divisionIds]],
  )

  const existingMatches = existingRows as Array<{ home_club_id: number; away_club_id: number }>
  const existingFixtures = new Set(existingMatches.map((m) => fixtureKey(m.home_club_id, m.away_club_id)))
  const metPairs = new Set(existingMatches.map((m) => pairKey(m.home_club_id, m.away_club_id)))

  const divisionPreviews: PreviewDivision[] = []
  let totalPlannedMatches = 0
  let totalNewMatches = 0
  let totalSkippedMatches = 0
  let maxRounds = 0

  for (const divisionId of divisionIds) {
    const [divRows] = await pool.query('SELECT id, name FROM divisions WHERE id = ?', [divisionId])
    const divRow = (divRows as Array<{ id: number; name: string }>)[0]
    const divisionName = divRow?.name ?? `Division ${divisionId}`

    const [clubRows] = await pool.query(
      `SELECT c.id, c.name, c.logo_url
         FROM division_clubs dc
         JOIN divisions d ON d.id = dc.division_id
         JOIN clubs c ON c.id = dc.club_id
        WHERE d.id = ? AND d.season_id = ?
        ORDER BY c.id`,
      [divisionId, seasonId],
    )
    const clubs = clubRows as Array<{ id: number; name: string; logo_url: string | null }>
    const clubMap = new Map(clubs.map((c) => [c.id, c]))
    const clubIds = clubs.map((c) => c.id)

    if (clubIds.length < 2) {
      divisionPreviews.push({
        divisionId,
        divisionName,
        totalRounds: 0,
        totalMatches: 0,
        newMatches: 0,
        skippedMatches: 0,
        rounds: [],
      })
      continue
    }

    const singleRounds = roundRobinRounds(clubIds)
    let divRounds: Array<Array<[number, number]>> = []
    if (rounds === 1) {
      divRounds = singleRounds
    } else {
      const returnRounds = singleRounds.map((rnd) => rnd.map(([a, b]) => [b, a] as [number, number]))
      divRounds = [...singleRounds, ...returnRounds]
    }

    if (divRounds.length > maxRounds) maxRounds = divRounds.length

    const matchDates =
      schedule?.autoSchedule && schedule?.startDate
        ? getMatchdayDates(schedule.startDate, schedule.matchDays ?? [5, 6], divRounds.length)
        : []

    let divNew = 0
    let divSkipped = 0
    let divTotal = 0

    const previewFixturesSet = new Set(existingFixtures)
    const previewPairsSet = new Set(metPairs)

    const roundsData: PreviewRound[] = divRounds.map((roundMatches, roundIdx) => {
      const isFirstLeg = roundIdx < singleRounds.length
      const roundDate = matchDates[roundIdx] || null
      const dayName = roundDate ? getDayName(roundDate) : null

      const matches: PreviewMatch[] = roundMatches.map((pair, matchIdx) => {
        const [homeId, awayId] = pair
        const homeClub = clubMap.get(homeId) ?? { id: homeId, name: `Club ${homeId}`, logo_url: null }
        const awayClub = clubMap.get(awayId) ?? { id: awayId, name: `Club ${awayId}`, logo_url: null }

        const exact = fixtureKey(homeId, awayId)
        const pairAlreadyPlayed = previewPairsSet.has(pairKey(homeId, awayId))
        const duplicate = previewFixturesSet.has(exact) || (isFirstLeg && pairAlreadyPlayed)

        const { kickoff, time } = computeMatchKickoff(roundIdx, matchIdx, matchDates, schedule)

        divTotal += 1
        if (duplicate) {
          divSkipped += 1
        } else {
          divNew += 1
          previewFixturesSet.add(exact)
          previewPairsSet.add(pairKey(homeId, awayId))
        }

        return {
          homeClubId: homeId,
          homeClubName: homeClub.name,
          homeClubLogo: homeClub.logo_url,
          awayClubId: awayId,
          awayClubName: awayClub.name,
          awayClubLogo: awayClub.logo_url,
          kickoff,
          time,
          isDuplicate: duplicate,
        }
      })

      return {
        roundNumber: roundIdx + 1,
        date: roundDate,
        dayName,
        matches,
      }
    })

    totalPlannedMatches += divTotal
    totalNewMatches += divNew
    totalSkippedMatches += divSkipped

    divisionPreviews.push({
      divisionId,
      divisionName,
      totalRounds: divRounds.length,
      totalMatches: divTotal,
      newMatches: divNew,
      skippedMatches: divSkipped,
      rounds: roundsData,
    })
  }

  return {
    preview: true,
    totalRounds: maxRounds,
    totalMatches: totalPlannedMatches,
    newMatches: totalNewMatches,
    skippedMatches: totalSkippedMatches,
    divisions: divisionPreviews,
  }
}

/**
 * Generates and commits round-robin fixtures inside a transaction.
 */
export async function executeGenerateFixtures(
  options: GenerateFixturesOptions,
): Promise<FixtureGenerateResult> {
  const { seasonId, divisionIds, rounds, schedule } = options

  return withTransaction(async (conn) => {
    const [existingMatches] = await conn.query(
      `SELECT home_club_id, away_club_id
         FROM matches
        WHERE season_id = ?
          AND home_club_id IN (
            SELECT dc.club_id
              FROM division_clubs dc
              JOIN divisions d ON d.id = dc.division_id
             WHERE d.season_id = ? AND d.id IN (?)
          )`,
      [seasonId, seasonId, [divisionIds]],
    )

    const existingFixtures = new Set(
      (existingMatches as Array<{ home_club_id: number; away_club_id: number }>).map((m) =>
        fixtureKey(m.home_club_id, m.away_club_id),
      ),
    )
    const metPairs = new Set(
      (existingMatches as Array<{ home_club_id: number; away_club_id: number }>).map((m) =>
        pairKey(m.home_club_id, m.away_club_id),
      ),
    )

    const created: number[] = []
    let skipped = 0
    let missing = 0
    let scheduledCount = 0

    for (const divisionId of divisionIds) {
      const [clubRows] = await conn.query(
        `SELECT c.id
           FROM division_clubs dc
           JOIN divisions d ON d.id = dc.division_id
           JOIN clubs c ON c.id = dc.club_id
          WHERE d.id = ? AND d.season_id = ?
          ORDER BY c.id`,
        [divisionId, seasonId],
      )
      const clubIds = (clubRows as Array<{ id: number }>).map((row) => row.id)

      if (clubIds.length < 2) {
        missing += 1
        continue
      }

      const singleRounds = roundRobinRounds(clubIds)
      let divRounds: Array<Array<[number, number]>> = []
      if (rounds === 1) {
        divRounds = singleRounds
      } else {
        const returnRounds = singleRounds.map((rnd) => rnd.map(([a, b]) => [b, a] as [number, number]))
        divRounds = [...singleRounds, ...returnRounds]
      }

      const matchDates =
        schedule?.autoSchedule && schedule?.startDate
          ? getMatchdayDates(schedule.startDate, schedule.matchDays ?? [5, 6], divRounds.length)
          : []

      for (let roundIdx = 0; roundIdx < divRounds.length; roundIdx += 1) {
        const roundMatches = divRounds[roundIdx]
        const isFirstLeg = roundIdx < singleRounds.length

        for (let matchIdx = 0; matchIdx < roundMatches.length; matchIdx += 1) {
          const [homeId, awayId] = roundMatches[matchIdx]
          const exact = fixtureKey(homeId, awayId)
          const pairAlreadyPlayed = metPairs.has(pairKey(homeId, awayId))
          const duplicate = existingFixtures.has(exact) || (isFirstLeg && pairAlreadyPlayed)
          if (duplicate) {
            skipped += 1
            continue
          }

          const { kickoff } = computeMatchKickoff(roundIdx, matchIdx, matchDates, schedule)

          await conn.execute(
            `INSERT INTO matches
               (division_id, season_id, home_club_id, away_club_id, kickoff, status,
                home_score, away_score, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NOW(), NOW())`,
            [
              divisionId,
              seasonId,
              homeId,
              awayId,
              kickoff,
              kickoff ? 'scheduled' : 'unscheduled',
            ],
          )
          if (kickoff) scheduledCount += 1
          existingFixtures.add(exact)
          metPairs.add(pairKey(homeId, awayId))
          created.push(0)
        }
      }
    }

    return { created: created.length, skipped, missing, scheduled: scheduledCount }
  })
}
