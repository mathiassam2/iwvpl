/**
 * The signed-in dashboard.
 *
 * One route, two very different jobs. A manager is running a club; a player is
 * answering offers and deciding whether to stay. They share a page because
 * they share a header, and splitting it would mean two routes that differ only
 * by which panel loads.
 *
 * The route is guarded by redirect rather than by an error boundary: an
 * unsigned visitor has no account to show anything about, so the honest
 * response is to send them to sign in and come back.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pitch } from '@/components/club'
import { SignPlayerModal } from '@/components/manager/SignPlayerModal'
import { Button, ButtonLink, Container, EmptyState, SmartImage } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import {
  cancelOffer,
  createClub,
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
  getMyOrders,
  getManagerJoinRequests,
  decideJoinRequest,
  getPlayerJoinRequests,
  cancelJoinRequest,
  type JoinRequest,
  type UserOrder,
  type ManagerClub,

  type Offer,
} from '@/lib/api'
import {
  buildSquadFromLineup,
  FORMATIONS,
  type ClubLineup,
  type ClubLineupBench,
  type ClubLineupSlot,
} from '@/lib/fixtures'
import { AVATAR_PLACEHOLDER, CLUB_PLACEHOLDER, compressClubLogo, cx } from '@/lib/format'
import { invalidateLiveClubCache } from '@/lib/liveLeague'

/**
 * Panel.
 *
 * Dense on purpose. This is a workspace, not a marketing page: the admin app
 * sets the scale for anything an operator uses daily, and at the public
 * site's display sizes a squad list becomes one name per screen. Tighter
 * padding and the `default` container keep a whole club on one screen.
 */
const card = 'rounded-card border border-[var(--border-strong)] bg-[var(--surface)] p-4 sm:p-5'

/* Section headings inside a panel. Smaller than the public site's SectionHead,
   which is sized for a full-width section between hero bands. */
