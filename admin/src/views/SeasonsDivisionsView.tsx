import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { SeasonRollover } from '../SeasonRollover'
import {
  assignDivision,
  createDivision,
  createSeason,
  deleteSeason,
  getAdminClubs,
  getAdminSeasons,
  getDivisions,
  getSeasonRollover,
  publishSeason,
  resetSeason,
  setCurrentSeason,
  setDivisionActive,
  setFeaturedDivision,
  undoSeasonRollover,
  updateDivision,
  updateDivisionOrder,
  updateSeason,
  type AdminSeason,
  type Club,
  type Division,
  type RolloverRecord,
} from '../api'
import type { Guard, Report } from '../utils'

/** A season is editable while it is live or still a private draft. */
function isEditableSeason(season: AdminSeason | null): boolean {
  return Boolean(season && (season.is_current || season.is_draft))
}

/**
 * Everything the admin should see before a draft goes live.
 *
 * These are warnings, not refusals. A skeleton season published before the
 * transfer window closes is a legitimate thing to do, so the UI explains the
 * consequences and lets the admin decide.
 */
function buildPublishWarnings(divisions: Division[], clubs: Club[]): string[] {
  const warnings: string[] = []
  if (divisions.length === 0) {
    warnings.push('This draft has no divisions. Publishing it leaves the public site with no league tables.')
  }
  if (divisions.length > 0 && !divisions.some((d) => Boolean(d.is_active))) {
    warnings.push('No division is active. The public standings page will have nothing to show.')
  }
  for (const division of divisions) {
    const count = clubs.filter((c) => c.status === 'active' && c.division_id === division.id).length
    if (count === 0) {
      warnings.push(`${division.name} has no clubs assigned.`)
    } else if (count < 2) {
      warnings.push(`${division.name} has only ${count} club. A table needs at least two.`)
    }
    if (division.max_teams && count > division.max_teams) {
      warnings.push(`${division.name} has ${count} clubs but its maximum is ${division.max_teams}.`)
    }
  }
  return warnings
}

function seasonStatusLabel(season: AdminSeason): string {
  if (season.is_current) return 'LIVE'
  if (season.is_draft) return 'DRAFT'
  return 'ARCHIVED'
}

