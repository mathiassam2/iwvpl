import { useEffect } from 'react'

/**
 * Eases the results ticker to a crawl while the pointer is over it, and back
 * to full speed when it leaves. It never stops — a scoreboard crawl that
 * freezes reads as broken, and there is nothing here to click.
 *
 * WHY NOT `animation-duration` IN CSS.
 * The obvious one-liner is to transition the duration, but a CSS animation
 * keeps its `currentTime` when its duration changes and just recomputes
 * progress against the new one, so the track JUMPS to a new point in its loop
 * the instant the duration moves — it does not ease. The jump is worst at the
 * moment the new duration crosses the elapsed time, where progress flips
 * between `(s mod D) / D` and `s / D`.
 *
 * `playbackRate` is the right control: it is defined to preserve the current
 * position and change only how fast time advances, so the crawl in and the
 * return are both continuous. It has to be driven from script, and eased here
 * with a short rAF tween, because `playbackRate` is not a transitionable
 * property either.
 *
 * No-ops under reduced motion: the stylesheet already drops the animation
 * entirely there, so there is nothing to slow down and `getAnimations()` is
 * empty.
 */

const SLOW = 0.4
const DURATION_MS = 520

/** easeOutCubic — fast off the line, settling gently into the target speed. */
function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function useMarqueeSpeed(sectionRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const track = section.querySelector<HTMLElement>('.marquee__track')
    if (!track) return

    const anim = track.getAnimations().find((a) => a.animationName === 'sd-marquee')
    if (!anim) return

    let frame = 0

    const tween = (target: number) => {
      cancelAnimationFrame(frame)
      const from = anim.playbackRate
      if (Math.abs(from - target) < 0.001) {
        anim.playbackRate = target
        return
      }
      const start = performance.now()

      const step = () => {
        const t = Math.min(1, (performance.now() - start) / DURATION_MS)
        anim.playbackRate = from + (target - from) * ease(t)
        if (t < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }

    const onEnter = () => tween(SLOW)
    const onLeave = () => tween(1)

    section.addEventListener('pointerenter', onEnter)
    section.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      section.removeEventListener('pointerenter', onEnter)
      section.removeEventListener('pointerleave', onLeave)
      // Leaving mid-tween must not strand the track at a crawl.
      anim.playbackRate = 1
    }
  }, [sectionRef])
}