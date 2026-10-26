import { Link } from 'react-router-dom'
import type { Leaderboard } from '@/types/site'
import { AVATAR_PLACEHOLDER, cx, stripFlag } from '@/lib/format'
import { playerHref } from '@/lib/players'

function PodiumAwardIcon({ place, isFirst }: { place: number; isFirst: boolean }) {
  if (place === 1) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={cx(
          'shrink-0',
          isFirst ? 'h-3.5 w-3.5 sm:h-4 sm:w-4' : 'h-3 w-3 sm:h-3.5 sm:w-3.5',
        )}
      >
        <path
          d="M6 3h12v5a6 6 0 0 1-12 0V3Z"
          fill="currentColor"
          fillOpacity="0.25"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M18 5h2a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4M12 14v4M8 21h8M9.5 18h5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 h-3 w-3 sm:h-3.5 sm:w-3.5"
    >
      <path
        d="M8.5 3h3l1.5 4.5M15.5 3h-3L11 7.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="14.5"
        r="6"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <text
        x="12"
        y="16.8"
        textAnchor="middle"
        fill="currentColor"
        fontSize="7.5"
        fontWeight="900"
      >
        {place}
      </text>
    </svg>
  )
}

/**
 * Top-three showcase with high-end 3D overflowing celebration cutouts.
 * Features an arena stage backdrop, tiered Olympic pedestals, and seamless
 * bottom edge blending.
 */
