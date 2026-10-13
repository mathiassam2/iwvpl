/**
 * Slug rules.
 *
 * These MUST stay byte-for-byte identical to `clubSlug()` and `stripFlag()` in
 * `src/lib/format.ts`. The database stores slugs as the public identity of a
 * club or player, and the SPA builds its URLs with its own copy of these
 * functions. If the two ever diverge, links silently 404 — a row exists under
 * one key while the router looks up another.
 *
 * That duplication is deliberate: the API is a separate package with its own
 * build and cannot import from the SPA's source tree. The alternative —
 * a shared workspace package — is worth revisiting if a third consumer appears.
 *
 * If you change a rule here, change it there in the same commit.
 */

const REGIONAL_INDICATOR = /[\u{1F1E6}-\u{1F1FF}]{2}\s*$/u

/** Strip a trailing regional-indicator flag emoji pair. */
export function stripFlag(name: string): string {
  return (name || '').replace(REGIONAL_INDICATOR, '').trim()
}

/**
 * Lowercase, dash-separated, URL-safe key that keeps unicode letters.
 *
 * Note that accented characters survive: 'Pényámunz' becomes 'pényámunz', not
 * 'p-ny-munz'. The `\p{L}` class is what makes the match work at all, and the
 * WordPress team slugs are accented, so transliterating here would break
 * existing URLs.
 */
export function clubSlug(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\p{L}\p{N}-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

/** Case-insensitive identity key. 'LethaL_ShoTs11' and 'lethal_shots11' are one player. */
export function gamertagKey(gamertag: string): string {
  return (gamertag || '').trim().toLowerCase()
}