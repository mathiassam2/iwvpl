# IWVPL v2 — Website Extraction, Redesign & Local Deployment

A full extraction and rebuild of **iwvpl.asia** (Island-Wide Virtual Premier League) into a
modern, dual-theme React application.

```
Local preview:  http://localhost:3000
Network:        http://192.168.1.115:3000
```

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000  (Vite dev server)
npm run build      # typecheck + production bundle -> dist/
npm run preview    # serve the production build
npm run typecheck  # tsc only
```

---

## Stack

| Concern    | Choice                                          |
| ---------- | ----------------------------------------------- |
| Framework  | React 18 + TypeScript (strict)                   |
| Build      | Vite 6 (ES2020, route-level code splitting)      |
| Styling    | Tailwind CSS v4, CSS-first `@theme` tokens       |
| Theming    | Token-driven dark/light, resolved pre-paint      |
| Routing    | React Router v6 (lazy-loaded routes)             |
| Fonts      | Self-hosted Inter / Sora / Oswald (no CDN)        |

---

## Theming

Both modes are driven by one set of semantic CSS custom properties defined twice —
once under `.dark`, once under `.light`.

`dark:` is bound to the **class**, not the OS
(`@custom-variant dark (&:where(.dark, .dark *))`), so the in-app toggle fully
controls the theme — a light-OS user who picks dark mode gets a fully dark page.

```css
--bg  --bg-deep  --bg-raised  --surface  --surface-2  --surface-hover
--text  --text-strong  --text-muted  --text-faint
--border  --border-strong  --glass-bg  --on-volt  --accent-tint  --accent-ring
--shadow-card  --shadow-lift  --plate  --grid-line
```

Components never branch on the mode — they reference `var(--…)` — so there is no
`dark:` duplication and both themes stay in sync.

- **No flash of the wrong theme:** an inline script in `index.html` reads
  `localStorage` (falling back to `prefers-color-scheme`) and sets the class before
  first paint. `src/lib/theme.ts` handles subsequent toggles and subscribers.
- The toggle sits in the header next to Register and animates between sun/moon.

### Accent tokens

The lime is theme-dependent because one value cannot serve both:

| Token | Dark | Light | Used for |
| --- | --- | --- | --- |
| `--accent-text` | `#c8ff3d` | `#4f7005` | text on the page background |
| `--accent-solid` | `#c8ff3d` | `#c8ff3d` | button fills (brand pop kept) |
| `--on-volt` | `#07080a` | `#0d1206` | label on a solid fill |
| `--accent-on-fill` | `#c8ff3d` | `#a8d419` | small pills carrying dark text |
| `--badge-up/down/gold-*` | tinted pairs | tinted pairs | position + rank badges |

Measured across **979 text nodes on 12 routes**: **0 WCAG AA failures** in either
theme (lowest ratio 4.55 dark / 4.77 light).

---

## Project structure

```
src/
├─ components/
│  ├─ ui/index.tsx           design-system primitives (Button, Card, Tabs, Accordion,
│  │                         SmartImage, Reveal, Badge, Section, **Select**, …)
│  ├─ ui/ThemeToggle.tsx     sun/moon toggle
│  ├─ layout/                AppShell, Header (glass + mega-menu), Footer, PageHeader
│  ├─ league/index.tsx       StandingsTable, MatchRow, ClubCard, LeaderboardTable,
│  │                         FormGuide, StatTile
│  ├─ league/LeaderboardPodium.tsx   top-3 showcase
│  └─ home/index.tsx         Hero, Formats, StandingsPreview, ResultsPreview,
│                            AboutStrip, NewsSection, NewsThumb, Sponsors, JoinCta
├─ pages/                    13 route components + NotFound
├─ hooks/useParallax.ts      scroll-linked parallax driver
├─ data/                     site_data.json + slug resolution
├─ lib/                      format.ts, theme.ts
├─ types/site.ts             domain types
└─ styles/index.css          @theme, dual-mode tokens, base, utilities, keyframes

public/assets/               130 extracted assets, 4.5 MB
_crawl/                      extraction pipeline (Python)
_source/assets-originals/    pristine pre-optimisation copies
```

---

## Routes

