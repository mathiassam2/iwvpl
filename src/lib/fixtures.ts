/**
 * Deterministic placeholder squad, event and stat data.
 *
 * The crawl carries club names, results and standings but no squads and no
 * match events, so the club and match pages need generated content. It has to
 * be generated *deterministically*: the same club must always produce the same
 * eleven, otherwise React remounts (the hero typewriter, the carousel) would
 * reshuffle players mid-render and hydration would mismatch.
 *
 * Everything here is therefore seeded from the club or match key, never from
 * `Math.random`. Nothing in this file is a real statistic.
 */

/** FNV-1a. Stable across reloads, unlike a JS string hash. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 - small, fast, good enough for placeholder content. */
function rng(seed: string) {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))

/* ------------------------------------------------------------------ squads */

export interface PitchPlayer {
  number: number
  name: string
  /** Short position label shown under the name on the pitch. */
  role: string
  /** Percentages within the pitch box. */
  x: number
  y: number
  playerId?: number | null
}

export interface Squad {
  formation: string
  starters: PitchPlayer[]
  bench: { number: number; name: string; role: string; playerId?: number | null }[]
  manager: string
}

export interface ClubLineupSlot {
  slotIndex?: number
  position?: string
  role?: string
  x?: number
  y?: number
  playerId: number | null
  gamertag: string
  shirtNumber?: number
  number?: number
}

export interface ClubLineupBench {
  playerId: number | null
  gamertag: string
  shirtNumber?: number
  number?: number
  position?: string
  role?: string
}

export interface ClubLineup {
  formation: string
  starters: Array<ClubLineupSlot | null>
  bench: ClubLineupBench[]
  updatedAt?: string
}

/** x/y are percentages; y=100 is the goal the team defends. */
export const FORMATIONS: Record<string, { shape: string; slots: [role: string, x: number, y: number][] }> = {
  '4-3-3': {
    shape: '4-3-3',
    slots: [
      ['GK', 50, 91],
      ['LB', 12, 75],
      ['CB', 37, 80],
      ['CB', 63, 80],
      ['RB', 88, 75],
      ['CM', 25, 55],
      ['CM', 50, 48],
      ['CM', 75, 55],
      ['LW', 16, 22],
      ['ST', 50, 14],
      ['RW', 84, 22],
    ],
  },
  '4-2-3-1': {
    shape: '4-2-3-1',
    slots: [
      ['GK', 50, 91],
      ['LB', 12, 75],
      ['CB', 37, 80],
      ['CB', 63, 80],
      ['RB', 88, 75],
      ['CDM', 36, 61],
      ['CDM', 64, 61],
      ['LM', 17, 39],
      ['CAM', 50, 36],
      ['RM', 83, 39],
      ['ST', 50, 14],
    ],
  },
  '4-4-2': {
    shape: '4-4-2',
    slots: [
      ['GK', 50, 91],
      ['LB', 12, 75],
      ['CB', 37, 80],
      ['CB', 63, 80],
      ['RB', 88, 75],
      ['LM', 14, 50],
      ['CM', 38, 53],
      ['CM', 62, 53],
      ['RM', 86, 50],
      ['ST', 36, 16],
      ['ST', 64, 16],
    ],
  },
  '3-5-2': {
    shape: '3-5-2',
    slots: [
      ['GK', 50, 91],
      ['CB', 24, 78],
      ['CB', 50, 81],
      ['CB', 76, 78],
      ['LWB', 11, 54],
      ['CDM', 35, 58],
      ['CAM', 50, 42],
      ['CDM', 65, 58],
      ['RWB', 89, 54],
      ['ST', 36, 16],
      ['ST', 64, 16],
    ],
  },
  '4-1-2-1-2': {
    shape: '4-1-2-1-2',
    slots: [
      ['GK', 50, 91],
      ['LB', 12, 75],
      ['CB', 37, 80],
      ['CB', 63, 80],
      ['RB', 88, 75],
      ['CDM', 50, 63],
      ['LCM', 24, 48],
      ['RCM', 76, 48],
      ['CAM', 50, 34],
      ['ST', 36, 15],
      ['ST', 64, 15],
    ],
  },
  '3-4-3': {
    shape: '3-4-3',
    slots: [
      ['GK', 50, 91],
      ['CB', 24, 78],
      ['CB', 50, 81],
      ['CB', 76, 78],
      ['LM', 13, 52],
      ['CM', 38, 55],
      ['CM', 62, 55],
      ['RM', 87, 52],
      ['LW', 18, 22],
      ['ST', 50, 14],
      ['RW', 82, 22],
    ],
  },
  '5-3-2': {
    shape: '5-3-2',
    slots: [
      ['GK', 50, 91],
      ['LWB', 10, 70],
      ['CB', 30, 79],
      ['CB', 50, 82],
      ['CB', 70, 79],
      ['RWB', 90, 70],
      ['CM', 27, 52],
      ['CM', 50, 46],
      ['CM', 73, 52],
      ['ST', 36, 16],
      ['ST', 64, 16],
    ],
  },
}

