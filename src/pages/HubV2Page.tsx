/**
 * Game-Style Command Center ("Career Mode Hub V2").
 *
 * Dedicated route: /hub-v2
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
import { getLiveMatches, invalidateLiveClubCache } from '@/lib/liveLeague'
import type { Match } from '@/types/site'

/* ---------------------------------------------------------------- Constants & Helpers */

const msg = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong.')

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function parseKickoffDate(m: Match): Date | null {
  if (m.kickoff) {
    const d = new Date(m.kickoff.replace(' ', 'T'))
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

type HubTab = 'central' | 'tactics' | 'transfers' | 'calendar' | 'settings'

/* ================================================================= Hub Component */

export default function HubV2Page() {
  const { user, loading, refresh } = useAuth()
  const navigate = useNavigate()
  const sentRef = useRef(false)

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<HubTab>('central')

  // Common Hub state
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [transferWindowOpen, setTransferWindowOpen] = useState(true)
  const [maxSquadSize, setMaxSquadSize] = useState(23)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showSignModal, setShowSignModal] = useState(false)

  // Club & Squad state
  const [myClub, setMyClub] = useState<ManagerClub | null>(null)
  const [squadList, setSquadList] = useState<
    Array<{
      id: number
      gamertag: string
      slug: string
      shirt_number?: number | null
      avatar_local: string | null
      is_free_agent: number
      pending: number
      user_id?: number | null
    }>
  >([])
  const [clubManagers, setClubManagers] = useState<
    Array<{ id: number; name: string; email?: string; gamertag?: string | null }>
  >([])

  // Player-specific state
  const [playerInfo, setPlayerInfo] = useState<{
    id: number
    gamertag: string
    club_id: number | null
    shirt_number?: number | null
  } | null>(null)
  const [myShirtNumber, setMyShirtNumber] = useState('')
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  // Starting XI & Tactics state
  const [formation, setFormation] = useState<string>('4-3-3')
  const [starters, setStarters] = useState<Array<ClubLineupSlot | null>>(Array(11).fill(null))
  const [bench, setBench] = useState<ClubLineupBench[]>([])
  const [captainGamertag, setCaptainGamertag] = useState<string | null>(null)
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null)
  const [slotSearch, setSlotSearch] = useState('')
  const [tacticsDrawerTab, setTacticsDrawerTab] = useState<'starters' | 'bench' | 'roster'>('starters')
  const pickerRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)
  const lastSavedPayloadRef = useRef<string>('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Transfers & Inbox state
  const [managerOffersList, setManagerOffersList] = useState<Offer[]>([])
  const [managerJoinRequests, setManagerJoinRequests] = useState<JoinRequest[]>([])
  const [playerOffersList, setPlayerOffersList] = useState<Offer[]>([])
  const [playerJoinRequestsList, setPlayerJoinRequestsList] = useState<JoinRequest[]>([])

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

  // Self player claim state (Manager playing captain)
  const [showClaimSelf, setShowClaimSelf] = useState(false)
  const [selfGamertag, setSelfGamertag] = useState(user?.gamertag || user?.name || '')
  const [selfShirtNumber, setSelfShirtNumber] = useState('')
  const [selfBusy, setSelfBusy] = useState(false)

  // Release player confirm modal
  const [releaseConfirmPlayer, setReleaseConfirmPlayer] = useState<{
    id: number
    gamertag: string
    user_id?: number | null
  } | null>(null)

  // Check role
  const isManager = Boolean(
    user && (user.role === 'club_manager' || user.role === 'admin' || user.role === 'owner')
  )

  // Redirect guard
  useEffect(() => {
    if (loading || user || sentRef.current) return
    sentRef.current = true
    navigate('/login', { replace: true })
  }, [loading, user, navigate])

  // Transfer window status
  useEffect(() => {
    let active = true
    getTransferWindowStatus()
      .then((res) => {
        if (!active) return
        if (typeof res.open === 'boolean') setTransferWindowOpen(res.open)
        if (typeof res.maxSquadSize === 'number' && res.maxSquadSize >= 5) {
          setMaxSquadSize(res.maxSquadSize)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Initialize Lineup state from club
  const initLineupState = useCallback(
    (clubData: ManagerClub | null, players: typeof squadList) => {
      const saved = clubData?.starting_xi
      const fmtKey = saved?.formation && FORMATIONS[saved.formation] ? saved.formation : '4-3-3'
      const slots = FORMATIONS[fmtKey].slots
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
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    }
  }, [initLineupState])

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
        // Fetch full club details
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
          }))
          setSquadList(pList)
          initLineupState(clubObj, pList)
        }
      } else {
        setMyClub(null)
        setSquadList([])
      }
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    }
  }, [initLineupState])

  // Initial load based on role
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

  // Manager: Auto-save Starting XI & Bench
  useEffect(() => {
    if (!isManager || !myClub || !isInitializedRef.current) return

    const currentPayload: ClubLineup = {
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
  }, [isManager, formation, starters, bench, captainGamertag, myClub])

  // Outside click for tactical pitch player swap popover
  useEffect(() => {
    if (activeSlotIdx === null) return
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null
      if (pickerRef.current && pickerRef.current.contains(e.target as Node)) return
      if (target && target.closest('[data-pitch-slot]')) return
      setActiveSlotIdx(null)
      setSlotSearch('')
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveSlotIdx(null)
        setSlotSearch('')
      }
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeSlotIdx])

  // Smart assign / swap slot
  const assignOrSwapSlot = (
    targetIdx: number,
    player: { id: number; gamertag: string; shirt_number?: number | null },
  ) => {
    const slots = (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots
    const targetCoord = slots[targetIdx]
    if (!targetCoord) return
    const targetPos = targetCoord[0]

    setStarters((prev) => {
      const next = [...prev]
      const currentInTarget = next[targetIdx]
      const existingIdx = next.findIndex(
        (s, i) => i !== targetIdx && s && s.gamertag.toLowerCase() === player.gamertag.toLowerCase(),
      )

      if (existingIdx !== -1) {
        const existingSlot = next[existingIdx]!
        const existingPos = slots[existingIdx]?.[0] ?? existingSlot.position
        const num = existingSlot.shirtNumber ?? existingSlot.number ?? player.shirt_number ?? targetIdx + 1
        next[targetIdx] = {
          position: targetPos,
          role: targetPos,
          playerId: player.id,
          gamertag: player.gamertag,
          shirtNumber: num,
          number: num,
        }
        next[existingIdx] = currentInTarget
          ? {
              ...currentInTarget,
              position: existingPos,
              role: existingPos,
            }
          : null
      } else {
        const num =
          currentInTarget?.shirtNumber ??
          currentInTarget?.number ??
          player.shirt_number ??
          targetIdx + 1
        next[targetIdx] = {
          position: targetPos,
          role: targetPos,
          playerId: player.id,
          gamertag: player.gamertag,
          shirtNumber: num,
          number: num,
        }
      }
      return next
    })

    setBench((prev) => prev.filter((b) => b.gamertag.toLowerCase() !== player.gamertag.toLowerCase()))
    setActiveSlotIdx(null)
    setSlotSearch('')
  }

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

    if (!userTag && !userPid) {
      return { type: 'unknown', label: 'ROSTER MEMBER', slotIdx: null, pos: '' }
    }

    const starterIdx = starters.findIndex((s) => {
      if (!s) return false
      if (userPid && s.playerId === userPid) return true
      if (userTag && s.gamertag && s.gamertag.toLowerCase().trim() === userTag) return true
      return false
    })

    if (starterIdx !== -1) {
      const pos =
        starters[starterIdx]?.position ||
        starters[starterIdx]?.role ||
        FORMATIONS[formation]?.slots[starterIdx]?.[0] ||
        'STARTER'
      return {
        type: 'starting',
        label: `STARTING XI (${pos})`,
        slotIdx: starterIdx,
        pos,
      }
    }

    const onBench = bench.some((b) => {
      if (userPid && b.playerId === userPid) return true
      if (userTag && b.gamertag && b.gamertag.toLowerCase().trim() === userTag) return true
      return false
    })

    if (onBench) {
      return { type: 'bench', label: 'BENCH SUB', slotIdx: null, pos: 'SUB' }
    }

    const onSquad = squadList.some((p) => {
      if (userPid && p.id === userPid) return true
      if (userTag && p.gamertag && p.gamertag.toLowerCase().trim() === userTag) return true
      return false
    })

    if (onSquad) {
      return { type: 'reserve', label: 'RESERVES', slotIdx: null, pos: 'RES' }
    }

    if (isManager) {
      return {
        type: 'manager',
        label: `TACTICAL PREVIEW: ${formation} • 11 STARTERS`,
        slotIdx: null,
        pos: 'MGR',
      }
    }

    return { type: 'unknown', label: 'FREE AGENT', slotIdx: null, pos: '' }
  }, [user, playerInfo, starters, bench, squadList, formation, isManager])

  // Partitioned matches
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
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

  // Fixture context helper
  const getFixtureContext = (m: Match) => {
    const cName = stripFlag(myClub?.name || '').toLowerCase().trim()
    const isHome = stripFlag(m.home).toLowerCase().trim() === cName
    const opponent = isHome ? m.away : m.home
    const oppLogo = isHome ? m.away_logo : m.home_logo
    const played = m.hs !== '' && m.as !== ''
    let outcome: 'W' | 'D' | 'L' | null = null
    if (played) {
      const myScore = isHome ? Number(m.hs) : Number(m.as)
      const oppScore = isHome ? Number(m.as) : Number(m.hs)
      if (myScore > oppScore) outcome = 'W'
      else if (myScore < oppScore) outcome = 'L'
      else outcome = 'D'
    }
    return { isHome, opponent, oppLogo, played, outcome }
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
    setStarters((prev) => Array(prev.length).fill(null))
    setCaptainGamertag(null)
  }

  const handleDecideJoinReq = async (id: number, decision: 'accept' | 'reject') => {
    setBusy(true)
    setNotice(null)
    try {
      await decideJoinRequest(id, decision)
      setNotice({
        kind: 'ok',
        text: decision === 'accept' ? 'Player accepted and added to squad!' : 'Join request declined.',
      })
      await loadManagerData()
      await refresh()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleCancelOffer = async (id: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await cancelOffer(id)
      setNotice({ kind: 'ok', text: 'Contract offer cancelled.' })
      await loadManagerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleSavePlayerShirt = async (playerId: number, shirt: number | null) => {
    setBusy(true)
    setNotice(null)
    try {
      await updateSquadPlayerShirt(playerId, shirt)
      invalidateLiveClubCache()
      setNotice({ kind: 'ok', text: 'Shirt number updated.' })
      await loadManagerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleReleasePlayer = async () => {
    if (!releaseConfirmPlayer) return
    setBusy(true)
    setNotice(null)
    try {
      await releaseSquadPlayer(releaseConfirmPlayer.id)
      invalidateLiveClubCache()
      setNotice({
        kind: 'ok',
        text: `${releaseConfirmPlayer.gamertag} has been released to free agency.`,
      })
      setReleaseConfirmPlayer(null)
      await loadManagerData()
      await refresh()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleSaveClubIdentity = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const code = editShortCode.trim().toUpperCase()
      await updateManagerClub({
        shortCode: code || null,
        logo: clubLogoDraft,
      })
      invalidateLiveClubCache()
      setNotice({ kind: 'ok', text: 'Club identity updated successfully.' })
      await loadManagerData()
      await refresh()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  // Handlers for Player actions
  const handleSaveMyShirtNumber = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const parsed = myShirtNumber.trim() === '' ? null : Number(myShirtNumber)
      await updateMyPlayerProfile({ shirtNumber: parsed })
      invalidateLiveClubCache()
      setNotice({ kind: 'ok', text: 'Jersey number updated successfully.' })
      await loadPlayerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleDecidePlayerOffer = async (id: number, decision: 'accept' | 'reject') => {
    setBusy(true)
    setNotice(null)
    try {
      await decideOffer(id, decision)
      setNotice({
        kind: 'ok',
        text: decision === 'accept' ? 'Signed! Welcome to your new club.' : 'Offer declined.',
      })
      await Promise.all([loadPlayerData(), refresh()])
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleWithdrawApplication = async (id: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await cancelJoinRequest(id)
      setNotice({ kind: 'ok', text: 'Application withdrawn.' })
      await loadPlayerData()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleLeaveClub = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await leaveClub()
      setShowLeaveConfirm(false)
      setNotice({ kind: 'ok', text: 'You have left the club and returned to Free Agency.' })
      await Promise.all([loadPlayerData(), refresh()])
    } catch (err) {
      setShowLeaveConfirm(false)
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleClaimSelf = async (e: FormEvent) => {
    e.preventDefault()
    setSelfBusy(true)
    setNotice(null)
    try {
      const parsedShirt = selfShirtNumber.trim() ? Number(selfShirtNumber) : null
      await createManagerSelfPlayer(selfGamertag.trim(), parsedShirt)
      invalidateLiveClubCache()
      setNotice({ kind: 'ok', text: 'You are now registered as Playing Captain in your squad!' })
      setShowClaimSelf(false)
      await loadManagerData()
      await refresh()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setSelfBusy(false)
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#08090c] pt-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="h-12 w-64 animate-pulse rounded-xl bg-white/10" />
          <div className="mt-8 grid grid-cols-12 gap-6">
            <div className="col-span-8 h-96 animate-pulse rounded-2xl bg-white/5" />
            <div className="col-span-4 h-96 animate-pulse rounded-2xl bg-white/5" />
          </div>
        </div>
      </div>
    )
  }

  const clubCrest = myClub?.logo_local || myClub?.logo_url || CLUB_PLACEHOLDER
  const clubShortCode = myClub?.short_code || myClub?.name?.slice(0, 3)?.toUpperCase() || 'FC'
  const isManagerInSquad = squadList.some(
    (p) =>
      (user?.playerId && p.id === user.playerId) ||
      (user?.id && p.user_id === user.id) ||
      Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()),
  )

  return (
    <div className="min-h-screen bg-[#08090c] text-slate-100 selection:bg-[#c4f82a] selection:text-black">
      {/* ---------------- HUD Sticky Top Bar ---------------- */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0c0e14]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* Left Club Badge */}
          <div className="flex items-center gap-3.5">
            <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-black/40 p-1.5 shadow-inner">
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
              <div className="flex items-center gap-2">
                <span className="truncate font-display text-base font-black uppercase tracking-wider text-white">
                  {myClub?.name || 'FREE AGENT'}
                </span>
                {myClub && (
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-300">
                    {clubShortCode}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                {isManager ? (
                  <span className="inline-flex items-center gap-1 rounded bg-[#c4f82a]/15 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-[#c4f82a] border border-[#c4f82a]/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#c4f82a] animate-pulse" />
                    Manager Hub
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-sky-400 border border-sky-500/30">
                    Player Hub {myShirtNumber ? `• #${myShirtNumber}` : ''}
                  </span>
                )}
                {userMatchdayStatus.type !== 'unknown' && !isManager && (
                  <span
                    className={cx(
                      'text-[9px] font-bold uppercase tracking-wider',
                      userMatchdayStatus.type === 'starting'
                        ? 'text-[#c4f82a]'
                        : userMatchdayStatus.type === 'bench'
                          ? 'text-amber-400'
                          : 'text-slate-400',
                    )}
                  >
                    • {userMatchdayStatus.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center Tabs */}
          <nav className="flex items-center gap-1 overflow-x-auto py-1">
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
                    'relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap',
                    active
                      ? 'text-[#c4f82a] bg-white/[0.04]'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]',
                  )}
                >
                  {t.label}
                  {Boolean(t.count) && (
                    <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-[#c4f82a] px-1 text-[9px] font-black text-black">
                      {t.count}
                    </span>
                  )}
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#c4f82a] shadow-[0_0_10px_#c4f82a]" />
                  )}
                </button>
              )
            })}
          </nav>

          {/* Right Status & Tools */}
          <div className="flex items-center gap-2.5">
            {myClub && (
              <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] font-bold text-slate-300 md:inline-block">
                {squadList.length} / {maxSquadSize} Players
              </span>
            )}
            {myClub && (
              <ButtonLink
                to={`/clubs/${myClub.slug}`}
                variant="outline"
                size="sm"
                className="gap-1 border-white/10 text-xs font-bold hover:border-white/20"
              >
                <span>Public Page</span>
                <span className="text-[10px]">↗</span>
              </ButtonLink>
            )}
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/10 hover:text-white"
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

      {/* Global Notice Toast */}
      {notice && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <div
            className={cx(
              'flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-semibold shadow-lg',
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
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {/* ================================================================= TAB 1: CENTRAL */}
        {activeTab === 'central' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Tile A: Next Matchday Broadcast Card (Col-span 7) */}
            <div className="col-span-1 lg:col-span-7 flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
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
                  return (
                    <div className="my-6">
                      <div className="flex items-center justify-between gap-4">
                        {/* Home Side */}
                        <div className="flex flex-1 flex-col items-center text-center">
                          <img
                            src={ctx.isHome ? clubCrest : ctx.oppLogo || CLUB_PLACEHOLDER}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.src = CLUB_PLACEHOLDER
                            }}
                            className="h-16 w-16 object-contain sm:h-20 sm:w-20 drop-shadow-md"
                          />
                          <p className="mt-2 text-sm font-black uppercase tracking-wider text-white sm:text-base">
                            {stripFlag(nextMatch.home)}
                          </p>
                          <span className="text-[10px] font-bold uppercase text-slate-400">HOME</span>
                        </div>

                        {/* Middle VS */}
                        <div className="flex flex-col items-center text-center shrink-0">
                          <span className="rounded-lg bg-black/60 px-3 py-1 font-display text-sm font-black text-slate-400 border border-white/10">
                            VS
                          </span>
                          <span className="mt-2 text-xs font-extrabold text-[#c4f82a]">
                            {nextMatch.time || 'Kick-off TBD'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {nextMatch.date || 'Date Unscheduled'}
                          </span>
                        </div>

                        {/* Away Side */}
                        <div className="flex flex-1 flex-col items-center text-center">
                          <img
                            src={!ctx.isHome ? clubCrest : ctx.oppLogo || CLUB_PLACEHOLDER}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.src = CLUB_PLACEHOLDER
                            }}
                            className="h-16 w-16 object-contain sm:h-20 sm:w-20 drop-shadow-md"
                          />
                          <p className="mt-2 text-sm font-black uppercase tracking-wider text-white sm:text-base">
                            {stripFlag(nextMatch.away)}
                          </p>
                          <span className="text-[10px] font-bold uppercase text-slate-400">AWAY</span>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                        <ButtonLink
                          to={`/matches/${nextMatch.id}`}
                          size="md"
                          className="bg-[#c4f82a] text-black font-black uppercase tracking-wider hover:bg-[#b0df24] shadow-[0_0_15px_rgba(196,248,42,0.3)]"
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
                <div className="my-8 text-center">
                  <p className="text-base font-bold text-white">No Upcoming Match Scheduled</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Once the league administrators publish your next Game Week, it will broadcast here.
                  </p>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab('calendar')}
                      className="text-xs font-bold text-[#c4f82a] hover:underline"
                    >
                      Browse Season Calendar →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tile B: Tactical Pitch Snapshot (Col-span 5, Spans 2 Rows) */}
            <div className="col-span-1 lg:col-span-5 flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    Tactical Snapshot
                  </p>
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                    {formation} Starting XI
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('tactics')}
                  className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-black text-white hover:bg-white/20 transition"
                >
                  {isManager ? 'Manage Tactics →' : 'View Full Team Sheet →'}
                </button>
              </div>

              {/* Spotlight Badge */}
              <div className="my-2.5 flex items-center justify-between rounded-xl bg-black/40 px-3 py-1.5 border border-white/5">
                <span className="text-[11px] font-bold text-slate-300">Your Status:</span>
                <span
                  className={cx(
                    'rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider',
                    userMatchdayStatus.type === 'starting'
                      ? 'bg-[#c4f82a]/20 text-[#c4f82a] border border-[#c4f82a]/40 shadow-[0_0_8px_rgba(196,248,42,0.4)]'
                      : userMatchdayStatus.type === 'bench'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-white/10 text-slate-300',
                  )}
                >
                  {userMatchdayStatus.label}
                </span>
              </div>

              {/* Compact Pitch */}
              <div className="relative mx-auto my-1 w-full max-w-[340px]">
                <Pitch
                  home
                  squad={tacticalSquad}
                  activeSlotIndex={userMatchdayStatus.slotIdx}
                  onSelectSlot={undefined}
                />
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3 text-[11px] text-slate-400">
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

            {/* Tile C: Transfer Desk / My Pro Status (Col-span 4) */}
            <div className="col-span-1 lg:col-span-4 flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
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
                <div className="my-4 space-y-3">
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
                    className="w-full bg-[#c4f82a] text-black font-black uppercase tracking-wider hover:bg-[#b0df24]"
                  >
                    + Sign a Player
                  </Button>
                </div>
              ) : (
                <div className="my-4 space-y-4">
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
                        {user?.gamertag || user?.name}
                      </p>
                      <p className="text-[11px] text-[#c4f82a] font-bold">
                        {myClub ? `Signed to ${myClub.name}` : 'Free Agent'}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveMyShirtNumber} className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={myShirtNumber}
                      onChange={(e) => setMyShirtNumber(e.target.value)}
                      placeholder="#"
                      className="h-8 w-16 rounded-lg border border-white/20 bg-black/50 px-2 text-center font-mono text-xs font-black text-white focus:border-[#c4f82a] outline-none"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      className="h-8 text-[11px] font-bold"
                    >
                      Save #
                    </Button>
                    {myClub && (
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        disabled={busy || !transferWindowOpen}
                        onClick={() => setShowLeaveConfirm(true)}
                        className="h-8 text-[11px] font-bold ml-auto"
                      >
                        Leave Club
                      </Button>
                    )}
                  </form>
                </div>
              )}

              <div className="border-t border-white/[0.08] pt-2.5 text-right">
                <span className="text-[10px] text-slate-500">Career Mode Status Active</span>
              </div>
            </div>

            {/* Tile D: Upcoming Run-In Strip (Col-span 8) */}
            <div className="col-span-1 lg:col-span-8 flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
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
        )}

        {/* ================================================================= TAB 2: TACTICS & SQUAD */}
        {activeTab === 'tactics' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
            {/* Left Column (55% width / Col-span 7): Pitch */}
            <div className="col-span-1 lg:col-span-7 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    Tactical Command
                  </p>
                  <h2 className="text-lg font-black uppercase tracking-wider text-white">
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
                    Formation: {formation} • View Only
                  </span>
                )}
              </div>

              {/* Tactical Pitch with smart swap popover */}
              <div className="relative mx-auto w-full max-w-[500px]">
                <Pitch
                  home
                  squad={tacticalSquad}
                  activeSlotIndex={isManager ? activeSlotIdx : userMatchdayStatus.slotIdx}
                  onSelectSlot={isManager ? (idx) => setActiveSlotIdx(idx) : undefined}
                >
                  {/* Smart Player Selection Popover (Manager Mode Only) */}
                  {isManager && activeSlotIdx !== null && (
                    <div
                      ref={pickerRef}
                      className="absolute z-50 w-72 rounded-xl border border-white/20 bg-[#0e1118]/95 p-3 shadow-2xl backdrop-blur-xl"
                      style={{
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="text-xs font-black uppercase tracking-wider text-[#c4f82a]">
                          Slot {activeSlotIdx + 1}: {FORMATIONS[formation]?.slots[activeSlotIdx]?.[0] || 'Player'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveSlotIdx(null)}
                          className="text-white/60 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      <input
                        type="search"
                        autoFocus
                        value={slotSearch}
                        onChange={(e) => setSlotSearch(e.target.value)}
                        placeholder="Search squad..."
                        className="my-2 h-7 w-full rounded border border-white/10 bg-black/50 px-2 text-xs text-white outline-none focus:border-[#c4f82a]"
                      />

                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {squadList
                          .filter((p) =>
                            p.gamertag.toLowerCase().includes(slotSearch.toLowerCase().trim()),
                          )
                          .map((p) => {
                            const isCurrent =
                              starters[activeSlotIdx]?.gamertag.toLowerCase() ===
                              p.gamertag.toLowerCase()
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => assignOrSwapSlot(activeSlotIdx, p)}
                                className={cx(
                                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-xs text-left transition',
                                  isCurrent
                                    ? 'bg-[#c4f82a]/20 text-[#c4f82a] font-bold'
                                    : 'hover:bg-white/10 text-white',
                                )}
                              >
                                <span>{p.gamertag}</span>
                                <span className="font-mono text-[10px] text-slate-400">
                                  #{p.shirt_number ?? '—'}
                                </span>
                              </button>
                            )
                          })}
                      </div>

                      <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            setStarters((prev) => {
                              const next = [...prev]
                              next[activeSlotIdx] = null
                              return next
                            })
                            setActiveSlotIdx(null)
                          }}
                          className="font-bold text-red-400 hover:underline"
                        >
                          Clear Slot
                        </button>
                        {starters[activeSlotIdx] && (
                          <button
                            type="button"
                            onClick={() => {
                              setCaptainGamertag(starters[activeSlotIdx]?.gamertag || null)
                              setActiveSlotIdx(null)
                            }}
                            className="font-bold text-amber-300 hover:underline"
                          >
                            Set as Captain (C)
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </Pitch>
              </div>

              <p className="mt-3 text-center text-xs text-slate-400">
                {isManager
                  ? 'Click any jersey on the field to assign, swap, or set the team captain. All tactical adjustments auto-save.'
                  : 'Starting XI tactical layout set by club management for upcoming fixtures.'}
              </p>
            </div>

            {/* Right Column (45% width / Col-span 5): Tabbed Squad Drawer */}
            <div className="col-span-1 lg:col-span-5 flex flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
              {/* Drawer Top Navigation Switcher */}
              <div className="flex items-center gap-1.5 rounded-xl bg-black/40 p-1 border border-white/5">
                <button
                  type="button"
                  onClick={() => setTacticsDrawerTab('starters')}
                  className={cx(
                    'flex-1 rounded-lg py-1.5 text-center text-xs font-black uppercase tracking-wider transition',
                    tacticsDrawerTab === 'starters'
                      ? 'bg-[#c4f82a] text-black shadow-sm'
                      : 'text-slate-400 hover:text-white',
                  )}
                >
                  Starting XI ({starters.filter(Boolean).length}/11)
                </button>
                <button
                  type="button"
                  onClick={() => setTacticsDrawerTab('bench')}
                  className={cx(
                    'flex-1 rounded-lg py-1.5 text-center text-xs font-black uppercase tracking-wider transition',
                    tacticsDrawerTab === 'bench'
                      ? 'bg-[#c4f82a] text-black shadow-sm'
                      : 'text-slate-400 hover:text-white',
                  )}
                >
                  Bench ({bench.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTacticsDrawerTab('roster')}
                  className={cx(
                    'flex-1 rounded-lg py-1.5 text-center text-xs font-black uppercase tracking-wider transition',
                    tacticsDrawerTab === 'roster'
                      ? 'bg-[#c4f82a] text-black shadow-sm'
                      : 'text-slate-400 hover:text-white',
                  )}
                >
                  Roster ({squadList.length})
                </button>
              </div>

              {/* Drawer Content 1: Starting XI list */}
              {tacticsDrawerTab === 'starters' && (
                <div className="mt-4 space-y-2">
                  <ul className="divide-y divide-white/5">
                    {FORMATIONS[formation]?.slots.map(([pos], idx) => {
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
                            <span className="w-8 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-center font-mono text-[10px] font-black text-[#c4f82a]">
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

                          {isManager && s && (
                            <button
                              type="button"
                              onClick={() => {
                                setStarters((prev) => {
                                  const next = [...prev]
                                  next[idx] = null
                                  return next
                                })
                              }}
                              className="text-[10px] font-bold text-slate-500 hover:text-red-400"
                            >
                              ✕
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Drawer Content 2: Bench list */}
              {tacticsDrawerTab === 'bench' && (
                <div className="mt-4 space-y-3">
                  {isManager && (
                    <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
                      <select
                        value=""
                        onChange={(e) => {
                          const tag = e.target.value
                          if (!tag) return
                          const p = squadList.find((sp) => sp.gamertag === tag)
                          if (!p) return
                          if (bench.some((b) => b.gamertag.toLowerCase() === tag.toLowerCase())) return
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
                        }}
                        className="h-8 flex-1 rounded-lg border border-white/20 bg-black/50 px-2.5 text-xs text-slate-300 outline-none focus:border-[#c4f82a]"
                      >
                        <option value="">+ Add Substitute from squad...</option>
                        {squadList
                          .filter(
                            (sp) =>
                              !starters.some(
                                (st) => st && st.gamertag.toLowerCase() === sp.gamertag.toLowerCase(),
                              ) &&
                              !bench.some((b) => b.gamertag.toLowerCase() === sp.gamertag.toLowerCase()),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.gamertag}>
                              {p.gamertag} (#{p.shirt_number ?? '—'})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {bench.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-500">
                      No substitutes designated on the bench.
                    </p>
                  ) : (
                    <ul className="divide-y divide-white/5">
                      {bench.map((b, idx) => (
                        <li key={idx} className="flex items-center justify-between gap-3 py-2 px-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-8 shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-slate-400">
                              SUB
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-400">
                              #{b.shirtNumber ?? idx + 12}
                            </span>
                            <span className="truncate text-xs font-extrabold text-white">
                              {b.gamertag}
                            </span>
                          </div>
                          {isManager && (
                            <button
                              type="button"
                              onClick={() => setBench((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-[10px] font-bold text-slate-500 hover:text-red-400"
                            >
                              ✕ Remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Drawer Content 3: Full Roster list */}
              {tacticsDrawerTab === 'roster' && (
                <div className="mt-4 space-y-3">
                  {isManager && (
                    <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                      <span className="text-xs font-bold text-slate-300">
                        Roster: {squadList.length} / {maxSquadSize}
                      </span>
                      <Button
                        size="sm"
                        disabled={!transferWindowOpen || squadList.length >= maxSquadSize}
                        onClick={() => setShowSignModal(true)}
                        className="bg-[#c4f82a] text-black font-black uppercase text-[11px]"
                      >
                        + Sign Player
                      </Button>
                    </div>
                  )}

                  <ul className="divide-y divide-white/5 max-h-[460px] overflow-y-auto">
                    {squadList.map((p) => {
                      const isMe =
                        (user?.playerId && p.id === user.playerId) ||
                        (user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase())
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 px-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <SmartImage
                              src={p.avatar_local || AVATAR_PLACEHOLDER}
                              fallback={AVATAR_PLACEHOLDER}
                              alt=""
                              wrapperClassName="h-7 w-7 rounded-lg overflow-hidden bg-black/40 border border-white/10 shrink-0"
                              className="h-full w-full object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-extrabold text-white flex items-center gap-1.5">
                                {p.gamertag}
                                {isMe && (
                                  <span className="rounded bg-[#c4f82a] px-1 py-0.2 text-[8.5px] font-black text-black">
                                    YOU
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Editable number: Manager can edit all, Normal Player can edit only self */}
                            {isManager || isMe ? (
                              <input
                                type="number"
                                min={1}
                                max={99}
                                defaultValue={p.shirt_number ?? ''}
                                onBlur={(e) => {
                                  const val = e.target.value.trim() ? Number(e.target.value) : null
                                  if (isManager) {
                                    void handleSavePlayerShirt(p.id, val)
                                  } else {
                                    setMyShirtNumber(e.target.value)
                                    void updateMyPlayerProfile({ shirtNumber: val })
                                  }
                                }}
                                title="Jersey Number"
                                className="h-6 w-12 rounded border border-white/20 bg-black/50 px-1 text-center font-mono text-xs font-bold text-white focus:border-[#c4f82a] outline-none"
                              />
                            ) : (
                              <span className="font-mono text-xs font-bold text-slate-400 w-10 text-right">
                                #{p.shirt_number ?? '—'}
                              </span>
                            )}

                            {isManager && (
                              <button
                                type="button"
                                disabled={busy || !transferWindowOpen}
                                onClick={() => setReleaseConfirmPlayer(p)}
                                className="rounded p-1 text-slate-500 hover:text-red-400 transition"
                                title="Release player"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= TAB 3: TRANSFERS & INBOX */}
        {activeTab === 'transfers' && (
          <div className="space-y-6">
            {isManager ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Manager Left: Incoming Join Requests */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                        Recruitment Desk
                      </p>
                      <h3 className="text-base font-black uppercase tracking-wider text-white">
                        Incoming Join Requests ({managerJoinRequests.length})
                      </h3>
                    </div>
                  </div>

                  {managerJoinRequests.length === 0 ? (
                    <p className="py-12 text-center text-xs text-slate-400">
                      No pending player applications. Free agents searching for clubs will appear here.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-white/5 space-y-2">
                      {managerJoinRequests.map((req) => (
                        <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
                          <div className="flex items-center gap-3">
                            <SmartImage
                              src={req.avatar_local || AVATAR_PLACEHOLDER}
                              fallback={AVATAR_PLACEHOLDER}
                              alt=""
                              wrapperClassName="h-10 w-10 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0"
                              className="h-full w-full object-cover"
                            />
                            <div>
                              <p className="text-sm font-black text-white">{req.gamertag}</p>
                              {req.message && (
                                <p className="text-xs italic text-slate-400">"{req.message}"</p>
                              )}
                              <span className="text-[10px] text-slate-500">
                                Applied {new Date(req.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {req.status === 'pending' ? (
                              <>
                                <Button
                                  size="sm"
                                  disabled={busy || !transferWindowOpen}
                                  onClick={() => handleDecideJoinReq(req.id, 'accept')}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs"
                                >
                                  ✓ Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => handleDecideJoinReq(req.id, 'reject')}
                                  className="text-red-400 hover:text-red-300 text-xs font-bold"
                                >
                                  ✕ Decline
                                </Button>
                              </>
                            ) : (
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold capitalize text-slate-300">
                                {req.status}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Manager Right: Outbox Offers */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                        Sent Contracts
                      </p>
                      <h3 className="text-base font-black uppercase tracking-wider text-white">
                        Outbox Offers ({managerOffersList.length})
                      </h3>
                    </div>
                    <Button
                      size="sm"
                      disabled={!transferWindowOpen || squadList.length >= maxSquadSize}
                      onClick={() => setShowSignModal(true)}
                      className="bg-[#c4f82a] text-black font-black uppercase tracking-wider text-xs"
                    >
                      + Sign Player
                    </Button>
                  </div>

                  {managerOffersList.length === 0 ? (
                    <p className="py-12 text-center text-xs text-slate-400">
                      No contract offers currently dispatched.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-white/5 space-y-2">
                      {managerOffersList.map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-3 pt-3">
                          <div>
                            <p className="text-sm font-bold text-white">Player #{o.id}</p>
                            {o.message && <p className="text-xs italic text-slate-400">"{o.message}"</p>}
                            <span className="text-[10px] text-slate-500">
                              Dispatched {new Date(o.created_at).toLocaleDateString()}
                            </span>
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
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              /* Player Mode Transfers View */
              <div className="space-y-6">
                {/* Contract Status Banner */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-emerald-950/40 via-black/60 to-black/80 p-5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#c4f82a]">
                      Contract Registration
                    </span>
                    <h3 className="text-base font-black text-white">
                      {myClub ? `Active Player at ${myClub.name}` : 'Free Agent Looking for Club'}
                    </h3>
                  </div>
                  {myClub && (
                    <div className="flex items-center gap-2">
                      <ButtonLink to={`/clubs/${myClub.slug}`} size="sm" variant="outline">
                        View Club
                      </ButtonLink>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy || !transferWindowOpen}
                        onClick={() => setShowLeaveConfirm(true)}
                      >
                        Leave Club
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Player Left: Club Invites / Offers */}
                  <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                      Incoming
                    </p>
                    <h3 className="text-base font-black uppercase tracking-wider text-white">
                      Club Invites & Offers ({playerOffersList.length})
                    </h3>

                    {playerOffersList.length === 0 ? (
                      <p className="py-12 text-center text-xs text-slate-400">
                        No pending contract offers from club managers.
                      </p>
                    ) : (
                      <ul className="mt-4 divide-y divide-white/5 space-y-2">
                        {playerOffersList.map((o) => (
                          <li key={o.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
                            <div>
                              <p className="text-sm font-black text-white">{o.club_name}</p>
                              {o.message && <p className="text-xs text-slate-400 italic">"{o.message}"</p>}
                              <span className="text-[10px] text-slate-500">
                                Received {new Date(o.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                disabled={busy || !transferWindowOpen}
                                onClick={() => handleDecidePlayerOffer(o.id, 'accept')}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black"
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => handleDecidePlayerOffer(o.id, 'reject')}
                                className="text-xs text-red-400 font-bold"
                              >
                                Decline
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Player Right: My Applications */}
                  <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                          Outgoing
                        </p>
                        <h3 className="text-base font-black uppercase tracking-wider text-white">
                          My Applications ({playerJoinRequestsList.length})
                        </h3>
                      </div>
                      <ButtonLink to="/clubs" size="sm" variant="outline" className="text-xs font-bold">
                        Browse Clubs →
                      </ButtonLink>
                    </div>

                    {playerJoinRequestsList.length === 0 ? (
                      <p className="py-12 text-center text-xs text-slate-400">
                        You have not applied to any clubs yet. Browse the league clubs list to request to join.
                      </p>
                    ) : (
                      <ul className="mt-4 divide-y divide-white/5 space-y-2">
                        {playerJoinRequestsList.map((r) => (
                          <li key={r.id} className="flex items-center justify-between gap-3 pt-3">
                            <div>
                              <p className="text-sm font-black text-white">{r.club_name}</p>
                              {r.message && <p className="text-xs text-slate-400 italic">"{r.message}"</p>}
                              <span className="text-[10px] text-slate-500">
                                Applied {new Date(r.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold capitalize text-slate-300">
                                {r.status}
                              </span>
                              {r.status === 'pending' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleWithdrawApplication(r.id)}
                                  className="text-xs font-bold text-red-400 hover:underline"
                                >
                                  Withdraw
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= TAB 4: CALENDAR */}
        {activeTab === 'calendar' && (
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                  Schedule Center
                </p>
                <h2 className="text-lg font-black uppercase tracking-wider text-white">
                  {myClub?.name || 'League'} Fixture Calendar
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs font-bold text-slate-300">
                  {upcomingMatches.length} Upcoming • {completedMatches.length} Results
                </span>
              </div>
            </div>

            {/* Calendar Grid + Matches List */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
              {/* Left Calendar Month View (5 cols) */}
              <div className="col-span-1 lg:col-span-5 rounded-xl border border-white/5 bg-black/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-black uppercase tracking-wider text-white">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (viewMonth === 0) {
                          setViewMonth(11)
                          setViewYear((y) => y - 1)
                        } else {
                          setViewMonth((m) => m - 1)
                        }
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (viewMonth === 11) {
                          setViewMonth(0)
                          setViewYear((y) => y + 1)
                        } else {
                          setViewMonth((m) => m + 1)
                        }
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                      ›
                    </button>
                  </div>
                </div>

                {/* Weekdays */}
                <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] font-bold text-slate-500">
                  {WEEKDAYS.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>

                {/* Days */}
                {(() => {
                  const firstDay = new Date(viewYear, viewMonth, 1)
                  const startOffset = (firstDay.getDay() + 6) % 7 // Monday start
                  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

                  const matchDayCounts = new Map<string, number>()
                  for (const m of matches) {
                    const d = parseKickoffDate(m)
                    if (d) {
                      const ymd = toYmd(d)
                      matchDayCounts.set(ymd, (matchDayCounts.get(ymd) ?? 0) + 1)
                    }
                  }

                  const cells = []
                  for (let i = 0; i < startOffset; i++) {
                    cells.push(<div key={`pad-${i}`} className="h-9" />)
                  }
                  for (let d = 1; d <= daysInMonth; d++) {
                    const thisDate = new Date(viewYear, viewMonth, d)
                    const ymd = toYmd(thisDate)
                    const count = matchDayCounts.get(ymd) ?? 0
                    const isSelected = selectedYmd === ymd

                    cells.push(
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSelectedYmd(isSelected ? null : ymd)}
                        className={cx(
                          'relative h-9 rounded-lg font-mono text-xs font-bold transition flex flex-col items-center justify-center',
                          isSelected
                            ? 'bg-[#c4f82a] text-black font-black'
                            : count > 0
                              ? 'bg-white/10 text-white hover:bg-white/20'
                              : 'text-slate-400 hover:bg-white/5',
                        )}
                      >
                        <span>{d}</span>
                        {count > 0 && !isSelected && (
                          <span className="h-1 w-1 rounded-full bg-[#c4f82a]" />
                        )}
                      </button>,
                    )
                  }
                  return <div className="mt-2 grid grid-cols-7 gap-1">{cells}</div>
                })()}

                {selectedYmd && (
                  <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-xs">
                    <span className="text-[#c4f82a] font-bold">Filtered: {selectedYmd}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedYmd(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      Clear Filter
                    </button>
                  </div>
                )}
              </div>

              {/* Right Matches List (7 cols) */}
              <div className="col-span-1 lg:col-span-7 flex flex-col justify-between">
                <div className="mb-3 flex items-center gap-2 border-b border-white/[0.08] pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setListMode('upcoming')
                      setSelectedYmd(null)
                    }}
                    className={cx(
                      'rounded-lg px-3 py-1 text-xs font-black uppercase tracking-wider transition',
                      listMode === 'upcoming' && !selectedYmd
                        ? 'bg-[#c4f82a] text-black'
                        : 'text-slate-400 hover:text-white',
                    )}
                  >
                    Upcoming ({upcomingMatches.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setListMode('results')
                      setSelectedYmd(null)
                    }}
                    className={cx(
                      'rounded-lg px-3 py-1 text-xs font-black uppercase tracking-wider transition',
                      listMode === 'results' && !selectedYmd
                        ? 'bg-[#c4f82a] text-black'
                        : 'text-slate-400 hover:text-white',
                    )}
                  >
                    Results ({completedMatches.length})
                  </button>
                </div>

                {(() => {
                  let filtered = listMode === 'upcoming' ? upcomingMatches : completedMatches
                  if (selectedYmd) {
                    filtered = sortedMatches.filter((m) => {
                      const d = parseKickoffDate(m)
                      return d && toYmd(d) === selectedYmd
                    })
                  }

                  const pageSize = 6
                  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
                  const paged = filtered.slice((fixturePage - 1) * pageSize, fixturePage * pageSize)

                  if (filtered.length === 0) {
                    return (
                      <p className="py-16 text-center text-xs text-slate-400">
                        {selectedYmd
                          ? `No fixtures scheduled on ${selectedYmd}.`
                          : listMode === 'upcoming'
                            ? 'No upcoming matches scheduled.'
                            : 'No completed match results recorded yet.'}
                      </p>
                    )
                  }

                  return (
                    <div className="space-y-2.5">
                      {paged.map((m) => {
                        const ctx = getFixtureContext(m)
                        return (
                          <Link
                            key={m.id}
                            to={m.id ? `/matches/${m.id}` : '/matches'}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/40 p-3 transition hover:border-[#c4f82a]/40 hover:bg-black/60"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={ctx.oppLogo || CLUB_PLACEHOLDER}
                                alt=""
                                onError={(e) => {
                                  e.currentTarget.src = CLUB_PLACEHOLDER
                                }}
                                className="h-9 w-9 object-contain shrink-0"
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
                                      GW {m.roundNumber}
                                    </span>
                                  )}
                                </div>
                                <p className="truncate text-xs font-black text-white">
                                  vs {ctx.opponent}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  {m.date || 'Unscheduled'} · {m.time || 'Kick-off TBD'}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              {ctx.played ? (
                                <span
                                  className={cx(
                                    'rounded px-2 py-1 text-xs font-black',
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
                                <span className="rounded bg-[#c4f82a]/15 px-2.5 py-1 text-xs font-black text-[#c4f82a]">
                                  Match →
                                </span>
                              )}
                            </div>
                          </Link>
                        )
                      })}

                      {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-white/5 pt-3">
                          <button
                            type="button"
                            disabled={fixturePage <= 1}
                            onClick={() => setFixturePage((p) => Math.max(1, p - 1))}
                            className="rounded bg-white/10 px-2 py-1 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-30"
                          >
                            ‹ Prev
                          </button>
                          <span className="text-xs text-slate-400">
                            Page {fixturePage} of {totalPages}
                          </span>
                          <button
                            type="button"
                            disabled={fixturePage >= totalPages}
                            onClick={() => setFixturePage((p) => Math.min(totalPages, p + 1))}
                            className="rounded bg-white/10 px-2 py-1 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-30"
                          >
                            Next ›
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= TAB 5: CLUB & PRO SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {isManager ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Manager Left: Club Identity */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
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
                      className="bg-[#c4f82a] text-black font-black uppercase tracking-wider"
                    >
                      Save Identity Changes
                    </Button>
                  </form>
                </div>

                {/* Manager Right: Manager Kit & Number */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    Coaching Staff
                  </p>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">
                    Manager Kit & Squad Privileges
                  </h3>

                  <div className="my-4 flex items-center gap-4">
                    <div className="h-16 w-16 shrink-0">
                      <JerseyIcon
                        number={selfShirtNumber ? Number(selfShirtNumber) : 10}
                        home
                      />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">{user.name}</p>
                      <p className="text-xs text-slate-400">Role: Club Manager</p>
                      <span className="mt-1 inline-block rounded bg-[#c4f82a]/20 px-2 py-0.2 text-[9px] font-black uppercase text-[#c4f82a]">
                        {isManagerInSquad ? 'Playing Captain' : 'Coach Only'}
                      </span>
                    </div>
                  </div>

                  {!isManagerInSquad && (
                    <div className="rounded-xl border border-white/10 bg-black/40 p-3.5">
                      <p className="text-xs font-bold text-white">Join Squad as Playing Captain</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Register your gamertag into your squad roster so you can be slotted onto the tactical pitch.
                      </p>
                      <form onSubmit={handleClaimSelf} className="mt-3 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          required
                          value={selfGamertag}
                          onChange={(e) => setSelfGamertag(e.target.value)}
                          placeholder="Your EA Gamertag"
                          className="h-8 flex-1 rounded border border-white/20 bg-black/60 px-2 text-xs text-white outline-none focus:border-[#c4f82a]"
                        />
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={selfShirtNumber}
                          onChange={(e) => setSelfShirtNumber(e.target.value)}
                          placeholder="#"
                          className="h-8 w-14 rounded border border-white/20 bg-black/60 px-1 text-center font-mono text-xs font-bold text-white outline-none"
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
            ) : (
              /* Player Mode Settings View */
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Player Left: My Pro Locker */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    Personal Locker
                  </p>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">
                    Kit & Number Customization
                  </h3>

                  <div className="my-6 flex items-center justify-center">
                    <div className="h-32 w-32">
                      <JerseyIcon
                        number={myShirtNumber ? Number(myShirtNumber) : 10}
                        home
                        isGk={userMatchdayStatus.pos === 'GK'}
                      />
                    </div>
                  </div>

                  <form onSubmit={handleSaveMyShirtNumber} className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-300">
                        Official Shirt Number (1–99)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={myShirtNumber}
                        onChange={(e) => setMyShirtNumber(e.target.value)}
                        placeholder="e.g. 29"
                        className="h-10 w-28 rounded-xl border border-white/20 bg-black/60 px-3 text-center font-mono text-base font-black text-[#c4f82a] outline-none focus:border-[#c4f82a]"
                      />
                    </div>

                    <Button
                      type="submit"
                      size="sm"
                      disabled={busy}
                      className="bg-[#c4f82a] text-black font-black uppercase tracking-wider"
                    >
                      Save Jersey Number
                    </Button>
                  </form>
                </div>

                {/* Player Right: Club Membership & Contract */}
                <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161922]/90 to-[#0e1016]/95 p-5 shadow-xl sm:p-6 backdrop-blur-md">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c4f82a]">
                    Contract Status
                  </p>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">
                    Club Membership & Registration
                  </h3>

                  {myClub ? (
                    <div className="my-4 space-y-4">
                      <div className="flex items-center gap-3.5 rounded-xl bg-black/40 p-4 border border-white/5">
                        <img
                          src={clubCrest}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.src = CLUB_PLACEHOLDER
                          }}
                          className="h-12 w-12 object-contain"
                        />
                        <div>
                          <p className="text-base font-black text-white">{myClub.name}</p>
                          <p className="text-xs text-slate-400">Short Code: {clubShortCode}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2.5">
                        <ButtonLink to={`/clubs/${myClub.slug}`} size="sm" variant="outline">
                          View Club Profile
                        </ButtonLink>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy || !transferWindowOpen}
                          onClick={() => setShowLeaveConfirm(true)}
                        >
                          Leave Club & Become Free Agent
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="my-6 text-center">
                      <p className="text-sm font-bold text-white">You are currently a Free Agent</p>
                      <p className="mt-1 text-xs text-slate-400">
                        You can browse the registered clubs in the league and apply to join.
                      </p>
                      <div className="mt-4">
                        <ButtonLink to="/clubs" size="sm" variant="outline">
                          Browse League Clubs →
                        </ButtonLink>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Confirmation Modal: Leave Club */}
      {showLeaveConfirm &&
        myClub &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            onClick={() => !busy && setShowLeaveConfirm(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12151d] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-black text-white">Leave {myClub.name}?</h3>
              <p className="mt-2 text-xs text-slate-400">
                Are you sure you want to leave <strong className="text-white">{myClub.name}</strong>? You
                will become a <strong className="text-white">Free Agent</strong> immediately.
              </p>
              <div className="mt-6 flex justify-end gap-2.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setShowLeaveConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void handleLeaveClub()}
                >
                  {busy ? 'Leaving…' : `Yes, Leave Club`}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Confirmation Modal: Release Player */}
      {releaseConfirmPlayer &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            onClick={() => !busy && setReleaseConfirmPlayer(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12151d] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-black text-white">
                Release {releaseConfirmPlayer.gamertag}?
              </h3>
              <p className="mt-2 text-xs text-slate-400">
                Are you sure you want to release{' '}
                <strong className="text-white">{releaseConfirmPlayer.gamertag}</strong> from your squad
                roster? They will be removed from your team and become a Free Agent.
              </p>
              <div className="mt-6 flex justify-end gap-2.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setReleaseConfirmPlayer(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void handleReleasePlayer()}
                >
                  {busy ? 'Releasing…' : `Release to Free Agency`}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Sign Player Modal */}
      {showSignModal && (
        <SignPlayerModal
          open={showSignModal}
          onClose={() => setShowSignModal(false)}
          onSuccess={() => {
            setShowSignModal(false)
            if (isManager) void loadManagerData()
          }}
          squadPlayerIds={new Set(squadList.map((p) => p.id))}
          maxSquadSize={maxSquadSize}
        />
      )}

      {/* Account Settings Modal */}
      <AccountSettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  )
}
