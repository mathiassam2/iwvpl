import { asset } from '@/lib/assets'
import type { Match, Standing } from '@/types/site'

interface ApiMatch {
  id: number
  kickoff: string
  status: string
  home_score: number | null
  away_score: number | null
  source_url: string | null
  home_name: string
  home_logo: string | null
  away_name: string
  away_logo: string | null
}

interface ApiStanding {
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
  short_code: string | null
  logo_local: string | null
  flag: string | null
  division_name: string
}

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const liveLeagueEnabled = Boolean(apiBase) || import.meta.env.BASE_URL === '/'

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`Live league data request failed (${response.status}).`)
  }
  return (await response.json()) as T
}

function toMatch(match: ApiMatch): Match {
  const [datePart, timePart = ''] = match.kickoff.split(' ')
  const date = new Date(`${datePart}T00:00:00`)
  const formattedDate = Number.isNaN(date.getTime())
    ? datePart
    : date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })

  return {
    date: formattedDate,
    time: timePart.slice(0, 5),
    home: match.home_name,
    home_flag: '',
    home_logo: '',
    away: match.away_name,
    away_flag: '',
    away_logo: '',
    score:
      match.home_score === null || match.away_score === null
        ? ''
        : `${match.home_score} : ${match.away_score}`,
    hs: match.home_score === null ? '' : String(match.home_score),
    as: match.away_score === null ? '' : String(match.away_score),
    url: match.source_url ?? `/matches/${match.id}`,
    homeLogo: match.home_logo ? asset(match.home_logo) : undefined,
    awayLogo: match.away_logo ? asset(match.away_logo) : undefined,
  }
}

export async function getLiveResults(signal: AbortSignal): Promise<Match[]> {
  const response = await get<{ matches: ApiMatch[] }>(
    '/api/matches?limit=200&status=finished',
    signal,
  )
  return response.matches.map(toMatch)
}

export async function getLiveStandings(signal: AbortSignal): Promise<Record<string, Standing[]>> {
  const response = await get<{ standings: ApiStanding[] }>('/api/standings', signal)
  const divisions: Record<string, Standing[]> = {}

  for (const row of response.standings) {
    const rows = divisions[row.division_name] ?? (divisions[row.division_name] = [])
    rows.push({
      pos: row.position,
      team: row.name,
      flag: row.flag ?? '',
      pl: row.played,
      w: row.won,
      d: row.drawn,
      l: row.lost,
      gf: row.goals_for,
      ga: row.goals_against,
      gd: row.goal_difference,
      pts: row.points,
      form: row.form.split(''),
      logo: row.logo_local ? asset(row.logo_local) : '',
      code: row.short_code ?? '',
    })
  }

  return divisions
}