export function buildSquadFromLineup(
  lineup: ClubLineup | null | undefined,
  managerName = 'Club Manager',
  roster?: Array<{ id?: number | null; name: string; shirtNumber: number | null }>,
): Squad | null {
  if (!lineup || !Array.isArray(lineup.starters)) return null
  const hasAnyStarter = lineup.starters.some((s) => Boolean(s?.gamertag?.trim()))
  if (!hasAnyStarter) return null

  const shapeKey = FORMATIONS[lineup.formation] ? lineup.formation : '4-3-3'
  const templateSlots = FORMATIONS[shapeKey].slots
  const rosterMap = roster
    ? new Map(roster.map((r) => [r.name.toLowerCase(), r.shirtNumber]))
    : null

  const starters: PitchPlayer[] = templateSlots.map(([defaultRole, defaultX, defaultY], idx) => {
    const saved = lineup.starters[idx]
    const liveNum = (saved?.gamertag && rosterMap?.get(saved.gamertag.toLowerCase())) ?? null
    return {
      number: liveNum ?? saved?.shirtNumber ?? saved?.number ?? idx + 1,
      name: saved?.gamertag?.trim() || '—',
      role: saved?.position || saved?.role || defaultRole,
      x: defaultX,
      y: defaultY,
      playerId: saved?.playerId ?? null,
    }
  })

  const bench = Array.isArray(lineup.bench)
    ? lineup.bench
        .filter((b) => Boolean(b?.gamertag?.trim()))
        .map((b, idx) => {
          const liveNum = (b?.gamertag && rosterMap?.get(b.gamertag.toLowerCase())) ?? null
          return {
            number: liveNum ?? b.shirtNumber ?? b.number ?? idx + 12,
            name: b.gamertag.trim(),
            role: b.position || b.role || 'SUB',
            playerId: b.playerId ?? null,
          }
        })
    : []

  return {
    formation: shapeKey,
    starters,
    bench,
    manager: managerName || 'Club Manager',
  }
}

const FIRST = [
  'Aiman', 'Danish', 'Faisal', 'Hafiz', 'Irvin', 'Johan', 'Kamal', 'Luqman',
  'Nadia', 'Prakash', 'Rafi', 'Syafiq', 'Tariq', 'Usman', 'Wei Jie', 'Xavier',
  'Yusof', 'Zulkifli', 'Andika', 'Bima', 'Chandra', 'Dimas', 'Eko', 'Fitri',
  'Gilang', 'Hendra', 'Irfan', 'Jalani', 'Krisna', 'Lukman',
]

const LAST = [
  'Hakim', 'Iskandar', 'Rahman', 'Salleh', 'Yusof', 'Zaki', 'Lim', 'Tan',
  'Wong', 'Ng', 'Omar', 'Faizal', 'Bakri', 'Hamid', 'Syafi', 'Razak',
  'Kumar', 'Nair', 'Prasad', 'Menon', 'Sari', 'Wijaya', 'Hartono', 'Susanto',
  'Lubis', 'Nasution', 'Simanjuntak', 'Halim', 'Rizal', 'Fikri',
]

const benchRoles = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD']

/** Shirt numbers 2..30 avoiding the eleven already taken. */
function squadNumbers(r: () => number): number[] {
  const used = new Set<number>([1])
  const pool = Array.from({ length: 29 }, (_, i) => i + 2)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = int(r, 0, i)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.filter((n) => !used.has(n)).slice(0, 17)
}

export function squadFor(key: string): Squad {
  const r = rng(`squad:${key}`)
  const keys = Object.keys(FORMATIONS)
  const shape = pick(r, keys)
  const { shape: formation, slots } = FORMATIONS[shape]

  const names = Array.from({ length: 22 }, () => `${pick(r, FIRST)} ${pick(r, LAST)}`)
  const numbers = squadNumbers(r)

  const starters: PitchPlayer[] = slots.map(([role, x, y], i) => ({
    number: i === 0 ? 1 : numbers[i - 1],
    name: names[i],
    role,
    x,
    y,
  }))

  const bench = Array.from({ length: 7 }, (_, i) => ({
    number: numbers[11 + i],
    name: names[11 + i],
    role: benchRoles[i],
  }))

  return { formation, starters, bench, manager: `${pick(r, FIRST)} ${pick(r, LAST)}` }
}

/* ------------------------------------------------------------------ events */

export interface MatchEvent {
  minute: number
  type: 'goal' | 'own goal' | 'yellow' | 'red' | 'sub'
  team: 'home' | 'away'
  /** Player name, or "player / player" for a substitution. */
  detail: string
  score: string
}

