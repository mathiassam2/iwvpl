/**
 * Website Content CMS helper.
 *
 * Reads static defaults from `src/data/site_data.json` (config.paths.crawlData)
 * and overlays any admin-edited JSON sections stored in `site_content`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { config } from '../config.js'
import { execute, queryAll } from '../db.js'

export type SiteSectionKey = 'site' | 'about' | 'products' | 'news'

export const ALLOWED_SECTIONS = new Set<SiteSectionKey>(['site', 'about', 'products', 'news'])

let cachedDefaults: Record<SiteSectionKey, any> | null = null

export function getDefaultSiteContent(): Record<SiteSectionKey, any> {
  if (cachedDefaults) return cachedDefaults
  const fallback: Record<SiteSectionKey, any> = {
    site: {
      name: 'Island-Wide Virtual Premier League',
      shortName: 'IWVPL',
      tagline: 'Forging Virtual Football Champions',
      subtitle: 'Virtual Premier League Competition, Base Singapore',
      description:
        'The Island-Wide Virtual Premier League (IWVPL) is your home for top-tier EA FC competitive action across Southeast Asia.',
      url: 'https://www.iwvpl.asia',
      email: 'iwvplofficial@gmail.com',
      base: 'Singapore',
      copyright: '© 2026 Island-Wide Virtual Premier League. All rights reserved.',
      disclaimer:
        'IWVPL is an independent league promoter and is not affiliated with, sponsored, or endorsed by Electronic Arts Inc. EA SPORTS and EA FC are registered trademarks of Electronic Arts Inc.',
      social: [
        { label: 'Discord', href: '#' },
        { label: 'Instagram', href: '#' },
        { label: 'TikTok', href: '#' },
      ],
      season: '2026 Season 1',
      registrationFee: 'SGD 35',
      teamCap: 36,
      teamsRegistered: 18,
    },
    about: {
      intro:
        'The Island-Wide Virtual Premier League (IWVPL) is an independent esports organisation built by passionate gamers, for the community.',
      vision: 'To unite the EA SPORTS FC community across Southeast Asia on one platform.',
      faq: [],
    },
    products: [],
    news: [],
  }

  try {
    if (existsSync(config.paths.crawlData)) {
      const raw = JSON.parse(readFileSync(config.paths.crawlData, 'utf8'))
      cachedDefaults = {
        site: raw.site ?? fallback.site,
        about: raw.about ?? fallback.about,
        products: Array.isArray(raw.products) ? raw.products : fallback.products,
        news: Array.isArray(raw.news) ? raw.news : fallback.news,
      }
      return cachedDefaults
    }
  } catch (err) {
    console.warn('Could not read default site_data.json:', err)
  }

  cachedDefaults = fallback
  return cachedDefaults
}

export async function loadSiteContent(): Promise<Record<SiteSectionKey, any>> {
  const defaults = getDefaultSiteContent()
  const result: Record<SiteSectionKey, any> = {
    site: structuredClone(defaults.site),
    about: structuredClone(defaults.about),
    products: structuredClone(defaults.products),
    news: structuredClone(defaults.news),
  }

  try {
    const rows = await queryAll<{ section_key: string; content_json: string }>(
      'SELECT section_key, content_json FROM site_content',
    )
    for (const row of rows) {
      const key = row.section_key as SiteSectionKey
      if (!ALLOWED_SECTIONS.has(key)) continue
      try {
        const parsed = JSON.parse(row.content_json)
        if (key === 'site' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          result.site = {
            ...result.site,
            ...parsed,
            social: Array.isArray(parsed.social)
              ? parsed.social
              : Array.isArray(parsed.socials)
                ? parsed.socials
                : result.site?.social ?? [],
          }
        } else if (key === 'about' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          result.about = {
            ...result.about,
            ...parsed,
            intro: Array.isArray(parsed.intro)
              ? parsed.intro.join('\n')
              : typeof parsed.intro === 'string'
                ? parsed.intro
                : result.about?.intro ?? '',
            vision:
              typeof parsed.vision === 'string' ? parsed.vision : result.about?.vision ?? '',
            faq: Array.isArray(parsed.faq)
              ? parsed.faq
              : Array.isArray(parsed.faqs)
                ? parsed.faqs
                : result.about?.faq ?? [],
          }
        } else if ((key === 'products' || key === 'news') && Array.isArray(parsed)) {
          result[key] = parsed
        }
      } catch {
        // Ignore malformed JSON row
      }
    }
  } catch {
    // Table may not exist yet before migration runs; return defaults gracefully
  }

  return result
}

export async function saveSiteContentSection(
  section: SiteSectionKey,
  content: unknown,
): Promise<Record<SiteSectionKey, any>> {
  const json = JSON.stringify(content)
  if (json.length > 12_000_000) {
    throw Object.assign(new Error('Content payload is too large.'), { status: 400 })
  }
  await execute(
    `INSERT INTO site_content (section_key, content_json, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       content_json = VALUES(content_json),
       updated_at = NOW()`,
    [section, json],
  )
  return loadSiteContent()
}
