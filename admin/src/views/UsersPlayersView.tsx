import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
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

type SubView = 'accounts' | 'players'

export function UsersPlayersView({
  guard,
  report,
  initialSub,
}: {
  guard: Guard
  report: Report
  initialSub?: string
}) {
  const [subView, setSubView] = useState<SubView>(() =>
    initialSub === 'players' ? 'players' : 'accounts',
  )
  const [users, setUsers] = useState<AdminUser[]>([])
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const hasLoadedRef = useRef(false)

  // Filters
  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerFilter, setPlayerFilter] = useState<'all' | 'signed' | 'free' | 'linked'>('all')

  // Pagination
  const [userPage, setUserPage] = useState(1)
  const userPageSize = 15
  const [playerPage, setPlayerPage] = useState(1)
  const playerPageSize = 20

  // Account Drawer (Create or Edit)
  const [userDrawerOpen, setUserDrawerOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [uEmail, setUEmail] = useState('')
  const [uPassword, setUPassword] = useState('')
  const [uName, setUName] = useState('')
  const [uRole, setURole] = useState<UserRole>('club_manager')
  const [uClubId, setUClubId] = useState<string>('')
  const [uGamertag, setUGamertag] = useState('')
  const [uActive, setUActive] = useState(true)

  // Player Drawer (Create or Edit)
  const [playerDrawerOpen, setPlayerDrawerOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<AdminPlayer | null>(null)
  const [pGamertag, setPGamertag] = useState('')
  const [pClubId, setPClubId] = useState<string>('')
  const [pShirtNumber, setPShirtNumber] = useState<string>('')

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

  const openCreateUser = () => {
    setEditingUser(null)
    setUEmail('')
    setUPassword('')
    setUName('')
    setURole('club_manager')
    setUClubId('')
    setUGamertag('')
    setUActive(true)
    setUserDrawerOpen(true)
  }

  const openEditUser = (u: AdminUser) => {
    setEditingUser(u)
    setUEmail(u.email)
    setUPassword('')
    setUName(u.display_name ?? '')
    setURole(u.role)
    setUClubId(u.club_id != null ? String(u.club_id) : '')
    setUGamertag(u.gamertag ?? '')
    setUActive(Boolean(u.is_active))
    setUserDrawerOpen(true)
  }

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      let finalRole = uRole
      let finalClubId = uClubId ? Number(uClubId) : null
      if (finalRole === 'club_manager' && !finalClubId) {
        finalRole = 'player'
      }
      if (finalRole === 'player') {
        finalClubId = null
      }
      const payload = {
        email: uEmail.trim(),
        ...(uPassword ? { password: uPassword } : {}),
        displayName: uName.trim() || null,
        role: finalRole,
        clubId: finalClubId,
        gamertag: uGamertag.trim() || null,
        isActive: uActive,
      }
      if (editingUser) {
        await guard(
          () => updateAdminUser(editingUser.id, payload),
          'Could not update user account',
        )
        report('ok', `Updated account ${uEmail.trim()}.`)
      } else {
        await guard(() => createAdminUser(payload), 'Could not create user account')
        report('ok', `Created account ${uEmail.trim()}.`)
      }
      setUserDrawerOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleInlineAssignClub = async (u: AdminUser, nextClubIdStr: string) => {
    const nextClubId = nextClubIdStr ? Number(nextClubIdStr) : null
    // If assigning a club to a 'player' account, promote them to 'club_manager'
    // If unassigning a club from a 'club_manager' account, demote them back to 'player'
    const nextRole: UserRole =
      nextClubId !== null && u.role === 'player'
        ? 'club_manager'
        : nextClubId === null && u.role === 'club_manager'
          ? 'player'
          : u.role
    try {
      await guard(
        () =>
          updateAdminUser(u.id, {
            email: u.email,
            displayName: u.display_name,
            role: nextRole,
            clubId: nextClubId,
            gamertag: u.gamertag,
            isActive: Boolean(u.is_active),
          }),
        `Could not assign club for ${u.email}`,
      )
      const targetClub = clubs.find((c) => c.id === nextClubId)
      report(
        'ok',
        nextClubId === null
          ? `Unassigned ${u.display_name || u.email} from club management.`
          : `Assigned ${u.display_name || u.email} as manager of ${targetClub?.name ?? 'club'}.`,
      )
      await loadAll()
    } catch {
      /* reported */
    }
  }

  const handleDeleteUser = async (u: AdminUser) => {
    if (!window.confirm(`Delete account ${u.email}?`)) return
    setBusy(true)
    try {
      await guard(() => deleteAdminUser(u.id), 'Could not delete account')
      report('ok', `Deleted account ${u.email}.`)
      setUserDrawerOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const openCreatePlayer = () => {
    setEditingPlayer(null)
    setPGamertag('')
    setPClubId('')
    setPShirtNumber('')
    setPlayerDrawerOpen(true)
  }

  const openEditPlayer = (p: AdminPlayer) => {
    setEditingPlayer(p)
    setPGamertag(p.gamertag)
    setPClubId(p.club_id != null ? String(p.club_id) : '')
    setPShirtNumber(p.shirt_number != null ? String(p.shirt_number) : '')
    setPlayerDrawerOpen(true)
  }

  const handleSavePlayer = async (e: FormEvent) => {
    e.preventDefault()
    if (!pGamertag.trim()) return
    setBusy(true)
    try {
      const payload = {
        gamertag: pGamertag.trim(),
        clubId: pClubId ? Number(pClubId) : null,
        shirtNumber: pShirtNumber.trim() ? Number(pShirtNumber.trim()) : null,
      }
      if (editingPlayer) {
        await guard(
          () => updateAdminPlayer(editingPlayer.id, payload),
          'Could not update player',
        )
        report('ok', `Updated player ${pGamertag.trim()}.`)
      } else {
        await guard(() => createAdminPlayer(payload), 'Could not register player')
        report('ok', `Registered player ${pGamertag.trim()}.`)
      }
      setPlayerDrawerOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleDeletePlayer = async (p: AdminPlayer) => {
    if (!window.confirm(`Delete player ${p.gamertag} from the league database?`)) return
    setBusy(true)
    try {
      await guard(() => deleteAdminPlayer(p.id), 'Could not delete player')
      report('ok', `Deleted player ${p.gamertag}.`)
      setPlayerDrawerOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (userSearch.trim()) {
      const q = userSearch.trim().toLowerCase()
      return (
        u.email.toLowerCase().includes(q) ||
        (u.display_name ?? '').toLowerCase().includes(q) ||
        (u.club_name ?? '').toLowerCase().includes(q) ||
        (u.gamertag ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  useEffect(() => {
    setUserPage(1)
  }, [roleFilter, userSearch])

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize))
  const safeUserPage = Math.min(userPage, totalUserPages)
  const pagedUsers = filteredUsers.slice(
    (safeUserPage - 1) * userPageSize,
    safeUserPage * userPageSize,
  )

  const filteredPlayers = players.filter((p) => {
    if (playerFilter === 'signed' && !p.club_id) return false
    if (playerFilter === 'free' && p.club_id) return false
    if (playerFilter === 'linked' && !p.user_id) return false
    if (playerSearch.trim()) {
      const q = playerSearch.trim().toLowerCase()
      return (
        p.gamertag.toLowerCase().includes(q) ||
        (p.club_name ?? '').toLowerCase().includes(q) ||
        (p.user_email ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  useEffect(() => {
    setPlayerPage(1)
  }, [playerFilter, playerSearch])

  const totalPlayerPages = Math.max(1, Math.ceil(filteredPlayers.length / playerPageSize))
  const safePlayerPage = Math.min(playerPage, totalPlayerPages)
  const pagedPlayers = filteredPlayers.slice(
    (safePlayerPage - 1) * playerPageSize,
    safePlayerPage * playerPageSize,
  )

  return (
    <div className="adm-stack">
      <div className="adm-subnav-bar">
        <div className="adm-pill-tabs">
          <button
            type="button"
            className={`adm-pill-tab ${subView === 'accounts' ? 'is-active' : ''}`}
            onClick={() => setSubView('accounts')}
          >
            👤 Registered Accounts ({users.length})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${subView === 'players' ? 'is-active' : ''}`}
            onClick={() => setSubView('players')}
          >
            🎮 League Players & Free Agents ({players.length})
          </button>
        </div>

        <div className="adm-row-actions">
          {subView === 'accounts' ? (
            <button type="button" className="adm-btn adm-btn-primary" onClick={openCreateUser}>
              + Create Account
            </button>
          ) : (
            <button type="button" className="adm-btn adm-btn-primary" onClick={openCreatePlayer}>
              + Register Player
            </button>
          )}
        </div>
      </div>

      {subView === 'accounts' ? (
        <section className="adm-card">
          <div className="adm-toolbar">
            <input
              type="search"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by email, name, club, or gamertag…"
              className="adm-input adm-search-input"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="adm-select"
            >
              <option value="all">All Roles ({users.length})</option>
              <option value="club_manager">Club Managers</option>
              <option value="player">Players</option>
              <option value="admin">Admins</option>
              <option value="owner">Owners</option>
            </select>
          </div>

          {loading ? (
            <div className="adm-empty">Loading accounts…</div>
          ) : filteredUsers.length === 0 ? (
            <div className="adm-empty">No accounts match this filter.</div>
          ) : (
            <>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Role</th>
                      <th>Managed Club (Assign Inline)</th>
                      <th>Player Gamertag</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div>
                            <strong>{u.display_name || 'Unnamed'}</strong>
                            <div className="adm-text-muted">{u.email}</div>
                          </div>
                        </td>
                        <td>
                          <span className="adm-code-pill">{u.role}</span>
                        </td>
                        <td>
                          <select
                            value={u.club_id != null ? String(u.club_id) : ''}
                            onChange={(e) => void handleInlineAssignClub(u, e.target.value)}
                            className="adm-select adm-select-inline"
                            aria-label={`Assign managed club for ${u.email}`}
                          >
                            <option value="">— No Managed Club —</option>
                            {clubs.map((c) => (
                              <option key={c.id} value={String(c.id)}>
                                {c.name} ({c.status})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{u.gamertag || <span className="adm-text-muted">—</span>}</td>
                        <td>
                          <span
                            className={`adm-status-badge ${Boolean(u.is_active) ? 'status-active' : 'status-withdrawn'}`}
                          >
                            {Boolean(u.is_active) ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="adm-btn adm-btn-secondary adm-btn-sm"
                            onClick={() => openEditUser(u)}
                          >
                            Edit Account →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredUsers.length > userPageSize && (
                <div className="adm-pagination">
                  <span>
                    Showing {(safeUserPage - 1) * userPageSize + 1}–
                    {Math.min(safeUserPage * userPageSize, filteredUsers.length)} of{' '}
                    {filteredUsers.length} accounts
                  </span>
                  <div className="adm-row-actions">
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      disabled={safeUserPage <= 1}
                      onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    >
                      ← Previous
                    </button>
                    <span className="adm-text-muted">
                      Page {safeUserPage} of {totalUserPages}
                    </span>
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      disabled={safeUserPage >= totalUserPages}
                      onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="adm-card">
          <div className="adm-toolbar">
            <input
              type="search"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search player gamertag or club…"
              className="adm-input adm-search-input"
            />
            <select
              value={playerFilter}
              onChange={(e) => setPlayerFilter(e.target.value as any)}
              className="adm-select"
            >
              <option value="all">All Players ({players.length})</option>
              <option value="signed">Signed to a Club</option>
              <option value="free">Free Agents</option>
              <option value="linked">Linked to User Account</option>
            </select>
          </div>

          {loading ? (
            <div className="adm-empty">Loading players…</div>
          ) : filteredPlayers.length === 0 ? (
            <div className="adm-empty">No players match this filter.</div>
          ) : (
            <>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Gamertag</th>
                      <th>Jersey #</th>
                      <th>Current Club</th>
                      <th>Linked Account</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPlayers.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.gamertag}</strong>
                        </td>
                        <td>
                          {p.shirt_number != null ? (
                            <span className="adm-code-pill">#{p.shirt_number}</span>
                          ) : (
                            <span className="adm-text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {p.club_name ? (
                            <span className="adm-row-title">
                              <strong>{p.club_name}</strong>
                              {p.club_code && <span className="adm-code-pill">{p.club_code}</span>}
                            </span>
                          ) : (
                            <span className="adm-status-badge status-pending">Free Agent</span>
                          )}
                        </td>
                        <td>
                          {p.user_email ? (
                            <span>
                              {p.user_name ? `${p.user_name} (${p.user_email})` : p.user_email}
                            </span>
                          ) : (
                            <span className="adm-text-muted">Roster-only</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="adm-btn adm-btn-secondary adm-btn-sm"
                            onClick={() => openEditPlayer(p)}
                          >
                            Edit / Transfer →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredPlayers.length > playerPageSize && (
                <div className="adm-pagination">
                  <span>
                    Showing {(safePlayerPage - 1) * playerPageSize + 1}–
                    {Math.min(safePlayerPage * playerPageSize, filteredPlayers.length)} of{' '}
                    {filteredPlayers.length} players
                  </span>
                  <div className="adm-row-actions">
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      disabled={safePlayerPage <= 1}
                      onClick={() => setPlayerPage((p) => Math.max(1, p - 1))}
                    >
                      ← Previous
                    </button>
                    <span className="adm-text-muted">
                      Page {safePlayerPage} of {totalPlayerPages}
                    </span>
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      disabled={safePlayerPage >= totalPlayerPages}
                      onClick={() => setPlayerPage((p) => Math.min(totalPlayerPages, p + 1))}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* User Account Slide-Over Drawer */}
      {userDrawerOpen && (
        <div className="adm-drawer-backdrop" onClick={() => setUserDrawerOpen(false)}>
          <aside className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <div>
                <span className="adm-eyebrow">USER ACCOUNT</span>
                <h3>{editingUser ? `Edit ${editingUser.email}` : 'Create New Account'}</h3>
              </div>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setUserDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="adm-drawer-body">
              <form onSubmit={handleSaveUser} className="adm-form-stack">
                <label className="adm-field">
                  <span>Email Address *</span>
                  <input
                    type="email"
                    required
                    value={uEmail}
                    onChange={(e) => setUEmail(e.target.value)}
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>
                    {editingUser ? 'New Password (leave blank to keep current)' : 'Password *'}
                  </span>
                  <input
                    type="password"
                    required={!editingUser}
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
                    placeholder="Manager or player name"
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
                      if (next === 'player') setUClubId('')
                    }}
                    className="adm-select"
                  >
                    <option value="club_manager">Club Manager</option>
                    <option value="player">Player</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </label>
                {uRole !== 'player' && (
                  <label className="adm-field">
                    <span>Managed Club</span>
                    <select
                      value={uClubId}
                      onChange={(e) => {
                        const nextVal = e.target.value
                        setUClubId(nextVal)
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
                <label className="adm-field">
                  <span>Linked Player Gamertag (Optional)</span>
                  <input
                    type="text"
                    value={uGamertag}
                    onChange={(e) => setUGamertag(e.target.value)}
                    placeholder="In-game gamertag"
                    className="adm-input"
                  />
                </label>
                <label className="adm-check-row">
                  <input
                    type="checkbox"
                    checked={uActive}
                    onChange={(e) => setUActive(e.target.checked)}
                  />
                  <span>Account is active (uncheck to suspend sign-in)</span>
                </label>

                <div className="adm-row-actions">
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : editingUser ? 'Save Account' : 'Create Account'}
                  </button>
                  {editingUser && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-danger"
                      disabled={busy}
                      onClick={() => void handleDeleteUser(editingUser)}
                    >
                      Delete Account
                    </button>
                  )}
                </div>
              </form>
            </div>
          </aside>
        </div>
      )}

      {/* Player Slide-Over Drawer */}
      {playerDrawerOpen && (
        <div className="adm-drawer-backdrop" onClick={() => setPlayerDrawerOpen(false)}>
          <aside className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <div>
                <span className="adm-eyebrow">LEAGUE PLAYER</span>
                <h3>{editingPlayer ? `Edit ${editingPlayer.gamertag}` : 'Register Player'}</h3>
              </div>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setPlayerDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="adm-drawer-body">
              <form onSubmit={handleSavePlayer} className="adm-form-stack">
                <label className="adm-field">
                  <span>Gamertag *</span>
                  <input
                    type="text"
                    required
                    value={pGamertag}
                    onChange={(e) => setPGamertag(e.target.value)}
                    placeholder="In-game gamertag"
                    className="adm-input"
                  />
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
                <label className="adm-field">
                  <span>Club Assignment</span>
                  <select
                    value={pClubId}
                    onChange={(e) => setPClubId(e.target.value)}
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

                <div className="adm-row-actions">
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : editingPlayer ? 'Save Player' : 'Register Player'}
                  </button>
                  {editingPlayer && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-danger"
                      disabled={busy}
                      onClick={() => void handleDeletePlayer(editingPlayer)}
                    >
                      Delete Player
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
