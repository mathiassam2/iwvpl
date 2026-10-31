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
const H = 1800
const VOLT = '#c8ff3d'
const FONT = "'Sora (display)', 'Sora', system-ui, -apple-system, 'Segoe UI', sans-serif"

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

/** Recolours an image's opaque pixels, keeping its alpha. */
function tint(img: Drawable, color: string): HTMLCanvasElement {
  const [c, g] = makeCanvas(img.width, img.height)
  g.drawImage(img, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** Desaturates with a touch of contrast, matching the monochrome close-ups. */
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

/** Fits `img` inside a bw x bh box, pinned to the bottom, with the lower edge faded out. */
function fadedBox(
  img: Drawable,
  bw: number,
  bh: number,
  anchor: 'left' | 'center' | 'right',
  fade: number,
): HTMLCanvasElement {
  const [c, g] = makeCanvas(bw, bh)
  const scale = Math.min(bw / img.width, bh / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = anchor === 'left' ? 0 : anchor === 'right' ? bw - dw : (bw - dw) / 2
  g.drawImage(img, dx, bh - dh, dw, dh)
  g.globalCompositeOperation = 'destination-out'
  const grad = g.createLinearGradient(0, bh * (1 - fade), 0, bh)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,1)')
  g.fillStyle = grad
  g.fillRect(0, bh * (1 - fade), bw, bh * fade)
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

  // Watermark across the lower half. Sized dynamically so all 5 letters "IWVPL"
  // are comfortably inside the canvas margins, matching the reference poster.
  g.save()
  let markSize = 340
  g.font = `800 ${markSize}px ${FONT}`
  while (markSize > 80 && g.measureText('IWVPL').width > W * 0.88) {
    markSize -= 4
    g.font = `800 ${markSize}px ${FONT}`
  }
  g.globalAlpha = 0.06
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  g.fillText('IWVPL', W / 2, H - 36)
  g.restore()

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
    // v === 5
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

function roundedRect(
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

function drawClubPill(
  g: CanvasRenderingContext2D,
  clubName: string | null | undefined,
  club: Drawable | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const name = (clubName ?? '').trim()
  if (!name && !club) return

  const pad = Math.max(4, h * 0.014)
  const pillH = Math.max(18, h * 0.062)
  const logoSize = pillH * 0.76
  const gap = club && name ? Math.max(4, h * 0.012) : 0
  const fontSize = Math.max(9, h * 0.036)
  g.font = `800 ${fontSize}px ${FONT}`
  const maxTextW = Math.max(24, w - pad * 3 - (club ? logoSize + gap : 0))
  let text = name.toUpperCase()
  if (text && g.measureText(text).width > maxTextW) {
    while (text.length > 1 && g.measureText(`${text}…`).width > maxTextW) {
      text = text.slice(0, -1)
    }
    text = `${text}…`
  }
  const textW = text ? g.measureText(text).width : 0
  const pillW = Math.min(w - pad * 2, pad * 2 + (club ? logoSize : 0) + gap + textW)
  const pillX = x + pad
  const pillY = y + pad

  g.save()
  g.shadowColor = 'rgba(0,0,0,0.55)'
  g.shadowBlur = 10
  g.shadowOffsetY = 3
  roundedRect(g, pillX, pillY, pillW, pillH, pillH / 2)
  g.fillStyle = 'rgba(10,11,13,0.92)'
  g.fill()
  g.shadowColor = 'transparent'
  g.strokeStyle = 'rgba(200,255,61,0.55)'
  g.lineWidth = 1
  g.stroke()

  let cursor = pillX + pad
  if (club) {
    g.save()
    g.beginPath()
    g.arc(cursor + logoSize / 2, pillY + pillH / 2, logoSize / 2, 0, Math.PI * 2)
    g.clip()
    g.fillStyle = 'rgba(255,255,255,0.1)'
    g.fillRect(cursor, pillY + (pillH - logoSize) / 2, logoSize, logoSize)
    g.drawImage(club, cursor, pillY + (pillH - logoSize) / 2, logoSize, logoSize)
    g.restore()
    cursor += logoSize + gap
  }
  if (text) {
    g.font = `800 ${fontSize}px ${FONT}`
    g.fillStyle = '#ffffff'
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText(text, cursor, pillY + pillH / 2 + 0.5)
  }
  g.restore()
}

function drawCard(
  g: CanvasRenderingContext2D,
  p: TotwPlayer,
  photos: { close: Drawable | null; candid: Drawable | null; club: Drawable | null },
  x: number,
  y: number,
  w: number,
  h: number,
) {
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()

  // Dynamic multi-tone grunge brushpaint pattern matching web view.
  drawPaintVariant(g, p.slot, x, y, w, h)

  const closeGray = photos.close ? monochrome(photos.close) : null
  const photoH = h * 0.86
  if (closeGray && photos.candid) {
    const bw = w * 0.74
    const big = fadedBox(closeGray, bw, photoH, 'right', 0.3)
    g.drawImage(big, x + w - bw, y + h - photoH - h * 0.02)
    const sw = w * 0.5
    const sh = h * 0.62
    const small = fadedBox(photos.candid, sw, sh, 'left', 0.18)
    g.drawImage(small, x + w * 0.02, y + h * 0.17)
  } else {
    const only = closeGray ?? photos.candid
    if (only) {
      const bw = w * 0.86
      const box = fadedBox(only, bw, photoH, 'center', 0.28)
      g.drawImage(box, x + (w - bw) / 2, y + h - photoH - h * 0.02)
    }
  }

  // Legibility gradient under the text.
  const shade = g.createLinearGradient(0, y + h * 0.6, 0, y + h)
  shade.addColorStop(0, 'rgba(10,11,13,0)')
  shade.addColorStop(1, 'rgba(10,11,13,0.82)')
  g.fillStyle = shade
  g.fillRect(x, y + h * 0.6, w, h * 0.4)

  // Club crest + name, always visible on the poster.
  drawClubPill(g, p.clubName, photos.club, x, y, w, h)

  // Number, position, name.
  const pad = w * 0.065
  const numSize = Math.round(h * 0.19)
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  const num = p.shirtNumber == null ? '' : String(p.shirtNumber)
  g.font = `800 ${numSize}px ${FONT}`
  g.fillStyle = VOLT
  const numW = num ? g.measureText(num).width : 0
  const baseY = y + h * 0.94
  if (num) g.fillText(num, x + pad, baseY)

  const tx = x + pad + numW + (num ? w * 0.04 : 0)
  const maxW = x + w - pad - tx
  const [first, rest] = splitName(p.name.toUpperCase())
  const fit = (text: string, start: number, weight: number) => {
    let size = start
    g.font = `${weight} ${size}px ${FONT}`
    while (size > 9 && g.measureText(text).width > maxW) {
      size -= 1
      g.font = `${weight} ${size}px ${FONT}`
    }
    return size
  }
  const nameSize = Math.min(fit(first, h * 0.082, 800), rest ? fit(rest, h * 0.082, 800) : 999)
  g.font = `800 ${nameSize}px ${FONT}`
  g.fillStyle = '#fff'
  const lineGap = nameSize * 1.12
  const lastBase = baseY - h * 0.03
  if (rest) {
    g.fillText(first, tx, lastBase - lineGap)
    g.fillText(rest, tx, lastBase)
  } else {
    g.fillText(first, tx, lastBase)
  }
  const nameTop = lastBase - (rest ? lineGap : 0) - nameSize
  g.font = `700 ${Math.max(11, h * 0.046)}px ${FONT}`
  g.fillStyle = 'rgba(255,255,255,0.78)'
  g.fillText(p.position.toUpperCase(), tx, nameTop - h * 0.018)
  g.fillStyle = VOLT
  g.fillRect(tx, baseY + h * 0.012, Math.min(maxW, w * 0.09), Math.max(3, h * 0.012))

  g.restore()
}

export async function renderTotwPoster(label: string, players: TotwPlayer[]): Promise<Blob> {
  try {
    await Promise.all([
      document.fonts.load(`800 100px ${FONT}`),
      document.fonts.load(`700 40px ${FONT}`),
    ])
  } catch {
    /* fall back to the system face */
  }

  const bySlot = new Map(players.map((p) => [p.slot, p]))
  const photoJobs = players.map(async (p) => ({
    slot: p.slot,
    close: p.closeUrl ? await loadBitmap(photoSrc(p.closeUrl), 'include') : null,
    candid: p.candidUrl ? await loadBitmap(photoSrc(p.candidUrl), 'include') : null,
    club: p.clubLogo ? await loadBitmap(asset(p.clubLogo), 'include') : null,
  }))
  const [photos, wordmark] = await Promise.all([
    Promise.all(photoJobs),
    loadBitmap(asset('/assets/brand/iwvpl-wordmark.png'), 'same-origin'),
  ])
  const photoBySlot = new Map(photos.map((p) => [p.slot, p]))

  const [canvas, g] = makeCanvas(W, H)
  drawBackground(g)

  // Header.
  if (wordmark) {
    const lh = 66
    const lw = (wordmark.width / wordmark.height) * lh
    g.drawImage(tint(wordmark, '#ffffff'), 60, 56, lw, lh)
  }
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  g.fillStyle = '#fff'
  g.font = `800 92px ${FONT}`
  g.fillText('TEAM OF THE', 60, 236)
  g.fillStyle = VOLT
  g.font = `800 140px ${FONT}`
  g.fillText('WEEK', 56, 356)

  g.textAlign = 'right'
  g.fillStyle = 'rgba(255,255,255,0.7)'
  g.font = `700 17px ${FONT}`
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '4px'
  g.fillText('PLAY  /  COMPETE  /  BELONG', W - 60, 92)
  g.fillStyle = VOLT
  g.font = `800 30px ${FONT}`
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '2px'
  g.fillText(label.toUpperCase(), W - 60, 150)
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'

  // Formation grid.
  const top = 400
  const rowH = 322
  TOTW_ROWS.forEach((row, ri) => {
    const cellW = row.length === 1 ? W / 3 : (W - 60) / row.length
    const startX = row.length === 1 ? (W - cellW) / 2 : 30
    row.forEach((slot, ci) => {
      const p = bySlot.get(slot)
      if (!p) return
      const ph = photoBySlot.get(slot) ?? { close: null, candid: null, club: null }
      drawCard(g, p, ph, startX + ci * cellW, top + ri * rowH, cellW, rowH)
    })
  })

  // Footer.
  g.textBaseline = 'alphabetic'
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.font = `700 18px ${FONT}`
  g.textAlign = 'left'
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '4px'
  g.fillText('BEST XI', 60, H - 78)
  g.fillText('THIS WEEK', 60, H - 50)
  g.fillStyle = VOLT
  g.fillRect(60, H - 34, 64, 4)
  g.fillStyle = '#ffffff'
  g.textAlign = 'right'
  g.fillText('IWVPL.ASIA', W - 60, H - 48)
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the poster image.'))), 'image/png'),
  )
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
