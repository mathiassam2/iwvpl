import { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Button, SmartImage } from '@/components/ui'
import { AVATAR_PLACEHOLDER, cx } from '@/lib/format'
import { searchPlayers, sendOffer } from '@/lib/api'

export interface SignPlayerModalProps {
  open: boolean
  onClose: () => void
  onOfferSent?: (playerId: number, gamertag: string) => void
  squadPlayerIds?: Set<number>
}

type FoundPlayer = Awaited<ReturnType<typeof searchPlayers>>['players'][number] & {
  user_id?: number | null
}

export function SignPlayerModal({
  open,
  onClose,
  onOfferSent,
  squadPlayerIds = new Set(),
}: SignPlayerModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoundPlayer[]>([])
  const [loading, setLoading] = useState(false)
  const [offeringId, setOfferingId] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'free_agents' | 'registered'>('all')
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const modalPanelRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Lock body scroll and focus input when modal opens
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus search input
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 60)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timer)
    }
  }, [open, onClose])

  // Initial fetch of available players when opened
  useEffect(() => {
    if (!open) return
    let active = true

    const fetchInitial = async () => {
      setLoading(true)
      try {
        const data = await searchPlayers('')
        if (active) {
          setResults(data.players)
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false)
      }
    }

    void fetchInitial()

    return () => {
      active = false
    }
  }, [open])

  // Live debounced search as user types
  useEffect(() => {
    if (!open) return

    // Cancel in-flight request if user keeps typing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchPlayers(query.trim(), controller.signal)
        setResults(data.players)
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          // Non-abort error
        }
      } finally {
        setLoading(false)
      }
    }, 220)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, open])

  // Handle contract offer
  const handleOffer = async (player: FoundPlayer) => {
    if (offeringId !== null) return
    setOfferingId(player.id)
    setToast(null)

    try {
      await sendOffer(player.id, null, null)
      // Optimistically update player row to show as pending
      setResults((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, pending_id: 1 } : p)),
      )
      setToast({
        kind: 'ok',
        message: `Contract offer sent to ${player.gamertag}! They'll see it in their notifications.`,
      })
      onOfferSent?.(player.id, player.gamertag)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not send offer.'
      setToast({ kind: 'error', message: msg })
    } finally {
      setOfferingId(null)
    }
  }

  // Filtered results
  const filtered = useMemo(() => {
    return results.filter((p) => {
      if (filter === 'free_agents') return !p.club_id
      if (filter === 'registered') return Boolean(p.user_id)
      return true
    })
  }, [results, filter])

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
        ref={modalPanelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-player-title"
        className={cx(
          'relative z-10 flex flex-col w-full max-w-2xl max-h-[92dvh] sm:max-h-[85vh]',
          'rounded-t-2xl sm:rounded-2xl border border-[var(--border-strong)]',
          'bg-[var(--bg-raised)] shadow-2xl overflow-hidden',
        )}
      >
        {/* Header */}
        <header className="relative flex items-center justify-between border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-[var(--accent-tint)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                Recruitment
              </span>
              <span className="text-xs text-[var(--text-muted)]">Live Search</span>
            </div>
            <h2 id="sign-player-title" className="font-display text-lg sm:text-xl font-bold text-[var(--text-strong)] mt-0.5">
              Sign a Player
            </h2>
            <p className="text-xs text-[var(--text-muted)] line-clamp-1 mt-0.5">
              Search by gamertag to recruit free agents and signed players to your club.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* Search Bar & Filters */}
        <div className="border-b border-[var(--border)] bg-[var(--surface)] p-4 sm:px-6 sm:py-3.5 space-y-3">
          <div className="relative flex items-center">
            {/* Search Icon / Spinner */}
            <div className="pointer-events-none absolute left-3.5 flex items-center text-[var(--text-muted)]">
              {loading ? (
                <svg className="animate-spin h-4 w-4 text-[var(--accent-text)]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </div>

            {/* Live Search Input */}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by gamertag (e.g. Haaland, Ballotz, Alex...)"
              maxLength={80}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-2.5 pl-10 pr-10 text-sm font-medium text-[var(--text-strong)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent-text)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            />

            {/* Clear button */}
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                className="absolute right-3 grid h-5 w-5 place-items-center rounded-full bg-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto text-xs scrollbar-none pb-0.5">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] shrink-0 mr-1">Filter:</span>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={cx(
                'rounded-lg px-2.5 py-1 font-semibold transition-all shrink-0',
                filter === 'all'
                  ? 'bg-[var(--accent-tint)] text-[var(--accent-text)] font-bold'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]',
              )}
            >
              All Players ({results.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('free_agents')}
              className={cx(
                'rounded-lg px-2.5 py-1 font-semibold transition-all shrink-0 flex items-center gap-1',
                filter === 'free_agents'
                  ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]',
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Free Agents Only ({results.filter((p) => !p.club_id).length})
            </button>
          </div>
        </div>

        {/* Toast / Notification Banner */}
        {toast && (
          <div
            className={cx(
              'flex items-center justify-between gap-3 px-5 py-2.5 text-xs font-semibold',
              toast.kind === 'ok'
                ? 'bg-emerald-500/15 text-emerald-300 border-b border-emerald-500/25'
                : 'bg-red-500/15 text-red-300 border-b border-red-500/25',
            )}
          >
            <div className="flex items-center gap-2">
              <span>{toast.kind === 'ok' ? '✓' : '⚠'}</span>
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Results List */}
        <div className="scroll-slim min-h-[220px] max-h-[50vh] sm:max-h-[55vh] flex-1 overflow-y-auto px-4 py-2 sm:px-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--text-muted)]">
              {loading ? (
                <div className="space-y-2">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-[var(--accent-text)] border-r-transparent" />
                  <p className="text-xs">Searching players...</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-w-sm">
                  <p className="font-semibold text-[var(--text-strong)]">No matching players found</p>
                  <p className="text-xs">
                    {query.trim()
                      ? `No players matched "${query.trim()}". Try searching a different gamertag.`
                      : 'No players available under the selected filter.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {filtered.map((p) => {
                const inCurrentSquad = squadPlayerIds.has(p.id)
                const isPending = Boolean(p.pending_id)
                const isOffering = offeringId === p.id

                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    {/* Left: Avatar + Details */}
                    <div className="flex items-center gap-3 min-w-0">
                      <SmartImage
                        src={p.avatar_local || AVATAR_PLACEHOLDER}
                        fallback={AVATAR_PLACEHOLDER}
                        alt=""
                        wrapperClassName="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-[var(--surface-hover)] border border-[var(--border)]"
                        className="h-full w-full object-cover"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/players/${p.slug}`}
                            target="_blank"
                            className="truncate text-sm font-bold text-[var(--text-strong)] hover:text-[var(--accent-text)] transition-colors"
                            title="Open player profile in new tab"
                          >
                            {p.gamertag}
                          </Link>
                          {p.user_id && (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
                              Registered
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-0.5">
                          {p.club_name ? (
                            <span className="truncate">Current club: <strong className="text-[var(--text-strong)] font-medium">{p.club_name}</strong></span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              Free Agent
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Action */}
                    <div className="shrink-0 pl-2">
                      {inCurrentSquad ? (
                        <span className="rounded-lg bg-[var(--surface-hover)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)]">
                          In Your Squad
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-tint)] px-2.5 py-1 text-xs font-bold text-[var(--accent-text)]">
                          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
                            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
                            <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          Offer Pending
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          disabled={isOffering}
                          onClick={() => void handleOffer(p)}
                          className="gap-1 font-bold shadow-sm"
                        >
                          {isOffering ? (
                            <>
                              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                              Offering...
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
                                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                              </svg>
                              Offer Contract
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3 sm:px-6">
          <p className="text-[11px] text-[var(--text-muted)]">
            Offers are delivered directly to the player's inbox. You can manage or cancel them in your <strong className="text-[var(--text-strong)]">Outbox</strong>.
          </p>
          <Button variant="outline" size="sm" onClick={onClose} className="shrink-0">
            Done
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
