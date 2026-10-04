// Checks sharing a price with Open Prices (v18, PRICE-05): which own prices
// can be shared, signing in (what is sent, what comes back), the shop's
// place from Open Prices' own places and from OpenStreetMap's search, the
// photo's fields, the price as sent, reusing a receipt for the next price
// of the same trip, what a refusal says, and the photo's size. No network:
// every answer here is made up, and nothing is ever sent to Open Prices.
import {
  appQuery, authBody, readUserName, readAuth, canShare, placesUrl, readPlaces, nominatimUrl, readNominatim, streetFrom,
  placeKey, placeLine, placeMemoryKey, readPlace, proofFields, pricePayload, readId, sharedPriceUrl, reusableProof,
  readProblem, authProblem, fitPhoto, SHARE_AGENT, OPEN_PRICES_API, NOMINATIM, PHOTO_MAX_PX, PROOF_REUSE_HOURS,
} from '../lib/open-prices-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// ---- naming the app ----------------------------------------------------------------------
is('the app is named on every write', appQuery('android'), 'app_name=GetIt&app_version=18&app_platform=android')
is('the agent names the app and its package', SHARE_AGENT, 'GetIt/18 (app.getit.planner)')
is('Open Prices is reached over https', OPEN_PRICES_API, 'https://prices.openfoodfacts.org/api/v1')

// ---- signing in --------------------------------------------------------------------------
is('the sign-in body is a form', authBody(' edvinas ', 'p&ss=1'), 'username=edvinas&password=p%26ss%3D1')
is('a user name', readUserName(' edvinas-t '), { user: 'edvinas-t' })
is('an email is caught before anything is sent', readUserName('me@example.com'), { error: 'Use your Open Food Facts user name, not your email.' })
is('empty', readUserName('  '), { error: 'Type your Open Food Facts user name.' })
is('spaces are not a user name', readUserName('my name'), { error: 'That is not an Open Food Facts user name.' })
is('the answer: token and user', readAuth({ user_id: 'edvinas', access_token: 'tok-123', token_type: 'bearer', is_moderator: false }), { token: 'tok-123', user: 'edvinas' })
is('no token, no sign-in', readAuth({ user_id: 'edvinas' }), null)
is('not an answer', readAuth('<html>'), null)
is('a wrong password', authProblem(401), 'That user name and password did not work.')
is('no connection', authProblem(0), 'No connection. Try again when you are online.')

// ---- which prices can be shared ------------------------------------------------------------
const own = { price: 1.99, amount_g: 500, noted_on: '2026-10-01', shop: 'Albert Heijn' }
const today = '2026-10-04'
is('a pack price of a product with a barcode', canShare(own, '8710400000000', 500, today), { ok: true })
is('a price for one of it', canShare({ ...own, amount_g: null }, '8710400000000', null, today), { ok: true })
is('no barcode', canShare(own, null, 500, today).ok, false)
is('a made-up code is not a barcode', canShare(own, 'abc', 500, today).ok, false)
is('a price per kilo of a packed product', canShare({ ...own, amount_g: 1000 }, '8710400000000', 500, today), { ok: false, why: 'Only the price of one pack can be shared.' })
is('a kilo pack is a pack', canShare({ ...own, amount_g: 1000 }, '8710400000000', 1000, today), { ok: true })
is('a day in the future', canShare({ ...own, noted_on: '2026-10-05' }, '8710400000000', 500, today).ok, false)
is('nought', canShare({ ...own, price: 0 }, '8710400000000', 500, today).ok, false)

// ---- the shop's place: Open Prices' own places ------------------------------------------------
const pu = new URL(placesUrl(' Albert Heijn ', 'Reuver'))
is('places: by name and town, most prices first', [pu.origin + pu.pathname, pu.searchParams.get('osm_name__like'), pu.searchParams.get('osm_address_city__like'), pu.searchParams.get('order_by'), pu.searchParams.get('type')],
  ['https://prices.openfoodfacts.org/api/v1/locations', 'Albert Heijn', 'Reuver', '-price_count', 'OSM'])
