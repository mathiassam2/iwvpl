import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Container, Section, SectionHead, Select } from '@/components/ui'
import { TermsDialog } from '@/components/ui/TermsDialog'
import { SITE, siteData } from '@/data'
import { ApiError, getRegistrationSettings, register, verifyInvite, type VerifyInviteResult } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCart } from '@/lib/cart'
import { CLUB_PLACEHOLDER, compressClubLogo, cx, stripFlag } from '@/lib/format'
import { useSeasonName } from '@/lib/season'

interface Fields {
  role: 'club_manager' | 'player'
  managerPasscode: string
  club: string
  clubLogo: string | null
  shortCode: string
  region: string
  format: string
  manager: string
  gamertag: string
  shirtNumber: string
  email: string
  password: string
  confirmPassword: string
  discord: string
  agree: boolean
}

type Errors = Partial<Record<keyof Fields, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const FORMATS = [
  'IWVPL Pro Club League (11v11)',
  'IWVPL Champions League (1v1)',
  'IWVPL FUT League (1v1)',
]

const EMPTY: Fields = {
  role: 'club_manager',
  managerPasscode: '',
  club: '',
  clubLogo: null,
  shortCode: '',
  region: '',
  format: '',
  manager: '',
  gamertag: '',
  shirtNumber: '',
  email: '',
  password: '',
  confirmPassword: '',
  discord: '',
  agree: false,
}

const inputCls =
  'w-full rounded-xl border bg-[var(--surface)] px-4 py-3 text-[15px] ' +
  'text-[var(--text-strong)] placeholder:text-[var(--text-faint)] outline-none ' +
  'transition-colors focus:border-[var(--accent-ring)]'

const REGION_OPTIONS = [
  ...siteData.communities.map((c) => ({ value: c, label: c })),
  { value: 'Other', label: 'Other' },
]

