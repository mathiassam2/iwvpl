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

/** Slots in display order. 0-2 attack, 3-5 midfield, 6-9 defence, 10 keeper. */
export const TOTW_ROWS: number[][] = [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9], [10]]

export const TOTW_DEFAULT_POSITIONS = ['LW', 'ST', 'RW', 'CM', 'CDM', 'CM', 'LB', 'CB', 'CB', 'RB', 'GK']

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

  // Volt slashes in the margins, placed well clear of the footer text.
  poly(g, [[0, 160], [80, 120], [115, 140], [0, 210]], VOLT, 0.9)
  poly(g, [[W, 250], [W, 330], [W - 110, 250]], VOLT)
  poly(g, [[0, H - 330], [0, H - 240], [70, H - 290]], VOLT)
  poly(g, [[W, H - 320], [W, H - 210], [W - 140, H - 270]], VOLT, 0.95)
  poly(g, [[W, H - 190], [W - 70, H - 150], [W, H - 130]], VOLT, 0.6)
}

function drawCard(
  g: CanvasRenderingContext2D,
  p: TotwPlayer,
  photos: { close: Drawable | null; candid: Drawable | null },
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()

  // Volt brush strokes behind the portraits.
  const lean = w * 0.18
  poly(g, [[x + w * 0.2, y + h], [x + w * 0.2 + lean, y + h * 0.22], [x + w * 0.2 + lean + w * 0.12, y + h * 0.26], [x + w * 0.2 + w * 0.12, y + h]], VOLT, 0.95)
  poly(g, [[x + w * 0.5, y + h], [x + w * 0.5 + lean * 0.8, y + h * 0.4], [x + w * 0.5 + lean * 0.8 + w * 0.05, y + h * 0.42], [x + w * 0.55, y + h]], VOLT, 0.55)
  poly(g, [[x + w * 0.74, y + h * 0.9], [x + w * 0.9, y + h * 0.3], [x + w * 0.94, y + h * 0.34], [x + w * 0.82, y + h * 0.92]], VOLT, 0.7)
  // Splatter flecks, deterministic per slot so the poster is stable.
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < 9; i++) {
    const fx = x + w * (0.12 + rnd() * 0.8)
    const fy = y + h * (0.28 + rnd() * 0.6)
    const fs = 3 + rnd() * 7
    poly(g, [[fx, fy], [fx + fs, fy - fs * 0.4], [fx + fs * 1.2, fy + fs * 0.6], [fx + fs * 0.1, fy + fs]], VOLT, 0.5 + rnd() * 0.4)
  }

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
      const ph = photoBySlot.get(slot) ?? { close: null, candid: null }
      drawCard(g, p, ph, startX + ci * cellW, top + ri * rowH, cellW, rowH, slot + 1)
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
