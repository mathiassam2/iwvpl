/**
 * Base-aware URLs for files served from `public/`.
 *
 * Vite rewrites `/…` references inside index.html, but it does **not** rewrite
 * string literals in JS/TS. So a hardcoded `src="/assets/brand/logo.svg"` keeps
 * its leading slash in the bundle and resolves against the site origin instead
 * of the deploy base — under GitHub Pages that means
 * `https://<user>.github.io/assets/…` rather than `…/iwvpl/assets/…`, i.e. a
 * silent 404 for every image. Route public/ assets through `asset()` instead.
 */
export function asset(path: string): string {
  // BASE_URL is normalised to end in '/' by Vite; the '/' fallback covers
  // non-Vite contexts (tests, tooling) so this never yields a double slash.
  const base = import.meta.env.BASE_URL || '/'
  return base + path.replace(/^\/+/, '')
}