| Route | Notes |
| --- | --- |
| `/` | Hero imagery, formats, standings preview, latest results, **top-10** leaderboard, news, sponsors, CTA |
| `/standings` | Sortable table, 9 columns, `aria-sort`, promotion/relegation zones |
| `/results` | Grouped by matchday, club filter, derived W/D/goals tiles |
| `/schedule` | Fixtures, upcoming/all toggle |
| `/clubs` | Search + status tabs, custom dropdown |
| `/transfer` | 210 logged moves, scope tabs + club filter + player search |
| `/leaderboard` | Tabbed, top-3 podium + chasing pack |
| `/news`, `/news/:slug` | Article index and detail |
| `/about`, `/contact`, `/register`, `/login` | Content, validated forms |
| `*` | 404 |

---

## Extraction (Phase 1)

The source is WordPress 7.1.3 (Elementor + WooCommerce + SportsPress Pro + Ultimate
Member + Slider Revolution + RT Elements). Assets were harvested from three places,
because no single one is complete:

1. **WP REST media library** — 98 attachments.
2. **Sitemap** — 1,280 URLs, used to enumerate every content type.
3. **Rendered HTML** — SportsPress league data uses custom markup (`iwvpl-*`,
   `pl-*`, `custom-match-row`, `club-name-cell`) and is not REST-exposed.

| Bucket | Files | Size | Contents |
| --- | ---: | ---: | --- |
| `clubs/` | 44 | 2.1 MB | 36 crests, transparency-cleaned |
| `players/` | 58 | 499 KB | player avatars |
| `brand/` | 12 | 559 KB | logo, mark, banners, hero, SVG placeholders |
| `news/` | 5 | 750 KB | article artwork |
| `sponsors/` | 4 | 421 KB | registration posters |
| `fonts/` | 7 | 208 KB | self-hosted variable woff2 |
| **Total** | **130** | **4.5 MB** | |

Optimisations: 70 WordPress thumbnails dropped, WebP conversion, crest backgrounds
removed via corner-seeded flood fill (**13.2 MB → 2.2 MB**). `ACOUSTICSSS FC` has no
logo on the source site, so it uses the vector crest placeholder. Pristine copies are
archived in `_source/assets-originals/` (14 MB, not shipped).

### Content captured (`src/data/site_data.json`)

| Entity | Count |
| --- | ---: |
| Standings rows | 18 |
| Match results | 50 |
| Clubs (code, roster, status) | 37 |
| Leaderboards (×10 each) | 3 |
| Transfer moves | 210 |
| News articles (full copy) | 4 |
| Competition formats | 4 |
| FAQ entries | 8 |
| Products / entry passes | 2 |

Business facts preserved: **SGD 35** per-team entry, **36-team cap**, **18 registered**,
5 divisions, EA SPORTS FC disclaimer, `iwvplofficial@gmail.com`, Singapore base, and the
24–48h confirmation workflow.

