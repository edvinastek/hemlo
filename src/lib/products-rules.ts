/** Pure rules for supermarket products from Open Food Facts: checking a
 *  barcode, reading a product (from a barcode lookup or either search) into
 *  the figures GetIt keeps for a food, tidying shop names, showing shared
 *  prices, and the small limiter and cache that keep GetIt within what Open
 *  Food Facts allows. No network, no database and no React, so every rule is
 *  checked by hand in src/test/products.check.mjs. The network side is
 *  products.ts. */

import { countryName } from './countries.ts'
import { toGrams, tidy, MAX_GRAMS } from './stock-rules.ts'
import { parseServing, readUnits, type FoodUnit } from './units-rules.ts'
import { uuidV5 } from './sync-rules.ts'
import type { Food } from './types'

// ---- barcodes ----------------------------------------------------------------

/** The last digit of every EAN and UPC barcode checks the others: weights 3
 *  and 1 alternate from the right, and the total must reach a round ten. */
export function checkDigit(body: string): number {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48
    sum += d * (i % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10
}

const checks = (code: string) => checkDigit(code.slice(0, -1)) === Number(code[code.length - 1])

/** A short UPC-E code (on small American packs) written out as the full
 *  12-digit UPC-A it stands for, or null when it is not one. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null
  const s = code[0]
  const d = code.slice(1, 7)
  const c = code[7]
  const last = Number(d[5])
  let body: string
  if (last <= 2) body = `${d[0]}${d[1]}${d[5]}0000${d[2]}${d[3]}${d[4]}`
  else if (last === 3) body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`
  else if (last === 4) body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`
  else body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${d[5]}`
  const full = `${s}${body}${c}`
  return checks(full) ? full : null
}

/** A barcode as GetIt stores it, or null when it is not a real one. Spaces
 *  and dashes typed with it are dropped. The check digit must match, so a
 *  misread or mistyped digit is caught here rather than looked up.
 *
 *  One spelling per product, the one Open Food Facts uses: EAN-8 as it is,
 *  UPC-A (12 digits) and UPC-E with a leading 0 as 13 digits, a 14-digit
 *  code that starts with 0 as its 13 digits. `format` is what a scanner said
 *  it read; typed digits leave it out. */
export function normaliseBarcode(text: string | null | undefined, format?: string): string | null {
  const digits = String(text ?? '').replace(/[\s-]/g, '')
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return null
  if (/^0+$/.test(digits)) return null
  if (digits.length === 8) {
    // Eight digits are an EAN-8, unless the scanner said UPC-E or only the
    // UPC-E reading checks out.
    const upc = expandUpcE(digits)
    if (format === 'UPC_E' && upc) return `0${upc}`
    if (checks(digits)) return digits
    return upc ? `0${upc}` : null
  }
  if (!checks(digits)) return null
  if (digits.length === 12) return `0${digits}`
  if (digits.length === 14 && digits[0] === '0') return digits.slice(1)
  return digits
}

/** Shops print their own labels for things weighed at the counter, starting
 *  with 2. Some of their own brands use 2 as well, so this only explains a
 *  miss; it never stops a lookup. */
export const maybeShopLabel = (code: string) => code.length === 13 && code[0] === '2'

// ---- countries and languages -----------------------------------------------

/** Open Food Facts names a few countries differently from the list GetIt keeps. */
const OFF_COUNTRY: Record<string, string> = {
  CZ: 'czech-republic', TR: 'turkey', RU: 'russia', KR: 'south-korea', VN: 'vietnam', IR: 'iran',
  SY: 'syria', LA: 'laos', MD: 'moldova', BO: 'bolivia', VE: 'venezuela', TZ: 'tanzania', MK: 'north-macedonia',
  CI: 'cote-d-ivoire', CD: 'democratic-republic-of-the-congo', CG: 'republic-of-the-congo', US: 'united-states',
  GB: 'united-kingdom', PS: 'state-of-palestine', TW: 'taiwan', BN: 'brunei', FM: 'micronesia',
}

/** The profile's country as Open Food Facts tags it: "NL" → "en:netherlands".
 *  No country, or one it would not know, falls back to the Netherlands. */
export function offCountry(code: string | null | undefined): string {
  const c = (code ?? '').toUpperCase()
  if (OFF_COUNTRY[c]) return `en:${OFF_COUNTRY[c]}`
  const name = countryName(c)
  if (!name) return 'en:netherlands'
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `en:${slug}`
}

const LANG: Record<string, string> = {
  NL: 'nl', BE: 'nl', DE: 'de', AT: 'de', CH: 'de', LU: 'fr', FR: 'fr', LT: 'lt', LV: 'lv', EE: 'et', PL: 'pl',
  ES: 'es', IT: 'it', PT: 'pt', DK: 'da', SE: 'sv', FI: 'fi', CZ: 'cs', SK: 'sk', HU: 'hu', RO: 'ro', GR: 'el',
}
/** The language product names are wanted in: the country's own, else English. */
export const offLang = (code: string | null | undefined) => LANG[(code ?? '').toUpperCase()] ?? 'en'

// ---- search ----------------------------------------------------------------

export const QUERY_MAX = 80

/** What a person typed, ready to send: spaces tidied, the characters the
 *  search reads as commands dropped, at most 80 characters. Empty when fewer
 *  than two letters are left, which would match half the database. */
export function cleanQuery(text: string): string {
  const q = String(text ?? '').replace(/[:"()[\]{}^~*?\\/!+&|<>=]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX).trim()
  return q.replace(/\s/g, '').length >= 2 ? q : ''
}

/** Asked of a product, from a lookup or a search. */
export const PRODUCT_FIELDS = [
  'code', 'product_name', 'brands', 'quantity', 'product_quantity', 'product_quantity_unit', 'nutriments',
  'stores', 'stores_tags', 'countries_tags', 'image_front_small_url', 'categories_tags', 'serving_size', 'serving_quantity',
  'nutrition_data_per', 'nutriscore_grade', 'nutrition_grades',
]
export const fieldsFor = (lang: string) =>
  [...PRODUCT_FIELDS, 'product_name_nl', ...(lang !== 'nl' && lang !== 'en' ? [`product_name_${lang}`] : []), 'product_name_en'].join(',')

export type Engine = 'search' | 'legacy'
export const OFF = 'https://world.openfoodfacts.org'
export const SEARCH = 'https://search.openfoodfacts.org'
export const PRICES = 'https://prices.openfoodfacts.org'
export const PAGE_SIZE = 20

/** How the Android app names itself to Open Food Facts (PROD-04), as they
 *  ask: the app and its version, and how to reach whoever runs it. A browser
 *  may not set this header; there the app_name in the address says it. */
export const USER_AGENT = 'GetIt/16 (contact via app)'

/** Every request says which app is asking, as Open Food Facts asks. */
const who = (version: string) => `app_name=GetIt&app_version=${encodeURIComponent(version)}`

/** A search, on one of the two search services Open Food Facts runs.
 *  'search' is the newer one (search.openfoodfacts.org): quick and reliable,
 *  but it only answers the Android app, because a browser is refused by its
 *  cross-site rules. 'legacy' is the older full-text search on the main
 *  site, which browsers may call; it is sometimes too busy to answer. */
export function searchUrl(engine: Engine, query: string, country: string, lang: string, version: string): string {
  const fields = encodeURIComponent(fieldsFor(lang))
  if (engine === 'search') {
    const q = encodeURIComponent(`${query} countries_tags:"${country}"`)
    const langs = encodeURIComponent(lang === 'en' ? 'en' : `${lang},en`)
    return `${SEARCH}/search?q=${q}&langs=${langs}&page_size=${PAGE_SIZE}&fields=${fields}&${who(version)}`
  }
  const tag = encodeURIComponent(country.replace(/^en:/, ''))
  return `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1`
    + `&page_size=${PAGE_SIZE}&fields=${fields}&tagtype_0=countries&tag_contains_0=contains&tag_0=${tag}&${who(version)}`
}

/** One product by its barcode, on the current product API (v3; v2 is
 *  deprecated). A missing product answers 404 with status "failure". */
export const productUrl = (code: string, lang: string, version: string) =>
  `${OFF}/api/v3/product/${code}?fields=${encodeURIComponent(fieldsFor(lang))}&${who(version)}`

/** Whether a v3 (or v2) lookup answer holds a product. */
export function lookupFound(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false
  const j = json as Raw
  if (j.status === 0 || j.status === 'failure') return false
  return !!j.product && typeof j.product === 'object'
}
export const pricesUrl = (code: string) => `${PRICES}/api/v1/prices?product_code=${code}&order_by=-date&size=20`
/** Where the attribution links go: the product's own pages. */
export const productPage = (code: string) => `${OFF}/product/${code}`
export const pricesPage = (code: string) => `${PRICES}/products/${code}`

// ---- reading a product -------------------------------------------------------

/** Figures per 100 g (or 100 ml), as GetIt keeps a food's. */
export interface Per100 { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null }

/** One product, read the same way whichever service it came from. */
export interface Product {
  code: string
  name: string | null
  brand: string | null
  /** As printed: "390 gram". */
  quantity: string | null
  /** The pack in grams (or millilitres), when it is known. */
  pack: number | null
  packUnit: 'g' | 'ml' | null
  stores: string[]
  per100: Per100
  image: string | null
  categories: string[]
  /** The serving the pack states, as a unit of the food: "1 bar (30 g)" is a
   *  bar of 30 g, "30 g" a portion. Only when the pack says one. */
  serving?: FoodUnit
  /** The rest of the EU label (PROD-03). */
  eu?: EuFields
  /** The figures are per 100 ml (a drink). */
  perMl?: boolean
  /** Nutri-Score, when there is one (PROD-06). */
  nutriScore?: NutriScore | null
}

type Raw = Record<string, unknown>
const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' ? String(v) : ''
  return s ? s : null
}
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(str).filter((s): s is string => !!s)

/** A figure per 100 g as stored: within what 100 g can hold, else unknown.
 *  More than 100 g of protein in 100 g is a typo in the source, not a food. */
function fig(v: unknown, max: number, places: number): number | null {
  const n = num(v)
  if (n === null || n < 0 || n > max) return null
  const f = 10 ** places
  return Math.round(n * f) / f
}

/** Calories per 100 g: kcal when given; else worked out from kJ (4.184 kJ to
 *  the kcal). Open Food Facts' plain "energy" is always kJ. */
export function kcalOf(n: Raw): number | null {
  const kcal = num(n['energy-kcal_100g'])
  if (kcal !== null) return fig(kcal, 950, 0)
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g'])
  return kj === null ? null : fig(kj / 4.184, 950, 0)
}

/** The five figures GetIt counts with. The rest of the label is in euOf. */
export function per100Of(nutriments: unknown): Per100 {
  const n = (nutriments && typeof nutriments === 'object' ? nutriments : {}) as Raw
  return {
    kcal: kcalOf(n),
    protein_g: fig(n.proteins_100g, 100, 1),
    carbs_g: fig(n.carbohydrates_100g, 100, 1),
    fat_g: fig(n.fat_100g, 100, 1),
    // Open Food Facts spells it "fiber"; older entries have other spellings.
    fiber_g: fig(n.fiber_100g ?? n.fibre_100g ?? n.fibers_100g, 100, 1),
  }
}

/** The rest of the EU label (Regulation 1169/2011, Annex XV), per 100 g or
 *  100 ml, as food rows keep it (026). Unknown stays null, never 0. */
export interface EuFields {
  kj: number | null
  sat_fat_g: number | null
  mufa_g: number | null
  pufa_g: number | null
  sugars_g: number | null
  polyols_g: number | null
  starch_g: number | null
  salt_g: number | null
  alcohol_g: number | null
}

/** Alcohol is given as % by volume on a drink; the label's grams are the
 *  volume times ethanol's density (0.789 g/ml). */
const ETHANOL = 0.789

/** Every other figure of the EU label a product has (PROD-03). kJ when
 *  given, else worked out from kcal (4.184 kJ to the kcal); salt when given,
 *  else sodium × 2.5. */
export function euOf(nutriments: unknown): EuFields {
  const n = (nutriments && typeof nutriments === 'object' ? nutriments : {}) as Raw
  const kjGiven = num(n['energy-kj_100g']) ?? num(n['energy_100g'])
  const kcal = num(n['energy-kcal_100g'])
  const kj = kjGiven !== null ? fig(kjGiven, 4000, 0) : kcal !== null ? fig(kcal * 4.184, 4000, 0) : null
  const sodium = num(n.sodium_100g)
  const salt = n.salt_100g !== undefined && n.salt_100g !== '' ? fig(n.salt_100g, 100, 2) : sodium !== null ? fig(sodium * 2.5, 100, 2) : null
  const alcoholRaw = num(n.alcohol_100g)
  const alcoholUnit = str(n.alcohol_unit)?.toLowerCase() ?? '% vol'
  const alcohol = alcoholRaw === null ? null : fig(alcoholUnit === 'g' ? alcoholRaw : alcoholRaw * ETHANOL, 100, 1)
  return {
    kj,
    sat_fat_g: fig(n['saturated-fat_100g'], 100, 1),
    mufa_g: fig(n['monounsaturated-fat_100g'], 100, 1),
    pufa_g: fig(n['polyunsaturated-fat_100g'], 100, 1),
    sugars_g: fig(n.sugars_100g, 100, 1),
    polyols_g: fig(n.polyols_100g, 100, 1),
    starch_g: fig(n.starch_100g, 100, 1),
    salt_g: salt,
    alcohol_g: alcohol,
  }
}

export type NutriScore = 'a' | 'b' | 'c' | 'd' | 'e'
/** Nutri-Score (PROD-06), when Open Food Facts has worked it out. */
export function nutriScoreOf(p: Raw): NutriScore | null {
  const g = (str(p.nutriscore_grade) ?? str(p.nutrition_grades))?.toLowerCase()
  return g && /^[a-e]$/.test(g) ? (g as NutriScore) : null
}

/** One line of the nutrition table as an EU label sets it out. */
export interface LabelRow { key: string; label: string; value: string; sub: boolean }

/** The product's nutrition table in the order of the EU label (Annex XV):
 *  energy, fat, of which saturates (mono-, polyunsaturates), carbohydrate,
 *  of which sugars (polyols, starch), fibre, protein, salt (alcohol). The
 *  seven a label must have always show, a dash when unknown; the optional
 *  ones only when the pack gives them. */
export function labelRows(p: Pick<Product, 'per100' | 'eu'>): LabelRow[] {
  const eu = p.eu ?? euOf(undefined)
  const g = (v: number | null) => (v === null ? '–' : `${v} g`)
  const energy = [eu.kj !== null ? `${eu.kj} kJ` : null, p.per100.kcal !== null ? `${p.per100.kcal} kcal` : null].filter(Boolean).join(' / ') || '–'
  const rows: (LabelRow | null)[] = [
    { key: 'energy', label: 'Energy', value: energy, sub: false },
    { key: 'fat', label: 'Fat', value: g(p.per100.fat_g), sub: false },
    { key: 'sat', label: 'of which saturates', value: g(eu.sat_fat_g), sub: true },
    eu.mufa_g !== null ? { key: 'mufa', label: 'mono-unsaturates', value: g(eu.mufa_g), sub: true } : null,
    eu.pufa_g !== null ? { key: 'pufa', label: 'polyunsaturates', value: g(eu.pufa_g), sub: true } : null,
    { key: 'carbs', label: 'Carbohydrate', value: g(p.per100.carbs_g), sub: false },
    { key: 'sugars', label: 'of which sugars', value: g(eu.sugars_g), sub: true },
    eu.polyols_g !== null ? { key: 'polyols', label: 'polyols', value: g(eu.polyols_g), sub: true } : null,
    eu.starch_g !== null ? { key: 'starch', label: 'starch', value: g(eu.starch_g), sub: true } : null,
    { key: 'fibre', label: 'Fibre', value: g(p.per100.fiber_g), sub: false },
    { key: 'protein', label: 'Protein', value: g(p.per100.protein_g), sub: false },
    { key: 'salt', label: 'Salt', value: g(eu.salt_g), sub: false },
    eu.alcohol_g !== null ? { key: 'alcohol', label: 'Alcohol', value: g(eu.alcohol_g), sub: false } : null,
  ]
  return rows.filter((r): r is LabelRow => !!r)
}

const UNITS: Record<string, { by: number; unit: 'g' | 'ml' }> = {
  g: { by: 1, unit: 'g' }, gr: { by: 1, unit: 'g' }, gram: { by: 1, unit: 'g' }, grams: { by: 1, unit: 'g' }, grammes: { by: 1, unit: 'g' },
  kg: { by: 1000, unit: 'g' }, kilo: { by: 1000, unit: 'g' }, kilogram: { by: 1000, unit: 'g' },
  ml: { by: 1, unit: 'ml' }, cl: { by: 10, unit: 'ml' }, dl: { by: 100, unit: 'ml' },
  l: { by: 1000, unit: 'ml' }, ltr: { by: 1000, unit: 'ml' }, liter: { by: 1000, unit: 'ml' }, litre: { by: 1000, unit: 'ml' },
}
const AMOUNT = String.raw`(\d+(?:[.,]\d+)?)\s*(kg|kilogram|kilo|grammes|grams|gram|gr|g|ml|cl|dl|ltr|liter|litre|l)\b`

/** The pack as printed ("390 gram", "1,5 l", "6 x 50 g") in grams or
 *  millilitres, or null when it is not a weight or a volume ("12 eggs"). */
export function readQuantity(text: string | null | undefined): { amount: number; unit: 'g' | 'ml' } | null {
  const t = String(text ?? '').toLowerCase()
  const multi = new RegExp(String.raw`(\d+)\s*[x×]\s*` + AMOUNT).exec(t)
  const single = multi ? null : new RegExp(AMOUNT).exec(t)
  const m = multi ?? single
  if (!m) return null
  const count = multi ? Number(multi[1]) : 1
  const value = Number((multi ? multi[2] : m[1]).replace(',', '.'))
  const u = UNITS[multi ? multi[3] : m[2]]
  const amount = tidy(count * value * u.by)
  return amount > 0 && amount <= MAX_GRAMS ? { amount, unit: u.unit } : null
}

/** The pack size: Open Food Facts' own worked-out figure when it is in g or
 *  ml, else read from the printed quantity. */
export function packOf(p: Raw): { amount: number; unit: 'g' | 'ml' } | null {
  const q = num(p.product_quantity)
  const unit = str(p.product_quantity_unit)?.toLowerCase()
  if (q !== null && q > 0 && q <= MAX_GRAMS && (unit === 'g' || unit === 'ml')) return { amount: tidy(q), unit }
  if (q !== null && q > 0 && q <= MAX_GRAMS && !unit) {
    // An older entry: the number is grams or ml, the printed text says which.
    const read = readQuantity(str(p.quantity))
    if (read) return read
    return { amount: tidy(q), unit: 'g' }
  }
  return readQuantity(str(p.quantity))
}

/** Chains a shopper would look for, spelt as their signs spell them. Open
 *  Food Facts has them as typed by volunteers: "Ah", "albert-heijn", "AH". */
const STORE_NAMES: Record<string, string> = {
  ah: 'Albert Heijn', 'albert-heijn': 'Albert Heijn', 'ah-to-go': 'AH to go', jumbo: 'Jumbo', lidl: 'Lidl',
  aldi: 'Aldi', plus: 'Plus', dirk: 'Dirk', 'dirk-van-den-broek': 'Dirk', coop: 'Coop', spar: 'Spar',
  dekamarkt: 'DekaMarkt', 'deka-markt': 'DekaMarkt', hoogvliet: 'Hoogvliet', vomar: 'Vomar', poiesz: 'Poiesz',
  'jan-linders': 'Jan Linders', picnic: 'Picnic', ekoplaza: 'Ekoplaza', kruidvat: 'Kruidvat', etos: 'Etos',
  action: 'Action', c1000: 'C1000', emte: 'Emté', nettorama: 'Nettorama', boni: 'Boni', colruyt: 'Colruyt',
  delhaize: 'Delhaize', carrefour: 'Carrefour', 'carrefour-market': 'Carrefour Market', rewe: 'Rewe',
  edeka: 'Edeka', kaufland: 'Kaufland', penny: 'Penny', netto: 'Netto', dm: 'dm', rossmann: 'Rossmann',
  tesco: 'Tesco', 'sainsbury-s': 'Sainsbury’s', sainsburys: 'Sainsbury’s', asda: 'Asda', waitrose: 'Waitrose',
  'marks-spencer': 'M&S', morrisons: 'Morrisons', maxima: 'Maxima', iki: 'Iki', rimi: 'Rimi', norfa: 'Norfa',
  auchan: 'Auchan', intermarche: 'Intermarché', leclerc: 'E.Leclerc', 'e-leclerc': 'E.Leclerc', biedronka: 'Biedronka',
  'makro': 'Makro', 'sligro': 'Sligro', 'hanos': 'Hanos', 'holland-barrett': 'Holland & Barrett',
}
const STORE_MAX = 20
const STORE_NAME_MAX = 40

/** A shop's name as a person would write it. Known chains get their own
 *  spelling; a tag like "dirk-van-den-broek" is a known one too; anything
 *  else keeps what was typed, or is given capitals when it was a tag. */
export function storeName(raw: string): string | null {
  const text = raw.replace(/^[a-z]{2}:/i, '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const key = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (STORE_NAMES[key]) return STORE_NAMES[key]
  const name = text === text.toLowerCase()
    ? text.replace(/[-_]+/g, ' ').replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
    : text
  return name.slice(0, STORE_NAME_MAX).trim() || null
}

/** Where a product is sold, tidied and without repeats, at most 20. */
export function storesOf(p: Raw): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of [...list(p.stores_tags), ...list(p.stores)]) {
    const name = storeName(raw)
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
    if (out.length >= STORE_MAX) break
  }
  return out
}

/** Only pictures from Open Food Facts' own image server, over https. */
export function safeImage(url: unknown): string | null {
  const u = str(url)
  return u && u.length <= 500 && /^https:\/\/(images|static)\.openfoodfacts\.org\//.test(u) ? u : null
}

export const NAME_MAX = 120
export const BRAND_MAX = 120

/** A product from any of the three answers (a lookup, either search), or
 *  null when it has no usable barcode. The name is the one in the country's
 *  language when there is one; the brand is kept apart from it. */
export function readProduct(raw: unknown, lang = 'nl'): Product | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Raw
  const code = normaliseBarcode(str(p.code))
  if (!code) return null
  const name = str(p[`product_name_${lang}`]) ?? str(p.product_name) ?? str(p.product_name_nl) ?? str(p.product_name_en)
  const pack = packOf(p)
  const serving = parseServing(p.serving_size, p.serving_quantity)
  const per = str(p.nutrition_data_per)?.toLowerCase()
  const perMl = per === '100ml' || (per !== '100g' && pack?.unit === 'ml')
  const nutriScore = nutriScoreOf(p)
  return {
    code,
    name: name ? name.slice(0, NAME_MAX).trim() : null,
    brand: list(p.brands)[0]?.slice(0, BRAND_MAX).trim() ?? null,
    quantity: str(p.quantity)?.slice(0, 60) ?? null,
    pack: pack?.amount ?? null,
    packUnit: pack?.unit ?? null,
    stores: storesOf(p),
    per100: per100Of(p.nutriments),
    image: safeImage(p.image_front_small_url),
    categories: list(p.categories_tags).map((c) => c.toLowerCase()).slice(0, 40),
    ...(serving ? { serving } : {}),
    eu: euOf(p.nutriments),
    perMl,
    nutriScore,
  }
}

