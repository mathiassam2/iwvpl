import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Container, Section, Select } from '@/components/ui'
import { SITE } from '@/data'
import { cx } from '@/lib/format'

interface Fields {
  name: string
  email: string
  subject: string
  message: string
}

type Errors = Partial<Record<keyof Fields, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const SUBJECTS = [
  'General enquiry',
  'Team registration',
  'Match scheduling',
  'Sponsorship & partnerships',
  'Dispute or result correction',
  'Media & content creation',
]

/** One short line per subject, so the visitor knows what to expect. */
const SUBJECT_HINT: Record<string, string> = {
  'General enquiry': 'Anything that does not fit the other categories.',
  'Team registration': 'Entries, roster submissions and the 24–48h confirmation.',
  'Match scheduling': 'Fixture clashes, postponements and reschedules.',
  'Sponsorship & partnerships': 'Brand and media collaboration enquiries.',
  'Dispute or result correction': 'A scoreline that needs verifying or amending.',
  'Media & content creation': 'Coverage, interviews and content requests.',
}

function validate(v: Fields): Errors {
  const e: Errors = {}
  if (!v.name.trim()) e.name = 'Please enter your name.'
  if (!v.email.trim()) e.email = 'Please enter your email address.'
  else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Please enter a valid email address.'
  if (!v.subject.trim()) e.subject = 'Please choose a subject.'
  if (!v.message.trim()) e.message = 'Please enter a message.'
  else if (v.message.trim().length < 12)
    e.message = 'Please add a little more detail (12+ characters).'
  return e
}

const inputCls =
  'w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-[15px] ' +
  'text-[var(--text-strong)] placeholder:text-[var(--text-faint)] outline-none ' +
  'transition-colors focus:border-[var(--accent-ring)]'