function PanelHead({ label, title, action }: { label: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
          {label}
        </p>
        <h2 className="mt-1 font-display text-lg font-bold leading-tight text-[var(--text-strong)]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  )
}

/** Body copy inside a panel. The public site's `text-[15px]`/relaxed sizing is
 *  paragraph scale; this is UI copy. */
const prose = 'text-[13px] leading-relaxed text-[var(--text-muted)]'
const field =
  'h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px] ' +
  'text-[var(--text-strong)] outline-none focus:border-[var(--accent-ring)]'

/** Shared error/notice line, so every panel reports failure the same way. */
function Notice({ kind, text }: { kind: 'ok' | 'error'; text: string | null }) {
  if (!text) return null
  return (
    <p
      role="status"
      className={cx(
        'rounded-lg px-4 py-3 text-sm',
        kind === 'ok'
          ? 'border border-[var(--accent-ring)] bg-[var(--accent-tint)] text-[var(--accent-text)]'
          : 'border border-[var(--danger-text)] bg-[var(--danger-text)]/10 text-[var(--danger-text)]',
      )}
    >
      {text}
    </p>
  )
}

const msg = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong.')

/* ================================================================ manager */

function ManagerPanel() {
  const { user, refresh } = useAuth()
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [clubName, setClubName] = useState('')
  const [clubShortCode, setClubShortCode] = useState('')
  const [clubLogoDraft, setClubLogoDraft] = useState<string | null>(null)
  const createLogoRef = useRef<HTMLInputElement | null>(null)
  const editLogoRef = useRef<HTMLInputElement | null>(null)

  const [myClub, setMyClub] = useState<ManagerClub | null>(null)
  const [editShortCode, setEditShortCode] = useState('')

  const [squadList, setSquadList] = useState<Awaited<ReturnType<typeof squad>>['squad']>([])
  const [squadPage, setSquadPage] = useState(1)
  const squadPageSize = 10
  const totalSquadPages = Math.max(1, Math.ceil(squadList.length / squadPageSize))
  const safeSquadPage = Math.min(squadPage, totalSquadPages)
  const pagedSquad = squadList.slice((safeSquadPage - 1) * squadPageSize, safeSquadPage * squadPageSize)
  const [offers, setOffers] = useState<Offer[]>([])

  // Starting XI state
  const [formation, setFormation] = useState<string>('4-3-3')
  const [starters, setStarters] = useState<Array<ClubLineupSlot | null>>(Array(11).fill(null))
  const [bench, setBench] = useState<ClubLineupBench[]>([])
  const [captainGamertag, setCaptainGamertag] = useState<string | null>(null)
  const [clubManagers, setClubManagers] = useState<
    Array<{ id: number; name: string; email?: string; gamertag?: string | null }>
  >([])
  const [activeSlotIdx, setActiveSlotIdx] = useState<number | null>(null)
  const [slotSearch, setSlotSearch] = useState('')

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

    setBench((prev) =>
      prev.filter((b) => b.gamertag.toLowerCase() !== player.gamertag.toLowerCase()),
    )
    setActiveSlotIdx(null)
    setSlotSearch('')
  }

  const [showSignModal, setShowSignModal] = useState(false)
  const squadPlayerIds = useMemo(() => new Set(squadList.map((p) => p.id)), [squadList])

  const initLineupState = useCallback(
    (clubData: ManagerClub | null, players: Awaited<ReturnType<typeof squad>>['squad']) => {
      const saved = clubData?.starting_xi
      const fmtKey = saved?.formation && FORMATIONS[saved.formation] ? saved.formation : '4-3-3'
      const slots = FORMATIONS[fmtKey].slots
      const initialCaptain =
        saved?.captainGamertag ??
        saved?.starters?.find((s) => s?.isCaptain)?.gamertag ??
        null
      setCaptainGamertag(initialCaptain)
      setFormation(fmtKey)
      setStarters(
        slots.map(([pos], idx) => {
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
        }),
      )
      setBench(
        Array.isArray(saved?.bench)
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
          : [],
      )
    },
    [],
  )

  const loadClub = useCallback(async () => {
    try {
      const data = await squad()
      setMyClub(data.club)
      setEditShortCode(data.club.short_code ?? '')
      setSquadList(data.squad)
      if (Array.isArray((data as any).managers)) {
        setClubManagers((data as any).managers)
      }
      initLineupState(data.club, data.squad)
    } catch {
      setMyClub(null)
      setSquadList([])
    }
  }, [initLineupState])

  const loadOffers = useCallback(async () => {
    try {
      setOffers((await managerOffers()).offers)
    } catch {
      setOffers([])
    }
  }, [])

  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])

  const loadJoinRequests = useCallback(async () => {
    try {
      const data = await getManagerJoinRequests()
      setJoinRequests(data.requests)
    } catch {
      setJoinRequests([])
    }
  }, [])

  useEffect(() => {
    void loadClub()
    void loadOffers()
    void loadJoinRequests()
  }, [loadClub, loadOffers, loadJoinRequests])

  const handleDecideJoinRequest = async (id: number, decision: 'accept' | 'reject') => {
    setBusy(true)
    setNotice(null)
    try {
      await decideJoinRequest(id, decision)
      setNotice({
        kind: 'ok',
        text: decision === 'accept' ? 'Player accepted and added to your squad!' : 'Join request declined.',
      })
      await Promise.all([loadClub(), loadJoinRequests()])
      await refresh()
    } catch (err: unknown) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const [showClaimSelf, setShowClaimSelf] = useState(false)
  const [selfGamertag, setSelfGamertag] = useState(user?.gamertag || user?.name || '')
  const [selfShirtNumber, setSelfShirtNumber] = useState('')
  const [selfBusy, setSelfBusy] = useState(false)

  const isManagerInSquad = squadList.some(
    (p) =>
      (user?.playerId && p.id === user.playerId) ||
      (user?.id && p.user_id === user.id) ||
      Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()),
  )

  const handleReleasePlayer = async (p: { id: number; gamertag: string; user_id?: number | null }) => {
    const isSelf =
      (user?.playerId && p.id === user.playerId) ||
      (user?.id && p.user_id === user.id) ||
      Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase())
    const confirmMsg = isSelf
      ? 'Are you sure you want to step down from the squad as Playing Captain? You will become a free agent.'
      : `Are you sure you want to release ${p.gamertag} from your squad? They will become a free agent.`
    if (!window.confirm(confirmMsg)) return

    setBusy(true)
    setNotice(null)
    try {
      await releaseSquadPlayer(p.id)
      setNotice({
        kind: 'ok',
        text: isSelf
          ? 'You have stepped down from the squad and are now a free agent.'
          : `${p.gamertag} has been released and is now a free agent.`,
      })
      await loadClub()
      await refresh()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleClaimSelfPlayer = async (e: FormEvent) => {
    e.preventDefault()
    const cleanTag = selfGamertag.trim()
    if (!cleanTag) return
    setSelfBusy(true)
    try {
      const shirt = selfShirtNumber.trim() ? Number.parseInt(selfShirtNumber.trim(), 10) : undefined
      await createManagerSelfPlayer({
        gamertag: cleanTag,
        shirtNumber: shirt,
      })
      setNotice({
        kind: 'ok',
        text: `You've joined ${myClub?.name || 'the squad'} as Playing Captain! You can now place yourself in the Starting XI.`,
      })
      setShowClaimSelf(false)
      await loadClub()
      await refresh()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setSelfBusy(false)
    }
  }

  const onCreateLogoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressClubLogo(file)
      setClubLogoDraft(dataUrl)
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not read image.' })
    }
  }

  const onUpdateClubLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setNotice(null)
    try {
      const dataUrl = await compressClubLogo(file)
      const res = await updateManagerClub({ logo: dataUrl })
      setMyClub(res.club)
      setNotice({ kind: 'ok', text: 'Club logo updated.' })
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onRemoveClubLogo = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await updateManagerClub({ logo: null })
      setMyClub(res.club)
      setNotice({ kind: 'ok', text: 'Club logo removed.' })
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onSaveShortCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const res = await updateManagerClub({ shortCode: editShortCode.trim() || null })
      setMyClub(res.club)
      setEditShortCode(res.club.short_code ?? '')
      setNotice({ kind: 'ok', text: 'Club short code saved.' })
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onCreateClub = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await createClub(clubName.trim(), {
        shortCode: clubShortCode.trim() || undefined,
        logo: clubLogoDraft,
      })
      setClubName('')
      setClubShortCode('')
      setClubLogoDraft(null)
      setNotice({ kind: 'ok', text: 'Club created. An admin assigns it to a division before it can play.' })
      await Promise.all([loadClub(), refresh()])
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }



  const onCancel = async (id: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await cancelOffer(id)
      void loadOffers()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const pending = offers.filter((o) => o.status === 'pending')
  const settled = offers.filter((o) => o.status !== 'pending')

  if (!user?.clubId) {
    return (
      <section className={card}>
        <PanelHead label="Your club" title="Create your club" />
        <p className="mb-4 ">
          A club is created active but sits outside every division until a league admin assigns
          it. It will not appear in the standings until then.
        </p>
        <form onSubmit={onCreateClub} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder="Enter your club name"
              required
              maxLength={120}
              className={field}
            />
            <input
              value={clubShortCode}
              onChange={(e) => setClubShortCode(e.target.value.toUpperCase())}
              placeholder="Short code (optional)"
              maxLength={8}
              className={cx(field, 'sm:w-48 uppercase')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <img
              src={clubLogoDraft || CLUB_PLACEHOLDER}
              alt="Club crest preview"
              className="h-12 w-12 rounded-lg border border-[var(--border)] object-contain p-1"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--text-strong)]">
                {clubLogoDraft ? 'Club logo ready' : 'Upload club logo (optional)'}
              </p>
              <p className="text-[11px] text-[var(--text-faint)]">
                PNG, JPG, WebP or SVG crest image
              </p>
            </div>
            <input
              ref={createLogoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => void onCreateLogoPick(e)}
              className="hidden"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => createLogoRef.current?.click()}
            >
              {clubLogoDraft ? 'Change logo' : 'Upload logo'}
            </Button>
            {clubLogoDraft && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setClubLogoDraft(null)}
              >
                Remove
              </Button>
            )}
          </div>

          <Button type="submit" disabled={busy || !clubName.trim()}>
            {busy ? 'Creating…' : 'Create club'}
          </Button>
        </form>
        <div className="mt-4">
          <Notice {...(notice ?? { kind: 'ok', text: null })} />
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-8">
      <Notice {...(notice ?? { kind: 'ok', text: null })} />

      {/* ---- approval status ---- */}
      {user.clubStatus === 'pending' && (
        <section className={card}>
          <PanelHead label="Approval" title="Waiting for league admin" />
          <p className={prose}>
            <strong className="text-[var(--text)]">{user.clubName}</strong> has been submitted and
            is waiting to be approved. It is not on the public site yet and cannot play fixtures
            until it is. You can carry on signing players below in the meantime — a squad can be
            built before the club is approved.
          </p>
        </section>
      )}

      {user.clubStatus === 'withdrawn' && (
        <section className={card}>
          <PanelHead label="Approval" title="Club not approved" />
          <p className={prose}>
            <strong className="text-[var(--text)]">{user.clubName}</strong> was not approved. Create
            another club from this dashboard if you want to apply again.
          </p>
        </section>
      )}

      {/* ---- club identity & logo ---- */}
      <section className={card}>
        <PanelHead
          label="Club identity"
          title={myClub?.name ?? user.clubName ?? 'Your club'}
          action={
            myClub?.slug && user.clubStatus === 'active' ? (
              <ButtonLink to={`/clubs/${myClub.slug}`} variant="outline" size="sm">
                Public page
              </ButtonLink>
            ) : undefined
          }
        />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] p-1.5">
              <img
                src={myClub?.logo_local || myClub?.logo_url || CLUB_PLACEHOLDER}
                alt={myClub?.name || 'Club logo'}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text-strong)]">Club crest / logo</p>
              <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                Shown on standings tables, fixtures, and your club profile.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <input
                  ref={editLogoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => void onUpdateClubLogo(e)}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => editLogoRef.current?.click()}
                >
                  {myClub?.logo_local || myClub?.logo_url ? 'Change logo' : 'Upload logo'}
                </Button>
                {(myClub?.logo_local || myClub?.logo_url) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onRemoveClubLogo()}
                  >
                    Remove logo
                  </Button>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={onSaveShortCode} className="flex items-end gap-2 sm:ml-auto">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                Short code
              </label>
              <input
                value={editShortCode}
                onChange={(e) => setEditShortCode(e.target.value.toUpperCase())}
                placeholder="3-letter code"
                maxLength={8}
                className={cx(field, 'w-36 uppercase')}
              />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={busy}>
              Save
            </Button>
          </form>
        </div>
      </section>

      {/* ---- starting xi & lineup ---- */}
      <section className={card}>
        <PanelHead
          label="Lineup & formation"
          title="Starting XI & Bench"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={formation}
                onChange={(e) => {
                  const nextFmt = e.target.value
                  const slots = (FORMATIONS[nextFmt] || FORMATIONS['4-3-3']).slots
                  setFormation(nextFmt)
                  setStarters((prev) =>
                    slots.map(([pos], idx) =>
                      prev[idx] ? { ...prev[idx]!, position: pos, role: pos } : null,
                    ),
                  )
                }}
                className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-xs font-bold text-[var(--text-strong)]"
              >
                {Object.keys(FORMATIONS).map((fmt) => (
                  <option key={fmt} value={fmt} className="bg-[#12151a] text-white">
                    Formation: {fmt}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || squadList.length === 0}
                onClick={() => {
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
                }}
              >
                Auto-fill from squad
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setNotice(null)
                  try {
                    const lineupPayload: ClubLineup = {
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
                    await saveManagerLineup(lineupPayload)
                    setNotice({ kind: 'ok', text: 'Starting XI saved and published to your club page.' })
                    await loadClub()
                  } catch (err) {
                    setNotice({ kind: 'error', text: msg(err) })
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy ? 'Saving…' : 'Save Starting XI'}
              </Button>
            </div>
          }
        />

        <div className="space-y-6">
          <div className="mx-auto w-full max-w-[520px]">
            <Pitch
              home
              squad={
                buildSquadFromLineup(
                  {
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
                  },
                  user?.name,
                ) ?? {
                  formation,
                  manager: user?.name || 'Club Manager',
                  starters: (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots.map(
                    ([role, x, y], idx) => ({
                      number: idx + 1,
                      name: 'Unassigned',
                      role,
                      x,
                      y,
                    }),
                  ),
                  bench: [],
                }
              }
              activeSlotIndex={activeSlotIdx}
              onSelectSlot={(idx) => {
                if (activeSlotIdx === idx) {
                  setActiveSlotIdx(null)
                  setSlotSearch('')
                } else {
                  setActiveSlotIdx(idx)
                  setSlotSearch('')
                }
              }}
            >
              {activeSlotIdx !== null && (
                <>
                  <div
                    className="absolute inset-0 z-[6] rounded-card bg-black/25"
                    onClick={() => {
                      setActiveSlotIdx(null)
                      setSlotSearch('')
                    }}
                  />
                  {(() => {
                    const slots = (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots
                    const activeCoord = slots[activeSlotIdx]
                    if (!activeCoord) return null
                    const [pos, x, y] = activeCoord
                    const currentSlot = starters[activeSlotIdx]
                    const q = slotSearch.trim().toLowerCase()
                    const filtered = squadList.filter((p) =>
                      q ? p.gamertag.toLowerCase().includes(q) : true,
                    )
                    const openAbove = y > 54

                    return (
                      <div
                        className="absolute z-[12] w-[min(296px,calc(100%-16px))] -translate-x-1/2 overflow-hidden rounded-xl border border-[#c8ff3d]/45 bg-[#0c1014]/95 shadow-[0_20px_44px_rgba(0,0,0,0.8)] backdrop-blur-md"
                        style={{
                          left: `clamp(156px, ${x}%, calc(100% - 156px))`,
                          ...(openAbove
                            ? { bottom: `${Math.max(6, 100 - y + 7)}%` }
                            : { top: `${Math.min(62, y + 7)}%` }),
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="shrink-0 rounded bg-[#c8ff3d] px-1.5 py-0.5 font-mono text-[10.5px] font-black text-[#0b0f05]">
                              {pos}
                            </span>
                            <strong className="truncate text-xs font-bold text-white">
                              {currentSlot ? currentSlot.gamertag : 'Empty Position'}
                            </strong>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {currentSlot && (
                              <>
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
                                    captainGamertag && captainGamertag.toLowerCase() === currentSlot.gamertag.toLowerCase()
                                      ? 'bg-amber-400 text-black font-extrabold shadow-sm'
                                      : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white',
                                  )}
                                  title={
                                    captainGamertag && captainGamertag.toLowerCase() === currentSlot.gamertag.toLowerCase()
                                      ? 'Remove Captain'
                                      : 'Set as Captain'
                                  }
                                >
                                  <span>©</span>
                                  <span>Captain</span>
                                </button>
                                <label
                                  className="inline-flex h-6 items-center gap-0.5 rounded border border-white/20 bg-black/50 px-1.5 font-mono text-[11px] font-extrabold text-[#c8ff3d]"
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
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      captainGamertag &&
                                      currentSlot.gamertag.toLowerCase() === captainGamertag.toLowerCase()
                                    ) {
                                      setCaptainGamertag(null)
                                    }
                                    setStarters((prev) => {
                                      const next = [...prev]
                                      next[activeSlotIdx] = null
                                      return next
                                    })
                                  }}
                                  className="h-6 rounded border border-red-400/35 bg-red-500/15 px-2 text-[10px] font-bold text-red-300 hover:bg-red-500/25 hover:text-white"
                                >
                                  Clear
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSlotIdx(null)
                                setSlotSearch('')
                              }}
                              className="grid h-6 w-6 place-items-center rounded bg-white/10 text-sm text-white/75 hover:bg-white/20 hover:text-white"
                              aria-label="Close picker"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* Search input */}
                        <div className="border-b border-white/10 p-2">
                          <input
                            type="search"
                            autoFocus
                            value={slotSearch}
                            onChange={(e) => setSlotSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setActiveSlotIdx(null)
                                setSlotSearch('')
                              } else if (e.key === 'Enter' && filtered.length > 0) {
                                e.preventDefault()
                                assignOrSwapSlot(activeSlotIdx, filtered[0])
                              }
                            }}
                            placeholder="Search squad player…"
                            className="h-8 w-full rounded-lg border border-white/20 bg-black/55 px-2.5 text-xs text-white placeholder:text-white/45 focus:border-[#c8ff3d] focus:outline-none"
                          />
                        </div>

                        {/* Player list */}
                        <div className="max-h-44 space-y-1 overflow-y-auto p-1.5">
                          {filtered.length === 0 ? (
                            <p className="px-2 py-3 text-center text-[11px] text-white/60">
                              {squadList.length === 0
                                ? 'No signed squad players yet. Sign players below first.'
                                : 'No squad players match your search.'}
                            </p>
                          ) : (
                            filtered.map((p, pIdx) => {
                              const isCurrent =
                                currentSlot?.gamertag.toLowerCase() === p.gamertag.toLowerCase()
                              const otherIdx = starters.findIndex(
                                (s, idx) =>
                                  idx !== activeSlotIdx &&
                                  s &&
                                  s.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                              )
                              const otherPos = otherIdx !== -1 ? slots[otherIdx]?.[0] : null
                              const isOnBench = bench.some(
                                (b) => b.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                              )
                              const displayNum =
                                (isCurrent
                                  ? currentSlot?.shirtNumber ?? currentSlot?.number
                                  : null) ??
                                (otherIdx !== -1
                                  ? starters[otherIdx]?.shirtNumber ?? starters[otherIdx]?.number
                                  : null) ??
                                p.shirt_number ??
                                pIdx + 1

                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => assignOrSwapSlot(activeSlotIdx, p)}
                                  className={cx(
                                    'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition',
                                    isCurrent
                                      ? 'border-[#c8ff3d]/45 bg-[#c8ff3d]/15 text-white'
                                      : 'border-transparent text-white hover:border-white/15 hover:bg-white/10',
                                  )}
                                >
                                  <span className="min-w-[28px] rounded bg-white/10 px-1.5 py-0.5 text-center font-mono text-[10.5px] font-extrabold text-[#c8ff3d]">
                                    #{displayNum}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-semibold">
                                    {p.gamertag}
                                  </span>
                                  {isCurrent ? (
                                    <span className="rounded bg-[#c8ff3d] px-1.5 py-0.5 text-[10px] font-bold text-[#0b0f05]">
                                      ✓ Current
                                    </span>
                                  ) : otherPos ? (
                                    <span className="rounded border border-sky-400/35 bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                                      ⇄ Swap {otherPos}
                                    </span>
                                  ) : isOnBench ? (
                                    <span className="rounded border border-amber-400/35 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                      ↑ From Bench
                                    </span>
                                  ) : (
                                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/75">
                                      Assign
                                    </span>
                                  )}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}
            </Pitch>
            <p className="mt-2.5 text-center text-xs leading-relaxed text-[var(--text-faint)]">
              Click any jersey on the pitch to open the smart player dropdown — search your squad,
              swap positions, or edit jersey numbers directly on the field.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 items-stretch">
            {/* Bench / Substitutes */}
            <div className="flex flex-col h-[360px] rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5">
              <div className="mb-2.5 flex items-center justify-between shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                  Bench / Substitutes ({bench.length})
                </p>
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
                        position: 'SUB',
                      },
                    ])
                  }}
                  className="h-7 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[11px] font-semibold text-[var(--text-strong)]"
                >
                  <option value="" className="bg-[#12151a] text-white">+ Add Substitute…</option>
                  {squadList.map((p) => (
                    <option key={p.id} value={p.gamertag} className="bg-[#12151a] text-white">
                      {p.gamertag}
                    </option>
                  ))}
                </select>
              </div>
              {bench.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-4">
                  <p className="text-xs text-[var(--text-faint)]">No substitutes added yet.</p>
                </div>
              ) : (
                <ul className="scroll-slim flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {bench.map((b, bIdx) => (
                    <li
                      key={`${b.gamertag}-${bIdx}`}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs"
                    >
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={b.shirtNumber ?? ''}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setBench((prev) =>
                            prev.map((item, i) =>
                              i === bIdx && n >= 1 && n <= 99 ? { ...item, shirtNumber: n } : item,
                            ),
                          )
                        }}
                        className="h-7 w-12 rounded border border-[var(--border-strong)] bg-[var(--bg)] px-1 text-center font-mono text-xs font-bold text-[var(--text-strong)]"
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-strong)]">
                        {b.gamertag}
                      </span>
                      <button
                        type="button"
                        onClick={() => setBench((prev) => prev.filter((_, i) => i !== bIdx))}
                        className="text-xs font-bold text-[var(--danger-text)] hover:underline"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Signed Squad Lineup Status */}
            <div className="flex flex-col h-[360px] rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5">
              <div className="mb-2.5 flex items-center justify-between shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                  Squad Lineup Status ({starters.filter(Boolean).length} / 11 Starters)
                </p>
                {starters.some(Boolean) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStarters(Array(11).fill(null))
                      setBench([])
                      setCaptainGamertag(null)
                    }}
                    className="text-[11px] font-semibold text-[var(--text-faint)] hover:text-[var(--text-strong)]"
                  >
                    Clear Pitch
                  </button>
                )}
              </div>
              {squadList.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-4 text-center">
                  <p className="text-xs text-[var(--text-faint)]">
                    Sign players to your squad below to place them on the pitch.
                  </p>
                </div>
              ) : (
                <ul className="scroll-slim flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {squadList.map((p, idx) => {
                    const starterIdx = starters.findIndex(
                      (s) => s && s.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                    )
                    const starterPos =
                      starterIdx !== -1
                        ? (FORMATIONS[formation] || FORMATIONS['4-3-3']).slots[starterIdx]?.[0]
                        : null
                    const isSub = bench.some(
                      (b) => b.gamertag.toLowerCase() === p.gamertag.toLowerCase(),
                    )
                    const isMgr =
                      (user?.playerId === p.id || user?.id === p.user_id) ||
                      Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()) ||
                      clubManagers.some((m) =>
                        m.id === p.user_id ||
                        (m.gamertag && m.gamertag.toLowerCase() === p.gamertag.toLowerCase()) ||
                        (m.name && m.name.toLowerCase() === p.gamertag.toLowerCase())
                      )
                    const isCap = Boolean(captainGamertag && p.gamertag.toLowerCase() === captainGamertag.toLowerCase())

                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs"
                      >
                        <span className="rounded bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-[var(--text-muted)]">
                          #{p.shirt_number ?? idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-strong)] flex items-center gap-1.5">
                          {p.gamertag}
                          {isMgr && (
                            <span className="rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 px-1 py-0.2 text-[9px] font-bold shrink-0">
                              MGR
                            </span>
                          )}
                        </span>
                        {starterPos ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setCaptainGamertag((prev) =>
                                  prev && prev.toLowerCase() === p.gamertag.toLowerCase()
                                    ? null
                                    : p.gamertag,
                                )
                              }}
                              className={cx(
                                'rounded px-1.5 py-0.5 font-mono text-[10px] font-extrabold transition-colors flex items-center gap-0.5',
                                isCap
                                  ? 'bg-amber-400 text-black border border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                                  : 'bg-[var(--surface-2)] text-[var(--text-faint)] hover:text-amber-400 hover:bg-amber-500/10 border border-transparent',
                              )}
                              title={
                                isCap
                                  ? 'Team Captain (Click to remove captaincy)'
                                  : 'Make Team Captain (C)'
                              }
                            >
                              <span>©</span>
                              <span>{isCap ? 'CAP' : ''}</span>
                            </button>
                            <span className="rounded bg-[var(--accent-tint)] px-2 py-0.5 font-mono text-[10px] font-extrabold text-[var(--accent-text)]">
                              XI: {starterPos}
                            </span>
                          </div>
                        ) : isSub ? (
                          <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                            SUB
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-faint)]">Reserve</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

      </section>

      {/* ---- join requests ---- */}
      {(() => {
        const pendingCount = joinRequests.filter((r) => r.status === 'pending').length
        return (
          <section className={card}>
            <PanelHead
              label="Applications"
              title={pendingCount > 0 ? `Join Requests (${pendingCount} Pending)` : 'Join Requests'}
            />
            {joinRequests.length === 0 ? (
              <EmptyState
                title="No join requests yet"
                hint="When players request to join your club, their applications will appear here."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {joinRequests.map((req) => (
                  <li key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <SmartImage
                        src={req.avatar_local || AVATAR_PLACEHOLDER}
                        fallback={AVATAR_PLACEHOLDER}
                        alt=""
                        wrapperClassName="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-[var(--surface-hover)] border border-[var(--border)]"
                        className="h-full w-full object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/players/${req.slug}`}
                            target="_blank"
                            className="truncate text-sm font-bold text-[var(--text-strong)] hover:text-[var(--accent-text)]"
                          >
                            {req.gamertag}
                          </Link>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {req.current_club_name ? `From ${req.current_club_name}` : 'Free Agent'}
                          </span>
                        </div>
                        {req.message && (
                          <p className="mt-1 text-xs italic text-[var(--text-muted)] line-clamp-2">
                            "{req.message}"
                          </p>
                        )}
                        <span className="text-[10px] text-[var(--text-faint)]">
                          Applied {new Date(req.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {req.status === 'pending' ? (
                        <>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => handleDecideJoinRequest(req.id, 'accept')}
                            className="gap-1 font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                          >
                            ✓ Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => handleDecideJoinRequest(req.id, 'reject')}
                            className="text-red-400 hover:text-red-300 hover:border-red-500/50"
                          >
                            ✕ Decline
                          </Button>
                        </>
                      ) : (
                        <span
                          className={cx(
                            'rounded-lg px-2.5 py-1 text-xs font-semibold capitalize',
                            req.status === 'accepted'
                              ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                              : 'bg-[var(--surface-hover)] text-[var(--text-muted)]',
                          )}
                        >
                          {req.status}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })()}

      {/* ---- squad ---- */}
      <section className={card}>
        <PanelHead
          label="Squad"
          title={myClub?.name ?? 'Your squad'}
          action={
            <Button
              size="sm"
              onClick={() => setShowSignModal(true)}
              className="gap-1.5 font-bold shadow-sm"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Sign a Player
            </Button>
          }
        />
        {!isManagerInSquad && (
          <div className="mb-4 rounded-xl border border-[var(--accent-ring)] bg-[var(--accent-tint)]/40 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚽</span>
                  <span className="text-sm font-bold text-[var(--text-strong)]">
                    Add Yourself to Squad (Playing Captain)
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Club managers have playing privileges! Register your in-game identity to place yourself on your squad roster and be eligible for the Starting XI.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClaimSelf((prev) => !prev)}
                className="adm-btn adm-btn-primary px-3 py-1.5 text-xs font-semibold shrink-0"
              >
                {showClaimSelf ? 'Close' : '⚽ Add Myself to Squad'}
              </button>
            </div>

            {showClaimSelf && (
              <form
                onSubmit={handleClaimSelfPlayer}
                className="mt-3.5 pt-3.5 border-t border-[var(--border)] flex flex-wrap items-end gap-3"
              >
                <div className="flex-1 min-w-[160px] space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                    Your EA ID / Gamertag
                  </label>
                  <input
                    type="text"
                    required
                    value={selfGamertag}
                    onChange={(e) => setSelfGamertag(e.target.value)}
                    placeholder="e.g. Captain_Ace"
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text-strong)]"
                  />
                </div>
                <div className="w-28 space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                    Jersey # (1–99)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={selfShirtNumber}
                    onChange={(e) => setSelfShirtNumber(e.target.value)}
                    placeholder="10"
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-center font-mono text-xs font-bold text-[var(--text-strong)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={selfBusy || !selfGamertag.trim()}
                  className="adm-btn adm-btn-primary h-9 px-4 text-xs font-semibold whitespace-nowrap"
                >
                  {selfBusy ? 'Adding…' : 'Join as Playing Captain'}
                </button>
              </form>
            )}
          </div>
        )}
        {squadList.length === 0 ? (
          <div className="py-6 text-center">
            <EmptyState title="No players signed yet" hint="Search for players and send contract offers to build your roster." />
            <div className="mt-3">
              <Button size="sm" onClick={() => setShowSignModal(true)} className="gap-1.5 font-bold">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                Sign First Player
              </Button>
            </div>
          </div>
        ) : (
          <>
          <ul className="divide-y divide-[var(--border)]">
            {pagedSquad.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <SmartImage
                  src={p.avatar_local || AVATAR_PLACEHOLDER}
                  fallback={AVATAR_PLACEHOLDER}
                  alt=""
                  wrapperClassName="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-[var(--surface-hover)] border border-[var(--border)]"
                  className="h-full w-full object-cover"
                />
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <Link
                    to={`/players/${p.slug}`}
                    className="truncate text-sm font-semibold text-[var(--text-strong)] hover:text-[var(--accent-text)]"
                  >
                    {p.gamertag}
                  </Link>
                  {((user?.playerId === p.id || user?.id === p.user_id) || Boolean(user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase())) && (
                    <span className="shrink-0 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold">
                      👑 Playing Captain
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                    Jersey #
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    defaultValue={p.shirt_number ?? ''}
                    placeholder="—"
                    onBlur={async (e) => {
                      const raw = e.target.value.trim()
                      const nextNum = raw === '' ? null : Number(raw)
                      if (nextNum === (p.shirt_number ?? null)) return
                      try {
                        await updateSquadPlayerShirt(p.id, nextNum)
                        setNotice({ kind: 'ok', text: `Updated jersey number for ${p.gamertag}.` })
                        await loadClub()
                      } catch (err) {
                        setNotice({ kind: 'error', text: msg(err) })
                      }
                    }}
                    className="h-8 w-14 rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-center font-mono text-xs font-bold text-[var(--text-strong)]"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleReleasePlayer(p)}
                    className="ml-1 shrink-0 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition-all duration-150 hover:border-red-500/60 hover:bg-red-500 hover:text-white active:scale-95 disabled:opacity-50"
                    title={(user?.playerId && p.id === user.playerId) || (user?.id && p.user_id === user.id) || (user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()) ? "Leave Squad" : "Release Player"}
                  >
                    {(user?.playerId && p.id === user.playerId) || (user?.id && p.user_id === user.id) || (user?.gamertag && p.gamertag.toLowerCase() === user.gamertag.toLowerCase()) ? "Leave" : "Release"}
                  </button>
                </div>
                {p.pending > 0 && (
                  <span className="rounded-full bg-[var(--accent-tint)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                    Awaiting reply
                  </span>
                )}
              </li>
            ))}
          </ul>

          {squadList.length > squadPageSize && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
              <span>
                Showing {(safeSquadPage - 1) * squadPageSize + 1}–
                {Math.min(safeSquadPage * squadPageSize, squadList.length)} of {squadList.length} players
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeSquadPage <= 1}
                  onClick={() => setSquadPage((p) => Math.max(1, p - 1))}
                >
                  ← Previous
                </Button>
                <span className="px-2 font-mono font-medium">
                  {safeSquadPage} / {totalSquadPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeSquadPage >= totalSquadPages}
                  onClick={() => setSquadPage((p) => Math.min(totalSquadPages, p + 1))}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </>
        )}
      </section>

      {/* ---- recruitment modal ---- */}
      <SignPlayerModal
        open={showSignModal}
        onClose={() => setShowSignModal(false)}
        squadPlayerIds={squadPlayerIds}
        onOfferSent={() => {
          void loadOffers()
        }}
      />

      {/* ---- outbox ---- */}
      <section className={card}>
        <PanelHead label="Outbox" title="Your offers" />
        {offers.length === 0 ? (
          <EmptyState title="No offers yet" hint="Offers you send to players appear here." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pending.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-strong)]">
                    {o.gamertag}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)]">Waiting for a reply</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void onCancel(o.id)}
                >
                  Withdraw
                </Button>
              </li>
            ))}
            {settled.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3 opacity-60">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-strong)]">
                    {o.gamertag}
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {o.status === 'accepted'
                      ? 'Signed'
                      : o.status === 'rejected'
                        ? 'Declined'
                        : 'Withdrawn'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ================================================================= player */

function PlayerPanel() {
  const { refresh } = useAuth()
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [club, setClub] = useState<{ id: number; name: string; slug: string } | null>(null)
  const [shirtNumber, setShirtNumber] = useState<string>('')
  const [offers, setOffers] = useState<Offer[]>([])

  const [playerRequests, setPlayerRequests] = useState<JoinRequest[]>([])

  const loadJoinRequests = useCallback(async () => {
    try {
      const data = await getPlayerJoinRequests()
      setPlayerRequests(data.requests)
    } catch {
      setPlayerRequests([])
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const overview = await playerOverview()
      setClub(overview.club)
      setShirtNumber(overview.player.shirt_number != null ? String(overview.player.shirt_number) : '')
      setOffers((await incomingOffers()).offers)
      await loadJoinRequests()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    }
  }, [loadJoinRequests])

  const onCancelPlayerRequest = async (id: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await cancelJoinRequest(id)
      setNotice({ kind: 'ok', text: 'Join request withdrawn.' })
      await loadJoinRequests()
    } catch (err: unknown) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  const onSaveShirtNumber = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const parsed = shirtNumber.trim() === '' ? null : Number(shirtNumber)
      await updateMyPlayerProfile({ shirtNumber: parsed })
      invalidateLiveClubCache()
      setNotice({ kind: 'ok', text: 'Jersey number updated.' })
      await load()
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onDecide = async (id: number, decision: 'accept' | 'reject') => {
    setBusy(true)
    setNotice(null)
    try {
      await decideOffer(id, decision)
      setNotice({
        kind: 'ok',
        text: decision === 'accept' ? 'Signed. Welcome to your new club.' : 'Offer declined.',
      })
      await Promise.all([load(), refresh()])
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  const onLeave = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await leaveClub()
      setNotice({ kind: 'ok', text: 'You have left the club and are a free agent again.' })
      await Promise.all([load(), refresh()])
    } catch (err) {
      setNotice({ kind: 'error', text: msg(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <Notice {...(notice ?? { kind: 'ok', text: null })} />

      <section className={card}>
        <PanelHead label="Your status" title={club ? club.name : 'Free agent'} />
        <p className={prose}>
          {club ? (
            <>
              You are signed for {club.name}. Membership is not binding — you can leave whenever
              you like, and you will be a free agent again immediately.
            </>
          ) : (
            <>
              You are not signed to a club. Managers can find you in their recruitment search and
              send you an offer.
            </>
          )}
        </p>
        {club && (
          <div className="mt-4 flex flex-wrap gap-2.5">
            <ButtonLink to={`/clubs/${club.slug}`} variant="outline" size="sm">
              View club
            </ButtonLink>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void onLeave()}>
              Leave club
            </Button>
          </div>
        )}

        <form onSubmit={onSaveShirtNumber} className="mt-5 flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Jersey / Shirt Number (1–99)
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={shirtNumber}
              onChange={(e) => setShirtNumber(e.target.value)}
              placeholder="e.g. 10"
              className={cx(field, 'w-32 font-mono font-bold')}
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            Save Number
          </Button>
        </form>
      </section>

      <section className={card}>
        <PanelHead label="Inbox" title="Offers" />
        {offers.length === 0 ? (
          <EmptyState title="No offers waiting" hint="Offers from clubs land here." />
        ) : (
          <ul className="space-y-3">
            {offers.map((o) => (
              <li key={o.id} className="rounded-lg border border-[var(--border)] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text-strong)]">
                      {o.club_name}
                    </p>
                    <p className="text-[12px] text-[var(--text-faint)]">
                      {o.created_at ? new Date(o.created_at.includes('T') ? o.created_at : o.created_at.replace(' ', 'T') + (o.created_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString() : ''}
                    </p>
                  </div>
                </div>
                {o.message && (
                  <p className={`mt-2 ${prose}`}>{o.message}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Button size="sm" disabled={busy} onClick={() => void onDecide(o.id, 'accept')}>
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onDecide(o.id, 'reject')}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- club applications ---- */}
      <section className={card}>
        <div className="flex items-center justify-between pb-1">
          <PanelHead label="Applications" title="Your Club Applications" />
          <ButtonLink to="/clubs" size="sm" variant="outline" className="gap-1.5 font-bold">
            Browse Clubs
          </ButtonLink>
        </div>
        {playerRequests.length === 0 ? (
          <EmptyState
            title="No applications sent"
            hint="You can browse the club list and request to join any club."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {playerRequests.map((r) => (
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <SmartImage
                    src={r.logo_local || r.logo_url || CLUB_PLACEHOLDER}
                    fallback={CLUB_PLACEHOLDER}
                    alt=""
                    wrapperClassName="h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-hover)] border border-[var(--border)]"
                    className="h-full w-full object-cover"
                  />
                  <div className="min-w-0">
                    <Link
                      to={`/clubs/${r.club_slug}`}
                      className="truncate text-sm font-bold text-[var(--text-strong)] hover:text-[var(--accent-text)]"
                    >
                      {r.club_name}
                    </Link>
                    {r.message && (
                      <p className="text-xs italic text-[var(--text-muted)] line-clamp-1">
                        "{r.message}"
                      </p>
                    )}
                    <span className="text-[10px] text-[var(--text-faint)]">
                      Applied {r.created_at ? new Date(r.created_at.includes('T') ? r.created_at : r.created_at.replace(' ', 'T') + (r.created_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span
                    className={cx(
                      'rounded-lg px-2.5 py-1 text-xs font-semibold capitalize',
                      r.status === 'pending'
                        ? 'bg-[var(--accent-tint)] text-[var(--accent-text)] font-bold'
                        : r.status === 'accepted'
                          ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                          : 'bg-[var(--surface-hover)] text-[var(--text-muted)]',
                    )}
                  >
                    {r.status === 'pending' ? 'Pending Review' : r.status}
                  </span>
                  {r.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onCancelPlayerRequest(r.id)}
                      className="text-xs text-[var(--text-muted)] hover:text-red-400"
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* =================================================================== page */

/* ========================================================= orders & receipts */

function OrdersSection() {
  const [orders, setOrders] = useState<UserOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeReceipt, setActiveReceipt] = useState<UserOrder | null>(null)

  useEffect(() => {
    let active = true
    getMyOrders()
      .then((res) => {
        if (active) setOrders(res.orders || [])
      })
      .catch(() => {
        if (active) setOrders([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading || orders.length === 0) return null

  return (
    <section className="mt-8 rounded-card border border-[var(--border-strong)] bg-[var(--surface)] p-4 sm:p-5">
      <PanelHead label="Purchases" title="Payment History & Receipts" />
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
              <div>
                <span className="font-mono text-xs font-bold text-[var(--accent-text)]">{o.order_number}</span>
                <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                  {new Date(o.paid_at || o.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="adm-status-badge status-active text-[10px]">
                  {o.status.toUpperCase()}
                </span>
                <span className="font-mono text-sm font-bold text-[var(--text-strong)]">
                  {o.currency} {Number(o.total_amount).toFixed(2)}
                </span>
              </div>
            </div>

            {o.items && o.items.length > 0 && (
              <ul className="mt-2.5 space-y-1 text-xs text-[var(--text-muted)]">
                {o.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{it.quantity}× {it.name}</span>
                    <span className="font-mono">{o.currency} {(it.amount * it.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveReceipt(o)}
                className="adm-btn adm-btn-secondary px-2.5 py-1 text-xs font-semibold"
              >
                🖨️ View & Print Receipt
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="surface w-full max-w-lg rounded-2xl border border-[var(--border)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">IWVPL Official Receipt</span>
                <p className="font-mono text-sm font-bold text-[var(--accent-text)]">{activeReceipt.order_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="text-lg text-[var(--text-muted)] hover:text-[var(--text-strong)]"
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">Date</span>
                  <p className="text-[var(--text-strong)] font-medium">
                    {new Date(activeReceipt.paid_at || activeReceipt.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-faint)]">Payment Method</span>
                  <p className="text-[var(--text-strong)] font-medium">Stripe Card Payment</p>
                </div>
              </div>

              {activeReceipt.items && (
                <div className="border-t border-[var(--border)] pt-2 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-[var(--text-faint)]">Items</span>
                  {activeReceipt.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between py-1">
                      <span>{it.quantity}× {it.name}</span>
                      <span className="font-mono">{activeReceipt.currency} {(it.amount * it.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-sm font-bold">
                <span>Total Paid</span>
                <span className="font-mono text-[var(--accent-text)]">
                  {activeReceipt.currency} {Number(activeReceipt.total_amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="adm-btn adm-btn-primary px-3 py-1.5 text-xs font-semibold"
              >
                🖨️ Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="adm-btn adm-btn-outline px-3 py-1.5 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const sent = useRef(false)

  // Redirect only after the session has actually resolved, or a signed-in user
  // reloading /dashboard bounces to /login during the one frame where `user` is
  // still null.
  useEffect(() => {
    if (loading || user || sent.current) return
    sent.current = true
    navigate('/login', { replace: true })
  }, [loading, user, navigate])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-5 py-24 sm:px-6 lg:px-8">
        <div className="shimmer h-8 w-56 rounded-lg" />
      </div>
    )
  }

  if (!user) return null

  const isPlayer = user.role === 'player'

  return (
    <div className="page-enter">
      {/* Compact header, not PageHeader. That component is sized for a
          marketing page — a 3.5rem display heading and a lede paragraph — which
          on a screen you use daily is just furniture. A workspace opens with a
          line of text and gets out of the way. */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-end justify-between gap-4 px-5 pb-6 pt-24 sm:px-6 lg:px-8 lg:pt-28">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
            {isPlayer ? 'Player hub' : 'Club management'}
          </p>
          <h1 className="mt-1.5 font-display text-2xl font-bold leading-tight text-[var(--text-strong)] sm:text-3xl">
            {user.name}
          </h1>
        </div>
        <ButtonLink to="/" variant="outline" size="sm">
          Back to site
        </ButtonLink>
      </div>

      <Container size="default" className="pb-20">
        {isPlayer ? <PlayerPanel /> : <ManagerPanel />}
        <OrdersSection />
      </Container>
    </div>
  )
}