/** A search's products, from either service. The newer one answers "hits",
 *  the older one "products". Repeats and products without a barcode go. */
export function readSearch(json: unknown, lang = 'nl'): Product[] {
  const j = (json && typeof json === 'object' ? json : {}) as Raw
  const rows = Array.isArray(j.hits) ? j.hits : Array.isArray(j.products) ? j.products : []
  const seen = new Set<string>()
  const out: Product[] = []
  for (const r of rows) {
    const p = readProduct(r, lang)
    if (!p || seen.has(p.code)) continue
    seen.add(p.code)
    out.push(p)
  }
  return out
}

/** The name to show: the product's, else its brand and barcode. */
export const displayName = (p: Pick<Product, 'name' | 'brand' | 'code'>) =>
  p.name ?? (p.brand ? `${p.brand} ${p.code}` : `Product ${p.code}`)

// ---- as a food ---------------------------------------------------------------

/** Which aisle, roughly, from the first category that says: used to group
 *  the Stock tab and the shopping trip. The first match in this order wins,
 *  so frozen peas are Frozen rather than Vegetables. */
const SECTIONS: [string, string][] = [
  ['en:frozen-foods', 'Frozen'], ['en:beverages', 'Drinks'], ['en:dairies', 'Dairy'], ['en:cheeses', 'Dairy'],
  ['en:eggs', 'Dairy'], ['en:breads', 'Bakery'], ['en:meats', 'Meat'], ['en:seafood', 'Fish'],
  ['en:fruits', 'Fruit and veg'], ['en:vegetables', 'Fruit and veg'], ['en:breakfast-cereals', 'Breakfast'],
  ['en:pastas', 'Pasta and rice'], ['en:rices', 'Pasta and rice'], ['en:spreads', 'Spreads'],
  ['en:bread-coverings', 'Spreads'], ['en:canned-foods', 'Tins and jars'], ['en:sauces', 'Sauces'],
  ['en:condiments', 'Sauces'], ['en:snacks', 'Snacks'], ['en:cereals-and-potatoes', 'Pasta and rice'],
]
export function sectionOf(categories: string[]): string | null {
  for (const [tag, section] of SECTIONS) if (categories.includes(tag)) return section
  return null
}

