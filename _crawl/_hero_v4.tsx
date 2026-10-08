/* ==================================================================== HERO */

/**
 * The four campaign slides the original site rotates through, in its own order.
 *
 * Only slide 1 gets the opening beat: it is the campaign key art with a
 * headline baked in, so it fills the viewport on its own for a moment, then the
 * working layout settles in over it and the headline types itself out. Slides
 * 2-4 are player shoutouts and show the layout immediately, unchanged.
 */
const HERO_SLIDES = [
  {
    src: '/assets/hero/slide-1.webp',
    alt: 'IWVPL Season 1 campaign — Let the Games Begin, with the league trophy',
    poster: true,
    label: 'Season 1 is live',
  },
  {
    src: '/assets/hero/slide-2.webp',
    alt: 'Community shoutout artwork for Osman',
    poster: false,
    label: 'Community shoutout · Osman',
  },
  {
    src: '/assets/hero/slide-3.webp',
    alt: 'Community shoutout artwork for Prabowo',
    poster: false,
    label: 'Community shoutout · Prabowo',
  },
  {
    src: '/assets/hero/slide-4.webp',
    alt: 'Community shoutout artwork for Ainnn',
    poster: false,
    label: 'Community shoutout · Ainnn',
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

const SLIDE_MS = 7200
/** How long slide 1 fills the viewport on its own before the layout settles in. */
const POSTER_MS = 2200

/* ------------------------------------------------------------------ typing */

/**
 * Reveals `total` characters over time.
 *
 * Driven by a flag rather than a remount: the headline element stays mounted
 * for the life of the carousel, so switching between slides 2-4 does not
 * restart it (an earlier version keyed the copy on the slide index, which
 * remounted and made every element flash on each change).
 */
function useTypewriter(active: boolean, total: number, speed = TYPE_MS, delay = TYPE_DELAY) {
  const [chars, setChars] = useState(0)

  useEffect(() => {
    if (!active) {
      setChars(total)
      return
    }
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
  const done = chars >= HEADLINE_CHARS

  return (
    <h1 className="mt-7 text-[2.6rem] font-extrabold leading-[1.02] text-balance sm:text-6xl lg:text-[4.25rem]">
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
          className="ml-1 inline-block h-[0.85em] w-[3px] translate-y-[0.08em] bg-[var(--accent)] align-baseline"
        />
      )}
    </h1>
  )
}

export function Hero() {
  const top = siteData.standings[0]
  const mobileHero = '/assets/brand/player-hero.webp'

  const [index, setIndex] = useState(0)
  const [settled, setSettled] = useState(false)
  const regionRef = useRef<HTMLElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)

  const count = HERO_SLIDES.length
  const go = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count)
      setSettled(false)
    },
    [count],
  )

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Poster -> layout. Only slide 1 holds; the rest settle immediately.
  useEffect(() => {
    if (reduced || !HERO_SLIDES[index].poster) {
      setSettled(true)
      return
    }
    const id = window.setTimeout(() => setSettled(true), POSTER_MS)
    return () => window.clearTimeout(id)
  }, [index, reduced])

  // Autoplay. Deliberately NOT paused on hover or focus - a visitor reading
  // the copy should not have the slide change mid-sentence.
  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => go(index + 1), SLIDE_MS)
    return () => window.clearInterval(id)
  }, [reduced, index, count, go])

  const slide = HERO_SLIDES[index]
  /** Slide 1 holds on its own art until this flips. */
  const fullBleed = slide.poster && !settled
  const showLayout = !fullBleed

  // Typing runs when the layout appears. It never re-runs on a slide change,
  // so slides 2-4 arrive with everything already in place.
  const chars = useTypewriter(showLayout, HEADLINE_CHARS)
  const typing = chars < HEADLINE_CHARS
  /** Supporting copy arrives once the headline has finished typing. */
  const restReady = chars >= HEADLINE_CHARS

  // `inert` must be set imperatively: React 18 drops it as a prop.
  useEffect(() => {
    setInert(copyRef.current, !showLayout)
  }, [showLayout])

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
  const arrive = (extra = 0) =>
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
      // Slide 1 fills the viewport on its own, then the frame animates back down
      // to the standard hero. `min-height` transitions between two explicit
      // values (100svh -> 0), because a transition to `auto` does not animate.
      // After that the height is whatever the layout content needs.
      className="relative isolate overflow-hidden transition-[min-height] duration-[1200ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none focus:outline-none"
      style={{ minHeight: fullBleed ? '100svh' : 0 }}
    >
      {/* ---------- imagery ---------- */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div data-parallax="0.1" className="parallax-layer absolute inset-0">
          <div className="absolute inset-0">
            {HERO_SLIDES.map((s, i) => {
              const active = i === index
              const poster = active && fullBleed
              return (
                <div
                  key={s.src}
                  data-slide={i}
                  aria-hidden
                  data-mode={poster ? 'poster' : 'layout'}
                  className={cx(
                    'absolute inset-0 transition-opacity duration-[1200ms]',
                    'ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none',
                    active ? 'opacity-100' : 'pointer-events-none opacity-0',
                  )}
                >
                  <div className="absolute inset-0 hidden lg:block">
                    {poster && (
                      /* Blurred cover behind the whole picture, so letterboxing
                         reads as a soft vignette rather than hard bars. */
                      <img
                        src={s.src}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
                        loading={i === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                      />
                    )}
                    <img
                      src={s.src}
                      alt=""
                      className={cx(
                        'absolute inset-0 h-full w-full transition-all duration-[1100ms]',
                        'ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none',
                        poster ? 'object-contain object-center' : 'object-cover object-center',
                        active && !poster && 'hero-kenburns',
                      )}
                      {...({ fetchpriority: i === 0 ? 'high' : 'low' } as Record<string, string>)}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </div>

                  <div className="absolute inset-0 lg:hidden">
                    {poster && (
                      <img
                        src={s.src}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <img
                      src={i === 0 ? mobileHero : s.src}
                      alt=""
                      className={cx(
                        'absolute inset-0 h-full w-full transition-all duration-[1100ms]',
                        'ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none',
                        i === 0
                          ? 'object-cover object-top'
                          : poster
                            ? 'object-contain'
                            : 'object-cover',
                        active && !poster && 'hero-kenburns',
                      )}
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

        <div
          className={cx(
            'absolute inset-0 transition-opacity duration-[1100ms]',
            showLayout ? 'opacity-100' : 'opacity-45',
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
          'relative flex items-center pb-20 pt-16 transition-opacity duration-700 lg:pb-24',
          showLayout ? 'opacity-100' : 'pointer-events-none opacity-0',
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
                'mt-11 grid max-w-lg grid-cols-3 gap-4 border-t border-[var(--border)] pt-8',
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

          <div className={arrive()}>
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

      {/* ---------- controls ---------- */}
      <div className="absolute inset-x-0 bottom-0">
        <Container size="wide" className="pb-5">
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
