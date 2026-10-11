/**
 * Checks the "iw" mark against its source export.
 *
 * `src/components/home/IwMark.tsx` carries two `d` strings lifted out of
 * `public/assets/svg/iwvpl-logo.svg` (an Illustrator export of the full
 * "iw | VIRTUAL PREMIER LEAGUE" lockup; paths 1 and 9 are the mark, 0 is the
 * divider, 2-22 are the wordmark text).
 *
 * They are copied rather than retyped because hand transcription has already
 * broken twice, both times silently:
 *
 *   - a `-136` was dropped from a cubic, leaving a five-number group. The
 *     browser discards the tail of such a segment without complaint, so the
 *     dot rendered with a bite taken out of it and nothing errored;
 *   - the whole file was once rewritten by hand and the same damage came back.
 *
 * So this runs on every build and fails on either failure mode:
 *
 *   1. either `d` no longer matches the export, character for character
 *      (whitespace normalised), and
 *   2. any cubic group in the component does not have a multiple of six
 *      numbers, which is the signature of the transcription bug above.
 *
 * It also checks the two traced counter fills are still there and are drawn
 * as paths. They have to exist - the mark is meant to read as one solid
 * zigzag - and they have to be paths: a first attempt guessed at them with
 * two oversized rounded rects, which ate into the surrounding strokes and
 * left the mark looking melted rather than drawn.
 *
 * Usage: node scripts/audit-iw-mark.mjs
 */
import { readFileSync } from 'node:fs'

const SOURCE = 'public/assets/svg/iwvpl-logo.svg'
const COMPONENT = 'src/components/home/IwMark.tsx'

const source = readFileSync(SOURCE, 'utf8')
const component = readFileSync(COMPONENT, 'utf8')

const problems = []

/** Illustrator writes long `d` strings wrapped across lines. */
const normalise = (d) => d.replace(/\s+/g, ' ').trim()

const sourcePaths = [...source.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1])
const componentPaths = [...component.matchAll(/<path\s+d="([^"]+)"/g)].map((m) => m[1])

if (sourcePaths.length !== 23) {
  problems.push(`expected 23 paths in ${SOURCE}, found ${sourcePaths.length}`)
}
// 0 and 1 are the export's fill, 2 and 3 are the traced counter fills.
if (componentPaths.length !== 4) {
  problems.push(`expected 4 fill paths in ${COMPONENT}, found ${componentPaths.length}`)
}

const LABEL = ['dot of the "i"', 'stem and wave', 'counter fill 1', 'counter fill 2']
;[sourcePaths[1], sourcePaths[9]].forEach((want, i) => {
  const got = componentPaths[i]
  if (got === undefined) return
  if (normalise(got) !== normalise(want)) {
    problems.push(`${LABEL[i]}: d string differs from ${SOURCE}`)
  }
})

// A cubic segment carries six numbers per curve. A dropped sign or digit
// leaves five, seven, and so on - which is exactly how the dot lost its tail.
for (const [i, d] of componentPaths.entries()) {
  for (const seg of d.split(/(?=[a-zA-Z])/)) {
    if (!seg || (seg[0] !== 'c' && seg[0] !== 'C')) continue
    const n = seg.slice(1).split(/[\s,]+/).filter(Boolean).length
    if (n % 6 !== 0) {
      problems.push(`${LABEL[i] ?? `path ${i}`}: cubic segment has ${n} numbers, not a multiple of 6`)
    }
  }
}

// The counter fills must be closed outlines in viewBox units, drawn OUTSIDE
// the export's `translate(0,246) scale(0.1,-0.1)` group. Inside it they are
// scaled to a tenth of their size and silently vanish - the one thing a
// coordinate-magnitude check cannot catch, because the numbers themselves are
// fine. So check the structure: neither fill may appear inside that group.
const fills = componentPaths.slice(2)
if (fills.length === 2) {
  const exportGroup = component.match(
    /<g transform="translate\(0,246\) scale\(0\.1,-0\.1\)"[^>]*>[\s\S]*?<\/g>/,
  )
  if (!exportGroup) {
    problems.push(`${COMPONENT} no longer has the export's transform group`)
  } else {
    for (const [i, d] of fills.entries()) {
      if (!/^M[-\d.]/.test(d.trim()) || !/Z\s*$/.test(d.trim())) {
        problems.push(`counter fill ${i + 1} is not a closed outline`)
      }
      if (exportGroup[0].includes(d.trim())) {
        problems.push(
          `counter fill ${i + 1} sits inside the export's scale(0.1,-0.1) group. It is ` +
            `already in viewBox units, so it shrinks to a tenth of its size and vanishes.`,
        )
      }
    }
  }
}

if (/<rect/.test(component)) {
  problems.push(
    `${COMPONENT} draws rects over the fill. The counter fills are traced outlines - ` +
      `rects were the original guess and they melt the surrounding strokes.`,
  )
}

// "Nothing drawn yet" must be expressed with opacity, not with the dash.
//
// At progress 0 the dash is zero-length and sitting on the path start, and
// `stroke-linecap: round` renders a zero-length dash as a dot - the spec says
// it should. So the pen painted an 80-unit blob on the mark long before it
// began drawing. Worse, that is scale-dependent: the cap can round away to
// nothing at one rendered size and reappear at another, so it passes a check
// at one viewport width and fails at the next.
//
// Butt caps draw nothing for a zero-length dash but are flat, and here that
// made the dot sweep as a hollow ring and let its 80-unit band bleed into the
// top of the stem. Round caps are what make the pen read as a marker, so the
// `from` keyframe fades it in over its first half percent instead.
const keyframes = readFileSync('src/styles/index.css', 'utf8').match(
  /@keyframes sd-mark-draw\s*\{([\s\S]*?)\n\}/,
)
if (!keyframes) {
  problems.push('src/styles/index.css has no @keyframes sd-mark-draw - the pen would never animate')
} else {
  const fromBlock = keyframes[1].match(/from\s*\{([^}]*)\}/)
  if (!fromBlock || !/opacity:\s*0/.test(fromBlock[1])) {
    problems.push(
      'The `from` frame of @keyframes sd-mark-draw has no `opacity: 0`. Without it the pen is ' +
        'visible at rest, and a round cap turns the zero-length dash at progress 0 into an ' +
        '80-unit blob on the mark before it draws anything.',
    )
  }
  if (!/0\.5%\s*\{[^}]*opacity:\s*1/.test(keyframes[1])) {
    problems.push(
      'The `from` frame of @keyframes sd-mark-draw has no `0.5% { opacity: 1 }` step, so the ' +
        'pen never becomes visible.',
    )
  }
}

const cap = component.match(/strokeLinecap="([a-z]+)"/)
if (cap && cap[1] !== 'round') {
  problems.push(
    `${COMPONENT} sets strokeLinecap="${cap[1]}" on the pen. It must be "round": a butt cap is ` +
      `flat, which sweeps the dot as a hollow ring and lets its band bleed into the stem.`,
  )
}

if (problems.length) {
  console.error('iw mark audit failed:')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}

console.log(`iw mark audit passed - both export paths match ${SOURCE}, counter fills intact.`)