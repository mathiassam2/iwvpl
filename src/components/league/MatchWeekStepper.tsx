import { useEffect, useRef, useState } from 'react'
import type { WeekGroup } from '@/lib/matchWeeks'

interface MatchWeekStepperProps {
  weeks: WeekGroup[]
  selectedWeekId: string
  onSelectWeek: (weekId: string) => void
  totalMatches: number
}

export function MatchWeekStepper({
  weeks,
  selectedWeekId,
  onSelectWeek,
  totalMatches,
}: MatchWeekStepperProps) {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const numberedWeeks = weeks.filter((w) => w.weekNum !== null)
  const activeWeekGroup = weeks.find((w) => w.id === selectedWeekId)
  const activeIndex = numberedWeeks.findIndex((w) => w.id === selectedWeekId)

  const prevWeek = activeIndex > 0 ? numberedWeeks[activeIndex - 1] : null
  const nextWeek =
    activeIndex !== -1 && activeIndex < numberedWeeks.length - 1
      ? numberedWeeks[activeIndex + 1]
      : null

  // Close dropdown on outside click or escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelect = (id: string) => {
    onSelectWeek(id)
    setIsOpen(false)
  }

  return (
    <div className="relative mx-auto mb-8 w-full max-w-xl">
      {/* Top Header Label */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">
          Match Week Navigation
        </span>
        {activeWeekGroup && selectedWeekId !== 'all' ? (
          <span className="text-xs font-medium text-[var(--accent-text)]">
            {activeWeekGroup.dateRange}
          </span>
        ) : (
          <span className="text-xs font-medium text-[var(--text-muted)]">
            All {totalMatches} Fixtures
          </span>
        )}
      </div>

      {/* Main Stepper Navigation Bar */}
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2 shadow-sm sm:gap-3 sm:p-2.5">
        {/* Previous Week Button */}
        <button
          type="button"
          onClick={() => prevWeek && handleSelect(prevWeek.id)}
          disabled={!prevWeek}
          aria-label="Previous match week"
          className="group flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-xs font-bold text-[var(--text-strong)] transition-all hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] disabled:pointer-events-none disabled:opacity-30 sm:px-4"
        >
          <span className="text-sm transition-transform group-hover:-translate-x-0.5">←</span>
          <span className="hidden sm:inline">
            {prevWeek ? (prevWeek.weekNum ? `Week ${prevWeek.weekNum}` : 'Prev') : 'Prev'}
          </span>
        </button>

        {/* Central Dropdown Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-3 py-1.5 text-left transition-all sm:px-4 sm:py-2 ${
            isOpen
              ? 'border-[var(--accent-ring)] bg-[var(--surface-3)] shadow-[0_0_15px_rgba(200,255,61,0.08)]'
              : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]'
          }`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            {/* Week Badge */}
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-extrabold ${
                selectedWeekId === 'all'
                  ? 'bg-[var(--border-strong)] text-[var(--text-strong)]'
                  : 'bg-[var(--accent-tint)] text-[var(--accent-text)]'
              }`}
            >
              {selectedWeekId === 'all'
                ? 'ALL'
                : activeWeekGroup?.weekNum
                  ? `W${activeWeekGroup.weekNum}`
                  : '—'}
            </span>

            {/* Title & Dates */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-xs font-extrabold text-[var(--text-strong)] sm:text-sm">
                  {selectedWeekId === 'all' ? 'All Matchweeks' : activeWeekGroup?.label ?? 'Select Week'}
                </h3>
              </div>
              <p className="truncate text-[11px] text-[var(--text-muted)] sm:text-xs">
                {selectedWeekId === 'all'
                  ? 'Showing full season schedule'
                  : activeWeekGroup?.dateRange ?? 'Pick a matchweek'}
              </p>
            </div>
          </div>

          {/* Right Action Info */}
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] border border-[var(--border)] md:inline-block">
              {selectedWeekId === 'all'
                ? `${totalMatches} matches`
                : `${activeWeekGroup?.matches.length ?? 0} matches`}
            </span>
            <span
              className={`text-xs text-[var(--text-muted)] transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-[var(--accent-text)]' : ''
              }`}
            >
              ▼
            </span>
          </div>
        </button>

        {/* Next Week Button */}
        <button
          type="button"
          onClick={() => nextWeek && handleSelect(nextWeek.id)}
          disabled={!nextWeek}
          aria-label="Next match week"
          className="group flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-xs font-bold text-[var(--text-strong)] transition-all hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] disabled:pointer-events-none disabled:opacity-30 sm:px-4"
        >
          <span className="hidden sm:inline">
            {nextWeek ? (nextWeek.weekNum ? `Week ${nextWeek.weekNum}` : 'Next') : 'Next'}
          </span>
          <span className="text-sm transition-transform group-hover:translate-x-0.5">→</span>
        </button>
      </div>

      {/* Dropdown Quick Jump Menu Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-1)] p-4 shadow-2xl backdrop-blur-xl sm:p-5"
        >
          {/* Header & All Weeks Shortcut */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">
              Jump to Matchweek
            </span>
            <button
              type="button"
              onClick={() => handleSelect('all')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                selectedWeekId === 'all'
                  ? 'border border-[var(--accent-ring)] bg-[var(--accent-tint)] text-[var(--accent-text)]'
                  : 'border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)]'
              }`}
            >
              All Matchweeks ({totalMatches})
            </button>
          </div>


          {/* Detailed Scrollable List */}
          <div>
            <span className="mb-2 block text-[11px] font-semibold text-[var(--text-muted)]">
              Detailed Matchweeks Schedule:
            </span>
            <div className="no-scrollbar max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {weeks.map((w) => {
                const isSelected = selectedWeekId === w.id
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleSelect(w.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-all ${
                      isSelected
                        ? 'border border-[var(--accent-ring)] bg-[var(--accent-tint)] text-[var(--accent-text)]'
                        : 'border border-transparent bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-3)] hover:text-[var(--text-strong)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`grid h-6 w-6 place-items-center rounded text-[11px] font-bold ${
                          isSelected
                            ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                            : 'bg-[var(--border-strong)] text-[var(--text-faint)]'
                        }`}
                      >
                        {w.weekNum ? `W${w.weekNum}` : '—'}
                      </span>
                      <div>
                        <strong className="block font-bold text-[var(--text-strong)]">
                          {w.label}
                        </strong>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {w.dateRange}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[var(--surface-1)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] border border-[var(--border)]">
                        {w.matches.length} fixtures
                      </span>
                      {isSelected && (
                        <span className="text-xs font-bold text-[var(--accent-text)]">
                          ✓
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
