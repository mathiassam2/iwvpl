import { useEffect } from 'react'

/**
 * Writes a per-element `--parallax-y` offset based on how far the element has
 * scrolled past the viewport centre. The actual transform lives in CSS
 * (`.parallax-layer`) so this never triggers layout.
 *
 * Elements opt in with `data-parallax="<speed>"`; speeds are clamped so a
 * fast scroll can never push a layer off-screen.
 */
export function useParallax(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const layers = new Map<HTMLElement, number>()

    const collect = () => {
      layers.clear()
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
        const speed = Number(el.dataset.parallax ?? 0.15)
        if (!Number.isFinite(speed)) return
        const rect = el.getBoundingClientRect()
        if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return
        layers.set(el, speed)
      })
    }

    const update = () => {
      frame = 0
      const vh = window.innerHeight
      layers.forEach((speed, el) => {
        const rect = el.getBoundingClientRect()
        // -1 (below viewport) .. +1 (above viewport)
        const progress = (rect.top + rect.height / 2 - vh / 2) / (vh / 2 + rect.height / 2)
        const offset = Math.max(-1, Math.min(1, progress)) * speed * 90
        el.style.setProperty('--parallax-y', `${offset.toFixed(2)}px`)
      })
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    const onResize = () => {
      collect()
      update()
    }

    collect()
    update()

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [enabled])
}