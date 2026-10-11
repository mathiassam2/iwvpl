import { useId } from 'react'

/**
 * The IWVPL "iw" mark, drawn.
 *
 * Geometry comes from `public/assets/svg/iwvpl-logo.svg`, an Illustrator
 * export of the full "iw | VIRTUAL PREMIER LEAGUE" lockup. Only the mark -
 * the left of the divider - is used here. That export carries 23 filled
 * paths: 2-22 are the wordmark text, 0 is the vertical divider, and paths 1
 * and 9 are the mark (path 1 is the dot of the "i", path 9 the stem and wave).
 * Both `d` strings are copied verbatim out of the file rather than retyped -
 * a hand transcription dropped a `-136` from a cubic, which left a five-number
 * group, and the browser silently discarded the tail of the dot.
 *
 * THE COUNTERS ARE FILLED, AND THEY ARE NOT PART OF THE EXPORT.
 * The wave encloses two teardrop holes - the counter of an "a" - at roughly
 * (48,167)-(94,215) and (203,170)-(239,213) in viewBox units. They are
 * deliberate in the logo and they are closed here on purpose, so the wave
 * reads as one solid zigzag rather than as an outline.
 *
 * Those two fills are the part that is easy to get wrong. A first attempt
 * guessed at them with two oversized rounded rects, which ate several units
 * into the surrounding strokes on every side and left the mark looking melted
 * and hand-drawn rather than drawn. The shapes below are instead traced from
 * the real geometry: the export was rasterised, the enclosed background
 * regions were found by flood fill in from the border, and each hole's
 * outline was recovered as a 720-ray radial scan from its own centroid
 * (these holes are teardrops, so they are star-shaped from it and the scan
 * closes by construction), smoothed, and simplified to 0.06 units. Each
 * outline is then offset 1.6 units outward so the fill overlaps the
 * surrounding stroke and no anti-aliased seam survives where two fills meet.
 *
 * NOTE THE COORDINATE SPACE. The export's paths live under
 * `translate(0,246) scale(0.1,-0.1)` - ten times the viewBox and y-inverted -
 * but the traced contours are already in viewBox units, so they sit OUTSIDE
 * that transformed group. Dropping them inside scales them to a tenth of
 * their size and they disappear.
 *
 * WHY A MASK RATHER THAN A DASH ON THE FILL:
 * the export is FILLED geometry, so there is no stroke to dash. Drawing it
 * therefore works the way a marker does - a fat round-capped stroke is swept
 * along the mark's own skeleton and the real fill is revealed wherever the
 * marker has been. A mask can only ever reveal ink that is already there, so
 * it cannot distort the mark.
 *
 * The skeleton was measured, not eyeballed: the mark was rasterised and the
 * midpoint of the white run taken on each scanline, which gives the stem's
 * slight right lean and the wave's foot / crest / valley / hook sequence
 * directly. Hand-fitting it instead cost several percent of the ink to
 * clipping at the crest and around the counters.
 *
 * THE 80-UNIT PEN IS NOT ARBITRARY. The mark's own strokes are ~45 units
 * across, so a 45-wide marker would be the literal answer - and it clips,
 * because the skeleton of a hand-drawn wave never hugs a 45-wide stroke
 * exactly. Widths were swept against a rasterised diff: 54 lost 3.4% of the
 * ink, 66 still ate the counter edges, 78 lost four pixels out of 386,997,
 * and 80 is what ships. Widening past that buys nothing and makes the fill
 * appear visibly ahead of the tip.
 *
 * "NOTHING DRAWN YET" IS DONE WITH OPACITY, NOT WITH THE DASH.
 * At progress 0 the dash is zero-length and sitting on the path start, and
 * `stroke-linecap: round` renders a zero-length dash as a dot - which is what
 * the spec says it should do. So an 80-unit blob sat on the mark long before
 * it began drawing.
 *
 * The obvious fix, switching to butt caps, was tried and is worse. A butt cap
 * draws nothing for a zero-length dash, but it is also flat, and here it
 * broke two other things: the dot, being a closed path, swept as a hollow
 * ring rather than filling in, and the dot's 80-unit band bled into the top of
 * the stem. Round caps are what makes the pen read as a marker, so they stay
 * and `sd-mark-draw` fades the pen in over its first half percent instead.
 * `scripts/audit-iw-mark.mjs` fails the build if that `opacity: 0` goes missing
 * from the `from` keyframe.
 *
 * The three pen strokes are the three beats of the drawing, in the order a
 * hand would make them: the dot, then the stem straight DOWN, then the
 * diagonal wave. They share the statement section's `--stmt` scroll timeline
 * but begin only once the last word has landed - see `.iw-mark__pen` in the
 * stylesheet for why the range is as tight as it is.
 *
 * The viewBox is cropped to the mark's real extent, which has to start ABOVE
 * the dot (path 1 sits at viewBox y -4..57, path 9 at 66..245); a crop fitted
 * to path 9 alone silently clips the dot off.
 *
 * Decorative: always rendered with `aria-hidden`, with the surrounding copy
 * carrying the meaning for assistive tech.
 */
