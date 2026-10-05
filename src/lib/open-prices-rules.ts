/** Sharing a price with Open Prices (v18, PRICE-05): the pure rules. Which
 *  of the household's own prices can be shared, what is sent (the photo's
 *  fields, then the price), where the shop is (Open Prices' own places
 *  first, OpenStreetMap's search when it is not there), what an answer
 *  means, and how big the photo is once made smaller on the device.
 *
 *  Sharing is opt-in, per price, and only ever on the person's own tap:
 *  nothing here sends anything. The sending is in open-prices-share.ts and
 *  the account in open-prices-account.ts. Checked in plain Node with made-up
 *  answers: src/test/openprices.check.mjs. */

import { OPEN_PRICES, OPEN_PRICES_AGENT } from './price-rules.ts'
import { fold } from './search-rules.ts'

/** Open Prices' API, run by Open Food Facts. */
export const OPEN_PRICES_API = `${OPEN_PRICES}/api/v1`
/** OpenStreetMap's place search, used within its usage policy: one request
 *  per search the person starts, at most one a second, naming the app,
 *  never while typing and never in bulk. */
export const NOMINATIM = 'https://nominatim.openstreetmap.org'
/** How Visuma names itself on the requests that write, as Open Prices asks
 *  (it records the app with each price) and as OpenStreetMap's policy asks. */
export const APP_NAME = 'Visuma'
export const APP_VERSION = '18'
export const SHARE_AGENT = OPEN_PRICES_AGENT
/** Where a person makes an Open Food Facts account (the same one signs in
 *  to Open Prices). */
export const OFF_SIGN_UP = 'https://world.openfoodfacts.org/cgi/user.pl'
/** The credit OpenStreetMap's licence asks for wherever its places show. */
export const OSM_ATTRIBUTION = 'Shop places © OpenStreetMap contributors, ODbL'

/** The longest side of a photo once made smaller: enough to read a price
 *  tag or a receipt, a few hundred kilobytes to send. */
export const PHOTO_MAX_PX = 1600
export const PHOTO_QUALITY = 0.82
/** A receipt sent for one price can carry the next prices of the same trip
 *  (same shop, same day) for this long. */
export const PROOF_REUSE_HOURS = 12

// ---- the query string that names the app ---------------------------------------------------

/** Open Prices reads the app's name from the query string of a write. */
export function appQuery(platform: 'android' | 'ios' | 'web'): string {
  return `app_name=${APP_NAME}&app_version=${APP_VERSION}&app_platform=${platform}`
}

// ---- signing in ---------------------------------------------------------------------------

/** The sign-in form's body: the Open Food Facts user name (not the email)
 *  and password, sent once, to Open Prices' own sign-in, never stored. */
export function authBody(user: string, password: string): string {
  return new URLSearchParams({ username: user.trim(), password }).toString()
}

/** A user name as Open Food Facts makes them: letters, digits and dashes.
 *  An email typed instead is caught here, before anything is sent. */
export function readUserName(text: string): { user: string } | { error: string } {
  const t = String(text ?? '').trim()
  if (!t) return { error: 'Type your Open Food Facts user name.' }
  if (t.includes('@')) return { error: 'Use your Open Food Facts user name, not your email.' }
  if (!/^[a-z0-9][a-z0-9_.-]{0,59}$/i.test(t)) return { error: 'That is not an Open Food Facts user name.' }
  return { user: t }
}

/** The sign-in's answer: the token and who it is for, or null. */
export function readAuth(json: unknown): { token: string; user: string } | null {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const token = typeof j.access_token === 'string' ? j.access_token.trim() : ''
  const user = typeof j.user_id === 'string' ? j.user_id.trim() : ''
  if (!token || token.length > 4000 || !user) return null
  return { token, user }
}

// ---- which prices can be shared ---------------------------------------------------------------

export interface SharablePrice {
  price: number
  /** What the price is for in grams: the pack, 1000 for a kilo, none for one of it. */
  amount_g: number | null
  noted_on: string
  shop: string
}

/** Can this own price be shared? Open Prices takes a product's price for one
 *  of it, found by its barcode: a price per kilo of a packed product, or a
 *  price for something with no barcode, is not something it can hold. */
