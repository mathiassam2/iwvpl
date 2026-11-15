import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  createTotwWeek,
  deleteTotwSlot,
  deleteTotwWeek,
  getAdminClubs,
  getAdminPlayers,
  getAdminUsers,
  getTotwGameWeeks,
  getTotwOverview,
  getTotwSuggestions,
  getTotwWeek,
  saveTotwAccess,
  saveTotwSlot,
  updateTotwWeek,
  type AdminPlayer,
  type AdminUser,
  type Club,
  type TotwAccess,
  type TotwAdminDivision,
  type TotwAdminGameWeek,
  type TotwAdminPlayer,
  type TotwAdminWeekSummary,
  type TotwSuggestion,
} from '../api'
import { compressImageFile, type Guard, type Report } from '../utils'
import { TotwPhotoStudio } from './TotwPhotoStudio'

/** Fixed 4-4-2, in display order: attack, midfield, defence, keeper. */
const ROWS: number[][] = [[0, 1], [2, 3, 4, 5], [6, 7, 8, 9], [10]]
const DEFAULT_POSITIONS = ['ST', 'ST', 'LM', 'CM', 'CM', 'RM', 'LB', 'CB', 'CB', 'RB', 'GK']
const POSITION_OPTIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']

type Photo = string | null | undefined // undefined: unchanged, null: removed, string: new data URL

