import { useCallback, useEffect, useRef, useState } from 'react'
import {
  assignDivision,
  decideClub,
  deleteAdminClub,
  getAdminClubs,
  getAdminPlayers,
  getAdminSeasons,
  getAdminUsers,
  getDivisions,
  getMatchPriorities,
  getPendingClubs,
  getSiteContent,
  setResult,
  type AdminSeason,
  type Club,
  type Division,
  type Match,
  type PendingClub,
} from '../api'
import { formatKickoffDisplay, type Guard, type Report } from '../utils'

export function OverviewView({
  guard,
  report,
  onNavigate,
  onPendingCountChange,
}: {
  guard: Guard
  report: Report
  onNavigate: (tab: 'overview' | 'clubs' | 'matches' | 'seasons' | 'users' | 'website', sub?: string) => void
  onPendingCountChange: (count: number) => void
}) {
  const [loading, setLoading] = useState(true)
  const hasLoadedRef = useRef(false)
  const [currentSeason, setCurrentSeason] = useState<AdminSeason | null>(null)
  const [clubs, setClubs] = useState<Club[]>([])
  const [pendingClubs, setPendingClubs] = useState<PendingClub[]>([])
  const [priorityMatches, setPriorityMatches] = useState<Match[]>([])
  const [priorityTotal, setPriorityTotal] = useState(0)
  const [divisions, setDivisions] = useState<Division[]>([])
  const [userCount, setUserCount] = useState(0)
  const [playerCount, setPlayerCount] = useState(0)
  const [newsCount, setNewsCount] = useState(0)
  const [scores, setScores] = useState<Record<number, { hs: string; as: string }>>({})
  const [busyId, setBusyId] = useState<string | number | null>(null)

  // Pagination & bulk selection for Pending Club Applications on Overview
  const [pendingPage, setPendingPage] = useState(1)
  const pendingPageSize = 5
  const [selectedPendingSlugs, setSelectedPendingSlugs] = useState<Set<string>>(new Set())
  const [pendingBulkDivisionId, setPendingBulkDivisionId] = useState<string>('')
  const [pendingBulkBusy, setPendingBulkBusy] = useState(false)

  const loadAll = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true)
    try {
      const [seasonsList, clubsList, pendingList, prioritiesRes, divsList, usersList, playersList, cms] =
        await Promise.all([
          guard(getAdminSeasons, 'Could not load seasons'),
          guard(() => getAdminClubs(), 'Could not load clubs'),
          guard(getPendingClubs, 'Could not load pending applications'),
          guard(() => getMatchPriorities({ limit: 8, offset: 0 }), 'Could not load priority matches'),
          guard(() => getDivisions(), 'Could not load divisions'),
          guard(getAdminUsers, 'Could not load users'),
          guard(getAdminPlayers, 'Could not load players'),
          guard(getSiteContent, 'Could not load site content'),
        ])
      const activeSeason = seasonsList.find((s) => Boolean(s.is_current)) ?? seasonsList[0] ?? null
      setCurrentSeason(activeSeason)
      setClubs(clubsList)
      setPendingClubs(pendingList)
      onPendingCountChange(pendingList.length)
      setPriorityMatches(prioritiesRes.matches)
      setPriorityTotal(prioritiesRes.total)
      setDivisions(divsList)
      setUserCount(usersList.length)
      setPlayerCount(playersList.length)
      setNewsCount(Array.isArray(cms?.news) ? cms.news.length : 0)

      const nextScores: Record<number, { hs: string; as: string }> = {}
      for (const m of prioritiesRes.matches) {
        nextScores[m.id] = {
          hs: m.home_score != null ? String(m.home_score) : '',
          as: m.away_score != null ? String(m.away_score) : '',
        }
      }
      setScores(nextScores)
      hasLoadedRef.current = true
    } catch {
      /* guard already reported */
    } finally {
      setLoading(false)
    }
  }, [guard, onPendingCountChange])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const handlePurge = async (club: PendingClub) => {
    const ident = club.display_name || club.email ? ` and manager account (${club.display_name || club.email})` : ''
    if (
      !window.confirm(
        `Permanently purge pending application "${club.name}"${ident}? This completely deletes the club and fake manager account with zero leftovers.`
      )
    ) {
      return
    }
    setBusyId(club.slug)
    try {
      await guard(
        () => decideClub(club.slug, 'purge', true),
        `Could not purge ${club.name}`,
      )
      report('ok', `Purged ${club.name} and removed manager account.`)
      setSelectedPendingSlugs((prev) => {
        const next = new Set(prev)
        next.delete(club.slug)
        return next
      })
      await loadAll()
    } catch {
      /* handled */
    } finally {
      setBusyId(null)
    }
  }

  const handleBulkPendingPurge = async () => {
    if (selectedPendingSlugs.size === 0) return
    const slugs = [...selectedPendingSlugs]
    if (
      !window.confirm(
        `Permanently purge ${slugs.length} selected pending application(s) AND their manager accounts? This deletes all fake clubs and manager user accounts with zero leftovers.`
      )
    ) {
      return
    }
    setPendingBulkBusy(true)
    try {
      for (const slug of slugs) {
        await decideClub(slug, 'purge', true)
      }
      report('ok', `Purged ${slugs.length} pending application(s) and associated manager accounts.`)
      setSelectedPendingSlugs(new Set())
      await loadAll()
    } catch (err) {
      report('error', err instanceof Error ? err.message : 'Bulk purge failed.')
    } finally {
      setPendingBulkBusy(false)
    }
  }

  const handleDecision = async (club: PendingClub, decision: 'approve' | 'reject') => {
    setBusyId(club.slug)
    try {
      await guard(
        () => decideClub(club.slug, decision),
        `Could not ${decision} ${club.name}`,
      )
      report(
        'ok',
        decision === 'approve'
          ? `${club.name} approved and published! Assign it to a division when ready.`
          : `${club.name} application declined.`,
      )
      setSelectedPendingSlugs((prev) => {
        const next = new Set(prev)
        next.delete(club.slug)
        return next
      })
      await loadAll()
    } catch {
      /* handled */
    } finally {
      setBusyId(null)
    }
  }

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
          ? `Approved ${slugs.length} club application(s).`
          : `Rejected ${slugs.length} club application(s).`,
      )
      setSelectedPendingSlugs(new Set())
      setPendingBulkDivisionId('')
      await loadAll()
    } catch (err) {
      report('error', err instanceof Error ? err.message : `Bulk ${decision} failed.`)
    } finally {
      setPendingBulkBusy(false)
    }
  }

  const handleBulkPendingDelete = async () => {
    if (selectedPendingSlugs.size === 0) return
    const slugs = [...selectedPendingSlugs]
    if (!window.confirm(`Permanently delete ${slugs.length} selected pending application(s)?`)) {
      return
    }
    setPendingBulkBusy(true)
    try {
      for (const slug of slugs) {
        await deleteAdminClub(slug)
      }
      report('ok', `Deleted ${slugs.length} pending application(s).`)
      setSelectedPendingSlugs(new Set())
      await loadAll()
    } catch (err) {
      report('error', err instanceof Error ? err.message : 'Bulk delete failed.')
    } finally {
      setPendingBulkBusy(false)
    }
  }

  const handleQuickScore = async (match: Match) => {
    const pair = scores[match.id] ?? { hs: '', as: '' }
    const hs = Number.parseInt(pair.hs, 10)
    const as = Number.parseInt(pair.as, 10)
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) {
      report('error', 'Enter whole numbers (0 or higher) for both home and away scores.')
      return
    }
    setBusyId(match.id)
    try {
      await guard(() => setResult(match.id, hs, as), 'Could not save match score')
      report('ok', `Saved result: ${match.home_name} ${hs} – ${as} ${match.away_name}`)
      await loadAll()
    } catch {
      /* handled */
    } finally {
      setBusyId(null)
    }
  }

  const activeClubs = clubs.filter((c) => c.status === 'active')
  const unassignedActiveClubs = activeClubs.filter((c) => c.division_id === null)
  const activeDivisions = divisions.filter((d) => Boolean(d.is_active))

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

  return (
    <div className="adm-stack">
      {/* Priority Action Alerts */}
      {(pendingClubs.length > 0 || priorityTotal > 0 || unassignedActiveClubs.length > 0) && (
        <div className="adm-alert-strip">
          {pendingClubs.length > 0 && (
            <div className="adm-alert-card adm-alert-warning">
              <div className="adm-alert-body">
                <span className="adm-alert-badge">{pendingClubs.length} Pending</span>
                <strong>Club application{pendingClubs.length === 1 ? '' : 's'} waiting for review</strong>
                <p>Managers have signed up and uploaded their club details. Approve them so they appear on the site.</p>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                onClick={() => onNavigate('clubs', 'pending')}
              >
                Review Applications →
              </button>
            </div>
          )}

          {priorityTotal > 0 && (
            <div className="adm-alert-card adm-alert-info">
              <div className="adm-alert-body">
                <span className="adm-alert-badge">{priorityTotal} Fixtures</span>
                <strong>Matches need a kickoff date or final score</strong>
                <p>Enter match scores below or schedule kickoff times in the Match Centre.</p>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-secondary"
                onClick={() => onNavigate('matches', 'fixtures')}
              >
                Open Match Centre →
              </button>
            </div>
          )}

          {unassignedActiveClubs.length > 0 && (
            <div className="adm-alert-card adm-alert-neutral">
              <div className="adm-alert-body">
                <span className="adm-alert-badge">{unassignedActiveClubs.length} Unassigned</span>
                <strong>Active clubs not yet placed in a division</strong>
                <p>Assign them to a division so they appear in the league standings table.</p>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-secondary"
                onClick={() => onNavigate('clubs', 'unassigned')}
              >
                Assign Divisions →
              </button>
            </div>
          )}
        </div>
      )}

      {/* KPI Metrics Grid */}
      <div className="adm-kpi-grid">
        <button
          type="button"
          className="adm-kpi-card"
          onClick={() => onNavigate('clubs', 'all')}
        >
          <span className="adm-kpi-label">Active Clubs</span>
          <strong className="adm-kpi-value">{loading ? '—' : activeClubs.length}</strong>
          <span className="adm-kpi-sub">
            {unassignedActiveClubs.length > 0
              ? `${unassignedActiveClubs.length} awaiting division`
              : 'All assigned to divisions'}
          </span>
        </button>

        <button
          type="button"
          className={`adm-kpi-card ${pendingClubs.length > 0 ? 'is-highlight' : ''}`}
          onClick={() => onNavigate('clubs', 'pending')}
        >
          <span className="adm-kpi-label">Pending Applications</span>
          <strong className="adm-kpi-value">{loading ? '—' : pendingClubs.length}</strong>
          <span className="adm-kpi-sub">
            {pendingClubs.length > 0 ? 'Needs admin approval' : 'All caught up'}
          </span>
        </button>

        <button
          type="button"
          className="adm-kpi-card"
          onClick={() => onNavigate('matches', 'fixtures')}
        >
          <span className="adm-kpi-label">Priority Fixtures</span>
          <strong className="adm-kpi-value">{loading ? '—' : priorityTotal}</strong>
          <span className="adm-kpi-sub">Today, overdue, or unscheduled</span>
        </button>

        <button
          type="button"
          className="adm-kpi-card"
          onClick={() => onNavigate('seasons')}
        >
          <span className="adm-kpi-label">Current Season</span>
          <strong className="adm-kpi-value">{currentSeason ? currentSeason.name : '—'}</strong>
          <span className="adm-kpi-sub">{activeDivisions.length} active division tiers</span>
        </button>

        <button
          type="button"
          className="adm-kpi-card"
          onClick={() => onNavigate('users', 'accounts')}
        >
          <span className="adm-kpi-label">Users & Players</span>
          <strong className="adm-kpi-value">{loading ? '—' : `${userCount} / ${playerCount}`}</strong>
          <span className="adm-kpi-sub">{userCount} accounts · {playerCount} players</span>
        </button>

        <button
          type="button"
          className="adm-kpi-card"
          onClick={() => onNavigate('website', 'news')}
        >
          <span className="adm-kpi-label">Website Content</span>
          <strong className="adm-kpi-value">{loading ? '—' : `${newsCount} posts`}</strong>
          <span className="adm-kpi-sub">Flags, Formats, News, Passes & FAQ</span>
        </button>
      </div>

      {/* Quick Actions Bar */}
      <section className="adm-card">
        <div className="adm-card-head">
          <div>
            <span className="adm-eyebrow">SHORTCUTS</span>
            <h2>Quick Actions</h2>
          </div>
          <button type="button" className="adm-btn adm-btn-ghost" onClick={() => void loadAll()}>
            ↻ Refresh Data
          </button>
        </div>
        <div className="adm-quick-actions">
          <button
            type="button"
            className="adm-action-tile"
            onClick={() => onNavigate('clubs', 'create')}
          >
            <span className="adm-action-icon">🛡️</span>
            <div>
              <strong>Add a New Club</strong>
              <small>Create club, upload crest & assign division</small>
            </div>
          </button>
          <button
            type="button"
            className="adm-action-tile"
            onClick={() => onNavigate('matches', 'schedule')}
          >
            <span className="adm-action-icon">⚽</span>
            <div>
              <strong>Schedule or Generate Matches</strong>
              <small>Create single fixture or full round-robin</small>
            </div>
          </button>
          <button
            type="button"
            className="adm-action-tile"
            onClick={() => onNavigate('website', 'flags')}
          >
            <span className="adm-action-icon">🏳️</span>
            <div>
              <strong>Edit Homepage & Flag Rail</strong>
              <small>1:1 live flag rail preview & featured crests</small>
            </div>
          </button>
          <button
            type="button"
            className="adm-action-tile"
            onClick={() => onNavigate('website', 'news')}
          >
            <span className="adm-action-icon">📰</span>
            <div>
              <strong>Publish News or Update Site Info</strong>
              <small>Post articles, edit entry passes, fees & FAQ</small>
            </div>
          </button>
        </div>
      </section>

      {/* Two-Column Operational Queues */}
      <div className="adm-two-col">
        {/* Left: Pending Club Applications */}
        <section className="adm-card">
          <div className="adm-card-head">
            <div>
              <span className="adm-eyebrow">APPROVAL QUEUE</span>
              <h2>Pending Club Applications ({pendingClubs.length})</h2>
            </div>
            <div className="adm-row-actions">
              {pendingClubs.length > 0 && (
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
                  Select Page
                </label>
              )}
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
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={() => onNavigate('clubs', 'pending')}
              >
                Open in Clubs →
              </button>
            </div>
          </div>

          {pendingClubs.length === 0 ? (
            <div className="adm-empty">
              <p>No pending club applications right now.</p>
              <small>When a manager signs up on /register, their club and uploaded crest appear here.</small>
            </div>
          ) : (
            <>
              <div className="adm-list">
                {pagedPendingClubs.map((club) => {
                  const logo = club.logo_local || club.logo_url
                  const isBusy = busyId === club.slug
                  const isSelected = selectedPendingSlugs.has(club.slug)
                  return (
                    <div
                      key={`${club.id}-${club.user_id ?? 'none'}`}
                      className={`adm-list-row ${isSelected ? 'is-selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectPendingOne(club.slug)}
                        aria-label={`Select application ${club.name}`}
                      />
                      <div className="adm-club-visual">
                        {logo ? (
                          <img src={logo} alt={club.name} className="adm-crest-md" />
                        ) : (
                          <div className="adm-crest-placeholder">
                            {(club.short_code || club.name).slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="adm-list-main">
                        <div className="adm-club-cell-info">
                          <div className="adm-row-title">
                            <strong>{club.name}</strong>
                            {club.short_code && <span className="adm-code-pill">{club.short_code}</span>}
                            {club.flag && <span>{club.flag}</span>}
                          </div>
                          <span className="adm-club-manager-sub">
                            Manager: <strong>{club.display_name || 'Unnamed'}</strong> (
                            {club.email || 'no email'}) · {club.players} player
                            {club.players === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                      <div className="adm-row-actions">
                        <button
                          type="button"
                          className="adm-btn adm-btn-success adm-btn-sm"
                          disabled={isBusy}
                          onClick={() => void handleDecision(club, 'approve')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn-danger adm-btn-sm"
                          disabled={isBusy}
                          onClick={() => void handleDecision(club, 'reject')}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn-danger adm-btn-sm"
                          style={{ backgroundColor: '#7f1d1d', borderColor: '#991b1b', color: '#fff' }}
                          disabled={isBusy}
                          title="Permanently delete this pending club and purge the manager account"
                          onClick={() => void handlePurge(club)}
                        >
                          🗑️ Purge Fake Account
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
                    {pendingClubs.length} (Page {safePendingPage}/{totalPendingPages})
                  </span>
                  <div className="adm-row-actions">
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      disabled={safePendingPage <= 1}
                      onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                    >
                      ← Prev
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
              {selectedPendingSlugs.size > 0 && (
                <div className="adm-bulk-bar">
                  <strong>{selectedPendingSlugs.size} selected</strong>
                  <select
                    value={pendingBulkDivisionId}
                    onChange={(e) => setPendingBulkDivisionId(e.target.value)}
                    className="adm-select adm-select-sm"
                  >
                    <option value="">Optional: Division on Approve…</option>
                    {activeDivisions.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="adm-btn adm-btn-success adm-btn-sm"
                    disabled={pendingBulkBusy}
                    onClick={() => void handleBulkPendingDecision('approve')}
                  >
                    ✓ Approve ({selectedPendingSlugs.size})
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-danger adm-btn-sm"
                    disabled={pendingBulkBusy}
                    onClick={() => void handleBulkPendingDecision('reject')}
                  >
                    ✕ Reject
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-danger adm-btn-sm"
                    disabled={pendingBulkBusy}
                    onClick={() => void handleBulkPendingDelete()}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-danger adm-btn-sm"
                    style={{ backgroundColor: '#7f1d1d', borderColor: '#991b1b', color: '#fff' }}
                    disabled={pendingBulkBusy}
                    title="Permanently delete selected pending clubs and purge all their manager accounts"
                    onClick={() => void handleBulkPendingPurge()}
                  >
                    🗑️ Purge Selected & Delete Accounts ({selectedPendingSlugs.size})
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
            </>
          )}
        </section>

        {/* Right: Priority Fixtures Needing Score / Date */}
        <section className="adm-card">
          <div className="adm-card-head">
            <div>
              <span className="adm-eyebrow">MATCH CENTRE QUEUE</span>
              <h2>Priority Matches ({priorityTotal})</h2>
            </div>
            <button
              type="button"
              className="adm-btn adm-btn-ghost"
              onClick={() => onNavigate('matches', 'fixtures')}
            >
              All Matches →
            </button>
          </div>

          {priorityMatches.length === 0 ? (
            <div className="adm-empty">
              <p>All scheduled matches are up to date.</p>
              <small>Use the Match Centre to schedule new fixtures or generate a round-robin season.</small>
            </div>
          ) : (
            <div className="adm-list">
              {priorityMatches.map((m) => {
                const pair = scores[m.id] ?? { hs: '', as: '' }
                const isBusy = busyId === m.id
                return (
                  <div key={m.id} className="adm-list-row adm-match-quick-row">
                    <div className="adm-list-main">
                      <div className="adm-row-title">
                        <strong>{m.home_name}</strong>
                        <span className="adm-vs">vs</span>
                        <strong>{m.away_name}</strong>
                      </div>
                      <p className="adm-row-sub">{formatKickoffDisplay(m.kickoff)}</p>
                    </div>
                    <div className="adm-score-inline">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        placeholder="H"
                        aria-label={`${m.home_name} score`}
                        value={pair.hs}
                        onChange={(e) =>
                          setScores((prev) => ({
                            ...prev,
                            [m.id]: { ...pair, hs: e.target.value },
                          }))
                        }
                        className="adm-score-input"
                      />
                      <span>:</span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        placeholder="A"
                        aria-label={`${m.away_name} score`}
                        value={pair.as}
                        onChange={(e) =>
                          setScores((prev) => ({
                            ...prev,
                            [m.id]: { ...pair, as: e.target.value },
                          }))
                        }
                        className="adm-score-input"
                      />
                      <button
                        type="button"
                        className="adm-btn adm-btn-primary adm-btn-sm"
                        disabled={isBusy || pair.hs === '' || pair.as === ''}
                        onClick={() => void handleQuickScore(m)}
                      >
                        {isBusy ? '…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
