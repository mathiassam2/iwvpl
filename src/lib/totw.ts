/**
 * Team of the Week helpers: formation layout, the access probe the header uses
 * to decide whether to show the menu item, and the poster renderer behind the
 * Download button.
 *
 * The poster is drawn on a canvas in the browser rather than on the server so
 * the download is exactly what the page shows and needs no image tooling on the
 * host. Photos are fetched as blobs first, which keeps the canvas untainted and
 * therefore exportable.
 */

import { useEffect, useState } from 'react'
import { apiUrl, getTotwAccess, type TotwPlayer } from './api'
import { asset } from './assets'
import { useAuth } from './auth'

/** Slots in display order for 4-4-2: 0-1 attack, 2-5 midfield, 6-9 defence, 10 keeper. */
export const TOTW_ROWS: number[][] = [[0, 1], [2, 3, 4, 5], [6, 7, 8, 9], [10]]

export const TOTW_DEFAULT_POSITIONS = ['ST', 'ST', 'LM', 'CM', 'CM', 'RM', 'LB', 'CB', 'CB', 'RB', 'GK']

/** Maps specific or raw positions to the broad display category. */
export function formatPositionCategory(position?: string | null, slot?: number): string {
  const p = (position ?? '').trim().toUpperCase()
  if (['GK', 'GOALKEEPER'].includes(p)) return 'Goalkeeper'
  if (['LB', 'LWB', 'CB', 'RB', 'RWB', 'LCB', 'RCB', 'DEF', 'DEFENDER'].includes(p)) return 'Defender'
  if (
    [
      'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'LCM', 'RCM',
      'LDM', 'RDM', 'LAM', 'RAM',
      'MID', 'MIDFIELDER',
    ].includes(p)
  )
    return 'Midfielder'
  if (['CF', 'ST', 'LS', 'RS', 'LF', 'RF', 'ATT', 'FWD', 'FORWARD', 'STRIKER'].includes(p)) return 'Striker'

  // Fallback to slot layout if position string is unrecognized
  if (slot !== undefined) {
    if (slot === 10) return 'Goalkeeper'
    if (slot >= 6 && slot <= 9) return 'Defender'
    if (slot >= 2 && slot <= 5) return 'Midfielder'
    if (slot >= 0 && slot <= 1) return 'Striker'
  }
  return position || ''
}

export const photoSrc = (url: string) => (/^https?:\/\//i.test(url) ? url : apiUrl(url))

/** Splits a display name over two lines: first word, then the rest. */
export function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return [parts[0] ?? '', '']
  return [parts[0], parts.slice(1).join(' ')]
}

/* ------------------------------------------------------------------ access */

let accessCache: { key: string; allowed: boolean } | null = null

/** Whether the current visitor may see the TOTW page. False until known. */
export function useTotwAccess(): boolean {
  const { user, loading } = useAuth()
  const key = String(user?.id ?? 'guest')
  const [allowed, setAllowed] = useState(accessCache?.key === key ? accessCache.allowed : false)

  useEffect(() => {
    if (loading) return
    if (accessCache?.key === key) {
      setAllowed(accessCache.allowed)
      return
    }
    let live = true
    getTotwAccess()
      .then((r) => {
        accessCache = { key, allowed: r.allowed }
        if (live) setAllowed(r.allowed)
      })
      .catch(() => {
        if (live) setAllowed(false)
      })
    return () => {
      live = false
    }
  }, [key, loading])

  return allowed
}

/* ------------------------------------------------------------------ poster */

const W = 1200
const H = 1760
const VOLT = '#c8ff3d'
const FONT = "'Sora (display)', 'Sora', system-ui, -apple-system, 'Segoe UI', sans-serif"

export type TotwWeekInfo = {
  label: string
  divisionName?: string | null
  gameWeek?: number | null
}

type Drawable = CanvasImageSource & { width: number; height: number }

async function loadBitmap(url: string, credentials: RequestCredentials): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url, { credentials })
    if (!res.ok) return null
    return await createImageBitmap(await res.blob())
  } catch {
    return null
  }
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return [c, c.getContext('2d')!]
}

function drawRoundedRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  g.beginPath()
  g.moveTo(x + radius, y)
  g.lineTo(x + w - radius, y)
  g.quadraticCurveTo(x + w, y, x + w, y + radius)
  g.lineTo(x + w, y + h - radius)
  g.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  g.lineTo(x + radius, y + h)
  g.quadraticCurveTo(x, y + h, x, y + h - radius)
  g.lineTo(x, y + radius)
  g.quadraticCurveTo(x, y, x + radius, y)
  g.closePath()
}

/** Desaturates with a touch of contrast, matching the monochrome close-ups and club watermarks. */
function monochrome(img: Drawable): HTMLCanvasElement {
  const [c, g] = makeCanvas(img.width, img.height)
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, c.width, c.height)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = Math.max(0, Math.min(255, (l - 128) * 1.12 + 134))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  g.putImageData(data, 0, 0)
  return c
}

function poly(g: CanvasRenderingContext2D, pts: [number, number][], fill: string, alpha = 1) {
  g.save()
  g.globalAlpha = alpha
  g.fillStyle = fill
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.closePath()
  g.fill()
  g.restore()
}

function drawBackground(g: CanvasRenderingContext2D) {
  g.fillStyle = '#0a0b0d'
  g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W / 2, H * 0.45, 80, W / 2, H * 0.45, H * 0.7)
  glow.addColorStop(0, 'rgba(255,255,255,0.05)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)

  // Volt slashes in the margins, placed well clear of the title and footer text.
  poly(g, [[0, 420], [90, 380], [130, 400], [0, 470]], VOLT, 0.9)
  poly(g, [[W, 250], [W, 330], [W - 110, 250]], VOLT)
  poly(g, [[0, H - 330], [0, H - 240], [70, H - 290]], VOLT)
  poly(g, [[W, H - 320], [W, H - 210], [W - 140, H - 270]], VOLT, 0.95)
  poly(g, [[W, H - 190], [W - 70, H - 150], [W, H - 130]], VOLT, 0.6)
}

