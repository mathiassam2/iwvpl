import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, ButtonLink, Card, Container, EmptyState, Section, Tabs } from '@/components/ui'
import { HeaderWash } from '@/components/layout/HeaderWash'
import { LineupList, Pitch } from '@/components/club'
import { SITE, siteData } from '@/data'
import { CLUB_PLACEHOLDER, cx, stripFlag, weekday, dayNum, monthShort } from '@/lib/format'
import { FORMATIONS, type PitchPlayer, type Squad } from '@/lib/fixtures'
import { findMatch } from '@/lib/match'
import {
  getLiveMatchDetail,
  type LiveMatchDetail,
  type LiveMatchEvent,
  type LiveMatchPlayerStat,
  type LiveMatchSquadMember,
} from '@/lib/liveLeague'

type LiveMatchStats = LiveMatchDetail['stats']

/* --------------------------------------------------------------- helpers */

function clubCode(name: string, shortName?: string | null): string {
  if (shortName && shortName.trim()) return shortName.trim().toUpperCase()
  const clean = stripFlag(name).trim()
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
  }
  return clean.slice(0, 3).toUpperCase()
}

function PlatformIcon({ platform }: { platform?: string }) {
  const p = (platform || 'ps').toLowerCase()
  if (p === 'pc' || p === 'origin' || p === 'ea') {
    // PC monitor + tower icon matching EA FC 26 screenshot 3
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/10 text-[var(--text-strong)]"
        title="PC"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h4A1.5 1.5 0 0 1 9 4.5v11A1.5 1.5 0 0 1 7.5 17h-4A1.5 1.5 0 0 1 2 15.5v-11Zm2 1.5v2h3V6H4Zm0 4v1.5h3V10H4Zm7-4.5A1.5 1.5 0 0 1 12.5 4h4A1.5 1.5 0 0 1 18 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-1v2h1.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5H13v-2h-.5A1.5 1.5 0 0 1 11 11.5v-6Z" />
        </svg>
      </span>
    )
  }
  if (p === 'xbox' || p === 'xbsx' || p === 'xboxone') {
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
        title="Xbox"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-3.6 2.8c1 .5 2.2 1.4 3.6 2.7 1.4-1.3 2.6-2.2 3.6-2.7A6.5 6.5 0 0 1 15.8 7c-1 .4-2.4 1.5-3.9 3.1 1.6 1.8 2.8 3.7 3.2 5.3a6.5 6.5 0 0 1-10.2 0c.4-1.6 1.6-3.5 3.2-5.3C6.6 8.5 5.2 7.4 4.2 7a6.5 6.5 0 0 1 2.2-2.2Z" />
        </svg>
      </span>
    )
  }
  // Default PlayStation badge matching EA FC 26 screenshot 3
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-slate-950 font-black"
      title="PlayStation"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M8.2 4.2v10.9l2.4.8V6.6c0-.6.3-.9.7-.8.5.1.6.5.6 1.1v4.2c1.9.6 3.4 0 3.4-2.4 0-2.3-.9-3.3-3.5-4.1-1-.3-2.4-.7-3.6-.4ZM4.5 13.8c-1.5-.4-1.8-1.2-1.1-1.7.6-.4 1.8-.7 1.8-.7l2.3-.8v1.3l-1.6.6c-.6.2-.7.5-.2.7.5.2 1.3.1 1.8-.1v1.2c-.8.2-1.9.2-3-.5Zm11.2-.5c-.9-.4-2.1-.5-3.2-.2l-1.6.5v1.3l2.2-.7c.6-.2 1.2-.2 1.6 0 .5.2.4.5-.2.7l-3.6 1.2v1.3l5-1.7c1.1-.4 1.2-1.1-.2-1.9Z" />
      </svg>
    </span>
  )
}

/* --------------------------------------------------------------- Circular Ring Gauge (Screenshot 1 & 2) */

