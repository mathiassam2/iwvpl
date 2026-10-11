/**
 * The IWVPL "iw" mark, authored as vector so it can DRAW itself.
 *
 * There was no SVG anywhere - not in this repo, not in site_data.json, and not
 * on iwvpl.asia - only the raster lockups (`iwvpl-mark.png` and
 * `iwvpl-logo.png`, which are the full "iw + VIRTUAL PREMIER LEAGUE" lockup).
 * A stroke-dash reveal needs real geometry, so the two pieces were traced out
 * of the PNG: a filled disc at (46, 55) r46 for the dot, and one thick
 * monoline stroke for the stem-and-wave. Scanline runs across the alpha
 * channel gave the centreline; the stroke weight is ~56 in the same space.
 *
 * `pathLength="1"` normalises the path so the draw can be driven by a
 * dasharray of 1 and offset 1 -> 0 without hardcoding the real length. That
 * keeps the CSS independent of the path data.
 *
 * Presentational only - the preloader that renders it is aria-hidden, and the
 * page behind is already in the accessibility tree.
 */
export function BootMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="-18 -18 500 452"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* the dot of the "i" */}
      <circle className="boot__mark-dot" cx="46" cy="55" r="46" />

      {/* the stem of the "i". Scans across the alpha channel put its centreline
          at x=57 by y=150 and x=76 by y=258, which extrapolates to x~101 at the
          y=402 foot - so it leans right by about 10 degrees, as drawn. */}
      <path
        className="boot__mark-path boot__mark-stem"
        pathLength="1"
        d="M50 112 L101 400"
      />

      {/* the wave of the "w". Two crests, the first at (258, 196) and the
          second at (418, 224), with the valley between them at (344, 350). */}
      <path
        className="boot__mark-path boot__mark-wave"
        pathLength="1"
        d="M146 382 C172 288 212 196 258 196 C304 196 322 288 344 350 C364 284 390 222 418 224"
      />
    </svg>
  )
}