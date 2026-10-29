import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui'
import { HeaderWash } from '@/components/layout/HeaderWash'
import { ApiError, resetPassword, verifyResetToken } from '@/lib/api'
import { cx } from '@/lib/format'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [verifying, setVerifying] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setVerifying(false)
      setTokenValid(false)
      setTokenError('No reset token provided. Please use the link sent to your email.')
      return
    }

    let active = true
    void (async () => {
      try {
        await verifyResetToken(token)
        if (active) {
          setTokenValid(true)
        }
      } catch (err) {
        if (active) {
          setTokenValid(false)
          setTokenError(
            err instanceof ApiError ? err.message : 'This reset link is invalid or has expired.',
          )
        }
      } finally {
        if (active) setVerifying(false)
      }
    })()

    return () => {
      active = false
    }
  }, [token])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const nextErrors: typeof errors = {}

    if (!password) {
      nextErrors.password = 'Enter a new password.'
    } else if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.'
    }

    if (!confirmPassword) {
      nextErrors.confirm = 'Confirm your new password.'
    } else if (password !== confirmPassword) {
      nextErrors.confirm = 'Passwords do not match.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setBusy(true)
    setFormError(null)

    try {
      await resetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not reset password. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text-strong)] ' +
    'placeholder:text-[var(--text-faint)] outline-none transition-colors focus:border-[var(--accent-ring)]'

  return (
    <div className="page-enter">
      <div className="relative -mt-16 lg:-mt-[72px]">
        <HeaderWash />
        <div className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-md flex-col justify-center px-5 pb-16 pt-28 sm:px-6">
          <div className="w-full">
            <h1 className="text-3xl font-extrabold sm:text-4xl">Reset Password</h1>
            <p className="mt-2.5 text-[15px] text-[var(--text-muted)]">
              Choose a secure new password for your IWVPL account.
            </p>

            {verifying ? (
              <div className="mt-8 space-y-4 rounded-card border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
                <div className="shimmer mx-auto h-5 w-48 rounded" />
                <p className="text-sm text-[var(--text-muted)]">Verifying security token…</p>
              </div>
            ) : !tokenValid ? (
              <div className="mt-8 rounded-card border border-[var(--border-danger,#ef4444)]/40 bg-[var(--surface)] p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-[var(--text-strong)]">Link Expired or Invalid</h2>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {tokenError || 'This password reset link is invalid or has expired.'}
                </p>
                <div className="mt-6 flex flex-col gap-2.5">
                  <Link to="/login">
                    <Button size="md" className="w-full font-bold">
                      Request New Reset Link
                    </Button>
                  </Link>
                  <Link to="/" className="text-xs font-semibold text-[var(--text-muted)] hover:underline">
                    Back to Home
                  </Link>
                </div>
              </div>
            ) : success ? (
              <div className="mt-8 rounded-card border border-[var(--accent-ring)]/40 bg-[var(--surface)] p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-tint)] text-[var(--accent-text)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-[var(--text-strong)]">Password Reset Complete!</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  Your password has been successfully updated. You can now sign in with your new credentials.
                </p>
                <div className="mt-6">
                  <Button size="lg" className="w-full font-bold" onClick={() => navigate('/login')}>
                    Sign In Now
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
                {formError && (
                  <div className="rounded-xl border border-[var(--danger-text)]/40 bg-[var(--danger-text)]/10 px-4 py-3 text-sm font-medium text-[var(--danger-text)]">
                    {formError}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setFormError(null)
                      }}
                      placeholder="At least 8 characters"
                      aria-invalid={Boolean(errors.password)}
                      className={cx(
                        inputClass,
                        'pr-12',
                        errors.password ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
                    >
                      {showPw ? (
                        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
                          <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          <path d="M7.5 7.7A2.6 2.6 0 0010 12.4c.7 0 1.3-.3 1.8-.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          <path d="M6.3 6.4C4.5 7.5 3.1 9 2.5 10c1.2 2.3 4 5 7.5 5 1.3 0 2.5-.3 3.5-.9M9.6 5.2A7.6 7.6 0 0110 5c3.5 0 6.3 2.7 7.5 5-.5 1-1.3 2.1-2.4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
                          <path d="M2.5 10C3.7 7.7 6.5 5 10 5s6.3 2.7 7.5 5c-1.2 2.3-4 5-7.5 5s-6.3-2.7-7.5-5z" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-[var(--danger-text)]">
                      {errors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
                  >
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        setFormError(null)
                      }}
                      placeholder="Re-enter password"
                      aria-invalid={Boolean(errors.confirm)}
                      className={cx(
                        inputClass,
                        'pr-12',
                        errors.confirm ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((v) => !v)}
                      aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
                    >
                      {showConfirmPw ? (
                        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
                          <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          <path d="M7.5 7.7A2.6 2.6 0 0010 12.4c.7 0 1.3-.3 1.8-.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          <path d="M6.3 6.4C4.5 7.5 3.1 9 2.5 10c1.2 2.3 4 5 7.5 5 1.3 0 2.5-.3 3.5-.9M9.6 5.2A7.6 7.6 0 0110 5c3.5 0 6.3 2.7 7.5 5-.5 1-1.3 2.1-2.4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
                          <path d="M2.5 10C3.7 7.7 6.5 5 10 5s6.3 2.7 7.5 5c-1.2 2.3-4 5-7.5 5s-6.3-2.7-7.5-5z" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {errors.confirm && (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-[var(--danger-text)]">
                      {errors.confirm}
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <Button type="submit" size="lg" className="w-full font-bold" disabled={busy}>
                    {busy ? 'Saving New Password…' : 'Update Password'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