export default function ContactPage() {
  const [values, setValues] = useState<Fields>({
    name: '',
    email: '',
    subject: SUBJECTS[0],
    message: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState(false)
  const [sent, setSent] = useState(false)

  const set =
    (k: keyof Fields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = { ...values, [k]: e.target.value }
      setValues(next)
      if (touched) setErrors(validate(next))
    }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const errs = validate(values)
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      document.getElementById(Object.keys(errs)[0])?.focus()
      return
    }
    setSent(true)
    setValues({ name: '', email: '', subject: SUBJECTS[0], message: '' })
    setTouched(false)
    setErrors({})
  }

  const err = (k: keyof Fields) => (touched ? errors[k] : undefined)

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Contact"
        title="Get in touch"
        lede="Registration, fixtures, partnerships — one inbox, one admin team."
      />

      <Section>
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16">
            {/* ============ left: the short version ============ */}
            <div className="lg:sticky lg:top-28 lg:self-start">
              {/* One primary action, stated plainly. */}
              <div className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                Email
              </div>
              <a
                href={`mailto:${SITE.email}`}
                className="mt-3 block break-words font-display text-2xl font-bold leading-tight text-[var(--text-strong)] underline-offset-[6px] transition-colors hover:text-[var(--accent-text)] hover:underline sm:text-3xl"
              >
                {SITE.email}
              </a>
              <p className="mt-4 text-sm leading-relaxed text-[var(--text-muted)]">
                The fastest route. We answer every message within one working day,
                and registrations are confirmed inside 24&ndash;48 hours.
              </p>

              {/* Secondary facts, as a quiet list rather than icon cards. */}
              <dl className="mt-10 space-y-5 border-t border-[var(--border)] pt-8">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                    Based in
                  </dt>
                  <dd className="mt-1.5 text-[15px] font-semibold text-[var(--text-strong)]">
                    {SITE.base}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                    Current season
                  </dt>
                  <dd className="mt-1.5 text-[15px] font-semibold text-[var(--text-strong)]">
                    {SITE.season}
                  </dd>
                </div>
              </dl>

              {/* Social, minimal. */}
              <div className="mt-10 border-t border-[var(--border)] pt-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  Follow
                </p>
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                  {SITE.social.map((s) => (
                    <li key={s.label}>
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-sm font-semibold text-[var(--text-muted)] underline-offset-4 transition-colors hover:text-[var(--accent-text)] hover:underline"
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-10 border-t border-[var(--border)] pt-8 text-sm text-[var(--text-muted)]">
                Looking to enter a team?{' '}
                <Link
                  to="/register"
                  className="font-semibold text-[var(--accent-text)] hover:underline"
                >
                  Registration is open
                </Link>{' '}
                &mdash; {SITE.teamsRegistered} of {SITE.teamCap} slots filled at{' '}
                {SITE.registrationFee}.
              </p>
            </div>

            {/* ============ right: the form ============ */}
            <div>
              {sent && (
                <div
                  role="status"
                  className="mb-6 flex items-start gap-3 rounded-card border border-[var(--accent-ring)] bg-[var(--accent-tint)] p-5"
                >
                  <svg
                    width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden
                    className="mt-0.5 shrink-0 text-[var(--accent-text)]"
                  >
                    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-strong)]">
                      Message sent
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                      Thanks for reaching out. Our admin team will reply within one working
                      day.
                    </p>
                  </div>
                </div>
              )}

              <Card className="p-6 sm:p-9">
                <h2 className="font-display text-xl font-bold text-[var(--text-strong)] sm:text-2xl">
                  Send us a message
                </h2>
                <p className="mt-2.5 text-sm text-[var(--text-muted)]">
                  Four short fields. Tell us which topic it is and we will route it
                  to the right person.
                </p>

                <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="Name" error={err('name')} htmlFor="name">
                      <input
                        id="name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        value={values.name}
                        onChange={set('name')}
                        placeholder="Your name"
                        aria-invalid={Boolean(err('name'))}
                        className={cx(inputCls, err('name') && 'border-[var(--danger-text)]')}
                      />
                    </Field>

                    <Field label="Email" error={err('email')} htmlFor="email">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={values.email}
                        onChange={set('email')}
                        placeholder="you@club.com"
                        aria-invalid={Boolean(err('email'))}
                        className={cx(inputCls, err('email') && 'border-[var(--danger-text)]')}
                      />
                    </Field>
                  </div>

                  <Field
                    label="Subject"
                    error={err('subject')}
                    htmlFor="subject"
                    hint={SUBJECT_HINT[values.subject]}
                  >
                    <Select
                      id="subject"
                      value={values.subject}
                      onChange={(v) => {
                        const next = { ...values, subject: v }
                        setValues(next)
                        if (touched) setErrors(validate(next))
                      }}
                      options={SUBJECTS.map((s) => ({ value: s, label: s }))}
                    />
                  </Field>

                  <Field label="Message" error={err('message')} htmlFor="message">
                    <textarea
                      id="message"
                      name="message"
                      rows={7}
                      value={values.message}
                      onChange={set('message')}
                      placeholder="Tell us how we can help…"
                      aria-invalid={Boolean(err('message'))}
                      className={cx(inputCls, 'resize-y', err('message') && 'border-[var(--danger-text)]')}
                    />
                  </Field>

                  <div className="flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-6">
                    <Button type="submit" size="lg">
                      Send message
                    </Button>
                    <p className="text-xs text-[var(--text-faint)]">
                      Or email us directly at{' '}
                      <a
                        href={`mailto:${SITE.email}`}
                        className="font-semibold text-[var(--accent-text)] hover:underline"
                      >
                        {SITE.email}
                      </a>
                    </p>
                  </div>
                </form>
              </Card>
            </div>
          </div>
        </Container>
      </Section>
    </div>
  )
}

function Field({
  label,
  error,
  hint,
  htmlFor,
  children,
}: {
  label: string
  error?: string
  hint?: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--danger-text)]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-faint)]">{hint}</p>
      ) : null}
    </div>
  )
}
