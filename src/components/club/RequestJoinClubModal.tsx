import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button, SmartImage } from '@/components/ui'
import { CLUB_PLACEHOLDER, cx } from '@/lib/format'
import { requestJoinClub } from '@/lib/api'

export interface RequestJoinClubModalProps {
  open: boolean
  onClose: () => void
  club: {
    id: number
    name: string
    logo?: string | null
    slug?: string
  }
  onSuccess?: () => void
}

export function RequestJoinClubModal({
  open,
  onClose,
  club,
  onSuccess,
}: RequestJoinClubModalProps) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const timer = setTimeout(() => {
      textareaRef.current?.focus()
    }, 60)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [open, onClose])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)

    try {
      await requestJoinClub(club.id, message.trim() || null)
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not submit join request.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-0 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-club-title"
        className={cx(
          'relative z-10 flex flex-col w-full max-w-lg',
          'rounded-t-2xl sm:rounded-2xl border border-[var(--border-strong)]',
          'bg-[var(--bg-raised)] shadow-2xl overflow-hidden',
        )}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <SmartImage
              src={club.logo || CLUB_PLACEHOLDER}
              fallback={CLUB_PLACEHOLDER}
              alt=""
              wrapperClassName="h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-hover)] border border-[var(--border)]"
              className="h-full w-full object-cover"
            />
            <div className="min-w-0">
              <span className="rounded bg-[var(--accent-tint)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                Application
              </span>
              <h2 id="join-club-title" className="font-display text-lg font-bold text-[var(--text-strong)] truncate">
                Request to Join {club.name}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
          >
            ✕
          </button>
        </header>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-300">
              ⚠ {error}
            </div>
          )}

          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Your application will be sent directly to the manager of <strong className="text-[var(--text-strong)]">{club.name}</strong>. If accepted, you will be officially signed to their squad roster.
          </p>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-[var(--text-strong)]">
              Message to Manager <span className="text-[var(--text-muted)] font-normal">(Optional)</span>
            </span>
            <textarea
              ref={textareaRef}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell the manager your primary positions (e.g. ST, CAM, CB), play style, or weekly availability..."
              maxLength={255}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent-text)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            />
            <span className="block text-right text-[10px] text-[var(--text-faint)]">
              {message.length} / 255
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--border)]">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="gap-1.5 font-bold shadow-md">
              {busy ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                  Sending...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  Submit Request
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
