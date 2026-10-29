import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  createAdminPlayer,
  createAdminUser,
  deleteAdminPlayer,
  deleteAdminUser,
  getAdminClubs,
  getAdminPlayers,
  getAdminUsers,
  updateAdminPlayer,
  updateAdminUser,
  type AdminPlayer,
  type AdminUser,
  type Club,
  type UserRole,
} from '../api'
import type { Guard, Report } from '../utils'

export type MemberType = 'linked' | 'account_only' | 'player_only'

export interface UnifiedMember {
  key: string
  type: MemberType
  user: AdminUser | null
  player: AdminPlayer | null
  userId: number | null
  playerId: number | null
  email: string | null
  displayName: string | null
  gamertag: string | null
  role: UserRole | null
  isActive: boolean
  shirtNumber: number | null
  clubId: number | null
  clubName: string | null
  clubCode?: string | null
  managedClubId: number | null
  managedClubName: string | null
  isFreeAgent: boolean
  createdAt: string
  updatedAt: string
}

export type SortKey =
  | 'updated_desc'
  | 'updated_asc'
  | 'created_desc'
  | 'created_asc'
  | 'name_asc'
  | 'name_desc'

function isValidDate(iso: string | null | undefined): boolean {
  if (!iso) return false
  const trimmed = iso.trim()
  if (
    trimmed.startsWith('0000-00-00') ||
    trimmed === '0000-00-00 00:00:00' ||
    trimmed === '—' ||
    trimmed === 'null' ||
    trimmed === 'undefined'
  ) {
    return false
  }
  const norm = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  const t = new Date(norm).getTime()
  return !Number.isNaN(t) && t > 0
}

function parseTime(iso: string | null | undefined): number {
  if (!isValidDate(iso)) return 0
  const norm = iso!.includes('T') ? iso! : iso!.replace(' ', 'T')
  const t = new Date(norm).getTime()
  return Number.isNaN(t) ? 0 : t
}