export function IwMark({ className }: { className?: string }) {
  // React's useId emits colons, which are not safe inside a url(#...) reference.
  const maskId = `iw-mark-mask-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg className={className} viewBox="0 -8 270 256" aria-hidden="true" focusable="false">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-12" y="-22" width="294" height="292">
          <g
            fill="none"
            stroke="#fff"
            strokeWidth="80"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* the dot of the "i" */}
            <circle className="iw-mark__pen iw-mark__pen--dot" pathLength="1" cx="27" cy="26" r="26" />
            {/* straight down the stem, leaning right as it falls into the foot */}
            <path
              className="iw-mark__pen iw-mark__pen--stem"
              pathLength="1"
              d="M 33 70 C 36 104, 40 140, 46 174 C 50 200, 55 220, 62 240"
            />
            {/* the wave: up out of the foot, over the crest, down to the valley, up to the hook */}
            <path
              className="iw-mark__pen iw-mark__pen--wave"
              pathLength="1"
              d="M 62 240 C 94 212, 130 168, 156 124 C 178 160, 203 208, 227 246 C 247 228, 256 182, 245 126"
            />
          </g>
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        <g transform="translate(0,246) scale(0.1,-0.1)" fill="currentColor">
          {/* the dot of the "i" */}
          <path d="M152 2384 c-91 -45 -142 -127 -141 -229 0 -111 51 -195 144 -239 136
-65 297 -7 355 126 45 103 21 226 -57 300 -75 71 -205 90 -301 42z" />

          {/* the stem and the wave */}
          <path d="M131 1787 c-47 -24 -47 -28 -3 -339 23 -161 64 -457 92 -658 83 -601
84 -606 169 -683 102 -92 222 -115 366 -71 46 14 80 46 405 375 409 413 389
400 458 307 22 -29 74 -107 115 -173 192 -303 282 -430 330 -466 149 -111 368
-85 486 58 60 73 70 120 91 427 11 155 24 335 28 401 10 137 3 181 -32 212
-33 28 -90 36 -226 31 -107 -3 -111 -4 -140 -33 -24 -24 -35 -52 -56 -135 -32
-128 -45 -155 -84 -168 -63 -22 -81 -4 -227 230 -65 105 -135 208 -156 229
-60 60 -119 83 -207 83 -123 0 -139 -11 -421 -295 -261 -263 -286 -281 -347
-258 -38 15 -70 47 -81 83 -6 17 -44 207 -86 421 -69 360 -77 392 -100 413
-25 21 -34 22 -188 22 -109 0 -170 -4 -186 -13z m526 -1033 c37 -14 97 -32
133 -41 36 -9 67 -18 70 -22 3 -3 19 -14 35 -23 41 -23 38 -66 -8 -143 -28
-47 -103 -136 -119 -141 -10 -3 -18 -9 -18 -14 0 -16 -58 -40 -97 -40 -54 0
-85 39 -127 162 -41 118 -36 250 11 277 27 16 46 13 120 -15z m1653 -29 c39
-20 56 -58 59 -123 4 -98 -21 -181 -71 -236 -25 -28 -87 -17 -124 22 -49 52
-58 65 -92 133 -32 66 -42 132 -22 144 6 4 8 10 5 14 -2 5 14 16 38 24 105 40
162 45 207 22z" />
        </g>

        {/*
          Counter fills. These are already in viewBox units, so they sit
          OUTSIDE the transformed group above - see the note in the doc
          comment. They are paths, not rects, and deliberately so: rects were
          the original guess and they melted the strokes.
        */}
        <g fill="currentColor">
          <path d="M92.33 189.45 L90.74 192.74 L89.13 195.49 L87.35 198.13 L84.54 201.8 L82.5 204.22 L80.15 206.7 L78.21 208.46 L77.58 208.87 L76.55 209.31 L75.92 209.75 L74.97 211.22 L74.66 211.56 L73.39 212.36 L71.84 213.07 L69.58 213.83 L67.65 214.28 L65.43 214.53 L64.31 214.51 L62.99 214.31 L61.5 213.86 L59.75 212.86 L58.06 211.33 L57.19 210.28 L55.82 208.24 L54.23 205.28 L53.25 203.15 L52.06 200.28 L50.94 197.19 L49.92 193.97 L49.07 190.31 L48.75 188.41 L48.48 186.24 L48.2 182.78 L48.33 178.14 L48.69 175.42 L49.23 173.08 L49.88 171.25 L50.3 170.37 L51.09 169.16 L51.72 168.44 L52.85 167.59 L54.14 166.99 L55.08 166.73 L56.35 166.65 L57.4 166.72 L58.96 166.97 L60.46 167.34 L67.34 169.59 L82.01 173.91 L84.96 174.84 L86.18 175.33 L87.29 175.97 L88.67 176.99 L91.69 178.99 L92.86 180.19 L93.42 181.19 L93.75 182.28 L93.83 182.96 L93.76 184.81 L93.18 187.31 Z" />
          <path d="M238.36 189.88 L238.37 191.45 L237.97 194.44 L237.46 197.05 L236.65 199.89 L235.17 203.66 L233.57 206.59 L232.35 208.38 L231.33 209.7 L230.19 210.97 L229.37 211.62 L228.63 211.97 L227.09 212.42 L226.29 212.52 L224.66 212.44 L222.67 212.02 L220.6 211.25 L218.69 210.21 L217.9 209.58 L215.16 207.03 L214.36 206.09 L213.42 205.21 L211.53 202.93 L210.08 200.89 L208.25 197.71 L206.75 194.72 L205.47 191.77 L204.81 189.88 L204.21 187.84 L203.63 185.11 L203.4 182.89 L203.45 180.99 L203.57 180.24 L203.97 179.21 L205.05 177.95 L205.27 176.74 L205.44 176.4 L206.19 175.81 L208.2 174.72 L211.58 173.38 L214.64 172.32 L219.12 171.1 L221.92 170.62 L223.45 170.47 L226.57 170.5 L228.47 170.81 L230.99 171.64 L232.99 172.77 L234.72 174.29 L235.38 175.12 L236.14 176.31 L236.82 177.74 L237.34 179.2 L237.69 180.51 L238.05 182.44 L238.27 183.83 L238.33 185.68 L238.51 186.69 L238.53 188.3 Z" />
        </g>
      </g>
    </svg>
  )
}