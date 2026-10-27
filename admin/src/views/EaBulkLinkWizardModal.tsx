import { useEffect, useState } from 'react'
import {
  autoMatchEaClubs,
  bulkLinkEaClubs,
  getEaClubDeepProfile,
  searchEaClubs,
  type AutoMatchItem,
  type Club,
  type Division,
  type EaClubDeepProfile,
  type EaClubSearchResult,
} from '../api'
import type { Guard, Report } from '../utils'

export interface EaBulkLinkWizardModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  clubs: Club[]
  divisions: Division[]
  guard: Guard
  report: Report
}

type WizardStep = 1 | 2 | 3

export function EaBulkLinkWizardModal({
  isOpen,
  onClose,
  onSuccess,
  clubs,
  divisions,
  guard,
  report,
}: EaBulkLinkWizardModalProps) {
  const [step, setStep] = useState<WizardStep>(1)

  // Step 1: Selection State
  const [selectedClubIds, setSelectedClubIds] = useState<Set<number>>(new Set())
  const [clubFilter, setClubFilter] = useState<'unlinked' | 'all'>('unlinked')
  const [selectedDivId, setSelectedDivId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Step 2 & 3: Match State
  const [matching, setMatching] = useState(false)
  const [matchItems, setMatchItems] = useState<AutoMatchItem[]>([])
  const [confirmedClubIds, setConfirmedClubIds] = useState<Set<number>>(new Set())

  // Deep inspection preview state
  const [previewClubId, setPreviewClubId] = useState<string | null>(null)
  const [previewClubName, setPreviewClubName] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deepProfile, setDeepProfile] = useState<EaClubDeepProfile | null>(null)

  // Manual search override state
  const [overrideModalClubId, setOverrideModalClubId] = useState<number | null>(null)
  const [overrideSearchQuery, setOverrideSearchQuery] = useState('')
  const [overrideResults, setOverrideResults] = useState<EaClubSearchResult[]>([])
  const [overrideSearching, setOverrideSearching] = useState(false)

  // Saving state
  const [saving, setSaving] = useState(false)

  // Reset when modal opens
  useEffect(() => {
    if (!isOpen) {
      setStep(1)
      setMatchItems([])
      setDeepProfile(null)
      setPreviewClubId(null)
      return
    }

    // Default select all unlinked active clubs
    const unlinked = clubs.filter((c) => c.status === 'active' && !c.ea_club_id).map((c) => c.id)
    setSelectedClubIds(new Set(unlinked))
  }, [isOpen, clubs])

  // Filtered clubs for Step 1
  const filteredClubs = clubs.filter((c) => {
    if (clubFilter === 'unlinked' && c.ea_club_id) return false
    if (selectedDivId !== 'all') {
      if (selectedDivId === 'unassigned') {
        if (c.division_id != null) return false
      } else if (c.division_id !== Number(selectedDivId)) {
        return false
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = c.name.toLowerCase().includes(q)
      const matchCode = (c.short_code ?? '').toLowerCase().includes(q)
      if (!matchName && !matchCode) return false
    }
    return true
  })

  const toggleClubSelection = (id: number) => {
    const next = new Set(selectedClubIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedClubIds(next)
  }

  const selectAllFiltered = () => {
    const next = new Set(selectedClubIds)
    for (const c of filteredClubs) next.add(c.id)
    setSelectedClubIds(next)
  }

  const deselectAllFiltered = () => {
    const next = new Set(selectedClubIds)
    for (const c of filteredClubs) next.delete(c.id)
    setSelectedClubIds(next)
  }

  // Step 1 -> Step 2: Auto Match
  const handleStartAutoMatch = async () => {
    const toScan = clubs.filter((c) => selectedClubIds.has(c.id))
    if (toScan.length === 0) {
      report('error', 'Select at least one club to match.')
      return
    }

    setMatching(true)
    setStep(2)

    try {
      const items = await guard(
        () =>
          autoMatchEaClubs(
            toScan.map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              ea_club_id: c.ea_club_id,
              ea_club_name: c.ea_club_name,
            })),
          ),
        'Failed to scan EA servers',
      )

      setMatchItems(items)

      // Auto check clubs with exact or high match
      const toConfirm = new Set<number>()
      for (const item of items) {
        if (item.selectedCandidate && (item.matchStatus === 'exact' || item.matchStatus === 'high')) {
          toConfirm.add(item.clubId)
        }
      }
      setConfirmedClubIds(toConfirm)
    } catch {
      setStep(1)
    } finally {
      setMatching(false)
    }
  }

  // Open Deep Profile preview
  const handleOpenDeepProfile = async (eaClubId: string, name: string) => {
    setPreviewClubId(eaClubId)
    setPreviewClubName(name)
    setPreviewLoading(true)
    setDeepProfile(null)

    try {
      const profile = await guard(
        () => getEaClubDeepProfile(eaClubId),
        `Failed to fetch deep stats for EA Club #${eaClubId}`,
      )
      setDeepProfile(profile)
    } catch {
      /* reported */
    } finally {
      setPreviewLoading(false)
    }
  }

  // Handle switching candidate in Step 2 / 3
  const handleSelectCandidate = (clubId: number, cand: EaClubSearchResult | null) => {
    setMatchItems((prev) =>
      prev.map((item) => {
        if (item.clubId !== clubId) return item
        return {
          ...item,
          selectedCandidate: cand,
          matchStatus: cand ? 'high' : 'none',
        }
      }),
    )
    if (cand) {
      setConfirmedClubIds((prev) => new Set(prev).add(clubId))
    } else {
      setConfirmedClubIds((prev) => {
        const next = new Set(prev)
        next.delete(clubId)
        return next
      })
    }
  }

  // Manual Override Search
  const handleOpenOverrideSearch = (clubId: number, clubName: string) => {
    setOverrideModalClubId(clubId)
    setOverrideSearchQuery(clubName)
    setOverrideResults([])
    void triggerOverrideSearch(clubName)
  }

  const triggerOverrideSearch = async (query: string) => {
    const q = query.trim()
    if (!q || q.length < 2) return
    setOverrideSearching(true)
    try {
      const results = await guard(() => searchEaClubs(q), 'Failed to search EA')
      setOverrideResults(results)
    } catch {
      /* reported */
    } finally {
      setOverrideSearching(false)
    }
  }

  const handleApplyOverride = (cand: EaClubSearchResult) => {
    if (overrideModalClubId === null) return
    handleSelectCandidate(overrideModalClubId, cand)
    setOverrideModalClubId(null)
    report('ok', `Matched with EA Club "${cand.name}" (#${cand.clubId})`)
  }

  // Step 3: Commit Bulk Link
  const handleCommitBulkLink = async () => {
    const links: Array<{ clubId: number; eaClubId: string; eaClubName: string }> = []

    for (const item of matchItems) {
      if (confirmedClubIds.has(item.clubId) && item.selectedCandidate) {
        links.push({
          clubId: item.clubId,
          eaClubId: item.selectedCandidate.clubId,
          eaClubName: item.selectedCandidate.name,
        })
      }
    }

    if (links.length === 0) {
      report('error', 'No clubs with confirmed EA matches selected to link.')
      return
    }

    setSaving(true)
    try {
      await guard(() => bulkLinkEaClubs(links), 'Failed to link clubs in bulk')
      onSuccess(`Successfully linked ${links.length} club(s) to official EA Sports Pro Clubs!`)
      onClose()
    } catch {
      /* reported */
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div
        className="adm-modal"
        style={{
          maxWidth: 1040,
          width: '95%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Wizard Header & Stepper */}
        <div
          style={{
            background: 'var(--adm-panel)',
            borderBottom: '1px solid var(--adm-border)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.4rem' }}>⚡</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                  Bulk EA FC Pro Clubs Linking Wizard
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--adm-muted)' }}>
                  Auto-match IWVPL clubs against real EA FC Pro Clubs profiles and preview full squad & match box scores
                </p>
              </div>
            </div>
          </div>

          <button type="button" className="adm-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Stepper Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            background: 'rgba(0,0,0,0.25)',
            borderBottom: '1px solid var(--adm-border)',
            fontSize: '0.85rem',
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: step === 1 ? '3px solid #38bdf8' : '3px solid transparent',
              color: step === 1 ? '#38bdf8' : 'var(--adm-text)',
              fontWeight: step === 1 ? 700 : 500,
              cursor: 'pointer',
            }}
            onClick={() => setStep(1)}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: step === 1 ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                color: step === 1 ? '#000' : 'var(--adm-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              1
            </span>
            <span>1. Select Clubs ({selectedClubIds.size})</span>
          </div>

          <div
            style={{
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: step === 2 ? '3px solid #38bdf8' : '3px solid transparent',
              color: step === 2 ? '#38bdf8' : 'var(--adm-text)',
              fontWeight: step === 2 ? 700 : 500,
              cursor: matchItems.length > 0 ? 'pointer' : 'default',
              opacity: matchItems.length > 0 ? 1 : 0.6,
            }}
            onClick={() => {
              if (matchItems.length > 0) setStep(2)
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: step === 2 ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                color: step === 2 ? '#000' : 'var(--adm-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              2
            </span>
            <span>2. Auto-Match & Live Preview</span>
          </div>

          <div
            style={{
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: step === 3 ? '3px solid #38bdf8' : '3px solid transparent',
              color: step === 3 ? '#38bdf8' : 'var(--adm-text)',
              fontWeight: step === 3 ? 700 : 500,
              cursor: matchItems.length > 0 ? 'pointer' : 'default',
              opacity: matchItems.length > 0 ? 1 : 0.6,
            }}
            onClick={() => {
              if (matchItems.length > 0) setStep(3)
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: step === 3 ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                color: step === 3 ? '#000' : 'var(--adm-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              3
            </span>
            <span>3. Review & Confirm ({confirmedClubIds.size})</span>
          </div>
        </div>

        {/* Wizard Step Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column' }}>
          {/* STEP 1: Select Clubs */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Controls bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  background: 'rgba(255,255,255,0.02)',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--adm-border)',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`adm-btn adm-btn-sm ${clubFilter === 'unlinked' ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
                    onClick={() => setClubFilter('unlinked')}
                  >
                    Unlinked Clubs ({clubs.filter((c) => !c.ea_club_id).length})
                  </button>
                  <button
                    type="button"
                    className={`adm-btn adm-btn-sm ${clubFilter === 'all' ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
                    onClick={() => setClubFilter('all')}
                  >
                    All Clubs ({clubs.length})
                  </button>

                  <select
                    value={selectedDivId}
                    onChange={(e) => setSelectedDivId(e.target.value)}
                    className="adm-select"
                    style={{ padding: '4px 10px', fontSize: '0.85rem' }}
                  >
                    <option value="all">All Divisions</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                    <option value="unassigned">Unassigned</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by club name…"
                    className="adm-input"
                    style={{ width: 180, fontSize: '0.82rem', padding: '4px 8px' }}
                  />
                  <button type="button" className="adm-btn adm-btn-ghost adm-btn-xs" onClick={selectAllFiltered}>
                    Select All
                  </button>
                  <button type="button" className="adm-btn adm-btn-ghost adm-btn-xs" onClick={deselectAllFiltered}>
                    Clear
                  </button>
                </div>
              </div>

              {/* Club Grid / List */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 10,
                  maxHeight: 440,
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {filteredClubs.map((club) => {
                  const isChecked = selectedClubIds.has(club.id)
                  const hasEa = Boolean(club.ea_club_id)
                  return (
                    <div
                      key={club.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: isChecked ? '1px solid #38bdf8' : '1px solid var(--adm-border)',
                        background: isChecked ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.02)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => toggleClubSelection(club.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent onClick
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <strong style={{ fontSize: '0.9rem', display: 'block' }}>{club.name}</strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }}>
                            {club.short_code ? `${club.short_code} · ` : ''}
                            {divisions.find((d) => d.id === club.division_id)?.name ?? 'Unassigned'}
                          </div>
                        </div>
                      </div>

                      {hasEa ? (
                        <span
                          className="adm-code-pill"
                          style={{ color: '#38bdf8', border: '1px solid rgba(56,189,248,0.4)', fontSize: '0.72rem' }}
                          title={`Linked EA Club #${club.ea_club_id}`}
                        >
                          🎮 #{club.ea_club_id}
                        </span>
                      ) : (
                        <span className="adm-code-pill" style={{ fontSize: '0.72rem', opacity: 0.6 }}>
                          Unlinked
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* STEP 2: Auto Match & Live Preview */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {matching ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚡</div>
                  <h4 style={{ margin: '0 0 6px' }}>Searching EA Sports Pro Clubs Directory…</h4>
                  <p style={{ margin: 0, color: 'var(--adm-muted)', fontSize: '0.9rem' }}>
                    Matching {selectedClubIds.size} clubs and verifying team names, records, and rosters.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.02)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--adm-border)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div>
                      Scanned <strong>{matchItems.length}</strong> clubs:
                      <span style={{ color: '#22c55e', marginLeft: 10 }}>
                        ● {matchItems.filter((i) => i.matchStatus === 'exact').length} Exact Matches
                      </span>
                      <span style={{ color: '#38bdf8', marginLeft: 10 }}>
                        ● {matchItems.filter((i) => i.matchStatus === 'high').length} High Confidence
                      </span>
                      <span style={{ color: '#eab308', marginLeft: 10 }}>
                        ● {matchItems.filter((i) => i.matchStatus === 'multiple').length} Multiple Candidates
                      </span>
                      <span style={{ color: '#ef4444', marginLeft: 10 }}>
                        ● {matchItems.filter((i) => i.matchStatus === 'none').length} No Match
                      </span>
                    </div>

                    <div style={{ color: 'var(--adm-muted)', fontSize: '0.8rem' }}>
                      Click <strong>👁️ Preview EA Data</strong> to inspect real in-game rosters & recent match box scores.
                    </div>
                  </div>

                  {/* Matches List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 440, overflowY: 'auto' }}>
                    {matchItems.map((item) => {
                      const cand = item.selectedCandidate
                      const isConfirmed = confirmedClubIds.has(item.clubId)
                      return (
                        <div
                          key={item.clubId}
                          style={{
                            background: isConfirmed ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.02)',
                            border: isConfirmed ? '1px solid rgba(56,189,248,0.3)' : '1px solid var(--adm-border)',
                            borderRadius: 8,
                            padding: '12px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            {/* Left: IWVPL Club */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
                              <input
                                type="checkbox"
                                checked={isConfirmed && Boolean(cand)}
                                disabled={!cand}
                                onChange={(e) => {
                                  const next = new Set(confirmedClubIds)
                                  if (e.target.checked) next.add(item.clubId)
                                  else next.delete(item.clubId)
                                  setConfirmedClubIds(next)
                                }}
                              />
                              <div>
                                <strong style={{ fontSize: '0.95rem' }}>{item.clubName}</strong>
                                <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }}>
                                  IWVPL Club ID #{item.clubId}
                                </div>
                              </div>
                            </div>

                            <span style={{ color: 'var(--adm-muted)', fontSize: '1.2rem' }}>➔</span>

                            {/* Center: Matched EA Club */}
                            <div style={{ flex: 1, minWidth: 260 }}>
                              {cand ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                  <div>
                                    <strong style={{ color: '#38bdf8', fontSize: '0.95rem' }}>{cand.name}</strong>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--adm-muted)', marginLeft: 8 }}>
                                      EA ID #{cand.clubId} · {cand.wins ?? 0}W {cand.draws ?? 0}D {cand.losses ?? 0}L
                                    </span>
                                  </div>

                                  {item.matchStatus === 'exact' && (
                                    <span
                                      style={{
                                        background: '#16a34a',
                                        color: '#fff',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                      }}
                                    >
                                      EXACT NAME MATCH
                                    </span>
                                  )}
                                  {item.matchStatus === 'high' && (
                                    <span
                                      style={{
                                        background: '#0284c7',
                                        color: '#fff',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                      }}
                                    >
                                      HIGH CONFIDENCE
                                    </span>
                                  )}
                                  {item.matchStatus === 'multiple' && (
                                    <span
                                      style={{
                                        background: '#ca8a04',
                                        color: '#fff',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                      }}
                                    >
                                      MULTIPLE CHOICES
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div style={{ color: '#ef4444', fontSize: '0.88rem', fontWeight: 600 }}>
                                  ⚠️ No automatic match found on EA
                                </div>
                              )}

                              {/* Alternative candidates dropdown if multiple */}
                              {item.candidates.length > 1 && (
                                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }}>Switch:</span>
                                  <select
                                    value={cand?.clubId ?? ''}
                                    onChange={(e) => {
                                      const found = item.candidates.find((c) => c.clubId === e.target.value) ?? null
                                      handleSelectCandidate(item.clubId, found)
                                    }}
                                    className="adm-select"
                                    style={{ padding: '2px 8px', fontSize: '0.8rem', maxWidth: 280 }}
                                  >
                                    {item.candidates.map((c) => (
                                      <option key={c.clubId} value={c.clubId}>
                                        {c.name} (#{c.clubId} - {c.wins ?? 0}W {c.draws ?? 0}D {c.losses ?? 0}L)
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>

                            {/* Right: Actions */}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {cand && (
                                <button
                                  type="button"
                                  className="adm-btn adm-btn-secondary adm-btn-xs"
                                  onClick={() => handleOpenDeepProfile(cand.clubId, cand.name)}
                                  title="Inspect full EA Pro Clubs roster, stats & match history"
                                >
                                  👁️ Preview EA Data
                                </button>
                              )}
                              <button
                                type="button"
                                className="adm-btn adm-btn-ghost adm-btn-xs"
                                onClick={() => handleOpenOverrideSearch(item.clubId, item.clubName)}
                              >
                                🔍 Search
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 3: Review & Final Confirmation */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <strong style={{ fontSize: '1rem', color: '#86efac' }}>
                    Ready to Link {confirmedClubIds.size} Club(s)
                  </strong>
                  <div style={{ fontSize: '0.82rem', color: '#bbf7d0', marginTop: 2 }}>
                    These clubs will immediately support automated match score and player stats fetching from EA Sports Pro Clubs.
                  </div>
                </div>

                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  disabled={saving || confirmedClubIds.size === 0}
                  onClick={handleCommitBulkLink}
                  style={{ fontWeight: 800, padding: '8px 24px', fontSize: '0.95rem' }}
                >
                  {saving ? 'Linking Clubs…' : `✓ Link ${confirmedClubIds.size} Clubs in Bulk`}
                </button>
              </div>

              {/* Table of confirmed clubs */}
              <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--adm-border)', borderRadius: 8 }}>
                <table className="adm-table" style={{ margin: 0, fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>Link?</th>
                      <th>IWVPL Club</th>
                      <th>Linked EA In-Game Name</th>
                      <th>EA Club ID</th>
                      <th>Record</th>
                      <th style={{ width: 100, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchItems.map((item) => {
                      const cand = item.selectedCandidate
                      const isChecked = confirmedClubIds.has(item.clubId) && Boolean(cand)
                      return (
                        <tr key={item.clubId} style={{ opacity: isChecked ? 1 : 0.5 }}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!cand}
                              onChange={(e) => {
                                const next = new Set(confirmedClubIds)
                                if (e.target.checked) next.add(item.clubId)
                                else next.delete(item.clubId)
                                setConfirmedClubIds(next)
                              }}
                            />
                          </td>
                          <td>
                            <strong>{item.clubName}</strong>
                          </td>
                          <td>
                            {cand ? (
                              <span style={{ color: '#38bdf8', fontWeight: 600 }}>{cand.name}</span>
                            ) : (
                              <span style={{ color: '#ef4444' }}>No EA Club Selected</span>
                            )}
                          </td>
                          <td>
                            {cand ? (
                              <span className="adm-code-pill">#{cand.clubId}</span>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                          <td>
                            {cand ? (
                              <span>{cand.wins ?? 0}W {cand.draws ?? 0}D {cand.losses ?? 0}L</span>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {cand && (
                              <button
                                type="button"
                                className="adm-btn adm-btn-secondary adm-btn-xs"
                                onClick={() => handleOpenDeepProfile(cand.clubId, cand.name)}
                              >
                                👁️ Preview
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div
          style={{
            background: 'var(--adm-panel)',
            borderTop: '1px solid var(--adm-border)',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {step === 1 ? (
            <>
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                disabled={selectedClubIds.size === 0}
                onClick={handleStartAutoMatch}
              >
                Scan & Auto-Match on EA ({selectedClubIds.size}) ➔
              </button>
            </>
          ) : step === 2 ? (
            <>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setStep(1)}>
                ← Back to Club Selection
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                disabled={confirmedClubIds.size === 0}
                onClick={() => setStep(3)}
              >
                Review & Confirm ({confirmedClubIds.size} Matched) ➔
              </button>
            </>
          ) : (
            <>
              <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setStep(2)}>
                ← Back to Matches
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                disabled={saving || confirmedClubIds.size === 0}
                onClick={handleCommitBulkLink}
              >
                {saving ? 'Linking Clubs…' : `✓ Link ${confirmedClubIds.size} Clubs in Bulk`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Deep EA Data Preview Sub-Modal (All data retrieved from EA) */}
      {previewClubId && (
        <div
          className="adm-modal-backdrop"
          style={{ zIndex: 10000, background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setPreviewClubId(null)}
        >
          <div
            className="adm-modal"
            style={{ maxWidth: 860, width: '90%', maxHeight: '88vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adm-modal-head" style={{ borderBottom: '1px solid var(--adm-border)', paddingBottom: 12 }}>
              <div>
                <span className="adm-eyebrow">EA PRO CLUBS LIVE DATA PREVIEW</span>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                  {deepProfile?.name || previewClubName} (EA ID: #{previewClubId})
                </h3>
              </div>
              <button type="button" className="adm-close-btn" onClick={() => setPreviewClubId(null)}>
                ×
              </button>
            </div>

            <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {previewLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--adm-muted)' }}>
                  Loading club roster, stats & box scores live from EA servers…
                </div>
              ) : deepProfile ? (
                <>
                  {/* 1. Club Record & Status Stats */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: 8,
                    }}
                  >
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid var(--adm-border)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-muted)' }}>Record</div>
                      <strong style={{ fontSize: '1.05rem', color: '#22c55e' }}>
                        {deepProfile.stats.wins}W <span style={{ color: '#eab308' }}>{deepProfile.stats.draws}D</span> <span style={{ color: '#ef4444' }}>{deepProfile.stats.losses}L</span>
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid var(--adm-border)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-muted)' }}>Skill Rating</div>
                      <strong style={{ fontSize: '1.05rem', color: '#38bdf8' }}>{deepProfile.stats.skillRating}</strong>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid var(--adm-border)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-muted)' }}>Games Played</div>
                      <strong style={{ fontSize: '1.05rem' }}>{deepProfile.stats.gamesPlayed}</strong>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid var(--adm-border)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-muted)' }}>Goals (GF / GA)</div>
                      <strong style={{ fontSize: '1.05rem' }}>
                        {deepProfile.stats.goalsFor} / {deepProfile.stats.goalsAgainst} ({deepProfile.stats.goalDifference >= 0 ? `+${deepProfile.stats.goalDifference}` : deepProfile.stats.goalDifference})
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid var(--adm-border)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-muted)' }}>Division Tier</div>
                      <strong style={{ fontSize: '1.05rem' }}>Div {deepProfile.stats.bestDivision}</strong>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid var(--adm-border)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-muted)' }}>Current Streak</div>
                      <strong style={{ fontSize: '1.05rem' }}>{deepProfile.stats.winStreak}W ({deepProfile.stats.unbeatenStreak} unbeaten)</strong>
                    </div>
                  </div>

                  {/* 2. Squad Roster Preview */}
                  <div style={{ border: '1px solid var(--adm-border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--adm-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <strong style={{ fontSize: '0.88rem' }}>
                        👥 Squad Roster ({deepProfile.roster.length} Players on EA)
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }}>
                        Cross-check these gamertags against your registered players
                      </span>
                    </div>

                    {deepProfile.roster.length === 0 ? (
                      <div style={{ padding: 12, color: 'var(--adm-muted)', fontSize: '0.85rem' }}>
                        No squad member data returned by EA for this club.
                      </div>
                    ) : (
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        <table className="adm-table" style={{ margin: 0, fontSize: '0.8rem' }}>
                          <thead>
                            <tr>
                              <th>Gamertag</th>
                              <th>Pro Name</th>
                              <th>Fav Pos</th>
                              <th style={{ textAlign: 'center' }}>OVR</th>
                              <th style={{ textAlign: 'center' }}>Games</th>
                              <th style={{ textAlign: 'center' }}>Goals</th>
                              <th style={{ textAlign: 'center' }}>Assists</th>
                              <th style={{ textAlign: 'center' }}>Avg Rating</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deepProfile.roster.map((m, idx) => (
                              <tr key={idx}>
                                <td>
                                  <strong>{m.gamertag}</strong>
                                </td>
                                <td>{m.proName || '—'}</td>
                                <td>{m.position}</td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: '#38bdf8' }}>{m.overallRating}</td>
                                <td style={{ textAlign: 'center' }}>{m.gamesPlayed}</td>
                                <td style={{ textAlign: 'center' }}>{m.goals}</td>
                                <td style={{ textAlign: 'center' }}>{m.assists}</td>
                                <td style={{ textAlign: 'center' }}>{m.ratingAve.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* 3. Recent Matches Box Scores */}
                  <div style={{ border: '1px solid var(--adm-border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--adm-border)',
                      }}
                    >
                      <strong style={{ fontSize: '0.88rem' }}>
                        📅 Recent League Box Scores ({deepProfile.recentMatches.length} Matches)
                      </strong>
                    </div>

                    {deepProfile.recentMatches.length === 0 ? (
                      <div style={{ padding: 12, color: 'var(--adm-muted)', fontSize: '0.85rem' }}>
                        No recent matches on record.
                      </div>
                    ) : (
                      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                        <table className="adm-table" style={{ margin: 0, fontSize: '0.8rem' }}>
                          <thead>
                            <tr>
                              <th>Date (UTC)</th>
                              <th>Match ID</th>
                              <th>Opponent</th>
                              <th style={{ textAlign: 'center' }}>Score</th>
                              <th style={{ textAlign: 'center' }}>Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deepProfile.recentMatches.map((m, idx) => (
                              <tr key={idx}>
                                <td>{m.dateFormatted}</td>
                                <td>
                                  <span className="adm-code-pill" style={{ fontSize: '0.72rem' }}>#{m.matchId}</span>
                                </td>
                                <td>
                                  <strong>{m.opponentName}</strong>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 800 }}>
                                  {m.goalsFor} – {m.goalsAgainst}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontWeight: 800,
                                      fontSize: '0.75rem',
                                      background:
                                        m.result === 'W'
                                          ? 'rgba(34,197,94,0.2)'
                                          : m.result === 'D'
                                          ? 'rgba(234,179,8,0.2)'
                                          : 'rgba(239,68,68,0.2)',
                                      color:
                                        m.result === 'W'
                                          ? '#4ade80'
                                          : m.result === 'D'
                                          ? '#fde047'
                                          : '#f87171',
                                    }}
                                  >
                                    {m.result}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: '#ef4444' }}>
                  Could not load live profile data for this club.
                </div>
              )}
            </div>

            <div className="adm-modal-foot" style={{ borderTop: '1px solid var(--adm-border)', paddingTop: 12 }}>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                onClick={() => setPreviewClubId(null)}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Search Override Sub-Modal */}
      {overrideModalClubId !== null && (
        <div
          className="adm-modal-backdrop"
          style={{ zIndex: 10000, background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setOverrideModalClubId(null)}
        >
          <div className="adm-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <h3>Search & Replace EA Club</h3>
              <button type="button" className="adm-close-btn" onClick={() => setOverrideModalClubId(null)}>
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={overrideSearchQuery}
                  onChange={(e) => setOverrideSearchQuery(e.target.value)}
                  placeholder="Type club name on EA..."
                  className="adm-input"
                  style={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void triggerOverrideSearch(overrideSearchQuery)
                    }
                  }}
                />
                <button
                  type="button"
                  className="adm-btn adm-btn-primary adm-btn-sm"
                  disabled={overrideSearching}
                  onClick={() => void triggerOverrideSearch(overrideSearchQuery)}
                >
                  {overrideSearching ? 'Searching…' : 'Search'}
                </button>
              </div>

              {overrideResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                  {overrideResults.map((cand) => (
                    <div
                      key={cand.clubId}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 4,
                        border: '1px solid var(--adm-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleApplyOverride(cand)}
                    >
                      <div>
                        <strong>{cand.name}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }}>
                          ID: #{cand.clubId} {cand.wins !== undefined ? `· ${cand.wins}W ${cand.draws || 0}D ${cand.losses || 0}L` : ''}
                        </div>
                      </div>
                      <button type="button" className="adm-btn adm-btn-secondary adm-btn-xs">
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="adm-modal-foot">
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                onClick={() => setOverrideModalClubId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
