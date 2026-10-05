/** Prices on the shopping list (v17, PRICE-01 to PRICE-04): which price a
 *  row shows, read from two clean sources only. First what the household
 *  typed itself (shop_price, 028); then Open Prices, the open database run
 *  by Open Food Facts (ODbL), for products with a barcode. No supermarket's
 *  site or app is read, and no scraped dataset is used: their terms forbid
 *  it and the EU database right makes it risky. When neither source knows
 *  a price, nothing is shown: never a guess.
 *
 *  Pure, so it can be checked without a network: src/test/price.check.mjs. */

import { fold } from './search-rules.ts'
import { formatMoney, itemCost, perKilo, readPrice, sameShop, type ListItem, type PriceLike } from './shopping-rules.ts'
import { gramsLabel } from './units-rules.ts'

/** The credit Open Prices' licence asks for, wherever its prices are shown
 *  in full (the price detail) and in Settings → About. */
export const PRICE_ATTRIBUTION = 'Prices: Open Prices (Open Food Facts), ODbL'
export const OPEN_PRICES = 'https://prices.openfoodfacts.org'
/** How GetIt names itself to Open Prices, as Open Food Facts asks. */
export const OPEN_PRICES_AGENT = 'GetIt/18 (app.visuma.planner)'
/** A product's prices are asked again after a week; until then the copy on
 *  the device is used, also with no connection. */
export const CACHE_DAYS = 7
/** A typical price is the middle of the reports of the last 90 days. */
export const MEDIAN_DAYS = 90
/** A price seen at the person's own chain counts for a year. */
export const SHOP_DAYS = 365
/** At most this many products are asked about each time the list opens,
 *  so a long list never floods Open Prices; the rest follow next time. */
export const ASK_AT_ONCE = 8

/** The latest prices people shared for one product. */
export const openPricesUrl = (code: string) =>
  `${OPEN_PRICES}/api/v1/prices?product_code=${encodeURIComponent(code)}&order_by=-date&size=50`
/** The product's page on Open Prices, where its reports can be seen. */
export const openPricesPage = (code: string) => `${OPEN_PRICES}/products/${encodeURIComponent(code)}`

// ---- reading Open Prices -----------------------------------------------------------------

/** One shared price, as GetIt keeps it. */
export interface OpenPrice {
  price: number
  currency: string
  /** The day it was paid, 'yyyy-MM-dd'. */
  date: string | null
  /** What the price is for in grams (or millilitres): 1000 for a price per
   *  kilo, the pack's size for a pack, none when that is not known. */
  amount_g: number | null
  /** The shop's chain and its own name in OpenStreetMap. */
  brand: string | null
  name: string | null
  /** ISO country code of the shop. */
  country: string | null
}

type Raw = Record<string, unknown>
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A product's size in grams (or millilitres) from its quantity and unit. */
export function packGrams(qty: unknown, unit: unknown): number | null {
  const n = num(qty)
  if (n === null || n <= 0) return null
  const u = (str(unit) ?? 'g').toLowerCase()
  const k = u === 'g' || u === 'ml' ? 1 : u === 'kg' || u === 'l' ? 1000 : u === 'cl' ? 10 : u === 'dl' ? 100 : null
  if (k === null) return null
  const g = Math.round(n * k * 100) / 100
  return g > 0 && g <= 100_000 ? g : null
}

/** An Open Prices answer, cut to what GetIt needs. A price without an
 *  amount, a currency or a shop is left out; an offer counts at its normal
 *  price when that was given, else not at all (a one-week offer is not what
 *  the thing costs). */
export function readOpenPrices(json: unknown): OpenPrice[] {
  const items = (json && typeof json === 'object' && Array.isArray((json as Raw).items) ? (json as Raw).items : []) as Raw[]
  const out: OpenPrice[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object' || it.type === 'CATEGORY') continue
    const discounted = it.price_is_discounted === true
    const price = discounted ? num(it.price_without_discount) : num(it.price)
    const currency = str(it.currency)?.toUpperCase() ?? null
    if (price === null || price <= 0 || price > 10_000 || !currency || !/^[A-Z]{3}$/.test(currency)) continue
    const loc = (it.location && typeof it.location === 'object' ? it.location : {}) as Raw
    const product = (it.product && typeof it.product === 'object' ? it.product : {}) as Raw
    const brand = str(loc.osm_brand)
    const name = str(loc.osm_name)
    if (!brand && !name) continue
    const date = /^\d{4}-\d{2}-\d{2}/.test(str(it.date) ?? '') ? str(it.date)!.slice(0, 10) : null
    const amount_g = it.price_per === 'KILOGRAM' ? 1000 : packGrams(product.product_quantity, product.product_quantity_unit)
    out.push({
      price: Math.round(price * 100) / 100, currency, date, amount_g,
      brand: brand?.slice(0, 60) ?? null, name: name?.slice(0, 80) ?? null,
      country: str(loc.osm_address_country_code)?.toUpperCase().slice(0, 2) ?? null,
    })
  }
  return out.slice(0, 50)
}

