import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ClubCard } from '@/components/league'
import { Container, EmptyState, Section, Select, Tabs } from '@/components/ui'
import { SITE, siteData } from '@/data'
import type { ClubStatus } from '@/types/site'
import { stripFlag } from '@/lib/format'

type Filter = 'all' | ClubStatus

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All clubs' },
  { id: 'Active', label: 'Active' },
  { id: 'Non-Active', label: 'Non-active' },
  { id: 'Pending Approval', label: 'Pending' },
]

export default function ClubsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: siteData.clubs.length }
    for (const club of siteData.clubs) {
      c[club.status] = (c[club.status] ?? 0) + 1
    }
    return c
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return siteData.clubs.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false
      if (!term) return true
      return stripFlag(c.name).toLowerCase().includes(term) || c.code.toLowerCase().includes(term)
    })
  }, [filter, q])

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Participants"
        title="Clubs"
        lede={`Every club registered with ${SITE.name} for ${SITE.season}, with roster sizes and registration status.`}
      />

      <Section>
        <Container size="wide">
          <div className="mb-8 flex flex-col gap-5 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              tabs={FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts[f.id] ?? 0 }))}
              active={filter}
              onChange={(id) => setFilter(id as Filter)}
              idPrefix="club"
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={filter}
                onChange={(v) => setFilter(v as Filter)}
                options={FILTERS.map((f) => ({ value: f.id, label: `${f.label} (${counts[f.id] ?? 0})` }))}
                className="sm:w-52"
                ariaLabel="Filter clubs by registration status"
              />

              <div className="relative sm:w-64">
                <label htmlFor="club-search" className="sr-only">
                  Search clubs
                </label>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
                >
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  id="club-search"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search clubs or codes…"
                  className="h-11 w-full rounded-full border border-[var(--border-strong)] bg-[var(--surface)] pl-11 pr-4 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-faint)] outline-none transition-colors focus:border-[var(--accent-ring)]"
                />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No clubs match your search"
              hint="Try a different name, short code, or status filter."
            />
          ) : (
            <>
              <p className="mb-5 text-xs text-[var(--text-muted)]">
                Showing{' '}
                <span className="numeric font-semibold text-[var(--text)]">{filtered.length}</span>{' '}
                of {siteData.clubs.length} clubs
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filtered.map((club) => (
                  <ClubCard key={club.name} club={club} />
                ))}
              </div>
            </>
          )}
        </Container>
      </Section>
    </div>
  )
}