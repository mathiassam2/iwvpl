import { cx } from '@/lib/format'

/**
 * Ambient wash for any page that opens directly under the fixed header.
 *
 * The header is deliberately bare at rest and only frosts on scroll or hover.
 * That only reads correctly when there is something behind the bar - pulled up
 * under it, carrying texture rather than a flat fill. A page that starts on
 * `var(--bg)` shows nothing through the bar and it reads as a solid strip.
 *
 * Every page-top band uses this, so the treatment cannot drift apart again.
 * The parent must be positioned; `Section` and `PageHeader` already are.
 */
export function HeaderWash({ className }: { className?: string }) {
  return (
    <>
      <div
        aria-hidden
        data-parallax="0.22"
        className={cx(
          'parallax-layer pointer-events-none absolute inset-0 bg-grid opacity-60',
          className,
        )}
      />
      <div
        aria-hidden
        data-parallax="0.34"
        className="parallax-layer pointer-events-none absolute inset-0 bg-radial-volt"
      />
    </>
  )
}