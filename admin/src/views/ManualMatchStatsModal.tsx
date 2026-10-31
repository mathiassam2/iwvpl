import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  getManualMatchData,
  saveManualMatchStats,
  type ManualMatchData,
  type ManualMatchEvent,
  type Match,
} from '../api'
import type { Guard, Report } from '../utils'

interface PlayerRow {
  clubId: number
  gamertag: string
  pos: string
  rating: number
  goals: number
  assists: number
  shots: number
  passes: number
  tackles: number
  saves: number
  cleanSheet: boolean
  isMom: boolean
}

type TeamKey =
  | 'possessionHome'
  | 'possessionAway'
  | 'shotsHome'
  | 'shotsAway'
  | 'onTargetHome'
  | 'onTargetAway'
  | 'cornersHome'
  | 'cornersAway'
  | 'foulsHome'
  | 'foulsAway'
  | 'offsidesHome'
  | 'offsidesAway'
  | 'passAccuracyHome'
  | 'passAccuracyAway'

type TeamState = Record<TeamKey, string>

interface EventRow {
  minute: string
  type: string
  teamSide: 'home' | 'away'
  playerName: string
  detail: string
  score: string
}

const EMPTY_TEAM: TeamState = {
  possessionHome: '',
  possessionAway: '',
  shotsHome: '',
  shotsAway: '',
  onTargetHome: '',
  onTargetAway: '',
  cornersHome: '',
  cornersAway: '',
  foulsHome: '',
  foulsAway: '',
  offsidesHome: '',
  offsidesAway: '',
  passAccuracyHome: '',
  passAccuracyAway: '',
}

const TEAM_FIELDS: Array<{ label: string; home: TeamKey; away: TeamKey; suffix?: string }> = [
  { label: 'Possession', home: 'possessionHome', away: 'possessionAway', suffix: '%' },
  { label: 'Shots', home: 'shotsHome', away: 'shotsAway' },
  { label: 'On target', home: 'onTargetHome', away: 'onTargetAway' },
  { label: 'Corners', home: 'cornersHome', away: 'cornersAway' },
  { label: 'Fouls', home: 'foulsHome', away: 'foulsAway' },
  { label: 'Offsides', home: 'offsidesHome', away: 'offsidesAway' },
  { label: 'Pass accuracy', home: 'passAccuracyHome', away: 'passAccuracyAway', suffix: '%' },
]

const EVENT_TYPES = [
  { value: 'goal', label: 'Goal' },
  { value: 'own_goal', label: 'Own goal' },
  { value: 'yellow', label: 'Yellow card' },
  { value: 'red', label: 'Red card' },
  { value: 'sub', label: 'Substitution' },
]

