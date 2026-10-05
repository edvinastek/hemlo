import { CapacitorHttp } from '@capacitor/core'
import { isNative } from './native'
import { RateLimiter } from './products-rules'
import { OPEN_PRICES_AGENT, openPricesUrl, readOpenPrices, type OpenPrice } from './price-rules'

/** Asking Open Prices (prices.openfoodfacts.org) for the prices people
 *  shared for one product (PRICE-01). Straight from this device: only the
 *  barcode goes out, nothing about the person, and Visuma's server is not
 *  involved. The rules for reading the answer are in price-rules.ts; this
 *  file only asks, slowly, and never from a test. */

/** Open Prices names no limit; Visuma keeps to the pace Open Food Facts asks
 *  of its product service (15 a minute), a little under it. */
const limiter = new RateLimiter(10, 60_000)
let queue: Promise<void> = Promise.resolve()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function turn(): Promise<void> {
  const mine = queue.then(async () => {
    const wait = limiter.waitFor(Date.now())
    if (wait > 0) await sleep(wait)
    limiter.take(Date.now())
  })
  queue = mine.catch(() => undefined)
  return mine
}

/** The shared prices for a barcode, or null when Open Prices could not be
 *  reached (offline, busy): the caller keeps what it had. */
export async function fetchOpenPrices(code: string): Promise<OpenPrice[] | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  await turn()
  const url = openPricesUrl(code)
  try {
    if (isNative()) {
      // From the phone's own connection the request may name the app, as
      // Open Food Facts asks.
      const res = await CapacitorHttp.get({
        url, headers: { 'User-Agent': OPEN_PRICES_AGENT, Accept: 'application/json' },
        connectTimeout: 15000, readTimeout: 15000, responseType: 'json',
      })
      if (res.status !== 200) return null
      return readOpenPrices(typeof res.data === 'string' ? JSON.parse(res.data) : res.data)
    }
    // A browser may not set User-Agent; Open Prices reads X-User-Agent instead
    // (and allows it across sites).
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), 15000)
    try {
      const res = await fetch(url, { signal: stop.signal, credentials: 'omit', headers: { Accept: 'application/json', 'X-User-Agent': OPEN_PRICES_AGENT } })
      if (res.status !== 200) return null
      return readOpenPrices(await res.json())
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}
