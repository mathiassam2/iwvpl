import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  ButtonLink,
  Card,
  Container,
  Eyebrow,
  Reveal,
  Section,
  SectionHead,
  SmartImage,
} from '@/components/ui'
import { FormGuide, LeaderboardTable, MatchRow, StatTile, StandingsTable } from '@/components/league'
import { SITE, siteData } from '@/data'
import { asset } from '@/lib/assets'
import { CLUB_PLACEHOLDER, cx, stripFlag, totalGoals } from '@/lib/format'


/* ==================================================================== HERO */

/**
 * The hero carousel slides, in rotation order.
 *
 * All three are treated identically: same dwell time, all drift with the cursor,
 * all show the layout from the first paint. The former campaign key art
 * (slide-1) and its "poster" opening beat were removed - the poster logic meant
 * slide 1 behaved differently from the rest, which is not worth the extra state
 * now that there is no key art to hold on its own.
 */
const HERO_SLIDES = [
  {
    src: asset('/assets/hero/sg-hero.webp'),
    alt: 'IWVPL hero artwork — Singapore',
    label: 'Singapore',
  },
  {
    src: asset('/assets/hero/in-hero.webp'),
    alt: 'IWVPL hero artwork — Indonesia',
    label: 'Indonesia',
  },
  {
    src: asset('/assets/hero/my-hero.webp'),
    alt: 'IWVPL hero artwork — Malaysia',
    label: 'Malaysia',
  },
] as const

/** The headline, split so the middle phrase can carry the gradient. */
const HEADLINE = [
  { text: 'Forging ', accent: false, br: false },
  { text: 'Virtual Football', accent: true, br: false },
  { text: ' Champions', accent: false, br: true },
] as const

const HEADLINE_CHARS = HEADLINE.reduce((n, s) => n + s.text.length, 0)
const TYPE_MS = 34
const TYPE_DELAY = 220

/** How long each slide holds. Every slide gets the same dwell time. */
const SLIDE_MS = 6000

/**
 * Cursor-driven drift for the shoutout slides, in px at the extreme edges of the
 * pointer's travel. Enough to notice, not enough to read as a pan.
 */
const DRIFT_X = 16
const DRIFT_Y = 12
/** Per-frame easing toward the pointer target - the ramp up and down. */
const DRIFT_EASE = 0.055

/* ------------------------------------------------------------------ typing */

/**
 * Reveals `total` characters over time.
 *
 * Driven by a flag rather than a remount: the headline element stays mounted
 * for the life of the carousel, so switching between slides 2-4 does not
 * restart it (an earlier version keyed the copy on the slide index, which
 * remounted and made every element flash on each change).
 */
function useTypewriter(
  active: boolean,
  total: number,
  instant: boolean,
  speed = TYPE_MS,
  delay = TYPE_DELAY,
) {
  // Reduced-motion visitors (and the very first paint, before typing starts)
  // must see the finished headline straight away.
  const [chars, setChars] = useState(() => (instant ? total : 0))

  useEffect(() => {
    // While inactive, hold the current value. An earlier version snapped to
    // `total` here, which meant the "copy has arrived" flag was true before
    // typing began: the badge, paragraph, buttons and stats were briefly at
    // full opacity, then dropped back to zero the moment the layout settled
    // and the run started - the visible flash-then-fade on load.
    if (!active) return

    setChars(0)
    let interval = 0
    const kick = window.setTimeout(() => {
      let i = 0
      interval = window.setInterval(() => {
        i += 1
        setChars(i)
        if (i >= total) window.clearInterval(interval)
      }, speed)
    }, delay)
    return () => {
      window.clearTimeout(kick)
      window.clearInterval(interval)
    }
  }, [active, total, speed, delay])

  return chars
}