function PhotoField({
  label,
  hint,
  existingUrl,
  value,
  onChange,
  onError,
  onEdit,
}: {
  label: string
  hint: string
  existingUrl: string | null
  value: Photo
  onChange: (v: Photo) => void
  onError: (msg: string) => void
  onEdit?: () => void
}) {
  const preview = value === undefined ? existingUrl : value
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      // WebP keeps the transparent background that PNG cut-outs rely on.
      onChange(await compressImageFile(file, 1100, 1400, 0.9))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not read that image.')
    }
  }

  return (
    <div className="totw-photo">
      <div className="totw-photo__head">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <div className="totw-photo__stage">
        {preview ? (
          <img src={preview} alt={`${label} preview`} />
        ) : (
          <span className="totw-photo__empty">No image</span>
        )}
      </div>
      <div className="adm-row-actions">
        <label className="adm-btn adm-btn-secondary adm-btn-sm" style={{ cursor: 'pointer' }}>
          {preview ? 'Replace' : 'Upload'}
          <input type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={pick} />
        </label>
        {preview && onEdit && (
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={onEdit}>
            ✂ Reposition
          </button>
        )}
        {preview && (
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

export function TotwView({ guard, report }: { guard: Guard; report: Report }) {
  const [weeks, setWeeks] = useState<TotwAdminWeekSummary[]>([])
  const [divisions, setDivisions] = useState<TotwAdminDivision[]>([])
  const [divisionFilter, setDivisionFilter] = useState<'all' | number>('all')
  const [access, setAccess] = useState<TotwAccess>({ mode: 'selected', userIds: [] })
  const [weekId, setWeekId] = useState<number | null>(null)
  const [week, setWeek] = useState<{
    id: number
    label: string
    status: 'draft' | 'published'
    divisionId: number | null
    gameWeek: number | null
  } | null>(null)
  const [players, setPlayers] = useState<TotwAdminPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Create week modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newDivisionId, setNewDivisionId] = useState<number | null>(null)
  const [newGameWeek, setNewGameWeek] = useState<number | ''>('')
  const [newLabel, setNewLabel] = useState('')
  const [availableGameWeeks, setAvailableGameWeeks] = useState<TotwAdminGameWeek[]>([])
  const [loadingGameWeeks, setLoadingGameWeeks] = useState(false)

  // Suggestions state for slot editor
  const [suggestions, setSuggestions] = useState<TotwSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null)

  const [labelDraft, setLabelDraft] = useState('')
  const [clubs, setClubs] = useState<Club[]>([])
  const [pool, setPool] = useState<AdminPlayer[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [accessDraft, setAccessDraft] = useState<TotwAccess>({ mode: 'selected', userIds: [] })

  // Slot editor
  const [slot, setSlot] = useState<number | null>(null)
  const [fName, setFName] = useState('')
  const [fNumber, setFNumber] = useState('')
  const [fPosition, setFPosition] = useState('')
  const [fClub, setFClub] = useState('')
  const [fClubId, setFClubId] = useState<number | null>(null)
  const [fPlayerId, setFPlayerId] = useState<number | null>(null)
  const [fCandid, setFCandid] = useState<Photo>(undefined)
  const [studioOpen, setStudioOpen] = useState(false)
  const [lookup, setLookup] = useState('')
  const [formError, setFormError] = useState('')

  const bySlot = useMemo(() => new Map(players.map((p) => [p.slot, p])), [players])
  const editing = slot === null ? undefined : bySlot.get(slot)

  const loadOverview = useCallback(async () => {
    const o = await guard(getTotwOverview, 'Could not load Team of the Week')
    setWeeks(o.weeks)
    setDivisions(o.divisions ?? [])
    setAccess(o.access)
    setAccessDraft(o.access)
    return o
  }, [guard])

  const loadWeek = useCallback(
    async (id: number) => {
      const r = await guard(() => getTotwWeek(id), 'Could not load that week')
      setWeek({
        id: r.week.id,
        label: r.week.label,
        status: r.week.status,
        divisionId: r.week.divisionId ?? null,
        gameWeek: r.week.gameWeek ?? null,
      })
      setLabelDraft(r.week.label)
      setPlayers(r.players)
    },
    [guard],
  )

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [o, clubList, playerList, userList] = await Promise.all([
          loadOverview(),
          guard(() => getAdminClubs(), 'Could not load clubs'),
          guard(getAdminPlayers, 'Could not load league players'),
          guard(getAdminUsers, 'Could not load accounts'),
        ])
        if (!live) return
        setClubs(clubList)
        setPool(playerList)
        setUsers(userList)
        if (o.weeks[0]) setWeekId(o.weeks[0].id)
      } catch {
        /* reported */
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
    }
  }, [guard, loadOverview])

  useEffect(() => {
    if (weekId === null) {
      setWeek(null)
      setPlayers([])
      return
    }
    void loadWeek(weekId).catch(() => undefined)
  }, [weekId, loadWeek])

  /* ------------------------------------------------------------- weeks */

  const openCreateModal = () => {
    const defaultDiv = divisionFilter !== 'all' ? divisionFilter : (divisions[0]?.id ?? null)
    setNewDivisionId(defaultDiv)
    setNewGameWeek('')
    setNewLabel('')
    setAvailableGameWeeks([])
    setCreateModalOpen(true)
    if (defaultDiv) {
      void loadGameWeeksForDivision(defaultDiv)
    }
  }

  const loadGameWeeksForDivision = async (divId: number) => {
    setLoadingGameWeeks(true)
    try {
      const gws = await guard(() => getTotwGameWeeks(divId), 'Could not load game weeks')
      setAvailableGameWeeks(gws ?? [])
      if (gws && gws.length > 0) {
        const existingGws = new Set(weeks.filter((w) => w.divisionId === divId).map((w) => w.gameWeek))
        const nextGw = gws.find((gw) => !existingGws.has(gw.gameWeek)) ?? gws[gws.length - 1]
        if (nextGw) {
          setNewGameWeek(nextGw.gameWeek)
          setNewLabel(`Game Week ${nextGw.gameWeek}`)
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingGameWeeks(false)
    }
  }

  const handleDivisionChangeInModal = (divId: number) => {
    setNewDivisionId(divId)
    setNewGameWeek('')
    setNewLabel('')
    void loadGameWeeksForDivision(divId)
  }

  const handleGameWeekChangeInModal = (gw: number) => {
    setNewGameWeek(gw)
    setNewLabel(`Game Week ${gw}`)
  }

  const handleCreateWeek = async (e: FormEvent) => {
    e.preventDefault()
    if (!newDivisionId) return report('error', 'Select a division.')
    if (newGameWeek === '' || Number(newGameWeek) <= 0) return report('error', 'Select or enter a game week.')
    setBusy(true)
    try {
      const id = await guard(
        () =>
          createTotwWeek({
            divisionId: newDivisionId,
            gameWeek: Number(newGameWeek),
            label: newLabel.trim() || `Game Week ${newGameWeek}`,
          }),
        'Could not create the week',
      )
      setCreateModalOpen(false)
      await loadOverview()
      setWeekId(id)
      report('ok', `Created ${newLabel.trim() || `Game Week ${newGameWeek}`}. Fill in the XI, then publish it.`)
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const addWeek = openCreateModal

  const renameWeek = async () => {
    if (!week || labelDraft.trim() === week.label) return
    if (!labelDraft.trim()) {
      setLabelDraft(week.label)
      return
    }
    try {
      await guard(() => updateTotwWeek(week.id, { label: labelDraft.trim() }), 'Could not rename the week')
      await Promise.all([loadOverview(), loadWeek(week.id)])
    } catch {
      setLabelDraft(week.label)
    }
  }

  const setStatus = async (status: 'draft' | 'published') => {
    if (!week) return
    setBusy(true)
    try {
      await guard(() => updateTotwWeek(week.id, { status }), 'Could not change the status')
      await Promise.all([loadOverview(), loadWeek(week.id)])
      report('ok', status === 'published' ? `${week.label} is live.` : `${week.label} is back to draft.`)
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const removeWeek = async () => {
    if (!week || !window.confirm(`Delete "${week.label}" and all its players and photos?`)) return
    setBusy(true)
    try {
      await guard(() => deleteTotwWeek(week.id), 'Could not delete the week')
      const o = await loadOverview()
      setWeekId(o.weeks[0]?.id ?? null)
      report('ok', 'Week deleted.')
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  /* ------------------------------------------------------------ access */

  const toggleUser = (id: number) =>
    setAccessDraft((a) => ({
      ...a,
      userIds: a.userIds.includes(id) ? a.userIds.filter((x) => x !== id) : [...a.userIds, id],
    }))

  const accessDirty =
    accessDraft.mode !== access.mode ||
    accessDraft.userIds.length !== access.userIds.length ||
    accessDraft.userIds.some((id) => !access.userIds.includes(id))

  const saveAccess = async () => {
    setBusy(true)
    try {
      const saved = await guard(() => saveTotwAccess(accessDraft), 'Could not save access')
      setAccess(saved)
      setAccessDraft(saved)
      report('ok', saved.mode === 'all' ? 'Everyone can now view Team of the Week.' : `Team of the Week is limited to ${saved.userIds.length} account(s).`)
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const visibleUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    const list = q
      ? users.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            (u.display_name ?? '').toLowerCase().includes(q) ||
            (u.gamertag ?? '').toLowerCase().includes(q),
        )
      : users
    return list.slice(0, 60)
  }, [users, userSearch])

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  /* ------------------------------------------------------------- slots */

  const openSlot = (index: number) => {
    const p = bySlot.get(index)
    setSlot(index)
    setFName(p?.name ?? '')
    setFNumber(p?.shirtNumber != null ? String(p.shirtNumber) : '')
    setFPosition(p?.position ?? DEFAULT_POSITIONS[index])
    setFClub(p?.clubName ?? '')
    setFClubId(p?.clubId ?? null)
    setFPlayerId(p?.playerId ?? null)
    setFCandid(undefined)
    setLookup('')
    setSuggestions([])
    setSuggestionReason(null)

    if (week && week.divisionId != null && week.gameWeek != null) {
      setLoadingSuggestions(true)
      getTotwSuggestions({
        weekId: week.id,
        slot: index,
        divisionId: week.divisionId,
        gameWeek: week.gameWeek,
      })
        .then((res) => {
          setSuggestions(res.candidates ?? [])
          setSuggestionReason(res.reason ?? null)
        })
        .catch(() => {
          setSuggestions([])
        })
        .finally(() => {
          setLoadingSuggestions(false)
        })
    }
    setFormError('')

  }

  const lookupResults = useMemo(() => {
    const q = lookup.trim().toLowerCase()
    if (q.length < 1) return []
    return pool
      .filter((p) => p.gamertag.toLowerCase().includes(q) || (p.club_name ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [pool, lookup])

  const autofill = (p: AdminPlayer) => {
    setFName(p.gamertag)
    setFNumber(p.shirt_number != null ? String(p.shirt_number) : '')
    setFClub(p.club_name ?? '')
    setFClubId(p.club_id)
    setFPlayerId(p.id)
    setLookup('')
  }

  const pickSuggestion = (s: TotwSuggestion) => {
    setFName(s.gamertag)
    setFPosition(s.position)
    setFClub(s.clubName ?? '')
    setFClubId(s.clubId)
    setFPlayerId(s.playerId)
    const poolPlayer = pool.find((p) => p.id === s.playerId)
    if (poolPlayer?.shirt_number != null) {
      setFNumber(String(poolPlayer.shirt_number))
    }
    if (s.avatarUrl && !fCandid && !editing?.candidUrl) {
      setFCandid(s.avatarUrl)
    }
  }

  const onClubInput = (value: string) => {
    setFClub(value)
    const match = clubs.find((c) => c.name.toLowerCase() === value.trim().toLowerCase())
    setFClubId(match ? match.id : null)
  }

  const selectedClub = useMemo(() => {
    if (fClubId) return clubs.find((c) => c.id === fClubId) ?? null
    if (fClub.trim()) return clubs.find((c) => c.name.toLowerCase() === fClub.trim().toLowerCase()) ?? null
    return null
  }, [clubs, fClubId, fClub])

  const hasCandid = fCandid === undefined ? Boolean(editing?.candidUrl ?? editing?.closeUrl) : fCandid !== null

  const submitSlot = async (e: FormEvent) => {
    e.preventDefault()
    if (!week || slot === null) return
    if (!fName.trim()) return setFormError('Enter the player name.')
    if (!fPosition.trim()) return setFormError('Enter a position.')
    if (!hasCandid && fPlayerId == null) return setFormError('Upload a photo for this player.')
    setFormError('')

    setBusy(true)
    try {
      await guard(
        () =>
          saveTotwSlot(week.id, slot, {
            name: fName.trim(),
            shirtNumber: fNumber.trim() === '' ? null : Number(fNumber),
            position: fPosition.trim(),
            clubId: fClubId,
            clubName: fClub.trim() || null,
            playerId: fPlayerId,
            photoClose: null,
            photoCandid: fCandid,
          }),
        'Could not save this player',
      )
      await Promise.all([loadWeek(week.id), loadOverview()])
      setSlot(null)
      report('ok', `Saved ${fName.trim()}.`)
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const clearSlot = async () => {
    if (!week || slot === null || !editing) return
    if (!window.confirm(`Remove ${editing.name} from this week?`)) return
    setBusy(true)
    try {
      await guard(() => deleteTotwSlot(week.id, slot), 'Could not remove the player')
      await Promise.all([loadWeek(week.id), loadOverview()])
      setSlot(null)
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const filteredWeeks = useMemo(() => {
    if (divisionFilter === 'all') return weeks
    return weeks.filter((w) => w.divisionId === divisionFilter)
  }, [weeks, divisionFilter])

  /* ------------------------------------------------------------ render */

  if (loading) return <div className="adm-empty">Loading Team of the Week…</div>

  const filled = players.length

  return (
    <div className="adm-stack">
      {/* Week bar */}
      <section className="adm-card totw-bar">
        <div className="totw-bar__main">
          {divisions.length > 0 && (
            <label className="adm-field" style={{ minWidth: 190 }}>
              <span>Division</span>
              <select
                className="adm-select"
                value={divisionFilter}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? 'all' : Number(e.target.value)
                  setDivisionFilter(val)
                  if (val !== 'all') {
                    const match = weeks.find((w) => w.divisionId === val)
                    if (match) setWeekId(match.id)
                  }
                }}
              >
                <option value="all">All Divisions ({weeks.length})</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({weeks.filter((w) => w.divisionId === d.id).length})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="adm-field" style={{ minWidth: 220 }}>
            <span>Week</span>
            <select
              className="adm-select"
              value={weekId ?? ''}
              onChange={(e) => setWeekId(e.target.value ? Number(e.target.value) : null)}
              disabled={weeks.length === 0}
            >
              {weeks.length === 0 && <option value="">No weeks yet</option>}
              {filteredWeeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {(w.divisionName ? w.divisionName + ' · ' : '') + w.label} · {w.status === 'published' ? 'Live' : 'Draft'} · {w.playerCount}/11
                </option>
              ))}
            </select>
          </label>
          {week && (
            <label className="adm-field" style={{ minWidth: 220, flex: 1 }}>
              <span>Title shown on the site</span>
              <input
                className="adm-input"
                value={labelDraft}
                maxLength={120}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={() => void renameWeek()}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), undefined)}
              />
            </label>
          )}
        </div>
        <div className="adm-row-actions">
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => void addWeek()} disabled={busy}>
            + New week
          </button>
          {week && (
            <>
              <span className={`totw-status ${week.status === 'published' ? 'is-live' : ''}`}>
                {week.status === 'published' ? 'Live' : 'Draft'} · {filled}/11
              </span>
              {week.status === 'published' ? (
                <button type="button" className="adm-btn adm-btn-secondary" onClick={() => void setStatus('draft')} disabled={busy}>
                  Unpublish
                </button>
              ) : (
                <button
                  type="button"
                  className="adm-btn adm-btn-success"
                  onClick={() => {
                    if (filled < 11 && !window.confirm(`Only ${filled} of 11 players are set. Publish anyway?`)) return
                    void setStatus('published')
                  }}
                  disabled={busy || filled === 0}
                >
                  Publish
                </button>
              )}
              <button type="button" className="adm-btn adm-btn-danger" onClick={() => void removeWeek()} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>
      </section>

      {/* Access */}
      <section className="adm-card">
        <div className="totw-access__head">
          <div>
            <h3 style={{ margin: 0 }}>Who can see the page</h3>
            <p className="adm-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              While this is in testing, limit it to chosen accounts. The menu item is hidden for everyone else. Owner and
              admin accounts can always see it.
            </p>
          </div>
          <div className="adm-radio-toggle-group" style={{ margin: 0, minWidth: 260 }}>
            <button
              type="button"
              className={`adm-radio-toggle-btn ${accessDraft.mode === 'selected' ? 'is-active' : ''}`}
              onClick={() => setAccessDraft((a) => ({ ...a, mode: 'selected' }))}
            >
              Selected accounts
            </button>
            <button
              type="button"
              className={`adm-radio-toggle-btn ${accessDraft.mode === 'all' ? 'is-active' : ''}`}
              onClick={() => setAccessDraft((a) => ({ ...a, mode: 'all' }))}
            >
              Everyone
            </button>
          </div>
        </div>

        {accessDraft.mode === 'selected' && (
          <div className="totw-access__body">
            <div className="totw-chips">
              {accessDraft.userIds.length === 0 && (
                <span className="adm-text-muted" style={{ fontSize: 13 }}>
                  Nobody selected yet, so only owner/admin accounts can see it.
                </span>
              )}
              {accessDraft.userIds.map((id) => {
                const u = userById.get(id)
                return (
                  <button type="button" key={id} className="totw-chip" onClick={() => toggleUser(id)} title="Remove">
                    {u?.gamertag || u?.display_name || u?.email || `Account #${id}`} <span aria-hidden>×</span>
                  </button>
                )
              })}
            </div>
            <input
              className="adm-input"
              type="search"
              placeholder="Search accounts by gamertag, name or email…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            <div className="totw-userlist">
              {visibleUsers.map((u) => {
                const on = accessDraft.userIds.includes(u.id)
                return (
                  <label key={u.id} className={`totw-user ${on ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleUser(u.id)} />
                    <span>
                      <strong>{u.gamertag || u.display_name || 'Unnamed'}</strong>
                      <small>{u.email}</small>
                    </span>
                  </label>
                )
              })}
              {visibleUsers.length === 0 && <div className="adm-empty">No accounts match.</div>}
            </div>
          </div>
        )}

        <div className="adm-row-actions" style={{ marginTop: 14 }}>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => void saveAccess()} disabled={busy || !accessDirty}>
            Save access
          </button>
          {accessDirty && <span className="adm-text-muted">Unsaved changes</span>}
        </div>
      </section>

      {/* Formation board */}
      {week ? (
        <section className="adm-card">
          <div className="totw-board__head">
            <h3 style={{ margin: 0 }}>Starting XI · 4-4-2</h3>
            <span className="adm-text-muted" style={{ fontSize: 13 }}>
              Click a position to add or edit a player.
            </span>
          </div>
          <div className="totw-pitch">
            {ROWS.map((row, ri) => (
              <div key={ri} className="totw-pitch__row" style={{ ['--cols' as string]: row.length }}>
                {row.map((index) => {
                  const p = bySlot.get(index)
                  const thumb = p?.candidUrl ?? p?.closeUrl
                  return (
                    <button
                      type="button"
                      key={index}
                      className={`totw-slot ${p ? 'is-filled' : ''}`}
                      onClick={() => openSlot(index)}
                    >
                      <span className="totw-slot__pos">{p?.position ?? DEFAULT_POSITIONS[index]}</span>
                      {thumb ? (
                        <img src={thumb} alt="" className="totw-slot__img" />
                      ) : (
                        <span className="totw-slot__plus" aria-hidden>
                          +
                        </span>
                      )}
                      {p ? (
                        <span className="totw-slot__meta">
                          <b>{p.shirtNumber ?? '–'}</b>
                          <i>{p.name}</i>
                          {p.clubLogo && (
                            <img
                              src={p.clubLogo}
                              alt=""
                              style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%', margin: '2px auto 0' }}
                            />
                          )}
                        </span>
                      ) : (
                        <span className="totw-slot__meta totw-slot__meta--empty">Add player</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="adm-card">
          <div className="adm-empty">Create a week to start building the Team of the Week.</div>
        </section>
      )}

      {/* Slot editor */}
      {slot !== null && (
        <div className="adm-drawer-backdrop" onClick={() => setSlot(null)}>
          <aside className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <div>
                <span className="adm-eyebrow">TEAM OF THE WEEK</span>
                <h3>{editing ? `Edit ${editing.name}` : `Add ${DEFAULT_POSITIONS[slot]}`}</h3>
              </div>
              <button type="button" className="adm-close-btn" onClick={() => setSlot(null)}>
                ×
              </button>
            </div>
            <div className="adm-drawer-body">
              <form onSubmit={submitSlot} className="adm-form-stack">
                {/* Suggestions for this slot / game week */}
                <div className="adm-drawer-section">
                  <div className="adm-drawer-section-title">
                    <span>
                      Top Performers
                      {week?.divisionId ? ' · ' + (divisions.find((d) => d.id === week.divisionId)?.name ?? '') : ''}
                      {week?.gameWeek != null ? ' GW ' + week.gameWeek : ''}
                    </span>
                  </div>
                  {loadingSuggestions ? (
                    <p className="adm-text-muted" style={{ fontSize: 12 }}>Loading match ratings for this slot…</p>
                  ) : suggestions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                      {suggestions.map((s) => (
                        <button
                          type="button"
                          key={s.playerId}
                          onClick={() => pickSuggestion(s)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            background: fPlayerId === s.playerId ? 'rgba(200,255,61,0.15)' : 'rgba(255,255,255,0.03)',
                            border: '1px solid ' + (fPlayerId === s.playerId ? 'var(--accent)' : 'rgba(255,255,255,0.08)'),
                            borderRadius: 8,
                            cursor: 'pointer',
                            textAlign: 'left',
                            color: '#fff',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {s.clubLogo && (
                              <img src={s.clubLogo} alt="" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }} />
                            )}
                            <div style={{ minWidth: 0 }}>
                              <strong style={{ display: 'block', fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {s.gamertag}
                              </strong>
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                                {s.position} · {s.clubName ?? 'Free Agent'}
                                {s.goals > 0 ? ' · ⚽ ' + s.goals : ''}
                                {s.assists > 0 ? ' · 🎯 ' + s.assists : ''}
                                {s.mom > 0 ? ' · 🏆 MoM' : ''}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {s.picked && (
                              <span style={{ fontSize: 9.5, padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: 4, color: 'rgba(255,255,255,0.7)' }}>
                                Picked
                              </span>
                            )}
                            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--accent)', background: 'rgba(200,255,61,0.1)', padding: '2px 7px', borderRadius: 6 }}>
                              ★ {s.rating.toFixed(1)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="adm-text-muted" style={{ fontSize: 12, margin: 0 }}>
                      {suggestionReason || 'No match ratings recorded for this game week yet.'}
                    </p>
                  )}
                </div>
                <div className="adm-drawer-section">
                  <div className="adm-drawer-section-title">
                    <span>Autofill from a registered player</span>
                  </div>
                  <input
                    className="adm-input"
                    type="search"
                    placeholder="Search gamertag or club…"
                    value={lookup}
                    onChange={(e) => setLookup(e.target.value)}
                  />
                  {lookupResults.length > 0 && (
                    <div className="totw-lookup">
                      {lookupResults.map((p) => (
                        <button type="button" key={p.id} onClick={() => autofill(p)}>
                          <strong>{p.gamertag}</strong>
                          <small>
                            {p.club_name ?? 'Free agent'}
                            {p.shirt_number != null ? ` · #${p.shirt_number}` : ''}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="adm-text-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                    Fills name, number and club. Everything below can still be edited by hand.
                  </p>
                </div>

                <label className="adm-field">
                  <span>Player name *</span>
                  <input className="adm-input" value={fName} maxLength={120} onChange={(e) => setFName(e.target.value)} />
                </label>
                <div className="adm-field-grid">
                  <label className="adm-field">
                    <span>Shirt number</span>
                    <input
                      className="adm-input"
                      type="number"
                      min={0}
                      max={99}
                      value={fNumber}
                      onChange={(e) => setFNumber(e.target.value)}
                    />
                  </label>
                  <label className="adm-field">
                    <span>Position *</span>
                    <input
                      className="adm-input"
                      list="totw-positions"
                      value={fPosition}
                      maxLength={16}
                      onChange={(e) => setFPosition(e.target.value.toUpperCase())}
                    />
                    <datalist id="totw-positions">
                      {POSITION_OPTIONS.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </label>
                </div>
                <label className="adm-field">
                  <span>Club (revealed on hover)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {(selectedClub?.logo_local || selectedClub?.logo_url) && (
                      <img
                        src={selectedClub.logo_local || selectedClub.logo_url || ''}
                        alt=""
                        style={{
                          width: 32,
                          height: 32,
                          objectFit: 'contain',
                          borderRadius: 6,
                          background: 'rgba(255,255,255,0.06)',
                          padding: 2,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <input
                      className="adm-input"
                      style={{ flex: 1 }}
                      list="totw-clubs"
                      value={fClub}
                      maxLength={160}
                      onChange={(e) => onClubInput(e.target.value)}
                      placeholder="Pick a club or type any name"
                    />
                  </div>
                  <datalist id="totw-clubs">
                    {clubs.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </label>

                <PhotoField
                  label="Card photo"
                  hint="The card's backdrop. Drag it to frame the player."
                  existingUrl={editing?.candidUrl ?? editing?.closeUrl ?? null}
                  value={fCandid}
                  onChange={(img) => {
                    setFCandid(img)
                    if (img) setStudioOpen(true)
                  }}
                  onError={setFormError}
                  onEdit={() => setStudioOpen(true)}
                />
                <p className="adm-text-muted" style={{ fontSize: 12, margin: 0 }}>
                  A photo is required unless the player is picked from the league list, in which case
                  their own avatar stands in.
                </p>

                {formError && (
                  <p role="alert" style={{ color: 'var(--danger, #ff8888)', fontSize: 13, margin: 0 }}>
                    {formError}
                  </p>
                )}

                <div className="adm-row-actions">
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : 'Save player'}
                  </button>
                  {editing && (
                    <button type="button" className="adm-btn adm-btn-danger" disabled={busy} onClick={() => void clearSlot()}>
                      Remove from XI
                    </button>
                  )}
                </div>
              </form>
            </div>
          </aside>
        </div>
      )}

      {createModalOpen && (
        <div className="adm-modal-backdrop" onClick={() => setCreateModalOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="adm-modal-head">
              <h3>Create Team of the Week</h3>
              <button type="button" className="adm-close-btn" onClick={() => setCreateModalOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateWeek} className="adm-modal-body adm-form-stack" style={{ padding: 20 }}>
              <label className="adm-field">
                <span>Division *</span>
                <select
                  className="adm-select"
                  value={newDivisionId ?? ''}
                  onChange={(e) => handleDivisionChangeInModal(Number(e.target.value))}
                  required
                >
                  <option value="" disabled>Select Division</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.seasonName})
                    </option>
                  ))}
                </select>
              </label>

              <label className="adm-field">
                <span>Game Week *</span>
                {loadingGameWeeks ? (
                  <div className="adm-input" style={{ opacity: 0.6 }}>Loading game weeks…</div>
                ) : availableGameWeeks.length > 0 ? (
                  <select
                    className="adm-select"
                    value={newGameWeek}
                    onChange={(e) => handleGameWeekChangeInModal(Number(e.target.value))}
                    required
                  >
                    <option value="" disabled>Select Game Week</option>
                    {availableGameWeeks.map((gw) => (
                      <option key={gw.gameWeek} value={gw.gameWeek}>
                        Game Week {gw.gameWeek} ({gw.played}/{gw.matches} played{gw.statRows > 0 ? ', ' + gw.statRows + ' stats' : ''})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={1}
                    max={99}
                    className="adm-input"
                    placeholder="e.g. 1"
                    value={newGameWeek}
                    onChange={(e) => handleGameWeekChangeInModal(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                )}
              </label>

              <label className="adm-field">
                <span>Display Title *</span>
                <input
                  className="adm-input"
                  value={newLabel}
                  placeholder={'Game Week ' + (newGameWeek || 1)}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <small className="adm-text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Shown on the site and downloads. Defaults to Game Week {newGameWeek || 1}.
                </small>
              </label>

              <div className="adm-modal-foot" style={{ marginTop: 14, padding: 0 }}>
                <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !newDivisionId || newGameWeek === ''}>
                  {busy ? 'Creating…' : 'Create Team of the Week'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TotwPhotoStudio
        isOpen={studioOpen}
        slot={slot}
        gamertag={fName.trim() || 'Player'}
        clubName={fClub.trim() || undefined}
        clubFlag={selectedClub?.flag ?? undefined}
        shirtNumber={fNumber.trim() === '' ? null : Number(fNumber)}
        position={fPosition.trim() || undefined}
        clubLogo={selectedClub?.logo_local || selectedClub?.logo_url || null}
        initialImage={fCandid === undefined ? editing?.candidUrl ?? editing?.closeUrl ?? null : fCandid}
        onClose={() => setStudioOpen(false)}
        onApply={(dataUrl) => setFCandid(dataUrl)}
        onRemove={() => setFCandid(null)}
      />
    </div>
  )
}
