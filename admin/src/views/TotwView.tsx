import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  createTotwWeek,
  deleteTotwSlot,
  deleteTotwWeek,
  getAdminClubs,
  getAdminPlayers,
  getAdminUsers,
  getTotwOverview,
  getTotwWeek,
  saveTotwAccess,
  saveTotwSlot,
  updateTotwWeek,
  type AdminPlayer,
  type AdminUser,
  type Club,
  type TotwAccess,
  type TotwAdminPlayer,
  type TotwAdminWeekSummary,
} from '../api'
import { compressImageFile, type Guard, type Report } from '../utils'

/** Fixed 4-3-3, in display order: attack, midfield, defence, keeper. */
const ROWS: number[][] = [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9], [10]]
const DEFAULT_POSITIONS = ['LW', 'ST', 'RW', 'CM', 'CDM', 'CM', 'LB', 'CB', 'CB', 'RB', 'GK']
const POSITION_OPTIONS = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']

type Photo = string | null | undefined // undefined: unchanged, null: removed, string: new data URL

function PhotoField({
  label,
  hint,
  existingUrl,
  value,
  onChange,
  onError,
}: {
  label: string
  hint: string
  existingUrl: string | null
  value: Photo
  onChange: (v: Photo) => void
  onError: (msg: string) => void
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
  const [access, setAccess] = useState<TotwAccess>({ mode: 'selected', userIds: [] })
  const [weekId, setWeekId] = useState<number | null>(null)
  const [week, setWeek] = useState<{ id: number; label: string; status: 'draft' | 'published' } | null>(null)
  const [players, setPlayers] = useState<TotwAdminPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

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
  const [fClose, setFClose] = useState<Photo>(undefined)
  const [fCandid, setFCandid] = useState<Photo>(undefined)
  const [lookup, setLookup] = useState('')
  const [formError, setFormError] = useState('')

  const bySlot = useMemo(() => new Map(players.map((p) => [p.slot, p])), [players])
  const editing = slot === null ? undefined : bySlot.get(slot)

  const loadOverview = useCallback(async () => {
    const o = await guard(getTotwOverview, 'Could not load Team of the Week')
    setWeeks(o.weeks)
    setAccess(o.access)
    setAccessDraft(o.access)
    return o
  }, [guard])

  const loadWeek = useCallback(
    async (id: number) => {
      const r = await guard(() => getTotwWeek(id), 'Could not load that week')
      setWeek({ id: r.week.id, label: r.week.label, status: r.week.status })
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

  const addWeek = async () => {
    const label = window.prompt('Name this week (e.g. "Matchweek 12"):')?.trim()
    if (!label) return
    setBusy(true)
    try {
      const id = await guard(() => createTotwWeek(label), 'Could not create the week')
      await loadOverview()
      setWeekId(id)
      report('ok', `Created ${label}. Fill in the XI, then publish it.`)
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

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
    setFClose(undefined)
    setFCandid(undefined)
    setLookup('')
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

  const onClubInput = (value: string) => {
    setFClub(value)
    const match = clubs.find((c) => c.name.toLowerCase() === value.trim().toLowerCase())
    setFClubId(match ? match.id : null)
  }

  const hasClose = fClose === undefined ? Boolean(editing?.closeUrl) : fClose !== null
  const hasCandid = fCandid === undefined ? Boolean(editing?.candidUrl) : fCandid !== null

  const submitSlot = async (e: FormEvent) => {
    e.preventDefault()
    if (!week || slot === null) return
    if (!fName.trim()) return setFormError('Enter the player name.')
    if (!fPosition.trim()) return setFormError('Enter a position.')
    if (!hasClose && !hasCandid) return setFormError('Upload at least one photo.')
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
            photoClose: fClose,
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

  /* ------------------------------------------------------------ render */

  if (loading) return <div className="adm-empty">Loading Team of the Week…</div>

  const filled = players.length

  return (
    <div className="adm-stack">
      {/* Week bar */}
      <section className="adm-card totw-bar">
        <div className="totw-bar__main">
          <label className="adm-field" style={{ minWidth: 220 }}>
            <span>Week</span>
            <select
              className="adm-select"
              value={weekId ?? ''}
              onChange={(e) => setWeekId(e.target.value ? Number(e.target.value) : null)}
              disabled={weeks.length === 0}
            >
              {weeks.length === 0 && <option value="">No weeks yet</option>}
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label} · {w.status === 'published' ? 'Live' : 'Draft'} · {w.playerCount}/11
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
            <h3 style={{ margin: 0 }}>Starting XI · 4-3-3</h3>
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
                  <input
                    className="adm-input"
                    list="totw-clubs"
                    value={fClub}
                    maxLength={160}
                    onChange={(e) => onClubInput(e.target.value)}
                    placeholder="Pick a club or type any name"
                  />
                  <datalist id="totw-clubs">
                    {clubs.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </label>

                <PhotoField
                  label="Close-up (side profile)"
                  hint="Large, shown behind. Transparent background works best."
                  existingUrl={editing?.closeUrl ?? null}
                  value={fClose}
                  onChange={setFClose}
                  onError={setFormError}
                />
                <PhotoField
                  label="Candid / celebration"
                  hint="Smaller, shown in front. Transparent background works best."
                  existingUrl={editing?.candidUrl ?? null}
                  value={fCandid}
                  onChange={setFCandid}
                  onError={setFormError}
                />
                <p className="adm-text-muted" style={{ fontSize: 12, margin: 0 }}>
                  At least one photo is required. With only one, it is shown on its own.
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
    </div>
  )
}
