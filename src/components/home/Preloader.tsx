import { useCallback, useEffect, useRef, useState } from 'react'
import { cx } from '@/lib/format'

/**
 * Entrance cover, in the spirit of a broadcast open: wordmark, counter,
 * a rule that fills. It sits over the hero, which has already painted by
 * the time this mounts — so it delays nothing and costs nothing in LCP.
 */

/** Total run from mount. This is an entrance beat, not a load gate: there
 *  is nothing behind it worth waiting for, so it stays short. */
const RUN_MS = 1150
/** Matches the .boot opacity/visibility transition. */
const FADE_MS = 520
/** Belt-and-braces: if rAF is starved (backgrounded tab, throttled frame)
 *  the cover still clears on a timer. It must never be able to stick. */
const HARD_STOP_MS = RUN_MS + 500
/** Once per browser session. Replaying it on every return to the home page
 *  is the quickest way to make a visitor hate the site. */
const FLAG = 'iwvpl:booted'

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** sessionStorage throws outright in some privacy modes. */
function readFlag(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

export function Preloader() {
  const [phase, setPhase] = useState<'run' | 'out' | 'gone'>('run')
  const [pct, setPct] = useState(0)
  const raf = useRef(0)

  /* ---------------------------------------------- run + hard stop */
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || readFlag()) {
      setPhase('gone')
      return
    }

    const root = document.documentElement
    root.classList.add('is-loading')

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / RUN_MS)
      setPct(Math.round(easeOutCubic(t) * 100))
      if (t < 1) {
        raf.current = requestAnimationFrame(tick)
      } else {
        setPhase('out')
      }
    }
    raf.current = requestAnimationFrame(tick)

    const hardStop = window.setTimeout(() => {
      cancelAnimationFrame(raf.current)
      setPct(100)
      setPhase('out')
    }, HARD_STOP_MS)

    return () => {
      cancelAnimationFrame(raf.current)
      window.clearTimeout(hardStop)
      // Unconditional: leaving the home page mid-run must never leave the
      // page unscrollable behind a cover that is no longer mounted.
      root.classList.remove('is-loading')
    }
  }, [])

  /* ---------------------------------------------------- release */
  useEffect(() => {
    if (phase !== 'out') return
    const id = window.setTimeout(() => {
      setPhase('gone')
      document.documentElement.classList.remove('is-loading')
      try {
        sessionStorage.setItem(FLAG, '1')
      } catch {
        /* private mode - it just replays next visit */
      }
    }, FADE_MS)
    return () => window.clearTimeout(id)
  }, [phase])

  const skip = useCallback(() => {
    cancelAnimationFrame(raf.current)
    setPct(100)
    setPhase('out')
  }, [])

  /* Any press gets you in early. Escape is the obvious one; Tab matters
     too, because a keyboard visitor must not be trapped behind it. */
  useEffect(() => {
    if (phase !== 'run') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') skip()
    }
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', onKey)
    }
  }, [phase, skip])

  if (phase === 'gone') return null

  return (
    /* Purely decorative: the live content behind is already in the
       accessibility tree, and a counter ticking 60 times a second
       inside an aria-live region would be unusable. */
    <div className={cx('boot', phase === 'out' && 'is-done')} aria-hidden="true">
      <div className="boot__inner">
        <p className="boot__mark">IWVPL</p>
        <p className="boot__sub">Island-Wide Virtual Premier League</p>
        <p className="boot__count">{pct}</p>
        <div className="boot__track">
          <div className="boot__fill" />
        </div>
      </div>
      <p className="boot__skip">Tap to enter</p>
    </div>
  )
}