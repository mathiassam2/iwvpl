import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { EaBulkLinkWizardModal } from './EaBulkLinkWizardModal'
import {
  addPlayer,
  assignClubManager,
  assignDivision,
  createAdminClub,
  decideClub,
  deleteAdminClub,
  getAdminClubs,
  getAdminRegions,
  getAdminUsers,
  getClubDetail,
  getDivisions,
  getPendingClubs,
  invalidateAdminCache,
  removePlayer,
  saveClubLineup,
  searchEaClubs,
  setFeaturedClubs,
  updateClub,
  type AdminUser,
  type Club,
  type ClubDetailResponse,
  type ClubLineupBench,
  type ClubLineupSlot,
  type Division,
  type EaClubSearchResult,
  type HomepageRegion,
  type PendingClub,
} from '../api'
import {
  compressImageFile,
  DEFAULT_REGIONS,
  ISO_TO_FLAG,
  isSameCountry,
  type Guard,
  type Report,
} from '../utils'

export const ADMIN_FORMATIONS: Record<string, Array<{ pos: string; x: number; y: number }>> = {
  '4-3-3': [
    { pos: 'GK', x: 50, y: 90 },
    { pos: 'LB', x: 16, y: 72 },
    { pos: 'CB', x: 38, y: 74 },
    { pos: 'CB', x: 62, y: 74 },
    { pos: 'RB', x: 84, y: 72 },
    { pos: 'CM', x: 26, y: 49 },
    { pos: 'CDM', x: 50, y: 54 },
    { pos: 'CM', x: 74, y: 49 },
    { pos: 'LW', x: 18, y: 22 },
    { pos: 'ST', x: 50, y: 17 },
    { pos: 'RW', x: 82, y: 22 },
  ],
  '4-2-3-1': [
    { pos: 'GK', x: 50, y: 90 },
    { pos: 'LB', x: 16, y: 73 },
    { pos: 'CB', x: 38, y: 75 },
    { pos: 'CB', x: 62, y: 75 },
    { pos: 'RB', x: 84, y: 73 },
    { pos: 'CDM', x: 36, y: 56 },
    { pos: 'CDM', x: 64, y: 56 },
    { pos: 'LM', x: 18, y: 36 },
    { pos: 'CAM', x: 50, y: 38 },
    { pos: 'RM', x: 82, y: 36 },
    { pos: 'ST', x: 50, y: 16 },
  ],
  '4-4-2': [
    { pos: 'GK', x: 50, y: 90 },
    { pos: 'LB', x: 16, y: 73 },
    { pos: 'CB', x: 38, y: 75 },
    { pos: 'CB', x: 62, y: 75 },
    { pos: 'RB', x: 84, y: 73 },
    { pos: 'LM', x: 16, y: 47 },
    { pos: 'CM', x: 38, y: 49 },
    { pos: 'CM', x: 62, y: 49 },
    { pos: 'RM', x: 84, y: 47 },
    { pos: 'ST', x: 37, y: 19 },
    { pos: 'ST', x: 63, y: 19 },
  ],
  '3-5-2': [
    { pos: 'GK', x: 50, y: 90 },
    { pos: 'CB', x: 26, y: 74 },
    { pos: 'CB', x: 50, y: 76 },
    { pos: 'CB', x: 74, y: 74 },
    { pos: 'LM', x: 14, y: 46 },
    { pos: 'CDM', x: 36, y: 55 },
    { pos: 'CAM', x: 50, y: 38 },
    { pos: 'CDM', x: 64, y: 55 },
    { pos: 'RM', x: 86, y: 46 },
    { pos: 'ST', x: 37, y: 18 },
    { pos: 'ST', x: 63, y: 18 },
  ],
  '4-1-2-1-2': [
    { pos: 'GK', x: 50, y: 90 },
    { pos: 'LB', x: 16, y: 73 },
    { pos: 'CB', x: 38, y: 75 },
    { pos: 'CB', x: 62, y: 75 },
    { pos: 'RB', x: 84, y: 73 },
    { pos: 'CDM', x: 50, y: 58 },
    { pos: 'CM', x: 28, y: 45 },
    { pos: 'CM', x: 72, y: 45 },
    { pos: 'CAM', x: 50, y: 33 },
    { pos: 'ST', x: 37, y: 17 },
    { pos: 'ST', x: 63, y: 17 },
  ],
  '3-4-3': [
    { pos: 'GK', x: 50, y: 90 },
    { pos: 'CB', x: 26, y: 74 },
    { pos: 'CB', x: 50, y: 76 },
    { pos: 'CB', x: 74, y: 74 },
    { pos: 'LM', x: 15, y: 48 },
    { pos: 'CM', x: 38, y: 50 },
    { pos: 'CM', x: 62, y: 50 },
    { pos: 'RM', x: 85, y: 48 },
    { pos: 'LW', x: 20, y: 22 },
    { pos: 'ST', x: 50, y: 17 },
    { pos: 'RW', x: 80, y: 22 },
  ],
  '5-3-2': [
    { pos: 'GK', x: 50, y: 90 },
    { pos: 'LB', x: 13, y: 69 },
    { pos: 'CB', x: 31, y: 74 },
    { pos: 'CB', x: 50, y: 76 },
    { pos: 'CB', x: 69, y: 74 },
    { pos: 'RB', x: 87, y: 69 },
    { pos: 'CM', x: 28, y: 48 },
    { pos: 'CDM', x: 50, y: 52 },
    { pos: 'CM', x: 72, y: 48 },
    { pos: 'ST', x: 37, y: 19 },
    { pos: 'ST', x: 63, y: 19 },
  ],
}

function AdminJerseyIcon({
  number,
  isGK,
  active,
  unassigned,
}: {
  number: number | string
  isGK?: boolean
  active?: boolean
  unassigned?: boolean
}) {
  const fill = unassigned ? '#182128' : isGK ? '#f59e0b' : '#11161d'
  const stroke = active ? '#ffffff' : isGK ? '#fde68a' : '#c8ff3d'
  const textFill = unassigned ? '#7f8c96' : isGK ? '#0c0f14' : '#c8ff3d'

  return (
    <svg
      viewBox="0 0 48 44"
      className="adm-pitch-jersey"
      style={{
        filter: active
          ? 'drop-shadow(0 0 10px rgba(200,255,61,0.75))'
          : 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))',
      }}
      aria-hidden
    >
      <path
        d="M15 4 L3 11 L8 21 L14 18 L14 40 L34 40 L34 18 L40 21 L45 11 L33 4 L29 4 C28 7.5 20 7.5 19 4 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeDasharray={unassigned ? '3 2' : undefined}
      />
      <path
        d="M19 4 C20 8.5 28 8.5 29 4"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <text
        x="24"
        y="27.5"
        textAnchor="middle"
        fill={textFill}
        fontSize="13.5"
        fontWeight="900"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      >
        {number}
      </text>
    </svg>
  )
}