> The original `/faq` and `/history` shipped unedited theme placeholder text ("Key business
> questions are the questions that your data expert…"). That was not carried over: the FAQ
> was rewritten from real site facts, and `/history` became the genuine "Our promise"
> section from `/about-us`. Everything else is the original copy.

---

## UX audit & redesign (Phase 2)

### Friction found in the original

- **1,280 pages, no information architecture** — `history`, `faq`, `canvas`, `test` and 364
  `author` archives all publicly reachable.
- **~40 stylesheets and ~25 JS bundles per page**; homepage HTML alone is 402 KB.
- **League data behind GET forms** that re-render the page; results/leaderboards load over
  XHR with no client state.
- **Duplicated navigation** rendered twice on every page.
- **Tables with no semantic headers, sorting or scroll affordance**; standings header was a
  bare `#f73838` on white.
- **Many `<img>` without `width`/`height`** → layout shift; lazy placeholders were inline
  SVG data URIs.
- **No focus states, no skip link**; English copy interleaved with Indonesian comments; an
  "UPCOMING MATCH" widget rendering **0 Games**.

### Design system

| Token group | Dark | Light |
| --- | --- | --- |
| Background | `#0a0b0d` ink | `#f6f7f4` warm paper |
| Surface | `#12151a` → `#0e1013` gradient | `#ffffff` → `#f7f8f5` |
| Text | `#eef0f3` / `#8b93a1` muted | `#2c3138` / `#666e7a` |
| Border | `#232830` | `#dfe3da` |
| Accent | electric lime `#c8ff3d` (both modes) |
| Honours | gold `#ffc53d` (both modes) |

Type: **Sora** (display) / **Inter** (body) / **Oswald** (tabular numerals).

Motion: scroll reveals, hover lifts, score pop, animated accent underlines, live pulse —
all disabled under `prefers-reduced-motion`.

Accessibility: skip link, visible focus rings, semantic `<table>` + `<caption>`,
`aria-sort`, labelled controls, `role="alert"` errors, `role="status"` confirmations,
keyboard-navigable listbox and mega-menu, `inert` on closed menus.

---

## Notable fixes

**Mega-menu hover.** The reported bug had two causes. (1) The panel sat 14px below the
trigger, so the pointer crossed dead space and `mouseleave` fired immediately — now the
positioned wrapper carries `pt-3` to bridge the gap, and closing is deferred by 240ms.
(2) The trigger's `onClick` toggled state, but hovering had *already* opened the menu, so
the same interaction closed it again — clicking now only opens; `mouseleave`, `blur` and
`Escape` own closing.

**Match-results hover.** Rows were `<a>` elements with their own `rounded-xl` and a
background, so the highlight did not match the flat rounded container. Rows now carry
`.row-hover`, whose highlight is an absolutely-positioned `::before` at `inset: 0`
(verified: row radius `0px`, `inset: 0px`), clipped by the container's `overflow: hidden`.

**Emoji news slugs.** WordPress stores `🔥…` as `%f0%9f%94%a5-…`, but React Router decodes
route params, so `slug === param` never matched and the article 404'd. `src/data/index.ts`
decodes and normalises both sides before comparing.

**Crest mapping.** Fuzzy filename matching had mapped PENYAMUNZ's `3.webp` to the UEFA
Championsions League logo. Resolution is now strict (supplement → exact filename on disk →
exact stem), and results pages fall back to a club-name index because they link thumbnail
variants. All 18 standings crests were then verified against their club names.

**Table alignment.** A real `<table>` resolved the header and body rows to *different*
column widths here (`cellIndex 0` rendered 70px apart), so the standings table is now a
single CSS grid with one shared `grid-template-columns` for the header and every row —
alignment is guaranteed by construction (measured 0px delta on all 10 columns). ARIA
`table`/`row`/`columnheader`/`cell` roles and `aria-sort` preserve the semantics, and
clicking or keying a header still sorts.

**Scroll-reveal hardening.** `Reveal` now reveals immediately when an element is already
on screen at mount, falls back when `IntersectionObserver` is unavailable, and carries a
failsafe timer — content can no longer be stranded at `opacity: 0`.

**Sponsor artwork.** The section was showing registration posters. The real partners are
**Spintrillz Renovation** and **We Made Supply**, extracted from the original site's logo
grid, de-matted to transparency and shown bare (no card, inverted only in dark mode).

**Light mode.** Lightening colours meant editing every component, which would drift.
Refactored to semantic CSS variables so both modes share one code path.

---

## Performance

```
JS (initial)   363 KB raw → 85 KB gzip   (react vendor + app, route-split)
CSS             72 KB raw → 12 KB gzip
Per-route JS   1.6–8.9 KB raw             (lazy-loaded)
Fonts           6 files, ~208 KB          (variable, preloaded, subset)
Media          4.5 MB total, lazy         (hero preloaded, responsive via <picture>-style media attrs)
```

The app makes **zero external network requests** at runtime.

---

## Verification performed

| Check | Result |
| --- | --- |
| `tsc -b` (strict) | clean |
| Production build | 8.9 s, clean |
| 13 routes (dev + prod) | 0 console warnings/errors, 0 failed requests, 0 external calls |
| Mega-menu | hover opens (`expanded=true`); click no longer closes it |
| Theme toggle | switches and persists; 0 native `<html class>` mismatch |
| Custom dropdown | 19 options, portal-positioned, **0 native `<select>`** in DOM |
| Transfer page | 210 moves; Signings 183 / Internal 27 / Departures 0 / Newly signed 0 |
| News emoji slug | article renders, no 404 |
| Leaderboard | podium (1st centred) + 7 chasing rows; bare tabs (`border 0`, `radius 0`) |
| Home leaderboard | exactly 10 rows |
| Parallax | 4 layers registered, CSS var written on in-view layers |
| Sponsors | 3 images at 391px, `0` wrapped in a card |
| News badge | `rgba(0,0,0,0.7)` plate, white text |
| Results hover | row radius `0px`, highlight `inset: 0` |
| Season badge in header | removed |

---

## Re-running the pipeline

```bash
python _crawl/crawl.py sitemap      # enumerate URLs
python _crawl/crawl2.py             # REST API harvest
python _crawl/parse_league.py       # league data -> raw/league_data.json
python _crawl/parse_transfer.py     # transfer log -> raw/transfer_data.json
python _crawl/manifest.py           # asset manifest
python _crawl/download_assets.py    # parallel download + WebP
python _crawl/resolve_crests.py     # guarantee a local crest per club
python _crawl/clean_assets.py       # transparency pass (reads _source originals)
python _crawl/fetch_fonts.py        # self-host font subsets
python _crawl/build_site_data.py    # emit src/data/site_data.json
```

---

## Disclaimer

IWVPL is an independent league promoter and is not affiliated with, sponsored, or endorsed
by Electronic Arts Inc. EA SPORTS and EA FC are registered trademarks of Electronic Arts Inc.

---

## Pass 4 — hero carousel, cart, club pages

### Hero carousel
The hero now crossfades the **four campaign slides the original site rotates**, in
its own order, extracted from the `revslider` markup (`rs-2`, `rs-20`, `rs-3`,
`rs-4`) and downloaded at full resolution to `public/assets/hero/slide-{1..4}.webp`.

Slide 1 is a *poster* — the artwork already carries a centred headline, so only the
CTAs are layered over it and it gets an even scrim. Slides 2–4 are player shoutouts
and get the standard copy block. Autoplay pauses on hover, focus and when the tab
is hidden, and is skipped entirely under `prefers-reduced-motion`. Dots, arrow keys,
and an `aria-roledescription="carousel"` region are wired up.

### The grid template bug (important)
Pass 3's table alignment "fix" passed its own measurement but was **visually broken**:
every cell stacked into one column. The track list was passed as
`gridTemplateColumns: 'var(--tpl)'` with a Tailwind underscore value
(`[3.5rem_minmax(0,1fr)_...]`). **Custom properties do not get Tailwind's
underscore-to-space conversion**, so the value was invalid CSS and the grid fell
back to a single column. The centre-delta test read 0 because both header and body
stacked identically.

The template now lives in a `.tbl-tpl` CSS rule with real spaces and its own media
queries, so both halves follow the same breakpoints with no JS measurement.
Verified 0px centre and width delta across all 10 columns at 1296px.

### Cart
`src/lib/cart.tsx` — provider + `useCart`, localStorage-backed, resolves lines
against `siteData.products`, totals only when every price is numeric (the
Champions League pass is priced "Entry Pass", so it must not be silently summed).
Header bag icon with a live count badge, slide-over panel, `/cart` page, and
"Add to cart" on the register page and every club detail page.

### Club detail pages
`/clubs/:slug` (and `/team/:slug`) — masthead, season record, matches, top scorers,
transfer activity, and a clearly-labelled link out to the original page. **Every
crest now routes internally**; `ClubCard` previously linked straight to
`iwvpl.asia`.

### Terms dialog
The entry-terms button was nested **inside** the `<label htmlFor="agree">`, which
swallows clicks on descendants — the link silently did nothing. It is now a sibling
of the label. `TermsDialog` handles Escape, backdrop click, focus trap in both
directions, body scroll lock, and focus restoration.

### Other fixes
- **We Made Supply logo was 99.5% transparent.** The earlier de-matting seeded its
  flood fill from a grid that included the *centre* — which on that logo is solid
  black artwork, so the fill flooded the whole silhouette. Both upstream PNGs
  already carry a real alpha channel, so they are now kept as-is.
- **X-VIPERS FC reported 2026 players.** The club-card scraper's extra-data capture
  ran past the card into the page footer and picked up "(c) 2026 Island-Wide...".
  `_int` now takes an optional plausibility clamp and the capture stops at the card
  boundary; the stored value was corrected to 0.
- **Home standings showed all 18 clubs.** `StandingsPreview` passed the full array;
  it now slices to the top 10 with a "View all 18 clubs" link.
- **Light mode scrims faded toward paper**, which read as grey haze over the
  campaign art. Scrims now wash toward a warm ink (`--hero-ink`) in both themes.
- **Light mode paper was too white** (`#f7f8f4`); warmed to `#eeefe8`.
- **Mobile drawer** was translucent with no scrim and the league section collapsed.
  Now opaque (`--bg-raised`), with a `bg-black/60` scrim, league open by default,
  and body scroll lock.
- **Dropdown options were inset on the right** by an unconditional
  `scrollbar-gutter: stable`; removed and replaced with a measured `overflowing`
  flag, and the tick moved into a fixed-width slot so rows are identical boxes.
- Hero overlay text (`Season 1 is live`, the poster description) went from
  `white/55` and `white/70` to solid white with a drop shadow — a computed-style
  walk cannot verify contrast over artwork, so these were made unambiguous.

---

## Pass 6 — flush hero, transfer grid, dropdown fix

### Hero: flush, static, no hover pause
- The section now has **one fixed min-height in both modes**. Previously it
  sized itself from its content, so settling from poster into layout pushed the
  copy and leaders card down and the whole block visibly jumped. Same padding
  in both modes, no padding transition.
- **All text animation removed** — the copy, headline and CTAs no longer carry
  `animate-fade-up`. They simply appear in place.
- **Carousel no longer pauses on hover or focus.** A visitor reading the copy
  should not have the slide change mid-sentence. The progress track runs
  uninterrupted.

### Transfer table
Was a real `<table>` with `min-w-[720px]` inside `overflow-x-auto` — the same
construct that broke the standings table twice. Rebuilt as a shared CSS grid
(`.trf-tpl`) with the header and all 211 rows on one track list. Under 640px the
From/arrow columns drop and the destination appears under the player's name, so
nothing is lost.

### Dropdowns (all pages)
The listbox is portalled into `document.body`, so it sits **outside** the
`Select`'s `rootRef`. The outside-click handler therefore treated a press on an
option as an outside click and unmounted the menu on `pointerdown` — before the
`click` could land. The menu opened and then did nothing, on every page with a
dropdown. The handler now also checks the list node. The list ref was also a
fresh object literal on each render, so the ref callback wrote into a throwaway;
it is a proper `useRef` now, with the overflow measurement moved into the layout
effect.

### Removals
- Theme toggle and `ThemeToggle.tsx` deleted. The theme still follows the stored
  preference / OS setting, there is just no control.
- Club pages no longer show an "Add entry · SGD 35" button — it read as buying
  the club. They now link to `/register`.
- "Browse entries" replaced with "Back to registration" in both cart empty states.

### Mobile
- The drawer scrim was `inset-0`, and because the header is translucent glass the
  black scrim showed *through* it, darkening the top bar instead of the content.
  The scrim now starts at `top-16`, and the bar goes opaque while open.
- Standings lost its `min-w-[720px]` and `overflow-x-auto`; the track list already
  collapses to four columns on a phone.

### Verification
`_crawl/verify_pass6.mjs` — 48 assertions, 0 failures.
`_crawl/verify_mobile_fit.mjs` — 15 routes scanned at 390px for sideways-scroll
constructs: none.

---

## Pass 7 — hero revised to spec

**Only slide 1 gets the poster beat.** Slides 2-4 are player shoutouts and go
straight to the working layout, exactly as they did before. Slide 1 is the
campaign key art with a headline baked in, so it is shown whole for 2.4s first.

**"Full" means the same frame as the other slides.** The artwork renders
`object-contain` inside the normal hero frame, over a blurred, scaled
`object-cover` copy of itself. That keeps the whole picture visible with no hard
letterbox bars, while the frame stays the same size as every other slide. (The
earlier letterbox-only version produced a thin strip with visible bars.)

**Flush by construction.** The layout content is *always mounted*. During the
poster it is only faded to `opacity-0` and marked `inert` — it still occupies
exactly the same space, so the frame cannot jump when the layout settles in.
A fixed pixel height was tried first and overflowed on phones, where the layout
stacks into a single column.

**Text animation is back.** `animate-fade-up` on the copy and the leaders card,
staggered 0ms / 150ms, keyed on slide + mode so it replays each time the layout
settles rather than only on page load.

### A latent React 18 bug found on the way
`inert` is not supported as a prop until React 19 — React 18 silently drops it,
so `<div inert="">` never reached the DOM. The mega-menu has had `inert` on its
closed panel this whole time without effect. Both now set the attribute through
a ref (`src/lib/inert.ts`), and `Container` had to become a `forwardRef`
component for the hero to reach one.

### Verification
`verify_hero.mjs` — 45 assertions, 0 failures: poster-only-on-slide-1, contain vs
cover, blurred backdrop, holds until the deadline then settles, same content
node across the transition, `inert` toggling, staggered animation, no hover
pause, slide-1 replay, reduced-motion path.
`verify_pass6.mjs` — 43 assertions. `verify_mobile_fit.mjs` — 15 routes at 390px.

---

## Pass 8 — viewport poster, typing headline, no flashing

### Slides 2-4 were flashing
The layout copy was keyed on the slide index, so **every slide change remounted
it** and replayed `animate-fade-up`. Every element blinked on each transition.
The copy is now mounted once and never keyed on the slide; arrival is driven by
a class toggle, which cannot restart an animation. Verified by node identity:
switching slides 2→3 keeps the same `<h1>`, paragraph and card elements.

### Slide 1 fills the viewport, then settles
During the poster beat the section is `min-height: 100svh`. When the layout
arrives, `min-height` animates to `0`, so the frame eases back down to whatever
the content needs. Both ends are explicit values on purpose - a transition to
`auto` does not animate. The artwork stays whole (`object-contain`) over a
blurred, scaled `object-cover` copy of itself, so there are no letterbox bars.

### Typing, not fading
`animate-fade-up` is gone entirely. The headline now reveals character by
character (`useTypewriter`, 34ms/char after a 220ms beat) with a blinking caret,
and the badge, paragraph, CTAs, stats and leaders card fade in once typing
finishes. The gradient span is preserved because the headline is typed as
segments rather than one flat string.

Typing is driven by a flag, not a remount, so it runs once when the layout first
appears and does **not** restart on slides 2-4 - which is what caused the
flashing. It replays when slide 1's poster beat replays. `prefers-reduced-motion`
skips it entirely.

### Verification
`verify_hero.mjs` — 42 assertions, 0 failures: viewport fill -> `min-height: 0`,
mid-type prefix check, caret lifecycle, node identity across slide changes
(headline, paragraph, card), text unchanged, opacity class unchanged, slide-1
replay, reduced-motion path, no hover pause.
`verify_pass6.mjs` — 44 assertions. `verify_mobile_fit.mjs` — 15 routes at 390px.

---

## Pass 9 — full-viewport hero, one-time opening, unified mobile art

### The hero fills the viewport on every slide
`min-h-[100svh]` unconditionally. `min-height` rather than a fixed `height`, so
a short window still fits the layout if the content is taller than the screen.

### The picture-only opening runs once
An `intro` flag gates it and is never reset. On the first load slide 1 holds on
its own; after that, looping back to slide 1 or clicking its dot goes straight to
the layout.

This also fixed a bug the previous pass introduced: `fullBleed` was
`slide.poster && !settled`, so arriving back at slide 1 flipped `showLayout`
false and straight back to true — which **restarted the typewriter on every
visit**. Gating on `intro` means `showLayout` never toggles after the opening.

### The text arrives faster
The picture-only hold went from 2200ms to 1100ms. Typing itself is ~34ms per
character (~1.3s for the headline) after a 220ms beat.

### Mobile uses the same artwork
The separate square portrait crop (`player-hero.webp`) is gone; slide 1 is the
same `slide-1.webp` at every width, letterboxing over the blurred backdrop during
the opening and covering afterwards. `index.html` had two width-conditional
preloads for the old desktop/mobile pair — now a single unconditional preload of
`slide-1.webp`, which is also the LCP element.

### Verification
`verify_hero.mjs` — 44 assertions, 0 failures, covering all four points plus the
earlier guarantees (no flashing on slides 2-4, reduced-motion, no hover pause).
Notably it asserts that clicking slide 1's dot and looping all the way round to
it both leave the headline already typed and the layout showing.

---

## Pass 10 — formats, contact page, static slide 1, visible controls

### Format cards lost the badge pills
`11 vs 11`, `1 vs 1` and `Coming Soon` were rendered as pill badges, which made
the row read as a set of status chips rather than four competition formats. They
are now plain uppercase labels with a hairline rule under the row.

### Contact page rebuilt
The three icon channel cards collapsed into one clear hierarchy: the email
address is the single primary action, set large and underlined; base and season
sit in a quiet definition list; social is a minimal inline list. The form is a
single card with one `h2`, name/email paired on one row, a one-line hint under
the subject dropdown that updates with the selection, and a direct-email
fallback beside the submit button. Focus moves to the first invalid field on
submit.

### Slide 1 is static
Slide 1 was held still during the opening, then the Ken Burns push started the
moment the layout arrived — the picture appeared to snap back to a new position.
Slide 1 now never animates; slides 2-4 keep their slow push.

### The controls were below the fold
The header is fixed, so a `100svh` hero began *below* it, putting the total
block at `header + 100svh` and pushing the dot strip off-screen. The section now
reserves the header height as top padding and subtracts it from the content box
(`pt-16` + `min-h-[calc(100svh-4rem)]`, `lg:pt-[72px]` +
`lg:min-h-[calc(100svh-4.5rem)]`), so header + hero = exactly one viewport and
the dots are visible without scrolling.

### Verification
`verify_pass10.mjs` — 35 assertions, 0 failures: no pills in the format cards,
the contact hierarchy (single h1, labelled fields, subject hint, validation
count, focus management, working dropdown), slide 1 carrying no animation class
before *and* after the layout while slide 2 still does, and the header/hero
offset pairing. Suites total 123 assertions across four files, 0 failures.

---

## Pass 13 — the iw mark drawn, and a rail that works on a phone

### The mark was a wipe, now it is drawn

The statement's iw mark used to reveal as a `clip-path` inset from the left.
It now draws, in the order a hand would make the letter: **the dot, then the
stem straight down, then the diagonal wave.**

The export is filled geometry, so there is nothing to dash. Instead a fat
round-capped stroke is swept along the mark's skeleton inside an SVG `<mask>`,
and the real fill is revealed wherever that marker has been. A mask can only
reveal ink that is already there, so it cannot distort the mark.

Three things were measured rather than guessed, and all three had to be:

- **The skeleton.** Rasterising the mark and taking the midpoint of the white
  run on each scanline gives the stem's right lean and the wave's foot /
  crest / valley / hook sequence directly. A hand-fitted skeleton clipped
  3.4% of the ink at the crest.
- **The pen width.** The mark's own strokes are ~45 units across, so a 45-wide
  marker is the literal answer — and it clips, because a hand-drawn wave's
  skeleton never hugs a 45-wide stroke exactly. Swept against a rasterised
  diff: 54 loses 3.4% of the ink, 66 still eats the counter edges, 78 loses
  four pixels out of 386,997. **80 ships.**
- **The counter fills.** See below.

### The two teardrop counters are filled — and traced, not guessed

The wave encloses two holes, the counter of an "a". They are closed so the
wave reads as one solid zigzag. The first attempt guessed at them with two
oversized rounded rects; they ate several units into the surrounding strokes
and turned the mark into something that looked hand-drawn and wrong. The
shapes now in `IwMark.tsx` are traced from the real geometry — flood fill from
the border to find the enclosed regions, then a 720-ray radial scan from each
hole's centroid (they are teardrops, so star-shaped, so the scan closes by
construction), smoothed, simplified, and offset 1.6 units outward so no
anti-aliased seam survives where two fills meet.

