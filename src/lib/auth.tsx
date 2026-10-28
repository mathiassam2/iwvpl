/**
 * Signed-in state.
 *
 * One provider above the router so the header, the dashboard and the route
 * guard all read the same object. The session lives in an HttpOnly cookie the
 * JavaScript cannot read, so the only way to know who is signed in is to ask
 * the server — which `me()` does once on mount.
 *
 * A user object is never persisted to localStorage. It is re-fetched from the
 * server on every load, so clearing site data really does sign you out and a
 * stale cached name cannot be shown to someone who has since been deactivated.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, authAvailable, logout, me, type User } from './api'

interface AuthValue {
  user: User | null
  /** True until the initial /me request settles. The header shows neither the
   *  Login button nor the account menu during this, rather than flashing one
   *  and then swapping to the other. */
  loading: boolean
  refresh: () => Promise<User | null>
  setUser: (user: User | null) => void
  signOut: () => Promise<void>
  /** Unread count, kept in step with the server rather than counted locally. */
  setUnread: (n: number) => void
}

const defaultAuthValue: AuthValue = {
  user: null,
  loading: false,
  refresh: async () => null,
  setUser: () => {},
  signOut: async () => {},
  setUnread: () => {},
}

const AuthContext = createContext<AuthValue>(defaultAuthValue)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!authAvailable) {
      setLoading(false)
      return null
    }
    try {
      const { user } = await me()
      setUser(user)
      return user
    } catch (err) {
      // A network failure is not a signed-out state. Showing the Login button
      // because the server was briefly unreachable would silently discard a
      // perfectly good session; staying on the last known user is the honest
      // rendering of "we do not know right now".
      if (err instanceof ApiError && err.status === 0) return null
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // The cookie is cleared regardless below. A failed request must not
      // leave the person stuck in a signed-in shell.
    }
    setUser(null)
  }, [])

  const setUnread = useCallback((n: number) => {
    setUser((prev) => (prev ? { ...prev, unread: n } : prev))
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, loading, refresh, setUser, signOut, setUnread }),
    [user, loading, refresh, signOut, setUnread],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  return ctx ?? defaultAuthValue
}