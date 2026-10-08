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
    <section className="relative overflow-hidden border-b border-[var(--border)]">
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
      <Container size="wide" className="relative py-14 sm:py-16 lg:py-20">
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