export function LeaderboardPodium({ board }: { board: Leaderboard }) {
  const [first, second, third] = board.rows
  if (!first) return null

  const unit = board.title.includes('SCOR')
    ? 'goals'
    : board.title.includes('ASSIST')
      ? 'assists'
      : 'saves'

  const slots = [
    { row: second, place: 2, label: '2ND · RUNNER-UP' },
    { row: first, place: 1, label: '1ST · CHAMPION' },
    { row: third, place: 3, label: '3RD · RUNNER-UP' },
  ]

  return (
    <section className="relative overflow-visible rounded-2xl sm:rounded-3xl border border-white/10 bg-radial-[ellipse_at_50%_15%] from-[rgba(200,255,61,0.1)] via-[rgba(18,23,34,0.85)] to-[#090c12] p-4 pt-12 sm:p-6 sm:pt-16 md:p-8 md:pt-20 shadow-[0_24px_70px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.1)]">
      {/* Stage Header Eyebrow */}
      <div className="text-center mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-extrabold tracking-[0.18em] uppercase text-[var(--accent-text)] border border-[var(--accent-ring)]">
          ★ {board.title} PODIUM HONOURS ★
        </span>
      </div>

      {/* 3-Column Podium Stage */}
      <div className="grid grid-cols-3 items-end gap-2.5 sm:gap-4 md:gap-6 max-w-4xl mx-auto">
        {slots.map(({ row, place, label }) => {
          const isFirst = place === 1
          const cutout = row?.celebrationImage || row?.avatarLocal || row?.avatar || null
          const hasCustomCelebration = Boolean(row?.celebrationImage)

          const badgeTheme =
            place === 1
              ? {
                  bg: 'linear-gradient(135deg, #ffe27a 0%, #e8a317 100%)',
                  color: '#1a1200',
                  shadow: '0 4px 14px rgba(232, 163, 23, 0.45)',
                }
              : place === 2
                ? {
                    bg: 'linear-gradient(135deg, #f0f3f8 0%, #9ea7b8 100%)',
                    color: '#141822',
                    shadow: '0 4px 12px rgba(158, 167, 184, 0.35)',
                  }
                : {
                    bg: 'linear-gradient(135deg, #e7af82 0%, #b87333 100%)',
                    color: '#1a1005',
                    shadow: '0 4px 12px rgba(184, 115, 51, 0.35)',
                  }

          return (
            <div
              key={place}
              className={cx(
                'relative flex flex-col items-center w-full',
                isFirst ? 'z-20' : 'z-10',
              )}
            >
              {/* 3D Overflowing Cutout Stage (4:5 Synchronized Aspect Ratio) */}
              <div
                className={cx(
                  'relative w-full aspect-[4/5] flex items-end justify-center pointer-events-none -mb-9 sm:-mb-11 overflow-visible z-10',
                  isFirst
                    ? 'max-w-[220px] sm:max-w-[250px]'
                    : 'max-w-[190px] sm:max-w-[220px]',
                )}
                style={{
                  // Softly fade bottom edge so waist cuts blend naturally into the pedestal card
                  maskImage: 'linear-gradient(to bottom, black 0%, black 80%, transparent 98%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 80%, transparent 98%)',
                }}
              >
                {/* Golden ambient aura behind #1 champion cutout */}
                {isFirst && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-4 h-32 w-32 sm:h-44 sm:w-44 rounded-full bg-[var(--accent-solid)] opacity-35 blur-2xl"
                  />
                )}

                {hasCustomCelebration ? (
                  <img
                    src={row!.celebrationImage!}
                    alt={row!.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain object-bottom drop-shadow-[0_16px_32px_rgba(0,0,0,0.9)] filter transition-transform duration-300 hover:scale-105"
                  />
                ) : row ? (
                  <div
                    className={cx(
                      'relative flex items-end justify-center mb-8 sm:mb-10',
                      isFirst ? 'h-24 w-24 sm:h-30 sm:w-30' : 'h-18 w-18 sm:h-22 sm:w-22',
                    )}
                  >
                    <img
                      src={cutout || AVATAR_PLACEHOLDER}
                      alt={row.name}
                      loading="lazy"
                      decoding="async"
                      className={cx(
                        'rounded-full object-cover shadow-[0_14px_28px_rgba(0,0,0,0.8)] ring-2',
                        isFirst
                          ? 'h-20 w-20 sm:h-26 sm:w-26 ring-[var(--accent-solid)]'
                          : 'h-14 w-14 sm:h-18 sm:w-18 ring-white/20',
                      )}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center mb-8 opacity-25">
                    <span className="text-3xl sm:text-4xl">🧍</span>
                  </div>
                )}
              </div>

              {/* Pedestal Card Container (Sits in front of waist for seamless framing) */}
              {row ? (
                <Link
                  to={playerHref(row.name)}
                  className={cx(
                    'relative w-full rounded-xl sm:rounded-2xl text-center transition-all duration-300 ease-out z-20 block',
                    'hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-solid)]',
                    isFirst
                      ? 'min-h-[175px] sm:min-h-[188px] pt-6 pb-4 px-3 sm:pt-7 sm:pb-5 sm:px-4 border border-[var(--accent-solid)]/45 shadow-[0_20px_45px_-12px_rgba(200,255,61,0.32),inset_0_1px_0_rgba(200,255,61,0.35)]'
                      : 'min-h-[155px] sm:min-h-[168px] pt-5 pb-3.5 px-2.5 sm:pt-6 sm:pb-4 sm:px-3.5 border border-white/10 shadow-[0_14px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]',
                  )}
                  style={{
                    background: isFirst
                      ? 'linear-gradient(180deg, #1f2736 0%, #0e121b 100%)'
                      : 'linear-gradient(180deg, #161a24 0%, #0c0f16 100%)',
                  }}
                >
                  {/* Rank Pill Badge */}
                  <span
                    aria-label={`Rank ${place}`}
                    className={cx(
                      'relative mx-auto inline-flex items-center justify-center gap-1.5 rounded-full font-display font-black tracking-wider uppercase whitespace-nowrap',
                      isFirst
                        ? 'h-6.5 px-3 text-[10px] sm:h-7 sm:px-3.5 sm:text-[11px]'
                        : 'h-6 px-2.5 text-[9.5px] sm:h-6.5 sm:px-3 sm:text-[10px]',
                    )}
                    style={{
                      background: badgeTheme.bg,
                      color: badgeTheme.color,
                      boxShadow: badgeTheme.shadow,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <PodiumAwardIcon place={place} isFirst={isFirst} />
                    <span className="whitespace-nowrap">{label}</span>
                  </span>

                  {/* Player Gamertag */}
                  <p
                    className={cx(
                      'relative mt-2.5 truncate font-extrabold text-white',
                      isFirst ? 'text-sm sm:text-base md:text-lg' : 'text-xs sm:text-sm',
                    )}
                    title={row.name}
                  >
                    {row.name}
                  </p>

                  {/* Club Details */}
                  <p className="relative mt-0.5 flex items-center justify-center gap-1.5 truncate text-[11px] sm:text-xs text-white/60">
                    {row.team_flag && <span aria-hidden>{row.team_flag}</span>}
                    <span className="truncate">{stripFlag(row.team)}</span>
                  </p>

                  {/* Giant Metric Value */}
                  <div
                    className={cx(
                      'numeric relative mt-2 sm:mt-3 font-black leading-none tracking-tight',
                      isFirst
                        ? 'text-3xl text-[var(--accent-text)] sm:text-4xl md:text-5xl drop-shadow-[0_2px_12px_rgba(200,255,61,0.35)]'
                        : 'text-2xl text-white sm:text-3xl md:text-4xl',
                    )}
                  >
                    {row.value}
                  </div>

                  <p className="relative mt-1 text-[9px] uppercase tracking-[0.2em] font-bold text-white/45 sm:text-[10px]">
                    {unit}
                  </p>
                </Link>
              ) : (
                /* Empty Contender Pedestal */
                <div
                  className="relative w-full rounded-xl sm:rounded-2xl text-center min-h-[160px] sm:min-h-[185px] pt-7 pb-5 px-3 border border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center z-10"
                >
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-white/5 text-white/40"
                  >
                    #{place}
                  </span>
                  <span className="mt-3 text-xs text-white/35 font-medium">
                    Awaiting Contender
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