is('no town: by name only', new URL(placesUrl('Jumbo', '')).searchParams.has('osm_address_city__like'), false)
const opAnswer = { items: [
  { id: 1, type: 'OSM', osm_id: 123, osm_type: 'NODE', osm_name: 'Albert Heijn', osm_display_name: 'Albert Heijn, 12, Kerkstraat, Reuver, Beesel, Limburg, Nederland', osm_address_city: 'Reuver', price_count: 4 },
  { id: 2, type: 'OSM', osm_id: '456', osm_type: 'way', osm_name: null, osm_brand: 'Jumbo', osm_display_name: '', osm_address_city: 'Venlo', osm_address_postcode: '5911 AB' },
  { id: 3, type: 'ONLINE', osm_id: null, osm_type: null, osm_name: 'Picnic' },
  { id: 4, type: 'OSM', osm_id: 123, osm_type: 'NODE', osm_name: 'Albert Heijn' },
  { id: 5, type: 'OSM', osm_id: -1, osm_type: 'NODE', osm_name: 'Bad' },
] }
is('places read: shops on the map only, each once', readPlaces(opAnswer), [
  { osm_id: 123, osm_type: 'NODE', name: 'Albert Heijn', address: 'Kerkstraat 12, Reuver', from: 'open-prices', prices: 4 },
  { osm_id: 456, osm_type: 'WAY', name: 'Jumbo', address: '5911 AB, Venlo', from: 'open-prices' },
])
is('not an answer: no places', readPlaces({ detail: 'oops' }), [])
is('the street from a long name', streetFrom('Jumbo, Markt 5, Venlo, Limburg', 'Venlo'), 'Markt 5')
is('a number then a street', streetFrom('Lidl, 3a, Stationsweg, Tegelen, Venlo', 'Tegelen'), 'Stationsweg 3a')

// ---- the shop's place: OpenStreetMap's search -----------------------------------------------------
const nu = new URL(nominatimUrl('Albert Heijn', 'Reuver', 'NL'))
is('one search: name and town, shops and places only, in the country', [nu.origin + nu.pathname, nu.searchParams.get('q'), nu.searchParams.get('format'), nu.searchParams.get('layer'), nu.searchParams.get('countrycodes'), nu.searchParams.get('limit')],
  [`${NOMINATIM}/search`, 'Albert Heijn, Reuver', 'jsonv2', 'poi', 'nl', '10'])
is('no country: none sent', new URL(nominatimUrl('Spar', 'Reuver', null)).searchParams.has('countrycodes'), false)
const osmAnswer = [
  { osm_type: 'node', osm_id: 789, category: 'shop', type: 'supermarket', name: 'Albert Heijn', display_name: 'Albert Heijn, 1, Markt, Reuver', address: { road: 'Markt', house_number: '1', village: 'Reuver' } },
  { osm_type: 'way', osm_id: 790, category: 'highway', type: 'residential', name: 'Albert Heijnstraat', address: {} },
  { osm_type: 'node', osm_id: 791, category: 'amenity', type: 'marketplace', name: 'Weekmarkt', address: { town: 'Venlo' } },
  { osm_type: 'relation', osm_id: 792, class: 'shop', type: 'mall', display_name: 'Centrum, Venlo', address: { city: 'Venlo' } },
]
is('OpenStreetMap read: shops and markets, not streets', readNominatim(osmAnswer), [
  { osm_id: 789, osm_type: 'NODE', name: 'Albert Heijn', address: 'Markt 1, Reuver', from: 'osm' },
  { osm_id: 791, osm_type: 'NODE', name: 'Weekmarkt', address: 'Venlo', from: 'osm' },
  { osm_id: 792, osm_type: 'RELATION', name: 'Centrum', address: 'Venlo', from: 'osm' },
])
is('an error from OpenStreetMap is no places', readNominatim({ error: 'busy' }), [])
is('a place\'s key', placeKey({ osm_type: 'NODE', osm_id: 789 }), 'NODE/789')
is('a place as one line', placeLine({ name: 'Albert Heijn', address: 'Markt 1, Reuver' }), 'Albert Heijn · Markt 1, Reuver')
is('remembered per shop, whatever the capitals', placeMemoryKey('Albert  Heijn'), placeMemoryKey('albert heijn'))
is('a remembered place read back', readPlace({ osm_id: 789, osm_type: 'NODE', name: 'AH', address: 'Markt 1', from: 'osm' }), { osm_id: 789, osm_type: 'NODE', name: 'AH', address: 'Markt 1', from: 'osm' })
is('a damaged one is none', readPlace({ osm_id: 'x', osm_type: 'NODE', name: 'AH' }), null)