function drawPaintVariant(
  g: CanvasRenderingContext2D,
  variant: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const v = Math.abs(variant) % 6
  const mx = (px: number) => x + (px / 200) * w
  const my = (py: number) => y + (py / 240) * h
  const mapPts = (raw: [number, number][]) => raw.map(([px, py]) => [mx(px), my(py)] as [number, number])

  const drawLine = (x1: number, y1: number, x2: number, y2: number, stroke: string, width: number, alpha = 1) => {
    g.save()
    g.globalAlpha = alpha
    g.strokeStyle = stroke
    g.lineWidth = (width / 200) * w
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(mx(x1), my(y1))
    g.lineTo(mx(x2), my(y2))
    g.stroke()
    g.restore()
  }

  const drawDot = (cx: number, cy: number, r: number, fill: string, alpha = 1) => {
    g.save()
    g.globalAlpha = alpha
    g.fillStyle = fill
    g.beginPath()
    g.arc(mx(cx), my(cy), (r / 200) * w, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }

  const EMERALD = '#10b981'
  const DARK = '#030712'
  const BEAM = '#f4ffe0'
  const BEAM_WHITE = '#ffffff'
  const LIGHT_VOLT = '#e4ff75'

  if (v === 0) {
    poly(g, mapPts([[28, 240], [128, 38], [152, 48], [142, 88], [64, 240]]), DARK, 0.7)
    poly(g, mapPts([[36, 240], [120, 44], [136, 40], [132, 60], [148, 54], [138, 82], [72, 240]]), EMERALD, 0.88)
    poly(g, mapPts([[46, 240], [124, 46], [138, 42], [134, 58], [152, 52], [144, 76], [136, 98], [84, 240]]), VOLT, 0.98)
    poly(g, mapPts([[106, 240], [166, 82], [178, 88], [170, 108], [120, 240]]), VOLT, 0.85)
    drawLine(22, 228, 174, 34, BEAM, 2.5, 0.95)
    drawDot(148, 32, 2.2, VOLT)
    drawDot(162, 46, 1.6, VOLT)
    drawDot(176, 62, 2.8, LIGHT_VOLT)
    drawDot(184, 80, 1.4, VOLT)
    drawDot(34, 204, 1.8, VOLT, 0.7)
    drawDot(48, 180, 1.4, EMERALD, 0.8)
  } else if (v === 1) {
    poly(g, mapPts([[38, 240], [114, 18], [144, 26], [76, 240]]), DARK, 0.7)
    poly(g, mapPts([[44, 240], [122, 22], [148, 30], [84, 240]]), EMERALD, 0.88)
    poly(g, mapPts([[52, 240], [116, 30], [130, 28], [126, 44], [142, 38], [134, 62], [90, 240]]), VOLT, 0.98)
    poly(g, mapPts([[26, 220], [74, 96], [86, 102], [42, 226]]), VOLT, 0.8)
    drawLine(12, 236, 182, 16, EMERALD, 4.5, 0.45)
    drawLine(14, 234, 180, 18, BEAM_WHITE, 2.6, 0.95)
    drawDot(152, 18, 2.4, BEAM_WHITE)
    drawDot(166, 28, 3.0, VOLT)
    drawDot(178, 42, 1.8, LIGHT_VOLT)
    drawDot(188, 56, 2.2, VOLT)
    drawDot(82, 80, 1.5, VOLT, 0.75)
  } else if (v === 2) {
    poly(g, mapPts([[24, 240], [84, 78], [96, 84], [38, 240]]), EMERALD, 0.8)
    poly(g, mapPts([[20, 240], [80, 82], [92, 88], [34, 240]]), VOLT, 0.9)
    poly(g, mapPts([[48, 240], [134, 26], [150, 34], [142, 54], [156, 48], [146, 72], [74, 240]]), DARK, 0.7)
    poly(g, mapPts([[54, 240], [136, 30], [152, 38], [144, 56], [158, 50], [148, 74], [78, 240]]), VOLT, 0.98)
    poly(g, mapPts([[92, 236], [170, 76], [182, 84], [108, 240]]), VOLT, 0.85)
    poly(g, mapPts([[102, 68], [112, 62], [108, 74]]), VOLT, 0.9)
    poly(g, mapPts([[162, 60], [170, 54], [166, 66]]), LIGHT_VOLT, 0.9)
    drawLine(36, 214, 182, 46, BEAM, 2.4, 0.9)
    drawDot(140, 22, 2.0, VOLT)
    drawDot(158, 32, 2.6, LIGHT_VOLT)
    drawDot(174, 50, 1.6, VOLT)
    drawDot(186, 70, 2.2, EMERALD)
    drawDot(48, 172, 1.5, VOLT, 0.7)
  } else if (v === 3) {
    poly(g, mapPts([[28, 240], [136, 36], [172, 56], [86, 240]]), DARK, 0.7)
    poly(g, mapPts([[34, 240], [138, 40], [162, 54], [148, 82], [72, 240]]), EMERALD, 0.9)
    poly(g, mapPts([[44, 240], [98, 124], [92, 120], [120, 68], [114, 64], [138, 36], [154, 44], [146, 62], [162, 56], [152, 78], [144, 98], [80, 240]]), VOLT, 0.98)
    poly(g, mapPts([[14, 212], [66, 84], [78, 90], [28, 220]]), VOLT, 0.75)
    drawLine(26, 230, 168, 42, BEAM_WHITE, 2.4, 0.95)
    drawDot(146, 26, 2.2, VOLT)
    drawDot(158, 36, 3.2, LIGHT_VOLT)
    drawDot(168, 48, 1.8, VOLT)
    drawDot(178, 64, 2.5, EMERALD)
    drawDot(188, 82, 1.6, VOLT)
    drawDot(132, 52, 1.5, VOLT)
    drawDot(162, 74, 2.0, LIGHT_VOLT)
  } else if (v === 4) {
    poly(g, mapPts([[40, 240], [134, 22], [152, 30], [136, 72], [154, 64], [64, 240]]), DARK, 0.7)
    poly(g, mapPts([[58, 232], [144, 52], [158, 58], [76, 236]]), EMERALD, 0.9)
    poly(g, mapPts([[42, 240], [130, 24], [146, 30], [134, 66], [148, 60], [62, 240]]), VOLT, 0.98)
    poly(g, mapPts([[76, 240], [166, 62], [178, 70], [164, 108], [96, 240]]), VOLT, 0.88)
    drawLine(24, 232, 174, 38, BEAM, 2.5, 0.95)
    drawDot(138, 18, 2.0, VOLT)
    drawDot(152, 24, 2.8, LIGHT_VOLT)
    drawDot(168, 44, 1.8, VOLT)
    drawDot(182, 66, 2.6, EMERALD)
    drawDot(190, 88, 1.4, VOLT)
    drawDot(42, 190, 1.4, VOLT, 0.75)
  } else {
    poly(g, mapPts([[42, 240], [106, 12], [136, 18], [76, 240]]), DARK, 0.7)
    poly(g, mapPts([[48, 240], [114, 16], [140, 22], [84, 240]]), EMERALD, 0.85)
    poly(g, mapPts([[54, 240], [112, 16], [128, 14], [124, 34], [138, 28], [130, 52], [82, 240]]), VOLT, 0.98)
    poly(g, mapPts([[22, 222], [70, 96], [82, 102], [36, 228]]), VOLT, 0.8)
    poly(g, mapPts([[86, 226], [166, 60], [178, 68], [98, 234]]), VOLT, 0.85)
    drawLine(16, 228, 178, 28, BEAM_WHITE, 2.6, 0.95)
    drawDot(118, 12, 2.8, BEAM_WHITE)
    drawDot(132, 16, 2.0, VOLT)
    drawDot(146, 28, 3.2, LIGHT_VOLT)
    drawDot(164, 48, 2.0, VOLT)
    drawDot(178, 68, 2.4, EMERALD)
    drawDot(68, 85, 1.6, VOLT, 0.8)
  }
}

function drawClubName(
  g: CanvasRenderingContext2D,
  clubName: string | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const name = (clubName ?? '').trim()
  if (!name) return

  const pad = Math.max(6, h * 0.02)
  const fontSize = Math.max(9, Math.round(h * 0.038))
  const maxTextW = Math.max(30, w * 0.64)
  g.save()
  g.font = `800 ${fontSize}px ${FONT}`
  let text = name.toUpperCase()
  if (g.measureText(text).width > maxTextW) {
    while (text.length > 1 && g.measureText(`${text}…`).width > maxTextW) {
      text = text.slice(0, -1)
    }
    text = `${text}…`
  }

  g.fillStyle = '#ffffff'
  g.textAlign = 'right'
  g.textBaseline = 'top'
  g.shadowColor = 'rgba(0,0,0,0.9)'
  g.shadowBlur = 6
  g.shadowOffsetY = 2
  g.fillText(text, x + w - pad, y + pad)
  g.restore()
}

function drawCard(
  g: CanvasRenderingContext2D,
  p: TotwPlayer,
  photos: { candid: Drawable | null; club: Drawable | null },
  x: number,
  y: number,
  w: number,
  h: number,
) {
  g.save()
  const r = 12

  // 1. Clip card with rounded corners
  drawRoundedRect(g, x, y, w, h, r)
  g.clip()

  // 2. Base dark card background matching web .totw-card
  g.fillStyle = '#0d1016'
  g.fillRect(x, y, w, h)

  const cardGrad = g.createLinearGradient(0, y, 0, y + h)
  cardGrad.addColorStop(0, 'rgba(255, 255, 255, 0.05)')
  cardGrad.addColorStop(1, 'rgba(255, 255, 255, 0.01)')
  g.fillStyle = cardGrad
  g.fillRect(x, y, w, h)

  // 3. Dynamic multi-tone grunge brushpaint pattern
  drawPaintVariant(g, p.slot, x, y, w, h)

  // 4. Player photo (object-fit: cover, centered, with bottom fade mask)
  if (photos.candid) {
    const img = photos.candid
    const imgRatio = img.width / img.height
    const cardRatio = w / h
    let dw: number, dh: number, dx: number, dy: number
    if (imgRatio > cardRatio) {
      dh = h
      dw = h * imgRatio
      dx = x + (w - dw) / 2
      dy = y
    } else {
      dw = w
      dh = w / imgRatio
      dx = x
      dy = y + (h - dh) / 2
    }

    g.save()
    g.drawImage(img, dx, dy, dw, dh)

    // Bottom fade mask matching web: linear-gradient(to bottom, #000 68%, transparent 100%)
    g.globalCompositeOperation = 'destination-out'
    const fadeGrad = g.createLinearGradient(0, y + h * 0.66, 0, y + h)
    fadeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
    fadeGrad.addColorStop(1, 'rgba(0, 0, 0, 1)')
    g.fillStyle = fadeGrad
    g.fillRect(x, y + h * 0.66, w, h * 0.34)
    g.restore()
  }

  // 5. Legibility gradient shade under text
  const shade = g.createLinearGradient(0, y + h * 0.52, 0, y + h)
  shade.addColorStop(0, 'rgba(10,11,13,0)')
  shade.addColorStop(1, 'rgba(10,11,13,0.88)')
  g.fillStyle = shade
  g.fillRect(x, y + h * 0.52, w, h * 0.48)

  // 6. Club crest in lower right, grayscale watermark
  const pad = Math.max(10, w * 0.06)
  if (photos.club) {
    const crestH = h * 0.26
    const maxCrestW = w * 0.28
    const scale = Math.min(crestH / photos.club.height, maxCrestW / photos.club.width)
    const crestW = photos.club.width * scale
    const finalH = photos.club.height * scale
    const crestX = x + w - pad - crestW
    const crestY = y + h * 0.94 - finalH
    const clubGray = monochrome(photos.club)
    g.save()
    g.globalAlpha = 0.35
    g.drawImage(clubGray, crestX, crestY, crestW, finalH)
    g.restore()
  }

  // 7. Club name at top-right
  drawClubName(g, p.clubName, x, y, w, h)

  // 8. Shirt number
  const num = p.shirtNumber == null ? '' : String(p.shirtNumber)
  const numSize = Math.round(h * 0.19)
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  g.font = `800 ${numSize}px ${FONT}`
  g.fillStyle = VOLT
  const numW = num ? g.measureText(num).width : 0
  const baseY = y + h * 0.93
  if (num) {
    g.fillText(num, x + pad, baseY)
  }

  // 9. Position & rating, and Player name
  const tx = x + pad + numW + (num ? Math.max(8, w * 0.035) : 0)
  const crestReserved = photos.club ? w * 0.26 + pad * 0.2 : 0
  const maxW = Math.max(36, x + w - pad - tx - crestReserved)

  const [first, rest] = splitName(p.name.trim().toUpperCase())

  // Dynamic font sizing for name - FULL NAME, NO TRUNCATION
  const fitSize = (text: string, startSize: number) => {
    let size = startSize
    g.font = `800 ${size}px ${FONT}`
    while (size > 7 && g.measureText(text).width > maxW) {
      size -= 0.5
      g.font = `800 ${size}px ${FONT}`
    }
    return size
  }

  const initialSize = Math.max(12, Math.round(h * 0.082))
  let nameSize = fitSize(first, initialSize)
  if (rest) {
    nameSize = Math.min(nameSize, fitSize(rest, initialSize))
  }

  g.font = `800 ${nameSize}px ${FONT}`
  g.fillStyle = '#ffffff'
  const lineGap = Math.round(nameSize * 1.08)
  const lastBase = baseY - h * 0.025
  if (rest) {
    g.fillText(first, tx, lastBase - lineGap)
    g.fillText(rest, tx, lastBase)
  } else {
    g.fillText(first, tx, lastBase)
  }

  // Position & Rating above name
  const nameTop = lastBase - (rest ? lineGap : 0) - nameSize
  const posFontSize = Math.max(10, Math.round(h * 0.044))
  g.font = `700 ${posFontSize}px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.8)'
  const posText = formatPositionCategory(p.position, p.slot).toUpperCase()
  g.fillText(posText, tx, nameTop - h * 0.016)

  if (p.rating != null) {
    const posW = g.measureText(posText).width
    g.fillStyle = VOLT
    g.font = `800 ${posFontSize}px ${FONT}`
    g.fillText(`★ ${p.rating.toFixed(1)}`, tx + posW + 6, nameTop - h * 0.016)
  }

  // Volt underline accent bar
  g.fillStyle = VOLT
  g.fillRect(tx, baseY + 6, Math.min(maxW, 24), 2.5)

  // 10. Card border
  g.strokeStyle = 'rgba(255, 255, 255, 0.1)'
  g.lineWidth = 1.5
  drawRoundedRect(g, x, y, w, h, r)
  g.stroke()

  g.restore()
}

export async function renderTotwPosterCanvas(
  infoOrLabel: string | TotwWeekInfo,
  players: TotwPlayer[],
): Promise<HTMLCanvasElement> {
  const info: TotwWeekInfo =
    typeof infoOrLabel === 'string' ? { label: infoOrLabel } : infoOrLabel

  try {
    await Promise.all([
      document.fonts.load(`800 100px ${FONT}`),
      document.fonts.load(`800 30px ${FONT}`),
      document.fonts.load(`700 40px ${FONT}`),
    ])
  } catch {
    /* fall back to the system face */
  }

  const bySlot = new Map(players.map((p) => [p.slot, p]))
  const photoJobs = players.map(async (p) => {
    const photoUrl = p.candidUrl || p.closeUrl
    return {
      slot: p.slot,
      candid: photoUrl ? await loadBitmap(photoSrc(photoUrl), 'include') : null,
      club: p.clubLogo ? await loadBitmap(asset(p.clubLogo), 'include') : null,
    }
  })
  const photos = await Promise.all(photoJobs)
  const photoBySlot = new Map(photos.map((p) => [p.slot, p]))

  const [canvas, g] = makeCanvas(W, H)
  drawBackground(g)

  // Header.
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  g.fillStyle = '#fff'
  g.font = `800 24px ${FONT}`
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '3px'
  g.fillText('ISLAND-WIDE VIRTUAL PREMIER LEAGUE', 60, 96)
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'

  g.font = `800 84px ${FONT}`
  g.fillText('TEAM OF THE', 60, 220)
  g.fillStyle = VOLT
  g.font = `800 130px ${FONT}`
  g.fillText('WEEK', 56, 336)

  // Header Context (Division & Game Week) at top-right
  const contextParts = [
    info.divisionName,
    info.gameWeek != null ? `GAME WEEK ${info.gameWeek}` : null,
  ].filter(Boolean)

  if (contextParts.length > 0) {
    g.textAlign = 'right'
    g.fillStyle = 'rgba(255,255,255,0.65)'
    g.font = `700 18px ${FONT}`
    ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '2px'
    g.fillText(contextParts.join(' · ').toUpperCase(), W - 60, 110)
    ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'
  }

  g.textAlign = 'right'
  g.fillStyle = VOLT
  g.font = `800 32px ${FONT}`
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '2px'
  g.fillText(info.label.toUpperCase(), W - 60, 150)
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'

  // Formation grid: 4 rows with gaps matching the web layout
  const top = 376
  const rowH = 300
  const rowGap = 16
  const colGap = 14
  const padX = 40

  TOTW_ROWS.forEach((row, ri) => {
    const rowY = top + ri * (rowH + rowGap)
    if (row.length === 1) {
      // Goalkeeper: centered card matching web width ~ 1/3.4
      const cellW = Math.round((W - padX * 2) / 3.4)
      const startX = Math.round((W - cellW) / 2)
      const slot = row[0]
      const p = bySlot.get(slot)
      if (p) {
        const ph = photoBySlot.get(slot) ?? { candid: null, club: null }
        drawCard(g, p, ph, startX, rowY, cellW, rowH)
      }
    } else {
      const totalColGaps = (row.length - 1) * colGap
      const cellW = Math.round((W - padX * 2 - totalColGaps) / row.length)
      row.forEach((slot, ci) => {
        const p = bySlot.get(slot)
        if (!p) return
        const ph = photoBySlot.get(slot) ?? { candid: null, club: null }
        const startX = padX + ci * (cellW + colGap)
        drawCard(g, p, ph, startX, rowY, cellW, rowH)
      })
    }
  })

  // Footer.
  g.textBaseline = 'alphabetic'
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.font = `700 18px ${FONT}`
  g.textAlign = 'left'
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '4px'
  g.fillText('BEST XI', 60, H - 54)
  g.fillText('THIS WEEK', 60, H - 30)
  g.fillStyle = VOLT
  g.fillRect(60, H - 18, 64, 4)
  g.fillStyle = '#ffffff'
  g.textAlign = 'right'
  g.fillText('IWVPL.ASIA', W - 60, H - 30)
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'

  return canvas
}

/** Generates a standard PDF-1.4 file wrapping the rendered poster image in high resolution. */
export function createPdfFromJpeg(
  jpegBytes: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  ptWidth = 595.28,
  ptHeight = 872.74,
): Uint8Array {
  const parts: Uint8Array[] = []
  let offset = 0
  const offsets: number[] = []

  function addString(str: string) {
    const bytes = new TextEncoder().encode(str)
    parts.push(bytes)
    offset += bytes.length
  }

  function addBytes(bytes: Uint8Array) {
    parts.push(bytes)
    offset += bytes.length
  }

  addString('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')

  // Object 1: Catalog
  offsets[1] = offset
  addString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  // Object 2: Pages
  offsets[2] = offset
  addString('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')

  // Object 3: Page
  offsets[3] = offset
  addString(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptWidth.toFixed(2)} ${ptHeight.toFixed(2)}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n`,
  )

  // Object 4: Contents (fits the image precisely onto the page)
  const contentStream = `q ${ptWidth.toFixed(2)} 0 0 ${ptHeight.toFixed(2)} 0 0 cm /Im1 Do Q`
  offsets[4] = offset
  addString(
    `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  )

  // Object 5: Image XObject (JPEG data)
  offsets[5] = offset
  addString(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  )
  addBytes(jpegBytes)
  addString('\nendstream\nendobj\n')

  // Cross reference table
  const xrefOffset = offset
  addString('xref\n0 6\n')
  addString('0000000000 65535 f \n')
  for (let i = 1; i <= 5; i++) {
    addString(String(offsets[i]).padStart(10, '0') + ' 00000 n \n')
  }
  addString(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  let totalLen = 0
  for (const p of parts) totalLen += p.length
  const merged = new Uint8Array(totalLen)
  let cur = 0
  for (const p of parts) {
    merged.set(p, cur)
    cur += p.length
  }
  return merged
}

export async function renderTotwPoster(
  infoOrLabel: string | TotwWeekInfo,
  players: TotwPlayer[],
): Promise<Blob> {
  const canvas = await renderTotwPosterCanvas(infoOrLabel, players)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the poster image.'))), 'image/png'),
  )
}

export async function renderTotwPdf(
  infoOrLabel: string | TotwWeekInfo,
  players: TotwPlayer[],
): Promise<Blob> {
  const canvas = await renderTotwPosterCanvas(infoOrLabel, players)
  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode poster to JPEG.'))),
      'image/jpeg',
      0.95,
    )
  })
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())
  const ptWidth = 595.28
  const ptHeight = 595.28 * (canvas.height / canvas.width)
  const pdfBytes = createPdfFromJpeg(jpegBytes, canvas.width, canvas.height, ptWidth, ptHeight)
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}
