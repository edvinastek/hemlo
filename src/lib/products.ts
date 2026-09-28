import { CapacitorHttp } from '@capacitor/core'
import { version } from '../../package.json'
import { db } from './db'
import { edit } from './write'
import { isNative } from './native'
import {
  LIMITS, MAX_WAIT_MS, TTL, RateLimiter, TtlCache, cleanQuery, deletedWith, foodFields, foodWithBarcode, normaliseBarcode,
  offCountry, offLang, pricesUrl, productUrl, readPrices, readProduct, readSearch, searchKey, searchUrl,
  type Engine, type PriceRow, type Product,
} from './products-rules'
import type { Food } from './types'

/** Supermarket products from Open Food Facts, and prices people have shared
 *  on Open Prices. The rules (reading answers, limits, the cache) are in
 *  products-rules.ts; this file only asks.
 *
 *  Everything goes straight from this device to Open Food Facts: the words
 *  searched or the barcode, and nothing about the person. GetIt's own server
 *  is not involved, and answers are kept in memory only, never on the device.
 *
 *  In the Android app requests go through the phone's own connection
 *  (CapacitorHttp), which may say it is GetIt and may use the newer search;
 *  in a browser they are ordinary fetches, which Open Food Facts allows from
 *  any page for the product and price services and the older search. */

type Kind = keyof typeof LIMITS

export type ProblemKind = 'offline' | 'busy' | 'failed'
export class ProductProblem extends Error {
  readonly kind: ProblemKind
  constructor(kind: ProblemKind, message: string) {
    super(message)
    this.kind = kind
  }
}

const OFFLINE = 'You are offline. Searching the shops needs a connection; your own foods still work.'
const UNREACHABLE = 'Open Food Facts could not be reached. Check the connection and try again.'
const BUSY = 'Open Food Facts is busy right now. Try again in a minute.'

const limiters: Record<Kind, RateLimiter> = {
  search: new RateLimiter(LIMITS.search.limit, LIMITS.search.windowMs),
  product: new RateLimiter(LIMITS.product.limit, LIMITS.product.windowMs),
  prices: new RateLimiter(LIMITS.prices.limit, LIMITS.prices.windowMs),
}
/** Requests of one kind wait their turn in order, so a burst of taps is
 *  spread out rather than sent at once and refused. */
const turns: Record<Kind, Promise<void>> = { search: Promise.resolve(), product: Promise.resolve(), prices: Promise.resolve() }
const cache = new TtlCache<unknown>(300)
const asking = new Map<string, Promise<unknown>>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function turn(kind: Kind): Promise<void> {
  const mine = turns[kind].then(async () => {
    const wait = limiters[kind].waitFor(Date.now())
    if (wait > MAX_WAIT_MS) {
      throw new ProductProblem('busy', `That is a lot of ${kind === 'search' ? 'searches' : 'lookups'} in a minute. Try again in ${Math.ceil(wait / 1000)} seconds.`)
    }
    if (wait > 0) await sleep(wait)
    limiters[kind].take(Date.now())
  })
  turns[kind] = mine.catch(() => undefined)
  return mine
}

/** One GET, as JSON. A 404 comes back as null: for a barcode it means "no
 *  such product", which is an answer, not a failure. */
async function getJson(url: string, kind: Kind): Promise<unknown | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ProductProblem('offline', OFFLINE)
  await turn(kind)
  let status: number
  let data: unknown
  try {
    if (isNative()) {
      // Straight from the phone: no browser rules apply, and the request may
      // name the app as Open Food Facts asks.
      const res = await CapacitorHttp.get({
        url, headers: { 'User-Agent': `GetIt/${version} (Android; app.getit.planner)`, Accept: 'application/json' },
        connectTimeout: 15000, readTimeout: 15000, responseType: 'json',
      })
      status = res.status
      data = typeof res.data === 'string' ? safeParse(res.data) : res.data
    } else {
      const stop = new AbortController()
      const timer = setTimeout(() => stop.abort(), 15000)
      try {
        const res = await fetch(url, { signal: stop.signal, credentials: 'omit' })
        status = res.status
        data = status === 200 || status === 404 ? await res.json().catch(() => undefined) : undefined
      } finally {
        clearTimeout(timer)
      }
    }
  } catch {
    throw new ProductProblem(navigator.onLine === false ? 'offline' : 'failed', navigator.onLine === false ? OFFLINE : UNREACHABLE)
  }
  if (status === 404) return null
  if (status === 429 || status === 502 || status === 503 || status === 504) throw new ProductProblem('busy', BUSY)
  if (status !== 200 || data === undefined) throw new ProductProblem('failed', UNREACHABLE)
  return data
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text) } catch { return undefined }
}

