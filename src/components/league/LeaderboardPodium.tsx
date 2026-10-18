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
        className={isFirst ? 'h-5 w-5 sm:h-6 sm:w-6' : 'h-4 w-4 sm:h-5 sm:w-5'}
      >
        <path
          d="M6 3h12v5a6 6 0 0 1-12 0V3Z"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M18 5h2a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4M12 14v4M8 21h8M9.5 18h5"
          stroke="currentColor"
          strokeWidth="1.9"
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
      className="h-4 w-4 sm:h-5 sm:w-5"
    >
      <path
        d="M8.5 3h3l1.5 4.5M15.5 3h-3L11 7.5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="14.5"
        r="6"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.85"
      />
      <text
        x="12"
        y="16.8"
        textAnchor="middle"
        fill="currentColor"
        fontSize="7.5"
        fontWeight="800"
      >
        {place}
      </text>
    </svg>
  )
}

/**
 * Top-three showcase. 1st is elevated centre, 2nd left, 3rd right.
 * The remaining rows are rendered separately by LeaderboardTable.
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
    { row: second, place: 2, label: '1st Runner-Up' },
    { row: first, place: 1, label: 'Champion' },
    { row: third, place: 3, label: '2nd Runner-Up' },
  ]

  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
      {slots.map(({ row, place }) => {
        if (!row) return <div key={place} aria-hidden />

        const isFirst = place === 1
        return (
          <Link
            key={place}
            to={playerHref(row.name)}
            className={cx(
              'surface relative overflow-hidden rounded-card px-2 pb-4 pt-5 text-center sm:px-4 sm:pb-5',
              'transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 focus-visible:-translate-y-1',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-solid)]',
              isFirst &&
                'border-[var(--accent-ring)] pb-5 pt-6 sm:pb-6 sm:pt-7 shadow-[0_18px_44px_-22px_rgb(200_255_61/0.55)]',
            )}
          >
            {isFirst && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-10 h-24 bg-[var(--accent-tint)] blur-2xl"
              />
            )}

            <span
              aria-label={`Rank ${place}`}
              className={cx(
                'relative mx-auto inline-flex items-center justify-center gap-1 rounded-full font-display font-extrabold',
                isFirst
                  ? 'h-11 px-3 text-sm sm:h-12 sm:px-3.5 sm:text-base'
                  : 'h-9 px-2.5 text-xs sm:h-10 sm:px-3 sm:text-sm',
              )}
              style={{
                background: isFirst
                  ? 'linear-gradient(135deg,#ffe27a,#e8a317)'
                  : place === 2
                    ? 'linear-gradient(135deg,#eef1f6,#9ea7b8)'
                    : 'linear-gradient(135deg,#e7af82,#b87333)',
                color: '#1a1200',
                boxShadow:
                  'inset 0 1px 0 rgb(255 255 255 / 0.55), 0 6px 16px -6px rgb(0 0 0 / 0.45)',
              }}
            >
              <PodiumAwardIcon place={place} isFirst={isFirst} />
              <span>#{place}</span>
            </span>

            <div className="relative mx-auto mt-3 w-fit">
              <span
                className={cx(
                  'block overflow-hidden rounded-full ring-2',
                  isFirst
                    ? 'h-16 w-16 ring-[var(--accent-ring)] sm:h-20 sm:w-20'
                    : 'h-11 w-11 ring-[var(--border-strong)] sm:h-14 sm:w-14',
                )}
              >
                <img
                  src={row.avatarLocal || AVATAR_PLACEHOLDER}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </span>
            </div>

            <p
              className={cx(
                'relative mt-3 truncate font-semibold text-[var(--text-strong)]',
                isFirst ? 'text-sm sm:text-base' : 'text-xs sm:text-sm',
              )}
              title={row.name}
            >
              {row.name}
            </p>

            <p className="relative mt-0.5 flex items-center justify-center gap-1 truncate text-[10px] text-[var(--text-muted)] sm:text-[11px]">
              <span aria-hidden>{row.team_flag}</span>
              <span className="truncate">{stripFlag(row.team)}</span>
            </p>

            <p
              className={cx(
                'numeric relative mt-2 font-bold leading-none',
                isFirst
                  ? 'text-3xl text-[var(--accent-text)] sm:text-4xl'
                  : 'text-xl text-[var(--text)] sm:text-2xl',
              )}
            >
              {row.value}
            </p>
            <p className="relative mt-1 text-[9px] uppercase tracking-[0.16em] text-[var(--text-faint)] sm:text-[10px]">
              {unit}
            </p>
          </Link>
        )
      })}
    </div>
  )
}