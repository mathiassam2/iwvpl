import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { MatchRow } from '@/components/league'
import { Container, EmptyState, Section, Select } from '@/components/ui'
import { SITE, siteData } from '@/data'
import { useAuth } from '@/lib/auth'
import { cx, stripFlag } from '@/lib/format'
import {
  getLiveMatches,
  getLiveSeasonClubs,
  getLiveSeasons,
  liveLeagueEnabled,
  type LeagueClub,
  type LeagueSeason,
} from '@/lib/liveLeague'
import { matchIndexOf } from '@/lib/match'
import { useSeasonName } from '@/lib/season'
import type { Match } from '@/types/site'

interface RoundDateSubgroup {
  key: string
  dateLabel: string
  isUnscheduled: boolean
  matches: Match[]
}

interface RoundGroup {
  key: string
  roundNum: number
  label: string
  dateLabel: string
  unscheduledCount: number
  dateGroups: RoundDateSubgroup[]
  matches: Match[]
  completedCount: number
}

interface PinnedClub {
  id: number | null
  name: string
  slug: string
}

function extractMatchYmd(m: Match): string | null {
  if (m.kickoff) {
    const match = String(m.kickoff).trim().match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
  }
  if (m.date && !/unscheduled|tbd/i.test(m.date)) {
    const dt = new Date(m.date)
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10)
    }
  }
  return null
}

function formatYmdShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatYmdFull(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function divisionSortRank(name: string): number {
  const lower = name.toLowerCase().trim()
  if (lower.includes('premier') || lower.includes('super')) return 0
  if (/\b(one|1|i)\b/.test(lower)) return 1
  if (/\b(two|2|ii)\b/.test(lower)) return 2
  if (/\b(three|3|iii)\b/.test(lower)) return 3
  if (/\b(four|4|iv)\b/.test(lower)) return 4
  if (/\b(five|5|v)\b/.test(lower)) return 5
  const numMatch = lower.match(/\d+/)
  if (numMatch) return Number(numMatch[0])
  return 999
}

function formatDivisionTag(name?: string | null): string | undefined {
  if (!name) return undefined
  const lower = name.toLowerCase().trim()
  if (lower.includes('two') || lower.includes('2') || lower.includes('ii')) return 'DIV 2'
  if (lower.includes('one') || lower.includes('1') || lower.includes('i')) return 'DIV 1'
  return name.slice(0, 5).toUpperCase()
}

function buildRoundGroups(matches: Match[]): RoundGroup[] {
  if (matches.length === 0) return []

  const hasExplicitRounds = matches.some((m) => m.roundNumber != null && m.roundNumber > 0)
  const map = new Map<string, Match[]>()

  if (hasExplicitRounds) {
    const sorted = [...matches].sort((a, b) => {
      const ra = a.roundNumber ?? 9999
      const rb = b.roundNumber ?? 9999
      if (ra !== rb) return ra - rb
      const ka = a.kickoff || '9999-12-31'
      const kb = b.kickoff || '9999-12-31'
      if (ka !== kb) return ka.localeCompare(kb)
      return (a.id ?? 0) - (b.id ?? 0)
    })
    for (const m of sorted) {
      const key = m.roundNumber != null && m.roundNumber > 0 ? `round-${m.roundNumber}` : 'unscheduled'
      const list = map.get(key) ?? []
      list.push(m)
      map.set(key, list)
    }
  } else {
    const sorted = [...matches].sort((a, b) => {
      if (!a.kickoff && !b.kickoff) return (a.id ?? 0) - (b.id ?? 0)
      if (!a.kickoff) return 1
      if (!b.kickoff) return -1
      const cmp = a.kickoff.localeCompare(b.kickoff)
      if (cmp !== 0) return cmp
      return (a.id ?? 0) - (b.id ?? 0)
    })
    for (const m of sorted) {
      const dayKey = m.kickoff ? m.kickoff.slice(0, 10) : m.date || 'unscheduled'
      const list = map.get(dayKey) ?? []
      list.push(m)
      map.set(dayKey, list)
    }
  }

  const groups: RoundGroup[] = []
  let idx = 1
  for (const [key, list] of map.entries()) {
    const explicitRound = list[0]?.roundNumber
    const roundNum = explicitRound && explicitRound > 0 ? explicitRound : idx

    const byYmd = new Map<string, Match[]>()
    const unscheduled: Match[] = []
    for (const m of list) {
      const ymd = extractMatchYmd(m)
      if (ymd) {
        const arr = byYmd.get(ymd) ?? []
        arr.push(m)
        byYmd.set(ymd, arr)
      } else {
        unscheduled.push(m)
      }
    }

    const sortedYmds = [...byYmd.keys()].sort((a, b) => a.localeCompare(b))
    const dateGroups: RoundDateSubgroup[] = sortedYmds.map((ymd) => ({
      key: ymd,
      dateLabel: formatYmdFull(ymd),
      isUnscheduled: false,
      matches: byYmd.get(ymd)!,
    }))
    if (unscheduled.length > 0) {
      dateGroups.push({
        key: 'unscheduled',
        dateLabel: 'Unscheduled / Kick-off TBD',
        isUnscheduled: true,
        matches: unscheduled,
      })
    }

    const dateLabel =
      sortedYmds.length === 0
        ? 'Unscheduled / Kick-off TBD'
        : sortedYmds.length === 1
          ? formatYmdFull(sortedYmds[0])
          : `${formatYmdShort(sortedYmds[0])} – ${formatYmdShort(sortedYmds[sortedYmds.length - 1])} (${sortedYmds.length} Matchdays)`

    const completedCount = list.filter((m) => m.hs !== '' && m.as !== '').length
    groups.push({
      key,
      roundNum,
      label: key === 'unscheduled' && !explicitRound ? `Game Week ${roundNum} (TBD)` : `Game Week ${roundNum}`,
      dateLabel,
      unscheduledCount: unscheduled.length,
      dateGroups,
      matches: list,
      completedCount,
    })
    idx += 1
  }

  return groups.sort((a, b) => a.roundNum - b.roundNum)
}

/* --------------------------------------------------- Searchable Club Combobox */
interface ClubOption {
  value: string
  label: string
  logo?: string | null
  id?: number | null
}

function ClubCombobox({
  options,
  value,
  onChange,
  pinnedClubSlug,
  onPinClub,
  onUnpinClub,
  hasPrompt,
  onClosePrompt,
}: {
  options: ClubOption[]
  value: string
  onChange: (slug: string) => void
  pinnedClubSlug: string | null
  onPinClub: (club: ClubOption) => void
  onUnpinClub: () => void
  hasPrompt: boolean
  onClosePrompt: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (hasPrompt) setOpen(true)
  }, [hasPrompt])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((c) => c.label.toLowerCase().includes(q))
  }, [options, query])

  const selectedClub = options.find((c) => c.value === value)

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cx(
          'inline-flex items-center justify-between gap-2 rounded-lg border bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold transition-all max-w-[210px]',
          value !== 'all'
            ? 'border-[var(--accent-ring)] text-white font-bold'
            : 'border-[var(--border)] text-[var(--text-strong)] hover:border-[var(--border-strong)]',
        )}
      >
        <span className="truncate">{selectedClub ? selectedClub.label : 'All Clubs'}</span>
        <span className="text-[10px] text-[var(--text-muted)] shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[#12141a] shadow-2xl z-50 backdrop-blur-xl">
          {hasPrompt && (
            <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-300">
              <span className="flex items-center gap-1.5">
                <span>⭐</span> Select a club to pin as My Club
              </span>
              <button
                type="button"
                onClick={onClosePrompt}
                className="text-amber-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          <div className="border-b border-[var(--border)] p-2">
            <input
              type="text"
              autoFocus
              placeholder="Search club name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-white placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-ring)]"
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => {
                onChange('all')
                setOpen(false)
                setQuery('')
              }}
              className={cx(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors',
                value === 'all'
                  ? 'bg-[var(--accent-solid)] text-[var(--on-volt)] font-bold'
                  : 'text-[var(--text-strong)] hover:bg-white/5',
              )}
            >
              <span>All Clubs</span>
              {value === 'all' && <span className="text-[11px]">✓</span>}
            </button>

            <div className="my-1 border-t border-[var(--border)]" />

            {filtered.map((club) => {
              const isSelected = value === club.value
              const isPinned = pinnedClubSlug === club.value
              return (
                <div
                  key={club.value}
                  className={cx(
                    'group flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors',
                    isSelected ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]' : 'hover:bg-white/5',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onChange(club.value)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="flex flex-1 items-center gap-2 text-left text-xs font-semibold truncate"
                  >
                    <span className="truncate">{club.label}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isPinned) {
                        onUnpinClub()
                      } else {
                        onPinClub(club)
                      }
                    }}
                    className={cx(
                      'ml-2 grid h-6 w-6 place-items-center rounded text-sm transition-all',
                      isPinned
                        ? 'text-amber-400 hover:text-amber-300'
                        : isSelected
                        ? 'text-black/40 hover:text-black'
                        : 'text-[var(--text-faint)] hover:text-amber-400',
                    )}
                    title={isPinned ? 'Unpin as My Club' : 'Pin as My Club'}
                  >
                    {isPinned ? '★' : '☆'}
                  </button>
                </div>
              )
            })}

            {filtered.length === 0 && (
              <p className="py-4 text-center text-xs text-[var(--text-muted)]">No clubs match search.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- Main Page */
export default function MatchesPage() {
  const seasonName = useSeasonName()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = searchParams.get('tab') || 'all'
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'results'>(
    initialTab === 'upcoming' ? 'upcoming' : initialTab === 'results' ? 'results' : 'all',
  )
  const [divisionFilter, setDivisionFilter] = useState<string>('all')
  const [selectedRoundKey, setSelectedRoundKey] = useState<string>('active')
  const [team, setTeam] = useState('all')

  const [allMatches, setAllMatches] = useState<Match[]>([])
  const [seasonClubs, setSeasonClubs] = useState<LeagueClub[]>([])
  const [seasons, setSeasons] = useState<LeagueSeason[]>([])
  const [seasonId, setSeasonId] = useState<number | null>(null)

  const [loading, setLoading] = useState(liveLeagueEnabled)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  // Game Week Dropdown & TBD Accordion state
  const [gwDropdownOpen, setGwDropdownOpen] = useState(false)
  const gwDropdownRef = useRef<HTMLDivElement>(null)
  const [tbdOpenState, setTbdOpenState] = useState<Record<string, boolean>>({})

  // My Club prompt state
  const [showPinPrompt, setShowPinPrompt] = useState(false)
  const [pinnedClub, setPinnedClub] = useState<PinnedClub | null>(() => {
    try {
      const saved = localStorage.getItem('iwvpl_pinned_club')
      if (saved) return JSON.parse(saved)
    } catch {}
    return null
  })

  // Close GW quick jump dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (gwDropdownRef.current && !gwDropdownRef.current.contains(e.target as Node)) {
        setGwDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Resolve active My Club (auth profile has precedence, falls back to pinned localStorage)
  const resolvedMyClub = useMemo<PinnedClub | null>(() => {
    if (user?.clubName) {
      return {
        id: user.clubId ?? null,
        name: stripFlag(user.clubName).trim(),
        slug: user.clubSlug || stripFlag(user.clubName).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      }
    }
    if (pinnedClub && pinnedClub.name) {
      return pinnedClub
    }
    return null
  }, [user, pinnedClub])

  const isMyClubActive = Boolean(
    resolvedMyClub &&
      (team === resolvedMyClub.slug ||
        team.toLowerCase() === resolvedMyClub.name.toLowerCase() ||
        stripFlag(team).toLowerCase() === resolvedMyClub.name.toLowerCase()),
  )

  // 1. Load seasons list
  useEffect(() => {
    if (!liveLeagueEnabled) {
      setAllMatches(siteData.results)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getLiveSeasons(controller.signal)
      .then((availableSeasons) => {
        setSeasons(availableSeasons)
        if (availableSeasons.length === 0) setLoading(false)
        setSeasonId((current) =>
          current != null && availableSeasons.some((season) => season.id === current)
            ? current
            : availableSeasons.find((season) => Boolean(season.is_current))?.id ??
                availableSeasons[0]?.id ??
                null,
        )
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load seasons.')
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [reload])

  // 2. Load clubs for chosen season
  useEffect(() => {
    if (!liveLeagueEnabled || seasonId === null) return
    const controller = new AbortController()
    setSeasonClubs([])
    setTeam('all')

    getLiveSeasonClubs(controller.signal, seasonId)
      .then(setSeasonClubs)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load season clubs.')
        }
      })

    return () => controller.abort()
  }, [seasonId])

  // 3. Load all matches for season
  useEffect(() => {
    if (!liveLeagueEnabled || seasonId === null) return
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getLiveMatches(controller.signal, {
      seasonId,
      limit: 500,
    })
      .then(({ matches }) => {
        setAllMatches(matches)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load matches.')
          setAllMatches(siteData.results)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [seasonId, reload])

  // Divisions available in current season matches
  const divisions = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of allMatches) {
      if (m.divisionName) {
        const key = m.divisionId != null ? String(m.divisionId) : m.divisionName
        map.set(key, m.divisionName)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        const rankDiff = divisionSortRank(a.name) - divisionSortRank(b.name)
        if (rankDiff !== 0) return rankDiff
        const numA = Number(a.id)
        const numB = Number(b.id)
        if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
          return numA - numB
        }
        return a.name.localeCompare(b.name)
      })
  }, [allMatches])

  // Club options for dropdown
  const clubOptions = useMemo<ClubOption[]>(() => {
    const clubsMap = new Map<string, { slug: string; id?: number | null }>()
    for (const m of allMatches) {
      for (const sideName of [m.home, m.away]) {
        if (sideName) {
          const name = stripFlag(sideName).trim()
          if (name && !clubsMap.has(name)) {
            const matchedSeasonClub = seasonClubs.find(
              (c) => stripFlag(c.name).toLowerCase() === name.toLowerCase(),
            )
            const slug = matchedSeasonClub?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            clubsMap.set(name, { slug, id: matchedSeasonClub?.id ?? null })
          }
        }
      }
    }
    return Array.from(clubsMap.entries())
      .map(([name, data]) => ({ value: data.slug, label: name, id: data.id }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allMatches, seasonClubs])

  // Matches scoped to selected division & club (before status filter)
  const scopedMatches = useMemo(() => {
    let result = allMatches

    if (divisionFilter !== 'all') {
      result = result.filter(
        (m) =>
          String(m.divisionId) === divisionFilter || m.divisionName === divisionFilter,
      )
    }

    const cleanTeam = String(team || 'all').trim().toLowerCase()
    if (cleanTeam !== 'all') {
      result = result.filter((m) => {
        const homeName = stripFlag(m.home).toLowerCase().trim()
        const awayName = stripFlag(m.away).toLowerCase().trim()
        const homeSlug = homeName.replace(/[^a-z0-9]+/g, '-')
        const awaySlug = awayName.replace(/[^a-z0-9]+/g, '-')
        return (
          homeSlug === cleanTeam ||
          awaySlug === cleanTeam ||
          homeName === cleanTeam ||
          awayName === cleanTeam ||
          homeName.includes(cleanTeam) ||
          awayName.includes(cleanTeam)
        )
      })
    }

    return result
  }, [allMatches, divisionFilter, team])

  // Filter matches by status
  const filteredMatches = useMemo(() => {
    if (statusFilter === 'upcoming') {
      return scopedMatches.filter((m) => m.hs === '' || m.as === '')
    }
    if (statusFilter === 'results') {
      return scopedMatches.filter((m) => m.hs !== '' && m.as !== '')
    }
    return scopedMatches
  }, [scopedMatches, statusFilter])

  // Round groups
  const roundGroups = useMemo(() => buildRoundGroups(filteredMatches), [filteredMatches])
  const allSeasonRoundGroups = useMemo(() => buildRoundGroups(allMatches), [allMatches])

  // Default active Game Week resolution (first unplayed or last)
  const defaultActiveKey = useMemo(() => {
    const firstUnplayed = roundGroups.find((rg) => rg.completedCount < rg.matches.length)
    return firstUnplayed?.key ?? roundGroups[0]?.key ?? 'all'
  }, [roundGroups])

  // Active Game Week auto-resolution
  const effectiveActiveKey = useMemo(() => {
    if (roundGroups.length === 0) return 'all'
    if (selectedRoundKey !== 'active' && selectedRoundKey !== 'all') {
      if (roundGroups.some((rg) => rg.key === selectedRoundKey)) {
        return selectedRoundKey
      }
    }
    return defaultActiveKey
  }, [roundGroups, selectedRoundKey, defaultActiveKey])

  // Visible groups to display
  const isClubScheduleMode = team !== 'all'
  const isAllGameWeeksMode = selectedRoundKey === 'all' || isClubScheduleMode

  const visibleRoundGroups = useMemo(() => {
    if (isAllGameWeeksMode) return roundGroups
    return roundGroups.filter((rg) => rg.key === effectiveActiveKey)
  }, [roundGroups, isAllGameWeeksMode, effectiveActiveKey])

  const activeGroup = useMemo(
    () => roundGroups.find((rg) => rg.key === effectiveActiveKey) ?? roundGroups[0],
    [roundGroups, effectiveActiveKey],
  )

  const activeGroupIndex = useMemo(
    () => roundGroups.findIndex((rg) => rg.key === effectiveActiveKey),
    [roundGroups, effectiveActiveKey],
  )

  // Overall season counts for the top badge
  const seasonCompletedCount = useMemo(
    () => allMatches.filter((m) => m.hs !== '' && m.as !== '').length,
    [allMatches],
  )
  const totalSeasonGameWeeks = allSeasonRoundGroups.length

  // Match Helper to test if a match is user's club
  const isMatchMyClub = (m: Match) => {
    if (!resolvedMyClub) return false
    const home = stripFlag(m.home).toLowerCase().trim()
    const away = stripFlag(m.away).toLowerCase().trim()
    const target = resolvedMyClub.name.toLowerCase().trim()
    const targetSlug = resolvedMyClub.slug.toLowerCase().trim()
    return (
      home === target ||
      away === target ||
      home.replace(/[^a-z0-9]+/g, '-') === targetSlug ||
      away.replace(/[^a-z0-9]+/g, '-') === targetSlug
    )
  }

  const getMyClubSide = (m: Match): 'home' | 'away' | null => {
    if (!resolvedMyClub) return null
    const home = stripFlag(m.home).toLowerCase().trim()
    const target = resolvedMyClub.name.toLowerCase().trim()
    const targetSlug = resolvedMyClub.slug.toLowerCase().trim()
    if (home === target || home.replace(/[^a-z0-9]+/g, '-') === targetSlug) return 'home'
    return 'away'
  }

  // Handlers
  const handleStatusChange = (next: 'all' | 'upcoming' | 'results') => {
    setStatusFilter(next)
    const nextParams = new URLSearchParams(searchParams)
    if (next === 'all') nextParams.delete('tab')
    else nextParams.set('tab', next)
    setSearchParams(nextParams, { replace: true })
  }

  const handleDivisionChange = (id: string) => {
    setDivisionFilter(id)
    setSelectedRoundKey('active')
  }

  const handleClubSelect = (slug: string) => {
    setTeam(slug)
    if (slug !== 'all') {
      setSelectedRoundKey('all')
    } else {
      setSelectedRoundKey('active')
    }
  }

  const handleMyClubToggle = () => {
    if (!resolvedMyClub) {
      setShowPinPrompt(true)
      return
    }
    if (isMyClubActive) {
      setTeam('all')
      setSelectedRoundKey('active')
    } else {
      setTeam(resolvedMyClub.slug)
      setSelectedRoundKey('all')
    }
  }

  const handlePinClub = (club: ClubOption) => {
    const data: PinnedClub = {
      id: club.id ?? null,
      name: stripFlag(club.label).trim(),
      slug: club.value,
    }
    localStorage.setItem('iwvpl_pinned_club', JSON.stringify(data))
    setPinnedClub(data)
    setShowPinPrompt(false)
  }

  const handleUnpinClub = () => {
    localStorage.removeItem('iwvpl_pinned_club')
    setPinnedClub(null)
  }

  // Stepper previous / next actions (seamless wrapping, jump to GW1 or last from "All")
  const handlePrevGw = () => {
    if (roundGroups.length === 0) return
    if (selectedRoundKey === 'all') {
      const last = roundGroups[roundGroups.length - 1]
      if (last) setSelectedRoundKey(last.key)
      return
    }
    if (activeGroupIndex > 0) {
      setSelectedRoundKey(roundGroups[activeGroupIndex - 1].key)
    } else {
      const last = roundGroups[roundGroups.length - 1]
      if (last) setSelectedRoundKey(last.key)
    }
  }

  const handleNextGw = () => {
    if (roundGroups.length === 0) return
    if (selectedRoundKey === 'all') {
      const first = roundGroups[0]
      if (first) setSelectedRoundKey(first.key)
      return
    }
    if (activeGroupIndex >= 0 && activeGroupIndex < roundGroups.length - 1) {
      setSelectedRoundKey(roundGroups[activeGroupIndex + 1].key)
    } else {
      const first = roundGroups[0]
      if (first) setSelectedRoundKey(first.key)
    }
  }

  // Summary counts for the attached header bar
  const summaryCompletedCount = useMemo(() => {
    if (selectedRoundKey === 'all') {
      return filteredMatches.filter((m) => m.hs !== '' && m.as !== '').length
    }
    return activeGroup?.completedCount ?? 0
  }, [selectedRoundKey, filteredMatches, activeGroup])

  const summaryTotalCount = useMemo(() => {
    if (selectedRoundKey === 'all') {
      return filteredMatches.length
    }
    return activeGroup?.matches.length ?? 0
  }, [selectedRoundKey, filteredMatches, activeGroup])

  const summaryTbdCount = useMemo(() => {
    if (selectedRoundKey === 'all') {
      return filteredMatches.filter((m) => !extractMatchYmd(m)).length
    }
    return activeGroup?.unscheduledCount ?? 0
  }, [selectedRoundKey, filteredMatches, activeGroup])

  const isAwayFromActive =
    selectedRoundKey === 'all'
      ? true
      : selectedRoundKey !== 'active' && effectiveActiveKey !== defaultActiveKey

  return (
    <div className="page-enter">
      {/* 1. Header with Consolidated Season Selector & High-level Progress Badge */}
      <PageHeader
        eyebrow="Fixtures & Results"
        title="Matches"
        lede={`Game-week-by-game-week schedule, kick-off times and official results for ${seasonName}. Published in SGT (UTC+8).`}
        action={
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {seasons.length > 0 && (
              <div className="w-full sm:w-auto sm:min-w-56">
                <Select
                  value={seasonId != null ? String(seasonId) : ''}
                  onChange={(val) => setSeasonId(Number(val))}
                  options={seasons.map((s) => ({
                    value: String(s.id),
                    label: `${s.name}${s.is_current ? ' (Current)' : ''}`,
                  }))}
                />
              </div>
            )}
            <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3.5 py-2.5 text-xs font-semibold text-[var(--text-muted)] shadow-sm">
              <span className="font-extrabold text-[var(--text-strong)]">
                {totalSeasonGameWeeks} Game Weeks
              </span>
              <span className="text-[var(--text-faint)]">•</span>
              <span>
                {seasonCompletedCount} / {allMatches.length} Played
              </span>
            </div>
          </div>
        }
      />

      {/* 2. Unified Sticky Toolbar: Architectural Division Tabs + Status + My Club + Club */}
      <div className="sticky top-16 lg:top-[72px] z-30 border-b border-[var(--border)] bg-[#0a0b0e]/90 backdrop-blur-md transition-all">
        <Container size="wide">
          <div className="flex flex-col gap-3 py-2 sm:py-2.5 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Architectural Division Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-[var(--border)] lg:border-b-0 pb-1 lg:pb-0">
              <button
                type="button"
                onClick={() => handleDivisionChange('all')}
                className={cx(
                  'relative whitespace-nowrap pb-2 pt-1.5 px-3 text-xs sm:text-sm font-extrabold uppercase tracking-wider transition-colors',
                  divisionFilter === 'all'
                    ? 'text-white border-b-2 border-[#c4f82a]'
                    : 'text-[var(--text-muted)] hover:text-white border-b-2 border-transparent',
                )}
              >
                All Divisions
              </button>
              {divisions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleDivisionChange(d.id)}
                  className={cx(
                    'relative whitespace-nowrap pb-2 pt-1.5 px-3 text-xs sm:text-sm font-extrabold uppercase tracking-wider transition-colors',
                    divisionFilter === d.id
                      ? 'text-white border-b-2 border-[#c4f82a]'
                      : 'text-[var(--text-muted)] hover:text-white border-b-2 border-transparent',
                  )}
                >
                  {d.name}
                </button>
              ))}
            </div>

            {/* Right Group: Status Segmented Control + "My Club" Toggle + Club Combobox */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              {/* Status Segmented Control */}
              <div className="flex items-center rounded-lg bg-[var(--surface-2)] p-1 border border-[var(--border)]">
                {(['all', 'upcoming', 'results'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => handleStatusChange(tab)}
                    className={cx(
                      'rounded-md px-3 py-1.5 text-xs font-bold capitalize transition-colors',
                      statusFilter === tab
                        ? 'bg-[var(--accent-solid)] text-[var(--on-volt)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-white',
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* "My Club" Quick Toggle Pill */}
              <button
                type="button"
                onClick={handleMyClubToggle}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all border',
                  isMyClubActive
                    ? 'border-[#c4f82a] bg-[#c4f82a]/15 text-[#c4f82a] shadow-[0_0_12px_rgba(196,248,42,0.25)]'
                    : resolvedMyClub
                    ? 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-strong)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]'
                    : 'border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-white hover:border-[var(--accent-ring)]',
                )}
                title={
                  resolvedMyClub
                    ? `Filter to ${resolvedMyClub.name}'s season schedule`
                    : 'Pin your favourite club for 1-click access'
                }
              >
                <span className={isMyClubActive ? 'text-[#c4f82a]' : 'text-amber-400'}>★</span>
                <span>{resolvedMyClub ? resolvedMyClub.name : 'My Club'}</span>
              </button>

              {/* Club Combobox with Pin Feature */}
              <ClubCombobox
                options={clubOptions}
                value={team}
                onChange={handleClubSelect}
                pinnedClubSlug={resolvedMyClub?.slug ?? null}
                onPinClub={handlePinClub}
                onUnpinClub={handleUnpinClub}
                hasPrompt={showPinPrompt}
                onClosePrompt={() => setShowPinPrompt(false)}
              />
            </div>
          </div>
        </Container>
      </div>

      <Section>
        <Container size="wide">
          {/* Main Fixtures & Results Container */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-solid)] border-t-transparent" />
              <p className="mt-4 text-xs font-semibold text-[var(--text-muted)]">
                Loading fixtures and results…
              </p>
            </div>
          ) : error && allMatches.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[var(--danger-text)]">{error}</p>
              <button
                type="button"
                onClick={() => setReload((v) => v + 1)}
                className="mt-3 text-xs font-semibold underline text-[var(--accent-text)]"
              >
                Retry
              </button>
            </div>
          ) : visibleRoundGroups.length === 0 ? (
            <EmptyState
              title="No matches found"
              hint={
                team !== 'all'
                  ? `No fixtures found for the selected club and filters.`
                  : 'No fixtures match the selected filters.'
              }
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm">
              {/* ATTACHED FIXTURE CARD HEADER BAR (Eliminates floating box & dead space) */}
              {isClubScheduleMode ? (
                /* Club Schedule Mode Header Bar */
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-tint)]/40 via-[var(--surface-2)] to-[var(--surface-2)] px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent-solid)] font-black text-[var(--on-volt)] text-xs shadow-sm">
                      ★
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-white">
                          {clubOptions.find((c) => c.value === team)?.label || team} Schedule
                        </span>
                        {isMyClubActive && (
                          <span className="rounded bg-[var(--accent-solid)] px-1.5 py-0.2 text-[9px] font-black uppercase text-[var(--on-volt)]">
                            My Club
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Full chronological run-in across all Game Weeks
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-[var(--text-muted)]">
                      {summaryCompletedCount}/{summaryTotalCount} Played
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTeam('all')
                        setSelectedRoundKey('active')
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-bold text-[var(--text-muted)] transition-colors hover:text-white hover:border-[var(--border-strong)]"
                    >
                      ✕ Clear
                    </button>
                  </div>
                </div>
              ) : (
                /* Standard Game Week Stepper Header Bar (Attached directly to Fixture Card) */
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white/[0.02] px-4 py-3 sm:px-5">
                  {/* Left: Tightly Grouped Stepper Cluster (Kill the Dead Space: 6px gap) */}
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePrevGw}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-base font-extrabold text-[var(--text-strong)] transition-all hover:border-[var(--accent-ring)] hover:bg-white/5 active:scale-95"
                      title={selectedRoundKey === 'all' ? 'Jump to last Game Week' : 'Previous Game Week'}
                      aria-label="Previous Game Week"
                    >
                      ‹
                    </button>

                    {/* Center interactive trigger pill */}
                    <div className="relative" ref={gwDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setGwDropdownOpen((prev) => !prev)}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 sm:px-4 text-center transition-all hover:border-[var(--accent-ring)] hover:bg-[var(--surface-hover)] active:scale-98"
                      >
                        <span className="font-display text-xs sm:text-sm font-black uppercase tracking-wider text-[var(--accent-text)]">
                          {selectedRoundKey === 'all'
                            ? `ALL GAME WEEKS (${roundGroups.length})`
                            : activeGroup?.label ?? 'GAME WEEK'}
                        </span>
                        {activeGroup?.dateLabel && selectedRoundKey !== 'all' && (
                          <>
                            <span className="text-[var(--text-faint)] hidden sm:inline">•</span>
                            <span className="text-xs font-bold text-[var(--text-strong)] hidden md:inline truncate max-w-[260px]">
                              {activeGroup.dateLabel}
                            </span>
                          </>
                        )}
                        <span className="text-xs text-[var(--text-muted)]">▾</span>
                      </button>

                      {gwDropdownOpen && (
                        <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 w-72 sm:w-84 max-h-80 overflow-y-auto rounded-2xl border border-[var(--border-strong)] bg-[#12141a] p-2 shadow-2xl z-50 backdrop-blur-xl">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRoundKey('all')
                              setGwDropdownOpen(false)
                            }}
                            className={cx(
                              'flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-bold transition-colors',
                              selectedRoundKey === 'all'
                                ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                                : 'text-[var(--text-strong)] hover:bg-white/5',
                            )}
                          >
                            <span>All Game Weeks (Full Season)</span>
                            <span className="text-[10px] opacity-75">{roundGroups.length} Game Weeks</span>
                          </button>
                          <div className="my-1 border-t border-[var(--border)]" />
                          {roundGroups.map((rg) => (
                            <button
                              key={rg.key}
                              type="button"
                              onClick={() => {
                                setSelectedRoundKey(rg.key)
                                setGwDropdownOpen(false)
                              }}
                              className={cx(
                                'flex w-full items-center justify-between rounded-xl px-3.5 py-2 text-left text-xs transition-colors',
                                selectedRoundKey === rg.key ||
                                  (selectedRoundKey === 'active' && rg.key === effectiveActiveKey)
                                  ? 'bg-[var(--accent-solid)] text-[var(--on-volt)] font-black'
                                  : 'text-[var(--text-strong)] hover:bg-white/5 font-medium',
                              )}
                            >
                              <div>
                                <div className="font-bold">{rg.label}</div>
                                <div className="text-[10px] opacity-70 truncate max-w-[170px]">
                                  {rg.dateLabel}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold opacity-80 shrink-0">
                                {rg.completedCount}/{rg.matches.length} played
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleNextGw}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-base font-extrabold text-[var(--text-strong)] transition-all hover:border-[var(--accent-ring)] hover:bg-white/5 active:scale-95"
                      title={selectedRoundKey === 'all' ? 'Jump to Game Week 1' : 'Next Game Week'}
                      aria-label="Next Game Week"
                    >
                      ›
                    </button>
                  </div>

                  {/* Right side: Quick Reset to Current GW + Status Summary Pill */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    {isAwayFromActive && (
                      <button
                        type="button"
                        onClick={() => setSelectedRoundKey('active')}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent-ring)]/40 bg-[var(--accent-tint)]/30 px-2.5 py-1 text-[11px] font-bold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-solid)] hover:text-[var(--on-volt)]"
                        title="Jump back to current active Game Week"
                      >
                        <span>Current GW</span>
                        <span className="text-[10px]">↺</span>
                      </button>
                    )}

                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">
                      <span className="font-bold text-white">
                        {summaryCompletedCount}/{summaryTotalCount} Played
                      </span>
                      {summaryTbdCount > 0 && (
                        <>
                          <span className="opacity-50">•</span>
                          <span className="text-amber-400">+{summaryTbdCount} TBD</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CARD BODY: Fixtures (Single Game Week or Sequential All Game Weeks) */}
              <div className="divide-y divide-[var(--border)]">
                {visibleRoundGroups.map((rg) => {
                  const confirmedDateGroups = rg.dateGroups.filter((dg) => !dg.isUnscheduled)
                  const tbdGroup = rg.dateGroups.find((dg) => dg.isUnscheduled)
                  const hasMyClubInTbd = Boolean(
                    tbdGroup && tbdGroup.matches.some((m) => isMatchMyClub(m)),
                  )
                  const isTbdOpen = tbdOpenState[rg.key] ?? hasMyClubInTbd

                  return (
                    <div key={rg.key}>
                      {/* Game Week Divider Bar (only when in All Game Weeks mode) */}
                      {isAllGameWeeksMode && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="inline-flex items-center rounded-lg bg-[var(--accent-solid)] px-2 py-0.5 font-display text-xs font-black uppercase tracking-wider text-[var(--on-volt)]">
                              {rg.label}
                            </span>
                            <span className="text-xs font-bold text-[var(--text-strong)]">
                              📅 {rg.dateLabel}
                            </span>
                          </div>
                          <span className="numeric text-xs font-bold text-[var(--text-muted)]">
                            {rg.completedCount}/{rg.matches.length} Played
                          </span>
                        </div>
                      )}

                      {/* Confirmed Fixtures (Sub-grouped by Date) */}
                      <div className="divide-y divide-[var(--border)]">
                        {confirmedDateGroups.map((dg) => (
                          <div key={dg.key}>
                            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--accent-tint)]/25 px-5 py-2 text-[11px] font-bold text-[var(--accent-text)]">
                              <span>📅 {dg.dateLabel}</span>
                              <span className="numeric text-[10px] opacity-80">
                                {dg.matches.length} {dg.matches.length === 1 ? 'Fixture' : 'Fixtures'}
                              </span>
                            </div>
                            <div className="divide-y divide-[var(--border)]">
                              {dg.matches.map((m) => {
                                const isMyClubMatch = isMatchMyClub(m)
                                const myClubSide = isMyClubMatch ? getMyClubSide(m) : null
                                const divTag =
                                  divisionFilter === 'all'
                                    ? formatDivisionTag(m.divisionName)
                                    : undefined
                                return (
                                  <MatchRow
                                    key={m.id ? `match-${m.id}` : `${m.url}-${m.home}-${m.away}`}
                                    match={m}
                                    showTimeOnly
                                    isMyClub={isMyClubMatch}
                                    myClubSide={myClubSide}
                                    divisionBadge={divTag}
                                    gameWeekTag={isClubScheduleMode ? m.roundNumber : null}
                                    index={m.id ? m.id : matchIndexOf(m)}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Compact TBD Section (Collapsible Footer Drawer) */}
                      {tbdGroup && tbdGroup.matches.length > 0 && (
                        <div className="border-t border-[var(--border)] bg-black/20">
                          <button
                            type="button"
                            onClick={() =>
                              setTbdOpenState((prev) => ({
                                ...prev,
                                [rg.key]: !isTbdOpen,
                              }))
                            }
                            className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                          >
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="text-xs font-bold text-[var(--text-muted)]">
                                ⚪ Unscheduled / Kick-off TBD
                              </span>
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-extrabold text-[var(--text-muted)]">
                                {tbdGroup.matches.length} Fixtures
                              </span>
                              {hasMyClubInTbd && (
                                <span className="rounded bg-[var(--accent-solid)] px-1.5 py-0.5 text-[9px] font-black uppercase text-[var(--on-volt)]">
                                  Includes My Club
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-bold text-[var(--accent-text)]">
                              {isTbdOpen ? '▾ Hide TBD Fixtures' : '▸ View TBD Fixtures'}
                            </span>
                          </button>

                          {isTbdOpen && (
                            <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                              {tbdGroup.matches.map((m) => {
                                const isMyClubMatch = isMatchMyClub(m)
                                const myClubSide = isMyClubMatch ? getMyClubSide(m) : null
                                const divTag =
                                  divisionFilter === 'all'
                                    ? formatDivisionTag(m.divisionName)
                                    : undefined
                                return (
                                  <MatchRow
                                    key={m.id ? `match-${m.id}` : `${m.url}-${m.home}-${m.away}`}
                                    match={m}
                                    showTimeOnly
                                    isMyClub={isMyClubMatch}
                                    myClubSide={myClubSide}
                                    divisionBadge={divTag}
                                    gameWeekTag={isClubScheduleMode ? m.roundNumber : null}
                                    index={m.id ? m.id : matchIndexOf(m)}
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <p className="mt-12 text-center text-xs text-[var(--text-faint)]">
            Match kick-off times are published in Malaysia/Singapore Time (SGT, UTC+8). Fixtures and
            schedules are managed via the official {SITE.shortName} League System.
          </p>
        </Container>
      </Section>
    </div>
  )
}