// ---- what is sent -------------------------------------------------------------------------------
const place = { osm_id: 789, osm_type: 'NODE' }
is('the photo\'s fields: type, shop, day, currency, nothing else', proofFields({ type: 'RECEIPT', place, date: '2026-10-01', currency: 'eur' }),
  { type: 'RECEIPT', location_osm_id: '789', location_osm_type: 'NODE', date: '2026-10-01', currency: 'EUR' })
const base = { code: '8710400000000', price: 1.989, currency: 'EUR', date: '2026-10-01', place, proofId: 55 }
is('the price as sent', pricePayload(base), {
  type: 'PRODUCT', product_code: '8710400000000', price: 1.99, currency: 'EUR', date: '2026-10-01',
  location_osm_id: 789, location_osm_type: 'NODE', proof_id: 55, price_is_discounted: false,
})
is('an offer with its normal price', pricePayload({ ...base, price: 1.5, discounted: true, normalPrice: 1.99 })?.price_without_discount, 1.99)
is('an offer: the flag is sent', pricePayload({ ...base, discounted: true })?.price_is_discounted, true)
is('a "normal" price lower than the offer is left out', 'price_without_discount' in pricePayload({ ...base, discounted: true, normalPrice: 1 }), false)
is('the normal price is not sent without the offer', 'price_without_discount' in pricePayload({ ...base, normalPrice: 3 }), false)
is('no barcode, no payload', pricePayload({ ...base, code: '' }), null)
is('no photo, no payload', pricePayload({ ...base, proofId: 0 }), null)
is('no place, no payload', pricePayload({ ...base, place: { osm_id: 0, osm_type: 'NODE' } }), null)
is('nought, no payload', pricePayload({ ...base, price: 0 }), null)
is('a bad day, no payload', pricePayload({ ...base, date: '1 Oct' }), null)
is('the id in an answer', readId({ id: 991, product_code: '8710400000000' }), 991)
is('no id', readId({}), null)
is('the shared price\'s page', sharedPriceUrl(991), 'https://prices.openfoodfacts.org/prices/991')

// ---- reusing a receipt ------------------------------------------------------------------------
const now = Date.parse('2026-10-01T15:00:00Z')
const last = { id: 55, place: 'NODE/789', date: '2026-10-01', type: 'RECEIPT', at: '2026-10-01T14:00:00Z' }
is('same shop, same day, a receipt: reused', reusableProof(last, place, '2026-10-01', now)?.id, 55)
is('another shop: not', reusableProof(last, { osm_id: 1, osm_type: 'NODE' }, '2026-10-01', now), null)
is('another day: not', reusableProof(last, place, '2026-09-30', now), null)
is('a price tag is for one price: not', reusableProof({ ...last, type: 'PRICE_TAG' }, place, '2026-10-01', now), null)
is('too long ago: not', reusableProof(last, place, '2026-10-01', now + PROOF_REUSE_HOURS * 3_600_000), null)
is('no shop picked yet: not', reusableProof(last, null, '2026-10-01', now), null)

// ---- what went wrong ---------------------------------------------------------------------------
is('offline', readProblem(0, null).kind, 'offline')
is('the token ran out', readProblem(401, { detail: 'Invalid token' }).kind, 'signed-out')
is('busy', readProblem(429, null).text, 'Open Prices is busy. Try again in a minute.')
is('down', readProblem(502, '<html>Bad gateway</html>').kind, 'down')
is('a refusal says what Open Prices said', readProblem(400, { detail: 'Proof already used' }).text, 'Open Prices said: Proof already used')
is('a field\'s error', readProblem(400, { product_code: ['Invalid barcode'] }).text, 'Open Prices said: product code: Invalid barcode')
is('a long page is not repeated', readProblem(400, 'x'.repeat(500)).text, 'Open Prices did not take it.')
is('a photo too large', readProblem(413, null).text, 'The photo is too large. Try another one.')

// ---- the photo ---------------------------------------------------------------------------------
is('a phone photo is made smaller', fitPhoto(4032, 3024), { w: PHOTO_MAX_PX, h: 1200 })
is('portrait', fitPhoto(3024, 4032), { w: 1200, h: PHOTO_MAX_PX })
is('a small one is not made larger', fitPhoto(800, 600), { w: 800, h: 600 })
is('not an image', fitPhoto(0, 0), { w: 0, h: 0 })

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall Open Prices sharing checks passed')