/** The headline, revealed character by character, with a caret while typing. */
function TypedHeadline({ chars, caret }: { chars: number; caret: boolean }) {
  let budget = chars

  return (
    <h1 className="hero-title mt-7 text-[2.6rem] font-extrabold leading-[1.02] text-balance sm:text-6xl lg:text-[4.25rem]">
      {HEADLINE.map((seg) => {
        const take = Math.max(0, Math.min(seg.text.length, budget))
        budget -= seg.text.length
        const shown = seg.text.slice(0, take)
        return (
          <span key={seg.text}>
            {seg.br ? <br className="hidden lg:inline" /> : null}
            <span className={seg.accent ? 'text-gradient' : 'text-[var(--text-strong)]'}>
              {shown}
            </span>
          </span>
        )
      })}
      {caret && (
        <span
          aria-hidden
          data-caret
          className="ml-1 inline-block h-[0.85em] w-[3px] translate-y-[0.08em] bg-[var(--accent)] align-baseline"
        />
      )}
    </h1>
  )
}

export function Hero() {
  const top = siteData.standings[0]

  const [index, setIndex] = useState(0)
  const regionRef = useRef<HTMLElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  /* Pointer-following drift for the shoutout slides.
   *
   * The target is written straight to a CSS variable on the stage element, and a
   * rAF loop eases the live value toward it. Doing the easing in a loop rather
   * than a CSS transition matters: the target updates continuously as the cursor
   * moves, and a transition on every change would restart and lag behind. The
   * easing factor is what produces the ramp up and the ramp back down.
   *
   * Live values are kept in refs, not state, so pointer movement never triggers a
   * React render - the transform is applied by writing to the DOM node directly.
   */
  const driftTarget = useRef({ x: 0, y: 0 })
  const driftCurrent = useRef({ x: 0, y: 0 })

  /** Pointer position as -1..1 from the centre of the hero. */
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduced) return
    const el = regionRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    driftTarget.current = {
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
    }
  }

  /** Leaving the hero eases back to centre rather than snapping. */
  const onPointerLeave = () => {
    driftTarget.current = { x: 0, y: 0 }
  }

  const count = HERO_SLIDES.length
  const go = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count)
    },
    [count],
  )

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* The headline types itself out once, on the first paint, then stays put for
     the life of the carousel. */
  const [typed, setTyped] = useState(false)

  // Autoplay. Deliberately NOT paused on hover or focus - a visitor reading
  // the copy should not have the slide change mid-sentence.
  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => go(index + 1), SLIDE_MS)
    return () => window.clearInterval(id)
  }, [reduced, index, count, go])

  // Pointer drift. Declared after `reduced` so it can read it. Live values stay
  // in refs and the transform is written to a CSS variable each frame, so cursor
  // movement never triggers a React render.
  useEffect(() => {
    if (reduced) return
    const stage = stageRef.current
    if (!stage) return

    let frame = 0
    const tick = () => {
      const cur = driftCurrent.current
      const tgt = driftTarget.current
      cur.x += (tgt.x - cur.x) * DRIFT_EASE
      cur.y += (tgt.y - cur.y) * DRIFT_EASE
      stage.style.setProperty('--drift-x', `${(cur.x * DRIFT_X).toFixed(2)}px`)
      stage.style.setProperty('--drift-y', `${(cur.y * DRIFT_Y).toFixed(2)}px`)
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [reduced])

  const slide = HERO_SLIDES[index]
  /** Slide 1 holds on its own art until this flips. */
  // Runs on the first paint only; `typed` latches so a slide change can never
  // restart it. Reduced-motion visitors get the finished headline immediately.
  const chars = useTypewriter(!typed && !reduced, HEADLINE_CHARS, reduced)
  const typing = chars < HEADLINE_CHARS
  /** Supporting copy arrives once the headline has finished typing. */
  const restReady = chars >= HEADLINE_CHARS

  useEffect(() => {
    if (restReady) setTyped(true)
  }, [restReady])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(index - 1)
    }
  }

  /** Fade a block in once the headline is done, without remounting it. */
  const arrive = () =>
    cx(
      'transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
      restReady ? 'opacity-100' : 'opacity-0',
    )

  return (
    <section
      ref={regionRef}
      aria-roledescription="carousel"
      aria-label="IWVPL featured"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      // Pulled up under the fixed header with a negative margin that cancels
      // AppShell's `<main>` top padding, then given that same space back as its
      // own padding. The hero therefore starts at y=0 and spans a full viewport,
      // so the artwork runs *behind* the header - which is the whole point of a
      // bare header at rest. Without the pull-up the hero began below the bar,
      // leaving the bar looking at a flat page background, i.e. solid.
      className="relative isolate -mt-16 flex min-h-[100svh] flex-col overflow-hidden pt-16 focus:outline-none lg:-mt-[72px] lg:h-[100svh] lg:min-h-0 lg:pt-[72px]"
    >
      {/* ---------- imagery ---------- */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div
          ref={stageRef}
          data-parallax="0.1"
          className="parallax-layer hero-stage absolute inset-0"
        >
          <div className="absolute inset-0">
            {HERO_SLIDES.map((s, i) => {
              const active = i === index
              return (
                <div
                  key={s.src}
                  data-slide={i}
                  aria-hidden
                  className={cx(
                    'absolute inset-0 transition-opacity duration-[1800ms]',
                    'ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none',
                    active ? 'opacity-100' : 'pointer-events-none opacity-0',
                  )}
                >
                  <div className="absolute inset-0 hidden lg:block">
                    <img
                      src={s.src}
                      alt=""
                      className="hero-drift absolute inset-0 h-full w-full object-cover object-center"
                      {...({ fetchpriority: i === 0 ? 'high' : 'low' } as Record<string, string>)}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </div>

                  {/* Mobile uses the SAME artwork and the SAME fit as desktop, so nothing
                      resizes between the two. Touch devices have no cursor to
                      follow, so the drift simply never receives a target and
                      stays put. */}
                  <div className="absolute inset-0 lg:hidden">
                    <img
                      src={s.src}
                      alt=""
                      className="hero-drift absolute inset-0 h-full w-full object-cover object-center"
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div
          className="hero-glow-a pointer-events-none absolute -left-40 top-[10%] h-[540px] w-[540px] rounded-full opacity-30 blur-[120px]"
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
        />
        <div
          className="hero-glow-b pointer-events-none absolute -right-32 bottom-[8%] h-[480px] w-[480px] rounded-full opacity-20 blur-[130px]"
          style={{ background: 'radial-gradient(circle, var(--gold-text) 0%, transparent 70%)' }}
        />

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="hero-sweep absolute -inset-y-1/2 left-0 w-[38%]"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.09), transparent)',
            }}
          />
          <div
            className="hero-sweep hero-sweep--delay absolute -inset-y-1/2 left-0 w-[22%]"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.06), transparent)',
            }}
          />
        </div>

        <div className="absolute inset-0 bg-grid opacity-50" />

        {/* The scrim ramps from a light wash to the full legibility scrim over 1.5s,
            slightly behind the copy, so the type arrives onto a background that
            is still settling rather than snapping onto a finished one. */}
        <div
          className={cx(
            'absolute inset-0 transition-opacity duration-[1500ms] delay-100',
            'ease-[cubic-bezier(0.33,0,0.15,1)] motion-reduce:transition-none',
            restReady ? 'opacity-100' : 'opacity-[0.5]',
          )}
        >
          <div className="hero-scrim absolute inset-0" />
          <div className="hero-scrim-side absolute inset-y-0 left-0 w-full lg:w-[68%]" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden opacity-70">
          <div
            className="hero-conic h-[2px] w-[200%] -translate-x-1/4"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0%, var(--accent) 12%, transparent 26%, transparent 50%, var(--accent) 62%, transparent 76%)',
            }}
          />
        </div>
      </div>

      {/* ---------- content ----------
          Always mounted. While slide 1 fills the viewport the copy is faded out
          and inert, so it still reserves exactly the same space and the block
          cannot jump as the frame animates down. */}
      <Container
        size="wide"
        ref={copyRef}
        className={cx(
          // Phones: natural height, no `flex-1`/`min-h-0`, so the copy and the
          // leaders card stack at their full size and the section grows to hold
          // them. Constraining this column is what clipped the card mid-table and
          // pushed the headline out of view on mobile - `overflow-hidden` on the
          // section then cut whatever did not fit.
          //
          // Desktop: `flex-1 min-h-0` absorbs the leftover viewport height so the
          // dot strip stays pinned inside the fold.
          'relative flex items-center pb-4 pt-6 transition-opacity duration-700 lg:min-h-0 lg:flex-1 lg:pb-6 lg:pt-8',
          // Fades in with the headline. There is no poster phase to hide it
          // behind any more, so it is simply hidden until there is type to show.
          typed ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <div className={arrive()}>
              <Badge tone="neutral">EA SPORTS FC — Southeast Asia</Badge>
            </div>

            <TypedHeadline chars={chars} caret={typing && !reduced} />

            <p
              className={cx(
                'mt-7 max-w-xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg',
                arrive(),
              )}
            >
              {SITE.description}
            </p>

            <div className={cx('mt-9 flex flex-wrap items-center gap-3', arrive())}>
              <ButtonLink to="/register" size="lg">
                Register your team
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </ButtonLink>
              <ButtonLink to="/standings" variant="outline" size="lg">
                View standings
              </ButtonLink>
            </div>

            <dl
              className={cx(
                'hero-stats mt-11 grid max-w-lg grid-cols-3 gap-4 border-t border-[var(--border)] pt-8',
                arrive(),
              )}
            >
              {[
                { k: `${siteData.clubs.length}`, v: 'Registered clubs' },
                { k: `${siteData.results.length}`, v: 'Matches recorded' },
                { k: `${siteData.standings.length}`, v: 'Clubs in table' },
              ].map((s) => (
                <div key={s.v}>
                  <dt className="numeric text-3xl font-bold text-[var(--text-strong)]">{s.k}</dt>
                  <dd className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                    {s.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={cx('hero-leaders', arrive())}>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-tint)] to-transparent px-5 py-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]">
                    Current leaders
                  </p>
                  <p className="mt-1 font-display text-base font-bold text-[var(--text-strong)]">
                    Top of the table
                  </p>
                </div>
                <Link
                  to="/standings"
                  className="shrink-0 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
                >
                  Full table →
                </Link>
              </div>

              {top && (
                <div className="flex items-center gap-4 px-5 py-5">
                  <SmartImage
                    src={top.logo}
                    fallback={CLUB_PLACEHOLDER}
                    alt=""
                    wrapperClassName="h-16 w-16 shrink-0"
                    className="object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                      League leaders
                    </p>
                    <p className="mt-1 truncate font-display text-lg font-bold text-[var(--text-strong)]">
                      {stripFlag(top.team)}
                    </p>
                    <div className="mt-2">
                      <FormGuide form={top.form} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="numeric text-3xl font-bold text-[var(--accent-text)]">{top.pts}</p>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
                      points
                    </p>
                  </div>
                </div>
              )}

              <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {siteData.standings.slice(1, 6).map((r) => (
                  <Link
                    key={r.team}
                    to="/standings"
                    className="row-hover flex items-center gap-3 px-5 py-2.5"
                  >
                    <span className="numeric w-5 shrink-0 text-right text-xs text-[var(--text-faint)]">
                      {r.pos}
                    </span>
                    <SmartImage
                      src={r.logo}
                      fallback={CLUB_PLACEHOLDER}
                      alt=""
                      wrapperClassName="h-7 w-7 shrink-0"
                      className="object-contain"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
                      {stripFlag(r.team)}
                    </span>
                    <span className="numeric text-sm font-semibold text-[var(--text-muted)]">
                      {r.pts}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </Container>

      {/* ---------- controls ----------
          In normal flow as the section's last child rather than absolutely
          positioned at `bottom-0`: absolute positioning measured from a box
          that could grow taller than the viewport, which is what pushed these
          off-screen on shorter laptop screens. In flow they are guaranteed to
          sit inside the one-viewport hero. */}
      <div className="relative shrink-0">
        <Container size="wide" className="pb-4 pt-1">
          <div className="flex items-center gap-3">
            {HERO_SLIDES.map((s, i) => {
              const active = i === index
              return (
                <button
                  key={s.src}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show slide ${i + 1}: ${s.label}`}
                  aria-current={active}
                  className="group/dot py-2"
                >
                  <span
                    className={cx(
                      'relative block h-[3px] overflow-hidden rounded-full transition-all duration-500',
                      'ease-[cubic-bezier(0.16,1,0.3,1)]',
                      active ? 'w-14 bg-white/20' : 'w-7 bg-white/25 group-hover/dot:bg-white/50',
                    )}
                  >
                    {active && (
                      <span
                        key={`fill-${index}`}
                        className="hero-dot-fill absolute inset-y-0 left-0 w-full bg-[var(--accent)]"
                        style={{ animationDuration: `${SLIDE_MS}ms` }}
                      />
                    )}
                  </span>
                </button>
              )
            })}
            <span className="ml-2 hidden rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white ring-1 ring-white/15 backdrop-blur-sm sm:inline">
              {slide.label}
            </span>
          </div>
        </Container>
      </div>
    </section>
  )
}
/* ============================================================== FORMATS */
export function Formats() {
  return (
    <Section tone="raised">
      <Container size="wide">
        <SectionHead
          eyebrow="Competition formats"
          title="Four ways to compete"
          lede="From full 11-a-side Pro Clubs to pure 1v1 skill battles — pick the format that suits your playstyle."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {siteData.formats.map((f, i) => {
            const soon = f.tag.toLowerCase().includes('soon')
            return (
              <Reveal key={f.name} delay={i * 70}>
                <Card as="article" className="group relative flex h-full flex-col overflow-hidden p-6">
                  <span
                    aria-hidden
                    className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[var(--accent)]/10 blur-2xl transition-all duration-500 group-hover:bg-[var(--accent)]/20"
                  />
                  {/* Plain label, not a pill. The badge styling made the
                      format cards read as a row of status chips. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={cx(
                        'text-[11px] font-bold uppercase tracking-[0.2em]',
                        soon ? 'text-[var(--text-faint)]' : 'text-[var(--accent-text)]',
                      )}
                    >
                      {f.tag}
                    </span>
                    <span className="numeric text-xs text-[var(--text-faint)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-[var(--text-strong)]">{f.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{f.desc}</p>
                </Card>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </Section>
  )
}

/* ========================================================= STANDINGS preview */
/**
 * Removed from the home page on request - the full table now lives only at
 * /standings. Kept here (unreferenced) rather than deleted so the component and
 * its `HOME_TABLE_ROWS` trim are one edit away if the section comes back.
 */
const HOME_TABLE_ROWS = 10

export function StandingsPreview() {
  // The home page shows the top 10 only; the rest lives behind "View full table".
  const shown = siteData.standings.slice(0, HOME_TABLE_ROWS)
  const hidden = siteData.standings.length - shown.length

  return (
    <Section id="standings">
      <Container size="wide">
        <SectionHead
          eyebrow="League table"
          title="IWVPL Pro Club League standings"
          lede={`${SITE.season} — the top ${shown.length} of ${siteData.standings.length} clubs, updated after each match.`}
          action={
            <ButtonLink to="/standings" variant="outline">
              View full table
            </ButtonLink>
          }
        />
        <Reveal>
          <StandingsTable rows={shown} leagueSize={siteData.standings.length} />
        </Reveal>
        {hidden > 0 && (
          <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
            Showing the top {shown.length}.{' '}
            <Link
              to="/standings"
              className="font-semibold text-[var(--accent-text)] transition-opacity hover:opacity-70"
            >
              View all {siteData.standings.length} clubs
            </Link>
          </p>
        )}
      </Container>
    </Section>
  )
}

/* =============================================================== RESULTS preview */
export function ResultsPreview() {
  const grouped = useMemo(() => {
    const seen = new Set<string>()
    return siteData.results
      .filter((m) => {
        if (seen.has(m.date)) return false
        seen.add(m.date)
        return true
      })
      .slice(0, 3)
  }, [])

  const board = siteData.leaderboards[0]

  return (
    <Section tone="raised">
      <Container size="wide">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div>
            <SectionHead
              eyebrow="Match results"
              title="Latest scorelines"
              action={
                <ButtonLink to="/results" variant="outline">
                  All results
                </ButtonLink>
              }
            />
            <div className="surface divide-y divide-[var(--border)] overflow-hidden rounded-card">
              {grouped.map((m) => (
                <div key={m.url}>
                  <p className="px-4 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    {m.date}
                  </p>
                  <MatchRow match={m} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionHead
              eyebrow="Individual honours"
              title="Leaderboard"
              action={
                <ButtonLink to="/leaderboard" variant="outline">
                  Full board
                </ButtonLink>
              }
            />
            {board && (
              <div className="surface overflow-hidden rounded-card">
                <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
                  {board.title}
                </p>
                {/* top 10 only on the home page */}
                <LeaderboardTable board={board} limit={10} />
              </div>
            )}
          </div>
        </div>
      </Container>
    </Section>
  )
}

/* ================================================================== ABOUT */
export function AboutStrip() {
  return (
    <Section>
      <Container size="wide">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <div>
            <SectionHead eyebrow="About us" title={SITE.tagline} />
            <div className="space-y-5 text-base leading-relaxed text-[var(--text-muted)]">
              <p>{siteData.about.intro}</p>
              <p className="border-l-2 border-[var(--accent-ring)] pl-5 font-display text-lg font-semibold leading-snug text-[var(--text-strong)]">
                {siteData.about.vision}
              </p>
            </div>
            <ButtonLink to="/about" variant="outline" className="mt-8">
              More about IWVPL
            </ButtonLink>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile label="Clubs registered" value={siteData.clubs.length} hint="Across SEA" />
            <StatTile label="Goals scored" value={totalGoals(siteData.results)} hint="This season" />
            <StatTile label="Divisions" value="5" hint="Championship → Div 3" />
            <StatTile label="Entry fee" value={SITE.registrationFee} hint="Per team" />
          </div>
        </div>
      </Container>
    </Section>
  )
}

/* =================================================================== NEWS */
export function NewsSection() {
  const posts = siteData.news.slice(0, 3)
  return (
    <Section tone="raised">
      <Container size="wide">
        <SectionHead
          eyebrow="Insights"
          title="Latest news"
          lede="Discover the latest news, upcoming features, and official announcements from the IWVPL admin team."
          action={
            <ButtonLink to="/news" variant="outline">
              All news
            </ButtonLink>
          }
        />

        <div className="grid gap-6 md:grid-cols-3">
          {posts.map((p, i) => (
            <Reveal key={p.id} delay={i * 80}>
              <Link to={`/news/${p.slug}`} className="group block h-full">
                <Card as="article" interactive className="flex h-full flex-col overflow-hidden">
                  <NewsThumb post={p} />
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                      {p.date}
                    </p>
                    <h3 className="mt-2.5 text-base font-bold leading-snug text-[var(--text-strong)] transition-colors group-hover:text-[var(--text-strong)] group-hover:text-[var(--accent-text)]">
                      {p.title}
                    </h3>
                    <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                      {p.excerpt}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-text)]">
                      Read more
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </span>
                  </div>
                </Card>
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  )
}

/** News thumbnail. The category badge sits on its own dark plate so it stays
 *  legible over bright artwork. */
export function NewsThumb({ post }: { post: { featuredLocal: string; categories: string[] } }) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-[var(--bg-deep)]">
      <img
        src={post.featuredLocal}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-deep)]/85 via-transparent to-black/25" />
      {post.categories[0] && (
        <span className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-lg ring-1 ring-white/15 backdrop-blur-sm">
          {post.categories[0]}
        </span>
      )}
    </div>
  )
}

/* ============================================================== JOIN CTA */
export function JoinCta() {
  const left = SITE.teamCap - SITE.teamsRegistered
  const pct = Math.round((SITE.teamsRegistered / SITE.teamCap) * 100)
  return (
    <Section tone="deep">
      <Container size="wide">
        <div className="surface relative overflow-hidden rounded-xl p-8 sm:p-12 lg:p-16">
          <div aria-hidden data-parallax="0.12" className="parallax-layer pointer-events-none absolute inset-0 bg-grid opacity-60" />
          <div aria-hidden data-parallax="0.2" className="parallax-layer pointer-events-none absolute inset-0 bg-radial-volt" />

          <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <Eyebrow className="mb-4">Registration open</Eyebrow>
              <h2 className="text-3xl font-bold sm:text-4xl lg:text-[2.75rem]">
                Kickstart your story and{' '}
                <span className="text-gradient">elevate your career</span> alongside IWVPL.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-[var(--text-muted)]">
                {SITE.teamsRegistered} clubs have already signed up. Only{' '}
                <span className="font-semibold text-[var(--text-strong)]">{left} slots</span> remain
                for {SITE.season} at {SITE.registrationFee} per team.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:flex-col xl:flex-row">
              <ButtonLink to="/register" size="lg">
                Sign up
              </ButtonLink>
              <ButtonLink to="/contact" variant="outline" size="lg">
                Talk to us
              </ButtonLink>
            </div>
          </div>

          <div className="relative mt-10">
            <div className="flex items-end justify-between gap-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                Season capacity
              </span>
              <span className="numeric text-sm font-semibold text-[var(--text-strong)]">
                {SITE.teamsRegistered} / {SITE.teamCap}
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] transition-[width] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={SITE.teamsRegistered}
                aria-valuemin={0}
                aria-valuemax={SITE.teamCap}
                aria-label="Season capacity filled"
              />
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}

/* ============================================================== SPONSORS */
export function Sponsors() {
  // The real partner logos from the original site, shown bare — no card,
  // no border, no plate. Both are black artwork, so they are inverted only in
  // dark mode.
  const items = [
    {
      src: asset('/assets/sponsors/spintrillz-renovation.png'),
      alt: 'Spintrillz Renovation',
      href: 'https://www.tiktok.com/@spintrillzreno',
    },
    {
      src: asset('/assets/sponsors/we-made-supply.png'),
      alt: 'We Made Supply',
      href: null,
    },
  ]

  return (
    <Section tone="deep" className="!py-16">
      <Container size="narrow">
        <div className="text-center">
          <Eyebrow className="mb-5">Proudly sponsored by</Eyebrow>
          <p className="mb-12 text-sm text-[var(--text-muted)]">
            A special thanks to our generous partners.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-10">
          {items.map((it, i) => {
            const img = (
              <img
                src={it.src}
                alt={it.alt}
                loading="lazy"
                decoding="async"
                className={cx(
                  'h-20 w-auto max-w-[240px] select-none object-contain',
                  'opacity-70 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  'hover:scale-[1.06] hover:opacity-100 dark:invert',
                )}
              />
            )
            return (
              <Reveal key={it.src} delay={i * 120}>
                {it.href ? (
                  <a href={it.href} target="_blank" rel="noreferrer noopener" className="block">
                    {img}
                  </a>
                ) : (
                  img
                )}
              </Reveal>
            )
          })}
        </div>
      </Container>
    </Section>
  )
}