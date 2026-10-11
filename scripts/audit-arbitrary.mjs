/**
 * Audits src/**\/*.tsx for Tailwind arbitrary values whose class is missing
 * from the built CSS.
 *
 * Tailwind v4 in this project silently drops a number of arbitrary values
 * (`grid-cols-[...]`, `object-[...]`, `from-[...]`) - the rule simply never
 * lands in the output and nothing warns. Two real bugs came out of that
 * already, so this checks for more.
 *
 * Comments are stripped before scanning. Without that the tool flags the prose
 * that explains *why* this class of value is avoided - the doc comment above
 * HERO_SLIDES literally quotes `object-[${pct}%_center]` as the thing to avoid,
 * and the audit would report it as a dropped value on every single build. A
 * guard that cries wolf is a guard that gets ignored.
 *
 * Only block comments and lines whose first non-space character is `//` are
 * removed. Trailing `//` comments are left alone because `//` also occurs
 * inside the `https://` strings scattered through the codebase, and eating
 * those would concatenate unrelated lines.
 *
 * Usage: node scripts/audit-arbitrary.mjs   (after `npm run build`)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'node:fs'

const SRC = 'src'
const CSS = globSync('dist/assets/*.css')[0]

if (!CSS) {
  console.error('no built css found - run `npm run build` first')
  process.exit(1)
}

const css = readFileSync(CSS, 'utf8')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/** class="..." / className={...} contents, plus bare string literals. */
const files = walk(SRC)
const findings = new Map()

/**
 * Removes comments so the scan below only ever sees live code.
 *
 * Block comments are matched across lines; line comments only when the line
 * opens with them. See the note in the header for why trailing `//` is left
 * in place.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

for (const file of files) {
  const src = stripComments(readFileSync(file, 'utf8'))
  // every arbitrary-value utility: a known prefix followed by [ ... ]
  const re = /(?:^|[\s"'`])((?:[a-z-]+:)*(?:grid-cols|grid-rows|col|row|object|object-position|from|via|to|translate|scroll-m|scroll-p|inset|top|right|bottom|left|w|h|min-w|max-w|min-h|max-h|gap|space-x|space-y|p[trblxy]?|m[trblxy]?|text|leading|tracking|shadow|bg|fill|stroke|grid|flex|order|basis|grow|shrink|aspect|overflow|opacity|z|font|rounded|border)-?\[[^\]\s"']+\])/g
  let m
  while ((m = re.exec(src))) {
    const token = m[1]
    // Tailwind escapes [ ] ( ) % # , . : / and quotes in class selectors.
    const escaped = token
      .replace(/([[\]()%#,./:'"])/g, '\\$1')
      .replace(/-/g, '-')
    const needle = escaped.split(':').pop()
    if (css.includes(needle)) continue
    // Fall back to the raw payload (e.g. "1.15fr") before flagging.
    const payload = token.slice(token.indexOf('[') + 1, token.lastIndexOf(']'))
    if (css.includes(payload)) continue
    if (!findings.has(token)) findings.set(token, new Set())
    findings.get(token).add(file)
  }
}

if (!findings.size) {
  console.log('OK - every arbitrary value found in the built CSS')
} else {
  console.log(`${findings.size} arbitrary value(s) NOT present in the build:\n`)
  for (const [token, where] of [...findings].sort()) {
    console.log(`  ${token}`)
    for (const f of where) console.log(`      ${f}`)
  }
  console.log(`\ncss: ${CSS}`)
}