They sit **outside** the export's `translate(0,246) scale(0.1,-0.1)` group
because they are already in viewBox units; inside it they scale to a tenth of
their size and silently vanish.

### The text finishes before the mark starts

Words land by `cover 51%`; the mark runs `52% → 68.5%`. That window is narrow
on purpose — the section is 661px tall in an 898px viewport, so `cover` is
1559px of scroll and the mark is already climbing out of frame by the end of
it.

The **dot is its own beat**. The strokes neither butt-join nor overlap: the
dot finishes, the pen lifts, and only then does the letter start, with a gap
of roughly 3px of scroll between them. Overlapping them let the stem's
80-unit round cap open while the dot was still filling, so the two merged
into one amorphous blob and the dot never read as a deliberate first stroke.
The stem and wave *do* overlap, because from there on it is one continuous
gesture.

### The rail no longer scrolls sideways on a phone

Below 900px the three nation panels are stacked, full-bleed and edge to edge:
no sideways travel, no cards floating in a gutter, nothing to pan. A pinned
280vh rail on a 390px screen spends most of the scroll on scroll driving
sideways motion instead of on content. Desktop is unchanged.

The rail's `--rail` timeline is now declared at every width so the artwork
drift still rides it on mobile. Reduced-motion's unpin override is scoped to
`min-width: 900px`, because forcing `overflow-x: auto` onto the mobile stack
would make it a scroll container — and any overflow other than `visible`
quietly breaks a scroll-driven timeline.

