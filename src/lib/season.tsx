import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { SITE } from '@/data'
import { getLiveSeason, liveLeagueEnabled, type LeagueSeason } from '@/lib/liveLeague'

interface SeasonContextValue {
  seasonName: string
}

const SeasonContext = createContext<SeasonContextValue>({ seasonName: SITE.season })

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [season, setSeason] = useState<LeagueSeason | null>(null)

  useEffect(() => {
    if (!liveLeagueEnabled) return
    const controller = new AbortController()
    getLiveSeason(controller.signal)
      .then(setSeason)
      .catch(() => {
        if (!controller.signal.aborted) setSeason(null)
      })
    return () => controller.abort()
  }, [])

  return (
    <SeasonContext.Provider value={{ seasonName: season?.name ?? SITE.season }}>
      {children}
    </SeasonContext.Provider>
  )
}

export function useSeasonName() {
  return useContext(SeasonContext).seasonName
}
