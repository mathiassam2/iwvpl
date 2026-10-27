import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { SeasonRollover } from '../SeasonRollover'
import {
  createDivision,
  createSeason,
  getAdminClubs,
  getAdminSeasons,
  getDivisions,
  getSeasonRollover,
  setCurrentSeason,
  setDivisionActive,
  setFeaturedDivision,
  undoSeasonRollover,
  updateDivision,
  updateDivisionOrder,
  updateSeason,
  resetSeason,
  type AdminSeason,
  type Club,
  type Division,
  type RolloverRecord,
} from '../api'
import type { Guard, Report } from '../utils'

export function SeasonsDivisionsView({
  guard,
  report,
}: {
  guard: Guard
  report: Report
}) {
  const [seasons, setSeasons] = useState<AdminSeason[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [rollover, setRollover] = useState<RolloverRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const hasLoadedRef = useRef(false)

  // Season modals / inline states
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [newSeasonOpen, setNewSeasonOpen] = useState(false)
  const [newSeasonName, setNewSeasonName] = useState('')
  const [newSeasonYear, setNewSeasonYear] = useState(String(new Date().getFullYear()))
  const [rolloverWizardOpen, setRolloverWizardOpen] = useState(false)
  // Reset Season modal state
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetSeasonTarget, setResetSeasonTarget] = useState<AdminSeason | null>(null)
  const [resetConfirmName, setResetConfirmName] = useState('')
  const [resetDeleteFixtures, setResetDeleteFixtures] = useState(false)
  const [resetStandings, setResetStandings] = useState(true)
  const [resetPlayerStats, setResetPlayerStats] = useState(true)

  // Division modal / drawer
  const [createDivOpen, setCreateDivOpen] = useState(false)
  const [divName, setDivName] = useState('')
  const [divPromo, setDivPromo] = useState('')
  const [divReleg, setDivReleg] = useState('')

  const [editingDiv, setEditingDiv] = useState<Division | null>(null)
  const [editDivName, setEditDivName] = useState('')
  const [editDivPromo, setEditDivPromo] = useState('')
  const [editDivReleg, setEditDivReleg] = useState('')

  const [busy, setBusy] = useState(false)

  const loadAll = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true)
    try {
      const [seasonsList, divsList, clubsList, rolloverRec] = await Promise.all([
        guard(getAdminSeasons, 'Could not load seasons'),
        guard(() => getDivisions(), 'Could not load divisions'),
        guard(() => getAdminClubs(), 'Could not load clubs'),
        guard(getSeasonRollover, 'Could not load season rollover history'),
      ])
      setSeasons(seasonsList)
      setDivisions(divsList)
      setClubs(clubsList)
      setRollover(rolloverRec)
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

  const currentSeason = seasons.find((s) => Boolean(s.is_current)) ?? seasons[0] ?? null

  const handleSwitchSeason = async (seasonId: number) => {
    setBusy(true)
    try {
      const s = await guard(() => setCurrentSeason(seasonId), 'Could not switch active season')
      report('ok', `Active season switched to ${s.name}.`)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleOpenResetModal = (target: AdminSeason) => {
    setResetSeasonTarget(target)
    setResetConfirmName('')
    setResetDeleteFixtures(false)
    setResetStandings(true)
    setResetPlayerStats(true)
    setResetModalOpen(true)
  }

  const handleResetSeasonSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!resetSeasonTarget) return

    if (resetConfirmName.trim().toLowerCase() !== resetSeasonTarget.name.trim().toLowerCase()) {
      report('error', `Please type "${resetSeasonTarget.name}" exactly to confirm.`)
      return
    }

    setBusy(true)
    try {
      const res = await guard(
        () =>
          resetSeason(resetSeasonTarget.id, {
            confirmSeasonName: resetConfirmName.trim(),
            deleteFixtures: resetDeleteFixtures,
            resetStandings,
            resetPlayerStats,
          }),
        'Could not reset season',
      )
      report('ok', res.message || `Season "${resetSeasonTarget.name}" reset successfully.`)
      setResetModalOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleRenameSeason = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentSeason || !renameValue.trim()) return
    setBusy(true)
    try {
      await guard(() => updateSeason(currentSeason.id, renameValue.trim()), 'Could not rename season')
      report('ok', `Renamed season to ${renameValue.trim()}.`)
      setRenameOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleCreateSeason = async (e: FormEvent) => {
    e.preventDefault()
    const yearNum = Number.parseInt(newSeasonYear, 10)
    if (!newSeasonName.trim() || !Number.isInteger(yearNum)) return
    setBusy(true)
    try {
      const created = await guard(
        () => createSeason(newSeasonName.trim(), yearNum),
        'Could not create season',
      )
      report('ok', `Created and activated season ${created.season.name}.`)
      setNewSeasonName('')
      setNewSeasonOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleFeaturedDivision = async (divValue: string) => {
    if (!currentSeason) return
    const nextId = divValue === '' ? null : Number(divValue)
    setBusy(true)
    try {
      await guard(
        () => setFeaturedDivision(currentSeason.id, nextId),
        'Could not set homepage featured division',
      )
      report(
        'ok',
        nextId === null
          ? 'Homepage featured division set to default (top tier).'
          : 'Homepage featured division updated.',
      )
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleUndoRollover = async () => {
    if (!rollover) return
    if (
      !window.confirm(
        `Undo the rollover that opened ${rollover.season.name} and restore ${rollover.sourceSeason.name}?`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const res = await guard(
        () => undoSeasonRollover(rollover.season.id),
        'Could not undo season rollover',
      )
      report('ok', `Restored ${res.restoredSeason.name}.`)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleCreateDivision = async (e: FormEvent) => {
    e.preventDefault()
    if (!divName.trim()) return
    setBusy(true)
    try {
      const created = await guard(
        () =>
          createDivision({
            name: divName.trim(),
            promotion_count: divPromo ? Number(divPromo) : null,
            relegation_count: divReleg ? Number(divReleg) : null,
          }),
        'Could not create division',
      )
      report('ok', `Created division ${created.name}.`)
      setDivName('')
      setDivPromo('')
      setDivReleg('')
      setCreateDivOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleSaveDivision = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingDiv || !editDivName.trim()) return
    setBusy(true)
    try {
      await guard(
        () =>
          updateDivision(editingDiv.id, {
            name: editDivName.trim(),
            promotion_count: editDivPromo ? Number(editDivPromo) : null,
            relegation_count: editDivReleg ? Number(editDivReleg) : null,
          }),
        'Could not update division',
      )
      report('ok', `Updated division ${editDivName.trim()}.`)
      setEditingDiv(null)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleToggleDivisionActive = async (div: Division) => {
    const nextActive = !Boolean(div.is_active)
    setBusy(true)
    try {
      const res = await guard(
        () => setDivisionActive(div.id, nextActive),
        `Could not ${nextActive ? 'activate' : 'pause'} ${div.name}`,
      )
      report(
        'ok',
        nextActive
          ? `${div.name} is now active on the public site.`
          : `${div.name} paused${res.featuredCleared ? ' (homepage feature reset to top tier)' : ''}.`,
      )
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleMoveDivision = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= divisions.length) return
    const nextList = [...divisions]
    const [moved] = nextList.splice(index, 1)
    nextList.splice(targetIndex, 0, moved)
    setDivisions(nextList)
    try {
      await guard(
        () => updateDivisionOrder(nextList.map((d) => d.id)),
        'Could not reorder divisions',
      )
      report('ok', `Moved ${moved.name} ${direction < 0 ? 'up' : 'down'} the ladder.`)
      await loadAll()
    } catch {
      await loadAll()
    }
  }

  return (
    <div className="adm-stack">
      {/* Active Season Hero Card */}
      <section className="adm-card adm-card-accent">
        <div className="adm-card-head">
          <div>
            <span className="adm-eyebrow">ACTIVE COMPETITION SEASON</span>
            <h2>
              {currentSeason
                ? `${currentSeason.name} (${currentSeason.year})`
                : loading
                  ? 'Loading…'
                  : 'No Active Season'}
            </h2>
          </div>
          <div className="adm-row-actions">
            {currentSeason && (
              <>
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  onClick={() => {
                    setRenameValue(currentSeason.name)
                    setRenameOpen(true)
                  }}
                >
                  Rename Season
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-danger adm-btn-sm"
                  onClick={() => handleOpenResetModal(currentSeason)}
                >
                  ⚠️ Reset Season
                </button>
              </>
            )}
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => setNewSeasonOpen(true)}
            >
              + New Blank Season
            </button>
            <button
              type="button"
              className="adm-btn adm-btn-primary"
              onClick={() => setRolloverWizardOpen(true)}
            >
              🏁 Complete Season & Rollover Wizard
            </button>
          </div>
        </div>

        <div className="adm-season-controls">
          <label className="adm-field">
            <span>Switch Live Season</span>
            <select
              value={currentSeason?.id ?? ''}
              disabled={busy}
              onChange={(e) => void handleSwitchSeason(Number(e.target.value))}
              className="adm-select"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.year}) {Boolean(s.is_current) ? '· LIVE NOW' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="adm-field">
            <span>Homepage Featured Division Table</span>
            <select
              value={currentSeason?.featured_division_id ?? ''}
              disabled={busy || !currentSeason}
              onChange={(e) => void handleFeaturedDivision(e.target.value)}
              className="adm-select"
            >
              <option value="">Default (Highest-ranked active division)</option>
              {divisions
                .filter((d) => Boolean(d.is_active))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
        </div>

        {rollover && (
          <div className="adm-rollover-banner">
            <div>
              <strong>Last Season Rollover:</strong> Opened <strong>{rollover.season.name}</strong> from{' '}
              <strong>{rollover.sourceSeason.name}</strong> ({rollover.movedClubs} club movements applied).
            </div>
            {rollover.undoable && (
              <button
                type="button"
                className="adm-btn adm-btn-danger adm-btn-sm"
                disabled={busy}
                onClick={() => void handleUndoRollover()}
              >
                Undo Rollover
              </button>
            )}
          </div>
        )}
      </section>

      {/* Division Tiers Ladder */}
      <section className="adm-card">
        <div className="adm-card-head">
          <div>
            <span className="adm-eyebrow">DIVISION LADDER (TOP TO BOTTOM TIER)</span>
            <h2>Division Tiers ({divisions.length})</h2>
          </div>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={() => setCreateDivOpen(true)}
          >
            + Add Division Tier
          </button>
        </div>

        {loading ? (
          <div className="adm-empty">Loading divisions…</div>
        ) : divisions.length === 0 ? (
          <div className="adm-empty">No divisions configured for this season.</div>
        ) : (
          <div className="adm-div-grid">
            {divisions.map((div, idx) => {
              const isActive = Boolean(div.is_active)
              const divClubs = clubs.filter(
                (c) => c.status === 'active' && c.division_id === div.id,
              )
              const isFeatured = currentSeason?.featured_division_id === div.id
              return (
                <div
                  key={div.id}
                  className={`adm-div-card ${!isActive ? 'is-paused' : ''}`}
                >
                  <div className="adm-div-head">
                    <div className="adm-row-title">
                      <span className="adm-tier-badge">Tier {idx + 1}</span>
                      <h3>{div.name}</h3>
                      {isFeatured && <span className="adm-code-pill">★ Homepage Table</span>}
                      {!isActive && <span className="adm-status-badge status-withdrawn">Paused</span>}
                    </div>
                    <div className="adm-row-actions">
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        disabled={idx === 0 || busy}
                        onClick={() => void handleMoveDivision(idx, -1)}
                        title="Move tier up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        disabled={idx === divisions.length - 1 || busy}
                        onClick={() => void handleMoveDivision(idx, 1)}
                        title="Move tier down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => {
                          setEditingDiv(div)
                          setEditDivName(div.name)
                          setEditDivPromo(
                            div.promotion_count != null ? String(div.promotion_count) : '',
                          )
                          setEditDivReleg(
                            div.relegation_count != null ? String(div.relegation_count) : '',
                          )
                        }}
                      >
                        Edit Rules
                      </button>
                      <button
                        type="button"
                        className={`adm-btn adm-btn-sm ${isActive ? 'adm-btn-ghost' : 'adm-btn-success'}`}
                        disabled={busy}
                        onClick={() => void handleToggleDivisionActive(div)}
                      >
                        {isActive ? 'Pause League' : 'Resume League'}
                      </button>
                    </div>
                  </div>

                  <div className="adm-div-meta">
                    <span>
                      <strong>{divClubs.length}</strong> active clubs
                    </span>
                    <span>
                      Promotion: <strong>{div.promotion_count ? `Top ${div.promotion_count}` : 'None'}</strong>
                    </span>
                    <span>
                      Relegation: <strong>{div.relegation_count ? `Bottom ${div.relegation_count}` : 'None'}</strong>
                    </span>
                  </div>

                  {divClubs.length > 0 && (
                    <div className="adm-div-clubs">
                      {divClubs.map((c) => (
                        <span key={c.id} className="adm-club-chip">
                          {c.logo_local && <img src={c.logo_local} alt="" />}
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Season Rollover Wizard Modal */}
      <SeasonRollover
        open={rolloverWizardOpen}
        onClose={() => setRolloverWizardOpen(false)}
        onCompleted={() => {
          void loadAll()
        }}
        onUndone={() => {
          void loadAll()
        }}
        guard={guard}
        report={report}
      />

      {/* Rename Season Modal */}
      {renameOpen && (
        <div className="adm-modal-backdrop" onClick={() => setRenameOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <h3>Rename Active Season</h3>
              <button type="button" className="adm-close-btn" onClick={() => setRenameOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleRenameSeason} className="adm-form-stack">
              <label className="adm-field">
                <span>Season Name</span>
                <input
                  type="text"
                  required
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="adm-input"
                />
              </label>
              <div className="adm-modal-foot">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setRenameOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Blank Season Modal */}
      {newSeasonOpen && (
        <div className="adm-modal-backdrop" onClick={() => setNewSeasonOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <h3>Create New Season (Without Rollover)</h3>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setNewSeasonOpen(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateSeason} className="adm-form-stack">
              <p className="adm-text-muted">
                Copies current divisions and club memberships into a fresh season with 0-0-0
                standings. If you want automatic promotion & relegation, use the Rollover Wizard
                instead.
              </p>
              <div className="adm-field-grid">
                <label className="adm-field">
                  <span>Season Name</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Season 25"
                    value={newSeasonName}
                    onChange={(e) => setNewSeasonName(e.target.value)}
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Year</span>
                  <input
                    type="number"
                    required
                    min={2020}
                    max={2100}
                    value={newSeasonYear}
                    onChange={(e) => setNewSeasonYear(e.target.value)}
                    className="adm-input"
                  />
                </label>
              </div>
              <div className="adm-modal-foot">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setNewSeasonOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                  Create Season
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Division Modal */}
      {createDivOpen && (
        <div className="adm-modal-backdrop" onClick={() => setCreateDivOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <h3>Add Division Tier</h3>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setCreateDivOpen(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateDivision} className="adm-form-stack">
              <label className="adm-field">
                <span>Division Name</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Division 3"
                  value={divName}
                  onChange={(e) => setDivName(e.target.value)}
                  className="adm-input"
                />
              </label>
              <div className="adm-field-grid">
                <label className="adm-field">
                  <span>Promotion Spots (Top N)</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    placeholder="0"
                    value={divPromo}
                    onChange={(e) => setDivPromo(e.target.value)}
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Relegation Spots (Bottom N)</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    placeholder="0"
                    value={divReleg}
                    onChange={(e) => setDivReleg(e.target.value)}
                    className="adm-input"
                  />
                </label>
              </div>
              <div className="adm-modal-foot">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setCreateDivOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                  Create Division
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Division Modal */}
      {editingDiv && (
        <div className="adm-modal-backdrop" onClick={() => setEditingDiv(null)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <h3>Edit Division: {editingDiv.name}</h3>
              <button type="button" className="adm-close-btn" onClick={() => setEditingDiv(null)}>
                ×
              </button>
            </div>
            <form onSubmit={handleSaveDivision} className="adm-form-stack">
              <label className="adm-field">
                <span>Division Name</span>
                <input
                  type="text"
                  required
                  value={editDivName}
                  onChange={(e) => setEditDivName(e.target.value)}
                  className="adm-input"
                />
              </label>
              <div className="adm-field-grid">
                <label className="adm-field">
                  <span>Promotion Spots (Top N)</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    placeholder="0"
                    value={editDivPromo}
                    onChange={(e) => setEditDivPromo(e.target.value)}
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Relegation Spots (Bottom N)</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    placeholder="0"
                    value={editDivReleg}
                    onChange={(e) => setEditDivReleg(e.target.value)}
                    className="adm-input"
                  />
                </label>
              </div>
              <div className="adm-modal-foot">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setEditingDiv(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                  Save Division
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Season Modal */}
      {resetModalOpen && resetSeasonTarget && (
        <div className="adm-modal-backdrop" onClick={() => setResetModalOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="adm-modal-head">
              <h3 style={{ color: 'var(--adm-danger, #ef4444)' }}>
                ⚠️ Reset Season: {resetSeasonTarget.name}
              </h3>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setResetModalOpen(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleResetSeasonSubmit} className="adm-form-stack">
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: 'var(--adm-text, #f1f5f9)',
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}
              >
                <strong>Warning:</strong> Resetting this season will restore standings and match results back to their initial unplayed state. This operation cannot be undone.
              </div>

              {seasons.length > 1 && (
                <label className="adm-field">
                  <span>Target Season to Reset</span>
                  <select
                    value={resetSeasonTarget.id}
                    onChange={(e) => {
                      const found = seasons.find((s) => s.id === Number(e.target.value))
                      if (found) {
                        setResetSeasonTarget(found)
                        setResetConfirmName('')
                      }
                    }}
                    className="adm-select"
                  >
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.year}) {Boolean(s.is_current) ? '· (Active Season)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="adm-field">
                <span>Fixtures & Schedule Handling</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: !resetDeleteFixtures ? '1px solid var(--adm-accent, #3b82f6)' : '1px solid var(--adm-border, #334155)',
                      backgroundColor: !resetDeleteFixtures ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="resetFixturesMode"
                      checked={!resetDeleteFixtures}
                      onChange={() => setResetDeleteFixtures(false)}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <strong style={{ display: 'block', fontSize: '13px', color: 'var(--adm-text, #f1f5f9)' }}>
                        Keep scheduled fixtures (Reset results only)
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--adm-muted, #94a3b8)' }}>
                        Keeps all match kickoff dates, times, and rounds, but resets match scores, events, and status back to unplayed (0-0 scheduled).
                      </span>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: resetDeleteFixtures ? '1px solid #ef4444' : '1px solid var(--adm-border, #334155)',
                      backgroundColor: resetDeleteFixtures ? 'rgba(239, 68, 68, 0.06)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="resetFixturesMode"
                      checked={resetDeleteFixtures}
                      onChange={() => setResetDeleteFixtures(true)}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <strong style={{ display: 'block', fontSize: '13px', color: 'var(--adm-text, #f1f5f9)' }}>
                        Completely wipe match schedule & fixtures
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--adm-muted, #94a3b8)' }}>
                        Deletes every fixture/match row in this season so you can generate a brand new round-robin schedule from scratch.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="adm-field">
                <span>Standings & Player Stats</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={resetStandings}
                      onChange={(e) => setResetStandings(e.target.checked)}
                    />
                    <span>Reset division standings to 0 (0 Played, 0 Won, 0 Drawn, 0 Lost, 0 Points)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={resetPlayerStats}
                      onChange={(e) => setResetPlayerStats(e.target.checked)}
                    />
                    <span>Reset player season leaderboards/stats (goals, assists, saves, clean sheets)</span>
                  </label>
                </div>
              </div>

              <label className="adm-field">
                <span>
                  To confirm, type <strong>{resetSeasonTarget.name}</strong>:
                </span>
                <input
                  type="text"
                  required
                  placeholder={resetSeasonTarget.name}
                  value={resetConfirmName}
                  onChange={(e) => setResetConfirmName(e.target.value)}
                  className="adm-input"
                  autoFocus
                />
              </label>

              <div className="adm-modal-foot">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setResetModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adm-btn adm-btn-danger"
                  disabled={
                    busy ||
                    resetConfirmName.trim().toLowerCase() !== resetSeasonTarget.name.trim().toLowerCase()
                  }
                >
                  {busy ? 'Resetting Season…' : 'Confirm & Reset Season'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
