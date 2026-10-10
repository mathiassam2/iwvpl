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
}

export interface Squad {
  formation: string
  starters: PitchPlayer[]
  bench: { number: number; name: string; role: string }[]
  manager: string
}

/** x/y are percentages; y=100 is the goal the team defends. */
const FORMATIONS: Record<string, { shape: string; slots: [role: string, x: number, y: number][] }> = {
  '4-3-3': {
    shape: '4-3-3',
    slots: [
      ['GK', 50, 91],
      ['LB', 11, 76],
      ['CB', 37, 80],
      ['CB', 63, 80],
      ['RB', 89, 76],
      ['CM', 25, 56],
      ['CM', 50, 49],
      ['CM', 75, 56],
      ['LW', 15, 22],
      ['ST', 50, 13],
      ['RW', 85, 22],
    ],
  },
  '4-2-3-1': {
    shape: '4-2-3-1',
    slots: [
      ['GK', 50, 91],
      ['LB', 11, 76],
      ['CB', 37, 80],
      ['CB', 63, 80],
      ['RB', 89, 76],
      ['CDM', 38, 62],
      ['CDM', 62, 62],
      ['LM', 17, 41],
      ['AM', 50, 37],
      ['RM', 83, 41],
      ['ST', 50, 13],
    ],
  },
  '3-5-2': {
    shape: '3-5-2',
    slots: [
      ['GK', 50, 91],
      ['CB', 25, 78],
      ['CB', 50, 82],
      ['CB', 75, 78],
      ['LWB', 9, 57],
      ['CM', 35, 56],
      ['CM', 50, 45],
      ['CM', 65, 56],
      ['RWB', 91, 57],
      ['ST', 36, 17],
      ['ST', 64, 17],
    ],
  },
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