/**
 * The Team of the Week photo studio.
 *
 * The same idea as the podium cutout studio on the leaderboards: the photo is
 * dragged, zoomed and flipped on a preview of the card it will appear on, and
 * saving re-renders it to a canvas so the position is baked into the file.
 *
 * The preview is the card itself - the portrait as the backdrop, the shade
 * under the name, the club crest in the corner - so what is framed here is
 * what the card shows.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { compressImageFile } from '../utils'

export interface TotwPhotoStudioProps {
  isOpen: boolean
  slot?: number | null
  gamertag: string
  clubName?: string
  clubFlag?: string
  shirtNumber?: number | null
  position?: string
  clubLogo?: string | null
  initialImage: string | null
  onClose: () => void
  onApply: (dataUrl: string) => void | Promise<void>
  onRemove?: () => void | Promise<void>
}

export function formatPositionCategory(position?: string | null, slot?: number): string {
  const p = (position ?? '').trim().toUpperCase()
  if (['GK', 'GOALKEEPER'].includes(p)) return 'Goalkeeper'
  if (['LB', 'LWB', 'CB', 'RB', 'RWB', 'LCB', 'RCB', 'DEF', 'DEFENDER'].includes(p)) return 'Defender'
  if (['CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'LCM', 'RCM', 'MID', 'MIDFIELDER'].includes(p)) return 'Midfielder'
  if (['CF', 'ST', 'ATT', 'FWD', 'FORWARD', 'STRIKER'].includes(p)) return 'Striker'

  if (slot !== undefined) {
    if (slot === 10) return 'Goalkeeper'
    if (slot >= 6 && slot <= 9) return 'Defender'
    if (slot >= 2 && slot <= 5) return 'Midfielder'
    if (slot >= 0 && slot <= 1) return 'Striker'
  }
  return position || ''
}

export function TotwPhotoStudio({
  isOpen,
  slot,
  gamertag,
  clubName,
  clubFlag,
  shirtNumber,
  position,
  clubLogo,
  initialImage,
  onClose,
  onApply,
  onRemove,
}: TotwPhotoStudioProps) {
  const isDefaultWide = slot === 0 || slot === 1 || position === 'ST' || position === 'CF'
  const [cardShape, setCardShape] = useState<'standard' | 'wide'>(isDefaultWide ? 'wide' : 'standard')
  const [imageSrc, setImageSrc] = useState<string | null>(initialImage)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [flipH, setFlipH] = useState(false)
  const [imgNatural, setImgNatural] = useState<{ width: number; height: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [applying, setApplying] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Wide cards (e.g. strikers in a 2-col row) are ~2.28:1; standard cards are ~1.14:1.
  const stageWidth = cardShape === 'wide' ? 480 : 320
  const stageHeight = cardShape === 'wide' ? 210 : 280
  const exportWidth = stageWidth * 2
  const exportHeight = stageHeight * 2

  useEffect(() => {
    if (isOpen) {
      setImageSrc(initialImage)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setFlipH(false)
      setImgNatural(null)
      setCardShape(isDefaultWide ? 'wide' : 'standard')
    }
  }, [isOpen, initialImage, isDefaultWide])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressImageFile(file, 1100, 1400, 0.9)
      setImageSrc(dataUrl)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setFlipH(false)
    } catch {
      const reader = new FileReader()
      reader.onload = () => {
        setImageSrc(String(reader.result ?? ''))
        setZoom(1)
        setPan({ x: 0, y: 0 })
        setFlipH(false)
      }
      reader.readAsDataURL(file)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setImageSrc(initialImage)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setFlipH(false)
      setImgNatural(null)
    }
  }, [isOpen, initialImage])

  useEffect(() => {
    if (!imageSrc) {
      setImgNatural(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImgNatural({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = imageSrc
  }, [imageSrc])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSrc) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setPanStart({ ...pan })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    setPan({ x: panStart.x + dx, y: panStart.y + dy })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setIsDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!imageSrc) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    setZoom((prev) => Math.min(3, Math.max(0.4, Number((prev + delta).toFixed(2)))))
  }

  const handleCenterFit = () => {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  /**
   * Renders the framed photo to a transparent canvas at the card's size and
   * hands back the image, so the card shows exactly what was framed here.
   */
  const handleSave = useCallback(async () => {
    if (!imageSrc) return
    setApplying(true)
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load the image.'))
        const loadUrl = imageSrc.startsWith('data:')
          ? imageSrc
          : `${imageSrc}${imageSrc.includes('?') ? '&' : '?'}t=${Date.now()}`
        img.src = loadUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = exportWidth
      canvas.height = exportHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')
      ctx.clearRect(0, 0, exportWidth, exportHeight)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      const scaleRatio = exportWidth / stageWidth

      // Cover the card with the photo, the same way the card does, then apply
      // the drag and the zoom on top of it.
      const fitScale = Math.max(stageWidth / img.naturalWidth, stageHeight / img.naturalHeight)
      const baseW = img.naturalWidth * fitScale
      const baseH = img.naturalHeight * fitScale

      ctx.save()
      ctx.translate(exportWidth / 2 + pan.x * scaleRatio, exportHeight / 2 + pan.y * scaleRatio)
      ctx.scale((flipH ? -1 : 1) * zoom, zoom)
      ctx.drawImage(img, (-baseW * scaleRatio) / 2, (-baseH * scaleRatio) / 2, baseW * scaleRatio, baseH * scaleRatio)
      ctx.restore()

      let result = ''
      try {
        result = canvas.toDataURL('image/webp', 0.92)
        if (!result.startsWith('data:image/webp')) result = canvas.toDataURL('image/png')
      } catch {
        result = canvas.toDataURL('image/png')
      }
      await onApply(result)
      onClose()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not save the photo.')
    } finally {
      setApplying(false)
    }
  }, [imageSrc, pan, zoom, flipH, stageWidth, stageHeight, exportWidth, exportHeight, onApply, onClose])

  if (!isOpen) return null

  // The photo is drawn at the size it covers the card with, then moved.
  const fitScale = imgNatural
    ? Math.max(stageWidth / imgNatural.width, stageHeight / imgNatural.height)
    : 1
  const displayW = imgNatural ? imgNatural.width * fitScale : stageWidth
  const displayH = imgNatural ? imgNatural.height * fitScale : stageHeight

  return (
    <div className="adm-modal-backdrop" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="adm-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 620,
          width: '95%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0d14',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: '0 28px 70px rgba(0, 0, 0, 0.95)',
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flex: '0 0 auto',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '14px 20px',
          }}
        >
          <div>
            <span className="adm-eyebrow" style={{ color: 'var(--accent)' }}>
              CARD PHOTO STUDIO
            </span>
            <h3 style={{ margin: 0, fontSize: 17 }}>Frame the Photo · {gamertag}</h3>
          </div>
          <button type="button" className="adm-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '16px 20px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              marginBottom: 14,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)' }}>
              ✨ <strong style={{ color: '#fff' }}>1:1 Card Preview:</strong> Drag to position the player.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className={`adm-pill-tab ${cardShape === 'wide' ? 'is-active' : ''}`}
                style={{ padding: '3px 9px', fontSize: 11 }}
                onClick={() => {
                  setCardShape('wide')
                  setPan({ x: 0, y: 0 })
                }}
              >
                ▬ Wide (Striker)
              </button>
              <button
                type="button"
                className={`adm-pill-tab ${cardShape === 'standard' ? 'is-active' : ''}`}
                style={{ padding: '3px 9px', fontSize: 11 }}
                onClick={() => {
                  setCardShape('standard')
                  setPan({ x: 0, y: 0 })
                }}
              >
                ▮ Standard (Mid / Def / GK)
              </button>
            </div>
          </div>

          {/* The card */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            style={{
              width: stageWidth,
              height: stageHeight,
              maxWidth: '100%',
              margin: '0 auto',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 12,
              background: 'linear-gradient(180deg, #171b26 0%, #0d1017 100%)',
              border: '1px solid rgba(200, 255, 61, 0.25)',
              cursor: isDragging ? 'grabbing' : imageSrc ? 'grab' : 'default',
              userSelect: 'none',
              touchAction: 'none',
              transition: 'width 0.2s ease, height 0.2s ease',
            }}
          >
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={gamertag}
                draggable={false}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: displayW,
                  height: displayH,
                  maxWidth: 'none',
                  objectFit: 'cover',
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${
                    (flipH ? -1 : 1) * zoom
                  }, ${zoom})`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                }}
              >
                <span>No photo yet</span>
                <span className="adm-btn adm-btn-secondary adm-btn-sm" style={{ pointerEvents: 'none' }}>
                  📁 Upload Photo
                </span>
              </div>
            )}

            {/* The shade under the name, exactly as the card has it */}
            <div
              style={{
                position: 'absolute',
                inset: 'auto 0 0 0',
                height: '44%',
                background: 'linear-gradient(to bottom, rgba(10,11,13,0), rgba(10,11,13,0.85))',
                pointerEvents: 'none',
              }}
            />

            {/* Club crest in the corner */}
            {clubLogo && (
              <img
                src={clubLogo}
                alt=""
                style={{
                  position: 'absolute',
                  right: '5%',
                  bottom: '5%',
                  height: '26%',
                  width: 'auto',
                  maxWidth: '28%',
                  objectFit: 'contain',
                  opacity: 0.35,
                  filter: 'grayscale(1)',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Name block */}
            <div
              style={{
                position: 'absolute',
                left: '6%',
                right: '5%',
                bottom: '5%',
                paddingRight: '28%',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '0.45rem',
                pointerEvents: 'none',
              }}
            >
              {shirtNumber != null && (
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 30,
                    lineHeight: 0.82,
                    letterSpacing: '-0.04em',
                    color: 'var(--accent)',
                  }}
                >
                  {shirtNumber}
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: 'rgba(255,255,255,0.8)',
                    lineHeight: 1,
                    marginBottom: 2,
                  }}
                >
                  {formatPositionCategory(position, slot).toUpperCase() || ''}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 13,
                    lineHeight: 1.05,
                    textTransform: 'uppercase',
                    color: '#fff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {gamertag}
                </span>
                <span
                  style={{
                    display: 'block',
                    width: 20,
                    height: 2.5,
                    marginTop: 4,
                    background: 'var(--accent)',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                background: 'rgba(0,0,0,0.7)',
                padding: '2px 7px',
                borderRadius: 4,
                pointerEvents: 'none',
              }}
            >
              ✂ Drag to Position
            </div>
          </div>

          {clubName && (
            <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '10px 0 0' }}>
              {clubFlag ? `${clubFlag} ` : ''}
              {clubName}
            </p>
          )}

          {/* Controls */}
          <div
            style={{
              maxWidth: 440,
              margin: '16px auto 0',
              padding: 14,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff' }}>Size & Zoom</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--accent)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                style={{ minWidth: 30, padding: '3px 8px', fontWeight: 800 }}
                onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                disabled={!imageSrc || zoom <= 0.4}
              >
                -
              </button>
              <input
                type="range"
                min="0.4"
                max="2.5"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                disabled={!imageSrc}
                style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                style={{ minWidth: 30, padding: '3px 8px', fontWeight: 800 }}
                onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(2))))}
                disabled={!imageSrc || zoom >= 2.5}
              >
                +
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`adm-btn adm-btn-sm ${flipH ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
                onClick={() => setFlipH((f) => !f)}
                disabled={!imageSrc}
                style={{ flex: 1 }}
              >
                ⇄ Flip Horizontal
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                onClick={handleCenterFit}
                disabled={!imageSrc}
                style={{ flex: 1 }}
              >
                ↺ Center & Reset
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                onClick={() => fileInputRef.current?.click()}
                style={{ flex: 1 }}
              >
                {imageSrc ? '📁 Pick Different File' : '📁 Upload Photo'}
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        <div
          className="adm-modal-foot"
          style={{
            flex: '0 0 auto',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            padding: '12px 20px',
            background: '#07090f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          {onRemove && imageSrc && (
            <button
              type="button"
              className="adm-btn adm-btn-ghost adm-btn-sm"
              style={{ marginRight: 'auto', color: '#ff6b6b' }}
              onClick={async () => {
                if (window.confirm(`Remove the photo for ${gamertag}?`)) {
                  await onRemove()
                  setImageSrc(null)
                  onClose()
                }
              }}
            >
              Remove Photo
            </button>
          )}
          <button type="button" className="adm-btn adm-btn-ghost" onClick={onClose} disabled={applying}>
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            disabled={!imageSrc || applying}
            onClick={() => void handleSave()}
            style={{ minWidth: 160, fontWeight: 800 }}
          >
            {applying ? 'Saving…' : 'Save Photo Position'}
          </button>
        </div>
      </div>
    </div>
  )
}
