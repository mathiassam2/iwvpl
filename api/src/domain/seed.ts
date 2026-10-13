/**
 * Seed the database from the crawl output.
 *
 * `src/data/site_data.json` is what the SPA renders today, so seeding from it
 * means the API returns byte-identical content on the first run and the site
 * does not visibly change when it switches over. That property is worth more
 * than elegance here: it means any difference you later see is a real
 * difference, not a migration artefact.
 *
 * The seed is idempotent. Re-running wipes the tables it owns and rebuilds
 * them, so it is also the reset button. `users` and `sessions` are never
 * touched — wiping your admin login because you re-seeded league data would be
 * a genuinely nasty surprise.
 */

import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { config } from '../config.js'
import { closePool, now, withTransaction } from '../db.js'
import { clubSlug, gamertagKey, stripFlag } from '../domain/slug.js'

/* ------------------------------------------------------------------ types */

interface CrawlClub {
  name: string
  flag: string
  code: string
  url: string
  logo: string
  players: number
  status: string
  raw: string
  logoLocal: string
}

interface CrawlResult {
  date: string
  time: string
  home: string
  home_flag: string
  home_logo: string
  away: string
  away_flag: string
  away_logo: string
  score: string
  hs: string
  as: string
  url: string
  homeLogo: string
  awayLogo: string
}

interface CrawlStanding {
  pos: number
  team: string
  flag: string
  pl: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
  form: string[]
  logo: string
  code: string
}

interface CrawlLeaderRow {
  pos: number
  name: string
  team: string
  team_flag: string
  value: number
  avatar: string
  team_logo: string
  url: string
  avatarLocal: string
  teamLogoLocal: string
}

interface CrawlTransferSide {
  name: string
  logo: string
  emoji: string
  free: boolean
  logoLocal: string
}

interface CrawlTransfer {
  date: string
  player: string
  from: CrawlTransferSide
  to: CrawlTransferSide
}

interface Crawl {
  seasons: string[]
  standingsByDivision: Record<string, { columns: string[]; rows: CrawlStanding[] }>
  results: CrawlResult[]
  clubs: CrawlClub[]
  leaderboards: Array<{ title: string; rows: CrawlLeaderRow[] }>
  transfers: CrawlTransfer[]
}

/* ------------------------------------------------------------- date parsing */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/**
 * The crawl publishes dates as 'Friday, 02 October 2026' with a separate
 * '00:00' time.
 *
 * The pairing is ambiguous and cannot be repaired from the data alone: rows
 * like 'Thursday, 01 October 2026' at '23:30' are consistent both with a
 * genuine late kickoff and with a UTC timestamp rendered in a +08:00 zone,
 * where the real local kickoff is the following morning. The zone is never
 * stated.
 *
 * Rather than guess a zone and silently shift fixtures by a day, the two
 * strings are combined exactly as published. What the API returns is what the
 * site shows today, with no invented precision. Once fixtures are entered by
 * hand through the admin the ambiguity disappears, and `kickoff_tz` can be
 * added to record a real UTC instant.
 */
function parseKickoff(date: string, time: string): string {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(date)
  if (!m) throw new Error(`Unparseable crawl date: ${JSON.stringify(date)}`)

  const day = m[1].padStart(2, '0')
  const month = String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')
  const year = m[3]

  const hhmm = /^(\d{1,2}):(\d{2})/.exec(time ?? '')
  const hh = hhmm ? hhmm[1].padStart(2, '0') : '00'
  const mm = hhmm ? hhmm[2] : '00'

  return `${year}-${month}-${day} ${hh}:${mm}:00`
}

/** '2026-10-08 13:33' → '2026-10-08' */
function toDate(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? '')
  if (!m) throw new Error(`Unparseable crawl date: ${JSON.stringify(value)}`)
  return m[1]
}

/** ------------------------------------------------------------- board mapping */

const BOARD_COLUMN: Record<string, 'goals' | 'assists' | 'saves'> = {
  'TOP SCORER': 'goals',
  'TOP ASSIST': 'assists',
  'TOP SAVES': 'saves',
}

/* -------------------------------------------------------------------- seed */

