import raw from '@/data/site_data.json'
import type { NewsPost, SiteData } from '@/types/site'
import { asset } from '@/lib/assets'

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

export const SITE = siteData.site

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