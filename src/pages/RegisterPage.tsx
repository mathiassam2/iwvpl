import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, ButtonLink, Card, Container, Section, SectionHead, Select } from '@/components/ui'
import { TermsDialog } from '@/components/ui/TermsDialog'
import { SITE, siteData } from '@/data'
import { useCart } from '@/lib/cart'
import { cx, stripFlag } from '@/lib/format'

interface Fields {
  club: string
  region: string
  format: string
  manager: string
  email: string
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
  club: '',
  region: '',
  format: '',
  manager: '',
  email: '',
  discord: '',
  agree: false,
}

function validate(v: Fields): Errors {
  const e: Errors = {}
  if (!v.club.trim()) e.club = 'Please enter your club name.'
  if (!v.region) e.region = 'Please select your region.'
  if (!v.format) e.format = 'Please choose a competition format.'
  if (!v.manager.trim()) e.manager = 'Please enter the manager name.'
  if (!v.email.trim()) e.email = 'Please enter an email address.'
  else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Please enter a valid email address.'
  if (!v.discord.trim()) e.discord = 'Please provide a Discord username so we can reach you.'
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
  const [termsOpen, setTermsOpen] = useState(false)
  const { add, has, openPanel } = useCart()

  const activeClubs = siteData.clubs.filter((c) => c.status === 'Active').length
  const slotsLeft = SITE.teamCap - SITE.teamsRegistered

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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const errs = validate(values)
    setErrors(errs)
    if (Object.keys(errs).length) {
      // Send focus to the first thing that needs attention.
      const firstBad = document.getElementById(Object.keys(errs)[0] === 'agree' ? 'agree' : String(Object.keys(errs)[0]))
      firstBad?.focus()
      return
    }
    setSent(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
        title="Register your club"
        lede={`${SITE.season} registration is open — ${SITE.teamsRegistered} of ${SITE.teamCap} team slots filled at ${SITE.registrationFee} per team.`}
      />

      <Section>
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">
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
                        Registration request received
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                        Thank you, {values.manager || 'manager'}. Our admin team will review your
                        entry for{' '}
                        <strong className="text-[var(--text)]">{stripFlag(values.club)}</strong> and
                        reply to <span className="text-[var(--text)]">{values.email}</span> within
                        24&ndash;48 hours with your official submission forms. Your entry remains
                        pending until that confirmation is received.
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2.5">
                        <Button
                          size="sm"
                          onClick={() => {
                            openPanel()
                          }}
                        >
                          Review cart
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSent(false)
                            setValues(EMPTY)
                            setTouched(false)
                            setErrors({})
                          }}
                        >
                          Register another club
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <SectionHead eyebrow="Entry form" title="Club & manager details" />

              <form onSubmit={onSubmit} noValidate className="space-y-8">
                {/* --- club --- */}
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

                {/* --- manager --- */}
                <fieldset className="surface rounded-card p-6 sm:p-7">
                  <legend className="sr-only">Manager details</legend>
                  <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                    2 &middot; Your contact
                  </p>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Manager name" error={errorFor('manager')} htmlFor="manager">
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
                  </div>
                </fieldset>

                {/* --- terms --- */}
                <fieldset className="surface rounded-card p-6 sm:p-7">
                  <legend className="sr-only">Terms</legend>
                  <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-text)]">
                    3 &middot; Entry terms
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
                        24&ndash;48 hour confirmation window, roster submission and code of conduct.{' '}
                        <button
                          type="button"
                          onClick={() => setTermsOpen(true)}
                          className="font-semibold text-[var(--accent-text)] underline underline-offset-2"
                        >
                          Read them now
                        </button>
                      </p>
                    </div>
                  </div>
                  {errorFor('agree') && (
                    <p role="alert" className="mt-2.5 text-xs font-medium text-[var(--danger-text)]">
                      {errors.agree}
                    </p>
                  )}

                  <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-6">
                    <Button type="submit" size="lg">
                      Submit registration
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setValues(EMPTY)
                        setErrors({})
                        setTouched(false)
                      }}
                    >
                      Reset form
                    </Button>
                  </div>
                </fieldset>
              </form>
            </div>

            {/* ================= sidebar ================= */}
            <aside className="space-y-6">
              {/* entry passes */}
              <Card className="overflow-hidden p-0">
                <div className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-tint)] to-transparent px-6 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
                    Available entries
                  </p>
                  <p className="mt-1 font-display text-base font-bold text-[var(--text-strong)]">
                    {SITE.season}
                  </p>
                </div>

                <ul className="divide-y divide-[var(--border)]">
                  {siteData.products.map((p) => (
                    <li key={p.slug} className="p-5">
                      <img
                        src={p.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="mb-4 h-28 w-full rounded-lg object-cover"
                      />
                      <Badge tone="neutral">{p.kicker}</Badge>
                      <h3 className="mt-2 text-sm font-bold leading-snug text-[var(--text-strong)]">
                        {p.name}
                      </h3>
                      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-[var(--text-muted)]">
                        {p.summary}
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="numeric text-lg font-bold text-[var(--accent-text)]">
                          {p.price}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!has(p.slug)) add(p.slug)
                            openPanel()
                          }}
                        >
                          {has(p.slug) ? 'In cart' : 'Add to cart'}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-4">
                  <ButtonLink to="/cart" variant="outline" size="sm" className="w-full">
                    Go to cart
                  </ButtonLink>
                </div>
              </Card>

              {/* snapshot */}
              <Card className="p-6">
                <h3 className="font-display text-base font-bold text-[var(--text-strong)]">
                  Season snapshot
                </h3>
                <dl className="mt-4 space-y-3">
                  {[
                    ['Team cap', `${SITE.teamCap} clubs`],
                    ['Registered', `${SITE.teamsRegistered} clubs`],
                    ['Slots left', `${slotsLeft} clubs`],
                    ['Active rosters', `${activeClubs} clubs`],
                    ['Entry fee', SITE.registrationFee],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0"
                    >
                      <dt className="text-sm text-[var(--text-muted)]">{k}</dt>
                      <dd className="numeric text-sm font-bold text-[var(--text-strong)]">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              {/* confirmation note */}
              <Card className="border-[var(--badge-gold-bg)] bg-[var(--badge-gold-bg)] p-6">
                <h3 className="flex items-center gap-2 font-display text-base font-bold text-[var(--badge-gold-fg)]">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M10 6v5M10 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Confirmation note
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  Your purchase does not immediately finalise registration. Please allow
                  24&ndash;48 hours for our admin team to process your entry. You will receive a
                  confirmation email containing your team submission forms.
                </p>
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="mt-4 text-sm font-semibold text-[var(--accent-text)] underline underline-offset-4 transition-opacity hover:opacity-70"
                >
                  Read the full entry terms
                </button>
              </Card>
            </aside>
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
