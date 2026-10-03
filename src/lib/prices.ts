import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { codesToAsk, type OpenPrice, type PriceCacheRow } from './price-rules'

/** Shared prices on this device (PRICE-01): the list reads the copy kept
 *  in Dexie (price_cache, version 13) and never waits for the network.
 *  Products with no copy, or one older than a week, are asked about in the
 *  background, a few at a time; the list updates when the answers land.
 *  Offline, the copy is what shows. Nothing here is synced: the prices are
 *  public, and every device can ask for them itself. */

const asked = new Set<string>()

/** Ask Open Prices about these barcodes, in the background, and keep the
 *  answers. A failed ask leaves the old copy as it was. */
export async function refreshPrices(codes: string[]): Promise<void> {
  if (!codes.length) return
  const rows = await db.price_cache.bulkGet(codes)
  const todo = codesToAsk(codes, rows, Date.now()).filter((c) => !asked.has(c))
  if (!todo.length) return
  todo.forEach((c) => asked.add(c))
  const { fetchOpenPrices } = await import('./open-prices')
  for (const code of todo) {
    try {
      const prices = await fetchOpenPrices(code)
      if (prices) await db.price_cache.put({ code, fetched_at: new Date().toISOString(), prices })
    } finally {
      // Asked again next time the list opens, if this one failed.
      asked.delete(code)
    }
  }
}

/** The shared prices for the list's barcodes, as kept on the device; asks
 *  for the missing ones in the background. */
export function useOpenPrices(codes: string[]): Map<string, OpenPrice[]> {
  const key = [...new Set(codes)].sort().join(',')
  const rows = useLiveQuery(async () => (key ? db.price_cache.bulkGet(key.split(',')) : []), [key], [] as (PriceCacheRow | undefined)[])
  useEffect(() => {
    if (!key) return
    void refreshPrices(key.split(',')).catch(() => undefined)
  }, [key])
  const out = new Map<string, OpenPrice[]>()
  for (const r of rows) if (r) out.set(r.code, Array.isArray(r.prices) ? r.prices : [])
  return out
}

/** One product's copy, for the price detail. */
export function useOpenPricesFor(code: string | null): { prices: OpenPrice[]; fetched_at: string | null } | undefined {
  return useLiveQuery(async () => {
    if (!code) return { prices: [], fetched_at: null }
    const r = await db.price_cache.get(code)
    return { prices: r?.prices ?? [], fetched_at: r?.fetched_at ?? null }
  }, [code])
}
