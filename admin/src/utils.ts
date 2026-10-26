export type Guard = <T>(fn: () => Promise<T>, what: string) => Promise<T>
export type Report = (kind: 'ok' | 'error' | 'info', text: string) => void

export const DEFAULT_REGIONS = [
  { flag: '🇸🇬', name: 'Singapore', iso: 'SG' },
  { flag: '🇲🇾', name: 'Malaysia', iso: 'MY' },
  { flag: '🇮🇩', name: 'Indonesia', iso: 'ID' },
  { flag: '🇹🇭', name: 'Thailand', iso: 'TH' },
  { flag: '🇧🇳', name: 'Brunei', iso: 'BN' },
  { flag: '🇵🇭', name: 'Philippines', iso: 'PH' },
  { flag: '🇻🇳', name: 'Vietnam', iso: 'VN' },
]

export const ISO_TO_FLAG: Record<string, string> = {
  SG: '🇸🇬',
  MY: '🇲🇾',
  ID: '🇮🇩',
  TH: '🇹🇭',
  BN: '🇧🇳',
  PH: '🇵🇭',
  VN: '🇻🇳',
}

export const FLAG_TO_ISO: Record<string, string> = {
  '🇸🇬': 'SG',
  '🇲🇾': 'MY',
  '🇮🇩': 'ID',
  '🇹🇭': 'TH',
  '🇧🇳': 'BN',
  '🇵🇭': 'PH',
  '🇻🇳': 'VN',
}

export function normalizeFlagToIso(flagOrIso: string | null | undefined): string {
  if (!flagOrIso) return ''
  const trimmed = flagOrIso.trim()
  if (FLAG_TO_ISO[trimmed]) return FLAG_TO_ISO[trimmed]
  const upper = trimmed.toUpperCase()
  if (ISO_TO_FLAG[upper]) return upper
  return upper
}

export function isSameCountry(
  flagOrIsoA: string | null | undefined,
  flagOrIsoB: string | null | undefined,
): boolean {
  if (!flagOrIsoA || !flagOrIsoB) return false
  const a = normalizeFlagToIso(flagOrIsoA)
  const b = normalizeFlagToIso(flagOrIsoB)
  return a.length > 0 && a === b
}

export function formatKickoffDisplay(kickoff: string | null): string {
  if (!kickoff) return 'Unscheduled'
  const iso = kickoff.includes('T') ? kickoff : kickoff.replace(' ', 'T')
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return kickoff
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toDatetimeLocalValue(kickoff: string | null): string {
  if (!kickoff) return ''
  const normalized = kickoff.replace(' ', 'T')
  return normalized.slice(0, 16)
}

export function slugifyText(input: string): string {
  return (input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resize & compress an uploaded image file to a data URL.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 512,
  maxHeight = 512,
  quality = 0.88,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file (PNG, JPG, WebP, or SVG).')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image file is too large (max 10 MB).')
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      if (file.type === 'image/svg+xml' && dataUrl.length < 400_000) {
        resolve(dataUrl)
        return
      }
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode the selected image.'))
      img.onload = () => {
        const scale = Math.min(
          1,
          maxWidth / Math.max(1, img.width),
          maxHeight / Math.max(1, img.height),
        )
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        ctx.clearRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        let out = canvas.toDataURL('image/webp', quality)
        if (!out.startsWith('data:image/webp')) {
          out = canvas.toDataURL('image/png')
        }
        resolve(out)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}
