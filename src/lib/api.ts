/**
 * Client for the authenticated API.
 *
 * Every request sends `credentials: 'include'`. That is what carries the
 * session cookie, and it is why the cookie has to be SameSite=None — the
 * public site is served from GitHub Pages while the API runs on Render, so the
 * cookie is cross-site. Same as admin/src/api.ts: no base URL is configured by
 * hand, it comes from VITE_API_BASE_URL at build time, and is empty when the
 * SPA is served by the API itself.
 */

const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/** True when the SPA is not served by the API, i.e. accounts need CORS. */
export const authAvailable = Boolean(base) || import.meta.env.BASE_URL === '/'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    // fetch only rejects on a network-level failure. A wrong API URL and a
    // server that is asleep are indistinguishable here, and both mean "the
    // league API is unreachable" as far as the person clicking is concerned.
    throw new ApiError(0, 'Could not reach the league server. Try again shortly.')
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      /* non-JSON error body - keep the generic message */
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

/* ------------------------------------------------------------------ types */

export type Role = 'owner' | 'admin' | 'club_manager' | 'player'

export interface User {
  id: number
  email: string
  name: string
  role: Role
  clubId: number | null
  clubName: string | null
  clubSlug: string | null
  /** 'active' | 'pending' | 'withdrawn'. Null when the account owns no club. */
  clubStatus: 'active' | 'pending' | 'withdrawn' | null
  playerId: number | null
  gamertag: string | null
  unread: number
}

export interface Offer {
  id: number
  kind: string | null
  message: string | null
  status: string
  created_at: string
  responded_at: string | null
  club_id?: number
  club_name?: string
  club_slug?: string
  logo_local?: string | null
  player_id?: number
  gamertag?: string
  avatar_local?: string | null
  from_club_name?: string | null
  pending_id?: number | null
}

export interface Notification {
  id: number
  kind: string
  title: string
  body: string | null
  link: string | null
  is_read: number
  created_at: string
}

/* ------------------------------------------------------------------- auth */

export const login = (email: string, password: string) =>
  post<{ user: User }>('/api/auth/login', { email, password })

export const register = (payload: {
  role: 'player' | 'club_manager'
  email: string
  password: string
  name?: string
  gamertag?: string
  clubName?: string
}) => post<{ user: User }>('/api/auth/register', payload)

export const logout = () => post<{ ok: true }>('/api/auth/logout')

/** Never throws for "not signed in" — the API answers 200 with a null user,
 *  because the client asks this on boot to decide what to render. */
export const me = () => request<{ user: User | null }>('/api/auth/me')

/* ---------------------------------------------------------------- manager */

export const createClub = (name: string) => post<{ ok: true; clubId: number }>('/api/manager/club', { name })

export const searchPlayers = (q: string, signal?: AbortSignal) =>
  request<{
    players: Array<{
      id: number
      gamertag: string
      slug: string
      avatar_local: string | null
      club_id: number | null
      club_name: string | null
      pending_id: number | null
    }>
  }>(`/api/manager/players?q=${encodeURIComponent(q)}`, { signal })

export const sendOffer = (playerId: number, kind: string | null, message: string | null) =>
  post<{ ok: true; id: number }>('/api/manager/offers', { playerId, kind, message })

export const cancelOffer = (id: number) =>
  request<{ ok: true }>(`/api/manager/offers/${id}`, { method: 'DELETE' })

export const managerOffers = () => request<{ offers: Offer[] }>('/api/manager/offers')

export const squad = () =>
  request<{
    club: { id: number; name: string; slug: string }
    squad: Array<{
      id: number
      gamertag: string
      slug: string
      avatar_local: string | null
      is_free_agent: number
      pending: number
    }>
  }>('/api/manager/squad')

/* ----------------------------------------------------------------- player */

export const playerOverview = () =>
  request<{
    player: { id: number; gamertag: string; club_id: number | null }
    club: { id: number; name: string; slug: string } | null
    pending: number
  }>('/api/player/me')

export const incomingOffers = () => request<{ offers: Offer[] }>('/api/player/offers')

export const decideOffer = (id: number, decision: 'accept' | 'reject') =>
  post<{ ok: true; status: string }>(`/api/player/offers/${id}/${decision}`)

export const leaveClub = () => post<{ ok: true }>('/api/player/leave')

/* ----------------------------------------------------------- notifications */

export const listNotifications = () =>
  request<{ notifications: Notification[]; unread: number }>('/api/notifications')

export const markNotificationsRead = () => post<{ ok: true }>('/api/notifications/read')