function playerRow(clubId: number, gamertag = '', pos = 'CM'): PlayerRow {
  return {
    clubId,
    gamertag,
    pos,
    rating: 6,
    goals: 0,
    assists: 0,
    shots: 0,
    passes: 0,
    tackles: 0,
    saves: 0,
    cleanSheet: false,
    isMom: false,
  }
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function ManualMatchStatsModal({
  isOpen,
  match,
  onClose,
  onSuccess,
  guard,
  report,
}: {
  isOpen: boolean
  match: Match | null
  onClose: () => void
  onSuccess: (message: string) => void
  guard: Guard
  report: Report
}) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ManualMatchData | null>(null)
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [homePlayers, setHomePlayers] = useState<PlayerRow[]>([])
  const [awayPlayers, setAwayPlayers] = useState<PlayerRow[]>([])
  const [team, setTeam] = useState<TeamState>(EMPTY_TEAM)
  const [events, setEvents] = useState<EventRow[]>([])
  const [saving, setSaving] = useState(false)

  const homeClubId = data?.match.home_club_id ?? match?.home_club_id ?? 0
  const awayClubId = data?.match.away_club_id ?? match?.away_club_id ?? 0

  const homeSquad = data?.homeSquad ?? []
  const awaySquad = data?.awaySquad ?? []

  useEffect(() => {
    if (!isOpen || !match) {
      setData(null)
      return
    }
    let active = true
    setLoading(true)
    void (async () => {
      try {
        const result = await guard(() => getManualMatchData(match.id), 'Could not load match stats')
        if (!active) return
        setData(result)
        setHomeScore(result.match.home_score != null ? String(result.match.home_score) : '')
        setAwayScore(result.match.away_score != null ? String(result.match.away_score) : '')

        const toRow = (p: any): PlayerRow => ({
          clubId: p.club_id,
          gamertag: p.gamertag,
          pos: 'CM',
          rating: Number(p.rating) || 0,
          goals: Number(p.goals) || 0,
          assists: Number(p.assists) || 0,
          shots: Number(p.shots) || 0,
          passes: Number(p.passes) || 0,
          tackles: Number(p.tackles) || 0,
          saves: Number(p.saves) || 0,
          cleanSheet: Boolean(p.clean_sheet),
          isMom: Boolean(p.is_mom),
        })
        setHomePlayers(result.playerStats.filter((p) => p.club_id === result.match.home_club_id).map(toRow))
        setAwayPlayers(result.playerStats.filter((p) => p.club_id === result.match.away_club_id).map(toRow))

        const ms = result.teamStats
        setTeam({
          possessionHome: ms?.possession_home != null ? String(ms.possession_home) : '',
          possessionAway: ms?.possession_away != null ? String(ms.possession_away) : '',
          shotsHome: ms?.shots_home != null ? String(ms.shots_home) : '',
          shotsAway: ms?.shots_away != null ? String(ms.shots_away) : '',
          onTargetHome: ms?.on_target_home != null ? String(ms.on_target_home) : '',
          onTargetAway: ms?.on_target_away != null ? String(ms.on_target_away) : '',
          cornersHome: ms?.corners_home != null ? String(ms.corners_home) : '',
          cornersAway: ms?.corners_away != null ? String(ms.corners_away) : '',
          foulsHome: ms?.fouls_home != null ? String(ms.fouls_home) : '',
          foulsAway: ms?.fouls_away != null ? String(ms.fouls_away) : '',
          offsidesHome: ms?.offsides_home != null ? String(ms.offsides_home) : '',
          offsidesAway: ms?.offsides_away != null ? String(ms.offsides_away) : '',
          passAccuracyHome: ms?.pass_accuracy_home != null ? String(ms.pass_accuracy_home) : '',
          passAccuracyAway: ms?.pass_accuracy_away != null ? String(ms.pass_accuracy_away) : '',
        })
        setEvents(
          result.events.map((e: ManualMatchEvent) => ({
            minute: String(e.minute ?? 0),
            type: e.type || 'goal',
            teamSide: e.team_side === 'away' ? 'away' : 'home',
            playerName: e.player_name ?? '',
            detail: e.detail ?? '',
            score: e.score ?? '',
          })),
        )
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

  const homeLabel = data?.match.home_name ?? match?.home_name ?? 'Home'
  const awayLabel = data?.match.away_name ?? match?.away_name ?? 'Away'

  const filledPlayers = useMemo(
    () => [...homePlayers, ...awayPlayers].filter((p) => p.gamertag.trim()).length,
    [homePlayers, awayPlayers],
  )

  const updatePlayer = (
    side: 'home' | 'away',
    index: number,
    field: keyof PlayerRow,
    value: string | number | boolean,
  ) => {
    const list = side === 'home' ? [...homePlayers] : [...awayPlayers]
    if (!list[index]) return
    list[index] = { ...list[index], [field]: value }
    if (side === 'home') setHomePlayers(list)
    else setAwayPlayers(list)
  }

  const addPlayer = (side: 'home' | 'away') => {
    const row = playerRow(side === 'home' ? homeClubId : awayClubId)
    if (side === 'home') setHomePlayers((p) => [...p, row])
    else setAwayPlayers((p) => [...p, row])
  }

  const loadSquad = (side: 'home' | 'away') => {
    const squad = side === 'home' ? homeSquad : awaySquad
    if (squad.length === 0) {
      report('info', `No registered players found for ${side === 'home' ? homeLabel : awayLabel}.`)
      return
    }
    const current = side === 'home' ? homePlayers : awayPlayers
    const existing = new Set(current.map((p) => p.gamertag.toLowerCase().trim()))
    const additions = squad
      .filter((p) => !existing.has(p.gamertag.toLowerCase().trim()))
      .map((p) => playerRow(side === 'home' ? homeClubId : awayClubId, p.gamertag))
    if (additions.length === 0) {
      report('info', 'All registered squad players are already in the list.')
      return
    }
    if (side === 'home') setHomePlayers([...current, ...additions])
    else setAwayPlayers([...current, ...additions])
  }

  const removePlayer = (side: 'home' | 'away', index: number) => {
    if (side === 'home') setHomePlayers((p) => p.filter((_, i) => i !== index))
    else setAwayPlayers((p) => p.filter((_, i) => i !== index))
  }

  const addEvent = () => {
    setEvents((prev) => [
      ...prev,
      { minute: '', type: 'goal', teamSide: 'home', playerName: '', detail: '', score: '' },
    ])
  }

  const updateEvent = (index: number, patch: Partial<EventRow>) => {
    setEvents((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!match) return
    const hs = Number.parseInt(homeScore, 10)
    const as = Number.parseInt(awayScore, 10)
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) {
      report('error', 'Enter valid whole numbers for both clubs.')
      return
    }

    const players = [
      ...homePlayers
        .filter((p) => p.gamertag.trim())
        .map((p) => ({ ...p, clubId: homeClubId, gamertag: p.gamertag.trim() })),
      ...awayPlayers
        .filter((p) => p.gamertag.trim())
        .map((p) => ({ ...p, clubId: awayClubId, gamertag: p.gamertag.trim() })),
    ]

    setSaving(true)
    try {
      await guard(
        () =>
          saveManualMatchStats(match.id, {
            homeScore: hs,
            awayScore: as,
            players,
            teamStats: Object.fromEntries(
              Object.entries(team).map(([key, value]) => [key, numberOrNull(value)]),
            ),
            events: events
              .filter((e) => e.playerName.trim() || e.detail.trim())
              .map((e) => ({
                minute: Number.parseInt(e.minute, 10) || 0,
                type: e.type,
                teamSide: e.teamSide,
                playerName: e.playerName.trim() || undefined,
                detail: e.detail.trim() || undefined,
                score: e.score.trim() || undefined,
              })),
          }),
        'Could not save manual match stats',
      )
      onSuccess(
        `Saved manual stats: ${homeLabel} ${hs} – ${as} ${awayLabel} · ${players.length} player rows.`,
      )
      onClose()
    } catch {
      /* reported by guard */
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !match) return null

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div
        className="adm-modal"
        style={{ maxWidth: 1120, width: '96%', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adm-modal-head" style={{ borderBottom: '1px solid var(--adm-border)', paddingBottom: 14 }}>
          <div>
            <span className="adm-eyebrow" style={{ color: '#f59e0b', letterSpacing: '0.08em', fontWeight: 700 }}>
              MANUAL FALLBACK · MATCH STATS
            </span>
            <h3 style={{ margin: '2px 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
              Edit Official Match Stats
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--adm-muted)' }}>
              {homeLabel} vs {awayLabel} · use this when EA sync is unavailable
            </p>
          </div>
          <button type="button" className="adm-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div className="adm-empty">Loading match stats…</div>
          ) : (
            <form id="manual-stats-form" onSubmit={onSubmit} className="adm-form-stack">
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
                  <strong style={{ display: 'block', marginBottom: 6 }}>{homeLabel}</strong>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    required
                    value={homeScore}
                    onChange={(e) => setHomeScore(e.target.value)}
                    className="adm-input"
                    style={{ width: 90, fontSize: '1.4rem', textAlign: 'center', fontWeight: 800 }}
                  />
                </div>
                <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--adm-muted)' }}>–</span>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <strong style={{ display: 'block', marginBottom: 6 }}>{awayLabel}</strong>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    required
                    value={awayScore}
                    onChange={(e) => setAwayScore(e.target.value)}
                    className="adm-input"
                    style={{ width: 90, fontSize: '1.4rem', textAlign: 'center', fontWeight: 800 }}
                  />
                </div>
              </div>

              <section style={{ border: '1px solid var(--adm-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '9px 12px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--adm-border)' }}>
                  <strong style={{ fontSize: '0.9rem' }}>Team match stats</strong>
                  <span className="adm-text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                    Leave blank to omit a stat.
                  </span>
                </div>
                <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {TEAM_FIELDS.map((field) => (
                    <div
                      key={field.label}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto 1fr',
                        gap: 8,
                        alignItems: 'center',
                        border: '1px solid var(--adm-border)',
                        borderRadius: 6,
                        padding: '6px 8px',
                      }}
                    >
                      <input
                        type="number"
                        min={0}
                        max={field.suffix === '%' ? 100 : 999}
                        value={team[field.home]}
                        onChange={(e) => setTeam((prev) => ({ ...prev, [field.home]: e.target.value }))}
                        className="adm-input"
                        style={{ padding: '4px 6px', textAlign: 'center' }}
                        aria-label={`${homeLabel} ${field.label}`}
                      />
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--adm-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        {field.label}{field.suffix ?? ''}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={field.suffix === '%' ? 100 : 999}
                        value={team[field.away]}
                        onChange={(e) => setTeam((prev) => ({ ...prev, [field.away]: e.target.value }))}
                        className="adm-input"
                        style={{ padding: '4px 6px', textAlign: 'center' }}
                        aria-label={`${awayLabel} ${field.label}`}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {([
                  ['home', homeLabel, homePlayers, homeSquad],
                  ['away', awayLabel, awayPlayers, awaySquad],
                ] as const).map(([side, label, rows, squad]) => (
                  <section key={side} style={{ border: '1px solid var(--adm-border)', borderRadius: 8, overflow: 'hidden' }}>
                    <div
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderBottom: '1px solid var(--adm-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <strong style={{ fontSize: '0.9rem' }}>{label} players ({rows.length})</strong>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {squad.length > 0 && (
                          <button
                            type="button"
                            className="adm-btn adm-btn-secondary adm-btn-xs"
                            onClick={() => loadSquad(side)}
                          >
                            + Load squad ({squad.length})
                          </button>
                        )}
                        <button
                          type="button"
                          className="adm-btn adm-btn-secondary adm-btn-xs"
                          onClick={() => addPlayer(side)}
                        >
                          + Add player
                        </button>
                      </div>
                    </div>

                    {rows.length === 0 ? (
                      <div style={{ padding: 12, fontSize: '0.85rem', color: 'var(--adm-muted)' }}>
                        No player stats yet. Load the registered squad or add a player manually.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="adm-table" style={{ fontSize: '0.82rem', margin: 0 }}>
                          <thead>
                            <tr>
                              <th>Gamertag</th>
                              <th style={{ width: 62 }}>Pos</th>
                              <th style={{ width: 54 }}>Goals</th>
                              <th style={{ width: 54 }}>Assists</th>
                              <th style={{ width: 54 }}>Shots</th>
                              <th style={{ width: 54 }}>Passes</th>
                              <th style={{ width: 54 }}>Tackles</th>
                              <th style={{ width: 54 }}>Saves</th>
                              <th style={{ width: 50 }}>CS</th>
                              <th style={{ width: 58 }}>Rating</th>
                              <th style={{ width: 48 }}>MoM</th>
                              <th style={{ width: 36 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((p, idx) => (
                              <tr key={`${side}-${idx}`}>
                                <td>
                                  <input
                                    type="text"
                                    value={p.gamertag}
                                    onChange={(e) => updatePlayer(side, idx, 'gamertag', e.target.value)}
                                    placeholder="Gamertag"
                                    className="adm-input"
                                    style={{ padding: '2px 6px', fontSize: '0.82rem' }}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    value={p.pos}
                                    onChange={(e) => updatePlayer(side, idx, 'pos', e.target.value)}
                                    className="adm-input"
                                    style={{ padding: '2px 4px', textAlign: 'center' }}
                                  />
                                </td>
                                {(['goals', 'assists', 'shots', 'passes', 'tackles', 'saves'] as const).map((field) => (
                                  <td key={field}>
                                    <input
                                      type="number"
                                      min={0}
                                      max={999}
                                      value={p[field]}
                                      onChange={(e) => updatePlayer(side, idx, field, Number(e.target.value) || 0)}
                                      className="adm-input"
                                      style={{ padding: '2px 4px', textAlign: 'center' }}
                                    />
                                  </td>
                                ))}
                                <td style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={p.cleanSheet}
                                    onChange={(e) => updatePlayer(side, idx, 'cleanSheet', e.target.checked)}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    max={10}
                                    step={0.1}
                                    value={p.rating}
                                    onChange={(e) => updatePlayer(side, idx, 'rating', Number(e.target.value) || 0)}
                                    className="adm-input"
                                    style={{ padding: '2px 4px', textAlign: 'center' }}
                                  />
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={p.isMom}
                                    onChange={(e) => updatePlayer(side, idx, 'isMom', e.target.checked)}
                                  />
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="adm-btn adm-btn-ghost adm-btn-xs"
                                    onClick={() => removePlayer(side, idx)}
                                    title="Remove player"
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
                  </section>
                ))}
              </div>

              <section style={{ border: '1px solid var(--adm-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.03)',
                    borderBottom: '1px solid var(--adm-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <strong style={{ fontSize: '0.9rem' }}>Match events ({events.length})</strong>
                  <button type="button" className="adm-btn adm-btn-secondary adm-btn-xs" onClick={addEvent}>
                    + Add event
                  </button>
                </div>
                {events.length === 0 ? (
                  <div style={{ padding: 12, fontSize: '0.85rem', color: 'var(--adm-muted)' }}>
                    No events recorded. Add goals, cards, substitutions or Man of the Match notes.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="adm-table" style={{ fontSize: '0.82rem', margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 60 }}>Min</th>
                          <th style={{ width: 130 }}>Type</th>
                          <th style={{ width: 90 }}>Side</th>
                          <th>Player</th>
                          <th>Detail</th>
                          <th style={{ width: 72 }}>Score</th>
                          <th style={{ width: 36 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((event, idx) => (
                          <tr key={idx}>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={130}
                                value={event.minute}
                                onChange={(e) => updateEvent(idx, { minute: e.target.value })}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                              />
                            </td>
                            <td>
                              <select
                                value={event.type}
                                onChange={(e) => updateEvent(idx, { type: e.target.value })}
                                className="adm-select"
                                style={{ padding: '2px 4px' }}
                              >
                                {EVENT_TYPES.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                value={event.teamSide}
                                onChange={(e) => updateEvent(idx, { teamSide: e.target.value as 'home' | 'away' })}
                                className="adm-select"
                                style={{ padding: '2px 4px' }}
                              >
                                <option value="home">{homeLabel}</option>
                                <option value="away">{awayLabel}</option>
                              </select>
                            </td>
                            <td>
                              <input
                                type="text"
                                value={event.playerName}
                                onChange={(e) => updateEvent(idx, { playerName: e.target.value })}
                                className="adm-input"
                                style={{ padding: '2px 6px' }}
                                placeholder="Player"
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={event.detail}
                                onChange={(e) => updateEvent(idx, { detail: e.target.value })}
                                className="adm-input"
                                style={{ padding: '2px 6px' }}
                                placeholder="Assist, substitution, note…"
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={event.score}
                                onChange={(e) => updateEvent(idx, { score: e.target.value })}
                                className="adm-input"
                                style={{ padding: '2px 4px', textAlign: 'center' }}
                                placeholder="2-1"
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="adm-btn adm-btn-ghost adm-btn-xs"
                                onClick={() => setEvents((prev) => prev.filter((_, i) => i !== idx))}
                                title="Remove event"
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
              </section>
            </form>
          )}
        </div>

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
          <span className="adm-text-muted" style={{ fontSize: 12 }}>
            {filledPlayers} player row{filledPlayers === 1 ? '' : 's'} · {events.length} event{events.length === 1 ? '' : 's'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              form="manual-stats-form"
              className="adm-btn adm-btn-primary"
              disabled={saving || loading || homeScore === '' || awayScore === ''}
              style={{ fontWeight: 700, padding: '8px 20px' }}
            >
              {saving ? 'Saving…' : 'Save manual stats'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
