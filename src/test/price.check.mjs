// Checks the shopping list's prices (v17, PRICE-01 to PRICE-04): reading
// Open Prices answers, matching a shared price to the person's chain, the
// middle of the last 90 days, own prices first, what a row and the summary
// say, typing a price, the shop a new price is for, the device's cache and
// the official offers pages in Stores. No network: answers are made up here.
import {
  readOpenPrices, packGrams, chainMatches, median, daysBetween, choosePrice, rowPrice, listTotal, summaryText, detailText,
  basisText, sizeText, dayText, readPriceInput, priceShop, cacheFresh, codesToAsk, openPricesUrl, PRICE_ATTRIBUTION, OPEN_PRICES_AGENT,
  ASK_AT_ONCE, CACHE_DAYS,
} from '../lib/price-rules.ts'
import { offersUrl } from '../lib/shops-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// ---- reading an answer -------------------------------------------------------------------
const loc = (brand, name, cc = 'NL') => ({ osm_brand: brand, osm_name: name, osm_address_country_code: cc })
const item = (p) => ({ type: 'PRODUCT', price: 1.19, currency: 'EUR', date: '2026-09-20', price_per: null, price_is_discounted: false,
  location: loc('Jumbo', 'Jumbo Venlo'), product: { product_quantity: 1000, product_quantity_unit: 'ml' }, ...p })
const answer = { items: [
  item({}),
  item({ price: 2.5, price_per: 'KILOGRAM', location: loc(null, 'Albert Heijn XL') }),
  item({ currency: null }),
  item({ price: 0 }),
  item({ price: 0.99, price_is_discounted: true, price_without_discount: 1.29 }),
  item({ price: 0.99, price_is_discounted: true }),
  item({ type: 'CATEGORY' }),
  item({ location: {} }),
  item({ date: 'soon', currency: 'gbp', location: loc('Tesco', 'Tesco', 'gb') }),
] }
const read = readOpenPrices(answer)
is('usable prices are kept', read.length, 4)
is('a pack price takes the product size', read[0], { price: 1.19, currency: 'EUR', date: '2026-09-20', amount_g: 1000, brand: 'Jumbo', name: 'Jumbo Venlo', country: 'NL' })
is('a price per kilo is for 1000 g', read[1].amount_g, 1000)
is('an offer counts at its normal price', read[2].price, 1.29)
is('a bad date is none, the currency upper case', [read[3].date, read[3].currency, read[3].country], [null, 'GBP', 'GB'])
is('not an answer at all', readOpenPrices(null), [])
is('pack sizes', [packGrams(500, 'g'), packGrams(1.5, 'l'), packGrams(75, 'cl'), packGrams('250', 'ml'), packGrams(2, 'pieces'), packGrams(0, 'g')], [500, 1500, 750, 250, null, null])
is('the address asks for the latest 50', openPricesUrl('8718452222386'), 'https://prices.openfoodfacts.org/api/v1/prices?product_code=8718452222386&order_by=-date&size=50')
is('the credit line', PRICE_ATTRIBUTION, 'Prices: Open Prices (Open Food Facts), ODbL')
is('Visuma names itself', OPEN_PRICES_AGENT, 'Visuma/18 (app.visuma.planner)')

// ---- the person's chain ----------------------------------------------------------------------
is('brand matches', chainMatches('Albert Heijn', { brand: 'Albert Heijn', name: null }), true)
is('name holds the chain', chainMatches('albert heijn', { brand: null, name: 'Albert Heijn XL Venlo' }), true)
is('whole words only', chainMatches('Plus', { brand: null, name: 'Spaarplus Venlo' }), false)
is('a word on its own', chainMatches('Plus', { brand: null, name: 'PLUS Bakker' }), true)
is('another chain', chainMatches('Lidl', { brand: 'Jumbo', name: 'Jumbo' }), false)
is('accents do not matter', chainMatches('Intermarché', { brand: 'Intermarche', name: null }), true)

// ---- middles and days -----------------------------------------------------------------------
is('median of an odd count', median([3, 1, 2]), 2)
is('median of an even count', median([1, 2, 3, 4]), 2.5)
is('median of nothing', median([]), null)
is('days between', [daysBetween('2026-09-30', '2026-10-03'), daysBetween('2026-10-03', '2026-10-01')], [3, -2])