/** The same question asked twice at once is asked once; a recent answer is reused. */
async function remembered<T>(key: string, ttl: (value: T) => number, ask: () => Promise<T>): Promise<T> {
  const hit = cache.get(key, Date.now())
  if (hit) return hit.value as T
  const going = asking.get(key)
  if (going) return going as Promise<T>
  const run = ask().then((value) => {
    cache.set(key, value, ttl(value), Date.now())
    return value
  }).finally(() => asking.delete(key))
  asking.set(key, run)
  return run
}

export interface Where { country: string; lang: string }
/** The shops searched are the profile's country's, the Netherlands without one. */
export const whereFor = (countryCode: string | null | undefined): Where => ({ country: offCountry(countryCode), lang: offLang(countryCode) })

/** Products matching the words, sold in the profile's country. Typed digits
 *  that make a barcode are looked up as one. Asked only when the person
 *  presses Search, never as they type. */
export async function searchProducts(text: string, where: Where): Promise<Product[]> {
  const code = normaliseBarcode(text)
  if (code) {
    const one = await productByBarcode(code, where)
    return one ? [one] : []
  }
  const query = cleanQuery(text)
  if (!query) throw new ProductProblem('failed', 'Type at least two letters to search.')
  return remembered(searchKey(query, where.country), () => TTL.search, async () => {
    // The newer search only answers the Android app; a browser uses the older.
    const engines: Engine[] = isNative() ? ['search', 'legacy'] : ['legacy']
    let problem: unknown = null
    for (const engine of engines) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return readSearch(await getJson(searchUrl(engine, query, where.country, where.lang, version), 'search'), where.lang)
        } catch (e) {
          problem = e
          if (e instanceof ProductProblem && e.kind === 'offline') throw e
          // The older search is often briefly too busy, and its "busy" page
          // lacks the header a browser needs, so it looks like no answer at
          // all. One more try, a little later.
          if (engine !== 'legacy' || attempt > 0) break
          await sleep(2500)
        }
      }
    }
    if (problem instanceof ProductProblem && (problem.kind === 'failed' || problem.message === BUSY)) {
      throw new ProductProblem('busy', 'Open Food Facts’ search did not answer; it is often busy. Try again in a minute, or look the product up by its barcode.')
    }
    throw problem
  })
}

/** One product by its barcode, or null when Open Food Facts does not have it. */
export async function productByBarcode(code: string, where: Where): Promise<Product | null> {
  const clean = normaliseBarcode(code)
  if (!clean) throw new ProductProblem('failed', 'That is not a barcode: check the digits.')
  return remembered(`p:${where.lang}:${clean}`, (p) => (p ? TTL.product : TTL.missing), async () => {
    const json = await getJson(productUrl(clean, where.lang, version), 'product') as { status?: number; product?: unknown } | null
    if (!json || json.status === 0 || !json.product) return null
    return readProduct({ ...(json.product as object), code: clean }, where.lang)
  })
}

/** Prices people have shared for this product, the latest per shop. */
export async function sharedPrices(product: Pick<Product, 'code' | 'pack' | 'packUnit'>): Promise<PriceRow[]> {
  const json = await remembered(`$:${product.code}`, () => TTL.prices, async () => getJson(pricesUrl(product.code), 'prices'))
  return readPrices(json, product.pack, product.packUnit)
}

/** The food already kept with this barcode, if any: the person's own first. */
export async function foodByBarcode(code: string, userId: string | null): Promise<Food | null> {
  return foodWithBarcode(await db.food.toArray(), code, userId)
}

/** The product added to the person's own foods, through the one write path
 *  every change takes. A food with this barcode already there is returned
 *  instead of a second one; one deleted earlier is brought back. */
export async function addProduct(product: Product, userId: string): Promise<{ food: Food; existed: boolean }> {
  const all = await db.food.toArray()
  const have = foodWithBarcode(all, product.code, userId)
  if (have) return { food: have, existed: true }
  const fields = foodFields(product, userId)
  const gone = deletedWith(all, product.code, userId)
  const food = await edit('food', gone ?? ({ id: crypto.randomUUID() } as Food), fields)
  return { food, existed: false }
}
