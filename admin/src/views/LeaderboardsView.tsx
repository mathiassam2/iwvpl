import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  deleteAdminPlayerStat,
  getAdminLeaderboards,
  saveAdminPlayerStat,
  updatePlayerCelebration,
  type AdminLeaderboardsData,
  type AdminPlayerStat,
} from '../api'
import { type Guard, type Report } from '../utils'
import { CelebrationCropperModal } from './CelebrationCropperModal'

type LeaderboardCategory = 'goals' | 'assists' | 'saves' | 'all'

export function LeaderboardsView({
  report,
  guard,
}: {
  report: Report
  guard: Guard
}) {
  const [data, setData] = useState<AdminLeaderboardsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | ''>('')
  const [activeCategory, setActiveCategory] = useState<LeaderboardCategory>('goals')
  const [search, setSearch] = useState('')
  const [divisionFilter, setDivisionFilter] = useState('all')

  // Add / Edit Stat Modal
  const [statModalOpen, setStatModalOpen] = useState(false)
  const [editingStat, setEditingStat] = useState<AdminPlayerStat | null>(null)
  const [formPlayerId, setFormPlayerId] = useState<number | ''>('')
  const [formDivisionId, setFormDivisionId] = useState<number | ''>('')
  const [formGoals, setFormGoals] = useState<number | ''>(0)
  const [formAssists, setFormAssists] = useState<number | ''>(0)
  const [formSaves, setFormSaves] = useState<number | ''>(0)
  const [formCleanSheets, setFormCleanSheets] = useState<number | ''>(0)
  const [formAppearances, setFormAppearances] = useState<number | ''>(0)
  const [formCelebration, setFormCelebration] = useState('')
  const [formPlayerSearch, setFormPlayerSearch] = useState('')
  const [savingStat, setSavingStat] = useState(false)

  // Celebration Studio Cropper Modal
  const [cropperModal, setCropperModal] = useState<{
    isOpen: boolean
    gamertag: string
    clubName?: string
    clubFlag?: string
    initialImage: string | null
    target: 'player' | 'form'
    playerId?: number
  } | null>(null)

  const loadData = useCallback(async (seasonId?: number) => {
    try {
      const res = await guard(
        () => getAdminLeaderboards(seasonId),
        'Could not load leaderboards and player stats',
      )
      setData(res)
      setSelectedSeasonId(res.seasonId ?? '')
    } catch {
      /* reported */
    } finally {
      setLoading(false)
    }
  }, [guard])

  useEffect(() => {
    void loadData(selectedSeasonId === '' ? undefined : Number(selectedSeasonId))
  }, [selectedSeasonId, loadData])

  // Filtered stats list
  const filteredStats = useMemo(() => {
    if (!data) return []
    let list = [...data.stats]

    if (activeCategory === 'goals') {
      list = list.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals || a.gamertag.localeCompare(b.gamertag))
    } else if (activeCategory === 'assists') {
      list = list.filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists || a.gamertag.localeCompare(b.gamertag))
    } else if (activeCategory === 'saves') {
      list = list
        .filter((s) => s.saves > 0 || s.clean_sheets > 0)
        .sort((a, b) => (b.saves + b.clean_sheets) - (a.saves + a.clean_sheets) || b.saves - a.saves || a.gamertag.localeCompare(b.gamertag))
    }

    if (divisionFilter !== 'all') {
      list = list.filter((s) => String(s.division_id) === divisionFilter)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (s) =>
          s.gamertag.toLowerCase().includes(q) ||
          (s.club_name ?? '').toLowerCase().includes(q) ||
          (s.division_name ?? '').toLowerCase().includes(q),
      )
    }

    return list
  }, [data, activeCategory, divisionFilter, search])

  // Top 3 Podium for active category
  const podiumTop3 = useMemo(() => {
    if (!data) return [null, null, null]
    const list = [...data.stats]
    let sorted: AdminPlayerStat[] = []
    if (activeCategory === 'goals') {
      sorted = list.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals)
    } else if (activeCategory === 'assists') {
      sorted = list.filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists)
    } else if (activeCategory === 'saves') {
      sorted = list.filter((s) => s.saves > 0 || s.clean_sheets > 0).sort((a, b) => b.saves - a.saves)
    } else {
      sorted = list.sort((a, b) => b.goals - a.goals)
    }
    return [sorted[0] ?? null, sorted[1] ?? null, sorted[2] ?? null]
  }, [data, activeCategory])

  // Search filtered players in modal
  const availablePlayers = useMemo(() => {
    if (!data) return []
    if (!formPlayerSearch.trim()) return data.players.slice(0, 40)
    const q = formPlayerSearch.trim().toLowerCase()
    return data.players
      .filter((p) => p.gamertag.toLowerCase().includes(q) || (p.club_name ?? '').toLowerCase().includes(q))
      .slice(0, 40)
  }, [data, formPlayerSearch])

  // Selected player object in modal
  const selectedPlayer = useMemo(() => {
    if (!data || !formPlayerId) return null
    return data.players.find((p) => p.id === Number(formPlayerId)) ?? null
  }, [data, formPlayerId])

  // Open modal for creating / editing stat
  const openNewStatModal = () => {
    setEditingStat(null)
    setFormPlayerId('')
    setFormDivisionId(data?.divisions[0]?.id ?? '')
    setFormGoals(0)
    setFormAssists(0)
    setFormSaves(0)
    setFormCleanSheets(0)
    setFormAppearances(0)
    setFormCelebration('')
    setFormPlayerSearch('')
    setStatModalOpen(true)
  }

  const openEditStatModal = (stat: AdminPlayerStat) => {
    setEditingStat(stat)
    setFormPlayerId(stat.player_id)
    setFormDivisionId(stat.division_id)
    setFormGoals(stat.goals)
    setFormAssists(stat.assists)
    setFormSaves(stat.saves)
    setFormCleanSheets(stat.clean_sheets)
    setFormAppearances(stat.appearances)
    setFormCelebration(stat.celebration_image ?? '')
    setFormPlayerSearch(stat.gamertag)
    setStatModalOpen(true)
  }

  // Handle Player Select in modal
  const handleSelectPlayer = (p: {
    id: number
    gamertag: string
    celebration_image: string | null
    club_id: number | null
  }) => {
    setFormPlayerId(p.id)
    setFormPlayerSearch(p.gamertag)
    if (p.celebration_image) {
      setFormCelebration(p.celebration_image)
    }
  }

  const handleResetPlayerSelection = () => {
    setFormPlayerId('')
    setFormPlayerSearch('')
  }

  // Save Player Stat
  const handleSaveStat = async (e: FormEvent) => {
    e.preventDefault()
    let targetPlayerId = formPlayerId

    if (!targetPlayerId) {
      if (availablePlayers.length === 1) {
        targetPlayerId = availablePlayers[0].id
        setFormPlayerId(targetPlayerId)
      } else if (availablePlayers.length > 1) {
        report('error', 'Multiple players match. Please click on a player in the list to select them.')
        return
      } else {
        report('error', 'Please select a registered player to record stats.')
        return
      }
    }

    setSavingStat(true)
    try {
      await guard(
        () =>
          saveAdminPlayerStat({
            playerId: Number(targetPlayerId),
            seasonId: selectedSeasonId === '' ? undefined : Number(selectedSeasonId),
            divisionId: formDivisionId === '' ? null : Number(formDivisionId),
            goals: Number(formGoals) || 0,
            assists: Number(formAssists) || 0,
            saves: Number(formSaves) || 0,
            cleanSheets: Number(formCleanSheets) || 0,
            appearances: Number(formAppearances) || 0,
          }),
        'Could not save player stats',
      )

      if (formCelebration && (!editingStat || editingStat.celebration_image !== formCelebration)) {
        await guard(
          () => updatePlayerCelebration(Number(targetPlayerId), formCelebration),
          'Could not update celebration cutout image',
        )
      }

      report('ok', `Saved stats for ${formPlayerSearch || 'player'}.`)
      setStatModalOpen(false)
      await loadData(selectedSeasonId === '' ? undefined : Number(selectedSeasonId))
    } catch {
      /* reported */
    } finally {
      setSavingStat(false)
    }
  }

  // Quick Inline Stat Update
  const handleQuickInlineUpdate = async (
    stat: AdminPlayerStat,
    field: 'goals' | 'assists' | 'saves' | 'cleanSheets' | 'appearances',
    val: number,
  ) => {
    try {
      await saveAdminPlayerStat({
        playerId: stat.player_id,
        seasonId: stat.season_id,
        divisionId: stat.division_id,
        goals: field === 'goals' ? val : stat.goals,
        assists: field === 'assists' ? val : stat.assists,
        saves: field === 'saves' ? val : stat.saves,
        cleanSheets: field === 'cleanSheets' ? val : stat.clean_sheets,
        appearances: field === 'appearances' ? val : stat.appearances,
      })
      setData((prev) => {
        if (!prev) return null
        return {
          ...prev,
          stats: prev.stats.map((s) => {
            if (s.id !== stat.id) return s
            return {
              ...s,
              goals: field === 'goals' ? val : s.goals,
              assists: field === 'assists' ? val : s.assists,
              saves: field === 'saves' ? val : s.saves,
              clean_sheets: field === 'cleanSheets' ? val : s.clean_sheets,
              appearances: field === 'appearances' ? val : s.appearances,
            }
          }),
        }
      })
      report('ok', `Updated ${stat.gamertag}'s ${field} to ${val}.`)
    } catch (err) {
      report('error', err instanceof Error ? err.message : 'Could not update stat')
    }
  }

  const handleDeleteStat = async (stat: AdminPlayerStat) => {
    if (!window.confirm(`Remove ${stat.gamertag}'s season stats row?`)) return
    try {
      await guard(() => deleteAdminPlayerStat(stat.id), 'Could not remove stat record')
      report('ok', `Removed stats for ${stat.gamertag}.`)
      setData((prev) => {
        if (!prev) return null
        return {
          ...prev,
          stats: prev.stats.filter((s) => s.id !== stat.id),
        }
      })
    } catch {
      /* reported */
    }
  }

  // Cropper Modal Launchers
  const openCropperForPlayer = (p: {
    id?: number
    player_id?: number
    gamertag: string
    celebration_image?: string | null
    image?: string | null
    club_name?: string | null
    club_flag?: string | null
  }) => {
    const id = p.id ?? p.player_id
    if (!id) return
    setCropperModal({
      isOpen: true,
      gamertag: p.gamertag,
      clubName: p.club_name ?? undefined,
      clubFlag: p.club_flag ?? undefined,
      initialImage: p.celebration_image ?? p.image ?? null,
      target: 'player',
      playerId: id,
    })
  }

  const openCropperForForm = () => {
    const tag = selectedPlayer?.gamertag || formPlayerSearch || 'Player'
    setCropperModal({
      isOpen: true,
      gamertag: tag,
      clubName: selectedPlayer?.club_name ?? undefined,
      clubFlag: selectedPlayer?.club_flag ?? undefined,
      initialImage: formCelebration || selectedPlayer?.celebration_image || null,
      target: 'form',
    })
  }

  // Apply Cropper Output
  const handleCropperApply = async (dataUrl: string) => {
    if (!cropperModal) return
    if (cropperModal.target === 'player' && cropperModal.playerId) {
      await guard(
        () => updatePlayerCelebration(cropperModal.playerId!, dataUrl),
        `Could not update celebration cutout for ${cropperModal.gamertag}`,
      )
      report('ok', `Updated celebration cutout for ${cropperModal.gamertag}.`)
      setData((prev) => {
        if (!prev) return null
        return {
          ...prev,
          stats: prev.stats.map((s) =>
            s.player_id === cropperModal.playerId ? { ...s, celebration_image: dataUrl } : s,
          ),
          players: prev.players.map((p) =>
            p.id === cropperModal.playerId ? { ...p, celebration_image: dataUrl } : p,
          ),
        }
      })
      void loadData(selectedSeasonId === '' ? undefined : Number(selectedSeasonId))
    } else if (cropperModal.target === 'form') {
      setFormCelebration(dataUrl)
      report('ok', 'Framed celebration cutout ready to save.')
    }
  }

  const handleCropperRemove = async () => {
    if (!cropperModal) return
    if (cropperModal.target === 'player' && cropperModal.playerId) {
      await guard(
        () => updatePlayerCelebration(cropperModal.playerId!, null),
        `Could not remove celebration cutout for ${cropperModal.gamertag}`,
      )
      report('ok', `Removed celebration cutout for ${cropperModal.gamertag}.`)
      setData((prev) => {
        if (!prev) return null
        return {
          ...prev,
          stats: prev.stats.map((s) =>
            s.player_id === cropperModal.playerId ? { ...s, celebration_image: null } : s,
          ),
          players: prev.players.map((p) =>
            p.id === cropperModal.playerId ? { ...p, celebration_image: null } : p,
          ),
        }
      })
      void loadData(selectedSeasonId === '' ? undefined : Number(selectedSeasonId))
    } else if (cropperModal.target === 'form') {
      setFormCelebration('')
    }
  }

  return (
    <div className="adm-view-enter">
      {/* View Header with Season Selector */}
      <div className="adm-view-head">
        <div>
          <span className="adm-eyebrow">INDIVIDUAL HONOURS & PERFORMANCE</span>
          <h1>Leaderboards & Player Stats</h1>
          <p className="adm-lede">
            Key in top scorers, playmakers, and goalkeepers, with custom 3D celebration cutouts that overflow the podium.
          </p>
        </div>
        <div className="adm-view-actions">
          {data && data.seasons.length > 0 && (
            <select
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value === '' ? '' : Number(e.target.value))}
              className="adm-select"
              style={{ minWidth: 170 }}
            >
              {data.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {Boolean(s.is_current) ? '★ (Active)' : ''}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="adm-btn adm-btn-primary" onClick={openNewStatModal}>
            + Record Player Stats
          </button>
        </div>
      </div>

      {/* Category Pills & Division Filter */}
      <div className="adm-toolbar" style={{ marginTop: 8, marginBottom: 20 }}>
        <div className="adm-pill-tabs">
          <button
            type="button"
            className={`adm-pill-tab ${activeCategory === 'goals' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('goals')}
          >
            ⚽ Top Scorers ({data?.stats.filter((s) => s.goals > 0).length ?? 0})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${activeCategory === 'assists' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('assists')}
          >
            🎯 Top Playmakers ({data?.stats.filter((s) => s.assists > 0).length ?? 0})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${activeCategory === 'saves' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('saves')}
          >
            🧤 Top Goalkeepers ({data?.stats.filter((s) => s.saves > 0 || s.clean_sheets > 0).length ?? 0})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${activeCategory === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            📋 All Stats ({data?.stats.length ?? 0})
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {data && data.divisions.length > 0 && (
            <select
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              className="adm-select adm-select-sm"
              style={{ minWidth: 140 }}
            >
              <option value="all">All Divisions</option>
              {data.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player or club…"
            className="adm-input adm-input-sm"
            style={{ width: 200 }}
          />
        </div>
      </div>

      {/* Live 3D Podium Preview Stage */}
      {activeCategory !== 'all' && (
        <section
          className="adm-card"
          style={{
            marginBottom: 24,
            background: 'radial-gradient(ellipse at 50% 20%, rgba(200, 255, 61, 0.08) 0%, rgba(10, 12, 18, 0.95) 75%)',
            border: '1px solid rgba(200, 255, 61, 0.22)',
            overflow: 'visible',
            paddingTop: 36,
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span className="adm-eyebrow" style={{ color: 'var(--accent)', letterSpacing: '0.15em' }}>
              LIVE 3D PODIUM PREVIEW
            </span>
            <h2 style={{ margin: '4px 0 0', fontSize: 20 }}>
              {activeCategory === 'goals'
                ? '🏆 Golden Boot Honours'
                : activeCategory === 'assists'
                  ? '🎯 Playmaker of the Season'
                  : '🧤 Golden Glove Standings'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Click any player's celebration photo to crop, reposition, or upload a cutout with live pop-out preview.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
              alignItems: 'flex-end',
              maxWidth: 820,
              margin: '32px auto 8px',
              padding: '0 12px',
            }}
          >
            {/* Slot #2 - 1st Runner-Up (Left) */}
            <PodiumPreviewSlot
              place={2}
              stat={podiumTop3[1]}
              category={activeCategory}
              onUploadPhoto={() => {
                if (podiumTop3[1]) openCropperForPlayer(podiumTop3[1])
              }}
              onEditStat={() => {
                if (podiumTop3[1]) openEditStatModal(podiumTop3[1])
              }}
            />

            {/* Slot #1 - Champion (Centre, Elevated, Prominent) */}
            <PodiumPreviewSlot
              place={1}
              stat={podiumTop3[0]}
              category={activeCategory}
              isFirst
              onUploadPhoto={() => {
                if (podiumTop3[0]) openCropperForPlayer(podiumTop3[0])
              }}
              onEditStat={() => {
                if (podiumTop3[0]) openEditStatModal(podiumTop3[0])
              }}
            />

            {/* Slot #3 - 2nd Runner-Up (Right) */}
            <PodiumPreviewSlot
              place={3}
              stat={podiumTop3[2]}
              category={activeCategory}
              onUploadPhoto={() => {
                if (podiumTop3[2]) openCropperForPlayer(podiumTop3[2])
              }}
              onEditStat={() => {
                if (podiumTop3[2]) openEditStatModal(podiumTop3[2])
              }}
            />
          </div>
        </section>
      )}

      {/* Player Stats Table */}
      <section className="adm-card">
        <div className="adm-card-head">
          <div>
            <span className="adm-eyebrow">PLAYER HONOURS DATA</span>
            <h2>Recorded Stats & Tally ({filteredStats.length})</h2>
          </div>
          <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={openNewStatModal}>
            + Add Player
          </button>
        </div>

        {loading ? (
          <div className="adm-loading">Loading stats and player honours…</div>
        ) : filteredStats.length === 0 ? (
          <div className="adm-empty">
            <p>No player stats recorded for this category and filter.</p>
            <button
              type="button"
              className="adm-btn adm-btn-primary"
              style={{ marginTop: 12 }}
              onClick={openNewStatModal}
            >
              + Record First Player Stat
            </button>
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Rank</th>
                  <th>Player & Club</th>
                  <th>Podium Cutout Studio</th>
                  <th>Division</th>
                  <th style={{ textAlign: 'center' }}>Goals ⚽</th>
                  <th style={{ textAlign: 'center' }}>Assists 🎯</th>
                  <th style={{ textAlign: 'center' }}>Saves 🧤</th>
                  <th style={{ textAlign: 'center' }}>Clean Sheets 🛡️</th>
                  <th style={{ textAlign: 'center' }}>Apps 👕</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStats.map((s, idx) => (
                  <tr key={s.id}>
                    <td>
                      <span
                        className="adm-code-pill"
                        style={{
                          fontWeight: 800,
                          color: idx === 0 ? '#ffe27a' : idx === 1 ? '#eef1f6' : idx === 2 ? '#e7af82' : undefined,
                        }}
                      >
                        #{idx + 1}
                      </span>
                    </td>
                    <td>
                      <div className="adm-row-title">
                        {s.avatar_local ? (
                          <img src={s.avatar_local} alt="" className="adm-crest-xs" style={{ borderRadius: '50%' }} />
                        ) : (
                          <span className="adm-avatar-placeholder" style={{ width: 28, height: 28, fontSize: 12 }}>
                            {s.gamertag.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <strong>{s.gamertag}</strong>
                          <div style={{ fontSize: 11, opacity: 0.65 }}>
                            {s.club_flag ? `${s.club_flag} ` : ''}
                            {s.club_name || 'Free Agent'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {s.celebration_image ? (
                          <img
                            src={s.celebration_image}
                            alt={`${s.gamertag} celebration`}
                            style={{
                              width: 38,
                              height: 38,
                              objectFit: 'contain',
                              borderRadius: 4,
                              background: 'rgba(255,255,255,0.04)',
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              width: 38,
                              height: 38,
                              display: 'grid',
                              placeItems: 'center',
                              borderRadius: 4,
                              background: 'rgba(255,255,255,0.04)',
                              fontSize: 10,
                              color: 'rgba(255,255,255,0.4)',
                            }}
                          >
                            No Cutout
                          </span>
                        )}
                        <button
                          type="button"
                          className="adm-btn adm-btn-secondary adm-btn-sm"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => openCropperForPlayer(s)}
                        >
                          {s.celebration_image ? '✂ Reposition / Crop' : '📁 Upload Cutout'}
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className="adm-code-pill">{s.division_name || '—'}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        defaultValue={s.goals}
                        key={`${s.id}-goals-${s.goals}`}
                        onBlur={(e) => {
                          const val = Number(e.target.value)
                          if (!Number.isNaN(val) && val !== s.goals) {
                            void handleQuickInlineUpdate(s, 'goals', val)
                          }
                        }}
                        className="adm-input"
                        style={{ width: 64, textAlign: 'center', margin: '0 auto', fontWeight: 700 }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        defaultValue={s.assists}
                        key={`${s.id}-assists-${s.assists}`}
                        onBlur={(e) => {
                          const val = Number(e.target.value)
                          if (!Number.isNaN(val) && val !== s.assists) {
                            void handleQuickInlineUpdate(s, 'assists', val)
                          }
                        }}
                        className="adm-input"
                        style={{ width: 64, textAlign: 'center', margin: '0 auto', fontWeight: 700 }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        defaultValue={s.saves}
                        key={`${s.id}-saves-${s.saves}`}
                        onBlur={(e) => {
                          const val = Number(e.target.value)
                          if (!Number.isNaN(val) && val !== s.saves) {
                            void handleQuickInlineUpdate(s, 'saves', val)
                          }
                        }}
                        className="adm-input"
                        style={{ width: 64, textAlign: 'center', margin: '0 auto', fontWeight: 700 }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        defaultValue={s.clean_sheets}
                        key={`${s.id}-cs-${s.clean_sheets}`}
                        onBlur={(e) => {
                          const val = Number(e.target.value)
                          if (!Number.isNaN(val) && val !== s.clean_sheets) {
                            void handleQuickInlineUpdate(s, 'cleanSheets', val)
                          }
                        }}
                        className="adm-input"
                        style={{ width: 64, textAlign: 'center', margin: '0 auto', fontWeight: 700 }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        defaultValue={s.appearances}
                        key={`${s.id}-apps-${s.appearances}`}
                        onBlur={(e) => {
                          const val = Number(e.target.value)
                          if (!Number.isNaN(val) && val !== s.appearances) {
                            void handleQuickInlineUpdate(s, 'appearances', val)
                          }
                        }}
                        className="adm-input"
                        style={{ width: 64, textAlign: 'center', margin: '0 auto', fontWeight: 700 }}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="adm-btn adm-btn-secondary adm-btn-sm"
                          onClick={() => openEditStatModal(s)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn-ghost adm-btn-sm"
                          onClick={() => void handleDeleteStat(s)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Stat Modal with Interactive Player Search */}
      {statModalOpen && (
        <div className="adm-modal-backdrop" onClick={() => setStatModalOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="adm-modal-head">
              <div>
                <span className="adm-eyebrow">LEADERBOARD ENTRY</span>
                <h3>{editingStat ? `Edit Stats · ${editingStat.gamertag}` : 'Record Player Stats'}</h3>
              </div>
              <button type="button" className="adm-close-btn" onClick={() => setStatModalOpen(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSaveStat} className="adm-form-stack" style={{ padding: '20px 24px' }}>
              {/* Player Selector Section */}
              {!editingStat ? (
                <div className="adm-field">
                  <span>Search & Select Registered Player *</span>

                  {selectedPlayer ? (
                    /* Selected Player Card */
                    <div className="adm-player-selected-card">
                      <div className="adm-player-selected-info">
                        {selectedPlayer.avatar_local ? (
                          <img
                            src={selectedPlayer.avatar_local}
                            alt=""
                            className="adm-crest-xs"
                            style={{ borderRadius: '50%' }}
                          />
                        ) : (
                          <span className="adm-avatar-placeholder" style={{ width: 28, height: 28, fontSize: 11 }}>
                            {selectedPlayer.gamertag.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <div className="adm-player-selected-name">{selectedPlayer.gamertag}</div>
                          <div className="adm-player-selected-club">
                            {selectedPlayer.club_flag ? `${selectedPlayer.club_flag} ` : ''}
                            {selectedPlayer.club_name || 'Free Agent'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={handleResetPlayerSelection}
                      >
                        Change Player
                      </button>
                    </div>
                  ) : (
                    /* Search Input & Interactive Selection List */
                    <div className="adm-player-picker-wrap">
                      <div className="adm-player-picker-search-bar">
                        <input
                          type="search"
                          placeholder="Type gamertag to search (e.g. obey, amir, sami)..."
                          value={formPlayerSearch}
                          onChange={(e) => setFormPlayerSearch(e.target.value)}
                          className="adm-input"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (availablePlayers.length > 0) {
                                handleSelectPlayer(availablePlayers[0])
                              }
                            }
                          }}
                        />
                        {formPlayerSearch && (
                          <button
                            type="button"
                            className="adm-player-picker-clear-btn"
                            onClick={() => setFormPlayerSearch('')}
                          >
                            ×
                          </button>
                        )}
                      </div>

                      <div className="adm-player-picker-list">
                        {availablePlayers.length === 0 ? (
                          <div className="adm-player-picker-empty">
                            No player matches "<strong>{formPlayerSearch}</strong>".
                          </div>
                        ) : (
                          availablePlayers.map((p) => {
                            const isChosen = formPlayerId === p.id
                            return (
                              <div
                                key={p.id}
                                role="button"
                                tabIndex={0}
                                className={`adm-player-picker-item ${isChosen ? 'is-selected' : ''}`}
                                onClick={() => handleSelectPlayer(p)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    handleSelectPlayer(p)
                                  }
                                }}
                              >
                                {p.avatar_local ? (
                                  <img
                                    src={p.avatar_local}
                                    alt=""
                                    className="adm-crest-xs"
                                    style={{ borderRadius: '50%' }}
                                  />
                                ) : (
                                  <span className="adm-avatar-placeholder" style={{ width: 26, height: 26, fontSize: 10 }}>
                                    {p.gamertag.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                                <div className="adm-player-picker-item-details">
                                  <span className="adm-player-picker-item-gamertag">{p.gamertag}</span>
                                  <span className="adm-player-picker-item-club">
                                    {p.club_flag ? `${p.club_flag} ` : ''}
                                    {p.club_name || 'Free Agent'}
                                  </span>
                                </div>
                                {p.celebration_image && (
                                  <span className="adm-code-pill" style={{ fontSize: 9.5, color: 'var(--accent)' }}>
                                    ⭐ Has Cutout
                                  </span>
                                )}
                                <span className="adm-player-picker-select-cue">Select →</span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="adm-field">
                  <span>Player</span>
                  <div className="adm-input" style={{ background: 'rgba(255,255,255,0.05)', fontWeight: 700 }}>
                    {editingStat.gamertag} ({editingStat.club_name || 'Free Agent'})
                  </div>
                </div>
              )}

              {/* Division Selector */}
              {data && data.divisions.length > 0 && (
                <label className="adm-field">
                  <span>Division Tier</span>
                  <select
                    value={formDivisionId}
                    onChange={(e) => setFormDivisionId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="adm-select"
                  >
                    {data.divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Stat Numeric Inputs */}
              <div className="adm-field-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <label className="adm-field">
                  <span>Goals ⚽</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={formGoals}
                    onChange={(e) => setFormGoals(e.target.value === '' ? '' : Number(e.target.value))}
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Assists 🎯</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={formAssists}
                    onChange={(e) => setFormAssists(e.target.value === '' ? '' : Number(e.target.value))}
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Appearances 👕</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={formAppearances}
                    onChange={(e) => setFormAppearances(e.target.value === '' ? '' : Number(e.target.value))}
                    className="adm-input"
                  />
                </label>
              </div>

              <div className="adm-field-grid">
                <label className="adm-field">
                  <span>Saves 🧤</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={formSaves}
                    onChange={(e) => setFormSaves(e.target.value === '' ? '' : Number(e.target.value))}
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Clean Sheets 🛡️</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={formCleanSheets}
                    onChange={(e) => setFormCleanSheets(e.target.value === '' ? '' : Number(e.target.value))}
                    className="adm-input"
                  />
                </label>
              </div>

              {/* Celebration Photo in Form */}
              <div className="adm-logo-uploader" style={{ marginTop: 12 }}>
                <div
                  className="adm-logo-preview-box"
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background:
                      'repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, transparent 0% 50%) 50% / 12px 12px, #0b0f14',
                    border: '1px solid rgba(255,255,255,0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {formCelebration ? (
                    <img
                      src={formCelebration}
                      alt="Celebration preview"
                      style={{
                        maxHeight: '92%',
                        maxWidth: '92%',
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.8))',
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 10, textAlign: 'center', padding: 4, opacity: 0.6 }}>No Cutout</span>
                  )}
                </div>
                <div>
                  <strong>Podium Celebration Cutout Studio</strong>
                  <p style={{ margin: '2px 0 6px', fontSize: 11, opacity: 0.65 }}>
                    Crop, zoom, and reposition player cutout image so their celebration overflows the podium.
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={openCropperForForm}
                    >
                      {formCelebration ? '✂ Reposition & Crop Cutout' : '📁 Upload Cutout Image'}
                    </button>
                    {formCelebration && (
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        onClick={() => setFormCelebration('')}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="adm-modal-foot" style={{ padding: '14px 0 0 0', marginTop: 14 }}>
                <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setStatModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="adm-btn adm-btn-primary" disabled={savingStat}>
                  {savingStat ? 'Saving…' : 'Save Player Stats'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Celebration Cropper / Mover Studio Modal */}
      {cropperModal && (
        <CelebrationCropperModal
          isOpen={cropperModal.isOpen}
          gamertag={cropperModal.gamertag}
          clubName={cropperModal.clubName}
          clubFlag={cropperModal.clubFlag}
          initialImage={cropperModal.initialImage}
          onClose={() => setCropperModal(null)}
          onApply={handleCropperApply}
          onRemove={handleCropperRemove}
        />
      )}
    </div>
  )
}

/**
 * Preview Card for one podium spot with overflow celebration cutout (1:1 Stage)
 */
const DEFAULT_PODIUM_IMAGES: Record<number, string> = {
  1: '/assets/podium/podium-default-1.png',
  2: '/assets/podium/podium-default-2.png',
  3: '/assets/podium/podium-default-3.png',
}

function PodiumPreviewSlot({
  place,
  stat,
  category,
  isFirst = false,
  onUploadPhoto,
  onEditStat,
}: {
  place: 1 | 2 | 3
  stat: AdminPlayerStat | null
  category: LeaderboardCategory
  isFirst?: boolean
  onUploadPhoto: () => void
  onEditStat: () => void
}) {
  const badgeStyle =
    place === 1
      ? { bg: 'linear-gradient(135deg, #ffe27a, #e8a317)', color: '#1a1200', label: '1ST · CHAMPION' }
      : place === 2
        ? { bg: 'linear-gradient(135deg, #eef1f6, #9ea7b8)', color: '#1a1200', label: '2ND · RUNNER-UP' }
        : { bg: 'linear-gradient(135deg, #e7af82, #b87333)', color: '#1a1200', label: '3RD · RUNNER-UP' }

  const value = stat
    ? category === 'goals'
      ? stat.goals
      : category === 'assists'
        ? stat.assists
        : stat.saves
    : 0

  const unit = category === 'goals' ? 'Goals' : category === 'assists' ? 'Assists' : 'Saves'

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        zIndex: isFirst ? 3 : 1,
      }}
    >
      {/* Glow ambient background aura for #1 Champion - unmasked so it never gets clipped */}
      {isFirst && (
        <div
          style={{
            position: 'absolute',
            width: 240,
            height: 240,
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background:
              'radial-gradient(circle, rgba(200, 255, 61, 0.4) 0%, rgba(200, 255, 61, 0.1) 40%, transparent 70%)',
            filter: 'blur(24px)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* 3D Cutout Celebration Image Stage - Standing tall above the card */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: isFirst ? 320 : place === 2 ? 270 : 250,
          height: isFirst ? 320 : place === 2 ? 260 : 230,
          marginBottom: 8,
          zIndex: 2,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {(() => {
          const isCustomCelebration = Boolean(
            stat?.celebration_image &&
            stat.celebration_image !== stat.avatar_local &&
            !stat.celebration_image.includes('avatar-placeholder') &&
            !stat.celebration_image.includes('profile-photo-') &&
            !stat.celebration_image.includes('/assets/players/'),
          )
          const cutoutSrc = isCustomCelebration ? stat!.celebration_image! : DEFAULT_PODIUM_IMAGES[place]
          return (
            <img
              src={cutoutSrc}
              alt={stat?.gamertag || `Podium #${place}`}
              style={{
                width: 'auto',
                height: '100%',
                maxWidth: '100%',
                objectFit: 'contain',
                objectPosition: 'bottom',
                filter: 'drop-shadow(0 16px 28px rgba(0,0,0,0.85))',
                opacity: stat ? 1 : 0.25,
              }}
            />
          )
        })()}
      </div>

      {/* Pedestal Block (Sits in front of waist/cutout for seamless framing) */}
      <div
        style={{
          width: '100%',
          minHeight: isFirst ? 220 : place === 2 ? 175 : 145,
          padding: isFirst ? '30px 16px 16px' : '26px 14px 14px',
          borderRadius: 14,
          background: isFirst
            ? 'linear-gradient(180deg, #1f2736 0%, #10141f 100%)'
            : 'linear-gradient(180deg, #171b26 0%, #0d1017 100%)',
          border: isFirst ? '1px solid rgba(200, 255, 61, 0.45)' : '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: isFirst
            ? '0 16px 36px rgba(0,0,0,0.7), inset 0 1px 0 rgba(200, 255, 61, 0.3)'
            : '0 10px 24px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Rank Pill */}
        <span
          style={{
            background: badgeStyle.bg,
            color: badgeStyle.color,
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.08em',
            padding: '3px 9px',
            borderRadius: 99,
            marginBottom: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap',
          }}
        >
          {badgeStyle.label}
        </span>

        {stat ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%' }}>
              {stat.avatar_local && (
                <img
                  src={stat.avatar_local}
                  alt=""
                  style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              )}
              <strong
                style={{
                  fontSize: isFirst ? 16 : 14,
                  color: '#fff',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {stat.gamertag}
              </strong>
            </div>

            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              {stat.club_flag ? `${stat.club_flag} ` : ''}
              {stat.club_name || 'Free Agent'}
            </span>

            <div
              style={{
                margin: '10px 0 4px',
                fontSize: isFirst ? 36 : 28,
                fontWeight: 900,
                color: isFirst ? 'var(--accent)' : '#fff',
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.6 }}>
              {unit}
            </span>

            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                style={{ fontSize: 10, padding: '3px 8px' }}
                onClick={onUploadPhoto}
              >
                {stat.celebration_image ? '✂ Reposition / Crop' : '📁 Upload Cutout'}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-sm"
                style={{ fontSize: 10, padding: '3px 8px' }}
                onClick={onEditStat}
              >
                Edit
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: '24px 0', opacity: 0.4, fontSize: 12 }}>
            <div>No player yet</div>
          </div>
        )}
      </div>
    </div>
  )
}
