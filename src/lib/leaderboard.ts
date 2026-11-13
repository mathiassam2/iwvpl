/**
 * Leaderboard boards: the unit each one counts and the title it is shown under.
 *
 * The same three boards arrive under two spellings. The API names them
 * "TOP SCORERS", "TOP PLAYMAKERS" and "TOP GOALKEEPERS"; the crawl that seeds
 * the static fallback calls them "TOP SCORER", "TOP ASSIST" and "TOP SAVES".
 * A title test that only knows the second spelling counts a playmaker's
 * assists as saves, so the unit is resolved from the meaning of the words
 * instead, and every board is shown under one canonical title: TOP SCORERS,
 * TOP ASSISTS and MOST SAVES.
 */

export type LeaderboardUnit = 'goals' | 'assists' | 'saves'

/** What a board counts, whatever the board happens to be called. */
export function boardUnit(title: string): LeaderboardUnit {
  const name = title.toUpperCase()
  if (name.includes('ASSIST') || name.includes('PLAYMAKER')) return 'assists'
  if (name.includes('SAVE') || name.includes('GOALKEEPER')) return 'saves'
  return 'goals'
}

/** Canonical title, e.g. "TOP PLAYMAKERS" -> "TOP ASSISTS". */
export function boardTitle(title: string): string {
  switch (boardUnit(title)) {
    case 'goals':
      return 'TOP SCORERS'
    case 'assists':
      return 'TOP ASSISTS'
    case 'saves':
      return 'MOST SAVES'
  }
}

/** Canonical title as a tab label, e.g. "top assists". */
export function boardLabel(title: string): string {
  return boardTitle(title).replace('TOP ', 'Top ').toLowerCase()
}