/**
 * Invitation to keep going, sitting between the hero and everything else.
 *
 * Decorative: a keyboard or screen-reader visitor has no need to be told
 * about a scrollbar, and hiding it costs nothing. Under reduced motion the
 * falling dot is parked mid-rail rather than removed, so the affordance
 * still reads.
 */
export function ScrollCue({ label = 'Scroll' }: { label?: string }) {
  return (
    <div className="cue" aria-hidden="true">
      <span className="cue__rail">
        <span className="cue__dot" />
      </span>
      <span className="cue__label">{label}</span>
    </div>
  )
}