// ---- choosing ----------------------------------------------------------------------------------
const today = '2026-10-03'
const open = [
  { price: 1.19, currency: 'EUR', date: '2026-09-20', amount_g: 1000, brand: 'Jumbo', name: 'Jumbo', country: 'NL' },
  { price: 1.25, currency: 'EUR', date: '2026-08-30', amount_g: 1000, brand: 'Lidl', name: 'Lidl', country: 'NL' },
  { price: 1.15, currency: 'EUR', date: '2026-09-25', amount_g: 1000, brand: 'Plus', name: 'Plus', country: 'NL' },
  { price: 0.95, currency: 'EUR', date: '2026-09-25', amount_g: 1000, brand: 'Carrefour', name: 'Carrefour', country: 'FR' },
  { price: 1.05, currency: 'EUR', date: '2025-01-10', amount_g: 1000, brand: 'Jumbo', name: 'Jumbo', country: 'NL' },
  { price: 2.10, currency: 'EUR', date: '2026-09-28', amount_g: 2000, brand: 'Jumbo', name: 'Jumbo', country: 'NL' },
]
const own = [
  { shop: 'Albert Heijn', price: 1.39, amount_g: 1000, noted_on: '2026-09-01' },
  { shop: 'Lidl', price: 1.29, amount_g: 1000, noted_on: '2026-09-10', deleted_at: '2026-09-11' },
  { shop: 'Plus', price: 1.21, amount_g: 1000, noted_on: '2026-08-01' },
]
const base = { own: [], open, shop: null, country: 'NL', currency: 'EUR', today }
is('with no shop: the middle of the country, same pack size, last 90 days',
  choosePrice(base), { source: 'open', price: 1.19, amount_g: 1000, shop: null, date: '2026-09-25', count: 3, how: 'median' })
is('at the person\'s chain: its latest shared price',
  choosePrice({ ...base, shop: 'Jumbo' }), { source: 'open', price: 2.1, amount_g: 2000, shop: 'Jumbo', date: '2026-09-28', count: 2, how: 'shop' })
is('a chain with no reports falls back to the middle', choosePrice({ ...base, shop: 'Dirk' }).how, 'median')
is('own price at the shop wins', choosePrice({ ...base, own, shop: 'Albert Heijn' }),
  { source: 'own', price: 1.39, amount_g: 1000, shop: 'Albert Heijn', date: '2026-09-01', count: 1, how: 'shop' })
is('with no shop the latest own price anywhere wins', choosePrice({ ...base, own }).shop, 'Albert Heijn')
is('a removed own price does not count', choosePrice({ ...base, own, shop: 'Lidl' }), { source: 'open', price: 1.25, amount_g: 1000, shop: 'Lidl', date: '2026-08-30', count: 1, how: 'shop' })
is('another currency never counts', choosePrice({ ...base, currency: 'GBP' }), null)
is('another country never counts', choosePrice({ ...base, country: 'BE' }), null)
is('nothing known: nothing shown', choosePrice({ ...base, open: [] }), null)
is('old reports only: nothing', choosePrice({ ...base, open: [open[4]] }), null)

// ---- what a row and the summary say -------------------------------------------------------------
const pack = { price: 1.19, amount_g: 1000, source: 'open' }
is('a shared price, two packs', rowPrice({ grams: 2000, pieces: 2 }, pack, 'EUR'), { text: '≈ €2.38', cost: 2.38 })
is('an own price each, three of it', rowPrice({ grams: null, pieces: 3 }, { price: 4.29, amount_g: null, source: 'own' }, 'EUR'), { text: '€12.87', cost: 12.87 })
is('per kilo with no weight known', rowPrice({ grams: null, pieces: null }, { price: 2.49, amount_g: 1000, source: 'own' }, 'EUR'), { text: '€2.49/kg', cost: null })
is('per litre for a drink', rowPrice({ grams: null, pieces: null }, { price: 1.5, amount_g: 1000, source: 'open' }, 'EUR', true).text, '≈ €1.50/l')
is('no price: nothing on the row', rowPrice({ grams: 1, pieces: 1 }, null, 'EUR'), null)
const costs = { a: 2.38, b: 10.02, c: null, d: null }
const t = listTotal(['a', 'b', 'c', 'd'].map((key) => ({ key, grams: null, pieces: null })), (k) => costs[k])
is('the total', t, { count: 4, total: 12.4, priced: 2, unpriced: 2 })
is('summary with some unpriced', summaryText(t, 'EUR'), '4 to get · €12.40 + 2 unpriced')
is('summary with all priced', summaryText({ count: 2, total: 3.5, priced: 2, unpriced: 0 }, 'EUR'), '2 to get · €3.50')
is('summary with none priced', summaryText({ count: 5, total: 0, priced: 0, unpriced: 5 }, 'EUR'), '5 to get')

