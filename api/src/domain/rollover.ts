/**
 * End-of-season movement, and the season it opens.
 *
 * Movement happens once, when a season is completed. Nothing moves during the
 * season — the only per-club operation left is choosing which league a club is
 * in, which is a plain move and never a promotion or a relegation. Ending a
 * season is the only moment where "this club finished second" turns into "this
 * club is in the league above", so it is the only moment that does it.
 *
 * The admin picks the divisions that take part. Two divisions exchange clubs
 * only when both of them are part of the rollover, and which direction a club
 * travels comes from the ladder: the division directly above is where it is
 * promoted to, the one directly below is where it is relegated to.
 *
 * A movement whose destination was not picked is skipped rather than refused.
 * A ladder is not obliged to turn over as a whole, and skipping one leg is how
 * a division ends the season bigger than it started. That is a legitimate
 * outcome, so it is reported rather than treated as a mistake.
 *
 * The finished season is not rewritten. Its standings and results stay exactly
 * as they were played, and clubs move into the new season instead, so the
 * archive reads the way the season actually happened.
 */

import { pool, type Params } from '../db.js'

/** The two directions a division can send clubs. */
export type RolloverDirection = 'promotion' | 'relegation'

type DivisionRow = {
  id: number
  name: string
  slug: string
  sort_order: number
  promotion_count: number | null
  relegation_count: number | null
  is_active: number
}

type ClubRow = {
  club_id: number
  club_name: string
  club_slug: string
  position: number | null
  points: number | null
  goal_difference: number | null
}

export type RolloverClub = {
  clubId: number
  clubName: string
  clubSlug: string
  position: number | null
  points: number | null
  goalDifference: number | null
}

/** One division's movement in one direction, whether it runs or is skipped. */
export type RolloverLeg = {
  type: RolloverDirection
  sourceDivisionId: number
  sourceDivisionName: string
  destinationDivisionId: number | null
  destinationDivisionName: string | null
  clubs: RolloverClub[]
  skipped: boolean
  skipReason: string | null
}

/** How a division ends up, and what it looks like afterwards. */
export type RolloverDivisionPlan = {
  id: number
  name: string
  sortOrder: number
  promotionCount: number | null
  relegationCount: number | null
  /**
   * True when the division sets no relegation count but promotes, and so is
   * treated as sending one club down. Surfaced because a relegation the admin
   * did not ask for is worth showing them before it happens.
   */
  relegationInferred: boolean
  currentSize: number
  nextSize: number
  selected: boolean
  outgoing: RolloverClub[]
  incoming: RolloverClub[]
  table: Array<RolloverClub & { incoming: boolean }>
}

export type RolloverPlan = {
  seasonId: number
  seasonName: string
  seasonYear: number
  selectedDivisionIds: number[]
  legs: RolloverLeg[]
  divisions: RolloverDivisionPlan[]
  /** Worth saying, but the rollover goes ahead. */
  warnings: string[]
  /** Refusing conditions. Any of these and nothing is written. */
  blocks: string[]
  matchedResults: number
  outstandingFixtures: number
}

export type RolloverContext = {
  season: { id: number; name: string; year: number; featuredDivisionId: number | null }
  divisions: Array<Omit<DivisionRow, keyof ClubRow> & { clubs: RolloverClub[] }>
}

export type SeasonFixtureStats = { matchedResults: number; outstandingFixtures: number }

/** A new division's movement settings, as edited in the rollover wizard. */
export type RolloverSetting = { promotionCount: number | null; relegationCount: number | null }

type Runner = {
  query(sql: string, params?: Params): Promise<any>
  execute(sql: string, params?: Params): Promise<any>
}

/** Reads outside a transaction. Anything that writes runs on a transaction. */
const poolRunner: Runner = {
  query: (sql, params = []) => pool.query(sql, params),
  execute: (sql, params = []) => pool.execute(sql, params),
}

async function rows<T>(runner: Runner, sql: string, params: Params = []): Promise<T[]> {
  const [result] = await runner.query(sql, params)
  return (result as T[])
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ')
}