/** What a food's state is, as far as the pack says: frozen or tinned, else raw. */
export function stateOf(categories: string[]): Food['state'] {
  if (categories.includes('en:frozen-foods')) return 'frozen'
  if (categories.includes('en:canned-foods')) return 'canned'
  return 'raw'
}

/** The row a product becomes in the person's own foods. Figures are per 100 g
 *  as everywhere else in GetIt; the pack size makes the shopping list count
 *  packs; the barcode stops the same product being added twice. */
export function foodFields(p: Product, ownerId: string): Partial<Food> {
  return {
    owner_id: ownerId,
    name: displayName(p),
    brand: p.brand,
    ...p.per100,
    // The rest of the EU label, only the figures the pack has: unknown is
    // left out rather than sent as nothing (FOOD-02).
    ...Object.fromEntries(Object.entries(p.eu ?? {}).filter(([, v]) => v !== null)),
    per_ml: !!p.perMl,
    carb_basis: 'eu',
    state: stateOf(p.categories),
    cook_yield: null,
    pack_size_g: p.pack,
    store_section: sectionOf(p.categories),
    stores: p.stores,
    barcode: p.code,
    source: 'off',
    source_ref: p.code,
    image_url: p.image,
    // The pack's serving becomes the food's unit, so it can be counted in
    // it. Left out when there is none, so the row also saves on a server
    // without units yet (before 022).
    ...(p.serving ? { units: [p.serving] } : {}),
    deleted_at: null,
  }
}