Also deleted: `.rail__copy` and `.rail__cta*`, which had no matching elements
at all.

### Nation artwork is legible, and the three match each other

The artwork was dim **and** hazy. Hazy is the worse half: compositing it over
a near-black panel at partial alpha lifts the blacks, so the campaign art
turned milky grey and the reds went muddy. Opacity is now **1** — the scrim
does the shaping, not the alpha — with `saturate(1.08) contrast(1.05)` to put
the depth back. The scrim ramp went `0.90/0.72/0.36` + a 0.95 vignette to
`0.76/0.46/0.10` + 0.44, which had crushed the left third to near black and
made the middle of each panel the brightest thing in it.

The three panels still did not match, and equal treatment does not produce
equal results, because each is a different artwork. Measured on the rendered
composite (`scripts/verify-rail-art.html`, which reads the live computed
styles so it cannot drift from the stylesheet): Singapore 56, Malaysia 65,
Indonesia 64 — Singapore reading 9% dim. `--art-gain` corrects each, against
the **brightest** panel rather than the mean, so levelling never costs anyone
brightness. Right-edge luminance is now 69 / 70 / 70, spread **1.5%**.

### The rail's artwork is left-anchored, and its copy is no longer sliced

The rail reused the hero's `hero-focus-*` offsets (6/14/19%). Those are
measured for a completely different composition: on a phone the hero frame is
far taller than the viewport, so `object-cover` scales by height and only
~15–18% of the image width is ever on screen, and the offsets exist to push
each nation's subject clear of the *overlaid* hero copy. On a rail panel — a
plain stacked card with its copy left-aligned — they only produced three
arbitrary crops. All three are now `left center`. (A no-op on desktop: at
`84cqw × 66svh` the panel's aspect ≈ 1.82 against the artwork's 1.79, so cover
does almost no horizontal cropping and the horizontal position cannot show.)