/**
 * How many clubs a division sends up or down.
 *
 * A division configured to promote but not to relegate still sends one club
 * down: a tier that never loses anyone cannot have a relegation zone on the
 * standings table, and the slot would otherwise sit unused forever. A count of
 * zero is stored as NULL, so "greater than zero" here means "configured at all".
 *
 * `parseMovementCount` in the admin routes is what turns a 0 into a NULL, and
 * the wizard shows the inferred number rather than applying it silently.
 */
export function movementQuota(
  division: { promotion_count?: number | null; relegation_count?: number | null },
  type: RolloverDirection,
): number {
  if (type === 'promotion') return division.promotion_count ?? 0
  const configured = division.relegation_count ?? 0
  if (configured > 0) return configured
  return (division.promotion_count ?? 0) > 0 ? 1 : 0
}

/* -------------------------------------------------------------------- read */

/**
 * The current season, its ladder, and each division's clubs in finishing order.
 *
 * A club is read through its most recent `division_clubs` row for the season, so
 * a league change made during the season is reflected here. Positions come from
 * `standings_snapshot` and may be NULL for a club that has never had one.
 */
export async function loadRolloverContext(
  runner: Runner = poolRunner,
  options: { lock?: boolean } = {},
): Promise<RolloverContext | null> {
  const lock = options.lock ? ' FOR UPDATE' : ''

  const [season] = await rows<{
    id: number
    name: string
    year: number
    featured_division_id: number | null
  }>(runner, `SELECT id, name, year, featured_division_id FROM seasons WHERE is_current = TRUE LIMIT 1${lock}`)
  if (!season) return null

  const divisions = await rows<DivisionRow>(
    runner,
    `SELECT d.id, d.name, d.slug, d.sort_order, d.promotion_count, d.relegation_count,
            d.is_active
       FROM divisions d
      WHERE d.season_id = ?
      ORDER BY d.sort_order, d.id${lock}`,
    [season.id],
  )

  const clubs = await rows<ClubRow & { division_id: number }>(
    runner,
    `SELECT dc.division_id, dc.club_id, c.name AS club_name, c.slug AS club_slug,
            ss.position, ss.points, ss.goal_difference
       FROM division_clubs dc
       JOIN divisions d ON d.id = dc.division_id
       JOIN clubs c ON c.id = dc.club_id
       LEFT JOIN standings_snapshot ss
         ON ss.season_id = d.season_id
        AND ss.division_id = dc.division_id
        AND ss.club_id = dc.club_id
      WHERE d.season_id = ?
        AND NOT EXISTS (
          SELECT 1
            FROM division_clubs newer_membership
            JOIN divisions newer_division ON newer_division.id = newer_membership.division_id
           WHERE newer_membership.club_id = dc.club_id
             AND newer_division.season_id = d.season_id
             AND newer_membership.id > dc.id
        )`,
    [season.id],
  )

  const grouped = new Map<number, RolloverClub[]>()
  for (const division of divisions) grouped.set(Number(division.id), [])

  for (const club of clubs) {
    const bucket = grouped.get(Number(club.division_id))
    if (!bucket) continue
    bucket.push({
      clubId: Number(club.club_id),
      clubName: club.club_name,
      clubSlug: club.club_slug,
      position: club.position === null ? null : Number(club.position),
      points: club.points === null ? null : Number(club.points),
      goalDifference: club.goal_difference === null ? null : Number(club.goal_difference),
    })
  }

  return {
    season: {
      id: Number(season.id),
      name: season.name,
      year: Number(season.year),
      featuredDivisionId:
        season.featured_division_id === null ? null : Number(season.featured_division_id),
    },
    divisions: divisions.map((division) => ({
      id: Number(division.id),
      name: division.name,
      slug: division.slug,
      sort_order: Number(division.sort_order),
      promotion_count: division.promotion_count === null ? null : Number(division.promotion_count),
      relegation_count: division.relegation_count === null ? null : Number(division.relegation_count),
      is_active: Number(division.is_active),
      clubs: grouped.get(Number(division.id)) ?? [],
    })),
  }
}

