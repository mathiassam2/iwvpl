import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  getManualMatchData,
  saveManualMatchStats,
  type ManualMatchData,
  type ManualMatchEvent,
  type Match,
} from '../api'
import type { Guard, Report } from '../utils'

export interface PlayerRow {
  clubId: number
  gamertag: string
  proName: string
  pos: string
  platform: 'ps' | 'pc' | 'xbox'
  rating: number
  goals: number
  assists: number
  shots: number
  shotAccuracy: number
  passes: number
  passAttempts: number
  passAccuracy: number
  dribbles: number
  dribbleSuccessRate: number
  tackles: number
  tackleAttempts: number
  tackleSuccessRate: number
  offsides: number
  foulsCommitted: number
  possessionWon: number
  possessionLost: number
  minutesPlayed: number
  distanceCovered: number
  distanceSprinted: number
  saves: number
  cleanSheet: boolean
  isMom: boolean
  yellowCards: number
  redCards: number
}

type TeamKey =
  | 'dribbleSuccessHome'
  | 'dribbleSuccessAway'
  | 'shotAccuracyHome'
  | 'shotAccuracyAway'
  | 'passAccuracyHome'
  | 'passAccuracyAway'
  | 'possessionHome'
  | 'possessionAway'
  | 'ballRecoveryTimeHome'
  | 'ballRecoveryTimeAway'
  | 'xgHome'
  | 'xgAway'
  | 'shotsHome'
  | 'shotsAway'
  | 'onTargetHome'
  | 'onTargetAway'
  | 'passesHome'
  | 'passesAway'
  | 'tacklesHome'
  | 'tacklesAway'
  | 'tacklesWonHome'
  | 'tacklesWonAway'
  | 'interceptionsHome'
  | 'interceptionsAway'
  | 'savesHome'
  | 'savesAway'
  | 'foulsHome'
  | 'foulsAway'
  | 'offsidesHome'
  | 'offsidesAway'
  | 'cornersHome'
  | 'cornersAway'
  | 'freeKicksHome'
  | 'freeKicksAway'
  | 'penaltiesHome'
  | 'penaltiesAway'
  | 'yellowCardsHome'
  | 'yellowCardsAway'
  | 'redCardsHome'
  | 'redCardsAway'

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
  dribbleSuccessHome: '',
  dribbleSuccessAway: '',
  shotAccuracyHome: '',
  shotAccuracyAway: '',
  passAccuracyHome: '',
  passAccuracyAway: '',
  possessionHome: '',
  possessionAway: '',
  ballRecoveryTimeHome: '',
  ballRecoveryTimeAway: '',
  xgHome: '',
  xgAway: '',
  shotsHome: '',
  shotsAway: '',
  onTargetHome: '',
  onTargetAway: '',
  passesHome: '',
  passesAway: '',
  tacklesHome: '',
  tacklesAway: '',
  tacklesWonHome: '',
  tacklesWonAway: '',
  interceptionsHome: '',
  interceptionsAway: '',
  savesHome: '',
  savesAway: '',
  foulsHome: '',
  foulsAway: '',
  offsidesHome: '',
  offsidesAway: '',
  cornersHome: '',
  cornersAway: '',
  freeKicksHome: '',
  freeKicksAway: '',
  penaltiesHome: '',
  penaltiesAway: '',
  yellowCardsHome: '',
  yellowCardsAway: '',
  redCardsHome: '',
  redCardsAway: '',
}

interface TeamFieldDef {
  label: string
  home: TeamKey
  away: TeamKey
  suffix?: string
  step?: number
  max?: number
}