// ---- the detail line ------------------------------------------------------------------------------
is('day text', [dayText('2026-08-12'), dayText(null)], ['12 Aug 2026', ''])
is('sizes', [sizeText(500), sizeText(1000), sizeText(1000, true), sizeText(330, true)], ['500 g', '1 kg', '1 l', '330 ml'])
is('basis', [basisText(null), basisText(1000), basisText(1000, true), basisText(500), basisText(750, true)], ['each', 'a kg', 'a litre', 'for 500 g', 'for 750 ml'])
is('own detail', detailText({ source: 'own', price: 1.39, amount_g: null, shop: 'Albert Heijn', date: '2026-09-01', count: 1, how: 'shop' }, 'EUR'),
  '€1.39 each at Albert Heijn, noted 1 Sep 2026')
is('shared at the chain', detailText({ source: 'open', price: 2.1, amount_g: 2000, shop: 'Jumbo', date: '2026-09-28', count: 2, how: 'shop' }, 'EUR'),
  '≈ €2.10 for 2 kg at Jumbo · 2 reports, latest 28 Sep 2026')
is('shared middle', detailText({ source: 'open', price: 1.19, amount_g: 1000, shop: null, date: '2026-09-25', count: 3, how: 'median' }, 'EUR', true),
  '≈ €1.19 a litre · middle of 3 reports in the last 90 days, latest 25 Sep 2026')

// ---- typing a price -----------------------------------------------------------------------------
is('per pack with a known size', readPriceInput('1,89', 'pack', 500), { price: 1.89, amount_g: 500 })
is('per pack, size unknown: each', readPriceInput('€ 4.29', 'pack', null), { price: 4.29, amount_g: null })
is('per kilo', readPriceInput('2.49', 'kg', 500), { price: 2.49, amount_g: 1000 })
is('not a price', [readPriceInput('abc', 'pack', null), readPriceInput('0', 'kg', null)], [null, null])
is('shop: the filter first', priceShop('lidl', 'Albert Heijn', ['Albert Heijn', 'Lidl']), 'Lidl')
is('shop: else the last used', priceShop(null, 'Albert Heijn', ['Lidl', 'Albert Heijn']), 'Albert Heijn')
is('shop: a gone one is skipped', priceShop('Dirk', 'Spar', ['Lidl']), 'Lidl')
is('shop: none kept', priceShop(null, null, []), null)

// ---- the cache -------------------------------------------------------------------------------------
const now = Date.parse('2026-10-03T12:00:00Z')
const fresh = { code: '8718452222386', fetched_at: '2026-09-30T12:00:00Z', prices: [] }
const stale = { code: '8076802085738', fetched_at: '2026-09-20T12:00:00Z', prices: [] }
is('a copy from three days ago is fresh', cacheFresh(fresh, now), true)
is(`older than ${CACHE_DAYS} days is not`, cacheFresh(stale, now), false)
is('none is not', cacheFresh(undefined, now), false)
is('ask for the missing and the stale, each once, barcodes only',
  codesToAsk(['8718452222386', '8076802085738', '8076802085738', null, 'abc', '12345678'], [fresh, stale], now), ['8076802085738', '12345678'])
is(`never more than ${ASK_AT_ONCE} at once`, codesToAsk(Array.from({ length: 20 }, (_, i) => String(10000000 + i)), [], now).length, ASK_AT_ONCE)

// ---- weekly offers: the chains' own pages ----------------------------------------------------------
is('Albert Heijn in the Netherlands', offersUrl('Albert Heijn', 'NL'), 'https://www.ah.nl/bonus')
is('Lidl in Germany is the German site', offersUrl('lidl', 'DE'), 'https://www.lidl.de/c/online-prospekte/s10005610')
is('a chain from next door still finds its page', offersUrl('Jumbo', 'DE'), 'https://www.jumbo.com/aanbiedingen')
is('a shop Visuma does not know has none', offersUrl('Bakker Bart', 'NL'), null)
is('only official https pages', offersUrl('Plus', 'NL').startsWith('https://www.plus.nl/'), true)

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall price checks passed')
