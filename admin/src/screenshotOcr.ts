import { createWorker, type Worker } from 'tesseract.js'
import type { PlayerRow } from './views/ManualMatchStatsModal'

export interface ParsedMatchSummary {
  leftClubName?: string
  rightClubName?: string
  leftScore?: number
  rightScore?: number
  dribbleSuccessLeft?: number
  dribbleSuccessRight?: number
  shotAccuracyLeft?: number
  shotAccuracyRight?: number
  passAccuracyLeft?: number
  passAccuracyRight?: number
  possessionLeft?: number
  possessionRight?: number
  ballRecoveryTimeLeft?: number
  ballRecoveryTimeRight?: number
  shotsLeft?: number
  shotsRight?: number
  xgLeft?: number
  xgRight?: number
  passesLeft?: number
  passesRight?: number
  tacklesLeft?: number
  tacklesRight?: number
  tacklesWonLeft?: number
  tacklesWonRight?: number
  interceptionsLeft?: number
  interceptionsRight?: number
  savesLeft?: number
  savesRight?: number
  foulsLeft?: number
  foulsRight?: number
  offsidesLeft?: number
  offsidesRight?: number
  cornersLeft?: number
  cornersRight?: number
  freeKicksLeft?: number
  freeKicksRight?: number
  penaltiesLeft?: number
  penaltiesRight?: number
  yellowCardsLeft?: number
  yellowCardsRight?: number
  redCardsLeft?: number
  redCardsRight?: number
}

export interface ParsedPerformanceRoster {
  clubName?: string
  players: Array<{
    pos: string
    name: string
    rating: number
    goals: number
    assists: number
    shots?: number
    shotAccuracy?: number
    passes?: number
    passAccuracy?: number
    dribbles?: number
    dribbleSuccessRate?: number
    tackles?: number
    tackleSuccessRate?: number
    offsides?: number
    foulsCommitted?: number
    possessionWon?: number
    possessionLost?: number
    minutesPlayed?: number
    distanceCovered?: number
    distanceSprinted?: number
  }>
}

export interface ParsedPlayersScreen {
  leftCode?: string
  rightCode?: string
  leftPlayers: Array<{ gamertag: string; platform: 'ps' | 'pc' }>
  rightPlayers: Array<{ gamertag: string; platform: 'ps' | 'pc' }>
}

export interface ScreenshotParseResult {
  screensDetected: string[]
  swappedSides: boolean
  summary?: ParsedMatchSummary
  rosters: ParsedPerformanceRoster[]
  playersScreen?: ParsedPlayersScreen
}

const VALID_POS = new Set([
  'LS', 'ST', 'RS', 'LW', 'LF', 'CF', 'RF', 'RW',
  'LAM', 'CAM', 'RAM', 'LM', 'LCM', 'CM', 'RCM', 'RM',
  'LWB', 'LDM', 'CDM', 'RDM', 'RWB',
  'LB', 'LCB', 'CB', 'RCB', 'RB', 'GK', 'ANY',
])

function normalizePos(raw: string): string | null {
  const up = raw.toUpperCase().replace(/[^A-Z]/g, '')
  if (VALID_POS.has(up)) return up
  const map: Record<string, string> = {
    LOM: 'LCM',
    ROM: 'RCM',
    COM: 'CDM',
    RCE: 'RCB',
    LCE: 'LCB',
    CR: 'CB',
    OX: 'GK',
    GR: 'GK',
    A: 'GK',
    '8': 'LB',
  }
  if (map[up]) return map[up]
  return null
}

/**
 * Loads an image File/Blob into an HTMLImageElement.
 */
async function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

/**
 * Crops a normalized rectangle (rx, ry, rw, rh in 0..1 coordinates) from `img`,
 * scales it 3x with smooth bilinear filtering, and isolates bright white/colored
 * EA FC UI text onto a clean white background while erasing green/cyan indicator
 * bars and background stadium/jersey noise.
 */