function SearchableManagerPicker({
  users,
  value,
  onChange,
  currentClubSlug,
}: {
  users: AdminUser[]
  value: string
  onChange: (userId: string) => void
  currentClubSlug?: string | null
}) {
  const [query, setQuery] = useState('')
  const selectedUser = users.find((u) => String(u.id) === value) ?? null

  const filtered = users.filter((u) => {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return (
      u.email.toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q) ||
      (u.gamertag ?? '').toLowerCase().includes(q) ||
      (u.club_name ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="adm-manager-picker">
      <div className="adm-manager-picker-top">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search manager by name, gamertag, or email…"
          className="adm-input adm-input-sm"
        />
        {selectedUser && (
          <button
            type="button"
            className="adm-btn adm-btn-ghost adm-btn-sm"
            onClick={() => onChange('')}
          >
            Clear Manager
          </button>
        )}
      </div>

      {selectedUser ? (
        <div className="adm-manager-selected-pill">
          <span>
            Assigned: <strong>{selectedUser.display_name || selectedUser.email}</strong> (
            {selectedUser.email}) [{selectedUser.role}]
          </span>
        </div>
      ) : (
        <div className="adm-manager-selected-pill is-empty">
          <span>No manager currently selected</span>
        </div>
      )}

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="adm-select"
        size={query.trim() ? Math.min(6, Math.max(2, filtered.length + 1)) : 1}
      >
        <option value="">— No Manager Assigned —</option>
        {filtered.map((u) => (
          <option key={u.id} value={String(u.id)}>
            {u.display_name ? `${u.display_name} (${u.email})` : u.email}
            {u.gamertag ? ` · 🎮 ${u.gamertag}` : ''} [{u.role}]
            {u.club_name && u.club_slug !== currentClubSlug ? ` — manages ${u.club_name}` : ''}
          </option>
        ))}
      </select>
      {query.trim() && (
        <small className="adm-text-muted">
          Showing {filtered.length} matching account{filtered.length === 1 ? '' : 's'}
        </small>
      )}


    </div>
  )
}

type ClubFilter = 'all' | 'pending' | 'active' | 'unassigned' | 'withdrawn' | 'featured'

export function ClubsView({
  guard,
  report,
  initialSub,
  onPendingCountChange,
}: {
  guard: Guard
  report: Report
  initialSub?: string
  onPendingCountChange: (count: number) => void
}) {
  const [clubs, setClubs] = useState<Club[]>([])
  const [pendingClubs, setPendingClubs] = useState<PendingClub[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [regions, setRegions] = useState<HomepageRegion[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const hasLoadedRef = useRef(false)

  const [filter, setFilter] = useState<ClubFilter>(() => {
    if (initialSub === 'pending') return 'pending'
    if (initialSub === 'unassigned') return 'unassigned'
    return 'all'
  })
  const [search, setSearch] = useState('')
  const [divisionFilter, setDivisionFilter] = useState<string>('all')
  const [regionFilter, setRegionFilter] = useState<string>('all')

  // Pagination state
  const [pendingPage, setPendingPage] = useState(1)
  const pendingPageSize = 5
  const [clubPage, setClubPage] = useState(1)
  const clubPageSize = 15

  // Bulk selection (Clubs table)
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [bulkDivisionId, setBulkDivisionId] = useState<string>('')
  const [bulkStatus, setBulkStatus] = useState<string>('')
  const [bulkFlag, setBulkFlag] = useState<string>('')
  const [bulkBusy, setBulkBusy] = useState(false)

  // Bulk selection (Pending Club Applications)
  const [selectedPendingSlugs, setSelectedPendingSlugs] = useState<Set<string>>(new Set())
  const [pendingBulkDivisionId, setPendingBulkDivisionId] = useState<string>('')
  const [pendingBulkBusy, setPendingBulkBusy] = useState(false)

  // Create Club modal
  const [createOpen, setCreateOpen] = useState(initialSub === 'create')
  const [bulkWizardOpen, setBulkWizardOpen] = useState(false)
  const [newClubName, setNewClubName] = useState('')
  const [newClubCode, setNewClubCode] = useState('')
  const [newClubFlag, setNewClubFlag] = useState('')
  const [newClubDivision, setNewClubDivision] = useState('')
  const [newClubStatus, setNewClubStatus] = useState<'active' | 'pending' | 'withdrawn'>('active')
  const [newClubManagerId, setNewClubManagerId] = useState<string>('')
  const [newClubLogo, setNewClubLogo] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const createLogoRef = useRef<HTMLInputElement | null>(null)

  // Slide-over Side Drawer for Club Details + Crest Upload + Manager Assignment + Squad Roster
  const [drawerClubSlug, setDrawerClubSlug] = useState<string | null>(null)
  const currentClub = clubs.find((c) => c.slug === drawerClubSlug)
  const [drawerDetail, setDrawerDetail] = useState<ClubDetailResponse | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editFlag, setEditFlag] = useState('')
  const [editStatus, setEditStatus] = useState('active')
  const [editDivisionId, setEditDivisionId] = useState<string>('')
  const [editManagerUserId, setEditManagerUserId] = useState<string>('')
  const [editLogo, setEditLogo] = useState<string | null>(null)
  const [editEaClubId, setEditEaClubId] = useState<string>('')
  const [editEaClubName, setEditEaClubName] = useState<string>('')
  const [eaSearchOpen, setEaSearchOpen] = useState(false)
  const [eaSearchQuery, setEaSearchQuery] = useState('')
  const [eaSearchResults, setEaSearchResults] = useState<EaClubSearchResult[]>([])
  const [eaSearching, setEaSearching] = useState(false)
  const [drawerBusy, setDrawerBusy] = useState(false)
  const [newPlayerTag, setNewPlayerTag] = useState('')
  const drawerLogoRef = useRef<HTMLInputElement | null>(null)

  // Starting XI / Squad Modal (Dedicated centered popup modal like before)
  const [squadModalClub, setSquadModalClub] = useState<Club | null>(null)
  const [squadModalDetail, setSquadModalDetail] = useState<ClubDetailResponse | null>(null)
  const [squadModalLoading, setSquadModalLoading] = useState(false)
  const [squadModalBusy, setSquadModalBusy] = useState(false)
  const [squadModalNewTag, setSquadModalNewTag] = useState('')
  const [squadModalNewShirt, setSquadModalNewShirt] = useState('')
  const [xiFormation, setXiFormation] = useState<string>('4-3-3')
  const [xiStarters, setXiStarters] = useState<Array<ClubLineupSlot | null>>(Array(11).fill(null))
  const [xiBench, setXiBench] = useState<ClubLineupBench[]>([])
  const [xiActiveSlot, setXiActiveSlot] = useState<number | null>(null)
  const [xiPopoverSearch, setXiPopoverSearch] = useState('')

  const syncLineupFromDetail = useCallback((detail: ClubDetailResponse | null) => {
    const saved = detail?.starting_xi
    const fmt = saved?.formation && ADMIN_FORMATIONS[saved.formation] ? saved.formation : '4-3-3'
    const coords = ADMIN_FORMATIONS[fmt]
    const players = detail?.players ?? []
    setXiFormation(fmt)
    setXiStarters(
      coords.map((c, idx) => {
        const s = saved?.starters?.[idx] as any
        if (s && s.gamertag) {
          const matched = players.find(
            (p) =>
              (s.playerId && p.id === s.playerId) ||
              p.gamertag.toLowerCase() === s.gamertag.toLowerCase(),
          )
          return {
            position: c.pos,
            playerId: s.playerId ?? matched?.id ?? null,
            gamertag: s.gamertag,
            shirtNumber: matched?.shirt_number ?? s.shirtNumber ?? s.number ?? idx + 1,
          }
        }
        return null
      }),
    )
    setXiBench(
      Array.isArray(saved?.bench)
        ? saved.bench.map((b: any, idx: number) => {
            const matched = players.find(
              (p) =>
                (b.playerId && p.id === b.playerId) ||
                p.gamertag.toLowerCase() === b.gamertag.toLowerCase(),
            )
            return {
              playerId: b.playerId ?? matched?.id ?? null,
              gamertag: b.gamertag,
              shirtNumber: matched?.shirt_number ?? b.shirtNumber ?? b.number ?? 12 + idx,
              position: b.position || b.role || 'SUB',
            }
          })
        : [],
    )
  }, [])

  useEffect(() => {
    if (initialSub === 'pending') setFilter('pending')
    else if (initialSub === 'unassigned') setFilter('unassigned')
    else if (initialSub === 'create') setCreateOpen(true)
  }, [initialSub])

  const loadData = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true)
    try {
      const [clubsList, pendingList, divsList, regionsList, usersList] = await Promise.all([
        guard(() => getAdminClubs(), 'Could not load clubs'),
        guard(getPendingClubs, 'Could not load pending applications'),
        guard(() => getDivisions(), 'Could not load divisions'),
        guard(getAdminRegions, 'Could not load regions'),
        guard(getAdminUsers, 'Could not load user accounts'),
      ])
      setClubs(clubsList)
      setPendingClubs(pendingList)
      onPendingCountChange(pendingList.length)
      setDivisions(divsList)
      setRegions(regionsList)
      setUsers(usersList)
      hasLoadedRef.current = true
    } catch {
      /* reported */
    } finally {
      setLoading(false)
    }
  }, [guard, onPendingCountChange])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openClubDrawer = useCallback(
    async (club: Club) => {
      setDrawerClubSlug(club.slug)
      setEditName(club.name)
      setEditCode(club.short_code ?? '')
      setEditFlag(club.flag ?? '')
      setEditStatus(club.status)
      setEditDivisionId(club.division_id != null ? String(club.division_id) : '')
      setEditManagerUserId(club.manager_user_id != null ? String(club.manager_user_id) : '')
      setEditLogo(club.logo_local || club.logo_url || null)
      setEditEaClubId(club.ea_club_id ?? '')
      setEditEaClubName(club.ea_club_name ?? '')
      setEaSearchOpen(false)
      setEaSearchQuery(club.name)
      setEaSearchResults([])
      setDrawerLoading(true)
      try {
        const detail = await guard(() => getClubDetail(club.slug), 'Could not load club details')
        setDrawerDetail(detail)
      } catch {
        setDrawerDetail(null)
      } finally {
        setDrawerLoading(false)
      }
    },
    [guard],
  )

  const closeDrawer = () => {
    setDrawerClubSlug(null)
    setDrawerDetail(null)
    setNewPlayerTag('')
  }

  const openSquadModal = useCallback(
    async (club: Club) => {
      setSquadModalClub(club)
      setSquadModalNewTag('')
      setSquadModalNewShirt('')
      setXiActiveSlot(null)
      setXiPopoverSearch('')
      setSquadModalLoading(true)
      try {
        invalidateAdminCache()
        const detail = await guard(
          () => getClubDetail(club.slug),
          `Could not load ${club.name}'s squad`,
        )
        setSquadModalDetail(detail)
        syncLineupFromDetail(detail)
      } catch {
        setSquadModalDetail(null)
      } finally {
        setSquadModalLoading(false)
      }
    },
    [guard, syncLineupFromDetail],
  )

  const closeSquadModal = () => {
    setSquadModalClub(null)
    setSquadModalDetail(null)
    setSquadModalNewTag('')
    setSquadModalNewShirt('')
    setXiActiveSlot(null)
    setXiPopoverSearch('')
  }

  const regionChoices =
    regions.length > 0
      ? regions.map((r) => ({ flag: r.flag, name: r.name }))
      : DEFAULT_REGIONS.map((r) => ({ flag: r.flag, name: r.name }))

  const activeDivisions = divisions.filter((d) => Boolean(d.is_active))
  const divisionById = new Map(divisions.map((d) => [d.id, d]))
  const pendingBySlug = new Map(pendingClubs.map((p) => [p.slug, p]))

  // Inline Division Change
  const handleInlineDivision = async (club: Club, nextDivValue: string) => {
    const nextId = nextDivValue === '' ? null : Number(nextDivValue)
    try {
      await guard(
        () => assignDivision(club.slug, nextId),
        `Could not update division for ${club.name}`,
      )
      report(
        'ok',
        nextId === null
          ? `${club.name} unassigned from division.`
          : `${club.name} moved to ${divisionById.get(nextId)?.name ?? 'division'}.`,
      )
      await loadData()
    } catch {
      /* reported */
    }
  }

  // Inline Homepage Featured Toggle
  const handleToggleFeatured = async (club: Club) => {
    const currentlyFeatured = clubs
      .filter((c) => Boolean(c.is_featured))
      .map((c) => c.slug)
    const isNowFeatured = !Boolean(club.is_featured)
    const nextSlugs = isNowFeatured
      ? [...new Set([...currentlyFeatured, club.slug])]
      : currentlyFeatured.filter((s) => s !== club.slug)
    try {
      await guard(() => setFeaturedClubs(nextSlugs), 'Could not update homepage featured clubs')
      report(
        'ok',
        isNowFeatured
          ? `${club.name} added to Homepage Featured Crest Wall.`
          : `${club.name} removed from Homepage Featured Crest Wall.`,
      )
      await loadData()
    } catch {
      /* reported */
    }
  }

  // Pending club approve/reject
  const handleDecision = async (slug: string, name: string, decision: 'approve' | 'reject') => {
    try {
      await guard(() => decideClub(slug, decision), `Could not ${decision} ${name}`)
      report(
        'ok',
        decision === 'approve'
          ? `${name} approved! You can now assign it to a division.`
          : `${name} application rejected.`,
      )
      setSelectedPendingSlugs((prev) => {
        const next = new Set(prev)
        next.delete(slug)
        return next
      })
      await loadData()
      if (drawerClubSlug === slug) closeDrawer()
    } catch {
      /* reported */
    }
  }

  // Bulk Pending Applications Approve / Reject / Delete
  const handleBulkPendingDecision = async (decision: 'approve' | 'reject') => {
    if (selectedPendingSlugs.size === 0) return
    const slugs = [...selectedPendingSlugs]
    if (
      decision === 'reject' &&
      !window.confirm(`Reject ${slugs.length} selected club application(s)?`)
    ) {
      return
    }
    setPendingBulkBusy(true)
    try {
      for (const slug of slugs) {
        await decideClub(slug, decision)
        if (decision === 'approve' && pendingBulkDivisionId) {
          await assignDivision(slug, Number(pendingBulkDivisionId))
        }
      }
      report(
        'ok',
        decision === 'approve'
          ? `Approved ${slugs.length} club application(s)${
              pendingBulkDivisionId
                ? ` and assigned to ${divisionById.get(Number(pendingBulkDivisionId))?.name ?? 'division'}`
                : ''
            }.`
          : `Rejected ${slugs.length} club application(s).`,
      )
      setSelectedPendingSlugs(new Set())
      setPendingBulkDivisionId('')
      await loadData()
    } catch (err) {
      report('error', err instanceof Error ? err.message : `Bulk ${decision} failed.`)
    } finally {
      setPendingBulkBusy(false)
    }
  }

  const handleBulkPendingDelete = async () => {
    if (selectedPendingSlugs.size === 0) return
    const slugs = [...selectedPendingSlugs]
    if (
      !window.confirm(
        `Permanently delete ${slugs.length} selected pending application(s)?`,
      )
    ) {
      return
    }
    setPendingBulkBusy(true)
    try {
      for (const slug of slugs) {
        await deleteAdminClub(slug)
      }
      report('ok', `Deleted ${slugs.length} pending application(s).`)
      setSelectedPendingSlugs(new Set())
      await loadData()
    } catch (err) {
      report('error', err instanceof Error ? err.message : 'Bulk delete failed.')
    } finally {
      setPendingBulkBusy(false)
    }
  }

  // Create Club Submit
  const handleCreateClub = async (e: FormEvent) => {
    e.preventDefault()
    if (!newClubName.trim()) return
    setCreateBusy(true)
    try {
      const created = await guard(
        () =>
          createAdminClub({
            name: newClubName.trim(),
            shortCode: newClubCode.trim().toUpperCase() || null,
            flag: newClubFlag || null,
            logoLocal: newClubLogo,
            logoUrl: newClubLogo,
            status: newClubStatus,
            divisionId: newClubDivision ? Number(newClubDivision) : null,
          }),
        'Could not create club',
      )
      if (newClubManagerId) {
        await guard(
          () => assignClubManager(created.slug, Number(newClubManagerId)),
          'Could not assign manager to new club',
        )
      }
      report('ok', `Created club ${created.name}.`)
      setNewClubName('')
      setNewClubCode('')
      setNewClubFlag('')
      setNewClubDivision('')
      setNewClubStatus('active')
      setNewClubManagerId('')
      setNewClubLogo(null)
      setCreateOpen(false)
      await loadData()
    } catch {
      /* reported */
    } finally {
      setCreateBusy(false)
    }
  }

  const handleEaSearch = async () => {
    const q = eaSearchQuery.trim() || editName.trim()
    if (!q || q.length < 2) {
      report('error', 'Type at least 2 characters to search EA clubs.')
      return
    }
    setEaSearching(true)
    try {
      const results = await guard(() => searchEaClubs(q), 'Failed to search EA clubs')
      setEaSearchResults(results)
      if (results.length === 0) {
        report('ok', `No EA Pro Clubs found matching "${q}".`)
      }
    } catch {
      /* reported */
    } finally {
      setEaSearching(false)
    }
  }

  // Save Club in Drawer
  const handleSaveDrawerClub = async (e: FormEvent) => {
    e.preventDefault()
    if (!drawerClubSlug) return
    if (!currentClub) return

    setDrawerBusy(true)
    try {
      const prevLogo = currentClub.logo_local || currentClub.logo_url || null
      const logoChanged = editLogo !== prevLogo
      await guard(
        () =>
          updateClub(drawerClubSlug, {
            name: editName.trim(),
            shortCode: editCode.trim().toUpperCase() || null,
            flag: editFlag || null,
            status: editStatus,
            eaClubId: editEaClubId.trim() || null,
            eaClubName: editEaClubName.trim() || null,
            ...(logoChanged ? { logoLocal: editLogo, logoUrl: editLogo } : {}),
          }),
        'Could not save club details',
      )
      const currentDivStr = currentClub.division_id != null ? String(currentClub.division_id) : ''
      if (editDivisionId !== currentDivStr) {
        await guard(
          () =>
            assignDivision(drawerClubSlug, editDivisionId === '' ? null : Number(editDivisionId)),
          'Could not assign division',
        )
      }
      const currentMgrStr =
        currentClub.manager_user_id != null ? String(currentClub.manager_user_id) : ''
      if (editManagerUserId !== currentMgrStr) {
        await guard(
          () =>
            assignClubManager(
              drawerClubSlug,
              editManagerUserId === '' ? null : Number(editManagerUserId),
            ),
          'Could not update assigned manager',
        )
      }
      report('ok', `Saved changes to ${editName.trim()}.`)
      await loadData()
    } catch {
      /* reported */
    } finally {
      setDrawerBusy(false)
    }
  }

  // Add/Remove Player in Drawer
  const handleAddPlayer = async (e: FormEvent) => {
    e.preventDefault()
    if (!drawerClubSlug || !newPlayerTag.trim()) return
    setDrawerBusy(true)
    try {
      await guard(
        () => addPlayer(drawerClubSlug, newPlayerTag.trim()),
        'Could not add player to squad',
      )
      report('ok', `Added ${newPlayerTag.trim()} to squad.`)
      setNewPlayerTag('')
      const detail = await getClubDetail(drawerClubSlug)
      setDrawerDetail(detail)
      await loadData()
    } catch {
      /* reported */
    } finally {
      setDrawerBusy(false)
    }
  }

  const handleRemovePlayer = async (gamertag: string) => {
    if (!drawerClubSlug) return
    setDrawerBusy(true)
    try {
      await guard(
        () => removePlayer(drawerClubSlug, gamertag),
        'Could not remove player from squad',
      )
      report('ok', `Released ${gamertag} from squad.`)
      const detail = await getClubDetail(drawerClubSlug)
      setDrawerDetail(detail)
      await loadData()
    } catch {
      /* reported */
    } finally {
      setDrawerBusy(false)
    }
  }

  // Assign or Auto-Swap a player into a Starting XI pitch position
  const assignOrSwapPitchSlot = (
    targetIdx: number,
    player: { id: number | null; gamertag: string; shirt_number: number | null },
  ) => {
    const coords = ADMIN_FORMATIONS[xiFormation] || ADMIN_FORMATIONS['4-3-3']
    const targetCoord = coords[targetIdx]
    if (!targetCoord) return

    setXiStarters((prev) => {
      const next = [...prev]
      const currentInTarget = next[targetIdx]
      const existingIdx = next.findIndex(
        (s, i) => i !== targetIdx && s && s.gamertag.toLowerCase() === player.gamertag.toLowerCase(),
      )

      if (existingIdx !== -1) {
        // Auto-swap between the two pitch positions
        const existingSlot = next[existingIdx]!
        const existingCoord = coords[existingIdx]
        next[targetIdx] = {
          position: targetCoord.pos,
          playerId: player.id ?? existingSlot.playerId ?? null,
          gamertag: player.gamertag,
          shirtNumber: player.shirt_number ?? existingSlot.shirtNumber ?? targetIdx + 1,
        }
        next[existingIdx] = currentInTarget
          ? {
              ...currentInTarget,
              position: existingCoord?.pos ?? currentInTarget.position,
            }
          : null
      } else {
        next[targetIdx] = {
          position: targetCoord.pos,
          playerId: player.id,
          gamertag: player.gamertag,
          shirtNumber: player.shirt_number ?? currentInTarget?.shirtNumber ?? targetIdx + 1,
        }
      }
      return next
    })

    // If the picked player was on the bench, remove them from bench
    setXiBench((prev) =>
      prev.filter((b) => b.gamertag.toLowerCase() !== player.gamertag.toLowerCase()),
    )

    setXiActiveSlot(null)
    setXiPopoverSearch('')
  }

  // Sign a brand new player right from the pitch floating dropdown and assign them to the slot
  const handleQuickSignAndAssign = async (targetIdx: number, rawGamertag: string) => {
    const tag = rawGamertag.trim()
    if (!squadModalClub || !tag) return
    const coords = ADMIN_FORMATIONS[xiFormation] || ADMIN_FORMATIONS['4-3-3']
    const targetCoord = coords[targetIdx]
    const defaultShirt = xiStarters[targetIdx]?.shirtNumber ?? targetIdx + 1
    setSquadModalBusy(true)
    try {
      await guard(
        () => addPlayer(squadModalClub.slug, tag, defaultShirt),
        'Could not sign and assign player',
      )
      const detail = await getClubDetail(squadModalClub.slug)
      setSquadModalDetail(detail)
      const signedPlayer = detail.players.find(
        (p) => p.gamertag.toLowerCase() === tag.toLowerCase(),
      )
      assignOrSwapPitchSlot(targetIdx, {
        id: signedPlayer?.id ?? null,
        gamertag: signedPlayer?.gamertag ?? tag,
        shirt_number: signedPlayer?.shirt_number ?? defaultShirt,
      })
      report(
        'ok',
        `Signed ${tag} to ${squadModalClub.name} and assigned as ${targetCoord?.pos ?? 'Starter'}!`,
      )
      await loadData()
    } catch {
      /* reported */
    } finally {
      setSquadModalBusy(false)
    }
  }

  // Add/Remove Player in Starting XI / Squad Modal
  const handleSquadModalAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (!squadModalClub || !squadModalNewTag.trim()) return
    setSquadModalBusy(true)
    try {
      const shirtNum = squadModalNewShirt.trim() ? Number(squadModalNewShirt.trim()) : null
      await guard(
        () => addPlayer(squadModalClub.slug, squadModalNewTag.trim(), shirtNum),
        'Could not add player to squad',
      )
      report('ok', `Added ${squadModalNewTag.trim()} to ${squadModalClub.name}.`)
      setSquadModalNewTag('')
      setSquadModalNewShirt('')
      const detail = await getClubDetail(squadModalClub.slug)
      setSquadModalDetail(detail)
      await loadData()
    } catch {
      /* reported */
    } finally {
      setSquadModalBusy(false)
    }
  }

  const handleSquadModalRemove = async (gamertag: string) => {
    if (!squadModalClub) return
    setSquadModalBusy(true)
    try {
      await guard(
        () => removePlayer(squadModalClub.slug, gamertag),
        'Could not release player from squad',
      )
      report('ok', `Released ${gamertag} from ${squadModalClub.name}.`)
      setXiStarters((prev) =>
        prev.map((slot) =>
          slot && slot.gamertag.toLowerCase() === gamertag.toLowerCase() ? null : slot,
        ),
      )
      setXiBench((prev) =>
        prev.filter((b) => b.gamertag.toLowerCase() !== gamertag.toLowerCase()),
      )
      const detail = await getClubDetail(squadModalClub.slug)
      setSquadModalDetail(detail)
      await loadData()
    } catch {
      /* reported */
    } finally {
      setSquadModalBusy(false)
    }
  }

  const handleSaveStartingXi = async () => {
    if (!squadModalClub) return
    setSquadModalBusy(true)
    try {
      await guard(
        () =>
          saveClubLineup(squadModalClub.slug, {
            formation: xiFormation,
            starters: xiStarters,
            bench: xiBench,
          }),
        `Could not save Starting XI for ${squadModalClub.name}`,
      )
      report(
        'ok',
        `Saved Starting XI (${xiFormation}) for ${squadModalClub.name}! It is now live on the main website.`,
      )
      const detail = await getClubDetail(squadModalClub.slug)
      setSquadModalDetail(detail)
      syncLineupFromDetail(detail)
      await loadData()
    } catch {
      /* reported */
    } finally {
      setSquadModalBusy(false)
    }
  }

  const handleDeleteClub = async () => {
    if (!drawerClubSlug) return
    if (
      !window.confirm(
        `Delete ${currentClub?.name ?? drawerClubSlug} permanently? This removes its fixtures and standings rows and releases its players to free agency.`,
      )
    ) {
      return
    }
    setDrawerBusy(true)
    try {
      await guard(() => deleteAdminClub(drawerClubSlug), 'Could not delete club')
      report('ok', `Deleted ${currentClub?.name ?? drawerClubSlug}.`)
      closeDrawer()
      await loadData()
    } catch {
      /* reported */
    } finally {
      setDrawerBusy(false)
    }
  }

  // Bulk Apply
  const handleBulkApply = async () => {
    if (selectedSlugs.size === 0) return
    setBulkBusy(true)
    try {
      const slugs = [...selectedSlugs]
      for (const slug of slugs) {
        if (bulkStatus || bulkFlag) {
          await updateClub(slug, {
            ...(bulkStatus ? { status: bulkStatus } : {}),
            ...(bulkFlag ? { flag: bulkFlag === '__clear__' ? null : bulkFlag } : {}),
          })
        }
        if (bulkDivisionId) {
          await assignDivision(
            slug,
            bulkDivisionId === '__unassign__' ? null : Number(bulkDivisionId),
          )
        }
      }
      report('ok', `Updated ${slugs.length} selected club${slugs.length === 1 ? '' : 's'}.`)
      setSelectedSlugs(new Set())
      setBulkDivisionId('')
      setBulkStatus('')
      setBulkFlag('')
      await loadData()
    } catch (err) {
      report('error', err instanceof Error ? err.message : 'Bulk update failed.')
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedSlugs.size === 0) return
    if (
      !window.confirm(
        `Delete ${selectedSlugs.size} selected club(s) permanently? Their fixtures will be removed and players released.`,
      )
    ) {
      return
    }
    setBulkBusy(true)
    try {
      const slugs = [...selectedSlugs]
      for (const slug of slugs) {
        await deleteAdminClub(slug)
      }
      report('ok', `Deleted ${slugs.length} club(s).`)
      setSelectedSlugs(new Set())
      await loadData()
    } catch (err) {
      report('error', err instanceof Error ? err.message : 'Bulk delete failed.')
    } finally {
      setBulkBusy(false)
    }
  }

  // Filtered clubs
  const filteredClubs = clubs.filter((club) => {
    if (filter === 'pending' && club.status !== 'pending') return false
    if (filter === 'active' && club.status !== 'active') return false
    if (filter === 'unassigned' && (club.status !== 'active' || club.division_id !== null))
      return false
    if (filter === 'withdrawn' && club.status !== 'withdrawn') return false
    if (filter === 'featured' && !Boolean(club.is_featured)) return false

    if (divisionFilter === 'unassigned' && club.division_id !== null) return false
    if (
      divisionFilter !== 'all' &&
      divisionFilter !== 'unassigned' &&
      String(club.division_id) !== divisionFilter
    ) {
      return false
    }

    if (regionFilter === 'unassigned' && club.flag) return false
    if (
      regionFilter !== 'all' &&
      regionFilter !== 'unassigned' &&
      !isSameCountry(club.flag, regionFilter)
    ) {
      return false
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const matchName = club.name.toLowerCase().includes(q)
      const matchCode = (club.short_code ?? '').toLowerCase().includes(q)
      const matchSlug = club.slug.toLowerCase().includes(q)
      const matchMgr = (club.manager_email ?? '').toLowerCase().includes(q) || (club.manager_name ?? '').toLowerCase().includes(q)
      if (!matchName && !matchCode && !matchSlug && !matchMgr) return false
    }
    return true
  })

  // Reset clubPage when filters change
  useEffect(() => {
    setClubPage(1)
  }, [filter, divisionFilter, regionFilter, search])

  const totalClubPages = Math.max(1, Math.ceil(filteredClubs.length / clubPageSize))
  const safeClubPage = Math.min(clubPage, totalClubPages)
  const pagedClubs = filteredClubs.slice(
    (safeClubPage - 1) * clubPageSize,
    safeClubPage * clubPageSize,
  )

  const totalPendingPages = Math.max(1, Math.ceil(pendingClubs.length / pendingPageSize))
  const safePendingPage = Math.min(pendingPage, totalPendingPages)
  const pagedPendingClubs = pendingClubs.slice(
    (safePendingPage - 1) * pendingPageSize,
    safePendingPage * pendingPageSize,
  )

  const allPendingPageSelected =
    pagedPendingClubs.length > 0 &&
    pagedPendingClubs.every((p) => selectedPendingSlugs.has(p.slug))

  const toggleSelectPendingPage = () => {
    setSelectedPendingSlugs((prev) => {
      const next = new Set(prev)
      if (allPendingPageSelected) {
        for (const p of pagedPendingClubs) next.delete(p.slug)
      } else {
        for (const p of pagedPendingClubs) next.add(p.slug)
      }
      return next
    })
  }

  const toggleSelectPendingOne = (slug: string) => {
    setSelectedPendingSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  const allPageSelected =
    pagedClubs.length > 0 && pagedClubs.every((c) => selectedSlugs.has(c.slug))

  const toggleSelectPage = () => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const c of pagedClubs) next.delete(c.slug)
      } else {
        for (const c of pagedClubs) next.add(c.slug)
      }
      return next
    })
  }

  const toggleSelectOne = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <div className="adm-stack">
      {/* Pending Manager Applications Banner when any exist (Paginated + Bulk Actions) */}
      {pendingClubs.length > 0 && (
        <section className="adm-card adm-card-accent">
          <div className="adm-card-head">
            <div>
              <span className="adm-eyebrow">NEW MANAGER REGISTRATIONS</span>
              <h2>Pending Club Applications ({pendingClubs.length})</h2>
            </div>
            <div className="adm-row-actions">
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--adm-text-muted)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={allPendingPageSelected}
                  onChange={toggleSelectPendingPage}
                />
                Select Page ({pagedPendingClubs.length})
              </label>
              {pendingClubs.length > pagedPendingClubs.length && (
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost adm-btn-sm"
                  onClick={() => {
                    if (selectedPendingSlugs.size === pendingClubs.length) {
                      setSelectedPendingSlugs(new Set())
                    } else {
                      setSelectedPendingSlugs(new Set(pendingClubs.map((p) => p.slug)))
                    }
                  }}
                >
                  {selectedPendingSlugs.size === pendingClubs.length
                    ? 'Deselect All'
                    : `Select All (${pendingClubs.length})`}
                </button>
              )}
              {totalPendingPages > 1 && (
                <span className="adm-text-muted">
                  Page {safePendingPage} of {totalPendingPages}
                </span>
              )}
            </div>
          </div>
          <div className="adm-list">
            {pagedPendingClubs.map((p) => {
              const logo = p.logo_local || p.logo_url
              const fullClub = clubs.find((c) => c.slug === p.slug)
              const isSelected = selectedPendingSlugs.has(p.slug)
              return (
                <div
                  key={`${p.id}-${p.user_id ?? 'none'}`}
                  className={`adm-list-row ${isSelected ? 'is-selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectPendingOne(p.slug)}
                    aria-label={`Select application ${p.name}`}
                  />
                  <div className="adm-club-visual">
                    {logo ? (
                      <img src={logo} alt={p.name} className="adm-crest-md" />
                    ) : (
                      <div className="adm-crest-placeholder">
                        {(p.short_code || p.name).slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="adm-list-main">
                    <div className="adm-club-cell-info">
                      <div className="adm-row-title">
                        <strong>{p.name}</strong>
                        {p.short_code && <span className="adm-code-pill">{p.short_code}</span>}
                        {p.flag && <span>{p.flag}</span>}
                      </div>
                      <span className="adm-club-manager-sub">
                        Manager: <strong>{p.display_name || 'Manager'}</strong> (
                        {p.email || 'no email'}) · {p.players} squad player
                        {p.players === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                  <div className="adm-row-actions">
                    {fullClub && (
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        onClick={() => void openClubDrawer(fullClub)}
                      >
                        Inspect / Edit
                      </button>
                    )}
                    <button
                      type="button"
                      className="adm-btn adm-btn-success adm-btn-sm"
                      onClick={() => void handleDecision(p.slug, p.name, 'approve')}
                    >
                      ✓ Approve Club
                    </button>
                    <button
                      type="button"
                      className="adm-btn adm-btn-danger adm-btn-sm"
                      onClick={() => void handleDecision(p.slug, p.name, 'reject')}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {pendingClubs.length > pendingPageSize && (
            <div className="adm-pagination">
              <span>
                Showing {(safePendingPage - 1) * pendingPageSize + 1}–
                {Math.min(safePendingPage * pendingPageSize, pendingClubs.length)} of{' '}
                {pendingClubs.length} applications
              </span>
              <div className="adm-row-actions">
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  disabled={safePendingPage <= 1}
                  onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  disabled={safePendingPage >= totalPendingPages}
                  onClick={() => setPendingPage((p) => Math.min(totalPendingPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Sticky Bulk Action Bar for Pending Applications */}
          {selectedPendingSlugs.size > 0 && (
            <div className="adm-bulk-bar">
              <strong>{selectedPendingSlugs.size} application(s) selected</strong>
              <select
                value={pendingBulkDivisionId}
                onChange={(e) => setPendingBulkDivisionId(e.target.value)}
                className="adm-select adm-select-sm"
              >
                <option value="">Optional: Assign Division on Approve…</option>
                {activeDivisions.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    Assign to {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="adm-btn adm-btn-success adm-btn-sm"
                disabled={pendingBulkBusy}
                onClick={() => void handleBulkPendingDecision('approve')}
              >
                {pendingBulkBusy ? 'Processing…' : `✓ Approve Selected (${selectedPendingSlugs.size})`}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-danger adm-btn-sm"
                disabled={pendingBulkBusy}
                onClick={() => void handleBulkPendingDecision('reject')}
              >
                ✕ Reject Selected
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-danger adm-btn-sm"
                disabled={pendingBulkBusy}
                onClick={() => void handleBulkPendingDelete()}
              >
                Delete Selected
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={() => setSelectedPendingSlugs(new Set())}
              >
                Clear
              </button>
            </div>
          )}
        </section>
      )}

      {/* Filter Pills + Toolbar */}
      <section className="adm-card">
        <div className="adm-card-head">
          <div className="adm-pill-tabs" role="tablist">
            {(
              [
                { id: 'all', label: `All Clubs (${clubs.length})` },
                { id: 'active', label: `Active (${clubs.filter((c) => c.status === 'active').length})` },
                {
                  id: 'unassigned',
                  label: `Unassigned (${clubs.filter((c) => c.status === 'active' && c.division_id === null).length})`,
                },
                { id: 'pending', label: `Pending (${clubs.filter((c) => c.status === 'pending').length})` },
                { id: 'featured', label: `★ Featured (${clubs.filter((c) => Boolean(c.is_featured)).length})` },
                { id: 'withdrawn', label: `Withdrawn (${clubs.filter((c) => c.status === 'withdrawn').length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`adm-pill-tab ${filter === tab.id ? 'is-active' : ''}`}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary"
              onClick={() => setBulkWizardOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              title="Bulk link multiple clubs to EA Sports FC Pro Clubs with live roster & box score previews"
            >

              <span>Bulk Link EA Clubs</span>
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-primary"
              onClick={() => setCreateOpen(true)}
            >
              + Add New Club
            </button>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="adm-toolbar">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search club name, code, or manager email…"
            className="adm-input adm-search-input"
          />
          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="adm-select"
            aria-label="Filter by division"
          >
            <option value="all">All Divisions</option>
            <option value="unassigned">Unassigned to Division</option>
            {divisions.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name} {!Boolean(d.is_active) ? '(Paused)' : ''}
              </option>
            ))}
          </select>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="adm-select"
            aria-label="Filter by country flag"
          >
            <option value="all">All Regions</option>
            <option value="unassigned">No Flag Assigned</option>
            {regionChoices.map((r) => (
              <option key={r.flag} value={r.flag}>
                {r.flag} {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clubs Table */}
        {loading ? (
          <div className="adm-empty">Loading clubs…</div>
        ) : filteredClubs.length === 0 ? (
          <div className="adm-empty">
            <p>No clubs match the current filters.</p>
          </div>
        ) : (
          <>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th style={{ width: 38 }}>
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectPage}
                        aria-label="Select clubs on this page"
                      />
                    </th>
                    <th>Club & Manager</th>
                    <th>Region</th>
                    <th>Division (Inline)</th>
                    <th>Status</th>
                    <th>Crest Wall</th>
                    <th>Starting XI / Squad</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedClubs.map((club) => {
                    const logo = club.logo_local || club.logo_url
                    const pendingInfo = pendingBySlug.get(club.slug)
                    const managerEmail = club.manager_email || pendingInfo?.email || null
                    const managerName = club.manager_name || pendingInfo?.display_name || null
                    return (
                      <tr key={club.id} className={selectedSlugs.has(club.slug) ? 'is-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedSlugs.has(club.slug)}
                            onChange={() => toggleSelectOne(club.slug)}
                            aria-label={`Select ${club.name}`}
                          />
                        </td>
                        <td>
                          <div
                            className="adm-club-cell"
                            onClick={() => void openClubDrawer(club)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') void openClubDrawer(club)
                            }}
                          >
                            {logo ? (
                              <img src={logo} alt={club.name} className="adm-crest-sm" />
                            ) : (
                              <div className="adm-crest-placeholder adm-crest-sm">
                                {(club.short_code || club.name).slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="adm-club-cell-info">
                              <div className="adm-row-title">
                                <strong>{club.name}</strong>
                                {club.short_code && (
                                  <span className="adm-code-pill">{club.short_code}</span>
                                )}
                                {club.ea_club_id && (
                                  <span className="adm-code-pill" style={{ border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8' }} title={`EA Club: ${club.ea_club_name || club.ea_club_id}`}>
                                    EA #{club.ea_club_id}
                                  </span>
                                )}
                              </div>
                              {managerEmail ? (
                                <small className="adm-club-manager-sub">
                                  Manager: {managerName ? `${managerName} (${managerEmail})` : managerEmail}
                                </small>
                              ) : (
                                <small className="adm-club-manager-sub" style={{ opacity: 0.6 }}>
                                  No manager assigned
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          {club.flag ? (
                            <span className="adm-flag-pill">{club.flag}</span>
                          ) : (
                            <span className="adm-text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <select
                            value={club.division_id != null ? String(club.division_id) : ''}
                            onChange={(e) => void handleInlineDivision(club, e.target.value)}
                            className="adm-select adm-select-inline"
                            aria-label={`Division for ${club.name}`}
                          >
                            <option value="">Unassigned</option>
                            {activeDivisions.map((d) => {
                              const count = clubs.filter((c) => c.status === 'active' && c.division_id === d.id).length
                              const isCurrent = club.division_id === d.id
                              const isFull = d.max_teams != null && d.max_teams > 0 && count >= d.max_teams && !isCurrent
                              return (
                                <option key={d.id} value={String(d.id)} disabled={isFull}>
                                  {d.name} ({count}{d.max_teams ? `/${d.max_teams}` : ''}){isFull ? ' - FULL' : ''}
                                </option>
                              )
                            })}
                          </select>
                        </td>
                        <td>
                          <span className={`adm-status-badge status-${club.status}`}>
                            {club.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`adm-star-btn ${Boolean(club.is_featured) ? 'is-featured' : ''}`}
                            onClick={() => void handleToggleFeatured(club)}
                            title="Toggle Homepage Featured Crest Wall"
                          >
                            {Boolean(club.is_featured) ? '★ Featured' : '☆ Feature'}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="adm-squad-btn"
                            onClick={() => void openSquadModal(club)}
                            title={`Open ${club.name} Starting XI & Squad Modal`}
                          >
                            <span>⚽ Squad / XI</span>
                            <span className="adm-code-pill">{club.players}</span>
                          </button>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="adm-row-actions" style={{ justifyContent: 'flex-end' }}>
                            {club.status === 'pending' && (
                              <button
                                type="button"
                                className="adm-btn adm-btn-success adm-btn-sm"
                                onClick={() => void handleDecision(club.slug, club.name, 'approve')}
                              >
                                Approve
                              </button>
                            )}
                            <button
                              type="button"
                              className="adm-btn adm-btn-secondary adm-btn-sm"
                              onClick={() => void openClubDrawer(club)}
                            >
                              Edit Club →
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {filteredClubs.length > clubPageSize && (
              <div className="adm-pagination">
                <span>
                  Showing {(safeClubPage - 1) * clubPageSize + 1}–
                  {Math.min(safeClubPage * clubPageSize, filteredClubs.length)} of{' '}
                  {filteredClubs.length} clubs
                  {selectedSlugs.size === 0 && filteredClubs.length > clubPageSize && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        style={{ padding: '2px 8px' }}
                        onClick={() => setSelectedSlugs(new Set(filteredClubs.map((c) => c.slug)))}
                      >
                        Select all {filteredClubs.length} filtered clubs
                      </button>
                    </>
                  )}
                </span>
                <div className="adm-row-actions">
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    disabled={safeClubPage <= 1}
                    onClick={() => setClubPage((p) => Math.max(1, p - 1))}
                  >
                    ← Previous
                  </button>
                  <span className="adm-text-muted">
                    Page {safeClubPage} of {totalClubPages}
                  </span>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    disabled={safeClubPage >= totalClubPages}
                    onClick={() => setClubPage((p) => Math.min(totalClubPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Sticky Bottom Bulk Action Bar (Always visible when scrolling down) */}
        {selectedSlugs.size > 0 && (
          <div className="adm-bulk-bar">
            <strong>{selectedSlugs.size} club(s) selected</strong>
            <select
              value={bulkDivisionId}
              onChange={(e) => setBulkDivisionId(e.target.value)}
              className="adm-select adm-select-sm"
            >
              <option value="">Move to Division…</option>
              <option value="__unassign__">— Unassign Division —</option>
              {activeDivisions.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="adm-select adm-select-sm"
            >
              <option value="">Set Status…</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
            <select
              value={bulkFlag}
              onChange={(e) => setBulkFlag(e.target.value)}
              className="adm-select adm-select-sm"
            >
              <option value="">Set Region Flag…</option>
              <option value="__clear__">— Clear Flag —</option>
              {regionChoices.map((r) => (
                <option key={r.flag} value={r.flag}>
                  {r.flag} {r.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="adm-btn adm-btn-primary adm-btn-sm"
              disabled={bulkBusy || (!bulkDivisionId && !bulkStatus && !bulkFlag)}
              onClick={() => void handleBulkApply()}
            >
              {bulkBusy ? 'Applying…' : 'Apply to Selected'}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-danger adm-btn-sm"
              disabled={bulkBusy}
              onClick={() => void handleBulkDelete()}
            >
              Delete Selected
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-ghost adm-btn-sm"
              onClick={() => setSelectedSlugs(new Set())}
            >
              Clear Selection
            </button>
          </div>
        )}
      </section>

      {/* Dedicated Starting XI / Squad Modal (Interactive Pitch + Jerseys) */}
      {squadModalClub && (
        <div className="adm-modal-backdrop" onClick={closeSquadModal}>
          <div className="adm-modal adm-xi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <div>
                <span className="adm-eyebrow">INTERACTIVE STARTING XI & SQUAD LINEUP</span>
                <h3>{squadModalClub.name}</h3>
              </div>
              <div className="adm-row-actions">
                <select
                  value={xiFormation}
                  onChange={(e) => {
                    const nextFmt = e.target.value
                    const coords = ADMIN_FORMATIONS[nextFmt] || ADMIN_FORMATIONS['4-3-3']
                    setXiFormation(nextFmt)
                    setXiStarters((prev) =>
                      coords.map((c, idx) =>
                        prev[idx] ? { ...prev[idx]!, position: c.pos } : null,
                      ),
                    )
                  }}
                  className="adm-select adm-select-sm"
                  aria-label="Select Formation"
                >
                  {Object.keys(ADMIN_FORMATIONS).map((fmt) => (
                    <option key={fmt} value={fmt}>
                      Formation: {fmt}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  disabled={!squadModalDetail || squadModalDetail.players.length === 0}
                  onClick={() => {
                    const players = squadModalDetail?.players ?? []
                    const coords = ADMIN_FORMATIONS[xiFormation] || ADMIN_FORMATIONS['4-3-3']
                    setXiStarters(
                      coords.map((c, idx) => {
                        const p = players[idx]
                        if (!p) return null
                        return {
                          position: c.pos,
                          playerId: p.id,
                          gamertag: p.gamertag,
                          shirtNumber: p.shirt_number ?? idx + 1,
                        }
                      }),
                    )
                    setXiBench(
                      players.slice(11).map((p, idx) => ({
                        playerId: p.id,
                        gamertag: p.gamertag,
                        shirtNumber: p.shirt_number ?? 12 + idx,
                        position: 'SUB',
                      })),
                    )
                  }}
                >
                  ⚡ Auto-Fill XI
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost adm-btn-sm"
                  onClick={() => {
                    setXiStarters(Array(11).fill(null))
                    setXiBench([])
                  }}
                >
                  Clear Pitch
                </button>
                <button type="button" className="adm-close-btn" onClick={closeSquadModal}>
                  ×
                </button>
              </div>
            </div>

            {squadModalLoading ? (
              <div className="adm-empty">Loading Starting XI & squad roster…</div>
            ) : (
              <div className="adm-xi-centered-layout">
                {/* Front & Centre: Interactive Football Pitch with Floating Smart Dropdown */}
                <div className="adm-xi-pitch-stage">
                  <div className="adm-pitch">
                    <div className="adm-pitch-surface">
                      <div className="adm-pitch-stripes" />
                      <div className="adm-pitch-lines">
                        <div className="adm-pitch-halfway" />
                        <div className="adm-pitch-circle" />
                        <div className="adm-pitch-spot" />
                        <div className="adm-pitch-box-top" />
                        <div className="adm-pitch-six-top" />
                        <div className="adm-pitch-box-bottom" />
                        <div className="adm-pitch-six-bottom" />
                      </div>
                    </div>

                    <div className="adm-pitch-badge-tl">FORMATION {xiFormation}</div>
                    <div className="adm-pitch-badge-tr">
                      {xiStarters.filter(Boolean).length} / 11 ASSIGNED
                    </div>

                    {xiActiveSlot !== null && (
                      <div
                        className="adm-pitch-popover-backdrop"
                        onClick={() => {
                          setXiActiveSlot(null)
                          setXiPopoverSearch('')
                        }}
                      />
                    )}

                    {(ADMIN_FORMATIONS[xiFormation] || ADMIN_FORMATIONS['4-3-3']).map(
                      (coord, idx) => {
                        const slot = xiStarters[idx]
                        const isActive = xiActiveSlot === idx
                        const isGK = coord.pos === 'GK'
                        return (
                          <button
                            key={`${coord.pos}-${idx}`}
                            type="button"
                            onClick={() => {
                              if (isActive) {
                                setXiActiveSlot(null)
                                setXiPopoverSearch('')
                              } else {
                                setXiActiveSlot(idx)
                                setXiPopoverSearch('')
                              }
                            }}
                            style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
                            className={`adm-pitch-node ${isActive ? 'is-active' : ''} ${
                              slot ? 'is-filled' : 'is-empty'
                            }`}
                          >
                            <div className="adm-pitch-jersey-wrap">
                              <AdminJerseyIcon
                                number={slot ? slot.shirtNumber : '+'}
                                isGK={isGK}
                                active={isActive}
                                unassigned={!slot}
                              />
                              <span className="adm-pitch-pos-tag">{coord.pos}</span>
                            </div>
                            <span className="adm-pitch-name-tag">
                              {slot ? slot.gamertag : 'Click to Assign'}
                            </span>
                          </button>
                        )
                      },
                    )}

                    {/* Floating Smart Dropdown Anchored on the Pitch */}
                    {xiActiveSlot !== null &&
                      (() => {
                        const coords = ADMIN_FORMATIONS[xiFormation] || ADMIN_FORMATIONS['4-3-3']
                        const activeCoord = coords[xiActiveSlot]
                        if (!activeCoord) return null
                        const currentSlot = xiStarters[xiActiveSlot]
                        const squadPlayers = squadModalDetail?.players ?? []
                        const q = xiPopoverSearch.trim().toLowerCase()
                        const filteredPlayers = squadPlayers.filter((p) =>
                          q ? p.gamertag.toLowerCase().includes(q) : true,
                        )
                        const exactMatchExists = squadPlayers.some(
                          (p) => p.gamertag.toLowerCase() === q,
                        )
                        const openAbove = activeCoord.y > 54

                        return (
                          <div
                            className={`adm-pitch-popover ${openAbove ? 'is-above' : 'is-below'}`}
                            style={{
                              left: `clamp(160px, ${activeCoord.x}%, calc(100% - 160px))`,
                              ...(openAbove
                                ? { bottom: `${Math.max(8, 100 - activeCoord.y + 7)}%` }
                                : { top: `${Math.min(62, activeCoord.y + 7)}%` }),
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="adm-pitch-popover-head">
                              <div className="adm-pitch-popover-title">
                                <span className="adm-pitch-popover-pos">{activeCoord.pos}</span>
                                <strong className="adm-pitch-popover-current">
                                  {currentSlot ? currentSlot.gamertag : 'Empty Position'}
                                </strong>
                              </div>
                              <div className="adm-pitch-popover-controls">
                                {currentSlot && (
                                  <>
                                    <label
                                      className="adm-pitch-popover-shirt-label"
                                      title="Jersey Number (1–99)"
                                    >
                                      <span>#</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={99}
                                        value={currentSlot.shirtNumber ?? ''}
                                        onChange={(e) => {
                                          const val = e.target.value ? Number(e.target.value) : null
                                          if (val != null && val >= 1 && val <= 99) {
                                            setXiStarters((prev) => {
                                              const next = [...prev]
                                              if (next[xiActiveSlot]) {
                                                next[xiActiveSlot] = {
                                                  ...next[xiActiveSlot]!,
                                                  shirtNumber: val,
                                                }
                                              }
                                              return next
                                            })
                                          }
                                        }}
                                        className="adm-pitch-popover-shirt-input"
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className="adm-pitch-popover-clear"
                                      onClick={() => {
                                        setXiStarters((prev) => {
                                          const next = [...prev]
                                          next[xiActiveSlot] = null
                                          return next
                                        })
                                      }}
                                      title="Unassign player from this position"
                                    >
                                      Clear
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="adm-pitch-popover-close"
                                  onClick={() => {
                                    setXiActiveSlot(null)
                                    setXiPopoverSearch('')
                                  }}
                                  aria-label="Close position picker"
                                >
                                  ×
                                </button>
                              </div>
                            </div>

                            <div className="adm-pitch-popover-search-wrap">
                              <input
                                type="search"
                                autoFocus
                                value={xiPopoverSearch}
                                onChange={(e) => setXiPopoverSearch(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setXiActiveSlot(null)
                                    setXiPopoverSearch('')
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (filteredPlayers.length > 0) {
                                      assignOrSwapPitchSlot(xiActiveSlot, filteredPlayers[0])
                                    } else if (xiPopoverSearch.trim() && !exactMatchExists) {
                                      void handleQuickSignAndAssign(
                                        xiActiveSlot,
                                        xiPopoverSearch.trim(),
                                      )
                                    }
                                  }
                                }}
                                placeholder="Search squad or type new gamertag…"
                                className="adm-pitch-popover-search"
                              />
                            </div>

                            <div className="adm-pitch-popover-list">
                              {xiPopoverSearch.trim() && !exactMatchExists && (
                                <button
                                  type="button"
                                  disabled={squadModalBusy}
                                  className="adm-pitch-popover-item is-sign-new"
                                  onClick={() =>
                                    void handleQuickSignAndAssign(
                                      xiActiveSlot,
                                      xiPopoverSearch.trim(),
                                    )
                                  }
                                >
                                  <span className="adm-pitch-popover-item-num">+</span>
                                  <span className="adm-pitch-popover-item-name">
                                    Sign & Assign <strong>"{xiPopoverSearch.trim()}"</strong>
                                  </span>
                                  <span className="adm-pitch-popover-item-tag is-new">
                                    New {activeCoord.pos}
                                  </span>
                                </button>
                              )}

                              {filteredPlayers.length === 0 && !xiPopoverSearch.trim() ? (
                                <div className="adm-pitch-popover-empty">
                                  No signed squad players yet. Type a gamertag above to sign &
                                  assign directly!
                                </div>
                              ) : filteredPlayers.length === 0 ? (
                                <div className="adm-pitch-popover-empty">
                                  No existing squad match. Click above to sign & assign.
                                </div>
                              ) : (
                                filteredPlayers.map((p, pIdx) => {
                                  const isCurrent =
                                    currentSlot?.gamertag.toLowerCase() ===
                                    p.gamertag.toLowerCase()
                                  const otherStarterIdx = xiStarters.findIndex(
                                    (s, idx) =>
                                      idx !== xiActiveSlot &&
                                      s &&
                                      s.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                                  )
                                  const otherPos =
                                    otherStarterIdx !== -1 ? coords[otherStarterIdx]?.pos : null
                                  const isOnBench = xiBench.some(
                                    (b) => b.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                                  )
                                  const displayNum =
                                    (isCurrent ? currentSlot?.shirtNumber : null) ??
                                    (otherStarterIdx !== -1
                                      ? xiStarters[otherStarterIdx]?.shirtNumber
                                      : null) ??
                                    p.shirt_number ??
                                    pIdx + 1

                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => assignOrSwapPitchSlot(xiActiveSlot, p)}
                                      className={`adm-pitch-popover-item ${
                                        isCurrent ? 'is-selected' : ''
                                      }`}
                                    >
                                      <span className="adm-pitch-popover-item-num">
                                        #{displayNum}
                                      </span>
                                      <span className="adm-pitch-popover-item-name">
                                        {p.gamertag}
                                      </span>
                                      {isCurrent ? (
                                        <span className="adm-pitch-popover-item-tag is-current">
                                          ✓ Current
                                        </span>
                                      ) : otherPos ? (
                                        <span className="adm-pitch-popover-item-tag is-swap">
                                          ⇄ Swap {otherPos}
                                        </span>
                                      ) : isOnBench ? (
                                        <span className="adm-pitch-popover-item-tag is-bench">
                                          ↑ From Bench
                                        </span>
                                      ) : (
                                        <span className="adm-pitch-popover-item-tag">Assign</span>
                                      )}
                                    </button>
                                  )
                                })
                              )}
                            </div>
                          </div>
                        )
                      })()}
                  </div>
                  <p className="adm-pitch-hint">
                    Click any jersey on the pitch to open the smart player picker — search your
                    squad, swap positions, edit jersey numbers, or type a new gamertag to sign &
                    assign on the spot.
                  </p>
                </div>

                {/* Below Pitch: Bench + Squad Roster side-by-side */}
                <div className="adm-xi-bottom-grid">
                  {/* 1. Bench / Substitutes */}
                  <div className="adm-xi-panel">
                    <div className="adm-xi-panel-head">
                      <span className="adm-eyebrow">BENCH / SUBSTITUTES ({xiBench.length})</span>
                      <select
                        value=""
                        onChange={(e) => {
                          const tag = e.target.value
                          if (!tag) return
                          const p = squadModalDetail?.players.find((sp) => sp.gamertag === tag)
                          if (!p) return
                          if (
                            xiBench.some((b) => b.gamertag.toLowerCase() === tag.toLowerCase())
                          ) {
                            return
                          }
                          setXiBench((prev) => [
                            ...prev,
                            {
                              playerId: p.id,
                              gamertag: p.gamertag,
                              shirtNumber: p.shirt_number ?? 12 + prev.length,
                              position: 'SUB',
                            },
                          ])
                        }}
                        className="adm-select adm-select-sm"
                      >
                        <option value="">+ Add Substitute from Squad…</option>
                        {(squadModalDetail?.players ?? []).map((p) => (
                          <option key={p.id} value={p.gamertag}>
                            {p.gamertag}
                          </option>
                        ))}
                      </select>
                    </div>
                    {xiBench.length === 0 ? (
                      <div className="adm-empty-compact">No substitutes added to bench yet.</div>
                    ) : (
                      <div className="adm-xi-bench-list">
                        {xiBench.map((b, bIdx) => (
                          <div key={`${b.gamertag}-${bIdx}`} className="adm-xi-slot-row">
                            <span className="adm-code-pill">SUB</span>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={b.shirtNumber ?? ''}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                if (n >= 1 && n <= 99) {
                                  setXiBench((prev) =>
                                    prev.map((item, i) =>
                                      i === bIdx ? { ...item, shirtNumber: n } : item,
                                    ),
                                  )
                                }
                              }}
                              className="adm-input adm-xi-shirt-input"
                              title="Jersey Number"
                            />
                            <strong style={{ flex: 1, fontSize: 13 }}>{b.gamertag}</strong>
                            <button
                              type="button"
                              className="adm-btn adm-btn-ghost adm-btn-sm"
                              onClick={() =>
                                setXiBench((prev) => prev.filter((_, i) => i !== bIdx))
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 2. Club Squad Roster & Sign New Player */}
                  <div className="adm-xi-panel" style={{ flex: 1 }}>
                    <div className="adm-xi-panel-head">
                      <span className="adm-eyebrow">
                        SIGNED SQUAD ROSTER ({squadModalDetail?.players.length ?? 0})
                      </span>
                    </div>
                    <form onSubmit={handleSquadModalAdd} className="adm-inline-form">
                      <input
                        type="text"
                        value={squadModalNewTag}
                        onChange={(e) => setSquadModalNewTag(e.target.value)}
                        placeholder="Gamertag to sign…"
                        className="adm-input"
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={squadModalNewShirt}
                        onChange={(e) => setSquadModalNewShirt(e.target.value)}
                        placeholder="Jersey #"
                        className="adm-input"
                        style={{ width: 92 }}
                      />
                      <button
                        type="submit"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        disabled={squadModalBusy || !squadModalNewTag.trim()}
                      >
                        {squadModalBusy ? 'Adding…' : '+ Sign Player'}
                      </button>
                    </form>

                    {!squadModalDetail || squadModalDetail.players.length === 0 ? (
                      <div className="adm-empty-compact" style={{ marginTop: 10 }}>
                        No players signed to {squadModalClub.name} yet. Sign players above or click
                        any position on the pitch to sign & assign directly.
                      </div>
                    ) : (
                      <div className="adm-xi-roster-list" style={{ maxHeight: 340 }}>
                        {squadModalDetail.players.map((p, idx) => {
                          const activeCoord =
                            xiActiveSlot !== null
                              ? (ADMIN_FORMATIONS[xiFormation] || ADMIN_FORMATIONS['4-3-3'])[
                                  xiActiveSlot
                                ]
                              : null
                          const inStartersIdx = xiStarters.findIndex(
                            (s) => s && s.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                          )
                          const isOnBench = xiBench.some(
                            (b) => b.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                          )
                          return (
                            <div key={p.id} className="adm-xi-slot-row">
                              <span className="adm-code-pill">
                                #{p.shirt_number ?? idx + 1}
                              </span>
                              <strong style={{ flex: 1, fontSize: 13 }}>{p.gamertag}</strong>
                              {inStartersIdx !== -1 ? (
                                <span
                                  className="adm-status-badge status-active"
                                  style={{ fontSize: 10 }}
                                >
                                  XI:{' '}
                                  {(ADMIN_FORMATIONS[xiFormation] || ADMIN_FORMATIONS['4-3-3'])[
                                    inStartersIdx
                                  ]?.pos ?? 'STARTER'}
                                </span>
                              ) : isOnBench ? (
                                <span
                                  className="adm-status-badge status-pending"
                                  style={{ fontSize: 10 }}
                                >
                                  SUB
                                </span>
                              ) : null}
                              {activeCoord && (
                                <button
                                  type="button"
                                  className="adm-btn adm-btn-secondary adm-btn-sm"
                                  onClick={() => assignOrSwapPitchSlot(xiActiveSlot!, p)}
                                >
                                  Set as {activeCoord.pos}
                                </button>
                              )}
                              <button
                                type="button"
                                className="adm-btn adm-btn-danger adm-btn-sm"
                                disabled={squadModalBusy}
                                onClick={() => void handleSquadModalRemove(p.gamertag)}
                              >
                                Release
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="adm-modal-foot" style={{ padding: '14px 24px' }}>
              <button type="button" className="adm-btn adm-btn-ghost" onClick={closeSquadModal}>
                Close
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                disabled={squadModalBusy || squadModalLoading}
                onClick={() => void handleSaveStartingXi()}
              >
                {squadModalBusy ? 'Saving Starting XI…' : '✓ Save Starting XI (Publish to Website)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Club Modal */}
      {createOpen && (
        <div className="adm-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <h3>Add a New Club</h3>
              <button type="button" className="adm-close-btn" onClick={() => setCreateOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateClub} className="adm-form-stack">
              <div className="adm-logo-uploader">
                <div className="adm-logo-preview-box">
                  {newClubLogo ? (
                    <img src={newClubLogo} alt="Preview" />
                  ) : (
                    <span>No Logo</span>
                  )}
                </div>
                <div>
                  <strong>Club Crest / Logo</strong>
                  <p>Upload a PNG, JPG, WebP, or SVG crest image.</p>
                  <input
                    ref={createLogoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      try {
                        const dataUrl = await compressImageFile(file, 256, 256)
                        setNewClubLogo(dataUrl)
                      } catch (err) {
                        report('error', err instanceof Error ? err.message : 'Invalid image')
                      }
                    }}
                  />
                  <div className="adm-row-actions">
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={() => createLogoRef.current?.click()}
                    >
                      {newClubLogo ? 'Change Crest' : 'Upload Crest'}
                    </button>
                    {newClubLogo && (
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        onClick={() => setNewClubLogo(null)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="adm-field-grid">
                <label className="adm-field">
                  <span>Club Name *</span>
                  <input
                    type="text"
                    required
                    value={newClubName}
                    onChange={(e) => setNewClubName(e.target.value)}
                    placeholder="Enter club name"
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Short Code (up to 8 chars)</span>
                  <input
                    type="text"
                    maxLength={8}
                    value={newClubCode}
                    onChange={(e) => setNewClubCode(e.target.value.toUpperCase())}
                    placeholder="3-letter code"
                    className="adm-input"
                  />
                </label>
                <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
                  <span>Assign Manager (Search from User List)</span>
                  <SearchableManagerPicker
                    users={users}
                    value={newClubManagerId}
                    onChange={setNewClubManagerId}
                  />
                </div>
                <label className="adm-field">
                  <span>Region Flag</span>
                  <select
                    value={newClubFlag}
                    onChange={(e) => setNewClubFlag(e.target.value)}
                    className="adm-select"
                  >
                    <option value="">No Region Flag</option>
                    {regionChoices.map((r) => (
                      <option key={r.flag} value={r.flag}>
                        {r.flag} {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="adm-field">
                  <span>Division</span>
                  <select
                    value={newClubDivision}
                    onChange={(e) => setNewClubDivision(e.target.value)}
                    className="adm-select"
                  >
                    <option value="">Unassigned</option>
                    {activeDivisions.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="adm-field">
                  <span>Initial Status</span>
                  <select
                    value={newClubStatus}
                    onChange={(e) =>
                      setNewClubStatus(e.target.value as 'active' | 'pending' | 'withdrawn')
                    }
                    className="adm-select"
                  >
                    <option value="active">Active (Live on site)</option>
                    <option value="pending">Pending</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </label>
              </div>

              <div className="adm-modal-foot">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={createBusy}>
                  {createBusy ? 'Creating…' : 'Create Club'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-Over Side Drawer for Club Details, Crest Upload, Manager Assignment & Squad Roster */}
      {drawerClubSlug && (
        <div className="adm-drawer-backdrop" onClick={closeDrawer}>
          <aside className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <div>
                <span className="adm-eyebrow">CLUB DRAWER</span>
                <h3>{editName || drawerClubSlug}</h3>
              </div>
              <button type="button" className="adm-close-btn" onClick={closeDrawer}>
                ×
              </button>
            </div>

            <div className="adm-drawer-body">
              <form onSubmit={handleSaveDrawerClub} className="adm-form-stack">
                {/* Crest Upload */}
                <div className="adm-logo-uploader">
                  <div className="adm-logo-preview-box">
                    {editLogo ? <img src={editLogo} alt={editName} /> : <span>No Logo</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <strong>Club Crest / Logo</strong>
                    <p>Upload a new crest image or clear logo.</p>
                    <input
                      ref={drawerLogoRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        try {
                          const dataUrl = await compressImageFile(file, 256, 256)
                          setEditLogo(dataUrl)
                        } catch (err) {
                          report('error', err instanceof Error ? err.message : 'Invalid image')
                        }
                      }}
                    />
                    <div className="adm-row-actions">
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => drawerLogoRef.current?.click()}
                      >
                        Upload Image File
                      </button>
                      {editLogo && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-ghost adm-btn-sm"
                          onClick={() => setEditLogo(null)}
                        >
                          Clear Logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="adm-field-grid">
                  <label className="adm-field">
                    <span>Club Name</span>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                  <label className="adm-field">
                    <span>Short Code</span>
                    <input
                      type="text"
                      maxLength={8}
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                      placeholder="3-letter code"
                      className="adm-input"
                    />
                  </label>
                  <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
                    <span>Club Manager (Search & Assign from User List)</span>
                    <SearchableManagerPicker
                      users={users}
                      value={editManagerUserId}
                      onChange={setEditManagerUserId}
                      currentClubSlug={drawerClubSlug}
                    />
                  </div>
                  <label className="adm-field">
                    <span>Region Flag</span>
                    <select
                      value={editFlag}
                      onChange={(e) => setEditFlag(e.target.value)}
                      className="adm-select"
                    >
                      <option value="">No Region Flag</option>
                      {regionChoices.map((r) => (
                        <option key={r.flag} value={r.flag}>
                          {r.flag} {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="adm-field">
                    <span>Division</span>
                    <select
                      value={editDivisionId}
                      onChange={(e) => setEditDivisionId(e.target.value)}
                      className="adm-select"
                    >
                      <option value="">Unassigned</option>
                      {activeDivisions.map((d) => {
                        const count = clubs.filter((c) => c.status === 'active' && c.division_id === d.id).length
                        const isCurrent = currentClub?.division_id === d.id
                        const isFull = d.max_teams != null && d.max_teams > 0 && count >= d.max_teams && !isCurrent
                        return (
                          <option key={d.id} value={String(d.id)} disabled={isFull}>
                            {d.name} ({count}{d.max_teams ? `/${d.max_teams}` : ''}){isFull ? ' - FULL' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                  <label className="adm-field">
                    <span>Club Status</span>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="adm-select"
                    >
                      <option value="active">Active (Public)</option>
                      <option value="pending">Pending</option>
                      <option value="withdrawn">Withdrawn</option>
                    </select>
                  </label>

                  {/* EA FC Pro Clubs Integration */}
                  <div className="adm-ea-section" style={{
                    gridColumn: '1 / -1',
                    background: 'rgba(56, 189, 248, 0.05)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: 8,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    marginTop: 6
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

                        <div>
                          <strong style={{ fontSize: '0.98rem', display: 'block' }}>EA Sports FC Pro Clubs Link</strong>
                          <span style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }}>
                            Link to in-game club to fetch scores and player stats automatically
                          </span>
                        </div>
                      </div>
                      {editEaClubId ? (
                        <span className="adm-code-pill" style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '3px 8px' }}>
                          Linked: #{editEaClubId}
                        </span>
                      ) : (
                        <span className="adm-code-pill" style={{ color: '#eab308', border: '1px solid rgba(234,179,8,0.4)', padding: '3px 8px' }}>
                          Not Linked
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label className="adm-field">
                        <span style={{ fontSize: '0.82rem' }}>EA Club ID</span>
                        <input
                          type="text"
                          value={editEaClubId}
                          onChange={(e) => setEditEaClubId(e.target.value.trim())}
                          placeholder="e.g. 590308"
                          className="adm-input"
                        />
                      </label>
                      <label className="adm-field">
                        <span style={{ fontSize: '0.82rem' }}>EA Club In-Game Name</span>
                        <input
                          type="text"
                          value={editEaClubName}
                          onChange={(e) => setEditEaClubName(e.target.value)}
                          placeholder="e.g. Acousticsss FC"
                          className="adm-input"
                        />
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => {
                          setEaSearchOpen(!eaSearchOpen)
                          if (!eaSearchOpen) {
                            setEaSearchQuery(editName)
                            void handleEaSearch(editName)
                          }
                        }}
                      >
                        {eaSearchOpen ? 'Close Search' : 'Search Live on EA Sports'}
                      </button>
                      {editEaClubId && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-ghost adm-btn-sm"
                          onClick={() => {
                            setEditEaClubId('')
                            setEditEaClubName('')
                          }}
                        >
                          Unlink EA Club
                        </button>
                      )}
                    </div>

                    {eaSearchOpen && (
                      <div style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid var(--adm-border)',
                        borderRadius: 6,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10
                      }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="text"
                            value={eaSearchQuery}
                            onChange={(e) => setEaSearchQuery(e.target.value)}
                            placeholder="Type EA Club name to search..."
                            className="adm-input"
                            style={{ flex: 1 }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void handleEaSearch()
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="adm-btn adm-btn-primary adm-btn-sm"
                            disabled={eaSearching}
                            onClick={() => void handleEaSearch()}
                          >
                            {eaSearching ? 'Searching…' : 'Search EA'}
                          </button>
                        </div>

                        {eaSearchResults.length > 0 && (
                          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {eaSearchResults.map((ec) => (
                              <div
                                key={ec.clubId}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '8px 12px',
                                  background: 'rgba(255,255,255,0.04)',
                                  borderRadius: 4,
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  cursor: 'pointer'
                                }}
                                onClick={() => {
                                  setEditEaClubId(ec.clubId)
                                  setEditEaClubName(ec.name)
                                  setEaSearchOpen(false)
                                  report('ok', `Selected EA Club "${ec.name}" (#${ec.clubId})`)
                                }}
                              >
                                <div>
                                  <strong style={{ fontSize: '0.92rem' }}>{ec.name}</strong>
                                  <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }}>
                                    ID: #{ec.clubId} {ec.wins !== undefined ? `· Record: ${ec.wins}W ${ec.draws || 0}D ${ec.losses || 0}L` : ''}
                                  </div>
                                </div>
                                <button type="button" className="adm-btn adm-btn-secondary adm-btn-xs">
                                  Select Club
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="adm-row-actions">
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={drawerBusy}>
                    {drawerBusy ? 'Saving…' : 'Save Club Details'}
                  </button>
                </div>
              </form>

              <hr className="adm-divider" />

              {/* Squad Roster inside Drawer */}
              <div className="adm-form-stack">
                <div>
                  <span className="adm-eyebrow">ROSTER</span>
                  <h4>Squad Players ({drawerDetail?.players?.length ?? 0})</h4>
                </div>

                <form onSubmit={handleAddPlayer} className="adm-inline-form">
                  <input
                    type="text"
                    value={newPlayerTag}
                    onChange={(e) => setNewPlayerTag(e.target.value)}
                    placeholder="Enter player gamertag to sign…"
                    className="adm-input"
                  />
                  <button
                    type="submit"
                    className="adm-btn adm-btn-secondary"
                    disabled={drawerBusy || !newPlayerTag.trim()}
                  >
                    + Add Player
                  </button>
                </form>

                {drawerLoading ? (
                  <p className="adm-text-muted">Loading squad…</p>
                ) : !drawerDetail || drawerDetail.players.length === 0 ? (
                  <div className="adm-empty-compact">No players currently signed to this club.</div>
                ) : (
                  <div className="adm-list">
                    {drawerDetail.players.map((p) => (
                      <div key={p.id} className="adm-list-row">
                        <div className="adm-list-main">
                          <strong>{p.gamertag}</strong>
                        </div>
                        <button
                          type="button"
                          className="adm-btn adm-btn-danger adm-btn-sm"
                          disabled={drawerBusy}
                          onClick={() => void handleRemovePlayer(p.gamertag)}
                        >
                          Release
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr className="adm-divider" />

              {/* Danger Zone */}
              <div className="adm-danger-zone">
                <div>
                  <strong>Delete Club</strong>
                  <p>Permanently remove this club, its fixtures, and release all its players.</p>
                </div>
                <button
                  type="button"
                  className="adm-btn adm-btn-danger"
                  disabled={drawerBusy}
                  onClick={() => void handleDeleteClub()}
                >
                  Delete Club
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Bulk EA FC Pro Clubs Linking Wizard Modal */}
      <EaBulkLinkWizardModal
        isOpen={bulkWizardOpen}
        onClose={() => setBulkWizardOpen(false)}
        onSuccess={(msg) => {
          report('ok', msg)
          void loadData()
        }}
        clubs={clubs}
        divisions={divisions}
        guard={guard}
        report={report}
      />
    </div>
  )
}
