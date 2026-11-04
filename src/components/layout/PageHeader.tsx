import type { ReactNode } from 'react'
import { Container, Eyebrow } from '@/components/ui'
import { HeaderWash } from '@/components/layout/HeaderWash'

export function PageHeader({
  eyebrow,
  title,
  lede,
  action,
  children,
}: {
  eyebrow: string
  title: string
  lede?: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    /* Pulled behind the fixed header the same way the home page's hero is
       (`-mt-16`/`lg:-mt-[72px]`), with the same space handed back as padding so
       the content still clears it. Without this, non-home pages started below
       the header on a flat page background, so a correctly-transparent bar
       looked like a solid strip instead of a pane over content. */
    <section className="relative -mt-16 overflow-hidden border-b border-[var(--border)] pt-16 lg:-mt-[72px] lg:pt-[72px]">
      <HeaderWash />
      <Container size="wide" className="relative pb-10 sm:pb-12 lg:pb-14 pt-4">
        <div className={action ? 'flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between' : 'max-w-3xl'}>
          <div className="max-w-3xl">
            <Eyebrow className="mb-4">{eyebrow}</Eyebrow>
            <h1 className="text-4xl font-extrabold sm:text-5xl lg:text-[3.25rem]">{title}</h1>
            {lede && (
              <p className="mt-3 text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
                {lede}
              </p>
            )}
            {children}
          </div>
          {action && <div className="shrink-0 lg:pb-1">{action}</div>}
        </div>
      </Container>
    </section>
  )
}