/** Is the shared price from this chain? "Albert Heijn" matches the brand
 *  "Albert Heijn" and the name "Albert Heijn XL"; "Plus" does not match
 *  "Spaarplus". Accents, case and spaces do not matter. */
export function chainMatches(shop: string, p: Pick<OpenPrice, 'brand' | 'name'>): boolean {
  const key = fold(shop).replace(/\s+/g, '')
  if (!key) return false
  if (p.brand && fold(p.brand).replace(/\s+/g, '') === key) return true
  const words = fold(p.name ?? '').split(' ').filter(Boolean)
  // The chain's words, in a row, somewhere in the shop's name.
  for (let i = 0; i < words.length; i++) {
    let joined = ''
    for (let j = i; j < words.length && joined.length < key.length; j++) {
      joined += words[j]
      if (joined === key) return true
    }
  }
  return false
}

/** The middle value; the mean of the middle two for an even count. */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : Math.round(((v[m - 1] + v[m]) / 2) * 100) / 100
}

/** Days from one 'yyyy-MM-dd' to another. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

// ---- choosing the price a row shows ---------------------------------------------------------

/** The price a row shows, and where it came from. */
export interface ShownPrice {
  source: 'own' | 'open'
  /** In the person's currency, for `amount_g` (none: one pack or piece). */
  price: number
  amount_g: number | null
  /** Own: the shop it was noted at. Open: the chain, when it is the person's. */
  shop: string | null
  /** The day it was noted or paid (the latest one, for a middle value). */
  date: string | null
  /** How many shared reports the figure stands on (1 for an own price). */
  count: number
  /** 'shop': the person's shop; 'median': the middle of the country's
   *  reports of the last 90 days; 'latest': an own price at another shop. */
  how: 'shop' | 'median' | 'latest'
}

export interface OwnPriceLike extends PriceLike { shop: string; noted_on: string; deleted_at?: string | null }

/** The middle of the shared prices of the last 90 days in the person's
 *  country, all on the same footing: reports for the same pack size (or all
 *  per kilo) are compared, never a mix. The footing most reports share wins. */
function middleOf(list: OpenPrice[], today: string): ShownPrice | null {
  const recent = list.filter((p) => p.date && daysBetween(p.date, today) >= 0 && daysBetween(p.date, today) <= MEDIAN_DAYS)
  if (!recent.length) return null
  const byBasis = new Map<string, OpenPrice[]>()
  for (const p of recent) {
    const k = p.amount_g === null ? 'each' : String(p.amount_g)
    byBasis.set(k, [...(byBasis.get(k) ?? []), p])
  }
  const [, group] = [...byBasis.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]
  const mid = median(group.map((p) => p.price))
  if (mid === null) return null
  const latest = group.map((p) => p.date!).sort().at(-1) ?? null
  return { source: 'open', price: mid, amount_g: group[0].amount_g, shop: null, date: latest, count: group.length, how: 'median' }
}

/** Which price a row shows (PRICE-01, PRICE-02):
 *  1. the household's own price at the shop in view (the list's shop
 *     filter, else the shop the item is set to); with no shop in view, the
 *     latest own price anywhere;
 *  2. a shared price at that shop's chain in the person's country, the
 *     latest of the last year;
 *  3. the middle of the shared prices in the person's country of the last
 *     90 days;
 *  4. nothing. Shared prices in another currency never count. */
export function choosePrice(opts: {
  own: OwnPriceLike[]
  open: OpenPrice[]
  shop: string | null
  country: string | null
  currency: string
  today: string
}): ShownPrice | null {
  const own = opts.own.filter((p) => !p.deleted_at && Number.isFinite(Number(p.price)))
  const newest = <T extends { noted_on: string }>(xs: T[]) => [...xs].sort((a, b) => b.noted_on.localeCompare(a.noted_on))[0]
  const ownHere = opts.shop ? newest(own.filter((p) => sameShop(p.shop, opts.shop))) : newest(own)
  if (ownHere) {
    return {
      source: 'own', price: Number(ownHere.price), amount_g: ownHere.amount_g ? Number(ownHere.amount_g) : null, shop: ownHere.shop,
      date: ownHere.noted_on, count: 1, how: opts.shop ? 'shop' : 'latest',
    }
  }
  const country = (opts.country ?? '').toUpperCase()
  const usable = opts.open.filter((p) => p.currency === opts.currency && (!country || p.country === country))
  if (opts.shop) {
    const at = usable.filter((p) => chainMatches(opts.shop!, p) && p.date && daysBetween(p.date, opts.today) >= 0 && daysBetween(p.date, opts.today) <= SHOP_DAYS)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    if (at.length) return { source: 'open', price: at[0].price, amount_g: at[0].amount_g, shop: opts.shop, date: at[0].date, count: at.length, how: 'shop' }
  }
  return middleOf(usable, opts.today)
}

/** What a row says (PRICE-03): the cost of the amount on the list when it
 *  can be worked out, else the price as known ("€2.49/kg"); "≈ " in front
 *  of a shared one. `cost` is what the trip's total adds up. */