const TEAM_STAT_GROUPS: Array<{ title: string; subtitle: string; fields: TeamFieldDef[] }> = [
  {
    title: 'Accuracy Gauges (Circular Rings)',
    subtitle: 'Shown as circular percentage rings on left & right of Match Summary',
    fields: [
      { label: 'Dribble Success Rate', home: 'dribbleSuccessHome', away: 'dribbleSuccessAway', suffix: '%', max: 100 },
      { label: 'Shot Accuracy', home: 'shotAccuracyHome', away: 'shotAccuracyAway', suffix: '%', max: 100 },
      { label: 'Pass Accuracy', home: 'passAccuracyHome', away: 'passAccuracyAway', suffix: '%', max: 100 },
    ],
  },
  {
    title: 'Possession & Expected Metrics',
    subtitle: 'Top center comparison bars in Match Summary',
    fields: [
      { label: 'Possession', home: 'possessionHome', away: 'possessionAway', suffix: '%', max: 100 },
      { label: 'Ball Recovery Time', home: 'ballRecoveryTimeHome', away: 'ballRecoveryTimeAway', suffix: 's', max: 999 },
      { label: 'Expected Goals (xG)', home: 'xgHome', away: 'xgAway', step: 0.01, max: 99 },
    ],
  },
  {
    title: 'Attacking, Passing & Set Pieces',
    subtitle: 'Shots, passing volume, corners, free kicks & penalties',
    fields: [
      { label: 'Shots', home: 'shotsHome', away: 'shotsAway' },
      { label: 'Shots On Target', home: 'onTargetHome', away: 'onTargetAway' },
      { label: 'Passes', home: 'passesHome', away: 'passesAway' },
      { label: 'Corners', home: 'cornersHome', away: 'cornersAway' },
      { label: 'Free Kicks', home: 'freeKicksHome', away: 'freeKicksAway' },
      { label: 'Penalty Kicks', home: 'penaltiesHome', away: 'penaltiesAway' },
      { label: 'Offsides', home: 'offsidesHome', away: 'offsidesAway' },
    ],
  },
  {
    title: 'Defending, Goalkeeping & Discipline',
    subtitle: 'Tackles, interceptions, saves, fouls & cards',
    fields: [
      { label: 'Tackles', home: 'tacklesHome', away: 'tacklesAway' },
      { label: 'Tackles Won', home: 'tacklesWonHome', away: 'tacklesWonAway' },
      { label: 'Interceptions', home: 'interceptionsHome', away: 'interceptionsAway' },
      { label: 'Saves', home: 'savesHome', away: 'savesAway' },
      { label: 'Fouls Committed', home: 'foulsHome', away: 'foulsAway' },
      { label: 'Yellow Cards', home: 'yellowCardsHome', away: 'yellowCardsAway' },
      { label: 'Red Cards', home: 'redCardsHome', away: 'redCardsAway' },
    ],
  },
]