function formatFullDateTime(iso: string | null | undefined): string {
  if (!isValidDate(iso)) return 'Never'
  const norm = iso!.includes('T') ? iso! : iso!.replace(' ', 'T')
  const d = new Date(norm)
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!isValidDate(iso)) return '—'
  const norm = iso!.includes('T') ? iso! : iso!.replace(' ', 'T')
  const diffMs = Date.now() - new Date(norm).getTime()
  if (diffMs < 0) return 'Just now'
  const secs = Math.floor(diffMs / 1000)
  if (secs < 60) return 'Just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export function UsersPlayersView({
  guard,
  report,
  initialSub,
}: {
  guard: Guard
  report: Report
  initialSub?: string
}) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const hasLoadedRef = useRef(false)

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'linked' | 'account_only' | 'player_only'>(
    () => {
      if (initialSub === 'players') return 'player_only'
      if (initialSub === 'accounts') return 'account_only'
      return 'all'
    },
  )
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [clubFilter, setClubFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('updated_desc')

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Unified Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [editingMember, setEditingMember] = useState<UnifiedMember | null>(null)
  const [createType, setCreateType] = useState<MemberType>('linked')

  // Account form fields
  const [uEmail, setUEmail] = useState('')
  const [uPassword, setUPassword] = useState('')
  const [uName, setUName] = useState('')
  const [uRole, setURole] = useState<UserRole>('player')
  const [uManagedClubId, setUManagedClubId] = useState<string>('')
  const [uActive, setUActive] = useState(true)

  // Player form fields
  const [pGamertag, setPGamertag] = useState('')
  const [pSquadClubId, setPSquadClubId] = useState<string>('')
  const [pShirtNumber, setPShirtNumber] = useState<string>('')

  // Conversion toggles when editing single-entity members
  const [attachAccount, setAttachAccount] = useState(false)
  const [attachPlayer, setAttachPlayer] = useState(false)

  const [busy, setBusy] = useState(false)

  const loadAll = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true)
    try {
      const [usersList, playersList, clubsList] = await Promise.all([
        guard(getAdminUsers, 'Could not load registered accounts'),
        guard(getAdminPlayers, 'Could not load league players'),
        guard(() => getAdminClubs(), 'Could not load clubs'),
      ])
      setUsers(usersList)
      setPlayers(playersList)
      setClubs(clubsList)
      hasLoadedRef.current = true
    } catch {
      /* reported */
    } finally {
      setLoading(false)
    }
  }, [guard])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Combine users and players into unified records
  const allMembers = useMemo<UnifiedMember[]>(() => {
    const playerById = new Map<number, AdminPlayer>()
    const playerByUserId = new Map<number, AdminPlayer>()
    const playerByGamertag = new Map<string, AdminPlayer>()

    for (const p of players) {
      playerById.set(p.id, p)
      if (p.user_id) {
        playerByUserId.set(p.user_id, p)
      }
      if (p.gamertag) {
        playerByGamertag.set(p.gamertag.trim().toLowerCase(), p)
      }
    }

    const matchedPlayerIds = new Set<number>()
    const list: UnifiedMember[] = []

    // 1. Process all registered accounts
    for (const u of users) {
      let matchedPlayer: AdminPlayer | undefined
      if (u.player_id && playerById.has(u.player_id)) {
        matchedPlayer = playerById.get(u.player_id)
      } else if (playerByUserId.has(u.id)) {
        matchedPlayer = playerByUserId.get(u.id)
      } else if (u.gamertag && playerByGamertag.has(u.gamertag.trim().toLowerCase())) {
        matchedPlayer = playerByGamertag.get(u.gamertag.trim().toLowerCase())
      }

      if (matchedPlayer) {
        matchedPlayerIds.add(matchedPlayer.id)
        list.push({
          key: `u-${u.id}_p-${matchedPlayer.id}`,
          type: 'linked',
          user: u,
          player: matchedPlayer,
          userId: u.id,
          playerId: matchedPlayer.id,
          email: u.email,
          displayName: u.display_name || matchedPlayer.user_name || null,
          gamertag: matchedPlayer.gamertag || u.gamertag || null,
          role: u.role,
          isActive: Boolean(u.is_active),
          shirtNumber: matchedPlayer.shirt_number,
          clubId: matchedPlayer.club_id || u.club_id,
          clubName: matchedPlayer.club_name || u.club_name,
          clubCode: matchedPlayer.club_code,
          managedClubId: u.club_id,
          managedClubName: u.club_name,
          isFreeAgent: Boolean(matchedPlayer.is_free_agent),
          createdAt: u.created_at || matchedPlayer.created_at,
          updatedAt:
            u.updated_at ||
            matchedPlayer.updated_at ||
            u.created_at ||
            matchedPlayer.created_at,
        })
      } else {
        list.push({
          key: `u-${u.id}`,
          type: 'account_only',
          user: u,
          player: null,
          userId: u.id,
          playerId: null,
          email: u.email,
          displayName: u.display_name,
          gamertag: u.gamertag || null,
          role: u.role,
          isActive: Boolean(u.is_active),
          shirtNumber: null,
          clubId: null,
          clubName: null,
          managedClubId: u.club_id,
          managedClubName: u.club_name,
          isFreeAgent: false,
          createdAt: u.created_at,
          updatedAt: u.updated_at || u.created_at,
        })
      }
    }

    // 2. Process all remaining players that have no user account
    for (const p of players) {
      if (matchedPlayerIds.has(p.id)) continue
      list.push({
        key: `p-${p.id}`,
        type: 'player_only',
        user: null,
        player: p,
        userId: null,
        playerId: p.id,
        email: p.user_email || null,
        displayName: p.user_name || null,
        gamertag: p.gamertag,
        role: null,
        isActive: true,
        shirtNumber: p.shirt_number,
        clubId: p.club_id,
        clubName: p.club_name,
        clubCode: p.club_code,
        managedClubId: null,
        managedClubName: null,
        isFreeAgent: Boolean(p.is_free_agent),
        createdAt: p.created_at,
        updatedAt: p.updated_at || p.created_at,
      })
    }

    return list
  }, [users, players])

  // Counts for top pill tabs
  const counts = useMemo(() => {
    let linked = 0
    let accountOnly = 0
    let playerOnly = 0
    for (const m of allMembers) {
      if (m.type === 'linked') linked++
      else if (m.type === 'account_only') accountOnly++
      else if (m.type === 'player_only') playerOnly++
    }
    return {
      all: allMembers.length,
      linked,
      accountOnly,
      playerOnly,
    }
  }, [allMembers])

  // Filtering and Sorting
  const filteredAndSortedMembers = useMemo(() => {
    const q = search.trim().toLowerCase()

    const filtered = allMembers.filter((m) => {
      // Type filter
      if (typeFilter !== 'all' && m.type !== typeFilter) return false

      // Role filter
      if (roleFilter !== 'all') {
        if (roleFilter === 'no_account') {
          if (m.role !== null) return false
        } else if (m.role !== roleFilter) {
          return false
        }
      }

      // Club filter
      if (clubFilter !== 'all') {
        if (clubFilter === 'free') {
          if (!m.isFreeAgent && (m.clubId || m.managedClubId)) return false
        } else if (clubFilter === 'signed') {
          if (!m.clubId && !m.managedClubId) return false
        } else {
          const cid = Number(clubFilter)
          if (m.clubId !== cid && m.managedClubId !== cid) return false
        }
      }

      // Search query
      if (q) {
        const gamertag = (m.gamertag ?? '').toLowerCase()
        const name = (m.displayName ?? '').toLowerCase()
        const email = (m.email ?? '').toLowerCase()
        const club = (m.clubName ?? '').toLowerCase()
        const managed = (m.managedClubName ?? '').toLowerCase()
        const role = (m.role ?? '').toLowerCase()
        return (
          gamertag.includes(q) ||
          name.includes(q) ||
          email.includes(q) ||
          club.includes(q) ||
          managed.includes(q) ||
          role.includes(q)
        )
      }

      return true
    })

    // Sort
    filtered.sort((a, b) => {
      if (sortKey === 'updated_desc') {
        return parseTime(b.updatedAt) - parseTime(a.updatedAt) || (b.userId ?? b.playerId ?? 0) - (a.userId ?? a.playerId ?? 0)
      }
      if (sortKey === 'updated_asc') {
        return parseTime(a.updatedAt) - parseTime(b.updatedAt) || (a.userId ?? a.playerId ?? 0) - (b.userId ?? b.playerId ?? 0)
      }
      if (sortKey === 'created_desc') {
        return parseTime(b.createdAt) - parseTime(a.createdAt) || (b.userId ?? b.playerId ?? 0) - (a.userId ?? a.playerId ?? 0)
      }
      if (sortKey === 'created_asc') {
        return parseTime(a.createdAt) - parseTime(b.createdAt) || (a.userId ?? a.playerId ?? 0) - (b.userId ?? b.playerId ?? 0)
      }
      if (sortKey === 'name_asc') {
        const nameA = (a.gamertag || a.displayName || a.email || '').toLowerCase()
        const nameB = (b.gamertag || b.displayName || b.email || '').toLowerCase()
        return nameA.localeCompare(nameB)
      }
      if (sortKey === 'name_desc') {
        const nameA = (a.gamertag || a.displayName || a.email || '').toLowerCase()
        const nameB = (b.gamertag || b.displayName || b.email || '').toLowerCase()
        return nameB.localeCompare(nameA)
      }
      return 0
    })

    return filtered
  }, [allMembers, typeFilter, roleFilter, clubFilter, search, sortKey])

  useEffect(() => {
    setPage(1)
  }, [typeFilter, roleFilter, clubFilter, search, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedMembers.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedMembers = filteredAndSortedMembers.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  )

  // Column header sort helper
  const handleHeaderSort = (field: 'activity' | 'name') => {
    if (field === 'activity') {
      setSortKey((prev) => (prev === 'updated_desc' ? 'updated_asc' : 'updated_desc'))
    } else if (field === 'name') {
      setSortKey((prev) => (prev === 'name_asc' ? 'name_desc' : 'name_asc'))
    }
  }

  const getSortIndicator = (field: 'activity' | 'name') => {
    if (field === 'activity') {
      if (sortKey === 'updated_desc' || sortKey === 'created_desc') return ' ▼'
      if (sortKey === 'updated_asc' || sortKey === 'created_asc') return ' ▲'
      return ' ↕'
    }
    if (field === 'name') {
      if (sortKey === 'name_asc') return ' ▲'
      if (sortKey === 'name_desc') return ' ▼'
      return ' ↕'
    }
    return ''
  }

  // Drawer handlers
  const openCreateMember = () => {
    setIsCreating(true)
    setEditingMember(null)
    setCreateType('linked')

    setUEmail('')
    setUPassword('')
    setUName('')
    setURole('player')
    setUManagedClubId('')
    setUActive(true)

    setPGamertag('')
    setPSquadClubId('')
    setPShirtNumber('')

    setAttachAccount(false)
    setAttachPlayer(false)
    setDrawerOpen(true)
  }

  const openEditMember = (m: UnifiedMember) => {
    setIsCreating(false)
    setEditingMember(m)

    // Account fields
    if (m.user) {
      setUEmail(m.user.email)
      setUPassword('')
      setUName(m.user.display_name ?? '')
      setURole(m.user.role)
      setUManagedClubId(m.user.club_id != null ? String(m.user.club_id) : '')
      setUActive(Boolean(m.user.is_active))
    } else {
      setUEmail('')
      setUPassword('')
      setUName(m.displayName ?? '')
      setURole('player')
      setUManagedClubId('')
      setUActive(true)
    }

    // Player fields
    if (m.player) {
      setPGamertag(m.player.gamertag)
      setPSquadClubId(m.player.club_id != null ? String(m.player.club_id) : '')
      setPShirtNumber(m.player.shirt_number != null ? String(m.player.shirt_number) : '')
    } else {
      setPGamertag(m.gamertag ?? '')
      setPSquadClubId('')
      setPShirtNumber('')
    }

    setAttachAccount(false)
    setAttachPlayer(false)
    setDrawerOpen(true)
  }

  const handleSaveMember = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (isCreating) {
        if (createType === 'linked') {
          if (!uEmail.trim() || !uPassword || !pGamertag.trim()) {
            throw new Error('Email, password, and gamertag are required for linked accounts.')
          }
          let finalRole = uRole
          let finalManagedClub = uManagedClubId ? Number(uManagedClubId) : null
          if (finalRole === 'club_manager' && !finalManagedClub) finalRole = 'player'
          if (finalRole === 'player') finalManagedClub = null

          await guard(
            () =>
              createAdminUser({
                email: uEmail.trim(),
                password: uPassword,
                displayName: uName.trim() || null,
                role: finalRole,
                clubId: finalManagedClub,
                gamertag: pGamertag.trim(),
                isActive: uActive,
              }),
            'Could not create linked account',
          )

          // If squad club or shirt number specified, find the newly created player row and update
          if (pSquadClubId || pShirtNumber.trim()) {
            const freshPlayers = await getAdminPlayers()
            const fresh = freshPlayers.find(
              (p) => p.gamertag.toLowerCase() === pGamertag.trim().toLowerCase(),
            )
            if (fresh) {
              await guard(
                () =>
                  updateAdminPlayer(fresh.id, {
                    gamertag: fresh.gamertag,
                    clubId: pSquadClubId ? Number(pSquadClubId) : null,
                    shirtNumber: pShirtNumber.trim() ? Number(pShirtNumber.trim()) : null,
                  }),
                'Could not set player squad details',
              )
            }
          }
          report('ok', `Created linked account & player for ${pGamertag.trim()}.`)
        } else if (createType === 'account_only') {
          if (!uEmail.trim() || !uPassword) {
            throw new Error('Email and password are required.')
          }
          let finalRole = uRole
          let finalManagedClub = uManagedClubId ? Number(uManagedClubId) : null
          if (finalRole === 'club_manager' && !finalManagedClub) finalRole = 'player'
          if (finalRole === 'player') finalManagedClub = null

          await guard(
            () =>
              createAdminUser({
                email: uEmail.trim(),
                password: uPassword,
                displayName: uName.trim() || null,
                role: finalRole,
                clubId: finalManagedClub,
                isActive: uActive,
                gamertag: null,
              }),
            'Could not create user account',
          )
          report('ok', `Created user account ${uEmail.trim()}.`)
        } else if (createType === 'player_only') {
          if (!pGamertag.trim()) {
            throw new Error('Gamertag is required.')
          }
          await guard(
            () =>
              createAdminPlayer({
                gamertag: pGamertag.trim(),
                clubId: pSquadClubId ? Number(pSquadClubId) : null,
                shirtNumber: pShirtNumber.trim() ? Number(pShirtNumber.trim()) : null,
              }),
            'Could not register league player',
          )
          report('ok', `Registered league player ${pGamertag.trim()}.`)
        }
      } else if (editingMember) {
        // Save existing member
        // 1. Update or create user account
        if (editingMember.user) {
          let finalRole = uRole
          let finalManagedClub = uManagedClubId ? Number(uManagedClubId) : null
          if (finalRole === 'club_manager' && !finalManagedClub) finalRole = 'player'
          if (finalRole === 'player') finalManagedClub = null

          await guard(
            () =>
              updateAdminUser(editingMember.user!.id, {
                email: uEmail.trim(),
                displayName: uName.trim() || null,
                role: finalRole,
                clubId: finalManagedClub,
                gamertag: pGamertag.trim() || null,
                isActive: uActive,
                ...(uPassword ? { password: uPassword } : {}),
              }),
            'Could not update account credentials',
          )
        } else if (attachAccount && uEmail.trim() && uPassword) {
          let finalRole = uRole
          let finalManagedClub = uManagedClubId ? Number(uManagedClubId) : null
          if (finalRole === 'club_manager' && !finalManagedClub) finalRole = 'player'
          if (finalRole === 'player') finalManagedClub = null

          await guard(
            () =>
              createAdminUser({
                email: uEmail.trim(),
                password: uPassword,
                displayName: uName.trim() || null,
                role: finalRole,
                clubId: finalManagedClub,
                gamertag: pGamertag.trim() || editingMember.gamertag || null,
                isActive: uActive,
              }),
            'Could not create login account for player',
          )
        }

        // 2. Update or create player profile
        if (editingMember.player) {
          await guard(
            () =>
              updateAdminPlayer(editingMember.player!.id, {
                gamertag: pGamertag.trim(),
                clubId: pSquadClubId ? Number(pSquadClubId) : null,
                shirtNumber: pShirtNumber.trim() ? Number(pShirtNumber.trim()) : null,
              }),
            'Could not update player profile',
          )
        } else if (attachPlayer && pGamertag.trim()) {
          await guard(
            () =>
              createAdminPlayer({
                gamertag: pGamertag.trim(),
                clubId: pSquadClubId ? Number(pSquadClubId) : null,
                shirtNumber: pShirtNumber.trim() ? Number(pShirtNumber.trim()) : null,
              }),
            'Could not register player profile',
          )
        }

        report(
          'ok',
          `Saved changes for ${pGamertag.trim() || uName.trim() || uEmail.trim() || 'member'}.`,
        )
      }

      setDrawerOpen(false)
      await loadAll()
    } catch {
      /* handled */
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteUserAccount = async (u: AdminUser) => {
    if (!window.confirm(`Delete user login account ${u.email}?`)) return
    setBusy(true)
    try {
      await guard(() => deleteAdminUser(u.id), 'Could not delete user account')
      report('ok', `Deleted user account ${u.email}.`)
      setDrawerOpen(false)
      await loadAll()
    } catch {
      /* handled */
    } finally {
      setBusy(false)
    }
  }

  const handleDeletePlayerRecord = async (p: AdminPlayer) => {
    if (!window.confirm(`Delete league player profile ${p.gamertag}?`)) return
    setBusy(true)
    try {
      await guard(() => deleteAdminPlayer(p.id), 'Could not delete player')
      report('ok', `Deleted player ${p.gamertag}.`)
      setDrawerOpen(false)
      await loadAll()
    } catch {
      /* handled */
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteBoth = async (u: AdminUser, p: AdminPlayer) => {
    if (!window.confirm(`Completely delete both account (${u.email}) and player profile (${p.gamertag})?`))
      return
    setBusy(true)
    try {
      await guard(() => deleteAdminUser(u.id), 'Could not delete user account')
      await guard(() => deleteAdminPlayer(p.id), 'Could not delete player profile')
      report('ok', `Deleted account and player profile.`)
      setDrawerOpen(false)
      await loadAll()
    } catch {
      /* handled */
    } finally {
      setBusy(false)
    }
  }

  const handleInlineAssignManagedClub = async (m: UnifiedMember, nextClubIdStr: string) => {
    if (!m.user) return
    const nextClubId = nextClubIdStr ? Number(nextClubIdStr) : null
    const nextRole: UserRole =
      nextClubId !== null && m.user.role === 'player'
        ? 'club_manager'
        : nextClubId === null && m.user.role === 'club_manager'
          ? 'player'
          : m.user.role

    try {
      await guard(
        () =>
          updateAdminUser(m.user!.id, {
            email: m.user!.email,
            displayName: m.user!.display_name,
            role: nextRole,
            clubId: nextClubId,
            gamertag: m.user!.gamertag,
            isActive: Boolean(m.user!.is_active),
          }),
        `Could not assign club for ${m.user.email}`,
      )
      const targetClub = clubs.find((c) => c.id === nextClubId)
      report(
        'ok',
        nextClubId === null
          ? `Unassigned ${m.displayName || m.email} from club management.`
          : `Assigned ${m.displayName || m.email} as manager of ${targetClub?.name ?? 'club'}.`,
      )
      await loadAll()
    } catch {
      /* handled */
    }
  }

  return (
    <div className="adm-stack">
      {/* Subnav & Pill Tabs */}
      <div className="adm-subnav-bar">
        <div className="adm-pill-tabs">
          <button
            type="button"
            className={`adm-pill-tab ${typeFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            👥 All Members ({counts.all})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${typeFilter === 'linked' ? 'is-active' : ''}`}
            onClick={() => setTypeFilter('linked')}
          >
            🔗 Linked ({counts.linked})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${typeFilter === 'account_only' ? 'is-active' : ''}`}
            onClick={() => setTypeFilter('account_only')}
          >
            👤 Accounts Only ({counts.accountOnly})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${typeFilter === 'player_only' ? 'is-active' : ''}`}
            onClick={() => setTypeFilter('player_only')}
          >
            🎮 Roster Only ({counts.playerOnly})
          </button>
        </div>

        <div className="adm-row-actions">
          <button type="button" className="adm-btn adm-btn-primary" onClick={openCreateMember}>
            + Add Member
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <section className="adm-card">
        {/* Toolbar */}
        <div className="adm-toolbar">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by gamertag, name, email, club, or role…"
            className="adm-input adm-search-input"
          />

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="adm-select"
            title="Filter by account role"
          >
            <option value="all">All Roles</option>
            <option value="club_manager">Club Managers</option>
            <option value="player">Players</option>
            <option value="admin">Admins</option>
            <option value="owner">Owners</option>
            <option value="no_account">Roster Only (No Account)</option>
          </select>

          <select
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
            className="adm-select"
            title="Filter by club"
          >
            <option value="all">All Clubs</option>
            <option value="signed">Signed to a Club</option>
            <option value="free">Free Agents (Unsigned)</option>
            <optgroup label="Specific Clubs">
              {clubs.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="adm-select"
            title="Sort members list"
          >
            <option value="updated_desc">Recently Active (Newest first)</option>
            <option value="updated_asc">Recently Active (Oldest first)</option>
            <option value="created_desc">Joined Date (Newest first)</option>
            <option value="created_asc">Joined Date (Oldest first)</option>
            <option value="name_asc">Gamertag / Name (A → Z)</option>
            <option value="name_desc">Gamertag / Name (Z → A)</option>
          </select>

          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="adm-select adm-select-sm"
            title="Rows per page"
          >
            <option value={15}>15 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>

        {loading ? (
          <div className="adm-empty">Loading members directory…</div>
        ) : filteredAndSortedMembers.length === 0 ? (
          <div className="adm-empty">No members match the selected filters.</div>
        ) : (
          <>
            <div className="adm-table-wrap">
              <table className="adm-table adm-users-table">
                <thead>
                  <tr>
                    <th
                      className="adm-th-sortable"
                      onClick={() => handleHeaderSort('name')}
                      title="Sort by Gamertag / Name"
                    >
                      Member / Gamertag
                      <span className="adm-th-sort-indicator">{getSortIndicator('name')}</span>
                    </th>
                    <th style={{ width: 130 }}>Type</th>
                    <th style={{ width: 140 }}>Role & Status</th>
                    <th>Squad / Managed Club</th>
                    <th
                      className="adm-th-sortable"
                      style={{ width: 150 }}
                      onClick={() => handleHeaderSort('activity')}
                      title="Sort by Activity"
                    >
                      Activity
                      <span className="adm-th-sort-indicator">{getSortIndicator('activity')}</span>
                    </th>
                    <th style={{ textAlign: 'right', width: 90 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMembers.map((m) => (
                    <tr
                      key={m.key}
                      className="adm-users-row"
                      onClick={() => openEditMember(m)}
                      title={`Click row to edit ${m.gamertag || m.displayName || 'member'}`}
                    >
                      {/* Member / Gamertag */}
                      <td className="adm-member-cell">
                        <div className="adm-member-info">
                          <div className="adm-member-primary">
                            <span className="adm-member-gamertag">
                              {m.gamertag || m.displayName || 'Unnamed Member'}
                            </span>
                            {m.shirtNumber != null && (
                              <span className="adm-jersey-pill" title={`Jersey #${m.shirtNumber}`}>
                                #{m.shirtNumber}
                              </span>
                            )}
                          </div>

                          {m.displayName && m.displayName !== m.gamertag && (
                            <div className="adm-member-subname" title="Display Name">
                              {m.displayName}
                            </div>
                          )}

                          {m.email ? (
                            <div className="adm-member-email" title={m.email}>
                              <span className="adm-email-text">{m.email}</span>
                              <button
                                type="button"
                                className="adm-icon-btn-subtle"
                                title="Copy email address"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void navigator.clipboard?.writeText(m.email!)
                                  report('ok', `Copied ${m.email} to clipboard.`)
                                }}
                              >
                                📋
                              </button>
                            </div>
                          ) : (
                            <div className="adm-member-email">
                              <span className="adm-email-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>
                                No web account
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td>
                        {m.type === 'linked' ? (
                          <span
                            className="adm-unified-pill type-linked"
                            title="User account linked to league player profile"
                          >
                            🔗 Linked
                          </span>
                        ) : m.type === 'account_only' ? (
                          <span
                            className="adm-unified-pill type-account"
                            title="User account without player profile"
                          >
                            👤 Account Only
                          </span>
                        ) : (
                          <span
                            className="adm-unified-pill type-roster"
                            title="Player profile without a web user account"
                          >
                            🎮 Roster Only
                          </span>
                        )}
                      </td>

                      {/* Role & Status */}
                      <td>
                        <div className="adm-role-status-cell">
                          <div className="adm-status-indicator">
                            <span
                              className={`adm-status-dot ${
                                !m.user
                                  ? 'dot-unlinked'
                                  : m.isActive
                                    ? 'dot-active'
                                    : 'dot-suspended'
                              }`}
                              title={
                                !m.user
                                  ? 'Roster player without web account'
                                  : m.isActive
                                    ? 'Active account'
                                    : 'Suspended account'
                              }
                            />
                            <span className="adm-role-label">
                              {m.role === 'owner' ? (
                                <span className="adm-role-text role-owner">Owner</span>
                              ) : m.role === 'admin' ? (
                                <span className="adm-role-text role-admin">Admin</span>
                              ) : m.role === 'club_manager' ? (
                                <span className="adm-role-text role-manager">Club Manager</span>
                              ) : m.role === 'player' ? (
                                <span className="adm-role-text role-player">Player</span>
                              ) : (
                                <span className="adm-role-text role-none">Roster Only</span>
                              )}
                            </span>
                          </div>

                          {m.user && !m.isActive && (
                            <span className="adm-suspended-badge">Suspended</span>
                          )}
                        </div>
                      </td>

                      {/* Squad / Managed Club */}
                      <td>
                        <div className="adm-club-assignment-cell">
                          {m.managedClubName && (
                            <div className="adm-assignment-row" title={`Manager of ${m.managedClubName}`}>
                              <span className="adm-assignment-tag tag-manager">
                                <span className="adm-tag-icon">👔</span>
                                <span className="adm-tag-text">{m.managedClubName}</span>
                              </span>
                            </div>
                          )}

                          {m.clubName ? (
                            <div className="adm-assignment-row" title={`Player for ${m.clubName}`}>
                              <span className="adm-assignment-tag tag-squad">
                                <span className="adm-tag-icon">⚽</span>
                                <span className="adm-tag-text">{m.clubName}</span>
                                {m.shirtNumber != null && (
                                  <span className="adm-tag-num">#{m.shirtNumber}</span>
                                )}
                              </span>
                            </div>
                          ) : (
                            !m.managedClubName && (
                              <div className="adm-assignment-row">
                                <span className="adm-assignment-tag tag-free" title="Unassigned / Free Agent">
                                  Free Agent
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </td>

                      {/* Activity */}
                      <td
                        title={`Updated: ${formatFullDateTime(m.updatedAt)}\nCreated: ${formatFullDateTime(
                          m.createdAt,
                        )}`}
                      >
                        <div className="adm-activity-cell">
                          <div className="adm-activity-primary">
                            {formatRelativeTime(m.updatedAt || m.createdAt)}
                          </div>
                          {isValidDate(m.createdAt) && (
                            <div className="adm-activity-secondary">
                              Joined {formatRelativeTime(m.createdAt)}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="adm-btn adm-btn-secondary adm-btn-sm adm-edit-btn"
                          onClick={() => openEditMember(m)}
                          title={`Edit ${m.gamertag || m.displayName || 'member'}`}
                        >
                          Edit ⚙️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredAndSortedMembers.length > pageSize && (
              <div className="adm-pagination">
                <span>
                  Showing {(safePage - 1) * pageSize + 1}–
                  {Math.min(safePage * pageSize, filteredAndSortedMembers.length)} of{' '}
                  {filteredAndSortedMembers.length} members
                </span>
                <div className="adm-row-actions">
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Previous
                  </button>
                  <span className="adm-text-muted">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Unified Slide-Over Drawer */}
      {drawerOpen && (
        <div className="adm-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <div>
                <span className="adm-eyebrow">
                  {isCreating ? 'NEW MEMBER' : 'EDIT MEMBER'}
                </span>
                <h3>
                  {isCreating
                    ? 'Add Member / Player'
                    : editingMember?.gamertag ||
                      editingMember?.displayName ||
                      editingMember?.email ||
                      'Member Profile'}
                </h3>
              </div>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="adm-drawer-body">
              <form onSubmit={handleSaveMember} className="adm-form-stack">
                {/* Creation Mode Selector */}
                {isCreating && (
                  <div className="adm-radio-toggle-group">
                    <button
                      type="button"
                      className={`adm-radio-toggle-btn ${createType === 'linked' ? 'is-active' : ''}`}
                      onClick={() => setCreateType('linked')}
                    >
                      🔗 Account & Player
                    </button>
                    <button
                      type="button"
                      className={`adm-radio-toggle-btn ${createType === 'account_only' ? 'is-active' : ''}`}
                      onClick={() => setCreateType('account_only')}
                    >
                      👤 Account Only
                    </button>
                    <button
                      type="button"
                      className={`adm-radio-toggle-btn ${createType === 'player_only' ? 'is-active' : ''}`}
                      onClick={() => setCreateType('player_only')}
                    >
                      🎮 Roster Only
                    </button>
                  </div>
                )}

                {/* Section 1: User Account Credentials & Role */}
                {(isCreating && (createType === 'linked' || createType === 'account_only')) ||
                (!isCreating && (editingMember?.user || attachAccount)) ? (
                  <div className="adm-drawer-section">
                    <div className="adm-drawer-section-title">
                      <span>👤 User Account Credentials & Role</span>
                      {!isCreating && !editingMember?.user && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-ghost adm-btn-sm"
                          onClick={() => setAttachAccount(false)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    <label className="adm-field">
                      <span>Email Address *</span>
                      <input
                        type="email"
                        required
                        value={uEmail}
                        onChange={(e) => setUEmail(e.target.value)}
                        className="adm-input"
                        placeholder="user@domain.com"
                      />
                    </label>

                    <label className="adm-field">
                      <span>
                        {editingMember?.user
                          ? 'New Password (leave blank to keep current)'
                          : 'Password *'}
                      </span>
                      <input
                        type="password"
                        required={!editingMember?.user}
                        minLength={8}
                        value={uPassword}
                        onChange={(e) => setUPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="adm-input"
                      />
                    </label>

                    <label className="adm-field">
                      <span>Display Name</span>
                      <input
                        type="text"
                        value={uName}
                        onChange={(e) => setUName(e.target.value)}
                        placeholder="User or Manager Name"
                        className="adm-input"
                      />
                    </label>

                    <label className="adm-field">
                      <span>Role</span>
                      <select
                        value={uRole}
                        onChange={(e) => {
                          const next = e.target.value as UserRole
                          setURole(next)
                          if (next === 'player') setUManagedClubId('')
                        }}
                        className="adm-select"
                      >
                        <option value="player">Player</option>
                        <option value="club_manager">Club Manager</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    </label>

                    {uRole !== 'player' && (
                      <label className="adm-field">
                        <span>Managed Club</span>
                        <select
                          value={uManagedClubId}
                          onChange={(e) => {
                            const nextVal = e.target.value
                            setUManagedClubId(nextVal)
                            if (!nextVal && uRole === 'club_manager') {
                              setURole('player')
                            }
                          }}
                          className="adm-select"
                        >
                          <option value="">None</option>
                          {clubs.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.name} ({c.status})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="adm-check-row">
                      <input
                        type="checkbox"
                        checked={uActive}
                        onChange={(e) => setUActive(e.target.checked)}
                      />
                      <span>Account is active (uncheck to suspend sign-in)</span>
                    </label>
                  </div>
                ) : (
                  !isCreating && (
                    <div className="adm-drawer-section" style={{ textAlign: 'center', padding: '16px' }}>
                      <p className="adm-text-muted" style={{ fontSize: '13px', marginBottom: 10 }}>
                        This player has no web login account.
                      </p>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => setAttachAccount(true)}
                      >
                        + Create Web Login Account for this Player
                      </button>
                    </div>
                  )
                )}

                {/* Section 2: Player Profile & League Roster */}
                {(isCreating && (createType === 'linked' || createType === 'player_only')) ||
                (!isCreating && (editingMember?.player || attachPlayer)) ? (
                  <div className="adm-drawer-section">
                    <div className="adm-drawer-section-title">
                      <span>🎮 Player Profile & League Roster</span>
                      {!isCreating && !editingMember?.player && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-ghost adm-btn-sm"
                          onClick={() => setAttachPlayer(false)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    <label className="adm-field">
                      <span>Gamertag *</span>
                      <input
                        type="text"
                        required
                        value={pGamertag}
                        onChange={(e) => setPGamertag(e.target.value)}
                        placeholder="In-game EA FC gamertag"
                        className="adm-input"
                      />
                    </label>

                    <label className="adm-field">
                      <span>Squad Assignment</span>
                      <select
                        value={pSquadClubId}
                        onChange={(e) => setPSquadClubId(e.target.value)}
                        className="adm-select"
                      >
                        <option value="">Free Agent (No Club)</option>
                        {clubs.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="adm-field">
                      <span>Jersey / Shirt Number (1–99, Optional)</span>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={pShirtNumber}
                        onChange={(e) => setPShirtNumber(e.target.value)}
                        placeholder="e.g. 10"
                        className="adm-input"
                      />
                    </label>
                  </div>
                ) : (
                  !isCreating && (
                    <div className="adm-drawer-section" style={{ textAlign: 'center', padding: '16px' }}>
                      <p className="adm-text-muted" style={{ fontSize: '13px', marginBottom: 10 }}>
                        This user has no league player profile.
                      </p>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => setAttachPlayer(true)}
                      >
                        + Register Player Profile for this User
                      </button>
                    </div>
                  )
                )}

                {/* Form Buttons */}
                <div className="adm-row-actions" style={{ marginTop: 12 }}>
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : isCreating ? 'Create Member' : 'Save Changes'}
                  </button>

                  {!isCreating && editingMember && (
                    <>
                      {editingMember.type === 'linked' && (
                        <>
                          <button
                            type="button"
                            className="adm-btn adm-btn-danger adm-btn-sm"
                            disabled={busy}
                            onClick={() =>
                              handleDeleteBoth(editingMember.user!, editingMember.player!)
                            }
                            title="Delete both user account and player profile"
                          >
                            Delete Both
                          </button>
                          <button
                            type="button"
                            className="adm-btn adm-btn-secondary adm-btn-sm"
                            disabled={busy}
                            onClick={() => handleDeleteUserAccount(editingMember.user!)}
                            title="Keep player in league, remove web login account"
                          >
                            Delete Account Only
                          </button>
                        </>
                      )}
                      {editingMember.type === 'account_only' && editingMember.user && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-danger"
                          disabled={busy}
                          onClick={() => handleDeleteUserAccount(editingMember.user!)}
                        >
                          Delete Account
                        </button>
                      )}
                      {editingMember.type === 'player_only' && editingMember.player && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-danger"
                          disabled={busy}
                          onClick={() => handleDeletePlayerRecord(editingMember.player!)}
                        >
                          Delete Player
                        </button>
                      )}
                    </>
                  )}
                </div>
              </form>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