As the track travels it sheared each panel's copy in half at the viewport
edge — the nation code and club count sliced mid-word. `.rail__vp` now carries
a `mask-image` that fades the frame's left and right edges, so panels emerge
from and return to darkness instead of being cut. Desktop only: below 900px
nothing travels, and fading the top and bottom of a stack would just dim the
first and last panels.

### A CSS trap worth recording

The minor dark veil over the artwork was first written as a flat colour layer
at the **top** of the `background` shorthand. A `<color>` is only valid in the
**final** layer of a `background`, so putting it first made the entire
declaration invalid and Chrome dropped the scrim silently — no error, no
warning, just `background-image: none`. It is now a two-stop
`linear-gradient` with identical colour stops, which is a real `<image>` layer
and can sit on top where it belongs.

### Login page

The IWVPL wordmark above the form is gone. The fixed header already carries
the brand two inches above it, and on the one page the eye should be on the
form, the lockup was duplicated.

### The blob before the mark draws

The mark showed an 80-unit lump on it, long before it drew anything.

At progress 0 the dash is *zero-length* and sitting on the path start, and
`stroke-linecap: round` renders a zero-length dash as a dot — which is what
the spec says it should do. So the round-capped pen painted a blob there. It
was also scale-dependent: the cap rounds away to nothing at some rendered
sizes, so the artefact passed a check at one viewport width and came back at
the next (it was invisible at 1296px and obvious at 1853px, which is exactly
why it survived two rounds of testing).

