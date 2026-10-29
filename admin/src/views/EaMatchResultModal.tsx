import { useEffect, useState } from 'react'
import {
  applyEaMatchResult,
  getMatchEaCandidates,
  type EaMatchCandidate,
  type EaPlayerStatItem,
  type Match,
} from '../api'
import type { Guard, Report } from '../utils'

export interface EaMatchResultModalProps {
  isOpen: boolean
  match: Match | null
  onClose: () => void
  onSuccess: (message: string) => void
  guard: Guard
  report: Report
}

export function EaMatchResultModal({
  isOpen,
  match,
  onClose,
  onSuccess,
  guard,
  report,
}: EaMatchResultModalProps) {
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<EaMatchCandidate[]>([])
  const [homeClubInfo, setHomeClubInfo] = useState<{ id: number; name: string; eaClubId: string | null; eaClubName: string | null } | null>(null)
  const [awayClubInfo, setAwayClubInfo] = useState<{ id: number; name: string; eaClubId: string | null; eaClubName: string | null } | null>(null)

  const [selectedCandidate, setSelectedCandidate] = useState<EaMatchCandidate | null>(null)
  const [homeScore, setHomeScore] = useState<number | string>('')
  const [awayScore, setAwayScore] = useState<number | string>('')
  const [homePlayers, setHomePlayers] = useState<EaPlayerStatItem[]>([])
  const [awayPlayers, setAwayPlayers] = useState<EaPlayerStatItem[]>([])
  const [homeSquad, setHomeSquad] = useState<Array<{ id: number; gamertag: string; shirt_number?: number | null }>>([])
  const [awaySquad, setAwaySquad] = useState<Array<{ id: number; gamertag: string; shirt_number?: number | null }>>([])
  const [submitting, setSubmitting] = useState(false)

  // Load EA candidates when modal opens
  useEffect(() => {
    if (!isOpen || !match) {
      setCandidates([])
      setSelectedCandidate(null)
      return
    }

    let active = true
    setLoading(true)

    void (async () => {
      try {
        const data = await guard(() => getMatchEaCandidates(match.id), 'Failed to fetch EA match candidates')
        if (!active) return
        setCandidates(data.candidates)
        setHomeClubInfo(data.homeClub)
        setAwayClubInfo(data.awayClub)
        setHomeSquad(data.homeSquad ?? [])
        setAwaySquad(data.awaySquad ?? [])

        // Pre-select direct match if found
        const direct = data.candidates.find((c) => c.isDirectMatch) ?? data.candidates[0] ?? null
        if (direct) {
          applyCandidate(direct)
        } else if (data.existingPlayerStats && data.existingPlayerStats.length > 0) {
          setHomeScore(match.home_score != null ? match.home_score : '')
          setAwayScore(match.away_score != null ? match.away_score : '')
          const hId = data.homeClub.id
          const aId = data.awayClub.id
          setHomePlayers(
            data.existingPlayerStats.filter((p: any) => p.club_id === hId).map((p: any) => ({
              gamertag: p.gamertag,
              pos: p.pos || 'midfielder',
              rating: Number(p.rating) || 6.0,
              goals: Number(p.goals) || 0,
              assists: Number(p.assists) || 0,
              shots: Number(p.shots) || 0,
              passes: Number(p.passes) || 0,
              tackles: Number(p.tackles) || 0,
              saves: Number(p.saves) || 0,
              cleanSheet: Boolean(p.clean_sheet),
              isMom: Boolean(p.is_mom),
            }))
          )
          setAwayPlayers(
            data.existingPlayerStats.filter((p: any) => p.club_id === aId).map((p: any) => ({
              gamertag: p.gamertag,
              pos: p.pos || 'midfielder',
              rating: Number(p.rating) || 6.0,
              goals: Number(p.goals) || 0,
              assists: Number(p.assists) || 0,
              shots: Number(p.shots) || 0,
              passes: Number(p.passes) || 0,
              tackles: Number(p.tackles) || 0,
              saves: Number(p.saves) || 0,
              cleanSheet: Boolean(p.clean_sheet),
              isMom: Boolean(p.is_mom),
            }))
          )
        } else {
          setHomeScore(match.home_score != null ? match.home_score : '')
          setAwayScore(match.away_score != null ? match.away_score : '')
          setHomePlayers([])
          setAwayPlayers([])
        }
      } catch {
        /* reported by guard */
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [isOpen, match, guard])

  const applyCandidate = (cand: EaMatchCandidate) => {
    setSelectedCandidate(cand)
    setHomeScore(cand.suggestedHomeScore != null ? cand.suggestedHomeScore : cand.clubA.goals)
    setAwayScore(cand.suggestedAwayScore != null ? cand.suggestedAwayScore : cand.clubB.goals)
    setHomePlayers(cand.homePlayers.map((p) => ({ ...p })))
    setAwayPlayers(cand.awayPlayers.map((p) => ({ ...p })))
  }

  const handlePlayerChange = (
    side: 'home' | 'away',
    index: number,
    field: keyof EaPlayerStatItem,
    value: any,
  ) => {
    const list = side === 'home' ? [...homePlayers] : [...awayPlayers]
    if (!list[index]) return
    list[index] = { ...list[index], [field]: value }
    if (side === 'home') setHomePlayers(list)
    else setAwayPlayers(list)
  }

  const handleRemovePlayer = (side: 'home' | 'away', index: number) => {
    if (side === 'home') {
      setHomePlayers(homePlayers.filter((_, i) => i !== index))
    } else {
      setAwayPlayers(awayPlayers.filter((_, i) => i !== index))
    }
  }

  const handleLoadSquad = (side: 'home' | 'away') => {
    const squad = side === 'home' ? homeSquad : awaySquad
    if (!squad || squad.length === 0) {
      report('info', `No registered players found in roster for ${side === 'home' ? match?.home_name : match?.away_name}`)
      return
    }
    const currentList = side === 'home' ? homePlayers : awayPlayers
    const existingTags = new Set(currentList.map((p) => p.gamertag.toLowerCase().trim()))

    const toAdd: EaPlayerStatItem[] = squad
      .filter((sq) => !existingTags.has(sq.gamertag.toLowerCase().trim()))
      .map((sq) => ({
        gamertag: sq.gamertag,
        pos: 'midfielder',
        rating: 6.0,
        goals: 0,
        assists: 0,
        shots: 0,
        passes: 0,
        tackles: 0,
        saves: 0,
        cleanSheet: false,
        isMom: false,
      }))

    if (toAdd.length === 0) {
      report('info', 'All registered squad players are already in the list.')
      return
    }

    if (side === 'home') {
      setHomePlayers([...homePlayers, ...toAdd])
    } else {
      setAwayPlayers([...awayPlayers, ...toAdd])
    }
  }

  const handleAddPlayer = (side: 'home' | 'away') => {
    const newPlayer: EaPlayerStatItem = {
      gamertag: '',
      pos: 'midfielder',
      rating: 6.0,
      goals: 0,
      assists: 0,
      shots: 0,
      passes: 0,
      tackles: 0,
      saves: 0,
      cleanSheet: false,
      isMom: false,
    }
    if (side === 'home') {
      setHomePlayers([...homePlayers, newPlayer])
    } else {
      setAwayPlayers([...awayPlayers, newPlayer])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!match) return

    const hs = Number.parseInt(String(homeScore), 10)
    const as = Number.parseInt(String(awayScore), 10)
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) {
      report('error', 'Enter valid whole numbers (0–99) for both clubs.')
      return
    }

    const homeClubId = match.home_club_id ?? homeClubInfo?.id
    const awayClubId = match.away_club_id ?? awayClubInfo?.id

    if (!homeClubId || !awayClubId) {
      report('error', 'Could not resolve club identifiers for this fixture.')
      return
    }

    const combinedPlayers = [
      ...homePlayers
        .filter((p) => p.gamertag.trim().length > 0)
        .map((p) => ({ ...p, clubId: homeClubId })),
      ...awayPlayers
        .filter((p) => p.gamertag.trim().length > 0)
        .map((p) => ({ ...p, clubId: awayClubId })),
    ]

    setSubmitting(true)
    try {
      await guard(
        () =>
          applyEaMatchResult(match.id, {
            homeScore: hs,
            awayScore: as,
            eaMatchId: selectedCandidate?.matchId,
            players: combinedPlayers,
          }),
        'Failed to apply EA match result',
      )
      onSuccess(`Saved official result: ${match.home_name} ${hs} – ${as} ${match.away_name} with ${combinedPlayers.length} player stats recorded!`)
      onClose()
    } catch {
      /* reported by guard */
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen || !match) return null

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div
        className="adm-modal"
        style={{ maxWidth: 940, width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="adm-modal-head" style={{ borderBottom: '1px solid var(--adm-border)', paddingBottom: 14 }}>
          <div>
            <span className="adm-eyebrow" style={{ color: '#38bdf8', letterSpacing: '0.08em', fontWeight: 700 }}>
              EA SPORTS FC · FIXTURE RESULT
            </span>
            <h3 style={{ margin: '2px 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
              Import Official Match Score & Stats
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--adm-muted)' }}>
              {match.home_name} vs {match.away_name}
            </p>
          </div>
          <button type="button" className="adm-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Body (scrollable) */}
        <div style={{ overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Club EA Link Status Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid var(--adm-border)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Home Club
              </div>
              <strong style={{ fontSize: '0.95rem' }}>{match.home_name}</strong>
              <div style={{ marginTop: 4 }}>
                {homeClubInfo?.eaClubId ? (
                  <span className="adm-code-pill" style={{ color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.08)' }}>
                    EA #{homeClubInfo.eaClubId} {homeClubInfo.eaClubName ? `(${homeClubInfo.eaClubName})` : ''}
                  </span>
                ) : (
                  <span className="adm-code-pill" style={{ color: '#eab308', border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.08)' }}>
                    Not Linked
                  </span>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Away Club
              </div>
              <strong style={{ fontSize: '0.95rem' }}>{match.away_name}</strong>
              <div style={{ marginTop: 4 }}>
                {awayClubInfo?.eaClubId ? (
                  <span className="adm-code-pill" style={{ color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.08)' }}>
                    EA #{awayClubInfo.eaClubId} {awayClubInfo.eaClubName ? `(${awayClubInfo.eaClubName})` : ''}
                  </span>
                ) : (
                  <span className="adm-code-pill" style={{ color: '#eab308', border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.08)' }}>
                    Not Linked
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* EA Candidates Selector */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>Available EA Pro Clubs Matches</strong>
              {loading && <span style={{ fontSize: '0.82rem', color: 'var(--adm-muted)' }}>Searching EA servers…</span>}
            </div>

            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--adm-muted)' }}>
                Fetching matches live from EA Pro Clubs...
              </div>
            ) : candidates.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px dashed var(--adm-border)',
                  fontSize: '0.88rem',
                  color: 'var(--adm-muted)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 4 }}>
                  EA Pro Clubs Match Window Expired
                </div>
                EA Sports only keeps the 5 most recent matches per club on their servers (~1–3 days). Older fixtures cannot be retrieved automatically from EA servers.
                <br />
                <strong>How to record stats:</strong> Click <em>"+ Load Registered Squad"</em> below to automatically populate the real players from each club's squad roster, then enter goals, assists, and ratings from your match report or Discord screenshot.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {candidates.map((cand) => {
                  const isSelected = selectedCandidate?.matchId === cand.matchId
                  return (
                    <div
                      key={cand.matchId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 6,
                        border: isSelected
                          ? '2px solid #38bdf8'
                          : cand.isDirectMatch
                          ? '1px solid rgba(34,197,94,0.4)'
                          : '1px solid var(--adm-border)',
                        background: isSelected
                          ? 'rgba(56,189,248,0.1)'
                          : cand.isDirectMatch
                          ? 'rgba(34,197,94,0.05)'
                          : 'rgba(255,255,255,0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => applyCandidate(cand)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {cand.isDirectMatch ? (
                          <span
                            style={{
                              background: 'rgba(34,197,94,0.15)',
                              color: '#4ade80',
                              border: '1px solid rgba(34,197,94,0.3)',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              padding: '2px 8px',
                              borderRadius: 4,
                            }}
                          >
                            HEAD-TO-HEAD
                          </span>
                        ) : (
                          <span
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              color: 'var(--adm-muted)',
                              border: '1px solid var(--adm-border)',
                              fontSize: '0.7rem',
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            Recent Fixture
                          </span>
                        )}

                        <div>
                          <strong style={{ fontSize: '0.98rem' }}>
                            {cand.clubA.name} {cand.clubA.goals} – {cand.clubB.goals} {cand.clubB.name}
                          </strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }}>
                            Date: {cand.dateFormatted} UTC · Match ID: #{cand.matchId} · {cand.homePlayers.length + cand.awayPlayers.length} players tracked
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`adm-btn adm-btn-sm ${isSelected ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          applyCandidate(cand)
                        }}
                        style={{ fontWeight: 600, minWidth: 80 }}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Result Editor */}
          <form id="ea-result-form" onSubmit={handleSubmit} className="adm-form-stack">
            {/* Scoreline Inputs */}
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--adm-border)',
                borderRadius: 8,
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 20,
              }}
            >
              <div style={{ textAlign: 'center', flex: 1 }}>
                <strong style={{ display: 'block', marginBottom: 6 }}>{match.home_name}</strong>
                <input
                  type="number"
                  min={0}
                  max={99}
                  required
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="adm-input"
                  style={{ width: 80, fontSize: '1.4rem', textAlign: 'center', fontWeight: 800 }}
                />
              </div>

              <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--adm-muted)' }}>–</span>

              <div style={{ textAlign: 'center', flex: 1 }}>
                <strong style={{ display: 'block', marginBottom: 6 }}>{match.away_name}</strong>
                <input
                  type="number"
                  min={0}
                  max={99}
                  required
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="adm-input"
                  style={{ width: 80, fontSize: '1.4rem', textAlign: 'center', fontWeight: 800 }}
                />
              </div>
            </div>

            {/* Isolation Guarantee Notice */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'rgba(56,189,248,0.04)',
                border: '1px solid rgba(56,189,248,0.2)',
                fontSize: '0.82rem',
                color: '#bae6fd',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div>
                <strong>Official Fixture Isolation:</strong> Player statistics below will only be recorded for this specific official league fixture. Non-IWVPL casual games are strictly excluded.
              </div>
            </div>

            {/* Player Stats Review & Edit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Home Team Squad */}
              <div style={{ border: '1px solid var(--adm-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--adm-border)',
                  }}
                >
                  <strong style={{ fontSize: '0.9rem' }}>{match.home_name} Players ({homePlayers.length})</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {homeSquad.length > 0 && (
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-xs"
                        onClick={() => handleLoadSquad('home')}
                        title="Load registered squad players into this match"
                      >
                        + Load Registered Squad ({homeSquad.length})
                      </button>
                    )}
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-xs"
                      onClick={() => handleAddPlayer('home')}
                    >
                      + Add Player
                    </button>
                  </div>
                </div>

                {homePlayers.length === 0 ? (
                  <div style={{ padding: 12, fontSize: '0.85rem', color: 'var(--adm-muted)' }}>
                    No player stats loaded for this club. Click "+ Add Player" to add manually if needed.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="adm-table" style={{ fontSize: '0.82rem', margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Gamertag</th>
                          <th style={{ width: 70 }}>Pos</th>
                          <th style={{ width: 60, textAlign: 'center' }}>Goals</th>
                          <th style={{ width: 60, textAlign: 'center' }}>Assists</th>
                          <th style={{ width: 60, textAlign: 'center' }}>Saves</th>
                          <th style={{ width: 55, textAlign: 'center' }}>CS</th>
                          <th style={{ width: 65, textAlign: 'center' }}>Rating</th>
                          <th style={{ width: 55, textAlign: 'center' }}>MoM</th>
                          <th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {homePlayers.map((p, idx) => (
                          <tr key={idx}>
                            <td>
                              <input
                                type="text"
                                value={p.gamertag}
                                onChange={(e) => handlePlayerChange('home', idx, 'gamertag', e.target.value)}
                                placeholder="Gamertag"
                                className="adm-input"
                                style={{ padding: '2px 6px', fontSize: '0.82rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={p.pos}
                                onChange={(e) => handlePlayerChange('home', idx, 'pos', e.target.value)}
                                className="adm-input"
                                style={{ padding: '2px 6px', fontSize: '0.82rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                value={p.goals}
                                onChange={(e) => handlePlayerChange('home', idx, 'goals', Number(e.target.value) || 0)}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                value={p.assists}
                                onChange={(e) => handlePlayerChange('home', idx, 'assists', Number(e.target.value) || 0)}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                value={p.saves}
                                onChange={(e) => handlePlayerChange('home', idx, 'saves', Number(e.target.value) || 0)}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={p.cleanSheet}
                                onChange={(e) => handlePlayerChange('home', idx, 'cleanSheet', e.target.checked)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                value={p.rating}
                                onChange={(e) => handlePlayerChange('home', idx, 'rating', Number(e.target.value) || 0)}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={p.isMom}
                                onChange={(e) => handlePlayerChange('home', idx, 'isMom', e.target.checked)}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="adm-btn adm-btn-ghost adm-btn-xs"
                                onClick={() => handleRemovePlayer('home', idx)}
                                title="Remove player from stats"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Away Team Squad */}
              <div style={{ border: '1px solid var(--adm-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--adm-border)',
                  }}
                >
                  <strong style={{ fontSize: '0.9rem' }}>{match.away_name} Players ({awayPlayers.length})</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {awaySquad.length > 0 && (
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-xs"
                        onClick={() => handleLoadSquad('away')}
                        title="Load registered squad players into this match"
                      >
                        + Load Registered Squad ({awaySquad.length})
                      </button>
                    )}
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-xs"
                      onClick={() => handleAddPlayer('away')}
                    >
                      + Add Player
                    </button>
                  </div>
                </div>

                {awayPlayers.length === 0 ? (
                  <div style={{ padding: 12, fontSize: '0.85rem', color: 'var(--adm-muted)' }}>
                    No player stats loaded for this club. Click "+ Add Player" to add manually if needed.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="adm-table" style={{ fontSize: '0.82rem', margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Gamertag</th>
                          <th style={{ width: 70 }}>Pos</th>
                          <th style={{ width: 60, textAlign: 'center' }}>Goals</th>
                          <th style={{ width: 60, textAlign: 'center' }}>Assists</th>
                          <th style={{ width: 60, textAlign: 'center' }}>Saves</th>
                          <th style={{ width: 55, textAlign: 'center' }}>CS</th>
                          <th style={{ width: 65, textAlign: 'center' }}>Rating</th>
                          <th style={{ width: 55, textAlign: 'center' }}>MoM</th>
                          <th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {awayPlayers.map((p, idx) => (
                          <tr key={idx}>
                            <td>
                              <input
                                type="text"
                                value={p.gamertag}
                                onChange={(e) => handlePlayerChange('away', idx, 'gamertag', e.target.value)}
                                placeholder="Gamertag"
                                className="adm-input"
                                style={{ padding: '2px 6px', fontSize: '0.82rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={p.pos}
                                onChange={(e) => handlePlayerChange('away', idx, 'pos', e.target.value)}
                                className="adm-input"
                                style={{ padding: '2px 6px', fontSize: '0.82rem' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                value={p.goals}
                                onChange={(e) => handlePlayerChange('away', idx, 'goals', Number(e.target.value) || 0)}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                value={p.assists}
                                onChange={(e) => handlePlayerChange('away', idx, 'assists', Number(e.target.value) || 0)}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                value={p.saves}
                                onChange={(e) => handlePlayerChange('away', idx, 'saves', Number(e.target.value) || 0)}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={p.cleanSheet}
                                onChange={(e) => handlePlayerChange('away', idx, 'cleanSheet', e.target.checked)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                value={p.rating}
                                onChange={(e) => handlePlayerChange('away', idx, 'rating', Number(e.target.value) || 0)}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={p.isMom}
                                onChange={(e) => handlePlayerChange('away', idx, 'isMom', e.target.checked)}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="adm-btn adm-btn-ghost adm-btn-xs"
                                onClick={() => handleRemovePlayer('away', idx)}
                                title="Remove player from stats"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div
          className="adm-modal-foot"
          style={{
            borderTop: '1px solid var(--adm-border)',
            paddingTop: 12,
            marginTop: 4,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="adm-btn adm-btn-ghost adm-btn-sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>

          <button
            type="submit"
            form="ea-result-form"
            className="adm-btn adm-btn-primary"
            disabled={submitting || homeScore === '' || awayScore === ''}
            style={{ fontWeight: 700, padding: '8px 20px' }}
          >
            {submitting ? 'Applying Result & Stats…' : 'Confirm & Apply Result'}
          </button>
        </div>
      </div>
    </div>
  )
}
