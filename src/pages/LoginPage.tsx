import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'
import { SITE } from '@/data'
import { cx } from '@/lib/format'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const HIGHLIGHTS = [
  {
    title: 'Submit results',
    body: 'Report scorelines and keep the table accurate.',
  },
  {
    title: 'Manage your roster',
    body: 'Add, release and register players any time.',
  },
  {
    title: 'Customise your club',
    body: 'Update your crest, page and club information.',
  },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [notice, setNotice] = useState<string | null>(null)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!EMAIL_RE.test(email.trim())) next.email = 'That email address looks incomplete.'
    if (!password) next.password = 'Enter your password.'
    else if (password.length < 6) next.password = 'Use at least 6 characters.'
    setErrors(next)
    if (Object.keys(next).length === 0) setNotice(`Signed in as ${email.trim()}.`)
  }

  const input =
    'w-full rounded-xl border bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text-strong)] ' +
    'placeholder:text-[var(--text-faint)] outline-none transition-colors focus:border-[var(--accent-ring)]'

  return (
    <div className="page-enter">
      {/* Split layout: form panel + a quiet brand panel */}
      <div className="mx-auto grid w-full max-w-6xl gap-0 px-5 py-10 sm:px-6 sm:py-16 lg:grid-cols-[1fr_0.92fr] lg:gap-14 lg:px-8">
        {/* ---------- form ---------- */}
        <div className="flex flex-col justify-center">
          <div className="mx-auto w-full max-w-md lg:mx-0">
            <Link to="/" className="inline-block" aria-label="IWVPL — home">
              <img
                src="/assets/brand/iwvpl-wordmark.png"
                alt="IWVPL"
                className="h-8 w-auto select-none object-contain dark:invert"
              />
            </Link>

            <h1 className="mt-9 text-3xl font-extrabold sm:text-4xl">Welcome back</h1>
            <p className="mt-2.5 text-[15px] text-[var(--text-muted)]">
              Sign in to your Manager Portal.
            </p>

            <form onSubmit={onSubmit} noValidate className="mt-9 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setNotice(null)
                  }}
                  placeholder="manager@club.com"
                  aria-invalid={Boolean(errors.email)}
                  className={cx(
                    input,
                    errors.email ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]',
                  )}
                />
                {errors.email && (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-[var(--danger-text)]">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setNotice(null)
                    }}
                    placeholder="••••••••"
                    aria-invalid={Boolean(errors.password)}
                    className={cx(
                      input,
                      'pr-12',
                      errors.password
                        ? 'border-[var(--danger-text)]'
                        : 'border-[var(--border-strong)]',
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

              <div className="flex items-center justify-between gap-3 pt-1">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-strong)] bg-[var(--surface)] accent-[var(--accent-solid)]"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-sm font-semibold text-[var(--accent-text)] transition-opacity hover:opacity-70"
                >
                  Forgot password?
                </button>
              </div>

              <Button type="submit" size="lg" className="w-full">
                Sign in
              </Button>

              {notice && (
                <div
                  role="status"
                  className="flex items-center gap-2.5 rounded-xl border border-[var(--accent-ring)] bg-[var(--accent-tint)] px-4 py-3"
                >
                  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0 text-[var(--accent-text)]">
                    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm text-[var(--text)]">{notice}</p>
                </div>
              )}

              <p className="pt-2 text-center text-sm text-[var(--text-muted)]">
                No account yet?{' '}
                <Link
                  to="/register"
                  className="font-semibold text-[var(--accent-text)] hover:underline"
                >
                  Register your club
                </Link>
              </p>
            </form>
          </div>
        </div>

        {/* ---------- brand panel ---------- */}
        <div className="relative mt-12 hidden overflow-hidden rounded-card lg:mt-0 lg:block">
          <div data-parallax="0.1" className="parallax-layer absolute inset-0">
            <img
              src="/assets/brand/hero-stadium.webp"
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(160deg, color-mix(in srgb, var(--bg-deep) 72%, transparent) 0%, color-mix(in srgb, var(--bg-deep) 92%, transparent) 60%, var(--bg-deep) 100%)',
            }}
          />

          <div className="relative flex h-full flex-col justify-end p-9">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
              Manager Portal
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-snug text-[var(--text-strong)]">
              Everything your club needs, in one place.
            </h2>
            <ul className="mt-7 space-y-4">
              {HIGHLIGHTS.map((h) => (
                <li key={h.title} className="flex gap-3.5">
                  <span
                    aria-hidden
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-strong)]">
                      {h.title}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-[var(--text-muted)]">
                      {h.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-8 border-t border-[var(--border)] pt-5 text-xs leading-relaxed text-[var(--text-faint)]">
              Need access? Email{' '}
              <a
                href={`mailto:${SITE.email}`}
                className="font-semibold text-[var(--accent-text)] hover:underline"
              >
                {SITE.email}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}