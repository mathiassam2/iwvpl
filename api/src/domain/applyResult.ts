/**
 * Transactional application of results to the standings snapshot.
 *
 * Wraps the pure arithmetic in standings.ts with row locking and ordering, so
 * a caller can say `setResult(match, 2, 1)` and have the table, both clubs'
 * form strings and every position in the division end up consistent.
 *
 * Every mutation runs inside one transaction with SELECT ... FOR UPDATE on the
 * affected rows. That matters more here than it would in an ordinary app: two
 * admins submitting results for the same division at the same time would
 * otherwise each read the same base row and one write would be lost, leaving
 * the table permanently short by one result.
 */

import type { PoolConnection } from 'mysql2/promise'
import { now, type Params } from '../db.js'
import {
  applyToRow,
  assignPositions,
  compareRows,
  outcomeFor,
  undoFromRow,
  type Scoreline,
  type StandingRow,
} from './standings.js'

interface DbStandingRow {
  id: number
  club_id: number
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
  name: string
}

const SELECT_LOCKED = `
  SELECT s.id, s.club_id, s.position, s.played, s.won, s.drawn, s.lost,
         s.goals_for, s.goals_against, s.goal_difference, s.points, s.form,
         c.name
    FROM standings_snapshot s
    JOIN clubs c ON c.id = s.club_id
   WHERE s.season_id = ? AND s.division_id = ?
   FOR UPDATE`

function toStanding(row: DbStandingRow): StandingRow {
  return {
    clubId: row.club_id,
    position: row.position,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goals_for,
    goalsAgainst: row.goals_against,
    goalDifference: row.goal_difference,
    points: row.points,
    form: row.form,
  }
}

async function loadDivision(conn: PoolConnection, seasonId: number, divisionId: number) {
  const [rows] = await conn.query(SELECT_LOCKED, [seasonId, divisionId])
  return (rows as DbStandingRow[]).map(toStanding)
}

async function writeRows(
  conn: PoolConnection,
  rows: StandingRow[],
  seasonId: number,
  divisionId: number,
): Promise<void> {
  const ts = now()
  for (const row of rows) {
    await conn.execute(
      `UPDATE standings_snapshot
          SET position = ?, played = ?, won = ?, drawn = ?, lost = ?,
              goals_for = ?, goals_against = ?, goal_difference = ?, points = ?,
              form = ?, updated_at = ?
        WHERE season_id = ? AND division_id = ? AND club_id = ?`,
      [
        row.position,
        row.played,
        row.won,
        row.drawn,
        row.lost,
        row.goalsFor,
        row.goalsAgainst,
        row.goalDifference,
        row.points,
        row.form,
        ts,
        seasonId,
        divisionId,
        row.clubId,
      ] as Params,
    )
  }
}

/** Every row in the division, re-sorted and renumbered. */
async function reposition(
  conn: PoolConnection,
  seasonId: number,
  divisionId: number,
  names: Map<number, string>,
): Promise<StandingRow[]> {
  const rows = await loadDivision(conn, seasonId, divisionId)
  const sorted = rows
    .map((r) => ({ ...r, name: names.get(r.clubId) ?? '' }))
    .sort(compareRows)
  const positioned = assignPositions(sorted)

  await writeRows(
    conn,
    positioned.map(({ position, ...row }) => ({ ...row, position })),
    seasonId,
    divisionId,
  )
  return positioned
}

/**
 * Reverse a previously applied result.
 *
 * `form` is the safety check: if the row's last character is not the outcome
 * this result should have produced, the two sides are out of step and undoing
 * would subtract from the wrong place.
 */
async function reverse(
  conn: PoolConnection,
  seasonId: number,
  divisionId: number,
  previous: Scoreline,
): Promise<void> {
  const rows = await loadDivision(conn, seasonId, divisionId)
  const byId = new Map(rows.map((r) => [r.clubId, r]))

  const home = byId.get(previous.homeClubId)
  const away = byId.get(previous.awayClubId)
  if (!home || !away) {
    throw new Error(
      `Match references a club with no standings row ` +
        `(home ${previous.homeClubId}, away ${previous.awayClubId}).`,
    )
  }

  const updated = [
    undoFromRow(home, 'home', previous, outcomeFor('home', previous.homeScore, previous.awayScore)),
    undoFromRow(away, 'away', previous, outcomeFor('away', previous.homeScore, previous.awayScore)),
  ]
  await writeRows(conn, updated, seasonId, divisionId)
}

/** Club names for the whole division, needed to break ties deterministically. */
async function divisionNames(
  conn: PoolConnection,
  divisionId: number,
): Promise<Map<number, string>> {
  const [rows] = await conn.query(
    `SELECT c.id, c.name
       FROM clubs c
       JOIN division_clubs dc ON dc.club_id = c.id
      WHERE dc.division_id = ?`,
    [divisionId],
  )
  return new Map((rows as Array<{ id: number; name: string }>).map((r) => [r.id, r.name]))
}

/** Apply one result on top of the current snapshot. */
async function forward(
  conn: PoolConnection,
  seasonId: number,
  divisionId: number,
  next: Scoreline,
): Promise<void> {
  const rows = await loadDivision(conn, seasonId, divisionId)
  const byId = new Map(rows.map((r) => [r.clubId, r]))

  const home = byId.get(next.homeClubId)
  const away = byId.get(next.awayClubId)
  if (!home || !away) {
    throw new Error(
      `Both clubs need a standings row before a result can be recorded ` +
        `(home ${next.homeClubId}, away ${next.awayClubId}).`,
    )
  }

  await writeRows(
    conn,
    [applyToRow(home, 'home', next), applyToRow(away, 'away', next)],
    seasonId,
    divisionId,
  )
}

/**
 * Record a result, keeping the snapshot consistent.
 *
 * `previous` is the scoreline already folded into the snapshot, or null if the
 * match was unplayed. Passing the wrong thing here is the one way to corrupt
 * the table, so the caller must derive it from the stored match rather than
 * from anything the client sent.
 */
export async function setResult(
  conn: PoolConnection,
  ids: { seasonId: number; divisionId: number },
  next: Scoreline,
  previous: Scoreline | null,
): Promise<void> {
  if (previous) await reverse(conn, ids.seasonId, ids.divisionId, previous)
  await forward(conn, ids.seasonId, ids.divisionId, next)
  await reposition(conn, ids.seasonId, ids.divisionId, await divisionNames(conn, ids.divisionId))
}

/** Remove a finished match from the snapshot. */
export async function clearResult(
  conn: PoolConnection,
  ids: { seasonId: number; divisionId: number },
  previous: Scoreline,
): Promise<void> {
  await reverse(conn, ids.seasonId, ids.divisionId, previous)
  await reposition(conn, ids.seasonId, ids.divisionId, await divisionNames(conn, ids.divisionId))
}
