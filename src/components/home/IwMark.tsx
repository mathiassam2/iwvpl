/**
 * The IWVPL "iw" mark.
 *
 * Geometry comes from `public/assets/svg/iwvpl-logo.svg`, an Illustrator
 * export of the full "iw | VIRTUAL PREMIER LEAGUE" lockup. Only the mark -
 * the left of the divider - is used here.
 *
 * Taking the export apart:
 *   - it carries 23 filled paths. Paths 2-22 are the wordmark text, path 0 is
 *     the vertical divider, and paths 1 and 9 are the mark: path 1 is the
 *     dot of the "i" and path 9 is the stem and the wave.
 *   - so it is two filled paths, not the three-stroke shape an earlier
 *     hand-traced approximation suggested.
 *
 * The export wraps everything in `translate(0,246) scale(0.1,-0.1)`, which is
 * load-bearing: the path coordinates are roughly ten times the viewBox and
 * y-inverted. That group is preserved verbatim here - dropping it puts the
 * mark ten times off-canvas.
 *
 * The viewBox is cropped to the mark's measured extent rather than the
 * export's full 600x246 lockup box. Mapped through the transform, path 1 (the
 * dot) occupies y -4 to 57 and path 9 occupies y 66 to 245, so the box has to
 * start ABOVE the dot - a crop fitted to path 9 alone silently clips it and
 * renders a mark with no dot at all, which is exactly what happened first
 * time.
 *
 * The gap filled below is genuine geometry, not a fill-rule artefact -
 * nonzero and evenodd render identically. Path 9 encloses a thin dark slash
 * where the stem's right edge nearly meets the wave's left arm. It reads as
 * a tear rather than as a deliberate counter, so it is covered.
 *
 * Nothing in the export needs repairing, but the mark does enclose two
 * teardrop counters in the "w" which are covered below by design choice.
 *
 * Fill is `currentColor`, so the mark is themed by CSS like any other text.
 *
 * The two `d` strings are copied verbatim out of the export rather than
 * retyped - a hand transcription dropped a `-136` from one cubic segment,
 * which left a five-number group, and the browser logged a parse error and
 * silently dropped the tail of the dot. Re-splice them with the snippet at
 * the end of this file's history if the source file is ever replaced.
 *
 * Decorative: always rendered with `aria-hidden`, with the surrounding copy
 * carrying the meaning for assistive tech.
 */
export function IwMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 -8 270 256" aria-hidden="true" focusable="false">
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

        {/* Counter fills.

            The "w" encloses two teardrop-shaped counters - the kind of hole an
            "a" has - at (49.7,168.1)-(92.1,212.9) and (204.9,172.1)-(236.5,210.7)
            in viewBox units. They were found by rendering the mark, labelling
            connected regions of non-white pixels and keeping the ones that do
            not touch the canvas edge.

            They are real geometry, not a fill-rule artefact: nonzero and evenodd
            render identically. They are covered anyway - at the sizes this mark
            is used at they read as dirt rather than as counters.

            Converted to the path's own coordinates (ten times the viewBox, with
            y inverted) and padded ~40 units on each side so no hairline seam
            survives. Both counters sit well inside the surrounding stroke, so
            the padding does not reach the mark's outer outline. */}
        <rect x="460" y="291" width="500" height="528" rx="200" />
        <rect x="2010" y="313" width="394" height="466" rx="160" />
      </g>
    </svg>
  )
}