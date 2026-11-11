import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getAdminClubs,
  getClubDossier,
  getClubEaProfile,
  type Club,
  type ClubDossier,
  type ClubEaProfileResponse,
  type DossierMatch,
  type DossierPlayerStat,
  type DossierPlayerTotal,
  type EaClubFullProfile,
  type EaMatchSummary,
  type EaPlayerStatItem,
} from '../api'
import { CustomSelect } from '../CustomSelect'
import { formatKickoffDisplay, normalizeSearch, type Guard, type Report } from '../utils'

type DossierTab = 'overview' | 'iwvpl' | 'ea' | 'squad' | 'players'
type EaMatchTab = 'league' | 'friendly' | 'playoff'
type PlayerSortKey =
  | 'gamertag'
  | 'appearances'
  | 'goals'
  | 'assists'
  | 'saves'
  | 'clean_sheets'
  | 'avg_rating'
  | 'shots'
  | 'passes'
  | 'tackles'
  | 'minutes_played'

const EA_TAB_LABELS: Record<EaMatchTab, string> = {
  league: 'League',
  friendly: 'Friendlies',
  playoff: 'Playoffs',
}

function ordinal(value: number): string {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return `${value}st`
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`
  return `${value}th`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resultTone(result: 'W' | 'D' | 'L' | null | undefined): string {
  if (result === 'W') return 'is-win'
  if (result === 'D') return 'is-draw'
  if (result === 'L') return 'is-loss'
  return 'is-pending'
}

function ResultBadge({ result, fallback }: { result: 'W' | 'D' | 'L' | null; fallback?: string }) {
  if (!result) {
    return <span className="adm-dossier-result-badge is-pending">{fallback ?? '—'}</span>
  }
  return <span className={`adm-dossier-result-badge ${resultTone(result)}`}>{result}</span>
}

function FormBadges({ form }: { form: string | null | undefined }) {
  const characters = (form ?? '').toUpperCase().split('').filter((char) => 'WDL'.includes(char))
  if (characters.length === 0) return <span className="adm-dossier-form-empty">No form yet</span>
  return (
    <span className="adm-dossier-form" aria-label={`Form ${characters.join(' ')}`}>
      {characters.map((char, index) => (
        <span key={`${char}-${index}`} className={`adm-dossier-form-dot ${resultTone(char as 'W' | 'D' | 'L')}`}>
          {char}
        </span>
      ))}
    </span>
  )
}

function ClubCrest({
  src,
  name,
  size = 'md',
}: {
  src: string | null | undefined
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}) {
  if (src) {
    return <img className={`adm-dossier-crest is-${size}`} src={src} alt="" loading="lazy" />
  }
  return (
    <span className={`adm-dossier-crest adm-dossier-crest-fallback is-${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

function PlayerAvatar({
  src,
  name,
  size = 'sm',
}: {
  src: string | null | undefined
  name: string
  size?: 'sm' | 'md'
}) {
  if (src) {
    return <img className={`adm-dossier-avatar is-${size}`} src={src} alt="" loading="lazy" />
  }
  return (
    <span className={`adm-dossier-avatar adm-dossier-avatar-fallback is-${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

/* ------------------------------------------------------------------ picker */

function ClubPicker({
  clubs,
  value,
  disabled,
  onChange,
}: {
  clubs: Club[]
  value: string | null
  disabled?: boolean
  onChange: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = clubs.find((club) => club.slug === value) ?? null

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open) window.setTimeout(() => searchRef.current?.focus(), 20)
    else setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const term = normalizeSearch(query)
    if (!term) return clubs
    return clubs.filter((club) => {
      const haystack = `${normalizeSearch(club.name)} ${normalizeSearch(club.slug)} ${normalizeSearch(club.short_code ?? '')}`
      return haystack.includes(term)
    })
  }, [clubs, query])

  return (
    <div className="adm-club-picker" ref={rootRef}>
      <button
        type="button"
        className="adm-club-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {selected ? (
          <>
            <ClubCrest src={selected.logo_local || selected.logo_url} name={selected.name} size="sm" />
            <span className="adm-club-picker-trigger-text">
              <strong>{selected.name}</strong>
              <small>
                {selected.short_code ? `${selected.short_code} · ` : ''}
                {selected.ea_club_id ? 'EA linked' : 'EA not linked'}
              </small>
            </span>
          </>
        ) : (
          <span className="adm-club-picker-trigger-text">
            <strong>Select a club…</strong>
            <small>Search every IWVPL club</small>
          </span>
        )}
        <span className={`custom-select-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="adm-club-picker-menu" role="listbox" aria-label="Select a club">
          <div className="adm-club-picker-search">
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search club name, code or slug…"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false)
                if (event.key === 'Enter' && filtered[0]) {
                  onChange(filtered[0].slug)
                  setOpen(false)
                }
              }}
            />
            <kbd>{filtered.length}</kbd>
          </div>
          <div className="adm-club-picker-list">
            {filtered.length === 0 ? (
              <p className="adm-club-picker-empty">No clubs match “{query}”.</p>
            ) : (
              filtered.map((club) => (
                <button
                  key={club.slug}
                  type="button"
                  role="option"
                  aria-selected={club.slug === value}
                  className={`adm-club-picker-option${club.slug === value ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(club.slug)
                    setOpen(false)
                  }}
                >
                  <ClubCrest src={club.logo_local || club.logo_url} name={club.name} size="sm" />
                  <span className="adm-club-picker-option-text">
                    <strong>{club.name}</strong>
                    <small>
                      {club.short_code ? `${club.short_code} · ` : ''}
                      {club.players} player{club.players === 1 ? '' : 's'}
                      {club.ea_club_id ? ' · EA linked' : ''}
                    </small>
                  </span>
                  {club.slug === value && <span className="adm-club-picker-check">✓</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- team stats */

interface StatRowDefinition {
  key: keyof NonNullable<DossierMatch['team_stats']>
  label: string
  suffix?: string
  decimals?: number
}

const IWVPL_STAT_ROWS: StatRowDefinition[] = [
  { key: 'possession', label: 'Possession', suffix: '%' },
  { key: 'shots', label: 'Shots' },
  { key: 'on_target', label: 'On target' },
  { key: 'xg', label: 'Expected goals', decimals: 2 },
  { key: 'passes', label: 'Passes' },
  { key: 'pass_accuracy', label: 'Pass accuracy', suffix: '%' },
  { key: 'dribble_success', label: 'Dribble success', suffix: '%' },
  { key: 'corners', label: 'Corners' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'offsides', label: 'Offsides' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'tackles_won', label: 'Tackles won' },
  { key: 'interceptions', label: 'Interceptions' },
  { key: 'saves', label: 'Saves' },
  { key: 'yellow_cards', label: 'Yellow cards' },
  { key: 'red_cards', label: 'Red cards' },
]

interface EaStatRowDefinition {
  key: keyof EaMatchSummary['teamStats']
  label: string
  suffix?: string
  decimals?: number
}

const EA_STAT_ROWS: EaStatRowDefinition[] = [
  { key: 'possession', label: 'Possession', suffix: '%' },
  { key: 'shots', label: 'Shots' },
  { key: 'shotsOnTarget', label: 'On target' },
  { key: 'xg', label: 'Expected goals', decimals: 2 },
  { key: 'passes', label: 'Passes' },
  { key: 'passAccuracy', label: 'Pass accuracy', suffix: '%' },
  { key: 'dribbleSuccess', label: 'Dribble success', suffix: '%' },
  { key: 'corners', label: 'Corners' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'offsides', label: 'Offsides' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'tackleSuccessRate', label: 'Tackle success', suffix: '%' },
  { key: 'interceptions', label: 'Interceptions' },
  { key: 'saves', label: 'Saves' },
  { key: 'yellowCards', label: 'Yellow cards' },
  { key: 'redCards', label: 'Red cards' },
]

function StatComparison({
  title,
  rows,
  leftLabel,
  rightLabel,
}: {
  title: string
  rows: Array<{ label: string; values: [number | null, number | null]; suffix?: string; decimals?: number }>
  leftLabel: string
  rightLabel: string
}) {
  const available = rows.filter(
    (row) => row.values[0] !== null || row.values[1] !== null,
  )
  if (available.length === 0) return null

  return (
    <div className="adm-dossier-stats">
      <div className="adm-dossier-stats-head">
        <span>{leftLabel}</span>
        <strong>{title}</strong>
        <span>{rightLabel}</span>
      </div>
      <div className="adm-dossier-stats-rows">
        {available.map((row) => {
          const left = row.values[0]
          const right = row.values[1]
          const total = (left ?? 0) + (right ?? 0)
          const leftPct = total > 0 ? ((left ?? 0) / total) * 100 : 50
          const rightPct = 100 - leftPct
          const format = (value: number | null) =>
            value === null
              ? '—'
              : `${value.toFixed(row.decimals ?? 0)}${row.suffix ?? ''}`
          return (
            <div key={row.label} className="adm-dossier-stat-row">
              <span className="adm-dossier-stat-value">{format(left)}</span>
              <div className="adm-dossier-stat-bar">
                <span className="adm-dossier-stat-bar-left" style={{ width: `${leftPct}%` }} />
                <span className="adm-dossier-stat-bar-right" style={{ width: `${rightPct}%` }} />
              </div>
              <span className="adm-dossier-stat-name">{row.label}</span>
              <div className="adm-dossier-stat-bar is-right">
                <span className="adm-dossier-stat-bar-left" style={{ width: `${rightPct}%` }} />
                <span className="adm-dossier-stat-bar-right" style={{ width: `${leftPct}%` }} />
              </div>
              <span className="adm-dossier-stat-value is-right">{format(right)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ player tables */

function playerRating(value: unknown): string {
  const rating = toNumber(value)
  return rating === null || rating === 0 ? '—' : rating.toFixed(1)
}

function IWVPLPlayerTable({ rows, label }: { rows: DossierPlayerStat[]; label: string }) {
  if (rows.length === 0) {
    return <p className="adm-dossier-muted">No {label} player data recorded.</p>
  }
  return (
    <div className="adm-table-wrap">
      <table className="adm-table adm-dossier-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th className="is-num">Rating</th>
            <th className="is-num">G</th>
            <th className="is-num">A</th>
            <th className="is-num">Shots</th>
            <th className="is-num">Passes</th>
            <th className="is-num">Pass %</th>
            <th className="is-num">Tackles</th>
            <th className="is-num">Saves</th>
            <th className="is-num">CS</th>
            <th className="is-num">MoM</th>
            <th className="is-num">Cards</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const yellow = Number(row.yellow_cards) || 0
            const red = Number(row.red_cards) || 0
            return (
              <tr key={`${row.id}-${row.gamertag}`}>
                <td>
                  <div className="adm-dossier-player-cell">
                    <PlayerAvatar src={row.player_avatar} name={row.gamertag} />
                    <div>
                      <strong>{row.gamertag}</strong>
                      {row.pro_name && <small>{row.pro_name}</small>}
                    </div>
                  </div>
                </td>
                <td className="adm-dossier-pos">{row.pos ?? '—'}</td>
                <td className="is-num">{playerRating(row.rating)}</td>
                <td className="is-num">{row.goals}</td>
                <td className="is-num">{row.assists}</td>
                <td className="is-num">{row.shots}</td>
                <td className="is-num">{row.passes}</td>
                <td className="is-num">{toNumber(row.pass_accuracy) ?? '—'}</td>
                <td className="is-num">{row.tackles}</td>
                <td className="is-num">{row.saves}</td>
                <td className="is-num">{row.clean_sheet ? '✓' : '—'}</td>
                <td className="is-num">{row.is_mom ? '★' : '—'}</td>
                <td className="is-num adm-dossier-cards">
                  {yellow > 0 && <span className="adm-card-dot is-yellow">{yellow}</span>}
                  {red > 0 && <span className="adm-card-dot is-red">{red}</span>}
                  {yellow === 0 && red === 0 && '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EaPlayerTable({ rows }: { rows: EaPlayerStatItem[] }) {
  if (rows.length === 0) {
    return <p className="adm-dossier-muted">EA did not return player stats for this match.</p>
  }
  return (
    <div className="adm-table-wrap">
      <table className="adm-table adm-dossier-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th className="is-num">Rating</th>
            <th className="is-num">G</th>
            <th className="is-num">A</th>
            <th className="is-num">Shots</th>
            <th className="is-num">Passes</th>
            <th className="is-num">Pass %</th>
            <th className="is-num">Tackles</th>
            <th className="is-num">Saves</th>
            <th className="is-num">CS</th>
            <th className="is-num">MoM</th>
            <th className="is-num">Cards</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const yellow = Number(row.yellowCards) || 0
            const red = Number(row.redCards) || 0
            return (
              <tr key={`${row.gamertag}-${index}`}>
                <td>
                  <div className="adm-dossier-player-cell">
                    <PlayerAvatar src={null} name={row.gamertag} />
                    <div>
                      <strong>{row.gamertag}</strong>
                      {row.proName && <small>{row.proName}</small>}
                    </div>
                  </div>
                </td>
                <td className="adm-dossier-pos">{row.pos || '—'}</td>
                <td className="is-num">{row.rating > 0 ? row.rating.toFixed(1) : '—'}</td>
                <td className="is-num">{row.goals}</td>
                <td className="is-num">{row.assists}</td>
                <td className="is-num">{row.shots}</td>
                <td className="is-num">{row.passes}</td>
                <td className="is-num">{row.passAccuracy ?? '—'}</td>
                <td className="is-num">{row.tackles}</td>
                <td className="is-num">{row.saves}</td>
                <td className="is-num">{row.cleanSheet ? '✓' : '—'}</td>
                <td className="is-num">{row.isMom ? '★' : '—'}</td>
                <td className="is-num adm-dossier-cards">
                  {yellow > 0 && <span className="adm-card-dot is-yellow">{yellow}</span>}
                  {red > 0 && <span className="adm-card-dot is-red">{red}</span>}
                  {yellow === 0 && red === 0 && '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------------------------------------------- match expansion */

function EventTimeline({ events }: { events: DossierMatch['events'] }) {
  if (events.length === 0) return null
  return (
    <div className="adm-dossier-events">
      <span className="adm-eyebrow">MATCH TIMELINE</span>
      <div className="adm-dossier-event-list">
        {events.map((event, index) => {
          const icon =
            event.type === 'goal'
              ? '⚽'
              : event.type === 'yellow_card'
                ? '🟨'
                : event.type === 'red_card'
                  ? '🟥'
                  : event.type === 'substitution'
                    ? '⇄'
                    : '•'
          return (
            <div
              key={`${event.minute}-${index}`}
              className={`adm-dossier-event is-${event.team_side}`}
            >
              <span className="adm-dossier-event-minute">{event.minute}′</span>
              <span className="adm-dossier-event-icon" aria-hidden="true">
                {icon}
              </span>
              <span className="adm-dossier-event-text">
                <strong>{event.player_name ?? event.type}</strong>
                {event.detail && <small>{event.detail}</small>}
              </span>
              {event.score && <span className="adm-dossier-event-score">{event.score}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function IWVPLMatchDetail({ match }: { match: DossierMatch }) {
  const stats = match.team_stats
  const rows = stats
    ? IWVPL_STAT_ROWS.map((definition) => {
        const pair = stats[definition.key] as [number | null, number | null]
        const values: [number | null, number | null] = match.is_home
          ? [pair[0], pair[1]]
          : [pair[1], pair[0]]
        return { label: definition.label, values, suffix: definition.suffix, decimals: definition.decimals }
      }).filter((row) => row.values[0] !== null || row.values[1] !== null)
    : []

  return (
    <div className="adm-dossier-match-detail">
      {stats && rows.length > 0 ? (
        <StatComparison
          title="Match stats"
          rows={rows}
          leftLabel="Club"
          rightLabel={match.opponent.short_code || match.opponent.name}
        />
      ) : (
        <div className="adm-dossier-empty-inline">
          <strong>No team stats recorded</strong>
          <span>
            {match.ea_match_id
              ? `This fixture is linked to EA match #${match.ea_match_id}, but no box score has been saved yet.`
              : 'Record the result with EA stats to unlock the full box score.'}
          </span>
        </div>
      )}

      <div className="adm-dossier-detail-grid">
        <section>
          <h4 className="adm-dossier-subheading">Club player stats</h4>
          <IWVPLPlayerTable rows={match.player_stats} label="club" />
        </section>
        <section>
          <h4 className="adm-dossier-subheading">Opponent player stats</h4>
          <IWVPLPlayerTable rows={match.opponent_player_stats} label="opponent" />
        </section>
      </div>

      <EventTimeline events={match.events} />

      <div className="adm-dossier-detail-meta">
        <span>
          <strong>Fixture</strong> #{match.id}
        </span>
        {match.ea_match_id && (
          <span>
            <strong>EA match</strong> #{match.ea_match_id}
          </span>
        )}
        {match.venue && (
          <span>
            <strong>Venue</strong> {match.venue}
          </span>
        )}
        {match.division_name && (
          <span>
            <strong>Competition</strong> {match.division_name}
            {match.round_number ? ` · Round ${match.round_number}` : ''}
          </span>
        )}
        {match.stream_url && (
          <a href={match.stream_url} target="_blank" rel="noreferrer">
            Watch stream ↗
          </a>
        )}
      </div>
    </div>
  )
}

function EaMatchDetail({ match }: { match: EaMatchSummary }) {
  const rows = EA_STAT_ROWS.map((definition) => {
    const value = match.teamStats[definition.key]
    const opponentValue = match.opponentTeamStats[definition.key]
    return {
      label: definition.label,
      values: [value, opponentValue] as [number | null, number | null],
      suffix: definition.suffix,
      decimals: definition.decimals,
    }
  }).filter((row) => row.values[0] !== null || row.values[1] !== null)

  return (
    <div className="adm-dossier-match-detail">
      {rows.length > 0 ? (
        <StatComparison
          title="EA match stats"
          rows={rows}
          leftLabel="Club"
          rightLabel={match.opponentName}
        />
      ) : (
        <p className="adm-dossier-muted">EA did not return team summary stats for this match.</p>
      )}
      <h4 className="adm-dossier-subheading">EA player performance</h4>
      <EaPlayerTable rows={match.players} />
      <div className="adm-dossier-detail-meta">
        <span>
          <strong>EA match</strong> #{match.matchId}
        </span>
        <span>
          <strong>Type</strong> {EA_TAB_LABELS[match.matchType === 'leagueMatch' ? 'league' : match.matchType === 'friendlyMatch' ? 'friendly' : 'playoff']}
        </span>
        <span>
          <strong>Kickoff (UTC)</strong> {match.dateFormatted}
        </span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- dossier view */

export function ClubDossierView({
  guard,
  report,
  initialSlug,
  onOpenClubs,
  onOpenMatches,
}: {
  guard: Guard
  report: Report
  initialSlug?: string
  onOpenClubs?: () => void
  onOpenMatches?: () => void
}) {
  const [clubs, setClubs] = useState<Club[]>([])
  const [clubsLoading, setClubsLoading] = useState(true)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug ?? null)
  const [seasonId, setSeasonId] = useState<number | null>(null)
  const [dossier, setDossier] = useState<ClubDossier | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [tab, setTab] = useState<DossierTab>('overview')
  const [eaTab, setEaTab] = useState<EaMatchTab>('league')
  const [eaProfile, setEaProfile] = useState<EaClubFullProfile | null>(null)
  const [eaLinked, setEaLinked] = useState<boolean | null>(null)
  const [eaClub, setEaClub] = useState<ClubEaProfileResponse['club'] | null>(null)
  const [eaLoading, setEaLoading] = useState(false)
  const [eaError, setEaError] = useState<string | null>(null)
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null)
  const [expandedEaMatch, setExpandedEaMatch] = useState<string | null>(null)
  const [iwvplFilter, setIWVPLFilter] = useState<'all' | 'played' | 'upcoming'>('all')
  const [playerSort, setPlayerSort] = useState<{ key: PlayerSortKey; direction: 'asc' | 'desc' }>({
    key: 'goals',
    direction: 'desc',
  })

  useEffect(() => {
    if (initialSlug) setSelectedSlug(initialSlug)
  }, [initialSlug])

  useEffect(() => {
    let alive = true
    setClubsLoading(true)
    guard(() => getAdminClubs(), 'Could not load clubs')
      .then((list) => {
        if (!alive) return
        setClubs(list)
        setSelectedSlug((current) => {
          if (current && list.some((club) => club.slug === current)) return current
          return list.find((club) => club.status === 'active')?.slug ?? list[0]?.slug ?? null
        })
      })
      .catch(() => {
        /* the guard has already surfaced the error */
      })
      .finally(() => {
        if (alive) setClubsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [guard])

  useEffect(() => {
    if (!selectedSlug) return
    let alive = true
    setLoading(true)
    setError(null)
    guard(
      () => getClubDossier(selectedSlug, seasonId),
      'Could not load the club dossier',
    )
      .then((data) => {
        if (!alive) return
        setDossier(data)
        // The server falls back to the current season when the requested one
        // is not available for this club. Keep the selector in step.
        if (data.season && data.season.id !== seasonId) {
          setSeasonId(data.season.id)
        }
      })
      .catch((err) => {
        if (!alive) return
        setDossier(null)
        setError(err instanceof Error ? err.message : 'Could not load the club dossier.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [selectedSlug, seasonId, guard, reloadNonce])

  const loadEaProfile = useCallback(
    async (slug: string, refresh: boolean) => {
      setEaLoading(true)
      setEaError(null)
      try {
        const response = await guard(
          () => getClubEaProfile(slug, refresh),
          refresh ? 'Could not refresh EA Pro Clubs data' : 'Could not load EA Pro Clubs data',
        )
        setEaLinked(response.linked)
        setEaClub(response.club)
        setEaProfile(response.profile)
        if (refresh) report('ok', 'EA Pro Clubs data refreshed.')
      } catch (err) {
        setEaProfile(null)
        setEaLinked(false)
        setEaError(err instanceof Error ? err.message : 'EA Pro Clubs data is unavailable.')
      } finally {
        setEaLoading(false)
      }
    },
    [guard, report],
  )

  useEffect(() => {
    if (!selectedSlug) return
    setEaProfile(null)
    setEaError(null)
    setEaLinked(null)
    setExpandedEaMatch(null)
    setEaTab('league')
    void loadEaProfile(selectedSlug, false)
  }, [selectedSlug, loadEaProfile])

  const selectClub = (slug: string) => {
    if (slug === selectedSlug) return
    setSelectedSlug(slug)
    setSeasonId(null)
    setDossier(null)
    setTab('overview')
    setExpandedMatch(null)
  }

  const selectedClub = clubs.find((club) => club.slug === selectedSlug) ?? null
  const club = dossier?.club ?? null
  const linked = Boolean(
    dossier?.club.ea_club_id ?? selectedClub?.ea_club_id ?? eaClub?.ea_club_id ?? eaLinked,
  )
  const eaClubId = dossier?.club.ea_club_id ?? selectedClub?.ea_club_id ?? eaClub?.ea_club_id ?? null

  const seasonOptions = useMemo(
    () =>
      (dossier?.seasons ?? []).map((season) => ({
        value: String(season.id),
        label: `${season.name}${Boolean(season.is_current) ? ' · Current' : ''}`,
      })),
    [dossier?.seasons],
  )

  const iwvplMatches = useMemo(() => {
    if (!dossier) return []
    return dossier.matches.filter((match) => {
      const played = match.score_for !== null && match.score_against !== null
      if (iwvplFilter === 'played') return played
      if (iwvplFilter === 'upcoming') return !played
      return true
    })
  }, [dossier, iwvplFilter])

  const eaMatches = eaProfile?.matches[eaTab] ?? []
  const activeEaSummary = eaProfile?.summaries[eaTab] ?? null

  const squadEaTags = useMemo(() => {
    const tags = new Set<string>()
    for (const member of eaProfile?.roster ?? []) {
      tags.add(normalizeSearch(member.gamertag))
    }
    return tags
  }, [eaProfile?.roster])

  const eaOnlyRoster = useMemo(() => {
    const registered = new Set(
      (dossier?.squad ?? []).map((player) => normalizeSearch(player.gamertag)),
    )
    return (eaProfile?.roster ?? []).filter(
      (member) => !registered.has(normalizeSearch(member.gamertag)),
    )
  }, [dossier?.squad, eaProfile?.roster])

  const sortedPlayerTotals = useMemo(() => {
    const rows = [...(dossier?.player_totals ?? [])]
    const { key, direction } = playerSort
    rows.sort((a, b) => {
      if (key === 'gamertag') {
        const comparison = a.gamertag.localeCompare(b.gamertag)
        return direction === 'asc' ? comparison : -comparison
      }
      const left = toNumber(a[key]) ?? -1
      const right = toNumber(b[key]) ?? -1
      return direction === 'asc' ? left - right : right - left
    })
    return rows
  }, [dossier?.player_totals, playerSort])

  const togglePlayerSort = (key: PlayerSortKey) => {
    setPlayerSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'gamertag' ? 'asc' : 'desc' },
    )
  }

  const standing = dossier?.standing ?? null
  const summary = dossier?.summary.tracked ?? null
  const position = standing?.position ?? null
  const divisionTable = dossier?.division_table ?? []
  const positionIndex = divisionTable.findIndex((row) => row.club_id === dossier?.club.id)
  const tableWindow =
    positionIndex === -1
      ? divisionTable.slice(0, 6)
      : divisionTable.slice(Math.max(0, positionIndex - 2), Math.min(divisionTable.length, positionIndex + 3))

  const boxScoreCount = dossier?.matches.filter((match) => match.player_stats.length > 0).length ?? 0
  const eaRecord = eaProfile?.summaries.all ?? null

  const tabs: Array<{ id: DossierTab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'iwvpl', label: 'IWVPL Matches', count: dossier?.matches.length ?? 0 },
    { id: 'ea', label: 'EA Matches', count: eaProfile ? eaProfile.summaries.all.played : undefined },
    { id: 'squad', label: 'Squad', count: dossier?.squad.length ?? 0 },
    { id: 'players', label: 'Player Stats', count: dossier?.player_totals.length ?? 0 },
  ]

  const openDossierMatch = (matchId: number) => {
    setTab('iwvpl')
    setExpandedMatch(matchId)
    window.setTimeout(() => {
      document
        .getElementById(`dossier-match-${matchId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 30)
  }

  return (
    <div className="adm-dossier adm-stack">
      <section className="adm-dossier-toolbar">
        <div className="adm-dossier-toolbar-main">
          <span className="adm-eyebrow">CLUB INTELLIGENCE</span>
          <ClubPicker
            clubs={clubs}
            value={selectedSlug}
            disabled={clubsLoading}
            onChange={selectClub}
          />
          <p>Every fixture, EA box score and player total in one place.</p>
        </div>
        <div className="adm-dossier-toolbar-actions">
          <label className="adm-dossier-season-select">
            <span>SEASON</span>
            <CustomSelect
              value={seasonId == null ? '' : String(seasonId)}
              options={seasonOptions}
              onChange={(value) => setSeasonId(Number(value))}
              disabled={!seasonOptions.length || loading}
              ariaLabel="Select season"
            />
          </label>
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            disabled={!selectedSlug || eaLoading || !linked}
            onClick={() => selectedSlug && void loadEaProfile(selectedSlug, true)}
          >
            <span className={eaLoading ? 'spinner' : ''} aria-hidden="true">
              {eaLoading ? '' : '↻'}
            </span>
            {eaLoading ? 'Refreshing EA…' : 'Refresh EA'}
          </button>
        </div>
      </section>

      {!selectedSlug || clubsLoading ? (
        <section className="adm-card adm-dossier-placeholder">
          {clubsLoading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              <h3>Loading clubs…</h3>
              <p>Connecting to the live league database.</p>
            </>
          ) : (
            <>
              <h3>Choose a club to open its dossier</h3>
              <p>Search for any IWVPL club above to see league and EA data.</p>
            </>
          )}
        </section>
      ) : loading && !dossier ? (
        <section className="adm-card adm-dossier-placeholder" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <h3>Building the dossier…</h3>
          <p>Pulling league fixtures, results, box scores and player totals.</p>
        </section>
      ) : error && !dossier ? (
        <section className="adm-alert-card adm-alert-warning">
          <div className="adm-alert-body">
            <span className="adm-alert-badge">DOSSIER UNAVAILABLE</span>
            <strong>Could not load this club</strong>
            <p>{error}</p>
          </div>
          <button
            type="button"
            className="adm-btn adm-btn-secondary"
            onClick={() => setReloadNonce((current) => current + 1)}
          >
            Try again
          </button>
        </section>
      ) : dossier && club ? (
        <>
          <section className="adm-dossier-hero">
            <div className="adm-dossier-hero-main">
              <ClubCrest src={club.logo} name={club.name} size="xl" />
              <div className="adm-dossier-hero-text">
                <div className="adm-dossier-hero-tags">
                  <span className={`adm-status-badge status-${club.status}`}>{club.status}</span>
                  {club.flag && <span className="adm-flag-pill">{club.flag}</span>}
                  {linked ? (
                    <span className="adm-dossier-ea-pill">EA FC · #{eaClubId ?? '—'}</span>
                  ) : (
                    <span className="adm-dossier-ea-pill is-unlinked">EA not linked</span>
                  )}
                  {dossier.division && (
                    <span className="adm-dossier-division-pill">{dossier.division.name}</span>
                  )}
                </div>
                <h1>{club.name}</h1>
                <p>
                  {club.manager.name ? `Manager: ${club.manager.name}` : 'No manager assigned'}
                  <span className="adm-dossier-sep">·</span>
                  {dossier.squad.length} registered player{dossier.squad.length === 1 ? '' : 's'}
                  <span className="adm-dossier-sep">·</span>
                  {club.formation ? `Formation ${club.formation}` : 'Formation not set'}
                </p>
              </div>
            </div>
            <div className="adm-dossier-hero-actions">
              <a
                className="adm-btn adm-btn-secondary"
                href={`/clubs/${encodeURIComponent(club.slug)}`}
                target="_blank"
                rel="noreferrer"
              >
                ↗ Public profile
              </a>
              {onOpenClubs && (
                <button type="button" className="adm-btn adm-btn-ghost" onClick={onOpenClubs}>
                  ⚙ Manage club
                </button>
              )}
            </div>
          </section>

          {eaError && (
            <section className="adm-dossier-ea-warning">
              <span aria-hidden="true">!</span>
              <div>
                <strong>EA Pro Clubs data is unavailable right now</strong>
                <p>{eaError} The IWVPL data below is still complete.</p>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                disabled={eaLoading}
                onClick={() => selectedSlug && void loadEaProfile(selectedSlug, true)}
              >
                Retry
              </button>
            </section>
          )}

          {eaProfile && eaProfile.warnings.length > 0 && (
            <details className="adm-dossier-ea-warnings">
              <summary>{eaProfile.warnings.length} EA request warning{eaProfile.warnings.length === 1 ? '' : 's'}</summary>
              <ul>
                {eaProfile.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          )}

          <section className="adm-kpi-grid">
            <article className="adm-kpi-card adm-dossier-kpi">
              <span className="adm-kpi-label">League Position</span>
              <strong className="adm-kpi-value">
                {position != null ? ordinal(position) : '—'}
              </strong>
              <span className="adm-kpi-sub">
                {standing
                  ? `${standing.points} pts · ${dossier.division?.name ?? 'League'}`
                  : 'No league table row yet'}
              </span>
            </article>
            <article className="adm-kpi-card adm-dossier-kpi">
              <span className="adm-kpi-label">Season Record</span>
              <strong className="adm-kpi-value">
                {standing
                  ? `${standing.won}–${standing.drawn}–${standing.lost}`
                  : summary
                    ? `${summary.won}–${summary.drawn}–${summary.lost}`
                    : '—'}
              </strong>
              <span className="adm-kpi-sub">
                {standing
                  ? `${standing.played} played · ${standing.goals_for}:${standing.goals_against} goals`
                  : summary
                    ? `${summary.played} tracked · ${summary.winRate}% win rate`
                    : 'No results recorded'}
              </span>
            </article>
            <article className="adm-kpi-card adm-dossier-kpi">
              <span className="adm-kpi-label">Goal Difference</span>
              <strong className="adm-kpi-value">
                {standing
                  ? standing.goal_difference > 0
                    ? `+${standing.goal_difference}`
                    : standing.goal_difference
                  : summary
                    ? summary.goalDifference > 0
                      ? `+${summary.goalDifference}`
                      : summary.goalDifference
                    : '—'}
              </strong>
              <span className="adm-kpi-sub">
                {standing
                  ? `${standing.goals_for} scored · ${standing.goals_against} conceded`
                  : `${boxScoreCount} box score${boxScoreCount === 1 ? '' : 's'} recorded`}
              </span>
            </article>
            <article className="adm-kpi-card adm-dossier-kpi">
              <span className="adm-kpi-label">Form</span>
              <div className="adm-dossier-kpi-form">
                <FormBadges form={standing?.form ?? summary?.form} />
              </div>
              <span className="adm-kpi-sub">
                {summary ? `${summary.form || '—'} from tracked results` : 'No form yet'}
              </span>
            </article>
            <article className="adm-kpi-card adm-dossier-kpi">
              <span className="adm-kpi-label">Tracked Box Scores</span>
              <strong className="adm-kpi-value">{boxScoreCount}</strong>
              <span className="adm-kpi-sub">
                {dossier.summary.with_box_score
                  ? 'EA player stats available'
                  : 'No EA box score data yet'}
              </span>
            </article>
            <article
              className={`adm-kpi-card adm-dossier-kpi${!linked ? ' is-muted' : ''}`}
              onClick={!linked && onOpenClubs ? onOpenClubs : undefined}
            >
              <span className="adm-kpi-label">EA Pro Clubs</span>
              <strong className="adm-kpi-value">
                {linked
                  ? eaRecord
                    ? `${eaRecord.wins}–${eaRecord.draws}–${eaRecord.losses}`
                    : eaLoading
                      ? '…'
                      : '—'
                  : 'Not linked'}
              </strong>
              <span className="adm-kpi-sub">
                {linked
                  ? eaRecord
                    ? `${eaRecord.played} games · ${eaRecord.winRate}% win rate`
                    : eaError
                      ? 'EA data unavailable'
                      : 'Loading EA data…'
                  : 'Link an EA club in Clubs'}
              </span>
            </article>
          </section>

          <nav className="adm-dossier-tabs" aria-label="Dossier sections">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`adm-dossier-tab${tab === item.id ? ' is-active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.count !== undefined && <span className="adm-dossier-tab-count">{item.count}</span>}
              </button>
            ))}
          </nav>

          {tab === 'overview' && (
            <div className="adm-dossier-overview">
              <div className="adm-dossier-overview-grid">
                <section className="adm-card">
                  <div className="adm-card-head">
                    <div>
                      <span className="adm-eyebrow">LEAGUE CONTEXT</span>
                      <h2>{dossier.division?.name ?? 'No division'}</h2>
                    </div>
                    {onOpenMatches && (
                      <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={onOpenMatches}>
                        Full table ↗
                      </button>
                    )}
                  </div>
                  {tableWindow.length === 0 ? (
                    <p className="adm-dossier-muted">No league table has been built for this season yet.</p>
                  ) : (
                    <div className="adm-table-wrap">
                      <table className="adm-table adm-dossier-table adm-dossier-standings">
                        <thead>
                          <tr>
                            <th className="is-num">#</th>
                            <th>Club</th>
                            <th className="is-num">P</th>
                            <th className="is-num">GD</th>
                            <th className="is-num">Pts</th>
                            <th>Form</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableWindow.map((row) => (
                            <tr
                              key={row.club_id}
                              className={row.club_id === dossier.club.id ? 'is-current' : ''}
                            >
                              <td className="is-num">{row.position}</td>
                              <td>
                                <div className="adm-dossier-table-club">
                                  <ClubCrest src={row.logo} name={row.name} size="xs" />
                                  <span>{row.name}</span>
                                </div>
                              </td>
                              <td className="is-num">{row.played}</td>
                              <td className="is-num">
                                {row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}
                              </td>
                              <td className="is-num">{row.points}</td>
                              <td>
                                <FormBadges form={row.form} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="adm-dossier-split">
                    <div>
                      <span className="adm-dossier-split-label">Home record</span>
                      <strong>
                        {dossier.summary.home.won}W {dossier.summary.home.drawn}D{' '}
                        {dossier.summary.home.lost}L
                      </strong>
                      <small>
                        {dossier.summary.home.goalsFor}:{dossier.summary.home.goalsAgainst} goals
                      </small>
                    </div>
                    <div>
                      <span className="adm-dossier-split-label">Away record</span>
                      <strong>
                        {dossier.summary.away.won}W {dossier.summary.away.drawn}D{' '}
                        {dossier.summary.away.lost}L
                      </strong>
                      <small>
                        {dossier.summary.away.goalsFor}:{dossier.summary.away.goalsAgainst} goals
                      </small>
                    </div>
                  </div>
                </section>

                <section className="adm-card">
                  <div className="adm-card-head">
                    <div>
                      <span className="adm-eyebrow">EA PRO CLUBS</span>
                      <h2>In-game record</h2>
                    </div>
                    {eaProfile && (
                      <span className="adm-dossier-fetched">
                        {eaProfile.stale ? 'Stale snapshot' : `Updated ${new Date(eaProfile.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                      </span>
                    )}
                  </div>

                  {!linked ? (
                    <div className="adm-dossier-empty-inline">
                      <strong>This club is not linked to EA FC Pro Clubs</strong>
                      <span>
                        Link an EA club in Clubs & Applications to pull in league, friendly and
                        playoff matches automatically.
                      </span>
                      {onOpenClubs && (
                        <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={onOpenClubs}>
                          Link EA club
                        </button>
                      )}
                    </div>
                  ) : eaLoading && !eaProfile ? (
                    <div className="adm-dossier-inline-loading">
                      <span className="spinner" aria-hidden="true" />
                      Loading live EA data…
                    </div>
                  ) : eaProfile ? (
                    <div className="adm-dossier-ea-overview">
                      <div className="adm-dossier-ea-record">
                        <div>
                          <span>Games</span>
                          <strong>{eaProfile.stats.gamesPlayed}</strong>
                        </div>
                        <div>
                          <span>Wins</span>
                          <strong className="is-win">{eaProfile.stats.wins}</strong>
                        </div>
                        <div>
                          <span>Draws</span>
                          <strong className="is-draw">{eaProfile.stats.draws}</strong>
                        </div>
                        <div>
                          <span>Losses</span>
                          <strong className="is-loss">{eaProfile.stats.losses}</strong>
                        </div>
                      </div>
                      <div className="adm-dossier-ea-meta-grid">
                        <div>
                          <span>Goals for / against</span>
                          <strong>
                            {eaProfile.stats.goalsFor} / {eaProfile.stats.goalsAgainst}
                          </strong>
                        </div>
                        <div>
                          <span>Skill rating</span>
                          <strong>{eaProfile.stats.skillRating || '—'}</strong>
                        </div>
                        <div>
                          <span>Best division</span>
                          <strong>{eaProfile.stats.bestDivision || '—'}</strong>
                        </div>
                        <div>
                          <span>Current streak</span>
                          <strong>
                            {eaProfile.stats.winStreak}W · {eaProfile.stats.unbeatenStreak} unbeaten
                          </strong>
                        </div>
                        <div>
                          <span>EA club name</span>
                          <strong>{eaProfile.name}</strong>
                        </div>
                        <div>
                          <span>EA club ID</span>
                          <strong>#{eaProfile.clubId}</strong>
                        </div>
                      </div>
                      <div className="adm-dossier-ea-forms">
                        {(['league', 'friendly', 'playoff'] as EaMatchTab[]).map((type) => (
                          <div key={type}>
                            <span>{EA_TAB_LABELS[type]}</span>
                            <strong>
                              {eaProfile.summaries[type].played} games · {eaProfile.summaries[type].wins}W
                            </strong>
                            <FormBadges form={eaProfile.summaries[type].form} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="adm-dossier-empty-inline">
                      <strong>EA data could not be loaded</strong>
                      <span>{eaError ?? 'Try refreshing the EA data above.'}</span>
                    </div>
                  )}
                </section>
              </div>

              <div className="adm-dossier-overview-grid">
                <section className="adm-card">
                  <div className="adm-card-head">
                    <div>
                      <span className="adm-eyebrow">RECENT RESULTS</span>
                      <h2>Last tracked fixtures</h2>
                    </div>
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost adm-btn-sm"
                      onClick={() => setTab('iwvpl')}
                    >
                      All matches
                    </button>
                  </div>
                  {dossier.matches.filter((match) => match.score_for !== null).length === 0 ? (
                    <p className="adm-dossier-muted">No results recorded this season yet.</p>
                  ) : (
                    <div className="adm-dossier-recent-list">
                      {dossier.matches
                        .filter((match) => match.score_for !== null)
                        .slice(0, 5)
                        .map((match) => (
                          <button
                            key={match.id}
                            type="button"
                            className="adm-dossier-recent-row"
                            onClick={() => openDossierMatch(match.id)}
                          >
                            <span className="adm-dossier-recent-date">
                              {match.kickoff ? formatKickoffDisplay(match.kickoff) : '—'}
                            </span>
                            <span className="adm-dossier-recent-opponent">
                              <ClubCrest src={match.opponent.logo} name={match.opponent.name} size="xs" />
                              <span>
                                <strong>{match.opponent.name}</strong>
                                <small>
                                  {match.is_home ? 'Home' : 'Away'}
                                  {match.division_name ? ` · ${match.division_name}` : ''}
                                </small>
                              </span>
                            </span>
                            <span className="adm-dossier-recent-score">
                              {match.score_for}–{match.score_against}
                            </span>
                            <ResultBadge result={match.result} />
                          </button>
                        ))}
                    </div>
                  )}
                </section>

                <section className="adm-card">
                  <div className="adm-card-head">
                    <div>
                      <span className="adm-eyebrow">TOP PERFORMERS</span>
                      <h2>Season leaders</h2>
                    </div>
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost adm-btn-sm"
                      onClick={() => setTab('players')}
                    >
                      Full stats
                    </button>
                  </div>
                  {dossier.player_totals.length === 0 ? (
                    <p className="adm-dossier-muted">
                      No per-player box scores have been recorded for this club yet.
                    </p>
                  ) : (
                    <div className="adm-dossier-performers">
                      {dossier.player_totals.slice(0, 5).map((player, index) => (
                        <div key={`${player.player_id ?? player.gamertag}-${index}`} className="adm-dossier-performer">
                          <span className="adm-dossier-performer-rank">{index + 1}</span>
                          <PlayerAvatar src={player.avatar} name={player.gamertag} />
                          <div className="adm-dossier-performer-name">
                            <strong>{player.gamertag}</strong>
                            <small>
                              {player.appearances} apps
                              {player.avg_rating != null ? ` · ${player.avg_rating.toFixed(1)} avg` : ''}
                            </small>
                          </div>
                          <div className="adm-dossier-performer-stats">
                            <span>
                              <strong>{player.goals}</strong> G
                            </span>
                            <span>
                              <strong>{player.assists}</strong> A
                            </span>
                            <span>
                              <strong>{player.saves}</strong> SV
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {tab === 'iwvpl' && (
            <section className="adm-card">
              <div className="adm-card-head">
                <div>
                  <span className="adm-eyebrow">IWVPL FIXTURES</span>
                  <h2>League matches & EA box scores</h2>
                </div>
                <div className="adm-pill-tabs">
                  {(['all', 'played', 'upcoming'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`adm-pill-tab${iwvplFilter === filter ? ' is-active' : ''}`}
                      onClick={() => setIWVPLFilter(filter)}
                    >
                      {filter === 'all' ? 'All' : filter === 'played' ? 'Played' : 'Upcoming'}
                    </button>
                  ))}
                </div>
              </div>

              {iwvplMatches.length === 0 ? (
                <p className="adm-dossier-muted">
                  {dossier.matches.length === 0
                    ? 'No fixtures have been created for this club in the selected season.'
                    : 'No matches match this filter.'}
                </p>
              ) : (
                <div className="adm-dossier-match-list">
                  {iwvplMatches.map((match) => {
                    const expanded = expandedMatch === match.id
                    return (
                      <article
                        key={match.id}
                        id={`dossier-match-${match.id}`}
                        className={`adm-dossier-match${expanded ? ' is-open' : ''}`}
                      >
                        <button
                          type="button"
                          className="adm-dossier-match-summary"
                          aria-expanded={expanded}
                          onClick={() => setExpandedMatch(expanded ? null : match.id)}
                        >
                          <span className="adm-dossier-match-date">
                            {match.kickoff ? formatKickoffDisplay(match.kickoff) : 'Unscheduled'}
                          </span>
                          <span className="adm-dossier-match-opponent">
                            <ClubCrest src={match.opponent.logo} name={match.opponent.name} size="sm" />
                            <span>
                              <strong>{match.opponent.name}</strong>
                              <small>
                                {match.is_home ? 'Home' : 'Away'}
                                {match.division_name ? ` · ${match.division_name}` : ''}
                                {match.round_number ? ` · Round ${match.round_number}` : ''}
                              </small>
                            </span>
                          </span>
                          <span className="adm-dossier-match-score">
                            {match.score_for !== null && match.score_against !== null
                              ? `${match.score_for}–${match.score_against}`
                              : 'vs'}
                          </span>
                          <ResultBadge
                            result={match.result}
                            fallback={match.status === 'scheduled' ? 'Scheduled' : match.status}
                          />
                          {match.ea_match_id && <span className="adm-dossier-ea-pill">EA</span>}
                          <span className="adm-dossier-chevron" aria-hidden="true">
                            {expanded ? '▴' : '▾'}
                          </span>
                        </button>
                        {expanded && <IWVPLMatchDetail match={match} />}
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {tab === 'ea' && (
            <section className="adm-card">
              <div className="adm-card-head">
                <div>
                  <span className="adm-eyebrow">EA FC PRO CLUBS</span>
                  <h2>In-game match history</h2>
                </div>
                <span className={`adm-dossier-fetched${eaProfile?.stale ? ' is-warn' : ''}`}>
                  {eaProfile
                    ? eaProfile.stale
                      ? 'Showing last good snapshot'
                      : `Updated ${new Date(eaProfile.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Not loaded'}
                </span>
              </div>

              {!linked ? (
                <div className="adm-dossier-empty-inline">
                  <strong>EA Pro Clubs is not linked for this club</strong>
                  <span>
                    Add the club&apos;s EA ID in Clubs & Applications, then come back to pull
                    league, friendly and playoff matches with full player box scores.
                  </span>
                  {onOpenClubs && (
                    <button type="button" className="adm-btn adm-btn-primary adm-btn-sm" onClick={onOpenClubs}>
                      Open Clubs
                    </button>
                  )}
                </div>
              ) : eaLoading && !eaProfile ? (
                <div className="adm-dossier-inline-loading">
                  <span className="spinner" aria-hidden="true" />
                  Loading league, friendly and playoff history from EA…
                </div>
              ) : eaError && !eaProfile ? (
                <div className="adm-dossier-empty-inline">
                  <strong>Could not reach EA Pro Clubs</strong>
                  <span>{eaError}</span>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    onClick={() => selectedSlug && void loadEaProfile(selectedSlug, true)}
                  >
                    Retry
                  </button>
                </div>
              ) : eaProfile ? (
                <>
                  <div className="adm-pill-tabs adm-dossier-ea-tabs">
                    {(['league', 'friendly', 'playoff'] as EaMatchTab[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`adm-pill-tab${eaTab === type ? ' is-active' : ''}`}
                        onClick={() => {
                          setEaTab(type)
                          setExpandedEaMatch(null)
                        }}
                      >
                        {EA_TAB_LABELS[type]}
                        <span className="adm-dossier-tab-count">
                          {eaProfile.summaries[type].played}
                        </span>
                      </button>
                    ))}
                  </div>

                  {activeEaSummary && (
                    <div className="adm-dossier-ea-strip">
                      <div>
                        <span>Record</span>
                        <strong>
                          {activeEaSummary.wins}W {activeEaSummary.draws}D {activeEaSummary.losses}L
                        </strong>
                      </div>
                      <div>
                        <span>Goals</span>
                        <strong>
                          {activeEaSummary.goalsFor}:{activeEaSummary.goalsAgainst}
                        </strong>
                      </div>
                      <div>
                        <span>Win rate</span>
                        <strong>{activeEaSummary.winRate}%</strong>
                      </div>
                      <div>
                        <span>Clean sheets</span>
                        <strong>{activeEaSummary.cleanSheets}</strong>
                      </div>
                      <div>
                        <span>Form</span>
                        <FormBadges form={activeEaSummary.form} />
                      </div>
                    </div>
                  )}

                  {eaMatches.length === 0 ? (
                    <p className="adm-dossier-muted">
                      EA has no {EA_TAB_LABELS[eaTab].toLowerCase()} on record for this club.
                    </p>
                  ) : (
                    <div className="adm-dossier-match-list">
                      {eaMatches.map((match) => {
                        const expanded = expandedEaMatch === match.matchId
                        return (
                          <article
                            key={match.matchId}
                            className={`adm-dossier-match${expanded ? ' is-open' : ''}`}
                          >
                            <button
                              type="button"
                              className="adm-dossier-match-summary"
                              aria-expanded={expanded}
                              onClick={() => setExpandedEaMatch(expanded ? null : match.matchId)}
                            >
                              <span className="adm-dossier-match-date">{match.dateFormatted}</span>
                              <span className="adm-dossier-match-opponent">
                                <span className="adm-dossier-ea-monogram" aria-hidden="true">
                                  EA
                                </span>
                                <span>
                                  <strong>{match.opponentName}</strong>
                                  <small>
                                    {EA_TAB_LABELS[eaTab]} · Match #{match.matchId}
                                  </small>
                                </span>
                              </span>
                              <span className="adm-dossier-match-score">
                                {match.goalsFor}–{match.goalsAgainst}
                              </span>
                              <ResultBadge result={match.result} />
                              {match.players.some((player) => player.isMom) && (
                                <span className="adm-dossier-mom-pill">★ MoM</span>
                              )}
                              <span className="adm-dossier-chevron" aria-hidden="true">
                                {expanded ? '▴' : '▾'}
                              </span>
                            </button>
                            {expanded && <EaMatchDetail match={match} />}
                          </article>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : null}
            </section>
          )}

          {tab === 'squad' && (
            <div className="adm-dossier-squad-grid">
              <section className="adm-card">
                <div className="adm-card-head">
                  <div>
                    <span className="adm-eyebrow">IWVPL SQUAD</span>
                    <h2>{dossier.squad.length} registered players</h2>
                  </div>
                  {eaProfile && (
                    <span className="adm-dossier-fetched">
                      {eaProfile.roster.length} on EA roster
                    </span>
                  )}
                </div>
                {dossier.squad.length === 0 ? (
                  <p className="adm-dossier-muted">No players are currently signed to this club.</p>
                ) : (
                  <div className="adm-dossier-squad-list">
                    {dossier.squad.map((player) => {
                      const inEa = squadEaTags.has(normalizeSearch(player.gamertag))
                      return (
                        <div key={player.id} className="adm-dossier-squad-card">
                          <PlayerAvatar src={player.avatar_local} name={player.gamertag} size="md" />
                          <div className="adm-dossier-squad-info">
                            <strong>{player.gamertag}</strong>
                            <small>
                              {player.shirt_number != null ? `#${player.shirt_number} · ` : ''}
                              {player.position ?? 'Position not set'}
                            </small>
                          </div>
                          <div className="adm-dossier-squad-tags">
                            {Boolean(player.is_starting_11) && (
                              <span className="adm-dossier-tag is-accent">XI</span>
                            )}
                            {Boolean(player.is_free_agent) && (
                              <span className="adm-dossier-tag">Free agent</span>
                            )}
                            {linked && (
                              <span className={`adm-dossier-tag${inEa ? ' is-ea' : ''}`}>
                                {inEa ? 'In EA squad' : 'Not on EA'}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="adm-card">
                <div className="adm-card-head">
                  <div>
                    <span className="adm-eyebrow">EA ROSTER</span>
                    <h2>In-game squad & career stats</h2>
                  </div>
                  {eaProfile && (
                    <span className="adm-dossier-fetched">
                      EA #{eaProfile.clubId}
                    </span>
                  )}
                </div>
                {!linked ? (
                  <div className="adm-dossier-empty-inline">
                    <strong>No EA roster available</strong>
                    <span>Link this club to an EA Pro Clubs team to compare squads.</span>
                  </div>
                ) : eaLoading && !eaProfile ? (
                  <div className="adm-dossier-inline-loading">
                    <span className="spinner" aria-hidden="true" />
                    Loading EA roster…
                  </div>
                ) : !eaProfile || eaProfile.roster.length === 0 ? (
                  <p className="adm-dossier-muted">EA returned no roster for this club.</p>
                ) : (
                  <>
                    <div className="adm-table-wrap">
                      <table className="adm-table adm-dossier-table">
                        <thead>
                          <tr>
                            <th>Player</th>
                            <th>Position</th>
                            <th className="is-num">OVR</th>
                            <th className="is-num">Apps</th>
                            <th className="is-num">Goals</th>
                            <th className="is-num">Assists</th>
                            <th className="is-num">Avg rating</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eaProfile.roster.map((member) => {
                            const registered = (dossier.squad ?? []).some(
                              (player) => normalizeSearch(player.gamertag) === normalizeSearch(member.gamertag),
                            )
                            return (
                              <tr key={member.gamertag}>
                                <td>
                                  <div className="adm-dossier-player-cell">
                                    <PlayerAvatar src={null} name={member.gamertag} />
                                    <div>
                                      <strong>{member.gamertag}</strong>
                                      {!registered && <small>Not registered in IWVPL</small>}
                                    </div>
                                  </div>
                                </td>
                                <td>{member.position}</td>
                                <td className="is-num">{member.overallRating || '—'}</td>
                                <td className="is-num">{member.gamesPlayed}</td>
                                <td className="is-num">{member.goals}</td>
                                <td className="is-num">{member.assists}</td>
                                <td className="is-num">{member.ratingAve ? member.ratingAve.toFixed(1) : '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {eaOnlyRoster.length > 0 && (
                      <p className="adm-dossier-footnote">
                        {eaOnlyRoster.length} EA squad member
                        {eaOnlyRoster.length === 1 ? ' is' : 's are'} not registered in IWVPL.
                      </p>
                    )}
                  </>
                )}
              </section>
            </div>
          )}

          {tab === 'players' && (
            <section className="adm-card">
              <div className="adm-card-head">
                <div>
                  <span className="adm-eyebrow">PLAYER TOTALS</span>
                  <h2>Season performance from tracked box scores</h2>
                </div>
                <span className="adm-dossier-fetched">
                  {sortedPlayerTotals.length} player{sortedPlayerTotals.length === 1 ? '' : 's'}
                </span>
              </div>
              {sortedPlayerTotals.length === 0 ? (
                <p className="adm-dossier-muted">
                  No player-level stats have been recorded. Record an EA result for a fixture to
                  build this table automatically.
                </p>
              ) : (
                <>
                  <div className="adm-table-wrap">
                    <table className="adm-table adm-dossier-table">
                      <thead>
                        <tr>
                          <th>
                            <SortButton
                              label="Player"
                              active={playerSort.key === 'gamertag'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('gamertag')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="Apps"
                              active={playerSort.key === 'appearances'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('appearances')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="Goals"
                              active={playerSort.key === 'goals'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('goals')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="Assists"
                              active={playerSort.key === 'assists'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('assists')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="Saves"
                              active={playerSort.key === 'saves'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('saves')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="CS"
                              active={playerSort.key === 'clean_sheets'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('clean_sheets')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="Avg"
                              active={playerSort.key === 'avg_rating'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('avg_rating')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="Shots"
                              active={playerSort.key === 'shots'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('shots')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="Passes"
                              active={playerSort.key === 'passes'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('passes')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="Tackles"
                              active={playerSort.key === 'tackles'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('tackles')}
                            />
                          </th>
                          <th className="is-num">
                            <SortButton
                              label="Minutes"
                              active={playerSort.key === 'minutes_played'}
                              direction={playerSort.direction}
                              onClick={() => togglePlayerSort('minutes_played')}
                            />
                          </th>
                          <th className="is-num">Cards</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPlayerTotals.map((player) => (
                          <tr key={`${player.player_id ?? player.gamertag}`}>
                            <td>
                              <div className="adm-dossier-player-cell">
                                <PlayerAvatar src={player.avatar} name={player.gamertag} />
                                <div>
                                  <strong>{player.gamertag}</strong>
                                  <small>{player.mom > 0 ? `${player.mom}× MoM` : 'No MoM awards'}</small>
                                </div>
                              </div>
                            </td>
                            <td className="is-num">{player.appearances}</td>
                            <td className="is-num">{player.goals}</td>
                            <td className="is-num">{player.assists}</td>
                            <td className="is-num">{player.saves}</td>
                            <td className="is-num">{player.clean_sheets}</td>
                            <td className="is-num">
                              {player.avg_rating != null ? player.avg_rating.toFixed(1) : '—'}
                            </td>
                            <td className="is-num">{player.shots}</td>
                            <td className="is-num">{player.passes}</td>
                            <td className="is-num">{player.tackles}</td>
                            <td className="is-num">{player.minutes_played}</td>
                            <td className="is-num adm-dossier-cards">
                              {player.yellow_cards > 0 && (
                                <span className="adm-card-dot is-yellow">{player.yellow_cards}</span>
                              )}
                              {player.red_cards > 0 && (
                                <span className="adm-card-dot is-red">{player.red_cards}</span>
                              )}
                              {player.yellow_cards === 0 && player.red_cards === 0 && '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="adm-dossier-footnote">
                    Totals are summed from recorded match box scores in the selected season. They
                    only include fixtures that were entered or imported with player stats.
                  </p>
                </>
              )}
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`adm-dossier-sort${active ? ' is-active' : ''}`}
      onClick={onClick}
      title={`Sort by ${label}`}
    >
      {label}
      <span aria-hidden="true">{active ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
}

export type { DossierPlayerTotal }