function seasonStatusClass(season: AdminSeason): string {
  if (season.is_current) return 'status-active'
  if (season.is_draft) return 'status-pending'
  return 'status-withdrawn'
}

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
  const [workingSeasonId, setWorkingSeasonId] = useState<number | null>(null)
  const hasLoadedRef = useRef(false)

  // Season modals / inline states
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<AdminSeason | null>(null)
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
  // Publish / delete modals
  const [publishTarget, setPublishTarget] = useState<{ season: AdminSeason; warnings: string[] } | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<AdminSeason | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  // Division modal / drawer
  const [createDivOpen, setCreateDivOpen] = useState(false)
  const [divName, setDivName] = useState('')
  const [divPromo, setDivPromo] = useState('')
  const [divReleg, setDivReleg] = useState('')
  const [divMaxTeams, setDivMaxTeams] = useState('')

  const [editingDiv, setEditingDiv] = useState<Division | null>(null)
  const [editDivName, setEditDivName] = useState('')
  const [editDivPromo, setEditDivPromo] = useState('')
  const [editDivReleg, setEditDivReleg] = useState('')
  const [editDivMaxTeams, setEditDivMaxTeams] = useState('')

  const [manageDiv, setManageDiv] = useState<Division | null>(null)

  const [busy, setBusy] = useState(false)

  const liveSeason = useMemo(
    () => seasons.find((season) => Boolean(season.is_current)) ?? null,
    [seasons],
  )
  const workingSeason = useMemo(
    () => seasons.find((season) => season.id === workingSeasonId) ?? null,
    [seasons, workingSeasonId],
  )
  const workingEditable = isEditableSeason(workingSeason)
  const workingIsDraft = Boolean(workingSeason?.is_draft)
  const publishedSeasons = useMemo(
    () => seasons.filter((season) => !Boolean(season.is_draft)),
    [seasons],
  )
  const featuredDivisionId =
    workingSeason?.featured_division_id != null &&
    Number(workingSeason.featured_division_id) > 0
      ? String(workingSeason.featured_division_id)
      : ''

  const loadSeasons = useCallback(async () => {
    try {
      const list = await guard(getAdminSeasons, 'Could not load seasons')
      setSeasons(list)
      setWorkingSeasonId((previous) => {
        if (previous != null && list.some((season) => season.id === previous)) return previous
        return list.find((season) => Boolean(season.is_current))?.id ?? list[0]?.id ?? null
      })
    } catch {
      /* reported */
    }
  }, [guard])

  const loadWorkspace = useCallback(
    async (seasonId: number) => {
      if (!hasLoadedRef.current) setLoading(true)
      try {
        const [divsList, clubsList, rolloverRec] = await Promise.all([
          guard(() => getDivisions(seasonId), 'Could not load divisions'),
          guard(() => getAdminClubs(seasonId), 'Could not load clubs'),
          guard(() => getSeasonRollover(seasonId), 'Could not load season rollover history'),
        ])
        setDivisions(divsList)
        setClubs(clubsList)
        setRollover(rolloverRec)
        hasLoadedRef.current = true
      } catch {
        /* reported */
      } finally {
        setLoading(false)
      }
    },
    [guard],
  )

  const refresh = useCallback(async () => {
    await loadSeasons()
    if (workingSeasonId != null) await loadWorkspace(workingSeasonId)
  }, [loadSeasons, loadWorkspace, workingSeasonId])

  useEffect(() => {
    void loadSeasons()
  }, [loadSeasons])

  useEffect(() => {
    if (workingSeasonId == null) {
      setDivisions([])
      setClubs([])
      setRollover(null)
      return
    }
    void loadWorkspace(workingSeasonId)
  }, [workingSeasonId, loadWorkspace])

  const openRename = (season: AdminSeason) => {
    setRenameTarget(season)
    setRenameValue(season.name)
    setRenameOpen(true)
  }

  const openPublish = async (season: AdminSeason) => {
    setBusy(true)
    try {
      const [divsList, clubsList] =
        season.id === workingSeasonId
          ? [divisions, clubs]
          : await Promise.all([
              guard(() => getDivisions(season.id), 'Could not load draft divisions'),
              guard(() => getAdminClubs(season.id), 'Could not load draft clubs'),
            ])
      setPublishTarget({ season, warnings: buildPublishWarnings(divsList, clubsList) })
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const openDelete = (season: AdminSeason) => {
    setDeleteTarget(season)
    setDeleteConfirmName('')
  }

  const handleSwitchSeason = async (seasonId: number) => {
    const target = seasons.find((season) => season.id === seasonId)
    if (!target) return
    if (Boolean(target.is_current)) {
      setWorkingSeasonId(target.id)
      return
    }
    if (
      !window.confirm(
        `Make ${target.name} the live season? The public site will switch to it immediately.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const s = await guard(() => setCurrentSeason(seasonId), 'Could not switch active season')
      report('ok', `Live season switched to ${s.name}.`)
      setWorkingSeasonId(seasonId)
      await loadSeasons()
      await loadWorkspace(seasonId)
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
      await refresh()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleRenameSeason = async (e: FormEvent) => {
    e.preventDefault()
    if (!renameTarget || !renameValue.trim()) return
    setBusy(true)
    try {
      await guard(
        () => updateSeason(renameTarget.id, renameValue.trim()),
        'Could not rename season',
      )
      report('ok', `Renamed season to ${renameValue.trim()}.`)
      setRenameOpen(false)
      await refresh()
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
      report(
        'ok',
        `Created ${created.season.name} as a draft. It is hidden from the public site until you publish it.`,
      )
      setNewSeasonName('')
      setNewSeasonOpen(false)
      setWorkingSeasonId(created.season.id)
      await loadSeasons()
      await loadWorkspace(created.season.id)
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handlePublishSeason = async () => {
    if (!publishTarget) return
    setBusy(true)
    try {
      const res = await guard(
        () => publishSeason(publishTarget.season.id),
        'Could not publish season',
      )
      report(
        'ok',
        `${res.season.name} is now live.${
          res.notificationCount > 0
            ? ` ${res.notificationCount} manager notification${res.notificationCount === 1 ? '' : 's'} sent.`
            : ''
        }`,
      )
      setWorkingSeasonId(publishTarget.season.id)
      setPublishTarget(null)
      await loadSeasons()
      await loadWorkspace(publishTarget.season.id)
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteSeason = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await guard(() => deleteSeason(deleteTarget.id), 'Could not delete season')
      report('ok', `Deleted ${deleteTarget.name}.`)
      const deletingWorkingSeason = workingSeasonId === deleteTarget.id
      const fallback = deletingWorkingSeason
        ? seasons.find((season) => Boolean(season.is_current) && season.id !== deleteTarget.id) ?? null
        : null
      setDeleteTarget(null)
      if (deletingWorkingSeason) {
        setWorkingSeasonId(fallback?.id ?? null)
      }
      await loadSeasons()
      if (deletingWorkingSeason) {
        if (fallback) await loadWorkspace(fallback.id)
      } else if (workingSeasonId != null) {
        await loadWorkspace(workingSeasonId)
      }
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleFeaturedDivision = async (divValue: string) => {
    if (!liveSeason) return
    const nextId = divValue === '' ? null : Number(divValue)
    setBusy(true)
    try {
      await guard(
        () => setFeaturedDivision(liveSeason.id, nextId),
        'Could not set homepage featured division',
      )
      report(
        'ok',
        nextId === null
          ? 'Homepage featured division set to default (top tier).'
          : 'Homepage featured division updated.',
      )
      await refresh()
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
      report('ok', `Rolled back. ${res.restoredSeason.name} is live again.`)
      await refresh()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleCreateDivision = async (e: FormEvent) => {
    e.preventDefault()
    if (!divName.trim() || workingSeasonId == null) return
    setBusy(true)
    try {
      const created = await guard(
        () =>
          createDivision({
            name: divName.trim(),
            promotion_count: divPromo ? Number(divPromo) : null,
            relegation_count: divReleg ? Number(divReleg) : null,
            max_teams: divMaxTeams ? Number(divMaxTeams) : null,
            seasonId: workingSeasonId,
          }),
        'Could not create division',
      )
      report(
        'ok',
        workingIsDraft
          ? `Created ${created.name} in the draft. It is not visible on the public site yet.`
          : `Created division ${created.name}.`,
      )
      setDivName('')
      setDivPromo('')
      setDivReleg('')
      setDivMaxTeams('')
      setCreateDivOpen(false)
      await refresh()
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
            max_teams: editDivMaxTeams ? Number(editDivMaxTeams) : null,
          }),
        'Could not update division',
      )
      report('ok', `Updated division ${editDivName.trim()}.`)
      setEditingDiv(null)
      await refresh()
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
      await refresh()
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
        () => updateDivisionOrder(nextList.map((d) => d.id), workingSeasonId ?? undefined),
        'Could not reorder divisions',
      )
      report('ok', `Moved ${moved.name} ${direction < 0 ? 'up' : 'down'} the ladder.`)
      await refresh()
    } catch {
      await refresh()
    }
  }

  return (
    <div className="adm-stack">
      {/* Live Season Hero Card */}
      <section className="adm-card adm-card-accent">
        <div className="adm-card-head">
          <div>
            <span className="adm-eyebrow">ACTIVE COMPETITION SEASON</span>
            <h2>
              {liveSeason
                ? `${liveSeason.name} (${liveSeason.year})`
                : loading
                  ? 'Loading…'
                  : 'No Active Season'}
            </h2>
          </div>
          <div className="adm-row-actions">
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => setNewSeasonOpen(true)}
            >
              + New Draft Season
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
              value={liveSeason?.id ?? ''}
              disabled={busy}
              onChange={(e) => void handleSwitchSeason(Number(e.target.value))}
              className="adm-select"
            >
              {publishedSeasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.year}) {Boolean(s.is_current) ? '· LIVE NOW' : '· Archived'}
                </option>
              ))}
            </select>
            <span className="adm-field-hint">
              Drafts are hidden from this list. Use Publish to make one live.
            </span>
          </label>

          {Boolean(workingSeason?.is_current) && divisions.length > 0 && (
            <label className="adm-field">
              <span>Homepage Featured Division Table</span>
              <select
                value={featuredDivisionId}
                disabled={busy || !workingSeason}
                onChange={(e) => void handleFeaturedDivision(e.target.value)}
                className="adm-select"
              >
                <option value="">Default (Highest-ranked active division)</option>
                {divisions
                  .filter(
                    (d) => Boolean(d.is_active) || String(d.id) === featuredDivisionId,
                  )
                  .map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                      {!Boolean(d.is_active) ? ' (paused)' : ''}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>

        {rollover && (
          <div className="adm-rollover-banner">
            <div>
              <strong>Rollover for this season:</strong> Opened <strong>{rollover.season.name}</strong>{' '}
              from <strong>{rollover.sourceSeason.name}</strong> ({rollover.movedClubs} club movements
              applied).
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

      {/* Season workspace picker */}
      <section className="adm-card">
        <div className="adm-card-head">
          <div>
            <span className="adm-eyebrow">SEASON WORKSPACE</span>
            <h2>All Seasons ({seasons.length})</h2>
          </div>
          <label className="adm-field adm-workspace-select">
            <span>Working on</span>
            <select
              value={workingSeasonId ?? ''}
              disabled={busy || seasons.length === 0}
              onChange={(e) => setWorkingSeasonId(Number(e.target.value))}
              className="adm-select"
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} ({season.year}) · {seasonStatusLabel(season)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="adm-season-list">
          {seasons.map((season) => {
            const live = Boolean(season.is_current)
            const draft = Boolean(season.is_draft)
            const selected = season.id === workingSeasonId
            return (
              <div
                key={season.id}
                className={`adm-season-row ${selected ? 'is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`Open ${season.name} (${season.year})`}
                title={`Open ${season.name} (${season.year})`}
                onClick={() => setWorkingSeasonId(season.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setWorkingSeasonId(season.id)
                  }
                }}
              >
                <div className="adm-season-row-main">
                  <span className="adm-season-name">
                    {season.name} <span>({season.year})</span>
                  </span>
                  <span className={`adm-status-badge ${seasonStatusClass(season)}`}>
                    {seasonStatusLabel(season)}
                  </span>
                  {selected && <span className="adm-code-pill">Working here</span>}
                </div>
                <div
                  className="adm-row-actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {draft && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-success adm-btn-sm"
                      disabled={busy}
                      onClick={() => void openPublish(season)}
                    >
                      Publish
                    </button>
                  )}
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    disabled={busy}
                    onClick={() => openRename(season)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    disabled={busy}
                    onClick={() => handleOpenResetModal(season)}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-danger adm-btn-sm"
                    disabled={busy || live}
                    title={live ? 'Switch the live season before deleting it' : 'Delete this season'}
                    onClick={() => openDelete(season)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Draft banner */}
      {workingIsDraft && workingSeason && (
        <section className="adm-card adm-draft-banner">
          <div>
            <span className="adm-eyebrow">DRAFT SEASON · HIDDEN FROM THE PUBLIC SITE</span>
            <h2>{workingSeason.name}</h2>
            <p>
              Divisions and club assignments below are saved to the draft only. The public site
              keeps showing {liveSeason?.name ?? 'the live season'} until you publish.
            </p>
          </div>
          <button
            type="button"
            className="adm-btn adm-btn-success"
            disabled={busy}
            onClick={() => void openPublish(workingSeason)}
          >
            Publish Season
          </button>
        </section>
      )}

      {/* Division Tiers Ladder */}
      <section className="adm-card">
        <div className="adm-card-head">
          <div>
            <span className="adm-eyebrow">
              {workingIsDraft ? 'DRAFT DIVISION LADDER (TOP TO BOTTOM TIER)' : 'DIVISION LADDER (TOP TO BOTTOM TIER)'}
            </span>
            <h2>
              Division Tiers ({divisions.length}){workingSeason ? ` · ${workingSeason.name}` : ''}
            </h2>
          </div>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            disabled={!workingEditable || busy}
            onClick={() => setCreateDivOpen(true)}
          >
            + Add Division Tier
          </button>
        </div>

        {!workingEditable && workingSeason && (
          <div className="adm-empty">
            {workingSeason.name} is archived. Switch to the live season or a draft to edit it.
          </div>
        )}

        {loading ? (
          <div className="adm-empty">Loading divisions…</div>
        ) : divisions.length === 0 ? (
          <div className="adm-empty">
            {workingIsDraft
              ? 'This draft has no divisions yet. Add the first tier below.'
              : 'No divisions configured for this season.'}
          </div>
        ) : (
          <div className="adm-div-grid">
            {divisions.map((div, idx) => {
              const isActive = Boolean(div.is_active)
              const divClubs = clubs.filter(
                (c) => c.status === 'active' && c.division_id === div.id,
              )
              const isFeatured =
                Boolean(workingSeason?.is_current) && workingSeason?.featured_division_id === div.id
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
                        disabled={idx === 0 || busy || !workingEditable}
                        onClick={() => void handleMoveDivision(idx, -1)}
                        title="Move tier up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        disabled={idx === divisions.length - 1 || busy || !workingEditable}
                        onClick={() => void handleMoveDivision(idx, 1)}
                        title="Move tier down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        disabled={!workingEditable || busy}
                        onClick={() => {
                          setEditingDiv(div)
                          setEditDivName(div.name)
                          setEditDivPromo(
                            div.promotion_count != null ? String(div.promotion_count) : '',
                          )
                          setEditDivReleg(
                            div.relegation_count != null ? String(div.relegation_count) : '',
                          )
                          setEditDivMaxTeams(
                            div.max_teams != null ? String(div.max_teams) : '',
                          )
                        }}
                      >
                        Edit Rules
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn-primary adm-btn-sm"
                        disabled={!workingEditable || busy}
                        onClick={() => setManageDiv(div)}
                      >
                        Manage Clubs
                      </button>
                      <button
                        type="button"
                        className={`adm-btn adm-btn-sm ${isActive ? 'adm-btn-ghost' : 'adm-btn-success'}`}
                        disabled={!workingEditable || busy}
                        onClick={() => void handleToggleDivisionActive(div)}
                      >
                        {isActive ? 'Pause League' : 'Resume League'}
                      </button>
                    </div>
                  </div>

                  <div className="adm-div-meta">
                    <span>
                      <strong>{divClubs.length}</strong>
                      {div.max_teams ? ` / ${div.max_teams}` : ''} active clubs
                      {div.max_teams && divClubs.length >= div.max_teams ? (
                        <span style={{ marginLeft: 6, color: '#ef4444', fontWeight: 'bold', fontSize: '11px' }}>
                          (FULL)
                        </span>
                      ) : null}
                    </span>
                    <span>
                      Capacity: <strong>{div.max_teams ? `${div.max_teams} teams max` : 'Unlimited'}</strong>
                    </span>
                    <span>
                      Promotion: <strong>{div.promotion_count ? `Top ${div.promotion_count}` : 'None'}</strong>
                    </span>
                    <span>
                      Relegation: <strong>{div.relegation_count ? `Bottom ${div.relegation_count}` : 'None'}</strong>
                    </span>
                  </div>

                  {divClubs.length > 0 ? (
                    <div className="adm-div-clubs">
                      {divClubs.map((c) => (
                        <span key={c.id} className="adm-club-chip">
                          {c.logo_local && <img src={c.logo_local} alt="" />}
                          {c.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="adm-text-muted adm-div-empty-hint">
                      No clubs yet. Use Manage Clubs to add them{workingIsDraft ? ' to the draft' : ''}.
                    </p>
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
        onCompleted={(seasonId) => {
          setWorkingSeasonId(seasonId)
          void (async () => {
            await loadSeasons()
            await loadWorkspace(seasonId)
          })()
        }}
        onUndone={(seasonId) => {
          setWorkingSeasonId(seasonId)
          void (async () => {
            await loadSeasons()
            await loadWorkspace(seasonId)
          })()
        }}
        guard={guard}
        report={report}
      />

      {/* Rename Season Modal */}
      {renameOpen && renameTarget && (
        <div className="adm-modal-backdrop" onClick={() => setRenameOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <h3>Rename Season: {renameTarget.name}</h3>
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
              <h3>Create New Draft Season</h3>
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
                Copies the live season&apos;s divisions and club memberships into a private draft.
                Nothing appears on the public site until you publish it. If you want automatic
                promotion &amp; relegation, use the Rollover Wizard instead — that also creates a
                draft now.
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
                  Create Draft
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
              <h3>
                Add Division Tier{workingSeason ? ` to ${workingSeason.name}` : ''}
              </h3>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setCreateDivOpen(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateDivision} className="adm-form-stack">
              {workingIsDraft && (
                <p className="adm-text-muted">
                  This division is being created inside a draft. It stays private until the season
                  is published.
                </p>
              )}
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
              <label className="adm-field">
                <span>Max Division Size (Teams)</span>
                <input
                  type="number"
                  min={2}
                  max={100}
                  placeholder="e.g. 18 (leave blank for unlimited)"
                  value={divMaxTeams}
                  onChange={(e) => setDivMaxTeams(e.target.value)}
                  className="adm-input"
                />
                <span className="adm-field-hint">
                  Leave blank or 0 for unlimited clubs. Common league sizes: 16, 18, 20.
                </span>
              </label>
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
              <label className="adm-field">
                <span>Max Division Size (Teams)</span>
                <input
                  type="number"
                  min={2}
                  max={100}
                  placeholder="e.g. 18 (leave blank for unlimited)"
                  value={editDivMaxTeams}
                  onChange={(e) => setEditDivMaxTeams(e.target.value)}
                  className="adm-input"
                />
                <span className="adm-field-hint">Leave blank or 0 for unlimited.</span>
              </label>
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

      {/* Manage Clubs Modal */}
      {manageDiv && workingSeason && (
        <ManageDivisionClubs
          division={manageDiv}
          season={workingSeason}
          clubs={clubs}
          guard={guard}
          report={report}
          onClose={() => setManageDiv(null)}
          onChanged={() => refresh()}
        />
      )}

      {/* Publish Season Modal */}
      {publishTarget && (
        <div className="adm-modal-backdrop" onClick={() => setPublishTarget(null)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="adm-modal-head">
              <h3>Publish {publishTarget.season.name}?</h3>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setPublishTarget(null)}
              >
                ×
              </button>
            </div>
            <div className="adm-form-stack">
              <p className="adm-text-muted">
                Publishing makes this season the live season immediately. The public site,
                standings, fixtures and results pages will switch to it.
              </p>
              {publishTarget.warnings.length > 0 ? (
                <div className="adm-publish-warnings">
                  <strong>Heads up before you publish:</strong>
                  <ul>
                    {publishTarget.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                  <p>You can publish anyway and fix these afterwards.</p>
                </div>
              ) : (
                <div className="adm-publish-ok">
                  ✓ No issues found — every division has clubs and at least one is active.
                </div>
              )}
              <div className="adm-modal-foot">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setPublishTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-success"
                  disabled={busy}
                  onClick={() => void handlePublishSeason()}
                >
                  {busy ? 'Publishing…' : 'Publish Season'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Season Modal */}
      {deleteTarget && (
        <div className="adm-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="adm-modal-head">
              <h3 style={{ color: 'var(--adm-danger, #ef4444)' }}>
                Delete Season: {deleteTarget.name}
              </h3>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setDeleteTarget(null)}
              >
                ×
              </button>
            </div>
            <div className="adm-form-stack">
              <div className="adm-publish-warnings">
                <strong>This cannot be undone.</strong> Deleting removes the season, its divisions,
                club memberships and standings. Seasons with fixtures or results are protected, and
                the live season must be switched first.
              </div>
              <label className="adm-field">
                <span>
                  To confirm, type <strong>{deleteTarget.name}</strong>:
                </span>
                <input
                  type="text"
                  required
                  placeholder={deleteTarget.name}
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  className="adm-input"
                  autoFocus
                />
              </label>
              <div className="adm-modal-foot">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-danger"
                  disabled={
                    busy ||
                    deleteConfirmName.trim().toLowerCase() !== deleteTarget.name.trim().toLowerCase()
                  }
                  onClick={() => void handleDeleteSeason()}
                >
                  {busy ? 'Deleting…' : 'Delete Season'}
                </button>
              </div>
            </div>
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
                <strong>Warning:</strong> Resetting this season will restore standings and match
                results back to their initial unplayed state. This operation cannot be undone.
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
                <span>Fixtures &amp; Schedule Handling</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: !resetDeleteFixtures
                        ? '1px solid var(--adm-accent, #3b82f6)'
                        : '1px solid var(--adm-border, #334155)',
                      backgroundColor: !resetDeleteFixtures
                        ? 'rgba(59, 130, 246, 0.06)'
                        : 'transparent',
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
                        Keeps all match kickoff dates, times, and rounds, but resets match scores,
                        events, and status back to unplayed (0-0 scheduled).
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
                      border: resetDeleteFixtures
                        ? '1px solid #ef4444'
                        : '1px solid var(--adm-border, #334155)',
                      backgroundColor: resetDeleteFixtures
                        ? 'rgba(239, 68, 68, 0.06)'
                        : 'transparent',
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
                        Completely wipe match schedule &amp; fixtures
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--adm-muted, #94a3b8)' }}>
                        Deletes every fixture/match row in this season so you can generate a brand
                        new round-robin schedule from scratch.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="adm-field">
                <span>Standings &amp; Player Stats</span>
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

/**
 * Add or remove clubs from one division.
 *
 * Assignments are written immediately rather than staged in the browser: inside
 * a draft that is already private, and inside the live season the previous
 * behaviour was immediate too. The modal simply makes the pool of clubs
 * discoverable instead of hiding it behind the Clubs page.
 */
function ManageDivisionClubs({
  division,
  season,
  clubs,
  guard,
  report,
  onClose,
  onChanged,
}: {
  division: Division
  season: AdminSeason
  clubs: Club[]
  guard: Guard
  report: Report
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [busyClub, setBusyClub] = useState<number | null>(null)
  const draft = Boolean(season.is_draft)

  const members = clubs
    .filter((club) => club.division_id === division.id)
    .sort((a, b) => a.name.localeCompare(b.name))
  const available = clubs
    .filter((club) => club.status === 'active' && club.division_id !== division.id)
    .filter((club) => club.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const change = async (club: Club, targetDivisionId: number | null) => {
    setBusyClub(club.id)
    try {
      await guard(
        () => assignDivision(club.slug, targetDivisionId, season.id),
        targetDivisionId === null
          ? `Could not remove ${club.name} from ${division.name}`
          : `Could not add ${club.name} to ${division.name}`,
      )
      report(
        'ok',
        targetDivisionId === null
          ? `${club.name} removed from ${division.name}.`
          : `${club.name} added to ${division.name}${draft ? ' (draft — hidden until publish)' : ''}.`,
      )
      await onChanged()
    } catch {
      /* reported */
    } finally {
      setBusyClub(null)
    }
  }

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div
        className="adm-modal adm-club-picker"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 760 }}
      >
        <div className="adm-modal-head">
          <div>
            <h3>Manage Clubs · {division.name}</h3>
            <p className="adm-text-muted" style={{ margin: '4px 0 0' }}>
              {season.name} · {draft ? 'Draft — changes stay private until you publish' : 'Live season — changes appear immediately'}
            </p>
          </div>
          <button type="button" className="adm-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="adm-form-stack">
          <div className="adm-div-meta">
            <span>
              <strong>{members.length}</strong>
              {division.max_teams ? ` / ${division.max_teams}` : ''} clubs in this division
            </span>
            {division.max_teams != null &&
              division.max_teams > 0 &&
              members.length >= division.max_teams && (
              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>FULL</span>
            )}
          </div>

          <div className="adm-picker-columns">
            <div className="adm-picker-column">
              <h4>In {division.name}</h4>
              {members.length === 0 ? (
                <p className="adm-text-muted">No clubs yet.</p>
              ) : (
                <ul className="adm-picker-list">
                  {members.map((club) => (
                    <li key={club.id} className="adm-picker-row">
                      <span className="adm-picker-club">
                        {club.logo_local && <img src={club.logo_local} alt="" />}
                        {club.name}
                      </span>
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        disabled={busyClub !== null}
                        onClick={() => void change(club, null)}
                      >
                        {busyClub === club.id ? '…' : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="adm-picker-column">
              <h4>Available clubs</h4>
              <input
                type="search"
                className="adm-input"
                placeholder="Search clubs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {available.length === 0 ? (
                <p className="adm-text-muted">
                  {clubs.some((club) => club.status === 'active')
                    ? 'Every matching club is already in this division.'
                    : 'No active clubs are available.'}
                </p>
              ) : (
                <ul className="adm-picker-list">
                  {available.map((club) => (
                    <li key={club.id} className="adm-picker-row">
                      <span className="adm-picker-club">
                        {club.logo_local && <img src={club.logo_local} alt="" />}
                        {club.name}
                        {club.division_id != null && (
                          <span className="adm-text-muted" style={{ fontSize: 11 }}>
                            (currently in another tier)
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="adm-btn adm-btn-primary adm-btn-sm"
                        disabled={busyClub !== null}
                        onClick={() => void change(club, division.id)}
                      >
                        {busyClub === club.id ? '…' : 'Add'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="adm-modal-foot">
            <button type="button" className="adm-btn adm-btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