export function canShare(p: SharablePrice, code: string | null | undefined, packG: number | null, today: string): { ok: true } | { ok: false; why: string } {
  if (!code || !/^\d{8,14}$/.test(code)) return { ok: false, why: 'Only a product with a barcode can be shared.' }
  const price = Number(p.price)
  if (!Number.isFinite(price) || price <= 0 || price >= 10_000) return { ok: false, why: 'That price cannot be shared.' }
  const amount = p.amount_g === null || p.amount_g === undefined ? null : Number(p.amount_g)
  const perPack = amount === null || (packG !== null && packG > 0 && Math.abs(amount - packG) < 0.5)
  if (!perPack) return { ok: false, why: 'Only the price of one pack can be shared.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.noted_on) || p.noted_on > today) return { ok: false, why: 'The price needs the day it was seen.' }
  return { ok: true }
}

// ---- the shop's place ----------------------------------------------------------------------

export type OsmType = 'NODE' | 'WAY' | 'RELATION'

/** A shop on the map: the place a shared price is for. */
export interface ShopPlace {
  osm_id: number
  osm_type: OsmType
  name: string
  /** Street and town, as one line, when known. */
  address: string
  /** Where it was found: Open Prices' own places, or OpenStreetMap's search. */
  from: 'open-prices' | 'osm'
  /** How many prices Open Prices has from it (its own places only). */
  prices?: number
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const osmType = (v: unknown): OsmType | null => {
  const t = str(v).toUpperCase()
  return t === 'NODE' || t === 'WAY' || t === 'RELATION' ? t : null
}
const osmId = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
const joinAddress = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(', ').slice(0, 160)

/** Open Prices' places by name and town: the shops people already shared
 *  prices from. Its own search, so most shops never reach OpenStreetMap. */
export function placesUrl(name: string, town: string): string {
  const q = new URLSearchParams({ type: 'OSM', osm_name__like: name.trim().slice(0, 80), size: '20', order_by: '-price_count' })
  if (town.trim()) q.set('osm_address_city__like', town.trim().slice(0, 80))
  return `${OPEN_PRICES_API}/locations?${q}`
}

/** Open Prices' answer, as places. */
export function readPlaces(json: unknown): ShopPlace[] {
  const items = (json && typeof json === 'object' && Array.isArray((json as Record<string, unknown>).items) ? (json as Record<string, unknown>).items : []) as Record<string, unknown>[]
  const out: ShopPlace[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object' || (it.type && it.type !== 'OSM')) continue
    const id = osmId(it.osm_id)
    const type = osmType(it.osm_type)
    const name = str(it.osm_name) || str(it.osm_brand)
    if (!id || !type || !name) continue
    const street = streetFrom(str(it.osm_display_name), str(it.osm_address_city)) || str(it.osm_address_postcode)
    out.push({
      osm_id: id, osm_type: type, name: name.slice(0, 80),
      address: joinAddress(street, str(it.osm_address_city)),
      from: 'open-prices', prices: typeof it.price_count === 'number' ? it.price_count : undefined,
    })
  }
  return dedupe(out).slice(0, 20)
}

/** The street from OpenStreetMap's long name of a place ("Albert Heijn,
 *  12, Kerkstraat, Reuver, Beesel, …" is "Kerkstraat 12"): what tells two
 *  branches of a chain in one town apart. */
export function streetFrom(display: string, town: string): string {
  const parts = display.split(',').map((p) => p.trim()).filter(Boolean)
  const end = town ? parts.findIndex((p, i) => i > 0 && fold(p) === fold(town)) : -1
  const mid = parts.slice(1, end > 0 ? end : 3)
  if (mid.length >= 2 && /^\d+[a-z]?(-\d+)?$/i.test(mid[0])) return `${mid[1]} ${mid[0]}`
  return mid[0] ?? ''
}

/** OpenStreetMap's search for a shop by name in a town, in the person's
 *  country. One request, only when the person asks for it. */
export function nominatimUrl(name: string, town: string, country: string | null): string {
  const q = new URLSearchParams({
    q: [name.trim(), town.trim()].filter(Boolean).join(', ').slice(0, 160),
    format: 'jsonv2', addressdetails: '1', limit: '10', layer: 'poi',
  })
  if (country && /^[a-z]{2}$/i.test(country)) q.set('countrycodes', country.toLowerCase())
  return `${NOMINATIM}/search?${q}`
}

/** OpenStreetMap's answer, as places: shops only (and markets), not
 *  streets or towns of the same name. */
export function readNominatim(json: unknown): ShopPlace[] {
  const items = (Array.isArray(json) ? json : []) as Record<string, unknown>[]
  const out: ShopPlace[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const category = str(it.category) || str(it.class)
    const kind = str(it.type)
    if (category !== 'shop' && !(category === 'amenity' && kind === 'marketplace')) continue
    const id = osmId(it.osm_id)
    const type = osmType(it.osm_type)
    const a = (it.address && typeof it.address === 'object' ? it.address : {}) as Record<string, unknown>
    const name = str(it.name) || str(it.display_name).split(',')[0]
    if (!id || !type || !name) continue
    const street = [str(a.road), str(a.house_number)].filter(Boolean).join(' ')
    const town = str(a.city) || str(a.town) || str(a.village) || str(a.municipality)
    out.push({ osm_id: id, osm_type: type, name: name.slice(0, 80), address: joinAddress(street, town), from: 'osm' })
  }
  return dedupe(out).slice(0, 10)
}

function dedupe(places: ShopPlace[]): ShopPlace[] {
  const seen = new Set<string>()
  return places.filter((p) => {
    const k = placeKey(p)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** One place's key: "NODE/123". */
export const placeKey = (p: Pick<ShopPlace, 'osm_type' | 'osm_id'>) => `${p.osm_type}/${p.osm_id}`

/** A place as one line: "Albert Heijn · Markt 5, Reuver". */
export const placeLine = (p: Pick<ShopPlace, 'name' | 'address'>) => (p.address ? `${p.name} · ${p.address}` : p.name)

/** The key under which the place picked for one of the person's shops is
 *  remembered on this device, so the next share starts from it. */
export const placeMemoryKey = (shop: string) => `openprices:place:${fold(shop).replace(/\s+/g, ' ').trim()}`

/** Is a remembered place still a place? (What the device kept may be old.) */
export function readPlace(v: unknown): ShopPlace | null {
  const p = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null
  if (!p) return null
  const id = osmId(p.osm_id)
  const type = osmType(p.osm_type)
  const name = str(p.name)
  if (!id || !type || !name) return null
  return { osm_id: id, osm_type: type, name: name.slice(0, 80), address: str(p.address).slice(0, 160), from: p.from === 'osm' ? 'osm' : 'open-prices' }
}

// ---- what is sent -------------------------------------------------------------------------

export type ProofType = 'PRICE_TAG' | 'RECEIPT'

/** The fields sent with the photo (it goes first: a price must name its
 *  photo). The photo itself is the file; nothing else about the person. */
export function proofFields(opts: { type: ProofType; place: Pick<ShopPlace, 'osm_id' | 'osm_type'>; date: string; currency: string }): Record<string, string> {
  return {
    type: opts.type,
    location_osm_id: String(opts.place.osm_id),
    location_osm_type: opts.place.osm_type,
    date: opts.date,
    currency: opts.currency.toUpperCase(),
  }
}

/** The price as Open Prices takes it. An offer's normal price goes with it
 *  only when it is higher than the offer. */
export interface PricePayload {
  type: 'PRODUCT'
  product_code: string
  price: number
  currency: string
  date: string
  location_osm_id: number
  location_osm_type: OsmType
  proof_id: number
  price_is_discounted: boolean
  price_without_discount?: number
}

export function pricePayload(opts: {
  code: string; price: number; currency: string; date: string; place: Pick<ShopPlace, 'osm_id' | 'osm_type'>; proofId: number
  discounted?: boolean; normalPrice?: number | null
}): PricePayload | null {
  if (!/^\d{8,14}$/.test(opts.code)) return null
  const price = Math.round(Number(opts.price) * 100) / 100
  if (!Number.isFinite(price) || price <= 0 || price >= 10_000) return null
  if (!/^[A-Z]{3}$/.test(opts.currency.toUpperCase()) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) return null
  if (!Number.isSafeInteger(opts.proofId) || opts.proofId <= 0 || !osmId(opts.place.osm_id) || !osmType(opts.place.osm_type)) return null
  const out: PricePayload = {
    type: 'PRODUCT', product_code: opts.code, price, currency: opts.currency.toUpperCase(), date: opts.date,
    location_osm_id: opts.place.osm_id, location_osm_type: opts.place.osm_type, proof_id: opts.proofId,
    price_is_discounted: !!opts.discounted,
  }
  const normal = opts.normalPrice === null || opts.normalPrice === undefined ? null : Math.round(Number(opts.normalPrice) * 100) / 100
  if (opts.discounted && normal !== null && Number.isFinite(normal) && normal > price && normal < 10_000) out.price_without_discount = normal
  return out
}

/** The id in an answer to the photo or the price. */
export function readId(json: unknown): number | null {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  return osmId(j.id)
}

/** The page of a shared price on Open Prices. */
export const sharedPriceUrl = (id: number) => `${OPEN_PRICES}/prices/${id}`

/** A photo sent earlier on this device, for the next price of the same trip. */
export interface LastProof { id: number; place: string; date: string; type: ProofType; at: string }

/** May the photo sent before carry this price too? The same shop, the same
 *  day, a receipt, and not long ago. */
export function reusableProof(last: LastProof | null | undefined, place: Pick<ShopPlace, 'osm_id' | 'osm_type'> | null, date: string, now: number): LastProof | null {
  if (!last || !place || last.type !== 'RECEIPT') return null
  if (last.place !== placeKey(place) || last.date !== date) return null
  const age = now - Date.parse(last.at)
  return Number.isFinite(age) && age >= 0 && age <= PROOF_REUSE_HOURS * 3_600_000 ? last : null
}

// ---- what went wrong -----------------------------------------------------------------------

export type Problem = { kind: 'signed-out' | 'offline' | 'busy' | 'refused' | 'down'; text: string }

/** An answer that is not a success, in words. A refusal says what Open
 *  Prices said, when it said something short and readable. */
export function readProblem(status: number, json: unknown): Problem {
  if (status === 0) return { kind: 'offline', text: 'No connection. Try again when you are online.' }
  if (status === 401 || status === 403) return { kind: 'signed-out', text: 'Open Food Facts did not accept the sign-in. Sign in again in Settings.' }
  if (status === 413) return { kind: 'refused', text: 'The photo is too large. Try another one.' }
  if (status === 429) return { kind: 'busy', text: 'Open Prices is busy. Try again in a minute.' }
  if (status >= 500) return { kind: 'down', text: 'Open Prices is not answering. Try again later.' }
  const said = firstMessage(json)
  return { kind: 'refused', text: said ? `Open Prices said: ${said}` : 'Open Prices did not take it.' }
}

/** The first message in an error answer: {"detail": "…"}, {"price": ["…"]}. */
function firstMessage(json: unknown, depth = 0): string | null {
  if (depth > 3 || json === null || json === undefined) return null
  if (typeof json === 'string') {
    const t = json.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return t && t.length <= 160 ? t : null
  }
  if (Array.isArray(json)) {
    for (const v of json) { const m = firstMessage(v, depth + 1); if (m) return m }
    return null
  }
  if (typeof json === 'object') {
    const j = json as Record<string, unknown>
    for (const k of ['detail', 'message', 'error', 'non_field_errors']) { const m = firstMessage(j[k], depth + 1); if (m) return m }
    for (const [k, v] of Object.entries(j)) { const m = firstMessage(v, depth + 1); if (m) return `${k.replace(/_/g, ' ')}: ${m}` }
  }
  return null
}

/** A sign-in that did not work, in words. */
export function authProblem(status: number): string {
  if (status === 0) return 'No connection. Try again when you are online.'
  if (status === 400 || status === 401 || status === 403) return 'That user name and password did not work.'
  if (status === 429) return 'Too many tries. Wait a minute.'
  return 'Open Food Facts is not answering. Try again later.'
}

// ---- the photo ---------------------------------------------------------------------------

/** The photo's size once made smaller: the longest side at most `max`,
 *  never made larger, the proportions kept. */
export function fitPhoto(w: number, h: number, max = PHOTO_MAX_PX): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 }
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}