function CircularGauge({
  value,
  label,
  tone = 'home',
  size = 112,
  max = 100,
  suffix = '%',
  decimals = 0,
}: {
  value: number
  label?: string
  tone?: 'home' | 'away' | 'rating'
  size?: number
  max?: number
  suffix?: string
  decimals?: number
}) {
  const strokeWidth = size >= 100 ? 6 : 5
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(max, Number(value) || 0))
  const pct = max > 0 ? clamped / max : 0
  const dashOffset = circumference * (1 - pct)

  const strokeColor =
    tone === 'home'
      ? '#22c55e'
      : tone === 'away'
        ? '#38bdf8'
        : clamped >= 8.0
          ? '#10b981'
          : clamped >= 7.0
            ? '#22c55e'
            : clamped >= 6.0
              ? '#f59e0b'
              : '#ef4444'

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 transform">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <span
          className="numeric absolute font-extrabold tracking-tight text-[var(--text-strong)]"
          style={{ fontSize: size >= 100 ? '1.5rem' : '1.15rem' }}
        >
          {decimals > 0 ? clamped.toFixed(decimals) : Math.round(clamped)}
          {suffix}
        </span>
      </div>
      {label && (
        <span className="mt-2 text-center text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {label}
        </span>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- EA FC 26 Center Comparison Row (Screenshot 1) */

function EaSummaryStatRow({
  label,
  home,
  away,
  suffix = '',
  decimals = 0,
  lowerIsBetter = false,
}: {
  label: string
  home: number
  away: number
  suffix?: string
  decimals?: number
  lowerIsBetter?: boolean
}) {
  const h = Number(home) || 0
  const a = Number(away) || 0
  const total = h + a
  const homePct = total > 0 ? Math.round((h / total) * 100) : 50

  const homeLeads = lowerIsBetter ? h < a : h > a
  const awayLeads = lowerIsBetter ? a < h : a > h

  const fmt = (v: number) => (decimals > 0 ? v.toFixed(decimals) : String(Math.round(v))) + suffix

  return (
    <div className="border-b border-white/10 py-2.5 last:border-b-0">
      <div className="grid grid-cols-3 items-center gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-4 w-1 rounded-full"
            style={{
              backgroundColor: homeLeads ? '#22c55e' : 'transparent',
            }}
          />
          <span
            className={cx(
              'numeric text-sm font-extrabold',
              homeLeads ? 'text-white' : 'text-[var(--text-muted)]',
            )}
          >
            {fmt(h)}
          </span>
        </div>

        <span className="text-center text-xs font-bold tracking-wide text-[var(--text-strong)]">
          {label}
        </span>

        <div className="flex items-center justify-end gap-2">
          <span
            className={cx(
              'numeric text-sm font-extrabold',
              awayLeads ? 'text-white' : 'text-[var(--text-muted)]',
            )}
          >
            {fmt(a)}
          </span>
          <span
            className="h-4 w-1 rounded-full"
            style={{
              backgroundColor: awayLeads ? '#38bdf8' : 'transparent',
            }}
          />
        </div>
      </div>

      <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-white/5">
        <span
          className="h-full transition-all duration-500"
          style={{
            width: `${homePct}%`,
            backgroundColor: homeLeads ? '#22c55e' : 'rgba(255,255,255,0.22)',
          }}
        />
        <span
          className="h-full transition-all duration-500"
          style={{
            width: `${100 - homePct}%`,
            backgroundColor: awayLeads ? '#38bdf8' : 'rgba(255,255,255,0.22)',
          }}
        />
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- Derived Team Summary Builder */

interface ResolvedTeamSummary {
  dribbleSuccessRate: [number, number]
  shotAccuracy: [number, number]
  passAccuracy: [number, number]
  possession: [number, number]
  ballRecoveryTime: [number, number] | null
  shots: [number, number]
  onTarget: [number, number] | null
  xg: [number, number] | null
  passes: [number, number]
  tackles: [number, number]
  tacklesWon: [number, number]
  interceptions: [number, number] | null
  saves: [number, number]
  fouls: [number, number]
  offsides: [number, number]
  corners: [number, number] | null
  freeKicks: [number, number] | null
  penaltyKicks: [number, number] | null
  yellowCards: [number, number]
  redCards: [number, number]
}

function resolveTeamSummary(
  stats: LiveMatchStats | null,
  playerStats: LiveMatchPlayerStat[],
  homeClubId: number,
  awayClubId: number,
): ResolvedTeamSummary | null {
  const hp = playerStats.filter((p) => p.clubId === homeClubId)
  const ap = playerStats.filter((p) => p.clubId === awayClubId)

  if (!stats && playerStats.length === 0) return null

  const sum = (arr: LiveMatchPlayerStat[], fn: (p: LiveMatchPlayerStat) => number | null | undefined) =>
    arr.reduce((acc, p) => acc + (Number(fn(p)) || 0), 0)

  const avgWeightedOrSimple = (
    arr: LiveMatchPlayerStat[],
    rateFn: (p: LiveMatchPlayerStat) => number | null | undefined,
    weightFn?: (p: LiveMatchPlayerStat) => number | null | undefined,
  ) => {
    if (arr.length === 0) return 0
    if (weightFn) {
      const totalWeight = sum(arr, weightFn)
      if (totalWeight > 0) {
        const weighted = arr.reduce(
          (acc, p) => acc + (Number(rateFn(p)) || 0) * (Number(weightFn(p)) || 0),
          0,
        )
        return Math.round(weighted / totalWeight)
      }
    }
    const valid = arr.filter((p) => (Number(rateFn(p)) || 0) > 0)
    if (valid.length === 0) return 0
    return Math.round(valid.reduce((acc, p) => acc + Number(rateFn(p)), 0) / valid.length)
  }

  const hShots = stats?.shots?.[0] ?? sum(hp, (p) => p.shots)
  const aShots = stats?.shots?.[1] ?? sum(ap, (p) => p.shots)

  const hPasses = stats?.passes?.[0] ?? sum(hp, (p) => p.passes)
  const aPasses = stats?.passes?.[1] ?? sum(ap, (p) => p.passes)

  const hPassAtt = sum(hp, (p) => p.passAttempts)
  const aPassAtt = sum(ap, (p) => p.passAttempts)

  const hTacklesWon = stats?.tacklesWon?.[0] ?? sum(hp, (p) => p.tackles)
  const aTacklesWon = stats?.tacklesWon?.[1] ?? sum(ap, (p) => p.tackles)

  const hTackleAtt = sum(hp, (p) => p.tackleAttempts)
  const aTackleAtt = sum(ap, (p) => p.tackleAttempts)

  const hTackles = stats?.tackles?.[0] ?? (hTackleAtt > 0 ? hTackleAtt : hTacklesWon)
  const aTackles = stats?.tackles?.[1] ?? (aTackleAtt > 0 ? aTackleAtt : aTacklesWon)

  const hDribRate =
    stats?.dribbleSuccess?.[0] ??
    avgWeightedOrSimple(
      hp,
      (p) => p.dribbleSuccessRate,
      (p) => p.dribbles,
    )
  const aDribRate =
    stats?.dribbleSuccess?.[1] ??
    avgWeightedOrSimple(
      ap,
      (p) => p.dribbleSuccessRate,
      (p) => p.dribbles,
    )

  const hShotAcc =
    stats?.shotAccuracy?.[0] ??
    (stats?.onTarget && hShots > 0
      ? Math.round((stats.onTarget[0] / hShots) * 100)
      : avgWeightedOrSimple(
          hp,
          (p) => p.shotAccuracy,
          (p) => p.shots,
        ))
  const aShotAcc =
    stats?.shotAccuracy?.[1] ??
    (stats?.onTarget && aShots > 0
      ? Math.round((stats.onTarget[1] / aShots) * 100)
      : avgWeightedOrSimple(
          ap,
          (p) => p.shotAccuracy,
          (p) => p.shots,
        ))

  const hPassAcc =
    stats?.passAccuracy?.[0] ??
    (hPassAtt > 0
      ? Math.round((hPasses / hPassAtt) * 100)
      : avgWeightedOrSimple(
          hp,
          (p) => p.passAccuracy,
          (p) => p.passes,
        ))
  const aPassAcc =
    stats?.passAccuracy?.[1] ??
    (aPassAtt > 0
      ? Math.round((aPasses / aPassAtt) * 100)
      : avgWeightedOrSimple(
          ap,
          (p) => p.passAccuracy,
          (p) => p.passes,
        ))

  const totalPasses = hPasses + aPasses
  const defaultPossH = totalPasses > 0 ? Math.round((hPasses / totalPasses) * 100) : 50
  const possession: [number, number] = stats?.possession ?? [defaultPossH, 100 - defaultPossH]

  return {
    dribbleSuccessRate: [hDribRate, aDribRate],
    shotAccuracy: [hShotAcc, aShotAcc],
    passAccuracy: [hPassAcc, aPassAcc],
    possession,
    ballRecoveryTime: stats?.ballRecoveryTime ?? null,
    shots: [hShots, aShots],
    onTarget: stats?.onTarget ?? null,
    xg: stats?.xg ?? null,
    passes: [hPasses, aPasses],
    tackles: [hTackles, aTackles],
    tacklesWon: [hTacklesWon, aTacklesWon],
    interceptions: stats?.interceptions ?? null,
    saves: stats?.saves ?? [sum(hp, (p) => p.saves), sum(ap, (p) => p.saves)],
    fouls: stats?.fouls ?? [sum(hp, (p) => p.foulsCommitted), sum(ap, (p) => p.foulsCommitted)],
    offsides: stats?.offsides ?? [sum(hp, (p) => p.offsides), sum(ap, (p) => p.offsides)],
    corners: stats?.corners ?? null,
    freeKicks: stats?.freeKicks ?? null,
    penaltyKicks: stats?.penalties ?? null,
    yellowCards: stats?.yellowCards ?? [sum(hp, (p) => p.yellowCards), sum(ap, (p) => p.yellowCards)],
    redCards: stats?.redCards ?? [sum(hp, (p) => p.redCards), sum(ap, (p) => p.redCards)],
  }
}

/* --------------------------------------------------------------- EA FC 26 Summary Board (Screenshot 1) */

type SummaryCategory = 'all' | 'possession' | 'shooting' | 'passing' | 'defending' | 'events'

function EaMatchSummaryBoard({
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  summary,
  events,
  playerStats,
  homeClubId,
  awayClubId,
}: {
  homeName: string
  awayName: string
  homeLogo?: string
  awayLogo?: string
  summary: ResolvedTeamSummary
  events: LiveMatchEvent[]
  playerStats: LiveMatchPlayerStat[]
  homeClubId: number
  awayClubId: number
}) {
  const [cat, setCat] = useState<SummaryCategory>('all')

  const categories: { id: SummaryCategory; label: string }[] = [
    { id: 'all', label: 'Summary' },
    { id: 'possession', label: 'Possession' },
    { id: 'shooting', label: 'Shooting' },
    { id: 'passing', label: 'Passing' },
    { id: 'defending', label: 'Defending' },
    { id: 'events', label: 'Events' },
  ]

  return (
    <Card className="overflow-hidden border border-[var(--border)] bg-[var(--surface-1)] p-0">
      {/* Top EA FC 26 Sub-Navigation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3">
        <div className="flex items-center gap-2">
          <img
            src={homeLogo || CLUB_PLACEHOLDER}
            alt=""
            onError={(e) => {
              e.currentTarget.src = CLUB_PLACEHOLDER
            }}
            className="h-5 w-5 object-contain"
          />
          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
            {stripFlag(homeName)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-full bg-black/30 p-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={cx(
                'rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors',
                cat === c.id
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-white',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold uppercase tracking-wider text-sky-400">
            {stripFlag(awayName)}
          </span>
          <img
            src={awayLogo || CLUB_PLACEHOLDER}
            alt=""
            onError={(e) => {
              e.currentTarget.src = CLUB_PLACEHOLDER
            }}
            className="h-5 w-5 object-contain"
          />
        </div>
      </div>

      {cat === 'events' ? (
        <div className="p-4 sm:p-6">
          {events.length > 0 ? (
            <Timeline events={events} homeName={homeName} awayName={awayName} />
          ) : (
            <GoalScorersSummary
              homeName={homeName}
              awayName={awayName}
              homeClubId={homeClubId}
              awayClubId={awayClubId}
              playerStats={playerStats}
              showEmpty
            />
          )}
        </div>
      ) : (
        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Home 3 Circular Accuracy Rings */}
          <div className="flex flex-row justify-around gap-4 lg:col-span-3 lg:flex-col lg:items-center lg:gap-7">
            <CircularGauge
              value={summary.dribbleSuccessRate[0]}
              label="Dribble Success Rate"
              tone="home"
            />
            <CircularGauge
              value={summary.shotAccuracy[0]}
              label="Shot Accuracy"
              tone="home"
            />
            <CircularGauge
              value={summary.passAccuracy[0]}
              label="Pass Accuracy"
              tone="home"
            />
          </div>

          {/* Center Column: EA FC 26 Comparison Table */}
          <div className="lg:col-span-6">
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 sm:px-6">
              {(cat === 'all' || cat === 'possession') && (
                <>
                  <EaSummaryStatRow
                    label="Possession %"
                    home={summary.possession[0]}
                    away={summary.possession[1]}
                  />
                  {summary.ballRecoveryTime && (
                    <EaSummaryStatRow
                      label="Ball Recovery Time (Seconds)"
                      home={summary.ballRecoveryTime[0]}
                      away={summary.ballRecoveryTime[1]}
                      lowerIsBetter
                    />
                  )}
                  {cat === 'possession' && (
                    <EaSummaryStatRow
                      label="Dribble Success Rate %"
                      home={summary.dribbleSuccessRate[0]}
                      away={summary.dribbleSuccessRate[1]}
                    />
                  )}
                </>
              )}

              {(cat === 'all' || cat === 'shooting') && (
                <>
                  <EaSummaryStatRow
                    label="Shots"
                    home={summary.shots[0]}
                    away={summary.shots[1]}
                  />
                  {summary.onTarget && (
                    <EaSummaryStatRow
                      label="Shots On Target"
                      home={summary.onTarget[0]}
                      away={summary.onTarget[1]}
                    />
                  )}
                  {summary.xg && (
                    <EaSummaryStatRow
                      label="Expected Goals"
                      home={summary.xg[0]}
                      away={summary.xg[1]}
                      decimals={2}
                    />
                  )}
                  {cat === 'shooting' && (
                    <EaSummaryStatRow
                      label="Shot Accuracy %"
                      home={summary.shotAccuracy[0]}
                      away={summary.shotAccuracy[1]}
                    />
                  )}
                </>
              )}

              {(cat === 'all' || cat === 'passing') && (
                <>
                  <EaSummaryStatRow
                    label="Passes"
                    home={summary.passes[0]}
                    away={summary.passes[1]}
                  />
                  {cat === 'passing' && (
                    <EaSummaryStatRow
                      label="Pass Accuracy %"
                      home={summary.passAccuracy[0]}
                      away={summary.passAccuracy[1]}
                    />
                  )}
                </>
              )}

              {(cat === 'all' || cat === 'defending') && (
                <>
                  <EaSummaryStatRow
                    label="Tackles"
                    home={summary.tackles[0]}
                    away={summary.tackles[1]}
                  />
                  <EaSummaryStatRow
                    label="Tackles Won"
                    home={summary.tacklesWon[0]}
                    away={summary.tacklesWon[1]}
                  />
                  {summary.interceptions && (
                    <EaSummaryStatRow
                      label="Interceptions"
                      home={summary.interceptions[0]}
                      away={summary.interceptions[1]}
                    />
                  )}
                  <EaSummaryStatRow
                    label="Saves"
                    home={summary.saves[0]}
                    away={summary.saves[1]}
                  />
                </>
              )}

              {cat === 'all' && (
                <>
                  <EaSummaryStatRow
                    label="Fouls Committed"
                    home={summary.fouls[0]}
                    away={summary.fouls[1]}
                    lowerIsBetter
                  />
                  <EaSummaryStatRow
                    label="Offsides"
                    home={summary.offsides[0]}
                    away={summary.offsides[1]}
                    lowerIsBetter
                  />
                  {summary.corners && (
                    <EaSummaryStatRow
                      label="Corners"
                      home={summary.corners[0]}
                      away={summary.corners[1]}
                    />
                  )}
                  {summary.freeKicks && (
                    <EaSummaryStatRow
                      label="Free Kicks"
                      home={summary.freeKicks[0]}
                      away={summary.freeKicks[1]}
                    />
                  )}
                  {summary.penaltyKicks && (
                    <EaSummaryStatRow
                      label="Penalty Kicks"
                      home={summary.penaltyKicks[0]}
                      away={summary.penaltyKicks[1]}
                    />
                  )}
                  <EaSummaryStatRow
                    label="Yellow Cards"
                    home={summary.yellowCards[0]}
                    away={summary.yellowCards[1]}
                    lowerIsBetter
                  />
                  {(summary.redCards[0] > 0 || summary.redCards[1] > 0) && (
                    <EaSummaryStatRow
                      label="Red Cards"
                      home={summary.redCards[0]}
                      away={summary.redCards[1]}
                      lowerIsBetter
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right Column: Away 3 Circular Accuracy Rings */}
          <div className="flex flex-row justify-around gap-4 lg:col-span-3 lg:flex-col lg:items-center lg:gap-7">
            <CircularGauge
              value={summary.dribbleSuccessRate[1]}
              label="Dribble Success Rate"
              tone="away"
            />
            <CircularGauge
              value={summary.shotAccuracy[1]}
              label="Shot Accuracy"
              tone="away"
            />
            <CircularGauge
              value={summary.passAccuracy[1]}
              label="Pass Accuracy"
              tone="away"
            />
          </div>
        </div>
      )}
    </Card>
  )
}

/* --------------------------------------------------------------- EA FC 26 Player Performance Inspector (Screenshot 2) */

const PITCH_POS_COORDS: Record<string, { x: number; y: number }> = {
  LS: { x: 37, y: 18 },
  ST: { x: 50, y: 15 },
  RS: { x: 63, y: 18 },
  LW: { x: 20, y: 22 },
  LF: { x: 32, y: 22 },
  CF: { x: 50, y: 24 },
  RF: { x: 68, y: 22 },
  RW: { x: 80, y: 22 },
  CAM: { x: 50, y: 36 },
  LM: { x: 20, y: 46 },
  LCM: { x: 35, y: 48 },
  CM: { x: 50, y: 48 },
  RCM: { x: 65, y: 48 },
  RM: { x: 80, y: 46 },
  CDM: { x: 50, y: 60 },
  LWB: { x: 16, y: 66 },
  LB: { x: 18, y: 74 },
  LCB: { x: 38, y: 76 },
  CB: { x: 50, y: 77 },
  RCB: { x: 62, y: 76 },
  RB: { x: 82, y: 74 },
  RWB: { x: 84, y: 66 },
  GK: { x: 50, y: 90 },
  SUB: { x: 88, y: 90 },
}

const DEFAULT_PITCH_DOTS: { pos: string; x: number; y: number }[] = [
  { pos: 'LS', x: 37, y: 18 },
  { pos: 'RS', x: 63, y: 18 },
  { pos: 'CAM', x: 50, y: 36 },
  { pos: 'LCM', x: 35, y: 48 },
  { pos: 'RCM', x: 65, y: 48 },
  { pos: 'CDM', x: 50, y: 60 },
  { pos: 'LB', x: 18, y: 74 },
  { pos: 'LCB', x: 38, y: 76 },
  { pos: 'RCB', x: 62, y: 76 },
  { pos: 'RB', x: 82, y: 74 },
  { pos: 'GK', x: 50, y: 90 },
]

function normalizePos(pos?: string, idx = 0): string {
  const clean = (pos || '').trim().toUpperCase()
  if (clean && PITCH_POS_COORDS[clean]) return clean
  if (clean === 'DEF') return idx % 2 === 0 ? 'LCB' : 'RCB'
  if (clean === 'MID') return idx % 2 === 0 ? 'LCM' : 'RCM'
  if (clean === 'FWD' || clean === 'ATT') return idx % 2 === 0 ? 'LS' : 'RS'
  return DEFAULT_PITCH_DOTS[idx % DEFAULT_PITCH_DOTS.length].pos
}

type PerfCategory = 'summary' | 'possession' | 'shooting' | 'passing' | 'defending' | 'goalkeeping'

function PlayerVsTeamRow({
  label,
  playerVal,
  teamVal,
  suffix = '',
  decimals = 0,
}: {
  label: string
  playerVal: number | null | undefined
  teamVal: number | null | undefined
  suffix?: string
  decimals?: number
}) {
  const p = Number(playerVal) || 0
  const t = Number(teamVal) || 0
  const max = Math.max(p, t, 1)
  const pPct = Math.min(100, Math.round((p / max) * 100))
  const tPct = Math.min(100, Math.round((t / max) * 100))

  const fmt = (v: number) => (decimals > 0 ? v.toFixed(decimals) : String(Math.round(v))) + suffix

  return (
    <div className="border-b border-white/10 py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-[var(--text-strong)]">{label}</span>
        <div className="flex items-center gap-4">
          <span className="numeric w-10 text-right font-extrabold text-emerald-400">{fmt(p)}</span>
          <span className="numeric w-10 text-right font-bold text-[var(--text-muted)]">{fmt(t)}</span>
        </div>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${pPct}%` }}
          />
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white/40 transition-all duration-500"
            style={{ width: `${tPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function EaPlayerPerformanceInspector({
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  homeClubId,
  awayClubId,
  playerStats,
  summary,
  initialSelectedId,
}: {
  homeName: string
  awayName: string
  homeLogo?: string
  awayLogo?: string
  homeClubId: number
  awayClubId: number
  playerStats: LiveMatchPlayerStat[]
  summary: ResolvedTeamSummary | null
  initialSelectedId?: number | string | null
}) {
  const homePlayers = useMemo(
    () => playerStats.filter((p) => p.clubId === homeClubId),
    [playerStats, homeClubId],
  )
  const awayPlayers = useMemo(
    () => playerStats.filter((p) => p.clubId === awayClubId),
    [playerStats, awayClubId],
  )

  const [side, setSide] = useState<'home' | 'away'>(() =>
    homePlayers.length > 0 ? 'home' : 'away',
  )
  const [cat, setCat] = useState<PerfCategory>('summary')
  const [selectedKey, setSelectedKey] = useState<string>('')

  useEffect(() => {
    if (initialSelectedId != null) {
      const found = playerStats.find(
        (p) => String(p.id) === String(initialSelectedId) || p.gamertag === String(initialSelectedId),
      )
      if (found) {
        setSide(found.clubId === awayClubId ? 'away' : 'home')
        setSelectedKey(String(found.id || found.gamertag))
      }
    }
  }, [initialSelectedId, playerStats, awayClubId])

  const activePlayers = side === 'home' ? homePlayers : awayPlayers
  const activeClubName = side === 'home' ? homeName : awayName
  const activeClubLogo = side === 'home' ? homeLogo : awayLogo
  const sideIdx = side === 'home' ? 0 : 1

  const selectedPlayer = useMemo(() => {
    if (activePlayers.length === 0) return null
    return (
      activePlayers.find((p) => String(p.id || p.gamertag) === selectedKey) ?? activePlayers[0]
    )
  }, [activePlayers, selectedKey])

  const teamAgg = useMemo(() => {
    const count = Math.max(1, activePlayers.length)
    const sum = (fn: (p: LiveMatchPlayerStat) => number | null | undefined) =>
      activePlayers.reduce((acc, p) => acc + (Number(fn(p)) || 0), 0)

    const goals = sum((p) => p.goals)
    const assists = sum((p) => p.assists)
    const shots = summary?.shots?.[sideIdx] ?? sum((p) => p.shots)
    const shotAcc = summary?.shotAccuracy?.[sideIdx] ?? Math.round(sum((p) => p.shotAccuracy) / count)
    const passes = summary?.passes?.[sideIdx] ?? sum((p) => p.passes)
    const passAcc = summary?.passAccuracy?.[sideIdx] ?? Math.round(sum((p) => p.passAccuracy) / count)
    const dribbles = sum((p) => p.dribbles)
    const dribRate =
      summary?.dribbleSuccessRate?.[sideIdx] ?? Math.round(sum((p) => p.dribbleSuccessRate) / count)
    const tackles = summary?.tackles?.[sideIdx] ?? sum((p) => p.tackles)
    const tackleRate =
      tackles > 0
        ? Math.round(((summary?.tacklesWon?.[sideIdx] ?? sum((p) => p.tackles)) / tackles) * 100)
        : Math.round(sum((p) => p.tackleSuccessRate) / count)
    const offsides = summary?.offsides?.[sideIdx] ?? sum((p) => p.offsides)
    const fouls = summary?.fouls?.[sideIdx] ?? sum((p) => p.foulsCommitted)
    const possWon = sum((p) => p.possessionWon)
    const possLost = sum((p) => p.possessionLost)
    const avgMin = Math.round(sum((p) => p.minutesPlayed || 90) / count)
    const avgDist = Number((sum((p) => p.distanceCovered) / count).toFixed(1))
    const avgSprint = Number((sum((p) => p.distanceSprinted) / count).toFixed(1))
    const saves = summary?.saves?.[sideIdx] ?? sum((p) => p.saves)

    return {
      goals,
      assists,
      shots,
      shotAcc,
      passes,
      passAcc,
      dribbles,
      dribRate,
      tackles,
      tackleRate,
      offsides,
      fouls,
      possWon,
      possLost,
      avgMin,
      avgDist,
      avgSprint,
      saves,
    }
  }, [activePlayers, summary, sideIdx])

  if (playerStats.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          title="Player Performance Not Recorded"
          hint="Detailed per-player EA FC statistics have not been entered for this fixture yet."
        />
      </Card>
    )
  }

  const selectedPos = selectedPlayer
    ? normalizePos(selectedPlayer.pos, activePlayers.indexOf(selectedPlayer))
    : 'ST'
  const selectedCoord = PITCH_POS_COORDS[selectedPos] ?? { x: 50, y: 48 }

  const ratingColor = (r: number | null) => {
    if (r == null) return 'text-[var(--text-muted)]'
    if (r >= 8.0) return 'text-emerald-400'
    if (r >= 7.0) return 'text-green-400'
    if (r >= 6.0) return 'text-amber-400'
    return 'text-rose-400'
  }

  const categories: { id: PerfCategory; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'possession', label: 'Possession' },
    { id: 'shooting', label: 'Shooting' },
    { id: 'passing', label: 'Passing' },
    { id: 'defending', label: 'Defending' },
    { id: 'goalkeeping', label: 'Goalkeeping' },
  ]

  return (
    <Card className="overflow-hidden border border-[var(--border)] bg-[var(--surface-1)] p-0">
      {/* Top Bar: Title + Category Sub-tabs + Club Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
        <div>
          <h3 className="font-display text-lg font-extrabold tracking-tight text-white">
            Player Performance
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-full bg-black/30 p-1">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={cx(
                'rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors',
                cat === c.id
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-white',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Home / Away Club Switcher */}
        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => setSide('home')}
            className={cx(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
              side === 'home'
                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                : 'text-[var(--text-muted)] hover:text-white',
            )}
          >
            <img
              src={homeLogo || CLUB_PLACEHOLDER}
              alt=""
              onError={(e) => {
                e.currentTarget.src = CLUB_PLACEHOLDER
              }}
              className="h-4 w-4 object-contain"
            />
            <span>{stripFlag(homeName)}</span>
          </button>
          <button
            type="button"
            onClick={() => setSide('away')}
            className={cx(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
              side === 'away'
                ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
                : 'text-[var(--text-muted)] hover:text-white',
            )}
          >
            <img
              src={awayLogo || CLUB_PLACEHOLDER}
              alt=""
              onError={(e) => {
                e.currentTarget.src = CLUB_PLACEHOLDER
              }}
              className="h-4 w-4 object-contain"
            />
            <span>{stripFlag(awayName)}</span>
          </button>
        </div>
      </div>

      {activePlayers.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--text-muted)]">
          No individual player records for {stripFlag(activeClubName)}.
        </div>
      ) : (
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-12">
          {/* LEFT PANE (4 cols): Selected Player Card + Interactive Roster Table */}
          <div
            className="lg:col-span-4 flex flex-col rounded-xl border border-white/10 overflow-hidden"
            style={{ backgroundColor: '#131926' }}
          >
            {selectedPlayer && (
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent px-4 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-white/15 bg-black/30">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                      {selectedPos}
                    </span>
                    <PlatformIcon platform={selectedPlayer.platform} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-[var(--text-muted)]">
                        {selectedPlayer.gamertag}
                      </p>
                      {selectedPlayer.isMom && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-300">
                          ★ MoM
                        </span>
                      )}
                    </div>
                    <p className="truncate text-base font-extrabold text-white">
                      {selectedPlayer.proName || selectedPlayer.gamertag}
                    </p>
                  </div>
                </div>

                <CircularGauge
                  value={selectedPlayer.rating ?? 0}
                  max={10}
                  size={58}
                  suffix=""
                  decimals={1}
                  tone="rating"
                />
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-black/20 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-faint)]">
                    <th className="py-2.5 pl-3.5 pr-2">POS</th>
                    <th className="py-2.5 px-2">Name</th>
                    <th className="py-2.5 px-2 text-center">RR</th>
                    <th className="py-2.5 px-2 text-center">G</th>
                    <th className="py-2.5 pl-2 pr-3.5 text-center">AST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activePlayers.map((p, idx) => {
                    const key = String(p.id || p.gamertag)
                    const isSelected =
                      selectedPlayer && String(selectedPlayer.id || selectedPlayer.gamertag) === key
                    const posLabel = normalizePos(p.pos, idx)
                    return (
                      <tr
                        key={key}
                        onClick={() => setSelectedKey(key)}
                        className={cx(
                          'cursor-pointer transition-colors',
                          isSelected
                            ? 'bg-white/12 text-white shadow-inner'
                            : 'hover:bg-white/5 text-[var(--text)]',
                        )}
                      >
                        <td className="py-2.5 pl-3.5 pr-2 font-extrabold text-[var(--text-muted)]">
                          {posLabel}
                        </td>
                        <td className="py-2.5 px-2 font-bold">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{p.proName || p.gamertag}</span>
                            {p.isMom && (
                              <span className="text-amber-400" title="Man of the Match">
                                ★
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={cx('numeric py-2.5 px-2 text-center font-extrabold', ratingColor(p.rating))}>
                          {p.rating != null ? p.rating.toFixed(1) : '—'}
                        </td>
                        <td className="numeric py-2.5 px-2 text-center font-bold text-white">
                          {p.goals}
                        </td>
                        <td className="numeric py-2.5 pl-2 pr-3.5 text-center font-bold text-white">
                          {p.assists}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* CENTER PANE (3 cols): Overall Position Pitch Heatmap Graphic */}
          <div
            className="lg:col-span-3 flex flex-col items-center justify-between rounded-xl border border-white/10 p-4"
            style={{ backgroundColor: '#131926' }}
          >
            <div className="w-full flex items-center justify-between text-xs font-bold text-[var(--text-muted)]">
              <span>
                Total Rating:{' '}
                <strong className="numeric text-white">
                  {selectedPlayer?.rating != null ? selectedPlayer.rating.toFixed(1) : '—'}
                </strong>
              </span>
              <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-extrabold uppercase text-emerald-400">
                {selectedPos}
              </span>
            </div>

            <div className="my-3 w-full max-w-xs">
              <svg
                viewBox="0 0 100 115"
                className="w-full rounded-lg border border-white/15"
                style={{ backgroundColor: '#101c18' }}
              >
                <defs>
                  <radialGradient id="posHeatAura" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.65" />
                    <stop offset="55%" stopColor="#10b981" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Pitch markings */}
                <rect x="4" y="4" width="92" height="107" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
                <line x1="4" y1="57.5" x2="96" y2="57.5" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
                <circle cx="50" cy="57.5" r="12" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
                {/* Top penalty box */}
                <rect x="22" y="4" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
                <rect x="35" y="4" width="30" height="7" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
                {/* Bottom penalty box */}
                <rect x="22" y="93" width="56" height="18" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
                <rect x="35" y="104" width="30" height="7" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />

                {/* Heatmap glow around active player's zone */}
                <circle
                  cx={selectedCoord.x}
                  cy={selectedCoord.y}
                  r="24"
                  fill="url(#posHeatAura)"
                />
                <circle
                  cx={selectedCoord.x}
                  cy={Math.min(95, selectedCoord.y + 10)}
                  r="16"
                  fill="url(#posHeatAura)"
                />

                {/* All 11 tactical nodes */}
                {DEFAULT_PITCH_DOTS.map((dot) => {
                  const isActive = dot.pos === selectedPos
                  const matchingPlayer = activePlayers.find(
                    (p, idx) => normalizePos(p.pos, idx) === dot.pos,
                  )
                  return (
                    <g
                      key={dot.pos}
                      onClick={() => {
                        if (matchingPlayer) {
                          setSelectedKey(String(matchingPlayer.id || matchingPlayer.gamertag))
                        }
                      }}
                      style={{ cursor: matchingPlayer ? 'pointer' : 'default' }}
                    >
                      {isActive ? (
                        <>
                          <circle
                            cx={dot.x}
                            cy={dot.y}
                            r="5.5"
                            fill="#ffffff"
                            stroke="#0f172a"
                            strokeWidth="1.5"
                          />
                          <circle cx={dot.x} cy={dot.y} r="2.2" fill="#0f172a" />
                        </>
                      ) : (
                        <circle
                          cx={dot.x}
                          cy={dot.y}
                          r="3.6"
                          fill="#090d16"
                          stroke="rgba(255,255,255,0.65)"
                          strokeWidth="1"
                        />
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>

            <p className="text-center text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Overall Position
            </p>
          </div>

          {/* RIGHT PANE (5 cols): Player vs Team Stat Comparison Bars */}
          <div
            className="lg:col-span-5 rounded-xl border border-white/10 p-4 sm:p-5"
            style={{ backgroundColor: '#131926' }}
          >
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                {cat === 'summary' ? 'Match Metrics' : `${cat} Metrics`}
              </span>
              <div className="flex items-center gap-4 text-[10px] font-extrabold uppercase tracking-wider">
                <span className="text-emerald-400">Player</span>
                <span className="flex items-center gap-1 text-[var(--text-muted)]">
                  <img
                    src={activeClubLogo || CLUB_PLACEHOLDER}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.src = CLUB_PLACEHOLDER
                    }}
                    className="h-3.5 w-3.5 object-contain"
                  />
                  Team
                </span>
              </div>
            </div>

            {selectedPlayer && (
              <div className="space-y-0.5">
                {(cat === 'summary' || cat === 'shooting') && (
                  <>
                    <PlayerVsTeamRow
                      label="Goals"
                      playerVal={selectedPlayer.goals}
                      teamVal={teamAgg.goals}
                    />
                    <PlayerVsTeamRow
                      label="Assists"
                      playerVal={selectedPlayer.assists}
                      teamVal={teamAgg.assists}
                    />
                    <PlayerVsTeamRow
                      label="Shots"
                      playerVal={selectedPlayer.shots}
                      teamVal={teamAgg.shots}
                    />
                    <PlayerVsTeamRow
                      label="Shot Accuracy (%)"
                      playerVal={selectedPlayer.shotAccuracy}
                      teamVal={teamAgg.shotAcc}
                    />
                  </>
                )}

                {(cat === 'summary' || cat === 'passing') && (
                  <>
                    <PlayerVsTeamRow
                      label="Passes"
                      playerVal={selectedPlayer.passes}
                      teamVal={teamAgg.passes}
                    />
                    <PlayerVsTeamRow
                      label="Pass Accuracy (%)"
                      playerVal={selectedPlayer.passAccuracy}
                      teamVal={teamAgg.passAcc}
                    />
                  </>
                )}

                {(cat === 'summary' || cat === 'possession') && (
                  <>
                    <PlayerVsTeamRow
                      label="Dribbles"
                      playerVal={selectedPlayer.dribbles}
                      teamVal={teamAgg.dribbles}
                    />
                    <PlayerVsTeamRow
                      label="Dribble Success Rate (%)"
                      playerVal={selectedPlayer.dribbleSuccessRate}
                      teamVal={teamAgg.dribRate}
                    />
                    <PlayerVsTeamRow
                      label="Possession Won"
                      playerVal={selectedPlayer.possessionWon}
                      teamVal={teamAgg.possWon}
                    />
                    <PlayerVsTeamRow
                      label="Possession Lost"
                      playerVal={selectedPlayer.possessionLost}
                      teamVal={teamAgg.possLost}
                    />
                  </>
                )}

                {(cat === 'summary' || cat === 'defending') && (
                  <>
                    <PlayerVsTeamRow
                      label="Tackles"
                      playerVal={selectedPlayer.tackles}
                      teamVal={teamAgg.tackles}
                    />
                    <PlayerVsTeamRow
                      label="Tackle Success Rate (%)"
                      playerVal={selectedPlayer.tackleSuccessRate}
                      teamVal={teamAgg.tackleRate}
                    />
                    <PlayerVsTeamRow
                      label="Offsides"
                      playerVal={selectedPlayer.offsides}
                      teamVal={teamAgg.offsides}
                    />
                    <PlayerVsTeamRow
                      label="Fouls Committed"
                      playerVal={selectedPlayer.foulsCommitted}
                      teamVal={teamAgg.fouls}
                    />
                  </>
                )}

                {(cat === 'summary' || cat === 'goalkeeping') && (
                  <>
                    {(cat === 'goalkeeping' || selectedPlayer.saves > 0 || selectedPos === 'GK') && (
                      <PlayerVsTeamRow
                        label="Saves"
                        playerVal={selectedPlayer.saves}
                        teamVal={teamAgg.saves}
                      />
                    )}
                  </>
                )}

                {cat === 'summary' && (
                  <>
                    <PlayerVsTeamRow
                      label="Minutes Played vs Team Average"
                      playerVal={selectedPlayer.minutesPlayed || 90}
                      teamVal={teamAgg.avgMin}
                    />
                    <PlayerVsTeamRow
                      label="Distance Covered vs Team Average (km)"
                      playerVal={selectedPlayer.distanceCovered}
                      teamVal={teamAgg.avgDist}
                      decimals={1}
                    />
                    <PlayerVsTeamRow
                      label="Distance Sprinted vs Team Average (km)"
                      playerVal={selectedPlayer.distanceSprinted}
                      teamVal={teamAgg.avgSprint}
                      decimals={1}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

/* --------------------------------------------------------------- EA FC 26 Players Platform Sheet (Screenshot 3) */

function EaPlayersPlatformSheet({
  homeName,
  awayName,
  homeShortName,
  awayShortName,
  homeLogo,
  awayLogo,
  homeClubId,
  awayClubId,
  playerStats,
  homeSquad,
  awaySquad,
  onSelectPlayer,
}: {
  homeName: string
  awayName: string
  homeShortName?: string | null
  awayShortName?: string | null
  homeLogo?: string
  awayLogo?: string
  homeClubId: number
  awayClubId: number
  playerStats: LiveMatchPlayerStat[]
  homeSquad: LiveMatchSquadMember[]
  awaySquad: LiveMatchSquadMember[]
  onSelectPlayer?: (playerIdOrGamertag: string | number) => void
}) {
  const homePlayers = useMemo<LiveMatchPlayerStat[]>(() => {
    const stats = playerStats.filter((p) => p.clubId === homeClubId)
    if (stats.length > 0) return stats
    return homeSquad.map((m) => ({
      id: m.id,
      playerId: m.id,
      clubId: homeClubId,
      gamertag: m.gamertag,
      proName: '',
      platform: 'ps',
      pos: '',
      rating: null,
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
      yellowCards: 0,
      redCards: 0,
      isMom: false,
    }))
  }, [playerStats, homeClubId, homeSquad])

  const awayPlayers = useMemo<LiveMatchPlayerStat[]>(() => {
    const stats = playerStats.filter((p) => p.clubId === awayClubId)
    if (stats.length > 0) return stats
    return awaySquad.map((m) => ({
      id: m.id,
      playerId: m.id,
      clubId: awayClubId,
      gamertag: m.gamertag,
      proName: '',
      platform: 'ps',
      pos: '',
      rating: null,
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
      yellowCards: 0,
      redCards: 0,
      isMom: false,
    }))
  }, [playerStats, awayClubId, awaySquad])

  const renderRosterColumn = (list: LiveMatchPlayerStat[]) => {
    if (list.length === 0) {
      return (
        <p className="py-6 text-center text-xs text-[var(--text-faint)]">
          No players listed for this club.
        </p>
      )
    }
    return (
      <ul className="divide-y divide-white/5">
        {list.map((p) => (
          <li
            key={p.id || p.gamertag}
            onClick={() => onSelectPlayer?.(p.id || p.gamertag)}
            className={cx(
              'flex items-center justify-between gap-3 px-4 py-2.5 transition-colors',
              onSelectPlayer ? 'cursor-pointer hover:bg-white/10' : 'hover:bg-white/5',
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <PlatformIcon platform={p.platform} />
              <span className="truncate text-sm font-extrabold text-white">{p.gamertag}</span>
              {p.proName && p.proName !== p.gamertag && (
                <span className="truncate text-xs text-[var(--text-muted)]">({p.proName})</span>
              )}
              {p.isMom && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                  ★ MoM
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {p.pos && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[var(--text-muted)]">
                  {p.pos}
                </span>
              )}
              {p.rating != null && (
                <span className="numeric rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-extrabold text-emerald-300">
                  {p.rating.toFixed(1)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card className="overflow-hidden border border-[var(--border)] bg-[var(--surface-1)] p-0">
      {/* Header matching EA FC 26 PLAYERS Screen (Screenshot 3) */}
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-6 py-5">
        <p className="text-center font-display text-lg font-black uppercase tracking-[0.2em] text-white">
          Players
        </p>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={homeLogo || CLUB_PLACEHOLDER}
              alt=""
              onError={(e) => {
                e.currentTarget.src = CLUB_PLACEHOLDER
              }}
              className="h-14 w-14 object-contain sm:h-16 sm:w-16"
            />
            <div>
              <p className="font-display text-2xl font-black tracking-wider text-white sm:text-3xl">
                {clubCode(homeName, homeShortName)}
              </p>
              <p className="text-xs font-semibold text-[var(--text-muted)]">{stripFlag(homeName)}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="font-display text-2xl font-black tracking-wider text-white sm:text-3xl">
                {clubCode(awayName, awayShortName)}
              </p>
              <p className="text-xs font-semibold text-[var(--text-muted)]">{stripFlag(awayName)}</p>
            </div>
            <img
              src={awayLogo || CLUB_PLACEHOLDER}
              alt=""
              onError={(e) => {
                e.currentTarget.src = CLUB_PLACEHOLDER
              }}
              className="h-14 w-14 object-contain sm:h-16 sm:w-16"
            />
          </div>
        </div>
      </div>

      <div className="grid divide-y divide-white/10 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div>
          <div className="border-b border-white/10 bg-black/25 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
            Player · {stripFlag(homeName)}
          </div>
          {renderRosterColumn(homePlayers)}
        </div>
        <div>
          <div className="border-b border-white/10 bg-black/25 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
            Player · {stripFlag(awayName)}
          </div>
          {renderRosterColumn(awayPlayers)}
        </div>
      </div>
    </Card>
  )
}

/* --------------------------------------------------------------- Timeline & Scorers */

const EVENT_TONE: Record<string, { icon: string; text: string }> = {
  goal: { icon: '⚽', text: 'text-[var(--accent-text)]' },
  'own goal': { icon: '⚽', text: 'text-[var(--danger-text)]' },
  yellow: { icon: '▮', text: 'text-[var(--gold-text)]' },
  red: { icon: '▮', text: 'text-[var(--danger-text)]' },
  sub: { icon: '⇄', text: 'text-[var(--text-muted)]' },
}

function Timeline({
  events,
  homeName,
  awayName,
}: {
  events: LiveMatchEvent[]
  homeName: string
  awayName: string
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="Timeline not recorded"
        hint="Minute-by-minute events were not recorded for this fixture."
      />
    )
  }

  const EventChip = ({ e, side }: { e: LiveMatchEvent; side: 'left' | 'right' }) => {
    const tone = EVENT_TONE[e.type] ?? { icon: '•', text: 'text-[var(--text-muted)]' }
    return (
      <div
        className={cx(
          'flex min-w-0 items-center gap-2',
          side === 'right' ? 'justify-end text-right' : 'justify-start',
        )}
      >
        {side === 'right' && (
          <span className="line-clamp-2 min-w-0 text-sm text-[var(--text)]">
            {e.detail ?? e.playerName}
          </span>
        )}
        <span className={cx('shrink-0 text-sm', tone.text)}>{tone.icon}</span>
        {side === 'left' && (
          <span className="line-clamp-2 min-w-0 text-sm text-[var(--text)]">
            {e.detail ?? e.playerName}
          </span>
        )}
        {e.type === 'goal' && e.score && (
          <span
            className={cx(
              'numeric shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold',
              side === 'right'
                ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                : 'bg-[var(--surface-2)] text-[var(--text-strong)] ring-1 ring-[var(--border-strong)]',
            )}
          >
            {e.score}
          </span>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-3 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
        <span className="truncate text-right text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {stripFlag(homeName)}
        </span>
        <span className="text-center text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
          Min
        </span>
        <span className="truncate text-left text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {stripFlag(awayName)}
        </span>
      </div>

      <ol>
        {events.map((e, i) => (
          <li
            key={`${e.minute}-${i}`}
            className="grid grid-cols-3 items-center gap-2 border-b border-[var(--border)] px-4 py-2.5 last:border-0"
          >
            <div className="min-w-0">
              {e.teamSide === 'home' && <EventChip e={e} side="right" />}
            </div>
            <span className="numeric shrink-0 text-center text-xs font-bold text-[var(--text-faint)]">
              {e.minute}'
            </span>
            <div className="min-w-0">
              {e.teamSide === 'away' && <EventChip e={e} side="left" />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function GoalScorersSummary({
  homeName,
  awayName,
  homeClubId,
  awayClubId,
  playerStats,
  showEmpty = false,
}: {
  homeName: string
  awayName: string
  homeClubId: number
  awayClubId: number
  playerStats: LiveMatchPlayerStat[]
  showEmpty?: boolean
}) {
  const homeScorers = playerStats.filter((p) => p.clubId === homeClubId && p.goals > 0)
  const awayScorers = playerStats.filter((p) => p.clubId === awayClubId && p.goals > 0)

  if (homeScorers.length === 0 && awayScorers.length === 0) {
    if (!showEmpty) return null
    return (
      <EmptyState
        title="No match events recorded"
        hint="Goal scorers and timeline events were not recorded for this fixture."
      />
    )
  }

  return (
    <Card className="p-0">
      <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
        Match Scorers · {stripFlag(homeName)} vs {stripFlag(awayName)}
      </p>
      <div className="grid grid-cols-2 divide-x divide-[var(--border)] p-4 text-xs">
        <div className="space-y-1.5 pr-3 text-right">
          {homeScorers.map((s) => (
            <div key={s.id || s.gamertag} className="flex items-center justify-end gap-1.5">
              <span className="font-semibold text-[var(--text-strong)]">
                {s.proName || s.gamertag}
              </span>
              <span className="text-[11px] font-bold text-[var(--accent-text)]">
                ⚽ {s.goals > 1 ? `x${s.goals}` : ''}
              </span>
            </div>
          ))}
          {homeScorers.length === 0 && <span className="text-[var(--text-faint)]">—</span>}
        </div>
        <div className="space-y-1.5 pl-3">
          {awayScorers.map((s) => (
            <div key={s.id || s.gamertag} className="flex items-center justify-start gap-1.5">
              <span className="text-[11px] font-bold text-[var(--accent-text)]">
                ⚽ {s.goals > 1 ? `x${s.goals}` : ''}
              </span>
              <span className="font-semibold text-[var(--text-strong)]">
                {s.proName || s.gamertag}
              </span>
            </div>
          ))}
          {awayScorers.length === 0 && <span className="text-[var(--text-faint)]">—</span>}
        </div>
      </div>
    </Card>
  )
}

function buildSquadFromMembers(
  members: LiveMatchSquadMember[],
  formation = '4-3-3',
  manager = '—',
): Squad {
  const formDef = FORMATIONS[formation] ?? FORMATIONS['4-3-3']
  const slots = formDef.slots
  const starters: PitchPlayer[] = slots.map(([role, x, y], idx) => {
    const member = members[idx]
    if (!member) {
      return {
        number: idx === 0 ? 1 : idx + 1,
        name: members.length === 0 ? 'Unassigned' : '—',
        role,
        x,
        y,
      }
    }
    return {
      number: member.shirtNumber ?? (idx === 0 ? 1 : idx + 1),
      name: member.gamertag,
      role,
      x,
      y,
      isCaptain: false,
    }
  })

  const bench: PitchPlayer[] = members.slice(slots.length).map((member, idx) => ({
    number: member.shirtNumber ?? slots.length + idx + 1,
    name: member.gamertag,
    role: 'SUB',
    x: 50,
    y: 50,
  }))

  return {
    formation: formDef.shape,
    starters,
    bench,
    manager,
  }
}

/* -------------------------------------------------------------------- page */

export default function MatchPage() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState('summary')
  const [liveMatch, setLiveMatch] = useState<LiveMatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPerfPlayerId, setSelectedPerfPlayerId] = useState<string | number | null>(null)

  // 1. Fetch live match details from database API
  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    const controller = new AbortController()

    void (async () => {
      try {
        const data = await getLiveMatchDetail(id, controller.signal)
        if (active) {
          setLiveMatch(data)
          setLoading(false)
        }
      } catch {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [id])

  // Fallback to static crawled match if API doesn't return
  const fallbackFound = useMemo(() => findMatch(id), [id])
  const fallbackMatch = fallbackFound?.match

  const matchData = useMemo(() => {
    if (liveMatch) {
      return {
        id: liveMatch.id,
        homeId: liveMatch.home.id,
        awayId: liveMatch.away.id,
        home: liveMatch.home.name,
        away: liveMatch.away.name,
        homeShortName: liveMatch.home.code,
        awayShortName: liveMatch.away.code,
        homeLogo: liveMatch.home.logo,
        awayLogo: liveMatch.away.logo,
        date: liveMatch.date,
        time: liveMatch.time,
        hs: liveMatch.hs,
        as: liveMatch.as,
        played: liveMatch.played,
        divisionName: liveMatch.divisionName,
        roundNumber: liveMatch.roundNumber,
        homeSquadMembers: liveMatch.homeSquad,
        awaySquadMembers: liveMatch.awaySquad,
        homeSquad: buildSquadFromMembers(liveMatch.homeSquad),
        awaySquad: buildSquadFromMembers(liveMatch.awaySquad),
        hasStats: liveMatch.hasStats,
        stats: liveMatch.stats,
        events: liveMatch.events,
        playerStats: liveMatch.playerStats,
      }
    }

    if (fallbackMatch) {
      return {
        id: fallbackMatch.id,
        homeId: 1,
        awayId: 2,
        home: fallbackMatch.home,
        away: fallbackMatch.away,
        homeShortName: null,
        awayShortName: null,
        homeLogo: fallbackMatch.homeLogo,
        awayLogo: fallbackMatch.awayLogo,
        date: fallbackMatch.date,
        time: fallbackMatch.time,
        hs: fallbackMatch.hs,
        as: fallbackMatch.as,
        played: fallbackMatch.hs !== '' && fallbackMatch.as !== '',
        divisionName: fallbackMatch.divisionName,
        roundNumber: fallbackMatch.roundNumber,
        homeSquadMembers: [],
        awaySquadMembers: [],
        homeSquad: buildSquadFromMembers([]),
        awaySquad: buildSquadFromMembers([]),
        hasStats: false,
        stats: null,
        events: [],
        playerStats: [],
      }
    }

    return null
  }, [liveMatch, fallbackMatch])

  const resolvedSummary = useMemo(() => {
    if (!matchData) return null
    return resolveTeamSummary(
      matchData.stats,
      matchData.playerStats,
      matchData.homeId,
      matchData.awayId,
    )
  }, [matchData])

  const standings = useMemo(() => {
    if (!matchData) return null
    const rows = siteData.standings
    const h = rows.findIndex((s) => stripFlag(s.team) === stripFlag(matchData.home))
    const a = rows.findIndex((s) => stripFlag(s.team) === stripFlag(matchData.away))
    if (h < 0 && a < 0) return null
    const lo = Math.max(0, Math.min(h < 0 ? a : h, a < 0 ? h : a) - 2)
    const hi = Math.min(rows.length, Math.max(h < 0 ? a : h, a < 0 ? h : a) + 3)
    return rows.slice(lo, hi)
  }, [matchData])

  if (loading && !matchData) {
    return (
      <Section>
        <Container size="narrow">
          <div className="py-16 text-center text-sm text-[var(--text-muted)]">
            Loading fixture details...
          </div>
        </Container>
      </Section>
    )
  }

  if (!matchData) {
    return (
      <Section>
        <Container size="narrow">
          <EmptyState
            title="Match not found"
            hint="That fixture is not in the current season's results."
          />
          <div className="mt-6 flex justify-center">
            <ButtonLink to="/matches" size="lg">
              All results
            </ButtonLink>
          </div>
        </Container>
      </Section>
    )
  }

  const homeStanding = siteData.standings.find(
    (s) => stripFlag(s.team) === stripFlag(matchData.home),
  )
  const awayStanding = siteData.standings.find(
    (s) => stripFlag(s.team) === stripFlag(matchData.away),
  )

  const panels: Record<string, React.ReactNode> = {
    summary: (
      <div className="space-y-6">
        {/* Goal scorers / timeline banner at top if available */}
        {matchData.events.length > 0 ? (
          <Card className="p-0">
            <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              Match Timeline
            </p>
            <Timeline events={matchData.events} homeName={matchData.home} awayName={matchData.away} />
          </Card>
        ) : (
          <GoalScorersSummary
            homeName={matchData.home}
            awayName={matchData.away}
            homeClubId={matchData.homeId}
            awayClubId={matchData.awayId}
            playerStats={matchData.playerStats}
          />
        )}

        {/* EA FC 26 Match Summary Visual Board (Screenshot 1) */}
        {resolvedSummary ? (
          <EaMatchSummaryBoard
            homeName={matchData.home}
            awayName={matchData.away}
            homeLogo={matchData.homeLogo}
            awayLogo={matchData.awayLogo}
            summary={resolvedSummary}
            events={matchData.events}
            playerStats={matchData.playerStats}
            homeClubId={matchData.homeId}
            awayClubId={matchData.awayId}
          />
        ) : (
          <Card className="p-0">
            <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              Match Summary
            </p>
            <div className="py-6 px-4">
              <EmptyState
                title="Statistics not recorded"
                hint="Match statistics were not recorded for this fixture."
              />
            </div>
          </Card>
        )}

        {/* Also preview Player Performance right underneath on Summary if players exist */}
        {matchData.playerStats.length > 0 && (
          <EaPlayerPerformanceInspector
            homeName={matchData.home}
            awayName={matchData.away}
            homeLogo={matchData.homeLogo}
            awayLogo={matchData.awayLogo}
            homeClubId={matchData.homeId}
            awayClubId={matchData.awayId}
            playerStats={matchData.playerStats}
            summary={resolvedSummary}
            initialSelectedId={selectedPerfPlayerId}
          />
        )}
      </div>
    ),
    performance: (
      <EaPlayerPerformanceInspector
        homeName={matchData.home}
        awayName={matchData.away}
        homeLogo={matchData.homeLogo}
        awayLogo={matchData.awayLogo}
        homeClubId={matchData.homeId}
        awayClubId={matchData.awayId}
        playerStats={matchData.playerStats}
        summary={resolvedSummary}
        initialSelectedId={selectedPerfPlayerId}
      />
    ),
    players: (
      <div className="space-y-8">
        {/* EA FC 26 Players Platform Sheet (Screenshot 3) */}
        <EaPlayersPlatformSheet
          homeName={matchData.home}
          awayName={matchData.away}
          homeShortName={matchData.homeShortName}
          awayShortName={matchData.awayShortName}
          homeLogo={matchData.homeLogo}
          awayLogo={matchData.awayLogo}
          homeClubId={matchData.homeId}
          awayClubId={matchData.awayId}
          playerStats={matchData.playerStats}
          homeSquad={matchData.homeSquadMembers}
          awaySquad={matchData.awaySquadMembers}
          onSelectPlayer={(playerKey) => {
            setSelectedPerfPlayerId(playerKey)
            setTab('performance')
          }}
        />

        {/* Tactical Pitch Lineups */}
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            { squad: matchData.homeSquad, name: matchData.home, home: true },
            { squad: matchData.awaySquad, name: matchData.away, home: false },
          ].map((side, i) => (
            <Card key={i} className="p-0">
              <div className="flex items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3">
                <Badge tone="muted">{side.squad.formation}</Badge>
                <span className="truncate text-sm font-bold text-[var(--text-strong)]">
                  {stripFlag(side.name)}
                </span>
                <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                  {side.home ? 'Home XI' : 'Away XI'}
                </span>
              </div>
              <div className="p-4 sm:p-5">
                <div className="mx-auto max-w-md">
                  <Pitch squad={side.squad} home={side.home} />
                </div>
              </div>
              <div className="border-t border-[var(--border)]">
                <LineupList squad={side.squad} home={side.home} />
              </div>
            </Card>
          ))}
        </div>
      </div>
    ),
    table: (
      <Card className="p-0">
        <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
          Table context
        </p>
        {standings ? (
          <ul className="divide-y divide-[var(--border)]">
            {standings.map((s) => {
              const on =
                stripFlag(s.team) === stripFlag(matchData.home) ||
                stripFlag(s.team) === stripFlag(matchData.away)
              return (
                <li
                  key={s.team}
                  className={cx(
                    'flex items-center gap-3 px-5 py-2.5',
                    on && 'bg-[var(--accent-tint)]',
                  )}
                >
                  <span className="numeric w-5 shrink-0 text-right text-xs text-[var(--text-faint)]">
                    {s.pos}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">
                    {stripFlag(s.team)}
                  </span>
                  <span className="numeric text-xs text-[var(--text-faint)]">{s.pl} pl</span>
                  <span className="numeric w-8 shrink-0 text-right text-sm font-bold text-[var(--text-strong)]">
                    {s.pts}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-[var(--text-muted)]">
            Neither club appears in the current table.
          </p>
        )}
      </Card>
    ),
  }

  return (
    <div className="page-enter">
      {/* ---------------- scoreboard ---------------- */}
      <section className="relative -mt-16 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-2)] pt-16 lg:-mt-[72px] lg:pt-[72px]">
        <HeaderWash />
        <Container size="wide" className="relative pb-10 pt-2 lg:pb-12">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
              <li>
                <Link to="/matches" className="transition-colors hover:text-[var(--text)]">
                  Matches
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-[var(--text-muted)]">
                {stripFlag(matchData.home)} vs {stripFlag(matchData.away)}
              </li>
            </ol>
          </nav>

          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
            {SITE.name} · {matchData.divisionName ?? 'Season 1'}
            {matchData.roundNumber ? ` · Game Week ${matchData.roundNumber}` : ''}
          </p>

          <div className="mt-6 flex items-center justify-between gap-3 sm:gap-6">
            <TeamSide
              name={matchData.home}
              logo={matchData.homeLogo}
              standing={homeStanding}
              align="right"
            />

            <div className="shrink-0 text-center">
              {matchData.played ? (
                <p className="numeric text-5xl font-extrabold leading-none text-[var(--text-strong)] sm:text-6xl">
                  {matchData.hs}
                  <span className="mx-2 text-3xl text-[var(--text-faint)]">:</span>
                  {matchData.as}
                </p>
              ) : (
                <p className="numeric text-4xl font-extrabold text-[var(--text-strong)]">
                  {matchData.time || 'TBC'}
                </p>
              )}
              {matchData.date && (
                <p className="mt-2 text-[11px] text-[var(--text-faint)]">
                  {weekday(matchData.date)} {dayNum(matchData.date)} {monthShort(matchData.date)}{' '}
                  {matchData.date.slice(-4)}
                </p>
              )}
              {matchData.played && (
                <p className="mt-1 inline-block rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Full Time · 90:00
                </p>
              )}
            </div>

            <TeamSide
              name={matchData.away}
              logo={matchData.awayLogo}
              standing={awayStanding}
              align="left"
            />
          </div>
        </Container>
      </section>

      {/* ---------------- tabs ---------------- */}
      <Section>
        <Container size="wide">
          <div className="mb-6 border-b border-[var(--border)]">
            <Tabs
              tabs={[
                { id: 'summary', label: 'Match Summary' },
                {
                  id: 'performance',
                  label: 'Player Performance',
                  count: matchData.playerStats.length || undefined,
                },
                { id: 'players', label: 'Players & Lineups' },
                { id: 'table', label: 'Table' },
              ]}
              active={tab}
              onChange={setTab}
              idPrefix="match"
            />
          </div>

          <div id={`match-panel-${tab}`} role="tabpanel" aria-labelledby={`match-${tab}`}>
            {panels[tab]}
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/matches?tab=results" variant="outline">
              All results
            </ButtonLink>
            <ButtonLink to="/matches?tab=upcoming">Full schedule</ButtonLink>
          </div>
        </Container>
      </Section>
    </div>
  )
}

/* --------------------------------------------------------------- TeamSide */

function TeamSide({
  name,
  logo,
  standing,
  align,
}: {
  name: string
  logo?: string
  standing?: { pos: number; pts: number }
  align: 'left' | 'right'
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-1 flex-col items-center gap-3',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <img
        src={logo ?? CLUB_PLACEHOLDER}
        alt=""
        onError={(e) => {
          e.currentTarget.src = CLUB_PLACEHOLDER
        }}
        className="h-16 w-16 object-contain sm:h-20 sm:w-20"
      />
      <span className="line-clamp-2 text-sm font-bold leading-tight text-[var(--text-strong)] sm:text-base">
        {stripFlag(name)}
      </span>
      {standing && (
        <span className="text-[11px] text-[var(--text-faint)]">
          <span className="numeric font-bold text-[var(--accent-text)]">{standing.pos}</span> ·{' '}
          <span className="numeric">{standing.pts} pts</span>
        </span>
      )}
    </div>
  )
}