const SUBS = [
  'Tactical switch',
  'Fresh legs',
  'Impact substitute',
  'Chasing the game',
  'Time to settle',
  'Closing out the win',
]

/**
 * Builds a timeline whose goal count matches the real final score exactly.
 * The final `score` string on each row is recomputed as goals are applied, so
 * the last event always agrees with the scoreline in the header.
 */
export function eventsFor(match: {
  home: string
  away: string
  hs: string
  as: string
}, key: string): MatchEvent[] {
  const r = rng(`events:${key}`)
  const homeGoals = Number(match.hs)
  const awayGoals = Number(match.as)
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return []

  const home = squadFor(`home:${match.home}`)
  const away = squadFor(`away:${match.away}`)

  // Spread goals over the 90 (+ stoppage) without ever colliding exactly.
  const minutes = new Set<number>()
  const takeMinute = () => {
    let m = int(r, 2, 95)
    while (minutes.has(m)) m = m === 95 ? 2 : m + 1
    minutes.add(m)
    return m
  }

  const events: MatchEvent[] = []

  // Shuffle the goal sides so one team's goals are not grouped into a block.
  const bag: ('home' | 'away')[] = []
  for (let i = 0; i < homeGoals; i++) bag.push('home')
  for (let i = 0; i < awayGoals; i++) bag.push('away')
  for (let i = bag.length - 1; i > 0; i--) {
    const j = int(r, 0, i)
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }

  for (const side of bag) {
    const squad = side === 'home' ? home : away
    const scorer = squad.starters[int(r, 1, squad.starters.length - 1)] // never the GK
    events.push({
      minute: takeMinute(),
      type: 'goal',
      team: side,
      detail: scorer.name,
      score: '',
    })
  }

  // Discipline and substitutions give the timeline some shape beyond goals.
  const cards = int(r, 2, 5)
  for (let i = 0; i < cards; i++) {
    const side = r() > 0.5 ? 'home' : 'away'
    const squad = side === 'home' ? home : away
    events.push({
      minute: takeMinute(),
      type: r() > 0.88 ? 'red' : 'yellow',
      team: side,
      detail: squad.starters[int(r, 0, squad.starters.length - 1)].name,
      score: '',
    })
  }

  const subs = int(r, 0, 3)
  for (let i = 0; i < subs; i++) {
    const side = r() > 0.5 ? 'home' : 'away'
    const squad = side === 'home' ? home : away
    const off = squad.starters[int(r, 1, 10)]
    const on = squad.bench[int(r, 0, squad.bench.length - 1)]
    events.push({
      minute: takeMinute(),
      type: 'sub',
      team: side,
      detail: `${on.name} for ${off.name}`,
      score: '',
    })
  }

  events.sort((a, b) => a.minute - b.minute)

  // The running score has to be applied AFTER sorting. Assigning it while
  // building produced a timeline where a 6-2 chip could sit above an earlier
  // 3-2, because the goals were shuffled into minute order only at the end.
  let homeScore = 0
  let awayScore = 0
  for (const e of events) {
    if (e.type === 'goal') {
      if (e.team === 'home') homeScore++
      else awayScore++
    }
    e.score = `${homeScore} - ${awayScore}`
  }

  return events
}

/* ------------------------------------------------------------------- stats */

export interface MatchStats {
  possession: [number, number]
  shots: [number, number]
  onTarget: [number, number]
  corners: [number, number]
  fouls: [number, number]
  offsides: [number, number]
  passAccuracy: [number, number]
}

/**
 * Anchored to the real scoreline so the numbers cannot contradict it: the
 * team with more goals always has more shots on target.
 */
export function statsFor(
  match: { home: string; away: string; hs: string; as: string },
  key: string,
): MatchStats {
  const r = rng(`stats:${key}`)
  const hs = Number(match.hs)
  const as = Number(match.as)
  const homeEdge = hs >= as

  const possession: [number, number] = homeEdge ? [int(r, 51, 64), 0] : [int(r, 36, 49), 0]
  possession[1] = 100 - possession[0]

  const hOn = Math.max(1, hs) + int(r, 1, 4)
  const aOn = Math.max(1, as) + int(r, 1, 4)
  // Never invert the on-target count against the scoreline - the leader should
  // not have fewer on target than the side they beat.
  const onTarget: [number, number] =
    hs > as ? [Math.max(hOn, aOn + 1), aOn] : hs === as ? [hOn, aOn] : [hOn, Math.max(aOn, hOn + 1)]

  return {
    possession,
    shots: [onTarget[0] + int(r, 2, 7), onTarget[1] + int(r, 2, 7)],
    onTarget,
    corners: [int(r, 1, 9), int(r, 1, 9)],
    fouls: [int(r, 6, 16), int(r, 6, 16)],
    offsides: [int(r, 0, 5), int(r, 0, 5)],
    passAccuracy: [int(r, 74, 89), int(r, 72, 88)],
  }
}