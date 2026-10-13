import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Container, Section, SectionHead, Select } from '@/components/ui'
import { TermsDialog } from '@/components/ui/TermsDialog'
import { SITE, siteData } from '@/data'
import { ApiError, register } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCart } from '@/lib/cart'
import { cx, stripFlag } from '@/lib/format'

interface Fields {
  /* Which kind of account this form creates. A manager entry creates a club;
     a player entry creates a free-agent player row. */
  role: 'club_manager' | 'player'
  club: string
  region: string
  format: string
  manager: string
  gamertag: string
  email: string
  password: string
  /* Never sent to the API. Compared against `password` on the client only, so
     the server never holds a second value that could be got wrong. */
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
  club: '',
  region: '',
  format: '',
  manager: '',
  gamertag: '',
  email: '',
  password: '',
  confirmPassword: '',
  discord: '',
  agree: false,
}

/**
 * Role-aware.
 *
 * The club fields are not merely optional for a player, they are meaningless —
 * a player does not pick a region and a competition format to join a club.
 * Validating them anyway would block sign-up on questions that do not apply.
 */
function validate(v: Fields): Errors {
  const e: Errors = {}

  if (v.role === 'club_manager') {
    if (!v.club.trim()) e.club = 'Please enter your club name.'
    if (!v.region) e.region = 'Please select your region.'
    if (!v.format) e.format = 'Please choose a competition format.'
    if (!v.manager.trim()) e.manager = 'Please enter the manager name.'
    if (!v.discord.trim()) e.discord = 'Please provide a Discord username so we can reach you.'
  } else {
    if (!v.gamertag.trim()) e.gamertag = 'Please enter your in-game gamertag.'
  }

  if (!v.email.trim()) e.email = 'Please enter an email address.'
  else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Please enter a valid email address.'

  // Matches the API minimum. Caught here so the round trip is only spent on
  // input that can actually succeed.
  if (!v.password) e.password = 'Please choose a password.'
  else if (v.password.length < 8) e.password = 'Use at least 8 characters.'

  // A typo in a password field is otherwise invisible until the account
  // exists and the first sign-in fails, by which point the password is hashed
  // and cannot be recovered.
  if (v.confirmPassword !== v.password) {
    e.confirmPassword = v.confirmPassword ? 'Passwords do not match.' : 'Re-enter your password.'
  }

  if (!v.agree) e.agree = 'Please accept the entry terms before submitting.'
  return e
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
  const [values, setValues] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState(false)
  const [sent, setSent] = useState(false)
  /* What the account that was just created actually was.
     The confirmation reads from here rather than from `values`, because the
     form is cleared the moment submission succeeds — leaving a filled-in form
     under the "you're done" panel invites a double submit. */
  const [created, setCreated] = useState<{ role: Fields['role']; club: string; gamertag: string } | null>(
    null,
  )
  const [termsOpen, setTermsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Only the panel opener survives here. Adding passes to the cart moved to
  // /entries, where they can be browsed without a form half-finished beside
  // them; the success panel still offers a shortcut to the cart.
  const { openPanel } = useCart()
  const { setUser } = useAuth()
  const navigate = useNavigate()

  const errorFor = (k: keyof Fields) => (touched ? errors[k] : undefined)

  const set =
    (k: keyof Fields) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = e.target as HTMLInputElement
      const v = target.type === 'checkbox' ? target.checked : target.value
      const next = { ...values, [k]: v } as Fields
      setValues(next)
      if (touched) setErrors(validate(next))
    }

  const pick = (k: 'region' | 'format') => (v: string) => {
    const next = { ...values, [k]: v }
    setValues(next)
    if (touched) setErrors(validate(next))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setSubmitError(null)
    const errs = validate(values)
    setErrors(errs)
    if (Object.keys(errs).length) {
      // Send focus to the first thing that needs attention.
      const firstBad = document.getElementById(Object.keys(errs)[0] === 'agree' ? 'agree' : String(Object.keys(errs)[0]))
      firstBad?.focus()
      return
    }

    setBusy(true)
    try {
      const { user } = await register({
        role: values.role,
        email: values.email.trim(),
        password: values.password,
        name: values.role === 'club_manager' ? values.manager.trim() : values.manager.trim() || values.gamertag.trim(),
        gamertag: values.role === 'player' ? values.gamertag.trim() : undefined,
        clubName: values.role === 'club_manager' ? values.club.trim() : undefined,
      })
      setUser(user)
      // Snapshot what was created, then clear the form. The confirmation
      // reads from the snapshot, and the cleared fields make a second submit
      // impossible by accident — the submit button now fails validation.
      setCreated({
        role: values.role,
        club: values.club.trim(),
        gamertag: values.gamertag.trim(),
      })
      setValues(EMPTY)
      setErrors({})
      setTouched(false)
      setSubmitError(null)
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
              full access to the {SITE.season} tournament and league matches, including official
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
    [],
  )

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Registration"
        /* Both roles land on this page, so the header follows the choice
           rather than describing a club entry to someone joining as a player
           and quoting them a fee they do not owe. */
        title={values.role === 'club_manager' ? 'Register your club' : 'Join the league'}
        lede={
          values.role === 'club_manager'
            ? `${SITE.season} registration is open — ${SITE.teamsRegistered} of ${SITE.teamCap} team slots filled at ${SITE.registrationFee} per team.`
            : `Create your ${SITE.season} player account. Clubs will find you by gamertag and send you offers — you are a free agent until you accept one.`
        }
      />

      <Section>
        {/* The form is centred and capped at a comfortable measure rather than
            left-aligned under the page header: it is one short column of
            fields, and the page has nothing beside it now that the entry-pass
            sidebar moved to /entries. */}
        <Container size="wide">
          {/* One column. The entry-pass sidebar moved to /entries — a price
              list beside a signup form reads as part of submitting it. */}
          <div className="mx-auto max-w-2xl">
            {/* ================= form ================= */}
            <div>
              {sent && (
                <div
                  role="status"
                  className="mb-8 rounded-card border border-[var(--accent-ring)] bg-[var(--accent-tint)] p-6"
                >
                  <div className="flex items-start gap-3">
                    <svg
                      width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden
                      className="mt-0.5 shrink-0 text-[var(--accent-text)]"
                    >
                      <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div>
                      <h2 className="font-display text-lg font-bold text-[var(--text-strong)]">
                        {created?.role === 'club_manager'
                          ? 'Account created'
                          : 'Welcome to IWVPL'}
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                        {created?.role === 'club_manager' ? (
                          <>
                            You are signed in as the manager of{' '}
                            <strong className="text-[var(--text)]">{stripFlag(created.club)}</strong>
                            . It is waiting for league admin approval — until then it is not on the
                            public site and cannot play fixtures. You can sign players in the
                            meantime.
                          </>
                        ) : (
                          <>
                            You are signed in as{' '}
                            <strong className="text-[var(--text)]">{created?.gamertag}</strong> and
                            you are a free agent. Clubs can find you and send you an offer from your
                            dashboard.
                          </>
                        )}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2.5">
                        <Button size="sm" onClick={() => navigate('/dashboard')}>
                          Go to dashboard
                        </Button>
                        {created?.role === 'club_manager' && (
                          <Button size="sm" variant="outline" onClick={() => openPanel()}>
                            Review cart
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSent(false)
                            setCreated(null)
                          }}
                        >
                          {created?.role === 'club_manager'
                            ? 'Register another club'
                            : 'Register another account'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <SectionHead
                eyebrow="Entry form"
                title={values.role === 'club_manager' ? 'Club & manager details' : 'Player details'}
              />

              {/* Two genuinely different registrations behind one form. A
                  manager entry creates a club and pays an entry fee; a player
                  entry creates a free agent and costs nothing, so the fee,
                  cart and region/format questions are all hidden for them
                  rather than shown and then ignored. */}
              <div className="mb-6 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { id: 'club_manager', title: 'I manage a club', hint: 'Create a club and sign players' },
                    { id: 'player', title: 'I am a player', hint: 'Join as a free agent' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setValues({ ...values, role: opt.id })
                      setErrors({})
                      setSubmitError(null)
                    }}
                    aria-pressed={values.role === opt.id}
                    className={cx(
                      'rounded-card border p-4 text-left transition-colors',
                      values.role === opt.id
                        ? 'border-[var(--accent-ring)] bg-[var(--accent-tint)]'
                        : 'border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]',
                    )}
                  >
                    <span className="block text-sm font-bold text-[var(--text-strong)]">
                      {opt.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-[var(--text-muted)]">
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>

              {submitError && (
                <p
                  role="alert"
                  className="mb-6 rounded-lg border border-[var(--danger-text)] bg-[var(--danger-text)]/10 px-4 py-3 text-sm text-[var(--danger-text)]"
                >
                  {submitError}
                </p>
              )}

              <form onSubmit={onSubmit} noValidate className="space-y-8">
                {/* --- club (managers only) --- */}
                {values.role === 'club_manager' && (
                <fieldset className="surface rounded-card p-6 sm:p-7">
                  <legend className="sr-only">Club details</legend>
                  <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                    1 &middot; Your club
                  </p>

                  <div className="space-y-5">
                    <Field label="Club name" error={errorFor('club')} htmlFor="club">
                      <input
                        id="club"
                        name="club"
                        type="text"
                        value={values.club}
                        onChange={set('club')}
                        placeholder="e.g. KITA KITA VFC"
                        aria-invalid={Boolean(errorFor('club'))}
                        className={cx(inputCls, errorFor('club') ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]')}
                      />
                    </Field>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Region" error={errorFor('region')} htmlFor="region">
                        <Select
                          id="region"
                          value={values.region}
                          onChange={pick('region')}
                          options={REGION_OPTIONS}
                          placeholder="Select a region"
                        />
                      </Field>

                      <Field label="Format" error={errorFor('format')} htmlFor="format">
                        <Select
                          id="format"
                          value={values.format}
                          onChange={pick('format')}
                          options={FORMATS.map((f) => ({ value: f, label: f }))}
                          placeholder="Choose a format"
                        />
                      </Field>
                    </div>
                  </div>
                </fieldset>
                )}

                {/* --- contact --- */}
                <fieldset className="surface rounded-card p-6 sm:p-7">
                  <legend className="sr-only">Contact details</legend>
                  {/* The step numbers track the fieldsets actually shown. A
                      player never sees step 1, so counting from 2 would leave
                      the form opening on "2" with nothing above it. */}
                  <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                    {values.role === 'club_manager' ? '2' : '1'} &middot; Your details
                  </p>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label={values.role === 'club_manager' ? 'Manager name' : 'Your name'}
                      error={errorFor('manager')}
                      htmlFor="manager"
                      className={values.role === 'player' ? 'sm:col-span-2' : undefined}
                    >
                      <input
                        id="manager"
                        name="manager"
                        type="text"
                        autoComplete="name"
                        value={values.manager}
                        onChange={set('manager')}
                        placeholder="Your name"
                        aria-invalid={Boolean(errorFor('manager'))}
                        className={cx(inputCls, errorFor('manager') ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]')}
                      />
                    </Field>

                    <Field label="Email" error={errorFor('email')} htmlFor="email">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={values.email}
                        onChange={set('email')}
                        placeholder="you@club.com"
                        aria-invalid={Boolean(errorFor('email'))}
                        className={cx(inputCls, errorFor('email') ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]')}
                      />
                    </Field>

                    {/* Discord is a club-admin contact channel. A player has no fixtures to be
                        reached about, so it is not asked of them. */}
                    {values.role === 'club_manager' && (
                      <Field
                        label="Discord username"
                        error={errorFor('discord')}
                        htmlFor="discord"
                        className="sm:col-span-2"
                      >
                        <input
                          id="discord"
                          name="discord"
                          type="text"
                          value={values.discord}
                          onChange={set('discord')}
                          placeholder="e.g. manager#1234"
                          aria-invalid={Boolean(errorFor('discord'))}
                          className={cx(inputCls, errorFor('discord') ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]')}
                        />
                        <p className="mt-2 text-xs text-[var(--text-faint)]">
                          Required so we can reach you about fixtures and league admin.
                        </p>
                      </Field>
                    )}

                    {values.role === 'player' && (
                      <Field
                        label="Gamertag"
                        error={errorFor('gamertag')}
                        htmlFor="gamertag"
                      >
                        <input
                          id="gamertag"
                          name="gamertag"
                          type="text"
                          value={values.gamertag}
                          onChange={set('gamertag')}
                          placeholder="e.g. LethaL_ShoTs11"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-invalid={Boolean(errorFor('gamertag'))}
                          className={cx(inputCls, errorFor('gamertag') ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]')}
                        />
                        <p className="mt-2 text-xs text-[var(--text-faint)]">
                          Exactly as it appears in game, capitals and underscores included.
                        </p>
                      </Field>
                    )}

                    {/* Password lives with the contact details because it is
                        what makes this an account rather than an application. */}
                    <Field
                      label="Password"
                      error={errorFor('password')}
                      htmlFor="password"
                      className="sm:col-span-2"
                    >
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        value={values.password}
                        onChange={set('password')}
                        placeholder="At least 8 characters"
                        aria-invalid={Boolean(errorFor('password'))}
                        className={cx(inputCls, errorFor('password') ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]')}
                      />
                    </Field>

                    <Field
                      label="Confirm password"
                      error={errorFor('confirmPassword')}
                      htmlFor="confirmPassword"
                      className="sm:col-span-2"
                    >
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        value={values.confirmPassword}
                        onChange={set('confirmPassword')}
                        placeholder="Type it again"
                        aria-invalid={Boolean(errorFor('confirmPassword'))}
                        className={cx(inputCls, errorFor('confirmPassword') ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]')}
                      />
                    </Field>
                  </div>
                </fieldset>

                {/* --- terms --- */}
                <fieldset className="surface rounded-card p-6 sm:p-7">
                  <legend className="sr-only">Terms</legend>
                  <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                    {values.role === 'club_manager' ? '3' : '2'} &middot; Entry terms
                  </p>

                  {/* The terms are one click away, right next to the checkbox
                      itself. The button is deliberately NOT nested inside the
                      <label>: a label swallows clicks on its descendants, so
                      the terms link never fired. */}
                  <div className="flex items-start gap-3">
                    <input
                      id="agree"
                      name="agree"
                      type="checkbox"
                      checked={values.agree}
                      onChange={set('agree')}
                      aria-invalid={Boolean(errorFor('agree'))}
                      aria-describedby="agree-help"
                      className={cx(
                        'mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border bg-[var(--surface)] accent-[var(--accent-solid)]',
                        errorFor('agree') ? 'border-[var(--danger-text)]' : 'border-[var(--border-strong)]',
                      )}
                    />
                    <div className="min-w-0 text-sm leading-relaxed text-[var(--text-muted)]">
                      <span>
                        <label htmlFor="agree" className="cursor-pointer">
                          I have read and accept the{' '}
                        </label>
                        <button
                          type="button"
                          onClick={() => setTermsOpen(true)}
                          className="font-semibold text-[var(--accent-text)] underline decoration-[var(--accent-ring)] underline-offset-2 transition-colors hover:text-[var(--accent-hover)]"
                        >
                          IWVPL entry terms
                        </button>
                        .
                      </span>
                      <p id="agree-help" className="mt-1.5 text-xs text-[var(--text-faint)]">
                        Covers what your entry includes, the {SITE.registrationFee} fee, the
                        24&ndash;48 hour confirmation window, roster submission and code of conduct.
                      </p>
                    </div>
                  </div>
                  {errorFor('agree') && (
                    <p role="alert" className="mt-2.5 text-xs font-medium text-[var(--danger-text)]">
                      {errors.agree}
                    </p>
                  )}

                  <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-6">
                    <Button type="submit" size="lg" disabled={busy}>
                      {busy
                        ? 'Creating account…'
                        : values.role === 'club_manager'
                          ? 'Create club & sign up'
                          : 'Create my account'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setValues(EMPTY)
                        setErrors({})
                        setTouched(false)
                        setSubmitError(null)
                      }}
                    >
                      Reset form
                    </Button>
                  </div>
                </fieldset>
              </form>
            </div>

          </div>
        </Container>
      </Section>

      <TermsDialog
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        title="IWVPL entry terms"
        sections={terms}
      />
    </div>
  )
}

function Field({
  label,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string
  error?: string
  htmlFor: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
      >
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-[var(--danger-text)]">
          {error}
        </p>
      )}
    </div>
  )
}