export function rowPrice(item: Pick<ListItem, 'grams' | 'pieces' | 'line'>, shown: ShownPrice | null, currency: string, perMl = false): { text: string; cost: number | null } | null {
  if (!shown) return null
  const cost = itemCost(item, shown)
  const mark = shown.source === 'open' ? '≈ ' : ''
  if (cost !== null) return { text: `${mark}${formatMoney(cost, currency)}`, cost }
  const k = perKilo(shown)
  return { text: `${mark}${formatMoney(k ?? shown.price, currency)}${k !== null ? (perMl ? '/l' : '/kg') : ''}`, cost: null }
}

/** The trip's figures: how many to get, what the priced ones come to, and
 *  how many have no price. */
export function listTotal(items: Pick<ListItem, 'grams' | 'pieces' | 'line' | 'key'>[], costOf: (key: string) => number | null): { count: number; total: number; priced: number; unpriced: number } {
  let total = 0
  let priced = 0
  for (const i of items) {
    const c = costOf(i.key)
    if (c === null) continue
    total += c
    priced++
  }
  return { count: items.length, total: Math.round(total * 100) / 100, priced, unpriced: items.length - priced }
}

/** The list's one summary line: "5 to get · €12.40 + 2 unpriced". With no
 *  price known it is just the count; the total never pretends to be whole. */
export function summaryText(t: { count: number; total: number; priced: number; unpriced: number }, currency: string): string {
  const head = `${t.count} to get`
  if (!t.priced) return head
  return `${head} · ${formatMoney(t.total, currency)}${t.unpriced ? ` + ${t.unpriced} unpriced` : ''}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-08-12" → "12 Aug 2026". */
export function dayText(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m || +m[2] < 1 || +m[2] > 12) return ''
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`
}

/** A size in grams, or in millilitres for a drink: "500 g", "1 kg", "750 ml", "1 l". */
export function sizeText(amountG: number, perMl = false): string {
  const g = gramsLabel(amountG)
  return perMl ? g.replace(' kg', ' l').replace(' g', ' ml') : g
}

/** What a price is for: "for 500 g", "a kg", "each". */
export function basisText(amountG: number | null, perMl = false): string {
  if (!amountG) return 'each'
  if (amountG === 1000) return perMl ? 'a litre' : 'a kg'
  return `for ${sizeText(amountG, perMl)}`
}

/** The price detail's line (PRICE-03): where the figure comes from. */
export function detailText(shown: ShownPrice, currency: string, perMl = false): string {
  const price = `${shown.source === 'open' ? '≈ ' : ''}${formatMoney(shown.price, currency)} ${basisText(shown.amount_g, perMl)}`
  const day = dayText(shown.date)
  if (shown.source === 'own') return `${price} at ${shown.shop}${day ? `, noted ${day}` : ''}`
  const reports = `${shown.count} ${shown.count === 1 ? 'report' : 'reports'}`
  if (shown.how === 'shop') return `${price} at ${shown.shop} · ${reports}${day ? `, latest ${day}` : ''}`
  return `${price} · middle of ${reports} in the last ${MEDIAN_DAYS} days${day ? `, latest ${day}` : ''}`
}

// ---- adding a price (PRICE-04) -----------------------------------------------------------------

/** A typed price for a pack (its size when known, else one of it) or for a
 *  kilo or litre. Null when it is not a price. */
export function readPriceInput(text: string, per: 'pack' | 'kg', packG: number | null): { price: number; amount_g: number | null } | null {
  const price = readPrice(text)
  if (price === null || price <= 0) return null
  return { price, amount_g: per === 'kg' ? 1000 : packG && packG > 0 ? packG : null }
}

/** The shop a new price is for: the list's shop filter, else the shop used
 *  last, else the first of the person's shops. */
export function priceShop(filter: string | null, last: string | null, shops: string[]): string | null {
  const known = (s: string | null) => (s ? shops.find((x) => sameShop(x, s)) ?? null : null)
  return known(filter) ?? known(last) ?? shops[0] ?? null
}

// ---- the cache on the device ---------------------------------------------------------------

export interface PriceCacheRow { code: string; fetched_at: string; prices: OpenPrice[] }

/** Is the device's copy of a product's prices recent enough? */
export const cacheFresh = (row: Pick<PriceCacheRow, 'fetched_at'> | undefined, now: number) =>
  !!row && now - Date.parse(row.fetched_at) < CACHE_DAYS * 86_400_000 && Date.parse(row.fetched_at) <= now + 60_000

/** Which barcodes to ask about now: the ones with no copy or an old one,
 *  never more than ASK_AT_ONCE, each once. */
export function codesToAsk(codes: (string | null | undefined)[], cached: (PriceCacheRow | undefined)[], now: number): string[] {
  const have = new Map(cached.filter((r): r is PriceCacheRow => !!r).map((r) => [r.code, r]))
  const out: string[] = []
  for (const c of codes) {
    if (!c || !/^\d{8,14}$/.test(c) || out.includes(c)) continue
    if (cacheFresh(have.get(c), now)) continue
    out.push(c)
    if (out.length >= ASK_AT_ONCE) break
  }
  return out
}
