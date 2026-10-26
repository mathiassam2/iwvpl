import { useCallback, useEffect, useRef, useState } from 'react'

export interface CelebrationCropperModalProps {
  isOpen: boolean
  title?: string
  gamertag: string
  clubName?: string
  clubFlag?: string
  initialImage: string | null
  onClose: () => void
  onApply: (dataUrl: string) => void | Promise<void>
  onRemove?: () => void | Promise<void>
}

// Fixed 4:5 Aspect Ratio Stage Dimensions (plenty of vertical headroom for raised arms & celebrations)
const STAGE_WIDTH = 280
const STAGE_HEIGHT = 340
const EXPORT_WIDTH = 560
const EXPORT_HEIGHT = 680
const OVERLAP_BOTTOM = 40 // Amount the pedestal card overlaps onto the bottom of the cutout stage

export function CelebrationCropperModal({
  isOpen,
  title,
  gamertag,
  clubName,
  clubFlag,
  initialImage,
  onClose,
  onApply,
  onRemove,
}: CelebrationCropperModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(initialImage)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [flipH, setFlipH] = useState(false)
  const [previewPlace, setPreviewPlace] = useState<1 | 2 | 3>(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [imgNatural, setImgNatural] = useState<{ width: number; height: number } | null>(null)
  const [applying, setApplying] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  // Reset or load initial image when opened
  useEffect(() => {
    if (isOpen) {
      setImageSrc(initialImage)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setFlipH(false)
      setImgNatural(null)
      setPreviewPlace(1)
    }
  }, [isOpen, initialImage])

  // Measure natural image size on change
  useEffect(() => {
    if (!imageSrc) {
      setImgNatural(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImgNatural({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.src = imageSrc
  }, [imageSrc])

  // Pointer drag on the podium cutout stage
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
    setPan({
      x: panStart.x + dx,
      y: panStart.y + dy,
    })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
  }

  // Mouse wheel to zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!imageSrc) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    setZoom((prev) => Math.min(3.0, Math.max(0.4, Number((prev + delta).toFixed(2)))))
  }

  // Center & Reset
  const handleCenterFit = () => {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  // Handle local file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      setImageSrc(dataUrl)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setFlipH(false)
    }
    reader.readAsDataURL(file)
  }

  // Render crop to high-res transparent canvas and export (1:1 identical to stage)
  const handleSaveCutout = useCallback(async () => {
    if (!imageSrc) return
    setApplying(true)
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image for cropping.'))
        img.src = imageSrc
      })

      const canvas = document.createElement('canvas')
      canvas.width = EXPORT_WIDTH
      canvas.height = EXPORT_HEIGHT
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context unavailable')

      ctx.clearRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      const scaleRatio = EXPORT_WIDTH / STAGE_WIDTH

      // Base display dimensions inside the stage box
      const fitScale = Math.min(STAGE_WIDTH / img.naturalWidth, STAGE_HEIGHT / img.naturalHeight)
      const baseW = img.naturalWidth * fitScale
      const baseH = img.naturalHeight * fitScale

      const exportBaseW = baseW * scaleRatio
      const exportBaseH = baseH * scaleRatio

      const exportCenterX = EXPORT_WIDTH / 2 + pan.x * scaleRatio
      const exportCenterY = EXPORT_HEIGHT / 2 + pan.y * scaleRatio

      ctx.save()
      ctx.translate(exportCenterX, exportCenterY)
      ctx.scale((flipH ? -1 : 1) * zoom, zoom)
      ctx.drawImage(img, -exportBaseW / 2, -exportBaseH / 2, exportBaseW, exportBaseH)
      ctx.restore()

      // Feather bottom 14% of exported cutout so waist/thigh lines blend seamlessly everywhere
      const featherGrad = ctx.createLinearGradient(0, EXPORT_HEIGHT * 0.86, 0, EXPORT_HEIGHT)
      featherGrad.addColorStop(0, 'rgba(0,0,0,1)')
      featherGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = featherGrad
      ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)
      ctx.globalCompositeOperation = 'source-over'

      const resultDataUrl = canvas.toDataURL('image/png')
      await onApply(resultDataUrl)
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error applying crop')
    } finally {
      setApplying(false)
    }
  }, [imageSrc, pan, zoom, flipH, onApply, onClose])

  if (!isOpen) return null

  // Calculate base display size for the image element in the stage
  const fitScale = imgNatural
    ? Math.min(STAGE_WIDTH / imgNatural.width, STAGE_HEIGHT / imgNatural.height)
    : 1
  const displayW = imgNatural ? imgNatural.width * fitScale : STAGE_WIDTH
  const displayH = imgNatural ? imgNatural.height * fitScale : STAGE_HEIGHT

  // Badge and styling for active rank preview
  const badgeStyle =
    previewPlace === 1
      ? { bg: 'linear-gradient(135deg, #ffe27a, #e8a317)', color: '#1a1200', label: '1ST · CHAMPION' }
      : previewPlace === 2
        ? { bg: 'linear-gradient(135deg, #eef1f6, #9ea7b8)', color: '#1a1200', label: '2ND · RUNNER-UP' }
        : { bg: 'linear-gradient(135deg, #e7af82, #b87333)', color: '#1a1200', label: '3RD · RUNNER-UP' }

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
        {/* Header - Fixed & Pinned */}
        <div
          className="adm-modal-head"
          style={{
            flex: '0 0 auto',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '14px 20px',
          }}
        >
          <div>
            <span className="adm-eyebrow" style={{ color: 'var(--accent)' }}>
              1:1 WYSIWYG PODIUM CUTOUT STUDIO
            </span>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              {title || `Frame & Position Cutout · ${gamertag}`}
            </h3>
          </div>
          <button type="button" className="adm-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Studio Body - Scrollable Container */}
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '16px 20px',
          }}
        >
          {/* Top Info Banner & Rank Preview Toggle */}
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
              ✨ <strong style={{ color: '#fff' }}>Direct 1:1 Preview:</strong> Drag player on the card to position.
            </div>

            {/* Rank Switcher */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`adm-pill-tab ${previewPlace === 1 ? 'is-active' : ''}`}
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => setPreviewPlace(1)}
              >
                🥇 #1 Champion
              </button>
              <button
                type="button"
                className={`adm-pill-tab ${previewPlace === 2 ? 'is-active' : ''}`}
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => setPreviewPlace(2)}
              >
                🥈 #2
              </button>
              <button
                type="button"
                className={`adm-pill-tab ${previewPlace === 3 ? 'is-active' : ''}`}
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => setPreviewPlace(3)}
              >
                🥉 #3
              </button>
            </div>
          </div>

          {/* Interactive Podium Card Assembly */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
              margin: '0 auto',
              maxWidth: 320,
              paddingTop: 10,
              cursor: isDragging ? 'grabbing' : imageSrc ? 'grab' : 'default',
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            {/* The 1:1 Cutout Stage (Height 340px, overflow visible so arms & heads are NEVER clipped) */}
            <div
              ref={stageRef}
              style={{
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
                position: 'relative',
                overflow: 'visible',
                borderRadius: '16px 16px 0 0',
                marginBottom: -OVERLAP_BOTTOM,
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: '1px dashed rgba(255, 255, 255, 0.16)',
                borderBottom: 'none',
                maskImage: 'linear-gradient(to bottom, black 0%, black 78%, transparent 98%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 78%, transparent 98%)',
              }}
            >
              {/* Glow aura if previewing #1 */}
              {previewPlace === 1 && (
                <div
                  style={{
                    position: 'absolute',
                    width: 170,
                    height: 170,
                    bottom: 24,
                    background:
                      'radial-gradient(circle, rgba(200, 255, 61, 0.35) 0%, rgba(200, 255, 61, 0) 70%)',
                    filter: 'blur(20px)',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {imageSrc ? (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: displayW,
                    height: displayH,
                    transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${
                      (flipH ? -1 : 1) * zoom
                    }, ${zoom})`,
                    transformOrigin: 'center center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <img
                    src={imageSrc}
                    alt={gamertag}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 16px 28px rgba(0,0,0,0.85))',
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                    draggable={false}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🧍</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>No Cutout Selected</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                    Pick a celebration image below
                  </div>
                </div>
              )}

              {/* Visual Drag Cue Tag */}
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

            {/* The Real Pedestal Card (Sits in front of waist/cutout for 100% seamless framing) */}
            <div
              style={{
                width: STAGE_WIDTH + 20,
                padding: '28px 16px 14px',
                borderRadius: 14,
                background:
                  previewPlace === 1
                    ? 'linear-gradient(180deg, #1f2736 0%, #10141f 100%)'
                    : 'linear-gradient(180deg, #171b26 0%, #0d1017 100%)',
                border:
                  previewPlace === 1
                    ? '1px solid rgba(200, 255, 61, 0.45)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow:
                  previewPlace === 1
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
              {/* Rank Badge */}
              <span
                style={{
                  background: badgeStyle.bg,
                  color: badgeStyle.color,
                  fontSize: 9.5,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  padding: '3px 10px',
                  borderRadius: 99,
                  marginBottom: 6,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  whiteSpace: 'nowrap',
                }}
              >
                {badgeStyle.label}
              </span>

              {/* Gamertag */}
              <strong
                style={{
                  fontSize: 14.5,
                  color: '#fff',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {gamertag}
              </strong>

              {/* Club */}
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                {clubFlag ? `${clubFlag} ` : ''}
                {clubName || 'EQUINOX XI'}
              </span>

              {/* Giant Metric */}
              <div
                style={{
                  margin: '6px 0 2px',
                  fontSize: 30,
                  fontWeight: 900,
                  color: previewPlace === 1 ? 'var(--accent)' : '#fff',
                  lineHeight: 1,
                }}
              >
                100
              </div>
              <span
                style={{
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  opacity: 0.6,
                }}
              >
                SAVES / GOALS
              </span>
            </div>
          </div>

          {/* Interactive Controls Bar */}
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
            {/* Zoom Slider */}
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

            {/* Quick Actions */}
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
              >
                📁 Pick Different File
              </button>
            </div>
          </div>

          {/* Hidden File Picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* Footer - Always Anchored & Pinned at Bottom */}
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
            zIndex: 10,
          }}
        >
          {onRemove && imageSrc && (
            <button
              type="button"
              className="adm-btn adm-btn-ghost adm-btn-sm"
              style={{ marginRight: 'auto', color: '#ff6b6b' }}
              onClick={async () => {
                if (window.confirm(`Remove celebration cutout for ${gamertag}?`)) {
                  await onRemove()
                  setImageSrc(null)
                  onClose()
                }
              }}
            >
              Remove Cutout
            </button>
          )}

          <button type="button" className="adm-btn adm-btn-ghost" onClick={onClose} disabled={applying}>
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            disabled={!imageSrc || applying}
            onClick={() => void handleSaveCutout()}
            style={{ minWidth: 160, fontWeight: 800 }}
          >
            {applying ? 'Saving…' : 'Save Cutout Position'}
          </button>
        </div>
      </div>
    </div>
  )
}
