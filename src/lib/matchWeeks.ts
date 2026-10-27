import type { Match } from '@/types/site'

export interface WeekGroup {
  id: string
  weekNum: number | null
  label: string
  dateRange: string
  startDate: Date | null
  endDate: Date | null
  matches: Match[]
  hasUpcoming: boolean
  hasCompleted: boolean
}

/**
 * Returns Monday 00:00:00 of the given date.
 */
function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(date.setDate(diff))
  mon.setHours(0, 0, 0, 0)
  return mon
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function buildWeekGroups(matches: Match[]): {
  weeks: WeekGroup[]
  defaultWeekId: string
  byWeekId: Map<string, WeekGroup>
} {
  const scheduled: { match: Match; kickoffDate: Date; monday: Date }[] = []
  const unscheduled: Match[] = []

  for (const m of matches) {
    if (m.kickoff) {
      const parsed = new Date(m.kickoff.replace(' ', 'T'))
      if (!Number.isNaN(parsed.getTime())) {
        scheduled.push({
          match: m,
          kickoffDate: parsed,
          monday: getMonday(parsed),
        })
        continue
      }
    }
    unscheduled.push(m)
  }

  // Sort scheduled chronologically
  scheduled.sort((a, b) => a.kickoffDate.getTime() - b.kickoffDate.getTime())

  const weeksMap = new Map<number, WeekGroup>()

  if (scheduled.length > 0) {
    const seasonStartMonday = scheduled[0].monday

    for (const item of scheduled) {
      const diffMs = item.monday.getTime() - seasonStartMonday.getTime()
      const weekNum = Math.round(diffMs / (7 * 24 * 3600 * 1000)) + 1
      const sunday = new Date(item.monday)
      sunday.setDate(sunday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)

      if (!weeksMap.has(weekNum)) {
        const yearStr = item.monday.getFullYear() === sunday.getFullYear() ? ` ${sunday.getFullYear()}` : ''
        weeksMap.set(weekNum, {
          id: `week-${weekNum}`,
          weekNum,
          label: `Week ${weekNum}`,
          dateRange: `${formatDateShort(item.monday)} – ${formatDateShort(sunday)}${yearStr}`,
          startDate: item.monday,
          endDate: sunday,
          matches: [],
          hasUpcoming: false,
          hasCompleted: false,
        })
      }

      const wg = weeksMap.get(weekNum)!
      wg.matches.push(item.match)
      const played = item.match.hs !== '' && item.match.as !== ''
      if (played) wg.hasCompleted = true
      else wg.hasUpcoming = true
    }
  }

  const sortedWeeks = Array.from(weeksMap.values()).sort((a, b) => (a.weekNum ?? 0) - (b.weekNum ?? 0))

  let unscheduledGroup: WeekGroup | null = null
  if (unscheduled.length > 0) {
    unscheduledGroup = {
      id: 'unscheduled',
      weekNum: null,
      label: 'Unscheduled / TBD',
      dateRange: 'Kick-off date pending',
      startDate: null,
      endDate: null,
      matches: unscheduled,
      hasUpcoming: true,
      hasCompleted: false,
    }
  }

  const now = new Date()
  let defaultWeekId = 'all'

  const currentCalendarWeek = sortedWeeks.find(
    (w) => w.startDate && w.endDate && now >= w.startDate && now <= w.endDate,
  )
  if (currentCalendarWeek) {
    defaultWeekId = currentCalendarWeek.id
  } else {
    const nextUpcoming = sortedWeeks.find((w) => w.hasUpcoming)
    if (nextUpcoming) {
      defaultWeekId = nextUpcoming.id
    } else if (sortedWeeks.length > 0) {
      defaultWeekId = sortedWeeks[sortedWeeks.length - 1].id
    } else if (unscheduledGroup) {
      defaultWeekId = unscheduledGroup.id
    }
  }

  const allWeeks: WeekGroup[] = [...sortedWeeks]
  if (unscheduledGroup) {
    allWeeks.push(unscheduledGroup)
  }

  const byWeekId = new Map<string, WeekGroup>()
  for (const w of allWeeks) {
    byWeekId.set(w.id, w)
  }

  return {
    weeks: allWeeks,
    defaultWeekId,
    byWeekId,
  }
}
