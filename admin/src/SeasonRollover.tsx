/**
 * Ending the season.
 *
 * Three steps, because the one decision that matters — which leagues take part
 * — is not the same decision as naming the season, and neither is worth getting
 * wrong on the way past. The admin picks the leagues, reads what that would do,
 * and only then commits.
 *
 * Everything the wizard shows comes from the server's planner. It does not work
 * out who moves, who is promoted or how large each league ends up: the preview
 * endpoint runs the same code the commit runs, so what is approved on screen is
 * what is written. A second implementation here would drift, and the drift would
 * show up as an admin approving one thing and getting another.
 *
 * A league that is not selected simply takes no part. Its neighbours' movement
 * across the gap is skipped rather than refused, because a ladder does not have
 * to turn over as a whole.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  completeSeason,
  previewSeasonRollover,
  undoSeasonRollover,
  type RolloverDivisionPlan,
  type RolloverPlan,
  type RolloverResult,
} from './api'

type Guard = <T>(fn: () => Promise<T>, what: string) => Promise<T>
type Report = (kind: 'ok' | 'error' | 'info', text: string) => void

type Step = 1 | 2 | 3

const STEP_TITLES = ['Choose the leagues', 'Check the movement', 'Name the season'] as const

/** "Top 2 · Bottom 1", or a note that the league does not move anyone. */
function movementLabel(division: RolloverDivisionPlan): string {
  const parts: string[] = []
  if (division.promotionCount) parts.push(`Top ${division.promotionCount}`)
  if (division.relegationCount) parts.push(`Bottom ${division.relegationCount}`)
  else if (division.relegationInferred) parts.push('Bottom 1 (inferred)')
  if (parts.length === 0) return 'No movement configured'
  return parts.join(' · ')
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function SeasonRollover({
  open,
  onClose,
  onCompleted,
  onUndone,
  guard,
  report,
}: {
  open: boolean
  onClose: () => void
  /** Fired once the new season exists, so the page can reload behind it. */
  onCompleted: (seasonId: number) => void
  /** Fired after an undo, which restores the season the page was on before. */
  onUndone: (seasonId: number) => void
  guard: Guard
  report: Report
}) {
  const [step, setStep] = useState<Step>(1)
  const [selected, setSelected] = useState<number[] | null>(null)
  const [plan, setPlan] = useState<RolloverPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [name, setName] = useState('')
  const [year, setYear] = useState('')
  const [settings, setSettings] = useState<Record<number, { promotion: string; relegation: string }>>({})
  const [busy, setBusy] = useState<'commit' | 'undo' | null>(null)
  const [result, setResult] = useState<RolloverResult | null>(null)

  // Guards against a slow preview for an earlier selection landing after a
  // faster one for the current selection and overwriting it.
  const requestId = useRef(0)

  // Opening the dialog starts over. An empty preview is enough to learn the
  // ladder, and seeding the selection with every league in it means the first
  // answer the admin sees is the one they most likely want: unticking is one
  // click, ticking five leagues is not.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStep(1)
    setName('')
    setYear('')
    setSettings({})
    setResult(null)
    setBusy(null)
    previewSeasonRollover([])
      .then((first) => {
        if (cancelled) return
        setSelected(first.divisions.map((division) => division.id))
      })
      .catch(() => {
        if (!cancelled) setSelected([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || selected === null) return
    const id = ++requestId.current
    setPlanLoading(true)
    previewSeasonRollover(selected)
      .then((next) => {
        if (id !== requestId.current) return
        setPlan(next)
        setSettings(
          Object.fromEntries(
            next.divisions.map((division) => [
              division.id,
              {
                promotion: division.promotionCount === null ? '' : String(division.promotionCount),
                relegation: division.relegationCount === null ? '' : String(division.relegationCount),
              },
            ]),
          ),
        )
      })
      .catch(() => {
        /* the empty state below stands in for a failed preview */
      })
      .finally(() => {
        if (id === requestId.current) setPlanLoading(false)
      })
  }, [open, selected])

  const toggle = (id: number, on: boolean) =>
    setSelected((current) => {
      const ids = current ?? []
      return on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id)
    })

  const ladder = useMemo(() => [...(plan?.divisions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [plan])
  const allIds = useMemo(() => ladder.map((division) => division.id), [ladder])
  const chosen = selected ?? []
  const blocked = (plan?.blocks.length ?? 0) > 0
  const running = plan?.legs.filter((leg) => !leg.skipped) ?? []
  const skipped = plan?.legs.filter((leg) => leg.skipped) ?? []
  const movedClubIds = new Set(running.flatMap((leg) => leg.clubs.map((club) => club.clubId)))

  const commit = async () => {
    if (!plan || blocked) return
    if (!name.trim() || !year.trim()) return
    const parsedYear = Number(year)
    if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 9999) {
      report('error', 'The year has to be a whole number between 2000 and 9999.')
      return
    }
    setBusy('commit')
    try {
      const divisionSettings = Object.fromEntries(
        ladder.map((division) => {
          const draft = settings[division.id]
          const toCount = (raw: string) => (raw.trim() === '' ? null : Number(raw))
          return [
            String(division.id),
            {
              promotion_count: draft ? toCount(draft.promotion) : division.promotionCount,
              relegation_count: draft ? toCount(draft.relegation) : division.relegationCount,
            },
          ]
        }),
      )
      const outcome = await guard(
        () =>
          completeSeason({
            divisionIds: chosen,
            name: name.trim(),
            year: parsedYear,
            divisionSettings,
          }),
        'Could not complete the season',
      )
      setResult(outcome)
      onCompleted(outcome.season.id)
      // Counted from the committed result rather than the preview: the server
      // re-plans inside the transaction, and this is what actually happened.
      const moved = new Set(outcome.movements.flatMap((movement) => movement.clubs.map((club) => club.clubId)))
      report('ok', `${outcome.season.name} started. ${plural(moved.size, 'club')} changed league.`)
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  const undo = async () => {
    if (!result) return
    setBusy('undo')
    try {
      const restored = await guard(
        () => undoSeasonRollover(result.season.id),
        'Could not undo the rollover',
      )
      onUndone(restored.restoredSeason.id)
      report('ok', `Rolled back. ${restored.restoredSeason.name} is current again.`)
    } catch {
      /* already reported */
    } finally {
      setBusy(null)
    }
  }

  if (!open) return null

  /* ------------------------------------------------------------- summary */

  if (result) {
    const resultMoved = new Set(
      result.movements.flatMap((movement) => movement.clubs.map((club) => club.clubId)),
    )
    return (
      <div className="squad-modal-backdrop" onMouseDown={() => busy === null && onClose()}>
        <div
          className="squad-modal rollover-summary-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rollover-summary-title"
        >
          <header>
            <div>
              <p className="eyebrow">SEASON COMPLETE</p>
              <h2 id="rollover-summary-title">{result.season.name} has started</h2>
              <p className="club-edit-subtitle">
                {result.movements.length === 0
                  ? 'No club changed league. Every league carried over exactly as it was.'
                  : `${plural(resultMoved.size, 'club')} changed league. The finished season keeps its own table and results.`}
              </p>
            </div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </header>
          <div className="club-edit-content">
            {result.movements.length > 0 && (
              <ul className="rollover-summary-list">
                {result.movements.map((movement, index) => (
                  <li key={`${movement.type}-${index}`}>
                    <span className={`rollover-direction ${movement.type}`}>
                      {movement.type === 'promotion' ? 'Promoted' : 'Relegated'}
                    </span>
                    <div>
                      <strong>
                        {movement.sourceDivisionName} → {movement.destinationDivisionName}
                      </strong>
                      <span>
                        {movement.clubs
                          .map((club) =>
                            club.position
                              ? `${club.clubName} (${ordinal(club.position)})`
                              : club.clubName,
                          )
                          .join(', ')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {result.warnings.length > 0 && (
              <div className="rollover-notices">
                {result.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
          </div>
          <footer className="club-edit-footer">
            <p className="fixture-summary">
              Nothing is deleted from the finished season. Undo removes {result.season.name} and
              puts the old one back exactly as it was.
            </p>
            <button type="button" className="btn" disabled={busy !== null} onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy !== null}
              onClick={() => void undo()}
            >
              {busy === 'undo' ? 'Undoing…' : 'Undo this rollover'}
            </button>
          </footer>
        </div>
      </div>
    )
  }

  /* -------------------------------------------------------------- wizard */

  const canGoNext = step === 1 ? ladder.length > 0 && !blocked : true
  const canCommit = step === 3 && name.trim() !== '' && year.trim() !== '' && !blocked && !planLoading

  return (
    <div className="squad-modal-backdrop" onMouseDown={() => busy === null && onClose()}>
      <div
        className="squad-modal season-rollover-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rollover-title"
      >
        <header>
          <div>
            <p className="eyebrow">END OF SEASON</p>
            <h2 id="rollover-title">Complete {plan?.seasonName ?? 'the season'}</h2>
            <p className="club-edit-subtitle">
              Finish the season, promote and relegate by final position, and start the next one.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" disabled={busy !== null} onClick={onClose}>
            ×
          </button>
        </header>

        <ol className="rollover-steps" aria-label="Progress">
          {STEP_TITLES.map((title, index) => {
            const number = (index + 1) as Step
            const state = number === step ? 'current' : number < step ? 'done' : 'todo'
            return (
              <li key={title} className={state} aria-current={number === step ? 'step' : undefined}>
                <button
                  type="button"
                  disabled={number > step || busy !== null}
                  onClick={() => setStep(number)}
                >
                  <span className="rollover-step-number">{number}</span>
                  {title}
                </button>
              </li>
            )
          })}
        </ol>

        <div className="club-edit-content">
          {step === 1 && (
            <>
              <div className="rollover-step-intro">
                <p>
                  Tick the leagues that take part. Clubs move between two leagues only when
                  <strong> both</strong> are ticked, so a league left out keeps every club it has.
                </p>
                <div className="rollover-step-actions">
                  <button type="button" className="btn sm" onClick={() => setSelected(allIds)}>
                    Select all
                  </button>
                  <button type="button" className="btn sm" onClick={() => setSelected([])}>
                    Select none
                  </button>
                </div>
              </div>

              <ul className="rollover-league-picker">
                {ladder.map((division) => (
                  <li key={division.id} className={division.selected ? 'selected' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={division.selected}
                        disabled={busy !== null}
                        onChange={(event) => toggle(division.id, event.target.checked)}
                      />
                      <div>
                        <strong>{division.name}</strong>
                        <span className="rollover-league-meta">
                          {plural(division.currentSize, 'club')} · {movementLabel(division)}
                        </span>
                      </div>
                      <span className="rollover-league-size">
                        {division.currentSize === division.nextSize ? (
                          <span className="rollover-size-same">size unchanged</span>
                        ) : (
                          <span className="rollover-size-changed">
                            {division.currentSize} → {division.nextSize}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              {plan && plan.blocks.length > 0 && (
                <div className="rollover-notices blocking" role="alert">
                  {plan.blocks.map((block) => (
                    <p key={block}>{block}</p>
                  ))}
                </div>
              )}
              {plan && plan.blocks.length === 0 && plan.warnings.length > 0 && (
                <div className="rollover-notices" role="status">
                  {plan.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}
              {planLoading && <p className="rollover-loading">Working out the movement…</p>}
            </>
          )}

          {step === 2 && plan && (
            <>
              {running.length === 0 ? (
                <p className="rollover-none">
                  No club will move. The new season starts from the leagues exactly as they are now.
                </p>
              ) : (
                <ul className="rollover-movement-list">
                  {running.map((leg, index) => (
                    <li key={`${leg.type}-${leg.sourceDivisionId}-${index}`}>
                      <div className="rollover-movement-head">
                        <span className={`rollover-direction ${leg.type}`}>
                          {leg.type === 'promotion' ? 'Promoted up' : 'Relegated down'}
                        </span>
                        <strong>
                          {leg.sourceDivisionName} → {leg.destinationDivisionName}
                        </strong>
                      </div>
                      <ul>
                        {leg.clubs.map((club) => (
                          <li key={club.clubId}>
                            <span className="rollover-club-name">{club.clubName}</span>
                            <span className="rollover-club-standing">
                              {club.position ? ordinal(club.position) : 'unplaced'}
                              {club.points !== null ? ` · ${club.points} pts` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}

              {skipped.length > 0 && (
                <div className="rollover-notices" role="status">
                  <p className="rollover-notices-title">Not moving, and why</p>
                  {skipped.map((leg, index) => (
                    <p key={`${leg.type}-${leg.sourceDivisionId}-${index}`}>{leg.skipReason}</p>
                  ))}
                </div>
              )}

              <div className="rollover-tables">
                {ladder.map((division) => {
                  const delta = division.nextSize - division.currentSize
                  return (
                    <section key={division.id} className="rollover-table-card">
                      <header>
                        <h3>{division.name}</h3>
                        <span className={delta === 0 ? 'rollover-size-same' : 'rollover-size-changed'}>
                          {division.currentSize} → {division.nextSize}
                          {delta !== 0 && ` (${delta > 0 ? '+' : ''}${delta})`}
                        </span>
                      </header>
                      {division.table.length === 0 ? (
                        <p className="rollover-table-empty">No clubs.</p>
                      ) : (
                        <table>
                          <thead>
                            <tr>
                              <th>Club</th>
                              <th>Finished</th>
                              <th>Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {division.table.map((club) => (
                              <tr key={club.clubId} className={club.incoming ? 'incoming' : ''}>
                                <td>
                                  {club.clubName}
                                  {club.incoming && <span className="rollover-badge">New</span>}
                                </td>
                                <td>{club.position ? ordinal(club.position) : '—'}</td>
                                <td>{club.points ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <p className="rollover-table-zones">
                        Next season: {movementLabel(division)}
                      </p>
                    </section>
                  )
                })}
              </div>
            </>
          )}

          {step === 3 && plan && (
            <>
              <p className="rollover-step-intro">
                The finished season is kept exactly as it was played. These counts decide how many
                clubs move at the end of the <strong>next</strong> season, not this one.
              </p>
              <div className="rollover-details">
                <label>
                  <span>New season name</span>
                  <input
                    className="text"
                    value={name}
                    maxLength={64}
                    autoFocus
                    placeholder="2027 Season 1"
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  <span>Season year</span>
                  <input
                    className="text"
                    type="number"
                    min={2000}
                    max={9999}
                    value={year}
                    placeholder={String(plan.seasonYear + 1)}
                    onChange={(event) => setYear(event.target.value)}
                  />
                </label>
              </div>
              <table className="rollover-settings">
                <thead>
                  <tr>
                    <th>League</th>
                    <th>Promote top</th>
                    <th>Relegate bottom</th>
                  </tr>
                </thead>
                <tbody>
                  {ladder.map((division) => (
                    <tr key={division.id}>
                      <th scope="row">{division.name}</th>
                      <td>
                        <input
                          className="text"
                          type="number"
                          min={0}
                          max={1000}
                          aria-label={`Clubs promoted from ${division.name}`}
                          value={settings[division.id]?.promotion ?? ''}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              [division.id]: {
                                promotion: event.target.value,
                                relegation: current[division.id]?.relegation ?? '',
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="text"
                          type="number"
                          min={0}
                          max={1000}
                          aria-label={`Clubs relegated from ${division.name}`}
                          value={settings[division.id]?.relegation ?? ''}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              [division.id]: {
                                promotion: current[division.id]?.promotion ?? '',
                                relegation: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="footnote">Leave a count empty for no movement in that direction.</p>
            </>
          )}
        </div>

        <footer className="club-edit-footer">
          <p className="fixture-summary">
            {step === 1
              ? `${plural(chosen.length, 'league')} selected.`
              : step === 2
                ? `${plural(movedClubIds.size, 'club')} will change league.`
                : 'Nothing is written until you confirm.'}
          </p>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => (step === 1 ? onClose() : setStep((step - 1) as Step))}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              className="btn primary"
              disabled={!canGoNext || planLoading}
              onClick={() => setStep((step + 1) as Step)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={!canCommit}
              onClick={() => void commit()}
            >
              {busy === 'commit'
                ? 'Starting…'
                : `Complete ${plan?.seasonName ?? 'the season'}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function ordinal(position: number): string {
  const suffix =
    position % 10 === 1 && position % 100 !== 11
      ? 'st'
      : position % 10 === 2 && position % 100 !== 12
        ? 'nd'
        : position % 10 === 3 && position % 100 !== 13
          ? 'rd'
          : 'th'
  return `${position}${suffix}`
}