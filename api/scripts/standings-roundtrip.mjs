/**
 * Round-trip check for the incremental standings update.
 *
 * The snapshot is edited by applying and reversing results rather than being
 * recomputed, so the only property that matters is that those operations are
 * exact inverses. A drifting subtraction would stay invisible in the table
 * until someone compared it against reality weeks later.
 *
 * The invariant is *not* "withdrawing restores the previous snapshot". The
 * crawled snapshot already contains every seeded result, so the match under
 * test may already be counted once. Reversibility is therefore checked as
 * identity of the operations, never against a guessed baseline:
 *
 *   apply(R) twice      ===  apply(R) once
 *   apply(R); clear()   ===  the state before apply(R)
 *   ...; apply(R0)      ===  the seeded scoreline restored exactly
 *
 * where R0 is whatever the match carried before the run.
 *
 * Run against a live server: node scripts/standings-roundtrip.mjs [matchId]
 */

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:8080'
const AUTH = 'Basic ' + Buffer.from(`admin:${process.env.ADMIN_PASSWORD ?? ''}`).toString('base64')

const api = async (path, init = {}) => {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: AUTH },
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

const snapshot = async () => {
  const { body } = await api('/api/standings')
  return Object.fromEntries(
    body.standings.map((r) => [
      r.name,
      {
        pos: r.position, pl: r.played, w: r.won, d: r.drawn, l: r.lost,
        gf: r.goals_for, ga: r.goals_against, gd: r.goal_difference,
        pts: r.points, form: r.form,
      },
    ]),
  )
}

const diff = (a, b, names) =>
  names.flatMap((n) => {
    const x = a[n], y = b[n]
    if (!x || !y) return [`${n}: missing`]
    return Object.keys(x)
      .filter((k) => String(x[k]) !== String(y[k]))
      .map((k) => `${n}.${k}: ${x[k]} -> ${y[k]}`)
  })

let failures = 0
const check = (label, ok, problems = []) => {
  if (ok) {
    console.log(`  PASS  ${label}`)
  } else {
    failures++
    console.log(`  FAIL  ${label}`)
    for (const p of problems) console.log(`          ${p}`)
  }
}

const MATCH_ID = Number(process.argv[2] ?? 101)

const { body: list } = await api('/api/matches?limit=200')
const m = list.matches.find((x) => x.id === MATCH_ID)
if (!m) throw new Error(`match ${MATCH_ID} not found`)

const NAMES = [m.home_name, m.away_name]
const ORIGINAL = { homeScore: m.home_score, awayScore: m.away_score }
const PROBE = { homeScore: 4, awayScore: 2 }

console.log(`match ${MATCH_ID}: ${m.home_name} ${ORIGINAL.homeScore}-${ORIGINAL.awayScore} ${m.away_name}`)
console.log(`probe:            ${PROBE.homeScore}-${PROBE.awayScore}\n`)

const before = await snapshot()
const wasPlayed = ORIGINAL.homeScore !== null

/* 1. Applying a different result must change the table. */
const p1 = await api(`/api/admin/matches/${MATCH_ID}/result`, { method: 'POST', body: JSON.stringify(PROBE) })
check('POST probe result accepted', p1.status === 200, [JSON.stringify(p1.body)])
const afterProbe = await snapshot()
check('applying the probe changed both clubs', diff(before, afterProbe, NAMES).length > 0)

/* 2. THE reversibility invariant. Applying the same result a second time
      reverses it and reapplies it, so the table must land exactly where the
      first application left it. Compared against afterProbe rather than
      `before`, because the first application is itself a legitimate change. */
await api(`/api/admin/matches/${MATCH_ID}/result`, { method: 'POST', body: JSON.stringify(PROBE) })
const afterTwice = await snapshot()
const identity = diff(afterProbe, afterTwice, NAMES)
check('apply(R) twice equals apply(R) once', identity.length === 0, identity)

/* 3. Withdrawing removes the result. When the match arrived already counted in
      the seeded snapshot, `before` includes it, so withdrawing must land one
      played match below `before` — not on it. Check 4 proves the round trip. */
const d1 = await api(`/api/admin/matches/${MATCH_ID}/result`, { method: 'DELETE' })
check('withdraw accepted', d1.status === 200, [JSON.stringify(d1.body)])
const afterClear = await snapshot()
const dropped = NAMES.every(
  (n) => afterClear[n].pl === before[n].pl - (wasPlayed ? 1 : 0),
)
check(
  'withdrawing removed exactly one played match from each club',
  dropped,
  NAMES.map((n) => `${n}: pl ${before[n].pl} -> ${afterClear[n].pl}`),
)

/* 4. Re-entering the pre-run scoreline must reproduce the starting snapshot
      exactly — including form order and positions, which a sloppy undo breaks. */
if (wasPlayed) {
  const r0 = await api(`/api/admin/matches/${MATCH_ID}/result`, {
    method: 'POST',
    body: JSON.stringify(ORIGINAL),
  })
  check('re-entering the pre-run score accepted', r0.status === 200, [JSON.stringify(r0.body)])
  const afterRestore = await snapshot()
  const restored = diff(before, afterRestore, NAMES)
  check('re-entering the pre-run score restores the snapshot exactly', restored.length === 0, restored)
} else {
  console.log('  SKIP  match started unplayed; nothing to restore')
}

/* 5. Whole-division integrity. */
const { body: final } = await api('/api/standings')

const badPlayed = final.standings.filter((r) => r.played !== r.won + r.drawn + r.lost)
check('played = won + drawn + lost on every row', badPlayed.length === 0,
  badPlayed.map((r) => `${r.name}: ${r.played} != ${r.won}+${r.drawn}+${r.lost}`))

const badGd = final.standings.filter((r) => r.goal_difference !== r.goals_for - r.goals_against)
check('goal_difference = goals_for - goals_against on every row', badGd.length === 0,
  badGd.map((r) => `${r.name}: ${r.goal_difference} != ${r.goals_for - r.goals_against}`))

const ordered = final.standings.every((r, i, arr) => i === 0 || arr[i - 1].points >= r.points)
check('rows are ordered by points descending', ordered)

const pts = final.standings.filter((r) => r.points !== r.won * 3 + r.drawn)
check('points = won*3 + drawn on every row', pts.length === 0,
  pts.map((r) => `${r.name}: ${r.points} != ${r.won * 3 + r.drawn}`))

console.log('')
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)