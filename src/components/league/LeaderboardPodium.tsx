import type { Leaderboard } from '@/types/site'
import { AVATAR_PLACEHOLDER, cx, stripFlag } from '@/lib/format'

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
    { row: second, place: 2 },
    { row: first, place: 1 },
    { row: third, place: 3 },
  ]

  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
      {slots.map(({ row, place }) => {
        if (!row) return <div key={place} aria-hidden />

        const isFirst = place === 1
        return (
          <div
            key={place}
            className={cx(
              'surface relative overflow-hidden rounded-card px-2 pb-4 pt-5 text-center sm:px-4 sm:pb-5',
              'transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1',
              isFirst
                ? 'order-2 sm:order-none border-[var(--accent-ring)] shadow-[0_18px_44px_-22px_rgb(200_255_61/0.55)]'
                : 'order-1 sm:order-none',
            )}
          >
            {isFirst && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-10 h-24 bg-[var(--accent-tint)] blur-2xl"
              />
            )}

            <span
              className={cx(
                'relative mx-auto grid place-items-center rounded-full font-display font-bold',
                isFirst
                  ? 'h-11 w-11 text-base sm:h-14 sm:w-14'
                  : 'h-9 w-9 text-sm sm:h-11 sm:w-11',
              )}
              style={{
                background: isFirst
                  ? 'linear-gradient(135deg,#ffd75e,#e8a317)'
                  : place === 2
                    ? 'linear-gradient(135deg,#e6e9ef,#a8b0bd)'
                    : 'linear-gradient(135deg,#e0a273,#b87333)',
                color: '#1a1200',
                boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.45)',
              }}
            >
              {place}
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
          </div>
        )
      })}
    </div>
  )
}