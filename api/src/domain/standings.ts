/**
 * Standings arithmetic.
 *
 * The `standings_snapshot` table is maintained incrementally: each submitted
 * result is applied on top of the crawled base state rather than recomputed
 * from scratch. That is not an optimisation, it is a correctness requirement —
 * see the comment on the table in 001_init.sql. The crawl holds 50 results
 * while the published table reflects 153, so a full recompute would report
 * every club on roughly 6 played.
 *
 * The consequence is that this module must be exactly reversible. Editing a
 * result means undoing its old contribution and applying the new one; if the
 * two are not symmetric the table drifts a little further wrong on every
 * correction, and nothing would ever reveal it.
 *
 * Pure functions only. The transaction and row locking live in the route that
 * calls them.
 */

export type Outcome = 'W' | 'D' | 'L'

export interface StandingRow {
  clubId: number
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  form: string
}

export interface Scoreline {
  homeClubId: number
  awayClubId: number
  homeScore: number
  awayScore: number
}

/** Points awarded, per the 3-1-0 system the crawled table already uses. */
const POINTS_FOR_WIN = 3
const POINTS_FOR_DRAW = 1

/** Matches retained in the form string. Matches the crawl, which shows five. */
export const FORM_LENGTH = 5

/**
 * Outcome for one side. Kept separate from the apply/undo pair below because
 * both directions need it and duplicating the comparison invites the two to
 * drift apart — which is precisely the bug this module exists to avoid.
 */
export function outcomeFor(side: 'home' | 'away', homeScore: number, awayScore: number): Outcome {
  if (side === 'home') return homeScore > awayScore ? 'W' : homeScore === awayScore ? 'D' : 'L'
  return awayScore > homeScore ? 'W' : homeScore === awayScore ? 'D' : 'L'
}

/** Goals scored and conceded by one side. */
function goalsFor(side: 'home' | 'away', s: Scoreline): [number, number] {
  return side === 'home' ? [s.homeScore, s.awayScore] : [s.awayScore, s.homeScore]
}

/** Append an outcome, keeping only the most recent FORM_LENGTH results. */
function pushForm(form: string, outcome: Outcome): string {
  return (form + outcome).slice(-FORM_LENGTH)
}

/** Drop the most recent outcome. The inverse of pushForm. */
function popForm(form: string): string {
  return form.length > 0 ? form.slice(0, -1) : ''
}

/**
 * Recompute the stored derived columns.
 *
 * goal_difference is stored rather than computed on read, so it has to be kept
 * in step here or the table slowly disagrees with itself. points is *not*
 * recomputed from won/drawn — it is accumulated, because that is the only way
 * to reverse it safely.
 */
function normalise(row: StandingRow): StandingRow {
  return { ...row, goalDifference: row.goalsFor - row.goalsAgainst }
}

/** Fold one side's result into a row. */
export function applyToRow(row: StandingRow, side: 'home' | 'away', s: Scoreline): StandingRow {
  const [scored, conceded] = goalsFor(side, s)
  const outcome = outcomeFor(side, s.homeScore, s.awayScore)

  const next: StandingRow = {
    ...row,
    played: row.played + 1,
    goalsFor: row.goalsFor + scored,
    goalsAgainst: row.goalsAgainst + conceded,
    form: pushForm(row.form, outcome),
  }

  if (outcome === 'W') {
    next.won += 1
    next.points += POINTS_FOR_WIN
  } else if (outcome === 'D') {
    next.drawn += 1
    next.points += POINTS_FOR_DRAW
  } else {
    next.lost += 1
  }

  return normalise(next)
}

/**
 * Undo one side's result.
 *
 * `expectedOutcome` is passed in rather than recomputed, because the caller has
 * the previous scoreline to hand and re-deriving it from the row would be
 * circular. It is validated against the row's own totals: if the row does not
 * look like it contains this result, something upstream has already gone wrong
 * and silently subtracting would corrupt the numbers further.
 */
export function undoFromRow(
  row: StandingRow,
  side: 'home' | 'away',
  s: Scoreline,
  expectedOutcome: Outcome,
): StandingRow {
  const actual = outcomeFor(side, s.homeScore, s.awayScore)
  if (actual !== expectedOutcome) {
    throw new Error(
      `Cannot undo a ${actual} from a row that does not contain one ` +
        `(expected ${expectedOutcome}).`,
    )
  }
  if (row.played < 1) {
    throw new Error(`Club ${row.clubId} has played 0 matches; cannot undo.`)
  }

  const [scored, conceded] = goalsFor(side, s)
  const next: StandingRow = {
    ...row,
    played: row.played - 1,
    goalsFor: row.goalsFor - scored,
    goalsAgainst: row.goalsAgainst - conceded,
    form: popForm(row.form),
  }

  if (actual === 'W') {
    next.won -= 1
    next.points -= POINTS_FOR_WIN
  } else if (actual === 'D') {
    next.drawn -= 1
    next.points -= POINTS_FOR_DRAW
  } else {
    next.lost -= 1
  }

  return normalise(next)
}

/**
 * Order for the table: points, then goal difference, then goals scored.
 *
 * Real leagues usually break a tie on head-to-head before goal difference. The
 * crawled table gives no way to tell which rule produced its ordering, so this
 * follows the common points/GD/GF convention and falls back to club name to
 * make the sort total. Without that last term two clubs level on every column
 * would swap places between requests.
 *
 * If head-to-head is ever confirmed as the tiebreak, add it here and nothing
 * else changes.
 */
export function compareRows(
  a: { points: number; goalDifference: number; goalsFor: number; name: string },
  b: { points: number; goalDifference: number; goalsFor: number; name: string },
): number {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.name.localeCompare(b.name)
  )
}

/**
 * Assign positions from a sorted list.
 *
 * Teams level on all of points, goal difference and goals scored share a
 * position, as in a real table, and the next position skips accordingly
 * (1, 1, 3). The crawled table cannot confirm this — it contains no ties — so
 * this is the conventional rule rather than an observed one.
 */
export function assignPositions<
  T extends { points: number; goalDifference: number; goalsFor: number },
>(sorted: T[]): Array<T & { position: number }> {
  const out: Array<T & { position: number }> = []

  sorted.forEach((row, i) => {
    // Compare against the previous *output* row, not the previous input, so
    // the shared position is already resolved and needs no cast.
    const previous = out[i - 1]
    const tied =
      previous !== undefined &&
      previous.points === row.points &&
      previous.goalDifference === row.goalDifference &&
      previous.goalsFor === row.goalsFor

    out.push({ ...row, position: tied ? previous.position : i + 1 })
  })

  return out
}