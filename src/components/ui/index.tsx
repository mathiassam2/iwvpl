import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ImgHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { cx } from '@/lib/format'

/* ------------------------------------------------------------------ Container */
export const Container = forwardRef<HTMLDivElement, {
  children: ReactNode
  className?: string
  size?: 'default' | 'wide' | 'narrow'
}>(function Container({ children, className, size = 'default' }, ref) {
  const widths = {
    narrow: 'max-w-3xl',
    default: 'max-w-7xl',
    wide: 'max-w-[110rem]',
  }
  return (
    <div ref={ref} className={cx('mx-auto w-full px-5 sm:px-6 lg:px-8', widths[size], className)}>
      {children}
    </div>
  )
})

/* -------------------------------------------------------------------- Eyebrow */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent-text)]',
        className,
      )}
    >
      <span aria-hidden className="h-px w-6 bg-current opacity-60" />
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------- Section */
export function Section({
  children,
  className,
  id,
  tone = 'base',
}: {
  children: ReactNode
  className?: string
  id?: string
  tone?: 'base' | 'raised' | 'deep'
}) {
  const tones = {
    base: 'bg-[var(--bg)]',
    raised: 'bg-[var(--bg-raised)]',
    deep: 'bg-[var(--bg-deep)]',
  }
  return (
    <section
      id={id}
      className={cx('relative py-16 text-[var(--text)] sm:py-20 lg:py-24', tones[tone], className)}
    >
      {children}
    </section>
  )
}