/** How many results the season has, and how many fixtures are still open. */
export async function loadSeasonFixtureStats(
  runner: Runner,
  seasonId: number,
): Promise<SeasonFixtureStats> {
  const [row] = await rows<{ matched_results: number; outstanding_fixtures: number }>(
    runner,
    `SELECT
        COALESCE(SUM(status = 'finished'), 0) AS matched_results,
        COALESCE(SUM(status <> 'finished'), 0) AS outstanding_fixtures
       FROM matches
      WHERE season_id = ?`,
    [seasonId],
  )
  return {
    matchedResults: Number(row?.matched_results ?? 0),
    outstandingFixtures: Number(row?.outstanding_fixtures ?? 0),
  }
}

/* ------------------------------------------------------------------- plan */

function byFinish(clubs: RolloverClub[]): RolloverClub[] {
  return [...clubs].sort(
    (a, b) =>
      (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
      a.clubId - b.clubId,
  )
}

/**
 * The nearest division in one direction that still takes part in the ladder.
 *
 * A paused league is skipped rather than used as a destination, so pausing the
 * middle of the ladder sends the league above straight into the one below it
 * instead of parking clubs in a league nobody is playing. Running out of
 * divisions in that direction returns null, which the caller reports as
 * "there is nothing above/below it" — the same as being at the top or bottom.
 */
function nextActiveDivision(
  ladder: RolloverContext['divisions'],
  index: number,
  step: -1 | 1,
): RolloverContext['divisions'][number] | null {
  for (let cursor = index + step; cursor >= 0 && cursor < ladder.length; cursor += step) {
    if (ladder[cursor].is_active) return ladder[cursor]
  }
  return null
}

/**
 * Work out who moves, without touching anything.
 *
 * Pure, so the preview the admin reads is the same function the commit runs —
 * there is no second implementation to drift out of step with this one.
 */
export function planSeasonRollover(
  context: RolloverContext,
  selectedDivisionIds: number[],
  stats: SeasonFixtureStats,
): RolloverPlan {
  const selected = new Set(selectedDivisionIds.map(Number))
  const ladder = context.divisions
  const legs: RolloverLeg[] = []
  const warnings: string[] = []

  for (const division of ladder) {
    const index = ladder.findIndex((entry) => entry.id === division.id)
    const ranked = byFinish(division.clubs)

    // A paused league takes no part in the movement. Its clubs are copied into
    // the new season as they are, which is what "paused" is for: the league is
    // not being played, so nothing moves in or out of it.
    if (!division.is_active) {
      if (selected.has(division.id)) {
        for (const type of ['promotion', 'relegation'] as const) {
          if (movementQuota(division, type) < 1) continue
          legs.push({
            type,
            sourceDivisionId: division.id,
            sourceDivisionName: division.name,
            destinationDivisionId: null,
            destinationDivisionName: null,
            clubs: [],
            skipped: true,
            skipReason: `${division.name} is paused, so it does not ${type} anything this rollover. Switch the league back on to include it.`,
          })
        }
      }
      continue
    }

    if (!selected.has(division.id)) continue

    for (const type of ['promotion', 'relegation'] as const) {
      const quota = movementQuota(division, type)
      if (quota < 1) continue

      const destination = nextActiveDivision(ladder, index, type === 'promotion' ? -1 : 1)
      const base = {
        type,
        sourceDivisionId: division.id,
        sourceDivisionName: division.name,
        destinationDivisionId: destination?.id ?? null,
        destinationDivisionName: destination?.name ?? null,
      }

      if (!destination) {
        legs.push({
          ...base,
          clubs: [],
          skipped: true,
          skipReason:
            type === 'promotion'
              ? `${division.name} is the highest league, so there is nothing above it to promote into.`
              : `${division.name} is the lowest league, so there is nothing below it to relegate into.`,
        })
        continue
      }

      if (!selected.has(destination.id)) {
        legs.push({
          ...base,
          clubs: [],
          skipped: true,
          skipReason: `${division.name} cannot ${type} into ${destination.name} because ${destination.name} is not part of this rollover. Add it to the selection to include the move.`,
        })
        continue
      }

      const clubs = type === 'promotion' ? ranked.slice(0, quota) : ranked.slice(-quota)
      if (clubs.length < quota) {
        warnings.push(
          `${division.name} is set to ${type === 'promotion' ? 'promote' : 'relegate'} ${quota} club${quota === 1 ? '' : 's'} but only has ${clubs.length} to send.`,
        )
      }
      legs.push({ ...base, clubs, skipped: false, skipReason: null })
    }
  }

  /* Refusals. Each one makes "top N" or "bottom N" mean the wrong thing. */
  const blocks: string[] = []
  const runnable = legs.filter((leg) => !leg.skipped)
  const sources = new Map<number, RolloverLeg[]>()
  for (const leg of runnable) {
    const bucket = sources.get(leg.sourceDivisionId) ?? []
    bucket.push(leg)
    sources.set(leg.sourceDivisionId, bucket)
  }

  for (const [sourceId, sourceLegs] of sources) {
    const division = ladder.find((entry) => entry.id === sourceId)
    if (!division) continue

    const unranked = division.clubs.filter((club) => club.position === null)
    if (unranked.length > 0) {
      blocks.push(
        `${division.name} has ${unranked.length} club${unranked.length === 1 ? '' : 's'} with no position in the standings, so its movement cannot be worked out. Give every club a position first.`,
      )
    }

    const up = sourceLegs.find((leg) => leg.type === 'promotion')
    const down = sourceLegs.find((leg) => leg.type === 'relegation')
    if (up && down && up.clubs.length + down.clubs.length > division.clubs.length) {
      blocks.push(
        `${division.name} is set to send ${up.clubs.length} club${up.clubs.length === 1 ? '' : 's'} up and ${down.clubs.length} down, but it only has ${division.clubs.length}. Lower the counts or the two zones would pick the same club.`,
      )
    }
    const promoted = new Set(up?.clubs.map((club) => club.clubId) ?? [])
    const overlap = (down?.clubs ?? []).filter((club) => promoted.has(club.clubId))
    if (overlap.length > 0) {
      blocks.push(
        `${division.name} would ${overlap.length === 1 ? 'promote and relegate the same club' : `promote and relegate ${overlap.length} of the same clubs`}. Lower one of the counts.`,
      )
    }
  }

  /* Advisories. */
  if (selectedDivisionIds.length === 0) {
    warnings.push(
      'No division is taking part, so no club will move. The new season starts with exactly the same leagues.',
    )
  }
  if (stats.matchedResults === 0) {
    warnings.push('No result has been entered for this season yet.')
  }
  if (stats.outstandingFixtures > 0) {
    warnings.push(
      `${stats.outstandingFixtures} fixture${stats.outstandingFixtures === 1 ? ' is' : 's are'} still without a result and will stay behind with ${context.season.name}.`,
    )
  }

  /* What each division looks like afterwards. */
  const divisions: RolloverDivisionPlan[] = ladder.map((division) => {
    const outgoing = runnable
      .filter((leg) => leg.sourceDivisionId === division.id)
      .flatMap((leg) => leg.clubs)
    const incoming = runnable
      .filter((leg) => leg.destinationDivisionId === division.id)
      .flatMap((leg) => leg.clubs)

    const leaving = new Set(outgoing.map((club) => club.clubId))
    const retained = byFinish(division.clubs).filter((club) => !leaving.has(club.clubId))

    return {
      id: division.id,
      name: division.name,
      sortOrder: division.sort_order,
      promotionCount: division.promotion_count,
      relegationCount: division.relegation_count,
      relegationInferred:
        (division.relegation_count ?? 0) === 0 && (division.promotion_count ?? 0) > 0,
      currentSize: division.clubs.length,
      nextSize: retained.length + incoming.length,
      selected: selected.has(division.id),
      outgoing,
      incoming,
      table: [
        ...retained.map((club) => ({ ...club, incoming: false })),
        ...incoming.map((club) => ({ ...club, incoming: true })),
      ],
    }
  })

  for (const division of divisions) {
    if (division.nextSize === division.currentSize) continue
    const delta = division.nextSize - division.currentSize
    warnings.push(
      `${division.name} goes from ${division.currentSize} to ${division.nextSize} club${division.nextSize === 1 ? '' : 's'} (${delta > 0 ? '+' : ''}${delta}).`,
    )
  }

  return {
    seasonId: context.season.id,
    seasonName: context.season.name,
    seasonYear: context.season.year,
    selectedDivisionIds: [...selected],
    legs,
    divisions,
    warnings,
    blocks,
    matchedResults: stats.matchedResults,
    outstandingFixtures: stats.outstandingFixtures,
  }
}

/** Load the season, its stats, and plan a rollover. Shared by preview and commit. */
export async function buildRolloverPlan(
  runner: Runner,
  selectedDivisionIds: number[],
  options: { lock?: boolean } = {},
): Promise<RolloverPlan | null> {
  const context = await loadRolloverContext(runner, options)
  if (!context) return null

  const known = new Set(context.divisions.map((division) => division.id))
  const requested = selectedDivisionIds.map(Number)
  const unknown = requested.filter((id) => !known.has(id))
  if (unknown.length > 0) {
    throw Object.assign(
      new Error(`These leagues are not in the current season: ${unknown.join(', ')}.`),
      { status: 400 },
    )
  }

  const stats = await loadSeasonFixtureStats(runner, context.season.id)
  return planSeasonRollover(context, requested, stats)
}

/** The preview the wizard reads. Reads only, so it needs no transaction. */
export async function previewSeasonRollover(
  selectedDivisionIds: number[],
): Promise<RolloverPlan | null> {
  return buildRolloverPlan(poolRunner, selectedDivisionIds)
}

/* ------------------------------------------------------------------ write */

export type RolloverResult = {
  season: { id: number; name: string; year: number; is_current: number; is_draft: number }
  divisions: Array<{ id: number; name: string; clubCount: number }>
  movements: Array<{
    type: RolloverDirection
    sourceDivisionName: string
    destinationDivisionName: string
    clubs: Array<{ clubId: number; clubName: string; position: number | null; points: number | null }>
  }>
  warnings: string[]
}

/**
 * Open a season from a plan, moving the clubs the plan named.
 *
 * Runs on the caller's connection so the plan it is given was built from the same
 * locked read of the ladder, and nothing can change underneath it between the
 * decision to move and the move itself.
 *
 * The finished season is left untouched. Everything here writes either to the
 * new season or to the ledger, so the archive keeps the standings the clubs
 * actually finished on.
 */
export async function applySeasonRollover(
  runner: Runner,
  context: RolloverContext,
  plan: RolloverPlan,
  input: { name: string; year: number; settings: Record<number, RolloverSetting> },
): Promise<RolloverResult> {
  const [inserted] = await runner.execute(
    `INSERT INTO seasons (name, year, is_current, is_draft, created_at)
     VALUES (?, ?, FALSE, TRUE, NOW())`,
    [input.name, input.year],
  )
  const seasonId = Number((inserted as { insertId: number }).insertId)

  /** Old division id -> the copy that now represents it. */
  const cloned = new Map<number, number>()
  const runnable = plan.legs.filter((leg) => !leg.skipped)

  for (const division of context.divisions) {
    const setting = input.settings[division.id]
    const suffix = `-s${seasonId}`
    const slug = `${division.slug.slice(0, 80 - suffix.length)}${suffix}`

    const [divisionResult] = await runner.execute(
      `INSERT INTO divisions
         (season_id, name, slug, sort_order, promotion_count, relegation_count, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        seasonId,
        division.name,
        slug,
        division.sort_order,
        setting?.promotionCount ?? division.promotion_count,
        setting?.relegationCount ?? division.relegation_count,
        // A league paused at the end of a season opens the next one paused, so
        // rolling over does not quietly bring it back to life.
        division.is_active,
      ],
    )
    const newDivisionId = Number((divisionResult as { insertId: number }).insertId)
    cloned.set(division.id, newDivisionId)

    const leaving = new Set(
      runnable
        .filter((leg) => leg.sourceDivisionId === division.id)
        .flatMap((leg) => leg.clubs.map((club) => club.clubId)),
    )
    const retained = division.clubs.filter((club) => !leaving.has(club.clubId))
    const arriving = runnable
      .filter((leg) => leg.destinationDivisionId === division.id)
      .flatMap((leg) => leg.clubs)

    if (retained.length > 0) {
      const ids = retained.map((club) => club.clubId)
      const marks = placeholders(ids.length)
      await runner.execute(
        `INSERT INTO division_clubs (division_id, club_id, code_at_registration, created_at)
         SELECT ?, dc.club_id, dc.code_at_registration, NOW()
           FROM division_clubs dc
          WHERE dc.division_id = ? AND dc.club_id IN (${marks})`,
        [newDivisionId, division.id, ...ids],
      )
      await runner.execute(
        `INSERT INTO standings_snapshot
           (season_id, division_id, club_id, position, played, won, drawn, lost,
            goals_for, goals_against, goal_difference, points, form, updated_at)
         SELECT ?, ?, dc.club_id,
                ROW_NUMBER() OVER (ORDER BY COALESCE(ss.position, 65535), dc.id),
                0, 0, 0, 0, 0, 0, 0, 0, '', NOW()
           FROM division_clubs dc
           LEFT JOIN standings_snapshot ss
             ON ss.season_id = ? AND ss.division_id = dc.division_id AND ss.club_id = dc.club_id
          WHERE dc.division_id = ? AND dc.club_id IN (${marks})`,
        [seasonId, newDivisionId, context.season.id, division.id, ...ids],
      )
    }

    // Arriving clubs keep no position from the season they just left: they have
    // played nothing here, so any position but the bottom would be a claim they
    // have not earned. They are appended in the order the plan listed them.
    for (const [index, club] of arriving.entries()) {
      await runner.execute(
        `INSERT INTO division_clubs
           (division_id, club_id, code_at_registration, created_at)
         VALUES (?, ?, (SELECT short_code FROM clubs WHERE id = ?), NOW())`,
        [newDivisionId, club.clubId, club.clubId],
      )
      await runner.execute(
        `INSERT INTO standings_snapshot
           (season_id, division_id, club_id, position, played, won, drawn, lost,
            goals_for, goals_against, goal_difference, points, form, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, '', NOW())`,
        [seasonId, newDivisionId, club.clubId, retained.length + index + 1],
      )
    }
  }

  /* The ledger records what left the finished season, in its own division
     ids, so the row reads consistently within the season it belongs to. */
  const movements = runnable.map((leg) => ({
    type: leg.type,
    sourceDivisionId: leg.sourceDivisionId,
    sourceDivisionName: leg.sourceDivisionName,
    destinationDivisionId: leg.destinationDivisionId,
    destinationDivisionName: leg.destinationDivisionName,
    clubs: leg.clubs.map((club) => ({
      clubId: club.clubId,
      clubName: club.clubName,
      position: club.position,
      points: club.points,
    })),
  }))

  for (const movement of movements) {
    for (const club of movement.clubs) {
      await runner.execute(
        `INSERT INTO season_division_movements
           (season_id, club_id, source_division_id, destination_division_id,
            movement_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           destination_division_id = VALUES(destination_division_id),
           movement_type = VALUES(movement_type),
           updated_at = NOW()`,
        [
          context.season.id,
          club.clubId,
          movement.sourceDivisionId,
          movement.destinationDivisionId,
          movement.type,
        ],
      )
    }
  }

  /* Manager notifications are deliberately not written here. The season this
     opens is a draft, and telling a manager they were promoted into something
     the admin may still edit or throw away would be premature. Publishing the
     draft sends them (see notifyRolloverClubs in the admin routes), and the
     notification ids are stored on this row then so an undo can remove them. */
  await runner.execute(
    `INSERT INTO season_rollovers
       (source_season_id, season_id, movements, notification_ids, completed_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [context.season.id, seasonId, JSON.stringify(movements), JSON.stringify([])],
  )

  if (context.season.featuredDivisionId !== null) {
    const copy = cloned.get(context.season.featuredDivisionId)
    if (copy !== undefined) {
      await runner.execute('UPDATE seasons SET featured_division_id = ? WHERE id = ?', [copy, seasonId])
    }
  }

  /* The finished season stays live. The rollover produced a draft, and the
     public site keeps serving the season that was actually played until the
     admin publishes the new one. */

  return {
    season: { id: seasonId, name: input.name, year: input.year, is_current: 0, is_draft: 1 },
    divisions: plan.divisions.map((division) => {
      const copy = cloned.get(division.id) ?? 0
      return { id: copy, name: division.name, clubCount: division.nextSize }
    }),
    movements: movements.map((movement) => ({
      type: movement.type,
      sourceDivisionName: movement.sourceDivisionName,
      destinationDivisionName: movement.destinationDivisionName ?? '',
      clubs: movement.clubs,
    })),
    warnings: plan.warnings,
  }
}

/* ------------------------------------------------------------------- undo */

export type RolloverUndoResult = {
  season: { id: number; name: string; year: number }
  restoredSeason: { id: number; name: string; year: number }
  removedMovements: number
  removedNotifications: number
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

/**
 * Put everything back the way it was before a rollover.
 *
 * The new season is removed outright rather than demoted, because its divisions
 * were only ever a copy: the finished season still holds the real clubs, its
 * real standings and its real results, none of which were touched.
 *
 * Refuses once the new season has been used, because by then the deletion would
 * take results that only exist inside it.
 */
export async function undoSeasonRollover(
  runner: Runner,
  seasonId: number,
): Promise<RolloverUndoResult> {
  const [rollover] = await rows<{
    id: number
    source_season_id: number
    movements: string
    notification_ids: string
  }>(
    runner,
    'SELECT id, source_season_id, movements, notification_ids FROM season_rollovers WHERE season_id = ? FOR UPDATE',
    [seasonId],
  )
  if (!rollover) {
    throw httpError(404, 'That season was not started by a rollover, so there is nothing to undo.')
  }

  const seasonRows = await rows<{
    id: number
    name: string
    year: number
    is_current: number
    is_draft: number
  }>(
    runner,
    `SELECT id, name, year, is_current, is_draft FROM seasons WHERE id IN (?, ?) FOR UPDATE`,
    [seasonId, Number(rollover.source_season_id)],
  )
  const target = seasonRows.find((season) => Number(season.id) === Number(seasonId))
  const source = seasonRows.find(
    (season) => Number(season.id) === Number(rollover.source_season_id),
  )
  if (!target || !source) throw httpError(404, 'Season not found.')

  // A rollover now produces a draft, so the season being undone is normally not
  // current. It is still undoable: nothing outside the draft references it yet.
  if (Number(target.is_current) !== 1 && Number(target.is_draft) !== 1) {
    throw httpError(
      409,
      `${target.name} is an archived season, so the rollover has already been moved on from.`,
    )
  }

  const [usage] = await rows<{ fixtures: number; played: number }>(
    runner,
    `SELECT (SELECT COUNT(*) FROM matches WHERE season_id = ?) AS fixtures,
            (SELECT COUNT(*) FROM standings_snapshot WHERE season_id = ? AND played > 0) AS played`,
    [seasonId, seasonId],
  )
  if (Number(usage?.fixtures ?? 0) > 0) {
    throw httpError(
      409,
      `${target.name} already has fixtures in it, so undoing the rollover would delete them.`,
    )
  }
  if (Number(usage?.played ?? 0) > 0) {
    throw httpError(
      409,
      `${target.name} already has results in it, so undoing the rollover would delete them.`,
    )
  }

  const movements = JSON.parse(String(rollover.movements ?? '[]')) as Array<{
    sourceDivisionId: number
    clubs: Array<{ clubId: number }>
  }>

  let removedMovements = 0
  for (const movement of movements) {
    for (const club of movement.clubs) {
      const affected = await runner.execute(
        `DELETE FROM season_division_movements
          WHERE season_id = ? AND club_id = ? AND source_division_id = ?`,
        [Number(rollover.source_season_id), club.clubId, movement.sourceDivisionId],
      )
      removedMovements += Number((affected as { affectedRows: number }).affectedRows)
    }
  }

  const notificationIds = (JSON.parse(String(rollover.notification_ids ?? '[]')) as number[]).map(
    Number,
  )
  let removedNotifications = 0
  if (notificationIds.length > 0) {
    const result = await runner.execute(
      `DELETE FROM notifications WHERE id IN (${placeholders(notificationIds.length)})`,
      notificationIds,
    )
    removedNotifications = Number((result as { affectedRows: number }).affectedRows)
  }

  await runner.execute('DELETE FROM standings_snapshot WHERE season_id = ?', [seasonId])
  await runner.execute(
    `DELETE FROM division_clubs
      WHERE division_id IN (SELECT id FROM divisions WHERE season_id = ?)`,
    [seasonId],
  )
  await runner.execute('DELETE FROM divisions WHERE season_id = ?', [seasonId])
  await runner.execute('DELETE FROM season_rollovers WHERE season_id = ?', [seasonId])
  await runner.execute('DELETE FROM seasons WHERE id = ?', [seasonId])
  // Normally the source season was still live (the rollover only created a
  // draft), so this is a no-op. It only matters when the rollover had already
  // been published and there is no live season left to fall back to.
  const [currentAfter] = await rows<{ id: number }>(
    runner,
    'SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1',
  )
  if (!currentAfter) {
    await runner.execute('UPDATE seasons SET is_current = TRUE WHERE id = ?', [
      Number(rollover.source_season_id),
    ])
  }

  return {
    season: { id: Number(target.id), name: target.name, year: Number(target.year) },
    restoredSeason: {
      id: Number(source.id),
      name: source.name,
      year: Number(source.year),
    },
    removedMovements,
    removedNotifications,
  }
}
/* ---------------------------------------------------------------- history */

export type RolloverRecord = {
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
  /**
   * Whether the rollover that opened the current season can still be taken
   * back. It cannot once the new season has fixtures or results in it, because
   * undoing deletes the season those live in.
   */
  undoable: boolean
}

/**
 * The rollover that opened a season, if there was one.
 *
 * Read rather than remembered, so the undo button survives a page reload
 * instead of vanishing the moment the admin closes the tab. With no season id
 * it reads the live season; the admin page also asks for a draft's rollover so
 * a freshly prepared season can be reviewed (or undone) before it is published.
 */
export async function readSeasonRollover(
  seasonId: number | null = null,
  runner: Runner = poolRunner,
): Promise<RolloverRecord | null> {
  let targetSeasonId = seasonId
  if (targetSeasonId === null) {
    const [current] = await rows<{ id: number }>(
      runner,
      'SELECT id FROM seasons WHERE is_current = TRUE LIMIT 1',
    )
    if (!current) return null
    targetSeasonId = Number(current.id)
  }

  const [row] = await rows<{
    source_id: number
    source_name: string
    source_year: number
    season_id: number
    season_name: string
    season_year: number
    completed_at: string
    movements: string
    fixtures: number
    played: number
  }>(
    runner,
    `SELECT r.source_season_id AS source_id, source.name AS source_name, source.year AS source_year,
            r.season_id, target.name AS season_name, target.year AS season_year,
            r.completed_at, r.movements,
            (SELECT COUNT(*) FROM matches WHERE season_id = r.season_id) AS fixtures,
            (SELECT COUNT(*) FROM standings_snapshot WHERE season_id = r.season_id AND played > 0) AS played
       FROM season_rollovers r
       JOIN seasons source ON source.id = r.source_season_id
       JOIN seasons target ON target.id = r.season_id
      WHERE r.season_id = ?
      LIMIT 1`,
    [targetSeasonId],
  )
  if (!row) return null

  const movements = JSON.parse(String(row.movements ?? '[]')) as Array<{
    type: RolloverDirection
    sourceDivisionName: string
    destinationDivisionName: string
    clubs: Array<{ clubId: number; clubName: string; position: number | null; points: number | null }>
  }>

  return {
    sourceSeason: { id: Number(row.source_id), name: row.source_name, year: Number(row.source_year) },
    season: { id: Number(row.season_id), name: row.season_name, year: Number(row.season_year) },
    completedAt: row.completed_at,
    movements: movements.map((movement) => ({
      type: movement.type,
      sourceDivisionName: movement.sourceDivisionName,
      destinationDivisionName: movement.destinationDivisionName,
      clubs: movement.clubs,
    })),
    movedClubs: new Set(movements.flatMap((movement) => movement.clubs.map((club) => club.clubId)))
      .size,
    undoable: Number(row.fixtures ?? 0) === 0 && Number(row.played ?? 0) === 0,
  }
}
