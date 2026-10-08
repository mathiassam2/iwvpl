import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { siteData } from '@/data'
import type { Product } from '@/types/site'

const STORAGE_KEY = 'iwvpl-cart-v1'

export interface CartLine {
  slug: string
  qty: number
}

interface CartApi {
  lines: CartLine[]
  /** Resolved against `siteData.products`; unknown slugs are dropped. */
  detailed: Array<{ product: Product; qty: number }>
  count: number
  /** True when every line carries a numeric price we can total. */
  canTotal: boolean
  total: string
  panelOpen: boolean
  add: (slug: string, qty?: number) => void
  setQty: (slug: string, qty: number) => void
  remove: (slug: string) => void
  clear: () => void
  has: (slug: string) => boolean
  openPanel: () => void
  closePanel: () => void
  /** Flips the badge after an add so the change is noticeable. */
  pulse: number
}

const CartContext = createContext<CartApi | null>(null)

const MAX_PER_LINE = 10

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const known = new Set(siteData.products.map((p) => p.slug))
    return parsed
      .filter(
        (l): l is CartLine =>
          !!l &&
          typeof l === 'object' &&
          typeof (l as CartLine).slug === 'string' &&
          known.has((l as CartLine).slug),
      )
      .map((l) => ({ slug: l.slug, qty: Math.max(1, Math.min(MAX_PER_LINE, Math.round(Number(l.qty) || 1))) }))
  } catch {
    return []
  }
}

/** "SGD 35" -> 35. Returns null for non-numeric prices ("Entry Pass"). */
function numericPrice(price: string): number | null {
  const m = price.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) ? v : null
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => (typeof window === 'undefined' ? [] : read()))
  const [panelOpen, setPanelOpen] = useState(false)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      /* private mode - the cart just will not persist */
    }
  }, [lines])

  // Lock the page behind the side cart so the content behind cannot scroll.
  useEffect(() => {
    if (!panelOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [panelOpen])

  const add = useCallback((slug: string, qty = 1) => {
    setLines((prev) => {
      const found = prev.find((l) => l.slug === slug)
      if (found) {
        return prev.map((l) =>
          l.slug === slug ? { ...l, qty: Math.min(MAX_PER_LINE, l.qty + qty) } : l,
        )
      }
      return [...prev, { slug, qty: Math.max(1, Math.min(MAX_PER_LINE, qty)) }]
    })
    setPulse((n) => n + 1)
  }, [])

  const setQty = useCallback((slug: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.slug !== slug)
        : prev.map((l) =>
            l.slug === slug ? { ...l, qty: Math.max(1, Math.min(MAX_PER_LINE, Math.round(qty))) } : l,
          ),
    )
  }, [])

  const remove = useCallback((slug: string) => {
    setLines((prev) => prev.filter((l) => l.slug !== slug))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<CartApi>(() => {
    const bySlug = new Map(siteData.products.map((p) => [p.slug, p]))
    const detailed = lines
      .map((l) => {
        const product = bySlug.get(l.slug)
        return product ? { product, qty: l.qty } : null
      })
      .filter((x): x is { product: Product; qty: number } => x !== null)

    const count = detailed.reduce((n, l) => n + l.qty, 0)

    // Only total when every line has a parseable price; otherwise we would be
    // quietly inventing a number for an "Entry Pass" line.
    const prices = detailed.map((l) => numericPrice(l.product.price))
    const canTotal = prices.length > 0 && prices.every((p) => p !== null)
    const sum = prices.reduce<number>((a, p) => a + (p ?? 0), 0)
    const total = canTotal ? `SGD ${sum % 1 === 0 ? sum.toFixed(0) : sum.toFixed(2)}` : ''

    return {
      lines,
      detailed,
      count,
      canTotal,
      total,
      panelOpen,
      add,
      setQty,
      remove,
      clear,
      has: (slug) => lines.some((l) => l.slug === slug),
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
      pulse,
    }
  }, [lines, panelOpen, add, setQty, remove, clear, pulse])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}

export { numericPrice }