function cropAndEnhanceToDataUrl(
  img: HTMLImageElement,
  rxNorm: number,
  ryNorm: number,
  rwNorm: number,
  rhNorm: number,
  mode: 'white' | 'max' = 'white',
  scale = 3,
): string {
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = img.width
  srcCanvas.height = img.height
  const srcCtx = srcCanvas.getContext('2d')!
  srcCtx.drawImage(img, 0, 0)
  const srcData = srcCtx.getImageData(0, 0, img.width, img.height)
  const pixels = srcData.data
  const width = img.width
  const height = img.height

  const rx = Math.round(rxNorm * width)
  const ry = Math.round(ryNorm * height)
  const rw = Math.max(1, Math.round(rwNorm * width))
  const rh = Math.max(1, Math.round(rhNorm * height))

  const outW = rw * scale
  const outH = rh * scale
  const dstCanvas = document.createElement('canvas')
  dstCanvas.width = outW
  dstCanvas.height = outH
  const dstCtx = dstCanvas.getContext('2d')!
  const dstData = dstCtx.createImageData(outW, outH)
  const out = dstData.data

  const sample = (sx: number, sy: number): number => {
    const idx = (sy * width + sx) * 4
    const r = pixels[idx]
    const g = pixels[idx + 1]
    const b = pixels[idx + 2]
    const maxC = Math.max(r, g, b)
    const minC = Math.min(r, g, b)
    const sat = maxC - minC

    if (mode === 'white') {
      // Erase green/cyan vertical indicator bars next to Match Summary numbers
      if (sat > 45 && r < 140 && (g > 160 || b > 160)) return 0
      const neutralLum = minC - sat * 0.6
      return Math.max(0, Math.min(255, (neutralLum - 125) * 2.2))
    }

    // 'max' mode: preserves white text AND green/yellow/orange rating numbers on dark cards
    const lum = Math.max(r * 1.1, g * 1.18, b * 0.85)
    return Math.max(0, Math.min(255, (lum - 90) * 2.1))
  }

  for (let y = 0; y < outH; y++) {
    const fy = ry + y / scale
    const y0 = Math.min(height - 1, Math.max(0, Math.floor(fy)))
    const y1 = Math.min(height - 1, y0 + 1)
    const wy = fy - y0

    for (let x = 0; x < outW; x++) {
      const fx = rx + x / scale
      const x0 = Math.min(width - 1, Math.max(0, Math.floor(fx)))
      const x1 = Math.min(width - 1, x0 + 1)
      const wx = fx - x0

      const v00 = sample(x0, y0)
      const v10 = sample(x1, y0)
      const v01 = sample(x0, y1)
      const v11 = sample(x1, y1)
      const top = v00 * (1 - wx) + v10 * wx
      const bot = v01 * (1 - wx) + v11 * wx
      const textStrength = top * (1 - wy) + bot * wy
      const v = Math.round(255 - Math.max(0, Math.min(255, textStrength)))

      const outIdx = (y * outW + x) * 4
      out[outIdx] = v
      out[outIdx + 1] = v
      out[outIdx + 2] = v
      out[outIdx + 3] = 255
    }
  }

  dstCtx.putImageData(dstData, 0, 0)
  return dstCanvas.toDataURL('image/png')
}

function cleanNumToken(raw: string): number | null {
  const cleaned = raw
    .replace(/[oO©]/g, '0')
    .replace(/[lI|!\]]/g, '1')
    .replace(/s/gi, '5')
    .replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Parses the 3 circular gauges on either side of Match Summary:
 * 1) Dribble Success Rate (%)
 * 2) Shot Accuracy (%)
 * 3) Pass Accuracy (%)
 */
