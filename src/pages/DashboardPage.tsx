/**
 * The signed-in dashboard — Game-Style Command Center ("Career Mode Hub").
 *
 * Route: /dashboard
 * Isolated and adapts dynamically between Manager Mode (Full Control)
 * and Normal Player Mode (Read-Only Tactics + Personal Locker).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { Pitch, JerseyIcon } from '@/components/club'
import { SignPlayerModal } from '@/components/manager/SignPlayerModal'
import { AccountSettingsModal } from '@/components/layout/AccountSettingsModal'
import { Button, ButtonLink, EmptyState, SmartImage } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import {
  ApiError,
  cancelOffer,
  createManagerSelfPlayer,
  decideOffer,
  incomingOffers,
  leaveClub,
  managerOffers,
  playerOverview,
  saveManagerLineup,
  squad,
  updateManagerClub,
  updateMyPlayerProfile,
  updateSquadPlayerShirt,
  releaseSquadPlayer,
  getManagerJoinRequests,
  decideJoinRequest,
  getPlayerJoinRequests,
  cancelJoinRequest,
  getTransferWindowStatus,
  type JoinRequest,
  type ManagerClub,
  type Offer,
} from '@/lib/api'
import {
  buildSquadFromLineup,
  FORMATIONS,
  type ClubLineup,
  type ClubLineupBench,
  type ClubLineupSlot,
  type PitchPlayer,
  type Squad,
} from '@/lib/fixtures'
import { AVATAR_PLACEHOLDER, CLUB_PLACEHOLDER, compressClubLogo, cx, stripFlag } from '@/lib/format'
import { getLiveClubs, getLiveMatches, type Club, type Match } from '@/lib/liveLeague'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

type HubTab = 'central' | 'tactics' | 'transfers' | 'calendar' | 'settings'

function parseKickoffDate(m: Match): Date | null {
  if (m.kickoff) {
    const d = new Date(m.kickoff)
    if (!Number.isNaN(d.getTime())) return d
  }
  if (m.date) {
    const d = new Date(m.date)
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function msg(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred.'
}

// Color coding helper for EA FC style position pills
function getPositionBadgeStyle(pos: string) {
  const p = (pos || '').toUpperCase().trim()
  if (p === 'GK') {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  }
  if (['LB', 'CB', 'RB', 'LWB', 'RWB', 'SW'].includes(p)) {
    return 'bg-sky-500/20 text-sky-300 border-sky-500/40'
  }
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p)) {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
  }
  if (['LW', 'RW', 'ST', 'CF'].includes(p)) {
    return 'bg-rose-500/20 text-rose-300 border-rose-500/40'
  }
  return 'bg-white/10 text-slate-300 border-white/10'
}

export default function DashboardPage() {
  const { user, status: authStatus, logout } = useAuth()
  const navigate = useNavigate()

  // Guard: if unauthenticated, redirect to login
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      navigate('/login?next=/dashboard')
    }
  }, [authStatus, navigate])

  const isManager =
    user?.role === 'club_manager' || user?.role === 'admin' || user?.role === 'owner'

  // Navigation & View state
  const [activeTab, setActiveTab] = useState<HubTab>('central')
  // Handle URL hash navigation (e.g. #notifications, #settings, #tactics, #calendar)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase()
      if (hash.includes('settings')) {
        setShowSettingsModal(true)
      } else if (hash.includes('notifications') || hash.includes('inbox') || hash.includes('transfers')) {
        setActiveTab('transfers')
      } else if (hash.includes('tactics') || hash.includes('squad')) {
        setActiveTab('tactics')
      } else if (hash.includes('calendar') || hash.includes('schedule') || hash.includes('fixtures')) {
        setActiveTab('calendar')
      }
    }
    handleHash()
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  // Shared League Data
  const [transferWindowOpen, setTransferWindowOpen] = useState(true)
  const [maxSquadSize, setMaxSquadSize] = useState(23)
  const [allClubs, setAllClubs] = useState<Club[]>([])

  // Shared Club & Squad state
  const [myClub, setMyClub] = useState<ManagerClub | null>(null)
  const [clubManagers, setClubManagers] = useState<Array<{ name: string; email?: string }>>([])
  const [squadList, setSquadList] = useState<
    Array<{
      id: number
      gamertag: string
      slug?: string
      shirt_number?: number | null
      avatar_local?: string | null
      is_free_agent: number
      position?: string | null
      user_id?: number | null
    }>
  >([])

  // Player Overview state (for normal players)
  const [playerInfo, setPlayerInfo] = useState<{
    id: number
    gamertag: string
    shirt_number?: number | null
    avatar_local?: string | null
    platform?: string | null
    primary_position?: string | null
    club_id?: number | null
  } | null>(null)
  const [myShirtNumber, setMyShirtNumber] = useState<string>('')

  // Tactics state
  const [formation, setFormation] = useState<string>('4-3-3')
  const [captainGamertag, setCaptainGamertag] = useState<string | null>(null)
  const [starters, setStarters] = useState<Array<ClubLineupSlot | null>>([])
  const [bench, setBench] = useState<ClubLineupBench[]>([])
  const [tacticsDrawerTab, setTacticsDrawerTab] = useState<'starters' | 'bench' | 'roster'>('starters')
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null)
  const [slotSearch, setSlotSearch] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSavedPayloadRef = useRef<string>('')
  const isInitializedRef = useRef(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close Pitch Slot Popover on outside click or Escape key
  useEffect(() => {
    if (activeSlotIdx === null) return

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return
      }
      // If clicking directly on a pitch slot marker, let the slot button onClick handle the switch
      const targetEl = e.target as HTMLElement | null
      if (targetEl?.closest('[data-pitch-slot]')) {
        return
      }
      setActiveSlotIdx(null)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveSlotIdx(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeSlotIdx])

  // Transfers & Inbox state
  const [managerOffersList, setManagerOffersList] = useState<Offer[]>([])
  const [managerJoinRequests, setManagerJoinRequests] = useState<JoinRequest[]>([])
  const [playerOffersList, setPlayerOffersList] = useState<Offer[]>([])
  const [playerJoinRequestsList, setPlayerJoinRequestsList] = useState<JoinRequest[]>([])
  const [showSignModal, setShowSignModal] = useState(false)

  // Matches & Calendar state
  const [matches, setMatches] = useState<Match[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null)
  const [listMode, setListMode] = useState<'upcoming' | 'results'>('upcoming')
  const [fixturePage, setFixturePage] = useState(1)

  // Club identity edit state (Manager)
  const [editShortCode, setEditShortCode] = useState('')
  const [clubLogoDraft, setClubLogoDraft] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)

  // Manager Self Kit state
  const [selfGamertag, setSelfGamertag] = useState('')
  const [selfShirtNumber, setSelfShirtNumber] = useState('')
  const [selfBusy, setSelfBusy] = useState(false)

  // Load League transfer window status & all clubs
  useEffect(() => {
    const controller = new AbortController()
    getTransferWindowStatus(controller.signal)
      .then((status) => {
        setTransferWindowOpen(status.open)
        if (typeof status.maxSquadSize === 'number') {
          setMaxSquadSize(status.maxSquadSize)
        }
      })
      .catch(() => {})

    getLiveClubs(controller.signal)
      .then((clubs) => setAllClubs(clubs))
      .catch(() => {})

    return () => controller.abort()
  }, [])

  // Map of club logos by normalized club name & slug for robust crest resolution
  const clubLogoMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of allClubs) {
      if (c.logo) {
        map.set(stripFlag(c.name).toLowerCase().trim(), c.logo)
        if (c.slug) map.set(c.slug.toLowerCase().trim(), c.logo)
      }
    }
    return map
  }, [allClubs])

  // Initialize Lineup state from club
  const initLineupState = useCallback(
    (clubData: ManagerClub | null, players: typeof squadList) => {
      const saved = clubData?.starting_xi
      const fmtKey = saved?.formation && FORMATIONS[saved.formation] ? saved.formation : '4-3-3'
      const slots = (FORMATIONS[fmtKey] || FORMATIONS['4-3-3']).slots
      const initialCaptain =
        saved?.captainGamertag ??
        saved?.starters?.find((s) => s?.isCaptain)?.gamertag ??
        null

      setCaptainGamertag(initialCaptain)
      setFormation(fmtKey)

      const mappedStarters = slots.map(([pos], idx) => {
        const s = saved?.starters?.[idx]
        if (s && s.gamertag) {
          const pMatch = players.find(
            (p) =>
              (s.playerId && p.id === s.playerId) ||
              p.gamertag.toLowerCase() === s.gamertag.toLowerCase(),
          )
          const num = pMatch?.shirt_number ?? s.shirtNumber ?? s.number ?? idx + 1
          const isCap = Boolean(
            s.isCaptain ||
              (initialCaptain && s.gamertag.toLowerCase() === initialCaptain.toLowerCase()),
          )
          return {
            position: pos,
            role: pos,
            playerId: s.playerId ?? pMatch?.id ?? null,
            gamertag: s.gamertag,
            shirtNumber: num,
            number: num,
            isCaptain: isCap,
          }
        }
        return null
      })
      setStarters(mappedStarters)

      const benchItems = Array.isArray(saved?.bench)
        ? saved.bench.map((b, idx) => {
            const pMatch = players.find(
              (p) =>
                (b.playerId && p.id === b.playerId) ||
                p.gamertag.toLowerCase() === b.gamertag.toLowerCase(),
            )
            const num = pMatch?.shirt_number ?? b.shirtNumber ?? b.number ?? 12 + idx
            return {
              playerId: b.playerId ?? pMatch?.id ?? null,
              gamertag: b.gamertag,
              shirtNumber: num,
              number: num,
              position: b.position || b.role || 'SUB',
              role: b.position || b.role || 'SUB',
            }
          })
        : []
      setBench(benchItems)

      lastSavedPayloadRef.current = JSON.stringify({
        formation: fmtKey,
        captainGamertag: initialCaptain,
        starters: mappedStarters,
        bench: benchItems,
      })
      isInitializedRef.current = true
    },
    [],
  )

  // Data Loading: Manager Mode
  const loadManagerData = useCallback(async () => {
    try {
      const [squadRes, offersRes, reqsRes] = await Promise.all([
        squad(),
        managerOffers().catch(() => ({ offers: [] })),
        getManagerJoinRequests().catch(() => ({ requests: [] })),
      ])
      setMyClub(squadRes.club)
      setEditShortCode(squadRes.club.short_code ?? '')
      setSquadList(squadRes.squad)
      if (Array.isArray((squadRes as any).managers)) {
        setClubManagers((squadRes as any).managers)
      }
      setManagerOffersList(offersRes.offers)
      setManagerJoinRequests(reqsRes.requests)
      initLineupState(squadRes.club, squadRes.squad)

      // Sync manager's kit number from roster
      const meInSquad = squadRes.squad.find(
        (p: any) =>
          (user?.playerId && p.id === user.playerId) ||
          (user?.id && p.user_id === user.id) ||
          Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()),
      )
      if (meInSquad?.shirt_number != null) {
        setSelfShirtNumber(String(meInSquad.shirt_number))
        setMyShirtNumber(String(meInSquad.shirt_number))
      }
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    }
  }, [initLineupState, user])

  // Data Loading: Player Mode
  const loadPlayerData = useCallback(async () => {
    try {
      const [overview, incomingRes, pReqsRes] = await Promise.all([
        playerOverview(),
        incomingOffers().catch(() => ({ offers: [] })),
        getPlayerJoinRequests().catch(() => ({ requests: [] })),
      ])
      setPlayerInfo(overview.player)
      setMyShirtNumber(
        overview.player.shirt_number != null ? String(overview.player.shirt_number) : '',
      )
      setPlayerOffersList(incomingRes.offers)
      setPlayerJoinRequestsList(pReqsRes.requests)

      if (overview.club) {
        const clubRes = await fetch(`/api/clubs/${encodeURIComponent(overview.club.slug)}`).then((r) =>
          r.json(),
        )
        if (clubRes && clubRes.id) {
          const clubObj: ManagerClub = {
            id: clubRes.id,
            name: clubRes.name,
            slug: clubRes.slug,
            short_code: clubRes.short_code ?? null,
            flag: clubRes.flag ?? null,
            logo_local: clubRes.logo_local ?? null,
            logo_url: clubRes.logo_url ?? null,
            status: clubRes.status ?? 'active',
            starting_xi: clubRes.starting_xi ?? null,
          }
          setMyClub(clubObj)
          const pList = (clubRes.players ?? []).map((p: any) => ({
            id: p.id,
            gamertag: p.gamertag,
            slug: p.slug,
            shirt_number: p.shirt_number,
            avatar_local: p.avatar_local,
            is_free_agent: p.is_free_agent ? 1 : 0,
            pending: 0,
            user_id: p.user_id,
            position: p.position,
          }))
          setSquadList(pList)
          initLineupState(clubObj, pList)
        }
      }
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    }
  }, [initLineupState])

  // Initial load effect based on user role
  useEffect(() => {
    if (!user) return
    if (isManager) {
      void loadManagerData()
    } else {
      void loadPlayerData()
    }
  }, [user, isManager, loadManagerData, loadPlayerData])

  // Matches Calendar loading
  useEffect(() => {
    const slug = myClub?.slug
    const name = myClub?.name
    if (!slug && !name) {
      setMatches([])
      return
    }
    const controller = new AbortController()
    setCalendarLoading(true)

    getLiveMatches(controller.signal, {
      clubSlug: slug || undefined,
      limit: 200,
    })
      .then(({ matches: fetched }) => {
        let clubMatches = fetched
        if (name && (!slug || clubMatches.length === 0)) {
          const target = stripFlag(name).toLowerCase().trim()
          clubMatches = fetched.filter(
            (m) =>
              stripFlag(m.home).toLowerCase().trim() === target ||
              stripFlag(m.away).toLowerCase().trim() === target,
          )
        }
        setMatches(clubMatches)

        // Focus to upcoming fixture
        const dated = clubMatches
          .map((m) => ({ m, d: parseKickoffDate(m) }))
          .filter((x): x is { m: Match; d: Date } => x.d !== null)
          .sort((a, b) => a.d.getTime() - b.d.getTime())

        if (dated.length > 0) {
          const upcoming = dated.find((x) => x.m.hs === '' || x.m.as === '')
          const focusDate = upcoming ? upcoming.d : dated[dated.length - 1].d
          setViewYear(focusDate.getFullYear())
          setViewMonth(focusDate.getMonth())
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setMatches([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setCalendarLoading(false)
      })

    return () => controller.abort()
  }, [myClub?.slug, myClub?.name])

  // Auto-save Manager Tactics with debounce
  useEffect(() => {
    if (!isManager || !isInitializedRef.current || !myClub) return

    const currentPayload: ClubLineup = {
      formation,
      captainGamertag,
      starters: starters.map((s) =>
        s
          ? {
              ...s,
              isCaptain: Boolean(
                captainGamertag &&
                  s.gamertag.toLowerCase() === captainGamertag.toLowerCase(),
              ),
            }
          : null,
      ),
      bench,
    }
    const currentJson = JSON.stringify(currentPayload)
    if (lastSavedPayloadRef.current === currentJson) return

    setSaveStatus('saving')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveManagerLineup(currentPayload)
        lastSavedPayloadRef.current = currentJson
        setSaveStatus('saved')
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev))
        }, 2200)
      } catch {
        setSaveStatus('error')
      }
    }, 400)

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [formation, starters, bench, captainGamertag, myClub, isManager])

  // Tactical Squad Builder representation for <Pitch />
  const tacticalSquad = useMemo<Squad>(() => {
    const currentLineup: ClubLineup = {
      formation,
      captainGamertag,
      starters: starters.map((s) =>
        s
          ? {
              ...s,
              isCaptain: Boolean(
                captainGamertag && s.gamertag.toLowerCase() === captainGamertag.toLowerCase(),
              ),
            }
          : null,
      ),
      bench,
    }
    const built = buildSquadFromLineup(
      currentLineup,
      clubManagers.length > 0 ? clubManagers.map((m) => m.name).join(', ') : 'Club Manager',
      squadList.map((p) => ({ id: p.id, name: p.gamertag, shirtNumber: p.shirt_number ?? null })),
    )
    if (built) return built

    const formDef = FORMATIONS[formation] ?? FORMATIONS['4-3-3']
    return {
      formation: formDef.shape,
      starters: formDef.slots.map(([role, x, y], idx) => ({
        number: idx + 1,
        name: '—',
        role,
        x,
        y,
        isCaptain: false,
      })),
      bench: [],
      manager: 'Club Manager',
    }
  }, [formation, captainGamertag, starters, bench, clubManagers, squadList])

  // Identify logged in user's position and matchday status
  const userMatchdayStatus = useMemo(() => {
    const userTag = (user?.gamertag || playerInfo?.gamertag || '').toLowerCase().trim()
    const userPid = user?.playerId ?? playerInfo?.id ?? null

    const inSquad = squadList.find(
      (p) =>
        (userPid && p.id === userPid) ||
        (user?.id && (p as any).user_id === user.id) ||
        Boolean(userTag && p.gamertag.toLowerCase() === userTag),
    )

    const starterIdx = starters.findIndex((s) => {
      if (!s) return false
      if (userPid && s.playerId && s.playerId === userPid) return true
      if (inSquad && s.playerId && s.playerId === inSquad.id) return true
      if (userTag && s.gamertag && s.gamertag.toLowerCase() === userTag) return true
      if (inSquad && s.gamertag && s.gamertag.toLowerCase() === inSquad.gamertag.toLowerCase()) return true
      return false
    })

    if (starterIdx >= 0) {
      const pos = starters[starterIdx]?.position || (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots[starterIdx]?.[0] || 'XI'
      return {
        type: 'starting' as const,
        label: `STARTING XI • ${pos}`,
        slotIdx: starterIdx,
        pos,
      }
    }

    const benchIdx = bench.findIndex((b) => {
      if (userPid && b.playerId && b.playerId === userPid) return true
      if (inSquad && b.playerId && b.playerId === inSquad.id) return true
      if (userTag && b.gamertag && b.gamertag.toLowerCase() === userTag) return true
      if (inSquad && b.gamertag && b.gamertag.toLowerCase() === inSquad.gamertag.toLowerCase()) return true
      return false
    })

    if (benchIdx >= 0) {
      const pos = bench[benchIdx]?.position || 'SUB'
      return {
        type: 'bench' as const,
        label: `BENCH SUB • ${pos}`,
        slotIdx: null,
        pos,
      }
    }

    if (inSquad) {
      return {
        type: 'reserves' as const,
        label: 'RESERVES • ROSTER',
        slotIdx: null,
        pos: inSquad.position || '',
      }
    }

    return {
      type: isManager ? ('manager' as const) : ('unknown' as const),
      label: isManager ? 'CLUB MANAGER' : 'ROSTER MEMBER',
      slotIdx: null,
      pos: '',
    }
  }, [user, playerInfo, starters, bench, formation, squadList, isManager])

  // Calendar Day grouping
  const matchesByYmd = useMemo(() => {
    const map = new Map<string, Match[]>()
    for (const m of matches) {
      const d = parseKickoffDate(m)
      if (!d) continue
      const key = toYmd(d)
      const list = map.get(key) ?? []
      list.push(m)
      map.set(key, list)
    }
    return map
  }, [matches])

  // Sorted upcoming and completed matches
  const sortedMatches = useMemo(() => {
    return matches.slice().sort((a, b) => {
      const ra = a.roundNumber ?? 9999
      const rb = b.roundNumber ?? 9999
      if (ra !== rb) return ra - rb
      const ka = a.kickoff || '9999-12-31'
      const kb = b.kickoff || '9999-12-31'
      if (ka !== kb) return ka.localeCompare(kb)
      return (a.id ?? 0) - (b.id ?? 0)
    })
  }, [matches])

  const upcomingMatches = useMemo(
    () => sortedMatches.filter((m) => m.hs === '' || m.as === ''),
    [sortedMatches],
  )
  const completedMatches = useMemo(
    () => sortedMatches.filter((m) => m.hs !== '' && m.as !== ''),
    [sortedMatches],
  )

  const nextMatch = upcomingMatches[0] ?? null
  const runInMatches = upcomingMatches.slice(0, 3)

  const prevMonth = () => {
    setSelectedYmd(null)
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    setSelectedYmd(null)
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const goToday = () => {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    setSelectedYmd(toYmd(now))
  }

  // Calendar cells for (viewYear, viewMonth) starting Monday
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const lastDay = new Date(viewYear, viewMonth + 1, 0)
    const startDow = (firstDay.getDay() + 6) % 7 // 0 = Mon, 6 = Sun
    const daysInMonth = lastDay.getDate()

    const cells: Array<{
      ymd: string
      day: number
      inMonth: boolean
      isToday: boolean
      fixtures: Match[]
    }> = []

    const todayYmd = toYmd(new Date())

    // Previous month trailing days
    const prevMonthLast = new Date(viewYear, viewMonth, 0).getDate()
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, prevMonthLast - i)
      const ymd = toYmd(d)
      cells.push({
        ymd,
        day: d.getDate(),
        inMonth: false,
        isToday: ymd === todayYmd,
        fixtures: matchesByYmd.get(ymd) ?? [],
      })
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewYear, viewMonth, day)
      const ymd = toYmd(d)
      cells.push({
        ymd,
        day,
        inMonth: true,
        isToday: ymd === todayYmd,
        fixtures: matchesByYmd.get(ymd) ?? [],
      })
    }

    // Next month leading days to complete week
    const remainder = (7 - (cells.length % 7)) % 7
    for (let day = 1; day <= remainder; day++) {
      const d = new Date(viewYear, viewMonth + 1, day)
      const ymd = toYmd(d)
      cells.push({
        ymd,
        day,
        inMonth: false,
        isToday: ymd === todayYmd,
        fixtures: matchesByYmd.get(ymd) ?? [],
      })
    }

    return cells
  }, [viewYear, viewMonth, matchesByYmd])

  useEffect(() => {
    setFixturePage(1)
  }, [selectedYmd, listMode, myClub?.slug, myClub?.name])

  const activeSideList = useMemo(() => {
    if (selectedYmd) {
      return matchesByYmd.get(selectedYmd) ?? []
    }
    return listMode === 'upcoming' ? upcomingMatches : completedMatches
  }, [selectedYmd, matchesByYmd, listMode, upcomingMatches, completedMatches])

  const FIXTURES_PER_PAGE = 4
  const totalFixturePages = Math.max(1, Math.ceil(activeSideList.length / FIXTURES_PER_PAGE))
  const safeFixturePage = Math.min(fixturePage, totalFixturePages)
  const paginatedSideList = useMemo(() => {
    return activeSideList.slice(
      (safeFixturePage - 1) * FIXTURES_PER_PAGE,
      safeFixturePage * FIXTURES_PER_PAGE,
    )
  }, [activeSideList, safeFixturePage])

  const cleanMyClub = stripFlag(myClub?.name || '').toLowerCase().trim()
  const clubCrest = myClub?.logo_local || myClub?.logo_url || CLUB_PLACEHOLDER
  const clubShortCode = myClub?.short_code || myClub?.name?.slice(0, 3)?.toUpperCase() || 'FC'

  // Fixture context helper (Fix Issue 1: Opponent Club Crest Resolution)
  const getFixtureContext = (m: Match) => {
    const homeClean = stripFlag(m.home).toLowerCase().trim()
    const awayClean = stripFlag(m.away).toLowerCase().trim()
    const isHome = homeClean === cleanMyClub
    const opponent = isHome ? stripFlag(m.away) : stripFlag(m.home)
    const oppClean = opponent.toLowerCase().trim()

    // Resolve opponent logo via match props, clubLogoMap, or snake_case fallback
    const oppLogo =
      (isHome ? m.awayLogo : m.homeLogo) ||
      clubLogoMap.get(oppClean) ||
      (isHome ? (m as any).away_logo : (m as any).home_logo) ||
      CLUB_PLACEHOLDER

    const myLogo =
      (isHome ? m.homeLogo : m.awayLogo) ||
      clubCrest ||
      clubLogoMap.get(cleanMyClub) ||
      CLUB_PLACEHOLDER

    const played = m.hs !== '' && m.as !== ''
    let outcome: 'W' | 'D' | 'L' | null = null
    if (played) {
      const myScore = isHome ? Number(m.hs) : Number(m.as)
      const oppScore = isHome ? Number(m.as) : Number(m.hs)
      if (myScore > oppScore) outcome = 'W'
      else if (myScore < oppScore) outcome = 'L'
      else outcome = 'D'
    }
    return { isHome, opponent, oppLogo, myLogo, played, outcome }
  }

  // Unread badge counts
  const unreadTransfersCount = isManager
    ? managerJoinRequests.filter((r) => r.status === 'pending').length
    : playerOffersList.filter((o) => o.status === 'pending').length

  // Handlers for Manager actions
  const handleAutoFill = () => {
    const slots = (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots
    setStarters(
      slots.map(([pos], idx) => {
        const p = squadList[idx]
        if (!p) return null
        const num = p.shirt_number ?? idx + 1
        return {
          position: pos,
          role: pos,
          playerId: p.id,
          gamertag: p.gamertag,
          shirtNumber: num,
          number: num,
          isCaptain: idx === 0,
        }
      }),
    )
    setBench(
      squadList.slice(11).map((p, idx) => ({
        playerId: p.id,
        gamertag: p.gamertag,
        shirtNumber: p.shirt_number ?? 12 + idx,
        number: p.shirt_number ?? 12 + idx,
        position: 'SUB',
        role: 'SUB',
      })),
    )
  }

  const handleClearPitch = () => {
    const slots = (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots
    setStarters(slots.map(() => null))
  }

  const handleAssignStarter = (targetSlotIdx: number, p: (typeof squadList)[0]) => {
    const slots = (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots
    const targetRole = slots[targetSlotIdx]?.[0] || 'XI'
    const num = p.shirt_number ?? targetSlotIdx + 1

    setStarters((prev) => {
      const next = [...prev]
      // Clear player from existing slot if already placed
      const existingIdx = next.findIndex(
        (s) => s && (s.playerId === p.id || s.gamertag.toLowerCase() === p.gamertag.toLowerCase()),
      )
      if (existingIdx >= 0) next[existingIdx] = null
      next[targetSlotIdx] = {
        position: targetRole,
        role: targetRole,
        playerId: p.id,
        gamertag: p.gamertag,
        shirtNumber: num,
        number: num,
        isCaptain: Boolean(captainGamertag && p.gamertag.toLowerCase() === captainGamertag.toLowerCase()),
      }
      return next
    })

    // Remove from bench if was there
    setBench((prev) =>
      prev.filter(
        (b) => !(b.playerId === p.id || b.gamertag.toLowerCase() === p.gamertag.toLowerCase()),
      ),
    )
    setActiveSlotIdx(null)
    setSlotSearch('')
  }

  // Club Identity form submit (Manager)
  const handleSaveClubIdentity = async (e: FormEvent) => {
    e.preventDefault()
    if (!myClub) return
    setBusy(true)
    try {
      const res = await updateManagerClub({
        short_code: editShortCode.trim().toUpperCase() || undefined,
        logo: clubLogoDraft,
      })
      setMyClub(res.club)
      setClubLogoDraft(null)
      setNotice({ kind: 'ok', text: 'Club identity updated successfully.' })
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  // Save Manager Shirt Number handler (Fix Issue 6)
  const handleSaveManagerShirt = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    const raw = selfShirtNumber.trim()
    const nextNum = raw === '' ? null : Number.parseInt(raw, 10)
    if (nextNum !== null && (Number.isNaN(nextNum) || nextNum < 1 || nextNum > 99)) {
      setNotice({ kind: 'error', text: 'Shirt number must be between 1 and 99.' })
      return
    }

    const mySquadPlayer = squadList.find(
      (p) =>
        (user?.playerId && p.id === user.playerId) ||
        (user?.id && (p as any).user_id === user.id) ||
        Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()),
    )

    setBusy(true)
    try {
      if (mySquadPlayer) {
        await updateSquadPlayerShirt(mySquadPlayer.id, nextNum)
      }
      await updateMyPlayerProfile({ shirtNumber: nextNum }).catch(() => {})

      setStarters((prev) =>
        prev.map((s) => {
          if (!s) return null
          const isMe =
            (mySquadPlayer && s.playerId === mySquadPlayer.id) ||
            (user?.gamertag && s.gamertag.toLowerCase() === user.gamertag.toLowerCase())
          if (isMe) {
            return {
              ...s,
              shirtNumber: nextNum ?? s.shirtNumber,
              number: nextNum ?? s.number,
            }
          }
          return s
        }),
      )
      setBench((prev) =>
        prev.map((b) => {
          const isMe =
            (mySquadPlayer && b.playerId === mySquadPlayer.id) ||
            (user?.gamertag && b.gamertag.toLowerCase() === user.gamertag.toLowerCase())
          if (isMe) {
            return {
              ...b,
              shirtNumber: nextNum ?? b.shirtNumber,
              number: nextNum ?? b.number,
            }
          }
          return b
        }),
      )

      setNotice({ kind: 'ok', text: `Saved jersey number #${nextNum ?? '—'}.` })
      await loadManagerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  // Save Player Shirt Number handler
  const handleSavePlayerShirt = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    const raw = myShirtNumber.trim()
    const parsed = raw === '' ? null : Number.parseInt(raw, 10)
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 1 || parsed > 99)) {
      setNotice({ kind: 'error', text: 'Shirt number must be between 1 and 99.' })
      return
    }
    setBusy(true)
    try {
      await updateMyPlayerProfile({ shirtNumber: parsed })
      setNotice({ kind: 'ok', text: `Saved jersey number #${parsed ?? '—'}.` })
      await loadPlayerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  // Claim self into squad (Manager playing captain)
  const handleClaimSelf = async (e: FormEvent) => {
    e.preventDefault()
    if (!selfGamertag.trim()) return
    setSelfBusy(true)
    try {
      const parsedShirt = selfShirtNumber.trim() ? Number(selfShirtNumber) : null
      await createManagerSelfPlayer({
        gamertag: selfGamertag.trim(),
        shirtNumber: parsedShirt,
        position: 'CM',
      })
      setNotice({ kind: 'ok', text: 'Added you to squad as Playing Captain.' })
      await loadManagerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setSelfBusy(false)
    }
  }

  // Leave club handler (Player)
  const handleLeaveClub = async () => {
    if (!confirm('Are you sure you want to leave your club and become a free agent?')) return
    setBusy(true)
    try {
      await leaveClub()
      setNotice({ kind: 'ok', text: 'You have left the club.' })
      await loadPlayerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  // Offer actions (Manager/Player)
  const handleCancelOffer = async (offerId: number) => {
    setBusy(true)
    try {
      await cancelOffer(offerId)
      setNotice({ kind: 'ok', text: 'Offer cancelled.' })
      if (isManager) await loadManagerData()
      else await loadPlayerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleDecideOffer = async (offerId: number, accept: boolean) => {
    setBusy(true)
    try {
      await decideOffer(offerId, accept)
      setNotice({ kind: 'ok', text: accept ? 'Offer accepted! Welcome to the team.' : 'Offer declined.' })
      await loadPlayerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  // Join Request actions
  const handleDecideJoinRequest = async (requestId: number, action: 'accept' | 'reject') => {
    setBusy(true)
    try {
      await decideJoinRequest(requestId, action)
      setNotice({ kind: 'ok', text: action === 'accept' ? 'Player signed to squad!' : 'Application declined.' })
      await loadManagerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleCancelJoinRequest = async (requestId: number) => {
    setBusy(true)
    try {
      await cancelJoinRequest(requestId)
      setNotice({ kind: 'ok', text: 'Application withdrawn.' })
      await loadPlayerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  // Squad Release handler (Manager)
  const handleReleasePlayer = async (pId: number, name: string) => {
    if (!confirm(`Are you sure you want to release ${name} from your squad?`)) return
    setBusy(true)
    try {
      await releaseSquadPlayer(pId)
      setNotice({ kind: 'ok', text: `Released ${name} to free agency.` })
      await loadManagerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08090c]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#c4f82a]" />
      </div>
    )
  }

  const isManagerInSquad = squadList.some(
    (p) =>
      (user?.playerId && p.id === user.playerId) ||
      (user?.id && p.user_id === user.id) ||
      Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()),
  )

  const activeUserShirt = isManager
    ? (selfShirtNumber || myShirtNumber || '29')
    : (myShirtNumber || '10')

  return (
    <div className="min-h-screen bg-[#08090c] text-slate-100 selection:bg-[#c4f82a] selection:text-black">
      {/* ---------------- FIX ISSUE 3: Compact Top HUD Header into 1 Single Row ---------------- */}
      <header className="sticky top-16 lg:top-[72px] z-30 backdrop-blur-md bg-[#08090c]/90 border-b border-white/[0.08] transition-all">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          {/* Left: Club Crest + Name + Role */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-black/40 p-1 shadow-inner">
              <img
                src={clubCrest}
                alt=""
                onError={(e) => {
                  e.currentTarget.src = CLUB_PLACEHOLDER
                }}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-display text-sm font-black uppercase tracking-wider text-white">
                  {myClub?.name || 'FREE AGENT'}
                </span>
                {myClub && (
                  <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider text-slate-300">
                    {clubShortCode}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {isManager ? (
                  <span className="inline-flex items-center gap-1 rounded bg-[#c4f82a]/15 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider text-[#c4f82a] border border-[#c4f82a]/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#c4f82a] animate-pulse" />
                    Manager Hub
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider text-sky-400 border border-sky-500/30">
                    Player Hub {myShirtNumber ? `• #${myShirtNumber}` : ''}
                  </span>
                )}
                {userMatchdayStatus.type !== 'unknown' && !isManager && (
                  <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    • {userMatchdayStatus.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center: Game Mode Nav Tabs with sleek segmented pill indicators */}
          <nav className="flex items-center overflow-x-auto py-1 scrollbar-none">
            <div className="inline-flex items-center gap-1 rounded-full bg-black/60 p-1 border border-white/10">
              {[
                { id: 'central', label: 'CENTRAL' },
                { id: 'tactics', label: 'TACTICS & SQUAD' },
                { id: 'transfers', label: 'TRANSFERS & INBOX', count: unreadTransfersCount },
                { id: 'calendar', label: 'CALENDAR' },
                { id: 'settings', label: 'CLUB & PRO SETTINGS' },
              ].map((t) => {
                const active = activeTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id as HubTab)}
                    className={cx(
                      'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all whitespace-nowrap',
                      active
                        ? 'bg-[#CCFF00] text-black font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    {t.label}
                    {Boolean(t.count) && (
                      <span
                        className={cx(
                          'grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-black',
                          active ? 'bg-black text-[#CCFF00]' : 'bg-[#CCFF00] text-black',
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Right: Squad Capacity + Public Link + Settings Icon */}
          <div className="flex items-center gap-2 shrink-0">
            {isManager && myClub && (
              <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-bold text-slate-300 xl:inline-block">
                {squadList.length} / {maxSquadSize} Players
              </span>
            )}
            {myClub && (
              <ButtonLink
                to={`/clubs/${myClub.slug}`}
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-white/10 text-xs font-bold hover:border-white/20 px-2.5"
              >
                <span>Club Page</span>
                <span className="text-[10px]">↗</span>
              </ButtonLink>
            )}
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/10 hover:text-white"
              title="Account Settings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Global Alerts / Notices */}
      {notice && (
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6">
          <div
            className={cx(
              'flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-xs font-semibold shadow-lg',
              notice.kind === 'ok'
                ? 'border border-[#c4f82a]/30 bg-[#c4f82a]/10 text-[#c4f82a]'
                : 'border border-red-500/30 bg-red-500/10 text-red-300',
            )}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-white/60 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Command Workspace */}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-6">
        {/* ================================================================= TAB 1: CENTRAL */}
        {activeTab === 'central' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* LEFT COLUMN (Col-span 7): Stacked Matchday Broadcast + Fixture Run-In */}
            <div className="col-span-1 lg:col-span-7 flex flex-col gap-6">
              {/* Tile A: Next Matchday Broadcast Card (Sleek Compact Horizontal Banner) */}
              <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-[#c4f82a] animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                      Matchday Broadcast
                    </span>
                  </div>
                  {nextMatch && (
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-300">
                      Game Week {nextMatch.roundNumber ?? 1}
                    </span>
                  )}
                </div>

                {nextMatch ? (
                  (() => {
                    const ctx = getFixtureContext(nextMatch)
                    const homeLogo = ctx.isHome ? (clubCrest || ctx.myLogo) : (ctx.oppLogo || CLUB_PLACEHOLDER)
                    const awayLogo = !ctx.isHome ? (clubCrest || ctx.myLogo) : (ctx.oppLogo || CLUB_PLACEHOLDER)

                    return (
                      <div className="my-3">
                        <div className="flex items-center justify-between gap-4">
                          {/* Home Side */}
                          <div className="flex flex-1 flex-col items-center text-center">
                            <img
                              src={homeLogo}
                              alt=""
                              onError={(e) => {
                                e.currentTarget.src = CLUB_PLACEHOLDER
                              }}
                              className="h-20 w-20 object-contain drop-shadow-md"
                            />
                            <p className="mt-2 text-sm font-black uppercase tracking-wider text-white sm:text-base">
                              {stripFlag(nextMatch.home)}
                            </p>
                            <span className="text-[10px] font-bold uppercase text-slate-400">HOME</span>
                          </div>

                          {/* Middle VS & Kickoff */}
                          <div className="flex flex-col items-center text-center shrink-0">
                            <span className="rounded-lg bg-black/60 px-3.5 py-1 font-display text-sm font-black text-slate-300 border border-white/10">
                              VS
                            </span>
                            <span className="mt-2 text-xs font-black text-[#c4f82a]">
                              {nextMatch.time || 'Kick-off TBD'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {nextMatch.date || 'Date Unscheduled'}
                            </span>
                          </div>

                          {/* Away Side */}
                          <div className="flex flex-1 flex-col items-center text-center">
                            <img
                              src={awayLogo}
                              alt=""
                              onError={(e) => {
                                e.currentTarget.src = CLUB_PLACEHOLDER
                              }}
                              className="h-20 w-20 object-contain drop-shadow-md"
                            />
                            <p className="mt-2 text-sm font-black uppercase tracking-wider text-white sm:text-base">
                              {stripFlag(nextMatch.away)}
                            </p>
                            <span className="text-[10px] font-bold uppercase text-slate-400">AWAY</span>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3.5">
                          <ButtonLink
                            to={`/matches/${nextMatch.id}`}
                            size="md"
                            className="bg-[#c4f82a] text-black font-black uppercase tracking-wider hover:bg-[#b0df24] shadow-[0_0_15px_rgba(196,248,42,0.3)] text-xs"
                          >
                            Match Center →
                          </ButtonLink>
                          <button
                            type="button"
                            onClick={() => setActiveTab('calendar')}
                            className="text-xs font-bold text-slate-400 hover:text-white transition"
                          >
                            Full Schedule (Calendar) →
                          </button>
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  <div className="my-6 text-center">
                    <p className="text-base font-bold text-white">No Upcoming Match Scheduled</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Once league administration publishes your next Game Week fixture, it will broadcast here.
                    </p>
                  </div>
                )}
              </div>

              {/* Tile D: Upcoming Run-In Strip (Stacked under Broadcast) */}
              <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    Fixture Run-In
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('calendar')}
                    className="text-[11px] font-bold text-slate-400 hover:text-white"
                  >
                    View All ({upcomingMatches.length}) →
                  </button>
                </div>

                {runInMatches.length > 0 ? (
                  <div className="my-3 grid gap-3 sm:grid-cols-3">
                    {runInMatches.map((m) => {
                      const ctx = getFixtureContext(m)
                      return (
                        <Link
                          key={m.id}
                          to={m.id ? `/matches/${m.id}` : '/matches'}
                          className="group flex flex-col justify-between rounded-xl border border-white/5 bg-black/40 p-3.5 transition hover:border-[#c4f82a]/40 hover:bg-black/60"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-slate-400">
                              GW {m.roundNumber ?? '—'}
                            </span>
                            <span
                              className={cx(
                                'rounded px-1.5 py-0.2 text-[9px] font-black uppercase',
                                ctx.isHome
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-sky-500/20 text-sky-300',
                              )}
                            >
                              {ctx.isHome ? 'HOME' : 'AWAY'}
                            </span>
                          </div>

                          <div className="my-2 flex items-center gap-2.5">
                            <img
                              src={ctx.oppLogo || CLUB_PLACEHOLDER}
                              alt=""
                              onError={(e) => {
                                e.currentTarget.src = CLUB_PLACEHOLDER
                              }}
                              className="h-8 w-8 object-contain"
                            />
                            <p className="truncate text-xs font-black text-white group-hover:text-[#c4f82a]">
                              vs {ctx.opponent}
                            </p>
                          </div>

                          <span className="text-[10px] text-slate-400">
                            {m.time ? `${m.date || ''} • ${m.time}` : 'Kick-off TBD'}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No upcoming fixtures in the schedule run-in.
                  </p>
                )}

                <div className="border-t border-white/[0.08] pt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Completed Matches: {completedMatches.length}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setListMode('results')
                      setActiveTab('calendar')
                    }}
                    className="font-bold text-slate-300 hover:text-white"
                  >
                    Past Results →
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN (Col-span 5): Stacked Tactical Snapshot + Transfer Desk */}
            <div className="col-span-1 lg:col-span-5 flex flex-col gap-6">
              {/* Tile B: Tactical Pitch Snapshot with user spotlight (Issue 4 fix: pb-3 & clean spacing) */}
              <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                      Tactical Snapshot
                    </span>
                    <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9px] font-black uppercase text-slate-300">
                      {formation}
                    </span>
                  </div>
                  <span
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider',
                      userMatchdayStatus.type === 'starting'
                        ? 'bg-[#c4f82a]/20 text-[#c4f82a] border border-[#c4f82a]/30'
                        : userMatchdayStatus.type === 'bench'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-white/10 text-slate-300',
                    )}
                  >
                    {userMatchdayStatus.label}
                  </span>
                </div>

                <div className="relative mx-auto my-2 w-full max-w-[340px] pb-3">
                  <Pitch
                    home
                    squad={tacticalSquad}
                    activeSlotIndex={userMatchdayStatus.slotIdx}
                    onSelectSlot={undefined}
                    className="min-h-[440px]"
                  />
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-white/[0.08] pt-2.5 text-[11px] text-slate-400">
                  <span>11 Starters • {bench.length} Subs</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('tactics')}
                    className="font-bold text-[#c4f82a] hover:underline"
                  >
                    Full Board ↗
                  </button>
                </div>
              </div>

              {/* Tile C: Transfer Desk / My Pro Contract Card */}
              <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    {isManager ? 'Transfer Desk' : 'My Pro Contract'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('transfers')}
                    className="text-[11px] font-bold text-slate-400 hover:text-white"
                  >
                    Center →
                  </button>
                </div>

                {isManager ? (
                  <div className="my-3 space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-black/40 p-3 border border-white/5">
                      <div>
                        <p className="text-xs font-bold text-white">Join Requests</p>
                        <p className="text-[11px] text-slate-400">
                          {managerJoinRequests.filter((r) => r.status === 'pending').length} pending applications
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('transfers')}
                        className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white hover:bg-white/20"
                      >
                        Review
                      </button>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-black/40 p-3 border border-white/5">
                      <div>
                        <p className="text-xs font-bold text-white">Outbox Offers</p>
                        <p className="text-[11px] text-slate-400">
                          {managerOffersList.filter((o) => o.status === 'pending').length} pending offers
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('transfers')}
                        className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white hover:bg-white/20"
                      >
                        View
                      </button>
                    </div>

                    <Button
                      size="sm"
                      disabled={!transferWindowOpen || squadList.length >= maxSquadSize}
                      onClick={() => setShowSignModal(true)}
                      className="w-full bg-[#c4f82a] text-black font-black uppercase tracking-wider hover:bg-[#b0df24] text-xs"
                    >
                      + Sign a Player
                    </Button>
                  </div>
                ) : (
                  <div className="my-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 shrink-0">
                        <JerseyIcon
                          number={myShirtNumber ? Number(myShirtNumber) : 10}
                          home
                          isGk={userMatchdayStatus.pos === 'GK'}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-white truncate">
                          {user.gamertag || user.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          Club: {myClub?.name || 'Free Agent'}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Contract Status:</span>
                        <span className="font-bold text-[#c4f82a]">Active Pro</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Squad Role:</span>
                        <span className="font-bold text-white">{userMatchdayStatus.label}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Transfer Window:</span>
                        <span className={transferWindowOpen ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                          {transferWindowOpen ? 'Open' : 'Closed'}
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab('settings')}
                      className="w-full text-xs font-bold"
                    >
                      Customize Jersey #
                    </Button>
                  </div>
                )}

                <div className="border-t border-white/[0.08] pt-2.5 text-right">
                  <span className="text-[10px] text-slate-500">Career Mode Status Active</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= TAB 2: TACTICS & SQUAD */}
        {activeTab === 'tactics' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column (Col-span 7): Pitch Board */}
            <div className="col-span-1 lg:col-span-7 flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    Tactical Strategy
                  </p>
                  <h2 className="text-base font-black uppercase tracking-wider text-white">
                    {isManager ? 'Team Sheet & Formations' : 'Team Sheet (Read Only)'}
                  </h2>
                </div>

                {isManager ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={formation}
                      onChange={(e) => setFormation(e.target.value)}
                      className="h-8 rounded-lg border border-white/20 bg-black/60 px-2.5 text-xs font-black text-[#c4f82a] outline-none focus:border-[#c4f82a]"
                    >
                      {Object.keys(FORMATIONS).map((fmt) => (
                        <option key={fmt} value={fmt}>
                          {fmt}
                        </option>
                      ))}
                    </select>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAutoFill}
                      className="h-8 text-[11px] font-bold"
                    >
                      Auto-Fill
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClearPitch}
                      className="h-8 text-[11px] font-bold text-red-400 hover:text-red-300"
                    >
                      Clear
                    </Button>

                    {saveStatus === 'saving' && (
                      <span className="text-[10px] font-bold text-amber-400 animate-pulse">
                        Saving…
                      </span>
                    )}
                    {saveStatus === 'saved' && (
                      <span className="text-[10px] font-bold text-[#c4f82a]">Saved ✓</span>
                    )}
                  </div>
                ) : (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-300">
                    Formation: {formation} • Read-Only
                  </span>
                )}
              </div>

              {/* Tactical Pitch with smart swap popover */}
              <div className="relative mx-auto w-full max-w-[540px] my-3">
                <Pitch
                  home
                  squad={tacticalSquad}
                  activeSlotIndex={activeSlotIdx}
                  onSelectSlot={isManager ? (idx) => setActiveSlotIdx(idx === activeSlotIdx ? null : idx) : undefined}
                >
                  {/* Smart Swap Popover for Managers with Dynamic Positioning */}
                  {isManager && activeSlotIdx !== null && (() => {
                    const activeSlotTuple = (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots[activeSlotIdx]
                    const activeRole = activeSlotTuple?.[0] || 'POS'
                    const activeY = activeSlotTuple?.[2] ?? 50
                    // If slot is in bottom half (y >= 50: CDMs, Defenders, GK), flip popover to TOP
                    // If slot is in top half (y < 50: Attackers, CAM), flip popover to BOTTOM
                    const isBottomHalf = activeY >= 50
                    const currentSlot = starters[activeSlotIdx]
                    const isCurrentSlotCaptain = Boolean(
                      currentSlot &&
                        captainGamertag &&
                        currentSlot.gamertag.toLowerCase() === captainGamertag.toLowerCase(),
                    )

                    return (
                      <div
                        ref={popoverRef}
                        className={cx(
                          'absolute inset-x-2 z-30 rounded-xl border border-white/20 bg-black/95 p-3.5 shadow-2xl backdrop-blur-xl sm:inset-x-6 sm:p-4 transition-all duration-150',
                          isBottomHalf ? 'top-3 sm:top-4' : 'bottom-3 sm:bottom-4',
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Popover Header */}
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cx(
                                'rounded px-1.5 py-0.5 font-mono text-[10px] font-black border',
                                getPositionBadgeStyle(activeRole),
                              )}
                            >
                              {activeRole}
                            </span>
                            <span className="text-xs font-black uppercase tracking-wider text-[#c4f82a]">
                              Slot {activeSlotIdx + 1} • {currentSlot ? currentSlot.gamertag : 'Unassigned'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveSlotIdx(null)}
                            className="text-xs font-bold text-slate-400 hover:text-white"
                          >
                            ✕ Close
                          </button>
                        </div>

                        {/* Current Assigned Player Action Bar: Name, Jersey # quick-input, Set Captain, Clear */}
                        {currentSlot && (
                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate text-xs font-bold text-white">
                                {currentSlot.gamertag}
                              </span>
                              <label
                                className="inline-flex h-6 items-center gap-0.5 rounded border border-white/20 bg-black/60 px-1.5 font-mono text-[11px] font-extrabold text-[#c4f82a]"
                                title="Jersey Number (1–99)"
                              >
                                <span>#</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={currentSlot.shirtNumber ?? currentSlot.number ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : null
                                    if (val != null && val >= 1 && val <= 99) {
                                      setStarters((prev) => {
                                        const next = [...prev]
                                        if (next[activeSlotIdx]) {
                                          next[activeSlotIdx] = {
                                            ...next[activeSlotIdx]!,
                                            shirtNumber: val,
                                            number: val,
                                          }
                                        }
                                        return next
                                      })
                                    }
                                  }}
                                  className="w-7 bg-transparent text-center font-mono text-[11px] font-extrabold text-white outline-none"
                                />
                              </label>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setCaptainGamertag((prev) =>
                                    prev && prev.toLowerCase() === currentSlot.gamertag.toLowerCase()
                                      ? null
                                      : currentSlot.gamertag,
                                  )
                                }}
                                className={cx(
                                  'h-6 rounded px-2 text-[10.5px] font-bold transition flex items-center gap-1',
                                  isCurrentSlotCaptain
                                    ? 'bg-[#f59e0b] text-black font-black shadow-sm ring-1 ring-amber-300'
                                    : 'bg-white/10 text-white/80 hover:bg-amber-500/20 hover:text-amber-300',
                                )}
                                title={
                                  isCurrentSlotCaptain
                                    ? 'Active Captain (Click to remove captaincy)'
                                    : 'Set as Team Captain'
                                }
                              >
                                <span>{isCurrentSlotCaptain ? '✓' : '★'}</span>
                                <span>{isCurrentSlotCaptain ? 'Active Captain' : 'Set Captain'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (isCurrentSlotCaptain) {
                                    setCaptainGamertag(null)
                                  }
                                  setStarters((prev) => {
                                    const next = [...prev]
                                    next[activeSlotIdx] = null
                                    return next
                                  })
                                }}
                                className="h-6 rounded border border-red-500/30 bg-red-500/15 px-2 text-[10.5px] font-bold text-red-300 hover:bg-red-500/25 hover:text-white transition"
                                title="Remove player from pitch"
                              >
                                Remove from Pitch
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Search & Swap Squad Player */}
                        <div className="mt-2.5">
                          <input
                            type="text"
                            value={slotSearch}
                            onChange={(e) => setSlotSearch(e.target.value)}
                            placeholder="Swap or assign squad player…"
                            className="h-8 w-full rounded border border-white/15 bg-white/5 px-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-[#c4f82a]"
                          />

                          <div className="mt-2 max-h-36 sm:max-h-44 overflow-y-auto space-y-1 divide-y divide-white/5">
                            {squadList
                              .filter((p) =>
                                p.gamertag.toLowerCase().includes(slotSearch.toLowerCase().trim()),
                              )
                              .map((p) => {
                                const isAssigned = starters.some((s) => s?.playerId === p.id)
                                const isThisSlot = currentSlot?.playerId === p.id
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => handleAssignStarter(activeSlotIdx, p)}
                                    className={cx(
                                      'flex w-full items-center justify-between px-2 py-1.5 text-left text-xs rounded transition',
                                      isThisSlot
                                        ? 'bg-[#c4f82a]/15 text-[#c4f82a] font-bold'
                                        : 'hover:bg-[#c4f82a]/10 hover:text-[#c4f82a]',
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-slate-400">
                                        #{p.shirt_number ?? '—'}
                                      </span>
                                      <span className="font-bold text-white">{p.gamertag}</span>
                                      {p.position && (
                                        <span
                                          className={cx(
                                            'rounded px-1 py-0.2 text-[9px] font-bold border',
                                            getPositionBadgeStyle(p.position),
                                          )}
                                        >
                                          {p.position}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-500">
                                      {isThisSlot
                                        ? 'Current'
                                        : isAssigned
                                          ? 'Swap player'
                                          : 'Available'}
                                    </span>
                                  </button>
                                )
                              })}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </Pitch>
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-xs text-slate-400">
                <span>Click any pitch marker to swap players.</span>
                <span>Active Captain: {captainGamertag || 'Unassigned'}</span>
              </div>
            </div>

            {/* Right Column (Col-span 5): 3-Tab Squad Drawer (Issue 5 Fix: Color-coded Position Pills) */}
            <div className="col-span-1 lg:col-span-5 flex flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
              {/* Drawer Top Tabs */}
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTacticsDrawerTab('starters')}
                    className={cx(
                      'rounded-lg px-2.5 py-1 text-xs font-black uppercase transition',
                      tacticsDrawerTab === 'starters'
                        ? 'bg-[#c4f82a] text-black shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    Starting XI ({starters.filter(Boolean).length}/11)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTacticsDrawerTab('bench')}
                    className={cx(
                      'rounded-lg px-2.5 py-1 text-xs font-black uppercase transition',
                      tacticsDrawerTab === 'bench'
                        ? 'bg-[#c4f82a] text-black shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    Bench ({bench.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTacticsDrawerTab('roster')}
                    className={cx(
                      'rounded-lg px-2.5 py-1 text-xs font-black uppercase transition',
                      tacticsDrawerTab === 'roster'
                        ? 'bg-[#c4f82a] text-black shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    Full Roster ({squadList.length})
                  </button>
                </div>
              </div>

              {/* Drawer Content Area (Pinned below tabs with flex-1, zero gap) */}
              <div className="flex-1 mt-4 min-h-0">
                {/* Drawer Content 1: Starters list (Fix Issue 5: Position pills by line) */}
              {tacticsDrawerTab === 'starters' && (
                  <div className="space-y-2">
                  <ul className="divide-y divide-white/5">
                    {(FORMATIONS[formation] || FORMATIONS['4-3-3']).slots.map(([pos], idx) => {
                      const s = starters[idx]
                      const isMe =
                        s &&
                        ((user?.playerId && s.playerId === user.playerId) ||
                          (user?.gamertag &&
                            s.gamertag.toLowerCase() === user.gamertag.toLowerCase()))
                      const isCap =
                        s &&
                        Boolean(
                          s.isCaptain ||
                            (captainGamertag &&
                              s.gamertag.toLowerCase() === captainGamertag.toLowerCase()),
                        )

                      return (
                        <li
                          key={idx}
                          className={cx(
                            'flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition',
                            isMe ? 'bg-[#c4f82a]/10 border border-[#c4f82a]/30' : 'hover:bg-white/[0.02]',
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={cx(
                                'w-9 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[10px] font-black border',
                                getPositionBadgeStyle(pos),
                              )}
                            >
                              {pos}
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-400">
                              #{s?.shirtNumber ?? idx + 1}
                            </span>
                            <span
                              className={cx(
                                'truncate text-xs font-extrabold',
                                s ? 'text-white' : 'text-slate-500 italic',
                              )}
                            >
                              {s?.gamertag || 'Unassigned'}
                            </span>
                            {isCap && (
                              <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-black text-amber-300 border border-amber-500/40">
                                (C)
                              </span>
                            )}
                            {isMe && (
                              <span className="rounded bg-[#c4f82a] px-1.5 py-0.2 text-[9px] font-black text-black">
                                YOU
                              </span>
                            )}
                          </div>

                          {/* Manager controls: Captaincy badge toggle and remove button */}
                          {isManager && s && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setCaptainGamertag((prev) =>
                                    prev && prev.toLowerCase() === s.gamertag.toLowerCase()
                                      ? null
                                      : s.gamertag,
                                  )
                                }}
                                className={cx(
                                  'h-5 w-5 rounded flex items-center justify-center font-mono text-[10px] font-black transition-all',
                                  isCap
                                    ? 'bg-[#f59e0b] text-black shadow-[0_0_8px_rgba(245,158,11,0.5)] ring-1 ring-amber-300'
                                    : 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 border border-white/5',
                                )}
                                title={
                                  isCap
                                    ? 'Team Captain (Click to remove captaincy)'
                                    : 'Set as Team Captain (C)'
                                }
                              >
                                C
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isCap) setCaptainGamertag(null)
                                  setStarters((prev) => {
                                    const next = [...prev]
                                    next[idx] = null
                                    return next
                                  })
                                }}
                                className="h-5 w-5 rounded flex items-center justify-center text-[11px] font-bold text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                                title="Remove from starting XI"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Drawer Content 2: Bench list */}
              {tacticsDrawerTab === 'bench' && (
                  <div className="space-y-3">
                  {isManager && (
                    <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
                      <select
                        onChange={(e) => {
                          const pId = Number(e.target.value)
                          const p = squadList.find((x) => x.id === pId)
                          if (!p) return
                          setBench((prev) => [
                            ...prev,
                            {
                              playerId: p.id,
                              gamertag: p.gamertag,
                              shirtNumber: p.shirt_number ?? 12 + prev.length,
                              number: p.shirt_number ?? 12 + prev.length,
                              position: 'SUB',
                              role: 'SUB',
                            },
                          ])
                          e.target.value = ''
                        }}
                        defaultValue=""
                        className="h-8 flex-1 rounded border border-white/20 bg-black/50 px-2 text-xs text-white outline-none focus:border-[#c4f82a]"
                      >
                        <option value="" disabled>
                          + Add player to bench…
                        </option>
                        {squadList
                          .filter(
                            (p) =>
                              !starters.some((s) => s?.playerId === p.id) &&
                              !bench.some((b) => b.playerId === p.id),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              #{p.shirt_number ?? '—'} {p.gamertag}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {bench.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-400">
                      No substitutes designated on the bench.
                    </p>
                  ) : (
                    <ul className="divide-y divide-white/5 space-y-1">
                      {bench.map((b, idx) => (
                        <li
                          key={idx}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02]"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-300">
                              SUB
                            </span>
                            <span className="font-mono text-xs text-slate-400">
                              #{b.shirtNumber ?? 12 + idx}
                            </span>
                            <span className="text-xs font-bold text-white">{b.gamertag}</span>
                          </div>

                          {isManager && (
                            <button
                              type="button"
                              onClick={() => setBench((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-[10px] font-bold text-slate-500 hover:text-red-400"
                              title="Remove from bench"
                            >
                              ✕
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Drawer Content 3: Full Roster */}
              {tacticsDrawerTab === 'roster' && (
                  <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 border-b border-white/5">
                    <span>{isManager ? 'Active Squad Capacity' : 'Squad Members'}</span>
                    <span className="font-mono font-bold text-[#c4f82a]">
                      {isManager ? `${squadList.length} / ${maxSquadSize}` : `${squadList.length} Players`}
                    </span>
                  </div>

                  <ul className="divide-y divide-white/5 max-h-96 overflow-y-auto space-y-1">
                    {squadList.map((p, idx) => {
                      const isStarter = starters.some((s) => s?.playerId === p.id)
                      const isBench = bench.some((b) => b.playerId === p.id)

                      return (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="font-mono text-xs text-slate-400">
                              #{p.shirt_number ?? idx + 1}
                            </span>
                            <span className="truncate text-xs font-bold text-white">
                              {p.gamertag}
                            </span>
                            {p.position && (
                              <span
                                className={cx(
                                  'rounded px-1.5 py-0.2 text-[9px] font-black uppercase border',
                                  getPositionBadgeStyle(p.position),
                                )}
                              >
                                {p.position}
                              </span>
                            )}
                            <span
                              className={cx(
                                'rounded px-1.5 py-0.2 text-[9px] font-black uppercase',
                                isStarter
                                  ? 'bg-[#c4f82a]/20 text-[#c4f82a]'
                                  : isBench
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-white/5 text-slate-400',
                              )}
                            >
                              {isStarter ? 'XI' : isBench ? 'SUB' : 'RES'}
                            </span>
                          </div>

                          {isManager && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleReleasePlayer(p.id, p.gamertag)}
                              className="text-[10px] font-bold text-slate-500 hover:text-red-400"
                              title="Release player from club"
                            >
                              Release
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              </div>

              <div className="mt-auto border-t border-white/[0.08] pt-3 text-right">
                <span className="text-[10px] text-slate-500">Live Tactics Engine</span>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= TAB 3: TRANSFERS & INBOX */}
        {activeTab === 'transfers' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {isManager ? (
              <>
                {/* Manager Box 1: Incoming Join Requests */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                      Incoming Inbox
                    </p>
                    <span className="text-xs font-bold text-slate-400">
                      Join Requests ({managerJoinRequests.filter((r) => r.status === 'pending').length})
                    </span>
                  </div>

                  {managerJoinRequests.length === 0 ? (
                    <p className="py-12 text-center text-xs text-slate-400">
                      No player transfer applications at this time.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-white/5 space-y-2">
                      {managerJoinRequests.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 pt-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-white truncate">{r.gamertag}</p>
                            {r.message && <p className="text-xs italic text-slate-400">"{r.message}"</p>}
                            <span className="text-[10px] text-slate-500">
                              Applied {new Date(r.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.status === 'pending' ? (
                              <>
                                <Button
                                  size="sm"
                                  disabled={busy || !transferWindowOpen || squadList.length >= maxSquadSize}
                                  onClick={() => handleDecideJoinRequest(r.id, 'accept')}
                                  className="bg-[#c4f82a] text-black text-xs font-bold"
                                >
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => handleDecideJoinRequest(r.id, 'reject')}
                                  className="text-xs text-red-400 hover:text-red-300"
                                >
                                  Decline
                                </Button>
                              </>
                            ) : (
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold uppercase text-slate-400">
                                {r.status}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Manager Box 2: Outbox Offers (Fix Issue 2: Real usernames, avatars & status) */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                      Dispatched Desk
                    </p>
                    <span className="text-xs font-bold text-slate-400">
                      Outbox Offers ({managerOffersList.filter((o) => o.status === 'pending').length})
                    </span>
                  </div>

                  {managerOffersList.length === 0 ? (
                    <p className="py-12 text-center text-xs text-slate-400">
                      No contract offers currently dispatched.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-white/5 space-y-2">
                      {managerOffersList.map((o) => {
                        const playerName =
                          o.gamertag ||
                          squadList.find((p) => p.id === o.player_id)?.gamertag ||
                          `Player #${o.player_id ?? o.id}`

                        return (
                          <li key={o.id} className="flex items-center justify-between gap-3 pt-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/10 border border-white/10">
                                <img
                                  src={o.avatar_local || AVATAR_PLACEHOLDER}
                                  alt=""
                                  onError={(e) => {
                                    e.currentTarget.src = AVATAR_PLACEHOLDER
                                  }}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-white truncate">{playerName}</p>
                                {o.message && <p className="text-xs italic text-slate-400">"{o.message}"</p>}
                                <span className="text-[10px] text-slate-500">
                                  Dispatched {new Date(o.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={cx(
                                  'rounded px-2 py-0.5 text-xs font-bold capitalize',
                                  o.status === 'pending'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-white/10 text-slate-300',
                                )}
                              >
                                {o.status}
                              </span>
                              {o.status === 'pending' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleCancelOffer(o.id)}
                                  className="text-xs font-bold text-red-400 hover:underline"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Player Box 1: Incoming Contract Offers from Clubs */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                      Contract Offers
                    </p>
                    <span className="text-xs font-bold text-slate-400">
                      Incoming ({playerOffersList.filter((o) => o.status === 'pending').length})
                    </span>
                  </div>

                  {playerOffersList.length === 0 ? (
                    <p className="py-12 text-center text-xs text-slate-400">
                      No club contract offers in your inbox.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-white/5 space-y-2">
                      {playerOffersList.map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-3 pt-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-black/40 border border-white/10 p-1">
                              <img
                                src={o.logo_local || CLUB_PLACEHOLDER}
                                alt=""
                                onError={(e) => {
                                  e.currentTarget.src = CLUB_PLACEHOLDER
                                }}
                                className="h-full w-full object-contain"
                              />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{o.club_name || 'Pro Club'}</p>
                              {o.message && <p className="text-xs italic text-slate-400">"{o.message}"</p>}
                              <span className="text-[10px] text-slate-500">
                                {new Date(o.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {o.status === 'pending' ? (
                              <>
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => handleDecideOffer(o.id, true)}
                                  className="bg-[#c4f82a] text-black font-bold text-xs"
                                >
                                  Accept & Sign
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => handleDecideOffer(o.id, false)}
                                  className="text-xs text-red-400"
                                >
                                  Decline
                                </Button>
                              </>
                            ) : (
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold capitalize text-slate-400">
                                {o.status}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Player Box 2: Outgoing Join Requests */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                      My Applications
                    </p>
                    <span className="text-xs font-bold text-slate-400">
                      Dispatched ({playerJoinRequestsList.filter((r) => r.status === 'pending').length})
                    </span>
                  </div>

                  {playerJoinRequestsList.length === 0 ? (
                    <p className="py-12 text-center text-xs text-slate-400">
                      You haven't submitted any applications to clubs.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-white/5 space-y-2">
                      {playerJoinRequestsList.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 pt-3">
                          <div>
                            <p className="text-sm font-bold text-white">{r.club_name || 'Club'}</p>
                            {r.message && <p className="text-xs italic text-slate-400">"{r.message}"</p>}
                            <span className="text-[10px] text-slate-500">
                              Applied {new Date(r.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div>
                            {r.status === 'pending' ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleCancelJoinRequest(r.id)}
                                className="text-xs font-bold text-red-400 hover:underline"
                              >
                                Withdraw
                              </button>
                            ) : (
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold capitalize text-slate-400">
                                {r.status}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ================================================================= TAB 4: CALENDAR */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            {/* Top Toolbar / Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-4 shadow-xl sm:px-6 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                  Schedule & Calendar
                </span>
                <span className="text-sm font-black uppercase text-white">
                  • {myClub?.name || 'Club'} Fixture Calendar
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-bold text-slate-300">
                  {upcomingMatches.length} Upcoming · {completedMatches.length} Played
                </span>
                <ButtonLink
                  to="/matches"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 border-white/10 text-xs font-bold hover:border-white/20 px-2.5"
                >
                  <span>Full Schedule</span>
                  <span className="text-[10px]">↗</span>
                </ButtonLink>
              </div>
            </div>

            {calendarLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#c4f82a]" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* LEFT (7 cols): Interactive Monthly Calendar Grid */}
                <div className="col-span-1 lg:col-span-7 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-4 shadow-xl sm:p-5 backdrop-blur-md">
                  {/* Month Header Controls */}
                  <div className="mb-3.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={prevMonth}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-xs font-bold text-white transition hover:bg-white/10"
                        aria-label="Previous month"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={nextMonth}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-xs font-bold text-white transition hover:bg-white/10"
                        aria-label="Next month"
                      >
                        ›
                      </button>
                      <h3 className="ml-1 font-display text-sm font-extrabold tracking-wide text-white sm:text-base">
                        {MONTH_NAMES[viewMonth]} {viewYear}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {selectedYmd && (
                        <button
                          type="button"
                          onClick={() => setSelectedYmd(null)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white hover:bg-white/10"
                        >
                          Show All
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={goToday}
                        className="rounded-lg border border-[#c4f82a]/30 bg-[#c4f82a]/10 px-2.5 py-1 text-[11px] font-bold text-[#c4f82a] hover:bg-[#c4f82a]/20"
                      >
                        Today
                      </button>
                    </div>
                  </div>

                  {/* Weekday Header */}
                  <div className="grid grid-cols-7 gap-1 border-b border-white/[0.08] pb-2 text-center font-mono text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    {WEEKDAYS.map((wd) => (
                      <div key={wd}>{wd}</div>
                    ))}
                  </div>

                  {/* Days Grid */}
                  <div className="mt-2 grid grid-cols-7 gap-1.5">
                    {calendarDays.map((cell) => {
                      const hasMatch = cell.fixtures.length > 0
                      const isSelected = selectedYmd === cell.ymd
                      const firstFixture = cell.fixtures[0]
                      const ctx = firstFixture ? getFixtureContext(firstFixture) : null

                      return (
                        <button
                          key={cell.ymd}
                          type="button"
                          onClick={() => setSelectedYmd(isSelected ? null : cell.ymd)}
                          className={cx(
                            'group relative flex min-h-16 flex-col justify-between rounded-xl border p-1.5 text-left transition-all',
                            !cell.inMonth && 'opacity-35',
                            isSelected
                              ? 'border-[#c4f82a] bg-[#c4f82a]/15 ring-1 ring-[#c4f82a]'
                              : hasMatch
                                ? 'border-[#c4f82a]/30 bg-black/40 hover:border-[#c4f82a]'
                                : 'border-white/5 bg-black/20 hover:border-white/15',
                          )}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span
                              className={cx(
                                'font-mono text-[11px] font-bold',
                                cell.isToday
                                  ? 'rounded bg-[#c4f82a] px-1 text-black font-extrabold'
                                  : hasMatch
                                    ? 'text-white'
                                    : 'text-slate-500',
                              )}
                            >
                              {cell.day}
                            </span>
                            {ctx && (
                              <span
                                className={cx(
                                  'rounded px-1 text-[9px] font-extrabold uppercase',
                                  ctx.isHome
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-sky-500/20 text-sky-300',
                                )}
                              >
                                {ctx.isHome ? 'H' : 'A'}
                              </span>
                            )}
                          </div>

                          {ctx && firstFixture && (
                            <div className="mt-1 flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <img
                                  src={ctx.oppLogo || CLUB_PLACEHOLDER}
                                  alt=""
                                  onError={(e) => {
                                    e.currentTarget.src = CLUB_PLACEHOLDER
                                  }}
                                  className="h-3.5 w-3.5 shrink-0 object-contain"
                                />
                                <span className="truncate text-[10px] font-bold text-white">
                                  {ctx.opponent}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                {ctx.played ? (
                                  <span
                                    className={cx(
                                      'font-mono rounded px-1 text-[9px] font-extrabold',
                                      ctx.outcome === 'W'
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : ctx.outcome === 'L'
                                          ? 'bg-rose-500/20 text-rose-300'
                                          : 'bg-amber-500/20 text-amber-300',
                                    )}
                                  >
                                    {ctx.outcome} {firstFixture.hs}-{firstFixture.as}
                                  </span>
                                ) : (
                                  <span className="font-mono text-[9px] font-bold text-[#c4f82a]">
                                    {firstFixture.time || 'TBC'}
                                  </span>
                                )}
                                {cell.fixtures.length > 1 && (
                                  <span className="text-[9px] font-extrabold text-slate-500">
                                    +{cell.fixtures.length - 1}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* RIGHT (5 cols): Upcoming / Results with Pagination */}
                <div className="col-span-1 lg:col-span-5 flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-4 shadow-xl sm:p-5 backdrop-blur-md">
                  <div>
                    {/* Top Switcher: Selected Day OR Upcoming / Results tabs */}
                    <div className="mb-3.5 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
                      {selectedYmd ? (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-black uppercase tracking-wider text-[#c4f82a]">
                            📅 Fixtures on {selectedYmd}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedYmd(null)}
                            className="text-[11px] font-bold text-slate-400 hover:text-white"
                          >
                            ✕ Clear Day
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 rounded-xl bg-black/40 p-1 border border-white/5 w-full">
                          <button
                            type="button"
                            onClick={() => setListMode('upcoming')}
                            className={cx(
                              'flex-1 rounded-lg py-1.5 text-xs font-black uppercase transition-all',
                              listMode === 'upcoming'
                                ? 'bg-[#c4f82a] text-black shadow-sm'
                                : 'text-slate-400 hover:text-white',
                            )}
                          >
                            Upcoming ({upcomingMatches.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setListMode('results')}
                            className={cx(
                              'flex-1 rounded-lg py-1.5 text-xs font-black uppercase transition-all',
                              listMode === 'results'
                                ? 'bg-[#c4f82a] text-black shadow-sm'
                                : 'text-slate-400 hover:text-white',
                            )}
                          >
                            Results ({completedMatches.length})
                          </button>
                        </div>
                      )}
                    </div>

                    {activeSideList.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                        <p className="text-xs font-bold text-white">
                          {selectedYmd
                            ? 'No fixtures scheduled on this date'
                            : listMode === 'upcoming'
                              ? 'No upcoming fixtures scheduled'
                              : 'No completed results yet'}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {selectedYmd
                            ? 'Click a highlighted date on the calendar or clear the day filter.'
                            : 'Once league admins publish fixtures for your division, they will appear here.'}
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-2.5">
                        {paginatedSideList.map((m, idx) => {
                          const ctx = getFixtureContext(m)
                          return (
                            <li key={m.id ?? idx}>
                              <Link
                                to={m.id ? `/matches/${m.id}` : '/matches'}
                                className="group flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/40 p-3 transition-colors hover:border-[#c4f82a]/30 hover:bg-black/60"
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <img
                                    src={ctx.oppLogo || CLUB_PLACEHOLDER}
                                    alt=""
                                    onError={(e) => {
                                      e.currentTarget.src = CLUB_PLACEHOLDER
                                    }}
                                    className="h-9 w-9 shrink-0 object-contain"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={cx(
                                          'rounded px-1.5 py-0.2 text-[9px] font-black uppercase',
                                          ctx.isHome
                                            ? 'bg-emerald-500/20 text-emerald-300'
                                            : 'bg-sky-500/20 text-sky-300',
                                        )}
                                      >
                                        {ctx.isHome ? 'HOME' : 'AWAY'}
                                      </span>
                                      {m.roundNumber && (
                                        <span className="text-[10px] font-bold text-slate-400">
                                          Game Week {m.roundNumber}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-0.5 truncate text-xs font-extrabold text-white group-hover:text-[#c4f82a] transition">
                                      vs {ctx.opponent}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                      {m.date || 'Date TBD'} · {m.time || 'Kick-off TBD'}
                                    </p>
                                  </div>
                                </div>

                                <div className="shrink-0 text-right">
                                  {ctx.played ? (
                                    <span
                                      className={cx(
                                        'font-mono inline-block rounded-lg px-2.5 py-1 text-xs font-black',
                                        ctx.outcome === 'W'
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : ctx.outcome === 'L'
                                            ? 'bg-rose-500/20 text-rose-300'
                                            : 'bg-amber-500/20 text-amber-300',
                                      )}
                                    >
                                      {ctx.outcome} · {m.hs}:{m.as}
                                    </span>
                                  ) : (
                                    <span className="inline-block rounded-lg bg-[#c4f82a]/15 text-[#c4f82a] border border-[#c4f82a]/30 px-2.5 py-1 text-[11px] font-black">
                                      Match →
                                    </span>
                                  )}
                                </div>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {totalFixturePages > 1 && (
                    <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3">
                      <button
                        type="button"
                        disabled={safeFixturePage <= 1}
                        onClick={() => setFixturePage((p) => Math.max(1, p - 1))}
                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ‹ Prev
                      </button>
                      <span className="font-mono text-xs font-bold text-slate-400">
                        Page {safeFixturePage} of {totalFixturePages}
                      </span>
                      <button
                        type="button"
                        disabled={safeFixturePage >= totalFixturePages}
                        onClick={() => setFixturePage((p) => Math.min(totalFixturePages, p + 1))}
                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Next ›
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= TAB 5: CLUB & PRO SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* FIX ISSUE 6: Player / Manager Locker Showcase Banner (96px Kit Graphic) */}
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-[#0f1015]/95 via-[#0c0d12]/95 to-[#090a0d]/98 p-6 shadow-2xl backdrop-blur-md">
              <div className="pointer-events-none absolute -top-24 left-1/4 h-48 w-96 rounded-full bg-[#c4f82a]/5 blur-3xl" />

              <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                {/* Left: 96px Jersey Graphic + Pro Details */}
                <div className="flex items-center gap-5">
                  <div className="h-24 w-24 shrink-0 drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)]">
                    <JerseyIcon
                      number={activeUserShirt}
                      home
                      isGk={userMatchdayStatus.pos === 'GK'}
                      className="h-24 w-24"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-xl font-black uppercase tracking-wider text-white">
                        {user.gamertag || user.name || 'Pro Athlete'}
                      </span>
                      <span className="font-mono text-sm font-extrabold text-[#c4f82a]">
                        #{activeUserShirt}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {myClub?.name || 'Free Agent'} • {isManager ? 'Club Manager' : 'Squad Player'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border',
                          userMatchdayStatus.type === 'starting'
                            ? 'bg-[#c4f82a]/15 text-[#c4f82a] border-[#c4f82a]/30'
                            : userMatchdayStatus.type === 'bench'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-white/10 text-slate-300 border-white/10',
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {userMatchdayStatus.label}
                      </span>
                      {isManager && (
                        <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] font-black text-purple-300 uppercase">
                          {isManagerInSquad ? 'Playing Manager' : 'Touchline Coach'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Inline Official Shirt Number Input + Save Button (Zero Dead Space) */}
                <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/40 p-4 sm:min-w-[280px]">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                    Official Shirt Number (1–99)
                  </label>
                  <form
                    onSubmit={isManager ? handleSaveManagerShirt : handleSavePlayerShirt}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={isManager ? selfShirtNumber : myShirtNumber}
                      onChange={(e) => {
                        if (isManager) setSelfShirtNumber(e.target.value)
                        else setMyShirtNumber(e.target.value)
                      }}
                      placeholder="#"
                      className="h-10 w-20 rounded-lg border border-white/20 bg-black/60 px-2 text-center font-mono text-sm font-black text-white outline-none focus:border-[#c4f82a]"
                    />
                    <Button
                      type="submit"
                      size="md"
                      disabled={busy}
                      className="flex-1 bg-[#c4f82a] text-black font-black uppercase tracking-wider text-xs hover:bg-[#b0df24] shadow-[0_0_12px_rgba(196,248,42,0.25)]"
                    >
                      Save Number
                    </Button>
                  </form>
                  <span className="text-[10px] text-slate-500">
                    Applies live to matchday team sheets, lineups, and pitch markers.
                  </span>
                </div>
              </div>
            </div>

            {/* Manager Mode: Club Identity and Playing Captain Claim */}
            {isManager && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Manager Left: Club Identity & Brand */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    Management
                  </p>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">
                    Club Identity & Brand
                  </h3>

                  <form onSubmit={handleSaveClubIdentity} className="mt-4 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/50 p-2">
                        <img
                          src={clubLogoDraft || clubCrest}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.src = CLUB_PLACEHOLDER
                          }}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const compressed = await compressClubLogo(file)
                              setClubLogoDraft(compressed)
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
                        >
                          Change Logo
                        </button>
                        {clubLogoDraft && (
                          <button
                            type="button"
                            onClick={() => setClubLogoDraft(null)}
                            className="block text-xs font-bold text-red-400 hover:underline"
                          >
                            Revert
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-300">
                        3-Letter Short Code (2–4 letters)
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        value={editShortCode}
                        onChange={(e) => setEditShortCode(e.target.value.toUpperCase())}
                        placeholder="e.g. BV"
                        className="h-9 w-32 rounded-lg border border-white/20 bg-black/50 px-3 font-mono text-xs font-black text-white focus:border-[#c4f82a] outline-none"
                      />
                    </div>

                    <Button
                      type="submit"
                      size="sm"
                      disabled={busy}
                      className="bg-[#c4f82a] text-black font-black uppercase tracking-wider text-xs"
                    >
                      Save Identity Changes
                    </Button>
                  </form>
                </div>

                {/* Manager Right: Squad Claim (if not playing yet) */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    Squad Registration
                  </p>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">
                    Playing Captain Status
                  </h3>

                  {isManagerInSquad ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-2 w-2 rounded-full bg-[#c4f82a]" />
                        <span className="text-sm font-bold text-white">
                          Registered on Squad Roster
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        You can slot your player card onto the tactical pitch board in the TACTICS & SQUAD tab, or set yourself as matchday captain.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                      <p className="text-xs font-bold text-white">Join Squad as Playing Captain</p>
                      <p className="text-[11px] text-slate-400">
                        Register your EA gamertag into your squad roster so you can be slotted onto the tactical pitch.
                      </p>
                      <form onSubmit={handleClaimSelf} className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          required
                          value={selfGamertag}
                          onChange={(e) => setSelfGamertag(e.target.value)}
                          placeholder="Your EA Gamertag"
                          className="h-9 flex-1 rounded-lg border border-white/20 bg-black/60 px-3 text-xs text-white outline-none focus:border-[#c4f82a]"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={selfBusy || !selfGamertag.trim()}
                          className="bg-[#c4f82a] text-black font-black text-xs"
                        >
                          Join Roster
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Player Mode: Contract & Club Membership */}
            {!isManager && myClub && (
              <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0f1015]/95 to-[#090a0d]/98 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                  Pro Contract
                </p>
                <h3 className="text-base font-black uppercase tracking-wider text-white">
                  Club Membership
                </h3>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/40 p-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={clubCrest}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.src = CLUB_PLACEHOLDER
                      }}
                      className="h-10 w-10 object-contain"
                    />
                    <div>
                      <p className="text-sm font-bold text-white">{myClub.name}</p>
                      <p className="text-xs text-slate-400">Current Club • Active Registration</p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !transferWindowOpen}
                    onClick={handleLeaveClub}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold"
                  >
                    Leave Club (Free Agency)
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Sign Player Modal (Manager) */}
      {isManager && myClub && (
        <SignPlayerModal
          open={showSignModal}
          onClose={() => setShowSignModal(false)}
          clubId={myClub.id}
          clubName={myClub.name}
          onSuccess={() => {
            setNotice({ kind: 'ok', text: 'Contract offer sent!' })
            void loadManagerData()
          }}
        />
      )}

      {/* Account Settings Modal */}
      {showSettingsModal && (
        <AccountSettingsModal
          open={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  )
}