The obvious fix — butt caps, which draw nothing for a zero-length dash — was
tried and is **worse**. A butt cap is flat, and here it broke two other things:
the dot, being a closed path, swept as a hollow ring instead of filling in,
and the dot's 80-unit band bled into the top of the stem.

Round caps are what make the pen read as a marker, so they stay and
`sd-mark-draw` fades the pen in over its first half percent instead — about
3px of scroll, invisible as a fade, enough to hide the cap at rest.

`scripts/audit-iw-mark.mjs` now fails the build if that `opacity: 0` goes
missing from the `from` keyframe, if the `0.5%` step goes, or if the cap is
switched back to butt. All four cases verified by deliberately breaking them.

### A guard, because this has broken three times

`npm run build` and `npm run typecheck` now run `scripts/audit-iw-mark.mjs`.
It fails when either export `d` string stops matching the source SVG, when any
cubic group is not a multiple of six numbers (the signature of a dropped digit
— the browser discards the tail of such a segment silently), when the counter
fills stop being paths, or when they are moved inside the transform group.

Verified by deliberately breaking each case; all four are caught.

---

## Deployment (GitHub Pages)

Live at **https://mathiassam2.github.io/iwvpl/**

The site is a static SPA, so two things had to be right for Pages:

- **`base: '/iwvpl/'`** in `vite.config.ts` — Pages serves from a subdirectory,
  so every asset URL must be prefixed. This is unconditional; a conditional
  base silently produced a build that 404'd every asset.
- **`HashRouter`** — Pages has no server-side rewrite, so `BrowserRouter`
  routes 404 on refresh. Hash routes need no server config.

`public/404.html` redirects stray paths back into the app, and
`public/.nojekyll` stops Pages running the build through Jekyll.

### Deploying
Push to `main`. `.github/workflows/deploy.yml` builds and pushes `dist/` to
the `gh-pages` branch, which is the configured Pages source.

### Local development
`npm run dev` serves at **http://localhost:3000/iwvpl/** (not the root), because
the base path is shared. `npm run preview` behaves the same.

### Verified on the live site
- `/iwvpl/` returns 200 and serves the SPA shell
- all 158 files under `dist/` return 200
- all 16 lazy-loaded page chunks return 200
- all 6 self-hosted fonts return 200
- no absolute `/assets/` paths remain in any served CSS
