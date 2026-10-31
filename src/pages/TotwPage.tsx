import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, getTotw, type TotwPlayer, type TotwResponse } from '@/lib/api'
import { asset } from '@/lib/assets'
import { useAuth } from '@/lib/auth'
import { CLUB_PLACEHOLDER } from '@/lib/format'
import {
  TOTW_ROWS,
  downloadBlob,
  photoSrc,
  renderTotwPoster,
  splitName,
} from '@/lib/totw'
import { TotwPaint } from '@/components/totw/TotwPaint'
import '@/styles/totw.css'

function parseWeekNum(label: string): number {
  const m = label.match(/\d+/)
  return m ? Number.parseInt(m[0], 10) : 0
}

function PlayerCard({ player }: { player: TotwPlayer }) {
  const [first, rest] = splitName(player.name)
  const solo = !(player.closeUrl && player.candidUrl)
  const club = player.clubName?.trim()
  const logo = player.clubLogo ? asset(player.clubLogo) : null
  const profile = player.playerSlug?.trim()
  const label = `${player.name}, ${player.position}${club ? `, ${club}` : ''}${
    profile ? ', view profile' : ''
  }`

  const card = (
    <>
      <TotwPaint variant={player.slot} />
      {logo && (
        <img
          className="totw-card__club-watermark"
          src={logo}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={(e) => {
            e.currentTarget.src = CLUB_PLACEHOLDER
          }}
        />
      )}
      {player.closeUrl && (
        <img
          className="totw-card__photo totw-card__photo--close"
          src={photoSrc(player.closeUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      )}
      {player.candidUrl && (
        <img
          className="totw-card__photo totw-card__photo--candid"
          src={photoSrc(player.candidUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      )}
      <div className="totw-card__shade" aria-hidden />

      {club && (
        <div className="totw-card__club" aria-hidden>
          <span className="totw-card__club-name">{club}</span>
        </div>
      )}

      <div className="totw-card__info">
        {player.shirtNumber != null && <span className="totw-card__num">{player.shirtNumber}</span>}
        <div className="totw-card__text">
          <span className="totw-card__pos">{player.position}</span>
          <span className="totw-card__name">
            <span>{first}</span>
            {rest && <span>{rest}</span>}
          </span>
          <span className="totw-card__bar" />
        </div>
      </div>
    </>
  )

  if (profile) {
    return (
      <Link
        to={`/players/${encodeURIComponent(profile)}`}
        className="totw-card"
        data-solo={solo || undefined}
        aria-label={label}
      >
        {card}
      </Link>
    )
  }

  return (
    <article className="totw-card" data-solo={solo || undefined} tabIndex={0} aria-label={label}>
      {card}
    </article>
  )
}

export default function TotwPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const paramId = Number.parseInt(searchParams.get('week') ?? '', 10)
  const [data, setData] = useState<TotwResponse | null>(null)
  const [weekId, setWeekId] = useState<number | null>(
    Number.isSafeInteger(paramId) && paramId > 0 ? paramId : null,
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const stepperRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const first = useRef(true)

  useEffect(() => {
    document.title = 'Team of the Week | IWVPL'
  }, [])

  // Close dropdown menu on outside click or tap
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (stepperRef.current && !stepperRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  const load = useCallback(
    async (id: number | null) => {
      if (first.current) setLoading(true)
      setError('')
      setLocked(false)
      try {
        setData(await getTotw(id))
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) setLocked(true)
        else setError(err instanceof Error ? err.message : 'Could not load Team of the Week.')
      } finally {
        first.current = false
        setLoading(false)
      }
    },
    [],
  )

  // Reload on week change and when the visitor signs in or out.
  useEffect(() => {
    void load(weekId)
  }, [load, weekId, user?.id])

  const week = data?.week ?? null
  const bySlot = new Map((week?.players ?? []).map((p) => [p.slot, p]))

  // Chronologically ordered weeks (Matchweek 1, Matchweek 2...)
  const chronologicalWeeks = useMemo(() => {
    if (!data?.weeks) return []
    return [...data.weeks].sort((a, b) => {
      const numA = parseWeekNum(a.label)
      const numB = parseWeekNum(b.label)
      if (numA !== numB) return numA - numB
      return a.id - b.id
    })
  }, [data?.weeks])

  const activeIndex = chronologicalWeeks.findIndex((w) => w.id === week?.id)
  const prevWeek = activeIndex > 0 ? chronologicalWeeks[activeIndex - 1] : null
  const nextWeek =
    activeIndex !== -1 && activeIndex < chronologicalWeeks.length - 1
      ? chronologicalWeeks[activeIndex + 1]
      : null

  const handleSelectWeek = (id: number | undefined) => {
    if (id == null) return
    setWeekId(id)
    setSearchParams({ week: String(id) }, { replace: true })
  }

  const onDownload = async () => {
    if (!week || busy) return
    setBusy(true)
    setDownloadError('')
    try {
      const blob = await renderTotwPoster(week.label, week.players)
      const slug = week.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      downloadBlob(blob, `iwvpl-team-of-the-week-${slug || week.id}.png`)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not create the poster.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="totw">
      <div className="totw__ambient" aria-hidden />

      <div className="totw__layout">
        <header className="totw__hero">
          <span className="totw__eyebrow">ISLAND-WIDE VIRTUAL PREMIER LEAGUE · Best XI</span>
          <h1 className="totw__title">
            <span>Team of the</span>
            <b>Week</b>
          </h1>
          <p className="totw__sub">
            The standout eleven from across the league, picked in a 4-4-2. Every card carries the
            player's club crest, with the club name on hover.
          </p>
        </header>

        <section className="totw__board" aria-live="polite">
          {week && data?.weeks && data.weeks.length > 0 && (
            <div className="totw__board-header">
              {/* Matches-style Matchweek Stepper (left/right navigation) */}
              <div className="totw-stepper" ref={stepperRef}>
                <button
                  type="button"
                  className="totw-stepper__arrow"
                  onClick={() => handleSelectWeek(prevWeek?.id)}
                  disabled={!prevWeek}
                  title={prevWeek ? `Previous: ${prevWeek.label}` : 'No earlier matchweek'}
                  aria-label="Previous matchweek"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M10 13L5 8l5-5"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <div className="totw-stepper__center">
                  <button
                    type="button"
                    className="totw-stepper__pill"
                    onClick={() => chronologicalWeeks.length > 1 && setMenuOpen((v) => !v)}
                    disabled={chronologicalWeeks.length <= 1}
                    aria-expanded={menuOpen}
                    aria-haspopup="listbox"
                    title={chronologicalWeeks.length > 1 ? 'Jump to another matchweek' : undefined}
                  >
                    <span>{week.label}</span>
                    {chronologicalWeeks.length > 1 && (
                      <svg
                        className={`totw-stepper__caret ${menuOpen ? 'totw-stepper__caret--open' : ''}`}
                        width="11"
                        height="11"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 6l5 5 5-5"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>

                  {menuOpen && chronologicalWeeks.length > 1 && (
                    <div className="totw-stepper__dropdown" role="listbox">
                      {[...chronologicalWeeks].reverse().map((w) => {
                        const isCurrent = w.id === week.id
                        return (
                          <button
                            key={w.id}
                            type="button"
                            role="option"
                            aria-selected={isCurrent}
                            className={`totw-stepper__option ${isCurrent ? 'totw-stepper__option--active' : ''}`}
                            onClick={() => {
                              handleSelectWeek(w.id)
                              setMenuOpen(false)
                            }}
                          >
                            <span>{w.label}</span>
                            {isCurrent && <span className="totw-stepper__dot" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="totw-stepper__arrow"
                  onClick={() => handleSelectWeek(nextWeek?.id)}
                  disabled={!nextWeek}
                  title={nextWeek ? `Next: ${nextWeek.label}` : 'No later matchweek'}
                  aria-label="Next matchweek"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M6 3l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <button
                type="button"
                className="totw__download-btn"
                onClick={onDownload}
                disabled={busy}
                title={busy ? 'Preparing poster…' : 'Download poster'}
                aria-label={busy ? 'Preparing poster…' : 'Download poster'}
              >
                {busy ? (
                  <svg className="totw__spinner" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M8 2.5v7.5m0 0L5 7m3 3l3-3M2.5 13h11"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
          )}

          {downloadError && (
            <p role="alert" className="totw__error-msg">
              {downloadError}
            </p>
          )}

          {loading ? (
            <div className="totw__rows" aria-busy>
              {TOTW_ROWS.map((row, ri) => (
                <div
                  key={ri}
                  className={row.length === 1 ? 'totw__row totw__row--gk' : 'totw__row'}
                  data-cols={row.length}
                  style={{ ['--cols' as string]: row.length }}
                >
                  {row.map((slot) => (
                    <div key={slot} className="totw__skeleton" />
                  ))}
                </div>
              ))}
            </div>
          ) : locked ? (
            <div className="totw__state">
              <h2>Not available yet</h2>
              <p>
                Team of the Week is in early access and open to selected accounts only.
                {!user && ' If you have been given access, sign in to view it.'}
              </p>
              {!user && (
                <Link
                  to="/login"
                  className="totw__download mt-5 inline-flex"
                  style={{ marginTop: '1.25rem' }}
                >
                  Sign in
                </Link>
              )}
            </div>
          ) : error ? (
            <div className="totw__state">
              <h2>Something went wrong</h2>
              <p>{error}</p>
            </div>
          ) : !week ? (
            <div className="totw__state">
              <h2>No Team of the Week yet</h2>
              <p>The first one will land here as soon as it is published.</p>
            </div>
          ) : (
            <div className="totw__rows">
              {TOTW_ROWS.map((row, ri) => (
                <div
                  key={ri}
                  className={row.length === 1 ? 'totw__row totw__row--gk' : 'totw__row'}
                  data-cols={row.length}
                  style={{ ['--cols' as string]: row.length }}
                >
                  {row.map((slot) => {
                    const p = bySlot.get(slot)
                    return p ? (
                      <PlayerCard key={slot} player={p} />
                    ) : (
                      <div key={slot} className="totw__skeleton" style={{ animation: 'none' }} />
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