/** GetIt's own namespace for product ids. Fixed for good: changing it would
 *  give every product a new id. */
export const PRODUCT_NAMESPACE = '8fc021ee-4147-4dc5-8664-850cbabd250d'

/** The id a person's food for this product always has: worked out from who
 *  they are and the barcode, not drawn at random. Two phones that scan the
 *  same pack before either has synced make the same row, so the second one
 *  simply updates it instead of being refused as a duplicate (which lost the
 *  stock and recipes that pointed at it). Null when it is not a barcode. */
export async function productFoodId(ownerId: string, barcode: string | null | undefined, salt?: string | null): Promise<string | null> {
  const code = normaliseBarcode(barcode)
  if (!code || !ownerId) return null
  // With the account's own secret mixed in, no one else can work the id out
  // (and so learn what was scanned, or take the id first).
  return uuidV5(salt ? `${ownerId.toLowerCase()}:${salt}:${code}` : `${ownerId.toLowerCase()}:${code}`, PRODUCT_NAMESPACE)
}

/** A food already kept, shown like a product: for "you have this already". */
export function productFromFood(f: Food): Product | null {
  const code = normaliseBarcode(f.barcode)
  if (!code) return null
  const n = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v))
  return {
    code, name: f.name, brand: f.brand ?? null, quantity: null,
    pack: n(f.pack_size_g), packUnit: f.pack_size_g ? (f.per_ml ? 'ml' : 'g') : null,
    stores: f.stores ?? [],
    per100: { kcal: n(f.kcal), protein_g: n(f.protein_g), carbs_g: n(f.carbs_g), fat_g: n(f.fat_g), fiber_g: n(f.fiber_g) },
    image: safeImage(f.image_url), categories: [],
    ...(readUnits(f.units).length ? { serving: readUnits(f.units)[0] } : {}),
    eu: {
      kj: n(f.kj), sat_fat_g: n(f.sat_fat_g), mufa_g: n(f.mufa_g), pufa_g: n(f.pufa_g), sugars_g: n(f.sugars_g),
      polyols_g: n(f.polyols_g), starch_g: n(f.starch_g), salt_g: n(f.salt_g), alcohol_g: n(f.alcohol_g),
    },
    perMl: !!f.per_ml,
  }
}

