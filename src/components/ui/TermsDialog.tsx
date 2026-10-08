import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui'
import { cx } from '@/lib/format'

export interface TermsSection {
  heading: string
  body: ReactNode
}

/**
 * Accessible modal used for the entry terms.
 *
 * Closes on Escape and on backdrop click, moves focus in on open, traps it
 * while open, and restores focus to the trigger on close.
 */
export function TermsDialog({
  open,
  onClose,
  title,
  sections,
}: {
  open: boolean
  onClose: () => void
  title: string
  sections: TermsSection[]
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      restoreTo.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden',
          'rounded-t-card sm:rounded-card border border-[var(--border-strong)]',
          'bg-[var(--bg-raised)] shadow-[var(--shadow-lift)]',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <h2 className="font-display text-xl font-bold text-[var(--text-strong)]">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--border-strong)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-7">
            {sections.map((s) => (
              <section key={s.heading}>
                <h3 className="text-sm font-bold text-[var(--text-strong)]">{s.heading}</h3>
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>

        <footer className="border-t border-[var(--border)] bg-[var(--surface-2)] px-6 py-4">
          <Button onClick={onClose} className="w-full sm:w-auto">
            I have read the terms
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
