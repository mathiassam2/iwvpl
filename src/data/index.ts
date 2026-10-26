import { createElement, createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import raw from '@/data/site_data.json'
import type { NewsPost, SiteData } from '@/types/site'
import { asset } from '@/lib/assets'
import { getLiveClubs, getLiveFormats, getLiveRegions, liveLeagueEnabled } from '@/lib/liveLeague'

/**
 * `site_data.json` stores asset paths as `/assets/…`, which is correct at the
 * site root but wrong under the GitHub Pages base (`/iwvpl/`). The JSON mirrors
 * the crawl output, so the fix belongs here rather than in 500+ data rows:
 * rebase every such string once, at import.
 */
function rebaseAssets<T>(value: T): T {
  if (typeof value === 'string') {
    return (value.startsWith('/assets/') ? asset(value) : value) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map(rebaseAssets) as unknown as T
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      (value as Record<string, unknown>)[key] = rebaseAssets(
        (value as Record<string, unknown>)[key]
      )
    }
  }
  return value
}

export const siteData = rebaseAssets(raw) as unknown as SiteData

// Normalize static fallback clubs to 'Active' so no public page ever flashes
// "Pending Approval" before the live `/api/clubs` response arrives.
if (Array.isArray(siteData.clubs)) {
  for (const c of siteData.clubs) {
    c.status = 'Active'
  }
}

export const SITE = siteData.site

const SiteContentVersionContext = createContext<number>(0)

export function useSiteContentVersion(): number {
  return useContext(SiteContentVersionContext)
}

/**
 * Hydrates `siteData` & `SITE` in-place from `/api/site-content` when the API
 * is reachable, so CMS updates from the Admin panel reflect immediately on all
 * public pages (Home, About, News, Entries, Contact, Register, Footer).
 */
export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
    let cancelled = false

    // Warm live clubs, regions, and formats immediately on startup and keep
    // siteData.clubs synchronized with the database so all pages render seamlessly.
    if (liveLeagueEnabled) {
      getLiveClubs()
        .then((liveClubs) => {
          if (!cancelled && liveClubs.length > 0) {
            siteData.clubs = liveClubs
            setVersion((v) => v + 1)
          }
        })
        .catch(() => {})
      void getLiveRegions().catch(() => {})
      void getLiveFormats().catch(() => {})
    }

    fetch(`${base}/api/site-content`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data !== 'object') return
        if (data.site && typeof data.site === 'object') {
          Object.assign(siteData.site, rebaseAssets(data.site))
        }
        if (data.about && typeof data.about === 'object') {
          Object.assign(siteData.about, rebaseAssets(data.about))
        }
        if (Array.isArray(data.products)) {
          siteData.products = rebaseAssets(data.products)
        }
        if (Array.isArray(data.news)) {
          siteData.news = rebaseAssets(data.news)
        }
        setVersion((v) => v + 1)
      })
      .catch(() => {
        /* static fallback already loaded */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return createElement(SiteContentVersionContext.Provider, { value: version, key: version }, children)
}

/**
 * News slugs come from WordPress, so titles containing emoji are stored
 * percent-encoded (`%f0%9f%94%a5-...`). React Router decodes route params, so a
 * straight `slug === param` comparison never matches. Both sides are decoded
 * and normalised before comparing.
 */
function normalize(s: string): string {
  let out = (s ?? '').toLowerCase()
  try {
    out = decodeURIComponent(out)
  } catch {
    /* malformed sequence - keep the raw value */
  }
  return out
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\p{L}\p{N}-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

export function findPost(slug: string | undefined): NewsPost | undefined {
  if (!slug) return undefined
  const target = normalize(slug)
  return siteData.news.find((p) => normalize(p.slug) === target)
}

export function postHref(post: NewsPost): string {
  return `/news/${post.slug}`
}