export function parseGaugeColumnText(text: string): {
  dribble?: number
  shot?: number
  pass?: number
} {
  const nums: number[] = []
  const matches = text.matchAll(/(\d{1,3})\s*%/g)
  for (const m of matches) {
    const v = Number(m[1])
    if (v >= 0 && v <= 100) nums.push(v)
  }
  if (nums.length < 3) {
    // Fallback: any 2-3 digit numbers in order
    const fallback = text
      .split(/\s+/)
      .map((t) => Number(t.replace(/[^0-9]/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 100)
    return {
      dribble: nums[0] ?? fallback[0],
      shot: nums[1] ?? fallback[1],
      pass: nums[2] ?? fallback[2],
    }
  }
  return {
    dribble: nums[0],
    shot: nums[1],
    pass: nums[2],
  }
}

/**
 * Parses the center comparison table on Match Summary.
 */
export function parseCenterSummaryText(text: string): Partial<ParsedMatchSummary> {
  const out: Partial<ParsedMatchSummary> = {}
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const matchLinePair = (line: string): [number, number] | null => {
    // Normalize common OCR substitutions at line start/end
    const tokens = line.split(/\s+/)
    if (tokens.length < 2) return null
    const left = cleanNumToken(tokens[0])
    const right = cleanNumToken(tokens[tokens.length - 1])
    if (left == null || right == null) return null
    return [left, right]
  }

  for (const line of lines) {
    const low = line.toLowerCase()
    const pair = matchLinePair(line)
    if (!pair) continue
    let [l, r] = pair

    if (low.includes('possess') || low.includes('postes')) {
      if (l >= 0 && l <= 100) out.possessionLeft = l
      if (r >= 0 && r <= 100) out.possessionRight = r
      else if (out.possessionLeft != null) out.possessionRight = 100 - out.possessionLeft
    } else if (low.includes('recovery') || low.includes('second')) {
      out.ballRecoveryTimeLeft = l
      out.ballRecoveryTimeRight = r
    } else if (low.includes('expected') || low.includes('goals')) {
      if (l > 25) l = Number((l / 100).toFixed(2))
      if (r > 25) r = Number((r / 100).toFixed(2))
      out.xgLeft = l
      out.xgRight = r
    } else if (low.includes('shot')) {
      out.shotsLeft = l
      out.shotsRight = r
    } else if (low.includes('pass') || low.includes('pars')) {
      out.passesLeft = l
      out.passesRight = r
    } else if (low.includes('won') || low.includes('wan')) {
      out.tacklesWonLeft = l
      out.tacklesWonRight = r
    } else if (low.includes('tackle')) {
      out.tacklesLeft = l
      out.tacklesRight = r
    } else if (low.includes('intercept')) {
      out.interceptionsLeft = l
      out.interceptionsRight = r
    } else if (low.includes('save')) {
      out.savesLeft = l
      out.savesRight = r
    } else if (low.includes('foul') || low.includes('cormmit') || low.includes('commit')) {
      out.foulsLeft = l
      out.foulsRight = r
    } else if (low.includes('offside') || low.includes('offart')) {
      out.offsidesLeft = l
      out.offsidesRight = r
    } else if (low.includes('corner') || low.includes('comer')) {
      out.cornersLeft = l
      out.cornersRight = r
    } else if (low.includes('free')) {
      out.freeKicksLeft = l
      out.freeKicksRight = r
    } else if (low.includes('penalt') || low.includes('panalt')) {
      out.penaltiesLeft = l
      out.penaltiesRight = r
    } else if (low.includes('yellow') || low.includes('allow')) {
      out.yellowCardsLeft = l
      out.yellowCardsRight = r
    } else if (low.includes('red')) {
      out.redCardsLeft = l
      out.redCardsRight = r
    }
  }

  return out
}

/**
 * Parses the Player Performance left table (`POS Name RR G AST`).
 */
export function parsePerformanceRosterText(
  rosterText: string,
  rightStatsText?: string,
  clubHeaderText?: string,
): ParsedPerformanceRoster {
  const lines = rosterText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const players: ParsedPerformanceRoster['players'] = []

  for (const line of lines) {
    if (/^pos/i.test(line)) continue
    const tokens = line.split(/\s+/)
    if (tokens.length < 4) continue

    const pos = normalizePos(tokens[0])
    if (!pos) continue

    // Last 3 tokens are RR, G, AST
    const astRaw = tokens[tokens.length - 1]
    const gRaw = tokens[tokens.length - 2]
    const rrRaw = tokens[tokens.length - 3]
    const nameTokens = tokens.slice(1, tokens.length - 3)
    const name = nameTokens.join(' ').replace(/^[^a-zA-Z0-9]+/, '').trim()
    if (!name) continue

    let rr = cleanNumToken(rrRaw) ?? 7.0
    if (rr >= 15 && rr <= 100) rr = Number((rr / 10).toFixed(1))
    if (rr < 3 || rr > 10) rr = 7.0

    const goals = Math.max(0, Math.min(20, Math.round(cleanNumToken(gRaw) ?? 0)))
    const assists = Math.max(0, Math.min(20, Math.round(cleanNumToken(astRaw) ?? 0)))

    players.push({
      pos,
      name,
      rating: rr,
      goals,
      assists,
    })
  }

  // If right-side detailed stats for the highlighted player (usually row 0 or matched) are present, parse them
  if (rightStatsText && players.length > 0) {
    const target = players[0]
    const rLines = rightStatsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    for (const line of rLines) {
      const low = line.toLowerCase()
      const nums = [...line.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
      if (nums.length === 0) continue
      const playerVal = nums[0]

      if (low.startsWith('shots')) target.shots = playerVal
      else if (low.includes('shot accuracy')) target.shotAccuracy = Math.min(100, playerVal)
      else if (low.startsWith('passes')) {
        // If OCR merged '11 155' into '115', wait: we crop before the team column, or if > 60 take first 2 digits
        target.passes = playerVal > 90 && String(playerVal).length === 3 ? Number(String(playerVal).slice(0, 2)) : playerVal
      } else if (low.includes('pass accuracy')) target.passAccuracy = Math.min(100, playerVal)
      else if (low.startsWith('dribbles')) target.dribbles = playerVal
      else if (low.includes('dribble success')) target.dribbleSuccessRate = Math.min(100, playerVal)
      else if (low.startsWith('tackles')) target.tackles = playerVal
      else if (low.includes('tackle success')) target.tackleSuccessRate = Math.min(100, playerVal)
      else if (low.startsWith('offsides')) target.offsides = playerVal
      else if (low.includes('fouls')) target.foulsCommitted = playerVal
      else if (low.includes('possession won') || low.includes('possession wan')) target.possessionWon = playerVal
      else if (low.includes('possession lost')) target.possessionLost = playerVal
      else if (low.includes('minutes played')) target.minutesPlayed = Math.min(120, playerVal)
      else if (low.includes('distance covered')) target.distanceCovered = playerVal
      else if (low.includes('distance sprinted')) target.distanceSprinted = playerVal
    }
  }

  return {
    clubName: clubHeaderText?.trim() || undefined,
    players,
  }
}

/**
 * Parses a column of gamertags from the PLAYERS screen.
 */
export function parseGamertagColumn(text: string): Array<{ gamertag: string; platform: 'ps' | 'pc' }> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const out: Array<{ gamertag: string; platform: 'ps' | 'pc' }> = []
  for (const raw of lines) {
    // Strip leading OCR artifacts from platform icons
    const cleaned = raw
      .replace(/^(\[x\]|\([xX]\)|[©®@()[\]~“”"'-.,|+=#]+|\b(?:PD|PY|MD|MY|PN|i|I|1|2)\)?\s+)+/g, '')
      .trim()
      .replace(/\s+/g, '_')
    if (cleaned.length < 2) continue
    if (/^(player|players|ive|blt)$/i.test(cleaned)) continue
    out.push({
      gamertag: cleaned,
      platform: 'ps',
    })
  }
  return out
}

function clubMatches(ocrText: string | undefined, clubName: string, clubShort?: string): boolean {
  if (!ocrText) return false
  const normOcr = ocrText.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normClub = clubName.toLowerCase().replace(/\bvfc\b|\bfc\b/g, '').replace(/[^a-z0-9]/g, '')
  if (!normOcr || !normClub) return false
  if (normOcr.includes(normClub) || normClub.includes(normOcr)) return true
  // Check first word (at least 4 chars, e.g. 'invictus' or 'ballotz')
  const firstWord = clubName.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9]/g, '')
  if (firstWord && firstWord.length >= 4 && normOcr.includes(firstWord)) return true
  if (clubShort && normOcr === clubShort.toLowerCase().replace(/[^a-z0-9]/g, '')) return true
  return false
}

/**
 * Runs region-based OCR across 1 or more EA FC 26/27 match screenshots.
 */
export async function parseMatchScreenshots(
  files: File[],
  homeClubName: string,
  awayClubName: string,
  onProgress?: (status: string) => void,
): Promise<ScreenshotParseResult> {
  const worker: Worker = await createWorker('eng')
  const result: ScreenshotParseResult = {
    screensDetected: [],
    swappedSides: false,
    rosters: [],
  }

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      onProgress?.(`Analyzing screenshot ${i + 1} of ${files.length} (${file.name})…`)
      const img = await loadImage(file)

      // Quick full-top probe to classify which EA FC screen this screenshot is
      const topProbeUrl = cropAndEnhanceToDataUrl(img, 0.02, 0.01, 0.96, 0.22, 'white', 2)
      const { data: topData } = await worker.recognize(topProbeUrl)
      const topText = topData.text

      const isPlayerPerf = /player\s*performance/i.test(topText)
      const isPlayersLobby = /\bplayers\b/i.test(topText)

      if (isPlayerPerf) {
        onProgress?.(`Extracting Player Performance table from ${file.name}…`)
        const [headerRes, rosterRes, statsRes] = await Promise.all([
          worker.recognize(cropAndEnhanceToDataUrl(img, 0.68, 0.025, 0.25, 0.09, 'white', 3)),
          worker.recognize(cropAndEnhanceToDataUrl(img, 0.031, 0.28, 0.318, 0.61, 'max', 3)),
          worker.recognize(cropAndEnhanceToDataUrl(img, 0.659, 0.255, 0.26, 0.65, 'white', 3)),
        ])
        const parsedRoster = parsePerformanceRosterText(
          rosterRes.data.text,
          statsRes.data.text,
          headerRes.data.text,
        )
        if (parsedRoster.players.length > 0) {
          result.rosters.push(parsedRoster)
          result.screensDetected.push(
            `Player Performance (${parsedRoster.clubName || 'Club'}: ${parsedRoster.players.length} players)`,
          )
        }
      } else if (isPlayersLobby) {
        onProgress?.(`Extracting Players Gamertag list from ${file.name}…`)
        const [leftRes, rightRes] = await Promise.all([
          worker.recognize(cropAndEnhanceToDataUrl(img, 0.102, 0.49, 0.25, 0.49, 'white', 3)),
          worker.recognize(cropAndEnhanceToDataUrl(img, 0.594, 0.49, 0.25, 0.49, 'white', 3)),
        ])
        const leftPlayers = parseGamertagColumn(leftRes.data.text)
        const rightPlayers = parseGamertagColumn(rightRes.data.text)
        if (leftPlayers.length > 0 || rightPlayers.length > 0) {
          result.playersScreen = {
            leftPlayers,
            rightPlayers,
          }
          result.screensDetected.push(
            `Players Lobby (${leftPlayers.length + rightPlayers.length} gamertags)`,
          )
        }
      } else {
        // Default / Match Summary screen
        onProgress?.(`Extracting 20 Match Summary stats & gauges from ${file.name}…`)
        const [headerRes, leftGaugeRes, centerRes, rightGaugeRes] = await Promise.all([
          worker.recognize(cropAndEnhanceToDataUrl(img, 0.24, 0.025, 0.52, 0.1, 'white', 3)),
          worker.recognize(cropAndEnhanceToDataUrl(img, 0.095, 0.21, 0.17, 0.72, 'white', 3)),
          worker.recognize(cropAndEnhanceToDataUrl(img, 0.332, 0.21, 0.328, 0.72, 'white', 3)),
          worker.recognize(cropAndEnhanceToDataUrl(img, 0.732, 0.21, 0.17, 0.72, 'white', 3)),
        ])

        const leftGauges = parseGaugeColumnText(leftGaugeRes.data.text)
        const rightGauges = parseGaugeColumnText(rightGaugeRes.data.text)
        const centerStats = parseCenterSummaryText(centerRes.data.text)

        // Parse top scoreline (e.g. "Invictus Elite 2 : 4 BALLOTZ VFC")
        const headerLine = headerRes.data.text.split(/\r?\n/)[0] ?? ''
        const scoreMatch = headerLine.match(/(\d+)\s*[:.,-]\s*(\d+)/)
        let leftScore: number | undefined
        let rightScore: number | undefined
        let leftClubName: string | undefined
        let rightClubName: string | undefined

        if (scoreMatch && scoreMatch.index != null) {
          leftScore = Number(scoreMatch[1])
          rightScore = Number(scoreMatch[2])
          leftClubName = headerLine.slice(0, scoreMatch.index).replace(/[^a-zA-Z0-9\s]/g, '').trim()
          rightClubName = headerLine
            .slice(scoreMatch.index + scoreMatch[0].length)
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .trim()
        }

        // Detect if screenshot has Away Club on the left and Home Club on the right
        const leftIsAway =
          clubMatches(leftClubName, awayClubName) || clubMatches(rightClubName, homeClubName)
        const leftIsHome =
          clubMatches(leftClubName, homeClubName) || clubMatches(rightClubName, awayClubName)

        if (leftIsAway && !leftIsHome) {
          result.swappedSides = true
        }

        result.summary = {
          leftClubName,
          rightClubName,
          leftScore,
          rightScore,
          dribbleSuccessLeft: leftGauges.dribble,
          dribbleSuccessRight: rightGauges.dribble,
          shotAccuracyLeft: leftGauges.shot,
          shotAccuracyRight: rightGauges.shot,
          passAccuracyLeft: leftGauges.pass,
          passAccuracyRight: rightGauges.pass,
          ...centerStats,
        }
        result.screensDetected.push('Match Summary (Scoreline, 6 Gauges & 15 Team Metrics)')
      }
    }
  } finally {
    await worker.terminate()
  }

  return result
}

/**
 * Helper to match an extracted Pro Name / Gamertag to a club's registered squad list.
 */
export function matchToRegisteredSquad(
  extractedName: string,
  squad: Array<{ id: number; gamertag: string }>,
  lobbyGamertags?: Array<{ gamertag: string; platform: 'ps' | 'pc' }>,
): { gamertag: string; proName: string; platform: 'ps' | 'pc' } {
  const norm = extractedName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!norm) return { gamertag: extractedName, proName: '', platform: 'ps' }

  // 1. Direct or substring match against registered club squad
  const squadHit = squad.find((s) => {
    const sn = s.gamertag.toLowerCase().replace(/[^a-z0-9]/g, '')
    return sn === norm || (norm.length >= 3 && (sn.includes(norm) || norm.includes(sn)))
  })
  if (squadHit) {
    const lobbyHit = lobbyGamertags?.find(
      (l) => l.gamertag.toLowerCase().replace(/[^a-z0-9]/g, '') === squadHit.gamertag.toLowerCase().replace(/[^a-z0-9]/g, ''),
    )
    return {
      gamertag: squadHit.gamertag,
      proName: squadHit.gamertag.toLowerCase() === extractedName.toLowerCase() ? '' : extractedName,
      platform: lobbyHit?.platform ?? 'ps',
    }
  }

  // 2. Match against lobby gamertags screenshot if uploaded
  const lobbyHit = lobbyGamertags?.find((l) => {
    const ln = l.gamertag.toLowerCase().replace(/[^a-z0-9]/g, '')
    return ln === norm || (norm.length >= 3 && (ln.includes(norm) || norm.includes(ln)))
  })
  if (lobbyHit) {
    return {
      gamertag: lobbyHit.gamertag,
      proName: lobbyHit.gamertag.toLowerCase() === extractedName.toLowerCase() ? '' : extractedName,
      platform: lobbyHit.platform,
    }
  }

  return {
    gamertag: extractedName,
    proName: extractedName,
    platform: 'ps',
  }
}

