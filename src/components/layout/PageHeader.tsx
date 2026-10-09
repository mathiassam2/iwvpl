import type { ReactNode } from 'react'
import { Container, Eyebrow } from '@/components/ui'

export function PageHeader({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string
  title: string
  lede?: string
  children?: ReactNode
}) {
  return (
    /* Pulled behind the fixed header the same way the home page's hero is
       (`-mt-16`/`lg:-mt-[72px]`), with the same space handed back as padding so
       the content still clears it. Without this, non-home pages started below
       the header on a flat page background, so a correctly-transparent bar
       looked like a solid strip instead of a pane over content. */
    <section className="relative -mt-16 overflow-hidden border-b border-[var(--border)] pt-16 lg:-mt-[72px] lg:pt-[72px]">
      {/* parallax ambient wash — the layer drifts slower than the page */}
      <div
        aria-hidden
        data-parallax="0.22"
        className="parallax-layer pointer-events-none absolute inset-0 bg-grid opacity-60"
      />
      <div
        aria-hidden
        data-parallax="0.34"
        className="parallax-layer pointer-events-none absolute inset-0 bg-radial-volt"
      />
      <Container size="wide" className="relative pb-14 sm:pb-16 lg:pb-20 pt-4">
        <div className="max-w-3xl">
          <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
          <h1 className="text-4xl font-extrabold sm:text-5xl lg:text-[3.5rem]">{title}</h1>
          {lede && (
            <p className="mt-5 text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
              {lede}
            </p>
          )}
          {children}
        </div>
      </Container>
    </section>
  )
}