export interface SeedReport {
  season: string
  division: string
  counts: Record<string, number>
  warnings: string[]
}

export async function seed(): Promise<SeedReport> {
  const warnings: string[] = []

  const crawl = JSON.parse(await readFile(config.paths.crawlData, 'utf8')) as Crawl

  // The crawl's `seasons` array is filter UI, and its first entry is the
  // literal placeholder 'All Seasons'. The real competition is the other one.
  const seasonName =
    crawl.seasons.find((s) => s !== 'All Seasons') ?? crawl.seasons[0] ?? 'Season 1'
  const yearMatch = /(\d{4})/.exec(seasonName)
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear()

  const divisionEntry = Object.entries(crawl.standingsByDivision)[0]
  if (!divisionEntry) throw new Error('Crawl contains no standingsByDivision data.')
  const [divisionName, divisionData] = divisionEntry

  const ts = now()
  const counts: Record<string, number> = {}

  // Resolve every club name reference to a slug up front. `slugToClub` is the
  // single lookup used by matches, standings and transfers, so a name that
  // matches nothing surfaces once here rather than as three silent nulls.
  const slugToClub = new Map<string, CrawlClub>()
  for (const club of crawl.clubs) {
    const slug = clubSlug(stripFlag(club.name))
    if (slugToClub.has(slug)) {
      warnings.push(
        `Two clubs share the slug "${slug}" (${slugToClub.get(slug)!.name} / ${club.name}). ` +
          `Kept the first.`,
      )
      continue
    }
    slugToClub.set(slug, club)
  }

  function resolveClub(name: string): number {
    const slug = clubSlug(stripFlag(name))
    const id = clubIds.get(slug)
    if (!id) throw new Error(`No club matches ${JSON.stringify(name)} (slug "${slug}").`)
    return id
  }

  const clubIds = new Map<string, number>()
  const playerIds = new Map<string, number>()

  await withTransaction(async (conn) => {
    /* --- reset ------------------------------------------------------------
     * Ordered children-first so that, on a TiDB cluster where foreign key
     * enforcement is enabled, no DELETE is ever blocked by a live reference. */
    for (const table of [
      'standings_snapshot',
      'transfers',
      'player_season_stats',
      'match_stats',
      'match_events',
      'matches',
      'division_clubs',
      'clubs',
      'players',
      'divisions',
      'seasons',
    ]) {
      await conn.query(`DELETE FROM ${table}`)
    }

    /* --- season + division ------------------------------------------------ */

    const [seasonRes] = await conn.query<any>(
      'INSERT INTO seasons (name, year, is_current, created_at) VALUES (?, ?, TRUE, ?)',
      [seasonName, year, ts],
    )
    const seasonId = seasonRes.insertId

    const [divisionRes] = await conn.query<any>(
      'INSERT INTO divisions (season_id, name, slug, created_at) VALUES (?, ?, ?, ?)',
      [seasonId, divisionName, clubSlug(divisionName), ts],
    )
    const divisionId = divisionRes.insertId

    /* --- clubs ------------------------------------------------------------ */

    for (const club of crawl.clubs) {
      const slug = clubSlug(stripFlag(club.name))
      if (clubIds.has(slug)) continue

      const status = /pending/i.test(club.status ?? '') ? 'pending' : 'active'
      const flag = stripFlag(club.name) === club.name ? (club.flag || '') : ''

      const [res] = await conn.query<any>(
        `INSERT INTO clubs
           (name, slug, short_code, flag, logo_url, logo_local, source_url, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stripFlag(club.name),
          slug,
          club.code || null,
          flag || null,
          club.logo || null,
          club.logoLocal || null,
          club.url || null,
          status,
          ts,
          ts,
        ],
      )
      clubIds.set(slug, res.insertId)
    }
    counts.clubs = clubIds.size

    /* --- division membership ---------------------------------------------- */

    // Membership comes from the standings table, not from the full clubs list.
    // The crawl's 37 clubs include pending registrations and clubs from other
    // divisions; only 18 actually play in this division.
    const roster = new Set<string>()
    for (const row of divisionData.rows) roster.add(clubSlug(stripFlag(row.team)))

    for (const slug of roster) {
      const clubId = clubIds.get(slug)
      if (!clubId) {
        warnings.push(`Division member "${slug}" is not in the clubs list; skipped.`)
        continue
      }
      const row = divisionData.rows.find((r) => clubSlug(stripFlag(r.team)) === slug)!
      await conn.query(
        'INSERT IGNORE INTO division_clubs (division_id, club_id, code_at_registration, created_at) VALUES (?, ?, ?, ?)',
        [divisionId, clubId, row.code || null, ts],
      )
    }
    counts.division_clubs = roster.size

    /* --- players ---------------------------------------------------------- */

    const gamertags = new Map<string, { avatar: string; url: string; club: string }>()
    for (const board of crawl.leaderboards) {
      for (const r of board.rows) {
        const key = gamertagKey(r.name)
        const existing = gamertags.get(key)
        // Keep the first club seen: a player listed on two boards is on one
        // club, and boards disagree only when the crawl is stale.
        const club = existing?.club || (r.team ? clubSlug(stripFlag(r.team)) : '')
        if (!existing || !existing.avatar || !existing.club) {
          gamertags.set(key, {
            avatar: r.avatarLocal || r.avatar || existing?.avatar || '',
            url: r.url || existing?.url || '',
            club: club || existing?.club || '',
          })
        }
      }
    }
    for (const t of crawl.transfers) {
      const key = gamertagKey(t.player)
      if (!gamertags.has(key)) gamertags.set(key, { avatar: '', url: '', club: '' })
    }

    for (const [key, meta] of gamertags) {
      const display = displayNameFor(key, crawl)
      // The leaderboard states this player's club directly, so it is the better
      // source than the transfer log — most leaderboard players have no
      // transfer record at all, and would otherwise come out as free agents.
      const clubId = meta.club ? (clubIds.get(meta.club) ?? null) : null

      const [res] = await conn.query<any>(
        `INSERT INTO players (gamertag, gamertag_key, slug, avatar_url, avatar_local, source_url, club_id, is_free_agent, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          display,
          key,
          clubSlug(display),
          meta.avatar || null,
          meta.url || null,
          clubId,
          clubId === null,
          ts,
          ts,
        ],
      )
      playerIds.set(key, res.insertId)
    }
    counts.players = playerIds.size

    /* --- player season stats ---------------------------------------------- */

    for (const board of crawl.leaderboards) {
      const column = BOARD_COLUMN[board.title]
      if (!column) {
        warnings.push(`Unknown leaderboard "${board.title}"; its values were not imported.`)
        continue
      }
      for (const r of board.rows) {
        const playerId = playerIds.get(gamertagKey(r.name))
        if (!playerId) continue

        // One row per player/season/division; a player on two boards
        // accumulates both columns rather than overwriting the row.
        await conn.query(
          `INSERT INTO player_season_stats (player_id, season_id, division_id, ${column}, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE ${column} = VALUES(${column}), updated_at = VALUES(updated_at)`,
          [playerId, seasonId, divisionId, r.value, ts],
        )
      }
    }
    const [statsCount] = await conn.query<any>('SELECT COUNT(*) AS n FROM player_season_stats')
    counts.player_season_stats = Number(statsCount[0].n)

    /* --- matches ---------------------------------------------------------- */

    for (const m of crawl.results) {
      const kickoff = parseKickoff(m.date, m.time)
      const homeId = resolveClub(m.home)
      const awayId = resolveClub(m.away)
      const hs = Number.parseInt(m.hs, 10)
      const as = Number.parseInt(m.as, 10)
      const played = Number.isInteger(hs) && Number.isInteger(as)

      await conn.query(
        `INSERT IGNORE INTO matches
           (division_id, season_id, home_club_id, away_club_id, kickoff, status,
            home_score, away_score, source_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          divisionId,
          seasonId,
          homeId,
          awayId,
          kickoff,
          played ? 'finished' : 'scheduled',
          played ? hs : null,
          played ? as : null,
          m.url || null,
          ts,
          ts,
        ],
      )
    }
    const [matchCount] = await conn.query<any>('SELECT COUNT(*) AS n FROM matches')
    counts.matches = Number(matchCount[0].n)

    /* --- standings snapshot ----------------------------------------------- */

    for (const row of divisionData.rows) {
      await conn.query(
        `INSERT INTO standings_snapshot
           (season_id, division_id, club_id, position, played, won, drawn, lost,
            goals_for, goals_against, goal_difference, points, form, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          seasonId,
          divisionId,
          resolveClub(row.team),
          row.pos,
          row.pl,
          row.w,
          row.d,
          row.l,
          row.gf,
          row.ga,
          row.gd,
          row.pts,
          (row.form ?? []).join(''),
          ts,
        ],
      )
    }
    counts.standings_snapshot = divisionData.rows.length

    /* --- transfers -------------------------------------------------------- */

    /**
     * Transfer endpoints frequently name a club that was never registered — a
     * reserve side, or one still pending approval. That is expected, so it is
     * recorded once as a warning and stored as NULL rather than aborting the
     * seed over a cosmetic gap.
     */
    const warned = new Set<string>()
    function resolveOrWarn(name: string): number | null {
      const slug = clubSlug(stripFlag(name))
      const id = clubIds.get(slug)
      if (id !== undefined) return id
      if (!warned.has(slug)) {
        warnings.push(`Transfer references unregistered club ${JSON.stringify(name)}; stored as null.`)
        warned.add(slug)
      }
      return null
    }

    let imported = 0
    for (const t of crawl.transfers) {
      const playerId = playerIds.get(gamertagKey(t.player))
      if (!playerId) continue

      const fromId = t.from.free ? null : resolveOrWarn(t.from.name)
      const toId = t.to.free ? null : resolveOrWarn(t.to.name)

      await conn.query(
        `INSERT INTO transfers (player_id, from_club_id, to_club_id, occurred_at, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [playerId, fromId, toId, toDate(t.date), null, ts],
      )
      imported++
    }
    counts.transfers = imported

    /* --- fill in clubs the leaderboard did not know ------------------- */

    // Derived from the most recent move, matching clubFromMoves() on the front
    // end: the latest move that is not free agency wins.
    //
    // `WHERE p.club_id IS NULL` is deliberate. The leaderboard already states a
    // club for every player who appears on one, and that is the more direct
    // claim. The transfer log only fills the gap for players who appear on no
    // board, so overwriting a known club with an older one would be a
    // regression, not a correction.
    await conn.query(
      `UPDATE players p
          JOIN (
            SELECT t.player_id, t.to_club_id, t.occurred_at,
                   ROW_NUMBER() OVER (PARTITION BY t.player_id ORDER BY t.occurred_at DESC, t.id DESC) AS rn
              FROM transfers t
             WHERE t.to_club_id IS NOT NULL
          ) latest ON latest.player_id = p.id AND latest.rn = 1
          SET p.club_id = latest.to_club_id, p.is_free_agent = FALSE, p.updated_at = ?
        WHERE p.club_id IS NULL`,
      [ts],
    )
  })

  return { season: seasonName, division: divisionName, counts, warnings }
}

/** Recover the display casing of a gamertag from whichever source first had it. */
function displayNameFor(key: string, crawl: Crawl): string {
  for (const board of crawl.leaderboards) {
    for (const r of board.rows) if (gamertagKey(r.name) === key) return r.name
  }
  for (const t of crawl.transfers) if (gamertagKey(t.player) === key) return t.player
  return key
}

/** CLI entry point: `npm run seed` */
async function main(): Promise<void> {
  try {
    console.log(`Seeding from ${config.paths.crawlData}`)
    const report = await seed()

    console.log(`\n  ${report.season} / ${report.division}`)
    for (const [table, n] of Object.entries(report.counts)) {
      console.log(`  ${String(n).padStart(5)}  ${table}`)
    }

    if (report.warnings.length > 0) {
      console.log('\nWarnings:')
      for (const w of [...new Set(report.warnings)]) console.log(`  - ${w}`)
    }
    console.log('\nDone.')
  } finally {
    // The pool holds live sockets, and Node will not exit while it does — the
    // script would finish printing and then hang until killed.
    await closePool()
  }
}

// See the note in migrate.ts: pathToFileURL is required for this to match on
// Windows, where import.meta.url and process.argv[1] differ in form.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}