export default function RegisterPage() {
  const seasonName = useSeasonName()
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)
  const [maxStepVisited, setMaxStepVisited] = useState<number>(1)
  const [values, setValues] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState(false)
  const [sent, setSent] = useState(false)
  const [created, setCreated] = useState<{ role: Fields['role']; club: string; gamertag: string } | null>(null)
  const [termsOpen, setTermsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)

  // Passcode & Invite verification state
  const [passcodeRequired, setPasscodeRequired] = useState(true)
  const [inviteVerification, setInviteVerification] = useState<{
    verified: boolean
    busy: boolean
    error: string | null
    type?: 'invite' | 'passcode'
    boundEmail?: string | null
    boundClubName?: string | null
  }>({
    verified: false,
    busy: false,
    error: null,
  })

  const { openPanel } = useCart()
  const { setUser } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    getRegistrationSettings()
      .then((s) => {
        if (active) setPasscodeRequired(s.managerPasscodeRequired)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const set =
    (k: keyof Fields) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = e.target as HTMLInputElement
      const v = target.type === 'checkbox' ? target.checked : target.value
      const next = { ...values, [k]: v } as Fields
      setValues(next)
      if (k === 'managerPasscode') {
        // Reset verification if code changes
        setInviteVerification({ verified: false, busy: false, error: null })
      }
      if (errors[k]) {
        setErrors((prev) => ({ ...prev, [k]: undefined }))
      }
    }

  const pick = (k: 'region' | 'format') => (v: string) => {
    const next = { ...values, [k]: v }
    setValues(next)
    if (errors[k]) {
      setErrors((prev) => ({ ...prev, [k]: undefined }))
    }
  }

  const onLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoError(null)
    try {
      const dataUrl = await compressClubLogo(file)
      setValues((v) => ({ ...v, clubLogo: dataUrl }))
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Could not process image file.')
    }
  }

  // --- Verification for Invite Code ---
  const handleVerifyInviteCode = async (explicitCode?: string) => {
    const codeToTest = (explicitCode ?? values.managerPasscode).trim()
    if (!codeToTest) {
      setInviteVerification({
        verified: false,
        busy: false,
        error: 'Please enter an invite code to verify.',
      })
      return false
    }

    setInviteVerification((prev) => ({ ...prev, busy: true, error: null }))
    try {
      const res = await verifyInvite({
        code: codeToTest,
        email: values.email.trim() || undefined,
        clubName: values.club.trim() || undefined,
      })

      if (res.valid) {
        const boundEmail = res.invite?.targetEmail || null
        const boundClub = res.invite?.targetClubName || null

        // Auto-fill bound fields if returned
        setValues((v) => ({
          ...v,
          email: boundEmail ? boundEmail : v.email,
          club: boundClub ? boundClub : v.club,
        }))

        setInviteVerification({
          verified: true,
          busy: false,
          error: null,
          type: res.type,
          boundEmail,
          boundClubName: boundClub,
        })
        return true
      } else {
        setInviteVerification({
          verified: false,
          busy: false,
          error: res.error || 'Invalid invite code.',
        })
        return false
      }
    } catch (err) {
      setInviteVerification({
        verified: false,
        busy: false,
        error: err instanceof ApiError ? err.message : 'Could not verify invite code.',
      })
      return false
    }
  }

  // --- Step 1 Validation ---
  const validateStep1 = async (): Promise<boolean> => {
    setSubmitError(null)
    if (values.role === 'club_manager') {
      if (passcodeRequired) {
        if (!values.managerPasscode.trim()) {
          setErrors({ managerPasscode: 'Manager invite code is required.' })
          return false
        }
        if (!inviteVerification.verified) {
          const ok = await handleVerifyInviteCode()
          if (!ok) return false
        }
      }
    }
    setErrors({})
    return true
  }

  // --- Step 2 Validation ---
  const validateStep2 = (): boolean => {
    const e: Errors = {}
    if (values.role === 'club_manager') {
      if (!values.club.trim()) e.club = 'Please enter your club name.'
      if (!values.region) e.region = 'Please select your region.'
      if (!values.format) e.format = 'Please choose a competition format.'
      if (!values.manager.trim()) e.manager = 'Please enter the manager name.'
      if (!values.discord.trim()) e.discord = 'Please provide a Discord username for league coordination.'
    } else {
      if (!values.gamertag.trim()) e.gamertag = 'Please enter your in-game gamertag.'
      if (values.shirtNumber.trim()) {
        const n = Number.parseInt(values.shirtNumber.trim(), 10)
        if (!Number.isInteger(n) || n < 1 || n > 99) {
          e.shirtNumber = 'Jersey number must be between 1 and 99.'
        }
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // --- Step 3 Validation ---
  const validateStep3 = (): boolean => {
    const e: Errors = {}
    if (!values.email.trim()) {
      e.email = 'Please enter an email address.'
    } else if (!EMAIL_RE.test(values.email.trim())) {
      e.email = 'Please enter a valid email address.'
    } else if (
      values.role === 'club_manager' &&
      inviteVerification.boundEmail &&
      values.email.trim().toLowerCase() !== inviteVerification.boundEmail.toLowerCase()
    ) {
      e.email = `This invite code is locked to email: ${inviteVerification.boundEmail}`
    }

    if (!values.password) {
      e.password = 'Please choose a password.'
    } else if (values.password.length < 8) {
      e.password = 'Use at least 8 characters.'
    }

    if (values.confirmPassword !== values.password) {
      e.confirmPassword = values.confirmPassword ? 'Passwords do not match.' : 'Re-enter your password.'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  // --- Step 4 Validation ---
  const validateStep4 = (): boolean => {
    const e: Errors = {}
    if (!values.agree) {
      e.agree = 'Please accept the entry terms and rules before submitting.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Navigation handlers
  const goToStep = async (step: 1 | 2 | 3 | 4) => {
    setSubmitError(null)
    if (step > currentStep) {
      if (currentStep === 1) {
        const ok = await validateStep1()
        if (!ok) return
      } else if (currentStep === 2) {
        if (!validateStep2()) return
      } else if (currentStep === 3) {
        if (!validateStep3()) return
      }
    }
    setCurrentStep(step)
    setMaxStepVisited((prev) => Math.max(prev, step))
    window.scrollTo({ top: 120, behavior: 'smooth' })
  }

  // Final Submission
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    if (!validateStep4()) return

    setBusy(true)
    try {
      const { user } = await register({
        role: values.role,
        email: values.email.trim(),
        password: values.password,
        name: values.role === 'club_manager' ? values.manager.trim() : values.manager.trim() || values.gamertag.trim(),
        gamertag: values.role === 'player' ? values.gamertag.trim() : undefined,
        shirtNumber:
          values.role === 'player' && values.shirtNumber.trim()
            ? Number.parseInt(values.shirtNumber.trim(), 10)
            : undefined,
        clubName: values.role === 'club_manager' ? values.club.trim() : undefined,
        shortCode: values.role === 'club_manager' ? values.shortCode.trim() : undefined,
        region: values.role === 'club_manager' ? values.region.trim() : undefined,
        clubLogo: values.role === 'club_manager' ? values.clubLogo : undefined,
        managerPasscode: values.role === 'club_manager' ? values.managerPasscode.trim() : undefined,
      })

      setUser(user)
      setCreated({
        role: values.role,
        club: values.club.trim(),
        gamertag: values.gamertag.trim(),
      })
      setValues(EMPTY)
      setErrors({})
      setSent(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create your account.')
    } finally {
      setBusy(false)
    }
  }

  const terms = useMemo(
    () => [
      {
        heading: 'What your entry covers',
        body: (
          <>
            <p>
              An IWVPL Pro Club entry is valid for one (1) complete team entry and gives your club
              full access to the {seasonName} tournament and league matches, including official
              roster submission rights, match schedule access and prize pool eligibility.
            </p>
            <p>
              Champions League entries are limited to one (1) team entry with a maximum of two (2)
              players and run as a double-elimination tournament across upper and lower brackets.
            </p>
          </>
        ),
      },
      {
        heading: 'Fee and payment',
        body: (
          <>
            <p>
              The entry fee is {SITE.registrationFee} per team, payable at checkout. It is not
              refundable once your entry has been processed.
            </p>
            <p>
              We Made Supply is a proud partner of IWVPL. Payment details are shared by our team in
              the confirmation email.
            </p>
          </>
        ),
      },
      {
        heading: 'Confirmation window',
        body: (
          <p>
            Payment does not immediately finalise your registration. Please allow 24 to 48 hours for
            our admin team to process your entry. You will receive a final confirmation email with
            your official team submission forms. Your entry status remains{' '}
            <strong className="text-[var(--text)]">pending</strong> until that confirmation is
            received and your roster has been successfully submitted.
          </p>
        ),
      },
      {
        heading: 'Roster submission',
        body: (
          <p>
            Once confirmed, submit your full roster within 48 hours. Roster changes, additions and
            releases must be declared in the transfer window and approved by the league.
          </p>
        ),
      },
      {
        heading: 'Conduct',
        body: (
          <>
            <p>
              IWVPL is an independent league promoter and is not affiliated with, sponsored by or
              endorsed by Electronic Arts Inc. EA SPORTS and EA FC are registered trademarks of
              Electronic Arts Inc.
            </p>
            <p>
              Players, managers and clubs must conduct themselves reasonably. Hate speech, harassment,
              match fixing and any breach of fair-play standards will lead to sanctions, including
              disqualification.
            </p>
          </>
        ),
      },
      {
        heading: 'Questions',
        body: (
          <p>
            Email{' '}
            <a
              href={`mailto:${SITE.email}`}
              className="font-semibold text-[var(--accent-text)] hover:underline"
            >
              {SITE.email}
            </a>{' '}
            and our team will respond as soon as possible.
          </p>
        ),
      },
    ],
    [seasonName],
  )

  const stepsList = [
    { number: 1, label: 'Role & Invite', description: 'Choose account type' },
    { number: 2, label: values.role === 'club_manager' ? 'Club Details' : 'Player Details', description: 'Team or gamer info' },
    { number: 3, label: 'Account Security', description: 'Email & password' },
    { number: 4, label: 'Review & Terms', description: 'Confirm entry' },
  ]

  return (
    <div className="page-enter">
      <Section>
        <Container size="wide">
          <div className="mx-auto max-w-2xl">
            {/* ================= Success Banner ================= */}
            {sent ? (
              <div
                role="status"
                className="mb-8 rounded-card border border-[var(--accent-ring)] bg-[var(--accent-tint)] p-6 sm:p-8"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <path d="M5 10.5l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-[var(--text-strong)]">
                      {created?.role === 'club_manager' ? 'Club Application Submitted!' : 'Welcome to IWVPL!'}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                      {created?.role === 'club_manager' ? (
                        <>
                          You are registered as the manager of{' '}
                          <strong className="text-[var(--text-strong)]">{stripFlag(created.club)}</strong>.
                          Your application is waiting for league admin verification. In the meantime, you can explore your Manager Dashboard, customize your profile, and search for players.
                        </>
                      ) : (
                        <>
                          You are signed in as{' '}
                          <strong className="text-[var(--text-strong)]">{created?.gamertag}</strong> and listed in the free agent recruitment pool. Club managers can now scout and send contract offers directly to your dashboard.
                        </>
                      )}
                    </p>

                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button size="sm" onClick={() => navigate('/dashboard')}>
                        Go to Dashboard →
                      </Button>
                      {created?.role === 'club_manager' && (
                        <Button size="sm" variant="ghost" onClick={openPanel}>
                          View Entry Passes
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Header Title & Subtitle */}
                <div className="text-center">
                  <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
                    Official League Registration
                  </span>
                  <h1 className="mt-1 font-display text-3xl font-extrabold text-[var(--text-strong)] sm:text-4xl">
                    Join IWVPL
                  </h1>
                  <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--text-muted)]">
                    Step into Southeast Asia's premier EA SPORTS FC competitive league. Complete the steps below to secure your spot.
                  </p>
                </div>

                {/* ================= 4-Step Interactive Progress Bar ================= */}
                <div className="surface rounded-2xl p-4 sm:p-5 border border-[var(--border)]">
                  {/* Step indicators */}
                  <div className="grid grid-cols-4 gap-2 sm:gap-4">
                    {stepsList.map((s) => {
                      const isCurrent = currentStep === s.number
                      const isCompleted = currentStep > s.number
                      const isClickable = s.number <= maxStepVisited

                      return (
                        <button
                          key={s.number}
                          type="button"
                          disabled={!isClickable}
                          onClick={() => isClickable && goToStep(s.number as any)}
                          className={cx(
                            'group flex flex-col items-center text-center transition-all',
                            isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                          )}
                        >
                          <div
                            className={cx(
                              'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all shadow-sm',
                              isCurrent && 'bg-[var(--accent)] text-white ring-4 ring-[var(--accent-ring)] scale-110',
                              isCompleted && 'bg-emerald-500 text-white',
                              !isCurrent && !isCompleted && 'bg-[var(--surface-muted)] text-[var(--text-muted)] border border-[var(--border)]'
                            )}
                          >
                            {isCompleted ? '✓' : s.number}
                          </div>
                          <span
                            className={cx(
                              'mt-2 block text-[11px] sm:text-xs font-semibold leading-tight line-clamp-1',
                              isCurrent ? 'text-[var(--text-strong)] font-bold' : 'text-[var(--text-muted)]'
                            )}
                          >
                            {s.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Progress Line */}
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--accent)] to-emerald-400 transition-all duration-300"
                      style={{
                        width: `${((currentStep - 1) / (stepsList.length - 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Global Error Banner */}
                {submitError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-start gap-3"
                  >
                    <span className="text-lg">⚠️</span>
                    <div>{submitError}</div>
                  </div>
                )}

                {/* ================= STEP 1: Role & Verification ================= */}
                {currentStep === 1 && (
                  <div className="surface rounded-2xl p-6 sm:p-8 space-y-6 border border-[var(--border)]">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                        Step 1 of 4
                      </span>
                      <h2 className="text-xl font-bold text-[var(--text-strong)] mt-1">
                        Select Your Role
                      </h2>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        Choose whether you are registering a competitive club as a manager or joining the league player pool.
                      </p>
                    </div>

                    {/* Role Selection Cards */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setValues((v) => ({ ...v, role: 'club_manager' }))
                          setErrors({})
                        }}
                        className={cx(
                          'flex flex-col items-start rounded-xl border p-5 text-left transition-all',
                          values.role === 'club_manager'
                            ? 'border-[var(--accent)] bg-[var(--accent-tint)] shadow-sm ring-1 ring-[var(--accent)]'
                            : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]'
                        )}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-xl mb-3">
                          🛡️
                        </div>
                        <span className="text-base font-bold text-[var(--text-strong)]">
                          I manage a club
                        </span>
                        <span className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
                          Register your team, manage rosters, sign players, and compete in official league divisions.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setValues((v) => ({ ...v, role: 'player' }))
                          setErrors({})
                        }}
                        className={cx(
                          'flex flex-col items-start rounded-xl border p-5 text-left transition-all',
                          values.role === 'player'
                            ? 'border-[var(--accent)] bg-[var(--accent-tint)] shadow-sm ring-1 ring-[var(--accent)]'
                            : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]'
                        )}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-xl mb-3">
                          ⚽
                        </div>
                        <span className="text-base font-bold text-[var(--text-strong)]">
                          I am a player
                        </span>
                        <span className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
                          Create your official player profile, enter the free agent market, and get scouted by team managers.
                        </span>
                      </button>
                    </div>

                    {/* Manager Invite Code Verification Section */}
                    {values.role === 'club_manager' ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🔐</span>
                          <strong className="text-sm font-semibold text-[var(--text-strong)]">
                            Manager Invite Verification
                          </strong>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          To protect the league from fake clubs, manager registration requires a unique invite code issued by league admins. Codes may be restricted to your captain email or club.
                        </p>

                        <div className="space-y-2">
                          <label
                            htmlFor="managerPasscode"
                            className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
                          >
                            Manager Invite Code
                          </label>
                          <div className="flex gap-2.5">
                            <input
                              id="managerPasscode"
                              name="managerPasscode"
                              type="text"
                              value={values.managerPasscode}
                              onChange={set('managerPasscode')}
                              placeholder="e.g. MGR-8F2A-K9X1"
                              autoCapitalize="characters"
                              className={cx(
                                inputCls,
                                'font-mono uppercase tracking-wider font-bold',
                                errors.managerPasscode ? 'border-red-500' : ''
                              )}
                            />
                            <button
                              type="button"
                              disabled={inviteVerification.busy || !values.managerPasscode.trim()}
                              onClick={() => void handleVerifyInviteCode()}
                              className="adm-btn adm-btn-secondary px-4 text-xs font-semibold whitespace-nowrap"
                            >
                              {inviteVerification.busy ? 'Checking…' : 'Verify'}
                            </button>
                          </div>
                          {errors.managerPasscode && (
                            <p className="text-xs text-red-400 font-medium">{errors.managerPasscode}</p>
                          )}
                        </div>

                        {/* Verification Status Feedback */}
                        {inviteVerification.verified && (
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 space-y-1">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span>✓</span>
                              <span>Invite Code Validated!</span>
                            </div>
                            {inviteVerification.boundEmail && (
                              <p>
                                ✉️ Locked to captain email: <strong>{inviteVerification.boundEmail}</strong>
                              </p>
                            )}
                            {inviteVerification.boundClubName && (
                              <p>
                                🛡️ Locked to club name: <strong>{inviteVerification.boundClubName}</strong>
                              </p>
                            )}
                          </div>
                        )}

                        {inviteVerification.error && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                            ✕ {inviteVerification.error}
                          </div>
                        )}

                        <p className="text-[11px] text-[var(--text-muted)]">
                          Don't have an invite code? Contact a league administrator on Discord to request team registration.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-400 flex items-center gap-3">
                        <span className="text-lg">✓</span>
                        <div>
                          <strong>Player Registration is Open:</strong> No invite code required. Complete the next steps to set your gamertag and credentials.
                        </div>
                      </div>
                    )}

                    {/* Step 1 Actions */}
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="md"
                        type="button"
                        onClick={async () => {
                          const ok = await validateStep1()
                          if (ok) goToStep(2)
                        }}
                      >
                        Continue to Details →
                      </Button>
                    </div>
                  </div>
                )}

                {/* ================= STEP 2: Details (Club or Player) ================= */}
                {currentStep === 2 && (
                  <div className="surface rounded-2xl p-6 sm:p-8 space-y-6 border border-[var(--border)]">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                        Step 2 of 4
                      </span>
                      <h2 className="text-xl font-bold text-[var(--text-strong)] mt-1">
                        {values.role === 'club_manager' ? 'Club & Manager Profile' : 'Player Identity'}
                      </h2>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        {values.role === 'club_manager'
                          ? 'Provide official team credentials, competition format, and manager contact.'
                          : 'Set your in-game identity and squad preferences for recruitment.'}
                      </p>
                    </div>

                    <div className="space-y-5">
                      {values.role === 'club_manager' ? (
                        <>
                          <Field
                            label="Club Name"
                            error={errors.club}
                            htmlFor="club"
                            hint={inviteVerification.boundClubName ? 'Locked by your manager invite code' : undefined}
                          >
                            <input
                              id="club"
                              name="club"
                              type="text"
                              value={values.club}
                              onChange={set('club')}
                              placeholder="e.g. Lion City Esports"
                              readOnly={Boolean(inviteVerification.boundClubName)}
                              className={cx(
                                inputCls,
                                inviteVerification.boundClubName ? 'opacity-80 bg-[var(--surface-muted)] cursor-not-allowed' : '',
                                errors.club ? 'border-red-500' : ''
                              )}
                            />
                          </Field>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Short Code / Tag" error={errors.shortCode} htmlFor="shortCode">
                              <input
                                id="shortCode"
                                name="shortCode"
                                type="text"
                                maxLength={8}
                                value={values.shortCode}
                                onChange={set('shortCode')}
                                placeholder="e.g. LCE"
                                className={cx(inputCls, 'uppercase font-mono font-bold')}
                              />
                            </Field>

                            <div>
                              <label
                                htmlFor="region"
                                className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
                              >
                                Region / Country
                              </label>
                              <Select
                                id="region"
                                name="region"
                                value={values.region}
                                onChange={pick('region')}
                                options={REGION_OPTIONS}
                                error={errors.region}
                              />
                            </div>
                          </div>

                          <div>
                            <label
                              htmlFor="format"
                              className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
                            >
                              Competition Format
                            </label>
                            <Select
                              id="format"
                              name="format"
                              value={values.format}
                              onChange={pick('format')}
                              options={FORMATS.map((f) => ({ value: f, label: f }))}
                              error={errors.format}
                            />
                          </div>

                          {/* Club Logo Upload */}
                          <div>
                            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                              Club Crest / Logo (Optional)
                            </span>
                            <div className="flex items-center gap-4">
                              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]">
                                {values.clubLogo ? (
                                  <img src={values.clubLogo} alt="Preview" className="h-full w-full object-contain p-1" />
                                ) : (
                                  <span className="text-xl text-[var(--text-muted)]">🛡️</span>
                                )}
                              </div>
                              <div className="space-y-1">
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant="secondary"
                                    onClick={() => logoInputRef.current?.click()}
                                  >
                                    {values.clubLogo ? 'Change Crest' : 'Upload Crest'}
                                  </Button>
                                  {values.clubLogo && (
                                    <Button
                                      size="sm"
                                      type="button"
                                      variant="ghost"
                                      onClick={() => setValues((v) => ({ ...v, clubLogo: null }))}
                                    >
                                      Remove
                                    </Button>
                                  )}
                                </div>
                                <input
                                  ref={logoInputRef}
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  onChange={onLogoFileChange}
                                  className="hidden"
                                />
                                <span className="block text-[11px] text-[var(--text-muted)]">
                                  PNG, JPG or WebP (max 4MB, compressed automatically)
                                </span>
                              </div>
                            </div>
                            {logoError && <p className="mt-1 text-xs text-red-400">{logoError}</p>}
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-[var(--border)]">
                            <Field label="Manager Full Name" error={errors.manager} htmlFor="manager">
                              <input
                                id="manager"
                                name="manager"
                                type="text"
                                value={values.manager}
                                onChange={set('manager')}
                                placeholder="Your full name"
                                className={cx(inputCls, errors.manager ? 'border-red-500' : '')}
                              />
                            </Field>

                            <Field label="Discord Username" error={errors.discord} htmlFor="discord">
                              <input
                                id="discord"
                                name="discord"
                                type="text"
                                value={values.discord}
                                onChange={set('discord')}
                                placeholder="e.g. captain#1234 or captain"
                                className={cx(inputCls, errors.discord ? 'border-red-500' : '')}
                              />
                            </Field>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="In-Game Gamertag / EA ID" error={errors.gamertag} htmlFor="gamertag">
                              <input
                                id="gamertag"
                                name="gamertag"
                                type="text"
                                value={values.gamertag}
                                onChange={set('gamertag')}
                                placeholder="e.g. Striker_SG"
                                className={cx(inputCls, errors.gamertag ? 'border-red-500' : '')}
                              />
                            </Field>

                            <Field label="Preferred Jersey # (1–99)" error={errors.shirtNumber} htmlFor="shirtNumber">
                              <input
                                id="shirtNumber"
                                name="shirtNumber"
                                type="number"
                                min={1}
                                max={99}
                                value={values.shirtNumber}
                                onChange={set('shirtNumber')}
                                placeholder="e.g. 7 or 10"
                                className={cx(inputCls, errors.shirtNumber ? 'border-red-500' : '')}
                              />
                            </Field>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Player Display Name (Optional)" htmlFor="manager">
                              <input
                                id="manager"
                                name="manager"
                                type="text"
                                value={values.manager}
                                onChange={set('manager')}
                                placeholder="Your name (optional)"
                                className={inputCls}
                              />
                            </Field>

                            <Field label="Discord Username (Optional)" htmlFor="discord">
                              <input
                                id="discord"
                                name="discord"
                                type="text"
                                value={values.discord}
                                onChange={set('discord')}
                                placeholder="e.g. player#1234"
                                className={inputCls}
                              />
                            </Field>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Step 2 Actions */}
                    <div className="pt-4 flex justify-between border-t border-[var(--border)]">
                      <Button size="md" type="button" variant="secondary" onClick={() => goToStep(1)}>
                        ← Back to Step 1
                      </Button>
                      <Button
                        size="md"
                        type="button"
                        onClick={() => {
                          if (validateStep2()) goToStep(3)
                        }}
                      >
                        Continue to Security →
                      </Button>
                    </div>
                  </div>
                )}

                {/* ================= STEP 3: Account Security ================= */}
                {currentStep === 3 && (
                  <div className="surface rounded-2xl p-6 sm:p-8 space-y-6 border border-[var(--border)]">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                        Step 3 of 4
                      </span>
                      <h2 className="text-xl font-bold text-[var(--text-strong)] mt-1">
                        Account Security & Login
                      </h2>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        Set the email and password you will use to log into the IWVPL Manager or Player portal.
                      </p>
                    </div>

                    <div className="space-y-5">
                      <Field
                        label="Email Address"
                        error={errors.email}
                        htmlFor="email"
                        hint={inviteVerification.boundEmail ? 'Pre-filled and locked to your invite code' : undefined}
                      >
                        <input
                          id="email"
                          name="email"
                          type="email"
                          value={values.email}
                          onChange={set('email')}
                          placeholder="you@domain.com"
                          readOnly={Boolean(inviteVerification.boundEmail)}
                          className={cx(
                            inputCls,
                            inviteVerification.boundEmail ? 'opacity-80 bg-[var(--surface-muted)] cursor-not-allowed' : '',
                            errors.email ? 'border-red-500' : ''
                          )}
                        />
                      </Field>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Password (Min. 8 chars)" error={errors.password} htmlFor="password">
                          <input
                            id="password"
                            name="password"
                            type="password"
                            value={values.password}
                            onChange={set('password')}
                            placeholder="••••••••"
                            className={cx(inputCls, errors.password ? 'border-red-500' : '')}
                          />
                        </Field>

                        <Field label="Confirm Password" error={errors.confirmPassword} htmlFor="confirmPassword">
                          <input
                            id="confirmPassword"
                            name="confirmPassword"
                            type="password"
                            value={values.confirmPassword}
                            onChange={set('confirmPassword')}
                            placeholder="••••••••"
                            className={cx(inputCls, errors.confirmPassword ? 'border-red-500' : '')}
                          />
                        </Field>
                      </div>
                    </div>

                    {/* Step 3 Actions */}
                    <div className="pt-4 flex justify-between border-t border-[var(--border)]">
                      <Button size="md" type="button" variant="secondary" onClick={() => goToStep(2)}>
                        ← Back to Details
                      </Button>
                      <Button
                        size="md"
                        type="button"
                        onClick={() => {
                          if (validateStep3()) goToStep(4)
                        }}
                      >
                        Continue to Review →
                      </Button>
                    </div>
                  </div>
                )}

                {/* ================= STEP 4: Review & Terms ================= */}
                {currentStep === 4 && (
                  <form onSubmit={onSubmit} noValidate className="surface rounded-2xl p-6 sm:p-8 space-y-6 border border-[var(--border)]">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                        Step 4 of 4
                      </span>
                      <h2 className="text-xl font-bold text-[var(--text-strong)] mt-1">
                        Review & Complete Registration
                      </h2>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        Please review your application summary and confirm league entry terms.
                      </p>
                    </div>

                    {/* Summary Review Card */}
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/60 p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                        <div className="flex items-center gap-3">
                          {values.role === 'club_manager' ? (
                            values.clubLogo ? (
                              <img src={values.clubLogo} alt="Logo" className="h-10 w-10 object-contain rounded-lg border border-[var(--border)] p-0.5" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-white font-bold text-sm">
                                {(values.shortCode || values.club).slice(0, 3).toUpperCase()}
                              </div>
                            )
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-white font-bold text-sm">
                              ⚽
                            </div>
                          )}
                          <div>
                            <strong className="block text-base text-[var(--text-strong)]">
                              {values.role === 'club_manager' ? values.club : values.gamertag}
                            </strong>
                            <span className="text-xs text-[var(--text-muted)]">
                              {values.role === 'club_manager' ? `Tag: ${values.shortCode || 'None'}` : `Jersey #${values.shirtNumber || 'None'}`}
                            </span>
                          </div>
                        </div>
                        <span className="adm-status-badge status-active text-xs">
                          {values.role === 'club_manager' ? 'Club Manager' : 'Free Agent Player'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[var(--text-faint)] uppercase font-semibold">Account Email</span>
                          <p className="text-[var(--text-strong)] font-medium mt-0.5">{values.email}</p>
                        </div>
                        <div>
                          <span className="text-[var(--text-faint)] uppercase font-semibold">Contact / Discord</span>
                          <p className="text-[var(--text-strong)] font-medium mt-0.5">
                            {values.discord || values.manager || '—'}
                          </p>
                        </div>
                        {values.role === 'club_manager' && (
                          <>
                            <div>
                              <span className="text-[var(--text-faint)] uppercase font-semibold">Region</span>
                              <p className="text-[var(--text-strong)] font-medium mt-0.5">{values.region}</p>
                            </div>
                            <div>
                              <span className="text-[var(--text-faint)] uppercase font-semibold">Format</span>
                              <p className="text-[var(--text-strong)] font-medium mt-0.5">{values.format}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* League Terms Summary Box */}
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs space-y-2 text-[var(--text-muted)] leading-relaxed">
                      <strong className="text-[var(--text-strong)] block text-sm">Tournament Terms & Conduct</strong>
                      <p>
                        By submitting, you agree to abide by the official IWVPL Match Rules, Fair Play Guidelines, and Code of Conduct. Match results and disputes must be submitted via the portal according to scheduled deadlines.
                      </p>
                      <button
                        type="button"
                        onClick={() => setTermsOpen(true)}
                        className="text-[var(--accent-text)] font-semibold hover:underline"
                      >
                        Read full league terms & conditions →
                      </button>
                    </div>

                    {/* Terms Agreement Checkbox */}
                    <div>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          id="agree"
                          name="agree"
                          type="checkbox"
                          checked={values.agree}
                          onChange={set('agree')}
                          className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)]"
                        />
                        <span className="text-xs text-[var(--text)] font-medium">
                          I confirm that all provided details are correct and I agree to the tournament regulations and conduct guidelines.
                        </span>
                      </label>
                      {errors.agree && (
                        <p className="mt-1 text-xs text-red-400 font-medium">{errors.agree}</p>
                      )}
                    </div>

                    {/* Step 4 Actions */}
                    <div className="pt-4 flex justify-between border-t border-[var(--border)]">
                      <Button size="md" type="button" variant="secondary" onClick={() => goToStep(3)}>
                        ← Back to Edit
                      </Button>
                      <Button size="md" type="submit" disabled={busy}>
                        {busy ? 'Creating Account…' : 'Complete Registration ✓'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </Container>
      </Section>

      <TermsDialog
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        terms={terms}
        title="League Terms & Entry Conditions"
      />
    </div>
  )
}

function Field({
  label,
  error,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string
  error?: string
  htmlFor: string
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
