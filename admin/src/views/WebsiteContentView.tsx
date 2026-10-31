import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  createAdminRegion,
  createFormat,
  deleteAdminRegion,
  deleteFormat,
  getAdminClubs,
  getAdminRegions,
  getFormats,
  getSiteContent,
  setFeaturedClubs,
  setFormatStatus,
  updateAdminRegion,
  updateAdminRegionOrder,
  updateClub,
  updateFormat,
  updateSiteContent,
  type Club,
  type CmsAboutData,
  type CmsNewsPost,
  type CmsProduct,
  type CmsSiteMeta,
  type CompetitionFormat,
  type FormatStatus,
  type HomepageRegion,
} from '../api'
import {
  compressImageFile,
  ISO_TO_FLAG,
  isSameCountry,
  slugifyText,
  type Guard,
  type Report,
} from '../utils'

type CmsSubTab = 'flags' | 'formats' | 'news' | 'passes' | 'site'

export function WebsiteContentView({
  guard,
  report,
  initialSub,
}: {
  guard: Guard
  report: Report
  initialSub?: string
}) {
  const [subTab, setSubTab] = useState<CmsSubTab>(() => {
    if (
      initialSub === 'flags' ||
      initialSub === 'formats' ||
      initialSub === 'news' ||
      initialSub === 'passes' ||
      initialSub === 'site'
    ) {
      return initialSub
    }
    return 'flags'
  })

  const [busy, setBusy] = useState(false)

  // 1. Flag Rail + Clubs
  const [regions, setRegions] = useState<HomepageRegion[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [previewIdx, setPreviewIdx] = useState(0)
  const [clubRegionFilter, setClubRegionFilter] = useState<'unassigned' | 'all'>('unassigned')
  const [clubRegionSearch, setClubRegionSearch] = useState('')
  const [regionClubPage, setRegionClubPage] = useState(1)
  const REGION_CLUBS_PAGE_SIZE = 15
  const [newsPage, setNewsPage] = useState(1)
  const NEWS_PAGE_SIZE = 10

  // Region Drawer
  const [regionDrawerOpen, setRegionDrawerOpen] = useState(false)
  const [editingRegion, setEditingRegion] = useState<HomepageRegion | null>(null)
  const [rName, setRName] = useState('')
  const [rIso, setRIso] = useState('')
  const [rFlag, setRFlag] = useState('')
  const [rArt, setRArt] = useState('')
  const [rActive, setRActive] = useState(true)
  const regionArtRef = useRef<HTMLInputElement | null>(null)

  // 2. Formats + Featured Crest Wall
  const [formats, setFormats] = useState<CompetitionFormat[]>([])
  const [featuredSlugs, setFeaturedSlugs] = useState<Set<string>>(new Set())
  const [formatDrawerOpen, setFormatDrawerOpen] = useState(false)
  const [editingFormat, setEditingFormat] = useState<CompetitionFormat | null>(null)
  const [fName, setFName] = useState('')
  const [fTag, setFTag] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fStatus, setFStatus] = useState<FormatStatus>('active')

  // 3, 4, 5: Site Content JSON sections
  const [siteMeta, setSiteMeta] = useState<CmsSiteMeta | null>(null)
  const [aboutData, setAboutData] = useState<CmsAboutData | null>(null)
  const [products, setProducts] = useState<CmsProduct[]>([])
  const [news, setNews] = useState<CmsNewsPost[]>([])

  // News Drawer
  const [newsDrawerOpen, setNewsDrawerOpen] = useState(false)
  const [editingNewsIdx, setEditingNewsIdx] = useState<number | null>(null)
  const [nTitle, setNTitle] = useState('')
  const [nSlug, setNSlug] = useState('')
  const [nDate, setNDate] = useState('')
  const [nCategories, setNCategories] = useState('Pro Club League')
  const [nTags, setNTags] = useState('SEASON 1')
  const [nImage, setNImage] = useState('')
  const [nExcerpt, setNExcerpt] = useState('')
  const [nBody, setNBody] = useState('')
  const newsImgRef = useRef<HTMLInputElement | null>(null)

  // Product / Entry Pass Drawer
  const [passDrawerOpen, setPassDrawerOpen] = useState(false)
  const [editingPassIdx, setEditingPassIdx] = useState<number | null>(null)
  const [pName, setPName] = useState('')
  const [pSlug, setPSlug] = useState('')
  const [pCategory, setPCategory] = useState('Registration Fee')
  const [pKicker, setPKicker] = useState('Team Registration')
  const [pPrice, setPPrice] = useState('SGD 35')
  const [pImage, setPImage] = useState('/assets/sponsors/pro-club-registration.webp')
  const [pSummary, setPSummary] = useState('')
  const [pValidFor, setPValidFor] = useState('One (1) Complete Team Entry')
  const [pAccess, setPAccess] = useState('Full access to Tournament & League Matches')
  const [pFeatures, setPFeatures] = useState('')
  const [pNote, setPNote] = useState('')
  const passImgRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (
      initialSub === 'flags' ||
      initialSub === 'formats' ||
      initialSub === 'news' ||
      initialSub === 'passes' ||
      initialSub === 'site'
    ) {
      setSubTab(initialSub)
    }
  }, [initialSub])

  const loadAll = useCallback(async () => {
    try {
      const [regionsList, clubsList, formatsList, cms] = await Promise.all([
        guard(getAdminRegions, 'Could not load homepage regions'),
        guard(() => getAdminClubs(), 'Could not load clubs'),
        guard(getFormats, 'Could not load competition formats'),
        guard(getSiteContent, 'Could not load website content'),
      ])
      setRegions(regionsList)
      setClubs(clubsList)
      setFeaturedSlugs(
        new Set(clubsList.filter((c) => Boolean(c.is_featured)).map((c) => c.slug)),
      )
      setFormats(formatsList)
      if (cms?.site) {
        setSiteMeta({
          ...cms.site,
          social: Array.isArray(cms.site.social)
            ? cms.site.social
            : Array.isArray((cms.site as any).socials)
              ? (cms.site as any).socials
              : [],
        })
      }
      if (cms?.about) {
        setAboutData({
          intro: Array.isArray(cms.about.intro)
            ? cms.about.intro.join('\n\n')
            : String(cms.about.intro ?? ''),
          vision: String(cms.about.vision ?? ''),
          faq: Array.isArray(cms.about.faq)
            ? cms.about.faq
            : Array.isArray((cms.about as any).faqs)
              ? (cms.about as any).faqs
              : [],
        })
      }
      setProducts(Array.isArray(cms?.products) ? cms.products : [])
      setNews(Array.isArray(cms?.news) ? cms.news : [])
    } catch {
      /* reported */
    }
  }, [guard])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  /* ---------------- 1. Flag Rail Handlers ---------------- */

  const activeRegions = regions.filter((r) => Boolean(r.is_active))
  const safePreviewIdx =
    activeRegions.length > 0 ? Math.min(previewIdx, activeRegions.length - 1) : 0
  const selectedPreviewRegion = activeRegions[safePreviewIdx] ?? null
  const previewClubs = selectedPreviewRegion
    ? clubs.filter(
        (c) =>
          c.status === 'active' &&
          isSameCountry(c.flag, selectedPreviewRegion.iso || selectedPreviewRegion.flag),
      )
    : []

  const openCreateRegion = () => {
    setEditingRegion(null)
    setRName('')
    setRIso('')
    setRFlag('')
    setRArt('')
    setRActive(true)
    setRegionDrawerOpen(true)
  }

  const openEditRegion = (r: HomepageRegion) => {
    setEditingRegion(r)
    setRName(r.name)
    setRIso(r.iso)
    setRFlag(r.flag)
    setRArt(r.art_url)
    setRActive(Boolean(r.is_active))
    setRegionDrawerOpen(true)
  }

  const handleSaveRegion = async (e: FormEvent) => {
    e.preventDefault()
    if (!rName.trim() || !rIso.trim() || !rArt.trim()) {
      report('error', 'Fill in country name, ISO code, and flag artwork. The flag emoji is optional.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        name: rName.trim(),
        iso: rIso.trim().toUpperCase(),
        flag: rFlag.trim(),
        artUrl: rArt.trim(),
        isActive: rActive,
      }
      if (editingRegion) {
        await guard(
          () => updateAdminRegion(editingRegion.id, payload),
          'Could not update region',
        )
        report('ok', `Updated ${rName.trim()} flag card.`)
      } else {
        await guard(() => createAdminRegion(payload), 'Could not add region')
        report('ok', `Added ${rName.trim()} to the Homepage Flag Rail.`)
      }
      setRegionDrawerOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleMoveRegion = async (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= regions.length) return
    const next = [...regions]
    const [moved] = next.splice(idx, 1)
    next.splice(nextIdx, 0, moved)
    setRegions(next)
    try {
      await guard(
        () => updateAdminRegionOrder(next.map((r) => r.id)),
        'Could not reorder flag rail',
      )
      report('ok', `Moved ${moved.name} ${dir < 0 ? 'left' : 'right'} in Flag Rail.`)
    } catch {
      await loadAll()
    }
  }

  const handleDeleteRegion = async (r: HomepageRegion) => {
    if (!window.confirm(`Remove ${r.name} (${r.flag}) from the Homepage Flag Rail?`)) return
    setBusy(true)
    try {
      await guard(() => deleteAdminRegion(r.id), 'Could not delete region')
      report('ok', `Removed ${r.name}.`)
      setRegionDrawerOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleQuickAssignClubFlag = async (club: Club, nextFlag: string) => {
    try {
      await guard(
        () => updateClub(club.slug, { flag: nextFlag || null }),
        `Could not assign flag to ${club.name}`,
      )
      report(
        'ok',
        nextFlag ? `${club.name} assigned to ${nextFlag}` : `Cleared flag for ${club.name}`,
      )
      await loadAll()
    } catch {
      /* reported */
    }
  }

  /* ---------------- 2. Formats & Featured Crests Handlers ---------------- */

  const openCreateFormat = () => {
    setEditingFormat(null)
    setFName('')
    setFTag('11 vs 11')
    setFDesc('')
    setFStatus('active')
    setFormatDrawerOpen(true)
  }

  const openEditFormat = (f: CompetitionFormat) => {
    setEditingFormat(f)
    setFName(f.name)
    setFTag(f.tag)
    setFDesc(f.description)
    setFStatus(f.status)
    setFormatDrawerOpen(true)
  }

  const handleSaveFormat = async (e: FormEvent) => {
    e.preventDefault()
    if (!fName.trim()) return
    setBusy(true)
    try {
      const payload = {
        name: fName.trim(),
        tag: fTag.trim(),
        description: fDesc.trim(),
        status: fStatus,
      }
      if (editingFormat) {
        await guard(() => updateFormat(editingFormat.id, payload), 'Could not update format')
        report('ok', `Updated format ${fName.trim()}.`)
      } else {
        await guard(() => createFormat(payload), 'Could not create format')
        report('ok', `Created format ${fName.trim()}.`)
      }
      setFormatDrawerOpen(false)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleSaveFeaturedCrests = async () => {
    setBusy(true)
    try {
      await guard(
        () => setFeaturedClubs([...featuredSlugs]),
        'Could not save homepage featured clubs',
      )
      report('ok', `Saved ${featuredSlugs.size} club(s) to the Homepage Crest Wall.`)
      await loadAll()
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  /* ---------------- 3. News CMS Handlers ---------------- */

  const openCreateNews = () => {
    setEditingNewsIdx(null)
    setNTitle('')
    setNSlug('')
    setNDate(new Date().toISOString().slice(0, 10))
    setNCategories('Pro Club League')
    setNTags('SEASON 1')
    setNImage('')
    setNExcerpt('')
    setNBody('')
    setNewsDrawerOpen(true)
  }

  const openEditNews = (post: CmsNewsPost, idx: number) => {
    setEditingNewsIdx(idx)
    setNTitle(post.title ?? '')
    setNSlug(post.slug ?? '')
    setNDate(post.date ? post.date.slice(0, 10) : new Date().toISOString().slice(0, 10))
    setNCategories(Array.isArray(post.categories) ? post.categories.join(', ') : '')
    setNTags(Array.isArray(post.tags) ? post.tags.join(', ') : '')
    setNImage(post.featuredLocal || post.featured || (post as any).featuredImage || '')
    setNExcerpt(post.excerpt ?? '')
    setNBody(
      typeof post.body === 'string'
        ? post.body
        : Array.isArray((post as any).content)
          ? (post as any).content.join('\n\n')
          : '',
    )
    setNewsDrawerOpen(true)
  }

  const handleSaveNews = async (e: FormEvent) => {
    e.preventDefault()
    if (!nTitle.trim()) return
    const existing = editingNewsIdx !== null ? news[editingNewsIdx] : null
    const slug = nSlug.trim() || slugifyText(nTitle) || `post-${Date.now()}`
    const bodyText = nBody.trim() || nExcerpt.trim() || nTitle.trim()
    const excerpt = nExcerpt.trim() || bodyText.slice(0, 220)
    const imgVal = nImage.trim()
    const post: CmsNewsPost = {
      id: existing?.id ?? Date.now(),
      slug,
      title: nTitle.trim(),
      date: nDate || new Date().toISOString().slice(0, 10),
      categories: nCategories
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      tags: nTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      excerpt,
      body: bodyText,
      images: existing?.images ?? [],
      featured: imgVal,
      featuredLocal: imgVal,
    }

    const nextNews = [...news]
    if (editingNewsIdx !== null) {
      nextNews[editingNewsIdx] = post
    } else {
      nextNews.unshift(post)
    }

    setBusy(true)
    try {
      const updated = await guard(
        () => updateSiteContent('news', nextNews),
        'Could not save news article',
      )
      setNews(Array.isArray(updated.news) ? updated.news : nextNews)
      setNewsDrawerOpen(false)
      report('ok', editingNewsIdx !== null ? 'Updated news article.' : 'Published new article.')
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteNews = async (idx: number) => {
    const target = news[idx]
    if (!target || !window.confirm(`Delete article "${target.title}"?`)) return
    const nextNews = news.filter((_, i) => i !== idx)
    setBusy(true)
    try {
      const updated = await guard(
        () => updateSiteContent('news', nextNews),
        'Could not delete news article',
      )
      setNews(Array.isArray(updated.news) ? updated.news : nextNews)
      setNewsDrawerOpen(false)
      report('ok', 'Deleted news article.')
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  /* ---------------- 4. Entry Passes CMS Handlers ---------------- */

  const openCreatePass = () => {
    setEditingPassIdx(null)
    setPName('')
    setPSlug('')
    setPCategory('Registration Fee')
    setPKicker('Team Registration')
    setPPrice('SGD 35')
    setPImage('/assets/sponsors/pro-club-registration.webp')
    setPSummary('')
    setPValidFor('One (1) Complete Team Entry')
    setPAccess('Full access to Tournament & League Matches')
    setPFeatures('Official Roster Submission rights, Match Schedule access, and Prize Pool Eligibility.')
    setPNote('Please allow 24 to 48 hours for our admin team to process your entry.')
    setPassDrawerOpen(true)
  }

  const openEditPass = (prod: CmsProduct, idx: number) => {
    setEditingPassIdx(idx)
    const displayName = prod.name || (prod as any).title || ''
    setPName(displayName)
    setPSlug(prod.slug || slugifyText(displayName))
    setPCategory(prod.category === 'Merchandise' ? 'Merchandise' : 'Registration Fee')
    setPKicker(prod.kicker || (prod as any).category || 'Team Registration')
    setPPrice(prod.price || 'SGD 35')
    setPImage(prod.image || '/assets/sponsors/pro-club-registration.webp')
    setPSummary(prod.summary || (prod as any).tagline || '')
    setPValidFor(prod.validFor || 'One (1) Complete Team Entry')
    setPAccess(prod.access || 'Full access to Tournament & League Matches')
    setPFeatures(
      Array.isArray(prod.features)
        ? (prod.features as string[]).join(', ')
        : String(prod.features ?? ''),
    )
    setPNote(prod.note ?? '')
    setPassDrawerOpen(true)
  }

  const handleSavePass = async (e: FormEvent) => {
    e.preventDefault()
    if (!pName.trim()) return
    const passObj: CmsProduct = {
      slug: pSlug.trim() || slugifyText(pName) || `pass-${Date.now()}`,
      name: pName.trim(),
      category: pCategory,
      kicker: pKicker.trim() || 'Team Registration',
      price: pPrice.trim() || 'SGD 35',
      image: pImage.trim() || '/assets/sponsors/pro-club-registration.webp',
      summary: pSummary.trim(),
      validFor: pValidFor.trim(),
      access: pAccess.trim(),
      features: pFeatures.trim(),
      note: pNote.trim(),
    }

    const nextProducts = [...products]
    if (editingPassIdx !== null) {
      nextProducts[editingPassIdx] = passObj
    } else {
      nextProducts.push(passObj)
    }

    setBusy(true)
    try {
      const updated = await guard(
        () => updateSiteContent('products', nextProducts),
        'Could not save entry pass',
      )
      setProducts(Array.isArray(updated.products) ? updated.products : nextProducts)
      setPassDrawerOpen(false)
      report('ok', 'Saved entry pass.')
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const handleDeletePass = async (idx: number) => {
    const target = products[idx]
    const label = target?.name || (target as any)?.title || 'this entry pass'
    if (!target || !window.confirm(`Delete entry pass "${label}"?`)) return
    const nextProducts = products.filter((_, i) => i !== idx)
    setBusy(true)
    try {
      const updated = await guard(
        () => updateSiteContent('products', nextProducts),
        'Could not delete entry pass',
      )
      setProducts(Array.isArray(updated.products) ? updated.products : nextProducts)
      setPassDrawerOpen(false)
      report('ok', 'Deleted entry pass.')
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  /* ---------------- 5. Site Meta, About & FAQ Handlers ---------------- */

  const handleSaveSiteAndAbout = async (e: FormEvent) => {
    e.preventDefault()
    if (!siteMeta || !aboutData) return
    setBusy(true)
    try {
      await guard(() => updateSiteContent('site', siteMeta), 'Could not save site settings')
      const updated = await guard(
        () => updateSiteContent('about', aboutData),
        'Could not save about & FAQ content',
      )
      if (updated?.site) setSiteMeta(updated.site)
      if (updated?.about) setAboutData(updated.about)
      report('ok', 'Saved Website Info, Registration Settings, About & FAQ!')
    } catch {
      /* reported */
    } finally {
      setBusy(false)
    }
  }

  const activeClubs = clubs.filter((c) => c.status === 'active')
  const filteredRegionClubs = activeClubs.filter((c) => {
    if (clubRegionFilter === 'unassigned' && c.flag) return false
    if (clubRegionSearch.trim()) {
      const q = clubRegionSearch.trim().toLowerCase()
      return c.name.toLowerCase().includes(q) || (c.short_code ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const regionClubsTotalPages = Math.max(
    1,
    Math.ceil(filteredRegionClubs.length / REGION_CLUBS_PAGE_SIZE),
  )
  const safeRegionClubPage = Math.min(regionClubPage, regionClubsTotalPages)
  const pagedRegionClubs = filteredRegionClubs.slice(
    (safeRegionClubPage - 1) * REGION_CLUBS_PAGE_SIZE,
    safeRegionClubPage * REGION_CLUBS_PAGE_SIZE,
  )

  const newsTotalPages = Math.max(1, Math.ceil(news.length / NEWS_PAGE_SIZE))
  const safeNewsPage = Math.min(newsPage, newsTotalPages)
  const pagedNews = news.slice((safeNewsPage - 1) * NEWS_PAGE_SIZE, safeNewsPage * NEWS_PAGE_SIZE)

  return (
    <div className="adm-stack">
      {/* Sub-navigation across all 5 Website Content areas */}
      <div className="adm-subnav-bar">
        <div className="adm-pill-tabs">
          <button
            type="button"
            className={`adm-pill-tab ${subTab === 'flags' ? 'is-active' : ''}`}
            onClick={() => setSubTab('flags')}
          >
            🏳️ Flag Rail & 1:1 Preview ({regions.length})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${subTab === 'formats' ? 'is-active' : ''}`}
            onClick={() => setSubTab('formats')}
          >
            🎮 Formats & Crest Wall
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${subTab === 'news' ? 'is-active' : ''}`}
            onClick={() => setSubTab('news')}
          >
            📰 News & Announcements ({news.length})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${subTab === 'passes' ? 'is-active' : ''}`}
            onClick={() => setSubTab('passes')}
          >
            🎟️ Entry Passes ({products.length})
          </button>
          <button
            type="button"
            className={`adm-pill-tab ${subTab === 'site' ? 'is-active' : ''}`}
            onClick={() => setSubTab('site')}
          >
            ⚙️ Site Info, About & FAQ
          </button>
        </div>
      </div>

      {/* ============================================================
          TAB 1: HOMEPAGE FLAG RAIL (1:1 LIVE PREVIEW & CLUB REGIONS)
      ============================================================ */}
      {subTab === 'flags' && (
        <div className="adm-stack">
          <section className="adm-card">
            <div className="adm-card-head">
              <div>
                <span className="adm-eyebrow">1:1 LIVE HOMEPAGE PREVIEW</span>
                <h2>Across the Region — Interactive Flag Rail</h2>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                onClick={openCreateRegion}
              >
                + Add Country Flag
              </button>
            </div>

            {activeRegions.length === 0 ? (
              <div className="adm-empty">No active countries in the Flag Rail.</div>
            ) : (
              <div className="adm-flag-rail-preview">
                <div className="adm-flag-stage">
                  {activeRegions.map((reg, idx) => {
                    const offset = idx - safePreviewIdx
                    const abs = Math.abs(offset)
                    const isSelected = idx === safePreviewIdx
                    const count = activeClubs.filter((c) => c.flag === reg.flag).length
                    return (
                      <div
                        key={reg.id}
                        className={`adm-flag-card-3d ${isSelected ? 'is-selected' : ''}`}
                        style={{
                          transform: `translateX(${offset * 155}px) scale(${isSelected ? 1 : Math.max(0.75, 1 - abs * 0.12)}) rotateY(${offset * -14}deg)`,
                          zIndex: 20 - abs,
                          opacity: abs > 3 ? 0 : isSelected ? 1 : Math.max(0.4, 0.85 - abs * 0.15),
                        }}
                        onClick={() => setPreviewIdx(idx)}
                      >
                        <div className="adm-flag-art-wrap">
                          <img src={reg.art_url} alt={reg.name} />
                        </div>
                        <div className="adm-flag-card-foot">
                          <div>
                            <span className="adm-flag-iso">{reg.iso}</span>
                            <strong>{reg.name}</strong>
                          </div>
                          <span className="adm-flag-count">{count} clubs</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {selectedPreviewRegion && (
                  <div className="adm-flag-Tray">
                    <div className="adm-flag-tray-head">
                      <strong>
                        {selectedPreviewRegion.flag} {selectedPreviewRegion.name} — Active Clubs (
                        {previewClubs.length})
                      </strong>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => openEditRegion(selectedPreviewRegion)}
                      >
                        Edit {selectedPreviewRegion.name} Card
                      </button>
                    </div>
                    {previewClubs.length === 0 ? (
                      <p className="adm-text-muted">
                        No active clubs assigned to {selectedPreviewRegion.flag} yet. Assign clubs
                        below!
                      </p>
                    ) : (
                      <div className="adm-div-clubs">
                        {previewClubs.map((c) => (
                          <span key={c.id} className="adm-club-chip">
                            {c.logo_local && <img src={c.logo_local} alt="" />}
                            {c.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="adm-table-wrap" style={{ marginTop: 16 }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Flag Card</th>
                    <th>ISO</th>
                    <th>Status</th>
                    <th>Assigned Clubs</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map((r, idx) => {
                    const count = activeClubs.filter((c) =>
                      isSameCountry(c.flag, r.iso || r.flag),
                    ).length
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="adm-row-actions">
                            <button
                              type="button"
                              className="adm-btn adm-btn-ghost adm-btn-sm"
                              disabled={idx === 0}
                              onClick={() => void handleMoveRegion(idx, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="adm-btn adm-btn-ghost adm-btn-sm"
                              disabled={idx === regions.length - 1}
                              onClick={() => void handleMoveRegion(idx, 1)}
                            >
                              ↓
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className="adm-row-title">
                            <img
                              src={r.art_url}
                              alt={r.name}
                              style={{
                                width: 44,
                                height: 28,
                                objectFit: 'cover',
                                borderRadius: 4,
                              }}
                            />
                            <span>{ISO_TO_FLAG[r.iso.toUpperCase()] || r.flag}</span>
                            <strong>{r.name}</strong>
                          </div>
                        </td>
                        <td>
                          <span className="adm-code-pill">{r.iso}</span>
                        </td>
                        <td>
                          <span
                            className={`adm-status-badge ${Boolean(r.is_active) ? 'status-active' : 'status-withdrawn'}`}
                          >
                            {Boolean(r.is_active) ? 'Visible' : 'Hidden'}
                          </span>
                        </td>
                        <td>{count} clubs</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="adm-btn adm-btn-secondary adm-btn-sm"
                            onClick={() => openEditRegion(r)}
                          >
                            Edit Flag →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-head">
              <div>
                <span className="adm-eyebrow">CLUB TO COUNTRY MAPPING</span>
                <h2>Assign Clubs to Country Flags</h2>
              </div>
              <div className="adm-pill-tabs">
                <button
                  type="button"
                  className={`adm-pill-tab ${clubRegionFilter === 'unassigned' ? 'is-active' : ''}`}
                  onClick={() => {
                    setClubRegionFilter('unassigned')
                    setRegionClubPage(1)
                  }}
                >
                  Unassigned Clubs ({activeClubs.filter((c) => !c.flag).length})
                </button>
                <button
                  type="button"
                  className={`adm-pill-tab ${clubRegionFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => {
                    setClubRegionFilter('all')
                    setRegionClubPage(1)
                  }}
                >
                  All Active Clubs ({activeClubs.length})
                </button>
              </div>
            </div>

            <div className="adm-toolbar">
              <input
                type="search"
                value={clubRegionSearch}
                onChange={(e) => {
                  setClubRegionSearch(e.target.value)
                  setRegionClubPage(1)
                }}
                placeholder="Search club to assign country flag…"
                className="adm-input adm-search-input"
              />
            </div>

            {filteredRegionClubs.length === 0 ? (
              <div className="adm-empty">All active clubs have a country flag assigned!</div>
            ) : (
              <>
                <div className="adm-list">
                  {pagedRegionClubs.map((club) => (
                    <div key={club.id} className="adm-list-row">
                      <div className="adm-list-main">
                        <div className="adm-row-title">
                          {club.logo_local && (
                            <img src={club.logo_local} alt="" className="adm-crest-xs" />
                          )}
                          <strong>{club.name}</strong>
                          {club.short_code && (
                            <span className="adm-code-pill">{club.short_code}</span>
                          )}
                        </div>
                      </div>
                      <div className="adm-row-actions">
                        {regions.map((r) => {
                          const assigned = isSameCountry(club.flag, r.iso || r.flag)
                          const targetFlag = ISO_TO_FLAG[r.iso.toUpperCase()] || r.flag || r.iso
                          return (
                            <button
                              key={r.id}
                              type="button"
                              className={`adm-btn adm-btn-sm ${assigned ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
                              onClick={() =>
                                void handleQuickAssignClubFlag(club, assigned ? '' : targetFlag)
                              }
                              title={
                                assigned
                                  ? `Currently assigned to ${r.name}. Click to clear.`
                                  : `Assign to ${r.name}`
                              }
                            >
                              {r.name} ({r.iso})
                            </button>
                          )
                        })}
                        {club.flag && (
                          <button
                            type="button"
                            className="adm-btn adm-btn-ghost adm-btn-sm"
                            onClick={() => void handleQuickAssignClubFlag(club, '')}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {filteredRegionClubs.length > REGION_CLUBS_PAGE_SIZE && (
                  <div className="adm-pagination">
                    <span>
                      Showing {(safeRegionClubPage - 1) * REGION_CLUBS_PAGE_SIZE + 1}–
                      {Math.min(
                        safeRegionClubPage * REGION_CLUBS_PAGE_SIZE,
                        filteredRegionClubs.length,
                      )}{' '}
                      of {filteredRegionClubs.length} clubs (Page {safeRegionClubPage} of{' '}
                      {regionClubsTotalPages})
                    </span>
                    <div className="adm-row-actions">
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        disabled={safeRegionClubPage <= 1}
                        onClick={() => setRegionClubPage((p) => Math.max(1, p - 1))}
                      >
                        ← Previous
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        disabled={safeRegionClubPage >= regionClubsTotalPages}
                        onClick={() =>
                          setRegionClubPage((p) => Math.min(regionClubsTotalPages, p + 1))
                        }
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* ============================================================
          TAB 2: COMPETITION FORMATS & HOMEPAGE FEATURED CREST WALL
      ============================================================ */}
      {subTab === 'formats' && (
        <div className="adm-stack">
          <section className="adm-card">
            <div className="adm-card-head">
              <div>
                <span className="adm-eyebrow">WAYS TO COMPETE</span>
                <h2>Homepage Competition Formats ({formats.length})</h2>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                onClick={openCreateFormat}
              >
                + Add Format Card
              </button>
            </div>

            <div className="adm-div-grid">
              {formats.map((f) => (
                <div key={f.id} className="adm-div-card">
                  <div className="adm-div-head">
                    <div className="adm-row-title">
                      <h3>{f.name}</h3>
                      <span className="adm-code-pill">{f.tag}</span>
                      <span
                        className={`adm-status-badge status-${f.status === 'active' ? 'active' : 'pending'}`}
                      >
                        {f.status}
                      </span>
                    </div>
                    <div className="adm-row-actions">
                      <select
                        value={f.status}
                        onChange={async (e) => {
                          const next = e.target.value as FormatStatus
                          await guard(
                            () => setFormatStatus(f.id, next),
                            'Could not update format status',
                          )
                          report('ok', `Updated ${f.name} status to ${next}.`)
                          await loadAll()
                        }}
                        className="adm-select adm-select-sm"
                      >
                        <option value="active">Active</option>
                        <option value="coming_soon">Coming Soon</option>
                        <option value="inactive">Hidden</option>
                      </select>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => openEditFormat(f)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn-danger adm-btn-sm"
                        onClick={async () => {
                          if (!window.confirm(`Delete format "${f.name}"?`)) return
                          await guard(() => deleteFormat(f.id), 'Could not delete format')
                          report('ok', `Deleted ${f.name}.`)
                          await loadAll()
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="adm-text-muted">{f.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-head">
              <div>
                <span className="adm-eyebrow">HOMEPAGE MARQUEE</span>
                <h2>Featured Club Crest Wall ({featuredSlugs.size} selected)</h2>
              </div>
              <div className="adm-row-actions">
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost adm-btn-sm"
                  onClick={() => setFeaturedSlugs(new Set(activeClubs.map((c) => c.slug)))}
                >
                  Select All Active
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost adm-btn-sm"
                  onClick={() => setFeaturedSlugs(new Set())}
                >
                  Clear All
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn-primary"
                  disabled={busy}
                  onClick={() => void handleSaveFeaturedCrests()}
                >
                  {busy ? 'Saving…' : 'Save Featured Crest Wall'}
                </button>
              </div>
            </div>

            <div className="adm-crest-wall-grid">
              {activeClubs.map((c) => {
                const isSelected = featuredSlugs.has(c.slug)
                const logo = c.logo_local || c.logo_url
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`adm-crest-tile ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setFeaturedSlugs((prev) => {
                        const next = new Set(prev)
                        if (next.has(c.slug)) next.delete(c.slug)
                        else next.add(c.slug)
                        return next
                      })
                    }}
                  >
                    {logo ? (
                      <img src={logo} alt={c.name} />
                    ) : (
                      <div className="adm-crest-placeholder">
                        {(c.short_code || c.name).slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span>{c.name}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {/* ============================================================
          TAB 3: NEWS & ANNOUNCEMENTS CMS
      ============================================================ */}
      {subTab === 'news' && (
        <section className="adm-card">
          <div className="adm-card-head">
            <div>
              <span className="adm-eyebrow">PUBLIC NEWSROOM (/NEWS)</span>
              <h2>News & Announcements ({news.length})</h2>
            </div>
            <button type="button" className="adm-btn adm-btn-primary" onClick={openCreateNews}>
              + Write News Article
            </button>
          </div>

          {news.length === 0 ? (
            <div className="adm-empty">No news articles published yet.</div>
          ) : (
            <>
              <div className="adm-list">
                {pagedNews.map((post, idxOnPage) => {
                  const idx = (safeNewsPage - 1) * NEWS_PAGE_SIZE + idxOnPage
                  const cover = post.featuredLocal || post.featured || (post as any).featuredImage
                  const cats = Array.isArray(post.categories) ? post.categories : []
                  return (
                    <div key={post.slug || idx} className="adm-list-row">
                      {cover && (
                        <img
                          src={cover}
                          alt=""
                          style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 6 }}
                        />
                      )}
                      <div className="adm-list-main">
                        <div className="adm-row-title">
                          <strong>{post.title}</strong>
                          {cats.map((cat) => (
                            <span key={cat} className="adm-code-pill">
                              {cat}
                            </span>
                          ))}
                        </div>
                        <p className="adm-row-sub">
                          {post.date} · {post.excerpt}
                        </p>
                      </div>
                      <div className="adm-row-actions">
                        <button
                          type="button"
                          className="adm-btn adm-btn-secondary adm-btn-sm"
                          onClick={() => openEditNews(post, idx)}
                        >
                          Edit Article →
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {news.length > NEWS_PAGE_SIZE && (
                <div className="adm-pagination">
                  <span>
                    Showing {(safeNewsPage - 1) * NEWS_PAGE_SIZE + 1}–
                    {Math.min(safeNewsPage * NEWS_PAGE_SIZE, news.length)} of {news.length}{' '}
                    articles (Page {safeNewsPage} of {newsTotalPages})
                  </span>
                  <div className="adm-row-actions">
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      disabled={safeNewsPage <= 1}
                      onClick={() => setNewsPage((p) => Math.max(1, p - 1))}
                    >
                      ← Previous
                    </button>
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      disabled={safeNewsPage >= newsTotalPages}
                      onClick={() => setNewsPage((p) => Math.min(newsTotalPages, p + 1))}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ============================================================
          TAB 4: ENTRY PASSES & STORE (/ENTRIES)
      ============================================================ */}
      {subTab === 'passes' && (
        <section className="adm-card">
          <div className="adm-card-head">
            <div>
              <span className="adm-eyebrow">LEAGUE STORE (/ENTRIES)</span>
              <h2>Entry Passes & Products ({products.length})</h2>
            </div>
            <button type="button" className="adm-btn adm-btn-primary" onClick={openCreatePass}>
              + Add Entry Pass
            </button>
          </div>

          <div className="adm-div-grid">
            {products.map((prod, idx) => {
              const displayName = prod.name || (prod as any).title || 'Entry Pass'
              const displayKicker = prod.kicker || (prod as any).category || 'Entry'
              const displaySummary = prod.summary || (prod as any).tagline || ''
              const featText = Array.isArray(prod.features)
                ? (prod.features as string[]).join(' · ')
                : String(prod.features ?? '')
              return (
                <div key={prod.slug || idx} className="adm-div-card">
                  <div className="adm-div-head">
                    <div className="adm-row-title">
                      {prod.image && <img src={prod.image} alt="" className="adm-crest-sm" />}
                      <div>
                        <span className="adm-eyebrow">{displayKicker}</span>
                        <h3>{displayName}</h3>
                      </div>
                      <span className="adm-code-pill">{prod.price}</span>
                    </div>
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={() => openEditPass(prod, idx)}
                    >
                      Edit Pass →
                    </button>
                  </div>
                  <p className="adm-text-muted">{displaySummary}</p>
                  {featText && (
                    <p className="adm-row-sub" style={{ marginTop: 8 }}>
                      <strong>Includes:</strong> {featText}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ============================================================
          TAB 5: SITE INFO, REGISTRATION SETTINGS, ABOUT & FAQ
      ============================================================ */}
      {subTab === 'site' && siteMeta && aboutData && (
        <form onSubmit={handleSaveSiteAndAbout} className="adm-stack">
          <section className="adm-card">
            <div className="adm-card-head">
              <div>
                <span className="adm-eyebrow">GLOBAL WEBSITE SETTINGS</span>
                <h2>League Identity, Registration & Contact Info</h2>
              </div>
              <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save All Website Settings'}
              </button>
            </div>

            <div className="adm-field-grid">
              <label className="adm-field">
                <span>Full League Name</span>
                <input
                  type="text"
                  value={siteMeta.name ?? ''}
                  onChange={(e) => setSiteMeta({ ...siteMeta, name: e.target.value })}
                  className="adm-input"
                />
              </label>
              <label className="adm-field">
                <span>Short Name</span>
                <input
                  type="text"
                  value={siteMeta.shortName ?? ''}
                  onChange={(e) => setSiteMeta({ ...siteMeta, shortName: e.target.value })}
                  className="adm-input"
                />
              </label>
              <label className="adm-field">
                <span>Season Label</span>
                <input
                  type="text"
                  value={siteMeta.season ?? ''}
                  onChange={(e) => setSiteMeta({ ...siteMeta, season: e.target.value })}
                  className="adm-input"
                />
              </label>
              <label className="adm-field">
                <span>Registration Fee Label (e.g. SGD 35)</span>
                <input
                  type="text"
                  value={siteMeta.registrationFee ?? ''}
                  onChange={(e) => setSiteMeta({ ...siteMeta, registrationFee: e.target.value })}
                  className="adm-input"
                />
              </label>
              <label className="adm-field">
                <span>Team Cap</span>
                <input
                  type="number"
                  value={siteMeta.teamCap ?? 36}
                  onChange={(e) =>
                    setSiteMeta({ ...siteMeta, teamCap: Number(e.target.value) || 0 })
                  }
                  className="adm-input"
                />
              </label>
              <label className="adm-field">
                <span>Teams Registered Count</span>
                <input
                  type="number"
                  value={siteMeta.teamsRegistered ?? 18}
                  onChange={(e) =>
                    setSiteMeta({ ...siteMeta, teamsRegistered: Number(e.target.value) || 0 })
                  }
                  className="adm-input"
                />
              </label>
              <label className="adm-field">
                <span>Official Contact Email</span>
                <input
                  type="email"
                  value={siteMeta.email ?? ''}
                  onChange={(e) => setSiteMeta({ ...siteMeta, email: e.target.value })}
                  className="adm-input"
                />
              </label>
              <label className="adm-field">
                <span>Base Location</span>
                <input
                  type="text"
                  value={siteMeta.base ?? ''}
                  onChange={(e) => setSiteMeta({ ...siteMeta, base: e.target.value })}
                  className="adm-input"
                />
              </label>
              <label className="adm-field" style={{ gridColumn: '1 / -1' }}>
                <span>League Tagline</span>
                <input
                  type="text"
                  value={siteMeta.tagline ?? ''}
                  onChange={(e) => setSiteMeta({ ...siteMeta, tagline: e.target.value })}
                  className="adm-input"
                />
              </label>
              <label className="adm-field" style={{ gridColumn: '1 / -1' }}>
                <span>Site Description</span>
                <textarea
                  rows={2}
                  value={siteMeta.description ?? ''}
                  onChange={(e) => setSiteMeta({ ...siteMeta, description: e.target.value })}
                  className="adm-textarea"
                />
              </label>
              <label className="adm-field" style={{ gridColumn: '1 / -1' }}>
                <span>Footer / Legal Disclaimer</span>
                <textarea
                  rows={2}
                  value={siteMeta.disclaimer ?? ''}
                  onChange={(e) => setSiteMeta({ ...siteMeta, disclaimer: e.target.value })}
                  className="adm-textarea"
                />
              </label>
            </div>
          </section>

          {/* Social Links */}
          <section className="adm-card">
            <div className="adm-card-head">
              <div>
                <span className="adm-eyebrow">FOOTER & CONTACT SOCIALS</span>
                <h2>Social Media Links</h2>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                onClick={() =>
                  setSiteMeta({
                    ...siteMeta,
                    social: [
                      ...(Array.isArray(siteMeta.social) ? siteMeta.social : []),
                      { label: 'New Platform', href: 'https://' },
                    ],
                  })
                }
              >
                + Add Social Link
              </button>
            </div>
            <div className="adm-form-stack">
              {(Array.isArray(siteMeta.social) ? siteMeta.social : []).map((soc, idx) => (
                <div key={idx} className="adm-inline-form">
                  <input
                    type="text"
                    value={soc.label}
                    placeholder="Platform (e.g. Discord)"
                    onChange={(e) => {
                      const next = [...siteMeta.social]
                      next[idx] = { ...soc, label: e.target.value }
                      setSiteMeta({ ...siteMeta, social: next })
                    }}
                    className="adm-input"
                    style={{ maxWidth: 200 }}
                  />
                  <input
                    type="text"
                    value={soc.href}
                    placeholder="https://..."
                    onChange={(e) => {
                      const next = [...siteMeta.social]
                      next[idx] = { ...soc, href: e.target.value }
                      setSiteMeta({ ...siteMeta, social: next })
                    }}
                    className="adm-input"
                  />
                  <button
                    type="button"
                    className="adm-btn adm-btn-danger adm-btn-sm"
                    onClick={() =>
                      setSiteMeta({
                        ...siteMeta,
                        social: siteMeta.social.filter((_, i) => i !== idx),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* About Page Intro, Vision & FAQs */}
          <section className="adm-card">
            <div className="adm-card-head">
              <div>
                <span className="adm-eyebrow">ABOUT PAGE (/ABOUT)</span>
                <h2>About Story, Vision & Frequently Asked Questions</h2>
              </div>
              <button
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                onClick={() =>
                  setAboutData({
                    ...aboutData,
                    faq: [
                      ...(Array.isArray(aboutData.faq) ? aboutData.faq : []),
                      { q: 'New question?', a: 'Answer here.' },
                    ],
                  })
                }
              >
                + Add FAQ Item
              </button>
            </div>

            <div className="adm-form-stack">
              <label className="adm-field">
                <span>About Page Intro Story</span>
                <textarea
                  rows={4}
                  value={aboutData.intro ?? ''}
                  onChange={(e) => setAboutData({ ...aboutData, intro: e.target.value })}
                  className="adm-textarea"
                />
              </label>

              <label className="adm-field">
                <span>Our Vision Quote</span>
                <input
                  type="text"
                  value={aboutData.vision ?? ''}
                  onChange={(e) => setAboutData({ ...aboutData, vision: e.target.value })}
                  className="adm-input"
                />
              </label>

              <h4>FAQ Questions & Answers ({(Array.isArray(aboutData.faq) ? aboutData.faq : []).length})</h4>
              {(Array.isArray(aboutData.faq) ? aboutData.faq : []).map((item, idx) => (
                <div key={idx} className="adm-subcard">
                  <div className="adm-inline-form" style={{ marginBottom: 8 }}>
                    <input
                      type="text"
                      value={item.q}
                      placeholder="Question"
                      onChange={(e) => {
                        const next = [...aboutData.faq]
                        next[idx] = { ...item, q: e.target.value }
                        setAboutData({ ...aboutData, faq: next })
                      }}
                      className="adm-input"
                    />
                    <button
                      type="button"
                      className="adm-btn adm-btn-danger adm-btn-sm"
                      onClick={() =>
                        setAboutData({
                          ...aboutData,
                          faq: aboutData.faq.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={item.a}
                    placeholder="Answer"
                    onChange={(e) => {
                      const next = [...aboutData.faq]
                      next[idx] = { ...item, a: e.target.value }
                      setAboutData({ ...aboutData, faq: next })
                    }}
                    className="adm-textarea"
                  />
                </div>
              ))}

              <div className="adm-row-actions">
                <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save All Website Settings'}
                </button>
              </div>
            </div>
          </section>
        </form>
      )}

      {/* ============================================================
          DRAWERS FOR REGION, FORMAT, NEWS & ENTRY PASSES
      ============================================================ */}

      {/* Region Flag Drawer */}
      {regionDrawerOpen && (
        <div className="adm-drawer-backdrop" onClick={() => setRegionDrawerOpen(false)}>
          <aside className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <div>
                <span className="adm-eyebrow">HOMEPAGE FLAG RAIL</span>
                <h3>{editingRegion ? `Edit ${editingRegion.name}` : 'Add Country Flag'}</h3>
              </div>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setRegionDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="adm-drawer-body">
              <form onSubmit={handleSaveRegion} className="adm-form-stack">
                <div className="adm-logo-uploader">
                  <div className="adm-logo-preview-box" style={{ width: 96, height: 64 }}>
                    {rArt ? <img src={rArt} alt="Flag preview" /> : <span>No Flag Art</span>}
                  </div>
                  <div>
                    <strong>Flag Artwork</strong>
                    <p>Upload a flag image or paste an image URL below.</p>
                    <input
                      ref={regionArtRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        try {
                          const dataUrl = await compressImageFile(file, 960, 640)
                          setRArt(dataUrl)
                        } catch (err) {
                          report('error', err instanceof Error ? err.message : 'Invalid image')
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={() => regionArtRef.current?.click()}
                    >
                      Upload Flag Image
                    </button>
                  </div>
                </div>

                <label className="adm-field">
                  <span>Country Name *</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Malaysia"
                    value={rName}
                    onChange={(e) => setRName(e.target.value)}
                    className="adm-input"
                  />
                </label>
                <div className="adm-field-grid">
                  <label className="adm-field">
                    <span>ISO Code *</span>
                    <input
                      type="text"
                      required
                      maxLength={8}
                      placeholder="e.g. MY"
                      value={rIso}
                      onChange={(e) => setRIso(e.target.value.toUpperCase())}
                      className="adm-input"
                    />
                  </label>
                  <label className="adm-field">
                    <span>Flag Emoji (optional)</span>
                    <input
                      type="text"
                      placeholder="e.g. 🇲🇾 — leave empty to show no flag"
                      value={rFlag}
                      onChange={(e) => setRFlag(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                </div>
                <label className="adm-field">
                  <span>Artwork URL / Data URI *</span>
                  <input
                    type="text"
                    required
                    value={rArt}
                    onChange={(e) => setRArt(e.target.value)}
                    placeholder="/assets/flags/my.png or https://..."
                    className="adm-input"
                  />
                </label>
                <label className="adm-check-row">
                  <input
                    type="checkbox"
                    checked={rActive}
                    onChange={(e) => setRActive(e.target.checked)}
                  />
                  <span>Show this country on the public Homepage Flag Rail</span>
                </label>

                <div className="adm-row-actions">
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : 'Save Country Flag'}
                  </button>
                  {editingRegion && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-danger"
                      disabled={busy}
                      onClick={() => void handleDeleteRegion(editingRegion)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </form>
            </div>
          </aside>
        </div>
      )}

      {/* Format Drawer */}
      {formatDrawerOpen && (
        <div className="adm-drawer-backdrop" onClick={() => setFormatDrawerOpen(false)}>
          <aside className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <div>
                <span className="adm-eyebrow">COMPETITION FORMAT</span>
                <h3>{editingFormat ? `Edit ${editingFormat.name}` : 'Add Format Card'}</h3>
              </div>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setFormatDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="adm-drawer-body">
              <form onSubmit={handleSaveFormat} className="adm-form-stack">
                <label className="adm-field">
                  <span>Format Title *</span>
                  <input
                    type="text"
                    required
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="e.g. Pro Club League"
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Badge Tag</span>
                  <input
                    type="text"
                    value={fTag}
                    onChange={(e) => setFTag(e.target.value)}
                    placeholder="e.g. 11 vs 11"
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Status</span>
                  <select
                    value={fStatus}
                    onChange={(e) => setFStatus(e.target.value as FormatStatus)}
                    className="adm-select"
                  >
                    <option value="active">Active</option>
                    <option value="coming_soon">Coming Soon</option>
                    <option value="inactive">Hidden</option>
                  </select>
                </label>
                <label className="adm-field">
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={fDesc}
                    onChange={(e) => setFDesc(e.target.value)}
                    className="adm-textarea"
                  />
                </label>
                <div className="adm-row-actions">
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                    Save Format
                  </button>
                </div>
              </form>
            </div>
          </aside>
        </div>
      )}

      {/* News Article Drawer */}
      {newsDrawerOpen && (
        <div className="adm-drawer-backdrop" onClick={() => setNewsDrawerOpen(false)}>
          <aside className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <div>
                <span className="adm-eyebrow">NEWS ARTICLE</span>
                <h3>{editingNewsIdx !== null ? 'Edit News Article' : 'Publish News Article'}</h3>
              </div>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setNewsDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="adm-drawer-body">
              <form onSubmit={handleSaveNews} className="adm-form-stack">
                <div className="adm-logo-uploader">
                  <div className="adm-logo-preview-box" style={{ width: 96, height: 64 }}>
                    {nImage ? <img src={nImage} alt="Cover" /> : <span>No Cover</span>}
                  </div>
                  <div>
                    <strong>Featured Cover Image</strong>
                    <p>Upload a banner image or paste an image URL below.</p>
                    <input
                      ref={newsImgRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        try {
                          const dataUrl = await compressImageFile(file, 960, 540)
                          setNImage(dataUrl)
                        } catch (err) {
                          report('error', err instanceof Error ? err.message : 'Invalid image')
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={() => newsImgRef.current?.click()}
                    >
                      Upload Cover Image
                    </button>
                  </div>
                </div>

                <label className="adm-field">
                  <span>Headline / Title *</span>
                  <input
                    type="text"
                    required
                    value={nTitle}
                    onChange={(e) => {
                      setNTitle(e.target.value)
                      if (editingNewsIdx === null) {
                        setNSlug(slugifyText(e.target.value))
                      }
                    }}
                    className="adm-input"
                  />
                </label>
                <div className="adm-field-grid">
                  <label className="adm-field">
                    <span>URL Slug</span>
                    <input
                      type="text"
                      value={nSlug}
                      onChange={(e) => setNSlug(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                  <label className="adm-field">
                    <span>Publish Date</span>
                    <input
                      type="date"
                      value={nDate}
                      onChange={(e) => setNDate(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                  <label className="adm-field">
                    <span>Categories (comma-separated)</span>
                    <input
                      type="text"
                      value={nCategories}
                      onChange={(e) => setNCategories(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                  <label className="adm-field">
                    <span>Tags (comma-separated)</span>
                    <input
                      type="text"
                      value={nTags}
                      onChange={(e) => setNTags(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                </div>
                <label className="adm-field">
                  <span>Cover Image URL (or uploaded data URI)</span>
                  <input
                    type="text"
                    value={nImage}
                    onChange={(e) => setNImage(e.target.value)}
                    className="adm-input"
                  />
                </label>
                <label className="adm-field">
                  <span>Short Excerpt / Summary</span>
                  <textarea
                    rows={2}
                    value={nExcerpt}
                    onChange={(e) => setNExcerpt(e.target.value)}
                    className="adm-textarea"
                  />
                </label>
                <label className="adm-field">
                  <span>Article Body</span>
                  <textarea
                    rows={8}
                    required
                    value={nBody}
                    onChange={(e) => setNBody(e.target.value)}
                    className="adm-textarea"
                  />
                </label>
                <div className="adm-row-actions">
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : 'Save Article'}
                  </button>
                  {editingNewsIdx !== null && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-danger"
                      disabled={busy}
                      onClick={() => void handleDeleteNews(editingNewsIdx)}
                    >
                      Delete Article
                    </button>
                  )}
                </div>
              </form>
            </div>
          </aside>
        </div>
      )}

      {/* Entry Pass Drawer */}
      {passDrawerOpen && (
        <div className="adm-drawer-backdrop" onClick={() => setPassDrawerOpen(false)}>
          <aside className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <div>
                <span className="adm-eyebrow">ENTRY PASS (/ENTRIES)</span>
                <h3>{editingPassIdx !== null ? 'Edit Entry Pass' : 'Add Entry Pass'}</h3>
              </div>
              <button
                type="button"
                className="adm-close-btn"
                onClick={() => setPassDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="adm-drawer-body">
              <form onSubmit={handleSavePass} className="adm-form-stack">
                <div className="adm-logo-uploader">
                  <div className="adm-logo-preview-box">
                    {pImage ? <img src={pImage} alt="Pass" /> : <span>No Image</span>}
                  </div>
                  <div>
                    <strong>Pass Artwork</strong>
                    <p>Upload pass image or paste an image URL below.</p>
                    <input
                      ref={passImgRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        try {
                          const dataUrl = await compressImageFile(file, 512, 512)
                          setPImage(dataUrl)
                        } catch (err) {
                          report('error', err instanceof Error ? err.message : 'Invalid image')
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={() => passImgRef.current?.click()}
                    >
                      Upload Image
                    </button>
                  </div>
                </div>

                <label className="adm-field">
                  <span>Pass Name *</span>
                  <input
                    type="text"
                    required
                    value={pName}
                    onChange={(e) => {
                      setPName(e.target.value)
                      if (editingPassIdx === null) {
                        setPSlug(slugifyText(e.target.value))
                      }
                    }}
                    className="adm-input"
                  />
                </label>
                <div className="adm-field-grid">
                  <label className="adm-field">
                    <span>Shop Section *</span>
                    <select
                      value={pCategory}
                      onChange={(e) => setPCategory(e.target.value)}
                      className="adm-select"
                    >
                      <option value="Registration Fee">Registration Fee</option>
                      <option value="Merchandise">Merchandise</option>
                    </select>
                  </label>
                  <label className="adm-field">
                    <span>Price Label (e.g. SGD 35) *</span>
                    <input
                      type="text"
                      required
                      value={pPrice}
                      onChange={(e) => setPPrice(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                  <label className="adm-field">
                    <span>Badge Kicker (e.g. Team Registration)</span>
                    <input
                      type="text"
                      value={pKicker}
                      onChange={(e) => setPKicker(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                  <label className="adm-field">
                    <span>Valid For</span>
                    <input
                      type="text"
                      value={pValidFor}
                      onChange={(e) => setPValidFor(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                  <label className="adm-field">
                    <span>Access</span>
                    <input
                      type="text"
                      value={pAccess}
                      onChange={(e) => setPAccess(e.target.value)}
                      className="adm-input"
                    />
                  </label>
                </div>
                <label className="adm-field">
                  <span>Summary Description</span>
                  <textarea
                    rows={2}
                    value={pSummary}
                    onChange={(e) => setPSummary(e.target.value)}
                    className="adm-textarea"
                  />
                </label>
                <label className="adm-field">
                  <span>Included Features</span>
                  <textarea
                    rows={2}
                    value={pFeatures}
                    onChange={(e) => setPFeatures(e.target.value)}
                    className="adm-textarea"
                  />
                </label>
                <label className="adm-field">
                  <span>Confirmation / Processing Note</span>
                  <textarea
                    rows={3}
                    value={pNote}
                    onChange={(e) => setPNote(e.target.value)}
                    className="adm-textarea"
                  />
                </label>

                <div className="adm-row-actions">
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : 'Save Entry Pass'}
                  </button>
                  {editingPassIdx !== null && (
                    <button
                      type="button"
                      className="adm-btn adm-btn-danger"
                      disabled={busy}
                      onClick={() => void handleDeletePass(editingPassIdx)}
                    >
                      Delete Pass
                    </button>
                  )}
                </div>
              </form>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