/** The food with this barcode that is already there: the person's own first,
 *  then a shared one. Deleted foods are left out (see deletedWith). */
export function foodWithBarcode<T extends Pick<Food, 'barcode' | 'owner_id'> & { deleted_at?: string | null }>(
  foods: T[], code: string, ownerId: string | null,
): T | null {
  const live = foods.filter((f) => !f.deleted_at && normaliseBarcode(f.barcode) === code)
  return live.find((f) => ownerId && f.owner_id === ownerId) ?? live.find((f) => f.owner_id === null) ?? null
}

/** A food of one's own with this barcode that was deleted: adding the product
 *  again brings it back rather than making a second row. */
export function deletedWith<T extends Pick<Food, 'barcode' | 'owner_id'> & { deleted_at?: string | null }>(
  foods: T[], code: string, ownerId: string,
): T | null {
  return foods.find((f) => !!f.deleted_at && f.owner_id === ownerId && normaliseBarcode(f.barcode) === code) ?? null
}

// ---- adding to stock -------------------------------------------------------------

export type AmountUnit = 'packs' | 'g' | 'kg'

/** How much went in the cupboard, in grams: a number of packs, or grams or
 *  kilos as typed (a comma is a decimal point). Null when it is not an amount. */
export function stockGrams(text: string, unit: AmountUnit, pack: number | null): number | null {
  if (unit !== 'packs') {
    const g = toGrams(text, unit)
    return g !== null && g > 0 ? g : null
  }
  if (!pack || pack <= 0) return null
  const n = Number(String(text).replace(/\s+/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  const g = tidy(n * pack)
  return g > MAX_GRAMS ? null : g
}

// ---- prices -----------------------------------------------------------------------

export interface PriceRow {
  shop: string
  city: string | null
  date: string | null
  price: number
  currency: string
  /** "€2.65" */
  label: string
  /** "€6.79/kg", when the pack is known. */
  perUnit: string | null
  offer: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2024-04-26" → "26 Apr 2024". */
export function formatDay(iso: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

/** A price in its own currency: "€2.65", "£1.20", "3.49 PLN" for one the
 *  phone has no symbol for. */
export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** The price per kilo or litre, when the pack's size is known. A price
 *  already per kilo (loose fruit) is shown as it is. */
export function perUnitLabel(price: number, currency: string, pack: number | null, unit: 'g' | 'ml' | null, pricePer: string | null): string | null {
  if (pricePer === 'KILOGRAM') return `${formatPrice(price, currency)}/kg`
  if (pricePer === 'LITER' || pricePer === 'LITRE') return `${formatPrice(price, currency)}/l`
  if (!pack || pack <= 0 || !unit) return null
  return `${formatPrice(price / (pack / 1000), currency)}/${unit === 'ml' ? 'l' : 'kg'}`
}

/** Shared prices, the latest per shop, newest first, at most ten. A price
 *  without an amount or a currency is left out. */
export function readPrices(json: unknown, pack: number | null, unit: 'g' | 'ml' | null): PriceRow[] {
  const items = (json && typeof json === 'object' && Array.isArray((json as Raw).items) ? (json as Raw).items : []) as Raw[]
  const byShop = new Map<string, { row: PriceRow; at: string }>()
  for (const it of items) {
    const price = num(it.price)
    const currency = str(it.currency)?.toUpperCase() ?? null
    if (price === null || price <= 0 || !currency || !/^[A-Z]{3}$/.test(currency)) continue
    const loc = (it.location && typeof it.location === 'object' ? it.location : {}) as Raw
    const shop = str(loc.osm_name) ?? str(loc.osm_brand) ?? (str(loc.website_url) ? hostOf(str(loc.website_url)!) : null) ?? 'A shop'
    const city = str(loc.osm_address_city)
    const key = it.location_id != null ? `id:${it.location_id}` : `${shop}|${city ?? ''}`
    const date = str(it.date)
    // Newest by the day it was paid; a price with no day goes last.
    const at = `${date ?? '0000-00-00'}|${str(it.created) ?? ''}`
    const had = byShop.get(key)
    if (had && had.at >= at) continue
    const pricePer = str(it.price_per)
    byShop.set(key, {
      at,
      row: {
        shop: shop.slice(0, 60), city: city?.slice(0, 60) ?? null, date, price, currency,
        label: formatPrice(price, currency),
        perUnit: perUnitLabel(price, currency, pack, unit, pricePer),
        offer: it.price_is_discounted === true,
      },
    })
  }
  return [...byShop.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 10).map((x) => x.row)
}

function hostOf(url: string): string | null {
  const m = /^https?:\/\/(?:www\.)?([^/]+)/i.exec(url)
  return m ? m[1] : null
}

// ---- staying within the limits -------------------------------------------------------

/** At most `limit` requests in any `windowMs`. Open Food Facts allows 10
 *  searches and 15 product reads a minute from one address; GetIt keeps a
 *  little under that, so a person tapping quickly never gets it blocked. */
export class RateLimiter {
  private stamps: number[] = []
  readonly limit: number
  readonly windowMs: number
  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }
  /** How long until one more request may go: 0 when it may go now. */
  waitFor(now: number): number {
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs)
    if (this.stamps.length < this.limit) return 0
    return this.stamps[0] + this.windowMs - now
  }
  take(now: number) { this.stamps.push(now) }
}

export const LIMITS = {
  search: { limit: 8, windowMs: 60_000 },
  product: { limit: 12, windowMs: 60_000 },
  prices: { limit: 12, windowMs: 60_000 },
} as const
/** Longer than this and the person is told to try again, not left waiting. */
export const MAX_WAIT_MS = 20_000

/** How long an answer is reused: products change rarely, prices a little
 *  more often, and "not found" is asked again sooner, since someone may add it. */
export const TTL = {
  search: 15 * 60_000,
  product: 6 * 3_600_000,
  missing: 30 * 60_000,
  prices: 30 * 60_000,
}

/** Answers kept in memory for a while. The oldest go first when it is full.
 *  Nothing is written to the device: a search is not worth keeping. */
export class TtlCache<V> {
  private map = new Map<string, { value: V; until: number }>()
  readonly max: number
  constructor(max = 200) { this.max = max }
  get(key: string, now: number): { value: V } | undefined {
    const hit = this.map.get(key)
    if (!hit) return undefined
    if (hit.until <= now) { this.map.delete(key); return undefined }
    return { value: hit.value }
  }
  set(key: string, value: V, ttl: number, now: number) {
    this.map.delete(key)
    this.map.set(key, { value, until: now + ttl })
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string)
  }
  get size() { return this.map.size }
}

/** The same search typed with other capitals or spaces is the same search. */
export const searchKey = (query: string, country: string) => `s:${country}:${cleanQuery(query).toLowerCase()}`
