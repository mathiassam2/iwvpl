import { Link } from 'react-router-dom'
import type { Leaderboard } from '@/types/site'
import { AVATAR_PLACEHOLDER, DEFAULT_PODIUM_IMAGES, cx, stripFlag } from '@/lib/format'
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
 * Features tiered Olympic pedestals (#1 distinctly highest, #2 medium, #3 lowest),
 * unmasked 360-degree ambient aura, and open container layout.
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
    <section className="relative w-full overflow-visible py-3 sm:py-6">
      {/* Stage Header Eyebrow */}
      <div className="text-center mb-4 sm:mb-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3.5 py-1 text-[10px] font-extrabold tracking-[0.18em] uppercase text-[var(--accent-text)] border border-[var(--accent-ring)]">
          ★ {board.title} PODIUM HONOURS ★
        </span>
      </div>

      {/* 3-Column Podium Stage with bottom-aligned Olympic step tiers */}
      <div className="grid grid-cols-3 items-end gap-2.5 sm:gap-4 md:gap-6 max-w-4xl mx-auto overflow-visible">
        {slots.map(({ row, place, label }) => {
          const isFirst = place === 1
          const isCustomCelebration = Boolean(
            row?.celebrationImage &&
            row.celebrationImage !== row.avatarLocal &&
            row.celebrationImage !== row.avatar &&
            !row.celebrationImage.includes('avatar-placeholder') &&
            !row.celebrationImage.includes('profile-photo-') &&
            !row.celebrationImage.includes('/assets/players/'),
          )
          const cutout = isCustomCelebration ? row!.celebrationImage! : DEFAULT_PODIUM_IMAGES[place]

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
                'relative flex flex-col items-center w-full overflow-visible',
                isFirst ? 'z-20' : 'z-10',
              )}
            >
              {/* Golden/accent ambient glow aura behind #1 champion - unmasked so it never gets cut at the top */}
              {isFirst && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-8 sm:-top-10 left-1/2 -translate-x-1/2 w-64 h-64 sm:w-80 sm:h-80 rounded-full opacity-40 blur-3xl z-0"
                  style={{
                    background:
                      'radial-gradient(circle, var(--accent-solid) 0%, rgba(200, 255, 61, 0.22) 40%, transparent 70%)',
                  }}
                />
              )}

              {/* Podium Cutout Stage - Sits cleanly behind the card */}
              <div
                className={cx(
                  'relative w-full flex items-end justify-center pointer-events-none -mb-2 sm:-mb-2.5 overflow-visible z-10',
                  isFirst
                    ? 'h-48 sm:h-56 md:h-64 max-w-[280px]'
                    : place === 2
                      ? 'h-40 sm:h-48 md:h-52 max-w-[250px]'
                      : 'h-36 sm:h-40 md:h-44 max-w-[240px]',
                )}
              >
                <img
                  src={cutout}
                  alt={row?.name || `Podium #${place}`}
                  loading="lazy"
                  decoding="async"
                  className={cx(
                    'block w-auto h-full max-w-full object-contain object-bottom drop-shadow-[0_16px_32px_rgba(0,0,0,0.9)] filter transition-transform duration-300 hover:scale-105',
                    !row && 'opacity-25',
                  )}
                />
              </div>

              {/* Pedestal Card Container (Sits in front of cutout with crisp, unclipped border) */}
              {row ? (
                <Link
                  to={playerHref(row.name)}
                  className={cx(
                    'relative w-full rounded-xl sm:rounded-2xl text-center transition-all duration-300 ease-out z-20 block',
                    'hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-solid)]',
                    isFirst
                      ? 'min-h-[210px] sm:min-h-[230px] pt-5 pb-5 px-3.5 sm:pt-6 sm:pb-6 sm:px-4.5 border border-[var(--accent-solid)]/45 shadow-[0_20px_45px_-12px_rgba(200,255,61,0.32),inset_0_1px_0_rgba(200,255,61,0.35)]'
                      : place === 2
                        ? 'min-h-[160px] sm:min-h-[178px] pt-4 pb-3.5 px-2.5 sm:pt-5 sm:pb-4 sm:px-3.5 border border-white/10 shadow-[0_14px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]'
                        : 'min-h-[130px] sm:min-h-[142px] pt-3.5 pb-3 px-2 sm:pt-4 sm:pb-3.5 sm:px-3 border border-white/10 shadow-[0_12px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]',
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
                  <div className="relative mt-2.5 flex items-center justify-center gap-1.5 px-1 min-w-0">
                    {row.avatarLocal && row.avatarLocal !== AVATAR_PLACEHOLDER && (
                      <img
                        src={row.avatarLocal}
                        alt=""
                        className={cx(
                          'rounded-full object-cover ring-1 ring-white/20 shrink-0',
                          isFirst ? 'h-5 w-5 sm:h-6 sm:w-6' : 'h-4 w-4 sm:h-4.5 sm:w-4.5',
                        )}
                      />
                    )}
                    <p
                      className={cx(
                        'truncate font-extrabold text-white',
                        isFirst
                          ? 'text-base sm:text-lg md:text-xl'
                          : place === 2
                            ? 'text-xs sm:text-sm'
                            : 'text-[11.5px] sm:text-xs',
                      )}
                      title={row.name}
                    >
                      {row.name}
                    </p>
                  </div>

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
                        ? 'text-4xl text-[var(--accent-text)] sm:text-5xl md:text-6xl drop-shadow-[0_2px_12px_rgba(200,255,61,0.35)]'
                        : place === 2
                          ? 'text-2xl text-white sm:text-3xl md:text-4xl'
                          : 'text-xl text-white sm:text-2xl md:text-3xl',
                    )}
                  >
                    {row.value}
                  </div>

                  <p className="relative mt-1 text-[9px] uppercase tracking-[0.2em] font-bold text-white/45 sm:text-[10px]">
                    {unit}
                  </p>
                </Link>
              ) : (
                /* Empty Contender Pedestal with matching tier heights */
                <div
                  className={cx(
                    'relative w-full rounded-xl sm:rounded-2xl text-center border border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center z-20',
                    isFirst
                      ? 'min-h-[225px] sm:min-h-[245px] pt-8 pb-6 px-3.5'
                      : place === 2
                        ? 'min-h-[170px] sm:min-h-[188px] pt-6 pb-4 px-2.5'
                        : 'min-h-[135px] sm:min-h-[150px] pt-5 pb-3.5 px-2',
                  )}
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
