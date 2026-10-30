import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
import '@/styles/totw.css'

function PlayerCard({ player }: { player: TotwPlayer }) {
  const [first, rest] = splitName(player.name)
  const solo = !(player.closeUrl && player.candidUrl)
  const club = player.clubName?.trim()
  const logo = player.clubLogo ? asset(player.clubLogo) : null

  return (
    <article
      className="totw-card"
      data-solo={solo || undefined}
      tabIndex={0}
      aria-label={`${player.name}, ${player.position}${club ? `, ${club}` : ''}`}
    >
      <div className="totw-card__paint" aria-hidden>
        <i />
        <i />
        <i />
      </div>
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

      {(club || logo) && (
        <div className="totw-card__club" aria-hidden>
          <div className="totw-card__club-pill">
            {logo && (
              <img
                src={logo}
                alt=""
                className="totw-card__club-logo"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.src = CLUB_PLACEHOLDER
                }}
              />
            )}
            {club && <span className="totw-card__club-name">{club}</span>}
          </div>
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
    </article>
  )
}

export default function TotwPage() {
  const { user } = useAuth()
  const [data, setData] = useState<TotwResponse | null>(null)
  const [weekId, setWeekId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const first = useRef(true)

  useEffect(() => {
    document.title = 'Team of the Week | IWVPL'
  }, [])

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
      <div className="totw__ambient" aria-hidden>
        <span className="totw__mark">IWVPL</span>
      </div>

      <div className="totw__layout">
        <header className="totw__hero">
          <span className="totw__eyebrow">IWVPL · Best XI</span>
          <h1 className="totw__title">
            <span>Team of the</span>
            <b>Week</b>
          </h1>
          <p className="totw__sub">
            The standout eleven from across the league, picked in a 4-3-3. Hover a player to see
            their club.
          </p>
        </header>

        <section className="totw__board" aria-live="polite">
          {week && data?.weeks && data.weeks.length > 0 && (
            <div className="totw__board-header">
              <div className="totw__weeks" role="tablist" aria-label="Choose a week">
                {data.weeks.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className="totw__chip"
                    aria-current={w.id === week.id}
                    onClick={() => setWeekId(w.id)}
                  >
                    {w.label}
                  </button>
                ))}
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
