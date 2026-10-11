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

if (problems.length) {
  console.error('iw mark audit failed:')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}

console.log(`iw mark audit passed - both export paths match ${SOURCE}, counter fills intact.`)