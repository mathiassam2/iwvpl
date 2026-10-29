import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { ApiError, changePassword, checkGamertagAvailability, updateMyPlayerProfile } from '@/lib/api'
import { cx } from '@/lib/format'

interface AccountSettingsModalProps {
  open: boolean
  onClose: () => void
  initialTab?: 'gamertag' | 'password'
}

export function AccountSettingsModal({ open, onClose, initialTab = 'gamertag' }: AccountSettingsModalProps) {
  const { user, refresh } = useAuth()
  const [tab, setTab] = useState<'gamertag' | 'password'>(initialTab)

  // Gamertag state
  const [gamertag, setGamertag] = useState(user?.gamertag || user?.name || '')
  const [tagStatus, setTagStatus] = useState<{
    checking: boolean
    available?: boolean
    reason?: string
    isCurrent?: boolean
  }>({ checking: false })
  const [tagBusy, setTagBusy] = useState(false)
  const [tagNotice, setTagNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Password state
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const [pwNotice, setPwNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Prevent background scroll and bind Escape key when modal is open
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

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
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setGamertag(user?.gamertag || user?.name || '')
      setTagStatus({ checking: false })
      setTagNotice(null)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setPwNotice(null)
      setTab(initialTab)
    }
  }, [open, user, initialTab])

  // Debounced gamertag availability check
  useEffect(() => {
    const clean = gamertag.trim()
    if (!clean || clean.length < 2) {
      setTagStatus({ checking: false })
      return
    }

    if (user?.gamertag && clean === user.gamertag) {
      setTagStatus({ checking: false, available: true, isCurrent: true })
      return
    }

    if (user?.gamertag && clean.toLowerCase() === user.gamertag.toLowerCase()) {
      setTagStatus({ checking: false, available: true, isCurrent: false })
      return
    }

    setTagStatus({ checking: true })
    const timer = setTimeout(async () => {
      try {
        const res = await checkGamertagAvailability(clean)
        setTagStatus({ checking: false, available: res.available, reason: res.reason, isCurrent: res.isCurrent })
      } catch {
        setTagStatus({ checking: false })
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [gamertag, user])

  if (!open) return null

  const handleUpdateGamertag = async (e: FormEvent) => {
    e.preventDefault()
    const clean = gamertag.trim()
    if (!clean) return

    setTagBusy(true)
    setTagNotice(null)

    try {
      await updateMyPlayerProfile({ gamertag: clean })
      await refresh()
      setTagNotice({ kind: 'ok', text: `Gamertag successfully changed to "${clean}".` })
    } catch (err) {
      setTagNotice({ kind: 'err', text: err instanceof ApiError ? err.message : 'Failed to update gamertag.' })
    } finally {
      setTagBusy(false)
    }
  }

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentPw) {
      setPwNotice({ kind: 'err', text: 'Enter your current password.' })
      return
    }
    if (!newPw || newPw.length < 8) {
      setPwNotice({ kind: 'err', text: 'New password must be at least 8 characters.' })
      return
    }
    if (newPw !== confirmPw) {
      setPwNotice({ kind: 'err', text: 'New passwords do not match.' })
      return
    }

    setPwBusy(true)
    setPwNotice(null)

    try {
      await changePassword(currentPw, newPw)
      setPwNotice({ kind: 'ok', text: 'Password successfully changed!' })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setPwNotice({ kind: 'err', text: err instanceof ApiError ? err.message : 'Failed to update password.' })
    } finally {
      setPwBusy(false)
    }
  }

  const inputClass =
    'h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text-strong)] ' +
    'placeholder:text-[var(--text-faint)] outline-none transition-colors focus:border-[var(--accent-ring)]'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-settings-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-[fadeIn_.15s_ease-out]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative my-auto w-full max-w-lg rounded-card border border-[var(--border-strong)] bg-[#12141a] p-6 shadow-2xl sm:p-7">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 id="account-settings-title" className="text-xl font-extrabold text-[var(--text-strong)]">
              Account Settings
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Manage your EA gamertag, profile details, and account security.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
          >
            ✕
          </button>
        </div>

        {/* Tab switch */}
        <div className="mt-4 flex gap-2 border-b border-[var(--border)] pb-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setTab('gamertag')}
            className={cx(
              'rounded-lg px-3.5 py-1.5 transition-colors',
              tab === 'gamertag'
                ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-white',
            )}
          >
            Gamertag & Profile
          </button>
          <button
            type="button"
            onClick={() => setTab('password')}
            className={cx(
              'rounded-lg px-3.5 py-1.5 transition-colors',
              tab === 'password'
                ? 'bg-[var(--accent-solid)] text-[var(--on-volt)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-white',
            )}
          >
            Change Password
          </button>
        </div>

        {/* Tab 1: Gamertag */}
        {tab === 'gamertag' && (
          <form onSubmit={handleUpdateGamertag} className="mt-5 space-y-4">
            {tagNotice && (
              <div
                className={cx(
                  'rounded-lg px-3.5 py-2.5 text-xs font-semibold',
                  tagNotice.kind === 'ok'
                    ? 'border border-[var(--accent-ring)]/40 bg-[var(--accent-tint)] text-[var(--accent-text)]'
                    : 'border border-[var(--danger-text)]/40 bg-[var(--danger-text)]/10 text-[var(--danger-text)]',
                )}
              >
                {tagNotice.text}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="settings-gamertag"
                  className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]"
                >
                  EA ID / Gamertag
                </label>
                {tagStatus.checking && (
                  <span className="text-[11px] text-[var(--text-muted)] animate-pulse">Checking availability…</span>
                )}
                {!tagStatus.checking && tagStatus.available && tagStatus.isCurrent && (
                  <span className="text-[11px] text-[var(--text-muted)]">Current gamertag</span>
                )}
                {!tagStatus.checking && tagStatus.available && !tagStatus.isCurrent && (
                  <span className="text-[11px] font-bold text-emerald-400">✓ Available</span>
                )}
                {!tagStatus.checking && tagStatus.available === false && (
                  <span className="text-[11px] font-bold text-rose-400">✗ {tagStatus.reason || 'Taken'}</span>
                )}
              </div>
              <input
                id="settings-gamertag"
                type="text"
                required
                minLength={2}
                maxLength={32}
                value={gamertag}
                onChange={(e) => {
                  setGamertag(e.target.value)
                  setTagNotice(null)
                }}
                placeholder="e.g. ProStriker_99"
                className={inputClass}
              />
              <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">
                This is your in-game EA ID shown on rosters, transfer lists, match sheets, and leaderboards.
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)]">
              <span className="font-bold text-[var(--text-strong)]">Note:</span> Changing your gamertag will
              update your name across your squad and historical stats immediately.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <Button
                type="submit"
                size="md"
                className="font-bold"
                disabled={tagBusy || tagStatus.checking || tagStatus.available === false || tagStatus.isCurrent}
              >
                {tagBusy ? 'Saving…' : 'Save Gamertag'}
              </Button>
            </div>
          </form>
        )}

        {/* Tab 2: Password */}
        {tab === 'password' && (
          <form onSubmit={handleUpdatePassword} className="mt-5 space-y-4">
            {pwNotice && (
              <div
                className={cx(
                  'rounded-lg px-3.5 py-2.5 text-xs font-semibold',
                  pwNotice.kind === 'ok'
                    ? 'border border-[var(--accent-ring)]/40 bg-[var(--accent-tint)] text-[var(--accent-text)]'
                    : 'border border-[var(--danger-text)]/40 bg-[var(--danger-text)]/10 text-[var(--danger-text)]',
                )}
              >
                {pwNotice.text}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="settings-current-pw"
                  className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]"
                >
                  Current Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-strong)]"
                >
                  {showCurrentPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="settings-current-pw"
                type={showCurrentPw ? 'text' : 'password'}
                required
                value={currentPw}
                onChange={(e) => {
                  setCurrentPw(e.target.value)
                  setPwNotice(null)
                }}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="settings-new-pw"
                  className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]"
                >
                  New Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-strong)]"
                >
                  {showNewPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="settings-new-pw"
                type={showNewPw ? 'text' : 'password'}
                required
                minLength={8}
                value={newPw}
                onChange={(e) => {
                  setNewPw(e.target.value)
                  setPwNotice(null)
                }}
                placeholder="At least 8 characters"
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="settings-confirm-pw"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]"
              >
                Confirm New Password
              </label>
              <input
                id="settings-confirm-pw"
                type={showNewPw ? 'text' : 'password'}
                required
                value={confirmPw}
                onChange={(e) => {
                  setConfirmPw(e.target.value)
                  setPwNotice(null)
                }}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <Button type="submit" size="md" className="font-bold" disabled={pwBusy || !currentPw || !newPw}>
                {pwBusy ? 'Updating…' : 'Update Password'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