const POSITIONS = [
  'LS', 'ST', 'RS', 'LW', 'LF', 'CF', 'RF', 'RW',
  'LAM', 'CAM', 'RAM', 'LM', 'LCM', 'CM', 'RCM', 'RM',
  'LWB', 'LDM', 'CDM', 'RDM', 'RWB',
  'LB', 'LCB', 'CB', 'RCB', 'RB', 'GK', 'ANY',
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
    proName: '',
    pos,
    platform: 'ps',
    rating: 7.0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotAccuracy: 0,
    passes: 0,
    passAttempts: 0,
    passAccuracy: 0,
    dribbles: 0,
    dribbleSuccessRate: 0,
    tackles: 0,
    tackleAttempts: 0,
    tackleSuccessRate: 0,
    offsides: 0,
    foulsCommitted: 0,
    possessionWon: 0,
    possessionLost: 0,
    minutesPlayed: 90,
    distanceCovered: 0,
    distanceSprinted: 0,
    saves: 0,
    cleanSheet: false,
    isMom: false,
    yellowCards: 0,
    redCards: 0,
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

  const [activeTab, setActiveTab] = useState<'all' | 'summary' | 'players' | 'events'>('all')
  const [playerMode, setPlayerMode] = useState<'quick' | 'advanced'>('quick')
  const [expandedPlayerKey, setExpandedPlayerKey] = useState<string | null>(null)

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
          gamertag: p.gamertag || '',
          proName: p.pro_name || '',
          pos: p.pos || 'CM',
          platform: p.platform === 'pc' || p.platform === 'xbox' ? p.platform : 'ps',
          rating: Number(p.rating) || 6.0,
          goals: Number(p.goals) || 0,
          assists: Number(p.assists) || 0,
          shots: Number(p.shots) || 0,
          shotAccuracy: Number(p.shot_accuracy) || 0,
          passes: Number(p.passes) || 0,
          passAttempts: Number(p.pass_attempts) || 0,
          passAccuracy: Number(p.pass_accuracy) || 0,
          dribbles: Number(p.dribbles) || 0,
          dribbleSuccessRate: Number(p.dribble_success_rate) || 0,
          tackles: Number(p.tackles) || 0,
          tackleAttempts: Number(p.tackle_attempts) || 0,
          tackleSuccessRate: Number(p.tackle_success_rate) || 0,
          offsides: Number(p.offsides) || 0,
          foulsCommitted: Number(p.fouls_committed) || 0,
          possessionWon: Number(p.possession_won) || 0,
          possessionLost: Number(p.possession_lost) || 0,
          minutesPlayed: p.minutes_played != null ? Number(p.minutes_played) : 90,
          distanceCovered: Number(p.distance_covered) || 0,
          distanceSprinted: Number(p.distance_sprinted) || 0,
          saves: Number(p.saves) || 0,
          cleanSheet: Boolean(p.clean_sheet),
          isMom: Boolean(p.is_mom),
          yellowCards: Number(p.yellow_cards) || 0,
          redCards: Number(p.red_cards) || 0,
        })
        setHomePlayers(result.playerStats.filter((p) => p.club_id === result.match.home_club_id).map(toRow))
        setAwayPlayers(result.playerStats.filter((p) => p.club_id === result.match.away_club_id).map(toRow))

        const ms: any = result.teamStats
        const str = (v: unknown) => (v != null && v !== '' ? String(v) : '')
        setTeam({
          dribbleSuccessHome: str(ms?.dribble_success_home),
          dribbleSuccessAway: str(ms?.dribble_success_away),
          shotAccuracyHome: str(ms?.shot_accuracy_home),
          shotAccuracyAway: str(ms?.shot_accuracy_away),
          passAccuracyHome: str(ms?.pass_accuracy_home),
          passAccuracyAway: str(ms?.pass_accuracy_away),
          possessionHome: str(ms?.possession_home),
          possessionAway: str(ms?.possession_away),
          ballRecoveryTimeHome: str(ms?.ball_recovery_time_home),
          ballRecoveryTimeAway: str(ms?.ball_recovery_time_away),
          xgHome: str(ms?.xg_home),
          xgAway: str(ms?.xg_away),
          shotsHome: str(ms?.shots_home),
          shotsAway: str(ms?.shots_away),
          onTargetHome: str(ms?.on_target_home),
          onTargetAway: str(ms?.on_target_away),
          passesHome: str(ms?.passes_home),
          passesAway: str(ms?.passes_away),
          tacklesHome: str(ms?.tackles_home),
          tacklesAway: str(ms?.tackles_away),
          tacklesWonHome: str(ms?.tackles_won_home),
          tacklesWonAway: str(ms?.tackles_won_away),
          interceptionsHome: str(ms?.interceptions_home),
          interceptionsAway: str(ms?.interceptions_away),
          savesHome: str(ms?.saves_home),
          savesAway: str(ms?.saves_away),
          foulsHome: str(ms?.fouls_home),
          foulsAway: str(ms?.fouls_away),
          offsidesHome: str(ms?.offsides_home),
          offsidesAway: str(ms?.offsides_away),
          cornersHome: str(ms?.corners_home),
          cornersAway: str(ms?.corners_away),
          freeKicksHome: str(ms?.free_kicks_home),
          freeKicksAway: str(ms?.free_kicks_away),
          penaltiesHome: str(ms?.penalties_home),
          penaltiesAway: str(ms?.penalties_away),
          yellowCardsHome: str(ms?.yellow_cards_home),
          yellowCardsAway: str(ms?.yellow_cards_away),
          redCardsHome: str(ms?.red_cards_home),
          redCardsAway: str(ms?.red_cards_away),
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

  const autoFillTeamFromPlayers = () => {
    const calcSide = (rows: PlayerRow[]) => {
      const valid = rows.filter((r) => r.gamertag.trim())
      const sum = (fn: (r: PlayerRow) => number) => valid.reduce((acc, r) => acc + (Number(fn(r)) || 0), 0)
      const shots = sum((r) => r.shots)
      const goals = sum((r) => r.goals)
      const passes = sum((r) => r.passes)
      const passAttempts = sum((r) => r.passAttempts)
      const tackles = sum((r) => r.tackleAttempts || r.tackles)
      const tacklesWon = sum((r) => r.tackles)
      const saves = sum((r) => r.saves)
      const fouls = sum((r) => r.foulsCommitted)
      const offsides = sum((r) => r.offsides)
      const yellows = sum((r) => r.yellowCards)
      const reds = sum((r) => r.redCards)

      const avgPassAcc =
        passAttempts > 0
          ? Math.round((passes / passAttempts) * 100)
          : valid.some((r) => r.passAccuracy > 0)
          ? Math.round(sum((r) => r.passAccuracy) / valid.filter((r) => r.passAccuracy > 0).length)
          : null

      const avgShotAcc =
        valid.some((r) => r.shotAccuracy > 0)
          ? Math.round(sum((r) => r.shotAccuracy) / valid.filter((r) => r.shotAccuracy > 0).length)
          : shots > 0
          ? Math.min(100, Math.round((goals / shots) * 100))
          : null

      const avgDribbleAcc =
        valid.some((r) => r.dribbleSuccessRate > 0)
          ? Math.round(sum((r) => r.dribbleSuccessRate) / valid.filter((r) => r.dribbleSuccessRate > 0).length)
          : null

      return {
        shots,
        passes,
        tackles,
        tacklesWon,
        saves,
        fouls,
        offsides,
        yellows,
        reds,
        avgPassAcc,
        avgShotAcc,
        avgDribbleAcc,
      }
    }

    const h = calcSide(homePlayers)
    const a = calcSide(awayPlayers)

    setTeam((prev) => ({
      ...prev,
      shotsHome: h.shots ? String(h.shots) : prev.shotsHome,
      shotsAway: a.shots ? String(a.shots) : prev.shotsAway,
      passesHome: h.passes ? String(h.passes) : prev.passesHome,
      passesAway: a.passes ? String(a.passes) : prev.passesAway,
      tacklesHome: h.tackles ? String(h.tackles) : prev.tacklesHome,
      tacklesAway: a.tackles ? String(a.tackles) : prev.tacklesAway,
      tacklesWonHome: h.tacklesWon ? String(h.tacklesWon) : prev.tacklesWonHome,
      tacklesWonAway: a.tacklesWon ? String(a.tacklesWon) : prev.tacklesWonAway,
      savesHome: h.saves ? String(h.saves) : prev.savesHome,
      savesAway: a.saves ? String(a.saves) : prev.savesAway,
      foulsHome: h.fouls ? String(h.fouls) : prev.foulsHome,
      foulsAway: a.fouls ? String(a.fouls) : prev.foulsAway,
      offsidesHome: h.offsides ? String(h.offsides) : prev.offsidesHome,
      offsidesAway: a.offsides ? String(a.offsides) : prev.offsidesAway,
      yellowCardsHome: h.yellows ? String(h.yellows) : prev.yellowCardsHome,
      yellowCardsAway: a.yellows ? String(a.yellows) : prev.yellowCardsAway,
      redCardsHome: h.reds ? String(h.reds) : prev.redCardsHome,
      redCardsAway: a.reds ? String(a.reds) : prev.redCardsAway,
      passAccuracyHome: h.avgPassAcc != null ? String(h.avgPassAcc) : prev.passAccuracyHome,
      passAccuracyAway: a.avgPassAcc != null ? String(a.avgPassAcc) : prev.passAccuracyAway,
      shotAccuracyHome: h.avgShotAcc != null ? String(h.avgShotAcc) : prev.shotAccuracyHome,
      shotAccuracyAway: a.avgShotAcc != null ? String(a.avgShotAcc) : prev.shotAccuracyAway,
      dribbleSuccessHome: h.avgDribbleAcc != null ? String(h.avgDribbleAcc) : prev.dribbleSuccessHome,
      dribbleSuccessAway: a.avgDribbleAcc != null ? String(a.avgDribbleAcc) : prev.dribbleSuccessAway,
    }))
    report('info', 'Aggregated team summary stats from player rows.')
  }

  const updatePlayer = (
    side: 'home' | 'away',
    index: number,
    field: keyof PlayerRow,
    value: string | number | boolean,
  ) => {
    const list = side === 'home' ? [...homePlayers] : [...awayPlayers]
    if (!list[index]) return
    const next = { ...list[index], [field]: value }
    // Auto-calculate passAccuracy or tackleSuccessRate if attempts & made are edited
    if ((field === 'passes' || field === 'passAttempts') && next.passAttempts > 0) {
      next.passAccuracy = Math.min(100, Math.round((next.passes / next.passAttempts) * 100))
    }
    if ((field === 'tackles' || field === 'tackleAttempts') && next.tackleAttempts > 0) {
      next.tackleSuccessRate = Math.min(100, Math.round((next.tackles / next.tackleAttempts) * 100))
    }
    list[index] = next
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
        style={{ maxWidth: 1240, width: '97%', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adm-modal-head" style={{ borderBottom: '1px solid var(--adm-border)', paddingBottom: 14 }}>
          <div>
            <span className="adm-eyebrow" style={{ color: '#f59e0b', letterSpacing: '0.08em', fontWeight: 700 }}>
              EA FC 26 PRO CLUBS · FULL MATCH & PLAYER STATS EDITOR
            </span>
            <h3 style={{ margin: '2px 0 0', fontSize: '1.22rem', fontWeight: 800 }}>
              {homeLabel} vs {awayLabel}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: 'var(--adm-muted)' }}>
              Enter or refine full Match Summary gauges, comparison bars, Player Performance metrics, and platforms
            </p>
          </div>
          <button type="button" className="adm-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Section Filter Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 0',
            borderBottom: '1px solid var(--adm-border)',
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              ['all', '📋 All Sections'],
              ['summary', '📊 Match Summary (20 Stats)'],
              ['players', `👥 Player Performance (${filledPlayers})`],
              ['events', `⏱️ Match Events (${events.length})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`adm-btn adm-btn-xs ${activeTab === key ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="adm-btn adm-btn-secondary adm-btn-xs"
              onClick={autoFillTeamFromPlayers}
              title="Sum shots, passes, tackles, saves, cards & averages from player rows into Team Summary"
            >
              ⚡ Auto-Fill Summary from Players
            </button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {loading ? (
            <div className="adm-empty">Loading match stats…</div>
          ) : (
            <form id="manual-stats-form" onSubmit={onSubmit} className="adm-form-stack">
              {/* Scoreline Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(56,189,248,0.05))',
                  border: '1px solid var(--adm-border)',
                  borderRadius: 10,
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 24,
                }}
              >
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4ade80', fontWeight: 700 }}>
                    HOME CLUB
                  </div>
                  <strong style={{ display: 'block', marginBottom: 6, fontSize: '1.05rem' }}>{homeLabel}</strong>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    required
                    value={homeScore}
                    onChange={(e) => setHomeScore(e.target.value)}
                    className="adm-input"
                    style={{ width: 92, fontSize: '1.5rem', textAlign: 'center', fontWeight: 800 }}
                  />
                </div>
                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--adm-muted)' }}>:</span>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#38bdf8', fontWeight: 700 }}>
                    AWAY CLUB
                  </div>
                  <strong style={{ display: 'block', marginBottom: 6, fontSize: '1.05rem' }}>{awayLabel}</strong>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    required
                    value={awayScore}
                    onChange={(e) => setAwayScore(e.target.value)}
                    className="adm-input"
                    style={{ width: 92, fontSize: '1.5rem', textAlign: 'center', fontWeight: 800 }}
                  />
                </div>
              </div>

              {/* TEAM MATCH SUMMARY STATS */}
              {(activeTab === 'all' || activeTab === 'summary') && (
                <section style={{ border: '1px solid var(--adm-border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.03)',
                      borderBottom: '1px solid var(--adm-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>Match Summary Stats ({homeLabel} vs {awayLabel})</strong>
                      <span className="adm-text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                        Matches EA FC 26 Match Summary screen (circular gauges + center comparison bars).
                      </span>
                    </div>
                    {team.possessionHome !== '' && (
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-xs"
                        onClick={() => {
                          const h = Number(team.possessionHome)
                          if (Number.isFinite(h) && h >= 0 && h <= 100) {
                            setTeam((prev) => ({ ...prev, possessionAway: String(Math.max(0, 100 - h)) }))
                          }
                        }}
                      >
                        Balance Possession (100%)
                      </button>
                    )}
                  </div>

                  <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 14 }}>
                    {TEAM_STAT_GROUPS.map((group) => (
                      <div
                        key={group.title}
                        style={{
                          border: '1px solid var(--adm-border)',
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.015)',
                          padding: 12,
                        }}
                      >
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#e2e8f0' }}>{group.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--adm-muted)' }}>{group.subtitle}</div>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '90px 1fr 90px',
                            gap: 8,
                            padding: '0 4px 6px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: 'var(--adm-muted)',
                          }}
                        >
                          <span style={{ textAlign: 'center', color: '#4ade80' }}>{homeLabel.slice(0, 12)}</span>
                          <span style={{ textAlign: 'center' }}>Metric</span>
                          <span style={{ textAlign: 'center', color: '#38bdf8' }}>{awayLabel.slice(0, 12)}</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {group.fields.map((field) => (
                            <div
                              key={field.label}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '90px 1fr 90px',
                                gap: 8,
                                alignItems: 'center',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 6,
                                padding: '4px 6px',
                                background: 'rgba(0,0,0,0.2)',
                              }}
                            >
                              <input
                                type="number"
                                min={0}
                                max={field.max ?? 999}
                                step={field.step ?? 1}
                                value={team[field.home]}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setTeam((prev) => {
                                    const next = { ...prev, [field.home]: val }
                                    if (field.home === 'possessionHome' && val !== '' && Number(val) >= 0 && Number(val) <= 100 && prev.possessionAway === '') {
                                      next.possessionAway = String(100 - Number(val))
                                    }
                                    return next
                                  })
                                }}
                                placeholder="—"
                                className="adm-input"
                                style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}
                                aria-label={`${homeLabel} ${field.label}`}
                              />
                              <span
                                style={{
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  color: '#cbd5e1',
                                  textAlign: 'center',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.03em',
                                }}
                              >
                                {field.label}
                                {field.suffix ? ` (${field.suffix})` : ''}
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={field.max ?? 999}
                                step={field.step ?? 1}
                                value={team[field.away]}
                                onChange={(e) => setTeam((prev) => ({ ...prev, [field.away]: e.target.value }))}
                                placeholder="—"
                                className="adm-input"
                                style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}
                                aria-label={`${awayLabel} ${field.label}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* PLAYER PERFORMANCE STATS */}
              {(activeTab === 'all' || activeTab === 'players') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'rgba(56,189,248,0.06)',
                      border: '1px solid rgba(56,189,248,0.2)',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: '#e0f2fe' }}>
                        Player Performance & Platform Entry Mode
                      </strong>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                        Switch between Quick Mode (core stats + expandable per-player drawer) or Full Table Mode (all 17 EA FC columns visible).
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className={`adm-btn adm-btn-xs ${playerMode === 'quick' ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
                        onClick={() => setPlayerMode('quick')}
                      >
                        ⚡ Quick Mode + Drawer
                      </button>
                      <button
                        type="button"
                        className={`adm-btn adm-btn-xs ${playerMode === 'advanced' ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
                        onClick={() => setPlayerMode('advanced')}
                      >
                        🔬 Full 17-Stat Table
                      </button>
                    </div>
                  </div>

                  {([
                    ['home', homeLabel, homePlayers, homeSquad, '#4ade80'],
                    ['away', awayLabel, awayPlayers, awaySquad, '#38bdf8'],
                  ] as const).map(([side, label, rows, squad, accentColor]) => (
                    <section key={side} style={{ border: '1px solid var(--adm-border)', borderRadius: 10, overflow: 'hidden' }}>
                      <div
                        style={{
                          padding: '10px 14px',
                          background: 'rgba(255,255,255,0.03)',
                          borderBottom: '1px solid var(--adm-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: accentColor, display: 'inline-block' }} />
                          <strong style={{ fontSize: '0.95rem' }}>{label} — Player Performance ({rows.length})</strong>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {squad.length > 0 && (
                            <button
                              type="button"
                              className="adm-btn adm-btn-secondary adm-btn-xs"
                              onClick={() => loadSquad(side)}
                            >
                              + Load Registered Squad ({squad.length})
                            </button>
                          )}
                          <button
                            type="button"
                            className="adm-btn adm-btn-secondary adm-btn-xs"
                            onClick={() => addPlayer(side)}
                          >
                            + Add Player Row
                          </button>
                        </div>
                      </div>

                      {rows.length === 0 ? (
                        <div style={{ padding: 16, fontSize: '0.85rem', color: 'var(--adm-muted)' }}>
                          No player stats yet. Click <strong>+ Load Registered Squad</strong> or <strong>+ Add Player Row</strong>.
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="adm-table" style={{ fontSize: '0.8rem', margin: 0 }}>
                            <thead>
                              <tr>
                                <th style={{ width: 66 }}>Plat</th>
                                <th style={{ width: 68 }}>POS</th>
                                <th style={{ minWidth: 140 }}>Gamertag</th>
                                <th style={{ minWidth: 115 }}>Pro Name</th>
                                <th style={{ width: 62, textAlign: 'center' }}>RR</th>
                                <th style={{ width: 52, textAlign: 'center' }}>G</th>
                                <th style={{ width: 52, textAlign: 'center' }}>AST</th>
                                <th style={{ width: 54, textAlign: 'center' }}>SH</th>
                                {playerMode === 'advanced' && <th style={{ width: 58, textAlign: 'center' }}>SH%</th>}
                                <th style={{ width: 56, textAlign: 'center' }}>PAS</th>
                                {playerMode === 'advanced' && (
                                  <>
                                    <th style={{ width: 58, textAlign: 'center' }}>PAS%</th>
                                    <th style={{ width: 56, textAlign: 'center' }}>DRB</th>
                                    <th style={{ width: 58, textAlign: 'center' }}>DRB%</th>
                                  </>
                                )}
                                <th style={{ width: 54, textAlign: 'center' }}>TCK</th>
                                {playerMode === 'advanced' && (
                                  <>
                                    <th style={{ width: 58, textAlign: 'center' }}>TCK%</th>
                                    <th style={{ width: 52, textAlign: 'center' }}>OFF</th>
                                    <th style={{ width: 52, textAlign: 'center' }}>FLS</th>
                                    <th style={{ width: 56, textAlign: 'center' }}>WON</th>
                                    <th style={{ width: 56, textAlign: 'center' }}>LST</th>
                                    <th style={{ width: 54, textAlign: 'center' }}>MIN</th>
                                    <th style={{ width: 60, textAlign: 'center' }}>KM</th>
                                    <th style={{ width: 60, textAlign: 'center' }}>SPR</th>
                                    <th style={{ width: 48, textAlign: 'center' }}>YC</th>
                                    <th style={{ width: 48, textAlign: 'center' }}>RC</th>
                                  </>
                                )}
                                <th style={{ width: 52, textAlign: 'center' }}>SAV</th>
                                <th style={{ width: 42, textAlign: 'center' }}>CS</th>
                                <th style={{ width: 46, textAlign: 'center' }}>MoM</th>
                                <th style={{ width: 92, textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((p, idx) => {
                                const rowKey = `${side}-${idx}`
                                const isExpanded = expandedPlayerKey === rowKey
                                return (
                                  <>
                                    <tr key={rowKey} style={isExpanded ? { background: 'rgba(56,189,248,0.06)' } : undefined}>
                                      <td>
                                        <select
                                          value={p.platform}
                                          onChange={(e) => updatePlayer(side, idx, 'platform', e.target.value)}
                                          className="adm-select"
                                          style={{ padding: '2px 4px', fontSize: '0.75rem' }}
                                          title="Gaming Platform"
                                        >
                                          <option value="ps">PS5</option>
                                          <option value="pc">PC</option>
                                          <option value="xbox">XBOX</option>
                                        </select>
                                      </td>
                                      <td>
                                        <select
                                          value={POSITIONS.includes(p.pos.toUpperCase()) ? p.pos.toUpperCase() : 'CM'}
                                          onChange={(e) => updatePlayer(side, idx, 'pos', e.target.value)}
                                          className="adm-select"
                                          style={{ padding: '2px 4px', fontSize: '0.76rem', fontWeight: 700 }}
                                        >
                                          {POSITIONS.map((posOpt) => (
                                            <option key={posOpt} value={posOpt}>
                                              {posOpt}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td>
                                        <input
                                          type="text"
                                          value={p.gamertag}
                                          onChange={(e) => updatePlayer(side, idx, 'gamertag', e.target.value)}
                                          placeholder="Gamertag (e.g. Jangz)"
                                          className="adm-input"
                                          style={{ padding: '3px 6px', fontSize: '0.8rem', fontWeight: 600 }}
                                        />
                                      </td>
                                      <td>
                                        <input
                                          type="text"
                                          value={p.proName}
                                          onChange={(e) => updatePlayer(side, idx, 'proName', e.target.value)}
                                          placeholder="Pro Name (e.g. Wilson)"
                                          className="adm-input"
                                          style={{ padding: '3px 6px', fontSize: '0.78rem' }}
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
                                          style={{ padding: '2px 4px', textAlign: 'center', fontWeight: 700, color: '#4ade80' }}
                                        />
                                      </td>
                                      <td>
                                        <input
                                          type="number"
                                          min={0}
                                          max={99}
                                          value={p.goals}
                                          onChange={(e) => updatePlayer(side, idx, 'goals', Number(e.target.value) || 0)}
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
                                          onChange={(e) => updatePlayer(side, idx, 'assists', Number(e.target.value) || 0)}
                                          className="adm-input"
                                          style={{ padding: '2px 4px', textAlign: 'center' }}
                                        />
                                      </td>
                                      <td>
                                        <input
                                          type="number"
                                          min={0}
                                          max={99}
                                          value={p.shots}
                                          onChange={(e) => updatePlayer(side, idx, 'shots', Number(e.target.value) || 0)}
                                          className="adm-input"
                                          style={{ padding: '2px 4px', textAlign: 'center' }}
                                        />
                                      </td>
                                      {playerMode === 'advanced' && (
                                        <td>
                                          <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={p.shotAccuracy}
                                            onChange={(e) => updatePlayer(side, idx, 'shotAccuracy', Number(e.target.value) || 0)}
                                            className="adm-input"
                                            style={{ padding: '2px 4px', textAlign: 'center' }}
                                          />
                                        </td>
                                      )}
                                      <td>
                                        <input
                                          type="number"
                                          min={0}
                                          max={999}
                                          value={p.passes}
                                          onChange={(e) => updatePlayer(side, idx, 'passes', Number(e.target.value) || 0)}
                                          className="adm-input"
                                          style={{ padding: '2px 4px', textAlign: 'center' }}
                                        />
                                      </td>
                                      {playerMode === 'advanced' && (
                                        <>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              value={p.passAccuracy}
                                              onChange={(e) => updatePlayer(side, idx, 'passAccuracy', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={999}
                                              value={p.dribbles}
                                              onChange={(e) => updatePlayer(side, idx, 'dribbles', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              value={p.dribbleSuccessRate}
                                              onChange={(e) => updatePlayer(side, idx, 'dribbleSuccessRate', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                        </>
                                      )}
                                      <td>
                                        <input
                                          type="number"
                                          min={0}
                                          max={99}
                                          value={p.tackles}
                                          onChange={(e) => updatePlayer(side, idx, 'tackles', Number(e.target.value) || 0)}
                                          className="adm-input"
                                          style={{ padding: '2px 4px', textAlign: 'center' }}
                                        />
                                      </td>
                                      {playerMode === 'advanced' && (
                                        <>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              value={p.tackleSuccessRate}
                                              onChange={(e) => updatePlayer(side, idx, 'tackleSuccessRate', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={99}
                                              value={p.offsides}
                                              onChange={(e) => updatePlayer(side, idx, 'offsides', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={99}
                                              value={p.foulsCommitted}
                                              onChange={(e) => updatePlayer(side, idx, 'foulsCommitted', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={999}
                                              value={p.possessionWon}
                                              onChange={(e) => updatePlayer(side, idx, 'possessionWon', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={999}
                                              value={p.possessionLost}
                                              onChange={(e) => updatePlayer(side, idx, 'possessionLost', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={150}
                                              value={p.minutesPlayed}
                                              onChange={(e) => updatePlayer(side, idx, 'minutesPlayed', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={50}
                                              step={0.1}
                                              value={p.distanceCovered}
                                              onChange={(e) => updatePlayer(side, idx, 'distanceCovered', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={50}
                                              step={0.1}
                                              value={p.distanceSprinted}
                                              onChange={(e) => updatePlayer(side, idx, 'distanceSprinted', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={2}
                                              value={p.yellowCards}
                                              onChange={(e) => updatePlayer(side, idx, 'yellowCards', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                          <td>
                                            <input
                                              type="number"
                                              min={0}
                                              max={1}
                                              value={p.redCards}
                                              onChange={(e) => updatePlayer(side, idx, 'redCards', Number(e.target.value) || 0)}
                                              className="adm-input"
                                              style={{ padding: '2px 4px', textAlign: 'center' }}
                                            />
                                          </td>
                                        </>
                                      )}
                                      <td>
                                        <input
                                          type="number"
                                          min={0}
                                          max={99}
                                          value={p.saves}
                                          onChange={(e) => updatePlayer(side, idx, 'saves', Number(e.target.value) || 0)}
                                          className="adm-input"
                                          style={{ padding: '2px 4px', textAlign: 'center' }}
                                        />
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={p.cleanSheet}
                                          onChange={(e) => updatePlayer(side, idx, 'cleanSheet', e.target.checked)}
                                        />
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={p.isMom}
                                          onChange={(e) => updatePlayer(side, idx, 'isMom', e.target.checked)}
                                        />
                                      </td>
                                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button
                                          type="button"
                                          className={`adm-btn adm-btn-xs ${isExpanded ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
                                          onClick={() => setExpandedPlayerKey(isExpanded ? null : rowKey)}
                                          title="Open full EA FC 26 Player Performance metrics drawer"
                                          style={{ marginRight: 4 }}
                                        >
                                          {isExpanded ? 'Hide' : '17 Stats'}
                                        </button>
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

                                    {/* Expandable Per-Player 17-Stat Drawer */}
                                    {isExpanded && (
                                      <tr key={`${rowKey}-drawer`}>
                                        <td colSpan={playerMode === 'advanced' ? 24 : 13} style={{ padding: 0 }}>
                                          <div
                                            style={{
                                              padding: '12px 16px',
                                              background: 'rgba(15,23,42,0.85)',
                                              borderBottom: '2px solid rgba(56,189,248,0.35)',
                                              display: 'grid',
                                              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                                              gap: 10,
                                            }}
                                          >
                                            {([
                                              ['Shot Accuracy (%)', 'shotAccuracy', 0, 100, 1],
                                              ['Pass Attempts', 'passAttempts', 0, 999, 1],
                                              ['Pass Accuracy (%)', 'passAccuracy', 0, 100, 1],
                                              ['Dribbles', 'dribbles', 0, 999, 1],
                                              ['Dribble Success (%)', 'dribbleSuccessRate', 0, 100, 1],
                                              ['Tackle Attempts', 'tackleAttempts', 0, 999, 1],
                                              ['Tackle Success (%)', 'tackleSuccessRate', 0, 100, 1],
                                              ['Offsides', 'offsides', 0, 99, 1],
                                              ['Fouls Committed', 'foulsCommitted', 0, 99, 1],
                                              ['Possession Won', 'possessionWon', 0, 999, 1],
                                              ['Possession Lost', 'possessionLost', 0, 999, 1],
                                              ['Minutes Played', 'minutesPlayed', 0, 150, 1],
                                              ['Distance Covered (km)', 'distanceCovered', 0, 50, 0.1],
                                              ['Distance Sprinted (km)', 'distanceSprinted', 0, 50, 0.1],
                                              ['Yellow Cards', 'yellowCards', 0, 2, 1],
                                              ['Red Cards', 'redCards', 0, 1, 1],
                                            ] as const).map(([fieldLabel, key, minV, maxV, stepV]) => (
                                              <label
                                                key={key}
                                                style={{
                                                  display: 'flex',
                                                  flexDirection: 'column',
                                                  gap: 3,
                                                  fontSize: '0.72rem',
                                                  color: '#94a3b8',
                                                  fontWeight: 600,
                                                }}
                                              >
                                                <span>{fieldLabel}</span>
                                                <input
                                                  type="number"
                                                  min={minV}
                                                  max={maxV}
                                                  step={stepV}
                                                  value={p[key]}
                                                  onChange={(e) =>
                                                    updatePlayer(side, idx, key, Number(e.target.value) || 0)
                                                  }
                                                  className="adm-input"
                                                  style={{ padding: '4px 6px', fontSize: '0.82rem', fontWeight: 700 }}
                                                />
                                              </label>
                                            ))}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}

              {/* MATCH EVENTS */}
              {(activeTab === 'all' || activeTab === 'events') && (
                <section style={{ border: '1px solid var(--adm-border)', borderRadius: 10, overflow: 'hidden' }}>
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
                    <strong style={{ fontSize: '0.9rem' }}>Match Timeline Events ({events.length})</strong>
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
              )}
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
              {saving ? 'Saving…' : 'Save Official Match Stats'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