export function buildPlayerRowsFromRoster(
  clubId: number,
  roster: ParsedPerformanceRoster['players'],
  squad: Array<{ id: number; gamertag: string }>,
  concededGoals: number,
  lobbyGamertags?: Array<{ gamertag: string; platform: 'ps' | 'pc' }>,
): PlayerRow[] {
  let highestRating = -1
  let momIdx = 0
  roster.forEach((p, idx) => {
    if (p.rating > highestRating) {
      highestRating = p.rating
      momIdx = idx
    }
  })

  return roster.map((p, idx) => {
    const matched = matchToRegisteredSquad(p.name, squad, lobbyGamertags)
    const isGkOrDef = ['GK', 'LB', 'LCB', 'CB', 'RCB', 'RB', 'LWB', 'RWB'].includes(p.pos)
    return {
      clubId,
      gamertag: matched.gamertag,
      proName: matched.proName,
      pos: p.pos,
      platform: matched.platform,
      rating: p.rating,
      goals: p.goals,
      assists: p.assists,
      shots: p.shots ?? p.goals,
      shotAccuracy: p.shotAccuracy ?? (p.goals > 0 ? 100 : 0),
      passes: p.passes ?? 0,
      passAttempts: 0,
      passAccuracy: p.passAccuracy ?? 0,
      dribbles: p.dribbles ?? 0,
      dribbleSuccessRate: p.dribbleSuccessRate ?? 0,
      tackles: p.tackles ?? 0,
      tackleAttempts: 0,
      tackleSuccessRate: p.tackleSuccessRate ?? 0,
      offsides: p.offsides ?? 0,
      foulsCommitted: p.foulsCommitted ?? 0,
      possessionWon: p.possessionWon ?? 0,
      possessionLost: p.possessionLost ?? 0,
      minutesPlayed: p.minutesPlayed ?? 90,
      distanceCovered: p.distanceCovered ?? 0,
      distanceSprinted: p.distanceSprinted ?? 0,
      saves: 0,
      cleanSheet: concededGoals === 0 && isGkOrDef,
      isMom: idx === momIdx && p.rating >= 7.5,
      yellowCards: 0,
      redCards: 0,
    }
  })
}