/* ----------------------------------------------------------------- SectionHead */
export function SectionHead({
  eyebrow,
  title,
  lede,
  action,
  align = 'left',
}: {
  eyebrow?: string
  title: ReactNode
  lede?: ReactNode
  action?: ReactNode
  align?: 'left' | 'center'
}) {
  return (
    <div
      className={cx(
        'mb-10 flex flex-col gap-5 sm:mb-12',
        align === 'center' ? 'items-center text-center' : 'md:flex-row md:items-end md:justify-between',
      )}
    >
      <div className={cx('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
        <h2 className="text-3xl font-bold sm:text-4xl lg:text-[2.75rem]">{title}</h2>
        {lede && (
          <p className="mt-4 text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">{lede}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------------- Card */
export function Card({
  children,
  className,
  as: As = 'div',
  interactive = false,
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'article' | 'li' | 'section'
  interactive?: boolean
}) {
  return (
    <As className={cx('surface rounded-card', interactive && 'lift', className)}>{children}</As>
  )
}

/* --------------------------------------------------------------------- Badge */
type BadgeTone = 'volt' | 'gold' | 'flame' | 'neutral' | 'success' | 'muted'

const BADGE_TONES: Record<BadgeTone, string> = {
  volt: 'bg-[var(--accent-tint)] text-[var(--accent-text)] ring-1 ring-inset ring-[var(--accent-ring)]',
  gold: 'bg-[var(--badge-gold-bg)] text-[var(--badge-gold-fg)]',
  flame: 'bg-[var(--badge-down-bg)] text-[var(--badge-down-fg)]',
  success: 'bg-[var(--accent-tint)] text-[var(--accent-text)] ring-1 ring-inset ring-[var(--accent-ring)]',
  muted: 'bg-[var(--surface-2)] text-[var(--text-muted)] ring-1 ring-inset ring-[var(--border)]',
  neutral:
    'bg-[var(--surface-hover)] text-[var(--text)] ring-1 ring-inset ring-[var(--border-strong)]',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  live = false,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
  live?: boolean
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
        BADGE_TONES[tone],
        className,
      )}
    >
      {live && <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* --------------------------------------------------------------------- Button */
type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--accent-solid)] text-[var(--on-volt)] hover:bg-[var(--accent-hover)] shadow-[0_8px_24px_-10px_rgb(200_255_61/0.6)] hover:shadow-[0_12px_32px_-10px_rgb(200_255_61/0.75)]',
  secondary: 'bg-[var(--text-strong)] text-[var(--bg)] hover:opacity-90',
  outline:
    'border border-[var(--border-strong)] text-[var(--text-strong)] hover:border-[var(--accent-ring)] hover:bg-[var(--surface-hover)]',
  ghost: 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]',
  danger: 'bg-[var(--danger-text)] text-white hover:bg-flame-600',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[52px] px-7 text-[15px]',
}

const baseBtn =
  'group inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap ' +
  'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50'

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cx(baseBtn, VARIANTS[variant], SIZES[size], extra)
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: {
  children: ReactNode
  variant?: Variant
  size?: Size
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  )
}

export function ButtonLink({
  to,
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: {
  to: string
  children: ReactNode
  variant?: Variant
  size?: Size
} & Omit<React.ComponentProps<typeof Link>, 'to'>) {
  const external = to.startsWith('http') || to.startsWith('mailto')
  if (external) {
    return (
      <a href={to} className={buttonClass(variant, size, className)} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <Link to={to} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  )
}

/* ------------------------------------------------------------------ SmartImage */
/** Image with graceful fallback to a local SVG placeholder. */
export function SmartImage({
  src,
  fallback,
  alt,
  className,
  wrapperClassName,
  ...rest
}: {
  src: string
  fallback: string
  alt: string
  className?: string
  wrapperClassName?: string
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>) {
  const [failed, setFailed] = useState(false)
  const finalSrc = !src || failed ? fallback : src
  return (
    <span className={cx('block overflow-hidden', wrapperClassName)}>
      <img
        src={finalSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cx('block h-full w-full object-contain', className)}
        {...rest}
      />
    </span>
  )
}

/* ----------------------------------------------------------------------- Tabs */
/** Bare tabs: no outer pill container, just the underline indicator. */
export function Tabs({
  tabs,
  active,
  onChange,
  className,
  idPrefix = 'tab',
}: {
  tabs: Array<{ id: string; label: string; count?: number }>
  active: string
  onChange: (id: string) => void
  className?: string
  idPrefix?: string
}) {
  return (
    <div
      role="tablist"
      className={cx('no-scrollbar -mx-1 flex gap-1 overflow-x-auto', className)}
    >
      {tabs.map((t) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            id={`${idPrefix}-${t.id}`}
            role="tab"
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={cx(
              'relative shrink-0 px-3.5 py-2.5 text-sm font-semibold transition-colors duration-300 sm:px-4',
              on
                ? 'text-[var(--text-strong)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className={cx('ml-1.5 text-xs', on ? 'text-[var(--accent-text)]' : 'text-[var(--text-faint)]')}>
                {t.count}
              </span>
            )}
            <span
              aria-hidden
              className={cx(
                'absolute inset-x-2 bottom-0 h-[2px] rounded-full transition-all duration-300',
                on ? 'bg-[var(--accent-solid)] opacity-100' : 'bg-current opacity-0',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------- Accordion */
export function Accordion({ items }: { items: Array<{ q: string; a: string }> }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-card border border-[var(--border)] bg-[var(--surface)]">
      {items.map((item, i) => {
        const isOpen = open === i
        return (
          <div key={item.q}>
            <h3>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left transition-colors hover:bg-[var(--surface-hover)] sm:px-6"
              >
                <span className="flex items-start gap-4">
                  <span className="numeric mt-0.5 text-sm text-[var(--accent-text)]/70">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-display text-base font-semibold text-[var(--text-strong)] sm:text-lg">
                    {item.q}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cx(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] text-[var(--text-muted)] transition-all duration-300',
                    isOpen && 'rotate-45 border-[var(--accent-ring)] bg-[var(--accent-tint)] text-[var(--accent-text)]',
                  )}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
            </h3>
            <div
              id={`faq-panel-${i}`}
              className={cx(
                'grid transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]',
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-6 pl-[3.25rem] text-sm leading-relaxed text-[var(--text-muted)] sm:px-6 sm:pl-[3.75rem] sm:text-[15px]">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------- RevealBlock */
/**
 * Scroll-triggered fade-up.
 *
 * Hardened against two ways content could stay stuck at opacity 0: an element
 * that is already on screen when it mounts, and an environment without
 * IntersectionObserver. Both fall back to revealing immediately.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reveal = () => {
      el.style.transitionDelay = `${delay}ms`
      el.classList.add('in-view')
    }

    if (typeof IntersectionObserver === 'undefined') {
      reveal()
      return
    }

    // Already visible (deep link, back-navigation, restored scroll)?
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      reveal()
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          reveal()
          io.disconnect()
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)

    // Last-resort guard: never leave content invisible.
    const failsafe = window.setTimeout(() => {
      if (!el.classList.contains('in-view')) {
        const r = el.getBoundingClientRect()
        if (r.top < window.innerHeight && r.bottom > 0) reveal()
      }
    }, 1200)

    return () => {
      io.disconnect()
      window.clearTimeout(failsafe)
    }
  }, [delay])

  return (
    <div ref={ref} className={cx('reveal', className)}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ EmptyState */
export function EmptyState({
  title,
  hint,
  className,
}: {
  title: string
  hint?: string
  className?: string
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center gap-2 rounded-card border border-dashed border-[var(--border-strong)] px-6 py-16 text-center',
        className,
      )}
    >
      <p className="font-display text-lg font-semibold text-[var(--text)]">{title}</p>
      {hint && <p className="max-w-sm text-sm text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}

/* ===================================================================== Select */
/**
 * Custom listbox. Replaces every native <select> in the app so the control
 * matches the design system in both themes and on every platform.
 */
export interface SelectOption {
  value: string
  label: string
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  id,
  ariaLabel,
  className,
  size = 'md',
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  id?: string
  ariaLabel?: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const listId = useId()
  const autoId = useId()
  const triggerId = id ?? autoId

  /* Viewport-relative geometry of the trigger, re-measured while the menu is
     open. A fixed-position panel cannot track its trigger on its own, so any
     scroll or resize between opening and picking an option used to leave the
     menu visually detached from the control. */
  const [box, setBox] = useState({ top: 0, left: 0, width: 0 })

  const selected = options.find((o) => o.value === value)

  const measure = useCallback(() => {
    const el = document.getElementById(triggerId)
    if (!el) return
    const r = el.getBoundingClientRect()
    setBox((prev) =>
      prev.top === r.bottom + 6 && prev.left === r.left && prev.width === r.width
        ? prev
        : { top: r.bottom + 6, left: r.left, width: r.width },
    )
  }, [triggerId])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, { capture: true })
      window.removeEventListener('resize', measure)
    }
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      // The listbox is portalled to document.body, so it is NOT inside
      // rootRef. Without the second check, pressing an option counted as an
      // outside click: the menu unmounted on pointerdown and the subsequent
      // click never reached the option, so the dropdown looked dead.
      if (rootRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const i = options.findIndex((o) => o.value === value)
    setActive(i >= 0 ? i : 0)
    const list = listRef.current
    if (list) {
      // Only inset the right edge when a scrollbar genuinely takes up space.
      setOverflowing(list.scrollHeight > list.clientHeight + 1)
    }
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({
      block: 'nearest',
    })
  }, [open, options, value])

  const commit = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(options[active]?.value ?? '')
    }
    if (e.key === 'Tab') setOpen(false)
  }

  const heights = { sm: 'h-9 text-[13px]', md: 'h-11 text-sm' }

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <button
        type="button"
        id={triggerId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={cx(
          'flex w-full items-center justify-between gap-2 rounded-full border bg-[var(--surface-solid)] px-5 text-left font-medium text-[var(--text-strong)]',
          'transition-colors duration-200 hover:border-[var(--accent-ring)]',
          heights[size],
          open ? 'border-[var(--accent-ring)]' : 'border-[var(--border-strong)]',
        )}
      >
        <span className={cx('truncate', !selected && 'text-[var(--text-faint)]')}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden
          className={cx(
            'shrink-0 text-[var(--text-muted)] transition-transform duration-300',
            open && 'rotate-180',
          )}
        >
          <path d="M1 4l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      {/*
        Portalled so the menu is never clipped by a scroll container.

        The rows are full-bleed (the panel has no horizontal padding) and the
        tick lives in a fixed-width right-hand slot, so every option has an
        identical box and nothing looks inset. `scrollbar-gutter: stable` was
        removed: reserving the gutter unconditionally left a dead strip down the
        right-hand side whenever the list did not actually scroll.
      */}
      {open &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={triggerId}
            tabIndex={-1}
            style={{
              position: 'fixed',
              /* Position comes from state, not a one-off measurement. The panel
                 is `position: fixed`, so its coordinates are viewport-relative:
                 measuring once at open left it pinned in place while the page
                 scrolled, detaching it from the trigger. */
              top: box.top,
              left: box.left,
              width: box.width,
              maxHeight: 320,
            }}
            data-overflowing={overflowing || undefined}
            className="scroll-slim z-[90] overflow-y-auto overscroll-contain rounded-xl border border-[var(--border-strong)] bg-[var(--surface-solid)] py-1 shadow-[var(--shadow-lift)]"
          >
            {options.length === 0 && (
              <p className="px-4 py-3 text-sm text-[var(--text-faint)]">No options</p>
            )}
            {options.map((o, i) => {
              const on = o.value === value
              return (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={on}
                  data-active={i === active}
                  onClick={() => commit(o.value)}
                  onPointerMove={() => setActive(i)}
                  className={cx(
                    'flex w-full cursor-pointer items-center gap-3 py-2.5 pl-4 text-sm transition-colors',
                    // Only inset the right edge when a scrollbar is genuinely
                    // taking up layout space there.
                    overflowing ? 'pr-8' : 'pr-4',
                    i === 0 && 'rounded-t-[11px]',
                    i === options.length - 1 && 'rounded-b-[11px]',
                    i === active ? 'bg-[var(--surface-hover)]' : '',
                    on ? 'font-semibold text-[var(--text-strong)]' : 'text-[var(--text-muted)]',
                    i === active && !on && 'text-[var(--text)]',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span
                    aria-hidden
                    className={cx(
                      'w-3 shrink-0 text-center text-[var(--accent-text)]',
                      on ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    &#10003;
                  </span>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

